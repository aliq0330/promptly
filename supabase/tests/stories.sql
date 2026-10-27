-- Hikâyeler: DB/RLS/RPC/Storage testi (docs/history/198-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/stories.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(yazar) bobby(alice'i takip eder) carol(yabancı) dave(C topluluğu üyesi, takip etmez)
--               erin(alice tarafından engellenmiş) hank(site moderatörü). Ziyaretçi = boş kimlik.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:hank,'hank')) as u(id, name);
update public.profiles set role = 'moderator' where id = :hank;
-- Supabase'te storage.objects okuma/yazma yetkisi verilidir (erişimi politikalar belirler); yerel taklitte açıkça verilir.
grant select, insert, delete on storage.objects to anon, authenticated;

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
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return r; exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
-- RLS'e takılmadan (süper kullanıcı gözüyle) tek değer okur: yalnızca DOĞRULAMA içindir.
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text),
  public._val(text), public._g(text), public._set(text, text), public._q(text) to public;

-- Bir hikâye yayımlar (çağıranın kimliğiyle) ve kimliğini anahtara yazar.
create or replace function public._story(key text, payload jsonb) returns text language plpgsql as $$
declare v uuid;
begin
  v := public.create_story(payload || jsonb_build_object('client_token', coalesce(payload ->> 'client_token', gen_random_uuid()::text)));
  perform public._set(key, v::text);
  return 'ok';
exception when others then return sqlerrm;
end $$;
grant execute on function public._story(text, jsonb) to public;

-- İlişkiler: bobby → alice takip; alice erin'i engeller; alice C topluluğunu kurar (herkese açık), dave üye olur.
insert into public.follows (follower_id, following_id) values (:bobby, :alice);
insert into public.blocks (blocker_id, blocked_id) values (:alice, :erin);
set role authenticated;
select public._as_user(:alice);
select public._set('C', (public.create_community('Topluluk C', 'açıklama', 'public', null, 50, array[:dave]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id'));
select public._as_user(:dave);
select public.respond_community_invitation((select id from public.chat_group_invitations where group_id = public._g('C') and invitee_id = :dave and status = 'pending'), true, false);
reset role;
-- Yayında + herkese açık prompt ve özel prompt (bağlantı testi için)
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :carol, 'Açık prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :carol, 'Özel prompt', 'd', 'metin', 'text', 'published', 'private');
-- Yüklenmiş medya dosyaları (Storage taklidi)
insert into storage.objects (bucket_id, name, owner) values
  ('story-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg', :alice),
  ('story-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000002.jpg', :alice),
  ('story-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000003.mp4', :alice),
  ('story-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000009.jpg', :alice),
  ('story-media', '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-000000000001.jpg', :bobby);

\set base '''https://x.supabase.co/storage/v1/object/public/story-media/'''

-- ============================================================================
-- 1. Yayımlama, idempotentlik, doğrulama
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._set('TOK', gen_random_uuid()::text);
select public._check(1, 'yazar: herkese açık fotoğraf hikâyesi yayımlar',
  public._story('PUB', jsonb_build_object('client_token', public._g('TOK'), 'kind', 'image', 'media_url', :base || '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg',
    'media_mime', 'image/jpeg', 'media_width', 1080, 'media_height', 1920, 'audience', 'public',
    'layout', '{"v":1,"fit":"cover","layers":[{"id":"l1","text":"Merhaba","x":0.5,"y":0.3,"align":"center","size":"l","color":"white","bg":true}]}'::jsonb)) = 'ok');
select public._check(2, 'aynı client_token ikinci kez: yeni satır YOK, aynı kimlik döner (çift dokunma)',
  public.create_story(jsonb_build_object('client_token', public._g('TOK'), 'kind', 'text', 'audience', 'public',
    'layout', '{"v":1,"bg":"ink","layers":[{"id":"x","text":"farklı","x":0.5,"y":0.5,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb)) = public._g('PUB')
  and public._cnt($q$select count(*) from public.stories where author_id = '11111111-1111-4111-8111-111111111111'$q$) = 1);
select public._check(3, 'takipçilere özel metin hikâyesi + herkese açık prompt bağlantısı',
  public._story('FOL', jsonb_build_object('kind', 'text', 'audience', 'followers', 'linked_type', 'prompt', 'linked_id', 'a0000000-0000-4000-8000-0000000000a1',
    'layout', '{"v":1,"bg":"cobalt","link":{"x":0.5,"y":0.6},"layers":[{"id":"a","text":"Bunu deneyin","x":0.5,"y":0.2,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb)) = 'ok');
select public._check(4, 'topluluk (C) hikâyesi: yalnız üyeler',
  public._story('COM', jsonb_build_object('kind', 'text', 'audience', 'community', 'community_id', public._g('C'),
    'layout', '{"v":1,"bg":"forest","layers":[{"id":"a","text":"Topluluğa","x":0.5,"y":0.5,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb)) = 'ok');
select public._check(5, 'anket hikâyesi (herkese açık) ve soru hikâyesi (herkese açık)',
  public._story('POLL', jsonb_build_object('kind', 'text', 'audience', 'public', 'sticker_kind', 'poll', 'sticker_question', 'Hangisi?',
    'sticker_options', '["A","B","C"]'::jsonb, 'layout', '{"v":1,"bg":"berry","sticker":{"x":0.5,"y":0.5}}'::jsonb)) = 'ok'
  and public._story('QUES', jsonb_build_object('kind', 'text', 'audience', 'public', 'sticker_kind', 'question', 'sticker_question', 'Nasıl geliştirirdin?',
    'layout', '{"v":1,"bg":"sunset"}'::jsonb)) = 'ok');
select public._check(6, 'geçersiz düzen reddedilir: bilinmeyen anahtar / x>1 / hex renk / 301 karakter / boş metin hikâyesi',
  public._story('BAD1', '{"kind":"text","audience":"public","layout":{"v":1,"evil":1}}'::jsonb) like '%invalid_layout%'
  and public._story('BAD2', '{"kind":"text","audience":"public","layout":{"v":1,"layers":[{"id":"a","text":"x","x":1.5,"y":0.5,"align":"center","size":"m","color":"white","bg":false}]}}'::jsonb) like '%invalid_layout%'
  and public._story('BAD3', '{"kind":"text","audience":"public","layout":{"v":1,"layers":[{"id":"a","text":"x","x":0.5,"y":0.5,"align":"center","size":"m","color":"#ff0000","bg":false}]}}'::jsonb) like '%invalid_layout%'
  and public._story('BAD4', jsonb_build_object('kind', 'text', 'audience', 'public', 'layout', jsonb_build_object('v', 1, 'layers', jsonb_build_array(jsonb_build_object('id','a','text',repeat('x',301),'x',0.5,'y',0.5,'align','center','size','m','color','white','bg',false))))) like '%invalid_layout%'
  and public._story('BAD5', '{"kind":"text","audience":"public","layout":{"v":1,"bg":"ink"}}'::jsonb) like '%empty_story%');
select public._check(7, 'medya: başkasının klasörü invalid_media; yüklenmemiş dosya media_missing; 61 sn video video_too_long',
  public._story('BAD6', jsonb_build_object('kind','image','audience','public','media_mime','image/jpeg','media_url', :base || '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-000000000001.jpg')) like '%invalid_media%'
  and public._story('BAD7', jsonb_build_object('kind','image','audience','public','media_mime','image/jpeg','media_url', :base || '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-0000000000ff.jpg')) like '%media_missing%'
  and public._story('BAD8', jsonb_build_object('kind','video','audience','public','media_mime','video/mp4','media_duration_ms', 61000, 'media_url', :base || '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000003.mp4')) like '%video_too_long%');
select public._check(8, 'bağlantı: özel prompt bağlanamaz (varlığı sızmaz: content_not_found); anket 1 seçenekle reddedilir',
  public._story('BAD9', '{"kind":"text","audience":"public","linked_type":"prompt","linked_id":"a0000000-0000-4000-8000-0000000000a2","layout":{"v":1}}'::jsonb) like '%content_not_found%'
  and public._story('BAD10', '{"kind":"text","audience":"public","sticker_kind":"poll","sticker_question":"?","sticker_options":["tek"],"layout":{"v":1}}'::jsonb) like '%invalid_sticker%');
select public._as_user(:bobby);
select public._check(9, 'üye olmayan (bobby) C topluluğuna hikâye paylaşamaz; ziyaretçi create_story çağıramaz; istemci INSERT yapamaz',
  public._story('BAD11', jsonb_build_object('kind','text','audience','community','community_id', public._g('C'),'layout','{"v":1,"layers":[{"id":"a","text":"x","x":0.5,"y":0.5,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb)) like '%forbidden%'
  and public._try($q$insert into public.stories (author_id, kind, audience, client_token, expires_at, layout) values ('22222222-2222-4222-8222-222222222222','text','public',gen_random_uuid(), now() + interval '30 days', '{"v":1,"layers":[{"id":"a","text":"x","x":0.5,"y":0.5,"align":"center","size":"m","color":"white","bg":false}]}')$q$) <> 'ok');
reset role;
set role anon;
select public._as_user('');
select public._check(10, 'ziyaretçi: create_story yetkisi yok',
  public._try($q$select public.create_story('{"kind":"text","audience":"public","client_token":"00000000-0000-4000-8000-000000000001","layout":{"v":1}}'::jsonb)$q$) like '%permission denied%');
reset role;
select public._check(11, 'sunucu süresi: expires_at = created_at + 24 saat (istemci veremez)',
  (select bool_and(expires_at = created_at + interval '24 hours') from public.stories));

-- ============================================================================
-- 2. Görünürlük matrisi
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(12, 'yabancı (carol): herkese açığı görür, takipçi ve topluluk hikâyesini görmez',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('PUB'))) = 1
  and public._cnt(format($q$select count(*) from public.stories where id in (%L, %L)$q$, public._g('FOL'), public._g('COM'))) = 0);
select public._as_user(:bobby);
select public._check(13, 'takipçi (bobby): takipçi hikâyesini görür, topluluk hikâyesini (üye değil) görmez',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('FOL'))) = 1
  and public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('COM'))) = 0);
select public._as_user(:dave);
select public._check(14, 'topluluk üyesi (dave): topluluk hikâyesini görür, takipçi hikâyesini görmez',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('COM'))) = 1
  and public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('FOL'))) = 0);
select public._as_user(:erin);
select public._check(15, 'engellenen (erin): herkese açık hikâyeyi bile göremez; tepsi boş',
  public._cnt(format($q$select count(*) from public.stories where author_id = %L$q$, '11111111-1111-4111-8111-111111111111')) = 0
  and public._cnt($q$select count(*) from public.story_tray()$q$) = 0);
select public._as_user('');
select public._check(16, 'ziyaretçi: yalnız herkese açık hikâye; takipçi/topluluk hikâyesi yok',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('PUB'))) = 1
  and public._cnt(format($q$select count(*) from public.stories where id in (%L, %L)$q$, public._g('FOL'), public._g('COM'))) = 0);

-- ============================================================================
-- 3. Tepsi (şerit)
-- ============================================================================
select public._as_user(:bobby);
select public._check(17, 'bobby tepsisi: alice halkası var, 4 görünür hikâye (PUB, FOL, POLL, QUES), hepsi görülmemiş',
  public._cnt($q$select cardinality(story_ids) from public.story_tray() where author_id = '11111111-1111-4111-8111-111111111111'$q$) = 4
  and public._cnt($q$select unseen_count from public.story_tray() where author_id = '11111111-1111-4111-8111-111111111111'$q$) = 4);
select public._as_user(:carol);
select public._check(18, 'carol tepsisi: takip etmediği kişinin herkese açık hikâyesi şeride girmez',
  public._cnt($q$select count(*) from public.story_tray()$q$) = 0);
select public._as_user(:dave);
select public._check(19, 'dave tepsisi: yalnız topluluk hikâyesi (takip etmiyor); topluluk kapsamlı tepside de aynı',
  public._cnt($q$select cardinality(story_ids) from public.story_tray()$q$) = 1
  and public._cnt($q$select community_story_count from public.story_tray()$q$) = 1
  and public._cnt(format($q$select count(*) from public.story_tray(%L)$q$, public._g('C'))) = 1);
select public._as_user(:bobby);
select public._check(20, 'üye olmayan topluluk kapsamlı tepsiden hiçbir şey alamaz',
  public._cnt(format($q$select count(*) from public.story_tray(%L)$q$, public._g('C'))) = 0);

-- ============================================================================
-- 4. Görüntüleme
-- ============================================================================
select public._as_user(:bobby);
select public.mark_story_viewed(public._g('PUB'));
select public.mark_story_viewed(public._g('PUB'));
select public._check(21, 'aynı kişinin iki görüntülemesi: 1 benzersiz görüntüleyen, 1 görüntüleme (10 dk penceresi)',
  public._q(format($q$select viewer_count || '/' || view_count from public.stories where id = %L$q$, public._g('PUB'))) = '1/1');
select public._check(22, 'görüldü bilgisi tepsiye yansır (unseen 3)',
  public._cnt($q$select unseen_count from public.story_tray() where author_id = '11111111-1111-4111-8111-111111111111'$q$) = 3);
reset role;
update public.story_views set last_viewed_at = now() - interval '11 minutes' where story_id = public._g('PUB');
set role authenticated;
select public._as_user(:bobby);
select public.mark_story_viewed(public._g('PUB'));
select public._check(23, '10 dk sonra yeniden izleme: görüntüleme 2, benzersiz görüntüleyen hâlâ 1',
  public._q(format($q$select viewer_count || '/' || view_count from public.stories where id = %L$q$, public._g('PUB'))) = '1/2');
select public._as_user(:alice);
select public.mark_story_viewed(public._g('PUB'));
select public._check(24, 'sahibin kendi izlemesi sayılmaz; sahip story_viewers ile bobby''yi görür',
  public._q(format($q$select viewer_count from public.stories where id = %L$q$, public._g('PUB'))) = '1'
  and public._cnt(format($q$select count(*) from public.story_viewers(%L) where username = 'bobby'$q$, public._g('PUB'))) = 1);
select public._as_user(:carol);
select public.mark_story_viewed(public._g('PUB'));
select public._check(25, 'başkası görüntüleyenleri okuyamaz (RPC boş, tablo yalnız kendi satırı)',
  public._cnt(format($q$select count(*) from public.story_viewers(%L)$q$, public._g('PUB'))) = 0
  and public._cnt(format($q$select count(*) from public.story_views where story_id = %L$q$, public._g('PUB'))) = 1);
select public._check(26, 'yetkisiz görüntüleme kaydı reddedilir; istemci story_views''a yazamaz',
  public._try(format($q$select public.mark_story_viewed(%L)$q$, public._g('FOL'))) like '%story_not_found%'
  and public._try(format($q$insert into public.story_views (story_id, viewer_id) values (%L, '33333333-3333-4333-8333-333333333333')$q$, public._g('FOL'))) <> 'ok');

-- ============================================================================
-- 5. Tepkiler
-- ============================================================================
select public._as_user(:bobby);
select public.set_story_reaction(public._g('PUB'), '🔥');
select public.set_story_reaction(public._g('PUB'), '❤️');
select public._check(27, 'tepki değiştirilir: tek satır, sayaç 1, bildirim YALNIZ ilkinde',
  public._q(format($q$select reaction_count from public.stories where id = %L$q$, public._g('PUB'))) = '1'
  and public._q(format($q$select emoji from public.story_reactions where story_id = %L$q$, public._g('PUB'))) = '❤️'
  and public._q($q$select count(*) from public.notifications where type = 'story_reaction' and recipient_id = '11111111-1111-4111-8111-111111111111'$q$) = '1');
select public.set_story_reaction(public._g('PUB'), null);
select public.set_story_reaction(public._g('PUB'), '😂');
select public._check(28, 'kaldır + yeniden tepki: sayaç doğru, bildirim tekrar ETMEZ',
  public._q(format($q$select reaction_count from public.stories where id = %L$q$, public._g('PUB'))) = '1'
  and public._q($q$select count(*) from public.notifications where type = 'story_reaction'$q$) = '1');
select public._check(29, 'geçersiz emoji / yetkisiz hikâye / istemci INSERT reddedilir',
  public._try(format($q$select public.set_story_reaction(%L, 'X')$q$, public._g('PUB'))) like '%invalid_reaction%'
  and public._try(format($q$select public.set_story_reaction(%L, '🔥')$q$, public._g('COM'))) like '%story_not_found%'
  and public._try(format($q$insert into public.story_reactions (story_id, user_id, emoji) values (%L, '22222222-2222-4222-8222-222222222222', '🔥')$q$, public._g('FOL'))) <> 'ok');
select public._as_user(:alice);
select public._check(30, 'sahip kendi hikâyesine tepki veremez; tepkileri görür',
  public._try(format($q$select public.set_story_reaction(%L, '🔥')$q$, public._g('PUB'))) like '%own_story%'
  and public._cnt(format($q$select count(*) from public.story_reactions where story_id = %L$q$, public._g('PUB'))) = 1);
select public._as_user(:carol);
select public._check(31, 'başkasının tepkisi görünmez',
  public._cnt(format($q$select count(*) from public.story_reactions where story_id = %L$q$, public._g('PUB'))) = 0);

-- ============================================================================
-- 6. Anket
-- ============================================================================
select public._as_user(:carol);
select public._check(32, 'oy vermeden sonuç gizli (revealed=false)',
  public._val(format($q$select public.story_poll_results(%L) ->> 'revealed'$q$, public._g('POLL'))) = 'false');
select public.vote_story_poll(public._g('POLL'), 0);
select public._as_user(:bobby);
select public.vote_story_poll(public._g('POLL'), 0);
select public.vote_story_poll(public._g('POLL'), 2);
select public._check(33, 'oy değiştirilebilir, kişi başına tek satır; sayılar kayıtlardan: [1,0,1], benim oyum 2',
  public._val(format($q$select (public.story_poll_results(%L) -> 'counts')::text$q$, public._g('POLL'))) = '[1, 0, 1]'
  and public._val(format($q$select public.story_poll_results(%L) ->> 'my_vote'$q$, public._g('POLL'))) = '2'
  and public._q(format($q$select count(*) from public.story_poll_votes where story_id = %L$q$, public._g('POLL'))) = '2');
select public._check(34, 'geçersiz seçenek / anketi olmayan hikâye / istemci INSERT reddedilir',
  public._try(format($q$select public.vote_story_poll(%L, 3)$q$, public._g('POLL'))) like '%invalid_vote%'
  and public._try(format($q$select public.vote_story_poll(%L, 0)$q$, public._g('PUB'))) like '%invalid_vote%'
  and public._try(format($q$insert into public.story_poll_votes (story_id, voter_id, option_index) values (%L, '22222222-2222-4222-8222-222222222222', 1)$q$, public._g('POLL'))) <> 'ok');
select public._as_user(:alice);
select public._check(35, 'sahip: oy veremez, sonuçları ve kim ne verdi görür; anket bildirimi oy veren başına bir kez',
  public._try(format($q$select public.vote_story_poll(%L, 0)$q$, public._g('POLL'))) like '%own_story%'
  and public._val(format($q$select public.story_poll_results(%L) ->> 'total'$q$, public._g('POLL'))) = '2'
  and public._cnt(format($q$select count(*) from public.story_poll_votes where story_id = %L$q$, public._g('POLL'))) = 2
  and public._q($q$select count(*) from public.notifications where type = 'story_poll_vote'$q$) = '2');

-- ============================================================================
-- 7. Soru
-- ============================================================================
select public._as_user(:bobby);
select public.answer_story_question(public._g('QUES'), 'Daha çok ışık');
select public.answer_story_question(public._g('QUES'), 'Renk paleti');
select public._as_user(:carol);
select public._check(36, 'yabancı başkasının yanıtını göremez',
  public._cnt(format($q$select count(*) from public.story_question_answers where story_id = %L$q$, public._g('QUES'))) = 0);
select public._as_user(:alice);
select public._check(37, 'sahip yanıtları görür; bildirim kişi/hikâye başına 1',
  public._cnt(format($q$select count(*) from public.story_question_answers where story_id = %L$q$, public._g('QUES'))) = 2
  and public._q($q$select count(*) from public.notifications where type = 'story_question_answer'$q$) = '1');
select public._as_user(:bobby);
select public.answer_story_question(public._g('QUES'), '3');
select public.answer_story_question(public._g('QUES'), '4');
select public.answer_story_question(public._g('QUES'), '5');
select public._check(38, 'kişi başına 5 yanıt sınırı; boş yanıt reddedilir',
  public._try(format($q$select public.answer_story_question(%L, '6')$q$, public._g('QUES'))) like '%answer_limit%'
  and public._try(format($q$select public.answer_story_question(%L, '   ')$q$, public._g('POLL'))) like '%invalid_answer%');

-- ============================================================================
-- 8. Özel yanıt (mevcut mesajlaşma)
-- ============================================================================
select public._as_user(:bobby);
select public._set('REPLY', (public.reply_to_story(public._g('FOL'), 'Harika fikir!') ->> 'message_id'));
reset role;
select public._check(39, 'yanıt = birebir mesaj: story_id + is_story_reply dolu; bildirim "Hikâyene yanıt verdi"',
  (select story_id = public._g('FOL') and is_story_reply and body = 'Harika fikir!' from public.messages where id = public._g('REPLY'))
  and exists (select 1 from public.notifications where recipient_id = :alice and message like 'Hikâyene yanıt verdi: "Harika fikir!"%'));
set role authenticated;
select public._as_user(:bobby);
select public._check(40, 'istemci story_id''li mesajı doğrudan yazamaz (sahte hikâye yanıtı yok)',
  public._try(format($q$insert into public.messages (conversation_id, sender_id, body, story_id, is_story_reply) values (%L, '22222222-2222-4222-8222-222222222222', 'x', %L, true)$q$,
    public._q(format($q2$select conversation_id from public.messages where id = %L$q2$, public._g('REPLY'))), public._g('FOL'))) <> 'ok');
select public._as_user(:carol);
select public._check(41, 'göremediği hikâyeye yanıt veremez',
  public._try(format($q$select public.reply_to_story(%L, 'x')$q$, public._g('FOL'))) like '%story_not_found%');

-- ============================================================================
-- 9. Storage
-- ============================================================================
select public._as_user(:carol);
select public._check(42, 'yabancı herkese açık hikâyenin dosyasını okur; sahibin başka (hikâyesiz) dosyasını okuyamaz',
  public._cnt($q$select count(*) from storage.objects where bucket_id = 'story-media' and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg'$q$) = 1
  and public._cnt($q$select count(*) from storage.objects where bucket_id = 'story-media' and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000009.jpg'$q$) = 0);
select public._as_user(:alice);
select public._check(43, 'sahip kendi klasörünü hep okur; başkasının klasörüne yükleyemez, kendi klasörüne yükler',
  public._cnt($q$select count(*) from storage.objects where bucket_id = 'story-media' and name like '11111111-1111-4111-8111-111111111111/%'$q$) = 4
  and public._try($q$insert into storage.objects (bucket_id, name, owner) values ('story-media', '22222222-2222-4222-8222-222222222222/cccccccc-0000-4000-8000-000000000001.jpg', '11111111-1111-4111-8111-111111111111')$q$) <> 'ok'
  and public._try($q$insert into storage.objects (bucket_id, name, owner) values ('story-media', '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000002.jpg', '11111111-1111-4111-8111-111111111111')$q$) = 'ok');
select public._as_user(:alice);
select public._check(44, 'dosya adı istemci girdisinden türetilemez (../, uzantı) — yükleme reddedilir',
  public._try($q$insert into storage.objects (bucket_id, name, owner) values ('story-media', '11111111-1111-4111-8111-111111111111/../x.html', '11111111-1111-4111-8111-111111111111')$q$) <> 'ok');

-- ============================================================================
-- 10. Süre dolumu, arşiv, öne çıkanlar
-- ============================================================================
reset role;
update public.stories set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id in (public._g('PUB'), public._g('FOL'));
set role authenticated;
select public._as_user(:bobby);
select public._check(45, 'süresi dolan hikâye: takipçiye görünmez, tepside yok, dosyası okunmaz',
  public._cnt(format($q$select count(*) from public.stories where id in (%L, %L)$q$, public._g('PUB'), public._g('FOL'))) = 0
  and public._cnt($q$select cardinality(story_ids) from public.story_tray() where author_id = '11111111-1111-4111-8111-111111111111'$q$) = 2
  and public._cnt($q$select count(*) from storage.objects where bucket_id = 'story-media' and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg'$q$) = 0);
select public._check(46, 'süresi dolana tepki/yanıt verilemez (story_not_found ya da story_expired)',
  public._try(format($q$select public.set_story_reaction(%L, '🔥')$q$, public._g('FOL'))) ~ 'story_not_found|story_expired'
  and public._try(format($q$select public.reply_to_story(%L, 'geç')$q$, public._g('FOL'))) ~ 'story_not_found|story_expired');
select public._as_user(:alice);
select public._check(47, 'sahip arşivinde görür (süresi dolanlar dahil)',
  public._cnt($q$select count(*) from public.stories where author_id = '11111111-1111-4111-8111-111111111111'$q$) = 5);
select public._set('HL', public.save_story_highlight(null, 'Öne çıkan', array[public._g('PUB'), public._g('FOL')]::uuid[], public._g('FOL'))::text);
select public._as_user(:bobby);
select public._check(48, 'öne çıkana eklenen süresi dolmuş hikâyeler: takipçi ikisini de görür, dosya okunur; tepki hâlâ verilemez',
  public._cnt(format($q$select count(*) from public.stories where id in (%L, %L)$q$, public._g('PUB'), public._g('FOL'))) = 2
  and public._cnt($q$select count(*) from storage.objects where bucket_id = 'story-media' and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg'$q$) = 1
  and public._try(format($q$select public.set_story_reaction(%L, '🔥')$q$, public._g('FOL'))) like '%story_expired%');
select public._as_user(:carol);
select public._check(49, 'öne çıkan hikâyeyi AÇMAZ: yabancı yalnız herkese açık olanı görür; öne çıkan ona görünür ama tek öğeyle',
  public._cnt(format($q$select count(*) from public.stories where id in (%L, %L)$q$, public._g('PUB'), public._g('FOL'))) = 1
  and public._cnt(format($q$select count(*) from public.story_highlights where id = %L$q$, public._g('HL'))) = 1
  and public._cnt(format($q$select count(*) from public.story_highlight_items where highlight_id = %L$q$, public._g('HL'))) = 1);
select public._as_user(:erin);
select public._check(50, 'engellenen kişi öne çıkanı da göremez',
  public._cnt(format($q$select count(*) from public.story_highlights where id = %L$q$, public._g('HL'))) = 0);
select public._as_user(:bobby);
select public._check(51, 'başkasının hikâyesi öne çıkana eklenemez; istemci öne çıkan tablosuna yazamaz',
  public._try(format($q$select public.save_story_highlight(null, 'x', array[%L]::uuid[])$q$, public._g('PUB'))) like '%story_not_found%'
  and public._try($q$insert into public.story_highlights (owner_id, title) values ('22222222-2222-4222-8222-222222222222', 'x')$q$) <> 'ok');

-- ============================================================================
-- 11. Topluluk üyeliği bitince erişim biter; topluluk yönetimi kaldırır
-- ============================================================================
select public._as_user(:dave);
select public._story('DCOM', jsonb_build_object('kind', 'text', 'audience', 'community', 'community_id', public._g('C'),
  'layout', '{"v":1,"bg":"ink","layers":[{"id":"a","text":"Dave","x":0.5,"y":0.5,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb));
select public._as_user(:alice);
select public.remove_community_story(public._g('DCOM'));
select public._as_user(:dave);
select public._check(52, 'topluluk sahibi üyenin hikâyesini kaldırır: yazar "kaldırıldı" görür + sistem bildirimi',
  public._q(format($q$select moderation_status from public.stories where id = %L$q$, public._g('DCOM'))) = 'removed'
  and public._q($q$select count(*) from public.notifications where recipient_id = '44444444-4444-4444-8444-444444444444' and message like '%topluluğundaki hikâyen kaldırıldı.'$q$) = '1');
select public._check(53, 'üye, sahibin topluluk hikâyesini kaldıramaz (yetki/rütbe)',
  public._try(format($q$select public.remove_community_story(%L)$q$, public._g('COM'))) like '%forbidden%');
select public.leave_chat_group(public._g('C'));
select public._check(54, 'topluluktan ayrılınca topluluk hikâyesi artık görünmez',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('COM'))) = 0);

-- ============================================================================
-- 12. Moderasyon ve şikâyet
-- ============================================================================
select public._as_user(:carol);
select public._check(55, 'kullanıcı hikâyeyi şikâyet eder (target_type = story)',
  public._try(format($q$insert into public.reports (reporter_id, target_type, target_id, reason) values ('33333333-3333-4333-8333-333333333333', 'story', %L, 'spam')$q$, public._g('POLL'))) = 'ok');
select public._as_user(:hank);
select public._check(56, 'moderatör kuyruğunda hikâye bağlantısıyla görünür; "kaldır" hikâyeyi gizler',
  public._val($q$select target_href from public.moderation_report_queue('open') where target_type = 'story'$q$) like '/stories?id=%'
  and public._try($q$select public.moderate_report((select id from public.reports where target_type = 'story'), 'removed')$q$) = 'ok'
  and public._q(format($q$select moderation_status from public.stories where id = %L$q$, public._g('POLL'))) = 'removed');
select public._as_user(:bobby);
select public._check(57, 'kaldırılan hikâye kimseye görünmez; normal kullanıcı moderate_story çağıramaz',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('POLL'))) = 0
  and public._try(format($q$select public.moderate_story(%L, false)$q$, public._g('POLL'))) like '%forbidden%');

-- ============================================================================
-- 13. Taslaklar
-- ============================================================================
select public._as_user(:alice);
select public._check(58, 'sahip taslak yazar; başkasının klasöründeki medyayı taslağa koyamaz',
  public._try($q$insert into public.story_drafts (owner_id, payload) values ('11111111-1111-4111-8111-111111111111', '{"kind":"text"}')$q$) = 'ok'
  and public._try($q$insert into public.story_drafts (owner_id, payload, media_url) values ('11111111-1111-4111-8111-111111111111', '{}', 'https://x.supabase.co/storage/v1/object/public/story-media/22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-000000000001.jpg')$q$) <> 'ok');
select public._as_user(:bobby);
select public._check(59, 'başkasının taslağı görünmez ve başkası adına taslak yazılamaz',
  public._cnt($q$select count(*) from public.story_drafts$q$) = 0
  and public._try($q$insert into public.story_drafts (owner_id, payload) values ('11111111-1111-4111-8111-111111111111', '{}')$q$) <> 'ok');

-- ============================================================================
-- 14. Yeniden paylaşım, silme, saklama
-- ============================================================================
select public._as_user(:alice);
select public._set('RESH', public.reshare_story(public._g('PUB'), 'followers', null, gen_random_uuid())::text);
select public._as_user(:carol);
select public._check(60, 'arşivden yeniden paylaşım YENİ hikâyedir: hedef kitle yeni (takipçi), orijinal değişmez',
  public._cnt(format($q$select count(*) from public.stories where id = %L$q$, public._g('RESH'))) = 0
  and public._q(format($q$select audience || '/' || (expires_at > now())::text from public.stories where id = %L$q$, public._g('RESH'))) = 'followers/true'
  and public._q(format($q$select audience || '/' || (expires_at > now())::text from public.stories where id = %L$q$, public._g('PUB'))) = 'public/false');
select public._check(61, 'başkası hikâyeyi silemez (0 satır)',
  public._cnt(format($q$with d as (delete from public.stories where id = %L returning 1) select count(*) from d$q$, public._g('QUES'))) = 0);
reset role;
update public.profiles set story_archive_enabled = false where id = :alice;
update public.stories set created_at = now() - interval '27 hours', expires_at = now() - interval '3 hours' where id = public._g('QUES');
select public.purge_expired_stories();
select public._check(62, 'temizlik: arşiv kapalıysa süresi dolan (öne çıkanda olmayan) silinir; öne çıkandakiler kalır; yanıtları da gider',
  not exists (select 1 from public.stories where id = public._g('QUES'))
  and exists (select 1 from public.stories where id = public._g('PUB'))
  and not exists (select 1 from public.story_question_answers where story_id = public._g('QUES')));
select public._check(63, 'silinen hikâyeye yanıt mesajı kalır, "hikâyeye yanıt" bilgisi korunur',
  (select is_story_reply from public.messages where id = public._g('REPLY')));
select public._check(64, 'yetim taraması: hikâyesiz dosya yetim, kullanımda olan değil',
  exists (select 1 from public.orphan_storage_objects('0 seconds') where name like '%aaaaaaaa-0000-4000-8000-000000000009.jpg')
  and not exists (select 1 from public.orphan_storage_objects('0 seconds') where name like '%aaaaaaaa-0000-4000-8000-000000000001.jpg'));
set role authenticated;
select public._as_user(:bobby);
select public._check(65, 'istemci purge_expired_stories çağıramaz',
  public._try($q$select public.purge_expired_stories()$q$) like '%permission denied%');
reset role;

-- 66+. Görüntüleyenler sayfalı (docs/history/258-*): 130 görüntüleyen; limit/offset sayfaları eksiksiz ve tekrarsız; en çok 100; yalnız sahip.
insert into auth.users (id, email, raw_user_meta_data)
select ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'v' || i || '@test.dev', jsonb_build_object('username', 'v' || i, 'display_name', 'V' || i)
from generate_series(1, 130) i;
insert into public.story_views (story_id, viewer_id, first_viewed_at, last_viewed_at)
select public._g('PUB'), ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, now() - i * interval '1 minute', now() - i * interval '1 minute' from generate_series(1, 130) i;
set role authenticated;
select public._as_user(:alice);
select public._check(66, 'story_viewers(id, limit, offset): 50 + 50 + 32 (önceki görüntüleyenler dahil), sıralı ve tekrarsız',
  (select count(*) from public.story_viewers(public._g('PUB'), 50, 0)) = 50
  and (select count(*) from public.story_viewers(public._g('PUB'), 50, 50)) = 50
  and (select count(*) from public.story_viewers(public._g('PUB'), 50, 100)) = 32
  and (select count(distinct viewer_id) from (
        select viewer_id from public.story_viewers(public._g('PUB'), 50, 0)
        union all select viewer_id from public.story_viewers(public._g('PUB'), 50, 50)
        union all select viewer_id from public.story_viewers(public._g('PUB'), 50, 100)) x) = 132);
select public._check(67, 'story_viewers: limit en çok 100''e kırpılır; eski tek argümanlı imza çalışmaya devam eder',
  (select count(*) from public.story_viewers(public._g('PUB'), 1000, 0)) = 100
  and (select count(*) from public.story_viewers(public._g('PUB'))) = 132);
select public._as_user(:carol);
select public._check(68, 'story_viewers (sayfalı): sahibi olmayan satır almaz', (select count(*) from public.story_viewers(public._g('PUB'), 50, 0)) = 0);
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
