-- Skill: keşif ve arama (docs/history/392-*): skill_feed_page, related_skills, skills_for_content.
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
  ('57000000-0000-4000-8000-00000000000a', :alice, 'a', 'Kod gözden geçirici', 'Pull request inceler', '# Rol\nGüvenlik açıklarını bul.', 'software', '{claude-code,cursor}', 'mit', 'published', 'public', 5, 10, 2, 1, now() - interval '5 days'),
  ('57000000-0000-4000-8000-00000000000b', :bob, 'b', 'Test yazarı', 'Birim test üretir', '# Rol\nKod gözden geçirme sonrası test yaz.', 'software', '{claude-code}', 'apache-2.0', 'published', 'public', 9, 3, 1, 0, now() - interval '4 days'),
  ('57000000-0000-4000-8000-00000000000c', :bob, 'c', 'Logo fikirleri', 'Marka için', '# Rol', 'design', '{other}', 'cc0-1.0', 'published', 'public', 1, 0, 0, 0, now() - interval '3 days'),
  ('57000000-0000-4000-8000-00000000000d', :alice, 'd', 'Gizli taslak', 'taslak', '# Rol kod', 'software', '{claude-code}', 'mit', 'draft', 'public', 99, 99, 99, 99, now() - interval '2 days'),
  ('57000000-0000-4000-8000-00000000000e', :alice, 'e', 'Özel', 'özel', '# Rol kod', 'software', '{claude-code}', 'mit', 'published', 'private', 99, 99, 99, 99, now() - interval '1 days');
update public.skills set like_count = like_count where false;
insert into public.tags (slug, label) values ('guvenlik', 'Güvenlik'), ('test', 'Test') on conflict do nothing;
insert into public.skill_tags (skill_id, tag_slug) values ('57000000-0000-4000-8000-00000000000a', 'guvenlik'), ('57000000-0000-4000-8000-00000000000b', 'guvenlik'), ('57000000-0000-4000-8000-00000000000b', 'test');

set role anon; select pg_temp.as_user('');
select pg_temp.check(1, 'only published public skills are listed (default sort: newest first)',
  (select array_agg(id order by created_at desc, id desc) from public.skill_feed_page()) = array['57000000-0000-4000-8000-00000000000c','57000000-0000-4000-8000-00000000000b','57000000-0000-4000-8000-00000000000a']::uuid[]);
select pg_temp.check(1, 'oldest first reverses it', (select (array_agg(id order by created_at asc))[1] from public.skill_feed_page(p_sort => 'oldest')) = '57000000-0000-4000-8000-00000000000a');
select pg_temp.check(2, 'popular sorts by likes', (select id from public.skill_feed_page(p_sort => 'popular') limit 1) = '57000000-0000-4000-8000-00000000000b');
select pg_temp.check(2, 'most_used sorts by uses', (select id from public.skill_feed_page(p_sort => 'most_used') limit 1) = '57000000-0000-4000-8000-00000000000a');
select pg_temp.check(2, 'recommended is a blend (uses*2 + saves*3 + likes*2 + comments)', (select sort_rank from public.skill_feed_page(p_sort => 'recommended') where id = '57000000-0000-4000-8000-00000000000a') = 10*2 + 2*3 + 5*2 + 1);
select pg_temp.check(3, 'a text search finds by title, with match_source = title', (select match_source from public.skill_feed_page(p_query => 'gözden') where id = '57000000-0000-4000-8000-00000000000a') = 'title');
select pg_temp.check(3, 'an instruction-only match is reported as instructions', (select match_source from public.skill_feed_page(p_query => 'güvenlik açıklarını') where id = '57000000-0000-4000-8000-00000000000a') = 'instructions');
select pg_temp.check(3, 'a tag match is reported as tag', (select match_source from public.skill_feed_page(p_query => 'test') where id = '57000000-0000-4000-8000-00000000000b') in ('title', 'summary', 'tag'));
select pg_temp.check(3, 'the search never returns drafts or private skills', (select count(*) from public.skill_feed_page(p_query => 'kod')) = 2);
select pg_temp.check(3, 'LIKE wildcards in the query are literals', (select count(*) from public.skill_feed_page(p_query => '%')) = 0);
select pg_temp.check(4, 'category filter', (select count(*) from public.skill_feed_page(p_category => 'design')) = 1);
select pg_temp.check(4, 'compat filter (any of)', (select count(*) from public.skill_feed_page(p_compat => array['cursor'])) = 1);
select pg_temp.check(4, 'license filter', (select count(*) from public.skill_feed_page(p_license => 'apache-2.0')) = 1);
select pg_temp.check(4, 'tag filter requires ALL tags', (select count(*) from public.skill_feed_page(p_tag_slugs => array['guvenlik','test'])) = 1 and (select count(*) from public.skill_feed_page(p_tag_slugs => array['guvenlik'])) = 2);
select pg_temp.check(4, 'author filter', (select count(*) from public.skill_feed_page(p_author_ids => array['22222222-2222-4222-8222-222222222222']::uuid[])) = 2);
select pg_temp.check(4, 'has_package=false: none of them has a version yet', (select count(*) from public.skill_feed_page(p_has_package => false)) = 3 and (select count(*) from public.skill_feed_page(p_has_package => true)) = 0);
-- keyset sayfalama (popular)
select pg_temp.check(5, 'keyset paging continues after the cursor without repeats', (
  with p1 as (select * from public.skill_feed_page(p_sort => 'popular', p_limit => 2)),
       last as (select * from p1 order by sort_rank desc, created_at desc, id desc offset 1 limit 1),
       p2 as (select f.* from public.skill_feed_page(p_sort => 'popular', p_limit => 2, p_after_rank => (select sort_rank from last), p_after_created_at => (select created_at from last), p_after_id => (select id from last)) f)
  select (select count(*) from p1) = 2 and (select count(*) from p2) = 1 and not exists (select 1 from p2 join p1 using (id))));
reset role;

-- engelleme: RLS gizler
insert into public.blocks (blocker_id, blocked_id) values (:alice, :bob);
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(6, 'a blocked author is hidden from the blocker (RLS)', (select count(*) from public.skill_feed_page(p_author_ids => array['22222222-2222-4222-8222-222222222222']::uuid[])) = 0);
reset role;
delete from public.blocks;

-- benzer Skill
set role anon; select pg_temp.as_user('');
select pg_temp.check(7, 'related: shared category/tag/tool ranks the test writer first, signal-less skills are left out',
  (select array_agg(id order by score desc) from public.related_skills('57000000-0000-4000-8000-00000000000a')) = array['57000000-0000-4000-8000-00000000000b']::uuid[]);
select pg_temp.check(7, 'related never returns the skill itself, a draft or a private one', not exists (select 1 from public.related_skills('57000000-0000-4000-8000-00000000000a') where id in ('57000000-0000-4000-8000-00000000000a','57000000-0000-4000-8000-00000000000d','57000000-0000-4000-8000-00000000000e')));
reset role;

-- ters yön
insert into public.prompts (id, author_id, title, description, prompt_text, content_type) values ('58100000-0000-4000-8000-000000000001', :bob, 'P', 'd', 't', 'text');
insert into public.skill_relations (skill_id, target_type, target_id, position) values
  ('57000000-0000-4000-8000-00000000000a', 'prompt', '58100000-0000-4000-8000-000000000001', 0),
  ('57000000-0000-4000-8000-00000000000d', 'prompt', '58100000-0000-4000-8000-000000000001', 1);
set role anon; select pg_temp.as_user('');
select pg_temp.check(8, 'skills_for_content lists linked published public skills only', (select array_agg(id) from public.skills_for_content('prompt', '58100000-0000-4000-8000-000000000001')) = array['57000000-0000-4000-8000-00000000000a']::uuid[]);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
