-- Arama ayarları: gizlilik (herkes/takip ettiklerim/hiç kimse), cevapsız bildirimi, RLS — DB/RPC testi (docs/history/450-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/call-settings.sql  ("FAIL" satırı beklenmez).
-- Kullanıcılar: alice bobby. DM alice↔bobby (kabul edilmiş).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby')) as u(id, name);

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
grant all on _dm to public;
select public._as_user(:bobby);
update public.conversation_members set status = 'accepted' where user_id = :bobby;
reset role;
insert into public._ctx select 'dm', id::text from _dm;

-- ============================================================================
-- 1. Varsayılanlar ve yazma yolu
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public._check(1, 'varsayılan: herkes arayabilir, cevapsız bildirimi açık', (select privacy = 'everyone' and notify_missed from public.get_my_call_settings()));
select public._check(2, 'istemci call_settings tablosuna doğrudan yazamaz',
  public._try(format('insert into public.call_settings (user_id, privacy) values (%L, ''nobody'')', :bobby::uuid)) ilike '%permission denied%'
  and public._try('update public.call_settings set privacy = ''nobody''') ilike '%permission denied%');
select public._check(3, 'geçersiz gizlilik değeri reddedilir (call_invalid_privacy)', public._try('select public.set_my_call_settings(''everyone-ish'', true)') like '%call_invalid_privacy%');
select public.set_my_call_settings('nobody', true);
select public._check(4, 'set_my_call_settings kaydeder; get geri okur', (select privacy = 'nobody' and notify_missed from public.get_my_call_settings()));
select public._as_user(:alice);
select public._check(5, 'başkasının ayar satırı OKUNAMAZ (RLS)', (select count(*) from public.call_settings) = 0);

-- ============================================================================
-- 2. Gizlilik: hiç kimse / takip ettiklerim / herkes
-- ============================================================================
select public._check(6, 'hiç kimse: arama call_privacy ile reddedilir', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%call_privacy%');
reset role;
select public._check(7, 'hiç kimse: calls satırı oluşmadı', (select count(*) from public.calls) = 0);

set role authenticated;
select public._as_user(:bobby);
select public.set_my_call_settings('following', true);
select public._as_user(:alice);
select public._check(8, 'takip ettiklerim: aranan arayanı takip ETMİYORSA reddedilir', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%call_privacy%');
reset role;
insert into public.follows (follower_id, following_id) values (:alice, :bobby);
set role authenticated;
select public._as_user(:alice);
select public._check(9, 'takip ettiklerim: arayanın aranan kişiyi takip etmesi yetmez (yön aranandan arayana)', public._try(format('select public.call_start(%L, ''audio'')', public._g('dm'))) like '%call_privacy%');
reset role;
insert into public.follows (follower_id, following_id) values (:bobby, :alice);
set role authenticated;
select public._as_user(:alice);
create temp table _c1 as select * from public.call_start(public._g('dm'), 'audio');
grant all on _c1 to public;
select public._check(10, 'takip ettiklerim: aranan arayanı takip ediyorsa arama başlar', (select status = 'ringing' and callee_id = :bobby from _c1));
select public.call_respond((select id from _c1), 'cancel');

-- ============================================================================
-- 3. Cevapsız arama bildirimi tercihi
-- ============================================================================
select public._as_user(:bobby);
select public.set_my_call_settings('everyone', false);
select public._as_user(:alice);
create temp table _c2 as select * from public.call_start(public._g('dm'), 'video');
grant all on _c2 to public;
select public.call_respond((select id from _c2), 'cancel');
reset role;
select public._check(11, 'bildirim kapalı: çağrı missed kaydedilir ama bildirim YAZILMAZ',
  (select status = 'missed' from public.calls where id = (select id from _c2))
  and (select count(*) from public.notifications where dedupe_key = 'call-missed:' || (select id from _c2)::text) = 0);

set role authenticated;
select public._as_user(:bobby);
select public.set_my_call_settings('everyone', true);
select public._as_user(:alice);
create temp table _c3 as select * from public.call_start(public._g('dm'), 'video');
grant all on _c3 to public;
select public.call_respond((select id from _c3), 'cancel');
reset role;
select public._check(12, 'bildirim açık: cevapsız arama bildirimi yazılır',
  (select count(*) from public.notifications where dedupe_key = 'call-missed:' || (select id from _c3)::text and recipient_id = :bobby) = 1);

-- ============================================================================
-- 4. Yetkiler ve indeksler
-- ============================================================================
select public._check(13, 'anon ayar RPC''lerini çağıramaz, tabloyu okuyamaz; authenticated çağırabilir',
  not has_function_privilege('anon', 'public.get_my_call_settings()', 'execute')
  and not has_function_privilege('anon', 'public.set_my_call_settings(text, boolean)', 'execute')
  and not has_table_privilege('anon', 'public.call_settings', 'select')
  and has_function_privilege('authenticated', 'public.set_my_call_settings(text, boolean)', 'execute'));
select public._check(14, 'geçmiş indeksleri var', (select count(*) from pg_indexes where indexname in ('calls_caller_history_idx', 'calls_callee_history_idx')) = 2);

select n, name, ok, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) as summary from public._results;
select 'FAIL ' || n || ': ' || name || ' ' || coalesce(detail, '') as failed from public._results where not ok order by n;
