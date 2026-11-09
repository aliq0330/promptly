-- Ekip projeleri (docs/history/360-*, 361-*): proje başına rol (WP1), proje kütüphanesi (WP2), Space'e bağlı kanal (WP3).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-projects.sql ("FAILED=0" beklenir).
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
\set ivy   '''99999999-9999-4999-8999-999999999999'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank'),(:gina,'gina'),(:hank,'hank'),(:ivy,'ivy')) as u(id, name);

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

-- DEĞİŞMEZ (4 seviyeli): her ekip Space'inde (a) tek sahip satırı = ekip sahibi, (b) her ekip üyesinin `space_members` satırı 4 seviyeli erişimle BİREBİR uyumlu
-- (view → viewer; edit/approve/manage → editor), (c) ekip üyesi olmayanın satırı YOK. Kütüphane çocuğunda erişim projeyi izler (WP2).
create or replace function public._inv() returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.spaces s
     where s.team_id is not null and (
       (select count(*) from public.space_members x where x.space_id = s.id and x.role = 'owner') <> 1
       or exists (select 1 from public.space_members x where x.space_id = s.id and not exists (select 1 from public.team_members tm where tm.team_id = s.team_id and tm.user_id = x.user_id))
       or exists (
         select 1 from public.team_members tm
          where tm.team_id = s.team_id and tm.user_id <> s.owner_id and (
            (case public._team_space_access_level(s.id, tm.user_id) when 'view' then 'viewer' when 'edit' then 'editor' when 'approve' then 'editor' when 'manage' then 'editor' end)
            is distinct from (select x.role from public.space_members x where x.space_id = s.id and x.user_id = tm.user_id)))
     )
  )
$$;
grant execute on function public._inv() to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici, dave/frank/gina/hank üye, erin konuk), G grubu (carol, dave), H grubu (frank, gina).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', 'açıklama', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'),
  (public._g('T'), :frank, 'member'), (public._g('T'), :gina, 'member'), (public._g('T'), :hank, 'member');
insert into public.team_members (team_id, user_id, role, guest_until, guest_org) values (public._g('T'), :erin, 'guest', now() + interval '30 days', 'Kuzey Kafe');
insert into public.team_groups (team_id, name, lead_id) values (public._g('T'), 'Tasarım', :carol) returning id as v \gset g_
insert into public._ctx values ('G', :'g_v');
insert into public.team_group_members (group_id, user_id) values (public._g('G'), :carol), (public._g('G'), :dave);
insert into public.team_groups (team_id, name, lead_id) values (public._g('T'), 'İçerik', :frank) returning id as v \gset h_
insert into public._ctx values ('H', :'h_v');
insert into public.team_group_members (group_id, user_id) values (public._g('H'), :frank), (public._g('H'), :gina);
insert into public._ctx select 'LIB', library_space_id::text from public.teams where id = public._g('T');

-- ============================================================================================================================================
-- WP0) R1: `space` kanalı olan Space silinebilir mi? (360 §8 R1 — FK `on delete set null` + CHECK çakışma adayı)
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:alice);
select public.team_create_space(public._g('T'), 'Silinecek', '', 'free') as v \gset sdel_
select public.team_create_channel(public._g('T'), 'silinecek-kanal', '', 'space', :'sdel_v'::uuid) as v \gset cdel_
reset role;
select public._try(format($$delete from public.spaces where id = %L$$, :'sdel_v')) as r \gset del_
select public._check(1, 'R1: kanalı olan ekip Space’i silinebilir (kanal da gider)', :'del_r' = 'ok' and not exists (select 1 from public.spaces where id = :'sdel_v'::uuid)
  and not exists (select 1 from public.team_channels where id = :'cdel_v'::uuid), :'del_r');

-- ============================================================================================================================================
-- WP1) Proje başına rol: view < edit < approve < manage
-- ============================================================================================================================================
create or replace function public._lvl(sp uuid, u uuid) returns text language sql security definer as $$ select public._team_space_access_level(sp, u) $$;
create or replace function public._sm(sp uuid, u uuid) returns text language sql security definer as $$ select role from public.space_members where space_id = sp and user_id = u $$;
create or replace function public._aud(act text) returns integer language sql security definer as $$ select count(*)::integer from public.team_audit where team_id = public._g('T') and action = act $$;
grant execute on function public._lvl(uuid, uuid), public._sm(uuid, uuid), public._aud(text) to public;

set role authenticated;
select public._as_user(:carol);
select public.team_create_space(public._g('T'), 'Marka kimliği', '', 'brand') as v \gset s1_
select public._as_user(:alice);
select public.team_create_space(public._g('T'), 'Kampanya', '', 'free') as v \gset s2_
reset role;
insert into public._ctx values ('S1', :'s1_v'), ('S2', :'s2_v');

select public._check(10, 'all modu: sahip/yönetici manage, düzenleyici edit, üye view, konuk erişimsiz',
  public._lvl(public._g('S1'), :alice) = 'manage' and public._lvl(public._g('S1'), :bobby) = 'manage'
  and public._lvl(public._g('S1'), :carol) = 'edit' and public._lvl(public._g('S1'), :dave) = 'view' and public._lvl(public._g('S1'), :erin) is null);
select public._check(11, 'eski sözleşme: _team_space_level edit | view | null (manage/approve edit’e çöker)',
  public._team_space_level(public._g('S1'), :alice) = 'edit' and public._team_space_level(public._g('S1'), :dave) = 'view'
  and public._team_space_level(public._g('S1'), :erin) is null);
set role authenticated;
select public._as_user(:carol);
select public._check(12, 'team_my_space_level: çağıran kendi seviyesini görür', public.team_my_space_level(public._g('S1')) = 'edit');
select public._as_user(:hank);
select public._check(13, 'team_my_space_level: üye view', public.team_my_space_level(public._g('S1')) = 'view');
reset role;

-- selected: G grubu edit, gina manage, frank approve, erin (konuk) view
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('S1'), 'selected', jsonb_build_array(
  jsonb_build_object('type', 'group', 'id', public._g('G'), 'level', 'edit'),
  jsonb_build_object('type', 'member', 'id', :gina::uuid, 'level', 'manage'),
  jsonb_build_object('type', 'member', 'id', :frank::uuid, 'level', 'approve'),
  jsonb_build_object('type', 'member', 'id', :erin::uuid, 'level', 'view')));
reset role;
select public._check(14, 'selected: grup edit, kişi manage/approve, konuk view; seçilmeyen erişimsiz',
  public._lvl(public._g('S1'), :dave) = 'edit' and public._lvl(public._g('S1'), :carol) = 'edit'
  and public._lvl(public._g('S1'), :gina) = 'manage' and public._lvl(public._g('S1'), :frank) = 'approve'
  and public._lvl(public._g('S1'), :erin) = 'view' and public._lvl(public._g('S1'), :hank) is null);
select public._check(15, 'sahip/yönetici girişte olmasalar da manage (kilitlenemezler) ve satırları var',
  public._lvl(public._g('S1'), :alice) = 'manage' and public._lvl(public._g('S1'), :bobby) = 'manage'
  and public._sm(public._g('S1'), :bobby) = 'editor' and public._sm(public._g('S1'), :alice) = 'owner');
select public._check(16, 'yansıma: approve/manage → editor, view → viewer, seçilmeyen → satır yok',
  public._sm(public._g('S1'), :gina) = 'editor' and public._sm(public._g('S1'), :frank) = 'editor' and public._sm(public._g('S1'), :erin) = 'viewer'
  and public._sm(public._g('S1'), :hank) is null);
select public._check(17, 'DEĞİŞMEZ: 4 seviyeli yansıma eşitliği', public._inv());
select public._check(18, 'audit: yükseltme (approve/manage) girişi space_level_changed yazdı', public._aud('space_level_changed') = 1);

-- konuk kuralı
set role authenticated;
select public._as_user(:alice);
select public._check(19, 'konuğa kişi olarak approve verilemez',
  public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S1'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :erin::uuid, 'level', 'approve'))::text)) like '%space_invalid%');
select public._check(20, 'konuğa kişi olarak manage verilemez',
  public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S1'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :erin::uuid, 'level', 'manage'))::text)) like '%space_invalid%');
reset role;
-- konuk, manage’li bir grubun üyesiyse en çok edit
insert into public.team_group_members (group_id, user_id) values (public._g('H'), :erin);
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('S2'), 'selected', jsonb_build_array(jsonb_build_object('type', 'group', 'id', public._g('H'), 'level', 'manage')));
reset role;
select public._check(21, 'konuk grup yoluyla manage alsa bile en çok edit', public._lvl(public._g('S2'), :erin) = 'edit' and public._lvl(public._g('S2'), :gina) = 'manage');
delete from public.team_group_members where group_id = public._g('H') and user_id = :erin;
select public._check(22, 'konuk gruptan çıkınca erişimi biter', public._lvl(public._g('S2'), :erin) is null and public._sm(public._g('S2'), :erin) is null);
select public._check(23, 'DEĞİŞMEZ (grup + konuk senaryosu)', public._inv());

-- yetki: manage değiştirebilir; approve/edit/view değiştiremez; projeyi açan kişi seviyesi ne olursa olsun değiştirebilir
set role authenticated;
select public._as_user(:frank);
select public._check(24, 'approve seviyesi erişimi değiştiremez', public._try(format($$select public.team_set_space_access(%L, 'all', '[]')$$, public._g('S1'))) like '%team_forbidden%');
select public._as_user(:dave);
select public._check(25, 'edit seviyesi (grup yoluyla) erişimi değiştiremez', public._try(format($$select public.team_set_space_access(%L, 'all', '[]')$$, public._g('S1'))) like '%team_forbidden%');
select public._as_user(:erin);
select public._check(26, 'view seviyesindeki konuk erişimi değiştiremez', public._try(format($$select public.team_set_space_access(%L, 'all', '[]')$$, public._g('S1'))) like '%team_forbidden%');
select public._as_user(:gina);
select public._check(50, 'projede manage olan üye erişimi değiştirebilir (ekip yeteneği olmasa da)',
  public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S1'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :gina::uuid, 'level', 'manage'), jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'approve'))::text)) = 'ok');
reset role;
select public._check(27, 'manage’in yazdığı yeni girişler uygulandı (dave approve; frank/carol erişimsiz, carol yine de açan kişi)',
  public._lvl(public._g('S1'), :dave) = 'approve' and public._lvl(public._g('S1'), :frank) is null and public._lvl(public._g('S1'), :carol) is null);
select public._check(28, 'DEĞİŞMEZ (manage’in yazdığı erişim)', public._inv());
set role authenticated;
select public._as_user(:carol);
select public._check(51, 'projeyi açan kişi artık erişimi olmasa da erişimi değiştirebilir (açan kişi hakkı)',
  public.team_my_space_level(public._g('S1')) is null and public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S1'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :gina::uuid, 'level', 'manage'), jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'approve'))::text)) = 'ok');
reset role;

-- ekip kütüphanesi: manage seviyesi / yükseltme bu kilidi AÇAMAZ
set role authenticated;
select public._as_user(:bobby);
select public._check(29, 'ekip kütüphanesi seçili moda alınamaz', public._try(format($$select public.team_set_space_access(%L, 'selected', '[]')$$, public._g('LIB'))) like '%team_library_locked%');
select public._check(30, 'ekip kütüphanesi yükseltme girişi alamaz',
  public._try(format($$select public.team_set_space_access(%L, 'all', %L::jsonb)$$, public._g('LIB'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'manage'))::text)) like '%team_library_locked%');
reset role;

-- all modu: yükseltme girişleri (D1)
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('S2'), 'all', jsonb_build_array(
  jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'manage'),
  jsonb_build_object('type', 'member', 'id', :carol::uuid, 'level', 'approve')));
reset role;
select public._check(31, 'all + yükseltme: dave (üye) manage, carol (düzenleyici) approve, hank (üye) taban view, konuk erişimsiz',
  public._lvl(public._g('S2'), :dave) = 'manage' and public._lvl(public._g('S2'), :carol) = 'approve'
  and public._lvl(public._g('S2'), :hank) = 'view' and public._lvl(public._g('S2'), :erin) is null);
select public._check(32, 'all + yükseltme yansıması: dave editor, hank viewer', public._sm(public._g('S2'), :dave) = 'editor' and public._sm(public._g('S2'), :hank) = 'viewer');
select public._check(33, 'DEĞİŞMEZ (all + yükseltme)', public._inv());
set role authenticated;
select public._as_user(:alice);
select public._check(34, 'all modunda edit/view girişi yazılamaz (yükseltme olmayan)',
  public._try(format($$select public.team_set_space_access(%L, 'all', %L::jsonb)$$, public._g('S2'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'edit'))::text)) like '%space_invalid%');
select public._check(35, 'admins modunda giriş yazılamaz',
  public._try(format($$select public.team_set_space_access(%L, 'admins', %L::jsonb)$$, public._g('S2'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'manage'))::text)) like '%space_invalid%');
select public._check(36, 'geçersiz seviye reddedilir',
  public._try(format($$select public.team_set_space_access(%L, 'selected', %L::jsonb)$$, public._g('S2'),
    jsonb_build_array(jsonb_build_object('type', 'member', 'id', :dave::uuid, 'level', 'owner'))::text)) like '%space_invalid%');
reset role;

-- grup üyeliği seviyeyi taşır
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('S2'), 'selected', jsonb_build_array(jsonb_build_object('type', 'group', 'id', public._g('G'), 'level', 'approve')));
reset role;
select public._check(37, 'grup girişi: üyeler approve', public._lvl(public._g('S2'), :dave) = 'approve' and public._lvl(public._g('S2'), :carol) = 'approve');
delete from public.team_group_members where group_id = public._g('G') and user_id = :dave;
select public._check(38, 'gruptan çıkan erişimini kaybeder ve yansıma satırı gider', public._lvl(public._g('S2'), :dave) is null and public._sm(public._g('S2'), :dave) is null);
insert into public.team_group_members (group_id, user_id) values (public._g('G'), :dave);
select public._check(39, 'gruba geri eklenen yeniden approve olur', public._lvl(public._g('S2'), :dave) = 'approve' and public._sm(public._g('S2'), :dave) = 'editor');
select public._check(40, 'DEĞİŞMEZ (grup üyeliği değişimleri)', public._inv());

-- rol değişimi: üye yönetici olur → manage; yönetici düşürülür → girişe bağlı
update public.team_members set role = 'admin' where team_id = public._g('T') and user_id = :hank;
select public._check(41, 'ekip yöneticisi yapılan, girişi olmasa da her projede manage', public._lvl(public._g('S2'), :hank) = 'manage' and public._sm(public._g('S2'), :hank) = 'editor');
update public.team_members set role = 'member' where team_id = public._g('T') and user_id = :hank;
select public._check(42, 'yöneticilikten düşen, girişi yoksa erişimini kaybeder', public._lvl(public._g('S2'), :hank) is null and public._sm(public._g('S2'), :hank) is null);
select public._check(43, 'DEĞİŞMEZ (rol değişimleri)', public._inv());

-- kanal girişleri edit/view kalır
set role authenticated;
select public._as_user(:alice);
select public._check(44, 'özel kanal girişinde approve/manage reddedilir',
  public._try(format($$select public.team_create_channel(%L, 'ozel-x', '', 'private', null, 'members', 'mentions', %L::jsonb)$$, public._g('T'),
    jsonb_build_array(jsonb_build_object('type', 'group', 'id', public._g('G'), 'level', 'manage'))::text)) like '%channel_invalid%');
reset role;
select public._check(45, 'CHECK: kanal satırı approve seviyesi taşıyamaz',
  public._try(format($$insert into public.team_access (team_id, channel_id, subject_type, subject_id, level) values (%L, gen_random_uuid(), 'member', %L, 'approve')$$, public._g('T'), :dave)) like '%team_access_level_scope%'
  or public._try(format($$insert into public.team_access (team_id, channel_id, subject_type, subject_id, level) values (%L, gen_random_uuid(), 'member', %L, 'approve')$$, public._g('T'), :dave)) like '%violates%');

-- erişim listesini okuma: manage okur, approve/edit okuyamaz
set role authenticated;
select public._as_user(:gina);
select public._check(54, 'projede manage olan erişim listesini okur (team_space_access)', public._try(format($$select public.team_space_access(%L)$$, public._g('S1'))) = 'ok');
select public._as_user(:dave);
select public._check(55, 'projede approve/edit olan erişim listesini okuyamaz', public._try(format($$select public.team_space_access(%L)$$, public._g('S1'))) like '%team_forbidden%');
reset role;

-- gizlilik / yetki yüzeyi
set role authenticated;
select public._as_user(:dave);
select public._check(46, 'istemci team_access’e doğrudan yazamaz', public._try(format($$insert into public.team_access (team_id, space_id, subject_type, subject_id, level) values (%L, %L, 'member', %L, 'manage')$$, public._g('T'), public._g('S1'), :dave)) like '%permission denied%'
  or public._try(format($$insert into public.team_access (team_id, space_id, subject_type, subject_id, level) values (%L, %L, 'member', %L, 'manage')$$, public._g('T'), public._g('S1'), :dave)) like '%row-level security%');
select public._check(47, 'iç yardımcılar istemciye kapalı', public._try(format($$select public._team_space_access_level(%L, %L)$$, public._g('S1'), :dave)) like '%permission denied%'
  and public._try(format($$select public._team_space_cap(%L, %L, 'manage')$$, public._g('S1'), :dave)) like '%permission denied%');
select public._as_user(:hank);
select public._check(48, 'projeyi göremeyen kişi için team_my_space_level null', public.team_my_space_level(public._g('S1')) is null);
select public._as_user(:gina);
select public._check(52, 'team_my_space_levels: yalnız okuyabildiğim projeler ve seviyem',
  (select level from public.team_my_space_levels(public._g('T')) where space_id = public._g('S1')) = 'manage'
  and not exists (select 1 from public.team_my_space_levels(public._g('T')) where space_id = public._g('S1') and level is null));
select public._as_user(:hank);
select public._check(53, 'team_my_space_levels: göremediğim proje listede yok', not exists (select 1 from public.team_my_space_levels(public._g('T')) where space_id = public._g('S1')));
reset role;
set role anon;
select public._as_user('');
select public._check(49, 'anon team_my_space_level çağıramaz', public._try(format($$select public.team_my_space_level(%L)$$, public._g('S1'))) like '%permission denied%');
reset role;


-- ============================================================================================================================================
-- WP2) Proje kütüphanesi
-- ============================================================================================================================================
create or replace function public._mkitem(p_space uuid, p_title text, p_creator uuid) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  insert into public.space_items (space_id, kind, title, body, is_draft, created_by) values (p_space, 'prompt', p_title, 'Metin {konu}', true, p_creator) returning id into v;
  return v;
end $$;
create or replace function public._st(p_item uuid) returns text language sql security definer as $$ select public._space_item_state(approved_at, deprecated_at, review_requested_at) from public.space_items where id = p_item $$;
create or replace function public._same_members(a uuid, b uuid) returns boolean language sql security definer as $$
  select not exists ((select user_id, role from public.space_members where space_id = a except select user_id, role from public.space_members where space_id = b)
                     union all (select user_id, role from public.space_members where space_id = b except select user_id, role from public.space_members where space_id = a)) $$;
grant execute on function public._mkitem(uuid, text, uuid), public._st(uuid), public._same_members(uuid, uuid) to public;

-- Proje P1: grup G düzenler, gina yönetir, frank onaylar, erin (konuk) görür.
set role authenticated;
select public._as_user(:alice);
select public.team_create_space(public._g('T'), 'Proje Alfa', '', 'brand') as v \gset p1_
insert into public._ctx values ('P1', :'p1_v');
select public.team_set_space_access(:'p1_v'::uuid, 'selected', jsonb_build_array(
  jsonb_build_object('type', 'group', 'id', public._g('G'), 'level', 'edit'),
  jsonb_build_object('type', 'member', 'id', :gina::uuid, 'level', 'manage'),
  jsonb_build_object('type', 'member', 'id', :frank::uuid, 'level', 'approve'),
  jsonb_build_object('type', 'member', 'id', :erin::uuid, 'level', 'view')));
reset role;
select public._check(60, 'WP2 kurulum: proje erişimi uygulandı', public._lvl(public._g('P1'), :gina) = 'manage' and public._lvl(public._g('P1'), :frank) = 'approve');

-- açma yetkisi
set role authenticated;
select public._as_user(:dave);
select public._check(61, 'edit seviyesi proje kütüphanesi açamaz', public._try(format($$select public.team_create_project_library(%L)$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(62, 'approve seviyesi proje kütüphanesi açamaz', public._try(format($$select public.team_create_project_library(%L)$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:ivy);
select public._check(63, 'ekip dışı kişi için proje görünmez (space_not_found)', public._try(format($$select public.team_create_project_library(%L)$$, public._g('P1'))) like '%space_not_found%');
select public._as_user(:gina);
select public.team_create_project_library(public._g('P1')) as v \gset l1_
reset role;
insert into public._ctx values ('L1', :'l1_v');
select public._check(64, 'manage seviyesi projenin kütüphanesini açar: tür, bağ, ekip, sahip, ad, gizlilik',
  (select kind = 'team_library' and project_space_id = public._g('P1') and team_id = public._g('T') and owner_id = :alice::uuid and visibility = 'private'
          and title = 'Proje Alfa · Kütüphane' and team_creator_id = :gina::uuid from public.spaces where id = public._g('L1')));
select public._check(65, 'audit: project_library_created yazıldı', public._aud('project_library_created') = 1);
set role authenticated;
select public._as_user(:gina);
select public._check(66, 'proje başına ikinci kütüphane açılamaz', public._try(format($$select public.team_create_project_library(%L)$$, public._g('P1'))) like '%project_library_exists%');
select public._as_user(:bobby);
select public._check(67, 'kütüphane çocuğunun kütüphanesi açılamaz', public._try(format($$select public.team_create_project_library(%L)$$, public._g('L1'))) like '%space_invalid%');
select public._check(68, 'ekip kütüphanesinin proje kütüphanesi açılamaz', public._try(format($$select public.team_create_project_library(%L)$$, public._g('LIB'))) like '%space_invalid%');
select public._check(69, 'kütüphane çocuğunun erişimi doğrudan değiştirilemez (proje yönetir)', public._try(format($$select public.team_set_space_access(%L, 'all', '[]')$$, public._g('L1'))) like '%space_project_managed%');
reset role;

-- erişim devri
select public._check(70, 'çocuk kütüphane projenin seviyesini taşır (herkes için aynı)',
  public._lvl(public._g('L1'), :alice) = 'manage' and public._lvl(public._g('L1'), :bobby) = 'manage' and public._lvl(public._g('L1'), :gina) = 'manage'
  and public._lvl(public._g('L1'), :frank) = 'approve' and public._lvl(public._g('L1'), :carol) = 'edit' and public._lvl(public._g('L1'), :dave) = 'edit'
  and public._lvl(public._g('L1'), :erin) = 'view' and public._lvl(public._g('L1'), :hank) is null);
select public._check(71, 'çocuk kütüphanenin üyeleri = projenin üyeleri (rol dahil)', public._same_members(public._g('P1'), public._g('L1')));
select public._check(72, 'çocuk kütüphanenin erişim modu projeyi gösterir', (select team_access_mode from public.spaces where id = public._g('L1')) = 'selected');
select public._check(73, 'DEĞİŞMEZ (kütüphane çocuğu dahil)', public._inv());
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('P1'), 'admins', '[]');
reset role;
select public._check(74, 'proje yalnız yönetime kapanınca kütüphane de kapanır (üyeler eşit, gina/frank/erin düşer)',
  public._same_members(public._g('P1'), public._g('L1')) and public._sm(public._g('L1'), :gina) is null and public._sm(public._g('L1'), :erin) is null
  and (select team_access_mode from public.spaces where id = public._g('L1')) = 'admins');
insert into public.team_group_members (group_id, user_id) values (public._g('H'), :hank);
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('P1'), 'selected', jsonb_build_array(
  jsonb_build_object('type', 'group', 'id', public._g('G'), 'level', 'edit'),
  jsonb_build_object('type', 'group', 'id', public._g('H'), 'level', 'view'),
  jsonb_build_object('type', 'member', 'id', :gina::uuid, 'level', 'manage'),
  jsonb_build_object('type', 'member', 'id', :frank::uuid, 'level', 'approve'),
  jsonb_build_object('type', 'member', 'id', :erin::uuid, 'level', 'view')));
reset role;
select public._check(75, 'proje yeniden seçilmişe dönünce kütüphane de döner; yeni grup (hank) kütüphanede de view', public._lvl(public._g('L1'), :hank) = 'view'
  and public._sm(public._g('L1'), :hank) = 'viewer' and public._same_members(public._g('P1'), public._g('L1')));
delete from public.team_group_members where group_id = public._g('H') and user_id = :hank;
select public._check(76, 'gruptan çıkan hank hem projeden hem kütüphaneden düşer', public._lvl(public._g('L1'), :hank) is null and public._sm(public._g('L1'), :hank) is null
  and public._same_members(public._g('P1'), public._g('L1')));
select public._check(77, 'DEĞİŞMEZ (proje + kütüphane erişim dizisi sonrası)', public._inv());

-- bağ doğrulaması ve istemci yazma yolları
select public._check(78, 'kütüphane bağı başka bir kütüphaneye çevrilemez (ekip kütüphanesi proje olamaz)',
  public._try(format($$update public.spaces set project_space_id = %L where id = %L$$, public._g('LIB'), public._g('L1'))) like '%space_invalid%');
select public._check(79, 'proje başına tek kütüphane: ikinci çocuk kaydı tekil dizine takılır',
  public._try(format($$insert into public.spaces (owner_id, title, kind, visibility, team_id, team_access_mode, project_space_id) values (%L, 'x', 'team_library', 'private', %L, 'all', %L)$$, :alice, public._g('T'), public._g('P1'))) like '%spaces_project_library_uniq%');
set role authenticated;
select public._as_user(:alice);
select public._check(80, 'sahip bile project_space_id / approvals_needed alanlarını doğrudan güncelleyemez',
  public._try(format($$update public.spaces set approvals_needed = 3 where id = %L$$, public._g('L1'))) like '%space_invalid%'
  and public._try(format($$update public.spaces set project_space_id = null where id = %L$$, public._g('L1'))) like '%space_invalid%');
reset role;

-- yönetişim: proje düzeyi onay
select public._mkitem(public._g('L1'), 'Alfa prompt 1', :dave) as v \gset i1_
insert into public._ctx values ('I1', :'i1_v');
set role authenticated;
select public._as_user(:dave);
select public._check(81, 'edit seviyesi onaya gönderir', public._try(format($$select public.space_request_review(%L)$$, public._g('I1'))) = 'ok' and public._st(public._g('I1')) = 'pending');
select public._as_user(:carol);
select public._check(82, 'edit seviyesi (grup yoluyla) onaylayamaz', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('I1'))) like '%space_forbidden%');
select public._as_user(:erin);
select public._check(83, 'view seviyesi (konuk) onaysız taslağı hiç görmez', public._cnt(format($$select count(*) from public.space_items where id = %L$$, public._g('I1'))) = 0
  and public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('I1'))) like '%space_not_found%');
select public._as_user(:hank);
select public._check(84, 'projeyi göremeyen kütüphaneyi de göremez', public._cnt(format($$select count(*) from public.space_items where space_id = %L$$, public._g('L1'))) = 0
  and public._cnt(format($$select count(*) from public.team_libraries(%L) where id = %L$$, public._g('T'), public._g('L1'))) = 0);
select public._as_user(:frank);
select public._check(85, 'space_can_approve: approve seviyesi true, ekip kütüphanesinde false', public.space_can_approve(public._g('L1')) and not public.space_can_approve(public._g('LIB')));
reset role;

-- onay sayısı geçersiz kılma
set role authenticated;
select public._as_user(:frank);
select public._check(86, 'approve seviyesi proje onay sayısını değiştiremez', public._try(format($$select public.space_set_project_approvals(%L, 2)$$, public._g('L1'))) like '%team_forbidden%');
select public._as_user(:gina);
select public.space_set_project_approvals(public._g('L1'), 2);
reset role;
select public._check(87, 'manage seviyesi onay sayısını 2 yapar', (select approvals_needed from public.spaces where id = public._g('L1')) = 2);
set role authenticated;
select public._as_user(:gina);
select public._check(88, 'geçersiz sayı / proje (kütüphane olmayan) reddedilir',
  public._try(format($$select public.space_set_project_approvals(%L, 5)$$, public._g('L1'))) like '%space_invalid%'
  and public._try(format($$select public.space_set_project_approvals(%L, 2)$$, public._g('P1'))) like '%space_invalid%');
select public._as_user(:frank);
select public.space_decide_item(public._g('I1'), 'approve') ->> 'state' as v \gset d1_
reset role;
select public._check(89, 'iki onay gerekirken ilk onay öğeyi pending bırakır (needed = 2)', :'d1_v' = 'pending' and public._st(public._g('I1')) = 'pending');
set role authenticated;
select public._as_user(:bobby);
select public.space_decide_item(public._g('I1'), 'approve') ->> 'state' as v \gset d2_
select public.space_item_review(public._g('I1')) ->> 'needed' as v \gset d3_
reset role;
select public._check(90, 'ikinci onay (ekip yöneticisi) öğeyi onaylar; inceleme sayfası needed = 2', :'d2_v' = 'approved' and public._st(public._g('I1')) = 'approved' and :'d3_v' = '2');
set role authenticated;
select public._as_user(:gina);
select public.space_set_project_approvals(public._g('L1'), null);
reset role;
select public._check(91, 'null sayıyı ekip değerine döndürür', (select approvals_needed from public.spaces where id = public._g('L1')) is null and public._team_approvals_needed(public._g('L1')) = 1);
select public._check(92, 'audit: project_approvals_changed yazıldı', public._aud('project_approvals_changed') >= 2);

-- proje onayı ekip kütüphanesine SIZMAZ
select public._mkitem(public._g('LIB'), 'Ekip prompt', :carol) as v \gset i2_
insert into public._ctx values ('I2', :'i2_v');
set role authenticated;
select public._as_user(:carol);
select public.space_request_review(public._g('I2'));
select public._as_user(:frank);
select public._check(93, 'projede approve olan, ekip kütüphanesinde onaylayamaz', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('I2'))) like '%space_forbidden%'
  or public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('I2'))) like '%space_not_found%');
reset role;

-- toplamalar
select public._mkitem(public._g('L1'), 'Alfa prompt 2', :carol) as v \gset i3_
insert into public._ctx values ('I3', :'i3_v');
set role authenticated;
select public._as_user(:carol);
select public.space_request_review(public._g('I3'));
select public._as_user(:gina);
select public._check(94, 'team_libraries: ekip kütüphanesi + proje kütüphanesi (proje adı, ana bayrağı, sayaçlar)',
  (select count(*) from public.team_libraries(public._g('T'))) = 2
  and (select is_main and project_id is null from public.team_libraries(public._g('T')) where id = public._g('LIB'))
  and (select not is_main and project_title = 'Proje Alfa' and approved_count = 1 and pending_count = 1 and can_approve from public.team_libraries(public._g('T')) where id = public._g('L1')));
select public._as_user(:hank);
select public._check(95, 'team_libraries: projeyi göremeyen yalnız ekip kütüphanesini görür', (select count(*) from public.team_libraries(public._g('T'))) = 1);
select public._as_user(:gina);
select public._check(96, 'team_library_items: p_space ile proje kütüphanesi, eski imza ekip kütüphanesi',
  (select count(*) from public.team_library_items(public._g('T'), 'all', null, 50, 0, public._g('L1'))) = 2
  and (select count(*) from public.team_library_items(public._g('T'), 'all', null, 50, 0)) = 0
  and (select max(approvals_needed) from public.team_library_items(public._g('T'), 'all', null, 50, 0, public._g('L1'))) = 1);
select public._check(97, 'team_library_items: başka ekibin/ekip dışı Space verilirse boş döner', (select count(*) from public.team_library_items(public._g('T'), 'all', null, 50, 0, public._g('P1'))) = 0);
select public._check(98, 'team_library_counts: yeni imza projeyi, eski imza ekip kütüphanesini sayar',
  (public.team_library_counts(public._g('T'), public._g('L1')) ->> 'total')::int = 2 and (public.team_library_counts(public._g('T'), public._g('L1')) ->> 'approved')::int = 1
  and (public.team_library_counts(public._g('T')) ->> 'total')::int = 0);
select public._as_user(:bobby);
select public._check(114, 'team_library_items/counts eski imza: yönetici ekip kütüphanesinin bekleyeni görür',
  (select count(*) from public.team_library_items(public._g('T'), 'all', null, 50, 0)) = 1 and (public.team_library_counts(public._g('T')) ->> 'pending')::int = 1);
select public._as_user(:gina);
select public._as_user(:frank);
select public._check(99, 'my_team_todos: projede approve olan bekleyeni görür; edit seviyesi görmez',
  exists (select 1 from public.my_team_todos() where team_id = public._g('T') and kind = 'approvals' and n = 1));
select public._as_user(:carol);
select public._check(100, 'my_team_todos: onay yetkisi olmayanda approvals satırı yok', not exists (select 1 from public.my_team_todos() where team_id = public._g('T') and kind = 'approvals'));
select public._as_user(:bobby);
select public._check(101, 'team_insights: bekleyen sayısı proje kütüphanelerini de kapsar', (public.team_insights(public._g('T'), 30) -> 'alerts' ->> 'pending')::int >= 2);
select public._as_user(:alice);
select public._check(102, 'team_export: projectLibraries + projeler listesinde kütüphane çocuğu yok',
  jsonb_array_length(public.team_export(public._g('T')) -> 'projectLibraries') = 1
  and (public.team_export(public._g('T')) -> 'projectLibraries' -> 0 ->> 'project') = 'Proje Alfa'
  and jsonb_array_length(public.team_export(public._g('T')) -> 'projectLibraries' -> 0 -> 'items') = 2
  and not exists (select 1 from jsonb_array_elements(public.team_export(public._g('T')) -> 'spaces') x where x ->> 'title' like '%· Kütüphane'));
select public._check(103, 'team_list_spaces / team_access_overview kütüphane çocuğunu ayrı proje saymaz',
  not exists (select 1 from public.team_list_spaces(public._g('T')) where id = public._g('L1'))
  and not exists (select 1 from public.team_access_overview(public._g('T')) where space_id = public._g('L1')));
reset role;
select public._check(104, 'teams.space_count kütüphane çocuğunu saymaz', (select space_count from public.teams where id = public._g('T')) = (select count(*) from public.spaces where team_id = public._g('T') and archived_at is null and project_space_id is null));

-- API / MCP: proje kütüphanesi kendiliğinden listelenir ve proje erişimine uyar
set role authenticated;
select public._as_user(:gina);
select public._check(105, 'api_me_libraries: proje kütüphanesi listelenir (ad projeyi taşır)', exists (select 1 from public.api_me_libraries() where id = public._g('L1') and title = 'Proje Alfa · Kütüphane'));
select public._check(106, 'api_me_library_prompts: onaylı prompt döner', exists (select 1 from public.api_me_library_prompts(public._g('L1')) where title = 'Alfa prompt 1'));
select public._as_user(:hank);
select public._check(107, 'api: projeyi göremeyen için kütüphane listelenmez ve prompt dönmez', not exists (select 1 from public.api_me_libraries() where id = public._g('L1'))
  and not exists (select 1 from public.api_me_library_prompts(public._g('L1'))));
select public._as_user(:erin);
select public._check(108, 'konuk (view) yalnız ONAYLI promptu görür (kütüphane okuma)', (select count(*) from public.space_items where space_id = public._g('L1') and kind = 'prompt') = 1);
reset role;

-- yaşam döngüsü
update public.spaces set archived_at = now() where id = public._g('P1');
select public._check(109, 'proje arşivlenince kütüphanesi de arşivlenir', (select archived_at is not null from public.spaces where id = public._g('L1')));
update public.spaces set archived_at = null where id = public._g('P1');
select public._check(110, 'proje arşivden dönünce kütüphanesi de döner', (select archived_at is null from public.spaces where id = public._g('L1')));
select public._check(111, 'DEĞİŞMEZ (yaşam döngüsü)', public._inv());

-- yetki yüzeyi
set role anon;
select public._as_user('');
select public._check(112, 'anon yeni RPC’leri çağıramaz',
  public._try(format($$select * from public.team_libraries(%L)$$, public._g('T'))) like '%permission denied%'
  and public._try(format($$select public.team_create_project_library(%L)$$, public._g('P1'))) like '%permission denied%'
  and public._try(format($$select public.space_set_project_approvals(%L, 2)$$, public._g('L1'))) like '%permission denied%'
  and public._try(format($$select public.team_library_counts(%L, null)$$, public._g('T'))) like '%permission denied%');
reset role;

-- proje silinince kütüphane de gider (kanalsız proje; kanallı silme WP3'te)
set role authenticated;
select public._as_user(:alice);
select public.team_create_space(public._g('T'), 'Geçici', '', 'free') as v \gset p9_
select public.team_create_project_library(:'p9_v'::uuid) as v \gset l9_
reset role;
select public._try(format($$delete from public.spaces where id = %L$$, :'p9_v')) as r \gset del9_
select public._check(113, 'proje silinince kütüphane çocuğu da silinir', :'del9_r' = 'ok' and not exists (select 1 from public.spaces where id = :'l9_v'::uuid));


-- ============================================================================================================================================
-- WP3) Space'e bağlı kanal
-- ============================================================================================================================================
create or replace function public._chan_of(sp uuid) returns uuid language sql security definer as $$ select id from public.team_channels where space_id = sp order by created_at limit 1 $$;
create or replace function public._chan_members_eq(sp uuid) returns boolean language sql security definer as $$
  select not exists ((select user_id from public.conversation_members where conversation_id = public._chan_of(sp)
                      except select user_id from public.space_members where space_id = sp)
                     union all
                     (select user_id from public.space_members where space_id = sp
                      except select user_id from public.conversation_members where conversation_id = public._chan_of(sp))) $$;
grant execute on function public._chan_of(uuid), public._chan_members_eq(uuid) to public;

set role authenticated;
select public._as_user(:alice);
select public.team_create_space(public._g('T'), 'Proje Beta', '', 'free', '{}', 'all', true) as v \gset p2_
select public.team_set_space_access(:'p2_v'::uuid, 'selected', jsonb_build_array(
  jsonb_build_object('type', 'group', 'id', public._g('H'), 'level', 'edit'),
  jsonb_build_object('type', 'member', 'id', :carol::uuid, 'level', 'view')));
select public.team_create_space(public._g('T'), 'Kanalsız', '') as v \gset p3_
reset role;
insert into public._ctx values ('P2', :'p2_v'), ('P3', :'p3_v');

select public._check(120, 'p_channel=true: proje açılırken kanalı da açıldı (space modu, ad projeden, yazma members, varsayılan değil)',
  (select mode = 'space' and space_id = public._g('P2') and name = 'proje-beta' and posting_policy = 'members' and not is_default and archived_at is null and created_by = :alice::uuid
     from public.team_channels where id = public._chan_of(public._g('P2'))));
select public._check(121, 'eski 6 argümanlı team_create_space kanal açmaz', public._chan_of(public._g('P3')) is null);
select public._check(122, 'audit: project_channel_created yazıldı', public._aud('project_channel_created') = 1);
select public._check(123, 'kanal üyeleri = projeyi okuyanlar (alice, bobby, frank, gina, carol)', public._chan_members_eq(public._g('P2'))
  and (select count(*) from public.conversation_members where conversation_id = public._chan_of(public._g('P2'))) = 5);

-- mesaj erişimi projeyi izler
insert into public.messages (conversation_id, sender_id, body) values (public._chan_of(public._g('P2')), :alice, 'proje beta mesajı');
set role authenticated;
select public._as_user(:frank);
select public._check(124, 'projedeki grup üyesi kanalı okur ve yazar', public._cnt(format($$select count(*) from public.messages where conversation_id = %L$$, public._chan_of(public._g('P2')))) = 1
  and public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'selam')$$, public._chan_of(public._g('P2')), :frank)) = 'ok');
select public._as_user(:hank);
select public._check(125, 'projeyi göremeyen: kanalı listede görmez, mesajı okuyamaz, yazamaz',
  public._cnt(format($$select count(*) from public.team_channels where id = %L$$, public._chan_of(public._g('P2')))) = 0
  and public._cnt(format($$select count(*) from public.team_list_channels(%L) where space_id = %L$$, public._g('T'), public._g('P2'))) = 0
  and public._cnt(format($$select count(*) from public.messages where conversation_id = %L$$, public._chan_of(public._g('P2')))) = 0
  and public._try(format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$$, public._chan_of(public._g('P2')), :hank)) like '%row-level security%');
select public._as_user(:carol);
select public._check(126, 'projede view olan kanalı okur (sohbete katılım içerik düzenlemesi değildir)', public._cnt(format($$select count(*) from public.messages where conversation_id = %L$$, public._chan_of(public._g('P2')))) >= 1);
select public._as_user(:erin);
select public._check(127, 'seçilmeyen konuk kanalı göremez', public._cnt(format($$select count(*) from public.messages where conversation_id = %L$$, public._chan_of(public._g('P2')))) = 0);
reset role;

-- erişim değişince kanal üyeleri değişir
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('P2'), 'admins', '[]');
reset role;
select public._check(128, 'proje yalnız yönetime kapanınca kanal üyeleri yalnız alice+bobby', public._chan_members_eq(public._g('P2'))
  and (select count(*) from public.conversation_members where conversation_id = public._chan_of(public._g('P2'))) = 2);
set role authenticated;
select public._as_user(:alice);
select public.team_set_space_access(public._g('P2'), 'all', '[]');
reset role;
select public._check(129, 'proje tüm ekibe açılınca kanal üyeleri projeyle eşit (konuk hariç)', public._chan_members_eq(public._g('P2')));

-- adlandırma
set role authenticated;
select public._as_user(:alice);
select public.team_create_space(public._g('T'), 'Proje Beta', '', 'free', '{}', 'all', true) as v \gset p4_
select public.team_create_space(public._g('T'), '***', '', 'free', '{}', 'all', true) as v \gset p5_
select public.team_create_space(public._g('T'), 'Çok uzun bir proje başlığı: ışık, şeker, ölçü, ünlü, güneş ve gökyüzü', '', 'free', '{}', 'all', true) as v \gset p6_
reset role;
select public._check(130, 'çakışan ad -2 alır; sembolden oluşan başlık "proje"; uzun başlık ≤ 40 ve geçerli ad',
  (select name from public.team_channels where id = public._chan_of(:'p4_v'::uuid)) = 'proje-beta-2'
  and (select name from public.team_channels where id = public._chan_of(:'p5_v'::uuid)) = 'proje'
  and (select char_length(name) <= 40 and name ~ '^[a-z0-9][a-z0-9-]{0,39}$' from public.team_channels where id = public._chan_of(:'p6_v'::uuid)));

-- var olan proje için kanal aç
set role authenticated;
select public._as_user(:dave);
select public._check(131, 'üye (projede yetkisiz) kanal açamaz', public._try(format($$select public.team_create_project_channel(%L)$$, public._g('P3'))) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(132, 'projede approve olan kanal açamaz', public._try(format($$select public.team_create_project_channel(%L)$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:gina);
select public.team_create_project_channel(public._g('P1')) as v \gset c1_
reset role;
insert into public._ctx values ('C1', :'c1_v');
select public._check(133, 'projede manage olan (kanal yönetimi yeteneği olmadan) kanalı açar; üyeler = proje üyeleri', (select mode = 'space' and space_id = public._g('P1') from public.team_channels where id = public._g('C1'))
  and public._chan_members_eq(public._g('P1')));
set role authenticated;
select public._as_user(:gina);
select public._check(134, 'ikinci kanal açılamaz (project_channel_exists)', public._try(format($$select public.team_create_project_channel(%L)$$, public._g('P1'))) like '%project_channel_exists%');
select public._as_user(:bobby);
select public._check(135, 'kütüphane çocuğu ve ekip kütüphanesi için kanal açılamaz',
  public._try(format($$select public.team_create_project_channel(%L)$$, public._g('L1'))) like '%space_invalid%'
  and public._try(format($$select public.team_create_project_channel(%L)$$, public._g('LIB'))) like '%space_invalid%');
select public._as_user(:ivy);
select public._check(136, 'ekip dışı kişi için proje görünmez', public._try(format($$select public.team_create_project_channel(%L)$$, public._g('P3'))) like '%space_not_found%');
reset role;
select set_config('promptly.team_sync', '1', false);
update public.spaces set team_creator_id = :carol where id = public._g('P3');
select set_config('promptly.team_sync', '', false);
set role authenticated;
select public._as_user(:carol);
select public._check(137, 'projeyi açan kişi kanalı açar', public._try(format($$select public.team_create_project_channel(%L)$$, public._g('P3'))) = 'ok');
reset role;

-- arşiv / silme
update public.spaces set archived_at = now() where id = public._g('P2');
select public._check(138, 'proje arşivlenince kanalı arşivlenir', (select archived_at is not null from public.team_channels where id = public._chan_of(public._g('P2'))));
update public.spaces set archived_at = null where id = public._g('P2');
select public._check(139, 'proje arşivden dönünce kanalı açılır', (select archived_at is null from public.team_channels where id = public._chan_of(public._g('P2'))));
select public._check(140, 'DEĞİŞMEZ (kanal + proje + kütüphane)', public._inv());
select public._try(format($$delete from public.spaces where id = %L$$, public._g('P2'))) as r \gset del2_
select public._check(141, 'R1: kanalı olan Space silinince kanal ve konuşma da gider',
  :'del2_r' = 'ok' and not exists (select 1 from public.team_channels where space_id = public._g('P2')) and not exists (select 1 from public.spaces where id = public._g('P2')));
select public._check(142, 'silinen projenin mesajları da gitti', (select count(*) from public.messages m where not exists (select 1 from public.conversations c where c.id = m.conversation_id)) = 0);

-- sınır: space kanalları elle kanal sınırına sayılmaz
insert into public.team_channels (id, team_id, name, mode, created_by)
select c.id, public._g('T'), 'dolgu-' || n, 'open', :alice::uuid from (select gen_random_uuid() as id, g as n from generate_series(1, 60) g) c
  where false;
select public._as_user('');
do $$
declare v_id uuid; n integer;
begin
  select count(*) into n from public.team_channels where team_id = public._g('T') and archived_at is null and mode <> 'space';
  for i in 1 .. (50 - n) loop
    perform public._team_make_channel(public._g('T'), 'dolgu-' || i, '', 'open', null, 'members', 'mentions', false, 100 + i, null);
  end loop;
end $$;
set role authenticated;
select public._as_user(:alice);
select public._check(143, 'açık/özel kanal sınırı (50) dolunca yeni açık kanal reddedilir', public._try(format($$select public.team_create_channel(%L, 'bir-fazla', '', 'open')$$, public._g('T'))) like '%team_channel_limit%');
select public._check(144, 'sınır dolu olsa da space kanalı açılır (sayılmaz)', public._try(format($$select public.team_create_space(%L, 'Sınır Sonrası', '', 'free', '{}', 'all', true)$$, public._g('T'))) = 'ok');
reset role;

-- yetki yüzeyi
set role anon;
select public._as_user('');
select public._check(145, 'anon yeni kanal RPC’lerini çağıramaz',
  public._try(format($$select public.team_create_space(%L, 'x', '', 'free', '{}', 'all', true)$$, public._g('T'))) like '%permission denied%'
  and public._try(format($$select public.team_create_project_channel(%L)$$, public._g('P3'))) like '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(146, 'iç yardımcı _team_project_channel istemciye kapalı', public._try(format($$select public._team_project_channel(%L, %L, 'x', null)$$, public._g('T'), public._g('P3'))) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
