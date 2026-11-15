-- Skill veri modeli ve paket: DB tarafı davranış ve RLS testi (docs/history/389-*).
--
-- Kurallar: dosya satırları yalnız sahibine görünür/yazılır, yol/tür/betik/saklama yolu kısıtları kötü veriyi reddeder, dosya/kota sınırları
-- tetikleyiciyle zorlanır; sürüm satırını yalnız `skill_publish_commit` yazar (yalnız service_role), yayından sonra değişmez; okuma Skill'in
-- görünürlüğünü izler; etiket/ilişki/sabitleme kuralları; kullanım kaydı; Storage politikaları; yetim taraması skill-files'ı tanır.
--
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/skills-package.sql   ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');
update public.profiles set username = 'alice' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set username = 'bobby' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set username = 'carol' where id = '33333333-3333-4333-8333-333333333333';

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
\set carol '''33333333-3333-4333-8333-333333333333'''
\set s1 '''52000000-0000-4000-8000-000000000001'''
\set s2 '''52000000-0000-4000-8000-000000000002'''
\set sdraft '''52000000-0000-4000-8000-000000000003'''

grant select, insert, delete on storage.objects to anon, authenticated, service_role;
insert into public.tags (slug, label) values ('ornek', 'Örnek'), ('test', 'Test') on conflict do nothing;

-- Fixture: Alice'in yayınlanmış herkese açık Skill'i (s1), özel Skill'i (s2), taslağı (sdraft)
set role authenticated; select pg_temp.as_user(:alice);
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:s1, :alice, 'public-skill', 'Public', 'S', '# Rol', 'published', 'public'),
  (:s2, :alice, 'private-skill', 'Private', 'S', '# Rol', 'published', 'private'),
  (:sdraft, :alice, 'draft-skill', 'Draft', 'S', '# Rol', 'draft', 'public');
reset role;

-- ====================================================================================================================
-- 1. skill_files: yalnız sahibine görünür ve yazılır
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path, is_script) values
  (:s1, 'rules/style.md', 'rule', 120, repeat('a', 64), '52000000-0000-4000-8000-000000000001/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.md', false),
  (:s1, 'scripts/run.sh', 'script', 80, repeat('b', 64), '52000000-0000-4000-8000-000000000001/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.sh', true),
  (:s1, 'README.md', 'other', 10, repeat('c', 64), '52000000-0000-4000-8000-000000000001/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3.md', false);
-- is_script ve kind bilgisini istemci yanlış veremez (sonraki bölümde); burada doğru değerler satırı kabul etti:
select pg_temp.check(1, 'owner inserts valid file rows', (select count(*) from public.skill_files where skill_id = :s1) = 3);
select pg_temp.check(1, 'the .sh file is flagged as a script by the CHECK', (select is_script from public.skill_files where path = 'scripts/run.sh') = true);
reset role;

set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(1, 'another user cannot read file rows even of a PUBLIC skill', (select count(*) from public.skill_files) = 0);
select pg_temp.check(1, 'another user cannot add a file to someone else''s skill',
  pg_temp.raises(format($$insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path) values (%L, 'rules/x.md', 'rule', 1, %L, %L)$$,
    '52000000-0000-4000-8000-000000000001', repeat('d', 64), '52000000-0000-4000-8000-000000000001/draft/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.md'), 'row-level security'));
update public.skill_files set size = 1 where skill_id = :s1;
delete from public.skill_files where skill_id = :s1;
reset role;
select pg_temp.check(1, 'another user''s update/delete touched nothing', (select count(*) from public.skill_files where skill_id = :s1 and size > 1) = 3);

select pg_temp.as_anon(); set role anon;
select pg_temp.check(1, 'anon cannot read file rows', pg_temp.raises('select count(*) from public.skill_files', 'permission denied'));
reset role;

-- ====================================================================================================================
-- 2. skill_files kısıtları: yol, uzantı, tür, betik bayrağı, saklama yolu, boyut
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
create or replace function pg_temp.file_try(p_path text, p_kind text, p_size bigint, p_script boolean, p_storage text) returns text language plpgsql as $$
begin
  insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path, is_script)
  values ('52000000-0000-4000-8000-000000000001', p_path, p_kind, p_size, repeat('e', 64), p_storage, p_script);
  delete from public.skill_files where path = p_path and skill_id = '52000000-0000-4000-8000-000000000001';
  return 'ok';
exception when others then return sqlerrm;
end $$;
\set okstore '52000000-0000-4000-8000-000000000001/draft/cccccccc-cccc-4ccc-8ccc-cccccccccccc.md'
select pg_temp.check(2, 'a clean text path is accepted', pg_temp.file_try('references/guide.md', 'reference', 5, false, :'okstore') = 'ok');
select pg_temp.check(2, 'path traversal is rejected', pg_temp.file_try('../evil.md', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a nested traversal segment is rejected', pg_temp.file_try('rules/../x.md', 'rule', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'an absolute path is rejected', pg_temp.file_try('/etc/passwd.md', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a backslash path is rejected', pg_temp.file_try('rules\x.md', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a hidden file (.env.md) is rejected', pg_temp.file_try('.env.md', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a hidden folder is rejected', pg_temp.file_try('.git/config.md', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'more than 6 levels is rejected', pg_temp.file_try('a/b/c/d/e/f/g.md', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, '6 levels is accepted', pg_temp.file_try('a/b/c/d/e/f.md', 'other', 5, false, :'okstore') = 'ok');
select pg_temp.check(2, 'an executable extension is rejected', pg_temp.file_try('tools/run.exe', 'tool', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a library extension is rejected', pg_temp.file_try('tools/x.so', 'tool', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a file without an extension is rejected', pg_temp.file_try('rules/LICENSE', 'rule', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'reserved SKILL.md is rejected (case-insensitive)', pg_temp.file_try('skill.MD', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'reserved metadata.json is rejected', pg_temp.file_try('metadata.json', 'other', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a wrong kind for the folder is rejected', pg_temp.file_try('rules/x.md', 'example', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a script not flagged as a script is rejected', pg_temp.file_try('scripts/x.py', 'script', 5, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a flagged script is accepted', pg_temp.file_try('scripts/x.py', 'script', 5, true, :'okstore') = 'ok');
select pg_temp.check(2, 'a markdown file wrongly flagged as a script is rejected', pg_temp.file_try('rules/x.md', 'rule', 5, true, :'okstore') like '%check%');
select pg_temp.check(2, 'a file over 5 MB is rejected', pg_temp.file_try('references/big.pdf', 'reference', 5242881, false, :'okstore') like '%check%');
select pg_temp.check(2, 'a storage path of ANOTHER skill is rejected', pg_temp.file_try('references/g.md', 'reference', 5, false, '52000000-0000-4000-8000-000000000002/draft/cccccccc-cccc-4ccc-8ccc-cccccccccccc.md') like '%check%');
select pg_temp.check(2, 'a package-folder storage path is rejected for working files', pg_temp.file_try('references/g.md', 'reference', 5, false, '52000000-0000-4000-8000-000000000001/packages/x.md') like '%check%');
select pg_temp.check(2, 'a duplicate path that differs only by case is rejected (case-insensitive file systems)',
  pg_temp.raises(format($$insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path) values (%L, 'rules/Style.MD', 'rule', 1, %L, %L)$$,
    '52000000-0000-4000-8000-000000000001', repeat('f', 64), '52000000-0000-4000-8000-000000000001/draft/dddddddd-dddd-4ddd-8ddd-ddddddddddd2.md'), 'skill_files_lower_path_uidx'));
select pg_temp.check(2, 'a duplicate path in one skill is rejected',
  pg_temp.raises(format($$insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path) values (%L, 'rules/style.md', 'rule', 1, %L, %L)$$,
    '52000000-0000-4000-8000-000000000001', repeat('f', 64), '52000000-0000-4000-8000-000000000001/draft/dddddddd-dddd-4ddd-8ddd-dddddddddddd.md'), 'duplicate key'));
reset role;

-- ====================================================================================================================
-- 3. Sınırlar: dosya sayısı (100), Skill başına toplam (40 MB), kişi başına kota (200 MB)
-- ====================================================================================================================
-- sdraft'a 100 dosya (hız sınırından kaçınmak için oturumsuz/postgres olarak ekle; tetikleyici auth.uid()'den bağımsızdır)
select pg_temp.as_anon();
insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path)
select '52000000-0000-4000-8000-000000000003', 'references/f' || i || '.md', 'reference', 1, repeat('1', 64),
       '52000000-0000-4000-8000-000000000003/draft/' || lpad(i::text, 8, '0') || '-0000-4000-8000-000000000000.md'
from generate_series(1, 100) i;
select pg_temp.check(3, 'the 100th file is accepted', (select count(*) from public.skill_files where skill_id = :sdraft) = 100);
select pg_temp.check(3, 'the 101st file is rejected', pg_temp.raises(format($$insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path) values (%L, 'references/over.md', 'reference', 1, %L, %L)$$,
  '52000000-0000-4000-8000-000000000003', repeat('2', 64), '52000000-0000-4000-8000-000000000003/draft/99999999-0000-4000-8000-000000000000.md'), 'skill_too_many_files'));
delete from public.skill_files where skill_id = :sdraft;

-- Skill başına 40 MB (5 MB × 8 = 40 MB tamam; 9. dosya taşar)
insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path)
select '52000000-0000-4000-8000-000000000003', 'references/p' || i || '.pdf', 'reference', 5242880, repeat('3', 64),
       '52000000-0000-4000-8000-000000000003/draft/' || lpad(i::text, 8, '0') || '-1111-4111-8111-111111111111.pdf'
from generate_series(1, 8) i;
select pg_temp.check(3, '8 x 5 MB (40 MB) is accepted', (select sum(size) from public.skill_files where skill_id = :sdraft) = 41943040);
select pg_temp.check(3, 'one more byte over 40 MB per skill is rejected', pg_temp.raises(format($$insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path) values (%L, 'references/x.md', 'reference', 1, %L, %L)$$,
  '52000000-0000-4000-8000-000000000003', repeat('4', 64), '52000000-0000-4000-8000-000000000003/draft/98989898-0000-4000-8000-000000000000.md'), 'skill_files_too_large'));
delete from public.skill_files where skill_id = :sdraft;

-- Kişi başına 200 MB: 5 Skill x 40 MB = 200 MB; bir sonraki bayt kotayı aşar
insert into public.skills (id, author_id, slug, title) values
  ('52000000-0000-4000-8000-0000000000a1', :alice, 'quota-1', 'q1'), ('52000000-0000-4000-8000-0000000000a2', :alice, 'quota-2', 'q2'),
  ('52000000-0000-4000-8000-0000000000a3', :alice, 'quota-3', 'q3'), ('52000000-0000-4000-8000-0000000000a4', :alice, 'quota-4', 'q4'),
  ('52000000-0000-4000-8000-0000000000a5', :alice, 'quota-5', 'q5');
insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path)
select s.id, 'references/p' || i || '.pdf', 'reference', 5242000, repeat('5', 64), s.id::text || '/draft/' || lpad(i::text, 8, '0') || '-2222-4222-8222-222222222222.pdf'
from public.skills s, generate_series(1, 8) i where s.slug like 'quota-%';
select pg_temp.check(3, 'per-user total is just under the 200 MB limit', (select coalesce(sum(f.size), 0) from public.skill_files f join public.skills s on s.id = f.skill_id where s.author_id = :alice) > 209000000);
select pg_temp.check(3, 'the user quota (200 MB) blocks an upload that would exceed it',
  pg_temp.raises(format($$insert into public.skill_files (skill_id, path, kind, size, sha256, storage_path) values (%L, 'references/q.md', 'reference', 40000, %L, %L)$$,
    '52000000-0000-4000-8000-000000000003', repeat('6', 64), '52000000-0000-4000-8000-000000000003/draft/97979797-0000-4000-8000-000000000000.md'), 'skill_quota_exceeded'));
delete from public.skills where slug like 'quota-%';
delete from public.skill_files where skill_id = :sdraft;

-- ====================================================================================================================
-- 4. skill_versions: okuma Skill'i izler; istemci yazamaz; yalnız commit yazar; yayından sonra değişmez
-- ====================================================================================================================
-- Yayın akışı: begin → (Edge paketi yazar) → commit. Yalnız service_role çağırabilir.
select pg_temp.as_service(); set role service_role;
select pg_temp.check(4, 'begin returns the skill, its files and the author for the Edge Function',
  (select (r->'skill'->>'slug') = 'public-skill' and jsonb_array_length(r->'files') = 3 and (r->'skill'->>'author_username') = 'alice' and (r->>'already') = 'false'
   from (select public.skill_publish_begin(:alice, :s1, '1.0.0', '', '53000000-0000-4000-8000-000000000001') as r) q));
reset role;
-- paket henüz Storage'da değil: commit reddedilir
select pg_temp.as_service(); set role service_role;
select pg_temp.check(4, 'commit fails while the package object is missing',
  pg_temp.raises(format($$select public.skill_publish_commit(%L, %L, '1.0.0', '', %L, %L, 100, 3, '{}'::jsonb)$$, :alice, :s1, '53000000-0000-4000-8000-000000000001', repeat('a', 64)), 'skill_package_missing'));
reset role;
-- Edge Function paketi yazdı (service role)
insert into storage.objects (bucket_id, name, metadata) values
  ('skill-files', '52000000-0000-4000-8000-000000000001/packages/1.0.0-' || substr(repeat('a', 64), 1, 16) || '.zip', '{"size": 100}');
select pg_temp.as_service(); set role service_role;
select pg_temp.check(4, 'commit fails when the stored size differs from the reported size',
  pg_temp.raises(format($$select public.skill_publish_commit(%L, %L, '1.0.0', '', %L, %L, 999, 3, '{}'::jsonb)$$, :alice, :s1, '53000000-0000-4000-8000-000000000001', repeat('a', 64)), 'skill_package_mismatch'));
select pg_temp.check(4, 'commit by someone who is not the author fails',
  pg_temp.raises(format($$select public.skill_publish_commit(%L, %L, '1.0.0', '', %L, %L, 100, 3, '{}'::jsonb)$$, :bob, :s1, '53000000-0000-4000-8000-000000000001', repeat('a', 64)), 'skill_not_found'));
select pg_temp.check(4, 'a valid commit writes the version row',
  (select (r->>'version') = '1.0.0' and (r->>'package_path') like '%/packages/1.0.0-aaaaaaaaaaaaaaaa.zip'
   from (select public.skill_publish_commit(:alice, :s1, '1.0.0', '', '53000000-0000-4000-8000-000000000001', repeat('a', 64), 100, 3,
     '{"files":[{"path":"rules/style.md"}]}'::jsonb) as r) q));
-- idempotent: aynı belirteçle ikinci çağrı yeni satır açmaz, aynı sonucu döner
select pg_temp.check(4, 'repeating the same client token is idempotent (begin)',
  (select (r->>'already') = 'true' from (select public.skill_publish_begin(:alice, :s1, '1.0.0', '', '53000000-0000-4000-8000-000000000001') as r) q));
select pg_temp.check(4, 'repeating the same client token is idempotent (commit)',
  (select (r->>'version') = '1.0.0' from (select public.skill_publish_commit(:alice, :s1, '1.0.0', '', '53000000-0000-4000-8000-000000000001', repeat('a', 64), 100, 3, '{}'::jsonb) as r) q));
reset role;
select pg_temp.check(4, 'exactly one version row exists after the retried publish', (select count(*) from public.skill_versions where skill_id = :s1) = 1);
select pg_temp.check(4, 'the working copy moved to the published version', (select version = '1.0.0' and status = 'published' from public.skills where id = :s1));

-- İstemci rolleri yazamaz, service-only fonksiyonları çağıramaz
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'a client cannot insert a version row', pg_temp.raises(format($$insert into public.skill_versions (skill_id, version, package_path, package_sha256, package_size, file_count) values (%L, '9.9.9', 'x', %L, 1, 0)$$, :s1, repeat('0', 64)), 'permission denied'));
select pg_temp.check(4, 'a client cannot call skill_publish_begin', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '1.0.1', 'n', gen_random_uuid())$$, :alice, :s1), 'permission denied'));
select pg_temp.check(4, 'a client cannot call skill_publish_commit', pg_temp.raises(format($$select public.skill_publish_commit(%L, %L, '1.0.1', 'n', gen_random_uuid(), %L, 1, 0, '{}'::jsonb)$$, :alice, :s1, repeat('0', 64)), 'permission denied'));
select pg_temp.check(4, 'a client cannot update a version row', pg_temp.raises($$update public.skill_versions set changelog = 'x'$$, 'permission denied'));
select pg_temp.check(4, 'the owner can read their versions', (select count(*) from public.skill_versions where skill_id = :s1) = 1);
reset role;

set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(4, 'another user reads the version of a PUBLISHED public skill', (select count(*) from public.skill_versions where skill_id = :s1) = 1);
reset role;
select pg_temp.as_anon(); set role anon;
select pg_temp.check(4, 'anon reads the version of a published public skill', (select count(*) from public.skill_versions where skill_id = :s1) = 1);
reset role;

-- Değişmezlik (tabloyu sahip/postgres rolüyle bile)
select pg_temp.check(4, 'a published version cannot be rewritten (even by the table owner)', pg_temp.raises($$update public.skill_versions set changelog = 'changed'$$, 'skill_version_immutable'));
select pg_temp.check(4, 'the package hash cannot be rewritten', pg_temp.raises($$update public.skill_versions set package_sha256 = repeat('9', 64)$$, 'skill_version_immutable'));
update public.skill_versions set deprecated_at = now();
select pg_temp.check(4, 'deprecated_at CAN change', (select count(*) from public.skill_versions where deprecated_at is not null) = (select count(*) from public.skill_versions));
update public.skill_versions set deprecated_at = null;
select pg_temp.check(4, 'a version row with a mismatched package path is rejected (CHECK)',
  pg_temp.raises(format($$insert into public.skill_versions (skill_id, version, package_path, package_sha256, package_size, file_count) values (%L, '2.0.0', 'other/path.zip', %L, 1, 0)$$, :s1, repeat('1', 64)), 'check'));

-- Sürüm kuralları (begin): sıra, değişiklik notu, biçim
select pg_temp.as_service(); set role service_role;
select pg_temp.check(4, 'the same version again is rejected', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '1.0.0', 'x yy', gen_random_uuid())$$, :alice, :s1), 'skill_version_exists'));
select pg_temp.check(4, 'an older version is rejected', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '0.9.0', 'x yy', gen_random_uuid())$$, :alice, :s1), 'skill_version_not_newer'));
select pg_temp.check(4, 'a new version after the first needs a changelog', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '1.0.1', '', gen_random_uuid())$$, :alice, :s1), 'skill_changelog_required'));
select pg_temp.check(4, 'a too short changelog is rejected', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '1.0.1', 'ab', gen_random_uuid())$$, :alice, :s1), 'skill_changelog_required'));
select pg_temp.check(4, 'a malformed version is rejected', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, 'v1.1', 'notes ok', gen_random_uuid())$$, :alice, :s1), 'skill_version_invalid'));
select pg_temp.check(4, 'a valid next version with a changelog passes begin', (select (r->>'already') = 'false' from (select public.skill_publish_begin(:alice, :s1, '1.0.1', 'notes ok', gen_random_uuid()) as r) q));
select pg_temp.check(4, 'a non-author cannot begin a publish', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '1.0.1', 'notes ok', gen_random_uuid())$$, :bob, :s1), 'skill_not_found'));
reset role;
-- 1.10.0 > 1.9.0 (sayısal karşılaştırma): 1.9.0 ekle, sonra 1.10.0 kabul edilmeli
insert into storage.objects (bucket_id, name, metadata) values
  ('skill-files', '52000000-0000-4000-8000-000000000001/packages/1.9.0-' || substr(repeat('b', 64), 1, 16) || '.zip', '{"size": 50}');
select pg_temp.as_service(); set role service_role;
select public.skill_publish_commit(:alice, :s1, '1.9.0', 'ninth minor', '53000000-0000-4000-8000-000000000009', repeat('b', 64), 50, 3, '{}'::jsonb);
select pg_temp.check(4, '1.10.0 is newer than 1.9.0 (numeric, not textual)', (select (r->>'already') = 'false' from (select public.skill_publish_begin(:alice, :s1, '1.10.0', 'tenth minor', gen_random_uuid()) as r) q));
reset role;

-- skill_set_deprecated: yalnız sahibi
set role authenticated; select pg_temp.as_user(:alice);
select public.skill_set_deprecated(:s1, '1.0.0', true);
select pg_temp.check(4, 'owner marks a version deprecated', (select deprecated_at is not null from public.skill_versions where skill_id = :s1 and version = '1.0.0'));
select public.skill_set_deprecated(:s1, '1.0.0', false);
select pg_temp.check(4, 'owner un-deprecates a version', (select deprecated_at is null from public.skill_versions where skill_id = :s1 and version = '1.0.0'));
select pg_temp.check(4, 'an unknown version raises', pg_temp.raises(format($$select public.skill_set_deprecated(%L, '7.7.7', true)$$, :s1), 'skill_version_not_found'));
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(4, 'a non-owner cannot deprecate', pg_temp.raises(format($$select public.skill_set_deprecated(%L, '1.0.0', true)$$, :s1), 'skill_not_found'));
reset role;

-- Günlük yayın sınırı: 24 saatte en çok 10 yayın
insert into public.skill_versions (skill_id, version, package_path, package_sha256, package_size, file_count)
select :sdraft, '1.0.' || i, '52000000-0000-4000-8000-000000000003/packages/1.0.' || i || '-' || substr(repeat('c', 64), 1, 16) || '.zip', repeat('c', 64), 10, 0
from generate_series(0, 9) i;
select pg_temp.as_service(); set role service_role;
select pg_temp.check(4, 'the 11th publish in 24 hours is rate limited', pg_temp.raises(format($$select public.skill_publish_begin(%L, %L, '5.0.0', 'notes ok', gen_random_uuid())$$, :alice, :s2), 'skill_publish_rate_limit'));
reset role;
delete from public.skill_versions where skill_id = :sdraft;

-- Taslak/özel Skill'in sürümü başkasına görünmez
select pg_temp.as_service(); set role service_role;
insert into storage.objects (bucket_id, name, metadata) values ('skill-files', '52000000-0000-4000-8000-000000000002/packages/1.0.0-' || substr(repeat('d', 64), 1, 16) || '.zip', '{"size": 20}');
select public.skill_publish_commit(:alice, :s2, '1.0.0', '', '53000000-0000-4000-8000-000000000002', repeat('d', 64), 20, 0, '{}'::jsonb);
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(4, 'a private skill''s version is invisible to others', (select count(*) from public.skill_versions where skill_id = :s2) = 0);
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'the owner sees their private skill''s version', (select count(*) from public.skill_versions where skill_id = :s2) = 1);
reset role;

-- ====================================================================================================================
-- 5. Storage politikaları (skill-files)
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
insert into storage.objects (bucket_id, name, owner) values ('skill-files', '52000000-0000-4000-8000-000000000001/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md', :alice);
select pg_temp.check(5, 'owner uploads a draft file into their skill folder',
  exists (select 1 from storage.objects where name = '52000000-0000-4000-8000-000000000001/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md'));
select pg_temp.check(5, 'owner cannot upload into the packages folder',
  pg_temp.raises(format($$insert into storage.objects (bucket_id, name, owner) values ('skill-files', %L, %L)$$, '52000000-0000-4000-8000-000000000001/packages/9.9.9-aaaaaaaaaaaaaaaa.zip', :alice), 'row-level security'));
select pg_temp.check(5, 'owner cannot upload a file with a bad extension pattern',
  pg_temp.raises(format($$insert into storage.objects (bucket_id, name, owner) values ('skill-files', %L, %L)$$, '52000000-0000-4000-8000-000000000001/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2.exe.bin', :alice), 'row-level security'));
select pg_temp.check(5, 'owner cannot upload under a name that is not a uuid',
  pg_temp.raises(format($$insert into storage.objects (bucket_id, name, owner) values ('skill-files', %L, %L)$$, '52000000-0000-4000-8000-000000000001/draft/../evil.md', :alice), 'row-level security'));
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(5, 'another user cannot upload into someone else''s skill folder',
  pg_temp.raises(format($$insert into storage.objects (bucket_id, name, owner) values ('skill-files', %L, %L)$$, '52000000-0000-4000-8000-000000000001/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3.md', :bob), 'row-level security'));
select pg_temp.check(5, 'another user cannot read a draft file of a PUBLIC skill', (select count(*) from storage.objects where name like '%/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md') = 0);
select pg_temp.check(5, 'another user reads the PUBLISHED package of a public skill', (select count(*) from storage.objects where name like '52000000-0000-4000-8000-000000000001/packages/1.0.0-%') = 1);
select pg_temp.check(5, 'another user cannot read the package of a PRIVATE skill', (select count(*) from storage.objects where name like '52000000-0000-4000-8000-000000000002/packages/%') = 0);
delete from storage.objects where name like '%/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md';
reset role;
select pg_temp.check(5, 'another user''s delete of a draft file removed nothing', (select count(*) from storage.objects where name like '%/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md') = 1);
select pg_temp.as_anon(); set role anon;
select pg_temp.check(5, 'anon reads a published public package but no draft', (select count(*) from storage.objects where bucket_id = 'skill-files' and name like '%/packages/1.0.0-aaaa%') = 1 and (select count(*) from storage.objects where name like '%/draft/%') = 0);
reset role;
set role authenticated; select pg_temp.as_user(:alice);
delete from storage.objects where name like '%/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md';
select pg_temp.check(5, 'owner deletes their draft file', (select count(*) from storage.objects where name like '%/draft/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1.md') = 0);
reset role;

-- ====================================================================================================================
-- 6. Etiketler, ilişkiler, sabitleme, kullanım
-- ====================================================================================================================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('54000000-0000-4000-8000-000000000001', :carol, 'Public prompt', 'd', 'p', 'text', 'published', 'public'),
  ('54000000-0000-4000-8000-000000000002', :carol, 'Private prompt', 'd', 'p', 'text', 'published', 'private');

set role authenticated; select pg_temp.as_user(:alice);
insert into public.skill_tags (skill_id, tag_slug) values (:s1, 'ornek');
select pg_temp.check(6, 'owner tags their skill', (select count(*) from public.skill_tags where skill_id = :s1) = 1);
insert into public.skill_relations (skill_id, target_type, target_id) values (:s1, 'prompt', '54000000-0000-4000-8000-000000000001');
select pg_temp.check(6, 'a public prompt can be related', (select count(*) from public.skill_relations where skill_id = :s1) = 1);
select pg_temp.check(6, 'a private prompt cannot be related', pg_temp.raises(format($$insert into public.skill_relations (skill_id, target_type, target_id) values (%L, 'prompt', '54000000-0000-4000-8000-000000000002')$$, :s1), 'skill_relation_not_public'));
select pg_temp.check(6, 'a nonexistent target gets the same error', pg_temp.raises(format($$insert into public.skill_relations (skill_id, target_type, target_id) values (%L, 'prompt', gen_random_uuid())$$, :s1), 'skill_relation_not_public'));
select pg_temp.check(6, 'a request cannot be related (only prompt, workflow, preset)', pg_temp.raises(format($$insert into public.skill_relations (skill_id, target_type, target_id) values (%L, 'request', gen_random_uuid())$$, :s1), 'skill_relation_not_public'));
select pg_temp.check(6, 'the same target twice is rejected', pg_temp.raises(format($$insert into public.skill_relations (skill_id, target_type, target_id) values (%L, 'prompt', '54000000-0000-4000-8000-000000000001')$$, :s1), 'duplicate key'));
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(6, 'another user reads tags and relations of a public skill', (select count(*) from public.skill_tags where skill_id = :s1) = 1 and (select count(*) from public.skill_relations where skill_id = :s1) = 1);
select pg_temp.check(6, 'another user cannot tag someone else''s skill', pg_temp.raises(format($$insert into public.skill_tags (skill_id, tag_slug) values (%L, 'test')$$, :s1), 'row-level security'));
select pg_temp.check(6, 'another user cannot relate someone else''s skill', pg_temp.raises(format($$insert into public.skill_relations (skill_id, target_type, target_id) values (%L, 'prompt', '54000000-0000-4000-8000-000000000001')$$, :s1), 'row-level security'));
reset role;
-- tag cap (10) and relation cap (20)
insert into public.tags (slug, label) select 't' || i, 'T' || i from generate_series(1, 12) i on conflict do nothing;
insert into public.skill_tags (skill_id, tag_slug) select :sdraft, 't' || i from generate_series(1, 10) i;
select pg_temp.check(6, 'the 11th tag is rejected', pg_temp.raises(format($$insert into public.skill_tags (skill_id, tag_slug) values (%L, 't11')$$, :sdraft), 'skill_too_many_tags'));
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
select ('55000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, :carol, 'p' || i, 'd', 'p', 'text', 'published', 'public' from generate_series(1, 21) i;
insert into public.skill_relations (skill_id, target_type, target_id)
select :sdraft, 'prompt', ('55000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 20) i;
select pg_temp.check(6, 'the 21st relation is rejected', pg_temp.raises(format($$insert into public.skill_relations (skill_id, target_type, target_id) values (%L, 'prompt', '55000000-0000-4000-8000-000000000021')$$, :sdraft), 'skill_too_many_relations'));

-- sabitleme
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(6, 'pinning a version that does not exist fails (FK)', pg_temp.raises(format($$insert into public.skill_pins (user_id, skill_id, version) values (%L, %L, '8.8.8')$$, :bob, :s1), 'violates foreign key'));
insert into public.skill_pins (user_id, skill_id, version) values (:bob, :s1, '1.0.0');
select pg_temp.check(6, 'a user pins an existing version of a readable skill', (select count(*) from public.skill_pins) = 1);
select pg_temp.check(6, 'pinning on behalf of someone else fails', pg_temp.raises(format($$insert into public.skill_pins (user_id, skill_id, version) values (%L, %L, '1.9.0')$$, :carol, :s1), 'row-level security'));
select pg_temp.check(6, 'a private skill cannot be pinned by a stranger', pg_temp.raises(format($$insert into public.skill_pins (user_id, skill_id, version) values (%L, %L, '1.0.0')$$, :bob, :s2), 'row-level security'));
reset role;
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(6, 'pins are private to their owner', (select count(*) from public.skill_pins) = 0);
reset role;

-- kullanım kaydı
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(6, 'a use is recorded once', public.record_skill_use(:s1) = true);
select pg_temp.check(6, 'the same use the same day is not counted twice', public.record_skill_use(:s1) = false);
select pg_temp.check(6, 'the counter moved exactly once', (select use_count from public.skills where id = :s1) = 1);
select pg_temp.check(6, 'a private skill is not counted', public.record_skill_use(:s2) = false);
select pg_temp.check(6, 'skill_uses is closed to clients', pg_temp.raises('select * from public.skill_uses', 'permission denied'));
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(6, 'the author''s own use is not counted', public.record_skill_use(:s1) = false);
reset role;
select pg_temp.as_anon(); set role anon;
select pg_temp.check(6, 'anon cannot record a use', pg_temp.raises(format($$select public.record_skill_use(%L)$$, :s1), 'permission denied'));
reset role;

-- ====================================================================================================================
-- 7. Yetim taraması skill-files'ı tanır; hesap/Skill silinince satırlar CASCADE gider
-- ====================================================================================================================
insert into storage.objects (bucket_id, name, created_at) values
  ('skill-files', '52000000-0000-4000-8000-000000000001/draft/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.md', now() - interval '3 hours'),
  ('skill-files', '52000000-0000-4000-8000-000000000001/draft/ffffffff-ffff-4fff-8fff-ffffffffffff.md', now() - interval '3 hours');
select pg_temp.check(7, 'a registered working file is not an orphan', not exists (select 1 from public.orphan_storage_objects('1 hour') o where o.name like '%aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.md'));
select pg_temp.check(7, 'an unregistered old file in skill-files is an orphan', exists (select 1 from public.orphan_storage_objects('1 hour') o where o.bucket_id = 'skill-files' and o.name like '%ffffffff-ffff-4fff-8fff-ffffffffffff.md'));
select pg_temp.check(7, 'a committed package is not an orphan', not exists (select 1 from public.orphan_storage_objects('0 seconds') o where o.name like '%/packages/1.0.0-aaaaaaaaaaaaaaaa.zip'));
insert into storage.objects (bucket_id, name) values ('skill-files', '52000000-0000-4000-8000-000000000001/packages/3.0.0-cccccccccccccccc.zip');
select pg_temp.check(7, 'an uncommitted package object IS an orphan', exists (select 1 from public.orphan_storage_objects('0 seconds') o where o.name like '%/packages/3.0.0-cccccccccccccccc.zip'));
delete from public.skills where id = :s1;
select pg_temp.check(7, 'deleting a skill cascades files, versions, tags, relations, pins',
  (select count(*) from public.skill_files where skill_id = :s1) = 0 and (select count(*) from public.skill_versions where skill_id = :s1) = 0
  and (select count(*) from public.skill_tags where skill_id = :s1) = 0 and (select count(*) from public.skill_relations where skill_id = :s1) = 0
  and (select count(*) from public.skill_pins where skill_id = :s1) = 0);
select pg_temp.check(7, 'after the cascade the package object is an orphan', exists (select 1 from public.orphan_storage_objects('0 seconds') o where o.name like '%/packages/1.0.0-aaaaaaaaaaaaaaaa.zip'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
