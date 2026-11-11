-- RLS: auth.uid() satır başına değil sorgu başına BİR kez hesaplansın (Supabase danışmanı `auth_rls_initplan`, 139 politika).
-- CLAUDE.md §8.13(c) ve docs/history/372-*. Anlam DEĞİŞMEZ: auth.uid() deyim boyunca sabittir (STABLE); `(select auth.uid())`
-- yalnız onu InitPlan olarak bir kez çalıştırır. Politika SİLİNMEZ/yeniden kurulmaz — `alter policy` yalnız ifadeyi değiştirir
-- (komut, roller, permissive/restrictive aynı kalır).
--
-- Yöntem: public şemasındaki her politikanın ayrıştırılmış ifadesinde (pg_policies.qual / with_check) çıplak `auth.uid()`
-- `(select auth.uid())` ile değiştirilir; zaten sarılmış olanlar (`( SELECT auth.uid() AS uid)`) önce işaretlenip korunur.
-- İfade aynı oturumda ayrıştırılıp geri verildiği için (pg_dump'ın yaptığı gibi) arama yolu farkı oluşmaz.
-- Sonda çıplak kalan politika varsa migration HATAYLA durur (yarım iş yok, tek işlem).
--
-- ROLLBACK (gerekirse): gerek yok — ifadeler anlamca aynıdır. Eski metin migration dosyalarındaki ilk tanımlardır.

do $$
declare
  r record;
  keep constant text := '__PROMPTLY_WRAPPED_UID__';
  new_qual text;
  new_check text;
  changed int := 0;
  leftover int;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'
  loop
    new_qual := case when r.qual is null then null else
      replace(replace(replace(r.qual, '( SELECT auth.uid() AS uid)', keep), 'auth.uid()', '(select auth.uid())'), keep, '( SELECT auth.uid() AS uid)') end;
    new_check := case when r.with_check is null then null else
      replace(replace(replace(r.with_check, '( SELECT auth.uid() AS uid)', keep), 'auth.uid()', '(select auth.uid())'), keep, '( SELECT auth.uid() AS uid)') end;

    if new_qual is not null and new_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, new_qual, new_check);
    elsif new_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, new_qual);
    elsif new_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, new_check);
    end if;
    changed := changed + 1;
  end loop;

  select count(*) into leftover
  from pg_policies
  where schemaname = 'public'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)';
  if leftover > 0 then
    raise exception 'rls initplan: % policies still call auth.uid() per row', leftover;
  end if;
  raise notice 'rls initplan: % policies rewritten', changed;
end
$$;
