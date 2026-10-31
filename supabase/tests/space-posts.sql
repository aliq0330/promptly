-- Space'in tek etkileşim hattı = alıntı (docs/history/241-*; 215'in "Space = gönderi" modelinin yerini aldı): veri geçişi, create_quote eşiği,
-- sahibin tek paylaşımı, set_space_shared sarmalayıcısı, Space'e yeni beğeni/yorum kapalı, feed_page Space döndürmez, topluluk duyurusu.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-posts.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(alice'in Space'inde düzenleyici) carol(beğenen/yorumcu) dave(takipçi) erin(alice tarafından engellenmiş)
--               mod(moderatör). Ziyaretçi = boş kimlik.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set mod   '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:mod,'moder')) as u(id, name);
update public.profiles set role = 'moderator' where id = :mod;

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
-- 287: `reports` INSERT politikası yalnız `submit_report` işaretiyle yazdırır; bu dosya şikâyet TETİKLEYİCİLERİNİ (yinelenme/hız sınırı/engel) doğrudan insert ile sınar, giriş yolunu değil (o `report-reasons.sql`'de).
select set_config('promptly.submit_report', '1', false) \gset
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return coalesce(r, ''); exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return coalesce(r, ''); end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._val(text),
  public._q(text), public._g(text), public._set(text, text) to public;

\set img '''https://x.supabase.co/storage/v1/object/public/prompt-media/33333333-3333-4333-8333-333333333333/p1.jpg'''
insert into public.blocks (blocker_id, blocked_id) values (:alice, :erin);
insert into public.follows (follower_id, following_id) values (:dave, :alice);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :carol, 'Açık prompt', 'd', 'gece', 'image', 'published', 'public');
insert into public.prompt_media (prompt_id, url, width, height) values ('a0000000-0000-4000-8000-0000000000a1', :img, 800, 600);

-- alice: dolu bir Space (S: 1 görsel + 2 not, bobby düzenleyici), boş bir Space (E), herkese açık başka Space (P2).
set role authenticated;
select public._as_user(:alice);
select public._set('S', public.create_space('Neon', 'gece', 'moodboard', 'public')::text);
select public._set('E', public.create_space('Boş', '', 'free', 'public')::text);
select public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, media_url, created_by) values (%L, 'image', 'a0000000-0000-4000-8000-0000000000a1', %L, auth.uid())$q$, public._g('S'), :img));
select public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'n1', auth.uid()), (%L, 'note', 'n2', auth.uid())$q$, public._g('S'), public._g('S')));
select public._try(format($q$insert into public.space_palettes (space_id, name, colors, created_by) values (%L, 'Gece', array['#ff5fa2','#22d3c5'], auth.uid())$q$, public._g('S')));
select public._try(format($q$select public.invite_space_member(%L, 'bobby', 'editor')$q$, public._g('S')));
select public._set('C', (public.create_community('Topluluk', 'açıklama', 'public', null, 50, array[]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id'));
select public._set('CR', (public.create_community('Kapalı', 'açıklama', 'restricted', null, 50, array[]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id'));
select public._as_user(:bobby);
select public._try($q$select public.respond_space_invitation((select id from public.space_invitations limit 1), true)$q$);
reset role;


-- ============================================================================
-- 1. Veri geçişi (215 modelinden): eski "akışta paylaşılmış Space" → sahibin alıntısı
--    Eski veri, tetikleyiciler kapalıyken (replica) kurulur; sonra migration yeniden oynatılır (tekrar çalıştırılabilir olmalı).
-- ============================================================================
set session_replication_role = replica;
update public.spaces set shared_at = '2026-09-22 10:00:00+00', like_count = 1, comment_count = 2 where id = public._g('S');
insert into public.prompt_likes (space_id, user_id) values (public._g('S'), :carol);
insert into public.prompt_comments (id, space_id, author_id, body) values ('c0000000-0000-4000-8000-000000000001', public._g('S'), :carol, 'Harika palet');
insert into public.prompt_comments (id, space_id, author_id, body, parent_id) values ('c0000000-0000-4000-8000-000000000002', public._g('S'), :alice, 'Teşekkürler', 'c0000000-0000-4000-8000-000000000001');
set session_replication_role = origin;
\ir ../migrations/20260925100000_space_single_thread.sql
select public._set('Q', (select id::text from public.content_quotes where author_id = :alice and space_id = public._g('S')));
select public._check(1, 'geçiş: sahibin alıntısı eski paylaşım anıyla yaratıldı (içerik türü space)',
  public._q(format($q$select (created_at = '2026-09-22 10:00:00+00')::text || ':' || content_type from public.content_quotes where id = %L$q$, public._g('Q'))) = 'true:space');
select public._check(2, 'geçiş: beğeni ve yorumlar alıntıya taşındı (Space''te kalmadı), alıntı sayaçları doğru',
  public._q(format($q$select count(*) from public.prompt_likes where quote_id = %L$q$, public._g('Q'))) = '1'
  and public._q(format($q$select count(*) from public.prompt_comments where quote_id = %L$q$, public._g('Q'))) = '2'
  and public._q(format($q$select count(*) from public.prompt_likes where space_id = %L$q$, public._g('S'))) = '0'
  and public._q(format($q$select count(*) from public.prompt_comments where space_id = %L$q$, public._g('S'))) = '0'
  and public._q(format($q$select like_count || ':' || comment_count from public.content_quotes where id = %L$q$, public._g('Q'))) = '1:2');
select public._check(3, 'geçiş: Space''in gönderi alanları boşaldı; "N kez alıntılandı" sayacı 1',
  public._q(format($q$select (shared_at is null)::text || ':' || like_count || ':' || comment_count || ':' || quote_count from public.spaces where id = %L$q$, public._g('S'))) = 'true:0:0:1');
\ir ../migrations/20260925100000_space_single_thread.sql
select public._check(4, 'geçiş tekrar çalışınca bir şey değişmez (tek alıntı, aynı sayaçlar)',
  public._q(format($q$select count(*) from public.content_quotes where space_id = %L$q$, public._g('S'))) = '1'
  and public._q(format($q$select like_count || ':' || comment_count from public.content_quotes where id = %L$q$, public._g('Q'))) = '1:2');

-- ============================================================================
-- 2. Space'in kendi gönderisi yok: shared_at yazılamaz, beğeni/yorum kapalı, akış Space döndürmez
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(5, 'istemci shared_at yazamaz',
  public._try(format($q$update public.spaces set shared_at = now() where id = %L$q$, public._g('S'))) like '%space_invalid%');
select public._as_user(:carol);
select public._check(6, 'Space''e yeni beğeni ve yorum yazılamaz (space_engagement_closed)',
  public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S'))) like '%space_engagement_closed%'
  and public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'x')$q$, public._g('S'))) like '%space_engagement_closed%');
reset role;
set role anon;
select public._as_user('');
select public._check(7, 'ziyaretçi akışı Space türü döndürmez (13 argüman, eski 10/11 argüman, yalnız-space isteği); sahibin alıntısı quote türünde var',
  public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'space'$q$) = '0'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null) f where f.kind = 'space'$q$) = '0'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',array['space'],null,null,null,50,null,null,null,false,null,null) f$q$) = '0'
  and public._val(format($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'quote' and f.id = %L$q$, public._g('Q'))) = '1');
select public._check(8, 'space_feed_cards (alıntı kartı için) hâlâ çalışır: sayılar + ilk palet',
  public._val(format($q$select image_count || ':' || note_count || ':' || array_to_string(palette_colors, ',') from public.space_feed_cards(array[%L]::uuid[])$q$, public._g('S'))) = '1:2:#ff5fa2,#22d3c5');
reset role;

-- ============================================================================
-- 3. Alıntı kuralları (Space): eşik, sahibin tek paylaşımı, set_space_shared sarmalayıcısı
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(9, 'boş Space kimse tarafından alıntılanamaz (space_too_empty); set_space_shared da aynı eşiği ister',
  public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('E'))) like '%space_too_empty%'
  and public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('E'))) like '%space_too_empty%');
select public._as_user(:bobby);
select public._check(10, 'düzenleyici akışta paylaşamaz (yalnız sahip): set_space_shared space_forbidden',
  public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S'))) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(11, 'yabancı set_space_shared çağıramaz; ama herkese açık eşiği geçen Space''i alıntılar',
  public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S'))) like '%space_forbidden%'
  and public._try(format($q$select public.create_quote('space', %L, 'güzel')$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select quote_count from public.spaces where id = %L$q$, public._g('S'))) = '2');
select public._as_user(:alice);
select public._check(12, 'sahibi kendi Space''ini yalnız bir kez paylaşır: ikinci create_quote already_quoted; set_space_shared(true) eskisini döndürür',
  public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('S'))) like '%already_quoted%'
  and public._q(format($q$select (public.set_space_shared(%L, true) = created_at)::text from public.content_quotes where id = %L$q$, public._g('S'), public._g('Q'))) = 'true');
select public._as_user(:bobby);
select public._check(13, 'sahibin alıntısı normal alıntı gibi beğenilir/yorumlanır (quote_id), Space sayacı yok',
  public._try(format($q$insert into public.prompt_likes (quote_id, user_id) values (%L, auth.uid())$q$, public._g('Q'))) = 'ok'
  and public._q(format($q$select like_count from public.content_quotes where id = %L$q$, public._g('Q'))) = '2');
select public._as_user(:alice);
select public._check(14, 'set_space_shared(false) sahibin alıntısını (ve beğeni/yorumlarını) siler; sayaç düşer; sonra true yeniden yaratır (shared_at hep boş)',
  public._try(format($q$select public.set_space_shared(%L, false)$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select count(*) from public.content_quotes where id = %L$q$, public._g('Q'))) = '0'
  and public._q(format($q$select count(*) from public.prompt_comments where quote_id = %L$q$, public._g('Q'))) = '0'
  and public._q(format($q$select quote_count from public.spaces where id = %L$q$, public._g('S'))) = '1'
  and public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select (shared_at is null)::text from public.spaces where id = %L$q$, public._g('S'))) = 'true'
  and public._q(format($q$select count(*) from public.content_quotes where author_id = %L and space_id = %L$q$, :alice, public._g('S'))) = '1');
reset role;

-- ============================================================================
-- 4. Topluluk duyurusu (başvuru gönderisi) — değişmedi; Space'in sayaçları karışmaz
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._set('CP', public._val(format($q$select public.share_to_community(%L, 'space', %L, 'yeni palet')::text$q$, public._g('C'), public._g('S'))));
select public._check(15, 'herkese açık Space toplulukta duyurulur (başvuru)',
  public._q(format($q$select kind || ':' || content_type || ':' || (space_id = %L)::text from public.community_posts where id = %L$q$, public._g('S'), public._g('CP'))) = 'application:space:true');
select public._check(16, 'aynı Space aynı toplulukta ikinci kez duyurulamaz',
  public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('S'))) like '%already_shared%');
select public._try(format($q$update public.spaces set visibility = 'private' where id = %L$q$, public._g('E')));
select public._check(17, 'özel Space duyurulamaz: sahibe content_not_public',
  public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('E'))) like '%content_not_public%');
select public._as_user(:carol);
select public._try(format($q$select public.join_community(%L)$q$, public._g('C')));
select public._check(18, 'başkasının özel Space''i: varlığı sızmaz (content_not_found)',
  public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('E'))) like '%content_not_found%'
    or public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('E'))) like '%forbidden%');
select public._check(19, 'gönderi beğenisi gönderinin sayacına gider (bağlama özel); Space''te beğeni sayacı hiç oluşmaz',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, auth.uid())$q$, public._g('CP'))) = 'ok'
  and public._q(format($q$select like_count from public.community_posts where id = %L$q$, public._g('CP'))) = '1'
  and public._q(format($q$select like_count from public.spaces where id = %L$q$, public._g('S'))) = '0');
reset role;
select public._check(20, 'Space yalnız başvuru olabilir (yerel Space gönderisi yok)',
  public._try(format($q$insert into public.community_posts (community_id, author_id, kind, content_type, space_id) values (%L, %L, 'native', 'space', %L)$q$, public._g('CR'), :alice, public._g('S'))) like '%community_posts_space_application%');

-- ============================================================================
-- 5. Görünürlük değişimi, şikâyet, silme
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.spaces set archived_at = now() where id = %L$q$, public._g('S')));
set role anon;
select public._as_user('');
select public._check(21, 'arşivlenen Space''in alıntıları akıştan ve okumadan düşer; arşivden dönünce geri gelir',
  public._val(format($q$select count(*)::text from public.content_quotes where space_id = %L$q$, public._g('S'))) = '0');
reset role;
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.spaces set archived_at = null where id = %L$q$, public._g('S')));
set role anon;
select public._as_user('');
select public._check(22, 'arşivden dönünce alıntılar geri görünür',
  public._val(format($q$select count(*)::text from public.content_quotes where space_id = %L$q$, public._g('S'))) = '2');
reset role;
set role authenticated;
select public._as_user(:carol);
select public._try(format($q$insert into public.reports (reporter_id, target_type, target_id, reason) values (auth.uid(), 'space', %L, 'spam')$q$, public._g('S')));
select public._as_user(:mod);
select public._check(23, 'moderatör kuyruğunda Space şikâyeti başlık + adresle görünür (Space şikâyeti sürüyor)',
  public._val(format($q$select target_title || '|' || target_href from public.moderation_report_queue('open') where target_type = 'space'$q$)) = 'Neon|/spaces/local?id=' || public._g('S'));
select public._try($q$select public.moderate_report((select id from public.reports where target_type = 'space' limit 1), 'removed')$q$);
select public._check(24, 'kaldırma = özel yap (Space silinmez)',
  public._q(format($q$select visibility from public.spaces where id = %L$q$, public._g('S'))) = 'private');
select public._as_user(:dave);
select public._check(25, 'özele çekilen Space''in alıntıları yabancıya okunmaz',
  public._val(format($q$select count(*)::text from public.content_quotes where space_id = %L$q$, public._g('S'))) = '0');
select public._as_user(:alice);
select public._check(26, 'Space silinir: alıntıları, beğeni/yorumları, topluluk başvurusu ve bildirimleri temizlenir',
  public._try(format($q$delete from public.spaces where id = %L$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select count(*) from public.content_quotes where space_id = %L$q$, public._g('S'))) = '0'
  and public._q(format($q$select count(*) from public.prompt_comments where quote_id in (select id from public.content_quotes where space_id = %L)$q$, public._g('S'))) = '0'
  and public._q(format($q$select count(*) from public.community_posts where id = %L$q$, public._g('CP'))) = '0');
reset role;

select public._check(27, 'yetkiler: set_space_shared / create_quote yalnız authenticated; space_feed_cards anon dahil; iç tetikleyici kapalı',
  not has_function_privilege('anon', 'public.set_space_shared(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.set_space_shared(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.create_quote(text, uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_quote(text, uuid, text)', 'execute')
  and has_function_privilege('anon', 'public.space_feed_cards(uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_space_engagement()', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
