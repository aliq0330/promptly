# 446 — Paylaş penceresi: "Kişiler önce" düzeni

**Sorun.** Paylaş penceresindeki önizleme kartı içeriğin açıklamasını tamamen gösteriyordu (`line-clamp-1` ile aynı öğede `block` olduğundan kırpma hiç çalışmıyordu) ve pencerenin yarısını kaplayıp asıl işleri (Alıntıla, mesaj, bağlantı) aşağı itiyordu. Mesaj göndermek iki pencere sürüyordu (Paylaş → Mesaj → sohbet seçici sayfası).

**Karar.** Kullanıcı mockup'larından "Kişiler önce → B" yönünü seçti (dört sütunlu ızgara; seçim yokken altta eylemler, biri seçilince alt satır not alanı + gönder düğmesi). Öncelik: **sık yazışılan ve son mesajlaşılan sohbetler**; **topluluk sohbetleri ve ekip kanalları** da hedeftir.

## Ne değişti
- `ShareModal` (`features/prompts/share-modal.tsx`): önizleme kartı kalktı, yerine tek satırlık içerik çipi (tür · başlık; açıklama yok). "Kendin için" bölümü ve üç ayrı satır (mesaj/hikâye/bağlantı) kalktı; eylemler tek simge satırıdır: **Bağlantı · Alıntıla · Hikâye · Space · Koleksiyon** (`ShareAction`). Alıntıla `QuoteSection`'ın `hideTrigger` + denetimli `open` kipiyle ikinci pencereyi açar (338 kuralı korunur). Ziyaretçi eskisi gibi yalnız "Diğer uygulamalarla paylaş" satırını görür.
- `SharePeople` (`features/prompts/share-people.tsx`): arama + 4 sütunlu hedef ızgarası (ilk 7 + "Tümü" karosu). Kimse seçili değilken altta eylem satırı, seçilince not alanı + "Gönder · N". En çok 10 sohbet. Hedefler sırayla gönderilir; her hedefin sonucu ayrı tutulur (gönderilen ✓ ve pasif, başarısız seçili kalır, "tekrar dene"); hepsi giderse 1,2 sn sonra pencere kapanır. "Tümü" = mevcut `/messages?share…=` sohbet seçici (yeni sohbet başlatmak için).
- `lib/share-targets.ts` (saf, birim testli): uygunluk (kabul edilmiş, silinmemiş, arşivsiz; kapalı ya da "yalnız yönetim yazar" topluluk ve üyenin yazamadığı kanal hedef değil — sunucudaki `can_send_message` aynası, son karar sunucuda) + **sıra puanı**: sabitlenen (+30) · son mesaj (40 × 0,5^(gün/14)) · bu cihazdan paylaşım sayısı (en çok 10 × 3) · okunmamış (+4) · sessiz (−4); beraberlikte en yeni mesaj, sonra kimlik.
- `features/messages/share-message.ts`: sohbete gidecek paylaşımın TEK kuralı (`composeShareMessage`, `shareRefFromQuery`); `LocalConversationView.composeOutgoingBody` artık onu kullanır (beş ayrı `compose…ShareBody` dalı oradan kalktı, davranış aynı).
- Metinler `translations-share-people.ts` (`share.people.*`, `share.action.*`), TR + EN; `node scripts/build-i18n.mjs` çalıştırıldı.

## Bilinen sınırlar (dürüst not)
- **"Sık yazışılan" sinyali yalnızca bu cihazdaki paylaşım sayacıdır** (`localStorage` `promptly-share-counts`, ≤60 sohbet, sunucuya yazılmaz). Sunucuda konuşma başına mesaj sayısı tutulmadığı için gerçek "sık yazışma" sıklığı yok; son mesaj zamanı + sabitleme + bu sayaç kullanılır. Gerçek sıklık istenirse ayrı bir RPC/sayaç gerekir (yapılmadı).
- Izgara yalnız **var olan sohbetleri** listeler; hiç yazışılmamış biriyle başlamak için "Tümü" → mevcut sohbet seçici.
- Ekip kanalı her kanal ayrı hedeftir ("Ekip · kanal"); ekip satırı tek karoya toplanmaz.
- Topluluk sohbetinde oda seçimi yok: mesaj varsayılan odaya (Genel) gider.
- Gerçek Supabase'e / fiziksel cihaza karşı DENENMEDİ (ağ taklitli Playwright).

## Testler
- `src/lib/share-targets.test.ts` (8): sıralama, sıklık, sabitleme, hedef türleri, uygunluk, beraberlik, süzgeç, sayaç bozuk veri/budama.
- `tests/messaging-ui/run-share-people.mjs` (12 senaryo): hedefler + yetkisiz topluluk yok + küçük önizleme, seçim ↔ eylem satırı, çoklu gönderim (kişi + topluluk + ekip kanalı) + not, notsuz gönderim, kısmi hata + yeniden deneme, arama + "Tümü", sıralama, yerel sayaç, bağlantı kopyalama, Alıntıla, İngilizce, masaüstü ızgarası.
- Eski testler yeni seçicilere taşındı: `run-quotes`, `run-skills-social`, `run-space-posts`, `run-community-posts`.
