-- ci:allow-destructive (yalnız `space_items_*` CHECK'i eklenir; `team_transfer_items`/`team_project_get`/onay işlevleri create or replace ile yeniden yazılır; dönüşüm hiçbir satırı silmez, yalnız palet satırının `space_id`'sini ana alana taşır)
-- Ekip dosyası ⇄ pano: DOSYA asıl, PANO yansıma (docs/history/376-*). Ekleyicidir.
--
-- Model: bir dosyanın içeriği ("asıl öğe") dosyanın ANA ALANINDA durur (`spaces.team_area_main`). Bir panodaki öğe, asıl öğenin yansımasıdır
-- (`space_items.file_item_id` dolu): içerik sütunları asıl öğeden gelir ve ona yazılır; konum, boyut, renk, grup, kilit, oklar ve konumlu
-- yorumlar pano satırında kalır. Böylece pano motoru (konum, ok, yorum, taslak gizleme, RLS) DEĞİŞMEDEN çalışır.
--   * Panoya doğrudan eklenen içerik öğesi kendiliğinden dosyaya da girer (aynı içerik dosyada varsa o kullanılır).
--   * Panodan kaldırmak yalnız yansımayı siler; dosyadan silmek asıl öğeyi ve tüm yansımalarını siler.
--   * Onay durumu asıl öğededir; yansımalar kopyalar ve onay RPC'leri yansıma kimliği verilse bile asıl öğeye uygulanır.
--   * Çizim nesneleri (çerçeve/metin/şekil) ve bir öğeye iliştirilmiş notlar yalnız o panonun nesnesidir (dosya içeriği sayılmaz).
--   * Paletler dosyanın ana alanında yaşar (panoya eklenen palet satırı ana alana yönlenir); yansımalar aynı palete başvurur.

-- ============================================================================
-- 1. Sütun, indeksler
-- ============================================================================
alter table public.space_items add column if not exists file_item_id uuid references public.space_items (id) on delete cascade;
create index if not exists space_items_file_item_idx on public.space_items (file_item_id) where file_item_id is not null;
-- Aynı asıl öğe aynı panoda bir kez.
create unique index if not exists space_items_file_item_uniq on public.space_items (space_id, file_item_id) where file_item_id is not null;
create index if not exists space_items_content_ref_idx on public.space_items (content_id) where content_id is not null;
alter table public.space_items drop constraint if exists space_items_file_item_shape;
alter table public.space_items add constraint space_items_file_item_shape
  check (file_item_id is null or (file_item_id <> id and kind in ('image', 'prompt', 'note', 'palette', 'content')));
-- Storage yolundan okunur: bir dosyaya başvuran satırın görünürlüğü dosyanın okunabilirliğini de belirler (yansıma/asıl öğe farklı klasördeyse).
create index if not exists space_items_media_path_idx
  on public.space_items ((substring(media_url from '/storage/v1/object/public/space-media/([^?#]+)'))) where media_url is not null;

-- ============================================================================
-- 2. Yardımcılar
-- ============================================================================
-- Dosyanın ana alanı.
create or replace function public._team_file_main_area(p_file uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from public.spaces s where s.team_file_id = p_file and s.team_area_main limit 1
$$;

-- Aynı ekip projesinin iki alanı mı (ya da aynı alan)?
create or replace function public._space_same_project(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_a = p_b or exists (select 1 from public.spaces a join public.spaces b on b.team_project_id = a.team_project_id
                               where a.id = p_a and b.id = p_b and a.team_project_id is not null)
$$;

-- Görsel adresi: kendi klasörü YA DA aynı projenin başka alanının klasörü (asıl öğe ana alanda, görsel panoya yüklenmiş olabilir).
create or replace function public._space_valid_item_media(p_space uuid, p_url text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_folder uuid;
begin
  if public._space_valid_upload_url(p_space, p_url) then return true; end if;
  if p_url is null or char_length(p_url) > 500 then return false; end if;
  v_folder := nullif(substring(p_url from '^https?://[^/]+/storage/v1/object/public/space-media/([0-9a-f-]{36})/[0-9a-f-]{36}\.(?:jpg|png|webp)$'), '')::uuid;
  return v_folder is not null and public._space_same_project(p_space, v_folder);
end $$;
grant execute on function public._space_same_project(uuid, uuid), public._space_valid_item_media(uuid, text) to authenticated;
revoke execute on function public._team_file_main_area(uuid) from public, anon, authenticated;

-- Panoya ya da dosyaya konabilen içerik türleri.
create or replace function public._team_file_kind(p_kind text, p_attached uuid)
returns boolean language sql immutable set search_path = public as $$
  select p_kind in ('image', 'prompt', 'note', 'palette', 'content') and not (p_kind = 'note' and p_attached is not null)
$$;
revoke execute on function public._team_file_kind(text, uuid) from public, anon, authenticated;

-- ============================================================================
-- 3. Paletler dosyanın ana alanında yaşar
-- ============================================================================
create or replace function public.space_palettes_file_main()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.spaces; v_main uuid;
begin
  select * into s from public.spaces where id = new.space_id;
  if s.team_project_id is not null and s.team_file_id is not null and not s.team_area_main then
    v_main := public._team_file_main_area(s.team_file_id);
    if v_main is not null then new.space_id := v_main; end if;
  end if;
  return new;
end $$;
drop trigger if exists aa_space_palettes_file_main on public.space_palettes;
create trigger aa_space_palettes_file_main before insert on public.space_palettes for each row execute function public.space_palettes_file_main();
revoke execute on function public.space_palettes_file_main() from public, anon, authenticated;

-- ============================================================================
-- 4. Öğe doğrulaması (gövde 20261118100000'dakiyle aynı; üç fark: görsel adresi ve palet aynı projenin başka alanından olabilir,
--    dönüşümde alan öğe sınırı atlanır)
-- ============================================================================
create or replace function public.space_items_before_write()
returns trigger language plpgsql set search_path = public as $$
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
       or (new.created_by is distinct from old.created_by and new.created_by is not null and coalesce(current_setting('promptly.team_sync', true), '') <> '1')
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
    if coalesce(current_setting('promptly.team_backfill', true), '') <> '1'
       and (select count(*) from public.space_items i where i.space_id = new.space_id) >= 500 then
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
           where pm.prompt_id = new.prompt_id and pm.url = new.media_url and p.community_id is null
        ) then
          raise exception 'space_source_unavailable';
        end if;
      elsif not public._space_valid_item_media(new.space_id, new.media_url) then
        raise exception 'space_invalid';
      end if;
    elsif new.media_url is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'prompt' then
      if new.is_draft then
        if new.prompt_id is not null then raise exception 'space_invalid'; end if;
        if new.source_prompt_id is not null
           and not exists (select 1 from public.prompts p where p.id = new.source_prompt_id and p.community_id is null) then
          raise exception 'space_source_unavailable';
        end if;
      elsif new.prompt_id is null
         or not exists (select 1 from public.prompts p where p.id = new.prompt_id and p.community_id is null) then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.kind <> 'image' and (new.prompt_id is not null or new.is_draft or new.source_prompt_id is not null) then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'content' then
      v_readable := case new.content_type
        when 'request' then exists (select 1 from public.prompt_requests r where r.id = new.content_id and r.community_id is null)
        when 'workflow' then exists (select 1 from public.workflows w where w.id = new.content_id and w.community_id is null)
        when 'preset' then exists (select 1 from public.presets s where s.id = new.content_id and s.community_id is null)
        else false end;
      if not v_readable then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.content_type is not null or new.content_id is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'palette' then
      if new.palette_id is null
         or not exists (select 1 from public.space_palettes sp where sp.id = new.palette_id and public._space_same_project(sp.space_id, new.space_id)) then
        raise exception 'space_invalid';
      end if;
    elsif new.palette_id is not null then
      raise exception 'space_invalid';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 5. Bağlama: panoya eklenen öğe dosyaya da girer; yansıma içeriği asıl öğeden alır
-- ============================================================================
-- BEFORE INSERT. (a) Ekibe özgü içeriğe yalnız AYNI projenin alanları başvurabilir (içerik kişisel Space'e/başka projeye sızmasın);
-- (b) dosyalı bir panoya, asıl öğesi verilmeden eklenen içerik öğesi için asıl öğe ana alanda bulunur (aynı içerik varsa o) ya da açılır;
-- (c) yansıma satırı içerik sütunlarını asıl öğeden alır (yazan ne verirse versin).
create or replace function public.space_items_file_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.spaces;
  v_main uuid;
  v_scope uuid;
  v_canon uuid;
  c public.space_items;
  v_uid uuid := auth.uid();
begin
  select * into s from public.spaces where id = new.space_id;

  -- (a) ekibe özgü içerik başvurusu
  v_scope := coalesce(
    (select p.team_file_id from public.prompts p where p.id = new.prompt_id),
    (select p.team_file_id from public.prompts p where p.id = new.source_prompt_id),
    case new.content_type
      when 'request' then (select r.team_file_id from public.prompt_requests r where r.id = new.content_id)
      when 'workflow' then (select w.team_file_id from public.workflows w where w.id = new.content_id)
      when 'preset' then (select x.team_file_id from public.presets x where x.id = new.content_id)
    end);
  if v_scope is not null and s.team_project_id is distinct from public.team_file_project(v_scope) then
    raise exception 'space_source_unavailable';
  end if;

  if s.team_project_id is null or s.team_file_id is null or s.team_area_main or not public._team_file_kind(new.kind, new.attached_item_id) then
    return new;
  end if;
  v_main := public._team_file_main_area(s.team_file_id);
  if v_main is null then return new; end if;

  -- (b) asıl öğeyi bul / aç
  if new.file_item_id is null then
    select i.id into v_canon from public.space_items i
     where i.space_id = v_main and i.file_item_id is null and i.kind = new.kind
       and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))
       and ((new.kind = 'prompt' and not new.is_draft and new.prompt_id is not null and not i.is_draft and i.prompt_id = new.prompt_id)
            or (new.kind = 'content' and i.content_type = new.content_type and i.content_id = new.content_id)
            or (new.kind = 'image' and i.media_url = new.media_url)
            or (new.kind = 'palette' and i.palette_id = new.palette_id)
            or (new.source_workflow_id is not null and i.source_workflow_id = new.source_workflow_id
                and i.source_role is not distinct from new.source_role and i.source_step_id is not distinct from new.source_step_id
                and i.source_step_no is not distinct from new.source_step_no))
     order by i.created_at limit 1;
    if v_canon is null then
      new.created_by := coalesce(new.created_by, v_uid);
      insert into public.space_items (space_id, kind, x, y, w, h, z, prompt_id, media_url, media_width, media_height, is_draft, source_prompt_id,
                                      content_type, content_id, palette_id, title, body, note, color, is_private, created_by,
                                      source_workflow_id, source_step_id, source_role, source_step_no)
      values (v_main, new.kind, new.x, new.y, new.w, new.h, new.z, new.prompt_id, new.media_url, new.media_width, new.media_height, new.is_draft,
              new.source_prompt_id, new.content_type, new.content_id, new.palette_id, new.title, new.body, new.note, new.color, new.is_private,
              new.created_by, new.source_workflow_id, new.source_step_id, new.source_role, new.source_step_no)
      returning id into v_canon;
    end if;
    new.file_item_id := v_canon;
  end if;

  -- (c) içeriği asıl öğeden al
  select * into c from public.space_items where id = new.file_item_id;
  if not found or c.file_item_id is not null or c.space_id is distinct from v_main
     or (v_uid is not null and not (c.rev_state = 'approved' or public._team_item_visible(c.space_id, c.rev_state, c.created_by))) then
    raise exception 'space_invalid';
  end if;
  new.kind := c.kind;
  new.prompt_id := c.prompt_id; new.media_url := c.media_url; new.media_width := c.media_width; new.media_height := c.media_height;
  new.is_draft := c.is_draft; new.source_prompt_id := c.source_prompt_id; new.content_type := c.content_type; new.content_id := c.content_id;
  new.palette_id := c.palette_id; new.title := c.title; new.body := c.body; new.note := c.note; new.is_private := c.is_private;
  new.source_workflow_id := c.source_workflow_id; new.source_step_id := c.source_step_id; new.source_role := c.source_role; new.source_step_no := c.source_step_no;
  new.created_by := c.created_by;
  return new;
end $$;
drop trigger if exists aa_space_items_file_link on public.space_items;
create trigger aa_space_items_file_link before insert on public.space_items for each row execute function public.space_items_file_link();

-- ============================================================================
-- 6. Onay tetikleyicileri (gövdeler 20261118100000 / 20261115130000'dakilerle aynı; farklar yorumlu)
-- ============================================================================
create or replace function public.space_items_area_review_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid(); c public.space_items;
begin
  select s.team_project_id into v_project from public.spaces s where s.id = new.space_id;
  new.rev_submitted_at := null; new.rev_submitted_by := null; new.rev_decided_at := null; new.rev_decided_by := null; new.rev_note := null;
  if v_project is null then
    new.rev_state := 'approved'; new.rev_unit := null;
    return new;
  end if;
  -- Yansıma: durumu asıl öğeden kopyalar (yansımanın kendi başına bir onay yaşamı yoktur).
  if new.file_item_id is not null then
    select * into c from public.space_items where id = new.file_item_id;
    new.rev_state := c.rev_state; new.rev_unit := c.rev_unit;
    new.rev_submitted_at := c.rev_submitted_at; new.rev_submitted_by := c.rev_submitted_by;
    new.rev_decided_at := c.rev_decided_at; new.rev_decided_by := c.rev_decided_by; new.rev_note := c.rev_note;
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
  -- Asıl öğeden yansımalara yayılan yazım (yalnız `space_items_file_fanout` kurar).
  if coalesce(current_setting('promptly.team_item_sync', true), '') = '1' then return new; end if;
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
  -- Yansımayı (panodan kaldırmayı) onay kuralı bağlamaz: yalnız yerleşimi siler, içerik dosyada kalır.
  if old.file_item_id is not null then return old; end if;
  if public._team_project_role(v_project, v_uid) = 'lead' then return old; end if;
  if old.created_by is not distinct from v_uid and old.rev_state in ('draft', 'changes') then return old; end if;
  raise exception 'review_delete_forbidden';
end $$;

-- Nesne kilidi yerleşimi kilitler; asıl öğeden yayılan içerik yazımı onu bozmaz.
create or replace function public.space_items_lock_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_skip text[] := array['locked', 'updated_at', 'updated_by', 'approved_at', 'approved_by', 'review_requested_at', 'review_requested_by',
                         'deprecated_at', 'deprecated_by', 'content_rev', 'use_count', 'works_yes', 'works_no',
                         'rev_state', 'rev_submitted_at', 'rev_submitted_by', 'rev_decided_at', 'rev_decided_by', 'rev_note', 'rev_unit'];
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() <= 1 then raise exception 'space_item_locked'; end if;
    return old;
  end if;
  if coalesce(current_setting('promptly.team_item_sync', true), '') = '1' then return new; end if;
  if old.locked and (to_jsonb(new) - v_skip) is distinct from (to_jsonb(old) - v_skip) then
    raise exception 'space_item_locked';
  end if;
  return new;
end $$;

-- ============================================================================
-- 7. Eşitleme: yansıma → asıl öğe (içerik yazımı) ve asıl öğe → yansımalar (içerik + onay)
-- ============================================================================
create or replace function public.space_items_mirror_forward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.file_item_id is null or coalesce(current_setting('promptly.team_item_sync', true), '') = '1' then return new; end if;
  if (new.title, new.body, new.note, new.is_private) is distinct from (old.title, old.body, old.note, old.is_private) then
    perform set_config('promptly.team_item_origin', new.id::text, true);
    -- Asıl öğenin kendi tetikleyicileri onay kilidini çağıranın rolüyle uygular; diğer yansımalara yayma onun işidir.
    update public.space_items set title = new.title, body = new.body, note = new.note, is_private = new.is_private where id = new.file_item_id;
    perform set_config('promptly.team_item_origin', '', true);
  end if;
  return new;
end $$;
drop trigger if exists aa_space_items_mirror_forward on public.space_items;
create trigger aa_space_items_mirror_forward before update on public.space_items for each row execute function public.space_items_mirror_forward();

create or replace function public.space_items_file_fanout()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev text := coalesce(current_setting('promptly.team_item_sync', true), '');
begin
  if new.file_item_id is not null then return null; end if;
  if (new.title, new.body, new.note, new.is_private, new.rev_state, new.rev_submitted_at, new.rev_submitted_by, new.rev_decided_at, new.rev_decided_by, new.rev_note, new.rev_unit, new.updated_by)
     is not distinct from
     (old.title, old.body, old.note, old.is_private, old.rev_state, old.rev_submitted_at, old.rev_submitted_by, old.rev_decided_at, old.rev_decided_by, old.rev_note, old.rev_unit, old.updated_by) then
    return null;
  end if;
  perform set_config('promptly.team_item_sync', '1', true);
  update public.space_items m
     set title = new.title, body = new.body, note = new.note, is_private = new.is_private,
         rev_state = new.rev_state, rev_submitted_at = new.rev_submitted_at, rev_submitted_by = new.rev_submitted_by,
         rev_decided_at = new.rev_decided_at, rev_decided_by = new.rev_decided_by, rev_note = new.rev_note, rev_unit = new.rev_unit,
         updated_at = new.updated_at, updated_by = new.updated_by
   where m.file_item_id = new.id
     and m.id is distinct from nullif(current_setting('promptly.team_item_origin', true), '')::uuid;
  perform set_config('promptly.team_item_sync', v_prev, true);
  return null;
end $$;
drop trigger if exists zz_space_items_file_fanout on public.space_items;
create trigger zz_space_items_file_fanout after update on public.space_items for each row execute function public.space_items_file_fanout();

-- Asıl dosya öğesi silinince ekibe özgü içeriği de gider (yansımalar FK ile kaskadlanır). İçerik silme zincirinde bayrak kurulur (çift silme olmasın).
create or replace function public.space_items_file_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.file_item_id is not null or coalesce(current_setting('promptly.team_content_cascade', true), '') = '1' then return null; end if;
  if old.kind = 'prompt' and not old.is_draft and old.prompt_id is not null then
    perform set_config('promptly.team_content_cascade', '1', true);
    delete from public.prompts where id = old.prompt_id and team_file_id is not null;
    perform set_config('promptly.team_content_cascade', '', true);
  elsif old.kind = 'content' and old.content_id is not null then
    perform set_config('promptly.team_content_cascade', '1', true);
    if old.content_type = 'request' then delete from public.prompt_requests where id = old.content_id and team_file_id is not null;
    elsif old.content_type = 'workflow' then delete from public.workflows where id = old.content_id and team_file_id is not null;
    elsif old.content_type = 'preset' then delete from public.presets where id = old.content_id and team_file_id is not null;
    end if;
    perform set_config('promptly.team_content_cascade', '', true);
  end if;
  return null;
end $$;
drop trigger if exists zz_space_items_file_after_delete on public.space_items;
create trigger zz_space_items_file_after_delete after delete on public.space_items for each row execute function public.space_items_file_after_delete();

-- ============================================================================
-- 8. Ekibe özgü içeriğin okunması asıl dosya öğesinin görünürlüğünü izler (taslak öğenin içeriği üyelere sızmasın)
-- ============================================================================
create or replace function public.team_content_item_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(bool_and(i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by)), false)
    from public.space_items i
   where i.file_item_id is null and ((i.kind = 'prompt' and i.prompt_id = p_id) or (i.kind = 'content' and i.content_id = p_id))
$$;
revoke execute on function public.team_content_item_visible(uuid) from public, anon;
grant execute on function public.team_content_item_visible(uuid) to authenticated;

drop policy if exists prompts_team_content_read on public.prompts;
create policy prompts_team_content_read on public.prompts for select to authenticated
  using (team_file_id is not null and status = 'published' and public.team_can_read_content(team_file_id) and public.team_content_item_visible(id));
drop policy if exists prompt_requests_team_content_read on public.prompt_requests;
create policy prompt_requests_team_content_read on public.prompt_requests for select to authenticated
  using (team_file_id is not null and not is_draft and public.team_can_read_content(team_file_id) and public.team_content_item_visible(id));
drop policy if exists workflows_team_content_read on public.workflows;
create policy workflows_team_content_read on public.workflows for select to authenticated
  using (team_file_id is not null and status = 'published' and public.team_can_read_content(team_file_id) and public.team_content_item_visible(id));
drop policy if exists presets_team_content_read on public.presets;
create policy presets_team_content_read on public.presets for select to authenticated
  using (team_file_id is not null and status = 'published' and public.team_can_read_content(team_file_id) and public.team_content_item_visible(id));

-- ============================================================================
-- 9. Storage: dosya, kendisine başvuran okunabilir satırla da okunur (görsel panoya yüklenip pano silinse bile asıl öğe okur)
-- ============================================================================
create or replace function public._space_media_item_readable(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.space_items i
     where substring(i.media_url from '/storage/v1/object/public/space-media/([^?#]+)') = p_name
       and public.can_read_space(i.space_id)
       and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by)))
$$;
grant execute on function public._space_media_item_readable(text) to anon, authenticated;

drop policy if exists "Space media is readable while its referencing item is" on storage.objects;
create policy "Space media is readable while its referencing item is" on storage.objects for select
  using (bucket_id = 'space-media' and public._space_media_item_readable(name));

-- Taslak gizleme: görsel, kendisine başvuran HİÇBİR görünür satır yokken (yalnız görünmeyen taslaklar başvuruyorsa) gizlenir.
create or replace function public._team_media_hidden(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_space uuid := public._space_media_space_id(p_name);
begin
  if v_space is null then return false; end if;
  if not exists (select 1 from public.space_items i join public.spaces s on s.id = i.space_id
                  where s.team_project_id is not null and i.rev_state <> 'approved'
                    and substring(i.media_url from '/storage/v1/object/public/space-media/([^?#]+)') = p_name
                    and not public._team_item_visible(i.space_id, i.rev_state, i.created_by)) then
    return false;
  end if;
  return not exists (select 1 from public.space_items i
                      where substring(i.media_url from '/storage/v1/object/public/space-media/([^?#]+)') = p_name
                        and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by)));
end $$;
grant execute on function public._team_media_hidden(text) to anon, authenticated;

-- ============================================================================
-- 10. Onay işlevleri yansıma kimliğini asıl öğeye çevirir; kuyruk/sayımlar yansımaları saymaz
-- ============================================================================
create or replace function public._team_review_targets(p_ids uuid[], p_mode text, p_uid uuid)
returns setof public.space_items language plpgsql stable security definer set search_path = public as $$
declare i public.space_items; v_project uuid; v_role text; v_ids uuid[];
begin
  select coalesce(array_agg(distinct coalesce(x.file_item_id, x.id)), '{}') into v_ids from public.space_items x where x.id = any (coalesce(p_ids, '{}'));
  for i in select * from public.space_items where id = any (v_ids) loop
    v_project := public._team_area_project(i.space_id);
    if v_project is null then raise exception 'project_not_found'; end if;
    v_role := public._team_project_role(v_project, p_uid);
    if v_role is null then raise exception 'project_not_found'; end if;
    if p_mode = 'lead' and v_role <> 'lead' then raise exception 'team_forbidden'; end if;
    if p_mode = 'author' and not (v_role = 'lead' or (v_role = 'edit' and i.created_by = p_uid)) then raise exception 'team_forbidden'; end if;
  end loop;
  return query
    select x.* from public.space_items x
     where x.file_item_id is null
       and (x.id = any (v_ids)
            or (x.rev_unit is not null and exists (select 1 from public.space_items y where y.id = any (v_ids) and y.space_id = x.space_id and y.rev_unit = x.rev_unit)));
end $$;

-- Lider kuyruğu: yalnız asıl öğeler. Ekibe özgü içeriğin güncel başlığı/metni öğenin yerine içerik satırından okunur.
create or replace function public.team_review_pending(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_project_require(p_project, 'lead');
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'kind', i.kind,
               'title', coalesce(nullif(i.title, ''), tp.title, ''), 'body', left(coalesce(nullif(i.body, ''), tp.prompt_text, ''), 600), 'note', i.note,
               'media_url', i.media_url, 'content_type', i.content_type,
               'content_id', i.content_id, 'color', i.color, 'is_draft', i.is_draft,
               'space_id', i.space_id, 'area_title', s.title, 'file_id', s.team_file_id, 'file_title', f.title, 'is_main', s.team_area_main,
               'author_id', i.created_by, 'author_name', coalesce(nullif(p.display_name, ''), p.username), 'author_username', p.username,
               'submitted_at', i.rev_submitted_at, 'unit', i.rev_unit,
               'unit_count', case when i.rev_unit is null then 1 else (select count(*) from public.space_items y where y.space_id = i.space_id and y.rev_unit = i.rev_unit and y.rev_state = 'pending') end)
             order by i.rev_submitted_at desc, i.id)
        from public.space_items i
        join public.spaces s on s.id = i.space_id and s.team_project_id = p_project
        left join public.team_files f on f.id = s.team_file_id
        left join public.profiles p on p.id = i.created_by
        left join public.prompts tp on tp.id = i.prompt_id and tp.team_file_id is not null and i.kind = 'prompt'
       where i.rev_state = 'pending' and i.file_item_id is null), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', pp.item_id, 'kind', i.kind, 'space_id', pp.space_id, 'file_id', s.team_file_id, 'file_title', f.title,
               'current', jsonb_build_object('title', coalesce(nullif(i.title, ''), tp.title, ''), 'body', left(coalesce(nullif(i.body, ''), tp.prompt_text, ''), 600), 'note', i.note),
               'proposed', jsonb_build_object('title', pp.title, 'body', left(pp.body, 600), 'note', pp.note),
               'proposer_id', pp.proposed_by, 'proposer_name', coalesce(nullif(p.display_name, ''), p.username), 'proposed_at', pp.proposed_at)
             order by pp.proposed_at desc)
        from public.space_item_proposals pp
        join public.space_items i on i.id = pp.item_id
        join public.spaces s on s.id = pp.space_id and s.team_project_id = p_project
        left join public.team_files f on f.id = s.team_file_id
        left join public.profiles p on p.id = pp.proposed_by
        left join public.prompts tp on tp.id = i.prompt_id and tp.team_file_id is not null and i.kind = 'prompt'
       where pp.state = 'pending'), '[]'::jsonb));
end $$;

create or replace function public.team_project_todos()
returns table (team_id uuid, team_name text, team_slug text, project_id uuid, project_title text, kind text, n integer, href text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r record; v_n integer; v_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  for r in select p.id as pid, p.title as ptitle, t.id as tid, t.name as tname, t.slug as tslug
             from public.team_projects p join public.teams t on t.id = p.team_id
            where p.archived_at is null and public._team_project_role(p.id, v_uid) is not null order by t.name, p.created_at loop
    if public._team_project_role(r.pid, v_uid) = 'lead' then
      select count(*)::integer, max(i.rev_submitted_at) into v_n, v_at
        from public.space_items i join public.spaces s on s.id = i.space_id
       where s.team_project_id = r.pid and i.rev_state = 'pending' and i.file_item_id is null;
      v_n := v_n + (select count(*)::integer from public.space_item_proposals pp join public.spaces s on s.id = pp.space_id where s.team_project_id = r.pid and pp.state = 'pending');
      if v_n > 0 then
        return query select r.tid, r.tname, r.tslug, r.pid, r.ptitle, 'review'::text, v_n, '/teams/local?id=' || r.tid || '&tab=projects&project=' || r.pid || '&review=1', coalesce(v_at, now());
      end if;
    end if;
    select count(*)::integer, max(i.rev_decided_at) into v_n, v_at
      from public.space_items i join public.spaces s on s.id = i.space_id
     where s.team_project_id = r.pid and i.rev_state = 'changes' and i.created_by = v_uid and i.file_item_id is null;
    if v_n > 0 then
      return query select r.tid, r.tname, r.tslug, r.pid, r.ptitle, 'changes'::text, v_n, '/teams/local?id=' || r.tid || '&tab=projects&project=' || r.pid, coalesce(v_at, now());
    end if;
  end loop;
end $$;

-- Öneri kararı: ekibe özgü prompt öğesinde öneri öğenin değil PROMPT SATIRININ başlık/metnine uygulanır.
create or replace function public.team_review_decide_proposal(p_item uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  pp public.space_item_proposals;
  it public.space_items;
  v_project uuid;
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into pp from public.space_item_proposals where item_id = p_item for update;
  v_project := public._team_area_project(pp.space_id);
  if not found or v_project is null then raise exception 'project_not_found'; end if;
  perform public._team_project_require(v_project, 'lead');
  if coalesce(p_decision, '') not in ('approve', 'changes') or char_length(v_note) > 500 or (p_decision = 'changes' and v_note = '') then raise exception 'project_invalid'; end if;
  select * into it from public.space_items where id = p_item;
  select team_id into v_team from public.team_projects where id = v_project;
  if p_decision = 'approve' then
    perform set_config('promptly.team_review', '1', true);
    if it.kind = 'prompt' and not it.is_draft and exists (select 1 from public.prompts p where p.id = it.prompt_id and p.team_file_id is not null) then
      update public.prompts set title = left(coalesce(nullif(btrim(pp.title), ''), title), 200), prompt_text = coalesce(nullif(pp.body, ''), prompt_text), updated_at = now()
       where id = it.prompt_id and team_file_id is not null;
      update public.space_items set note = pp.note, updated_by = pp.proposed_by where id = p_item;
    else
      update public.space_items set title = pp.title, body = pp.body, note = pp.note, updated_by = pp.proposed_by where id = p_item;
    end if;
    perform set_config('promptly.team_review', '', true);
    delete from public.space_item_proposals where item_id = p_item;
  else
    update public.space_item_proposals set state = 'changes', decision_note = v_note, decided_by = v_uid, decided_at = now() where item_id = p_item;
  end if;
  perform public._team_notify(pp.proposed_by, v_uid, v_team, 'direct',
    case when p_decision = 'approve' then 'Önerdiğin değişiklik onaylandı.' else public._team_actor_name(v_uid) || ' önerin için değişiklik istedi: ' || public.truncate_preview(v_note, 80) end,
    '/teams/local?id=' || v_team || '&tab=projects&project=' || v_project,
    'revpropdec:' || p_item || ':' || p_decision || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  perform public._team_audit(v_team, 'approval', case when p_decision = 'approve' then 'proposal_approved' else 'proposal_changes' end, (select title from public.team_projects where id = v_project));
end $$;

-- ============================================================================
-- 11. RPC'ler
-- ============================================================================
-- Dosyadaki öğeleri panoya yerleştir (yansıma kur). Aynı öğe aynı panoda zaten varsa atlanır. p_x/p_y: yerleşimin sol-üst köşesi (dünya birimi).
create or replace function public.team_board_place_items(p_board uuid, p_items uuid[], p_x real default null, p_y real default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.spaces;
  v_uid uuid;
  v_main uuid;
  c public.space_items;
  v_id uuid;
  v_new uuid;
  v_ids uuid[] := '{}';
  v_placed integer := 0;
  v_skipped integer := 0;
  v_i integer := 0;
  v_z integer;
  v_bx real := coalesce(p_x, 0);
  v_by real := coalesce(p_y, 0);
begin
  select * into s from public.spaces where id = p_board;
  if not found or s.team_project_id is null or s.team_area_main or s.team_file_id is null then raise exception 'project_invalid'; end if;
  v_uid := public._team_project_require(s.team_project_id, 'edit');
  perform public._assert_can_act(true);
  perform public._rate_limit('team_board_place', 120, interval '1 hour');
  if exists (select 1 from public.team_projects pr where pr.id = s.team_project_id and pr.archived_at is not null) then raise exception 'project_archived'; end if;
  if p_items is null or cardinality(p_items) not between 1 and 200 then raise exception 'space_invalid'; end if;
  v_main := public._team_file_main_area(s.team_file_id);
  select coalesce(max(z), 0) into v_z from public.space_items where space_id = p_board;
  foreach v_id in array p_items loop
    select i.* into c from public.space_items i where i.id = coalesce((select m.file_item_id from public.space_items m where m.id = v_id), v_id) and i.file_item_id is null;
    if not found or c.space_id is distinct from v_main or not public._team_file_kind(c.kind, c.attached_item_id)
       or not (c.rev_state = 'approved' or public._team_item_visible(c.space_id, c.rev_state, c.created_by))
       or exists (select 1 from public.space_items m where m.space_id = p_board and m.file_item_id = c.id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_z := v_z + 1;
    insert into public.space_items (space_id, kind, x, y, w, h, z, file_item_id, color, created_by)
    values (p_board, c.kind, v_bx + (v_i % 4) * (c.w + 24), v_by + (v_i / 4) * (c.h + 24), c.w, c.h, v_z, c.id, c.color, c.created_by)
    returning id into v_new;
    v_ids := v_ids || v_new;
    v_placed := v_placed + 1;
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('placed', v_placed, 'skipped', v_skipped, 'ids', to_jsonb(v_ids));
end $$;

-- Dosyadan sil: asıl öğe (ve tüm yansımaları) silinir. Yansıma kimliği verilse bile asıl öğe silinir. Onay kuralı çağıranın rolüyle işler
-- (lider her şeyi, ekleyen yalnız kendi taslağını siler). Çizim nesnesi (asılsız) kendi satırı silinir.
create or replace function public.team_item_delete(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.space_items; v_project uuid; v_uid uuid;
begin
  select * into i from public.space_items where id = p_item;
  v_project := public._team_area_project(i.space_id);
  if not found or v_project is null then raise exception 'project_not_found'; end if;
  v_uid := public._team_project_require(v_project, 'edit');
  perform public._assert_can_act(true);
  perform public._rate_limit('team_item_delete', 200, interval '1 hour');
  if exists (select 1 from public.team_projects pr where pr.id = v_project and pr.archived_at is not null) then raise exception 'project_archived'; end if;
  delete from public.space_items where id = coalesce(i.file_item_id, i.id);
end $$;

-- Mevcut bir içeriği dosyaya (ve istenirse panoya) ekle: yayınlanmış herkese açık içerik (başvuru) YA DA bu dosyaya özgü yayınlanmış içerik.
-- Yazar (ekibe özgü içerik) ya da düzenleyici (başvuru) çağırır; durum sunucuda belirlenir. Aynı içerik dosyada varsa o kullanılır.
create or replace function public.team_attach_content(p_file uuid, p_type text, p_id uuid, p_board uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.team_files;
  v_uid uuid;
  v_main uuid;
  v_team_file uuid;
  v_ok boolean := false;
  v_canon uuid;
  v_existing boolean := false;
  v_mirror uuid;
  b public.spaces;
begin
  select * into f from public.team_files where id = p_file;
  if not found then raise exception 'project_not_found'; end if;
  v_uid := public._team_project_require(f.project_id, 'edit');
  perform public._assert_can_act(true);
  perform public._rate_limit('team_attach_content', 200, interval '1 hour');
  if f.archived_at is not null or exists (select 1 from public.team_projects pr where pr.id = f.project_id and pr.archived_at is not null) then raise exception 'project_archived'; end if;
  if coalesce(p_type, '') not in ('prompt', 'request', 'workflow', 'preset') then raise exception 'project_invalid'; end if;
  v_main := public._team_file_main_area(p_file);
  if v_main is null then raise exception 'project_not_found'; end if;

  if p_type = 'prompt' then
    select p.team_file_id, (p.status = 'published' and p.community_id is null and (p.team_file_id = p_file or (p.team_file_id is null and p.visibility = 'public')))
      into v_team_file, v_ok from public.prompts p where p.id = p_id;
  elsif p_type = 'request' then
    select r.team_file_id, (not r.is_draft and r.community_id is null and (r.team_file_id = p_file or (r.team_file_id is null and r.visibility = 'public')))
      into v_team_file, v_ok from public.prompt_requests r where r.id = p_id;
  elsif p_type = 'workflow' then
    select w.team_file_id, (w.status = 'published' and w.community_id is null and (w.team_file_id = p_file or (w.team_file_id is null and w.visibility = 'public')))
      into v_team_file, v_ok from public.workflows w where w.id = p_id;
  else
    select x.team_file_id, (x.status = 'published' and x.community_id is null and (x.team_file_id = p_file or (x.team_file_id is null and x.visibility = 'public')))
      into v_team_file, v_ok from public.presets x where x.id = p_id;
  end if;
  if not coalesce(v_ok, false) then raise exception 'space_source_unavailable'; end if;

  if p_board is not null then
    select * into b from public.spaces where id = p_board;
    if not found or b.team_file_id is distinct from p_file or b.team_area_main or b.team_project_id is distinct from f.project_id then raise exception 'project_invalid'; end if;
  end if;

  select i.id into v_canon from public.space_items i
   where i.space_id = v_main and i.file_item_id is null
     and ((p_type = 'prompt' and i.kind = 'prompt' and not i.is_draft and i.prompt_id = p_id)
          or (p_type <> 'prompt' and i.kind = 'content' and i.content_type = p_type and i.content_id = p_id))
     and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))
   limit 1;
  v_existing := v_canon is not null;
  if v_canon is null then
    if p_type = 'prompt' then
      insert into public.space_items (space_id, kind, prompt_id, created_by) values (v_main, 'prompt', p_id, v_uid) returning id into v_canon;
    else
      insert into public.space_items (space_id, kind, content_type, content_id, created_by, w, h) values (v_main, 'content', p_type, p_id, v_uid, 280, 160) returning id into v_canon;
    end if;
  end if;
  if p_board is not null then
    select m.id into v_mirror from public.space_items m where m.space_id = p_board and m.file_item_id = v_canon;
    if v_mirror is null then
      insert into public.space_items (space_id, kind, file_item_id, w, h, created_by)
      select p_board, i.kind, i.id, i.w, i.h, i.created_by from public.space_items i where i.id = v_canon
      returning id into v_mirror;
    end if;
  end if;
  return jsonb_build_object('item_id', v_canon, 'board_item_id', v_mirror, 'existing', v_existing);
end $$;

-- Ekibe özgü içeriğin yeri: içerik sayfası (/prompts/local?id= …) ekip dosyasındaki öğeye yönlendirmek için. Yalnız projeyi görebilen çağıran, görünür asıl öğe için dolu döner.
create or replace function public.team_content_location(p_type text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_file uuid; v_project uuid; v_item uuid; v_team uuid;
begin
  if auth.uid() is null then return null; end if;
  v_file := case p_type
    when 'prompt' then (select x.team_file_id from public.prompts x where x.id = p_id)
    when 'request' then (select x.team_file_id from public.prompt_requests x where x.id = p_id)
    when 'workflow' then (select x.team_file_id from public.workflows x where x.id = p_id)
    when 'preset' then (select x.team_file_id from public.presets x where x.id = p_id)
  end;
  if v_file is null then return null; end if;
  v_project := public.team_file_project(v_file);
  if v_project is null or public._team_project_role(v_project, auth.uid()) is null then return null; end if;
  select i.id into v_item from public.space_items i
   where i.file_item_id is null and ((p_type = 'prompt' and i.kind = 'prompt' and i.prompt_id = p_id)
                                     or (p_type <> 'prompt' and i.kind = 'content' and i.content_type = p_type and i.content_id = p_id))
     and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))
   limit 1;
  select pr.team_id into v_team from public.team_projects pr where pr.id = v_project;
  return jsonb_build_object('team_id', v_team, 'project_id', v_project, 'file_id', v_file, 'item_id', v_item);
end $$;

-- Eski taşı/kopyala (uyumluluk; yeni istemci kullanmaz): yansımalar yerleşim olarak taşınır/kopyalanır, asıl içerik hiç çoğalmaz.
-- Asıl öğeler (ana alandan) panoya yalnız yerleştirilir (taşı = yerleştir). Çizim nesneleri eskisi gibi kopyalanır/taşınır.
create or replace function public.team_transfer_items(p_from uuid, p_to uuid, p_ids uuid[], p_copy boolean default false, p_media jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid := public._team_area_project(p_from);
  v_role text;
  v_copy boolean := coalesce(p_copy, false);
  sf public.spaces; st public.spaces;
  it public.space_items; c public.space_connections;
  v_new uuid;
  v_old_ids uuid[] := '{}'; v_new_ids uuid[] := '{}'; v_moved uuid[] := '{}';
  v_done integer := 0; v_skipped integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_project is null or p_from = p_to or v_project is distinct from public._team_area_project(p_to) then raise exception 'project_invalid'; end if;
  select * into sf from public.spaces where id = p_from;
  select * into st from public.spaces where id = p_to;
  if st.team_area_main or st.team_file_id is distinct from sf.team_file_id then raise exception 'project_invalid'; end if;
  v_role := public._team_project_role(v_project, v_uid);
  if v_role is null then raise exception 'project_not_found'; end if;
  if v_role not in ('edit', 'lead') then raise exception 'team_forbidden'; end if;
  perform public._assert_can_act(true);
  perform public._rate_limit('team_transfer_items', 120, interval '1 hour');
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then raise exception 'space_invalid'; end if;
  if exists (select 1 from public.team_projects pr where pr.id = v_project and pr.archived_at is not null) then raise exception 'project_archived'; end if;

  for it in select * from public.space_items i where i.space_id = p_from and i.id = any(p_ids) order by i.z, i.created_at loop
    if not (it.rev_state = 'approved' or public._team_item_visible(it.space_id, it.rev_state, it.created_by)) then v_skipped := v_skipped + 1; continue; end if;
    begin
      if it.kind in ('frame', 'text', 'shape') then
        -- Çizim nesnesi yalnız panoya aittir: kopyalanır / taşınır.
        insert into public.space_items (space_id, kind, x, y, w, h, z, title, body, color, data, created_by)
        values (p_to, it.kind, it.x, it.y, it.w, it.h, it.z, it.title, it.body, it.color, it.data, v_uid) returning id into v_new;
        if not v_copy then v_moved := v_moved || it.id; end if;
      elsif sf.team_area_main and public._team_file_kind(it.kind, it.attached_item_id) then
        -- Dosyanın asıl öğesi → pano: yerleştir (asıl öğe yerinde kalır).
        insert into public.space_items (space_id, kind, x, y, w, h, z, file_item_id, color, created_by)
        values (p_to, it.kind, it.x, it.y, it.w, it.h, it.z, it.id, it.color, it.created_by) returning id into v_new;
      elsif it.file_item_id is not null then
        -- Yansıma → başka pano: yerleşim taşınır/kopyalanır.
        insert into public.space_items (space_id, kind, x, y, w, h, z, file_item_id, color, group_id, created_by)
        values (p_to, it.kind, it.x, it.y, it.w, it.h, it.z, it.file_item_id, it.color, null, it.created_by) returning id into v_new;
        if not v_copy then v_moved := v_moved || it.id; end if;
      else
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_old_ids := v_old_ids || it.id;
      v_new_ids := v_new_ids || v_new;
      v_done := v_done + 1;
    exception when unique_violation then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  for c in select * from public.space_connections x where x.space_id = p_from and x.from_item_id = any(v_old_ids) and x.to_item_id = any(v_old_ids) loop
    begin
      insert into public.space_connections (space_id, from_item_id, to_item_id, label, line_style, arrow, route, color, created_by)
      values (p_to, v_new_ids[array_position(v_old_ids, c.from_item_id)], v_new_ids[array_position(v_old_ids, c.to_item_id)], c.label, c.line_style, c.arrow, c.route, c.color, v_uid);
    exception when unique_violation then null;
    end;
  end loop;

  if not v_copy and cardinality(v_moved) > 0 then
    delete from public.space_items where id = any(v_moved);
  end if;
  return jsonb_build_object('done', v_done, 'skipped', v_skipped, 'old_ids', to_jsonb(v_old_ids), 'new_ids', to_jsonb(v_new_ids));
end $$;

-- ============================================================================
-- 12. Proje özeti: dosya sayıları yalnız ASIL öğelerdir (yansımalar panonun sayısıdır, dosyaya ikinci kez eklenmez)
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
    'channel_id', (select tc.id from public.team_channels tc where tc.project_id = p_project and tc.project_main),
    'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_project_id = p_project and s.team_file_id is null),
    'pending_count', case when v_role = 'lead' then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s
                                                      where s.team_project_id = p_project and (s.team_area_main or s.team_file_id is null)) end,
    'files', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', f.id, 'title', f.title, 'position', f.position, 'review_required', f.review_required,
                         'main_area_id', (select s.id from public.spaces s where s.team_file_id = f.id and s.team_area_main),
                         'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_file_id = f.id and s.team_area_main),
                         'board_count', (select count(*)::integer from public.spaces s where s.team_file_id = f.id and not s.team_area_main),
                         'pending_count', case when v_role = 'lead' then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_file_id = f.id and s.team_area_main) end)
                       order by f.position, f.created_at)
                       from public.team_files f where f.project_id = p_project and f.archived_at is null), '[]'::jsonb),
    'boards', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'item_count', public._team_area_item_count(s.id), 'position', s.team_board_position, 'group_id', s.team_board_group_id) order by s.team_board_position, s.created_at)
                          from public.spaces s where s.team_project_id = p_project and not s.team_area_main), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'is_main', s.team_area_main, 'position', s.team_board_position, 'group_id', s.team_board_group_id,
                         'item_count', public._team_area_item_count(s.id),
                         'updated_at', greatest(s.updated_at, coalesce((select max(i.updated_at) from public.space_items i where i.space_id = s.id), s.updated_at)),
                         'pending_count', case when v_role = 'lead' and (s.team_area_main or s.team_file_id is null) then public._team_area_item_count(s.id, 'pending') end,
                         'open_comments', (select count(*)::integer from public.space_pin_comments c
                                            where c.space_id = s.id and c.parent_id is null and c.resolved_at is null
                                              and (c.item_id is null or exists (select 1 from public.space_items ci where ci.id = c.item_id and (ci.rev_state = 'approved' or public._team_item_visible(ci.space_id, ci.rev_state, ci.created_by))))))
                       order by s.team_area_main desc, s.team_board_position, s.created_at)
                         from public.spaces s where s.team_project_id = p_project), '[]'::jsonb),
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
-- 13. Dönüşüm: mevcut pano öğelerine asıl öğe aç (idempotent; hiçbir satır silinmez)
-- ============================================================================
-- Dosyalı her panonun içerik öğesi için dosyanın ana alanında asıl öğe açılır ve bağlanır. Aynı değişmez kimlik (yayınlanmış prompt, içerik başvurusu,
-- görsel adresi, workflow adım kaynağı) + AYNI başlık/metin/not + AYNI onay durumu olan öğeler tek asıl öğeyi paylaşır; diğerleri ayrı asıl öğe alır.
-- Paletler ana alana taşınır (yalnız `space_palettes.space_id`). Onay durumu, ekleyen ve zaman damgaları asıl öğeye aynen geçer.
create or replace function public._team_backfill_file_items()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_main uuid;
  v_canon uuid;
  v_n integer := 0;
begin
  perform set_config('promptly.team_item_sync', '1', true);
  perform set_config('promptly.team_review', '1', true);
  perform set_config('promptly.team_sync', '1', true);
  perform set_config('promptly.team_backfill', '1', true);
  for r in
    select i.*, s.team_file_id as fid
      from public.space_items i join public.spaces s on s.id = i.space_id
     where s.team_project_id is not null and s.team_file_id is not null and not s.team_area_main
       and i.file_item_id is null and public._team_file_kind(i.kind, i.attached_item_id)
     order by i.created_at, i.id
  loop
    v_main := public._team_file_main_area(r.fid);
    if v_main is null then continue; end if;
    if r.kind = 'palette' then
      update public.space_palettes set space_id = v_main where id = r.palette_id and space_id is distinct from v_main;
    end if;
    select x.id into v_canon from public.space_items x
     where x.space_id = v_main and x.file_item_id is null and x.kind = r.kind
       and x.rev_state = r.rev_state and x.title = r.title and x.body = r.body and x.note = r.note
       and ((r.kind = 'prompt' and not r.is_draft and r.prompt_id is not null and not x.is_draft and x.prompt_id = r.prompt_id)
            or (r.kind = 'content' and x.content_type = r.content_type and x.content_id = r.content_id)
            or (r.kind = 'image' and x.media_url = r.media_url)
            or (r.kind = 'palette' and x.palette_id = r.palette_id)
            or (r.source_workflow_id is not null and x.source_workflow_id = r.source_workflow_id
                and x.source_role is not distinct from r.source_role and x.source_step_id is not distinct from r.source_step_id
                and x.source_step_no is not distinct from r.source_step_no))
     order by x.created_at limit 1;
    if v_canon is null then
      insert into public.space_items (space_id, kind, x, y, w, h, z, prompt_id, media_url, media_width, media_height, is_draft, source_prompt_id,
                                      content_type, content_id, palette_id, title, body, note, color, is_private, created_by,
                                      source_workflow_id, source_step_id, source_role, source_step_no)
      values (v_main, r.kind, r.x, r.y, r.w, r.h, r.z, r.prompt_id, r.media_url, r.media_width, r.media_height, r.is_draft, r.source_prompt_id,
              r.content_type, r.content_id, r.palette_id, r.title, r.body, r.note, r.color, r.is_private, r.created_by,
              r.source_workflow_id, r.source_step_id, r.source_role, r.source_step_no)
      returning id into v_canon;
      update public.space_items set rev_state = r.rev_state, rev_submitted_at = r.rev_submitted_at, rev_submitted_by = r.rev_submitted_by,
                                    rev_decided_at = r.rev_decided_at, rev_decided_by = r.rev_decided_by, rev_note = r.rev_note, rev_unit = r.rev_unit
       where id = v_canon;
    end if;
    update public.space_items set file_item_id = v_canon where id = r.id;
    v_n := v_n + 1;
  end loop;
  perform set_config('promptly.team_item_sync', '', true);
  perform set_config('promptly.team_review', '', true);
  perform set_config('promptly.team_sync', '', true);
  perform set_config('promptly.team_backfill', '', true);
  return v_n;
end $$;
revoke execute on function public._team_backfill_file_items() from public, anon, authenticated;
select public._team_backfill_file_items();


-- ============================================================================
-- 14. Yetkiler
-- ============================================================================
revoke execute on function public.space_items_file_link(), public.space_items_mirror_forward(), public.space_items_file_fanout(),
  public.space_items_file_after_delete(), public.space_items_area_review_insert(), public.space_items_area_review_update(),
  public.space_items_area_review_delete(), public._team_review_targets(uuid[], text, uuid) from public, anon, authenticated;
revoke execute on function public.team_board_place_items(uuid, uuid[], real, real), public.team_item_delete(uuid), public.team_attach_content(uuid, text, uuid, uuid),
  public.team_transfer_items(uuid, uuid, uuid[], boolean, jsonb), public.team_project_get(uuid), public.team_review_pending(uuid),
  public.team_project_todos(), public.team_review_decide_proposal(uuid, text, text), public.team_content_location(text, uuid) from public, anon;
grant execute on function public.team_board_place_items(uuid, uuid[], real, real), public.team_item_delete(uuid), public.team_attach_content(uuid, text, uuid, uuid),
  public.team_transfer_items(uuid, uuid, uuid[], boolean, jsonb), public.team_project_get(uuid), public.team_review_pending(uuid),
  public.team_project_todos(), public.team_review_decide_proposal(uuid, text, text), public.team_content_location(text, uuid) to authenticated;
