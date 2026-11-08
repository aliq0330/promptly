-- Ekipler, WP5 (docs/history/353-*): üyelik akışları. Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-membership.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank'),(:gina,'gina'),(:hank,'hank')) as u(id, name);

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
create or replace function public._role(p_user uuid) returns text language sql security definer as $$ select role from public.team_members where team_id = public._g('T') and user_id = p_user $$;
create or replace function public._inv() returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.spaces s where s.team_id is not null and (
       (select count(*) from public.space_members x where x.space_id = s.id and x.role = 'owner') <> 1
       or not exists (select 1 from public.team_members tm join public.space_members x on x.user_id = tm.user_id and x.space_id = s.id and x.role = 'owner'
                       where tm.team_id = s.team_id and tm.role = 'owner' and s.owner_id = tm.user_id)
       or exists (select 1 from public.space_members x where x.space_id = s.id and not exists (select 1 from public.team_members tm where tm.team_id = s.team_id and tm.user_id = x.user_id))))
$$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._role(uuid), public._inv() to public;

-- Kurulum: alice ekibi kurar; yönetici bobby ve düzenleyici carol DAVETLE gelir.
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public._ctx select 'LIB', library_space_id::text from public.teams where id = public._g('T');

-- 1) Kullanıcı adıyla davet -----------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public.team_invite_user(public._g('T'), 'BOBBY', 'admin') as v \gset i1_
reset role;
select public._check(1, 'sahip kullanıcı adıyla (büyük/küçük harf farksız) yönetici davet eder; davetli bildirim alır',
  (select status = 'pending' and role = 'admin' from public.team_invitations where id = :'i1_v')
  and (select count(*) from public.notifications where recipient_id = :bobby and message like '%ekibine davet etti%' and target_href = '/teams') = 1);
set role authenticated;
select public._as_user(:bobby);
select public._check(2, 'davetli kendi davetlerini listeler', (select count(*) from public.my_team_invitations()) = 1 and (select team_name from public.my_team_invitations()) = 'Atölye Mor');
select public._as_user(:carol);
select public._check(3, 'başkasının daveti kabul edilemez', public._try(format($$select public.team_respond_invitation(%L, true)$$, :'i1_v')) like '%invitation_not_found%');
select public._as_user(:bobby);
select public.team_respond_invitation(:'i1_v', true) ->> 'status' as v \gset r4_
reset role;
select public._check(4, 'davet kabul edilince üyelik rolüyle kurulur; kabul bildirimi davet edene gider', :'r4_v' = 'accepted' and public._role(:bobby) = 'admin'
  and (select count(*) from public.notifications where recipient_id = :alice and message like '%davetini kabul etti%') = 1);
set role authenticated;
select public._as_user(:bobby);
select public._check(5, 'yönetici yönetici davet edemez (rütbe kuralı), düzenleyici davet edebilir', public._try(format($$select public.team_invite_user(%L, 'carol', 'admin')$$, public._g('T'))) like '%team_forbidden%'
  and public._try(format($$select public.team_invite_user(%L, 'carol', 'editor')$$, public._g('T'))) = 'ok');
select public._as_user(:carol);
select public.team_respond_invitation((select id from public.my_team_invitations() limit 1), true) ->> 'status' as v \gset r6_
select public._check(6, 'düzenleyici davet kabul etti', :'r6_v' = 'accepted');
select public._check(7, 'düzenleyici davet edemez', public._try(format($$select public.team_invite_user(%L, 'dave', 'member')$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:bobby);
select public._check(8, 'olmayan kullanıcı, kendini, üyeyi davet etmek reddedilir',
  public._try(format($$select public.team_invite_user(%L, 'yok-boyle-biri')$$, public._g('T'))) like '%user_not_found%'
  and public._try(format($$select public.team_invite_user(%L, 'bobby')$$, public._g('T'))) like '%team_invalid%'
  and public._try(format($$select public.team_invite_user(%L, 'carol')$$, public._g('T'))) like '%already_member%');
select public.team_invite_user(public._g('T'), 'dave') as v \gset d1_
select public.team_invite_user(public._g('T'), 'dave') as v \gset d2_
select public._check(9, 'aynı kişiye ikinci davet aynı bekleyen daveti döner (tekrar yok)', :'d1_v' = :'d2_v');
select public._check(10, 'bekleyen davetler yöneticiye listelenir', (select count(*) from public.team_list_invitations(public._g('T'))) = 1);
select public.team_cancel_invitation(:'d1_v');
select public._check(11, 'davet iptal edilir; iptal edilen kabul edilemez', (select status from public.team_invitations where id = :'d1_v') = 'cancelled');
select public._as_user(:dave);
select public._check(12, 'iptal edilmiş davet kabul edilemez', public._try(format($$select public.team_respond_invitation(%L, true)$$, :'d1_v')) like '%invitation_not_found%');
reset role;
update public.team_invitations set status = 'pending', created_at = now() - interval '20 days' where id = :'d1_v';
set role authenticated;
select public._as_user(:dave);
select public._check(13, '14 günden eski davet süresi dolmuş sayılır', public._try(format($$select public.team_respond_invitation(%L, true)$$, :'d1_v')) like '%invitation_expired%');
reset role;

-- 2) Konuk daveti ----------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(14, 'düzenleyici konuk davet edemez (invite_guests yeteneği yok)', public._try(format($$select public.team_invite_user(%L, 'erin', 'guest', 30)$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:bobby);
select public._check(15, 'konuk daveti süre ister (1–90 gün)', public._try(format($$select public.team_invite_user(%L, 'erin', 'guest')$$, public._g('T'))) like '%team_invalid%'
  and public._try(format($$select public.team_invite_user(%L, 'erin', 'guest', 120)$$, public._g('T'))) like '%team_invalid%'
  and public._try(format($$select public.team_invite_user(%L, 'erin', 'member', 30)$$, public._g('T'))) like '%team_invalid%');
select public.team_invite_user(public._g('T'), 'erin', 'guest', 30, 'Kuzey Kafe') as v \gset eg_
select public._as_user(:erin);
select public.team_respond_invitation(:'eg_v', true) ->> 'status' as v \gset r16_
reset role;
select public._check(16, 'konuk kabul edince süreli konuk üyelik kurulur', :'r16_v' = 'accepted' and public._role(:erin) = 'guest'
  and (select guest_until > now() + interval '29 days' and guest_org = 'Kuzey Kafe' from public.team_members where team_id = public._g('T') and user_id = :erin));
select public._check(17, 'sayaçlar: 3 üye (alice, bobby, carol), 1 konuk', (select member_count = 3 and guest_count = 1 from public.teams where id = public._g('T')));

-- 3) Davet bağlantısı --------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_create_invite_link(public._g('T'), 'member', 1) ->> 'token' as v \gset tk_
select public._check(18, 'yönetici bağlantı üretir; ham token yalnız bir kez döner, özeti saklanır', length(:'tk_v') >= 40
  and (select count(*) from public.team_list_invite_links(public._g('T'))) = 1);
select public._check(19, 'bağlantı rolü rütbeden yüksek olamaz (admin bağlantısı yok)', public._try(format($$select public.team_create_invite_link(%L, 'admin')$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:dave);
select public._check(20, 'ön izleme: ekip adı, rol, geçerlilik', (public.preview_team_link(:'tk_v') ->> 'team_name') = 'Atölye Mor' and (public.preview_team_link(:'tk_v') ->> 'valid')::boolean);
select public.join_team_via_link(:'tk_v') ->> 'slug' as v \gset j_
reset role;
select public._check(21, 'bağlantıyla katılan üye olur; kullanım sayacı artar; bağlantı sahibi bildirim alır', :'j_v' = 'atolye-mor' and public._role(:dave) = 'member'
  and (select use_count = 1 from public.team_invite_links where team_id = public._g('T')) and (select count(*) from public.notifications where recipient_id = :bobby and message like '%davet bağlantınla%') = 1);
set role authenticated;
select public._as_user(:frank);
select public._check(22, 'kullanım sınırı dolan bağlantı çalışmaz', public._try(format($$select public.join_team_via_link(%L)$$, :'tk_v')) like '%link_unavailable%');
select public._check(23, 'geçersiz token', public._try($$select public.join_team_via_link('hic-boyle-bir-token')$$) like '%link_not_found%');
select public._as_user(:bobby);
select public.team_create_invite_link(public._g('T'), 'editor') ->> 'token' as v \gset tk2_
select public._as_user(:dave);
select public._check(24, 'üye zaten üyeyken bağlantıyla katılamaz', public._try(format($$select public.join_team_via_link(%L)$$, :'tk2_v')) like '%already_member%');
select public._as_user(:frank);
select public.join_team_via_link(:'tk2_v') is not null as v \gset ignore_
reset role;
select public._check(25, 'editor bağlantısıyla katılan düzenleyici olur', public._role(:frank) = 'editor');
set role authenticated;
select public._as_user(:bobby);
select public.team_revoke_invite_link((select id from public.team_list_invite_links(public._g('T')) where role = 'editor' limit 1));
select public._as_user(:gina);
select public._check(26, 'iptal edilen bağlantı çalışmaz', public._try(format($$select public.join_team_via_link(%L)$$, :'tk2_v')) like '%link_unavailable%');
reset role;
update public.team_invite_links set revoked_at = null, expires_at = now() - interval '1 day' where team_id = public._g('T') and role = 'editor';
set role authenticated;
select public._as_user(:gina);
select public._check(27, 'süresi dolan bağlantı çalışmaz', public._try(format($$select public.join_team_via_link(%L)$$, :'tk2_v')) like '%link_unavailable%');
select public._as_user(:bobby);
select public._check(28, 'istemci token özetini okuyamaz', public._try('select token_hash from public.team_invite_links') like '%permission denied%'
  and public._try('select id, role, use_count from public.team_invite_links') = 'ok');
reset role;

-- 4) Üye listesi ve rol değişimi ------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:erin);
select public._check(29, 'konuk üye listesini göremez', public._try(format($$select * from public.team_list_members(%L)$$, public._g('T'))) like '%team_not_found%');
select public._as_user(:carol);
select public._check(30, 'üye listesi ve arama (gruplar dahil)', (select count(*) from public.team_list_members(public._g('T'))) = 6
  and (select count(*) from public.team_list_members(public._g('T'), 'dav')) = 1 and (select count(*) from public.team_list_members(public._g('T'), null, 'guest')) = 1);
select public._as_user(:bobby);
select public._check(31, 'yönetici üyeyi düzenleyiciye yükseltir', public._try(format($$select public.team_set_member_role(%L, %L, 'editor')$$, public._g('T'), :dave)) = 'ok');
select public._check(32, 'yönetici yöneticiye/sahibe dokunamaz, kendi rolünü değiştiremez, sahip rolü verilemez',
  public._try(format($$select public.team_set_member_role(%L, %L, 'member')$$, public._g('T'), :alice)) like '%team_forbidden%'
  and public._try(format($$select public.team_set_member_role(%L, %L, 'member')$$, public._g('T'), :bobby)) like '%team_forbidden%'
  and public._try(format($$select public.team_set_member_role(%L, %L, 'owner')$$, public._g('T'), :carol)) like '%team_invalid%'
  and public._try(format($$select public.team_set_member_role(%L, %L, 'admin')$$, public._g('T'), :carol)) like '%team_forbidden%');
select public._as_user(:alice);
select public.team_set_member_role(public._g('T'), :frank, 'member');
select public.team_set_member_role(public._g('T'), :dave, 'member');
select public.team_set_member_role(public._g('T'), :erin, 'member');
reset role;
select public._check(33, 'sahip herkesin rolünü ayarlar; konuk üyeye terfi edince konuk alanları temizlenir', public._role(:dave) = 'member' and public._role(:frank) = 'member'
  and (select guest_until is null and guest_org is null from public.team_members where team_id = public._g('T') and user_id = :erin) and public._role(:erin) = 'member');
update public.team_members set role = 'guest', guest_until = now() + interval '20 days', guest_org = 'K' where team_id = public._g('T') and user_id = :erin;

-- 5) Çıkarma ve içerik devri ------------------------------------------------------------------------------------------------------------------------
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by) values
  (public._g('LIB'), 'prompt', 'Dave promptu 1', 'x', true, :dave, :dave), (public._g('LIB'), 'prompt', 'Dave promptu 2', 'y', true, :dave, :dave),
  (public._g('LIB'), 'note', 'Dave notu', '', false, :dave, :dave);
insert into public.space_variables (space_id, name, value, created_by, updated_by) values (public._g('LIB'), 'marka', 'Mor', :dave, :dave);
set role authenticated;
select public._as_user(:bobby);
select public.team_member_content_summary(public._g('T'), :dave)::text as v \gset sum_
select public._check(34, 'içerik özeti: 2 prompt, 1 Space öğesi, 1 değişken', (:'sum_v'::jsonb ->> 'prompts')::int = 2 and (:'sum_v'::jsonb ->> 'items')::int = 1 and (:'sum_v'::jsonb ->> 'variables')::int = 1);
select public._as_user(:carol);
select public._check(35, 'düzenleyici üyeyi çıkaramaz', public._try(format($$select public.team_remove_member(%L, %L)$$, public._g('T'), :dave)) like '%team_forbidden%');
select public._as_user(:bobby);
select public._check(36, 'yönetici yöneticiyi/sahibi çıkaramaz; "üyeye devret" geçerli bir üye ister',
  public._try(format($$select public.team_remove_member(%L, %L)$$, public._g('T'), :alice)) like '%team_forbidden%'
  and public._try(format($$select public.team_remove_member(%L, %L, 'member', %L)$$, public._g('T'), :dave, :frank)) = 'ok' is not null);
reset role;
select public._check(37, 'mod "member": içerik ekipte KALIR ve yazarlığı seçilen üyeye (frank) geçer; üyelik gider; çıkarılan bildirim alır',
  public._role(:dave) is null
  and (select count(*) from public.space_items where title like 'Dave promptu%' and created_by = :frank) = 2
  and (select created_by = :frank from public.space_variables where space_id = public._g('LIB') and name = 'marka')
  and (select count(*) from public.notifications where recipient_id = :dave and message like '%ekibinden çıkarıldın%') = 1);
select public._check(38, 'denetim günlüğü: çıkarma kaydı özet sayılarıyla', (select details ->> 'prompts' = '2' from public.team_audit where team_id = public._g('T') and action = 'member_removed' limit 1));
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :hank, 'member');
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by) values (public._g('LIB'), 'prompt', 'Hank promptu', 'z', true, :hank, :hank);
set role authenticated;
select public._as_user(:bobby);
select public.team_remove_member(public._g('T'), :hank, 'team', null, false);
reset role;
select public._check(39, 'mod "team": içerik ekipte kalır, yazar korunur; bildirim kapalıysa gitmez', (select count(*) from public.space_items where title = 'Hank promptu' and created_by = :hank) = 1
  and (select count(*) from public.notifications where recipient_id = :hank and message like '%ekibinden çıkarıldın%') = 0);
select public._check(40, 'DEĞİŞMEZ: Space yansıması (çıkarmalardan sonra)', public._inv());

-- 6) Ayrılma ----------------------------------------------------------------------------------------------------------------------------------------
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :gina, 'member');
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by) values (public._g('LIB'), 'prompt', 'Gina promptu', 'g', true, :gina, :gina);
update public.teams set offboard_default = 'admin' where id = public._g('T');
set role authenticated;
select public._as_user(:alice);
select public._check(41, 'sahip ayrılamaz (önce devretmeli)', public._try(format($$select public.team_leave(%L)$$, public._g('T'))) like '%owner_must_transfer%');
select public._as_user(:gina);
select public.team_leave(public._g('T'));
reset role;
select public._check(42, 'üye ayrılır; politika "yönetici devralsın" → içerik yazarlığı sahibe (alice) geçer', public._role(:gina) is null
  and (select created_by = :alice from public.space_items where title = 'Gina promptu'));
select public._check(43, 'ayrılma denetim günlüğüne düştü', (select count(*) from public.team_audit where team_id = public._g('T') and action = 'member_left') = 1);
set role authenticated;
select public._as_user(:gina);
select public._check(44, 'ekipte olmayan ayrılamaz (team_not_found)', public._try(format($$select public.team_leave(%L)$$, public._g('T'))) like '%team_not_found%');
reset role;

-- 7) Gruplar ------------------------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_create_group(public._g('T'), 'Tasarım', 'primary', :carol) as v \gset g_
insert into public._ctx values ('G', :'g_v');
select public._check(45, 'yönetici grup açar; lider otomatik üye olur', (select count(*) from public.team_group_members where group_id = :'g_v' and user_id = :carol) = 1);
select public._check(46, 'aynı ad (büyük/küçük harf farksız) ve geçersiz ton reddedilir', public._try(format($$select public.team_create_group(%L, 'tasarım')$$, public._g('T'))) like '%group_name_taken%'
  and public._try(format($$select public.team_create_group(%L, 'Yeni', 'pembe')$$, public._g('T'))) like '%group_invalid%');
select public.team_set_group_members(:'g_v', array[:frank::uuid, :bobby::uuid]);
select public._check(47, 'üyeler tek işlemde belirlenir (lider korunur): carol, frank, bobby', (select count(*) from public.team_group_members where group_id = :'g_v') = 3);
select public._check(48, 'ekip dışı kişi gruba eklenemez', public._try(format($$select public.team_set_group_members(%L, array[%L]::uuid[])$$, :'g_v', :gina)) like '%group_invalid%');
select public.team_update_group(:'g_v', '{"leads_approve": true, "name": "Tasarım Ekibi"}');
select public._check(49, 'grup güncellenir (liderler onaylar anahtarı)', (select leads_approve and name = 'Tasarım Ekibi' from public.team_groups where id = :'g_v'));
select public._as_user(:carol);
select public._check(50, 'düzenleyici grup yönetemez; üye grupları görür', public._try(format($$select public.team_create_group(%L, 'Hile')$$, public._g('T'))) like '%team_forbidden%'
  and (select count(*) from public.team_list_groups(public._g('T'))) = 1 and (select member_count from public.team_list_groups(public._g('T'))) = 3);
select public._as_user(:bobby);
select public.team_create_space(public._g('T'), 'Grup Space', '', 'free', '{}', 'selected') as v \gset gs_
select public.team_set_space_access(:'gs_v', 'selected', json_build_array(json_build_object('type','group','id',:'g_v','level','view'))::text::jsonb);
select public._check(51, 'grup erişimi Space’e yansır; grup listesi Space erişimini gösterir', (select role from public.space_members where space_id = :'gs_v' and user_id = :frank) = 'viewer'
  and jsonb_array_length((select spaces from public.team_list_groups(public._g('T')) limit 1)) = 1);
select public.team_set_group_members(:'g_v', array[:bobby::uuid]);
reset role;
select public._check(52, 'gruptan çıkan kişinin Space erişimi düşer', not exists (select 1 from public.space_members where space_id = :'gs_v' and user_id = :frank) and public._inv());
set role authenticated;
select public._as_user(:bobby);
select public.team_delete_group(:'g_v');
reset role;
select public._check(53, 'grup silinince erişim girişleri ve üyelikler gider', not exists (select 1 from public.team_access where subject_id = :'g_v') and not exists (select 1 from public.team_group_members where group_id = :'g_v'));

-- 8) Konuklar --------------------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_set_space_access(:'gs_v', 'selected', json_build_array(json_build_object('type','member','id',:erin::text,'level','view'))::text::jsonb);
select public._check(54, 'konuk listesi: süre, kurum, Space erişimi', (select count(*) from public.team_list_guests(public._g('T'))) = 1
  and (select jsonb_array_length(spaces) = 1 and guest_org = 'K' and not expired from public.team_list_guests(public._g('T')) limit 1));
select public._as_user(:carol);
select public._check(55, 'düzenleyici konuk listesini göremez', public._try(format($$select * from public.team_list_guests(%L)$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:bobby);
select public.team_extend_guest(public._g('T'), :erin, 10) > now() + interval '29 days' as v \gset ext_
select public._check(56, 'süre uzatılır (20 + 10 gün)', :'ext_v' = 't');
reset role;
-- tembel temizlik öncesi: süresi dolmuş ama satırı duran konuk Space’i OKUYAMAZ
select set_config('promptly.team_sync', '1', false);
update public.team_members set guest_until = now() - interval '1 hour' where team_id = public._g('T') and user_id = :erin;
insert into public.space_members (space_id, user_id, role) values (:'gs_v', :erin, 'viewer') on conflict do nothing;
select set_config('promptly.team_sync', '', false);
set role authenticated;
select public._as_user(:erin);
select public._check(57, 'süresi dolan konuk tembel temizlikten ÖNCE bile Space’i okuyamaz/düzenleyemez ve rolsüzdür', not public.can_read_space(:'gs_v') and not public.can_edit_space(:'gs_v') and public.space_role(:'gs_v') is null);
reset role;
update public.team_members set guest_until = now() - interval '10 days' where team_id = public._g('T') and user_id = :erin;
set role authenticated;
select public._as_user(:bobby);
select public._check(58, 'temizlik: 7 günden eski dolmuş konuk satırı silinir', public.team_prune_expired_guests(public._g('T')) = 1);
reset role;
select public._check(59, 'DEĞİŞMEZ (konuk temizliğinden sonra)', public._inv() and not exists (select 1 from public.space_members where user_id = :erin));

-- 9) Sahiplik devri ve silme -------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(60, 'sahip olmayan devredemez', public._try(format($$select public.team_transfer_ownership(%L, %L)$$, public._g('T'), :carol)) like '%team_forbidden%');
select public._as_user(:alice);
select public._check(61, 'kendine/ekip dışına devredilemez', public._try(format($$select public.team_transfer_ownership(%L, %L)$$, public._g('T'), :alice)) like '%team_invalid%'
  and public._try(format($$select public.team_transfer_ownership(%L, %L)$$, public._g('T'), :hank)) like '%team_invalid%');
select public.team_transfer_ownership(public._g('T'), :bobby);
reset role;
select public._check(62, 'devir: bobby sahip, alice yönetici; ekip Space’lerinin sahibi de bobby', public._role(:bobby) = 'owner' and public._role(:alice) = 'admin'
  and not exists (select 1 from public.spaces where team_id = public._g('T') and owner_id <> :bobby) and public._inv());
set role authenticated;
select public._as_user(:alice);
select public._check(63, 'eski sahip artık ekibi silemez; yanlış ad onayı reddedilir', public._try(format($$select public.team_delete(%L, 'Atölye Mor')$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:bobby);
select public._check(64, 'ekip adı yanlışsa silinmez', public._try(format($$select public.team_delete(%L, 'yanlis')$$, public._g('T'))) like '%team_confirm_mismatch%');
reset role;

-- İkinci ekip: silme (Space’ler kişisel kalır) ve hesap silinirken sahiplik
set role authenticated;
select public._as_user(:gina);
select public.team_create('Silinecek Ekip') as v \gset t2_
select public.team_create_space(:'t2_v', 'Gina Space') as v \gset s2_
reset role;
insert into public.team_members (team_id, user_id, role) values (:'t2_v', :hank, 'member');
set role authenticated;
select public._as_user(:gina);
select public.team_delete(:'t2_v', 'silinecek ekip');
reset role;
select public._check(65, 'ekip silinir (ad büyük/küçük harf farksız); Space’ler SİLİNMEZ, sahibin kişisel Space’i olur; üyeler bilgilendirilir',
  not exists (select 1 from public.teams where id = :'t2_v') and (select team_id is null and owner_id = :gina::uuid from public.spaces where id = :'s2_v')
  and (select count(*) from public.notifications where recipient_id = :hank and message like '%ekibi silindi%') = 1);
set role authenticated;
select public._as_user(:gina);
select public.team_create('Üçüncü Ekip') as v \gset t3_
select public.team_create_space(:'t3_v', 'Silinecek Space') as v \gset s3_
select public.team_delete(:'t3_v', 'üçüncü ekip', true);
reset role;
select public._check(66, '"Space’leri de sil" seçeneğiyle Space’ler de silinir (kütüphane dahil)', not exists (select 1 from public.spaces where id = :'s3_v') and not exists (select 1 from public.spaces where kind = 'team_library' and owner_id = :gina::uuid and team_id is not null));

-- Hesap silme: sahibin ekibi başka üyeye devredilir; kimse yoksa ekip silinir
set role authenticated;
select public._as_user(:frank);
select public.team_create('Frank Ekibi') as v \gset t4_
reset role;
insert into public.team_members (team_id, user_id, role) values (:'t4_v', :hank, 'member');
select public._as_user('');
select public.delete_account_data(:frank);
select public._check(67, 'sahibi hesabını silince ekip en kıdemli üyeye devredilir ve ekip yaşar', exists (select 1 from public.teams where id = :'t4_v')
  and (select role from public.team_members where team_id = :'t4_v' and user_id = :hank) = 'owner');
set role authenticated;
select public._as_user(:hank);
select public.team_create('Hank Tek Başına') as v \gset t5_
reset role;
select public._as_user('');
select public.delete_account_data(:hank);
select public._check(68, 'tek üyeli ekibin sahibi hesabını silince ekip silinir', not exists (select 1 from public.teams where id = :'t5_v'));

-- 10) Anon -----------------------------------------------------------------------------------------------------------------------------------------
set role anon;
select public._as_user('');
select public._check(69, 'anon üyelik RPC’lerini çağıramaz', public._try(format($$select public.team_invite_user(%L, 'dave')$$, public._g('T'))) like '%permission denied%'
  and public._try($$select * from public.my_team_invitations()$$) like '%permission denied%'
  and public._try($$select public.join_team_via_link('x')$$) like '%permission denied%'
  and public._try('select count(*) from public.team_invitations') like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
