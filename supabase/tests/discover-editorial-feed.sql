-- Keşfet editoryal açılışı tek istek (docs/history/465-*): `discover_editorial_feed()` her bölümde, aynı argümanlı `feed_page` /
-- `feed_page_proven` çağrısıyla BİREBİR aynı satırları aynı sırayla döndürür; misafir ve oturumlu çağırabilir, görünürlük çağıranındır.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/discover-editorial-feed.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

-- Her bölüme birden fazla aday (sıra ve sınır sınansın), bir de gizli içerik.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at, like_count) values
  ('e1000000-0000-4000-8000-000000000001', :bobby, 'Metin 1', 'd', 'm', 'text', 'published', 'public', now() - interval '1 hour', 5),
  ('e1000000-0000-4000-8000-000000000002', :bobby, 'Metin 2', 'd', 'm', 'text', 'published', 'public', now() - interval '2 hours', 9),
  ('e1000000-0000-4000-8000-000000000003', :alice, 'Metin 3', 'd', 'm', 'text', 'published', 'public', now() - interval '3 hours', 1),
  ('e1000000-0000-4000-8000-000000000004', :bobby, 'Ses 1', 'd', 'm', 'audio', 'published', 'public', now() - interval '1 hour', 2),
  ('e1000000-0000-4000-8000-000000000005', :alice, 'Ses 2', 'd', 'm', 'audio', 'published', 'public', now() - interval '2 hours', 7),
  ('e1000000-0000-4000-8000-000000000006', :bobby, 'Video 1', 'd', 'm', 'video', 'published', 'public', now() - interval '1 hour', 3),
  ('e1000000-0000-4000-8000-000000000007', :bobby, 'Gizli metin', 'd', 'm', 'text', 'published', 'private', now() - interval '1 hour', 99);
insert into public.workflows (id, creator_id, title, status, visibility, created_at, like_count) values
  ('e2000000-0000-4000-8000-000000000001', :bobby, 'Akış 1', 'published', 'public', now() - interval '1 hour', 1),
  ('e2000000-0000-4000-8000-000000000002', :alice, 'Akış 2', 'published', 'public', now() - interval '2 hours', 8);
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, created_at, like_count) values
  ('e3000000-0000-4000-8000-000000000001', :bobby, 'İstek 1', 'd', false, 'public', now() - interval '1 hour', 1),
  ('e3000000-0000-4000-8000-000000000002', :alice, 'İstek 2', 'd', false, 'public', now() - interval '2 hours', 4),
  ('e3000000-0000-4000-8000-000000000003', :alice, 'İstek 3', 'd', false, 'public', now() - interval '3 hours', 2);

create or replace function public._same(p_who text) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform public._as_user(p_who);
  select
    (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by pos), '[]') from public.discover_editorial_feed() where section = 'proven')
      = (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by o), '[]') from public.feed_page_proven(null, null, null, null, 1, null, null, null) with ordinality f(kind, id, created_at, sort_rank, o))
    and (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by pos), '[]') from public.discover_editorial_feed() where section = 'text')
      = (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by o), '[]') from public.feed_page('all', 'recommended', array['prompt'], 'text', null, null, 2, null, null, null) with ordinality f(kind, id, created_at, sort_rank, o))
    and (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by pos), '[]') from public.discover_editorial_feed() where section = 'audio')
      = (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by o), '[]') from public.feed_page('all', 'recommended', array['prompt'], 'audio', null, null, 1, null, null, null) with ordinality f(kind, id, created_at, sort_rank, o))
    and (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by pos), '[]') from public.discover_editorial_feed() where section = 'video')
      = (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by o), '[]') from public.feed_page('all', 'recommended', array['prompt'], 'video', null, null, 1, null, null, null) with ordinality f(kind, id, created_at, sort_rank, o))
    and (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by pos), '[]') from public.discover_editorial_feed() where section = 'workflow')
      = (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by o), '[]') from public.feed_page('all', 'recommended', array['workflow'], null, null, null, 1, null, null, null) with ordinality f(kind, id, created_at, sort_rank, o))
    and (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by pos), '[]') from public.discover_editorial_feed() where section = 'request')
      = (select coalesce(jsonb_agg(jsonb_build_array(kind, id, sort_rank) order by o), '[]') from public.feed_page('all', 'recommended', array['request'], null, null, null, 2, null, null, null, true) with ordinality f(kind, id, created_at, sort_rank, o))
    into ok;
  return ok;
end $$;
grant execute on function public._same(text) to public;

set role anon;
select public._check(1, 'misafir: her bölüm aynı argümanlı feed_page / feed_page_proven ile birebir aynı', public._same(''));
reset role;
set role authenticated;
select public._check(2, 'oturumlu: her bölüm birebir aynı', public._same(:alice));
select public._as_user(:alice);
select public._check(3, 'bölüm sınırları korunur (metin 2, ses 1, video 1, workflow 1, istek 2)',
  (select count(*) from public.discover_editorial_feed() where section = 'text') = 2
  and (select count(*) from public.discover_editorial_feed() where section = 'audio') = 1
  and (select count(*) from public.discover_editorial_feed() where section = 'video') = 1
  and (select count(*) from public.discover_editorial_feed() where section = 'workflow') = 1
  and (select count(*) from public.discover_editorial_feed() where section = 'request') = 2);
select public._check(4, 'gizli içerik hiçbir bölümde yok',
  not exists (select 1 from public.discover_editorial_feed() where id = 'e1000000-0000-4000-8000-000000000007'));
reset role;
select public._check(5, 'INVOKER (görünürlük çağıranın), STABLE, misafir + oturumlu çağırabilir',
  (select not prosecdef and provolatile = 's' from pg_proc where oid = 'public.discover_editorial_feed()'::regprocedure)
  and has_function_privilege('anon', 'public.discover_editorial_feed()', 'execute')
  and has_function_privilege('authenticated', 'public.discover_editorial_feed()', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
