-- Ekip kütüphanesi (docs/history/348-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-team-library.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set lib   'e0000000-0000-4000-8000-0000000000b1'
\set free  'e0000000-0000-4000-8000-0000000000b2'
\set d1    'e1000000-0000-4000-8000-0000000000b1'
\set d2    'e1000000-0000-4000-8000-0000000000b2'
\set n1    'e1000000-0000-4000-8000-0000000000b3'
\set f1    'e1000000-0000-4000-8000-0000000000b4'

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

-- Ekip kütüphanesi (alice sahip, bobby düzenleyici, carol izleyici, dave üye değil) + serbest bir Space.
insert into public.spaces (id, owner_id, title, kind, visibility) values (:'lib', :alice, 'Ekip kütüphanesi', 'team_library', 'private');
insert into public.spaces (id, owner_id, title, kind, visibility) values (:'free', :alice, 'Serbest', 'free', 'private');
insert into public.space_members (space_id, user_id, role) values
  (:'lib', :alice, 'owner'), (:'lib', :bobby, 'editor'), (:'lib', :carol, 'viewer'), (:'free', :alice, 'owner')
on conflict do nothing;
insert into public.space_groups (id, space_id, name, position, created_by) values
  ('e2000000-0000-4000-8000-0000000000b1', :'lib', 'Pazarlama', 0, :alice),
  ('e2000000-0000-4000-8000-0000000000b2', :'lib', 'Destek', 1, :alice);
insert into public.space_items (id, space_id, kind, is_draft, title, body, x, y, created_by) values
  (:'d1', :'lib', 'prompt', true, 'Satış e-postası', 'Merhaba {musteri}, {marka_adi} adına yazıyorum.', 10, 10, :alice),
  (:'d2', :'lib', 'prompt', true, 'Destek yanıtı', 'Sayın {musteri}, talebiniz alındı.', 20, 20, :alice),
  (:'n1', :'lib', 'note', false, 'Not', 'Bir not', 30, 30, :alice),
  (:'f1', :'free', 'prompt', true, 'Serbest taslak', 'Metin', 10, 10, :alice);
update public.space_items set group_id = 'e2000000-0000-4000-8000-0000000000b1' where id = :'d1';

-- 1) Tür -------------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public._check(1, 'create_space ekip kütüphanesi türünü kabul eder',
  public._try(format('select public.create_space(%L, %L, %L, %L, %L::text[])', 'Yeni kütüphane', '', 'team_library', 'private', '{Genel,Destek}')) = 'ok');
select public._check(2, 'create_space bilinmeyen türü reddeder',
  public._try(format('select public.create_space(%L, %L, %L)', 'X', '', 'bilinmeyen')) like '%space_invalid%');

-- 2) Onay yalnız RPC ile ----------------------------------------------------------------------------------------------------------------
select public._check(3, 'sahip bile approved_at sütununu doğrudan yazamaz',
  public._try(format('update public.space_items set approved_at = now(), approved_by = %L where id = %L', :alice, :'d1')) like '%space_approval_forbidden%');
select public._check(4, 'onaylı olarak EKLEMEK reddedilir',
  public._try(format($q$insert into public.space_items (space_id, kind, is_draft, title, body, created_by, approved_at, approved_by) values (%L, 'prompt', true, 'Hile', 'x', %L, now(), %L)$q$, :'lib', :alice, :alice)) like '%space_approval_forbidden%');
select public._check(5, 'sahip onaylar',
  public._try(format('select public.space_set_item_approval(%L, true)', :'d1')) = 'ok');
reset role;
select public._check(6, 'onay yazıldı: approved_at dolu, approved_by = onaylayan',
  (select approved_at is not null and approved_by = :alice::uuid from public.space_items where id = :'d1'));
select public._check(7, 'etkinlik geçmişine "item_approved" yazıldı',
  (select count(*) from public.space_activity where space_id = :'lib' and action = 'item_approved') = 1);

-- 3) Yetki -----------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(8, 'düzenleyici onaylayamaz', public._try(format('select public.space_set_item_approval(%L, true)', :'d2')) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(9, 'izleyici onaylayamaz', public._try(format('select public.space_set_item_approval(%L, true)', :'d2')) like '%space_forbidden%');
select public._as_user(:dave);
select public._check(10, 'üye olmayan için öğenin varlığı bile sızmaz (space_not_found)',
  public._try(format('select public.space_set_item_approval(%L, true)', :'d2')) like '%space_not_found%');
select public._as_user(:alice);
select public._check(11, 'not (taslak prompt olmayan) onaylanamaz', public._try(format('select public.space_set_item_approval(%L, true)', :'n1')) like '%space_invalid%');
select public._check(12, 'ekip kütüphanesi olmayan Space’te onay yok', public._try(format('select public.space_set_item_approval(%L, true)', :'f1')) like '%space_invalid%');
reset role;
select public._check(13, 'reddedilen çağrılar hiçbir şey onaylamadı',
  (select count(*) from public.space_items where approved_at is not null) = 1);

-- 4) İçerik değişince onay düşer, yerleşim değişince düşmez --------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(14, 'düzenleyici konumu/grubu/rengi/notu değiştirir: onay KALIR',
  public._try(format($q$update public.space_items set x = 99, y = 77, color = 'success', note = 'Not', group_id = 'e2000000-0000-4000-8000-0000000000b2' where id = %L$q$, :'d1')) = 'ok');
reset role;
select public._check(15, 'yerleşim değişikliği onayı düşürmedi', (select approved_at is not null from public.space_items where id = :'d1'));
set role authenticated;
select public._as_user(:bobby);
select public._check(16, 'düzenleyici prompt metnini değiştirir', public._try(format($q$update public.space_items set body = 'Yeni metin {musteri}' where id = %L$q$, :'d1')) = 'ok');
reset role;
select public._check(17, 'metin değişince onay KENDİLİĞİNDEN düştü',
  (select approved_at is null and approved_by is null from public.space_items where id = :'d1'));
set role authenticated;
select public._as_user(:alice);
select public._check(18, 'sahip yeniden onaylar', public._try(format('select public.space_set_item_approval(%L, true)', :'d1')) = 'ok');
select public._check(19, 'başlık değişince de onay düşer', public._try(format($q$update public.space_items set title = 'Başka başlık' where id = %L$q$, :'d1')) = 'ok');
reset role;
select public._check(20, 'başlık değişikliği onayı düşürdü', (select approved_at is null from public.space_items where id = :'d1'));

-- 5) Kilit ile birlikte ------------------------------------------------------------------------------------------------------------------
update public.space_items set locked = true where id = :'d1';
set role authenticated;
select public._as_user(:alice);
select public._check(21, 'sahip kilitli taslağı da onaylayabilir', public._try(format('select public.space_set_item_approval(%L, true)', :'d1')) = 'ok');
select public._check(22, 'kilitli taslağın metni hâlâ değiştirilemez', public._try(format($q$update public.space_items set body = 'x' where id = %L$q$, :'d1')) like '%space_item_locked%');
select public._check(23, 'onay geri alınır (RPC)', public._try(format('select public.space_set_item_approval(%L, false)', :'d1')) = 'ok');
reset role;
select public._check(24, 'geri alma: sütunlar boşaldı + "item_unapproved" etkinliği',
  (select approved_at is null and approved_by is null from public.space_items where id = :'d1')
  and (select count(*) from public.space_activity where space_id = :'lib' and action = 'item_unapproved') = 1);
update public.space_items set locked = false where id = :'d1';

-- 6) Arşiv ------------------------------------------------------------------------------------------------------------------------------
update public.spaces set archived_at = now() where id = :'lib';
set role authenticated;
select public._as_user(:alice);
select public._check(25, 'arşivlenmiş Space’te onay verilemez', public._try(format('select public.space_set_item_approval(%L, true)', :'d2')) like '%space_forbidden%');
reset role;
update public.spaces set archived_at = null where id = :'lib';

-- 7) Ortak değişkenler -------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(26, 'düzenleyici değişken yazar', public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'marka_adi', 'Acme')) = 'ok');
select public._check(27, 'aynı ad yeniden yazılınca günceller (ikinci satır açılmaz)',
  public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'marka_adi', 'Acme Ltd')) = 'ok'
  and (select count(*) from public.space_variables where space_id = :'lib') = 1);
select public._check(28, 'boşluklu / süslü parantezli / çok uzun ad reddedilir',
  public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'marka adi', 'x')) like '%space_invalid%'
  and public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', '{ton}', 'x')) like '%space_invalid%'
  and public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', repeat('a', 41), 'x')) like '%space_invalid%');
select public._check(29, '500 karakterden uzun değer reddedilir', public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'ton', repeat('a', 501))) like '%space_invalid%');
select public._check(30, 'istemci tabloya doğrudan yazamaz',
  public._try(format($q$insert into public.space_variables (space_id, name, value) values (%L, 'hile', 'x')$q$, :'lib')) like '%permission denied%'
  and public._try(format($q$update public.space_variables set value = 'x' where space_id = %L$q$, :'lib')) like '%permission denied%');
select public._check(31, 'üye değişkenleri okur', (select count(*) from public.space_variables where space_id = :'lib') = 1);
select public._as_user(:carol);
select public._check(32, 'izleyici de okur ama yazamaz',
  (select count(*) from public.space_variables where space_id = :'lib') = 1
  and public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'ton', 'x')) like '%space_forbidden%'
  and public._try(format('select public.space_delete_variable(%L, %L)', :'lib', 'marka_adi')) like '%space_forbidden%');
select public._as_user(:dave);
select public._check(33, 'üye olmayan değişkenleri OKUYAMAZ ve yazamaz',
  (select count(*) from public.space_variables where space_id = :'lib') = 0
  and public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'ton', 'x')) like '%space_not_found%');
select public._as_user(:alice);
select public._check(34, 'ekip kütüphanesi olmayan Space’te değişken yok', public._try(format('select public.space_set_variable(%L, %L, %L)', :'free', 'ton', 'x')) like '%space_invalid%');
-- 50 sınırı: 1 var, 49 daha eklenir, 51. reddedilir
select public._check(35, '49 değişken daha eklenir',
  (select count(*) from generate_series(1, 49) g where public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'v' || g, 'x')) <> 'ok') = 0);
select public._check(36, '51. değişken reddedilir (space_variable_limit), var olanı güncellemek serbest',
  public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'fazla', 'x')) like '%space_variable_limit%'
  and public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'v1', 'yeni')) = 'ok');
select public._as_user(:bobby);
create temp table _del37 as select public._try(format('select public.space_delete_variable(%L, %L)', :'lib', 'v2')) as res;
select public._check(37, 'düzenleyici değişken siler', (select res from _del37) = 'ok'
  and (select count(*) from public.space_variables where space_id = :'lib' and name = 'v2') = 0);

-- 8) Kişisel API okumaları -----------------------------------------------------------------------------------------------------------------
select public._as_user(:alice);
select public.space_set_item_approval(:'d2', true);
select public._as_user(:carol);
select public._check(38, 'api_me_libraries: üye kendi kütüphanesini ve onaylı sayısını görür',
  (select count(*) from public.api_me_libraries() where id = :'lib'::uuid and approved_count = 1 and role = 'viewer') = 1);
select public._check(39, 'api_me_libraries: serbest Space listelenmez', (select count(*) from public.api_me_libraries() where id = :'free'::uuid) = 0);
select public._check(40, 'api_me_library_prompts: varsayılan YALNIZ onaylılar',
  (select count(*) from public.api_me_library_prompts(:'lib'::uuid)) = 1
  and (select title from public.api_me_library_prompts(:'lib'::uuid)) = 'Destek yanıtı');
select public._check(41, 'api_me_library_prompts: onaysızlar istenirse gelir', (select count(*) from public.api_me_library_prompts(:'lib'::uuid, true)) = 2);
select public._check(42, 'api_me_library_variables: üye değerleri okur', (select count(*) from public.api_me_library_variables(:'lib'::uuid)) = 49);
select public._as_user(:dave);
select public._check(43, 'üye olmayan kütüphaneyi, promptlarını ve değişkenlerini LİSTELEYEMEZ',
  (select count(*) from public.api_me_libraries()) = 0
  and (select count(*) from public.api_me_library_prompts(:'lib'::uuid, true)) = 0
  and (select count(*) from public.api_me_library_variables(:'lib'::uuid)) = 0);
reset role;

-- 9) Anon ve silme ----------------------------------------------------------------------------------------------------------------------
set role anon;
select public._check(44, 'anon RPC’leri çağıramaz',
  public._try(format('select public.space_set_item_approval(%L, true)', :'d2')) like '%permission denied%'
  and public._try(format('select public.space_set_variable(%L, %L, %L)', :'lib', 'a', 'b')) like '%permission denied%'
  and public._try('select * from public.api_me_libraries()') like '%permission denied%');
select public._check(45, 'anon değişken tablosunu okuyamaz', public._try('select * from public.space_variables') like '%permission denied%');
reset role;
delete from public.spaces where id = :'lib';
select public._check(46, 'Space silinince değişkenleri de gider', (select count(*) from public.space_variables where space_id = :'lib') = 0);

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
