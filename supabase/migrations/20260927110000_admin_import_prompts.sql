-- Moderatör toplu prompt yüklemesi (docs/history/251-*): `import_prompts`'un (30 prompt sınırlı, kullanıcı için) yanında, MODERATÖR için
-- tek çağrıda en çok 100 prompt alan, hız sınırından muaf ve isteğe bağlı doğrudan yayınlayan sarmalayıcı. Yalnızca ekleyici
-- (`drop` yok): yeni fonksiyon + `_rate_limit`in aynı imzayla `create or replace`i.
--
-- Tasarım:
--   • Doğrulama/yazma kuralları TEKRAR YAZILMADI: bu fonksiyon `import_prompts`'u 30'luk parçalarla çağırır (yinelenme, kategori,
--     araç/etiket/değişken kuralları, alan beyaz listesi hepsi orada ve SQL testinde). Burada yalnızca yetki, parçalama, atomiklik,
--     hız sınırı muafiyeti, yayınlama ve denetim kaydı var.
--   • Yetki: `_admin_guard()` (is_moderator). SECURITY DEFINER olmasının tek nedeni `_admin_guard`/`_admin_log`'a erişmektir;
--     yazar HER ZAMAN `auth.uid()` (moderatörün kendisi) — başka birinin adına içerik oluşturulamaz.
--   • Atomik: önce bütün parçalar kuru çalıştırılır; tek geçersiz kayıt varsa hiçbir şey yazılmaz. Sonra hepsi tek işlemde yazılır.
--   • Hız sınırı: yalnız bu işlemde (`promptly.bulk_import` işlem-yerel işareti) VE çağıran gerçekten moderatörse, yalnız 'prompt'
--     eylemi için atlanır. Askı (`enforce_can_post`) ve diğer tüm korumalar aynen geçerli.
--   • `p_publish` kapalıyken sonuç özel taslaktır (`import_prompts` ile aynı); açıkken eklenen promptlar yayınlanır + herkese açık olur.
--   • `drop` YOK; tek yeni indeks yinelenme denetimini büyük kütüphanelerde hızlı tutar.

create or replace function public._rate_limit(p_action text, p_max integer, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then return; end if;
  -- Moderatör toplu yüklemesi (`admin_import_prompts`): işaret işlem-yereldir ve istemci tarafından kurulamaz; ayrıca moderatörlük doğrulanır.
  if p_action = 'prompt' and current_setting('promptly.bulk_import', true) = 'on' and public.is_moderator() then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_action, 0));
  select count(*) into v_count from public.rate_limit_events
    where user_id = v_uid and action = p_action and created_at > now() - p_window;
  if v_count >= p_max then
    raise exception 'rate_limit';
  end if;
  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
  -- Bakım: yalnız bu kullanıcının, her koşulda gereksiz kalan (2 günden eski) olayları.
  delete from public.rate_limit_events where user_id = v_uid and created_at < now() - interval '2 days';
end $$;
revoke all on function public._rate_limit(text, integer, interval) from public, anon, authenticated;

create index if not exists prompts_author_title_idx on public.prompts (author_id, title);

create or replace function public.admin_import_prompts(
  p_items jsonb,
  p_dry_run boolean default false,
  p_publish boolean default false,
  p_source text default 'file'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_chunk constant integer := 30;
  c_max constant integer := 100;
  v_total integer;
  v_at integer;
  v_chunk jsonb;
  v_res jsonb;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_ok boolean := true;
  v_created integer := 0;
  v_ids uuid[] := '{}';
  v_published integer := 0;
begin
  perform public._admin_guard();
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;
  v_total := jsonb_array_length(p_items);
  if v_total = 0 then raise exception 'empty'; end if;
  if v_total > c_max then raise exception 'too_many_items'; end if;

  -- 1) Hepsini kuru çalıştır: tek geçersiz kayıt bütün çağrıyı durdurur (hiçbir şey yazılmaz).
  v_at := 0;
  while v_at < v_total loop
    select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb) into v_chunk
      from jsonb_array_elements(p_items) with ordinality as e(value, ordinality)
      where e.ordinality > v_at and e.ordinality <= v_at + c_chunk;
    v_res := public.import_prompts(v_chunk, true);
    if not (v_res ->> 'ok')::boolean then v_ok := false; end if;
    for v_item in select value from jsonb_array_elements(v_res -> 'items') loop
      v_items := v_items || jsonb_build_array(jsonb_set(v_item, '{index}', to_jsonb((v_item ->> 'index')::integer + v_at)));
    end loop;
    v_at := v_at + c_chunk;
  end loop;

  if not v_ok or p_dry_run then
    return jsonb_build_object('dryRun', p_dry_run, 'ok', v_ok, 'created', 0, 'published', 0, 'items', v_items);
  end if;

  -- 2) Yaz: tek işlem; bu işlemde (ve yalnız moderatör için) prompt hız sınırı atlanır.
  perform set_config('promptly.bulk_import', 'on', true);
  v_items := '[]'::jsonb;
  v_at := 0;
  while v_at < v_total loop
    select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb) into v_chunk
      from jsonb_array_elements(p_items) with ordinality as e(value, ordinality)
      where e.ordinality > v_at and e.ordinality <= v_at + c_chunk;
    v_res := public.import_prompts(v_chunk, false);
    v_created := v_created + (v_res ->> 'created')::integer;
    for v_item in select value from jsonb_array_elements(v_res -> 'items') loop
      if v_item ? 'id' then v_ids := v_ids || (v_item ->> 'id')::uuid; end if;
      v_items := v_items || jsonb_build_array(jsonb_set(v_item, '{index}', to_jsonb((v_item ->> 'index')::integer + v_at)));
    end loop;
    v_at := v_at + c_chunk;
  end loop;

  -- 3) İsteğe bağlı yayın: yalnız bu çağrıda oluşan, moderatörün kendi taslakları.
  if p_publish and cardinality(v_ids) > 0 then
    update public.prompts set status = 'published', visibility = 'public'
      where id = any (v_ids) and author_id = auth.uid() and status = 'draft';
    get diagnostics v_published = row_count;
  end if;

  perform public._admin_log('bulk_import_prompts', null,
    jsonb_build_object('requested', v_total, 'created', v_created, 'published', v_published, 'source', left(coalesce(p_source, 'file'), 40)));

  return jsonb_build_object('dryRun', false, 'ok', true, 'created', v_created, 'published', v_published, 'items', v_items);
end;
$$;

revoke all on function public.admin_import_prompts(jsonb, boolean, boolean, text) from public, anon;
grant execute on function public.admin_import_prompts(jsonb, boolean, boolean, text) to authenticated;
