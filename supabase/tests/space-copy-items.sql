-- Space ↔ Space ↔ ekip dosyası köprüsü (docs/history/461-*): space_copy_items — kopyalar, kayıpları sayar, yetkiyi çağıranın RLS'i belirler.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-copy-items.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:frank,'frank'),(:gina,'gina'),(:hank,'hank')) as u(id, name);

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
create or replace function public._set(key text, val text) returns void language sql as $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._set(text, text) to public;
create or replace function public._state(i uuid) returns text language sql security definer as $$ select rev_state from public.space_items where id = i $$;
create or replace function public._aud(act text) returns integer language sql security definer as $$ select count(*)::integer from public.team_audit where team_id = public._g('T') and action = act $$;
grant execute on function public._state(uuid), public._aud(text) to public;


-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici → proje lideri, dave düzenleyici, frank görüntüleyici).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', '', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'), (public._g('T'), :frank, 'member');
set role authenticated;
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view', jsonb_build_array(
  jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:frank,'role','view'))) as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak') as v \gset f1_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F1', :'f1_v');
insert into public._ctx select 'A1', id::text from public.spaces where team_file_id = public._g('F1') and team_area_main;

-- alice'in kişisel Space'i: not, gizli not, taslak prompt, palet, çizim, grup, ok.
set role authenticated;
select public._as_user(:alice);
select public._set('S', public.create_space('Kaynak', '', 'free', 'private')::text);
insert into public.space_groups (space_id, name, color, created_by) values (public._g('S'), 'Mutfak grubu', 'primary', :alice::uuid) returning id as v \gset gr_
insert into public.space_items (space_id, kind, title, body, x, y, group_id, created_by) values (public._g('S'), 'note', 'Not A', 'gövde A', 10, 10, :'gr_v'::uuid, :alice::uuid) returning id as v \gset nA_
insert into public.space_items (space_id, kind, title, body, x, y, created_by) values (public._g('S'), 'note', 'Not B', 'gövde B', 300, 10, :alice::uuid) returning id as v \gset nB_
insert into public.space_items (space_id, kind, title, body, is_private, created_by) values (public._g('S'), 'note', 'Gizli', 'sır', true, :alice::uuid) returning id as v \gset nP_
insert into public.space_items (space_id, kind, title, body, is_draft, created_by) values (public._g('S'), 'prompt', 'Taslak prompt', 'bir prompt', true, :alice::uuid) returning id as v \gset pr_
insert into public.space_items (space_id, kind, x, y, w, h, data, created_by) values (public._g('S'), 'shape', 0, 0, 100, 60, '{"shape":"rect"}'::jsonb, :alice::uuid) returning id as v \gset sh_
insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (public._g('S'), :'nA_v'::uuid, :'nB_v'::uuid, :alice::uuid);
reset role;
select public._set('NA', :'nA_v'); select public._set('NB', :'nB_v'); select public._set('NP', :'nP_v'); select public._set('PR', :'pr_v'); select public._set('SH', :'sh_v');

-- 1-6: kişisel → kişisel
set role authenticated;
select public._as_user(:alice);
select public._set('D', public.create_space('Hedef', '', 'free', 'private')::text);
select public.space_copy_items(public._g('S'), public._g('D')) as v \gset c1_
select public._check(1, 'kişisel → kişisel: not, taslak prompt ve çizim kopyalanır; gizli not atlanır',
  (:'c1_v'::jsonb ->> 'done')::int = 4
  and (:'c1_v'::jsonb -> 'skipped' ->> 'private_note')::int = 1);
select public._check(2, 'kopyalanan notun içeriği ve konumu korunur; kaynak yerinde kalır',
  public._cnt(format($q$select count(*) from public.space_items where space_id = %L and kind = 'note' and title in ('Not A','Not B') and body like 'gövde %%'$q$, public._g('D'))) = 2
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L$q$, public._g('S'))) = 5);
select public._check(3, 'grup adıyla kopyalanır ve öğe yeni gruba bağlanır',
  public._cnt(format($q$select count(*) from public.space_items i join public.space_groups g on g.id = i.group_id where i.space_id = %L and g.space_id = %L and g.name = 'Mutfak grubu'$q$, public._g('D'), public._g('D'))) = 1);
select public._check(4, 'iki ucu da kopyalanan ok kopyalanır',
  public._cnt(format($q$select count(*) from public.space_connections where space_id = %L$q$, public._g('D'))) = 1);
select public._check(5, 'aynı öğeler hedefte ikinci kez de kopyalanır (not/çizim tekil değil)',
  (public.space_copy_items(public._g('S'), public._g('D'), array[public._g('NA'), public._g('NB')]) ->> 'done')::int = 2);

-- 7-9: yetki
select public._as_user(:dave);
select public._check(7, 'üye olmayan kaynağı okuyamaz → space_not_found', public._try(format($q$select public.space_copy_items(%L, %L)$q$, public._g('S'), public._g('D'))) like '%space_not_found%');
select public._as_user(:alice);
select public._check(8, 'hedefe yazamayan (görüntüleyici) reddedilir; kendine kopyalama reddedilir',
  public._try(format($q$select public.space_copy_items(%L, %L)$q$, public._g('S'), public._g('S'))) like '%space_invalid%');
select public._try(format($q$select public.invite_space_member(%L, 'carol', 'viewer')$q$, public._g('D')));
reset role;

-- 9-12: kişisel → ekip dosyası (carol lider: asıl alanına kopyalar; çizim atlanır)
set role authenticated;
select public._as_user(:carol);
select public._set('S2', public.create_space('Carol kaynak', '', 'free', 'private')::text);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('S2'), 'note', 'Carol notu', 'x', :carol::uuid);
insert into public.space_items (space_id, kind, x, y, w, h, data, created_by) values (public._g('S2'), 'shape', 0, 0, 100, 60, '{"shape":"rect"}'::jsonb, :carol::uuid);
select public.space_copy_items(public._g('S2'), public._g('A1')) as v \gset c2_
select public._check(9, 'kişisel → ekip dosyası asıl alanı: not kopyalanır, çizim nesnesi atlanır (yalnız panoya aittir)',
  (:'c2_v'::jsonb ->> 'done')::int = 1 and (:'c2_v'::jsonb -> 'skipped' ->> 'drawing_in_file')::int = 1);
select public._check(10, 'ekip alanına kopyalanan not lider tarafından doğrudan onaylıdır',
  public._cnt(format($q$select count(*) from public.space_items where space_id = %L and title = 'Carol notu' and rev_state = 'approved'$q$, public._g('A1'))) = 1);
select public._as_user(:frank);
select public._check(11, 'projede görüntüleyici ekip dosyasına kopyalayamaz',
  public._try(format($q$select public.space_copy_items(%L, %L)$q$, public._g('S'), public._g('A1'))) <> 'ok');
reset role;

-- 12-13: ekip dosyası → kişisel (dave düzenleyici: taslak notu yalnız kendisi görür; kopya kişisel Space'te onaylı)
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Dave taslağı', 'd', :dave::uuid);
select public._set('S3', public.create_space('Dave kopya', '', 'free', 'private')::text);
select public.space_copy_items(public._g('A1'), public._g('S3')) as v \gset c3_
select public._check(12, 'ekip dosyası → kişisel Space: görünen öğeler kopyalanır (onaylı not + kendi taslağı), onay durumu taşınmaz',
  (:'c3_v'::jsonb ->> 'done')::int = 2
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L and rev_state <> 'approved'$q$, public._g('S3'))) = 0);
select public._as_user(:frank);
select public._set('S4', public.create_space('Frank kopya', '', 'free', 'private')::text);
select public.space_copy_items(public._g('A1'), public._g('S4')) as v \gset c4_
select public._check(13, 'görüntüleyici başkasının taslağını göremez, dolayısıyla kopyalayamaz',
  public._cnt(format($q$select count(*) from public.space_items where space_id = %L and title = 'Dave taslağı'$q$, public._g('S4'))) = 0);
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
