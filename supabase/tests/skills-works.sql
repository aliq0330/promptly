-- Skill: "Çalıştı mı?" oyu (docs/history/393-*).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');
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
\set carol '''33333333-3333-4333-8333-333333333333'''
\set sk    '''58200000-0000-4000-8000-000000000001'''
\set draft '''58200000-0000-4000-8000-000000000002'''
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:sk, :alice, 'w', 'W', 's', '# r', 'published', 'public'),
  (:draft, :alice, 'd', 'D', 's', '# r', 'draft', 'public');

-- Oy tablosu ve sayaç tablosu istemciye kapalı
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(1, 'the vote table is closed to clients', pg_temp.raises('select * from public.skill_works_votes', 'permission denied'));
select pg_temp.check(1, 'a client cannot write the stats table', pg_temp.raises(format($$insert into public.skill_works_stats (skill_id, yes_count) values (%L, 99)$$, :sk), 'permission denied'));
select pg_temp.check(2, 'before using the skill the state says: cannot vote', (select can_vote from public.skill_works_state(:sk)) = false);
select pg_temp.check(2, 'voting without a use record is refused (use_required)', pg_temp.raises(format($$select * from public.set_skill_works(%L, true)$$, :sk), 'use_required'));
reset role;

insert into public.skill_uses (skill_id, user_id, day) values (:sk, :bob, current_date), (:sk, :carol, current_date);
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(3, 'after a use record the state says: can vote', (select can_vote from public.skill_works_state(:sk)) = true);
select pg_temp.check(3, 'a vote returns the new counts and my vote', (select yes_count = 1 and no_count = 0 and my_vote from public.set_skill_works(:sk, true)));
select pg_temp.check(3, 'changing the vote moves the counts', (select yes_count = 0 and no_count = 1 and my_vote = false from public.set_skill_works(:sk, false)));
select pg_temp.as_user(:carol);
select pg_temp.check(3, 'two people add up', (select yes_count = 1 and no_count = 1 from public.set_skill_works(:sk, true)));
select pg_temp.check(3, 'withdrawing (null) takes the vote back', (select yes_count = 0 and no_count = 1 and my_vote is null from public.set_skill_works(:sk, null)));
select pg_temp.as_user('');
reset role; set role anon;
select pg_temp.check(4, 'a visitor reads the counts but cannot vote', (select yes_count = 0 and no_count = 1 and can_vote = false and my_vote is null from public.skill_works_state(:sk)));
select pg_temp.check(4, 'a visitor cannot call set_skill_works', pg_temp.raises(format($$select * from public.set_skill_works(%L, true)$$, :sk), 'permission denied'));
reset role;

-- Yazar, taslak, engel
insert into public.skill_uses (skill_id, user_id, day) values (:sk, :alice, current_date);
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(5, 'the author cannot vote on their own skill', pg_temp.raises(format($$select * from public.set_skill_works(%L, true)$$, :sk), 'self_vote_not_allowed'));
select pg_temp.check(5, 'the author sees can_vote = false', (select can_vote from public.skill_works_state(:sk)) = false);
select pg_temp.as_user(:bob);
select pg_temp.check(5, 'a draft skill is not found (existence not leaked)', pg_temp.raises(format($$select * from public.set_skill_works(%L, true)$$, :draft), 'not_found'));
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:alice, :carol);
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(5, 'a blocked pair cannot vote', pg_temp.raises(format($$select * from public.set_skill_works(%L, true)$$, :sk), 'interaction_blocked'));
reset role;
delete from public.blocks;

-- Silme
delete from public.skills where id = :sk;
select pg_temp.check(6, 'deleting the skill removes votes and stats', not exists (select 1 from public.skill_works_votes where skill_id = :sk) and not exists (select 1 from public.skill_works_stats where skill_id = :sk));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
