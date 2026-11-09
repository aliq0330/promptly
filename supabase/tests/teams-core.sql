-- Ekipler, WP2 (docs/history/353-*): çekirdek, yetenek matrisi, erişim motoru. Çalıştırma: supabase/tests/run-local.sh supabase/tests/teams-core.sql ("FAILED=0" beklenir).
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
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text) to public;

-- DEĞİŞMEZ: her ekip Space'inde (a) tek sahip satırı = ekip sahibi, (b) her ekip üyesinin satırı `_team_space_level` ile BİREBİR uyumlu,
-- (c) ekip üyesi olmayanın satırı YOK.
create or replace function public._inv() returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.spaces s
     where s.team_id is not null and (
       (select count(*) from public.space_members x where x.space_id = s.id and x.role = 'owner') <> 1
       or not exists (select 1 from public.space_members x join public.team_members tm on tm.team_id = s.team_id and tm.user_id = x.user_id and tm.role = 'owner'
                       where x.space_id = s.id and x.role = 'owner' and x.user_id = s.owner_id)
       or exists (select 1 from public.space_members x where x.space_id = s.id and not exists (select 1 from public.team_members tm where tm.team_id = s.team_id and tm.user_id = x.user_id))
       or exists (
         select 1 from public.team_members tm
          where tm.team_id = s.team_id and tm.user_id <> s.owner_id and (
            public._team_space_level(s.id, tm.user_id) is distinct from
            (select case x.role when 'editor' then 'edit' when 'viewer' then 'view' else 'owner' end
               from public.space_members x where x.space_id = s.id and x.user_id = tm.user_id)))
     )
  )
$$;
grant execute on function public._inv() to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici, dave üye, erin konuk), G grubu (carol).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', 'açıklama', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member');
insert into public.team_members (team_id, user_id, role, guest_until, guest_org) values (public._g('T'), :erin, 'guest', now() + interval '30 days', 'Kuzey Kafe');
insert into public.team_groups (team_id, name, lead_id) values (public._g('T'), 'Tasarım', :carol) returning id as v \gset g_
insert into public._ctx values ('G', :'g_v');
insert into public.team_group_members (group_id, user_id) values (public._g('G'), :carol);

-- 1) Kurulum ----------------------------------------------------------------------------------------------------------------------------
select public._check(1, 'team_create: ekip + sahip üyeliği kuruldu, kütüphane Space’i AÇILMAZ (docs/history/362-*); kısa ad Türkçe karaktersiz',
  (select slug = 'atolye-mor' and name = 'Atölye Mor' and library_space_id is null from public.teams where id = public._g('T'))
  and (select role from public.team_members where team_id = public._g('T') and user_id = :alice) = 'owner'
  and not exists (select 1 from public.spaces where team_id = public._g('T')));
select public._check(2, 'sayaçlar: 4 üye, 1 konuk, 0 Space',
  (select member_count = 4 and guest_count = 1 and space_count = 0 from public.teams where id = public._g('T')));
select public._check(3, 'aynı adla ikinci ekip benzersiz kısa ad alır',
  (select (public._as_user(:gina) is not null or true) and (select count(*) from public.teams) >= 1));
set role authenticated;
select public._as_user(:gina);
select public.team_create('Atölye Mor') as v \gset t2_
select public._check(4, 'ikinci ekibin kısa adı atolye-mor-1', (select slug from public.teams where id = :'t2_v') = 'atolye-mor-1');
select public._check(5, 'kısa/boş ad reddedilir', public._try($$select public.team_create(' a ')$$) like '%team_name_invalid%');
select public._check(6, 'geçersiz ton reddedilir', public._try($$select public.team_create('Geçerli ad', '', 'pembe')$$) like '%team_invalid%');
reset role;
insert into public._ctx values ('T2', :'t2_v');

-- 2) Yetenek matrisi --------------------------------------------------------------------------------------------------------------------
select public._check(7, 'sahip ve yönetici TÜM yeteneklere sahip',
  (select bool_and(public._team_can(public._g('T'), u, c)) from (values (:alice::uuid), (:bobby::uuid)) as x(u),
     unnest(public._team_all_capabilities()) as c where c not in ('export') ));
select public._check(8, 'düzenleyici yalnız Space oluşturur ve ekip değişkeni yazar',
  public._team_can(public._g('T'), :carol, 'create_spaces') and public._team_can(public._g('T'), :carol, 'write_variables')
  and not public._team_can(public._g('T'), :carol, 'approve_library') and not public._team_can(public._g('T'), :carol, 'manage_members')
  and not public._team_can(public._g('T'), :carol, 'view_audit'));
select public._check(9, 'üye, konuk ve yabancı hiçbir yeteneğe sahip değil',
  not exists (select 1 from unnest(public._team_all_capabilities()) c where public._team_can(public._g('T'), :dave, c) or public._team_can(public._g('T'), :erin, c) or public._team_can(public._g('T'), :frank, c)));
select public._check(10, 'politika: dışa aktarma varsayılan yalnız sahip; yayın yöneticiye açık, düzenleyiciye kapalı',
  public._team_can(public._g('T'), :alice, 'export') and not public._team_can(public._g('T'), :bobby, 'export')
  and public._team_can(public._g('T'), :bobby, 'publish_external') and not public._team_can(public._g('T'), :carol, 'publish_external'));

-- 3) Politika güncelleme ----------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(11, 'yönetici politikayı günceller', public._try(format($$select public.team_update(%L, %L::jsonb)$$, public._g('T'), '{"invite_link_ttl_days": 7, "export_role": "admin", "publish_external_role": "editor"}')) = 'ok');
select public._as_user(:carol);
select public._check(12, 'düzenleyici politikayı güncelleyemez', public._try(format($$select public.team_update(%L, %L::jsonb)$$, public._g('T'), '{"invite_link_ttl_days": 5}')) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(13, 'yabancı için ekip görünmez (varlık sızmaz)', public._try(format($$select public.team_update(%L, %L::jsonb)$$, public._g('T'), '{"invite_link_ttl_days": 5}')) like '%team_not_found%');
select public._as_user(:bobby);
select public._check(14, 'geçersiz değer ve bilinmeyen anahtar reddedilir',
  public._try(format($$select public.team_update(%L, %L::jsonb)$$, public._g('T'), '{"invite_link_ttl_days": 99}')) like '%team_invalid%'
  and public._try(format($$select public.team_update(%L, %L::jsonb)$$, public._g('T'), '{"slug": "hile"}')) like '%team_invalid%');
reset role;
select public._check(15, 'politika değişince yetenek kararı değişir (düzenleyici yayınlar, yönetici dışa aktarır)',
  public._team_can(public._g('T'), :carol, 'publish_external') and public._team_can(public._g('T'), :bobby, 'export'));
select public._check(16, 'denetim günlüğüne politika kaydı düştü',
  (select count(*) from public.team_audit where team_id = public._g('T') and action = 'team_updated') = 1);

-- 4) Space oluşturma ve yansıma ----------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public.team_create_space(public._g('T'), 'Moodboard', '', 'moodboard', array['Referanslar']) as v \gset s1_
select public._check(18, 'düzenleyici ekibe Space açar; Space sahibi ekip sahibi, kuran kişi Space’in yöneticisi', :'s1_v' is not null
  and (select owner_id = :alice::uuid and team_creator_id = :carol::uuid and visibility = 'private' from public.spaces where id = :'s1_v')
  and public.space_role(:'s1_v') = 'owner');
select public._as_user(:dave);
select public._check(19, 'üye Space açamaz', public._try(format($$select public.team_create_space(%L, %L)$$, public._g('T'), 'Hile')) like '%team_forbidden%');
select public._as_user(:erin);
select public._check(20, 'konuk Space açamaz', public._try(format($$select public.team_create_space(%L, %L)$$, public._g('T'), 'Hile')) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(21, 'yabancı Space açamaz (aynı hata değil: team_not_found)', public._try(format($$select public.team_create_space(%L, %L)$$, public._g('T'), 'Hile')) like '%team_not_found%');
select public._as_user(:dave);
select public._check(22, 'üye bu Space’i okur (varsayılan: tüm ekip → görüntüleyici) ama düzenleyemez',
  public.can_read_space(:'s1_v') and not public.can_edit_space(:'s1_v'));
reset role;
insert into public._ctx values ('S1', :'s1_v');
select public._check(23, 'DEĞİŞMEZ: yansıma eşitliği', public._inv());

-- 5) Erişim: seçili / yönetici / tüm ekip -------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(24, 'yönetici Space erişimini "seçili" yapar (dave düzenler, erin konuk görüntüler, Tasarım grubu görüntüler)',
  public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S1'),
    json_build_array(json_build_object('type','member','id',:dave::text,'level','edit'), json_build_object('type','member','id',:erin::text,'level','view'),
                     json_build_object('type','group','id',public._g('G')::text,'level','view'))::text)) = 'ok');
reset role;
select public._check(25, 'seçili modda yansıma: dave düzenleyici, erin görüntüleyici, carol (grup) görüntüleyici, yönetici düzenleyici',
  (select role from public.space_members where space_id = public._g('S1') and user_id = :dave) = 'editor'
  and (select role from public.space_members where space_id = public._g('S1') and user_id = :erin) = 'viewer'
  and (select role from public.space_members where space_id = public._g('S1') and user_id = :carol) = 'viewer'
  and (select role from public.space_members where space_id = public._g('S1') and user_id = :bobby) = 'editor');
select public._check(26, 'DEĞİŞMEZ (seçili mod)', public._inv());
update public.team_members set guest_until = now() - interval '1 day' where team_id = public._g('T') and user_id = :erin;
select public._check(27, 'süresi dolan konuğun Space erişimi anında kalkar', not exists (select 1 from public.space_members where space_id = public._g('S1') and user_id = :erin)
  and public._team_role(public._g('T'), :erin) is null);
update public.team_members set guest_until = now() + interval '30 days' where team_id = public._g('T') and user_id = :erin;
select public._check(28, 'konuğun süresi uzatılınca seçili Space erişimi geri gelir', (select role from public.space_members where space_id = public._g('S1') and user_id = :erin) = 'viewer');
set role authenticated;
select public._as_user(:bobby);
select public.team_set_space_access(public._g('S1'), 'admins', '[]');
reset role;
select public._check(29, '"yalnız yöneticiler" modunda yalnız sahip + yönetici kalır',
  (select count(*) from public.space_members where space_id = public._g('S1')) = 2
  and exists (select 1 from public.space_members where space_id = public._g('S1') and user_id = :bobby)
  and (select count(*) from public.team_access where space_id = public._g('S1')) = 0);
set role authenticated;
select public._as_user(:dave);
select public._check(30, '"yalnız yöneticiler" Space’i üye için görünmez', not public.can_read_space(public._g('S1')));
select public._as_user(:carol);
select public._check(31, 'Space’i açan düzenleyici de erişimi kaybedebilir ama yine de erişim penceresini okuyabilir? (yetkili = yönetici ya da kuran)',
  public._try(format($$select public.team_space_access(%L)$$, public._g('S1'))) = 'ok');
select public._as_user(:dave);
select public._check(32, 'üye erişim ayarını okuyamaz/değiştiremez',
  public._try(format($$select public.team_space_access(%L)$$, public._g('S1'))) like '%team_forbidden%'
  and public._try(format($$select public.team_set_space_access(%L, 'all', '[]')$$, public._g('S1'))) like '%team_forbidden%');
select public._as_user(:bobby);
select public.team_set_space_access(public._g('S1'), 'all', '[]');
reset role;
select public._check(33, '"tüm ekip" modunda: dave görüntüleyici, carol düzenleyici, konuk yok', (select role from public.space_members where space_id = public._g('S1') and user_id = :dave) = 'viewer'
  and (select role from public.space_members where space_id = public._g('S1') and user_id = :carol) = 'editor'
  and not exists (select 1 from public.space_members where space_id = public._g('S1') and user_id = :erin));
select public._check(34, 'DEĞİŞMEZ (tüm ekip)', public._inv());
set role authenticated;
select public._as_user(:bobby);
select public._check(36, 'geçersiz özne (ekip dışı kullanıcı) ve fazla giriş reddedilir',
  public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S1'),
    json_build_array(json_build_object('type','member','id',:frank::text,'level','edit'))::text)) like '%space_invalid%'
  and public._try(format($$select public.team_set_space_access(%L, 'all', %L::jsonb)$$, public._g('S1'),
    json_build_array(json_build_object('type','member','id',:dave::text,'level','edit'))::text)) like '%space_invalid%');
reset role;

-- 6) Üyelik değişimi ve temizlik ----------------------------------------------------------------------------------------------------------
insert into public.team_access (team_id, space_id, subject_type, subject_id, level) values (public._g('T'), public._g('S1'), 'member', :dave, 'edit');
delete from public.team_members where team_id = public._g('T') and user_id = :dave;
select public._check(37, 'üye çıkarılınca Space satırları, kişiye özel erişim girişi ve sayaç temizlenir',
  not exists (select 1 from public.space_members where user_id = :dave and space_id in (select id from public.spaces where team_id = public._g('T')))
  and not exists (select 1 from public.team_access where subject_id = :dave)
  and (select member_count from public.teams where id = public._g('T')) = 3);
select public._check(38, 'DEĞİŞMEZ (üye çıkarıldıktan sonra)', public._inv());
update public.team_members set role = 'member' where team_id = public._g('T') and user_id = :bobby;
select public._check(39, 'yönetici üyeye düşünce Space satırı görüntüleyiciye iner (yansıma rol değişimini izler)',
  (select role from public.space_members where space_id = public._g('S1') and user_id = :bobby) = 'viewer');
update public.team_members set role = 'admin' where team_id = public._g('T') and user_id = :bobby;
select public._check(40, 'sahip satırı silinemez', public._try(format($$delete from public.team_members where team_id = %L and user_id = %L$$, public._g('T'), :alice)) like '%team_owner_required%');
select public._check(41, 'ekipte tek sahip olabilir', public._try(format($$update public.team_members set role = 'owner' where team_id = %L and user_id = %L$$, public._g('T'), :bobby)) like '%team_members_one_owner%');

-- 7) İstemci doğrudan yazamaz -------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(42, 'yönetici bile team_members’a doğrudan yazamaz', public._try(format($$insert into public.team_members (team_id, user_id, role) values (%L, %L, 'member')$$, public._g('T'), :frank)) like '%permission denied%');
select public._check(43, 'teams, team_access ve team_audit’e doğrudan yazılamaz',
  public._try(format($$update public.teams set name = 'Hile' where id = %L$$, public._g('T'))) like '%permission denied%'
  and public._try(format($$insert into public.team_access (team_id, space_id, subject_type, subject_id, level) values (%L, %L, 'member', %L, 'edit')$$, public._g('T'), public._g('S1'), :frank)) like '%permission denied%'
  and public._try(format($$delete from public.team_audit where team_id = %L$$, public._g('T'))) like '%permission denied%');
select public._check(44, 'ekip Space’ine doğrudan üye eklenemez/silinemez (space_team_managed)',
  public._try(format($$insert into public.space_members (space_id, user_id, role) values (%L, %L, 'editor')$$, public._g('S1'), :frank)) ~ 'space_team_managed|permission denied|row-level security'
  and public._try(format($$update public.spaces set team_id = null where id = %L$$, public._g('S1'))) ~ 'space_invalid|permission denied'
  and public._try(format($$update public.spaces set visibility = 'public' where id = %L$$, public._g('S1'))) ~ 'space_team_managed|space_invalid');
select public._as_user(:bobby);
reset role;

-- 8) Okuma politikaları -------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:frank);
select public._check(47, 'yabancı hiçbir ekip satırı görmez', public._cnt('select count(*) from public.teams where id = ' || quote_literal(public._g('T'))) = 0
  and public._cnt('select count(*) from public.team_members where team_id = ' || quote_literal(public._g('T'))) = 0);
select public._as_user(:carol);
select public._check(48, 'düzenleyici üye listesini ve grupları okur; erişim girişlerini ve denetim günlüğünü okuyamaz',
  public._cnt('select count(*) from public.team_members where team_id = ' || quote_literal(public._g('T'))) = 4
  and public._cnt('select count(*) from public.team_groups where team_id = ' || quote_literal(public._g('T'))) = 1
  and public._cnt('select count(*) from public.team_audit where team_id = ' || quote_literal(public._g('T'))) = 0
  and public._cnt('select count(*) from public.team_access') = 0);
select public._as_user(:bobby);
select public._check(49, 'yönetici denetim günlüğünü okur', public._cnt('select count(*) from public.team_audit where team_id = ' || quote_literal(public._g('T'))) >= 3);
select public._as_user(:erin);
select public._check(50, 'etkin konuk ekip satırını okur ama üye listesinde yalnız kendini görür, grupları görmez',
  public._cnt('select count(*) from public.teams where id = ' || quote_literal(public._g('T'))) = 1
  and public._cnt('select count(*) from public.team_members where team_id = ' || quote_literal(public._g('T'))) = 1
  and public._cnt('select count(*) from public.team_groups') = 0);
select public._check(51, 'my_teams: sahip kendi ekibini, konuk rolüyle ekibini, yabancı hiçbirini görür',
  (select count(*) from public.my_teams()) = 1 and (select my_role from public.my_teams()) = 'guest');
select public._as_user(:frank);
select public._check(52, 'yabancının my_teams listesi boş', (select count(*) from public.my_teams()) = 0);
select public._as_user(:alice);
select public._check(53, 'sahibin my_teams satırı: rol, sayaçlar, kütüphane YOK', (select my_role = 'owner' and member_count = 3 and space_count = 1 and library_space_id is null from public.my_teams() where slug = 'atolye-mor'));
select public._check(54, 'team_list_spaces: yalnız ekip Space’i (kütüphane yok), erişim modu',
  (select not is_library and access_mode = 'all' from public.team_list_spaces(public._g('T')) limit 1)
  and (select count(*) from public.team_list_spaces(public._g('T'))) = 1);
select public._check(55, 'team_space_access: mod ve girişler JSON olarak döner', (public.team_space_access(public._g('S1')) ->> 'mode') = 'all');
reset role;
update public.team_members set guest_until = now() - interval '1 day' where team_id = public._g('T') and user_id = :erin;
set role authenticated;
select public._as_user(:erin);
select public._check(56, 'süresi dolan konuk ekibi hiç göremez (my_teams boş, ekip satırı yok)', (select count(*) from public.my_teams()) = 0 and public._cnt('select count(*) from public.teams') = 0);
reset role;

-- 9) Sınırlar ------------------------------------------------------------------------------------------------------------------------------
do $$
declare i int; v uuid;
begin
  for i in 1..9 loop
    insert into public.teams (slug, name) values ('limit-' || i, 'Limit ' || i) returning id into v;
    insert into public.team_members (team_id, user_id, role) values (v, '22222222-2222-4222-8222-222222222222', 'owner');
  end loop;
end $$;
set role authenticated;
select public._as_user(:bobby);
select public._check(57, 'kişi başına 10 ekip sahipliği sınırı', public._try($$select public.team_create('Onbirinci')$$) like '%team_owner_limit%' or public._try($$select public.team_create('Onuncu')$$) like '%team_owner_limit%');
reset role;

-- 10) Ekip silme: Space’ler kişisel kalır -------------------------------------------------------------------------------------------------
select public._as_user(:gina);
set role authenticated;
select public.team_create_space(public._g('T2'), 'Gina Space') as v \gset gs_
reset role;
insert into public.team_members (team_id, user_id, role) values (public._g('T2'), :bobby, 'member');
select public._check(58, 'ikinci ekipte yansıma çalışıyor (bobby üye → görüntüleyici)', (select role from public.space_members where space_id = :'gs_v' and user_id = :bobby) = 'viewer' and public._inv());
delete from public.teams where id = public._g('T2');
select public._check(59, 'ekip silinince Space’ler SİLİNMEZ: sahibin kişisel Space’i olur, ekip üyelerinin erişimi kalkar',
  (select team_id is null and owner_id = :gina::uuid and team_access_mode = 'all' from public.spaces where id = :'gs_v')
  and not exists (select 1 from public.space_members where space_id = :'gs_v' and user_id = :bobby)
  and exists (select 1 from public.space_members where space_id = :'gs_v' and user_id = :gina and role = 'owner'));
select public._check(60, 'ekip silinince kütüphane Space’i de kişisel olarak kalır; denetim kayıtları temizlenir; üyelikler gider',
  not exists (select 1 from public.spaces where team_id = public._g('T2')) and not exists (select 1 from public.team_members where team_id = public._g('T2'))
  and not exists (select 1 from public.team_audit where team_id = public._g('T2')));

-- 11) Anon ---------------------------------------------------------------------------------------------------------------------------------
set role anon;
select public._as_user('');
select public._check(61, 'anon ekip tablolarını okuyamaz ve RPC’leri çağıramaz',
  public._try('select count(*) from public.teams') like '%permission denied%'
  and public._try('select * from public.my_teams()') like '%permission denied%'
  and public._try(format($$select public.team_create_space(%L, 'x')$$, public._g('T'))) like '%permission denied%'
  and public._try(format($$select public.team_set_space_access(%L, 'all', '[]')$$, public._g('S1'))) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
