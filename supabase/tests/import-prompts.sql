-- import_prompts RPC'si: kimlik, atomiklik, idempotentlik, alan beyaz listesi, hız sınırı (docs/history/250-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla temiz bir yerel PostgreSQL'e
-- oynatıldıktan sonra süper kullanıcıyla:  psql -d <db> -f import-prompts.sql
-- (stub kurulumu: supabase/tests/run-local.sh). Sonda PASS/FAIL yazar; "FAILED=0" beklenir.
-- Fixture'lar kalıcıdır — ikinci çalıştırma için veritabanını yeniden kurun.
\pset pager off
\set ON_ERROR_STOP off

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  (:'bob',   'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  (:'carol', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');

-- helper: bir çağrıyı yakalar, sonucu ya da hata mesajını döndürür
create or replace function public._try_import(p_items jsonb, p_dry boolean default false) returns text language plpgsql as $$
begin
  return public.import_prompts(p_items, p_dry)::text;
exception when others then
  return 'ERR:' || sqlerrm;
end $$;
grant execute on function public._try_import(jsonb, boolean) to public;

select public._check(1, 'anon cannot execute import_prompts', not has_function_privilege('anon', 'public.import_prompts(jsonb,boolean)', 'execute'));
select public._check(2, 'authenticated can execute import_prompts', has_function_privilege('authenticated', 'public.import_prompts(jsonb,boolean)', 'execute'));
select public._check(3, 'import_prompts is SECURITY INVOKER with a pinned search_path',
  (select not prosecdef and proconfig is not null and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')
   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'import_prompts'));

create or replace function public._code(item jsonb) returns text language sql as $$
  select coalesce((select i ->> 'field' || ':' || (i ->> 'code') from jsonb_array_elements(public.import_prompts(jsonb_build_array(item), true) -> 'items') i where i ->> 'status' = 'invalid'), 'valid')
$$;
grant execute on function public._code(jsonb) to public;

-- ============================ alice ============================
set role authenticated; select public._as_user(:'alice');

-- dry-run: doğrular, yazmaz
create temp table _dry as select public.import_prompts('[
  {"title":"Birinci","promptText":"metin bir {Stil}","contentType":"image"},
  {"title":"İkinci","promptText":"metin iki","contentType":"text"}
]'::jsonb, true) as r;
select public._check(10, 'dry run: ok, two items "ok", nothing written',
  (select (r ->> 'ok')::boolean and (r ->> 'dryRun')::boolean and (r ->> 'created')::int = 0
          and (select count(*) = 2 from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'ok') from _dry)
  and (select count(*) = 0 from public.prompts where author_id = :'alice'));

-- gerçek içe aktarma: hostile alanlar yok sayılır
create temp table _real as select public.import_prompts(('[
  {"title":"  Birinci  ","description":"açıklama","promptText":"metin bir {Stil}","contentType":"IMAGE","tools":["midjourney:v7","dall-e","dall-e"],
   "tags":["Siberpunk","siberpunk","Neon Işık"],
   "variables":[{"name":"Stil","type":"select","defaultValue":"noir","description":"Tarz","options":[{"label":"Noir","value":"noir"},{"label":"Neon","value":"neon","color":"#ff00aa"}]},
                {"name":"Adet","type":"number","defaultValue":"3","config":{"min":1,"max":9}}],
   "author_id":"' || :'bob' || '","authorId":"' || :'bob' || '","status":"published","visibility":"public","like_count":99,"save_count":50,
   "community_id":"00000000-0000-4000-8000-000000000001","origin_type":"request_response","show_on_profile":false},
  {"title":"İkinci","promptText":"metin iki","contentType":"text"}
]')::jsonb, false) as r;
select public._check(11, 'import: created 2, ok, each result carries the new id',
  (select (r ->> 'ok')::boolean and (r ->> 'created')::int = 2 and (select count(*) = 2 from jsonb_array_elements(r -> 'items') i where i ? 'id') from _real));
select public._check(12, 'import: always a private draft owned by the caller, original, no community, zero counters (hostile fields ignored)',
  (select count(*) = 2 and bool_and(author_id = :'alice'::uuid and status = 'draft' and visibility = 'private' and origin_type = 'original'
          and community_id is null and request_id is null and like_count = 0 and save_count = 0 and comment_count = 0 and show_on_profile)
   from public.prompts where author_id = :'alice'));
select public._check(13, 'import: nothing was created under the author id supplied in the file',
  (select count(*) = 0 from public.prompts where author_id = :'bob'));
select public._check(14, 'import: text trimmed, content type lower-cased, tools de-duplicated',
  (select title = 'Birinci' and content_type = 'image' and tools = array['midjourney:v7','dall-e'] and tool is null and description = 'açıklama'
   from public.prompts where author_id = :'alice' and title = 'Birinci'));
select public._check(15, 'import: tags created/linked once, case-insensitive duplicates collapsed',
  (select count(*) = 2 and bool_and(source = 'manual') from public.prompt_tags pt join public.prompts p on p.id = pt.prompt_id where p.title = 'Birinci' and p.author_id = :'alice'));
select public._check(16, 'import: variables stored in order with type, options, config and defaults',
  (select count(*) = 2
      and bool_or(v.name = 'Stil' and v.type = 'select' and v.sort_order = 0 and v.default_value = 'noir' and v.description = 'Tarz'
                  and jsonb_array_length(v.options) = 2 and v.options -> 1 ->> 'color' = '#ff00aa')
      and bool_or(v.name = 'Adet' and v.type = 'number' and v.sort_order = 1 and (v.config ->> 'max')::int = 9 and v.options = '[]'::jsonb)
   from public.prompt_variables v join public.prompts p on p.id = v.prompt_id where p.author_id = :'alice' and p.title = 'Birinci'));

-- idempotent: aynı dosya ikinci kez hiçbir şey eklemez
create temp table _again as select public.import_prompts('[
  {"title":"Birinci","promptText":"metin bir {Stil}","contentType":"image"},
  {"title":"İkinci","promptText":"metin iki","contentType":"text"},
  {"title":"Üçüncü","promptText":"yeni","contentType":"video"},
  {"title":"Üçüncü","promptText":"yeni","contentType":"video"}
]'::jsonb, false) as r;
select public._check(20, 're-import: existing ones and an in-file repeat are "duplicate", only the new one is created',
  (select (r ->> 'created')::int = 1
      and (select array_agg(i ->> 'status' order by (i ->> 'index')::int) = array['duplicate','duplicate','ok','duplicate'] from jsonb_array_elements(r -> 'items') i)
   from _again)
  and (select count(*) = 3 from public.prompts where author_id = :'alice'));

-- atomik: geçersiz kayıt varsa geçerli kardeşi de yazılmaz
create temp table _mixed as select public.import_prompts('[
  {"title":"Geçerli ama yazılmamalı","promptText":"x","contentType":"text"},
  {"title":"","promptText":"x","contentType":"text"}
]'::jsonb, false) as r;
select public._check(21, 'invalid item: ok=false, nothing written, the error names the item and field',
  (select not (r ->> 'ok')::boolean and (r ->> 'created')::int = 0
      and (select i ->> 'index' = '2' and i ->> 'field' = 'title' and i ->> 'code' = 'required' from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'invalid')
   from _mixed)
  and (select count(*) = 0 from public.prompts where title = 'Geçerli ama yazılmamalı'));

-- doğrulama kodları
select public._check(22, 'validation: content type', public._code('{"title":"t","promptText":"p","contentType":"code"}') = 'contentType:invalid_content_type');
select public._check(23, 'validation: title length', public._code(jsonb_build_object('title', repeat('x', 201), 'promptText', 'p', 'contentType', 'text')) = 'title:too_long');
select public._check(24, 'validation: prompt text required / length',
  public._code('{"title":"t","promptText":"   ","contentType":"text"}') = 'promptText:required'
  and public._code(jsonb_build_object('title', 't', 'promptText', repeat('x', 50001), 'contentType', 'text')) = 'promptText:too_long');
select public._check(25, 'validation: tools (more than 3, bad format)',
  public._code('{"title":"t","promptText":"p","contentType":"text","tools":["a","b","c","d"]}') = 'tools:too_many_tools'
  and public._code('{"title":"t","promptText":"p","contentType":"text","tools":["Bad Tool"]}') = 'tools:invalid_tool');
select public._check(26, 'validation: tags (markup, too long, too many)',
  public._code('{"title":"t","promptText":"p","contentType":"text","tags":["<b>"]}') = 'tags:invalid_tag'
  and public._code(jsonb_build_object('title', 't', 'promptText', 'p', 'contentType', 'text', 'tags', jsonb_build_array(repeat('x', 61)))) = 'tags:invalid_tag'
  and public._code(jsonb_build_object('title', 't', 'promptText', 'p', 'contentType', 'text', 'tags', (select jsonb_agg('t' || g) from generate_series(1, 21) g))) = 'tags:too_many_tags');
select public._check(27, 'validation: variables (bad name, one-option select, repeated name, unknown type)',
  public._code('{"title":"t","promptText":"p","contentType":"text","variables":[{"name":"a b","type":"text"}]}') = 'variables:invalid_variable'
  and public._code('{"title":"t","promptText":"p","contentType":"text","variables":[{"name":"s","type":"select","options":[{"label":"x","value":"x"}]}]}') = 'variables:invalid_variable'
  and public._code('{"title":"t","promptText":"p","contentType":"text","variables":[{"name":"n"},{"name":"n"}]}') = 'variables:invalid_variable'
  and public._code('{"title":"t","promptText":"p","contentType":"text","variables":[{"name":"n","type":"code"}]}') = 'variables:invalid_variable');
select public._check(28, 'validation: a non-object item is invalid, not an exception', public._code('"just a string"') = ':invalid_row');

-- kategori: tanınan korunur, tanınmayan boşaltılır ve uyarı verilir (içerik yine eklenir)
create temp table _cat as select slug as cat from public.taxonomy_categories where content_type = 'image' and is_active order by sort_order limit 1;
select public._check(29, 'category: a real one is kept, an unknown one is dropped with a warning',
  (select (public.import_prompts(jsonb_build_array(jsonb_build_object('title','c1','promptText','p1','contentType','image','category',cat)), true) -> 'items' -> 0 -> 'warnings') is null from _cat)
  and (public.import_prompts('[{"title":"c2","promptText":"p2","contentType":"image","category":"nope","subcategory":"x"}]'::jsonb, true) -> 'items' -> 0 -> 'warnings') = '["category_dropped"]'::jsonb);
select public.import_prompts(jsonb_build_array(jsonb_build_object('title','c1','promptText','p1','contentType','image','category',cat))) from _cat;
select public._check(30, 'category: the stored value is the taxonomy slug',
  (select count(*) = 1 from public.prompts p join _cat on p.category = _cat.cat where p.author_id = :'alice' and p.title = 'c1')
  or (select count(*) = 0 from _cat));

-- çağrı biçimi hataları
select public._check(31, 'more than 30 items is rejected as a whole', public._try_import((select jsonb_agg(jsonb_build_object('title', 'x' || g, 'promptText', 'p', 'contentType', 'text')) from generate_series(1, 31) g)) like 'ERR:too_many_items%');
select public._check(32, 'non-array and empty payloads are rejected', public._try_import('{"a":1}') like 'ERR:invalid_items%' and public._try_import('[]') like 'ERR:empty%');

-- RLS: başkası taslağı görmez
reset role; set role authenticated; select public._as_user(:'bob');
select public._check(40, 'another user sees none of the imported private drafts', (select count(*) = 0 from public.prompts where title in ('Birinci', 'İkinci', 'Üçüncü')));
select public._check(41, 'another user cannot read the imported variables', (select count(*) = 0 from public.prompt_variables));

-- oturumsuz çağrı
reset role; set role authenticated; select set_config('request.jwt.claim.sub', '', false);
select public._check(42, 'no session: rejected with not_authenticated', public._try_import('[{"title":"t","promptText":"p","contentType":"text"}]') like 'ERR:not_authenticated%');

-- ============================ carol: hız sınırı ============================
reset role; set role authenticated; select public._as_user(:'carol');
select public._check(50, '30 imports in one call are accepted (matches the hourly prompt limit)',
  (public.import_prompts((select jsonb_agg(jsonb_build_object('title', 'k' || g, 'promptText', 'metin ' || g, 'contentType', 'text')) from generate_series(1, 30) g)) ->> 'created')::int = 30);
select public._check(51, 'the 31st prompt in the hour hits the existing rate limit, atomically',
  public._try_import('[{"title":"k31","promptText":"x","contentType":"text"}]') like 'ERR:rate_limit%'
  and (select count(*) = 30 from public.prompts where author_id = :'carol'));
select public._check(52, 'a dry run does not consume the rate limit and is still validated',
  (public.import_prompts('[{"title":"k32","promptText":"x","contentType":"text"}]'::jsonb, true) ->> 'ok')::boolean);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
