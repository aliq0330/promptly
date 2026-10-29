-- Birebir sohbette sessize alma: DB tarafı testi (docs/history/270-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla temiz bir yerel PostgreSQL'e oynatıldıktan sonra
-- (supabase/tests/run-local.sh), süper kullanıcıyla: psql -d <db> -f direct-chat-mute.sql — "FAILED=0" beklenir.
-- Kullanıcılar: alice (11..), bobby (22..). Fixture kalıcıdır; ikinci çalıştırma için veritabanını yeniden kurun.
\pset pager off
\set ON_ERROR_STOP off

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

-- alice ↔ bob kabul edilmiş sohbet.
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
create temp table _conv as select public.start_direct_conversation('22222222-2222-4222-8222-222222222222') as id;
grant all on _conv to public;
select public._as_user('22222222-2222-4222-8222-222222222222');
update public.conversation_members set status = 'accepted' where user_id = '22222222-2222-4222-8222-222222222222';

-- 1. Sessize alınmamışken mesaj bildirimi gider.
select public._as_user('11111111-1111-4111-8111-111111111111');
insert into public.messages (conversation_id, sender_id, body)
  select id, '11111111-1111-4111-8111-111111111111', 'selam' from _conv;
reset role;
select public._check(1, 'sessize alınmamış sohbette bildirim yazılır',
  (select count(*) = 1 from public.notifications where recipient_id = '22222222-2222-4222-8222-222222222222' and type = 'message'));

-- 2. Bob kendi satırını sessize alır (istemcinin yaptığı gibi) — alice'in satırına dokunamaz.
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
update public.conversation_members set muted_at = now() where conversation_id = (select id from _conv);
reset role;
select public._check(2, 'bob yalnız kendi satırını sessize alabilir',
  (select muted_at is not null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222')
  and (select muted_at is null from public.conversation_members where conversation_id = (select id from _conv) and user_id = '11111111-1111-4111-8111-111111111111'));

-- 3. Sessizdeyken yeni mesaj bildirim üretmez; mesaj ve okunmamış sayacı yine çalışır.
set role authenticated;
select public._as_user('11111111-1111-4111-8111-111111111111');
insert into public.messages (conversation_id, sender_id, body)
  select id, '11111111-1111-4111-8111-111111111111', 'bir daha' from _conv;
reset role;
select public._check(3, 'sessizdeki alıcıya bildirim yazılmaz',
  (select count(*) = 1 from public.notifications where recipient_id = '22222222-2222-4222-8222-222222222222' and type = 'message'));
select public._check(4, 'sessizdeki alıcı mesajı yine de alır (okunmamış sayacı artar)',
  (select unread_count >= 1 from public.conversation_members where conversation_id = (select id from _conv) and user_id = '22222222-2222-4222-8222-222222222222'));

-- 4. Sesi açınca bildirim yeniden gider.
set role authenticated;
select public._as_user('22222222-2222-4222-8222-222222222222');
update public.conversation_members set muted_at = null where conversation_id = (select id from _conv);
select public._as_user('11111111-1111-4111-8111-111111111111');
insert into public.messages (conversation_id, sender_id, body)
  select id, '11111111-1111-4111-8111-111111111111', 'sesi açtın' from _conv;
reset role;
select public._check(5, 'sesi açılınca bildirim yeniden yazılır',
  (select count(*) = 2 from public.notifications where recipient_id = '22222222-2222-4222-8222-222222222222' and type = 'message'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
