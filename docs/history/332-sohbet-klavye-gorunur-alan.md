# 332 — Sohbet paneli iPhone klavyesinde görünür alana oturur

**Sorun (kullanıcı, iPhone / iOS 26 Safari ekran görüntüsü):** sohbette yazarken yazma alanı ekranın ortasında kalıyor, altında
klavyeye kadar boş bir alan oluşuyor; başlık da ekranın üstünden çıkıyordu.

**Neden:** telefonda sohbet paneli `fixed inset-0`. Klavye için yazılmış etki (`bottom = innerHeight − visualViewport.height −
offsetTop`) bir `useRef` ile panele bağlanıyordu, ama sohbet önce "yükleniyor" ekranını çizer — etki ilk çalıştığında panel henüz
yoktu ve bir daha çalışmadı. Yani klavye düzeltmesi hiç devreye girmiyordu; iOS sayfayı kendi kaydırıyor, panel `top: 0` ile
ekranın üstünde kalıyor, yazma alanı görünür alanın ortasına düşüyordu. Ayrıca formül `innerHeight`'e güvendiği için iOS 26'nın
yüzen adres çubuğunda bağlansa bile boşluk bırakabilirdi.

**Çözüm:**
- Saf hesap `src/lib/keyboard-frame.ts` (`keyboardFrame`, birim testli): klavye açıksa (görünür alan > 120 px küçüldüyse) panelin
  alanı `{ top: visualViewport.offsetTop, height: visualViewport.height }`; değilse `null`. `useKeyboardViewport` (Modal) de aynı
  hesabı kullanır — tek kural.
- `useFitPanelToKeyboard(panel, enabled, onChange)` (`features/messages/viewport-helpers.ts`): panel bir callback ref/state'ten gelir
  (sonradan kurulsa da bağlanır); yalnız `position: fixed` iken `top`/`height` yazar, klavye kapanınca temizler. Açık sohbet
  (`LocalConversationView`, liste sondaysa sonda kalır) ve yeni sohbet taslağı (`NewChatDraftView`) kullanır. `computeKeyboardInset`
  kaldırıldı.
- Tablet/masaüstü ve dock değişmedi.

**Test:** `tests/messaging-ui/run-chat-keyboard.mjs` 5/5 (klavye `visualViewport` değerleriyle taklit edilir; ilk sürüm `useRef` ile
yazıldığında bu testler 844 px = "hiç bağlanmadı" ile düştü, sorunun nedenini doğruladı). `keyboard-frame.test.ts` 6 madde.
`run-composer-emoji` 6/6, `run-chat-popovers` 10/10, `run-message-dock` 17/17, `run-prompt-fullscreen` 10/10, `run-chat-library`
17/17, `npm test` 913. `run-chat` senaryo 9 önceden de düşüyor (331'de not edildi). **Gerçek iPhone'da DENENMEDİ.**
