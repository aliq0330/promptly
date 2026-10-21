-- "Topluluklarım" rafı: my_community_unseen_counts (docs/history/212-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-unseen.sql  ("FAILED=0" beklenir).
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

create or replace function public._unseen() returns text language sql as
  $$ select coalesce(string_agg(public._lbl(community_id) || '=' || unseen, ',' order by public._lbl(community_id)), '') from public.my_community_unseen_counts() $$;
grant execute on function public._unseen() to public;

set role authenticated;
select public._as_user(:bobby);
select public._check(1, 'bobby: A''da carol''un 1 gönderisi; kendi gönderileri sayılmaz; tamamen kapalı P hiç dönmez', public._unseen() = 'A=1', public._unseen());
select public._as_user(:carol);
select public._check(2, 'carol (A üyesi): bobby''nin 2 gönderisi', public._unseen() = 'A=2', public._unseen());
select public._as_user(:erin);
select public._check(3, 'erin (R + P üyesi): kapalı R sayılır (1), tamamen kapalı P sayılmaz', public._unseen() = 'R=1', public._unseen());
select public._as_user(:carol);
select public.mark_community_posts_seen(array[public._g('p1')]);
select public._check(4, 'görülen gönderi düşer (carol p1''i gördü → A=1)', public._unseen() = 'A=1', public._unseen());
select public._as_user(:dave);
select public._check(5, 'dave (üye değil): boş', public._unseen() = '', public._unseen());
reset role;
insert into public.conversation_members (conversation_id, user_id, role, joined_at) values (public._g('B'), :dave, 'member', now());
set role authenticated;
select public._as_user(:dave);
select public._check(6, 'katılmadan ÖNCEKİ gönderi yeni sayılmaz (dave B''ye sonradan katıldı)', public._unseen() = '', public._unseen());
reset role;
select public._as_user('');
set role anon;
select public._check(7, 'ziyaretçi (anon) çağıramaz', public._try($q$select * from public.my_community_unseen_counts()$q$) like '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
