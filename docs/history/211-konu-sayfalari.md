# 211 — Konu sayfaları: etiket, kategori, araç (+ araç takibi)

**Durum:** istemci kodu ve migration repoda. `20260921110000_topic_pages.sql` yerel PostgreSQL'de sınandı, **canlıya UYGULANMADI**. Sıra önemli: ÖNCE migration, SONRA istemci. Yeni istemci etiket, kategori ve araç sayfalarında `feed_page`'in 13 argümanlı biçimini ve `feed_count`'u çağırır; migration yoksa bu üç sayfa hata kutusu gösterir.

Kullanıcının istekleri sırasıyla şunlardı:
- Keşfet'te "Keşfet" başlığı görünmesin.
- Gönderideki kategoriye ya da önerilen araca dokununca arama modu açılmasın; ilgili gönderiler görünsün.
- Etiket sayfası sadeleşsin (tasarımdaki H).

Seçenekler tartışıldı ve şu kararlar alındı:
- Her kategorinin ve her aracın kendi sayfası olsun, etiket sayfasıyla aynı kalıpta.
- Araç takip edilebilsin.
- Kategori takip edilmesin, çünkü profildeki ilgi alanları (`profiles.interests`) bu sinyali zaten taşıyor. İkinci bir paralel sistem kurulmadı.

## Tek kalıp: `TopicPage` (`features/content/topic-page.tsx`)

Yukarıdan aşağıya şunlardan oluşur:
- **Kompakt Albüm bandı** (`DetailBand compact` + `CollageArt compact`): telefonda 96px kolaj başlığın yanında durur, `lg`'de eski boyutuna döner. Kolaj, konunun en çok beğenilen dört görselinden oluşur (`feed_page` popular, 12 satır). Bant, ilk görselin rengini alır.
- **Eyebrow:** "ETİKET", "KATEGORİ · GÖRSEL", "ARAÇ · MIDJOURNEY" gibi.
- **Büyük başlık ve sayı:** etikette `usage_count`, diğerlerinde `feed_count`.
- **Tek eylem satırı:** varsa büyük birincil düğme (Takip Et), ardından Paylaş.
- **Ana Sayfa ve Keşfet gibi** `SectionNav`: Tümü, Promptlar, Workflow'lar, Hazır Ayarlar, İstekler balonları ve tek kontrol satırı (sıralama, Filtre, Kart | Izgara).
- **Gönderiler:** `useFeedPages` ile sunucudan, keyset sayfalı.

Eski etiket sayfasındaki üç satır (segmentli sekmeler, "En yeni / Popüler" çipleri, tür çipleri) bu tek kontrol satırında toplandı. Etiket sayfası artık yüklemede 60'ar satırlık dört istemci sorgusu yerine sunucu akışı kullanıyor.

## Üç sayfa

- **Etiket** — `/tags/local?tag=`. Takip Et (`tag_follows`, değişmedi) ve Paylaş.
- **Kategori** — `/categories/local?type=&category=&sub=`.
  - Bantta kategorinin açıklaması (taksonomi `description`) yer alır.
  - Eylem satırının altında alt kategori bağlantıları: Tümü + alt kategoriler. Seçili olan `aria-current`.
  - Alt kategori sayfasında başlık alt kategoridir; eyebrow'daki kategori adı üst sayfaya bağlanır.
  - Takip yok, yalnız Paylaş.
- **Araç** — `/tools/local?id=`. Katalog kimliğiyle açılır (`ai-tool-catalog.ts`); "midjourney" ve "midjourney:v7" başvurularının hepsi listelenir. Takip Et (`tool_follows`) ve Paylaş.

## Bağlantılar

- Gönderi sayfasındaki kategori ve alt kategori çipleri (`TaxonomyLinks`) kategori sayfasına gider.
- Araç bağlantıları (`DetailMetaCard`, `ToolChips linked`) araç sayfasına gider.
- Keşfet'in kategori hapları artık akışı süzmüyor, kategori sayfasını açıyor.
- Eski paylaşılmış `/search?type=&category=…` ve `/discover?tool=…` bağlantıları konu sayfasına yönlenir. Kategorisiz tek başına `?type=` hâlâ aramayı o tür çipiyle başlatır.
- Keşfet'te görünür başlık kalktı; `<h1>` yalnız ekran okuyucuda kaldı.

## Veritabanı (`20260921110000_topic_pages.sql`, yalnızca ekleyici, `drop` yok)

1. **`tool_follows (user_id, tool_id)`:** RLS'te yalnız sahibi okur, ekler, siler. Kimlik biçimi `^[a-z0-9-]{1,40}$`. Kullanıcı başına en çok 100 takip (`tool_follow_limit`). `tag_follows` ile aynı kalıp.
2. **`feed_page` 13 argümanlı biçim:** `p_tag` ve `p_tool` süzgeçleri eklendi.
   - Bu argümanlar **varsayılansız** tanımlandı. Varsayılan olsaydı 11 argümanlı çağrılar iki aday arasında belirsiz kalırdı (PostgREST "could not choose the best candidate").
   - 11 argümanlı biçim aynı imzayla yenisini çağıran sarmalayıcı oldu; davranışı aynı. 10 argümanlı sarmalayıcı değişmedi.
   - İstemci bu süzgeçleri yalnız etiket ya da araç verildiğinde gönderir, o zaman da üçünü birlikte (`p_open_only`, `p_tag`, `p_tool`).
   - Yeni biçim `community_id is null` da süzer.
3. **`feed_count`:** aynı görünürlük ve süzgeçlerle dört türün toplamını verir. SECURITY INVOKER; anon ve authenticated çalıştırabilir.
4. **`for_you_page`:** aynı imzayla yenilendi. Takip edilen araç +200 puanlık bir sinyal oldu ve yeni neden `tool` eklendi. Öncelik sırası: creator > tag > tool > interest > liked_tag > popular. Arayüzdeki karşılığı "Takip ettiğin Midjourney ile yapıldı".

## Sınama

- **Yerel PostgreSQL:** `supabase/tests/topic-pages.sql` 14 kontrol, `FAILED=0`. Kontrol edilenler:
  - Etiket ve araç süzgeci; benzer adlı başka bir aracın eşleşmemesi.
  - 11 ve 10 argümanlı biçimlerin aynı kalması; `feed_count`.
  - `tool_follows` RLS'i, 100 sınırı, misafirin yazamaması.
  - "Sana özel"de `tool` nedeni.

  `for-you.sql`, `community-content.sql`, `engagement-privacy.sql` ve `saved-collections.sql` de `FAILED=0`.
- **Playwright (ağ taklitli):**
  - Yeni `run-topic-pages` 9/9: üç sayfa, alt kategori geçişi, araç takibi ve geri alma, misafir girişi, gönderideki bağlantılar, eski bağlantı yönlendirmesi, bulunamayan durumlar, İngilizce, masaüstü.
  - `run-discover` 6/6 (güncellendi), `run-search-notifications` 8/8, `run-home-motion` 9/9, `run-detail-pages` 45/45, `run-focus-feed` 23/23.
- Gerçek Supabase'e / oturuma / cihaza karşı **denenmedi**.

## Bilinçli sınırlar

- Araç sayfasında model süzgeci yok; bir model çipi aracın sayfasını açar.
- Kategori ve araç sayfalarının derleme zamanı paylaşım sayfası (`/share/…`) yok; Paylaş doğrudan sayfa adresini verir.
