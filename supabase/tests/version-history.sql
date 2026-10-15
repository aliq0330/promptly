-- Dört içerik türü için sürüm geçmişi: DB davranışı + RLS + geri dönme (docs/history/170-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla temiz bir yerel PostgreSQL'e
-- oynatıldıktan sonra süper kullanıcıyla:  psql -d <db> -f version-history.sql
-- (stub kurulumu: saved-collections.sql başlığı). Sonda PASS/FAIL yazar; "FAILED=0" beklenir.
-- Fixture'lar kalıcıdır — ikinci çalıştırma için veritabanını yeniden kurun.
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

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  (:'bob',   'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');

-- =============================== PROMPT ===============================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, tool, created_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', :'alice', 'P v1', 'd1', 'metin bir', 'text', 'gpt', '2026-01-01T00:00:00Z');

set role authenticated; select public._as_user(:'alice');
update public.prompts set title = 'P v2', prompt_text = 'metin iki' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
update public.prompts set description = 'd3', tool = 'claude' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
-- sürüm açmaması gerekenler: görünürlük, durum, sayaç, kategori
update public.prompts set visibility = 'private' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
update public.prompts set visibility = 'public', category = 'x' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
reset role;
update public.prompts set like_count = 5, save_count = 2 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
select public._check(1, 'prompt: v1 initial = pre-edit content with the content created_at, then v2, v3 (3 versions)',
  (select count(*) = 3 and bool_and(case version_number when 1 then source = 'initial' and title = 'P v1' and prompt_text = 'metin bir' and created_at = '2026-01-01T00:00:00Z' else source = 'owner_edit' end)
   from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'));
select public._check(14, 'prompt: visibility/category/status/counter changes never open a version',
  (select max(version_number) = 3 from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'));

-- geri dönme = yeni bir sahip düzenlemesi (istemcinin yaptığı UPDATE); trigger yeni sürümü yazar, eskiler değişmez
create temp table _p_before as select id, md5(row(p.*)::text) h from public.prompt_versions p where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
set role authenticated; select public._as_user(:'alice');
update public.prompts p set title = v.title, description = v.description, prompt_text = v.prompt_text, tool = v.tool
  from public.prompt_versions v where v.prompt_id = p.id and v.version_number = 1 and p.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
reset role;
select public._check(10, 'prompt: restoring v1 creates v4 carrying v1 content; v1 stays',
  (select count(*) = 4 from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01')
  and (select title = 'P v1' and prompt_text = 'metin bir' and source = 'owner_edit' from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' and version_number = 4));
select public._check(11, 'prompt: old version rows are byte-identical after restore',
  (select bool_and(md5(row(p.*)::text) = b.h) from public.prompt_versions p join _p_before b on b.id = p.id));

-- =============================== PROMPT İSTEĞİ ===============================
insert into public.prompt_requests (id, author_id, title, description, creative_direction, preferred_tool, created_at) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', :'alice', 'R v1', 'rd1', 'yon bir', 'mj', '2026-01-02T00:00:00Z');
set role authenticated; select public._as_user(:'alice');
update public.prompt_requests set creative_direction = 'yon iki', preferred_tool = 'dalle' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
update public.prompt_requests set status = 'closed', closed_by_owner = true where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
update public.prompt_requests set category = 'c', visibility = 'public' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
reset role;
update public.prompt_requests set like_count = 3, comment_count = 2 where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
select public._check(9, 'request: v1 initial from OLD values (+ created_at) and v2 from NEW values',
  (select count(*) = 2 and bool_and(case version_number
      when 1 then source = 'initial' and creative_direction = 'yon bir' and preferred_tool = 'mj' and created_at = '2026-01-02T00:00:00Z'
      else source = 'owner_edit' and creative_direction = 'yon iki' and preferred_tool = 'dalle' end)
   from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'));
select public._check(14, 'request: status/closed/category/counter changes never open a version',
  (select max(version_number) = 2 from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'));
-- taslak istek: düzenleme sürüm açmaz
insert into public.prompt_requests (id, author_id, title, description, is_draft) values ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', :'alice', 'Taslak', 'x', true);
set role authenticated; select public._as_user(:'alice');
update public.prompt_requests set title = 'Taslak 2' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
reset role;
select public._check(9, 'request: edits to a draft open no version', (select count(*) = 0 from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'));
set role authenticated; select public._as_user(:'alice');
update public.prompt_requests set is_draft = false where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
reset role;
select public._check(9, 'request: publishing a draft opens no version', (select count(*) = 0 from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd02'));

-- =============================== WORKFLOW ===============================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', :'alice', 'Adim prompt A', 'd', 't', 'text'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12', :'alice', 'Adim prompt B', 'd', 't', 'text');
insert into public.workflows (id, creator_id, title, description, status, created_at) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', :'alice', 'W v1', 'wd1', 'published', '2026-01-03T00:00:00Z'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', :'alice', 'Baska W', 'x', 'published', '2026-01-03T00:00:00Z'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', :'alice', 'Taslak W', 'x', 'draft', '2026-01-03T00:00:00Z');
-- ilk içerik (oluşturma yolu: save_workflow_graph, sürüm açmaz)
set role authenticated; select public._as_user(:'alice');
select public.save_workflow_graph('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
  '[{"id":"5a5a5a5a-0000-4000-8000-000000000001","position":0,"title":"Adim 1","description":"a1","instructions":"i1","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","inputs":[],"outputs":[{"id":"o1","label":"Cikti 1"}]},
    {"id":"5a5a5a5a-0000-4000-8000-000000000002","position":1,"title":"Adim 2","description":"a2","instructions":"i2","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","inputs":[{"id":"in1","label":"Girdi","source":{"stepId":"5a5a5a5a-0000-4000-8000-000000000001","outputId":"o1"}}],"outputs":[]}]'::jsonb,
  '[{"from_step_id":"5a5a5a5a-0000-4000-8000-000000000001","to_step_id":"5a5a5a5a-0000-4000-8000-000000000002","output_key":"o1","input_key":"in1"}]'::jsonb);
reset role;
select public._check(3, 'workflow: creating the graph (save_workflow_graph) opens no version', (select count(*) = 0 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));

create or replace function public._wf_save(p_title text, p_desc text, p_steps jsonb, p_conns jsonb) returns boolean language sql as
  $$ select public.save_workflow_content('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', p_title, p_desc, p_steps, p_conns) $$;

-- aynı içeriği olduğu gibi kaydetmek sürüm açmaz
set role authenticated; select public._as_user(:'alice');
select public._wf_save('W v1', 'wd1',
  '[{"id":"5a5a5a5a-0000-4000-8000-000000000001","position":0,"title":"Adim 1","description":"a1","instructions":"i1","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","inputs":[],"outputs":[{"id":"o1","label":"Cikti 1"}]},
    {"id":"5a5a5a5a-0000-4000-8000-000000000002","position":1,"title":"Adim 2","description":"a2","instructions":"i2","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","inputs":[{"id":"in1","label":"Girdi","source":{"stepId":"5a5a5a5a-0000-4000-8000-000000000001","outputId":"o1"}}],"outputs":[]}]'::jsonb,
  '[{"from_step_id":"5a5a5a5a-0000-4000-8000-000000000001","to_step_id":"5a5a5a5a-0000-4000-8000-000000000002","output_key":"o1","input_key":"in1"}]'::jsonb);
reset role;
select public._check(14, 'workflow: saving unchanged content opens no version', (select count(*) = 0 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));

-- v2: başlık + adım ekleme (3. adım) + bağlantı ekleme, tek kaydetme = tek sürüm (+ v1 initial)
set role authenticated; select public._as_user(:'alice');
select public._wf_save('W v2', 'wd1',
  '[{"id":"5a5a5a5a-0000-4000-8000-000000000001","position":0,"title":"Adim 1","description":"a1","instructions":"i1","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","inputs":[],"outputs":[{"id":"o1","label":"Cikti 1"}]},
    {"id":"5a5a5a5a-0000-4000-8000-000000000002","position":1,"title":"Adim 2","description":"a2","instructions":"i2","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","inputs":[{"id":"in1","label":"Girdi","source":{"stepId":"5a5a5a5a-0000-4000-8000-000000000001","outputId":"o1"}}],"outputs":[{"id":"o2","label":"Cikti 2"}]},
    {"id":"5a5a5a5a-0000-4000-8000-000000000003","position":2,"title":"Adim 3","description":"a3","instructions":"i3","step_type":"prompt","prompt_id":null,"inputs":[{"id":"in3","label":"Girdi 3"}],"outputs":[]}]'::jsonb,
  '[{"from_step_id":"5a5a5a5a-0000-4000-8000-000000000001","to_step_id":"5a5a5a5a-0000-4000-8000-000000000002","output_key":"o1","input_key":"in1"},
    {"from_step_id":"5a5a5a5a-0000-4000-8000-000000000002","to_step_id":"5a5a5a5a-0000-4000-8000-000000000003","output_key":"o2","input_key":"in3"}]'::jsonb);
reset role;
select public._check(3, 'workflow: first real edit creates v1 (pre-edit title/steps/connection, content created_at) + v2',
  (select count(*) = 2 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
  and (select source = 'initial' and title = 'W v1' and created_at = '2026-01-03T00:00:00Z' and jsonb_array_length(snapshot -> 'steps') = 2 and jsonb_array_length(snapshot -> 'connections') = 1
       from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 1)
  and (select source = 'owner_edit' and title = 'W v2' and jsonb_array_length(snapshot -> 'steps') = 3 and jsonb_array_length(snapshot -> 'connections') = 2
       from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 2));

-- v3: adım kaldırma + yeniden sıralama (2 ↔ 1) + bağlantı kaldırma
set role authenticated; select public._as_user(:'alice');
select public._wf_save('W v2', 'wd1',
  '[{"id":"5a5a5a5a-0000-4000-8000-000000000002","position":0,"title":"Adim 2 (yeni metin)","description":"a2","instructions":"i2","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12","inputs":[],"outputs":[{"id":"o2","label":"Cikti 2"}]},
    {"id":"5a5a5a5a-0000-4000-8000-000000000001","position":1,"title":"Adim 1","description":"a1","instructions":"i1","step_type":"prompt","prompt_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11","inputs":[],"outputs":[{"id":"o1","label":"Cikti 1"}]}]'::jsonb,
  '[]'::jsonb);
reset role;
select public._check(5, 'workflow: step removal + reorder + text change is one new version v3 with the new order',
  (select count(*) = 3 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
  and (select snapshot -> 'steps' -> 0 ->> 'key' = '5a5a5a5a-0000-4000-8000-000000000002' and snapshot -> 'steps' -> 0 ->> 'title' = 'Adim 2 (yeni metin)' and jsonb_array_length(snapshot -> 'steps') = 2 and jsonb_array_length(snapshot -> 'connections') = 0
       from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 3));

-- sayaç, durum, görünürlük değişimi sürüm açmaz
update public.workflows set like_count = 4, save_count = 1, comment_count = 1 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
set role authenticated; select public._as_user(:'alice');
update public.workflows set visibility = 'public', cover_url = 'c', category = 'cat' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
reset role;
select public._check(14, 'workflow: counter/visibility/cover/category changes open no version', (select max(version_number) = 3 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));

-- taslak workflow: düzenleme sürüm açmaz
set role authenticated; select public._as_user(:'alice');
select public.save_workflow_content('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', 'Taslak degisti', 'y', '[]'::jsonb, '[]'::jsonb);
reset role;
select public._check(14, 'workflow: edits to a draft open no version', (select count(*) = 0 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03'));

-- ---- geri dönme (v1) ----
create temp table _w_before as select id, md5(row(w.*)::text) h from public.workflow_versions w where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
create temp table _w_meta as select cover_url, category, visibility, status, like_count, save_count, comment_count from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
set role authenticated; select public._as_user(:'alice');
select public.restore_workflow_version((select id from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 1), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') as restored \gset
reset role;
select public._check(10, 'workflow: restore returns true and creates v4 equal to v1 content', :'restored' = 't'
  and (select count(*) = 4 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
  and (select a.snapshot = b.snapshot and a.title = b.title and a.description = b.description and a.source = 'owner_edit'
       from public.workflow_versions a, public.workflow_versions b
       where a.workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and b.workflow_id = a.workflow_id and a.version_number = 4 and b.version_number = 1));
select public._check(10, 'workflow: live content is v1 again (steps, connections, title)',
  (select title = 'W v1' from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
  and public._workflow_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') = (select snapshot from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 1));
select public._check(11, 'workflow: old version rows are byte-identical after restore', (select bool_and(md5(row(w.*)::text) = b.h) from public.workflow_versions w join _w_before b on b.id = w.id));
select public._check(10, 'workflow: restore leaves cover/category/visibility/status/counters alone',
  (select (w.cover_url, w.category, w.visibility, w.status, w.like_count, w.save_count, w.comment_count) is not distinct from (m.cover_url, m.category, m.visibility, m.status, m.like_count, m.save_count, m.comment_count)
   from public.workflows w, _w_meta m where w.id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));
-- restoring what is already live is a no-op that says so
set role authenticated; select public._as_user(:'alice');
select public.restore_workflow_version((select id from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 4)) as again \gset
reset role;
select public._check(10, 'workflow: restoring content that is already live returns false and adds no version', :'again' = 'f' and (select count(*) = 4 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));

-- ---- yetki ve içerik eşleşmesi ----
set role authenticated; select public._as_user(:'bob');
do $$ declare vid uuid; begin
  select id into vid from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 2;
  begin perform public.restore_workflow_version(vid); perform public._check(12, 'workflow: another user cannot restore', false, 'no exception');
  exception when others then perform public._check(12, 'workflow: another user cannot restore', sqlerrm like '%not yours%', sqlerrm); end;
  begin perform public.save_workflow_content('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'hack', 'x', '[]'::jsonb, '[]'::jsonb); perform public._check(12, 'workflow: another user cannot save content', false, 'no exception');
  exception when others then perform public._check(12, 'workflow: another user cannot save content', sqlerrm like '%not yours%', sqlerrm); end;
end $$;
reset role;
select public._check(12, 'workflow: bob''s attempts changed nothing', (select title = 'W v1' from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') and (select count(*) = 4 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));
set role authenticated; select public._as_user(:'alice');
do $$ declare vid uuid; begin
  select id into vid from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 2;
  begin perform public.restore_workflow_version(vid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'); perform public._check(13, 'workflow: a version cannot be applied to another workflow', false, 'no exception');
  exception when others then perform public._check(13, 'workflow: a version cannot be applied to another workflow', sqlerrm like '%does not belong%', sqlerrm); end;
  begin perform public.restore_workflow_version('00000000-0000-4000-8000-000000000000'); perform public._check(13, 'workflow: unknown version id fails', false, 'no exception');
  exception when others then perform public._check(13, 'workflow: unknown version id fails', sqlerrm like '%version not found%', sqlerrm); end;
end $$;
reset role;
select public._check(13, 'workflow: the other workflow is untouched', (select title = 'Baska W' from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02') and (select count(*) = 0 from public.workflow_steps where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'));

-- ---- başarısız restore: kısmi değişiklik kalmaz ----
-- bozuk bir snapshot (olmayan adıma bağlantı) geri dönmeyi yarıda keser; transaction geri alınır
update public.workflow_versions set snapshot = jsonb_set(snapshot, '{connections}', '[{"from":"5a5a5a5a-0000-4000-8000-0000000000ff","to":"5a5a5a5a-0000-4000-8000-0000000000fe","output_key":"x","input_key":"y"}]'::jsonb)
  where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 2;
create temp table _w_live as select public._workflow_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') snap, (select title from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') title;
set role authenticated; select public._as_user(:'alice');
do $$ declare vid uuid; begin
  select id into vid from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 2;
  begin perform public.restore_workflow_version(vid); perform public._check(15, 'workflow: corrupt restore raises', false, 'no exception');
  exception when others then perform public._check(15, 'workflow: corrupt restore raises', true, sqlerrm); end;
end $$;
reset role;
select public._check(15, 'workflow: after the failed restore live content and version count are unchanged (no partial write)',
  public._workflow_snapshot('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') = (select snap from _w_live)
  and (select title from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') = (select title from _w_live)
  and (select count(*) = 4 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));

-- ---- silinmiş bağlı prompt: adım bağsız geri gelir, geri dönme yine de başarılı ----
delete from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12';
set role authenticated; select public._as_user(:'alice');
select public.save_workflow_content('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'W v5', 'wd1', '[]'::jsonb, '[]'::jsonb) as saved5 \gset
select public.restore_workflow_version((select id from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01' and version_number = 1)) as restored1 \gset
reset role;
select public._check(10, 'workflow: restoring a step whose prompt was deleted brings the step back unlinked (no error)',
  :'saved5' = 't' and :'restored1' = 't'
  and (select count(*) = 2 and count(*) filter (where prompt_id is null) = 1 from public.workflow_steps where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));

-- =============================== PRESET ===============================
insert into public.presets (id, creator_id, title, description, status, selection, created_at) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', :'alice', 'S v1', 'sd1', 'published', '{"f1":"warm"}', '2026-01-04T00:00:00Z'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', :'alice', 'Baska S', 'x', 'published', '{}', '2026-01-04T00:00:00Z');
insert into public.preset_fields (id, owner_id, preset_id, name, type, kind, config, sort_order) values
  ('f1f1f1f1-0000-4000-8000-000000000001', :'alice', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', 'Isik', 'single_select', 'phrase', '{}', 0);
insert into public.preset_options (id, field_id, label, value, sort_order) values
  ('0a0a0a0a-0000-4000-8000-000000000001', 'f1f1f1f1-0000-4000-8000-000000000001', 'Sicak', 'warm', 0),
  ('0a0a0a0a-0000-4000-8000-000000000002', 'f1f1f1f1-0000-4000-8000-000000000001', 'Soguk', 'cold', 1);

create or replace function public._ps_save(p_title text, p_desc text, p_sel jsonb, p_fields jsonb) returns boolean language sql as
  $$ select public.save_preset_content('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', p_title, p_desc, p_sel, p_fields) $$;

-- değişmeden kaydet
set role authenticated; select public._as_user(:'alice');
select public._ps_save('S v1', 'sd1', '{"f1":"warm"}'::jsonb,
  '[{"id":"f1f1f1f1-0000-4000-8000-000000000001","name":"Isik","type":"single_select","kind":"phrase","content_types":[],"config":{},"options":[{"id":"0a0a0a0a-0000-4000-8000-000000000001","label":"Sicak","value":"warm"},{"id":"0a0a0a0a-0000-4000-8000-000000000002","label":"Soguk","value":"cold"}]}]'::jsonb) as same \gset
reset role;
select public._check(14, 'preset: saving unchanged content returns false and opens no version', :'same' = 'f' and (select count(*) = 0 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));

-- v2: alan ekle, alan adı/tipi değiştir, seçenek ekle/kaldır, sıra, selection
set role authenticated; select public._as_user(:'alice');
select public._ps_save('S v2', 'sd1', '{"f1":"warm","f2":"35mm"}'::jsonb,
  '[{"id":"f2f2f2f2-0000-4000-8000-000000000002","name":"Lens","type":"dropdown","kind":"phrase","content_types":["image"],"config":{"max":3},"options":[{"id":"0b0b0b0b-0000-4000-8000-000000000001","label":"35mm","value":"35mm","fragment_en":"shot on 35mm","fragment_tr":"35mm ile cekildi"}]},
    {"id":"f1f1f1f1-0000-4000-8000-000000000001","name":"Aydinlatma","type":"multi_select","kind":"phrase","content_types":[],"config":{},"options":[{"id":"0a0a0a0a-0000-4000-8000-000000000001","label":"Sicak ton","value":"warm"},{"id":"0a0a0a0a-0000-4000-8000-000000000003","label":"Notr","value":"neutral"}]}]'::jsonb) as ps2 \gset
reset role;
select public._check(7, 'preset: first real edit creates v1 (pre-edit field tree + selection, content created_at) + v2',
  :'ps2' = 't'
  and (select count(*) = 2 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')
  and (select source = 'initial' and title = 'S v1' and created_at = '2026-01-04T00:00:00Z' and snapshot -> 'selection' = '{"f1":"warm"}'::jsonb and jsonb_array_length(snapshot -> 'fields') = 1 and jsonb_array_length(snapshot -> 'fields' -> 0 -> 'options') = 2 and snapshot -> 'fields' -> 0 ->> 'name' = 'Isik'
       from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 1)
  and (select source = 'owner_edit' and jsonb_array_length(snapshot -> 'fields') = 2 and snapshot -> 'fields' -> 0 ->> 'name' = 'Lens' and snapshot -> 'fields' -> 1 ->> 'type' = 'multi_select' and snapshot -> 'fields' -> 0 -> 'options' -> 0 ->> 'fragment_en' = 'shot on 35mm'
       from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 2));
select public._check(8, 'preset: live field tree matches the saved payload (ids, order, options kept)',
  (select array_agg(name order by sort_order) = array['Lens','Aydinlatma'] from public.preset_fields where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')
  and (select count(*) = 3 from public.preset_options o join public.preset_fields f on f.id = o.field_id where f.preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));

-- sayaç/durum/kapak/etiket-benzeri değişimler sürüm açmaz (use_count dahil)
update public.presets set use_count = 9, like_count = 2, save_count = 1 where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
set role authenticated; select public._as_user(:'alice');
update public.presets set visibility = 'private', cover_url = 'c', category = 'x', tools = array['gpt'] where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
update public.presets set visibility = 'public' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
reset role;
select public._check(14, 'preset: use_count/counters/visibility/cover/category/tools open no version', (select max(version_number) = 2 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));

create temp table _ps_before as select id, md5(row(p.*)::text) h from public.preset_versions p where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
create temp table _ps_meta as select cover_url, category, visibility, status, tools, use_count, like_count, save_count from public.presets where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
set role authenticated; select public._as_user(:'alice');
select public.restore_preset_version((select id from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 1), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01') as prestored \gset
reset role;
select public._check(10, 'preset: restore creates v3 equal to v1 content (fields, options, selection, title)',
  :'prestored' = 't'
  and (select count(*) = 3 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01')
  and (select a.snapshot = b.snapshot and a.title = b.title and a.source = 'owner_edit'
       from public.preset_versions a, public.preset_versions b
       where a.preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and b.preset_id = a.preset_id and a.version_number = 3 and b.version_number = 1)
  and public._preset_snapshot('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01') = (select snapshot from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 1));
select public._check(11, 'preset: old version rows are byte-identical after restore', (select bool_and(md5(row(p.*)::text) = b.h) from public.preset_versions p join _ps_before b on b.id = p.id));
select public._check(10, 'preset: restore leaves cover/category/visibility/status/tools/counters alone',
  (select (p.cover_url, p.category, p.visibility, p.status, p.tools, p.use_count, p.like_count, p.save_count) is not distinct from (m.cover_url, m.category, m.visibility, m.status, m.tools, m.use_count, m.like_count, m.save_count)
   from public.presets p, _ps_meta m where p.id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));

set role authenticated; select public._as_user(:'bob');
do $$ declare vid uuid; begin
  select id into vid from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 2;
  begin perform public.restore_preset_version(vid); perform public._check(12, 'preset: another user cannot restore', false, 'no exception');
  exception when others then perform public._check(12, 'preset: another user cannot restore', sqlerrm like '%not yours%', sqlerrm); end;
end $$;
select public._as_user(:'alice');
do $$ declare vid uuid; begin
  select id into vid from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 2;
  begin perform public.restore_preset_version(vid, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02'); perform public._check(13, 'preset: a version cannot be applied to another preset', false, 'no exception');
  exception when others then perform public._check(13, 'preset: a version cannot be applied to another preset', sqlerrm like '%does not belong%', sqlerrm); end;
end $$;
reset role;
-- bozuk snapshot (geçersiz alan tipi): geri dönme yarıda kalır, canlı içerik aynen kalır
update public.preset_versions set snapshot = jsonb_set(snapshot, '{fields,0,type}', '"bogus"') where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 2;
create temp table _ps_live as select public._preset_snapshot('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01') snap;
set role authenticated; select public._as_user(:'alice');
do $$ declare vid uuid; begin
  select id into vid from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01' and version_number = 2;
  begin perform public.restore_preset_version(vid); perform public._check(15, 'preset: corrupt restore raises', false, 'no exception');
  exception when others then perform public._check(15, 'preset: corrupt restore raises', true, sqlerrm); end;
end $$;
reset role;
select public._check(15, 'preset: after the failed restore live fields/options and version count are unchanged',
  public._preset_snapshot('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01') = (select snap from _ps_live)
  and (select count(*) = 3 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));

-- =============================== RLS: okuma ve yazma ===============================
-- prompt (herkese açık + yayınlanmış): bob görür; 'private': bob göremez; yazar görür
create temp table _totals as select
  (select count(*) from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') p,
  (select count(*) from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01') r,
  (select count(*) from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01') w,
  (select count(*) from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01') s;
grant select on _totals to public;
set role authenticated; select public._as_user(:'bob');
select public._check(2, 'rls: public published prompt - versions readable by others', (select count(*) = (select p from _totals) and (select p from _totals) = 4 from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'));
select public._check(2, 'rls: public request - versions readable by others', (select count(*) = (select r from _totals) and (select r from _totals) = 2 from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01'));
select public._check(2, 'rls: public workflow - versions readable by others', (select count(*) = (select w from _totals) and (select w from _totals) >= 4 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'));
select public._check(2, 'rls: public preset - versions readable by others', (select count(*) = (select s from _totals) and (select s from _totals) = 3 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));
reset role;
update public.prompts set visibility = 'private' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
update public.prompt_requests set visibility = 'private' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
update public.workflows set visibility = 'private' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
update public.presets set visibility = 'private' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01';
set role authenticated; select public._as_user(:'bob');
select public._check(2, 'rls: PRIVATE prompt/request/workflow/preset versions are invisible to others (prompt_versions policy fixed)',
  (select count(*) = 0 from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01')
  and (select count(*) = 0 from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01')
  and (select count(*) = 0 from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
  and (select count(*) = 0 from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));
select public._as_user(:'alice');
select public._check(2, 'rls: the owner still reads versions of their private content',
  (select count(*) = (select p from _totals) from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01')
  and (select count(*) = (select r from _totals) from public.request_versions where request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddd01')
  and (select count(*) = (select w from _totals) from public.workflow_versions where workflow_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01')
  and (select count(*) = (select s from _totals) from public.preset_versions where preset_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01'));

-- istemci (sahip dahil) sürüm tablolarına yazamaz
do $$ declare t text; r text; begin
  foreach t in array array['request_versions','workflow_versions','preset_versions'] loop
    begin
      execute format('insert into public.%I select * from public.%I limit 1', t, t);
      perform public._check(2, 'rls: owner INSERT into ' || t || ' is denied', false, 'insert succeeded');
    exception when insufficient_privilege then perform public._check(2, 'rls: owner INSERT into ' || t || ' is denied', true);
    when others then perform public._check(2, 'rls: owner INSERT into ' || t || ' is denied', false, sqlerrm); end;
    begin
      execute format('update public.%I set title = ''hack''', t);
      perform public._check(2, 'rls: owner UPDATE on ' || t || ' is denied', false, 'update succeeded');
    exception when insufficient_privilege then perform public._check(2, 'rls: owner UPDATE on ' || t || ' is denied', true);
    when others then perform public._check(2, 'rls: owner UPDATE on ' || t || ' is denied', sqlerrm like '%column "title"%' or sqlerrm like '%permission%', sqlerrm); end;
    begin
      execute format('delete from public.%I', t);
      perform public._check(2, 'rls: owner DELETE on ' || t || ' is denied', false, 'delete succeeded');
    exception when insufficient_privilege then perform public._check(2, 'rls: owner DELETE on ' || t || ' is denied', true); end;
  end loop;
end $$;
-- prompt_versions: politika yok, istemci satırı değiştiremez
do $$ declare n int; begin
  update public.prompt_versions set title = 'hack' where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  get diagnostics n = row_count;
  perform public._check(2, 'rls: owner UPDATE on prompt_versions affects 0 rows (no policy)', n = 0, n::text);
  delete from public.prompt_versions where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  get diagnostics n = row_count;
  perform public._check(2, 'rls: owner DELETE on prompt_versions affects 0 rows (no policy)', n = 0, n::text);
end $$;
reset role;

-- yardımcı fonksiyonlar istemciye kapalı
select public._check(2, 'internal helpers are not executable by authenticated/anon',
  not has_function_privilege('authenticated', 'public._workflow_snapshot(uuid)', 'execute')
  and not has_function_privilege('anon', 'public._workflow_apply_content(uuid,text,text,jsonb,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public._preset_record_version(uuid,text,text,jsonb,timestamptz,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.restore_workflow_version(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.restore_workflow_version(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.save_preset_content(uuid,text,text,jsonb,jsonb)', 'execute'));
select public._check(2, 'SECURITY DEFINER functions pin search_path',
  (select bool_and(proconfig is not null and exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))
   from pg_proc where pronamespace = 'public'::regnamespace and proname in ('save_workflow_content','restore_workflow_version','save_preset_content','restore_preset_version','record_request_version')));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
