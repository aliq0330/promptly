# 470 — Klavye açıkken pencere kart kalır, arkası karartılır (468/469'u ve 378 K4'ü değiştirir)

## Karar

Kullanıcı 469'daki bembeyaz tam ekranı istemedi: "modal kalsın, arka plan modal açılınca nasılsa öyle olsun, beyaz olmasın."
378'deki K4 (klavye açıkken pencere görünür alanı opak kaplar) ve 469 (pencerenin arkasındaki sayfayı gizle) geri alındı.

## Davranış (telefon, `< sm`)

- Katman yine görünür alana (`visualViewport`) oturur — başlık ekran dışına kaçmaz, düğmeler klavyenin üstünde kalır.
- Kart normaldeki gibi yerden kopuktur: yanlardan 10 px, dört köşesi yuvarlak, klavyenin 8 px üstünde; en çok görünür alan − 16 px.
- Arkası her zamanki karartıdır (`bg-scrim`; klavye açıkken bulanıklık yok), sayfa gizlenmez.
- iOS 26'nın saydam Otomatik Doldur çubuğu düzen görünümünün dışında durur; WebKit `fixed` katmanları (karartı dahil) oraya çizmez,
  o şeritte belgenin kendisi görünüyordu. `Modal` görünür alanın ALTINDAN başlayan, belgeye bağlı (`absolute`, `top = pageBottom`)
  ikinci bir karartı koyar: şerit de aynı tonda kararır, görünür alanla çakışmadığı için karartı ikiye katlanmaz.
  `useKeyboardViewport` bunun için `pageBottom` (= `visualViewport.pageTop + height`) döndürür ve pencere kaydırmasını da dinler.
- Sohbet paneli (`useFitPanelToKeyboard`) 468'deki gibi `data-keyboard-fit="background"` ile kendi zeminini taşırmaya devam eder.

## Test

`run-spaces.mjs` 30 (Yeni Space: kart yanlardan boşluklu + yuvarlak, zemin karartı, şerit karartısı görünür alanın altından başlar,
sayfa görünür) ve `run-team-projects.mjs` 45i (eski "tam kaplar" beklentisi kart + karartı olarak güncellendi) geçti;
`run-chat-keyboard`, `run-prompt-fullscreen` geçti. `run-spaces` 2/19/20/21/22/31/32 değişiklikten ÖNCE de kırmızı
(Space listesi taklitte yüklenmiyor; bu işle ilgisiz). Gerçek iOS cihazında denenmedi.
