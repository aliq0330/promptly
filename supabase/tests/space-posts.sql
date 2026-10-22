-- Space = gönderi (docs/history/215-*): akışta paylaşım, beğeni/yorum hedefi, bildirim, istatistik, şikâyet, feed_page, topluluk duyurusu.
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
-- 1. Akışta paylaşım
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(1, 'istemci shared_at yazamaz (yalnız RPC)',
  public._try(format($q$update public.spaces set shared_at = now() where id = %L$q$, public._g('S'))) like '%space_invalid%');
select public._check(2, 'istemci beğeni sayacı yazamaz (sessizce korunur)',
  public._try(format($q$update public.spaces set like_count = 99 where id = %L$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select like_count from public.spaces where id = %L$q$, public._g('S'))) = '0');
select public._check(3, 'boş Space paylaşılamaz (space_too_empty)',
  public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('E'))) like '%space_too_empty%');
select public._as_user(:bobby);
select public._check(4, 'düzenleyici paylaşamaz (yalnız sahip)',
  public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S'))) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(5, 'yabancı: aynı yanıt değil ama yetki yok',
  public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S'))) like '%space_forbidden%');
select public._as_user(:alice);
select public._check(6, 'sahip paylaşır; ikinci çağrı ilk anı korur',
  public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select shared_at is not null from public.spaces where id = %L$q$, public._g('S'))) = 'true');
select public._set('AT', public._q(format($q$select shared_at::text from public.spaces where id = %L$q$, public._g('S'))));
select public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S')));
select public._check(7, 'yeniden paylaşım sırayı değiştirmez',
  public._q(format($q$select shared_at::text from public.spaces where id = %L$q$, public._g('S'))) = (select v from public._ctx where k = 'AT'));
reset role;

-- ============================================================================
-- 2. feed_page
-- ============================================================================
set role anon;
select public._as_user('');
select public._check(8, 'ziyaretçi akışında paylaşılan Space var (13 argüman); paylaşılmayan yok',
  public._val(format($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'space' and f.id = %L$q$, public._g('S'))) = '1'
  and public._val(format($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.id = %L$q$, public._g('E'))) = '0');
select public._check(9, 'eski 10/11 argümanlı sarmalayıcılar da Space döndürür',
  public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null) f where f.kind = 'space'$q$) = '1'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false) f where f.kind = 'space'$q$) = '1');
select public._check(10, 'tür/kategori/etiket/araç süzgecinde Space yok; yalnız Space türü istenince var',
  public._val($q$select count(*)::text from public.feed_page('all','newest',null,'image',null,null,50,null,null,null,false,null,null) f where f.kind = 'space'$q$) = '0'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,'gece',null) f where f.kind = 'space'$q$) = '0'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',array['space'],null,null,null,50,null,null,null,false,null,null) f$q$) = '1'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',array['prompt'],null,null,null,50,null,null,null,false,null,null) f where f.kind = 'space'$q$) = '0');
select public._check(11, 'akış zamanı = shared_at; ikinci sayfa (keyset) tekrar etmez',
  public._val(format($q$select (f.created_at::text = %L)::text from public.feed_page('all','newest',array['space'],null,null,null,50,null,null,null,false,null,null) f$q$, (select v from public._ctx where k = 'AT'))) = 'true'
  and public._val($q$select count(*)::text from public.feed_page('all','newest',array['space'],null,null,null,1,0,(select f.created_at from public.feed_page('all','newest',array['space'],null,null,null,1,null,null,null,false,null,null) f),(select f.id from public.feed_page('all','newest',array['space'],null,null,null,1,null,null,null,false,null,null) f),false,null,null) x$q$) = '0');
select public._check(12, 'space_feed_cards: sayılar, ilk palet, kişisel alanlar boş',
  public._val(format($q$select image_count || ':' || note_count || ':' || array_to_string(palette_colors, ',') || ':' || coalesce(my_role, '-') || ':' || (shared_at is not null)::text from public.space_feed_cards(array[%L]::uuid[])$q$, public._g('S'))) = '1:2:#ff5fa2,#22d3c5:-:true');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(13, 'takip akışında takip edilen sahibin Space''i var',
  public._val($q$select count(*)::text from public.feed_page('following','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'space'$q$) = '1');
select public._check(14, '"etiketlerim" kapsamında Space yok',
  public._val($q$select count(*)::text from public.feed_page('tags','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'space'$q$) = '0');
select public._as_user(:erin);
select public._check(15, 'engellenen kullanıcı akışta ve kartta Space''i görmez',
  public._val($q$select count(*)::text from public.feed_page('all','newest',null,null,null,null,50,null,null,null,false,null,null) f where f.kind = 'space'$q$) = '0'
  and public._val(format($q$select count(*)::text from public.space_feed_cards(array[%L]::uuid[])$q$, public._g('S'))) = '0');
reset role;

-- ============================================================================
-- 3. Beğeni / yorum
-- ============================================================================
set role anon;
select public._as_user('');
select public._set('ANON', public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, %L)$q$, public._g('S'), :carol)));
select public._check(16, 'ziyaretçi beğenemez',
  (select v from public._ctx where k = 'ANON') ~ '(not_authenticated|row-level security|permission denied)');
reset role;
set role authenticated;
select public._as_user(:carol);
select public._check(17, 'beğeni: sayaç 1, sahibine "Space''ini beğendi" bildirimi Space adresiyle',
  public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select like_count from public.spaces where id = %L$q$, public._g('S'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Space''ini beğendi:%%' and target_href = '/spaces/local?id=%s'$q$, :alice, public._g('S'))) = '1');
select public._check(18, 'aynı kişi ikinci kez beğenemez',
  public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S'))) like '%duplicate key%');
select public._check(19, 'paylaşılmamış Space beğenilemez / yorumlanamaz',
  public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('E'))) like '%space_not_found%'
  and public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'x')$q$, public._g('E'))) like '%space_not_found%');
select public._set('CM', public._val(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'Harika palet') returning id::text$q$, public._g('S'))));
select public._check(20, 'yorum: sayaç 1, sahibine "Space''ine yorum yaptı" + hl adresi',
  public._q(format($q$select comment_count from public.spaces where id = %L$q$, public._g('S'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Space''ine yorum yaptı:%%' and target_href = '/spaces/local?id=%s&hl=comment:%s'$q$, :alice, public._g('S'), public._g('CM'))) = '1');
select public._check(21, 'başka hedefin yorumuna Space yanıtı bağlanamaz',
  public._try(format($q$insert into public.prompt_comments (prompt_id, author_id, body, parent_id) values ('a0000000-0000-4000-8000-0000000000a1', auth.uid(), 'x', %L)$q$, public._g('CM'))) like '%invalid_parent%');
select public._as_user(:alice);
select public._set('RP', public._val(format($q$insert into public.prompt_comments (space_id, author_id, body, parent_id) values (%L, auth.uid(), 'Teşekkürler @dave', %L) returning id::text$q$, public._g('S'), public._g('CM'))));
select public._try(format($q$insert into public.comment_likes (comment_id, user_id) values (%L, auth.uid())$q$, public._g('CM')));
select public._check(22, 'yanıt → carol''a; @bahsetme → dave''e; yorum beğenisi → Space adresiyle',
  public._q(format($q$select count(*) from public.notifications where recipient_id = %L and type = 'comment_reply' and target_href like '/spaces/local?id=%s&hl=comment:%%'$q$, :carol, public._g('S'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Seni bir yorumda andı%%' and target_href like '/spaces/local?id=%s%%'$q$, :dave, public._g('S'))) = '1'
  and public._q(format($q$select count(*) from public.notifications where recipient_id = %L and message like 'Yorumunu beğendi%%' and target_href = '/spaces/local?id=%s&hl=comment:%s'$q$, :carol, public._g('S'), public._g('CM'))) = '1');
select public._check(23, 'adressiz (target_href boş) bildirim üretilmedi',
  public._q($q$select count(*) from public.notifications where target_href is null$q$) = '0');
select public._as_user(:erin);
select public._check(24, 'engellenen kullanıcı beğenemez',
  public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S'))) like '%space_not_found%');
select public._as_user(:dave);
select public._check(25, 'istatistik: beğenenler + yorum yapanlar; kaydedenler boş',
  public._val(format($q$select string_agg(actor_username, ',') from public.content_engagers('space', %L, 'likes')$q$, public._g('S'))) = 'carol'
  and public._val(format($q$select count(*)::text from public.content_engagers('space', %L, 'comments')$q$, public._g('S'))) = '2'
  and public._val(format($q$select count(*)::text from public.content_engagers('space', %L, 'saves')$q$, public._g('S'))) = '0');
select public._check(26, 'yabancı beğeni ve yorum satırlarını okur (herkese açık Space)',
  public._val(format($q$select count(*)::text from public.prompt_likes where space_id = %L$q$, public._g('S'))) = '1'
  and public._val(format($q$select count(*)::text from public.prompt_comments where space_id = %L$q$, public._g('S'))) = '2');
select public._as_user(:carol);
select public._try(format($q$delete from public.prompt_likes where space_id = %L and user_id = auth.uid()$q$, public._g('S')));
select public._check(27, 'beğeni geri alınınca sayaç 0 ve bildirim silinir',
  public._q(format($q$select like_count from public.spaces where id = %L$q$, public._g('S'))) = '0'
  and public._q(format($q$select count(*) from public.notifications where message like 'Space''ini beğendi:%%'$q$)) = '0');
select public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S')));
reset role;

-- ============================================================================
-- 4. Topluluk duyurusu
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._set('CP', public._val(format($q$select public.share_to_community(%L, 'space', %L, 'yeni palet')::text$q$, public._g('C'), public._g('S'))));
select public._check(28, 'herkese açık Space toplulukta duyurulur (başvuru)',
  public._q(format($q$select kind || ':' || content_type || ':' || (space_id = %L)::text from public.community_posts where id = %L$q$, public._g('S'), public._g('CP'))) = 'application:space:true');
select public._check(29, 'aynı Space aynı toplulukta ikinci kez duyurulamaz',
  public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('S'))) like '%already_shared%');
select public._try(format($q$select public.set_space_shared(%L, false)$q$, public._g('E')));
select public._try(format($q$update public.spaces set visibility = 'private' where id = %L$q$, public._g('E')));
select public._check(30, 'özel Space duyurulamaz: sahibe content_not_public',
  public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('E'))) like '%content_not_public%');
select public._as_user(:carol);
select public._try(format($q$select public.join_community(%L)$q$, public._g('C')));
select public._check(31, 'başkasının özel Space''i: varlığı sızmaz (content_not_found)',
  public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('E'))) like '%content_not_found%'
    or public._try(format($q$select public.share_to_community(%L, 'space', %L)$q$, public._g('C'), public._g('E'))) like '%forbidden%');
select public._check(32, 'gönderi beğenisi gönderinin sayacına gider, Space''inkine değil (bağlama özel)',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, auth.uid())$q$, public._g('CP'))) = 'ok'
  and public._q(format($q$select like_count from public.community_posts where id = %L$q$, public._g('CP'))) = '1'
  and public._q(format($q$select like_count from public.spaces where id = %L$q$, public._g('S'))) = '1');
reset role;
select public._check(33, 'Space yalnız başvuru olabilir (yerel Space gönderisi yok)',
  public._try(format($q$insert into public.community_posts (community_id, author_id, kind, content_type, space_id) values (%L, %L, 'native', 'space', %L)$q$, public._g('CR'), :alice, public._g('S'))) like '%community_posts_space_application%');

-- ============================================================================
-- 5. Görünürlük değişimi, şikâyet, silme
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.spaces set archived_at = now() where id = %L$q$, public._g('S')));
select public._check(34, 'arşivlenen Space akıştan düşer (shared_at boşalır)',
  public._q(format($q$select (shared_at is null)::text from public.spaces where id = %L$q$, public._g('S'))) = 'true');
select public._try(format($q$update public.spaces set archived_at = null where id = %L$q$, public._g('S')));
select public._try(format($q$select public.set_space_shared(%L, true)$q$, public._g('S')));
select public._as_user(:carol);
select public._try(format($q$insert into public.reports (reporter_id, target_type, target_id, reason) values (auth.uid(), 'space', %L, 'spam')$q$, public._g('S')));
select public._as_user(:mod);
select public._check(35, 'moderatör kuyruğunda Space şikâyeti başlık + adresle görünür',
  public._val(format($q$select target_title || '|' || target_href from public.moderation_report_queue('open') where target_type = 'space'$q$)) = 'Neon|/spaces/local?id=' || public._g('S'));
select public._try($q$select public.moderate_report((select id from public.reports where target_type = 'space' limit 1), 'removed')$q$);
select public._check(36, 'kaldırma = akıştan çıkar + özel yap (Space silinmez)',
  public._q(format($q$select visibility || ':' || (shared_at is null)::text from public.spaces where id = %L$q$, public._g('S'))) = 'private:true');
select public._as_user(:dave);
select public._check(37, 'özele çekilen Space''in beğeni/yorumu yabancıya okunmaz',
  public._val(format($q$select count(*)::text from public.prompt_likes where space_id = %L$q$, public._g('S'))) = '0'
  and public._val(format($q$select count(*)::text from public.prompt_comments where space_id = %L$q$, public._g('S'))) = '0');
select public._as_user(:alice);
select public._check(38, 'yanıtlı yorumu olan Space silinir (FK basamağı), bildirimleri temizlenir',
  public._try(format($q$delete from public.spaces where id = %L$q$, public._g('S'))) = 'ok'
  and public._q(format($q$select count(*) from public.prompt_comments where space_id = %L$q$, public._g('S'))) = '0'
  and public._q(format($q$select count(*) from public.notifications where target_href like '/spaces/local?id=%s%%'$q$, public._g('S'))) = '0'
  and public._q(format($q$select count(*) from public.community_posts where id = %L$q$, public._g('CP'))) = '0');
reset role;

select public._check(39, 'yeni fonksiyonların yetkileri: set_space_shared yalnız authenticated; space_feed_cards anon dahil; iç tetikleyiciler kapalı',
  not has_function_privilege('anon', 'public.set_space_shared(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.set_space_shared(uuid, boolean)', 'execute')
  and has_function_privilege('anon', 'public.space_feed_cards(uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_space_engagement()', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_space_like()', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
