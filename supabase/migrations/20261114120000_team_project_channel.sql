-- Ekip projeleri, WP3 (docs/history/360-*, 361-*): Space'e bağlı kanal.
--
-- 1) Proje açılırken kanalı da açılabilir (`team_create_space` yeni aşırı yük: `p_channel`); var olan projeler için `team_create_project_channel`.
-- 2) `space` kanalları elle kanal sınırına (50) SAYILMAZ; proje başına zaten bir kanalla ve Space sınırıyla (50) sınırlıdır.
-- 3) HATA DÜZELTMESİ (R1): `team_channels.space_id` FK'si `on delete set null` iken tablodaki `team_channels_space_shape` CHECK'i (mode='space' ⇔ space_id dolu)
--    çakışıyordu; kanalı olan bir ekip Space'i SİLİNEMİYORDU. Silme öncesi kanal konuşmaları silinir.
-- 4) Proje arşivlenince kanalı da arşivlenir; arşivden dönünce açılır.
-- Yeni aşırı yüklerin yeni argümanları VARSAYILANSIZDIR; eski imza ince sarmalayıcıdır (expand → contract).

-- 1. R1: Space silinmeden önce bağlı kanal konuşmaları gider (konuşma silinince kanal ve üyelikler cascade).
create or replace function public.spaces_team_channels_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversations c using public.team_channels tc where tc.space_id = old.id and c.id = tc.id;
  return old;
end $$;
drop trigger if exists spaces_team_channels_cleanup on public.spaces;
create trigger spaces_team_channels_cleanup before delete on public.spaces for each row execute function public.spaces_team_channels_cleanup();

-- Proje arşivlenince kanalı arşivlenir, geri dönünce açılır.
create or replace function public.spaces_team_channels_archive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.team_channels set archived_at = new.archived_at where space_id = new.id and archived_at is distinct from new.archived_at;
  return null;
end $$;
drop trigger if exists spaces_team_channels_archive on public.spaces;
create trigger spaces_team_channels_archive after update of archived_at on public.spaces
  for each row when (new.team_id is not null and old.archived_at is distinct from new.archived_at) execute function public.spaces_team_channels_archive();

-- 2. Projenin kanalını kur (ad projenin başlığından; çakışırsa -2, -3…).
create or replace function public._team_project_channel(p_team uuid, p_space uuid, p_title text, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_base text := regexp_replace(left(public._team_channel_name(p_title), 36), '-+$', '');
  v_name text;
  v_n integer := 1;
  v_id uuid;
begin
  if v_base is null or v_base !~ '^[a-z0-9][a-z0-9-]*$' then v_base := 'proje'; end if;
  v_name := v_base;
  while exists (select 1 from public.team_channels c where c.team_id = p_team and lower(c.name) = v_name) loop
    v_n := v_n + 1;
    v_name := v_base || '-' || v_n;
  end loop;
  perform set_config('promptly.team_sync', '1', true);
  v_id := public._team_make_channel(p_team, v_name, '', 'space', p_space, 'members', 'mentions', false,
                                    coalesce((select max(position) + 1 from public.team_channels where team_id = p_team), 0), p_by);
  perform public._team_sync_channel(v_id);
  perform set_config('promptly.team_sync', '', true);
  perform public._team_audit(p_team, 'channel', 'project_channel_created', v_name);
  return v_id;
end $$;

-- 3. Proje açarken kanal da açılabilir.
create or replace function public.team_create_space(
  p_team uuid, p_title text, p_description text, p_kind text, p_groups text[], p_mode text, p_channel boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'create_spaces');
  v_owner uuid;
  v_id uuid;
  v_name text;
  v_pos integer := 0;
begin
  perform public._assert_can_act(true);
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free')
     or char_length(coalesce(p_description, '')) > 500 or coalesce(cardinality(p_groups), 0) > 12
     or coalesce(p_mode, '') not in ('all', 'selected', 'admins') then
    raise exception 'space_invalid';
  end if;
  if (select count(*) from public.spaces s where s.team_id = p_team and s.archived_at is null and s.project_space_id is null) >= 50 then raise exception 'team_space_limit'; end if;
  select m.user_id into v_owner from public.team_members m where m.team_id = p_team and m.role = 'owner';
  perform set_config('promptly.team_sync', '1', true);
  insert into public.spaces (owner_id, title, description, kind, visibility, team_id, team_creator_id, team_access_mode, updated_by)
  values (v_owner, btrim(p_title), coalesce(p_description, ''), p_kind, 'private', p_team, v_uid, p_mode, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_sync_space(v_id);
  if coalesce(p_channel, false) then perform public._team_project_channel(p_team, v_id, btrim(p_title), v_uid); end if;
  perform public._team_audit(p_team, 'access', 'space_created', btrim(p_title), jsonb_build_object('mode', p_mode));
  return v_id;
end $$;

-- Eski imza: ince sarmalayıcı (kanal açmaz).
create or replace function public.team_create_space(
  p_team uuid, p_title text, p_description text default '', p_kind text default 'free', p_groups text[] default '{}', p_mode text default 'all')
returns uuid language sql security definer set search_path = public as $$
  select public.team_create_space(p_team, p_title, p_description, p_kind, p_groups, p_mode, false)
$$;

-- Var olan proje için kanal aç (kartta "Kanal aç"). Yetki: kanal yönetimi yeteneği, projeyi açan ya da projede `manage`.
create or replace function public.team_create_project_channel(p_space uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.spaces;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into s from public.spaces where id = p_space;
  if not found or s.team_id is null or public._team_role(s.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if s.kind = 'team_library' or s.project_space_id is not null or s.archived_at is not null then raise exception 'space_invalid'; end if;
  if not (public._team_can(s.team_id, v_uid, 'manage_channels') or s.team_creator_id = v_uid or public._team_space_cap(p_space, v_uid, 'manage')) then
    raise exception 'team_forbidden';
  end if;
  perform public._assert_can_act(true);
  perform public._rate_limit('team_channel_create', 30, interval '1 hour');
  if exists (select 1 from public.team_channels c where c.space_id = p_space and c.archived_at is null) then raise exception 'project_channel_exists'; end if;
  if (select count(*) from public.team_channels c where c.team_id = s.team_id and c.mode = 'space' and c.archived_at is null) >= 50 then raise exception 'team_channel_limit'; end if;
  return public._team_project_channel(s.team_id, p_space, s.title, v_uid);
end $$;

-- 4. Kanal sınırı: space kanalları elle kanal sınırına sayılmaz.
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
  if p_mode <> 'space' and (select count(*) from public.team_channels c where c.team_id = p_team and c.archived_at is null and c.mode <> 'space') >= 50 then raise exception 'team_channel_limit'; end if;
  if p_mode = 'space' and (select count(*) from public.team_channels c where c.team_id = p_team and c.archived_at is null and c.mode = 'space') >= 50 then raise exception 'team_channel_limit'; end if;

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

-- 5. Yetkiler
revoke execute on function public.spaces_team_channels_cleanup(), public.spaces_team_channels_archive(), public._team_project_channel(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.team_create_space(uuid, text, text, text, text[], text, boolean), public.team_create_project_channel(uuid) from public, anon;
grant execute on function public.team_create_space(uuid, text, text, text, text[], text, boolean), public.team_create_project_channel(uuid) to authenticated;
