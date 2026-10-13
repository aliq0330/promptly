### 9.58 Ortak içerik taksonomisi (içerik türü → kategori → alt kategori)

Promptly'nin 5 değerli içerik türü (`image/text/video/code/music`) 4 ana türe
indirildi: **Görsel / Metin / Ses / Video** (`code` → Metin › Kodlama,
`music` → Ses › Müzik). Kategori ve alt kategoriler tek bir merkezi kaynakta:
`src/lib/content-taxonomy.ts` (4 tür, 32 kategori, 280 alt kategori; sabit
İngilizce snake_case slug'lar DB'de/URL'de, etiketler TR/EN aynı dosyada
`taxonomyLabel(labelKey, language)`; anahtar biçimi
`taxonomy.<tür>.<kategori>[.<alt>]`). Hiçbir bileşen kategori listesi
hard-code etmez.

- **Model:** `Prompt`/`PromptRequest`/`Generator` artık `contentType` +
  `category` + `subcategory` (ikisi opsiyonel, geçersiz slug istemcide
  `sanitizeTaxonomy` ile yok sayılır, içerik hiç gizlenmez). Generator'ın
  eski "konu" enum'u (`GeneratorCategoryTopic`) ve `generatorTopic.*`
  anahtarları kaldırıldı; serbest metin alt kategori artık taksonomi slug'ı.
- **Migration:** `20260919450000_content_taxonomy.sql` — `category`/
  `subcategory` kolonları, CHECK'in 4 türe daralması, `code`/`music`
  satırlarının taşınması, generator'a `content_type` (eski konudan
  türetilir; design→görsel/Tasarım, writing→metin/Yazarlık, marketing→metin/
  Pazarlama, code→metin/Kodlama), filtre indeksleri. **Uygulanmadan bu
  kod canlıda çalışmaz** (yeni kolonlar seçiliyor). Canlıda 8+5 prompt ve
  4+1 istek `code`/`music` idi.
- **UI (ortak):** `features/content/taxonomy-picker.tsx` (formlar: prompt,
  istek, generator — tür zorunlu, kategori/alt kategori isteğe bağlı, yalnız
  seçili türün kategorileri DOM'a basılır), `taxonomy-filter.tsx` (Keşfet,
  Arama, Generatorlar, İstekler, Etiket sayfası), `taxonomy-links.tsx`
  (prompt/istek detayında kategori linkleri → `/search?q=`).
- **Arama:** `parseTaxonomyQuery` "aliq03 görsel anime" → kullanıcı +
  Görsel + Stil › Anime; `SmartSearchInput` (Keşfet + Arama) kullanıcı, tür,
  kategori, alt kategori ve YALNIZCA mevcut etiketleri önerir. Sonuçlar
  prompt/generator/istek için aynı sunucu filtresiyle (`author_id`,
  `content_type`, `category`, `subcategory`) gelir; elle seçilen filtre
  yorumu geçersiz kılar.
- **Bilinçli sınırlar:** eski içeriklerin kategorisi yok (yalnız tür
  filtresiyle bulunur; `code`/`music` satırları Kodlama/Müzik'e taşınır);
  kart tasarımlarına kategori eklenmedi; profil filtresi tür seviyesinde
  kaldı. Test: tsc/lint/build temiz; ağ taklitli Playwright'ta arama
  yorumlama + önerileri, filtre sorgu parametreleri, üç formun INSERT
  gövdesi, Keşfet/İstekler filtreleri ve mobil taşma doğrulandı; gerçek
  Supabase'e karşı denenmedi. Kategori isimleri TR/EN eklendi.
