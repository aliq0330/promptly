# 210 — Keşfet: sıkı üst + gönderiler

**Durum:** uygulandı. Yalnız istemci kodu, veritabanı değişikliği yok.

Kullanıcı, Keşfet için çizilen dört yönden (Vitrin · Mozaik · Konular · Bugün) dört bölümü seçti: Kategoriler, Yükselen etiketler, Bu hafta popüler, Yükselen yaratıcılar. İsteği şuydu: "Bunları karıştır, sonra gönderiler gelsin. Gönderilere ulaşmadan önce çok şey varsa ona göre ayarla." Tasarımda bu dört bölüm sıkı bir "Karma" ekranında birleştirildi, kullanıcı da "verdiğin örnekteki gibi yap" dedi.

## Ne değişti

- **Başlık arama satırında.** Uzun başlık ve açıklama bloğu kalktı. `Keşfet` başlığı arama kutusuyla aynı satırda duruyor (`SearchView heading`).
- **Üst kısım dört tek satırlık şerit** (`features/feed/discover-highlights.tsx`). Telefonda her biri kenardan kenara yatay kayar:
  1. **Kategoriler** (`CategoryStrip`): en çok beğenilen 60 herkese açık promptun bağlı olduğu kategoriler, en sık olan önce (en çok 12). Her hapta gerçek kapaklardan 2×2 kolaj, kategori adı ve tür yer alır; görseli olmayan kategoride tür simgesi gösterilir. Dokunmak akışın taksonomi süzgecini (`contentType + category`) ayarlar, tekrar dokunmak temizler. Sayı gösterilmez: elimizdeki yalnızca bir örneklem, gerçek toplam değil.
  2. **Yükselen etiketler** (`TagStrip`): `trending_tags` (7 gün) etiketleri ve pencere içindeki gerçek paylaşım sayısı. Pencere boşsa en çok kullanılan etiketler "Trend" başlığıyla, **sayısız** gösterilir. Uydurma yüzde yok.
  3. **Bu hafta popüler** (`PopularStrip`): aynı kural (7 gün, en az 3; yoksa 30 gün; yoksa gizli). Kart küçüldü (telefonda 112px kare kapak), büyük "1 numara" kartı kalktı.
  4. **Öne çıkan yaratıcılar** (`CreatorStrip`): en çok takipçisi olan profiller hap biçiminde (avatar, ad, takipçi, Takip et). "Tümünü gör" Yaratıcılar bölümünü açar. Başlık "yükselen" değil "öne çıkan", çünkü takipçi artışı verisi yok.
- Ardından eskisi gibi `SectionNav` (bölüm balonları + kontrol satırı) ve gönderiler.
- **Kaldırılanlar (Keşfet'ten):** dört büyük tür karosu (tür seçimi `SectionNav` çiplerinde ve kategori haplarında duruyor; `fetchPublicPromptCounts` ve `discover.typeCount` artık kullanılmıyordu, silindi), topluluk öneri şeridi (Topluluklar → Keşfet'te duruyor), haftalık tema afişi (Ana Sayfa'da ve sağ sütunda duruyor). Eski `discover.pageTitle` / `discover.pageDescription` anahtarları silindi.
- Yeni çeviri anahtarları (TR + EN): `discover.categories`, `discover.rising`, `discover.featuredCreators`.

## Sınama

- `tests/messaging-ui/run-discover.mjs` (6/6, ağ taklitli Playwright). Kontrol edilenler:
  - 390×844 telefonda başlık ve arama aynı satırda; şeritlerin sırası doğru.
  - İlk gönderi kartının üst kenarı ilk ekranda, alt menünün üstünde görünüyor.
  - Kategori süzgeci `feed_page`'e `p_category` olarak gidiyor ve geri alınabiliyor.
  - "Tümünü gör" çalışıyor; trend boşken sayısız yedek gösteriliyor.
  - İngilizce metinler doğru; 1280px'te taşma yok.
- Gerçek Supabase'e, gerçek veriyle ve gerçek cihaza karşı **denenmedi**. Kategori sırası gerçek verinin dağılımına bağlı.
