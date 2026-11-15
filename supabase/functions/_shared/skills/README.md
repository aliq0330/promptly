# Üretilmiş kopya — elle düzenleme

Bu klasör `src/lib/skills` içindeki Skill paketi çekirdeğinin (doğrulama, derleme, yayın akışı) BİREBİR kopyasıdır (Edge Function `skill-package` için;
Supabase deploy'u yalnız `supabase/functions`'ı paketler). Kaynağı değiştir, sonra `node scripts/sync-function-shared.mjs` çalıştır.
`npm test` kopya eskiyse kırılır. Ayrıntı: `docs/history/389-*`.
