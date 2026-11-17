-- Moderatör kullanıcı ekranında Skill (docs/history/417-*): admin_users toplamlara katar, admin_user_activity Skill'i doğru etiketler.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');
-- Yerel stub'larda auth.users'ta bu sütun yoktur (Supabase'de vardır); admin_users onu okur.
alter table auth.users add column if not exists last_sign_in_at timestamptz;
update public.profiles set role = 'moderator' where id = '22222222-2222-4222-8222-222222222222';
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
\set carol '''33333333-3333-4333-8333-333333333333'''
\set pub   '''71710000-0000-4000-8000-000000000001'''
\set draft '''71710000-0000-4000-8000-000000000002'''

-- alice: yalnız Skill'i var (biri yayında, biri taslak). carol: Skill yok, alice'in Skill'ine yorum yapar, beğenir ve kaydeder.
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:pub,   :alice, 'pub',   'Yayında Skill', 'özet', '# r', 'published', 'public'),
  (:draft, :alice, 'draft', 'Taslak Skill',  'özet', '# r', 'draft', 'public');
set role authenticated; select pg_temp.as_user(:carol);
insert into public.prompt_likes (user_id, skill_id) values (:carol, :pub);
insert into public.prompt_comments (author_id, skill_id, body) values (:carol, :pub, 'harika bir Skill');
insert into public.collections (id, owner_id, name, visibility) values ('c1710000-0000-4000-8000-000000000001', :carol, 'Koleksiyon', 'private');
insert into public.collection_items (collection_id, skill_id) values ('c1710000-0000-4000-8000-000000000001', :pub);
reset role;

-- === Yetki: yalnız moderatör ===
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(1, 'a normal user cannot call admin_users', pg_temp.raises($$select * from public.admin_users(null, null, 'newest', 'all', 10, 0, null)$$, 'Yetkisiz'));
select pg_temp.check(2, 'a normal user cannot call admin_user_activity', pg_temp.raises($$select * from public.admin_user_activity('11111111-1111-4111-8111-111111111111', 'posts', 10, null)$$, 'Yetkisiz'));
reset role;

-- === admin_users: Skill toplamlara katılır ===
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(3, 'posts_total counts every Skill of the user (published + draft)', (select posts_total from public.admin_users(null, null, 'newest', 'all', 10, 0, :alice)) = 2);
select pg_temp.check(4, 'the existing per-type counts stay at zero for a Skill-only user', (select prompts_n + requests_n + workflows_n + presets_n from public.admin_users(null, null, 'newest', 'all', 10, 0, :alice)) = 0);
select pg_temp.check(5, 'likes_received_n includes Skill reactions', (select likes_received_n from public.admin_users(null, null, 'newest', 'all', 10, 0, :alice)) = 1);
select pg_temp.check(6, 'a media-type filter does not count Skills (they have no media type)', (select count(*) from public.admin_users(null, 'text', 'newest', 'all', 10, 0, null) where id = :alice) = 0);
select pg_temp.check(7, 'without a type filter the Skill-only user is listed', (select count(*) from public.admin_users('alice', null, 'newest', 'all', 10, 0, null)) = 1);
select pg_temp.check(8, 'sorting by posts ranks the Skill author first', (select id from public.admin_users(null, null, 'posts', 'all', 10, 0, null) limit 1) = :alice);

-- === admin_user_activity ===
select pg_temp.check(9, 'posts: both Skills are listed with a Skill label, title and link', (select count(*) from public.admin_user_activity(:alice, 'posts', 20, null) where label = 'skill' and href like '/skills/local?id=%' and body in ('Yayında Skill', 'Taslak Skill')) = 2);
select pg_temp.check(10, 'posts: the draft status is visible to the moderator', exists (select 1 from public.admin_user_activity(:alice, 'posts', 20, null) where label = 'skill' and meta ->> 'status' = 'draft'));
select pg_temp.check(11, 'comments: a Skill comment is labelled skill (not result) with target title and link',
  exists (select 1 from public.admin_user_activity(:carol, 'comments', 20, null) where label = 'skill' and href = '/skills/local?id=71710000-0000-4000-8000-000000000001' and meta ->> 'target_title' = 'Yayında Skill'));
select pg_temp.check(12, 'likes: a Skill like is labelled skill with title and link',
  exists (select 1 from public.admin_user_activity(:carol, 'likes', 20, null) where label = 'skill' and body = 'Yayında Skill' and href like '/skills/local?id=%'));
select pg_temp.check(13, 'saves: a saved Skill is labelled skill (not preset) with title and link',
  exists (select 1 from public.admin_user_activity(:carol, 'saves', 20, null) where label = 'skill' and body = 'Yayında Skill' and href like '/skills/local?id=%')
  and not exists (select 1 from public.admin_user_activity(:carol, 'saves', 20, null) where label = 'preset' and body = ''));
reset role;

-- Bir ifade hata verip hiç satır yazmadıysa "FAILED=0" yanıltmasın: 13 kontrolün hepsi sonuç yazmış olmalı.
select pg_temp.check(99, 'all 13 checks produced a result', (select count(*) from pg_temp.results where n < 99) >= 13);
select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
