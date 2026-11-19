# 442 — Prompt editöründe seçim vurgusunun metinden kayması (iOS)

**Durum:** uygulandı (yalnız istemci; migration yok, çeviri yok). Ekran görüntüsüyle bildirildi: tam ekran editörde seçilen kelimenin vurgusu/tutamakları metnin altında, başka bir yerde çiziliyordu.

## Neden
`PromptDocEditor` iki katmandır: metni çizen ayna `<div>` + üstünde saydam `<textarea>` (seçim, imleç ve tutamaklar textarea'nındır). `globals.css`'te 1024 px altında her `textarea` için
`font-size: 16px` zorlanır (iOS odakta yakınlaştırmasın diye); ayna ise `<div>` olduğu için bu kuralı almıyor, `text-body` = 15 px ile çiziliyordu. Karakter genişliği %6,7 farklı olunca aynı metin
iki katmanda FARKLI satırlara kırılıyor; fark satır satır birikiyor, metnin sonuna doğru seçim vurgusu bir satır aşağı/yana kayıyordu.

## Düzeltme
- `globals.css`: aynı `max-width: 1023px` bloğuna `.doc-editor-text { font-size: 16px }` (sınıf element seçicisini ve katmanlı yardımcıları yener).
- `prompt-doc-editor.tsx`: `metricsClass` (ayna + textarea ORTAK) bu sınıfı taşır. Masaüstünde (≥1024) eskisi gibi `text-small`/`text-body`; textarea orada zaten zorlanmıyordu.
- Test: `run-prompt-fullscreen.mjs` senaryo 9b (390 px): iki katmanın yazı boyu, satır yüksekliği, iç boşluk ve `scrollHeight` (= satır sayısı) eşit. Düzeltme geri alınınca `'16px' !== '15px'` ile kırılır (doğrulandı).

## Kural
Bir textarea'nın üstüne ayna katmanı bindiren yüzey (jeton boyama, vurgulama) yazı boyunu/satır yüksekliğini textarea'dan ayrı belirlemez; textarea'ya genel kural uyuyorsa ayna da aynı sınıfı alır.

## Sınırlar
Gerçek iOS Safari'de (WebKit) denenmedi: bu ortamda yalnız Chromium var. Neden hesaplanan stillerle yeniden üretildi (16 px ≠ 15 px), ama iOS'un kendi seçim çizimi gerçek cihazda doğrulanmalı.
