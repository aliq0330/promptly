# 273 — Tepki efekti seçilen emojiden başlar, %60 boyutunda

**Durum: uygulandı (repoda), yalnız istemci kodu, migration yok.** Kullanıcı (iPhone ekran görüntüsüyle) büyük Telegram tepki efektinin beğeni düğmesinin sağına taşıp oradan başladığını, `265-*`'teki gibi seçilen tepkiden (ör. "Sevdim") başlamasını ve boyutunun %60'a inmesini istedi.

## Kullanıcı gözüyle
- Seçicide bir emojiye dokununca büyük efekt, DOKUNULAN emojinin üstünde ortalanır ve picker kapanınca da orada oynar (önceden düğmedeki simgenin ortasındaydı ve 260 px'lik kutu sağa taşıyordu).
- Efekt kutusu 260 px → 156 px (%60). Dar ekranda `ekran genişliği − 24` tavanı korunur.
- Düğmedeki simge değişimi (kalp → seçilen emoji), küçük simge animasyonu ve sayaç aynı.
- Sayfa kayarsa efekt sayfayla birlikte kayar (nokta, kayma farkı kadar ötelenir).

## Kodda
- `reaction-player.ts`: `playReactionEffect(key, origin)` artık `Element` ya da görünür alan noktası `{x, y}` (`EffectOrigin`) alır; `EFFECT_MAX = 156`.
- `reaction-picker.tsx`: `onChoose(reaction, origin?)` — emojinin simge kutusunun merkezi.
- `reaction-button.tsx`: `playWhenShown` artık `{ key, origin }` tutar; `origin` yoksa eski davranış (düğme simgesi).
- Test: `run-reactions` senaryo 1 — efekt kutusu ≤ 156 px ve dokunulan emojiye < 40 px uzakta.

## Sınırlar
- Gerçek iPhone'da denenmedi (yalnız ağ taklitli Playwright); 156 px değerini gerçek ekranda gözle ayarlamak gerekebilir.
- Seçiciyi kapatmadan kayan iç kaydırma kapsayıcıları (ör. Odak) noktayı izlemez; efekt ~3 sn olduğundan yerinde kalır.
