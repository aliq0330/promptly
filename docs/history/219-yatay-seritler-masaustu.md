# 219 — Yatay şeritler masaüstünde fareyle gezilir (`ScrollRow`)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Gerçek fareye / trackpad'e / iOS Safari'ye KARŞI DENENMEDİ — ağ taklitli Playwright'ta sentetik fare ve tekerlek olaylarıyla sınandı.

## Sorun
Telefonda parmakla kayan yatay şeritler (profil sekmeleri, öne çıkanlar, koleksiyon halkaları, hikâye şeridi, raflar, Keşfet şeritleri…) masaüstünde kullanılamıyordu: `overflow-x-auto` + `scrollbar-none` yüzünden çubuk gizli, fare tekeri yalnız sayfayı kaydırır; taşan içerik kesik görünüp ulaşılamıyordu (kodda 39 yatay kaydırmalı alan).

## Çözüm
- `lib/use-horizontal-scroll.ts` (`useHorizontalScroll`): fare (`pointer: fine`) varsa dikey tekerleği yatay kaydırmaya çevirir (uçta sayfaya bırakır), yalnız `pointerType="mouse"` ile sürükleyerek kaydırır (5 px eşik; sürükleme sonrası tıklamayı yutar; bağlantı/görsel `dragstart`'ı engellenir), taşma yönlerini (`canPrev/canNext`) ve `scrollPage()` verir. Dokunmatik davranışa dokunmaz.
- `components/ui/scroll-row.tsx` (`ScrollRow`): yeni yatay şerit bileşeni. `as` (`div|ul|ol|nav|section`), `className` kaydırılan elemanın, `wrapperClassName` şeridin ebeveyndeki yerinin (`flex-1`, `md:hidden`, grid yerleşimi…) sınıfı; ref kaydırılan elemana gider. Taşan kenarda soluklaşma (`scroll-row-fade`, `data-fade-prev/next`), üzerine gelince beliren ‹ › düğmeleri (yalnız fareli cihaz; `scrollRow.prev/next` TR+EN).
- `globals.css`: `scroll-row-fade` ve `scrollbar-fine` (dokunmatikte gizli, fareyle ince çubuk; YALNIZ yatay kaydırıcıda — `scrollbar-width` eksensizdir, dikey kaydırıcıda kullanılmaz) yardımcıları. `scrollbar-none` olduğu gibi kaldı.

## Uygulandığı yerler
- **`ScrollRow`:** `Tabs` (profil/detay/topluluk sekmeleri; ayrıca seçilen sekme değişince görünür alana alınır), `ChipRow scroll`, `SectionNav` (çip satırı + yapışkan şerit), `ListToolbar` sekme/çipleri, profil araç çubuğu çipleri, öne çıkanlar (`story-highlights`), koleksiyon halkaları, hikâye şeridi, Topluluklarım rafı, Space "Son açılanlar", Keşfet şeritleri (kategori/etiket/popüler/yaratıcı), katkı haritası, workflow adım hapları, Space panosu üst araç çubuğu.
- **`scrollbar-fine`:** sohbet foto önizleme, Space'e ekle çipleri, ekleme seçici filtreleri, emoji kategori sekmeleri, yayın penceresi çipleri, lightbox küçük resimleri, çoklu görsel seçici.
- **Masaüstünde sar (`md:flex-wrap`):** topluluk kategori filtresi (`communities-page`, `all-communities-page`), üye filtresi.

## Bilinçli sınırlar
- "Daha fazla" taşma menüsü (sekmeler için, `Tabs`) yapılmadı; sekmeler artık tekerlek/sürükleme/okla gezilir.
- `SuggestionStrip` kendi ok düğmelerini koruyor (snap + kaydırma davranışı ayrı); Space panosunun seçim çubuğu, Odak emoji sırası ve admin tabloları değişmedi.
- Sürükleme yalnız fareyle; kalem/dokunmatik yerel kaydırmayı kullanır.

## Test
`tests/messaging-ui/run-hscroll.mjs` 5/5 (ağ taklitli): tekerlekle kaydırma + uçlarda sayfaya bırakma, sürükleme (bağlantıyı açmaz, düz tıklama açar), ok düğmeleri + tek yönlü soluklaşma, profil sekmeleri + seçilen sekmenin görünür alana alınması, telefonda (dokunmatik) tekerleğin ele geçirilmemesi.
İngilizce karşılıklar eklendi (`scrollRow.prev`, `scrollRow.next`).
