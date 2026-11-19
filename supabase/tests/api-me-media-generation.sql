-- Taslağa görsel eklemede İDEMPOTENS (20261211100000_api_me_media_generation_id.sql; docs/history/438-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-me-media-generation.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başkası. p1 benim taslak görsel promptum, p2 başka bir taslak görsel promptum, p3 benim YAYINDA görsel promptum.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set meid '11111111-1111-4111-8111-111111111111'
\set p1 'a8000000-0000-4000-8000-000000000001'
\set p2 'a8000000-0000-4000-8000-000000000002'
\set p3 'a8000000-0000-4000-8000-000000000003'

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id, deleted_at) values
  (:'p1', :me, 'P1 taslak görsel', 'd', 'metin', 'image', 'draft', 'private', null, null),
  (:'p2', :me, 'P2 taslak görsel', 'd', 'metin', 'image', 'draft', 'private', null, null),
  (:'p3', :me, 'P3 yayında görsel', 'd', 'metin', 'image', 'published', 'public', null, null);

grant select, insert, delete on storage.objects to anon, authenticated;
insert into storage.objects (bucket_id, name, owner)
select 'prompt-media', '11111111-1111-4111-8111-111111111111/b1000000-0000-4000-8000-00000000000' || n || '.png', :me from generate_series(1, 9) n;

-- Yardımcı: dosya numarası → yol + kimlik adresi ile 7 argümanlı commit.
create or replace function public._commitg(p uuid, n int, gen text, w int default 800, h int default 600, alt text default null) returns jsonb language sql as $$
  select public.api_me_media_commit(p, '11111111-1111-4111-8111-111111111111/b1000000-0000-4000-8000-00000000000' || n || '.png',
    'https://x.supabase.co/storage/v1/object/public/prompt-media/11111111-1111-4111-8111-111111111111/b1000000-0000-4000-8000-00000000000' || n || '.png', w, h, alt, gen) $$;
grant execute on function public._commitg(uuid, int, text, int, int, text) to public;

set role authenticated;
select public._as_user(:me);

-- --- begin / commit temel akış ---------------------------------------------------------------------------------------------------------------------------
select public._check(1, 'begin(p, generation_id): a fresh job → ok, my id, nothing existing',
  (select r->>'ok' = 'true' and r->>'userId' = :'meid' and (r->>'count')::int = 0 and r->'existing' is null from (select public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T10:00') r) s));

create temp table _c2 as select public._commitg(:'p1', 1, 'visual_trend_2026-11-19T10:00', 1600, 900, ' Tilki ') as r;
select public._check(2, 'commit with generation_id: ok, position 0, and the id is stored on the row',
  (select r->>'ok' = 'true' and (r->>'position')::int = 0 and (r->>'count')::int = 1 and r->>'duplicate' is null from _c2)
  and exists (select 1 from public.prompt_media m where m.prompt_id = :'p1' and m.generation_id = 'visual_trend_2026-11-19T10:00' and m.alt = 'Tilki'));

-- --- İdempotens ------------------------------------------------------------------------------------------------------------------------------------------
select public._check(3, 'begin again with the SAME generation_id → ok + the first attachment as `existing` (no second upload needed)',
  (select r->>'ok' = 'true' and (r->'existing'->>'position')::int = 0 and (r->'existing'->>'width')::int = 1600 and (r->'existing'->>'height')::int = 900
          and (r->'existing'->>'mediaId')::uuid = (select id from public.prompt_media where prompt_id = :'p1' and generation_id = 'visual_trend_2026-11-19T10:00')
     from (select public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T10:00') r) s));

create temp table _c4 as select public._commitg(:'p1', 2, 'visual_trend_2026-11-19T10:00', 640, 480) as r;
select public._check(4, 'commit again with the SAME generation_id (a lost race, a different file) → duplicate=true, the FIRST row, no new row',
  (select r->>'ok' = 'true' and r->>'duplicate' = 'true' and (r->>'position')::int = 0 and (r->>'count')::int = 1 and (r->>'width')::int = 1600 and (r->>'height')::int = 900 from _c4)
  and (select (r->>'mediaId')::uuid = (select id from public.prompt_media where prompt_id = :'p1' and generation_id = 'visual_trend_2026-11-19T10:00') from _c4)
  and (select count(*) = 1 from public.prompt_media where prompt_id = :'p1'));

create temp table _c5 as select n, public._commitg(:'p1', f, g) as r from (values (1, 3, 'visual_trend_2026-11-19T11:00'), (2, 4, null), (3, 5, null)) v(n, f, g);
select public._check(5, 'a DIFFERENT generation_id adds a new image at the next position; a null id adds without any idempotency',
  (select bool_and((r->>'position')::int = n and r->>'duplicate' is null and r->>'ok' = 'true') from _c5)
  and (select count(*) = 4 from public.prompt_media where prompt_id = :'p1'));

select public._check(6, 'with 4 images: a NEW job → too_many_images, but retrying an already-attached job still succeeds (existing) — begin and commit',
  public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T12:00')->>'code' = 'too_many_images'
  and public._commitg(:'p1', 6, 'visual_trend_2026-11-19T12:00')->>'code' = 'too_many_images'
  and public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T11:00')->>'ok' = 'true'
  and public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T11:00')->'existing' is not null
  and public._commitg(:'p1', 6, 'visual_trend_2026-11-19T11:00')->>'duplicate' = 'true'
  and (select count(*) = 4 from public.prompt_media where prompt_id = :'p1'));

create temp table _c7 as select public._commitg(:'p2', 7, 'visual_trend_2026-11-19T10:00') as r;
select public._check(7, 'the id is scoped to the prompt: the same generation_id on ANOTHER draft is a separate attachment',
  (select (r->>'position')::int = 0 and r->>'duplicate' is null and r->>'ok' = 'true' from _c7)
  and (select count(*) = 1 from public.prompt_media where prompt_id = :'p2'));

-- --- Biçim ------------------------------------------------------------------------------------------------------------------------------------------------
select public._check(8, 'a malformed generation_id is refused by begin AND commit (and nothing is written)',
  (select bool_and(public.api_me_media_begin(:'p2', g)->>'code' = 'invalid_generation_id') from unnest(array['has space', '-lead', repeat('a', 121), 'a/b', 'x;y', '']) g)
  and (select bool_and(public._commitg(:'p2', 8, g)->>'code' = 'invalid_generation_id') from unnest(array['has space', '-lead', repeat('a', 121), 'a/b', 'x;y', '']) g)
  and (select count(*) = 1 from public.prompt_media where prompt_id = :'p2'));
select public._check(9, 'valid shapes pass (1 char, 120 chars, . _ : -)',
  public.api_me_media_begin(:'p2', 'a')->>'ok' = 'true' and public.api_me_media_begin(:'p2', repeat('a', 120))->>'ok' = 'true' and public.api_me_media_begin(:'p2', 'x.y_z:1-2')->>'ok' = 'true');

-- --- Tablo kısıtları ------------------------------------------------------------------------------------------------------------------------------------
reset role;
select public._check(10, 'DB constraints: the CHECK rejects a bad id and the partial unique index rejects a duplicate (prompt, generation_id) even by a direct insert',
  public._try($q$ insert into public.prompt_media (prompt_id, url, width, height, position, generation_id) values ('a8000000-0000-4000-8000-000000000002', 'https://x.supabase.co/storage/v1/object/public/prompt-media/u/1.png', 1, 1, 5, 'bad id') $q$) ilike '%generation_id_check%'
  and public._try($q$ insert into public.prompt_media (prompt_id, url, width, height, position, generation_id) values ('a8000000-0000-4000-8000-000000000002', 'https://x.supabase.co/storage/v1/object/public/prompt-media/u/2.png', 1, 1, 6, 'visual_trend_2026-11-19T10:00') $q$) ilike '%prompt_media_generation_uniq%'
  and public._try($q$ insert into public.prompt_media (prompt_id, url, width, height, position, generation_id) values ('a8000000-0000-4000-8000-000000000002', 'https://x.supabase.co/storage/v1/object/public/prompt-media/u/3.png', 1, 1, 7, null) $q$) = 'ok'
  and public._try($q$ insert into public.prompt_media (prompt_id, url, width, height, position, generation_id) values ('a8000000-0000-4000-8000-000000000002', 'https://x.supabase.co/storage/v1/object/public/prompt-media/u/4.png', 1, 1, 8, null) $q$) = 'ok');

-- --- Aynı sınırlar eski kurallar gibi geçerli --------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:me);
select public._check(11, 'the old rules still hold in the new overloads: published → not_draft; unknown → not_found',
  public.api_me_media_begin(:'p3', 'job-x')->>'code' = 'not_draft'
  and public._commitg(:'p3', 9, 'job-x')->>'code' = 'not_draft'
  and public.api_me_media_begin('a8000000-0000-4000-8000-0000000000ff', 'job-x')->>'code' = 'not_found');

select public._as_user(:ot);
select public._check(12, 'the other user cannot see or reuse MY generation ids (begin → not_found, no `existing` leak)',
  public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T10:00')->>'code' = 'not_found'
  and public.api_me_media_begin(:'p1', 'visual_trend_2026-11-19T10:00')->'existing' is null);

-- --- Eski imzalar (expand): henüz deploy edilmemiş eski Edge Function çalışmaya devam eder ---------------------------------------------------------------
select public._as_user(:me);
select public._check(13, 'the old one-argument begin and six-argument commit still exist and work (no ambiguity with the new overloads)',
  public.api_me_media_begin(:'p2')->>'ok' = 'true'
  and (public.api_me_media_commit(:'p2', :'meid' || '/b1000000-0000-4000-8000-000000000009.png',
        'https://x.supabase.co/storage/v1/object/public/prompt-media/' || :'meid' || '/b1000000-0000-4000-8000-000000000009.png', 10, 10)->>'ok') = 'true');

set role anon;
select public._as_user('');
select public._check(14, 'anon cannot call the new overloads',
  public._try($q$ select public.api_me_media_begin('a8000000-0000-4000-8000-000000000001', 'x') $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_media_commit('a8000000-0000-4000-8000-000000000001', 'x', 'y', 1, 1, null, 'x') $q$) ilike '%permission denied%');

reset role;
select n, name, case when ok then 'PASS' else 'FAIL' end as result, detail from public._results order by n;
select 'FAILED=' || count(*) as summary from public._results where not ok;
