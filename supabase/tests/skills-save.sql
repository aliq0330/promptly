-- Skill: Kaydet + koleksiyon + ortak koleksiyon (docs/history/391-*): `collection_items.skill_id` beşinci hedeftir, kayıt modeli (336/386) değişmez.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  ('56100000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'pub', 'Pub', 's', '# r', 'published', 'public'),
  ('56100000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'draft', 'Draft', 's', '# r', 'draft', 'public'),
  ('56100000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'priv', 'Priv', 's', '# r', 'published', 'private');
insert into public.collections (id, owner_id, name, visibility) values
  ('c1000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'A1', 'private'),
  ('c1000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'A2', 'public');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claim.role', 'authenticated', false); end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like '%' || code || '%'; end $$;
create or replace function pg_temp.sys(uid text) returns uuid language sql as $$ select id from public.collections where owner_id = uid::uuid and is_default $$;
create or replace function pg_temp.holders(sk uuid, uid text) returns text[] language sql as
  $$ select coalesce(array_agg(c.name order by c.name), '{}') from public.collection_items ci join public.collections c on c.id = ci.collection_id where c.owner_id = uid::uuid and ci.skill_id = sk $$;

\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set pub   '''56100000-0000-4000-8000-000000000001'''
\set draft '''56100000-0000-4000-8000-000000000002'''
\set priv  '''56100000-0000-4000-8000-000000000003'''

set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, skill_id) values (pg_temp.sys(:alice), :pub);
select pg_temp.check(1, 'save puts the skill only in the system collection', pg_temp.holders(:pub, :alice) = array['Kaydedilenler']);
reset role;
select pg_temp.check(1, 'skills.save_count = 1', (select save_count from public.skills where id = :pub) = 1);
set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, skill_id) values ('c1000001-0000-4000-8000-000000000001', :pub);
select pg_temp.check(2, 'adding to a collection keeps the system row', pg_temp.holders(:pub, :alice) = array['A1', 'Kaydedilenler']);
insert into public.collection_items (collection_id, skill_id) values ('c1000002-0000-4000-8000-000000000002', :pub);
reset role;
select pg_temp.check(2, 'the counter counts the owner once, not once per collection', (select save_count from public.skills where id = :pub) = 1);
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(2, 'the same skill cannot be added twice to one collection', pg_temp.raises(format($$insert into public.collection_items (collection_id, skill_id) values ('c1000001-0000-4000-8000-000000000001', %L)$$, :pub), 'duplicate key'));
delete from public.collection_items where collection_id = 'c1000001-0000-4000-8000-000000000001' and skill_id = :pub;
reset role;
select pg_temp.check(3, 'removing from one collection keeps the save and the counter', pg_temp.holders(:pub, :alice) = array['A2', 'Kaydedilenler'] and (select save_count from public.skills where id = :pub) = 1);
set role authenticated; select pg_temp.as_user(:alice);
select public.unsave_content('skill', :pub);
reset role;
select pg_temp.check(3, 'unsave_content removes every row and takes the counter back', pg_temp.holders(:pub, :alice) = '{}' and (select save_count from public.skills where id = :pub) = 0);

-- Okuyamadığı Skill kaydedilemez (sayaç şişmez, varlık sızmaz)
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'a draft skill of someone else cannot be saved', pg_temp.raises(format($$insert into public.collection_items (collection_id, skill_id) values (%L, %L)$$, pg_temp.sys(:alice), :draft), 'skill_not_found'));
select pg_temp.check(4, 'a private skill of someone else cannot be saved', pg_temp.raises(format($$insert into public.collection_items (collection_id, skill_id) values (%L, %L)$$, pg_temp.sys(:alice), :priv), 'skill_not_found'));
select pg_temp.check(4, 'unsave_content rejects unknown types', pg_temp.raises($$select public.unsave_content('space', gen_random_uuid())$$, 'unsave_invalid_type'));
reset role;
select pg_temp.check(4, 'those failed saves left the counters at 0', (select coalesce(sum(save_count), 0) from public.skills where id in (:draft, :priv)) = 0);
-- Sahibi kendi taslağını kaydedebilir
set role authenticated; select pg_temp.as_user(:bob);
insert into public.collection_items (collection_id, skill_id) values (pg_temp.sys(:bob), :draft);
select pg_temp.check(5, 'the owner can save their own draft', pg_temp.holders(:draft, :bob) = array['Kaydedilenler']);
reset role;

-- İstatistik: kaydedenler
set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, skill_id) values (pg_temp.sys(:alice), :pub);
select pg_temp.check(6, 'content_engagers lists who saved a skill', (select count(*) from public.content_engagers('skill', :pub, 'saves')) = 1);
reset role;

-- Ortak koleksiyon: yalnız herkese açık + yayında Skill
insert into public.collections (id, owner_id, name, visibility) values ('c1000003-0000-4000-8000-000000000003', :bob, 'B-shared', 'public');
insert into public.collection_items (collection_id, skill_id) values ('c1000003-0000-4000-8000-000000000003', :draft);
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(7, 'a collection holding a draft skill cannot be made shared', pg_temp.raises($$select public.set_collection_shared('c1000003-0000-4000-8000-000000000003', true)$$, 'collection_has_unshareable_items'));
select pg_temp.check(7, 'collection_unshareable_items names the skill', exists (select 1 from public.collection_unshareable_items('c1000003-0000-4000-8000-000000000003') u where u.content_type = 'skill' and u.title = 'Draft'));
delete from public.collection_items where collection_id = 'c1000003-0000-4000-8000-000000000003';
insert into public.collection_items (collection_id, skill_id) values ('c1000003-0000-4000-8000-000000000003', :pub);
select public.set_collection_shared('c1000003-0000-4000-8000-000000000003', true);
reset role;
select pg_temp.check(7, 'a published public skill allows sharing', (select is_shared from public.collections where id = 'c1000003-0000-4000-8000-000000000003'));

-- Silme: Skill silinince kayıt satırları gider, sayaç tutarlı
delete from public.skills where id = :draft;
select pg_temp.check(8, 'deleting a skill removes its collection rows', not exists (select 1 from public.collection_items where skill_id = :draft));
-- "tam biri dolu"
select pg_temp.check(8, 'a row with two targets is rejected', pg_temp.raises(format($$insert into public.collection_items (collection_id, skill_id, prompt_id) values (%L, %L, gen_random_uuid())$$, 'c1000001-0000-4000-8000-000000000001', :pub), 'exactly_one_target'));
select pg_temp.check(8, 'a row without target is rejected', pg_temp.raises($$insert into public.collection_items (collection_id) values ('c1000001-0000-4000-8000-000000000001')$$, 'exactly_one_target'));

-- Bildirimler: yayın → takipçilere, yeni sürüm → sabitleyenlere
insert into public.follows (follower_id, following_id) values (:alice, :bob);
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  ('56100000-0000-4000-8000-000000000009', :bob, 'new', 'Yeni Skill', 's', '# r', 'draft', 'public');
select pg_temp.check(9, 'a draft publishes nobody', not exists (select 1 from public.notifications where dedupe_key like 'skill_published:56100000-0000-4000-8000-000000000009:%'));
update public.skills set status = 'published' where id = '56100000-0000-4000-8000-000000000009';
select pg_temp.check(9, 'publishing notifies followers with the skill link', exists (select 1 from public.notifications where recipient_id = :alice and actor_id = :bob and type = 'system' and message like 'Yeni bir Skill yayınladı:%' and target_href = '/skills/local?id=56100000-0000-4000-8000-000000000009'));
update public.skills set title = 'Yeni Skill 2' where id = '56100000-0000-4000-8000-000000000009';
select pg_temp.check(9, 'an edit does not notify again', (select count(*) from public.notifications where dedupe_key like 'skill_published:56100000-0000-4000-8000-000000000009:%') = 1);
insert into public.skill_versions (skill_id, version, changelog, package_path, package_sha256, package_size, file_count, manifest)
  values ('56100000-0000-4000-8000-000000000009', '1.0.0', '', '56100000-0000-4000-8000-000000000009/packages/1.0.0-aaaaaaaaaaaaaaaa.zip', repeat('a', 64), 10, 0, '{}'::jsonb);
insert into public.skill_pins (user_id, skill_id, version) values (:carol, '56100000-0000-4000-8000-000000000009', '1.0.0');
insert into public.skill_versions (skill_id, version, changelog, package_path, package_sha256, package_size, file_count, manifest)
  values ('56100000-0000-4000-8000-000000000009', '1.1.0', 'n', '56100000-0000-4000-8000-000000000009/packages/1.1.0-bbbbbbbbbbbbbbbb.zip', repeat('b', 64), 10, 0, '{}'::jsonb);
select pg_temp.check(9, 'a new version notifies the people who pinned the skill', exists (select 1 from public.notifications where recipient_id = :carol and message like 'Sabitlediğin Skill''in yeni sürümü yayınlandı:%'));
select pg_temp.check(9, 'a non-pinner is not notified of the version', not exists (select 1 from public.notifications where recipient_id = :alice and message like 'Sabitlediğin%'));

-- Yaratıcı paneli
insert into public.prompt_likes (user_id, skill_id) values (:alice, :pub);
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(10, 'creator_insights_skills counts the owner skill reactions', (select reactions from public.creator_insights_skills(30) where skill_id = :pub) = 1);
select pg_temp.check(10, 'only the owner published public skills are listed', (select count(*) from public.creator_insights_skills(30)) = 2);
select pg_temp.as_user(:alice);
select pg_temp.check(10, 'a non-owner sees none of them', (select count(*) from public.creator_insights_skills(30)) = 0);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
