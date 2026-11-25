-- Space sosyal katmanının kaldırılması (docs/history/459-*): görünürlük hep özel, okuma yalnız üyelik, yorum/puan/alıntı/duyuru
-- yazımı reddedilir, bağlantı/vitrin RPC'leri yok, arşiv tablosu istemciye kapalı.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-social-removal.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(düzenleyici) carol(görüntüleyici) dave(yabancı) erin(alice tarafından engellenmiş)
--               frank(bağlantı sahibi). Ziyaretçi = boş kimlik.
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
grant select, insert, delete on storage.objects to anon, authenticated;

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
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return r; exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._gt(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text),
  public._val(text), public._g(text), public._gt(text), public._set(text, text), public._q(text) to public;


insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :carol, 'Açık prompt', 'd', 'metin', 'text', 'published', 'public');

set role authenticated;
select public._as_user(:alice);
-- create_space('public' / 'link' istense bile) özel kalır
select public._set('S1', public.create_space('Açık denen', 'x', 'moodboard', 'public')::text);
select public._set('S2', public.create_space('Link denen', 'x', 'free', 'link')::text);
select public._check(1, 'create_space: "herkese açık" ve "bağlantı" istenince de Space özel kalır',
  public._val(format($q$select string_agg(visibility, ',' order by title) from public.spaces where id in (%L, %L)$q$, public._g('S1'), public._g('S2'))) = 'private,private');
select public._check(2, 'sahip görünürlüğü "herkese açık"a çeviremez (sessizce özel kalır)',
  public._try(format($q$update public.spaces set visibility = 'public' where id = %L$q$, public._g('S1'))) = 'ok'
  and public._val(format($q$select visibility from public.spaces where id = %L$q$, public._g('S1'))) = 'private');
select public._check(3, 'sahip kendi Space''ini okur (üyelik)', public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S1'))) = 1);
select public._check(4, 'sahip bile yorum/puan yazamaz (space_engagement_closed)',
  public._try(format($q$insert into public.prompt_comments (space_id, author_id, body, rating) values (%L, auth.uid(), 'x', 5)$q$, public._g('S1'))) like '%space_engagement_closed%');

select public._as_user(:bobby);
select public._check(5, 'üye olmayan Space''i okuyamaz, yorum/beğeni yazamaz',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S1'))) = 0
  and public._cnt($q$select count(*) from public.list_spaces('all')$q$) = 0
  and public._try(format($q$insert into public.prompt_comments (space_id, author_id, body) values (%L, auth.uid(), 'x')$q$, public._g('S1'))) <> 'ok'
  and public._try(format($q$insert into public.prompt_likes (space_id, user_id) values (%L, auth.uid())$q$, public._g('S1'))) <> 'ok');
select public._check(6, 'Space alıntısı kapalı (create_quote ve doğrudan tablo)',
  public._try(format($q$select public.create_quote('space', %L, null)$q$, public._g('S1'))) <> 'ok'
  and public._try(format($q$insert into public.content_quotes (author_id, content_type, space_id) values (auth.uid(), 'space', %L)$q$, public._g('S1'))) <> 'ok');
reset role;
select public._check(7, 'tetikleyici: doğrudan (süper kullanıcı) content_quotes / community_posts Space yazımı da reddedilir',
  public._try(format($q$insert into public.content_quotes (author_id, content_type, space_id) values (%L, 'space', %L)$q$, :bobby, public._g('S1'))) like '%space_engagement_closed%'
  and public._try(format($q$insert into public.community_posts (space_id) values (%L)$q$, public._g('S1'))) like '%space_engagement_closed%');

-- ziyaretçi
set role anon;
select public._as_user('');
select public._check(8, 'ziyaretçi hiçbir Space okumaz ve listelemez',
  public._cnt(format($q$select count(*) from public.spaces where id = %L$q$, public._g('S1'))) = 0
  and public._cnt($q$select count(*) from public.list_spaces('public')$q$) = 0);
reset role;

-- kalkan RPC'ler
select public._check(9, 'bağlantı/vitrin/paylaşım/sabitleme RPC''leri veritabanında yok',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and p.proname in ('create_space_link','open_space_link','revoke_space_link','space_link_status','list_public_spaces','list_public_spaces_for_skill','set_space_shared','set_space_favorite')) = 0);

-- arşiv tablosu: istemciye tamamen kapalı
set role authenticated;
select public._as_user(:alice);
select public._check(10, 'space_social_archive istemciye kapalı (okuma da yazma da)',
  public._try($q$select count(*) from public.space_social_archive$q$) like '%permission denied%'
  and public._try($q$insert into public.space_social_archive (source, row_data) values ('x', '{}')$q$) like '%permission denied%');
reset role;
set role anon;
select public._check(11, 'ziyaretçi arşiv tablosunu okuyamaz',
  public._try($q$select count(*) from public.space_social_archive$q$) like '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
