# 418 — Sohbet açılırken takılan "Yükleniyor…" + Oluştur menüsünde taşan son satır

Tarih: 2026-11-17. Kaynak: kullanıcının iPhone Safari ekran görüntüleri (yalnız istemci; migration YOK).

## Bulgular ve çözümler

| # | Bulgu | Çözüm |
|---|---|---|
| 1 | Mesajlar'da sohbet açılırken ekran çıplak "Yükleniyor…" yazısında takılabiliyordu: yükleme zinciri (`fetchConversationForUser` → oda → `Promise.all([mesaj sayfası, tepkiler, okundu, yıldızlar])`) `.catch`'siz ve süresizdi — bir istek asılı kalırsa `checked` hiç `true` olmuyordu. Ayrıca getirme fonksiyonları ağ hatasını YUTUYORDU: konuşma "bulunamadı", mesaj sayfası boş sohbet gibi görünüyordu | Yükleme `withTimeout` (`lib/with-timeout.ts`, `CHAT_LOAD_TIMEOUT_MS` = 20 sn) ile sınırlı; açılışta `fetchConversationForUser`/`fetchMessagePage` `strict` modda hatayı fırlatır (diğer çağıranlar eskisi gibi yutar); hata/zaman aşımı → yeni `ChatLoadFailed` ("Sohbet yüklenemedi" + "Tekrar dene" + "Mesajlara Dön"). "Konuşma bulunamadı" yalnız sunucunun net cevabıdır. Geç dönen sonuç ekranı ezmez (durum yalnız yarışı kazanınca yazılır) |
| 2 | Yükleme efekti `[id, user]`'a bağlıydı: oturum belirteci yenilenip `user` nesnesi değişince (aynı kişi) açık sohbet `setChecked(false)` ile baştan yükleniyor, "Yükleniyor…" yeniden çıkıyordu | Bağımlılık `userId` (`user?.id`) |
| 3 | Yükleme ekranı sohbet iskeleti değil çıplak metindi | `ChatLoadingSkeleton` (üst çubuk + baloncuklar, tek `role="status"` metni, yeni sohbet taslağı da kullanır) — `features/messages/chat-load-state.tsx` |
| 4 | Oluştur menüsü (`CreateMenuSheet`) telefonda en alttaki "Var olan içeriği paylaş" satırı kartın dışına taşıyordu: `Modal` kartı `max-h` ile sınırlıyor ama kart `flex-col overflow-hidden` değildi ve gövde kaymıyordu; ayrıca `Modal`'ın verdiği alt boşluğa ek güvenli alan dolgusu yazılmıştı (CLAUDE.md "sabit alt boşluk ekleme") | Kart `flex flex-col overflow-hidden`; başlık `shrink-0`, liste `min-h-0 flex-1 overflow-y-auto`; ek güvenli alan dolgusu kalktı |

## Benzer kalıp taraması

- `DialogShell`/`Modal` kartları: çok satırlıların hepsi ya `flex max-h … overflow` ya da iç kaydırmalı; kısa onay pencereleri taşmaz. Başka taşan kart bulunmadı.
- Düzenleyici/profil yüklemeleri (`workflow-editor`, `skill-editor`, `preset-editor`, `own-profile-provider`): getirme fonksiyonları hatayı yutup `null` döndürdüğü için sonsuz yükleme riski yok; dokunulmadı.

## Test

`src/lib/with-timeout.test.ts` (4) + `tests/messaging-ui/run-chat-load.mjs` (ağ taklitli, 6 senaryo; asılı istek `page.clock` ile 20 sn ileri sarılır): iskelet; mesaj sayfası hatası → "Sohbet yüklenemedi" → Tekrar dene → açılır; kullanıcı nesnesi değişince yeniden yükleme yok; Oluştur menüsü kısa ekranda (başlık sabit, son satır kartın içinde) ve uzun ekranda. Gerçek Supabase'e/iPhone'a KARŞI DENENMEDİ.

İngilizce karşılıklar eklendi: `messages.chatLoadFailedTitle/Body`.
