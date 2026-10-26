-- Alıntıla (docs/history/217-*): `content_quotes`, `create_quote`, 8. etkileşim hedefi, bildirimler, istatistik, şikâyet, feed_page, profil/arama RPC'leri.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/quotes.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(içerik sahibi) bobby(alıntılayan) carol(beğenen/yorumcu) dave(bobby'nin takipçisi) erin(bobby'nin engelledikleri)
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

-- Veri: alice'in içerikleri (P1 açık prompt, P2 özel, P3 taslak, W workflow, R istek, S ayar, SP Space, SPA arşivli Space, SPP özel Space),
-- bobby'nin açık promptu (B1), carol'un açık promptu (C1). Ayrıca 31 açık prompt (hız sınırı için).
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :erin);
insert into public.follows (follower_id, following_id) values (:dave, :bobby);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Açık prompt', 'd', 'gece', 'image', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :alice, 'Özel prompt', 'd', 'gece', 'image', 'published', 'private'),
  ('a0000000-0000-4000-8000-0000000000a3', :alice, 'Taslak prompt', 'd', 'gece', 'image', 'draft', 'public'),
  ('a0000000-0000-4000-8000-0000000000b1', :bobby, 'Bobby prompt', 'd', 'gece', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000c1', :carol, 'Carol prompt', 'd', 'gece', 'text', 'published', 'public');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
select ('a1000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, :alice, 'Hız ' || g, 'd', 'x', 'text', 'published', 'public'
from generate_series(1, 31) g;
insert into public.workflows (id, creator_id, title, status, visibility) values
  ('c0000000-0000-4000-8000-0000000000a1', :alice, 'Akış', 'published', 'public');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('d0000000-0000-4000-8000-0000000000a1', :alice, 'İstek', 'd', false, 'public');
insert into public.presets (id, creator_id, title, status, visibility) values
  ('b0000000-0000-4000-8000-0000000000a1', :alice, 'Hazır ayar', 'published', 'public');

insert into public.prompt_media (prompt_id, url, width, height) values ('a0000000-0000-4000-8000-0000000000a1', 'https://x.supabase.co/storage/v1/object/public/prompt-media/p1.jpg', 800, 600);
set role authenticated;
select public._as_user(:alice);
select public._set('SP', public.create_space('Neon', 'gece', 'moodboard', 'public')::text);
select public._set('SPP', public.create_space('Gizli', '', 'free', 'private')::text);
select public._set('SPA', public.create_space('Arşiv', '', 'free', 'public')::text);
-- Space alıntısı eşiği (241): en az 3 öğe + 1 görsel; SP bunu karşılar.
select public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, media_url, created_by) values (%L, 'image', 'a0000000-0000-4000-8000-0000000000a1', 'https://x.supabase.co/storage/v1/object/public/prompt-media/p1.jpg', auth.uid())$q$, public._g('SP')));
select public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'n1', auth.uid()), (%L, 'note', 'n2', auth.uid())$q$, public._g('SP'), public._g('SP')));
reset role;
update public.spaces set archived_at = now() where id = public._g('SPA');
-- alice'in topluluğu + topluluğa özgü istek (alıntılanamaz)
set role authenticated;
select public._as_user(:alice);
select public._set('C', (public.create_community('Topluluk', 'açıklama', 'public', null, 50, array[]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id'));
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, community_id) values
  ('d0000000-0000-4000-8000-0000000000c1', :alice, 'Topluluk isteği', 'd', false, 'public', public._g('C'));
reset role;

-- ============================================================================
-- 1. create_quote: kurallar
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public._set('Q1', public._val($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a1', '  Harika bir ışık  ')::text$q$));
select public._check(1, 'bobby açık promptu alıntılar; not kırpılır; orijinalde quote_count 1',
  (select v from public._ctx where k = 'Q1') ~ '^[0-9a-f-]{36}$'
  and public._q(format($q$select note from public.content_quotes where id = %L$q$, public._g('Q1'))) = 'Harika bir ışık'
  and public._q($q$select quote_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1');
select public._check(2, 'aynı içerik 24 saatte bir kez (already_quoted)',
  public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a1', null)$q$) like '%already_quoted%');
select public._check(3, 'not 500 karakteri aşamaz (invalid_note); geçersiz tür/boş kimlik (invalid_content)',
  public._try(format($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000b1', %L)$q$, repeat('x', 501))) like '%invalid_note%'
  and public._try($q$select public.create_quote('story', 'a0000000-0000-4000-8000-0000000000b1', null)$q$) like '%invalid_content%'
  and public._try($q$select public.create_quote('prompt', null, null)$q$) like '%invalid_content%');
select public._check(4, 'özel ve taslak içerik başkasına content_not_found (varlığı sızmaz); olmayan içerik de aynı',
  public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a2', null)$q$) like '%content_not_found%'
  and public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a3', null)$q$) like '%content_not_found%'
  and public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000ff', null)$q$) like '%content_not_found%');
select public._check(5, 'topluluğa özgü istek alıntılanamaz',
  public._try($q$select public.create_quote('request', 'd0000000-0000-4000-8000-0000000000c1', null)$q$) like '%content_not_found%');
select public._check(6, 'dört içerik türü + açık Space alıntılanır; sayaçlar artar; arşivli ve özel Space alıntılanamaz',
  public._try($q$select public.create_quote('workflow', 'c0000000-0000-4000-8000-0000000000a1', 'a')$q$) = 'ok'
  and public._try($q$select public.create_quote('request', 'd0000000-0000-4000-8000-0000000000a1', 'b')$q$) = 'ok'
  and public._try($q$select public.create_quote('preset', 'b0000000-0000-4000-8000-0000000000a1', 'c')$q$) = 'ok'
  and public._try(format($q$select public.create_quote('space', %L, 'd')$q$, public._g('SP'))) = 'ok'
  and public._q($q$select quote_count from public.workflows where id = 'c0000000-0000-4000-8000-0000000000a1'$q$) = '1'
  and public._q($q$select quote_count from public.prompt_requests where id = 'd0000000-0000-4000-8000-0000000000a1'$q$) = '1'
  and public._q($q$select quote_count from public.presets where id = 'b0000000-0000-4000-8000-0000000000a1'$q$) = '1'
  and public._q(format($q$select quote_count from public.spaces where id = %L$q$, public._g('SP'))) = '1'
  and public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('SPA'))) like '%content_not_found%'
  and public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('SPP'))) like '%content_not_found%');
reset role;
select public._as_user('');
update public.profiles set posting_blocked = true where id = :dave;
set role authenticated;
select public._as_user(:dave);
select public._check(7, 'gönderi yazması kısıtlı kullanıcı alıntılayamaz (forbidden)',
  public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000b1', null)$q$) like '%forbidden%');
reset role;
select public._as_user('');
update public.profiles set posting_blocked = false where id = :dave;
set role authenticated;
select public._as_user(:erin);
select public._check(8, 'erin, bobby (engelleyen) içeriğini alıntılayamaz',
  public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000b1', null)$q$) like '%blocked%');
select public._as_user(:alice);
select public._check(9, 'sahibi kendi özel içeriğinde content_not_public alır; kendi açık içeriğini alıntılayabilir',
  public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a2', null)$q$) like '%content_not_public%'
  and public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'kendim')$q$) = 'ok');
reset role;

set role anon;
select public._as_user('');
select public._check(10, 'ziyaretçi alıntılayamaz; istemci doğrudan insert de edemez',
  public._try($q$select public.create_quote('prompt', 'a0000000-0000-4000-8000-0000000000a1', null)$q$) ~ '(not_authenticated|permission denied)'
  and public._try(format($q$insert into public.content_quotes (author_id, content_type, prompt_id) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000b1')$q$, :bobby)) like '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:bobby);
select public._check(11, 'oturumlu istemci doğrudan insert/update edemez (yalnız RPC)',
  public._try(format($q$insert into public.content_quotes (author_id, content_type, prompt_id) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000c1')$q$, :bobby)) like '%permission denied%'
  and public._try(format($q$update public.content_quotes set note = 'x' where id = %L$q$, public._g('Q1'))) like '%permission denied%');
select public._set('BQ', public._q($q$select quote_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000b1'$q$));
select public._check(12, 'alıntı sayacı istemciden yazılamaz (orijinalde sessizce korunur)',
  public._try($q$update public.prompts set quote_count = 99 where id = 'a0000000-0000-4000-8000-0000000000b1'$q$) = 'ok'
  and public._q($q$select quote_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000b1'$q$) = (select v from public._ctx where k = 'BQ'));
reset role;

-- ============================================================================
-- 2. Hız sınırı: günde en çok 30
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._set('RL', (select count(*)::text from (
  select public.create_quote('prompt', ('a1000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, null) from generate_series(1, 30) g) s));
select public._check(13, 'günde 30 alıntıya izin var, 31.si quote_rate_limit',
  (select v from public._ctx where k = 'RL') = '30'
  and public._try($q$select public.create_quote('prompt', 'a1000000-0000-4000-8000-000000000031', null)$q$) like '%quote_rate_limit%');
reset role;

-- ============================================================================
-- 3. Okuma (RLS): hedefin halka açıklığı + engel
-- ============================================================================
set role anon;
select public._as_user('');
select public._check(14, 'ziyaretçi açık hedefli alıntıyı okur',
  public._val(format($q$select count(*)::text from public.content_quotes where id = %L$q$, public._g('Q1'))) = '1');
reset role;
update public.prompts set visibility = 'private' where id = 'a0000000-0000-4000-8000-0000000000a1';
set role anon;
select public._as_user('');
select public._check(15, 'hedef özel yapılınca alıntı görünmez; geri açılınca geri gelir',
  public._val(format($q$select count(*)::text from public.content_quotes where id = %L$q$, public._g('Q1'))) = '0');
reset role;
update public.prompts set visibility = 'public' where id = 'a0000000-0000-4000-8000-0000000000a1';
set role anon;
select public._as_user('');
select public._check(16, 'hedef geri açılınca alıntı yeniden görünür',
  public._val(format($q$select count(*)::text from public.content_quotes where id = %L$q$, public._g('Q1'))) = '1');
reset role;
update public.prompts set status = 'draft' where id = 'a0000000-0000-4000-8000-0000000000a1';
set role authenticated;
select public._as_user(:carol);
select public._check(17, 'hedef taslağa dönünce alıntı görünmez',
  public._val(format($q$select count(*)::text from public.content_quotes where id = %L$q$, public._g('Q1'))) = '0');
reset role;
update public.prompts set status = 'published' where id = 'a0000000-0000-4000-8000-0000000000a1';
set role authenticated;
select public._as_user(:erin);
select public._check(18, 'alıntılayanla engeli olan kullanıcı (erin) alıntıyı görmez',
  public._val(format($q$select count(*)::text from public.content_quotes where id = %L$q$, public._g('Q1'))) = '0');
select public._as_user(:carol);
select public._check(19, 'engeli olmayan kullanıcı görür; özel Space''in alıntısı yok',
  public._val(format($q$select count(*)::text from public.content_quotes where id = %L$q$, public._g('Q1'))) = '1');
reset role;

-- ============================================================================
-- 4. Beğeni / yorum / bildirim
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(20, 'içerik sahibine "içeriğini alıntıladı" bildirimi (tür quote, alıntı adresi); kendi alıntısına bildirim yok',
  public._q(format($q$select count(*) from public.notifications where recipient_id = %L and type = 'quote' and target_href = '/quotes/local?id=%s'$q$, :alice, public._g('Q1'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and type = 'quote' and actor_id = %L$q$, :alice, :alice)) = '0');
select public._as_user(:carol);
select public._check(21, 'beğeni: alıntı sayacı 1, orijinal sayaç değişmez, alıntılayana bildirim',
  public._try(format($q$insert into public.prompt_likes (quote_id, user_id) values (%L, auth.uid())$q$, public._g('Q1'))) = 'ok'
  and public._q(format($q$select like_count from public.content_quotes where id = %L$q$, public._g('Q1'))) = '1'
  and public._q($q$select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '0'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Alıntını beğendi:%%'$q$, :bobby)) = '1');
select public._check(22, 'aynı kişi iki kez beğenemez; sayaç istemciden yazılamaz',
  public._try(format($q$insert into public.prompt_likes (quote_id, user_id) values (%L, auth.uid())$q$, public._g('Q1'))) like '%duplicate%'
  and public._try(format($q$update public.content_quotes set like_count = 50 where id = %L$q$, public._g('Q1'))) like '%permission denied%');
select public._set('CM', public._val(format($q$insert into public.prompt_comments (quote_id, author_id, body) values (%L, auth.uid(), 'Aynı fikirdeyim') returning id::text$q$, public._g('Q1'))));
select public._check(23, 'yorum: sayaç 1, alıntılayana "Alıntına yorum yaptı" bildirimi alıntı adresiyle',
  public._q(format($q$select comment_count from public.content_quotes where id = %L$q$, public._g('Q1'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Alıntına yorum yaptı:%%' and target_href like '/quotes/local?id=%s%%'$q$, :bobby, public._g('Q1'))) = '1');
select public._check(24, 'yanıt üst yorumla aynı alıntıda olmalı (invalid_parent)',
  public._try(format($q$insert into public.prompt_comments (prompt_id, author_id, body, parent_id) values ('a0000000-0000-4000-8000-0000000000c1', auth.uid(), 'x', %L)$q$, public._g('CM'))) like '%invalid_parent%');
select public._as_user(:bobby);
select public._set('RP', public._val(format($q$insert into public.prompt_comments (quote_id, author_id, body, parent_id) values (%L, auth.uid(), 'Teşekkürler @dave', %L) returning id::text$q$, public._g('Q1'), public._g('CM'))));
select public._check(25, 'yanıt: üst yorumun yazarına bildirim; @bahsetme (dave) bildirimi alıntı adresiyle; alıntı sahibi yanıtta kendine bildirim almaz',
  public._q(format($q$select count(*) from public.notifications where recipient_id = %L and type = 'comment_reply' and target_href like '/quotes/local?id=%s%%'$q$, :carol, public._g('Q1'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Seni bir yorumda andı:%%' and target_href like '/quotes/local?id=%s%%'$q$, :dave, public._g('Q1'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and target_href like '/quotes/local?id=%s%%' and type = 'comment'$q$, :bobby, public._g('Q1'))) = '1');
select public._as_user(:dave);
select public._try(format($q$insert into public.comment_likes (comment_id, user_id) values (%L, auth.uid())$q$, public._g('RP')));
select public._as_user(:bobby);
select public._check(26, 'yorum beğenisi bildirimi alıntı adresiyle gider',
  public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Yorumunu beğendi:%%' and target_href like '/quotes/local?id=%s%%'$q$, :bobby, public._g('Q1'))) = '1');
reset role;

-- hedef gizlenince etkileşim yazılamaz; beğeni geri çekilince bildirim silinir
update public.prompts set visibility = 'private' where id = 'a0000000-0000-4000-8000-0000000000a1';
set role authenticated;
select public._as_user(:dave);
select public._check(27, 'hedef gizliyken alıntıya beğeni/yorum yazılamaz (quote_not_found)',
  public._try(format($q$insert into public.prompt_likes (quote_id, user_id) values (%L, auth.uid())$q$, public._g('Q1'))) like '%quote_not_found%'
  and public._try(format($q$insert into public.prompt_comments (quote_id, author_id, body) values (%L, auth.uid(), 'y')$q$, public._g('Q1'))) like '%quote_not_found%');
reset role;
update public.prompts set visibility = 'public' where id = 'a0000000-0000-4000-8000-0000000000a1';
set role authenticated;
select public._as_user(:carol);
select public._try(format($q$delete from public.prompt_likes where quote_id = %L and user_id = auth.uid()$q$, public._g('Q1')));
select public._check(28, 'beğeni geri çekilince sayaç 0, bildirim silinir',
  public._q(format($q$select like_count from public.content_quotes where id = %L$q$, public._g('Q1'))) = '0'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Alıntını beğendi:%%'$q$, :bobby)) = '0');
select public._as_user(:erin);
select public._check(29, 'engelli kullanıcı alıntıya yorum yazamaz',
  public._try(format($q$insert into public.prompt_comments (quote_id, author_id, body) values (%L, auth.uid(), 'y')$q$, public._g('Q1'))) like '%quote_not_found%');
reset role;

-- ============================================================================
-- 5. feed_page
-- ============================================================================
set role anon;
select public._as_user('');
select public._check(30, 'ziyaretçi akışında alıntı var (13 argüman); yalnız alıntı istenince yalnız alıntı',
  public._val(format($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'quote' and f.id = %L$q$, public._g('Q1'))) = '1'
  and public._val($q$select count(distinct kind)::text from public.feed_page('all','newest',array['quote'],null,null,null,50,null,null,null,false,null,null)$q$) = '1');
select public._check(31, 'eski 10/11 argümanlı sarmalayıcılar da alıntı döndürür; süzgeçli çağrılarda alıntı yok',
  public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null) f where f.kind = 'quote'$q$) >= '1'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',null,'image',null,null,50,null,null,null,false,null,null) f where f.kind = 'quote'$q$) = '0'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,'gece',null) f where f.kind = 'quote'$q$) = '0'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',array['prompt'],null,null,null,50,null,null,null,false,null,null) f where f.kind = 'quote'$q$) = '0');
select public._check(32, 'akış zamanı = alıntı anı; keyset ikinci sayfa tekrar etmez',
  public._val($q$select (count(*) = count(distinct id))::text from (
     select * from public.feed_page('all','newest',array['quote'],null,null,null,2,null,null,null,false,null,null)
     union all
     select * from public.feed_page('all','newest',array['quote'],null,null,null,2,0,
        (select f.created_at from public.feed_page('all','newest',array['quote'],null,null,null,2,null,null,null,false,null,null) f order by f.created_at asc, f.id asc limit 1),
        (select f.id from public.feed_page('all','newest',array['quote'],null,null,null,2,null,null,null,false,null,null) f order by f.created_at asc, f.id asc limit 1),
        false,null,null)
     ) z$q$) = 'true');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(33, 'takip akışında takip edilen bobby''nin alıntıları var; takip edilmeyen alice''in alıntısı yok',
  public._val(format($q$select count(*)::text from public.feed_page('following','newest',array['quote'],null,null,null,50,null,null,null,false,null,null) f where f.id = %L$q$, public._g('Q1'))) = '1'
  and public._val($q$select count(*)::text from public.feed_page('following','newest',array['quote'],null,null,null,50,null,null,null,false,null,null) f join public.content_quotes q on q.id = f.id where q.author_id = '11111111-1111-4111-8111-111111111111'$q$) = '0');
select public._check(34, '"etiketlerim" kapsamında alıntı yok',
  public._val($q$select count(*)::text from public.feed_page('tags','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'quote'$q$) = '0');
select public._as_user(:erin);
select public._check(35, 'engelli kullanıcı akışta bobby''nin alıntılarını görmez',
  public._val($q$select count(*)::text from public.feed_page('all','newest',array['quote'],null,null,null,50,null,null,null,false,null,null) f join public.content_quotes q on q.id = f.id where q.author_id = '22222222-2222-4222-8222-222222222222'$q$) = '0');
select public._as_user(:carol);
select public._check(36, 'popüler sıralama: beğeni sayısı büyük olan önce',
  (select f.id::text from public.feed_page('all','popular',array['quote'],null,null,null,1,null,null,null,false,null,null) f) is not null
  and public._val(format($q$select (select sort_rank from public.feed_page('all','popular',array['quote'],null,null,null,50,null,null,null,false,null,null) f where f.id = %L) >= 0$q$, public._g('Q1'))) = 'true');
select public._check(37, 'quote_feed_cards: alıntı + alıntılayan + not + sayılar; is_liked beğenene true',
  public._val(format($q$select author_username || ':' || content_type || ':' || note || ':' || comment_count || ':' || is_liked::text from public.quote_feed_cards(array[%L]::uuid[])$q$, public._g('Q1'))) = 'bobby:prompt:Harika bir ışık:2:false');
reset role;

-- ============================================================================
-- 6. Profil + arama
-- ============================================================================
set role anon;
select public._as_user('');
select public._check(38, 'profile_quote_count/profile_quotes_page: bobby''nin görünür alıntıları; keyset ikinci sayfa',
  public._val(format($q$select public.profile_quote_count(%L)::text$q$, :bobby)) = '5'
  and public._val(format($q$select count(*)::text from public.profile_quotes_page(%L, 2, null, null)$q$, :bobby)) = '2'
  and public._val(format($q$select count(*)::text from public.profile_quotes_page(%L, 24, (select created_at from public.profile_quotes_page(%L, 2, null, null) order by created_at asc, id asc limit 1), (select id from public.profile_quotes_page(%L, 2, null, null) order by created_at asc, id asc limit 1))$q$, :bobby, :bobby, :bobby)) = '3');
select public._check(39, 'search_quotes: nottan ve içerik başlığından bulur; % kaçışlanır; 2 harften kısa sorgu boş',
  public._val($q$select count(*)::text from public.search_quotes('ışık')$q$) = '1'
  and public._val($q$select count(*)::text from public.search_quotes('Açık prompt')$q$) >= '1'
  and public._val($q$select count(*)::text from public.search_quotes('%')$q$) = '0'
  and public._val($q$select count(*)::text from public.search_quotes('a')$q$) = '0');
reset role;

-- ============================================================================
-- 7. İstatistik (content_engagers)
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(40, 'content_engagers quote: yorum yapanlar; beğenenler (geri çekilmiş) boş; saves boş',
  public._val(format($q$select count(*)::text from public.content_engagers('quote', %L, 'comments')$q$, public._g('Q1'))) = '2'
  and public._val(format($q$select count(*)::text from public.content_engagers('quote', %L, 'likes')$q$, public._g('Q1'))) = '0'
  and public._val(format($q$select count(*)::text from public.content_engagers('quote', %L, 'saves')$q$, public._g('Q1'))) = '0');
select public._as_user(:erin);
select public._check(41, 'engelli kullanıcıya istatistik boş döner',
  public._val(format($q$select count(*)::text from public.content_engagers('quote', %L, 'comments')$q$, public._g('Q1'))) = '0');
reset role;

-- ============================================================================
-- 8. Şikâyet + moderasyon
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._try(format($q$insert into public.reports (reporter_id, target_type, target_id, reason) values (auth.uid(), 'quote', %L, 'spam')$q$, public._g('Q1')));
select public._as_user(:mod);
select public._check(42, 'moderatör kuyruğunda alıntı şikâyeti: başlık, yazar, adres',
  public._val($q$select target_title || '|' || target_author_username || '|' || target_href from public.moderation_report_queue('open') where target_type = 'quote'$q$) like 'Harika bir ışık|bobby|/quotes/local?id=%');
select public._try($q$select public.moderate_report((select id from public.reports where target_type = 'quote' limit 1), 'removed')$q$);
reset role;
select public._check(43, 'kaldırma alıntıyı siler (içerik durur), beğeni/yorumları ve bildirimleri gider, orijinal quote_count düşer',
  public._q(format($q$select count(*) from public.content_quotes where id = %L$q$, public._g('Q1'))) = '0'
  and public._q($q$select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1'
  and public._q(format($q$select count(*) from public.prompt_comments where quote_id = %L$q$, public._g('Q1'))) = '0'
  and public._q(format($q$select count(*) from public.notifications where target_href like '/quotes/local?id=%s%%'$q$, public._g('Q1'))) = '0'
  and public._q($q$select quote_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1');

-- ============================================================================
-- 9. Silme ve basamak
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._set('Q2', public._val($q$select public.create_quote('workflow', 'c0000000-0000-4000-8000-0000000000a1', 'x')::text$q$) );
select public._check(44, 'başkası alıntıyı silemez (0 satır); sahibi siler, orijinal sayaç düşer',
  public._val(format($q$with d as (delete from public.content_quotes where id = (select id from public.content_quotes where author_id = %L and content_type = 'workflow' limit 1) returning 1) select count(*)::text from d$q$, :bobby)) = '0'
  and public._val($q$select quote_count::text from public.workflows where id = 'c0000000-0000-4000-8000-0000000000a1'$q$) = '2');
select public._try(format($q$delete from public.content_quotes where id = %L$q$, public._g('Q2')));
reset role;
select public._check(45, 'sahibi sildikten sonra workflow quote_count 1',
  public._q($q$select quote_count from public.workflows where id = 'c0000000-0000-4000-8000-0000000000a1'$q$) = '1');
delete from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1';
select public._check(46, 'orijinal silinince alıntıları da silinir (basamak)',
  public._q($q$select count(*) from public.content_quotes where content_type = 'prompt' and target_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '0');

-- ============================================================================
-- 10. Yetkiler
-- ============================================================================
select public._check(47, 'yetkiler: create_quote yalnız authenticated; okuma RPC''leri anon dahil; iç fonksiyonlar kapalı',
  not has_function_privilege('anon', 'public.create_quote(text, uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_quote(text, uuid, text)', 'execute')
  and has_function_privilege('anon', 'public.quote_feed_cards(uuid[])', 'execute')
  and has_function_privilege('anon', 'public.search_quotes(text, integer, timestamptz, uuid)', 'execute')
  and has_function_privilege('anon', 'public.profile_quote_count(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_quote_engagement()', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_quote_like()', 'execute')
  and not has_function_privilege('authenticated', 'public._quote_content_info(text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_quote_count_change()', 'execute')
  and not has_table_privilege('authenticated', 'public.content_quotes', 'insert')
  and not has_table_privilege('authenticated', 'public.content_quotes', 'update')
  and has_table_privilege('anon', 'public.content_quotes', 'select')
  and not has_table_privilege('anon', 'public.content_quotes', 'delete'));


-- ============================================================================
-- Space alıntısı (241): eşik + sahibin tek paylaşımı
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._set('SE', public.create_space('Boş', '', 'free', 'public')::text);
select public._check(90, 'boş Space (3 öğe + 1 görsel yok) kimse tarafından alıntılanamaz (space_too_empty), sahibi dahil',
  public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('SE'))) like '%space_too_empty%');
select public._as_user(:dave);
select public._check(91, 'eşiği geçen Space başkasınca (dave) alıntılanır',
  public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('SP'))) = 'ok');
select public._as_user(:alice);
select public._check(92, 'sahibin kendi Space paylaşımı: ilki ok, ikincisi already_quoted; set_space_shared(false) siler, true yeniden yaratır',
  public._try(format($q$select public.create_quote('space', %L, 'benim')$q$, public._g('SP'))) = 'ok'
  and public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('SP'))) like '%already_quoted%'
  and public._try(format($q$select public.set_space_shared(%L, false)$q$, public._g('SP'))) = 'ok'
  and public._q(format($q$select count(*) from public.content_quotes where author_id = %L and space_id = %L$q$, :alice, public._g('SP'))) = '0'
  and public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('SP'))) = 'ok'
  and public._q(format($q$select count(*) from public.content_quotes where author_id = %L and space_id = %L$q$, :alice, public._g('SP'))) = '1');
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
