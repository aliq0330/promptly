-- Skill yayın koruması (docs/history/414-*, `20261204100000_skill_publish_guard.sql`): istemci `status`/`version` ile Edge doğrulamasını atlayamaz; yayında özel anahtar/JWT olmaz;
-- `skill-files` bucket'ı yalnız Skill türlerini kabul eder.
--
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/skills-publish-guard.sql   ("FAILED=0" beklenir).
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
\set easy '''54000000-0000-4000-8000-000000000001'''
\set filed '''54000000-0000-4000-8000-000000000002'''
\set pkg '''54000000-0000-4000-8000-000000000003'''

grant select, insert, delete on storage.objects to anon, authenticated, service_role;

-- ====================================================================================================================
-- 1. Kolay mod (dosyasız, sürümsüz Skill): doğrudan yayın ve sürüm etiketi AYNEN çalışır
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(1, 'easy mode: a file-less skill can be inserted as published with its own version label',
  pg_temp.works(format($$insert into public.skills (id, author_id, slug, title, summary, instructions, status, version) values (%L, %L, 'easy', 'Easy', 'S', '# Rol', 'published', '5.0.0')$$, :easy, :alice)));
select pg_temp.check(1, 'easy mode: status and version stay freely editable',
  pg_temp.works(format($$update public.skills set status = 'draft', version = '6.1.0' where id = %L$$, :easy))
  and pg_temp.works(format($$update public.skills set status = 'published' where id = %L$$, :easy)));
reset role;

-- ====================================================================================================================
-- 2. Dosyalı ama sürümsüz Skill: istemci "yayında"ya geçiremez (yalnız Edge)
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
insert into public.skills (id, author_id, slug, title, summary, instructions, status) values (:filed, :alice, 'filed', 'Filed', 'S', '# Rol', 'draft');
insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path, is_script) values
  (:filed, 'rules/a.md', 'rule', 5, repeat('a', 64), '54000000-0000-4000-8000-000000000002/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.md', false);
select pg_temp.check(2, 'a skill with files and no version cannot be flipped to published from the client',
  pg_temp.raises(format($$update public.skills set status = 'published' where id = %L$$, :filed), 'skill_publish_via_edge'));
select pg_temp.check(2, 'it stays a draft', (select status = 'draft' from public.skills where id = :filed));
select pg_temp.check(2, 'other edits on that draft still work', pg_temp.works(format($$update public.skills set title = 'Filed 2', summary = 'Yeni özet' where id = %L$$, :filed)));
select pg_temp.check(2, 'the skill can keep a draft status update (no-op)', pg_temp.works(format($$update public.skills set status = 'draft' where id = %L$$, :filed)));
reset role;
select pg_temp.check(2, 'the service role / table owner is not blocked', pg_temp.works(format($$update public.skills set status = 'published' where id = %L$$, :filed)));
update public.skills set status = 'draft' where id = :filed;

-- ====================================================================================================================
-- 3. Sürümü olan Skill: sürüm numarası istemciden değişmez; yayın kapat/aç serbest
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
insert into public.skills (id, author_id, slug, title, summary, instructions, status) values (:pkg, :alice, 'pkg', 'Pkg', 'S', '# Rol', 'draft');
reset role;
insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '54000000-0000-4000-8000-000000000003/packages/1.0.0-0123456789abcdef.zip', '{"size":"10"}');
set role service_role; select pg_temp.as_service();
select pg_temp.check(3, 'the publish commit (definer) sets status and version',
  (select (public.skill_publish_commit(:alice, :pkg, '1.0.0', '', gen_random_uuid(), repeat('0123456789abcdef', 4), 10, 0, '{}'::jsonb))->>'version' = '1.0.0'));
reset role;
select pg_temp.check(3, 'the committed skill is published at 1.0.0', (select status = 'published' and version = '1.0.0' from public.skills where id = :pkg));

set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(3, 'a versioned skill''s version number cannot be changed by the client',
  pg_temp.raises(format($$update public.skills set version = '99.0.0' where id = %L$$, :pkg), 'skill_publish_via_edge'));
select pg_temp.check(3, 'the same version value is a no-op and passes', pg_temp.works(format($$update public.skills set version = '1.0.0', title = 'Pkg 2' where id = %L$$, :pkg)));
select pg_temp.check(3, 'a versioned skill can be unpublished and published again by the owner',
  pg_temp.works(format($$update public.skills set status = 'draft' where id = %L$$, :pkg))
  and pg_temp.works(format($$update public.skills set status = 'published' where id = %L$$, :pkg)));
reset role;
select pg_temp.check(3, 'the version stayed 1.0.0', (select version = '1.0.0' from public.skills where id = :pkg));

-- ====================================================================================================================
-- 4. Yayında özel anahtar / JWT olmaz (Edge'in engelleyen iki kuralı); sağlayıcı anahtarı yalnız uyarıdır
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'publishing a new skill with a private key block is rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, title, summary, instructions, status) values (%L, 'k1', 'K', 'S', E'x\n-----BEGIN RSA PRIVATE KEY-----\nabc', 'published')$$, :alice), 'skill_secret_found'));
select pg_temp.check(4, 'publishing with a JWT in the summary is rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, title, summary, instructions, status) values (%L, 'k2', 'K', 'tok eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r', '# x', 'published')$$, :alice), 'skill_secret_found'));
select pg_temp.check(4, 'a DRAFT may hold them (it is not public)',
  pg_temp.works(format($$insert into public.skills (id, author_id, slug, title, summary, instructions, status) values ('54000000-0000-4000-8000-000000000004', %L, 'k3', 'K', 'S', E'-----BEGIN PRIVATE KEY-----', 'draft')$$, :alice)));
select pg_temp.check(4, 'but publishing that draft is rejected',
  pg_temp.raises($$update public.skills set status = 'published' where id = '54000000-0000-4000-8000-000000000004'$$, 'skill_secret_found'));
select pg_temp.check(4, 'adding a key to an already published skill is rejected',
  pg_temp.raises(format($$update public.skills set instructions = E'# Rol\n-----BEGIN OPENSSH PRIVATE KEY-----' where id = %L$$, :easy), 'skill_secret_found'));
select pg_temp.check(4, 'a provider key (sk-ant-…) is only a client-side warning and is accepted',
  pg_temp.works(format($$update public.skills set instructions = 'ornek sk-ant-abcdefghijklmnopqrstuvwxyz0123456789' where id = %L$$, :easy)));
select pg_temp.check(4, 'a normal text with the word eyJ is fine',
  pg_temp.works(format($$update public.skills set instructions = 'eyJ is how a JWT header starts: eyJhbGciOiJIUzI1NiJ9' where id = %L$$, :easy)));
reset role;

-- ====================================================================================================================
-- 5. skill-files bucket'ı yalnız Skill türlerini kabul eder
-- ====================================================================================================================
select pg_temp.check(5, 'skill-files has a MIME allowlist', (select allowed_mime_types is not null from storage.buckets where id = 'skill-files'));
select pg_temp.check(5, 'it excludes html, svg and javascript',
  (select not (allowed_mime_types && array['text/html', 'image/svg+xml', 'application/javascript', 'text/javascript', 'application/xhtml+xml']) from storage.buckets where id = 'skill-files'));
select pg_temp.check(5, 'it includes every type the client and Edge actually upload',
  (select allowed_mime_types @> array['text/markdown', 'text/plain', 'text/csv', 'text/yaml', 'application/json', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/zip'] from storage.buckets where id = 'skill-files'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
