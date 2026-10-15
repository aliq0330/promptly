-- Sayaç sütunlarını istemciden koruma testi (docs/yapilacaklar.md madde 12).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla temiz bir yerel
-- PostgreSQL'e oynatıldıktan sonra, süper kullanıcıyla:  psql -d <db> -f counter-protection.sql
-- (stub kurulumu: saved-collections.sql başlığı). Sonda her kontrol PASS/FAIL yazar;
-- "FAILED=0" beklenir. Fixture'lar kalıcıdır — ikinci çalıştırma için veritabanını yeniden kurun.
--
-- Beklenen: `authenticated` rolüyle (PostgREST'in kullandığı) sayaç yazma denemeleri sessizce
-- yok sayılır; sayaçları trigger'lar (SECURITY DEFINER) ve süper kullanıcı hâlâ değiştirebilir.
\pset pager off
\set ON_ERROR_STOP off

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'P', 'd', 'text', 'text');
insert into public.prompt_requests (id, author_id, title, description) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'R', 'd');
insert into public.workflows (id, creator_id, title, status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'W', 'published');
insert into public.presets (id, creator_id) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111');
insert into public.prompt_results (id, prompt_id, creator_id, media_type, text_content) values
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'text', 'x');
insert into public.prompt_comments (id, prompt_id, author_id, body) values
  ('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'hi');
insert into public.collections (id, owner_id, name, visibility) values
  ('c0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Yazılım', 'private');

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

-- ---------- 1. İstemci (alice, içeriğin sahibi) sayaçları yazmayı dener ----------
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.prompts          set like_count = 9999, save_count = 9999, comment_count = 9999, title = 'P2' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.prompt_requests  set like_count = 9999, comment_count = 9999, response_count = 9999, title = 'R2' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
update public.workflows        set like_count = 9999, comment_count = 9999, save_count = 9999, title = 'W2' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.presets          set like_count = 9999, comment_count = 9999, save_count = 9999, use_count = 9999, title = 'S2' where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
update public.prompt_results   set like_count = 9999, comment_count = 9999 where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
update public.prompt_comments  set like_count = 9999, body = 'hi2' where id = '99999999-9999-4999-8999-999999999999';
update public.profiles         set follower_count = 9999, following_count = 9999, display_name = 'Alice 2' where id = '11111111-1111-4111-8111-111111111111';
update public.collections      set item_count = 9999, name = 'Yazılım 2' where id = 'c0000001-0000-4000-8000-000000000001';
-- yeni satır eklerken sayaç yazma
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, like_count, save_count, comment_count)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1', '11111111-1111-4111-8111-111111111111', 'P3', 'd', 't', 'text', 777, 777, 777);
insert into public.workflows (id, creator_id, title, status, like_count, save_count, comment_count)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 'W3', 'published', 777, 777, 777);
reset role;

select public._check(1, 'prompts: like/save/comment unchanged (comment_count 1 = the fixture comment), title edit still works',
  (select like_count = 0 and save_count = 0 and comment_count = 1 and title = 'P2' from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (select format('%s/%s/%s %s', like_count, save_count, comment_count, title) from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select public._check(1, 'prompt_requests: like/comment/response unchanged, title edit works',
  (select like_count = 0 and comment_count = 0 and response_count = 0 and title = 'R2' from public.prompt_requests where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  (select format('%s/%s/%s %s', like_count, comment_count, response_count, title) from public.prompt_requests where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'));
select public._check(1, 'workflows: like/comment/save unchanged, title edit works',
  (select like_count = 0 and comment_count = 0 and save_count = 0 and title = 'W2' from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  (select format('%s/%s/%s %s', like_count, comment_count, save_count, title) from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
select public._check(1, 'presets: like/comment/save/use unchanged, title edit works',
  (select like_count = 0 and comment_count = 0 and save_count = 0 and use_count = 0 and title = 'S2' from public.presets where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  (select format('%s/%s/%s/%s %s', like_count, comment_count, save_count, use_count, title) from public.presets where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'));
select public._check(1, 'prompt_results: like/comment unchanged',
  (select like_count = 0 and comment_count = 0 from public.prompt_results where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'));
select public._check(1, 'prompt_comments: like unchanged, body edit works',
  (select like_count = 0 and body = 'hi2' from public.prompt_comments where id = '99999999-9999-4999-8999-999999999999'));
select public._check(1, 'profiles: follower/following unchanged, display_name edit works',
  (select follower_count = 0 and following_count = 0 and display_name = 'Alice 2' from public.profiles where id = '11111111-1111-4111-8111-111111111111'));
select public._check(1, 'collections: item_count unchanged, rename works',
  (select item_count = 0 and name = 'Yazılım 2' from public.collections where id = 'c0000001-0000-4000-8000-000000000001'));
select public._check(2, 'INSERT with counters: prompt starts at 0/0/0',
  (select like_count = 0 and save_count = 0 and comment_count = 0 from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1'));
select public._check(2, 'INSERT with counters: workflow starts at 0/0/0',
  (select like_count = 0 and save_count = 0 and comment_count = 0 from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'));

-- ---------- 2. Meşru akışlar (bob etkileşir) sayaçları hâlâ doğru artırır ----------
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
insert into public.prompt_likes (user_id, prompt_id) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.prompt_likes (user_id, workflow_id) values ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.prompt_comments (prompt_id, author_id, body) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'selam');
insert into public.follows (follower_id, following_id) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
insert into public.collection_items (collection_id, prompt_id)
  select id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' from public.collections where owner_id = '22222222-2222-4222-8222-222222222222' and is_default;
reset role;
select public._check(3, 'like via trigger still counts (prompt)', (select like_count = 1 from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select public._check(3, 'like via trigger still counts (workflow)', (select like_count = 1 from public.workflows where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
select public._check(3, 'comment via trigger still counts (1 fixture + bob = 2)', (select comment_count = 2 from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select public._check(3, 'follow via trigger still counts (alice follower +1, bob following +1)',
  (select follower_count = 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111')
  and (select following_count = 1 from public.profiles where id = '22222222-2222-4222-8222-222222222222'));
select public._check(3, 'save via trigger still counts', (select save_count = 1 from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
select public._check(3, 'collection item_count still counts (client-side insert)',
  (select item_count = 1 from public.collections where owner_id = '22222222-2222-4222-8222-222222222222' and is_default));
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
delete from public.collection_items where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from public.prompt_likes where user_id = '22222222-2222-4222-8222-222222222222' and prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
reset role;
select public._check(3, 'unsave/unlike decrement again',
  (select like_count = 0 and save_count = 0 from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  and (select item_count = 0 from public.collections where owner_id = '22222222-2222-4222-8222-222222222222' and is_default));

-- ---------- 2b. unread_count: istemci yazamaz, RPC ile okundu işaretlenir, sunucu artırır ----------
insert into public.conversations (id) values ('12121212-1212-4212-8212-121212121212');
insert into public.conversation_members (conversation_id, user_id, status) values
  ('12121212-1212-4212-8212-121212121212', '11111111-1111-4111-8111-111111111111', 'accepted'),
  ('12121212-1212-4212-8212-121212121212', '22222222-2222-4222-8222-222222222222', 'accepted');
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values ('12121212-1212-4212-8212-121212121212', '22222222-2222-4222-8222-222222222222', 'merhaba');
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.conversation_members set unread_count = 9999, status = 'accepted' where conversation_id = '12121212-1212-4212-8212-121212121212' and user_id = '11111111-1111-4111-8111-111111111111';
reset role;
select public._check(5, 'unread_count is increased by the message trigger (alice has 1)', (select unread_count = 1 from public.conversation_members where conversation_id = '12121212-1212-4212-8212-121212121212' and user_id = '11111111-1111-4111-8111-111111111111'),
  (select unread_count::text from public.conversation_members where conversation_id = '12121212-1212-4212-8212-121212121212' and user_id = '11111111-1111-4111-8111-111111111111'));
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
select public.mark_conversation_read('12121212-1212-4212-8212-121212121212');
reset role;
select public._check(5, 'mark_conversation_read resets own unread_count to 0', (select unread_count = 0 from public.conversation_members where conversation_id = '12121212-1212-4212-8212-121212121212' and user_id = '11111111-1111-4111-8111-111111111111'));
-- bob'un okundu çağrısı alice'in satırına dokunamaz (RPC yalnız auth.uid() satırı)
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
insert into public.messages (conversation_id, sender_id, body) values ('12121212-1212-4212-8212-121212121212', '22222222-2222-4222-8222-222222222222', 'iki');
select public.mark_conversation_read('12121212-1212-4212-8212-121212121212');
reset role;
select public._check(5, 'mark_conversation_read never touches another member''s row', (select unread_count = 1 from public.conversation_members where conversation_id = '12121212-1212-4212-8212-121212121212' and user_id = '11111111-1111-4111-8111-111111111111'));

-- ---------- 2c. tags: RLS zaten yazdırmaz; trigger ayrıca (politika eklenirse) sayacı korur ----------
insert into public.tags (slug, label) values ('test-etiket', 'Test Etiket');
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.tags set prompt_usage_count = 9999 where slug = 'test-etiket';
reset role;
select public._check(6, 'tags: client UPDATE is blocked by RLS (no policy)', (select prompt_usage_count = 0 from public.tags where slug = 'test-etiket'));
create policy tmp_tags_update on public.tags for update to authenticated using (true) with check (true);
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
update public.tags set prompt_usage_count = 9999, request_usage_count = 9999, label = 'Test 2' where slug = 'test-etiket';
reset role;
select public._check(6, 'tags: even with a permissive policy the trigger keeps counters (label still editable)',
  (select prompt_usage_count = 0 and request_usage_count = 0 and usage_count = 0 and label = 'Test 2' from public.tags where slug = 'test-etiket'));
drop policy tmp_tags_update on public.tags;

-- ---------- 3. Süper kullanıcı (migration/seed/Dashboard) ve unread_count ----------
update public.prompts set like_count = 5 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public._check(4, 'postgres/service role can still set counters (seeds, admin SQL)', (select like_count = 5 from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
