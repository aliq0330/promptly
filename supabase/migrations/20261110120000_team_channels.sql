-- ci:allow-destructive
-- Ekipler, WP4 (docs/history/353-*): ekip kanalları ve sohbet. "Yıkıcı" işaretinin nedeni: `conversations_kind_check` GENİŞLETİLİR (drop constraint + aynı adla
-- yeniden ekleme); hiçbir veri silinmez. Gerisi ekleyicidir.
--
-- Karar: her kanal KENDİ konuşmasıdır (`conversations.kind = 'team_channel'`, kimlik = kanal kimliği). Gizlilik sınırı = konuşma üyeliği; mesaj okuyan her yol
-- (arama, yıldız, medya, sabit, okundu bilgisi, "yazıyor", depolama, son mesaj) bu kapıdan geçtiği için özel kanal / konuk sızıntısı yapısal olarak kapalıdır.
-- Kanal üyeliği `team_access` + ekip üyeliğinden hesaplanan YANSIMADIR (Space ile aynı motor); istemci üyelik satırı yazamaz (`group_membership_via_rpc`).

-- ============================================================================
-- 1. Konuşma türü ve "grup gibi yönetilen" kavramı
-- ============================================================================
alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'group', 'team_channel'));

-- Üyelik RPC/tetikleyiciyle yönetilen, okunmamışı okuma anında hesaplanan, mesaj başına bildirimi olmayan konuşmalar (grup + ekip kanalı).
create or replace function public.is_group_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversations where id = p_conversation_id and kind in ('group', 'team_channel'));
$$;

-- Bir olay bütün üyelere yazmaz (258): ekip kanalında da üye başına okunmamış sütunu artırılmaz.
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  if exists (select 1 from public.conversations c where c.id = new.conversation_id and coalesce(c.kind, 'direct') not in ('group', 'team_channel')) then
    update public.conversation_members set unread_count = unread_count + 1
     where conversation_id = new.conversation_id and user_id <> new.sender_id;
  end if;
  return new;
end $$;

alter table public.conversation_members add column if not exists notify_level text check (notify_level is null or notify_level in ('all', 'mentions', 'none'));

-- ============================================================================
-- 2. Kanal tablosu
-- ============================================================================
create table if not exists public.team_channels (
  id uuid primary key references public.conversations (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  description text not null default '' check (char_length(description) <= 200),
  mode text not null default 'open' check (mode in ('open', 'private', 'space')),
  space_id uuid references public.spaces (id) on delete set null,
  posting_policy text not null default 'members' check (posting_policy in ('members', 'admins')),
  notify_default text not null default 'mentions' check (notify_default in ('all', 'mentions', 'none')),
  is_default boolean not null default false,
  position integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint team_channels_space_shape check ((mode = 'space') = (space_id is not null))
);
create unique index if not exists team_channels_name_uniq on public.team_channels (team_id, lower(name));
create index if not exists team_channels_team_idx on public.team_channels (team_id, position, created_at);
alter table public.team_channels enable row level security;

do $$ begin
  alter table public.team_access add constraint team_access_channel_fk foreign key (channel_id) references public.team_channels (id) on delete cascade;
exception when duplicate_object then null; end $$;

drop policy if exists "Members read their channels" on public.team_channels;
create policy "Members read their channels" on public.team_channels for select to authenticated using (public.is_conversation_member(id));
revoke all on public.team_channels from anon;
revoke insert, update, delete on public.team_channels from authenticated;
grant select on public.team_channels to authenticated;

create or replace function public._team_recount(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('promptly.team_deleting', true), '') = '1' then return; end if;
  update public.teams t set
    member_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role <> 'guest'),
    guest_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role = 'guest'),
    space_count = (select count(*) from public.spaces s where s.team_id = t.id and s.archived_at is null),
    channel_count = (select count(*) from public.team_channels c where c.team_id = t.id and c.archived_at is null)
  where t.id = p_team;
end $$;

-- ============================================================================
-- 3. Erişim motoru: kanal düzeyi ve üyelik yansıması
-- ============================================================================
create or replace function public._team_channel_level(p_channel uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_role text;
  v_edit boolean;
  v_any boolean;
begin
  select team_id, mode, space_id into c from public.team_channels where id = p_channel;
  if c.team_id is null then return null; end if;
  v_role := public._team_role(c.team_id, p_user);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'edit'; end if;
  if c.mode = 'open' then
    return case when v_role = 'guest' then null else 'edit' end;
  elsif c.mode = 'space' then
    return case when public._team_space_level(c.space_id, p_user) is null then null else 'edit' end;
  end if;
  select coalesce(bool_or(a.level = 'edit'), false), count(*) > 0 into v_edit, v_any
    from public.team_access a
   where a.channel_id = p_channel
     and ((a.subject_type = 'member' and a.subject_id = p_user)
          or (a.subject_type = 'group' and exists (select 1 from public.team_group_members gm where gm.group_id = a.subject_id and gm.user_id = p_user)));
  if not v_any then return null; end if;
  return case when v_edit then 'edit' else 'view' end;
end $$;

create or replace function public._team_sync_channel_user(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public._team_channel_level(p_channel, p_user) is null then
    delete from public.conversation_members where conversation_id = p_channel and user_id = p_user;
  else
    insert into public.conversation_members (conversation_id, user_id, role, status) values (p_channel, p_user, 'member', 'accepted') on conflict do nothing;
  end if;
end $$;

create or replace function public._team_sync_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; u record;
begin
  select team_id into v_team from public.team_channels where id = p_channel;
  if v_team is null then return; end if;
  for u in (select m.user_id from public.team_members m where m.team_id = v_team union select x.user_id from public.conversation_members x where x.conversation_id = p_channel) loop
    perform public._team_sync_channel_user(p_channel, u.user_id);
  end loop;
end $$;

create or replace function public._team_sync_user_channels(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select c.id from public.team_channels c where c.team_id = p_team loop
    perform public._team_sync_channel_user(r.id, p_user);
  end loop;
end $$;

-- Space yansıması hesaplanırken, o Space'e bağlı kanalların üyeliği de aynı kişi için eşitlenir.
create or replace function public._team_sync_space_user(p_space uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_level text;
  v_owner uuid;
  v_cur text;
  v_want text;
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
  r record;
begin
  select owner_id into v_owner from public.spaces where id = p_space;
  if v_owner is null then return; end if;
  if v_owner <> p_user then
    v_level := public._team_space_level(p_space, p_user);
    select role into v_cur from public.space_members where space_id = p_space and user_id = p_user;
    perform set_config('promptly.team_sync', '1', true);
    if v_level is null then
      if v_cur is not null then delete from public.space_members where space_id = p_space and user_id = p_user and role <> 'owner'; end if;
    else
      v_want := case v_level when 'edit' then 'editor' else 'viewer' end;
      if v_cur is null then
        insert into public.space_members (space_id, user_id, role, added_by) values (p_space, p_user, v_want, v_owner) on conflict do nothing;
      elsif v_cur <> v_want and v_cur <> 'owner' then
        update public.space_members set role = v_want where space_id = p_space and user_id = p_user;
      end if;
    end if;
    perform set_config('promptly.team_sync', v_prev, true);
  end if;
  for r in select c.id from public.team_channels c where c.space_id = p_space loop
    perform public._team_sync_channel_user(r.id, p_user);
  end loop;
end $$;

create or replace function public.team_members_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.team_group_members gm using public.team_groups g where g.id = gm.group_id and g.team_id = old.team_id and gm.user_id = old.user_id;
    delete from public.team_access where team_id = old.team_id and subject_type = 'member' and subject_id = old.user_id;
    perform public._team_sync_user_spaces(old.team_id, old.user_id);
    perform public._team_sync_user_channels(old.team_id, old.user_id);
    perform public._team_recount(old.team_id);
  else
    perform public._team_sync_user_spaces(new.team_id, new.user_id);
    perform public._team_sync_user_channels(new.team_id, new.user_id);
    perform public._team_recount(new.team_id);
  end if;
  return null;
end $$;

create or replace function public.team_group_members_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_user uuid;
begin
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  select g.team_id into v_team from public.team_groups g where g.id = case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  if v_team is not null then
    perform public._team_sync_user_spaces(v_team, v_user);
    perform public._team_sync_user_channels(v_team, v_user);
  end if;
  return null;
end $$;

create or replace function public.team_access_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space uuid := coalesce(new.space_id, old.space_id); v_channel uuid := coalesce(new.channel_id, old.channel_id);
begin
  if v_space is not null then perform public._team_sync_space(v_space); end if;
  if v_channel is not null then perform public._team_sync_channel(v_channel); end if;
  return null;
end $$;

-- Ekip silinince kanal konuşmaları da gider (konuşma silinince kanal ve üyelik kaskadlanır).
create or replace function public.teams_channels_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversations c using public.team_channels tc where tc.team_id = old.id and c.id = tc.id;
  return old;
end $$;
drop trigger if exists teams_channels_cleanup on public.teams;
create trigger teams_channels_cleanup before delete on public.teams for each row execute function public.teams_channels_cleanup();

-- Kanal değişince yansıma + sayaç.
create or replace function public.team_channels_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and (new.mode is distinct from old.mode or new.space_id is distinct from old.space_id)) then
    perform public._team_sync_channel(new.id);
  end if;
  perform public._team_recount(coalesce(new.team_id, old.team_id));
  return null;
end $$;
drop trigger if exists team_channels_after_change on public.team_channels;
create trigger team_channels_after_change after insert or update of mode, space_id, archived_at or delete on public.team_channels for each row execute function public.team_channels_after_change();

-- ============================================================================
-- 4. Mesaj okuma/yazma kuralı: ekip kanalı kolu
-- ============================================================================
create or replace function public.can_read_message(p_conversation_id uuid, p_sender_id uuid, p_created_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when c.kind = 'group' then
      exists (
        select 1 from public.conversation_members m
          join public.chat_groups g on g.id = m.conversation_id
         where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
           and (g.history_visible or p_created_at >= m.joined_at)
      )
      and (p_sender_id = auth.uid() or not public.is_blocked(auth.uid(), p_sender_id))
    when c.kind = 'team_channel' then
      -- Üyelik + ekipte hâlâ etkin rol (süresi dolan konuk anında düşer). Geçmiş kanal üyesine görünür.
      exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation_id and m.user_id = auth.uid())
      and exists (select 1 from public.team_channels tc where tc.id = p_conversation_id and public._team_role(tc.team_id, auth.uid()) is not null)
      and (p_sender_id = auth.uid() or not public.is_blocked(auth.uid(), p_sender_id))
    else
      exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation_id and m.user_id = auth.uid())
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

create or replace function public.can_send_message(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when c.kind = 'group' then
      exists (
        select 1 from public.conversation_members m
          join public.chat_groups g on g.id = m.conversation_id
         where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
           and g.closed_at is null
           and (g.posting_policy = 'members' or m.role in ('owner', 'admin', 'moderator'))
      )
    when c.kind = 'team_channel' then
      exists (
        select 1 from public.conversation_members m
          join public.team_channels tc on tc.id = m.conversation_id
         where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
           and tc.archived_at is null
           and public._team_role(tc.team_id, auth.uid()) is not null
           and public._team_channel_level(tc.id, auth.uid()) = 'edit'
           and (tc.posting_policy = 'members' or public._team_role(tc.team_id, auth.uid()) in ('owner', 'admin'))
      )
    else
      exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation_id and m.user_id = auth.uid())
      and not exists (
        select 1 from public.conversation_members other_member
         where other_member.conversation_id = p_conversation_id and other_member.user_id <> auth.uid()
           and public.is_blocked(auth.uid(), other_member.user_id)
      )
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

-- ============================================================================
-- 5. Okunmamış, sabitleme, okundu bilgisi (kind'a duyarlı)
-- ============================================================================
create or replace function public.group_unread_counts(p_ids uuid[])
returns table (conversation_id uuid, unread_count integer)
language sql stable security definer set search_path = public as $$
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
   where m.user_id = auth.uid() and c.kind = 'group' and m.conversation_id = any (coalesce(p_ids, '{}'::uuid[]))
  union all
  select m.conversation_id,
         case when m.muted_at is not null then 0 else
           (select count(*)::integer
              from (select 1 from public.messages x
                     where x.conversation_id = m.conversation_id
                       and x.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
                       and x.created_at >= m.joined_at
                       and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz)
                       and x.sender_id is distinct from m.user_id
                       and x.deleted_at is null
                     limit 100) c) end
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
   where m.user_id = auth.uid() and c.kind = 'team_channel' and m.conversation_id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

create or replace function public.set_message_pinned(p_message_id uuid, p_pinned boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  m public.messages;
  v_kind text;
  g public.chat_groups;
  v_role text;
  v_other uuid;
  v_team uuid;
begin
  select * into m from public.messages where id = p_message_id;
  if not found or m.deleted_at is not null then raise exception 'message_not_found'; end if;
  if not public.can_read_message(m.conversation_id, m.sender_id, m.created_at) then raise exception 'message_not_found'; end if;
  select kind into v_kind from public.conversations where id = m.conversation_id;

  if v_kind = 'group' then
    g := public._group_lock(m.conversation_id);
    v_role := public._group_member_role(m.conversation_id, v_uid);
    if not (public._group_can(m.conversation_id, v_uid, 'pin_messages') or (v_role = 'member' and g.members_can_pin)) then raise exception 'forbidden'; end if;
  elsif v_kind = 'team_channel' then
    select tc.team_id into v_team from public.team_channels tc where tc.id = m.conversation_id;
    if not public._team_can(v_team, v_uid, 'manage_channels') then raise exception 'forbidden'; end if;
    perform pg_advisory_xact_lock(hashtextextended('pin:' || m.conversation_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('pin:' || m.conversation_id::text, 0));
    select user_id into v_other from public.conversation_members where conversation_id = m.conversation_id and user_id <> v_uid limit 1;
    if v_other is null or public.is_blocked(v_uid, v_other) then raise exception 'forbidden'; end if;
  end if;

  if p_pinned then
    if exists (select 1 from public.pinned_messages where message_id = p_message_id) then return jsonb_build_object('pinned', true); end if;
    if (select count(*) from public.pinned_messages where conversation_id = m.conversation_id) >= 20 then raise exception 'pin_limit_reached'; end if;
    insert into public.pinned_messages (message_id, conversation_id, pinned_by) values (p_message_id, m.conversation_id, v_uid);
  else
    delete from public.pinned_messages where message_id = p_message_id;
  end if;

  if v_kind = 'group' then
    perform public._group_audit(m.conversation_id, g.name, v_uid, m.sender_id,
      case when p_pinned then 'message_pinned' else 'message_unpinned' end, jsonb_build_object('message_id', p_message_id));
  end if;
  return jsonb_build_object('pinned', p_pinned);
end $$;

-- Okundu bilgisi: ekip kanalında geçmiş herkese görünür (kanal üyeleri, mesajdan önce katılmış olsalar da listelenir ve imleçleriyle karşılaştırılır).
create or replace function public.message_read_receipts(p_message_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, has_read boolean, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_kind text;
  v_history boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into m from public.messages where id = p_message_id;
  if not found or m.deleted_at is not null then raise exception 'message_not_found'; end if;
  if m.sender_id <> v_uid or not exists (select 1 from public.conversation_members x where x.conversation_id = m.conversation_id and x.user_id = v_uid) then
    raise exception 'forbidden';
  end if;
  select c.kind into v_kind from public.conversations c where c.id = m.conversation_id;
  if v_kind = 'group' then
    select coalesce(g.history_visible, false) into v_history from public.chat_groups g where g.id = m.conversation_id;
  elsif v_kind = 'team_channel' then
    v_history := true;
  end if;
  return query
  select cm.user_id, p.username, p.display_name, p.avatar_url,
         (cm.last_read_at is not null and cm.last_read_at >= m.created_at),
         case when cm.last_read_at is not null and cm.last_read_at >= m.created_at then cm.last_read_updated_at end
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
   where cm.conversation_id = m.conversation_id and cm.user_id <> v_uid
     and (v_kind = 'direct' or v_history or m.created_at >= cm.joined_at)
   order by (cm.last_read_at is not null and cm.last_read_at >= m.created_at) desc, cm.last_read_updated_at desc nulls last, p.display_name
   limit 1000;
end $$;

-- ============================================================================
-- 6. Varsayılan kanallar
-- ============================================================================
create or replace function public._team_make_channel(
  p_team uuid, p_name text, p_description text, p_mode text, p_space uuid, p_posting text, p_notify text, p_default boolean, p_position integer, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.conversations (kind) values ('team_channel') returning id into v_id;
  insert into public.team_channels (id, team_id, name, description, mode, space_id, posting_policy, notify_default, is_default, position, created_by)
  values (v_id, p_team, p_name, coalesce(p_description, ''), p_mode, p_space, p_posting, p_notify, p_default, p_position, p_by);
  return v_id;
end $$;

create or replace function public.teams_default_channels()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._team_make_channel(new.id, 'genel', 'Ekibin genel sohbeti.', 'open', null, 'members', 'mentions', true, 0, new.created_by);
  perform public._team_make_channel(new.id, 'duyurular', 'Yöneticilerin duyuruları.', 'open', null, 'admins', 'all', false, 1, new.created_by);
  return null;
end $$;
drop trigger if exists teams_default_channels on public.teams;
create trigger teams_default_channels after insert on public.teams for each row execute function public.teams_default_channels();

-- Mevcut ekipler (varsa) için geri doldurma.
do $$
declare t record;
begin
  for t in select id, created_by from public.teams x where not exists (select 1 from public.team_channels c where c.team_id = x.id) loop
    perform public._team_make_channel(t.id, 'genel', 'Ekibin genel sohbeti.', 'open', null, 'members', 'mentions', true, 0, t.created_by);
    perform public._team_make_channel(t.id, 'duyurular', 'Yöneticilerin duyuruları.', 'open', null, 'admins', 'all', false, 1, t.created_by);
  end loop;
end $$;

-- ============================================================================
-- 7. Kanal RPC'leri
-- ============================================================================
create or replace function public._team_channel_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select left(regexp_replace(regexp_replace(lower(translate(btrim(coalesce(p_name, '')), 'çğıöşüÇĞİÖŞÜâîûÂÎÛ', 'cgiosucgiosuaiuaiu')), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), 40)
$$;

create or replace function public._team_channel_entries(p_channel uuid, p_team uuid, p_entries jsonb, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e jsonb; v_type text; v_id uuid; v_level text;
begin
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 100 then raise exception 'channel_invalid'; end if;
  delete from public.team_access where channel_id = p_channel;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_type := e ->> 'type'; v_level := coalesce(e ->> 'level', 'edit');
    begin v_id := (e ->> 'id')::uuid; exception when others then raise exception 'channel_invalid'; end;
    if v_type not in ('member', 'group') or v_level not in ('edit', 'view') then raise exception 'channel_invalid'; end if;
    if v_type = 'member' and not exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = v_id) then raise exception 'channel_invalid'; end if;
    if v_type = 'group' and not exists (select 1 from public.team_groups g where g.id = v_id and g.team_id = p_team) then raise exception 'channel_invalid'; end if;
    insert into public.team_access (team_id, channel_id, subject_type, subject_id, level, created_by) values (p_team, p_channel, v_type, v_id, v_level, p_by) on conflict do nothing;
  end loop;
end $$;

create or replace function public.team_create_channel(
  p_team uuid, p_name text, p_description text default '', p_mode text default 'open', p_space uuid default null,
  p_posting text default 'members', p_notify text default 'mentions', p_entries jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_channels');
  v_name text := public._team_channel_name(p_name);
  v_id uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_channel_create', 30, interval '1 hour');
  if v_name !~ '^[a-z0-9][a-z0-9-]{0,39}$' or char_length(coalesce(p_description, '')) > 200
     or coalesce(p_mode, '') not in ('open', 'private', 'space') or coalesce(p_posting, '') not in ('members', 'admins')
     or coalesce(p_notify, '') not in ('all', 'mentions', 'none') then
    raise exception 'channel_invalid';
  end if;
  if (p_mode = 'space') <> (p_space is not null) then raise exception 'channel_invalid'; end if;
  if p_mode = 'space' and not exists (select 1 from public.spaces s where s.id = p_space and s.team_id = p_team) then raise exception 'channel_invalid'; end if;
  if p_mode <> 'private' and jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 0 then raise exception 'channel_invalid'; end if;
  if exists (select 1 from public.team_channels c where c.team_id = p_team and lower(c.name) = v_name) then raise exception 'channel_name_taken'; end if;
  if (select count(*) from public.team_channels c where c.team_id = p_team and c.archived_at is null) >= 50 then raise exception 'team_channel_limit'; end if;

  perform set_config('promptly.team_sync', '1', true);
  v_id := public._team_make_channel(p_team, v_name, btrim(coalesce(p_description, '')), p_mode, p_space, p_posting, p_notify, false,
                                    coalesce((select max(position) + 1 from public.team_channels where team_id = p_team), 0), v_uid);
  if p_mode = 'private' then
    perform public._team_channel_entries(v_id, p_team, p_entries, v_uid);
  end if;
  perform public._team_sync_channel(v_id);
  perform set_config('promptly.team_sync', '', true);
  perform public._team_audit(p_team, 'channel', 'channel_created', v_name, jsonb_build_object('mode', p_mode));
  return v_id;
end $$;

create or replace function public.team_update_channel(p_channel uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.team_channels;
  v_uid uuid;
  v_name text;
  v_key text;
  v_mode text;
  v_space uuid;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  v_uid := public._team_require(c.team_id, 'manage_channels');
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'channel_invalid'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'description', 'posting_policy', 'notify_default', 'mode', 'space_id', 'position') then raise exception 'channel_invalid'; end if;
  end loop;
  v_name := case when p_patch ? 'name' then public._team_channel_name(p_patch ->> 'name') else c.name end;
  v_mode := coalesce(p_patch ->> 'mode', c.mode);
  v_space := case when p_patch ? 'space_id' then nullif(p_patch ->> 'space_id', '')::uuid when v_mode = 'space' then c.space_id else null end;
  if c.is_default and (v_mode <> 'open' or (p_patch ? 'name' and v_name <> c.name)) then raise exception 'channel_default_locked'; end if;
  if v_name !~ '^[a-z0-9][a-z0-9-]{0,39}$' or v_mode not in ('open', 'private', 'space') or (v_mode = 'space') <> (v_space is not null) then raise exception 'channel_invalid'; end if;
  if v_mode = 'space' and not exists (select 1 from public.spaces s where s.id = v_space and s.team_id = c.team_id) then raise exception 'channel_invalid'; end if;
  if exists (select 1 from public.team_channels x where x.team_id = c.team_id and lower(x.name) = v_name and x.id <> c.id) then raise exception 'channel_name_taken'; end if;
  begin
    perform set_config('promptly.team_sync', '1', true);
    update public.team_channels set
      name = v_name,
      description = case when p_patch ? 'description' then btrim(coalesce(p_patch ->> 'description', '')) else description end,
      posting_policy = coalesce(p_patch ->> 'posting_policy', posting_policy),
      notify_default = coalesce(p_patch ->> 'notify_default', notify_default),
      mode = v_mode, space_id = v_space,
      position = case when p_patch ? 'position' then (p_patch ->> 'position')::integer else position end
    where id = p_channel;
    perform set_config('promptly.team_sync', '', true);
  exception when check_violation or invalid_text_representation then
    perform set_config('promptly.team_sync', '', true);
    raise exception 'channel_invalid';
  end;
  if v_mode <> 'private' then delete from public.team_access where channel_id = p_channel; end if;
  perform public._team_audit(c.team_id, 'channel', 'channel_updated', v_name);
end $$;

create or replace function public.team_set_channel_access(p_channel uuid, p_entries jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels; v_uid uuid;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  v_uid := public._team_require(c.team_id, 'manage_channels');
  if c.mode <> 'private' then raise exception 'channel_invalid'; end if;
  perform set_config('promptly.team_sync', '1', true);
  perform public._team_channel_entries(p_channel, c.team_id, p_entries, v_uid);
  perform public._team_sync_channel(p_channel);
  perform set_config('promptly.team_sync', '', true);
  perform public._team_audit(c.team_id, 'channel', 'channel_access_changed', c.name);
end $$;

create or replace function public.team_archive_channel(p_channel uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  perform public._team_require(c.team_id, 'manage_channels');
  if c.is_default then raise exception 'channel_default_locked'; end if;
  update public.team_channels set archived_at = case when p_archived then now() else null end where id = p_channel;
  perform public._team_audit(c.team_id, 'channel', case when p_archived then 'channel_archived' else 'channel_restored' end, c.name);
end $$;

create or replace function public.team_delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  perform public._team_require(c.team_id, 'manage_channels');
  if c.is_default then raise exception 'channel_default_locked'; end if;
  perform public._team_audit(c.team_id, 'channel', 'channel_deleted', c.name);
  delete from public.conversations where id = p_channel;
end $$;

-- Çağıranın görebildiği kanallar (üyelik satırı olanlar) — okunmamış, sessiz, bildirim düzeyi ile.
create or replace function public.team_list_channels(p_team uuid)
returns table (id uuid, name text, description text, mode text, space_id uuid, space_title text, posting_policy text, notify_default text, is_default boolean,
               "position" integer, archived_at timestamptz, unread_count integer, muted boolean, notify_level text, last_message_at timestamptz, member_count integer, can_post boolean)
language sql stable security definer set search_path = public as $$
  select tc.id, tc.name, tc.description, tc.mode, tc.space_id, s.title, tc.posting_policy, tc.notify_default, tc.is_default, tc.position, tc.archived_at,
         coalesce((select u.unread_count from public.group_unread_counts(array[tc.id]) u), 0),
         m.muted_at is not null, coalesce(m.notify_level, tc.notify_default), c.last_message_at,
         (select count(*)::integer from public.conversation_members x where x.conversation_id = tc.id),
         public.can_send_message(tc.id)
    from public.team_channels tc
    join public.conversation_members m on m.conversation_id = tc.id and m.user_id = auth.uid()
    join public.conversations c on c.id = tc.id
    left join public.spaces s on s.id = tc.space_id and public.can_read_space(s.id)
   where tc.team_id = p_team and public._team_role(tc.team_id, auth.uid()) is not null
   order by tc.archived_at is not null, tc.is_default desc, tc.position, tc.name
$$;

create or replace function public.team_channel_access(p_channel uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.team_channels;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  perform public._team_require(c.team_id, 'manage_channels');
  return jsonb_build_object('mode', c.mode, 'space_id', c.space_id,
    'member_count', (select count(*) from public.conversation_members x where x.conversation_id = p_channel),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('type', a.subject_type, 'id', a.subject_id, 'level', a.level,
                                                              'name', coalesce(g.name, p.display_name, p.username), 'username', p.username)
                                          order by a.subject_type desc, coalesce(g.name, p.display_name, p.username))
                           from public.team_access a
                           left join public.team_groups g on a.subject_type = 'group' and g.id = a.subject_id
                           left join public.profiles p on a.subject_type = 'member' and p.id = a.subject_id
                          where a.channel_id = p_channel), '[]'::jsonb));
end $$;

-- Kanal üyeleri (kanalın üyesi olan, konuk olmayan çağıran ya da yönetici görür).
create or replace function public.team_channel_members(p_channel uuid, p_limit integer default 100, p_offset integer default 0)
returns table (user_id uuid, username text, display_name text, avatar_url text, team_role text)
language plpgsql stable security definer set search_path = public as $$
declare c public.team_channels; v_role text;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found or not public.is_conversation_member(p_channel) then raise exception 'channel_not_found'; end if;
  v_role := public._team_role(c.team_id, auth.uid());
  if v_role is null or v_role = 'guest' then raise exception 'channel_not_found'; end if;
  return query
  select m.user_id, p.username, p.display_name, p.avatar_url, tm.role
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    join public.team_members tm on tm.team_id = c.team_id and tm.user_id = m.user_id
   where m.conversation_id = p_channel
   order by (tm.role = 'owner') desc, (tm.role = 'admin') desc, p.display_name
   limit greatest(1, least(coalesce(p_limit, 100), 200)) offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.team_set_channel_notify(p_channel uuid, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_level is not null and p_level not in ('all', 'mentions', 'none') then raise exception 'channel_invalid'; end if;
  if not exists (select 1 from public.team_channels tc where tc.id = p_channel) then raise exception 'channel_not_found'; end if;
  update public.conversation_members set notify_level = p_level, muted_at = case when p_level = 'none' then coalesce(muted_at, now()) else null end
   where conversation_id = p_channel and user_id = auth.uid();
  if not found then raise exception 'channel_not_found'; end if;
end $$;

-- Yönetici mesaj silme: içerik herkes için temizlenir, satır kalır, denetim kaydı düşer. Sahibin mesajını yalnız sahip siler.
create or replace function public.team_moderate_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  m public.messages;
  tc public.team_channels;
  v_sender_role text;
begin
  select * into m from public.messages where id = p_message;
  if not found then raise exception 'message_not_found'; end if;
  select * into tc from public.team_channels where id = m.conversation_id;
  if not found then raise exception 'message_not_found'; end if;
  if not public.can_read_message(m.conversation_id, m.sender_id, m.created_at) then raise exception 'message_not_found'; end if;
  perform public._team_require(tc.team_id, 'manage_channels');
  if m.deleted_at is not null then return; end if;
  v_sender_role := public._team_role(tc.team_id, m.sender_id);
  if m.sender_id <> v_uid and v_sender_role = 'owner' and public._team_role(tc.team_id, v_uid) <> 'owner' then raise exception 'forbidden'; end if;
  update public.messages set deleted_at = now(), body = null, shared_prompt_id = null, shared_request_id = null, attachments = '[]'::jsonb where id = p_message;
  perform public._team_audit(tc.team_id, 'channel', 'message_deleted', tc.name, jsonb_build_object('sender', m.sender_id));
end $$;

-- ============================================================================
-- 8. @bahsetme: ekip kanalı mesajında anılan KANAL ÜYELERİNE bildirim (en çok 20; bahsedilen kişi mesajı zaten okuyabilir)
-- ============================================================================
create or replace function public.team_channel_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tc public.team_channels;
  r record;
  v_name text;
begin
  if new.body is null or position('@' in new.body) = 0 then return null; end if;
  select * into tc from public.team_channels where id = new.conversation_id;
  if not found then return null; end if;
  select coalesce(nullif(p.display_name, ''), p.username) into v_name from public.profiles p where p.id = new.sender_id;
  for r in
    select distinct m.user_id, coalesce(m.notify_level, tc.notify_default) as lvl
      from (select lower(x[1]) as uname from regexp_matches(new.body, '(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,30})', 'g') as x limit 20) mt
      join public.profiles p on lower(p.username) = mt.uname
      join public.conversation_members m on m.conversation_id = new.conversation_id and m.user_id = p.id
     where p.id <> new.sender_id
     limit 20
  loop
    continue when r.lvl = 'none';
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    values (r.user_id, new.sender_id, 'system',
            coalesce(v_name, 'Biri') || ' seni #' || tc.name || ' kanalında andı: "' || public.truncate_preview(new.body, 80) || '"',
            '/teams/local?id=' || tc.team_id || '&tab=chat&channel=' || tc.id || '&hl=message:' || new.id,
            'tmention:' || new.id || ':' || r.user_id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;
  return null;
end $$;
drop trigger if exists team_channel_mentions on public.messages;
create trigger team_channel_mentions after insert on public.messages for each row execute function public.team_channel_mentions();

-- ============================================================================
-- 9. Ekipler listesi: okunmamış toplamı
-- ============================================================================
create or replace function public.my_teams(p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, slug text, name text, description text, tone text, my_role text, member_count integer, guest_count integer, space_count integer,
               channel_count integer, unread_count integer, last_activity_at timestamptz, library_space_id uuid, guest_until timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.slug, t.name, t.description, t.tone, m.role, t.member_count, t.guest_count, t.space_count, t.channel_count,
         coalesce((select sum(u.unread_count)::integer
                     from public.team_channels tc
                     join public.conversation_members cm on cm.conversation_id = tc.id and cm.user_id = auth.uid()
                     cross join lateral public.group_unread_counts(array[tc.id]) u
                    where tc.team_id = t.id and tc.archived_at is null), 0),
         greatest(t.updated_at,
                  coalesce((select max(s.updated_at) from public.spaces s join public.space_members sm on sm.space_id = s.id and sm.user_id = auth.uid()
                             where s.team_id = t.id and s.archived_at is null), t.updated_at),
                  coalesce((select max(c.last_message_at) from public.team_channels tc join public.conversations c on c.id = tc.id
                              join public.conversation_members cm on cm.conversation_id = tc.id and cm.user_id = auth.uid() where tc.team_id = t.id), t.updated_at)),
         t.library_space_id, m.guest_until
    from public.team_members m
    join public.teams t on t.id = m.team_id
   where m.user_id = auth.uid() and (m.role <> 'guest' or m.guest_until > now())
   order by 12 desc, t.name
   limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- ============================================================================
-- 10. Yetkiler
-- ============================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._team_channel_level(uuid, uuid)', 'public._team_sync_channel_user(uuid, uuid)', 'public._team_sync_channel(uuid)',
    'public._team_sync_user_channels(uuid, uuid)', 'public.teams_channels_cleanup()', 'public.team_channels_after_change()',
    'public._team_make_channel(uuid, text, text, text, uuid, text, text, boolean, integer, uuid)', 'public.teams_default_channels()',
    'public._team_channel_name(text)', 'public._team_channel_entries(uuid, uuid, jsonb, uuid)', 'public.team_channel_mentions()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.team_create_channel(uuid, text, text, text, uuid, text, text, jsonb)', 'public.team_update_channel(uuid, jsonb)',
    'public.team_set_channel_access(uuid, jsonb)', 'public.team_archive_channel(uuid, boolean)', 'public.team_delete_channel(uuid)',
    'public.team_list_channels(uuid)', 'public.team_channel_access(uuid)', 'public.team_channel_members(uuid, integer, integer)',
    'public.team_set_channel_notify(uuid, text)', 'public.team_moderate_message(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
