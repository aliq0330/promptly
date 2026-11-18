-- Kişisel API "interact" kapsamı ve etkileşim RPC'leri (20261209100000_api_me_interact.sql; docs/history/432-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-me-interact.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başkası (yazar); th = üçüncü kişi. Edge Function'ın yaptığı gibi: işlemde rol + iddialar kurulup RPC çağrılır.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set th '''33333333-3333-4333-8333-333333333333'''
\set pa 'a5000000-0000-4000-8000-000000000001'
\set pb 'a5000000-0000-4000-8000-000000000002'
\set pm 'a5000000-0000-4000-8000-000000000003'
\set pc 'a5000000-0000-4000-8000-000000000004'
\set ca 'c5000000-0000-4000-8000-000000000001'

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot'),(:th,'th')) as u(id, name);
update public.profiles set username = case id when :me::uuid then 'meuser' when :ot::uuid then 'otuser' else 'thuser' end where id in (:me::uuid, :ot::uuid, :th::uuid);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
-- Aynı deyim içindeki alt sorgular deyimin anlık görüntüsünü görür: bir fonksiyonun az önce yazdığını denetlemek için sorgu dinamik çalıştırılır (yeni anlık görüntü).
create or replace function public._q(q text) returns boolean language plpgsql as $$
declare r boolean; begin execute q into r; return coalesce(r, false); end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._q(text) to public;

insert into public.conversations (id, kind) values ('e6000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e6000000-0000-4000-8000-000000000001', 'Topluluk', :ot);
-- ot'un: pa yayında/herkese açık, pb özel taslak, pc topluluğa özgü. me'nin: pm yayında/herkese açık.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id, created_at) values
  (:'pa', :ot, 'Pa', 'd', 'metin A', 'text', 'published', 'public', null, now() - interval '3 days'),
  (:'pb', :ot, 'Pb özel', 'd', 'metin B', 'text', 'draft', 'private', null, now() - interval '2 days'),
  (:'pc', :ot, 'Pc topluluk', 'd', 'm', 'text', 'published', 'private', 'e6000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  (:'pm', :me, 'Pm benim', 'd', 'm', 'text', 'published', 'public', null, now());
insert into public.collections (id, owner_id, name, visibility) values (:'ca', :me, 'Koleksiyonum', 'private');

-- 1. Kapsam kısıtları genişledi; eskiler geçerli, bilinmeyen reddedilir.
select public._check(1, 'the scopes checks accept interact and still refuse unknown scopes',
  public._try($q$ insert into public.api_tokens (user_id, name, token_hash, prefix, scopes) values ('11111111-1111-4111-8111-111111111111', 'k', repeat('a', 64), 'pmt_aaaa', array['read','write','interact']) $q$) = 'ok'
  and public._try($q$ insert into public.api_tokens (user_id, name, token_hash, prefix, scopes) values ('11111111-1111-4111-8111-111111111111', 'k', repeat('b', 64), 'pmt_bbbb', array['read','admin']) $q$) ilike '%scopes_check%'
  and public._try($q$ insert into public.api_tokens (user_id, name, token_hash, prefix, scopes) values ('11111111-1111-4111-8111-111111111111', 'k', repeat('c', 64), 'pmt_cccc', array['read','write','interact','x']) $q$) ilike '%scopes_check%');
set role authenticated;
select public._as_user(:me);
select public._check(2, 'create_api_token accepts interact and refuses unknown scopes',
  (select (public.create_api_token('ext', array['read','interact'], 30))->'scopes' = '["interact", "read"]'::jsonb)
  and public._try($q$ select public.create_api_token('x', array['read','admin'], 30) $q$) ilike '%invalid_scope%');
reset role;

-- 2. OAuth: onayda interact varsayılan KAPALI, işaretlenirse kapsama girer.
insert into public.oauth_clients (id, name, redirect_uris) values ('d6000000-0000-4000-8000-000000000001', 'Ext', array['https://ext.test/cb']);
create table public._t (k text primary key, v text);
grant all on public._t to public;
create or replace function public._pkce(v text) returns text language sql as
  $$ select translate(rtrim(encode(extensions.digest(v, 'sha256'), 'base64'), '='), '+/', '-_') $$;
insert into public._t select 'r1', public._oauth_start_request('d6000000-0000-4000-8000-000000000001', 'https://ext.test/cb', public._pkce('v-' || repeat('abcdefghij', 5)), null, null, null);
insert into public._t select 'r2', public._oauth_start_request('d6000000-0000-4000-8000-000000000001', 'https://ext.test/cb', public._pkce('v-' || repeat('abcdefghij', 5)), null, null, null);
insert into public._t select 'r3', public._oauth_start_request('d6000000-0000-4000-8000-000000000001', 'https://ext.test/cb', public._pkce('v-' || repeat('abcdefghij', 5)), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'c1', (public.oauth_decide((select v from public._t where k='r1'), true, false))->'params'->>'code';
insert into public._t select 'c2', (public.oauth_decide((select v from public._t where k='r2'), true, false, true))->'params'->>'code';
insert into public._t select 'c3', (public.oauth_decide((select v from public._t where k='r3'), true, true, true))->'params'->>'code';
reset role;
select public._check(3, 'oauth_decide: read by default; interact only when ticked; write and interact are independent',
  (select scopes = array['read'] from public.oauth_codes where code_hash = public._oauth_hash((select v from public._t where k='c1')))
  and (select scopes = array['read','interact'] from public.oauth_codes where code_hash = public._oauth_hash((select v from public._t where k='c2')))
  and (select scopes = array['read','write','interact'] from public.oauth_codes where code_hash = public._oauth_hash((select v from public._t where k='c3'))));
select public._check(4, 'the old 3-argument oauth_decide is gone (the 4-argument form with defaults replaces it)',
  (select count(*) = 1 from pg_proc where proname = 'oauth_decide' and pronamespace = 'public'::regnamespace));

-- 3. Tepki: ekle, değiştir, geri al; okunamayan prompt (özel/topluluk) bulunamaz.
set role authenticated;
select public._as_user(:me);
select public.api_me_react(:'pa', 'fire') as r \gset r1_
select public._check(5, 'react: insert, change, then remove (fire → idea → none)',
  :'r1_r' = 'fire'
  and public._q($$ select reaction = 'fire' from public.prompt_likes where prompt_id = 'a5000000-0000-4000-8000-000000000001' and user_id = '11111111-1111-4111-8111-111111111111' $$));
select public.api_me_react(:'pa', 'idea') as r \gset r2_
select public._check(6, 'react: changing the reaction updates the same row',
  :'r2_r' = 'idea'
  and public._q($$ select count(*) = 1 and bool_and(reaction = 'idea') from public.prompt_likes where prompt_id = 'a5000000-0000-4000-8000-000000000001' and user_id = '11111111-1111-4111-8111-111111111111' $$)
  and public._q($$ select like_count = 1 from public.prompts where id = 'a5000000-0000-4000-8000-000000000001' $$));
select public.api_me_react(:'pa', null) as r \gset r3_
select public._check(7, 'react: null removes it and like_count follows (the site''s own trigger)',
  public._q($$ select count(*) = 0 from public.prompt_likes where prompt_id = 'a5000000-0000-4000-8000-000000000001' and user_id = '11111111-1111-4111-8111-111111111111' $$)
  and public._q($$ select like_count = 0 from public.prompts where id = 'a5000000-0000-4000-8000-000000000001' $$));
select public._check(8, 'react: invalid reaction, private, community-only and unknown prompts are refused',
  public._try($q$ select public.api_me_react('a5000000-0000-4000-8000-000000000001', 'angry') $q$) ilike '%invalid_reaction%'
  and public._try($q$ select public.api_me_react('a5000000-0000-4000-8000-000000000002', 'love') $q$) ilike '%not_found%'
  and public._try($q$ select public.api_me_react('a5000000-0000-4000-8000-000000000004', 'love') $q$) ilike '%not_found%'
  and public._try($q$ select public.api_me_react(gen_random_uuid(), 'love') $q$) ilike '%not_found%');
select public._check(9, 'react: you cannot react to your own prompt (the site''s rule)',
  public._try($q$ select public.api_me_react('a5000000-0000-4000-8000-000000000003', 'love') $q$) <> 'ok');

-- 4. Kaydet / koleksiyon: kaydetmek ≠ koleksiyona eklemek (336-*).
select public.api_me_set_saved(:'pa', true) as r \gset s1_
select public.api_me_set_saved(:'pa', true) as r \gset s2_
select public._check(10, 'save puts the prompt in the system collection only (twice is harmless)',
  :'s1_r' = 't' and :'s2_r' = 't'
  and public._q($$ select count(*) = 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id where ci.prompt_id = 'a5000000-0000-4000-8000-000000000001' and c.owner_id = '11111111-1111-4111-8111-111111111111' and c.is_default $$)
  and public._q($$ select count(*) = 0 from public.collection_items where prompt_id = 'a5000000-0000-4000-8000-000000000001' and collection_id = 'c5000000-0000-4000-8000-000000000001' $$));
select public.api_me_collection_item(:'ca', :'pa', true) as r \gset c1_
select public._check(11, 'add to a collection',
  :'c1_r' = 't' and public._q($$ select count(*) = 1 from public.collection_items where prompt_id = 'a5000000-0000-4000-8000-000000000001' and collection_id = 'c5000000-0000-4000-8000-000000000001' $$));
select public.api_me_collection_item(:'ca', :'pa', false) as r \gset c2_
select public._check(12, 'remove from a collection: the prompt stays saved',
  :'c2_r' = 'f'
  and public._q($$ select count(*) = 0 from public.collection_items where prompt_id = 'a5000000-0000-4000-8000-000000000001' and collection_id = 'c5000000-0000-4000-8000-000000000001' $$)
  and public._q($$ select saved from public.api_me_engagement(array['a5000000-0000-4000-8000-000000000001'::uuid]) $$));
select public._check(13, 'add to a collection of someone else or to the system collection is refused',
  public._try(format($q$ select public.api_me_collection_item(%L, %L, true) $q$, (select id from public.collections where owner_id = :ot::uuid limit 1), :'pa')) ilike '%collection_not_found%'
  and public._try(format($q$ select public.api_me_collection_item(%L, %L, true) $q$, (select id from public.collections where owner_id = :me::uuid and is_default), :'pa')) ilike '%collection_not_found%');
select public._check(14, 'a private prompt cannot be saved or added',
  public._try($q$ select public.api_me_set_saved('a5000000-0000-4000-8000-000000000002', true) $q$) ilike '%not_found%'
  and public._try($q$ select public.api_me_collection_item('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', true) $q$) ilike '%not_found%');
select public.api_me_collection_item(:'ca', :'pa', true);
select public.api_me_set_saved(:'pa', false) as r \gset s3_
select public._check(15, 'unsave removes the prompt from the system collection AND every collection of mine',
  :'s3_r' = 'f'
  and public._q($$ select count(*) = 0 from public.collection_items ci join public.collections c on c.id = ci.collection_id where ci.prompt_id = 'a5000000-0000-4000-8000-000000000001' and c.owner_id = '11111111-1111-4111-8111-111111111111' $$));

-- 5. Takip.
select public.api_me_set_follow('OTUSER', true) as r \gset f1_
select public.api_me_set_follow('otuser', true) as r \gset f2_
select public._check(16, 'follow by username (case-insensitive); repeating is harmless',
  :'f1_r' = 't' and :'f2_r' = 't'
  and public._q($$ select count(*) = 1 from public.follows where follower_id = '11111111-1111-4111-8111-111111111111' and following_id = '22222222-2222-4222-8222-222222222222' $$));
select public.api_me_set_follow('otuser', false) as r \gset f3_
select public._check(17, 'unfollow',
  :'f3_r' = 'f' and public._q($$ select count(*) = 0 from public.follows where follower_id = '11111111-1111-4111-8111-111111111111' $$));
select public._check(18, 'follow: unknown user and yourself are refused',
  public._try($q$ select public.api_me_set_follow('nobody-here', true) $q$) ilike '%not_found%'
  and public._try($q$ select public.api_me_set_follow('meuser', true) $q$) ilike '%self_follow_not_allowed%');

-- 6. Benim durumum.
select public.api_me_react(:'pa', 'wow');
select public.api_me_set_saved(:'pa', true);
select public.api_me_collection_item(:'ca', :'pa', true);
select public.api_me_set_follow('otuser', true);
select public._check(19, 'engagement: my reaction, saved, collections, following and the author',
  (select reaction = 'wow' and saved and collection_ids = array[:'ca'::uuid] and following_author and author_username = 'otuser' from public.api_me_engagement(array[:'pa'::uuid])));
select public._check(20, 'engagement: only readable prompts are listed (private/community-only are not), at most 30 ids',
  (select count(*) = 1 from public.api_me_engagement(array[:'pa'::uuid, :'pb'::uuid, :'pc'::uuid, gen_random_uuid()])));
select public._check(21, 'engagement: works state carries counts and MY vote only (no copy yet → cannot vote)',
  (select works_yes = 0 and works_no = 0 and my_vote is null and can_vote = false from public.api_me_engagement(array[:'pa'::uuid])));

-- 7. Koleksiyonlar.
select public._check(22, 'collections: mine listed with the prompt count; the system collection is not listed',
  (select count(*) = 1 and bool_and(name = 'Koleksiyonum' and mine and prompt_count = 1) from public.api_me_collections()));
select public._check(23, 'collection prompts: readable ones, newest added first, keyset page works',
  (select count(*) = 1 and bool_and(id = :'pa'::uuid) from public.api_me_collection_prompts(:'ca'))
  and (select count(*) = 0 from public.api_me_collection_prompts(:'ca', 20, (select added_at from public.api_me_collection_prompts(:'ca')), :'pa'))
  and (select count(*) = 0 from public.api_me_collection_prompts((select id from public.collections where owner_id = :me::uuid and is_default))));

-- 8. Akış: Takip (kronolojik) yalnız takip ettiklerimin promptları; Sana özel prompt döndürür.
select public._check(24, 'following feed: only prompts of followed people, never private/community-only/my own',
  (select count(*) = 1 and bool_and(id = :'pa'::uuid) from public.api_me_feed('following')));
select public._check(25, 'for_you feed answers (prompts only) and never leaks private or community-only prompts',
  public._try($q$ select * from public.api_me_feed('for_you', now()) $q$) = 'ok'
  and (select count(*) = 0 from public.api_me_feed('for_you', now()) where id in ('a5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000004')));
select public._check(26, 'feed: unknown tab is refused', public._try($q$ select * from public.api_me_feed('x') $q$) ilike '%invalid_tab%');

-- 9. Hız sınırı kovaları ve kimliksiz çağrı.
do $$ begin for i in 1..60 loop perform public.api_me_throttle_kind('interact'); end loop; end $$;
select public._check(27, 'the 61st interact call within a minute is rate limited; reads and writes use other buckets',
  public._try($q$ select public.api_me_throttle_kind('interact') $q$) like '%rate_limit%'
  and public._try($q$ select public.api_me_throttle_kind('read') $q$) = 'ok'
  and public._try($q$ select public.api_me_throttle_kind('write') $q$) = 'ok');
select public._as_user('');
select public._check(28, 'without an identity every write fails',
  public._try($q$ select public.api_me_react('a5000000-0000-4000-8000-000000000001', 'love') $q$) like '%not_authenticated%'
  and public._try($q$ select public.api_me_set_saved('a5000000-0000-4000-8000-000000000001', true) $q$) like '%not_authenticated%'
  and public._try($q$ select public.api_me_set_follow('otuser', true) $q$) like '%not_authenticated%');
reset role;

-- 10. Başkası benim durumumu görmez.
set role authenticated;
select public._as_user(:th);
select public._check(29, 'another user sees none of my reactions/saves/collections',
  (select reaction is null and not saved and collection_ids = '{}' and not following_author from public.api_me_engagement(array[:'pa'::uuid]))
  and (select count(*) = 0 from public.api_me_collections())
  and (select count(*) = 0 from public.api_me_collection_prompts(:'ca') where false)
  and public._try(format($q$ select public.api_me_collection_item(%L, %L, true) $q$, :'ca', :'pa')) ilike '%collection_not_found%');
reset role;

-- 11. Ziyaretçi hiçbirini çağıramaz.
set role anon;
select public._as_user('');
select public._check(30, 'anon cannot call any interact function',
  public._try($q$ select public.api_me_react('a5000000-0000-4000-8000-000000000001', 'love') $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_set_saved('a5000000-0000-4000-8000-000000000001', true) $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_collection_item('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', true) $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_set_follow('otuser', true) $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_feed('for_you') $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_collections() $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_collection_prompts('c5000000-0000-4000-8000-000000000001') $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_engagement(array['a5000000-0000-4000-8000-000000000001'::uuid]) $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_throttle_kind('read') $q$) ilike '%permission denied%'
  and public._try($q$ select public.oauth_decide('x', true, false, true) $q$) ilike '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
