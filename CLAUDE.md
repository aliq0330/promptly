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
7. [x] Prompt oluşturma (form + canlı önizleme; kalıcı paylaşım Supabase'e bağlı; İSTEK YANITLAMA modu artık gerçekten yayınlıyor — bkz. Bölüm 9)
8. [x] Remix sistemi (köken zinciri + remix akışı; kalıcı yayın Supabase'e bağlı)
9. [x] Prompt istekleri listesi (gerçek istek oluşturma + localStorage kalıcılığı — bkz. Bölüm 9)
10. [x] Prompt isteği detay ve yaratıcı yanıtlar (gerçek yanıtlama, yorum, seçim ve yönetim — bkz. Bölüm 9)
11. [x] Keşfet, arama ve etiketler (mock veriyle)
12. [x] Kullanıcı profilleri (yaratıcı portföy: sekmeler, filtre/sıralama, gerçek profil düzenleme ve içerik yönetimi — bkz. Bölüm 9)
13. [x] Takip sistemi (localStorage ile gerçek takip et/bırak; sunucu senkronizasyonu Supabase'e bağlı)
14. [x] Beğeni, yorum, kaydetme, paylaşma (beğeni/kaydetme localStorage ile gerçek; yorum ekleme gerçek/yerel; sunucu senkronizasyonu Supabase'e bağlı)
15. [x] Bildirimler (mock veriyle)
16. [x] Özel mesajlaşma (mesaj gönderme henüz devre dışı)
17. [x] Kayıt, giriş, hesap ayarları (gerçek Supabase Auth bağlantısı — bkz. Bölüm 9; hesap ↔ mock profil/veri entegrasyonu Bölüm 18/21'e bağlı)
18. [ ] Supabase veritabanı ve migration dosyaları
19. [ ] RLS ve güvenlik politikaları
20. [ ] Supabase Storage
21. [ ] Frontend'in gerçek Supabase'e bağlanması
22. [ ] Moderasyon, engelleme, raporlama
23. [ ] Testler, performans, erişilebilirlik
24. [ ] Deployment ve son kalite kontrolü

---

## 9. Şu Anki Durum (bu bölüm her modül sonunda güncellenir)

**Son güncelleme:** Bölüm 17 — Kayıt, giriş, hesap ayarları (Supabase Auth)
tamamlandı. Projede artık **gerçek bir Supabase projesi bağlı** (ilk kez —
CLAUDE.md §6/§20'nin "henüz hiçbir bağlantı yok" notu bu modülle kısmen
aşıldı: Auth bağlı, veritabanı/Storage hâlâ yok). Sıradaki modül Bölüm 18.

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
- **Takip sistemi (Bölüm 13):** Artık gerçekten çalışıyor — sahte/statik
  bir "Takip Ediliyor" değil.
  - Yeni `features/profile/follow-provider.tsx`: `ThemeProvider` ile aynı
    desen — `localStorage` anahtarı `promptly-following`, seed set
    (`INITIAL_FOLLOWED_USER_IDS = ["u1","u3","u5","u7"]`, önceki
    dosyalara dağılmış hardcoded `FOLLOWED_USER_IDS` sabitlerinin yerini
    aldı) sunucu render'ında ve ilk client paint'te kullanılıyor,
    ardından `useEffect` içinde gerçek `localStorage` değeri okunup
    uygulanıyor (hydration uyumsuzluğu olmadan). `(app)/layout.tsx`'e
    `FollowProvider` eklendi — tüm `(app)` rotalarını sarıyor.
  - Yeni `features/profile/follow-button.tsx`: `useFollow()` ile durumu
    okuyup `toggleFollow()` çağıran gerçek bir buton — tıklanınca anında
    "Takip Et" ↔ "Takip Ediliyor" arası değişiyor ve `localStorage`'a
    yazılıyor (sayfa yenilenince kaybolmuyor — Playwright ile doğrulandı).
  - `ProfileHeader`, `CreatorRow` ve Keşfet'teki "Öne Çıkan Yaratıcılar"
    kartları artık bu gerçek `FollowButton`'ı kullanıyor (üçü de "use
    client" veya client alt bileşen). Keşfet kartında aynı stretched-link
    deseni (buton `relative z-10`, kart linki `absolute inset-0 z-0`)
    kullanılarak buton tıklaması kart linkiyle çakışmıyor.
  - `ProfileHeader`'daki takipçi sayısı artık `isFollowing`/
    `wasInitiallyFollowing` karşılaştırmasıyla +1/-1 optimistik olarak
    güncelleniyor (gerçek bir takipçi listesi olmadığından yalnızca bu
    oturumun kendi eylemini yansıtıyor, başka kullanıcılara senkronize
    olmuyor — bu dürüstçe böyle).
  - `/following` sayfası ve `FeedTabs`'ın "Takip Ettiklerim" sekmesi artık
    hardcoded listeler yerine `useFollow().isFollowing()` kullanıyor; bu
    yüzden `/following/page.tsx` client component'e çevrildi. Bir kullanıcıyı
    takip edince/bırakınca hem o kullanıcının profili hem Ana Sayfa'nın
    "Takip Ettiklerim" sekmesi hem `/following` sayfası anında güncelleniyor.
  - Playwright ile uçtan uca doğrulandı: takip et → buton değişiyor →
    sayfa yenilenince kalıcı → `/following`'de görünüyor; takipten çık →
    `/following`'den kayboluyor; Keşfet'teki buton kart linkiyle çakışmıyor.
- **Beğeni, yorum, kaydetme, paylaşma (Bölüm 14):** Paylaşma zaten gerçekti
  (Web Share/panoya kopyalama); beğeni, kaydetme ve yorum ekleme artık aynı
  şekilde gerçek — Follow sistemiyle birebir aynı localStorage mimarisi.
  - Yeni `features/prompts/like-save-provider.tsx`: `LikeProvider`/`useLike`
    (anahtar `"promptly-likes"`, başlangıç seti boş — tüm mock prompt/
    yanıtlarda `isLiked: false`) ve `SaveProvider`/`useSave` (anahtar
    `"promptly-saves"`, başlangıç seti `["p3","p5","p7","p11","p15"]` —
    `/saved` sayfasının eski hardcoded `SAVED_PROMPT_IDS` sabitinin yerini
    aldı). İkisi de aynı dahili `useToggleSet` yardımcı hook'unu paylaşıyor
    (FollowProvider'daki storage/seed deseninin tekrarını önlemek için).
    Beğeni hem promptlarda hem istek yanıtlarında (`PromptRequestResponse`)
    çalışıyor — id'leri çakışmadığından (`p*` / `rr*`) tek bir id alanı
    yeterli.
  - Yeni `features/prompts/like-button.tsx` ve `save-button.tsx`: `Heart`/
    `Bookmark` ikonlu, gerçekten tıklanabilir toggle butonları (ShareButton
    ile aynı desen — `event.preventDefault()`/`stopPropagation()` ile kart
    genelindeki "stretched link" ile çakışmıyor). Beğeni sayısı, takipçi
    sayısında kullanılan aynı optimistik `+1/-1` tekniğiyle (mock'un statik
    `likeCount`'una göre) gösteriliyor. Yeni `comment-count-link.tsx` aynı
    tekniği yorum sayısına da uyguluyor (aşağıya bakınız).
  - `PromptCardFooter` artık statik `<span>` yerine bu gerçek butonları
    kullanıyor — bu tek değişiklik feed, keşfet, etiket, kayıtlı, arama,
    takip ettiklerim ve profil sayfalarındaki TÜM prompt kartlarına
    yayılıyor. `ResponseCard`'daki (istek yanıtları) beğeni de aynı
    `LikeButton`'a geçirildi; yorum sayısı orada statik kaldı çünkü yanıtlar
    için hiç yorum veri modeli yok (bkz. bilinen sorunlar).
  - `/saved` sayfası artık `"use client"` ve `useSave().isSaved()` ile
    gerçek kayıt durumunu okuyor (Follow modülünde `/following`'in
    dönüştürülmesiyle aynı desen); boşsa dürüst bir "henüz bir şey
    kaydetmedin" mesajı gösteriyor.
  - **Yorum ekleme gerçek hale getirildi:** Yeni
    `features/prompts/comment-provider.tsx` (`CommentProvider`/
    `useComments`, anahtar `"promptly-local-comments"`) — eklenen yorumlar
    "me" mock kullanıcısı adına (`getUserById("me")`) oluşturuluyor ve
    localStorage'a yazılıyor. Yeni `features/prompts/comment-section.tsx`
    prompt detay sayfasındaki eski salt-okunur yorum bloğunun yerini aldı:
    üstte gerçek bir yorum yazma formu (avatar + input + "Gönder" butonu),
    altında mock yorumlarla yerel yorumların birleştirilip
    tarihe göre sıralanmış hâli. "Yorumlar (N)" başlığı artık eklenen
    yorumları da sayıyor. Yanıt (reply) ekleme arayüzü henüz yok — yalnızca
    üst seviye yorum ekleniyor (mock veride zaten var olan `parentId`'li
    yanıtlar salt okunur gösterilmeye devam ediyor).
  - Prompt detay sayfasının üst istatistik satırına (`Heart`/`MessageCircle`
    yerine gerçek `LikeButton`/`CommentCountLink`) ek olarak daha önce hiç
    olmayan bir `SaveButton` eklendi — kart footer'ıyla tutarlılık için.
  - Yeni provider'lar `(app)/layout.tsx`'e `FollowProvider`'ın içine
    (`LikeProvider` → `SaveProvider` → `CommentProvider` → `AppShell`)
    sarılarak eklendi.
  - Playwright ile uçtan uca doğrulandı: beğenme → kalp doluyor, sayı +1
    oluyor, sayfa yenilenince kalıcı; kaydetme → `/saved`'e ekleniyor,
    oradan kaydı kaldırınca listeden anında kayboluyor; yorum ekleme →
    "Yorumlar (N)" sayısı artıyor, yorum sayfa yenilenince kalıcı olarak
    duruyor; kart üzerindeki yeni butonlar stretched-link kart navigasyonu
    ile çakışmıyor (yazar/profil linki hâlâ doğru çalışıyor); mobil + koyu
    temada bozulma yok.
- **Profil sayfası kapsamlı yeniden tasarım (Bölüm 12'nin derinleştirilmesi):**
  Eski profil sayfası yalnızca avatar+isim+bio+3 sayaç+takip butonu ve tek bir
  prompt grid'iydi (sekme, filtre, sıralama, düzenleme, kaydedilenler/
  beğeniler, boş/yükleniyor durumu yoktu). Artık gerçek bir yaratıcı portföy:
  - **Veri modeli:** `UserProfile.interests?: string[]` eklendi (yaratıcı
    ilgi alanı/kategori — `features/profile/interest-options.ts`'teki sabit
    9 kategoriden). Mock kullanıcılara bio'larına uygun gerçekçi kategoriler
    atandı; "me" boş başlıyor (dürüst — henüz seçim yapılmadı). Bu, gerçek
    bir Supabase alanı değil, TASLAK/yerel bir alan (CLAUDE.md §28).
  - **Yeni gerçek, localStorage'a kalıcı provider'lar** (Follow/Like/Save ile
    birebir aynı mimari — bkz. §13, §14):
    - `features/profile/profile-overrides-provider.tsx`
      (`ProfileOverridesProvider`/`useProfileOverrides`, anahtar
      `"promptly-profile-overrides"`) — yalnızca "me" hesabı için
      displayName/bio/website/interests/avatar override'ları. Kullanıcı adı
      **kasıtlı olarak düzenlenemez**: her profil rotası build zamanında
      kullanıcı adına göre statik üretiliyor (`generateStaticParams`);
      gerçek bir yeniden adlandırma sunucu tarafı routing/redirect
      gerektirir ve bu ancak Supabase Auth ile gelir (§17).
    - `features/prompts/hidden-prompts-provider.tsx`
      (`HiddenPromptsProvider`/`useHiddenPrompts`, anahtar
      `"promptly-hidden-prompts"`) — "Profilimden gizle" gerçek ve kalıcı
      ama **silme değil**: mock prompt dizisi salt okunur ve backend yok,
      bu yüzden hiçbir şey sunucu tarafında silinmiyor/durumu değişmiyor;
      yalnızca bu tarayıcının kendi galeri görünümünden kaldırılıyor, prompt
      feed/detay/başka profillerde hâlâ görünür kalıyor. Menüde "geri getir"
      ile aynı tarayıcıdan geri alınabiliyor; profilde "N prompt gizlendi ·
      Göster" bağlantısıyla gizlenenler tekrar görülüp geri getirilebiliyor.
  - **Yeni component'ler** (`src/features/profile/`): `profile-view.tsx`
    (client orkestratör — tab/filtre/sıralama/arama state'i), yeniden
    yazılan `profile-header.tsx` (avatar + kimlik + bio "devamını gör" +
    ilgi alanı chip'leri + rozetler + istatistikler + aksiyonlar),
    `profile-avatar.tsx`, `profile-actions.tsx` (own vs. other tamamen ayrı
    iki bileşen — kullanıcı asla kendini takip edemez), `profile-stats.tsx`,
    `profile-tabs.tsx`, `profile-toolbar.tsx` (içerik türü filtresi +
    sıralama + >8 içerikte arama), `profile-content-grid.tsx` (+
    `profile-content-menu.tsx` kebab menüsü), `profile-empty-state.tsx`,
    `profile-badges.tsx`, `profile-about.tsx`.
  - **Sekmeler:** Promptlar (varsayılan) / Remixler (`origin.type !==
    "original"`) / Hakkında her profilde; **Kaydedilenler** ve **Beğeniler**
    yalnızca kendi profilinde (`isOwnProfile`) gösteriliyor — çünkü
    beğeni/kaydetme verisi yalnızca "bu tarayıcının" bildiği bir şey
    (LikeProvider/SaveProvider), başka bir kullanıcının gerçekte neyi
    beğendiği/kaydettiği hiçbir yerde bilinmiyor; bunu başka bir profilde
    göstermek sahte olurdu.
  - **İstatistik etkileşimleri:** prompt/remix sayıları tıklanınca o
    profilin ilgili sekmesine geçiyor (gerçek, client state). Takip edilen
    sayısı yalnızca **kendi profilinde** tıklanabilir ve mevcut
    `/following`'e gidiyor. Takipçi sayısı hiçbir profilde tıklanamaz —
    "kim kimi takip ediyor" ilişkisi mock veri modelinde hiç yok (yalnızca
    statik bir sayı var), böyle bir liste ekranını uydurmak §7 kuralını
    ihlal eder.
  - **Mesaj Gönder:** yalnızca `mocks/conversations.ts`'te o kullanıcıyla
    gerçekten var olan bir konuşma varsa gösteriliyor (9 mock kullanıcıdan
    5'i) ve gerçek konuşmaya yönlendiriyor; mesaj gönderme zaten bilinçli
    olarak devre dışı (§16). Yeni konuşma başlatma yok, bu yüzden diğer 4
    kullanıcıda buton hiç görünmüyor (sahte/ölü buton yerine).
  - **Rozetler (`profile-badges.tsx`):** modüler ve genişletilebilir bir
    dizi — yalnızca gerçek koşula bağlı 3 rozet var (ilk prompt, ilk remix,
    10+ prompt); hiçbiri "kazanılmış gibi" sahte gösterilmiyor, koşul
    sağlanmadan hiçbir rozet render edilmiyor.
  - **Profili Düzenle (`/profile/edit`):** gerçek, çalışan form —
    `ProfileOverridesProvider`'a yazıyor. Avatar yükleme gerçek: dosya
    seçilince `resizeImageToDataUrl` (yeni, `lib/utils.ts`) canvas ile
    160×160 kareye kırpıp küçük bir JPEG data URL'e çeviriyor (localStorage'a
    sığacak boyutta) — bu, `CreatePromptForm`'un gerçek dosya yükleme
    desenine (`Image().onload`) benzer ama sonucu gerçekten kalıcı hale
    getiriyor. Görünen ad/biyografi (200 karakter sınırı)/web sitesi/ilgi
    alanları düzenlenebiliyor; Kaydet gerçekten localStorage'a yazıp
    `/profile/me`'ye yönlendiriyor, İptal hiçbir şey yazmadan geri dönüyor.
    Sahte bir "kaydediliyor" yükleniyor durumu **eklenmedi** — localStorage
    yazımı gerçekten senkron/anlık, sahte bir gecikme göstermek kuralın
    ruhuna aykırı olurdu; aynı nedenle sahte bir "kayıt başarısız" hata
    durumu da yok (localStorage yazımı network isteği gibi başarısız olmaz).
  - **İçerik yönetim menüsü (kebab, yalnızca kendi promptlarında):**
    orijinal görev tanımındaki "Düzenle / Taslağa al / Yeniden yayımla / Sil"
    seçenekleri **kasıtlı olarak eklenmedi** — mock prompt dizisi durağan ve
    backend yok, bu yüzden hiçbiri gerçekte bir şey değiştiremez; sahte
    yapmak CLAUDE.md §2 kuralını ihlal ederdi. Bunun yerine yalnızca gerçekten
    çalışan üç seçenek var: "Bağlantıyı kopyala" (clipboard), "Kopyasını
    oluştur" (`/create?duplicate=<id>` — `CreatePromptForm`'a yeni bir prefill
    modu eklendi, remix'ten farklı olarak `origin: "original"` ile), ve
    "Profilimden gizle/geri getir" (yukarıdaki gerçek localStorage gizleme).
  - **Boş/yükleniyor durumları:** her sekim/filtre için ayrı, gerçekçi boş
    durum (`ProfileEmptyState`); filtre sonucu boşsa "Filtreleri temizle"
    aksiyonu. `/profile/[username]/loading.tsx` eklendi — projede daha önce
    hiç kullanılmayan (`git log` bunu doğruluyor) hazır `ProfileHeaderSkeleton`
    ve `PromptCardSkeletonGrid` bileşenlerini ilk kez gerçekten bir route'a
    bağladı. Gerçek bir ağ isteği olmadığından (statik export, senkron mock
    veri) sahte bir "içerik yüklenemedi/yeniden dene" hata ekranı
    **eklenmedi** — böyle bir hata senaryosu bu mimaride gerçekte oluşamaz.
  - **Yan düzeltme (bug fix):** `ShareButton`'ın paylaşım URL'si
    `window.location.origin + path` ile kuruluyordu ve GitHub Pages
    `basePath` (`/promptly`) hiç eklenmiyordu — üretimde paylaşılan/kopyalanan
    her bağlantı (prompt kartları dahil, Bölüm 14'ten beri) 404 verirdi. Yeni
    `lib/utils.ts` → `absoluteUrl()` ile düzeltildi; hem profil paylaşımı hem
    var olan tüm `ShareButton` kullanımları bundan yararlanıyor.
  - Playwright ile uçtan uca doğrulandı: kendi profili ↔ başka profil doğru
    ayrılıyor (takip butonu/Kaydedilenler-Beğeniler sekmeleri yalnızca doğru
    tarafta); sekme geçişleri, içerik türü filtresi, sıralama; profil
    düzenleme formu doldurup kaydedince görünen ad/bio/ilgi alanı/avatar
    profile yansıyor ve sayfa yenilenince kalıcı kalıyor; kullanıcı adı alanı
    devre dışı; gizle → karttan kayboluyor → "Göster" ile geri görünüyor →
    menüden "geri getir" ile kalıcı olarak geri geliyor; kopyala akışı
    `/create?duplicate=`'i doğru dolduruyor; mobilde yatay taşma yok; tablet
    ve masaüstünde masonry dengeli; açık/koyu temada tutarlı; ana sayfa,
    keşfet, `/saved`, prompt detay sayfası ve beğeni butonu (Bölüm 14)
    bozulmadı.
- **Prompt oluşturma + prompt isteği sistemi uçtan uca (Bölüm 9/10'un
  derinleştirilmesi):** Kapsam kararı — istekte "gerçek veri akışı, sahte
  kalıcı kayıt yok" isteniyordu ama projede hâlâ Supabase/Auth/RLS yok
  (Bölüm 17-21 başlamadı). Bu yüzden Follow/Like/Save/Comment'te kurulan
  aynı dürüstlük ilkesi uygulandı: **istek oluşturma ve isteğe yanıt verme
  artık gerçekten, kalıcı olarak yayınlıyor** — ama yalnızca bu tarayıcıda
  (localStorage), gerçek bir Supabase kaydı gibi değil. Düz "Prompt
  Oluştur" akışı (istek/remix/kopya olmayan) CLAUDE.md §2 gereği kasıtlı
  olarak **değiştirilmedi** — hâlâ önizleme-yalnızca, çünkü zaten çalışan,
  belgelenmiş bir davranışı görev kapsamı dışında değiştirmemek gerekiyordu.
  - **Oluştur seçim ekranı:** Yeni `features/prompts/create-choice.tsx` +
    `create-gate.tsx`. `/create` artık boş ziyaret edildiğinde "Prompt
    oluştur" / "İstek oluştur" seçim ekranı gösteriyor; `?remix=`,
    `?remixResponse=`, `?duplicate=`, `?answerRequest=` veya `?mode=prompt`
    taşıyan mevcut derin bağlantılar seçim ekranını atlayıp doğrudan forma
    gidiyor — hiçbir mevcut link bozulmadı.
  - **Yeni `features/requests/requests-provider.tsx`** (`RequestsProvider`/
    `useRequests`, anahtar `"promptly-local-requests"`, Follow/Like ile
    birebir aynı mimari): `addRequest`, `deleteRequest`, `updateStatus`,
    `selectResponse`. Yalnızca "me" adına, yalnızca yerel olarak oluşturulan
    istekler üzerinde çalışıyor — "me" hiçbir mock isteğin sahibi olmadığından
    (hepsi diğer mock kullanıcılara ait), durum değiştirme/silme/yanıt seçme
    yapısal olarak yalnızca kendi oluşturduğun isteklerde mümkün; bu istemci
    tarafı bir "izin kontrolü" değil, doğrudan verinin nerede yaşadığının
    sonucu.
  - **Yeni `features/requests/create-request-form.tsx`** (`/requests/new`):
    başlık (10-100 karakter), açıklama (20-500 karakter, sayaç ve doğrulama
    mesajlarıyla), içerik türü (yeni `PromptRequest.contentType` alanı —
    `Prompt.contentType` ile aynı union), yaratıcı yön (opsiyonel), referans
    görsel yükleme (opsiyonel, gerçek — `resizeImageToDataUrlFit` ile
    localStorage'a sığacak şekilde küçültülüyor), tercih edilen araç,
    etiketler. Canlı önizleme gerçek `RequestCard` ile. Yayınlanınca gerçek
    `PromptRequest` kaydı oluşuyor ve `/requests/local?id=…`'e yönlendiriyor
    (bkz. altındaki "yeni route" notu).
  - **Prompt isteğine gerçek yanıt verme:** `CreatePromptForm`'a yeni
    `?answerRequest=<requestId>` modu eklendi — üstte "Bu isteğe yanıt
    veriyorsun" bandı (istek sahibi + başlık + "İsteği görüntüle" +
    "yanıt modundan çık"), buton "Yanıtı Yayınla" oluyor, ve **bu, formun
    submit'inin gerçekten kalıcı yayın yaptığı TEK mod**: yeni
    `features/prompts/local-prompts-provider.tsx` (`LocalPromptsProvider`/
    `useLocalPrompts`, anahtar `"promptly-local-prompts"`) üzerinden gerçek
    bir `Prompt` oluşturuyor, `origin: {type:"request-response", requestId,
    responseId}` ile (responseId artık ayrı bir varlık değil, yanıtın
    kendi id'si — eskiden `mockRequestResponses`'taki ayrı bir satırdı, artık
    yanıt gerçek bir Prompt olduğundan ayrı bir varlığa gerek kalmadı).
    Geçersiz/silinmiş bir isteğe yanıt linki açılırsa form yerine "İstek
    bulunamadı" hata ekranı gösteriliyor — yanlış isteğe yanlışlıkla
    bağlanan bir yanıt oluşmuyor. Çift gönderimi engellemek için buton
    gönderim sırasında devre dışı bırakılıyor.
  - **Statik export + runtime id çelişkisi (önemli mimari not):** Bu
    proje `output:"export"` ile tamamen statik — `/prompts/[id]` ve
    `/requests/[id]`'nin tüm yolları `generateStaticParams()` ile BUILD
    ZAMANINDA sabitleniyor. Tarayıcıda sonradan oluşturulan bir id
    (`local-…`) o yollarda gerçekte var olmayan bir sayfaya denk gelir ve
    GitHub Pages'te 404 verirdi. Çözüm: yeni, parametre'siz statik rotalar
    — `/prompts/local` ve `/requests/local` — id'yi path segment'i yerine
    `?id=` query string'inden okuyor (query string prerender gerektirmez).
    Yeni `lib/utils.ts` → `promptHref()` / `requestHref()` yardımcıları bu
    ayrımı tek yerden yönetiyor (`local-` önekiyle başlayan id'ler → yeni
    route'lar); PromptCard, PromptCardFooter, RemixSourceLink, ShareButton,
    ProfileContentMenu, RequestCard dahil linke sahip HER bileşen bu
    yardımcıları kullanacak şekilde güncellendi. Kod tekrarını önlemek için
    hem `/prompts/[id]` hem `/prompts/local`, hem `/requests/[id]` hem
    `/requests/local` aynı paylaşılan client bileşenini render ediyor
    (`PromptDetailView`, `RequestDetailView`) — mock/yerel ayrımı yalnızca
    hangi route'un hangi veri kaynağından prompt/isteği bulduğunda.
  - **İstek detayında gerçek yönetim:** kendi (yerel) isteğinde "İsteği
    kapat" / "Açık olarak işaretle" ve "İsteği sil" (iki tıklamalı onay)
    gerçekten çalışıyor. Başkasının (veya mock) isteğinde bunlar yerine
    "Yanıtla" butonu gösteriliyor (istek kapalıysa gizleniyor, nedeni
    yazıyor). "Düzenle" **eklenmedi** — kapsam/süre nedeniyle bilinçli
    olarak dışarıda bırakıldı (aşağıya bakınız).
  - **Yanıt seçimi:** kendi isteğindeki her gerçek (yerel) yanıtın yanında
    "Yanıtı seç" / "Seçilen yanıt" kontrolü var; seçim `PromptRequest.
    selectedResponsePromptId` alanına (yeni) kalıcı yazılıyor, sayfa
    yenilenince korunuyor, seçilince istek durumu otomatik "Yanıtlandı"
    oluyor, ve seçilen yanıtın kendi detay sayfasında "Bu yanıt seçildi"
    rozeti görünüyor. Yalnızca istek sahibi seçebiliyor — başkası (mock
    yanıtlar için zaten mümkün değil, çünkü mock isteklerde bu kontrol hiç
    gösterilmiyor).
  - **Yorumlar — mevcut sistem birebir yeniden kullanıldı, paralel bir
    sistem KURULMADI:** `PromptComment` tipine `requestId?` eklendi
    (`promptId?` da opsiyonel yapıldı — ikisinden yalnızca biri set
    edilir). `comment-provider.tsx`/`comment-section.tsx` artık
    `{promptId}` veya `{requestId}` alan genel bir `CommentTarget` ile
    çalışıyor; aynı bileşen, aynı localStorage anahtarı, aynı UI hem prompt
    hem istek detayında. İstek kapalıysa `CommentSection`'a
    `disabledReason` geçiriliyor — composer gizleniyor, mevcut yorumlar
    salt okunur kalıyor. `mocks/comments.ts`'e `mockRequestComments` +
    `getCommentsForRequest` eklendi (r1 için 2 örnek yorum).
  - **Ana sayfa/keşfet/profil entegrasyonu:** `FeedTabs` ve `DiscoverFeed`
    artık `useLocalPrompts()`/`useRequests()` ile yerel istekleri ve
    yanıtları sunucudan gelen mock listeye client-side ekleyip tarihe göre
    yeniden sıralıyor. `ProfileView` kendi profilinde yerel promptları
    (yanıtlar dahil) `authorPrompts`'a katıyor; `/saved` de yerel promptları
    dahil ediyor. `RequestCard`'daki yanıt sayısı artık yeni
    `RequestResponseCount` (client) ile gerçek yerel yanıt sayısını da
    katıyor (beğeni sayısındaki optimistik +1/-1 tekniğiyle aynı fikir).
  - **Yan düzeltme (bug fix):** `resizeImageToDataUrlFit` eklendi
    (`lib/utils.ts`) ve `CreatePromptForm`'un görsel yükleme alanı buna
    geçirildi — eskiden `URL.createObjectURL` + component unmount'ta
    `URL.revokeObjectURL` kullanıyordu, bu önizleme-yalnızca modda zararsızdı
    ama artık gerçekten kalıcı hale gelen `answerRequest` modunda görseli
    formdan ayrılır ayrılmaz kırık bir blob URL'e dönüştürüp her yerde
    (feed, profil, detay) bozuk görsel gösterirdi. Artık gerçek, kalıcı bir
    data URL kullanılıyor.
  - Playwright ile 29 adımlık uçtan uca senaryo doğrulandı: seçim ekranı →
    istek oluştur → gerçekten kaydediliyor → `/requests`, ana sayfa,
    keşfette görünüyor → isteğe yorum ekle (kalıcı) → "Yanıtla" ile gerçek
    yanıt yayınla → yanıtın kendi tam donanımlı (beğeni/yorum/remix) detay
    sayfası var → istek detayında yanıt listeleniyor → istek sahibi yanıtı
    seçiyor (kalıcı, durum "Yanıtlandı" oluyor) → yanıt kendi sayfasında
    "seçildi" rozetini gösteriyor → yanıt profilde görünüyor → istek
    silinince listeden kayboluyor. Ayrıca 21 adımlık regresyon: mock istek/
    prompt detayları, beğeni butonu, profil, ana sayfa/keşfet/kaydedilenler/
    arama, mevcut remix/kopya akışları, mobilde yatay taşma yok, açık/koyu
    tema — hiçbiri bozulmadı.
- **Kayıt, giriş, hesap ayarları — gerçek Supabase Auth (Bölüm 17):**
  Projeye ilk kez gerçek bir Supabase projesi bağlandı (`NEXT_PUBLIC_
  SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `.env.local`'de — asla
  commit edilmedi, `.gitignore` ile doğrulandı). `@supabase/supabase-js`
  eklendi. Bu, projedeki **tek gerçek, sunucu tarafı backend bağlantısı** —
  geri kalan her şey (follow/like/save/comment/profil/istek/prompt) hâlâ
  bu tarayıcıya özel localStorage state.
  - **Kapsam kararı:** Bu modül yalnızca "kim giriş yapmış" sorusuna gerçek
    bir cevap veriyor. `profiles` tablosu henüz yok (Bölüm 18), bu yüzden
    gerçek Supabase hesapları mock "me" persona'sına veya prompt/takip/
    beğeni verisine BAĞLANMADI — bunlar bilinçli olarak aynı kalmaya devam
    ediyor (`/profile/me` hâlâ mock "Sen" kullanıcısı, oluşturulan
    promptlar/istekler hâlâ "me" adına). Gerçek hesap ↔ gerçek profil/veri
    bağlantısı Bölüm 18 (şema) ve Bölüm 21'in (frontend bağlantısı) işi.
  - **Yeni `src/lib/supabase/client.ts`:** tarayıcı Supabase client'ı
    (`createClient`, anon key ile — bu anahtar public olacak şekilde
    tasarlanmıştır, güvenlik sınırı RLS politikalarıdır, henüz yazılmadı,
    Bölüm 19). Statik export'ta sunucu çalışma zamanı olmadığından
    (middleware/route handler yok) Supabase'e erişim yalnızca tarayıcıdan.
  - **Yeni `features/auth/auth-provider.tsx`** (`AuthProvider`/`useAuth`,
    kök `layout.tsx`'e eklendi — tüm uygulamayı sarıyor): gerçek Supabase
    oturumunu `getSession()` + `onAuthStateChange` ile izliyor, `user`/
    `session`/`loading`/`isPasswordRecovery`/`signOut` sağlıyor. Session
    kalıcılığı supabase-js'in kendi localStorage mekanizmasıyla oluyor
    (ayrı bir "promptly-*" anahtarı değil, Supabase'in kendi anahtarı).
  - **`/login`, `/signup`, `/reset-password`** artık gerçek, çalışan
    formlar (eskiden hepsi `disabled` placeholder'dı):
    - Giriş: `signInWithPassword`; zaten oturum açıksa otomatik ana
      sayfaya yönlendiriyor.
    - Kayıt: `signUp` — yalnızca e-posta/şifre/görünen ad topluyor;
      görünen ad Supabase'in kendi `auth.users.user_metadata`'sına
      **gerçekten** yazılıyor (mock değil), ama henüz hiçbir yerde
      okunmuyor/gösterilmiyor (`profiles` yok). Proje e-posta doğrulaması
      istiyorsa (varsayılan Supabase ayarı) "e-postanı kontrol et" ekranı
      gösteriliyor; istemiyorsa doğrudan oturum açılıp yönlendiriliyor —
      kod her iki durumu da (`data.session` var/yok) doğru işliyor.
    - Şifre sıfırlama: iki gerçek mod tek sayfada — e-posta ile bağlantı
      isteme (`resetPasswordForEmail`) ve e-postadaki bağlantıyla geri
      dönüldüğünde (Supabase `PASSWORD_RECOVERY` olayı) otomatik olarak
      açılan "yeni şifre belirle" formu (`updateUser`).
    - `/settings` artık gerçek hesap sayfası: giriş yapılmışsa gerçek
      e-posta + çalışan "şifre değiştir" formu + "çıkış yap"; giriş
      yapılmamışsa "giriş yap" yönlendirmesi. Profil bilgileri (ad/bio/ilgi
      alanları) hâlâ `/profile/edit`'te — iki sistem kasıtlı olarak
      karıştırılmadı, hangisinin gerçek hesap hangisinin mock profil
      olduğu net.
  - **Hata mesajları Türkçeleştirildi:** yeni `features/auth/auth-errors.ts`
    → `translateAuthError()`, Supabase'in İngilizce `AuthError.message`
    metinlerini ("Invalid login credentials", "User already registered"
    vb.) bilinen durumlar için Türkçeye çeviriyor, bilinmeyenlerde ham
    mesajı gösteriyor (gizlemiyor).
  - **Önemli operasyonel not (kullanıcı için):** Supabase projesinin
    Authentication → URL Configuration ayarına bu uygulamanın gerçek
    adresleri (GitHub Pages: `https://aliq0330.github.io/promptly/**`,
    yerel geliştirme: `http://localhost:3000/promptly/**`) redirect
    allow-list'e eklenmeli — eklenmezse şifre sıfırlama/e-posta doğrulama
    bağlantıları Supabase tarafından reddedilir. Bu, kod tarafında
    yapılabilecek bir şey değil, Supabase Dashboard'da elle yapılması
    gereken bir ayar.
  - **Test sınırlaması (dürüstçe belirtilmeli):** Bu oturumun çalıştığı
    sandbox'ın ağ politikası, gerçek Supabase projesine (`*.supabase.co`)
    doğrudan çıkışı engelliyor (`curl` ile doğrulandı: `403 connect_
    rejected`, kurumsal politika). Bu yüzden gerçek e-posta gönderimi/
    gerçek kullanıcı oluşturma bu ortamda **canlı olarak test edilemedi**.
    Bunun yerine Playwright ile Supabase auth-js'in tam olarak çağırdığı
    REST uç noktaları (`/auth/v1/token`, `/auth/v1/signup`, `/auth/v1/
    recover`, `/auth/v1/logout`) ağ katmanında taklit edilerek (mock
    response) uygulamanın KENDİ mantığı (yükleniyor durumları, hata
    çevirisi, yönlendirmeler, e-postanı-kontrol-et ekranı, oturum açıkken
    /login'den yönlendirme, çıkış yapınca /settings'in güncellenmesi) 13 +
    7 = 20 adımda doğrulandı — hepsi geçti. Ayrıca 21 adımlık mevcut
    regresyon paketi de sorunsuz geçti. **Ancak gerçek Supabase projesine
    karşı canlı bir kayıt/giriş/şifre-sıfırlama denemesi hiç yapılmadı** —
    bunu ya yerel makinenizde (`npm run dev`) ya da GitHub Pages'teki
    canlı sitede bizzat denemeniz gerekiyor. Kod, Supabase'in resmi
    `@supabase/supabase-js` v2 API'sine birebir uygun yazıldı ve build/
    typecheck/lint hatasız, ama "gerçek projenizle uçtan uca çalışıyor"
    iddiası ancak sizin canlı denemenizle doğrulanabilir.
  - **Düzeltme — görünürlük hatası:** İlk uygulamada `/login`/`/signup`/
    `/settings` sayfaları çalışıyordu ama uygulamanın **hiçbir yerinde
    bunlara giden bir bağlantı yoktu** (header, sidebar, mobil menü —
    hiçbiri) — kullanıcı bunu fark edip bildirdi. Kök neden: "mevcut mock
    deneyimi bozma" kararı header'a hiç dokunmama şeklinde yanlış
    uygulanmıştı, oysa gerçek auth'un en azından GÖRÜNÜR bir giriş noktası
    olması gerekirdi. Düzeltildi:
    - `Header` artık `"use client"` ve `useAuth()` kullanıyor: gerçek oturum
      yokken header'da mor bir **"Giriş Yap"** butonu beliriyor (mobilde
      yalnızca ikon), gerçekten giriş yapılınca kayboluyor. Mock "Sen"
      avatarı hâlâ değişmeden duruyor (o hâlâ mock deneyimin parçası).
    - `components/layout/nav-items.ts`: masaüstü sidebar'a **"Ayarlar"**
      linki eklendi (`/settings`) — mobil alt navigasyona eklenmedi (sabit
      5 öğe kuralı, CLAUDE.md §5).
    - `features/profile/profile-actions.tsx`: `OwnProfileActions`'a bir
      dişli (Settings) ikonu eklendi (`/settings`'e) — mobilde sidebar
      olmadığından, kendi profiline (zaten alt navigasyonda olan bir sekme)
      giden bu yol gerçek hesap ayarlarına/çıkışa mobilde de ulaşılabilir
      kılıyor.
    - Playwright ile doğrulandı: çıkışlıyken header'da "Giriş Yap" görünüyor
      ve tıklanınca gerçekten `/login`'e gidiyor; sidebar'daki ve profildeki
      "Ayarlar" linkleri gerçekten `/settings`'e gidiyor; (mock) giriş
      yapılınca "Giriş Yap" header'dan kayboluyor; mobilde yatay taşma yok;
      21 adımlık mevcut regresyon paketi bozulmadı.

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

- Takip durumu yalnızca bu tarayıcıda (`localStorage`) yaşıyor — başka bir
  cihaz/tarayıcıda veya gizli sekmede oturum açan aynı kullanıcı takip
  listesini görmez, ve diğer kullanıcılar birinin "beni takip etti"ğini
  gerçekten görmez (bildirim mock verisi statik kalıyor). Gerçek çapraz
  kullanıcı senkronizasyonu `follows` tablosu + Supabase Auth gerektirir
  (Bölüm 17–21).
- Beğeni, kaydetme ve yorumlar da aynı şekilde yalnızca bu tarayıcıda
  yaşıyor (localStorage) — başkası bir promptu beğendiğinde/yorum
  yaptığında yazar gerçek bir bildirim almıyor (bildirimler mock veride
  statik kalmaya devam ediyor) ve başka bir cihazdan bakıldığında bu
  eylemler görünmüyor. Gerçek, çapraz kullanıcı senkronizasyonu
  `prompt_likes`/`prompt_saves`/`prompt_comments` tabloları + Supabase Auth
  gerektirir (Bölüm 17–21).
- Yorum ekleme yalnızca promptlar için var; istek yanıtlarının
  (`PromptRequestResponse`) hiç yorum veri modeli yok, bu yüzden
  `ResponseCard`'daki yorum sayısı hâlâ salt okunur/statik. Ayrıca eklenen
  yorumlara yanıt (reply) verme arayüzü yok — yalnızca üst seviye yorum
  eklenebiliyor; mock veride zaten var olan `parentId`'li yanıtlar salt
  okunur gösterilmeye devam ediyor.
- `likeCount`/`commentCount` gibi kart üzerindeki toplam sayılar hâlâ
  mock'un statik alanları + bu oturumun kendi eylemine göre ±1 optimistik
  düzeltme (takipçi sayısında kullanılan aynı teknik) — gerçek bir
  "kaç kişi beğendi" agregasyonu backend'e bağlı.
- Profil düzenlemeleri (`ProfileOverridesProvider`), gizlenen promptlar ve
  ilgi alanları da Follow/Like/Save ile aynı sınırlamayı taşıyor: yalnızca
  bu tarayıcıda yaşıyor, yalnızca "me" hesabına uygulanıyor, başka bir
  cihazdan veya gizli sekmeden bakıldığında görünmüyor.
- Kullanıcı adı (username) değişikliği desteklenmiyor — statik export'ta
  her profil rotası build zamanında kullanıcı adına göre üretiliyor; gerçek
  bir yeniden adlandırma sunucu tarafı routing/redirect ister ve ancak
  Supabase Auth ile (Bölüm 17) mümkün olur.
- Takipçi listesi (kimlerin beni takip ettiği) hiçbir profilde
  gösterilmiyor/tıklanamıyor — mock veri modelinde "kim kimi takip ediyor"
  ilişkisi hiç yok, yalnızca statik bir `followerCount` sayısı var. Gerçek
  bir liste `follows` tablosu gerektirir (Bölüm 18, 21).
- "Profilimden gizle" bir silme değildir: mock prompt dizisi durağan ve
  backend olmadığından hiçbir şey sunucu tarafında silinmiyor/değişmiyor;
  yalnızca bu tarayıcının kendi galeri görünümünden kaldırılıyor ve aynı
  tarayıcıdan geri getirilebiliyor. Gerçek silme/taslağa alma/yeniden
  yayımlama Bölüm 18–21'e bağlı.
- Profil düzenleme formunda avatar dışında dosya boyutu sınırlaması
  gösterilmiyor (canvas her zaman 160×160'a küçültüyor); çok büyük
  görsellerde tarayıcı belleği/performansı üzerinde küçük bir yavaşlama
  olabilir — gerçek bir yükleme, boyut kontrolü Supabase Storage'a
  bağlanınca (Bölüm 20) sunucu tarafında ele alınacak.
- **Yerel istekler/yanıtlar da Follow/Like/Save ile aynı sınırlamayı
  taşıyor:** yalnızca bu tarayıcıda yaşıyor, yalnızca "me" hesabıyla
  oluşturulabiliyor, başka bir cihaz/tarayıcıdan görünmüyor. Bu yüzden
  "başka bir kullanıcı isteğe yanıt versin" senaryosu gerçek çoklu kullanıcı
  testine (Supabase Auth, Bölüm 17-21) kadar yalnızca aynı tarayıcıda "me"
  hem istek açıp hem kendi isteğine yanıt vererek" test edilebiliyor —
  bu dürüstçe böyle, sahte bir ikinci kullanıcı simüle edilmedi.
- **İstek düzenleme ("Düzenle") eklenmedi:** kapsam kararı olarak yalnızca
  "kapat/aç" ve "sil" gerçek yönetim aksiyonları olarak uygulandı; bir
  isteğin başlığını/açıklamasını/etiketlerini sonradan değiştirme akışı
  bu modülde yok. Şu an için istek sahibi yanlış bir istek yayınladıysa
  silip yeniden oluşturabilir.
- **Bildirimler bu modülde de mock/statik kaldı:** yeni bir istek
  oluşturulduğunda, bir isteğe yanıt/yorum geldiğinde veya bir yanıt
  seçildiğinde ilgili kullanıcıya (zaten yalnızca "me" olabileceğinden
  kendine) gerçek bir bildirim üretilmedi — bu, Follow/Like/Comment
  modüllerinde de aynı şekilde zaten kabul edilmiş, belgelenmiş bir
  sınırlama (bkz. yukarıdaki maddeler); yeni bir bildirim sistemi kurmak
  yerine mevcut sınırlama korundu, gerçek bildirimler Supabase + Auth
  gerektiriyor (Bölüm 17-21).
- **İstek/yanıt yetkilendirmesi RLS ile değil, veri konumuyla sağlanıyor:**
  gerçek bir backend/RLS olmadığından "yalnızca sahibi düzenleyebilir" gibi
  kurallar sunucu tarafında değil, İSTEMCİ tarafında (yalnızca yerel
  diziye erişilebiliyor olmasıyla) sağlanıyor — bu, tarayıcı geliştirici
  araçlarıyla atlatılabilecek bir güvenlik sınırı DEĞİLDİR, yalnızca bir
  prototip davranışıdır. Gerçek yetkilendirme (RLS politikaları, sunucu
  tarafı kullanıcı doğrulama) Bölüm 19'a bağlı.
- **Referans görsel ve içerik türü** (`PromptRequest.referenceImage`,
  `PromptRequest.contentType`) yeni, yerel/TASLAK alanlar — eski 6 mock
  istekte `contentType` set edilmedi (`RequestCard` bu durumda türü rozetini
  basitçe göstermiyor, hata vermiyor).
- **Gerçek Supabase Auth ile mock veri arasında henüz köprü yok:** giriş
  yapmış gerçek bir hesap, uygulamanın geri kalanında hâlâ "me" mock
  persona'sını görür/kullanır — kendi gerçek promptların, gerçek takipçilerin
  yoktur, çünkü bunlar mock veriden geliyor ve `profiles`/`prompts` gibi
  gerçek tablolar henüz yok (Bölüm 18). Yani şu an "gerçekten giriş
  yapabiliyorsun" ile "uygulama seni tanıyor" ayrı şeyler — ikincisi Bölüm
  21'e kadar gerçekleşmeyecek.
- **Hiçbir sayfa/aksiyon gerçek girişe kilitlenmedi:** mevcut mock deneyim
  (herkes her sayfayı görebiliyor, "me" adına içerik oluşturabiliyor)
  kasıtlı olarak değiştirilmedi — bu modülün amacı yalnızca auth
  formlarının ve hesap ayarlarının gerçekten çalışması, mevcut sayfaların
  girişe zorlanması değil. Sayfa erişim kısıtlamaları anlamlı hâle
  gelmesi için gerçek kullanıcı ↔ gerçek veri bağlantısı (Bölüm 18, 21)
  gerekiyor.
- **Canlı ağ testi yapılamadı (bkz. yukarıdaki not):** bu geliştirme
  ortamının ağ politikası `*.supabase.co`'ya doğrudan çıkışı engelliyor;
  auth akışları yalnızca Playwright'ta ağ seviyesinde taklit edilen
  (mock) Supabase yanıtlarıyla doğrulandı. Gerçek e-posta gönderimi,
  gerçek kayıt/giriş, ve Supabase projesinin redirect URL ayarının doğru
  yapılandırılıp yapılandırılmadığı yalnızca gerçek bir ortamda (yerel
  makine veya canlı site) denenerek doğrulanabilir.
- Supabase projesinin **Authentication → URL Configuration** ayarına
  uygulamanın gerçek adresleri eklenmezse şifre sıfırlama/e-posta
  doğrulama bağlantıları çalışmaz — bu kod dışı, Dashboard'da yapılması
  gereken bir kurulum adımıdır (yukarıdaki not).

**Sonraki modül:** Supabase veritabanı ve migration dosyaları (Bölüm 18).
