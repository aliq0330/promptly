-- Moderatör: `${Ad:Varsayılan}` şablon sözdizimini gerçek prompt değişkenine çevirme (docs/history/253-*).
-- prompts.chat gibi kaynaklardan gelen promptlarda değişkenler `${Ad:Varsayılan}` ya da `${Ad}` biçimindedir; Promptly ise `{Ad}` jetonu +
-- `prompt_variables` satırı kullanır, bu yüzden bu metinler düz yazı kalıyor ve düzenleyicide tanımsız (yetim) jeton gibi davranıyordu.
-- Yalnızca ekleyici/değiştirici (`drop` yok): 3 yeni fonksiyon + `record_prompt_edit()` aynı imzayla `create or replace`.
--
-- Tasarım:
--   • Yetki `_admin_guard()` (moderatör). Kapsam `p_scope`: 'own' = yalnız çağıranın KENDİ promptları (varsayılan kullanım), 'all' = herkesin
--     promptları (istemcide ayrı, uyarılı seçenek). İkisinde de topluluğa özgü (`community_id`) ve silinmiş promptlar dışarıda kalır.
--   • Dönüşüm tek yerde (`_template_var_convert`); önizleme (`admin_template_variables_candidates`, salt-okunur) ve uygulama
--     (`admin_convert_template_variables`) aynı fonksiyonu çağırır, yani gösterilen şey yazılan şeydir.
--   • Yalnız ad kalıbına uyan `${…}` dönüşür; kod gibi görünenler (`${a ? b : c}`, `${f(x)}`, `${a + b}`) olduğu gibi kalır. Ad boşlukları `_` olur
--     (en çok 40 karakter), ilk `:`den sonrası varsayılan değerdir (en çok 500). Aynı prompttaki aynı ad (büyük/küçük harf duyarsız) tek değişkendir:
--     ilk boş olmayan varsayılan kazanır, farklı ikinci varsayılan `conflicts` olarak sayılır. Promptta zaten tanımlı değişken varsa onun adı
--     kullanılır ve ikinci satır eklenmez.
--   • Yazma çağrı başına en çok 200 kimlik, atomik, kilitli (`for update`); yeniden çalıştırmak zararsızdır (dönüşen metinde `${…}` kalmaz).
--   • Sürüm geçmişi ve `content_edits` kaydı normal trigger'larla yazılır (yazar eski metne sürüm geçmişinden dönebilir). Toplu işlemde yazara
--     "promptunu düzenledi" bildirimi GİTMEZ (işlem-yerel `promptly.bulk_template_convert` işareti); denetim kaydı `admin_audit_log`'a yazılır.

-- === Dönüştürücü (iç; istemciye açık değil) ============================================================================================
create or replace function public._template_var_convert(p_text text, p_existing text[])
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_new text := p_text;
  m text[];
  v_inner text;
  v_raw text;
  v_pos integer;
  v_name text;
  v_default text;
  v_canon text;
  v_seen text[] := '{}';
  v_names text[] := '{}';
  v_defaults text[] := '{}';
  v_existing boolean[] := '{}';
  v_idx integer;
  v_conflicts integer := 0;
  v_replaced integer := 0;
  v_vars jsonb := '[]'::jsonb;
  i integer;
begin
  if p_text is null or position('${' in p_text) = 0 then
    return jsonb_build_object('text', p_text, 'vars', v_vars, 'conflicts', 0, 'replaced', 0);
  end if;

  for m in select regexp_matches(p_text, '\$\{([^{}\n]+)\}', 'g') loop
    v_inner := m[1];
    v_raw := '${' || v_inner || '}';
    continue when v_raw = any (v_seen);
    v_seen := array_append(v_seen, v_raw);

    v_pos := position(':' in v_inner);
    v_name := btrim(case when v_pos > 0 then left(v_inner, v_pos - 1) else v_inner end);
    v_default := left(btrim(case when v_pos > 0 then substr(v_inner, v_pos + 1) else '' end), 500);

    -- Kod gibi görünen ya da ad olamayacak kadar uzun/boş ifadeler dokunulmadan kalır.
    continue when v_name = '' or char_length(v_name) > 60 or v_name ~ '[$()\[\]<>=?!&|*/\\";+`,@#%^~]';

    v_name := left(regexp_replace(v_name, '\s+', '_', 'g'), 40);
    v_canon := v_name;
    v_idx := null;
    for i in 1 .. coalesce(array_length(v_names, 1), 0) loop
      if lower(v_names[i]) = lower(v_name) then v_idx := i; exit; end if;
    end loop;

    if v_idx is not null then
      v_canon := v_names[v_idx];
      if v_default <> '' then
        if v_defaults[v_idx] = '' then v_defaults[v_idx] := v_default;
        elsif v_defaults[v_idx] <> v_default then v_conflicts := v_conflicts + 1;
        end if;
      end if;
    else
      -- Promptta zaten tanımlı bir değişken varsa onun adı kullanılır, yeni satır eklenmez.
      v_idx := null;
      for i in 1 .. coalesce(array_length(p_existing, 1), 0) loop
        if lower(p_existing[i]) = lower(v_name) then v_canon := p_existing[i]; v_idx := i; exit; end if;
      end loop;
      v_names := array_append(v_names, v_canon);
      v_defaults := array_append(v_defaults, v_default);
      v_existing := array_append(v_existing, v_idx is not null);
    end if;

    v_new := replace(v_new, v_raw, '{' || v_canon || '}');
    v_replaced := v_replaced + 1;
  end loop;

  for i in 1 .. coalesce(array_length(v_names, 1), 0) loop
    v_vars := v_vars || jsonb_build_array(jsonb_build_object('name', v_names[i], 'default', v_defaults[i], 'existing', v_existing[i]));
  end loop;
  return jsonb_build_object('text', v_new, 'vars', v_vars, 'conflicts', v_conflicts, 'replaced', v_replaced);
end;
$$;

-- === Önizleme (salt-okunur) ============================================================================================================
create or replace function public.admin_template_variables_candidates(p_scope text, p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_total integer;
  v_items jsonb;
begin
  perform public._admin_guard();
  if p_scope is null or p_scope not in ('own', 'all') then raise exception 'bad_scope'; end if;

  with cand as (
    select * from (
      select p.id, p.title, pr.username, p.status, p.created_at,
             public._template_var_convert(p.prompt_text, coalesce((select array_agg(v.name) from public.prompt_variables v where v.prompt_id = p.id), '{}')) as conv
      from public.prompts p
      left join public.profiles pr on pr.id = p.author_id
      where p.prompt_text like '%${%' and p.community_id is null and p.deleted_at is null
        and (p_scope = 'all' or p.author_id = auth.uid())
    ) c
    where (c.conv ->> 'replaced')::integer > 0
  ),
  total as (select count(*) as n from cand),
  page as (select * from cand order by created_at desc, id limit v_limit)
  select (select n from total),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'author', x.username, 'status', x.status,
           'variables', x.conv -> 'vars', 'conflicts', (x.conv ->> 'conflicts')::integer
         ) order by x.created_at desc, x.id) from page x), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- === Uygulama ==========================================================================================================================
create or replace function public.admin_convert_template_variables(p_ids uuid[], p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer;
  v_conv jsonb;
  v_var jsonb;
  v_existing text[];
  v_sort integer;
  v_changed integer := 0;
  v_created integer := 0;
  v_conflicts integer := 0;
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  v_total := cardinality(p_ids);
  if v_total > 200 then raise exception 'too_many_items'; end if;
  if p_scope is null or p_scope not in ('own', 'all') then raise exception 'bad_scope'; end if;

  -- Toplu işlemde yazara "promptunu düzenledi" bildirimi gitmesin (bkz. `record_prompt_edit`); işaret yalnız bu işlemde geçerli.
  perform set_config('promptly.bulk_template_convert', 'on', true);

  for r in
    select p.id, p.prompt_text from public.prompts p
      where p.id = any (p_ids) and p.community_id is null and p.deleted_at is null
        and (p_scope = 'all' or p.author_id = auth.uid())
        and p.prompt_text like '%${%'
      order by p.id
      for update
  loop
    select coalesce(array_agg(v.name), '{}') into v_existing from public.prompt_variables v where v.prompt_id = r.id;
    v_conv := public._template_var_convert(r.prompt_text, v_existing);
    continue when (v_conv ->> 'replaced')::integer = 0;

    select coalesce(max(v.sort_order), -1) into v_sort from public.prompt_variables v where v.prompt_id = r.id;
    for v_var in select * from jsonb_array_elements(v_conv -> 'vars') loop
      continue when (v_var ->> 'existing')::boolean;
      v_sort := v_sort + 1;
      insert into public.prompt_variables (prompt_id, name, default_value, sort_order)
        values (r.id, v_var ->> 'name', v_var ->> 'default', v_sort);
      v_created := v_created + 1;
    end loop;

    update public.prompts set prompt_text = v_conv ->> 'text' where id = r.id;
    v_changed := v_changed + 1;
    v_conflicts := v_conflicts + (v_conv ->> 'conflicts')::integer;
  end loop;

  perform set_config('promptly.bulk_template_convert', 'off', true);
  perform public._admin_log('bulk_convert_template_variables', null,
    jsonb_build_object('scope', p_scope, 'requested', v_total, 'changed', v_changed, 'variables', v_created, 'conflicts', v_conflicts));
  return jsonb_build_object('affected', v_changed, 'skipped', v_total - v_changed, 'variables', v_created, 'conflicts', v_conflicts);
end;
$$;

-- === Toplu işlemde düzenleme bildirimi ==================================================================================================
-- Aynı imza/gövde (20260919520000), tek fark: `promptly.bulk_template_convert` açıkken yazara bildirim üretilmez. `content_edits` kaydı
-- (önceki metin, yazara açık) yine yazılır.
create or replace function public.record_prompt_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := array[]::text[];
  v_previous jsonb := '{}'::jsonb;
  v_editor uuid := auth.uid();
begin
  if old.status = 'draft' then
    return new;
  end if;
  if old.title is distinct from new.title then
    v_changed := array_append(v_changed, 'title');
    v_previous := v_previous || jsonb_build_object('title', old.title);
  end if;
  if old.description is distinct from new.description then
    v_changed := array_append(v_changed, 'description');
    v_previous := v_previous || jsonb_build_object('description', old.description);
  end if;
  if old.prompt_text is distinct from new.prompt_text then
    v_changed := array_append(v_changed, 'prompt_text');
    v_previous := v_previous || jsonb_build_object('prompt_text', old.prompt_text);
  end if;
  if old.tool is distinct from new.tool then
    v_changed := array_append(v_changed, 'tool');
    v_previous := v_previous || jsonb_build_object('tool', old.tool);
  end if;
  if array_length(v_changed, 1) is null or v_editor is null then
    return new;
  end if;
  insert into public.content_edits (content_type, content_id, owner_id, editor_id, changed_fields, previous_values)
  values ('prompt', new.id, new.author_id, v_editor, v_changed, v_previous);
  if v_editor <> new.author_id and coalesce(current_setting('promptly.bulk_template_convert', true), '') <> 'on' then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      new.author_id, v_editor, 'prompt_edited',
      'Promptunu düzenledi: "' || public.truncate_preview(new.title) || '"',
      '/prompts/local?id=' || new.id || '&hl=post:' || new.id
    );
  end if;
  return new;
end;
$$;

-- === Yetkiler ==========================================================================================================================
revoke all on function public._template_var_convert(text, text[]) from public, anon, authenticated;
revoke all on function public.record_prompt_edit() from public, anon, authenticated;
revoke all on function public.admin_template_variables_candidates(text, integer) from public, anon;
revoke all on function public.admin_convert_template_variables(uuid[], text) from public, anon;
grant execute on function public.admin_template_variables_candidates(text, integer) to authenticated;
grant execute on function public.admin_convert_template_variables(uuid[], text) to authenticated;
