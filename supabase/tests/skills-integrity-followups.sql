-- Skill bütünlük düzeltmeleri (docs/history/417-*): (1) ortak koleksiyon korumasında Skill dalı, (2) Skill silinince bildirimlerin temizlenmesi.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');
-- Alice'in üç Skill'i: herkese açık, taslak, özel. Bob'un bir Skill'i (bildirim temizliği için).
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  ('71700000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'pub',   'Pub',   's', '# r', 'published', 'public'),
  ('71700000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'draft', 'Draft', 's', '# r', 'draft', 'public'),
  ('71700000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'priv',  'Priv',  's', '# r', 'published', 'private'),
  ('71700000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'bobs',  'Bobs',  's', '# r', 'published', 'public'),
  ('71700000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'other', 'Other', 's', '# r', 'published', 'public');
insert into public.collections (id, owner_id, name, visibility) values
  ('c1700000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Shared', 'public'),
  ('c1700000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Plain',  'private');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claim.role', 'authenticated', false); end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like '%' || code || '%'; end $$;

\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set pub   '''71700000-0000-4000-8000-000000000001'''
\set draft '''71700000-0000-4000-8000-000000000002'''
\set priv  '''71700000-0000-4000-8000-000000000003'''
\set bobs  '''71700000-0000-4000-8000-000000000004'''
\set other '''71700000-0000-4000-8000-000000000005'''

-- === 1. Ortak koleksiyon koruması ===============================================================================
set role authenticated; select pg_temp.as_user(:alice);
select public.set_collection_shared('c1700000-0000-4000-8000-000000000001', true);
select pg_temp.check(1, 'the collection is now shared', (select is_shared from public.collections where id = 'c1700000-0000-4000-8000-000000000001'));

select pg_temp.check(2, 'a draft skill cannot be added to a shared collection',
  pg_temp.raises($$insert into public.collection_items (collection_id, skill_id) values ('c1700000-0000-4000-8000-000000000001', '71700000-0000-4000-8000-000000000002')$$, 'collection_item_not_shareable'));
select pg_temp.check(3, 'a private skill cannot be added to a shared collection',
  pg_temp.raises($$insert into public.collection_items (collection_id, skill_id) values ('c1700000-0000-4000-8000-000000000001', '71700000-0000-4000-8000-000000000003')$$, 'collection_item_not_shareable'));
insert into public.collection_items (collection_id, skill_id) values ('c1700000-0000-4000-8000-000000000001', '71700000-0000-4000-8000-000000000001');
select pg_temp.check(4, 'a published public skill is added to a shared collection',
  exists (select 1 from public.collection_items where collection_id = 'c1700000-0000-4000-8000-000000000001' and skill_id = '71700000-0000-4000-8000-000000000001'));
select pg_temp.check(5, 'the adder is recorded on the shared item',
  (select added_by from public.collection_items where collection_id = 'c1700000-0000-4000-8000-000000000001' and skill_id = '71700000-0000-4000-8000-000000000001') = :alice);
-- Ortak olmayan koleksiyonda özel/taslak Skill (kendi Skill'in) eskisi gibi eklenebilir: koruma yalnız ortak koleksiyonu kapsar.
insert into public.collection_items (collection_id, skill_id) values ('c1700000-0000-4000-8000-000000000002', '71700000-0000-4000-8000-000000000003');
select pg_temp.check(6, 'a private skill is still allowed in a non-shared collection',
  exists (select 1 from public.collection_items where collection_id = 'c1700000-0000-4000-8000-000000000002' and skill_id = '71700000-0000-4000-8000-000000000003'));
reset role;

-- === 2. Skill silinince bildirimler silinir =====================================================================
-- Bob'un Skill'ine: yorum (hl eki), yayın, sürüm ve beğeni bildirimleri; başka Skill'e ve başka hedefe bir bildirim değişmemeli.
insert into public.notifications (recipient_id, actor_id, type, message, target_href) values
  (:bob,   :alice, 'comment', 'Skill''ine yorum yaptı: "x"', '/skills/local?id=71700000-0000-4000-8000-000000000004&hl=comment:aaaaaaaa-0000-4000-8000-000000000001'),
  (:alice, :bob,   'system',  'Yeni bir Skill yayınladı: "Bobs"', '/skills/local?id=71700000-0000-4000-8000-000000000004'),
  (:alice, :bob,   'system',  'Sabitlediğin Skill''in yeni sürümü yayınlandı: "Bobs 1.0.0"', '/skills/local?id=71700000-0000-4000-8000-000000000004'),
  (:bob,   :alice, 'comment', 'Skill''ine yorum yaptı: "y"', '/skills/local?id=71700000-0000-4000-8000-000000000005&hl=comment:aaaaaaaa-0000-4000-8000-000000000002'),
  (:bob,   :alice, 'system',  'bir sistem bildirimi', '/saved');
select pg_temp.check(7, 'five notifications exist before the delete', (select count(*) from public.notifications where target_href in ('/saved') or target_href like '/skills/local?id=71700000-0000-4000-8000-00000000000%') = 5);

set role authenticated; select pg_temp.as_user(:bob);
delete from public.skills where id = '71700000-0000-4000-8000-000000000004';
reset role;
select pg_temp.check(8, 'the deleted skill''s notifications are gone',
  not exists (select 1 from public.notifications where target_href like '/skills/local?id=71700000-0000-4000-8000-000000000004%'));
select pg_temp.check(9, 'another skill''s notification is untouched',
  exists (select 1 from public.notifications where target_href like '/skills/local?id=71700000-0000-4000-8000-000000000005%'));
select pg_temp.check(10, 'a non-skill notification is untouched', exists (select 1 from public.notifications where target_href = '/saved'));

-- Tetikleyici fonksiyonunu istemci rolleri çağıramaz.
select pg_temp.check(11, 'clients cannot execute the cleanup trigger function',
  not has_function_privilege('anon', 'public.cleanup_notifications_for_deleted_skill()', 'execute')
  and not has_function_privilege('authenticated', 'public.cleanup_notifications_for_deleted_skill()', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
