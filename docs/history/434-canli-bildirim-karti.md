# 434 — Canlı bildirim kartı (sitedeyken gelen bildirim önizlemesi)

**Neden:** siteyi kullanırken gelen bir bildirimi yalnız zil rozeti ve (açıksa) zil paneli gösteriyordu; kullanıcı rozeti fark etmedikçe bildirimden haberi olmuyordu.
Kullanıcı mockup'ı (artifact: "Canlı Bildirim Önizlemesi") onayladı ve "birebir aynısı, ayarlardan kapanabilsin" dedi.

## Davranış (mockup'la birebir)
- Realtime `notifications` INSERT'i gelince üst köşede kısa bir kart çıkar: avatar + tür rozeti (beğenide seçilen tepki emojisi), kalın kişi adı + cümle, alıntı önizlemesi (yorum metni, beğenilen içeriğin başlığı, mesaj),
  "şimdi", altta kalan süreyi gösteren ince çizgi (beğenide turuncu, diğerlerinde mavi).
- **Bilgisayar (≥ md, 768):** üst çubuğun altında sağ üstte, sağdan kayarak girer; üstüne gelince/odaklanınca süre durur ve ✕ görünür; hızlı eylem: yorum/yanıt/mesajda **Yanıtla**, tek kişilik takipte **Takip et**.
  **Telefon:** üst çubuğu örterek üstten iner (güvenli alan payıyla); yukarı kaydırınca (≥ 36 px) kapanır, dokununca açılır, basılı tutunca süre durur; ✕ ve eylem düğmesi yok.
- **5 sn** sonra kendiliğinden kapanır (yükseklik 0'a iner, alttaki kartlar yukarı kayar). **Aynı içeriğe gelen beğeni/takip/hikâye tepkisi tek kartta birleşir** ("Dave, Amy ve 1 kişi daha beğendi", süre yeniden başlar;
  birleşme anahtarı sunucunun grup anahtarıyla aynıdır: `notificationGroupKey`). **En çok 3 kart:** dördüncüsü gelince en eskisi kapanır.
- Karta dokunmak bildirimi okundu yapar (`markRead`, grup anahtarıyla) ve hedef sayfayı açar; Yanıtla yorumda `/notifications?n=<kart anahtarı>`'na (yanıt kutusu orada), mesajda sohbete gider; Takip et `followUser` + "…takip ediyorsun" bildirimi.
- **Çıkmaz:** okunmuş / ertelenmiş (`snoozed_until` gelecekte) satır, haftalık özet (`dedupe_key weekly:`), sekme arka plandayken, yazma ekranı (`data-compose-open`) ya da hikâye (`data-story-open`) açıkken,
  zil paneli açıkken (panel "N yeni" der), `/notifications` sayfasında, o sohbetin içindeyken (sayfa ya da Mesajlar dock'u). Sessize alınmış kişi/içerik ve kapatılmış tür bildirimi zaten HİÇ yazılmaz (326'daki tek BEFORE INSERT tetikleyicisi) → kart da çıkmaz.
- Kart yalnız gelen satırı GÖSTERİR; hiçbir şey yazmaz, kapanması gelen kutusunu etkilemez (bildirim listede ve zil rozetinde durur, Telegram yolu değişmedi).

## Kapatma (Ayarlar → Bildirimler → "Canlı bildirim kartı")
`SwitchRow`; tercih **cihaz başınadır** (`localStorage` `promptly-live-toasts`, yazılmamışsa AÇIK, kapalıyken `"off"`; depolama yazılamazsa oturum boyu bellekte). Cihaz başına seçildi: telefonda kapatıp bilgisayarda açık tutulabilsin,
yeni veritabanı sütunu/migration gerekmedi. Kapatılınca ekrandaki kartlar anında kalkar, başka sekmedeki değişiklik `storage` olayıyla yansır. (İstenirse hesap düzeyine `profiles` sütunuyla taşınabilir; bu bilinçli olarak yapılmadı.)

## Kod
- Saf kurallar: `src/lib/live-notification-toast.ts` (gösterilme kararı, grup anahtarı, birleştirme, en çok 3, hızlı eylem, yığın indirgeyicileri, Realtime satırı ayrıştırma) + `live-notification-toast.test.ts` (11 test).
- Sağlayıcı: `notifications-provider.tsx` `subscribeIncoming(listener)` — MEVCUT tek Realtime kanalı yeni satırı dinleyicilere yayar (ikinci abonelik açılmaz).
- Çizim: `features/notifications/live-toasts.tsx` (`AppShell`'de, `/focus` dışında; `CardAvatar`/`useHeadlineParts` ile zil paneliyle aynı avatar/başlık cümleleri), tercih `live-toast-pref.ts`, stiller `globals.css` (`.live-toast*`).
- **Süre JS zamanlayıcısıdır** (kalan süre izlenir; duraklatınca düşer): CSS `animationend` kullanılsaydı `prefers-reduced-motion` genel kuralı (`animation-duration: 0.01ms`) kartı anında kapatırdı. Çizgi yalnız görsel göstergedir.
- Metinler: `nc.live.*` ve `nc.settings.live*` (TR + EN, `translations-notification-center.ts`).

## Testler
`tests/messaging-ui/run-live-toasts.mjs` (19 senaryo, ağ taklitli; CI listesinde): bilgisayar/telefon yerleşimi, 5 sn kapanma + hover/basılı tutma duraklatma, birleşme, en çok 3, ✕/Esc, açma + okundu, Yanıtla/Takip et,
gösterilmeme kuralları, Ayarlar anahtarı (kalıcılık, başka sekme), İngilizce, hareketi azalt, koyu tema/tablet, bozuk yük. Gerçek Supabase'e / Realtime'a / cihaza KARŞI DENENMEDİ.
Not: `run-notifications` 18. ve 26. senaryosu bu değişiklikten ÖNCE de kırmızıdır (değişiklik geri alınıp yeniden derlenerek doğrulandı) — kapsam dışı bırakıldı.
