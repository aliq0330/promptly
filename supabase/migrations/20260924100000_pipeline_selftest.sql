-- Promptly — yayın boru hattı denemesi (docs/history/226-*): tablo yorumu ekler; davranışa/veriye dokunmaz, tekrar çalıştırılabilir.
-- Amaç: `scripts/apply-migrations.mjs`'in Supabase Management API sürücüsünü GERÇEK projeye karşı ilk kez sınamak.
comment on table public.rate_limit_events is 'Sunucu tarafı hız sınırı olay günlüğü (_rate_limit); yalnız SECURITY DEFINER fonksiyon yazar/okur.';
