-- 1-1 sesli/görüntülü arama: calls tablosu, RPC'ler, meşgul/engel/izin kuralları, sinyal kanalı yetkisi — DB/RLS/RPC testi (docs/history/449-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/calls.sql  ("FAIL" satırı beklenmez).
-- Kullanıcılar: alice bobby carol dave. DM alice↔bobby (kabul edilmiş), alice→carol (carol kabul etmedi = bekleyen istek).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text) to public;

-- ---------- fixture ----------
set role authenticated;
select public._as_user(:alice);
create temp table _dm as select public.start_direct_conversation(:bobby) as id;
create temp table _dmc as select public.start_direct_conversation(:carol) as id;
grant all on _dm, _dmc to public;
select public._as_user(:bobby);
update public.conversation_members set status = 'accepted' where user_id = :bobby;
reset role;
insert into public._ctx select 'dm', id::text from _dm;
insert into public._ctx select 'dmc', id::text from _dmc;
-- Grup sohbeti (arama yalnız birebirde): doğrudan satır.
insert into public.conversations (id, kind) values ('00000000-0000-4000-8000-0000000000c1', 'group');
insert into public.conversation_members (conversation_id, user_id, status) values
  ('00000000-0000-4000-8000-0000000000c1', :alice, 'accepted'),
  ('00000000-0000-4000-8000-0000000000c1', :bobby, 'accepted');

-- ============================================================================
-- 1. Başlatma
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
create temp table _c1 as select * from public.call_start(public._g('dm'), 'audio');
grant all on _c1 to public;
reset role;
select public._check(1, 'call_start: durum ringing, arayan alice, aranan SUNUCUDA çözülen bobby',
  (select status = 'ringing' and caller_id = :alice and callee_id = :bobby and type = 'audio' and answered_at is null and ended_at is null from _c1));

set role authenticated;
select public._as_user(:alice);
select public._check(2, 'istemci calls tablosuna doğrudan insert/update/delete yapamaz',
  public._try(format('insert into public.calls (conversation_id, caller_id, callee_id, type) values (%L, %L, %L, ''audio'')', public._g('dm'), :alice::uuid, :bobby::uuid)) ilike '%permission denied%'
  and public._try('update public.calls set status = ''ended''') ilike '%permission denied%'
  and public._try('delete from public.calls') ilike '%permission denied%');
select public._check(3, 'arayan kendi çağrısını okur', (select count(*) from public.calls) = 1);
select public._as_user(:bobby);
select public._check(4, 'aranan çağrıyı okur', (select count(*) from public.calls) = 1);
select public._as_user(:carol);
select public._check(5, 'üçüncü kişi çağrıyı OKUYAMAZ', (select count(*) from public.calls) = 0);
select public._check(6, 'üçüncü kişi call_respond ile çağrıya dokunamaz (call_not_found)', public._try(format('select public.call_respond(%L, ''end'')', (select id from _c1))) like '%call_not_found%');
select public._check(7, 'sinyal kanalı: üçüncü kişi call:<id> konusunu KULLANAMAZ',
  not public.can_use_call_topic('call:' || (select id from _c1)::text));
select public._as_user(:alice);
select public._check(8, 'sinyal kanalı: arayan kullanabilir', public.can_use_call_topic('call:' || (select id from _c1)::text));
select public._as_user(:bobby);
select public._check(9, 'sinyal kanalı: aranan kullanabilir; biçimi bozuk/başka konu reddedilir',
  public.can_use_call_topic('call:' || (select id from _c1)::text)
  and not public.can_use_call_topic('call:not-a-uuid')
  and not public.can_use_call_topic('typing:' || (select id from _c1)::text)
  and not public.can_use_call_topic('call:00000000-0000-4000-8000-000000000000'));

-- ============================================================================
-- 2. Meşgul
-- ============================================================================
select public._as_user(:alice);
select public._check(10, 'meşgul: arayan çalan çağrıdayken ikinci arama call_busy', public._try(format('select public.call_start(%L, ''video'')', public._g('dm'))) like '%call_busy%');
select public._as_user(:bobby);
select public._check(11, 'meşgul: aranan da karşı yönden arayamaz (call_busy)', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%call_busy%');
select public._check(12, 'calls_my_open: aranan çalan çağrıyı görür', (select count(*) from public.calls_my_open()) = 1);

-- ============================================================================
-- 3. Kabul / bitiş
-- ============================================================================
select public._as_user(:alice);
select public._check(13, 'accept: arayan kabul EDEMEZ (call_not_allowed)', public._try(format('select public.call_respond(%L, ''accept'')', (select id from _c1))) like '%call_not_allowed%');
select public._as_user(:bobby);
create temp table _a1 as select * from public.call_respond((select id from _c1), 'accept');
grant all on _a1 to public;
select public._check(14, 'accept: aranan kabul eder → accepted + answered_at', (select status = 'accepted' and answered_at is not null and ended_at is null from _a1));
select public._check(15, 'accept: ikinci kabul call_not_ringing', public._try(format('select public.call_respond(%L, ''accept'')', (select id from _c1))) like '%call_not_ringing%');
select public._check(16, 'accept: kabul edilmiş çağrıda reject durumu bozmaz (hâlâ accepted)',
  (select status from public.call_respond((select id from _c1), 'reject')) = 'accepted');
select public._as_user(:alice);
select public._check(17, 'end: iki taraf da bitirebilir → ended + ended_at + hangup',
  (select status = 'ended' and ended_at is not null and end_reason = 'hangup' from public.call_respond((select id from _c1), 'end')));
select public._check(18, 'end: ikinci kez bitirmek idempotent (hata yok, ended kalır)',
  (select status from public.call_respond((select id from _c1), 'end', 'failed')) = 'ended'
  and (select end_reason from public.calls where id = (select id from _c1)) = 'hangup');

-- ============================================================================
-- 4. Reddet / vazgeç / zaman aşımı
-- ============================================================================
create temp table _c2 as select * from public.call_start(public._g('dm'), 'video');
grant all on _c2 to public;
select public._as_user(:bobby);
select public._check(19, 'reject: aranan reddeder → rejected', (select status = 'rejected' and end_reason = 'rejected' and ended_at is not null from public.call_respond((select id from _c2), 'reject')));
reset role;
select public._check(20, 'reject: reddedilen çağrı için "cevapsız" bildirimi YOK', (select count(*) from public.notifications where dedupe_key = 'call-missed:' || (select id from _c2)::text) = 0);

set role authenticated;
select public._as_user(:alice);
create temp table _c3 as select * from public.call_start(public._g('dm'), 'audio');
grant all on _c3 to public;
select public._check(21, 'cancel: arayan vazgeçer → missed + cancelled', (select status = 'missed' and end_reason = 'cancelled' from public.call_respond((select id from _c3), 'cancel')));
reset role;
select public._check(22, 'cancel: aranana tek "seni sesli aradı, cevapsız kaldı" bildirimi (konuşmaya bağlantılı)',
  (select count(*) from public.notifications where dedupe_key = 'call-missed:' || (select id from _c3)::text and recipient_id = :bobby and actor_id = :alice
     and message = 'seni sesli aradı, cevapsız kaldı.' and target_href = '/messages/local?id=' || public._g('dm')::text) = 1);

set role authenticated;
select public._as_user(:alice);
create temp table _c4 as select * from public.call_start(public._g('dm'), 'video');
grant all on _c4 to public;
select public._check(23, 'timeout: süre dolmadan zaman aşımı bildirimi çağrıyı DÜŞÜRMEZ (ringing kalır)', (select status from public.call_respond((select id from _c4), 'timeout')) = 'ringing');
reset role;
update public.calls set created_at = now() - interval '70 seconds' where id = (select id from _c4);
set role authenticated;
select public._as_user(:bobby);
select public._check(24, 'accept: süresi dolmuş çağrı KABUL EDİLEMEZ — hata yok, dönen satır missed + timeout (istemci status''e bakar)',
  (select status = 'missed' and end_reason = 'timeout' from public.call_respond((select id from _c4), 'accept')));
reset role;
select public._check(25, 'süresi dolan çağrı missed + timeout', (select status = 'missed' and end_reason = 'timeout' from public.calls where id = (select id from _c4)));
select public._check(26, 'süresi dolan çağrı için görüntülü "seni görüntülü aradı, cevapsız kaldı." bildirimi', (select count(*) from public.notifications where dedupe_key = 'call-missed:' || (select id from _c4)::text and message = 'seni görüntülü aradı, cevapsız kaldı.') = 1);

-- ============================================================================
-- 5. İzin kuralları
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._check(27, 'bekleyen mesaj isteğinde (carol kabul etmedi) arama yapılamaz (call_not_allowed)', public._try(format('select public.call_start(%L, ''audio'')', public._g('dmc'))) like '%call_not_allowed%');
select public._check(28, 'grup sohbetinde arama yapılamaz (call_not_direct)', public._try('select public.call_start(''00000000-0000-4000-8000-0000000000c1'', ''audio'')') like '%call_not_direct%');
select public._as_user(:dave);
select public._check(29, 'üye olmadığın konuşmada arama yapılamaz', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%call_not_allowed%');
select public._as_user(:alice);
select public._check(30, 'geçersiz tür reddedilir (call_invalid_type); geçersiz eylem reddedilir', public._try(format('select public.call_start(%L, ''screen'')', public._g('dm'))) like '%call_invalid_type%'
  and public._try(format('select public.call_respond(%L, ''hack'')', (select id from _c1))) like '%call_invalid_action%');

-- ============================================================================
-- 6. Takılı kalmış çağrılar
-- ============================================================================
create temp table _c5 as select * from public.call_start(public._g('dm'), 'audio');
grant all on _c5 to public;
select public._as_user(:bobby);
select public.call_respond((select id from _c5), 'accept');
reset role;
update public.calls set answered_at = now() - interval '5 hours', created_at = now() - interval '5 hours' where id = (select id from _c5);
set role authenticated;
select public._as_user(:alice);
create temp table _c6 as select * from public.call_start(public._g('dm'), 'audio');
grant all on _c6 to public;
reset role;
select public._check(31, '4 saatten eski "kabul edildi" takılı çağrı kendiliğinden kapanır (stale), yeni arama başlar',
  (select status = 'ended' and end_reason = 'stale' from public.calls where id = (select id from _c5))
  and (select status = 'ringing' from public.calls where id = (select id from _c6)));
set role authenticated;
select public._as_user(:alice);
select public.call_respond((select id from _c6), 'cancel');

-- ============================================================================
-- 7. Engel
-- ============================================================================
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :alice);
set role authenticated;
select public._as_user(:alice);
select public._check(32, 'engel: engellenen arayamaz (interaction_blocked)', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%interaction_blocked%');
select public._as_user(:bobby);
select public._check(33, 'engel: engelleyen de arayamaz', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%interaction_blocked%');
reset role;

-- ============================================================================
-- 8. Yetkiler
-- ============================================================================
select public._check(34, 'anon call_start/call_respond/calls_my_open/can_use_call_topic ÇAĞIRAMAZ; iç yardımcılar kimseye açık değil',
  not has_function_privilege('anon', 'public.call_start(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.call_respond(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.calls_my_open()', 'execute')
  and not has_function_privilege('anon', 'public.can_use_call_topic(text)', 'execute')
  and has_function_privilege('authenticated', 'public.call_start(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public._call_mark_missed(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public._call_expire_for(uuid)', 'execute'));
select public._check(35, 'anon calls tablosunu okuyamaz', not has_table_privilege('anon', 'public.calls', 'select')
  and not has_table_privilege('authenticated', 'public.calls', 'insert')
  and not has_table_privilege('authenticated', 'public.calls', 'update')
  and not has_table_privilege('authenticated', 'public.calls', 'delete'));
select public._check(36, 'durum tutarlılığı CHECK: ringing + ended_at, accepted + answered_at yok reddedilir',
  public._try(format('insert into public.calls (conversation_id, caller_id, callee_id, type, status, ended_at) values (%L, %L, %L, ''audio'', ''ringing'', now())', public._g('dm'), :alice::uuid, :bobby::uuid)) like '%calls_state_shape%'
  and public._try(format('insert into public.calls (conversation_id, caller_id, callee_id, type, status) values (%L, %L, %L, ''audio'', ''accepted'')', public._g('dm'), :alice::uuid, :bobby::uuid)) like '%calls_state_shape%');
select public._check(37, 'kendini arama CHECK',
  public._try(format('insert into public.calls (conversation_id, caller_id, callee_id, type) values (%L, %L, %L, ''audio'')', public._g('dm'), :alice::uuid, :alice::uuid)) like '%calls_distinct_parties%');

select n, name, ok, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) as summary from public._results;
select 'FAIL ' || n || ': ' || name || ' ' || coalesce(detail, '') as failed from public._results where not ok order by n;
