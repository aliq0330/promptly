# 342 — Tek kimlik, Aşama 1: tek palet + yeni logo

**Durum: uygulandı (repoda; yalnız istemci + statik dosyalar — migration yok, canlıya ayrıca bir şey uygulanmaz).**

## Neden
Kimlik dağınıktı: sitedeki `>_` logosu seçilen palete göre renk değiştiriyordu (6 palet: Meydan, Beyaz, Lavanta, Okyanus,
Orman, Kum), telefon ana ekranı ikonu eski Kum paletinden kalma kiremit rengiydi, tarayıcı çubuğu (manifest) kum rengiydi.
Kullanıcı "renk, ikon ve logo olarak gerçekten bir kimliğimiz olmalı, tek palet istiyorum" dedi; öneriler (karşılaştırma
sayfası, duotone örneği, kimlik önerisi, dört ekranlık mockup) üzerinden şunu seçti:

- **Logo:** süslü parantez (prompt şablonu) + ortasında kalp (topluluk); yazı küçük harf **promptly** (Bricolage Grotesque
  ExtraBold). Renkler kullanıcının verdiği görselden ölçüldü.
- **Tek palet, iki mod:** kullanıcı yalnız açık/koyu seçer.
- **Renk rolleri kural:** mavi = yapabileceğin şey (düğme, bağlantı, seçili sekme, odak halkası); turuncu = senin olan
  (logonun kalbi, prompt `{değişken}`leri, yeni/okunmamış işaretleri) — asla düğme, asla hata.
- **İkonlar:** Solar Bold Duotone (480 Design, CC BY 4.0) — Aşama 2 ve 3'te (bu bölümde yok).

## Ne değişti
- **`globals.css`:** altı palet bloğu tek `:root` (açık) + `.dark` (koyu) çiftine indi. Token adları AYNI
  (`bg-primary`, `text-secondary`…), bileşenlere dokunulmadı. Değerler: mavi `#3b5be2` / `#738cf0`, kâğıt `#f8f8fb` /
  `#0b0a0f`, mürekkep `#121218` / `#f3f3f7`, sis `#62646f` / `#9a9aaa`. Turuncu iki tokendır: `secondary` metin için
  güvenli ton (`#b04e1c` / `#f29051`, her yüzeyde AA), yeni `heart` (`bg-heart`, `text-heart`) logonun kalbinin parlak
  dolgu tonu (`#d86934` / `#f29051`) — işaret ve noktalar için, gövde metni için DEĞİL. `.dark` artık herhangi bir
  elemana uyar (Odak sahnesi kendi alt ağacını koyu yapar).
- **Palet seçici kalktı:** `ThemeProvider`'dan `PALETTES`/`setPalette`/`data-palette` ve ilk boyama betiğindeki palet satırı
  çıktı (betik eski `promptly-palette` anahtarını bir kez siler); `AppearancePicker` yalnız Açık/Koyu; `PreferencesSync` ve
  `profiles.ts` artık `theme_palette` okumaz/yazmaz; Odak sahnesi `data-palette` taşımaz. Çeviri anahtarları
  `settings.paletteLabel` + `settings.palette.*` silindi; `settings.appearanceHint` yeni duruma göre yazıldı (TR+EN; eski
  metin "yalnızca bu tarayıcıda saklanır" diyordu, oysa oturumlu kullanıcıda hesaba yazılıyordu).
- **Yan kazanç:** Spaces'in kendi renk paletleri de DOM'da `data-palette` kullanır; eski palet seçicileri bir Space paletinin
  adı `ocean`/`forest`… olsaydı o alt ağacı yeniden boyardı. Seçiciler kalktığı için bu çakışma da bitti.
- **Logo:** `components/layout/brand-mark.tsx` — `BrandMark` (parantez `--color-primary`, kalp `--color-heart`; mod
  değişince kendiliğinden açık tonlara geçer) + `BrandWordmark`. Header, sidebar ve giriş sayfası bunları kullanır. Bricolage
  Grotesque'e 800 kalınlığı eklendi (`layout.tsx`).
- **Marka dosyaları:** `scripts/build-brand-assets.mjs` aynı geometriden üretir (Playwright + kurulu Chromium; paylaşım
  görseli fontları Google Fonts'tan yükler, yüklenmezse durur): `public/icons/icon-192/512.png` (yuvarlak mavi karo),
  `icon-maskable-512.png` (tam taşan, işaret %80 güvenli dairenin içinde), `apple-touch-icon.png` (opak), `src/app/favicon.ico`
  (16/32/48 PNG çerçeveleri; küçükte kalın çizgi), `public/og.png` (1200×630, logo + slogan + turuncu değişkenli prompt).
  Manifest renkleri `#f8f8fb`. Çıktılar elle düzenlenmez: logo değişirse betik yeniden çalıştırılır.
- **Koruma testi:** `src/lib/brand-tokens.test.ts` — `globals.css`'i okur; iki modda 25 metin/zemin çiftinin hepsi ≥ 4.5:1
  olmalı; palet seçicisi geri gelmemeli; betikteki logo yolları `brand-mark.tsx` ile birebir aynı olmalı.

## Bilerek yapılmayanlar
- **`profiles.theme_palette` sütunu ve `profiles_theme_palette_check` silinmedi** (CLAUDE.md §8.11 expand → contract): önce
  istemci sütunu bırakır (bu bölüm), sütun ayrı bir yıkıcı migration'la ve kullanıcı onayıyla silinir (Aşama 4).
- **Hikâye tokenları (`story-*`) değişmedi:** yazarın seçtiği renkler her izleyicide aynı kalmalı (198).
- **İkonlar değişmedi:** lucide hâlâ yerinde; Solar geçişi Aşama 2 (imza ikonlar) ve 3'tür.
- **Tepki gösterimi değişmedi:** beğenince seçilen emoji görünür (265/334); kullanıcı önerimi kabul etti.

## İngilizce karşılıklar
`settings.appearanceHint` (TR+EN) güncellendi; silinen anahtarların ikisi de silindi. Yeni görünür metin yok (logo yazısı
marka adıdır, çevrilmez).

## Doğrulama
`tsc` temiz, `npm run lint` 0 hata (15 eski uyarı), `npm test` 944/944 (yeni: `brand-tokens.test.ts`, 4 test),
`npm run build` temiz. Ağ taklitli Playwright: `run-settings` 13/13 (senaryo 5'e eklendi: palet seçici yok, Koyu/Açık
`<html>`'i değiştirir), `run-spaces` 32/32, `run-focus-feed` 34/35 — düşen 9 bu değişiklikten bağımsız: `main` üzerinde
ayrıca derlenip koşturuldu, orada da düşüyor (336'dan beri, bkz. 337/340). Giriş sayfası açık/koyu ve Ana Sayfa
masaüstü/telefon ekran görüntüleriyle bakıldı.

## Sınırlar / denenmedi
- Gerçek cihaz (iOS ana ekran ikonu, maskable kırpma, Safari çubuk rengi) ve gerçek Supabase'e karşı DENENMEDİ.
- Kontrast testi token çiftlerini ölçer; bileşenlerin içindeki saydam karışımlar (`bg-secondary/10` üstü metin gibi)
  ayrı ölçülmedi.
- Başka palet seçmiş kullanıcılar bir sonraki açılışta tek palete geçer; açık/koyu tercihleri korunur. Bildirim yok.
