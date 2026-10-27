-- admin_bulk_set_prompt_taxonomy + Odak "Medya" kuralı (docs/history/260-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar stub'larla temiz bir yerel PostgreSQL'e oynatıldıktan sonra süper kullanıcıyla:
--   psql -d <db> -f admin-bulk-taxonomy.sql      (kurulum: supabase/tests/run-local.sh). "FAILED=0" beklenir.
\pset pager off
\set ON_ERROR_STOP off

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;
create or replace function public._try(p_sql text) returns text language plpgsql as $$
declare r text;
begin execute p_sql into r; return coalesce(r, 'null');
exception when others then return 'ERR:' || sqlerrm; end $$;
grant execute on function public._try(text) to public;

\set mod  '11111111-1111-4111-8111-111111111111'
\set user '22222222-2222-4222-8222-222222222222'
\set mod2 '33333333-3333-4333-8333-333333333333'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'mod', 'mod@test.dev', '{}'), (:'user', 'user@test.dev', '{}'), (:'mod2', 'mod2@test.dev', '{}');
update public.profiles set role = 'moderator' where id in (:'mod', :'mod2');

-- Moderatör: T1..T3 (metin, kategorisiz) · H (metin, ELLE kategorili: writing) · başka moderatör M2 ve kullanıcı U (metin, kategorisiz)
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, subcategory, status, visibility) values
  ('aaaaaaaa-0000-4000-8000-000000000001', :'mod', 'T1', '', 't1', 'text', null, null, 'published', 'public'),
  ('aaaaaaaa-0000-4000-8000-000000000002', :'mod', 'T2', '', 't2', 'text', null, null, 'published', 'public'),
  ('aaaaaaaa-0000-4000-8000-000000000003', :'mod', 'T3', '', 't3', 'text', null, null, 'published', 'public'),
  ('aaaaaaaa-0000-4000-8000-0000000000f1', :'mod', 'H',  '', 'h',  'text', 'writing', 'story', 'published', 'public'),
  ('bbbbbbbb-0000-4000-8000-000000000001', :'mod2', 'M2', '', 'm2', 'text', null, null, 'published', 'public'),
  ('bbbbbbbb-0000-4000-8000-000000000002', :'user', 'U',  '', 'u',  'text', null, null, 'published', 'public');

select public._check(1, 'function is closed to anon, open to authenticated',
  not has_function_privilege('anon', 'public.admin_bulk_set_prompt_taxonomy(jsonb,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_bulk_set_prompt_taxonomy(jsonb,boolean)', 'execute'));

-- ===================== normal kullanıcı =====================
set role authenticated; select public._as_user(:'user');
select public._check(2, 'a non-moderator is refused',
  public._try($$select public.admin_bulk_set_prompt_taxonomy('[{"id":"bbbbbbbb-0000-4000-8000-000000000002","content_type":"text","category":"coding"}]'::jsonb)::text$$) like 'ERR:Yetkisiz.%');
reset role;
select public._check(3, 'the non-moderator prompt is untouched', (select category is null from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000002'));

-- ===================== moderatör =====================
set role authenticated; select public._as_user(:'mod');
select public._check(4, 'bad input shapes are refused (null, empty, not an array, > 200)',
  public._try($$select public.admin_bulk_set_prompt_taxonomy(null)::text$$) like 'ERR:bad_items%'
  and public._try($$select public.admin_bulk_set_prompt_taxonomy('[]'::jsonb)::text$$) like 'ERR:empty%'
  and public._try($$select public.admin_bulk_set_prompt_taxonomy('{}'::jsonb)::text$$) like 'ERR:bad_items%'
  and public._try($$select public.admin_bulk_set_prompt_taxonomy((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'content_type', 'text', 'category', 'coding')) from generate_series(1, 201)))::text$$) like 'ERR:too_many_items%');

create temp table r1 as
select public.admin_bulk_set_prompt_taxonomy(jsonb_build_array(
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000001', 'content_type', 'text',  'category', 'coding',    'subcategory', 'python'),
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000002', 'content_type', 'video', 'category', 'cinematic', 'subcategory', 'trailer'),
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000003', 'content_type', 'image', 'category', 'human_character', 'subcategory', 'no_such_sub'),
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'content_type', 'text',  'category', 'coding'),
  jsonb_build_object('id', 'bbbbbbbb-0000-4000-8000-000000000001', 'content_type', 'text',  'category', 'coding'),
  jsonb_build_object('id', 'bbbbbbbb-0000-4000-8000-000000000002', 'content_type', 'text',  'category', 'coding')
)) as r;
reset role;

select public._check(5, 'three own uncategorized prompts change; the hand-categorized one, another moderator''s and a user''s do not',
  (select (r->>'affected')::int = 3 and (r->>'skipped')::int = 3 from r1), (select r::text from r1));
select public._check(6, 'type + category + subcategory are written (text/coding/python · video/cinematic/trailer)',
  (select content_type = 'text' and category = 'coding' and subcategory = 'python' from public.prompts where id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and (select content_type = 'video' and category = 'cinematic' and subcategory = 'trailer' from public.prompts where id = 'aaaaaaaa-0000-4000-8000-000000000002'));
select public._check(7, 'an unknown subcategory is dropped but the category is still written, and it is counted',
  (select content_type = 'image' and category = 'human_character' and subcategory is null from public.prompts where id = 'aaaaaaaa-0000-4000-8000-000000000003')
  and (select (r->>'subcategory_dropped')::int = 1 from r1));
select public._check(8, 'the hand-categorized prompt is NOT overwritten by default; counted as already_categorized',
  (select category = 'writing' and subcategory = 'story' from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000f1')
  and (select (r->>'already_categorized')::int = 1 from r1));
select public._check(9, 'another moderator''s and a user''s prompts are untouched; reported as not_mine',
  (select count(*) = 2 from public.prompts where id in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002') and category is null)
  and (select (r->>'not_mine')::int = 2 from r1));
select public._check(10, 'no version, no edit record and no notification is produced by a taxonomy change',
  (select count(*) = 0 from public.prompt_versions where prompt_id in (select id from public.prompts where author_id = :'mod'))
  and (select count(*) = 0 from public.content_edits)
  and (select count(*) = 0 from public.notifications where type = 'prompt_edited'));

-- Geçersiz kayıtlar nedeniyle döner, hiçbiri yazılmaz.
set role authenticated; select public._as_user(:'mod');
create temp table r2 as
select public.admin_bulk_set_prompt_taxonomy(jsonb_build_array(
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000001', 'content_type', 'text',  'category', 'cinematic'),
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000001', 'content_type', 'movie', 'category', 'coding'),
  jsonb_build_object('content_type', 'text', 'category', 'coding')
), true) as r;
reset role;
select public._check(11, 'invalid items (category of another type, unknown type, missing id) are reported with a code and never written',
  (select (r->>'affected')::int = 0 and jsonb_array_length(r->'invalid') = 3
      and r->'invalid'->0->>'code' = 'bad_category' and r->'invalid'->1->>'code' = 'bad_type' and r->'invalid'->2->>'code' = 'bad_id' from r2),
  (select r::text from r2));
select public._check(12, 'the prompt stayed as it was after the invalid call',
  (select content_type = 'text' and category = 'coding' and subcategory = 'python' from public.prompts where id = 'aaaaaaaa-0000-4000-8000-000000000001'));

-- Aynı değerle yeniden çalıştırmak zararsız; overwrite hand-categorized olanı da değiştirir.
set role authenticated; select public._as_user(:'mod');
create temp table r3 as
select public.admin_bulk_set_prompt_taxonomy(jsonb_build_array(
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000001', 'content_type', 'text', 'category', 'coding', 'subcategory', 'python'),
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'content_type', 'text', 'category', 'coding')
), true) as r;
reset role;
select public._check(13, 'idempotent + overwrite: unchanged row is skipped, the hand-categorized one changes only with overwrite',
  (select (r->>'affected')::int = 1 and (r->>'skipped')::int = 1 from r3)
  and (select category = 'coding' and subcategory is null from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'), (select r::text from r3));
select public._check(14, 'the change is audit-logged',
  (select count(*) = 3 from public.admin_audit_log where action = 'bulk_set_prompt_taxonomy'));

-- ===================== Odak "Medya" kuralı =====================
-- V1 video türü + görselsiz · V2 video türü + video çıktısı · V3 ses türü + görseli (prompt_media) · V4 ses türü + yalnız METİN çıktısı · I1 resim türü görselsiz
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at) values
  ('cccccccc-0000-4000-8000-000000000001', :'mod', 'V1', '', 'v1', 'video', 'published', 'public', now() - interval '1 hour'),
  ('cccccccc-0000-4000-8000-000000000002', :'mod', 'V2', '', 'v2', 'video', 'published', 'public', now() - interval '2 hour'),
  ('cccccccc-0000-4000-8000-000000000003', :'mod', 'V3', '', 'v3', 'audio', 'published', 'public', now() - interval '3 hour'),
  ('cccccccc-0000-4000-8000-000000000004', :'mod', 'V4', '', 'v4', 'audio', 'published', 'public', now() - interval '4 hour'),
  ('cccccccc-0000-4000-8000-000000000005', :'mod', 'I1', '', 'i1', 'image', 'published', 'public', now() - interval '5 hour');
insert into public.prompt_media (prompt_id, url, width, height, position) values ('cccccccc-0000-4000-8000-000000000003', 'prompt-media/x/v3.jpg', 800, 600, 0);
insert into public.prompt_results (prompt_id, creator_id, media_type, media_url, thumbnail_url) values
  ('cccccccc-0000-4000-8000-000000000002', :'mod', 'video', 'result-media/x/v2.mp4', 'result-media/x/v2.jpg');
insert into public.prompt_results (prompt_id, creator_id, media_type, text_content) values
  ('cccccccc-0000-4000-8000-000000000004', :'mod', 'text', 'merhaba');

create or replace function public._odak(p_media boolean) returns text language sql as $$
  select coalesce(string_agg(p.title, ',' order by f.created_at desc), '')
    from public.feed_page('all', 'newest', array['prompt'], null, null, null, 100, null, null, null, false, null, null, null, null, null, p_media) f
    join public.prompts p on p.id = f.id
   where p.id::text like 'cccccccc-%' $$;
select public._check(15, 'without the media filter every prompt comes', public._odak(false) = 'V1,V2,V3,V4,I1', public._odak(false));
select public._check(16, 'with the media filter: a video/audio prompt needs a real picture or a playable result — V2 (video result) and V3 (picture) stay; V1, V4 (text result only) and I1 are out',
  public._odak(true) = 'V2,V3', public._odak(true));

-- Geri alma: kategori null → tür yazılır, kategori + alt kategori boşalır (yalnız overwrite ile).
set role authenticated; select public._as_user(:'mod');
create temp table r4 as
select public.admin_bulk_set_prompt_taxonomy(jsonb_build_array(
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000001', 'content_type', 'text', 'category', null, 'subcategory', null),
  jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000002', 'content_type', 'text', 'category', null, 'subcategory', 'trailer')
), true) as r;
reset role;
select public._check(17, 'undo: category null restores the type and clears category + subcategory (a stray subcategory is ignored)',
  (select (r->>'affected')::int = 2 and jsonb_array_length(r->'invalid') = 0 from r4)
  and (select count(*) = 2 from public.prompts where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002') and content_type = 'text' and category is null and subcategory is null),
  (select r::text from r4));
set role authenticated; select public._as_user(:'mod');
select public._check(18, 'undo without overwrite does nothing to a categorized prompt (the safe default holds for null too)',
  public._try($$select (public.admin_bulk_set_prompt_taxonomy('[{"id":"aaaaaaaa-0000-4000-8000-0000000000f1","content_type":"text","category":null}]'::jsonb)->>'affected')$$) = '0');
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' of ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
