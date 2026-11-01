-- Workflow içe aktarma (docs/history/307-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/import-workflows.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set p_pub  'a0000000-0000-4000-8000-0000000000a1'
\set p_priv 'a0000000-0000-4000-8000-0000000000a2'
\set p_draft 'a0000000-0000-4000-8000-0000000000a3'

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
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

-- alice'in prompt'ları: biri herkese açık, biri özel, biri taslak
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  (:'p_pub', :alice, 'Açık prompt', 'd', 'gece', 'image', 'published', 'public'),
  (:'p_priv', :alice, 'Özel prompt', 'd', 'gece', 'text', 'published', 'private'),
  (:'p_draft', :alice, 'Taslak prompt', 'd', 'gece', 'text', 'draft', 'private');

create temp table _r (k text, j jsonb);
grant all on _r to public;

-- bobby içe aktarır: alice'in açık prompt'u bağlanır; özel/taslak prompt bağlanmaz (okuyamaz)
set role authenticated;
select public._as_user(:bobby);
insert into _r select 'ok', public.import_workflows(jsonb_build_array(jsonb_build_object(
  'title', 'Kampanya akışı', 'description', 'Üç adım', 'contentType', 'text', 'tags', jsonb_build_array('kampanya'), 'tools', jsonb_build_array('midjourney'),
  'id', 'x', 'status', 'published', 'visibility', 'public', 'creator_id', :'alice',
  'steps', jsonb_build_array(
    jsonb_build_object('key', 's1', 'title', 'Fikir', 'description', 'd1', 'instructions', 'i1', 'prompt', jsonb_build_object('id', :'p_pub', 'title', 'Açık prompt'),
      'inputs', jsonb_build_array(), 'outputs', jsonb_build_array(jsonb_build_object('id', 'fikir', 'label', 'Fikir'))),
    jsonb_build_object('key', 's2', 'title', 'Metin', 'prompt', jsonb_build_object('id', :'p_priv'),
      'inputs', jsonb_build_array(jsonb_build_object('id', 'girdi', 'label', 'Girdi', 'source', jsonb_build_object('step', 's1', 'output', 'fikir'))),
      'outputs', jsonb_build_array(jsonb_build_object('id', 'metin', 'label', 'Metin'))),
    jsonb_build_object('key', 's3', 'title', 'Taslak adım', 'prompt', jsonb_build_object('id', :'p_draft'),
      'inputs', jsonb_build_array(jsonb_build_object('id', 'g', 'label', 'G', 'source', jsonb_build_object('step', 's2', 'output', 'metin'))), 'outputs', jsonb_build_array())
  ))));
insert into _r select 'dup', public.import_workflows(jsonb_build_array(jsonb_build_object(
  'title', 'Kampanya akışı', 'description', 'Üç adım', 'contentType', 'text',
  'steps', jsonb_build_array(jsonb_build_object('key', 's1', 'title', 'Fikir', 'prompt', jsonb_build_object('id', :'p_pub')))
)));
insert into _r select 'dry', public.import_workflows(jsonb_build_array(jsonb_build_object(
  'title', 'Kuru', 'contentType', 'text', 'steps', jsonb_build_array(jsonb_build_object('key', 'a', 'title', 't')))), true);
insert into _r select 'fwd', public.import_workflows(jsonb_build_array(jsonb_build_object(
  'title', 'İleri bağ', 'contentType', 'text', 'steps', jsonb_build_array(
    jsonb_build_object('key', 'a', 'title', 'a', 'inputs', jsonb_build_array(jsonb_build_object('id', 'i', 'label', 'I', 'source', jsonb_build_object('step', 'b', 'output', 'o')))),
    jsonb_build_object('key', 'b', 'title', 'b', 'outputs', jsonb_build_array(jsonb_build_object('id', 'o', 'label', 'O')))))));
insert into _r select 'nostep', public.import_workflows(jsonb_build_array(jsonb_build_object('title', 'Adımsız', 'contentType', 'text', 'steps', jsonb_build_array())));
insert into _r select 'dupkey', public.import_workflows(jsonb_build_array(jsonb_build_object('title', 'Aynı anahtar', 'contentType', 'text', 'steps',
  jsonb_build_array(jsonb_build_object('key', 'a', 'title', 'x'), jsonb_build_object('key', 'a', 'title', 'y')))));
insert into _r select 'badout', public.import_workflows(jsonb_build_array(jsonb_build_object('title', 'Olmayan çıktı', 'contentType', 'text', 'steps', jsonb_build_array(
  jsonb_build_object('key', 'a', 'title', 'a', 'outputs', jsonb_build_array(jsonb_build_object('id', 'o', 'label', 'O'))),
  jsonb_build_object('key', 'b', 'title', 'b', 'inputs', jsonb_build_array(jsonb_build_object('id', 'i', 'label', 'I', 'source', jsonb_build_object('step', 'a', 'output', 'yok'))))))));
reset role;

select public._check(1, 'özel taslak workflow yazıldı (yazar bobby, draft/private, dosyadaki id/status/visibility/creator yok sayıldı)',
  (select (j->>'created')::int from _r where k = 'ok') = 1
  and exists (select 1 from public.workflows where creator_id = :bobby::uuid and title = 'Kampanya akışı' and status = 'draft' and visibility = 'private' and community_id is null)
  and not exists (select 1 from public.workflows where creator_id = :alice::uuid));
select public._check(2, 'üç adım sırayla yazıldı',
  (select array_agg(s.title order by s.position) from public.workflow_steps s join public.workflows w on w.id = s.workflow_id where w.title = 'Kampanya akışı') = array['Fikir','Metin','Taslak adım']);
select public._check(3, 'yalnız herkese açık prompt bağlandı; özel ve taslak prompt bağlanmadı (boş adım)',
  (select prompt_id from public.workflow_steps where title = 'Fikir') = :'p_pub'::uuid
  and (select prompt_id from public.workflow_steps where title = 'Metin') is null
  and (select prompt_id from public.workflow_steps where title = 'Taslak adım') is null);
select public._check(4, 'okunamayan başvuru "prompt_unavailable" uyarısı verir',
  (select j->'items'->0->'warnings' from _r where k = 'ok') ? 'prompt_unavailable');
select public._check(5, 'bağlantılar yeni adım kimlikleriyle kuruldu (2 bağ) ve girişin source alanı yeni kimliği taşır',
  (select count(*) from public.workflow_connections c join public.workflows w on w.id = c.workflow_id where w.title = 'Kampanya akışı') = 2
  and (select (inputs->0->'source'->>'stepId')::uuid from public.workflow_steps where title = 'Metin') = (select id from public.workflow_steps where title = 'Fikir'));
select public._check(6, 'içerik türleri: ana tür + bağlanan prompt türü; araç ve etiket yazıldı',
  (select content_types @> array['text','image'] and cardinality(content_types) = 2 and tools = array['midjourney'] from public.workflows where title = 'Kampanya akışı')
  and (select count(*) from public.workflow_tags t join public.workflows w on w.id = t.workflow_id where w.title = 'Kampanya akışı') = 1);
select public._check(7, 'aynı workflow ikinci kez duplicate',
  (select j->'items'->0->>'status' from _r where k = 'dup') = 'duplicate' and (select count(*) from public.workflows where title = 'Kampanya akışı') = 1);
select public._check(8, 'kuru çalıştırma hiçbir şey yazmaz', (select (j->>'dryRun')::boolean and (j->>'ok')::boolean from _r where k = 'dry') and not exists (select 1 from public.workflows where title = 'Kuru'));
select public._check(9, 'ileriye (sonraki adıma) bağ geçersiz', (select j->'items'->0->>'code' from _r where k = 'fwd') = 'invalid_connection' and not exists (select 1 from public.workflows where title = 'İleri bağ'));
select public._check(10, 'adımsız, yinelenen anahtar ve olmayan çıktıya bağ reddedilir',
  (select j->'items'->0->>'code' from _r where k = 'nostep') = 'invalid_steps'
  and (select j->'items'->0->>'code' from _r where k = 'dupkey') = 'invalid_steps'
  and (select j->'items'->0->>'code' from _r where k = 'badout') = 'invalid_connection');

set role authenticated;
select public._as_user('');
select public._check(11, 'oturumsuz çağrı ve 30''dan fazla kayıt reddedilir',
  (public._try($q$select public.import_workflows('[{"title":"a","contentType":"text","steps":[{"key":"a"}]}]')$q$) like '%not_authenticated%'
   or public._try($q$select public.import_workflows('[{"title":"a","contentType":"text","steps":[{"key":"a"}]}]')$q$) like '%permission denied%'));
select public._as_user(:bobby);
select public._check(12, '31 kayıt too_many_items', public._try($q$select public.import_workflows((select jsonb_agg(jsonb_build_object('title','t'||g,'contentType','text','steps',jsonb_build_array(jsonb_build_object('key','a')))) from generate_series(1,31) g))$q$) like '%too_many_items%');
reset role;
select public._check(13, 'anon EXECUTE yok, authenticated var',
  not has_function_privilege('anon', 'public.import_workflows(jsonb,boolean)', 'execute') and has_function_privilege('authenticated', 'public.import_workflows(jsonb,boolean)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
