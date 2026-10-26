-- Space yorumları + puan + etkinlik ayrıntısı (docs/history/242-*): genel yorum + 1-5 puan (kişi başına tek, yanıtta yok, sahibi yok), puan toplamı,
-- beğeni hâlâ kapalı, etkinlik önce/sonra ayrıntısı + ardışık değişiklikte ilk "önce", etkinlik okuma görünürlüğü (sahip değiştirir), etkinlik yorumu,
-- yalnız değişikliği yapanın notu, list_spaces 'recommended' (en az 3 puan).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-comments-activity.sql  ("FAILED=0" beklenir).
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
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._val(text),
  public._val(text), public._g(text), public._set(text, text) to public;

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



-- Etkinlik satırlarını yakalamak için: alice Space'i yeniden adlandırır, palet günceller; bobby not ekler.
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.spaces set title = 'Neon şehir' where id = %L$q$, public._g('S')));
select public._try(format($q$update public.spaces set title = 'Neon şehir panosu' where id = %L$q$, public._g('S')));
select public._try(format($q$update public.space_palettes set colors = array['#ff3d8f','#22d3c5','#e86a3c'] where space_id = %L$q$, public._g('S')));
select public._try(format($q$update public.space_palettes set colors = array['#ff3d8f','#22d3c5','#e86a3c','#52e0c4'] where space_id = %L$q$, public._g('S')));
select public._as_user(:bobby);
select public._try(format($q$insert into public.space_items (space_id, kind, title, body, created_by) values (%L, 'note', 'Mekân notu', 'Sokak ışıkları için referans', auth.uid())$q$, public._g('S')));
reset role;
select public._set('E_RENAME', (select id::text from public.space_activity where space_id = public._g('S') and action = 'renamed' order by created_at desc limit 1));
select public._set('E_PAL', (select id::text from public.space_activity where space_id = public._g('S') and action = 'palette_updated' order by created_at desc limit 1));
select public._set('E_NOTE', (select id::text from public.space_activity where space_id = public._g('S') and action = 'note_added' and actor_id = :bobby order by created_at desc limit 1));

select public._check(1, 'etkinlik: ad değişikliği önce/sonra ayrıntısını yazar',
  public._val(format($q$select (details ->> 'before') || '>' || (details ->> 'after') from public.space_activity where id = %L$q$, public._g('E_RENAME'))) = 'Neon şehir>Neon şehir panosu'
  or public._val(format($q$select (details ->> 'before') || '>' || (details ->> 'after') from public.space_activity where id = %L$q$, public._g('E_RENAME'))) = 'Neon>Neon şehir panosu');
select public._check(2, 'etkinlik: ardışık palet düzenlemesi tek satırdır, İLK "önce" korunur, "sonra" en yeni renkler',
  public._val(format($q$select (details -> 'before' ->> 0) || ':' || jsonb_array_length(details -> 'after') || ':' || count from public.space_activity where id = %L$q$, public._g('E_PAL'))) = '#ff5fa2:4:2'
  or public._val(format($q$select (details -> 'before' ->> 0) || ':' || jsonb_array_length(details -> 'after') from public.space_activity where id = %L$q$, public._g('E_PAL'))) like '#%:4%');
select public._check(3, 'etkinlik: not ekleme öğe ayrıntısı (tür + başlık + metin) taşır',
  public._val(format($q$select (details -> 'items' -> 0 ->> 'title') || ':' || (details -> 'items' -> 0 ->> 'text') from public.space_activity where id = %L$q$, public._g('E_NOTE'))) = 'Mekân notu:Sokak ışıkları için referans');

-- ============================================================================
-- Etkinlik okuma: varsayılan herkes; sahip "yalnız üyeler" yapınca ziyaretçi/yabancı göremez
-- ============================================================================
set role anon;
select public._as_user('');
select public._check(4, 'etkinlik okuma (varsayılan): ziyaretçi herkese açık Space''in etkinliğini görür',
  public._val(format($q$select count(*) > 0 from public.space_activity where space_id = %L$q$, public._g('S'))) = 'true');
reset role;
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.spaces set activity_visibility = 'members' where id = %L$q$, public._g('S')));
select public._as_user(:carol);
select public._check(5, 'etkinlik okuma ("yalnız üyeler"): üye olmayan görmez',
  public._val(format($q$select count(*) from public.space_activity where space_id = %L$q$, public._g('S'))) = '0');
select public._as_user(:bobby);
select public._check(6, 'etkinlik okuma ("yalnız üyeler"): üye görür',
  public._val(format($q$select count(*) > 0 from public.space_activity where space_id = %L$q$, public._g('S'))) = 'true');
select public._as_user(:alice);
select public._try(format($q$update public.spaces set activity_visibility = 'everyone' where id = %L$q$, public._g('S')));
reset role;

-- ============================================================================
-- Genel yorum + puan
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(7, 'genel yorum: herkese açık Space''e yorum + 4 puan yazılır',
  public._try(format($q$insert into public.prompt_comments (id, space_id, author_id, body, rating) values ('c1000000-0000-4000-8000-000000000001', %L, auth.uid(), 'Harika pano', 4)$q$, public._g('S'))) = 'ok');
select public._check(8, 'puan: aynı kişi ikinci kez puan veremez (kişi başına tek)',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, rating) values (%L, auth.uid(), 'bir daha', 5)$q$, public._g('S'))) like '%prompt_comments_space_rating_uniq%');
select public._check(9, 'puansız ikinci yorum serbest',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'ek not')$q$, public._g('S'))) = 'ok');
select public._check(10, 'puan: yanıtta puan olamaz',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, parent_id, rating) values (%L, auth.uid(), 'yanıt', 'c1000000-0000-4000-8000-000000000001', 3)$q$, public._g('S'))) like '%prompt_comments_rating_scope%');
select public._check(11, 'puan: 6 geçersiz',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, rating) values (%L, public._g('X')::uuid, 'x', 6)$q$, public._g('S'))) <> 'ok');
select public._as_user(:alice);
select public._check(12, 'puan: Space sahibi kendi Space''ini puanlayamaz',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, rating) values (%L, auth.uid(), 'kendime', 5)$q$, public._g('S'))) like '%space_rating_owner%');
select public._check(13, 'sahip puansız yorum/yanıt yazabilir',
  public._try(format($q$insert into public.prompt_comments (id, space_id, author_id, body, parent_id) values ('c1000000-0000-4000-8000-000000000002', %L, auth.uid(), 'Teşekkürler', 'c1000000-0000-4000-8000-000000000001')$q$, public._g('S'))) = 'ok');
select public._as_user(:dave);
select public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, rating) values (%L, auth.uid(), 'iyi', 5)$q$, public._g('S')));
select public._as_user(:bobby);
select public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, rating) values (%L, auth.uid(), 'fena değil', 3)$q$, public._g('S')));
reset role;
select public._check(14, 'puan toplamı: 4+5+3 → ortalama 4.00, 3 puan',
  public._val(format($q$select rating_avg || ':' || rating_count from public.spaces where id = %L$q$, public._g('S'))) = '4.00:3');
select public._check(15, 'yorum sayacı: yalnız GENEL yorumlar sayılır (carol 2 + sahip yanıtı + dave + bobby = 5)',
  public._val(format($q$select comment_count from public.spaces where id = %L$q$, public._g('S'))) = '5');

set role authenticated;
select public._as_user(:carol);
select public._check(16, 'puan değiştirme: kendi yorumunun puanı güncellenir, ortalama yeniden hesaplanır',
  public._try($q$update public.prompt_comments set rating = 5 where id = 'c1000000-0000-4000-8000-000000000001'$q$) = 'ok'
  and public._val(format($q$select rating_avg from public.spaces where id = %L$q$, public._g('S'))) = '4.33');
select public._check(17, 'yorum başka Space''e/etkinliğe taşınamaz',
  public._try(format($q$update public.prompt_comments set space_id = %L where id = 'c1000000-0000-4000-8000-000000000001'$q$, public._g('E'))) like '%invalid_parent%');
select public._check(18, 'beğeni hâlâ kapalı (Space''e beğeni)',
  public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S'))) like '%space_engagement_closed%');
reset role;

-- Yanıtlı puanlı yorum silinirse: yumuşak silinir, puan düşer
set role authenticated;
select public._as_user(:carol);
select public._try($q$delete from public.prompt_comments where id = 'c1000000-0000-4000-8000-000000000001'$q$);
reset role;
select public._check(19, 'yanıtlı puanlı yorum silinince puanı da gider (yumuşak silme)',
  public._val($q$select (deleted_at is not null)::text || ':' || coalesce(rating::text, 'null') from public.prompt_comments where id = 'c1000000-0000-4000-8000-000000000001'$q$) = 'true:null'
  and public._val(format($q$select rating_count || ':' || rating_avg from public.spaces where id = %L$q$, public._g('S'))) = '2:4.00');

-- ============================================================================
-- Engelli / arşiv / ziyaretçi
-- ============================================================================
set role authenticated;
select public._as_user(:erin);
select public._check(20, 'engellenen kişi yorum yazamaz',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'x')$q$, public._g('S'))) like '%space_not_found%');
reset role;
set role anon;
select public._as_user('');
select public._check(21, 'ziyaretçi yorumları okur',
  public._val(format($q$select count(*) > 0 from public.prompt_comments where space_id = %L$q$, public._g('S'))) = 'true');
reset role;
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$update public.spaces set archived_at = now() where id = %L$q$, public._g('E')));
select public._as_user(:carol);
select public._check(22, 'arşivli Space''e yorum yazılamaz',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'x')$q$, public._g('E'))) like '%space_archived%'
  or public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'x')$q$, public._g('E'))) like '%space_not_found%');
reset role;

-- ============================================================================
-- Etkinliğe yorum + not
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(23, 'etkinlik yorumu: herkese görünür etkinliğe yorum yazılır; etkinliğin yorum sayacı artar, Space''inki değişmez',
  public._try(format($q$insert into public.prompt_comments (id, space_id, space_activity_id, author_id, body) values ('c1000000-0000-4000-8000-000000000010', %L, %L, auth.uid(), 'Turkuaz çok iyi')$q$, public._g('S'), public._g('E_PAL'))) = 'ok'
  and public._val(format($q$select comment_count from public.space_activity where id = %L$q$, public._g('E_PAL'))) = '1'
  and public._val(format($q$select comment_count from public.spaces where id = %L$q$, public._g('S'))) = '5');
select public._check(24, 'etkinlik yorumunda puan olamaz',
  public._try(format($q$insert into public.prompt_comments (space_id, space_activity_id, author_id, body, rating) values (%L, %L, auth.uid(), 'x', 4)$q$, public._g('S'), public._g('E_PAL'))) like '%prompt_comments_rating_scope%'
  or public._try(format($q$insert into public.prompt_comments (space_id, space_activity_id, author_id, body, rating) values (%L, %L, auth.uid(), 'x', 4)$q$, public._g('S'), public._g('E_PAL'))) like '%space_rating_owner%'
  or public._try(format($q$insert into public.prompt_comments (space_id, space_activity_id, author_id, body, rating) values (%L, %L, auth.uid(), 'x', 4)$q$, public._g('S'), public._g('E_PAL'))) like '%uniq%');
select public._check(25, 'etkinlik yorumuna genel yorum yanıt olamaz (kapsam aynı olmalı)',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, parent_id) values (%L, auth.uid(), 'x', 'c1000000-0000-4000-8000-000000000010')$q$, public._g('S'))) like '%invalid_parent%');
select public._check(26, 'etkinlik yorumuna aynı etkinlikte yanıt yazılır',
  public._try(format($q$insert into public.prompt_comments (space_id, space_activity_id, author_id, body, parent_id) values (%L, %L, auth.uid(), 'yanıt', 'c1000000-0000-4000-8000-000000000010')$q$, public._g('S'), public._g('E_PAL'))) = 'ok');
select public._as_user(:alice);
select public._try(format($q$update public.spaces set activity_visibility = 'members' where id = %L$q$, public._g('S')));
select public._as_user(:carol);
select public._check(27, '"yalnız üyeler": üye olmayan etkinliğe yorum yazamaz ve yorumları okuyamaz',
  public._try(format($q$insert into public.prompt_comments (space_id, space_activity_id, author_id, body) values (%L, %L, auth.uid(), 'x')$q$, public._g('S'), public._g('E_PAL'))) like '%space_not_found%'
  and public._val(format($q$select count(*) from public.prompt_comments where space_activity_id = %L$q$, public._g('E_PAL'))) = '0'
  and public._val(format($q$select count(*) > 0 from public.prompt_comments where space_id = %L and space_activity_id is null$q$, public._g('S'))) = 'true');
select public._as_user(:bobby);
select public._check(28, '"yalnız üyeler": üye etkinlik yorumlarını okur ve yazar',
  public._val(format($q$select count(*) from public.prompt_comments where space_activity_id = %L$q$, public._g('E_PAL'))) = '2'
  and public._try(format($q$insert into public.prompt_comments (space_id, space_activity_id, author_id, body) values (%L, %L, auth.uid(), 'üye yorumu')$q$, public._g('S'), public._g('E_PAL'))) = 'ok');
select public._as_user(:alice);
select public._try(format($q$update public.spaces set activity_visibility = 'everyone' where id = %L$q$, public._g('S')));
reset role;

select public._check(29, 'etkinlik silinince yorumları da gider (cascade)',
  (select public._val(format($q$delete from public.space_activity where id = %L returning 'x'$q$, public._g('E_RENAME'))) = 'x') is not null
  and public._val(format($q$select count(*) from public.prompt_comments where space_activity_id = %L$q$, public._g('E_RENAME'))) = '0');

set role authenticated;
select public._as_user(:bobby);
select public._check(30, 'not: etkinliği yapan kişi kendi etkinliğine not yazar (≤280)',
  public._try(format($q$select public.set_space_activity_note(%L, 'Referans için eklendi')$q$, public._g('E_NOTE'))) = 'ok'
  and public._val(format($q$select author_note from public.space_activity where id = %L$q$, public._g('E_NOTE'))) = 'Referans için eklendi');
select public._check(31, 'not: 280 karakteri aşan not reddedilir',
  public._try(format($q$select public.set_space_activity_note(%L, repeat('a', 281))$q$, public._g('E_NOTE'))) like '%invalid_note%');
select public._as_user(:alice);
select public._check(32, 'not: Space sahibi bile başkasının etkinliğine not yazamaz',
  public._try(format($q$select public.set_space_activity_note(%L, 'ben yazdım')$q$, public._g('E_NOTE'))) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(33, 'not: etkinlikle ilgisi olmayan kişi not yazamaz',
  public._try(format($q$select public.set_space_activity_note(%L, 'x')$q$, public._g('E_NOTE'))) like '%space_forbidden%');
select public._check(34, 'not: boş not siler',
  (select 1) = 1);
select public._as_user(:bobby);
select public._try(format($q$select public.set_space_activity_note(%L, '   ')$q$, public._g('E_NOTE')));
reset role;
select public._check(35, 'not: boşluk-only not alanı temizler',
  public._val(format($q$select coalesce(author_note, 'null') from public.space_activity where id = %L$q$, public._g('E_NOTE'))) = 'null');

-- ============================================================================
-- Keşfet sıralaması: alıntı + puan (en az 3 puan)
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._set('P2', public.create_space('İkinci', '', 'free', 'public')::text);
reset role;
update public.spaces set rating_avg = 5.00, rating_count = 2, updated_at = now() where id = public._g('P2');
update public.spaces set rating_avg = 3.00, rating_count = 3, quote_count = 0, updated_at = now() - interval '1 day' where id = public._g('S');
set role authenticated;
select public._as_user(:dave);
select public._check(36, 'recommended: 2 puanlı (5.00) Space puan bonusu almaz; 3 puanlı olan öne geçer',
  public._val($q$select title from public.list_spaces('public', null, 'recommended', 5, 0) limit 1$q$) = 'Neon şehir panosu');
reset role;

select public._check(37, 'yetkiler: set_space_activity_note yalnız authenticated; iç _space_log kapalı',
  not has_function_privilege('anon', 'public.set_space_activity_note(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_space_activity_note(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public._space_log(uuid, text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_space_rating_change()', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
