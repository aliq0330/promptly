-- Skill: uzmanlık alanı tablosu, oyda sürüm etiketi, hikâye bağlantısı, kapak yolu, ilişki ucu (docs/history/399-*).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false); end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like '%' || code || '%'; end $$;
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set sk  '''59900000-0000-4000-8000-000000000001'''
\set sk2 '''59900000-0000-4000-8000-000000000002'''
\set skd '''59900000-0000-4000-8000-000000000003'''
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility, category) values
  (:sk, :alice, 'a', 'A', 's', '# r', 'published', 'public', 'design'),
  (:sk2, :bob, 'b', 'B', 's', '# r', 'published', 'public', null),
  (:skd, :alice, 'd', 'D', 's', '# r', 'draft', 'public', null);

-- 1) Uzmanlık alanı tablosu: herkes okur, kimse yazamaz, yabancı anahtar geçersiz değeri reddeder, yeni satır anında kullanılabilir
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(1, 'a visitor reads the 8 seeded categories', (select count(*) = 8 from public.skill_categories));
select pg_temp.check(1, 'clients cannot write categories', pg_temp.raises($$insert into public.skill_categories (id, label_tr, label_en) values ('x1', 'a', 'b')$$, 'permission denied'));
reset role;
select pg_temp.check(1, 'a category that is not a skill area is refused by the foreign key', pg_temp.raises(format($$update public.skills set category = 'cooking' where id = %L$$, :sk), 'violates foreign key'));
insert into public.domains (id, label_tr, label_en, position) values ('cooking', 'Mutfak', 'Cooking', 150); -- Skill alanı ortak ALAN sözlüğünün alt kümesidir (docs/history/426-*): önce alan
insert into public.skill_categories (id, label_tr, label_en, position) values ('cooking', 'Mutfak', 'Cooking', 90);
select pg_temp.check(1, 'a new row is usable at once (no deploy)', not pg_temp.raises(format($$update public.skills set category = 'cooking' where id = %L$$, :sk), 'zzz_never'));
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(1, 'import_skills accepts the new category from the table', (select (r -> 'items' -> 0 ->> 'status') = 'ok' from (select public.import_skills('[{"title":"Yemek","category":"cooking"}]'::jsonb, true) r) x));
select pg_temp.check(1, 'import_skills still refuses unknown ones', (select (r -> 'items' -> 0 ->> 'code') = 'invalid_category' from (select public.import_skills('[{"title":"Y","category":"nope"}]'::jsonb, true) r) x));
reset role;

-- 2) Oyda sürüm etiketi
insert into public.skill_versions (skill_id, version, changelog, package_path, package_sha256, package_size, file_count, manifest, client_token)
  values (:sk, '1.0.0', '', '59900000-0000-4000-8000-000000000001/packages/1.0.0-aaaaaaaaaaaaaaaa.zip', repeat('a', 64), 10, 1, '{"schema":1,"files":[]}'::jsonb, gen_random_uuid());
insert into public.skill_uses (skill_id, user_id, day) values (:sk, :bob, current_date);
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(2, 'tagging a version without a vote is refused (no_vote)', pg_temp.raises(format($$select public.set_skill_works_version(%L, '1.0.0')$$, :sk), 'no_vote'));
select public.set_skill_works(:sk, true);
select pg_temp.check(2, 'an unpublished version is refused (invalid_version)', pg_temp.raises(format($$select public.set_skill_works_version(%L, '9.9.9')$$, :sk), 'invalid_version'));
select pg_temp.check(2, 'the voter tags her vote with a published version', not pg_temp.raises(format($$select public.set_skill_works_version(%L, '1.0.0')$$, :sk), 'zzz_never'));
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(2, 'a visitor reads per-version totals', (select yes_count = 1 and no_count = 0 from public.skill_works_by_version(:sk) where version = '1.0.0'));
select pg_temp.check(2, 'a visitor cannot tag', pg_temp.raises(format($$select public.set_skill_works_version(%L, null)$$, :sk), 'permission denied'));
reset role;

-- 3) Hikâye bağlantısı
set role authenticated; select pg_temp.as_user(:bob);
select public.create_story(jsonb_build_object('client_token', gen_random_uuid()::text, 'kind', 'text', 'audience', 'public', 'layout', '{"v":1,"bg":"cobalt","link":{"x":0.5,"y":0.6},"layers":[{"id":"a","text":"Dene","x":0.5,"y":0.2,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb, 'linked_type', 'skill', 'linked_id', :sk));
select pg_temp.check(3, 'a story can link a published public skill', (select count(*) = 1 from public.stories where linked_type = 'skill' and linked_id = :sk));
select pg_temp.check(3, 'a draft skill of someone else cannot be linked (content_not_found)', pg_temp.raises(format($$select public.create_story(jsonb_build_object('client_token', gen_random_uuid()::text, 'kind', 'text', 'audience', 'public', 'layout', '{"v":1,"bg":"cobalt","link":{"x":0.5,"y":0.6},"layers":[{"id":"a","text":"Dene","x":0.5,"y":0.2,"align":"center","size":"m","color":"white","bg":false}]}'::jsonb, 'linked_type', 'skill', 'linked_id', %L))$$, :skd), 'content_not_found'));
reset role;

-- 4) Kapak yolu
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'a well-formed cover path is accepted', not pg_temp.raises(format($$update public.skills set cover_path = '59900000-0000-4000-8000-000000000001/cover/59900000-0000-4000-8000-0000000000aa.jpg' where id = %L$$, :sk), 'zzz_never'));
select pg_temp.check(4, 'a cover path under another skill folder is refused', pg_temp.raises(format($$update public.skills set cover_path = '59900000-0000-4000-8000-000000000002/cover/59900000-0000-4000-8000-0000000000aa.jpg' where id = %L$$, :sk), 'skills_cover_path_check'));
select pg_temp.check(4, 'a non-image extension is refused', pg_temp.raises(format($$update public.skills set cover_path = '59900000-0000-4000-8000-000000000001/cover/59900000-0000-4000-8000-0000000000aa.exe' where id = %L$$, :sk), 'skills_cover_path_check'));
reset role;
select pg_temp.check(4, 'the orphan sweeper knows the cover path (not listed as orphan)', not exists (select 1 from public.orphan_storage_objects('0 seconds') o where o.name like '%/cover/%'));

-- 5) İlişki Haritası ucu
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(5, 'an owner relates her skill to another public skill', not pg_temp.raises(format($$insert into public.content_relations (source_type, source_id, target_type, target_id, relation_type) values ('skill', %L, 'skill', %L, 'similar')$$, :sk, :sk2), 'zzz_never'));
select pg_temp.check(5, 'a draft skill cannot be a relation end', pg_temp.raises(format($$insert into public.content_relations (source_type, source_id, target_type, target_id, relation_type) values ('skill', %L, 'skill', %L, 'alternative')$$, :sk, :skd), 'row-level security'));
reset role;
delete from public.skills where id = :sk2;
select pg_temp.check(5, 'deleting a skill removes its relations', (select count(*) = 0 from public.content_relations where target_id = :sk2));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
