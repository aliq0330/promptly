# 346 — Coverflow galeri: misafir vitrini, giriş paneli, Space vitrini (2026-11-06)

Kullanıcı bir 3D coverflow galeri bileşeni (Framer/Originkit) paylaştı ve sitede nerede kullanılabileceğini sordu; üç yer önerildi, mockup
gösterildi (artifact), "önerdiğin yerlere yükle merge et" dendi.

## Bileşen
- `components/ui/coverflow.tsx` (`Coverflow`, `CoverflowArrows`) + saf geometri `lib/coverflow.ts` (`wrapOffset`, `stepIndex`, `coverflowCardSize`,
  `coverflowPose`, birim testli: `coverflow.test.ts`). Orijinalden farkı: sabit 400 px kart yok (kart kutudan ölçülür, `ResizeObserver`),
  Framer parçaları yok, **kontrollü** (`active` / `onActiveChange`), kartın içini `renderCard` çizer, parmakla kaydırma (pointer, dikey sayfa
  kaydırması engellenmez), ok tuşları, Enter → `onActiveClick`, renk tokenlardan, geçiş süresi `--motion-emphasis` (hareketi azalt kuralı CSS'te).
- **Yalnız ortadaki kartın içeriği odaklanır/tıklanır**: diğer kartların içi `inert` — yan karta dokunmak her zaman "öne getir" demektir; ortadaki
  kart kendi düğmesini (vitrin: prompt katmanı) ya da `onActiveClick`'i (Space: ayrıntı penceresi) kullanır.
- Kendiliğinden dönme (`autoplay`) yalnız süs yüzeyinde (giriş paneli), 3,2 sn, üstüne gelince/odakta durur, hareketi azalt açıkken HİÇ çalışmaz
  (`usePrefersReducedMotion`). İçerik yüzeyinde (vitrin, Space) dönme yok — "içerik yüzeyinde döngü yok" kuralı korunur.

## Yerler
1. **Misafir Ana Sayfa vitrini** (`GuestShowcase`): akan iki sütun yerine coverflow; ortadaki karta dokununca eski prompt katmanı (metin + Kopyala +
   Gönderiyi aç). Yazar · araç, başlık ve ipucu altta; ok düğmeleri. Veri `features/feed/showcase-data.ts` (`loadShowcase`, 3 dk modül önbelleği,
   hatada önbellek tutulmaz). `.showcase-*` CSS'i silindi. Az görselde/hatada kompakt tanıtım eskisi gibi.
2. **Giriş / kayıt paneli** (`features/auth/auth-showcase.tsx`, `(auth)/layout.tsx`): yalnız `lg`+ (panel dar ekranda gizli → veri de istenmez),
   süs: dokununca yalnız öne gelir, kendiliğinden döner. Yüklenirken ve az görselde eski üç örnek prompt satırı kalır.
3. **Space vitrini** (`features/spaces/space-showcase.tsx`, `tabs/images-tab.tsx`): üye OLMAYANA "Görseller" sekmesinin üstünde, en yeni ≤12 görsel;
   ≥3 görsel, arama/grup süzgeci yokken. Kaynağı okunamayan görsel çizilmez (ızgarada yer tutucu olarak kalır). Ortadaki görsel ayrıntı penceresini açar.

## Çeviri
`coverflow.prev/next/roleDescription`, `showcase.hint`, `spaces.images.showcaseAria/showcaseHint` — TR + EN eklendi.

## Testler
- Birim: `lib/coverflow.test.ts` (6, `package.json` listesinde). Ağ taklitli Playwright: `run-home-motion` senaryo 1/8/9 yeniden yazıldı, 10/10b yeni
  (giriş paneli: döner, hareket azaltmada durur, telefonda yok); `run-spaces` 25b/25c yeni. Gerçek Supabase'e/cihaza karşı DENENMEDİ.

## Sınırlar
- Gerçek telefonda kaydırma/dokunma denenmedi (yalnız Chromium'da 390 px ve 1280 px).
- Space vitrininde görseller `SpaceImage` (signed URL, `loading="lazy"`); büyük bir Space'te ilk 12 görsel DOM'da durur.
- Giriş panelinde kart içeriği resimdir; başlık altta tek satır (ok düğmesi yok, süs).
