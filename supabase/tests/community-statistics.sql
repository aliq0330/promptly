-- Topluluk istatistikleri: DB/RLS/RPC testi (docs/history/181-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-statistics.sql  ("FAILED=0" beklenir).
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
select public._mkc('Topluluk A', 'public', array[:bobby, :carol]::uuid[]) as v \gset a_
select public._mkc('Topluluk R', 'restricted', array[:erin, :bobby]::uuid[]) as v \gset r_
insert into public._ctx values ('A', :'a_v'), ('R', :'r_v');
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Normal açık prompt', 'd', 'metin', 'text', 'published', 'public');

set role authenticated;
select public._as_user(:bobby);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-000000000001', :bobby, 'A topluluk prompt', 'd', 'metin', 'text', 'published', 'private', public._g('A')),
  ('a0000000-0000-4000-8000-000000000002', :bobby, 'R topluluk prompt', 'd', 'metin', 'text', 'published', 'private', public._g('R'));
select public._as_user(:carol);
insert into public.prompt_likes (user_id, prompt_id) values (:carol, 'a0000000-0000-4000-8000-000000000001');
insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-000000000001', :carol, 'topluluk yorumu');
select public._as_user(:erin);
insert into public.prompt_likes (user_id, prompt_id) values (:erin, 'a0000000-0000-4000-8000-000000000002');
-- bir başvuru gönderisi (alice'in açık promptu A'ya) ve gönderinin kendi beğenisi/yorumu
select public._as_user(:alice);
select public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-0000000000a1', 'not') as v \gset p_
insert into public._ctx values ('P', :'p_v');
select public._as_user(:bobby);
insert into public.prompt_likes (user_id, community_post_id) values (:bobby, public._g('P'));
insert into public.prompt_comments (community_post_id, author_id, body) values (public._g('P'), :bobby, 'gönderi yorumu');
reset role;

set role authenticated;
select public._as_user(:carol);
select public._check(1, 'topluluk içeriği: üye (yazar değil) beğenenleri görür',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000001', 'likes')) = 1);
select public._check(2, 'topluluk içeriği: üye yorum yapanları görür',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000001', 'comments')) = 1);
select public._as_user(:dave);
select public._check(3, 'herkese açık topluluk içeriği: dışarıdan biri de okuyabildiği için görür',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000001', 'likes')) = 1);
select public._check(4, 'kapalı topluluk içeriği: üye olmayan boş liste alır (varlık sızmaz)',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000002', 'likes')) = 0);
select public._as_user(:erin);
select public._check(5, 'kapalı topluluk içeriği: üye görür',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000002', 'likes')) = 1);
select public._as_user('');
set role anon;
select public._check(6, 'ziyaretçi: kapalı topluluk içeriği boş; herkese açık toplulukta okunur',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000002', 'likes')) = 0
  and (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-000000000001', 'likes')) = 1);
reset role;
set role authenticated;
select public._as_user(:carol);
select public._check(7, 'gönderi: beğenenler ve yorum yapanlar gönderinin KENDİ etkileşimidir (orijinal içeriğinki karışmaz)',
  (select count(*) from public.content_engagers('community_post', public._g('P'), 'likes') where actor_id = :bobby) = 1
  and (select count(*) from public.content_engagers('community_post', public._g('P'), 'likes')) = 1
  and (select count(*) from public.content_engagers('community_post', public._g('P'), 'comments')) = 1
  and (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'likes')) = 0);
select public._check(8, 'gönderi: henüz kimse kaydetmedi → "saves" boş (kaydedenler 184 testinde)',
  (select count(*) from public.content_engagers('community_post', public._g('P'), 'saves')) = 0);
select public._as_user(:erin);
select public._check(9, 'gönderi: topluluğa üye olmayan ama okuyabilen (herkese açık topluluk) gönderinin listesini görür',
  (select count(*) from public.content_engagers('community_post', public._g('P'), 'likes')) = 1);
reset role;
select public._check(10, 'normal içerik: kapalı topluluk kuralı normal herkese açık içeriği etkilemez',
  (select count(*) from public.content_engagers('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'likes')) = 0);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
