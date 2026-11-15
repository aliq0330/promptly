-- Moderatör Skill istatistiği (docs/history/395-*).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
update public.profiles set role = 'moderator' where id = '22222222-2222-4222-8222-222222222222';
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
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  ('59500000-0000-4000-8000-000000000001', :alice, 'a', 'A', 's', '# r', 'published', 'public'),
  ('59500000-0000-4000-8000-000000000002', :alice, 'b', 'B', 's', '# r', 'draft', 'public'),
  ('59500000-0000-4000-8000-000000000003', :alice, 'c', 'C', 's', '# r', 'published', 'private');

set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(1, 'a normal user is refused', pg_temp.raises('select public.admin_skill_stats()', 'Yetkisiz'));
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(1, 'a visitor cannot call it', pg_temp.raises('select public.admin_skill_stats()', 'permission denied'));
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(2, 'a moderator gets the counts', (select (j ->> 'total')::int = 3 and (j ->> 'published')::int = 2 and (j ->> 'draft')::int = 1 and (j ->> 'private')::int = 1 and (j ->> 'with_package')::int = 0 from (select public.admin_skill_stats() as j) x));
reset role;
select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
