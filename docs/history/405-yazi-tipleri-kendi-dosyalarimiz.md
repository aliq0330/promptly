# 405 — Yazı tipleri kendi dosyalarımızdan

**Durum:** uygulandı (yerelde `npm run build` [Turbopack, CI ile aynı] ve gerçek tarayıcıda yükleme doğrulandı; CI'da `ui` işi bu değişiklikle yeniden koşar). Migration YOK.

**Neden:** `next/font/google` her derlemede Google Fonts'a gider; CI'da (2026-11-16) art arda `next/font/google queries have exactly one entry` hatasıyla `ui` işi düştü (önce Bricolage Grotesque, sonra JetBrains Mono) — kodla ilgisiz, dış ağ bağımlılığı. Yayın hattı (`deploy.yml`) da aynı bağımlılığa sahipti.

- **Dosyalar:** `src/app/fonts/*.woff2` — `@fontsource-variable/{dm-sans,bricolage-grotesque,jetbrains-mono}` 5.3.0 paketlerinden alınan DEĞİŞKEN yazı tipleri (SIL Open Font License 1.1), yalnız `latin` + `latin-ext` (Türkçe ğ ş İ ı `latin-ext`'tedir), toplam ~210 KB. DM Sans `opsz`+`wght` eksenli (eski `axes: ["opsz"]` ayarının karşılığı), Bricolage Grotesque ve JetBrains Mono `wght` eksenli (eski 500–800 / 400–500 ağırlık aralıklarını kapsar).
- **CSS:** `src/app/fonts.css` — `@font-face` + `unicode-range` (tarayıcı yalnız gereken dosyayı indirir) ve `:root` değişkenleri `--font-body-face` / `--font-display-face` / `--font-mono-face` (adlar eski `next/font` değişkenleriyle AYNI: `globals.css` `--font-sans/-display/-mono` ve `reaction-fx.ts` değişmedi). `layout.tsx` artık `next/font/google` içe aktarmaz ve `<html>`'e değişken sınıfı eklemez.
- **Doğrulama:** tarayıcıda gövde `"DM Sans Variable"`, başlık `"Bricolage Grotesque Variable"`; woff2 istekleri yalnız kendi alanımıza gider, `fonts.g*` isteği YOK; `document.fonts` yüklü; Türkçe karakterler (`ğşİıÖÜÇ`) latin-ext dosyasıyla karşılanır.
- **Sınır:** `next/font`'un otomatik yedek yazı tipi ölçü düzeltmesi (`size-adjust`) gitti: `font-display: swap` sırasında sistem yazı tipinden yazıya geçişte küçük bir kayma olabilir. Yeni bir yazı tipi eklenirse dosyası `src/app/fonts/` altına, `@font-face` bloğu `fonts.css`'e yazılır (Google'dan çekilmez).
