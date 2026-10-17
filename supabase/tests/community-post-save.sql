-- Topluluk gönderisinde KAYDET: DB/RLS/sayaç testi (docs/history/184-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-post-save.sql  ("FAILED=0" beklenir).
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



-- A (herkese açık: alice sahip, bobby, carol), R (kapalı: alice, erin, bobby)
select public._mkc('Topluluk A', 'public', array[:bobby, :carol]::uuid[]) as v \gset a_
select public._mkc('Topluluk R', 'restricted', array[:erin, :bobby]::uuid[]) as v \gset r_
insert into public._ctx values ('A', :'a_v'), ('R', :'r_v');
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :bobby, 'Bobby prompt A', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :bobby, 'Bobby prompt R', 'd', 'metin', 'text', 'published', 'public');
insert into public.workflows (id, creator_id, title, status, visibility) values
  ('c0000000-0000-4000-8000-0000000000a1', :bobby, 'Bobby akış', 'published', 'public');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('d0000000-0000-4000-8000-0000000000a1', :bobby, 'Bobby istek', 'd', false, 'public');

-- Başvuru gönderileri (bobby): A'da prompt + workflow + istek; R'de prompt
set role authenticated;
select public._as_user(:bobby);
select public.share_to_community(public._g('A'), 'prompt', 'a0000000-0000-4000-8000-0000000000a1', 'not') as v \gset pa_
select public.share_to_community(public._g('A'), 'workflow', 'c0000000-0000-4000-8000-0000000000a1', null) as v \gset wa_
select public.share_to_community(public._g('A'), 'request', 'd0000000-0000-4000-8000-0000000000a1', null) as v \gset ra_
select public.share_to_community(public._g('R'), 'prompt', 'a0000000-0000-4000-8000-0000000000a2', null) as v \gset pr_
-- Yerel içerik (A): prompt
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-000000000001', :bobby, 'Yerel prompt', 'd', 'metin', 'text', 'published', 'public', public._g('A'));
reset role;
insert into public._ctx values ('PA', :'pa_v'), ('WA', :'wa_v'), ('RA', :'ra_v'), ('PR', :'pr_v');
insert into public._ctx select 'NATIVE', id::text from public.community_posts where prompt_id = 'a0000000-0000-4000-8000-000000000001';
select public._check(0, 'fixture: dört başvuru + bir yerel gönderi',
  (select count(*) from public.community_posts where kind = 'application') = 4 and (select count(*) from public.community_posts where kind = 'native') = 1);
select public._check(1, 'yeni sütun: başlangıç save_count = 0',
  (select count(*) from public.community_posts where save_count <> 0) = 0);

create or replace function public._col(uid uuid) returns uuid language sql stable security definer as
  $$ select id from public.collections where owner_id = uid and is_default limit 1 $$;
grant execute on function public._col(uuid) to public;
create or replace function public._pc() returns integer language sql stable security definer as
  $$ select save_count from public.community_posts where id = public._g('PA') $$;
grant execute on function public._pc() to public;

-- ============================================================================
-- 1. Başvuru gönderisini kaydetme + sayaç (kaydeden tek kullanıcı sayılır)
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(2, 'carol (üye) başvuru gönderisini kaydeder',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:carol), public._g('PA'))) = 'ok');
insert into public.collections (id, owner_id, name) values ('c2000000-0000-4000-8000-000000000001', :carol, 'İkinci');
select public._check(3, 'ikinci koleksiyona da eklenir (yinelenen değil)',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, 'c2000000-0000-4000-8000-000000000001', public._g('PA'))) = 'ok');
reset role;
select public._check(4, 'gönderi save_count = 1 (kaydeden tek kullanıcı; koleksiyon sayısı değil)', public._pc() = 1, public._pc()::text);
select public._check(5, 'orijinal içeriğin save_count''ına dokunulmaz',
  (select save_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1') = 0);
set role authenticated;
select public._as_user(:carol);
select public._check(6, 'aynı koleksiyona ikinci ekleme benzersiz ihlali (istemci başarı sayar)',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:carol), public._g('PA'))) like '%collection_items_collection_post_uidx%');
delete from public.collection_items where collection_id = 'c2000000-0000-4000-8000-000000000001' and community_post_id = public._g('PA');
reset role;
select public._check(7, 'bir koleksiyondan çıkarınca hâlâ başka koleksiyonda → sayaç 1', public._pc() = 1, public._pc()::text);
set role authenticated;
select public._as_user(:carol);
delete from public.collection_items where collection_id = public._col(:carol) and community_post_id = public._g('PA');
reset role;
select public._check(8, 'hiçbir koleksiyonda kalmayınca sayaç 0', public._pc() = 0, public._pc()::text);

-- ============================================================================
-- 2. Hedef/şekil kısıtları ve sayaç koruması
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(9, 'tam bir hedef: hem prompt hem gönderi / hedefsiz satır reddedilir',
  public._try(format($q$insert into public.collection_items (collection_id, prompt_id, community_post_id) values (%L, 'a0000000-0000-4000-8000-0000000000a1', %L)$q$, public._col(:carol), public._g('PA'))) like '%collection_items_exactly_one_target%'
  and public._try(format($q$insert into public.collection_items (collection_id) values (%L)$q$, public._col(:carol))) like '%collection_items_exactly_one_target%');
select public._check(10, 'yerel gönderi kaydedilmez (kaydedilen şey içeriktir)',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:carol), public._ctx_get('NATIVE'))) like '%community_post_not_savable%');
select public._check(11, 'istek başvurusu kaydedilemez (normal sitede de istek kaydedilemez)',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:carol), public._g('RA'))) like '%community_post_not_savable%');
select public._try(format($q$update public.community_posts set save_count = 99 where id = %L$q$, public._g('PA')));
select public._check(12, 'save_count istemciden yazılamaz', public._pc() = 0, public._pc()::text);
select public._check(13, 'workflow başvurusu kaydedilir',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:carol), public._g('WA'))) = 'ok');

-- ============================================================================
-- 3. Erişim: topluluğu okuyamayan kaydedemez (kapalı topluluk), üye kaydeder
-- ============================================================================
select public._as_user(:dave);
select public._check(14, 'kapalı topluluk: üye olmayan (dave) başvuru gönderisini kaydedemez',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:dave), public._g('PR'))) like '%community_content_not_readable%');
select public._check(15, 'herkese açık toplulukta üye olmayan okuyabildiği gönderiyi kaydedebilir',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:dave), public._g('PA'))) = 'ok');
select public._as_user(:erin);
select public._check(16, 'kapalı topluluk üyesi kaydeder',
  public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, public._col(:erin), public._g('PR'))) = 'ok');

-- ============================================================================
-- 4. Yerel (native) içerik normal kaydedilir; okuyamayan kaydedemez
-- ============================================================================
select public._as_user(:carol);
select public._check(17, 'yerel prompt: topluluk üyesi normal koleksiyonuna kaydeder',
  public._try(format($q$insert into public.collection_items (collection_id, prompt_id) values (%L, 'a0000000-0000-4000-8000-000000000001')$q$, public._col(:carol))) = 'ok');
reset role;
select public._check(18, 'yerel prompt save_count = 1', (select save_count from public.prompts where id = 'a0000000-0000-4000-8000-000000000001') = 1);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-000000000002', :bobby, 'Kapalıdaki yerel', 'd', 'metin', 'text', 'published', 'private', public._g('R'));
set role authenticated;
select public._as_user(:dave);
select public._check(19, 'kapalı topluluğun yerel içeriğini üye olmayan kaydedemez',
  public._try(format($q$insert into public.collection_items (collection_id, prompt_id) values (%L, 'a0000000-0000-4000-8000-000000000002')$q$, public._col(:dave))) like '%community_content_not_readable%');
select public._check(20, 'normal herkese açık içerik herkes için kaydedilir (bu kural onu etkilemez)',
  public._try(format($q$insert into public.collection_items (collection_id, prompt_id) values (%L, 'a0000000-0000-4000-8000-0000000000a2')$q$, public._col(:dave))) = 'ok');

-- ============================================================================
-- 5. İstatistik: kaydedenler listesi gönderi için çalışır; istek için boş
-- ============================================================================
select public._as_user(:carol);
select public._check(21, 'içerik istatistiği: community_post "saves" kaydedenleri listeler (carol + dave)',
  (select count(*) from public.content_engagers('community_post', public._g('PA'), 'saves')) = 1
  and (select count(*) from public.content_engagers('community_post', public._g('PA'), 'saves') where actor_id = :dave) = 1,
  (select count(*) from public.content_engagers('community_post', public._g('PA'), 'saves'))::text);
select public._check(22, 'istek gönderisi için kaydedenler boş',
  (select count(*) from public.content_engagers('community_post', public._g('RA'), 'saves')) = 0);

-- ============================================================================
-- 6. Silme: koleksiyon silinince sayaç düşer; gönderi silinince öğeler ve koleksiyon sayacı temizlenir
-- ============================================================================
reset role;
insert into public.collections (id, owner_id, name) values ('c3000000-0000-4000-8000-000000000001', :dave, 'Tek');
set role authenticated;
select public._as_user(:dave);
select public._try(format($q$insert into public.collection_items (collection_id, community_post_id) values (%L, %L)$q$, 'c3000000-0000-4000-8000-000000000001', public._g('WA')));
reset role;
select public._check(23, 'workflow gönderisi save_count = 2 (carol + dave)', (select save_count from public.community_posts where id = public._g('WA')) = 2);
set role authenticated;
select public._as_user(:dave);
delete from public.collections where id = 'c3000000-0000-4000-8000-000000000001';
reset role;
select public._check(24, 'tek koleksiyonu silinen kullanıcı için sayaç düşer (2 → 1)', (select save_count from public.community_posts where id = public._g('WA')) = 1);
set role authenticated;
select public._as_user(:bobby);
select public.delete_community_post(public._g('WA'));
reset role;
select public._check(26, 'gönderi silinince koleksiyon öğeleri cascade ile gider',
  (select count(*) from public.collection_items where community_post_id = public._g('WA')) = 0);
select public._check(27, 'koleksiyon item_count tutarlı (satır sayısına eşit)',
  (select count(*) from public.collections c where c.item_count <> (select count(*) from public.collection_items ci where ci.collection_id = c.id)) = 0);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
