-- Skill taslak nesne sınırı + commit sertleştirmesi (docs/history/416-*, `20261206100000_skill_draft_cap_commit_hardening.sql`).
--
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/skills-draft-cap.sql   ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}');
update public.profiles set username = 'alice' where id = '11111111-1111-4111-8111-111111111111';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
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
create or replace function pg_temp.works(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return true;
exception when others then
  return false;
end $$;

\set alice '''11111111-1111-4111-8111-111111111111'''
\set s1 '''56000000-0000-4000-8000-000000000001'''
\set s2 '''56000000-0000-4000-8000-000000000002'''

grant select, insert, delete on storage.objects to anon, authenticated, service_role;

set role authenticated; select pg_temp.as_user(:alice);
insert into public.skills (id, author_id, slug, title, summary, instructions, status) values
  (:s1, :alice, 'cap1', 'Cap1', 'S', '# Rol', 'draft'),
  (:s2, :alice, 'cap2', 'Cap2', 'S', '# Rol', 'draft');
reset role;

-- ====================================================================================================================
-- 1. Taslak nesne sayısı Skill başına 200 ile sınırlı
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(1, 'the owner can upload 200 draft objects into one skill',
  pg_temp.works(format($$insert into storage.objects (bucket_id, name, metadata) select 'skill-files', '56000000-0000-4000-8000-000000000001/draft/' || gen_random_uuid() || '.md', '{"size":"5"}'::jsonb from generate_series(1, 200)$$)));
select pg_temp.check(1, 'the 201st draft object is rejected',
  pg_temp.raises($$insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '56000000-0000-4000-8000-000000000001/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.md', '{"size":"5"}')$$, 'row-level security'));
select pg_temp.check(1, 'another skill of the same owner is not affected',
  pg_temp.works($$insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '56000000-0000-4000-8000-000000000002/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.md', '{"size":"5"}')$$));
select pg_temp.check(1, 'deleting one object frees a slot',
  pg_temp.works($$delete from storage.objects where name = (select name from storage.objects where name like '56000000-0000-4000-8000-000000000001/draft/%' limit 1)$$)
  and pg_temp.works($$insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '56000000-0000-4000-8000-000000000001/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3.md', '{"size":"5"}')$$));
reset role;

-- ====================================================================================================================
-- 2. Kapak nesnesi sayısı 10 ile sınırlı
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(2, 'ten cover objects are accepted',
  pg_temp.works($$insert into storage.objects (bucket_id, name, metadata) select 'skill-files', '56000000-0000-4000-8000-000000000002/cover/' || gen_random_uuid() || '.jpg', '{"size":"5"}'::jsonb from generate_series(1, 10)$$));
select pg_temp.check(2, 'the 11th cover object is rejected',
  pg_temp.raises($$insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '56000000-0000-4000-8000-000000000002/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpg', '{"size":"5"}')$$, 'row-level security'));
select pg_temp.check(2, 'the old path rules still hold (bad name, packages folder)',
  pg_temp.raises($$insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '56000000-0000-4000-8000-000000000002/packages/1.0.0-0123456789abcdef.zip', '{"size":"5"}')$$, 'row-level security')
  and pg_temp.raises($$insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '56000000-0000-4000-8000-000000000002/draft/not-a-uuid.md', '{"size":"5"}')$$, 'row-level security'));
reset role;

-- ====================================================================================================================
-- 3. skill_publish_commit: Storage kaydında boyut yoksa uyuşmazlık sayılır; günlük sınır commit'te de uygulanır
-- ====================================================================================================================
insert into storage.objects (bucket_id, name, metadata) values
  ('skill-files', '56000000-0000-4000-8000-000000000001/packages/1.0.0-0123456789abcdef.zip', '{}'::jsonb);
set role service_role; select pg_temp.as_service();
select pg_temp.check(3, 'a package whose Storage record has no size is a mismatch, not silently accepted',
  pg_temp.raises(format($$select public.skill_publish_commit(%L, %L, '1.0.0', '', gen_random_uuid(), %L, 10, 0, '{}'::jsonb)$$, :alice, :s1, repeat('0123456789abcdef', 4)), 'skill_package_mismatch'));
reset role;
update storage.objects set metadata = '{"size":"10"}'::jsonb where name = '56000000-0000-4000-8000-000000000001/packages/1.0.0-0123456789abcdef.zip';
set role service_role; select pg_temp.as_service();
select pg_temp.check(3, 'with the size recorded the commit succeeds',
  (select (public.skill_publish_commit(:alice, :s1, '1.0.0', '', gen_random_uuid(), repeat('0123456789abcdef', 4), 10, 0, '{}'::jsonb))->>'version' = '1.0.0'));
reset role;
-- 10 yayın dolu (9 doğrudan + yukarıdaki 1): bir sonraki commit sınırı aşar
insert into public.skill_versions (skill_id, version, package_path, package_sha256, package_size, file_count)
  select :s2, '1.' || g || '.0', '56000000-0000-4000-8000-000000000002/packages/1.' || g || '.0-' || substr(repeat('0', 64), 1, 16) || '.zip', repeat('0', 64), 1, 0 from generate_series(1, 9) g;
insert into storage.objects (bucket_id, name, metadata) values
  ('skill-files', '56000000-0000-4000-8000-000000000001/packages/1.1.0-fedcba9876543210.zip', '{"size":"10"}');
set role service_role; select pg_temp.as_service();
select pg_temp.check(3, 'the 11th publish in 24 hours is rejected by commit as well',
  pg_temp.raises(format($$select public.skill_publish_commit(%L, %L, '1.1.0', 'ikinci surum', gen_random_uuid(), %L, 10, 0, '{}'::jsonb)$$, :alice, :s1, repeat('fedcba9876543210', 4)), 'skill_publish_rate_limit'));
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
