-- Bildirim merkezi (docs/history/326-*): gruplu kart RPC'si, sayım, erteleme, sessize alma / tür tercihi tetikleyicisi, yetkiler, yorum tepkisi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/notification-center.sql  ("FAILED=0" beklenir).
-- alice = alıcı; bobby, carol, dave = aktörler.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

\set P '''a1000000-0000-4000-8000-000000000001'''
\set C '''c1000000-0000-4000-8000-000000000001'''

-- Alice'in bildirimleri (sunucu işi olarak eklenir; BEFORE INSERT tetikleyicisi bunlar için de çalışır, tercih/sessize alma henüz yok).
-- Prompt beğenisi ×3 (aynı hedef → tek kart), yorum beğenisi ×1, takip ×2 (tek kart), yorum ×1 (kendi kartı), sistem ×1.
insert into public.notifications (recipient_id, actor_id, type, message, target_href, is_read, created_at, reaction, dedupe_key) values
  (:alice, :bobby, 'like', 'Paylaşımını beğendi: "A"', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=post:a1000000-0000-4000-8000-000000000001', false, now() - interval '50 minutes', 'love', 'prompt_like:p:b'),
  (:alice, :carol, 'like', 'Paylaşımını beğendi: "A"', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=post:a1000000-0000-4000-8000-000000000001', false, now() - interval '40 minutes', 'fire', 'prompt_like:p:c'),
  (:alice, :dave,  'like', 'Paylaşımını beğendi: "A"', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=post:a1000000-0000-4000-8000-000000000001', false, now() - interval '30 minutes', 'love', 'prompt_like:p:d'),
  (:alice, :bobby, 'like', 'Yorumunu beğendi: "x"', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=comment:c1000000-0000-4000-8000-000000000001', true, now() - interval '20 minutes', null, 'comment_like:c:b'),
  (:alice, :bobby, 'follow', 'Seni takip etmeye başladı.', '/profile/real?username=alice', false, now() - interval '10 minutes', null, 'follow:b'),
  (:alice, :carol, 'follow', 'Seni takip etmeye başladı.', '/profile/real?username=alice', false, now() - interval '5 minutes', null, 'follow:c'),
  (:alice, :dave,  'comment', 'Paylaşımına yorum yaptı: "güzel"', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=comment:c1000000-0000-4000-8000-000000000002', false, now() - interval '2 minutes', null, null),
  (:alice, null,   'system', 'Haftalık özet: 3 yorum.', '/insights', true, now() - interval '1 day', null, 'weekly:alice:1');

-- Başka alıcı (izolasyon kontrolü)
insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
values (:bobby, :carol, 'follow', 'Seni takip etmeye başladı.', '/profile/real?username=bobby', 'follow:bb');

-- === 1. Saf yardımcılar =====================================================================================================================
select public._check(1, 'href tabanı hl= parametresini atar',
  public._notification_href_base('/prompts/local?id=1&hl=post:1') = '/prompts/local?id=1'
  and public._notification_href_base('/communities/local?id=2&tab=feed') = '/communities/local?id=2&tab=feed'
  and public._notification_href_base('/x?hl=comment:3') = '/x');
select public._check(2, 'kategori eşlemesi (tür + topluluk adresi)',
  public._notification_category('like', '/prompts/local?id=1') = 'posts'
  and public._notification_category('request_response', '/requests/local?id=1') = 'requests'
  and public._notification_category('follow', '/profile/real?username=a') = 'follow'
  and public._notification_category('message', '/messages/local?id=1') = 'messages'
  and public._notification_category('like', '/communities/post/local?id=1') = 'community'
  and public._notification_category('system', '/messages/local?id=1') = 'community'
  and public._notification_category('system', '/insights') = 'system');
select public._check(3, 'tür tercihi anahtarı eşlemesi',
  public._notification_pref_key('like', '/p?id=1&hl=post:1', null) = 'reactions'
  and public._notification_pref_key('like', '/p?id=1&hl=comment:2', null) = 'comment_likes'
  and public._notification_pref_key('comment_reply', '/p', null) = 'comments'
  and public._notification_pref_key('system', '/insights', 'milestone:copies:1:100') = 'milestones'
  and public._notification_pref_key('system', '/insights', 'weekly:u:1') = 'weekly_digest'
  and public._notification_pref_key('system', '/communities/local?id=1', null) is null
  and public._notification_pref_key('message', '/messages/local?id=1', null) is null);
select public._check(4, 'grup anahtarı: sayı bildirimleri tür|adres, diğerleri satır başına',
  public._notification_group_key('like', '/a', gen_random_uuid()) = 'like|/a'
  and public._notification_group_key('comment', '/a', 'c1000000-0000-4000-8000-0000000000aa') = 'n|c1000000-0000-4000-8000-0000000000aa');

-- Keyset
create or replace function public._walk(p_limit int, p_cat text default null) returns text language plpgsql as $$
declare r record; at_ timestamptz; k text; keys text[] := '{}'; n int;
begin
  loop
    n := 0;
    for r in select * from public.notifications_grouped_page(p_limit, at_, k, p_cat) loop
      keys := keys || r.group_key; at_ := r.sort_at; k := r.group_key; n := n + 1;
    end loop;
    exit when n < p_limit;
  end loop;
  return array_to_string(keys, ',');
end $$;
grant execute on function public._walk(int, text) to public;
-- Sınır: kullanıcı başına ≤200 sessize alma
create or replace function public._mute_burst(n int) returns text language plpgsql as $$
declare i int;
begin
  for i in 1..n loop
    perform public.set_notification_mute('content', '/prompts/local?id=burst-' || i, 'b', true);
  end loop;
  return 'ok';
exception when others then return sqlerrm;
end $$;
grant execute on function public._mute_burst(int) to public;

-- === 2. Gruplu sayfa ========================================================================================================================
set role authenticated;
select public._as_user(:alice);
select count(*) as n_groups from public.notifications_grouped_page(100) \gset
select public._check(5, '8 satır → 5 kart (3 beğeni, 2 takip birleşir)', :n_groups = 5, :n_groups::text);
select * from public.notifications_grouped_page(100) where type = 'like' and target_href like '%hl=post:%' \gset g_
select public._check(6, 'beğeni kartı: 3 satır, 3 aktör, en yeni önce, tepki sayıları',
  :g_row_count = 3 and :g_unread_count = 3 and cardinality(:'g_actor_ids'::uuid[]) = 3 and (:'g_actor_ids'::uuid[])[1] = :dave::uuid
  and (:'g_reaction_counts'::jsonb) = '{"love": 2, "fire": 1}'::jsonb, :'g_actor_ids');
select public._check(7, 'yorum beğenisi ayrı kart (hl=comment)',
  (select count(*) from public.notifications_grouped_page(100) where type = 'like') = 2);
select public._check(8, 'yorum gruplanmaz (kendi kartı)',
  (select row_count from public.notifications_grouped_page(100) where type = 'comment') = 1);
select public._check(9, 'sıralama: en yeni kart önce',
  (select type from public.notifications_grouped_page(100) limit 1) = 'comment'
  and (select type from public.notifications_grouped_page(100) offset 4 limit 1) = 'system');

select public._check(10, 'keyset sayfalama: 2 şer kart geziş tüm kartları tekrarsız verir',
  array_length(string_to_array(public._walk(2), ','), 1) = 5
  and public._walk(2) = public._walk(100));

select public._check(11, 'kategori süzgeci',
  (select count(*) from public.notifications_grouped_page(100, null, null, 'follow')) = 1
  and (select count(*) from public.notifications_grouped_page(100, null, null, 'posts')) = 3
  and (select count(*) from public.notifications_grouped_page(100, null, null, 'system')) = 1);

-- Sayım
select public._check(12, 'zil rozeti: okunmamış satırı olan kart sayısı (beğeni, takip, yorum = 3)',
  public.notifications_unread_group_count() = 3);
select public._check(13, 'kategori sayıları',
  (select n from public.notifications_unread_by_category() where category = 'posts') = 2
  and (select n from public.notifications_unread_by_category() where category = 'follow') = 1);

-- === 3. Okundu / sil ======================================================================================================================
select group_key as like_key from (select group_key from public.notifications_grouped_page(100) where type = 'like' and target_href like '%hl=post:%') x \gset
select public.notifications_group_mark_read(:'like_key') as r14 \gset
select public._check(14, 'kart okundu: 3 satır, sayaç düşer', :r14 = 3 and public.notifications_unread_group_count() = 2);
select public._check(15, 'yalnız okunmamış süzgeci okunmuş kartı gizler',
  (select count(*) from public.notifications_grouped_page(100, null, null, null, true)) = 2);
select public.notifications_group_mark_unread(:'like_key') as r16 \gset
select public._check(16, 'okunmadı işaretle', :r16 = 3 and public.notifications_unread_group_count() = 3);

-- Başka kullanıcı alice'in kartına dokunamaz / göremez
select public._as_user(:bobby);
select public._check(17, 'başkası: kart görmez, okundu/sil/ertele 0 satır',
  (select count(*) from public.notifications_grouped_page(100) where type = 'like') = 0
  and public.notifications_group_mark_read(:'like_key') = 0 and public.notifications_group_delete(:'like_key') = 0
  and public.notifications_group_snooze(:'like_key', now() + interval '1 hour') = 0);
select public._as_user(:alice);
select public._check(18, 'bozuk anahtar hiçbir satıra denk gelmez',
  public.notifications_group_delete('comment|/x') = 0 and public.notifications_group_delete('') = 0 and public.notifications_group_delete(null) = 0);

-- === 4. Erteleme ===========================================================================================================================
select public._check(19, 'erteleme: geçmiş/60 günden uzak süre reddedilir',
  public._try(format($q$select public.notifications_group_snooze(%L, now() - interval '1 minute')$q$, :'like_key')) ilike '%snooze_invalid%'
  and public._try(format($q$select public.notifications_group_snooze(%L, now() + interval '61 days')$q$, :'like_key')) ilike '%snooze_invalid%');
select public.notifications_group_mark_read(:'like_key');
select public.notifications_group_snooze(:'like_key', now() + interval '2 hours') as r20 \gset
select public._check(20, 'ertelenen kart listeden ve sayımdan çıkar, ertelenenlerde görünür',
  :r20 = 3
  and (select count(*) from public.notifications_grouped_page(100)) = 4
  and public.notifications_unread_group_count() = 2
  and (select count(*) from public.notifications_grouped_page(100, null, null, null, false, true)) = 1
  and (select snoozed_groups from public.notifications_snooze_summary()) = 1
  and (select next_wake from public.notifications_snooze_summary()) > now());
select public.notifications_group_unsnooze(:'like_key') as r21 \gset
select public._check(21, 'ertelemeyi kaldır: kart geri gelir',
  :r21 = 3 and (select count(*) from public.notifications_grouped_page(100)) = 5);
-- Süresi dolan erteleme: okunmamış olarak ve erteleme anıyla en üste döner (süre sonu geçmişe çekilir: sunucu işi).
reset role;
select public.notifications_group_snooze(:'like_key', now() + interval '1 hour') is null as _ \gset
update public.notifications set snoozed_until = now() - interval '1 minute' where snoozed_until is not null;
set role authenticated;
select public._as_user(:alice);
select public._check(22, 'süresi dolan erteleme: okunmamış + en üstte',
  (select group_key from public.notifications_grouped_page(100) limit 1) = :'like_key'
  and (select unread_count from public.notifications_grouped_page(100) where group_key = :'like_key') = 3
  and public.notifications_unread_group_count() = 3);
reset role;
update public.notifications set snoozed_until = null;
set role authenticated;
select public._as_user(:alice);

select public.notifications_group_delete(:'like_key') as r23 \gset
select public._check(23, 'kart sil: yalnız o kartın 3 satırı gider, başka kart ve başka alıcı kalır',
  :r23 = 3 and (select count(*) from public.notifications_grouped_page(100)) = 4);
reset role;
select public._check(24, 'başka alıcının bildirimi dokunulmadı', (select count(*) from public.notifications where recipient_id = :bobby) = 1);

-- === 5. Sessize alma + tür tercihi (ekleme anı tetikleyicisi) ==================================================================================
set role authenticated;
select public._as_user(:alice);
select public.set_notification_mute('actor', :carol, 'Carol', true);
select public._check(25, 'aktör sessize alma: kaydı yazar, geçersiz tür/kendini reddeder',
  (select count(*) from public.notification_mutes where kind = 'actor' and target = :carol) = 1
  and public._try(format($q$select public.set_notification_mute('actor', %L, 'x', true)$q$, :alice)) ilike '%mute_invalid%'
  and public._try($q$select public.set_notification_mute('nonsense', 'x', 'x', true)$q$) ilike '%mute_invalid%'
  and public._try($q$select public.set_notification_mute('actor', 'not-a-uuid', 'x', true)$q$) ilike '%mute_invalid%');
reset role;
insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
values (:alice, :carol, 'comment', 'Carol yorum', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=comment:c1000000-0000-4000-8000-000000000009', null),
       (:alice, :dave,  'comment', 'Dave yorum',  '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=comment:c1000000-0000-4000-8000-00000000000a', null);
select public._check(26, 'sessize alınan aktörün bildirimi hiç yazılmaz, diğeri yazılır',
  (select count(*) from public.notifications where recipient_id = :alice and message = 'Carol yorum') = 0
  and (select count(*) from public.notifications where recipient_id = :alice and message = 'Dave yorum') = 1);

set role authenticated;
select public._as_user(:alice);
select public.set_notification_mute('content', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=post:x', 'A promptu', true);
select public._check(27, 'içerik sessize alma tabanı hl= olmadan saklar',
  (select target from public.notification_mutes where kind = 'content') = '/prompts/local?id=a1000000-0000-4000-8000-000000000001');
reset role;
insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
values (:alice, :dave, 'like', 'Dave beğendi', '/prompts/local?id=a1000000-0000-4000-8000-000000000001&hl=post:a1000000-0000-4000-8000-000000000001', 'prompt_like:p:d2'),
       (:alice, :dave, 'like', 'Dave başka prompt', '/prompts/local?id=a1000000-0000-4000-8000-000000000002&hl=post:a1000000-0000-4000-8000-000000000002', 'prompt_like:p2:d');
select public._check(28, 'sessize alınan içerik (tüm hl varyantları) engellenir, başka içerik gelir',
  (select count(*) from public.notifications where recipient_id = :alice and message = 'Dave beğendi') = 0
  and (select count(*) from public.notifications where recipient_id = :alice and message = 'Dave başka prompt') = 1);

set role authenticated;
select public._as_user(:alice);
select public.set_notification_type_pref('comments', false);
select public.set_notification_type_pref('milestones', false);
reset role;
insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key) values
  (:alice, :dave, 'comment', 'Tercih kapalı yorum', '/prompts/local?id=a1000000-0000-4000-8000-000000000003&hl=comment:c1000000-0000-4000-8000-00000000000b', null),
  (:alice, :dave, 'comment_reply', 'Tercih kapalı yanıt', '/prompts/local?id=a1000000-0000-4000-8000-000000000003&hl=comment:c1000000-0000-4000-8000-00000000000c', null),
  (:alice, null, 'system', 'Kilometre taşı', '/insights/local?id=a1000000-0000-4000-8000-000000000003', 'milestone:copies:x:100'),
  (:alice, null, 'system', 'Güvenlik/topluluk', '/communities/local?id=a1000000-0000-4000-8000-0000000000cc', null),
  (:alice, :dave, 'message_request', 'Mesaj isteği', '/messages/local?id=a1000000-0000-4000-8000-0000000000dd', null),
  (:alice, :dave, 'follow', 'Takip açık', '/profile/real?username=alice', 'follow:d3');
select public._check(29, 'kapatılan tür (yorum + yanıt + kilometre taşı) yazılmaz',
  (select count(*) from public.notifications where recipient_id = :alice and message in ('Tercih kapalı yorum', 'Tercih kapalı yanıt', 'Kilometre taşı')) = 0);
select public._check(30, 'kapatılamayanlar (sistem/topluluk, mesaj isteği) ve kapatılmamış tür gelir',
  (select count(*) from public.notifications where recipient_id = :alice and message in ('Güvenlik/topluluk', 'Mesaj isteği', 'Takip açık')) = 3);

set role authenticated;
select public._as_user(:alice);
select public.set_notification_type_pref('comments', true);
select public._check(31, 'tercihi geri açmak satırı siler; geçersiz anahtar reddedilir',
  (select count(*) from public.notification_type_prefs where pref_key = 'comments') = 0
  and (select count(*) from public.notification_type_prefs where pref_key = 'milestones' and not enabled) = 1
  and public._try($q$select public.set_notification_type_pref('nonsense', false)$q$) ilike '%pref_invalid%');
select public.set_notification_mute('actor', :carol, '', false);
select public._check(32, 'sessize almayı kaldırmak satırı siler',
  (select count(*) from public.notification_mutes where kind = 'actor') = 0);

-- Sınır: kullanıcı başına ≤200 sessize alma
select public._check(33, 'sessize alma sınırı 200', public._mute_burst(205) ilike '%mute_limit%'
  and (select count(*) from public.notification_mutes) <= 200);

-- === 6. Yetkiler ==============================================================================================================================
select public._check(34, 'istemci rolü tablolara doğrudan yazamaz',
  public._try($q$insert into public.notification_mutes (user_id, kind, target) values (auth.uid(), 'content', '/x')$q$) ilike '%permission denied%'
  and public._try($q$insert into public.notification_type_prefs (user_id, pref_key, enabled) values (auth.uid(), 'comments', false)$q$) ilike '%permission denied%');
select public._as_user(:bobby);
select public._check(35, 'başkasının sessize alma / tercih satırı okunmaz',
  (select count(*) from public.notification_mutes) = 0 and (select count(*) from public.notification_type_prefs) = 0);
reset role;
set role anon;
select public._as_user('');
select public._check(36, 'anon hiçbir bildirim RPC çalıştıramaz',
  public._try('select * from public.notifications_grouped_page()') ilike '%permission denied%'
  and public._try('select public.notifications_unread_group_count()') ilike '%permission denied%'
  and public._try($q$select public.set_notification_mute('content', '/x', 'x', true)$q$) ilike '%permission denied%'
  and public._try($q$select public.notifications_group_delete('n|x')$q$) ilike '%permission denied%');
reset role;

-- === 7. 5000 satır sınırı ======================================================================================================================
insert into public.notifications (recipient_id, actor_id, type, message, target_href, created_at)
select :dave, :carol, 'comment', 'm' || g, '/prompts/local?id=bulk' || g, now() - (g || ' seconds')::interval from generate_series(1, 5010) g;
set role authenticated;
select public._as_user(:dave);
select public._check(37, 'tarama kullanıcı başına en yeni 5000 satırla sınırlı',
  array_length(string_to_array(public._walk(100), ','), 1) = 5000);
reset role;

-- === 8. Yorum tepkisi ==========================================================================================================================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a1000000-0000-4000-8000-000000000001', :alice, 'Alice prompt', 'd', 'm', 'text', 'published', 'public');
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', :alice, 'yorum');
-- 27'de alice bu promptu sessize almıştı: yorum beğenisi bildirimi için kaldır.
delete from public.notification_mutes where user_id = :alice and kind = 'content' and target like '%a1000000-0000-4000-8000-000000000001';
set role authenticated;
select public._as_user(:bobby);
insert into public.comment_likes (comment_id, user_id) values ('c1000000-0000-4000-8000-000000000001', :bobby);
select public._check(38, 'yorum beğenisi varsayılan tepki love',
  (select reaction from public.comment_likes where user_id = :bobby) = 'love');
update public.comment_likes set reaction = 'fire' where user_id = :bobby and comment_id = 'c1000000-0000-4000-8000-000000000001';
select public._check(39, 'tepki değişir, sayaç aynı kalır',
  (select reaction from public.comment_likes where user_id = :bobby) = 'fire'
  and (select like_count from public.prompt_comments where id = 'c1000000-0000-4000-8000-000000000001') = 1);
select public._check(40, 'geçersiz tepki ve başka sütun değişikliği reddedilir',
  public._try($q$update public.comment_likes set reaction = 'angry' where user_id = auth.uid()$q$) ilike '%comment_likes_reaction_check%'
  and public._try(format($q$update public.comment_likes set comment_id = %L where user_id = auth.uid()$q$, gen_random_uuid())) ilike '%like_immutable%');
select public._as_user(:carol);
with u as (update public.comment_likes set reaction = 'idea' where user_id = :bobby returning 1) select count(*) as n41 from u \gset
select public._check(41, 'başkasının tepkisi değiştirilemez', :n41 = 0);
reset role;
select public._check(42, 'yorum beğenisi bildirimi aynı satırda tepki rozeti alır',
  (select count(*) from public.notifications where recipient_id = :alice and type = 'like' and actor_id = :bobby and reaction = 'fire'
     and dedupe_key = 'comment_like:c1000000-0000-4000-8000-000000000001:' || :bobby) = 1
  or (select count(*) from public.notifications where dedupe_key like 'comment_like:c1000000-0000-4000-8000-000000000001:%' and reaction = 'fire') = 1);

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
