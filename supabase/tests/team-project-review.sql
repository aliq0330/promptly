-- Ekip projeleri v2 — ONAY MOTORU (docs/history/362-*): taslak → bekliyor → onaylı / değişiklik istendi, taslak gizleme, içerik kilidi, öneri, paket.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-project-review.sql ("FAILED=0" beklenir).
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
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text) to public;
create or replace function public._state(i uuid) returns text language sql security definer as $$ select rev_state from public.space_items where id = i $$;
create or replace function public._aud(act text) returns integer language sql security definer as $$ select count(*)::integer from public.team_audit where team_id = public._g('T') and action = act $$;
grant execute on function public._state(uuid), public._aud(text) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici → proje lideri, dave/gina düzenleyici, frank görüntüleyici, hank girişsiz).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', '', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'),
  (public._g('T'), :gina, 'member'), (public._g('T'), :frank, 'member'), (public._g('T'), :hank, 'member');
set role authenticated;
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view', jsonb_build_array(
  jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:gina,'role','edit'),
  jsonb_build_object('type','member','id',:frank,'role','view'))) as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak') as v \gset f1_
select public.team_create_file(:'p_v'::uuid, 'Banyo', false) as v \gset f2_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F1', :'f1_v'), ('F2', :'f2_v');
insert into public._ctx select 'A1', id::text from public.spaces where team_file_id = public._g('F1') and team_area_main;
insert into public._ctx select 'A2', id::text from public.spaces where team_file_id = public._g('F2') and team_area_main;
insert into public._ctx select 'AP', id::text from public.spaces where team_project_id = public._g('P') and team_file_id is null and team_area_main;

-- ============================================================================================================================================
-- 1) Ekleme: durumu sunucu belirler
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Dolap notu', 'mat beyaz', :dave::uuid) returning id as v \gset n1_
insert into public.space_items (space_id, kind, title, body, created_by, rev_state) values (public._g('A1'), 'note', 'Sahte onaylı', '', :dave::uuid, 'approved') returning id as v \gset n2_
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A2'), 'note', 'Banyo notu', '', :dave::uuid) returning id as v \gset n3_
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Lider notu', '', :carol::uuid) returning id as v \gset n4_
reset role;
select public._check(1, 'onay açık dosyada düzenleyicinin notu taslak başlar', public._state(:'n1_v'::uuid) = 'draft');
select public._check(2, 'istemci durum SAHTE veremez (approved yazsa da taslak)', public._state(:'n2_v'::uuid) = 'draft');
select public._check(3, 'onay KAPALI dosyada doğrudan onaylı', public._state(:'n3_v'::uuid) = 'approved');
select public._check(4, 'lider kendi eklediği öğe doğrudan onaylı', public._state(:'n4_v'::uuid) = 'approved');

-- ============================================================================================================================================
-- 2) Görünürlük: taslağı yalnız ekleyen + liderler görür
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(5, 'ekleyen kendi taslağını görür', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 1);
select public._as_user(:carol);
select public._check(6, 'lider başkasının taslağını GÖRMEZ (onaya gönderilene kadar)', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 0);
select public._as_user(:alice);
select public._check(7, 'ekip sahibi (örtük lider) de taslağı GÖRMEZ', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 0);
select public._as_user(:gina);
select public._check(8, 'başka düzenleyici taslağı GÖRMEZ, onaylıyı görür', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 0
  and (select count(*) from public.space_items where id = :'n4_v'::uuid) = 1);
select public._as_user(:frank);
select public._check(9, 'görüntüleyici taslağı görmez', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 0);
select public._as_user(:hank);
select public._check(10, 'projeyi görmeyen hiçbir öğeyi görmez', (select count(*) from public.space_items where space_id = public._g('A1')) = 0);
select public._as_user('');
reset role;
set role anon;
select public._check(11, 'ziyaretçi alan öğelerini görmez', (select count(*) from public.space_items where space_id = public._g('A1')) = 0);
reset role;

-- Gina başkasının taslağını güncelleyemez/silemez (satır onun için görünmez → 0 satır)
set role authenticated;
select public._as_user(:gina);
update public.space_items set x = 99 where id = :'n1_v'::uuid;
select public._check(12, 'görünmeyen taslağa başka düzenleyici dokunamaz (0 satır)', (select x from public.space_items where id = :'n1_v'::uuid) is null);
reset role;
select public._check(13, 'taslak satırı değişmedi', (select x from public.space_items where id = :'n1_v'::uuid) <> 99);

-- Oklar ve sayımlar
set role authenticated;
select public._as_user(:dave);
insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (public._g('A1'), :'n4_v'::uuid, :'n1_v'::uuid, :dave::uuid);
select public._as_user(:gina);
select public._check(14, 'taslağa değen ok görünmez', (select count(*) from public.space_connections where space_id = public._g('A1')) = 0);
select public._as_user(:dave);
select public._as_user(:carol);
select public._check(202, 'lider taslağa değen oku görmez', (select count(*) from public.space_connections where space_id = public._g('A1')) = 0);
select public._as_user(:dave);
select public._check(15, 'ekleyen okunu görür', (select count(*) from public.space_connections where space_id = public._g('A1')) = 1);
select public._as_user(:gina);
select public._check(16, 'sayım: gina için dosya öğe sayısı taslağı içermez', (select (e ->> 'item_count')::int from jsonb_array_elements(public.team_project_get(public._g('P')) -> 'files') e where e ->> 'title' = 'Mutfak') = 1);
select public._as_user(:carol);
select public._check(17, 'sayım: lider taslağı SAYMAZ (gina ile aynı)', (select (e ->> 'item_count')::int from jsonb_array_elements(public.team_project_get(public._g('P')) -> 'files') e where e ->> 'title' = 'Mutfak') = 1);
reset role;

-- Etkinlik günlüğü alanlarda okunamaz
set role authenticated;
select public._as_user(:dave);
select public._check(18, 'alanın Etkinlik günlüğü okunamaz (üye bile)', (select count(*) from public.space_activity where space_id = public._g('A1')) = 0);
reset role;

-- ============================================================================================================================================
-- 3) Onaya gönder / korumalar
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:gina);
select public._check(19, 'başkasının taslağını gönderemez', public._try(format($$select public.team_review_submit(array[%L]::uuid[])$$, :'n1_v')) like '%team_forbidden%' or public._state(:'n1_v'::uuid) = 'draft');
select public._as_user(:frank);
select public._check(20, 'görüntüleyici gönderemez', public._try(format($$select public.team_review_submit(array[%L]::uuid[])$$, :'n1_v')) like '%team_forbidden%');
select public._as_user(:dave);
update public.space_items set title = 'Dolap notu v2' where id = :'n1_v'::uuid;
select public._check(21, 'taslakken ekleyen içeriği düzenler', (select title from public.space_items where id = :'n1_v'::uuid) = 'Dolap notu v2');
select public._check(22, 'durum doğrudan değiştirilemez', public._try(format($$update public.space_items set rev_state = 'approved' where id = %L$$, :'n1_v')) like '%review_protected%');
select public._check(23, 'rev_* alanları doğrudan yazılamaz', public._try(format($$update public.space_items set rev_decided_by = %L where id = %L$$, :dave, :'n1_v')) like '%review_protected%');
select public.team_review_submit(array[:'n1_v'::uuid]) as v \gset sub_
reset role;
select public._check(24, 'gönderim: 1 öğe bekliyor', :'sub_v'::int = 1 and public._state(:'n1_v'::uuid) = 'pending');
select public._check(25, 'denetim + liderlere bildirim', public._aud('review_submitted') = 1 and exists (select 1 from public.notifications where recipient_id = :carol::uuid and dedupe_key like 'revsub:%'));

set role authenticated;
select public._as_user(:dave);
select public._check(26, 'bekleyen öğenin içeriği kilitli (ekleyen bile)', public._try(format($$update public.space_items set title = 'x' where id = %L$$, :'n1_v')) like '%review_content_locked%');
update public.space_items set x = 120, y = 80, w = 300 where id = :'n1_v'::uuid;
select public._check(27, 'konum/boyut serbest', (select x from public.space_items where id = :'n1_v'::uuid) = 120);
select public._check(28, 'bekleyen öğeyi silemez', public._try(format($$delete from public.space_items where id = %L$$, :'n1_v')) like '%review_delete_forbidden%');
select public._as_user(:gina);
select public._check(29, 'bekleyen öğeyi başka düzenleyici hâlâ görmez', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 0);
select public._check(30, 'düzenleyici karar veremez', public._try(format($$select public.team_review_decide(array[%L]::uuid[], 'approve')$$, :'n1_v')) like '%team_forbidden%');
select public._as_user(:carol);
select public._check(31, 'lider kuyruğu: 1 bekleyen öğe', jsonb_array_length(public.team_review_pending(public._g('P')) -> 'items') = 1);
select public._as_user(:dave);
select public._check(32, 'kuyruğu yalnız lider okur', public._try(format($$select public.team_review_pending(%L)$$, public._g('P'))) like '%team_forbidden%');
select public._check(33, 'ekleyen geri çekebilir (bekliyor → taslak)', public.team_review_withdraw(array[:'n1_v'::uuid]) = 1 and public._state(:'n1_v'::uuid) = 'draft');
select public.team_review_submit(array[:'n1_v'::uuid]);

-- ============================================================================================================================================
-- 4) Karar: değişiklik iste → düzelt → onayla
-- ============================================================================================================================================
select public._as_user(:carol);
select public._check(34, 'değişiklik istemek için not zorunlu', public._try(format($$select public.team_review_decide(array[%L]::uuid[], 'changes', '')$$, :'n1_v')) like '%project_invalid%');
select public._check(35, 'geçersiz karar reddedilir', public._try(format($$select public.team_review_decide(array[%L]::uuid[], 'sil')$$, :'n1_v')) like '%project_invalid%');
select public.team_review_decide(array[:'n1_v'::uuid], 'changes', 'Rengi sıcak yapalım') as v \gset ch_
reset role;
select public._check(36, 'değişiklik istendi: durum + not + karar veren', :'ch_v'::int = 1 and public._state(:'n1_v'::uuid) = 'changes'
  and (select rev_note from public.space_items where id = :'n1_v'::uuid) = 'Rengi sıcak yapalım' and (select rev_decided_by from public.space_items where id = :'n1_v'::uuid) = :carol::uuid);
select public._check(37, 'ekleyene bildirim', exists (select 1 from public.notifications where recipient_id = :dave::uuid and dedupe_key like 'revdec:%changes%'));
set role authenticated;
select public._as_user(:dave);
select public._check(38, 'değişiklik istenen öğeyi ekleyen düzenler', public._try(format($$update public.space_items set title = 'Dolap notu v3' where id = %L$$, :'n1_v')) = 'ok');
select public._check(39, 'to-do: ekleyende "changes" satırı', exists (select 1 from public.team_project_todos() where kind = 'changes' and n = 1));
select public.team_review_submit(array[:'n1_v'::uuid]);
select public._as_user(:carol);
select public._check(40, 'to-do: liderde "review" satırı', exists (select 1 from public.team_project_todos() where kind = 'review' and n = 1));
select public.team_review_decide(array[:'n1_v'::uuid], 'approve');
reset role;
select public._check(41, 'onaylandı: karar alanları, not temizlendi', public._state(:'n1_v'::uuid) = 'approved' and (select rev_note from public.space_items where id = :'n1_v'::uuid) is null
  and (select rev_decided_at from public.space_items where id = :'n1_v'::uuid) is not null);
set role authenticated;
select public._as_user(:gina);
select public._check(42, 'onaylanan öğe artık herkese görünür', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 1);
select public._as_user(:frank);
select public._check(43, 'görüntüleyici de onaylıyı görür', (select count(*) from public.space_items where id = :'n1_v'::uuid) = 1);
reset role;
select public._check(44, 'denetim: approved + changes', public._aud('review_approved') = 1 and public._aud('review_changes') = 1);

-- ============================================================================================================================================
-- 5) Onaylı içerik kilidi, silme, değişiklik önerisi
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(45, 'onaylı öğenin başlığı düzenleyiciye kapalı', public._try(format($$update public.space_items set title = 'x' where id = %L$$, :'n1_v')) like '%review_content_locked%');
select public._check(46, 'onaylı öğeyi düzenleyici silemez', public._try(format($$delete from public.space_items where id = %L$$, :'n1_v')) like '%review_delete_forbidden%');
select public._check(47, 'toplu pano kaydı konumu yazar, durumu değiştiremez',
  array_length(public.space_save_layout(public._g('A1'), jsonb_build_array(jsonb_build_object('id', :'n1_v', 'x', 10, 'y', 20))), 1) = 1 and public._state(:'n1_v'::uuid) = 'approved');
select public._check(48, 'öneri: düzenleyici onaylı öğe için öneri yazar', public._try(format($$select public.team_review_propose(%L, 'Dolap notu SON', 'mat gri', '')$$, :'n1_v')) = 'ok');
select public._check(49, 'öneri satırı ekleyen ve lider tarafından okunur', (select count(*) from public.space_item_proposals) = 1);
select public._as_user(:gina);
select public._check(50, 'başka düzenleyici öneriyi okuyamaz', (select count(*) from public.space_item_proposals) = 0);
select public._check(51, 'öneri öğe satırında DURMAZ (başlık hâlâ eski)', (select title from public.space_items where id = :'n1_v'::uuid) = 'Dolap notu v3');
select public._as_user(:carol);
select public._check(52, 'lider öneri veremez', public._try(format($$select public.team_review_propose(%L, 'x', '', '')$$, :'n4_v')) like '%project_invalid%');
select public._check(53, 'kuyrukta 1 öneri', jsonb_array_length(public.team_review_pending(public._g('P')) -> 'proposals') = 1);
select public._as_user(:dave);
select public._try(format($$select public.team_review_withdraw_proposal(%L)$$, :'n1_v')) as r \gset wp_
select public._check(54, 'ekleyen öneriyi geri çekebilir', :'wp_r' = 'ok' and (select count(*) from public.space_item_proposals) = 0);
select public.team_review_propose(:'n1_v'::uuid, 'Dolap notu SON', 'mat gri', '');
select public._as_user(:gina);
select public._check(55, 'düzenleyici öneri kararı veremez', public._try(format($$select public.team_review_decide_proposal(%L, 'approve')$$, :'n1_v')) like '%team_forbidden%');
select public._as_user(:carol);
select public._check(56, 'öneride değişiklik için not zorunlu', public._try(format($$select public.team_review_decide_proposal(%L, 'changes')$$, :'n1_v')) like '%project_invalid%');
select public.team_review_decide_proposal(:'n1_v'::uuid, 'approve');
select public._check(57, 'öneri onaylandı: alanlar öğeye yazıldı, öneri silindi, durum onaylı',
  (select title from public.space_items where id = :'n1_v'::uuid) = 'Dolap notu SON' and (select body from public.space_items where id = :'n1_v'::uuid) = 'mat gri'
  and (select count(*) from public.space_item_proposals) = 0 and public._state(:'n1_v'::uuid) = 'approved');
select public._as_user(:dave);
select public._check(58, 'öneri tablosuna doğrudan yazılamaz', public._try(format($$insert into public.space_item_proposals (item_id, space_id) values (%L, %L)$$, :'n1_v', public._g('A1'))) like '%permission denied%');
select public._as_user(:carol);
delete from public.space_items where id = :'n4_v'::uuid;
select public._check(59, 'lider onaylı öğeyi siler', (select count(*) from public.space_items where id = :'n4_v'::uuid) = 0);
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Silinecek taslak', '', :dave::uuid) returning id as v \gset dd_
delete from public.space_items where id = :'dd_v'::uuid;
select public._check(60, 'ekleyen kendi taslağını siler', (select count(*) from public.space_items where id = :'dd_v'::uuid) = 0);
reset role;

-- ============================================================================================================================================
-- 6) Paket (workflow): aynı alan + rev_unit birlikte karar görür
-- ============================================================================================================================================
insert into public.workflows (creator_id, title) values (:dave::uuid, 'Plan → render') returning id as v \gset wf_
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by, source_workflow_id, source_role) values (public._g('A1'), 'note', 'Adım 1', '>> girdi', :dave::uuid, :'wf_v'::uuid, 'step') returning id as v \gset w1_
insert into public.space_items (space_id, kind, title, body, created_by, source_workflow_id, source_role) values (public._g('A1'), 'note', 'Adım 2', '<< çıktı', :dave::uuid, :'wf_v'::uuid, 'step') returning id as v \gset w2_
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Bağımsız', '', :dave::uuid) returning id as v \gset w3_
select public.team_review_submit(array[:'w1_v'::uuid]) as v \gset ws_
reset role;
select public._check(61, 'paket: tek öğeyi göndermek tüm paketi gönderir; bağımsız öğe taslak kalır', :'ws_v'::int = 2 and public._state(:'w1_v'::uuid) = 'pending' and public._state(:'w2_v'::uuid) = 'pending' and public._state(:'w3_v'::uuid) = 'draft');
set role authenticated;
select public._as_user(:carol);
select public._check(62, 'paket: kuyrukta paket sayısı 2 görünür', (select (e ->> 'unit_count')::int from jsonb_array_elements(public.team_review_pending(public._g('P')) -> 'items') e where e ->> 'title' = 'Adım 1') = 2);
select public.team_review_decide(array[:'w2_v'::uuid], 'approve') as v \gset wd_
reset role;
select public._check(63, 'paket: biri onaylanınca ikisi onaylanır', :'wd_v'::int = 2 and public._state(:'w1_v'::uuid) = 'approved' and public._state(:'w2_v'::uuid) = 'approved');

-- ============================================================================================================================================
-- 7) Dosya anahtarı + kilit + arşiv
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public.team_review_submit(array[:'w3_v'::uuid]);
select public._check(64, 'düzenleyici onay anahtarını değiştiremez', public._try(format($$select public.team_file_set_review(%L, false)$$, public._g('F1'))) like '%team_forbidden%');
select public._as_user(:carol);
update public.space_items set locked = true where id = :'w3_v'::uuid;
select public._check(65, 'kilitli bekleyen öğe yine de onaylanabilir (kilit onay sütunlarını engellemez)', public.team_review_decide(array[:'w3_v'::uuid], 'approve') = 1);
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Kapanmadan önce', '', :dave::uuid) returning id as v \gset ko_
select public._as_user(:carol);
select public.team_file_set_review(public._g('F1'), false) as v \gset off_
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by) values (public._g('A1'), 'note', 'Kapandıktan sonra', '', :dave::uuid) returning id as v \gset ks_
reset role;
select public._check(66, 'onay kapanınca: eski taslak KENDİLİĞİNDEN onaylanmaz (sayı yalnız lidere görünenleri sayar), yeni öğe doğrudan onaylı', :'off_v'::int = 0 and public._state(:'ko_v'::uuid) = 'draft' and public._state(:'ks_v'::uuid) = 'approved');
select public._check(67, 'denetim: file_review_toggled', public._aud('file_review_toggled') = 1);
set role authenticated;
select public._as_user(:carol);
select public.team_file_set_review(public._g('F1'), true);
select public.team_archive_project(public._g('P'), true);
select public._as_user(:dave);
select public._check(68, 'arşivli projede gönderim reddedilir', public._try(format($$select public.team_review_submit(array[%L]::uuid[])$$, :'ko_v')) like '%project_archived%');
select public._as_user(:alice);
select public.team_archive_project(public._g('P'), false);
reset role;

-- ============================================================================================================================================
-- 8) Storage: taslak görselin dosyası da gizli
-- ============================================================================================================================================
select format('https://x.supabase.co/storage/v1/object/public/space-media/%s/%s.jpg', public._g('A1'), gen_random_uuid()) as v \gset url_
select regexp_replace(:'url_v', '^.*/space-media/', '') as v \gset obj_
insert into storage.objects (bucket_id, name, owner) values ('space-media', :'obj_v', :dave::uuid);
grant select on storage.objects to authenticated, anon;
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by, media_url) values (public._g('A1'), 'image', 'Dolap görseli', '', :dave::uuid, :'url_v') returning id as v \gset img_
select public._check(69, 'taslak görsel: ekleyen dosyayı okur', (select count(*) from storage.objects where bucket_id = 'space-media' and name = :'obj_v') = 1);
select public._as_user(:carol);
select public._check(70, 'taslak görsel: lider dosyayı OKUYAMAZ (onaya gönderilene kadar)', (select count(*) from storage.objects where bucket_id = 'space-media' and name = :'obj_v') = 0);
select public._as_user(:gina);
select public._check(71, 'taslak görsel: başka düzenleyici dosyayı OKUYAMAZ', (select count(*) from storage.objects where bucket_id = 'space-media' and name = :'obj_v') = 0);
select public._as_user(:frank);
select public._check(72, 'taslak görsel: görüntüleyici dosyayı okuyamaz', (select count(*) from storage.objects where bucket_id = 'space-media' and name = :'obj_v') = 0);
select public._as_user(:dave);
select public.team_review_submit(array[:'img_v'::uuid]);
select public._as_user(:gina);
select public._check(73, 'bekleyen görsel hâlâ gizli', (select count(*) from storage.objects where bucket_id = 'space-media' and name = :'obj_v') = 0);
select public._as_user(:carol);
select public.team_review_decide(array[:'img_v'::uuid], 'approve');
select public._as_user(:gina);
select public._check(74, 'onaylanınca dosya herkese açılır', (select count(*) from storage.objects where bucket_id = 'space-media' and name = :'obj_v') = 1);
reset role;

-- ============================================================================================================================================
-- 9) Kişisel Space ve eski ekip Space'i ETKİLENMEZ
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:hank);
select public.create_space('Kişisel', '', 'free') as v \gset ps_
select public._try(format($$insert into public.space_items (space_id, kind, title, body, created_by, rev_state) values (%L, 'note', 'n', '', %L, 'draft')$$, :'ps_v', :hank)) as r \gset pi_
select public._check(75, 'kişisel Space’e not: durum hep onaylı, sahte durum yok sayılır', :'pi_r' = 'ok'
  and (select count(*) from public.space_items where space_id = :'ps_v'::uuid and rev_state = 'approved') = 1, :'pi_r');
select public._try(format($$update public.space_items set title = 'yeni' where space_id = %L$$, :'ps_v')) as r \gset pu_
select public._try(format($$delete from public.space_items where space_id = %L$$, :'ps_v')) as r \gset pd_
select public._check(76, 'kişisel Space’te içerik/silme kuralı yok', :'pu_r' = 'ok' and :'pd_r' = 'ok' and (select count(*) from public.space_items where space_id = :'ps_v'::uuid) = 0);
reset role;

-- ============================================================================================================================================
-- 10) İstemci kapıları
-- ============================================================================================================================================
set role anon;
select public._as_user('');
select public._check(77, 'anon onay RPC’lerini çağıramaz', public._try($$select public.team_review_submit(array[gen_random_uuid()])$$) like '%permission denied%'
  and public._try($$select public.team_review_decide(array[gen_random_uuid()], 'approve')$$) like '%permission denied%'
  and public._try($$select public.team_review_pending(gen_random_uuid())$$) like '%permission denied%'
  and public._try($$select * from public.space_item_proposals$$) like '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(78, 'iç yardımcılar istemciye kapalı', public._try($$select public._team_review_targets(array[gen_random_uuid()], 'lead', gen_random_uuid())$$) like '%permission denied%'
  and public._try($$select public._team_notify_leads(gen_random_uuid(), null, 'x', 'y', 'z')$$) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
