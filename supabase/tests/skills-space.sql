-- Skill Space'e eklenebilir (docs/history/404-*): space_items content_type='skill'.
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

create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin execute stmt; return false;
exception when others then return position(code in sqlerrm) > 0; end $$;
insert into public.skills (id, author_id, slug, title, summary, instructions, category, compat, license, status, visibility, created_at) values
  ('5d000000-0000-4000-8000-00000000000a', :bob, 'sa', 'Bob yayında', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'public', now()),
  ('5d000000-0000-4000-8000-00000000000b', :bob, 'sb', 'Bob taslağı', 's', '# Rol', 'software', '{claude-code}', 'mit', 'draft', 'public', now()),
  ('5d000000-0000-4000-8000-00000000000c', :alice, 'sc', 'Alice taslağı', 's', '# Rol', 'software', '{claude-code}', 'mit', 'draft', 'public', now());

select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select set_config('t.space', public.create_space('Skill panosu', 'x', 'free', 'public')::text, false);
select pg_temp.check(1, 'a published public skill is added as a content item',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, content_type, content_id, created_by) values (%L, 'content', 'skill', '5d000000-0000-4000-8000-00000000000a', auth.uid())$q$, current_setting('t.space')), 'NOPE_NO_ERROR') = false);
select pg_temp.check(1, 'the item is stored with content_type skill',
  (select count(*) from public.space_items where space_id = current_setting('t.space')::uuid and content_type = 'skill') = 1);
select pg_temp.check(1, 'the same skill cannot be added twice (unique per space)',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, content_type, content_id, created_by) values (%L, 'content', 'skill', '5d000000-0000-4000-8000-00000000000a', auth.uid())$q$, current_setting('t.space')), 'space_items_unique_content'));
select pg_temp.check(2, 'someone else''s draft skill is unavailable to the adder (RLS)',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, content_type, content_id, created_by) values (%L, 'content', 'skill', '5d000000-0000-4000-8000-00000000000b', auth.uid())$q$, current_setting('t.space')), 'space_source_unavailable'));
select pg_temp.check(2, 'a skill that does not exist is unavailable',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, content_type, content_id, created_by) values (%L, 'content', 'skill', '5d000000-0000-4000-8000-0000000000ff', auth.uid())$q$, current_setting('t.space')), 'space_source_unavailable'));
select pg_temp.check(3, 'your own draft skill can be added (same rule as the other content types)',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, content_type, content_id, created_by) values (%L, 'content', 'skill', '5d000000-0000-4000-8000-00000000000c', auth.uid())$q$, current_setting('t.space')), 'NOPE_NO_ERROR') = false);
select pg_temp.check(3, 'an unknown content type is still rejected (the trigger finds no source)',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, content_type, content_id, created_by) values (%L, 'content', 'bogus', '5d000000-0000-4000-8000-00000000000a', auth.uid())$q$, current_setting('t.space')), 'space_source_unavailable'));
select pg_temp.check(4, 'a note cannot carry a content reference',
  pg_temp.raises(format($q$insert into public.space_items (space_id, kind, title, content_type, content_id, created_by) values (%L, 'note', 'n', 'skill', '5d000000-0000-4000-8000-00000000000a', auth.uid())$q$, current_setting('t.space')), 'space_invalid'));
reset role;

-- başka bir okuyucu herkese açık Space'te Skill öğesini görür
select pg_temp.as_user('22222222-2222-4222-8222-222222222222'); set role authenticated;
select pg_temp.check(5, 'a non-member cannot see the skill item (Spaces are private)', (select count(*) from public.space_items where content_type = 'skill' and content_id = '5d000000-0000-4000-8000-00000000000a') = 0);
reset role;

-- "Bu Skill şu Space'lerde" (409-*) listesi docs/history/459-* ile kalktı: herkese açık Space yok.
select pg_temp.as_user(''); set role anon;
select pg_temp.check(6, 'the public-Space listing RPC is gone', (select count(*) from pg_proc where proname = 'list_public_spaces_for_skill') = 0);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
