-- Ekip projeleri v2 (docs/history/362-*): proje → dosya → alan, proje rolü (Lider/Düzenleyici/Görüntüleyici), eşitleme, sohbet, değişkenler.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-projects-v2.sql ("FAILED=0" beklenir).
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
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text) to public;

-- DEĞİŞMEZ: her proje alanında (a) tek sahip satırı, (b) her `space_members` satırı bir ekip üyesi, (c) her ekip üyesinin satırı proje rolüyle BİREBİR
-- (view → viewer; edit/lead → editor; rol yok → satır yok), (d) proje kanalı üyeleri = projeyi görebilenler.
create or replace function public._inv() returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.spaces s
     where s.team_project_id is not null and (
       (select count(*) from public.space_members x where x.space_id = s.id and x.role = 'owner') <> 1
       or exists (select 1 from public.space_members x where x.space_id = s.id and not exists (select 1 from public.team_members tm where tm.team_id = s.team_id and tm.user_id = x.user_id))
       or exists (
         select 1 from public.team_members tm
          where tm.team_id = s.team_id and tm.user_id <> s.owner_id and (
            (case public._team_project_role(s.team_project_id, tm.user_id) when 'view' then 'viewer' when 'edit' then 'editor' when 'lead' then 'editor' end)
            is distinct from (select x.role from public.space_members x where x.space_id = s.id and x.user_id = tm.user_id)))
     )
  ) and not exists (
    select 1 from public.team_channels c
     where c.mode = 'project' and (
       exists (select 1 from public.team_members tm where tm.team_id = c.team_id
                and (public._team_project_role(c.project_id, tm.user_id) is not null) is distinct from exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = tm.user_id))
       or exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and not exists (select 1 from public.team_members tm where tm.team_id = c.team_id and tm.user_id = cm.user_id))))
$$;
grant execute on function public._inv() to public;
create or replace function public._role(p uuid, u uuid) returns text language sql security definer as $$ select public._team_project_role(p, u) $$;
create or replace function public._sm(sp uuid, u uuid) returns text language sql security definer as $$ select role from public.space_members where space_id = sp and user_id = u $$;
create or replace function public._aud(act text) returns integer language sql security definer as $$ select count(*)::integer from public.team_audit where team_id = public._g('T') and action = act $$;
grant execute on function public._role(uuid, uuid), public._sm(uuid, uuid), public._aud(text) to public;

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

-- ============================================================================================================================================
-- 1) Proje oluşturma + rol çözümü
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:hank);
select public._check(1, 'yetkisiz üye (create_spaces yok) proje açamaz', public._try(format($$select public.team_create_project(%L, 'Yasak')$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa Projesi', 'mimari', 'selected', 'view',
  jsonb_build_array(jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','group','id',public._g('H'),'role','view'))) as v \gset p1_
reset role;
insert into public._ctx values ('P1', :'p1_v');
insert into public._ctx select 'P1C', id::text from public.team_channels where project_id = public._g('P1');
-- (docs/history/368-*) Yeni proje BOŞ doğar: otomatik "Ortak" alan yok. Eski (canlıda kalan) proje ana alanı bir fixture olarak elle kurulur.
select public._check(200, 'yeni proje boş doğar: proje geneli alan yok, kanal var', not exists (select 1 from public.spaces where team_project_id = public._g('P1')) and public._g('P1C') is not null);
select public._team_area_make(public._g('P1'), null, 'Villa Projesi', true, :carol);
insert into public._ctx select 'P1A', id::text from public.spaces where team_project_id = public._g('P1') and team_file_id is null and team_area_main;

select public._check(2, 'eski proje ana alanı (fixture) + proje kanalı', public._g('P1A') is not null and public._g('P1C') is not null
  and (select mode from public.team_channels where id = public._g('P1C')) = 'project'
  and (select kind from public.spaces where id = public._g('P1A')) = 'team_area' and (select visibility from public.spaces where id = public._g('P1A')) = 'private');
select public._check(3, 'rol: sahip/yönetici örtük lider; oluşturan otomatik lider; düzenleyici/görüntüleyici girişten',
  public._role(public._g('P1'), :alice) = 'lead' and public._role(public._g('P1'), :bobby) = 'lead' and public._role(public._g('P1'), :carol) = 'lead'
  and public._role(public._g('P1'), :dave) = 'edit' and public._role(public._g('P1'), :frank) = 'view' and public._role(public._g('P1'), :gina) = 'view');
select public._check(4, 'rol: girişi olmayan üye ve konuk erişimsiz', public._role(public._g('P1'), :hank) is null and public._role(public._g('P1'), :erin) is null);
select public._check(5, 'DEĞİŞMEZ: space_members + kanal üyeliği proje rolünü yansıtır', public._inv());
select public._check(6, 'yansıma: dave editor, frank viewer, hank satırsız', public._sm(public._g('P1A'), :dave) = 'editor' and public._sm(public._g('P1A'), :frank) = 'viewer'
  and public._sm(public._g('P1A'), :hank) is null);

set role authenticated;
select public._as_user(:dave);
select public._check(7, 'dave (edit): alanı okur ve düzenler', public.can_read_space(public._g('P1A')) and public.can_edit_space(public._g('P1A')));
select public._as_user(:frank);
select public._check(8, 'frank (view): okur, düzenleyemez', public.can_read_space(public._g('P1A')) and not public.can_edit_space(public._g('P1A')));
select public._as_user(:hank);
select public._check(9, 'hank: alanı okuyamaz, projeyi göremez', not public.can_read_space(public._g('P1A'))
  and public._try(format($$select public.team_project_get(%L)$$, public._g('P1'))) like '%project_not_found%'
  and jsonb_array_length(public.team_projects_list(public._g('T'))) = 0);
select public._as_user(:erin);
select public._check(10, 'konuk (girişsiz): projeyi görmez', not public.can_read_space(public._g('P1A')) and jsonb_array_length(public.team_projects_list(public._g('T'))) = 0);
select public._as_user(:dave);
select public._check(11, 'okuma: dave listede projeyi görür (rol edit, 1 dosya yok)', (select (e ->> 'my_role') from jsonb_array_elements(public.team_projects_list(public._g('T'))) e limit 1) = 'edit');
reset role;

-- ============================================================================================================================================
-- 2) Kişisel Space kapsamı: alanlar listede yok, silinemez, herkese açık olamaz
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(12, 'kişisel list_spaces ekip alanını İÇERMEZ (sahip dahil)', (select count(*) from public.list_spaces('all')) = 0);
select public._as_user(:dave);
select public._check(13, 'kişisel list_spaces üyede de alan göstermez', (select count(*) from public.list_spaces('all')) = 0 and (select count(*) from public.list_spaces('shared')) = 0);
select public._as_user(:alice);
select public._check(14, 'alan doğrudan silinemez (sahip dahil)', public._try(format($$delete from public.spaces where id = %L$$, public._g('P1A'))) like '%team_area_managed%');
select public._check(15, 'alan herkese açık/bağlantılı yapılamaz', public._try(format($$update public.spaces set visibility = 'public' where id = %L$$, public._g('P1A'))) <> 'ok'
  and (select visibility from public.spaces where id = public._g('P1A')) = 'private');
reset role;

-- ============================================================================================================================================
-- 3) Dosya + ek pano
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(16, 'düzenleyici dosya açamaz', public._try(format($$select public.team_create_file(%L, 'Mutfak')$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:frank);
select public._check(17, 'görüntüleyici dosya açamaz', public._try(format($$select public.team_create_file(%L, 'Mutfak')$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:carol);
select public.team_create_file(public._g('P1'), 'Mutfak') as v \gset f1_
select public.team_create_file(public._g('P1'), 'Banyo', false) as v \gset f2_
reset role;
insert into public._ctx values ('F1', :'f1_v'), ('F2', :'f2_v');
insert into public._ctx select 'F1A', id::text from public.spaces where team_file_id = public._g('F1') and team_area_main;
select public._check(18, 'dosya: ana alan açıldı; onay varsayılanı projeden (Mutfak açık, Banyo kapalı)',
  public._g('F1A') is not null and (select review_required from public.team_files where id = public._g('F1')) and not (select review_required from public.team_files where id = public._g('F2')));
select public._check(19, 'DEĞİŞMEZ: dosya alanı da proje rolünü yansıtır', public._inv() and public._sm(public._g('F1A'), :dave) = 'editor' and public._sm(public._g('F1A'), :hank) is null);

set role authenticated;
select public._as_user(:dave);
select public.team_create_board(public._g('P1'), 'Mutfak çizimi', public._g('F1')) as v \gset b1_
select public._check(20, 'düzenleyici ek pano açar (dosya içi)', :'b1_v' is not null);
select public._as_user(:frank);
select public._check(21, 'görüntüleyici pano açamaz', public._try(format($$select public.team_create_board(%L, 'x')$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:dave);
select public._check(22, 'düzenleyici panoyu silemez, yeniden adlandırabilir',
  public._try(format($$select public.team_delete_board(%L)$$, :'b1_v')) like '%team_forbidden%' and public._try(format($$select public.team_rename_board(%L, 'Mutfak planı')$$, :'b1_v')) = 'ok');
select public._as_user(:carol);
select public._check(23, 'lider ana alanı silemez; ek panoyu siler',
  public._try(format($$select public.team_delete_board(%L)$$, public._g('F1A'))) like '%project_invalid%' and public._try(format($$select public.team_delete_board(%L)$$, :'b1_v')) = 'ok');
reset role;
select public._check(24, 'DEĞİŞMEZ: pano silindikten sonra', public._inv() and not exists (select 1 from public.spaces where id = :'b1_v'::uuid));

-- ============================================================================================================================================
-- 4) Değişkenler
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public.team_set_variable(public._g('P1'), 'musteri', 'Ahmet Bey', public._g('F1')) as v \gset v1_
select public.team_set_variable(public._g('P1'), 'tezgah', 'mermer', public._g('F1')) as v \gset v2_
select public._check(25, 'düzenleyici proje + dosya değişkeni yazar', :'v1_v' is not null and :'v2_v' is not null);
select public._check(26, 'aynı ad (büyük/küçük harf farkı) günceller, ikinci satır açmaz',
  public.team_set_variable(public._g('P1'), 'MUSTERI', 'Ayşe Hanım', public._g('F1')) = :'v1_v'::uuid and (select count(*) from jsonb_array_elements(public.team_variables_list(public._g('P1'))) e where lower(e ->> 'name') = 'musteri') = 1);
select public._check(201, 'proje geneli değişken yazılamaz (dosya kapsamı şart)', public._try(format($$select public.team_set_variable(%L, 'x', 'y')$$, public._g('P1'))) like '%project_invalid%');
select public._check(27, 'geçersiz ad reddedilir', public._try(format($$select public.team_set_variable(%L, '1abc', 'x')$$, public._g('P1'))) like '%project_invalid%'
  and public._try(format($$select public.team_set_variable(%L, 'a b', 'x')$$, public._g('P1'))) like '%project_invalid%');
select public._as_user(:frank);
select public._check(28, 'görüntüleyici okur ama yazamaz/silemez', jsonb_array_length(public.team_variables_list(public._g('P1'))) = 2
  and public._try(format($$select public.team_set_variable(%L, 'x', 'y')$$, public._g('P1'))) like '%team_forbidden%'
  and public._try(format($$select public.team_delete_variable(%L)$$, :'v1_v')) like '%team_forbidden%');
select public._as_user(:hank);
select public._check(29, 'projeyi görmeyen değişkenleri okuyamaz', public._try(format($$select public.team_variables_list(%L)$$, public._g('P1'))) like '%project_not_found%');
select public._as_user(:dave);
select public._try(format($$select public.team_delete_variable(%L)$$, :'v2_v')) as r \gset dv_
select public._check(30, 'düzenleyici değişkeni siler', :'dv_r' = 'ok' and jsonb_array_length(public.team_variables_list(public._g('P1'))) = 1, :'dv_r' || ' n=' || jsonb_array_length(public.team_variables_list(public._g('P1'))));
select public._check(31, 'dosya değişkeni başka projenin dosyasına yazılamaz', public._try(format($$select public.team_set_variable(%L, 'x', 'y', %L)$$, public._g('P1'), gen_random_uuid())) like '%project_not_found%');
reset role;
select public._check(32, 'denetim: variable_changed kaydı', public._aud('variable_changed') >= 3);

-- ============================================================================================================================================
-- 5) Erişim değiştirme + bildirim + sınırlar
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(33, 'düzenleyici erişimi değiştiremez', public._try(format($$select public.team_set_project_access(%L, 'all', 'view', '[]')$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:carol);
select public._check(34, 'konuğa lider verilemez', public._try(format($$select public.team_set_project_access(%L, 'selected', 'view', %L::jsonb)$$, public._g('P1'),
  jsonb_build_array(jsonb_build_object('type','member','id',:erin,'role','lead'))::text)) like '%project_invalid%');
select public._check(35, 'ekip dışı kişi/grup girişi reddedilir', public._try(format($$select public.team_set_project_access(%L, 'selected', 'view', %L::jsonb)$$, public._g('P1'),
  jsonb_build_array(jsonb_build_object('type','member','id',gen_random_uuid(),'role','view'))::text)) like '%project_invalid%');
select public._check(351, 'kendini kilitleme reddedilir (lider girişi olmadan)', public._try(format($$select public.team_set_project_access(%L, 'all', 'view', %L::jsonb)$$, public._g('P1'),
  jsonb_build_array(jsonb_build_object('type','member','id',:dave,'role','edit'))::text)) like '%project_lockout%' and public._role(public._g('P1'), :carol) = 'lead');
select public.team_set_project_access(public._g('P1'), 'all', 'view', jsonb_build_array(jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:carol,'role','lead'))) ;
reset role;
select public._check(36, 'all modu: hank view; konuk hâlâ erişimsiz; dave girişi yükseltir', public._role(public._g('P1'), :hank) = 'view' and public._role(public._g('P1'), :erin) is null
  and public._role(public._g('P1'), :dave) = 'edit' and public._sm(public._g('P1A'), :hank) = 'viewer' and public._inv());
select public._check(37, 'bildirim: yeni erişen hank’a "projeye ekledi" yazıldı', exists (select 1 from public.notifications where recipient_id = :hank::uuid and dedupe_key like 'projadd:' || public._g('P1') || ':%'));
set role authenticated;
select public._as_user(:carol);
select public.team_set_project_access(public._g('P1'), 'selected', 'view', jsonb_build_array(
  jsonb_build_object('type','member','id',:carol,'role','lead'), jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:erin,'role','edit'), jsonb_build_object('type','group','id',public._g('H'),'role','view')));
reset role;
select public._check(38, 'selected: hank erişimini kaybetti, konuk en çok edit, kanaldan da çıktı', public._role(public._g('P1'), :hank) is null and public._role(public._g('P1'), :erin) = 'edit'
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('P1C') and user_id = :hank::uuid) and public._inv());
select public._check(39, 'denetim: project_access_changed + project_created + file_created', public._aud('project_access_changed') >= 2 and public._aud('project_created') = 1 and public._aud('file_created') = 2);

-- ============================================================================================================================================
-- 6) Üyelik / grup temizliği
-- ============================================================================================================================================
delete from public.team_members where team_id = public._g('T') and user_id = :frank::uuid;
select public._check(40, 'ekipten çıkan üyenin kişi girişi gider, değişmez korunur', not exists (select 1 from public.team_project_access where subject_id = :frank::uuid) and public._inv()
  and public._role(public._g('P1'), :gina) = 'view');
delete from public.team_groups where id = public._g('H');
select public._check(41, 'grup silinince grup girişi gider; gina erişimini kaybeder', not exists (select 1 from public.team_project_access where subject_type = 'group') and public._role(public._g('P1'), :gina) is null
  and public._sm(public._g('P1A'), :gina) is null and public._inv());

-- ============================================================================================================================================
-- 7) Proje kanalı: korumalar, üyelik
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(42, 'proje kanalı elle silinemez/arşivlenemez', public._try(format($$select public.team_delete_channel(%L)$$, public._g('P1C'))) like '%channel_project_managed%'
  and public._try(format($$select public.team_archive_channel(%L, true)$$, public._g('P1C'))) like '%channel_project_managed%');
select public._as_user(:dave);
select public._check(43, 'dave kanal üyesi ve yazabilir', public.is_conversation_member(public._g('P1C')) and public.can_send_message(public._g('P1C')));
select public._as_user(:hank);
select public._check(44, 'hank kanal üyesi değil', not public.is_conversation_member(public._g('P1C')) and not public.can_send_message(public._g('P1C')));
select public._as_user(:dave);
select public._check(45, 'team_project_channels: yalnız görülen projenin kanalı', (select count(*) from public.team_project_channels(public._g('T'))) = 1);
select public._as_user(:hank);
select public._check(46, 'team_project_channels: hank için boş', (select count(*) from public.team_project_channels(public._g('T'))) = 0);
reset role;

-- ============================================================================================================================================
-- 8) Okuma ayrıntısı + yeniden adlandırma + arşiv
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public.team_project_get(public._g('P1')) as v \gset get_
select public._check(47, 'team_project_get: rol, dosyalar, kişiler, değişken, kanal',
  (:'get_v'::jsonb ->> 'my_role') = 'edit' and jsonb_array_length(:'get_v'::jsonb -> 'files') = 2 and jsonb_array_length(:'get_v'::jsonb -> 'variables') = 1
  and (:'get_v'::jsonb ->> 'channel_id') = public._g('P1C')::text and jsonb_array_length(:'get_v'::jsonb -> 'people') >= 4);
select public._check(48, 'people: ekip sahibi/yöneticisi örtük lider olarak görünür',
  (select count(*) from jsonb_array_elements(:'get_v'::jsonb -> 'people') e where (e ->> 'implicit')::boolean) = 2);
select public._check(49, 'düzenleyici projeyi yeniden adlandıramaz', public._try(format($$select public.team_update_project(%L, '{"title":"X"}')$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:carol);
select public.team_update_project(public._g('P1'), '{"title":"Villa 2","review_default":false}');
reset role;
select public._check(50, 'yeniden adlandırma ana alan başlığına yansır', (select title from public.spaces where id = public._g('P1A')) = 'Villa 2' and not (select review_default from public.team_projects where id = public._g('P1')));
select public._check(51, 'teams.space_count projeleri sayar, alanları değil', (select space_count from public.teams where id = public._g('T')) = 1 + (select count(*) from public.spaces where team_id = public._g('T') and team_project_id is null and archived_at is null), (select space_count::text from public.teams where id = public._g('T')));

set role authenticated;
select public._as_user(:dave);
select public._check(52, 'düzenleyici arşivleyemez', public._try(format($$select public.team_archive_project(%L, true)$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:alice);
select public.team_archive_project(public._g('P1'), true);
reset role;
select public._check(53, 'arşiv: alanlar + kanal arşivlenir, düzenleme kapanır, sayaç düşer', (select count(*) from public.spaces where team_project_id = public._g('P1') and archived_at is null) = 0
  and (select archived_at from public.team_channels where id = public._g('P1C')) is not null and (select space_count from public.teams where id = public._g('T')) = (select count(*) from public.spaces where team_id = public._g('T') and team_project_id is null and archived_at is null));
set role authenticated;
select public._as_user(:dave);
select public._check(54, 'arşivli projede düzenleyici düzenleyemez', not public.can_edit_space(public._g('P1A')) and public._try(format($$select public.team_create_board(%L, 'x', %L)$$, public._g('P1'), public._g('F1'))) like '%project_archived%');
select public._as_user(:alice);
select public.team_archive_project(public._g('P1'), false);
reset role;
select public._check(55, 'arşivden dönünce açılır', (select count(*) from public.spaces where team_project_id = public._g('P1') and archived_at is not null) = 0 and (select archived_at from public.team_channels where id = public._g('P1C')) is null);

-- ============================================================================================================================================
-- 9) Silme
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(56, 'düzenleyici projeyi silemez', public._try(format($$select public.team_delete_project(%L, 'Villa 2')$$, public._g('P1'))) like '%team_forbidden%');
select public._as_user(:carol);
select public._check(57, 'yanlış onay metni reddedilir', public._try(format($$select public.team_delete_project(%L, 'yanlis')$$, public._g('P1'))) like '%team_confirm_mismatch%');
select public.team_delete_project(public._g('P1'), 'villa 2');
reset role;
select public._check(58, 'proje silindi: dosyalar, alanlar, değişkenler, kanal + konuşma gider; oluşturan (ekip düzenleyicisi) silebildi',
  not exists (select 1 from public.team_projects where id = public._g('P1')) and not exists (select 1 from public.team_files where project_id = public._g('P1'))
  and not exists (select 1 from public.spaces where team_project_id = public._g('P1')) and not exists (select 1 from public.team_variables where project_id = public._g('P1'))
  and not exists (select 1 from public.team_channels where id = public._g('P1C')) and not exists (select 1 from public.conversations where id = public._g('P1C')));
select public._check(59, 'denetim: project_deleted', public._aud('project_deleted') = 1);

-- ============================================================================================================================================
-- 10) Ekip silinince projeler gider; anon/istemci kapıları
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:alice);
select public.team_create_project(public._g('T'), 'Son proje', '', 'all', 'view') as v \gset p9_
reset role;
select public._try(format($$delete from public.teams where id = %L$$, public._g('T'))) as r \gset dt_
select public._check(60, 'ekip silinirken (alanlarla birlikte) hata vermez ve projeler gider', :'dt_r' = 'ok' and :'p9_v' <> ''
  and not exists (select 1 from public.team_projects where id = nullif(:'p9_v', '')::uuid) and not exists (select 1 from public.spaces where team_project_id = nullif(:'p9_v', '')::uuid), :'dt_r' || ' p9=' || :'p9_v');

set role anon;
select public._as_user('');
select public._check(61, 'anon proje RPC’lerini çağıramaz', public._try($$select public.team_projects_list(gen_random_uuid())$$) like '%permission denied%'
  and public._try($$select public.team_create_project(gen_random_uuid(), 'x')$$) like '%permission denied%'
  and public._try($$select public.team_project_get(gen_random_uuid())$$) like '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(62, 'istemci iç yardımcılara ve tablolara erişemez',
  public._try($$select public._team_project_role(gen_random_uuid(), gen_random_uuid())$$) like '%permission denied%'
  and public._try($$select public._team_area_make(gen_random_uuid(), null, 'x', true, null)$$) like '%permission denied%'
  and public._try($$select * from public.team_projects$$) like '%permission denied%'
  and public._try($$insert into public.team_project_access (team_id, project_id, subject_type, subject_id, role) values (gen_random_uuid(), gen_random_uuid(), 'member', gen_random_uuid(), 'lead')$$) like '%permission denied%'
  and public._try($$select * from public.team_variables$$) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
