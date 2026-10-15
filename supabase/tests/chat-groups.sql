-- Grup sohbeti ve topluluk sistemi: DB/RLS/RPC testi (docs/history/172-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla temiz bir yerel PostgreSQL 16'ya
-- oynatıldıktan sonra (supabase/tests/run-local.sh bunu yapar), süper kullanıcıyla:
--   psql -d <db> -f chat-groups.sql
-- Sonda her kontrol PASS/FAIL yazar; "FAILED=0" beklenir. Fixture'lar kalıcıdır — ikinci çalıştırma
-- için veritabanını yeniden kurun.
-- Kullanıcılar: alice(owner) bobby(admin) carol(moderator) dave(member) erin frank gina hank ivy jack.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''
\set hank  '''88888888-8888-4888-8888-888888888888'''
\set ivy   '''99999999-9999-4999-8999-999999999999'''
\set jack  '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values
  (:alice, 'alice'), (:bobby, 'bobby'), (:carol, 'carol'), (:dave, 'dave'), (:erin, 'erin'),
  (:frank, 'frank'), (:gina, 'gina'), (:hank, 'hank'), (:ivy, 'ivy'), (:jack, 'jack')
) as u(id, name);
-- gina yalnızca takip ettiklerinden mesaj kabul eder (ortak grup olması bunu aşmamalı).
update public.profiles set message_privacy = 'followers_only' where id = :gina;

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
-- Bir sorguyu alt-işlemde çalıştırır: 'ok' ya da hata metni.
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._ctx_get(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text),
  public._ctx_get(text), public._g(text) to public;

-- ============================================================================
-- 1. Oluşturma ve doğrulama
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _c1 as select public.create_chat_group('Tasarım Atölyesi', 'Kapalı grup', 'private', null, 256, array[:bobby, :carol, :dave]::uuid[]) as j;
reset role;
insert into public._ctx select 'g1', j->>'group_id' from _c1;
select public._check(1, 'create: kapalı grup oluştu, kurucu owner, 3 davet gitti, üye sayısı 1',
  (select kind from public.conversations where id = public._g('g1')) = 'group'
  and (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :alice) = 'owner'
  and (select member_count from public.chat_groups where id = public._g('g1')) = 1
  and (select (j->>'invited_count')::int from _c1) = 3);

set role authenticated;
select public._as_user(:alice);
select public._check(2, 'create: boş / yalnız boşluk / 61 karakterlik ad reddedilir',
  public._try('select public.create_chat_group('''')') like '%invalid_name%'
  and public._try('select public.create_chat_group(''    '')') like '%invalid_name%'
  and public._try(format('select public.create_chat_group(%L)', repeat('x', 61))) like '%invalid_name%');
select public._check(3, 'create: geçersiz görünürlük, üye sınırı ve avatar adresi reddedilir',
  public._try('select public.create_chat_group(''A'', null, ''secret'')') like '%invalid_visibility%'
  and public._try('select public.create_chat_group(''A'', null, ''public'', null, 1)') like '%invalid_member_limit%'
  and public._try('select public.create_chat_group(''A'', null, ''public'', ''https://evil.example/x.png'')') like '%invalid_avatar%');
select public._check(4, 'istemci doğrudan grup sohbeti / grup üyeliği / grup satırı oluşturamaz',
  public._try('insert into public.conversations (kind) values (''group'')') like '%group_creation_via_rpc%'
  and public._try(format('insert into public.conversation_members (conversation_id, user_id) values (%L, %L)', public._g('g1'), :erin)) like '%group_membership_via_rpc%'
  and public._try(format('insert into public.chat_groups (id, name) values (%L, ''x'')', gen_random_uuid())) like '%permission denied%');
reset role;

-- ============================================================================
-- 2. Davetler: yalnız davetli yanıtlar, tek kullanımlık, iptal/süre
-- ============================================================================
insert into public._ctx select 'inv_bobby', id::text from public.chat_group_invitations where group_id = public._g('g1') and invitee_id = :bobby;
insert into public._ctx select 'inv_carol', id::text from public.chat_group_invitations where group_id = public._g('g1') and invitee_id = :carol;
insert into public._ctx select 'inv_dave', id::text from public.chat_group_invitations where group_id = public._g('g1') and invitee_id = :dave;

set role authenticated;
select public._as_user(:erin);
select public._check(5, 'davet: başkasının davetini kabul edemez; davetleri okuyamaz',
  public._try(format('select public.respond_chat_group_invitation(%L, true)', public._g('inv_bobby'))) like '%invitation_not_found%'
  and (select count(*) from public.chat_group_invitations) = 0
  and (select count(*) from public.chat_groups where id = public._g('g1')) = 0);
select public._as_user(:bobby);
select public._check(6, 'davet: davetli kendi davetini görür; kapalı grubun kartı (chat_groups) davetli için okunur',
  (select count(*) from public.chat_group_invitations where invitee_id = :bobby) = 1
  and (select count(*) from public.chat_groups where id = public._g('g1')) = 1);
create temp table _r_b as select public.respond_chat_group_invitation(public._g('inv_bobby'), true) as j;
select public._as_user(:carol);
create temp table _r_c as select public.respond_chat_group_invitation(public._g('inv_carol'), true) as j;
select public._as_user(:dave);
create temp table _r_d as select public.respond_chat_group_invitation(public._g('inv_dave'), true) as j;
select public._check(7, 'davet: aynı davet ikinci kez kabul edilemez (kullanılmış)',
  public._try(format('select public.respond_chat_group_invitation(%L, true)', public._g('inv_dave'))) like '%invalid_state%');
reset role;
select public._check(8, 'davet: kabul sonrası üyelik oluştu, üye sayısı 4, bekleyen davet kalmadı',
  (select member_count from public.chat_groups where id = public._g('g1')) = 4
  and (select count(*) from public.chat_group_invitations where group_id = public._g('g1') and status = 'pending') = 0
  and (select j->>'outcome' from _r_b) = 'accepted');

-- ============================================================================
-- 3. Roller: tek tek yetki matrisi
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public.set_chat_group_member_role(public._g('g1'), :bobby, 'admin');
select public.set_chat_group_member_role(public._g('g1'), :carol, 'moderator');
reset role;
select public._check(9, 'rol: owner admin ve moderator atar',
  (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :bobby) = 'admin'
  and (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :carol) = 'moderator');

set role authenticated;
select public._as_user(:dave);  -- member
select public._check(10, 'member: hiçbir yönetim işlemini yapamaz',
  public._try(format('select public.update_chat_group(%L, ''{"name":"X"}'')', public._g('g1'))) like '%forbidden%'
  and public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g1'))) like '%forbidden%'
  and public._try(format('select public.invite_to_chat_group(%L, array[%L]::uuid[])', public._g('g1'), :erin)) like '%forbidden%'
  and public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g1'), :carol)) like '%forbidden%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''moderator'')', public._g('g1'), :carol)) like '%forbidden%'
  and public._try(format('select public.create_chat_group_link(%L)', public._g('g1'))) like '%forbidden%'
  and public._try(format('select public.transfer_chat_group_ownership(%L, %L)', public._g('g1'), :dave)) like '%forbidden%'
  and public._try(format('select public.delete_chat_group(%L)', public._g('g1'))) like '%forbidden%');
select public._as_user(:carol);  -- moderator
select public._check(11, 'moderator: owner/admin yetkilerini değiştiremez, rol/davet/görünürlük/silme yapamaz',
  public._try(format('select public.set_chat_group_member_role(%L, %L, ''member'')', public._g('g1'), :bobby)) like '%forbidden%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''moderator'')', public._g('g1'), :dave)) like '%forbidden%'
  and public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g1'), :bobby)) like '%forbidden%'
  and public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g1'), :alice)) like '%forbidden%'
  and public._try(format('select public.remove_chat_group_member(%L, %L, true)', public._g('g1'), :dave)) like '%forbidden%'
  and public._try(format('select public.invite_to_chat_group(%L, array[%L]::uuid[])', public._g('g1'), :erin)) like '%forbidden%'
  and public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g1'))) like '%forbidden%'
  and public._try(format('select public.delete_chat_group(%L)', public._g('g1'))) like '%forbidden%');
select public._as_user(:bobby);  -- admin
select public._check(12, 'admin: owner''ı çıkaramaz, sahipliği devredemez, grubu silemez, başka yöneticiye dokunamaz, admin atayamaz',
  public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g1'), :alice)) like '%forbidden%'
  and public._try(format('select public.transfer_chat_group_ownership(%L, %L)', public._g('g1'), :bobby)) like '%forbidden%'
  and public._try(format('select public.delete_chat_group(%L)', public._g('g1'))) like '%forbidden%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''member'')', public._g('g1'), :alice)) like '%forbidden%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''admin'')', public._g('g1'), :dave)) like '%forbidden%');
select public._check(13, 'admin: ayarları düzenler, moderator atar/kaldırır',
  public._try(format('select public.update_chat_group(%L, %L)', public._g('g1'), '{"description":"Yeni açıklama","member_limit":100}')) = 'ok'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''moderator'')', public._g('g1'), :dave)) = 'ok'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''member'')', public._g('g1'), :dave)) = 'ok');
reset role;
select public._check(14, 'ayar: açıklama + üye sınırı güncellendi; sınır üye sayısının altına indirilemez',
  (select description from public.chat_groups where id = public._g('g1')) = 'Yeni açıklama'
  and (select member_limit from public.chat_groups where id = public._g('g1')) = 100);
set role authenticated;
select public._as_user(:alice);
select public._check(15, 'ayar: üye sayısının altında sınır reddedilir; rol atamada owner yoktur; sahibin rolü değiştirilemez',
  public._try(format('select public.update_chat_group(%L, ''{"member_limit":3}'')', public._g('g1'))) like '%member_limit_below_count%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''owner'')', public._g('g1'), :dave)) like '%invalid_role%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''member'')', public._g('g1'), :alice)) like '%cannot_target_self%');
reset role;

-- İstemci kendi rolünü yükseltemez; yalnız kişisel durum sütunlarını yazar (başkasınınkine dokunamaz).
set role authenticated;
select public._as_user(:dave);
update public.conversation_members set role = 'owner', joined_at = '2000-01-01' where conversation_id = public._g('g1') and user_id = :dave;
update public.conversation_members set muted_at = now(), archived_at = now() where conversation_id = public._g('g1') and user_id = :dave;
create temp table _rs as select count(*) as n from public.conversation_members where conversation_id = public._g('g1');
select public._check(16, 'istemci: kendi rolünü/joined_at''ini değiştiremez; grup üyeliğini doğrudan silemez; grupta yalnız kendi üyelik satırını görür',
  public._try(format('delete from public.conversation_members where conversation_id = %L and user_id = %L', public._g('g1'), :dave)) like '%group_membership_via_rpc%'
  and (select n from _rs) = 1);
reset role;
select public._check(17, 'istemci: sessize alma + arşiv kendi satırına yazıldı, rol sabit, başkasının durumu değişmedi',
  (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :dave) = 'member'
  and (select joined_at from public.conversation_members where conversation_id = public._g('g1') and user_id = :dave) > '2020-01-01'
  and (select muted_at is not null and archived_at is not null from public.conversation_members where conversation_id = public._g('g1') and user_id = :dave)
  and (select archived_at is null and muted_at is null from public.conversation_members where conversation_id = public._g('g1') and user_id = :alice));
update public.conversation_members set muted_at = null, archived_at = null where conversation_id = public._g('g1') and user_id = :dave;

-- ============================================================================
-- 4. Mesajlaşma: üyelik, gizlilik, geçmiş, engel
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
insert into public.messages (id, conversation_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000a1', public._g('g1'), :alice, 'merhaba grup');
select public._as_user(:dave);
insert into public.messages (id, conversation_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000d1', public._g('g1'), :dave, 'selam');
select public._check(18, 'mesaj: aktif üyeler gönderir, üyeler hepsini okur',
  (select count(*) from public.messages where conversation_id = public._g('g1')) = 2);
select public._as_user(:erin);
select public._check(19, 'mesaj: üye olmayan göremez, gönderemez; kapalı grubu/üyelerini/konuşmayı göremez',
  (select count(*) from public.messages where conversation_id = public._g('g1')) = 0
  and public._try(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, ''x'')', public._g('g1'), :erin)) like '%row-level security%'
  and (select count(*) from public.chat_groups where id = public._g('g1')) = 0
  and (select count(*) from public.conversations where id = public._g('g1')) = 0
  and (select count(*) from public.conversation_members where conversation_id = public._g('g1')) = 0
  and (select count(*) from public.discover_chat_groups(null)) = 0
  and public._try(format('select * from public.chat_group_members(%L)', public._g('g1'))) = 'ok'
  and (select count(*) from public.chat_group_members(public._g('g1'))) = 0);
select public._as_user(:dave);
select public._check(20, 'mesaj: üye listesi RPC''si üyeye 4 kişiyi, rol sırasıyla döner; arama çalışır',
  (select count(*) from public.chat_group_members(public._g('g1'))) = 4
  and (select role from public.chat_group_members(public._g('g1')) limit 1) = 'owner'
  and (select count(*) from public.chat_group_members(public._g('g1'), 'carol')) = 1);
reset role;

-- Engel: dave carol'u engeller → karşılıklı görünmezlik, ama ikisi de yazmaya devam eder.
insert into public.blocks (blocker_id, blocked_id) values (:dave, :carol);
set role authenticated;
select public._as_user(:carol);
insert into public.messages (id, conversation_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000c1', public._g('g1'), :carol, 'carol yazdı');
select public._check(21, 'engel: grupta engellenen/engelleyen birbirinin mesajını görmez; yazma kilitlenmez',
  (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000d1') = 0
  and (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000c1') = 1);
select public._as_user(:dave);
select public._check(22, 'engel: dave carol''ın mesajını görmez, diğerlerini görür, yazabilir',
  (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000c1') = 0
  and (select count(*) from public.messages where conversation_id = public._g('g1')) = 2
  and public._try(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, ''engelli ama yazar'')', public._g('g1'), :dave)) = 'ok');
reset role;
delete from public.blocks where blocker_id = :dave;

-- Yönetici mesaj silme matrisi.
set role authenticated;
select public._as_user(:carol);
select public._check(23, 'mod: moderator üyenin mesajını siler; yöneticinin/sahibin mesajını silemez; üye silemez',
  public._try(format('select public.moderate_chat_group_message(%L)', '00000000-0000-4000-8000-0000000000d1')) = 'ok'
  and public._try(format('select public.moderate_chat_group_message(%L)', '00000000-0000-4000-8000-0000000000a1')) like '%forbidden%');
select public._as_user(:dave);
select public._check(24, 'mod: üye başkasının mesajını yönetici yetkisiyle silemez',
  public._try(format('select public.moderate_chat_group_message(%L)', '00000000-0000-4000-8000-0000000000a1')) like '%forbidden%');
reset role;
select public._check(25, 'mod: silinen mesajın içeriği temizlendi, satır kaldı, denetim kaydı düştü',
  (select deleted_at is not null and body is null from public.messages where id = '00000000-0000-4000-8000-0000000000d1')
  and (select count(*) from public.chat_group_audit where group_id = public._g('g1') and action = 'message_deleted') = 1);

-- "Kim yazabilir" ayarı.
set role authenticated;
select public._as_user(:bobby);
select public.update_chat_group(public._g('g1'), '{"posting_policy":"admins"}');
select public._as_user(:dave);
select public._check(26, 'ayar: yalnız yöneticiler yazabilir modunda üye gönderemez, moderatör/yönetici gönderebilir',
  public._try(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, ''x'')', public._g('g1'), :dave)) like '%row-level security%');
select public._as_user(:carol);
select public._check(27, 'ayar: moderatör yazabilir',
  public._try(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, ''duyuru'')', public._g('g1'), :carol)) = 'ok');
select public._as_user(:bobby);
select public.update_chat_group(public._g('g1'), '{"posting_policy":"members"}');
reset role;

-- Bildirim: grup mesajı üyelere bildirim üretmez.
select public._check(28, 'bildirim: grup mesajları hiçbir üyeye mesaj bildirimi üretmedi',
  (select count(*) from public.notifications where type in ('message', 'message_request')) = 0);

-- ============================================================================
-- 5. Birebir sohbet bozulmaz
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _dm1 as select public.start_direct_conversation(:bobby) as id;  -- ortak gruptalar ama sohbet YENİ ve birebir
insert into public.messages (conversation_id, sender_id, body) select id, :alice, 'özel mesaj' from _dm1;
select public._check(29, 'DM: ortak grup olsa da birebir sohbet ayrı (kind=direct) oluşur ve grup kimliğiyle karışmaz',
  (select id from _dm1) <> public._g('g1')
  and (select kind from public.conversations where id = (select id from _dm1)) = 'direct'
  and (select count(*) from public.conversation_members where conversation_id = (select id from _dm1)) = 2);
select public._as_user(:dave);
select public._check(30, 'DM: ortak grup, followers_only kullanıcıya mesaj gizliliğini aşmaz; filter_messageable_users ortak grubu "sohbet" saymaz',
  public._try(format('select public.start_direct_conversation(%L)', :gina)) like '%yalnızca takip ettiği%'
  and not (:gina::uuid = any (public.filter_messageable_users(array[:gina]::uuid[]))));
select public._as_user(:bobby);
select public._check(31, 'DM: karşı taraf mesajı okur; bildirim üretilir',
  (select count(*) from public.messages where body = 'özel mesaj') = 1);
reset role;
select public._check(32, 'DM: birebir mesaj bildirimi (message_request) hâlâ üretiliyor',
  (select count(*) from public.notifications where type in ('message', 'message_request') and recipient_id = :bobby) = 1);

-- ============================================================================
-- 6. Davet bağlantısı + katılma isteği (kapalı grup)
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _l1 as select public.create_chat_group_link(public._g('g1'), 24, null) as j;
create temp table _l2 as select public.create_chat_group_link(public._g('g1'), 24, 1) as j;
reset role;
insert into public._ctx select 'tok1', j->>'token' from _l1;
insert into public._ctx select 'tok2', j->>'token' from _l2;
insert into public._ctx select 'link2', j->>'link_id' from _l2;
select public._check(33, 'bağlantı: ham token saklanmaz (yalnız SHA-256 özeti), token rastgele ve uzun',
  not exists (select 1 from public.chat_group_links where token_hash = public._ctx_get('tok1'))
  and exists (select 1 from public.chat_group_links where token_hash = encode(extensions.digest(public._ctx_get('tok1'), 'sha256'), 'hex'))
  and length(public._ctx_get('tok1')) >= 40
  and public._ctx_get('tok1') <> public._ctx_get('tok2'));

set role authenticated;
select public._as_user(:bobby);
select public._check(34, 'bağlantı: yönetici token özetini (token_hash) okuyamaz; diğer sütunlar okunur',
  public._try('select token_hash from public.chat_group_links') like '%permission denied%'
  and (select count(*) from public.chat_group_links where group_id = public._g('g1')) = 2);
select public._as_user(:dave);
select public._check(35, 'bağlantı: üye bağlantı listesini göremez',
  (select count(*) from public.chat_group_links) = 0);
select public._as_user(:erin);
create temp table _p1 as select public.preview_chat_group_link(public._ctx_get('tok1')) as j;
select public._check(36, 'bağlantı: önizleme kapalı grup kartını (ad, üye sayısı) verir ama grup kimliğini vermez; geçersiz token hiçbir şey vermez',
  (select j->>'valid' from _p1) = 'true' and (select j->>'name' from _p1) = 'Tasarım Atölyesi' and (select j->>'group_id' from _p1) is null
  and (select public.preview_chat_group_link('A'||repeat('b', 40))->>'valid') = 'false'
  and public._try('select public.join_chat_group_via_link(''kisa'')') like '%invalid_link%');
create temp table _j1 as select public.join_chat_group_via_link(public._ctx_get('tok1'), 'Katılmak istiyorum') as j;
select public._check(37, 'istek: kapalı gruba bağlantıyla başvuru üye YAPMAZ, bekleyen istek oluşur',
  (select j->>'outcome' from _j1) = 'requested'
  and (select count(*) from public.conversation_members where conversation_id = public._g('g1') and user_id = :erin) = 0
  and (select count(*) from public.messages where conversation_id = public._g('g1')) = 0);
select public._check(38, 'istek: aynı kişi ikinci bekleyen istek açamaz; kapalı gruba id ile doğrudan katılamaz',
  (select public.join_chat_group_via_link(public._ctx_get('tok1'))->>'outcome') = 'already_requested'
  and public._try(format('select public.join_chat_group(%L)', public._g('g1'))) like '%group_not_found%');
reset role;
insert into public._ctx select 'req_erin', id::text from public.chat_group_join_requests where group_id = public._g('g1') and user_id = :erin;
select public._check(39, 'istek: bekleyen istek sayacı 1, istek durumu pending',
  (select pending_request_count from public.chat_groups where id = public._g('g1')) = 1
  and (select status from public.chat_group_join_requests where id = public._g('req_erin')) = 'pending');

set role authenticated;
select public._as_user(:frank);
create temp table _j2 as select public.join_chat_group_via_link(public._ctx_get('tok2')) as j;       -- 1 kullanımlık bağlantı
select public._as_user(:gina);
select public._check(40, 'bağlantı: kullanım sınırı dolunca ikinci kişi aynı bağlantıyı kullanamaz',
  public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok2'))) like '%invalid_link%');
select public._as_user(:frank);
select public._check(41, 'istek: başvuran başkasının isteğini iptal edemez / kabul edemez',
  public._try(format('select public.cancel_chat_group_join_request(%L)', public._g('req_erin'))) like '%request_not_found%'
  and public._try(format('select public.decide_chat_group_join_request(%L, true)', public._g('req_erin'))) like '%forbidden%');
select public._as_user(:erin);
select public._check(42, 'istek: başvuran kendi isteğini bir başkası gibi kabul edemez',
  public._try(format('select public.decide_chat_group_join_request(%L, true)', public._g('req_erin'))) like '%forbidden%');
select public._as_user(:dave);
select public._check(43, 'istek: normal üye istekleri göremez ve yönetemez',
  (select count(*) from public.chat_group_join_requests) = 0
  and public._try(format('select public.decide_chat_group_join_request(%L, true)', public._g('req_erin'))) like '%forbidden%');
select public._as_user(:carol);
select public._check(44, 'istek: moderatör istekleri görür',
  (select count(*) from public.chat_group_join_requests where group_id = public._g('g1')) = 2);
select public.decide_chat_group_join_request(public._g('req_erin'), true);
select public._check(45, 'istek: tekrar işlenemez (sonuçlanmış)',
  public._try(format('select public.decide_chat_group_join_request(%L, false)', public._g('req_erin'))) like '%invalid_state%');
select public._as_user(:erin);
select public._check(46, 'istek: sonuçlanmış istek iptal edilemez',
  public._try(format('select public.cancel_chat_group_join_request(%L)', public._g('req_erin'))) like '%invalid_state%');
reset role;
select public._check(47, 'istek: kabul → üyelik oluştu, istek accepted, sayaç düştü, başvurana bildirim gitti',
  (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :erin) = 'member'
  and (select status from public.chat_group_join_requests where id = public._g('req_erin')) = 'accepted'
  and (select pending_request_count from public.chat_groups where id = public._g('g1')) = 1
  and (select count(*) from public.notifications where recipient_id = :erin and message like 'Katılma isteğini kabul etti%') = 1);

-- frank: reddet → bekleme süresi → yeniden başvuru, geçmiş silinmez
insert into public._ctx select 'req_frank', id::text from public.chat_group_join_requests where group_id = public._g('g1') and user_id = :frank and status = 'pending';
set role authenticated;
select public._as_user(:bobby);
select public.decide_chat_group_join_request(public._g('req_frank'), false);
select public._as_user(:frank);
select public._check(48, 'istek: reddedilen kişi 24 saat dolmadan yeniden başvuramaz',
  public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok1'))) like '%request_cooldown%');
reset role;
update public.chat_group_join_requests set decided_at = now() - interval '25 hours' where id = public._g('req_frank');
set role authenticated;
select public._as_user(:frank);
create temp table _t49 as select public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok1'))) as r;
select public._check(49, 'istek: bekleme bitince yeniden başvurabilir; eski istek geçmişi korunur',
  (select r from _t49) = 'ok'
  and (select count(*) from public.chat_group_join_requests where user_id = :frank and group_id = public._g('g1')) = 2
  and (select count(*) from public.chat_group_join_requests where user_id = :frank and group_id = public._g('g1') and status = 'rejected') = 1);
-- frank kendi isteğini iptal eder
select public.cancel_chat_group_join_request((select id from public.chat_group_join_requests where user_id = :frank and status = 'pending'));
reset role;
select public._check(50, 'istek: kullanıcı kendi bekleyen isteğini iptal eder → cancelled; sayaç tutarlı',
  (select count(*) from public.chat_group_join_requests where user_id = :frank and status = 'cancelled') = 1
  and (select pending_request_count from public.chat_groups where id = public._g('g1')) = 0);

-- Bağlantı iptali / süresi
set role authenticated;
select public._as_user(:bobby);
select public.revoke_chat_group_link((select id from public.chat_group_links where group_id = public._g('g1') order by created_at limit 1));
reset role;
set role authenticated;
select public._as_user(:jack);
select public._check(51, 'bağlantı: iptal edilmiş bağlantı kullanılamaz',
  public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok1'))) like '%invalid_link%');
reset role;
update public.chat_group_links set expires_at = now() - interval '1 minute' where id = public._g('link2');
set role authenticated;
select public._check(52, 'bağlantı: süresi dolmuş bağlantı kullanılamaz',
  public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok2'))) like '%invalid_link%');
reset role;

-- ============================================================================
-- 7. Çıkarma, yasaklama, ayrılma
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(53, 'çıkarma: moderator normal üyeyi çıkarır',
  public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g1'), :erin)) = 'ok');
select public._as_user(:erin);
select public._check(54, 'çıkarma: çıkarılan kullanıcı anında yazamaz, okuyamaz, grubu göremez',
  public._try(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, ''hala varım'')', public._g('g1'), :erin)) like '%row-level security%'
  and (select count(*) from public.messages where conversation_id = public._g('g1')) = 0
  and (select count(*) from public.conversation_members where conversation_id = public._g('g1')) = 0);
select public._check(55, 'çıkarma: çıkarılan kullanıcı eski mesajını düzenleyemez/silemez',
  public._try(format('update public.messages set body = ''x'' where id = %L', '00000000-0000-4000-8000-0000000000a1')) = 'ok'
  and (select count(*) from public.messages where body = 'x') = 0);
reset role;
select public._check(56, 'çıkarma: üye sayısı güncellendi, bildirim gitti, denetim kaydı var',
  (select member_count from public.chat_groups where id = public._g('g1')) = 4
  and (select count(*) from public.notifications where recipient_id = :erin and message like 'Seni%grubundan çıkardı.') = 1
  and (select count(*) from public.chat_group_audit where group_id = public._g('g1') and action = 'member_removed') = 1);

set role authenticated;
select public._as_user(:bobby);
select public._check(57, 'yasak: admin yasaklayarak çıkarır; yasaklı kişi bağlantıyla katılamaz ve davet edilemez',
  public._try(format('select public.remove_chat_group_member(%L, %L, true, ''spam'')', public._g('g1'), :dave)) = 'ok');
reset role;
-- yeni bağlantı (eskisi iptal) ile yasaklı dave denemesi
set role authenticated;
select public._as_user(:alice);
create temp table _l3 as select public.create_chat_group_link(public._g('g1'), 24, null) as j;
reset role;
insert into public._ctx select 'tok3', j->>'token' from _l3;
set role authenticated;
select public._as_user(:dave);
select public._check(58, 'yasak: yasaklı kullanıcı bağlantıyla başvuramaz, bağlantı önizlemesi geçersiz görünür',
  public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok3'))) like '%cannot_join%'
  and (select public.preview_chat_group_link(public._ctx_get('tok3'))->>'valid') = 'false');
select public._as_user(:bobby);
select public._check(59, 'yasak: yasaklı kullanıcı davet edilemez; unban sonrası davet edilebilir',
  (select public.invite_to_chat_group(public._g('g1'), array[:dave]::uuid[])->'skipped'->0->>'reason') = 'banned'
  and public._try(format('select public.unban_chat_group_member(%L, %L)', public._g('g1'), :dave)) = 'ok'
  and (select (public.invite_to_chat_group(public._g('g1'), array[:dave]::uuid[])->>'invited_count')::int) = 1);
reset role;

-- Davet kuralları: yinelenen / üye / engelli / iptal / süre / engel sonrası kabul
set role authenticated;
select public._as_user(:alice);
create temp table _i1 as select public.invite_to_chat_group(public._g('g1'), array[:dave, :bobby, :hank, :hank]::uuid[]) as j;
select public._check(60, 'davet: yinelenen bekleyen davet ve mevcut üyeye davet oluşmaz (neden döner)',
  (select (j->>'invited_count')::int from _i1) = 1
  and (select jsonb_path_exists(j, '$.skipped[*] ? (@.reason == "already_invited")') from _i1)
  and (select jsonb_path_exists(j, '$.skipped[*] ? (@.reason == "already_member")') from _i1));
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:alice, :gina);
set role authenticated;
select public._as_user(:alice);
select public._check(61, 'davet: engel ilişkisi olan kişi davet edilemez (blocked)',
  (select public.invite_to_chat_group(public._g('g1'), array[:gina]::uuid[])->'skipped'->0->>'reason') = 'blocked');
reset role;
insert into public._ctx select 'inv_hank', id::text from public.chat_group_invitations where group_id = public._g('g1') and invitee_id = :hank and status = 'pending';
set role authenticated;
select public._as_user(:carol);
select public._check(62, 'davet: moderator davet iptal edemez',
  public._try(format('select public.cancel_chat_group_invitation(%L)', public._g('inv_hank'))) like '%forbidden%');
select public._as_user(:bobby);
select public.cancel_chat_group_invitation(public._g('inv_hank'));
select public._as_user(:hank);
select public._check(63, 'davet: iptal edilmiş davet kabul edilemez',
  public._try(format('select public.respond_chat_group_invitation(%L, true)', public._g('inv_hank'))) like '%invalid_state%');
reset role;
-- süresi dolan davet
set role authenticated;
select public._as_user(:alice);
select public.invite_to_chat_group(public._g('g1'), array[:ivy]::uuid[]);
reset role;
update public.chat_group_invitations set expires_at = now() - interval '1 hour' where group_id = public._g('g1') and invitee_id = :ivy;
set role authenticated;
select public._as_user(:ivy);
create temp table _t64 as select public.respond_chat_group_invitation((select id from public.chat_group_invitations where invitee_id = :ivy), true) as j;
select public._check(64, 'davet: süresi dolan davet kabul edilemez (expired olarak işaretlenir)',
  (select j->>'outcome' from _t64) = 'expired'
  and (select status from public.chat_group_invitations where invitee_id = :ivy) = 'expired'
  and (select count(*) from public.conversation_members where conversation_id = public._g('g1') and user_id = :ivy) = 0);
select public._as_user(:alice);
select public._check(65, 'davet: süresi dolmuş davetin yerine yenisi gönderilebilir',
  (select (public.invite_to_chat_group(public._g('g1'), array[:ivy]::uuid[])->>'invited_count')::int) = 1);
reset role;
-- davet gönderen engellenince kabul edilemez
insert into public.blocks (blocker_id, blocked_id) values (:ivy, :alice);
set role authenticated;
select public._as_user(:ivy);
select public._check(66, 'davet: davetli sonradan daveti göndereni engellediyse kabul edemez',
  public._try(format('select public.respond_chat_group_invitation(%L, true)', (select id from public.chat_group_invitations where invitee_id = :ivy and status = 'pending'))) like '%blocked%');
select public.respond_chat_group_invitation((select id from public.chat_group_invitations where invitee_id = :ivy and status = 'pending'), false);
reset role;
delete from public.blocks where blocker_id = :ivy;
select public._check(67, 'davet: reddedilen davet declined durumunda, üyelik oluşmadı',
  (select count(*) from public.chat_group_invitations where invitee_id = :ivy and status = 'declined') = 1
  and (select count(*) from public.conversation_members where conversation_id = public._g('g1') and user_id = :ivy) = 0);

-- ============================================================================
-- 8. Görünürlük: kapalı → açık, toplu kabul
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _c2 as select public.create_chat_group('Prompt Kulübü', 'Sınırlı grup', 'private', null, 5, array[:bobby, :dave]::uuid[]) as j;
reset role;
insert into public._ctx select 'g2', j->>'group_id' from _c2;
-- bobby (admin) ve dave üye olur
insert into public.conversation_members (conversation_id, user_id, role) values (public._g('g2'), :bobby, 'admin'), (public._g('g2'), :dave, 'member');
update public.chat_group_invitations set status = 'accepted', responded_at = now() where group_id = public._g('g2');
-- bekleyen başvurular (RPC'yi atlayarak, kontrollü created_at ile): erin, frank ok; gina engelli; hank yasaklı; dave zaten üye; ivy, jack sınır
insert into public.chat_group_join_requests (group_id, user_id, created_at) values
  (public._g('g2'), :erin,  now() - interval '9 hours'),
  (public._g('g2'), :frank, now() - interval '8 hours'),
  (public._g('g2'), :gina,  now() - interval '7 hours'),
  (public._g('g2'), :hank,  now() - interval '6 hours'),
  (public._g('g2'), :dave,  now() - interval '5 hours'),
  (public._g('g2'), :ivy,   now() - interval '4 hours'),
  (public._g('g2'), :jack,  now() - interval '3 hours');
insert into public.chat_group_bans (group_id, user_id, banned_by) values (public._g('g2'), :hank, :alice);
select public._check(68, 'görünürlük: önkoşul — 3 üye, limit 5, 7 bekleyen istek',
  (select member_count from public.chat_groups where id = public._g('g2')) = 3
  and (select pending_request_count from public.chat_groups where id = public._g('g2')) = 7);

set role authenticated;
select public._as_user(:dave);
select public._check(69, 'görünürlük: üye/moderator/dışarıdan biri görünürlük değiştiremez',
  public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g2'))) like '%forbidden%');
select public._as_user(:erin);
select public._check(70, 'görünürlük: dışarıdan biri görünürlük değiştiremez',
  public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g2'))) like '%forbidden%');
select public._as_user(:bobby);  -- admin yetkili
create temp table _v1 as select public.set_chat_group_visibility(public._g('g2'), 'public') as j;
reset role;
select public._check(71, 'görünürlük: sonuç özeti — 2 kabul, 1 zaten üye, 4 atlandı (engel, yasak, 2× sınır)',
  (select (j->>'accepted_count')::int from _v1) = 2
  and (select (j->>'already_member_count')::int from _v1) = 1
  and (select (j->>'skipped_count')::int from _v1) = 4
  and (select jsonb_path_exists(j, '$.skipped[*] ? (@.reason == "blocked")') from _v1)
  and (select jsonb_path_exists(j, '$.skipped[*] ? (@.reason == "banned")') from _v1)
  and (select count(*) from jsonb_array_elements((select j->'skipped' from _v1)) e where e->>'reason' = 'member_limit') = 2
  and (select (j->>'pending_remaining')::int from _v1) = 4 and (select (j->>'member_count')::int from _v1) = 5);
select public._check(72, 'görünürlük: grup artık public; erin/frank üye (tek üyelik), dave için yinelenen üyelik yok',
  (select visibility from public.chat_groups where id = public._g('g2')) = 'public'
  and (select count(*) from public.conversation_members where conversation_id = public._g('g2')) = 5
  and (select count(*) from public.conversation_members where conversation_id = public._g('g2') and user_id = :dave) = 1);
select public._check(73, 'görünürlük: istek durumları gerçek sonuçla tutarlı (kabul edilemeyenler pending kalır)',
  (select status from public.chat_group_join_requests where group_id = public._g('g2') and user_id = :erin) = 'accepted'
  and (select status from public.chat_group_join_requests where group_id = public._g('g2') and user_id = :frank) = 'accepted'
  and (select decision_note from public.chat_group_join_requests where group_id = public._g('g2') and user_id = :dave) = 'already_member'
  and (select count(*) from public.chat_group_join_requests where group_id = public._g('g2') and status = 'pending' and user_id in (:gina, :hank, :ivy, :jack)) = 4
  and (select decided_by from public.chat_group_join_requests where group_id = public._g('g2') and user_id = :erin) = :bobby);
select public._check(74, 'görünürlük: sayaçlar — pending_request_count 4, kabul edilenlere bildirim gitti (1''er)',
  (select pending_request_count from public.chat_groups where id = public._g('g2')) = 4
  and (select count(*) from public.notifications where recipient_id = :erin and message like 'Katılma isteğini kabul etti%' and target_href like '%' || public._g('g2')::text) = 1
  and (select count(*) from public.notifications where recipient_id = :gina and message like 'Katılma isteğini kabul etti%') = 0);
set role authenticated;
select public._as_user(:bobby);
create temp table _v2 as select public.set_chat_group_visibility(public._g('g2'), 'public') as j;
reset role;
select public._check(75, 'görünürlük: işlem tekrarlanınca değişiklik yok, üyelik/bildirim çoğalmaz',
  (select (j->>'changed')::boolean from _v2) = false
  and (select count(*) from public.conversation_members where conversation_id = public._g('g2')) = 5
  and (select count(*) from public.notifications where recipient_id = :erin and message like 'Katılma isteğini kabul etti%' and target_href like '%' || public._g('g2')::text) = 1);

-- Atomiklik: ortada hata → görünürlük DE eski hâline döner
set role authenticated;
select public._as_user(:alice);
create temp table _c3 as select public.create_chat_group('Atomik Grup', null, 'private', null, 50) as j;
reset role;
insert into public._ctx select 'g3', j->>'group_id' from _c3;
insert into public.chat_group_join_requests (group_id, user_id, created_at) values
  (public._g('g3'), :erin,  now() - interval '3 hours'),
  (public._g('g3'), :frank, now() - interval '2 hours');
create or replace function public._boom() returns trigger language plpgsql as $$
begin
  if new.user_id = '66666666-6666-4666-8666-666666666666' then raise exception 'test_boom'; end if;
  return new;
end $$;
create trigger _boom before insert on public.conversation_members for each row execute function public._boom();
set role authenticated;
select public._as_user(:alice);
select public._check(76, 'atomik: toplu kabul ortasında hata → hata döner',
  public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g3'))) like '%test_boom%');
reset role;
select public._check(77, 'atomik: görünürlük private kaldı, erin üye OLMADI, istekler pending, bildirim yok, sayaç doğru',
  (select visibility from public.chat_groups where id = public._g('g3')) = 'private'
  and (select count(*) from public.conversation_members where conversation_id = public._g('g3')) = 1
  and (select count(*) from public.chat_group_join_requests where group_id = public._g('g3') and status = 'pending') = 2
  and (select pending_request_count from public.chat_groups where id = public._g('g3')) = 2
  and (select count(*) from public.notifications where recipient_id = :erin and target_href like '%' || public._g('g3')::text) = 0
  and (select count(*) from public.chat_group_audit where group_id = public._g('g3') and action = 'visibility_changed') = 0);
drop trigger _boom on public.conversation_members;
set role authenticated;
select public._as_user(:alice);
select public.set_chat_group_visibility(public._g('g3'), 'public');
select public.set_chat_group_visibility(public._g('g3'), 'private');
reset role;
select public._check(78, 'görünürlük: hata giderilince kabul oluşur; açık → kapalı geçişi üyeleri çıkarmaz',
  (select count(*) from public.conversation_members where conversation_id = public._g('g3')) = 3
  and (select visibility from public.chat_groups where id = public._g('g3')) = 'private');

-- ============================================================================
-- 9. Keşif ve herkese açık katılma
-- ============================================================================
set role authenticated;
select public._as_user(:ivy);
select public._check(79, 'keşif: yalnız herkese açık gruplar listelenir (kapalı g1/g3 yok); ad/açıklamaya göre aranır',
  (select count(*) from public.discover_chat_groups(null)) = 1
  and (select name from public.discover_chat_groups('prompt')) = 'Prompt Kulübü'
  and (select count(*) from public.discover_chat_groups('sınırlı')) = 1
  and (select count(*) from public.discover_chat_groups('tasarım')) = 0
  and (select count(*) from public.discover_chat_groups('100%')) = 0);
select public._check(80, 'keşif: üye sayısı ve kullanıcının durumu döner; sıralama seçenekleri hata vermez',
  (select member_count from public.discover_chat_groups(null)) = 5
  and (select my_status from public.discover_chat_groups(null)) = 'requested'
  and public._try('select * from public.discover_chat_groups(null, ''newest'', 10, 0)') = 'ok'
  and public._try('select * from public.discover_chat_groups(null, ''active'', 10, 0)') = 'ok');
select public._check(81, 'katılma: dolu grup (limit 5) → member_limit_reached; üye sayısı aşılmaz',
  public._try(format('select public.join_chat_group(%L)', public._g('g2'))) like '%member_limit_reached%');
select public._as_user(:gina);
select public._check(82, 'keşif/katılma: sahibiyle engel ilişkisi olan kullanıcı grubu listede görmez ve katılamaz',
  (select count(*) from public.discover_chat_groups(null)) = 0
  and public._try(format('select public.join_chat_group(%L)', public._g('g2'))) like '%cannot_join%');
select public._as_user(:hank);
select public._check(83, 'katılma: yasaklı kullanıcı listede görmez ve katılamaz',
  (select count(*) from public.discover_chat_groups(null)) = 0
  and public._try(format('select public.join_chat_group(%L)', public._g('g2'))) like '%cannot_join%');
select public._as_user(:alice);
select public.update_chat_group(public._g('g2'), '{"member_limit":10}');
select public._as_user(:jack);
create temp table _jj as select public.join_chat_group(public._g('g2')) as j;
select public._check(84, 'katılma: herkese açık gruba tek adımda katılır; ikinci çağrı yinelenen üyelik oluşturmaz',
  (select j->>'outcome' from _jj) = 'joined'
  and (select public.join_chat_group(public._g('g2'))->>'outcome') = 'already_member');
reset role;
select public._check(85, 'katılma: jack''in bekleyen isteği kabul sayıldı (kimse hem üye hem bekleyen değil), üye sayısı 6',
  (select status from public.chat_group_join_requests where group_id = public._g('g2') and user_id = :jack) = 'accepted'
  and (select member_count from public.chat_groups where id = public._g('g2')) = 6
  and (select count(*) from public.conversation_members where conversation_id = public._g('g2') and user_id = :jack) = 1);

-- Katılmadan önceki mesajlar yeni üyeye görünmez
set role authenticated;
select public._as_user(:alice);
insert into public.messages (conversation_id, sender_id, body) values (public._g('g2'), :alice, 'erken mesaj');
reset role;
update public.messages set created_at = now() - interval '2 days' where body = 'erken mesaj';
set role authenticated;
select public._as_user(:ivy);
select public.join_chat_group(public._g('g2'));
select public._as_user(:alice);
insert into public.messages (conversation_id, sender_id, body) values (public._g('g2'), :alice, 'sonraki mesaj');
select public._as_user(:ivy);
select public._check(86, 'geçmiş: yeni üye katılmadan ÖNCEKİ mesajları görmez, sonrakileri görür',
  (select count(*) from public.messages where body = 'erken mesaj') = 0
  and (select count(*) from public.messages where body = 'sonraki mesaj') = 1);
reset role;

-- ============================================================================
-- 10. Sahiplik, ayrılma, silme
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(87, 'sahiplik: başka üye varken owner ayrılamaz (önce devretmeli)',
  public._try(format('select public.leave_chat_group(%L)', public._g('g1'))) like '%owner_must_transfer%');
select public._check(88, 'sahiplik: gruba üye olmayana devredilemez; kendine devredilemez',
  public._try(format('select public.transfer_chat_group_ownership(%L, %L)', public._g('g1'), :jack)) like '%not_a_member%'
  and public._try(format('select public.transfer_chat_group_ownership(%L, %L)', public._g('g1'), :alice)) like '%cannot_target_self%');
select public.transfer_chat_group_ownership(public._g('g1'), :carol);
reset role;
select public._check(89, 'sahiplik: devir → carol owner, alice admin; grupta tam 1 owner',
  (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :carol) = 'owner'
  and (select role from public.conversation_members where conversation_id = public._g('g1') and user_id = :alice) = 'admin'
  and (select count(*) from public.conversation_members where conversation_id = public._g('g1') and role = 'owner') = 1
  and (select count(*) from public.notifications where recipient_id = :carol and message like 'Sana%grubunun sahipliğini devretti.') = 1);
set role authenticated;
select public._as_user(:alice);
select public._check(90, 'sahiplik: eski sahip artık admin — sahipliği geri alamaz / grubu silemez',
  public._try(format('select public.delete_chat_group(%L)', public._g('g1'))) like '%forbidden%'
  and public._try(format('select public.transfer_chat_group_ownership(%L, %L)', public._g('g1'), :alice)) like '%forbidden%');
select public.leave_chat_group(public._g('g1'));
reset role;
select public._check(91, 'ayrılma: admin gruptan ayrılır; üyelik silinir, sayaç düşer, denetim kaydı düşer',
  (select count(*) from public.conversation_members where conversation_id = public._g('g1') and user_id = :alice) = 0
  and (select count(*) from public.chat_group_audit where group_id = public._g('g1') and action = 'member_left') = 1);
set role authenticated;
select public._as_user(:alice);
select public._check(92, 'ayrılma: ayrılan kullanıcı artık yazamaz / grubu göremez',
  public._try(format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, ''x'')', public._g('g1'), :alice)) like '%row-level security%'
  and public._try(format('select public.leave_chat_group(%L)', public._g('g1'))) like '%not_a_member%');
reset role;

-- Hesap silme: owner ayrılırsa grup sahipsiz kalmaz
set role authenticated;
select public._as_user(:frank);
create temp table _c4 as select public.create_chat_group('Frank Grubu', null, 'public', null, 50, array[]::uuid[]) as j;
reset role;
insert into public._ctx select 'g4', j->>'group_id' from _c4;
insert into public.conversation_members (conversation_id, user_id, role, joined_at) values
  (public._g('g4'), :gina, 'member', now() - interval '3 days'),
  (public._g('g4'), :hank, 'moderator', now() - interval '1 day'),
  (public._g('g4'), :ivy, 'admin', now() - interval '2 days');
select public._check(93, 'hesap silme: önkoşul — g4 üç ek üye, owner frank',
  (select member_count from public.chat_groups where id = public._g('g4')) = 4);
select public.delete_account_data(:frank);
select public._check(94, 'hesap silme: owner silinince en kıdemli yönetici (ivy) owner olur, grup sahipsiz kalmaz',
  (select count(*) from public.conversation_members where conversation_id = public._g('g4') and role = 'owner') = 1
  and (select role from public.conversation_members where conversation_id = public._g('g4') and user_id = :ivy) = 'owner'
  and (select member_count from public.chat_groups where id = public._g('g4')) = 3
  and (select count(*) from public.notifications where recipient_id = :ivy and message like '%grubunun yeni sahibi oldun.') = 1);
-- tek üyeli grubun sahibi hesabını silerse grup da gider
insert into public.conversations (id, kind) values ('abababab-abab-4bab-8bab-abababababab', 'group');
insert into public.chat_groups (id, name, created_by) values ('abababab-abab-4bab-8bab-abababababab', 'Tek Kişilik', :jack);
insert into public.conversation_members (conversation_id, user_id, role) values ('abababab-abab-4bab-8bab-abababababab', :jack, 'owner');
-- jack başka gruplarda da üye, silinebilir mi?
select public.delete_account_data(:jack);
select public._check(95, 'hesap silme: tek üyeli grup sahibinin hesabı silinince grup da silinir',
  not exists (select 1 from public.conversations where id = 'abababab-abab-4bab-8bab-abababababab')
  and not exists (select 1 from public.chat_groups where id = 'abababab-abab-4bab-8bab-abababababab'));

-- Son üye sahip ayrılırsa / sahip grubu siler
set role authenticated;
select public._as_user(:hank);
create temp table _c5 as select public.create_chat_group('Geçici', null, 'private') as j;
reset role;
insert into public._ctx select 'g5', j->>'group_id' from _c5;
set role authenticated;
select public._as_user(:hank);
select public.leave_chat_group(public._g('g5'));
reset role;
select public._check(96, 'ayrılma: tek üyeli grubun sahibi ayrılırsa grup silinir (sahipsiz grup kalmaz)',
  not exists (select 1 from public.conversations where id = public._g('g5'))
  and (select count(*) from public.chat_group_audit where group_id = public._g('g5') and action = 'group_deleted') = 1);

set role authenticated;
select public._as_user(:ivy);   -- g4 owner
insert into public.messages (conversation_id, sender_id, body) values (public._g('g4'), :ivy, 'silinecek mesaj');
select public._as_user(:gina);
select public._check(97, 'silme: owner olmayan grubu silemez',
  public._try(format('select public.delete_chat_group(%L)', public._g('g4'))) like '%forbidden%');
select public._as_user(:ivy);
select public.delete_chat_group(public._g('g4'));
reset role;
select public._check(98, 'silme: owner grubu siler → grup, üyelikler, mesajlar gider; denetim kaydı kalır',
  not exists (select 1 from public.conversations where id = public._g('g4'))
  and not exists (select 1 from public.messages where body = 'silinecek mesaj')
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('g4'))
  and (select count(*) from public.chat_group_audit where group_id = public._g('g4') and action = 'group_deleted') = 1);

-- ============================================================================
-- 11. RLS / yetki / tutarlılık
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
create temp table _t99 as select
  public._try(format('update public.chat_groups set name = ''Hack'' where id = %L', public._g('g2'))) as r1,
  public._try(format('update public.chat_groups set member_count = 999 where id = %L', public._g('g2'))) as r2,
  public._try(format('insert into public.chat_group_join_requests (group_id, user_id) values (%L, %L)', public._g('g2'), :bobby)) as r3,
  public._try(format('insert into public.chat_group_invitations (group_id, invitee_id) values (%L, %L)', public._g('g2'), :erin)) as r4,
  public._try(format('delete from public.chat_group_bans where group_id = %L', public._g('g1'))) as r5,
  public._try(format('insert into public.chat_group_audit (group_id, action) values (%L, ''x'')', public._g('g2'))) as r6;
select public._check(99, 'RLS: istemci grup tablolarına doğrudan yazamaz (adı/sayacı değiştiremez, istek/davet/yasak/denetim yazamaz)',
  (select r1 like '%permission denied%' and r2 like '%permission denied%' and r3 like '%permission denied%'
      and r4 like '%permission denied%' and r5 like '%permission denied%' and r6 like '%permission denied%' from _t99)
  and (select name from public.chat_groups where id = public._g('g2')) = 'Prompt Kulübü'
  and (select member_count from public.chat_groups where id = public._g('g2')) <> 999);
select public._check(100, 'RLS: denetim kaydı yalnız owner/admin''e açık (üye ve dışarıdaki göremez)',
  (select count(*) from public.chat_group_audit where group_id = public._g('g2')) > 0);
set role authenticated;
select public._as_user(:bobby);
select public._check(101, 'RLS: admin g2 denetim kaydını okur',
  (select count(*) from public.chat_group_audit where group_id = public._g('g2')) > 0);
select public._as_user(:ivy);
select public._check(102, 'RLS: normal üye ve dışarıdaki denetim kaydını okuyamaz',
  (select count(*) from public.chat_group_audit where group_id = public._g('g2')) = 0);
select public._as_user(:gina);
select public._check(103, 'RLS: dışarıdaki herkese açık grubun kartını okur ama üyelerini/mesajlarını okuyamaz',
  (select count(*) from public.chat_groups where id = public._g('g2')) = 1
  and (select count(*) from public.messages where conversation_id = public._g('g2')) = 0
  and (select count(*) from public.conversation_members where conversation_id = public._g('g2')) = 0
  and (select count(*) from public.chat_group_members(public._g('g2'))) = 0);
reset role;
select public._check(104, 'yetki: anon hiçbir grup RPC''sini çağıramaz; iç yardımcılar kimseye açık değil',
  not has_function_privilege('anon', 'public.create_chat_group(text,text,text,text,integer,uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.set_chat_group_visibility(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.discover_chat_groups(text,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public._group_add_member(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public._group_lock(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_group_owner_exit()', 'execute')
  and has_function_privilege('authenticated', 'public.set_chat_group_visibility(uuid,text)', 'execute'));
select public._check(105, 'tutarlılık: member_count / pending_request_count gerçek satır sayılarıyla birebir',
  not exists (
    select 1 from public.chat_groups g
     where g.member_count <> (select count(*) from public.conversation_members m where m.conversation_id = g.id)
        or g.pending_request_count <> (select count(*) from public.chat_group_join_requests r where r.group_id = g.id and r.status = 'pending')
  ));
select public._check(106, 'tutarlılık: her grupta tam 1 owner var; hiçbir kullanıcı aynı grupta iki kez üye değil; bekleyen kaydı olan üye yok',
  not exists (select 1 from public.chat_groups g where (select count(*) from public.conversation_members m where m.conversation_id = g.id and m.role = 'owner') <> 1)
  and not exists (
    select 1 from public.chat_group_join_requests r
     join public.conversation_members m on m.conversation_id = r.group_id and m.user_id = r.user_id
     where r.status = 'pending')
  and not exists (
    select 1 from public.chat_group_invitations i
     join public.conversation_members m on m.conversation_id = i.group_id and m.user_id = i.invitee_id
     where i.status = 'pending'));
select public._check(107, 'bildirim: yeni üye / yeni istek / davet bildirimleri üretildi ve tekilleştirildi (dedupe_key tekrarsız)',
  (select count(*) from public.notifications where message like 'Seni%grubuna davet etti.') >= 4
  and (select count(*) from public.notifications where message like '%grubuna katılma isteği gönderdi.') >= 1
  and (select count(*) from (select dedupe_key from public.notifications where dedupe_key is not null group by 1 having count(*) > 1) d) = 0);
-- ============================================================================
-- 12. Sessize alma, arşiv ve moderatör dökümü
-- ============================================================================
set role authenticated;
select public._as_user(:ivy);
create temp table _c6 as select public.create_chat_group('Sessiz Grup', null, 'public', null, 20) as j;
reset role;
insert into public._ctx select 'g6', j->>'group_id' from _c6;
set role authenticated;
select public._as_user(:dave);
select public.join_chat_group(public._g('g6'));      -- ivy (owner) susturmadan önce: bildirim alır
select public._as_user(:ivy);
update public.conversation_members set muted_at = now() where conversation_id = public._g('g6') and user_id = :ivy;
select public._as_user(:erin);
select public.join_chat_group(public._g('g6'));      -- ivy susturulmuş: bildirim ALMAZ
update public.conversation_members set muted_at = now(), archived_at = now() where conversation_id = public._g('g6') and user_id = :erin;
select public._as_user(:ivy);
insert into public.messages (conversation_id, sender_id, body) values (public._g('g6'), :ivy, 'yeni mesaj');
reset role;
select public._check(108, 'sessiz/arşiv: sessize alıp arşivleyen üye yeni mesajla geri gelmez; diğer üyeler etkilenmez, okunmamış sayacı artar',
  (select archived_at is not null from public.conversation_members where conversation_id = public._g('g6') and user_id = :erin)
  and (select count(*) from public.conversation_members where conversation_id = public._g('g6') and user_id <> :erin and archived_at is not null) = 0
  and (select unread_count from public.conversation_members where conversation_id = public._g('g6') and user_id = :dave) = 1);
select public._check(109, 'sessiz/bildirim: sessize alan yönetici katılım bildirimi almaz (dave için aldı, erin için almadı)',
  (select count(*) from public.notifications where recipient_id = :ivy and message like '%grubuna katıldı.' and actor_id = :dave) = 1
  and (select count(*) from public.notifications where recipient_id = :ivy and message like '%grubuna katıldı.' and actor_id = :erin) = 0);

-- Moderatör dökümü grup konuşmasını tek satırda, grup adıyla gösterir.
insert into auth.users (id, email, raw_user_meta_data) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'kate@test.dev', '{"username":"kate","display_name":"Kate"}');
select public._as_user('');   -- süper kullanıcı adımı: auth.uid() boş olmalı (profil rolü korumalı)
update public.profiles set role = 'moderator' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
select public._as_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
create temp table _adm as select * from public.admin_user_conversations(:ivy);
reset role;
select public._check(110, 'moderasyon: admin_user_conversations grup konuşmasını TEK satırda grup adıyla listeler',
  (select count(*) from _adm where conversation_id = public._g('g6')) = 1
  and (select counterpart_display_name from _adm where conversation_id = public._g('g6')) = 'Sessiz Grup');


-- Sohbet listesi önizlemesi (conversation_last_messages): RLS ve kişisel temizleme aynen uygulanır.
set role authenticated;
select public._as_user(:ivy);
create temp table _lm as select * from public.conversation_last_messages(array[public._g('g6'), public._g('g2'), public._g('g1')]);
select public._check(111, 'önizleme: her konuşma için görünür son mesaj döner; üyesi olunmayan konuşma ve katılmadan önceki mesajlar dönmez',
  (select count(*) from _lm) = 2
  and (select body from _lm where conversation_id = public._g('g6')) = 'yeni mesaj'
  and (select body from _lm where conversation_id = public._g('g2')) = 'sonraki mesaj');
update public.conversation_members set cleared_at = now() + interval '1 minute' where conversation_id = public._g('g6') and user_id = :ivy;
select public._check(112, 'önizleme: kişisel "mesajları temizle" sonrası o konuşmanın önizlemesi boş döner (başkasınınki etkilenmez)',
  (select count(*) from public.conversation_last_messages(array[public._g('g6')])) = 0);
select public._as_user(:dave);
select public._check(113, 'önizleme: başka üye aynı grubun son mesajını görmeye devam eder',
  (select body from public.conversation_last_messages(array[public._g('g6')])) = 'yeni mesaj');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
