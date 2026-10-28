# 268 — Sohbet: "+" menüsü, kütüphaneden paylaş, zengin içerik kartı, Kişi bilgisi

**Durum: uygulandı (repoda). Yalnız istemci kodu, migration yok.** Kullanıcı sohbet ekranı için dört mockup yönü gördü (A sade · B prompt odaklı · C görsel+tepkiler · D sekmeli), A'nın yazma alanını + B'nin zengin içerik kartını seçti ve WhatsApp "Kişi bilgisi" ekranına benzer bir panel, "+" menüsü ve kütüphaneden paylaşma istedi.

## Kullanıcı gözüyle
- **Yazma alanı (A):** `[+] [ mesaj … 😊 ] [↑]`. Büyük "Gönder" düğmesi kalktı, yerine boşken soluk yuvarlak gönder simgesi geldi.
- **"+" alt sayfası:** Fotoğraf yükle (mevcut fotoğraf hazırlama hattı) · Prompt içe aktar (mevcut `ImportPromptsModal`; sonuç özel taslak) · **Kütüphaneden paylaş**: Prompt · İstek · Workflow · Hazır ayar · Space.
- **Kütüphaneden paylaş seçicisi** (`ChatLibraryPicker`): tür sekmeleri + başlık araması + tek seçim + "{Tür} ekle". Seçilen içerik, derin bağlantıyla gelen paylaşımla AYNI yoldan mesaja eklenir (`?share<Tür>Id=` → "Paylaşılıyor: …" bandı → not yaz → gönder; × ile vazgeç). Liste, "Oluştur → Var olan içeriği paylaş"ın (`ShareExistingModal`) kullandığı kaynaktan gelir: `useShareableContent` / `fetchOwnShareableContentWindow` — yalnız kendi yayında + herkese açık içerik (alıcının okuyamayacağı özel içerik listelenmez).
- **Space paylaşımı** (yeni): mesajlarda Space için gömülü sütun yok; Workflow/Hazır ayar gibi başlık + bağlantı bloğu (`space-share-format.ts`) olarak gider, okuyanda `SharedSpaceCard` çizilir; okunamayan Space "Sayfa gizli veya kaldırılmış".
- **Zengin içerik kartı (B):** kapak + üstünde tür çipi, başlık (Bricolage), sahip adı, iki satır açıklama, **İçeriği aç** düğmesi ve (prompt/workflow/hazır ayar için) **Kaydet** (mevcut `SaveButton` + koleksiyon penceresi; istek ve Space kaydedilmez).
- **Kişi bilgisi** (birebir sohbet; başlıkta kişiye dokununca): telefonda tam ekran, geniş ekranda sağdan panel. Büyük avatar · ad · `@kullanıcıadı`; Ara (sohbet içi aramayı açar) · Profil; **Paylaşılan fotoğraflar** (4 küçük resim + sayı; dokununca o mesaja atlar); Yıldızlı mesajlar (sayı, `/messages/starred`'a bağlanır); Sabit mesajlar (sayı, ilkine atlar); Arşivle/Arşivden çıkar · Mesajları temizle · Sohbeti sil (⋮ menüsüyle AYNI onay pencereleri) · Engelle (iki adımlı) · Şikâyet et. Grup/topluluk sohbetinin başlığı bu paneli AÇMAZ (kendi bilgi penceresi var).

## Kodda
- `features/messages/chat-attach.tsx` (`ChatAttachSheet`, `ChatLibraryPicker`, `LIBRARY_TYPES`), `message-composer.tsx` (yeni yazma alanı, `onPickLibrary`/`onImport`), `local-conversation-view.tsx` (`shareSpaceId`, `attachLibraryItem`, `contactOpen`, başlıkta Link → düğme), `contact-info-panel.tsx`, `space-share-format.ts`, `shared-content-card.tsx` (`SharedCard` yeniden yazıldı + `SharedSpaceCard`), `message-bubble.tsx` (Space bloğu ayrıştırma).
- `lib/supabase/messages.ts` `fetchConversationPhotos`: en yeni 100 medya mesajı (`attachments @> [{}]`), kişisel "temizle" (`cleared_at`) ve "benden sil" (`message_hidden_for`) ile silinmiş mesajlar HARİÇ — görünmeyen mesajın içeriği hiçbir yolla gösterilmez. 100'e varırsa sayı "100+" yazılır.
- i18n: `messages.attach.*`, `messages.library.*`, `messages.contact.*`, `messages.openSpace` (TR+EN eklendi).
- Test: `tests/messaging-ui/run-chat-library.mjs` (14 senaryo; `mock.mjs`: `attachments cs.` + `deleted_at is.null` süzgeci, `blocks` POST/DELETE). `run-shared-cards.mjs` yeni kart düzenine uyarlandı (sahip adı ayrı satır, tür çipi `data-shared-type`, `a[data-shared-open]`).

## Bilinçli sınırlar / açık
- **"Etkileşimler" (karşılıklı beğeni/yorum/paylaşım sayıları) ve "Ortak topluluklar" YOK:** sekiz hedef sütunlu beğeni/yorum tablolarında iki kişi arası sayım tek RPC ister (migration + SQL testi) — ayrı iş. Panelde "Paylaşılan içerikler" listesi de yok (sohbetteki paylaşımlar kartlar olarak mesaj akışında).
- Birebir sohbet için **Bildirimler / sessize alma YOK** (yalnız gruplarda var; `conversation_members.muted_at` birebirde kullanılmıyor).
- Seçici yalnız KENDİ içeriğini listeler (Kaydettiklerim/Taslaklar yok): başkasının içeriği ya da özel taslak alıcıya açılmaz. Seçici "Ekle" der ve mesaja ekler (hemen göndermez) — not yazılabilsin diye.
- Prompt içe aktarma, içeriği özel taslak olarak ekler; sohbete hemen paylaşılamaz (önce yayınlanmalı).
- Space mesajda düz metin bloğu olarak gider; eski istemci/başka yüzey bu bloğu kart yapmaz, başlık + bağlantı görünür.
- **Doğrulama:** `npx tsc --noEmit` temiz, `npm run lint` 0 hata, `npm test` 544/544, `npm run build` temiz; `run-chat-library` 14/14, `run-shared-cards` 11/11, `run` 24/24, `run-groups` 36/36, `run-chat` 38/38, `run-chat-popovers` 8/8, `run-communities` 66/66, `run-community-posts` 36/36. `run-community-home` 4. senaryo bu işten bağımsız olarak önceden de düşüyor. Gerçek Supabase'e / gerçek telefona / iOS Safari'ye karşı denenmedi; imzalı fotoğraf adresleri taklit sunucudan (gerçek `message-images` bucket'ına karşı denenmedi).
