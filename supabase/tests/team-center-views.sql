-- Ekip "Merkez" görünümleri (docs/history/366-*): team_review_board · team_recent_activity · team_member_project_roles.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-center-views.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set hank  '''88888888-8888-4888-8888-888888888888'''
\set zed   '''99999999-9999-4999-8999-999999999999'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:carol,'carol'),(:dave,'dave'),(:frank,'frank'),(:hank,'hank'),(:zed,'zed')) as u(id, name);

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
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text) to public;

-- Kurulum: T (alice sahip, carol düzenleyici → proje lideri, dave düzenleyici, frank görüntüleyici, hank projesiz üye, zed ekip dışı).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Gül', '', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'), (public._g('T'), :frank, 'member'), (public._g('T'), :hank, 'member');
set role authenticated;
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view', jsonb_build_array(
  jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:frank,'role','view'))) as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak') as v \gset f1_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F1', :'f1_v');
insert into public._ctx select 'A1', id::text from public.spaces where team_file_id = public._g('F1') and team_area_main;

-- Öğeler: dave 4 not ekler; n1 bekliyor, n2 değişiklik istendi, n3 onaylandı, n4 taslak kalır.
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Not bir', 'a', :dave::uuid) returning id as v \gset n1_
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Not iki', 'b', :dave::uuid) returning id as v \gset n2_
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Not üç', 'c', :dave::uuid) returning id as v \gset n3_
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Not dört', 'd', :dave::uuid) returning id as v \gset n4_
select public.team_review_submit(array[:'n1_v'::uuid, :'n2_v'::uuid, :'n3_v'::uuid]);
select public._as_user(:carol);
select public.team_review_decide(array[:'n2_v'::uuid], 'changes', 'Daha kısa yaz');
select public.team_review_decide(array[:'n3_v'::uuid], 'approve', '');
reset role;

-- ============================================================================================================================================
-- 1) team_review_board
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
select public.team_review_board(public._g('T')) as v \gset b1_
select public._check(1, 'lider panoda bekleyen + değişiklik + bugün onaylananı görür (3 öğe)', jsonb_array_length(:'b1_v'::jsonb -> 'items') = 3);
select public._check(2, 'taslak (n4) panoya GİRMEZ', not exists (select 1 from jsonb_array_elements(:'b1_v'::jsonb -> 'items') e where e ->> 'title' = 'Not dört'));
select public._check(3, 'lider için can_decide true', (select bool_and((e ->> 'can_decide')::boolean) from jsonb_array_elements(:'b1_v'::jsonb -> 'items') e));
select public._check(4, 'durumlar: 1 bekliyor, 1 değişiklik, 1 onaylı', (select count(*) from jsonb_array_elements(:'b1_v'::jsonb -> 'items') e where e ->> 'state' = 'pending') = 1
  and (select count(*) from jsonb_array_elements(:'b1_v'::jsonb -> 'items') e where e ->> 'state' = 'changes') = 1
  and (select count(*) from jsonb_array_elements(:'b1_v'::jsonb -> 'items') e where e ->> 'state' = 'approved') = 1);
select public._check(5, 'satırda proje/dosya/yazar bilgisi var', (select bool_and(e ->> 'project_title' = 'Villa' and e ->> 'file_title' = 'Mutfak' and e ->> 'author_username' = 'dave') from jsonb_array_elements(:'b1_v'::jsonb -> 'items') e));
select public._as_user(:dave);
select public.team_review_board(public._g('T')) as v \gset b2_
select public._check(6, 'ekleyen yalnız KENDİ öğelerini görür, can_decide false', jsonb_array_length(:'b2_v'::jsonb -> 'items') = 3
  and (select not bool_or((e ->> 'can_decide')::boolean) from jsonb_array_elements(:'b2_v'::jsonb -> 'items') e));
select public._as_user(:frank);
select public.team_review_board(public._g('T')) as v \gset b3_
select public._check(7, 'görüntüleyici başkasının öğelerini GÖRMEZ', jsonb_array_length(:'b3_v'::jsonb -> 'items') = 0);
select public._as_user(:hank);
select public.team_review_board(public._g('T')) as v \gset b4_
select public._check(8, 'projesi olmayan üye boş pano görür', jsonb_array_length(:'b4_v'::jsonb -> 'items') = 0);
select public._as_user(:zed);
select public._check(9, 'ekip dışı çağıramaz', public._try(format($$select public.team_review_board(%L)$$, public._g('T'))) like '%team_not_found%');
select public._as_user('');
reset role;
set role anon;
select public._check(10, 'ziyaretçi çağıramaz', public._try(format($$select public.team_review_board(%L)$$, public._g('T'))) like '%permission denied%');
reset role;

-- ============================================================================================================================================
-- 2) team_recent_activity
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
select public.team_recent_activity(public._g('T'), 30) as v \gset a1_
select public._check(11, 'lider: eklenen öğe etkinliği var', exists (select 1 from jsonb_array_elements(:'a1_v'::jsonb) e where e ->> 'kind' = 'added' and e ->> 'title' = 'Not bir'));
select public._check(12, 'lider: onaylanan + değişiklik istenen etkinliği', exists (select 1 from jsonb_array_elements(:'a1_v'::jsonb) e where e ->> 'kind' = 'approved' and e ->> 'title' = 'Not üç' and e ->> 'actor_name' = 'Carol')
  and exists (select 1 from jsonb_array_elements(:'a1_v'::jsonb) e where e ->> 'kind' = 'changes' and e ->> 'title' = 'Not iki'));
select public._check(13, 'taslak etkinlik üretmez', not exists (select 1 from jsonb_array_elements(:'a1_v'::jsonb) e where e ->> 'title' = 'Not dört'));
select public._check(14, 'dosya açılışı ve üye katılımı etkinliği var', exists (select 1 from jsonb_array_elements(:'a1_v'::jsonb) e where e ->> 'kind' = 'file' and e ->> 'title' = 'Mutfak')
  and exists (select 1 from jsonb_array_elements(:'a1_v'::jsonb) e where e ->> 'kind' = 'joined'));
select public._as_user(:frank);
select public.team_recent_activity(public._g('T'), 30) as v \gset a2_
select public._check(15, 'görüntüleyici BEKLEYEN öğenin etkinliğini görmez, onaylıyı görür', not exists (select 1 from jsonb_array_elements(:'a2_v'::jsonb) e where e ->> 'title' = 'Not bir')
  and exists (select 1 from jsonb_array_elements(:'a2_v'::jsonb) e where e ->> 'kind' = 'approved' and e ->> 'title' = 'Not üç'));
select public._as_user(:hank);
select public.team_recent_activity(public._g('T'), 30) as v \gset a3_
select public._check(16, 'projesi olmayan üye proje etkinliği görmez (yalnız katılım)', not exists (select 1 from jsonb_array_elements(:'a3_v'::jsonb) e where e ->> 'kind' <> 'joined'));
select public._check(17, 'sınır: p_limit 2 → en çok 2 satır', jsonb_array_length(public.team_recent_activity(public._g('T'), 2)) = 2);
select public._as_user(:zed);
select public._check(18, 'ekip dışı çağıramaz', public._try(format($$select public.team_recent_activity(%L, 5)$$, public._g('T'))) like '%team_not_found%');
select public._as_user('');
reset role;
set role anon;
select public._check(19, 'ziyaretçi çağıramaz', public._try(format($$select public.team_recent_activity(%L, 5)$$, public._g('T'))) like '%permission denied%');
reset role;

-- ============================================================================================================================================
-- 3) team_member_project_roles
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(20, 'sahip: kendisi 1 projede lider (örtük)', (select lead_count from public.team_member_project_roles(public._g('T')) where user_id = :alice::uuid) = 1);
select public._check(21, 'carol 1 projede lider, dave 1 düzenleyici, frank 1 görüntüleyici', (select lead_count from public.team_member_project_roles(public._g('T')) where user_id = :carol::uuid) = 1
  and (select edit_count from public.team_member_project_roles(public._g('T')) where user_id = :dave::uuid) = 1
  and (select view_count from public.team_member_project_roles(public._g('T')) where user_id = :frank::uuid) = 1);
select public._check(22, 'projesi olmayan hank hepsi 0 (satır yine döner)', (select lead_count + edit_count + view_count from public.team_member_project_roles(public._g('T')) where user_id = :hank::uuid) = 0);
select public._as_user(:hank);
select public._check(23, 'projeyi göremeyen çağıran başkasının rolünü SAYAMAZ (hepsi 0)', (select coalesce(sum(lead_count + edit_count + view_count), 0) from public.team_member_project_roles(public._g('T'))) = 0);
select public._as_user(:zed);
select public._check(24, 'ekip dışı çağıramaz', public._try(format($$select * from public.team_member_project_roles(%L)$$, public._g('T'))) like '%team_not_found%');
select public._as_user('');
reset role;
set role anon;
select public._check(25, 'ziyaretçi çağıramaz', public._try(format($$select * from public.team_member_project_roles(%L)$$, public._g('T'))) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
