-- Topluluk kapağı + topluluk görseli adresi doğrulaması: DB/RLS/RPC testi (docs/history/191-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-cover.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(üye) carol(üye) dave(dışarıdan).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

grant select, insert, delete on storage.objects to anon, authenticated;

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
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text), public._q(text) to public;

\set base 'https://x.supabase.co/storage/v1/object/public/'

-- 1. Hata düzeltmesi: topluluk görseli adresi artık `community-avatars` bucket'ından kabul edilir.
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$select public.create_community('Görselli', 'a', 'public', %L, 50, '{}', 'general', 'members', 'members', null, false)$q$,
  :'base' || 'community-avatars/' || :alice || '/group-1.jpg')) as v \gset c1_
select public._check(1, 'create_community: community-avatars adresli görsel kabul edilir (eskiden invalid_avatar)', :'c1_v' = 'ok', :'c1_v');
select public._try(format($q$select public.create_community('Eski', 'a', 'public', %L, 50, '{}', 'general', 'members', 'members', null, false)$q$,
  :'base' || 'avatars/' || :alice || '/group-1.jpg')) as v \gset c2_
select public._check(2, 'create_community: eski avatars adresi hâlâ kabul edilir (geriye uyum)', :'c2_v' = 'ok', :'c2_v');
select public._try(format($q$select public.create_community('Kötü', 'a', 'public', %L, 50, '{}', 'general', 'members', 'members', null, false)$q$,
  'https://evil.example/storage/v1/object/public/prompt-media/x.jpg')) as v \gset c3_
select public._check(3, 'create_community: başka bucket / başka adres reddedilir', :'c3_v' = 'invalid_avatar', :'c3_v');

-- Topluluklar: herkese açık (alice sahibi, bobby/carol üye), tamamen kapalı.
select (public.create_community('Açık', 'a', 'public', null, 50, array[:bobby]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id') as v \gset pub_
select (public.create_community('Gizli', 'a', 'private', null, 50, '{}', 'general', 'members', 'members', null, false) ->> 'group_id') as v \gset prv_
insert into public._ctx values ('pub', :'pub_v'), ('prv', :'prv_v');
select public._as_user(:bobby);
select public.respond_community_invitation((select id from public.chat_group_invitations where group_id = public._g('pub') and invitee_id = :bobby and status = 'pending'), true, false);
select public._as_user(:alice);

-- 2. update_chat_group: kapak alanları
select public._try(format($q$select public.update_chat_group(%L, jsonb_build_object('avatar_url', %L))$q$, public._g('pub'),
  :'base' || 'community-avatars/' || :alice || '/group-2.jpg')) as v \gset u1_
select public._check(4, 'update_chat_group: topluluk görseli (community-avatars) kaydedilir', :'u1_v' = 'ok'
  and (select avatar_url from public.chat_groups where id = public._g('pub')) like '%community-avatars%group-2.jpg', :'u1_v');
select public._try(format($q$select public.update_chat_group(%L, jsonb_build_object('cover_url', %L, 'cover_color', null))$q$, public._g('pub'),
  :'base' || 'community-avatars/' || :alice || '/cover-1.jpg')) as v \gset u2_
select public._check(5, 'update_chat_group: kapak fotoğrafı kaydedilir', :'u2_v' = 'ok'
  and (select cover_url from public.chat_groups where id = public._g('pub')) like '%community-avatars%cover-1.jpg', :'u2_v');
select public._try(format($q$select public.update_chat_group(%L, jsonb_build_object('cover_url', null, 'cover_color', '#A1B2C3'))$q$, public._g('pub'))) as v \gset u3_
select public._check(6, 'update_chat_group: kapak rengi küçük harfe çevrilip kaydedilir, fotoğraf temizlenir', :'u3_v' = 'ok'
  and (select cover_color from public.chat_groups where id = public._g('pub')) = '#a1b2c3'
  and (select cover_url from public.chat_groups where id = public._g('pub')) is null, :'u3_v');
select public._check(7, 'update_chat_group: geçersiz renk reddedilir',
  public._try(format($q$select public.update_chat_group(%L, '{"cover_color":"red"}'::jsonb)$q$, public._g('pub'))) = 'invalid_cover');
select public._check(8, 'update_chat_group: kapak fotoğrafı yalnız community-avatars bucket''ından olabilir',
  public._try(format($q$select public.update_chat_group(%L, jsonb_build_object('cover_url', %L))$q$, public._g('pub'), :'base' || 'avatars/' || :alice || '/x.jpg')) = 'invalid_cover'
  and public._try(format($q$select public.update_chat_group(%L, jsonb_build_object('cover_url', %L))$q$, public._g('pub'), 'https://evil.example/storage/v1/object/public/prompt-media/x.jpg')) = 'invalid_cover');
select public._check(9, 'update_chat_group: kapak alanı verilmeyen güncelleme mevcut kapağı korur',
  public._try(format($q$select public.update_chat_group(%L, '{"description":"yeni"}'::jsonb)$q$, public._g('pub'))) = 'ok'
  and (select cover_color from public.chat_groups where id = public._g('pub')) = '#a1b2c3');
select public._as_user(:bobby);
select public._check(10, 'update_chat_group: edit_settings yetkisi olmayan üye kapağı değiştiremez',
  public._try(format($q$select public.update_chat_group(%L, '{"cover_color":"#000000"}'::jsonb)$q$, public._g('pub'))) <> 'ok'
  and (select cover_color from public.chat_groups where id = public._g('pub')) = '#a1b2c3');
reset role;
select public._check(11, 'tablo: doğrudan geçersiz renk / adres CHECK ile reddedilir',
  public._try(format($q$update public.chat_groups set cover_color = 'mavi' where id = %L$q$, public._g('pub'))) <> 'ok'
  and public._try(format($q$update public.chat_groups set cover_url = 'https://evil.example/x.jpg' where id = %L$q$, public._g('pub'))) <> 'ok');

-- 3. Üye olmayanın kapağı (community_card_covers) ve Storage okuma yetkisi (gerçek RLS)
update public.chat_groups set cover_url = :'base' || 'community-avatars/' || :alice || '/cover-9.jpg' where id = public._g('pub');
update public.chat_groups set cover_url = :'base' || 'community-avatars/' || :alice || '/cover-prv.jpg', cover_color = '#112233' where id = public._g('prv');
insert into storage.objects (bucket_id, name, owner) values
  ('community-avatars', :alice || '/cover-9.jpg', :alice),
  ('community-avatars', :alice || '/cover-prv.jpg', :alice),
  ('community-avatars', :alice || '/baska.jpg', :alice);
set role authenticated;
select public._as_user(:dave);
select public._check(12, 'community_card_covers: yabancı herkese açık topluluğun kapağını görür; tamamen kapalının kapağını görmez',
  (select count(*) from public.community_card_covers(array[public._g('pub'), public._g('prv')])) = 1
  and (select cover_url from public.community_card_covers(array[public._g('pub')])) like '%cover-9.jpg');
select public._check(13, 'Storage: yabancı açık topluluğun kapak dosyasını okur; tamamen kapalının kapağını ve bağlı olmayan dosyayı okumaz',
  (select count(*) from storage.objects where bucket_id = 'community-avatars' and name = (:alice || '/cover-9.jpg')) = 1
  and (select count(*) from storage.objects where bucket_id = 'community-avatars' and name = (:alice || '/cover-prv.jpg')) = 0
  and (select count(*) from storage.objects where bucket_id = 'community-avatars' and name = (:alice || '/baska.jpg')) = 0);
select public._as_user('');
set role anon;
select public._check(14, 'ziyaretçi: açık topluluğun kapağını (RPC + dosya) görür, kapalınınkini görmez',
  (select count(*) from public.community_card_covers(array[public._g('pub'), public._g('prv')])) = 1
  and (select count(*) from storage.objects where bucket_id = 'community-avatars' and name = (:alice || '/cover-9.jpg')) = 1
  and (select count(*) from storage.objects where bucket_id = 'community-avatars' and name = (:alice || '/cover-prv.jpg')) = 0);
reset role;

-- 4. Yetim taraması: kapak dosyası kullanımda sayılır, bağlı olmayan dosya yetimdir
update storage.objects set created_at = now() - interval '3 days' where bucket_id = 'community-avatars';
select public._check(15, 'orphan_storage_objects: kapak dosyası süpürülmez; bağlı olmayan dosya yetim olarak listelenir',
  (select count(*) from public.orphan_storage_objects() where name = (:alice || '/cover-9.jpg')) = 0
  and (select count(*) from public.orphan_storage_objects() where name = (:alice || '/cover-prv.jpg')) = 0
  and (select count(*) from public.orphan_storage_objects() where name = (:alice || '/baska.jpg')) = 1);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
