-- Skill ↔ Skill bağları + oyda araç etiketi (docs/history/397-*).
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
\set a '''59700000-0000-4000-8000-000000000001'''
\set b '''59700000-0000-4000-8000-000000000002'''
\set bdraft '''59700000-0000-4000-8000-000000000003'''
\set bpriv '''59700000-0000-4000-8000-000000000004'''
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:a, :alice, 'a', 'A', 's', '# r', 'published', 'public'),
  (:b, :bob, 'b', 'B', 's', '# r', 'published', 'public'),
  (:bdraft, :bob, 'bd', 'BD', 's', '# r', 'draft', 'public'),
  (:bpriv, :bob, 'bp', 'BP', 's', '# r', 'published', 'private');

-- 1) Yalnız sahibi bağlar; hedef herkese açık + yayında; kendine bağlanamaz
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(1, 'a non-owner cannot link someone else''s skill', pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id) values (%L, %L)$$, :a, :b), 'row-level security'));
select pg_temp.as_user(:alice);
select pg_temp.check(1, 'the owner links a public published skill', not pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id, position) values (%L, %L, 0)$$, :a, :b), 'zzz_never'));
select pg_temp.check(1, 'a skill cannot link itself', pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id) values (%L, %L)$$, :a, :a), 'check'));
select pg_temp.check(1, 'a draft target is refused (skill_link_not_public)', pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id) values (%L, %L)$$, :a, :bdraft), 'skill_link_not_public'));
select pg_temp.check(1, 'a private target is refused too', pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id) values (%L, %L)$$, :a, :bpriv), 'skill_link_not_public'));
select pg_temp.check(1, 'the same link twice is refused (unique)', pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id) values (%L, %L)$$, :a, :b), 'duplicate key'));

-- 2) Okuma: ziyaretçi bağı görür (kaynak Skill herkese açık); bağlı Skill gizlenirse bağ satırı kalır ama kartı RLS'ten gelmez
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(2, 'a visitor reads the link of a public skill', (select count(*) = 1 from public.skill_links where skill_id = :a));
reset role;
update public.skills set visibility = 'private' where id = :b;
set role anon;
select pg_temp.check(2, 'a hidden linked skill is not readable as a card', (select count(*) = 0 from public.skills where id = :b));
reset role;
update public.skills set visibility = 'public' where id = :b;

-- 3) En çok 10 bağ; bağlı Skill silinince bağ gider
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility)
  select ('59700000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, :bob, 'x' || g, 'X' || g, 's', '# r', 'published', 'public' from generate_series(1, 10) g;
set role authenticated; select pg_temp.as_user(:alice);
reset role;
insert into public.skill_links (skill_id, linked_skill_id, position)
  select :a, ('59700000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, g from generate_series(1, 9) g;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(3, 'the 11th link is refused (skill_too_many_links)', pg_temp.raises(format($$insert into public.skill_links (skill_id, linked_skill_id) values (%L, %L)$$, :a, '59700000-0000-4000-8000-000000000110'), 'skill_too_many_links'));
reset role;
delete from public.skills where id = :b;
select pg_temp.check(3, 'deleting the linked skill removes the link', (select count(*) = 0 from public.skill_links where linked_skill_id = :b));

-- 4) Oy araç etiketi
insert into public.skill_uses (skill_id, user_id, day) values (:a, :bob, current_date);
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(4, 'a tool tag without a vote is refused (no_vote)', pg_temp.raises(format($$select public.set_skill_works_tool(%L, 'cursor')$$, :a), 'no_vote'));
select public.set_skill_works(:a, true);
select pg_temp.check(4, 'an unknown tool is refused', pg_temp.raises(format($$select public.set_skill_works_tool(%L, 'emacs')$$, :a), 'invalid_tool'));
select pg_temp.check(4, 'the voter tags her own vote with a tool', not pg_temp.raises(format($$select public.set_skill_works_tool(%L, 'cursor')$$, :a), 'zzz_never'));
select pg_temp.check(4, 'the vote table stays closed to clients', pg_temp.raises('select * from public.skill_works_votes', 'permission denied'));
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(4, 'a visitor reads the per-tool totals', (select yes_count = 1 and no_count = 0 from public.skill_works_by_tool(:a) where tool = 'cursor'));
select pg_temp.check(4, 'a visitor cannot tag a vote', pg_temp.raises(format($$select public.set_skill_works_tool(%L, 'cursor')$$, :a), 'permission denied'));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
