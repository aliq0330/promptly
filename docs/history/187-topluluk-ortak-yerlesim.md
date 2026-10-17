### 9.187 Topluluk arayüzü: ortak yerleşim (masaüstü / tablet / mobil)

- **Sorun (koddan):** Topluluk sayfaları `max-w-3xl`/`max-w-4xl` tek sütundu; her gönderi 730–850px genişliğinde tek kart olarak akıyordu. Ana sayfa (`FeedGrid`) ise mobil 1 · `sm` 2 · `xl` 3 sütun masonry kullanır (kart ≈ 300–420px). Başlık büyük (eyebrow + h1 + 3 satır açıklama), üye başlığı ayrı bir satırda eylemlerle yığılıydı, Yönetim → Ayarlar tek uzun forma yığılmıştı.
- **Çözüm — tek kaynak `features/communities/community-layout.tsx`:** `CommunityLayout` (sayfa ≤ 1120px; `xl`+ ≥1280px'te 16.5rem sağ yardımcı sütun, dar ekranda hiç çizilmez), `CommunityReadingColumn` (form/liste içerikleri ≤ 3xl; Yönetim ≤ 4xl), `CommunityPageHeader` (tek satır başlık + eylemler), `FEED_GRID_CLASS` / `FEED_GRID_WIDE_CLASS` / `FEED_ITEM_CLASS` (ana sayfayla aynı CSS-columns kuralı).
- **Masaüstü:** Topluluklar ana sayfası ana sütun + sağ sütun (`home-aside.tsx`: Üye/Yönetilen/Bekleyen sayıları — sayfanın zaten bildiği değerler —, üye olunan toplulukların kısa listesi `list_my_communities`, "Tüm topluluklar"). Gönderi akışı 2 sütun (ayrıntı sayfasında sağ sütun yok → 3 sütun). Kart ≤ ~420px.
- **Tablet (md–lg, 72px ray):** sağ sütun yok; 2 sütun; başlık/eylemler `flex-wrap` ile sıkışmaz. 768 / 820 / 1024px'te taşma yok.
- **Mobil:** 1 sütun; başlık eylemleri alta sarar; sekmeler yatay kaydırılır (mevcut `Tabs`).
- **Topluluk sayfası başlığı:** avatar 52px, ad `text-h3`, rozetler + açıklama (≤2 satır) solda, "Sohbeti aç" / bekleyen istek / üyelik düğmesi aynı satırda sağda (dar ekranda alta sarar).
- **Yönetim → Ayarlar:** topluluk ayarları ile temel bilgi/görünürlük/yetki ayrı kartlara bölündü (yetkisiz kullanıcıda boş kart `empty:hidden`); rol yetkileri (Yönetici | Moderatör) `md`+ iki sütun — sayfa uzunluğu ≈ yarıya indi. `GroupOwnerSettings` sohbet kapsamında da kullanıldığı için yalnız yetki ızgarası değişti. Sohbet ayarları (`ChatSettingsSection`) ve kişisel tercihler yerinde kaldı (A/B/C ayrımı bozulmadı).
- **Tüm topluluklar:** `md`+ iki sütun kart ızgarası.
- **i18n:** `communities.aside.*` (TR+EN) eklendi; başka yeni metin yok.
- **Test:** `run-community-home.mjs` 26 (6 genişlik: kart ≤460px, sütun sayısı, sağ sütun görünürlüğü, taşma) ve 26b (ayrıntı sayfası ızgarası/başlık yüksekliği/ayar kartları). Görsel inceleme için `tests/messaging-ui/shots-communities.mjs` (sayfa × genişlik PNG üretir; doğrulama değildir).
- Migration yok. Gerçek Supabase'e / cihaza karşı denenmedi (ağ taklitli Playwright, Chromium).
