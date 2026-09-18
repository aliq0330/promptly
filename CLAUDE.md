> Not: `AGENTS.md` dosyası Next.js CLI tarafından otomatik oluşturulur/güncellenir
> ve bu Next.js sürümüne özgü API/konvansiyon farklarını içerir. Next.js ile
> ilgili kod yazmadan önce onu da oku, silme.

# Promptly — Proje Rehberi (CLAUDE.md)

Bu dosya, "Promptly" (Lavender Studio tasarım dili) projesinin kalıcı çalışma
rehberidir. Her yeni modüle başlamadan önce bu dosya okunmalı; yeni kararlar
alındığında veya mimaride değişiklik yapıldığında güncellenmelidir.

> Kural: Bu dosyada "tamamlandı" diye işaretlenmeyen hiçbir şey tamamlanmış
> sayılmaz. Geçici/varsayımsal kararlar "TASLAK" olarak işaretlenir.

---

## 1. Ürünün Amacı

Promptly, kullanıcıların yapay zekâ ile ürettikleri promptları
paylaşabildiği, keşfedebildiği, yeniden kullanabildiği (remix) ve
birbirleriyle sosyal olarak etkileşime girebildiği bir platformdur.
**Yalnızca görsel üretim promptlarıyla sınırlı değildir** — metin/yazarlık,
video, kodlama ve müzik üretim promptları da aynı platformda, aynı akışlarda
yer alır (`Prompt.contentType`: `image` | `text` | `video` | `code` |
`music`).

Merkezde: promptlar (her türden), remix, yaratıcı prompt istekleri ve
topluluk var. Genel amaçlı bir sosyal medya sitesi veya soru-cevap platformu
DEĞİLDİR — her sosyal özellik prompt üretim deneyimini desteklemek için var.

Temel varlıklar:
- **Prompt**: başlık, açıklama, tam prompt metni, içerik türü, görsel(ler)
  (yalnızca `image` türünde), etiketler, kullanılan araç/model.
- **Remix**: bir prompttan (veya bir istek yanıtından) türetilmiş yeni bir
  prompt; köken zinciri korunur.
- **Prompt İsteği (Request)**: kullanıcının belirli bir görsel/stil için
  yaratıcı talebi.
- **Yaratıcı Yanıt (Request Response)**: bir isteğe verilen, yeniden
  kullanılabilir prompt niteliğinde yanıt.

---

## 2. Teknoloji Yığını

- **Next.js (App Router)** + **React** + **TypeScript** (strict mode)
- **Tailwind CSS** (merkezi design token sistemi ile)
- **Supabase**: Auth, Postgres (RLS), Storage, Realtime (mesajlaşma için)
- **lucide-react**: ikon sistemi (outline stil, tutarlı)
- **Inter**: yazı tipi
- Paket yöneticisi: npm

Gereksiz bağımlılık eklenmez. Mock veri ↔ gerçek Supabase servisleri katman
arayüzleriyle (service interfaces) ayrılır; bir buton mock veriyle
çalışıyorsa kullanıcıya gerçek/kalıcı işlem yapılmış gibi geri bildirim
verilmez.

---

## 3. Klasör Yapısı

```
src/
  app/                    # Next.js App Router route'ları
  components/
    ui/                   # Genel amaçlı, feature'a bağlı olmayan UI bileşenleri
    layout/               # Header, sidebar, mobile nav, shell
  features/
    feed/
    prompts/
    requests/
    profile/
    search/
    notifications/
    messages/
    settings/
    auth/
  lib/                    # Supabase client, utils, servis arayüzleri
  types/                  # Paylaşılan TypeScript tipleri
  mocks/                  # Mock veri (yalnızca geliştirme/placeholder amaçlı)
  styles/                 # Global CSS, design token tanımları
```

Her feature klasörü kendi bileşenlerini, (varsa) servis çağrılarını ve
tiplerini barındırır. Sayfalar (`src/app`) feature bileşenlerini birleştiren
ince katman olarak kalır; iş mantığı feature içinde yaşar.

---

## 4. Tasarım Sistemi — Lavender Studio

Tasarım dili: modern, ferah, minimal, pastel, yaratıcı. Gereksiz gradient,
ağır gölge, kalabalık arayüzden kaçınılır. Yumuşak köşeler, kontrollü
boşluklar, ince ayraçlar.

Font: **Inter**. İkon: **lucide-react**, outline stil, tutarlı kullanım.

### Renk Token'ları (`src/styles/`, Tailwind ile eşleştirilir)

**Açık tema:**
| Token | Hex |
|---|---|
| background | #F8F7FC |
| surface | #FFFFFF |
| accent-surface | #EDE9FE |
| primary | #7C3AED |
| primary-dark | #5B21B6 |
| text | #27233A |

**Koyu tema:**
| Token | Hex |
|---|---|
| background | #14121E |
| surface | #201C2B |
| surface-elevated | #302741 |
| primary | #B9A1FF |
| accent-light | #D2C1FF |
| text | #F4F0FF |

Tema değişimi `next-themes` benzeri bir mekanizma ile yönetilir, kullanıcı
tercihi kalıcı tutulur (localStorage + `class` stratejisi). Renkler, radius,
spacing ve tipografi merkezi olarak `tailwind.config.ts` + CSS custom
property'lerinde tanımlanır; dosyalara dağıtılmaz.

### Responsive İlkeleri

- Mobil: alt navigasyon (Ana Sayfa, Keşfet, Oluştur, İstekler, Profil), sade
  header. Kartlar ekran genişliğine yayılır, gereksiz dış boşluk yok.
  Prompt kartları standart/küçük sosyal medya kartlarına benzemez; görsel/
  üretim alanı kartın önemli bir parçasıdır.
- Tablet: kendi düzeni — navigasyon ve içerik genişliği tablete özel uyarlanır.
- Masaüstü: sol sabit navigasyon + orta içerik + (uygun sayfalarda) sağ
  yardımcı panel.
- Dokunma hedefleri yeterince büyük, uzun prompt metinleri taşmaz.

---

## 5. Sayfa Haritası

| Route | Açıklama |
|---|---|
| `/` | Ana sayfa / karma feed — her içerik türünden prompt + prompt istekleri iç içe (Takip Ettiklerim, Popüler, Sana Özel sekmeleri) |
| `/discover` | Keşfet: karma trend akışı (içerik türü filtreleriyle) + yaratıcılar + etiketler |
| `/prompts/[id]` | Prompt detay sayfası |
| `/create` | Prompt oluşturma formu |
| `/requests` | Prompt istekleri listesi |
| `/requests/[id]` | Prompt isteği detayı + yaratıcı yanıtlar |
| `/search` | Arama sonuçları |
| `/tags/[tag]` | Etikete göre promptlar |
| `/saved` | Kaydedilenler (yalnızca sahibine görünür) |
| `/following` | Takip ettiklerim listesi/akışı |
| `/profile/[username]` | Kullanıcı profili |
| `/notifications` | Bildirim merkezi |
| `/messages` | Mesajlaşma (konuşma listesi) |
| `/messages/[conversationId]` | Konuşma detayı |
| `/settings` | Hesap ayarları |
| `/login`, `/signup`, `/reset-password` | Auth akışları |

---

## 6. Supabase Veri Modeli (özet — TASLAK, migration'lar oluşturulmadı)

Planlanan tablolar: `profiles`, `prompts`, `prompt_media`, `prompt_likes`,
`prompt_saves`, `prompt_comments`, `prompt_remixes`, `prompt_requests`,
`prompt_request_responses`, `follows`, `notifications`, `conversations`,
`conversation_members`, `messages`, `tags`, `prompt_tags`, `reports`,
`blocks`.

Detaylı şema, ilişkiler ve RLS politikaları "Supabase veritabanı" modülünde
tasarlanıp bu dosyaya işlenecek. **Henüz hiçbir migration dosyası veya
gerçek Supabase projesi bağlantısı yoktur.**

---

## 7. Güvenlik Kuralları

- Service role key asla frontend'e konmaz, repoya eklenmez.
- `.env.example` tutulur, gerçek `.env` asla commit edilmez.
- RLS politikaları her tablo için ayrı ayrı tasarlanır (henüz yazılmadı).
- Kullanıcı girdileri doğrulanır.
- Admin/moderator yetkileri yalnızca frontend kontrolüne dayandırılmaz.

---

## 8. Geliştirme Sırası

1. [x] Repo inceleme ve CLAUDE.md oluşturma
2. [x] Proje iskeleti ve klasör mimarisi
3. [x] Tasarım sistemi ve ortak UI bileşenleri (temel)
4. [x] Responsive layout ve navigasyon (temel shell)
5. [x] Ana sayfa ve prompt feed (mock veriyle)
6. [x] Prompt detay sayfası (mock veriyle)
7. [x] Prompt oluşturma (form + canlı önizleme; kalıcı paylaşım Supabase'e bağlı)
8. [x] Remix sistemi (köken zinciri + remix akışı; kalıcı yayın Supabase'e bağlı)
9. [x] Prompt istekleri listesi (mock veriyle)
10. [x] Prompt isteği detay ve yaratıcı yanıtlar (mock veriyle)
11. [x] Keşfet, arama ve etiketler (mock veriyle)
12. [x] Kullanıcı profilleri (mock veriyle)
13. [ ] Takip sistemi (Takip Et butonu şu an görsel, işlevsel değil)
14. [ ] Beğeni, yorum, kaydetme, paylaşma (sayılar/yorumlar salt okunur gösteriliyor)
15. [x] Bildirimler (mock veriyle)
16. [x] Özel mesajlaşma (mesaj gönderme henüz devre dışı)
17. [ ] Kayıt, giriş, hesap ayarları (Supabase Auth)
18. [ ] Supabase veritabanı ve migration dosyaları
19. [ ] RLS ve güvenlik politikaları
20. [ ] Supabase Storage
21. [ ] Frontend'in gerçek Supabase'e bağlanması
22. [ ] Moderasyon, engelleme, raporlama
23. [ ] Testler, performans, erişilebilirlik
24. [ ] Deployment ve son kalite kontrolü

---

## 9. Şu Anki Durum (bu bölüm her modül sonunda güncellenir)

**Son güncelleme:** Remix sistemi tamamlandı — Bölüm 8 işaretlendi.

**Tamamlanan:**
- CLAUDE.md oluşturuldu.
- Next.js (App Router) + TypeScript + Tailwind projesi kuruldu.
- Temel klasör yapısı oluşturuldu (`src/components`, `src/features`,
  `src/lib`, `src/types`, `src/mocks`, `src/styles`).
- Design token'ları (renkler, radius, spacing, tipografi) Tailwind config
  ve CSS custom property'leri olarak tanımlandı; açık/koyu tema desteği.
- Tema değiştirme altyapısı (localStorage tabanlı, FOUC önleyici script).
- Temel UI bileşenleri: Button, Card, Avatar, Badge, IconButton, Skeleton.
- Uygulama shell'i: masaüstü sol navigasyon, üst header (arama, bildirim,
  mesaj, tema, profil), mobil alt navigasyon.
- `src/mocks/` altında 9 sahte kullanıcı (+ "me" = giriş yapmış varsayılan
  kullanıcı), 20 prompt, 6 prompt isteği + yaratıcı yanıtları, yorumlar,
  bildirimler ve konuşmalar dolduruldu (`users.ts`, `prompts.ts`,
  `tags.ts`, `requests.ts`, `request-responses.ts`, `comments.ts`,
  `notifications.ts`, `conversations.ts`).
- Prompt görselleri `src/lib/placeholder-image.ts` ile üretilen offline
  gradient SVG'ler; üçüncü taraf görsel servislerine (picsum, pravatar vb.)
  bağımlılık yok. Avatarlar `avatarUrl: null` + Avatar bileşeninin baş harf
  fallback'iyle gösteriliyor.
- Feature bileşenleri (`src/features/{feed,prompts,requests,notifications,
  messages,profile,search}`) gerçek mock veriyle render ediliyor: ana sayfa
  sekmeli feed (Sana Özel/Popüler/Takip Ettiklerim), keşfet (trend
  promptlar, öne çıkan yaratıcılar, popüler etiketler, açık istekler),
  prompt detay + yorumlar, istek detay + yanıtlar, bildirim listesi, mesaj
  listesi + konuşma detayı, profil (header + prompt grid), etiket sayfası,
  client-side arama.
- Route iskeletleri (placeholder içerik) yukarıdaki sayfa haritasına göre
  oluşturuldu.

**Devam etmiyor / henüz yapılmadı:**
- Supabase bağlantısı yok (client kurulumu bile henüz eklenmedi).
- Auth yok, herkes her sayfayı görebiliyor (mock). `/login`, `/signup`,
  `/reset-password` formları arayüz olarak var ama devre dışı (`disabled`),
  gerçek işlev yok.
- Beğeni, kaydetme, takip et ve mesaj gönderme butonları görsel olarak var
  ama tıklandığında kalıcı bir değişiklik yapmıyor (CLAUDE.md kural: mock
  veriyle çalışan butonlar gerçek işlem yapılmış gibi geri bildirim
  vermemeli). Prompt oluşturma ve remix akışı henüz yok.
- Test altyapısı henüz kurulmadı.
- `npm run lint`, `npx tsc --noEmit` ve `npm run build` çalıştırıldı, hepsi
  hatasız geçti (71 statik sayfa üretildi). Dev sunucusunda masaüstü/mobil
  görünümler ve açık/koyu tema Playwright ile görsel olarak doğrulandı.
- Ana akış kartı (`PromptCard`) ve istek kartı (`RequestCard`) kullanılabilirlik
  turu: görsel oranı artık medyanın gerçek en/boy oranından türetilip
  0.75–1.4 arasına sıkıştırılıyor (`clampedAspectRatio`, tüm kartlar aynı
  4:3 kalıbına zorlanmıyor); placeholder sanat düz iki renkli gradyan yerine
  offline üretilen yumuşak "bokeh" blob kompozisyonuna geçti (daha çok
  soyut üretilmiş sanat, daha az "boş kutu" hissi); grid artık `items-start`
  kullanıyor ki kısa kartlar komşusuna göre gereksiz yere uzamasın. Kart
  içinde tıklanabilir alanlar (yazar linki, yorum/remix linki, paylaş
  butonu) ile kartın tamamının linki "stretched link" deseniyle
  (`position: absolute inset-0` + göreceli olarak üstte duran interaktif
  öğeler) çakışmadan bir arada çalışıyor; Playwright ile doğrulandı.
  Beğeni ve kaydet ikonları bilinçli olarak tıklanamaz/`cursor-default`
  bırakıldı (gerçek kalıcılık olmadan aktifmiş gibi göstermemek için, bkz.
  CLAUDE.md §2 kuralı); paylaş butonu ise Web Share API / panoya kopyalama
  ile gerçekten çalışıyor. Remix kartlarında orijinal içeriğe giden görünür
  bir bağlantı satırı eklendi.
- Mobil header: arama artık dar ekranlarda metni kırpılan bir kutu değil,
  bildirim/mesaj ikonlarıyla aynı boyutta bir arama ikonu (`/search`'e
  yönlendiriyor); masaüstünde tam metinli arama kutusu korunuyor.
- **Çoklu içerik türü + karma akış:** `Prompt.contentType` alanı eklendi
  (`image` | `text` | `video` | `code` | `music`). Kart render'ı artık türe
  göre ayrışıyor: `PromptCard` (features/prompts/prompt-card.tsx) türe göre
  `ImagePromptCard` (medya önizlemeli) veya `TextPromptCard` (metin/video/
  kod/müzik — medya alanı zorlanmıyor, kısa bir prompt metni önizlemesi +
  "Tamamını görüntüle" eylemiyle detay sayfasına yönlendiriyor) arasında
  seçim yapıyor. Ortak footer (`PromptCardFooter`) ve remix ilişki satırı
  (`RemixSourceLink`) her iki kart tipinde de paylaşılıyor.
- Ana Sayfa ve Keşfet artık **karma akış**: prompt istekleri artık yalnızca
  `/requests`'te değil, Ana Sayfa ve Keşfet'te diğer prompt türleriyle iç
  içe görünüyor (`src/features/feed/{types,feed-grid,feed-tabs}.tsx` —
  `FeedItem = {kind:"prompt"} | {kind:"request"}`). `/requests` sayfası ve
  navigasyondaki "Prompt İstekleri" linki değişmeden duruyor. Keşfet'e
  içerik türü filtre çipleri eklendi (`DiscoverFeed`, client-side, gerçekten
  filtreliyor): Tümü/Görsel/Metin/Video/Kod/Müzik/İstekler. Ana Sayfa
  sekmeleri CLAUDE.md §5 ile eşleşecek şekilde Takip Ettiklerim/Popüler/
  Sana Özel sırasına alındı.
- **Tablet/masaüstü kart boşluğu düzeltmesi:** `PromptGrid` ve `FeedGrid`
  artık CSS Grid değil, CSS multi-column masonry kullanıyor
  (`columns-1 sm:columns-2 xl:columns-3` + her kart `break-inside-avoid`).
  Kısa kartlar artık komşu sütundaki uzun bir karta göre gerilmiyor — grid
  satır hizalamasının neden olduğu büyük boş alanlar ortadan kalktı. Saf
  CSS olduğu için JS ölçüm/ResizeObserver gerekmiyor, pencere yeniden
  boyutlandırma ve yön değişikliklerinde native olarak yeniden akıyor.
- **iOS safe-area:** `app/layout.tsx`'e `viewportFit: "cover"` eklendi;
  `MobileNav` ve `AppShell`'in ana içerik alt boşluğu artık
  `env(safe-area-inset-bottom)`'ı hesaba katıyor (çentikli/Dynamic Island
  cihazlarda alt navigasyonun içerik ile çakışmaması için).
- `RequestCard` artık bağımsız kart görünümüne kavuştu: diğer kart tiplerinde
  olduğu gibi kendi `rounded-lg border bg-surface` çerçevesi ve üstte
  `placeholder-image.ts`'den üretilen renkli bir "bokeh" banner var
  (Sparkles ikonu + durum rozeti bindirilmiş). Daha önce yalnızca
  `/requests`'teki ortak listeye (`RequestList`'in dış çerçevesine) güveniyordu;
  Ana Sayfa/Keşfet karma akışında bağımsız kullanıldığında görünmez arkaplanla
  render oluyordu. `RequestList` artık kartların kendi çerçevesine güvenerek
  basit bir `space-y-4` yığını. Not: CSS `background-image: url(...)`
  içine SVG data URI gömülürken **mutlaka tırnaklanmalı**
  (`url("${svg}")`) — SVG içindeki `fill="url(#id)"` gibi referanslardaki
  parantezler tırnaksız gömülünce CSS ayrıştırmayı sessizce bozup
  `background-image: none` sonucu veriyor (bu projede yaşandı ve düzeltildi).
- **Prompt oluşturma (`/create`, `CreatePromptForm`):** Gerçek, çalışan bir
  form — sahte değil. İçerik türü seçici (`CONTENT_TYPE_META` ile paylaşılan
  ikon/etiketler), başlık/açıklama/prompt metni/araç alanları, `mockTags`'ten
  çoklu etiket seçimi, `image` türü için gerçek dosya yükleme (`URL.
  createObjectURL` + `Image().onload` ile gerçek genişlik/yükseklik okunuyor,
  bellek sızıntısı olmasın diye eski blob URL'i `URL.revokeObjectURL` ile
  temizleniyor). Sağ panelde (`lg:sticky`) her alan değiştikçe canlı olarak
  gerçek `PromptCard` bileşeniyle (aynı dispatcher, aynı kart tasarımları)
  önizleme render ediliyor — `pointer-events-none` ile sarılı, çünkü
  önizlemenin `/prompts/preview` gibi var olmayan bir sayfaya link vermesi
  istenmiyor. "Paylaş" tıklandığında **kalıcı bir kayıt oluşturulmuyor** —
  CLAUDE.md kuralına uyarak (mock veriyle çalışan buton gerçek işlem
  yapılmış gibi göstermemeli) yalnızca dürüst bir bilgi kutusu gösteriliyor:
  önizleme yapılabildiğini ama gerçek paylaşımın Supabase entegrasyonuna
  (Bölüm 18–21) bağlı olduğunu açıklıyor. Playwright ile tür değişimi,
  etiket seçimi ve gerçek dosya yükleme (geçerli bir PNG ile) uçtan uca
  doğrulandı.
- **Remix sistemi (Bölüm 8):** Köken zinciri artık gerçekten iş görüyor.
  - `mocks/prompts.ts`: `getRemixesOf(id)` (bir promptun doğrudan remixleri)
    ve `getRemixChain(id)` (kökten o promptа kadar tüm zinciri
    `origin.sourcePromptId` takip ederek döndürür) eklendi. Zinciri gerçekten
    test etmek için 3 seviyeli bir örnek eklendi: p1 (orijinal) → p9 (remix,
    root p1) → p29 (p9'un remixi, root yine p1) — `rootPromptId`'nin ara
    adımlarda da doğru taşındığını kanıtlıyor. Ayrıca `request-response`
    kökenli bir örnek eklendi: p30, r1 isteğine verilen rr1 yanıtından
    türetildi.
  - `RemixSourceLink` artık yalnızca `remix` değil, `request-response`
    kökenini de gösteriyor (Sparkles ikonuyla, isteğe link vererek);
    `origin.type !== "original"` olan her karta/detay sayfasına ekleniyor.
  - Prompt detay sayfası: kök→...→bu-prompt breadcrumb'ı (`ChevronRight`
    ile ayrılmış, yalnızca zincir >1 uzunluktaysa gösteriliyor), belirgin
    "Remixle" butonu (`/create?remix=<id>`'e gerçek link) ve "Remixler (N)"
    bölümü (`getRemixesOf` + `PromptGrid`, boşsa "Bu prompt henüz
    remixlenmedi" mesajı) eklendi.
  - Kart footer'ındaki remix ikonu artık prompt detayına değil, doğrudan
    `/create?remix=<id>`'e gidiyor — tek tıkla remix başlatma.
  - `ResponseCard`'a "Remixle" eylemi eklendi (`/create?remixResponse=<id>`).
  - `CreatePromptForm` artık `useSearchParams()` ile `remix`/`remixResponse`
    parametrelerini okuyor (bu yüzden `/create` sayfası `<Suspense>` ile
    sarıldı — Next.js statik export'ta `useSearchParams` kullanan client
    bileşenler için zorunlu), kaynak promptun/yanıtın başlık, açıklama,
    prompt metni, araç ve etiketlerini forma dolduruyor, üstte kaynağa
    link veren bir bilgi bandı gösteriyor, ve canlı önizlemede doğru
    `origin` (remix → `sourcePromptId`/`rootPromptId` zinciri korunarak;
    request-response → `requestId`/`responseId`) ile gerçek `RemixSourceLink`
    render ediliyor. Kalıcı yayın öncekiyle aynı nedenle (Supabase yok)
    hâlâ gerçekleşmiyor — form yalnızca önizleme + köken takibini
    gerçek olarak yapıyor, sahte "yayınlandı" durumu yok.
  - Playwright ile uçtan uca doğrulandı: bir prompttan "Remixle" tıklanınca
    form doğru dolduruluyor; bir istek yanıtından "Remixle" tıklanınca da
    aynı şekilde çalışıyor; 3 seviyeli zincir detay sayfasında doğru
    sırayla render ediliyor; açık/koyu tema ve mobilde bozulma yok.

**Bilinen sorunlar / bilinçli basitleştirmeler:**
- Tablet için ayrı bir navigasyon/genişlik düzeni henüz yok; `lg` (1024px)
  altındaki tüm genişlikler mobil shell'i (alt navigasyon + tek sütun)
  kullanıyor. Bölüm 5'teki "tablete özel düzen" ileride ayrı bir breakpoint
  ile ele alınacak.
- Header'daki mobil logosu, sidebar'daki tam "Promptly" yazısı yerine tek
  harfli bir amblem ("P") — dar ekranlarda arama çubuğuna yer açmak için.
- Statik export (`output: "export"`, GitHub Pages) kullanıldığı için her
  dinamik route (`prompts/[id]`, `requests/[id]`, `profile/[username]`,
  `tags/[tag]`, `messages/[conversationId]`) `generateStaticParams()` ile
  mock veri setindeki TÜM id'leri döndürüyor — gerçek backend'e geçilince
  bu fonksiyonlar kaldırılıp sunucu tarafı veri çekmeye geçilecek.
- Masonry (CSS columns) sütun-öncelikli sıralar (önce 1. sütun tepeden
  dizilir, sonra 2. sütuna geçer) — grid'in satır-öncelikli sıralamasından
  farklıdır. Pinterest/Unsplash tarzı masonry akışlarında beklenen/kabul
  gören bir davranıştır, ancak "Popüler" gibi sekmelerde en yüksek puanlı
  öğe her zaman sol üstte olur, tam soldan-sağa okuma sırası garanti edilmez.
- "Popüler" sekmesinde prompt (likeCount) ve istek (responseCount×15)
  farklı ölçeklerde metriklere sahip olduğundan sıralama kaba bir
  sezgiseldir — gerçek bir "trend skoru" backend tarafında hesaplanmalı.
- `CreatePromptForm`'daki remix ön doldurma `useState` lazy initializer ile
  yapılıyor, yalnızca bileşen ilk mount olduğunda çalışır. Aynı `/create`
  sekmesinde bir remix linkinden başka bir remix linkine (tam sayfa
  yenilemeden, örn. iki farklı karttan art arda) client-side geçilirse form
  alanları yenilenmez. Pratikte her "Remixle" tıklaması ayrı bir navigasyon
  olduğundan bu senaryo nadirdir; ileride gerekirse `useEffect` ile
  `searchParams` değişimini izleyip formu sıfırlayan bir çözüme geçilebilir.

**Sonraki modül:** Takip sistemi (Bölüm 13).
