-- Rahatsız etme saatleri — DB/RPC/tetikleyici testi (docs/history/435-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/notification-quiet-hours.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
set jit = off;
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby')) as u(id, name);

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

-- 1. Varsayılan: kayıt yok → kapalı, 23:00–08:00, UTC
set role authenticated;
select public._as_user(:alice);
select public._check(1, 'kayıt yokken varsayılan: kapalı 1380–480 UTC',
  (select not enabled and start_minute = 1380 and end_minute = 480 and tz = 'UTC' from public.get_my_quiet_hours()));
reset role;
select public._check(2, 'kayıt yokken sessiz saat değil', not public._in_quiet_hours(:alice::uuid, '2026-11-18 23:30+00'));

-- 2. Yazma + okuma
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(true, 1380, 480, 'Europe/Istanbul');
select public._check(3, 'yazılan ayar okunur',
  (select enabled and start_minute = 1380 and end_minute = 480 and tz = 'Europe/Istanbul' from public.get_my_quiet_hours()));
reset role;

-- 3. Pencere: gece yarısını aşan (23:00 → 08:00, İstanbul = UTC+3)
select public._check(4, '23:30 yerel (20:30 UTC) sessiz', public._in_quiet_hours(:alice::uuid, '2026-11-18 20:30+00'));
select public._check(5, '03:00 yerel (00:00 UTC) sessiz', public._in_quiet_hours(:alice::uuid, '2026-11-19 00:00+00'));
select public._check(6, '07:59 yerel sessiz', public._in_quiet_hours(:alice::uuid, '2026-11-19 04:59+00'));
select public._check(7, '08:00 yerel sessiz DEĞİL (bitiş hariç)', not public._in_quiet_hours(:alice::uuid, '2026-11-19 05:00+00'));
select public._check(8, '12:00 yerel sessiz değil', not public._in_quiet_hours(:alice::uuid, '2026-11-19 09:00+00'));
select public._check(9, '23:00 yerel sessiz (başlangıç dahil)', public._in_quiet_hours(:alice::uuid, '2026-11-18 20:00+00'));
select public._check(10, '22:59 yerel sessiz değil', not public._in_quiet_hours(:alice::uuid, '2026-11-18 19:59+00'));

-- 4. Aynı gün içindeki pencere (13:00 → 15:30) ve saat dilimi
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(true, 780, 930, 'America/New_York');
reset role;
select public._check(11, 'gün içi pencere: 14:00 New York (19:00 UTC, kış saati) sessiz', public._in_quiet_hours(:alice::uuid, '2026-11-18 19:00+00'));
select public._check(12, 'gün içi pencere: 15:30 New York sessiz değil', not public._in_quiet_hours(:alice::uuid, '2026-11-18 20:30+00'));
select public._check(13, 'gün içi pencere: 12:59 New York sessiz değil', not public._in_quiet_hours(:alice::uuid, '2026-11-18 17:59+00'));

-- 5. Kapalı ve başlangıç = bitiş
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(false, 780, 930, 'America/New_York');
reset role;
select public._check(14, 'kapalıyken pencere içinde bile sessiz değil', not public._in_quiet_hours(:alice::uuid, '2026-11-18 19:00+00'));
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(true, 600, 600, 'UTC');
reset role;
select public._check(15, 'başlangıç = bitiş: boş pencere, sessiz değil', not public._in_quiet_hours(:alice::uuid, '2026-11-18 10:00+00'));

-- 6. Doğrulama
set role authenticated;
select public._as_user(:alice);
select public._check(16, 'saat dilimi geçersizse reddedilir', public._try($$select public.set_my_quiet_hours(true, 0, 60, 'Mars/Olympus')$$) like '%invalid_timezone%');
select public._check(17, 'dakika aralık dışıysa reddedilir', public._try($$select public.set_my_quiet_hours(true, 1440, 60, 'UTC')$$) like '%invalid_quiet_hours%');
select public._check(18, 'eksik argüman reddedilir', public._try($$select public.set_my_quiet_hours(null, 0, 60, 'UTC')$$) like '%invalid_quiet_hours%');
select public._check(19, 'boş saat dilimi UTC olur', (select tz from public.set_my_quiet_hours(false, 0, 60, '  ')) = 'UTC');
select public._as_user('');
reset role;
set role anon;
select public._check(20, 'ziyaretçi okuyamaz', public._try('select * from public.get_my_quiet_hours()') like '%permission denied%');
select public._check(21, 'ziyaretçi yazamaz', public._try($$select public.set_my_quiet_hours(true, 0, 60, 'UTC')$$) like '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:alice);
select public._check(22, 'tabloya doğrudan erişim yok (okuma)', public._try('select * from public.notification_quiet_hours') like '%permission denied%');
select public._check(23, 'tabloya doğrudan yazma yok', public._try($$update public.notification_quiet_hours set enabled = false$$) like '%permission denied%');
select public._check(24, 'iç yardımcı istemciye kapalı', public._try($$select public._in_quiet_hours(gen_random_uuid())$$) like '%permission denied%');
reset role;

-- 7. Başkasının ayarı etkilenmez
set role authenticated;
select public._as_user(:bobby);
select public._check(25, 'bobby kendi varsayılanını görür', (select not enabled from public.get_my_quiet_hours()));
reset role;

-- 8. Tetikleyici: sessiz saatte gelen bildirim Telegram'a gitmez (push_suppressed), bildirim yine yazılır
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(true, 0, 1439, 'UTC');  -- gün boyu (00:00–23:59) sessiz
reset role;
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href)
values ('e0000000-0000-4000-8000-000000000001', :alice, :bobby, 'comment', 'yorum', '/prompts/local?id=p1&hl=comment:c1');
select public._check(26, 'sessiz saatte gelen bildirim yazılır', exists (select 1 from public.notifications where id = 'e0000000-0000-4000-8000-000000000001'));
select public._check(27, 'sessiz saatte push_suppressed = true', (select push_suppressed from public.notifications where id = 'e0000000-0000-4000-8000-000000000001'));
-- Telegram'a gitmeyen tür de işaretlenir (sessiz saat türden bağımsızdır)
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href)
values ('e0000000-0000-4000-8000-000000000002', :alice, :bobby, 'like', 'beğendi', '/prompts/local?id=p1');
select public._check(28, 'sessiz saatte beğeni de bastırılır', (select push_suppressed from public.notifications where id = 'e0000000-0000-4000-8000-000000000002'));
-- Pencere dışı / kapalı: işaretlenmez
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(false, 0, 1439, 'UTC');
reset role;
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href)
values ('e0000000-0000-4000-8000-000000000003', :alice, :bobby, 'comment', 'yorum 2', '/prompts/local?id=p1&hl=comment:c2');
select public._check(29, 'kapalıyken push_suppressed = false', not (select push_suppressed from public.notifications where id = 'e0000000-0000-4000-8000-000000000003'));
-- Başkasının sessiz saati alıcıyı etkilemez
set role authenticated;
select public._as_user(:alice);
select public.set_my_quiet_hours(true, 0, 1439, 'UTC');
reset role;
insert into public.notifications (id, recipient_id, actor_id, type, message, target_href)
values ('e0000000-0000-4000-8000-000000000004', :bobby, :alice, 'comment', 'yorum 3', '/prompts/local?id=p1&hl=comment:c3');
select public._check(30, 'alıcı bobby: alice''in sessiz saati işlemez', not (select push_suppressed from public.notifications where id = 'e0000000-0000-4000-8000-000000000004'));
-- Yedek zamanlayıcı yolu bastırılmış satırı almaz
select public._check(31, 'sessiz saatte bastırılan bildirim Telegram bekleyenlerinde yok',
  not exists (select 1 from public._telegram_pending(:alice::uuid, 50) p where p.id = 'e0000000-0000-4000-8000-000000000001'),
  coalesce((select 'imza: ' || pg_get_function_result('public._telegram_pending(uuid, integer)'::regprocedure)), ''));

-- 9. Hesap silme
select public._check(32, 'profil silinince ayar satırı da silinir (ON DELETE CASCADE)', exists (
  select 1 from pg_constraint where conrelid = 'public.notification_quiet_hours'::regclass and contype = 'f' and confdeltype = 'c'
    and confrelid = 'public.profiles'::regclass));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
