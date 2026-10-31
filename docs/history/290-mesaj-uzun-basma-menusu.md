# 290 — Mesaj uzun basma menüsü (tepki çubuğu + işlem menüsü, bulanık zeminde)

**Durum:** uygulandı (yalnız istemci; migration yok). Birim testi (`message-sheet-layout.test.ts`, 8 kontrol) yerel Node'da geçti.
**`tsc` / `lint` / `npm run build` / Playwright paketi BU OTURUMDA ÇALIŞTIRILAMADI:** ortamın ağ politikası `registry.npmjs.org`'u engelliyor (proxy 403),
bağımlılıklar kurulamadı. `run-chat-popovers.mjs` yeni davranışa göre yeniden yazıldı ama koşulmadı. Gerçek iOS Safari'de denenmedi.

## Ne
Bir mesaja dokunmatikte ~400 ms basılı tutmak (ya da ⋮ düğmesi, ya da masaüstünde sağ tık) AYNI sayfayı açar: bulanık zemin, mesajın yerinde duran net
kopyası, üstünde tepki çubuğu, altında işlem menüsü (başlıkta "PAZ 19:26"). Onay: mockup kullanıcıyla doğrulandı (Instagram benzeri düzen).

## Kararlar
- **"Mevcut 6 tepki" = sohbetin zaten kullandığı altı hızlı emoji** (❤️ 😂 😮 😢 😡 👍, `EmojiPicker`) ve "+" ile açılan ikinci satır. Sitedeki beğeni tepkileri
  (`love|fire|wow|clap|haha|idea`, `docs/history/265-*`) bu değildir: onlar `prompt_likes.reaction`'dır, mesaj tepkisi `message_reactions`'ta serbest emojidir. Mesajlara
  site tepkilerini bağlamak yeni şema/eşleme ister; yapılmadı. İstenirse ayrı iş.
- **⋮ düğmesi kalır ve uzun basmayla aynı sayfayı açar.** Eski küçük ⋮ açılır menüsü (anchored popover) kaldırıldı; küçük emoji düğmesinin seçicisi (`SmilePlus`) aynen kaldı.
- Menü içeriği (Yanıtla, Yıldızla, Sabitle, Kopyala, Mesaj bilgisi, Düzenle, Kendin için sil, Herkesten sil, Şikâyet et…) ve kuralları DEĞİŞMEDİ: aynı
  `MessageActionMenu`, yalnız büyük dokunma hedefli "sayfa" görünümü. Şikâyet/personele bildir artık sayfayı kapatır (aksi hâlde şikâyet penceresinin üstünü örterdi).

## Parçalar
- `features/messages/use-long-press.ts` — dokunmatik/kalem için `pointerdown` + 400 ms zamanlayıcı (iOS Safari'de `contextmenu` güvenilmez); 10 px'ten fazla oynama ya da
  `pointercancel` (liste kayıyor) iptal eder; parmak kalkınca gelen `click` yutulur (bağlantı/fotoğraf açılmaz, satırın dokunma anahtarı tersine dönmez). Fare yalnız sağ tıkla
  (`contextmenu`) açar; Android'in kendi `contextmenu`'sü zaten açılmışsa ikinci açılış yok.
- `features/messages/message-action-sheet.tsx` — portal katmanı. Mesajın DOM'u `cloneNode` ile kopyalanır (her mesaj türü: metin, kart, fotoğraf, tepki çipi), kopya `inert` +
  `aria-hidden`, kimlik öznitelikleri silinir; gerçek baloncuk açıkken `visibility:hidden`. Esc, Tab döngüsü, kaydırma kilidi (`lockBodyScroll`), odak iadesi.
- `lib/message-sheet-layout.ts` — saf yerleşim (birim testli): grup görünür alana (görsel görünüm alanı − güvenli alan − kenar payı) sığacak kadar kayar, ekrandan uzun mesaj kırpılır
  (alt kenarda soluk), çubuk/kopya/menü kendi mesajımda sağ, karşı tarafınkinde sol kenara hizalanır. Klavye/adres çubuğu değişince (`visualViewport`) ve çubuk/menü boyutu değişince yeniden yerleşir.
- `EmojiPicker variant="bar"`, `MessageActionMenu` (sayfa görünümü, `formatMessageStamp`), `message-bubble.tsx` (kancalar + `-webkit-touch-callout:none`, dokunmatikte `user-select:none`).

## Bilinen sınırlar
- Dokunmatikte mesaj metni artık dokunarak seçilemez (Safari'nin seçim/kopyala balonu uzun basmayla çakışırdı); kopyalamak için menüde "Kopyala" var. Masaüstünde seçim aynen sürer.
- iOS Safari titreşim vermez (`navigator.vibrate` yok); geri bildirim yalnız baloncuğun basılırken küçülmesidir. Android'de 8 ms titreşim.
- Sayfa açıkken mesaj canlı güncellenirse (Realtime) kopya anlık görüntüdür, yenilenmez.
- Yeni çeviri anahtarı yok (mevcut `messages.messageOptionsAriaLabel`, `messages.chooseEmojiReaction`…); "PAZ/SUN" gün adı `Intl` ile dile göre gelir.
