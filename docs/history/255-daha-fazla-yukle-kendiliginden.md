# 255 — "Daha fazla yükle" hep kendiliğinden yüklenir + kalan listeler sayfalı

**Durum: uygulandı (repoda). Yalnız istemci kodu, migration YOK. Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / oturuma / cihaza karşı DENENMEDİ.**

## Neden
254'ten sonra kullanıcı: "Eksik kalan listeleri de yap ve anayasada neden 'daha fazla yükle' diyoruz ki, o da aşağı inince otomatik yüklensin."
254'te yalnız bazı listeler kendiliğinden yükleniyordu; geri kalanı çıplak bir `Button` idi (basılmazsa liste durur) ve birkaç liste hâlâ tümünü birden okuyup çiziyordu.

## Ne yapıldı
- **Tek bileşen:** `features/feed/load-more.tsx` → `LoadMoreButton` (düğme + `IntersectionObserver`, görünür alanın 600 px altına gelince kendi sonraki sayfasını ister; düğme yedek) ve `LoadMore` (hata satırı + `LoadMoreButton`).
  Hata olunca otomatik yükleme DURUR ve düğme "Tekrar dene" olur (döngü yok); yükleme sürerken gözlemci kapalıdır (çift istek yok). İstemci pencereleri (Taslaklar 50'şer, Etiketler) de aynı bileşeni kullanır.
- **Çıplak düğmeler değişti:** moderasyon (kullanıcılar, etkinlik), alıntı arama, istatistik etkileşim listesi, topluluk denetim kaydı / akış / ana sayfa / tüm topluluklar, Ana Sayfa akışı, grup üyeleri, yıldızlı mesajlar,
  arama, içerik listeleri (+ süzgeçle boşalan liste), etiketler, taslaklar, sohbetin eski mesajları (kaydırma konumu korunur), sohbet içi arama, hikâye arşivi (2), Spaces ana sayfası.
- **Kalan listeler sayfalandı:** profilde İstekler / Workflow'lar / Hazır ayarlar (`fetchRequestsByAuthorPage`, `fetchWorkflowsByCreatorPage`, `fetchPresetsByCreatorPage`; 24'erli, toplam ilk sayfada `count: exact`),
  Kütüphanem'de aynı üç tür (görünürlük/sıralama/arama sorguda, menü sayıları `profile_content_stats`'tan). Ortak durum bileşeni `PagedListState` (`features/feed/paged-list-state.tsx`): iskelet → hata + "Tekrar dene" → liste → `LoadMore`.
- **Koruma testi:** `src/lib/load-more-auto.test.ts` — "daha fazla/eski" etiketi çizen ama `LoadMore`/`LoadMoreButton` kullanmayan `.tsx` dosyası testi kırar (testin kendisi Spaces ana sayfasında kaçırılmış bir çıplak düğmeyi buldu).
- **CLAUDE.md:** Bölüm 6'ya kural eklendi (her "Daha fazla yükle" kendiliğinden de yüklenir; çıplak `Button` yasak).

## Bilinçli sınırlar
- Yorum ağaçları ve sürüm geçmişleri hâlâ tam okunur (ağaç yapısı sayfalamayı güçleştirir; yorumlar `fetchAllRows` ile 1000'de kesilmez) — çok yorumlu içerikte çizim ağır olabilir.
- `fetchRequestsByAuthor` / `fetchWorkflowsByCreator` / `fetchPresetsByCreator` (tam okuyan) seçici ve ilişki seçicisinde duruyor (`fetchAllRows`, tavan 20 000).
- Hazır ayar "Kaydettiklerim" listesi hâlâ tam okunur.

## Doğrulama
- `npm test` 477/477 (yeni: `load-more-auto.test.ts`). `run-pagination` 13/13 (11: profilde üç tür 24'erli + kendiliğinden ikinci sayfa; 12: Kütüphanem üç tür + "Sadece ben"; 13: düğmeye basmadan 72 karta iner, hata sonrası döngü yok).
- İngilizce karşılıklar: yeni metin eklenmedi; mevcut `common.loadMore` / `common.loadingMore` / `common.retry` anahtarları yeniden kullanıldı.
