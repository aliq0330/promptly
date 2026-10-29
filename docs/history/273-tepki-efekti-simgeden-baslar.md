# 273 — Tepki efekti düğmedeki simgeden başlar, %60 boyutunda

**Durum: uygulandı (repoda), yalnız istemci kodu, migration yok.** Kullanıcı (iPhone ekran görüntüsüyle) büyük Telegram tepki efektinin düğmedeki emojinin (ör. 🔥) sağından, yorum simgesi tarafından başladığını söyledi; efekt simgenin kendisinden çıkmalı, boyutu da %60'a inmeli. (İlk yorumum "seçicide dokunulan emojiden" idi; yanlıştı, geri alındı.)

## Kök neden
Efekt dosyaları (`*-fx.tgs`) 512 px'lik tuvalde çizilir ve patlamanın çıkış noktası tuvalin ortasında değil sağ-ortasındadır (Telegram'da emoji efektin sağ yarısında durur). Eski kod kutunun ORTASINI simgeye oturtuyordu → patlama simgenin ~0,28 kutu genişliği sağında başlıyordu. Çıkış noktası altı efektin ilk karelerinden ölçüldü: yaklaşık x = %78, y = %50 (ateş/alkış/vay be için; kalp ve komik yukarı doğru, ampul yıldız efektiyle farklı yayılır ama aynı noktadan çıkar).

## Kullanıcı gözüyle
- Efekt, düğmedeki emojiden çıkar (patlamanın çıkış noktası simgenin merkezine oturur).
- Kutu 260 px → 156 px (%60). Dar ekranda `ekran genişliği − 24` tavanı korunur.

## Kodda
- `reaction-player.ts`: `EFFECT_MAX = 156`, `EFFECT_ORIGIN_X = 0.78`, `EFFECT_ORIGIN_Y = 0.5`; kutu `merkez − boyut × çıkış oranı` ile yerleşir. Sayfa kayınca kutu simgeyi izlemeye devam eder.
- Test: `run-reactions` senaryo 1 — kutu ≤ 156 px ve patlamanın çıkış noktası düğmedeki emojinin merkezine < 6 px.

## Sınırlar
- Çıkış noktası altı efekt için tek ortak değerdir; efektlerin ilk kareleri birbirinden birkaç on piksel (tuvalde) ayrışır. Gerçek iPhone'da denenmedi; fark görülürse efekt başına ayar `reactions.ts`'e taşınır.
