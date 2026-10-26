-- admin_bulk_delete_prompts(ids, force) + admin_bulk_delete_impact(ids) + taslak silerken etiket sayacı (docs/history/252-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar stub'larla temiz bir yerel PostgreSQL'e oynatıldıktan sonra süper kullanıcıyla:
--   psql -d <db> -f admin-bulk-delete-force.sql      (kurulum: supabase/tests/run-local.sh). "FAILED=0" beklenir.
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
insert into public.tags (slug, label) values ('ornek', 'Örnek') on conflict do nothing;

-- Moderatör: A (yayında, etiketli; beğeni+yorum+kayıt+alıntı+workflow adımı alacak) · B (yayında, etiketli, dokunulmamış)
--            D1..D4 (taslak, aynı etiket) · kullanıcının yayınlı promptu U (aynı etiket; sayaca katılır)
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', :'mod', 'A', '', 'a', 'text', 'published', 'public'),
  ('aaaaaaaa-0000-4000-8000-0000000000b1', :'mod', 'B', '', 'b', 'text', 'published', 'public'),
  ('bbbbbbbb-0000-4000-8000-0000000000e1', :'user', 'U', '', 'u', 'text', 'published', 'public');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
  select ('dddddddd-0000-4000-8000-00000000000' || g)::uuid, :'mod', 'D' || g, '', 'd' || g, 'text', 'draft', 'private' from generate_series(1, 4) g;
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'ornek'), ('aaaaaaaa-0000-4000-8000-0000000000b1', 'ornek'), ('bbbbbbbb-0000-4000-8000-0000000000e1', 'ornek');
insert into public.prompt_tags (prompt_id, tag_slug) select ('dddddddd-0000-4000-8000-00000000000' || g)::uuid, 'ornek' from generate_series(1, 4) g;

select public._check(1, 'setup: counter counts only the 3 published tagged prompts (drafts never count)',
  (select prompt_usage_count = 3 from public.tags where slug = 'ornek'), (select prompt_usage_count::text from public.tags where slug = 'ornek'));

-- A'ya başkasının etkileşimleri
insert into public.prompt_likes (prompt_id, user_id) values ('aaaaaaaa-0000-4000-8000-0000000000a1', :'user');
insert into public.prompt_comments (prompt_id, author_id, body) values ('aaaaaaaa-0000-4000-8000-0000000000a1', :'user', 'güzel');
insert into public.collections (id, owner_id, name) values ('eeeeeeee-0000-4000-8000-000000000001', :'user', 'Benim');
insert into public.collection_items (collection_id, prompt_id) values ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1');
insert into public.content_quotes (author_id, content_type, prompt_id, note) values (:'user', 'prompt', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'alıntı');
insert into public.workflows (id, creator_id, title, description) values ('cccccccc-0000-4000-8000-000000000001', :'user', 'W', '');
insert into public.workflow_steps (workflow_id, position, title, step_type, prompt_id) values ('cccccccc-0000-4000-8000-000000000001', 0, 's', 'prompt', 'aaaaaaaa-0000-4000-8000-0000000000a1');

select public._check(2, 'new functions are closed to anon, open to authenticated',
  not has_function_privilege('anon', 'public.admin_bulk_delete_prompts(uuid[],boolean)', 'execute')
  and not has_function_privilege('anon', 'public.admin_bulk_delete_impact(uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.admin_bulk_delete_prompts(uuid[],boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_bulk_delete_impact(uuid[])', 'execute'));

-- ===================== normal kullanıcı =====================
set role authenticated; select public._as_user(:'user');
select public._check(3, 'a non-moderator is refused by both new functions',
  public._try($$select public.admin_bulk_delete_impact(array['bbbbbbbb-0000-4000-8000-0000000000e1']::uuid[])::text$$) like 'ERR:Yetkisiz.%'
  and public._try($$select public.admin_bulk_delete_prompts(array['bbbbbbbb-0000-4000-8000-0000000000e1']::uuid[], true)::text$$) like 'ERR:Yetkisiz.%');
reset role;
select public._check(4, 'the non-moderator prompt is untouched', (select count(*) = 1 from public.prompts where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'));

-- ===================== etki sayımı =====================
set role authenticated; select public._as_user(:'mod');
create temp table _imp as select public.admin_bulk_delete_impact(array[
  'aaaaaaaa-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-0000000000b1','dddddddd-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-0000000000e1']::uuid[]) as r;
reset role;
select public._check(10, 'impact: counts what goes with the prompts (only the caller''s OWN ones are counted; the other user''s id is ignored)',
  (select (r ->> 'prompts')::int = 3 and (r ->> 'engaged')::int = 1 and (r ->> 'likes')::int = 1 and (r ->> 'comments')::int = 1 and (r ->> 'saves')::int = 1
          and (r ->> 'quotes')::int = 1 and (r ->> 'workflowSteps')::int = 1 and (r ->> 'communityPosts')::int = 0 and (r ->> 'spaceItems')::int = 0
          and (r ->> 'sharedInMessages')::int = 0 from _imp), (select r::text from _imp));
select public._check(11, 'impact writes nothing (A still there with its engagement)',
  (select count(*) = 1 from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and like_count = 1)
  and (select count(*) = 1 from public.workflow_steps where prompt_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'));

-- ===================== force = false: eski davranış =====================
set role authenticated; select public._as_user(:'mod');
create temp table _soft as select public.admin_bulk_delete_prompts(array['aaaaaaaa-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-0000000000b1']::uuid[], false) as r;
create temp table _legacy as select public.admin_bulk_delete_prompts(array['aaaaaaaa-0000-4000-8000-0000000000a1']::uuid[]) as r;
reset role;
select public._check(20, 'force=false: the engaged prompt is skipped, the untouched one goes (same as the 1-argument form)',
  (select (r ->> 'affected')::int = 1 and (r ->> 'skipped')::int = 1 from _soft)
  and (select (r ->> 'affected')::int = 0 and (r ->> 'skipped')::int = 1 from _legacy)
  and (select count(*) = 1 from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000a1')
  and (select count(*) = 0 from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000b1'));
select public._check(21, 'deleting a PUBLISHED prompt lowers the tag counter once (3 → 2)',
  (select prompt_usage_count = 2 from public.tags where slug = 'ornek'), (select prompt_usage_count::text from public.tags where slug = 'ornek'));

-- ===================== taslak silme: sayaç düşmez =====================
set role authenticated; select public._as_user(:'mod');
create temp table _drafts as select public.admin_bulk_delete_prompts(array[
  'dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000004']::uuid[], false) as r;
reset role;
select public._check(30, 'deleting 4 DRAFTS removes them and their tag links',
  (select (r ->> 'affected')::int = 4 from _drafts)
  and (select count(*) = 0 from public.prompts where title like 'D_')
  and (select count(*) = 0 from public.prompt_tags where prompt_id::text like 'dddddddd-%'));
select public._check(31, 'deleting drafts does NOT lower the counter (still 2: A and the other user''s prompt)',
  (select prompt_usage_count = 2 from public.tags where slug = 'ornek'), (select prompt_usage_count::text from public.tags where slug = 'ornek'));

-- ===================== force = true =====================
set role authenticated; select public._as_user(:'mod2');
select public._check(40, 'another moderator cannot force-delete the first moderator''s prompt',
  (public.admin_bulk_delete_prompts(array['aaaaaaaa-0000-4000-8000-0000000000a1']::uuid[], true) ->> 'affected')::int = 0);
reset role;
select public._check(41, 'it is still there', (select count(*) = 1 from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'));

set role authenticated; select public._as_user(:'mod');
create temp table _force as select public.admin_bulk_delete_prompts(array['aaaaaaaa-0000-4000-8000-0000000000a1','bbbbbbbb-0000-4000-8000-0000000000e1']::uuid[], true) as r;
reset role;
select public._check(42, 'force=true deletes the engaged own prompt but never another user''s prompt',
  (select (r ->> 'affected')::int = 1 and (r ->> 'skipped')::int = 1 from _force)
  and (select count(*) = 0 from public.prompts where id = 'aaaaaaaa-0000-4000-8000-0000000000a1')
  and (select count(*) = 1 from public.prompts where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'));
select public._check(43, 'others'' likes, comments, saves and quotes of the deleted prompt went with it (CASCADE)',
  (select count(*) = 0 from public.prompt_likes where prompt_id = 'aaaaaaaa-0000-4000-8000-0000000000a1')
  and (select count(*) = 0 from public.prompt_comments where prompt_id = 'aaaaaaaa-0000-4000-8000-0000000000a1')
  and (select count(*) = 0 from public.collection_items where prompt_id = 'aaaaaaaa-0000-4000-8000-0000000000a1')
  and (select count(*) = 0 from public.content_quotes where prompt_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'));
select public._check(44, 'the other user''s workflow and collection survive; the workflow step is emptied (SET NULL), not deleted',
  (select count(*) = 1 from public.workflows where id = 'cccccccc-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.collections where id = 'eeeeeeee-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.workflow_steps where workflow_id = 'cccccccc-0000-4000-8000-000000000001' and prompt_id is null));
select public._check(45, 'the tag counter now counts only the other user''s published prompt (1)',
  (select prompt_usage_count = 1 from public.tags where slug = 'ornek'), (select prompt_usage_count::text from public.tags where slug = 'ornek'));

select public._check(50, 'audit log: the force flag is recorded (2 forced calls incl. the refused-in-effect one, 3+ normal)',
  (select count(*) filter (where (details ->> 'force')::boolean) = 2 and count(*) filter (where not (details ->> 'force')::boolean) >= 3
     from public.admin_audit_log where action = 'bulk_delete_prompts' and details ? 'force'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
