-- Kişisel API / MCP genişletmesi (docs/history/321-*): kimlik bilgisi, İstek / Hazır ayar / Workflow okuma ve TASLAK güncelleme. Edge Function, işlemde
-- `set local role authenticated` + `request.jwt.claims` kurduktan sonra bu RPC'leri çağırır (api_me_*, 315-*). Hepsi SECURITY INVOKER: çağıranın RLS'i,
-- askı/paylaşım engeli (`*_enforce_can_edit`) ve hız sınırı geçerlidir; burada yeni bir yetki YOKTUR.
--
-- Yalnızca ekleyicidir (expand): yeni fonksiyonlar. Mevcut `api_me_profile()` olduğu gibi kalır (dağıtılmış Edge Function onu çağırır).
-- Yazma kuralları (kullanıcı kararı, 2026-11-02): yalnız ÖZEL TASLAK güncellenir; yayınlanmış içerik, topluluğa özgü içerik ve silinmiş içerik reddedilir;
-- YAYINLAMA ve SİLME yoktur; çakışma koruması zorunludur (`p_expected_updated_at` kayıttaki `updated_at` ile milisaniyede eşleşmeli, yoksa `conflict`).
-- Hata durumları `raise` ile değil `{ok:false, code, field?}` ile döner: böylece Edge Function nedeni ayırt eder; BÜTÜN doğrulama yazmadan ÖNCE yapılır
-- (fonksiyon hata dönse de işlem geri alınmaz — kısmi yazma olmamalı).

create or replace function public.api_me_whoami()
returns table (user_id uuid, username text, display_name text, avatar_url text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url from public.profiles p where p.id = auth.uid();
$$;

-- --- Okuma: listeler (keyset; çağıran limit+1 ister, en çok 51 satır) ---------------------------------------------------------------------------------------
create or replace function public.api_me_requests(
  p_limit integer default 20, p_after_created_at timestamptz default null, p_after_id uuid default null, p_status text default null)
returns table (id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select r.id, r.title, left(coalesce(r.description, ''), 300), r.content_type,
         case when r.is_draft then 'draft' else 'published' end, r.visibility, r.created_at, r.updated_at
  from public.prompt_requests r
  where r.author_id = auth.uid() and r.community_id is null and r.deleted_at is null
    and (p_status is null or p_status = case when r.is_draft then 'draft' else 'published' end)
    and (p_after_created_at is null or (r.created_at, r.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

create or replace function public.api_me_presets(
  p_limit integer default 20, p_after_created_at timestamptz default null, p_after_id uuid default null, p_status text default null)
returns table (id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select s.id, s.title, left(coalesce(s.description, ''), 300), s.content_type, s.status, s.visibility, s.created_at, s.updated_at
  from public.presets s
  where s.creator_id = auth.uid() and s.community_id is null
    and (p_status is null or s.status = p_status)
    and (p_after_created_at is null or (s.created_at, s.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

create or replace function public.api_me_workflows(
  p_limit integer default 20, p_after_created_at timestamptz default null, p_after_id uuid default null, p_status text default null)
returns table (id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select w.id, w.title, left(coalesce(w.description, ''), 300), coalesce(array_to_string(w.content_types, ','), ''), w.status, w.visibility, w.created_at, w.updated_at
  from public.workflows w
  where w.creator_id = auth.uid() and w.community_id is null
    and (p_status is null or w.status = p_status)
    and (p_after_created_at is null or (w.created_at, w.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$$;

-- --- Okuma: ayrıntı (jsonb; kayıt yoksa/benim değilse/topluluğa özgüyse satır dönmez). `updatedAt` milisaniyeli ISO: güncellemede çakışma belirteci. ---
create or replace function public.api_me_request(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'title', r.title, 'description', r.description, 'creativeDirection', coalesce(r.creative_direction, ''),
    'contentType', r.content_type, 'category', r.category, 'subcategory', r.subcategory,
    'tools', to_jsonb(coalesce(r.tools, '{}'::text[])),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.prompt_request_tags t where t.request_id = r.id), '[]'::jsonb),
    'status', case when r.is_draft then 'draft' else 'published' end, 'visibility', r.visibility, 'requestStatus', r.status,
    'createdAt', to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(r.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from public.prompt_requests r
  where r.id = p_id and r.author_id = auth.uid() and r.community_id is null and r.deleted_at is null;
$$;

create or replace function public.api_me_preset(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'title', s.title, 'description', s.description, 'contentType', s.content_type, 'category', s.category, 'subcategory', s.subcategory,
    'tools', to_jsonb(coalesce(s.tools, '{}'::text[])),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.preset_tags t where t.preset_id = s.id), '[]'::jsonb),
    'selection', coalesce(s.selection, '{}'::jsonb),
    'status', s.status, 'visibility', s.visibility,
    'createdAt', to_char(s.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(s.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from public.presets s
  where s.id = p_id and s.creator_id = auth.uid() and s.community_id is null;
$$;

create or replace function public.api_me_workflow(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', w.id, 'title', w.title, 'description', w.description, 'contentTypes', to_jsonb(coalesce(w.content_types, '{}'::text[])),
    'category', w.category, 'subcategory', w.subcategory, 'tools', to_jsonb(coalesce(w.tools, '{}'::text[])),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.workflow_tags t where t.workflow_id = w.id), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('position', q.n, 'title', q.title, 'description', q.description, 'instructions', q.instructions,
                                          'promptId', q.prompt_id, 'inputs', coalesce(q.inputs, '[]'::jsonb), 'outputs', coalesce(q.outputs, '[]'::jsonb)) order by q.n)
      from (select ws.title, ws.description, ws.instructions, ws.prompt_id, ws.inputs, ws.outputs,
                   row_number() over (order by ws.position, ws.created_at, ws.id) as n
            from public.workflow_steps ws where ws.workflow_id = w.id) q), '[]'::jsonb),
    'status', w.status, 'visibility', w.visibility,
    'createdAt', to_char(w.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(w.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from public.workflows w
  where w.id = p_id and w.creator_id = auth.uid() and w.community_id is null;
$$;

-- --- Güncelleme (YALNIZ özel taslak) -------------------------------------------------------------------------------------------------------------------------
create or replace function public._api_me_err(p_code text, p_field text default null)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('ok', false, 'code', p_code, 'field', p_field));
$$;

create or replace function public.api_me_update_draft(p_kind text, p_id uuid, p_patch jsonb, p_expected_updated_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed text[];
  v_key text;
  v_p public.prompts%rowtype;
  v_r public.prompt_requests%rowtype;
  v_s public.presets%rowtype;
  v_w public.workflows%rowtype;
  v_current timestamptz;
  v_type text;
  v_cat text;
  v_sub text;
  v_in jsonb;
  v_common jsonb;
  v_has_common boolean;
  v_set_cat boolean;
  v_title text;
  v_desc text;
  v_text text;
  v_dir text;
  v_selection jsonb;
  v_changed text[] := '{}';
  v_tag text;
  v_slug text;
  v_edit jsonb;
  v_pos integer;
  v_n integer;
  v_seen integer[] := '{}';
  v_tools text[];
  v_updated timestamptz;
  v_max integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('prompt', 'request', 'preset', 'workflow') then raise exception 'unsupported_kind'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then return public._api_me_err('invalid_patch'); end if;
  if p_expected_updated_at is null then return public._api_me_err('expected_required', 'expectedUpdatedAt'); end if;

  v_allowed := case p_kind
    when 'prompt' then array['title', 'description', 'promptText', 'contentType', 'category', 'subcategory', 'tools', 'tags']
    when 'request' then array['title', 'description', 'creativeDirection', 'contentType', 'category', 'subcategory', 'tools', 'tags']
    when 'preset' then array['title', 'description', 'contentType', 'category', 'subcategory', 'tools', 'tags', 'selection']
    else array['title', 'description', 'category', 'subcategory', 'tools', 'tags', 'stepEdits'] end;
  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if not (v_key = any (v_allowed)) then return public._api_me_err('unknown_field', v_key); end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_patch)) = 0 then return public._api_me_err('no_changes'); end if;

  -- === 1. Kaydı kilitle: benim, topluluğa özgü değil, silinmemiş, TASLAK; çakışma denetimi ====================================================
  if p_kind = 'prompt' then
    select * into v_p from public.prompts where id = p_id and author_id = v_uid and community_id is null and deleted_at is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
    v_current := v_p.updated_at; v_type := v_p.content_type; v_cat := v_p.category; v_sub := v_p.subcategory;
  elsif p_kind = 'request' then
    select * into v_r from public.prompt_requests where id = p_id and author_id = v_uid and community_id is null and deleted_at is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if not v_r.is_draft then return public._api_me_err('not_draft'); end if;
    v_current := v_r.updated_at; v_type := v_r.content_type; v_cat := v_r.category; v_sub := v_r.subcategory;
  elsif p_kind = 'preset' then
    select * into v_s from public.presets where id = p_id and creator_id = v_uid and community_id is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if v_s.status <> 'draft' then return public._api_me_err('not_draft'); end if;
    v_current := v_s.updated_at; v_type := v_s.content_type; v_cat := v_s.category; v_sub := v_s.subcategory;
  else
    select * into v_w from public.workflows where id = p_id and creator_id = v_uid and community_id is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if v_w.status <> 'draft' then return public._api_me_err('not_draft'); end if;
    v_current := v_w.updated_at; v_type := coalesce(v_w.content_types[1], 'text'); v_cat := v_w.category; v_sub := v_w.subcategory;
  end if;

  if date_trunc('milliseconds', v_current) <> date_trunc('milliseconds', p_expected_updated_at) then
    return jsonb_build_object('ok', false, 'code', 'conflict', 'currentUpdatedAt', to_char(v_current at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- === 2. Doğrulama (hiçbir satır yazılmaz) ==========================================================================================================
  if p_patch ? 'title' then
    v_title := case when jsonb_typeof(p_patch -> 'title') = 'string' then btrim(p_patch ->> 'title', E' \t\r\n') else '' end;
    if v_title = '' then return public._api_me_err('required', 'title'); end if;
    v_max := case when p_kind in ('preset', 'workflow') then 120 else 200 end;
    if char_length(v_title) > v_max then return public._api_me_err('too_long', 'title'); end if;
    v_changed := v_changed || 'title'::text;
  end if;

  if p_patch ? 'description' then
    if jsonb_typeof(p_patch -> 'description') <> 'string' then return public._api_me_err('invalid', 'description'); end if;
    v_desc := btrim(p_patch ->> 'description', E' \t\r\n');
    if p_kind = 'request' and v_desc = '' then return public._api_me_err('required', 'description'); end if;
    v_max := case when p_kind in ('preset', 'workflow') then 1000 else 5000 end;
    if char_length(v_desc) > v_max then return public._api_me_err('too_long', 'description'); end if;
    v_changed := v_changed || 'description'::text;
  end if;

  if p_kind = 'prompt' and p_patch ? 'promptText' then
    v_text := case when jsonb_typeof(p_patch -> 'promptText') = 'string' then btrim(p_patch ->> 'promptText', E' \t\r\n') else '' end;
    if v_text = '' then return public._api_me_err('required', 'promptText'); end if;
    if char_length(v_text) > 50000 then return public._api_me_err('too_long', 'promptText'); end if;
    v_changed := v_changed || 'promptText'::text;
  end if;

  if p_kind = 'request' and p_patch ? 'creativeDirection' then
    if jsonb_typeof(p_patch -> 'creativeDirection') <> 'string' then return public._api_me_err('invalid', 'creativeDirection'); end if;
    v_dir := btrim(p_patch ->> 'creativeDirection', E' \t\r\n');
    if char_length(v_dir) > 5000 then return public._api_me_err('too_long', 'creativeDirection'); end if;
    v_changed := v_changed || 'creativeDirection'::text;
  end if;

  if p_kind <> 'workflow' and p_patch ? 'contentType' then
    if jsonb_typeof(p_patch -> 'contentType') <> 'string' or lower(btrim(p_patch ->> 'contentType')) not in ('image', 'text', 'audio', 'video') then
      return public._api_me_err('invalid_content_type', 'contentType');
    end if;
    v_type := lower(btrim(p_patch ->> 'contentType'));
    v_changed := v_changed || 'contentType'::text;
  end if;

  if p_kind = 'preset' and p_patch ? 'selection' then
    v_selection := p_patch -> 'selection';
    if jsonb_typeof(v_selection) <> 'object' then return public._api_me_err('invalid_selection', 'selection'); end if;
    if char_length(v_selection::text) > 20000 then return public._api_me_err('too_long', 'selection'); end if;
    if exists (
      select 1 from jsonb_each(v_selection) e
      where jsonb_typeof(e.value) not in ('string', 'number', 'boolean', 'array')
         or (jsonb_typeof(e.value) = 'array' and exists (select 1 from jsonb_array_elements(e.value) a where jsonb_typeof(a) not in ('string', 'number', 'boolean')))
    ) then return public._api_me_err('invalid_selection', 'selection'); end if;
    v_changed := v_changed || 'selection'::text;
  end if;

  -- araç / etiket / kategori: `_import_common` (içe aktarmayla AYNI kurallar); yalnız verilen alanlar uygulanır
  v_has_common := p_patch ?| array['category', 'subcategory', 'contentType', 'tools', 'tags'];
  v_set_cat := p_patch ?| array['category', 'subcategory', 'contentType'];
  if v_has_common then
    v_in := jsonb_build_object(
      'tools', case when p_patch ? 'tools' then p_patch -> 'tools' else '[]'::jsonb end,
      'tags', case when p_patch ? 'tags' then p_patch -> 'tags' else '[]'::jsonb end,
      'category', case when p_patch ? 'category' then p_patch -> 'category' else to_jsonb(v_cat) end,
      'subcategory', case when p_patch ? 'subcategory' then p_patch -> 'subcategory' else to_jsonb(v_sub) end);
    v_common := public._import_common(v_in, v_type);
    if not (v_common ->> 'ok')::boolean then return public._api_me_err(v_common ->> 'code', v_common ->> 'field'); end if;
    if p_patch ? 'tools' then v_changed := v_changed || 'tools'::text; end if;
    if p_patch ? 'tags' then v_changed := v_changed || 'tags'::text; end if;
    if p_patch ? 'category' then v_changed := v_changed || 'category'::text; end if;
    if p_patch ? 'subcategory' then v_changed := v_changed || 'subcategory'::text; end if;
  end if;

  -- workflow: mevcut adımların METİNLERİ (yapı, sıra, bağlantı ve prompt değişmez)
  if p_kind = 'workflow' and p_patch ? 'stepEdits' then
    if jsonb_typeof(p_patch -> 'stepEdits') <> 'array' or jsonb_array_length(p_patch -> 'stepEdits') = 0 or jsonb_array_length(p_patch -> 'stepEdits') > 30 then
      return public._api_me_err('invalid_steps', 'stepEdits');
    end if;
    select count(*) into v_n from public.workflow_steps where workflow_id = p_id;
    for v_edit in select value from jsonb_array_elements(p_patch -> 'stepEdits') loop
      if jsonb_typeof(v_edit) <> 'object' or jsonb_typeof(v_edit -> 'position') <> 'number' or (v_edit ->> 'position') !~ '^[0-9]{1,3}$' then
        return public._api_me_err('invalid_steps', 'stepEdits');
      end if;
      v_pos := (v_edit ->> 'position')::integer;
      if v_pos < 1 or v_pos > v_n or v_pos = any (v_seen) then return public._api_me_err('invalid_steps', 'stepEdits'); end if;
      v_seen := v_seen || v_pos;
      if not (v_edit ?| array['title', 'description', 'instructions']) then return public._api_me_err('invalid_steps', 'stepEdits'); end if;
      if exists (select 1 from jsonb_each(v_edit) e where e.key not in ('position', 'title', 'description', 'instructions')) then
        return public._api_me_err('invalid_steps', 'stepEdits');
      end if;
      if (v_edit ? 'title' and (jsonb_typeof(v_edit -> 'title') <> 'string' or char_length(btrim(v_edit ->> 'title')) > 200))
         or (v_edit ? 'description' and (jsonb_typeof(v_edit -> 'description') <> 'string' or char_length(v_edit ->> 'description') > 1000))
         or (v_edit ? 'instructions' and (jsonb_typeof(v_edit -> 'instructions') <> 'string' or char_length(v_edit ->> 'instructions') > 5000)) then
        return public._api_me_err('too_long', 'stepEdits');
      end if;
    end loop;
    v_changed := v_changed || 'stepEdits'::text;
  end if;

  -- === 3. Yazma (tek işlem; ana UPDATE HER ZAMAN çalışır: `*_set_updated_at` tetikleyicisi belirteci yeniler) ====================================
  v_tools := case when p_patch ? 'tools' then coalesce((select array_agg(t) from jsonb_array_elements_text(v_common -> 'tools') t), '{}') else null end;

  if p_kind = 'prompt' then
    update public.prompts set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      prompt_text = case when p_patch ? 'promptText' then v_text else prompt_text end,
      content_type = v_type,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools)
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.prompt_tags where prompt_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.prompt_tags (prompt_id, tag_slug, source) values (p_id, v_slug, 'manual') on conflict do nothing;
      end loop;
    end if;
    select updated_at into v_updated from public.prompts where id = p_id;
  elsif p_kind = 'request' then
    update public.prompt_requests set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      creative_direction = case when p_patch ? 'creativeDirection' then nullif(v_dir, '') else creative_direction end,
      content_type = v_type,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools)
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.prompt_request_tags where request_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.prompt_request_tags (request_id, tag_slug) values (p_id, v_slug) on conflict do nothing;
      end loop;
    end if;
    select updated_at into v_updated from public.prompt_requests where id = p_id;
  elsif p_kind = 'preset' then
    update public.presets set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      content_type = v_type,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools),
      selection = case when p_patch ? 'selection' then v_selection else selection end
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.preset_tags where preset_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.preset_tags (preset_id, tag_slug) values (p_id, v_slug) on conflict do nothing;
      end loop;
    end if;
    select updated_at into v_updated from public.presets where id = p_id;
  else
    update public.workflows set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools)
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.workflow_tags where workflow_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.workflow_tags (workflow_id, tag_slug) values (p_id, v_slug) on conflict do nothing;
      end loop;
    end if;
    if p_patch ? 'stepEdits' then
      for v_edit in select value from jsonb_array_elements(p_patch -> 'stepEdits') loop
        update public.workflow_steps ws set
          title = case when v_edit ? 'title' then btrim(v_edit ->> 'title') else ws.title end,
          description = case when v_edit ? 'description' then v_edit ->> 'description' else ws.description end,
          instructions = case when v_edit ? 'instructions' then v_edit ->> 'instructions' else ws.instructions end
        where ws.id = (select q.id from (select s2.id, row_number() over (order by s2.position, s2.created_at, s2.id) as n
                                         from public.workflow_steps s2 where s2.workflow_id = p_id) q where q.n = (v_edit ->> 'position')::integer);
      end loop;
    end if;
    select updated_at into v_updated from public.workflows where id = p_id;
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'changed', to_jsonb(v_changed),
    'warnings', coalesce(v_common -> 'warnings', '[]'::jsonb),
    'updatedAt', to_char(v_updated at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

revoke all on function public.api_me_whoami() from public, anon;
revoke all on function public.api_me_requests(integer, timestamptz, uuid, text) from public, anon;
revoke all on function public.api_me_presets(integer, timestamptz, uuid, text) from public, anon;
revoke all on function public.api_me_workflows(integer, timestamptz, uuid, text) from public, anon;
revoke all on function public.api_me_request(uuid) from public, anon;
revoke all on function public.api_me_preset(uuid) from public, anon;
revoke all on function public.api_me_workflow(uuid) from public, anon;
revoke all on function public._api_me_err(text, text) from public, anon;
revoke all on function public.api_me_update_draft(text, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.api_me_whoami() to authenticated;
grant execute on function public.api_me_requests(integer, timestamptz, uuid, text) to authenticated;
grant execute on function public.api_me_presets(integer, timestamptz, uuid, text) to authenticated;
grant execute on function public.api_me_workflows(integer, timestamptz, uuid, text) to authenticated;
grant execute on function public.api_me_request(uuid) to authenticated;
grant execute on function public.api_me_preset(uuid) to authenticated;
grant execute on function public.api_me_workflow(uuid) to authenticated;
grant execute on function public._api_me_err(text, text) to authenticated;
grant execute on function public.api_me_update_draft(text, uuid, jsonb, timestamptz) to authenticated;
