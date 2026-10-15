-- Kaydet / koleksiyon üyeliği: DB tarafı davranış ve RLS testi (docs/history/168-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla (auth şeması,
-- roller, storage, supabase_realtime — bkz. docs/history/158-*) temiz bir yerel
-- PostgreSQL'e oynatıldıktan sonra, süper kullanıcıyla:  psql -d <db> -f saved-collections.sql
-- Sonda her kontrol PASS/FAIL yazar; "FAILED=0" beklenir. Fixture'lar kalıcıdır —
-- ikinci çalıştırma için veritabanını yeniden kurun.
\set ON_ERROR_STOP off
\pset pager off
-- ---------- fixtures (as superuser) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'P', 'd', 'text', 'text');
insert into public.workflows (id, creator_id, title, status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'W', 'published');
insert into public.collections (id, owner_id, name, visibility) values
  ('c0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Yazılım', 'private'),
  ('c0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Tasarım', 'public'),
  ('c0000003-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Bob public', 'public');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;

-- sanity: handle_new_user gave each user exactly one default collection
select pg_temp.check(0, 'each user has exactly one default (Genel) collection',
  (select count(*) from public.collections where is_default and owner_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')) = 2);

set role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 1. add to Yazılım -> saved (member of >= 1 own collection)
insert into public.collection_items (collection_id, prompt_id) values ('c0000001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(1, 'alice saved after adding to Yazılım',
  exists(select 1 from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid() and ci.prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

-- 2. add to Tasarım too -> two memberships, ONE distinct work, save_count counted once per owner
insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(2, 'two memberships but one distinct work in the saved union',
  (select count(*) from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid()) = 2
  and (select count(distinct ci.prompt_id) from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid()) = 1);
reset role;
select pg_temp.check(2, 'prompts.save_count = 1 (one per distinct owner, not per collection)', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1,
  (select save_count::text from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- idempotent add: duplicate insert is a unique violation (23505) the client treats as success; no extra row
do $$ begin
  begin
    insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    perform pg_temp.check(7, 'duplicate add raises 23505', false, 'no error');
  exception when unique_violation then
    perform pg_temp.check(7, 'duplicate add raises 23505 (client treats as success)', true);
  end;
end $$;
select pg_temp.check(7, 'still exactly 2 membership rows after duplicate add',
  (select count(*) from public.collection_items where prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2);

-- 3. remove from Yazılım only -> stays in Tasarım
delete from public.collection_items where collection_id='c0000001-0000-4000-8000-000000000001' and prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(3, 'after leaving Yazılım it is still in Tasarım',
  (select array_agg(collection_id::text) from public.collection_items where prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['c0000002-0000-4000-8000-000000000002']);
reset role;
select pg_temp.check(3, 'save_count stays 1 while another collection holds it', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- repeated/concurrent remove of an already-removed row is a harmless no-op
delete from public.collection_items where collection_id='c0000001-0000-4000-8000-000000000001' and prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(7, 'removing an already-removed membership changes nothing',
  (select count(*) from public.collection_items where prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);

-- 5. default Genel: add, then remove from Genel only -> Tasarım untouched
insert into public.collection_items (collection_id, prompt_id)
  select id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' from public.collections where owner_id=auth.uid() and is_default;
delete from public.collection_items ci using public.collections c
  where ci.collection_id=c.id and c.owner_id=auth.uid() and c.is_default and ci.prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(5, 'removing from Genel leaves the Tasarım membership',
  (select array_agg(collection_id::text) from public.collection_items where prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['c0000002-0000-4000-8000-000000000002']);

-- 10. same rules for workflow targets
insert into public.collection_items (collection_id, workflow_id) values
  ('c0000001-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('c0000002-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
delete from public.collection_items where collection_id='c0000001-0000-4000-8000-000000000001' and workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.check(10, 'workflow: leaving one collection keeps the other',
  (select array_agg(collection_id::text) from public.collection_items where workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = array['c0000002-0000-4000-8000-000000000002']);

-- 4. finally leave Tasarım -> in no collection at all
delete from public.collection_items where collection_id='c0000002-0000-4000-8000-000000000002' and prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(4, 'no membership left -> not saved',
  not exists(select 1 from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid() and ci.prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
reset role;
select pg_temp.check(4, 'save_count back to 0', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0);

-- 8. Bob cannot touch Alice's memberships
set role authenticated; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $$ begin
  begin
    insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    perform pg_temp.check(8, 'bob cannot INSERT into alice''s collection', false, 'insert succeeded');
  exception when insufficient_privilege then
    perform pg_temp.check(8, 'bob cannot INSERT into alice''s collection', true);
  end;
end $$;
-- Bob sees Alice's PUBLIC Tasarım workflow row (read is public by design) but cannot delete it
with d as (delete from public.collection_items where collection_id='c0000002-0000-4000-8000-000000000002' and workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1)
select pg_temp.check(8, 'bob DELETE on alice''s membership affects 0 rows', (select count(*) from d) = 0);
reset role;
select pg_temp.check(8, 'alice''s Tasarım workflow membership survived bob', exists(select 1 from public.collection_items where collection_id='c0000002-0000-4000-8000-000000000002' and workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
-- Alice's PRIVATE collection rows are invisible to bob
insert into public.collection_items (collection_id, prompt_id) values ('c0000001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
set role authenticated; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check(8, 'bob cannot see memberships of alice''s private collection', (select count(*) from public.collection_items where collection_id='c0000001-0000-4000-8000-000000000001') = 0);
-- Bob's own-owner filter (what fetchSavedItems sends) never returns Alice's public rows
select pg_temp.check(8, 'owner-filtered saved query for bob excludes alice''s public collection rows',
  (select count(*) from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid()) = 0);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
