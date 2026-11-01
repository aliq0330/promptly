-- İstek ve Hazır ayar içe aktarma (docs/history/306-*): `import_prompts` (250) ile AYNI ilkeler — INVOKER (RLS, askı, hız sınırı atlanmaz),
-- önce doğrula sonra tek işlemde yaz, sonuç hep çağıranın ÖZEL TASLAĞI (yazar/durum/görünürlük/sayaç/topluluk dosyadan ALINMAZ),
-- yinelenme yazarın aynı içeriği. Workflow bu RPC'de YOK (adımları başka promptlara bağlıdır; ayrı tasarım).
--
-- Ortak doğrulama (araç, etiket, kategori) `_import_common` yardımcısındadır: saf, hiçbir tabloyu değiştirmez.

create or replace function public._import_common(p_item jsonb, p_type text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_elem jsonb;
  v_tools text[] := '{}';
  v_tags text[] := '{}';
  v_tag text;
  v_category text;
  v_subcategory text;
  v_category_id uuid;
  v_warnings text[] := '{}';
begin
  if p_item ? 'tools' and jsonb_typeof(p_item -> 'tools') <> 'null' then
    if jsonb_typeof(p_item -> 'tools') <> 'array' then
      return jsonb_build_object('ok', false, 'field', 'tools', 'code', 'invalid_tool');
    elsif jsonb_array_length(p_item -> 'tools') > 3 then
      return jsonb_build_object('ok', false, 'field', 'tools', 'code', 'too_many_tools');
    end if;
    for v_elem in select value from jsonb_array_elements(p_item -> 'tools') loop
      if jsonb_typeof(v_elem) <> 'string' or (v_elem #>> '{}') !~ '^[a-z0-9][a-z0-9_.-]{0,59}(:[A-Za-z0-9][A-Za-z0-9_.-]{0,59})?$' then
        return jsonb_build_object('ok', false, 'field', 'tools', 'code', 'invalid_tool');
      end if;
      if not ((v_elem #>> '{}') = any (v_tools)) then
        v_tools := v_tools || (v_elem #>> '{}');
      end if;
    end loop;
  end if;

  if p_item ? 'tags' and jsonb_typeof(p_item -> 'tags') <> 'null' then
    if jsonb_typeof(p_item -> 'tags') <> 'array' then
      return jsonb_build_object('ok', false, 'field', 'tags', 'code', 'invalid_tag');
    elsif jsonb_array_length(p_item -> 'tags') > 20 then
      return jsonb_build_object('ok', false, 'field', 'tags', 'code', 'too_many_tags');
    end if;
    for v_elem in select value from jsonb_array_elements(p_item -> 'tags') loop
      v_tag := case when jsonb_typeof(v_elem) = 'string' then btrim(v_elem #>> '{}', E' \t\r\n') else '' end;
      if v_tag = '' or char_length(v_tag) > 60 or v_tag ~ '[<>]' or v_tag ~ '[[:cntrl:]]' then
        return jsonb_build_object('ok', false, 'field', 'tags', 'code', 'invalid_tag');
      end if;
      if not (lower(v_tag) = any (select lower(t) from unnest(v_tags) t)) then
        v_tags := v_tags || v_tag;
      end if;
    end loop;
  end if;

  v_category := case when jsonb_typeof(p_item -> 'category') = 'string' then nullif(btrim(p_item ->> 'category'), '') else null end;
  v_subcategory := case when jsonb_typeof(p_item -> 'subcategory') = 'string' then nullif(btrim(p_item ->> 'subcategory'), '') else null end;
  if v_category is not null then
    select id into v_category_id from public.taxonomy_categories where content_type = p_type and slug = v_category and is_active;
    if v_category_id is null then
      v_category := null; v_subcategory := null; v_warnings := array_append(v_warnings, 'category_dropped'::text);
    elsif v_subcategory is not null and not exists (
      select 1 from public.taxonomy_subcategories where category_id = v_category_id and slug = v_subcategory and is_active
    ) then
      v_subcategory := null; v_warnings := array_append(v_warnings, 'subcategory_dropped'::text);
    end if;
  else
    v_subcategory := null;
  end if;

  return jsonb_build_object('ok', true, 'tools', to_jsonb(v_tools), 'tags', to_jsonb(v_tags),
    'category', v_category, 'subcategory', v_subcategory, 'warnings', to_jsonb(v_warnings));
end;
$$;
revoke all on function public._import_common(jsonb, text) from public, anon;
grant execute on function public._import_common(jsonb, text) to authenticated;

create or replace function public.import_content(p_kind text, p_items jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_idx integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_has_invalid boolean := false;
  v_created integer := 0;
  v_seen text[] := '{}';
  v_key text;
  v_status text;
  v_field text;
  v_code text;
  v_title text;
  v_description text;
  v_direction text;
  v_type text;
  v_selection jsonb;
  v_common jsonb;
  v_rows jsonb[] := '{}';
  v_row jsonb;
  v_id uuid;
  v_tag text;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_kind not in ('request', 'preset') then
    raise exception 'unsupported_kind';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items';
  end if;

  -- === 1. Doğrulama (hiçbir satır yazılmaz) ============================================================================
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    v_status := 'ok';
    v_field := null;
    v_code := null;
    v_common := null;
    v_selection := '{}'::jsonb;
    v_direction := '';

    if jsonb_typeof(v_item) <> 'object' then
      v_status := 'invalid'; v_field := ''; v_code := 'invalid_row';
    end if;

    if v_status = 'ok' then
      v_title := case when jsonb_typeof(v_item -> 'title') = 'string' then btrim(v_item ->> 'title', E' \t\r\n') else '' end;
      v_description := case when jsonb_typeof(v_item -> 'description') = 'string' then btrim(v_item ->> 'description', E' \t\r\n') else '' end;
      v_type := case when jsonb_typeof(v_item -> 'contentType') = 'string' then lower(btrim(v_item ->> 'contentType')) else '' end;

      if v_title = '' then v_status := 'invalid'; v_field := 'title'; v_code := 'required';
      elsif v_type not in ('image', 'text', 'audio', 'video') then v_status := 'invalid'; v_field := 'contentType'; v_code := 'invalid_content_type';
      end if;

      if v_status = 'ok' and p_kind = 'request' then
        v_direction := case when jsonb_typeof(v_item -> 'creativeDirection') = 'string' then btrim(v_item ->> 'creativeDirection', E' \t\r\n') else '' end;
        if char_length(v_title) > 200 then v_status := 'invalid'; v_field := 'title'; v_code := 'too_long';
        elsif v_description = '' then v_status := 'invalid'; v_field := 'description'; v_code := 'required';
        elsif char_length(v_description) > 5000 then v_status := 'invalid'; v_field := 'description'; v_code := 'too_long';
        elsif char_length(v_direction) > 5000 then v_status := 'invalid'; v_field := 'creativeDirection'; v_code := 'too_long';
        end if;
      elsif v_status = 'ok' and p_kind = 'preset' then
        if char_length(v_title) > 120 then v_status := 'invalid'; v_field := 'title'; v_code := 'too_long';
        elsif char_length(v_description) > 1000 then v_status := 'invalid'; v_field := 'description'; v_code := 'too_long';
        elsif jsonb_typeof(v_item -> 'selection') <> 'object' then v_status := 'invalid'; v_field := 'selection'; v_code := 'invalid_selection';
        elsif char_length((v_item -> 'selection')::text) > 20000 then v_status := 'invalid'; v_field := 'selection'; v_code := 'too_long';
        elsif exists (
          select 1 from jsonb_each(v_item -> 'selection') e
          where jsonb_typeof(e.value) not in ('string', 'number', 'boolean', 'array')
             or (jsonb_typeof(e.value) = 'array' and exists (select 1 from jsonb_array_elements(e.value) a where jsonb_typeof(a) not in ('string', 'number', 'boolean')))
        ) then v_status := 'invalid'; v_field := 'selection'; v_code := 'invalid_selection';
        else v_selection := v_item -> 'selection';
        end if;
      end if;
    end if;

    if v_status = 'ok' then
      v_common := public._import_common(v_item, v_type);
      if not (v_common ->> 'ok')::boolean then
        v_status := 'invalid'; v_field := v_common ->> 'field'; v_code := v_common ->> 'code';
      end if;
    end if;

    -- yineleme: aynı yazarda aynı içerik ya da aynı dosyada iki kez
    if v_status = 'ok' then
      v_key := md5(v_title || chr(1) || v_description || chr(1) || v_direction || chr(1) || v_selection::text);
      if v_key = any (v_seen) or (
        p_kind = 'request' and exists (select 1 from public.prompt_requests where author_id = v_uid and title = v_title and description = v_description and deleted_at is null)
      ) or (
        p_kind = 'preset' and exists (select 1 from public.presets where creator_id = v_uid and title = v_title and selection = v_selection)
      ) then
        v_status := 'duplicate';
      else
        v_seen := v_seen || v_key;
      end if;
    end if;

    if v_status = 'invalid' then
      v_has_invalid := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_idx, 'status', v_status, 'field', v_field, 'code', v_code));
    else
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'index', v_idx, 'status', v_status,
        'warnings', case when v_common is not null and jsonb_array_length(v_common -> 'warnings') > 0 then v_common -> 'warnings' else null end)));
      if v_status = 'ok' then
        v_rows := v_rows || jsonb_build_object(
          'index', v_idx, 'title', v_title, 'description', v_description, 'direction', v_direction, 'type', v_type,
          'category', v_common -> 'category', 'subcategory', v_common -> 'subcategory',
          'tools', v_common -> 'tools', 'tags', v_common -> 'tags', 'selection', v_selection);
      end if;
    end if;
  end loop;

  if v_has_invalid or p_dry_run then
    return jsonb_build_object('dryRun', p_dry_run, 'ok', not v_has_invalid, 'created', 0, 'items', v_results);
  end if;

  -- === 2. Yazma (tek işlem; hız sınırı ya da başka bir hata hepsini geri alır) ===========================================
  foreach v_row in array v_rows loop
    if p_kind = 'request' then
      insert into public.prompt_requests (author_id, title, description, creative_direction, content_type, category, subcategory, tools, is_draft, visibility)
      values (v_uid, v_row ->> 'title', v_row ->> 'description', nullif(v_row ->> 'direction', ''), v_row ->> 'type',
              nullif(v_row ->> 'category', ''), nullif(v_row ->> 'subcategory', ''),
              coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'tools') t), '{}'), true, 'private')
      returning id into v_id;
      for v_tag in select t from jsonb_array_elements_text(v_row -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.prompt_request_tags (request_id, tag_slug) values (v_id, v_slug) on conflict do nothing;
      end loop;
    else
      insert into public.presets (creator_id, title, description, content_type, category, subcategory, tools, selection, status, visibility)
      values (v_uid, v_row ->> 'title', v_row ->> 'description', v_row ->> 'type',
              nullif(v_row ->> 'category', ''), nullif(v_row ->> 'subcategory', ''),
              coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'tools') t), '{}'), v_row -> 'selection', 'draft', 'private')
      returning id into v_id;
      for v_tag in select t from jsonb_array_elements_text(v_row -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.preset_tags (preset_id, tag_slug) values (v_id, v_slug) on conflict do nothing;
      end loop;
    end if;

    v_results := (select jsonb_agg(case when (e.r ->> 'index')::integer = (v_row ->> 'index')::integer then e.r || jsonb_build_object('id', v_id) else e.r end order by e.n)
                  from jsonb_array_elements(v_results) with ordinality as e(r, n));
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('dryRun', false, 'ok', true, 'created', v_created, 'items', v_results);
end;
$$;
revoke all on function public.import_content(text, jsonb, boolean) from public, anon;
grant execute on function public.import_content(text, jsonb, boolean) to authenticated;
