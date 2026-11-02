-- Kişisel API: kimlik bilgisi, İstek / Hazır ayar / Workflow okuma ve TASLAK güncelleme (20261102140000_api_me_content.sql; docs/history/321-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-me-content.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başkası. Edge Function'ın yaptığı gibi: rol + JWT iddiaları kurulup RPC çağrılır.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set pa 'a6000000-0000-4000-8000-000000000001'
\set pb 'a6000000-0000-4000-8000-000000000002'
\set ra 'a6000000-0000-4000-8000-0000000000a1'
\set rb 'a6000000-0000-4000-8000-0000000000a2'
\set rc 'a6000000-0000-4000-8000-0000000000a3'
\set rd 'a6000000-0000-4000-8000-0000000000a4'
\set ro 'a6000000-0000-4000-8000-0000000000a5'
\set sa 'a6000000-0000-4000-8000-0000000000b1'
\set sb 'a6000000-0000-4000-8000-0000000000b2'
\set so 'a6000000-0000-4000-8000-0000000000b3'
\set wa 'a6000000-0000-4000-8000-0000000000c1'
\set wb 'a6000000-0000-4000-8000-0000000000c2'
\set wo 'a6000000-0000-4000-8000-0000000000c3'
\set st1 'a6000000-0000-4000-8000-0000000000d1'
\set st2 'a6000000-0000-4000-8000-0000000000d2'

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

insert into public.conversations (id, kind) values ('e6000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e6000000-0000-4000-8000-000000000001', 'Topluluk', :me);

insert into public.tags (slug, label) values ('neon', 'neon'), ('logo', 'logo'), ('retro', 'retro') on conflict do nothing;
update public.tags set prompt_usage_count = 5, request_usage_count = 5 where slug in ('neon', 'logo', 'retro');

-- Promptlar: pa yayında, pb özel taslak (benim).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  (:'pa', :me, 'Pa yayında', 'd', 'metin A', 'text', 'published', 'public'),
  (:'pb', :me, 'Pb taslak', 'd', 'metin B', 'text', 'draft', 'private');
insert into public.prompt_tags (prompt_id, tag_slug) values (:'pb', 'neon'), (:'pb', 'logo');

-- İstekler: ra benim taslak, rb benim yayında, rc topluluğa özgü, rd silinmiş, ro başkasının taslağı.
insert into public.prompt_requests (id, author_id, title, description, creative_direction, content_type, is_draft, visibility, community_id, deleted_at, created_at) values
  (:'ra', :me, 'Ra taslak', 'istek açıklaması', 'yön', 'image', true, 'private', null, null, now() - interval '4 days'),
  (:'rb', :me, 'Rb yayında', 'd', null, 'text', false, 'public', null, null, now() - interval '3 days'),
  (:'rc', :me, 'Rc topluluk', 'd', null, 'text', false, 'private', 'e6000000-0000-4000-8000-000000000001', null, now() - interval '2 days'),
  (:'rd', :me, 'Rd silinmiş', 'd', null, 'text', false, 'public', null, now(), now() - interval '1 day'),
  (:'ro', :ot, 'Ro başkası', 'd', null, 'text', true, 'private', null, null, now() - interval '6 days');
insert into public.prompt_request_tags (request_id, tag_slug) values (:'ra', 'retro');

-- Hazır ayarlar: sa benim taslak, sb benim yayında, so başkasının taslağı.
insert into public.presets (id, creator_id, title, description, content_type, selection, status, visibility, created_at) values
  (:'sa', :me, 'Sa taslak', 'd', 'image', '{"alan":"değer"}', 'draft', 'private', now() - interval '3 days'),
  (:'sb', :me, 'Sb yayında', 'd', 'image', '{}', 'published', 'public', now() - interval '2 days'),
  (:'so', :ot, 'So başkası', 'd', 'image', '{}', 'draft', 'private', now() - interval '5 days');

-- Workflow'lar: wa benim taslak (2 adım), wb benim yayında, wo başkasının taslağı.
insert into public.workflows (id, creator_id, title, description, content_types, status, visibility, created_at) values
  (:'wa', :me, 'Wa taslak', 'd', array['text', 'image'], 'draft', 'private', now() - interval '3 days'),
  (:'wb', :me, 'Wb yayında', 'd', array['text'], 'published', 'public', now() - interval '2 days'),
  (:'wo', :ot, 'Wo başkası', 'd', array['text'], 'draft', 'private', now() - interval '5 days');
insert into public.workflow_steps (id, workflow_id, position, title, description, instructions, step_type, inputs, outputs, created_at) values
  (:'st1', :'wa', 0, 'Adım bir', 'a1', 'i1', 'prompt', '[]', '[{"id":"o1","label":"Çıktı"}]', now() - interval '2 hours'),
  (:'st2', :'wa', 1, 'Adım iki', 'a2', 'i2', 'prompt', '[]', '[]', now() - interval '1 hour');
insert into public.workflow_tags (workflow_id, tag_slug) values (:'wa', 'logo');

set role authenticated;
select public._as_user(:me);

-- --- Kimlik -------------------------------------------------------------------------------------------------------------------------------------------
select public._check(1, 'whoami: username, display name (and avatar column) of the caller',
  (select count(*) = 1 and bool_and(user_id = :me::uuid and username is not null and username <> '' and display_name = 'Me') from public.api_me_whoami()));

-- --- Listeler -----------------------------------------------------------------------------------------------------------------------------------------
select public._check(2, 'my requests: draft + published, community-only / deleted / others excluded, newest first, status mapped',
  (select array_agg(title || ':' || status order by created_at desc) = array['Rb yayında:published', 'Ra taslak:draft'] from public.api_me_requests()));
select public._check(3, 'requests status filter and limit clamp',
  (select count(*) = 1 and bool_and(title = 'Ra taslak') from public.api_me_requests(20, null, null, 'draft'))
  and (select count(*) = 1 from public.api_me_requests(0)));
select public._check(4, 'keyset: the page after the newest request continues without repeating',
  (select array_agg(title) = array['Ra taslak'] from public.api_me_requests(20, (select created_at from public.api_me_requests(1)), (select id from public.api_me_requests(1)))));
select public._check(5, 'my presets: both mine, others excluded, filter works',
  (select array_agg(title order by created_at desc) = array['Sb yayında', 'Sa taslak'] from public.api_me_presets())
  and (select count(*) = 1 and bool_and(status = 'draft') from public.api_me_presets(20, null, null, 'draft')));
select public._check(6, 'my workflows: content types joined, others excluded',
  (select array_agg(title || ':' || content_type order by created_at desc) = array['Wb yayında:text', 'Wa taslak:text,image'] from public.api_me_workflows()));

-- --- Ayrıntı ------------------------------------------------------------------------------------------------------------------------------------------
select public._check(7, 'request detail: fields, tags, draft status and a millisecond updatedAt token',
  (select d ->> 'title' = 'Ra taslak' and d ->> 'creativeDirection' = 'yön' and d -> 'tags' = '["retro"]'::jsonb and d ->> 'status' = 'draft'
          and (d ->> 'updatedAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
   from (select public.api_me_request(:'ra') as d) q));
select public._check(8, 'preset detail carries the selection', (select public.api_me_preset(:'sa') -> 'selection' = '{"alan":"değer"}'::jsonb));
select public._check(9, 'workflow detail: steps in order with 1-based positions, tags, content types',
  (select d -> 'steps' -> 0 ->> 'title' = 'Adım bir' and (d -> 'steps' -> 0 ->> 'position') = '1' and d -> 'steps' -> 1 ->> 'title' = 'Adım iki'
          and d -> 'tags' = '["logo"]'::jsonb and d -> 'contentTypes' = '["text","image"]'::jsonb
   from (select public.api_me_workflow(:'wa') as d) q));
select public._check(10, 'details of someone else''s, community-only and deleted items are null',
  public.api_me_request(:'ro') is null and public.api_me_request(:'rc') is null and public.api_me_request(:'rd') is null
  and public.api_me_preset(:'so') is null and public.api_me_workflow(:'wo') is null);

-- --- Güncelleme: prompt -------------------------------------------------------------------------------------------------------------------------------
create temp table _t (k text primary key, v timestamptz);
insert into _t select 'pb', updated_at from public.prompts where id = :'pb';
create temp table r11 as select public.api_me_update_draft('prompt', :'pb', '{"title":"Pb yeni","tags":["retro","neon"]}', (select v from _t where k = 'pb')) as r;
select public._check(11, 'update a prompt draft: title + tags replaced, changed list, token advances',
  (select (r ->> 'ok')::boolean and r -> 'changed' = '["title","tags"]'::jsonb from r11)
  and (select title = 'Pb yeni' from public.prompts where id = :'pb')
  and (select array_agg(tag_slug order by tag_slug) = array['neon', 'retro'] from public.prompt_tags where prompt_id = :'pb')
  and (select updated_at > (select v from _t where k = 'pb') from public.prompts where id = :'pb'));
select public._check(12, 'stale token → conflict (and nothing changes); the response tells the current token',
  (select r ->> 'code' = 'conflict' and (r ->> 'currentUpdatedAt') is not null
     from (select public.api_me_update_draft('prompt', :'pb', '{"title":"Üstüne yaz"}', (select v from _t where k = 'pb')) as r) q)
  and (select title = 'Pb yeni' from public.prompts where id = :'pb'));
select public._check(13, 'tag usage counters are untouched when a DRAFT''s tags change',
  (select bool_and(prompt_usage_count = 5 and request_usage_count = 5) from public.tags where slug in ('neon', 'retro', 'logo')));
select public._check(14, 'the token is required', (select r ->> 'code' = 'expected_required' from (select public.api_me_update_draft('prompt', :'pb', '{"title":"x"}', null) as r) q));
select public._check(15, 'published items are refused (prompt, request, preset, workflow)',
  (select public.api_me_update_draft('prompt', :'pa', '{"title":"x"}', (select updated_at from public.prompts where id = :'pa')) ->> 'code') = 'not_draft'
  and (select public.api_me_update_draft('request', :'rb', '{"title":"x"}', (select updated_at from public.prompt_requests where id = :'rb')) ->> 'code') = 'not_draft'
  and (select public.api_me_update_draft('preset', :'sb', '{"title":"x"}', (select updated_at from public.presets where id = :'sb')) ->> 'code') = 'not_draft'
  and (select public.api_me_update_draft('workflow', :'wb', '{"title":"x"}', (select updated_at from public.workflows where id = :'wb')) ->> 'code') = 'not_draft');
select public._check(16, 'someone else''s, community-only, deleted and unknown ids are not_found',
  (select public.api_me_update_draft('request', :'ro', '{"title":"x"}', now()) ->> 'code') = 'not_found'
  and (select public.api_me_update_draft('request', :'rc', '{"title":"x"}', now()) ->> 'code') = 'not_found'
  and (select public.api_me_update_draft('request', :'rd', '{"title":"x"}', now()) ->> 'code') = 'not_found'
  and (select public.api_me_update_draft('preset', :'so', '{"title":"x"}', now()) ->> 'code') = 'not_found'
  and (select public.api_me_update_draft('workflow', 'a6000000-0000-4000-8000-0000000000ff', '{"title":"x"}', now()) ->> 'code') = 'not_found');

-- Doğrulama hataları: yazma YOK (satır ve belirteç aynı kalır).
create temp table _snap as select title, description, prompt_text, content_type, updated_at from public.prompts where id = :'pb';
select public._check(17, 'validation errors: too long / required / bad type / unknown field / empty patch / bad tool — all refused',
  (select public.api_me_update_draft('prompt', :'pb', jsonb_build_object('title', repeat('x', 201)), (select updated_at from _snap)) ->> 'code') = 'too_long'
  and (select public.api_me_update_draft('prompt', :'pb', '{"title":"  "}', (select updated_at from _snap)) ->> 'code') = 'required'
  and (select public.api_me_update_draft('prompt', :'pb', '{"contentType":"gif"}', (select updated_at from _snap)) ->> 'code') = 'invalid_content_type'
  and (select public.api_me_update_draft('prompt', :'pb', '{"status":"published"}', (select updated_at from _snap)) ->> 'code') = 'unknown_field'
  and (select public.api_me_update_draft('prompt', :'pb', '{}', (select updated_at from _snap)) ->> 'code') = 'no_changes'
  and (select public.api_me_update_draft('prompt', :'pb', '{"tools":["Büyük Harf"]}', (select updated_at from _snap)) ->> 'code') = 'invalid_tool');
select public._check(18, 'a refused update writes nothing (even when a valid field comes first)',
  (select public.api_me_update_draft('prompt', :'pb', '{"description":"yeni açıklama","title":""}', (select updated_at from _snap)) ->> 'code') = 'required'
  and (select p.description = s.description and p.title = s.title and p.updated_at = s.updated_at from public.prompts p, _snap s where p.id = :'pb'));
select public._check(19, 'publishing is impossible: visibility / status cannot be patched',
  (select public.api_me_update_draft('prompt', :'pb', '{"visibility":"public"}', (select updated_at from _snap)) ->> 'code') = 'unknown_field'
  and (select status = 'draft' and visibility = 'private' from public.prompts where id = :'pb'));

-- --- Güncelleme: istek / hazır ayar / workflow ----------------------------------------------------------------------------------------------------------
create temp table _t2 as select (select updated_at from public.prompt_requests where id = :'ra') as r, (select updated_at from public.presets where id = :'sa') as s, (select updated_at from public.workflows where id = :'wa') as w;
create temp table r20 as select public.api_me_update_draft('request', :'ra', '{"creativeDirection":"","category":"yok-boyle-bir-kategori"}', (select r from _t2)) as r;
select public._check(20, 'request: direction cleared to null, unknown category dropped with a warning',
  (select (r ->> 'ok')::boolean and r -> 'warnings' = '["category_dropped"]'::jsonb from r20)
  and (select creative_direction is null and category is null from public.prompt_requests where id = :'ra'));
select public._check(201, 'request: description cannot be emptied',
  (select public.api_me_update_draft('request', :'ra', '{"description":""}', (select updated_at from public.prompt_requests where id = :'ra')) ->> 'code') = 'required');
create temp table r21 as select public.api_me_update_draft('preset', :'sa', '{"selection":{"a":"b","c":[1,2]}}', (select s from _t2)) as r;
select public._check(21, 'preset: selection replaced',
  (select (r ->> 'ok')::boolean from r21) and (select selection = '{"a":"b","c":[1,2]}'::jsonb from public.presets where id = :'sa'));
select public._check(211, 'preset: nested objects in the selection are refused',
  (select public.api_me_update_draft('preset', :'sa', '{"selection":{"a":{"deep":1}}}', (select updated_at from public.presets where id = :'sa')) ->> 'code') = 'invalid_selection');
create temp table r22 as select public.api_me_update_draft('workflow', :'wa', '{"title":"Wa yeni","stepEdits":[{"position":2,"instructions":"yeni talimat","title":"Adım iki yeni"}]}', (select w from _t2)) as r;
select public._check(22, 'workflow: metadata + step TEXT edits by 1-based position; structure (prompt link, inputs/outputs, order) is untouched',
  (select (r ->> 'ok')::boolean and r -> 'changed' = '["title","stepEdits"]'::jsonb from r22)
  and (select title = 'Wa yeni' from public.workflows where id = :'wa')
  and (select title = 'Adım iki yeni' and instructions = 'yeni talimat' and description = 'a2' from public.workflow_steps where id = :'st2')
  and (select title = 'Adım bir' and instructions = 'i1' and outputs = '[{"id":"o1","label":"Çıktı"}]'::jsonb and position = 0 from public.workflow_steps where id = :'st1'));
select public._check(23, 'workflow step edits: bad / duplicate / missing positions and structural keys are refused without any write',
  (select public.api_me_update_draft('workflow', :'wa', '{"stepEdits":[{"position":3,"title":"x"}]}', (select updated_at from public.workflows where id = :'wa')) ->> 'code') = 'invalid_steps'
  and (select public.api_me_update_draft('workflow', :'wa', '{"stepEdits":[{"position":1,"title":"x"},{"position":1,"title":"y"}]}', (select updated_at from public.workflows where id = :'wa')) ->> 'code') = 'invalid_steps'
  and (select public.api_me_update_draft('workflow', :'wa', '{"stepEdits":[{"position":1,"inputs":[]}]}', (select updated_at from public.workflows where id = :'wa')) ->> 'code') = 'invalid_steps'
  and (select public.api_me_update_draft('workflow', :'wa', '{"contentType":"video"}', (select updated_at from public.workflows where id = :'wa')) ->> 'code') = 'unknown_field'
  and (select title = 'Adım bir' from public.workflow_steps where id = :'st1'));
create temp table r24 as select public.api_me_update_draft('workflow', :'wa', '{"tags":["neon"]}', (select updated_at from public.workflows where id = :'wa')) as r;
select public._check(24, 'workflow tags replaced',
  (select (r ->> 'ok')::boolean from r24) and (select array_agg(tag_slug) = array['neon'] from public.workflow_tags where workflow_id = :'wa'));

-- --- Başkası / yetkiler -------------------------------------------------------------------------------------------------------------------------------
select public._as_user(:ot);
select public._check(25, 'another user cannot update my draft or read my details',
  (select public.api_me_update_draft('prompt', :'pb', '{"title":"ele geçirildi"}', now()) ->> 'code') = 'not_found'
  and public.api_me_request(:'ra') is null
  and (select count(*) = 0 from public.api_me_requests() where title like 'Ra%'));
reset role;
select public._check(26, 'my draft was not touched by the other user''s attempt', (select title = 'Pb yeni' from public.prompts where id = :'pb'));

set role anon;
select public._as_user('');
select public._check(27, 'anon cannot call any of the new functions',
  public._try($q$ select * from public.api_me_whoami() $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_requests() $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_presets() $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_workflows() $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_request('a6000000-0000-4000-8000-0000000000a1') $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_update_draft('prompt', 'a6000000-0000-4000-8000-000000000002', '{"title":"x"}', now()) $q$) ilike '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
