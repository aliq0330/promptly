-- Ekip alanı, Aşama 1 (docs/history/349-*): "tamamen kapalı" topluluk = ekip; ekibe bağlı Space'ler.
--
-- Tasarım: ekip üyeliği KAYNAKTIR (conversation_members); Space'in space_members satırları onun yansımasıdır ve tetikleyicilerle eşitlenir.
-- Böylece `can_read_space` / `can_edit_space` (84 çağrı yeri) DEĞİŞMEZ; yalnız `space_role` ekipte `create_spaces` yetkisi olanı "sahip" sayar.
-- Ekibe bağlı Space'in `owner_id`'si her zaman topluluk SAHİBİdir (Space'i kuran sıradan düzenleyicidir; kuran ayrılsa kütüphane kaybolmaz).
-- İstemci üyeliği/daveti/rolü/görünürlüğü ekibe bağlı Space'te değiştiremez (`space_team_managed`).
-- Ekleyicidir: yeni sütun/fonksiyon/tetikleyici; mevcut fonksiyonlar `create or replace` ile genişler, hiçbir veri silinmez.

-- ----------------------------------------------------------------------------
-- 1. Bağ
-- ----------------------------------------------------------------------------
alter table public.spaces add column if not exists community_id uuid references public.chat_groups (id) on delete set null;
create index if not exists spaces_community_idx on public.spaces (community_id) where community_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Yeni yetenekler (üçlü: _group_all_capabilities + _group_default_permissions + lib/chat-groups.ts)
-- ----------------------------------------------------------------------------
create or replace function public._group_all_capabilities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['edit_settings', 'change_visibility', 'manage_invites', 'manage_requests', 'remove_members', 'ban_members',
               'manage_roles', 'delete_messages', 'pin_messages',
               'moderate_posts', 'pin_posts', 'manage_announcements', 'manage_events', 'edit_rules', 'view_stats',
               'create_spaces', 'approve_library'];
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
                                'edit_rules', true, 'view_stats', true, 'create_spaces', true, 'approve_library', true),
    'moderator', jsonb_build_object('edit_settings', false, 'change_visibility', false, 'manage_invites', false, 'manage_requests', true,
                                    'remove_members', true, 'ban_members', false, 'manage_roles', false, 'delete_messages', true, 'pin_messages', true,
                                    'moderate_posts', true, 'pin_posts', true, 'manage_announcements', false, 'manage_events', false,
                                    'edit_rules', false, 'view_stats', false, 'create_spaces', false, 'approve_library', false)
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Eşitleme bayrağı + space_role
-- ----------------------------------------------------------------------------
create or replace function public._team_sync_on()
returns boolean
language sql
stable
set search_path = public
as $$ select coalesce(current_setting('promptly.team_sync', true), '') = '1' $$;

-- Ekibe bağlı Space'te `create_spaces` yetkisi olan, doğrudan satırı "düzenleyici" olsa bile SAHİP sayılır (adlandırma, arşiv, silme, ayar).
-- Bağlı olmayan Space'te davranış AYNEN eskisi gibidir.
create or replace function public.space_role(p_space uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when m.role = 'owner' then 'owner'
    when s.community_id is not null and public._group_can(s.community_id, auth.uid(), 'create_spaces') then 'owner'
    else m.role
  end
  from public.space_members m
  join public.spaces s on s.id = m.space_id
  where m.space_id = p_space and m.user_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 4. Koruma: ekibe bağlı Space'te üyelik/davet yalnız eşitlemeyle değişir
-- ----------------------------------------------------------------------------
create or replace function public.space_members_team_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
begin
  -- Eşitleme, Space kurulurken sahip satırı (iç içe tetikleyici) ve Space silinirken kaskad (derinlik > 1) serbesttir.
  if public._team_sync_on() or pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.spaces s where s.id = v_space and s.community_id is not null) then
    raise exception 'space_team_managed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists space_members_team_guard on public.space_members;
create trigger space_members_team_guard before insert or update or delete on public.space_members
  for each row execute function public.space_members_team_guard();

create or replace function public.space_invitations_team_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.spaces s where s.id = new.space_id and s.community_id is not null) then
    raise exception 'space_team_managed';
  end if;
  return new;
end;
$$;
drop trigger if exists space_invitations_team_guard on public.space_invitations;
create trigger space_invitations_team_guard before insert on public.space_invitations
  for each row execute function public.space_invitations_team_guard();

-- Toplu eşitlemede "katıldı / ayrıldı" etkinliği yazılmaz (200 üye = 200 satır olurdu).
create or replace function public.space_members_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if public._team_sync_on() then return null; end if;
  select p.username into v_name from public.profiles p where p.id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' and new.role <> 'owner' then
    perform public._space_log(new.space_id, 'member_joined', v_name);
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform public._space_log(new.space_id, 'role_changed', v_name);
  elsif tg_op = 'DELETE' and old.role <> 'owner' then
    perform public._space_log(old.space_id, 'member_removed', v_name);
  end if;
  return null;
end;
$$;

-- `spaces` güncelleme koruması: bağ ve sahip yalnız eşitlemeyle değişir; ekibe bağlı Space her zaman özel kalır.
create or replace function public.spaces_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'space_invalid';
  end if;
  if (new.owner_id <> old.owner_id or new.community_id is distinct from old.community_id) and not public._team_sync_on() then
    raise exception 'space_invalid';
  end if;
  if new.community_id is not null and new.visibility <> 'private' then
    raise exception 'space_team_managed';
  end if;
  new.title := btrim(new.title);
  if new.cover_url is distinct from old.cover_url and new.cover_url is not null
     and not public._space_valid_upload_url(new.id, new.cover_url) then
    raise exception 'space_invalid';
  end if;
  if new.cover_item_id is distinct from old.cover_item_id and new.cover_item_id is not null
     and not exists (select 1 from public.space_items i where i.id = new.cover_item_id and i.space_id = new.id and i.kind = 'image') then
    raise exception 'space_invalid';
  end if;
  if (new.title, new.description, new.kind, new.visibility, new.cover_url, new.cover_item_id, new.archived_at)
     is distinct from (old.title, old.description, old.kind, old.visibility, old.cover_url, old.cover_item_id, old.archived_at) then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Eşitleme fonksiyonları (yalnız tetikleyici / RPC içinden; istemciye kapalı)
-- ----------------------------------------------------------------------------
create or replace function public._team_spaces_add_member(p_community uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
begin
  perform set_config('promptly.team_sync', '1', true);
  insert into public.space_members (space_id, user_id, role, added_by)
  select s.id, p_user, 'editor', s.owner_id
    from public.spaces s
   where s.community_id = p_community
     and not exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = p_user)
  on conflict do nothing;
  perform set_config('promptly.team_sync', v_prev, true);
end;
$$;

create or replace function public._team_spaces_remove_member(p_community uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
begin
  perform set_config('promptly.team_sync', '1', true);
  delete from public.space_members m
   using public.spaces s
   where s.community_id = p_community and m.space_id = s.id and m.user_id = p_user and m.role <> 'owner';
  perform set_config('promptly.team_sync', v_prev, true);
end;
$$;

-- Topluluk silinince Space'ler SİLİNMEZ: sahibinin kişisel Space'i olur, ekip üyelerinin erişimi kalkar.
create or replace function public._team_spaces_detach(p_community uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
begin
  perform set_config('promptly.team_sync', '1', true);
  delete from public.space_members m
   using public.spaces s
   where s.community_id = p_community and m.space_id = s.id and m.role <> 'owner';
  update public.spaces set community_id = null where community_id = p_community;
  perform set_config('promptly.team_sync', v_prev, true);
end;
$$;

-- Topluluk sahipliği devredilince ekip Space'lerinin sahibi de yeni sahip olur.
create or replace function public._team_spaces_owner_changed(p_community uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
  r record;
begin
  perform set_config('promptly.team_sync', '1', true);
  for r in select s.id, s.owner_id from public.spaces s where s.community_id = p_community and s.owner_id <> p_new_owner loop
    update public.space_members set role = 'editor' where space_id = r.id and user_id = r.owner_id and role = 'owner';
    update public.spaces set owner_id = p_new_owner where id = r.id;
    insert into public.space_members (space_id, user_id, role, added_by) values (r.id, p_new_owner, 'owner', p_new_owner)
    on conflict (space_id, user_id) do update set role = 'owner';
  end loop;
  perform set_config('promptly.team_sync', v_prev, true);
end;
$$;

create or replace function public.team_spaces_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.spaces s where s.community_id = new.conversation_id) then
    perform public._team_spaces_add_member(new.conversation_id, new.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists team_spaces_member_insert on public.conversation_members;
create trigger team_spaces_member_insert after insert on public.conversation_members
  for each row execute function public.team_spaces_member_insert();

create or replace function public.team_spaces_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.spaces s where s.community_id = old.conversation_id) then
    perform public._team_spaces_remove_member(old.conversation_id, old.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists team_spaces_member_delete on public.conversation_members;
create trigger team_spaces_member_delete after delete on public.conversation_members
  for each row execute function public.team_spaces_member_delete();

create or replace function public.team_spaces_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner' and old.role is distinct from 'owner' and exists (select 1 from public.spaces s where s.community_id = new.conversation_id) then
    perform public._team_spaces_owner_changed(new.conversation_id, new.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists team_spaces_member_role on public.conversation_members;
create trigger team_spaces_member_role after update of role on public.conversation_members
  for each row execute function public.team_spaces_member_role();

create or replace function public.team_spaces_conversation_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.spaces s where s.community_id = old.id) then
    perform public._team_spaces_detach(old.id);
  end if;
  return old;
end;
$$;
drop trigger if exists team_spaces_conversation_delete on public.conversations;
create trigger team_spaces_conversation_delete before delete on public.conversations
  for each row execute function public.team_spaces_conversation_delete();

-- Ekibe bağlı Space varken topluluk "tamamen kapalı" olmaktan çıkamaz (herkes katılabilir hâle gelip Space içeriğine erişirdi).
create or replace function public.chat_groups_team_visibility_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.visibility = 'private' and new.visibility <> 'private' and exists (select 1 from public.spaces s where s.community_id = new.id) then
    raise exception 'community_has_team_spaces';
  end if;
  return new;
end;
$$;
drop trigger if exists chat_groups_team_visibility_guard on public.chat_groups;
create trigger chat_groups_team_visibility_guard before update of visibility on public.chat_groups
  for each row execute function public.chat_groups_team_visibility_guard();

-- ----------------------------------------------------------------------------
-- 6. Ekibe Space aç / listele
-- ----------------------------------------------------------------------------
create or replace function public.create_team_space(
  p_community uuid,
  p_title text,
  p_description text default '',
  p_kind text default 'team_library',
  p_groups text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
  v_name text;
  v_pos integer := 0;
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_library')
     or char_length(coalesce(p_description, '')) > 500
     or coalesce(cardinality(p_groups), 0) > 12 then
    raise exception 'space_invalid';
  end if;
  -- Topluluk var, "tamamen kapalı" ve kapatılmamış olmalı; yoksa varlığı sızmasın diye genel hata.
  if not exists (select 1 from public.chat_groups g where g.id = p_community and g.visibility = 'private' and g.closed_at is null) then
    raise exception 'space_forbidden';
  end if;
  -- `_group_can` üye olmayan için NULL döner: NULL'u "yetki yok" say (aksi hâlde `not NULL` koşulu sessizce geçerdi).
  if not coalesce(public._group_can(p_community, v_uid, 'create_spaces'), false) then raise exception 'space_forbidden'; end if;
  if (select count(*) from public.spaces s where s.community_id = p_community) >= 50 then raise exception 'team_space_limit'; end if;
  select m.user_id into v_owner from public.conversation_members m where m.conversation_id = p_community and m.role = 'owner';
  if v_owner is null then raise exception 'space_invalid'; end if;

  insert into public.spaces (owner_id, title, description, kind, visibility, community_id, updated_by)
  values (v_owner, btrim(p_title), coalesce(p_description, ''), p_kind, 'private', p_community, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;

  -- Mevcut bütün üyeler düzenleyici olarak yansıtılır (sahip satırı `spaces_after_insert`'ten gelir).
  perform set_config('promptly.team_sync', '1', true);
  insert into public.space_members (space_id, user_id, role, added_by)
  select v_id, m.user_id, 'editor', v_owner from public.conversation_members m
   where m.conversation_id = p_community and m.user_id <> v_owner
  on conflict do nothing;
  perform set_config('promptly.team_sync', v_prev, true);
  return v_id;
end;
$$;

-- Ekibin Space'leri (çağıranın okuyabildiği; `list_spaces` ile AYNI sütunlar).
create or replace function public.list_team_spaces(p_community uuid, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text, title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[], image_count integer, prompt_count integer, note_count integer, member_count integer, my_role text, is_favorite boolean, last_opened_at timestamptz, created_at timestamptz, updated_at timestamptz, archived_at timestamptz)
language sql
stable
set search_path = public
as $$
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url,
         s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         case when m.role is not null then (select count(*)::integer from public.space_members c where c.space_id = s.id) end,
         case when m.role is null then null else public.space_role(s.id) end, coalesce(us.favorite, false), us.last_opened_at,
         s.created_at, s.updated_at, s.archived_at
    from public.spaces s
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where s.community_id = p_community and m.role is not null
   order by s.archived_at is not null, s.updated_at desc, s.id
   limit greatest(1, least(coalesce(p_limit, 50), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- Kişi başına 200 Space sınırı ekip Space'lerini saymaz.
create or replace function public.create_space(
  p_title text,
  p_description text default '',
  p_kind text default 'free',
  p_visibility text default 'private',
  p_groups text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_pos integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_library')
     or coalesce(p_visibility, '') not in ('private', 'link', 'public')
     or char_length(coalesce(p_description, '')) > 500
     or coalesce(cardinality(p_groups), 0) > 12 then
    raise exception 'space_invalid';
  end if;
  if (select count(*) from public.spaces s where s.owner_id = v_uid and s.community_id is null) >= 200 then raise exception 'space_limit'; end if;
  insert into public.spaces (owner_id, title, description, kind, visibility, updated_by)
  values (v_uid, btrim(p_title), coalesce(p_description, ''), p_kind, p_visibility, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Onay: ekip Space'inde `approve_library` yetkisi (sahip her zaman); bağlı olmayanda eskisi gibi Space sahibi
-- ----------------------------------------------------------------------------
create or replace function public.space_set_item_approval(p_item uuid, p_approved boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_kind text;
  v_comm uuid;
  v_title text;
  v_at timestamptz;
  v_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null or p_approved is null then raise exception 'space_invalid'; end if;
  select i.space_id into v_space from public.space_items i where i.id = p_item;
  if v_space is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  select s.kind, s.community_id into v_kind, v_comm from public.spaces s where s.id = v_space;
  if v_comm is not null then
    if not coalesce(public._group_can(v_comm, v_uid, 'approve_library'), false) or not public.can_edit_space(v_space) then raise exception 'space_forbidden'; end if;
  elsif public.space_role(v_space) is distinct from 'owner' or not public.can_edit_space(v_space) then
    raise exception 'space_forbidden';
  end if;
  if v_kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  perform set_config('promptly.space_approval', '1', true);
  update public.space_items
     set approved_at = case when p_approved then now() else null end,
         approved_by = case when p_approved then v_uid else null end
   where id = p_item and kind = 'prompt' and is_draft
   returning title, approved_at into v_title, v_at;
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_approval', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  perform public._space_log(v_space, case when p_approved then 'item_approved' else 'item_unapproved' end, nullif(btrim(v_title), ''));
  return v_at;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Aynı ekibin içeriği ekip Space'ine eklenebilir (kişisel Space'te topluluk içeriği yine eklenemez)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_items_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_readable boolean;
begin
  if tg_op = 'UPDATE' then
    -- Kimlik ve kaynak değişmez; yalnız kaynak silindiğinde (ON DELETE SET NULL) null'a düşebilir.
    if new.id <> old.id or new.space_id <> old.space_id or new.kind <> old.kind
       or new.media_url is distinct from old.media_url or new.is_draft <> old.is_draft
       or new.content_type is distinct from old.content_type or new.content_id is distinct from old.content_id
       or (new.prompt_id is distinct from old.prompt_id and new.prompt_id is not null)
       or (new.source_prompt_id is distinct from old.source_prompt_id and new.source_prompt_id is not null)
       or (new.palette_id is distinct from old.palette_id and new.palette_id is not null)
       or (new.created_by is distinct from old.created_by and new.created_by is not null)
       or new.created_at <> old.created_at then
      raise exception 'space_invalid';
    end if;
    if (new.title, new.body, new.note, new.color, new.is_private, new.attached_item_id)
       is distinct from (old.title, old.body, old.note, old.color, old.is_private, old.attached_item_id) then
      new.updated_at := now();
      new.updated_by := auth.uid();
    end if;
  end if;

  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
     and not exists (select 1 from public.space_groups g where g.id = new.group_id and g.space_id = new.space_id) then
    raise exception 'space_invalid';
  end if;
  if new.attached_item_id is not null and (tg_op = 'INSERT' or new.attached_item_id is distinct from old.attached_item_id)
     and (new.kind <> 'note' or new.attached_item_id = new.id
          or not exists (select 1 from public.space_items i where i.id = new.attached_item_id and i.space_id = new.space_id)) then
    raise exception 'space_invalid';
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.space_items i where i.space_id = new.space_id) >= 500 then
      raise exception 'space_item_limit';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();
    if new.kind = 'image' then
      if new.is_draft or new.source_prompt_id is not null then
        raise exception 'space_invalid';
      end if;
      if new.prompt_id is not null then
        if not exists (
          select 1 from public.prompt_media pm join public.prompts p on p.id = pm.prompt_id
           where pm.prompt_id = new.prompt_id and pm.url = new.media_url and (p.community_id is null or p.community_id = (select sc.community_id from public.spaces sc where sc.id = new.space_id))
        ) then
          raise exception 'space_source_unavailable';
        end if;
      elsif not public._space_valid_upload_url(new.space_id, new.media_url) then
        raise exception 'space_invalid';
      end if;
    elsif new.media_url is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'prompt' then
      if new.is_draft then
        if new.prompt_id is not null then raise exception 'space_invalid'; end if;
        if new.source_prompt_id is not null
           and not exists (select 1 from public.prompts p where p.id = new.source_prompt_id and (p.community_id is null or p.community_id = (select sc.community_id from public.spaces sc where sc.id = new.space_id))) then
          raise exception 'space_source_unavailable';
        end if;
      elsif new.prompt_id is null
         or not exists (select 1 from public.prompts p where p.id = new.prompt_id and (p.community_id is null or p.community_id = (select sc.community_id from public.spaces sc where sc.id = new.space_id))) then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.kind <> 'image' and (new.prompt_id is not null or new.is_draft or new.source_prompt_id is not null) then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'content' then
      v_readable := case new.content_type
        when 'request' then exists (select 1 from public.prompt_requests r where r.id = new.content_id and (r.community_id is null or r.community_id = (select sc.community_id from public.spaces sc where sc.id = new.space_id)))
        when 'workflow' then exists (select 1 from public.workflows w where w.id = new.content_id and (w.community_id is null or w.community_id = (select sc.community_id from public.spaces sc where sc.id = new.space_id)))
        when 'preset' then exists (select 1 from public.presets s where s.id = new.content_id and (s.community_id is null or s.community_id = (select sc.community_id from public.spaces sc where sc.id = new.space_id)))
        else false end;
      if not v_readable then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.content_type is not null or new.content_id is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'palette' then
      if new.palette_id is null
         or not exists (select 1 from public.space_palettes sp where sp.id = new.palette_id and sp.space_id = new.space_id) then
        raise exception 'space_invalid';
      end if;
    elsif new.palette_id is not null then
      raise exception 'space_invalid';
    end if;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 9. Yetkiler
-- ----------------------------------------------------------------------------
revoke execute on function public.space_members_team_guard() from public, anon, authenticated;
revoke execute on function public.space_invitations_team_guard() from public, anon, authenticated;
revoke execute on function public.chat_groups_team_visibility_guard() from public, anon, authenticated;
revoke execute on function public._team_spaces_add_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._team_spaces_remove_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._team_spaces_detach(uuid) from public, anon, authenticated;
revoke execute on function public._team_spaces_owner_changed(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.team_spaces_member_insert() from public, anon, authenticated;
revoke execute on function public.team_spaces_member_delete() from public, anon, authenticated;
revoke execute on function public.team_spaces_member_role() from public, anon, authenticated;
revoke execute on function public.team_spaces_conversation_delete() from public, anon, authenticated;
revoke execute on function public.create_team_space(uuid, text, text, text, text[]) from public, anon;
revoke execute on function public.list_team_spaces(uuid, integer, integer) from public, anon;
grant execute on function public.create_team_space(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.list_team_spaces(uuid, integer, integer) to authenticated;
