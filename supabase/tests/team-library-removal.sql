-- Ekip projeleri v2 — PR-C (docs/history/362-*): ekip kütüphanesi KALDIRILDI. Bu test sonrasını denetler: tablolar/RPC'ler yok, ekip kütüphanesiz
-- kurulur, yeniden yazılan fonksiyonlar (team_update/insights/export/my_team_todos/member_content_summary/offboard) çalışır, ekip alanları sağlam.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-library-removal.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

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
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text) to public;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._q(text) to public;

-- 1) Kütüphane tabloları / RPC'leri / yardımcıları yok -------------------------------------------------------------------------------------
select public._check(1, 'kütüphane tabloları düştü',
  (select count(*) from information_schema.tables where table_schema = 'public'
    and table_name in ('space_item_approvals','space_item_review_comments','space_item_review_samples','space_item_versions','space_item_uses',
                       'space_item_works_votes','space_variables','team_api_blocks','team_api_usage')) = 0);
select public._check(2, 'kütüphane RPC''leri / yardımcıları düştü',
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('api_me_libraries','api_me_library_prompts','api_me_library_variables','api_me_team_libraries','team_libraries','team_library_items',
                    'team_library_counts','team_create_project_library','team_integrations','team_set_api_block','space_set_item_approval',
                    'space_request_review','space_decide_item','space_set_variable','space_delete_variable','space_can_approve',
                    'space_set_project_approvals','space_set_review_sample','space_record_item_use','space_set_item_works','list_space_item_versions',
                    'space_restore_item_version','_team_item_hidden','_team_can_approve_item','_team_approvals_needed','_team_api_allowed','_team_api_log')) = 0);
select public._check(3, 'hiçbir canlı fonksiyon düşen nesneleri anmıyor',
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.prosrc ~* '_team_can_approve_item|_team_item_hidden|_team_approvals_needed|_team_api_allowed|space_can_approve|space_item_uses|space_variables|space_item_approvals|space_item_versions|space_item_works_votes|team_api_usage|team_api_blocks|space_record_item_use') = 0);
select public._check(4, 'kütüphane taslak-gizleme politikası ve sürüm tetikleyicisi yok, ALAN politikaları var',
  not exists (select 1 from pg_policy where polname = 'space_items_hide_unapproved')
  and not exists (select 1 from pg_trigger where tgname = 'space_items_version_snapshot')
  and exists (select 1 from pg_policy where polname = 'space_items_hide_unapproved_area')
  and exists (select 1 from pg_policy where polname = 'space_connections_hide_unapproved'));

-- 2) Ekip kütüphanesiz kurulur -------------------------------------------------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye', 'açıklama', 'primary') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member');
select public._check(5, 'team_create kütüphane Space''i açmaz', (select library_space_id from public.teams where id = public._g('T')) is null
  and (select count(*) from public.spaces where team_id = public._g('T')) = 0);
select public._check(6, 'yeni ekip: kanal + üye sayıları sağlam', (select channel_count from public.teams where id = public._g('T')) >= 1
  and (select member_count from public.teams where id = public._g('T')) = 4);

-- 3) team_update: ölü kütüphane anahtarlarını reddeder, canlı anahtarları yazar ------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public._check(7, 'team_update ölü anahtarı (require_approval) reddeder', public._try(format($$select public.team_update(%L, '{"require_approval": true}')$$, public._g('T'))) like '%team_invalid%');
select public._check(8, 'team_update ölü anahtarları (mcp_enabled, version_keep, hide_unapproved, approvals_needed) reddeder',
  public._try(format($$select public.team_update(%L, '{"mcp_enabled": true}')$$, public._g('T'))) like '%team_invalid%'
  and public._try(format($$select public.team_update(%L, '{"version_keep": 10}')$$, public._g('T'))) like '%team_invalid%'
  and public._try(format($$select public.team_update(%L, '{"hide_unapproved": true}')$$, public._g('T'))) like '%team_invalid%'
  and public._try(format($$select public.team_update(%L, '{"approvals_needed": 2}')$$, public._g('T'))) like '%team_invalid%');
select public._try(format($$select public.team_update(%L, '{"invite_link_ttl_days": 14, "name": "Atölye 2"}')$$, public._g('T'))) as v \gset up_
select public._check(9, 'team_update canlı anahtarı (invite_link_ttl_days, name) yazar', :'up_v' = 'ok'
  and (select invite_link_ttl_days from public.teams where id = public._g('T')) = 14 and (select name from public.teams where id = public._g('T')) = 'Atölye 2');

-- 4) Proje + öğeler: insights / export / todos / özet ---------------------------------------------------------------------------------------
select public._as_user(:carol);
select public.team_create_project(public._g('T'), 'Villa', '', 'all', 'edit') as v \gset p_
select public.team_create_file(:'p_v'::uuid, 'Mutfak') as v \gset f_
reset role;
insert into public._ctx values ('P', :'p_v'), ('F', :'f_v');
select s.id as v from public.spaces s where s.team_project_id = :'p_v'::uuid and s.team_area_main and s.team_file_id is null \gset a_
select s.id as v from public.spaces s where s.team_file_id = :'f_v'::uuid and s.team_area_main \gset fa_
set role authenticated;
select public._as_user(:dave);
insert into public.space_items (space_id, kind, title, body, created_by, updated_by) values (:'fa_v'::uuid, 'note', 'Dave notu', 'a', :dave::uuid, :dave::uuid) returning id as v \gset i1_
select public.team_review_submit(array[:'i1_v'::uuid]) as v \gset sub_
select public._as_user(:carol);
insert into public.space_items (space_id, kind, title, body, created_by, updated_by) values (:'a_v'::uuid, 'note', 'Not 1', 'a', :carol::uuid, :carol::uuid);
insert into public.space_items (space_id, kind, title, body, created_by, updated_by) values (:'a_v'::uuid, 'note', 'Not 2', 'b', :carol::uuid, :carol::uuid);
select public._as_user(:alice);
select public.team_insights(public._g('T'), 30)::text as v \gset ins_
select public._check(10, 'team_insights proje etkinliğini sayar (eklenen/bekleyen/katkı/proje)',
  (:'ins_v'::jsonb ->> 'added')::int = 3 and (:'ins_v'::jsonb -> 'alerts' ->> 'pending')::int = 1
  and (:'ins_v'::jsonb ->> 'contributors')::int = 2 and (:'ins_v'::jsonb ->> 'projects')::int = 1
  and jsonb_array_length(:'ins_v'::jsonb -> 'daily') = 30 and jsonb_array_length(:'ins_v'::jsonb -> 'top') = 1,
  :'ins_v');
select public._check(11, 'team_insights eski kütüphane anahtarlarını taşımaz', not (:'ins_v'::jsonb ? 'copies') and not (:'ins_v'::jsonb ? 'stale') and not (:'ins_v'::jsonb -> 'alerts' ? 'deprecated_used'));
select public._as_user(:dave);
select public._check(12, 'team_insights yetkisiz üyeye kapalı', public._try(format($$select public.team_insights(%L, 30)$$, public._g('T'))) like '%team_forbidden%');
select public._as_user(:alice);
select public.team_export(public._g('T'))::text as v \gset exp_
select public._check(13, 'team_export projeleri + dosyaları verir, kütüphane yok',
  (:'exp_v'::jsonb ->> 'format') = 'promptly.team' and jsonb_array_length(:'exp_v'::jsonb -> 'projects') = 1
  and (:'exp_v'::jsonb -> 'projects' -> 0 ->> 'title') = 'Villa' and jsonb_array_length(:'exp_v'::jsonb -> 'projects' -> 0 -> 'files') = 1
  and not (:'exp_v'::jsonb ? 'items') and not (:'exp_v'::jsonb ? 'spaces'), :'exp_v');
select public._check(14, 'my_team_todos çalışır (kütüphane onayı dalı yok)', public._try($$select * from public.my_team_todos()$$) = 'ok');
select public._check(15, 'team_member_content_summary eklenen öğeleri sayar',
  (public.team_member_content_summary(public._g('T'), :carol::uuid) ->> 'prompts')::int = 0
  and (public.team_member_content_summary(public._g('T'), :carol::uuid) ->> 'items')::int = 2);
reset role;

-- 5) Üyeyi çıkarırken içerik devri (team_offboard) kütüphanesiz çalışır ---------------------------------------------------------------------
set role authenticated;
select public._as_user(:alice);
select public._check(16, 'üye çıkarma + içerik devri hata vermez', public._try(format($$select public.team_remove_member(%L, %L, 'member', %L)$$, public._g('T'), :carol, :bobby)) = 'ok'
  or public._try(format($$select public.team_remove_member(%L, %L)$$, public._g('T'), :carol)) = 'ok');
reset role;
select public._check(17, 'devir sonrası Carol''ın 2 notu Bobby''de, öğe silinmedi', (select count(*) from public.space_items where created_by = :bobby::uuid) = 2 and (select count(*) from public.space_items where space_id in (:'a_v'::uuid, :'fa_v'::uuid)) = 3);

-- 6) Ekip alanları sağlam, eski ekip Space'i artık hiç açılamaz --------------------------------------------------------------------------------
select public._check(18, 'proje alanı (team_area) yerinde ve gizli', (select count(*) from public.spaces where team_project_id = :'p_v'::uuid and kind = 'team_area' and visibility = 'private') >= 1);
set role authenticated;
select public._as_user(:alice);
select public._check(19, 'ekip kütüphanesi Space''i oluşturma yolu kalmadı (team_create_space kütüphane türünü reddeder ya da yok)',
  public._try(format($$select public.team_create_space(%L, 'K', '', 'team_library', null, 'all', false)$$, public._g('T'))) <> 'ok'
  or (select count(*) from public.spaces where team_id = public._g('T') and kind = 'team_library') = 0);
reset role;

select n, name, ok, detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
select 'PASSED=' || count(*) from public._results where ok;
