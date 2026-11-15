-- Skill karma akışta (docs/history/400-*): feed_page'in skill_part'ı.
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

insert into public.skills (id, author_id, slug, title, summary, instructions, category, compat, license, status, visibility, like_count, use_count, save_count, comment_count, created_at) values
  ('59000000-0000-4000-8000-00000000000a', :alice, 'fa', 'Akış skill A', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'public', 5, 10, 2, 1, now() - interval '5 days'),
  ('59000000-0000-4000-8000-00000000000b', :bob, 'fb', 'Akış skill B', 's', '# Rol', 'design', '{cursor}', 'mit', 'published', 'public', 9, 3, 1, 0, now() - interval '4 days'),
  ('59000000-0000-4000-8000-00000000000d', :alice, 'fd', 'Taslak', 's', '# Rol', 'software', '{claude-code}', 'mit', 'draft', 'public', 99, 99, 99, 99, now() - interval '2 days'),
  ('59000000-0000-4000-8000-00000000000e', :alice, 'fe', 'Özel', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'private', 99, 99, 99, 99, now() - interval '1 days');
insert into public.tags (slug, label) values ('akis-etiketi', 'Akış etiketi') on conflict do nothing;
insert into public.skill_tags (skill_id, tag_slug) values ('59000000-0000-4000-8000-00000000000a', 'akis-etiketi');
insert into public.follows (follower_id, following_id) values (:bob, :alice);

set role anon; select pg_temp.as_user('');
select pg_temp.check(1, 'a plain feed_page carries only published public skills', (select array_agg(id order by id) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null) where kind = 'skill') = array['59000000-0000-4000-8000-00000000000a','59000000-0000-4000-8000-00000000000b']::uuid[]);
select pg_temp.check(1, 'p_kinds = skill returns only skills', (select count(*) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null)) = 2 and (select count(*) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null) where kind <> 'skill') = 0);
select pg_temp.check(1, 'p_kinds without skill never returns one', (select count(*) from public.feed_page('all', 'newest', array['prompt'], null, null, null, 50, null, null, null) where kind = 'skill') = 0);
select pg_temp.check(2, 'popular ranks by likes', (select id from public.feed_page('all', 'popular', array['skill'], null, null, null, 50, null, null, null) limit 1) = '59000000-0000-4000-8000-00000000000b');
select pg_temp.check(2, 'recommended is the skill blend', (select sort_rank from public.feed_page('all', 'recommended', array['skill'], null, null, null, 50, null, null, null) where id = '59000000-0000-4000-8000-00000000000a') = 10*2 + 2*3 + 5*2 + 1);
select pg_temp.check(2, 'used ranks by use_count', (select id from public.feed_page('all', 'used', array['skill'], null, null, null, 50, null, null, null) limit 1) = '59000000-0000-4000-8000-00000000000a');
select pg_temp.check(3, 'a taxonomy filter (content type / category / tool) leaves skills out', (
  (select count(*) from public.feed_page('all', 'newest', array['skill'], 'image', null, null, 50, null, null, null)) = 0
  and (select count(*) from public.feed_page('all', 'newest', array['skill'], null, 'x', null, 50, null, null, null)) = 0
  and (select count(*) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null, false, null, 'midjourney')) = 0));
select pg_temp.check(3, 'the media filter leaves skills out', (select count(*) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null, false, null, null, null, null, null, true)) = 0);
select pg_temp.check(4, 'the tag filter matches skill tags', (select array_agg(id) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null, false, 'akis-etiketi', null)) = array['59000000-0000-4000-8000-00000000000a']::uuid[]);
select pg_temp.check(4, 'the multi tag filter needs ALL tags', (select count(*) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null, false, null, null, null, array['akis-etiketi','yok'], null)) = 0);
select pg_temp.check(4, 'the author filter narrows', (select array_agg(id) from public.feed_page('all', 'newest', array['skill'], null, null, null, 50, null, null, null, false, null, null, array['22222222-2222-4222-8222-222222222222']::uuid[], null, null)) = array['59000000-0000-4000-8000-00000000000b']::uuid[]);
-- keyset: popular, sayfa 1 (1 satır) sonra devamı
select pg_temp.check(5, 'keyset paging across skills does not repeat or skip', (
  with p1 as (select * from public.feed_page('all', 'popular', array['skill'], null, null, null, 1, null, null, null)),
       p2 as (select f.* from public.feed_page('all', 'popular', array['skill'], null, null, null, 1, (select sort_rank from p1), (select created_at from p1), (select id from p1)) f)
  select (select count(*) from p1) = 1 and (select count(*) from p2) = 1 and not exists (select 1 from p2 join p1 using (id))));
reset role;

select pg_temp.as_user('22222222-2222-4222-8222-222222222222'); set role authenticated;
select pg_temp.check(6, 'the following scope lists the followed author''s skills only', (select array_agg(id) from public.feed_page('following', 'newest', array['skill'], null, null, null, 50, null, null, null)) = array['59000000-0000-4000-8000-00000000000a']::uuid[]);
reset role;
select pg_temp.check(7, 'feed_count counts a skill on a tag page', public.feed_count(null, null, null, 'akis-etiketi', null) = 1);
select pg_temp.check(7, 'feed_count leaves skills out when a taxonomy filter is set', public.feed_count('image', null, null, 'akis-etiketi', null) = 0);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
