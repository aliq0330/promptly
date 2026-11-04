-- Çevrimiçi durum, son görülme ve gizlilik — DB/RLS/RPC/Realtime yetkisi testi (docs/history/329-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/presence.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice bobby carol dave erin gina hank
\pset pager off
\set ON_ERROR_STOP off
set jit = off;
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''66666666-6666-4666-8666-666666666666'''
\set hank  '''77777777-7777-4777-8777-777777777777'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina'),(:hank,'hank')) as u(id, name);

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
-- Bir sorgunun tek sütunlu sonucunu metin olarak döndürür (çağıranın yetkisiyle).
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text; begin execute q into r; return r; exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._g(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._val(text), public._g(text) to public;

-- Kişi X, kişi Y'yi görebiliyor mu (presence_lookup üzerinden)?
create or replace function public._sees(viewer text, target text) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform public._as_user(viewer);
  execute 'set local role authenticated';
  select exists (select 1 from public.presence_lookup(array[target::uuid]) l where l.user_id = target::uuid) into r;
  execute 'reset role';
  return r;
end $$;
grant execute on function public._sees(text, text) to public;

-- Topluluk kurucusu: alice sahip; davet edilenler kabul eder (gerçek RPC'ler).
create or replace function public._mk(p_level text, p_members uuid[]) returns uuid language plpgsql as $$
declare v_gid uuid; v_u uuid;
begin
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  v_gid := (public.create_community('Topluluk ' || p_level, 'açıklama', p_level, null, 50, p_members, 'general', 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array p_members loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user('');
  return v_gid;
end $$;

-- ============================================================================
-- 1. Tablo ve yetkiler
-- ============================================================================
select public._check(1, 'her profilin bir presence_state satırı var (tetikleyici)',
  (select count(*) from public.profiles) = (select count(*) from public.presence_state) and (select count(*) from public.presence_state) = 7);
select public._check(2, 'varsayılan: Otomatik + Herkes, son görülme boş',
  (select bool_and(mode = 'auto' and audience = 'everyone' and last_active_at is null) from public.presence_state));
select public._check(3, 'anon tabloyu okuyamaz/yazamaz', not has_table_privilege('anon', 'public.presence_state', 'SELECT')
  and not has_table_privilege('anon', 'public.presence_state', 'UPDATE'));
select public._check(4, 'authenticated tabloyu okuyamaz/yazamaz (her şey RPC)', not has_table_privilege('authenticated', 'public.presence_state', 'SELECT')
  and not has_table_privilege('authenticated', 'public.presence_state', 'UPDATE') and not has_table_privilege('authenticated', 'public.presence_state', 'INSERT'));
select public._check(5, 'anon hiçbir presence RPC''sini çağıramaz',
  not has_function_privilege('anon', 'public.presence_lookup(uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.my_presence()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_my_presence(text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.presence_heartbeat()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.presence_set_focus(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.community_presence_counts(uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.community_online_members(uuid, boolean, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.community_events_presence(uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.can_use_presence_topic(text, boolean)', 'EXECUTE'));
select public._check(6, 'iç yardımcılar istemciye kapalı',
  not has_function_privilege('authenticated', 'public._presence_can_view(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public._presence_hidden(uuid)', 'EXECUTE'));

set role authenticated;
select public._as_user(:bobby);
select public._check(7, 'oturumlu kullanıcı tabloyu doğrudan okuyamaz', public._try('select * from public.presence_state') ilike '%permission denied%');
select public._check(8, 'başkasının son görülmesini doğrudan değiştiremez',
  public._try(format('update public.presence_state set last_active_at = now() - interval ''1 year'' where user_id = %L', '11111111-1111-4111-8111-111111111111')) ilike '%permission denied%');
reset role;
select public._as_user('');
set role anon;
select public._check(9, 'anon presence_lookup çağıramaz', public._try(format('select * from public.presence_lookup(array[%L]::uuid[])', '11111111-1111-4111-8111-111111111111')) ilike '%permission denied%');
reset role;

-- ============================================================================
-- 2. Kitle matrisi: Herkes / Takip ettiklerim / Karşılıklı / Hiç kimse
-- ============================================================================
select public._check(10, 'Herkes: bobby alice''i görür', public._sees(:bobby, :alice));
select public._check(11, 'kişi kendini lookup''ta görmez (kendi durumu my_presence''tan)', not public._sees(:alice, :alice));

-- alice → carol ve dave'i takip eder; carol alice'i geri takip eder.
insert into public.follows (follower_id, following_id) values (:alice, :carol), (:alice, :dave), (:carol, :alice);

set role authenticated;
select public._as_user(:alice);
create temp table _k0 as select topic from public.my_presence();
grant all on _k0 to public;
select * from public.set_my_presence(null, 'following');
reset role;
select public._check(12, 'Takip ettiklerim: alice''in takip ettiği carol görür', public._sees(:carol, :alice));
select public._check(13, 'Takip ettiklerim: alice''in takip ettiği dave görür (geri takip şartı yok)', public._sees(:dave, :alice));
select public._check(14, 'Takip ettiklerim: alice''i takip etmeyen/etmediği bobby göremez', not public._sees(:bobby, :alice));
select public._check(15, 'kitle değişince kanal anahtarı döner',
  (select topic from _k0) <> (select public._presence_topic(user_id, topic_key) from public.presence_state where user_id = :alice));

set role authenticated;
select public._as_user(:alice);
create temp table _k1 as select topic from public.my_presence();
grant all on _k1 to public;
select * from public.set_my_presence(null, 'following');
reset role;
select public._check(16, 'aynı değeri yeniden kaydetmek anahtarı DÖNDÜRMEZ',
  (select topic from _k1) = (select public._presence_topic(user_id, topic_key) from public.presence_state where user_id = :alice));

set role authenticated;
select public._as_user(:alice);
select * from public.set_my_presence(null, 'mutual');
reset role;
select public._check(17, 'Karşılıklı: karşılıklı takipleşen carol görür', public._sees(:carol, :alice));
select public._check(18, 'Karşılıklı: tek yönlü (alice → dave) yetmez', not public._sees(:dave, :alice));
select public._check(19, 'Karşılıklı: hiç ilişkisi olmayan bobby göremez', not public._sees(:bobby, :alice));

set role authenticated;
select public._as_user(:alice);
select * from public.set_my_presence(null, 'nobody');
reset role;
select public._check(20, 'Hiç kimse: karşılıklı takipleşen carol bile göremez', not public._sees(:carol, :alice));
select public._check(21, 'Karşılıklılık: "Hiç kimse" seçen alice başkasını (Herkes açık bobby) göremez', not public._sees(:alice, :bobby));

-- ============================================================================
-- 3. Görünmez mod + son görülme nabzı
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select * from public.set_my_presence('auto', 'everyone');
select * from public.presence_heartbeat();
reset role;
select public._check(22, 'nabız son görülmeyi yazar', (select last_active_at is not null from public.presence_state where user_id = :alice));
update public.presence_state set last_active_at = now() - interval '30 seconds' where user_id = :alice;
insert into public._ctx select 'la1', last_active_at::text from public.presence_state where user_id = :alice;
set role authenticated;
select public._as_user(:alice);
select * from public.presence_heartbeat();
reset role;
select public._check(23, '60 sn içinde ikinci nabız yazmaz (yazma sınırı)',
  (select last_active_at::text from public.presence_state where user_id = :alice) = public._g('la1'));
update public.presence_state set last_active_at = now() - interval '90 seconds' where user_id = :alice;
insert into public._ctx select 'la2', last_active_at::text from public.presence_state where user_id = :alice;
set role authenticated;
select public._as_user(:alice);
select * from public.presence_heartbeat();
reset role;
select public._check(24, '60 sn geçince nabız yeniden yazar',
  (select last_active_at::text from public.presence_state where user_id = :alice) <> public._g('la2'));

set role authenticated;
select public._as_user(:bobby);
create temp table _lk as select * from public.presence_lookup(array[:alice]::uuid[]);
grant all on _lk to public;
reset role;
select public._check(25, 'görebilen izleyici son görülmeyi ve kanal adını alır',
  (select count(*) = 1 and bool_and(last_active_at is not null and topic like 'presence:11111111-1111-4111-8111-111111111111:%') from _lk));

set role authenticated;
select public._as_user(:alice);
select * from public.set_my_presence('invisible', null);
reset role;
insert into public._ctx select 'la3', last_active_at::text from public.presence_state where user_id = :alice;
update public.presence_state set last_active_at = now() - interval '10 minutes' where user_id = :alice;
insert into public._ctx select 'la4', last_active_at::text from public.presence_state where user_id = :alice;
set role authenticated;
select public._as_user(:alice);
select * from public.presence_heartbeat();
reset role;
select public._check(26, 'Görünmez: nabız son görülmeyi GÜNCELLEMEZ',
  (select last_active_at::text from public.presence_state where user_id = :alice) = public._g('la4'));
select public._check(27, 'Görünmez: eski son görülme dahil hiçbir şey görünmez (lookup satırı yok)', not public._sees(:bobby, :alice));
select public._check(28, 'Görünmez: karşılıklılık — alice başkasını göremez', not public._sees(:alice, :bobby));
set role authenticated;
select public._as_user(:bobby);
create temp table _inv as select
  (select count(*) from public.presence_lookup(array[:alice]::uuid[])) as invisible_rows,
  (select count(*) from public.presence_lookup(array['99999999-9999-4999-8999-999999999999']::uuid[])) as missing_rows;
grant all on _inv to public;
reset role;
select public._check(29, 'Görünmez kişi ile var olmayan kişi ayırt edilemez (ikisi de 0 satır)',
  (select invisible_rows = 0 and missing_rows = 0 from _inv));
select public._check(30, 'my_presence kendi modunu döndürür',
  public._val(format($q$ select mode from (select public._as_user(%L)) s, lateral public.my_presence() $q$, '11111111-1111-4111-8111-111111111111')) = 'invisible');
set role authenticated;
select public._as_user(:alice);
select public._check(31, 'geçersiz mod reddedilir', public._try($q$ select * from public.set_my_presence('ghost', null) $q$) ilike '%invalid_presence_mode%');
select public._check(32, 'geçersiz kitle reddedilir', public._try($q$ select * from public.set_my_presence(null, 'friends') $q$) ilike '%invalid_presence_audience%');
select * from public.set_my_presence('auto', 'everyone');
reset role;
select public._check(33, 'Otomatik''e dönünce yeniden görünür', public._sees(:bobby, :alice));

-- ============================================================================
-- 4. Engel (iki yönlü)
-- ============================================================================
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :erin);
select public._check(34, 'engelleyen engellediğini görmez', not public._sees(:bobby, :erin));
select public._check(35, 'engellenen engelleyeni görmez', not public._sees(:erin, :bobby));
select public._check(36, 'engel üçüncü kişileri etkilemez', public._sees(:carol, :erin) and public._sees(:carol, :bobby));

-- ============================================================================
-- 5. Realtime kanal yetkisi
-- ============================================================================
insert into public._ctx select 'topicA', public._presence_topic(user_id, topic_key) from public.presence_state where user_id = :alice;
set role authenticated;
select public._as_user(:alice);
select public._check(37, 'sahibi kendi kanalında track edebilir', public.can_use_presence_topic(public._g('topicA'), true));
select public._as_user(:bobby);
select public._check(38, 'başkası o kanalda track EDEMEZ (kimliğe bürünme yok)', not public.can_use_presence_topic(public._g('topicA'), true));
select public._check(39, 'yetkili izleyici kanalı dinleyebilir', public.can_use_presence_topic(public._g('topicA'), false));
select public._check(40, 'bozuk konu adı reddedilir', not public.can_use_presence_topic('presence:abc', false)
  and not public.can_use_presence_topic('typing:11111111-1111-4111-8111-111111111111', false));
select public._check(41, 'yanlış/eski anahtar reddedilir',
  not public.can_use_presence_topic('presence:11111111-1111-4111-8111-111111111111:00000000000000000000000000000000', false));
select public._as_user(:erin);
select public._check(42, 'engelli kişi bobby''nin kanalını dinleyemez',
  not public.can_use_presence_topic((select public._presence_topic('22222222-2222-4222-8222-222222222222', '00000000000000000000000000000000')), false));
reset role;

-- Gerçek politika: realtime.topic() ayarlanır, satır presence uzantısıyla yazılır/okunur.
insert into realtime.messages (topic, extension, payload) values (public._g('topicA'), 'presence', '{}');
set role authenticated;
select public._as_user(:bobby);
select set_config('realtime.topic', public._g('topicA'), false);
select public._check(43, 'politika: yetkili izleyici presence mesajını okur', (select count(*) from realtime.messages where extension = 'presence') >= 1);
select public._check(44, 'politika: başkası sahibin kanalına presence YAZAMAZ',
  public._try(format('insert into realtime.messages (topic, extension, payload) values (%L, ''presence'', ''{}'')', public._g('topicA'))) ilike '%row-level security%');
select public._as_user(:alice);
select public._check(45, 'politika: sahibi kendi kanalına presence yazar',
  public._try(format('insert into realtime.messages (topic, extension, payload) values (%L, ''presence'', ''{}'')', public._g('topicA'))) = 'ok');
reset role;

-- Gizlilik ANINDA değişir: anahtar döner → eski kanal hem dinlemeye hem track'e kapanır.
set role authenticated;
select public._as_user(:alice);
select * from public.set_my_presence(null, 'mutual');
select public._check(46, 'ayar değişince eski kanalda sahibi bile track edemez', not public.can_use_presence_topic(public._g('topicA'), true));
select public._as_user(:bobby);
select set_config('realtime.topic', public._g('topicA'), false);
select public._check(47, 'ayar değişince eski kanalı artık kimse dinleyemez (politika satır döndürmez)', (select count(*) from realtime.messages where extension = 'presence') = 0);
select public._as_user(:alice);
select * from public.set_my_presence('invisible', 'everyone');
select public._check(48, 'Görünmez sahip yeni kanalında da track edemez',
  not public.can_use_presence_topic((select topic from public.my_presence()), true));
select * from public.set_my_presence('auto', 'everyone');
reset role;

-- ============================================================================
-- 6. Topluluklar: toplu sayı + kimlikli liste
-- ============================================================================
insert into public._ctx values ('pub', public._mk('public', array[:bobby, :carol, :dave]::uuid[])::text);
insert into public._ctx values ('res', public._mk('restricted', array[:bobby, :carol]::uuid[])::text);
reset role;
update public.conversation_members set role = 'moderator' where conversation_id = public._g('pub')::uuid and user_id = :carol;
-- Etkin: alice, bobby, carol, dave (son 5 dk); dave yalnız takip ettiklerine açık; hank etkin ama üye değil.
update public.presence_state set last_active_at = now() - interval '1 minute' where user_id in (:alice, :bobby, :carol, :dave, :hank);
update public.presence_state set audience = 'following' where user_id = :dave;
insert into public.follows (follower_id, following_id) values (:dave, :alice);  -- dave yalnız alice'i takip eder
set role authenticated;
select public._as_user(:erin);
create temp table _c1 as select * from public.community_presence_counts(array[public._g('pub')::uuid, public._g('res')::uuid]);
grant all on _c1 to public;
select public._as_user(:bobby);
create temp table _c2 as select * from public.community_presence_counts(array[public._g('pub')::uuid, public._g('res')::uuid]);
grant all on _c2 to public;
reset role;
select public._check(49, 'herkese açık topluluk: üye olmayan erin toplu sayıyı alır (yalnız Herkes kitlesi: alice+bobby+carol = 3)',
  (select online_count from _c1 where community_id = public._g('pub')::uuid) = 3, (select string_agg(community_id || '=' || online_count, ',') from _c1));
select public._check(50, 'kapalı topluluk: üye olmayana hiçbir satır dönmez (varlık/etkinlik sızmaz)',
  not exists (select 1 from _c1 where community_id = public._g('res')::uuid));
select public._check(51, 'kapalı topluluk: üye sayıyı alır (alice+bobby+carol = 3)',
  (select online_count from _c2 where community_id = public._g('res')::uuid) = 3);
update public.presence_state set mode = 'invisible' where user_id = :carol;
set role authenticated;
select public._as_user(:bobby);
select public._check(52, 'görünmez üye sayıma girmez', (select online_count from public.community_presence_counts(array[public._g('pub')::uuid])) = 2);
select public._as_user(:carol);
select public._check(53, 'karşılıklılık: gizli izleyici hiçbir sayı almaz', (select count(*) from public.community_presence_counts(array[public._g('pub')::uuid])) = 0);
reset role;
update public.presence_state set mode = 'auto' where user_id = :carol;
update public.presence_state set last_active_at = now() - interval '20 minutes' where user_id = :alice;
set role authenticated;
select public._as_user(:bobby);
select public._check(54, '5 dakikadan eski nabız "aktif" sayılmaz', (select online_count from public.community_presence_counts(array[public._g('pub')::uuid])) = 2);
reset role;
update public.presence_state set last_active_at = now() - interval '1 minute' where user_id = :alice;

set role authenticated;
select public._as_user(:bobby);
create temp table _m1 as select * from public.community_online_members(public._g('pub')::uuid, false, 50);
grant all on _m1 to public;
select public._as_user(:alice);
create temp table _m2 as select * from public.community_online_members(public._g('pub')::uuid, false, 50);
grant all on _m2 to public;
select public._as_user(:erin);
create temp table _m3 as select
  (select count(*) from public.community_online_members(public._g('pub')::uuid, false, 50)) as full_list,
  (select count(*) from public.community_online_members(public._g('pub')::uuid, true, 50)) as staff_list,
  (select count(*) from public.community_online_members(public._g('res')::uuid, true, 50)) as restricted_staff;
grant all on _m3 to public;
reset role;
select public._check(55, 'üye çevrimiçi listesi kişi başına izne tabi: bobby dave''i görmez (dave yalnız takip ettiklerine açık)',
  (select array_agg(username order by username) from _m1) = array['alice', 'bobby', 'carol'], (select string_agg(username, ',') from _m1));
select public._check(56, 'dave''in takip ettiği alice listede dave''i görür',
  exists (select 1 from _m2 where username = 'dave'));
select public._check(57, 'liste rolüne göre sıralı (sahip önce, sonra moderatör)', (select username from _m1 limit 1) = 'alice'
  and (select array_position(array_agg(username), 'carol') < array_position(array_agg(username), 'bobby') from _m1));
select public._check(58, 'herkese açık toplulukta üye olmayan tam listeyi ALAMAZ ama yönetim ekibini alır; kapalıda hiçbirini',
  (select full_list = 0 and staff_list = 2 and restricted_staff = 0 from _m3), (select full_list || '/' || staff_list || '/' || restricted_staff from _m3));
select public._check(59, 'üye olmayan etkin kişi (hank) listeye girmez', not exists (select 1 from _m2 where username = 'hank'));

-- Davet bağlantısı (jetonla sayı): yalnız geçerli bağlantı + herkese açık topluluk.
set role authenticated;
select public._as_user(:alice);
create temp table _lkp as select public.create_chat_group_link(public._g('pub')::uuid, 24, null) ->> 'token' as t;
create temp table _lkr as select public.create_chat_group_link(public._g('res')::uuid, 24, null) ->> 'token' as t;
grant all on _lkp, _lkr to public;
select public._as_user(:erin);
create temp table _lc as select
  public.community_link_presence_count((select t from _lkp)) as pub_count,
  public.community_link_presence_count((select t from _lkr)) as res_count,
  public.community_link_presence_count('BozukBozukBozukBozukBozuk1234') as bad_count;
grant all on _lc to public;
reset role;
select public._check(77, 'davet bağlantısı: herkese açık toplulukta üye olmayan sayıyı alır (Herkes kitlesi etkin üyeler: alice+bobby+carol = 3)',
  (select pub_count from _lc) = 3, (select pub_count::text from _lc));
select public._check(78, 'davet bağlantısı: kapalı topluluk ve geçersiz jeton NULL (etkinlik sızmaz)',
  (select res_count is null and bad_count is null from _lc));
select public._check(79, 'davet bağlantısı sayısı anon''a kapalı', not has_function_privilege('anon', 'public.community_link_presence_count(text)', 'EXECUTE'));
update public.chat_group_links set revoked_at = now() where group_id = public._g('pub')::uuid;
set role authenticated;
select public._as_user(:erin);
select public._check(80, 'iptal edilmiş bağlantı NULL', public.community_link_presence_count((select t from _lkp)) is null);
reset role;

-- ============================================================================
-- 7. Etkinlikler
-- ============================================================================
insert into public.community_events (id, community_id, created_by, title, starts_at) values
  ('e0000000-0000-4000-8000-000000000001', public._g('pub')::uuid, :alice, 'Atölye', now() + interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000002', public._g('res')::uuid, :alice, 'Kapalı atölye', now() + interval '1 hour');
insert into public.community_event_rsvps (event_id, user_id, status) values
  ('e0000000-0000-4000-8000-000000000001', :bobby, 'going'),
  ('e0000000-0000-4000-8000-000000000001', :carol, 'maybe'),
  ('e0000000-0000-4000-8000-000000000001', :dave, 'going'),
  ('e0000000-0000-4000-8000-000000000001', :alice, 'not_going'),
  ('e0000000-0000-4000-8000-000000000002', :bobby, 'going');
set role authenticated;
select public._as_user(:bobby);
create temp table _e1 as select * from public.community_events_presence(array['e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002']::uuid[]);
grant all on _e1 to public;
select public._as_user(:erin);
create temp table _e2 as select * from public.community_events_presence(array['e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002']::uuid[]);
grant all on _e2 to public;
reset role;
select public._check(60, 'etkinlik: aktif katılımcı sayısı = Gidiyorum/Belki + Herkes kitlesi (bobby+carol = 2; gitmeyen alice ve dave hariç)',
  (select online_count from _e1 where event_id = 'e0000000-0000-4000-8000-000000000001') = 2);
select public._check(61, 'etkinlik: üye görebildiği çevrimiçi katılımcıları alır (bobby, carol)',
  (select jsonb_array_length(attendees) from _e1 where event_id = 'e0000000-0000-4000-8000-000000000001') = 2);
select public._check(62, 'etkinlik: herkese açık toplulukta üye olmayan sayıyı alır, kimlikleri ALMAZ',
  (select online_count = 2 and attendees = '[]'::jsonb from _e2 where event_id = 'e0000000-0000-4000-8000-000000000001'));
select public._check(63, 'etkinlik: kapalı topluluğun etkinliği üye olmayana hiç dönmez',
  not exists (select 1 from _e2 where event_id = 'e0000000-0000-4000-8000-000000000002'));

-- ============================================================================
-- 8. Telegram akıllı bildirimi
-- ============================================================================
select public._check(64, 'odak anahtarı: yol + id, hl/hash/sondaki / atılır',
  public._presence_focus_key('/prompts/local?id=abc&hl=comment:x') = '/prompts/local?id=abc'
  and public._presence_focus_key('/prompts/local/?hl=comment:x&id=abc#top') = '/prompts/local?id=abc'
  and public._presence_focus_key('/notifications') = '/notifications'
  and public._presence_focus_key('') is null and public._presence_focus_key(null) is null);

insert into public.telegram_links (id, user_id, telegram_user_id, chat_id, notify_activity, last_notified_at)
  values ('f0000000-0000-4000-8000-000000000001', :alice, 5001, 5001, true, now() - interval '1 hour');
set role authenticated;
select public._as_user(:bobby);
select public._check(65, 'Telegram bağlantısı olmayan için odak yazılmaz (false)', public.presence_set_focus('/prompts/local?id=p1') = false);
select public._as_user(:alice);
select public._check(66, 'bağlantısı olan için odak yazılır (true)', public.presence_set_focus('/prompts/local?id=p1') = true);
reset role;
select public._check(67, 'başkalarının odak kaydı yok', (select focus_key is null from public.presence_state where user_id = :bobby));
update public.presence_state set focus_since = now() - interval '10 seconds' where user_id = :alice;

insert into public.notifications (id, recipient_id, actor_id, type, message, target_href) values
  ('d0000000-0000-4000-8000-000000000001', :alice, :bobby, 'comment', 'yorum (açık sayfa)', '/prompts/local?id=p1&hl=comment:c1'),
  ('d0000000-0000-4000-8000-000000000002', :alice, :bobby, 'comment', 'yorum (başka sayfa)', '/prompts/local?id=p2&hl=comment:c2');
select public._check(68, 'kişi o sayfayı açık tutuyorsa bildirim Telegram''a bastırılır, sitede yine yazılır',
  (select push_suppressed from public.notifications where id = 'd0000000-0000-4000-8000-000000000001'));
select public._check(69, 'başka bir sayfanın bildirimi bastırılmaz', not (select push_suppressed from public.notifications where id = 'd0000000-0000-4000-8000-000000000002'));
select public._check(70, 'bekleyenler bastırılanı içermez, diğerini içerir',
  (select array_agg(id) from public._telegram_pending('f0000000-0000-4000-8000-000000000001', 20)) = array['d0000000-0000-4000-8000-000000000002']::uuid[]);
-- Süresi geçmiş odak = belirsizlik → gönderilir.
update public.presence_state set focus_until = now() - interval '1 second' where user_id = :alice;
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href) values
  ('d0000000-0000-4000-8000-000000000003', :alice, :bobby, 'comment', 'yorum (odak süresi geçti)', '/prompts/local?id=p1&hl=comment:c3');
select public._check(71, 'süresi geçmiş odakta bildirim gönderilir (güvenli varsayılan)',
  not (select push_suppressed from public.notifications where id = 'd0000000-0000-4000-8000-000000000003'));
-- Yalnız çevrimiçi olmak yetmez: son görülme taze ama odak yok.
update public.presence_state set focus_key = null, focus_since = null, focus_until = null, last_active_at = now() where user_id = :alice;
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href) values
  ('d0000000-0000-4000-8000-000000000004', :alice, :bobby, 'comment', 'yorum (yalnız çevrimiçi)', '/prompts/local?id=p1&hl=comment:c4');
select public._check(72, 'yalnız çevrimiçi olmak bildirimi engellemez',
  not (select push_suppressed from public.notifications where id = 'd0000000-0000-4000-8000-000000000004'));
-- Telegram türü olmayan bildirim hiç işaretlenmez.
set role authenticated;
select public._as_user(:alice);
select public.presence_set_focus('/prompts/local?id=p1');
reset role;
update public.presence_state set focus_since = now() - interval '10 seconds' where user_id = :alice;
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href) values
  ('d0000000-0000-4000-8000-000000000005', :alice, :bobby, 'like', 'beğendi', '/prompts/local?id=p1');
select public._check(73, 'Telegram''a gitmeyen türler (beğeni) işaretlenmez', not (select push_suppressed from public.notifications where id = 'd0000000-0000-4000-8000-000000000005'));
set role authenticated;
select public._as_user(:alice);
select public.presence_set_focus(null);
reset role;
select public._check(74, 'odak temizlenir (sekme gizlendi)', (select focus_key is null and focus_until is null from public.presence_state where user_id = :alice));
select public._check(75, 'istemci push_suppressed yazamaz (bildirim insert politikası yok)', not exists (
  select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and cmd in ('INSERT', 'ALL')));

-- ============================================================================
-- 9. Hesap silme
-- ============================================================================
select public._check(76, 'profil silinince durum satırı da silinir (ON DELETE CASCADE)', exists (
  select 1 from pg_constraint where conrelid = 'public.presence_state'::regclass and contype = 'f' and confdeltype = 'c'
    and confrelid = 'public.profiles'::regclass));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
