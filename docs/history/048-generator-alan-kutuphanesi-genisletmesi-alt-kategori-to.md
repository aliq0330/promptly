### 9.48 Generator alan kütüphanesi genişletmesi + alt kategori toplu seçim + Detaylar adımına canlı önizleme

Kullanıcının "mevcut generatordaki alanlar/hazır paketler yeterli mi"
sorusuna verilen dürüst cevap ("hayır, 14 paketin hepsi yalnızca karakter/
görsel kategorilerini kapsıyor, 10 kategorinin hiç paketi yok") üzerine
kullanıcının açık talebiyle dört gerçek değişiklik yapıldı:

**1. Kategoriler ve alanlar genişletildi (`src/lib/generator-field-
catalog.ts`):** 24 kategori → **26 kategori**, 162 alan → **196 alan**,
131 gerçek kategori::alt-kategori çifti. Eklenenler:
- **YENİ kategori — "Ses & Müzik" (`audio`):** `GeneratorCategoryTopic`
  enum'unda ("Ses / Müzik" konusu) baştan beri var olan ama kataloğunda
  HİÇ karşılığı olmayan bir boşluk kapatıldı — 7 alt kategori (Tür/Janr,
  Ruh Hali, Enstrüman, Vokal, Tempo/Ritim, Prodüksiyon, Süre), 12 alan
  (tür, alt tür, ruh hali, enerji seviyesi, enstrüman, vokal stili/dili,
  tempo, BPM, prodüksiyon stili, ses efektleri, süre).
- **YENİ kategori — "Pazarlama & Kampanya" (`marketing`):** aynı şekilde
  `marketing` konusunun daha önce hiç karşılığı yoktu — 6 alt kategori
  (Kampanya Türü, Platform, Hedef Kitle, Çağrı/CTA, Ton, Format), 12 alan
  (kampanya türü, hedef, platform, reklam formatı, hedef kitle, yaş
  aralığı, CTA metni, aciliyet vurgusu, ton, indirim oranı, başlık fikri,
  marka sesi).
- **Var olan kategorilere küçük, gerçek eklemeler:** Kamera & Lens'e yeni
  "Çekim Ayarları" alt kategorisi (ISO, enstantane hızı, beyaz ayarı);
  Metin & İçerik'e "SEO" alt kategorisi (anahtar kelime, meta açıklama);
  Kod & Yazılım'a "Test" alt kategorisi (test türü, coverage hedefi);
  UI/UX'e "Erişilebilirlik" alt kategorisi (WCAG seviyesi, renk
  kontrastı); Karakter Oluşturma'nın Vücut alt kategorisine "Duruş" alanı.

**2. Hazır paketler artırıldı:** 14 paket → **29 paket**. Önceden paketi
HİÇ olmayan 15 kategorinin (Aksesuar, Görsel Stil, Renk & Palet,
Fantastik, Sci-Fi, Silah & Ekipman, Ürün & Reklam, Video, Metin & İçerik,
Kod & Yazılım, AI/Prompt Ayarları, UI/UX, Fotoğraf, artı yeni Ses & Müzik
ve Pazarlama) her birine en az bir gerçek paket eklendi (Fantasy Setup,
Sci-Fi Setup, Weapons & Gear, Product Shot, Video Basics, Content Brief,
Code Project, AI Prompt Settings, UI Screen, Photo Shoot, Accessories,
Visual Style, Color Palette, Music Track, Ad Campaign) — artık 26
kategorinin TAMAMININ en az bir hazır paketi var (önceden yalnızca 11
kategori kapsanıyordu).

**3. "Tümünü seç" — alt kategorideki tüm alanları tek tıkla ekleme
(`field-catalog-picker.tsx`):** Kullanıcının kendi örneği ("Kimlik altında
cinsiyet, yaş grubu vs. toplam 6 tane alan var, hepsini birden
seçebilmeliyim") birebir karşılandı — her alt kategori başlığının
yanına, genişlet/daralt butonundan AYRI bir `<input type="checkbox">`
("Tümünü seç") eklendi. Zaten şemada olan alanlar hiç etkilenmiyor
(`selectableFields` = henüz eklenmemiş olanlar); hepsi seçiliyse kutu
işaretli görünüyor ve tıklamak hepsini kaldırıyor, değilse kalan
seçilebilir tüm alanları tek seferde işaretliyor — `addPackage`'ın
tek-yönlü "her zaman ekle" davranışından bilinçli olarak farklı, gerçek
bir toggle. Yeni bir mekanizma icat edilmedi — `selectedIds` state'inin
üzerine, `addPackage`'ın yanına ikinci bir fonksiyon (`toggleSubgroup`)
olarak eklendi.

**4. Detaylar adımına canlı önizleme + "Önizleme" sekmesinin kaldırılması
(`generator-builder.tsx`):** Kullanıcının "zaten Alanlar'da canlı
önizleme var, Detaylar'a da ekleyip ayrı Önizleme sekmesini kaldıralım"
talebi birebir uygulandı. `STEPS` dizisi `["details", "fields", "preview",
"publish"]`'ten **`["details", "fields", "publish"]`**'e indi (adım
sekmeleri artık 1-Detaylar/2-Alanlar/3-Yayınla). Detaylar adımı, Alanlar
adımıyla BİREBİR AYNI `lg:grid-cols-[1fr_360px]` iki-sütunlu düzene
geçti — solda form, sağda (`lg:sticky`) aynı paylaşılan `<GeneratorPlayground
schema={schema} enableNegativePrompt={meta.enableNegativePrompt} />` —
ayrı bir önizleme bileşeni İCAT EDİLMEDİ, Alanlar adımının zaten
kullandığı, tamamen şema-bağımsız/self-contained aynı bileşen yeniden
kullanıldı. Ayrı `step === "preview"` bloğu tamamen silindi.

**Nasıl doğrulandı:** Yeni kataloğun kendi iç tutarlılığı (node ile,
gerçek dosyaya karşı çalıştırılan küçük script'lerle) doğrulandı: 196
alanın hepsi tekil id'li; 29 paketin TÜMÜNÜN referans verdiği alan id'leri
gerçekten var; 196 alanın TÜMÜNÜN `categoryId`/`subgroupId` çifti gerçekten
`CATALOG_CATEGORIES`'te tanımlı 131 çiftten biri. `npx tsc --noEmit`,
`npm run lint`, tam `npm run build` (26 rota, değişmedi) sıfır hatayla
geçti. Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
Playwright'ta (statik export `npx serve` ile, bu projenin standart
yöntemi) yeni bir test dosyasıyla uçtan uca doğrulandı: Detaylar adımında
"Canlı Önizleme" panelinin gerçekten göründüğü; adım sekmelerinin tam
olarak 3 tane olduğu ve "Önizleme" diye ayrı bir sekmenin hiç kalmadığı;
picker'da yeni paketlerin (Music Track, Ad Campaign, Fantasy Setup,
Sci-Fi Setup) ve yeni kategorilerin (Ses & Müzik, Pazarlama & Kampanya)
göründüğü; "Karakter Oluşturma → Kimlik" açılınca kullanıcının kendi
örneğindeki TAM 6 alanın (Cinsiyet, Yaş Grubu, Karakter Türü, Rol,
Kişilik, Yüz Şekli) göründüğü; "Tümünü seç"e basınca GERÇEKTEN tam 6
alanın seçildiği ("6 alan seçili"), tekrar tıklayınca hepsinin
kaldırıldığı ("Hiç alan seçilmedi"), ve "Ekle (6)"ye basınca 6 alanın da
gerçekten generatorun kendi alan listesine eklendiği; aramanın yeni
alanları da (Ses & Müzik'ten "Vokal", Pazarlama'dan "Kampanya Türü")
bulduğu; Yayınla adımının eklenen 6 alanı doğru yansıttığı — hepsi sıfır
JS hatasıyla.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend/statik veri katmanında, `20260919300000_generators.sql`
şeması hiç değişmedi), kullanıcının Dashboard'da yapması gereken ekstra
bir adım yok; yalnızca canlı sitede yeni kategorileri/paketleri/"Tümünü
seç"i ve Detaylar adımındaki yeni önizlemeyi bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Kataloğun kendisi hâlâ statik/derleme-zamanlı** (Bölüm 9.30'dan beri
  bilinen sınırlama, değişmedi) — yeni bir kategori/alan eklemek hâlâ kod
  değişikliği gerektiriyor; kullanıcıların kendi kalıcı katalog girdisi
  eklemesine izin veren bir yönetim ekranı bu görevde de istenmedi.
- **"Tümünü seç" yalnızca kategori açıkken görünen alt kategoriler için
  var, arama sonuçlarında YOK** — kullanıcının kendi örneği açıkça bir
  kategori/alt-kategori gezinme senaryosuydu (Karakter Oluşturma →
  Kimlik), arama sonuçları için ayrı bir toplu-seçim istenmedi.
- **Genişletme her kategoriyi eşit derinlikte büyütmedi** — iki yeni
  kategori (Ses & Müzik, Pazarlama) tam derinlikte kuruldu, var olan
  kategorilere ise yalnızca gerçek, somut boşluklar (ISO/enstantane hızı,
  SEO, test, erişilebilirlik) eklendi — kullanıcının "genişlet" talebini
  her mevcut alt kategoriye rastgele alan eklemeden, gerçek eksiklikleri
  hedefleyerek karşılamak tercih edildi.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- Yeni Ses & Müzik/Pazarlama kategorilerinin `jsonPath`'leri (`audio.*`,
  `marketing.*`) tamamen yeni, gerçek bir generator ile bu sandbox'ta hiç
  canlı test edilemedi — yalnızca kataloğun kendi iç tutarlılığı ve
  JSON Output Engine'in (Bölüm 9.28, bu görevde hiç değişmedi) zaten var
  olan, jenerik `jsonPath` mantığı üzerinden doğrulandı.

---
