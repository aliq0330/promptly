-- Oda sabitleme testi (docs/history/381-*): kişisel sabit (yalnız kendi satırım), özel odanın sızmaması, sabitleme kaldırma, ziyaretçiye kapalı,
-- sabitin sessize alma/okundu durumunu bozmaması.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/room-pins.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice (sahip), bobby (üye), carol (yönetici), dave (üye değil).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave '''44444444-4444-4444-8444-444444444444'''
-- Reddedilen yazmalar değişken atamaz; boş varsayılan "reddedildi" demektir.
\set r_bob ''
\set r_dave ''
\set m_ann_bob ''
\set m_staff_bob ''
\set m_cross ''
\set m_arch ''
\set m_locked ''

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice, 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  (:bob, 'bob@test.dev', '{"username":"bobby","display_name":"Bob"}'),
  (:carol, 'carol@test.dev', '{"username":"carol","display_name":"Carol"}'),
  (:dave, 'dave@test.dev', '{"username":"dave","display_name":"Dave"}');

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
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

-- Fixture: alice topluluğu kurar; bob üye, carol yönetici (süper kullanıcıyla).
set role authenticated;
select public._as_user(:alice);
create temp table _c as select public.create_community('Odalı', 'd', 'public', null, 50, '{}'::uuid[], 'image', 'members', 'members', null, false) as j;
reset role;
insert into public._ctx select 'g', j->>'group_id' from _c;
insert into public.conversation_members (conversation_id, user_id, role) values
  ((select v::uuid from public._ctx where k = 'g'), :bob, 'member'),
  ((select v::uuid from public._ctx where k = 'g'), :carol, 'admin');

-- Özel (yalnız kadro) oda: bob göremez.
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Duyurular', null, 'megaphone', null, 'admins', 'all') as r_ann \gset
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Kadro', null, 'shield', 'Yönetim', 'members', 'staff') as r_staff \gset
insert into public._ctx values ('ann', :'r_ann'), ('staff', :'r_staff');
select id as r_general from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and is_default \gset

-- 1. Üye bir odayı (Genel dahil) kendi için sabitler; okuma yalnız kendi sabitlerini verir.
set role authenticated;
select public._as_user(:bob);
select public.set_room_pinned(:'r_ann', true);
select public.set_room_pinned(:'r_general', true);
select count(*) as bob_pins from public.my_room_pins((select v::uuid from public._ctx where k = 'g')) \gset
reset role;
select public._check(1, 'üye Genel dahil odaları sabitler ve sabitlerini okur', :bob_pins = 2, :bob_pins::text);

-- 2. Başkasının sabiti görünmez (kişisel).
set role authenticated;
select public._as_user(:carol);
select count(*) as carol_pins from public.my_room_pins((select v::uuid from public._ctx where k = 'g')) \gset
reset role;
select public._check(2, 'sabit kişiseldir: yönetici üyenin sabitini görmez', :carol_pins = 0, :carol_pins::text);

-- 3. Sabitleme kaldırılır; satır kalır, sessize alma bozulmaz.
set role authenticated;
select public._as_user(:bob);
select public.set_room_muted(:'r_ann', true);
select public.set_room_pinned(:'r_ann', false);
select count(*) as bob_pins2 from public.my_room_pins((select v::uuid from public._ctx where k = 'g')) \gset
select muted as ann_muted from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) where name = 'Duyurular' \gset
reset role;
select public._check(3, 'sabitleme kaldırılır ve sessize alma korunur', :bob_pins2 = 1 and :'ann_muted' = 't', :bob_pins2::text);

-- 4. Üye özel odayı sabitleyemez ve varlığı sızmaz.
set role authenticated;
select public._as_user(:bob);
do $$
begin
  perform public.set_room_pinned((select v::uuid from public._ctx where k = 'staff'), true);
  perform public._check(4, 'üye özel odayı sabitleyemez (room_not_found)', false);
exception when others then
  perform public._check(4, 'üye özel odayı sabitleyemez (room_not_found)', sqlerrm = 'room_not_found', sqlerrm);
end $$;
reset role;

-- 5. Yönetici özel odayı sabitleyebilir.
set role authenticated;
select public._as_user(:carol);
select public.set_room_pinned(:'r_staff', true);
select count(*) as carol_pins2 from public.my_room_pins((select v::uuid from public._ctx where k = 'g')) \gset
reset role;
select public._check(5, 'yönetici özel odayı sabitler', :carol_pins2 = 1, :carol_pins2::text);

-- 6. Üye olmayan: sabitleyemez, okuyamaz.
set role authenticated;
select public._as_user(:dave);
do $$
begin
  perform public.set_room_pinned((select v::uuid from public._ctx where k = 'ann'), true);
  perform public._check(6, 'üye olmayan sabitleyemez', false);
exception when others then
  perform public._check(6, 'üye olmayan sabitleyemez', sqlerrm = 'room_not_found', sqlerrm);
end $$;
select count(*) as dave_pins from public.my_room_pins((select v::uuid from public._ctx where k = 'g')) \gset
reset role;
select public._check(7, 'üye olmayan hiçbir sabit görmez', :dave_pins = 0, :dave_pins::text);

-- 8. Kadro rolünü kaybeden üyenin özel oda sabiti okumada görünmez (okuma yetkisi her okumada yeniden denetlenir).
update public.conversation_members set role = 'member' where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :carol;
set role authenticated;
select public._as_user(:carol);
select count(*) as carol_pins3 from public.my_room_pins((select v::uuid from public._ctx where k = 'g')) \gset
reset role;
select public._check(8, 'özel oda yetkisini yitiren üye eski sabitini görmez', :carol_pins3 = 0, :carol_pins3::text);

-- 9. Ziyaretçi (anon) iki fonksiyona da erişemez.
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false);
set role anon;
do $$
begin
  perform public.my_room_pins((select v::uuid from public._ctx where k = 'g'));
  perform public._check(9, 'anon my_room_pins çağıramaz', false);
exception when others then
  perform public._check(9, 'anon my_room_pins çağıramaz', sqlerrm like 'permission denied%', sqlerrm);
end $$;
do $$
begin
  perform public.set_room_pinned((select v::uuid from public._ctx where k = 'ann'), true);
  perform public._check(10, 'anon set_room_pinned çağıramaz', false);
exception when others then
  perform public._check(10, 'anon set_room_pinned çağıramaz', sqlerrm like 'permission denied%', sqlerrm);
end $$;
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
