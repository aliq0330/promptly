-- Ekipler, WP3 (docs/history/353-*): kütüphane yönetişimi. Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-library-governance.sql ("FAILED=0" beklenir).
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
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text) to public;

-- Öğe kurar (süper kullanıcı gözüyle; yazar creator).
create or replace function public._mkitem(p_title text, p_body text, p_creator uuid, p_group uuid default null) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  insert into public.space_items (space_id, kind, title, body, is_draft, created_by, group_id)
  values (public._g('LIB'), 'prompt', p_title, p_body, true, p_creator, p_group) returning id into v;
  return v;
end $$;
grant execute on function public._mkitem(text, text, uuid, uuid) to public;
create or replace function public._st(p_item uuid) returns text language sql security definer as $$
  select public._space_item_state(approved_at, deprecated_at, review_requested_at) from public.space_items where id = p_item $$;
grant execute on function public._st(uuid) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol + gina düzenleyici, dave üye).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public._ctx select 'LIB', library_space_id::text from public.teams where id = public._g('T');
insert into public.team_members (team_id, user_id, role) values
  (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'), (public._g('T'), :erin, 'editor');
select public._mkitem('Ürün tanıtım', 'merhaba {marka}', :carol) as v \gset a_
select public._mkitem('Sosyal başlık', 'başlık yaz', :carol) as v \gset b_
select public._mkitem('E-posta yanıtı', 'sayın {ad}', :carol) as v \gset c_
insert into public._ctx values ('A', :'a_v'), ('B', :'b_v'), ('C', :'c_v');

-- 1) Durum ve inceleme isteği -------------------------------------------------------------------------------------------------------------
select public._check(1, 'yeni taslağın durumu "draft", içerik sürümü 1', public._st(public._g('A')) = 'draft' and (select content_rev from public.space_items where id = public._g('A')) = 1);
set role authenticated;
select public._as_user(:carol);
select public._check(2, 'düzenleyici "Onaya gönder" der → pending', public._try(format($$select public.space_request_review(%L)$$, public._g('A'))) = 'ok' and public._st(public._g('A')) = 'pending');
reset role;
select public._check(3, 'onay yetkilileri (sahip + yönetici) bildirim aldı; üye ve isteyen almadı',
  (select count(*) from public.notifications where recipient_id = :alice and message like '%için onay istedi%') = 1
  and (select count(*) from public.notifications where recipient_id = :bobby and message like '%için onay istedi%') = 1
  and (select count(*) from public.notifications where recipient_id = :dave and message like '%için onay istedi%') = 0
  and (select count(*) from public.notifications where recipient_id = :carol and message like '%için onay istedi%') = 0);
set role authenticated;
select public._as_user(:bobby);
select public.team_library_counts(public._g('T'))::text as v \gset r4_
reset role;
select public._check(4, 'kütüphane sayaçları (yönetici gözüyle): 3 öğe, 1 bekleyen, 2 taslak, en eski bekleyen tarihi var',
  (:'r4_v'::jsonb ->> 'total')::int = 3 and (:'r4_v'::jsonb ->> 'pending')::int = 1 and (:'r4_v'::jsonb ->> 'draft')::int = 2 and (:'r4_v'::jsonb ->> 'oldest_pending_at') is not null);

-- 2) Karar: onayla / değişiklik iste ------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(5, 'düzenleyici karar veremez', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('A'))) like '%space_forbidden%');
select public._as_user(:dave);
select public._check(6, 'üye karar veremez (ve bekleyen item’ı bile göremez: gizleme açık)', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('A'))) like '%space_not_found%');
select public._as_user(:frank);
select public._check(7, 'yabancı karar veremez', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('A'))) like '%space_not_found%');
select public._as_user(:bobby);
select public.space_decide_item(public._g('A'), 'approve', 'harika', '[{"key":"variables","done":true}]') ->> 'state' as v \gset r8_
select public._check(8, 'yönetici onaylar (1 onay yeter) → approved, istek temizlenir', :'r8_v' = 'approved'
  and public._st(public._g('A')) = 'approved' and (select review_requested_at is null and approved_by = :bobby::uuid from public.space_items where id = public._g('A')));
reset role;
select public._check(9, 'yazar onay bildirimi aldı', (select count(*) from public.notifications where recipient_id = :carol and message like '%ekip kütüphanesinde onayladı%') = 1);
select public._check(10, 'denetim günlüğü: onay kaydı', (select count(*) from public.team_audit where team_id = public._g('T') and action = 'item_approved') = 1);

-- n onay: 2
set role authenticated;
select public._as_user(:bobby);
select public.team_update(public._g('T'), '{"approvals_needed": 2}');
select public._as_user(:carol);
select public.space_request_review(public._g('B'));
select public._as_user(:bobby);
select public.space_decide_item(public._g('B'), 'approve') ->> 'state' as v \gset r11_
select public._check(11, '2 onay gerekirken ilk onay "pending" kalır (1/2)', :'r11_v' = 'pending' and public._st(public._g('B')) = 'pending');
select public._as_user(:alice);
select public.space_decide_item(public._g('B'), 'approve') ->> 'state' as v \gset r12_
select public._check(12, 'ikinci onaylayan işareti verir → approved', :'r12_v' = 'approved' and public._st(public._g('B')) = 'approved');
-- değişiklik iste
select public._as_user(:carol);
select public.space_request_review(public._g('C'));
select public._as_user(:alice);
select public.space_decide_item(public._g('C'), 'changes', 'Örnek ekleyin') ->> 'state' as v \gset r13_
select public._check(13, '"Değişiklik iste": istek temizlenir, durum draft, not yazıldı', :'r13_v' = 'draft' and public._st(public._g('C')) = 'draft'
  and (select review_requested_at is null from public.space_items where id = public._g('C')));
select public._check(14, 'onaylı öğede "değişiklik iste" reddedilir', public._try(format($$select public.space_decide_item(%L, 'changes', 'x')$$, public._g('A'))) like '%space_invalid%');
reset role;
select public._check(15, 'yazar değişiklik bildirimi aldı; inceleme akışında karar yorumu var',
  (select count(*) from public.notifications where recipient_id = :carol and message like '%promptunda değişiklik istedi%') = 1
  and exists (select 1 from public.space_item_review_comments where item_id = public._g('C') and kind = 'changes' and body = 'Örnek ekleyin'));

-- 3) İçerik değişince onay düşer; sürüm saklanır -----------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
update public.space_items set body = 'merhaba {marka}, yeni' where id = public._g('A');
reset role;
select public._check(16, 'onaylı öğenin metni değişince onay kendiliğinden düşer ve içerik sürümü 2 olur',
  (select approved_at is null and content_rev = 2 from public.space_items where id = public._g('A')));
select public._check(17, 'eski hâl onaylı sürüm olarak saklandı', (select count(*) from public.space_item_versions where item_id = public._g('A') and was_approved) = 1);
select public._check(18, 'eski sürüm onayları yeni sürümde sayılmaz', (select count(*) from public.space_item_approvals where item_id = public._g('A') and content_rev = 2) = 0);

-- 4) Geri alma ----------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public.team_update(public._g('T'), '{"approvals_needed": 1}');
select public.space_set_item_approval(public._g('B'), false);
reset role;
select public._check(19, 'onayı kaldırmak o sürümün onaylarını siler', public._st(public._g('B')) = 'draft'
  and (select count(*) from public.space_item_approvals where item_id = public._g('B') and content_rev = 1) = 0);
set role authenticated;
select public._as_user(:bobby);
select public._check(20, 'space_set_item_approval(true) ekip kütüphanesinde karar yolundan geçer ve onaylar', public._try(format($$select public.space_set_item_approval(%L, true)$$, public._g('B'))) = 'ok' and public._st(public._g('B')) = 'approved');
reset role;

-- 5) Grup klasörü liderleri ---------------------------------------------------------------------------------------------------------------
insert into public.team_groups (team_id, name, lead_id, leads_approve) values (public._g('T'), 'Tasarım', :dave, true) returning id as v \gset g_
insert into public._ctx values ('G', :'g_v');
insert into public.space_groups (space_id, name, position) values (public._g('LIB'), 'Tasarım promptları', 0) returning id as v \gset sg_
insert into public._ctx values ('SG', :'sg_v');
set role authenticated;
select public._as_user(:carol);
select public._check(21, 'düzenleyici klasörü ekip grubuna bağlayamaz', public._try(format($$select public.team_link_space_group(%L, %L)$$, public._g('SG'), public._g('G'))) like '%team_forbidden%');
select public._as_user(:bobby);
select public.team_link_space_group(public._g('SG'), public._g('G'));
reset role;
select public._mkitem('Klasörlü prompt', 'x', :carol, public._g('SG')) as v \gset d_
insert into public._ctx values ('D', :'d_v');
set role authenticated;
select public._as_user(:carol);
select public.space_request_review(public._g('D'));
select public._as_user(:dave);
select public.space_decide_item(public._g('D'), 'approve') ->> 'state' as v \gset r22_
select public._check(22, 'grup lideri, "liderler onaylar" açıkken kendi klasöründeki promptu onaylar', :'r22_v' = 'approved' and public._st(public._g('D')) = 'approved');
select public._check(23, 'lider klasör DIŞINDaki promptu onaylayamaz', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('C'))) like '%space_forbidden%' or public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('C'))) like '%space_not_found%');
select public._check(24, 'space_can_approve: lider evet, düzenleyici hayır', public.space_can_approve(public._g('LIB')) and public.space_can_approve_item(public._g('D')) and not public.space_can_approve_item(public._g('C')));
select public._as_user(:carol);
select public._check(25, 'düzenleyici için space_can_approve hayır', not public.space_can_approve(public._g('LIB')));
reset role;

-- 6) Kullanımdan kalkma -------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(26, 'düzenleyici kullanımdan kaldıramaz', public._try(format($$select public.space_set_item_deprecated(%L, true)$$, public._g('D'))) like '%space_forbidden%');
select public._check(27, 'onay/kullanımdan kalkma sütunları doğrudan yazılamaz', public._try(format($$update public.space_items set deprecated_at = now() where id = %L$$, public._g('D'))) like '%space_approval_forbidden%'
  and public._try(format($$update public.space_items set approved_at = now(), approved_by = %L where id = %L$$, :carol, public._g('C'))) like '%space_approval_forbidden%');
select public._as_user(:bobby);
select public.space_set_item_deprecated(public._g('D'), true) is not null as v \gset r28a_
select public._st(public._g('D')) as v \gset r28b_
select public.space_set_item_deprecated(public._g('D'), false) is null as v \gset r28c_
select public._check(28, 'yönetici kullanımdan kaldırır → deprecated; geri alır → approved', :'r28a_v' = 't' and :'r28b_v' = 'deprecated' and :'r28c_v' = 't' and public._st(public._g('D')) = 'approved');
reset role;
update public.space_items set locked = true where id = public._g('D');
set role authenticated;
select public._as_user(:bobby);
select public._check(29, 'kilitli öğe de kullanımdan kaldırılabilir (kilit içeriği korur)', public._try(format($$select public.space_set_item_deprecated(%L, true)$$, public._g('D'))) = 'ok');
select public.space_set_item_deprecated(public._g('D'), false);
reset role;
update public.space_items set locked = false where id = public._g('D');

-- 7) Onaysızı gizle ----------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public._check(30, 'üye (görüntüleyici) onaysız taslakları göremez; onaylıları görür',
  public._cnt(format('select count(*) from public.space_items where id = %L', public._g('C'))) = 0
  and public._cnt(format('select count(*) from public.space_items where id = %L', public._g('D'))) = 1);
select public._check(31, 'gizli öğenin sürümleri de gizli', public._cnt(format('select count(*) from public.space_item_versions where item_id = %L', public._g('A'))) = 0);
select public._check(32, 'üye için team_library_items yalnız onaylıları döner', (select count(*) from public.team_library_items(public._g('T'))) = (select count(*) from public.space_items where space_id = public._g('LIB') and approved_at is not null and kind = 'prompt'));
select public._as_user(:carol);
select public._check(33, 'düzenleyici taslakları görür', public._cnt(format('select count(*) from public.space_items where id = %L', public._g('C'))) = 1);
select public._as_user(:bobby);
select public.team_update(public._g('T'), '{"hide_unapproved": false}');
select public._as_user(:dave);
select public._check(34, '"onaysızı gizle" kapanınca üye taslakları görür', public._cnt(format('select count(*) from public.space_items where id = %L', public._g('C'))) = 1);
reset role;

-- 8) Kullanım sayacı ----------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:dave);
select public.space_record_item_use(public._g('D')) as v \gset r35a_
select public.space_record_item_use(public._g('D')) as v \gset r35b_
select public._check(35, 'üye onaylı promptu kullanır: ilk sayılır, aynı gün tekrar sayılmaz', :'r35a_v' = 't' and :'r35b_v' = 'f'
  and (select use_count from public.space_items where id = public._g('D')) = 1);
select public._check(36, '"onay zorunlu" açıkken üye onaysız promptu kullanamaz', public._try(format($$select public.space_record_item_use(%L)$$, public._g('C'))) like '%item_not_approved%');
select public._as_user(:carol);
select public._check(37, 'düzenleyici onaysız promptu (deneme için) kullanabilir', public.space_record_item_use(public._g('C')));
select public._as_user(:bobby);
select public.space_set_item_deprecated(public._g('D'), true);
select public._as_user(:dave);
select public._check(38, 'kullanımdan kalkan prompt kullanılamaz', public._try(format($$select public.space_record_item_use(%L)$$, public._g('D'))) like '%item_deprecated%');
select public._as_user(:bobby);
select public.space_set_item_deprecated(public._g('D'), false);
select public.team_update(public._g('T'), '{"require_approval": false}');
select public._as_user(:dave);
select public._check(39, '"onay zorunlu" kapanınca üye taslağı da kullanır', public.space_record_item_use(public._g('C')));
select public._as_user(:bobby);
select public.team_update(public._g('T'), '{"require_approval": true, "hide_unapproved": true}');
reset role;

-- 9) Çalıştı mı? ---------------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:erin);
select public._check(40, 'kullanmadan oy verilemez', public._try(format($$select public.space_set_item_works(%L, true)$$, public._g('D'))) like '%copy_required%');
select public._as_user(:dave);
select public.space_set_item_works(public._g('D'), true) ->> 'yes' as v \gset r41_
select public._check(41, 'kullanan oy verir: evet=1', :'r41_v' = '1');
select public.space_set_item_works(public._g('D'), false) ->> 'no' as v \gset r42a_
select public.space_set_item_works(public._g('D'), null) ->> 'no' as v \gset r42b_
select public._check(42, 'oy değiştirilebilir ve geri çekilebilir', :'r42a_v' = '1' and :'r42b_v' = '0');
select public._as_user(:carol);
select public._check(43, 'yazar kendi promptuna oy veremez', public._try(format($$select public.space_set_item_works(%L, true)$$, public._g('D'))) like '%self_vote_not_allowed%');
select public._check(44, 'durum JSON’u: can_vote ve sayılar', (public.space_item_works_state(public._g('D')) ->> 'can_vote')::boolean is false);
reset role;

-- 10) Ekip değişkenleri ---------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public._check(45, 'düzenleyici ekip değişkeni yazar', public._try(format($$select public.space_set_variable(%L, 'marka', 'Atölye Mor')$$, public._g('LIB'))) = 'ok');
select public._as_user(:dave);
select public._check(46, 'üye ekip değişkeni yazamaz', public._try(format($$select public.space_set_variable(%L, 'ton', 'x')$$, public._g('LIB'))) like '%space_forbidden%');
select public._check(47, 'üye değişken değerlerini okur', public._cnt(format('select count(*) from public.space_variables where space_id = %L', public._g('LIB'))) = 1);
select public._as_user(:carol);
select public._check(48, 'düzenleyici değişkeni siler', public._try(format($$select public.space_delete_variable(%L, 'marka')$$, public._g('LIB'))) = 'ok');
select public._as_user(:alice);
select public.create_space('Kişisel kütüphane', '', 'team_library') as v \gset pl_
select public._check(49, 'kişisel kütüphanede eski kural: Space sahibi değişken yazar', public._try(format($$select public.space_set_variable(%L, 'a', 'b')$$, :'pl_v')) = 'ok');
select public._as_user(:bobby);
select public._check(50, 'başkasının kişisel kütüphanesine yazılamaz', public._try(format($$select public.space_set_variable(%L, 'a', 'c')$$, :'pl_v')) ~ 'space_not_found|space_forbidden');
reset role;
select public._check(51, 'denetim günlüğü değişken olaylarını kaydetti', (select count(*) from public.team_audit where team_id = public._g('T') and category = 'variable') = 2);

-- 11) İnceleme ekranı verisi ---------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
select public.space_add_review_comment(public._g('C'), 'Düzelttim, tekrar bakın') as v \gset cm_
select public._as_user(:bobby);
select public._check(52, 'space_item_review: gereken onay, yorumlar, taban sürüm ve karar yetkisi', (public.space_item_review(public._g('A')) ->> 'needed')::int = 1
  and (public.space_item_review(public._g('A')) -> 'base' ->> 'was_approved')::boolean
  and jsonb_array_length(public.space_item_review(public._g('C')) -> 'comments') = 2
  and (public.space_item_review(public._g('C')) ->> 'can_decide')::boolean);
select public._as_user(:dave);
select public._check(53, 'üye inceleme verisini okuyamaz; yorum yazamaz', public._try(format($$select public.space_item_review(%L)$$, public._g('A'))) like '%space_not_found%'
  and public._try(format($$select public.space_add_review_comment(%L, 'x')$$, public._g('A'))) like '%space_forbidden%');
select public._check(54, 'inceleme tablolarına doğrudan erişim yok', public._cnt('select count(*) from public.space_item_review_comments') = 0
  and public._try(format($$insert into public.space_item_review_comments (item_id, space_id, body) values (%L, %L, 'x')$$, public._g('A'), public._g('LIB'))) like '%permission denied%'
  and public._try('select count(*) from public.space_item_uses') like '%permission denied%'
  and public._try('select count(*) from public.space_item_works_votes') like '%permission denied%');
reset role;

-- 12) Liste ve sayaçlar --------------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:bobby);
select public._check(55, 'team_library_counts: toplam 4, onaylı 2 (A düştü), bekleyen 0', (public.team_library_counts(public._g('T')) ->> 'total')::int = 4
  and (public.team_library_counts(public._g('T')) ->> 'pending')::int = 0);
select public._check(56, 'team_library_items durum süzgeci ve arama çalışır', (select count(*) from public.team_library_items(public._g('T'), 'approved')) >= 1
  and (select count(*) from public.team_library_items(public._g('T'), 'all', 'klasörlü')) = 1
  and (select count(*) from public.team_library_items(public._g('T'), 'deprecated')) = 0);
reset role;

-- 13) Sürüm sınırı politikası --------------------------------------------------------------------------------------------------------------
update public.teams set version_keep = 10 where id = public._g('T');
do $$
declare i int;
begin
  for i in 1..13 loop
    update public.space_items set body = 'sürüm ' || i where id = (select v::uuid from public._ctx where k = 'B');
  end loop;
end $$;
select public._check(57, 'sürüm sayısı ekip politikasındaki sınıra (10) iner', (select count(*) from public.space_item_versions where item_id = public._g('B')) = 10);

-- 14) Sayaçlar korunur ve anon ---------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:carol);
update public.space_items set use_count = 999, works_yes = 999 where id = public._g('C');
reset role;
select public._check(58, 'istemci kullanım/oy sayaçlarını yazamaz', (select use_count < 999 and works_yes < 999 from public.space_items where id = public._g('C')));
set role anon;
select public._as_user('');
select public._check(59, 'anon yeni RPC’leri çağıramaz', public._try(format($$select public.space_decide_item(%L, 'approve')$$, public._g('A'))) like '%permission denied%'
  and public._try(format($$select public.space_record_item_use(%L)$$, public._g('A'))) like '%permission denied%'
  and public._try(format($$select * from public.team_library_items(%L)$$, public._g('T'))) like '%permission denied%');
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
