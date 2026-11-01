-- ci:allow-destructive
-- (İşaret yalnız aşağıdaki `revoke … truncate` sözcüğü için: bu dosya hiçbir veri/şema SİLMEZ, yalnız YETKİ kısar.)
--
-- Anon (oturumsuz ziyaretçi) sertleştirmesi — docs/history/302-*. İki ayrı, birbirinden bağımsız adım:
--
-- 1) Anon'un public tablolardaki YAZMA yetkileri kaldırılır. Supabase varsayılanı `anon`'a tüm tablolarda insert/update/delete/truncate verir ve geriye
--    yalnız RLS kalır — tek bir yanlış politika bir yazma açığına dönüşürdü. Misafir hiçbir şey yazmaz (yazma eylemleri oturum ister; hiçbir yazma
--    politikası anon'u auth.uid() denetimi olmadan kabul etmiyor — canlıda sorgulandı). SELECT'e dokunulmaz. Yeni tablolar için varsayılan da kısılır.
--    `authenticated` ve `service_role` aynen kalır.
-- 2) `profiles.suspended_reason` ve `profiles.posting_block_reason` (moderatörün yazdığı serbest metin) artık anon ve authenticated tarafından
--    okunamaz: yalnız SECURITY DEFINER yönetici RPC'leri (`admin_users`, `admin_suspend_user`…) okur. İstemci bu iki sütunu doğrudan seçmiyor (canlıda
--    ve kodda doğrulandı); `suspended_until` / `posting_blocked` (var/yok bayrağı) okunur kalır, çünkü INVOKER fonksiyonlar (`suggest_creators`,
--    `enforce_community_content`) bunları arayanın yetkisiyle okuyor.
--    DİKKAT (bilinen tuzak): tablo düzeyindeki SELECT kaldırılıp sütun sütun verildiği için `profiles`'a eklenen YENİ bir sütun anon/authenticated
--    tarafından okunamaz — migration'ında açıkça `grant select (yeni_sütun) on public.profiles to anon, authenticated;` yaz.
--    `supabase/tests/anon-hardening.sql` bunu denetler. `select *` (ya da `profiles(*)`) artık hata verir; istemci hep açık sütun listesi kullanır.

revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;

revoke select on public.profiles from anon, authenticated;
do $$
declare
  v_cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('suspended_reason', 'posting_block_reason');
  execute 'grant select (' || v_cols || ') on public.profiles to anon, authenticated';
end $$;

notify pgrst, 'reload schema';
