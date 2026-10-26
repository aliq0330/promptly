-- Promptly Spaces: DB/RLS/RPC/Storage testi (docs/history/213-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/spaces.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(düzenleyici) carol(görüntüleyici) dave(yabancı) erin(alice tarafından engellenmiş)
--               frank(bağlantı sahibi). Ziyaretçi = boş kimlik.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank')) as u(id, name);
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
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return r; exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._gt(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text),
  public._val(text), public._g(text), public._gt(text), public._set(text, text), public._q(text) to public;

\set img '''https://x.supabase.co/storage/v1/object/public/prompt-media/33333333-3333-4333-8333-333333333333/p1.jpg'''
\set img2 '''https://x.supabase.co/storage/v1/object/public/prompt-media/33333333-3333-4333-8333-333333333333/p2.jpg'''

-- alice erin'i engeller; alice bir topluluk kurar (topluluğa özgü içerik testi için).
insert into public.blocks (blocker_id, blocked_id) values (:alice, :erin);
set role authenticated;
select public._as_user(:alice);
select public._set('C', (public.create_community('Topluluk C', 'açıklama', 'public', null, 50, array[]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id'));
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :carol, 'Açık prompt', 'd', 'gece yarısı ejderha', 'image', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :carol, 'Özel prompt', 'd', 'gizli metin', 'text', 'published', 'private'),
  ('a0000000-0000-4000-8000-0000000000a3', :carol, 'İkinci açık', 'd', 'mor gökyüzü', 'image', 'published', 'public');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-0000000000a4', :alice, 'Topluluk promptu', 'd', 'topluluk', 'text', 'published', 'private', public._g('C'));
insert into public.prompt_media (prompt_id, url, width, height) values
  ('a0000000-0000-4000-8000-0000000000a1', :img, 800, 600),
  ('a0000000-0000-4000-8000-0000000000a3', :img2, 600, 800);

-- ============================================================================
-- 1. Oluşturma
-- ============================================================================
set role anon;
select public._as_user('');
select public._check(1, 'ziyaretçi Space oluşturamaz',
  public._try($q$select public.create_space('X')$q$) like '%permission denied%');
set role authenticated;
select public._as_user(:alice);
select public._check(2, 'boş ad reddedilir',
  public._try($q$select public.create_space('   ')$q$) like '%space_title_required%');
select public._check(3, 'geçersiz tür/görünürlük reddedilir',
  public._try($q$select public.create_space('A', '', 'nope')$q$) like '%space_invalid%'
  and public._try($q$select public.create_space('A', '', 'free', 'everyone')$q$) like '%space_invalid%');
select public._set('S', public.create_space('Ejderha Dünyası', 'karakterler', 'character', 'private', array['Karakterler', 'Mekânlar', ' '])::text);
select public._check(4, 'sahip: Space + sahip üyeliği + 2 grup (boş ad atlanır) + "created" etkinliği',
  public._val(format($q$select role from public.space_members where space_id = %L and user_id = auth.uid()$q$, public._g('S'))) = 'owner'
  and public._cnt(format($q$select count(*) from public.space_groups where space_id = %L$q$, public._g('S'))) = 2
  and public._cnt(format($q$select count(*) from public.space_activity where space_id = %L and action = 'created'$q$, public._g('S'))) = 1);
select public._check(5, 'istemci spaces tablosuna doğrudan ekleyemez (yalnız RPC)',
  public._try(format($q$insert into public.spaces (owner_id, title) values (%L, 'doğrudan')$q$, :alice)) like '%permission denied%');

-- ============================================================================
-- 2. Öğeler: kaynak doğrulaması
-- ============================================================================
select public._set('G1', public._val(format($q$select id from public.space_groups where space_id = %L and name = 'Karakterler'$q$, public._g('S'))));
select public._check(6, 'herkese açık promptun görseli eklenir (gruba bağlı)',
  public._try(format($q$insert into public.space_items (id, space_id, kind, prompt_id, media_url, group_id, created_by) values ('b0000000-0000-4000-8000-000000000001', %L, 'image', 'a0000000-0000-4000-8000-0000000000a1', %L, %L, auth.uid())$q$,
    public._g('S'), :img, public._g('G1'))) = 'ok');
select public._check(7, 'aynı görsel ikinci kez eklenemez (benzersizlik)',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, media_url, created_by) values (%L, 'image', 'a0000000-0000-4000-8000-0000000000a1', %L, auth.uid())$q$,
    public._g('S'), :img)) like '%space_items_unique_image%');
select public._check(8, 'başkasının ÖZEL promptu eklenemez',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000a2', auth.uid())$q$,
    public._g('S'))) like '%space_source_unavailable%');
select public._check(9, 'topluluğa ait içerik eklenemez (kendi topluluğunda bile)',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000a4', auth.uid())$q$,
    public._g('S'))) like '%space_source_unavailable%');
select public._check(10, 'görsel kimliği promptun kendi medyası değilse reddedilir',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, media_url, created_by) values (%L, 'image', 'a0000000-0000-4000-8000-0000000000a1', %L, auth.uid())$q$,
    public._g('S'), :img2)) like '%space_source_unavailable%');
select public._check(11, 'yükleme adresi başka Space''in klasöründeyse reddedilir; kendi klasöründe kabul',
  public._try(format($q$insert into public.space_items (space_id, kind, media_url, created_by) values (%L, 'image', 'https://x.supabase.co/storage/v1/object/public/space-media/%s/c0000000-0000-4000-8000-000000000001.jpg', auth.uid())$q$,
    public._g('S'), gen_random_uuid())) like '%space_invalid%'
  and public._try(format($q$insert into public.space_items (space_id, kind, media_url, created_by) values (%L, 'image', 'https://x.supabase.co/storage/v1/object/public/space-media/%s/c0000000-0000-4000-8000-000000000001.jpg', auth.uid())$q$,
    public._g('S'), public._g('S'))) = 'ok');
select public._check(12, 'prompt başvurusu + kendi taslağı + not eklenir; created_by başkası olamaz',
  public._try(format($q$insert into public.space_items (id, space_id, kind, prompt_id, created_by) values ('b0000000-0000-4000-8000-000000000002', %L, 'prompt', 'a0000000-0000-4000-8000-0000000000a3', auth.uid())$q$, public._g('S'))) = 'ok'
  and public._try(format($q$insert into public.space_items (space_id, kind, is_draft, source_prompt_id, title, body, created_by) values (%L, 'prompt', true, 'a0000000-0000-4000-8000-0000000000a3', 'Taslağım', 'mor gökyüzü, sinematik', auth.uid())$q$, public._g('S'))) = 'ok'
  and public._try(format($q$insert into public.space_items (id, space_id, kind, title, body, note, created_by) values ('b0000000-0000-4000-8000-000000000003', %L, 'note', 'Işık', 'altın saat', '', auth.uid())$q$, public._g('S'))) = 'ok'
  and public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'sahte', %L)$q$, public._g('S'), :bobby)) like '%row-level security%');
select public._check(13, 'gizli not yalnız notta olabilir; aynı Space''te olmayan gruba bağlanamaz',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, is_private, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000a1', true, auth.uid())$q$, public._g('S'))) like '%space_items_private_notes_only%'
  and public._try(format($q$insert into public.space_items (space_id, kind, title, group_id, created_by) values (%L, 'note', 'n', %L, auth.uid())$q$, public._g('S'), gen_random_uuid())) like '%space_invalid%');
select public._set('PRIVNOTE', 'b0000000-0000-4000-8000-000000000004');
select public._try(format($q$insert into public.space_items (id, space_id, kind, title, body, is_private, created_by) values ('b0000000-0000-4000-8000-000000000004', %L, 'note', 'Gizli plan', 'yalnız ekip', true, auth.uid())$q$, public._g('S')));
select public._check(14, 'öğenin kimliği/kaynağı değiştirilemez',
  public._try($q$update public.space_items set kind = 'note' where id = 'b0000000-0000-4000-8000-000000000001'$q$) like '%space_invalid%'
  and public._try($q$update public.space_items set prompt_id = 'a0000000-0000-4000-8000-0000000000a3' where id = 'b0000000-0000-4000-8000-000000000001'$q$) like '%space_invalid%');
select public._check(15, 'etkinlik: arka arkaya eklenen görseller tek satırda birleşir (count=2), konum değişikliği kaydedilmez',
  public._cnt(format($q$select count from public.space_activity where space_id = %L and action = 'image_added'$q$, public._g('S'))) = 2);

-- ============================================================================
-- 3. Davet + roller
-- ============================================================================
select public._check(16, 'engellenen kullanıcı davet edilemez; kendine davet reddedilir',
  public._try(format($q$select public.invite_space_member(%L, 'erin', 'viewer')$q$, public._g('S'))) like '%space_user_not_found%'
  and public._try(format($q$select public.invite_space_member(%L, 'alice', 'viewer')$q$, public._g('S'))) like '%space_self_invite%');
select public._set('INV_B', public.invite_space_member(public._g('S'), 'bobby', 'editor')::text);
select public._set('INV_C', public.invite_space_member(public._g('S'), 'carol', 'viewer')::text);
select public._check(17, 'aynı kişiye ikinci bekleyen davet reddedilir',
  public._try(format($q$select public.invite_space_member(%L, 'bobby', 'viewer')$q$, public._g('S'))) like '%space_invite_exists%');
select public._as_user(:bobby);
select public._check(18, 'davetli Space''i henüz okuyamaz ama davetini (ad + davet eden) görür; bildirim gelmiş',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0
  and public._val($q$select space_title || '/' || inviter_username from public.my_space_invitations()$q$) = 'Ejderha Dünyası/alice'
  and public._cnt($q$select count(*) from public.notifications where message = 'Seni "Ejderha Dünyası" Space''ine davet etti.'$q$) = 1);
select public._check(19, 'başkası daveti yanıtlayamaz',
  public._try(format($q$select public.respond_space_invitation(%L, true)$q$, public._g('INV_C'))) like '%space_invite_not_found%');
select public.respond_space_invitation(public._g('INV_B'), true);
select public._as_user(:carol);
select public.respond_space_invitation(public._g('INV_C'), true);
select public._as_user(:bobby);
select public._check(20, 'düzenleyici: öğe ekler, düzenler, yerleşimi kaydeder (yalnız var olan öğeler döner)',
  public._try(format($q$insert into public.space_items (id, space_id, kind, title, created_by) values ('b0000000-0000-4000-8000-000000000005', %L, 'note', 'Bobby notu', auth.uid())$q$, public._g('S'))) = 'ok'
  and public._cnt($q$with u as (update public.space_items set body = 'güncel' where id = 'b0000000-0000-4000-8000-000000000003' returning 1) select count(*) from u$q$) = 1
  and public._val(format($q$select array_length(public.space_save_layout(%L, '[{"id":"b0000000-0000-4000-8000-000000000001","x":120,"y":-40,"w":300,"h":220,"z":3},{"id":"b0000000-0000-4000-8000-0000000000ff","x":1,"y":1}]'::jsonb), 1)$q$, public._g('S'))) = '1'
  and public._val($q$select x || ',' || y || ',' || w || ',' || z from public.space_items where id = 'b0000000-0000-4000-8000-000000000001'$q$) = '120,-40,300,3');
select public._check(21, 'düzenleyici sahip yetkilerini devralmaz: ad/görünürlük değiştiremez, silemez, davet/bağlantı/rol yapamaz',
  public._cnt(format($q$with u as (update public.spaces set title = 'ele geçir', visibility = 'public' where id = %L returning 1) select count(*) from u$q$, public._g('S'))) = 0
  and public._cnt(format($q$with d as (delete from public.spaces where id = %L returning 1) select count(*) from d$q$, public._g('S'))) = 0
  and public._try(format($q$select public.invite_space_member(%L, 'dave', 'viewer')$q$, public._g('S'))) like '%space_forbidden%'
  and public._try(format($q$select public.create_space_link(%L)$q$, public._g('S'))) like '%space_forbidden%'
  and public._try(format($q$select public.set_space_member_role(%L, %L, 'editor')$q$, public._g('S'), :carol)) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(22, 'görüntüleyici okur ama düzenleyemez (ekleme hata, güncelleme/silme 0 satır, yerleşim reddedilir)',
  public._cnt(format($q$select count(*) from public.space_items where space_id = %L$q$, public._g('S'))) >= 6
  and public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'x', auth.uid())$q$, public._g('S'))) like '%row-level security%'
  and public._cnt($q$with u as (update public.space_items set title = 'x' where id = 'b0000000-0000-4000-8000-000000000003' returning 1) select count(*) from u$q$) = 0
  and public._cnt($q$with d as (delete from public.space_items where id = 'b0000000-0000-4000-8000-000000000003' returning 1) select count(*) from d$q$) = 0
  and public._try(format($q$select public.space_save_layout(%L, '[]'::jsonb)$q$, public._g('S'))) like '%space_forbidden%');
select public._check(23, 'üye gizli notu ve etkinlik geçmişini görür; üye listesini görür',
  public._cnt($q$select count(*) from public.space_items where id = 'b0000000-0000-4000-8000-000000000004'$q$) = 1
  and public._cnt(format($q$select count(*) from public.space_activity where space_id = %L$q$, public._g('S'))) > 0
  and public._cnt(format($q$select count(*) from public.space_members where space_id = %L$q$, public._g('S'))) = 3);
select public._as_user(:dave);
select public._check(24, 'yabancı özel Space''in hiçbir parçasını göremez (satır, öğe, grup, palet, üye, etkinlik)',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L$q$, public._g('S'))) = 0
  and public._cnt(format($q$select count(*) from public.space_groups where space_id = %L$q$, public._g('S'))) = 0
  and public._cnt(format($q$select count(*) from public.space_members where space_id = %L$q$, public._g('S'))) = 0
  and public._cnt(format($q$select count(*) from public.space_activity where space_id = %L$q$, public._g('S'))) = 0
  and public._try(format($q$select public.set_space_favorite(%L, true)$q$, public._g('S'))) like '%space_not_found%');

-- ============================================================================
-- 4. Paletler + gruplar
-- ============================================================================
select public._as_user(:bobby);
select public._check(25, 'palet: geçersiz HEX reddedilir, büyük harf küçültülür, sıra korunur',
  public._try(format($q$insert into public.space_palettes (space_id, name, colors, created_by) values (%L, 'Kötü', array['#12345G'], auth.uid())$q$, public._g('S'))) like '%space_palettes_colors_check%'
  and public._try(format($q$insert into public.space_palettes (id, space_id, name, colors, created_by) values ('d0000000-0000-4000-8000-000000000001', %L, 'Gece', array['#0A0B2C', '#ff7a1a', '#fefefe'], auth.uid())$q$, public._g('S'))) = 'ok'
  and public._val($q$select array_to_string(colors, ',') from public.space_palettes where id = 'd0000000-0000-4000-8000-000000000001'$q$) = '#0a0b2c,#ff7a1a,#fefefe');
select public._check(26, 'grup silinince içindeki öğeler silinmez, gruptan çıkar',
  public._cnt(format($q$with d as (delete from public.space_groups where id = %L returning 1) select count(*) from d$q$, public._g('G1'))) = 1
  and public._val($q$select coalesce(group_id::text, 'yok') from public.space_items where id = 'b0000000-0000-4000-8000-000000000001'$q$) = 'yok');
select public._as_user(:carol);
select public._check(27, 'görüntüleyici palet ekleyemez',
  public._try(format($q$insert into public.space_palettes (space_id, name, created_by) values (%L, 'x', auth.uid())$q$, public._g('S'))) like '%row-level security%');

-- ============================================================================
-- 5. Herkese açık + gizli not
-- ============================================================================
select public._as_user(:alice);
update public.spaces set visibility = 'public' where id = public._g('S');
set role anon;
select public._as_user('');
select public._check(28, 'herkese açık Space ziyaretçiye görünür; gizli not ve üye listesi görünmez (etkinlik varsayılan olarak görünür — 242; "yalnız üyeler" ayarı space-comments-activity.sql)',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 1
  and public._cnt(format($q$select count(*) from public.space_items where space_id = %L and kind = 'note'$q$, public._g('S'))) = 2
  and public._cnt($q$select count(*) from public.space_items where id = 'b0000000-0000-4000-8000-000000000004'$q$) = 0
  and public._cnt(format($q$select count(*) from public.space_members where space_id = %L$q$, public._g('S'))) <= 0);
select public._check(29, 'ziyaretçi herkese açık Space''lerde listeler ve arar; yazamaz',
  public._cnt($q$select count(*) from public.list_spaces('public')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('public', 'ejderha')$q$) = 1
  and public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'x', null)$q$, public._g('S'))) like '%permission denied%');
set role authenticated;
select public._as_user(:erin);
select public._check(30, 'sahibinin engellediği kullanıcı herkese açık Space''i de göremez',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0
  and public._cnt($q$select count(*) from public.list_spaces('public')$q$) = 0);
select public._as_user(:dave);
select public._check(31, 'yabancı herkese açık Space''i favoriler, son açılanlara ekler; ama yazamaz',
  public._try(format($q$select public.set_space_favorite(%L, true)$q$, public._g('S'))) = 'ok'
  and public._try(format($q$select public.touch_space(%L)$q$, public._g('S'))) = 'ok'
  and public._cnt($q$select count(*) from public.list_spaces('favorites')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('recent')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('all')$q$) = 0
  and public._cnt($q$with u as (update public.space_items set title = 'x' returning 1) select count(*) from u$q$) = 0);

-- ============================================================================
-- 6. Liste + arama
-- ============================================================================
select public._as_user(:alice);
select public._check(32, 'sahip listesi sayıları (gizli not dahil üyeye), kapak önizlemesi ve rol',
  public._val($q$select image_count || '/' || prompt_count || '/' || note_count || '/' || member_count || '/' || my_role || '/' || cardinality(preview_urls) from public.list_spaces('mine')$q$) = '2/2/3/3/owner/2');
select public._check(33, 'arama: başvurulan promptun METNİNDE, taslakta ve notta bulur; alakasızda bulmaz',
  public._cnt($q$select count(*) from public.list_spaces('all', 'ejderha')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('all', 'sinematik')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('all', 'güncel')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('all', 'yok-boyle-bir-sey')$q$) = 0
  and public._cnt($q$select count(*) from public.list_spaces('all', '%')$q$) = 0);
select public._as_user(:bobby);
select public._check(34, 'paylaşılanlar süzgeci: düzenleyiciye görünür, "benim" süzgecinde görünmez',
  public._cnt($q$select count(*) from public.list_spaces('shared')$q$) = 1
  and public._cnt($q$select count(*) from public.list_spaces('mine')$q$) = 0);

-- ============================================================================
-- 7. Bağlantıya sahip olanlar
-- ============================================================================
select public._as_user(:alice);
select public._check(35, 'bağlantı yalnız "bağlantı" görünürlüğünde oluşturulur',
  public._try(format($q$select public.create_space_link(%L)$q$, public._g('S'))) like '%space_not_link_visible%');
update public.spaces set visibility = 'link' where id = public._g('S');
select public._set('TOK1', public.create_space_link(public._g('S')) ->> 'token');
select public._check(36, 'ham token saklanmaz (yalnız özet) ve istemci bağlantı tablosunu okuyamaz',
  public._q(format($q$select count(*) from public.space_share_links where token_hash = %L$q$, public._gt('TOK1'))) = '0'
  and public._try($q$select count(*) from public.space_share_links$q$) like '%permission denied%');
select public._as_user(:frank);
select public._check(37, 'bağlantıyı açmadan okunamaz; yanlış token tek tip hata',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0
  and public._try($q$select public.open_space_link('yanlis-token-yanlis-token-yanlis')$q$) like '%space_link_invalid%'
  and public._try($q$select public.open_space_link('kisa')$q$) like '%space_link_invalid%');
select public._check(38, 'bağlantıyla okur (gizli notu görmez), yazamaz',
  public._val(format($q$select public.open_space_link(%L)$q$, public._gt('TOK1'))) = public._g('S')::text
  and public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 1
  and public._cnt($q$select count(*) from public.space_items where id = 'b0000000-0000-4000-8000-000000000004'$q$) = 0
  and public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'x', auth.uid())$q$, public._g('S'))) like '%row-level security%');
select public._as_user(:alice);
select public._check(39, 'sahip bağlantı durumunu görür (açan sayısı); iptal eder',
  public._val(format($q$select active || '/' || opened_count from public.space_link_status(%L)$q$, public._g('S'))) = 'true/1'
  and public._val(format($q$select public.revoke_space_link(%L)$q$, public._g('S'))) = '1');
select public._as_user(:frank);
select public._check(40, 'iptal edilen bağlantı erişim vermez (önceki hak da düşer)',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0
  and public._try(format($q$select public.open_space_link(%L)$q$, public._gt('TOK1'))) like '%space_link_invalid%');
select public._as_user(:alice);
select public._set('TOK2', public.create_space_link(public._g('S')) ->> 'token');
select public._as_user(:frank);
select public.open_space_link(public._gt('TOK2'));
select public._as_user(:alice);
update public.spaces set visibility = 'private' where id = public._g('S');
select public._as_user(:frank);
select public._check(41, 'özele çevirmek açık bağlantıyı iptal eder; geri "bağlantı"ya dönmek eskisini canlandırmaz',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0);
select public._as_user(:alice);
update public.spaces set visibility = 'link' where id = public._g('S');
select public._as_user(:frank);
select public._check(42, '… (bağlantı görünürlüğüne dönüldü, eski hak yine geçersiz)',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0
  and public._try(format($q$select public.open_space_link(%L)$q$, public._gt('TOK2'))) like '%space_link_invalid%');
set role anon;
select public._as_user('');
select public._check(43, 'ziyaretçi bağlantı açamaz (oturum gerekir)',
  public._try(format($q$select public.open_space_link(%L)$q$, public._gt('TOK2'))) like '%permission denied%');
set role authenticated;

-- ============================================================================
-- 8. Arşiv, roller, ayrılma
-- ============================================================================
select public._as_user(:alice);
update public.spaces set archived_at = now() where id = public._g('S');
select public._as_user(:bobby);
select public._check(44, 'arşivlenen Space salt-okunur: düzenleyici okur ama ekleyemez',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 1
  and public._try(format($q$select public.space_save_layout(%L, '[]'::jsonb)$q$, public._g('S'))) like '%space_forbidden%'
  and public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'x', auth.uid())$q$, public._g('S'))) like '%row-level security%');
select public._as_user(:alice);
select public._check(45, 'sahip arşiv süzgecinde görür, geri alır (etkinlikte iz)',
  public._cnt($q$select count(*) from public.list_spaces('archived')$q$) = 1
  and public._cnt(format($q$with u as (update public.spaces set archived_at = null where id = %L returning 1) select count(*) from u$q$, public._g('S'))) = 1
  and public._cnt(format($q$select count(*) from public.space_activity where space_id = %L and action in ('archived', 'unarchived')$q$, public._g('S'))) = 2);
select public._check(46, 'sahip rol değiştirir ve görüntüleyiciyi çıkarır; çıkarılan erişimini kaybeder',
  public._try(format($q$select public.set_space_member_role(%L, %L, 'editor')$q$, public._g('S'), :carol)) = 'ok'
  and public._try(format($q$select public.remove_space_member(%L, %L)$q$, public._g('S'), :carol)) = 'ok'
  and public._try(format($q$select public.remove_space_member(%L, %L)$q$, public._g('S'), :alice)) like '%space_member_not_found%');
select public._as_user(:carol);
select public._check(47, '… çıkarılan üye artık okuyamaz',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0);
select public._as_user(:bobby);
select public._check(48, 'üye kendisi ayrılabilir; başkasını çıkaramaz',
  public._try(format($q$select public.remove_space_member(%L, %L)$q$, public._g('S'), :alice)) like '%space_forbidden%'
  and public._try(format($q$select public.remove_space_member(%L, %L)$q$, public._g('S'), :bobby)) = 'ok'
  and public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S'))) = 0);

-- ============================================================================
-- 9. Storage
-- ============================================================================
select public._as_user(:alice);
select public._check(49, 'sahip Space klasörüne yükler; yabancı klasör / sahte ad reddedilir',
  public._try(format($q$insert into storage.objects (bucket_id, name, owner) values ('space-media', '%s/c0000000-0000-4000-8000-000000000001.jpg', auth.uid())$q$, public._g('S'))) = 'ok'
  and public._try(format($q$insert into storage.objects (bucket_id, name, owner) values ('space-media', '%s/c0000000-0000-4000-8000-000000000009.jpg', auth.uid())$q$, gen_random_uuid())) like '%row-level security%'
  and public._try(format($q$insert into storage.objects (bucket_id, name, owner) values ('space-media', '%s/../x.jpg', auth.uid())$q$, public._g('S'))) like '%row-level security%');
select public._try(format($q$insert into storage.objects (bucket_id, name, owner) values ('space-media', '%s/c0000000-0000-4000-8000-000000000002.jpg', auth.uid())$q$, public._g('S')));
select public._as_user(:dave);
select public._check(50, 'Space okunamıyorsa dosyası da okunamaz (link görünürlüğü, hakkı yok)',
  public._cnt($q$select count(*) from storage.objects where bucket_id = 'space-media'$q$) = 0);
select public._as_user(:alice);
update public.spaces set visibility = 'public' where id = public._g('S');
select public._as_user(:dave);
select public._check(51, 'herkese açık Space''in dosyası okunur; yabancı silemez',
  public._cnt($q$select count(*) from storage.objects where bucket_id = 'space-media'$q$) = 2
  and public._cnt($q$with d as (delete from storage.objects where bucket_id = 'space-media' returning 1) select count(*) from d$q$) = 0);
reset role;
select public._check(52, 'yetim taraması: öğede kullanılan dosya yetim değil, kullanılmayan yetim',
  not exists (select 1 from public.orphan_storage_objects('0 seconds') where name like '%c0000000-0000-4000-8000-000000000001.jpg')
  and exists (select 1 from public.orphan_storage_objects('0 seconds') where name like '%c0000000-0000-4000-8000-000000000002.jpg'));

-- ============================================================================
-- 10. Kaynağın kaderi + kapak
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(53, 'kapak: Space''teki görsel öğe seçilir; başka Space''in dosyası kapak olamaz',
  public._cnt(format($q$with u as (update public.spaces set cover_item_id = 'b0000000-0000-4000-8000-000000000001' where id = %L returning 1) select count(*) from u$q$, public._g('S'))) = 1
  and public._try(format($q$update public.spaces set cover_url = 'https://x.supabase.co/storage/v1/object/public/space-media/%s/c0000000-0000-4000-8000-000000000001.jpg' where id = %L$q$, gen_random_uuid(), public._g('S'))) like '%space_invalid%'
  and public._try(format($q$update public.spaces set owner_id = %L where id = %L$q$, :bobby, public._g('S'))) like '%space_invalid%');
select public._as_user(:carol);
update public.prompts set visibility = 'private' where id = 'a0000000-0000-4000-8000-0000000000a3';
select public._as_user(:dave);
select public._check(54, 'kaynak gizlenince öğe kalır ama içeriği başkasına okunmaz (metin kopyalanmadı)',
  public._cnt($q$select count(*) from public.space_items where id = 'b0000000-0000-4000-8000-000000000002'$q$) = 1
  and public._cnt($q$select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a3'$q$) = 0
  and public._val($q$select body from public.space_items where id = 'b0000000-0000-4000-8000-000000000002'$q$) = '');
reset role;
delete from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a3';
select public._check(55, 'kaynak silinince öğe kalır, başvurusu boşalır ("kaynak silindi")',
  (select prompt_id is null from public.space_items where id = 'b0000000-0000-4000-8000-000000000002'));

-- ============================================================================
-- 11. Silme ve hesap silme
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._set('S2', public.create_space('Dave alanı')::text);
select public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'x', auth.uid())$q$, public._g('S2')));
select public._check(56, 'sahip Space''ini siler: öğeler/gruplar/etkinlik zincirle gider, hata yok',
  public._cnt(format($q$with d as (delete from public.spaces where id = %L returning 1) select count(*) from d$q$, public._g('S2'))) = 1
  and public._q(format($q$select count(*) from public.space_items where space_id = %L$q$, public._g('S2'))) = '0'
  and public._q(format($q$select count(*) from public.space_activity where space_id = %L$q$, public._g('S2'))) = '0');
select public._check(57, 'istemci etkinlik/üyelik/durum tablolarına yazamaz',
  public._try(format($q$insert into public.space_activity (space_id, action) values (%L, 'created')$q$, public._g('S'))) like '%permission denied%'
  and public._try(format($q$insert into public.space_members (space_id, user_id, role) values (%L, auth.uid(), 'editor')$q$, public._g('S'))) like '%permission denied%'
  and public._try(format($q$insert into public.space_user_state (user_id, space_id, favorite) values (auth.uid(), %L, true)$q$, public._g('S'))) like '%permission denied%');
select public._check(58, 'iç yardımcılar istemciden çağrılamaz',
  public._try(format($q$select public._space_log(%L, 'created', null)$q$, public._g('S'))) like '%permission denied%');
reset role;
select public._set('DEL', public._try($q$select public.delete_account_data('11111111-1111-4111-8111-111111111111')$q$));
select public._check(59, 'hesap silme: sahibin Space''leri zincirle gider (tetikleyiciler engellemez)',
  public._gt('DEL') = 'ok'
  and not exists (select 1 from public.spaces where id = public._g('S'))
  and not exists (select 1 from public.space_items where space_id = public._g('S')));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
