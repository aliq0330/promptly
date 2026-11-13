# 383 — Tasarım sistemi denetimi ve konsolidasyonu (iki parça)

Bir UI/UX denetimi (kod taraması + sayım; ekran görüntüsü/cihaz yok) tasarım sistemindeki kopyaları ve tutarsızlıkları çıkardı. Bu iş, **mekanik ve doğrulanabilir** olanları uyguladı; büyük yeniden yazımlar bilerek yapılmadı (aşağıda "Yapılmadı").

## Parça 1 — token, kodmod, erişilebilirlik
- **Kontrast (P0):** durum/ikincil dolgu üzerinde `text-white` KOYU modda AA'yı geçmiyordu (danger 2.77, secondary 2.36, success 1.74, warning 1.67). Yeni tokenlar `--p-{danger,secondary,success,warning}-fg` (açık: beyaz, koyu: mürekkep) → `text-*-foreground`. 18 yer çevrildi (`Button danger`, okunmamış rozetleri, ekip tonları…). `brand-tokens.test.ts` bu çiftleri ve form kontrol sınırını denetler.
- **Form kontrol sınırı** `--p-control-border` (≥3:1, WCAG 1.4.11); `fieldControlClassName` ve `Input/Textarea/Select` onu kullanır, tek odak tarifi. Kartların `border-soft` kenarlığı değişmedi (dekoratif).
- **Tip ölçeği tek:** `text-sm/xs/base` → `text-small/caption/body` (612 yer); 12px altı 86 arbitrary boyut → `text-micro` (11px; yalnız sayaç/rozet).
- **Radius:** `rounded-2xl` (= `lg`, Tailwind varsayılanı 1rem) ve `rounded-3xl` → ölçek; `rounded-[22/20/18/16px]` → `xl/lg`.
- **`vh` → `dvh`** (28 yer), `min-h-screen` → `min-h-dvh` (5); `disabled:opacity-*` tek değer (50); scrim `bg-scrim` (`--p-scrim`); `z-[55/60/70]` → `--z-*` tokenları; `--nav-clearance`.
- **İkon:** ölü `strokeWidth` (Phosphor tek ağırlık) ~230 çağrıdan kaldırıldı (gerçek olanlar: hareketli ikonlar ve `Loader2`); tek sayılı boyutlar 12/16/20/24'e oturdu; avatar boyutları `AVATAR_SIZES` ölçeğine.
- **Sayfa kabuğu:** `PAGE_GUTTER_CLASS` (12/24/32) + `PAGE_PADDING_Y_CLASS` + `PAGE_WIDTH_CLASS` (`PageContainer` kullanır; `following`/`followers`/`search` kopyaları `PageContainer`/sabitlere bağlandı; ayarlar, oluşturma, bildirimler, moderasyon, etiketler tablette 24 px). Hub başlıkları `text-h2 md:text-h1` (arbitrary boyut kalktı). Yaratıcı paneli genişliği `6xl`.
- Küçük: `Button sm` 36 px (dokunma hedefi), `space-menu` satırı gerçek odak halkası, eski mor varsayılan renkler (`#7c3aed`, `#7c5cff`) marka mavisine, `forced-colors` yedeği.
- **ESLint koruması:** `eslint.config.mjs` `no-restricted-syntax` (uyarı) — `text-sm/xs/base`, `rounded-2xl/3xl`, 12px altı, `vh`, durum zemininde `text-white`.

## Parça 2 — ortak bileşenler
- `components/ui/menu.tsx` (`MENU_PANEL_CLASS`, `MENU_ITEM_CLASS`, danger): 3 dosyadaki aynı menü satırı tek sabit; 10 menü panelinin radius/zemin/kenarlığı tek biçim.
- `components/ui/inline-alert.tsx` `InlineAlert` (31 dosyada 39 elle yazılmış hata paragrafı).
- `components/ui/badge.tsx` `CountBadge` (8 elle yazılmış okunmamış balonu).
- `components/ui/field.tsx` `Input/Textarea/Select` + `fieldDenseInputClassName` (40 px, `Button md` ile çift) + `fieldTextareaClassName`; 5 yerel input sabiti buna bağlandı.
- `components/ui/card.tsx` `CARD_SURFACE_CLASS` + `CARD_PADDING` + `Card padding`; `HubCard` kabuğu ve 34 panel kartı (`rounded-xl` → `lg`) aynı yüzeyde; içerik/medya kartları (`ContentCard`, `creator-card`…) bilerek `xl` kaldı.
- `components/ui/dialog-shell.tsx` `DialogShell` (25 diyalog iç kabuğu; `stopPropagation` ve kabuk sınıfları tek yerde); 32 diyalogda `shadow-lg` → `shadow-pop`.
- `HubAttentionStrip` düğmesi `buttonClassName`; 16 `animate-pulse` iskelet → `skeleton-shimmer`.

## Yapılmadı (bilerek — ayrı iş/karar)
- 825 çıplak `<button>` ve 290 `<input>`'un tamamının bileşene çevrilmesi; kalan ≈60 `DialogShell` dışı diyalog kabuğu; ≈500 elle kart dizgisinin tamamı.
- `overflow-x-auto` → `ScrollRow` (25 dosya; her biri ayrı ayrı doğrulanmalı).
- Üye/kişi satırı tek `PersonRow` (ekip/Space/topluluk/`CreatorRow`), `SubBar` birleştirmesi, `DetailShell` (lg) ↔ `HubDetailLayout` (xl) yan sütun kırılma noktası — ürün kararı.
- Boşluk yarım adımlarının (`1.5/2.5/3.5`) toplu yuvarlanması: görsel kontrol ister.
- `Button md` 44 px yapılmadı (yalnız `sm` 36); input varsayılanı 44, `dense` 40.

## Doğrulama
`tsc`, `eslint` (0 uyarı), `npm test` (1073), `npm run build`; ağ taklitli Playwright paketleri (aşağıdaki raporda). Gerçek Supabase/cihaz/iOS DENENMEDİ. İngilizce: yeni kullanıcı metni YOK (yalnız sınıf adı/bileşen); `translations-spaces.ts`'teki örnek HEX ipucu iki dilde güncellendi, sözlük yeniden üretildi.
