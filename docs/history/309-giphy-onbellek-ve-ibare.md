# 309 — GIPHY önbelleği ve kaynak ibaresi

**Durum:** uygulandı (repoda). `tsc` temiz, `npm test` yeşil (`giphy.test.ts` 14 test), ağ taklitli `run-comment-extras` 20/20. **Gerçek GIPHY'ye karşı DENENMEDİ.**

## Neden
GIPHY anahtarı **tüm ziyaretçiler için ORTAK** sınırlıdır (yeni "beta" anahtar: saatte 100 istek; "Upgrade to Production" başvurusuyla yükselir, ücretsiz sınırsız seçenek yok). Seçiciyi açmak, her arama ve her sayfa bir istektir; aynı şeyi tekrar sormak sınırı boşuna yer.

## Ne yapıldı (`src/lib/giphy.ts`)
- Başarılı sayfalar bellekte **10 dk** (`GIF_CACHE_TTL_MS`) tutulur, en çok 60 sayfa (`GIF_CACHE_MAX`, en eski atılır). Anahtar = arama (baş/son boşluk ve büyük/küçük harf farkı yok sayılır) + sayfa başlangıcı.
- Aynı anda gelen aynı istekler TEK isteğe iner. `AbortSignal` yalnız o çağıranı bırakır; paylaşılan istek tamamlanır, sonraki çağıran önbellekten alır.
- **Hata asla saklanmaz** ("Tekrar dene" gerçekten yeniden dener; 429 da saklanmaz).
- `clearGifCache()` yalnız testler içindir. Önbellek modül düzeyindedir (kimlik değişince sayfa yenilendiği için ayrıca temizlenmez, CLAUDE.md Bölüm 8.10); içerik herkese aynıdır, kişiye özgü veri tutmaz.

## Kaynak ibaresi (kaldırma)
Seçicideki **"Powered by GIPHY" rozeti GIPHY'nin API şartıdır** (üçüncü taraf kaynak bölüm 5A'yı alıntılıyor; resmî metin okunmadı): API'nin kullanıldığı yerde görünür ibare istenir, production onayı başvurusunda ibarenin ekran görüntüsü istenebilir. Kaldırmak anahtarın iptaline/production'ın reddine yol açabilir → **rozet kaldırılmaz**. Rozet şimdilik düz yazılı bir etikettir; production başvurusu için GIPHY'nin resmî logo dosyaları developers.giphy.com'dan indirilip kullanılmalıdır (yapılmadı). Rozetin yanındaki ek cümle ("GIF'ler GIPHY'den gelir") gereksizdi, kaldırıldı; kalan metin yalnız "Birine dokununca eklenir."
