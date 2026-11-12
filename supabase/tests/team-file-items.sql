-- Ekip dosyası ⇄ pano (docs/history/376-*): dosya asıl, pano yansıma; ekibe özgü içerik. 
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-file-items.sql ("FAILED=0" beklenir).
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
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._state(i uuid) returns text language sql security definer as $$ select rev_state from public.space_items where id = i $$;
create or replace function public._n(q text) returns integer language plpgsql security definer as $$
declare r integer; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text), public._state(uuid), public._n(text) to public;

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
select public.team_create_file(:'p_v'::uuid, 'Banyo') as v \gset f2_
select public.team_create_board(:'p_v'::uuid, 'Pano A', :'f1_v'::uuid) as v \gset b1_
select public.team_create_board(:'p_v'::uuid, 'Pano B', :'f1_v'::uuid) as v \gset b2_
select public.team_create_board(:'p_v'::uuid, 'Banyo panosu', :'f2_v'::uuid) as v \gset b3_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F1', :'f1_v'), ('F2', :'f2_v'), ('B1', :'b1_v'), ('B2', :'b2_v'), ('B3', :'b3_v');
insert into public._ctx select 'A1', id::text from public.spaces where team_file_id = public._g('F1') and team_area_main;
insert into public._ctx select 'A2', id::text from public.spaces where team_file_id = public._g('F2') and team_area_main;

-- Herkese açık, yayınlanmış bir prompt (başvuru için) ve kişisel bir Space (sızıntı denemesi için).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('aaaaaaaa-0000-4000-8000-000000000001', :alice, 'Genel prompt', '', 'merhaba {isim}', 'text', 'published', 'public');
set role authenticated;
select public._as_user(:dave);
select public.create_space('Dave kişisel') as v \gset sp_
reset role;
insert into public._ctx values ('SP', :'sp_v');

-- ============================================================================================================================================
-- 1) Panoya doğrudan ekleme dosyaya da girer
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, body, x, y, created_by) values (public._g('B1'), 'note', 'Dolap', 'mat beyaz', 100, 200, :carol::uuid) returning id as v \gset n1_
reset role;
insert into public._ctx values ('N1', :'n1_v');
select public._check(1, 'panoya eklenen not için ana alanda asıl öğe açıldı', (select count(*) from public.space_items where space_id = public._g('A1') and kind = 'note' and file_item_id is null) = 1);
select public._check(2, 'pano satırı asıl öğeye bağlı ve içeriği aynı', (
  select m.file_item_id = c.id and m.title = c.title and m.body = c.body and m.created_by = c.created_by
    from public.space_items m join public.space_items c on c.id = m.file_item_id where m.id = :'n1_v'::uuid));
select public._check(3, 'lider eklediği için ikisi de onaylı', (select count(distinct rev_state) = 1 and min(rev_state) = 'approved' from public.space_items where id = :'n1_v'::uuid or id = (select file_item_id from public.space_items where id = :'n1_v'::uuid)));
insert into public._ctx select 'C1', file_item_id::text from public.space_items where id = :'n1_v'::uuid;

-- ============================================================================================================================================
-- 2) Dosyadaki öğeyi başka panoya yerleştir; aynı öğe iki panoda
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public.team_board_place_items(public._g('B2'), array[public._g('C1')], 40, 60) as v \gset pl_
select public.team_board_place_items(public._g('B2'), array[public._g('C1')], 40, 60) as v \gset pl2_
reset role;
select public._check(4, 'yerleştirme bir yansıma kurar', (:'pl_v'::jsonb ->> 'placed')::int = 1 and (select count(*) from public.space_items where space_id = public._g('B2') and file_item_id = public._g('C1')) = 1);
select public._check(5, 'aynı öğe aynı panoya ikinci kez konmaz (atlanır)', (:'pl2_v'::jsonb ->> 'placed')::int = 0 and (:'pl2_v'::jsonb ->> 'skipped')::int = 1);
select public._check(6, 'yansıma içeriği asıl öğeden gelir', (select title = 'Dolap' and body = 'mat beyaz' from public.space_items where space_id = public._g('B2') and file_item_id = public._g('C1')));
set role authenticated;
select public._as_user(:carol);
select (select (f ->> 'item_count')::int from jsonb_array_elements(public.team_project_get(public._g('P')) -> 'files') f where f ->> 'id' = public._g('F1')::text) as v \gset cnt_
reset role;
select public._check(7, 'dosya sayısı yalnız asıl öğeler (yansımalar ikinci kez sayılmaz)', :'cnt_v'::int = (select count(*) from public.space_items where space_id = public._g('A1') and kind not in ('frame','text','shape')));

-- ============================================================================================================================================
-- 3) İçerik düzenlemesi her yere yayılır; onay kilidi
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
select public._try(format($$update public.space_items set title = 'Dolap 2', body = 'ahşap' where id = %L$$, public._g('N1'))) as v \gset ed_
reset role;
select public._check(8, 'liderin pano satırından yazdığı içerik asıl öğeye ve öteki panodaki yansımaya yayılır', :'ed_v' = 'ok'
  and (select title from public.space_items where id = public._g('C1')) = 'Dolap 2'
  and (select body from public.space_items where space_id = public._g('B2') and file_item_id = public._g('C1')) = 'ahşap');
set role authenticated;
select public._as_user(:dave);
select public._check(9, 'onaylı içeriği düzenleyici yansımadan da değiştiremez', public._try(format($$update public.space_items set title = 'X' where id = %L$$, (select id from public.space_items where space_id = public._g('B2') and file_item_id = public._g('C1')))) like '%review_content_locked%');
select public._check(10, 'konum yansımaya özeldir: düzenleyici konumu değiştirebilir, asıl öğe değişmez', public._try(format($$update public.space_items set x = 999 where id = %L$$, (select id from public.space_items where space_id = public._g('B2') and file_item_id = public._g('C1')))) = 'ok');
reset role;
select public._check(11, 'konum başka panodaki yansımayı etkilemez', (select x from public.space_items where id = public._g('N1')) = 100);

-- ============================================================================================================================================
-- 4) Panodan kaldır ≠ dosyadan sil
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._try(format($$delete from public.space_items where space_id = %L and file_item_id = %L$$, public._g('B2'), public._g('C1'))) as v \gset rm_
reset role;
select public._check(12, 'düzenleyici onaylı öğenin yansımasını panodan kaldırabilir', :'rm_v' = 'ok' and (select count(*) from public.space_items where space_id = public._g('B2') and file_item_id = public._g('C1')) = 0);
select public._check(13, 'asıl öğe dosyada kalır', (select count(*) from public.space_items where id = public._g('C1')) = 1);
set role authenticated;
select public._as_user(:dave);
select public._check(14, 'düzenleyici onaylı öğeyi dosyadan silemez', public._try(format($$select public.team_item_delete(%L)$$, public._g('C1'))) like '%review_delete_forbidden%');
select public._as_user(:frank);
select public._check(15, 'görüntüleyici dosyadan silemez', public._try(format($$select public.team_item_delete(%L)$$, public._g('C1'))) like '%team_forbidden%');
select public._as_user(:carol);
select public.team_board_place_items(public._g('B2'), array[public._g('N1')], 0, 0);
select public.team_item_delete(public._g('N1'));
reset role;
select public._check(16, 'lider yansıma kimliğiyle dosyadan silince asıl öğe ve bütün yansımalar gider', (select count(*) from public.space_items where id in (public._g('C1'), public._g('N1'))) = 0
  and (select count(*) from public.space_items where file_item_id = public._g('C1')) = 0);

-- ============================================================================================================================================
-- 5) Onay: düzenleyicinin öğesi taslak, kararlar yansıma kimliğiyle de çalışır, kuyruk yalnız asılı gösterir
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('B1'), 'note', 'Dave notu', 'taslak', :dave::uuid) returning id as v \gset dn_
reset role;
insert into public._ctx values ('DN', :'dn_v');
select public._check(17, 'düzenleyicinin panoya eklediği öğe ve asıl öğesi taslak', public._state(public._g('DN')) = 'draft' and public._state((select file_item_id from public.space_items where id = public._g('DN'))) = 'draft');
set role authenticated;
select public._as_user(:frank);
select public._check(18, 'taslağı görüntüleyici göremez (yansıma de asıl öğe de)', (select count(*) from public.space_items where title = 'Dave notu') = 0);
select public._as_user(:dave);
select public.team_review_submit(array[public._g('DN')]) as v \gset sub_
select public._check(19, 'yansıma kimliğiyle onaya gönderilir', :'sub_v'::int = 1);
reset role;
select public._check(20, 'bekliyor: asıl öğe ve yansıma', public._state(public._g('DN')) = 'pending' and public._state((select file_item_id from public.space_items where id = public._g('DN'))) = 'pending');
set role authenticated;
select public._as_user(:carol);
select (public.team_review_pending(public._g('P')) -> 'items') as v \gset q_
select public._check(21, 'lider kuyruğunda yalnız asıl öğe (yansıma ikinci kez görünmez)', jsonb_array_length(:'q_v'::jsonb) = 1);
select public.team_review_decide(array[public._g('DN')], 'approve') as v \gset dc_
reset role;
select public._check(22, 'onay yansıma kimliğiyle verilince ikisi de onaylanır', :'dc_v'::int = 1 and public._state(public._g('DN')) = 'approved' and public._state((select file_item_id from public.space_items where id = public._g('DN'))) = 'approved');
set role authenticated;
select public._as_user(:frank);
select public._check(23, 'onaydan sonra görüntüleyici görür', (select count(*) from public.space_items where title = 'Dave notu') = 2);
reset role;

-- ============================================================================================================================================
-- 6) Başvuru kimliği, görsel, palet, çizim nesneleri
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, prompt_id, created_by) values (public._g('B1'), 'prompt', 'aaaaaaaa-0000-4000-8000-000000000001', :carol::uuid) returning id as v \gset pr1_
insert into public.space_items (space_id, kind, prompt_id, created_by) values (public._g('B2'), 'prompt', 'aaaaaaaa-0000-4000-8000-000000000001', :carol::uuid) returning id as v \gset pr2_
reset role;
select public._check(24, 'aynı yayınlanmış prompt iki panoya konunca dosyada TEK asıl öğe', (select count(*) from public.space_items where space_id = public._g('A1') and kind = 'prompt' and prompt_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 1
  and (select file_item_id from public.space_items where id = :'pr1_v'::uuid) = (select file_item_id from public.space_items where id = :'pr2_v'::uuid));
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, is_draft, title, body, created_by) values (public._g('B1'), 'prompt', true, 'Taslak 1', 'a', :carol::uuid), (public._g('B2'), 'prompt', true, 'Taslak 1', 'a', :carol::uuid);
reset role;
select public._check(25, 'taslak prompt öğeleri kimliksiz: her biri ayrı asıl öğe', (select count(*) from public.space_items where space_id = public._g('A1') and kind = 'prompt' and is_draft) = 2);

set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, media_url, created_by) values (public._g('B1'), 'image',
  'https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B1')::text || '/aaaaaaaa-1111-4111-8111-111111111111.png', :carol::uuid) returning id as v \gset im_
reset role;
select public._check(26, 'panoya yüklenen görsel için ana alanda asıl öğe (aynı proje klasörü kabul edilir)', (select count(*) from public.space_items where space_id = public._g('A1') and kind = 'image' and file_item_id is null) = 1);
select public._check(27, 'görsel yolundan asıl öğe okunabilir (pano silinse de görsel dosyaya başvuran satırla okunur)', public._space_media_item_readable(public._g('B1')::text || '/aaaaaaaa-1111-4111-8111-111111111111.png') is not null);
set role authenticated;
select public._as_user(:hank);
select public._check(28, 'projeye girişsiz görseli okuyamaz', public._space_media_item_readable(public._g('B1')::text || '/aaaaaaaa-1111-4111-8111-111111111111.png') = false);
reset role;

set role authenticated;
select public._as_user(:carol);
insert into public.space_palettes (space_id, name, colors, created_by) values (public._g('B1'), 'Mutfak paleti', array['#ffffff', '#222222'], :carol::uuid) returning id as v \gset pal_
reset role;
select public._check(29, 'panoya eklenen palet dosyanın ana alanında yaşar', (select space_id from public.space_palettes where id = :'pal_v'::uuid) = public._g('A1'));
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, palette_id, created_by) values (public._g('B1'), 'palette', :'pal_v'::uuid, :carol::uuid) returning id as v \gset pi_
reset role;
select public._check(30, 'palet öğesi: ana alanda asıl + panoda yansıma, ikisi aynı palete başvurur', (select count(*) from public.space_items where palette_id = :'pal_v'::uuid) = 2);
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, created_by, data) values (public._g('B1'), 'frame', 'Çerçeve', :carol::uuid, '{}') returning id as v \gset fr_
insert into public.space_items (space_id, kind, body, attached_item_id, created_by) values (public._g('B1'), 'note', 'iliştirilmiş', (select id from public.space_items where id = :'pi_v'::uuid), :carol::uuid) returning id as v \gset an_
reset role;
select public._check(31, 'çerçeve ve iliştirilmiş not yalnız panoya aittir (asıl öğe açılmaz)', (select file_item_id from public.space_items where id = :'fr_v'::uuid) is null and (select file_item_id from public.space_items where id = :'an_v'::uuid) is null
  and (select count(*) from public.space_items where space_id = public._g('A1') and kind in ('frame')) = 0);

-- ============================================================================================================================================
-- 7) Ekibe özgü içerik: oluşturma, görünürlük, kilitler, silme
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :dave, 'Ekip promptu', '', 'gizli metin', 'text', 'published', 'public', public._g('F1'));
select public.team_attach_content(public._g('F1'), 'prompt', 'bbbbbbbb-0000-4000-8000-000000000001', public._g('B1')) as v \gset at_
reset role;
select public._check(32, 'ekibe özgü içerik daima private saklanır (istemci "public" dese de)', (select visibility from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 'private');
select public._check(33, 'ekle: asıl öğe ana alanda + yansıma panoda, düzenleyici için taslak', (:'at_v'::jsonb ->> 'item_id') is not null and (:'at_v'::jsonb ->> 'board_item_id') is not null
  and public._state((:'at_v'::jsonb ->> 'item_id')::uuid) = 'draft');
set role authenticated;
select public._as_user(:dave);
select public._check(34, 'yazar kendi ekip içeriğini okur', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 1);
select public._as_user(:frank);
select public._check(35, 'taslak öğenin içeriği görüntüleyiciye sızmaz', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0);
select public._as_user(:carol);
select public._check(36, 'taslak liderden de gizli (docs/history/368-*): içerik de gizli', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0);
select public._as_user(:dave);
select public.team_review_submit(array[(:'at_v'::jsonb ->> 'item_id')::uuid]);
select public._as_user(:carol);
select public._check(64, 'onaya gönderilince lider içeriği okur', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 1);
select public.team_review_decide(array[(:'at_v'::jsonb ->> 'item_id')::uuid], 'approve');
select public._as_user(:frank);
select public._check(37, 'onaydan sonra projeyi görebilen üye okur', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 1);
select public._as_user(:hank);
select public._check(38, 'projeye girişsiz ekip üyesi okuyamaz', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0);
select public._as_user(:alice);
select public._check(39, 'ekip sahibi (örtük lider) okur', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 1);
select public._as_user('');
reset role;
set role anon;
select public._check(40, 'ziyaretçi okuyamaz', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0);
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(41, 'onaylıdan sonra yazar bile metni değiştiremez (kilit)', public._try($$update public.prompts set prompt_text = 'yeni' where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$) like '%review_content_locked%');
select public._check(42, 'team_file_id sonradan değişmez', public._try(format($$update public.prompts set team_file_id = %L where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, public._g('F2'))) like '%team_content_immutable%');
select public._check(43, 'ekip içeriği beğenilemez', public._try(format($$insert into public.prompt_likes (prompt_id, user_id, reaction) values ('bbbbbbbb-0000-4000-8000-000000000001', %L, 'love')$$, :dave)) like '%team_content_not_shareable%');
select public._check(44, 'ekip içeriği kaydedilemez', public._try(format($$insert into public.collection_items (collection_id, prompt_id) select id, 'bbbbbbbb-0000-4000-8000-000000000001' from public.collections where owner_id = %L limit 1$$, :dave)) like '%team_content_not_shareable%' or (select count(*) from public.collections where owner_id = :dave) = 0);
select public._check(45, 'ekip içeriği kişisel Space''e eklenemez', public._try(format($$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'bbbbbbbb-0000-4000-8000-000000000001', %L)$$, public._g('SP'), :dave)) like '%space_source_unavailable%');
select public._as_user(:hank);
select public._check(47, 'projesiz kullanıcı ekip içeriği oluşturamaz', public._try(format($$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values (%L, 'x', '', 'y', 'text', 'published', 'private', %L)$$, :hank, public._g('F1'))) like '%team_forbidden%' or public._try(format($$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values (%L, 'x', '', 'y', 'text', 'published', 'private', %L)$$, :hank, public._g('F1'))) like '%row-level security%');
select public._as_user(:frank);
select public._check(48, 'görüntüleyici ekip içeriği oluşturamaz', public._try(format($$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values (%L, 'x', '', 'y', 'text', 'published', 'private', %L)$$, :frank, public._g('F1'))) like '%team_forbidden%');
select public._as_user(:carol);
select public._check(49, 'topluluk ve ekip birlikte olamaz', public._try(format($$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility, team_file_id, community_id) values (%L, 'x', '', 'y', 'text', 'published', 'private', %L, %L)$$, :carol, public._g('F1'), :alice)) is distinct from 'ok');
select public._check(50, 'herkese açık içerik dosyaya başvuru olarak eklenir (kopya değil)', (public.team_attach_content(public._g('F1'), 'prompt', 'aaaaaaaa-0000-4000-8000-000000000001', null) ->> 'existing')::boolean = true);
select public._check(51, 'başka dosyaya özgü içerik bu dosyaya eklenemez', public._try(format($$select public.team_attach_content(%L, 'prompt', 'bbbbbbbb-0000-4000-8000-000000000001', null)$$, public._g('F2'))) like '%space_source_unavailable%');
reset role;

-- Proje liderinin içeriği silmesi: asıl öğe silinince ekip içeriği de gider; içerik silinince asıl öğe ve yansımalar da.
set role authenticated;
select public._as_user(:carol);
select public.team_item_delete((:'at_v'::jsonb ->> 'item_id')::uuid);
reset role;
select public._check(52, 'asıl öğeyi silmek ekibe özgü içeriği de siler', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.space_items where prompt_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0);
set role authenticated;
select public._as_user(:carol);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000002', :carol, 'Ekip promptu 2', '', 'metin', 'text', 'published', 'private', public._g('F1'));
select public.team_attach_content(public._g('F1'), 'prompt', 'bbbbbbbb-0000-4000-8000-000000000002', public._g('B1')) as v \gset at2_
select public.team_board_place_items(public._g('B2'), array[(:'at2_v'::jsonb ->> 'item_id')::uuid]) as v \gset pl3_
select public._try($$delete from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000002'$$) as v \gset dl_
reset role;
select public._check(53, 'ekip içeriğini doğrudan silmek asıl öğeyi ve tüm yansımaları da siler', :'dl_v' = 'ok' and (select count(*) from public.space_items where id = (:'at2_v'::jsonb ->> 'item_id')::uuid or file_item_id = (:'at2_v'::jsonb ->> 'item_id')::uuid) = 0);

-- ============================================================================================================================================
-- 8) Dosya silinince / pano silinince
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000003', :carol, 'Banyo promptu', '', 'metin', 'text', 'published', 'private', public._g('F2'));
select public.team_attach_content(public._g('F2'), 'prompt', 'bbbbbbbb-0000-4000-8000-000000000003', public._g('B3')) as v \gset at3_
select public.team_delete_board(public._g('B3'));
reset role;
select public._check(54, 'pano silinince yansıma gider, dosyadaki asıl öğe ve ekip içeriği kalır', (select count(*) from public.space_items where space_id = public._g('A2') and prompt_id = 'bbbbbbbb-0000-4000-8000-000000000003') = 1
  and (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000003') = 1);
delete from public.team_files where id = public._g('F2');
select public._check(55, 'dosya silinince ekibe özgü içerik de gider', (select count(*) from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000003') = 0);

-- ============================================================================================================================================
-- 9) Eski taşı/kopyala artık yerleşimdir; dönüşüm eski satırları bağlar
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('B1'), 'note', 'Taşınan', 'x', :carol::uuid) returning id as v \gset mv_
select public.team_transfer_items(public._g('B1'), public._g('B2'), array[:'mv_v'::uuid], false, '{}'::jsonb) as v \gset tr_
reset role;
select public._check(56, 'eski taşıma yansımayı taşır: asıl öğe tek, pano değişir', (:'tr_v'::jsonb ->> 'done')::int = 1
  and (select count(*) from public.space_items where title = 'Taşınan' and file_item_id is null) = 1
  and (select count(*) from public.space_items where title = 'Taşınan' and space_id = public._g('B2') and file_item_id is not null) = 1
  and (select count(*) from public.space_items where title = 'Taşınan' and space_id = public._g('B1')) = 0);

-- Dönüşüm: tetikleyiciler kapalıyken (eski veri gibi) bağsız satır yaz, sonra dönüşümü çalıştır.
set session_replication_role = replica;
insert into public.space_items (space_id, kind, title, body, created_by, rev_state) values (public._g('B2'), 'note', 'Eski not', 'e', :carol::uuid, 'approved'), (public._g('B1'), 'note', 'Eski not', 'e', :carol::uuid, 'approved');
insert into public.space_items (space_id, kind, media_url, created_by, rev_state) values (public._g('B2'), 'image',
  'https://x.supabase.co/storage/v1/object/public/space-media/' || public._g('B1')::text || '/aaaaaaaa-1111-4111-8111-111111111111.png', :carol::uuid, 'approved');
set session_replication_role = origin;
select public._team_backfill_file_items() as v \gset bf_
select public._check(57, 'dönüşüm bağsız satırları bağlar', :'bf_v'::int >= 3 and (select count(*) from public.space_items s join public.spaces sp on sp.id = s.space_id where sp.team_project_id is not null and sp.team_file_id is not null and not sp.team_area_main and s.file_item_id is null and public._team_file_kind(s.kind, s.attached_item_id)) = 0);
select public._check(58, 'dönüşüm: değişmez kimlikli içerik (aynı görsel) mevcut asıl öğede birleşir; kimliksiz notlar ayrı kalır',
  (select count(*) from public.space_items where space_id = public._g('A1') and kind = 'image') = 1
  and (select count(*) from public.space_items where kind = 'image' and file_item_id is not null) = 2
  and (select count(*) from public.space_items where title = 'Eski not' and file_item_id is null) = 2
  and (select count(*) from public.space_items where title = 'Eski not' and file_item_id is not null) = 2);
select public._check(59, 'dönüşüm ikinci kez çalışınca bir şey değiştirmez', public._team_backfill_file_items() = 0);


-- Ekibe özgü içeriğin yeri (içerik sayfası yönlendirmesi)
set role authenticated;
select public._as_user(:carol);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000009', :carol, 'Konum promptu', '', 'metin', 'text', 'published', 'private', public._g('F1'));
select public.team_attach_content(public._g('F1'), 'prompt', 'bbbbbbbb-0000-4000-8000-000000000009', null) as v \gset loc_
select public.team_content_location('prompt', 'bbbbbbbb-0000-4000-8000-000000000009') as v \gset lo_
select public._check(65, 'içeriğin yeri: ekip, proje, dosya ve asıl öğe döner', (:'lo_v'::jsonb ->> 'item_id') = (:'loc_v'::jsonb ->> 'item_id') and (:'lo_v'::jsonb ->> 'file_id') = public._g('F1')::text and (:'lo_v'::jsonb ->> 'project_id') = public._g('P')::text);
select public._as_user(:hank);
select public._check(66, 'projeye girişsiz: yer bilgisi yok', public.team_content_location('prompt', 'bbbbbbbb-0000-4000-8000-000000000009') is null);
select public._check(67, 'ekip dışı içerik için yer bilgisi yok', public.team_content_location('prompt', 'aaaaaaaa-0000-4000-8000-000000000001') is null);
reset role;

-- ============================================================================================================================================
-- 10) Yetkiler
-- ============================================================================================================================================
set role anon;
select public._check(60, 'ziyaretçi RPC çağıramaz', public._try('select public.team_item_delete(gen_random_uuid())') like '%permission denied%');
select public._check(61, 'ziyaretçi yerleştirme RPC''sini çağıramaz', public._try('select public.team_board_place_items(gen_random_uuid(), array[gen_random_uuid()])') like '%permission denied%');
reset role;
select public._check(62, 'tetikleyici işlevleri istemciye kapalı', not has_function_privilege('authenticated', 'public.space_items_file_link()', 'execute') and not has_function_privilege('authenticated', 'public.enforce_team_content()', 'execute'));
select public._check(63, '_team_backfill_file_items istemciye kapalı', not has_function_privilege('authenticated', 'public._team_backfill_file_items()', 'execute'));

select 'FAILED=' || count(*) from public._results where not ok;
select n, name, detail from public._results where not ok order by n;
