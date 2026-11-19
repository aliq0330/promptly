# 440 — Prompt metni araç çubuğu: sabit bant kalktı, kartın içine alındı

**Durum:** uygulandı (yalnız istemci; migration yok, yeni çeviri anahtarı yok). Mockup kullanıcıyla seçildi (A tek satır / **B kartın içinde** / C metnin altında → B).

## Sorun
`PromptComposer` eylem satırı telefonda (`max-lg`) `sticky top-14 bg-surface` idi: kaydırınca üst çubuğun altına yapışan, farklı zeminli gri bir bant;
dar ekranda "Değişken ekle" ikinci satıra düşüp bandı yükseltiyordu.

## Şimdi
- Sekmeler (Şablon · Önizleme, alt çizgili) + tam ekran simgesi kartın ÜSTÜNDE, metin ortada, **"Değişken ekle"** + dokunmatik ipucu kartın ALT şeridinde. Hepsi tek kart (`card-inset`),
  sayfayla birlikte kayar; hiçbir şey sabitlenmez. Her boyutta aynı düzen (eskiden yalnız `max-lg` sabitti).
- Önizleme sekmesinde kart yalnız sekme satırıdır (alt şerit ve çerçeve yok), önizleme kutusu altında olduğu gibi durur.
- `PromptDocEditor` yeni `bare` prop'u: çerçevesiz/gölgesiz, kenarlığı ve odak halkasını sarmalayan kart çizer.
- Tam ekran düğmesi `IconButton` (yalnız simge; `aria-label`/`title` "Tam ekran"; `data-testid="open-fullscreen"` aynı). "Değişken ekle" `variant="secondary"`.
- Eski ayrı ipucu paragrafı kalktı (kartın alt şeridine taşındı). Tam ekran katmanı, seçici, seçim araç çubuğu ve veri mantığı DEĞİŞMEDİ.

## Doğrulama
`tsc`, `eslint`, `npm test` (1449) temiz; `next build` temiz; `tests/messaging-ui/run-prompt-fullscreen.mjs` 10/10; 390×800 Chromium'da ekran görüntüsü + kaydırınca düğmenin sayfayla birlikte kaydığı ölçüldü.
Gerçek telefona/iOS klavyesine karşı DENENMEDİ.
