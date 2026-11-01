# Üretilmiş kopya — elle düzenleme

Bu klasör `src/lib/public-api` çekirdeğinin ve onun içe aktardığı saf dosyaların BİREBİR kopyasıdır (Edge Function `api` için;
Supabase deploy'u yalnız `supabase/functions`'ı paketler). Kaynağı değiştir, sonra `node scripts/sync-function-shared.mjs` çalıştır.
`npm test` kopya eskiyse kırılır. Ayrıntı: `docs/history/297-*`.
