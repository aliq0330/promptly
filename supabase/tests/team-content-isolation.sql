-- Ekibe özgü içerik asla herkese açık yüzeylerde çıkmaz (docs/history/376-*) + search_content "yazar hariç" süzgeci.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-content-isolation.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._g(text) to public;

-- Kurulum: alice sahip, carol + dave ekip üyesi; carol projeyi açar (lider), dave düzenleyici.
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor', '', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member');
set role authenticated;
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'selected', 'view', jsonb_build_array(jsonb_build_object('type','member','id',:dave,'role','edit'))) as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak') as v \gset f_
reset role;
insert into public._ctx values ('F', :'f_v');

-- Herkese açık iki prompt (alice, carol) — arama/hariç tutma için.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, origin_type) values
  ('aaaaaaaa-0000-4000-8000-000000000001', :alice, 'Mutfak aydınlatma', '', 'ışık', 'text', 'published', 'public', 'original'),
  ('aaaaaaaa-0000-4000-8000-000000000002', :carol, 'Mutfak dolap', '', 'dolap', 'text', 'published', 'public', 'original');

-- Sayaçlar (ekip içeriği eklenmeden ÖNCE).
set role authenticated;
select public._as_user(:carol);
select count(*)::int as v from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null) \gset s0_
select coalesce((public.profile_content_stats(:carol) ->> 'prompts')::int, -1) as v \gset c0_
reset role;

-- Ekibe özgü içerik: dosyaya özgü prompt / istek / ayar paketi / workflow (lider yazar; onaylı).
set role authenticated;
select public._as_user(:carol);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, origin_type, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :carol, 'Mutfak ekip promptu', '', 'gizli', 'text', 'published', 'private', 'original', public._g('F'));
insert into public.prompt_requests (id, author_id, title, description, creative_direction, content_type, is_draft, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000002', :carol, 'Mutfak ekip isteği', '', 'yön', 'text', false, 'private', public._g('F'));
insert into public.workflows (id, creator_id, title, description, content_types, status, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000003', :carol, 'Mutfak ekip workflow', '', array['text'], 'published', 'private', public._g('F'));
insert into public.presets (id, creator_id, title, description, content_type, selection, status, visibility, team_file_id) values
  ('bbbbbbbb-0000-4000-8000-000000000004', :carol, 'Mutfak ekip ayarı', '', 'text', '{}'::jsonb, 'published', 'private', public._g('F'));
select public.team_attach_content(public._g('F'), 'prompt', 'bbbbbbbb-0000-4000-8000-000000000001', null);
select public.team_attach_content(public._g('F'), 'request', 'bbbbbbbb-0000-4000-8000-000000000002', null);
select public.team_attach_content(public._g('F'), 'workflow', 'bbbbbbbb-0000-4000-8000-000000000003', null);
select public.team_attach_content(public._g('F'), 'preset', 'bbbbbbbb-0000-4000-8000-000000000004', null);
reset role;

select public._check(1, 'dört ekip içeriği oluşturuldu ve private', (select count(*) from public.prompts where team_file_id is not null and visibility = 'private') = 1
  and (select count(*) from public.prompt_requests where team_file_id is not null and visibility = 'private') = 1
  and (select count(*) from public.workflows where team_file_id is not null and visibility = 'private') = 1
  and (select count(*) from public.presets where team_file_id is not null and visibility = 'private') = 1);

-- ============================================================================================================================================
-- Arama
-- ============================================================================================================================================
do $$
declare k text; u text; n int;
begin
  for u in select unnest(array['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']) loop
    perform set_config('request.jwt.claim.sub', u, false);
    perform set_config('request.jwt.claim.role', 'authenticated', false);
    set local role authenticated;
    for k in select unnest(array['prompt', 'request', 'workflow', 'preset']) loop
      select count(*) into n from public.search_content(k, 'ekip', 'new', null, null, null, null, null, null, null, 40, null, null, null);
      insert into public._results values (2, 'arama ' || k || ' / ' || right(u, 4) || ': ekip içeriği çıkmaz', n = 0, n::text);
      select count(*) into n from public.search_content(k, 'ekip', 'new', null, null, null, null, null, null, null, 40, null, null, null, null);
      insert into public._results values (3, 'arama (yeni imza) ' || k || ' / ' || right(u, 4) || ': ekip içeriği çıkmaz', n = 0, n::text);
    end loop;
    reset role;
  end loop;
end $$;

set role authenticated;
select public._as_user(:dave);
select public._check(4, 'eski imza hâlâ çalışır ve yazar süzgecini uygular', (select count(*) from public.search_content('prompt', 'mutfak', 'new', array['11111111-1111-4111-8111-111111111111']::uuid[], null, null, null, null, null, null, 40, null, null, null)) = 1);
select public._check(5, 'yeni imza: yazar hariç tutulur', (select count(*) from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null, array['11111111-1111-4111-8111-111111111111']::uuid[])) = 1
  and (select id from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null, array['11111111-1111-4111-8111-111111111111']::uuid[])) = 'aaaaaaaa-0000-4000-8000-000000000002');
select public._check(6, 'yeni imza: hariç tutma boşsa hepsi gelir', (select count(*) from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null, null)) = 2);
select public._check(7, 'yeni imza: iki yazar da hariçse boş', (select count(*) from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null, array['11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333']::uuid[])) = 0);
reset role;
set role anon;
select public._as_user('');
select public._check(8, 'ziyaretçi her iki imzayı da çağırabilir', (select count(*) from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null)) = 2
  and (select count(*) from public.search_content('prompt', 'mutfak', 'new', null, null, null, null, null, null, null, 40, null, null, null, null)) = 2);
reset role;

-- ============================================================================================================================================
-- Akış, profil, API
-- ============================================================================================================================================
set role authenticated;
select public._as_user(:dave);
select public._check(9, 'akışta ekip içeriği yok', (select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null) f where f.id::text like 'bbbbbbbb-%') = 0);
select public._as_user(:carol);
select public._check(10, 'yazarın kendi akışında da ekip içeriği yok', (select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null) f where f.id::text like 'bbbbbbbb-%') = 0);
select public._check(11, 'profil sayıları ekip içeriğini saymaz', coalesce((public.profile_content_stats(:carol) ->> 'prompts')::int, -1) = :'c0_v'::int);
select public._check(12, 'API/MCP "benim promptlarım" ekip içeriğini listelemez', (select count(*) from public.api_me_prompts(50, null, null, null) i where i.id::text like 'bbbbbbbb-%') = 0 and (select count(*) from public.api_me_prompts(50, null, null, null) i) >= 1);
select public._check(13, 'API/MCP tek prompt: ekip içeriği bulunamaz', (select count(*) from public.api_me_prompt('bbbbbbbb-0000-4000-8000-000000000001')) = 0);
select public._check(14, 'ilişkili promptlar: ekip içeriği önerilmez', (select count(*) from public.related_prompts('aaaaaaaa-0000-4000-8000-000000000002', 20) r where r.id::text like 'bbbbbbbb-%') = 0);
reset role;

select 'FAILED=' || count(*) from public._results where not ok;
select n, name, detail from public._results where not ok order by n;
