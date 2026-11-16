-- Skill: yorum eki, topluluk duyurusu, "ilgimi çekiyor/çekmiyor" (docs/history/408-*): ortak yüzeylerde Skill, diğer türlerle AYNI kurallarla.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  ('57100000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'pub', 'Pub', 's', '# r', 'published', 'public'),
  ('57100000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'draft', 'Draft', 's', '# r', 'draft', 'public'),
  ('57100000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'priv', 'Priv', 's', '# r', 'published', 'private');
insert into public.skill_tags (skill_id, tag_slug)
  select '57100000-0000-4000-8000-000000000001', slug from public.tags limit 1;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claim.role', 'authenticated', false); end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
create or replace function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $$
begin execute stmt; return false; exception when others then return sqlerrm like '%' || code || '%'; end $$;

\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set pub   '''57100000-0000-4000-8000-000000000001'''
\set draft '''57100000-0000-4000-8000-000000000002'''
\set priv  '''57100000-0000-4000-8000-000000000003'''

-- 1. Yorum eki -----------------------------------------------------------------------------------------------------------------------
-- Yorum, yayında bir Skill'in altına yazılır (ek olarak da bir Skill eklenir).
set role authenticated; select pg_temp.as_user(:alice);
insert into public.prompt_comments (skill_id, author_id, body, attach_type, attach_id) values (:pub, :alice, 'ek var', 'skill', :pub);
select pg_temp.check(1, 'a published skill can be attached to a comment', (select count(*) from public.prompt_comments where skill_id = :pub and attach_type = 'skill') = 1);
select pg_temp.check(2, 'a draft skill cannot be attached (same answer as unknown)', pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body, attach_type, attach_id) values (%L, %L, 'x', 'skill', %L)$$, :pub, :alice, :draft), 'attachment_not_public'));
select pg_temp.check(3, 'a private skill cannot be attached', pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body, attach_type, attach_id) values (%L, %L, 'x', 'skill', %L)$$, :pub, :alice, :priv), 'attachment_not_public'));
select pg_temp.check(4, 'unknown attachment types are still refused', pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body, attach_type, attach_id) values (%L, %L, 'x', 'comment', %L)$$, :pub, :alice, :pub), 'attachment_not_public') or pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body, attach_type, attach_id) values (%L, %L, 'x', 'comment', %L)$$, :pub, :alice, :pub), 'prompt_comments_attach_check'));
reset role;

-- 2. Topluluk duyurusu -----------------------------------------------------------------------------------------------------------------
set role authenticated; select pg_temp.as_user(:bob);
create temp table _c as select (public.create_community('Skill Topluluğu', 'd', 'public', null, 50, '{}'::uuid[], 'general', 'members', 'members', null, false))->>'group_id' as gid;
grant all on _c to public;
select public.share_to_community((select gid from _c)::uuid, 'skill', :pub, 'iyi bir Skill') is not null as ok \gset
select pg_temp.check(5, 'a member shares a published skill to the community', :'ok' = 't');
select pg_temp.check(6, 'the post is an application with skill_id and no other target',
  (select content_type = 'skill' and skill_id = :pub and prompt_id is null and kind = 'application' from public.community_posts where community_id = (select gid from _c)::uuid));
select pg_temp.check(7, 'the same skill is announced once per community', pg_temp.raises(format($$select public.share_to_community(%L, 'skill', %L)$$, (select gid from _c), :pub), 'already_shared'));
select pg_temp.check(8, 'a draft skill cannot be announced', pg_temp.raises(format($$select public.share_to_community(%L, 'skill', %L)$$, (select gid from _c), :draft), 'content_not_public'));
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(9, 'someone else''s private skill looks like it does not exist', pg_temp.raises(format($$select public.share_to_community(%L, 'skill', %L)$$, (select gid from _c), :priv), 'forbidden') or pg_temp.raises(format($$select public.share_to_community(%L, 'skill', %L)$$, (select gid from _c), :priv), 'content_not_found'));
reset role;
select pg_temp.check(10, 'a post with no target is refused by the CHECKs',
  pg_temp.raises(format($$insert into public.community_posts (community_id, author_id, kind, content_type) values (%L, %L, 'application', 'skill')$$, (select gid from _c), :bob), 'community_posts'));

-- 3. İlgi geri bildirimi -----------------------------------------------------------------------------------------------------------
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(11, 'interested answer is stored for a skill', public.set_content_interest('skill', :pub, 'interested') = 'interested');
select pg_temp.check(12, 'the answer can be changed and taken back', public.set_content_interest('skill', :pub, 'not_interested') = 'not_interested' and public.set_content_interest('skill', :pub, null) is null);
select pg_temp.check(13, 'a draft skill cannot be answered', pg_temp.raises(format($$select public.set_content_interest('skill', %L, 'interested')$$, :draft), 'content_not_found'));
select pg_temp.check(14, 'your own skill cannot be answered', (select pg_temp.as_user(:bob)) is not null and pg_temp.raises(format($$select public.set_content_interest('skill', %L, 'interested')$$, :pub), 'content_not_found'));
select pg_temp.as_user(:alice);
select pg_temp.check(15, 'for_you_page offers the skill before an answer', exists (select 1 from public.for_you_page(now(), array['skill'], null, null, null, 20, null, null, null) f where f.id = :pub));
select public.set_content_interest('skill', :pub, 'not_interested');
select pg_temp.check(16, 'for_you_page never shows an answered skill again', not exists (select 1 from public.for_you_page(now(), array['skill'], null, null, null, 20, null, null, null) f where f.id = :pub));
reset role;
select pg_temp.check(17, 'interest rows hold exactly one target', (select count(*) from public.content_interest where skill_id = :pub and num_nonnulls(prompt_id, request_id, workflow_id, preset_id, skill_id) = 1) = 1);
delete from public.skills where id = :pub;
select pg_temp.check(18, 'deleting the skill cascades the answer and the community post',
  not exists (select 1 from public.content_interest where skill_id = :pub) and not exists (select 1 from public.community_posts where skill_id = :pub));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
