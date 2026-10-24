-- Beğeni / yorum beğenisi / istek etiketi okuması hedefin okunabilirliğini izler: DB/RLS testi (docs/history/195-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/engagement-privacy.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(üye) carol(üye) dave(dışarıdan) erin(kapalı topluluk üyesi) hank(site moderatörü).
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

-- Topluluklar: P (herkese açık: alice, bobby), R (kapalı: alice, erin, bobby), T (tamamen kapalı: alice, bobby)
select public._mkc('Topluluk P', 'public', array[:bobby]::uuid[]) as v \gset p_
select public._mkc('Topluluk R', 'restricted', array[:erin, :bobby]::uuid[]) as v \gset r_
select public._mkc('Topluluk T', 'private', array[:bobby]::uuid[]) as v \gset t_
insert into public._ctx values ('P', :'p_v'), ('R', :'r_v'), ('T', :'t_v');
reset role;
-- Normal (topluluk dışı) içerik: herkese açık prompt + özel prompt + herkese açık istek (etiketli)
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Açık prompt', 'd', 'metin', 'text', 'published', 'public');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('d0000000-0000-4000-8000-0000000000a1', :alice, 'Açık istek', 'd', false, 'public');
insert into public.tags (slug, label) values ('etiket-a', 'etiket-a');
insert into public.prompt_request_tags (request_id, tag_slug) values ('d0000000-0000-4000-8000-0000000000a1', 'etiket-a');
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('e0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a1', :alice, 'açık yorum');

-- Topluluğa özgü içerik (kapalı R, tamamen kapalı T, açık P): bobby yazar
set role authenticated;
select public._as_user(:bobby);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-0000000000b1', :bobby, 'R prompt', 'd', 'metin', 'text', 'published', 'public', public._g('R')),
  ('a0000000-0000-4000-8000-0000000000b2', :bobby, 'T prompt', 'd', 'metin', 'text', 'published', 'public', public._g('T')),
  ('a0000000-0000-4000-8000-0000000000b3', :bobby, 'P prompt', 'd', 'metin', 'text', 'published', 'public', public._g('P'));
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, community_id) values
  ('d0000000-0000-4000-8000-0000000000b1', :bobby, 'R istek', 'd', false, 'public', public._g('R'));
insert into public.workflows (id, creator_id, title, status, visibility, community_id) values
  ('c0000000-0000-4000-8000-0000000000b1', :bobby, 'R akış', 'published', 'public', public._g('R'));
insert into public.presets (id, creator_id, title, status, visibility, community_id) values
  ('b0000000-0000-4000-8000-0000000000b1', :bobby, 'R hazır ayar', 'published', 'public', public._g('R'));
insert into public.prompt_request_tags (request_id, tag_slug) values ('d0000000-0000-4000-8000-0000000000b1', 'etiket-a');
-- erin (R üyesi) ve alice (sahip) beğenir + yorumlar; bobby kendi gönderisini beğenir
select public._as_user(:erin);
insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000b1', :erin);
insert into public.prompt_likes (request_id, user_id) values ('d0000000-0000-4000-8000-0000000000b1', :erin);
insert into public.prompt_likes (workflow_id, user_id) values ('c0000000-0000-4000-8000-0000000000b1', :erin);
insert into public.prompt_likes (preset_id, user_id) values ('b0000000-0000-4000-8000-0000000000b1', :erin);
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('e0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000b1', :erin, 'R yorumu');
insert into public.comment_likes (comment_id, user_id) values ('e0000000-0000-4000-8000-0000000000b1', :erin);
-- Kendi içeriğini beğenme yasak (224): T ve P içeriğini alice (sahip) beğenir.
select public._as_user(:alice);
insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000b2', :alice), ('a0000000-0000-4000-8000-0000000000b3', :alice);
-- Topluluk gönderisinin (R) beğenisi
reset role;
insert into public._ctx select 'RPOST', id::text from public.community_posts where community_id = public._g('R') and prompt_id = 'a0000000-0000-4000-8000-0000000000b1';
set role authenticated;
select public._as_user(:erin);
insert into public.prompt_likes (community_post_id, user_id) values (public._g('RPOST'), :erin);
-- Normal açık içerik beğenileri (herkes görmeli)
select public._as_user(:carol);
insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000a1', :carol);
insert into public.comment_likes (comment_id, user_id) values ('e0000000-0000-4000-8000-0000000000a1', :carol);
reset role;

-- ============================================================================
-- 1. Üye olmayan (dave) kapalı / tamamen kapalı topluluk içeriğinin beğenilerini GÖRMEZ
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(1, 'dışarıdan: kapalı (R) topluluk içeriğinin dört türünün beğeni satırlarını göremez',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000b1' or request_id = 'd0000000-0000-4000-8000-0000000000b1' or workflow_id = 'c0000000-0000-4000-8000-0000000000b1' or preset_id = 'b0000000-0000-4000-8000-0000000000b1'$q$) = 0);
select public._check(2, 'dışarıdan: tamamen kapalı (T) topluluk içeriğinin beğenisini göremez',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000b2'$q$) = 0);
select public._check(3, 'dışarıdan: kapalı topluluk GÖNDERİSİNİN beğenisini göremez',
  public._cnt(format($q$select count(*) from public.prompt_likes where community_post_id = %L$q$, public._g('RPOST'))) = 0);
select public._check(4, 'dışarıdan: kapalı topluluk yorumunun beğenisini göremez; başkasının tüm beğeni tablosunda da yok',
  public._cnt($q$select count(*) from public.comment_likes where comment_id = 'e0000000-0000-4000-8000-0000000000b1'$q$) = 0
  and public._cnt($q$select count(*) from public.prompt_likes where user_id = '55555555-5555-4555-8555-555555555555'$q$) = 0);
select public._check(5, 'dışarıdan: kapalı topluluk isteğinin etiket satırını göremez',
  public._cnt($q$select count(*) from public.prompt_request_tags where request_id = 'd0000000-0000-4000-8000-0000000000b1'$q$) = 0);

-- ============================================================================
-- 2. Korunan şeyler bozulmadı: açık içerik beğenisi herkese, topluluk içeriği üyelere, kendi beğenisi kendine
-- ============================================================================
select public._check(6, 'dışarıdan: normal AÇIK prompt/yorum beğenisi ve açık isteğin etiketi hâlâ görünür',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 1
  and public._cnt($q$select count(*) from public.comment_likes where comment_id = 'e0000000-0000-4000-8000-0000000000a1'$q$) = 1
  and public._cnt($q$select count(*) from public.prompt_request_tags where request_id = 'd0000000-0000-4000-8000-0000000000a1'$q$) = 1);
select public._check(7, 'dışarıdan: AÇIK topluluğun (P) içeriğinin beğenisi görünür (açık topluluk herkese okunur)',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000b3'$q$) = 1);
select public._as_user(:erin);
select public._check(8, 'üye (erin, R üyesi): kapalı topluluk içeriğinin beğenilerini, gönderi beğenisini, yorum beğenisini, etiketi görür',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000b1' or request_id = 'd0000000-0000-4000-8000-0000000000b1' or workflow_id = 'c0000000-0000-4000-8000-0000000000b1' or preset_id = 'b0000000-0000-4000-8000-0000000000b1'$q$) = 4
  and public._cnt(format($q$select count(*) from public.prompt_likes where community_post_id = %L$q$, public._g('RPOST'))) = 1
  and public._cnt($q$select count(*) from public.comment_likes where comment_id = 'e0000000-0000-4000-8000-0000000000b1'$q$) = 1
  and public._cnt($q$select count(*) from public.prompt_request_tags where request_id = 'd0000000-0000-4000-8000-0000000000b1'$q$) = 1);
select public._as_user(:carol);
select public._check(9, 'üye olmayan ama BEĞENEN: kendi beğeni satırını hep görür (kalp dolu görünür)',
  public._cnt($q$select count(*) from public.prompt_likes where user_id = '33333333-3333-4333-8333-333333333333'$q$) = 1);
select public._as_user('');
select public._check(10, 'ziyaretçi (oturumsuz): açık içeriğin beğenisini görür, kapalı topluluk içeriğininkini görmez',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 1
  and public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000b1'$q$) = 0);

-- ============================================================================
-- 3. Yazma/sayaç davranışı aynı: üyeler beğenir, sayaçlar doğru, topluluktan çıkan eski beğenisini görmez
-- ============================================================================
reset role;
select public._check(11, 'sayaçlar (SECURITY DEFINER tetikleyici) politikadan etkilenmedi: R prompt like_count = 1, R gönderi like_count = 1',
  (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000b1') = 1
  and (select like_count from public.community_posts where id = public._g('RPOST')) = 1);
set role authenticated;
select public._as_user(:bobby);
select public._check(12, 'yazar (bobby, üye): kendi topluluk içeriğinin beğenisini görür',
  public._cnt($q$select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000b1'$q$) = 1);
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
