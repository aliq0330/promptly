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
insert into public._ctx select 'LIB', library_space_id::text from public.teams where id = public._g('T');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member');
insert into public.team_members (team_id, user_id, role, guest_until) values (public._g('T'), :erin, 'guest', now() + interval '3 days');
-- Öğeler: A onaylı (inceleme 5 saat sürdü), B onay bekliyor (4 gündür), C eski taslak (120 gün), D kullanımdan kalkmış
select set_config('promptly.space_approval', '1', false), set_config('promptly.space_review', '1', false);
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by, approved_at, approved_by, review_started_at, updated_at) values
  (public._g('LIB'), 'prompt', 'Ürün tanıtım', 'merhaba {marka}', true, :carol, :carol, now() - interval '1 day', :bobby, now() - interval '1 day' - interval '5 hours', now() - interval '1 day') returning id as v \gset a_
insert into public._ctx values ('A', :'a_v');
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by, review_requested_at, review_requested_by, review_started_at) values
  (public._g('LIB'), 'prompt', 'Sosyal başlık', 'x', true, :carol, :carol, now() - interval '4 days', :carol, now() - interval '4 days') returning id as v \gset b_
insert into public._ctx values ('B', :'b_v');
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by) values (public._g('LIB'), 'prompt', 'Eski taslak', 'y', true, :carol, :carol) returning id as v \gset c_
insert into public._ctx values ('C', :'c_v');
update public.space_items set updated_at = now() - interval '120 days' where id = public._g('C');
insert into public.space_items (space_id, kind, title, body, is_draft, created_by, updated_by, deprecated_at, deprecated_by) values (public._g('LIB'), 'prompt', 'Kalkan prompt', 'z', true, :carol, :carol, now() - interval '2 days', :bobby) returning id as v \gset d_
insert into public._ctx values ('D', :'d_v');
select set_config('promptly.space_approval', '', false), set_config('promptly.space_review', '', false);
-- Kullanımlar: A 3 kişi dün/bugün, D de kullanılmış
insert into public.space_item_uses (item_id, space_id, user_id, day) values
  (public._g('A'), public._g('LIB'), :dave, (now() at time zone 'utc')::date), (public._g('A'), public._g('LIB'), :carol, (now() at time zone 'utc')::date - 1),
  (public._g('A'), public._g('LIB'), :bobby, (now() at time zone 'utc')::date - 40), (public._g('D'), public._g('LIB'), :dave, (now() at time zone 'utc')::date - 2);
update public.space_items set works_yes = 9, works_no = 1 where id = public._g('A');

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
select public._check(6, 'erişim özeti: kütüphane en üstte, mod/konuk/giriş sayıları', (select is_library and mode = 'all' from public.team_access_overview(public._g('T')) limit 1)
  and (select guest_count = 1 and entry_count = 1 and mode = 'selected' from public.team_access_overview(public._g('T')) where title = 'Kuzey Kafe'));
select public._as_user(:carol);
select public._check(7, 'düzenleyici erişim özetini göremez', public._try(format($$select * from public.team_access_overview(%L)$$, public._g('T'))) like '%team_forbidden%');
reset role;

-- 3) Panel ---------------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public.team_insights(public._g('T'), 30)::text as v \gset in_
reset role;
select public._check(8, 'panel: 30 günde 3 kopyalama (40 gün önceki sayılmaz), önceki dönem 1', (:'in_v'::jsonb ->> 'copies')::int = 3 and (:'in_v'::jsonb ->> 'copies_prev')::int = 1);
select public._check(9, 'panel: günlük dizi 30 gün; bugün 1, dün 1', jsonb_array_length(:'in_v'::jsonb -> 'daily') = 30
  and (:'in_v'::jsonb -> 'daily' -> 29 ->> 'n')::int = 1 and (:'in_v'::jsonb -> 'daily' -> 28 ->> 'n')::int = 1);
select public._check(10, 'panel: onay süresi medyanı ≈ 5 saat', abs((:'in_v'::jsonb ->> 'approval_hours')::numeric - 5) < 0.2);
select public._check(11, 'panel: uyarılar — bekleyen 1 (4 gün), eskimiş 1, kullanımdan kalkan ama kullanılan 1',
  (:'in_v'::jsonb -> 'alerts' ->> 'pending')::int = 1 and (:'in_v'::jsonb -> 'alerts' ->> 'oldest_pending_days')::int >= 3
  and (:'in_v'::jsonb -> 'alerts' ->> 'stale')::int = 1 and (:'in_v'::jsonb -> 'alerts' ->> 'deprecated_used')::int = 1);
select public._check(12, 'panel: en çok kullanılan — A, oy 9/1', (:'in_v'::jsonb -> 'top' -> 0 ->> 'title') = 'Ürün tanıtım' and (:'in_v'::jsonb -> 'top' -> 0 ->> 'copies')::int = 2
  and (:'in_v'::jsonb -> 'top' -> 0 ->> 'works_yes')::int = 9 and jsonb_array_length(:'in_v'::jsonb -> 'top') = 1);
select public._check(13, 'panel: katkı veren ve üye sayıları', (:'in_v'::jsonb ->> 'contributors')::int >= 1 and (:'in_v'::jsonb ->> 'members')::int = 4);
set role authenticated;
select public._as_user(:dave);
select public._check(14, 'üye paneli göremez', public._try(format($$select public.team_insights(%L)$$, public._g('T'))) like '%team_forbidden%');
reset role;

-- 4) Senden bekleyenler -------------------------------------------------------------------------------------------------------------------
insert into public.messages (conversation_id, sender_id, body) select tc.id, :carol, 'selam' from public.team_channels tc where tc.team_id = public._g('T') and tc.name = 'genel';
set role authenticated;
select public._as_user(:bobby);
select public._check(15, 'onaylayıcıya: bekleyen onay sayısı + inceleme satırı + okunmamış mesaj + dolmak üzere konuk',
  (select n from public.my_team_todos() where kind = 'approvals') = 1 and (select label from public.my_team_todos() where kind = 'review') like 'Sosyal başlık%'
  and (select n from public.my_team_todos() where kind = 'unread') = 1 and (select n from public.my_team_todos() where kind = 'guest_expiring') = 1);
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
select public._check(20, 'dışa aktarma biçimi: zarf, ekip, öğeler (durum/sürüm/kullanım), Space’ler; denetim kaydı',
  (:'ex_v'::jsonb ->> 'format') = 'promptly.team-library' and (:'ex_v'::jsonb -> 'team' ->> 'slug') = 'atolye-mor' and jsonb_array_length(:'ex_v'::jsonb -> 'items') = 4
  and (select count(*) from jsonb_array_elements(:'ex_v'::jsonb -> 'items') e where e ->> 'state' = 'approved' and (e ->> 'uses')::int >= 0) = 1
  and jsonb_array_length(:'ex_v'::jsonb -> 'spaces') = 1 and exists (select 1 from public.team_audit where team_id = public._g('T') and action = 'team_exported'));

-- 6) API / MCP politikaları -----------------------------------------------------------------------------------------------------------------
insert into public.api_tokens (id, user_id, name, token_hash, prefix) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', :dave, 'Pazarlama botu', repeat('a', 64), 'pmt_aaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', :carol, 'Cursor', repeat('b', 64), 'pmt_bbbb');
set role authenticated;
select public._as_user(:dave);
select set_config('request.jwt.claims', json_build_object('sub', :dave::text, 'role', 'authenticated', 'token_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'via', 'key')::text, false);
select public._check(21, 'üye ekip kütüphanesini görür; slug süzgeci çalışır', (select count(*) from public.api_me_libraries()) = 1 and (select count(*) from public.api_me_team_libraries('atolye-mor')) = 1
  and (select count(*) from public.api_me_team_libraries('baska-ekip')) = 0);
select public._check(22, 'API yalnız ONAYLI, kullanımdan kalkmamış, gizli olmayan promptları döner (üye; onaysız istense bile)',
  (select count(*) from public.api_me_library_prompts(public._g('LIB'), true)) = 1 and (select title from public.api_me_library_prompts(public._g('LIB'), true)) = 'Ürün tanıtım');
select public._as_user(:carol);
select set_config('request.jwt.claims', json_build_object('sub', :carol::text, 'role', 'authenticated', 'token_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'via', 'key')::text, false);
select public._check(23, 'düzenleyici onaysız taslakları da isteyebilir (kullanımdan kalkan hâlâ hariç)', (select count(*) from public.api_me_library_prompts(public._g('LIB'), true)) = 3);
reset role;
select public._check(24, 'okumalar günlüğe yazıldı (dave 2 çağrı, carol 3 öğe)', (select sum(reads) from public.team_api_usage where user_id = :dave) = 2 and (select sum(reads) from public.team_api_usage where user_id = :carol) = 3
  and (select token_id from public.team_api_usage where user_id = :dave) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
set role authenticated;
select public._as_user(:bobby);
select public.team_integrations(public._g('T'))::text as v \gset ig_
select public._check(25, 'entegrasyon özeti: kısa ad, kitle, bağlı uygulamalar (anahtar adıyla), ay okuması', (:'ig_v'::jsonb ->> 'slug') = 'atolye-mor' and (:'ig_v'::jsonb ->> 'month_reads')::int = 5
  and jsonb_array_length(:'ig_v'::jsonb -> 'apps') = 2 and exists (select 1 from jsonb_array_elements(:'ig_v'::jsonb -> 'apps') a where a ->> 'name' = 'Pazarlama botu' and a ->> 'user_name' = 'Dave'));
select public.team_set_api_block(public._g('T'), :dave, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select public._as_user(:dave);
select set_config('request.jwt.claims', json_build_object('sub', :dave::text, 'role', 'authenticated', 'token_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'via', 'key')::text, false);
select public._check(26, 'ekip bazlı engel: engellenen anahtar ekip kütüphanesini göremez; aynı kişinin başka kimliği görür', (select count(*) from public.api_me_libraries()) = 0 and (select count(*) from public.api_me_library_prompts(public._g('LIB'))) = 0
  and (select count(*) from public.api_me_library_variables(public._g('LIB'))) = 0);
select set_config('request.jwt.claims', json_build_object('sub', :dave::text, 'role', 'authenticated', 'via', 'oauth')::text, false);
select public._check(27, '(engelsiz kimlik) aynı kullanıcı OAuth ile okur', (select count(*) from public.api_me_libraries()) = 1);
select public._as_user(:bobby);
select public.team_set_api_block(public._g('T'), :dave, null, true);
select public._as_user(:dave);
select public._check(28, 'kullanıcı düzeyinde engel tüm kimlikleri kapatır', (select count(*) from public.api_me_libraries()) = 0);
select public._as_user(:bobby);
select public.team_set_api_block(public._g('T'), :dave, null, false);
select public.team_set_api_block(public._g('T'), :dave, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
select public.team_update(public._g('T'), '{"mcp_audience": "editors"}');
select public._as_user(:dave);
select public._check(29, 'kitle "yalnız düzenleyiciler": üye göremez', (select count(*) from public.api_me_libraries()) = 0);
select public._as_user(:carol);
select public._check(30, 'kitle "yalnız düzenleyiciler": düzenleyici görür', (select count(*) from public.api_me_libraries()) = 1);
select public._as_user(:bobby);
select public.team_update(public._g('T'), '{"mcp_audience": "members", "mcp_enabled": false}');
select public._as_user(:carol);
select public._check(31, 'ekip MCP kapalıyken hiçbir üye ekip kütüphanesini API ile okuyamaz', (select count(*) from public.api_me_libraries()) = 0);
select public._as_user(:bobby);
select public.team_update(public._g('T'), '{"mcp_enabled": true}');
select public._as_user(:erin);
select public._check(32, 'konuk API ile ekip kütüphanesini göremez (üye değil)', (select count(*) from public.api_me_libraries()) = 0);
select public._as_user(:dave);
select public._check(33, 'üye ekip entegrasyon sayfasını göremez; engel koyamaz', public._try(format($$select public.team_integrations(%L)$$, public._g('T'))) like '%team_forbidden%'
  and public._try(format($$select public.team_set_api_block(%L, %L, null, true)$$, public._g('T'), :carol)) like '%team_forbidden%');
reset role;

-- 7) Kişisel kütüphane eskisi gibi, bildirim kategorisi, anon -------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public.create_space('Kişisel kütüphane', '', 'team_library') as v \gset pl_
select public._check(34, 'kişisel kütüphane API’de görünür (ekip politikasına tabi değil)', (select count(*) from public.api_me_libraries() where title = 'Kişisel kütüphane') = 1);
reset role;
select public._check(35, 'bildirim kategorisi: /teams adresleri ve ekip Space inceleme adresi "teams"', public._notification_category('system', '/teams') = 'teams'
  and public._notification_category('system', '/teams/local?id=x&tab=chat') = 'teams' and public._notification_category('system', '/spaces/local?id=x&tab=prompts') = 'teams'
  and public._notification_category('system', '/communities/local?id=x') = 'community' and public._notification_category('like', '/prompts/local?id=1') = 'posts');
select public._check(36, 'inceleme başlangıcı: onay isteği ilk kez kurulunca review_started_at yazılır', (select review_started_at is not null from public.space_items where id = public._g('B')));
set role anon;
select public._as_user('');
select public._check(37, 'anon yeni RPC’leri çağıramaz', public._try(format($$select public.team_insights(%L)$$, public._g('T'))) like '%permission denied%'
  and public._try($$select * from public.my_team_todos()$$) like '%permission denied%'
  and public._try(format($$select public.team_export(%L)$$, public._g('T'))) like '%permission denied%'
  and public._try($$select * from public.api_me_team_libraries()$$) like '%permission denied%'
  and public._try('select count(*) from public.team_api_usage') like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
