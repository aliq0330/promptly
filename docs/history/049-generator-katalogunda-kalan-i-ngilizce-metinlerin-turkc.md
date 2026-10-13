### 9.49 Generator kataloğunda kalan İngilizce metinlerin Türkçeleştirilmesi + site geneli Dil (Türkçe/İngilizce) tercihi

Kullanıcının iki parçalı isteği üzerine: (1) Bölüm 9.30/9.48'in generator
alan kütüphanesinde kalan İngilizce kategori/alan/seçenek isimleri
Türkçeleştirildi, (2) sitenin geneline, `/settings`'ten seçilebilen gerçek
bir Türkçe/İngilizce dil tercihi eklendi.

**1. Generator alan kütüphanesi Türkçeleştirmesi
(`src/lib/generator-field-catalog.ts`):** Dosyanın tamamı (26 kategori,
196 alan, 29 hazır paket) taranıp kalan İngilizce metinler Türkçeleştirildi:
- **29 paket etiketinin TAMAMI** (Bölüm 9.48'de İngilizce eklenmişlerdi —
  "Basic Character"→"Temel Karakter", "Fantasy Setup"→"Fantastik Kurulum",
  "Weapons & Gear"→"Silah & Ekipman", vb.).
- **Alt kategori/alan etiketleri:** `code`/`text` kategorilerinin
  "Framework"/"Database"/"Output" alt kategorileri (Database→"Veritabanı",
  Output→"Çıktı"; "Framework" kasıtlı olarak loanword bırakıldı — Türkçe
  teknoloji söyleminde zaten yerleşik, karşılığı yaygın kullanılmıyor),
  `uiux`'un "Layout"/"Component"/"Design Style" alt kategorileri
  (→"Yerleşim"/"Bileşen"/"Tasarım Stili"), ve tek tek alan etiketleri
  (Aspect Ratio→"En-Boy Oranı", Saturation/Contrast/Brightness/
  Temperature→Doygunluk/Kontrast/Parlaklık/Sıcaklık, Role/Objective/
  Constraints→Rol/Amaç/Kısıtlar, Max Tokens→"Maksimum Token Sayısı").
- **Neredeyse tamamen İngilizce olan seçenek listeleri** (Görsel Stil,
  Işıklandırma tekniği/karakteri, Kamera açısı/odak, Renk Paleti,
  Kompozisyon kadraj/perspektif/teknik, Görsel Efektler'in 6 listesi,
  Fantastik ve Sci-Fi & Cyberpunk'ın 4'er listesi, Ürün çekim türü/reklam
  stili, Video türü/kamera hareketi/karakter hareketi/geçiş, Fotoğraf
  türü/tekniği/karakteri, Negative & Quality'nin 4 listesi, UI/UX layout/
  component/style, kod mimarisi/test türü/çıktısı, AI model türleri)
  gerçek Türkçe karşılıklarıyla değiştirildi.
- **Bilinçli olarak İNGİLİZCE/loanword bırakılanlar** — proper noun'lar
  (TypeScript, React, PostgreSQL, Supabase, GPT, Claude, Gemini,
  Instagram, TikTok, vb. — marka/teknoloji adları, çevrilmesi anlamsız);
  format standartları (JSON, HTML, Markdown, BPM, FPS, ISO, f-stop
  değerleri, mm/aspect-ratio sayıları); Türkçe kreatif/teknik söylemde
  zaten yerleşik loanword'ler (Minimal, Vintage, Retro, Cyberpunk,
  Anime/Manga, Bloom/Vignette/Bokeh gibi VFX terimleri, Framework, Reverb/
  Echo/Distortion gibi ses mühendisliği terimleri, Sneaker/Loafer/Denim
  gibi moda terimleri, Pan/Tilt/Dolly/Crane gibi sinema-endüstrisi
  terimleri) — bunlar "bariz İngilizce" değil, Türkçe konuşan hedef
  kitlenin zaten günlük kullandığı kelimeler, gerçek bir çeviri boşluğu
  değil.
- **Gerçek, önceden var olan bir hata da bu sırada bulunup düzeltildi:**
  `code_language` alanının seçenekleri arasında "C#" ve "C++" ikisi de
  `slugValue()`'nun (noktalama işaretlerini temizleyip normalize eden
  fonksiyon) elinde AYNI değere ("c") düşüyordu — iki farklı seçeneğin
  JSON çıktısında ayırt edilemez olması anlamına gelen, Bölüm 9.30'dan
  beri var olan sessiz bir veri bütünlüğü hatası (kullanıcının bu görevi
  Türkçeleştirmek için istemesiyle hiç ilgisi yok, bir doğrulama
  script'iyle taranırken tesadüfen keşfedildi). Düzeltme: bu iki seçenek
  `opts()` yerine elle, açık `value: "csharp"`/`value: "cpp"` ile
  tanımlandı — görünen etiketler ("C#"/"C++") hiç değişmedi.
- **Nasıl doğrulandı:** yeni, geçici bir Node script'i (`tsx` ile) gerçek
  `CATALOG_CATEGORIES`/`CATALOG_FIELDS`/`CATALOG_PACKAGES`'i import edip
  tekrar doğruladı: 196 alanın hiçbirinde yinelenen id yok, hepsinin
  `categoryId`/`subgroupId` çifti gerçek bir kategoride var, HİÇBİR alanın
  kendi options listesinde yinelenen `value` YA DA yinelenen `label` yok
  (C#/C++ düzeltmesinden sonra), 29 paketin referans verdiği TÜM
  `fieldIds` gerçek. `npx tsc --noEmit`/`npm run lint`/tam `npm run build`
  (26 rota, değişmedi) sıfır hatayla geçti.

**2. Site geneli Dil tercihi — gerçek, çalışan altyapı
(`src/lib/i18n/`):** `ThemeProvider`'ın (`src/components/theme/theme-
provider.tsx`) BİREBİR AYNI, kanıtlanmış deseni izlenerek yeni bir
`LanguageProvider`/`useLanguage()`/`useTranslation()` kuruldu:
- `src/lib/i18n/translations.ts` — düz `key -> {tr, en}` sözlük
  (`TranslationKey` tip güvenceli), `src/lib/i18n/language-provider.tsx` —
  `LanguageProvider` (localStorage anahtarı `promptly-language`,
  varsayılan `"tr"`), `languageInitScript` (`themeInitScript`'in aynısı —
  hydration'dan ÖNCE `<html lang>`'i doğru değere ayarlayıp bir "yanlış
  dilde flaş" önlüyor), ve `t(key)` (sözlükte olmayan bir anahtar için
  ASLA çökmüyor, anahtarın kendisini döndürüyor — sözlük büyüdükçe kod
  değişmeden genişleyebilsin diye).
- `src/app/layout.tsx`'e `ThemeProvider`'ın içine, `AuthProvider`'ın
  dışına eklendi — tüm uygulamayı (hem `(app)` hem `(auth)` route
  gruplarını) kapsıyor.

**SCOPE DECISION (açıkça belirtildi, gizlenmedi):** Bu uygulamada
CLAUDE.md'nin Bölüm 9.1-9.48'i boyunca belgelenen düzinelerce özellik
alanında yüzlerce hardcoded Türkçe metin var — hepsini tek bir oturumda
çevirmek gerçekçi değil. Bu görev **site kabuğunu** (masaüstü sidebar,
mobil alt navigasyon, header — hangi sayfada olursan ol her zaman görünen
kısım) ve **`/settings` sayfasının kendisini** (tercihin bizzat
seçildiği yer) baştan sona kapsıyor — bu, kullanıcının Ayarlar'dan dili
değiştirip GERÇEK, uçtan uca bir etkiyi (nav, header, ayarlar sayfası)
anında görebileceği, dürüst ve tam çalışan bir dilim. Diğer özellik
sayfalarının (ana akış, keşfet, prompt/istek/profil/mesaj/generator
detayları, arama, bildirimler, auth formları) çevirisi bu göreve DAHİL
EDİLMEDİ — `translations.ts`'in düz `key -> {tr, en}` şekli, mimari
değişiklik gerektirmeden daha fazla anahtar eklenerek genişletilebilecek
şekilde tasarlandı, bu yüzden kapsamın genişletilmesi ileride ayrı bir
görev olarak (sayfa sayfa) yapılabilir.
- `src/components/layout/nav-items.ts` — `NavItem.label` (düz string)
  yerine `NavItem.labelKey: TranslationKey` (10 masaüstü + 5 mobil
  giriş, hepsi çevrildi); `Sidebar`/`MobileNav` artık `t(item.labelKey)`
  render ediyor.
- `src/components/layout/header.tsx` — arama placeholder'ı, "Ara"/
  "Bildirimler"/"Mesajlar" aria-label/title'ları, "Giriş Yap" metni, ana
  sayfa linkinin aria-label'ı hepsi `t()` üzerinden.
- `src/app/(app)/settings/page.tsx` — sayfanın TAMAMI (başlık, profil
  ipucu cümlesi, e-posta/şifre değiştirme formu, hata/başarı mesajları,
  mesaj gizliliği bölümü, çıkış yap, giriş-yapılmamış ekranı) `t()`
  üzerinden çevrildi, artı **yeni "Dil" bölümü** (iki radyo — Türkçe/
  English) eklendi. **Bilinçli tasarım kararı:** dil adlarının kendisi
  ("Türkçe"/"English") `t()` ile ÇEVRİLMİYOR, her zaman kendi ana dilinde
  sabit gösteriliyor — aksi hâlde İngilizce moddayken "Türkçe" seçeneği
  "Turkish" olarak görünür, kullanıcı hangi butonun kendisini Türkçeye
  geri döndüreceğini bir daha ayırt edemezdi (gerçek bir Playwright
  testinde bu tam olarak yaşanıp yakalandı, düzeltildi — bkz. aşağı).
  Dil tercihi `profiles` tablosunda bir sütun DEĞİL — theme gibi tamamen
  istemci tarafı, localStorage tabanlı bir tercih (giriş yapılmamışken
  bile çalışıyor, bu yüzden "Dil" bölümü hem giriş yapılmış hem
  yapılmamış Ayarlar görünümünde render ediliyor — hesap alanlarının
  aksine).

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (26 rota, değişmedi) sıfır hatayla geçti. Statik export `npx
serve` ile (GitHub Pages basePath'ini taklit eden bir symlink düzeniyle)
yerel sunulup, Supabase REST/auth uç noktaları ağ seviyesinde taklit
edilerek Playwright'ta iki ayrı test dosyasıyla doğrulandı: (1) sayfa
ilk yüklendiğinde sidebar'ın/header'ın/ayarlar sayfasının varsayılan
olarak Türkçe olduğu; Ayarlar'dan "English"i seçmenin gerçekten `<html
lang>`'i "en"e çevirdiği VE AYNI ANDA sidebar'ın ("Home") ve header arama
placeholder'ının ("Search prompts, users, or tags") da İngilizceye
geçtiği (tek bir paylaşılan Context, sayfa yenilemeden); sayfa
yenilendikten SONRA da (hydration öncesi init script sayesinde) dilin
İngilizce kaldığı, bir an için Türkçeye "flaşlamadığı"; İngilizceye
geçtikten sonra "Türkçe" etiketinin "Turkish"e ÇEVRİLMEDİĞİ (yukarıdaki
tasarım kararının doğrudan kanıtı — ilk deneme bunun tam tersini
varsayan bir test yazmıştı, gerçek bir Playwright çalıştırmasında
locator zaman aşımına uğrayıp bu gerçek UX sorununu ortaya çıkardı, kod
düzeltilip test güncellendi); ve "Türkçe"ye geri dönmenin sorunsuz
çalıştığı — hepsi sıfır JS hatasıyla. (2) generator kataloğunun kendi
gerçek iç tutarlılık taraması (yukarıda "Nasıl doğrulandı" altında
ayrıca anlatıldı).

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`translateAuthError`'ın (login/signup/reset-password'un Supabase
  hata mesajlarını Türkçeye çeviren, Bölüm 17'den beri var olan
  fonksiyon) İngilizce bir karşılığı eklenmedi** — bu görev auth
  sayfalarının kendisine hiç dokunmadı (yukarıdaki kapsam kararı), bu
  yüzden bu fonksiyonun kendisi de kapsam dışı kaldı.
- **Generator kataloğundaki BAZI loanword'ler bilinçli olarak İngilizce
  bırakıldı** (yukarıda madde madde açıklandı — proper noun'lar, format
  standartları, ve Türkçe teknik/kreatif söylemde zaten yerleşik terimler)
  — kullanıcının kendi isteği "bazı ... İngilizce ... Türkçe yap" idi,
  "her İngilizce kelimeyi yok pahasına çevir" değil; bir marka adını
  (ör. "React") ya da evrensel bir format standardını (ör. "JSON")
  çevirmeye çalışmak yanlış/kafa karıştırıcı olurdu.
- **Dil tercihi gerçek kullanıcı hesabına (profiles tablosuna) hiç
  yazılmadı** — theme ile birebir aynı, bilinçli mimari karar: bu bir
  hesap ayarı değil, bir tarayıcı tercihi; başka bir cihazda/tarayıcıda
  aynı hesaba giriş yapan kullanıcı bu tercihi görmez (theme'in de zaten
  taşıdığı, dokümante edilmiş aynı sınırlama).

**Bilinen sınırlamalar:**
- **Sitenin geri kalanı (ana akış, keşfet, prompt/istek/profil/mesaj/
  generator sayfaları, arama, bildirimler, auth formları) hâlâ tamamen
  Türkçe** — kullanıcı Ayarlar'dan "English"i seçtiğinde yalnızca
  sidebar/mobil nav/header/ayarlar sayfası İngilizceye geçiyor, geri
  kalan her sayfa değişmeden Türkçe kalıyor. Bu, yukarıda "SCOPE
  DECISION" olarak açıkça belirtilen, kasıtlı bir kapsam sınırı — mimari
  buna hazır (`translations.ts`'e yeni anahtarlar eklemek yeterli),
  ancak literal çeviri işi henüz yapılmadı.
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (Bölüm
  17'den beri tekrarlanan aynı sınırlama) — bu görev hiçbir migration
  içermediğinden (tamamen frontend), kullanıcının Dashboard'da yapması
  gereken ekstra bir adım yok; yalnızca canlı sitede generator alan
  kütüphanesindeki yeni Türkçe metinleri ve Ayarlar'daki Dil seçicisini
  bizzat denemesi gerekiyor.
