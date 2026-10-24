-- Sohbet geliştirmeleri: okundu imleci, sabitleme, yıldız, arama, yazıyor yetkisi — DB/RLS/RPC testi (docs/history/174-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/chat-features.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice bobby carol dave erin (+ gina: engel testi).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina')) as u(id, name);

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
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text) to public;

-- ---------- fixture: alice↔bobby birebir sohbet (gerçek RPC), 3 mesaj ----------
set role authenticated;
select public._as_user(:alice);
create temp table _dm as select public.start_direct_conversation(:bobby) as id;
grant all on _dm to public;
select public._as_user(:bobby);
update public.conversation_members set status = 'accepted' where user_id = :bobby;
reset role;
insert into public._ctx select 'dm', id::text from _dm;
insert into public.messages (id, conversation_id, sender_id, body, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', public._g('dm'), :alice, 'Merhaba bobby, 100% hazır mısın?', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-0000000000b1', public._g('dm'), :bobby, 'Selam! Hazırım_tamam', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000000a2', public._g('dm'), :alice, 'Harika, başlayalım', now() - interval '1 hours');
update public.conversation_members set unread_count = 0;

-- ============================================================================
-- 1. Okundu imleci
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
create temp table _r1 as select public.mark_conversation_read_up_to(public._g('dm'), (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000000a1')) as c;
reset role;
select public._check(1, 'okundu: bobby ilk mesaja kadar okudu → imleç o mesajın zamanı, okunmamış 1 (a2; b1 kendi mesajı sayılmaz)',
  (select last_read_at from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby) = (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000000a1')
  and (select unread_count from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby) = 1);
select public._check(2, 'okundu: alice''in imleci etkilenmedi (kendi mesajları "okundu" sayılmaz)',
  (select last_read_at is null from public.conversation_members where conversation_id = public._g('dm') and user_id = :alice));

create temp table _x1 as select xmin::text as x, last_read_updated_at as u from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby;
set role authenticated;
select public._as_user(:bobby);
select public.mark_conversation_read_up_to(public._g('dm'), (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000000a1'));
select public.mark_conversation_read_up_to(public._g('dm'), now() - interval '10 days');
reset role;
select public._check(3, 'okundu: aynı/geri imleç ÇAĞRISI satıra yazmaz (xmin aynı) ve imleç geri gitmez',
  (select xmin::text = (select x from _x1) and last_read_updated_at = (select u from _x1) from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby));

set role authenticated;
select public._as_user(:bobby);
select public.mark_conversation_read_up_to(public._g('dm'), now() + interval '1 day');
reset role;
select public._check(4, 'okundu: gelecekteki zaman konuşmadaki en yeni mesajla sınırlanır; okunmamış 0',
  (select last_read_at from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby) = (select max(created_at) from public.messages where conversation_id = public._g('dm'))
  and (select unread_count from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby) = 0);

set role authenticated;
select public._as_user(:bobby);
update public.conversation_members set last_read_at = now() + interval '5 days', last_read_updated_at = now() where conversation_id = public._g('dm') and user_id = :bobby;
select public._check(5, 'okundu: istemci imleci doğrudan yazamaz (tetikleyici yok sayar)',
  (select last_read_at from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby) = (select max(created_at) from public.messages where conversation_id = public._g('dm')));
select public._as_user(:erin);
select public._check(6, 'okundu: üye olmayan imleç ilerletemez; birebir sohbetin üyelik satırlarını göremez',
  public._try(format('select public.mark_conversation_read_up_to(%L, now())', public._g('dm'))) like '%not_a_member%'
  and (select count(*) from public.conversation_members where conversation_id = public._g('dm')) = 0);
select public._as_user(:alice);
select public._check(7, 'okundu: alice karşı tarafın imlecini (kendi sohbetinde) görür',
  (select last_read_at from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby) is not null);
select public._check(8, 'okundu: mesaj ayrıntısı — alice gönderen: bobby a1/b1''i okumuş, a2''yi de okumuş (imleç en yeni); bobby göndermediği mesajın ayrıntısını göremez',
  (select has_read and read_at is not null from public.message_read_receipts('00000000-0000-4000-8000-0000000000a1'))
  and (select count(*) from public.message_read_receipts('00000000-0000-4000-8000-0000000000a1')) = 1);
select public._as_user(:bobby);
select public._check(9, 'okundu: gönderen olmayan / üye olmayan ayrıntı alamaz',
  public._try(format('select * from public.message_read_receipts(%L)', '00000000-0000-4000-8000-0000000000a1')) like '%forbidden%');
select public._as_user(:erin);
select public._check(10, 'okundu: üye olmayan ayrıntı alamaz',
  public._try(format('select * from public.message_read_receipts(%L)', '00000000-0000-4000-8000-0000000000a1')) like '%forbidden%');
reset role;
select public._check(11, 'yetki: anon imleç/ayrıntı/sabit/arama/yıldız RPC''lerini çağıramaz',
  not has_function_privilege('anon', 'public.mark_conversation_read_up_to(uuid,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.message_read_receipts(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_message_pinned(uuid,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.search_conversation_messages(uuid,text,integer,timestamptz,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.list_starred_messages(integer,timestamptz,uuid)', 'execute'));

-- eski imza: yalnız sayaç 0; imleç ilerlemez (temizle/sil yolunda "okundu" sızmasın)
update public.conversation_members set last_read_at = null, unread_count = 3 where conversation_id = public._g('dm') and user_id = :bobby;
set role authenticated;
select public._as_user(:bobby);
select public.mark_conversation_read(public._g('dm'));
reset role;
select public._check(12, 'okundu: eski mark_conversation_read imzası yalnız sayacı sıfırlar, imleci İLERLETMEZ (okundu bilgisi sızmaz)',
  (select last_read_at is null and unread_count = 0
     from public.conversation_members where conversation_id = public._g('dm') and user_id = :bobby));

-- ---------- grup: kullanıcı bazlı okundu ----------
set role authenticated;
select public._as_user(:alice);
create temp table _c as select public.create_chat_group('Okundu Grubu', null, 'private', null, 50, array[:bobby, :carol, :dave]::uuid[]) as j;
reset role;
insert into public._ctx select 'g', j->>'group_id' from _c;
insert into public.conversation_members (conversation_id, user_id, role, joined_at) values
  (public._g('g'), :bobby, 'member', now() - interval '5 days'), (public._g('g'), :carol, 'moderator', now() - interval '5 days'), (public._g('g'), :dave, 'member', now() - interval '5 days');
update public.chat_group_invitations set status = 'accepted', responded_at = now() where group_id = public._g('g');
update public.conversation_members set joined_at = now() - interval '5 days' where conversation_id = public._g('g') and user_id = :alice;
insert into public.messages (id, conversation_id, sender_id, body, created_at) values
  ('00000000-0000-4000-8000-0000000000c1', public._g('g'), :alice, 'Grup mesajı bir', now() - interval '4 hours'),
  ('00000000-0000-4000-8000-0000000000c2', public._g('g'), :alice, 'Grup mesajı iki', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-0000000000c3', public._g('g'), :bobby, 'Bobby yazdı: kuşkusuz', now() - interval '2 hours');
set role authenticated;
select public._as_user(:bobby);
select public.mark_conversation_read_up_to(public._g('g'), (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000000c2'));
select public._as_user(:carol);
select public.mark_conversation_read_up_to(public._g('g'), (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000000c1'));
select public._as_user(:alice);
create temp table _rc2 as select * from public.message_read_receipts('00000000-0000-4000-8000-0000000000c2');
create temp table _rc1 as select * from public.message_read_receipts('00000000-0000-4000-8000-0000000000c1');
select public._check(13, 'grup okundu: kullanıcı bazlı — c2: bobby okudu, carol/dave okumadı; gönderen listede yok',
  (select count(*) from _rc2) = 3
  and (select has_read from _rc2 where user_id = :bobby) and not (select has_read from _rc2 where user_id = :carol)
  and not (select has_read from _rc2 where user_id = :dave) and (select count(*) from _rc2 where user_id = :alice) = 0);
select public._check(14, 'grup okundu: c1 — bobby ve carol okudu, dave okumadı',
  (select count(*) from _rc1 where has_read) = 2);
select public._as_user(:carol);
select public._check(15, 'grup okundu: gönderen olmayan üye başkasının mesaj ayrıntısını göremez',
  public._try(format('select * from public.message_read_receipts(%L)', '00000000-0000-4000-8000-0000000000c2')) like '%forbidden%');
select public._as_user(:erin);
select public._check(16, 'grup okundu: üye olmayan göremez',
  public._try(format('select * from public.message_read_receipts(%L)', '00000000-0000-4000-8000-0000000000c2')) like '%forbidden%');
reset role;
select public._check(17, 'grup okundu: okunmamış sayacı imleçle uyumlu (carol: c2 + c3 = 2; bobby: kendi c3 hariç → 0)',
  (select unread_count from public.conversation_members where conversation_id = public._g('g') and user_id = :carol) = 2
  and (select unread_count from public.conversation_members where conversation_id = public._g('g') and user_id = :bobby) = 0);

-- üyelik sonu: imleç silinir; ayrıntıda görünmez; yeniden katılan sıfırdan başlar
set role authenticated;
select public._as_user(:alice);
select public.remove_chat_group_member(public._g('g'), :bobby);
create temp table _rc3 as select * from public.message_read_receipts('00000000-0000-4000-8000-0000000000c2');
select public._check(18, 'üyelik sonu: çıkarılan üyenin okundu verisi ayrıntıda görünmez',
  (select count(*) from _rc3 where user_id = :bobby) = 0 and (select count(*) from _rc3) = 2);
reset role;
insert into public.conversation_members (conversation_id, user_id, role) values (public._g('g'), :bobby, 'member');
select public._check(19, 'üyelik sonu: yeniden katılan üyenin imleci sıfırdan başlar',
  (select last_read_at is null from public.conversation_members where conversation_id = public._g('g') and user_id = :bobby));
set role authenticated;
select public._as_user(:alice);
create temp table _rc4 as select * from public.message_read_receipts('00000000-0000-4000-8000-0000000000c2');
create temp table _rc4b as select (select count(*) from _rc4 where user_id = :bobby) as before_n;
select public.update_chat_group_owner_settings(public._g('g'), '{"history_visible":true}');
create temp table _rc5 as select * from public.message_read_receipts('00000000-0000-4000-8000-0000000000c2');
select public._check(20, 'geçmiş gizliyken: katılmadan ÖNCEKİ mesaj için yeni üye listelenmez; geçmiş açılınca "okumadı" olarak listelenir',
  (select before_n from _rc4b) = 0 and (select has_read from _rc5 where user_id = :bobby) is false);
select public.update_chat_group_owner_settings(public._g('g'), '{"history_visible":false}');
reset role;

-- ============================================================================
-- 2. Sabitleme
-- ============================================================================
create temp table _msg_before as select id, body, sender_id, created_at, edited_at, deleted_at, attachments from public.messages where id = '00000000-0000-4000-8000-0000000000b1';
set role authenticated;
select public._as_user(:alice);
select public._check(21, 'sabit (birebir): iki taraf da sabitleyebilir; tekrar sabitleme idempotent',
  public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000b1')) = 'ok'
  and public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000b1')) = 'ok');
select public._as_user(:bobby);
select public._check(22, 'sabit (birebir): karşı taraf da görür ve kendisi de sabitleyip kaldırabilir',
  (select count(*) from public.pinned_messages where conversation_id = public._g('dm')) = 1
  and public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000a1')) = 'ok');
select public._as_user(:erin);
select public._check(23, 'sabit: üye olmayan ne görür ne sabitler (mesajın varlığı bile sızmaz); doğrudan yazamaz',
  (select count(*) from public.pinned_messages) = 0
  and public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000a2')) like '%message_not_found%'
  and public._try(format('select public.set_message_pinned(%L, false)', '00000000-0000-4000-8000-0000000000b1')) like '%message_not_found%'
  and public._try(format('insert into public.pinned_messages (message_id, conversation_id) values (%L, %L)', '00000000-0000-4000-8000-0000000000a2', public._g('dm'))) like '%permission denied%'
  and public._try(format('delete from public.pinned_messages where message_id = %L', '00000000-0000-4000-8000-0000000000b1')) like '%permission denied%');
select public._as_user(:alice);
select public.set_message_pinned('00000000-0000-4000-8000-0000000000a1', false);
reset role;
select public._check(24, 'sabit: sabitleme mesajı DEĞİŞTİRMEZ; kaldırma yalnız ilgili satırı siler',
  not exists (select 1 from _msg_before b join public.messages m using (id) where (m.body, m.sender_id, m.created_at, m.edited_at, m.deleted_at, m.attachments) is distinct from (b.body, b.sender_id, b.created_at, b.edited_at, b.deleted_at, b.attachments))
  and (select count(*) from public.pinned_messages where conversation_id = public._g('dm')) = 1);
select public._check(25, 'sabit: bileşik FK — sabit başka konuşmanın mesajına bağlanamaz',
  public._try(format('insert into public.pinned_messages (message_id, conversation_id) values (%L, %L)', '00000000-0000-4000-8000-0000000000c1', public._g('dm'))) like '%violates foreign key%');
update public.messages set deleted_at = now(), body = null where id = '00000000-0000-4000-8000-0000000000b1';
select public._check(26, 'sabit: mesaj herkes için silinince sabit otomatik kalkar (bozuk kayıt kalmaz)',
  (select count(*) from public.pinned_messages where message_id = '00000000-0000-4000-8000-0000000000b1') = 0);
set role authenticated;
select public._as_user(:alice);
select public._check(27, 'sabit: silinmiş mesaj sabitlenemez',
  public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000b1')) like '%message_not_found%');
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:alice, :bobby);
set role authenticated;
select public._as_user(:bobby);
select public._check(28, 'sabit (birebir): engel ilişkisi varken sabitlenemez',
  public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000a2')) like '%forbidden%');
reset role;
delete from public.blocks;

-- sınır: 20 sabit
insert into public.messages (id, conversation_id, sender_id, body, created_at)
  select gen_random_uuid(), public._g('dm'), :alice, 'toplu ' || i, now() - make_interval(secs => 100 - i) from generate_series(1, 25) i;
set role authenticated;
select public._as_user(:alice);
select public.set_message_pinned(id, true) from (select id from public.messages where body like 'toplu %' order by created_at limit 20) x;
select public._check(29, 'sabit: konuşma başına en çok 20 (20 sabitlenir; 21. reddedilir)',
  (select count(*) from public.pinned_messages where conversation_id = public._g('dm')) = 20
  and public._try(format('select public.set_message_pinned(%L, true)', (select id from public.messages where body = 'toplu 25'))) like '%pin_limit_reached%');
reset role;

-- grup sabitleme yetkisi
set role authenticated;
select public._as_user(:dave);
select public._check(30, 'sabit (grup): normal üye varsayılanda sabitleyemez',
  public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000c2')) like '%forbidden%');
select public._as_user(:carol);
select public._check(31, 'sabit (grup): moderatör varsayılanda sabitler',
  public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000c2')) = 'ok');
select public._as_user(:dave);
select public._check(32, 'sabit (grup): üye sabiti görür ama kaldıramaz',
  (select count(*) from public.pinned_messages where conversation_id = public._g('g')) = 1
  and public._try(format('select public.set_message_pinned(%L, false)', '00000000-0000-4000-8000-0000000000c2')) like '%forbidden%');
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('g'), '{"members_can_pin":true}');
select public._as_user(:dave);
select public._check(33, 'sabit (grup): owner "üyeler de sabitleyebilsin"i açınca üye sabitler ve kaldırır',
  public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000c1')) = 'ok'
  and public._try(format('select public.set_message_pinned(%L, false)', '00000000-0000-4000-8000-0000000000c1')) = 'ok');
select public._as_user(:bobby);
select public._check(34, 'sabit (grup): admin ayarı değiştiremez (members_can_pin yalnız owner)',
  public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"members_can_pin":false}')) like '%forbidden%');
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('g'), '{"members_can_pin":false,"role_permissions":{"moderator":{"pin_messages":false}}}');
select public._as_user(:carol);
select public._check(35, 'sabit (grup): owner moderatörden pin_messages''ı alınca moderatör sabitleyemez/kaldıramaz; owner yapar',
  public._try(format('select public.set_message_pinned(%L, false)', '00000000-0000-4000-8000-0000000000c2')) like '%forbidden%'
  and (select count(*) from public.pinned_messages where conversation_id = public._g('g')) = 1);
select public._as_user(:alice);
select public._check(36, 'sabit (grup): owner kısıtlanamaz',
  public._try(format('select public.set_message_pinned(%L, false)', '00000000-0000-4000-8000-0000000000c2')) = 'ok');
select public.set_message_pinned('00000000-0000-4000-8000-0000000000c2', true);
select public.remove_chat_group_member(public._g('g'), :dave);
select public._as_user(:dave);
select public._check(37, 'sabit (grup): çıkarılan üye sabitleri göremez, sabitleyemez',
  (select count(*) from public.pinned_messages where conversation_id = public._g('g')) = 0
  and public._try(format('select public.set_message_pinned(%L, true)', '00000000-0000-4000-8000-0000000000c3')) like '%message_not_found%');
select public._as_user(:erin);
select public._check(38, 'sabit (grup): üye olmayan kapalı grubun sabitlerini görmez',
  (select count(*) from public.pinned_messages where conversation_id = public._g('g')) = 0);
reset role;
select public._check(39, 'sabit (grup): sabitleme/kaldırma denetim kaydına düştü',
  (select count(*) from public.chat_group_audit where group_id = public._g('g') and action in ('message_pinned', 'message_unpinned')) >= 4);

-- ============================================================================
-- 3. Yıldızlı mesajlar
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
insert into public.message_stars (user_id, message_id) values (:alice, '00000000-0000-4000-8000-0000000000a2');
insert into public.message_stars (user_id, message_id) values (:alice, '00000000-0000-4000-8000-0000000000c3');
select public._check(40, 'yıldız: aynı mesaj aynı kullanıcı tarafından iki kez yıldızlanamaz',
  public._try(format('insert into public.message_stars (user_id, message_id) values (%L, %L)', :alice, '00000000-0000-4000-8000-0000000000a2')) like '%duplicate key%');
select public._check(41, 'yıldız: başkası adına yıldız eklenemez; erişemediği mesaj yıldızlanamaz (alice dave''in değil, ama erin DM''e erişemez)',
  public._try(format('insert into public.message_stars (user_id, message_id) values (%L, %L)', :bobby, '00000000-0000-4000-8000-0000000000a2')) like '%row-level security%');
select public._as_user(:erin);
select public._check(42, 'yıldız: üye olmayan özel sohbet/grup mesajını yıldızlayamaz',
  public._try(format('insert into public.message_stars (user_id, message_id) values (%L, %L)', :erin, '00000000-0000-4000-8000-0000000000a2')) like '%row-level security%'
  and public._try(format('insert into public.message_stars (user_id, message_id) values (%L, %L)', :erin, '00000000-0000-4000-8000-0000000000c1')) like '%row-level security%');
select public._as_user(:bobby);
select public._check(43, 'yıldız: bobby alice''in yıldızlarını okuyamaz/silemez/güncelleyemez; kendi yıldızı bağımsız',
  (select count(*) from public.message_stars) = 0
  and public._try(format('delete from public.message_stars where user_id = %L', :alice)) = 'ok'
  and public._try(format('update public.message_stars set user_id = %L', :bobby)) like '%permission denied%');
insert into public.message_stars (user_id, message_id) values (:bobby, '00000000-0000-4000-8000-0000000000a2');
select public._as_user(:alice);
select public._check(44, 'yıldız: bobby''nin silme denemesi ve kendi yıldızı alice''inkini etkilemedi',
  (select count(*) from public.message_stars) = 2);
reset role;
select public._check(45, 'yıldız: yıldızlama mesaj tablosunu DEĞİŞTİRMEZ',
  not exists (select 1 from public.messages where id = '00000000-0000-4000-8000-0000000000a2' and (edited_at is not null or deleted_at is not null)));

set role authenticated;
select public._as_user(:alice);
create temp table _st as select * from public.list_starred_messages(30, null, null);
select public._check(46, 'yıldız listesi: birebir + grup mesajı tek listede; tür, grup adı ve karşı taraf doğru',
  (select count(*) from _st) = 2
  and (select kind from _st where message_id = '00000000-0000-4000-8000-0000000000a2') = 'direct'
  and (select partner_id from _st where message_id = '00000000-0000-4000-8000-0000000000a2') = :bobby
  and (select kind from _st where message_id = '00000000-0000-4000-8000-0000000000c3') = 'group'
  and (select group_name from _st where message_id = '00000000-0000-4000-8000-0000000000c3') = 'Okundu Grubu'
  and (select partner_id is null from _st where message_id = '00000000-0000-4000-8000-0000000000c3'));
select public._check(47, 'yıldız listesi: keyset sayfalama (limit 1 + imleç → diğer kayıt; tekrar yok)',
  (select count(*) from public.list_starred_messages(1, null, null)) = 1
  and (select message_id from public.list_starred_messages(1, (select starred_at from public.list_starred_messages(1, null, null)), (select message_id from public.list_starred_messages(1, null, null))))
      is distinct from (select message_id from public.list_starred_messages(1, null, null)));
reset role;

-- yıldız + üyelik / silme / benden sil / temizle
insert into public.message_stars (user_id, message_id) values (:dave, '00000000-0000-4000-8000-0000000000c3');   -- dave artık grupta değil
set role authenticated;
select public._as_user(:dave);
select public._check(48, 'yıldız: gruptan çıkarılan kullanıcı artık erişemediği özel grup mesajını listede GÖRMEZ',
  (select count(*) from public.list_starred_messages(30, null, null)) = 0);
select public._as_user(:alice);
insert into public.message_hidden_for (message_id, user_id) values ('00000000-0000-4000-8000-0000000000a2', :alice);
select public._check(49, 'yıldız: "benden sil" yapılan mesajın yıldızı kalkar',
  (select count(*) from public.message_stars where message_id = '00000000-0000-4000-8000-0000000000a2' and user_id = :alice) = 0);
reset role;
update public.messages set deleted_at = now(), body = null where id = '00000000-0000-4000-8000-0000000000c3';
select public._check(50, 'yıldız: mesaj herkes için silinince herkesin yıldızı kalkar; liste tutarlı',
  (select count(*) from public.message_stars where message_id = '00000000-0000-4000-8000-0000000000c3') = 0);
-- 1000 yıldız sınırı (toplu kurulum hız sınırına takılmasın: oturumsuz/sunucu gibi yazılır)
select set_config('request.jwt.claim.sub', '', false);
insert into public.messages (id, conversation_id, sender_id, body, created_at)
  select gen_random_uuid(), public._g('dm'), :bobby, 'yildiz ' || i, now() - make_interval(secs => 1000 + i) from generate_series(1, 1001) i;
insert into public.message_stars (user_id, message_id) select :carol, id from (select id from public.messages where body like 'yildiz %' limit 1000) s;
select public._check(51, 'yıldız: kullanıcı başına 1000 sınırı', public._try(format('insert into public.message_stars (user_id, message_id) select %L, id from public.messages where body like ''yildiz %%'' offset 1000 limit 1', :carol)) like '%star_limit_reached%');

-- ============================================================================
-- 4. Arama
-- ============================================================================
reset role;
insert into public.messages (id, conversation_id, sender_id, body, created_at)
  values ('00000000-0000-4000-8000-0000000000b2', public._g('dm'), :bobby, 'Selam! Hazırım_tamam', now() - interval '2 hours');
set role authenticated;
select public._as_user(:alice);
select public._check(52, 'arama: büyük/küçük harfe duyarsız eşleşir, gönderen ve zaman döner',
  (select count(*) from public.search_conversation_messages(public._g('dm'), 'MERHABA')) = 1
  and (select sender_id from public.search_conversation_messages(public._g('dm'), 'merhaba')) = :alice);
select public._check(53, 'arama: % ve _ joker değil, düz karakter (100% bulur; "Hazırım_tamam" _ ile bulunur; "Haz_rım" bulunmaz)',
  (select count(*) from public.search_conversation_messages(public._g('dm'), '100%')) = 1
  and (select count(*) from public.search_conversation_messages(public._g('dm'), 'Hazırım_tamam')) = 1
  and (select count(*) from public.search_conversation_messages(public._g('dm'), 'Haz_rım')) = 0
  and (select count(*) from public.search_conversation_messages(public._g('dm'), '%%')) = 0);
select public._check(54, 'arama: çok kısa/çok uzun terim reddedilir; enjeksiyon denemesi sonuçsuz',
  public._try(format('select * from public.search_conversation_messages(%L, ''a'')', public._g('dm'))) like '%invalid_query%'
  and public._try(format('select * from public.search_conversation_messages(%L, %L)', public._g('dm'), repeat('x', 101))) like '%invalid_query%'
  and (select count(*) from public.search_conversation_messages(public._g('dm'), '''; drop table messages; --')) = 0);
select public._check(55, 'arama: silinmiş mesaj sonuçta yok; keyset sayfalama (toplu: 25 kayıt, 10''luk sayfalar tekrarsız)',
  (select count(*) from public.search_conversation_messages(public._g('dm'), 'Selam')) = 1
  and (select count(*) from public.search_conversation_messages(public._g('dm'), 'toplu', 50)) = 25
  and (select count(*) from public.search_conversation_messages(public._g('dm'), 'toplu', 10)) = 10
  and (select count(distinct id) from (
        select * from public.search_conversation_messages(public._g('dm'), 'toplu', 10)
        union all select * from public.search_conversation_messages(public._g('dm'), 'toplu', 10,
          (select min(created_at) from public.search_conversation_messages(public._g('dm'), 'toplu', 10)),
          (select id from public.search_conversation_messages(public._g('dm'), 'toplu', 10) order by created_at, id limit 1))) u) = 20);
select public._as_user(:erin);
select public._check(56, 'arama: üye olmayan ne kapalı grupta ne birebir sohbette sonuç alır (parametre kurcalama dahil)',
  (select count(*) from public.search_conversation_messages(public._g('dm'), 'merhaba')) = 0
  and (select count(*) from public.search_conversation_messages(public._g('g'), 'Grup')) = 0);
select public._as_user(:bobby);
select public._check(57, 'arama: grupta geçmiş gizliyken katılmadan önceki mesajlar bulunmaz (bobby yeniden katıldı)',
  (select count(*) from public.search_conversation_messages(public._g('g'), 'Grup mesajı')) = 0);
select public._as_user(:carol);
select public._check(58, 'arama: aktif üye grup mesajını bulur',
  (select count(*) from public.search_conversation_messages(public._g('g'), 'Grup mesajı')) = 2);
select public._as_user(:dave);
select public._check(59, 'arama: çıkarılan üye grupta sonuç alamaz',
  (select count(*) from public.search_conversation_messages(public._g('g'), 'Grup mesajı')) = 0);
select public._as_user(:alice);
update public.conversation_members set cleared_at = now() - interval '90 minutes' where conversation_id = public._g('dm') and user_id = :alice;
select public._check(60, 'arama: kişisel "mesajları temizle"den önceki mesajlar bulunmaz',
  (select count(*) from public.search_conversation_messages(public._g('dm'), 'Merhaba bobby')) = 0
  and (select count(*) from public.search_conversation_messages(public._g('dm'), 'toplu 25')) = 1);
reset role;

-- ============================================================================
-- 5. Yazıyor kanalı yetkisi
-- ============================================================================
select public._check(61, 'yazıyor: konu adı doğrulaması — üyelik, bozuk biçim ve başka önek',
  (select public._as_user(:alice) is not null)
  and (select public.can_use_typing_topic('typing:' || public._g('dm')::text))
  and not public.can_use_typing_topic('typing:' || public._g('g')::text || 'x')
  and not public.can_use_typing_topic('typing:not-a-uuid')
  and not public.can_use_typing_topic('other:' || public._g('dm')::text));
select public._as_user(:erin);
select public._check(62, 'yazıyor: üye olmayan konuya yetkili değil; çıkarılan grup üyesi de değil',
  not public.can_use_typing_topic('typing:' || public._g('dm')::text)
  and not public.can_use_typing_topic('typing:' || public._g('g')::text));
select public._as_user(:dave);
select public._check(63, 'yazıyor: çıkarılan grup üyesi kapalı grubun yazıyor konusuna girememe',
  not public.can_use_typing_topic('typing:' || public._g('g')::text));
insert into realtime.messages (topic, extension, payload) values ('typing:' || public._g('dm')::text, 'broadcast', '{}'), ('typing:' || public._g('g')::text, 'broadcast', '{}'), ('typing:' || public._g('dm')::text, 'presence', '{}');
-- Realtime, politikayı abonelik konusunu `realtime.topic()` olarak ayarlayıp sınar (satırın topic'ini değil).
set role authenticated;
select public._as_user(:bobby);
select set_config('realtime.topic', 'typing:' || public._g('dm')::text, false);
create temp table _rt1 as select (select count(*) from realtime.messages where extension = 'broadcast') as bc, (select count(*) from realtime.messages where extension = 'presence') as pr;
select set_config('realtime.topic', 'other:' || public._g('dm')::text, false);
create temp table _rt2 as select (select count(*) from realtime.messages) as n;
select public._check(64, 'yazıyor: Realtime politikası — DM üyesi kendi konusunda broadcast okur; presence uzantısını ve başka konuyu okumaz',
  (select bc from _rt1) > 0 and (select pr from _rt1) = 0 and (select n from _rt2) = 0);
select public._as_user(:erin);
select set_config('realtime.topic', 'typing:' || public._g('dm')::text, false);
create temp table _rt3 as select (select count(*) from realtime.messages) as n;
select public._check(65, 'yazıyor: Realtime politikası — üye olmayan hiçbir şey okuyamaz ve yayınlayamaz',
  (select n from _rt3) = 0
  and public._try(format('insert into realtime.messages (topic, extension, payload) values (%L, ''broadcast'', ''{}'')', 'typing:' || public._g('dm')::text)) like '%row-level security%');
select public._as_user(:dave);
select set_config('realtime.topic', 'typing:' || public._g('g')::text, false);
create temp table _rt4 as select (select count(*) from realtime.messages) as n;
select public._as_user(:bobby);
select set_config('realtime.topic', 'typing:' || public._g('dm')::text, false);
select public._check(66, 'yazıyor: Realtime politikası — üye kendi konusuna yayınlar; çıkarılan üye grup konusunu okuyamaz/yayınlayamaz',
  public._try(format('insert into realtime.messages (topic, extension, payload) values (%L, ''broadcast'', ''{}'')', 'typing:' || public._g('dm')::text)) = 'ok'
  and (select n from _rt4) = 0
  and (select public._as_user(:dave) is not null) is not null);
select public._as_user(:dave);
select set_config('realtime.topic', 'typing:' || public._g('g')::text, false);
select public._check(67, 'yazıyor: Realtime politikası — çıkarılan üye grup konusuna yayın yapamaz',
  public._try(format('insert into realtime.messages (topic, extension, payload) values (%L, ''broadcast'', ''{}'')', 'typing:' || public._g('g')::text)) like '%row-level security%');
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
