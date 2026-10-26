-- Prompt içe aktarma (docs/history/250-*): JSON / CSV / Markdown dosyasından gelen promptları TEK işlemde, çağıranın kendi
-- kimliğiyle özel taslak olarak ekler. Yalnızca ekleyici: yeni tablo/sütun yok, tek `create or replace function`.
--
-- Güvenlik tasarımı:
--   • SECURITY INVOKER: RLS, `enforce_can_post` (askı), `enforce_rate_limit` (saatte 30 prompt) ve `char_length` CHECK'leri
--     normal bir `insert into prompts` ile aynen çalışır; fonksiyon hiçbir korumayı atlamaz.
--   • İstemciden yalnızca içerik alanları okunur (başlık, açıklama, metin, tür, kategori, araçlar, etiketler, değişkenler).
--     `author_id`, `status`, `visibility`, `community_id`, sayaçlar, köken… gelse bile YOK SAYILIR: sonuç her zaman
--     `draft` + `private` + `original`, yazar `auth.uid()`.
--   • Atomik: herhangi bir kayıt geçersizse hiçbir şey yazılmaz; hız sınırı gibi bir hata da bütün işlemi geri alır.
--   • İdempotent: aynı yazarda aynı başlık + aynı metin varsa kayıt `duplicate` olarak atlanır (aynı dosya iki kez içe
--     aktarılırsa ikinci seferde hiçbir şey eklenmez).
--   • `p_dry_run = true` aynı doğrulamayı yapar, hiçbir satır yazmaz.
--
-- Dönüş: { dryRun, ok, created, items: [{ index, status: ok|duplicate|invalid, field?, code?, warnings?, id? }] }
-- (`index` 1'den başlar). Geçersiz kayıt varsa `ok = false` ve hiçbir satır yazılmaz.
create or replace function public.import_prompts(p_items jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_elem jsonb;
  v_idx integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_has_invalid boolean := false;
  v_created integer := 0;
  v_seen text[] := '{}';
  v_key text;
  v_status text;
  v_field text;
  v_code text;
  v_warnings text[];
  v_title text;
  v_description text;
  v_text text;
  v_type text;
  v_category text;
  v_subcategory text;
  v_category_id uuid;
  v_tools text[];
  v_tags text[];
  v_tag text;
  v_names text[];
  v_name text;
  v_vtype text;
  v_opts jsonb;
  v_rows jsonb[] := '{}';
  v_row jsonb;
  v_id uuid;
  v_slug text;
  v_order integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
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
    v_warnings := '{}';
    v_tools := '{}';
    v_tags := '{}';
    v_category := null;
    v_subcategory := null;

    if jsonb_typeof(v_item) <> 'object' then
      v_status := 'invalid'; v_field := ''; v_code := 'invalid_row';
    end if;

    if v_status = 'ok' then
      v_title := case when jsonb_typeof(v_item -> 'title') = 'string' then btrim(v_item ->> 'title', E' \t\r\n') else '' end;
      v_description := case when jsonb_typeof(v_item -> 'description') = 'string' then btrim(v_item ->> 'description', E' \t\r\n') else '' end;
      v_text := case when jsonb_typeof(v_item -> 'promptText') = 'string' then btrim(v_item ->> 'promptText', E' \t\r\n') else '' end;
      v_type := case when jsonb_typeof(v_item -> 'contentType') = 'string' then lower(btrim(v_item ->> 'contentType')) else '' end;

      if v_title = '' then v_status := 'invalid'; v_field := 'title'; v_code := 'required';
      elsif char_length(v_title) > 200 then v_status := 'invalid'; v_field := 'title'; v_code := 'too_long';
      elsif char_length(v_description) > 5000 then v_status := 'invalid'; v_field := 'description'; v_code := 'too_long';
      elsif v_text = '' then v_status := 'invalid'; v_field := 'promptText'; v_code := 'required';
      elsif char_length(v_text) > 50000 then v_status := 'invalid'; v_field := 'promptText'; v_code := 'too_long';
      elsif v_type not in ('image', 'text', 'audio', 'video') then v_status := 'invalid'; v_field := 'contentType'; v_code := 'invalid_content_type';
      end if;
    end if;

    -- araçlar: en çok 3, "toolId" / "toolId:modelId"
    if v_status = 'ok' and v_item ? 'tools' and jsonb_typeof(v_item -> 'tools') <> 'null' then
      if jsonb_typeof(v_item -> 'tools') <> 'array' then
        v_status := 'invalid'; v_field := 'tools'; v_code := 'invalid_tool';
      elsif jsonb_array_length(v_item -> 'tools') > 3 then
        v_status := 'invalid'; v_field := 'tools'; v_code := 'too_many_tools';
      else
        for v_elem in select value from jsonb_array_elements(v_item -> 'tools') loop
          if jsonb_typeof(v_elem) <> 'string' or (v_elem #>> '{}') !~ '^[a-z0-9][a-z0-9_.-]{0,59}(:[A-Za-z0-9][A-Za-z0-9_.-]{0,59})?$' then
            v_status := 'invalid'; v_field := 'tools'; v_code := 'invalid_tool';
            exit;
          end if;
          if not ((v_elem #>> '{}') = any (v_tools)) then
            v_tools := v_tools || (v_elem #>> '{}');
          end if;
        end loop;
      end if;
    end if;

    -- etiketler: en çok 20; `get_or_create_tag` ile aynı kurallar (1-60 karakter, `<>` ve kontrol karakteri yok)
    if v_status = 'ok' and v_item ? 'tags' and jsonb_typeof(v_item -> 'tags') <> 'null' then
      if jsonb_typeof(v_item -> 'tags') <> 'array' then
        v_status := 'invalid'; v_field := 'tags'; v_code := 'invalid_tag';
      elsif jsonb_array_length(v_item -> 'tags') > 20 then
        v_status := 'invalid'; v_field := 'tags'; v_code := 'too_many_tags';
      else
        for v_elem in select value from jsonb_array_elements(v_item -> 'tags') loop
          v_tag := case when jsonb_typeof(v_elem) = 'string' then btrim(v_elem #>> '{}', E' \t\r\n') else '' end;
          if v_tag = '' or char_length(v_tag) > 60 or v_tag ~ '[<>]' or v_tag ~ '[[:cntrl:]]' then
            v_status := 'invalid'; v_field := 'tags'; v_code := 'invalid_tag';
            exit;
          end if;
          if not (lower(v_tag) = any (select lower(t) from unnest(v_tags) t)) then
            v_tags := v_tags || v_tag;
          end if;
        end loop;
      end if;
    end if;

    -- değişkenler: en çok 30; prompt_variables CHECK'leriyle aynı kurallar
    if v_status = 'ok' and v_item ? 'variables' and jsonb_typeof(v_item -> 'variables') <> 'null' then
      v_names := '{}';
      if jsonb_typeof(v_item -> 'variables') <> 'array' then
        v_status := 'invalid'; v_field := 'variables'; v_code := 'invalid_variable';
      elsif jsonb_array_length(v_item -> 'variables') > 30 then
        v_status := 'invalid'; v_field := 'variables'; v_code := 'too_many_variables';
      else
        for v_elem in select value from jsonb_array_elements(v_item -> 'variables') loop
          v_name := case when jsonb_typeof(v_elem -> 'name') = 'string' then btrim(v_elem ->> 'name', E' \t\r\n') else '' end;
          v_vtype := case when jsonb_typeof(v_elem -> 'type') = 'string' then v_elem ->> 'type' else 'text' end;
          v_opts := case when jsonb_typeof(v_elem -> 'options') = 'array' then v_elem -> 'options' else '[]'::jsonb end;
          if jsonb_typeof(v_elem) <> 'object'
             or v_name !~ '^[^{}[:space:]]{1,40}$'
             or v_name = any (v_names)
             or v_vtype not in ('text', 'select', 'multi_select', 'number', 'slider', 'toggle')
             or (v_elem ? 'config' and jsonb_typeof(v_elem -> 'config') not in ('object', 'null'))
             or jsonb_array_length(v_opts) > 50
             or (v_vtype in ('select', 'multi_select') and jsonb_array_length(v_opts) < 2)
             or exists (
               select 1 from jsonb_array_elements(v_opts) o
               where jsonb_typeof(o) <> 'object'
                  or jsonb_typeof(o -> 'label') <> 'string' or btrim(o ->> 'label') = ''
                  or jsonb_typeof(o -> 'value') <> 'string' or btrim(o ->> 'value') = ''
             )
          then
            v_status := 'invalid'; v_field := 'variables'; v_code := 'invalid_variable';
            exit;
          end if;
          v_names := v_names || v_name;
        end loop;
      end if;
    end if;

    -- kategori / alt kategori: tanıdık değilse sessizce boş bırakılır ve uyarı verilir (içerik yine eklenir)
    if v_status = 'ok' then
      v_category := case when jsonb_typeof(v_item -> 'category') = 'string' then nullif(btrim(v_item ->> 'category'), '') else null end;
      v_subcategory := case when jsonb_typeof(v_item -> 'subcategory') = 'string' then nullif(btrim(v_item ->> 'subcategory'), '') else null end;
      if v_category is not null then
        select id into v_category_id from public.taxonomy_categories
          where content_type = v_type and slug = v_category and is_active;
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
    end if;

    -- yineleme: aynı yazarda aynı başlık + metin ya da aynı dosyada iki kez
    if v_status = 'ok' then
      v_key := md5(v_title || chr(1) || v_text);
      if v_key = any (v_seen)
         or exists (select 1 from public.prompts where author_id = v_uid and title = v_title and prompt_text = v_text) then
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
        'warnings', case when cardinality(v_warnings) > 0 then to_jsonb(v_warnings) else null end)));
      if v_status = 'ok' then
        v_rows := v_rows || jsonb_build_object(
          'index', v_idx, 'title', v_title, 'description', v_description, 'text', v_text, 'type', v_type,
          'category', v_category, 'subcategory', v_subcategory, 'tools', to_jsonb(v_tools), 'tags', to_jsonb(v_tags),
          'variables', case when jsonb_typeof(v_item -> 'variables') = 'array' then v_item -> 'variables' else '[]'::jsonb end);
      end if;
    end if;
  end loop;

  if v_has_invalid or p_dry_run then
    return jsonb_build_object('dryRun', p_dry_run, 'ok', not v_has_invalid, 'created', 0, 'items', v_results);
  end if;

  -- === 2. Yazma (tek işlem; hız sınırı ya da başka bir hata hepsini geri alır) ===========================================
  foreach v_row in array v_rows loop
    insert into public.prompts (author_id, title, description, prompt_text, tool, tools, content_type, category, subcategory,
                                status, origin_type, visibility)
    values (v_uid, v_row ->> 'title', v_row ->> 'description', v_row ->> 'text', null,
            coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'tools') t), '{}'),
            v_row ->> 'type', v_row ->> 'category', v_row ->> 'subcategory', 'draft', 'original', 'private')
    returning id into v_id;

    for v_tag in select t from jsonb_array_elements_text(v_row -> 'tags') t loop
      select slug into v_slug from public.get_or_create_tag(v_tag);
      insert into public.prompt_tags (prompt_id, tag_slug, source) values (v_id, v_slug, 'manual') on conflict do nothing;
    end loop;

    v_order := 0;
    for v_elem in select value from jsonb_array_elements(v_row -> 'variables') loop
      insert into public.prompt_variables (prompt_id, name, default_value, description, sort_order, type, options, config)
      values (v_id, btrim(v_elem ->> 'name', E' \t\r\n'),
              case when jsonb_typeof(v_elem -> 'defaultValue') = 'string' then v_elem ->> 'defaultValue' else '' end,
              case when jsonb_typeof(v_elem -> 'description') = 'string' then nullif(btrim(v_elem ->> 'description'), '') else null end,
              v_order,
              case when jsonb_typeof(v_elem -> 'type') = 'string' then v_elem ->> 'type' else 'text' end,
              case when jsonb_typeof(v_elem -> 'options') = 'array' and (v_elem ->> 'type') in ('select', 'multi_select')
                   then (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                           'label', btrim(o ->> 'label'), 'value', btrim(o ->> 'value'),
                           'color', case when jsonb_typeof(o -> 'color') = 'string' then o ->> 'color' else null end))), '[]'::jsonb)
                         from jsonb_array_elements(v_elem -> 'options') o)
                   else '[]'::jsonb end,
              case when jsonb_typeof(v_elem -> 'config') = 'object' then v_elem -> 'config' else '{}'::jsonb end);
      v_order := v_order + 1;
    end loop;

    v_results := (select jsonb_agg(case when (e.r ->> 'index')::integer = (v_row ->> 'index')::integer then e.r || jsonb_build_object('id', v_id) else e.r end order by e.n)
                  from jsonb_array_elements(v_results) with ordinality as e(r, n));
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('dryRun', false, 'ok', true, 'created', v_created, 'items', v_results);
end;
$$;

revoke all on function public.import_prompts(jsonb, boolean) from public, anon;
grant execute on function public.import_prompts(jsonb, boolean) to authenticated;
