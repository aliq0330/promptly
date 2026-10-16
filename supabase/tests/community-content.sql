-- Topluluğa özgü içerik: DB/RLS/RPC testi (docs/history/179-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-content.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby carol(üye) dave(dışarıdan) erin(kapalı topluluk üyesi) gina(alice'in engelledikleri) hank(site moderatörü).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''77777777-7777-4777-8777-777777777777'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina'),(:hank,'hank')) as u(id, name);
update public.profiles set role = 'moderator' where id = :hank;

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
create or replace function public._tk(key text, q text) returns text language plpgsql as $$
declare r text;
begin r := public._try(q); insert into public._ctx values ('r:' || key, r) on conflict (k) do update set v = excluded.v; return r; end $$;
create or replace function public._r(key text) returns text language sql stable as $$ select v from public._ctx where k = 'r:' || key $$;
grant execute on function public._tk(text, text), public._r(text) to public;
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._ctx_get(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
-- RLS'e takılmadan (süper kullanıcı gözüyle) tek değer okur: yalnızca DOĞRULAMA içindir.
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text),
  public._g(text), public._ctx_get(text), public._q(text) to public;

-- Topluluk kurar; davetlileri kabul ettirir. Sahip alice.
create or replace function public._mkc(p_name text, p_level text, p_members uuid[]) returns uuid language plpgsql as $$
declare v_gid uuid; v_u uuid;
begin
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  v_gid := (public.create_community(p_name, 'açıklama', p_level, null, 50, p_members, 'general', 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array p_members loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  return v_gid;
end $$;


-- Topluluklar: A (herkese açık: alice, bobby, carol), R (kapalı: alice, erin, bobby), F (herkese açık, akış yalnız kadro: alice, bobby)
select public._mkc('Topluluk A', 'public', array[:bobby, :carol]::uuid[]) as v \gset a_
select public._mkc('Topluluk R', 'restricted', array[:erin, :bobby]::uuid[]) as v \gset r_
select public._mkc('Topluluk F', 'public', array[:bobby]::uuid[]) as v \gset f_
insert into public._ctx values ('A', :'a_v'), ('R', :'r_v'), ('F', :'f_v');
reset role;
update public.chat_groups set feed_policy = 'admins' where id = public._g('F');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Normal açık prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :alice, 'Normal özel prompt', 'd', 'metin', 'text', 'published', 'private'),
  ('a0000000-0000-4000-8000-0000000000a3', :bobby, 'Bobby normal prompt', 'd', 'metin', 'text', 'published', 'public');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('d0000000-0000-4000-8000-0000000000a2', :bobby, 'Normal özel istek', 'd', false, 'private');
insert into public.prompt_comments (request_id, author_id, body) values ('d0000000-0000-4000-8000-0000000000a2', :bobby, 'özel istek yorumu');
insert into public.collections (id, owner_id, name) values ('c1000000-0000-4000-8000-000000000001', :carol, 'Koleksiyon');

-- ============================================================================
-- 1. Oluşturma: içerik topluluğa eklenir → akış gönderisi kendiliğinden, görünürlük ZORLA özel
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-000000000001', :bobby, 'Topluluk prompt', 'd', 'metin', 'text', 'published', 'public', public._g('A'));
insert into public.prompt_variables (prompt_id, name) values ('a0000000-0000-4000-8000-000000000001', 'konu');
insert into public.prompt_media (prompt_id, url, width, height) values ('a0000000-0000-4000-8000-000000000001', 'https://x.supabase.co/storage/v1/object/public/prompt-media/p.jpg', 10, 10);
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, community_id) values
  ('d0000000-0000-4000-8000-000000000001', :bobby, 'Topluluk istek', 'd', false, 'public', public._g('A'));
insert into public.workflows (id, creator_id, title, status, visibility, community_id) values
  ('c0000000-0000-4000-8000-000000000001', :bobby, 'Topluluk akış', 'published', 'public', public._g('A'));
insert into public.presets (id, creator_id, title, status, visibility, community_id) values
  ('b0000000-0000-4000-8000-000000000001', :bobby, 'Topluluk hazır ayar', 'published', 'public', public._g('A'));
insert into public.preset_fields (owner_id, preset_id, name, type) values (:bobby, 'b0000000-0000-4000-8000-000000000001', 'alan', 'text');
reset role;
select public._check(1, 'oluşturma: dört içerik türü topluluğa eklenince akış gönderisi (kind=native, doğru yazar/topluluk/tür) kendiliğinden oluşur',
  (select count(*) from public.community_posts where community_id = public._g('A') and kind = 'native' and author_id = :bobby) = 4
  and exists (select 1 from public.community_posts where kind = 'native' and content_type = 'prompt' and prompt_id = 'a0000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.community_posts where kind = 'native' and content_type = 'request' and request_id = 'd0000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.community_posts where kind = 'native' and content_type = 'workflow' and workflow_id = 'c0000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.community_posts where kind = 'native' and content_type = 'preset' and preset_id = 'b0000000-0000-4000-8000-000000000001'));
select public._check(2, 'oluşturma: istemci "herkese açık" gönderse bile sunucu görünürlüğü ZORLA private saklar (dört tür)',
  not exists (select 1 from public.prompts where community_id is not null and visibility <> 'private')
  and not exists (select 1 from public.prompt_requests where community_id is not null and visibility <> 'private')
  and not exists (select 1 from public.workflows where community_id is not null and visibility <> 'private')
  and not exists (select 1 from public.presets where community_id is not null and visibility <> 'private'));

set role authenticated;
select public._as_user(:bobby);
update public.prompts set visibility = 'public', title = 'Topluluk prompt (düzenlendi)' where id = 'a0000000-0000-4000-8000-000000000001';
select public._check(3, 'düzenleme: yazar görünürlüğü herkese açık yapamaz (sessizce private kalır); başlığı düzenleyebilir',
  (select visibility from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 'private'
  and (select title from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 'Topluluk prompt (düzenlendi)');
select public._check(4, 'kurallar: topluluk içeriği taslak olamaz; topluluk sonradan değiştirilemez / kaldırılamaz / eklenemez',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'x', 'd', 'm', 'text', 'draft', %L)$q$, :bobby, public._g('A'))) like '%community_draft_not_allowed%'
  and public._try(format($q$insert into public.prompt_requests (author_id, title, description, is_draft, community_id) values (%L, 'x', 'd', true, %L)$q$, :bobby, public._g('A'))) like '%community_draft_not_allowed%'
  and public._try(format($q$insert into public.workflows (creator_id, title, status, community_id) values (%L, 'x', 'draft', %L)$q$, :bobby, public._g('A'))) like '%community_draft_not_allowed%'
  and public._try(format($q$insert into public.presets (creator_id, title, status, community_id) values (%L, 'x', 'draft', %L)$q$, :bobby, public._g('A'))) like '%community_draft_not_allowed%'
  and public._try(format($q$update public.prompts set status = 'draft' where id = 'a0000000-0000-4000-8000-000000000001'$q$)) like '%community_draft_not_allowed%'
  and public._try(format($q$update public.prompts set community_id = %L where id = 'a0000000-0000-4000-8000-000000000001'$q$, public._g('R'))) like '%community_immutable%'
  and public._try($q$update public.prompts set community_id = null where id = 'a0000000-0000-4000-8000-000000000001'$q$) like '%community_immutable%'
  and public._try(format($q$update public.prompts set community_id = %L where id = 'a0000000-0000-4000-8000-0000000000a3'$q$, public._g('A'))) like '%community_immutable%');
reset role;
-- süper kullanıcı bile geçişi yapamaz
select public._check(5, 'kurallar: topluluk ↔ normal geçiş süper kullanıcıdan bile yapılamaz (tek yönlü değişmezlik)',
  public._try($q$update public.prompts set community_id = null where id = 'a0000000-0000-4000-8000-000000000001'$q$) like '%community_immutable%');

-- ============================================================================
-- 2. Yazma izinleri
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(6, 'yazma: üye olmayan topluluğa içerik ekleyemez (herkese açık toplulukta da)',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'x', 'd', 'm', 'text', 'published', %L)$q$, :dave, public._g('A'))) like '%forbidden%'
  and public._try(format($q$insert into public.workflows (creator_id, title, status, community_id) values (%L, 'x', 'published', %L)$q$, :dave, public._g('R'))) like '%forbidden%');
select public._as_user(:bobby);
select public._check(7, 'yazma: akışı yalnız kadroya açık toplulukta üye içerik ekleyemez; kadro (owner) ekleyebilir',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'x', 'd', 'm', 'text', 'published', %L)$q$, :bobby, public._g('F'))) like '%forbidden%');
select public._as_user(:alice);
select public._check(8, 'yazma: kadro ekleyebilir (akış politikası "admins")',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'kadro', 'd', 'm', 'text', 'published', %L)$q$, :alice, public._g('F'))) = 'ok');
select public._as_user(:bobby);
select public._check(9, 'yazma: başkası adına içerik eklenemez',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'x', 'd', 'm', 'text', 'published', %L)$q$, :carol, public._g('A'))) like '%row-level security%');
reset role;
update public.chat_groups set closed_at = now() where id = public._g('A');
set role authenticated;
select public._as_user(:bobby);
select public._check(10, 'yazma: kapatılmış topluluğa içerik eklenemez',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'x', 'd', 'm', 'text', 'published', %L)$q$, :bobby, public._g('A'))) like '%community_closed%');
reset role;
update public.chat_groups set closed_at = null where id = public._g('A');
-- günlük sınır: 30 gönderi
create temp table _rl as select gen_random_uuid() as id from generate_series(1, 30);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
  select id, :bobby, 'rl', 'd', 'm', 'text', 'published', 'public' from _rl;
insert into public.community_posts (community_id, author_id, kind, content_type, prompt_id) select public._g('R'), :bobby, 'application', 'prompt', id from _rl;
set role authenticated;
select public._as_user(:bobby);
select public._check(11, 'yazma: 24 saatte en fazla 30 gönderi',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, community_id) values (%L, 'x', 'd', 'm', 'text', 'published', %L)$q$, :bobby, public._g('R'))) like '%post_rate_limit%');
reset role;

-- ============================================================================
-- 3. Okuma: yalnız topluluğu okuyabilenler (alt satırlar ve medya dahil)
-- ============================================================================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id)
  select 'a0000000-0000-4000-8000-000000000009', :alice, 'Kapalı topluluk prompt', 'd', 'm', 'text', 'published', 'private', public._g('R');
insert into public.prompt_variables (prompt_id, name) values ('a0000000-0000-4000-8000-000000000009', 'k');
set role authenticated;
select public._as_user(:carol);
select public._check(12, 'okuma: topluluk üyesi içeriği, alt satırlarını (değişken, medya, alan) görür',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.prompt_variables where prompt_id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.prompt_media where prompt_id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.prompt_requests where id = 'd0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.workflows where id = 'c0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.presets where id = 'b0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.preset_fields where preset_id = 'b0000000-0000-4000-8000-000000000001') = 1);
select public._as_user(:dave);
select public._check(13, 'okuma: herkese açık toplulukta üye olmayan da okur',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.prompt_media where prompt_id = 'a0000000-0000-4000-8000-000000000001') = 1);
select public._check(14, 'okuma: kapalı toplulukta üye olmayan (dave) içeriği ve alt satırını okuyamaz',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000009') = 0
  and (select count(*) from public.prompt_variables where prompt_id = 'a0000000-0000-4000-8000-000000000009') = 0);
select public._as_user(:erin);
select public._check(15, 'okuma: kapalı toplulukta üye (erin) okur',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000009') = 1);
select public._as_user('');
set role anon;
select public._check(16, 'okuma: ziyaretçi herkese açık topluluğun içeriğini okur, kapalınınkini okuyamaz; normal özel içeriği de okuyamaz',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000009') = 0
  and (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a2') = 0);
reset role;

-- topluluğu okuyamayan yazar kendi içeriğini de okuyamaz
set role authenticated;
select public._as_user(:bobby);
select public.leave_chat_group(public._g('R'));
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id)
  values ('a0000000-0000-4000-8000-00000000000a', :bobby, 'Ayrılan yazarın içeriği', 'd', 'm', 'text', 'published', 'private', public._g('R'));
set role authenticated;
select public._as_user(:bobby);
select public._check(17, 'üyelik: topluluktan ayrılan yazarın içeriği toplulukta KALIR; yazar artık okuyamaz/düzenleyemez',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-00000000000a') = 0
  and public._try($q$update public.prompts set title = 'x' where id = 'a0000000-0000-4000-8000-00000000000a'$q$) = 'ok');
select public._as_user(:erin);
select public._check(18, 'üyelik: aynı içerik üyelere görünmeye devam eder',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-00000000000a') = 1);
reset role;

-- ============================================================================
-- 4. Listelerden dışlama
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(19, 'arama: topluluk içeriği (üye için bile) arama sonucunda çıkmaz; normal açık içerik çıkar',
  (select count(*) from public.search_content('prompt') where id = 'a0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.search_content('request') where id = 'd0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.search_content('workflow') where id = 'c0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.search_content('preset') where id = 'b0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.search_content('prompt') where id = 'a0000000-0000-4000-8000-0000000000a1') = 1);
select public._as_user(:bobby);
select public._check(20, 'arama: yazarın kendi araması da topluluk içeriğini döndürmez',
  (select count(*) from public.search_content('prompt') where id = 'a0000000-0000-4000-8000-000000000001') = 0);
reset role;
select public._check(21, 'dışlama: mevcut "herkese açık" süzgeçlerine takılan topluluk içeriği (private) başvuru olarak da getirilemez',
  (select count(*) from public.prompts where community_id is not null and visibility = 'public') = 0);
set role authenticated;
select public._as_user(:bobby);
select public._check(22, 'başvuru: topluluk içeriği başka topluluğa başvuru olarak getirilemez',
  public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001', null)$q$, public._g('F'))) like '%content_not_public%'
  or public._try(format($q$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001', null)$q$, public._g('F'))) like '%forbidden%');
reset role;

-- ============================================================================
-- 5. Etkileşim (içeriğin KENDİ beğeni/yorumu) ve kaydetme
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-000000000001', :carol);
insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-000000000001', :carol, 'güzel içerik');
insert into public.prompt_likes (request_id, user_id) values ('d0000000-0000-4000-8000-000000000001', :carol);
insert into public.prompt_comments (request_id, author_id, body) values ('d0000000-0000-4000-8000-000000000001', :carol, 'istek yorumu');
reset role;
select public._check(23, 'etkileşim: üye içeriğin kendi beğeni/yorum sayaçlarını artırır (akıştaki normal kartın sayaçları)',
  (select like_count = 1 and comment_count = 1 from public.prompts where id = 'a0000000-0000-4000-8000-000000000001')
  and (select like_count = 1 and comment_count = 1 from public.prompt_requests where id = 'd0000000-0000-4000-8000-000000000001'));
select public._check(24, 'bildirim: yorum içerik sahibine içeriğin kendi adresiyle gider',
  (select count(*) from public.notifications where recipient_id = :bobby and type = 'comment' and target_href like '/prompts/local?id=a0000000-0000-4000-8000-000000000001%') = 1);
set role authenticated;
select public._as_user(:dave);
select public._check(25, 'etkileşim: herkese açık toplulukta üye olmayan okur ama beğenemez / yorum yazamaz (dört tür)',
  public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444')$q$) like '%forbidden%'
  and public._try($q$insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'x')$q$) like '%forbidden%'
  and public._try($q$insert into public.prompt_comments (request_id, author_id, body) values ('d0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'x')$q$) like '%forbidden%'
  and public._try($q$insert into public.prompt_likes (workflow_id, user_id) values ('c0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444')$q$) like '%forbidden%'
  and public._try($q$insert into public.prompt_likes (preset_id, user_id) values ('b0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444')$q$) like '%forbidden%'
  and (select count(*) from public.prompt_comments where prompt_id = 'a0000000-0000-4000-8000-000000000001') = 1);
select public._check(26, 'etkileşim: üye olmayan topluluk içeriğinin yorumunu beğenemez',
  public._try(format($q$insert into public.comment_likes (comment_id, user_id) select id, %L from public.prompt_comments where prompt_id = 'a0000000-0000-4000-8000-000000000001' limit 1$q$, :dave)) like '%forbidden%');
select public._as_user(:carol);
select public._check(27, 'etkileşim: üye yorumu beğenebilir',
  public._try(format($q$insert into public.comment_likes (comment_id, user_id) select id, %L from public.prompt_comments where prompt_id = 'a0000000-0000-4000-8000-000000000001' limit 1$q$, :carol)) = 'ok');
select public._check(28, 'kaydetme: topluluk içeriği (prompt/workflow/hazır ayar) koleksiyona kaydedilemez; normal içerik kaydedilir',
  public._try($q$insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001')$q$) like '%community_content_not_savable%'
  and public._try($q$insert into public.collection_items (collection_id, workflow_id) values ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001')$q$) like '%community_content_not_savable%'
  and public._try($q$insert into public.collection_items (collection_id, preset_id) values ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001')$q$) like '%community_content_not_savable%'
  and public._try($q$insert into public.collection_items (collection_id, prompt_id) values ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1')$q$) = 'ok');
reset role;
update public.chat_groups set closed_at = now() where id = public._g('A');
set role authenticated;
select public._as_user(:carol);
select public._check(29, 'etkileşim: kapatılmış toplulukta içeriğe beğeni/yorum yazılamaz',
  public._try($q$insert into public.prompt_comments (prompt_id, author_id, body) values ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'x')$q$) like '%community_closed%');
reset role;
update public.chat_groups set closed_at = null where id = public._g('A');

-- istek yorumu sızıntısı (var olan açık): özel/topluluk isteklerinin yorumları yabancıya okunmaz
set role authenticated;
select public._as_user(:dave);
select public._check(30, 'yorum sızıntısı: normal ÖZEL isteğin yorumları yabancıya görünmez; kapalı topluluk isteğinin yorumları da görünmez',
  (select count(*) from public.prompt_comments where request_id = 'd0000000-0000-4000-8000-0000000000a2') = 0);
select public._as_user('');
set role anon;
select public._check(31, 'yorum sızıntısı: ziyaretçi herkese açık topluluk isteğinin yorumunu okur, özel isteğinkini okuyamaz',
  (select count(*) from public.prompt_comments where request_id = 'd0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.prompt_comments where request_id = 'd0000000-0000-4000-8000-0000000000a2') = 0);
reset role;

-- ============================================================================
-- 6. Kaldırma = içeriği silmek; moderasyon; hesap/topluluk silme
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(32, 'kaldırma: yetkisiz üye başkasının topluluk içeriğini kaldıramaz',
  public._try(format($q$select public.delete_community_post(id) from public.community_posts where workflow_id = 'c0000000-0000-4000-8000-000000000001'$q$)) like '%forbidden%');
select public._as_user(:bobby);
select public.delete_community_post(id) from public.community_posts where workflow_id = 'c0000000-0000-4000-8000-000000000001';
reset role;
select public._check(33, 'kaldırma: yazar gönderisini kaldırınca içeriğin KENDİSİ silinir (gönderi + alt satırlar cascade)',
  not exists (select 1 from public.workflows where id = 'c0000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.community_posts where workflow_id = 'c0000000-0000-4000-8000-000000000001'));
set role authenticated;
select public._as_user(:alice);
select public.moderate_community_post(id, 'spam') from public.community_posts where preset_id = 'b0000000-0000-4000-8000-000000000001';
reset role;
select public._check(34, 'moderasyon: yetkili kaldırınca içerik + alanları silinir, denetim kaydı ve yazara bildirim düşer',
  not exists (select 1 from public.presets where id = 'b0000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.preset_fields where preset_id = 'b0000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.chat_group_audit where group_id = public._g('A') and action = 'post_removed')
  and (select count(*) from public.notifications where recipient_id = :bobby and message like '%paylaşımın kaldırıldı%') = 1);
select public._check(35, 'kaldırma: içerik silinince onun beğeni/yorumları da gider; başka içerikler etkilenmez',
  (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1);
select public.delete_account_data(:bobby);
select public._check(36, 'hesap silme: yazarın topluluk içeriği ve gönderileri de silinir; topluluğun diğer içerikleri kalır',
  not exists (select 1 from public.prompts where author_id = :bobby)
  and not exists (select 1 from public.community_posts where author_id = :bobby)
  and exists (select 1 from public.prompts where title = 'kadro'));
delete from public.chat_groups where id = public._g('F');
select public._check(37, 'topluluk silme: topluluğa ait içerik de silinir (cascade)',
  not exists (select 1 from public.prompts where title = 'kadro'));
select public._check(38, 'yetki: tetikleyici/yardımcı işlevler istemciye kapalı; iki adımlı RPC çalıştırılamaz',
  not has_function_privilege('authenticated', 'public.enforce_community_content()', 'execute')
  and not has_function_privilege('anon', 'public.create_community_content_post()', 'execute')
  and not has_function_privilege('authenticated', 'public.enforce_community_content_engagement()', 'execute')
  and not has_function_privilege('authenticated', 'public.block_community_content_save()', 'execute')
  and not has_function_privilege('authenticated', 'public._delete_native_community_content(public.community_posts)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_native_community_post(uuid, text, uuid)', 'execute'));

-- Kapalı topluluk: dört türde de yalnız üye okur
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, community_id)
  values ('d0000000-0000-4000-8000-0000000000b1', :alice, 'Kapalı istek', 'd', false, 'private', public._g('R'));
insert into public.workflows (id, creator_id, title, status, visibility, community_id)
  values ('c0000000-0000-4000-8000-0000000000b1', :alice, 'Kapalı akış', 'published', 'private', public._g('R'));
insert into public.presets (id, creator_id, title, status, visibility, community_id)
  values ('b0000000-0000-4000-8000-0000000000b1', :alice, 'Kapalı hazır ayar', 'published', 'private', public._g('R'));
set role authenticated;
select public._as_user(:dave);
select public._check(39, 'kapalı topluluk: istek / workflow / hazır ayar içeriğini üye olmayan okuyamaz',
  (select count(*) from public.prompt_requests where id = 'd0000000-0000-4000-8000-0000000000b1') = 0
  and (select count(*) from public.workflows where id = 'c0000000-0000-4000-8000-0000000000b1') = 0
  and (select count(*) from public.presets where id = 'b0000000-0000-4000-8000-0000000000b1') = 0);
select public._as_user(:erin);
select public._check(40, 'kapalı topluluk: aynı içerikleri üye okur',
  (select count(*) from public.prompt_requests where id = 'd0000000-0000-4000-8000-0000000000b1') = 1
  and (select count(*) from public.workflows where id = 'c0000000-0000-4000-8000-0000000000b1') = 1
  and (select count(*) from public.presets where id = 'b0000000-0000-4000-8000-0000000000b1') = 1);
select public._as_user('');
set role anon;
select public._check(41, 'kapalı topluluk: ziyaretçi dört türden hiçbirini okuyamaz',
  (select count(*) from public.prompt_requests where id = 'd0000000-0000-4000-8000-0000000000b1') = 0
  and (select count(*) from public.workflows where id = 'c0000000-0000-4000-8000-0000000000b1') = 0
  and (select count(*) from public.presets where id = 'b0000000-0000-4000-8000-0000000000b1') = 0);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
