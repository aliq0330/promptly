-- Promptly — Hikâyeler: saatlik saklama/temizlik işi (docs/history/198-*).
--
-- `purge_expired_stories()` (20260920170000) süresi dolan ve saklama süresi geçen hikâyeleri + eski taslakları siler. Erişim
-- kuralları bu işe BAĞLI DEĞİLDİR (süresi dolan hikâye anında aktif listelerden ve yetkisiz erişimden çıkar); bu iş yalnız
-- depolamayı/tabloyu küçük tutar. Uygulama tarayıcıda zamanlayıcı çalıştırmaz.
--
-- Supabase'te `pg_cron` eklentisi varsa saatlik bir iş kurulur (aynı adla ikinci kez kurulmaz). Eklenti yoksa (ör. yerel test
-- PostgreSQL'i) hiçbir şey yapmaz; o durumda iş elle (`select public.purge_expired_stories();`) ya da Dashboard → Integrations →
-- Cron'dan kurulur. Yalnızca ekleyici; `drop` yok. Ayrı dosyadadır ki eklentiyi açmak istemeyen bu dosyayı atlayabilsin.
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron yok: purge_expired_stories zamanlanmadı.';
    return;
  end if;
  execute 'create extension if not exists pg_cron';
  if not exists (select 1 from cron.job where jobname = 'purge-expired-stories') then
    perform cron.schedule('purge-expired-stories', '23 * * * *', 'select public.purge_expired_stories()');
  end if;
end
$cron$;
