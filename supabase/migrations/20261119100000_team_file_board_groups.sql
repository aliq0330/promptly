-- ci:allow-destructive (yalnız `delete from team_board_groups` — çözülen/boş grup satırları; kullanıcı verisi, pano ya da öğe silinmez)
-- Ekip dosyası ↔ pano ayrımı, pano grupları ve taslak gizliliği (docs/history/368-*). Ekleyicidir (expand): sütun/tablo eklenir, işlevler aynı imzayla yeniden yazılır.
--
-- 1) `team_board_groups` + `spaces.team_board_group_id`: bir panoda "Yeni pano" denince iki pano bir GRUP olur; bağımsız panolar grupsuzdur.
--    Pano değiştirici/taşıma/sıralama yalnız grubun kapsamındadır. Grupta tek pano kalırsa grup çözülür (pano normal pano olur).
-- 2) Proje BOŞ doğar (otomatik "Ortak" alan yok); proje geneli pano/değişken yazılmaz. Dosya alanı (ana alan) artık "dosyanın öğeleri"nin kabıdır, pano DEĞİLDİR.
-- 3) Taslak (`draft`) YALNIZ ekleyene görünür — liderden de gizli; "onaya gönder" sonrası (pending/changes) lider de görür.
--    Tek doğruluk kaynağı `_team_item_visible`: RLS, Storage, oklar, sayaçlar, yorumlar hepsi onu izler.
-- 4) Mevcut canlı veri korunur: eski "Ortak"/ana alanlar silinmez; birden çok panolu dosyaların panoları tek gruba alınır.

-- ============================================================================
-- 1. Pano grupları
-- ============================================================================
create table if not exists public.team_board_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.team_projects (id) on delete cascade,
  file_id uuid references public.team_files (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists team_board_groups_project_idx on public.team_board_groups (project_id, file_id);
alter table public.team_board_groups enable row level security;
revoke all on public.team_board_groups from anon, authenticated;  -- istemci yalnız team_project_get üzerinden okur

alter table public.spaces add column if not exists team_board_group_id uuid references public.team_board_groups (id) on delete set null;
create index if not exists spaces_team_board_group_idx on public.spaces (team_board_group_id) where team_board_group_id is not null;

-- Grupta 2'den az pano kaldıysa grubu çöz (kalan pano normal pano olur).
create or replace function public._team_board_group_tidy(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_group is null then return; end if;
  if (select count(*) from public.spaces s where s.team_board_group_id = p_group) < 2 then
    update public.spaces set team_board_group_id = null where team_board_group_id = p_group;
    delete from public.team_board_groups where id = p_group;
  end if;
end $$;

-- Mevcut veri: birden çok ek panosu olan dosyaların panoları tek gruba alınır (bugünkü davranış korunur).
do $$
declare r record; v_group uuid;
begin
  for r in select s.team_file_id as file_id, s.team_project_id as project_id
             from public.spaces s
            where s.team_file_id is not null and not s.team_area_main and s.team_board_group_id is null
            group by s.team_file_id, s.team_project_id having count(*) >= 2 loop
    insert into public.team_board_groups (project_id, file_id, title)
    values (r.project_id, r.file_id, (select x.title from public.spaces x where x.team_file_id = r.file_id and not x.team_area_main
                                       order by x.team_board_position, x.created_at limit 1))
    returning id into v_group;
    update public.spaces set team_board_group_id = v_group where team_file_id = r.file_id and not team_area_main;
  end loop;
end $$;

-- ============================================================================
-- 2. Taslak gizliliği: draft yalnız ekleyene; pending/changes ekleyene + liderlere
-- ============================================================================
create or replace function public._team_item_visible(p_space uuid, p_state text, p_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_state = 'approved' then true
    else coalesce((
      select case
               when s.team_project_id is null then true
               when auth.uid() is null then false
               when p_author is not distinct from auth.uid() then true
               when p_state = 'draft' then false
               else public._team_project_role(s.team_project_id, auth.uid()) = 'lead'
             end
        from public.spaces s where s.id = p_space), true)
  end
$$;

-- Onay anahtarı kapanınca "onaysız kalan" sayısı yalnız çağıranın GÖREBİLDİĞİ öğeleri sayar (başkasının taslağı sızmaz).
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
   where s.team_file_id = p_file and i.rev_state <> 'approved' and public._team_item_visible(i.space_id, i.rev_state, i.created_by);
  perform public._team_audit(pr.team_id, 'approval', 'file_review_toggled', f.title, jsonb_build_object('project', pr.title, 'on', coalesce(p_on, true), 'unapproved', v_left));
  return v_left;
end $$;

-- ============================================================================
-- 3. Proje boş doğar; proje geneli değişken yazılmaz
-- ============================================================================
-- Gövde 20261115120000'dakiyle aynı; tek fark: otomatik "Ortak" (proje ana alanı) KURULMAZ.
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
  if public._team_role(p_team, v_uid) not in ('owner', 'admin')
     and not exists (select 1 from jsonb_array_elements(v_entries) x where x ->> 'type' = 'member' and (x ->> 'id') = v_uid::text) then
    v_entries := v_entries || jsonb_build_array(jsonb_build_object('type', 'member', 'id', v_uid, 'role', 'lead'));
  end if;
  insert into public.team_projects (team_id, title, description, tone, access_mode, base_role, created_by)
  values (p_team, btrim(p_title), btrim(coalesce(p_description, '')), p_tone, p_mode, p_base_role, v_uid)
  returning id into v_id;
  perform public._team_project_entries_apply(v_id, p_team, v_entries, v_uid);
  perform public._team_project_channel_make(p_team, v_id, btrim(p_title), v_uid);
  perform public._team_sync_project(v_id);
  perform public._team_audit(p_team, 'access', 'project_created', btrim(p_title), jsonb_build_object('mode', p_mode));
  perform public._team_project_notify_added(v_id, '{}', v_uid);
  return v_id;
end $$;

-- Değişken yalnız dosya kapsamında yazılır (proje ortak değişkenleri kalktı; eski değerler silinmez, çözümlemede kullanılmaz).
create or replace function public.team_set_variable(p_project uuid, p_name text, p_value text, p_file uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); pr public.team_projects; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_variable_write', 200, interval '1 hour');
  if p_file is null then raise exception 'project_invalid'; end if;
  if v_name !~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$' or char_length(coalesce(p_value, '')) > 500 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if not exists (select 1 from public.team_files f where f.id = p_file and f.project_id = p_project) then raise exception 'project_not_found'; end if;
  select id into v_id from public.team_variables where project_id = p_project and file_id = p_file and lower(name) = lower(v_name);
  if v_id is null then
    if (select count(*) from public.team_variables x where x.project_id = p_project and x.file_id = p_file) >= 100 then raise exception 'team_variable_limit'; end if;
    insert into public.team_variables (team_id, project_id, file_id, name, value, updated_by) values (pr.team_id, p_project, p_file, v_name, coalesce(p_value, ''), v_uid) returning id into v_id;
  else
    update public.team_variables set name = v_name, value = coalesce(p_value, ''), updated_by = v_uid, updated_at = now() where id = v_id;
  end if;
  perform public._team_audit(pr.team_id, 'variable', 'variable_changed', '{' || v_name || '}', jsonb_build_object('project', pr.title, 'file', true));
  return v_id;
end $$;

-- ============================================================================
-- 4. Pano RPC'leri (bağımsız pano · gruba yeni pano · yeniden adlandır · sil · sırala · taşı)
-- ============================================================================
-- Bağımsız pano: yalnız DOSYA içinde (proje geneli pano yok). Bir grubun parçası değildir.
create or replace function public.team_create_board(p_project uuid, p_title text, p_file uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); pr public.team_projects; v_id uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_board_create', 60, interval '1 hour');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 or p_file is null then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project for update;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if not exists (select 1 from public.team_files f where f.id = p_file and f.project_id = p_project) then raise exception 'project_not_found'; end if;
  if (select count(*) from public.spaces s where s.team_project_id = p_project and not s.team_area_main) >= 20 then raise exception 'team_board_limit'; end if;
  v_id := public._team_area_make(p_project, p_file, p_title, false, v_uid);
  update public.spaces set team_board_position = coalesce((select max(s2.team_board_position) + 1 from public.spaces s2
                                                           where s2.team_project_id = p_project and s2.team_file_id = p_file and not s2.team_area_main and s2.id <> v_id), 0)
   where id = v_id;
  return v_id;
end $$;

-- Açık panonun yanına yeni pano: ikisi bir GRUP olur (grup yoksa kurulur, varsa pano gruba eklenir). Grubun adı ilk panonun adıdır.
create or replace function public.team_create_board_in_group(p_from uuid, p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := public._team_area_project(p_from);
  v_uid uuid;
  s public.spaces; pr public.team_projects; v_group uuid; v_id uuid;
begin
  if v_project is null then raise exception 'project_not_found'; end if;
  v_uid := public._team_project_require(v_project, 'edit');
  perform public._assert_can_act(true);
  perform public._rate_limit('team_board_create', 60, interval '1 hour');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = v_project for update;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  select * into s from public.spaces where id = p_from;
  if s.team_area_main or s.team_file_id is null then raise exception 'project_invalid'; end if;
  if (select count(*) from public.spaces x where x.team_project_id = v_project and not x.team_area_main) >= 20 then raise exception 'team_board_limit'; end if;
  v_group := s.team_board_group_id;
  if v_group is null then
    insert into public.team_board_groups (project_id, file_id, title) values (v_project, s.team_file_id, s.title) returning id into v_group;
    update public.spaces set team_board_group_id = v_group, team_board_position = 0 where id = p_from;
  end if;
  v_id := public._team_area_make(v_project, s.team_file_id, p_title, false, v_uid);
  update public.spaces set team_board_group_id = v_group,
         team_board_position = coalesce((select max(x.team_board_position) + 1 from public.spaces x where x.team_board_group_id = v_group and x.id <> v_id), 0)
   where id = v_id;
  return v_id;
end $$;

create or replace function public.team_rename_board_group(p_group uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.team_board_groups;
begin
  select * into g from public.team_board_groups where id = p_group;
  if not found then raise exception 'project_not_found'; end if;
  perform public._team_project_require(g.project_id, 'edit');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  update public.team_board_groups set title = btrim(p_title) where id = p_group;
end $$;

-- Gövde 20261115120000'dakiyle aynı; tek fark: grupta 2'den az pano kalırsa grup çözülür.
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
  perform public._team_board_group_tidy(s.team_board_group_id);
end $$;

-- Sıra yalnız bir GRUBUN panoları arasındadır (liste grubun tüm panolarını kapsamalı değil, verilenler sıralanır).
create or replace function public.team_reorder_boards(p_project uuid, p_file uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); n integer; v_group uuid;
begin
  perform public._assert_can_act(true);
  if exists (select 1 from public.team_projects pr where pr.id = p_project and pr.archived_at is not null) then raise exception 'project_archived'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 40 then raise exception 'project_invalid'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then raise exception 'project_invalid'; end if;
  select s.team_board_group_id into v_group from public.spaces s where s.id = p_ids[1];
  if v_group is null then raise exception 'project_invalid'; end if;
  select count(*) into n from public.spaces s
   where s.id = any(p_ids) and s.team_project_id = p_project and s.team_file_id is not distinct from p_file and not s.team_area_main and s.team_board_group_id = v_group;
  if n <> cardinality(p_ids) then raise exception 'project_invalid'; end if;
  update public.spaces s set team_board_position = o.ord - 1 from unnest(p_ids) with ordinality as o(id, ord) where s.id = o.id;
end $$;

-- Taşı / kopyala: iki taraf da pano ise aynı grupta olmalı. Gövde 20261118100000'dakiyle aynı; tek fark o kural.
create or replace function public.team_transfer_items(p_from uuid, p_to uuid, p_ids uuid[], p_copy boolean default false, p_media jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid := public._team_area_project(p_from);
  v_role text;
  v_copy boolean := coalesce(p_copy, false);
  it public.space_items; c public.space_connections; pal public.space_palettes;
  v_new uuid; v_pal uuid; v_url text;
  v_old_ids uuid[] := '{}'; v_new_ids uuid[] := '{}'; v_moved uuid[] := '{}'; v_src_pal uuid[] := '{}';
  v_done integer := 0; v_skipped integer := 0; v_i integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_project is null or p_from = p_to or v_project is distinct from public._team_area_project(p_to) then raise exception 'project_invalid'; end if;
  -- İki taraf da pano ise aynı pano grubunda olmalı (bağımsız panolar birbirinden ayrıdır). Dosyanın kendi öğeleri (ana alan) ile pano arasındaki aktarım serbesttir.
  if exists (select 1 from public.spaces a, public.spaces b
              where a.id = p_from and b.id = p_to and not a.team_area_main and not b.team_area_main
                and (a.team_board_group_id is null or a.team_board_group_id is distinct from b.team_board_group_id)) then
    raise exception 'project_invalid';
  end if;
  v_role := public._team_project_role(v_project, v_uid);
  if v_role is null then raise exception 'project_not_found'; end if;
  if v_role not in ('edit', 'lead') then raise exception 'team_forbidden'; end if;
  perform public._assert_can_act(true);
  perform public._rate_limit('team_transfer_items', 120, interval '1 hour');
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then raise exception 'space_invalid'; end if;
  if exists (select 1 from public.team_projects pr where pr.id = v_project and pr.archived_at is not null) then raise exception 'project_archived'; end if;
  if jsonb_typeof(coalesce(p_media, '{}'::jsonb)) <> 'object' then raise exception 'space_invalid'; end if;

  for it in select * from public.space_items i where i.space_id = p_from and i.id = any(p_ids) order by i.z, i.created_at loop
    if not (it.rev_state = 'approved' or public._team_item_visible(it.space_id, it.rev_state, it.created_by)) then v_skipped := v_skipped + 1; continue; end if;
    if not v_copy then
      if it.locked then v_skipped := v_skipped + 1; continue; end if;
      if v_role <> 'lead' and it.kind not in ('frame', 'text', 'shape')
         and not (it.created_by is not distinct from v_uid and it.rev_state in ('draft', 'changes')) then
        v_skipped := v_skipped + 1; continue;
      end if;
    end if;
    v_new := gen_random_uuid();
    v_pal := null;
    if it.kind = 'palette' then
      select * into pal from public.space_palettes sp where sp.id = it.palette_id;
      insert into public.space_palettes (space_id, name, description, colors, source, position, created_by)
      values (p_to, pal.name, pal.description, pal.colors, 'manual', coalesce((select max(p2.position) + 1 from public.space_palettes p2 where p2.space_id = p_to), 0), v_uid)
      returning id into v_pal;
    end if;
    v_url := it.media_url;
    if it.kind = 'image' and v_url like '%/space-media/' || p_from::text || '/%' then
      v_url := nullif(p_media ->> it.media_url, '');
      if v_url is null then raise exception 'space_invalid'; end if;
    end if;
    begin
      insert into public.space_items (id, space_id, kind, x, y, w, h, z, prompt_id, media_url, media_width, media_height, is_draft, source_prompt_id,
                                      content_type, content_id, palette_id, title, body, note, color, is_private, data, created_by)
      values (v_new, p_to, it.kind, it.x, it.y, it.w, it.h, it.z, it.prompt_id, v_url, it.media_width, it.media_height, it.is_draft, it.source_prompt_id,
              it.content_type, it.content_id, v_pal, it.title, it.body, it.note, it.color, it.is_private, it.data, v_uid);
      v_old_ids := v_old_ids || it.id;
      v_new_ids := v_new_ids || v_new;
      v_done := v_done + 1;
      if not v_copy then
        v_moved := v_moved || it.id;
        if it.kind = 'palette' then v_src_pal := v_src_pal || it.palette_id; end if;
      end if;
    exception when unique_violation then
      if v_pal is not null then delete from public.space_palettes where id = v_pal; end if;
      v_skipped := v_skipped + 1;
    end;
  end loop;

  -- Eklenen notun bağlı olduğu öğe de taşındıysa bağ yeni öğeye kurulur.
  for it in select * from public.space_items i where i.id = any(v_old_ids) and i.attached_item_id is not null loop
    v_i := array_position(v_old_ids, it.attached_item_id);
    if v_i is not null then
      update public.space_items set attached_item_id = v_new_ids[v_i] where id = v_new_ids[array_position(v_old_ids, it.id)];
    end if;
  end loop;
  -- Uçları ikisi de aktarılan oklar.
  for c in select * from public.space_connections x where x.space_id = p_from and x.from_item_id = any(v_old_ids) and x.to_item_id = any(v_old_ids) loop
    begin
      insert into public.space_connections (space_id, from_item_id, to_item_id, label, line_style, arrow, route, color, created_by)
      values (p_to, v_new_ids[array_position(v_old_ids, c.from_item_id)], v_new_ids[array_position(v_old_ids, c.to_item_id)], c.label, c.line_style, c.arrow, c.route, c.color, v_uid);
    exception when unique_violation then null;
    end;
  end loop;

  if not v_copy and cardinality(v_moved) > 0 then
    perform set_config('promptly.team_review', '1', true);
    delete from public.space_items where id = any(v_moved);
    perform set_config('promptly.team_review', '', true);
    if cardinality(v_src_pal) > 0 then delete from public.space_palettes where id = any(v_src_pal); end if;
  end if;
  return jsonb_build_object('done', v_done, 'skipped', v_skipped, 'old_ids', to_jsonb(v_old_ids), 'new_ids', to_jsonb(v_new_ids));
end $$;

-- Proje ayrıntısı: `groups` + `areas`/`boards` içinde `group_id`. Gövde 20261118100000'dakiyle aynı; tek fark o alanlar.
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
    'boards', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'item_count', public._team_area_item_count(s.id), 'position', s.team_board_position, 'group_id', s.team_board_group_id) order by s.team_board_position, s.created_at)
                          from public.spaces s where s.team_project_id = p_project and not s.team_area_main), '[]'::jsonb),
    -- Pano grupları (docs/history/367-*): proje geneli ve her dosya için ana alan + ek panolar, sıralı; sayfa değiştirici ve genel bakış bunu okur.
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'is_main', s.team_area_main, 'position', s.team_board_position, 'group_id', s.team_board_group_id,
                         'item_count', public._team_area_item_count(s.id),
                         'updated_at', greatest(s.updated_at, coalesce((select max(i.updated_at) from public.space_items i where i.space_id = s.id), s.updated_at)),
                         'pending_count', case when v_role = 'lead' then public._team_area_item_count(s.id, 'pending') end,
                         'open_comments', (select count(*)::integer from public.space_pin_comments c
                                            where c.space_id = s.id and c.parent_id is null and c.resolved_at is null
                                              and (c.item_id is null or exists (select 1 from public.space_items ci where ci.id = c.item_id and (ci.rev_state = 'approved' or public._team_item_visible(ci.space_id, ci.rev_state, ci.created_by))))))
                       order by s.team_area_main desc, s.team_board_position, s.created_at)
                         from public.spaces s where s.team_project_id = p_project), '[]'::jsonb),
    -- Pano grupları (docs/history/368-*): birden çok panonun bir arada olduğu küme; bağımsız panolar grupsuzdur.
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'file_id', g.file_id,
                          'board_count', (select count(*)::integer from public.spaces s where s.team_board_group_id = g.id))
                          order by g.created_at) from public.team_board_groups g where g.project_id = p_project), '[]'::jsonb),
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

-- ============================================================================
-- 5. Yetkiler
-- ============================================================================
revoke execute on function public._team_board_group_tidy(uuid) from public, anon, authenticated;
revoke execute on function public.team_create_board_in_group(uuid, text), public.team_rename_board_group(uuid, text) from public, anon;
grant execute on function public.team_create_board_in_group(uuid, text), public.team_rename_board_group(uuid, text) to authenticated;
