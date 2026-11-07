-- Ekip alanı, Aşama 3: ekip kütüphanesinde sürüm geçmişi ve "Onaya gönder" (docs/history/349-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-spaces-review.sql ("FAILED=0" beklenir).
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


-- T: ekip (alice sahip; bobby yönetici, carol moderatör, dave üye, erin üye). Kütüphane + 3 taslak.
select public._mkc('Ekip R', 'private', array[:bobby, :carol, :dave, :erin]::uuid[]) as v \gset t_
insert into public._ctx values ('T', :'t_v');
select public._as_user(:alice);
select public.set_chat_group_member_role(public._g('T'), :bobby, 'admin');
select public.set_chat_group_member_role(public._g('T'), :carol, 'moderator');
set role authenticated;
select public.create_team_space(public._g('T'), 'Kütüphane', '', 'team_library') as v \gset l_
select public.create_team_space(public._g('T'), 'Pano', '', 'moodboard') as v \gset m_
insert into public._ctx values ('L', :'l_v'), ('M', :'m_v');
reset role;
insert into public.space_items (id, space_id, kind, is_draft, title, body, x, y, created_by)
values ('e1000000-0000-4000-8000-0000000000c1', public._g('L'), 'prompt', true, 'Satış e-postası', 'Merhaba {musteri}', 0, 0, :dave),
       ('e1000000-0000-4000-8000-0000000000c2', public._g('L'), 'prompt', true, 'Destek yanıtı', 'Sayın {musteri}', 0, 0, :erin),
       ('e1000000-0000-4000-8000-0000000000c3', public._g('M'), 'prompt', true, 'Pano promptu', 'x', 0, 0, :alice);
reset role;
\set c1 'e1000000-0000-4000-8000-0000000000c1'
\set c2 'e1000000-0000-4000-8000-0000000000c2'
\set c3 'e1000000-0000-4000-8000-0000000000c3'

-- 1) Sürüm geçmişi ------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
update public.space_items set body = 'Merhaba {musteri}, hoş geldin' where id = :'c1';
update public.space_items set title = 'Satış e-postası v2' where id = :'c1';
update public.space_items set x = 50, y = 50 where id = :'c1';
select public._check(1, 'başlık/metin değişince ESKİ hâl sürüm olarak saklanır (2 düzenleme = 2 sürüm); konum değişikliği sürüm üretmez',
  (select count(*) from public.space_item_versions where item_id = :'c1') = 2);
select public._check(2, 'en yeni sürüm bir önceki metni taşır',
  (select body from public.list_space_item_versions(:'c1') limit 1) = 'Merhaba {musteri}, hoş geldin'
  and (select title from public.list_space_item_versions(:'c1') limit 1) = 'Satış e-postası');
select public._check(3, 'sürüm listesi yazar adını verir', (select author_username from public.list_space_item_versions(:'c1') limit 1) = 'dave');
update public.space_items set body = 'Merhaba {musteri}, hoş geldin' where id = :'c1';
select public._check(4, 'aynı içerikle yeniden kaydetmek sürüm üretmez', (select count(*) from public.space_item_versions where item_id = :'c1') = 2);
select public._as_user(:alice);
update public.space_items set body = 'Pano metni 2' where id = :'c3';
select public._check(5, 'ekip kütüphanesi OLMAYAN Space’te sürüm tutulmaz', (select count(*) from public.space_item_versions where item_id = :'c3') = 0);
select public._check(6, 'istemci sürüm tablosuna yazamaz',
  public._try(format($q$insert into public.space_item_versions (item_id, space_id, title, body) values (%L, %L, 'x', 'y')$q$, :'c1', public._g('L'))) like '%permission denied%'
  and public._try(format($q$delete from public.space_item_versions where item_id = %L$q$, :'c1')) like '%permission denied%');
select public._as_user(:frank);
select public._check(7, 'ekip dışı kişi sürümleri OKUYAMAZ', (select count(*) from public.space_item_versions where item_id = :'c1') = 0
  and (select count(*) from public.list_space_item_versions(:'c1')) = 0);
reset role;

-- 2) 50 sürüm sınırı ----------------------------------------------------------------------------------------------------------------
select public._as_user(:erin);
set role authenticated;
do $$ begin
  for i in 1..55 loop update public.space_items set body = 'sürüm ' || i where id = 'e1000000-0000-4000-8000-0000000000c2'; end loop;
end $$;
reset role;
select public._check(8, 'öğe başına en çok 50 sürüm tutulur', (select count(*) from public.space_item_versions where item_id = :'c2') = 50);

-- 3) Geri yükleme -------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public.space_set_item_approval(:'c1', true);
select public._check(9, 'ön koşul: c1 onaylı', (select approved_at is not null from public.space_items where id = :'c1'));
select public._as_user(:dave);
select id as v from public.list_space_item_versions(:'c1') order by created_at asc limit 1 \gset old_
select public.space_restore_item_version(:'old_v');
select public._check(10, 'geri yükleme: metin ilk sürüme döner, YENİ düzenleme sayılır (onay düşer, şimdiki hâl sürüm olur)',
  (select (body, title) = ('Merhaba {musteri}', 'Satış e-postası') from public.space_items where id = :'c1')
  and (select approved_at is null from public.space_items where id = :'c1')
  and (select count(*) from public.space_item_versions where item_id = :'c1') = 3);
select public._as_user(:frank);
select public._check(11, 'ekip dışı kişi geri yükleyemez', public._try(format('select public.space_restore_item_version(%L)', :'old_v')) like '%space_not_found%');
reset role;
-- salt-okunur (viewer) üye: ekip üyeleri editör olduğundan, üyeliği düzenleyiciden düşürülmüş bir satır SENTETİK denenir.
select set_config('promptly.team_sync', '1', false);
update public.space_members set role = 'viewer' where space_id = public._g('L') and user_id = :erin;
select set_config('promptly.team_sync', '', false);
set role authenticated;
select public._as_user(:erin);
select public._check(12, 'salt-okunur üye geri yükleyemez', public._try(format('select public.space_restore_item_version(%L)', :'old_v')) like '%space_forbidden%');
reset role;
select set_config('promptly.team_sync', '1', false);
update public.space_members set role = 'editor' where space_id = public._g('L') and user_id = :erin;
select set_config('promptly.team_sync', '', false);

-- 4) Onaya gönder -------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public.space_request_review(:'c1') as v \gset r_
select public._check(13, 'düzenleyici onaya gönderir (zaman döner)', :'r_v' is not null
  and (select review_requested_by = :dave::uuid from public.space_items where id = :'c1'));
reset role;
select public._check(14, 'bildirim: sahip + onay yetkili yönetici alır; moderatör/üye/isteyen ALMAZ',
  (select count(*) from public.notifications where dedupe_key like 'teamreview:' || :'c1' || ':%' and recipient_id = :alice::uuid) = 1
  and (select count(*) from public.notifications where dedupe_key like 'teamreview:' || :'c1' || ':%' and recipient_id = :bobby::uuid) = 1
  and (select count(*) from public.notifications where dedupe_key like 'teamreview:' || :'c1' || ':%' and recipient_id in (:carol::uuid, :dave::uuid, :erin::uuid)) = 0);
select public._check(15, 'bildirim metni ve adresi',
  (select message from public.notifications where dedupe_key like 'teamreview:' || :'c1' || ':%' and recipient_id = :alice::uuid) like '%Satış e-postası%onay istedi.'
  and (select target_href from public.notifications where dedupe_key like 'teamreview:' || :'c1' || ':%' and recipient_id = :alice::uuid) like '/spaces/local?id=%&tab=prompts');
set role authenticated;
select public._as_user(:dave);
select public.space_request_review(:'c1');
reset role;
select public._check(16, 'bekleyen istek tekrar gönderilirse ikinci bildirim üretmez (idempotent)',
  (select count(*) from public.notifications where dedupe_key like 'teamreview:' || :'c1' || ':%') = 2);
set role authenticated;
select public._as_user(:carol);
select public._check(17, 'başkasının isteği geri çekilebilir (düzenleyici)', public._try(format('select public.space_request_review(%L, true)', :'c1')) = 'ok');
select public._check(18, 'geri çekme isteği temizler', (select review_requested_at is null and review_requested_by is null from public.space_items where id = :'c1'));
select public._as_user(:frank);
select public._check(19, 'ekip dışı kişi onay isteyemez', public._try(format('select public.space_request_review(%L)', :'c1')) like '%space_not_found%');
select public._as_user(:dave);
select public.space_request_review(:'c1');
select public._as_user(:alice);
select public.space_set_item_approval(:'c1', true);
select public._check(20, 'onay verilince bekleyen istek temizlenir', (select review_requested_at is null and approved_at is not null from public.space_items where id = :'c1'));
select public._as_user(:dave);
select public._check(21, 'onaylı prompt için onay istenemez', public._try(format('select public.space_request_review(%L)', :'c1')) like '%space_invalid%');
select public._check(22, 'ekip kütüphanesi olmayan Space’te onay istenemez', public._try(format('select public.space_request_review(%L)', :'c3')) like '%space_invalid%');

-- 5) İşaret doğrudan yazılamaz ------------------------------------------------------------------------------------------------------
select public._check(23, 'istemci inceleme sütunlarını doğrudan yazamaz',
  public._try(format($q$update public.space_items set review_requested_at = now(), review_requested_by = %L where id = %L$q$, :dave, :'c2')) like '%space_review_forbidden%'
  and public._try(format($q$insert into public.space_items (space_id, kind, is_draft, title, body, created_by, review_requested_at) values (%L, 'prompt', true, 'Hile', 'x', %L, now())$q$, public._g('L'), :dave)) like '%space_review_forbidden%');
select public._as_user('');
reset role;
set role anon;
select public._check(24, 'anon yeni RPC’leri çağıramaz',
  public._try(format('select public.space_request_review(%L)', :'c1')) like '%permission denied%'
  and public._try(format('select public.space_restore_item_version(%L)', :'old_v')) like '%permission denied%'
  and public._try(format('select * from public.list_space_item_versions(%L)', :'c1')) like '%permission denied%');
reset role;

-- 6) Kilitli öğede inceleme istenebilir; geri yükleme kilidi korur ---------------------------------------------------------------------
update public.space_items set locked = true where id = :'c2';
set role authenticated;
select public._as_user(:dave);
select public._check(25, 'kilitli taslak için onay istenebilir (kilit inceleme sütunlarını saymaz)', public._try(format('select public.space_request_review(%L)', :'c2')) = 'ok');
select public._check(26, 'kilitli taslakta geri yükleme kilit hatası verir',
  public._try(format('select public.space_restore_item_version(%L)', (select id from public.space_item_versions where item_id = :'c2' limit 1))) like '%space_item_locked%');
reset role;


-- 7) Onay yetkisi arayüze sorulur ---------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public._check(27, 'space_can_approve: sahip ve yönetici EVET', public.space_can_approve(public._g('L')));
select public._as_user(:bobby);
select public._check(28, 'space_can_approve: yönetici EVET (varsayılan approve_library)', public.space_can_approve(public._g('L')));
select public._as_user(:dave);
select public._check(29, 'space_can_approve: sıradan düzenleyici HAYIR', not public.space_can_approve(public._g('L')));
select public._as_user(:frank);
select public._check(30, 'space_can_approve: ekip dışı HAYIR (varlığı sızmaz)', not public.space_can_approve(public._g('L')));
select public._as_user(:alice);
select public._check(31, 'space_can_approve: ekip kütüphanesi olmayan Space’te HAYIR', not public.space_can_approve(public._g('M')));
reset role;
-- Yönetici create_spaces’ten çıkarılır ama approve_library kalır → ARTIK sahip gibi çalışmaz ama onay verebilir; tersi de geçerli.
update public.chat_groups set role_permissions = jsonb_build_object('admin', jsonb_build_object('create_spaces', false, 'approve_library', true), 'moderator', jsonb_build_object('approve_library', true)) where id = public._g('T');
set role authenticated;
select public._as_user(:bobby);
select public._check(32, 'approve_library tek başına yeter (create_spaces olmasa da) — yönetici onaylar',
  public.space_can_approve(public._g('L')) and public._try(format('select public.space_set_item_approval(%L, true)', :'c2')) = 'ok');
select public._as_user(:carol);
select public._check(33, 'approve_library verilen moderatör de onaylayabilir', public.space_can_approve(public._g('L')));
reset role;
update public.chat_groups set role_permissions = jsonb_build_object('admin', jsonb_build_object('create_spaces', true, 'approve_library', false)) where id = public._g('T');
set role authenticated;
select public._as_user(:bobby);
select public._check(34, 'approve_library kaldırılırsa (create_spaces kalsa da) yönetici ONAYLAYAMAZ',
  not public.space_can_approve(public._g('L')) and public._try(format('select public.space_set_item_approval(%L, true)', :'c1')) like '%space_forbidden%');
reset role;
select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
