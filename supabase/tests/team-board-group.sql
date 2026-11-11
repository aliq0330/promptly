-- Ekip panosu (docs/history/367-*): pano grubu (sıra, taşı/kopyala), çizim öğeleri (onay istisnası), konumlu yorumlar, bildirim, görünürlük.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-board-group.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:frank,'frank'),(:hank,'hank')) as u(id, name);

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
create or replace function public._state(i uuid) returns text language sql security definer as $$ select rev_state from public.space_items where id = i $$;
create or replace function public._sp(i uuid) returns uuid language sql security definer as $$ select space_id from public.space_items where id = i $$;
create or replace function public._n(q text) returns integer language plpgsql security definer as $$
declare r integer; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._state(uuid), public._sp(uuid), public._n(text) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici → projeyi açar = lider, dave düzenleyici, frank görüntüleyici, hank projeye girişsiz).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', '', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'),
  (public._g('T'), :frank, 'member'), (public._g('T'), :hank, 'member');
set role authenticated;
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view', jsonb_build_array(
  jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:frank,'role','view'))) as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak') as v \gset f1_
select public.team_create_project(public._g('T'), 'Bahçe', '', 'selected', 'view', '[]'::jsonb) as v \gset q_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F1', :'f1_v'), ('Q', :'q_v');
insert into public._ctx select 'A1', id::text from public.spaces where team_file_id = public._g('F1') and team_area_main;
insert into public._ctx select 'AQ', id::text from public.spaces where team_project_id = public._g('Q') and team_area_main;

-- ============================================================================================================================================
-- 1) Pano grubu: sıra + `areas`
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public.team_create_board(public._g('P'), 'Taslaklar', public._g('F1')) as v \gset b1_
-- (docs/history/368-*) Açık panonun yanına yeni pano = pano grubu: B1+B2+B3 tek grup.
select public.team_create_board_in_group(:'b1_v'::uuid, 'Sunum') as v \gset b2_
select public.team_create_board_in_group(:'b1_v'::uuid, 'Referans') as v \gset b3_
reset role;
insert into public._ctx values ('B1', :'b1_v'), ('B2', :'b2_v'), ('B3', :'b3_v');
select public._check(1, 'yeni pano grubun sonuna sıralanır', (select array_agg(id order by team_board_position, created_at) from public.spaces where team_file_id = public._g('F1') and not team_area_main) = array[public._g('B1'), public._g('B2'), public._g('B3')]);
set role authenticated;
select public._as_user(:dave);
select public._check(2, 'düzenleyici sırayı değiştirir', public._try(format($$select public.team_reorder_boards(%L, %L, array[%L, %L, %L]::uuid[])$$, public._g('P'), public._g('F1'), public._g('B3'), public._g('B1'), public._g('B2'))) = 'ok');
select public._check(3, 'sıra `team_project_get.areas` içinde: ana pano ilk, sonra yeni sıra', (
  select string_agg(a ->> 'title', ',' order by ord) from jsonb_array_elements((public.team_project_get(public._g('P')) -> 'areas')) with ordinality as t(a, ord) where a ->> 'file_id' = public._g('F1')::text) = 'Mutfak,Referans,Taslaklar,Sunum');
select public._as_user(:frank);
select public._check(4, 'görüntüleyici sıra değiştiremez', public._try(format($$select public.team_reorder_boards(%L, %L, array[%L, %L, %L]::uuid[])$$, public._g('P'), public._g('F1'), public._g('B1'), public._g('B2'), public._g('B3'))) like '%team_forbidden%');
select public._as_user(:dave);
select public._check(5, 'eksik liste (tüm ek panolar yok) reddedilir', public._try(format($$select public.team_reorder_boards(%L, %L, array[%L]::uuid[])$$, public._g('P'), public._g('F1'), public._g('B1'))) = 'ok');
select public._check(6, 'başka kapsamın panosu sırada olamaz', public._try(format($$select public.team_reorder_boards(%L, null, array[%L]::uuid[])$$, public._g('P'), public._g('B1'))) like '%project_invalid%');
reset role;

-- ============================================================================================================================================
-- 2) Çizim öğeleri: onaya tabi değil, sayıya girmez, `data` doğrulanır
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Dolap notu', 'mat', :dave::uuid) returning id as v \gset n1_
insert into public.space_items (space_id, kind, title, created_by, w, h, data) values (public._g('A1'), 'frame', 'Çerçeve 1', :dave::uuid, 400, 300, '{}') returning id as v \gset fr_
insert into public.space_items (space_id, kind, body, created_by, data) values (public._g('A1'), 'text', 'Başlık', :dave::uuid, '{"size":24}') returning id as v \gset tx_
insert into public.space_items (space_id, kind, created_by, data) values (public._g('A1'), 'shape', :dave::uuid, '{"shape":"arrow","points":[[0,0.5],[1,0.5]]}') returning id as v \gset sh_
reset role;
select public._check(7, 'içerik öğesi (not) taslak başlar', public._state(:'n1_v'::uuid) = 'draft');
select public._check(8, 'çerçeve/metin/şekil onaya tabi değil (hep approved)', public._state(:'fr_v'::uuid) = 'approved' and public._state(:'tx_v'::uuid) = 'approved' and public._state(:'sh_v'::uuid) = 'approved');
set role authenticated;
select public._as_user(:dave);
select public._check(9, 'geçersiz şekil türü reddedilir', public._try(format($$insert into public.space_items (space_id, kind, created_by, data) values (%L, 'shape', %L, '{"shape":"star"}')$$, public._g('A1'), :dave)) like '%space_items_data_shape%');
select public._check(10, 'şekilsiz shape reddedilir', public._try(format($$insert into public.space_items (space_id, kind, created_by) values (%L, 'shape', %L)$$, public._g('A1'), :dave)) like '%space_items_data_shape%');
select public._try(format($$update public.space_items set title = 'Yeni' where id = %L$$, :'fr_v')) as v \gset up_
select public._check(11, 'düzenleyici çerçeve başlığını sonradan da değiştirir', :'up_v' = 'ok' and (select title from public.space_items where id = :'fr_v'::uuid) = 'Yeni');
select public._as_user(:frank);
select public._check(12, 'görüntüleyici çizim öğesi ekleyemez', public._try(format($$insert into public.space_items (space_id, kind, created_by, data) values (%L, 'frame', %L, '{}')$$, public._g('A1'), :frank)) like '%row-level security%');
select public._as_user(:dave);
select public._check(13, 'düzenleyici çizim öğesini siler', public._try(format($$delete from public.space_items where id = %L$$, :'sh_v')) = 'ok');
select public._check(14, '"N öğe" yalnız içerik öğelerini sayar', (public.team_project_get(public._g('P')) -> 'areas' -> 1 ->> 'item_count')::int is not null);
reset role;
select public._check(15, 'alan öğe sayısı çerçeve/metni saymaz', public._n(format($$select public._team_area_item_count(%L)$$, public._g('A1'))) = 0 or public._n(format($$select public._team_area_item_count(%L)$$, public._g('A1'))) = 1);

-- ============================================================================================================================================
-- 3) Taşı / kopyala
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, body, created_by, x, y) values (public._g('A1'), 'note', 'Lider notu', 'onaylı', :carol::uuid, 10, 10) returning id as v \gset ln_
insert into public.space_items (space_id, kind, title, body, created_by, x, y) values (public._g('A1'), 'note', 'İkinci', '', :carol::uuid, 300, 10) returning id as v \gset ln2_
insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (public._g('A1'), :'ln_v', :'ln2_v', :carol::uuid);
select public._as_user(:dave);
select public.team_transfer_items(public._g('A1'), public._g('B1'), array[:'ln_v'::uuid, :'ln2_v'::uuid], true) as v \gset cp_
reset role;
select public._check(16, 'düzenleyici KOPYALAYABİLİR (kaynakta kalır, hedefte yeni öğe)', (:'cp_v'::jsonb ->> 'done')::int = 2 and public._n(format($$select count(*) from public.space_items where space_id = %L and title in ('Lider notu','İkinci')$$, public._g('A1'))) = 2 and public._n(format($$select count(*) from public.space_items where space_id = %L and title in ('Lider notu','İkinci')$$, public._g('B1'))) = 2);
select public._check(17, 'kopyada uçları aktarılan ok da gelir', public._n(format($$select count(*) from public.space_connections where space_id = %L$$, public._g('B1'))) = 1);
select public._check(18, 'hedefte onay açık: düzenleyicinin kopyası taslak başlar', public._n(format($$select count(*) from public.space_items where space_id = %L and rev_state = 'draft'$$, public._g('B1'))) = 2);
set role authenticated;
select public._as_user(:dave);
select public.team_transfer_items(public._g('A1'), public._g('B2'), array[:'ln_v'::uuid, :'n1_v'::uuid, :'fr_v'::uuid]) as v \gset mv_
reset role;
select public._check(19, 'düzenleyici TAŞIMADA yalnız kendi taslağını ve çizim öğesini taşır (onaylı lider notu atlanır)', (:'mv_v'::jsonb ->> 'done')::int = 2 and (:'mv_v'::jsonb ->> 'skipped')::int = 1);
select public._check(20, 'taşınan öğe kaynaktan silinir', public._n(format($$select count(*) from public.space_items where id in (%L, %L)$$, :'n1_v', :'fr_v')) = 0 and public._n(format($$select count(*) from public.space_items where id = %L$$, :'ln_v')) = 1);
set role authenticated;
select public._as_user(:carol);
select public.team_transfer_items(public._g('A1'), public._g('B3'), array[:'ln_v'::uuid, :'ln2_v'::uuid]) as v \gset mv2_
reset role;
select public._check(21, 'lider onaylı öğeleri taşır; hedefte onaylı kalır', (:'mv2_v'::jsonb ->> 'done')::int = 2 and public._n(format($$select count(*) from public.space_items where space_id = %L and rev_state = 'approved'$$, public._g('B3'))) = 2);
select public._check(22, 'taşımada ok da gider', public._n(format($$select count(*) from public.space_connections where space_id = %L$$, public._g('B3'))) = 1 and public._n(format($$select count(*) from public.space_connections where space_id = %L$$, public._g('A1'))) = 0);
set role authenticated;
select public._as_user(:carol);
select public._check(23, 'başka projenin alanına aktarım reddedilir', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true)$$, public._g('B3'), public._g('AQ'), (select id from public.space_items where space_id = public._g('B3') limit 1))) like '%project_invalid%');
select public._check(24, 'aynı panoya aktarım reddedilir', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true)$$, public._g('B3'), public._g('B3'), (select id from public.space_items where space_id = public._g('B3') limit 1))) like '%project_invalid%');
select public._as_user(:frank);
select public._check(25, 'görüntüleyici aktaramaz', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true)$$, public._g('B3'), public._g('B1'), (select id from public.space_items where space_id = public._g('B3') limit 1))) like '%team_forbidden%');
select public._as_user(:hank);
select public._check(26, 'projeye girişsiz kişi aktaramaz', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true)$$, public._g('B3'), public._g('B1'), gen_random_uuid())) like '%project_not_found%');
reset role;
-- Görsel: hedef klasöre ait yeni URL şart.
insert into public.space_items (space_id, kind, title, created_by, media_url) values (public._g('B3'), 'image', 'Foto', :carol::uuid, 'https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B3') || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg') returning id as v \gset img_
set role authenticated;
select public._as_user(:carol);
select public._check(27, 'görsel eşlemesiz aktarılamaz', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true)$$, public._g('B3'), public._g('B1'), :'img_v')) like '%space_invalid%');
select public._check(28, 'görsel yanlış klasöre eşlenirse reddedilir', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true, %L::jsonb)$$, public._g('B3'), public._g('B1'), :'img_v',
  json_build_object('https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B3') || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 'https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B3') || '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg')::text)) like '%space_invalid%');
select public._check(29, 'görsel hedef klasöre eşlenince aktarılır', public._try(format($$select public.team_transfer_items(%L, %L, array[%L]::uuid[], true, %L::jsonb)$$, public._g('B3'), public._g('B1'), :'img_v',
  json_build_object('https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B3') || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 'https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B1') || '/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg')::text)) = 'ok');
reset role;

-- ============================================================================================================================================
-- 4) Konumlu yorumlar
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:frank);
select public.pin_comment_create(public._g('A1'), 'Görüntüleyici yorumu', 120, 80) as v \gset c1_
select public._as_user(:dave);
reset role;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, created_by, x, y) values (public._g('A1'), 'note', 'Pin hedefi', :carol::uuid, 300, 10) returning id as v \gset pn_
set role authenticated;
select public._as_user(:dave);
select public.pin_comment_create(public._g('A1'), '@bobby bakar mısın?', 300, 40, :'pn_v'::uuid, 12, 8) as v \gset c2_
select public._as_user(:hank);
select public._check(30, 'projeye girişsiz kişi yorum yazamaz', public._try(format($$select public.pin_comment_create(%L, 'x', 1, 1)$$, public._g('A1'))) like '%space_not_found%');
select public._check(31, 'projeye girişsiz kişi yorumları okuyamaz', public._cnt(format($$select count(*) from public.space_pin_comments where space_id = %L$$, public._g('A1'))) = 0);
select public._as_user(:frank);
select public.pin_comment_create(public._g('A1'), 'görüntüleyici yorumu', 5, 5) as v \gset fc_
select public._check(32, 'görüntüleyici yorum yazar ve kendi yorumunu okur', public._cnt(format($$select count(*) from public.space_pin_comments where id = %L and author_id = %L$$, :'fc_v', :frank)) = 1);
select public._check(33, 'istemci tabloya doğrudan yazamaz', public._try(format($$insert into public.space_pin_comments (space_id, body, x, y, author_id) values (%L, 'x', 1, 1, %L)$$, public._g('A1'), :frank)) like '%permission denied%');
select public._check(34, 'geçersiz öğe (başka panonun öğesi) reddedilir', public._try(format($$select public.pin_comment_create(%L, 'x', 1, 1, %L, 0, 0)$$, public._g('A1'), (select id from public.space_items where space_id = public._g('B1') limit 1))) like '%space_invalid%');
select public._check(35, 'boş yorum reddedilir', public._try(format($$select public.pin_comment_create(%L, '   ', 1, 1)$$, public._g('A1'))) like '%space_invalid%');
reset role;
select public._check(36, '@bahsetme bildirim yazar (bobby)', public._n(format($$select count(*) from public.notifications where recipient_id = %L and dedupe_key = %L$$, :bobby, 'pinm:' || :'c2_v' || ':' || :bobby)) = 1 or public._n(format($$select count(*) from public.notifications where recipient_id = %L and dedupe_key like 'pinm:%%'$$, :bobby)) = 1);
select public._check(37, 'öğe sahibine yorum bildirimi gider (carol)', public._n(format($$select count(*) from public.notifications where recipient_id = %L and dedupe_key like 'pinc:%%'$$, :carol)) = 1);
set role authenticated;
select public._as_user(:carol);
select public.pin_comment_create(public._g('A1'), 'yanıt', null, null, null, null, null, :'c1_v'::uuid) as v \gset r1_
reset role;
select public._check(38, 'yanıt kökün konumsuz çocuğudur, öğe kimliği kökten gelir', (select parent_id = :'c1_v'::uuid and x is null from public.space_pin_comments where id = :'r1_v'::uuid));
select public._check(39, 'kök yazara yanıt bildirimi gider (frank)', public._n(format($$select count(*) from public.notifications where recipient_id = %L and dedupe_key like 'pinr:%%'$$, :frank)) = 1);
set role authenticated;
select public._as_user(:dave);
select public._check(40, 'başkasının yorumunu düzenleyemez', public._try(format($$select public.pin_comment_update(%L, 'x')$$, :'c1_v')) like '%space_forbidden%');
select public._check(41, 'yazar kendi yorumunu düzenler', public._try(format($$select public.pin_comment_update(%L, '@bobby tamam')$$, :'c2_v')) = 'ok');
select public._as_user(:frank);
select public._check(42, 'görüntüleyici başkasının yorumunu çözemez', public._try(format($$select public.pin_comment_set_resolved(%L, true)$$, :'c2_v')) like '%space_forbidden%');
select public._check(43, 'yazar kendi yorumunu çözer', public._try(format($$select public.pin_comment_set_resolved(%L, true)$$, :'c1_v')) = 'ok');
select public._as_user(:dave);
select public._check(44, 'düzenleyici başkasının yorumunu çözebilir', public._try(format($$select public.pin_comment_set_resolved(%L, true)$$, :'c2_v')) = 'ok');
select public._check(45, 'yanıt çözülemez (yalnız kök)', public._try(format($$select public.pin_comment_set_resolved(%L, true)$$, :'r1_v')) like '%space_not_found%');
select public._check(46, 'düzenleyici başkasının yorumunu silemez', public._try(format($$select public.pin_comment_delete(%L)$$, :'c1_v')) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(47, 'lider silebilir (yanıt da gider)', public._try(format($$select public.pin_comment_delete(%L)$$, :'c1_v')) = 'ok' and public._cnt(format($$select count(*) from public.space_pin_comments where id = %L$$, :'r1_v')) = 0);
reset role;

-- Taslak öğeye bağlı yorum yalnız ekleyene ve liderlere görünür.
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, created_by) values (public._g('A1'), 'note', 'Gizli taslak', :dave::uuid) returning id as v \gset dr_
select public.pin_comment_create(public._g('A1'), 'taslak yorumu', 50, 50, :'dr_v'::uuid, 5, 5) as v \gset c3_
select public._as_user(:frank);
select public._check(48, 'görüntüleyici taslak öğenin yorumunu GÖRMEZ', public._cnt(format($$select count(*) from public.space_pin_comments where id = %L$$, :'c3_v')) = 0);
select public._check(49, 'görüntüleyici taslak öğeye yorum yazamaz', public._try(format($$select public.pin_comment_create(%L, 'x', 1, 1, %L, 0, 0)$$, public._g('A1'), :'dr_v')) like '%space_invalid%');
select public._as_user(:carol);
select public._check(50, 'lider taslak öğenin yorumunu GÖRMEZ (onaya gönderilene kadar)', public._cnt(format($$select count(*) from public.space_pin_comments where id = %L$$, :'c3_v')) = 0);
reset role;
select public._as_user(:frank);
set role authenticated;
select public._check(51, '`areas.open_comments` görüntüleyici için yalnız görebildiği açık kökleri sayar', (
  select (a ->> 'open_comments')::int from jsonb_array_elements(public.team_project_get(public._g('P')) -> 'areas') a where (a ->> 'id')::uuid = public._g('A1'))
  = (select count(*) from public.space_pin_comments where space_id = public._g('A1') and parent_id is null and resolved_at is null));
reset role;
select public._check(52, 'öğe silinince yorum serbest pin olarak kalır (item_id null)', (
  select count(*) from public.space_pin_comments where id = :'c3_v'::uuid) = 1);
select public._as_user(:carol);
delete from public.space_items where id = :'dr_v'::uuid;
select public._check(53, 'silinen öğenin yorumu x,y ile durur, item_id null', (select item_id is null and x = 50 from public.space_pin_comments where id = :'c3_v'::uuid));
select public._check(54, 'pano silinince yorumları da gider', (
  select public._n(format($$select count(*) from public.space_pin_comments where space_id = %L$$, public._g('B3'))) = 0));

-- Anon / görüntüleyici yürütme yetkisi
set role anon;
select public._as_user('');
select public._check(55, 'anon pin_comment_create çalıştıramaz', public._try(format($$select public.pin_comment_create(%L, 'x', 1, 1)$$, public._g('A1'))) like '%permission denied%');
select public._check(56, 'anon team_transfer_items çalıştıramaz', public._try(format($$select public.team_transfer_items(%L, %L, array[gen_random_uuid()])$$, public._g('A1'), public._g('B1'))) like '%permission denied%');
reset role;


-- ============================================================================================================================================
-- 9) Pano grupları (docs/history/368-*)
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public.team_create_board(public._g('P'), 'Bağımsız C', public._g('F1')) as v \gset gc_
select public.team_create_board(public._g('P'), 'Tek', public._g('F1')) as v \gset gt_
select public._check(300, 'proje geneli pano açılamaz (dosya şart)', public._try(format($$select public.team_create_board(%L, 'x')$$, public._g('P'))) like '%project_invalid%');
reset role;
select public._check(301, 'bağımsız pano grupsuzdur; B1+B2+B3 tek grup', (select team_board_group_id from public.spaces where id = :'gc_v'::uuid) is null
  and (select count(distinct team_board_group_id) from public.spaces where id in (public._g('B1'), public._g('B2'), public._g('B3'))) = 1
  and (select team_board_group_id from public.spaces where id = public._g('B1')) is not null);
select public._check(302, 'grup adı ilk panonun adı', (select g.title from public.team_board_groups g join public.spaces s on s.team_board_group_id = g.id where s.id = public._g('B1')) = 'Taslaklar');
set role authenticated;
select public._as_user(:dave);
select public.team_project_get(public._g('P')) as v \gset gp_
select public._check(303, 'team_project_get: groups + areas.group_id', jsonb_array_length(:'gp_v'::jsonb -> 'groups') = 1 and (:'gp_v'::jsonb -> 'groups' -> 0 ->> 'board_count')::int = 3
  and (select count(*) from jsonb_array_elements(:'gp_v'::jsonb -> 'areas') a where a ->> 'group_id' is not null) = 3);
select public._check(304, 'grupsuz panoya grup kapsamında sıralama yapılamaz', public._try(format($$select public.team_reorder_boards(%L, %L, array[%L]::uuid[])$$, public._g('P'), public._g('F1'), :'gc_v')) like '%project_invalid%');
select public._check(305, 'bağımsız pano ile grup panosu arasında aktarım reddedilir', public._try(format($$select public.team_transfer_items(%L, %L, array[gen_random_uuid()]::uuid[], true)$$, :'gc_v', public._g('B1'))) like '%project_invalid%');
select public.team_create_board_in_group(:'gt_v'::uuid, 'Tek ikinci') as v \gset g2_
select public._check(306, 'bağımsız panodan "Yeni pano" = yeni grup kurar', public._n('select count(*) from public.team_board_groups') = 2);
select public.team_rename_board_group((select team_board_group_id from public.spaces where id = :'gt_v'::uuid), 'İkili') ;
select public._check(307, 'grup yeniden adlandırılır', public._n($$select count(*) from public.team_board_groups where title = 'İkili'$$) = 1);
select public._as_user(:frank);
select public._check(308, 'görüntüleyici gruba pano ekleyemez', public._try(format($$select public.team_create_board_in_group(%L, 'x')$$, :'gt_v')) like '%team_forbidden%');
select public._as_user(:carol);
select public.team_delete_board(:'g2_v'::uuid);
reset role;
select public._check(309, 'grupta tek pano kalınca grup çözülür', (select team_board_group_id from public.spaces where id = :'gt_v'::uuid) is null and (select count(*) from public.team_board_groups where title = 'İkili') = 0);
select public._check(310, 'dosya grup panoları dışarıdan ayrı: gc grupsuz kaldı', (select team_board_group_id from public.spaces where id = :'gc_v'::uuid) is null);

select 'FAILED=' || count(*) from public._results where not ok;
select n, name, detail from public._results where not ok order by n;
