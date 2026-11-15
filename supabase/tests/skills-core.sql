-- Skill çekirdeği: DB tarafı davranış ve RLS testi (docs/history/388-*).
--
-- Kurallar: yayınlanmış + herkese açık Skill herkese görünür (anon dahil); taslak ve "sadece ben" yalnız sahibine; yazma yalnız sahibine;
-- başkası adına eklenemez; sayaç sütunları istemciden yazılamaz; kısıtlar (slug, kategori, uyumluluk, sürüm, lisans) kötü veriyi reddeder;
-- (yazar, slug) benzersiz; engelleme iki yönlü gizler; anon yazamaz; hız sınırı saatte 20 yeni Skill.
--
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/skills-core.sql   ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
-- ---------- fixtures ----------
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

-- ====================================================================================================================
-- 1. Görünürlük: taslak ve "sadece ben" yalnız sahibine; yayınlanmış + herkese açık herkese (anon dahil)
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
insert into public.skills (id, author_id, slug, title, summary, instructions, category, compat, status, visibility) values
  ('51000000-0000-4000-8000-000000000001', :alice, 'open-skill',   'Open',   'S', '# Rol', 'software', '{claude-code,codex}', 'published', 'public'),
  ('51000000-0000-4000-8000-000000000002', :alice, 'draft-skill',  'Draft',  'S', '# Rol', 'design',   '{}',                  'draft',     'public'),
  ('51000000-0000-4000-8000-000000000003', :alice, 'hidden-skill', 'Hidden', 'S', '# Rol', 'data',     '{other}',             'published', 'private');
select pg_temp.check(1, 'owner sees all three of their skills', (select count(*) from public.skills where author_id = :alice) = 3);
reset role;

set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(1, 'another user sees only the published public one',
  (select count(*) from public.skills where author_id = :alice) = 1
  and exists (select 1 from public.skills where id = '51000000-0000-4000-8000-000000000001'));
reset role;

select pg_temp.as_anon(); set role anon;
select pg_temp.check(1, 'anon sees only the published public one', (select count(*) from public.skills) = 1);
reset role;

-- ====================================================================================================================
-- 2. Yazma yalnız sahibine
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
update public.skills set title = 'hacked' where id = '51000000-0000-4000-8000-000000000001';
delete from public.skills where id = '51000000-0000-4000-8000-000000000001';
select pg_temp.check(2, 'a non-owner cannot update or delete (0 rows touched)',
  (select title from public.skills where id = '51000000-0000-4000-8000-000000000001') = 'Open');
select pg_temp.check(2, 'cannot insert on behalf of another author (RLS)',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, title) values (%L, 'spoof', 'x')$$, '11111111-1111-4111-8111-111111111111'), 'row-level security'));
reset role;

set role authenticated; select pg_temp.as_user(:alice);
update public.skills set title = 'Open v2', version = '1.1.0' where id = '51000000-0000-4000-8000-000000000001';
select pg_temp.check(2, 'the owner can update their own skill',
  (select title || ' ' || version from public.skills where id = '51000000-0000-4000-8000-000000000001') = 'Open v2 1.1.0');
reset role;
select pg_temp.check(2, 'updated_at moves on update',
  (select updated_at > created_at from public.skills where id = '51000000-0000-4000-8000-000000000001'));

-- ====================================================================================================================
-- 3. Sayaç sütunları istemciden yazılamaz
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
update public.skills set like_count = 99, save_count = 99, comment_count = 99, use_count = 99 where id = '51000000-0000-4000-8000-000000000001';
select pg_temp.check(3, 'owner cannot write the counter columns',
  (select like_count + save_count + comment_count + use_count from public.skills where id = '51000000-0000-4000-8000-000000000001') = 0);
reset role;

-- ====================================================================================================================
-- 4. Kısıtlar kötü veriyi reddeder
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'slug must be lowercase/digits/hyphens',
  pg_temp.raises(format($$insert into public.skills (author_id, slug) values (%L, 'Bad Slug')$$, '11111111-1111-4111-8111-111111111111'), 'skills_slug_check'));
select pg_temp.check(4, 'slug cannot start with a hyphen',
  pg_temp.raises(format($$insert into public.skills (author_id, slug) values (%L, '-x')$$, '11111111-1111-4111-8111-111111111111'), 'skills_slug_check'));
select pg_temp.check(4, 'unknown category is rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, category) values (%L, 'c1', 'weapons')$$, '11111111-1111-4111-8111-111111111111'), 'skills_category_check'));
select pg_temp.check(4, 'unknown compat target is rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, compat) values (%L, 'c2', '{vim}')$$, '11111111-1111-4111-8111-111111111111'), 'skills_compat_check'));
select pg_temp.check(4, 'version must be MAJOR.MINOR.PATCH',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, version) values (%L, 'c3', 'v1')$$, '11111111-1111-4111-8111-111111111111'), 'skills_version_check'));
select pg_temp.check(4, 'unknown license is rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, license) values (%L, 'c4', 'wtfpl')$$, '11111111-1111-4111-8111-111111111111'), 'skills_license_check'));
select pg_temp.check(4, 'title longer than 120 characters is rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, title) values (%L, 'c5', repeat('x', 121))$$, '11111111-1111-4111-8111-111111111111'), 'skills_title_check'));
select pg_temp.check(4, 'instructions longer than 60000 characters are rejected',
  pg_temp.raises(format($$insert into public.skills (author_id, slug, instructions) values (%L, 'c6', repeat('x', 60001))$$, '11111111-1111-4111-8111-111111111111'), 'skills_instructions_check'));
select pg_temp.check(4, 'same author cannot reuse a slug',
  pg_temp.raises(format($$insert into public.skills (author_id, slug) values (%L, 'open-skill')$$, '11111111-1111-4111-8111-111111111111'), 'skills_author_id_slug_key'));
reset role;
set role authenticated; select pg_temp.as_user(:bob);
insert into public.skills (author_id, slug, title) values (:bob, 'open-skill', 'Bob same slug');
select pg_temp.check(4, 'a different author may use the same slug', exists (select 1 from public.skills where author_id = :bob and slug = 'open-skill'));
reset role;

-- ====================================================================================================================
-- 5. Engelleme iki yönlü gizler
-- ====================================================================================================================
insert into public.blocks (blocker_id, blocked_id) values (:carol, :alice);
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(5, 'the blocker cannot see the blocked author''s skill', (select count(*) from public.skills where author_id = :alice) = 0);
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(5, 'the blocked author cannot see the blocker''s skills either',
  (select count(*) from public.skills where author_id = :carol) = 0);
reset role;
delete from public.blocks;

-- ====================================================================================================================
-- 6. Anon yazamaz
-- ====================================================================================================================
select pg_temp.as_anon(); set role anon;
select pg_temp.check(6, 'anon cannot insert', pg_temp.raises($$insert into public.skills (author_id, slug) values ('11111111-1111-4111-8111-111111111111', 'anon-x')$$, 'permission denied'));
select pg_temp.check(6, 'anon cannot update', pg_temp.raises($$update public.skills set title = 'x'$$, 'permission denied'));
select pg_temp.check(6, 'anon cannot delete', pg_temp.raises($$delete from public.skills$$, 'permission denied'));
reset role;

-- ====================================================================================================================
-- 7. Hız sınırı: saatte 20 yeni Skill (Alice zaten 3 ekledi)
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:alice);
do $$
declare i int;
begin
  for i in 1..17 loop
    insert into public.skills (author_id, slug, title) values ('11111111-1111-4111-8111-111111111111', 'bulk-' || i, 'bulk ' || i);
  end loop;
end $$;
select pg_temp.check(7, 'the 20th skill in the hour is still allowed', (select count(*) from public.skills where author_id = :alice) = 20);
select pg_temp.check(7, 'the 21st skill in the hour hits the rate limit',
  pg_temp.raises(format($$insert into public.skills (author_id, slug) values (%L, 'one-too-many')$$, '11111111-1111-4111-8111-111111111111'), 'rate_limit'));
reset role;

-- ====================================================================================================================
-- 8. Hesap silinince Skill'ler de gider (yabancı anahtar CASCADE; profil silme akışı varsayılan koleksiyon korumasına takılır)
-- ====================================================================================================================
select pg_temp.check(8, 'skills.author_id references profiles with ON DELETE CASCADE',
  exists (select 1 from pg_constraint where conrelid = 'public.skills'::regclass and contype = 'f' and confrelid = 'public.profiles'::regclass and confdeltype = 'c'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
