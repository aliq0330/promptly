-- Skill alıntılama (docs/history/394-*).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'carol@test.dev', '{"username":"carol","display_name":"Carol"}');
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
\set sk    '''59400000-0000-4000-8000-000000000001'''
\set draft '''59400000-0000-4000-8000-000000000002'''
\set priv  '''59400000-0000-4000-8000-000000000003'''
insert into public.skills (id, author_id, slug, title, summary, instructions, status, visibility) values
  (:sk, :alice, 'q', 'Logo Skill', 's', '# r', 'published', 'public'),
  (:draft, :alice, 'd', 'Draft Skill', 's', '# r', 'draft', 'public'),
  (:priv, :alice, 'p', 'Private Skill', 's', '# r', 'published', 'private');

-- 1) Yayında + herkese açık Skill alıntılanır; sayaç sütunu korumalı
set role authenticated; select pg_temp.as_user(:bob);
select set_config('t.q1', (select public.create_quote('skill', :sk, 'Bunu deneyin')::text), false);
select pg_temp.check(1, 'a published public skill can be quoted', current_setting('t.q1') is not null);
select pg_temp.check(1, 'the quote row carries skill_id and target_id', (select skill_id = :sk and target_id = :sk and content_type = 'skill' from public.content_quotes where id = current_setting('t.q1')::uuid));
reset role;
select pg_temp.check(2, 'quote_count of the skill went up by one', (select quote_count = 1 from public.skills where id = :sk));
set role authenticated; select pg_temp.as_user(:bob);
select pg_temp.check(2, 'a client cannot write quote_count', pg_temp.raises(format($$update public.skills set quote_count = 99 where id = %L$$, :sk), 'counter') or (select quote_count from public.skills where id = :sk) = 1);

-- 3) Taslak / özel Skill alıntılanamaz; varlığı sızmaz
select pg_temp.check(3, 'a draft skill of someone else looks missing (content_not_found)', pg_temp.raises(format($$select public.create_quote('skill', %L)$$, :draft), 'content_not_found'));
select pg_temp.check(3, 'a private skill of someone else looks missing', pg_temp.raises(format($$select public.create_quote('skill', %L)$$, :priv), 'content_not_found'));
select pg_temp.check(3, 'an unknown id is content_not_found', pg_temp.raises($$select public.create_quote('skill', '59400000-0000-4000-8000-0000000000ff')$$, 'content_not_found'));
-- 4) Aynı Skill 24 saatte bir kez
select pg_temp.check(4, 'the same skill twice in 24h is already_quoted', pg_temp.raises(format($$select public.create_quote('skill', %L)$$, :sk), 'already_quoted'));
-- 5) Sahibi kendi taslağını alıntılarken content_not_public alır
select pg_temp.as_user(:alice);
select pg_temp.check(5, 'the owner quoting her own draft gets content_not_public', pg_temp.raises(format($$select public.create_quote('skill', %L)$$, :draft), 'content_not_public'));

-- 6) Okuma: alıntı herkese okunur, kart RPC'si Skill türünü döndürür
reset role; set role anon; select pg_temp.as_user('');
select pg_temp.check(6, 'a visitor reads the quote', (select count(*) = 1 from public.content_quotes where skill_id = :sk));
select pg_temp.check(6, 'quote_feed_cards returns the skill quote', (select content_type = 'skill' and target_id = :sk from public.quote_feed_cards(array[current_setting('t.q1')::uuid])));
select pg_temp.check(6, 'search_quotes finds it by skill title', (select count(*) = 1 from public.search_quotes('Logo Skill')));
reset role;

-- 7) Beğeni + yorum alıntıya aittir, Skill'in kendi sayaçlarına karışmaz
set role authenticated; select pg_temp.as_user(:carol);
insert into public.prompt_likes (user_id, quote_id) values (:carol, current_setting('t.q1')::uuid);
insert into public.prompt_comments (author_id, quote_id, body) values (:carol, current_setting('t.q1')::uuid, 'güzel');
reset role;
select pg_temp.check(7, 'the quote counts its own like and comment', (select like_count = 1 and comment_count = 1 from public.content_quotes where id = current_setting('t.q1')::uuid));
select pg_temp.check(7, 'the skill''s own counters are untouched', (select like_count = 0 and comment_count = 0 from public.skills where id = :sk));

-- 8) Bildirim: sahibe "alıntıladı"
select pg_temp.check(8, 'the owner got a quote notification', (select count(*) = 1 from public.notifications where recipient_id = :alice and type = 'quote' and target_href like '/quotes/local?id=%'));

-- 9) Skill gizlenince alıntı görünmez; geri açılınca geri gelir
update public.skills set visibility = 'private' where id = :sk;
set role anon; select pg_temp.as_user('');
select pg_temp.check(9, 'a hidden skill hides its quote', (select count(*) = 0 from public.content_quotes where skill_id = :sk));
reset role;
update public.skills set visibility = 'public' where id = :sk;
set role anon;
select pg_temp.check(9, 'the quote returns when the skill is public again', (select count(*) = 1 from public.content_quotes where skill_id = :sk));
reset role;

-- 10) feed_page alıntıyı döndürür
set role authenticated; select pg_temp.as_user(:carol);
select pg_temp.check(10, 'feed_page lists the skill quote as kind quote', exists (select 1 from public.feed_page('all', 'newest', array['quote'], null, null, null, 24, null, null, null, false, null, null, null, null, null, false) f where f.kind = 'quote' and f.id = current_setting('t.q1')::uuid));
reset role;

-- 11) Alıntıyı yalnız sahibi siler, sayaç düşer; Skill silinince alıntı da gider
set role authenticated; select pg_temp.as_user(:carol);
delete from public.content_quotes where id = current_setting('t.q1')::uuid;
select pg_temp.check(11, 'another user cannot delete the quote', (select count(*) = 1 from public.content_quotes where id = current_setting('t.q1')::uuid));
select pg_temp.as_user(:bob);
delete from public.content_quotes where id = current_setting('t.q1')::uuid;
reset role;
select pg_temp.check(11, 'the author deletes it and quote_count drops back', (select count(*) = 0 from public.content_quotes where skill_id = :sk) and (select quote_count = 0 from public.skills where id = :sk));
set role authenticated; select pg_temp.as_user(:bob);
select public.create_quote('skill', :sk, null);
reset role;
delete from public.skills where id = :sk;
select pg_temp.check(11, 'deleting the skill removes its quotes', (select count(*) = 0 from public.content_quotes where content_type = 'skill'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
