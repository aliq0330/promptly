-- Skill arama içeriğinde (docs/history/402-*): search_content p_kind='skill'.
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
  ('5a000000-0000-4000-8000-00000000000a', :alice, 'sa', 'Kod gözden geçirici', 'Pull request inceler', '# Rol\nGüvenlik açıklarını bul.', 'software', '{claude-code}', 'mit', 'published', 'public', 5, now() - interval '5 days'),
  ('5a000000-0000-4000-8000-00000000000b', :bob, 'sb', 'Test yazarı', 'Birim test üretir', '# Rol\nKod gözden geçirme sonrası test yaz.', 'software', '{cursor}', 'mit', 'published', 'public', 9, now() - interval '4 days'),
  ('5a000000-0000-4000-8000-00000000000d', :alice, 'sd', 'Taslak kod', 's', '# Rol', 'software', '{claude-code}', 'mit', 'draft', 'public', 99, now() - interval '2 days'),
  ('5a000000-0000-4000-8000-00000000000e', :alice, 'se', 'Özel kod', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'private', 99, now() - interval '1 days');
insert into public.tags (slug, label) values ('guvenlik', 'Güvenlik') on conflict do nothing;
insert into public.skill_tags (skill_id, tag_slug) values ('5a000000-0000-4000-8000-00000000000a', 'guvenlik');

set role anon; select pg_temp.as_user('');
select pg_temp.check(1, 'a text search finds published public skills only (title/summary/instructions)', (select array_agg(id order by id) from public.search_content('skill', 'kod')) = array['5a000000-0000-4000-8000-00000000000a','5a000000-0000-4000-8000-00000000000b']::uuid[]);
select pg_temp.check(1, 'an instruction-only match is found', (select array_agg(id) from public.search_content('skill', 'güvenlik açıklarını')) = array['5a000000-0000-4000-8000-00000000000a']::uuid[]);
select pg_temp.check(1, 'LIKE wildcards in the query are literals', (select count(*) from public.search_content('skill', '%')) = 0);
select pg_temp.check(1, 'the other kinds never return a skill', (select count(*) from public.search_content('prompt', 'kod')) = 0);
select pg_temp.check(2, 'popular sorts by likes', (select id from public.search_content('skill', 'kod', 'popular') limit 1) = '5a000000-0000-4000-8000-00000000000b');
select pg_temp.check(2, 'new sorts newest first, oldest reverses it', (select id from public.search_content('skill', 'kod', 'new') limit 1) = '5a000000-0000-4000-8000-00000000000b' and (select id from public.search_content('skill', 'kod', 'oldest') limit 1) = '5a000000-0000-4000-8000-00000000000a');
select pg_temp.check(3, 'author filter', (select array_agg(id) from public.search_content('skill', 'kod', 'relevant', array['11111111-1111-4111-8111-111111111111']::uuid[])) = array['5a000000-0000-4000-8000-00000000000a']::uuid[]);
select pg_temp.check(3, 'tag filter (all tags)', (select array_agg(id) from public.search_content('skill', null, 'relevant', null, null, null, null, null, array['guvenlik'])) = array['5a000000-0000-4000-8000-00000000000a']::uuid[]);
select pg_temp.check(3, 'a tag-name text match finds the skill', (select array_agg(id) from public.search_content('skill', 'guvenlik')) = array['5a000000-0000-4000-8000-00000000000a']::uuid[]);
select pg_temp.check(3, 'exclude authors (new signature)', (select array_agg(id) from public.search_content('skill', 'kod', 'relevant', null, null, null, null, null, null, null, 40, null, null, null, array['11111111-1111-4111-8111-111111111111']::uuid[])) = array['5a000000-0000-4000-8000-00000000000b']::uuid[]);
select pg_temp.check(4, 'a taxonomy / tool filter leaves skills out', (select count(*) from public.search_content('skill', 'kod', 'relevant', null, array['image'])) = 0 and (select count(*) from public.search_content('skill', 'kod', 'relevant', null, null, null, 'x')) = 0 and (select count(*) from public.search_content('skill', 'kod', 'relevant', null, null, null, null, null, null, array['midjourney'])) = 0);
select pg_temp.check(5, 'keyset paging does not repeat or skip', (
  with p1 as (select * from public.search_content('skill', 'kod', 'popular', null, null, null, null, null, null, null, 1)),
       p2 as (select f.* from public.search_content('skill', 'kod', 'popular', null, null, null, null, null, null, null, 1, (select sort_rank from p1), (select created_at from p1), (select id from p1)) f)
  select (select count(*) from p1) = 1 and (select count(*) from p2) = 1 and not exists (select 1 from p2 join p1 using (id))));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
