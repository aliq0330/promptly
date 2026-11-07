-- Ekip alanı, Ekipler başlığı: list_my_teams (docs/history/349-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/teams-home.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank'),(:gina,'gina')) as u(id, name);

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
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
-- RLS'e takılmadan (süper kullanıcı gözüyle) tek değer okur: yalnızca DOĞRULAMA içindir.
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
create or replace function public._rows(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q; get diagnostics r = row_count; return r; exception when others then return -1; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text), public._rows(text) to public;

-- Topluluk kurar (sahip alice), davetlileri kabul ettirir.
create or replace function public._mkc(p_name text, p_level text, p_members uuid[]) returns uuid language plpgsql as $$
declare v_gid uuid; v_u uuid;
begin
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  v_gid := (public.create_community(p_name, 'açıklama', p_level, null, 100, p_members, 'general', 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array p_members loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  return v_gid;
end $$;



-- T1: ekip (private; alice sahip; bobby, carol üye) + 2 Space (biri arşivli). P: herkese açık topluluk. R: kapalı (restricted). T2: başka ekip (alice üye değil).
select public._mkc('Ekip Bir', 'private', array[:bobby, :carol]::uuid[]) as v \gset t_
select public._mkc('Açık P', 'public', array[:bobby]::uuid[]) as v \gset p_
select public._mkc('Kapalı R', 'restricted', array[:bobby]::uuid[]) as v \gset r_
insert into public._ctx values ('T', :'t_v'), ('P', :'p_v'), ('R', :'r_v');
select public._as_user(:dave);
select (public.create_community('Dave Ekibi', 'açıklama', 'private', null, 100, array[]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id')::uuid as v \gset d_
insert into public._ctx values ('D', :'d_v');
select public._as_user(:alice);
set role authenticated;
select public.create_team_space(public._g('T'), 'Kütüphane', '', 'team_library') as v \gset s1_
select public.create_team_space(public._g('T'), 'Eski pano', '', 'moodboard') as v \gset s2_
reset role;
update public.spaces set archived_at = now() where id = :'s2_v';

-- 1) Üye olduğum ekipler -----------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public._check(1, 'yalnız tamamen kapalı (ekip) ve ÜYE olduğum topluluk listelenir; açık ve kapalı topluluk listelenmez',
  (select count(*) from public.list_my_teams()) = 1 and (select id from public.list_my_teams()) = public._g('T'));
select public._check(2, 'Space sayısı arşivli Space’i saymaz', (select space_count from public.list_my_teams()) = 1);
select public._check(3, 'sahip rolü ve üye sayısı doğru', (select my_role from public.list_my_teams()) = 'owner' and (select member_count from public.list_my_teams()) = 3);
select public._as_user(:bobby);
select public._check(4, 'ekip üyesi de görür; rolü üye/üye', (select count(*) from public.list_my_teams()) = 1 and (select space_count from public.list_my_teams()) = 1);
select public._as_user(:frank);
select public._check(5, 'hiçbir ekibe üye olmayan boş liste alır (ekibin varlığı sızmaz)', (select count(*) from public.list_my_teams()) = 0);
select public._as_user(:dave);
select public._check(6, 'başka ekibin üyesi yalnız kendi ekibini görür', (select count(*) from public.list_my_teams()) = 1 and (select id from public.list_my_teams()) = public._g('D'));
reset role;

-- 2) Üyelik değişince liste değişir ---------------------------------------------------------------------------------------------------------
select public._as_user(:alice);
set role authenticated;
select public.remove_chat_group_member(public._g('T'), :carol);
reset role;
select public._as_user(:carol);
set role authenticated;
select public._check(7, 'çıkarılan üye ekibi artık listede görmez', (select count(*) from public.list_my_teams()) = 0);
reset role;

-- 3) Sayfalama ve sınır --------------------------------------------------------------------------------------------------------------------
select public._as_user(:alice);
set role authenticated;
select public._check(8, 'p_limit/p_offset: offset ekip sayısını aşınca boş', (select count(*) from public.list_my_teams(30, 5)) = 0 and (select count(*) from public.list_my_teams(1, 0)) = 1);
reset role;

-- 4) Anon -----------------------------------------------------------------------------------------------------------------------------------
set role anon;
select public._as_user('');
select public._check(9, 'anon list_my_teams çağıramaz', public._try('select * from public.list_my_teams()') like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
