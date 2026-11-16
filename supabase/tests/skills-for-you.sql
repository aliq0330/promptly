-- Skill "Sana özel"de (docs/history/406-*): for_you_page skill adayları.
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
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''

insert into public.skills (id, author_id, slug, title, summary, instructions, category, compat, license, status, visibility, like_count, created_at) values
  ('5b000000-0000-4000-8000-00000000000a', :bob, 'ya', 'Bob skill A', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'public', 5, now() - interval '3 hours'),
  ('5b000000-0000-4000-8000-00000000000b', :bob, 'yb', 'Bob skill B', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'public', 1, now() - interval '5 hours'),
  ('5b000000-0000-4000-8000-00000000000c', :alice, 'yc', 'Alice kendi', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'public', 50, now() - interval '2 hours'),
  ('5b000000-0000-4000-8000-00000000000d', :bob, 'yd', 'Taslak', 's', '# Rol', 'software', '{claude-code}', 'mit', 'draft', 'public', 99, now() - interval '1 hours'),
  ('5b000000-0000-4000-8000-00000000000e', :bob, 'ye', 'Özel', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'private', 99, now() - interval '1 hours');
insert into public.tags (slug, label) values ('foryou-tag', 'Foryou etiketi') on conflict do nothing;
insert into public.skill_tags (skill_id, tag_slug) values ('5b000000-0000-4000-8000-00000000000b', 'foryou-tag');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select pg_temp.check(1, 'published public skills of other people are candidates (not own, draft or private)',
  (select array_agg(id order by id) from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null)) = array['5b000000-0000-4000-8000-00000000000a','5b000000-0000-4000-8000-00000000000b']::uuid[]);
select pg_temp.check(1, 'p_kinds without skill never returns a skill', (select count(*) from public.for_you_page(now(), array['prompt'], null, null, null, 50, null, null, null) where kind = 'skill') = 0);
select pg_temp.check(1, 'a null kinds list includes skills', (select count(*) from public.for_you_page(now(), null, null, null, null, 50, null, null, null) where kind = 'skill') = 2);
select pg_temp.check(2, 'a taxonomy filter leaves skills out', (select count(*) from public.for_you_page(now(), null, 'image', null, null, 50, null, null, null) where kind = 'skill') = 0 and (select count(*) from public.for_you_page(now(), null, null, 'coding', null, 50, null, null, null) where kind = 'skill') = 0);
select pg_temp.check(2, 'without a personal signal the reason is popular', (select count(*) from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null) where reason_kind = 'popular') = 2);
reset role;

-- takip edilen kişi + takip edilen etiket sinyalleri
insert into public.follows (follower_id, following_id) values (:alice, :bob);
insert into public.tag_follows (user_id, tag_slug) values (:alice, 'foryou-tag');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select pg_temp.check(3, 'a followed creator outweighs everything: reason creator', (select count(*) from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null) where reason_kind = 'creator') = 2);
select pg_temp.check(3, 'the followed creator +300 ranks the tagged one above the plain one', (select id from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null) order by sort_rank desc limit 1) = '5b000000-0000-4000-8000-00000000000b');
reset role;
delete from public.follows where follower_id = :alice;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select pg_temp.check(3, 'a followed tag gives the reason tag with the slug', (select reason_kind || ':' || reason_ref from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null) where id = '5b000000-0000-4000-8000-00000000000b') = 'tag:foryou-tag');
reset role;

-- beğenilen / kaydedilen Skill bir daha çıkmaz
insert into public.prompt_likes (user_id, skill_id) values (:alice, '5b000000-0000-4000-8000-00000000000a');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select pg_temp.check(4, 'a skill you liked is not shown again', (select array_agg(id) from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null)) = array['5b000000-0000-4000-8000-00000000000b']::uuid[]);
reset role;
insert into public.collections (id, owner_id, name, visibility) values ('5c000000-0000-4000-8000-000000000001', :alice, 'Kayıt', 'private');
insert into public.collection_items (collection_id, skill_id) values ('5c000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-00000000000b');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select pg_temp.check(4, 'a skill you saved is not shown again', (select count(*) from public.for_you_page(now(), array['skill'], null, null, null, 50, null, null, null)) = 0);
reset role;

-- ziyaretçiye hiçbir şey
set role anon; select pg_temp.as_user('');
select pg_temp.check(5, 'anon has no execute grant', not has_function_privilege('anon', 'public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid)', 'execute'));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
