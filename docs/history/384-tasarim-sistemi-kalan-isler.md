# 384 — Tasarım sistemi: 383'ten kalan işler

383'ün "Yapılmadı" listesi uygulandı (yalnız istemci; migration yok). Her adım kodmodla yapıldı, tek seferlik betikler depoya girmedi.

## Yapılanlar
- **`Input` / `Select` benimsemesi:** `className={fieldInputClassName}` taşıyan 55 `<input>` + 10 `<select>` → `<Input>` / `<Select>` (`dense` = `fieldDenseInputClassName`). Kalan çıplak `<input>`lar checkbox/radio/dosya/gizli ve `cn(fieldControlClassName, …)` ile özel yüksekliği olan alanlardır.
- **`DialogShell`:** 24 diyalog kartı daha (toplam ≈49); `DialogShell` artık `ref` alır; diyalog kartı radius'u `lg`. Menü/popover olan `role="menu"` panelleri bilerek `DialogShell` DEĞİL (`MENU_PANEL_CLASS`).
- **Kartlar:** `rounded-xl border border-border-soft bg-surface` panel/satır yüzeyleri `rounded-lg` (60 yer); popover/diyalog/`border-strong` ve medya kartları `xl` kaldı.
- **`ScrollRow`:** 10 elle yatay kaydırma şeridi (filtre çipleri, kategori/üye süzgeçleri, yayın paneli…) `ScrollRow`. Kalanlar bilerek elle: `section-nav` (kendi oklarıyla), `ChipRow`, `suggestion-strip` (snap), araç çubukları (pano/seçim), emoji sekmeleri, `code-block`/`image-lightbox`/tablo.
- **İkon düğmeleri:** 61 elle yazılmış ikon düğmesi `iconButtonClassName` (36/32 px, `rounded-md` varyantı çağrıda).
- **`PersonRow`:** tek bileşen `components/ui/person-row.tsx`; ekip `PersonRow`'u onu yeniden dışa aktarır, `CreatorRow` ve Space üye satırı onu kullanır. Ekip üye ızgarası kartları (masaüstünde dikey kart) bilerek ayrı kaldı.
- **Boşluk:** `3.5` adımlar (14 px) → `4`, `gap-2.5` → `gap-3` (≈377 yer). `0.5/1.5/2.5` bilerek kaldı: ikon–metin hizası ve rozet iç boşluğu (≤ 10 px); kural CLAUDE.md'de.
- **Başlık ağırlığı:** `text-h1/h2/h3` taşıyan dizgilerde `font-semibold/medium` → `font-bold` (87 yer); `extrabold` yalnız marka başlıkları (Hub bandı).
- **Sekme çizgisi:** `SectionNav tabs` `border-b-[3px]` → `border-b-2` (`Tabs underline` ile aynı).
- **`EmptyState` başlığı** `<h2>` (görünüm aynı: `font-sans text-h3`).
- **Yan sütun kırılma noktası:** `DetailShell` yan sütunu `lg` → `xl`, 320 → 300 px, boşluk Hub ile aynı (`HubDetailLayout`); detay içeriği gutter'ı 12/24/32 (bant ile birlikte).

## Kararlar (yapılmadı, gerekçeli)
- **`Button md` 44 px yapılmadı:** `md` 40 = `fieldDenseInputClassName` (40); form varsayılanı 44 = `h-11` düğmeler. İki yükseklik çifti sistemin kendisi.
- **Çıplak `<button>` (≈760):** satır/çip/sekme/kart-düğme gibi özel biçimli denetimlerdir; ortak olanlar (`IconButton`, `Button`, menü satırı, `InlineAlert` eylemi) bileşene alındı.
- Yarım adım `0.5/1.5/2.5` ve `rounded-[2/5/11/14px]`, `cqw` radius: dekoratif/mikro.

## Doğrulama
`tsc`, `eslint` (src'de 0 uyarı), `npm test` 1073/1073, `npm run build`; ağ taklitli Playwright paketleri (PR gövdesinde). İngilizce: yeni kullanıcı metni YOK. Gerçek Supabase/cihaz/iOS DENENMEDİ.
