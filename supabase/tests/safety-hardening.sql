-- Güvenlik/sosyal mantık sertleştirmesi (docs/history/224-*): engelleme, askı, hız sınırı, rapor tekilliği, uzunluk, kendi beğenisi,
-- demo bayrağı, bildirim temizliği, tetikleyici fonksiyon yetkileri.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/safety-hardening.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(engelleyen) bobby(engellenen) carol(üçüncü kişi) dave(askıya alınacak).
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
-- 287: `reports` INSERT politikası yalnız `submit_report` işaretiyle yazdırır; bu dosya şikâyet TETİKLEYİCİLERİNİ (yinelenme/hız sınırı/engel) doğrudan insert ile sınar, giriş yolunu değil (o `report-reasons.sql`'de).
select set_config('promptly.submit_report', '1', false) \gset
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text) to public;

-- İçerik: alice ve bobby birer herkese açık prompt; carol bir prompt.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Alice prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000b1', :bobby, 'Bobby prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000c1', :carol, 'Carol prompt', 'd', 'metin', 'text', 'published', 'public');
insert into public.prompt_comments (id, prompt_id, author_id, body) values
  ('e0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000c1', :alice, 'alice yorumu'),
  ('e0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000c1', :bobby, 'bobby yorumu'),
  ('e0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000c1', :carol, 'carol yorumu');

-- ============================================================================
-- 1. Engelleme: alice → bobby
-- ============================================================================
insert into public.blocks (blocker_id, blocked_id) values (:alice, :bobby);
set role authenticated;
select public._as_user(:bobby);
select public._check(1, 'engelli (bobby): engelleyenin (alice) promptunu göremez, kendisininkini ve üçüncü kişininkini görür',
  public._cnt($q$select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 0
  and public._cnt($q$select count(*) from public.prompts where id in ('a0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000c1')$q$) = 2);
select public._check(2, 'engelli: feed_page ve search_content engelleyenin içeriğini döndürmez',
  public._cnt($q$select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null) f where f.id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 0
  and public._cnt($q$select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null) f where f.id = 'a0000000-0000-4000-8000-0000000000c1'$q$) = 1);
select public._check(3, 'engelli: engelleyenin yorumunu göremez; üçüncü kişinin yorumunu görür',
  public._cnt($q$select count(*) from public.prompt_comments where id = 'e0000000-0000-4000-8000-0000000000a1'$q$) = 0
  and public._cnt($q$select count(*) from public.prompt_comments where id = 'e0000000-0000-4000-8000-0000000000c1'$q$) = 1);
select public._check(4, 'engelli: engelleyenin promptuna yorum yazamaz / beğenemez',
  public._try($q$insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', 'taciz')$q$) <> 'ok'
  and public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222')$q$) <> 'ok');
select public._check(5, 'engelli: engelleyeni yeniden takip edemez (interaction_blocked)',
  public._try(format($q$insert into public.follows (follower_id, following_id) values (%L, %L)$q$, :bobby, :alice)) like '%interaction_blocked%');
select public._check(6, 'engelli: engelleyenin yorumuna yanıt veremez, yorumunu beğenemez (üçüncü kişinin promptunda bile)',
  public._try(format($q$insert into public.prompt_comments (prompt_id, author_id, body, parent_id) values ('a0000000-0000-4000-8000-0000000000c1', %L, 'yanıt', 'e0000000-0000-4000-8000-0000000000a1')$q$, :bobby)) like '%interaction_blocked%'
  and public._try(format($q$insert into public.comment_likes (comment_id, user_id) values ('e0000000-0000-4000-8000-0000000000a1', %L)$q$, :bobby)) like '%interaction_blocked%');
select public._as_user(:alice);
select public._check(7, 'engelleyen (alice): engellediğinin (bobby) promptunu, yorumunu görmez; onu takip edemez',
  public._cnt($q$select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000b1'$q$) = 0
  and public._cnt($q$select count(*) from public.prompt_comments where id = 'e0000000-0000-4000-8000-0000000000b1'$q$) = 0
  and public._try(format($q$insert into public.follows (follower_id, following_id) values (%L, %L)$q$, :alice, :bobby)) like '%interaction_blocked%');
select public._as_user(:carol);
select public._check(8, 'üçüncü kişi (carol): ikisinin de içeriğini ve yorumlarını görür; ikisini de takip edebilir',
  public._cnt($q$select count(*) from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000b1')$q$) = 2
  and public._cnt($q$select count(*) from public.prompt_comments where prompt_id = 'a0000000-0000-4000-8000-0000000000c1'$q$) = 3
  and public._try(format($q$insert into public.follows (follower_id, following_id) values (%L, %L)$q$, :carol, :alice)) = 'ok');
select public._as_user('');
select public._check(9, 'ziyaretçi (oturumsuz): engelden etkilenmez, içerik ve yorumları görür',
  public._cnt($q$select count(*) from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000b1')$q$) = 2
  and public._cnt($q$select count(*) from public.prompt_comments where prompt_id = 'a0000000-0000-4000-8000-0000000000c1'$q$) = 3);
reset role;
delete from public.blocks where blocker_id = :alice and blocked_id = :bobby;
set role authenticated;
select public._as_user(:bobby);
select public._check(10, 'engel kalkınca görünürlük ve etkileşim geri gelir',
  public._cnt($q$select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 1
  and public._try(format($q$insert into public.follows (follower_id, following_id) values (%L, %L)$q$, :bobby, :alice)) = 'ok');
reset role;

-- ============================================================================
-- 2. Askıya alma / paylaşım engeli
-- ============================================================================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000d1', :dave, 'Dave prompt', 'd', 'metin', 'text', 'published', 'public');
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('e0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000a1', :dave, 'dave yorumu');
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set suspended_until = now() + interval '1 day' where id = :dave;
set role authenticated;
select public._as_user(:dave);
select public._check(11, 'askıdaki kullanıcı: Space, topluluk ve alıntı oluşturamaz',
  public._try($q$select public.create_space('Askı Space')$q$) like '%askıya%'
  and public._try($q$select public.create_community('Askı topluluk', 'açıklama', 'public', null, 50, array[]::uuid[], 'general', 'members', 'members', null, false)$q$) like '%account_suspended%'
  and public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'not')$q$) like '%askıya%');
select public._check(12, 'askıdaki kullanıcı: KENDİ promptunu / yorumunu düzenleyemez',
  public._try($q$update public.prompts set title = 'değişti' where id = 'a0000000-0000-4000-8000-0000000000d1'$q$) like '%askıya%'
  and public._try($q$update public.prompt_comments set body = 'değişti' where id = 'e0000000-0000-4000-8000-0000000000d1'$q$) like '%askıya%');
select public._as_user(:carol);
select public._check(13, 'askıdaki kullanıcının içeriğine başkası etkileşebilir (sayaç güncellemesi askıya takılmaz)',
  public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000d1', '33333333-3333-4333-8333-333333333333')$q$) = 'ok');
reset role;
select public._check(14, 'sayaç güncellendi (askıdaki sahibin satırında)', (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000d1') = 1);
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set suspended_until = null, posting_blocked = true where id = :dave;
set role authenticated;
select public._as_user(:dave);
select public._check(15, 'paylaşım engelli (askıda değil): içerik oluşturamaz/düzenleyemez ama beğenebilir',
  public._try($q$select public.create_space('Engelli Space')$q$) like '%paylaşım%'
  and public._try($q$update public.prompts set title = 'değişti' where id = 'a0000000-0000-4000-8000-0000000000d1'$q$) like '%paylaşım%'
  and public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000c1', '44444444-4444-4444-8444-444444444444')$q$) = 'ok');
select public._check(16, 'paylaşım engelli: kendi promptunu silebilir (soft delete / sayaç dışı alan: deleted_at)',
  public._try($q$update public.prompts set deleted_at = now() where id = 'a0000000-0000-4000-8000-0000000000d1'$q$) = 'ok');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.profiles set posting_blocked = false where id = :dave;

-- ============================================================================
-- 3. Genel hız sınırı
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(17, 'hız sınırı: saatte 30 prompt, 31.si reddedilir',
  (select string_agg(r, ',') from (
    select public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility) values (%L, 'rl %s', 'd', 'm', 'text', 'published', 'public')$q$, :carol, i)) r
    from generate_series(1, 31) i order by i) x) like '%rate_limit' );
-- beğeni aç-kapa (satır sayarak sınırlanamayan eylem) 150. denemeden sonra durur
do $$
declare i int; last_err text := 'ok';
begin
  for i in 1..160 loop
    begin
      insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333');
      delete from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000a1' and user_id = '33333333-3333-4333-8333-333333333333';
    exception when others then last_err := sqlerrm; exit;
    end;
  end loop;
  perform set_config('app.test_like_err', last_err, false);
end $$;
select public._check(18, 'hız sınırı: beğeni aç-kapa spamı 10 dakikada 150 ile sınırlanır', current_setting('app.test_like_err') = 'rate_limit');
reset role;

-- ============================================================================
-- 4. Rapor tekilliği + günlük sınır
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public._check(19, 'rapor: ilk rapor kabul, aynı hedefe ikinci açık rapor reddedilir (report_duplicate)',
  public._try($q$insert into public.reports (reporter_id, target_type, target_id, reason) values ('22222222-2222-4222-8222-222222222222', 'prompt', 'a0000000-0000-4000-8000-0000000000c1', 'spam')$q$) = 'ok'
  and public._try($q$insert into public.reports (reporter_id, target_type, target_id, reason) values ('22222222-2222-4222-8222-222222222222', 'prompt', 'a0000000-0000-4000-8000-0000000000c1', 'yine')$q$) like '%report_duplicate%');
reset role;
update public.reports set status = 'reviewed' where reporter_id = :bobby;
set role authenticated;
select public._as_user(:bobby);
select public._check(20, 'rapor: çözüldükten sonra aynı hedef yeniden raporlanabilir',
  public._try($q$insert into public.reports (reporter_id, target_type, target_id, reason) values ('22222222-2222-4222-8222-222222222222', 'prompt', 'a0000000-0000-4000-8000-0000000000c1', 'tekrar')$q$) = 'ok');
select public._check(21, 'rapor: günde en fazla 20 rapor (rate_limit)',
  (select string_agg(r, ',') from (
    select public._try(format($q$insert into public.reports (reporter_id, target_type, target_id, reason) values (%L, 'prompt', %L, 'x')$q$, :bobby, gen_random_uuid())) r
    from generate_series(1, 20) i) x) like '%rate_limit%');
reset role;

-- ============================================================================
-- 5. Metin uzunluğu
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(22, 'uzunluk: 2000 karakter yorum kabul, 2001 reddedilir',
  public._try(format($q$insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-0000000000c1', %L, %L)$q$, :alice, repeat('a', 2000))) = 'ok'
  and public._try(format($q$insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-0000000000c1', %L, %L)$q$, :alice, repeat('a', 2001))) like '%prompt_comments_body_len%');
select public._check(23, 'uzunluk: biyografi 501 / başlık 201 / prompt metni 50001 karakter reddedilir',
  public._try(format($q$update public.profiles set bio = %L where id = %L$q$, repeat('b', 501), :alice)) like '%profiles_bio_len%'
  and public._try(format($q$update public.prompts set title = %L where id = 'a0000000-0000-4000-8000-0000000000a1'$q$, repeat('t', 201))) like '%prompts_title_len%'
  and public._try(format($q$update public.prompts set prompt_text = %L where id = 'a0000000-0000-4000-8000-0000000000a1'$q$, repeat('p', 50001))) like '%prompts_prompt_text_len%');
reset role;

-- ============================================================================
-- 6. Kendi içeriğini beğenme
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(24, 'kendi promptunu beğenemez (self_like_not_allowed); başkasınınkini beğenir',
  public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111')$q$) like '%self_like_not_allowed%'
  and public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111')$q$) = 'ok');
reset role;

-- ============================================================================
-- 7. Demo bayrağı + bildirim temizliği
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.profiles set is_demo = true where id = %L$q$, :alice));
reset role;
select public._check(25, 'istemci is_demo bayrağını açamaz', (select not is_demo from public.profiles where id = :alice));
insert into auth.users (id, email, raw_user_meta_data) values ('5eed0000-0000-4000-8000-000000000001', 'demo@test.dev', '{"username":"demo_one","display_name":"Demo"}'::jsonb);
update public.profiles set is_demo = true where id = '5eed0000-0000-4000-8000-000000000001';
select public._check(26, 'sunucu (süper kullanıcı) is_demo bayrağını yazabilir', (select is_demo from public.profiles where id = '5eed0000-0000-4000-8000-000000000001'));
insert into public.notifications (recipient_id, actor_id, type, message, target_href, is_read, created_at) values
  (:alice, :carol, 'like', 'eski okunmuş', '/', true, now() - interval '100 days'),
  (:alice, :carol, 'like', 'yeni okunmuş', '/', true, now() - interval '10 days'),
  (:alice, :carol, 'like', 'eski okunmamış', '/', false, now() - interval '100 days'),
  (:alice, :carol, 'like', 'çok eski okunmamış', '/', false, now() - interval '200 days');
select public.prune_old_notifications() as pruned \gset
select public._check(27, 'bildirim temizliği: 90 günden eski OKUNMUŞ ve 180 günden eski tüm bildirimler silinir, diğerleri kalır',
  :pruned = 2 and (select count(*) from public.notifications where message in ('yeni okunmuş', 'eski okunmamış')) = 2
  and (select count(*) from public.notifications where message in ('eski okunmuş', 'çok eski okunmamış')) = 0);

-- ============================================================================
-- 9. Fonksiyon yetkileri
-- ============================================================================
select public._check(28, 'tetikleyici fonksiyonlar anon/authenticated için çağrılamaz; yardımcılar da kapalı',
  not has_function_privilege('anon', 'public.enforce_can_post()', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_can_post()', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_rate_limit()', 'execute')
  and not has_function_privilege('authenticated', 'public._rate_limit(text, integer, interval)', 'execute')
  and not has_function_privilege('authenticated', 'public.prune_old_notifications()', 'execute')
  and not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))));
select public._check(29, 'protect_collection_follower_count search_path sabit',
  exists (select 1 from pg_proc p where p.proname = 'protect_collection_follower_count' and p.proconfig is not null and 'search_path=public' = any (p.proconfig)));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
