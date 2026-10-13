### 9.79 Bilinen hata düzeltmesi: Ana Sayfa'nın tür filtresi (Tümü/Promptlar/
Generatorlar/İstekler/Workflowlar) ikinci satıra taşıp altındaki akışı
aşağı itiyordu

Kullanıcının bir ekran görüntüsüyle bildirdiği hata: Ana Sayfa'daki
(`FeedTabs`) içerik türü filtre satırı (`KIND_FILTERS` — Tümü/Promptlar/
Generatorlar/İstekler/Workflowlar) belirli bir genişlikte (dar
masaüstü/tablet) 5 chip'in tamamı tek satıra sığmadığında ikinci satıra
SARIYORDU — altındaki akış kartlarını aşağı itiyordu. İstenen davranış:
hiç sarmadan, yatay kaydırmayla (`Tabs` bileşeninin — sekme satırlarının —
zaten her genişlikte kullandığı desenle) tek satırda kalması.

**Kök neden:** `ChipRow` (`src/components/ui/chip.tsx`), Bölüm 9.50'nin
tasarım kararı gereği BİLİNÇLİ OLARAK `sm:` (640px) ve üstünde sarmaya
geçiyor (`sm:flex-wrap sm:overflow-visible`) — bu, `TaxonomyFilter`/arama
sıralama çipleri/moderasyon filtresi gibi, sarmasının zararsız/istenen
olduğu diğer chip satırları için doğru bir varsayılan. Ama `FeedTabs`'ta
bu `ChipRow`, `Tabs` (segmented) bileşeninin YANINDA, `flex-col
lg:flex-row` bir satırda duruyor — sarma, bu özel konumda altındaki akışı
aşağı itiyor; `Tabs`'ın kendisi (aynı dosyada, `role="tablist"`) zaten
HER genişlikte yalnızca kaydırıyor, hiç sarmıyor (`tabs.tsx`'in kendi
doküman yorumu bunu zaten doğru belgeliyordu).

**Düzeltme:** `ChipRow`'a yeni, opsiyonel bir `scroll` prop'u eklendi —
`true` iken satır `Tabs`'ın aynı, kanıtlanmış davranışına (`overflow-x-
auto`, `sm:flex-wrap` override'ı YOK) geçiyor; `scroll` verilmezse (diğer
tüm çağrı yerleri) eski, değişmeyen sarma davranışı korunuyor —
`ChipRow`'un paylaşılan varsayılanı BOZULMADI, yalnızca bu TEK satır için
(`feed-tabs.tsx`'teki `<ChipRow scroll>`) opt-in edildi.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, placeholder
Supabase env ile tam `npm run build` (37 rota, değişmedi) sıfır hatayla
geçti. Değişiklik yalnızca iki dosyada (`chip.tsx`, `feed-tabs.tsx`),
`scroll` prop'u verilmeyen TÜM diğer `ChipRow` çağrı yerleri (`Taxonomy
Filter`, arama sıralama çipleri, moderasyon filtresi, Keşfet'in "Tüm
istekler/Yalnızca açık" çifti, `content-list-page.tsx`'in medya türü
çipleri) `git diff` ile doğrulandığı gibi hiç dokunulmadan, byte-identical
kaldı — sıfır regresyon riski. Bu sandbox'ın Playwright/tarayıcı erişimi
bu oturumda kurulu değildi (proje bağımlılığı olarak yok), bu yüzden
gerçek bir tarayıcıda görsel doğrulama yapılamadı — değişiklik salt CSS
sınıfı (zaten `Tabs`'ta kanıtlanmış aynı `overflow-x-auto`/`touch-pan-x`/
`overscroll-x-contain` deseni) olduğundan ve `tsc`/`lint`/`build` temiz
geçtiğinden düşük riskli kabul edildi; kullanıcının canlı/yerel ortamda
dar bir genişlikte (ör. tablet) filtre satırının artık sarmadığını,
yalnızca kaydırdığını bizzat doğrulaması gerekiyor.

**Bilinen sınırlamalar:**
- Gerçek bir tarayıcıda görsel doğrulama yapılamadı (yukarıda açıklandı).
- Bu, dar kapsamlı bir CSS düzeltmesi; migration içermiyor, kullanıcının
  Dashboard'da yapması gereken bir adım yok.
