-- Ekipler (docs/history/353-*) — WP9: eski "tamamen kapalı topluluk = ekip" yapısının kaldırılması.
-- ci:allow-destructive
-- Yıkıcıdır: ekip-topluluk tetikleyicilerini/fonksiyonlarını ve `spaces.community_id` sütununu siler; kalan tamamen kapalı (`private`) toplulukları
-- siler (canlıda 2026-11-08'de 0 tane ve 0 ekibe bağlı Space vardı; kullanıcı "Tasarımcılar" ve "Deneme" test topluluklarının silinebileceğini onayladı).
-- Yeni ekip sistemi 20261110100000–20261110140000 migration'larındadır; istemci artık eski nesneleri çağırmaz (genişlet → daralt, CLAUDE.md §8.11).

-- 1. Kalan tamamen kapalı (eski ekip) topluluklar ve içerikleri
do $$
begin
  perform set_config('promptly.team_sync', '1', true);
  delete from public.spaces where community_id is not null;
  perform set_config('promptly.team_sync', '', true);
end $$;
delete from public.chat_groups where visibility = 'private';

-- 2. Eski tetikleyiciler ve fonksiyonlar
drop trigger if exists team_spaces_member_insert on public.conversation_members;
drop trigger if exists team_spaces_member_delete on public.conversation_members;
drop trigger if exists team_spaces_member_role on public.conversation_members;
drop trigger if exists team_spaces_conversation_delete on public.conversations;
drop trigger if exists chat_groups_team_visibility_guard on public.chat_groups;
drop function if exists public.team_spaces_member_insert();
drop function if exists public.team_spaces_member_delete();
drop function if exists public.team_spaces_member_role();
drop function if exists public.team_spaces_conversation_delete();
drop function if exists public.chat_groups_team_visibility_guard();
drop function if exists public._team_spaces_add_member(uuid, uuid);
drop function if exists public._team_spaces_remove_member(uuid, uuid);
drop function if exists public._team_spaces_detach(uuid);
drop function if exists public._team_spaces_owner_changed(uuid, uuid);
drop function if exists public.create_team_space(uuid, text, text, text, text[]);
drop function if exists public.list_team_spaces(uuid, integer, integer);
drop function if exists public.list_my_teams(integer, integer);

-- 3. community_id'ye bakan Space işlevleri yeniden yazılır, sonra sütun kalkar
CREATE OR REPLACE FUNCTION public.space_role(p_space uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when public._space_member_expired(s.id, auth.uid()) then null
    when m.role = 'owner' then 'owner'
    when s.team_id is not null and (public._team_role(s.team_id, auth.uid()) in ('owner', 'admin') or s.team_creator_id = auth.uid()) then 'owner'
    else m.role
  end
  from public.space_members m
  join public.spaces s on s.id = m.space_id
  where m.space_id = p_space and m.user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.spaces_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'space_invalid';
  end if;
  if (new.owner_id <> old.owner_id or new.team_id is distinct from old.team_id
      or new.team_creator_id is distinct from old.team_creator_id or new.team_access_mode is distinct from old.team_access_mode)
     and not public._team_sync_on() and pg_trigger_depth() <= 1 then
    raise exception 'space_invalid';
  end if;
  if new.team_id is not null and new.visibility <> 'private' then
    raise exception 'space_team_managed';
  end if;
  if exists (select 1 from public.teams t where t.library_space_id = new.id) and new.archived_at is not null and old.archived_at is null then
    raise exception 'team_library_locked';
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
end $function$;

CREATE OR REPLACE FUNCTION public.space_invitations_team_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.spaces s where s.id = new.space_id and s.team_id is not null) then
    raise exception 'space_team_managed';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.space_members_team_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_space uuid := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
begin
  if public._team_sync_on() or pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.spaces s where s.id = v_space and s.team_id is not null) then
    raise exception 'space_team_managed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

CREATE OR REPLACE FUNCTION public.create_space(p_title text, p_description text DEFAULT ''::text, p_kind text DEFAULT 'free'::text, p_visibility text DEFAULT 'private'::text, p_groups text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if (select count(*) from public.spaces s where s.owner_id = v_uid and s.team_id is null) >= 200 then raise exception 'space_limit'; end if;
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
$function$;

drop index if exists public.spaces_community_idx;
alter table public.spaces drop constraint if exists spaces_community_id_fkey;
alter table public.spaces drop column if exists community_id;

-- 4. Topluluk rol yeteneklerinden ekip yetenekleri kalkar (üçlü kural: SQL iki işlev + istemci `lib/chat-groups.ts`); ekibin yetenekleri `_team_role_caps`'tadır.
CREATE OR REPLACE FUNCTION public._group_all_capabilities()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array['edit_settings', 'change_visibility', 'manage_invites', 'manage_requests', 'remove_members', 'ban_members',
               'manage_roles', 'delete_messages', 'pin_messages',
               'moderate_posts', 'pin_posts', 'manage_announcements', 'manage_events', 'edit_rules', 'view_stats',
               'manage_rooms'];
$function$;

CREATE OR REPLACE FUNCTION public._group_default_permissions()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'admin', jsonb_build_object('edit_settings', true, 'change_visibility', true, 'manage_invites', true, 'manage_requests', true,
                                'remove_members', true, 'ban_members', true, 'manage_roles', true, 'delete_messages', true, 'pin_messages', true,
                                'moderate_posts', true, 'pin_posts', true, 'manage_announcements', true, 'manage_events', true,
                                'edit_rules', true, 'view_stats', true, 'manage_rooms', true),
    'moderator', jsonb_build_object('edit_settings', false, 'change_visibility', false, 'manage_invites', false, 'manage_requests', true,
                                    'remove_members', true, 'ban_members', false, 'manage_roles', false, 'delete_messages', true, 'pin_messages', true,
                                    'moderate_posts', true, 'pin_posts', true, 'manage_announcements', false, 'manage_events', false,
                                    'edit_rules', false, 'view_stats', false, 'manage_rooms', false)
  );
$function$;

-- 5. Bilerek YAPILMADI: `chat_groups_visibility_check` içindeki 'private' (tamamen kapalı) düzeyi duruyor. İstemcide hiçbir yerden seçilemez/oluşturulamaz
--    (docs/history/353-*); veritabanında daraltmak onlarca topluluk SQL testinin fixture'ını (kapalı grup = 'private') yeniden yazmayı ister.
