-- Workflow içe aktarma (docs/history/307-*): `import_prompts` / `import_content` ile AYNI ilkeler — INVOKER (RLS, askı, hız sınırı atlanmaz), önce doğrula
-- sonra tek işlemde yaz, sonuç hep çağıranın ÖZEL TASLAĞI, yazar/durum/görünürlük/sayaç/topluluk dosyadan ALINMAZ.
--
-- Adımlar başka promptlara BAŞVURUR, onları KOPYALAMAZ (workflow modelinin ilkesi): dosyadaki `prompt.id` yalnız içe aktaran kişi o promptu
-- OKUYABİLİYORSA (RLS) VE prompt yayında + herkese açık + topluluğa ait değil + silinmemişse bağlanır; aksi hâlde adım BOŞ içe aktarılır
-- (`prompt_unavailable` uyarısı) — başkasının özel promptuna dosya üzerinden bağ kurulamaz, içerik taşınmaz.
-- Adım grafiği (`inputs[].source` → `workflow_connections`) mevcut `save_workflow_graph` (INVOKER) ile yazılır.

create or replace function public.import_workflows(p_items jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_step jsonb;
  v_io jsonb;
  v_idx integer := 0;
  v_pos integer;
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
  v_type text;
  v_common jsonb;
  v_warnings text[];
  v_keys text[];
  v_step_key text;
  v_ids text[];
  v_out_ids text[];
  v_out_by_key jsonb;
  v_src_key text;
  v_src_out text;
  v_prompt_id uuid;
  v_prompt_type text;
  v_types text[];
  v_new_steps jsonb;
  v_new_conns jsonb;
  v_step_uuids jsonb;
  v_rows jsonb[] := '{}';
  v_row jsonb;
  v_wid uuid;
  v_tag text;
  v_slug text;
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
    v_common := null;
    v_warnings := '{}';
    v_keys := '{}';
    v_out_by_key := '{}'::jsonb;
    v_new_steps := '[]'::jsonb;
    v_new_conns := '[]'::jsonb;
    v_step_uuids := '{}'::jsonb;
    v_types := '{}';

    if jsonb_typeof(v_item) <> 'object' then
      v_status := 'invalid'; v_field := ''; v_code := 'invalid_row';
    end if;

    if v_status = 'ok' then
      v_title := case when jsonb_typeof(v_item -> 'title') = 'string' then btrim(v_item ->> 'title', E' \t\r\n') else '' end;
      v_description := case when jsonb_typeof(v_item -> 'description') = 'string' then btrim(v_item ->> 'description', E' \t\r\n') else '' end;
      v_type := case when jsonb_typeof(v_item -> 'contentType') = 'string' then lower(btrim(v_item ->> 'contentType')) else '' end;
      if v_title = '' then v_status := 'invalid'; v_field := 'title'; v_code := 'required';
      elsif char_length(v_title) > 120 then v_status := 'invalid'; v_field := 'title'; v_code := 'too_long';
      elsif char_length(v_description) > 1000 then v_status := 'invalid'; v_field := 'description'; v_code := 'too_long';
      elsif v_type not in ('image', 'text', 'audio', 'video') then v_status := 'invalid'; v_field := 'contentType'; v_code := 'invalid_content_type';
      elsif jsonb_typeof(v_item -> 'steps') <> 'array' or jsonb_array_length(v_item -> 'steps') = 0 then v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps';
      elsif jsonb_array_length(v_item -> 'steps') > 30 then v_status := 'invalid'; v_field := 'steps'; v_code := 'too_many_steps';
      end if;
    end if;

    if v_status = 'ok' then
      v_common := public._import_common(v_item, v_type);
      if not (v_common ->> 'ok')::boolean then
        v_status := 'invalid'; v_field := v_common ->> 'field'; v_code := v_common ->> 'code';
      end if;
    end if;

    -- adımlar: sıra = dizi sırası; anahtar benzersiz; kaynak YALNIZ önceki adımın var olan çıktısı
    if v_status = 'ok' then
      v_pos := 0;
      v_types := array[v_type];
      for v_step in select value from jsonb_array_elements(v_item -> 'steps') loop
        v_step_key := case when jsonb_typeof(v_step -> 'key') = 'string' then btrim(v_step ->> 'key') else '' end;
        if jsonb_typeof(v_step) <> 'object' or v_step_key !~ '^[A-Za-z0-9_-]{1,40}$' or v_step_key = any (v_keys) then
          v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
        end if;
        if coalesce(jsonb_typeof(v_step -> 'title'), 'string') not in ('string', 'null')
           or char_length(coalesce(v_step ->> 'title', '')) > 200
           or char_length(coalesce(v_step ->> 'description', '')) > 1000
           or char_length(coalesce(v_step ->> 'instructions', '')) > 5000 then
          v_status := 'invalid'; v_field := 'steps'; v_code := 'too_long'; exit;
        end if;
        v_ids := '{}';
        v_out_ids := '{}';
        -- çıktılar
        if v_step ? 'outputs' and jsonb_typeof(v_step -> 'outputs') <> 'null' then
          if jsonb_typeof(v_step -> 'outputs') <> 'array' or jsonb_array_length(v_step -> 'outputs') > 10 then
            v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
          end if;
          for v_io in select value from jsonb_array_elements(v_step -> 'outputs') loop
            if jsonb_typeof(v_io) <> 'object' or coalesce(v_io ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,60}$'
               or jsonb_typeof(v_io -> 'label') <> 'string' or char_length(btrim(v_io ->> 'label')) not between 1 and 80
               or (v_io ->> 'id') = any (v_out_ids) then
              v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
            end if;
            v_out_ids := v_out_ids || (v_io ->> 'id');
          end loop;
          if v_status <> 'ok' then exit; end if;
        end if;
        -- girdiler
        if v_step ? 'inputs' and jsonb_typeof(v_step -> 'inputs') <> 'null' then
          if jsonb_typeof(v_step -> 'inputs') <> 'array' or jsonb_array_length(v_step -> 'inputs') > 10 then
            v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
          end if;
          for v_io in select value from jsonb_array_elements(v_step -> 'inputs') loop
            if jsonb_typeof(v_io) <> 'object' or coalesce(v_io ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,60}$'
               or jsonb_typeof(v_io -> 'label') <> 'string' or char_length(btrim(v_io ->> 'label')) not between 1 and 80
               or (v_io ->> 'id') = any (v_ids) then
              v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
            end if;
            v_ids := v_ids || (v_io ->> 'id');
            if jsonb_typeof(v_io -> 'source') = 'object' then
              v_src_key := v_io -> 'source' ->> 'step';
              v_src_out := v_io -> 'source' ->> 'output';
              if v_src_key is null or not (v_src_key = any (v_keys))
                 or not (coalesce(v_out_by_key -> v_src_key, '[]'::jsonb) ? v_src_out) then
                v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_connection'; exit;
              end if;
              v_new_conns := v_new_conns || jsonb_build_array(jsonb_build_object('from_key', v_src_key, 'output_key', v_src_out, 'to_key', v_step_key, 'input_key', v_io ->> 'id'));
            end if;
          end loop;
          if v_status <> 'ok' then exit; end if;
        end if;
        -- başvurulan prompt: yalnız okunabilir + herkese açık + yayında + topluluksuz + silinmemiş
        v_prompt_id := null;
        if jsonb_typeof(v_step -> 'prompt') = 'object' and (v_step -> 'prompt' ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          select p.id, p.content_type into v_prompt_id, v_prompt_type from public.prompts p
           where p.id = (v_step -> 'prompt' ->> 'id')::uuid and p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.deleted_at is null;
          if v_prompt_id is null then
            v_warnings := array_append(v_warnings, 'prompt_unavailable'::text);
          elsif not (v_prompt_type = any (v_types)) then
            v_types := v_types || v_prompt_type;
          end if;
        end if;
        v_keys := v_keys || v_step_key;
        v_out_by_key := v_out_by_key || jsonb_build_object(v_step_key, to_jsonb(v_out_ids));
        v_step_uuids := v_step_uuids || jsonb_build_object(v_step_key, gen_random_uuid()::text);
        v_new_steps := v_new_steps || jsonb_build_array(jsonb_build_object(
          'key', v_step_key, 'position', v_pos,
          'title', btrim(coalesce(v_step ->> 'title', '')), 'description', btrim(coalesce(v_step ->> 'description', '')),
          'instructions', btrim(coalesce(v_step ->> 'instructions', '')), 'prompt_id', v_prompt_id,
          'inputs', coalesce(v_step -> 'inputs', '[]'::jsonb), 'outputs', coalesce(v_step -> 'outputs', '[]'::jsonb)));
        v_pos := v_pos + 1;
      end loop;
    end if;

    -- yineleme: aynı yazarda aynı başlık + açıklama + adım yapısı ya da aynı dosyada iki kez
    if v_status = 'ok' then
      v_key := md5(v_title || chr(1) || v_description || chr(1) || (v_item -> 'steps')::text);
      if v_key = any (v_seen) or exists (select 1 from public.workflows where creator_id = v_uid and title = v_title and description = v_description) then
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
        'warnings', case when cardinality(v_warnings) > 0 or (v_common is not null and jsonb_array_length(v_common -> 'warnings') > 0)
                         then (select coalesce(jsonb_agg(distinct w), '[]'::jsonb) from (
                                 select unnest(v_warnings) as w union all select jsonb_array_elements_text(v_common -> 'warnings')) q)
                         else null end)));
      if v_status = 'ok' then
        v_rows := v_rows || jsonb_build_object(
          'index', v_idx, 'title', v_title, 'description', v_description, 'types', to_jsonb(v_types),
          'category', v_common -> 'category', 'subcategory', v_common -> 'subcategory',
          'tools', v_common -> 'tools', 'tags', v_common -> 'tags',
          'steps', v_new_steps, 'connections', v_new_conns, 'uuids', v_step_uuids);
      end if;
    end if;
  end loop;

  if v_has_invalid or p_dry_run then
    return jsonb_build_object('dryRun', p_dry_run, 'ok', not v_has_invalid, 'created', 0, 'items', v_results);
  end if;

  -- === 2. Yazma (tek işlem; hız sınırı ya da başka bir hata hepsini geri alır) ===========================================
  foreach v_row in array v_rows loop
    insert into public.workflows (creator_id, title, description, content_types, category, subcategory, tools, status, visibility)
    values (v_uid, v_row ->> 'title', v_row ->> 'description',
            coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'types') t), '{}'),
            nullif(v_row ->> 'category', ''), nullif(v_row ->> 'subcategory', ''),
            coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'tools') t), '{}'), 'draft', 'private')
    returning id into v_wid;

    for v_tag in select t from jsonb_array_elements_text(v_row -> 'tags') t loop
      select slug into v_slug from public.get_or_create_tag(v_tag);
      insert into public.workflow_tags (workflow_id, tag_slug) values (v_wid, v_slug) on conflict do nothing;
    end loop;

    perform public.save_workflow_graph(
      v_wid,
      (select coalesce(jsonb_agg(jsonb_build_object(
          'id', (v_row -> 'uuids' ->> (s ->> 'key')), 'position', (s ->> 'position')::int,
          'title', s ->> 'title', 'description', s ->> 'description', 'instructions', s ->> 'instructions',
          'step_type', 'prompt', 'prompt_id', s -> 'prompt_id',
          -- girişlerin `source`'u dosyadaki adım anahtarından yeni adım kimliğine çevrilir
          'inputs', (select coalesce(jsonb_agg(
                        case when jsonb_typeof(i -> 'source') = 'object'
                             then jsonb_build_object('id', i ->> 'id', 'label', btrim(i ->> 'label'),
                                    'source', jsonb_build_object('stepId', v_row -> 'uuids' ->> (i -> 'source' ->> 'step'), 'outputId', i -> 'source' ->> 'output'))
                             else jsonb_build_object('id', i ->> 'id', 'label', btrim(i ->> 'label'), 'source', null) end order by n), '[]'::jsonb)
                     from jsonb_array_elements(s -> 'inputs') with ordinality as t(i, n)),
          'outputs', (select coalesce(jsonb_agg(jsonb_build_object('id', o ->> 'id', 'label', btrim(o ->> 'label')) order by n), '[]'::jsonb)
                      from jsonb_array_elements(s -> 'outputs') with ordinality as t(o, n))
        ) order by (s ->> 'position')::int), '[]'::jsonb)
         from jsonb_array_elements(v_row -> 'steps') s),
      (select coalesce(jsonb_agg(jsonb_build_object(
          'from_step_id', v_row -> 'uuids' ->> (c ->> 'from_key'), 'to_step_id', v_row -> 'uuids' ->> (c ->> 'to_key'),
          'output_key', c ->> 'output_key', 'input_key', c ->> 'input_key')), '[]'::jsonb)
         from jsonb_array_elements(v_row -> 'connections') c));

    v_results := (select jsonb_agg(case when (e.r ->> 'index')::integer = (v_row ->> 'index')::integer then e.r || jsonb_build_object('id', v_wid) else e.r end order by e.n)
                  from jsonb_array_elements(v_results) with ordinality as e(r, n));
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('dryRun', false, 'ok', true, 'created', v_created, 'items', v_results);
end;
$$;
revoke all on function public.import_workflows(jsonb, boolean) from public, anon;
grant execute on function public.import_workflows(jsonb, boolean) to authenticated;
