# 309 — GIPHY önbelleği ve resmî kaynak işareti

**Durum:** uygulandı (repoda). `tsc` temiz, `npm test` yeşil (`giphy.test.ts` 14 test), ağ taklitli `run-comment-extras` 20/20. **Gerçek GIPHY'ye karşı DENENMEDİ.**

## Neden
GIPHY anahtarı **tüm ziyaretçiler için ORTAK** sınırlıdır (yeni "beta" anahtar: saatte 100 istek; "Upgrade to Production" başvurusuyla yükselir, ücretsiz sınırsız seçenek yok). Seçiciyi açmak, her arama ve her sayfa bir istektir; aynı şeyi tekrar sormak sınırı boşuna yer.

## Ne yapıldı (`src/lib/giphy.ts`)
- Başarılı sayfalar bellekte **10 dk** (`GIF_CACHE_TTL_MS`) tutulur, en çok 60 sayfa (`GIF_CACHE_MAX`, en eski atılır). Anahtar = arama (baş/son boşluk ve büyük/küçük harf farkı yok sayılır) + sayfa başlangıcı.
- Aynı anda gelen aynı istekler TEK isteğe iner. `AbortSignal` yalnız o çağıranı bırakır; paylaşılan istek tamamlanır, sonraki çağıran önbellekten alır.
- **Hata asla saklanmaz** ("Tekrar dene" gerçekten yeniden dener; 429 da saklanmaz).
- `clearGifCache()` yalnız testler içindir. Önbellek modül düzeyindedir (kimlik değişince sayfa yenilendiği için ayrıca temizlenmez, CLAUDE.md Bölüm 8.10); içerik herkese aynıdır, kişiye özgü veri tutmaz.

## Kaynak işareti (kaldırma yasak) — resmî GIPHY logosu
Seçicideki **"Powered by GIPHY" işareti GIPHY'nin API şartıdır** (üçüncü taraf kaynak bölüm 5A'yı alıntılıyor; resmî metin okunmadı): API'nin kullanıldığı yerde görünür ibare istenir, production onayı başvurusunda ibarenin ekran görüntüsü istenebilir. Kaldırmak anahtarın iptaline/production'ın reddine yol açabilir → **işaret kaldırılmaz, değiştirilmez, kırpılmaz**.

- Düz yazılı etiket yerine GIPHY'nin **resmî statik logosu** kullanılır: `public/giphy/powered-by-giphy.png` (200×42). Kaynak: sahibinin sağladığı "Giphy Attribution Marks" paketi → `Static Logos/Small/Light Backgrounds/PoweredBy_200px-White_HorizLogo.png`. Bu sürümün KENDİ siyah zemini vardır, bu yüzden 6 paletin açık ve koyu modlarının hepsinde okunur (şeffaf "Dark Backgrounds" sürümü açık zeminde görünmez olurdu). Seçicide 24 px yükseklikte, `alt` = "Powered by GIPHY" (marka adı, çevrilmez), `data-giphy-attribution`.
- Pakette ayrıca büyük (640 px) ve animasyonlu sürümler var; paketin ReadMe'si animasyonluyu tercih ettiğini söylüyor. Şimdilik hareketsiz küçük sürüm kullanıldı (hareketi azalt/performans, seçicide zaten çok hareketli GIF var). İstenirse `Animated Logos/PoweredBy_200_Horizontal_Light-Backgrounds_With_Logo.gif` ile değiştirilebilir. Paketin kendisi (zip, PSD'ler) depoya KONMADI, yalnız kullanılan tek PNG.
- Rozetin yanındaki ek cümle ("GIF'ler GIPHY'den gelir") gereksizdi, kaldırıldı; kalan metin "Birine dokununca eklenir.".
