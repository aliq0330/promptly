-- "Profilde sabitle" (profile_pins + set_profile_pin; docs/history/480-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/profile-pins.sql  ("FAILED=0" beklenir).
-- alice = sabitleyen; bobby = başkası; ziyaretçi (anon) ayrıca denenir.
\pset pager off
\set ON_ERROR_STOP off
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

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('b1000000-0000-4000-8000-000000000001', :alice, 'P1', 'd', 'm', 'text', 'published', 'public'),
  ('b1000000-0000-4000-8000-000000000002', :alice, 'P2', 'd', 'm', 'text', 'published', 'public'),
  ('b1000000-0000-4000-8000-000000000003', :alice, 'P3', 'd', 'm', 'text', 'published', 'public'),
  ('b1000000-0000-4000-8000-000000000004', :alice, 'P4', 'd', 'm', 'text', 'published', 'public'),
  ('b1000000-0000-4000-8000-000000000005', :alice, 'Gizli', 'd', 'm', 'text', 'published', 'private'),
  ('b1000000-0000-4000-8000-000000000006', :alice, 'Taslak', 'd', 'm', 'text', 'draft', 'public'),
  ('b1000000-0000-4000-8000-000000000007', :bobby, 'Bobby', 'd', 'm', 'text', 'published', 'public');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility) values
  ('b2000000-0000-4000-8000-000000000001', :alice, 'İstek', 'd', false, 'public');

select public._as_user(:alice);
set role authenticated;
select public._check(1, 'yayında + herkese açık kendi promptu sabitlenir', (select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000001', true)));
select public._check(2, 'aynı sabiti tekrar sabitlemek hata değil, satır çoğalmaz',
  (select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000001', true))
  and (select count(*) = 1 from public.profile_pins where user_id = :alice));
select public._check(3, 'başkasının promptu sabitlenemez', public._try($q$select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000007', true)$q$) like '%content_not_found%');
select public._check(4, 'gizli prompt sabitlenemez', public._try($q$select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000005', true)$q$) like '%content_not_found%');
select public._check(5, 'taslak prompt sabitlenemez', public._try($q$select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000006', true)$q$) like '%content_not_found%');
select public._check(6, 'olmayan içerik sabitlenemez', public._try($q$select public.set_profile_pin('prompt', '00000000-0000-4000-8000-000000000000', true)$q$) like '%content_not_found%');
select public._check(7, 'geçersiz tür reddedilir', public._try($q$select public.set_profile_pin('space', 'b1000000-0000-4000-8000-000000000001', true)$q$) like '%invalid_pin%');
select public._check(8, 'farklı türden içerik de sabitlenir (istek)', (select public.set_profile_pin('request', 'b2000000-0000-4000-8000-000000000001', true)));
select public._check(9, 'üçüncü sabit olur', (select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000002', true)));
select public._check(10, 'dördüncü sabit pin_limit ile reddedilir', public._try($q$select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000003', true)$q$) like '%pin_limit%');
select public._check(11, 'sınırdayken zaten sabit olanı yeniden sabitlemek hata vermez', (select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000001', true)));
select public._check(12, 'sabit kaldırılır, dönüş false', (select not public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000002', false)));
select public._check(25, 'kaldırınca satır gerçekten silinmiştir', (select count(*) = 2 from public.profile_pins where user_id = :alice));
select public._check(13, 'olmayan sabiti kaldırmak hata değil', (select not public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000004', false)));
select public._check(14, 'kaldırınca yeni sabit yeri açılır', (select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000004', true)));
select public._check(15, 'istemci tabloya doğrudan yazamaz', public._try($q$insert into public.profile_pins (user_id, prompt_id) values ('11111111-1111-4111-8111-111111111111', 'b1000000-0000-4000-8000-000000000003')$q$) like '%permission denied%');
select public._check(16, 'istemci tablodan silemez', public._try($q$delete from public.profile_pins$q$) like '%permission denied%');

-- Okuma: başkası + ziyaretçi herkese açık içeriğin sabitini görür.
select public._as_user(:bobby);
select public._check(17, 'başkası alice''in herkese açık sabitlerini okur', (select count(*) = 3 from public.profile_pins where user_id = :alice));
reset role;
select public._as_user('');
set role anon;
select public._check(18, 'ziyaretçi herkese açık sabitleri okur', (select count(*) = 3 from public.profile_pins where user_id = :alice));
select public._check(19, 'ziyaretçi sabit RPC''sini çalıştıramaz', public._try($q$select public.set_profile_pin('prompt', 'b1000000-0000-4000-8000-000000000001', true)$q$) like '%permission denied%');

-- İçerik sonradan gizlenirse sabiti başkasına görünmez, sahibine görünür.
reset role;
select public._as_user(:alice);
set role authenticated;
update public.prompts set visibility = 'private' where id = 'b1000000-0000-4000-8000-000000000004';
reset role;
select public._as_user(:bobby);
set role authenticated;
select public._check(20, 'gizlenen içeriğin sabiti başkasına görünmez', (select count(*) = 2 from public.profile_pins where user_id = :alice));
reset role;
select public._as_user(:alice);
set role authenticated;
select public._check(21, 'sahibi gizlenen içeriğin sabitini yine görür', (select count(*) = 3 from public.profile_pins where user_id = :alice));

-- İçerik silinince sabit CASCADE ile gider.
reset role;
select public._as_user('');
delete from public.prompts where id = 'b1000000-0000-4000-8000-000000000001';
select public._check(22, 'içerik silinince sabit de silinir', (select count(*) = 2 from public.profile_pins where user_id = :alice));

select public._check(23, 'hedefsiz satır CHECK ile reddedilir', public._try($q$insert into public.profile_pins (user_id) values ('11111111-1111-4111-8111-111111111111')$q$) like '%exactly_one_target%');
select public._check(24, 'iki hedefli satır CHECK ile reddedilir', public._try($q$insert into public.profile_pins (user_id, prompt_id, request_id) values ('11111111-1111-4111-8111-111111111111', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001')$q$) like '%exactly_one_target%');

select n, name, ok, detail from public._results order by n;
select 'FAILED=' || count(*) from public._results where not ok;
