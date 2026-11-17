-- Skill sürümü talimat anlık görüntüsü (docs/history/415-*, `20261205100000_skill_version_instructions.sql`): yayın anındaki talimat sürümle birlikte değişmez saklanır;
-- sonradan çalışma kopyası değişse de okuyucunun gördüğü yayınlanan metin aynı kalır.
--
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/skills-version-snapshot.sql   ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev', '{"username":"bobby","display_name":"Bob"}');
update public.profiles set username = 'alice' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set username = 'bobby' where id = '22222222-2222-4222-8222-222222222222';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return sqlerrm like '%' || code || '%';
end $$;

\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set s1 '''55000000-0000-4000-8000-000000000001'''
\set s2 '''55000000-0000-4000-8000-000000000002'''

grant select, insert, delete on storage.objects to anon, authenticated, service_role;

set role authenticated; select pg_temp.as_user(:alice);
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:s1, :alice, 'snap', 'Snap', 'S', '# Yayınlanan talimat v1', 'draft', 'public'),
  (:s2, :alice, 'priv', 'Priv', 'S', '# Özel', 'draft', 'private');
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('skill-files', '55000000-0000-4000-8000-000000000001/packages/1.0.0-0123456789abcdef.zip', '{"size":"10"}'),
  ('skill-files', '55000000-0000-4000-8000-000000000001/packages/1.1.0-fedcba9876543210.zip', '{"size":"10"}'),
  ('skill-files', '55000000-0000-4000-8000-000000000002/packages/1.0.0-0123456789abcdef.zip', '{"size":"10"}');

-- ====================================================================================================================
-- 1. Yayın anında talimat sürüme yazılır
-- ====================================================================================================================
set role service_role; select pg_temp.as_service();
select public.skill_publish_commit(:alice, :s1, '1.0.0', '', gen_random_uuid(), repeat('0123456789abcdef', 4), 10, 0, '{}'::jsonb);
select public.skill_publish_commit(:alice, :s2, '1.0.0', '', gen_random_uuid(), repeat('0123456789abcdef', 4), 10, 0, '{}'::jsonb);
reset role;
select pg_temp.check(1, 'the commit stores the working-copy instructions on the version row',
  (select instructions = '# Yayınlanan talimat v1' from public.skill_versions where skill_id = :s1 and version = '1.0.0'));

-- ====================================================================================================================
-- 2. Sahip sonradan çalışma kopyasını değiştirir: sürümdeki metin DEĞİŞMEZ
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
update public.skills set instructions = '# SESSİZCE DEĞİŞTİRİLDİ' where id = :s1;
select pg_temp.check(2, 'the owner can still edit the working copy', (select instructions = '# SESSİZCE DEĞİŞTİRİLDİ' from public.skills where id = :s1));
select pg_temp.check(2, 'the published version still holds the text from publish time',
  (select instructions = '# Yayınlanan talimat v1' from public.skill_versions where skill_id = :s1 and version = '1.0.0'));
select pg_temp.check(2, 'the snapshot cannot be rewritten (even by its owner)',
  pg_temp.raises(format($$update public.skill_versions set instructions = 'x' where skill_id = %L$$, :s1), 'permission denied'));
reset role;
select pg_temp.check(2, 'not even the table owner can rewrite it (immutable trigger)',
  pg_temp.raises(format($$update public.skill_versions set instructions = 'x' where skill_id = %L$$, :s1), 'skill_version_immutable'));

-- ====================================================================================================================
-- 3. Okuma: herkese açık Skill'in sürümü (ve metni) başkasına/anona görünür; özel Skill'inki görünmez
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(3, 'another user reads the published text of a public skill',
  (select instructions = '# Yayınlanan talimat v1' from public.skill_versions where skill_id = :s1));
select pg_temp.check(3, 'another user does not see the private skill''s version at all', (select count(*) from public.skill_versions where skill_id = :s2) = 0);
reset role;
set role anon; select pg_temp.as_anon();
select pg_temp.check(3, 'anon reads the published text of a public skill', (select count(*) from public.skill_versions where skill_id = :s1 and instructions is not null) = 1);
reset role;

-- ====================================================================================================================
-- 4. Yeni sürüm yeni anlık görüntü alır; eskisi aynı kalır. Eski (NULL) satır geriye uyumludur
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
update public.skills set instructions = '# Yayınlanan talimat v1.1' where id = :s1;
reset role;
set role service_role; select pg_temp.as_service();
select public.skill_publish_commit(:alice, :s1, '1.1.0', 'ikinci', gen_random_uuid(), repeat('fedcba9876543210', 4), 10, 0, '{}'::jsonb);
reset role;
select pg_temp.check(4, 'the next version snapshots the new text', (select instructions = '# Yayınlanan talimat v1.1' from public.skill_versions where skill_id = :s1 and version = '1.1.0'));
select pg_temp.check(4, 'the previous version keeps its own text', (select instructions = '# Yayınlanan talimat v1' from public.skill_versions where skill_id = :s1 and version = '1.0.0'));
-- Migration'dan önceki sürüm: sütun NULL (CHECK buna izin verir)
select pg_temp.check(4, 'a pre-migration version row may have no snapshot',
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'skill_versions' and column_name = 'instructions' and is_nullable = 'YES') = 1);
select pg_temp.check(4, 'an over-long snapshot is rejected by the CHECK',
  pg_temp.raises(format($$insert into public.skill_versions (skill_id, version, package_path, package_sha256, package_size, file_count, instructions) values (%L, '9.0.0', %L, %L, 1, 0, repeat('a', 60001))$$,
    :s1, '55000000-0000-4000-8000-000000000001/packages/9.0.0-' || substr(repeat('0', 64), 1, 16) || '.zip', repeat('0', 64)), 'check'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
