-- ci:allow-destructive (yalnız `space_items_kind_check` CHECK'i GENİŞLETİLİR: drop constraint + aynı adla yeniden ekleme; veri silinmez)
-- Ekip panosu: pano grubu (sıra, taşı/kopyala), konumlu yorumlar, çizim öğeleri (docs/history/367-*). Ekleyicidir: hiçbir mevcut veri/işlev silinmez.
--
-- 1) `spaces.team_board_position`: ek panoların sırası. Her pano zaten ayrı alan (Space satırı) olduğundan öğeler panolar arasında karışmaz; yeni TABLO yok.
-- 2) `space_items.kind` genişler: frame (çerçeve), text (metin), shape (dikdörtgen/oval/çizgi/ok/serbest kalem) + `data jsonb`. Bu türler süs/anotasyondur:
--    onaya TABİ DEĞİLDİR (hep 'approved'), düzenleyici düzenler/siler ve "N öğe" sayısına girmez.
-- 3) `space_pin_comments`: panoda konumlu yorum (kök = pin, yanıt = parent_id). Yazma yalnız SECURITY DEFINER RPC; okuma RLS (ekip alanını okuyan + görünmeyen taslağa bağlı yorum gizli).
-- 4) RPC: team_reorder_boards, team_transfer_items (taşı/kopyala), pin_comment_*; team_create_board sıra yazar; team_project_get `areas` anahtarı ekler.

-- ============================================================================
-- 1. Pano sırası
-- ============================================================================
alter table public.spaces add column if not exists team_board_position integer not null default 0;

-- ============================================================================
-- 2. Yeni öğe türleri
-- ============================================================================
alter table public.space_items drop constraint if exists space_items_kind_check;
alter table public.space_items add constraint space_items_kind_check
  check (kind in ('image', 'prompt', 'note', 'palette', 'content', 'frame', 'text', 'shape'));
alter table public.space_items add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.space_items drop constraint if exists space_items_data_shape;
alter table public.space_items add constraint space_items_data_shape
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 24000
         and (kind <> 'shape' or coalesce(data ->> 'shape', '') in ('rect', 'oval', 'line', 'arrow', 'draw')));

-- "N öğe" yalnız içerik öğelerini sayar (çerçeve/metin/şekil süstür). Gövde 20261115120000'dakiyle aynı; tek fark `kind` süzgeci.
create or replace function public._team_area_item_count(p_space uuid, p_state text default null)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.space_items i
   where i.space_id = p_space
     and i.kind not in ('frame', 'text', 'shape')
     and (p_state is null or i.rev_state = p_state)
     and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))
$$;

-- Onay tetikleyicileri (gövde 20261115130000'dakiyle aynı; çerçeve/metin/şekil için istisna eklendi).
create or replace function public.space_items_area_review_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid();
begin
  select s.team_project_id into v_project from public.spaces s where s.id = new.space_id;
  new.rev_submitted_at := null; new.rev_submitted_by := null; new.rev_decided_at := null; new.rev_decided_by := null; new.rev_note := null;
  if v_project is null then
    new.rev_state := 'approved'; new.rev_unit := null;
    return new;
  end if;
  new.rev_unit := new.source_workflow_id;
  if new.kind in ('frame', 'text', 'shape') then new.rev_state := 'approved'; return new; end if;
  if v_uid is null then new.rev_state := 'approved'; return new; end if;
  new.rev_state := case when public._team_area_review_on(new.space_id) and public._team_project_role(v_project, v_uid) is distinct from 'lead' then 'draft' else 'approved' end;
  return new;
end $$;

create or replace function public.space_items_area_review_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid();
begin
  if (new.rev_state, new.rev_submitted_at, new.rev_submitted_by, new.rev_decided_at, new.rev_decided_by, new.rev_note, new.rev_unit)
     is distinct from (old.rev_state, old.rev_submitted_at, old.rev_submitted_by, old.rev_decided_at, old.rev_decided_by, old.rev_note, old.rev_unit)
     and not public._team_review_flag() then
    raise exception 'review_protected';
  end if;
  if public._team_review_flag() or v_uid is null then return new; end if;
  select s.team_project_id into v_project from public.spaces s where s.id = new.space_id;
  if v_project is null then return new; end if;
  if new.kind not in ('frame', 'text', 'shape')
     and (new.title, new.body, new.note) is distinct from (old.title, old.body, old.note)
     and old.rev_state in ('approved', 'pending')
     and public._team_project_role(v_project, v_uid) is distinct from 'lead' then
    raise exception 'review_content_locked';
  end if;
  return new;
end $$;

create or replace function public.space_items_area_review_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid();
begin
  if pg_trigger_depth() > 1 or v_uid is null or public._team_review_flag() or public._team_sync_on() then return old; end if;
  select s.team_project_id into v_project from public.spaces s where s.id = old.space_id;
  if v_project is null then return old; end if;
  if old.kind in ('frame', 'text', 'shape') then return old; end if;
  if public._team_project_role(v_project, v_uid) = 'lead' then return old; end if;
  if old.created_by is not distinct from v_uid and old.rev_state in ('draft', 'changes') then return old; end if;
  raise exception 'review_delete_forbidden';
end $$;

-- ============================================================================
-- 3. Konumlu yorumlar
-- ============================================================================
create table if not exists public.space_pin_comments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  parent_id uuid references public.space_pin_comments (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- Kök yorum (pin): dünya birimi konumu; öğeye bağlıysa öğenin sol üstüne göre ofset de saklanır (pin öğeyle birlikte gider).
  x real check (x is null or x between -100000 and 100000),
  y real check (y is null or y between -100000 and 100000),
  item_id uuid references public.space_items (id) on delete set null,
  off_x real,
  off_y real,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint space_pin_comments_shape check (
    (parent_id is null and x is not null and y is not null and (off_x is null) = (off_y is null))
    or (parent_id is not null and x is null and y is null and off_x is null and off_y is null and resolved_at is null))
);
create index if not exists space_pin_comments_space_idx on public.space_pin_comments (space_id, created_at);
create index if not exists space_pin_comments_parent_idx on public.space_pin_comments (parent_id) where parent_id is not null;
create index if not exists space_pin_comments_item_idx on public.space_pin_comments (item_id) where item_id is not null;
alter table public.space_pin_comments enable row level security;
revoke all on public.space_pin_comments from anon, authenticated;
grant select on public.space_pin_comments to authenticated;

drop policy if exists space_pin_comments_select on public.space_pin_comments;
create policy space_pin_comments_select on public.space_pin_comments for select to authenticated
  using (public.can_read_space(space_id) and exists (select 1 from public.spaces s where s.id = space_pin_comments.space_id and s.team_project_id is not null));
-- Görünmeyen (taslak) öğeye bağlı yorum da görünmez: alt sorgu çağıranın RLS'inden geçer. Yanıtlar öğe kimliğini kökten kopyalar.
drop policy if exists space_pin_comments_hide_hidden_item on public.space_pin_comments;
create policy space_pin_comments_hide_hidden_item on public.space_pin_comments as restrictive for select to authenticated
  using (item_id is null or exists (select 1 from public.space_items i where i.id = space_pin_comments.item_id));

-- Giriş: ekip alanı + projeyi gören herkes (görüntüleyici dahil) yorum yazar.
create or replace function public._pin_comment_require(p_space uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_project uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select s.team_project_id into v_project from public.spaces s where s.id = p_space;
  if v_project is null then raise exception 'space_not_found'; end if;
  if public._team_project_role(v_project, v_uid) is null then raise exception 'space_not_found'; end if;
  return v_uid;
end $$;

create or replace function public.pin_comment_create(
  p_space uuid, p_body text, p_x real default null, p_y real default null, p_item uuid default null,
  p_off_x real default null, p_off_y real default null, p_parent uuid default null, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._pin_comment_require(p_space);
  v_body text := btrim(coalesce(p_body, ''));
  s public.spaces; pr public.team_projects; par public.space_pin_comments; v_item public.space_items;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_actor text; v_href text; v_msg text; m record; v_rcp uuid; v_notified uuid[] := '{}';
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('pin_comment_create', 60, interval '1 hour');
  if char_length(v_body) not between 1 and 2000 then raise exception 'space_invalid'; end if;
  select * into s from public.spaces where id = p_space;
  select * into pr from public.team_projects where id = s.team_project_id;
  if pr.archived_at is not null or s.archived_at is not null then raise exception 'space_archived'; end if;
  if p_parent is not null then
    select * into par from public.space_pin_comments c where c.id = p_parent and c.space_id = p_space and c.parent_id is null;
    if not found then raise exception 'space_invalid'; end if;
    if par.item_id is not null and not exists (
         select 1 from public.space_items i where i.id = par.item_id and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))) then
      raise exception 'space_invalid';
    end if;
    if (select count(*) from public.space_pin_comments c where c.parent_id = p_parent) >= 200 then raise exception 'space_limit'; end if;
    p_x := null; p_y := null; p_item := par.item_id; p_off_x := null; p_off_y := null;
  else
    if p_x is null or p_y is null or abs(p_x) > 100000 or abs(p_y) > 100000 then raise exception 'space_invalid'; end if;
    if p_item is not null then
      select * into v_item from public.space_items i where i.id = p_item and i.space_id = p_space;
      if not found or not (v_item.rev_state = 'approved' or public._team_item_visible(v_item.space_id, v_item.rev_state, v_item.created_by)) then raise exception 'space_invalid'; end if;
      if p_off_x is null or p_off_y is null then raise exception 'space_invalid'; end if;
    else
      p_off_x := null; p_off_y := null;
    end if;
    if (select count(*) from public.space_pin_comments c where c.space_id = p_space and c.parent_id is null) >= 500 then raise exception 'space_limit'; end if;
  end if;
  insert into public.space_pin_comments (id, space_id, parent_id, author_id, body, x, y, item_id, off_x, off_y)
  values (v_id, p_space, p_parent, v_uid, v_body, p_x, p_y, p_item, p_off_x, p_off_y);

  -- Bildirimler: önce @bahsetme, sonra yanıt (kök yazara), sonra öğenin sahibi. Aynı kişiye tek bildirim.
  v_actor := public._team_actor_name(v_uid);
  v_href := '/teams/local?id=' || s.team_id || '&tab=projects&project=' || pr.id || '&board=' || p_space || '&sub=board&comment=' || coalesce(p_parent, v_id);
  for m in select distinct lower(x[1]) as uname from regexp_matches(v_body, '@([A-Za-z0-9_]{2,30})', 'g') as x loop
    select p.id into v_rcp from public.profiles p where lower(p.username) = m.uname;
    if v_rcp is not null and v_rcp <> v_uid and public._team_project_role(pr.id, v_rcp) is not null then
      perform public._team_notify(v_rcp, v_uid, s.team_id, 'direct', v_actor || ' panoda bir yorumda sizden bahsetti: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinm:' || v_id || ':' || v_rcp);
      v_notified := v_notified || v_rcp;
    end if;
  end loop;
  if p_parent is not null then
    if par.author_id is not null and par.author_id <> v_uid and not (par.author_id = any(v_notified)) then
      perform public._team_notify(par.author_id, v_uid, s.team_id, 'direct', v_actor || ' panodaki yorumunuzu yanıtladı: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinr:' || v_id || ':' || par.author_id);
    end if;
  elsif v_item.id is not null and v_item.created_by is not null and v_item.created_by <> v_uid and not (v_item.created_by = any(v_notified)) then
    perform public._team_notify(v_item.created_by, v_uid, s.team_id, 'direct', v_actor || ' panoda öğenize yorum yaptı: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinc:' || v_id || ':' || v_item.created_by);
  end if;
  return v_id;
end $$;

create or replace function public.pin_comment_update(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.space_pin_comments; v_uid uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into c from public.space_pin_comments where id = p_id;
  if not found then raise exception 'space_not_found'; end if;
  v_uid := public._pin_comment_require(c.space_id);
  if c.author_id is distinct from v_uid then raise exception 'space_forbidden'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'space_invalid'; end if;
  update public.space_pin_comments set body = v_body, edited_at = now() where id = p_id;
end $$;

create or replace function public.pin_comment_set_resolved(p_id uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.space_pin_comments; v_uid uuid; v_project uuid;
begin
  select * into c from public.space_pin_comments where id = p_id and parent_id is null;
  if not found then raise exception 'space_not_found'; end if;
  v_uid := public._pin_comment_require(c.space_id);
  select s.team_project_id into v_project from public.spaces s where s.id = c.space_id;
  if c.author_id is distinct from v_uid and public._team_project_role(v_project, v_uid) not in ('edit', 'lead') then raise exception 'space_forbidden'; end if;
  update public.space_pin_comments
     set resolved_at = case when coalesce(p_resolved, true) then now() else null end,
         resolved_by = case when coalesce(p_resolved, true) then v_uid else null end
   where id = p_id;
end $$;

create or replace function public.pin_comment_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.space_pin_comments; v_uid uuid; v_project uuid;
begin
  select * into c from public.space_pin_comments where id = p_id;
  if not found then raise exception 'space_not_found'; end if;
  v_uid := public._pin_comment_require(c.space_id);
  select s.team_project_id into v_project from public.spaces s where s.id = c.space_id;
  if c.author_id is distinct from v_uid and public._team_project_role(v_project, v_uid) <> 'lead' then raise exception 'space_forbidden'; end if;
  delete from public.space_pin_comments where id = p_id;
end $$;

-- ============================================================================
-- 4. Pano RPC'leri
-- ============================================================================
-- Gövde 20261115120000'dakiyle aynı; tek fark: yeni pano grubun sonuna sıralanır.
create or replace function public.team_create_board(p_project uuid, p_title text, p_file uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); pr public.team_projects; v_id uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_board_create', 60, interval '1 hour');
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'project_invalid'; end if;
  select * into pr from public.team_projects where id = p_project for update;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if p_file is not null and not exists (select 1 from public.team_files f where f.id = p_file and f.project_id = p_project) then raise exception 'project_not_found'; end if;
  if (select count(*) from public.spaces s where s.team_project_id = p_project and not s.team_area_main) >= 20 then raise exception 'team_board_limit'; end if;
  v_id := public._team_area_make(p_project, p_file, p_title, false, v_uid);
  update public.spaces set team_board_position = coalesce((select max(s2.team_board_position) + 1 from public.spaces s2
                                                           where s2.team_project_id = p_project and s2.team_file_id is not distinct from p_file and not s2.team_area_main and s2.id <> v_id), 0)
   where id = v_id;
  return v_id;
end $$;

-- Ek panoların sırası (ana pano hep ilk). Liste kapsamdaki (proje geneli ya da dosya) TÜM ek panoları içermeli.
create or replace function public.team_reorder_boards(p_project uuid, p_file uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_project_require(p_project, 'edit'); n integer;
begin
  perform public._assert_can_act(true);
  if exists (select 1 from public.team_projects pr where pr.id = p_project and pr.archived_at is not null) then raise exception 'project_archived'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 40 then raise exception 'project_invalid'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then raise exception 'project_invalid'; end if;
  select count(*) into n from public.spaces s
   where s.id = any(p_ids) and s.team_project_id = p_project and s.team_file_id is not distinct from p_file and not s.team_area_main;
  if n <> cardinality(p_ids) then raise exception 'project_invalid'; end if;
  update public.spaces s set team_board_position = o.ord - 1 from unnest(p_ids) with ordinality as o(id, ord) where s.id = o.id;
end $$;

-- Öğeleri başka panoya taşı / kopyala. Görsel dosyaları istemcide hedef klasöre kopyalanır; `p_media` eski kimlik URL'si → yeni URL eşlemesidir (hedef klasöre ait olmalı:
-- `space_items_before_write` doğrular). Taşıma = kopya + kaynağı silme (öğeler yeni kimlik alır; kaynaktaki yorumlar serbest pin olarak kalır).
-- Taşıma kuralı onay tasarımını izler: lider her şeyi, düzenleyici yalnız kendi taslağını/değişiklik istenenini ve çizim öğelerini taşır; kopyalamak serbesttir.
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

-- ============================================================================
-- 5. Proje ayrıntısı: `areas` (pano grupları) + `boards` sıralı. Gövde 20261115120000'dakiyle aynı; tek fark `boards` sırası ve yeni `areas` anahtarı.
-- ============================================================================
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
    'boards', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'item_count', public._team_area_item_count(s.id), 'position', s.team_board_position) order by s.team_board_position, s.created_at)
                          from public.spaces s where s.team_project_id = p_project and not s.team_area_main), '[]'::jsonb),
    -- Pano grupları (docs/history/367-*): proje geneli ve her dosya için ana alan + ek panolar, sıralı; sayfa değiştirici ve genel bakış bunu okur.
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'is_main', s.team_area_main, 'position', s.team_board_position,
                         'item_count', public._team_area_item_count(s.id),
                         'updated_at', greatest(s.updated_at, coalesce((select max(i.updated_at) from public.space_items i where i.space_id = s.id), s.updated_at)),
                         'pending_count', case when v_role = 'lead' then public._team_area_item_count(s.id, 'pending') end,
                         'open_comments', (select count(*)::integer from public.space_pin_comments c
                                            where c.space_id = s.id and c.parent_id is null and c.resolved_at is null
                                              and (c.item_id is null or exists (select 1 from public.space_items ci where ci.id = c.item_id and (ci.rev_state = 'approved' or public._team_item_visible(ci.space_id, ci.rev_state, ci.created_by))))))
                       order by s.team_area_main desc, s.team_board_position, s.created_at)
                         from public.spaces s where s.team_project_id = p_project), '[]'::jsonb),
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
-- 6. Yetkiler
-- ============================================================================
revoke execute on function public._pin_comment_require(uuid) from public, anon, authenticated;
revoke execute on function
  public.pin_comment_create(uuid, text, real, real, uuid, real, real, uuid, uuid), public.pin_comment_update(uuid, text),
  public.pin_comment_set_resolved(uuid, boolean), public.pin_comment_delete(uuid),
  public.team_reorder_boards(uuid, uuid, uuid[]), public.team_transfer_items(uuid, uuid, uuid[], boolean, jsonb)
  from public, anon;
grant execute on function
  public.pin_comment_create(uuid, text, real, real, uuid, real, real, uuid, uuid), public.pin_comment_update(uuid, text),
  public.pin_comment_set_resolved(uuid, boolean), public.pin_comment_delete(uuid),
  public.team_reorder_boards(uuid, uuid, uuid[]), public.team_transfer_items(uuid, uuid, uuid[], boolean, jsonb)
  to authenticated;
