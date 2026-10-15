-- Sohbet arşiv / liste-silme / geçmiş-temizleme + yeni sohbet ön kontrolü: DB tarafı testi (docs/history/171-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla (docs/history/158-*, başlık için
-- saved-collections.sql'e bakın) temiz bir yerel PostgreSQL'e oynatıldıktan sonra, süper kullanıcıyla:
--   psql -d <db> -f conversation-member-state.sql
-- Sonda her kontrol PASS/FAIL yazar; "FAILED=0" beklenir. Fixture'lar kalıcıdır — ikinci çalıştırma için
-- veritabanını yeniden kurun. Kullanıcılar: alice (11..), bobby (22..), carol (33..), dave (44..).
\pset pager off
\set ON_ERROR_STOP off

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}'),
  ('44444444-4444-4444-8444-444444444444', 'dave@test.dev',  '{"username":"dave","display_name":"Dave"}');
-- carol: yalnızca takip ettiklerinden mesaj kabul eder; dave: herkesten.
update public.profiles set message_privacy = 'followers_only' where id = '33333333-3333-4333-8333-333333333333';

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

-- ---------- fixture: alice ↔ bob kabul edilmiş sohbet (gerçek RPC ile), 2 mesaj ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _conv as select public.start_direct_conversation('22222222-2222-4222-8222-222222222222') as id;
grant all on _conv to public;
insert into public.messages (id, conversation_id, sender_id, body)
  select '00000000-0000-4000-8000-000000000001', id, '11111111-1111-4111-8111-111111111111', 'alice 1' from _conv;
select public._as_user('22222222-2222-4222-8222-222222222222');
-- bob alice'i takip etmiyor → bobby'nin satırı 'pending'; kabul et ve cevap yaz.
update public.conversation_members set status = 'accepted' where user_id = '22222222-2222-4222-8222-222222222222';
insert into public.messages (id, conversation_id, sender_id, body)
  select '00000000-0000-4000-8000-000000000002', id, '22222222-2222-4222-8222-222222222222', 'bob 1' from _conv;
reset role;

select public._check(0, 'fixture: iki üyeli sohbet, iki mesaj, ikisinin de durum sütunları boş',
  (select count(*) = 2 and bool_and(archived_at is null and deleted_at is null and cleared_at is null) from public.conversation_members where conversation_id = (select id from _conv))
  and (select count(*) = 2 from public.messages where conversation_id = (select id from _conv)));

-- ---------- 1. Arşivle: yalnızca kendi satırı ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _r1 as
  with u as (update public.conversation_members set archived_at = now()
              where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111' returning 1)
  select count(*) as n from u;
-- başkasının satırını arşivlemeyi dene (RLS 0 satır etkilemeli)
create temp table _r2 as
  with u as (update public.conversation_members set archived_at = now()
              where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222' returning 1)
  select count(*) as n from u;
reset role;
select public._check(1, 'arşivle: kendi satırı güncellenir', (select n = 1 from _r1));
select public._check(2, 'arşivle: karşı tarafın satırı (RLS) güncellenemez', (select n = 0 from _r2));
select public._check(3, 'arşivle: bob satırı ve mesajlar etkilenmez',
  (select archived_at is null and deleted_at is null and cleared_at is null from public.conversation_members
    where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222')
  and (select count(*) = 2 from public.messages where conversation_id = (select id from _conv)));

-- ---------- 2. Arşivden çıkar ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.conversation_members set archived_at = null
  where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111';
reset role;
select public._check(4, 'arşivden çıkar: archived_at tekrar boş',
  (select archived_at is null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111'));

-- ---------- 3. Arşivdeki sohbete yeni mesaj gelince gelen kutusuna döner (bob'un arşivi: alice yazar) ----------
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
update public.conversation_members set archived_at = now()
  where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222';
select public._as_user('11111111-1111-4111-8111-111111111111');
insert into public.messages (id, conversation_id, sender_id, body)
  select '00000000-0000-4000-8000-000000000003', id, '11111111-1111-4111-8111-111111111111', 'alice 2' from _conv;
reset role;
select public._check(5, 'yeni mesaj: bob arşivdeyken alice yazınca bob''un arşivi kalkar',
  (select archived_at is null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222'));

-- ---------- 4. Mesajları temizle: yalnızca kendi görünümü; mesaj satırları silinmez ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.conversation_members set cleared_at = now()
  where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111';
reset role;
select public._check(6, 'temizle: alice cleared_at dolu, bob''unki boş',
  (select cleared_at is not null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111')
  and (select cleared_at is null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222'));
select public._check(7, 'temizle: ortak mesaj satırları silinmedi (3 satır)',
  (select count(*) = 3 from public.messages where conversation_id = (select id from _conv)));
select public._check(8, 'temizle: üyelik ve sohbet kaydı yerinde (2 üye)',
  (select count(*) = 2 from public.conversation_members where conversation_id = (select id from _conv)));

-- temizledikten sonra yeni mesaj hâlâ alınır ve cleared_at'ten sonra olur
select pg_sleep(0.05);
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
insert into public.messages (id, conversation_id, sender_id, body)
  select '00000000-0000-4000-8000-000000000004', id, '22222222-2222-4222-8222-222222222222', 'bob 2' from _conv;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _visible as
  select m.id from public.messages m
   where m.conversation_id = (select id from _conv)
     and m.created_at > (select cm.cleared_at from public.conversation_members cm where cm.conversation_id = m.conversation_id and cm.user_id = auth.uid());
reset role;
select public._check(9, 'temizle: yeni mesaj alınır; alice''in süzülmüş görünümünde yalnızca temizlemeden sonrası var',
  (select count(*) = 1 and bool_and(id = '00000000-0000-4000-8000-000000000004') from _visible));

-- ---------- 5. Sohbeti sil (deleted_at + cleared_at) yalnızca kendi satırı; yeni mesajla geri gelir ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.conversation_members set deleted_at = now(), cleared_at = now(), archived_at = null
  where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111';
reset role;
select public._check(10, 'sil: alice satırı silinmiş işaretli, bob''un satırı ve üyeliği duruyor',
  (select deleted_at is not null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111')
  and (select deleted_at is null and archived_at is null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222'));
select public._check(11, 'sil: mesajlar ve sohbet kaydı silinmedi', 
  (select count(*) = 4 from public.messages where conversation_id = (select id from _conv))
  and (select count(*) = 1 from public.conversations where id = (select id from _conv)));

select pg_sleep(0.05);
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
insert into public.messages (id, conversation_id, sender_id, body)
  select '00000000-0000-4000-8000-000000000005', id, '22222222-2222-4222-8222-222222222222', 'bob 3' from _conv;
reset role;
select public._check(12, 'sil: yeni mesaj gelince alice''in deleted_at''i kalkar, cleared_at korunur',
  (select deleted_at is null and cleared_at is not null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111'));

-- ---------- 6. Kullanıcı başkasının durumunu / üyeliğini silemez ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _d as
  with d as (delete from public.conversation_members
              where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222' returning 1)
  select count(*) as n from d;
reset role;
select public._check(13, 'başkasının üyelik satırı silinemez', (select n = 0 from _d));

-- ---------- 7. Üye olmayan kullanıcı sohbeti göremez / durumunu yazamaz ----------
set role authenticated;
select public._as_user('44444444-4444-4444-8444-444444444444');
create temp table _x as
  with u as (update public.conversation_members set archived_at = now() where conversation_id = (select id from _conv) returning 1)
  select count(*) as n from u;
create temp table _y as select count(*) as n from public.messages where conversation_id = (select id from _conv);
reset role;
select public._check(14, 'üye olmayan: durum yazamaz, mesaj göremez', (select n = 0 from _x) and (select n = 0 from _y));

-- ---------- 8. filter_messageable_users: gizlilik / engel / var olan sohbet ----------
-- dave alice'i takip etmiyor ama 'everyone'; carol 'followers_only' ve alice'i takip etmiyor.
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _f1 as select unnest(public.filter_messageable_users(array[
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']::uuid[])) as id;
reset role;
select public._check(15, 'filtre: kendisi ve gizlilik nedeniyle ulaşılamayan (carol) çıkar; var olan sohbet (bob) ve açık profil (dave) kalır',
  (select count(*) = 2 from _f1)
  and exists (select 1 from _f1 where id = '22222222-2222-4222-8222-222222222222')
  and exists (select 1 from _f1 where id = '44444444-4444-4444-8444-444444444444'));

-- carol alice'i takip ederse ulaşılabilir olur
insert into public.follows (follower_id, following_id) values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _f2 as select unnest(public.filter_messageable_users(array['33333333-3333-4333-8333-333333333333']::uuid[])) as id;
reset role;
select public._check(16, 'filtre: followers_only kullanıcı alice''i takip ediyorsa ulaşılabilir', (select count(*) = 1 from _f2));

-- engel (iki yönde de) ulaşılabilirliği kapatır; ayrıca start_direct_conversation + messages RLS reddeder
insert into public.blocks (blocker_id, blocked_id) values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111');
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _f3 as select unnest(public.filter_messageable_users(array['44444444-4444-4444-8444-444444444444']::uuid[])) as id;
create temp table _s as select 1 as dummy where false;
do $$ begin
  perform public.start_direct_conversation('44444444-4444-4444-8444-444444444444');
  insert into _s values (1);
exception when others then null; end $$;
reset role;
select public._check(17, 'engel: dave alice''i engellediyse filtre dave''i döndürmez ve start_direct_conversation reddeder',
  (select count(*) = 0 from _f3) and (select count(*) = 0 from _s));

-- engelli taraf için var olan sohbette de mesaj atılamaz (sunucu RLS, arayüze bırakılmamış)
insert into public.blocks (blocker_id, blocked_id) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _m as select 1 as dummy where false;
do $$ begin
  insert into public.messages (conversation_id, sender_id, body)
    select id, '11111111-1111-4111-8111-111111111111', 'engelliyken' from _conv;
  insert into _m values (1);
exception when others then null; end $$;
create temp table _f4 as select unnest(public.filter_messageable_users(array['22222222-2222-4222-8222-222222222222']::uuid[])) as id;
reset role;
select public._check(18, 'engel: bob alice''i engelledi → var olan sohbette bile mesaj reddedilir ve filtre bob''u döndürmez',
  (select count(*) = 0 from _m) and (select count(*) = 0 from _f4));
delete from public.blocks where blocker_id = '22222222-2222-4222-8222-222222222222';

-- ---------- 9. Gizlilik: carol (followers_only) takip etmediği alice'e... yeni sohbet reddedilir ----------
delete from public.follows where follower_id = '33333333-3333-4333-8333-333333333333';
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _p as select 1 as dummy where false;
do $$ begin
  perform public.start_direct_conversation('33333333-3333-4333-8333-333333333333');
  insert into _p values (1);
exception when others then null; end $$;
reset role;
select public._check(19, 'gizlilik: followers_only alıcı, göndereni takip etmiyorsa yeni sohbet sunucuda reddedilir (sohbet oluşmaz)',
  (select count(*) = 0 from _p)
  and (select count(*) = 0 from public.conversation_members where user_id = '33333333-3333-4333-8333-333333333333'));

-- ---------- 10. Mesaj isteği akışı bozulmadı: dave'e yeni sohbet → pending; reddetme = kendi üyeliğini silme ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
-- (dave artık alice'i engellemiyor)
reset role;
delete from public.blocks where blocker_id = '44444444-4444-4444-8444-444444444444';
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _dave as select public.start_direct_conversation('44444444-4444-4444-8444-444444444444') as id;
grant all on _dave to public;
reset role;
select public._check(20, 'istek: dave alice''i takip etmiyor → dave''in satırı pending, alice''inki accepted',
  (select status = 'pending' from public.conversation_members where conversation_id = (select id from _dave) and user_id = '44444444-4444-4444-8444-444444444444')
  and (select status = 'accepted' from public.conversation_members where conversation_id = (select id from _dave) and user_id = '11111111-1111-4111-8111-111111111111'));
set role authenticated;
select public._as_user('44444444-4444-4444-8444-444444444444');
update public.conversation_members set status = 'accepted' where conversation_id = (select id from _dave) and user_id = '44444444-4444-4444-8444-444444444444';
delete from public.conversation_members where conversation_id = (select id from _dave) and user_id = '44444444-4444-4444-8444-444444444444';
reset role;
select public._check(21, 'istek: kabul (update) ve reddet (kendi satırını sil) çalışır; alice''in satırı durur',
  (select count(*) = 0 from public.conversation_members where conversation_id = (select id from _dave) and user_id = '44444444-4444-4444-8444-444444444444')
  and (select count(*) = 1 from public.conversation_members where conversation_id = (select id from _dave) and user_id = '11111111-1111-4111-8111-111111111111'));

-- ---------- 11. unread_count hâlâ istemciden yazılamaz ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.conversation_members set unread_count = 99 where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111';
reset role;
select public._check(22, 'unread_count istemciden yine yazılamaz',
  (select unread_count <> 99 from public.conversation_members where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111'));

-- ---------- 12. Yeni fonksiyonların yetkileri ----------
select public._check(23, 'resurface tetikleyici fonksiyonunu authenticated çağıramaz',
  not has_function_privilege('authenticated', 'public.resurface_conversation_on_message()', 'execute'));
select public._check(24, 'filter_messageable_users: anon çağıramaz, authenticated çağırır',
  not has_function_privilege('anon', 'public.filter_messageable_users(uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.filter_messageable_users(uuid[])', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
