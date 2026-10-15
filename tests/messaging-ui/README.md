# Mesajlaşma arayüz testleri (ağ taklitli)

`docs/history/171-*` için: arşiv / liste-silme / geçmiş-temizleme, "Yeni sohbet" penceresi, gizlilik ve engelleme akışları.
Gerçek Supabase'e bağlanmaz — `mock.mjs` PostgREST'in kullanılan kısmını bellekte taklit eder (RLS "yalnız kendi üyelik satırı" kuralı dahil).
DB tarafındaki asıl doğrulama `supabase/tests/conversation-member-state.sql`'dir.

```bash
npm i --no-save playwright            # repoya bağımlılık eklenmez
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run.mjs
```

Son satır `24/24 passed` beklenir (`CHROMIUM_PATH` verilmezse Playwright'ın kendi tarayıcısı kullanılır).
