-- Ekipler, WP4 (docs/history/353-*): ekip kanalları + ÖZEL KANAL / KONUK SIZINTI testi. Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-channels.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank'),(:gina,'gina')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
create or replace function public._chan(p_name text) returns uuid language sql security definer as $$
  select id from public.team_channels where team_id = public._g('T') and name = p_name $$;
-- Süper kullanıcı gözüyle mesaj ekler (yazma kuralları ayrıca istemci rolüyle sınanır).
create or replace function public._msg(p_conv uuid, p_sender uuid, p_body text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin insert into public.messages (conversation_id, sender_id, body) values (p_conv, p_sender, p_body) returning id into v; return v; end $$;
create or replace function public._members(p_conv uuid) returns text language sql security definer as $$
  select coalesce(string_agg(p.username, ',' order by p.username), '') from public.conversation_members m join public.profiles p on p.id = m.user_id where m.conversation_id = p_conv $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text),
  public._chan(text), public._msg(uuid, uuid, text), public._members(uuid) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici, dave + gina üye, erin konuk).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'), (public._g('T'), :gina, 'member');
insert into public.team_members (team_id, user_id, role, guest_until, guest_org) values (public._g('T'), :erin, 'guest', now() + interval '30 days', 'Kuzey Kafe');
insert into public._ctx select 'GENEL', public._chan('genel')::text;
insert into public._ctx select 'DUYURU', public._chan('duyurular')::text;

-- 1) Varsayılan kanallar -------------------------------------------------------------------------------------------------------------------
select public._check(1, 'her ekip "genel" (varsayılan, açık) ve "duyurular" (yalnız yöneticiler yazar) ile doğar; kanal sayacı 2',
  (select is_default and mode = 'open' and posting_policy = 'members' from public.team_channels where id = public._g('GENEL'))
  and (select posting_policy = 'admins' and not is_default from public.team_channels where id = public._g('DUYURU'))
  and (select channel_count from public.teams where id = public._g('T')) = 2);
select public._check(2, 'açık kanal üyeliği ekip üyeleri (konuk HARİÇ); yabancı yok', public._members(public._g('GENEL')) = 'alice,bobby,carol,dave,gina');
select public._check(3, 'kanal konuşması kind=team_channel; istemci kanal konuşması açamaz', (select kind from public.conversations where id = public._g('GENEL')) = 'team_channel');

-- 2) Kanal oluşturma -----------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_create_channel(public._g('T'), 'Gizli Plan', 'yönetim', 'private', null, 'members', 'all',
  json_build_array(json_build_object('type','member','id',:carol::text,'level','edit'), json_build_object('type','member','id',:gina::text,'level','view'))::text::jsonb) as v \gset gz_
insert into public._ctx values ('GIZLI', :'gz_v');
select public._check(4, 'yönetici özel kanal açar; ad Türkçe karaktersiz kebab biçimine çevrilir', (select name from public.team_channels where id = :'gz_v') = 'gizli-plan');
select public._as_user(:carol);
select public._check(5, 'düzenleyici kanal açamaz', public._try(format($$select public.team_create_channel(%L, 'x-kanal')$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(6, 'yabancı kanal açamaz (team_not_found)', public._try(format($$select public.team_create_channel(%L, 'x-kanal')$$, public._g('T'))) like '%team_not_found%');
select public._as_user(:bobby);
select public._check(7, 'aynı ad ikinci kez alınamaz; geçersiz mod/ad reddedilir',
  public._try(format($$select public.team_create_channel(%L, 'GİZLİ plan')$$, public._g('T'))) like '%channel_name_taken%'
  and public._try(format($$select public.team_create_channel(%L, 'ok-ad', '', 'gizemli')$$, public._g('T'))) like '%channel_invalid%'
  and public._try(format($$select public.team_create_channel(%L, '---')$$, public._g('T'))) like '%channel_invalid%');
reset role;
select public._check(8, 'özel kanal üyeliği: yöneticiler + seçilenler (alice, bobby, carol, gina); dave ve konuk YOK', public._members(public._g('GIZLI')) = 'alice,bobby,carol,gina');

-- Space'e bağlı kanal: Space'e dave (düzenler) ve erin (konuk, görüntüler) erişir
set role authenticated;
select public._as_user(:bobby);
select public.team_create_space(public._g('T'), 'Kuzey Kafe', '', 'free', '{}', 'selected') as v \gset sp_
insert into public._ctx values ('SP', :'sp_v');
select public.team_set_space_access(:'sp_v', 'selected', json_build_array(json_build_object('type','member','id',:dave::text,'level','edit'), json_build_object('type','member','id',:erin::text,'level','view'))::text::jsonb);
select public.team_create_channel(public._g('T'), 'kuzey-kafe', '', 'space', :'sp_v') as v \gset sc_
insert into public._ctx values ('SPC', :'sc_v');
reset role;
select public._check(9, 'Space’e bağlı kanalın üyeleri Space erişimini izler (yöneticiler + dave + konuk erin); carol YOK', public._members(public._g('SPC')) = 'alice,bobby,dave,erin');
set role authenticated;
select public._as_user(:bobby);
select public.team_set_space_access(public._g('SP'), 'selected', json_build_array(json_build_object('type','member','id',:carol::text,'level','edit'), json_build_object('type','member','id',:erin::text,'level','view'))::text::jsonb);
reset role;
select public._check(10, 'Space erişimi değişince bağlı kanal üyeliği de değişir (dave çıktı, carol girdi)', public._members(public._g('SPC')) = 'alice,bobby,carol,erin');
select public._check(11, '(space kanalı) mod/Space uyumsuzluğu reddedilir', public._try(format($$update public.team_channels set mode = 'space', space_id = null where id = %L$$, public._g('SPC'))) like '%team_channels_space_shape%');

-- 3) Yazma kuralları ---------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(12, 'üye genel kanala yazar', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'merhaba')$$, public._g('GENEL'), :carol)) = 'ok');
select public._as_user(:dave);
select public._check(13, '"yalnız yöneticiler yazar" kanalına üye yazamaz', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$$, public._g('DUYURU'), :dave)) like '%row-level security%');
select public._as_user(:bobby);
select public._check(14, 'yönetici duyuru kanalına yazar', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'duyuru')$$, public._g('DUYURU'), :bobby)) = 'ok');
select public._as_user(:gina);
select public._check(15, 'özel kanalda "görüntüler" düzeyindeki üye okur ama yazamaz',
  public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$$, public._g('GIZLI'), :gina)) like '%row-level security%');
select public._as_user(:carol);
select public._check(16, '"düzenler" düzeyindeki üye özel kanala yazar', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'gizli sırrımız var')$$, public._g('GIZLI'), :carol)) = 'ok');
select public._as_user(:dave);
select public._check(17, 'başkası adına mesaj yazılamaz', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$$, public._g('GENEL'), :carol)) like '%row-level security%');
select public._as_user(:erin);
select public._check(18, 'konuk ekibin genel kanalına yazamaz (üyesi değil)', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$$, public._g('GENEL'), :erin)) like '%row-level security%');
select public._check(19, 'konuk, bağlı olduğu Space kanalına yazar', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'selam')$$, public._g('SPC'), :erin)) = 'ok');
reset role;

-- 4) SIZINTI TESTİ: özel kanal (GIZLI) — ekip üyesi ama kanal üyesi OLMAYAN dave, konuk erin, yabancı frank ----------------------------------------------
select public._msg(public._g('GIZLI'), :carol, 'sır: bütçe yüzde 40 artıyor @gina') as v \gset gm_
insert into public._ctx values ('GM', :'gm_v');
insert into public.pinned_messages (message_id, conversation_id, pinned_by) values (public._g('GM'), public._g('GIZLI'), :carol);
insert into public.message_stars (user_id, message_id) values (:carol, public._g('GM'));
set role authenticated;
select public._as_user(:dave);
select public._check(20, 'SIZINTI okuma: ekip üyesi özel kanal mesajını/konuşmasını/üyeliğini/kanal satırını göremez',
  public._cnt(format('select count(*) from public.messages where conversation_id = %L', public._g('GIZLI'))) = 0
  and public._cnt(format('select count(*) from public.conversations where id = %L', public._g('GIZLI'))) = 0
  and public._cnt(format('select count(*) from public.conversation_members where conversation_id = %L', public._g('GIZLI'))) = 0
  and public._cnt(format('select count(*) from public.team_channels where id = %L', public._g('GIZLI'))) = 0);
select public._check(21, 'SIZINTI arama/yıldız/medya/önizleme/okunmamış/sabit listesi boş',
  public._cnt(format($$select count(*) from public.search_conversation_messages(%L, 'bütçe')$$, public._g('GIZLI'))) <= 0
  and public._cnt('select count(*) from public.list_starred_messages()') = 0
  and public._cnt(format($$select count(*) from public.chat_shared_items(%L, 'media')$$, public._g('GIZLI'))) <= 0
  and public._cnt(format('select count(*) from public.conversation_last_messages(array[%L]::uuid[])', public._g('GIZLI'))) = 0
  and public._cnt(format('select count(*) from public.group_unread_counts(array[%L]::uuid[])', public._g('GIZLI'))) = 0
  and public._cnt(format('select count(*) from public.pinned_messages where conversation_id = %L', public._g('GIZLI'))) = 0);
select public._check(22, 'SIZINTI sabitleme/okundu bilgisi/rapor: mesajın varlığı bile sızmaz',
  public._try(format($$select public.set_message_pinned(%L, true)$$, public._g('GM'))) like '%message_not_found%'
  and public._try(format($$select public.message_read_receipts(%L)$$, public._g('GM'))) like '%forbidden%'
  and public._try(format($$select public.team_moderate_message(%L)$$, public._g('GM'))) ~ 'message_not_found|team_forbidden');
select public._check(23, 'SIZINTI "yazıyor" konusu ve depolama kapısı (is_conversation_member) kapalı',
  not public.can_use_typing_topic('typing:' || public._g('GIZLI')) and not public.is_conversation_member(public._g('GIZLI')));
select public._check(24, 'SIZINTI yönetim RPC’leri: üye listesi / erişim / güncelleme',
  public._try(format($$select * from public.team_channel_members(%L)$$, public._g('GIZLI'))) like '%channel_not_found%'
  and public._try(format($$select public.team_channel_access(%L)$$, public._g('GIZLI'))) like '%team_forbidden%'
  and public._try(format($$select public.team_update_channel(%L, '{"description":"x"}')$$, public._g('GIZLI'))) like '%team_forbidden%');
select public._check(25, 'SIZINTI reaksiyon/yıldız eklenemez', public._try(format($$insert into public.message_stars (user_id, message_id) values (%L, %L)$$, :dave, public._g('GM'))) ~ 'row-level security|violates|permission denied|forbidden|not_found');
select public._check(26, 'dave’in kanal listesi özel kanalı içermez', (select count(*) from public.team_list_channels(public._g('T')) where name = 'gizli-plan') = 0);
select public._as_user(:erin);
select public._check(27, 'SIZINTI (konuk): özel kanal + genel kanal mesajları görünmez',
  public._cnt(format('select count(*) from public.messages where conversation_id = %L', public._g('GIZLI'))) = 0
  and public._cnt(format('select count(*) from public.messages where conversation_id = %L', public._g('GENEL'))) = 0
  and public._cnt(format('select count(*) from public.conversations where id in (%L, %L)', public._g('GIZLI'), public._g('GENEL'))) = 0);
select public._check(28, 'konuk yalnızca Space kanalını görür ve okur', (select count(*) from public.team_list_channels(public._g('T'))) = 1
  and public._cnt(format('select count(*) from public.messages where conversation_id = %L', public._g('SPC'))) = 1);
select public._check(29, 'konuk kanal üyelerini listeleyemez', public._try(format($$select * from public.team_channel_members(%L)$$, public._g('SPC'))) like '%channel_not_found%');
select public._as_user(:frank);
select public._check(30, 'SIZINTI (yabancı): hiçbir kanal/mesaj', public._cnt('select count(*) from public.messages') = 0 and public._cnt('select count(*) from public.team_channels') = 0
  and public._try(format($$select * from public.team_list_channels(%L)$$, public._g('T'))) = 'ok' and (select count(*) from public.team_list_channels(public._g('T'))) = 0);
reset role;
select public._check(31, 'özel kanal bahsetmesi: kanal üyesi gina bildirim aldı (metin önizlemeli)', (select count(*) from public.notifications where recipient_id = :gina and message like '%#gizli-plan%' and message like '%bütçe%') = 1);
select public._msg(public._g('GIZLI'), :carol, '@dave ve @frank bakın') is not null as v \gset ignore_
select public._check(32, 'SIZINTI bildirim: kanal üyesi OLMAYAN bahsedilen (dave, frank) bildirim ALMAZ', (select count(*) from public.notifications where recipient_id in (:dave, :frank) and message like '%#gizli-plan%') = 0);
set role anon;
select public._as_user('');
select public._check(33, 'SIZINTI (anon): mesaj/kanal okunamaz, RPC’ler çağrılamaz',
  public._cnt('select count(*) from public.messages') <= 0 and public._try('select count(*) from public.team_channels') like '%permission denied%'
  and public._try(format($$select * from public.team_list_channels(%L)$$, public._g('T'))) like '%permission denied%'
  and public._try(format($$select public.team_create_channel(%L, 'x-kanal')$$, public._g('T'))) like '%permission denied%');
reset role;

-- 5) Üyelik hareketi ---------------------------------------------------------------------------------------------------------------------------
delete from public.team_members where team_id = public._g('T') and user_id = :gina;
select public._check(34, 'ekipten çıkan üye tüm kanallardan düşer ve eski mesajı okuyamaz', public._members(public._g('GIZLI')) = 'alice,bobby,carol' and public._members(public._g('GENEL')) = 'alice,bobby,carol,dave');
update public.team_members set guest_until = now() - interval '1 day' where team_id = public._g('T') and user_id = :erin;
select public._check(35, 'süresi dolan konuk Space kanalından anında düşer', public._members(public._g('SPC')) = 'alice,bobby,carol');
update public.team_members set guest_until = now() + interval '5 days' where team_id = public._g('T') and user_id = :erin;
select public._check(36, 'konuğun süresi uzatılınca erişimi geri gelir', public._members(public._g('SPC')) = 'alice,bobby,carol,erin');
update public.team_members set role = 'member' where team_id = public._g('T') and user_id = :bobby;
select public._check(37, 'yönetici üyeye düşünce özel kanal üyeliğini kaybeder (yalnızca açık kanallar kalır)', public._members(public._g('GIZLI')) = 'alice,carol');
update public.team_members set role = 'admin' where team_id = public._g('T') and user_id = :bobby;
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :gina, 'member');
select public._check(38, 'yeni üye açık kanallara otomatik girer (genel, duyurular), özel kanala girmez', public._members(public._g('GENEL')) like '%gina%' and public._members(public._g('GIZLI')) not like '%gina%');

-- 6) Okunmamış, bildirim düzeyi, bahsetme ---------------------------------------------------------------------------------------------------------
select public._msg(public._g('GENEL'), :carol, 'bir') is not null as v \gset ignore_
select public._msg(public._g('GENEL'), :carol, 'iki @dave') is not null as v \gset ignore_
select public._msg(public._g('GENEL'), :carol, 'üç') is not null as v \gset ignore_
select public._check(39, 'üye başına okunmamış sütunu YAZILMAZ (olay bütün üyelere yazmaz)', (select coalesce(sum(unread_count), 0) from public.conversation_members where conversation_id = public._g('GENEL')) = 0);
set role authenticated;
select public._as_user(:dave);
select public._check(40, 'okunmamış sayısı okuma anında hesaplanır (carol’un 4 mesajı: ilk "merhaba" + 3)', (select unread_count from public.team_list_channels(public._g('T')) where name = 'genel') = 4);
select public._check(41, 'my_teams okunmamış toplamı kanallardan gelir', (select unread_count from public.my_teams() where slug = 'atolye-mor') >= 4);
select public.mark_conversation_read_up_to(public._g('GENEL'), now());
select public._check(42, 'okundu imleci ilerleyince sayı sıfırlanır', (select unread_count from public.team_list_channels(public._g('T')) where name = 'genel') = 0);
select public._check(43, '@dave bahsetmesi dave’e bildirim üretti (kanal adresiyle)', (select count(*) from public.notifications where recipient_id = :dave and message like '%#genel%' and target_href like '%tab=chat&channel=%') = 1);
select public.team_set_channel_notify(public._g('GENEL'), 'none');
reset role;
select public._msg(public._g('GENEL'), :carol, 'dört @dave') is not null as v \gset ignore_
select public._check(44, 'bildirim düzeyi "hiç": sessize alınır, bahsetme bildirimi gelmez, sayaç 0', (select muted_at is not null from public.conversation_members where conversation_id = public._g('GENEL') and user_id = :dave)
  and (select count(*) from public.notifications where recipient_id = :dave and message like '%dört%') = 0);
set role authenticated;
select public._as_user(:dave);
select public._check(45, 'sessiz kanalın okunmamışı 0', (select unread_count from public.team_list_channels(public._g('T')) where name = 'genel') = 0 and (select muted from public.team_list_channels(public._g('T')) where name = 'genel'));
select public.team_set_channel_notify(public._g('GENEL'), 'mentions');
reset role;
select public._check(46, 'kendini anan kimse bildirim almaz', (select public._msg(public._g('GENEL'), :carol, '@carol kendime') is not null) and (select count(*) from public.notifications where recipient_id = :carol and message like '%kendime%') = 0);

-- 7) Moderasyon, sabitleme, arşiv, silme ---------------------------------------------------------------------------------------------------------
select public._msg(public._g('GENEL'), :carol, 'uygunsuz') as v \gset bad_
select public._msg(public._g('GENEL'), :alice, 'sahibin mesajı') as v \gset own_
set role authenticated;
select public._as_user(:dave);
select public._check(47, 'üye başkasının mesajını silemez/sabitleyemez', public._try(format($$select public.team_moderate_message(%L)$$, :'bad_v')) like '%team_forbidden%' and public._try(format($$select public.set_message_pinned(%L, true)$$, :'bad_v')) like '%forbidden%');
select public._as_user(:bobby);
select public._try(format($$select public.team_moderate_message(%L)$$, :'bad_v')) as v \gset r48_
select public._check(48, 'yönetici mesajı herkes için temizler', :'r48_v' = 'ok' and (select deleted_at is not null and body is null from public.messages where id = :'bad_v'));
select public._check(49, 'yönetici sahibin mesajını silemez', public._try(format($$select public.team_moderate_message(%L)$$, :'own_v')) like '%forbidden%');
select public._check(50, 'yönetici sabitler', (public.set_message_pinned(:'own_v', true) ->> 'pinned') = 'true');
select public._as_user(:alice);
select public._check(51, 'sahip kendi mesajını yönetici dahil herkes için siler ve başkasınınkini de', public._try(format($$select public.team_moderate_message(%L)$$, :'own_v')) = 'ok');
select public._as_user(:bobby);
select public._check(52, 'varsayılan kanal arşivlenemez/silinemez', public._try(format($$select public.team_archive_channel(%L, true)$$, public._g('GENEL'))) like '%channel_default_locked%'
  and public._try(format($$select public.team_delete_channel(%L)$$, public._g('GENEL'))) like '%channel_default_locked%');
select public.team_archive_channel(public._g('GIZLI'), true);
select public._as_user(:carol);
select public._check(53, 'arşivli kanala yazılamaz', public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$$, public._g('GIZLI'), :carol)) like '%row-level security%');
select public._as_user(:bobby);
select public.team_archive_channel(public._g('GIZLI'), false);
select public._try(format($$select public.team_update_channel(%L, '{"name":"Yönetim Kurulu","description":"aylık","posting_policy":"admins"}')$$, public._g('GIZLI'))) as v \gset r54_
select public._check(54, 'kanal güncellenir (ad, açıklama, yazma politikası)', :'r54_v' = 'ok'
  and (select name = 'yonetim-kurulu' and posting_policy = 'admins' from public.team_channels where id = public._g('GIZLI')));
select public._try(format($$select public.team_update_channel(%L, '{"mode":"open"}')$$, public._g('GIZLI'))) as v \gset r55_
select public._check(55, 'mod değişimi (özel → açık) üyeliği genişletir; erişim girişleri temizlenir', :'r55_v' = 'ok'
  and (select count(*) from public.team_access where channel_id = public._g('GIZLI')) = 0);
reset role;
select public._check(56, 'artık tüm ekip üyeleri (konuk hariç) kanalda', public._members(public._g('GIZLI')) = 'alice,bobby,carol,dave,gina');
set role authenticated;
select public._as_user(:bobby);
select public.team_delete_channel(public._g('GIZLI'));
reset role;
select public._check(57, 'kanal silinince konuşma, mesajlar ve üyelik gider; kanal sayacı güncellenir', not exists (select 1 from public.conversations where id = public._g('GIZLI'))
  and not exists (select 1 from public.messages where conversation_id = public._g('GIZLI')) and (select channel_count from public.teams where id = public._g('T')) = 3);
select public._check(58, 'DEĞİŞMEZ: Space yansıması hâlâ doğru (kanal motoru Space’i bozmadı)', (select count(*) from public.space_members where space_id = public._g('SP')) >= 3);
select public._check(59, 'denetim günlüğü kanal olaylarını kaydetti', (select count(*) from public.team_audit where team_id = public._g('T') and category = 'channel') >= 6);

-- 8) Ekip silinince ------------------------------------------------------------------------------------------------------------------------
delete from public.teams where id = public._g('T');
select public._check(60, 'ekip silinince kanal konuşmaları ve mesajlar da gider', not exists (select 1 from public.team_channels where team_id = public._g('T'))
  and not exists (select 1 from public.messages where conversation_id = public._g('GENEL')) and not exists (select 1 from public.conversations where id = public._g('GENEL')));

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
