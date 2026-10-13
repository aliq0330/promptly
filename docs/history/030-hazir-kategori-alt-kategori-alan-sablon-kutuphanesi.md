### 9.30 Hazır Kategori / Alt Kategori / Alan Şablon Kütüphanesi

Kullanıcının çok kapsamlı "PROMPTLY GENERATOR — HAZIR KATEGORİ / ALT
KATEGORİ / ALAN ŞABLON KÜTÜPHANESİ" şartnamesi üzerine — Generator
Builder'daki "Alanlar" adımına, her alanı sıfırdan elle tanımlamak yerine
hazır, curated bir kütüphaneden (24 kategori, onlarca alt kategori, 100+
gerçek alan/seçenek) seçip tek tıkla eklenebilen bir "Alan Ekle" seçici
eklendi.

**Kritik mimari çelişki, kod yazılmadan önce fark edildi ve kullanıcıya
soruldu:** Şartnamenin `promptVariable`/`{{token}}` + `promptValue`
(görünen etiketten ayrı, cümleye gömülecek bir "anlamsal" değer) sistemi,
Bölüm 9.29'da kullanıcının kendi açık isteğiyle SİLİNEN `{{variable}}`
Prompt Template Engine'in aynısıydı ("generatoru YAPAN değil KULLANAN
kişi" artık prompt yazıyor). Bunu sessizce geri getirmek ya da sessizce
görmezden gelmek yerine `AskUserQuestion` ile üç seçenek sunuldu (yalnızca
JSON katalog / opsiyonel taslak yardımcısı / şablon motorunu geri getir)
— **kullanıcı "Yalnızca JSON katalog"u seçti.** Bu, bağlayıcı bir mimari
karar: kütüphanedeki HİÇBİR alan/seçenek `promptValue`/`promptVariable`/
`{{token}}` taşımıyor — yalnızca gerçek bir `jsonPath` (JSON Output
Engine'e, Bölüm 9.28) ve gerçek, kanonik bir seçenek `value`'su var.
Prompt/Negative Prompt kutuları Bölüm 9.29'un bıraktığı gibi tamamen
serbest yazım olarak duruyor — bu görev onlara hiç dokunmadı.

**Yeni, saf veri dosyası — `src/lib/generator-field-catalog.ts`:**
`GeneratorFieldOption`'ın zaten `{label, value}` (üçüncü bir alan yok) ve
`GeneratorFieldType`'ın zaten tam 11 değerli olması sayesinde bu özellik
**hiçbir şema/tip/migration değişikliği gerektirmedi** — yalnızca yeni,
saf veri + yeni UI. Dosya 24 kategori (`CATALOG_CATEGORIES`, her biri
gerçek alt kategorilerle), ~115 gerçek alan (`CATALOG_FIELDS` — Karakter
Oluşturma, Kıyafet & Moda, Aksesuar, Poz & Hareket, Yüz İfadesi, Ortam &
Mekân, Hava & Atmosfer, Işıklandırma, Kamera & Lens, Görsel Stil, Renk &
Palet, Kompozisyon, Görsel Efektler, Fantastik, Sci-Fi & Cyberpunk, Silah
& Ekipman, Ürün & Reklam, Video, Metin & İçerik, Kod & Yazılım, AI/Prompt
Ayarları, UI/UX Tasarım, Fotoğraf, Negative & Quality — hepsi temsil
ediliyor) ve 14 hazır alan paketi (`CATALOG_PACKAGES` — Basic Character,
Face Details, Eye Details, Hair Details, Body Anatomy, Clothing, Pose,
Expression, Environment, Lighting, Camera, Composition, Effects,
Quality) içeriyor. Üç yardımcı fonksiyon: `fieldsInSubgroup`,
`packageFields`, `searchCatalogFields` (normalize edilmiş, Türkçe
duyarsız arama — `normalizeTagLabel`, Bölüm 9.23, yeniden kullanıldı,
yeni bir normalize fonksiyonu yazılmadı).

**Kapsam kararı (açıkça belirtildi, gizlenmedi):** Şartname 24 kategoride
yüzlerce tekil seçenek değeri listeliyordu; bu, birebir satır satır
transkribe edilmedi (binlerce düşük değerli veri satırı olurdu) — bunun
yerine her kategoride gerçekten kullanılabilir, gerçek `jsonPath`'lere
sahip bir başlangıç kütüphanesi kuruldu, mimarisi (düz `CatalogField[]`
dizisine yeni satır eklemek) ileride büyütülmeye hazır.

**Yeni UI — `src/features/generators/field-catalog-picker.tsx`
(`FieldCatalogPicker`):** "Alanlar" adımındaki "Alan ekle" butonu artık
doğrudan `FieldEditorModal`'ı değil, bu yeni seçiciyi açıyor:
- **Arama:** `searchCatalogFields` ile canlı, Türkçe duyarsız arama —
  hem alan etiketine hem alt kategori/kategori adına bakıyor.
- **Hazır Paketler:** her paket bir buton; tıklamak paketin TÜM
  alanlarını (şemada zaten var olanlar hariç) seçime ekliyor.
- **Kategori → Alt Kategori → Alan gezinme:** native HTML5 accordion
  (bu projenin zaten `category-manager.tsx`/`remix-branch-map.tsx`'te
  kullandığı "harici kütüphane yok" ilkesiyle), onay kutulu çoklu seçim.
- **Yinelenen alan engeli:** şemada zaten (büyük/küçük harf ve Türkçe
  duyarsız, `normalizeTagLabel` ile) aynı etikete sahip bir alan varsa,
  o katalog satırı "Zaten eklendi" etiketiyle işaretlenip devre dışı
  bırakılıyor (checkbox `disabled`) — bir paket eklerken de zaten
  eklenmiş üyeler otomatik atlanıyor, mükerrer satır asla oluşmuyor.
- **Toplu ekleme:** seçilen tüm alanlar tek bir "Ekle (N)" tıklamasıyla
  birden eklenip seçici kapanıyor.
- **"+ Özel Alan Oluştur":** seçiciyi kapatıp var olan `FieldEditorModal`'ı
  create modunda açıyor — tamamen özel bir alan hâlâ mümkün, ikinci bir
  paralel "özel alan" sistemi icat edilmedi.

**Seçici, gerçek bir `GeneratorField` HİÇ inşa etmiyor — bilinçli bir
katman ayrımı:** seçilen `CatalogField[]`'i `onInsert` ile
`generator-builder.tsx`'e geri veriyor; yeni `handleInsertCatalogFields`
(generator-builder.tsx) bunları `handleDuplicateField`'ın ZATEN kullandığı
BİREBİR AYNI `makeFieldKeyFromLabel`/sıralama mantığıyla gerçek
`GeneratorField`lere çeviriyor — bir `GeneratorField`'ın nasıl
oluşturulacağına dair TEK bir gerçek yer var, iki değil. Eklenen her alan
aktif kategoriye gidiyor (`activeCategoryId === UNCATEGORIZED_CATEGORY_ID
? (schema.categories[0]?.id ?? "") : activeCategoryId` — `FieldEditorModal`
açılışında zaten kullanılan aynı çözümleme deseni).

**Kataloktan eklenen bir alan, elle oluşturulan bir alandan HİÇBİR
şekilde ayrı davranmıyor:** gerçek bir `GeneratorField` olduğundan, Output
Mapping (jsonPath/grup/özellik), koşullu görünürlük, yeniden adlandırma,
çoğaltma, sıralama, silme — hepsi `FieldEditorModal`/`FieldList` üzerinden
tamamen aynı şekilde çalışıyor; "hazır" (sistem) katalog alanı ile
"özel" alan arasında ŞEMADA hiçbir ayrım kolonu YOK (şartnamenin "sistem
katalog alanları vs. creator-custom alanlar ayrı tutulmalı" isteği, veri
KAYNAĞI [`generator-field-catalog.ts` vs. elle yazılan] seviyesinde zaten
ayrı olduğundan — kataloğun kendisi hiç değişmiyor/silinmiyor, yalnızca bu
generatorun ondan TÜRETİLMİŞ kendi kopyası düzenleniyor — runtime şema
seviyesinde ekstra bir bayrak eklemeye gerek kalmadan karşılanıyor).

**Nasıl doğrulandı:**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
  değişmedi — yeni bir route eklenmedi) sıfır hatayla geçti.
- Saf mantık birim testi (`node --experimental-strip-types`, gerçek
  `generator-field-catalog.ts`'e karşı) — 152 assertion: 24 kategori/
  hepsinin en az bir alt kategorisi, id tekilliği (kategori/alt kategori/
  alan), her alanın gerçek bir kategori+alt kategoriye ve dolu bir
  `jsonPath`'e sahip olduğu, seçim ailesi alanların en az bir seçeneği
  olduğu, **hiçbir alanın/seçeneğin `promptValue`/`promptVariable`
  taşımadığı** (kullanıcının açık mimari kararının doğrudan kanıtı),
  `fieldsInSubgroup`/`packageFields`/`searchCatalogFields`'ın doğru
  çalıştığı (bilinmeyen bir paket id'sini sessizce atlama, boş/anlamsız
  sorguda sıfır sonuç dahil), ve her alt kategori içinde etiket
  çakışması olmadığı — hepsi geçti.
- Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla Playwright'ta
  (bu projenin standart yöntemi) yeni, 26 senaryolu bir pakette
  (`generator-catalog-test.mjs`) doğrulandı: seçiciyi Escape ile hiçbir
  şey eklemeden kapatma; arama ile gerçek bir alanı bulup ekleme (gerçek
  `jsonPath`'i ve tip rozetiyle field-list'te göründüğü); **aynı alanı
  ikinci kez eklemeye çalışınca "Zaten eklendi" işaretlenip checkbox'ın
  gerçekten `disabled` olduğu**; bir paketin, şemada zaten var olan üyeyi
  atlayıp yalnızca gerçekten yeni olanları (4 değil 3) seçtiği; kategori→
  alt kategori gezinmesinin adım adım doğru açılıp kapandığı (alt
  kategorinin kendi alanları, kategori/alt kategori genişletilmeden asla
  görünmediği); kataloktan eklenen bir alanın var olan, değişmemiş
  `FieldEditorModal`'da tam olarak düzenlenebilir olduğu; "+ Özel Alan
  Oluştur"un seçiciyi kapatıp GERÇEKTEN boş (kataloktan hiçbir şey
  önceden doldurulmamış) bir özel alan formuna götürdüğü — hepsi sıfır
  JS hatasıyla.
- Bölüm 9.27-9.29'un mevcut Playwright regresyon paketleri
  (`generators-e2e-test.mjs` 44/44, `generator-json-output-test.mjs`
  18/18) — ikisinin de "Alan ekle"ye tıklayıp doğrudan `#field-label`
  bekleyen eski akışı, artık seçiciden geçip "Özel Alan Oluştur"a
  tıklayacak şekilde güncellenerek — sıfır regresyonla yeniden
  çalıştırıldı (bu, önceki fazların UI akışı değiştiğinde eski testleri
  güncelleme konvansiyonunun [ör. Bölüm 9.29'un "Şablon" adımı testleri]
  aynısı — uygulama kodunda bu düzeltme için hiçbir değişiklik
  yapılmadı). Ayrıca ilgisiz regresyon paketleri (`resilience-test.mjs`
  14/14, `prompt-variables-e2e-test.mjs` 48/48, `collections-e2e-test.mjs`
  19/19, `save-flow-e2e-test.mjs` 14/14) sıfır regresyonla yeniden
  çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend/TypeScript katmanında, `20260919300000_generators.sql`
şeması hiç değişmedi), kullanıcının Dashboard'da yapması gereken ekstra
bir adım yok; yalnızca canlı sitede gerçek bir generator oluşturup yeni
"Alan Ekle" seçicisini bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Şartnamenin yüzlerce tekil seçenek değerinin tamamı transkribe
  edilmedi** (yukarıda "Kapsam kararı" altında açıklandı) — genişletilmesi
  kolay bir mimari bırakıldı (yeni bir `CatalogField` satırı eklemek
  yeterli), ama bu görev tam bir birebir transkripsiyon değil.
- **Kategori/alan favorileme, "son kullanılanlar" listesi, creator'ın
  kendi özel kategori/paketini oluşturup kaydetmesi eklenmedi** —
  şartnamenin "Geliştirme Notları"ndaki ileri seviye önerilerdi, bu ilk
  sürümün kapsamına alınmadı; kütüphanenin kendisi (statik, tüm
  kullanıcılar arasında paylaşılan) bunları engellemiyor, ileride ayrı
  bir iş olarak eklenebilir.
- **`promptVariable`/`promptValue`/`{{token}}` hiçbir yerde yok**
  (yukarıda "Kritik mimari çelişki" altında açıklandı) — kullanıcının
  kendi seçtiği "Yalnızca JSON katalog" kararının doğrudan, kasıtlı
  sonucu.
- **Alan etiketi değiştiğinde katalogdaki "orijinal" kaydın kendisi hiç
  etkilenmiyor** — kataloğa eklenen bir alan, o andan itibaren generatorun
  KENDİ şemasının bağımsız bir kopyası (tıpkı elle oluşturulan bir alan
  gibi); şartnamenin "hazır alan asla kütüphaneden silinmez, yalnızca bu
  generatordan kaldırılır" ilkesi bunun doğal bir sonucu — kütüphane
  (`generator-field-catalog.ts`) sabit kod, hiçbir kullanıcı eylemi onu
  hiç değiştirmiyor/değiştiremiyor.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Kütüphane derleme-zamanlı/statik** — yeni bir kategori/alan eklemek
  kod değişikliği (yeni bir `CatalogField`/`CatalogCategory` satırı)
  gerektiriyor; kullanıcıların kendi kalıcı, paylaşılan katalog
  girdilerini eklemesine izin veren bir yönetim ekranı bu görevde
  istenmedi, eklenmedi (Bölüm 9.24'ün aday etiket sözlüğüyle aynı
  kategoriden bir kapsam kararı).
- **Seçicide sürükle-bırak yeniden sıralama yok** — kütüphaneden eklenen
  alanların sırası, ekleme sırasına göre `FieldList`'in kendi (zaten var
  olan) sürükle-bırak sıralamasıyla sonradan değiştirilebiliyor; seçicinin
  kendi içinde bir ön-sıralama arayüzü yok, buna gerek de yoktu.

---
