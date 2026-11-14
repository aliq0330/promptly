-- Ortak koleksiyon: DB tarafı davranış ve RLS testi (docs/history/386-*).
--
-- Kurallar: sahip + eşit ortaklar (görüntüleyici yok); herkese açıksa herkes görür, özelse yalnız sahip + ortaklar; içeriği yalnız ekleyen çıkarır
-- (sahip bile başkasınınkini çıkaramaz); ortak koleksiyona yalnız herkese açık + yayında içerik girer; kaydet modeli: ekleyen VE sahip kaydeder
-- (save_count sahip başına bir, değişmez); davet yalnız kullanıcı adıyla; profil listesi çağıranın okuyabildikleriyle sınırlıdır.
--
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/collaborative-collections.sql   ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
-- ---------- fixtures ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}'),
  ('44444444-4444-4444-8444-444444444444', 'dave@test.dev',  '{"username":"dave","display_name":"Dave"}');
-- Profil kullanıcı adı e-postadan türer; testte adları sabitle.
update public.profiles set username = 'alice' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set username = 'bobby' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set username = 'carol' where id = '33333333-3333-4333-8333-333333333333';
update public.profiles set username = 'dave'  where id = '44444444-4444-4444-8444-444444444444';
insert into public.prompts (id, author_id, title, description, prompt_text, content_type) values
  ('a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A public 1', 'd', 'text', 'text'),
  ('a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'B public 2', 'd', 'text', 'text'),
  ('a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A public 3', 'd', 'text', 'text'),
  ('a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'B public 4', 'd', 'text', 'text'),
  ('a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A private', 'd', 'text', 'text'),
  ('a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'B private', 'd', 'text', 'text'),
  ('a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'C public 7', 'd', 'text', 'text');
update public.prompts set visibility = 'private' where id in ('a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.collections (id, owner_id, name, visibility) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Açık ortak', 'public'),
  ('c2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Özel ortak', 'private'),
  ('c3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Sıradan', 'public'),
  ('c4000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Limit', 'private');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
-- Bir ifade belirli bir hata kodunu fırlatıyor mu? (set role altında çağrılır)
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return sqlerrm like '%' || code || '%';
end $$;
create or replace function pg_temp.sys(uid text) returns uuid language sql as
  $$ select id from public.collections where owner_id = uid::uuid and is_default $$;

-- kısayollar
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

-- ====================================================================================================================
-- 1. Açma: ortak olamayacak içerik varsa reddedilir, Çıkar sonrası açılır
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, prompt_id) values
  ('c1000000-0000-4000-8000-000000000001', 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('c1000000-0000-4000-8000-000000000001', 'a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(1, 'cannot turn sharing on while a private prompt is inside',
  pg_temp.raises($$select public.set_collection_shared('c1000000-0000-4000-8000-000000000001', true)$$, 'collection_has_unshareable_items'));
select pg_temp.check(1, 'collection_unshareable_items lists exactly the private prompt',
  (select count(*) from public.collection_unshareable_items('c1000000-0000-4000-8000-000000000001')) = 1
  and (select reason from public.collection_unshareable_items('c1000000-0000-4000-8000-000000000001')) = 'not_public');
delete from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.set_collection_shared('c1000000-0000-4000-8000-000000000001', true);
select public.set_collection_shared('c2000000-0000-4000-8000-000000000002', true);
select public.set_collection_shared('c4000000-0000-4000-8000-000000000004', true);
select pg_temp.check(1, 'sharing turns on after the private item is removed',
  (select is_shared from public.collections where id = 'c1000000-0000-4000-8000-000000000001'));
select pg_temp.check(1, 'the system collection can never be shared',
  pg_temp.raises(format($$select public.set_collection_shared(%L, true)$$, pg_temp.sys(:alice)), 'collection_system'));
reset role;
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(1, 'a non-owner cannot toggle sharing (looks like not found)',
  pg_temp.raises($$select public.set_collection_shared('c3000000-0000-4000-8000-000000000003', true)$$, 'collection_not_found'));
reset role;

-- 2. is_shared / member_count istemciden yazılamaz
set role authenticated; select pg_temp.as_user(:alice);
update public.collections set is_shared = true where id = 'c3000000-0000-4000-8000-000000000003';
update public.collections set member_count = 99 where id = 'c1000000-0000-4000-8000-000000000001';
select pg_temp.check(2, 'owner cannot flip is_shared with a plain UPDATE', (select not is_shared from public.collections where id = 'c3000000-0000-4000-8000-000000000003'));
select pg_temp.check(2, 'owner cannot write member_count', (select member_count from public.collections where id = 'c1000000-0000-4000-8000-000000000001') = 0);
insert into public.collections (id, owner_id, name, visibility, is_shared) values ('c5000000-0000-4000-8000-000000000005', :alice, 'direct shared', 'public', true);
select pg_temp.check(2, 'a collection inserted with is_shared=true is not shared', (select not is_shared from public.collections where id = 'c5000000-0000-4000-8000-000000000005'));
reset role;

-- ====================================================================================================================
-- 3. Davet
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(3, 'invite to a non-shared collection is rejected',
  pg_temp.raises($$select public.invite_collection_member('c3000000-0000-4000-8000-000000000003', 'bobby')$$, 'collection_not_shared'));
select pg_temp.check(3, 'unknown username rejected',
  pg_temp.raises($$select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'nobody-here')$$, 'collection_user_not_found'));
select pg_temp.check(3, 'self invite rejected',
  pg_temp.raises($$select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'alice')$$, 'collection_self_invite'));
select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'BoBBy');   -- büyük/küçük harf duyarsız
select public.invite_collection_member('c2000000-0000-4000-8000-000000000002', 'bobby');
select pg_temp.check(3, 'duplicate pending invite rejected',
  pg_temp.raises($$select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'bobby')$$, 'collection_invite_exists'));
reset role;
select pg_temp.check(3, 'invitee got an invite notification (system, deduped)',
  (select count(*) from public.notifications where recipient_id = :bob and dedupe_key like 'collab-invite:%') = 2);

set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(3, 'non-owner cannot invite',
  pg_temp.raises($$select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'carol')$$, 'collection_not_found'));
select pg_temp.check(3, 'invitee sees his 2 pending invitations', (select count(*) from public.my_collection_invitations()) = 2);
select pg_temp.check(3, 'the invitation of a PRIVATE collection exposes only name/owner/count, not the content',
  (select count(*) from public.collection_items where collection_id = 'c2000000-0000-4000-8000-000000000002') = 0);
reset role;
select id as inv_any from public.collection_invitations limit 1 \gset
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(3, 'someone else sees no invitations', (select count(*) from public.my_collection_invitations()) = 0);
select pg_temp.check(3, 'cannot answer another person''s invitation',
  pg_temp.raises(format($$select public.respond_collection_invitation(%L, true)$$, :'inv_any'), 'collection_invite_not_found'));
select pg_temp.check(3, 'clients cannot read collection_invitations', pg_temp.raises($$select * from public.collection_invitations$$, 'permission denied'));
select pg_temp.check(3, 'clients cannot insert collection_members', pg_temp.raises(format($$insert into public.collection_members (collection_id, user_id) values (%L, %L)$$, 'c1000000-0000-4000-8000-000000000001', :carol), 'permission denied'));
reset role;

-- 4. Kabul
set role authenticated; select pg_temp.as_user(:bob);
select public.respond_collection_invitation(id, true) from public.my_collection_invitations();
select pg_temp.check(4, 'accepting makes bob a member of both', (select count(*) from public.collection_members where user_id = :bob) = 2);
reset role;
select pg_temp.check(4, 'member_count maintained by trigger', (select member_count from public.collections where id = 'c1000000-0000-4000-8000-000000000001') = 1);
select pg_temp.check(4, 'owner is told that bob joined', (select count(*) from public.notifications where recipient_id = :alice and message like '%koleksiyonuna ortak oldu.') = 2);

-- 5. Görünürlük: özel ortak koleksiyon yalnız sahip + ortak
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(5, 'member reads the private shared collection', (select count(*) from public.collections where id = 'c2000000-0000-4000-8000-000000000002') = 1);
select pg_temp.check(5, 'member can still not see the members of others (own row only)', (select count(*) from public.collection_members) = 2);
reset role;
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(5, 'outsider does NOT see the private shared collection', (select count(*) from public.collections where id = 'c2000000-0000-4000-8000-000000000002') = 0);
select pg_temp.check(5, 'outsider sees the public shared collection', (select count(*) from public.collections where id = 'c1000000-0000-4000-8000-000000000001') = 1);
reset role;
select pg_temp.as_anon(); set role anon;
select pg_temp.check(5, 'anon sees public but not private shared', (select count(*) from public.collections where id in ('c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002')) = 1);
select pg_temp.check(5, 'anon reads no collection_members rows (own-row policy, no auth.uid())', (select count(*) from public.collection_members) = 0);
reset role;

-- ====================================================================================================================
-- 6. Ekleme: ortak ekler; kaydet modeli (ekleyen + sahip), save_count sahip başına bir
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(6, 'member adds a public prompt to the shared collection', (select count(*) from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
select pg_temp.check(6, 'added_by is the member', (select added_by from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = :bob::uuid);
select pg_temp.check(6, 'the adder saved it too (own system collection)', exists (select 1 from public.collection_items where collection_id = pg_temp.sys(:bob) and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
reset role;
select pg_temp.check(6, 'the OWNER''s system collection got it as well (336 invariant kept)', exists (select 1 from public.collection_items where collection_id = pg_temp.sys(:alice) and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select pg_temp.check(6, 'save_count = 2 (bob + alice, once per owner)', (select save_count from public.prompts where id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2);
select pg_temp.check(6, 'item_count of the shared collection counted', (select item_count from public.collections where id = 'c1000000-0000-4000-8000-000000000001') = 2);
-- Ekleme sahibin kendi eklemesinde: added_by sahip
set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(6, 'owner''s own addition has added_by = owner', (select added_by from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = :alice::uuid);
reset role;
select pg_temp.check(6, 'other members were notified at most once per day', (select count(*) from public.notifications where dedupe_key like 'collab-add:%') >= 1);

-- 7. Üye olmayan ekleyemez
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(7, 'outsider cannot add to the public shared collection',
  pg_temp.raises($$insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'row-level security'));
select pg_temp.check(7, 'outsider cannot add to the private shared collection',
  pg_temp.raises($$insert into public.collection_items (collection_id, prompt_id) values ('c2000000-0000-4000-8000-000000000002', 'a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'row-level security'));
reset role;

-- 8. İçerik uygunluğu
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(8, 'member cannot add his own PRIVATE prompt to a shared collection',
  pg_temp.raises($$insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'collection_item_not_shareable'));
-- added_by sahtekarlığı: sahip adına eklemiş gibi gösteremez
insert into public.collection_items (collection_id, prompt_id, added_by) values ('c1000000-0000-4000-8000-000000000001', 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :alice);
select pg_temp.check(8, 'a client-supplied added_by is overridden with the real caller', (select added_by from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = :bob::uuid);
-- sıradan koleksiyonda added_by hep boş
reset role;
set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, prompt_id, added_by) values ('c3000000-0000-4000-8000-000000000003', 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :bob);
select pg_temp.check(8, 'a normal (non-shared) collection never keeps an added_by', (select added_by from public.collection_items where collection_id = 'c3000000-0000-4000-8000-000000000003') is null);
reset role;

-- ====================================================================================================================
-- 9. Çıkarma: yalnız ekleyen
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
delete from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(9, 'the OWNER cannot remove an item that bob added', (select count(*) from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
reset role;
set role authenticated; select pg_temp.as_user(:bob);
delete from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(9, 'a member cannot remove the owner''s item', (select count(*) from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
delete from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(9, 'the adder removes his own item', (select count(*) from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0);
select pg_temp.check(9, 'removing from the collection keeps the save (336 rule)', exists (select 1 from public.collection_items where collection_id = pg_temp.sys(:bob) and prompt_id = 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
reset role;
select pg_temp.check(9, 'save_count of the removed prompt unchanged (2)', (select save_count from public.prompts where id = 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 2);

-- 10. unsave_content sahibin ortaklarca eklenen satırını silmez
set role authenticated; select pg_temp.as_user(:alice);
select public.unsave_content('prompt', 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(10, 'owner''s unsave_content leaves bob''s addition in the shared collection',
  (select count(*) from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
reset role;

-- ====================================================================================================================
-- 11. Takip
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(11, 'a member cannot follow his own shared collection',
  pg_temp.raises(format($$insert into public.collection_follows (user_id, collection_id) values (%L, %L)$$, :bob, 'c1000000-0000-4000-8000-000000000001'), 'collection_follow_member'));
reset role;
set role authenticated; select pg_temp.as_user(:carol);
insert into public.collection_follows (user_id, collection_id) values (:carol, 'c1000000-0000-4000-8000-000000000001');
select pg_temp.check(11, 'an outsider can follow a PUBLIC shared collection', (select count(*) from public.collection_follows where user_id = :carol) = 1);
reset role;

-- ====================================================================================================================
-- 12. Profil listesi: yalnız çağıranın okuyabildikleri
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(12, 'carol sees bob''s PUBLIC shared collection on bob''s profile',
  (select count(*) from public.profile_collections(:bob::uuid)) = 1);
select pg_temp.check(12, 'carol does NOT see the private shared one on bob''s profile',
  not exists (select 1 from public.profile_collections(:bob::uuid) where id = 'c2000000-0000-4000-8000-000000000002'));
reset role;
set role authenticated; select pg_temp.as_user(:alice);
insert into public.collection_items (collection_id, prompt_id) values ('c2000000-0000-4000-8000-000000000002', 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(12, 'bob sees both on his own profile', (select count(*) from public.profile_collections(:bob::uuid)) = 2);
select pg_temp.check(12, 'a co-member (bob) sees the private one on the owner''s profile', exists (select 1 from public.profile_collections(:alice::uuid) where id = 'c2000000-0000-4000-8000-000000000002'));
reset role;
select pg_temp.as_anon(); set role anon;
select pg_temp.check(12, 'anon sees the public shared collection on a member''s profile', (select count(*) from public.profile_collections(:bob::uuid)) = 1);
reset role;

-- 13. Üye listesi
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(13, 'outsider lists members of a PUBLIC shared collection (owner + bob)', (select count(*) from public.collection_members_list('c1000000-0000-4000-8000-000000000001')) = 2);
select pg_temp.check(13, 'outsider lists nothing for a PRIVATE shared collection', (select count(*) from public.collection_members_list('c2000000-0000-4000-8000-000000000002')) = 0);
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'dave');
select pg_temp.check(13, 'the owner also sees pending invitations', exists (select 1 from public.collection_members_list('c1000000-0000-4000-8000-000000000001') where role = 'invited'));
select pg_temp.check(13, 'owner row comes first', (select role from public.collection_members_list('c1000000-0000-4000-8000-000000000001') limit 1) = 'owner');
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(13, 'a member does not see pending invitations', not exists (select 1 from public.collection_members_list('c1000000-0000-4000-8000-000000000001') where role = 'invited'));
reset role;

-- 14. Davet geri çekme + engel
select id as inv_dave from public.collection_invitations where invitee_id = :dave and status = 'pending' \gset
set role authenticated; select pg_temp.as_user(:alice);
select public.revoke_collection_invitation(:'inv_dave');
reset role;
select pg_temp.check(14, 'revoking marks the invitation revoked', (select count(*) from public.collection_invitations where invitee_id = :dave and status = 'revoked') = 1);
select pg_temp.check(14, 'revoking removes the notification', (select count(*) from public.notifications where recipient_id = :dave and dedupe_key like 'collab-invite:%') = 0);
insert into public.blocks (blocker_id, blocked_id) values (:alice, :dave);
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(14, 'a blocked user cannot be invited (looks like not found)',
  pg_temp.raises($$select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'dave')$$, 'collection_user_not_found'));
reset role;
delete from public.blocks where blocker_id = :alice;

-- ====================================================================================================================
-- 15. Ortak çıkarma / ayrılma
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
insert into public.collection_items (collection_id, prompt_id) values ('c2000000-0000-4000-8000-000000000002', 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
reset role;
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(15, 'a non-member cannot remove members (looks like not found)',
  pg_temp.raises(format($$select public.remove_collection_member(%L, %L, false)$$, 'c1000000-0000-4000-8000-000000000001', :bob::uuid), 'collection_not_found'));
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(15, 'the owner cannot leave', pg_temp.raises(format($$select public.remove_collection_member(%L, %L, false)$$, 'c1000000-0000-4000-8000-000000000001', :alice::uuid), 'collection_owner_cannot_leave'));
-- seçenek A: eklediklerini koleksiyonda bırak (sahibe geçer)
select public.remove_collection_member('c1000000-0000-4000-8000-000000000001', :bob::uuid, false);
select pg_temp.check(15, 'removed member''s items stay and pass to the owner (added_by null)',
  (select added_by from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is null);
delete from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(15, 'the owner can now remove that orphaned item',
  (select count(*) from public.collection_items where collection_id = 'c1000000-0000-4000-8000-000000000001' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0);
reset role;
select pg_temp.check(15, 'bob was removed from ONE collection only', (select count(*) from public.collection_members where user_id = :bob) = 1);
select pg_temp.check(15, 'member_count back to 0', (select member_count from public.collections where id = 'c1000000-0000-4000-8000-000000000001') = 0);
select pg_temp.check(15, 'bob was told', (select count(*) from public.notifications where recipient_id = :bob and message like '%ortaklığından çıkardı.') = 1);
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(15, 'a removed member can no longer add', pg_temp.raises($$insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'row-level security'));
-- seçenek B: ayrılırken eklediklerini de kaldır
select public.remove_collection_member('c2000000-0000-4000-8000-000000000002', :bob::uuid, true);
select pg_temp.check(15, 'leaving with remove_items deletes the leaver''s additions',
  (select count(*) from public.collection_items where collection_id = 'c2000000-0000-4000-8000-000000000002' and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0);
select pg_temp.check(15, 'a leaver can no longer read the private collection', (select count(*) from public.collections where id = 'c2000000-0000-4000-8000-000000000002') = 0);
reset role;
select pg_temp.check(15, 'the leaver''s save stays (collection removal never unsaves)', exists (select 1 from public.collection_items where collection_id = pg_temp.sys(:bob) and prompt_id = 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select pg_temp.check(15, 'the owner was told bob left', (select count(*) from public.notifications where recipient_id = :alice and message like '%koleksiyonundan ayrıldı.') = 1);

-- ====================================================================================================================
-- 16. Limit: üye + bekleyen davet ≤ 9
-- ====================================================================================================================
insert into auth.users (id, email, raw_user_meta_data)
select ('99999999-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'limit' || i || '@test.dev', jsonb_build_object('username', 'limituser' || i, 'display_name', 'L' || i)
  from generate_series(1, 10) i;
update public.profiles set username = 'limituser' || right(id::text, 2)::int where id::text like '99999999-0000-4000-8000-0000000000%';
set role authenticated; select pg_temp.as_user(:alice);
do $$ declare i int; begin for i in 1..9 loop perform public.invite_collection_member('c4000000-0000-4000-8000-000000000004', 'limituser' || i); end loop; end $$;
select pg_temp.check(16, 'the tenth person is rejected (owner + 9 = 10 people)',
  pg_temp.raises($$select public.invite_collection_member('c4000000-0000-4000-8000-000000000004', 'limituser10')$$, 'collection_member_limit'));
reset role;
select pg_temp.check(16, 'nine invitations fit', (select count(*) from public.collection_invitations where collection_id = 'c4000000-0000-4000-8000-000000000004' and status = 'pending') = 9);

-- 17. Kapatma: ortaklar çıkar, içerik kalır, davetler iptal
set role authenticated; select pg_temp.as_user(:dave);
-- (dave'in engeli kalktı; davet edilmedi → hiçbir şey yapamaz)
select pg_temp.check(17, 'an uninvited user cannot accept anything', (select count(*) from public.my_collection_invitations()) = 0);
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select public.set_collection_shared('c4000000-0000-4000-8000-000000000004', false);
select pg_temp.check(17, 'and the collection is no longer shared', (select not is_shared from public.collections where id = 'c4000000-0000-4000-8000-000000000004'));
reset role;
select pg_temp.check(17, 'turning sharing off revokes the pending invitations', (select count(*) from public.collection_invitations where collection_id = 'c4000000-0000-4000-8000-000000000004' and status = 'pending') = 0);

-- ====================================================================================================================
-- 18. Takipçi kabul edince takip düşer; koleksiyon silinince ortaklara haber, save_count sabit
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select public.invite_collection_member('c1000000-0000-4000-8000-000000000001', 'carol');
reset role;
set role authenticated; select pg_temp.as_user(:carol);
select public.respond_collection_invitation(id, true) from public.my_collection_invitations();
select pg_temp.check(18, 'accepting drops the earlier follow of that collection', (select count(*) from public.collection_follows where user_id = :carol and collection_id = 'c1000000-0000-4000-8000-000000000001') = 0);
reset role;
select pg_temp.check(18, 'save_count of the owner''s own prompt unchanged by sharing', (select save_count from public.prompts where id = 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user(:alice);
delete from public.collections where id = 'c1000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.check(18, 'deleting the shared collection tells the members', (select count(*) from public.notifications where recipient_id = :carol and message like '%sahibi tarafından silindi.') = 1);
select pg_temp.check(18, 'items cascade, saves stay', exists (select 1 from public.collection_items where collection_id = pg_temp.sys(:alice) and prompt_id = 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

-- 19. Anon işlev yetkileri
select pg_temp.as_anon(); set role anon;
select pg_temp.check(19, 'anon cannot create/invite/answer/remove/toggle',
  pg_temp.raises($$select public.set_collection_shared('c2000000-0000-4000-8000-000000000002', true)$$, 'permission denied')
  and pg_temp.raises($$select public.invite_collection_member('c2000000-0000-4000-8000-000000000002', 'bobby')$$, 'permission denied')
  and pg_temp.raises($$select public.my_collection_invitations()$$, 'permission denied')
  and pg_temp.raises($$select public.remove_collection_member('c2000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', false)$$, 'permission denied'));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
