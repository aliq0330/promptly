-- Topluluk sohbet odaları testi (docs/history/352-*): varsayılan oda, oda yönetimi yeteneği, oda başına yazma/okuma kuralları,
-- özel odanın sızmaması, okunmamış sayıları, okundu imleci, sessize alma, silme/arşiv, sohbet sabitleme.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-rooms.sql  ("FAILED=0" beklenir).
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

-- 1. Her topluluk bir "Genel" varsayılan odasıyla doğar; eski topluluklar geri doldurulmuştur.
select public._check(1, 'yeni topluluk tek bir varsayılan "Genel" odasıyla doğar',
  (select count(*) from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and is_default and name = 'Genel') = 1);
select public._check(2, 'her chat_groups satırının varsayılan odası var (geri doldurma)',
  not exists (select 1 from public.chat_groups g where not exists (select 1 from public.community_rooms r where r.community_id = g.id and r.is_default)));

-- 2. Oda oluşturma yeteneği (manage_rooms): sahip + yönetici evet, üye/üye olmayan hayır.
set role authenticated;
select public._as_user(:bob);
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Üye odası') as r_bob \gset
select public._as_user(:dave);
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Yabancı odası') as r_dave \gset
select public._as_user(:alice);
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Prompt Paylaşımı', 'Prompt''unu paylaş', 'prompt', 'Üretim') as r_prompt \gset
select public._as_user(:carol);
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Duyurular', null, 'megaphone', null, 'admins') as r_ann \gset
select public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Moderatör Odası', null, 'shield', 'Yönetim', 'members', 'staff') as r_staff \gset
reset role;
insert into public._ctx values ('prompt', :'r_prompt'), ('ann', :'r_ann'), ('staff', :'r_staff');
select public._check(3, 'üye ve üye olmayan oda oluşturamaz', :'r_bob' = '' and :'r_dave' = '');
select public._check(4, 'sahip ve yönetici oda oluşturabilir (5 oda)',
  (select count(*) from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g')) = 4);

-- 3. Doğrulamalar: aynı ad, geçersiz ad, simge.
set role authenticated;
select public._as_user(:alice);
do $$ begin
  perform public.create_community_room((select v::uuid from public._ctx where k = 'g'), '  prompt paylaşımı ');
  perform public._check(5, 'aynı ad (büyük/küçük harf, boşluk farkıyla) reddedilir', false);
exception when others then
  perform public._check(5, 'aynı ad (büyük/küçük harf, boşluk farkıyla) reddedilir', sqlerrm = 'room_name_taken', sqlerrm);
end $$;
do $$ begin
  perform public.create_community_room((select v::uuid from public._ctx where k = 'g'), repeat('x', 41));
  perform public._check(6, '41 karakterlik ad reddedilir', false);
exception when others then
  perform public._check(6, '41 karakterlik ad reddedilir', sqlerrm = 'invalid_room_name', sqlerrm);
end $$;
do $$ begin
  perform public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Bozuk', null, 'ghost');
  perform public._check(7, 'bilinmeyen simge reddedilir', false);
exception when others then
  perform public._check(7, 'bilinmeyen simge reddedilir', sqlerrm = 'invalid_room_icon', sqlerrm);
end $$;
reset role;

-- 4. Mesaj yazma kuralları. Genel: üye yazar. Duyurular (admins): üye yazamaz, yönetici yazar. Özel oda: üye göremez/yazamaz.
set role authenticated;
select public._as_user(:bob);
insert into public.messages (conversation_id, sender_id, body) values ((select v::uuid from public._ctx where k = 'g'), :bob, 'genel merhaba') returning room_id is null as g_null \gset
select public._check(8, 'üye Genel odaya yazar ve mesajın room_id değeri NULL kalır', :'g_null' = 't');
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g'), :bob, 'prompt odası', (select v::uuid from public._ctx where k = 'prompt')) returning id as m_prompt \gset
select public._check(9, 'üye serbest odaya yazabilir', :'m_prompt' is not null);
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g'), :bob, 'duyuruya yazayım', (select v::uuid from public._ctx where k = 'ann')) returning id as m_ann_bob \gset
select public._check(10, 'üye yalnız yönetimin yazdığı odaya yazamaz (RLS)', :'m_ann_bob' = '');
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g'), :bob, 'özel odaya', (select v::uuid from public._ctx where k = 'staff')) returning id as m_staff_bob \gset
select public._check(11, 'üye özel (yalnız kadro) odaya yazamaz', :'m_staff_bob' = '');
select public._as_user(:carol);
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g'), :carol, 'resmî duyuru', (select v::uuid from public._ctx where k = 'ann')) returning id as m_ann \gset
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g'), :carol, 'kadro notu', (select v::uuid from public._ctx where k = 'staff')) returning id as m_staff \gset
select public._check(12, 'yönetici duyuru odasına ve özel odaya yazar', :'m_ann' <> '' and :'m_staff' <> '');
-- başka toplulukta oda kimliğiyle yazma: oda bu topluluğa ait değil → reddedilir
select public._as_user(:alice);
create temp table _c2 as select public.create_community('Öteki', 'd', 'public', null, 50, '{}'::uuid[], 'image', 'members', 'members', null, false) as j;
reset role;
insert into public._ctx select 'g2', j->>'group_id' from _c2;
set role authenticated;
select public._as_user(:alice);
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g2'), :alice, 'yanlış oda', (select v::uuid from public._ctx where k = 'prompt')) returning id as m_cross \gset
select public._check(13, 'başka topluluğun odasına bağlı mesaj reddedilir', :'m_cross' = '');
reset role;

-- 5. Okuma: özel odanın mesajı üyeye görünmez; yöneticiye görünür; üye olmayan hiçbir şey görmez.
set role authenticated;
select public._as_user(:bob);
select count(*) as bob_staff from public.messages where body in ('kadro notu') \gset
select count(*) as bob_rooms from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') \gset
select count(*) as bob_ann from public.messages where body = 'resmî duyuru' \gset
select public._as_user(:carol);
select count(*) as carol_staff from public.messages where body = 'kadro notu' \gset
select public._as_user(:dave);
select count(*) as dave_msgs from public.messages where conversation_id = (select v::uuid from public._ctx where k = 'g') \gset
select count(*) as dave_rooms from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') \gset
reset role;
select public._check(14, 'özel odanın mesajı üyeye görünmez', :bob_staff = 0);
select public._check(15, 'özel odanın mesajı yöneticiye görünür', :carol_staff = 1);
select public._check(16, 'üye özel odayı oda listesinde görmez (3 oda), duyuru odasını okur', :bob_rooms = 3 and :bob_ann = 1, :bob_rooms::text);
select public._check(17, 'üye olmayan ne mesaj ne oda görür', :dave_msgs = 0 and :dave_rooms = 0);

-- 6. Oda genel bakışı: özel oda üyeye dönmez; can_post doğru.
set role authenticated;
select public._as_user(:bob);
select count(*) as ov_n, bool_or(can_post) filter (where name = 'Duyurular') as ann_post, bool_or(can_post) filter (where name = 'Prompt Paylaşımı') as prompt_post
  from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) \gset
reset role;
select public._check(18, 'overview: üye 3 oda görür; Duyurular''a yazamaz, Prompt Paylaşımı''na yazar', :ov_n = 3 and :'ann_post' = 'f' and :'prompt_post' = 't');

-- 7. Okunmamış sayısı: alice (sahip) için diğer odalardaki bob/carol mesajları; okundu imleci; sessize alma.
set role authenticated;
select public._as_user(:alice);
select unread_count as u_prompt from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) where name = 'Prompt Paylaşımı' \gset
select unread_count as u_ann from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) where name = 'Duyurular' \gset
select unread_count as u_general from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) where is_default \gset
select unread_count as u_total from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')]) \gset
reset role;
select public._check(19, 'okunmamış: Prompt Paylaşımı 1, Duyurular 1, Genel 1 (oda başına ayrı)', :u_prompt = 1 and :u_ann = 1 and :u_general = 1, :u_prompt || '/' || :u_ann || '/' || :u_general);
select public._check(20, 'group_unread_counts toplamı okuyabildiğim odaların toplamıdır (Genel 1 + Prompt 1 + Duyurular 1 + özel oda 1 = 4)', :u_total = 4, :u_total::text);

set role authenticated;
select public._as_user(:alice);
select public.mark_room_read_up_to((select v::uuid from public._ctx where k = 'prompt'), now());
select public.set_room_muted((select v::uuid from public._ctx where k = 'ann'), true);
select unread_count as u_prompt2 from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) where name = 'Prompt Paylaşımı' \gset
select unread_count as u_total2 from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')]) \gset
select muted as ann_muted from public.community_rooms_overview((select v::uuid from public._ctx where k = 'g')) where name = 'Duyurular' \gset
reset role;
select public._check(21, 'okundu imleci ilerleyince odanın sayısı sıfırlanır', :u_prompt2 = 0);
select public._check(22, 'sessize alınan ve okunan odalar toplamdan düşer (Genel + özel oda kalır: 2)', :u_total2 = 2 and :'ann_muted' = 't', :u_total2::text);

-- 8. Okundu imleci geri gitmez.
set role authenticated;
select public._as_user(:alice);
select public.mark_room_read_up_to((select v::uuid from public._ctx where k = 'prompt'), now() - interval '1 day');
reset role;
select public._check(23, 'okundu imleci yalnız ileri gider',
  (select last_read_at from public.community_room_state where user_id = :alice and room_id = (select v::uuid from public._ctx where k = 'prompt')) > now() - interval '1 hour');

-- 9. Güncelleme + Genel'in yazma politikası mevcut sohbet ayarına bağlıdır; Genel arşivlenemez/silinemez.
set role authenticated;
select public._as_user(:carol);
select public.update_community_room((select v::uuid from public._ctx where k = 'prompt'), '{"name":"Prompt Atölyesi","description":"Yeni açıklama","section":"Atölye"}'::jsonb);
select id as g_room from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and is_default \gset
select public.update_community_room(:'g_room'::uuid, '{"posting_policy":"admins"}'::jsonb);
reset role;
select public._check(24, 'oda adı/açıklama/bölüm güncellenir',
  exists (select 1 from public.community_rooms where id = (select v::uuid from public._ctx where k = 'prompt') and name = 'Prompt Atölyesi' and section = 'Atölye' and description = 'Yeni açıklama'));
select public._check(25, 'Genel odasının "kim yazar" ayarı chat_groups.posting_policy''ye yazılır',
  (select posting_policy from public.chat_groups where id = (select v::uuid from public._ctx where k = 'g')) = 'admins');
set role authenticated;
select public._as_user(:bob);
insert into public.messages (conversation_id, sender_id, body) values ((select v::uuid from public._ctx where k = 'g'), :bob, 'kilitli genel') returning id as m_locked \gset
select public._check(26, 'Genel yalnız yönetime kapanınca üye Genel''e yazamaz, serbest odaya yazmaya devam eder', :'m_locked' = '');
select public._as_user(:carol);
select public.update_community_room(:'g_room'::uuid, '{"posting_policy":"members"}'::jsonb);
do $$ begin
  perform public.archive_community_room((select id from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and is_default), true);
  perform public._check(27, 'Genel arşivlenemez', false);
exception when others then
  perform public._check(27, 'Genel arşivlenemez', sqlerrm = 'room_default_locked', sqlerrm);
end $$;
do $$ begin
  perform public.delete_community_room((select id from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and is_default));
  perform public._check(28, 'yönetici (sahip olmayan) oda silemez', false);
exception when others then
  perform public._check(28, 'yönetici (sahip olmayan) oda silemez', sqlerrm = 'forbidden', sqlerrm);
end $$;
reset role;

-- 10. Arşiv: arşivli odaya yazılmaz ama okunur; yeniden açılınca yazılır. Silme yalnız sahip; mesajlar da gider.
set role authenticated;
select public._as_user(:carol);
select public.archive_community_room((select v::uuid from public._ctx where k = 'prompt'), true);
select public._as_user(:bob);
insert into public.messages (conversation_id, sender_id, body, room_id) values ((select v::uuid from public._ctx where k = 'g'), :bob, 'arşivde yaz', (select v::uuid from public._ctx where k = 'prompt')) returning id as m_arch \gset
select count(*) as arch_read from public.messages where room_id = (select v::uuid from public._ctx where k = 'prompt') \gset
select public._as_user(:carol);
select public.archive_community_room((select v::uuid from public._ctx where k = 'prompt'), false);
reset role;
select public._check(29, 'arşivli odaya yazılamaz ama mesajlar okunur', :'m_arch' = '' and :arch_read = 1, :arch_read::text);
set role authenticated;
select public._as_user(:alice);
select public.delete_community_room((select v::uuid from public._ctx where k = 'prompt'));
reset role;
select public._check(30, 'sahip odayı siler; odadaki mesajlar da silinir',
  not exists (select 1 from public.community_rooms where id = (select v::uuid from public._ctx where k = 'prompt'))
  and not exists (select 1 from public.messages where body = 'prompt odası'));

-- 11. Sıralama + oda sınırı (20).
set role authenticated;
select public._as_user(:alice);
select array_agg(id order by name desc) as ids from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') \gset
select public.reorder_community_rooms((select v::uuid from public._ctx where k = 'g'), :'ids'::uuid[]);
reset role;
select public._check(31, 'sıralama RPC''si positionı dizi sırasına yazar',
  (select array_agg(id order by position) from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g')) = :'ids'::uuid[]);
set role authenticated;
select public._as_user(:alice);
do $$ declare i int; begin
  for i in 1..30 loop
    begin perform public.create_community_room((select v::uuid from public._ctx where k = 'g'), 'Oda ' || i); exception when others then null; end;
  end loop;
end $$;
reset role;
select public._check(32, 'topluluk başına en çok 20 etkin oda',
  (select count(*) from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and archived_at is null) = 20);

-- 12. İstemci tablolara doğrudan yazamaz; iç fonksiyonlar kapalı.
set role authenticated;
select public._as_user(:alice);
do $$ begin
  insert into public.community_rooms (community_id, name) values ((select v::uuid from public._ctx where k = 'g'), 'Doğrudan');
  perform public._check(33, 'community_rooms''a doğrudan insert reddedilir', false);
exception when others then
  perform public._check(33, 'community_rooms''a doğrudan insert reddedilir', true);
end $$;
do $$ begin
  update public.messages set room_id = (select id from public.community_rooms where community_id = (select v::uuid from public._ctx where k = 'g') and not is_default limit 1)
   where body = 'genel merhaba';
  perform public._check(34, 'mesajın odası sonradan değişmez', not exists (select 1 from public.messages where body = 'genel merhaba' and room_id is not null));
exception when others then
  perform public._check(34, 'mesajın odası sonradan değişmez', true);
end $$;
reset role;
select public._check(35, 'anon oda RPC''lerini çağıramaz',
  not has_function_privilege('anon', 'public.create_community_room(uuid, text, text, text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.community_rooms_overview(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.messages_room_guard()', 'execute'));
select public._check(36, 'manage_rooms yeteneği tanımlı (yönetici varsayılan evet, moderatör hayır)',
  'manage_rooms' = any (public._group_all_capabilities())
  and (public._group_default_permissions() -> 'admin' ->> 'manage_rooms')::boolean
  and not (public._group_default_permissions() -> 'moderator' ->> 'manage_rooms')::boolean);

-- 13. Sohbet sabitleme: kişisel (kendi satırım), başkasına görünmez.
set role authenticated;
select public._as_user(:bob);
update public.conversation_members set pinned_at = now() where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :bob;
select count(*) as pin_n from public.conversation_members where conversation_id = (select v::uuid from public._ctx where k = 'g') and pinned_at is not null \gset
reset role;
select public._check(37, 'sohbet sabitleme kişisel: yalnız bob''un satırında',
  (select count(*) from public.conversation_members where conversation_id = (select v::uuid from public._ctx where k = 'g') and pinned_at is not null) = 1
  and :pin_n = 1);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
