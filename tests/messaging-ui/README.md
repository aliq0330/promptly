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

## Grup sohbeti (`docs/history/172-*`)

`run-groups.mjs`: aynı ağ taklidiyle (`mock.mjs`: `db.addGroup`, grup RPC'leri) grup listesi/sohbeti/bilgi penceresi (rol bazlı sekmeler), istek kabul/ret, görünürlük onayı + sonuç özeti, davet/bağlantı, ayarlar, keşif, katılma bağlantısı sayfası, İngilizce, mobil/tablet/koyu tema düzeni. DB/RLS doğrulaması `supabase/tests/chat-groups.sql`'dedir.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-groups.mjs   # 26/26 beklenir
```

## Sohbet geliştirmeleri (`docs/history/174-*`)

`run-chat.mjs`: okundu bilgisi, yazıyor, sabitleme, sohbet içi arama, yıldızlı mesajlar (birebir + grup). Ağ taklidi `mock.mjs` (yeni RPC/tablolar: `mark_conversation_read_up_to`, `message_read_receipts`, `set_message_pinned`, `pinned_messages`, `search_conversation_messages`, `message_stars`, `list_starred_messages`) + **Realtime taklidi** `realtime-hub.mjs` (Phoenix v2 protokolü: `phx_join` yanıtı, broadcast iletimi, `postgres_changes` olayı; birden fazla tarayıcı bağlamı = ayrı oturum). Gerçek Supabase'e/Realtime'a karşı DENENMEDİ — yalnızca istemci mantığını (kanal adı, `private` bayrağı, temizlik, TTL, canlı güncelleme) sınar.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-chat.mjs   # 33/33 beklenir
ONLY="9" node tests/messaging-ui/run-chat.mjs   # yalnız adı "9" ile başlayan senaryolar
```


## Topluluklar (`docs/history/175-*`)

`run-communities.mjs`: Topluluklar ana sayfası (altı sekme, arama/kategori/sayfalama/hata durumları), katılım (kurallar zorunluysa onay kutusu), davet/başvuru, oluşturma, detay sayfasının rol bazlı sekmeleri ve erişim kapıları (üye olmayan açık/kapalı topluluk), akış (paylaş modalı, özel içeriğin listelenmemesi, düzenle/sil/kaldır/sabitle/raporla), duyurular, etkinlikler (saat dilimi → ISO an, RSVP, iptal), bildirim tercihi, yönetim bölümleri (özet, moderasyon kuyruğu, ayarlar, kapatma, işlem geçmişi), sohbet entegrasyonu (duyuru kartı, topluluğa bağlantı), eski rotalar, İngilizce ve mobil/tablet/koyu tema düzeni. Ağ taklidi: `mock.mjs` + `mock-communities.mjs` (`db.extraRoutes` kancası). Gerçek Supabase'e KARŞI DENENMEDİ — RLS/RPC doğrulaması `supabase/tests/communities.sql`'dedir.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-communities.mjs
ONLY="9" node tests/messaging-ui/run-communities.mjs   # yalnız adı "9" ile başlayan senaryolar
```
