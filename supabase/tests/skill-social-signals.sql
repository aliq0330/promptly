-- Skill: sosyal sinyaller ve sohbet/profil sayıları (docs/history/417-*): suggest_creators, chat_shared_items/stats, profile_content_stats.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

-- === Veri (oturumsuz süper kullanıcı) ===
-- carol: yalnız yeni, herkese açık Skill → önerilmeli. dave: yalnız taslak Skill. erin: yalnız özel Skill. gina: 10 gün önceki Skill (alice beğendi → "liked"; aday olmak için 90 gün içinde gönderi şart).
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility, created_at) values
  ('71730000-0000-4000-8000-000000000001', :carol, 'carol-skill', 'Carol Skill', 's', '# r', 'published', 'public', now() - interval '1 day'),
  ('71730000-0000-4000-8000-000000000002', :dave,  'dave-skill',  'Dave Skill',  's', '# r', 'draft',     'public', now() - interval '1 day'),
  ('71730000-0000-4000-8000-000000000003', :erin,  'erin-skill',  'Erin Skill',  's', '# r', 'published', 'private', now() - interval '1 day'),
  ('71730000-0000-4000-8000-000000000004', :gina,  'gina-skill',  'Gina Skill',  's', '# r', 'published', 'public', now() - interval '10 days');
set role authenticated; select public._as_user(:alice);
insert into public.prompt_likes (user_id, skill_id) values (:alice, '71730000-0000-4000-8000-000000000004');
reset role;

-- === suggest_creators ===
set role authenticated; select public._as_user(:alice);
create temp table _sug as select * from public.suggest_creators(30);
grant all on _sug to public;
reset role;
select public._check(1, 'an author with only a published public Skill is suggested', exists (select 1 from _sug where id = :carol));
select public._check(2, 'a draft-only Skill author is not suggested', not exists (select 1 from _sug where id = :dave));
select public._check(3, 'a private-Skill author is not suggested', not exists (select 1 from _sug where id = :erin));
-- gina'nın Skill'ini alice beğendi: neden "liked"
select public._check(4, 'a liked Skill''s author is suggested with reason "liked"', exists (select 1 from _sug where id = :gina and reason_kind = 'liked'));
select public._check(5, 'the viewer is never suggested to themselves', not exists (select 1 from _sug where id = :alice));

-- === chat_shared_* ===
set role authenticated; select public._as_user(:alice);
create temp table _conv as select public.start_direct_conversation(:bobby) as id;
grant all on _conv to public;
select public._as_user(:bobby);
update public.conversation_members set status = 'accepted' where user_id = :bobby;
reset role;
insert into public.messages (conversation_id, sender_id, body)
select c.id, :bobby, m.body from _conv c, (values
  (E'Carol Skill\nhttps://aliq0330.github.io/promptly/skills/local?id=71730000-0000-4000-8000-000000000001'),
  (E'bir bağlantı https://example.com/x'),
  (E'düz metin')) as m(body);
set role authenticated; select public._as_user(:alice);
select public._check(6, 'a shared Skill link counts as shared content', (select (public.chat_shared_stats(c.id) ->> 'content')::int from _conv c) = 1);
select public._check(7, 'a plain URL still counts as a link, not content', (select (public.chat_shared_stats(c.id) ->> 'links')::int from _conv c) = 1);
select public._check(8, 'the content list returns the Skill message and nothing else', (select count(*) from _conv c, public.chat_shared_items(c.id, 'content', 50) i where i.body like '%/skills/local?id=%') = 1
  and (select count(*) from _conv c, public.chat_shared_items(c.id, 'content', 50)) = 1);
select public._check(9, 'the links list excludes the Skill block', (select count(*) from _conv c, public.chat_shared_items(c.id, 'links', 50) i where i.body like '%/skills/local?id=%') = 0);
reset role;

-- === profile_content_stats ===
select public._check(10, 'profile_content_stats counts published public Skills', (public.profile_content_stats(:carol) ->> 'skills')::int = 1);
select public._check(11, 'draft and private Skills are not counted', (public.profile_content_stats(:dave) ->> 'skills')::int = 0 and (public.profile_content_stats(:erin) ->> 'skills')::int = 0);
select public._check(12, 'the existing keys are unchanged', (select bool_and(public.profile_content_stats(:carol) ? k) from unnest(array['prompts','reuse','requests','workflows','presets']) k));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
