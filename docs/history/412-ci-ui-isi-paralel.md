# 412 — CI `ui` işi: ~7,5 dk → ~4,5 dk (arayüz paketleri paralel)

**Durum:** uygulandı (`.github/workflows/ci.yml`, yeni `tests/messaging-ui/run-parallel.sh`). Yerelde aynı makinede 12 paket sıralı **296 sn**, paralel (4 işçi) **121 sn**; paketlerin hepsi geçti ve test sayıları
CI'daki sıralı koşuyla birebir aynı (47/41/20/18/32/11/12/20/11/9/10/7). Gerçek GitHub Actions süresi bu PR'ın kendi koşusunda görülür.

## Neden yavaştı
`ui` işi (PR #528 koşusu, 7 dk 25 sn): kurulum ~55 sn (`npm ci` 37 sn) · Playwright/Chromium ~42 sn · `next build` ~57 sn (TypeScript 39 sn) · **12 arayüz paketi art arda ~4 dk 45 sn**.
Paketler birbirinden bağımsız (her birinin kendi sunucu portu var: 4179–4209, hepsi farklı; kendi Chromium'unu açar) ama CI bir `for` döngüsüyle sırayla koşturuyordu.

## Ne değişti
- `tests/messaging-ui/run-parallel.sh <paket…>`: paketleri `xargs -P` ile paralel koşturur (varsayılan işçi sayısı `nproc`, en çok 4; `UI_JOBS` ile değişir), her paketin çıktısını ayrı dosyaya yazar ve
  sonuçları VERİLEN SIRAYLA basar (son 3 satır; düşen pakette `✗`/`FAIL` ayrıntısı — #466 davranışı korundu). Herhangi biri düşerse ya da hiç koşmazsa çıkış kodu 1.
- `ci.yml` `ui` adımı betiği çağırır; paketler en uzundan kısaya sıralıdır (iş dengesi: en uzun paket 44 sn, toplam ~290 sn ÷ 4 işçi ≈ 72 sn alt sınır).
- `ui` işi hâlâ `continue-on-error` (bilgilendirici); bu değişiklik onu zorunlu yapmaz.

## Kurallar
- Yeni bir arayüz paketi `ui` listesine eklenirse **kendine özgü bir port** kullanmalı (mevcut portlar: `grep -hE "serve\(|PORT =" tests/messaging-ui/run-*.mjs`); aynı portu iki paket kullanırsa paralel koşuda çakışır.
- Paketler `$TMPDIR`'a (ya da `/tmp`) yalnız hata ekran görüntüsü yazar, adlar pakete özgüdür; ortak dosyaya yazan paket paralel koşuda yarışır.
- Zamanlamaya duyarlı bir paket (animasyon/zaman aşımı) paralel koşuda aralıklı düşerse önce o paketi düzelt; paralelliği düşürmek (`UI_JOBS`) son çare.

## Sınırlar / yapılmayanlar
- Kalan ~2,5 dk kurulum + derleme: `next build` içindeki TypeScript (39 sn) `checks` işindeki `tsc` ile tekrar eder; Next'in tip denetimini kapatmak derleme davranışını değiştirir, yapılmadı.
  Playwright kurulumunu derlemeyle üst üste bindirmek (~40 sn) ya da tarayıcı önbelleği yapılmadı (indirme zaten ~5 sn; zaman `apt` + kurulumda).
- Yerel ölçüm 4 çekirdekli sandbox'ta; GitHub runner çekirdek sayısı farklıysa kazanç değişir (2 çekirdekte ~2× yerine ~1,5×).
