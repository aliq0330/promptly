-- admin_import_prompts: moderatör yetkisi, 30'dan çok prompt, hız sınırı muafiyeti (yalnız moderatör + yalnız bu işlem), atomiklik,
-- yayınlama, yineleme, denetim kaydı (docs/history/251-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar stub'larla temiz bir yerel PostgreSQL'e oynatıldıktan sonra süper kullanıcıyla:
--   psql -d <db> -f admin-import-prompts.sql      (kurulum: supabase/tests/run-local.sh). "FAILED=0" beklenir.
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

\set mod  '11111111-1111-4111-8111-111111111111'
\set user '22222222-2222-4222-8222-222222222222'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'mod',  'mod@test.dev',  '{"username":"modo","display_name":"Mod"}'),
  (:'user', 'user@test.dev', '{"username":"normal","display_name":"Normal"}');
update public.profiles set role = 'moderator' where id = :'mod';

create or replace function public._try(p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute p_sql into r;
  return coalesce(r, 'null');
exception when others then
  return 'ERR:' || sqlerrm;
end $$;
grant execute on function public._try(text) to public;

create or replace function public._items(p_from int, p_to int, p_prefix text default 'Toplu') returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('title', p_prefix || ' ' || g, 'promptText', 'metin ' || g || ' {x}', 'contentType', 'text',
                   'tags', jsonb_build_array('prompts.chat'), 'description', 'Kaynak: prompts.chat (CC0) https://github.com/f/prompts.chat'))
  from generate_series(p_from, p_to) g
$$;
grant execute on function public._items(int, int, text) to public;

select public._check(1, 'anon cannot execute admin_import_prompts', not has_function_privilege('anon', 'public.admin_import_prompts(jsonb,boolean,boolean,text)', 'execute'));
select public._check(2, '_rate_limit stays internal (no EXECUTE for clients)', not has_function_privilege('authenticated', 'public._rate_limit(text,integer,interval)', 'execute'));

-- ============================ normal kullanıcı ============================
set role authenticated; select public._as_user(:'user');
select public._check(10, 'a non-moderator is refused', public._try($$select public.admin_import_prompts(public._items(1, 2), true)::text$$) like 'ERR:Yetkisiz.%');
select public._check(11, 'a non-moderator cannot switch the rate limit off by setting the flag themselves',
  (select (set_config('promptly.bulk_import', 'on', false)) = 'on')
  and public._try($$select public.import_prompts(public._items(1, 31, 'Kullanıcı'), false)::text$$) like 'ERR:too_many_items%');
select set_config('promptly.bulk_import', 'off', false);
-- 30'u doldur, 31.'si hız sınırına takılır — bayrak 'on' olsa bile moderatör olmayan için işe yaramaz
select public.import_prompts(public._items(1, 30, 'Kullanıcı'), false);
select set_config('promptly.bulk_import', 'on', false);
select public._check(12, 'flag + non-moderator: the 31st prompt is STILL rate limited',
  public._try($$select public.import_prompts('[{"title":"x","promptText":"y","contentType":"text"}]'::jsonb, false)::text$$) like 'ERR:rate_limit%');
select set_config('promptly.bulk_import', 'off', false);
reset role;

-- ============================ moderatör ============================
set role authenticated; select public._as_user(:'mod');

-- kuru çalıştırma: 100 kayıt, hiçbir şey yazılmaz, indeksler 1..100
create temp table _dry as select public.admin_import_prompts(public._items(1, 100), true) as r;
select public._check(20, 'dry run of 100 items (> the normal 30): ok, nothing written, indices 1..100',
  (select (r ->> 'ok')::boolean and (r ->> 'dryRun')::boolean and jsonb_array_length(r -> 'items') = 100
          and (select min((i ->> 'index')::int) = 1 and max((i ->> 'index')::int) = 100 from jsonb_array_elements(r -> 'items') i) from _dry)
  and (select count(*) = 0 from public.prompts where author_id = :'mod'));

select public._check(21, 'more than 100 in one call and an empty call are rejected',
  public._try($$select public.admin_import_prompts(public._items(1, 101), true)::text$$) like 'ERR:too_many_items%'
  and public._try($$select public.admin_import_prompts('[]'::jsonb, true)::text$$) like 'ERR:empty%');

-- atomik: 45. kayıt geçersizse (ikinci parça) ilk 44 de yazılmaz; hata 45. kaydı gösterir
create temp table _bad as select public.admin_import_prompts(
  (select jsonb_agg(case when g = 45 then jsonb_build_object('title', '', 'promptText', 'x', 'contentType', 'text')
                         else jsonb_build_object('title', 'Atomik ' || g, 'promptText', 'metin ' || g, 'contentType', 'text') end) from generate_series(1, 60) g), false) as r;
select public._check(22, 'one invalid item in the 2nd chunk: ok=false, NOTHING written, error reported at its overall index (45)',
  (select not (r ->> 'ok')::boolean and (r ->> 'created')::int = 0
     and (select count(*) = 1 and min((i ->> 'index')::int) = 45 from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'invalid') from _bad)
  and (select count(*) = 0 from public.prompts where title like 'Atomik %'));

-- gerçek yükleme: 100 kayıt tek çağrıda, hız sınırı tüketilmez, hepsi özel taslak
create temp table _real as select public.admin_import_prompts(public._items(1, 100), false, false, 'prompts.chat') as r;
select public._check(23, 'import of 100: created 100, ok, every result has an id, published 0',
  (select (r ->> 'ok')::boolean and (r ->> 'created')::int = 100 and (r ->> 'published')::int = 0
          and (select count(*) = 100 from jsonb_array_elements(r -> 'items') i where i ? 'id') from _real));
select public._check(24, 'default result: private drafts owned by the moderator, original, no community, zero counters',
  (select count(*) = 100 and bool_and(author_id = :'mod'::uuid and status = 'draft' and visibility = 'private' and origin_type = 'original'
          and community_id is null and like_count = 0) from public.prompts where title like 'Toplu %'));
select public._check(25, 'the shared tag was created once and linked to all 100',
  (select count(*) = 100 from public.prompt_tags where tag_slug = (select slug from public.tags where label = 'prompts.chat' limit 1)));
select public._check(26, 'bulk import consumed NO prompt rate-limit events',
  (select count(*) = 0 from public.rate_limit_events where user_id = :'mod' and action = 'prompt'));
-- admin_audit_log istemciye kapalıdır (RLS, politika yok): kontrol süper kullanıcı rolüyle yapılır
reset role;
select public._check(27, 'an audit log row was written (action, counts, source label, moderator)',
  (select count(*) = 1 and bool_and((details ->> 'created')::int = 100 and details ->> 'source' = 'prompts.chat' and moderator_username = 'mod')
   from public.admin_audit_log where action = 'bulk_import_prompts'));
set role authenticated; select public._as_user(:'mod');
select public._check(27, 'the audit log stays unreadable for the client role', (select count(*) = 0 from public.admin_audit_log));

-- yineleme (idempotent) + aynı yüklemede çapraz parça yinelemesi
create temp table _again as select public.admin_import_prompts(public._items(1, 40), false) as r;
select public._check(28, 're-import of the same 40: created 0, all duplicates (safe to resume an interrupted upload)',
  (select (r ->> 'created')::int = 0 and (select count(*) = 40 from jsonb_array_elements(r -> 'items') i where i ->> 'status' = 'duplicate') from _again));
create temp table _cross as select public.admin_import_prompts(
  (select jsonb_agg(jsonb_build_object('title', 'Çapraz', 'promptText', 'aynı', 'contentType', 'text')) from generate_series(1, 35)), false) as r;
select public._check(29, 'the same prompt twice in one upload (different chunks): created once, the rest are duplicates',
  (select (r ->> 'created')::int = 1 from _cross) and (select count(*) = 1 from public.prompts where title = 'Çapraz'));

-- yayınlama
create temp table _pub as select public.admin_import_prompts(public._items(101, 130, 'Yayın'), false, true) as r;
select public._check(30, 'p_publish: the created prompts are published + public, nothing else is touched',
  (select (r ->> 'published')::int = 30 from _pub)
  and (select count(*) = 30 and bool_and(status = 'published' and visibility = 'public' and author_id = :'mod'::uuid) from public.prompts where title like 'Yayın %')
  and (select count(*) = 100 and bool_and(status = 'draft') from public.prompts where title like 'Toplu %'));

-- bayrak yalnız o işlemde geçerli: moderatörün sıradan içe aktarması yine hız sınırına tabidir
select public._check(31, 'the exemption does not leak: the moderator’s ordinary import_prompts is still limited (31st in the hour)',
  (select count(*) from public.rate_limit_events where user_id = :'mod' and action = 'prompt') = 0
  and public._try($$select (public.import_prompts(public._items(1, 30, 'Sıradan'), false) ->> 'created')$$) = '30'
  and public._try($$select public.import_prompts('[{"title":"y","promptText":"y","contentType":"text"}]'::jsonb, false)::text$$) like 'ERR:rate_limit%');

-- RLS: başka kullanıcı moderatörün özel taslaklarını görmez
reset role; set role authenticated; select public._as_user(:'user');
select public._check(40, 'another user sees none of the private drafts, but does see the published ones',
  (select count(*) = 0 from public.prompts where title like 'Toplu %')
  and (select count(*) = 30 from public.prompts where title like 'Yayın %'));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
