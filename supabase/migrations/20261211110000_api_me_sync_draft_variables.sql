-- Taslak promptun DEĞİŞKENLERİNİ kişisel API'den eşitler (docs/history/439-*).
--
-- Sorun: `update_my_draft` yalnız prompt sütunlarını yazıyordu; `promptText` değişince yeni `{jeton}`lar için `prompt_variables` satırı
-- oluşmuyor, tanımlar da değiştirilemiyordu. Metinde geçip tanımı olmayan jeton, prompt sayfasında doldurma alanı çıkarmıyor ve kopyalanan metinde
-- süslü parantezli kalıyordu.
--
-- Bu RPC (SECURITY INVOKER: RLS, askı, hız sınırı çağıranın):
--   1. yalnız çağıranın kendi, topluluğa/ekibe özgü olmayan, silinmemiş ve TASLAK promptu üzerinde çalışır (yayınlanmış prompta dokunmaz);
--   2. p_variables doluysa değişken listesini TAMAMEN değiştirir (sitedeki formla aynı: sil + ekle; `import_prompts` ile aynı doğrulama);
--   3. her durumda metinde geçip tanımı olmayan, değişken adına benzeyen jetonları boş metin değişkeni olarak ekler (en çok 30);
--   4. p_expected_updated_at verilirse prompt o sırada değiştiyse HİÇBİR ŞEY yazmaz (`conflict`).
--
-- "Değişken adına benziyor" kuralı istemcideki `isDefinableTokenName` ile aynıdır (`src/lib/prompt-variables.ts`; testle karşılaştırılır):
-- boşluk, { } " ' ` : ; , < > ( ) [ ] \ / = yok, 1–40 karakter, yalnız rakam/_/- değil.
--
-- Tamamen EKLEYİCİ: yeni fonksiyon, mevcut hiçbir nesne değişmiyor.

create or replace function public.api_me_sync_draft_variables(p_id uuid, p_variables jsonb default null, p_expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.prompts%rowtype;
  v_elem jsonb;
  v_name text;
  v_type text;
  v_opts jsonb;
  v_default text;
  v_names text[] := '{}';
  v_count integer := 0;
  v_order integer := 0;
  v_tok text;
  v_added text[] := '{}';
  v_skipped text[] := '{}';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_p from public.prompts
   where id = p_id and author_id = v_uid and community_id is null and team_file_id is null and deleted_at is null
   for update;
  if not found then return public._api_me_err('not_found'); end if;
  if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
  if p_expected_updated_at is not null and date_trunc('milliseconds', v_p.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    return jsonb_build_object('ok', false, 'code', 'conflict',
      'currentUpdatedAt', to_char(v_p.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- === 1. Verilen tanımları doğrula (hiçbir satır yazılmadan) ==========================================================================
  if p_variables is not null then
    if jsonb_typeof(p_variables) <> 'array' then return public._api_me_err('invalid_variable', 'variables'); end if;
    if jsonb_array_length(p_variables) > 30 then return public._api_me_err('too_many_variables', 'variables'); end if;
    for v_elem in select value from jsonb_array_elements(p_variables) loop
      v_name := case when jsonb_typeof(v_elem -> 'name') = 'string' then btrim(v_elem ->> 'name', E' \t\r\n') else '' end;
      v_type := case when jsonb_typeof(v_elem -> 'type') = 'string' then v_elem ->> 'type' else 'text' end;
      v_opts := case when jsonb_typeof(v_elem -> 'options') = 'array' then v_elem -> 'options' else '[]'::jsonb end;
      v_default := case when jsonb_typeof(v_elem -> 'defaultValue') = 'string' then v_elem ->> 'defaultValue' else '' end;
      if jsonb_typeof(v_elem) <> 'object'
         or v_name !~ '^[^{}[:space:]]{1,40}$'
         or v_name = any (v_names)
         or v_type not in ('text', 'select', 'multi_select', 'number', 'slider', 'toggle')
         or (v_elem ? 'config' and jsonb_typeof(v_elem -> 'config') not in ('object', 'null'))
         or (jsonb_typeof(v_elem -> 'description') = 'string' and char_length(v_elem ->> 'description') > 500)
         or jsonb_array_length(v_opts) > 50
         or (v_type in ('select', 'multi_select') and jsonb_array_length(v_opts) < 2)
         or exists (
           select 1 from jsonb_array_elements(v_opts) o
           where jsonb_typeof(o) <> 'object'
              or jsonb_typeof(o -> 'label') <> 'string' or btrim(o ->> 'label') = ''
              or jsonb_typeof(o -> 'value') <> 'string' or btrim(o ->> 'value') = ''
         )
         -- Tek seçimin varsayılanı seçeneklerden biri olmalı: yoksa sayfadaki değer, yazarın örneğiyle (görselle) uyuşmaz.
         or (v_type = 'select' and not exists (select 1 from jsonb_array_elements(v_opts) o where btrim(o ->> 'value') = v_default))
      then
        return public._api_me_err('invalid_variable', 'variables');
      end if;
      v_names := v_names || v_name;
    end loop;

    -- === 2. Listeyi değiştir ==========================================================================================================
    delete from public.prompt_variables where prompt_id = p_id;
    for v_elem in select value from jsonb_array_elements(p_variables) loop
      insert into public.prompt_variables (prompt_id, name, default_value, description, sort_order, type, options, config)
      values (p_id, btrim(v_elem ->> 'name', E' \t\r\n'),
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
  end if;

  -- === 3. Metinde geçip tanımı olmayan jetonları boş metin değişkeni yap ================================================================
  select coalesce(max(sort_order) + 1, 0), count(*) into v_order, v_count from public.prompt_variables where prompt_id = p_id;
  for v_tok in
    select t.m[1] from regexp_matches(v_p.prompt_text, '\{([^{}\n]+)\}', 'g') with ordinality as t(m, n)
     group by t.m[1] order by min(t.n)
  loop
    if v_tok ~ '^[^[:space:]{}"''`:;,<>()\[\]\\/=]{1,40}$' and v_tok !~ '^[0-9_-]+$'
       and not exists (select 1 from public.prompt_variables where prompt_id = p_id and name = v_tok) then
      if v_count >= 30 then
        v_skipped := v_skipped || v_tok;
      else
        insert into public.prompt_variables (prompt_id, name, default_value, description, sort_order, type, options, config)
        values (p_id, v_tok, '', null, v_order, 'text', '[]'::jsonb, '{}'::jsonb);
        v_added := v_added || v_tok;
        v_order := v_order + 1;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'id', p_id,
    'variables', coalesce((select jsonb_agg(name order by sort_order, id) from public.prompt_variables where prompt_id = p_id), '[]'::jsonb),
    'autoDefined', to_jsonb(v_added), 'skipped', to_jsonb(v_skipped),
    'updatedAt', to_char(v_p.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

revoke all on function public.api_me_sync_draft_variables(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.api_me_sync_draft_variables(uuid, jsonb, timestamptz) to authenticated;
