-- Topluluk bildirimleri ölçek testi (docs/history/258-*): duyuru / etkinlik / kapat-aç büyük toplulukta TEK toplu insert ile çalışır,
-- sınıf kuralları (direct / important / info) döngüdeki `_community_notify` ile aynıdır, olay başına en çok 20 000 üyeye bildirim yazılır
-- (sohbette yakın zamanda okuyanlar öncelikli) ve işlem sorgu zaman aşımı içinde biter.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-notify-scale.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set N 30000

insert into auth.users (id, email, raw_user_meta_data) values (:alice, 'alice@test.dev', '{"username":"alice","display_name":"Alice"}');
-- 30 000 üye (süper kullanıcı toplu kurulumu).
insert into auth.users (id, email, raw_user_meta_data)
select ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'm' || i || '@test.dev', jsonb_build_object('username', 'm' || i, 'display_name', 'M' || i)
from generate_series(1, :N) i;

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
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

set role authenticated;
select public._as_user(:alice);
create temp table _c as select public.create_community('Büyük', 'd', 'public', null, 50, '{}'::uuid[], 'image', 'members', 'members', null, false) as j;
reset role;
insert into public._ctx select 'g', j->>'group_id' from _c;

-- Üyeler: hepsi 'important' (varsayılan düzey) ve okumamış; üçü yakın zamanda okumuş (öncelik), biri sessize almış, biri 'none', biri yalnız önemli.
insert into public.conversation_members (conversation_id, user_id, role)
select (select v::uuid from public._ctx where k = 'g'), ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'member'
from generate_series(1, :N) i;
update public.conversation_members set last_read_at = now() where conversation_id = (select v::uuid from public._ctx where k = 'g')
  and user_id in ('90000000-0000-4000-8000-000000030000', '90000000-0000-4000-8000-000000029999', '90000000-0000-4000-8000-000000029998');
update public.conversation_members set notify_level = 'none' where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = '90000000-0000-4000-8000-000000029998';
update public.conversation_members set notify_muted_until = now() + interval '1 day' where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = '90000000-0000-4000-8000-000000029999';
select set_config('promptly.t0', clock_timestamp()::text, false);

-- 1. Duyuru ('important'): tek çağrı, sorgu zaman aşımı içinde.
set role authenticated;
select public._as_user(:alice);
select set_config('promptly.t0', clock_timestamp()::text, false);
select public.publish_community_announcement((select v::uuid from public._ctx where k = 'g'), 'Büyük duyuru', 'gövde', false, true, false) as ann \gset
select extract(epoch from clock_timestamp() - current_setting('promptly.t0')::timestamptz) * 1000 as ms \gset
reset role;
select public._check(1, 'duyuru ' || :N || ' üyeli toplulukta sorgu zaman aşımından (8 sn) çok önce biter', :ms < 8000, :ms::text || ' ms');
select public._check(2, 'duyuru bildirimi olay başına en çok 20 000 üyeye yazılır (sınır)',
  (select count(*) from public.notifications where message like '%yeni duyuru%') = 20000,
  (select count(*)::text from public.notifications where message like '%yeni duyuru%'));
select public._check(3, 'sohbette yakın zamanda okuyan üye (öncelik) bildirim alır; sınırın dışında kalan okumamış üye almaz',
  exists (select 1 from public.notifications where recipient_id = '90000000-0000-4000-8000-000000030000' and message like '%yeni duyuru%')
  and (select count(*) from public.notifications where message like '%yeni duyuru%' and recipient_id in
        (select user_id from public.conversation_members where conversation_id = (select v::uuid from public._ctx where k = 'g') and last_read_at is null)) = 19999);
select public._check(4, '''important'': düzeyi none olan ya da sessize alan üye almaz',
  not exists (select 1 from public.notifications where recipient_id in ('90000000-0000-4000-8000-000000029998', '90000000-0000-4000-8000-000000029999') and message like '%yeni duyuru%'));
select public._check(5, 'duyuru yazarına (eylemi yapana) bildirim gitmez', not exists (select 1 from public.notifications where recipient_id = :alice));
select public._check(6, 'bildirim türü/adresi/yazarı doğru',
  (select count(*) from public.notifications where message like '%yeni duyuru%' and type = 'system' and actor_id = :alice and target_href like '/communities/local?id=%&tab=overview') = 20000);

-- 2. Etkinlik ('info'): yalnız düzeyi 'all' olan ve sessize almamış üye. Varsayılan düzey 'all' → önce hepsi 'important'a çekilir.
update public.conversation_members set notify_level = 'important' where conversation_id = (select v::uuid from public._ctx where k = 'g') and notify_level = 'all';
set role authenticated;
select public._as_user(:alice);
select public.create_community_event((select v::uuid from public._ctx where k = 'g'), 'Büyük etkinlik', null, now() + interval '2 days', null) as evt \gset
reset role;
select public._check(7, '''info'' (etkinlik): hiç kimse ''all'' düzeyinde değilse kimseye gitmez',
  (select count(*) from public.notifications where message like '%yeni etkinlik%') = 0);
update public.conversation_members set notify_level = 'all' where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = '90000000-0000-4000-8000-000000030000';
set role authenticated;
select public._as_user(:alice);
select public.create_community_event((select v::uuid from public._ctx where k = 'g'), 'İkinci etkinlik', null, now() + interval '3 days', null) as evt2 \gset
reset role;
select public._check(8, '''info'': yalnız düzeyi ''all'' olan üye bildirim alır',
  (select count(*) from public.notifications where message like '%İkinci etkinlik%') = 1
  and exists (select 1 from public.notifications where recipient_id = '90000000-0000-4000-8000-000000030000' and message like '%İkinci etkinlik%'));

-- 3. Kapat / yeniden aç ('direct'): düzeyden bağımsız, sınırlı; yeniden açma da bildirir (aynı saniyede olsa bile: ayrı tekilleştirme anahtarı).
set role authenticated;
select public._as_user(:alice);
select public.close_community((select v::uuid from public._ctx where k = 'g'));
select public.reopen_community((select v::uuid from public._ctx where k = 'g'));
reset role;
select public._check(9, '''direct'' (kapat / yeniden aç): düzeyi none olan üye de alır; her olay en çok 20 000',
  (select count(*) from public.notifications where message like '%topluluğu kapatıldı%') = 20000
  and (select count(*) from public.notifications where message like '%topluluğu yeniden açıldı%') = 20000
  and exists (select 1 from public.notifications where recipient_id = '90000000-0000-4000-8000-000000029998' and message like '%kapatıldı%'));

-- 4. Bağlantı kuralı: istemcinin çağıramayacağı iç fonksiyon.
select public._check(10, 'iç fonksiyon istemciye kapalı (authenticated/anon/public EXECUTE yok)',
  not has_function_privilege('authenticated', 'public._community_notify_members(uuid, uuid, text, text, text, text, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public._community_notify_members(uuid, uuid, text, text, text, text, text, integer)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
