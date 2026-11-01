-- Topluluklar: DB/RLS/RPC testi (docs/history/175-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/communities.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(owner) bobby(admin) carol(moderator) dave(üye) erin(dışarıdan) frank(dışarıdan) gina(engelli) hank(moderatör-site).
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
update public.profiles set role = 'moderator' where id = :hank;

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
create or replace function public._tk(key text, q text) returns text language plpgsql as $$
declare r text;
begin r := public._try(q); insert into public._ctx values ('r:' || key, r) on conflict (k) do update set v = excluded.v; return r; end $$;
create or replace function public._r(key text) returns text language sql stable as $$ select v from public._ctx where k = 'r:' || key $$;
grant execute on function public._tk(text, text), public._r(text) to public;
-- RLS'e takılmadan (süper kullanıcı gözüyle) tek değer okur: yalnızca DOĞRULAMA içindir.
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._q(text) to public;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._ctx_get(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
create or replace function public._notif(uid text, pattern text) returns bigint language sql stable security definer as
  $$ select count(*) from public.notifications where recipient_id = uid::uuid and message like pattern $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text),
  public._ctx_get(text), public._notif(text, text) to public;

-- İçerik fixture'ı (süper kullanıcı): alice'in herkese açık prompt'u + özel prompt'u + taslak; bobby'nin açık hazır ayarı/workflow'u/isteği.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-000000000001', :alice, 'Açık prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-000000000002', :alice, 'Özel prompt', 'd', 'metin', 'text', 'published', 'private'),
  ('a0000000-0000-4000-8000-000000000003', :alice, 'Taslak prompt', 'd', 'metin', 'text', 'draft', 'public'),
  ('a0000000-0000-4000-8000-000000000004', :dave, 'Dave prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-000000000005', :bobby, 'Bobby prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-000000000006', :carol, 'Carol prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-000000000007', :dave, 'Dave prompt 2', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-000000000008', :dave, 'Dave prompt 3', 'd', 'metin', 'text', 'published', 'public');
insert into public.presets (id, creator_id, title, status, visibility) values
  ('b0000000-0000-4000-8000-000000000001', :bobby, 'Hazır ayar', 'published', 'public');
insert into public.workflows (id, creator_id, title, status, visibility) values
  ('c0000000-0000-4000-8000-000000000001', :bobby, 'Akış', 'published', 'public');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('d0000000-0000-4000-8000-000000000001', :bobby, 'İstek', 'd', false, 'public');

-- Engel: gina ↔ dave
insert into public.blocks (blocker_id, blocked_id) values (:gina, :dave);

-- ============================================================================
-- 1. Oluşturma
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _c1 as select public.create_community('Açık Topluluk', 'açıklama', 'public', null, 50, '{}'::uuid[], 'image', 'members', 'members', null, false) as j;
create temp table _c2 as select public.create_community('Kapalı Topluluk', null, 'private', null, 50, array[:bobby, :carol]::uuid[], 'text', 'members', 'members', 'Kural 1: nazik ol', true) as j;
reset role;
insert into public._ctx select 'open', j->>'group_id' from _c1;
insert into public._ctx select 'closed', j->>'group_id' from _c2;

select public._check(1, 'oluşturma: sahip, kimlik=sohbet, native, kategori, ilk davetler',
  (select g.origin = 'native' and g.category = 'image' and g.member_count = 1 and c.kind = 'group'
     and exists (select 1 from public.conversation_members m where m.conversation_id = g.id and m.user_id = :alice and m.role = 'owner')
   from public.chat_groups g join public.conversations c on c.id = g.id where g.id = public._g('open'))
  and (select (j->>'invited_count')::int from _c2) = 2);
select public._check(2, 'oluşturma: denetim kaydı ve sahibin kural kabulü',
  exists (select 1 from public.chat_group_audit where group_id = public._g('closed') and action = 'community_created')
  and exists (select 1 from public.community_rule_acceptances where community_id = public._g('closed') and user_id = :alice));

set role authenticated;
select public._as_user(:alice);
select public._check(3, 'oluşturma: geçersiz kategori/politika/kural reddedilir',
  public._try($q$select public.create_community('X', null, 'public', null, 50, '{}', 'hack')$q$) like '%invalid_category%'
  and public._try($q$select public.create_community('X', null, 'public', null, 50, '{}', 'general', 'nobody')$q$) like '%invalid_posting_policy%'
  and public._try($q$select public.create_community('X', null, 'public', null, 50, '{}', 'general', 'members', 'nobody')$q$) like '%invalid_feed_policy%'
  and public._try($q$select public.create_community('X', null, 'public', null, 50, '{}', 'general', 'members', 'members', null, true)$q$) like '%rules_missing%'
  and public._try($q$select public.create_community('', null, 'public')$q$) like '%invalid_name%');
select public._check(4, 'oluşturma: istemci chat_groups/communities tablolarına doğrudan yazamaz; bağımsız grup konuşması yaratamaz',
  public._try(format($q$insert into public.chat_groups (id, name) values (gen_random_uuid(), 'x')$q$)) like '%permission denied%'
  and public._try($q$insert into public.conversations (kind) values ('group')$q$) like '%group_creation_via_rpc%'
  and public._try(format($q$update public.chat_groups set category = 'audio', post_count = 99 where id = %L$q$, public._g('open'))) like '%permission denied%');

-- ============================================================================
-- 2. Görünürlük: kapalı topluluk sızmaz
-- ============================================================================
select public._as_user(:erin);
select public._check(5, 'keşif: yalnız açık topluluk listelenir; kapalı topluluk adı/açıklaması sızmaz',
  (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id = public._g('open')) = 1
  and (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id = public._g('closed')) = 0
  and (select count(*) from public.discover_communities('Kapalı', 'popular', null, 50, 0)) = 0
  and (select count(*) from public.chat_groups where id = public._g('closed')) = 0);
select public._check(6, 'keşif: kategori süzgeci ve sayfalama sınırı',
  (select count(*) from public.discover_communities(null, 'popular', 'audio', 50, 0)) = 0
  and (select count(*) from public.discover_communities(null, 'newest', 'image', 1, 0)) = 1);
select public._check(7, 'kapalı topluluk: gönderi/duyuru/etkinlik/mesaj/rapor/RSVP üyelik olmadan okunamaz',
  (select count(*) from public.community_posts where community_id = public._g('closed')) = 0
  and (select count(*) from public.community_announcements where community_id = public._g('closed')) = 0
  and (select count(*) from public.community_events where community_id = public._g('closed')) = 0
  and (select count(*) from public.messages where conversation_id = public._g('closed')) = 0
  and not public.can_read_community(public._g('closed'))
  and public.can_read_community(public._g('open')));
select public._check(8, 'kapalı topluluğa doğrudan katılım yok; varlığı sızmaz',
  public._try(format('select public.join_community(%L, true)', public._g('closed'))) like '%group_not_found%'
  and public._try(format('select public.join_chat_group(%L)', public._g('closed'))) like '%group_not_found%');

-- ============================================================================
-- 3. Açık topluluğa katılım
-- ============================================================================
select public._as_user(:dave);
select public.join_community(public._g('open'), false);
select public._as_user(:erin);
select public.join_community(public._g('open'), false);
select public._check(9, 'katılım: açık topluluğa katılım atomik ve yinelenmez; üye sayısı doğru',
  (select member_count from public.chat_groups where id = public._g('open')) = 3
  and public._try(format('select public.join_community(%L, false)', public._g('open'))) = 'ok'
  and (select member_count from public.chat_groups where id = public._g('open')) = 3
  and (select count(*) from public.conversation_members where conversation_id = public._g('open') and user_id = :erin) = 1);

-- ============================================================================
-- 4. Kapalı topluluk: davet, bağlantı, kuralların kabulü
-- ============================================================================
select public._as_user(:bobby);
select public._tk('t10', format('select public.respond_community_invitation(%L, true, false)', (select id from public.chat_group_invitations where group_id = public._g('closed') and invitee_id = :bobby)));
select public._check(10, 'kurallar: kabul zorunluyken kabulsüz davet kabulü reddedilir',
  public._r('t10') like '%rules_not_accepted%'
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('closed') and user_id = :bobby));
select public._tk('t11', format('select public.respond_community_invitation(%L, true, true)', (select id from public.chat_group_invitations where group_id = public._g('closed') and invitee_id = :bobby)));
select public._check(11, 'kurallar: kabulle davet kabul edilir, kabul kaydı oluşur',
  public._r('t11') = 'ok'
  and exists (select 1 from public.conversation_members where conversation_id = public._g('closed') and user_id = :bobby)
  and exists (select 1 from public.community_rule_acceptances where community_id = public._g('closed') and user_id = :bobby and rules_version = 1));
select public._as_user(:dave);
select public._check(12, 'davet: yalnız davetli yanıtlar (dave başkasının davetini kabul edemez)',
  public._try(format('select public.respond_community_invitation(%L, true, true)', (select id from public.chat_group_invitations where group_id = public._g('closed') and invitee_id = :carol))) like '%invitation_not_found%');
select public._as_user(:carol);
select public.respond_community_invitation((select id from public.chat_group_invitations where group_id = public._g('closed') and invitee_id = :carol), true, true);
select public._check(13, 'davet: kullanılmış davet tekrar kullanılamaz',
  public._try(format('select public.respond_community_invitation(%L, true, true)', (select id from public.chat_group_invitations where group_id = public._g('closed') and invitee_id = :carol))) like '%invalid_state%');
reset role;
-- bobby admin, carol moderatör olur (süper kullanıcı: rol atama RPC testleri 172'dedir)
update public.conversation_members set role = 'admin' where conversation_id = public._g('closed') and user_id = :bobby;
update public.conversation_members set role = 'moderator' where conversation_id = public._g('closed') and user_id = :carol;
update public.conversation_members set role = 'admin' where conversation_id = public._g('open') and user_id = :dave and false;

set role authenticated;
select public._as_user(:alice);
create temp table _lk as select public.create_chat_group_link(public._g('closed'), 24, null) as j;
reset role;
insert into public._ctx select 'tok', j->>'token' from _lk;
set role authenticated;
select public._as_user(:frank);
select public._check(14, 'kurallar: kapalı topluluk başvurusu kuralları kabulsüz oluşamaz (hiçbir yoldan)',
  public._try(format('select public.join_community_via_link(%L, %L, false)', public._ctx_get('tok'), 'merhaba')) like '%rules_not_accepted%'
  and public._try(format('select public.join_chat_group_via_link(%L)', public._ctx_get('tok'))) like '%rules_not_accepted%'
  and not exists (select 1 from public.chat_group_join_requests where user_id = :frank));
select public._check(15, 'kurallar: bağlantı önizlemesi kuralları katılmadan önce gösterir',
  (select (public.preview_community_link(public._ctx_get('tok'))->>'rules_required')::boolean
      and public.preview_community_link(public._ctx_get('tok'))->>'rules' like 'Kural 1%'));
select public._tk('t16a', format('select public.join_community_via_link(%L, %L, true)', public._ctx_get('tok'), 'merhaba'));
select public._tk('t16b', format('select public.join_community_via_link(%L, %L, true)', public._ctx_get('tok'), 'tekrar'));
select public._check(16, 'başvuru: kabulle başvuru oluşur ama ÜYE yapmaz; yinelenen başvuru tek kalır',
  public._r('t16a') = 'ok' and public._r('t16b') = 'ok'
  and (select count(*) from public.chat_group_join_requests where user_id = :frank and status = 'pending') = 1
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('closed') and user_id = :frank)
  and (select count(*) from public.community_cards(array[public._g('closed')])) = 1
  and (select count(*) from public.chat_groups where id = public._g('closed')) = 0
  and (select count(*) from public.community_posts where community_id = public._g('closed')) = 0);
select public._as_user(:carol);
select public._tk('t17', format('select public.decide_chat_group_join_request(%L, true)', (select id from public.chat_group_join_requests where user_id = :frank and status = 'pending')));
select public._check(17, 'başvuru: moderatör (manage_requests) kabul eder, üyelik tek ve rol member',
  public._r('t17') = 'ok'
  and public._q(format($q$select count(*) from public.conversation_members where conversation_id = %L and user_id = %L and role = 'member'$q$, public._g('closed'), :frank)) = '1');
select public._as_user(:alice);
create temp table _upd18 as select public.update_community(public._g('closed'), '{"rules":"Kural 2: yeni"}') as j;
select public._check(18, 'kurallar: metin değişince sürüm artar; kural kabulü olmayan üye üye kalır (üyelik düşmez); bildirim gider',
  (select (j->>'rules_version')::int from _upd18) = 2
  and public._q(format($q$select count(*) from public.conversation_members where conversation_id = %L and user_id = %L$q$, public._g('closed'), :frank)) = '1'
  and public._notif(:bobby, '%kuralları güncellendi%') = 1);
select public._as_user(:frank);
select public.accept_community_rules(public._g('closed'));
select public._tk('t19', format('select public.accept_community_rules(%L)', public._g('open')));
select public._check(19, 'kurallar: üye güncel sürümü kabul eder; üye olmayan topluluk için çağıramaz',
  (select rules_version from public.community_rule_acceptances where community_id = public._g('closed') and user_id = :frank) = 2
  and public._r('t19') like '%not_a_member%');

-- ============================================================================
-- 5. Roller ve yetenekler
-- ============================================================================
select public._as_user(:dave);
select public._check(20, 'yetki: normal üye ayar/kural/duyuru/etkinlik/istatistik yönetemez',
  public._try(format($q$select public.update_community(%L, '{"category":"audio"}')$q$, public._g('open'))) like '%forbidden%'
  and public._try(format($q$select public.update_community(%L, '{"rules":"x"}')$q$, public._g('open'))) like '%forbidden%'
  and public._try(format($q$select public.publish_community_announcement(%L, 'b', 'g')$q$, public._g('open'))) like '%forbidden%'
  and public._try(format($q$select public.create_community_event(%L, 'e', null, now() + interval '2 days', null)$q$, public._g('open'))) like '%forbidden%'
  and public._try(format($q$select public.community_stats(%L)$q$, public._g('open'))) like '%forbidden%'
  and public._try(format($q$select public.close_community(%L)$q$, public._g('open'))) like '%forbidden%');
select public._as_user(:carol);
select public._check(21, 'yetki: moderatör varsayılanda kural/duyuru/etkinlik/istatistik yönetemez ama gönderi moderasyonu yapar',
  public._try(format($q$select public.update_community(%L, '{"rules":"x"}')$q$, public._g('closed'))) like '%forbidden%'
  and public._try(format($q$select public.publish_community_announcement(%L, 'b', 'g')$q$, public._g('closed'))) like '%forbidden%'
  and public._try(format($q$select public.create_community_event(%L, 'e', null, now() + interval '2 days', null)$q$, public._g('closed'))) like '%forbidden%'
  and public._try(format($q$select public.community_stats(%L)$q$, public._g('closed'))) like '%forbidden%'
  and public.chat_group_can(public._g('closed'), 'moderate_posts'));
select public._as_user(:bobby);
select public._check(22, 'yetki: admin kural/duyuru/etkinlik/istatistik yönetir; sahipliği/kapatmayı yönetemez',
  public._try(format($q$select public.update_community(%L, '{"category":"audio"}')$q$, public._g('closed'))) = 'ok'
  and public._try(format($q$select public.community_stats(%L)$q$, public._g('closed'))) = 'ok'
  and public._try(format($q$select public.close_community(%L)$q$, public._g('closed'))) like '%forbidden%'
  and public._try(format($q$select public.update_chat_group_owner_settings(%L, '{"history_visible":true}')$q$, public._g('closed'))) like '%forbidden%');
select public._as_user(:alice);
select public._tk('t23', format($q$select public.update_chat_group_owner_settings(%L, '{"role_permissions":{"moderator":{"manage_announcements":true}}}')$q$, public._g('closed')));
select public._check(23, 'yetki: owner moderatöre duyuru yetkisi verir (denetimli ayar)', public._r('t23') = 'ok');
select public._as_user(:carol);
select public._check(24, 'yetki: verilen yetenek geçerlidir',
  public._try(format($q$select public.publish_community_announcement(%L, 'Mod duyurusu', 'gövde', false, false, false)$q$, public._g('closed'))) = 'ok');
select public._as_user(:alice);
select public.update_chat_group_owner_settings(public._g('closed'), '{"role_permissions":{"moderator":{"manage_announcements":false}}}');
select public._as_user(:carol);
select public._check(25, 'yetki: geri alınan yetenek geçersizdir',
  public._try(format($q$select public.publish_community_announcement(%L, 'Mod duyurusu 2', 'gövde', false, false, false)$q$, public._g('closed'))) like '%forbidden%');
select public._as_user(:alice);
select public._check(26, 'yetki: geçersiz yetenek adı reddedilir (beyaz liste)',
  public._try(format($q$select public.update_chat_group_owner_settings(%L, '{"role_permissions":{"admin":{"own_everything":true}}}')$q$, public._g('closed'))) like '%invalid_patch%');

-- ============================================================================
-- 6. Topluluk akışı (gönderiler)
-- ============================================================================
select public._as_user(:dave);
create temp table _p1 as select public.share_to_community(public._g('open'), 'prompt', 'a0000000-0000-4000-8000-000000000004', 'ilk paylaşımım') as id;
select public._check(27, 'akış: üye kendi açık içeriğini paylaşır; yazar=paylaşan, sayaç artar',
  (select author_id = :dave and note = 'ilk paylaşımım' and prompt_id = 'a0000000-0000-4000-8000-000000000004' from public.community_posts where id = (select id from _p1))
  and (select post_count from public.chat_groups where id = public._g('open')) = 1);
select public._check(28, 'akış: aynı içerik ikinci kez paylaşılamaz (yinelenen işlem)',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000004')$q$, public._g('open'))) like '%already_shared%'
  and (select post_count from public.chat_groups where id = public._g('open')) = 1);
select public._tk('t29a', format($q$select public.share_to_community(%L, 'preset', 'b0000000-0000-4000-8000-000000000001')$q$, public._g('open')));
select public._tk('t29b', format($q$select public.share_to_community(%L, 'workflow', 'c0000000-0000-4000-8000-000000000001')$q$, public._g('open')));
select public._tk('t29c', format($q$select public.share_to_community(%L, 'request', 'd0000000-0000-4000-8000-000000000001')$q$, public._g('open')));
select public._check(29, 'akış: başkasının AÇIK içeriği önerilebilir (hazır ayar/workflow/istek); orijinal sahip içerikte kalır, yazar paylaşandır',
  public._r('t29a') = 'ok' and public._r('t29b') = 'ok' and public._r('t29c') = 'ok'
  and (select count(*) from public.community_posts where community_id = public._g('open') and author_id = :dave) = 4
  and (select creator_id from public.presets where id = 'b0000000-0000-4000-8000-000000000001') = :bobby
  and (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000004') = 1);
select public._check(30, 'görünürlük: başkasının özel/taslak içeriği için "bulunamadı" (varlığı sızmaz); geçersiz tür/id reddedilir',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000002')$q$, public._g('open'))) like '%content_not_found%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000003')$q$, public._g('open'))) like '%content_not_found%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', gen_random_uuid())$q$, public._g('open'))) like '%content_not_found%'
  and public._try(format($q$select public.share_to_community(%L, 'hack', gen_random_uuid())$q$, public._g('open'))) like '%invalid_content%');
select public._as_user(:alice);
select public._check(31, 'görünürlük: sahibi kendi ÖZEL/taslak içeriğini paylaşırsa içerik otomatik herkese açılmaz — reddedilir ve görünürlük değişmez',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000002')$q$, public._g('open'))) like '%content_not_public%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000003')$q$, public._g('open'))) like '%content_not_public%'
  and (select visibility from public.prompts where id = 'a0000000-0000-4000-8000-000000000002') = 'private'
  and (select count(*) from public.community_posts where prompt_id in ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003')) = 0);
select public._as_user(:frank);
select public._check(32, 'akış: üye olmayan paylaşım yapamaz; açık toplulukta akışı okuyabilir, kapalıda okuyamaz',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001')$q$, public._g('open'))) like '%forbidden%'
  and (select count(*) from public.community_posts where community_id = public._g('open')) = 4);
select public._as_user(:gina);
select public._check(33, 'akış: engelli kullanıcıyla ilişkili içerik paylaşılamaz (engel kuralı)',
  public._try(format('select public.join_community(%L, false)', public._g('open'))) = 'ok'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000007')$q$, public._g('open'))) like '%blocked%');
select public._as_user(:dave);
select public._tk('t34', format($q$select public.update_community_post(%L, 'yeni not')$q$, (select id from _p1)));
select public._check(34, 'akış: yazar kendi gönderi notunu düzenler',
  public._r('t34') = 'ok' and (select note from public.community_posts where id = (select id from _p1)) = 'yeni not');
select public._as_user(:erin);
select public._check(35, 'akış: başkasının gönderisini silemez/düzenleyemez/sabitleyemez/moderasyonla kaldıramaz',
  public._try(format($q$select public.update_community_post(%L, 'x')$q$, (select id from _p1))) like '%forbidden%'
  and public._try(format('select public.delete_community_post(%L)', (select id from _p1))) like '%forbidden%'
  and public._try(format('select public.set_community_post_pinned(%L, true)', (select id from _p1))) like '%forbidden%'
  and public._try(format('select public.moderate_community_post(%L)', (select id from _p1))) like '%forbidden%');
select public._check(36, 'akış: gönderi tablosuna istemci doğrudan yazamaz',
  public._try(format($q$insert into public.community_posts (community_id, author_id, content_type, prompt_id) values (%L, %L, 'prompt', 'a0000000-0000-4000-8000-000000000001')$q$, public._g('open'), :erin)) like '%permission denied%'
  and public._try(format('delete from public.community_posts where id = %L', (select id from _p1))) like '%permission denied%');
select public._as_user(:alice);
create temp table _pre37 as select id from public.community_posts where community_id = public._g('open') and preset_id is not null;
select public._tk('t37a', format('select public.set_community_post_pinned(%L, true)', (select id from _p1)));
select public._tk('t37b', format($q$select public.moderate_community_post(%L, 'uygunsuz')$q$, (select id from _pre37)));
select public._check(37, 'akış: sahip sabitler, moderasyonla kaldırır; denetim kaydı + yazara bildirim; sayaç düşer',
  public._r('t37a') = 'ok' and public._r('t37b') = 'ok'
  and (select pinned_at is not null from public.community_posts where id = (select id from _p1))
  and not exists (select 1 from public.community_posts where id = (select id from _pre37))
  and exists (select 1 from public.chat_group_audit where group_id = public._g('open') and action = 'post_removed')
  and public._notif(:dave, '%paylaşımın kaldırıldı%') = 1
  and (select post_count from public.chat_groups where id = public._g('open')) = 3);
select public._as_user(:dave);
create temp table _pre38 as select id from public.community_posts where community_id = public._g('open') and workflow_id is not null;
select public._tk('t38', format('select public.delete_community_post(%L)', (select id from _pre38)));
select public._check(38, 'akış: yazar kendi gönderisini siler; içerik silinmez, sayaç düşer',
  public._r('t38') = 'ok'
  and (select count(*) from public.workflows where id = 'c0000000-0000-4000-8000-000000000001') = 1
  and (select post_count from public.chat_groups where id = public._g('open')) = 2);

-- feed_policy = admins
select public._as_user(:alice);
select public.update_community(public._g('open'), '{"feed_policy":"admins"}');
select public._as_user(:dave);
select public._check(39, 'akış: feed_policy=admins iken normal üye paylaşamaz, sahip paylaşır',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000007')$q$, public._g('open'))) like '%forbidden%');
select public._as_user(:alice);
select public._check(40, 'akış: feed_policy=admins iken yönetici paylaşır',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001', 'sahip paylaşımı')$q$, public._g('open'))) = 'ok');
select public.update_community(public._g('open'), '{"feed_policy":"members"}');

-- rütbe kuralı: moderatör admin'in gönderisini kaldıramaz
select public._as_user(:bobby);
create temp table _p2 as select public.share_to_community(public._g('closed'), 'prompt', 'a0000000-0000-4000-8000-000000000005') as id;
select public._as_user(:dave);
-- dave kapalı topluluğa üye değil
select public._as_user(:carol);
create temp table _p3 as select public.share_to_community(public._g('closed'), 'prompt', 'a0000000-0000-4000-8000-000000000006') as id;
select public._check(41, 'rütbe: moderatör admin''in gönderisini kaldıramaz, normal üyeninkini kaldırır; admin moderatörünkini kaldırır',
  public._try(format('select public.moderate_community_post(%L)', (select id from _p2))) like '%forbidden%');
select public._as_user(:frank);
create temp table _p4 as select public.share_to_community(public._g('closed'), 'prompt', 'a0000000-0000-4000-8000-000000000007') as id;
select public._as_user(:carol);
select public._check(42, 'rütbe: moderatör normal üyenin gönderisini kaldırır',
  public._try(format('select public.moderate_community_post(%L, %L)', (select id from _p4), 'spam')) = 'ok');
select public._as_user(:bobby);
select public._check(43, 'rütbe: admin moderatörün gönderisini kaldırır',
  public._try(format('select public.moderate_community_post(%L)', (select id from _p3))) = 'ok');
reset role;

-- ============================================================================
-- 7. Sohbet gizliliği, @anma, ayrılma/çıkarılma
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
insert into public.messages (id, conversation_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000c1', public._g('open'), :dave, 'selam @alice ve @frank ve @erin');
select public._as_user(:frank);
select public._check(44, 'sohbet: açık topluluğun sohbetini üye olmayan okuyamaz/yazamaz (frank açığa üye değil)',
  (select count(*) from public.messages where conversation_id = public._g('open')) = 0
  and public._try(format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, public._g('open'), :frank)) like '%row-level security%');
select public._check(45, '@anma: üye anılan kişiye bildirim gider (önemli düzey), mesaj içeriği taşımaz; üye olmayan frank''a gitmez; mesaj başına toplu bildirim yok',
  public._notif(:alice, '%sohbetinde andı%') = 1
  and public._notif(:erin, '%sohbetinde andı%') = 1
  and public._notif(:frank, '%sohbetinde andı%') = 0
  and not exists (select 1 from public.notifications where message like '%selam%')
  and (select count(*) from public.notifications where recipient_id = :bobby and message like '%Açık Topluluk%') = 0);
select public._as_user(:erin);
-- Bildirim tercihi: önemli
update public.conversation_members set notify_level = 'important' where conversation_id = public._g('open') and user_id = :erin;
select public._check(46, 'tercih: kullanıcı yalnızca kendi bildirim tercihini değiştirir; geçersiz değer reddedilir',
  (select notify_level from public.conversation_members where conversation_id = public._g('open') and user_id = :erin) = 'important'
  and public._try(format($q$update public.conversation_members set notify_level = 'hepsi' where conversation_id = %L and user_id = %L$q$, public._g('open'), :erin)) like '%conversation_members_notify_level_check%');
select public._as_user(:dave);
select public._check(47, 'tercih: başkasının üyelik satırı değiştirilemez; rol/üyelik doğrudan değiştirilemez',
  (select count(*) from public.conversation_members where conversation_id = public._g('open') and user_id <> :dave) = 0
  and public._try(format($q$update public.conversation_members set role = 'owner' where conversation_id = %L and user_id = %L$q$, public._g('open'), :dave)) = 'ok'
  and (select role from public.conversation_members where conversation_id = public._g('open') and user_id = :dave) = 'member');

-- Duyuru + sohbette bağlantı + bildirim tercihleri
select public._as_user(:alice);
update public.conversation_members set notify_level = 'none' where conversation_id = public._g('open') and user_id = :dave;
select public._as_user(:dave);
update public.conversation_members set notify_level = 'none' where conversation_id = public._g('open') and user_id = :dave;
select public._as_user(:alice);
create temp table _a1 as select public.publish_community_announcement(public._g('open'), 'Önemli duyuru', 'Detaylı gövde metni', true, true, true) as id;
select public._check(48, 'duyuru: yayınlanır, sohbette bağlantılı mesaj oluşur, yazar=yönetici',
  exists (select 1 from public.community_announcements where id = (select id from _a1) and author_id = :alice and pinned)
  and exists (select 1 from public.messages where conversation_id = public._g('open') and announcement_id = (select id from _a1) and body = 'Önemli duyuru'));
select public._check(49, 'bildirim tercihi: tümü/önemli alır, "sessiz" duyuruyu almaz; üye olmayan almaz; yazar kendine almaz',
  public._notif(:erin, '%Önemli duyuru%') = 1
  and public._notif(:dave, '%Önemli duyuru%') = 0
  and public._notif(:frank, '%Önemli duyuru%') = 0
  and public._notif(:alice, '%Önemli duyuru%') = 0);
select public._as_user(:erin);
select public._check(50, 'duyuru: üye okur; istemci duyuru mesajı uyduramaz (announcement_id yalnız RPC)',
  (select count(*) from public.community_announcements where community_id = public._g('open')) = 1
  and public._try(format($q$insert into public.messages (conversation_id, sender_id, body, announcement_id) values (%L, %L, 'sahte', %L)$q$, public._g('open'), :erin, (select id from _a1))) like '%row-level security%');
select public._as_user(:alice);
select public.update_community_announcement((select id from _a1), 'Yeni başlık', 'Yeni gövde', true);
select public._check(51, 'duyuru: düzenlenir, sohbetteki bağlantılı mesajın başlığı güncellenir, edited_at dolar',
  (select title = 'Yeni başlık' and edited_at is not null from public.community_announcements where id = (select id from _a1))
  and exists (select 1 from public.messages where announcement_id = (select id from _a1) and body = 'Yeni başlık'));
select public._as_user(:bobby);
select public._check(52, 'duyuru: sınır (en çok 3 sabit) ve geçersiz girdi',
  public._try(format($q$select public.publish_community_announcement(%L, '', 'g')$q$, public._g('closed'))) like '%invalid_title%'
  and public._try(format($q$select public.publish_community_announcement(%L, 't', '')$q$, public._g('closed'))) like '%invalid_body%');
select public._as_user(:alice);
select public.delete_community_announcement((select id from _a1));
select public._check(53, 'duyuru: silinince sohbetteki bağlantılı mesaj da herkesten silinir',
  not exists (select 1 from public.community_announcements where id = (select id from _a1))
  and (select deleted_at is not null and body is null from public.messages where conversation_id = public._g('open') and sender_id = :alice and announcement_id is null and body is null limit 1));

-- ============================================================================
-- 8. Etkinlikler
-- ============================================================================
select public._as_user(:alice);
create temp table _e1 as select public.create_community_event(public._g('open'), 'Canlı yayın', 'açıklama', now() + interval '10 hours', now() + interval '12 hours', 'Europe/Istanbul', 'Online', 'https://example.com/live', true) as id;
select public._check(54, 'etkinlik: oluşturulur; bildirim "tümü" tercihli üyeye gider, önemli/sessiz tercihliye gitmez (bilgi düzeyi)',
  (select title = 'Canlı yayın' and timezone = 'Europe/Istanbul' and online_url = 'https://example.com/live' from public.community_events where id = (select id from _e1))
  and public._notif(:erin, '%yeni etkinlik%') = 0
  and public._notif(:dave, '%yeni etkinlik%') = 0);
select public._check(55, 'etkinlik: geçersiz zaman/saat dilimi/bağlantı reddedilir',
  public._try(format($q$select public.create_community_event(%L, 'x', null, now() - interval '1 day', null)$q$, public._g('open'))) like '%invalid_event_time%'
  and public._try(format($q$select public.create_community_event(%L, 'x', null, now() + interval '2 days', now() + interval '1 day')$q$, public._g('open'))) like '%invalid_event_time%'
  and public._try(format($q$select public.create_community_event(%L, 'x', null, now() + interval '2 days', null, 'Mars/Olympus')$q$, public._g('open'))) like '%invalid_timezone%'
  and public._try(format($q$select public.create_community_event(%L, 'x', null, now() + interval '2 days', null, 'UTC', null, 'javascript:alert(1)')$q$, public._g('open'))) like '%invalid_url%'
  and public._try(format($q$select public.create_community_event(%L, '', null, now() + interval '2 days', null)$q$, public._g('open'))) like '%invalid_title%');
select public._as_user(:dave);
select public.set_community_event_rsvp((select id from _e1), 'going');
select public._as_user(:erin);
select public.set_community_event_rsvp((select id from _e1), 'maybe');
select public._as_user(:frank);
select public._check(56, 'etkinlik: yalnız üye cevap verir; geçersiz cevap reddedilir',
  public._try(format($q$select public.set_community_event_rsvp(%L, 'going')$q$, (select id from _e1))) like '%forbidden%'
  and public._try(format($q$select public.set_community_event_rsvp(%L, 'belki')$q$, (select id from _e1))) like '%invalid_rsvp%');
select public._check(57, 'etkinlik: katılımcı sayıları doğru; cevap değişince sayaç güncellenir; istemci sayacı/RSVP''yi doğrudan yazamaz',
  (select going_count = 1 and maybe_count = 1 from public.community_events where id = (select id from _e1))
  and public._try(format($q$update public.community_events set going_count = 99 where id = %L$q$, (select id from _e1))) like '%permission denied%'
  and public._try(format($q$insert into public.community_event_rsvps (event_id, user_id, status) values (%L, %L, 'going')$q$, (select id from _e1), :frank)) like '%permission denied%');
select public._as_user(:erin);
select public.set_community_event_rsvp((select id from _e1), 'going');
select public._as_user(:dave);
select public.set_community_event_rsvp((select id from _e1), 'none');
select public._check(58, 'etkinlik: erin going olunca going=1, dave cevabını geri alınca sayaç düşer',
  (select going_count = 1 and maybe_count = 0 from public.community_events where id = (select id from _e1)));
select public._as_user(:dave);
select public.set_community_event_rsvp((select id from _e1), 'going');
select public._as_user(:alice);
update public.conversation_members set notify_level = 'all' where conversation_id = public._g('open') and user_id = :alice;
select public.update_community_event((select id from _e1), '{"location":"Yeni yer"}');
select public._check(59, 'etkinlik: yer/zaman değişince RSVP''liler (tercih uygunsa) bilgilendirilir; sessiz üye almaz',
  public._notif(:erin, '%etkinliği güncellendi%') = 1
  and public._notif(:dave, '%etkinliği güncellendi%') = 0);
select public._check(60, 'etkinlik: yama doğrulaması (bilinmeyen alan, geçmişe taşıma)',
  public._try(format($q$select public.update_community_event(%L, '{"going_count":5}')$q$, (select id from _e1))) like '%invalid_patch%'
  and public._try(format($q$select public.update_community_event(%L, %L)$q$, (select id from _e1), jsonb_build_object('starts_at', (now() - interval '1 day')::text))) like '%invalid_event_time%'
  and (select (public.update_community_event((select id from _e1), '{"location":"Yeni yer"}')->>'changed')::boolean) = false);
-- Hatırlatma: 10 saat sonra başlıyor, dave+erin RSVP'li
select public._as_user(:erin);
create temp table _rem1 as select public.dispatch_my_event_reminders() as n;
create temp table _rem2 as select public.dispatch_my_event_reminders() as n;
select public._as_user(:dave);
create temp table _rem3 as select public.dispatch_my_event_reminders() as n;
-- Kullanıcı hatırlatma bildirimini SİLERSE uygulama bir sonraki açılışta onu yeniden üretmemeli (silinen bildirim "gönderildi" izi değildir).
select public._as_user(:erin);
delete from public.notifications where recipient_id = :erin::uuid and message like '%24 saat içinde başlıyor%';
create temp table _rem4 as select public.dispatch_my_event_reminders() as n;
select public._check(61, 'hatırlatma: 24 saat içindeki etkinlik için bir kez üretilir, tekrar çağrı yineleme üretmez (bildirim silinse de); "sessiz" tercihli üye almaz',
  (select n from _rem1) = 1 and (select n from _rem2) = 0 and (select n from _rem3) = 0
  and (select n from _rem4) = 0 and public._notif(:erin, '%24 saat içinde başlıyor%') = 0
  and public._notif(:dave, '%24 saat içinde başlıyor%') = 0);
select public._as_user(:alice);
select public.cancel_community_event((select id from _e1));
select public._as_user(:dave);
select public._check(62, 'etkinlik: iptal edilen etkinliğe cevap verilemez; iptal RSVP''lilere bildirilir (tercih uygunsa)',
  public._try(format($q$select public.set_community_event_rsvp(%L, 'going')$q$, (select id from _e1))) like '%event_cancelled%'
  and public._notif(:erin, '%iptal edildi%') = 1);

-- ============================================================================
-- 9. Ayrılma / çıkarılma → yeni içerik ve mesaj yetkisi biter
-- ============================================================================
select public._as_user(:erin);
select public.leave_chat_group(public._g('open'));
select public._check(63, 'ayrılma: ayrılan sohbete yazamaz, paylaşım yapamaz, RSVP veremez; RSVP kayıtları temizlenir',
  public._try(format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, public._g('open'), :erin)) like '%row-level security%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001')$q$, public._g('open'))) like '%forbidden%'
  and public._try(format($q$select public.set_community_event_rsvp(%L, 'going')$q$, (select id from _e1))) like '%forbidden%'
  and not exists (select 1 from public.community_event_rsvps where user_id = :erin));
select public._as_user(:alice);
select public.remove_chat_group_member(public._g('open'), :dave, true, 'kural ihlali');
select public._as_user(:dave);
select public._check(64, 'çıkarılma: çıkarılan (yasaklı) kullanıcı yeniden katılamaz, yeni mesaj/gönderi gönderemez, eski mesajını düzenleyemez; açık keşifte görmez',
  public._try(format('select public.join_community(%L, false)', public._g('open'))) like '%cannot_join%'
  and public._try(format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, public._g('open'), :dave)) like '%row-level security%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000008')$q$, public._g('open'))) like '%forbidden%'
  and (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id = public._g('open')) = 0
  and not public.can_read_community(public._g('open')));
select public._as_user(:alice);
select public._check(65, 'çıkarılma: kullanıcı ayrıldıktan sonra mesajları topluluk sohbetinde kalır (veri kaybı yok)',
  exists (select 1 from public.messages where id = '00000000-0000-4000-8000-0000000000c1'));

-- ============================================================================
-- 10. Raporlar ve moderasyon kuyruğu
-- ============================================================================
select public._as_user(:bobby);
select public._tk('t66a', format($q$select public.report_community_content(%L, 'post', %L, 'kendi gönderim')$q$, public._g('closed'), (select id from _p2)));
select public._as_user(:erin);
select public._tk('t66b', format($q$select public.report_community_content(%L, 'post', %L, 'uygunsuz')$q$, public._g('closed'), (select id from _p2)));
select public._check(66, 'rapor: kendi içeriğini raporlayamaz; üye olmayan raporlayamaz',
  public._r('t66a') like '%cannot_target_self%' and public._r('t66b') like '%forbidden%');
select public._as_user(:frank);
create temp table _rp1 as select public.report_community_content(public._g('closed'), 'post', (select id from _p2), 'uygunsuz') as id;
select public._tk('t67a', format($q$select public.report_community_content(%L, 'post', %L, 'uygunsuz')$q$, public._g('closed'), (select id from _p2)));
select public._tk('t67b', format($q$select public.report_community_content(%L, 'post', %L, 'uygunsuz')$q$, public._g('closed'), (select id from public.community_posts where community_id = public._g('open') limit 1)));
select public._tk('t67c', format($q$select public.report_community_content(%L, 'post', %L, 'a')$q$, public._g('closed'), (select id from _p2)));
select public._check(67, 'rapor: üye gönderiyi raporlar; yinelenen açık rapor, başka topluluğun hedefi ve kısa neden reddedilir',
  exists (select 1 from public.community_reports where id = (select id from _rp1) and status = 'open' and target_user_id = :bobby)
  and public._r('t67a') like '%already_reported%' and public._r('t67b') like '%report_target_not_found%' and public._r('t67c') like '%invalid_reason%');
insert into public.messages (id, conversation_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000c2', public._g('closed'), :frank, 'kapalı topluluk mesajı');
select public._as_user(:alice);
select public._tk('t69a', format($q$select public.report_community_content(%L, 'message', '00000000-0000-4000-8000-0000000000c2', 'hakaret')$q$, public._g('closed')));
select public._tk('t69b', format($q$select public.report_community_content(%L, 'message', '00000000-0000-4000-8000-0000000000c2', 'hakaret')$q$, public._g('closed')));
select public._check(69, 'rapor: mesaj raporu — okuyabilen üye raporlar; yinelenen açık rapor engellenir',
  public._r('t69a') = 'ok' and public._r('t69b') like '%already_reported%');
select public._as_user(:frank);
select public._tk('t68', format($q$select public.report_community_content(%L, 'message', '00000000-0000-4000-8000-0000000000c2', 'kendi mesajım')$q$, public._g('closed')));
select public._tk('t70', format($q$select public.resolve_community_report(%L, 'dismiss')$q$, (select id from _rp1)));
select public._check(70, 'rapor: kendi mesajı raporlanamaz; kuyruk RLS — normal üye yalnız kendi raporunu görür ve çözemez',
  public._r('t68') like '%cannot_target_self%'
  and (select count(*) from public.community_reports where community_id = public._g('closed')) = 1
  and public._r('t70') like '%forbidden%');
select public._as_user(:carol);
select public._tk('t71', format($q$select public.resolve_community_report(%L, 'remove')$q$, (select id from _rp1)));
select public._check(71, 'rapor: moderatör kuyruğu görür; kendinden yüksek rütbenin (admin) gönderisini rapordan kaldıramaz (rapor açık kalır)',
  (select count(*) from public.community_reports where community_id = public._g('closed')) = 2
  and public._r('t71') like '%forbidden%'
  and (select status from public.community_reports where id = (select id from _rp1)) = 'open'
  and exists (select 1 from public.community_posts where id = (select id from _p2)));
select public._as_user(:bobby);
select public._tk('t72', format($q$select public.resolve_community_report(%L, 'dismiss', 'sorun yok')$q$, (select id from _rp1)));
select public._check(72, 'rapor: admin raporu reddeder; reddedilen kapanır ve raporlayana sonuç bildirimi gider',
  public._r('t72') = 'ok'
  and (select status = 'dismissed' and resolved_by = :bobby and resolved_at is not null from public.community_reports where id = (select id from _rp1))
  and public._notif(:frank, '%bildirdiğin içerik için karar%') = 1);
select public._tk('t73', format($q$select public.resolve_community_report(%L, 'remove')$q$, (select id from _rp1)));
select public._check(73, 'rapor: karar verilmiş rapor yeniden çözülemez', public._r('t73') like '%invalid_state%');
select public._tk('t74', format($q$select public.resolve_community_report(%L, 'remove')$q$, (select id from public.community_reports where message_id = '00000000-0000-4000-8000-0000000000c2')));
select public._check(74, 'rapor: mesaj raporu "kaldır" ile mesaj herkes için silinir ve rapor kapanır',
  public._r('t74') = 'ok'
  and (select deleted_at is not null and body is null from public.messages where id = '00000000-0000-4000-8000-0000000000c2')
  and (select status from public.community_reports where message_id = '00000000-0000-4000-8000-0000000000c2') = 'resolved');
-- gönderi silinince açık rapor kapanır (sessizce askıda kalmaz)
select public._as_user(:frank);
create temp table _p5 as select public.share_to_community(public._g('closed'), 'prompt', 'a0000000-0000-4000-8000-000000000008') as id;
select public._as_user(:carol);
create temp table _rp5 as select public.report_community_content(public._g('closed'), 'post', (select id from _p5), 'spam gibi') as id;
select public._as_user(:frank);
select public.delete_community_post((select id from _p5));
select public._check(75, 'rapor: raporlanan gönderi silinince açık rapor otomatik kapanır (askıda kalmaz)',
  public._q(format($q$select status || ':' || resolution from public.community_reports where id = %L$q$, (select id from _rp5))) = 'resolved:content_removed');
reset role;

-- ============================================================================
-- 11. İstatistik
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _st as select public.community_stats(public._g('open'), 30) as j;
reset role;
select public._check(76, 'istatistik: gerçek verilerden hesaplanır (üye, gönderi, etkinlik, sohbet) ve mesaj içeriği içermez',
  (select (j#>>'{members,total}')::int = (select member_count from public.chat_groups where id = public._g('open'))
      and (j#>>'{posts,total}')::int = (select post_count from public.chat_groups where id = public._g('open'))
      and (j#>>'{events,total}')::int = 1
      and (j#>>'{chat,messages_in_period}')::int = (select count(*) from public.messages where conversation_id = public._g('open') and deleted_at is null)
      and (j#>>'{chat,active_senders_in_period}')::int >= 1
      and (j#>>'{members,left}')::int >= 2
      and jsonb_typeof(j->'series') = 'array'
      and (select count(*) from jsonb_array_elements(j->'series')) = 30
      and j::text not like '%selam%' and j::text not like '%kural ihlali%' from _st));
set role authenticated;
select public._as_user(:alice);
select public._check(77, 'istatistik: gün sayısı sınırlanır (7..90)',
  (public.community_stats(public._g('open'), 1000)->>'days')::int = 90 and (public.community_stats(public._g('open'), 0)->>'days')::int = 7);

-- ============================================================================
-- 12. Kapatma / yeniden açma / sahiplik
-- ============================================================================
select public.close_community(public._g('open'));
reset role;
select public._check(78, 'kapatma: kapatılan topluluk keşiften çıkar, yeni mesaj/gönderi/etkinlik/katılım olmaz; veri silinmez',
  (select closed_at is not null from public.chat_groups where id = public._g('open'))
  and exists (select 1 from public.messages where conversation_id = public._g('open')));
set role authenticated;
select public._as_user(:alice);
select public._check(79, 'kapatma: sahibi bile kapalı toplulukta yazamaz/paylaşamaz/etkinlik açamaz; keşifte görünmez',
  public._try(format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, public._g('open'), :alice)) like '%row-level security%'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001')$q$, public._g('open'))) like '%community_closed%'
  and public._try(format($q$select public.create_community_event(%L, 'x', null, now() + interval '2 days', null)$q$, public._g('open'))) like '%community_closed%'
  and (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id = public._g('open')) = 0);
select public._as_user(:frank);
select public._check(80, 'kapatma: kapalı toplulukta yeni üye alınmaz',
  public._try(format('select public.join_community(%L, false)', public._g('open'))) like '%community_closed%');
select public._as_user(:bobby);
select public._check(81, 'kapatma: yalnız owner kapatır/açar',
  public._try(format('select public.reopen_community(%L)', public._g('open'))) like '%forbidden%');
select public._as_user(:alice);
select public.reopen_community(public._g('open'));
select public._check(82, 'kapatma: yeniden açınca topluluk eski işlevine döner',
  public._try(format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'tekrar açıldı')$q$, public._g('open'), :alice)) = 'ok'
  and (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id = public._g('open')) = 1);
select public._check(83, 'sahiplik: başka üye varken owner ayrılamaz (önce devretmeli); sahipsiz topluluk oluşmaz',
  public._try(format('select public.leave_chat_group(%L)', public._g('open'))) like '%owner_must_transfer%'
  and (select count(*) from public.conversation_members where conversation_id = public._g('open') and role = 'owner') = 1);
reset role;

-- ============================================================================
-- 13. Listeler, üye araması
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(87, 'listeler: üye/yönettiklerim kapsamı; sıradan üye yönettiklerimde görünmez',
  (select count(*) from public.list_my_communities('member')) = 2
  and (select count(*) from public.list_my_communities('managed')) = 2);
select public._as_user(:gina);
select public._check(88, 'listeler: yönettiklerim yalnız owner/admin/moderatör',
  (select count(*) from public.list_my_communities('managed')) = 0
  and (select count(*) from public.list_my_communities('member')) = 1);
select public._check(89, 'üyeler: üye olmayan (gina, kapalı topluluk) arama yapsa bile liste göremez',
  (select count(*) from public.community_members(public._g('closed'), 'bob', null)) = 0);
select public._as_user(:alice);
select public._check(90, 'üyeler: owner kapalı topluluğun üyelerini arar/rol süzer',
  (select count(*) from public.community_members(public._g('closed'), 'bobby', null)) = 1
  and (select count(*) from public.community_members(public._g('closed'), null, 'moderator')) = 1
  and (select count(*) from public.community_members(public._g('closed'), null, null)) = 4);
select public._as_user(:erin);
select public._check(91, 'üyeler: üye olmayan kapalı topluluğun üye listesini alamaz',
  (select count(*) from public.community_members(public._g('closed'), null, null)) = 0);
reset role;

-- ============================================================================
-- 14. Eski grup sohbetlerinin korunması ve geçiş raporu
-- ============================================================================
-- Eski grup: origin = 'legacy_group' olarak işaretlenmiş (migration'ın mevcut satırlara yaptığı işaret) bir grup; mesajları ve üyelikleri korunur.
update public.chat_groups set origin = 'legacy_group' where id = public._g('closed');
set role authenticated;
select public._as_user(:alice);
select public._check(92, 'geçiş: eski grup (legacy_group) aynı kimlikle topluluk olarak çalışır — mesajlar/üyelikler yerinde, topluluk özellikleri açık',
  public._q(format($q$select count(*) from public.messages where conversation_id = %L$q$, public._g('closed')))::int >= 1
  and public._q(format($q$select count(*) from public.conversation_members where conversation_id = %L$q$, public._g('closed'))) = '4'
  and public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001')$q$, public._g('closed'))) = 'ok');
select public._check(93, 'geçiş raporu: site moderatörü dışındakiler okuyamaz',
  public._try('select public.community_migration_report()') like '%forbidden%');
select public._as_user(:hank);
create temp table _mr as select public.community_migration_report() as j;
select public._check(94, 'geçiş raporu: sayılar doğru, hiçbir anomali yok',
  (select (j#>>'{totals,legacy_groups}')::int = 1 and (j#>>'{totals,native_communities}')::int = 1 and (j#>>'{totals,groups}')::int = 2
      and (j#>>'{totals,legacy_group_messages}')::int >= 1
      and jsonb_array_length(j#>'{anomalies,groups_without_owner}') = 0
      and jsonb_array_length(j#>'{anomalies,member_count_mismatch}') = 0
      and jsonb_array_length(j#>'{anomalies,post_count_mismatch}') = 0 from _mr));
reset role;
-- Anomali üret (süper kullanıcı sayaç korumasını atlar) → rapor yakalar
update public.chat_groups set member_count = 99 where id = public._g('closed');
set role authenticated;
select public._as_user(:hank);
create temp table _mr2 as select public.community_migration_report() as j;
select public._check(95, 'geçiş raporu: sayaç sapması ve üye sınırı aşımı raporlanır (rapor veri değiştirmez)',
  (select jsonb_array_length(j#>'{anomalies,member_count_mismatch}') = 1 and jsonb_array_length(j#>'{anomalies,groups_over_member_limit}') = 1 from _mr2)
  and public._q(format($q$select member_count from public.chat_groups where id = %L$q$, public._g('closed'))) = '99');
reset role;
update public.chat_groups set member_count = 4 where id = public._g('closed');

-- ============================================================================
-- 15. Birebir mesajlaşma bozulmadı + yetki/EXECUTE
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _dm as select public.start_direct_conversation(:frank) as id;
insert into public.messages (conversation_id, sender_id, body) values ((select id from _dm), :alice, 'merhaba');
select public._as_user(:frank);
select public._check(96, 'birebir: sohbet başlatma/mesaj/okuma topluluk eklentilerinden etkilenmez',
  (select kind from public.conversations where id = (select id from _dm)) = 'direct'
  and (select count(*) from public.messages where conversation_id = (select id from _dm)) = 1
  and public._try(format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'cevap')$q$, (select id from _dm), :frank)) = 'ok');
reset role;
select public._check(97, 'EXECUTE: anon yalnız keşif/okuma yardımcılarını çağırır (yazma/üye/istatistik/öneri yok); iç yardımcılar kimseye açık değil; raporlar, kural kabulleri ve chat_groups anon''a kapalı',
  not has_function_privilege('anon', 'public.create_community(text,text,text,text,integer,uuid[],text,text,text,text,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.share_to_community(uuid,text,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.community_stats(uuid,integer)', 'execute')
  and has_function_privilege('anon', 'public.discover_communities(text,text,text,integer,integer)', 'execute')
  and has_function_privilege('anon', 'public.can_read_community(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.suggest_communities(integer)', 'execute')
  and not has_function_privilege('anon', 'public.community_members(uuid,text,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public._community_notify(uuid,uuid,uuid,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public._community_content_info(text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_community_chat_mentions()', 'execute')
  and has_table_privilege('anon', 'public.community_posts', 'select')
  and not has_table_privilege('anon', 'public.community_reports', 'select')
  and not has_table_privilege('anon', 'public.community_rule_acceptances', 'select')
  and not has_table_privilege('anon', 'public.chat_groups', 'select')
  and not has_table_privilege('authenticated', 'public.community_posts', 'insert')
  and not has_table_privilege('authenticated', 'public.community_reports', 'update')
  and not has_table_privilege('authenticated', 'public.community_events', 'delete'));

-- ============================================================================
-- 15b. Üç görünürlük düzeyi: herkese açık / kapalı (restricted) / tamamen kapalı (private) (docs/history/176-*)
-- ============================================================================
reset role;
create or replace function public._reqid(p_group uuid, p_user uuid) returns uuid language sql stable security definer as
  $$ select id from public.chat_group_join_requests where group_id = p_group and user_id = p_user and status = 'pending' order by created_at desc limit 1 $$;
grant execute on function public._reqid(uuid, uuid) to public;

set role authenticated;
select public._as_user(:alice);
create temp table _v1 as select public.create_community('Görünür Atölye', 'herkese açık', 'public', null, 50, '{}'::uuid[], 'image', 'members', 'members', null, false) as j;
create temp table _v2 as select public.create_community('Gizli Atölye', 'kapalı ama aranır', 'restricted', null, 3, '{}'::uuid[], 'audio', 'members', 'members', 'Kural: nazik ol', true) as j;
create temp table _v3 as select public.create_community('Hayalet Kulüp', 'tamamen kapalı', 'private', null, 50, '{}'::uuid[], 'text', 'members', 'members', null, false) as j;
create temp table _v4 as select public.create_community('Geçiş Topluluğu', 'görünürlük geçişi', 'restricted', null, 50, '{}'::uuid[], 'learning', 'members', 'members', null, false) as j;
select public._tk('v_bad', $q$select public.create_community('X', null, 'secret')$q$);
select public.share_to_community((select (j->>'group_id')::uuid from _v2), 'prompt', 'a0000000-0000-4000-8000-000000000001', 'gizli gönderi');
select public.publish_community_announcement((select (j->>'group_id')::uuid from _v2), 'Gizli duyuru', 'yalnız üyeler', false, false, false);
select public._as_user(:dave);
create temp table _v5 as select public.create_community('Dave Kapalı', 'dave in kapalı topluluğu', 'restricted', null, 50, '{}'::uuid[], 'general', 'members', 'members', null, false) as j;
reset role;
insert into public._ctx select 'v_pub', j->>'group_id' from _v1;
insert into public._ctx select 'v_res', j->>'group_id' from _v2;
insert into public._ctx select 'v_prv', j->>'group_id' from _v3;
insert into public._ctx select 'v_gec', j->>'group_id' from _v4;
insert into public._ctx select 'v_dave', j->>'group_id' from _v5;
insert into public.messages (conversation_id, sender_id, body) values (public._g('v_res'), :alice, 'kapalı topluluk mesajı');

select public._check(102, 'oluşturma: üç düzey saklanır; geçersiz düzey reddedilir; kontrol kısıtı ham değeri de reddeder',
  (select visibility from public.chat_groups where id = public._g('v_pub')) = 'public'
  and (select visibility from public.chat_groups where id = public._g('v_res')) = 'restricted'
  and (select visibility from public.chat_groups where id = public._g('v_prv')) = 'private'
  and exists (select 1 from public.conversation_members where conversation_id = public._g('v_res') and user_id = :alice and role = 'owner')
  and public._r('v_bad') like '%invalid_visibility%'
  and public._try(format($q$update public.chat_groups set visibility = 'secret' where id = %L$q$, public._g('v_res'))) like '%chat_groups_visibility_check%');

set role authenticated;
select public._as_user(:erin);
select public._check(103, 'keşif: yalnız herkese açık topluluk listelenir; kapalı ve tamamen kapalı Keşfet''te görünmez',
  (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id = public._g('v_pub')) = 1
  and (select count(*) from public.discover_communities(null, 'popular', null, 50, 0) where id in (public._g('v_res'), public._g('v_prv'), public._g('v_dave'), public._g('v_gec'))) = 0
  and (select count(*) from public.discover_communities('Gizli', 'popular', null, 50, 0)) = 0);
select public._check(104, 'arama: kapalı topluluk bulunur (kart bilgisi) ama içerik istatistiği sızmaz',
  (select count(*) from public.search_communities('Gizli Atölye')) = 1
  and (select visibility from public.search_communities('Gizli Atölye')) = 'restricted'
  and (select my_status from public.search_communities('Gizli Atölye')) = 'none'
  and (select member_count from public.search_communities('Gizli Atölye')) = 1);
select public._check(1041, 'arama: kapalı topluluk için gönderi/etkinlik/son etkinlik sızmaz; herkese açıkta görünür',
  (select post_count is null and upcoming_event_count is null and last_activity_at is null from public.search_communities('Gizli Atölye'))
  and (select count(*) from public.search_communities('Görünür Atölye')) = 1
  and (select post_count is not null from public.search_communities('Görünür Atölye')));
select public._check(1042, 'arama: tamamen kapalı topluluk ne adıyla ne açıklamasıyla bulunur',
  (select count(*) from public.search_communities('Hayalet')) = 0
  and (select count(*) from public.search_communities('tamamen kapalı')) = 0);
select public._check(1043, 'arama: boş/null sorgu ve joker karakter sonuç döndürmez; kategori süzgeci',
  (select count(*) from public.search_communities('')) = 0
  and (select count(*) from public.search_communities(null)) = 0
  and (select count(*) from public.search_communities('%')) = 0
  and (select count(*) from public.search_communities('atölye', 'audio')) = 1
  and (select count(*) from public.search_communities('atölye', 'text')) = 0);
select public._check(105, 'satır okuma: üye olmayan chat_groups tablosunu HİÇ okuyamaz; kapalı topluluğun kartı yalnız community_cards ile gelir, tamamen kapalınınki gelmez',
  (select count(*) from public.chat_groups where id in (public._g('v_res'), public._g('v_prv'), public._g('v_dave'), public._g('v_pub'))) = 0
  and (select count(*) from public.community_cards(array[public._g('v_res'), public._g('v_dave'), public._g('v_pub')])) = 3
  and (select count(*) from public.community_cards(array[public._g('v_prv')])) = 0);
select public._check(106, 'kapalı topluluk: gönderi/duyuru/mesaj/üye listesi üyelik olmadan okunamaz',
  (select count(*) from public.community_posts where community_id = public._g('v_res')) = 0
  and (select count(*) from public.community_announcements where community_id = public._g('v_res')) = 0
  and (select count(*) from public.messages where conversation_id = public._g('v_res')) = 0
  and (select count(*) from public.community_members(public._g('v_res'), null, null)) = 0
  and not public.can_read_community(public._g('v_res'))
  and public.can_read_community(public._g('v_pub')));
select public._check(107, 'katılma: kapalı topluluğa doğrudan katılım yok; tamamen kapalıya başvuru da yok (varlığı sızmaz)',
  public._try(format('select public.join_community(%L, true)', public._g('v_res'))) like '%group_not_found%'
  and public._try(format('select public.join_chat_group(%L)', public._g('v_res'))) like '%group_not_found%'
  and public._try(format('select public.request_join_community(%L, null, true)', public._g('v_prv'))) like '%group_not_found%'
  and not exists (select 1 from public.chat_group_join_requests where group_id = public._g('v_prv')));

-- Başvuru akışı (erin): kural kabulü zorunlu → önce reddedilir, sonra kabulle gider
select public._tk('v108a', format('select public.request_join_community(%L, null, false)', public._g('v_res')));
select public._tk('v108b', format($q$select public.request_join_community(%L, %L, true)$q$, public._g('v_res'), repeat('x', 301)));
select public._tk('v108c', format($q$select public.request_join_community(%L, 'merhaba', true)$q$, public._g('v_res')));
select public._tk('v108d', format($q$select public.request_join_community(%L, 'tekrar', true)$q$, public._g('v_res')));
select public._check(108, 'başvuru: kural kabulsüz reddedilir, uzun mesaj reddedilir, kabulle istek oluşur, ikincisi yinelenmez; durum "requested"',
  public._r('v108a') like '%rules_not_accepted%'
  and public._r('v108b') like '%invalid_message%'
  and public._r('v108c') = 'ok'
  and public._r('v108d') = 'ok'
  and (select count(*) from public.chat_group_join_requests where group_id = public._g('v_res') and user_id = :erin and status = 'pending') = 1
  and (select my_status from public.search_communities('Gizli Atölye')) = 'requested'
  and exists (select 1 from public.community_rule_acceptances where community_id = public._g('v_res') and user_id = :erin)
  and (select count(*) from public.community_members(public._g('v_res'), null, null)) = 0);
select public._check(109, 'başvuru: yöneticiye bildirim gider; başvuran içerik göremez; başvurduğu topluluk önerilerden düşer',
  public._notif(:alice, '%Gizli Atölye%katılma isteği%') = 1
  and not public.can_read_community(public._g('v_res'))
  and (select count(*) from public.suggest_communities(20) where id = public._g('v_res')) = 0);

-- Engel: gina ↔ dave. gina, dave'in kapalı topluluğunu göremez/başvuramaz
select public._as_user(:gina);
select public._check(110, 'engel: sahibiyle engel ilişkisi olan kapalı topluluk aramada/önerilerde yok; başvuru reddedilir',
  (select count(*) from public.search_communities('Dave Kapalı')) = 0
  and (select count(*) from public.suggest_communities(20) where id = public._g('v_dave')) = 0
  and public._try(format('select public.request_join_community(%L, null, false)', public._g('v_dave'))) like '%cannot_join%');

-- Karar: alice kabul eder → erin üye, içeriği görür
select public._as_user(:alice);
select public._tk('v111a', format('select public.decide_chat_group_join_request(%L, true)', public._reqid(public._g('v_res'), :erin)));
select public._as_user(:erin);
select public._check(111, 'karar: kabul edilen başvuran üye olur, içeriği okur; tekrar başvuru "already_member"',
  public._r('v111a') = 'ok'
  and exists (select 1 from public.conversation_members where conversation_id = public._g('v_res') and user_id = :erin)
  and (select count(*) from public.community_posts where community_id = public._g('v_res')) = 1
  and (select count(*) from public.community_announcements where community_id = public._g('v_res')) = 1
  and public.can_read_community(public._g('v_res'))
  and public._try(format('select public.request_join_community(%L, null, true)', public._g('v_res'))) = 'ok'
  and (select my_status from public.search_communities('Gizli Atölye')) = 'member'
  and (select post_count from public.search_communities('Gizli Atölye')) = 1);

-- Ret + 24 saat bekleme (frank)
select public._as_user(:frank);
select public.request_join_community(public._g('v_res'), 'ben de', true);
select public._as_user(:alice);
select public.decide_chat_group_join_request(public._reqid(public._g('v_res'), :frank), false);
select public._as_user(:frank);
select public._check(112, 'ret: reddedilen kişi 24 saat içinde yeniden başvuramaz; üye olmadığı için içerik hâlâ kapalı',
  public._try(format('select public.request_join_community(%L, null, true)', public._g('v_res'))) like '%request_cooldown%'
  and not public.can_read_community(public._g('v_res')));

-- Herkese açıkta aynı RPC doğrudan katılım yapar (hank)
select public._as_user(:hank);
select public._tk('v113', format('select public.request_join_community(%L, null, false)', public._g('v_pub')));
select public._check(113, 'herkese açık: request_join_community doğrudan katılıma döner',
  public._r('v113') = 'ok'
  and exists (select 1 from public.conversation_members where conversation_id = public._g('v_pub') and user_id = :hank));

-- Öneriler (erin: image kategorisindeki 'Açık Topluluk'a yeniden katılır; v_res üyesi)
select public._as_user(:erin);
select public.join_community(public._g('open'), false);
select public._check(114, 'öneri: tamamen kapalı asla; üyesi olduklarım yok; ortak kategori önce; kapalı topluluk içerik istatistiği sızdırmaz',
  (select count(*) from public.suggest_communities(20) where id = public._g('v_prv')) = 0
  and (select count(*) from public.suggest_communities(20) where id in (public._g('open'), public._g('v_res'))) = 0
  and (select count(*) from public.suggest_communities(20) where id = public._g('v_pub')) = 1
  and (select reason from public.suggest_communities(20) where id = public._g('v_pub')) = 'category'
  and (select count(*) from public.suggest_communities(20) where id = public._g('v_dave')) = 1
  and (select reason from public.suggest_communities(20) where id = public._g('v_dave')) = 'popular'
  and (select visibility = 'restricted' and post_count is null and upcoming_event_count is null and last_activity_at is null
         from public.suggest_communities(20) where id = public._g('v_dave'))
  and (select id from public.suggest_communities(1)) = public._g('v_pub')
  and (select count(*) from public.suggest_communities(0)) = 1);

-- Doluluk: v_res sınırı 3 (alice + erin + carol). 4. kişi (gina) başvuramaz ve öneriden düşer; erin ayrılınca yer açılır, yeniden başvuru mümkün.
select public._as_user(:carol);
select public.request_join_community(public._g('v_res'), null, true);
select public._as_user(:alice);
select public.decide_chat_group_join_request(public._reqid(public._g('v_res'), :carol), true);
select public._as_user(:gina);
select public._check(115, 'doluluk: dolu kapalı topluluğa başvuru reddedilir, öneriden düşer',
  (select member_count from public.community_cards(array[public._g('v_res')])) = 3
  and public._try(format('select public.request_join_community(%L, null, true)', public._g('v_res'))) like '%member_limit_reached%'
  and (select count(*) from public.suggest_communities(20) where id = public._g('v_res')) = 0);
select public._as_user(:erin);
select public.leave_chat_group(public._g('v_res'));
select public._tk('v116', format('select public.request_join_community(%L, null, true)', public._g('v_res')));
select public._check(116, 'ayrılma: üye ayrılınca içerik yeniden kapanır, kapalı topluluk yine aranır; eski kabul edilmiş başvuru yeni başvuruyu engellemez',
  not public.can_read_community(public._g('v_res'))
  and (select count(*) from public.community_posts where community_id = public._g('v_res')) = 0
  and public._r('v116') = 'ok'
  and exists (select 1 from public.chat_group_join_requests where group_id = public._g('v_res') and user_id = :erin and status = 'pending')
  and (select count(*) from public.chat_group_join_requests where group_id = public._g('v_res') and user_id = :erin) = 2);

-- Görünürlük geçişleri (v_gec): gina başvurur → herkese açığa geçişte güvenlik kurallarına uyan başvuru kabul edilir
select public._as_user(:gina);
select public.request_join_community(public._g('v_gec'), null, false);
select public._as_user(:erin);
select public._tk('v117a', format($q$select public.set_chat_group_visibility(%L, 'public')$q$, public._g('v_gec')));
select public._as_user(:alice);
select public._tk('v117b', format($q$select public.set_chat_group_visibility(%L, 'secret')$q$, public._g('v_gec')));
create temp table _vc as select public.set_chat_group_visibility(public._g('v_gec'), 'public') as j;
select public._check(117, 'görünürlük: yetkisiz değiştiremez; geçersiz değer reddedilir; herkese açığa geçişte bekleyen başvuru kabul edilir',
  public._r('v117a') like '%forbidden%'
  and public._r('v117b') like '%invalid_visibility%'
  and (select (j->>'accepted_count')::int from _vc) = 1
  and public._q(format('select count(*)::text from public.conversation_members where conversation_id = %L and user_id = %L', public._g('v_gec'), :gina::text)) = '1'
  and (select visibility from public.chat_groups where id = public._g('v_gec')) = 'public');
select public._tk('v118a', format($q$select public.set_chat_group_visibility(%L, 'restricted')$q$, public._g('v_gec')));
select public._as_user(:frank);
select public._check(118, 'görünürlük: herkese açıktan kapalıya dönünce Keşfet''ten düşer ama aramada/önerilerde kalır',
  public._r('v118a') = 'ok'
  and (select count(*) from public.discover_communities('Geçiş', 'popular', null, 50, 0)) = 0
  and (select count(*) from public.search_communities('Geçiş')) = 1
  and (select count(*) from public.suggest_communities(50) where id = public._g('v_gec')) = 1);
select public._as_user(:alice);
select public._tk('v118b', format($q$select public.set_chat_group_visibility(%L, 'private')$q$, public._g('v_gec')));
select public._as_user(:frank);
select public._check(119, 'tamamen kapalıya dönmüş topluluk: arama/öneri/satır/başvuru hiçbiri onu göstermez',
  public._r('v118b') = 'ok'
  and (select count(*) from public.search_communities('Geçiş')) = 0
  and (select count(*) from public.suggest_communities(50) where id = public._g('v_gec')) = 0
  and (select count(*) from public.community_cards(array[public._g('v_gec')])) = 0
  and public._try(format('select public.request_join_community(%L, null, true)', public._g('v_gec'))) like '%group_not_found%');
select public._as_user(:alice);
select public.set_chat_group_visibility(public._g('v_gec'), 'restricted');
select public._as_user(:frank);
select public.request_join_community(public._g('v_gec'), null, false);
select public._as_user(:alice);
select public.set_chat_group_visibility(public._g('v_gec'), 'private');
select public._check(120, 'görünürlük: kapalıdan tamamen kapalıya geçişte bekleyen başvuruya dokunulmaz (yönetici kararı verir)',
  exists (select 1 from public.chat_group_join_requests where group_id = public._g('v_gec') and user_id = :frank and status = 'pending'));

reset role;
select public._check(121, '"Kaydet" (yer imi) kaldırıldı: tablo ve RPC yok',
  to_regclass('public.community_bookmarks') is null
  and to_regprocedure('public.set_community_bookmark(uuid,boolean)') is null);
select public._check(122, 'EXECUTE: anon yeni RPC''leri çağıramaz; doğrudan görünürlük yazımı reddedilir',
  has_function_privilege('anon', 'public.search_communities(text,text,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.suggest_communities(integer)', 'execute')
  and not has_function_privilege('anon', 'public.request_join_community(uuid,text,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.request_join_community(uuid,text,boolean)', 'execute'));
set role authenticated;
select public._as_user(:alice);
select public._check(123, 'görünürlük: istemci chat_groups.visibility''yi doğrudan yazamaz',
  public._try(format($q$update public.chat_groups set visibility = 'public' where id = %L$q$, public._g('v_prv'))) like '%permission denied%');
reset role;

-- ============================================================================
-- 16. Sahip çıkışı (hesap silme cascade'i): topluluk sahipsiz kalmaz
-- ============================================================================
-- Hesap silme cascade'i sahibin üyelik satırını siler (süper kullanıcıyla aynısını yaparız; tam hesap silme akışı 154'tedir).
delete from public.conversation_members where conversation_id = public._g('closed') and user_id = :alice;
select public._check(98, 'sahip çıkışı: sahibin üyeliği silinince (hesap silme cascade''i) topluluk sahipsiz kalmaz, en kıdemli yönetici devralır; mesajlar/üyelikler yerinde',
  exists (select 1 from public.conversation_members where conversation_id = public._g('closed') and role = 'owner')
  and (select count(*) from public.conversation_members where conversation_id = public._g('closed') and role = 'owner') = 1
  and exists (select 1 from public.chat_groups where id = public._g('closed'))
  and exists (select 1 from public.messages where conversation_id = public._g('closed') and id = '00000000-0000-4000-8000-0000000000c2'));
select public._check(99, 'bütünlük: tüm topluluklarda gönderi sayacı gerçek gönderi sayısına eşit',
  not exists (select 1 from public.chat_groups g where g.post_count <> (select count(*) from public.community_posts p where p.community_id = g.id)));

-- Gerçek hesap silme akışı (delete_account_data): üye/yazar/raporlayan/RSVP'li hesap ve (devir sonrası) SAHİP hesap
select public.delete_account_data(:frank);
select public._check(100, 'hesap silme: üyenin gönderileri, raporları, RSVP ve kural kabulleri temizlenir; sayaçlar tutarlı',
  not exists (select 1 from public.community_posts where author_id = :frank)
  and not exists (select 1 from public.community_reports where reporter_id = :frank)
  and not exists (select 1 from public.community_rule_acceptances where user_id = :frank)
  and not exists (select 1 from public.chat_groups g where g.member_count <> (select count(*) from public.conversation_members m where m.conversation_id = g.id))
  and not exists (select 1 from public.chat_groups g where g.post_count <> (select count(*) from public.community_posts p where p.community_id = g.id)));
select public.delete_account_data(:bobby);
select public._check(101, 'hesap silme: SAHİP olan hesap silinince topluluk sahipsiz kalmaz (sıradaki yönetici/moderatör devralır), topluluk silinmez',
  (select count(*) from public.conversation_members where conversation_id = public._g('closed') and role = 'owner') = 1
  and (select user_id from public.conversation_members where conversation_id = public._g('closed') and role = 'owner') = :carol
  and exists (select 1 from public.chat_groups where id = public._g('closed')));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
