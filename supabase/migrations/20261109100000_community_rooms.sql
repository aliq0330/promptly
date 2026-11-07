-- Topluluk sohbet odaları (docs/history/352-*) — YALNIZ EKLEYİCİ (expand): hiçbir sütun/fonksiyon silinmez ya da yeniden adlandırılmaz.
--
-- Karar: bir topluluk artık birden çok odaya sahiptir; ama mesajlar AYNI sohbette (`conversations.id = chat_groups.id`) kalır.
--   * `messages.room_id` NULL  ⇔ "varsayılan oda" (Genel). Eski mesajlar ve eski istemciler olduğu gibi çalışır (taşıma/geri doldurma YOK).
--   * Yeni odaların mesajları `room_id` doludur; sabitleme/yıldız/tepki/arama/yazıyor hepsi `conversation_id` ile çalışmaya devam eder.
--   * Üyelik topluluktan türer (oda başına üyelik satırı YOK); kişisel durum `community_room_state`'tedir (yalnız kendi satırım).
--   * Okunmamış sayısı okuma anında hesaplanır (`group_unread_counts` genişler, `community_rooms_overview` oda başına verir).
-- Ayrıca: sohbet sabitleme (`conversation_members.pinned_at`, kişisel).

-- ============================================================================
-- 1. Tablolar
-- ============================================================================

create table if not exists public.community_rooms (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  description text check (description is null or char_length(description) <= 120),
  icon text not null default 'message'
    check (icon in ('message', 'prompt', 'image', 'megaphone', 'sparkles', 'help', 'shield', 'palette')),
  section text check (section is null or char_length(btrim(section)) between 1 and 24),
  position integer not null default 0,
  posting_policy text not null default 'members' check (posting_policy in ('members', 'admins')),
  read_policy text not null default 'all' check (read_policy in ('all', 'staff')),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint community_rooms_default_rules check (not is_default or (read_policy = 'all' and archived_at is null))
);
create unique index if not exists community_rooms_one_default_idx on public.community_rooms (community_id) where is_default;
create unique index if not exists community_rooms_name_idx on public.community_rooms (community_id, lower(btrim(name))) where archived_at is null;
create index if not exists community_rooms_community_idx on public.community_rooms (community_id, position);
alter table public.community_rooms enable row level security;

create table if not exists public.community_room_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.community_rooms (id) on delete cascade,
  last_read_at timestamptz,
  muted_at timestamptz,
  primary key (user_id, room_id)
);
alter table public.community_room_state enable row level security;

alter table public.messages add column if not exists room_id uuid references public.community_rooms (id) on delete cascade;
create index if not exists messages_room_idx on public.messages (room_id, created_at) where room_id is not null;

alter table public.conversation_members add column if not exists pinned_at timestamptz;

-- ============================================================================
-- 2. Yetenek: manage_rooms (üçlü: _group_all_capabilities + _group_default_permissions + lib/chat-groups.ts)
-- ============================================================================

create or replace function public._group_all_capabilities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['edit_settings', 'change_visibility', 'manage_invites', 'manage_requests', 'remove_members', 'ban_members',
               'manage_roles', 'delete_messages', 'pin_messages',
               'moderate_posts', 'pin_posts', 'manage_announcements', 'manage_events', 'edit_rules', 'view_stats',
               'create_spaces', 'approve_library', 'manage_rooms'];
$$;

create or replace function public._group_default_permissions()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'admin', jsonb_build_object('edit_settings', true, 'change_visibility', true, 'manage_invites', true, 'manage_requests', true,
                                'remove_members', true, 'ban_members', true, 'manage_roles', true, 'delete_messages', true, 'pin_messages', true,
                                'moderate_posts', true, 'pin_posts', true, 'manage_announcements', true, 'manage_events', true,
                                'edit_rules', true, 'view_stats', true, 'create_spaces', true, 'approve_library', true, 'manage_rooms', true),
    'moderator', jsonb_build_object('edit_settings', false, 'change_visibility', false, 'manage_invites', false, 'manage_requests', true,
                                    'remove_members', true, 'ban_members', false, 'manage_roles', false, 'delete_messages', true, 'pin_messages', true,
                                    'moderate_posts', true, 'pin_posts', true, 'manage_announcements', false, 'manage_events', false,
                                    'edit_rules', false, 'view_stats', false, 'create_spaces', false, 'approve_library', false, 'manage_rooms', false)
  );
$$;

-- ============================================================================
-- 3. Okuma/yazma kuralları (TEK yer)
-- ============================================================================

-- Çağıran odayı okuyabilir mi: topluluk üyesi + (herkese açık oda ya da kadro).
create or replace function public.can_read_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.community_rooms r
      join public.conversation_members m on m.conversation_id = r.community_id and m.user_id = auth.uid()
     where r.id = p_room_id
       and (r.read_policy = 'all' or m.role in ('owner', 'admin', 'moderator'))
  );
$$;

-- Çağıran bu topluluğun bu odasına yazabilir mi (yeni oda mesajları): üye, topluluk açık, oda arşivsiz, yazma ve görme politikasına uygun.
create or replace function public.can_post_room(p_conversation_id uuid, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.community_rooms r
      join public.chat_groups g on g.id = r.community_id
      join public.conversation_members m on m.conversation_id = r.community_id and m.user_id = auth.uid()
     where r.id = p_room_id
       and r.community_id = p_conversation_id
       and r.archived_at is null
       and g.closed_at is null
       and (r.read_policy = 'all' or m.role in ('owner', 'admin', 'moderator'))
       and (r.posting_policy = 'members' or m.role in ('owner', 'admin', 'moderator'))
  );
$$;

revoke execute on function public.can_read_room(uuid) from public, anon;
revoke execute on function public.can_post_room(uuid, uuid) from public, anon;
grant execute on function public.can_read_room(uuid) to authenticated;
grant execute on function public.can_post_room(uuid, uuid) to authenticated;

alter policy "Members can read messages in their conversations" on public.messages
  using (public.can_read_message(conversation_id, sender_id, created_at) and (room_id is null or public.can_read_room(room_id)));

alter policy "Members can send messages in their conversations" on public.messages
  with check (
    auth.uid() = sender_id and announcement_id is null and story_id is null and not is_story_reply
    and ((room_id is null and public.can_send_message(conversation_id)) or (room_id is not null and public.can_post_room(conversation_id, room_id)))
  );

-- Varsayılan odaya yazılan mesaj NULL saklanır; oda başka topluluğa ait olamaz; oda sonradan değişmez.
create or replace function public.messages_room_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.room_id is not null then
      if not exists (select 1 from public.community_rooms r where r.id = new.room_id and r.community_id = new.conversation_id) then
        raise exception 'room_not_found';
      end if;
      if exists (select 1 from public.community_rooms r where r.id = new.room_id and r.is_default) then
        new.room_id := null;
      end if;
    end if;
  elsif new.room_id is distinct from old.room_id then
    new.room_id := old.room_id;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_room_guard_ins on public.messages;
create trigger messages_room_guard_ins before insert on public.messages for each row execute function public.messages_room_guard();
drop trigger if exists messages_room_guard_upd on public.messages;
create trigger messages_room_guard_upd before update of room_id on public.messages for each row execute function public.messages_room_guard();

-- RLS: oda satırını yalnız okuyabilen üye görür; yazma yalnız RPC.
drop policy if exists "Members read the rooms they may see" on public.community_rooms;
create policy "Members read the rooms they may see" on public.community_rooms for select to authenticated
  using (public.can_read_room(id));

drop policy if exists "Users read their own room state" on public.community_room_state;
create policy "Users read their own room state" on public.community_room_state for select to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- 4. Varsayılan oda: her topluluk bir "Genel" odasıyla doğar (+ mevcut topluluklara geri doldurma)
-- ============================================================================

create or replace function public.chat_groups_default_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_rooms (community_id, name, icon, section, position, is_default, created_by)
  values (new.id, 'Genel', 'message', null, 0, true, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists chat_groups_default_room_ins on public.chat_groups;
create trigger chat_groups_default_room_ins after insert on public.chat_groups for each row execute function public.chat_groups_default_room();

insert into public.community_rooms (community_id, name, icon, section, position, is_default, created_by)
select g.id, 'Genel', 'message', null, 0, true, g.created_by
  from public.chat_groups g
 where not exists (select 1 from public.community_rooms r where r.community_id = g.id and r.is_default);

-- ============================================================================
-- 5. Okuma RPC'leri
-- ============================================================================

-- Bir topluluğun odaları + kişisel durumum + okunmamış sayısı (en çok 100) + son mesaj zamanı. Üye olmayana boş döner.
create or replace function public.community_rooms_overview(p_community_id uuid)
returns table (
  id uuid, name text, description text, icon text, section text, "position" integer,
  posting_policy text, read_policy text, is_default boolean, archived_at timestamptz,
  muted boolean, unread_count integer, last_message_at timestamptz, can_post boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select m.role, m.joined_at, m.last_read_at, m.cleared_at
      from public.conversation_members m
     where m.conversation_id = p_community_id and m.user_id = auth.uid()
  )
  select r.id, r.name, r.description, r.icon, r.section, r.position, r.posting_policy, r.read_policy, r.is_default, r.archived_at,
         (s.muted_at is not null) as muted,
         case when r.archived_at is not null then 0 else
           (select count(*)::integer from (
              select 1 from public.messages x
               where x.conversation_id = r.community_id
                 and (case when r.is_default then x.room_id is null else x.room_id = r.id end)
                 and x.created_at > coalesce(case when r.is_default then me.last_read_at else s.last_read_at end, '-infinity'::timestamptz)
                 and x.created_at > coalesce(me.cleared_at, '-infinity'::timestamptz)
                 and x.created_at >= me.joined_at
                 and x.sender_id is distinct from auth.uid()
                 and x.deleted_at is null
               limit 100) c)
         end as unread_count,
         (select max(x.created_at) from public.messages x
           where x.conversation_id = r.community_id
             and (case when r.is_default then x.room_id is null else x.room_id = r.id end)
             and x.deleted_at is null) as last_message_at,
         (r.archived_at is null and g.closed_at is null
            and (r.posting_policy = 'members' or me.role in ('owner', 'admin', 'moderator'))
            and (not r.is_default or g.posting_policy = 'members' or me.role in ('owner', 'admin', 'moderator'))) as can_post
    from public.community_rooms r
    join public.chat_groups g on g.id = r.community_id
    cross join me
    left join public.community_room_state s on s.room_id = r.id and s.user_id = auth.uid()
   where r.community_id = p_community_id
     and (r.read_policy = 'all' or me.role in ('owner', 'admin', 'moderator'))
   order by r.position, r.created_at;
$$;

-- Konuşma başına SON görünür mesajın odası (liste önizlemesindeki "# oda" etiketi). INVOKER: messages RLS'i uygulanır
-- (özel odanın mesajı kadro olmayana son mesaj olarak sızmaz).
create or replace function public.community_last_rooms(p_conversation_ids uuid[])
returns table (conversation_id uuid, room_id uuid, room_name text)
language sql
stable
set search_path = public
as $$
  select cid as conversation_id, coalesce(m.room_id, d.id) as room_id, coalesce(r.name, d.name) as room_name
    from unnest(p_conversation_ids[1:500]) as cid
    join public.conversation_members cm on cm.conversation_id = cid and cm.user_id = auth.uid()
    cross join lateral (
      select mm.room_id from public.messages mm
       where mm.conversation_id = cid
         and (cm.cleared_at is null or mm.created_at > cm.cleared_at)
       order by mm.created_at desc
       limit 1
    ) m
    left join public.community_rooms d on d.community_id = cid and d.is_default
    left join public.community_rooms r on r.id = m.room_id;
$$;

-- Topluluk sohbetinin okunmamış toplamı: Genel (üyelik imleci) + okuyabildiğim, sessize ALMADIĞIM, arşivsiz diğer odalar (en çok 100).
create or replace function public.group_unread_counts(p_ids uuid[])
returns table (conversation_id uuid, unread_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select m.conversation_id,
         (select count(*)::integer
            from (select 1
                    from public.messages x
                    left join public.community_rooms r on r.id = x.room_id
                    left join public.community_room_state s on s.room_id = x.room_id and s.user_id = m.user_id
                   where x.conversation_id = m.conversation_id
                     and x.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
                     and x.created_at >= m.joined_at
                     and x.sender_id is distinct from m.user_id
                     and x.deleted_at is null
                     and (
                       (x.room_id is null and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz))
                       or (x.room_id is not null
                           and r.archived_at is null
                           and (r.read_policy = 'all' or m.role in ('owner', 'admin', 'moderator'))
                           and s.muted_at is null
                           and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz))
                     )
                   limit 100) c) as unread_count
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
   where m.user_id = auth.uid()
     and c.kind = 'group'
     and m.conversation_id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

-- ============================================================================
-- 6. Yazma RPC'leri (hepsi SECURITY DEFINER; kimlik auth.uid(); yetki YETENEKle)
-- ============================================================================

create or replace function public.create_community_room(
  p_community_id uuid, p_name text, p_description text default null, p_icon text default 'message',
  p_section text default null, p_posting_policy text default 'members', p_read_policy text default 'all'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_name text := btrim(coalesce(p_name, ''));
  v_section text := nullif(btrim(coalesce(p_section, '')), '');
  v_id uuid;
begin
  g := public._group_lock(p_community_id);
  perform public._group_require_cap(p_community_id, v_actor, 'manage_rooms');
  if g.closed_at is not null then raise exception 'forbidden'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'invalid_room_name'; end if;
  if char_length(coalesce(p_description, '')) > 120 then raise exception 'invalid_room_description'; end if;
  if v_section is not null and char_length(v_section) > 24 then raise exception 'invalid_room_section'; end if;
  if p_posting_policy not in ('members', 'admins') or p_read_policy not in ('all', 'staff') then raise exception 'invalid_room_policy'; end if;
  if p_icon not in ('message', 'prompt', 'image', 'megaphone', 'sparkles', 'help', 'shield', 'palette') then raise exception 'invalid_room_icon'; end if;
  if (select count(*) from public.community_rooms where community_id = p_community_id and archived_at is null) >= 20 then
    raise exception 'room_limit_reached';
  end if;
  if exists (select 1 from public.community_rooms where community_id = p_community_id and archived_at is null and lower(btrim(name)) = lower(v_name)) then
    raise exception 'room_name_taken';
  end if;
  insert into public.community_rooms (community_id, name, description, icon, section, position, posting_policy, read_policy, created_by)
  values (p_community_id, v_name, nullif(btrim(coalesce(p_description, '')), ''), p_icon, v_section,
          coalesce((select max(position) + 1 from public.community_rooms where community_id = p_community_id), 0),
          p_posting_policy, p_read_policy, v_actor)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_community_room(p_room_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  r public.community_rooms;
  g public.chat_groups;
  v_name text;
  v_section text;
begin
  select * into r from public.community_rooms where id = p_room_id;
  if not found then raise exception 'room_not_found'; end if;
  g := public._group_lock(r.community_id);
  perform public._group_require_cap(r.community_id, v_actor, 'manage_rooms');
  if g.closed_at is not null then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'invalid_patch'; end if;

  v_name := case when p_patch ? 'name' then btrim(coalesce(p_patch ->> 'name', '')) else r.name end;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'invalid_room_name'; end if;
  if p_patch ? 'description' and char_length(coalesce(p_patch ->> 'description', '')) > 120 then raise exception 'invalid_room_description'; end if;
  v_section := case when p_patch ? 'section' then nullif(btrim(coalesce(p_patch ->> 'section', '')), '') else r.section end;
  if v_section is not null and char_length(v_section) > 24 then raise exception 'invalid_room_section'; end if;
  if p_patch ? 'icon' and (p_patch ->> 'icon') not in ('message', 'prompt', 'image', 'megaphone', 'sparkles', 'help', 'shield', 'palette') then
    raise exception 'invalid_room_icon';
  end if;
  if p_patch ? 'posting_policy' and (p_patch ->> 'posting_policy') not in ('members', 'admins') then raise exception 'invalid_room_policy'; end if;
  if p_patch ? 'read_policy' and (p_patch ->> 'read_policy') not in ('all', 'staff') then raise exception 'invalid_room_policy'; end if;
  if r.is_default and p_patch ? 'read_policy' and (p_patch ->> 'read_policy') <> 'all' then raise exception 'invalid_room_policy'; end if;
  if exists (select 1 from public.community_rooms x where x.community_id = r.community_id and x.id <> r.id and x.archived_at is null
                and lower(btrim(x.name)) = lower(v_name)) then
    raise exception 'room_name_taken';
  end if;

  update public.community_rooms
     set name = v_name,
         description = case when p_patch ? 'description' then nullif(btrim(coalesce(p_patch ->> 'description', '')), '') else description end,
         icon = coalesce(p_patch ->> 'icon', icon),
         section = v_section,
         posting_policy = case when r.is_default then posting_policy else coalesce(p_patch ->> 'posting_policy', posting_policy) end,
         read_policy = coalesce(p_patch ->> 'read_policy', read_policy)
   where id = p_room_id;

  -- Genel odasının "kim yazar" ayarı mevcut sohbet ayarıdır (chat_groups.posting_policy): tek doğruluk kaynağı o kalır.
  if r.is_default and p_patch ? 'posting_policy' then
    update public.chat_groups set posting_policy = p_patch ->> 'posting_policy' where id = r.community_id;
  end if;
end;
$$;

create or replace function public.reorder_community_rooms(p_community_id uuid, p_room_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
begin
  perform public._group_lock(p_community_id);
  perform public._group_require_cap(p_community_id, v_actor, 'manage_rooms');
  if array_length(p_room_ids, 1) is null or array_length(p_room_ids, 1) > 60 then raise exception 'invalid_patch'; end if;
  update public.community_rooms r
     set position = o.ord::integer - 1
    from unnest(p_room_ids) with ordinality as o(rid, ord)
   where r.id = o.rid and r.community_id = p_community_id;
end;
$$;

create or replace function public.archive_community_room(p_room_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  r public.community_rooms;
begin
  select * into r from public.community_rooms where id = p_room_id;
  if not found then raise exception 'room_not_found'; end if;
  perform public._group_lock(r.community_id);
  perform public._group_require_cap(r.community_id, v_actor, 'manage_rooms');
  if r.is_default then raise exception 'room_default_locked'; end if;
  if not p_archived then
    if (select count(*) from public.community_rooms where community_id = r.community_id and archived_at is null) >= 20 then
      raise exception 'room_limit_reached';
    end if;
    if exists (select 1 from public.community_rooms x where x.community_id = r.community_id and x.id <> r.id and x.archived_at is null
                  and lower(btrim(x.name)) = lower(btrim(r.name))) then
      raise exception 'room_name_taken';
    end if;
  end if;
  update public.community_rooms set archived_at = case when p_archived then now() else null end where id = p_room_id;
end;
$$;

-- Odayı SİL: yalnız topluluk sahibi; odadaki mesajlar da silinir (arşiv geri alınabilir, silme alınamaz). Genel silinemez.
create or replace function public.delete_community_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  r public.community_rooms;
begin
  select * into r from public.community_rooms where id = p_room_id;
  if not found then raise exception 'room_not_found'; end if;
  perform public._group_lock(r.community_id);
  if coalesce(public._group_member_role(r.community_id, v_actor), '') <> 'owner' then raise exception 'forbidden'; end if;
  if r.is_default then raise exception 'room_default_locked'; end if;
  delete from public.community_rooms where id = p_room_id;
end;
$$;

-- Okundu imleci (yalnız ileri). Genel için mevcut `mark_conversation_read_up_to` kullanılır; bu yalnız diğer odalar içindir.
create or replace function public.mark_room_read_up_to(p_room_id uuid, p_up_to timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.can_read_room(p_room_id) then return; end if;
  insert into public.community_room_state (user_id, room_id, last_read_at)
  values (v_uid, p_room_id, least(p_up_to, now()))
  on conflict (user_id, room_id) do update
    set last_read_at = greatest(coalesce(public.community_room_state.last_read_at, '-infinity'::timestamptz), excluded.last_read_at)
    where public.community_room_state.last_read_at is null or public.community_room_state.last_read_at < excluded.last_read_at;
end;
$$;

create or replace function public.set_room_muted(p_room_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.can_read_room(p_room_id) then raise exception 'room_not_found'; end if;
  insert into public.community_room_state (user_id, room_id, muted_at)
  values (v_uid, p_room_id, case when p_muted then now() else null end)
  on conflict (user_id, room_id) do update set muted_at = case when p_muted then now() else null end;
end;
$$;

-- ============================================================================
-- 7. Yetkiler
-- ============================================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'community_rooms_overview(uuid)', 'community_last_rooms(uuid[])', 'group_unread_counts(uuid[])',
    'create_community_room(uuid, text, text, text, text, text, text)', 'update_community_room(uuid, jsonb)',
    'reorder_community_rooms(uuid, uuid[])', 'archive_community_room(uuid, boolean)', 'delete_community_room(uuid)',
    'mark_room_read_up_to(uuid, timestamptz)', 'set_room_muted(uuid, boolean)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.messages_room_guard() from public, anon, authenticated';
  execute 'revoke execute on function public.chat_groups_default_room() from public, anon, authenticated';
end;
$$;

revoke insert, update, delete on public.community_rooms from anon, authenticated;
revoke insert, update, delete on public.community_room_state from anon, authenticated;
revoke all on public.community_rooms from anon;
revoke all on public.community_room_state from anon;
