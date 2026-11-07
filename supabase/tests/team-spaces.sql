-- Ekip alanı: "tamamen kapalı" topluluğa bağlı Space'ler (docs/history/349-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-spaces.sql ("FAILED=0" beklenir).
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

-- DEĞİŞMEZ: her ekip Space'inin üyeleri = topluluk üyeleri; sahip satırı = owner_id = topluluk sahibi.
create or replace function public._inv() returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.spaces s
     where s.community_id is not null and (
       exists (select 1 from public.conversation_members m where m.conversation_id = s.community_id
                and not exists (select 1 from public.space_members x where x.space_id = s.id and x.user_id = m.user_id))
       or exists (select 1 from public.space_members x where x.space_id = s.id
                and not exists (select 1 from public.conversation_members m where m.conversation_id = s.community_id and m.user_id = x.user_id))
       or s.owner_id is distinct from (select m.user_id from public.conversation_members m where m.conversation_id = s.community_id and m.role = 'owner')
       or (select count(*) from public.space_members x where x.space_id = s.id and x.role = 'owner') <> 1
       or not exists (select 1 from public.space_members x where x.space_id = s.id and x.user_id = s.owner_id and x.role = 'owner')
     )
  )
$$;
grant execute on function public._inv() to public;

-- T: tamamen kapalı ekip (alice sahip; bobby yönetici, carol moderatör, dave, erin üye). P: herkese açık topluluk.
select public._mkc('Ekip T', 'private', array[:bobby, :carol, :dave, :erin]::uuid[]) as v \gset t_
select public._mkc('Açık P', 'public', array[:bobby]::uuid[]) as v \gset p_
insert into public._ctx values ('T', :'t_v'), ('P', :'p_v');
select public._as_user(:alice);
select public.set_chat_group_member_role(public._g('T'), :bobby, 'admin');
select public.set_chat_group_member_role(public._g('T'), :carol, 'moderator');
reset role;

-- 1) Yetenek varsayılanları -------------------------------------------------------------------------------------------------------
select public._check(1, 'sahip ve yönetici varsayılan olarak create_spaces + approve_library yetkisine sahip',
  public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :alice, 'create_spaces')) = 'true'
  and public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :bobby, 'create_spaces')) = 'true'
  and public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :bobby, 'approve_library')) = 'true');
select public._check(2, 'moderatör ve üye varsayılan olarak ikisine de sahip değil',
  public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :carol, 'create_spaces')) = 'false'
  and public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :carol, 'approve_library')) = 'false'
  and coalesce(public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :dave, 'create_spaces')), 'false') = 'false');

-- 2) Ekibe Space açma -------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public.create_team_space(public._g('T'), 'Pazarlama kütüphanesi') as v \gset s1_
insert into public._ctx values ('S1', :'s1_v');
select public._as_user(:bobby);
select public.create_team_space(public._g('T'), 'Moodboard', '', 'moodboard', array['Referanslar']) as v \gset s2_
insert into public._ctx values ('S2', :'s2_v');
select public._check(3, 'sahip ve yönetici ekibe Space açar', :'s1_v' is not null and :'s2_v' is not null);
select public._as_user(:carol);
select public._check(4, 'moderatör (yetkisiz) Space açamaz', public._try(format('select public.create_team_space(%L, %L)', public._g('T'), 'Hile')) like '%space_forbidden%');
select public._as_user(:dave);
select public._check(5, 'üye Space açamaz', public._try(format('select public.create_team_space(%L, %L)', public._g('T'), 'Hile')) like '%space_forbidden%');
select public._as_user(:frank);
select public._check(6, 'üye olmayan ekibe Space açamaz (varlığı sızmaz: aynı hata)', public._try(format('select public.create_team_space(%L, %L)', public._g('T'), 'Hile')) like '%space_forbidden%');
select public._as_user(:alice);
select public._check(7, 'herkese açık topluluğa Space bağlanamaz', public._try(format('select public.create_team_space(%L, %L)', public._g('P'), 'Hile')) like '%space_forbidden%');
select public._check(8, 'olmayan topluluğa Space bağlanamaz', public._try(format('select public.create_team_space(%L, %L)', '99999999-9999-4999-8999-999999999999', 'Hile')) like '%space_forbidden%');
reset role;

select public._check(9, 'Space her zaman özel, sahibi topluluk SAHİBİ (kuran yönetici değil), topluluğa bağlı',
  (select owner_id = :alice::uuid and visibility = 'private' and community_id = public._g('T') from public.spaces where id = public._g('S2')));
select public._check(10, 'üyeler eşitlendi: sahip + bobby, carol, dave, erin düzenleyici (5 satır, tek sahip)',
  (select count(*) from public.space_members where space_id = public._g('S1')) = 5
  and (select count(*) from public.space_members where space_id = public._g('S1') and role = 'editor') = 4
  and (select count(*) from public.space_members where space_id = public._g('S1') and role = 'owner') = 1);
select public._check(11, 'DEĞİŞMEZ: üyelik eşitliği + sahip satırı', public._inv());
select public._check(12, 'toplu eşitleme etkinlik geçmişini şişirmedi (yalnız "created")',
  (select count(*) from public.space_activity where space_id = public._g('S1') and action in ('member_joined', 'member_removed')) = 0);

-- 2b) Bildirimler (Aşama 2): yeni ekip Space'i üyelere BİLGİ sınıfıyla gider (üyenin topluluk bildirim düzeyi "Tümü" ise), açan kişiye gitmez
select public._check(65, 'S2’yi bobby açtı: sahibe (alice) ve "Tümü" düzeyindeki üyeye (dave) bildirim gider, açan kişiye (bobby) gitmez',
  (select count(*) from public.notifications where recipient_id = :alice and message like '"Moodboard" adlı yeni ekip Space%') = 1
  and (select count(*) from public.notifications where recipient_id = :dave and message like '"Moodboard" adlı yeni ekip Space%') = 1
  and (select count(*) from public.notifications where recipient_id = :bobby and message like '"Moodboard" adlı yeni ekip Space%') = 0);
select public._check(66, 'bildirimin adresi Space sayfası (Spaces kategorisine düşer)',
  (select bool_and(target_href = '/spaces/local?id=' || public._g('S2')) from public.notifications where message like '"Moodboard" adlı yeni ekip Space%'));

-- 3) Okuma / düzenleme -------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public._check(13, 'üye bağlı Space’i okur', (select count(*) from public.spaces where id = public._g('S1')) = 1);
select public._check(14, 'üye bağlı Space’e öğe ekler (düzenleyici)',
  public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'Not', %L)$q$, public._g('S1'), :dave)) = 'ok');
select public._as_user(:frank);
select public._check(15, 'üye olmayan bağlı Space’i OKUYAMAZ', (select count(*) from public.spaces where id = public._g('S1')) = 0);
select public._check(16, 'üye olmayan öğe ekleyemez',
  public._try(format($q$insert into public.space_items (space_id, kind, title, created_by) values (%L, 'note', 'Hile', %L)$q$, public._g('S1'), :frank)) <> 'ok');
select public._as_user(:bobby);
select public._check(17, 'list_team_spaces: üye ekibin Space’lerini görür', (select count(*) from public.list_team_spaces(public._g('T'))) = 2);
select public._as_user(:frank);
select public._check(18, 'list_team_spaces: üye olmayana boş', (select count(*) from public.list_team_spaces(public._g('T'))) = 0);
reset role;

-- 4) space_role: yönetici sahip sayılır, moderatör/üye düzenleyici --------------------------------------------------------------------
select public._as_user(:bobby);
select public._check(19, 'space_role: create_spaces yetkisi olan yönetici SAHİP', public.space_role(public._g('S1')) = 'owner');
select public._as_user(:carol);
select public._check(20, 'space_role: yetkisiz moderatör DÜZENLEYİCİ', public.space_role(public._g('S1')) = 'editor');
select public._as_user(:dave);
select public._check(21, 'space_role: üye DÜZENLEYİCİ', public.space_role(public._g('S1')) = 'editor');
select public._as_user(:frank);
select public._check(22, 'space_role: üye olmayan boş', public.space_role(public._g('S1')) is null);

set role authenticated;
select public._as_user(:bobby);
select public._check(23, 'yönetici bağlı Space’i yeniden adlandırır',
  public._rows(format($q$update public.spaces set title = 'Pazarlama (yeni)' where id = %L$q$, public._g('S1'))) = 1);
select public._as_user(:carol);
select public._check(24, 'yetkisiz moderatör yeniden adlandıramaz',
  public._rows(format($q$update public.spaces set title = 'Hile' where id = %L$q$, public._g('S1'))) = 0);
select public._as_user(:dave);
select public._check(25, 'üye Space’i silemez',
  public._rows(format($q$delete from public.spaces where id = %L$q$, public._g('S1'))) = 0);
reset role;
select public._check(26, 'silme/yeniden adlandırma reddedildi: Space duruyor, adı değişmedi',
  (select title from public.spaces where id = public._g('S1')) = 'Pazarlama (yeni)');

-- 5) Üyelik / görünürlük / bağ ekibe bağlı Space'te istemciden DEĞİŞTİRİLEMEZ ------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(27, 'davet reddedilir (space_team_managed)', public._try(format('select public.invite_space_member(%L, %L, %L)', public._g('S1'), 'frank', 'viewer')) like '%space_team_managed%');
select public._check(28, 'üye çıkarma reddedilir', public._try(format('select public.remove_space_member(%L, %L)', public._g('S1'), :dave)) like '%space_team_managed%');
select public._check(29, 'rol değiştirme reddedilir', public._try(format('select public.set_space_member_role(%L, %L, %L)', public._g('S1'), :dave, 'viewer')) like '%space_team_managed%');
select public._as_user(:dave);
select public._check(30, 'üyenin Space’ten tek başına ayrılması reddedilir (ekipten ayrılır)', public._try(format('select public.remove_space_member(%L, %L)', public._g('S1'), :dave)) like '%space_team_managed%');
select public._as_user(:bobby);
select public._check(31, 'görünürlük herkese açığa çevrilemez', public._try(format($q$update public.spaces set visibility = 'public' where id = %L$q$, public._g('S1'))) like '%space_team_managed%');
select public._check(32, 'topluluk bağı istemciden değiştirilemez', public._try(format($q$update public.spaces set community_id = null where id = %L$q$, public._g('S1'))) like '%space_invalid%');
select public._check(33, 'sahip istemciden değiştirilemez', public._try(format($q$update public.spaces set owner_id = %L where id = %L$q$, :bobby, public._g('S1'))) like '%space_invalid%');
select public._check(34, 'üyelik tablosuna doğrudan yazılamaz',
  public._try(format($q$insert into public.space_members (space_id, user_id, role) values (%L, %L, 'viewer')$q$, public._g('S1'), :frank)) <> 'ok');
reset role;
select public._check(35, 'reddedilen çağrılar hiçbir şey değiştirmedi', public._inv());

-- 6) Ekip üyeliği değişince Space üyeliği yansır --------------------------------------------------------------------------------------
insert into public.conversation_members (conversation_id, user_id, role) values (public._g('T'), :gina, 'member');
select public._check(36, 'ekibe katılan her iki Space’e de düzenleyici olarak eklenir',
  (select count(*) from public.space_members where user_id = :gina and role = 'editor' and space_id in (public._g('S1'), public._g('S2'))) = 2);
select public._as_user(:dave);
select public.leave_chat_group(public._g('T'));
select public._check(37, 'ekipten ayrılan Space’lerden de çıkar',
  (select count(*) from public.space_members where user_id = :dave and space_id in (public._g('S1'), public._g('S2'))) = 0);
select public._as_user(:bobby);
select public.remove_chat_group_member(public._g('T'), :erin, true, null);
select public._check(38, 'ekipten çıkarılan/yasaklanan Space’lerden de çıkar',
  (select count(*) from public.space_members where user_id = :erin and space_id in (public._g('S1'), public._g('S2'))) = 0);
set role authenticated;
select public._as_user(:dave);
select public._check(39, 'ayrılan eski üye artık Space’i OKUYAMAZ', (select count(*) from public.spaces where id = public._g('S1')) = 0);
reset role;
select public._check(40, 'DEĞİŞMEZ: katılma / ayrılma / çıkarma sonrası', public._inv());

-- 7) Yetki ayarı: moderatöre create_spaces / yöneticiden approve_library --------------------------------------------------------------
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('T'), '{"role_permissions":{"moderator":{"create_spaces":true}}}');
select public._check(41, 'sahip moderatöre create_spaces verince Space açabilir ve Space’i yönetir (sahip sayılır)',
  public._q(format('select public._group_can(%L, %L, %L)', public._g('T'), :carol, 'create_spaces')) = 'true'
  and (select public.space_role(public._g('S1'))) is not null);
select public._as_user(:carol);
select public._check(42, 'moderatörün space_role’ü artık SAHİP', public.space_role(public._g('S1')) = 'owner');
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('T'), '{"role_permissions":{"moderator":{"create_spaces":false}}}');
select public._as_user(:carol);
select public._check(43, 'yetki geri alınınca tekrar DÜZENLEYİCİ', public.space_role(public._g('S1')) = 'editor');

-- 8) Onay: approve_library yetkisi ----------------------------------------------------------------------------------------------------
reset role;
insert into public.space_items (id, space_id, kind, is_draft, title, body, created_by)
values ('e1000000-0000-4000-8000-0000000000c1', public._g('S1'), 'prompt', true, 'Satış e-postası', 'Merhaba {musteri}', :gina);
select public._as_user(:gina);
select public._check(44, 'üye (yetkisiz) onaylayamaz', public._try(format('select public.space_set_item_approval(%L, true)', 'e1000000-0000-4000-8000-0000000000c1')) like '%space_forbidden%');
select public._as_user(:carol);
select public._check(45, 'moderatör (approve_library yok) onaylayamaz', public._try(format('select public.space_set_item_approval(%L, true)', 'e1000000-0000-4000-8000-0000000000c1')) like '%space_forbidden%');
select public._as_user(:bobby);
select public._check(46, 'yönetici (approve_library var) onaylar', public._try(format('select public.space_set_item_approval(%L, true)', 'e1000000-0000-4000-8000-0000000000c1')) = 'ok');
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('T'), '{"role_permissions":{"admin":{"approve_library":false}}}');
select public._as_user(:bobby);
select public._check(47, 'sahip yöneticiden approve_library’yi alınca yönetici onay veremez', public._try(format('select public.space_set_item_approval(%L, false)', 'e1000000-0000-4000-8000-0000000000c1')) like '%space_forbidden%');
select public._as_user(:alice);
select public._check(48, 'sahip her zaman onaylayabilir (onayı geri alır)', public._try(format('select public.space_set_item_approval(%L, false)', 'e1000000-0000-4000-8000-0000000000c1')) = 'ok');

-- 8b) Onay bildirimi (Aşama 2): taslağın yazarına doğrudan; kendi onayında bildirim yok
select public._check(67, 'onay verilince taslağın yazarı (gina) bildirim alır', (select count(*) from public.notifications where recipient_id = :gina and message like '%promptunu ekip kütüphanesinde onayladı.') = 1);
select public._check(68, 'onay geri alınınca ikinci, ayrı bildirim gelir', (select count(*) from public.notifications where recipient_id = :gina and message like '%promptunun onayını kaldırdı.') = 1);
select public._check(69, 'bildirim adresi Space’in Promptlar sekmesi', (select bool_and(target_href like '/spaces/local?id=%&tab=prompts') from public.notifications where recipient_id = :gina and message like '%promptun%'));
insert into public.space_items (id, space_id, kind, is_draft, title, body, created_by)
values ('e1000000-0000-4000-8000-0000000000c2', public._g('S1'), 'prompt', true, 'Alice taslağı', 'x', :alice);
select public._as_user(:alice);
select public.space_set_item_approval('e1000000-0000-4000-8000-0000000000c2', true);
select public._check(70, 'kendi taslağını onaylayana bildirim gitmez', (select count(*) from public.notifications where recipient_id = :alice and message like '"Alice taslağı"%') = 0);

-- 9) Aynı ekibin içeriği ekip Space'ine eklenebilir ------------------------------------------------------------------------------------
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-0000000000c1', :bobby, 'Ekip promptu', 'd', 'metin', 'text', 'published', 'private', public._g('T')),
  ('a0000000-0000-4000-8000-0000000000c2', :bobby, 'Açık topluluk promptu', 'd', 'metin', 'text', 'published', 'private', public._g('P'));
select public._as_user(:gina);
set role authenticated;
select public._check(49, 'aynı ekibin topluluk içeriği ekip Space’ine EKLENEBİLİR',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000c1', %L)$q$, public._g('S1'), :gina)) = 'ok');
select public._check(50, 'BAŞKA topluluğun içeriği eklenemez',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000c2', %L)$q$, public._g('S1'), :gina)) like '%space_source_unavailable%');
reset role;
-- Kişisel Space'e topluluk içeriği yine eklenemez
select public._as_user(:gina);
select public.create_space('Kişisel') as v \gset ps_
insert into public._ctx values ('PS', :'ps_v');
set role authenticated;
select public._check(51, 'KİŞİSEL Space’e topluluk içeriği eklenemez (kural aynen sürer)',
  public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000c1', %L)$q$, public._g('PS'), :gina)) like '%space_source_unavailable%');
reset role;

-- 10) Sahiplik devri ----------------------------------------------------------------------------------------------------------------------
select public._as_user(:alice);
select public.transfer_chat_group_ownership(public._g('T'), :bobby);
select public._check(52, 'topluluk sahipliği devredilince ekip Space’lerinin sahibi de değişir',
  (select count(*) from public.spaces where community_id = public._g('T') and owner_id = :bobby::uuid) = 2);
select public._check(53, 'DEĞİŞMEZ: devirden sonra (eski sahip düzenleyici, yeni sahip tek sahip satırı)', public._inv());

-- 11) Görünürlük koruması -----------------------------------------------------------------------------------------------------------------
select public._check(54, 'ekip Space’i varken topluluk "tamamen kapalı" olmaktan çıkamaz',
  public._try(format($q$update public.chat_groups set visibility = 'restricted' where id = %L$q$, public._g('T'))) like '%community_has_team_spaces%');

-- 12) Kapatılmış topluluk -----------------------------------------------------------------------------------------------------------------
select public._mkc('Ekip K', 'private', array[:carol]::uuid[]) as v \gset k_
insert into public._ctx values ('K', :'k_v');
select public.close_community(public._g('K'));
select public._check(55, 'kapatılmış topluluğa Space açılamaz', public._try(format('select public.create_team_space(%L, %L)', public._g('K'), 'Hile')) like '%space_forbidden%');

-- 13) Sınır: ekip başına 50 Space ---------------------------------------------------------------------------------------------------------
select public._mkc('Ekip L', 'private', array[]::uuid[]) as v \gset l_
insert into public._ctx values ('L', :'l_v');
select count(*) filter (where public._try(format('select public.create_team_space(%L, %L)', public._g('L'), 'S' || g)) = 'ok') as n from generate_series(1, 50) g \gset made_
select public._check(56, 'ekip başına 50 Space açılır', :made_n = 50);
select public._check(57, '51. Space reddedilir (team_space_limit)', public._try(format('select public.create_team_space(%L, %L)', public._g('L'), 'Fazla')) like '%team_space_limit%');
select public._check(58, 'sahibin kişisel 200 sınırı ekip Space’lerini saymaz',
  (select count(*) from public.spaces where owner_id = :alice::uuid and community_id is null) < 5);

-- 14) Eski topluluklar (role_permissions boş): yeni yetenek varsayılana düşer ----------------------------------------------------------
reset role;
update public.chat_groups set role_permissions = '{}'::jsonb where id = public._g('L');
insert into public.conversation_members (conversation_id, user_id, role) values (public._g('L'), :erin, 'admin');
select public._check(59, 'role_permissions boş olan eski toplulukta yönetici yine create_spaces’e sahip (varsayılana düşer)',
  public._q(format('select public._group_can(%L, %L, %L)', public._g('L'), :erin, 'create_spaces')) = 'true');

-- 15) Topluluk silinince Space'ler KALIR, kişisel olur -------------------------------------------------------------------------------------
select public._as_user(:bobby);
select public.delete_chat_group(public._g('T'));
select public._check(60, 'topluluk silinince Space’ler silinmez, bağ düşer, yalnız sahip satırı kalır',
  (select count(*) from public.spaces where id in (public._g('S1'), public._g('S2')) and community_id is null) = 2
  and (select count(*) from public.space_members where space_id in (public._g('S1'), public._g('S2'))) = 2);
set role authenticated;
select public._as_user(:gina);
select public._check(61, 'eski ekip üyesi artık bu Space’leri OKUYAMAZ', (select count(*) from public.spaces where id = public._g('S1')) = 0);
select public._as_user(:bobby);
select public._check(62, 'eski topluluk sahibi Space’i KİŞİSEL olarak korur', (select count(*) from public.spaces where id = public._g('S1') and owner_id = :bobby::uuid) = 1);
reset role;
select public._check(63, 'DEĞİŞMEZ: silmeden sonra (kalan ekipler için)', public._inv());

-- 16) Anon ---------------------------------------------------------------------------------------------------------------------------------
set role anon;
select public._as_user('');
select public._check(64, 'anon ekip RPC’lerini çağıramaz',
  public._try(format('select public.create_team_space(%L, %L)', public._g('L'), 'x')) like '%permission denied%'
  and public._try(format('select * from public.list_team_spaces(%L)', public._g('L'))) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
