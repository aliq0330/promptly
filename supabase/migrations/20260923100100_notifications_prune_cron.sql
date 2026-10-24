-- Promptly — eski bildirimleri günlük temizleme işi (docs/history/224-*).
--
-- `prune_old_notifications()` (20260923100000): 90 günden eski OKUNMUŞ ve 180 günden eski tüm bildirimleri siler. Erişim kuralları bu
-- işe bağlı değildir; yalnızca bildirim tablosunun sınırsız büyümesini önler. `pg_cron` yoksa (ör. yerel test PostgreSQL'i) hiçbir şey
-- yapmaz; o durumda `select public.prune_old_notifications();` elle ya da Dashboard → Integrations → Cron'dan kurulur.
-- Yalnızca ekleyici; `drop` yok. Ayrı dosyadadır ki eklentiyi açmak istemeyen bu dosyayı atlayabilsin (20260920170100 ile aynı kalıp).
do $cron$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron yok: prune_old_notifications zamanlanmadı.';
    return;
  end if;
  execute 'create extension if not exists pg_cron';
  if not exists (select 1 from cron.job where jobname = 'prune-old-notifications') then
    perform cron.schedule('prune-old-notifications', '41 3 * * *', 'select public.prune_old_notifications()');
  end if;
end
$cron$;
