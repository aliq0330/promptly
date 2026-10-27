-- feed_page `p_has_media` (Odak "Medya" süzgeci sunucuda) + profile_content_stats (docs/history/254-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/feed-page-media.sql  ("FAILED=0" beklenir).
-- bobby = yazar, carol = ikinci yazar, anon = ziyaretçi.
\pset pager off
\set ON_ERROR_STOP off
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:bobby,'bobby'),(:carol,'carol')) as u(id, name);

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

-- 17 argümanlı çağrı: (kind, id, created_at, sort_rank) satırları; medya süzgeci son argüman.
create or replace function public._fm(p_media boolean, p_limit integer default 50, p_kinds text[] default null,
                                      p_after_rank bigint default null, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint) language sql stable as $$
  select * from public.feed_page('all', 'newest', p_kinds, null, null, null, p_limit, p_after_rank, p_after_created_at, p_after_id,
                                 null::boolean, null::text, null::text, null::uuid[], null::text[], null::text[], p_media)
$$;
grant execute on function public._fm(boolean, integer, text[], bigint, timestamptz, uuid) to public;

-- Yeni → eski: M1 görselli · T1 metin · V1 video türü (görselsiz) · M2 görselli · I1 görselsiz resim · PRIV görselli ama gizli · DRAFT görselli taslak
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at, copy_count) values
  ('a0000000-0000-4000-8000-000000000001', :bobby, 'M1',   'd', 'm', 'image', 'published', 'public',  now() - interval '1 hour',  3),
  ('a0000000-0000-4000-8000-000000000002', :bobby, 'T1',   'd', 'm', 'text',  'published', 'public',  now() - interval '2 hours', 0),
  ('a0000000-0000-4000-8000-000000000003', :bobby, 'V1',   'd', 'm', 'video', 'published', 'public',  now() - interval '3 hours', 0),
  ('a0000000-0000-4000-8000-000000000004', :carol, 'M2',   'd', 'm', 'image', 'published', 'public',  now() - interval '4 hours', 4),
  ('a0000000-0000-4000-8000-000000000005', :carol, 'I1',   'd', 'm', 'image', 'published', 'public',  now() - interval '5 hours', 0),
  ('a0000000-0000-4000-8000-000000000006', :bobby, 'PRIV', 'd', 'm', 'image', 'published', 'private', now() - interval '6 hours', 0),
  ('a0000000-0000-4000-8000-000000000007', :bobby, 'DRAFT','d', 'm', 'image', 'draft',     'public',  now() - interval '7 hours', 0);
insert into public.prompt_media (prompt_id, url, width, height, position)
select id, 'https://x/' || id || '.jpg', 10, 10, 0 from public.prompts where title in ('M1', 'M2', 'PRIV', 'DRAFT');
-- W1 görselli · W2 görselsiz
insert into public.workflows (id, creator_id, title, status, visibility, created_at) values
  ('a1000000-0000-4000-8000-000000000001', :bobby, 'W1', 'published', 'public', now() - interval '30 minutes'),
  ('a1000000-0000-4000-8000-000000000002', :bobby, 'W2', 'published', 'public', now() - interval '40 minutes');
insert into public.workflow_media (workflow_id, url, width, height, position) values ('a1000000-0000-4000-8000-000000000001', 'https://x/w1.jpg', 10, 10, 0);
-- İstek ve hazır ayar görselsiz ama Odak'ta HEP girer
insert into public.prompt_requests (id, author_id, title, description, content_type, visibility, is_draft, created_at) values
  ('a2000000-0000-4000-8000-000000000001', :carol, 'R1', 'd', 'image', 'public', false, now() - interval '20 minutes');
insert into public.presets (id, creator_id, title, content_type, status, visibility, created_at) values
  ('a3000000-0000-4000-8000-000000000001', :bobby, 'S1', 'image', 'published', 'public', now() - interval '10 minutes');
-- Space + alıntı: süzgeç açıkken girmez
insert into public.spaces (id, owner_id, title, visibility, shared_at) values ('a4000000-0000-4000-8000-000000000001', :bobby, 'Space1', 'public', now() - interval '15 minutes');
insert into public.content_quotes (id, author_id, content_type, prompt_id) values ('a5000000-0000-4000-8000-000000000001', :carol, 'prompt', 'a0000000-0000-4000-8000-000000000001');

create or replace function public._titles(p_media boolean, p_limit integer default 50, p_kinds text[] default null) returns text language sql stable as $$
  select coalesce(string_agg(coalesce(p.title, w.title, r.title, s.title, sp.title, 'quote'), ',' order by f.created_at desc, f.id desc), '')
  from public._fm(p_media, p_limit, p_kinds) f
  left join public.prompts p on f.kind = 'prompt' and p.id = f.id
  left join public.workflows w on f.kind = 'workflow' and w.id = f.id
  left join public.prompt_requests r on f.kind = 'request' and r.id = f.id
  left join public.presets s on f.kind = 'preset' and s.id = f.id
  left join public.spaces sp on f.kind = 'space' and sp.id = f.id
$$;
grant execute on function public._titles(boolean, integer, text[]) to public;

-- ===================== süzgeçsiz çağrılar aynı kalır =====================
select public._check(1, 'p_has_media null / false = no filter: same rows as the old 16-argument form and as the 13/11/10-argument wrappers',
  (select array_agg(id order by created_at desc, id desc) from public._fm(null)) = (select array_agg(id order by created_at desc, id desc) from public._fm(false))
  and (select array_agg(id order by created_at desc, id desc) from public._fm(null)) =
      (select array_agg(id order by created_at desc, id desc) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null, null::boolean, null::text, null::text, null::uuid[], null::text[], null::text[]))
  and (select array_agg(id order by created_at desc, id desc) from public._fm(null)) =
      (select array_agg(id order by created_at desc, id desc) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null, null::boolean, null::text, null::text))
  and (select array_agg(id order by created_at desc, id desc) from public._fm(null)) =
      (select array_agg(id order by created_at desc, id desc) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null)),
  public._titles(null));
select public._check(2, 'without the filter every public kind shows (text and picture-less ones too); private/draft never',
  public._titles(false) ~ 'T1' and public._titles(false) ~ 'I1' and public._titles(false) ~ 'W2' and public._titles(false) ~ 'Space1' and public._titles(false) ~ 'quote'
  and public._titles(false) !~ 'PRIV|DRAFT',
  public._titles(false));

-- ===================== medya süzgeci =====================
select public._check(3, 'has_media: prompts with a picture or a video/audio type, workflows with a picture, ALL requests and presets; text and picture-less ones are out',
  public._titles(true) ~ 'M1' and public._titles(true) ~ 'M2' and public._titles(true) ~ 'V1' and public._titles(true) ~ 'W1' and public._titles(true) ~ 'R1' and public._titles(true) ~ 'S1'
  and public._titles(true) !~ 'T1' and public._titles(true) !~ 'I1' and public._titles(true) !~ 'W2',
  public._titles(true));
select public._check(4, 'has_media: Space and quote never come (Odak does not take them)', public._titles(true) !~ 'Space1' and public._titles(true) !~ 'quote', public._titles(true));
select public._check(5, 'has_media only NARROWS: private and draft prompts with a picture stay out',
  public._titles(true) !~ 'PRIV' and public._titles(true) !~ 'DRAFT', public._titles(true));
select public._check(6, 'has_media with the kind filter: prompts only → M1, V1, M2', public._titles(true, 50, array['prompt']) = 'M1,V1,M2', public._titles(true, 50, array['prompt']));

-- ===================== keyset: sayfalar eksiksiz, tekrarsız =====================
create temp table _walk (page int, kind text, id uuid);
do $$
declare
  v_page int := 0;
  v_last record;
  v_count int;
begin
  loop
    v_page := v_page + 1;
    if v_last is null then
      insert into _walk select v_page, f.kind, f.id from public._fm(true, 2) f;
    else
      insert into _walk select v_page, f.kind, f.id from public._fm(true, 2, null, v_last.sort_rank, v_last.created_at, v_last.id) f;
    end if;
    select count(*) into v_count from _walk where page = v_page;
    exit when v_count = 0 or v_page > 20;
    select f.sort_rank, f.created_at, f.id into v_last
      from _walk w join public._fm(true, 50) f on f.id = w.id where w.page = v_page order by f.created_at asc, f.id asc limit 1;
  end loop;
end $$;
select public._check(7, 'keyset paging with has_media: pages of 2 walk the same rows as one big page, no repeats, no gaps',
  (select count(*) = count(distinct id) from _walk)
  and (select array_agg(id order by id) from _walk) = (select array_agg(id order by id) from public._fm(true, 50)),
  (select count(*)::text from _walk));

-- ===================== asıl hata: yüzlerce görselsiz gönderi önde =====================
insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility, created_at)
select :bobby, 'Metin ' || g, 'd', 'm', 'text', 'published', 'public', now() + (g || ' seconds')::interval from generate_series(1, 300) g;
select public._check(8, 'regression: with 300 newer text-only prompts in front, the FIRST has_media page of 18 still returns ALL 6 media posts (before: an empty page → Odak paged ~170 times); the unfiltered page is full of text',
  (select count(*) = 6 from public._fm(true, 18))
  and (select count(*) = 18 from public._fm(false, 18))
  and not exists (select 1 from public._fm(true, 18) f join public.prompts p on p.id = f.id and p.title like 'Metin %'),
  (select count(*)::text from public._fm(true, 18)));

-- ===================== ziyaretçi =====================
set role anon; select public._as_user('');
select public._check(9, 'a visitor can call the 17-argument form; private/draft media prompts stay hidden from them',
  (select count(*) = 6 from public._fm(true, 18)) and public._titles(true) !~ 'PRIV|DRAFT', public._titles(true));
reset role;
select public._check(10, 'anon and authenticated may execute feed_page(17) and profile_content_stats',
  has_function_privilege('anon', 'public.feed_page(text,text,text[],text,text,text,integer,bigint,timestamptz,uuid,boolean,text,text,uuid[],text[],text[],boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.feed_page(text,text,text[],text,text,text,integer,bigint,timestamptz,uuid,boolean,text,text,uuid[],text[],text[],boolean)', 'execute')
  and has_function_privilege('anon', 'public.profile_content_stats(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.profile_content_stats(uuid)', 'execute'));

-- ===================== profile_content_stats =====================
-- bobby: M1 (copy 3) + T1 + V1 + 300 metin = 303 yayında+herkese açık; PRIV (gizli ama yayında) sahibine sayılır; DRAFT sayılmaz; W1/W2 yayında; S1 yayında
-- carol: M2 (copy 4) + I1; R1
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, deleted_at) values
  ('a0000000-0000-4000-8000-000000000008', :bobby, 'DEL', 'd', 'm', 'text', 'published', 'public', now());
insert into public.workflows (id, creator_id, title, status, visibility) values ('a1000000-0000-4000-8000-000000000003', :bobby, 'W3 taslak', 'draft', 'public');
insert into public.prompt_requests (id, author_id, title, description, content_type, visibility, is_draft) values
  ('a2000000-0000-4000-8000-000000000002', :bobby, 'R2 özel', 'd', 'image', 'private', false);

set role anon; select public._as_user('');
create temp table _vis as select public.profile_content_stats(:bobby::uuid) as s;
reset role;
select public._check(11, 'stats for a visitor: only public published prompts (303 = 3 + 300), no private/draft/deleted; reuse sums copy_count; 2 workflows? no — 2 published public; 1 preset; 0 requests (the only one is private)',
  (select (s ->> 'prompts')::int = 303 and (s ->> 'reuse')::int = 3 and (s ->> 'workflows')::int = 2 and (s ->> 'presets')::int = 1 and (s ->> 'requests')::int = 0 from _vis),
  (select s::text from _vis));
set role authenticated; select public._as_user(:bobby);
create temp table _own as select public.profile_content_stats(:bobby::uuid) as s;
reset role;
select public._check(12, 'stats for the owner: also their private published prompt (304) and private request (1); drafts and deleted stay out',
  (select (s ->> 'prompts')::int = 304 and (s ->> 'requests')::int = 1 and (s ->> 'workflows')::int = 2 from _own),
  (select s::text from _own));
select public._check(13, 'stats are a pure count: a prompt list of 3000+ is not needed (counts come back as integers)',
  (select jsonb_typeof(s -> 'prompts') = 'number' and jsonb_typeof(s -> 'reuse') = 'number' from _own));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
