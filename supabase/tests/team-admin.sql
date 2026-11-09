-- Ekipler, WP6 (docs/history/353-*): yönetim, entegrasyon (API/MCP), panel, dışa aktarma, Senden bekleyenler. Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-admin.sql ("FAILED=0" beklenir).
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
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
  perform set_config('request.jwt.claims', case when uid = '' then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text) to public;

-- Kurulum: alice sahip, bobby yönetici, carol düzenleyici, dave üye, erin konuk.
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member');
insert into public.team_members (team_id, user_id, role, guest_until) values (public._g('T'), :erin, 'guest', now() + interval '3 days');

-- 1) Denetim günlüğü ------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_set_member_role(public._g('T'), :dave, 'editor');
select public.team_set_member_role(public._g('T'), :dave, 'member');
select public._check(1, 'yönetici denetim günlüğünü listeler; kategori süzgeci çalışır', (select count(*) from public.team_audit_list(public._g('T'))) >= 3
  and (select count(*) from public.team_audit_list(public._g('T'), 'role')) = 2 and (select count(*) from public.team_audit_list(public._g('T'), 'policy')) = 0);
select public._check(2, 'günlük satırı yapan kişi ve hedefi taşır', (select actor_username = 'bobby' and target_label = 'dave' and details ->> 'to' = 'editor' from public.team_audit_list(public._g('T'), 'role') order by created_at limit 1));
select public._check(3, 'istatistik: toplam, rol/erişim', (public.team_audit_stats(public._g('T')) ->> 'role_access')::int = 2);
select public._as_user(:carol);
select public._check(4, 'düzenleyici ve üye günlüğü göremez', public._try(format($$select * from public.team_audit_list(%L)$$, public._g('T'))) like '%team_forbidden%'
  and public._try(format($$select public.team_audit_stats(%L)$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(5, 'yabancı için ekip görünmez', public._try(format($$select * from public.team_audit_list(%L)$$, public._g('T'))) like '%team_not_found%');
reset role;

-- 2) Erişim özeti ---------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_create_space(public._g('T'), 'Kuzey Kafe', '', 'free', '{}', 'selected') as v \gset sp_
select public.team_set_space_access(:'sp_v', 'selected', json_build_array(json_build_object('type','member','id',:erin::text,'level','view'))::text::jsonb);
select public._check(6, 'erişim özeti: ekip Space’i için mod/konuk/giriş sayıları, kütüphane satırı yok',
  (select guest_count = 1 and entry_count = 1 and mode = 'selected' from public.team_access_overview(public._g('T')) where title = 'Kuzey Kafe')
  and not exists (select 1 from public.team_access_overview(public._g('T')) where is_library));
select public._as_user(:carol);
select public._check(7, 'düzenleyici erişim özetini göremez', public._try(format($$select * from public.team_access_overview(%L)$$, public._g('T'))) like '%team_forbidden%');
reset role;

-- 3) Panel ---------------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(14, 'üye paneli göremez', public._try(format($$select public.team_insights(%L)$$, public._g('T'))) like '%team_forbidden%');
reset role;

-- 4) Senden bekleyenler -------------------------------------------------------------------------------------------------------------------
insert into public.messages (conversation_id, sender_id, body) select tc.id, :carol, 'selam' from public.team_channels tc where tc.team_id = public._g('T') and tc.name = 'genel';
set role authenticated;
select public._as_user(:bobby);
select public._check(15, 'yöneticiye: okunmamış mesaj + dolmak üzere konuk satırı; kütüphane onayı satırı YOK (proje onayları team_project_todos’ta)',
  (select n from public.my_team_todos() where kind = 'unread') = 1 and (select n from public.my_team_todos() where kind = 'guest_expiring') = 1
  and not exists (select 1 from public.my_team_todos() where kind in ('approvals', 'review')));
select public._as_user(:carol);
select public._check(16, 'onaylayamayan düzenleyici onay/konuk satırı görmez (yalnız okunmamış varsa o)', not exists (select 1 from public.my_team_todos() where kind in ('approvals', 'review', 'guest_expiring')));
select public._as_user(:dave);
select public._check(17, 'üye için okunmamış satırı var', (select n from public.my_team_todos() where kind = 'unread') = 1);
reset role;

-- 5) Dışa aktarma --------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(18, 'varsayılan: yalnız sahip dışa aktarır', public._try(format($$select public.team_export(%L)$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:alice);
select public.team_export(public._g('T'))::text as v \gset ex_
select public.team_update(public._g('T'), '{"export_role": "admin"}');
select public._as_user(:bobby);
select public._check(19, 'politika gevşeyince yönetici de dışa aktarır', public._try(format($$select public.team_export(%L)$$, public._g('T'))) = 'ok');
reset role;
select public._check(20, 'dışa aktarma biçimi: zarf + ekip + projeler; denetim kaydı',
  (:'ex_v'::jsonb ->> 'format') = 'promptly.team' and (:'ex_v'::jsonb -> 'team' ->> 'slug') = 'atolye-mor' and jsonb_typeof(:'ex_v'::jsonb -> 'projects') = 'array'
  and exists (select 1 from public.team_audit where team_id = public._g('T') and action = 'team_exported'));

-- 7) Bildirim kategorisi, anon -------------------------------------------------------------------------------
select public._check(35, 'bildirim kategorisi: /teams adresleri ve ekip Space inceleme adresi "teams"', public._notification_category('system', '/teams') = 'teams'
  and public._notification_category('system', '/teams/local?id=x&tab=chat') = 'teams' and public._notification_category('system', '/spaces/local?id=x&tab=prompts') = 'teams'
  and public._notification_category('system', '/communities/local?id=x') = 'community' and public._notification_category('like', '/prompts/local?id=1') = 'posts');
set role anon;
select public._as_user('');
select public._check(37, 'anon yeni RPC’leri çağıramaz', public._try(format($$select public.team_insights(%L)$$, public._g('T'))) like '%permission denied%'
  and public._try($$select * from public.my_team_todos()$$) like '%permission denied%'
  and public._try(format($$select public.team_export(%L)$$, public._g('T'))) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
