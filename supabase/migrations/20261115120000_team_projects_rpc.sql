-- Ekip projeleri v2, PR-A / 3 (docs/history/362-*): PROJE / DOSYA / PANO / DEĞİŞKEN RPC'leri. Ekleyicidir.
--
-- Kurallar: yazma yalnız SECURITY DEFINER RPC (kimlik `auth.uid()`, `search_path` sabit); tablolara istemci dokunamaz. Okuma RPC'leri görünürlüğü
-- kendileri uygular (taslak sayımı `_team_item_visible`). Proje oluşturma yeteneği = mevcut `create_spaces` (iç ad değişmedi; etiketi arayüzde "Proje oluşturma").
-- Sınırlar: ekip başına ≤50 proje, proje başına ≤30 dosya, proje başına ≤20 ek pano, kapsam başına ≤100 değişken.

-- ============================================================================
-- 1. Yardımcılar
-- ============================================================================
-- Görünür öğe sayısı (taslaklar yalnız ekleyene ve liderlere sayılır).
create or replace function public._team_area_item_count(p_space uuid, p_state text default null)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.space_items i
   where i.space_id = p_space
     and (p_state is null or i.rev_state = p_state)
     and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))
$$;

-- Alanı (Space motoru satırı) kur: sahibi ekip sahibi, görünürlük 'private', eşitleme motoru erişimi yansıtır.
create or replace function public._team_area_make(p_project uuid, p_file uuid, p_title text, p_main boolean, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_owner uuid;
  v_id uuid;
begin
  select pr.team_id into v_team from public.team_projects pr where pr.id = p_project;
  select m.user_id into v_owner from public.team_members m where m.team_id = v_team and m.role = 'owner';
  if v_team is null or v_owner is null then raise exception 'project_not_found'; end if;
  perform set_config('promptly.team_sync', '1', true);
  insert into public.spaces (owner_id, title, description, kind, visibility, team_id, team_creator_id, team_access_mode, team_project_id, team_file_id, team_area_main, updated_by)
  values (v_owner, btrim(p_title), '', 'team_area', 'private', v_team, p_by, 'selected', p_project, p_file, coalesce(p_main, false), p_by)
  returning id into v_id;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_sync_space(v_id);
  return v_id;
end $$;

-- Erişim girişlerini yaz (tümünü değiştirir). Üye ekip üyesi olmalı; konuğa 'lead' verilemez; grup ekibin grubu olmalı.
create or replace function public._team_project_entries_apply(p_project uuid, p_team uuid, p_entries jsonb, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e jsonb; v_type text; v_id uuid; v_role text;
begin
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 100 then raise exception 'project_invalid'; end if;
  perform set_config('promptly.team_sync', '1', true);
  delete from public.team_project_access where project_id = p_project;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_type := e ->> 'type'; v_role := e ->> 'role';
    begin v_id := (e ->> 'id')::uuid; exception when others then raise exception 'project_invalid'; end;
    if v_type not in ('member', 'group') or v_role not in ('view', 'edit', 'lead') then raise exception 'project_invalid'; end if;
    if v_type = 'member' then
      if not exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = v_id) then raise exception 'project_invalid'; end if;
      if v_role = 'lead' and coalesce(public._team_role(p_team, v_id), 'guest') = 'guest' then raise exception 'project_invalid'; end if;
    else
      if not exists (select 1 from public.team_groups g where g.id = v_id and g.team_id = p_team) then raise exception 'project_invalid'; end if;
    end if;
    insert into public.team_project_access (team_id, project_id, subject_type, subject_id, role, created_by)
    values (p_team, p_project, v_type, v_id, v_role, p_by)
    on conflict (project_id, subject_type, subject_id)
    do update set role = case when public._team_project_rank(excluded.role) > public._team_project_rank(public.team_project_access.role) then excluded.role else public.team_project_access.role end;
  end loop;
  perform set_config('promptly.team_sync', '', true);
end $$;

-- Projeye YENİ erişen kişilere bildirim ("seni projeye ekledi"). `p_before`: işlemden önce erişimi olan kullanıcılar.
create or replace function public._team_project_notify_added(p_project uuid, p_before uuid[], p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pr record; u record;
begin
  select id, team_id, title into pr from public.team_projects where id = p_project;
  for u in select m.user_id from public.team_members m where m.team_id = pr.team_id loop
    if public._team_project_role(p_project, u.user_id) is not null and not (u.user_id = any (coalesce(p_before, '{}'))) then
      perform public._team_notify(u.user_id, p_actor, pr.team_id, 'direct',
        'Seni "' || public.truncate_preview(pr.title, 60) || '" projesine ekledi.',
        '/teams/local?id=' || pr.team_id || '&tab=projects&project=' || pr.id,
        'projadd:' || pr.id || ':' || u.user_id || ':' || to_char(now(), 'YYYYMMDDHH24'));
    end if;
  end loop;
end $$;

create or replace function public._team_project_readers(p_project uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.user_id), '{}') from public.team_members m
   where m.team_id = (select team_id from public.team_projects where id = p_project) and public._team_project_role(p_project, m.user_id) is not null
$$;

-- ============================================================================
-- 2. Proje
-- ============================================================================
create or replace function public.team_create_project(
  p_team uuid, p_title text, p_description text default '', p_mode text default 'selected', p_base_role text default 'view',
  p_entries jsonb default '[]'::jsonb, p_tone text default 'primary')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'create_spaces');
  v_id uuid;
  v_entries jsonb := coalesce(p_entries, '[]'::jsonb);
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_project_create', 30, interval '1 hour');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 or char_length(coalesce(p_description, '')) > 500
     or coalesce(p_mode, '') not in ('selected', 'all') or coalesce(p_base_role, '') not in ('view', 'edit')
     or coalesce(p_tone, '') not in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky')
     or jsonb_typeof(v_entries) <> 'array' then
    raise exception 'project_invalid';
  end if;
  if (select count(*) from public.team_projects x where x.team_id = p_team and x.archived_at is null) >= 50 then raise exception 'team_project_limit'; end if;
  -- Oluşturan kendi projesinden kilitlenmesin: ekip sahibi/yöneticisi değilse lider girişi eklenir.
  if public._team_role(p_team, v_uid) not in ('owner', 'admin')
     and not exists (select 1 from jsonb_array_elements(v_entries) x where x ->> 'type' = 'member' and (x ->> 'id') = v_uid::text) then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('type', 'member', 'id', v_uid, 'role', 'lead'));
  end if;
  insert into public.team_projects (team_id, title, description, tone, access_mode, base_role, created_by)
  values (p_team, btrim(p_title), btrim(coalesce(p_description, '')), p_tone, p_mode, p_base_role, v_uid)
  returning id into v_id;
  perform public._team_project_entries_apply(v_id, p_team, v_entries, v_uid);
  perform public._team_area_make(v_id, null, p_title, true, v_uid);
  perform public._team_project_channel_make(p_team, v_id, btrim(p_title), v_uid);
  perform public._team_sync_project(v_id);
  perform public._team_audit(p_team, 'access', 'project_created', btrim(p_title), jsonb_build_object('mode', p_mode));
  perform public._team_project_notify_added(v_id, '{}', v_uid);
  return v_id;
end $$;

create or replace function public.team_update_project(p_project uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_project_require(p_project, 'lead');
  pr public.team_projects;
  v_key text;
  v_title text;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'project_invalid'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('title', 'description', 'tone', 'review_default') then raise exception 'project_invalid'; end if;
  end loop;
  select * into pr from public.team_projects where id = p_project for update;
  v_title := case when p_patch ? 'title' then btrim(coalesce(p_patch ->> 'title', '')) else pr.title end;
  if char_length(v_title) not between 1 and 80 then raise exception 'project_invalid'; end if;
  begin
    update public.team_projects set
      title = v_title,
      description = case when p_patch ? 'description' then btrim(coalesce(p_patch ->> 'description', '')) else description end,
      tone = coalesce(p_patch ->> 'tone', tone),
      review_default = case when p_patch ? 'review_default' then (p_patch ->> 'review_default')::boolean else review_default end,
      updated_at = now()
    where id = p_project;
  exception when check_violation or invalid_text_representation then raise exception 'project_invalid';
  end;
  if v_title <> pr.title then
    update public.spaces set title = v_title where team_project_id = p_project and team_file_id is null and team_area_main;
  end if;
  perform public._team_audit(pr.team_id, 'access', 'project_updated', v_title);
end $$;

-- Erişim: yalnız lider. Mod 'all': girişler tabanı yükseltir. Yeni erişen kişilere bildirim gider.
create or replace function public.team_set_project_access(p_project uuid, p_mode text, p_base_role text, p_entries jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_project_require(p_project, 'lead');
  pr public.team_projects;
  v_before uuid[];
begin
  if coalesce(p_mode, '') not in ('selected', 'all') or coalesce(p_base_role, '') not in ('view', 'edit') then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project for update;
  v_before := public._team_project_readers(p_project);
  update public.team_projects set access_mode = p_mode, base_role = p_base_role, updated_at = now() where id = p_project;
  perform public._team_project_entries_apply(p_project, pr.team_id, p_entries, v_uid);
  -- Kendini kilitleme: değişiklikten sonra çağıran lider kalmıyorsa (ekip sahibi/yöneticisi hariç) işlem geri alınır.
  if public._team_project_role(p_project, v_uid) is distinct from 'lead' then raise exception 'project_lockout'; end if;
  perform public._team_sync_project(p_project);
  perform public._team_audit(pr.team_id, 'access', 'project_access_changed', pr.title,
    jsonb_build_object('mode', p_mode, 'entries', jsonb_array_length(coalesce(p_entries, '[]'::jsonb))));
  perform public._team_project_notify_added(p_project, v_before, v_uid);
end $$;

-- Arşiv ve silme: ekip sahibi/yöneticisi ya da projeyi açan (hâlâ lider olan) kişi.
create or replace function public._team_project_owner_action(p_project uuid)
returns public.team_projects language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'lead'); pr public.team_projects;
begin
  select * into pr from public.team_projects where id = p_project;
  if not (public._team_role(pr.team_id, v_uid) in ('owner', 'admin') or pr.created_by = v_uid) then raise exception 'team_forbidden'; end if;
  return pr;
end $$;

create or replace function public.team_archive_project(p_project uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.team_projects := public._team_project_owner_action(p_project);
begin
  update public.team_projects set archived_at = case when coalesce(p_archived, true) then now() else null end, updated_at = now() where id = p_project;
  perform public._team_audit(pr.team_id, 'access', case when coalesce(p_archived, true) then 'project_archived' else 'project_restored' end, pr.title);
end $$;

create or replace function public.team_delete_project(p_project uuid, p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.team_projects := public._team_project_owner_action(p_project);
begin
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(pr.title) then raise exception 'team_confirm_mismatch'; end if;
  perform public._team_audit(pr.team_id, 'access', 'project_deleted', pr.title);
  perform set_config('promptly.team_sync', '1', true);
  delete from public.team_projects where id = p_project;
  perform set_config('promptly.team_sync', '', true);
end $$;

-- ============================================================================
-- 3. Dosya
-- ============================================================================
create or replace function public.team_create_file(p_project uuid, p_title text, p_review boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_project_require(p_project, 'lead');
  pr public.team_projects;
  v_id uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_file_create', 60, interval '1 hour');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project for update;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if (select count(*) from public.team_files f where f.project_id = p_project and f.archived_at is null) >= 30 then raise exception 'team_file_limit'; end if;
  insert into public.team_files (project_id, title, position, review_required, created_by)
  values (p_project, btrim(p_title), coalesce((select max(position) + 1 from public.team_files where project_id = p_project), 0), coalesce(p_review, pr.review_default), v_uid)
  returning id into v_id;
  perform public._team_area_make(p_project, v_id, p_title, true, v_uid);
  perform public._team_audit(pr.team_id, 'access', 'file_created', btrim(p_title), jsonb_build_object('project', pr.title));
  return v_id;
end $$;

create or replace function public.team_rename_file(p_file uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.team_files; pr public.team_projects;
begin
  select * into f from public.team_files where id = p_file;
  if not found then raise exception 'project_not_found'; end if;
  perform public._team_project_require(f.project_id, 'lead');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = f.project_id;
  update public.team_files set title = btrim(p_title) where id = p_file;
  update public.spaces set title = btrim(p_title) where team_file_id = p_file and team_area_main;
  perform public._team_audit(pr.team_id, 'access', 'file_renamed', btrim(p_title), jsonb_build_object('project', pr.title));
end $$;

-- Onay anahtarı. Kapatınca bekleyen/taslak öğeler OLDUĞU GİBİ kalır (kendiliğinden onaylanmaz); dönen sayı = onaysız kalan öğe.
create or replace function public.team_file_set_review(p_file uuid, p_on boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare f public.team_files; pr public.team_projects; v_left integer;
begin
  select * into f from public.team_files where id = p_file for update;
  if not found then raise exception 'project_not_found'; end if;
  perform public._team_project_require(f.project_id, 'lead');
  select * into pr from public.team_projects where id = f.project_id;
  update public.team_files set review_required = coalesce(p_on, true) where id = p_file;
  select count(*)::integer into v_left from public.space_items i join public.spaces s on s.id = i.space_id
   where s.team_file_id = p_file and i.rev_state <> 'approved';
  perform public._team_audit(pr.team_id, 'approval', 'file_review_toggled', f.title, jsonb_build_object('project', pr.title, 'on', coalesce(p_on, true), 'unapproved', v_left));
  return v_left;
end $$;

create or replace function public.team_delete_file(p_file uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f public.team_files; pr public.team_projects;
begin
  select * into f from public.team_files where id = p_file;
  if not found then raise exception 'project_not_found'; end if;
  perform public._team_project_require(f.project_id, 'lead');
  select * into pr from public.team_projects where id = f.project_id;
  perform public._team_audit(pr.team_id, 'access', 'file_deleted', f.title, jsonb_build_object('project', pr.title));
  perform set_config('promptly.team_sync', '1', true);
  delete from public.team_files where id = p_file;
  perform set_config('promptly.team_sync', '', true);
end $$;

-- ============================================================================
-- 4. Ek pano (proje geneli ya da dosya içi)
-- ============================================================================
create or replace function public.team_create_board(p_project uuid, p_title text, p_file uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); pr public.team_projects;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_board_create', 60, interval '1 hour');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project for update;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if p_file is not null and not exists (select 1 from public.team_files f where f.id = p_file and f.project_id = p_project) then raise exception 'project_not_found'; end if;
  if (select count(*) from public.spaces s where s.team_project_id = p_project and not s.team_area_main) >= 20 then raise exception 'team_board_limit'; end if;
  return public._team_area_make(p_project, p_file, p_title, false, v_uid);
end $$;

create or replace function public.team_rename_board(p_space uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid := public._team_area_project(p_space);
begin
  if v_project is null then raise exception 'project_not_found'; end if;
  perform public._team_project_require(v_project, 'edit');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  update public.spaces set title = btrim(p_title) where id = p_space and not team_area_main;
  if not found then raise exception 'project_invalid'; end if;
end $$;

create or replace function public.team_delete_board(p_space uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid := public._team_area_project(p_space); s public.spaces;
begin
  if v_project is null then raise exception 'project_not_found'; end if;
  perform public._team_project_require(v_project, 'lead');
  select * into s from public.spaces where id = p_space;
  if s.team_area_main then raise exception 'project_invalid'; end if;
  perform public._team_audit(s.team_id, 'access', 'board_deleted', s.title);
  perform set_config('promptly.team_sync', '1', true);
  delete from public.spaces where id = p_space;
  perform set_config('promptly.team_sync', '', true);
end $$;

-- ============================================================================
-- 5. Değişkenler (onay kapsamı DIŞI; düzenleyici+ yazar, projeyi okuyan herkes okur)
-- ============================================================================
create or replace function public.team_set_variable(p_project uuid, p_name text, p_value text, p_file uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); pr public.team_projects; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_variable_write', 200, interval '1 hour');
  if v_name !~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$' or char_length(coalesce(p_value, '')) > 500 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if p_file is not null and not exists (select 1 from public.team_files f where f.id = p_file and f.project_id = p_project) then raise exception 'project_not_found'; end if;
  select id into v_id from public.team_variables where project_id = p_project and file_id is not distinct from p_file and lower(name) = lower(v_name);
  if v_id is null then
    if (select count(*) from public.team_variables x where x.project_id = p_project and x.file_id is not distinct from p_file) >= 100 then raise exception 'team_variable_limit'; end if;
    insert into public.team_variables (team_id, project_id, file_id, name, value, updated_by) values (pr.team_id, p_project, p_file, v_name, coalesce(p_value, ''), v_uid) returning id into v_id;
  else
    update public.team_variables set name = v_name, value = coalesce(p_value, ''), updated_by = v_uid, updated_at = now() where id = v_id;
  end if;
  perform public._team_audit(pr.team_id, 'variable', 'variable_changed', '{' || v_name || '}', jsonb_build_object('project', pr.title, 'file', p_file is not null));
  return v_id;
end $$;

create or replace function public.team_delete_variable(p_variable uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.team_variables; pr public.team_projects;
begin
  select * into v from public.team_variables where id = p_variable;
  if not found then raise exception 'project_not_found'; end if;
  perform public._team_project_require(v.project_id, 'edit');
  select * into pr from public.team_projects where id = v.project_id;
  delete from public.team_variables where id = p_variable;
  perform public._team_audit(pr.team_id, 'variable', 'variable_deleted', '{' || v.name || '}', jsonb_build_object('project', pr.title));
end $$;

-- Proje + dosya değişkenleri (okuyabilen herkes).
create or replace function public.team_variables_list(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_project_require(p_project, 'view');
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'file_id', v.file_id, 'name', v.name, 'value', v.value, 'updated_at', v.updated_at,
                                                         'updated_by', coalesce(p.display_name, p.username))
                                    order by v.file_id nulls first, lower(v.name))
                     from public.team_variables v left join public.profiles p on p.id = v.updated_by
                    where v.project_id = p_project), '[]'::jsonb);
end $$;

-- ============================================================================
-- 6. Okumalar
-- ============================================================================
create or replace function public.team_projects_list(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public._team_role(p_team, v_uid) is null then raise exception 'team_not_found'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at)
      from (
        select p.created_at,
               jsonb_build_object(
                 'id', p.id, 'title', p.title, 'description', p.description, 'tone', p.tone, 'archived_at', p.archived_at,
                 'review_default', p.review_default, 'access_mode', p.access_mode, 'base_role', p.base_role,
                 'my_role', public._team_project_role(p.id, v_uid),
                 'main_area_id', (select s.id from public.spaces s where s.team_project_id = p.id and s.team_file_id is null and s.team_area_main),
                 'channel_id', (select tc.id from public.team_channels tc where tc.project_id = p.id),
                 'member_count', (select count(*)::integer from public.team_members m where m.team_id = p.team_id and public._team_project_role(p.id, m.user_id) is not null),
                 'board_count', (select count(*)::integer from public.spaces s where s.team_project_id = p.id and not s.team_area_main),
                 'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_project_id = p.id),
                 'pending_count', case when public._team_project_role(p.id, v_uid) = 'lead'
                                       then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_project_id = p.id) end,
                 'files', coalesce((select jsonb_agg(jsonb_build_object(
                                      'id', f.id, 'title', f.title, 'review_required', f.review_required,
                                      'main_area_id', (select s.id from public.spaces s where s.team_file_id = f.id and s.team_area_main),
                                      'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_file_id = f.id),
                                      'pending_count', case when public._team_project_role(p.id, v_uid) = 'lead'
                                                            then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_file_id = f.id) end)
                                    order by f.position, f.created_at)
                                    from public.team_files f where f.project_id = p.id and f.archived_at is null), '[]'::jsonb)) as j
          from public.team_projects p
         where p.team_id = p_team and public._team_project_role(p.id, v_uid) is not null
      ) x), '[]'::jsonb);
end $$;

create or replace function public.team_project_get(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._team_project_require(p_project, 'view');
  pr public.team_projects;
  v_role text := public._team_project_role(p_project, v_uid);
begin
  select * into pr from public.team_projects where id = p_project;
  return jsonb_build_object(
    'project', jsonb_build_object('id', pr.id, 'team_id', pr.team_id, 'title', pr.title, 'description', pr.description, 'tone', pr.tone,
                                  'access_mode', pr.access_mode, 'base_role', pr.base_role, 'review_default', pr.review_default,
                                  'archived_at', pr.archived_at, 'created_at', pr.created_at),
    'my_role', v_role,
    'main_area_id', (select s.id from public.spaces s where s.team_project_id = p_project and s.team_file_id is null and s.team_area_main),
    'channel_id', (select tc.id from public.team_channels tc where tc.project_id = p_project),
    'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_project_id = p_project and s.team_file_id is null),
    'pending_count', case when v_role = 'lead' then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_project_id = p_project) end,
    'files', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', f.id, 'title', f.title, 'position', f.position, 'review_required', f.review_required,
                         'main_area_id', (select s.id from public.spaces s where s.team_file_id = f.id and s.team_area_main),
                         'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_file_id = f.id),
                         'board_count', (select count(*)::integer from public.spaces s where s.team_file_id = f.id and not s.team_area_main),
                         'pending_count', case when v_role = 'lead' then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_file_id = f.id) end)
                       order by f.position, f.created_at)
                       from public.team_files f where f.project_id = p_project and f.archived_at is null), '[]'::jsonb),
    'boards', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'item_count', public._team_area_item_count(s.id)) order by s.created_at)
                          from public.spaces s where s.team_project_id = p_project and not s.team_area_main), '[]'::jsonb),
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object('type', q.type, 'id', q.id, 'name', q.name, 'username', q.username, 'avatar_url', q.avatar_url,
                                                   'role', q.role, 'implicit', q.implicit, 'member_count', q.member_count)
                               order by public._team_project_rank(q.role) desc, lower(q.name)), '[]'::jsonb)
        from (
          select 'member'::text as type, a.subject_id as id, coalesce(p.display_name, p.username) as name, p.username, p.avatar_url, a.role, false as implicit, null::integer as member_count
            from public.team_project_access a join public.profiles p on p.id = a.subject_id
           where a.project_id = p_project and a.subject_type = 'member'
             and coalesce(public._team_role(pr.team_id, a.subject_id), '') not in ('owner', 'admin')
          union all
          select 'group', a.subject_id, g.name, null, null, a.role, false, (select count(*)::integer from public.team_group_members gm where gm.group_id = g.id)
            from public.team_project_access a join public.team_groups g on g.id = a.subject_id
           where a.project_id = p_project and a.subject_type = 'group'
          union all
          select 'member', m.user_id, coalesce(p.display_name, p.username), p.username, p.avatar_url, 'lead', true, null
            from public.team_members m join public.profiles p on p.id = m.user_id
           where m.team_id = pr.team_id and m.role in ('owner', 'admin')
        ) q),
    'variables', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'file_id', v.file_id, 'name', v.name, 'value', v.value) order by v.file_id nulls first, lower(v.name))
                             from public.team_variables v where v.project_id = p_project), '[]'::jsonb));
end $$;

-- Erişim penceresi için düzenlenebilir giriş listesi (yalnız lider).
create or replace function public.team_project_access(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr public.team_projects;
begin
  perform public._team_project_require(p_project, 'lead');
  select * into pr from public.team_projects where id = p_project;
  return jsonb_build_object('mode', pr.access_mode, 'base_role', pr.base_role,
    'entries', coalesce((select jsonb_agg(jsonb_build_object('type', a.subject_type, 'id', a.subject_id, 'role', a.role,
                                                              'name', coalesce(g.name, p.display_name, p.username), 'username', p.username,
                                                              'sub', case when a.subject_type = 'group' then (select count(*) from public.team_group_members gm where gm.group_id = a.subject_id)::text else tm.role end)
                                          order by a.subject_type desc, coalesce(g.name, p.display_name, p.username))
                           from public.team_project_access a
                           left join public.team_groups g on a.subject_type = 'group' and g.id = a.subject_id
                           left join public.profiles p on a.subject_type = 'member' and p.id = a.subject_id
                           left join public.team_members tm on a.subject_type = 'member' and tm.team_id = a.team_id and tm.user_id = a.subject_id
                          where a.project_id = p_project), '[]'::jsonb));
end $$;

-- Proje kanalları: kanal kimliği → proje (kanal listesi RPC'sinin dönüş tipi değişmesin diye ayrı okuma).
create or replace function public.team_project_channels(p_team uuid)
returns table (channel_id uuid, project_id uuid, project_title text)
language sql stable security definer set search_path = public as $$
  select tc.id, tc.project_id, p.title
    from public.team_channels tc join public.team_projects p on p.id = tc.project_id
   where tc.team_id = p_team and public._team_role(p_team, auth.uid()) is not null and public._team_project_role(p.id, auth.uid()) is not null
$$;

-- Alanın hangi projeye/dosyaya ait olduğu (alan sayfası ekip bağlamını çizsin; ekip alanı değilse boş döner).
create or replace function public.team_area_info(p_space uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.spaces; v_role text;
begin
  select * into s from public.spaces where id = p_space;
  if not found or s.team_project_id is null then return null; end if;
  v_role := public._team_project_role(s.team_project_id, auth.uid());
  if v_role is null then return null; end if;
  return jsonb_build_object(
    'space_id', s.id, 'team_id', s.team_id, 'project_id', s.team_project_id, 'file_id', s.team_file_id, 'is_main', s.team_area_main, 'my_role', v_role,
    'project_title', (select p.title from public.team_projects p where p.id = s.team_project_id),
    'file_title', (select f.title from public.team_files f where f.id = s.team_file_id),
    'review_required', case when s.team_file_id is not null then (select f.review_required from public.team_files f where f.id = s.team_file_id)
                            else (select p.review_default from public.team_projects p where p.id = s.team_project_id) end);
end $$;

-- ============================================================================
-- 7. Yetkiler
-- ============================================================================
revoke execute on function public._team_area_item_count(uuid, text), public._team_area_make(uuid, uuid, text, boolean, uuid),
  public._team_project_entries_apply(uuid, uuid, jsonb, uuid), public._team_project_notify_added(uuid, uuid[], uuid),
  public._team_project_readers(uuid), public._team_project_owner_action(uuid) from public, anon, authenticated;

revoke execute on function
  public.team_create_project(uuid, text, text, text, text, jsonb, text), public.team_update_project(uuid, jsonb),
  public.team_set_project_access(uuid, text, text, jsonb), public.team_archive_project(uuid, boolean), public.team_delete_project(uuid, text),
  public.team_create_file(uuid, text, boolean), public.team_rename_file(uuid, text), public.team_file_set_review(uuid, boolean), public.team_delete_file(uuid),
  public.team_create_board(uuid, text, uuid), public.team_rename_board(uuid, text), public.team_delete_board(uuid),
  public.team_set_variable(uuid, text, text, uuid), public.team_delete_variable(uuid), public.team_variables_list(uuid),
  public.team_projects_list(uuid), public.team_project_get(uuid), public.team_project_access(uuid), public.team_project_channels(uuid), public.team_area_info(uuid)
  from public, anon;
grant execute on function
  public.team_create_project(uuid, text, text, text, text, jsonb, text), public.team_update_project(uuid, jsonb),
  public.team_set_project_access(uuid, text, text, jsonb), public.team_archive_project(uuid, boolean), public.team_delete_project(uuid, text),
  public.team_create_file(uuid, text, boolean), public.team_rename_file(uuid, text), public.team_file_set_review(uuid, boolean), public.team_delete_file(uuid),
  public.team_create_board(uuid, text, uuid), public.team_rename_board(uuid, text), public.team_delete_board(uuid),
  public.team_set_variable(uuid, text, text, uuid), public.team_delete_variable(uuid), public.team_variables_list(uuid),
  public.team_projects_list(uuid), public.team_project_get(uuid), public.team_project_access(uuid), public.team_project_channels(uuid), public.team_area_info(uuid)
  to authenticated;
