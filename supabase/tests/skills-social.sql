-- Skill sosyal katmanı (docs/history/390-*): beğeni/tepki + yorum + sabitleme + bildirim + istatistik + şikâyet.
-- Skill ortak etkileşim tablolarının DOKUZUNCU hedefidir (`prompt_likes.skill_id`, `prompt_comments.skill_id`).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/skills-social.sql   ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}'),
  ('55555555-5555-4555-8555-555555555555', 'erin@test.dev',  '{"username":"erin","display_name":"Erin"}');
update public.profiles set username = 'alice' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set username = 'bobby' where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set username = 'carol' where id = '33333333-3333-4333-8333-333333333333';
update public.profiles set username = 'erin', role = 'moderator' where id = '55555555-5555-4555-8555-555555555555';

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
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set pub   '''56000000-0000-4000-8000-000000000001'''
\set draft '''56000000-0000-4000-8000-000000000002'''
\set priv  '''56000000-0000-4000-8000-000000000003'''

-- Fixture (oturumsuz: hız sınırı/askı tetikleyicileri atlanır): Alice'in herkese açık, taslak ve özel Skill'i
select pg_temp.as_anon();
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:pub, :alice, 'pub-skill', 'Public Skill', 'S', '# Rol', 'published', 'public'),
  (:draft, :alice, 'draft-skill', 'Draft Skill', 'S', '# Rol', 'draft', 'public'),
  (:priv, :alice, 'priv-skill', 'Private Skill', 'S', '# Rol', 'published', 'private');

-- ====================================================================================================================
-- 1. Beğeni / tepki
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
insert into public.prompt_likes (user_id, skill_id, reaction) values (:bob, :pub, 'fire');
reset role;
select pg_temp.check(1, 'a like on a skill is stored and counted', (select like_count from public.skills where id = :pub) = 1);
select pg_temp.check(1, 'target_id (generated) is the skill id', (select target_id from public.prompt_likes where skill_id = :pub) = :pub);
select pg_temp.check(1, 'reaction_stats counts the reaction against the skill', (select n from public.reaction_stats where target_id = :pub and reaction = 'fire') = 1);
select pg_temp.check(1, 'the owner is notified ("Skill''ini beğendi") with the skill link',
  exists (select 1 from public.notifications where recipient_id = :alice and actor_id = :bob and type = 'like' and message like 'Skill''ini beğendi:%' and target_href = '/skills/local?id=56000000-0000-4000-8000-000000000001'));

set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(1, 'the same user cannot like the same skill twice', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id) values (%L, %L)$$, :bob, :pub), 'duplicate key'));
update public.prompt_likes set reaction = 'wow' where skill_id = :pub and user_id = :bob;
reset role;
select pg_temp.check(1, 'changing the reaction moves the counts without changing like_count',
  (select like_count from public.skills where id = :pub) = 1 and (select n from public.reaction_stats where target_id = :pub and reaction = 'wow') = 1
  and coalesce((select n from public.reaction_stats where target_id = :pub and reaction = 'fire'), 0) = 0);

set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(1, 'a skill owner cannot like their own skill', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id) values (%L, %L)$$, :alice, :pub), 'self_like_not_allowed'));
reset role;

set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(1, 'a stranger cannot like a DRAFT skill (not found, existence not leaked)', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id) values (%L, %L)$$, :carol, :draft), 'skill_not_found'));
select pg_temp.check(1, 'a stranger cannot like a PRIVATE skill', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id) values (%L, %L)$$, :carol, :priv), 'skill_not_found'));
select pg_temp.check(1, 'a like cannot be written on behalf of someone else', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id) values (%L, %L)$$, :bob, :pub), 'row-level security'));
select pg_temp.check(1, 'a row with two targets is rejected (exactly one target)', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id, preset_id) values (%L, %L, gen_random_uuid())$$, :carol, :pub), 'exactly_one_target'));
reset role;

-- engelleme iki yönlü
insert into public.blocks (blocker_id, blocked_id) values (:alice, :carol);
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(1, 'a blocked user cannot like (skill not found)', pg_temp.raises(format($$insert into public.prompt_likes (user_id, skill_id) values (%L, %L)$$, :carol, :pub), 'skill_not_found'));
reset role;
delete from public.blocks where blocker_id = :alice and blocked_id = :carol;

-- okuma: ziyaretçi herkese açık Skill'in beğenilerini görür; özel Skill'in satırı yalnız sahibinde
select pg_temp.as_anon(); set role anon;
select pg_temp.check(1, 'anon reads the likes of a public skill', (select count(*) from public.prompt_likes where skill_id = :pub) = 1);
reset role;

-- beğeniyi kaldırma: sayaç düşer, bildirim silinir
set role authenticated; select pg_temp.as_user(:bob);
delete from public.prompt_likes where skill_id = :pub and user_id = :bob;
reset role;
select pg_temp.check(1, 'removing the like decrements the counter and clears the notification',
  (select like_count from public.skills where id = :pub) = 0 and not exists (select 1 from public.notifications where dedupe_key like 'skill_like:%'));
select pg_temp.check(1, 'the skill counter cannot be written by a client', (
  select pg_temp.raises(format($$update public.skills set like_count = 99 where id = %L$$, :pub), 'zzz-no-error') = false) and (select like_count from public.skills where id = :pub) = 0);

-- ====================================================================================================================
-- 2. Yorum, yanıt, @bahsetme, yorum beğenisi
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
insert into public.prompt_comments (id, skill_id, author_id, body) values ('57000000-0000-4000-8000-000000000001', :pub, :bob, 'Harika bir Skill @carol bak');
reset role;
select pg_temp.check(2, 'a comment on a skill is stored and counted', (select comment_count from public.skills where id = :pub) = 1);
select pg_temp.check(2, 'the owner is notified ("Skill''ine yorum yaptı") with a comment highlight link',
  exists (select 1 from public.notifications where recipient_id = :alice and type = 'comment' and message like 'Skill''ine yorum yaptı:%' and target_href = '/skills/local?id=56000000-0000-4000-8000-000000000001&hl=comment:57000000-0000-4000-8000-000000000001'));
select pg_temp.check(2, 'an @mention notifies the mentioned user with the skill link',
  exists (select 1 from public.notifications where recipient_id = :carol and message like 'Seni bir yorumda andı:%' and target_href like '/skills/local?id=%'));
select pg_temp.check(2, 'the owner is NOT notified twice by the generic comment trigger',
  (select count(*) from public.notifications where recipient_id = :alice and type = 'comment') = 1);

set role authenticated; select pg_temp.as_user(:alice);
insert into public.prompt_comments (id, skill_id, author_id, body, parent_id) values ('57000000-0000-4000-8000-000000000002', :pub, :alice, 'Teşekkürler', '57000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.check(2, 'a reply notifies the parent author (comment_reply)',
  exists (select 1 from public.notifications where recipient_id = :bob and type = 'comment_reply' and message like 'Yorumuna yanıt verdi:%' and target_href like '/skills/local?id=%'));
select pg_temp.check(2, 'the reply counts too', (select comment_count from public.skills where id = :pub) = 2);

set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(2, 'a reply must target a comment of the SAME skill',
  pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body, parent_id) values (%L, %L, 'x', '57000000-0000-4000-8000-000000000001')$$, :priv, :carol), 'invalid_parent'));
select pg_temp.check(2, 'a stranger cannot comment on a DRAFT skill', pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body) values (%L, %L, 'x')$$, :draft, :carol), 'skill_not_found'));
select pg_temp.check(2, 'a comment cannot be written as someone else', pg_temp.raises(format($$insert into public.prompt_comments (skill_id, author_id, body) values (%L, %L, 'x')$$, :pub, :bob), 'row-level security'));
insert into public.comment_likes (comment_id, user_id) values ('57000000-0000-4000-8000-000000000001', :carol);
reset role;
select pg_temp.check(2, 'liking a comment notifies its author with the skill link',
  exists (select 1 from public.notifications where recipient_id = :bob and type = 'like' and message like 'Yorumunu beğendi:%' and target_href like '/skills/local?id=%&hl=comment:%'));

-- okuma: özel/taslak Skill'in yorumunu başkası göremez, ziyaretçi herkese açığı okur
set role authenticated; select pg_temp.as_user(:alice);
insert into public.prompt_comments (id, skill_id, author_id, body) values ('57000000-0000-4000-8000-000000000003', :draft, :alice, 'Taslak notu');
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(2, 'a stranger does not read comments of a draft skill', (select count(*) from public.prompt_comments where skill_id = :draft) = 0);
select pg_temp.check(2, 'a stranger reads comments of a public skill', (select count(*) from public.prompt_comments where skill_id = :pub) = 2);
reset role;
select pg_temp.as_anon(); set role anon;
select pg_temp.check(2, 'anon reads comments of a public skill, not of a draft', (select count(*) from public.prompt_comments where skill_id = :pub) = 2 and (select count(*) from public.prompt_comments where skill_id = :draft) = 0);
reset role;

-- ====================================================================================================================
-- 3. Yorum sabitleme: yalnız Skill'in sahibi, tek sabit yorum
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(3, 'a non-owner cannot pin a comment', pg_temp.raises($$select public.set_comment_pinned('57000000-0000-4000-8000-000000000001', true)$$, 'pin_not_allowed'));
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select public.set_comment_pinned('57000000-0000-4000-8000-000000000001', true);
select pg_temp.check(3, 'the skill owner pins a top-level comment', (select pinned_at is not null from public.prompt_comments where id = '57000000-0000-4000-8000-000000000001'));
select pg_temp.check(3, 'a reply cannot be pinned', pg_temp.raises($$select public.set_comment_pinned('57000000-0000-4000-8000-000000000002', true)$$, 'pin_top_level_only'));
insert into public.prompt_comments (id, skill_id, author_id, body) values ('57000000-0000-4000-8000-000000000004', :pub, :alice, 'Yeni sabit');
select public.set_comment_pinned('57000000-0000-4000-8000-000000000004', true);
reset role;
select pg_temp.check(3, 'pinning another comment unpins the previous one (one pinned comment per skill)',
  (select pinned_at is null from public.prompt_comments where id = '57000000-0000-4000-8000-000000000001') and (select pinned_at is not null from public.prompt_comments where id = '57000000-0000-4000-8000-000000000004'));

-- ====================================================================================================================
-- 4. İstatistik: kim beğendi / yorum yaptı
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:carol);
insert into public.prompt_likes (user_id, skill_id) values (:carol, :pub);
reset role;
set role authenticated; select pg_temp.as_user(:alice);
select pg_temp.check(4, 'the owner lists who liked their skill', (select count(*) from public.content_engagers('skill', :pub, 'likes')) = 1);
select pg_temp.check(4, 'the owner lists who commented', (select count(*) from public.content_engagers('skill', :pub, 'comments')) = 2);
select pg_temp.check(4, 'saves are empty for skills (not implemented yet)', (select count(*) from public.content_engagers('skill', :pub, 'saves')) = 0);
reset role;
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(4, 'a stranger can list the engagers of a PUBLIC skill', (select count(*) from public.content_engagers('skill', :pub, 'likes')) = 1);
select pg_temp.check(4, 'a stranger gets nothing for a draft skill', (select count(*) from public.content_engagers('skill', :draft, 'comments')) = 0);
reset role;

-- ====================================================================================================================
-- 5. Şikâyet + moderasyon
-- ====================================================================================================================
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(5, 'a skill can be reported (spam)', (select public.submit_report('skill', :pub, 'spam', null)) is not null);
select pg_temp.check(5, 'the same open report twice is a duplicate', pg_temp.raises(format($$select public.submit_report('skill', %L, 'spam', null)$$, :pub), 'report_duplicate'));
select pg_temp.check(5, 'an impersonation reason is not valid for skills', pg_temp.raises(format($$select public.submit_report('skill', %L, 'impersonation', null)$$, :pub), 'invalid_report_reason'));
select pg_temp.check(5, 'an unknown skill id is not found', pg_temp.raises($$select public.submit_report('skill', gen_random_uuid(), 'spam', null)$$, 'report_target_not_found'));
select pg_temp.check(5, '"other" needs details', pg_temp.raises(format($$select public.submit_report('skill', %L, 'other', null)$$, :priv), 'details_required'));
reset role;
set role authenticated; select pg_temp.as_user(:erin);
select pg_temp.check(5, 'the moderation queue shows the skill title and link',
  exists (select 1 from public.moderation_report_queue('open', 'all') q where q.target_type = 'skill' and q.target_title = 'Public Skill' and q.target_href = '/skills/local?id=56000000-0000-4000-8000-000000000001' and q.target_author_username = 'alice'));
select pg_temp.check(5, 'a report does not remove anything by itself', (select count(*) from public.skills where id = :pub) = 1);
select public.moderate_report((select id from public.reports where target_type = 'skill' limit 1), 'removed', 'test');
reset role;
select pg_temp.check(5, 'removing a reported skill deletes it and cascades its likes and comments',
  (select count(*) from public.skills where id = :pub) = 0 and (select count(*) from public.prompt_likes where skill_id = :pub) = 0 and (select count(*) from public.prompt_comments where skill_id = :pub) = 0);
select pg_temp.check(5, 'the report is marked reviewed', (select status from public.reports where target_type = 'skill' limit 1) = 'reviewed');

-- ====================================================================================================================
-- 6. Silme: yanıtlı yorumları olan Skill'in silinmesi hata vermez (yumuşak silme koruması CASCADE'de devre dışı)
-- ====================================================================================================================
select pg_temp.as_anon();
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  ('56000000-0000-4000-8000-000000000009', :alice, 'thread-skill', 'Thread', 'S', '# Rol', 'published', 'public');
set role authenticated; select pg_temp.as_user(:bob);
insert into public.prompt_comments (id, skill_id, author_id, body) values ('57000000-0000-4000-8000-0000000000a1', '56000000-0000-4000-8000-000000000009', :bob, 'kök');
select pg_temp.as_user(:alice);
insert into public.prompt_comments (id, skill_id, author_id, body, parent_id) values ('57000000-0000-4000-8000-0000000000a2', '56000000-0000-4000-8000-000000000009', :alice, 'yanıt', '57000000-0000-4000-8000-0000000000a1');
reset role;
select pg_temp.check(6, 'the thread exists before the delete', (select count(*) from public.prompt_comments where skill_id = '56000000-0000-4000-8000-000000000009') = 2);
delete from public.skills where id = '56000000-0000-4000-8000-000000000009';
select pg_temp.check(6, 'deleting a skill with threaded comments removes every comment',
  (select count(*) from public.prompt_comments where skill_id = '56000000-0000-4000-8000-000000000009') = 0);

-- ====================================================================================================================
-- 7. Yeniden kurulan nesneler diğer hedefleri bozmadı (preset beğenisi/yorumu hâlâ çalışıyor)
-- ====================================================================================================================
insert into public.presets (id, creator_id, title, description, content_type, status, visibility)
  values ('58000000-0000-4000-8000-000000000001', :alice, 'Preset', 'd', 'text', 'published', 'public');
set role authenticated; select pg_temp.as_user(:bob);
insert into public.prompt_likes (user_id, preset_id) values (:bob, '58000000-0000-4000-8000-000000000001');
insert into public.prompt_comments (skill_id, preset_id, author_id, body) values (null, '58000000-0000-4000-8000-000000000001', :bob, 'preset yorumu');
reset role;
select pg_temp.check(7, 'preset likes and comments still count (the rebuilt target_id and counter triggers did not regress)',
  (select like_count from public.presets where id = '58000000-0000-4000-8000-000000000001') = 1 and (select comment_count from public.presets where id = '58000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.reaction_stats where target_id = '58000000-0000-4000-8000-000000000001') = 1);
select pg_temp.check(7, 'the preset like notification still reads "Hazır ayarını beğendi"', exists (select 1 from public.notifications where recipient_id = :alice and message like 'Hazır ayarını beğendi:%'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
