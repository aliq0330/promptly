-- Ekip sohbeti (docs/history/369-*): proje/dosya/ek kanallar + hiyerarşik sessize alma (ekip → proje → kanal) + bildirim üretimi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-chat-hierarchy.sql ("FAILED=0" beklenir).
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
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._msg(p_conv uuid, p_sender uuid, p_body text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin insert into public.messages (conversation_id, sender_id, body) values (p_conv, p_sender, p_body) returning id into v; return v; end $$;
-- Bildirim sayısı (alıcı + dedupe öneki); süper kullanıcı gözüyle.
create or replace function public._notes(p_user uuid, p_prefix text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where recipient_id = p_user and dedupe_key like p_prefix || '%' $$;
create or replace function public._read(p_conv uuid, p_user uuid) returns void language sql security definer as $$
  update public.conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = p_user $$;
create or replace function public._chan(p_name text) returns uuid language sql security definer as $$
  select id from public.team_channels where team_id = public._g('T') and project_id is null and name = p_name $$;
create or replace function public._unread(p_conv uuid, p_user uuid) returns integer language plpgsql security definer as $$
declare r integer;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select unread_count into r from public.group_unread_counts(array[p_conv]);
  return coalesce(r, -1);
end $$;
create or replace function public._members(p_conv uuid) returns text language sql security definer as $$
  select coalesce(string_agg(p.username, ',' order by p.username), '') from public.conversation_members m join public.profiles p on p.id = m.user_id where m.conversation_id = p_conv $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text), public._msg(uuid, uuid, text),
  public._notes(uuid, text), public._read(uuid, uuid), public._chan(text), public._unread(uuid, uuid), public._members(uuid) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol/dave/frank üye, erin konuk). Proje P: carol lider, dave düzenleyici, frank görüntüleyici.
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', 'açıklama', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'member'), (public._g('T'), :dave, 'member'), (public._g('T'), :frank, 'member');
insert into public.team_members (team_id, user_id, role, guest_until, guest_org) values (public._g('T'), :erin, 'guest', now() + interval '30 days', 'Kuzey Kafe');
set role authenticated;
select public._as_user(:alice);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view',
  jsonb_build_array(jsonb_build_object('type','member','id',:carol,'role','lead'), jsonb_build_object('type','member','id',:dave,'role','edit'), jsonb_build_object('type','member','id',:frank,'role','view')),
  'primary') as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Ana sayfa taslağı') as v \gset f1_
select public.team_create_file(:'p_v'::uuid, 'Metinler') as v \gset f2_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F1', :'f1_v'), ('F2', :'f2_v');
insert into public._ctx select 'MAIN', id::text from public.team_channels where project_id = public._g('P') and project_main;
insert into public._ctx select 'GENEL', public._chan('genel')::text;
insert into public._ctx select 'DUYURU', public._chan('duyurular')::text;

-- 1) Kanal kapsamı ----------------------------------------------------------------------------------------------------------------------------
select public._check(1, 'proje açılınca TEK ana kanal doğar (project_main); dosya açmak kanal AÇMAZ',
  (select count(*) from public.team_channels where project_id = public._g('P')) = 1
  and (select project_main and mode = 'project' and file_id is null from public.team_channels where id = public._g('MAIN')));

set role authenticated;
select public._as_user(:dave);
select public._check(2, 'düzenleyici proje kanalı ekleyemez (yalnız lider)', public._try(format($$select public.team_add_project_channel(%L, 'duyurular')$$, public._g('P'))) like '%team_forbidden%');
select public._as_user(:erin);
select public._check(3, 'konuk / proje dışı kişi proje kanalı ekleyemez', public._try(format($$select public.team_add_project_channel(%L, 'x')$$, public._g('P'))) like '%project_not_found%');
select public._as_user(:carol);
select public.team_add_project_channel(public._g('P'), 'Duyurular', 'Proje duyuruları', null, 'admins', 'all') as v \gset d_
select public.team_add_project_channel(public._g('P'), null, '', public._g('F1')) as v \gset c1_
reset role;
insert into public._ctx values ('PDUYURU', :'d_v'), ('FCH1', :'c1_v');
select public._check(4, 'lider adlı ek kanal ekler: ekibin "duyurular" kanalıyla ÇAKIŞMAZ (ad ekip+proje kapsamında)',
  (select name = 'duyurular' and mode = 'project' and not project_main and file_id is null and posting_policy = 'admins' and notify_default = 'all' from public.team_channels where id = public._g('PDUYURU'))
  and (select count(*) from public.team_channels where team_id = public._g('T') and name = 'duyurular') = 2);
select public._check(5, 'dosya kanalı: ad dosyadan (ana-sayfa-taslagi), dosya başına en çok 1',
  (select name = 'ana-sayfa-taslagi' and file_id = public._g('F1') and not project_main from public.team_channels where id = public._g('FCH1')));
set role authenticated;
select public._as_user(:carol);
select public._check(6, 'aynı dosyaya ikinci kanal / aynı projede aynı ad reddedilir',
  public._try(format($$select public.team_add_project_channel(%L, null, '', %L)$$, public._g('P'), public._g('F1'))) like '%channel_exists%'
  and public._try(format($$select public.team_add_project_channel(%L, 'Duyurular')$$, public._g('P'))) like '%channel_name_taken%'
  and public._try(format($$select public.team_add_project_channel(%L)$$, public._g('P'))) like '%channel_invalid%');
reset role;
select public._check(7, 'üyelik = projeyi görenler (erin konuk dışarıda); ek ve dosya kanalı da',
  public._members(public._g('PDUYURU')) = 'alice,bobby,carol,dave,frank' and public._members(public._g('FCH1')) = 'alice,bobby,carol,dave,frank' and public._members(public._g('MAIN')) = 'alice,bobby,carol,dave,frank');

-- 2) Yazma: proje kanalında "yalnız yönetim" = ekip sahibi/yöneticisi + proje lideri ---------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(8, 'proje lideri "yalnız yönetim" kanalında yazar', public.can_send_message(public._g('PDUYURU')));
select public._as_user(:dave);
select public._check(9, 'düzenleyici yazamaz; ana kanalda (herkes) yazar', not public.can_send_message(public._g('PDUYURU')) and public.can_send_message(public._g('MAIN')));
reset role;

-- 3) Arşiv / silme -------------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(10, 'ana proje kanalı arşivlenemez/silinemez (ömrü projeyindir)',
  public._try(format($$select public.team_archive_channel(%L, true)$$, public._g('MAIN'))) like '%channel_project_managed%'
  and public._try(format($$select public.team_delete_channel(%L)$$, public._g('MAIN'))) like '%channel_project_managed%');
select public._as_user(:dave);
select public._check(11, 'düzenleyici ek kanalı silemez', public._try(format($$select public.team_delete_channel(%L)$$, public._g('PDUYURU'))) like '%team_forbidden%');
select public._as_user(:carol);
select public._check(12, 'lider kanalı düzenler (ad/açıklama) ama erişim modunu değiştiremez',
  public._try(format($$select public.team_update_channel(%L, '{"description":"Yeni açıklama","name":"haberler"}'::jsonb)$$, public._g('PDUYURU'))) = 'ok'
  and public._try(format($$select public.team_update_channel(%L, '{"mode":"open"}'::jsonb)$$, public._g('PDUYURU'))) like '%channel_project_managed%');
reset role;
select public._check(13, 'ek kanal adı güncellendi', (select name = 'haberler' and description = 'Yeni açıklama' from public.team_channels where id = public._g('PDUYURU')));
set role authenticated;
select public._as_user(:carol);
select public.team_set_channel_notify(public._g('PDUYURU'), 'mentions');
select public._check(14, 'lider ek kanalı siler; dosya silinince dosya kanalının konuşması da gider',
  public._try(format($$select public.team_delete_channel(%L)$$, public._g('PDUYURU'))) = 'ok'
  and public._try(format($$select public.team_delete_file(%L)$$, public._g('F1'))) = 'ok');
reset role;
select public._check(15, 'silinen kanalların konuşması kalmadı',
  not exists (select 1 from public.conversations where id in (public._g('PDUYURU'), public._g('FCH1'))));

-- 4) Ekip kanalı kuralları değişmedi: ekip kanalı adı ekip kapsamında tek, sınır yalnız ekip kanallarını sayar --------------------------------
set role authenticated;
select public._as_user(:alice);
select public._check(16, 'ekip kanalı adı çakışırsa reddedilir; proje kanalı adıyla çakışmaz',
  public._try($$select public.team_create_channel(public._g('T'), 'genel')$$) like '%channel_name_taken%' or public._try(format($$select public.team_create_channel(%L, 'genel')$$, public._g('T'))) like '%channel_name_taken%');
select public._check(17, 'varsayılan kanal hâlâ kilitli', public._try(format($$select public.team_delete_channel(%L)$$, public._g('GENEL'))) like '%channel_default_locked%');
reset role;

-- 5) Sessize alma — yazma/okuma kuralları -------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:erin);
select public._check(18, 'ekip üyesi olmayan / proje dışı kişi sessize alamaz',
  public._try(format($$select public.team_set_mute(%L, %L, true)$$, public._g('T'), public._g('P'))) like '%project_not_found%');
select public._as_user('');
select public._check(19, 'ziyaretçi sessize alamaz', public._try(format($$select public.team_set_mute(%L, null, true)$$, public._g('T'))) like '%not_authenticated%');
select public._as_user(:dave);
select public._check(20, 'istemci team_mutes tablosuna doğrudan dokunamaz',
  public._try($$select * from public.team_mutes$$) like '%permission denied%'
  and public._try(format($$insert into public.team_mutes (user_id, team_id) values (%L, %L)$$, :dave, public._g('T'))) like '%permission denied%');
reset role;

-- 6) Bildirim üretimi: bahsetme ---------------------------------------------------------------------------------------------------------------------
select public._msg(public._g('MAIN'), :alice, '@dave bakar mısın?') as m1 \gset
select public._msg(public._g('GENEL'), :alice, '@dave genelde de') as m2 \gset
select public._check(21, 'sessize alma yokken bahsetme bildirimi gelir (proje kanalı + ekip kanalı)',
  public._notes(:dave, 'tmention:' || :'m1') = 1 and public._notes(:dave, 'tmention:' || :'m2') = 1);

-- 7) Proje sessiz: o projenin kanalları susar, ekip kanalları ve başka bildirimler gelir ------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public.team_set_mute(public._g('T'), public._g('P'), true);
reset role;
select public._msg(public._g('MAIN'), :alice, '@dave proje sessizken') as m3 \gset
select public._msg(public._g('GENEL'), :alice, '@dave ekip kanalı sessiz değil') as m4 \gset
select public._check(22, 'PROJE sessizken proje kanalı bahsetmesi gelmez; ekip kanalı bahsetmesi gelir',
  public._notes(:dave, 'tmention:' || :'m3') = 0 and public._notes(:dave, 'tmention:' || :'m4') = 1);
select public._check(23, 'proje sessizken okunmamış sayısı 0 (mesaj var); ekip kanalında sayı durur',
  public._unread(public._g('MAIN'), :dave) = 0 and public._unread(public._g('GENEL'), :dave) > 0);
select public._check(24, 'proje sessizken proje bildirimi (onay/ekleme) gelmez',
  (select count(*) from (select public._team_notify(:dave, :alice, public._g('T'), 'direct', 'proje etkinliği', '/teams/local?id=' || public._g('T') || '&tab=projects&project=' || public._g('P'), 'x-proj-1')) z) = 1
  and public._notes(:dave, 'x-proj-1') = 0);
select public._check(25, 'proje sessizken projeye bağlı OLMAYAN ekip bildirimi gelir',
  (select count(*) from (select public._team_notify(:dave, :alice, public._g('T'), 'direct', 'ekip etkinliği', '/teams/local?id=' || public._g('T') || '&tab=members', 'x-team-1')) z) = 1
  and public._notes(:dave, 'x-team-1') = 1);

-- 8) Ekip sessiz: her şey susar, yalnız yönetimsel (sahiplik/rol/süre) gelir ----------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public.team_set_mute(public._g('T'), null, true);
reset role;
select public._msg(public._g('GENEL'), :alice, '@dave ekip sessizken') as m5 \gset
select public._check(26, 'EKİP sessizken ekip kanalı bahsetmesi de gelmez', public._notes(:dave, 'tmention:' || :'m5') = 0);
select public._check(27, 'ekip sessizken ekip bildirimi gelmez',
  (select count(*) from (select public._team_notify(:dave, :alice, public._g('T'), 'direct', 'ekip etkinliği 2', '/teams/local?id=' || public._g('T') || '&tab=members', 'x-team-2')) z) = 1
  and public._notes(:dave, 'x-team-2') = 0);
select public._check(28, 'ekip sessizken sahiplik/rol/süre bildirimi YİNE gelir (kapatılamaz)',
  (select count(*) from (select public._team_notify(:dave, :alice, public._g('T'), 'direct', 'rolünü değiştirdi', '/teams/local?id=' || public._g('T') || '&tab=members', 'teamrole:t1')) z) = 1
  and public._notes(:dave, 'teamrole:t1') = 1);
select public._check(29, 'ekip sessizken tüm kanallarda okunmamış 0', public._unread(public._g('GENEL'), :dave) = 0 and public._unread(public._g('MAIN'), :dave) = 0);

-- 9) Kaynak / okuma: overview ---------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public._check(30, 'overview: ekip sessizken her kanal mute_scope=team; ana kanal proje bilgisi taşır',
  (select bool_and(muted and mute_scope = 'team') from public.team_channels_overview(public._g('T')))
  and (select project_main and project_id = public._g('P') and project_title = 'Villa' from public.team_channels_overview(public._g('T')) where id = public._g('MAIN')));
select public.team_set_mute(public._g('T'), null, false);
select public._check(31, 'ekip sesi açılınca proje sessizliği kalır: proje kanalı=project, ekip kanalı sessiz değil',
  (select mute_scope = 'project' from public.team_channels_overview(public._g('T')) where id = public._g('MAIN'))
  and (select not muted and mute_scope is null from public.team_channels_overview(public._g('T')) where id = public._g('GENEL'))
  and (select count(*) from public.team_my_mutes()) = 1);
select public.team_set_mute(public._g('T'), public._g('P'), false);
select public._check(32, 'proje sesi açılınca hiçbir sessizlik kalmaz', (select count(*) from public.team_my_mutes()) = 0
  and (select bool_and(not muted) from public.team_channels_overview(public._g('T'))));
reset role;

-- 10) Kanal sessiz (bağımsız kanal ya da dosya kanalı) — yalnız o kanal ------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public.team_set_channel_notify(public._g('MAIN'), 'none');
reset role;
select public._msg(public._g('MAIN'), :alice, '@dave kanal sessiz') as m6 \gset
select public._msg(public._g('GENEL'), :alice, '@dave genel açık') as m7 \gset
select public._check(33, 'KANAL sessizken yalnız o kanalın bahsetmesi susar',
  public._notes(:dave, 'tmention:' || :'m6') = 0 and public._notes(:dave, 'tmention:' || :'m7') = 1);
set role authenticated;
select public._as_user(:dave);
select public._check(34, 'overview: kanal sessiz → mute_scope=channel; diğer kanal açık',
  (select mute_scope = 'channel' from public.team_channels_overview(public._g('T')) where id = public._g('MAIN'))
  and (select mute_scope is null from public.team_channels_overview(public._g('T')) where id = public._g('GENEL')));
select public.team_set_channel_notify(public._g('MAIN'), 'mentions');
reset role;

-- 11) "Tüm mesajlar" düzeyi: okunmamış dönem başına BİR bildirim --------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public.team_set_channel_notify(public._g('GENEL'), 'all');
reset role;
select public._msg(public._g('GENEL'), :alice, 'ilk mesaj') as a1 \gset
select public._msg(public._g('GENEL'), :alice, 'ikinci mesaj') as a2 \gset
select public._check(35, '"Tüm mesajlar": okunmamış dönemde tek bildirim (ikinci mesaj yeni bildirim üretmez)',
  public._notes(:dave, 'tmsg:' || public._g('GENEL')) = 1);
select pg_sleep(1.1);
select public._read(public._g('GENEL'), :dave);
select public._msg(public._g('GENEL'), :alice, 'okuduktan sonra') as a3 \gset
select public._check(36, 'okuyunca yeni dönem başlar: yeni bildirim', public._notes(:dave, 'tmsg:' || public._g('GENEL')) = 2);
select public._check(37, 'düzeyi "bahsetme" olan üye "tüm mesaj" bildirimi almaz', public._notes(:carol, 'tmsg:') = 0 and public._notes(:alice, 'tmsg:') = 0);
set role authenticated;
select public._as_user(:dave);
select public.team_set_mute(public._g('T'), null, true);
reset role;
select public._msg(public._g('GENEL'), :alice, 'ekip sessiz, tümü açık') as a4 \gset
select public._check(38, 'ekip sessizken "tüm mesajlar" düzeyi de susar', public._notes(:dave, 'tmsg:' || public._g('GENEL')) = 2);

-- 12) Konuk süresi dolunca / üye çıkınca sessizlik satırı zararsız ---------------------------------------------------------------------------------
select public._check(39, 'sessizlik satırı yalnız sahibine ait tek satırdır', (select count(*) from public.team_mutes where user_id = :dave) = 1);

-- 13) İstemci okumaları: Mesajlar listesi `team_channels`'ı doğrudan okur (yeni sütunlar dahil); proje/dosya tablolarına doğrudan erişim KAPALI kalır ---------------------
set role authenticated;
select public._as_user(:dave);
select public._check(40, 'üye proje kanalının yeni sütunlarını doğrudan okur; team_projects / team_files tablolarını okuyamaz',
  public._try(format($$select id, project_id, file_id, project_main from public.team_channels where id = %L$$, public._g('MAIN'))) = 'ok'
  and (select count(*) from public.team_channels where id = public._g('MAIN') and project_main) = 1
  and public._try($$select title from public.team_projects limit 1$$) like '%permission denied%'
  and public._try($$select title from public.team_files limit 1$$) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
