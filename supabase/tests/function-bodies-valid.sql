-- Tüm SQL dilindeki public fonksiyonlarının gövdesi HÂLÂ geçerli mi? (docs/history/461-*)
-- Sütun/tablo düşüren bir migration, onu adıyla anan LANGUAGE sql fonksiyonları çağrılana kadar sessizce bozar (test paketinde `select _check(...)` hata
-- fırlatınca satır hiç yazılmaz ve "FAILED=0" yanıltır). Bu test her fonksiyonu yeniden tanımlayarak (check_function_bodies=on) yeniden çözümler.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/function-bodies-valid.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
create table public._results (n int, name text, ok boolean, detail text);
set check_function_bodies = on;
do $$
declare r record; bad text[] := '{}'; v_total integer := 0;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prolang = (select oid from pg_language where lanname = 'sql')
  loop
    v_total := v_total + 1;
    begin
      execute pg_get_functiondef(r.oid);
    exception when others then
      bad := bad || (r.sig || ': ' || sqlerrm);
    end;
  end loop;
  insert into public._results values (1, 'her SQL fonksiyonunun gövdesi geçerli (' || v_total || ' fonksiyon)', coalesce(cardinality(bad), 0) = 0 and v_total > 100, coalesce(array_to_string(bad, E'\n'), ''));
end $$;
select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
