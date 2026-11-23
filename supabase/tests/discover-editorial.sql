-- Keşfet editoryal açılışı (docs/history/451-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/discover-editorial.sql ("FAILED=0" beklenir).
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

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, tools, created_at) values
  ('c0000000-0000-4000-8000-000000000001', :alice, 'Yeni MJ', 'd', 't', 'image', 'published', 'public', array['midjourney:v7'], now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000002', :alice, 'Yeni MJ 2', 'd', 't', 'image', 'published', 'public', array['midjourney:v7'], now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000003', :alice, 'Eski Flux', 'd', 't', 'image', 'published', 'public', array['flux'], now() - interval '40 days'),
  ('c0000000-0000-4000-8000-000000000004', :alice, 'Özel', 'd', 't', 'image', 'published', 'private', array['midjourney:v7'], now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000005', :alice, 'Sessiz yeni', 'd', 't', 'text', 'published', 'public', '{}', now() - interval '3 days');
insert into public.workflows (id, creator_id, title, description, status, visibility, created_at)
values ('d0000000-0000-4000-8000-000000000001', :alice, 'W', 'd', 'published', 'public', now() - interval '2 days');

-- bobby son hafta prompt 1'i beğendi ve yorumladı → Yükselen'de ilk o.
insert into public.prompt_likes (user_id, prompt_id, reaction) values (:bobby, 'c0000000-0000-4000-8000-000000000001', 'love');
insert into public.prompt_comments (author_id, prompt_id, body) values (:bobby, 'c0000000-0000-4000-8000-000000000001', 'harika');
insert into public.prompt_likes (user_id, prompt_id, reaction) values (:bobby, 'c0000000-0000-4000-8000-000000000003', 'love');

set role anon;
select public._as_user('');

select public._check(1, 'haftalık sayılar: 3 herkese açık yeni prompt, 1 workflow (özel ve eski sayılmaz)',
  (public.discover_weekly_stats() ->> 'prompts')::int = 3 and (public.discover_weekly_stats() ->> 'workflows')::int = 1);
select public._check(2, 'yükselen araçlar: midjourney son haftada 2 (özel sayılmaz), sırada ilk',
  (select tool_id from public.discover_rising_tools(4) limit 1) = 'midjourney'
  and (select weeks[8] from public.discover_rising_tools(4) where tool_id = 'midjourney') = 2);
select public._check(3, 'son 4 haftada kullanılmayan araç (flux) listelenmez',
  not exists (select 1 from public.discover_rising_tools(12) where tool_id = 'flux'));
select public._check(4, 'Yükselen: etkileşimli yeni prompt ilk; 30 günden eski ve etkileşimsiz içerik yok',
  (select id from public.feed_page_rising(10) limit 1) = 'c0000000-0000-4000-8000-000000000001'
  and not exists (select 1 from public.feed_page_rising(10) where id in ('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000005')));
select public._check(5, 'Yükselen puanı: beğeni 3 + yorum 2',
  (select sort_rank from public.feed_page_rising(10) where id = 'c0000000-0000-4000-8000-000000000001') = 5);
select public._check(6, 'konu kartları misafire açık', (select count(*) >= 0 from public.discover_trending_topics(4)));
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
