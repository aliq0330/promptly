### 9.50 Promptly 2.0 — kapsamlı UI/UX yeniden tasarımı ve tasarım sistemi

Kullanıcının 29 bölümlük "PROMPTLY — COMPLETE UI/UX REDESIGN" şartnamesi
üzerine — çalışan hiçbir özellik, backend, veri akışı veya iş mantığı
değiştirilmeden, tamamen yeni bir görsel dil ve merkezi bir tasarım sistemi
kuruldu. Özet kurallar artık Bölüm 4'te; bu bölüm neyin, neden, nasıl
yapıldığının kaydı.

**AŞAMA 0 — denetim:** Tüm uygulamanın yalnızca ~12 renk token'ı
kullandığı (`text-text-muted` 433, `border-border` 263, `bg-accent-surface`
119 kez...) ve bunların zaten CSS değişkeni olduğu ölçüldü — bu yüzden
token'ları yeniden tanımlamak her sayfaya kendiliğinden yayıldı, 100+
dosyayı elle boyamak gerekmedi. Hardcoded durum renkleri (`text-red-500`
×44, `text-red-600` ×21, `text-green-600`, `text-amber-600`...) 36 dosyada
`text-danger`/`text-success`/`text-warning` token'larına çevrildi — artık
her palette ve koyu modda tutarlı.

**1. Token katmanı + 4 palet × 2 mod (`src/app/globals.css`):** Ham palet
değişkenleri (`--p-*`) → `@theme inline` ile semantik Tailwind utility'leri
(liste: Bölüm 4). Yeni: `surface-soft`, `text-secondary`, `border-soft`/
`border-strong`, `primary-soft`/`primary-hover`, `secondary`, durum renkleri,
palete göre tonlanmış gölgeler, 8 kademeli tip ölçeği, `ease-soft`
geçişleri, `fade-in`/`pop-in`/`sheet-up`/`shimmer` animasyonları,
`prompt-text`/`skeleton-shimmer`/`scrollbar-none` utility'leri, temaya uygun
`::selection`, `accent-color` (radio/checkbox/slider), sıfır-özgüllüklü
klavye odak halkası, `prefers-reduced-motion` desteği. Temel kurallar
`@layer base` içinde — hiçbir Tailwind utility'sini ezmiyor. Paletler:
Lavanta (varsayılan), Okyanus, Orman, Kum — her biri iki modda tam set.
`ThemeProvider`'a `palette`/`setPalette` eklendi (mod ile aynı desen:
init script ilk boyamadan önce uygular, flaş yok). `/settings`'e yeni
"Görünüm" bölümü (`AppearancePicker`): her renk örneği kendi
`data-palette`'iyle gerçek token'lardan çizilir, sahte hex kopyası yok.

**Gerçek bir hata bulunup düzeltildi (ilk ekran görüntüsünde):**
`cn()`'in kullandığı tailwind-merge özel font boyutlarını bilmediği için
`text-caption` ile `text-text-secondary`'yi aynı grup sanıp birini
sessizce siliyordu (tür etiketleri, Kopyala butonu, rozetler olması
gerekenden büyük çıkıyordu). `extendTailwindMerge` ile tip ölçeği,
gölge ve radius token'ları tanıtıldı (`src/lib/utils.ts`).

**2. Ortak bileşenler:** `Button` (+ `buttonClassName` — buton görünümlü
her `<Link>` artık aynı sınıfları kullanıyor; yeni `danger` varyantı),
`Badge` (`neutral`/`warning` eklendi), `Card`, `IconButton`, `Avatar`,
`Skeleton` (shimmer). Yeni: `Tabs` (underline/segmented, gerçek
`role="tab"`), `Chip`/`ChipRow` (`aria-pressed`), `EmptyState`,
`PageHeader`/`SectionHeader`/`PageContainer`, `DetailSkeleton`/
`NotFoundBlock`. `Modal` artık mobilde **bottom sheet** (alta yapışık, tam
genişlik, yukarı kayar), `sm`+ ortalanmış dialog (fade + hafif scale) —
uygulamadaki 7 modalın hiçbiri tek tek düzenlenmeden, doğrudan-çocuk
(`*:`) varyantlarıyla; panel ekrandan uzunsa üstü kırpılmasın diye
auto-margin düzeni. Tüm açılır menüler (PostMenu, koleksiyon/profil/mesaj
menüleri) tek yüzey stiline (`surface-elevated`, `shadow-pop`, `pop-in`).

**3. İçerik kartı mimarisi (`src/features/content/`):**
`ContentCard` → `PromptCard` / `GeneratorCard` / `RequestCard`. Aynı yüzey,
kenarlık, radius, iç boşluk, hover (yalnızca kenarlık + gölge — transform
yok, çünkü kartın kendi açılır menüsünü bir sonraki kartın altına
hapsederdi) ve "stretched link". Hiyerarşi: yaratıcı → köken kutusu →
**tür satırı** (`ContentTypeLabel`: "Görsel Prompt · Midjourney v6",
"Generator · Kod", "Prompt İsteği · Görsel") → başlık + açıklama →
**prompt bloğu** (mono, kopyala) → (yalnızca görsel promptta) "Çıktı"
önizlemesi — asla kareden uzun değil, kartın kahramanı prompt → `#etiket`
linkleri → aksiyonlar. `image-prompt-card.tsx`/`text-prompt-card.tsx`
tek bir `PromptCard`'da birleştirildi (silindi). **GeneratorCard** büyük
kapak görseli yerine kompakt bir "Yapılandırılmış prompt oluşturucu"
paneli gösteriyor (kapak yalnızca 48px küçük resim) — görsel üretim sitesi
hissini bilinçli olarak önlemek için. **RequestCard** renkli banner'ı
kaldırıldı; durum rozeti menü yerinde, alt satırda yanıt sayısı + Kopyala +
Paylaş + (yalnızca açıkken) gerçek "Yanıtla" linki (`/create?answerRequest=`,
detay sayfasının kullandığı aynı rota). **Aksiyon sistemi:** Beğeni/Yorum/
Kaydet/Paylaş bileşenleri yeniden yazılmadı — yalnızca ortak
`contentActionClassName` görünümüne (36px dokunma hedefi) bağlandı; Kaydet
hem prompt hem generator için AYNI koleksiyon modalını açmaya devam ediyor.
Yeni tablo/API/paralel sistem yok.

**Erişilebilirlik düzeltmeleri (testlerle yakalandı):** Beğeni butonunun
erişilebilir adı yalnızca sayıydı ("342") — artık "Beğen (342 beğeni)",
durum `aria-pressed` ile. Yorum/Kaydet butonlarına `aria-label` eklendi.
Kartın tam alan linki `aria-hidden` + `tabIndex=-1`; başlık tek erişilebilir
link (ekran okuyucuda aynı adlı iki link olmasın diye). "İçeriğe geç"
atlama linki, `aria-current="page"` navigasyon, `role="search"` formları.

**4. Uygulama kabuğu ve navigasyon:** Masaüstü sidebar gruplu (Keşfet /
Kütüphanem) + ayrı birincil "Oluştur" butonu + altta Ayarlar, `sticky`.
**Tablet'e ilk kez kendi düzeni geldi** (Bölüm 5'ten beri "henüz yok" diye
belgelenmişti): aynı bileşen md–lg arasında 72px ikon rayına dönüşüyor, alt
navigasyon yalnızca `< md`. Mobil alt navigasyonda orta "Oluştur" vurgulu.
Yeni marka işareti `BrandMark` (kare içinde prompt imleci — kamera/görsel
simgesi değil). **Bilinen kozmetik hata kapandı (Bölüm 9.0):** "Profil" nav
öğesi artık kendi gerçek profilinde vurgulanıyor (`NavItem.match`).
Alt navigasyonun varlığına bağlı 4 yer (`app-shell` alt boşluğu, iki toast,
konuşma görünümünün sabit paneli) `lg` → `md`'ye taşındı; konuşma paneli
tablet'te `md:left-[72px]`. Klavye-inset mantığı taban değeri CSS'ten
okuduğu için değişiklik gerektirmedi.

**5. Sayfalar:** Ana Sayfa — giriş yapmamış ziyaretçiye kompakt bir
tanıtım (platformun ne olduğu + 3 hızlı aksiyon + dekoratif prompt
satırları), giriş yapmışa tek satır selamlama; segmentli sekmeler
(Sana Özel / Popüler / Takip Ettiklerim) + tür filtresi (Tümü / Promptlar /
Generatorlar / İstekler), ilk yüklemede skeleton. **Keşfet** — arama
(`/search?q=`'ya devrediyor; `SearchView` artık `?q=`'yu okuyor), trend
etiketler, bölüm sekmeleri (Tümü / Promptlar / Generatorlar / İstekler /
Yaratıcılar) ve bölüme göre filtreler (içerik türü / generator konusu /
yalnızca açık istekler); yeni `CreatorCard`. **Generatorlar** — "yapılandırılmış
prompt oluşturma alanı" olarak konumlandı: 3 adımlı iş akışı şeridi, konu
ikonlu filtreler. **İstekler** — durum filtresi (Tümü/Açık/Kapandı, sayılı),
masonry. **Prompt Detay** — okuma sütunu (tür → başlık → açıklama →
yaratıcı → aksiyon çubuğu → tam prompt bloğu (+ Kişiselleştir) → çıktı
(en fazla ~480px yükseklik) → etiketler → yorumlar) + masaüstünde sağ sütun:
`CreatorSummary` ve yeni `RelatedPrompts` (yüklü önbellekten — ortak
etiket/yazar/tür puanı, yeni API yok). **Generator Detay** aynı aileden:
aynı sütunlar, "Generatoru Kullan" çalışma alanı (Form/JSON/Prompt
segmentli sekmeler), sağ sütunda gerçek şemadan "Prompt yapısı · N
parametre" listesi ve sahip aksiyonları. **İstek Detay** aynı başlık
düzeni, "İstek" bloğu (kopyala), yaratıcı yön vurgusu. **Profil** —
editorial başlık kartı (avatar, ad, bio, ilgi alanları + rozetler, büyük
rakamlı istatistik satırı, aksiyonlar sağda), ortak `Tabs`, `Chip`'li
araç çubuğu. **Koleksiyonlar** — "kütüphane yığını" motifli kart, sakin
kapak yedeği (üretilmiş renkli sanat yerine ikon), detay başlık kartı.
**Oluştur** seçim ekranı, **Auth** (masaüstünde bölünmüş düzen), boş
durumlar (`EmptyState`) ve yükleme durumları (`DetailSkeleton`, kart
skeleton'ları, yorum skeleton'u) tüm sayfalarda ortaklaştı. Başlıklar ve
sayfa kenar boşlukları kalıp-bazlı bir taramayla tip ölçeğine/ortak
gutter'a taşındı. Site açıklaması (`metadata`) artık "AI görsel üretim"
değil "AI prompt topluluğu" diyor.

**Nasıl doğrulandı:**
- `npx tsc --noEmit`, `npm run lint` (0 uyarı), tam `npm run build` (26
  rota) temiz.
- **Kontrast:** her palet × mod için 11 metin/zemin çifti hesaplandı; ilk
  turda açık modlarda `text-muted` yumuşak yüzeylerde 4.1–4.4 çıktı →
  paletler en az koyulaştırmayla düzeltildi, sonuç **88/88 çift ≥ 4.5:1**.
- **Görsel:** statik export `serve` + ağ seviyesinde taklit edilmiş
  Supabase verisiyle (gerçekçi prompt/istek/generator/profil seti)
  Playwright ekran görüntüleri — mobil 390 / tablet 834 / masaüstü 1440,
  açık/koyu, 4 palet; her sayfa elle incelendi, bulunan sorunlar
  (tailwind-merge, prompt bloğunda kırpılmış satır sızıntısı, fazla baskın
  çıktı görseli, yorum kartındaki çift ayraç, mobilde uzun generator adım
  kartları) düzeltildi.
- **Fonksiyonel regresyon paketi (yeni, 31 senaryo, 31/31):** beğeni
  gerçek `prompt_likes` POST'u + `aria-pressed`; Kaydet koleksiyon modalını
  açıyor ve seçim gerçek `collection_items` yazıyor (prompt ve generator —
  aynı modal, `generator_id`); Escape modalı kapatıyor; mobilde modal alta
  yapışık bottom sheet; Paylaş mutlak URL'i panoya kopyalıyor; Kopyala tam
  prompt metnini kopyalıyor; sahip menüsünde Düzenle/Sil var, başkasının
  gönderisinde Sil yok; yorum gerçek `prompt_comments` yazıp görünüyor;
  benzer promptlar render oluyor; açık istekte gerçek "Yanıtla" linki var,
  kapalıda yok; durum filtresi; Keşfet tür filtresi, generator ve
  yaratıcı bölümleri; arama `?q=` devri; palet + mod yeniden yüklemede
  korunuyor ve doğru arka planı uyguluyor; başlık tek erişilebilir link,
  tam kart linki tab sırasında değil; üç genişlikte doğru navigasyon
  kompozisyonu; ve **24 rota × 3 genişlik × giriş yapılmış/yapılmamış =
  144 yüklemede sıfır JS hatası, sıfır yatay taşma** (taramanın yakaladığı
  tek gerçek taşma — bildirimler filtresinin eski `-mx-4` taşması — ortak
  `ChipRow`'a geçirilerek düzeltildi).

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan sınırlama). Bu
görev **hiçbir migration içermiyor** (tamamen frontend) — Dashboard'da
yapılacak ek bir adım yok.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- Oluşturma formları (`CreatePromptForm`, `CreateRequestForm`, Generator
  Builder) ve mesajlaşma ekranları yeniden kurgulanmadı — token'lar, tip
  ölçeği, gutter ve ortak bileşenler üzerinden yeni görünüme geçtiler, ama
  alan düzenleri/akışları bilinçli olarak aynı bırakıldı (çok adımlı, test
  edilmiş iş akışlarıdır; şartnamenin "çalışan özellikleri bozma" kuralı).
- Hover'da kart kaldırma (translate) eklenmedi — menü stacking sorunu
  (yukarıda). Yalnızca kenarlık/gölge geçişi.
- Ayrı bir "Share" modalı icat edilmedi — mevcut Web Share / pano
  davranışı korundu. Comments/Filters için ayrı drawer'lar eklenmedi;
  yorumlar sayfa içinde, filtreler chip satırlarında kalıyor.
- Dil (Bölüm 9.49) kapsamı genişletilmedi — yeni metinler Türkçe;
  `translations.ts`'e yalnızca yeni navigasyon/görünüm anahtarları eklendi.

**Bilinen sınırlamalar:**
- Gerçek Supabase'e karşı canlı doğrulama yapılamadı (yukarıda).
- Gerçek bir dokunmatik cihazda (fiziksel iPhone/iPad) denenmedi — yalnızca
  Playwright'ın simüle ettiği viewport'lar (Bölüm 9.11'den beri aynı sınır).
- Tablet'teki konuşma paneli (`/messages/local`) yalnızca sınıf düzeyinde
  güncellendi; gerçek bir konuşma verisiyle tablet'te ekran görüntüsü
  alınmadı (regresyon taraması `/messages`'ı hatasız yükledi).
- Mevcut `generator_saves`/`prompt_saves` gibi atıl tablolar ve diğer
  backend konularına dokunulmadı (kapsam: yalnızca UI).
