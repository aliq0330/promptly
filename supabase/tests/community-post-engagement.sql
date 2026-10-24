-- Topluluk gönderisi etkileşimi: DB/RLS/RPC testi (docs/history/178-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-post-engagement.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby carol(üye) dave(dışarıdan) erin(kapalı topluluk üyesi) gina(alice'in engelledikleri) hank(site moderatörü).
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
create or replace function public._mkc(p_name text, p_level text, p_members uuid[]) returns uuid language plpgsql as $$
declare v_gid uuid; v_u uuid;
begin
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  v_gid := (public.create_community(p_name, 'açıklama', p_level, null, 50, p_members, 'general', 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array p_members loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  return v_gid;
end $$;

-- İçerik fixture'ı (süper kullanıcı).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at) values
  ('a0000000-0000-4000-8000-000000000001', :alice, 'Açık prompt', 'd', 'metin', 'text', 'published', 'public', now()),
  ('a0000000-0000-4000-8000-000000000003', :alice, 'Taslak prompt', 'd', 'metin', 'text', 'draft', 'private', now()),
  ('a0000000-0000-4000-8000-000000000004', :bobby, 'Bobby açık prompt', 'd', 'metin', 'text', 'published', 'public', now()),
  ('a0000000-0000-4000-8000-000000000005', :alice, 'Eski özel prompt', 'd', 'metin', 'text', 'published', 'private', now() - interval '10 days'),
  ('a0000000-0000-4000-8000-000000000007', :alice, 'Üçüncü yerel prompt (açık)', 'd', 'metin', 'text', 'published', 'public', now()),
  ('a0000000-0000-4000-8000-000000000008', :bobby, 'Bobby özel prompt', 'd', 'metin', 'text', 'published', 'private', now());
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('d0000000-0000-4000-8000-000000000002', :bobby, 'Açık istek', 'd', false, 'public');

-- Topluluklar: A (herkese açık: alice, bobby, carol, gina), B (herkese açık: alice, bobby), R (kapalı: alice, erin)
select public._mkc('Topluluk A', 'public', array[:bobby, :carol, :gina]::uuid[]) as v \gset a_
select public._mkc('Topluluk B', 'public', array[:bobby]::uuid[]) as v \gset b_
select public._mkc('Topluluk R', 'restricted', array[:erin]::uuid[]) as v \gset r_
insert into public._ctx values ('A', :'a_v'), ('B', :'b_v'), ('R', :'r_v');
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:alice, :gina);

-- ============================================================================
-- 1. Yerel gönderi fixture'ı: içerik topluluğa oluşturulurken bağlanır (docs/history/179-*; asıl erişim/yazma testleri community-content.sql'de)
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-000000000002', :alice, 'Yerel prompt', 'd', 'metin', 'text', 'published', 'public', public._g('A'));
insert into public.presets (id, creator_id, title, status, visibility, community_id) values
  ('b0000000-0000-4000-8000-000000000001', :alice, 'Yerel hazır ayar', 'published', 'public', public._g('A'));
insert into public.workflows (id, creator_id, title, status, visibility, community_id) values
  ('c0000000-0000-4000-8000-000000000001', :alice, 'Yerel akış', 'published', 'public', public._g('A'));
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, community_id) values
  ('d0000000-0000-4000-8000-000000000001', :alice, 'Yerel istek', 'd', false, 'public', public._g('A'));
reset role;
insert into public._ctx select 'n1', id::text from public.community_posts where prompt_id = 'a0000000-0000-4000-8000-000000000002';
insert into public._ctx select 'n_preset', id::text from public.community_posts where preset_id = 'b0000000-0000-4000-8000-000000000001';
select public._check(1, 'yerel gönderi: içerik topluluğa eklenince akış gönderisi (kind=native) kendiliğinden oluşur, dört türde de',
  (select count(*) from public.community_posts where community_id = public._g('A') and kind = 'native') = 4
  and exists (select 1 from public.community_posts p where p.id = public._g('n1') and p.author_id = :alice and p.note is null and p.like_count = 0 and p.comment_count = 0));

-- ============================================================================
-- 3. Başvuru gönderisi (Senaryo B)
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
create temp table _a1 as select
  public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-000000000004', 'bu yeni topluluğa uyar') as with_note,
  public.share_to_community(public._g('B'), 'prompt', 'a0000000-0000-4000-8000-000000000004', null) as in_b,
  public.share_to_community(public._g('A'), 'request', 'd0000000-0000-4000-8000-000000000002', null) as no_note;
reset role;
insert into public._ctx select 'app_a', with_note::text from _a1;
insert into public._ctx select 'app_b', in_b::text from _a1;
insert into public._ctx select 'app_rq', no_note::text from _a1;
select public._check(15, 'başvuru: ayrı gönderi kimliği, tür application, not isteğe bağlı',
  (select kind = 'application' and note = 'bu yeni topluluğa uyar' and author_id = :bobby from public.community_posts where id = public._g('app_a'))
  and (select kind = 'application' and note is null from public.community_posts where id = public._g('app_rq'))
  and public._g('app_a') <> public._g('app_b') and public._g('app_a') <> 'a0000000-0000-4000-8000-000000000004'::uuid);
select public._check(16, 'başvuru: aynı içerik farklı topluluklarda iki ayrı gönderi',
  (select count(distinct id) from public.community_posts where prompt_id = 'a0000000-0000-4000-8000-000000000004') = 2
  and (select count(distinct community_id) from public.community_posts where prompt_id = 'a0000000-0000-4000-8000-000000000004') = 2);
set role authenticated;
select public._as_user(:bobby);
select public._check(17, 'başvuru: mevcut kurallar korunur (aynı toplulukta ikinci başvuru, özel içerik, başkasının özel içeriği reddedilir)',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000004', null)$q$, public._g('A'))) like '%already_shared%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000008', null)$q$, public._g('A'))) like '%content_not_public%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000002', null)$q$, public._g('A'))) like '%content_not_found%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000004', repeat('x', 501))$q$, public._g('B'))) like '%invalid_note%');
select public._as_user(:dave);
select public._check(18, 'başvuru: üye olmayan başvuramaz',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000007', null)$q$, public._g('A'))) like '%forbidden%');
reset role;

-- ============================================================================
-- 4. Beğeni: gönderi kimliğine bağlı
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.prompt_likes (community_post_id, user_id) values (public._g('app_a'), :carol);
select public._as_user(:alice);
insert into public.prompt_likes (community_post_id, user_id) values (public._g('app_a'), :alice);
reset role;
select public._check(19, 'beğeni: gönderi sayacı artar (2), iki kişi',
  (select like_count from public.community_posts where id = public._g('app_a')) = 2);
select public._check(39, 'bildirim: beğeni gönderi sahibine gönderiye giden adresle gider; kendi beğenisi bildirim üretmez',
  (select count(*) from public.notifications where recipient_id = :bobby and type = 'like' and actor_id = :carol and dedupe_key = 'cpost_like:' || public._g('app_a') || ':' || :carol
     and target_href = '/communities/local?id=' || public._g('A') || '&tab=feed&post=' || public._g('app_a') || '&hl=post:' || public._g('app_a')) = 1
  and (select count(*) from public.notifications where recipient_id = :bobby and actor_id = :bobby) = 0);
select public._check(20, 'beğeni: ORİJİNAL içeriğin beğeni sayısı DEĞİŞMEZ; diğer topluluktaki gönderi de değişmez',
  (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000004') = 0
  and (select like_count from public.community_posts where id = public._g('app_b')) = 0
  and not exists (select 1 from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-000000000004'));
set role authenticated;
select public._as_user(:carol);
select public._check(21, 'beğeni: aynı kullanıcı aynı gönderiyi iki kez beğenemez',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, %L)$q$, public._g('app_a'), :carol)) like '%duplicate key%');
-- Orijinali beğenmek gönderi sayacını değiştirmez
insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-000000000004', :carol);
reset role;
select public._check(22, 'beğeni: orijinal içeriği beğenmek gönderi sayacını değiştirmez ve tersi',
  (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000004') = 1
  and (select like_count from public.community_posts where id = public._g('app_a')) = 2);
set role authenticated;
select public._as_user(:carol);
delete from public.prompt_likes where community_post_id = public._g('app_a') and user_id = :carol;
reset role;
select public._check(23, 'beğeni: geri alma sayacı düşürür, bildirimi kaldırır; orijinalin beğenisi yerinde kalır',
  (select like_count from public.community_posts where id = public._g('app_a')) = 1
  and (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000004') = 1
  and (select count(*) from public.notifications where dedupe_key = 'cpost_like:' || public._g('app_a') || ':' || :carol) = 0);
set role authenticated;
select public._as_user(:dave);
select public._check(24, 'beğeni: üye olmayan beğenemez; başkası adına beğeni yazılamaz',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, %L)$q$, public._g('app_a'), :dave)) like '%forbidden%'
  and public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, %L)$q$, public._g('app_a'), :alice)) <> 'ok');
select public._as_user(:alice);
select public._check(55, 'beğeni: hem gönderi hem içerik hedefli satır reddedilir',
  public._try(format($q$insert into public.prompt_likes (community_post_id, prompt_id, user_id) values (%L, 'a0000000-0000-4000-8000-000000000004', %L)$q$, public._g('app_b'), :alice)) like '%exactly_one_target%');
select public._as_user(:dave);
select public._as_user('');
set role anon;
select public._check(25, 'beğeni: ziyaretçi beğenemez ama herkese açık topluluğun beğenilerini okur',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, %L)$q$, public._g('app_a'), :dave)) <> 'ok'
  and (select count(*) from public.prompt_likes where community_post_id = public._g('app_a')) = 1);
reset role;
set role authenticated;
select public._as_user(:gina);
select public._check(26, 'beğeni: gönderi sahibinin engellediği kullanıcı beğenemez',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, %L)$q$, public._g('n1'), :gina)) like '%blocked%');
reset role;

-- ============================================================================
-- 5. Yorum: gönderi kimliğine bağlı, yorumlar karışmaz
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
create temp table _c1 as select gen_random_uuid() as id;
insert into public.prompt_comments (id, community_post_id, author_id, body) select id, public._g('app_a'), :carol, 'başvuru yorumu' from _c1;
insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-000000000004', :carol, 'orijinal yorumu');
reset role;
insert into public._ctx select 'c_app', id::text from _c1;
select public._check(27, 'yorum: gönderi yorum sayacı yalnız gönderiye, orijinal sayacı yalnız orijinal yoruma yazılır',
  (select comment_count from public.community_posts where id = public._g('app_a')) = 1
  and (select comment_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000004') = 1
  and (select comment_count from public.community_posts where id = public._g('app_b')) = 0);
select public._check(28, 'yorum: başvuru yorumları orijinalin yorumlarına karışmaz ve tersi',
  (select count(*) from public.prompt_comments where prompt_id = 'a0000000-0000-4000-8000-000000000004') = 1
  and (select count(*) from public.prompt_comments where community_post_id = public._g('app_a')) = 1
  and (select body from public.prompt_comments where community_post_id = public._g('app_a')) = 'başvuru yorumu');
set role authenticated;
select public._as_user(:bobby);
create temp table _c2 as select gen_random_uuid() as id;
insert into public.prompt_comments (id, community_post_id, author_id, body, parent_id) select _c2.id, public._g('app_a'), :bobby, 'yanıt', public._g('c_app') from _c2;
select public._check(29, 'yorum: aynı gönderide yanıt çalışır; yanıt başka hedefteki yoruma bağlanamaz',
  (select comment_count from public.community_posts where id = public._g('app_a')) = 2
  and public._try(format($q$insert into public.prompt_comments (community_post_id, author_id, body, parent_id) values (%L, %L, 'x', %L)$q$,
        public._g('app_b'), :bobby, public._g('c_app'))) like '%invalid_parent%'
  and public._try(format($q$insert into public.prompt_comments (prompt_id, author_id, body, parent_id) values ('a0000000-0000-4000-8000-000000000004', %L, 'x', %L)$q$,
        :bobby, public._g('c_app'))) like '%invalid_parent%');
select public._as_user(:dave);
select public._check(30, 'yorum: üye olmayan yorum yazamaz; ama herkese açık topluluğun yorumlarını okur',
  public._try(format($q$insert into public.prompt_comments (community_post_id, author_id, body) values (%L, %L, 'x')$q$, public._g('app_a'), :dave)) like '%forbidden%'
  and (select count(*) from public.prompt_comments where community_post_id = public._g('app_a')) = 2);
select public._as_user(:bobby);
select public._check(31, 'yorum: başkası adına yorum yazılamaz',
  public._try(format($q$insert into public.prompt_comments (community_post_id, author_id, body) values (%L, %L, 'x')$q$, public._g('app_a'), :carol)) like '%row-level security%');
-- Yorum beğenisi: üyelik ister; üye sayacı yorumun kendi sayacıdır
insert into public.comment_likes (comment_id, user_id) values (public._g('c_app'), :bobby);
select public._as_user(:dave);
select public._check(32, 'yorum beğenisi: üye olmayan topluluk yorumunu beğenemez; üye beğenebilir',
  public._try(format($q$insert into public.comment_likes (comment_id, user_id) values (%L, %L)$q$, public._g('c_app'), :dave)) like '%forbidden%'
  and (select like_count from public.prompt_comments where id = public._g('c_app')) = 1);
select public._as_user(:bobby);
-- Yorum silme / düzenleme yalnız sahibi
select public._check(33, 'yorum: başkasının yorumu düzenlenemez/silinemez',
  (select count(*) from (select 1 from public.prompt_comments where id = public._g('c_app') and author_id = :carol) x) = 1
  and public._cnt(format($q$with u as (update public.prompt_comments set body = 'hack' where id = %L returning 1) select count(*) from u$q$, public._g('c_app'))) = 0
  and public._cnt(format($q$with d as (delete from public.prompt_comments where id = %L returning 1) select count(*) from d$q$, public._g('c_app'))) = 0);
reset role;

-- ============================================================================
-- 6. Yetkisiz yazma
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(34, 'yetki: istemci community_posts tablosuna doğrudan yazamaz; sayaç sütunları değiştirilemez',
  public._try(format($q$insert into public.community_posts (community_id, author_id, kind, content_type, prompt_id) values (%L, %L, 'native', 'prompt', 'a0000000-0000-4000-8000-000000000007')$q$, public._g('A'), :dave)) like '%permission denied%'
  and public._try(format($q$update public.community_posts set like_count = 999 where id = %L$q$, public._g('app_a'))) like '%permission denied%');
select public._check(35, 'yetki: başkasının gönderisi güncellenemez/silinemez/sabitlenemez',
  public._try(format($q$select public.update_community_post(%L, 'hack')$q$, public._g('app_a'))) like '%forbidden%'
  and public._try(format($q$select public.delete_community_post(%L)$q$, public._g('app_a'))) like '%forbidden%'
  and public._try(format($q$select public.set_community_post_pinned(%L, true)$q$, public._g('app_a'))) like '%forbidden%');
select public._as_user(:bobby);
select public._tk('upd', format($q$select public.update_community_post(%L, 'yeni not')$q$, public._g('app_a')));
select public._check(36, 'yetki: sahibi başvurusunun notunu günceller; başkası yerel gönderiyi güncelleyemez',
  public._r('upd') = 'ok'
  and (select note from public.community_posts where id = public._g('app_a')) = 'yeni not'
  and public._try(format($q$select public.update_community_post(%L, 'x')$q$, public._g('n1'))) like '%forbidden%');
select public._as_user(:alice);
select public._check(37, 'yetki: yerel gönderiye not eklenemez',
  public._try(format($q$select public.update_community_post(%L, 'not')$q$, public._g('n1'))) like '%invalid_note%');
reset role;

-- ============================================================================
-- 7. Normal içeriğin beğeni/yorumu bozulmadı
-- ============================================================================
set role authenticated;
-- Kendi içeriğini beğenme yasaktır (224): beğeniler carol'dan, yorumlar bobby'den.
select public._as_user(:carol);
insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-000000000001', :carol);
insert into public.prompt_likes (request_id, user_id) values ('d0000000-0000-4000-8000-000000000002', :carol);
insert into public.prompt_likes (workflow_id, user_id) values ('c0000000-0000-4000-8000-000000000001', :carol);
insert into public.prompt_likes (preset_id, user_id) values ('b0000000-0000-4000-8000-000000000001', :carol);
select public._as_user(:bobby);
insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-000000000001', :bobby, 'normal yorum');
insert into public.prompt_comments (request_id, author_id, body) values ('d0000000-0000-4000-8000-000000000002', :bobby, 'istek yorumu');
reset role;
select public._check(38, 'normal içerik: prompt/istek/workflow/hazır ayar beğeni ve yorum sayaçları doğru hedefe yazılır',
  (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select comment_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select like_count from public.prompt_requests where id = 'd0000000-0000-4000-8000-000000000002') = 1
  and (select comment_count from public.prompt_requests where id = 'd0000000-0000-4000-8000-000000000002') = 1
  and (select like_count from public.workflows where id = 'c0000000-0000-4000-8000-000000000001') = 1
  and (select like_count from public.presets where id = 'b0000000-0000-4000-8000-000000000001') = 1
  and (select coalesce(sum(like_count), 0) from public.community_posts) = 1);

-- ============================================================================
-- 8. Bildirimler
-- ============================================================================
select public._check(40, 'bildirim: yorum gönderi sahibine, yanıt yorum sahibine; adres gönderiyi ve yorumu işaret eder',
  (select count(*) from public.notifications where recipient_id = :bobby and type = 'comment' and target_href like '%&post=' || public._g('app_a') || '&hl=comment:%') = 1
  and (select count(*) from public.notifications where recipient_id = :carol and type = 'comment_reply' and target_href like '%&post=' || public._g('app_a') || '&hl=comment:%') = 1);
select public._check(41, 'bildirim: orijinal içerik yorumu orijinalin kendi adresiyle (gönderi adresiyle karışmaz)',
  not exists (select 1 from public.notifications where target_href like '/prompts/local?id=a0000000-0000-4000-8000-000000000004%' and target_href like '%post=%'));

-- ============================================================================
-- 9. Kapatılmış topluluk salt-okunur
-- ============================================================================
update public.chat_groups set closed_at = now() where id = public._g('B');
set role authenticated;
select public._as_user(:bobby);
select public._check(44, 'kapatılmış topluluk: gönderiye beğeni/yorum yazılamaz',
  public._try(format($q$insert into public.prompt_likes (community_post_id, user_id) values (%L, %L)$q$, public._g('app_b'), :bobby)) like '%community_closed%'
  and public._try(format($q$insert into public.prompt_comments (community_post_id, author_id, body) values (%L, %L, 'x')$q$, public._g('app_b'), :bobby)) like '%community_closed%');
reset role;
update public.chat_groups set closed_at = null where id = public._g('B');

-- ============================================================================
-- 10. Üye ayrılınca / silme basamağı
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
insert into public.prompt_likes (community_post_id, user_id) values (public._g('app_b'), :alice);
select public._as_user(:bobby);
insert into public.prompt_comments (id, community_post_id, author_id, body) values ('f0000000-0000-4000-8000-000000000001', public._g('app_b'), :bobby, 'üst');
insert into public.prompt_comments (community_post_id, author_id, body, parent_id) values (public._g('app_b'), :bobby, 'alt', 'f0000000-0000-4000-8000-000000000001');
select public.leave_chat_group(public._g('B'));
select public._as_user(:alice);
select public._check(45, 'üyelikten ayrılan yazarın gönderisi kalır',
  (select count(*) from public.community_posts where id = public._g('app_b')) = 1);
reset role;
-- Orijinal içerik silinince başvuru gönderisi, beğenisi ve (yanıtlı) yorumları dangling kalmadan gider
delete from public.prompts where id = 'a0000000-0000-4000-8000-000000000004';
select public._check(46, 'orijinal içerik silinince: başvuru gönderileri, beğenileri ve yanıtlı yorumları kalıntısız silinir',
  not exists (select 1 from public.community_posts where prompt_id = 'a0000000-0000-4000-8000-000000000004')
  and not exists (select 1 from public.prompt_likes pl where pl.community_post_id is not null and not exists (select 1 from public.community_posts p where p.id = pl.community_post_id))
  and not exists (select 1 from public.prompt_comments pc where pc.community_post_id is not null and not exists (select 1 from public.community_posts p where p.id = pc.community_post_id))
  and not exists (select 1 from public.prompt_comments where body in ('üst', 'alt', 'başvuru yorumu', 'yanıt')));
select public._check(47, 'gönderi silinince ona giden bildirimler de silinir',
  not exists (select 1 from public.notifications where target_href like '%&post=' || public._g('app_a') || '%'));

-- ============================================================================
-- 11. Moderasyon ve eski satırlar
-- ============================================================================
-- Eski (legacy) gönderi: migration öncesi satır simülasyonu — tür TAHMİN EDİLMEZ, etkileşim yine çalışır.
insert into public.community_posts (id, community_id, author_id, kind, content_type, prompt_id)
values ('e0000000-0000-4000-8000-000000000001', public._g('A'), :alice, 'legacy', 'prompt', 'a0000000-0000-4000-8000-000000000001');
set role authenticated;
select public._as_user(:carol);
insert into public.prompt_likes (community_post_id, user_id) values ('e0000000-0000-4000-8000-000000000001', :carol);
insert into public.prompt_comments (community_post_id, author_id, body) values ('e0000000-0000-4000-8000-000000000001', :carol, 'eski gönderiye yorum');
reset role;
select public._check(48, 'eski (legacy) gönderi: kendi beğeni/yorum sayacı çalışır, orijinal içerik sayaçları değişmez',
  (select like_count = 1 and comment_count = 1 from public.community_posts where id = 'e0000000-0000-4000-8000-000000000001')
  and (select like_count = 1 and comment_count = 1 from public.prompts where id = 'a0000000-0000-4000-8000-000000000001'));
select public._check(49, 'eski satırlar: migration türü tahmin etmez (kind=legacy kuralı kısıtta tanımlı, yeni RPCler açık tür yazar)',
  (select count(*) from public.community_posts where kind not in ('native', 'application', 'legacy')) = 0
  and pg_get_expr((select adbin from pg_attrdef where adrelid = 'public.community_posts'::regclass and adnum = (select attnum from pg_attribute where attrelid = 'public.community_posts'::regclass and attname = 'kind')), 'public.community_posts'::regclass) = '''application''::text');
set role authenticated;
select public._as_user(:hank);
select public._check(50, 'moderasyon: site moderatörü yetkili olmadığı topluluğun gönderisini kaldıramaz; sahip kaldırabilir',
  public._try(format($q$select public.moderate_community_post(%L, 'x')$q$, public._g('n1'))) <> 'ok');
select public._as_user(:alice);
select public._check(51, 'moderasyon: yetkili yerel gönderiyi kaldırınca içeriğin KENDİSİ silinir',
  public._try(format($q$select public.moderate_community_post(%L, 'x')$q$, public._g('n_preset'))) = 'ok');
reset role;
set role authenticated;
select public._as_user(:bobby);
select public._check(52, 'moderasyon: kaldırılan yerel gönderinin içeriği ve alt satırları silinmiştir',
  not exists (select 1 from public.presets where id = 'b0000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.preset_fields where preset_id = 'b0000000-0000-4000-8000-000000000001'));
reset role;

-- Başvuru gönderisi içeriği AÇMAZ: başvurulan içerik sonradan özel yapılırsa topluluk üyesine de görünmez (yalnız yerel gönderi açar).
set role authenticated;
select public._as_user(:alice);
select public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-000000000007', null) as v \gset app7_
reset role;
update public.prompts set visibility = 'private' where id = 'a0000000-0000-4000-8000-000000000007';
set role authenticated;
select public._as_user(:bobby);
select public._check(56, 'başvuru: başvurulan içerik sonradan özel yapılırsa üyeye de görünmez (başvuru içeriği açmaz; yalnız yerel gönderi açar)',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000007') = 0
  and (select count(*) from public.community_posts where id = :'app7_v') = 1);
select public._as_user('');
set role anon;
select public._check(57, 'başvuru: aynı durumda ziyaretçi de göremez',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000007') = 0);
reset role;

-- ============================================================================
-- 12. Çalıştırma yetkileri
-- ============================================================================
select public._check(53, 'yetki: kullanılmayan iki adımlı RPC kapalı; tetikleyici işlevleri istemciye kapalı',
  not has_function_privilege('anon', 'public.publish_native_community_post(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_native_community_post(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_community_post_engagement()', 'execute')
  and not has_function_privilege('anon', 'public.enforce_community_comment_like()', 'execute'));
select public._check(54, 'sayaç tutarlılığı: gönderi sayaçları gerçek satır sayısına eşit',
  not exists (select 1 from public.community_posts p where p.like_count <> (select count(*) from public.prompt_likes l where l.community_post_id = p.id))
  and not exists (select 1 from public.community_posts p where p.comment_count <> (select count(*) from public.prompt_comments c where c.community_post_id = p.id)));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
