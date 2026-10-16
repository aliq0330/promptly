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

`run-communities.mjs`: Topluluklar ana sayfası (beş sekme + öneriler, arama/kategori/sayfalama/hata durumları), katılım (kurallar zorunluysa onay kutusu), davet/başvuru, oluşturma, detay sayfasının rol bazlı sekmeleri ve erişim kapıları (üye olmayan açık/kapalı topluluk), akış (paylaş modalı, özel içeriğin listelenmemesi, düzenle/sil/kaldır/sabitle/raporla), duyurular, etkinlikler (saat dilimi → ISO an, RSVP, iptal), bildirim tercihi, yönetim bölümleri (özet, moderasyon kuyruğu, ayarlar, kapatma, işlem geçmişi), sohbet entegrasyonu (duyuru kartı, topluluğa bağlantı), eski rotalar, İngilizce ve mobil/tablet/koyu tema düzeni; görünürlük (herkese açık/kapalı/tamamen kapalı): tek üyelik düğmesi (Katıl · İstek gönder · Katıldın ▼ → ayrıl), aramadan istek + geri çekme, öneriler, oluşturma/Ayarlar geçişi; gizlilik (ziyaretçi/oturumsuz mod: `installMock(…, { guest: true })`, kart RPC'si, özel bucket signed URL, görünürlük seçici masaüstü/mobil/klavye, sekme yeniden görünür olunca yenileme) (61/61 beklenir). Ağ taklidi: `mock.mjs` + `mock-communities.mjs` (`db.extraRoutes` kancası). Gerçek Supabase'e KARŞI DENENMEDİ — RLS/RPC doğrulaması `supabase/tests/communities.sql`'dedir.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-communities.mjs
ONLY="9" node tests/messaging-ui/run-communities.mjs   # yalnız adı "9" ile başlayan senaryolar
```

## Topluluk gönderisi etkileşimi (`docs/history/178-*`)

`run-community-posts.mjs` (28 senaryo): "Gönderi oluştur" iki seçenekli menüsü (yeni içerik → mevcut oluşturma ekranı `?community=`, mevcut içeriğe başvur), başvuru gönderisi (not var/yok, "Başvurulan içerik", orijinal bağlantısı), yerel/legacy kart, beğeni → `community_post_id` (içeriğe değil), yorum → gönderi kimliği + karışmama, aynı içerik iki toplulukta bağımsız, üye olmayan/kapatılmış topluluk/ziyaretçi, bildirimden açılış (`&post=&hl=comment:`), erişilemeyen içerik, yazar menüsü yetkileri, oluşturma ekranı topluluk bağlamı + görünürlük dili, NORMAL istek formundan yayınlama → `publish_native_community_post`, hata uyarısı, İngilizce, mobil/tablet/koyu tema. Ağ taklidi `mock-communities.mjs` (`prompt_likes` / `prompt_comments` / `publish_native_community_post`). Gerçek Supabase'e KARŞI DENENMEDİ — RLS/RPC doğrulaması `supabase/tests/community-post-engagement.sql`'dedir.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-posts.mjs   # 28/28 beklenir
```

Başvuru sayfası (`docs/history/180-*`): aynı dosyada senaryo 16–16d (sayfa içeriği/not/orijinal bağlantısı/kendi beğeni ve yorumu, içerik erişilemezken sayfa, yerel gönderi yönlenmesi, İngilizce + mobil) ve 10b/10c (bildirim bağlantısı yönlenmesi).

