-- docs/history/302-*: hız sınırı sayacı. Sırrı bilmeyen çağrı HİÇBİR şey yazamaz; doğru sırla pencere/limit doğru çalışır; tablolar istemciye kapalı.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/public-api-rate-limit.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off

create table public._results (n int, name text, ok boolean, detail text);
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
grant execute on function public._check(int, text, boolean, text) to anon, authenticated;
grant insert on public._results to anon, authenticated;

-- 1) Özet tanımlı değilken RPC herkese kapalı.
set role anon;
do $$ begin
  perform * from public.public_api_rate_hit('whatever', 'bucket-aaaaaaaa', 5, 60);
  perform public._check(1, 'no configured secret → forbidden', false, 'no error');
exception when insufficient_privilege then
  perform public._check(1, 'no configured secret → forbidden', true);
end $$;
reset role;

insert into public.public_api_rate_limit_config (secret_hash) values (encode(extensions.digest('s3cret', 'sha256'), 'hex'));

-- 2) Yanlış / boş sır reddedilir ve satır YAZILMAZ.
set role anon;
do $$ begin
  perform * from public.public_api_rate_hit('wrong', 'bucket-attack01', 5, 60);
  perform public._check(2, 'wrong secret → forbidden', false, 'no error');
exception when insufficient_privilege then
  perform public._check(2, 'wrong secret → forbidden', true);
end $$;
do $$ begin
  perform * from public.public_api_rate_hit('', 'bucket-attack02', 5, 60);
  perform public._check(3, 'empty secret → forbidden', false, 'no error');
exception when insufficient_privilege then
  perform public._check(3, 'empty secret → forbidden', true);
end $$;
reset role;
select public._check(4, 'a refused call writes nothing', (select count(*) from public.public_api_rate_limits) = 0);

-- 3) Doğru sırla: limite kadar izin, sonra ret + retry_after; kovalar bağımsız.
set role anon;
create temp table _hits (i int, allowed boolean, hits int, retry int);
grant all on _hits to anon;
-- Her çağrı AYRI ifadedir (gerçek istekler ayrı işlemdir; tek ifadede lateral ile 5 çağrı aynı komut içinde olur ve birbirinin satırını görmez).
insert into _hits select 1, r.allowed, r.hits, r.retry_after from public.public_api_rate_hit('s3cret', 'bucket-user0001', 3, 60) r;
insert into _hits select 2, r.allowed, r.hits, r.retry_after from public.public_api_rate_hit('s3cret', 'bucket-user0001', 3, 60) r;
insert into _hits select 3, r.allowed, r.hits, r.retry_after from public.public_api_rate_hit('s3cret', 'bucket-user0001', 3, 60) r;
insert into _hits select 4, r.allowed, r.hits, r.retry_after from public.public_api_rate_hit('s3cret', 'bucket-user0001', 3, 60) r;
insert into _hits select 5, r.allowed, r.hits, r.retry_after from public.public_api_rate_hit('s3cret', 'bucket-user0001', 3, 60) r;
reset role;
select public._check(5, 'first 3 hits allowed, 4th and 5th refused',
  (select array_agg(allowed order by i) from _hits) = array[true,true,true,false,false], (select array_agg(allowed order by i)::text from _hits));
select public._check(6, 'refusal carries a retry time within the window', (select min(retry) from _hits where not allowed) between 1 and 60);
set role anon;
select public._check(7, 'another bucket is independent', (select allowed from public.public_api_rate_hit('s3cret', 'bucket-user0002', 3, 60)));
reset role;

-- 4) Pencere dolunca sayaç sıfırlanır.
update public.public_api_rate_limits set window_start = now() - interval '2 minutes' where bucket = 'bucket-user0001';
set role anon;
select public._check(8, 'an expired window starts over', (select r.allowed and r.hits = 1 from public.public_api_rate_hit('s3cret', 'bucket-user0001', 3, 60) r));
reset role;

-- 5) Girdi doğrulaması.
set role anon;
do $$ begin
  perform * from public.public_api_rate_hit('s3cret', 'x', 3, 60);
  perform public._check(9, 'a too-short bucket is rejected', false, 'no error');
exception when others then
  perform public._check(9, 'a too-short bucket is rejected', sqlstate = '22023', sqlstate);
end $$;
do $$ begin
  perform * from public.public_api_rate_hit('s3cret', 'bucket-user0003', 3, 999999);
  perform public._check(10, 'an absurd window is rejected', false, 'no error');
exception when others then
  perform public._check(10, 'an absurd window is rejected', sqlstate = '22023', sqlstate);
end $$;
reset role;

-- 6) Tablolar istemciye kapalı (anon + authenticated ne okur ne yazar).
select public._check(11, 'anon and authenticated have no table privileges',
  not has_table_privilege('anon', 'public.public_api_rate_limits', 'SELECT') and not has_table_privilege('authenticated', 'public.public_api_rate_limits', 'SELECT')
  and not has_table_privilege('anon', 'public.public_api_rate_limit_config', 'SELECT') and not has_table_privilege('authenticated', 'public.public_api_rate_limit_config', 'SELECT'));
set role anon;
do $$ begin
  perform count(*) from public.public_api_rate_limit_config;
  perform public._check(12, 'anon cannot read the secret hash', false, 'no error');
exception when insufficient_privilege then
  perform public._check(12, 'anon cannot read the secret hash', true);
end $$;
reset role;
select public._check(13, 'the function is executable by anon only through the secret gate (public revoked)',
  has_function_privilege('anon', 'public.public_api_rate_hit(text,text,integer,integer)', 'EXECUTE'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
