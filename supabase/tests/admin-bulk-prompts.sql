-- admin_bulk_set_prompt_visibility / admin_bulk_delete_prompts: yalnız moderatör, yalnız kendi promptları, silmede korumalar (docs/history/251-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar stub'larla temiz bir yerel PostgreSQL'e oynatıldıktan sonra süper kullanıcıyla:
--   psql -d <db> -f admin-bulk-prompts.sql      (kurulum: supabase/tests/run-local.sh). "FAILED=0" beklenir.
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

-- moderatörün 6 taslağı, başkasının (kullanıcı + 2. moderatör) birer promptu, moderatörün bir "istek yanıtı"
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
select ('aaaaaaaa-0000-4000-8000-00000000000' || g)::uuid, :'mod', 'Mod ' || g, '', 'metin ' || g, 'text', 'draft', 'private' from generate_series(1, 6) g;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :'user', 'Kullanıcı taslağı', '', 'k', 'text', 'draft', 'private'),
  ('bbbbbbbb-0000-4000-8000-000000000002', :'mod2', 'Diğer moderatör taslağı', '', 'm', 'text', 'draft', 'private');
insert into public.prompt_tags (prompt_id, tag_slug) select ('aaaaaaaa-0000-4000-8000-00000000000' || g)::uuid, 'ornek' from generate_series(1, 3) g
  where exists (select 1 from public.tags where slug = 'ornek');
insert into public.tags (slug, label) values ('ornek', 'Örnek') on conflict do nothing;
insert into public.prompt_tags (prompt_id, tag_slug) select ('aaaaaaaa-0000-4000-8000-00000000000' || g)::uuid, 'ornek' from generate_series(1, 3) g on conflict do nothing;

select public._check(1, 'anon cannot execute either function',
  not has_function_privilege('anon', 'public.admin_bulk_set_prompt_visibility(uuid[],boolean)', 'execute')
  and not has_function_privilege('anon', 'public.admin_bulk_delete_prompts(uuid[])', 'execute'));

-- ===================== normal kullanıcı =====================
set role authenticated; select public._as_user(:'user');
select public._check(2, 'a non-moderator is refused by both functions',
  public._try($$select public.admin_bulk_set_prompt_visibility(array['bbbbbbbb-0000-4000-8000-000000000001']::uuid[], true)::text$$) like 'ERR:Yetkisiz.%'
  and public._try($$select public.admin_bulk_delete_prompts(array['bbbbbbbb-0000-4000-8000-000000000001']::uuid[])::text$$) like 'ERR:Yetkisiz.%');
reset role;
select public._check(3, 'the non-moderator draft is untouched', (select count(*) = 1 from public.prompts where id = 'bbbbbbbb-0000-4000-8000-000000000001'));

-- ===================== moderatör: yayınla / gizle =====================
set role authenticated; select public._as_user(:'mod');
create temp table _pub as select public.admin_bulk_set_prompt_visibility(
  array['aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002']::uuid[], true) as r;
reset role;
select public._check(10, 'publish: 3 own drafts become published+public; the other users'' ids are skipped (never touched)',
  (select (r ->> 'affected')::int = 3 and (r ->> 'skipped')::int = 2 from _pub)
  and (select count(*) = 3 and bool_and(status = 'published' and visibility = 'public') from public.prompts where title in ('Mod 1','Mod 2','Mod 3'))
  and (select count(*) = 2 and bool_and(status = 'draft' and visibility = 'private') from public.prompts where id::text like 'bbbbbbbb-%'));
set role authenticated; select public._as_user(:'mod');
create temp table _noop as select public.admin_bulk_set_prompt_visibility(array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[], true) as r;
create temp table _hide as select public.admin_bulk_set_prompt_visibility(array['aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000004']::uuid[], false) as r;
reset role;
select public._check(11, 'publishing again is a no-op (already public): affected 0', (select (r ->> 'affected')::int = 0 and (r ->> 'skipped')::int = 1 from _noop));
select public._check(12, 'hide: only PUBLISHED prompts become private (status stays published); drafts are skipped',
  (select (r ->> 'affected')::int = 1 and (r ->> 'skipped')::int = 1 from _hide)
  and (select status = 'published' and visibility = 'private' from public.prompts where title = 'Mod 1')
  and (select status = 'draft' and visibility = 'private' from public.prompts where title = 'Mod 4'));
set role authenticated; select public._as_user(:'mod');
create temp table _show as select public.admin_bulk_set_prompt_visibility(array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[], true) as r;
reset role;
select public._check(13, 'a hidden published prompt can be made public again',
  (select (r ->> 'affected')::int = 1 from _show) and (select visibility = 'public' from public.prompts where title = 'Mod 1'));
set role authenticated; select public._as_user(:'mod');
select public._check(14, 'more than 200 ids and an empty list are rejected',
  public._try($$select public.admin_bulk_set_prompt_visibility((select array_agg(gen_random_uuid()) from generate_series(1, 201)), true)::text$$) like 'ERR:too_many_items%'
  and public._try($$select public.admin_bulk_set_prompt_visibility('{}'::uuid[], true)::text$$) like 'ERR:empty%'
  and public._try($$select public.admin_bulk_delete_prompts((select array_agg(gen_random_uuid()) from generate_series(1, 201)))::text$$) like 'ERR:too_many_items%');
reset role;
select public._check(15, 'tag usage counter grew once per published tagged prompt (no drift from hide/show)',
  (select prompt_usage_count = 3 from public.tags where slug = 'ornek'), (select prompt_usage_count::text from public.tags where slug = 'ornek'));

-- ===================== moderatör: sil =====================
-- Mod 5: beğenisi var · Mod 6: workflow adımında · Mod 4: dokunulmamış · Mod 2: yayında, dokunulmamış
update public.prompts set like_count = 1 where title = 'Mod 5';
insert into public.workflows (id, creator_id, title, description) values ('cccccccc-0000-4000-8000-000000000001', :'mod', 'W', '');
insert into public.workflow_steps (workflow_id, position, title, step_type, prompt_id) values ('cccccccc-0000-4000-8000-000000000001', 0, 's', 'prompt', 'aaaaaaaa-0000-4000-8000-000000000006');
set role authenticated; select public._as_user(:'mod');
create temp table _del as select public.admin_bulk_delete_prompts(
  array['aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000006','bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002']::uuid[]) as r;
reset role;
select public._check(20, 'delete: only untouched OWN prompts go (Mod 2 published, Mod 4 draft); liked, workflow-linked and other users'' are skipped and counted',
  (select (r ->> 'affected')::int = 2 and (r ->> 'skipped')::int = 4 from _del)
  and (select count(*) = 0 from public.prompts where title in ('Mod 2', 'Mod 4'))
  and (select count(*) = 3 from public.prompts where title in ('Mod 5', 'Mod 6', 'Mod 1'))
  and (select count(*) = 2 from public.prompts where id::text like 'bbbbbbbb-%'));
select public._check(21, 'deleting cascades the prompt''s own tag links and the tag counter drops back for the published one',
  (select count(*) = 0 from public.prompt_tags where prompt_id = 'aaaaaaaa-0000-4000-8000-000000000002')
  and (select prompt_usage_count = 2 from public.tags where slug = 'ornek'));

-- başkasının hesabıyla çağrıda moderatör olsa bile kendisinin olmayanı silemez (mod2 → mod'un promptu)
set role authenticated; select public._as_user(:'mod2');
select public._check(22, 'another moderator cannot publish or delete the first moderator''s prompts',
  (public.admin_bulk_set_prompt_visibility(array['aaaaaaaa-0000-4000-8000-000000000003']::uuid[], false) ->> 'affected')::int = 0
  and (public.admin_bulk_delete_prompts(array['aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001']::uuid[]) ->> 'affected')::int = 0);
reset role;
select public._check(23, 'the first moderator''s prompts are still there', (select count(*) = 2 from public.prompts where title in ('Mod 1', 'Mod 3')));

select public._check(30, 'audit log: publish, hide and delete rows with counts and the acting moderator',
  (select count(*) = 7 and count(*) filter (where action = 'bulk_publish_prompts') = 3 and count(*) filter (where action = 'bulk_hide_prompts') = 2
          and count(*) filter (where action = 'bulk_delete_prompts') = 2 from public.admin_audit_log));
select public._check(31, 'the audit log entry of the delete names how many were removed',
  (select (details ->> 'deleted')::int = 2 and (details ->> 'requested')::int = 6 from public.admin_audit_log where action = 'bulk_delete_prompts' and (details ->> 'deleted')::int = 2));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
