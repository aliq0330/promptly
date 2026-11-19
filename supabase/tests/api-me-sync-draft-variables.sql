-- Kişisel API: taslak promptun değişkenlerini eşitleme (20261211100000_api_me_sync_draft_variables.sql; docs/history/438-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-me-sync-draft-variables.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başkası. Edge Function'ın yaptığı gibi: rol + JWT iddiaları kurulup RPC çağrılır.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set pd 'a7000000-0000-4000-8000-000000000001'
\set pp 'a7000000-0000-4000-8000-000000000002'
\set po 'a7000000-0000-4000-8000-000000000003'
\set pc 'a7000000-0000-4000-8000-000000000004'
\set pn 'a7000000-0000-4000-8000-000000000005'

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

insert into public.conversations (id, kind) values ('e7000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e7000000-0000-4000-8000-000000000001', 'Topluluk', :me);

-- pd: benim taslak (iki jeton + JSON + sayı), pp: benim yayında, po: başkasının taslağı, pc: topluluğa özgü (topluluk içeriği taslak olamaz), pn: jetonsuz taslak.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  (:'pd', :me, 'Pd taslak', 'd', 'A {city} at {time_of_day}, {"a": 1} and {1} and {x, y} and {city}', 'image', 'draft', 'private', null),
  (:'pp', :me, 'Pp yayında', 'd', 'A {city}', 'image', 'published', 'public', null),
  (:'po', :ot, 'Po başkası', 'd', 'A {city}', 'image', 'draft', 'private', null),
  (:'pc', :me, 'Pc topluluk', 'd', 'A {city}', 'image', 'published', 'private', 'e7000000-0000-4000-8000-000000000001'),
  (:'pn', :me, 'Pn jetonsuz', 'd', 'plain text', 'image', 'draft', 'private', null);

set role authenticated;
select public._as_user(:me);

-- --- Yalnız otomatik tanımlama (p_variables null) -------------------------------------------------------------------------------------------------
create temp table _r1 as select public.api_me_sync_draft_variables(:'pd'::uuid) as r;
select public._check(1, 'tokens without a definition become empty text variables; JSON braces, digits and "x, y" are NOT variables',
  (select (r ->> 'ok')::boolean and r -> 'autoDefined' = '["city","time_of_day"]'::jsonb and r -> 'variables' = '["city","time_of_day"]'::jsonb from _r1));
select public._check(2, 'the rows are real: text type, empty default, no description, in order',
  (select array_agg(name || ':' || type || ':' || default_value || ':' || sort_order order by sort_order) = array['city:text::0', 'time_of_day:text::1']
     from public.prompt_variables where prompt_id = :'pd'));
select public._check(3, 'running it again is idempotent: nothing new is added',
  (select (public.api_me_sync_draft_variables(:'pd'::uuid) -> 'autoDefined') = '[]'::jsonb)
  and (select count(*) = 2 from public.prompt_variables where prompt_id = :'pd'));

-- --- Tanımları değiştirme -------------------------------------------------------------------------------------------------------------------------
create temp table _r2 as select public.api_me_sync_draft_variables(:'pd'::uuid, $j$[
  {"name":"city","description":"Sahnenin şehri","defaultValue":"Istanbul","type":"text","options":[],"config":{"suggestions":["Istanbul","Tokyo"]}},
  {"name":"era","defaultValue":"1980s","type":"select","options":[{"label":"1980s","value":"1980s"},{"label":"1990s","value":"1990s"}],"config":{}}
]$j$::jsonb) as r;
select public._check(4, 'a given list REPLACES the old one; the unused "era" is kept, and the token still without a definition (time_of_day) is added',
  (select (r ->> 'ok')::boolean and r -> 'variables' = '["city","era","time_of_day"]'::jsonb and r -> 'autoDefined' = '["time_of_day"]'::jsonb from _r2));
select public._check(5, 'description, default, type, options and config are stored as given',
  (select description = 'Sahnenin şehri' and default_value = 'Istanbul' and config = '{"suggestions":["Istanbul","Tokyo"]}'::jsonb from public.prompt_variables where prompt_id = :'pd' and name = 'city')
  and (select type = 'select' and default_value = '1980s' and jsonb_array_length(options) = 2 from public.prompt_variables where prompt_id = :'pd' and name = 'era'));

-- --- Reddedilenler: hiçbir satır değişmez ---------------------------------------------------------------------------------------------------------
create temp table _before as select name, default_value, type from public.prompt_variables where prompt_id = :'pd';
select public._check(6, 'invalid definitions are refused with invalid_variable and leave the old rows exactly as they were',
  (select bool_and(r ->> 'code' = 'invalid_variable' and r ->> 'ok' = 'false') from (values
     (public.api_me_sync_draft_variables(:'pd'::uuid, '[{"name":"has space"}]'::jsonb)),
     (public.api_me_sync_draft_variables(:'pd'::uuid, '[{"name":"a"},{"name":"a"}]'::jsonb)),
     (public.api_me_sync_draft_variables(:'pd'::uuid, '[{"name":"a","type":"weird"}]'::jsonb)),
     (public.api_me_sync_draft_variables(:'pd'::uuid, '[{"name":"a","type":"select","options":[{"label":"x","value":"x"}]}]'::jsonb)),
     (public.api_me_sync_draft_variables(:'pd'::uuid, '"nope"'::jsonb)),
     (public.api_me_sync_draft_variables(:'pd'::uuid, ('[{"name":"a","description":"' || repeat('x', 501) || '"}]')::jsonb))
   ) as t(r))
  and (select count(*) = 0 from (select name, default_value, type from public.prompt_variables where prompt_id = :'pd' except select * from _before) d)
  and (select count(*) = 0 from (select * from _before except select name, default_value, type from public.prompt_variables where prompt_id = :'pd') d));
select public._check(7, 'a single-choice default that is not one of its options is refused (the page would not match the example image)',
  (public.api_me_sync_draft_variables(:'pd'::uuid, '[{"name":"era","defaultValue":"2000s","type":"select","options":[{"label":"1980s","value":"1980s"},{"label":"1990s","value":"1990s"}]}]'::jsonb) ->> 'code') = 'invalid_variable');
select public._check(8, 'more than 30 definitions are refused with too_many_variables',
  (public.api_me_sync_draft_variables(:'pd'::uuid, (select jsonb_agg(jsonb_build_object('name', 'v' || g)) from generate_series(1, 31) g)) ->> 'code') = 'too_many_variables');

-- --- Kapsam: yalnız kendi, topluluğa özgü olmayan TASLAK ------------------------------------------------------------------------------------------
select public._check(9, 'published prompt → not_draft; someone else''s → not_found; community-only → not_found; unknown id → not_found',
  (public.api_me_sync_draft_variables(:'pp'::uuid) ->> 'code') = 'not_draft'
  and (public.api_me_sync_draft_variables(:'po'::uuid) ->> 'code') = 'not_found'
  and (public.api_me_sync_draft_variables(:'pc'::uuid) ->> 'code') = 'not_found'
  and (public.api_me_sync_draft_variables('a7000000-0000-4000-8000-0000000000ff'::uuid) ->> 'code') = 'not_found');
select public._check(10, 'nothing was written for the refused ones',
  (select count(*) = 0 from public.prompt_variables where prompt_id in (:'pp'::uuid, :'po'::uuid, :'pc'::uuid)));

-- --- Çakışma denetimi -----------------------------------------------------------------------------------------------------------------------------
select public._check(11, 'a stale expected time is a conflict (with the current time) and writes nothing',
  (select r ->> 'code' = 'conflict' and r ? 'currentUpdatedAt' from (select public.api_me_sync_draft_variables(:'pn'::uuid, '[{"name":"z"}]'::jsonb, now() - interval '1 day') as r) t)
  and (select count(*) = 0 from public.prompt_variables where prompt_id = :'pn'));
create temp table _r12 as select public.api_me_sync_draft_variables(:'pn'::uuid, '[{"name":"z"}]'::jsonb, (select updated_at from public.prompts where id = :'pn')) as r;
select public._check(12, 'the current time passes (millisecond precision, as the update RPC compares it)',
  (select (r ->> 'ok')::boolean from _r12) and (select count(*) = 1 from public.prompt_variables where prompt_id = :'pn'));

-- --- 30 sınırı ------------------------------------------------------------------------------------------------------------------------------------
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
select ('a7000000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, :me, 'Çok', 'd', (select string_agg('{t' || n || '}', ' ') from generate_series(1, 35) n), 'text', 'draft', 'private'
from generate_series(1, 1) g;
create temp table _r13 as select public.api_me_sync_draft_variables('a7000000-0000-4000-8000-000000000101'::uuid) as r;
select public._check(13, '35 tokens: 30 become variables, the other 5 are reported as skipped',
  (select jsonb_array_length(r -> 'autoDefined') = 30 and jsonb_array_length(r -> 'skipped') = 5 from _r13)
  and (select count(*) = 30 from public.prompt_variables where prompt_id = 'a7000000-0000-4000-8000-000000000101'));

-- --- Türkçe adlar ---------------------------------------------------------------------------------------------------------------------------------
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a7000000-0000-4000-8000-000000000201', :me, 'Türkçe', 'd', '{şehir} ve {hava_durumu} ve {Çok-Uzun-Ad}', 'text', 'draft', 'private');
select public._check(14, 'Turkish letters are valid variable names (locale-independent rule)',
  (public.api_me_sync_draft_variables('a7000000-0000-4000-8000-000000000201'::uuid) -> 'autoDefined') = '["şehir","hava_durumu","Çok-Uzun-Ad"]'::jsonb);

-- --- Anon çağıramaz -------------------------------------------------------------------------------------------------------------------------------
reset role;
set role anon;
select public._as_user('');
select public._check(15, 'anon cannot call the function',
  public._try($q$ select public.api_me_sync_draft_variables('a7000000-0000-4000-8000-000000000001'::uuid) $q$) ilike '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
