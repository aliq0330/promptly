-- Skill içe aktarma (docs/history/397-*).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false); end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like '%' || code || '%'; end $$;
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''

-- 1) Oturum şart; ziyaretçi çağıramaz
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(1, 'a visitor cannot call import_skills', pg_temp.raises($$select public.import_skills('[{"title":"x"}]'::jsonb)$$, 'permission denied'));
reset role; set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(1, 'a non-array payload is refused', pg_temp.raises($$select public.import_skills('{"title":"x"}'::jsonb)$$, 'invalid_items'));
select pg_temp.check(1, 'an empty list is refused', pg_temp.raises($$select public.import_skills('[]'::jsonb)$$, 'empty'));
select pg_temp.check(1, '21 items are refused (hourly skill limit is 20)', pg_temp.raises($$select public.import_skills((select jsonb_agg(jsonb_build_object('title', 't' || g)) from generate_series(1, 21) g))$$, 'too_many_items'));

-- 2) Doğrulama: her kural kendi koduyla reddedilir ve hiçbir şey yazılmaz
select pg_temp.check(2, 'missing title → required', (select (public.import_skills('[{"summary":"s"}]'::jsonb) -> 'items' -> 0 ->> 'code') = 'required'));
select pg_temp.check(2, 'long title → too_long', (select (public.import_skills(jsonb_build_array(jsonb_build_object('title', repeat('a', 121)))) -> 'items' -> 0 ->> 'code') = 'too_long'));
select pg_temp.check(2, 'unknown category → invalid_category', (select (public.import_skills('[{"title":"x","category":"cooking"}]'::jsonb) -> 'items' -> 0 ->> 'code') = 'invalid_category'));
select pg_temp.check(2, 'unknown license → invalid_license', (select (public.import_skills('[{"title":"x","license":"wtfpl"}]'::jsonb) -> 'items' -> 0 ->> 'code') = 'invalid_license'));
select pg_temp.check(2, 'unknown tool → invalid_compat', (select (public.import_skills('[{"title":"x","compat":["emacs"]}]'::jsonb) -> 'items' -> 0 ->> 'code') = 'invalid_compat'));
select pg_temp.check(2, 'a non-object row → invalid_row', (select (public.import_skills('["x"]'::jsonb) -> 'items' -> 0 ->> 'code') = 'invalid_row'));
reset role;
select pg_temp.check(2, 'nothing was written by the invalid calls', (select count(*) = 0 from public.skills));

-- 3) Kuru çalıştırma yazmaz; gerçek içe aktarma özel taslak yazar, alanlar dosyadan alınmaz
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(3, 'dry run reports ok and created 0', (select (r ->> 'ok')::boolean and (r ->> 'created')::int = 0 and (r ->> 'dryRun')::boolean from (select public.import_skills('[{"title":"Logo","summary":"s","instructions":"# a"}]'::jsonb, true) r) x));
reset role;
select pg_temp.check(3, 'the dry run wrote nothing', (select count(*) = 0 from public.skills));
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(3, 'a real import creates the skills', (select (r ->> 'created')::int = 2 from (select public.import_skills($j$[
  {"title":"Logo Çalışması","summary":"özet","instructions":"# bir","category":"design","compat":["claude-code","codex"],"license":"cc0-1.0","status":"published","visibility":"public","author_id":"22222222-2222-4222-8222-222222222222","like_count":99,"version":"9.9.9"},
  {"title":"Logo Çalışması","summary":"özet","instructions":"# iki"}]$j$::jsonb) r) x));
reset role;
select pg_temp.check(3, 'imports are the caller''s PRIVATE DRAFTS (status/visibility/author/counters/version are not taken from the file)',
  (select count(*) = 2 and bool_and(author_id = :alice and status = 'draft' and visibility = 'private' and like_count = 0 and version = '1.0.0') from public.skills));
select pg_temp.check(3, 'fields are stored as given', (select category = 'design' and compat = array['claude-code','codex'] and license = 'cc0-1.0' from public.skills where instructions = '# bir'));
select pg_temp.check(3, 'two same-title skills get different slugs (logo-calismasi, logo-calismasi-2)', (select array_agg(slug order by slug) = array['logo-calismasi','logo-calismasi-2'] from public.skills));

-- 4) Yineleme: aynı başlık + talimat yeniden yazılmaz; dosya içi tekrar da
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'the same title + instructions is a duplicate and creates nothing', (select (r -> 'items' -> 0 ->> 'status') = 'duplicate' and (r ->> 'created')::int = 0 from (select public.import_skills('[{"title":"Logo Çalışması","instructions":"# bir"}]'::jsonb) r) x));
select pg_temp.check(4, 'a repeat inside one file is a duplicate too', (select (r -> 'items' -> 1 ->> 'status') = 'duplicate' and (r ->> 'created')::int = 1 from (select public.import_skills('[{"title":"Yeni","instructions":"# x"},{"title":"Yeni","instructions":"# x"}]'::jsonb) r) x));

-- 5) Hepsi ya da hiçbiri; başkasının verisine dokunmaz
select pg_temp.check(5, 'one invalid row means nothing is written (all or nothing)', (select (r ->> 'ok')::boolean = false and (r ->> 'created')::int = 0 from (select public.import_skills('[{"title":"Geçerli","instructions":"# g"},{"title":""}]'::jsonb) r) x));
reset role;
select pg_temp.check(5, 'the valid row of a failed file was not written', (select count(*) = 0 from public.skills where title = 'Geçerli'));
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(5, 'another user can import the same title (duplicate check is per person)', (select (r ->> 'created')::int = 1 from (select public.import_skills('[{"title":"Logo Çalışması","instructions":"# bir"}]'::jsonb) r) x));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
