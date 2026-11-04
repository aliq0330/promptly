# 331 — Yazma alanının emoji klavyesi telefonda yazma satırının altında

**Sorun (kullanıcı, iPhone ekran görüntüsü):** sohbette emoji düğmesine basınca seçici alttan açılan bir pencere (`Modal`)
olarak yazma alanının ÜSTÜNE biniyordu. Dokunulan emoji kutuya yazılıyordu ama görmek için pencereyi kapatmak gerekiyordu.

**Çözüm (`features/messages/composer-emoji-picker.tsx`, `message-composer.tsx`):**
- Telefonda (`md` altı) seçici artık pencere DEĞİL, yazma satırının ALTINDA açılan sayfa içi bir paneldir (`data-emoji-panel`) —
  klavyenin yerini alır (WhatsApp/Telegram kalıbı). Kutu, "+" ve Gönder hep görünür; dokunulan emoji anında kutuda görünür
  (uzun taslakta kutu sona kaydırılır). Kutu odaklanmaz (odaklansa klavye panelin üstüne çıkardı).
- Panel açıkken emoji düğmesi **klavye** düğmesine döner ("Klavyeyi göster"): basınca panel kapanır, kutu aynı imleçte odaklanır.
  Kutuya dokunmak ya da mesaj listesine dokunmak/Esc de paneli kapatır.
- Klavye gizli olduğu için panelin kendi **geri sil** tuşu var: seçimi ya da imleçten önceki bütün emojiyi (ten rengi, bayrak,
  ZWJ dizileri — `Intl.Segmenter` grafem) siler.
- Panel açılıp kapanırken mesaj listesinin sondan uzaklığı korunur (son mesaj panelin arkasında kalmaz).
- Masaüstü/tablet (`md`+) değişmedi: kutunun üstünde küçük pencere, emoji imlece yazılır ve kutu odakta kalır. Dışarı tıklama
  artık yazma formunun tamamını "içeride" sayar (kutuya tıklamak pencereyi kapatmaz).
- Çeviri: `messages.showKeyboard`, `emoji.backspace` (TR + EN).

**Test:** `tests/messaging-ui/run-composer-emoji.mjs` 6/6 (ağ taklitli Playwright). `run-chat-popovers` 10/10,
`run-message-dock` 17/17, `run-chat-library` 17/17, `npm test` 907. `run-chat` senaryo 9 (arama → "Güncel mesajlara dön")
bu değişiklik olmadan da düşüyor — önceden var olan sorun. Gerçek iOS Safari klavyesiyle DENENMEDİ.
