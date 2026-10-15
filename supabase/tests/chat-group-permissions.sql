-- Grup yetkileri + geçmiş görünürlüğü: DB/RLS/RPC testi (docs/history/173-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/chat-group-permissions.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(owner) bobby(admin) carol(moderator) dave(member) erin(sonradan katılan) frank(başvuran).
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

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._ctx_get(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text), public._ctx_get(text) to public;

-- Fixture: özel grup; bobby admin, carol moderator, dave üye (RPC'lerle).
set role authenticated;
select public._as_user(:alice);
create temp table _c as select public.create_chat_group('Yetki Grubu', null, 'private', null, 50, array[:bobby, :carol, :dave]::uuid[]) as j;
reset role;
insert into public._ctx select 'g', j->>'group_id' from _c;
insert into public.conversation_members (conversation_id, user_id, role)
  select public._g('g'), u, r from (values (:bobby::uuid, 'admin'), (:carol::uuid, 'moderator'), (:dave::uuid, 'member')) v(u, r);
update public.chat_group_invitations set status = 'accepted', responded_at = now() where group_id = public._g('g');
set role authenticated;
select public._as_user(:alice);
insert into public.messages (id, conversation_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000b1', public._g('g'), :alice, 'eski mesaj');
reset role;
update public.messages set created_at = now() - interval '3 days' where id = '00000000-0000-4000-8000-0000000000b1';

select public._check(1, 'varsayılan: geçmiş kapalı, yetkiler bugünkü matrisle aynı',
  (select not history_visible and role_permissions = public._group_default_permissions() from public.chat_groups where id = public._g('g')));

-- 2. yalnız owner
set role authenticated;
select public._as_user(:bobby);
select public._check(2, 'owner ayarları: admin değiştiremez',
  public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"history_visible":true}')) like '%forbidden%');
select public._as_user(:carol);
select public._check(3, 'owner ayarları: moderator değiştiremez',
  public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"history_visible":true}')) like '%forbidden%');
select public._as_user(:dave);
select public._check(4, 'owner ayarları: üye değiştiremez; chat_groups sütunlarına doğrudan da yazamaz',
  public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"history_visible":true}')) like '%forbidden%'
  and public._try(format('update public.chat_groups set history_visible = true where id = %L', public._g('g'))) like '%permission denied%');
select public._as_user(:alice);
select public._check(5, 'owner ayarları: geçersiz yama reddedilir (bilinmeyen rol/yetenek/tip, moderatöre manage_roles)',
  public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"role_permissions":{"member":{"edit_settings":true}}}')) like '%invalid_patch%'
  and public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"role_permissions":{"admin":{"hack":true}}}')) like '%invalid_patch%'
  and public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"role_permissions":{"admin":{"edit_settings":"yes"}}}')) like '%invalid_patch%'
  and public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"role_permissions":{"moderator":{"manage_roles":true}}}')) like '%invalid_patch%'
  and public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"history_visible":"evet"}')) like '%invalid_patch%');
reset role;
select public._check(6, 'owner ayarları: geçersiz yama hiçbir şeyi değiştirmedi',
  (select not history_visible and role_permissions = public._group_default_permissions() from public.chat_groups where id = public._g('g')));

-- 3. geçmiş görünürlüğü
set role authenticated;
select public._as_user(:alice);
create temp table _t1 as select public.create_chat_group_link(public._g('g'), 24, null) as j;
reset role;
insert into public._ctx select 'tok', j->>'token' from _t1;
set role authenticated;
select public._as_user(:erin);
select public.join_chat_group_via_link(public._ctx_get('tok'));
select public._as_user(:bobby);
select public.decide_chat_group_join_request((select id from public.chat_group_join_requests where user_id = :erin and status = 'pending'), true);
select public._as_user(:erin);
select public._check(7, 'geçmiş: varsayılan kapalı — yeni üye katılmadan önceki mesajı görmez',
  (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000b1') = 0);
select public._as_user(:alice);
create temp table _t2 as select public.update_chat_group_owner_settings(public._g('g'), '{"history_visible":true}') as j;
select public._as_user(:erin);
select public._check(8, 'geçmiş: owner açınca yeni üye eski mesajı görür',
  (select (j->>'changed')::boolean from _t2) and (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000b1') = 1);
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('g'), '{"history_visible":false}');
select public._as_user(:erin);
select public._check(9, 'geçmiş: owner kapatınca tekrar görünmez',
  (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000b1') = 0);
reset role;

-- 4. yetki devri / geri alma
set role authenticated;
select public._as_user(:carol);
select public._check(10, 'yetki: moderator varsayılanda ayar düzenleyemez, davet/bağlantı oluşturamaz',
  public._try(format('select public.update_chat_group(%L, %L)', public._g('g'), '{"description":"x"}')) like '%forbidden%'
  and public._try(format('select public.create_chat_group_link(%L)', public._g('g'))) like '%forbidden%'
  and public._try(format('select public.invite_to_chat_group(%L, array[%L]::uuid[])', public._g('g'), :frank)) like '%forbidden%');
select public._as_user(:alice);
create temp table _t3 as select public.update_chat_group_owner_settings(public._g('g'),
  '{"role_permissions":{"moderator":{"edit_settings":true,"manage_invites":true}}}') as j;
select public._as_user(:carol);
create temp table _t11 as select
  public._try(format('select public.update_chat_group(%L, %L)', public._g('g'), '{"description":"moderatör yazdı"}')) as a,
  public._try(format('select public.create_chat_group_link(%L)', public._g('g'))) as b,
  public._try(format('select public.invite_to_chat_group(%L, array[%L]::uuid[])', public._g('g'), :frank)) as c;
select public._check(11, 'yetki: owner moderatöre verince moderator ayar düzenler, davet gönderir, bağlantı oluşturur',
  (select a = 'ok' and b = 'ok' and c = 'ok' from _t11)
  and (select count(*) from public.chat_group_invitations where group_id = public._g('g') and status = 'pending') = 1
  and (select description from public.chat_groups where id = public._g('g')) = 'moderatör yazdı');
select public._check(12, 'yetki: verilen yetkiyle moderator ancak rütbesinin izin verdiği kadarını yapar (görünürlük/rol/silme hâlâ yok)',
  public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g'))) like '%forbidden%'
  and public._try(format('select public.transfer_chat_group_ownership(%L, %L)', public._g('g'), :carol)) like '%forbidden%'
  and public._try(format('select public.delete_chat_group(%L)', public._g('g'))) like '%forbidden%'
  and public._try(format('select public.update_chat_group_owner_settings(%L, %L)', public._g('g'), '{"history_visible":true}')) like '%forbidden%');
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('g'), '{"role_permissions":{"moderator":{"edit_settings":false,"manage_invites":false}}}');
select public._as_user(:carol);
select public._check(13, 'yetki: owner geri alınca moderator tekrar yapamaz; bağlantı listesi de (RLS) kapanır',
  public._try(format('select public.update_chat_group(%L, %L)', public._g('g'), '{"description":"yine"}')) like '%forbidden%'
  and public._try(format('select public.invite_to_chat_group(%L, array[%L]::uuid[])', public._g('g'), :erin)) like '%forbidden%'
  and (select count(*) from public.chat_group_links) = 0);
reset role;
select public._check(14, 'yetki: değişiklikler denetim kaydına ve yöneticilere/moderatöre bildirime düştü',
  (select count(*) from public.chat_group_audit where group_id = public._g('g') and action = 'owner_settings_updated') >= 4
  and (select count(*) from public.notifications where recipient_id = :carol and message like '%yönetim yetkilerin güncellendi.') = 2
  and (select count(*) from public.notifications where recipient_id = :bobby and message like '%yönetim yetkilerin güncellendi.') = 2
  and (select count(*) from public.notifications where recipient_id = :dave and message like '%yönetim yetkilerin güncellendi.') = 0);

-- 5. admin yetkilerini geri alma
set role authenticated;
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('g'), '{"role_permissions":{"admin":{"change_visibility":false,"manage_roles":false,"ban_members":false,"delete_messages":false,"edit_settings":false}}}');
select public._as_user(:bobby);
select public._check(15, 'yetki: owner admin''den geri alınca admin görünürlük, rol, yasak, mesaj silme, ayar yapamaz',
  public._try(format('select public.set_chat_group_visibility(%L, ''public'')', public._g('g'))) like '%forbidden%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''moderator'')', public._g('g'), :dave)) like '%forbidden%'
  and public._try(format('select public.remove_chat_group_member(%L, %L, true)', public._g('g'), :dave)) like '%forbidden%'
  and public._try(format('select public.moderate_chat_group_message(%L)', '00000000-0000-4000-8000-0000000000b1')) like '%forbidden%'
  and public._try(format('select public.update_chat_group(%L, %L)', public._g('g'), '{"description":"x"}')) like '%forbidden%');
select public._check(16, 'yetki: geri alınmayan yetkiler sürer (davet gönderir; yasaksız çıkarma da çalışır)',
  public._try(format('select public.invite_to_chat_group(%L, array[%L]::uuid[])', public._g('g'), :erin)) = 'ok'
  and public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g'), :dave)) = 'ok');
select public._as_user(:alice);
select public._check(17, 'yetki: owner kısıtlanamaz (hepsini yapar)',
  public._try(format('select public.update_chat_group(%L, %L)', public._g('g'), '{"description":"owner"}')) = 'ok'
  and public._try(format('select public.moderate_chat_group_message(%L)', '00000000-0000-4000-8000-0000000000b1')) = 'ok');

-- 6. moderatörden başvuru yönetimini / çıkarmayı geri alma
select public.update_chat_group_owner_settings(public._g('g'), '{"role_permissions":{"moderator":{"manage_requests":false,"remove_members":false}}}');
reset role;
insert into public.chat_group_join_requests (group_id, user_id) values (public._g('g'), :frank);
set role authenticated;
select public._as_user(:carol);
select public._check(18, 'yetki: moderatörden geri alınınca başvuruyu göremez/yönetemez; üye çıkaramaz',
  (select count(*) from public.chat_group_join_requests where group_id = public._g('g')) = 0
  and (select count(*) from public.chat_group_invitations where group_id = public._g('g') and inviter_id <> :carol and invitee_id <> :carol) = 0
  and public._try(format('select public.decide_chat_group_join_request(%L, true)', (select id from public.chat_group_join_requests limit 1))) like '%request_not_found%'
  and public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g'), :erin)) like '%forbidden%');
select public._as_user(:bobby);
select public._check(19, 'yetki: aynı başvuruyu admin (yetkisi duruyor) görür ve kabul eder',
  (select count(*) from public.chat_group_join_requests where group_id = public._g('g') and status = 'pending') = 1
  and public._try(format('select public.decide_chat_group_join_request(%L, true)', (select id from public.chat_group_join_requests where status = 'pending' limit 1))) = 'ok');

-- 7. tüm yetkiler verilse bile rütbe kuralları
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('g'),
  '{"role_permissions":{"moderator":{"edit_settings":true,"change_visibility":true,"manage_invites":true,"manage_requests":true,"remove_members":true,"ban_members":true,"delete_messages":true}}}');
select public._as_user(:carol);
select public._check(20, 'rütbe: tüm yetkili moderator yine admin''i/owner''ı çıkaramaz, başka moderatörü çıkaramaz',
  public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g'), :bobby)) like '%forbidden%'
  and public._try(format('select public.remove_chat_group_member(%L, %L)', public._g('g'), :alice)) like '%forbidden%'
  and public._try(format('select public.set_chat_group_member_role(%L, %L, ''admin'')', public._g('g'), :erin)) like '%forbidden%');
select public._check(21, 'rütbe: tüm yetkili moderator normal üyeyi yasaklayarak çıkarabilir',
  public._try(format('select public.remove_chat_group_member(%L, %L, true)', public._g('g'), :frank)) = 'ok');
reset role;

-- 8. tekrar çağrı
set role authenticated;
select public._as_user(:alice);
create temp table _again as select public.update_chat_group_owner_settings(public._g('g'), '{"history_visible":false}') as j;
reset role;
select public._check(22, 'tekrar: değişmeyen yama "changed:false" döner, denetim/bildirim çoğalmaz',
  (select not (j->>'changed')::boolean from _again));
select public._check(23, 'anon/iç yardımcılar: anon çağıramaz, iç fonksiyonlar kimseye açık değil',
  not has_function_privilege('anon', 'public.update_chat_group_owner_settings(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.chat_group_can(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public._group_can(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public._group_require_cap(uuid,uuid,text)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
