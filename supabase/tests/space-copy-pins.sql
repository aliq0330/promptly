-- Köprü ikinci dilim (docs/history/462-*): space_copy_pin_comments + space_copy_items 500 sınırı + panoya kopyalama (dosya ana alanına da girer).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-copy-pins.sql  ("FAILED=0" beklenir; `ERROR:` satırı da olmamalı).
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



-- Kurulum: T (alice sahip, carol düzenleyici → proje lideri, frank projede görüntüleyici), Space sahibi carol; alice düzenleyici, bobby görüntüleyici.
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', '', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :carol, 'editor'), (public._g('T'), :frank, 'member'), (public._g('T'), :bobby, 'member');
set role authenticated;
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view', jsonb_build_array(jsonb_build_object('type','member','id',:frank,'role','view'))) as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak Moodboard') as v \gset f_
select public.team_create_board(:'p_v'::uuid, 'Mutfak Moodboard', :'f_v'::uuid) as v \gset b_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F', :'f_v'), ('B', :'b_v');
insert into public._ctx select 'MAIN', id::text from public.spaces where team_file_id = public._g('F') and team_area_main;

set role authenticated;
select public._as_user(:carol);
select public._set('S', public.create_space('Kaynak', '', 'free', 'private')::text);
select public.invite_space_member(public._g('S'), 'alice', 'editor') as v \gset i1_
select public.invite_space_member(public._g('S'), 'bobby', 'viewer') as v \gset i2_
select public._as_user(:alice); select public.respond_space_invitation(:'i1_v'::uuid, true);
select public._as_user(:bobby); select public.respond_space_invitation(:'i2_v'::uuid, true);
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, body, x, y, created_by) values (public._g('S'), 'note', 'Not 1', 'a', 10, 10, :carol::uuid) returning id as v \gset n1_
insert into public.space_items (space_id, kind, title, body, x, y, created_by) values (public._g('S'), 'note', 'Not 2', 'b', 300, 10, :carol::uuid) returning id as v \gset n2_
insert into public.space_items (space_id, kind, title, body, is_private, created_by) values (public._g('S'), 'note', 'Gizli', 's', true, :carol::uuid) returning id as v \gset n3_
insert into public.space_items (space_id, kind, x, y, w, h, title, data, created_by) values (public._g('S'), 'frame', 0, 0, 500, 300, 'Çerçeve', '{}'::jsonb, :carol::uuid);
insert into public.space_items (space_id, kind, x, y, w, h, data, created_by) values (public._g('S'), 'shape', 5, 5, 100, 60, '{"shape":"rect"}'::jsonb, :carol::uuid);
insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (public._g('S'), :'n1_v'::uuid, :'n2_v'::uuid, :carol::uuid);
-- yorumlar: bobby n1'e, alice yanıtlar; carol serbest yorum yazıp çözer; alice gizli nota yorum yazar
select public._as_user(:bobby);
select public.pin_comment_create(public._g('S'), 'n1 yorumu', 50, 40, :'n1_v'::uuid, 5, 5) as v \gset c1_
select public._as_user(:alice);
select public.pin_comment_create(public._g('S'), 'yanıt', null, null, null, null, null, :'c1_v'::uuid, null) as v \gset c1r_
select public.pin_comment_create(public._g('S'), 'gizli not yorumu', 20, 20, :'n3_v'::uuid, 1, 1) as v \gset c3_
select public._as_user(:carol);
select public.pin_comment_create(public._g('S'), 'serbest yorum', 450, 280) as v \gset c2_
select public.pin_comment_set_resolved(:'c2_v'::uuid, true);
reset role;
select public._set('N1', :'n1_v'); select public._set('N2', :'n2_v');
create function public._notif_total() returns integer language sql security definer as $$ select count(*)::integer from public.notifications $$;
grant execute on function public._notif_total() to public;
select public._set('NOTIF0', public._notif_total()::text);

-- 1-4: panoya kopyalama (dosyanın ana alanına da girer) + çizim/ok
set role authenticated;
select public._as_user(:carol);
select public.space_copy_items(public._g('S'), public._g('B')) as v \gset cp_
select public._check(1, 'kişisel Space → ekip PANOSU: 2 not + çerçeve + şekil kopyalanır (4), gizli not atlanır',
  (:'cp_v'::jsonb ->> 'done')::int = 4 and (:'cp_v'::jsonb -> 'skipped' ->> 'private_note')::int = 1);
select public._check(2, 'panoya yazılan notlar dosyanın ANA ALANINA da asıl öğe olarak girer; çizimler yalnız panoda kalır',
  public._cnt(format($q$select count(*) from public.space_items where space_id = %L and kind = 'note' and file_item_id is null$q$, public._g('MAIN'))) = 2
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L and kind in ('frame','shape')$q$, public._g('MAIN'))) = 0
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L and kind in ('frame','shape')$q$, public._g('B'))) = 2);
select public._check(3, 'iki ucu kopyalanan ok panoda var; lider olduğu için öğeler doğrudan onaylı',
  public._cnt(format($q$select count(*) from public.space_connections where space_id = %L$q$, public._g('B'))) = 1
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L and rev_state <> 'approved'$q$, public._g('MAIN'))) = 0);

-- 5-10: yorum kopyalama
select public.space_copy_pin_comments(public._g('S'), public._g('B'), array(select jsonb_array_elements_text(:'cp_v'::jsonb -> 'old_ids'))::uuid[], array(select jsonb_array_elements_text(:'cp_v'::jsonb -> 'new_ids'))::uuid[]) as v \gset pc_
select public._check(4, 'yorumlar: 2 kök (öğeye bağlı + serbest) ve 1 yanıt kopyalanır; gizli nota bağlı yorum atlanır',
  (:'pc_v'::jsonb ->> 'roots')::int = 2 and (:'pc_v'::jsonb ->> 'replies')::int = 1 and (:'pc_v'::jsonb ->> 'skipped_private')::int = 1);
select public._check(5, 'özgün yazarlar, çözüldü durumu ve öğe eşlemesi korunur (yeni not kimliğine bağlanır)',
  public._cnt(format($q$select count(*) from public.space_pin_comments where space_id = %L and parent_id is null and body = 'n1 yorumu' and author_id = %L and item_id is not null$q$, public._g('B'), :bobby)) = 1
  and public._cnt(format($q$select count(*) from public.space_pin_comments where space_id = %L and body = 'serbest yorum' and author_id = %L and resolved_at is not null and item_id is null$q$, public._g('B'), :carol)) = 1
  and public._cnt(format($q$select count(*) from public.space_pin_comments y join public.space_pin_comments k on k.id = y.parent_id where y.space_id = %L and y.body = 'yanıt' and y.author_id = %L and k.body = 'n1 yorumu'$q$, public._g('B'), :alice)) = 1);
select public._check(6, 'gizli nota bağlı yorumun metni hedefte hiçbir yerde yok', public._cnt(format($q$select count(*) from public.space_pin_comments where space_id = %L and body like 'gizli not%%'$q$, public._g('B'))) = 0);
reset role;
select public._check(7, 'hiçbir bildirim üretilmedi', public._notif_total() = (select v::int from public._ctx where k = 'NOTIF0'));
set role authenticated;
select public._as_user(:carol);
select public._check(8, 'kopyalanan yorum ekip panosunda görünür (çağıran okuyabilir)', public._cnt(format($q$select count(*) from public.space_pin_comments where space_id = %L$q$, public._g('B'))) = 3);

-- 9-12: yetki ve sınırlar
select public._check(9, 'hedef dosyanın ANA ALANI olamaz (pano değil)', public._try(format($q$select public.space_copy_pin_comments(%L, %L)$q$, public._g('S'), public._g('MAIN'))) like '%space_invalid%');
select public._check(10, 'eşleme dizileri uyuşmazsa reddedilir', public._try(format($q$select public.space_copy_pin_comments(%L, %L, array[%L]::uuid[], '{}'::uuid[])$q$, public._g('S'), public._g('B'), public._g('N1'))) like '%space_invalid%');
select public._as_user(:frank);
select public._check(11, 'projede görüntüleyici hedefe yazamaz; kaynağı okuyamayan da', public._try(format($q$select public.space_copy_pin_comments(%L, %L)$q$, public._g('S'), public._g('B'))) like '%space_not_found%');
select public._as_user(:bobby);
select public._check(12, 'Space görüntüleyicisi okur ama ekip panosuna yazamaz (proje üyesi değil)', public._try(format($q$select public.space_copy_pin_comments(%L, %L)$q$, public._g('S'), public._g('B'))) like '%space_forbidden%');

-- 13-14: seçimle kopyalama yalnız eşlenen öğelerin yorumunu alır; 500 sınırı
select public._as_user(:carol);
select public._set('D', public.create_space('Hedef', '', 'free', 'private')::text);
select public.space_copy_items(public._g('S'), public._g('D'), array[public._g('N1')]) as v \gset sc_
select public.space_copy_pin_comments(public._g('S'), public._g('D'), array(select jsonb_array_elements_text(:'sc_v'::jsonb -> 'old_ids'))::uuid[], array(select jsonb_array_elements_text(:'sc_v'::jsonb -> 'new_ids'))::uuid[], false) as v \gset sp_
select public._check(13, 'seçimle kopyalama (p_floating=false): yalnız seçilen notun yorumu + yanıtı gelir; serbest yorum gelmez',
  (:'sp_v'::jsonb ->> 'roots')::int = 1 and (:'sp_v'::jsonb ->> 'replies')::int = 1);
reset role;
insert into public.space_items (space_id, kind, title, body, x, y, created_by) select public._g('S'), 'note', 'toplu ' || g, '', g, g, :carol::uuid from generate_series(1, 300) g;
set role authenticated;
select public._as_user(:carol);
select public._set('BIG', public.create_space('Büyük hedef', '', 'free', 'private')::text);
select public.space_copy_items(public._g('S'), public._g('BIG')) as v \gset bg_
select public._check(14, 'bir çağrıda 200 değil 500 öğeye kadar kopyalanır (305 öğe, 1 gizli → 304)', (:'bg_v'::jsonb ->> 'done')::int = 304);
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
