# 334 — Promptly'nin kendi tepki emojileri ve efektleri (Telegram TGS + lottie-web kalktı)

**İstek (kullanıcı):** Tepki emojileri ve efektleri bize ait olsun (lisans sorunu kalmasın), ama mevcut Telegram'dakilere yakın ve
profesyonel görünsün; efekt sayfaya yayılmasın, bugünkü gibi emojinin çevresinde kalsın. Önce mockup istendi (iki tur,
`docs/mockups/reaction-fx/index.html`), sonra sitedeki Telegram emojileriyle değiştirilmesi.

**Neden:** 265'ten beri altı tepki ve efektleri Telegram'ın Animated Emoji dosyalarıydı (`public/reactions/*.tgs`, ~0,8 MB, lottie-web ile).
Dosyaların lisansı "netleştirilmeli" diye açık işti (CLAUDE.md "Bilinen sınırlar"). Artık hiçbir dış çizim/dosya kullanılmıyor.

## Önce ne incelendi
Telegram efektleri tarayıcıda kare kare açıldı: emoji kalın koyu kontür + katmanlı gradyan + beyaz parlama noktalarıyla çizilmiş; efekt
emojinin çevresindeki kare kutuda (sitede 156 px, çıkış noktası kutunun %78 · %50'si), "çıkartma" parçacıklarından oluşuyor (renkli kalpler;
çizgi film alevleri + duman + sıcak hale; cam kırıkları; kelime balonları; altın yıldızlar), ~3 sn. Yeni çizimler bu dili izler, kopyalamaz.

## Ne yapıldı
- **`src/lib/reaction-art.ts`** (saf, DOM yok): altı emojinin SVG çizimi (`markup(önek, poz)`) ve animasyonu (`pose(t)` → `data-r`
  öğelerinin öznitelikleri). Anahtar kare + eğri (`keyframes`), alev silueti parametrik (Catmull-Rom → Bézier, uçlar sivri, titreme genliği
  `k`). Her emojinin `pose(0)` ve `pose(duration)` değeri dinlenme karesidir (birim testli: oynatma başında/sonunda sıçrama yok).
  - Sevdim: kendi ekseninde dönüş (genişlik = cos açı, kıvrım çizgisi, parlama kayar) + kalp atışı · Ateş: üç katlı ayrı titreyen alev,
    çömel-sıçra, uçlardan kopan küçük alevler · Vay be: çök-zıpla, göz/ağız büyür, kaşlar kalkar, şok çizgileri, titreme, ter damlası ·
    Alkış: üç çırpış (öndeki el bilekten açılır) + kıvılcım çizgileri · Komik: "ha-ha" ritmiyle baş/ağız/göz, şişen gözyaşları ·
    Faydalı: ampul titreyip söner, parlayarak yanar, ışınlar, sallanma.
- **Posterler** `public/reactions/<tepki>.svg` artık bu modülden üretilir: `node scripts/build-reaction-posters.mjs` (elle düzenlenmez).
- **`src/features/reactions/reaction-fx.ts`**: efekt = tuval üzerinde zamanın SAF fonksiyonu olan parçacıklar (aynı tohum + aynı an = aynı
  kare). Çıkartmalar (sekiz renk kalp, 3×6 kare alev, duman, kıvılcım, gözyaşı, altın yıldız, patlama balonları, kelime balonları
  [`!`, `?!`, `BRAVO`, `HAHA`, `HEHE`, `LOL`, `HA`; sitenin başlık yazı tipi], mini alkış ve mini gülen yüz [emojinin kendi kareleri])
  ilk efektte bir kez çizilip bellekte tutulur; sayfa açılışında hiçbir şey yapılmaz. Yerleşim kutuda dağınık, çıkışın açılma yönünde.
- **`reaction-player.ts`** dışa açık fonksiyonları AYNI imzayla korudu (`reactionAssetUrl`, `canAnimateReactions`, `playReactionIn`,
  `playReactionEffect`), içi değişti: emoji = satır içi SVG + `requestAnimationFrame` ile `pose(t)`; efekt = `[data-reaction-effects]`
  katmanında kutu > `<canvas>`. Çağıran hiçbir bileşen değişmedi (düğme, seçici, satır içi seçici, mesaj rozeti, özet, liste, istatistik,
  yaratıcı paneli).
- **Yeni davranış — aynalama:** emoji ekranın sol kenarındaysa (telefonda gönderinin tepki düğmesi) efekt sola açıldığında çoğu ekran dışında
  kalıyordu (Telegram efektinde de aynıydı). Artık solda yer yoksa yerleşim aynalanır, sağa açılır (yazılar ters dönmez; tuval çevrilmez,
  parçacıklar `dir` = -1 ile kurulur).
- Silinenler: 12 TGS dosyası (`<tepki>.tgs`, `<tepki>-fx.tgs`), `lottie-web` bağımlılığı. `DecompressionStream`/`structuredClone`
  gereksinimi de kalktı (eski tarayıcıda da oynar). "Hareketi azalt" açıkken hiçbir şey oynamaz (değişmedi).
- Boyut: çizim + motor kaynağı ~58 KB (derlenmiş ve gzip'li parça çok daha küçük); eski dosyalar ~0,8 MB'tı.

## Doğrulama
- Birim: `src/lib/reaction-art.test.ts` 4/4 (ilk/son kare = dinlenme; pozun yazdığı her öğe çizimde; kimlikler önekli ve her `url(#…)`
  karşılığı var; NaN/Infinity yok; alev yolu titreşimsizken zamandan bağımsız). `npm test` 933/933.
- Arayüz (ağ taklitli Playwright, yeni derlemeyle): `run-reactions` 11/11 (efekt artık `canvas`; kutu ≤156 px ve çıkış noktası emojide),
  `run-comment-reactions` 4/4, `run-chat-popovers` 10/10, `run-quotes` 12/12, `run-safety` 11/11, `run-space-posts` 8/8, `run-insights` 22/22,
  `run-result-stats` 11/11, `run-community-posts` 36/36, `run-focus-feed` 35/35, `run-notifications` 34/34.
- Gözle: detay sayfasında altı efektin ara kareleri masaüstünde (açık tema) ve telefonda (koyu tema, aynalı) ekran görüntüsüyle incelendi.
- `npx tsc --noEmit` temiz, `npm run lint` 0 hata (15 uyarı önceden var olan test dosyalarında), `npm run build` temiz.
- **İngilizce:** yeni görünen metin yok (tepki adları/çeviriler değişmedi). Efektteki kelime balonları (`BRAVO`, `HAHA`, `LOL`…) dilden
  bağımsız seçildi.

## Bilinçli sınırlar
- Gerçek iPhone/Safari'de ve gerçek oturumda DENENMEDİ (yalnız Chromium).
- Çizimler tek elden çıktı; Telegram'ınki kadar ayrıntılı değil (ör. alkışta tek ten rengi, ampulde basit filament).
- Efektin yönü başlangıçta seçilir; sayfa kayarken kutu çıpayı izler ama yön değişmez.
- Kelime balonu yazı tipi sitenin başlık yazı tipidir (`--font-display-face`); yüklenmemişse kalın sistem yazı tipi.
