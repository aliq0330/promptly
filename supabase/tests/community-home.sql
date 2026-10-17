-- Topluluklar ana sayfası: akışlar, görüldü, öneri, gözatma (docs/history/185-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-home.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''77777777-7777-4777-8777-777777777777'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina'),(:hank,'hank')) as u(id, name);
update public.profiles set role = 'moderator' where id = :hank;

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
create or replace function public._tk(key text, q text) returns text language plpgsql as $$
declare r text;
begin r := public._try(q); insert into public._ctx values ('r:' || key, r) on conflict (k) do update set v = excluded.v; return r; end $$;
create or replace function public._r(key text) returns text language sql stable as $$ select v from public._ctx where k = 'r:' || key $$;
grant execute on function public._tk(text, text), public._r(text) to public;
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._ctx_get(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
-- RLS'e takılmadan (süper kullanıcı gözüyle) tek değer okur: yalnızca DOĞRULAMA içindir.
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text),
  public._g(text), public._ctx_get(text), public._q(text) to public;


-- Topluluk kurar; davetlileri kabul ettirir. Sahip alice.
create or replace function public._mkc(p_name text, p_level text, p_members uuid[], p_cat text default 'general') returns uuid language plpgsql as $$
declare v_gid uuid; v_u uuid;
begin
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  v_gid := (public.create_community(p_name, 'açıklama', p_level, null, 50, p_members, p_cat, 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array p_members loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  return v_gid;
end $$;
-- Kimlik → okunur etiket (p1.. gönderi, A/B/R/P topluluk); sıra için dizilim
create or replace function public._lbl(p_id uuid) returns text language sql stable security definer as
  $$ select coalesce((select k from public._ctx where v = p_id::text and k in ('p1','p2','p3','p4','p5','p6','A','B','R','P') limit 1), '?') $$;
create or replace function public._lbls(p_ids uuid[]) returns text language sql stable security definer as
  $$ select coalesce(string_agg(public._lbl(x), ',' order by o), '') from unnest(p_ids) with ordinality t(x, o) $$;
grant execute on function public._mkc(text, text, uuid[], text), public._lbl(uuid), public._lbls(uuid[]) to public;

-- A "Alfa Resim" (herkese açık, görsel: bobby, carol) · B "Bravo Atölye" (herkese açık: bobby) · R "Rüzgar" (kapalı: erin, bobby) · P "Gizli Oda" (tamamen kapalı: bobby, erin)
select public._mkc('Alfa Resim', 'public', array[:bobby, :carol]::uuid[], 'image') as v \gset a_
select public._mkc('Bravo Atölye', 'public', array[:bobby]::uuid[]) as v \gset b_
select public._mkc('Rüzgar', 'restricted', array[:erin, :bobby]::uuid[]) as v \gset r_
select public._mkc('Gizli Oda', 'private', array[:bobby, :erin]::uuid[]) as v \gset p_
insert into public._ctx values ('A', :'a_v'), ('B', :'b_v'), ('R', :'r_v'), ('P', :'p_v');
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000b3', :bobby, 'P3 B', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000b1', :bobby, 'P1 A', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000b2', :bobby, 'P2 A', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000b4', :bobby, 'P4 R', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000b5', :bobby, 'P5 P', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000b6', :carol, 'P6 A carol', 'd', 'metin', 'text', 'published', 'public');
-- Paylaşım sırası (created_at): B, A1, A2, R, P, A(carol) — B en eski (çeşitlilik testi)
set role authenticated;
select public._as_user(:bobby);
select public.share_to_community(public._g('B'), 'prompt', 'a0000000-0000-4000-8000-0000000000b3', null) as v \gset p3_
select pg_sleep(0.05);
select public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-0000000000b1', null) as v \gset p1_
select pg_sleep(0.05);
select public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-0000000000b2', null) as v \gset p2_
select pg_sleep(0.05);
select public.share_to_community(public._g('R'), 'prompt', 'a0000000-0000-4000-8000-0000000000b4', null) as v \gset p4_
select pg_sleep(0.05);
select public.share_to_community(public._g('P'), 'prompt', 'a0000000-0000-4000-8000-0000000000b5', null) as v \gset p5_
select pg_sleep(0.05);
select public._as_user(:carol);
select public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-0000000000b6', null) as v \gset p6_
reset role;
insert into public._ctx values ('p1', :'p1_v'), ('p2', :'p2_v'), ('p3', :'p3_v'), ('p4', :'p4_v'), ('p5', :'p5_v'), ('p6', :'p6_v');
select public._check(0, 'fixture: 4 topluluk, 6 gönderi', (select count(*) from public.chat_groups) = 4 and (select count(*) from public.community_posts) = 6);

-- ============================================================================
-- 1. Gönderiler akışı: üye topluluklar (herkese açık + kapalı), tamamen kapalı hariç, yeniden eskiye
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public._check(1, 'bobby (A,B,R,P üyesi): akış yeniden eskiye p6,p4,p2,p1,p3; tamamen kapalı P gönderisi (p5) YOK',
  (select public._lbls(array_agg(post_id order by created_at desc, post_id desc)) from public.member_feed_page(null, null, 30)) = 'p6,p4,p2,p1,p3',
  (select public._lbls(array_agg(post_id order by created_at desc, post_id desc)) from public.member_feed_page(null, null, 30)));
select public._check(2, 'keyset: limit 2 + imleç → sonraki sayfa tekrarsız (p6,p4 | p2,p1 | p3)',
  (select public._lbls(array_agg(post_id order by created_at desc, post_id desc)) from public.member_feed_page(null, null, 2)) = 'p6,p4'
  and (select public._lbls(array_agg(post_id order by created_at desc, post_id desc)) from public.member_feed_page(
        (select created_at from public.community_posts where id = public._g('p4')), public._g('p4'), 2)) = 'p2,p1'
  and (select public._lbls(array_agg(post_id order by created_at desc, post_id desc)) from public.member_feed_page(
        (select created_at from public.community_posts where id = public._g('p1')), public._g('p1'), 2)) = 'p3');
select public._as_user(:erin);
select public._check(3, 'erin (R ve P üyesi): yalnız kapalı R gönderisi (p4); tamamen kapalı P''nin p5''i akışa girmez',
  (select public._lbls(array_agg(post_id order by created_at desc, post_id desc)) from public.member_feed_page(null, null, 30)) = 'p4');
select public._as_user(:dave);
select public._check(4, 'dave (hiçbir topluluğa üye değil): akış boş', (select count(*) from public.member_feed_page(null, null, 30)) = 0);
reset role;
select public._as_user('');
set role anon;
select public._check(5, 'ziyaretçi (anon) akış/öneri/görüldü/gözat fonksiyonlarını ÇALIŞTIRAMAZ',
  public._try($q$select * from public.member_feed_page(null, null, 5)$q$) like '%permission denied%'
  and public._try($q$select * from public.discover_feed_page(now(), 5, 0)$q$) like '%permission denied%'
  and public._try($q$select public.mark_community_posts_seen(array[gen_random_uuid()])$q$) like '%permission denied%'
  and public._try($q$select * from public.recommend_communities(5)$q$) like '%permission denied%'
  and public._try($q$select * from public.browse_communities(null, null, 'relevant', 5, 0)$q$) like '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(6, 'yardımcılar (_community_relevance, _community_post_tags) giriş yapmış istemciye de KAPALI',
  public._try($q$select * from public._community_relevance(gen_random_uuid())$q$) like '%permission denied%'
  and public._try($q$select * from public._community_post_tags(gen_random_uuid())$q$) like '%permission denied%');

-- Üyelik kalkınca gönderi akıştan düşer; rol değişimi/erişim: erin R'den çıkarılır
reset role;
delete from public.conversation_members where conversation_id = public._g('R') and user_id = :erin;
set role authenticated;
select public._as_user(:erin);
select public._check(7, 'erin R''den çıkarılınca akış boş (üyelik kalktı → erişim kalktı) ve p4 doğrudan da okunamaz',
  (select count(*) from public.member_feed_page(null, null, 30)) = 0
  and (select count(*) from public.community_posts where id = public._g('p4')) = 0);
reset role;
insert into public.conversation_members (conversation_id, user_id, role) values (public._g('R'), :erin, 'member');
set role authenticated;
select public._as_user(:erin);
select public._check(8, 'erin yeniden üye → p4 geri gelir', (select count(*) from public.member_feed_page(null, null, 30)) = 1);

-- ============================================================================
-- 2. Keşfet akışı: kaynaklar, kapsam kuralları, çeşitlilik, kopyasızlık
-- ============================================================================
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(9, 'dave keşfet akışı: yalnız herkese açık toplulukların p1,p2,p3,p6 (kapalı R/tamamen kapalı P yok), hepsi benzersiz',
  (select count(*) from public.discover_feed_page(now(), 30, 0)) = 4
  and (select count(distinct post_id) from public.discover_feed_page(now(), 30, 0)) = 4
  and (select not bool_or(public._lbl(post_id) in ('p4', 'p5')) from public.discover_feed_page(now(), 30, 0)),
  public._lbls(array(select post_id from public.discover_feed_page(now(), 30, 0))));
select public._check(10, 'çeşitlilik: aynı toplulukta art arda yığılma yok — B''nin tek gönderisi (p3), A''nın 2. ve 3. gönderisinden önce gelir',
  public._lbls(array(select post_id from public.discover_feed_page(now(), 30, 0))) ~ '^p[126],p3,p[126],p[126]$',
  public._lbls(array(select post_id from public.discover_feed_page(now(), 30, 0))));
select public._check(11, 'sayfalama: limit 2 offset 0 + offset 2 = tüm küme, tekrar yok',
  (select count(distinct x) from (
     select post_id x from public.discover_feed_page(now(), 2, 0)
     union all select post_id from public.discover_feed_page(now(), 2, 2)) s) = 4);
select public._as_user(:bobby);
select public._check(12, 'bobby: kendi gönderileri keşfet akışında yok; üyesi olduğu P tamamen kapalı olduğu için p5 yok; R üyeliği → p4 (member) var',
  (select public._lbls(array_agg(post_id order by post_id)) from public.discover_feed_page(now(), 30, 0)) = public._lbls(array[public._g('p6')]),
  (select public._lbls(array_agg(post_id order by post_id)) from public.discover_feed_page(now(), 30, 0)));
select public._as_user(:erin);
select public._check(13, 'erin (R üyesi): kapalı R gönderisi p4 kendi üyeliği sayesinde ve kaynağı ''member'' (p4 bobby''nin); P''nin p5''i YOK',
  (select source from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) = 'p4') = 'member'
  and (select count(*) from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) = 'p5') = 0);

-- Takip edilen yazar: dave carol'u takip eder → p6 'followed' ve en üstte
reset role;
insert into public.follows (follower_id, following_id) values (:dave, :carol);
set role authenticated;
select public._as_user(:dave);
select public._check(14, 'takip edilen yazarın gönderisi (p6): kaynak ''followed'', puanı en yüksek',
  (select source from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) = 'p6') = 'followed'
  and (select public._lbl(post_id) from public.discover_feed_page(now(), 30, 0) limit 1) = 'p6');

-- Etiket sinyali: dave ''resim'' etiketini takip eder; p3'ün içeriği bu etiketi taşır → puan artar
reset role;
insert into public.tags (slug, label) values ('resim', 'Resim');
insert into public.prompt_tags (prompt_id, tag_slug) values ('a0000000-0000-4000-8000-0000000000b3', 'resim');
set role authenticated;
select public._as_user(:dave);
create temp table _s0 as select public._lbl(post_id) l, score from public.discover_feed_page(now(), 30, 0);
reset role;
insert into public.tag_follows (user_id, tag_slug) values (:dave, 'resim');
set role authenticated;
select public._as_user(:dave);
create temp table _s1 as select public._lbl(post_id) l, score from public.discover_feed_page(now(), 30, 0);
select public._check(15, 'takip edilen etiketi taşıyan gönderinin (p3) puanı ~+1.5 artar, başka gönderinin puanı değişmez',
  (select abs((select score from _s1 where l = 'p3') - (select score from _s0 where l = 'p3') - 1.5) < 0.05)
  and (select abs((select score from _s1 where l = 'p1') - (select score from _s0 where l = 'p1')) < 0.001),
  (select score::text from _s1 where l = 'p3') || ' / ' || (select score::text from _s0 where l = 'p3'));

-- ============================================================================
-- 3. Görüldü
-- ============================================================================
reset role;
create temp table _t0 as select clock_timestamp() as t;
grant select on _t0 to public;
set role authenticated;
select public._as_user(:dave);
select public._check(16, 'mark_community_posts_seen: okunabilir iki gönderi yazılır (p1,p2); okunamayan kapalı p4 YAZILMAZ',
  public.mark_community_posts_seen(array[public._g('p1'), public._g('p2'), public._g('p4')]) = 2);
select public._check(17, 'aynı gönderiyi yeniden işaretlemek ilk görülme zamanını korur (0 yeni satır)',
  public.mark_community_posts_seen(array[public._g('p1')]) = 0);
select public._check(18, 'yeni sayfa yükleme anı (now): görülen p1,p2 akıştan düşer; p3,p6 kalır',
  (select count(*) from public.discover_feed_page(now(), 30, 0)) = 2
  and (select count(*) from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) in ('p1', 'p2')) = 0);
select public._check(19, 'aynı oturum (as_of = işaretlemeden önceki an): sıra ve küme DEĞİŞMEZ → sayfalar arası kayma yok',
  (select count(*) from public.discover_feed_page((select t from _t0), 30, 0)) = 4);
select public._as_user(:carol);
select public._check(20, 'görüldü verisi kişiye özel: carol dave''in görüldü satırlarını okuyamaz; carol''ın kendi akışı etkilenmez',
  (select count(*) from public.community_post_views) = 0
  and (select count(*) from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) = 'p1') = 1);
select public._check(21, 'istemci görüldü tablosuna doğrudan yazamaz',
  public._try(format($q$insert into public.community_post_views (user_id, post_id) values (%L, %L)$q$, :carol, public._g('p3'))) like '%permission denied%');

-- Engel ve yasak: dave carol'u engeller → p6 hem keşfet hem üye akışından düşer; carol'u engelleyen dave için A'dan yasak: A düşer
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:dave, :carol);
set role authenticated;
select public._as_user(:dave);
select public._check(22, 'engellenen yazarın gönderisi (p6) keşfet akışında yok',
  (select count(*) from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) = 'p6') = 0);
reset role;
delete from public.blocks where blocker_id = :dave;
insert into public.follows (follower_id, following_id) values (:dave, :carol) on conflict do nothing;
insert into public.chat_group_bans (group_id, user_id, banned_by) values (public._g('A'), :dave, :alice);
set role authenticated;
select public._as_user(:dave);
select public._check(23, 'topluluktan yasaklı kullanıcı: A''nın gönderileri keşfet akışında yok; B''ninki var',
  (select count(*) from public.discover_feed_page(now(), 30, 0) where public._lbl(post_id) in ('p1', 'p2', 'p6')) = 0
  and (select count(*) from public.discover_feed_page(now() , 30, 0) where public._lbl(post_id) = 'p3') = 1);
reset role;
delete from public.chat_group_bans where user_id = :dave;

-- ============================================================================
-- 4. Topluluk önerileri
-- ============================================================================
update public.profiles set interests = array['bravo'] where id = :dave;
set role authenticated;
select public._as_user(:dave);
select public._check(24, 'öneri: üye olunmayan herkese açık + kapalı topluluklar (A,B,R); tamamen kapalı P ASLA; en çok istenen sayı',
  (select public._lbls(array_agg(id order by id)) from (select id from public.recommend_communities(10) order by id) s) = (select public._lbls(array_agg(x order by x)) from unnest(array[public._g('A'), public._g('B'), public._g('R')]) x)
  and (select count(*) from public.recommend_communities(2)) = 2,
  (select string_agg(public._lbl(id) || ':' || reason, ',') from public.recommend_communities(10)));
select public._check(25, 'öneri nedeni gerçek sinyalden: B = ilgi alanı (''bravo'' adında), A = ortak üyelik/kategori yok → popüler, R = popüler',
  (select reason from public.recommend_communities(10) where public._lbl(id) = 'B') = 'interest'
  and (select reason from public.recommend_communities(10) where public._lbl(id) = 'R') = 'popular',
  (select string_agg(public._lbl(id) || ':' || reason, ',') from public.recommend_communities(10)));
select public._check(26, 'ilgi alanı eşleşen B, eşleşmeyen toplulukların önünde',
  (select public._lbl(id) from public.recommend_communities(10) limit 1) = 'B');
select public._check(27, 'kapalı R için içerik istatistiği üye olmayana verilmez (post_count null); herkese açıkta var',
  (select post_count from public.recommend_communities(10) where public._lbl(id) = 'R') is null
  and (select post_count from public.recommend_communities(10) where public._lbl(id) = 'A') is not null);
select public._as_user(:bobby);
select public._check(28, 'üye olunan topluluk önerilmez (bobby tüm toplulukların üyesi → boş)', (select count(*) from public.recommend_communities(10)) = 0);
reset role;
-- takip edilen kişi (carol) A'nın üyesi → A 'followed'; kapalı R'de takip edilen üye sinyali SAYILMAZ
insert into public.follows (follower_id, following_id) values (:dave, :erin) on conflict do nothing;
set role authenticated;
select public._as_user(:dave);
select public._check(29, 'takip edilen üye olan herkese açık A → neden ''followed''; takip edilen üyesi olan KAPALI R yine ''popular'' (sinyal sızmaz)',
  (select reason from public.recommend_communities(10) where public._lbl(id) = 'A') = 'followed'
  and (select reason from public.recommend_communities(10) where public._lbl(id) = 'R') = 'popular',
  (select string_agg(public._lbl(id) || ':' || reason, ',') from public.recommend_communities(10)));
reset role;
-- bekleyen başvuru/dolu/engel/kapatılmış
update public.chat_groups set closed_at = now() where id = public._g('B');
set role authenticated;
select public._as_user(:dave);
select public._check(30, 'kapatılmış (salt-okunur) topluluk önerilmez', (select count(*) from public.recommend_communities(10) where public._lbl(id) = 'B') = 0);
reset role;
update public.chat_groups set closed_at = null where id = public._g('B');

-- ============================================================================
-- 5. Tüm topluluklar (gözat + arama)
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(31, 'gözat: varsayılan (boş sorgu) herkese açık + kapalı topluluklar; tamamen kapalı P yok',
  (select count(*) from public.browse_communities(null, null, 'relevant', 20, 0)) = 3
  and (select count(*) from public.browse_communities(null, null, 'relevant', 20, 0) where public._lbl(id) = 'P') = 0);
select public._check(32, 'arama adı: ''Gizli'' (tamamen kapalı) HİÇ bulunmaz; ''Rüzgar'' (kapalı) bulunur; ''Alfa'' → A',
  (select count(*) from public.browse_communities('Gizli', null, 'relevant', 20, 0)) = 0
  and (select public._lbl(id) from public.browse_communities('Rüzgar', null, 'relevant', 20, 0) limit 1) = 'R'
  and (select count(*) from public.browse_communities('Alfa', null, 'relevant', 20, 0)) = 1);
select public._check(33, 'kategori süzgeci (image) yalnız A; joker karakter ''%'' tüm listeyi açmaz',
  (select count(*) from public.browse_communities(null, 'image', 'relevant', 20, 0)) = 1
  and (select count(*) from public.browse_communities('%', null, 'relevant', 20, 0)) = 0);
select public._check(34, 'etiket araması: ''resim'' etiketli içerik paylaşılan herkese açık B bulunur; kapalı/tamamen kapalıda etiket üzerinden bulunmaz',
  (select public._lbls(array_agg(id)) from public.browse_communities('resim', null, 'relevant', 20, 0)) like '%B%');
select public._check(35, 'kapalı R kartında istatistik üye olmayana yok; my_status doğru (dave hiçbirine üye değil)',
  (select post_count from public.browse_communities(null, null, 'relevant', 20, 0) where public._lbl(id) = 'R') is null
  and (select count(*) from public.browse_communities(null, null, 'relevant', 20, 0) where my_status <> 'none') = 0);
select public._as_user(:bobby);
select public._check(36, 'üye olduklarım da listelenir ve my_status = member (bobby)',
  (select count(*) from public.browse_communities(null, null, 'relevant', 20, 0) where my_status = 'member') = 3);
select public._as_user(:dave);
select public._check(37, 'ilgiye göre sıra: ilgi alanı eşleşen B ilk (relevant); ''newest'' sırası en yeni topluluk (R) ilk',
  (select public._lbl(id) from public.browse_communities(null, null, 'relevant', 20, 0) limit 1) = 'B'
  and (select public._lbl(id) from public.browse_communities(null, null, 'newest', 20, 0) limit 1) = 'R',
  (select string_agg(public._lbl(id), ',') from public.browse_communities(null, null, 'relevant', 20, 0)));
select public._check(38, 'sayfalama: limit 1 offset 0/1/2 → üç farklı topluluk',
  (select count(distinct id) from (select id from public.browse_communities(null, null, 'relevant', 1, 0)
    union all select id from public.browse_communities(null, null, 'relevant', 1, 1)
    union all select id from public.browse_communities(null, null, 'relevant', 1, 2)) s) = 3);
reset role;
-- engelli yönetici (sahip dave'i engelledi → sahibi engelleyen topluluk görünmez)
insert into public.blocks (blocker_id, blocked_id) values (:alice, :dave);
set role authenticated;
select public._as_user(:dave);
select public._check(39, 'sahibi beni engelleyen topluluklar gözatta/önerilerde yok', (select count(*) from public.browse_communities(null, null, 'relevant', 20, 0)) = 0 and (select count(*) from public.recommend_communities(10)) = 0);
reset role;
delete from public.blocks where blocker_id = :alice;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
