-- Kişisel API okuma RPC'leri (20261102120000_api_me.sql; docs/history/315-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-me.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başkası. Edge Function'ın yaptığı gibi: işlemde rol + JWT iddiaları kurulup RPC çağrılır.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set pa 'a4000000-0000-4000-8000-000000000001'
\set pb 'a4000000-0000-4000-8000-000000000002'
\set pc 'a4000000-0000-4000-8000-000000000003'
\set pd 'a4000000-0000-4000-8000-000000000004'
\set pe 'a4000000-0000-4000-8000-000000000005'
\set po 'a4000000-0000-4000-8000-000000000006'

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot')) as u(id, name);

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
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

insert into public.conversations (id, kind) values ('e5000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e5000000-0000-4000-8000-000000000001', 'Topluluk', :me);
-- Benim: pa yayında/herkese açık, pb özel taslak, pc topluluğa özgü, pd silinmiş, pe yayında (en yeni). Başkasının: po yayında/herkese açık + pp özel.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id, deleted_at, created_at) values
  (:'pa', :me, 'Pa', 'd', 'metin A', 'text', 'published', 'public',  null, null, now() - interval '5 days'),
  (:'pb', :me, 'Pb özel taslak', 'd', 'metin B', 'text', 'draft', 'private', null, null, now() - interval '4 days'),
  (:'pc', :me, 'Pc topluluk', 'd', 'm', 'text', 'published', 'private', 'e5000000-0000-4000-8000-000000000001', null, now() - interval '3 days'),
  (:'pd', :me, 'Pd silinmiş', 'd', 'm', 'text', 'published', 'public', null, now(), now() - interval '2 days'),
  (:'pe', :me, 'Pe', repeat('x', 400), 'metin E', 'image', 'published', 'public', null, null, now() - interval '1 day'),
  (:'po', :ot, 'Po başkası', 'd', 'metin O', 'text', 'published', 'public', null, null, now() - interval '6 days'),
  ('a4000000-0000-4000-8000-000000000007', :ot, 'Pp başkasının özeli', 'd', 'gizli', 'text', 'draft', 'private', null, null, now() - interval '7 days');
insert into public.tags (slug, label) values ('neon', 'neon'), ('logo', 'logo') on conflict do nothing;
insert into public.prompt_tags (prompt_id, tag_slug) values (:'pa', 'neon'), (:'pa', 'logo');

-- Kaydettiklerim: me, koleksiyonuna po'yu ve pa'yı kaydetti; ot kendi koleksiyonuna pa'yı.
-- Her profil için varsayılan koleksiyon (Genel) tetikleyiciyle zaten var; onları kullanırız.
insert into public.collection_items (collection_id, prompt_id, created_at) values
  ((select id from public.collections where owner_id = :me and is_default), :'po', now() - interval '1 hour'),
  ((select id from public.collections where owner_id = :me and is_default), :'pa', now() - interval '2 hours'),
  ((select id from public.collections where owner_id = :ot and is_default), :'pe', now());

-- Edge Function'ın yaptığı: rol + iddialar.
create or replace function public._act(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

set role authenticated;
select public._as_user(:me);

select public._check(1, 'profile returns the caller', (select count(*) = 1 and bool_and(user_id = :me::uuid and username is not null) from public.api_me_profile()));
select public._check(2, 'my prompts: drafts and private included, community-only and deleted and others excluded, newest first',
  (select array_agg(title order by created_at desc) = array['Pe', 'Pb özel taslak', 'Pa'] from public.api_me_prompts()));
select public._check(3, 'description is cut to 300 characters', (select max(char_length(description)) = 300 from public.api_me_prompts()));
select public._check(4, 'status filter', (select count(*) = 1 and bool_and(status = 'draft') from public.api_me_prompts(20, null, null, 'draft')));
select public._check(5, 'limit is clamped (0 → 1, 1000 → ≤51)',
  (select count(*) = 1 from public.api_me_prompts(0)) and (select count(*) <= 51 from public.api_me_prompts(1000)));
select public._check(6, 'keyset: the page after the first row continues without repeating',
  (select array_agg(title order by created_at desc) = array['Pb özel taslak', 'Pa']
     from public.api_me_prompts(20, (select created_at from public.api_me_prompts(1)), (select id from public.api_me_prompts(1)))));
select public._check(7, 'one prompt: full text and tags', (select prompt_text = 'metin A' and tags = array['logo', 'neon'] from public.api_me_prompt(:'pa')));
select public._check(8, 'my private draft is readable by me', (select count(*) = 1 from public.api_me_prompt(:'pb')));
select public._check(9, 'someone else''s prompt (even public) is not returned by the me endpoint', (select count(*) = 0 from public.api_me_prompt(:'po')));
select public._check(10, 'community-only and deleted prompts are not returned', (select count(*) = 0 from public.api_me_prompt(:'pc')) and (select count(*) = 0 from public.api_me_prompt(:'pd')));
select public._check(11, 'saved: unique prompts from MY collections only, newest first',
  (select array_agg(title order by saved_at desc) = array['Po başkası', 'Pa'] from public.api_me_saved()));

select public._as_user(:ot);
select public._check(12, 'another user sees none of my prompts and not my private draft',
  (select count(*) = 2 and bool_and(title in ('Pp başkasının özeli', 'Po başkası')) from public.api_me_prompts())
  and (select count(*) = 0 from public.api_me_prompt(:'pb')));
select public._check(13, 'another user''s saved list is theirs', (select array_agg(title) = array['Pe'] from public.api_me_saved()));

-- Throttle: okuma 120/dk; kimliksiz çağrı reddedilir.
select public._as_user(:me);
do $$ begin for i in 1..120 loop perform public.api_me_throttle(false); end loop; end $$;
select public._check(14, 'the 121st read within a minute is rate limited', public._try($q$ select public.api_me_throttle(false) $q$) like '%rate_limit%');
select public._check(15, 'writes have their own bucket (30/min) and it is separate from reads', public._try($q$ select public.api_me_throttle(true) $q$) = 'ok');
select public._as_user('');
select public._check(16, 'throttle without an identity fails', public._try($q$ select public.api_me_throttle(false) $q$) like '%not_authenticated%');
reset role;

-- Yetkiler: ziyaretçi hiçbirini çağıramaz.
set role anon;
select public._as_user('');
select public._check(17, 'anon cannot call any api_me function',
  public._try($q$ select * from public.api_me_prompts() $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_prompt('a4000000-0000-4000-8000-000000000001') $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_saved() $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.api_me_profile() $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_throttle() $q$) ilike '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
