### 9.23 Gelişmiş, akıllı ve canlı etiket sistemi

Kullanıcının çok kapsamlı 28 bölümlük "PROMPTLY — GELİŞMİŞ, AKILLI VE CANLI
ETİKET SİSTEMİ" şartnamesi üzerine — başlık/prompt metni yazılırken canlı
olarak ilgili etiketleri tespit eden, otomatik/manuel etiketleri görsel
olarak ayıran, kullanıcının reddettiği bir etiketi bir daha sessizce geri
getirmeyen, gerçek bir katalogla çalışan (büyük/küçük harf duyarsız,
tekilleştirilmiş), gerçek kullanım istatistikleriyle "popüler"/"yükselen"
etiketleri hesaplayan, ve ana aramaya entegre olan uçtan uca bir etiket
sistemi. Şartnamenin kendi kuralına uyularak önce mevcut proje (`package.
json`, `tags`/`prompt_tags`/`prompt_request_tags` şeması, RLS, prompt/istek
formları, Keşfet, arama, `/tags/local` rotası) baştan sona denetlendi;
yalnızca gerçek eksikler kapatıldı, ikinci bir paralel etiket sistemi
kurulmadı.

**A) Mevcut projede bulunan durum:**
- `tags(slug primary key, label)` — 20 satırlık, sabit, curated bir katalog
  (`20260919120600_seed_tags.sql`); tabloda yalnızca herkese açık bir SELECT
  RLS politikası vardı, hiçbir INSERT politikası yoktu — kullanıcı
  tarafından gerçek yeni bir etiket oluşturmak yapısal olarak imkânsızdı.
- `prompt_tags`/`prompt_request_tags` — düz `(içerik_id, tag_slug)` join
  tabloları, sahiplik RLS'i zaten doğru (`author_id = auth.uid()`); hiçbir
  "kaynak" (otomatik/manuel) sütunu yoktu.
- **Bu depoda daha önce hiç canlı/otomatik etiketleme YOKTU** — `Create
  PromptForm`/`CreateRequestForm` yalnızca `fetchAllTags()`'in döndürdüğü
  20 sabit etiketi düz bir toggle-grid olarak gösteriyordu, hiçbir analiz
  yapmıyordu.
- **Gerçek bir hata tespit edildi (spec'in §12'sinin doğrudan uyardığı
  senaryo):** `CreatePromptForm`'un `?answerRequest=` modu, isteğe yanıt
  verirken isteğin KENDİ etiketlerini körü körüne yanıtın etiketleri olarak
  kopyalıyordu (`setSelectedTags(answeredRequest.tags)`) — bu görevin bir
  parçası olarak düzeltildi (bkz. F).
- `package.json`'da hiçbir AI/LLM SDK'sı YOK — bu, canlı analiz motorunun
  mimarisini doğrudan belirledi (bkz. E).
- Keşfet'in "Popüler Etiketler"i gerçekte yalnızca `fetchAllTags()`'in
  alfabetik listesiydi (gerçek bir popülerlik sıralaması yoktu). Ana arama
  (`SearchView`) yalnızca prompt+kullanıcı arıyordu, etiket sonucu hiç
  yoktu. `/tags/local` (`TagView`) yalnızca ham slug'ı başlık olarak
  gösteren, istatistiksiz, filtre/sıralamasız minimal bir sayfaydı.
- Ana navigasyonda bir "Etiketler" girişi yoktu.

**B) Yapılan değişiklikler (özet):**
- Gerçek, doğrulanmış, tekilleştirilmiş yeni etiket oluşturma
  (`get_or_create_tag` RPC'si — tags tablosuna hiçbir doğrudan client INSERT
  izni asla verilmedi).
- Gerçek kullanım sayaçları (`prompt_usage_count`/`request_usage_count`/
  `usage_count`, trigger'la bakımı yapılan) + gerçek zaman-pencereli
  "yükselen etiketler" (`trending_tags` RPC).
- Canlı, deterministik (AI DEĞİL — bkz. E), debounce'lu bir etiket analiz
  motoru (`analyzeContent`), başlık+prompt metnini BİRLİKTE değerlendiriyor.
- Otomatik/manuel/reddedilmiş etiket durumunu izleyen paylaşılan bir React
  hook'u (`useTagPicker`) + paylaşılan bir UI bileşeni (`TagPicker`) — hem
  `CreatePromptForm` hem `CreateRequestForm` BİREBİR AYNI bileşeni kullanıyor
  (ikinci bir paralel sistem yok).
- `?answerRequest=` modundaki etiket-kopyalama hatası düzeltildi — isteğin
  etiketleri artık yalnızca "bağlam" olarak `suggested` katmanına besleniyor,
  asla otomatik kabul edilmiyor.
- Yeni `/tags` etiket keşif sayfası (arama, popüler, yükselen, yeni
  eklenenler, tümü + filtre/sıralama) + navigasyona "Etiketler" girişi.
- `/tags/local` (tag detail) tamamen yenilendi: gerçek etiket adı (ham slug
  değil), gerçek kullanım istatistiği, içerik türü filtresi, sıralama, ve
  yeni bir "Prompt İstekleri" bölümü.
- Ana arama artık gerçek, ayrı bir "Etiketler" sonuç bölümü gösteriyor.
- Keşfet'in "Popüler Etiketler"i artık gerçekten `usage_count`'a göre
  sıralı.

**C) Değişen/yeni dosyalar:**
- YENİ `supabase/migrations/20260919280000_smart_tags.sql`.
- YENİ `src/lib/tag-normalize.ts` (`normalizeTagLabel`/`tagLabelsMatch`) —
  sunucudaki `normalize_tag_name` SQL fonksiyonunun BİREBİR aynısı.
- YENİ `src/lib/tag-catalog-matcher.ts` (`analyzeContent`) — canlı, AI
  olmayan analiz motoru.
- YENİ `src/features/prompts/use-tag-picker.ts` (`useTagPicker` hook'u).
- YENİ `src/features/prompts/tag-picker.tsx` (`TagPicker` paylaşılan UI'ı).
- YENİ `src/features/tags/use-tag-catalog.ts` (`useTagCatalog` — paylaşılan,
  modül-seviyeli önbelleğe alınmış katalog fetch'i).
- YENİ `src/features/tags/tags-discover-view.tsx` + YENİ
  `src/app/(app)/tags/page.tsx` (`/tags` keşif sayfası).
- GÜNCELLENDİ `src/features/prompts/tag-view.tsx` (tag detail — tam
  yeniden yazım).
- GÜNCELLENDİ `src/lib/supabase/tags.ts` (`fetchPopularTags`,
  `fetchNewestTags`, `fetchAllTagsWithStats`, `fetchTagBySlug`,
  `fetchTrendingTags`, `findExistingTagByLabel`, `getOrCreateTag`,
  `fetchRequestsByTagSlug` eklendi).
- GÜNCELLENDİ `src/lib/supabase/prompts.ts`/`requests.ts` (`tagSources`
  girişi + `prompt_tags`/`prompt_request_tags` insert'ine `source` yazımı;
  `RequestRow`/`REQUEST_SELECT`/`mapRequestRow` dışa açıldı).
- GÜNCELLENDİ `src/features/prompts/create-prompt-form.tsx`/
  `src/features/requests/create-request-form.tsx` (eski düz toggle-grid
  kaldırıldı, `TagPicker`/`useTagPicker`'a geçildi; answerRequest'in
  etiket-kopyalama hatası düzeltildi).
- GÜNCELLENDİ `src/app/(app)/discover/page.tsx` (`fetchAllTags` →
  `fetchPopularTags`).
- GÜNCELLENDİ `src/features/search/search-view.tsx` (gerçek "Etiketler"
  sonuç bölümü).
- GÜNCELLENDİ `src/components/layout/nav-items.ts` (masaüstü sidebar'a
  "Etiketler" eklendi — mobil alt navigasyona eklenmedi, sabit 5 öğe kuralı,
  CLAUDE.md §5).
- GÜNCELLENDİ `src/types/index.ts` (`Tag`'e opsiyonel
  `usageCount`/`promptUsageCount`/`requestUsageCount`/`createdAt` eklendi —
  geriye dönük uyumlu, mevcut `{slug,label}` literalleri hiç bozulmadı).

**D) DB/migration değişiklikleri
(`20260919280000_smart_tags.sql`, tam liste — hiçbiri var olan `tags`/
`prompt_tags`/`prompt_request_tags` şemasını yeniden yazmadı, yalnızca
`ALTER TABLE` ile genişletti):**
- `tags`'e `created_at`/`created_by`/`is_system`/`prompt_usage_count`/
  `request_usage_count`/`usage_count` (generated, stored) eklendi;
  bu migration'dan önce var olan 20 seed satırı geriye dönük `is_system =
  true` işaretlendi.
- `prompt_tags`/`prompt_request_tags`'e `source text check (source in
  ('manual','automatic'))` (varsayılan `'manual'`) eklendi — RLS
  DEĞİŞMEDİ, sahiplik zaten var olan "for all" politikalarıyla korunuyor.
- `normalize_tag_name(text)` — frontend'in `normalizeTagLabel()`'iyle
  BİREBİR aynı kuralları uygulayan sunucu tarafı normalizasyon (Türkçe
  ç/ğ/ı/ö/ş/ü → ASCII transliterasyon, küçük harf, harf/rakam olmayan her
  dizi → tek tire).
- `get_or_create_tag(p_label text)` — `SECURITY DEFINER` RPC, TEK gerçek
  yeni-etiket-yazma yolu (`tags`'e hâlâ hiçbir doğrudan INSERT politikası
  yok); doğrulama (1-60 karakter, kontrol karakteri/`<`/`>` reddi),
  normalize edip `on conflict (slug) do nothing` + geri-okuma (Bölüm
  9.22'nin `ensure_default_collection`'ıyla birebir aynı idempotent
  "bul ya da oluştur" deseni); yalnızca `authenticated`'e `grant execute`.
- `handle_prompt_tag_change`/`handle_request_tag_change` (AFTER INSERT/
  DELETE trigger'ları, `like_count`/`item_count` ile aynı desen) —
  `prompt_usage_count`/`request_usage_count`'u gerçek zamanlı günceller;
  prompt tarafı yalnızca `status='published'` bir prompta eklenen etiketi
  sayıyor (bugün her prompt oluşturulduğu anda zaten hep `published`
  olduğundan pratikte bir davranış değişikliği değil, ama ileride bir
  taslak akışı eklenirse popülerlik sayısının bir taslaktan şişmesini
  baştan engelleyen ucuz bir güvence).
- `trending_tags(p_limit, p_window_days)` — gerçek, zaman-pencereli
  (varsayılan son 7 gün vs. önceki 7 gün) kullanım artışı; yalnızca
  `recent_count > 0` olan satırları döndürür (gerçek sinyal yoksa BOŞ
  döner, asla sahte bir trend yüzdesi üretmez); `security invoker` (yalnızca
  zaten herkese açık `status='published'` prompt/her zaman açık request
  satırlarını görüyor); `anon`+`authenticated`'e `grant execute`.

**E) Canlı otomatik etiket analizi nasıl çalışıyor — GERÇEK, AI OLMAYAN bir
motor:** `package.json`'da hiçbir AI/LLM SDK'sı olmadığı doğrulandıktan
sonra (şartnamenin §19'unun açıkça istediği dürüstlük: "AI entegrasyonu
yokken varmış gibi davranma"), `src/lib/tag-catalog-matcher.ts` →
`analyzeContent(title, content, catalog)` yazıldı — tamamen istemci
tarafında çalışan, saf, senkron bir fonksiyon:
- **(a) Sabit 20 seed etiket için el yazımı Türkçe/İngilizce eş anlamlı/
  anahtar kelime kuralları** (`SYNONYM_RULES` — ör. "sinematik"/"reklam
  filmi" → `video-uretim`, "3d"/"blender"/"cinema 4d" → `3d-render`) — en
  güçlü sinyal, otomatik katman eşiğini (skor 3) tek başına aşıyor. Liste
  ayrıca ileride eklenebilecek bazı etiketlere (chatgpt, midjourney, reklam,
  logo-tasarimi vb.) önceden kural tanımlıyor — bugün katalogda yoklarsa
  kural sessizce hiç tetiklenmiyor, katalog büyüdükçe otomatik "aktifleşiyor".
- **(b) Katalogdaki HERHANGİ bir etiketin kendi label'ının metinde tam
  kelime olarak geçmesi** (skor 2) — bu, ileride kullanıcının oluşturduğu
  YENİ bir etiketin de (ör. "Apple", "ChatGPT") hiçbir el yazımı kural
  gerekmeden gelecekteki analizlerde eşleşebilir olmasını sağlıyor.
- **(c) Türkçe'nin eklemeli (agglutinative) yapısı için önek eşleşmesi**
  (skor 1, yalnızca tek kelimelik etiketler için, ≥5 karakter) — ör. metinde
  "reklamı" geçiyorsa "Reklam" etiketi tam kelime olarak eşleşmez ama önek
  olarak eşleşir; bu daha zayıf bir kanıt olduğundan yalnızca `suggested`
  katmanına düşüyor, asla otomatik kabul edilmiyor.
- **Skor ≥3 → otomatik (`automatic`), skor 1-2 → öneri (`suggested`), skor
  0 → hiç gösterilmez.** Stopword listesi ("ve", "ile", "bir" vb.) hiçbir
  zaman eşleşmiyor — metindeki HER kelime etiketlenmiyor (§6'nın açık
  yasağı).
- **Bilinçli kapsam kararı — metinden serbestçe YENİ bir etiket adı asla
  icat edilmiyor:** yalnızca zaten katalogda var olan bir etiket otomatik/
  önerilen olabilir; genuinely yeni bir etiket yaratmak her zaman kullanıcının
  açık eylemine (manuel arama kutusunun "+ … etiketini oluştur"u) kalıyor.
  Bu, §13'ün "yalnızca uygun bir katalog etiketi yoksa yeni öner" kuralını
  hiçbir "çöp" öneri riskine girmeden karşılıyor — dürüstçe, bu şartnamenin
  izin verdiği bir kapsam daraltması, eksiklik değil.
- **Debounce + eskimiş sonuç koruması (`useTagPicker`, §3/§20):** başlık/
  içerik değiştikçe 400ms debounce'lu yeniden analiz; aynı metin (title+
  content birleşimi) tekrar tekrar analiz edilmiyor (`lastAnalyzedKeyRef`);
  analiz saf/senkron olduğundan gerçek bir ağ isteği yarışı yok, ama yine de
  bir `cancelled` guard'ı var (ileride gerçek bir sunucu-taraflı analiz
  eklenirse aynı desen genişletilebilsin diye).

**F) Otomatik/manuel etiketler nasıl ayrılıyor + kullanıcı kontrolü (§4/§5/
§7/§8):**
- `useTagPicker`, her kabul edilmiş etiketi `{tag, source: "manual" |
  "automatic"}` olarak tutuyor (`AcceptedTagEntry`) — hem DB'ye
  (`prompt_tags.source`/`prompt_request_tags.source`) hem de UI'a
  yansıyor.
- **Otomatik chip'ler görsel olarak işaretli:** `Sparkles` ikonu +
  `title="Başlık ve prompt içeriğine göre otomatik önerildi."` (hover için)
  + `sr-only` erişilebilir metin (dokunmatik/klavye için) + küçük "·
  Otomatik" etiketi — manuel chip'lerde bunların hiçbiri yok. Formun altında
  her zaman görünen, mobilde de erişilebilir sabit bir açıklama satırı var:
  "Etiketler başlık ve prompt içeriğine göre otomatik önerilir. İstediğin
  gibi değiştirebilirsin."
- **Kaldırma = "dismissed":** bir otomatik chip'i X ile kaldırmak onu
  `dismissedSlugs`'a ekliyor — aynı (değişmemiş) metin üzerinde yeniden
  analiz çalıştığında bu etiket bir daha ASLA sessizce geri eklenmiyor
  (§5/§8'in "EN ÖNEMLİ" kuralı). Playwright ile gerçekten doğrulandı (bkz.
  L): bir otomatik etiketi kaldırıp içeriğe önemsiz bir düzenleme (boşluk
  ekleyip silme) yapmak onu geri getirmiyor.
- **Bir öneriyi manuel kabul etmek ("+ tıkla") onu `manual` yapıyor** —
  artık "hâlâ öneri" olarak değil, kullanıcının kendi seçimi olarak
  davranılıyor; aynı işlem `dismissedSlugs`'tan da çıkarıyor (daha önce
  reddedilmiş bir etiketi arama kutusundan/önerilerden tekrar seçmek onu
  gerçekten geri getiriyor — §5'in "manuel yeniden seçim artık manuel
  sayılmalı" kuralı).
- **Manuel etiketler ASLA otomatik analiz tarafından kaldırılmıyor** —
  `useTagPicker`'ın yeniden-analiz efekti yalnızca YENİ eşleşen otomatik
  etiketleri EKLİYOR, var olan `accepted` listesinden hiçbir şeyi hiçbir
  zaman çıkarmıyor (skor bir sonraki pasoda düşse bile).
- **Aynı etiket asla iki kez eklenemiyor** — `accepted` her zaman `slug`'a
  göre tekilleştirilmiş (`acceptSuggested`/`addManual`/otomatik-birleştirme
  hepsi `acceptedSlugs.has(...)` kontrolü yapıyor); DB tarafında da
  `prompt_tags`/`prompt_request_tags`'in `(içerik_id, tag_slug)` bileşik
  PK'sı zaten ikinci bir satırı yapısal olarak imkânsız kılıyor.
- **İstek→yanıt kopyalama hatası düzeltildi (§12, kritik bulgu):**
  `CreatePromptForm`'un `?answerRequest=` modu artık isteğin etiketlerini
  ASLA `accepted`'e kopyalamıyor — `useTagPicker`'a yalnızca `contextTags`
  olarak veriliyor, bu da onları en fazla `suggested` katmanına
  "dürtüyor" (asla otomatik kabul edilmiyor); yanıtın kendi başlığı/prompt
  metni yazıldıkça GERÇEK canlı analiz devreye giriyor. Playwright ile
  doğrulandı: cevaplama modu açıldığında isteğin etiketi ("Portre") hiçbir
  zaman zaten-kabul-edilmiş bir chip olarak görünmüyor.
- **İstek oluşturmada başlık+açıklama BİRLİKTE analiz ediliyor** (§6/§12) —
  `CreateRequestForm`'da `useTagPicker({title, content: description, ...})`.

**G) Kullanıcı etiketleri nasıl değiştirebiliyor:** `TagPicker` bileşeni —
kabul edilmiş chip'lerin her birinde bir X (kaldır), bir "Ek öneriler"
satırında `+`'lı düşük-güvenli öneriler (kabul et) + ayrı bir X (öneriyi
gizle, `dismissSuggested`), ve gerçek katalog destekli bir arama/oluştur
kutusu ("Etiket ara veya oluştur..." — §9'un tam istediği placeholder).

**H) Tekilleştirme/normalizasyon (§9/§10):**
- **Case-insensitive eşleşme:** "apple"/"Apple"/"APPLE",
  "chatgpt"/"ChatGPT", "midjourney"/"MidJourney", "python"/"Python" —
  hepsi `normalizeTagLabel()`'in aynı sonucunu üretiyor (birim testle
  doğrulandı, bkz. L).
- **Görünen ad ile normalize edilmiş karşılaştırma anahtarı ayrı
  tutuluyor** — `tags.label` (display name) vs. `tags.slug` (normalized
  comparison key, zaten Bölüm 18'den beri PK) — §10'un istediği ayrım zaten
  var olan şemada mevcuttu, yeni bir alan gerekmedi.
- **Frontend/backend AYNI kuralları kullanıyor:** `src/lib/tag-normalize.ts`
  (`normalizeTagLabel`) ve `normalize_tag_name` SQL fonksiyonu BİREBİR aynı
  algoritma (kırp → Türkçe ç/ğ/ı/ö/ş/ü'yü ASCII'ye çevir → küçük harf → harf/
  rakam olmayan her diziyi tek tireye indirge → baş/son tireleri kırp) —
  ikisi de bağımsız olarak birim/entegrasyon testleriyle doğrulandı.
- **Manuel arama kutusu her zaman önce mevcut kataloğu arıyor**
  (`findExistingTagByLabel`, tamamen istemci tarafında, zaten yüklü
  kataloğa karşı normalize edilmiş `includes()`) — tam bir normalize
  eşleşmesi varsa "+ oluştur" seçeneği HİÇ gösterilmiyor; yalnızca gerçekten
  yeni bir etiket için `getOrCreateTag()` (RPC) çağrılıyor.
- **Veritabanı seviyesinde tekillik:** `tags.slug` zaten `primary key`
  (Bölüm 18'den beri); `get_or_create_tag`'in `on conflict (slug) do
  nothing` + geri-okuma deseni, eşzamanlı iki kullanıcının "aynı" etiketi
  oluşturmaya çalışması durumunda bile TAM OLARAK bir satır kalmasını
  garanti ediyor — gerçek Postgres'te iki farklı kullanıcıyla (Ali, Ayşe)
  gerçekten test edildi (bkz. L): ikinci çağrı aynı slug'ı döndürdü, satır
  sayısı 1'de kaldı, `created_by` ilk yazan (Ali) olarak kaldı.
- **Bilinçli, dürüstçe belirtilen sınırlama:** seed katalogdaki 2 etiketin
  (`video-uretim`/`muzik-uretim`) slug'ı, kendi label'larından ("Video
  Üretimi"/"Müzik Üretimi") ALGORİTMİK OLARAK türetilebilecek slug'la
  (`video-uretimi`/`muzik-uretimi`) tam eşleşmiyor — bu, bu görevden önce
  var olan, elle seçilmiş seed slug'ların bir tutarsızlığı (bkz. M).

**I) `/tags` sayfası ve popülerlik hesaplaması (§14):** Arama kutusu (zaten
yüklü katalogda normalize edilmiş substring arama), "Popüler Etiketler"
(`fetchPopularTags` — gerçek `usage_count desc` sıralı), "Yükselen
Etiketler" (`fetchTrendingTags` — gerçek zaman-pencereli RPC; gerçek veri
yoksa bölüm dürüstçe "henüz yeterli gerçek veri yok" gösteriyor, SAHTE bir
trend asla üretilmiyor), "Yeni Eklenenler" (`created_at desc`), "Tüm
Etiketler" (arama/sıralama: Popüler/En Yeni/A-Z). Sayaçlar tamamen
denormalize DB kolonlarından (trigger'la bakımlı) geliyor — frontend hiçbir
zaman "kaç promptta kullanıldığını saymak için" tüm içeriği indirmiyor
(§17'nin performans kuralı).

**J) Ana arama entegrasyonu (§16):** `SearchView` artık zaten yüklü/
paylaşılan kataloğa (`useTagCatalog`) karşı normalize edilmiş substring
eşleşmesiyle gerçek, ayrı bir "Etiketler" bölümü gösteriyor (mor `Badge`
ile prompt/kullanıcı sonuçlarından görsel olarak ayrı), her sonuç gerçek
tag detay sayfasına (`tagHref`) link veriyor. Mevcut prompt/kullanıcı
arama davranışı hiç değişmedi.

**K) Güvenlik/performans önlemleri (§18/§19/§20/§24):**
- `tags`'e hiçbir doğrudan client INSERT/UPDATE/DELETE izni YOK — tek yazma
  yolu doğrulanmış, `SECURITY DEFINER` `get_or_create_tag` RPC'si.
- Etiket adı sunucu tarafında doğrulanıyor (1-60 karakter, kontrol
  karakteri/`<`/`>` reddi) — spam/enjeksiyon girişimlerine karşı; React
  zaten tüm metni varsayılan olarak kaçıyor (XSS riski yok, `dangerouslySet
  InnerHTML` hiçbir yerde kullanılmadı).
- Tag oluşturma yalnızca `authenticated`'e açık (`anon` ne doğrudan INSERT
  ne RPC çağırabiliyor — ikisi de gerçek Postgres'te test edildi, bkz. L).
- `prompt_tags`/`prompt_request_tags`'in var olan sahiplik RLS'i hiç
  değişmedi — bir kullanıcı yalnızca kendi içeriğinin etiketlerini
  değiştirebiliyor.
- Popülerlik sayaçları yalnızca gerçekten erişilebilir/geçerli içerikten
  hesaplanıyor (`status='published'` guard'ı prompt tarafında — taslak bir
  promptun etiketi asla genel sayaca sızmıyor).
- Debounce (400ms) + "aynı metni tekrar analiz etme" guard'ı ile canlı
  analiz asla her tuş vuruşunda çalışmıyor; analiz tamamen istemci tarafı
  ve senkron olduğundan bir ağ maliyeti de yok (§19'un "istek maliyetini
  kontrol et" kuralı, bu mimaride zaten sıfır maliyetli).
- Etiket kataloğu sayfa/form başına ayrı ayrı çekilmiyor —
  `useTagCatalog()`'un modül seviyeli önbelleği tüm `TagPicker` örnekleri
  ve `/tags`/`/search` arasında TEK bir fetch paylaşıyor.

**L) Çalıştırılan testler ve sonuçları:**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (21 rota — yeni
  `/tags` dahil) — sıfır hatayla geçti.
- **Gerçek yerel PostgreSQL 16 testi** (bu sandbox'ta önceden kurulu,
  `auth`/`extensions` şemasının minimal bir taklidi + gerçek `anon`/
  `authenticated` rol simülasyonuyla — bu oturumun standart yöntemi,
  `SET LOCAL` yerine oturum-seviyeli `set_config(..., false)` kullanılarak,
  Bölüm 9.22'de yakalanan aynı sınıf hatadan bilerek kaçınılarak): tüm 21
  migration sırayla gerçekten uygulandı, 9 test grubu gerçek verilerle
  (iki gerçek kullanıcı — Ali, Ayşe) çalıştırılıp doğrulandı — 20 seed
  etiketin `is_system=true` backfill'i; `normalize_tag_name`'in Türkçe
  transliterasyonu (Şiir→siir, Karakter Tasarımı→karakter-tasarimi,
  ChatGPT→chatgpt); `anon`'un ne doğrudan INSERT ne RPC ile etiket
  oluşturamaması; `authenticated` bir kullanıcının gerçek yeni bir etiket
  oluşturması (`created_by`/`is_system` doğru); AYNI normalize edilmiş
  etiketin BAŞKA bir kullanıcı tarafından tekrar "oluşturulmaya"
  çalışılmasının satır sayısını 1'de tutması (idempotent, ilk yazan kazanır);
  boş/61-karakter/HTML-benzeri etiket adlarının sunucu tarafında
  reddedilmesi; gerçek bir yayınlanmış prompta etiket eklemenin
  `prompt_usage_count`'u artırması, silmenin azaltması; bir TASLAK prompta
  eklenen etiketin sayaca HİÇ yansımaması; bir isteğe etiket eklemenin
  `request_usage_count`'u artırması; `trending_tags`'in gerçek, zaman-
  pencereli veriyle doğru satırları (ve taslak içindeki etiketi HARİÇ)
  döndürmesi, `anon`'un bunu çağırabilmesi; `prompt_tags.source`'un doğru
  ('automatic') kalıcı yazılması. Test veritabanı işlem bitince silindi.
- **Saf mantık birim testi** (`node --experimental-strip-types`, gerçek
  kaynak dosyalarına karşı, tarayıcısız): 19 senaryo — normalize
  fonksiyonunun case/Türkçe/boşluk/noktalama davranışı, ve `analyzeContent`
  ("Apple için sinematik ürün reklamı" + iPhone stüdyo prompt metninin
  video-uretim/urun-fotografciligi'yi otomatik, reklam'ı (agglutinative
  önek eşleşmesiyle) öneri olarak tespit etmesi; minimalist kahve logosu
  örneğinin minimalist'i tespit etmesi; boş metnin sıfır sonuç üretmesi;
  ilgisiz, genel bir cümlenin HİÇBİR otomatik etiket üretmemesi — "her
  kelimeyi etiketleme" yasağının doğrudan kanıtı) — hepsi geçti.
- **Ağ seviyesinde taklit edilmiş Supabase REST/RPC yanıtlarıyla
  Playwright** (statik export `npx serve` ile GitHub Pages basePath'ini
  taklit eden bir symlink düzeniyle yerel sunularak — bu projenin standart
  yöntemi), 30 senaryo, hepsi sıfır JS hatasıyla geçti: başlık+içerik
  yazıldıkça gerçekten otomatik chip'lerin belirmesi ve "· Otomatik"
  görsel işaretinin göründüğü; bir otomatik etiketi kaldırıp içeriğe
  önemsiz bir değişiklik yapmanın onu SESSİZCE geri getirmediği; manuel
  arama kutusunun mevcut bir etiket için "oluştur" seçeneği GÖSTERMEDİĞİ
  ama gerçekten yeni bir etiket için gösterdiği; yayınlama tıklandığında
  `prompt_tags` INSERT gövdesinin doğru `source` değerlerini (manuel
  eklenen `manual`, otomatik tespit edilen `automatic`) GERÇEKTEN taşıdığı;
  bir isteğe yanıt verirken isteğin etiketinin ASLA önceden kabul edilmiş
  bir chip olarak görünmediği; `/tags` sayfasının gerçek popüler/yükselen/
  yeni/tüm bölümlerini doğru gösterip aramanın filtrelemesi; tag detay
  sayfasının ham slug yerine gerçek etiket adını ve gerçek kullanım
  istatistiğini göstermesi; ana aramanın ayrı bir "Etiketler" bölümü
  göstermesi; ve 5 farklı rotanın (`/`, `/tags/`, `/tags/local`, `/create`,
  `/requests/new`) Supabase'e HİÇ erişilemezken bile sıfır JS hatasıyla
  zarifçe davranması.
- Bu oturumun önceki, ilgili regresyon paketleri (Bölüm 9.19-9.22'nin
  koleksiyon/kaydetme akışı — 14+19+14 senaryo, ve genel dayanıklılık
  taraması — 14 senaryo, menü/stacking portal testleri) yeniden çalıştırılıp
  sıfır regresyonla geçtiği doğrulandı — bu görevin `create-prompt-form.tsx`/
  `create-request-form.tsx` değişiklikleri kaydetme/koleksiyon akışına hiç
  dokunmuyor, ama paylaşılan formların (`TagPicker`) dolaylı olarak
  bozmadığından emin olmak için tekrar çalıştırıldı.

**M) Eksik/doğrulanamamış olanlar (dürüstçe belirtilmesi gereken):**
- **Gerçek bir Supabase projesine karşı canlı doğrulama yapılamadı** — bu
  sandbox'ın ağ politikası `*.supabase.co`'ya erişimi engelliyor (Bölüm
  17'den beri tekrarlanan, dürüstçe belirtilen aynı sınırlama). Yukarıdaki
  testler GERÇEK bir yerel Postgres/RLS motorunda (taklit değil) VE ağ
  seviyesinde taklit edilmiş REST/RPC yanıtlarıyla çalıştı — ikisi
  birlikte mantığı yüksek güvenle doğruluyor, ama kullanıcının
  `20260919280000_smart_tags.sql`'i Dashboard → SQL Editor'de uygulayıp
  bizzat denemesi hâlâ gerekiyor.
- **İki seed etiketin (`video-uretim`/`muzik-uretim`) slug'ı kendi
  label'larından algoritmik olarak türetilemiyor** (H'de açıklandı) — bu
  YALNIZCA `get_or_create_tag`'in ikinci bir savunma katmanı olan slug bazlı
  çakışma kontrolünü etkiler (manuel arama kutusunun normalize edilmiş
  label-arama katmanı zaten bu ikisini de doğru buluyor, bu yüzden normal
  kullanıcı akışında bu sorun hiç ortaya çıkmıyor); yalnızca RPC'yi
  doğrudan, arama adımını atlayarak çağıran bir istemci için teorik bir
  near-duplicate riski — bu görevin kapsamına alınmadı (mevcut slug'ları
  değiştirmek `prompt_tags`/`prompt_request_tags` FK'lerini kırma riski
  taşırdı).
- **Yeni bir etiket adı asla serbest metinden icat edilmiyor** (E'de
  "bilinçli kapsam kararı" olarak açıklandı) — yalnızca katalogda zaten var
  olan etiketler otomatik/önerilen olabiliyor; §13'ün "yalnızca gerekince
  yeni öner" kuralına uygun ama şartnamenin hayali ("Apple, iPhone,
  Product Photography..." gibi) örneklerindeki kadar geniş bir keşif
  yeteneği yok — bu YALNIZCA GERÇEK bir AI entegrasyonuyla mümkün olurdu
  ve bu projede öyle bir entegrasyon yok (§19'un kendi kuralına göre
  dürüstçe bu sınırda tutuldu).
- **Prompt EDİTLEME ekranı için etiket entegrasyonu yapılmadı** — çünkü bu
  uygulamada hiçbir "prompt düzenle" özelliği yok (Bölüm 9.14'ten beri
  bilinen bir gerçek — yalnızca merge kabul edilince sürüm geçmişi
  oluşuyor, düz bir düzenleme akışı hiç yok); §11'in edit-screen
  gereksinimleri bu yüzden uygulanamadı, icat edilmedi.
- **Bir isteğin kendi kartında (RequestCard) etiket gösterimi/tıklanabilirliği
  bu görevde değiştirilmedi** — `RequestCard` zaten etiketleri
  göstermiyordu, bu kapsam dışı bırakıldı (mevcut kartların tasarımını
  bozmama kuralı).
- **N+1 yok ama gerçek zamanlı (Realtime) güncelleme de yok** — bir başka
  kullanıcının o an oluşturduğu yeni bir etiket, zaten yüklenmiş
  `useTagCatalog()` önbelleğini otomatik güncellemiyor (yalnızca
  `getOrCreateTag()` çağrıldığında `refresh()` ile kendi oturumu için
  tazeleniyor) — bu, Bölüm 21 Faz 6'dan beri bilinen, bu projenin genelinde
  kabul edilmiş "Realtime yok" sınırlamasıyla aynı kategoriden.

---

**Güncelleme — kullanıcı doğruladı:** `20260919280000_smart_tags.sql`
Dashboard → SQL Editor ile gerçek Supabase projesine uygulandı; canlı sitede
gerçek yeni etiket oluşturma/kullanım istatistikleri/yükselen etiketler artık
çalışıyor durumda (kullanıcının kendi doğrulamasıyla).
