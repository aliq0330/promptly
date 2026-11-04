-- Yorum tepkisi sayıları (docs/history/327-*): `comment_reaction_counts`, `comment_reaction_friends` (SECURITY INVOKER: RLS atlanmaz).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/comment-reaction-counts.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice (içerik/yorum sahibi) bobby carol (tepki verir) dave (bobby ve carol'u takip eder) erin (alice'in engellediği).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return coalesce(r, ''); exception when others then return 'ERR:' || sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._val(text) to public;

insert into public.follows (follower_id, following_id) values (:dave, :bobby), (:dave, :carol);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Açık', 'd', 'gece', 'image', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :alice, 'Özel', 'd', 'gece', 'image', 'published', 'private');
insert into public.prompt_comments (id, prompt_id, author_id, body) values
  ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', :alice, 'açık yorum'),
  ('c1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', :alice, 'ikinci yorum'),
  ('c1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a2', :alice, 'özel prompt yorumu');
insert into public.comment_likes (comment_id, user_id, reaction) values
  ('c1000000-0000-4000-8000-000000000001', :bobby, 'love'),
  ('c1000000-0000-4000-8000-000000000001', :carol, 'fire'),
  ('c1000000-0000-4000-8000-000000000001', :dave, 'fire'),
  ('c1000000-0000-4000-8000-000000000003', :bobby, 'love');

-- 1. Tepki başına sayılar (ziyaretçi dahil: okunabilir yorum herkese açık)
set role anon;
select public._as_user('');
select public._check(1, 'ziyaretçi: açık yorumun tepki sayıları fire=2, love=1',
  public._val($q$select string_agg(reaction || ':' || n, ',' order by reaction) from public.comment_reaction_counts(array['c1000000-0000-4000-8000-000000000001']::uuid[])$q$) = 'fire:2,love:1');
select public._check(2, 'ziyaretçi: özel promptun yorumu için hiçbir şey dönmez (RLS atlanmaz)',
  public._val($q$select count(*) from public.comment_reaction_counts(array['c1000000-0000-4000-8000-000000000003']::uuid[])$q$) = '0');
select public._check(3, 'tepkisi olmayan yorum boş döner; boş/NULL liste hata vermez',
  public._val($q$select count(*) from public.comment_reaction_counts(array['c1000000-0000-4000-8000-000000000002']::uuid[])$q$) = '0'
  and public._val($q$select count(*) from public.comment_reaction_counts('{}'::uuid[])$q$) = '0'
  and public._val($q$select count(*) from public.comment_reaction_counts(null)$q$) = '0');
select public._check(4, 'ziyaretçi için takip edilen tepki veren yok (auth.uid() boş)',
  public._val($q$select count(*) from public.comment_reaction_friends(array['c1000000-0000-4000-8000-000000000001']::uuid[], 2)$q$) = '0');
reset role;

-- 2. Takip ettiklerim
set role authenticated;
select public._as_user(:dave);
select public._check(5, 'dave: takip ettiği bobby ve carol listelenir (yorum başına en çok 2)',
  public._val($q$select string_agg(username || ':' || reaction, ',' order by username) from public.comment_reaction_friends(array['c1000000-0000-4000-8000-000000000001']::uuid[], 2)$q$) = 'bobby:love,carol:fire');
select public._check(6, 'p_per = 1: yalnız en yeni tek kişi',
  public._val($q$select count(*) from public.comment_reaction_friends(array['c1000000-0000-4000-8000-000000000001']::uuid[], 1)$q$) = '1');
select public._as_user(:erin);
select public._check(7, 'erin (kimseyi takip etmiyor): takip edilen tepki veren yok',
  public._val($q$select count(*) from public.comment_reaction_friends(array['c1000000-0000-4000-8000-000000000001']::uuid[], 2)$q$) = '0');
select public._check(8, 'oturumlu yabancı: özel promptun yorumu sayılmaz',
  public._val($q$select count(*) from public.comment_reaction_counts(array['c1000000-0000-4000-8000-000000000003']::uuid[])$q$) = '0');
select public._as_user(:alice);
select public._check(9, 'sahibi: özel promptun yorumunun sayıları okunur',
  public._val($q$select string_agg(reaction || ':' || n, ',') from public.comment_reaction_counts(array['c1000000-0000-4000-8000-000000000003']::uuid[])$q$) = 'love:1');
reset role;

-- 3. Yetkiler: ikisi de ziyaretçiye ve oturumluya açık, `public`e kapalı
select public._check(10, 'EXECUTE: anon + authenticated evet',
  has_function_privilege('anon', 'public.comment_reaction_counts(uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.comment_reaction_friends(uuid[], integer)', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
