-- İstek / Hazır ayar içe aktarma (docs/history/306-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/import-content.sql ("FAILED=0" beklenir).
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
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

create temp table _r (k text, j jsonb);
grant all on _r to public;

set role authenticated;
select public._as_user(:alice);
insert into _r select 'req', public.import_content('request', '[
  {"title":"Neon poster","description":"Mor-turuncu bir sokak posteri","creativeDirection":"Blade Runner","contentType":"image","tools":["midjourney"],"tags":["neon","Poster"],"id":"x","status":"published","visibility":"public","author_id":"22222222-2222-4222-8222-222222222222"}
]'::jsonb);
insert into _r select 'preset', public.import_content('preset', '[
  {"title":"Sinematik","description":"Yumuşak ışık","contentType":"image","selection":{"lens":"35mm","tags":["a","b"],"hdr":true},"tags":["portre"]}
]'::jsonb);
insert into _r select 'dup', public.import_content('request', '[
  {"title":"Neon poster","description":"Mor-turuncu bir sokak posteri","contentType":"image"}
]'::jsonb);
insert into _r select 'dry', public.import_content('preset', '[{"title":"Kuru","contentType":"image","selection":{}}]'::jsonb, true);
insert into _r select 'bad1', public.import_content('preset', '[{"title":"Kötü","contentType":"image","selection":{"x":{"nested":1}}}]'::jsonb);
insert into _r select 'bad2', public.import_content('request', '[{"title":"Açıklamasız","contentType":"image"}]'::jsonb);
insert into _r select 'bad3', public.import_content('request', '[{"title":"Tür","description":"d","contentType":"gif"},{"title":"Tamam","description":"d","contentType":"text"}]'::jsonb);
reset role;

select public._check(1, 'istek: tek çağrıda özel TASLAK olarak yazılır; yazar/durum/görünürlük dosyadan alınmaz',
  (select (j->>'created')::int from _r where k = 'req') = 1
  and exists (select 1 from public.prompt_requests where author_id = :alice::uuid and title = 'Neon poster' and is_draft and visibility = 'private'
              and status = 'open' and creative_direction = 'Blade Runner' and tools = array['midjourney']));
select public._check(2, 'istek: etiketler get_or_create_tag ile bağlanır (2 etiket)',
  (select count(*) from public.prompt_request_tags t join public.prompt_requests r on r.id = t.request_id where r.title = 'Neon poster') = 2);
select public._check(3, 'hazır ayar: özel taslak + seçim aynen + etiket',
  exists (select 1 from public.presets where creator_id = :alice::uuid and title = 'Sinematik' and status = 'draft' and visibility = 'private'
          and selection = '{"lens":"35mm","tags":["a","b"],"hdr":true}'::jsonb)
  and (select count(*) from public.preset_tags t join public.presets p on p.id = t.preset_id where p.title = 'Sinematik') = 1);
select public._check(4, 'aynı içerik ikinci kez duplicate (hiçbir şey yazılmaz)',
  (select j->'items'->0->>'status' from _r where k = 'dup') = 'duplicate'
  and (select (j->>'created')::int from _r where k = 'dup') = 0
  and (select count(*) from public.prompt_requests where title = 'Neon poster') = 1);
select public._check(5, 'kuru çalıştırma hiçbir şey yazmaz',
  (select (j->>'dryRun')::boolean and (j->>'ok')::boolean from _r where k = 'dry') and not exists (select 1 from public.presets where title = 'Kuru'));
select public._check(6, 'iç içe nesne içeren hazır ayar seçimi geçersiz (invalid_selection)',
  (select j->'items'->0->>'code' from _r where k = 'bad1') = 'invalid_selection' and not exists (select 1 from public.presets where title = 'Kötü'));
select public._check(7, 'istek açıklaması zorunlu',
  (select j->'items'->0->>'code' from _r where k = 'bad2') = 'required' and (select j->'items'->0->>'field' from _r where k = 'bad2') = 'description');
select public._check(8, 'tek geçersiz satır HİÇBİR satırı yazdırmaz (geçerli "Tamam" da yazılmadı)',
  (select (j->>'ok')::boolean from _r where k = 'bad3') = false and not exists (select 1 from public.prompt_requests where title = 'Tamam'));

set role authenticated;
select public._as_user('');
select public._check(9, 'oturumsuz çağrı reddedilir', public._try($q$select public.import_content('request', '[{"title":"a","description":"b","contentType":"text"}]')$q$) like '%not_authenticated%' or public._try($q$select public.import_content('request', '[{"title":"a","description":"b","contentType":"text"}]')$q$) like '%permission denied%');
select public._as_user(:alice);
select public._check(10, 'bilinmeyen tür ve 30''dan fazla satır reddedilir',
  public._try($q$select public.import_content('workflow', '[{"title":"a"}]')$q$) like '%unsupported_kind%'
  and public._try($q$select public.import_content('request', (select jsonb_agg(jsonb_build_object('title','t'||g,'description','d','contentType','text')) from generate_series(1,31) g))$q$) like '%too_many_items%');
reset role;
select public._check(11, 'anon EXECUTE yok',
  not has_function_privilege('anon', 'public.import_content(text,jsonb,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.import_content(text,jsonb,boolean)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
