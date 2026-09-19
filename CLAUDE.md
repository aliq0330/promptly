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
16. [x] Özel mesajlaşma (mock konuşmalarda mesaj gönderme hâlâ devre dışı; gerçek hesaplar arası mesajlaşma artık gerçek — bkz. Bölüm 9)
17. [x] Kayıt, giriş, hesap ayarları (gerçek Supabase Auth bağlantısı — bkz. Bölüm 9; hesap ↔ mock profil/veri entegrasyonu Bölüm 18/21'e bağlı)
18. [x] Supabase veritabanı ve migration dosyaları (şema tasarlandı, 7 migration dosyası yazıldı ve yerel bir Postgres 16 örneğinde gerçek olarak doğrulandı; gerçek Supabase projesine HENÜZ uygulanmadı — bkz. `supabase/README.md` ve Bölüm 9)
19. [x] RLS ve güvenlik politikaları (17 tablonun tümüne gerçek erişim
    politikaları yazıldı ve yerel bir Postgres 16 örneğinde gerçek
    `anon`/`authenticated` rol simülasyonuyla doğrulandı; gerçek Supabase
    projesine HENÜZ uygulanmadı — bkz. `supabase/README.md` ve Bölüm 9)
20. [x] Supabase Storage (3 herkese açık bucket — avatars/prompt-media/
    request-references — gerçek yol-bazlı RLS politikalarıyla tasarlandı
    ve yerel bir Postgres 16 örneğinde `storage` şemasının sadık bir
    taklidiyle doğrulandı; gerçek Supabase projesine HENÜZ uygulanmadı —
    bkz. `supabase/README.md` ve Bölüm 9)
21. [x] Frontend'in gerçek Supabase'e bağlanması (TAMAMLANDI —
    Faz 1: düz "Prompt Oluştur" ve "Kopyasını Oluştur" artık gerçekten,
    kalıcı olarak Supabase'e yayınlıyor ve feed/keşfette/kendi detay
    sayfasında görünüyor. Faz 2: gerçek kullanıcıların artık gerçek bir
    profil sayfası var (`/profile/real`) — kendi promptları, gerçek
    düzenleme (Storage'a avatar yükleme dahil), header/sidebar/mobil
    navigasyonun "Profil" linki artık gerçek hesaba yönleniyor. Faz 3:
    gerçek bir prompt/kullanıcıda beğeni/kaydetme/takip artık gerçekten,
    kalıcı olarak Supabase'e yazılıyor (`/saved` ve profildeki Kaydedilenler/
    Beğeniler sekmeleri dahil). Faz 4: gerçek bir promptta yorum ekleme
    artık gerçekten, kalıcı olarak Supabase'e yazılıyor (herkes okuyabilir,
    yalnızca giriş yapan yazabilir). Faz 5: gerçek prompt istekleri —
    giriş yapmış bir kullanıcının istek oluşturması, gerçek bir isteği
    yönetmesi (kapat/aç/sil/yanıt seç) ve gerçek bir isteğe gerçek bir
    yanıt yayınlaması artık Supabase'e kalıcı olarak yazılıyor. Faz 6:
    gerçek mesajlaşma — iki gerçek hesap artık gerçekten, kalıcı olarak
    birbirine mesaj gönderip alabiliyor. Mock deneyim (mock kullanıcılar,
    mock konuşmalar, localStorage tabanlı beğeni/kaydetme/takip/yorum/
    istek prototipleri) hiçbiri kaldırılmadı, gerçek hesap yolu bunların
    yanında ayrı bir katman olarak eklendi — bkz. Bölüm 9)
22. [ ] Moderasyon, engelleme, raporlama
23. [ ] Testler, performans, erişilebilirlik
24. [ ] Deployment ve son kalite kontrolü

---

## 9. Şu Anki Durum (bu bölüm her modül sonunda güncellenir)

**Son güncelleme:** Bölüm 21 — Frontend'in gerçek Supabase'e bağlanması,
Faz 6 (TAMAMLANDI). Gerçek mesajlaşma artık uçtan uca çalışıyor: iki
gerçek hesap birbirinin gerçek profilinden "Mesaj Gönder"e basıp gerçek,
kalıcı bir konuşma başlatabiliyor ve mesaj gönderip alabiliyor — hepsi
Supabase'e kalıcı olarak yazılıyor. Bu, Bölüm 21'in planlanan son fazıydı:
prompt oluşturma/görüntüleme (Faz 1), kullanıcı profilleri (Faz 2), beğeni/
kaydetme/takip (Faz 3), yorum ekleme (Faz 4), prompt istekleri (Faz 5) ve
mesajlaşma (Faz 6) artık hepsi gerçek Supabase üzerinde çalışıyor — mock
veri/localStorage deneyimi hiçbir yerde kaldırılmadı, gerçek hesap yolu
onun yanında ayrı, dürüstçe belgelenmiş bir katman olarak duruyor.

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
- **Supabase veritabanı ve migration dosyaları (Bölüm 18):** `src/types/
  index.ts`'teki mock veri modelini birebir yansıtan gerçek bir Postgres
  şeması, `supabase/migrations/` altında 7 sıralı SQL dosyası olarak
  yazıldı (`supabase/README.md`'de uygulama talimatları ve tam tablo
  listesiyle belgelendi):
  - `20260919120000_extensions_and_helpers.sql` — `pgcrypto` (uuid üretimi
    için) ve genel `set_updated_at()` trigger fonksiyonu.
  - `20260919120100_profiles.sql` — `profiles` tablosu (`auth.users`'a 1:1,
    `username` benzersiz + format kontrollü, `interests text[]`,
    `follower_count`/`following_count` sayaçları), `generate_username()`
    fonksiyonu (e-postanın `@` öncesinden türetip çakışırsa rastgele sayı
    ekliyor) ve `handle_new_user()` `SECURITY DEFINER` trigger'ı — Bölüm
    17'nin gerçek `supabase.auth.signUp()` çağrısı tamamlanır tamamlanmaz
    otomatik bir `profiles` satırı oluşturuyor (display_name'i
    `user_metadata`'dan okuyarak).
  - `20260919120200_prompts_and_requests.sql` — `tags`, `prompt_requests`,
    `prompts` (origin/content_type/status için `CHECK` kısıtlamaları,
    `prompts_origin_shape` ile `PromptOrigin` union tipinin şeklini
    veritabanı seviyesinde zorluyor), `prompt_media`, `prompt_tags`,
    `prompt_request_tags`. **Mimari karar:** ayrı bir
    `prompt_request_responses` tablosu YOK — Bölüm 9/10'da zaten bir
    isteğe verilen yanıtın `origin.type === "request-response"` olan
    normal bir `Prompt` olduğuna karar verilmişti; şema bu kararı
    birebir izliyor, paralel bir veri modeli kurulmadı.
  - `20260919120300_engagement.sql` — `prompt_likes`, `prompt_saves`,
    `prompt_comments` (`prompt_comments_exactly_one_target` CHECK'i ile
    `promptId`/`requestId`'den tam olarak birinin dolu olmasını zorluyor),
    `follows` (`follows_no_self_follow` CHECK), artı `like_count`,
    `comment_count`, `follower_count`/`following_count`, `remix_count`,
    `response_count` gibi TÜM sayaç kolonlarını her INSERT/DELETE'te
    güncel tutan trigger fonksiyonları (read-time `COUNT()` yerine
    denormalize edilmiş kolonlar — performans için).
  - `20260919120400_messaging_and_notifications.sql` — `conversations`,
    `conversation_members`, `messages` (yeni mesaj → `last_message_at` ve
    diğer üyelerin `unread_count`'unu güncelleyen trigger), `notifications`.
  - `20260919120500_moderation.sql` — CLAUDE.md §6'nın planladığı
    `reports` (polimorfik `target_type`/`target_id`) ve `blocks`
    (`blocks_no_self_block` CHECK) tabloları — uygulama mantığı henüz yok
    (Bölüm 22), yalnızca şema hazırlandı.
  - `20260919120600_seed_tags.sql` — `src/mocks/tags.ts`'teki 20 sabit
    etiketi gerçek `tags` tablosuna `ON CONFLICT DO NOTHING` ile ekliyor.
  - **RLS:** Her tabloda oluşturulduğu anda `ENABLE ROW LEVEL SECURITY`
    çalıştırıldı, hiçbir politika yazılmadı (bilinçli olarak Bölüm 19'a
    bırakıldı) — yani şu an `anon`/`authenticated` anahtarlarıyla hiçbir
    tablodan tek bir satır bile okunamaz/yazılamaz; "varsayılan olarak
    kapalı, güvenli tarafta" bir ara durum.
  - **Nasıl doğrulandı (canlı ağ erişimi engellendiği için — bkz. Bölüm
    17'deki not):** migration dosyaları gerçek Supabase projesine hiç
    uygulanmadı; bunun yerine bu sandbox'ta önceden kurulu PostgreSQL 16
    ile geçici, tek kullanımlık yerel bir veritabanı açıldı, `auth.users`
    ve `extensions` şeması için minimal bir taklit oluşturuldu, ve 7
    migration dosyasının TAMAMI bu veritabanına gerçekten uygulanıp şu
    senaryolar fiilen test edildi (görsel inceleme değil, çalıştırılıp
    sonucu doğrulanan gerçek SQL): yeni `auth.users` satırı eklenince
    `profiles` satırının otomatik oluşması; aynı e-posta yerel-adına sahip
    ikinci bir kullanıcı kaydolunca kullanıcı adı çakışmasının rastgele
    ek ile doğru çözülmesi; beğenme/beğenmekten vazgeçmenin
    `like_count`'u +1/-1 etmesi; yorum eklemenin `comment_count`'u
    artırması; takip etmenin hem takip edilenin `follower_count`'unu hem
    takip edenin `following_count`'unu artırması; remix oluşturmanın
    orijinal promptun `remix_count`'unu artırması; bir isteğe yanıt
    oluşturmanın isteğin `response_count`'unu artırması ve yanıt
    seçmenin `selected_response_prompt_id`'yi güncelleyip durumu
    "Yanıtlandı" yapması; ve geçersiz verilerin (aynı yorumda hem
    `prompt_id` hem `request_id`, kendi kendini takip/engelleme,
    `source_prompt_id` olmadan remix origin'i, geçersiz `content_type`,
    yinelenen kullanıcı adı) hepsinin beklendiği gibi hata vererek
    reddedilmesi; son olarak `public` şemasındaki 17 tablonun tümünde
    RLS'nin gerçekten açık olduğu doğrulandı. Test veritabanı işlem
    bitince silindi (`DROP DATABASE`) — depoda kalıcı bir iz bırakmadı.
  - Yeni `supabase/README.md`: migration'ların nasıl uygulanacağını
    (Dashboard → SQL Editor adım adım, veya `supabase link && supabase
    db push`), her dosyanın ne oluşturduğunu, `prompt_request_responses`
    kararını ve yukarıdaki doğrulama listesini Türkçe olarak belgeliyor.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 18 için ek):**
- **Güncelleme:** Bölüm 18'in 7 migration dosyası kullanıcı tarafından
  gerçek Supabase projesine (`supabase/README.md`'deki Seçenek A —
  Dashboard SQL Editor ile) başarıyla uygulandı; şema artık canlıda
  gerçekten var. (Bölüm 19'un RLS dosyası henüz uygulanmadı — aşağıya
  bakınız.)
- **Frontend hâlâ %100 mock veri üzerinde çalışıyor.** Şemanın var olması,
  uygulamanın onu kullandığı anlamına gelmiyor — `src/mocks/*` ve
  localStorage tabanlı provider'lar (Follow/Like/Save/Comment/
  LocalPrompts/Requests/ProfileOverrides/HiddenPrompts) değişmeden
  duruyor. Gerçek bağlanma Bölüm 21'in işi.
- Migration dosyaları yalnızca yerel bir Postgres 16 örneğinde test
  edildi; gerçek Supabase projesinin kendine özgü uzantıları/varsayılan
  ayarları (ör. `extensions` şemasının tam içeriği, varsayılan
  roller/grantlar) yerel taklitte birebir aynı olmayabilir — küçük bir
  uyumsuzluk ihtimaline karşı kullanıcı migration'ları Dashboard'da
  sırayla, hata çıkarsa durup paylaşarak uygulamalı (README bunu açıkça
  söylüyor).

- **RLS ve güvenlik politikaları (Bölüm 19):** Bölüm 18'de RLS'nin
  "oluşturulduğu anda açık, sıfır politika" bırakıldığı 17 tabloya gerçek
  erişim kuralları eklendi (`supabase/migrations/20260919130000_rls_
  policies.sql`, `supabase/README.md`'de tam liste ve gerekçeleriyle
  belgelendi):
  - **Herkese açık okuma, sahibine özel yazma:** `profiles`, `tags`,
    `prompt_requests`, `prompt_media`, `prompt_tags`,
    `prompt_request_tags`, `prompt_likes`, `follows` — CLAUDE.md §1'in
    "keşif platformu" doğasına uygun: giriş yapmamış bir ziyaretçi bile
    içeriği görebiliyor, yalnızca sahibi (author/user) değiştirebiliyor.
  - **`prompts`:** `status = 'published'` olanlar herkese açık, taslaklar
    (`status = 'draft'`) yalnızca yazarına görünür — `CreatePromptForm`'un
    henüz kullanmadığı ama şemada zaten var olan taslak durumu artık
    veritabanı seviyesinde de anlamlı.
  - **`prompt_saves`:** kasıtlı olarak tamamen özel (yalnızca `auth.uid()
    = user_id`) — CLAUDE.md'nin daha önce `/saved` sayfası için de
    belirttiği ilke ile aynı: kaydetme kişisel bir eylem, herkese açık
    değil.
  - **`prompt_comments`:** hedefi (prompt/istek) görülebilen herkes
    okuyabiliyor; yazma yalnızca kendi adına VE yalnızca görülebilen bir
    hedefe (bir taslağa gizlice yorum eklenmesi `WITH CHECK`'te
    engelleniyor).
  - **Mesajlaşma (`conversations`/`conversation_members`/`messages`):**
    yalnızca o konuşmanın üyeleri erişebiliyor. Üyelik kontrolü,
    `conversation_members`'ın kendi RLS politikasının kendi kendine sorgu
    içinde özyinelemeli şekilde tekrar uygulanması sorununu önlemek için
    yeni bir `SECURITY DEFINER` yardımcı fonksiyon
    (`is_conversation_member()`) üzerinden yapılıyor — Supabase'in resmi
    dokümantasyonunun bu tam senaryo için önerdiği standart desen.
  - **`notifications`:** yalnızca alıcısı görebiliyor/okundu
    işaretleyebiliyor; client tarafından ekleme/silme yok (gerçek
    bildirimler ileride sunucu tarafı `SECURITY DEFINER`
    trigger/fonksiyonlarla üretilecek, Bölüm 21+).
  - **`reports`, `blocks`:** yalnızca oluşturan kullanıcı kendi
    kayıtlarını görebiliyor; moderatör rolü/çapraz görünürlük ve durum
    değişiklikleri Bölüm 22'nin işi, şimdilik temel sahiplik politikaları
    yeterli.
  - **Kritik düzeltme — sayaç trigger'ları `SECURITY DEFINER` oldu:**
    Bölüm 18'in `like_count`/`follower_count`/`following_count`/
    `remix_count`/`response_count`/`unread_count`/`last_message_at`
    sayaçlarını güncelleyen 5 trigger fonksiyonu (`handle_prompt_like_
    change`, `handle_prompt_comment_change`, `handle_follow_change`,
    `handle_prompt_origin_change`, `handle_new_message`) BAŞKA
    kullanıcıların satırlarını güncelliyor (ör. birinin promptunu
    beğenmek O KİŞİNİN sayacını artırır). RLS açılınca, `SECURITY
    DEFINER` olmadan bu güncellemeler **hatasız ama sessizce
    başarısız olurdu** (UPDATE, RLS politikasını karşılamayan satırı
    basitçe hiç etkilemez) — beğeni/takip/yorum/remix/mesaj sayıları
    gerçekte artmadan kalırdı, hiçbir hata mesajı olmadan. Bu migration
    5 fonksiyonu da `SECURITY DEFINER` + sabit `search_path` ile yeniden
    tanımlayarak bu sorunu çözdü.
  - **Nasıl doğrulandı (canlı erişim yine engellendiği için):** Bölüm
    18'deki gibi süperkullanıcıyla test etmek RLS'i hiç kanıtlamaz
    (süperkullanıcı/tablo sahibi RLS'i zaten atlar) — bu yüzden yerel test
    veritabanına gerçek Supabase projesindeki gibi `anon`/`authenticated`
    adında, tabloların sahibi OLMAYAN iki rol eklendi, `auth.uid()`'yi
    taklit eden bir stub fonksiyon tanımlandı, ve üç ayrı test kullanıcısı
    arasında rol değiştirilerek (`SET ROLE` + oturum bazlı JWT claim
    simülasyonu) şunlar fiilen test edildi: `anon` yayındaki promptu
    görüp taslağı göremiyor ve beğeni eklerken RLS hatası alıyor; giriş
    yapmış bir kullanıcı başkasının promptunu beğenebiliyor ama
    güncelleyemiyor ve `user_id` sahtekârlığı `WITH CHECK` ile
    engelleniyor; **çapraz kullanıcı sayaç güncellemesi gerçekten
    çalışıyor** (Baran, Ayşe'nin promptunu beğenince Ayşe'nin
    `like_count`'u artıyor; takip edince her iki tarafın sayacı da
    artıyor; mesaj gönderilince diğer üyenin `unread_count`'u artıyor);
    `prompt_saves` başka kullanıcıya tamamen görünmez; mesajlaşma yalnızca
    üyelere açık (üye olmayan biri ne okuyabiliyor ne yazabiliyor);
    bildirimler/raporlar/engellemeler yalnızca sahibine görünür; profiller
    herkese açık okunuyor ama yalnızca sahibi güncelleyebiliyor. **Ayrıca
    bir negatif kontrol yapıldı:** `SECURITY DEFINER` düzeltmesi geçici
    olarak geri alınıp aynı beğeni senaryosu tekrar çalıştırıldı — bu kez
    `like_count` gerçekten hatasızca yanlış kaldı, düzeltme geri
    konulunca tekrar doğru çalıştı. Bu, "`SECURITY DEFINER` olmadan
    sessizce bozulurdu" iddiasının varsayım değil kanıtlanmış bir gerçek
    olduğunu gösteriyor. Test veritabanı işlem bitince silindi.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 19 için ek):**
- **RLS politikaları gerçek Supabase projesine henüz uygulanmadı** — yine
  ağ politikası nedeniyle; kullanıcı `supabase/README.md`'deki talimatla
  yalnızca `20260919130000_rls_policies.sql` dosyasını (Bölüm 18'in 7
  dosyası zaten uygulandığı için) SQL Editor'e ekleyip çalıştırmalı.
- **Frontend hâlâ RLS'e bağlı değil** — mock veri/localStorage
  provider'ları değişmeden duruyor; RLS'nin gerçekten devrede olduğu
  yalnızca gerçek Supabase sorgularıyla (Bölüm 21) fark edilir hale gelir.
- **Moderatör/admin rolü yok:** `reports`/`blocks` politikaları yalnızca
  "kendi kaydını gör/oluştur" düzeyinde — bir moderatörün tüm raporları
  görüp durumunu değiştirebilmesi için ayrı bir rol sistemi (ör. `profiles`
  üzerinde bir `role` kolonu + o role özel politikalar) gerekiyor, bu
  Bölüm 22'nin kapsamı.
- **Bildirim üretimi hâlâ yok:** `notifications` tablosuna client'tan
  insert politikası kasıtlı olarak eklenmedi (bir kullanıcının başka bir
  kullanıcı adına keyfi bildirim oluşturmasını önlemek için) — gerçek
  bildirimler ancak sunucu tarafı `SECURITY DEFINER` trigger'larla
  (ör. "biri seni takip etti" → `handle_follow_change`'e benzer bir
  fonksiyon `notifications` tablosuna da satır ekler) üretilebilir; bu
  henüz yazılmadı, ileride eklenebilir.
- **`prompts.status='draft'` şemada var ama frontend henüz taslak akışı
  sunmuyor** — `CreatePromptForm` her zaman `published` olarak
  gönderiyor (zaten Supabase'e hiç bağlı değil, bkz. Bölüm 21). RLS
  politikası taslakları doğru gizliyor, ama bunu tetikleyecek bir "Taslak
  olarak kaydet" arayüzü henüz yok.
- **Konuşma/üyelik ekleme politikaları ileriye dönük yazıldı ama frontend
  hiç kullanmıyor:** mesajlaşma zaten Bölüm 16'dan beri devre dışı
  (`mesaj gönderme henüz devre dışı`); bu migration yalnızca gerçek
  mesajlaşma Bölüm 21'de kurulduğunda hazır bir temel bıraktı, şu an
  hiçbir kod yolu bu politikaları egzersiz etmiyor.

- **Supabase Storage (Bölüm 20):** Uygulama bugün üç yerde görsel yükleme
  yapıyor ve üçü de görseli base64 data URL olarak localStorage'a gömüyor
  (`/profile/edit`'te avatar → `resizeImageToDataUrl`, `CreatePromptForm`'da
  `image` türü prompt görseli, `/requests/new`'de opsiyonel referans
  görseli → `resizeImageToDataUrlFit`) — bu, tek tarayıcıda çalışan ama
  başka cihaz/kullanıcıya hiç senkronize olmayan, localStorage boyut
  sınırına çarpma riski taşıyan bir geçici çözüm. Bölüm 20 bu üç kullanım
  için gerçek Supabase Storage bucket'larını tasarladı
  (`supabase/migrations/20260919140000_storage.sql`, `supabase/README.md`'de
  tam gerekçesiyle belgelendi):
  - **`avatars`** (2 MB sınır, jpeg/png/webp), **`prompt-media`** (10 MB
    sınır, +gif), **`request-references`** (5 MB sınır) — üçü de **herkese
    açık okuma** bucket'ı: CLAUDE.md §1'in keşif platformu doğasına uygun,
    bu görseller zaten herkese açık prompt/profil/istek sayfalarında
    gösteriliyor, gizlemenin bir anlamı yok.
  - **Yazma yalnızca kendi klasörüne:** her nesnenin yolu
    `{auth.uid()}/...` ile başlamak zorunda, `storage.foldername(name)`
    kontrolüyle zorlanıyor — Supabase'in resmi dokümantasyonunun önerdiği
    standart "klasör = kullanıcı" deseni (storage.objects RLS'i
    `public.prompts`/`public.profiles` gibi tablolara ucuz şekilde JOIN
    atamadığından, en pratik ve önerilen yol bu). Yol kuralı Bölüm 21 için
    belgelendi: `avatars/{user_id}/avatar.<ext>`,
    `prompt-media/{user_id}/{prompt_id}-{n}.<ext>`,
    `request-references/{user_id}/{request_id}.<ext>`.
  - **Nasıl doğrulandı:** Gerçek Supabase projelerinde zaten hazır gelen
    `storage` şemasının (`storage.buckets`, `storage.objects`,
    `storage.foldername()`) minimal ama sadık bir taklidi yerel test
    veritabanına eklendi (Bölüm 19'daki aynı `anon`/`authenticated` rol
    simülasyonu üzerine), ve gerçekten test edildi: `anon` (giriş
    yapmamış) her üç bucket'tan da nesne listeleyebiliyor; Ayşe kendi
    klasörüne avatar yükleyebiliyor ama Baran'ın klasörüne yükleyemiyor
    (RLS hatası); yüklenen avatar `anon` dahil herkese görünür; Baran,
    Ayşe'nin avatarını silmeye çalışınca sessizce 0 satır etkileniyor
    (RLS satırı görünmez kılıyor), Ayşe kendi avatarını gerçekten
    silebiliyor; aynı desen `prompt-media`/`request-references` için de
    doğrulandı, ve `anon`'un hiçbir bucket'a hiçbir şey yükleyemediği
    (yalnızca `authenticated` rolüne INSERT politikası tanınmış olduğu
    için) ayrıca kanıtlandı. Test veritabanı işlem bitince silindi.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 20 için ek):**
- **Storage bucket'ları gerçek Supabase projesine henüz uygulanmadı** —
  yine ağ politikası nedeniyle; kullanıcı `supabase/README.md`'deki
  talimatla yalnızca `20260919140000_storage.sql` dosyasını (önceki 8
  dosya zaten uygulandığı için) SQL Editor'e ekleyip çalıştırmalı.
- **Frontend hâlâ hiçbir dosyayı Supabase Storage'a yüklemiyor** —
  `resizeImageToDataUrl`/`resizeImageToDataUrlFit` ve base64 data URL'ler
  değişmeden duruyor; gerçek yükleme (Storage'a `upload()` çağrısı +
  dönen public URL'in `avatar_url`/`prompt_media.url`/
  `reference_image_url` gibi gerçek şema kolonlarına yazılması) Bölüm
  21'in işi.
  - **Bucket'lardaki `file_size_limit` değerleri seçilirken frontend'in
  mevcut sıkıştırma hedefleriyle (avatar 160×160 küçük JPEG, prompt/istek
  görselleri `resizeImageToDataUrlFit`'in hedeflediği boyut) kabaca
  hizalandı, ama gerçek kullanıcı dosyalarıyla (büyük orijinal fotoğraflar)
  test edilmedi — gerçek yükleme akışı kurulduğunda (Bölüm 21) sınırların
  pratikte yeterli olup olmadığı görülecek.
- **Silme/değiştirme akışı frontend'de henüz yok:** politikalar bir
  kullanıcının kendi dosyasını silebilmesine izin veriyor (avatar için
  ayrıca güncelleyebilmesine de), ama `/profile/edit` gibi hiçbir ekran
  şu an gerçek bir silme/değiştirme çağrısı yapmıyor (henüz Storage'a hiç
  bağlı değil) — bu da Bölüm 21'in kapsamında.

- **Frontend'in gerçek Supabase'e bağlanması — Faz 1 (Bölüm 21, devam
  ediyor):** Bu, proje tarihindeki en büyük mimari geçiş — mock veri/
  localStorage'dan gerçek, çok kullanıcılı bir backend'e geçiş. Tek
  seferde her varlığı (prompt, istek, beğeni, takip, yorum, mesaj, profil)
  bağlamaya çalışmak yerine, en uzun süredir belgelenmiş eksik olan ve en
  net kapsamlı dilime bölünen kısımdan başlandı: **gerçek prompt oluşturma
  ve görüntüleme**. Kapsam kararı ve gerekçesi aşağıda; kalan varlıklar
  sonraki fazlara bırakıldı (bkz. bilinen sınırlamalar).
  - **Yeni `src/lib/supabase/` veri erişim katmanı** (CLAUDE.md §2'nin
    "mock veri ↔ gerçek servisler katman arayüzleriyle ayrılır" kuralının
    ilk gerçek uygulaması):
    - `mappers.ts` — `profiles` satırını `UserProfile`'a çeviren
      `mapProfileRow`.
    - `profiles.ts` — `fetchOwnProfile(userId)`: giriş yapmış kullanıcının
      gerçek `profiles` satırını okur (Bölüm 18'in `handle_new_user`
      trigger'ıyla kayıt anında otomatik oluşmuştu).
    - `prompts.ts` — `fetchRecentPublishedPrompts()` (feed/keşfet için son
      yayınlanan promptlar, yazar+medya+etiket join'iyle),
      `fetchPromptById(id)` (doğrudan link için tekil sorgu),
      `createRealPrompt(input, authorId, authorProfile)` (gerçek, kalıcı
      yayın — aşağıda ayrıntılı).
  - **Yeni `RealPromptsProvider`/`useRealPrompts()`**
    (`features/prompts/real-prompts-provider.tsx`) — `LocalPromptsProvider`
    ile birebir aynı arayüz şekli (`realPrompts`, `getCached`, `addPrompt`)
    ama localStorage yerine gerçek Supabase sorgularıyla çalışıyor: mount
    olduğunda son promptları çekiyor, `addPrompt` gerçek bir INSERT yapıp
    sonucu listenin başına ekliyor (yeni yayınlanan prompt, sayfa
    yenilenmeden anında feed'de görünüyor). `(app)/layout.tsx`'e
    `LocalPromptsProvider`'ın içine eklendi.
  - **`CreatePromptForm` — düz "Prompt Oluştur" ve "Kopyasını Oluştur"
    artık GERÇEKTEN yayınlıyor (giriş yapılmışsa):** Bu, Bölüm 9/10'dan
    beri "Supabase entegrasyonu kurulduğunda aktif olacak" diye
    belgelenmiş en uzun süredir bekleyen TODO'nun karşılığı. Giriş
    yapılmamışsa form hâlâ önizleme yapılabiliyor ama "Paylaş"a basınca
    artık "Supabase yok" gibi yanlış/bayat bir mesaj değil, dürüst ve
    normal bir platform kısıtı gösteriliyor: "gerçekten yayınlamak için
    giriş yapmalısın" + `/login`/`/signup` linkleri. Giriş yapılmışsa
    gerçek profil (`useOwnProfile()`, yeni `features/auth/use-own-
    profile.ts` hook'u) yazar olarak kullanılıyor, görsel yüklendiyse
    gerçekten `prompt-media` Storage bucket'ına (Bölüm 20) yükleniyor
    (yüklenmediyse önizlemedeki otomatik placeholder görsel URL'i
    doğrudan `prompt_media` satırına yazılıyor — gereksiz bir Storage
    round-trip'i olmadan), etiketler `prompt_tags`'e ekleniyor, ve
    başarıyla yayınlanınca gerçek promptun kendi detay sayfasına
    yönlendiriyor. Görsel yükleme/etiketleme başarısız olursa yarım
    kalmış bir prompt bırakmamak için oluşturulan prompt satırı geri
    siliniyor ve kullanıcıya hata gösteriliyor.
  - **Remix hâlâ kasıtlı olarak önizleme-yalnızca — bu bir eksiklik değil,
    mimari bir kısıt:** Gerçek bir remixin `source_prompt_id`'sinin
    `prompts` tablosunda GERÇEK bir satıra işaret etmesi gerekiyor (FK
    kısıtı, Bölüm 18). Şu an remixlenebilen HER içerik mock veya yerel
    (localStorage) veri — hiçbirinin veritabanında gerçek bir satırı yok.
    Bu yüzden remix, kaynağı gerçek olmadığı sürece gerçek yayın
    yapamıyor (yalnızca gerçek bir promptun remixi ileride mümkün
    olacak). Form bunu artık doğru şekilde açıklıyor (eski "Supabase
    entegrasyonu kurulmadı" mesajı yerine "kaynağın gerçek bir veritabanı
    kaydı olması gerekiyor" gibi doğru bir gerekçe). "Kopyasını Oluştur"
    ise kaynağa veritabanında hiç referans vermediğinden (yalnızca alanları
    kopyalıyor) bu kısıttan muaf ve düz oluşturmayla aynı şekilde gerçek
    yayınlıyor.
  - **`?answerRequest=` (isteğe yanıt verme) kasıtlı olarak DEĞİŞTİRİLMEDİ**
    — hâlâ `useLocalPrompts()`/localStorage üzerinden yayınlıyor. Gerçek
    `prompt_requests` bağlanması ayrı, daha sonraki bir faz (istekler için
    de aynı boyutta bir iş: gerçek istek oluşturma, yanıtlama, seçim vb.).
  - **Statik export + gerçek id çelişkisi, yerel promptlarla aynı çözümle
    genişletildi:** `promptHref()` artık `local-` önekine değil, "bu id
    build-zamanı mock listesinde mi?" sorusuna bakıyor — hem yerel hem
    gerçek Supabase id'leri (ikisi de mock listesinde yok) aynı şekilde
    `/prompts/local?id=…`'e yönleniyor. `LocalPromptView`
    (`local-prompt-view.tsx`) artık üç kaynağı sırayla deniyor: yerel
    (localStorage) → önbellekteki gerçek promptlar → (bulunamazsa) canlı
    bir Supabase sorgusu. Böylece doğrudan bir gerçek prompt linkine
    gidildiğinde (feed'in ilk yüklediği son-N promptun dışında kalmış
    olsa bile) hâlâ doğru şekilde bulunup gösteriliyor.
  - **Feed/Keşfet entegrasyonu:** `FeedTabs` ve `DiscoverFeed` artık
    `useRealPrompts()`'u da `useLocalPrompts()`/`useRequests()` ile aynı
    şekilde mock listeye client-side katıp tarihe göre yeniden sıralıyor
    — gerçek bir prompt, tıpkı yerel bir prompt gibi, Ana Sayfa/Keşfet'te
    diğer her şeyle karışık görünüyor.
  - **Dayanıklılık (gerçekten test edildi, varsayılmadı):** Bu sandbox'ın
    ağ politikası `*.supabase.co`'ya erişimi hâlâ engellediğinden,
    `npm run dev` ile gerçek tarayıcıda (Playwright) Ana Sayfa/Keşfet/
    prompt detay sayfaları ziyaret edildi — Supabase'e yapılan istekler
    fiilen `ERR_TUNNEL_CONNECTION_FAILED` ile başarısız oldu (konsolda
    hata logland, beklenen ve doğru davranış) ama sayfa çökmedi: `feed
    hâlâ mock içerikle doluydu (feed'de 62 prompt linki), hiçbir
    `pageerror` (yakalanmamış JS istisnası) oluşmadı. Bu,
    `fetchRecentPublishedPrompts`'un hata durumunda boş dizi döndürüp
    sessizce yutmasının gerçekten işe yaradığını kanıtlıyor — gerçek bir
    ziyaretçinin ağ sorunu yaşadığı bir anda da site çökmeyecek.
  - **Gerçek yayın akışı uçtan uca doğrulandı (ağ katmanında taklit
    edilmiş Supabase yanıtlarıyla, Bölüm 17'deki aynı yöntemle):**
    tarayıcı localStorage'ına gerçek supabase-js oturum formatında bir
    session enjekte edilip (`sb-<proje-ref>-auth-token`), `/rest/v1/
    prompts`, `/rest/v1/prompt_media`, `/rest/v1/prompt_tags`, `/rest/v1/
    profiles` uç noktaları taklit edilerek: giriş yapılmış kullanıcı için
    form metninin doğru değiştiği ("gerçekten, kalıcı olarak yayınlanır"),
    "Paylaş"a basınca gerçek bir INSERT isteği tetiklendiği, dönen gerçek
    UUID ile `/prompts/local?id=<uuid>`'e yönlendirildiği, ve o sayfanın
    (aynı id için taklit edilmiş bir GET ile) promptu doğru şekilde
    (başlık, açıklama, prompt metni, gerçek yazar adı, içerik türü rozeti)
    render ettiği gözlemlendi — sıfır JS hatasıyla. Görsel yüklenemedi
    çünkü test URL'i (`example.com`) sandbox tarafından da engelleniyor —
    bu, uygulamanın değil test ortamının bir kısıtı.
  - `npx tsc --noEmit`, `npm run lint` ve tam `npm run build` (90 statik
    sayfa) hatasız geçti.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 21 Faz 1 için ek):**
- **Bu yalnızca Faz 1.** Beğeni, kaydetme, yorum, takip, prompt istekleri
  (oluşturma/yanıtlama/seçim), mesajlaşma ve profil sayfaları (`/profile/
  [username]`, `/profile/edit`) hâlâ tamamen mock veri + localStorage
  üzerinde çalışıyor — hiçbiri bu fazda dokunulmadı. Her biri kendi
  boyutunda ayrı bir faz gerektiriyor.
- **Gerçek bir kullanıcının kendi profil sayfası yok:** gerçek hesaplar
  otomatik üretilen bir kullanıcı adı alıyor (Bölüm 18), ama `/profile/
  [username]` rotaları yalnızca mock kullanıcı adları için build-zamanında
  üretiliyor. Bu yüzden gerçek bir promptun yazar linki şu an **404
  verir** — bu bilinen, kasıtlı olarak bu fazda çözülmemiş bir sınır
  (yerel/gerçek promptlarda kullanılan `/prompts/local?id=` desenine
  benzer bir `/profile/real?...` çözümü gerekebilir, ama bu, "gerçek
  kullanıcı profili" fazının kendi başına bir kararı/işi olmalı, prompt
  oluşturma fazına sıkıştırılmadı).
- **Gerçek bir promptun beğeni/kaydetme/yorum durumu hâlâ yalnızca
  localStorage'dan geliyor** (`LikeProvider`/`SaveProvider`/
  `CommentProvider` — mock ve yerel promptlarla tamamen aynı davranış).
  `like_count`/`comment_count`/`remix_count` veritabanı sütunları gerçek
  ve doğru okunuyor (yeni bir promptta 0), ama bu sayıları GERÇEKTEN
  artıran (başka bir kullanıcının beğenmesi/yorum yapması) hiçbir yol
  henüz yok — bu, "beğeni/yorum/takip'i gerçek yap" fazının işi.
  Bölüm 19'un `SECURITY DEFINER` sayaç trigger'ları zaten hazır ve test
  edilmiş durumda; yalnızca frontend'in gerçekten `prompt_likes`/
  `prompt_comments`/`follows` tablolarına yazması eksik.
  - **Taslak (draft) durumu hâlâ kullanılmıyor:** `createRealPrompt` her
  zaman `status: 'published'` gönderiyor — "Taslak olarak kaydet" arayüzü
  yok (Bölüm 19'da da not edilmişti). RLS bunu doğru gizleyecek şekilde
  hazır, tetikleyecek arayüz yok.
- **Görsel yükleme boyut/format doğrulaması istemci tarafında minimal:**
  `resizeImageToBlob` her zaman 1600px'e kadar JPEG'e çeviriyor
  (bucket'ın 10 MB sınırının çok altında kalacak şekilde), ama gerçek
  kullanıcı dosyalarıyla (çok büyük/egzotik format girişleri) uçtan uca
  gerçek bir Supabase projesine karşı hiç denenmedi (yalnızca taklit
  edilmiş yanıtlarla, bkz. yukarıdaki not) — sandbox'ın ağ kısıtı burada
  da geçerli.
- **`prompt_tags` eklenmesi "yumuşak" başarısız oluyor:** etiket ekleme
  hata verirse prompt yine de yayınlanmış sayılıyor (yalnızca etiketsiz) —
  bilinçli bir seçim (yayını kaybetmek, etiketi kaybetmekten daha kötü),
  ama bu sessiz bir başarısızlık, kullanıcıya "etiketler eklenemedi" gibi
  ayrı bir uyarı gösterilmiyor.
- ~~`useOwnProfile()` her sayfa/bileşen ağacında kendi ayrı sorgusunu
  tetikliyor~~ — Faz 2'de düzeltildi, bkz. aşağıdaki `OwnProfileProvider`
  notu.

- **Frontend'in gerçek Supabase'e bağlanması — Faz 2 (Bölüm 21, devam
  ediyor): gerçek kullanıcı profil sayfaları.** Faz 1'in gerçek
  promptlarının yazar linki artık 404 vermiyor — gerçek hesapların artık
  gerçek bir profil sayfası, gerçek düzenleme ve uygulamanın her yerinde
  doğru "Profil" navigasyonu var.
  - **`useOwnProfile()` artık bir Context (`OwnProfileProvider`,
    `features/auth/own-profile-provider.tsx`), plain bir hook değil:**
    Faz 1'de yalnızca `CreatePromptForm` kullanıyordu; Faz 2'de header,
    sidebar, mobil nav ve profil düzenleme formu da aynı veriye ihtiyaç
    duyunca, her biri kendi ayrı sorgusunu tetiklemek yerine tek bir
    paylaşılan fetch'e geçildi (Follow/Like/Save provider'larıyla aynı
    mimari desende). `(app)/layout.tsx`'e `AppProviders`'ın en dışına
    eklendi.
  - **Yeni `src/lib/supabase/profiles.ts` fonksiyonları:**
    `fetchProfileByUsername(username)` (başka birinin gerçek profilini
    görüntülemek için — herkese açık, Bölüm 19 RLS'i zaten böyle),
    `updateOwnProfile(userId, patch)` (gerçek, kalıcı `profiles`
    güncellemesi), `uploadAvatar(userId, file)` (gerçekten `avatars`
    Storage bucket'ına yükleyip genel URL'i döndürüyor — Bölüm 20).
  - **Yeni `src/lib/supabase/prompts.ts` → `fetchPromptsByAuthor(authorId)`:**
    bir profilin galerisi için — Bölüm 19'un RLS'i zaten doğru işi
    yapıyor: ziyaretçi yalnızca yayınlanmış promptları görür, sahibi kendi
    profilinde taslaklarını da görür, ekstra bir filtre yazmaya gerek yok.
  - **Yeni `profileHref(user)`** (`lib/utils.ts`, `promptHref`/
    `requestHref` ile birebir aynı desen): kullanıcı adı build-zamanı mock
    listesinde mi diye bakıyor; değilse `/profile/real?username=…`'e
    yönlendiriyor. Uygulamadaki TÜM profil linkleri (kart footer'ları,
    istek kartları, yaratıcı satırları, arama sonuçları, paylaş
    butonları) bu tek yardımcıyı kullanacak şekilde güncellendi — hiçbiri
    artık `/profile/${username}`'i elle kurmuyor.
  - **Yeni `RealProfileView`/`/profile/real`** (`local-prompt-view.tsx`
    ile birebir aynı desen): `?username=` sorgu param'ından gerçek profili
    ve `fetchPromptsByAuthor` ile gerçek promptlarını çekip mevcut
    `ProfileView` bileşenine (aynı bileşen, mock/gerçek/yerel promptlar
    için zaten paylaşılıyordu) besliyor. `isOwnProfile`, gösterilen
    profilin id'si oturum açmış kullanıcının id'sine eşit mi diye bakarak
    hesaplanıyor. Bulunamazsa dürüst bir "Profil bulunamadı" ekranı
    gösteriyor.
  - **`ProfileActions` refaktörü:** `OwnProfileActions`/
    `OtherProfileActions` artık ayrı `username`/`userId` prop'ları yerine
    tam `UserProfile` nesnesini alıyor — paylaş butonlarının URL'i artık
    `profileHref(user)` ile doğru hesaplanıyor (gerçek bir profildeyken
    `/profile/${username}` paylaşmak 404 üretirdi).
  - **Header/Sidebar/MobileNav artık gerçek kimliği yansıtıyor:** Header'daki
    avatar artık giriş yapılmışsa gerçek profile (`profileHref`), değilse
    mock "Sen" persona'sına (`/profile/me`) gidiyor — bu, kullanıcının
    Bölüm 17 sonrasında sorduğu "Profil sekmesi hep mock kalıyor, bu bir
    hata mı?" sorusunun gerçek cevabı: artık hata değil, çünkü artık
    gerçekten çözülmüş durumda. Sidebar/mobil nav'daki "Profil" öğesi de
    yeni `useProfileNavHref()` hook'uyla aynı mantığı kullanıyor. **Bilinen
    küçük kozmetik sınırlama:** "Profil" öğesinin aktif/vurgulu görünmesi
    hâlâ yalnızca `pathname`'e bakıyor (`useSearchParams` gerektirmeden);
    bu yüzden kendi gerçek profilinizi (`/profile/real?username=…`)
    görüntülerken "Profil" sekmesi vurgulanmıyor (link doğru yere gitmesine
    rağmen). Küçük, kasıtlı olarak çözülmemiş bir kusur.
  - **`/profile/edit` artık iki gerçek mod:** giriş yapılmışsa gerçek
    `profiles` satırını günceller (yeni fotoğraf seçildiyse gerçekten
    `avatars` bucket'ına yükler); giriş yapılmamışsa Bölüm 12/13'ün
    orijinal davranışı (mock "me" + `ProfileOverridesProvider`/
    localStorage) hiç değişmeden duruyor. Form alanları gerçek profil
    yüklenene kadar bir `useEffect` ile senkronize ediliyor (async veriden
    kontrollü input'ları doldurma problemi — CreatePromptForm'un remix
    prefill'inde olduğu gibi lazy initializer kullanılamıyor çünkü veri
    build-zamanında değil, ağdan async geliyor). Kullanıcı adı her iki
    modda da düzenlenemez (gerçek modda bile — Supabase'in kendi bir
    yeniden adlandırma akışı yok, bu ayrı bir sınırlama).
  - **Kritik dayanıklılık düzeltmesi (test sırasında bulundu):**
    `fetchOwnProfile`/`fetchProfileByUsername`/`fetchPromptById`/
    `fetchPromptsByAuthor`/`fetchRecentPublishedPrompts` — `.single()`/
    `.maybeSingle()` kullanan sorgular, gerçek bir ağ hatasında (yapılı bir
    Supabase hata nesnesiyle değil) **söz vermeyi (promise) hiç
    çözmeyecek şekilde askıda kalabiliyordu** (Faz 1'in `try/catch`'siz
    kodu bunu kapsamıyordu — Faz 1'in kendi testleri bu spesifik senaryoyu
    hiç tetiklemediği için fark edilmemişti). Tüm bu fonksiyonlar artık
    `try/catch` ile sarılı; gerçek bir ağ sorununda birkaç saniye içinde
    (bu sandbox'ta ~6-10 saniye, engelleyen proxy'nin zaman aşımına bağlı)
    zarifçe boş/`null` sonuca düşüyorlar, sonsuza dek "Yükleniyor…"da
    takılı kalmıyorlar.
  - **Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ Supabase'e
    erişimi engellediğinden, gerçek tarayıcıda (Playwright) hem "tamamen
    erişilemez" senaryosu (yukarıdaki dayanıklılık düzeltmesi tam olarak
    bunu kanıtlıyor — birkaç saniye sonra çökmeden "Profil bulunamadı"
    gösteriyor) hem de ağ seviyesinde taklit edilmiş yanıtlarla uçtan uca
    tam akış test edildi: kendi gerçek profilini görüntüleme (doğru ad/
    bio/rozet/istatistik/gerçek prompt galeri kartı, "Profili Düzenle"
    butonu), header avatarının ve sidebar "Profil" linkinin doğru gerçek
    URL'e gitmesi, `/profile/edit`'in gerçek veriyle dolu gelmesi, gerçek
    bir güncellemenin (taklit edilmiş PATCH) başarıyla kaydedilip doğru
    sayfaya yönlendirmesi ve güncel adı göstermesi, ve son olarak
    BAŞKASININ gerçek profilinin doğru şekilde "own=false" (Takip Et
    butonu, düzenleme yok) render edilmesi — hepsi sıfır JS hatasıyla.
  - `npx tsc --noEmit`, `npm run lint` ve tam `npm run build` (91 statik
    sayfa) hatasız geçti.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 21 Faz 2 için ek):**
- **Gerçek kullanıcılar arasında takip/beğeni/kaydetme/yorum hâlâ
  localStorage'da** — bir profildeki "Takip Et" butonu (gerçek profil
  dahil) hâlâ yalnızca bu tarayıcıda yaşıyor. Bu, Faz 1'de de belirtilen
  bilinen bir sınırlama, Faz 2 bunu değiştirmedi.
- **Gerçek kullanıcıların "Kaydedilenler"/"Beğeniler" sekmeleri, mock
  kullanıcılarla birebir aynı localStorage verisini gösteriyor** — bu
  aslında doğru/beklenen davranış (beğeni/kaydetme zaten tarayıcı bazlı,
  kimin profili görüntülendiğinden bağımsız), ama şunu açıkça belirtmek
  gerekir: bu sekmeler "bu gerçek hesabın gerçekten neyi beğendiği"ni
  DEĞİL, "bu tarayıcının neyi beğendiğini düşündüğü"nü gösteriyor.
- **Gerçek kullanıcı adı hâlâ değiştirilemiyor** — ne mock modda ne gerçek
  modda. Gerçek modda bunun nedeni farklı: statik export kısıtı değil,
  Supabase'in kendi username-rename akışının henüz kurulmamış olması
  (ayrı, küçük bir iş — `profiles.username` üzerinde bir UPDATE + yeni
  benzersizlik kontrolü yeterli olurdu, ama bu fazda kapsam dışı
  bırakıldı).
- **Gerçek bir hesabın "Mesaj Gönder" butonu yok:** `OtherProfileActions`
  hâlâ yalnızca `mocks/conversations.ts`'teki statik konuşmalara dayanıyor
  — gerçek kullanıcılar arası mesajlaşma tamamen ayrı, büyük bir faz
  (Bölüm 16'dan beri devre dışı).
- **Rozetler (`ProfileBadges`) gerçek promptlarla da doğru çalışıyor**
  (ekran görüntüsünde "İlk promptunu yayımladı" gerçek veriyle tetiklendi)
  ama bu kasıtlı bir çalışma değildi, `ProfileView`'ın zaten
  `authorPrompts.length`'e bakan var olan mantığının doğal bir sonucu —
  yine de doğrulandığı için not edilmeye değer.
- **"Profil" nav öğesinin aktif vurgusu** yukarıda belirtildiği gibi
  gerçek kendi profilde çalışmıyor (yalnızca linkin hedefi doğru,
  vurgulama değil) — kozmetik, kasıtlı olarak bu fazda çözülmedi.

- **Frontend'in gerçek Supabase'e bağlanması — Faz 3 (Bölüm 21, devam
  ediyor): gerçek beğeni, kaydetme, takip.** Bölüm 19'un zaten yazılmış ve
  test edilmiş RLS politikaları + `SECURITY DEFINER` sayaç trigger'ları
  ilk kez gerçekten kullanılmaya başlandı — iki gerçek hesap artık
  birbirini gerçekten takip edebiliyor, gerçek bir prompt gerçekten
  beğenilip kaydedilebiliyor.
  - **Mimari karar — aynı id gerçek mi sorusu, `isUuid()` ile:** Faz 1/2
    "bu id mock listesinde mi" diye sorarken, Faz 3 üç kaynağı (mock/yerel/
    gerçek) kesin olarak ayırması gerektiğinden (`rr*` gibi mock yanıt
    id'leri "mock listesinde değil" testini yanlışlıkla geçerdi) yeni,
    daha kesin bir `isUuid(id)` yardımcısı eklendi (`lib/utils.ts`) —
    Supabase'in `gen_random_uuid()` ile ürettiği HER id gerçek bir UUID
    formatında, mock/yerel/yanıt id'lerinin hiçbiri asla değil. Hem
    promptlar (`prompt_likes`/`prompt_saves`) hem profiller (`follows`)
    için aynı fonksiyon kullanılıyor.
  - **Yeni `src/lib/supabase/{follows,likes,saves}.ts`:** her biri aynı
    üçlü — `fetchIsX` (gerçek durumu okur), `xTarget`/`unxTarget` (gerçek
    INSERT/DELETE). Hepsi Bölüm 19'un RLS'ine güveniyor (kendi adına
    yazma, `WITH CHECK` sahteciliği engelliyor).
  - **Yeni `useFollowState`/`useLikeState`/`useSaveState` hook'ları**
    (`features/profile/use-follow-state.ts`,
    `features/prompts/use-{like,save}-state.ts`): hedef gerçekse (`isUuid`)
    ve giriş yapılmışsa gerçek Supabase durumunu okuyup optimistik
    güncelleyerek yazıyor; değilse (mock/yerel hedef VEYA giriş yapılmamış
    ziyaretçi) mevcut `FollowProvider`/`LikeProvider`/`SaveProvider`
    localStorage davranışını **hiç değiştirmeden** kullanıyor — Faz 1'in
    remix'te kurduğu "gerçek olmayan hedefe gerçek yazım yapılamaz"
    ilkesinin birebir devamı. Giriş yapılmamış bir ziyaretçi gerçek bir
    hedefte etkileşime girmeye çalışırsa (`canFollow`/`canLike`/`canSave`
    false), buton yerine `/login`'e giden bir link gösteriliyor —
    sessizce yutulan bir tıklama yerine.
  - **`FollowButton` ikiye ayrıldı:** `FollowButtonView` (saf, state'i
    prop olarak alan sunum bileşeni) ve `FollowButton` (kendi
    `useFollowState` çağrısını yapan bağımsız sürüm, `CreatorRow`/Keşfet
    gibi tek başına kullanımlar için). `ProfileHeader` artık
    `useFollowState(user)`'ı YALNIZCA BİR KEZ çağırıp hem takipçi
    sayısını hem `OtherProfileActions`'a geçirdiği `FollowButtonView`'ı
    aynı state'ten besliyor — iki ayrı hook örneği kullanılsaydı (biri
    sayı için, biri buton için) gerçek bir hedefte her biri kendi yerel
    optimistik state'ini tutacağından, butona tıklayınca yanındaki sayı
    hemen güncellenmezdi (sayfa yenilenene kadar). `LikeButton`/
    `SaveButton` bu sorunu yaşamıyor çünkü zaten tek bir yerde
    (`PromptCardFooter`/detay sayfası) render ediliyorlar.
  - **`/saved` ve profildeki "Kaydedilenler"/"Beğeniler" sekmeleri artık
    gerçek veriyi de gösteriyor:** yeni `fetchSavedPrompts(userId)`/
    `fetchLikedPrompts(userId)` (`lib/supabase/prompts.ts`) `prompt_saves`/
    `prompt_likes` üzerinden `prompts` tablosuna PostgREST embed sorgusu
    yapıp gerçek promptları döndürüyor; sonuç mock/yerel listeyle
    birleştiriliyor. Bu olmadan Faz 3'ün "gerçek kaydetme" özelliği
    yarım kalırdı — kullanıcı bir şeyi gerçekten kaydedip hiçbir yerde
    göremezdi.
  - **Nasıl doğrulandı (ağ seviyesinde taklit edilmiş yanıtlarla, Bölüm
    17'deki aynı yöntemle):** başkasının gerçek profilinde "Takip Et"e
    basınca gerçek bir INSERT tetiklendiği VE aynı anda görünen takipçi
    sayısının (ayrı bir hook örneği değil, aynı state) doğru arttığı;
    gerçek bir promptta beğenme/kaydetmenin gerçek INSERT'ler tetiklediği;
    `/saved`'in gerçekten kaydedilen promptu gösterdiği — hepsi sıfır JS
    hatasıyla doğrulandı.
  - `npx tsc --noEmit`, `npm run lint` ve tam `npm run build` hatasız geçti.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 21 Faz 3 için ek):**
- **Yorum ekleme hâlâ gerçek değil** — `CommentProvider`/localStorage
  hem mock hem gerçek promptlar için aynı şekilde çalışmaya devam ediyor.
  Yapısal olarak likes/saves ile aynı desenle (`prompt_comments` +
  `isUuid` kontrolü) gerçek yapılabilir, ama yorum listesi çekme/birleştirme
  mantığı (var olan `CommentSection`'ın mock+yerel karışımına üçüncü bir
  kaynak eklemesi) ayrı, biraz daha büyük bir iş olduğundan bu faza
  sıkıştırılmadı.
- **N+1 sorgu deseni:** her `LikeButton`/`SaveButton`/`FollowButton`
  örneği (gerçek bir hedef için) kendi `fetchIsLiked`/`fetchIsSaved`/
  `fetchIsFollowing` sorgusunu tetikliyor. Şu an gerçek içerik hacmi çok
  küçük olduğundan (Faz 1 daha yeni başladı) bu pratik bir sorun değil,
  ama gerçek içerik çoğaldıkça bir feed'in tamamı için toplu bir
  `.in(...)` sorgusuna geçmek gerekebilir.
- **Takip/beğeni/kaydetme bildirimleri hâlâ yok:** gerçek bir takip/
  beğeni/kaydetme, Bölüm 19'un `notifications` tablosuna client'tan
  insert izni olmadığından (bilinçli güvenlik kararı, bkz. Bölüm 19)
  hiçbir bildirim üretmiyor — bu, gerçek bildirim üretimi için ayrı bir
  faz gerektiriyor (sunucu tarafı `SECURITY DEFINER` trigger/fonksiyon).
- **Kendi kendini takip etme kontrolü çift katmanlı ama ikinci katman
  hiç tetiklenmiyor:** `FollowButton`/`useFollowState` teknik olarak
  kendi profilinde de çağrılabilir ama `ProfileHeader` zaten `isOwnProfile`
  olduğunda `OwnProfileActions`'ı (takip butonu içermeyen) render ediyor
  — bu yüzden pratikte kendi kendini takip etme arayüzden hiç mümkün
  değil; veritabanındaki `follows_no_self_follow` CHECK kısıtı (Bölüm 18)
  son bir güvenlik ağı olarak duruyor.

- **Frontend'in gerçek Supabase'e bağlanması — Faz 4 (Bölüm 21, devam
  ediyor): gerçek yorum ekleme.** Gerçek bir promptta yorum ekleme artık
  Faz 3'ün beğeni/kaydetme/takip'iyle aynı ilkeyle gerçek: hedef gerçekse
  (`isUuid`) Supabase'e yazılıyor, değilse (mock/yerel prompt VEYA bir
  istek — `prompt_requests` henüz gerçek değil) mevcut `CommentProvider`/
  localStorage davranışı hiç değiştirilmeden kullanılıyor.
  - **Okuma ile yazma farklı kurallara tabi — Faz 3'ten kasıtlı bir
    sapma:** Faz 3'te beğeni/kaydetme/takip için "gerçek hedef + giriş
    yapılmış" ikisi birden gerekliydi (okuma DA yazma DA aynı koşula
    bağlıydı). Yorumlarda durum farklı: Bölüm 19'un RLS'i yorumları
    HERKESE (giriş yapmamış ziyaretçi dahil) açık okunur yapıyor — bir
    promptun yorumlarını görmek için hesap gerekmiyor, tıpkı promptun
    kendisini görmek gibi. Bu yüzden `CommentSection` gerçek bir prompt
    için yorumları HER ZAMAN Supabase'den çekiyor (giriş durumundan
    bağımsız); yalnızca YAZMA (yorum kutusu) giriş gerektiriyor — giriş
    yapılmamışsa kutunun yerine `/login`'e giden bir mesaj gösteriliyor.
  - **Yeni `src/lib/supabase/comments.ts`:** `fetchCommentsForPrompt(id)`
    (herkese açık okuma) ve `postCommentOnPrompt(promptId, authorId, body,
    parentId)` (gerçek INSERT — Bölüm 19'un `handle_prompt_comment_change`
    trigger'ı `prompts.comment_count`'u otomatik güncelliyor, bu da Faz
    1'den beri zaten doğru okunuyordu, sadece artık gerçekten artıyor).
  - **`CommentSection` üç kaynağı birleştiriyor:** gerçek hedefte yalnızca
    Supabase'den gelenler; mock/yerel hedefte eskisi gibi mock yorumlar +
    `CommentProvider`'ın localStorage yorumları. Yeni bir yorum
    gönderildiğinde sonucun döndürdüğü gerçek satır yerel state'e hemen
    ekleniyor — sayfa yenilenmeden görünüyor, `CommentSection`'ın kendi
    "Yorumlar (N)" başlığı da anında doğru sayıyor.
  - **Yanıt (reply) verme arayüzü bu fazda da eklenmedi** — mevcut
    sınırlama (Bölüm 14'ten beri) korundu; hem şema (`prompt_comments.
    parent_id`) hem `postCommentOnPrompt`'un imzası ileride reply
    desteklemeye hazır, yalnızca UI'da bir "yanıtla" düğmesi eksik.
  - **Nasıl doğrulandı (ağ seviyesinde taklit edilmiş yanıtlarla):** giriş
    yapmamış bir ziyaretçinin gerçek bir promptun mevcut yorumunu
    görebildiği ama yorum kutusu yerine giriş linkini gördüğü; giriş
    yapmış bir kullanıcının yorum kutusunu görüp gönderdiğinde gerçek bir
    INSERT'in tetiklendiği, yeni yorumun sayfa yenilenmeden anında
    göründüğü ve "Yorumlar (N)" başlığının doğru arttığı; ayrıca mock bir
    promptta (p1) eski localStorage davranışının (giriş yapılmadan da
    yorum eklenebilmesi, sayfa yenilenince kalıcı kalması) hiç
    bozulmadığı doğrulandı — hepsi sıfır JS hatasıyla.
  - `npx tsc --noEmit`, `npm run lint` ve tam `npm run build` hatasız geçti.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 21 Faz 4 için ek):**
- **`CommentCountLink` (kart/detay sayfası üst istatistik satırındaki
  yorum sayacı) gerçek bir promptta yorum eklendikten sonra sayfa
  yenilenmeden GÜNCELLENMİYOR** — `CommentSection`'ın kendi "Yorumlar (N)"
  başlığı doğru/anlık, ama ayrı bir bileşen olan `CommentCountLink`
  statik `baseCount` prop'una dayanıyor ve `CommentSection`'la state
  paylaşmıyor. Küçük, kozmetik bir gecikme (bir sonraki tam sayfa
  yüklemesinde doğru sayıyı gösterir) — Faz 3'ün "Profil nav vurgusu"
  sınırlamasıyla aynı kategoriden, kasıtlı olarak bu fazda çözülmedi.
- **İstek yorumları hâlâ tamamen mock+localStorage** — `prompt_requests`
  gerçek olmadığından (ayrı bir faz), bir isteğe yapılan yorumlar Faz
  1-4'ten hiç etkilenmedi.
- **Yorum bildirimleri yok** — Faz 3'teki aynı sınırlama (Bölüm 19'un
  `notifications` tablosuna client insert izni yok) yorumlar için de
  geçerli.

- **Frontend'in gerçek Supabase'e bağlanması — Faz 5 (Bölüm 21, devam
  ediyor): gerçek prompt istekleri.** Faz 1-4 prompt/profil/beğeni/
  kaydetme/takip/yorumu gerçek yaptı; Faz 5 aynı ilkeyi prompt-istek
  modülüne uyguluyor — istek oluşturma, isteği yönetme (kapat/aç/sil/yanıt
  seç) ve isteğe gerçek bir yanıt (prompt) yayınlama artık Supabase'e
  kalıcı olarak yazılıyor.
  - **Kapsam kararı — istek oluşturma diğer fazlardan farklı bir kural
    izliyor:** `CreatePromptForm`'un düz "Prompt Oluştur" modu (Faz 1) ve
    `CreateRequestForm` Faz 5'ten ÖNCE farklı durumdaydı — düz prompt
    oluşturma hep önizleme-yalnızdı (Supabase'e bağlanana kadar), ama
    istek oluşturma Bölüm 9'dan beri zaten gerçekten, kalıcı olarak
    yayınlıyordu (yalnızca localStorage'a). Bu yüzden Faz 1'in "gerçek
    yayın için giriş şart" kuralı buraya kör bir şekilde kopyalanmadı:
    `CreateRequestForm` giriş yapılmadan da eskisi gibi çalışmaya devam
    ediyor (yerel/localStorage), giriş yapılmışsa artık gerçek bir
    `prompt_requests` satırına yazıyor — hangisi olduğu yalnızca YERİ
    değiştiriyor, var olan bir özelliği asla giriş şartına bağlamıyor.
    Bir isteği YANITLAMA (`CreatePromptForm`'un `?answerRequest=` modu) ise
    farklı: gerçek bir isteği yanıtlamanın Faz 5'ten önce hiç var olan bir
    hâli yoktu (yanıtlama hep `CreatePromptForm` üzerinden gitmişti ve
    gerçek istek diye bir şey Faz 5'e kadar yoktu), bu yüzden orada Faz
    1'in kuralı geçerli: gerçek bir isteği yanıtlamak giriş gerektiriyor
    (mock/yerel bir isteği yanıtlamak hâlâ giriş gerektirmiyor, aynen
    öncesi gibi).
  - **Yeni `src/lib/supabase/requests.ts`:** `prompts.ts`'nin birebir
    mimarisi — `RequestRow`/`REQUEST_SELECT` (yazar + `prompt_request_tags`
    join'i), `mapRequestRow`, `fetchRecentRequests`/`fetchRequestById`
    (ikisi de try/catch'li — Faz 2'nin dayanıklılık dersini baştan
    uyguluyor), `createRealRequest` (referans görseli varsa gerçekten
    `request-references` bucket'ına yüklüyor — Bölüm 20 — sonra
    `prompt_requests` + `prompt_request_tags` satırlarını yazıyor),
    `updateRealRequestStatus`, `deleteRealRequest`,
    `selectRealRequestResponse` (hem `selected_response_prompt_id`'yi hem
    `status`'u tek UPDATE'te günceller).
  - **`src/lib/supabase/prompts.ts` genişletildi:** `CreateRealPromptInput`'a
    opsiyonel `requestId` eklendi — set edilirse `createRealPrompt`
    `origin_type: 'request_response'` + `request_id` yazıyor (Bölüm 19'un
    zaten test edilmiş `handle_prompt_origin_change` trigger'ı isteğin
    `response_count`'unu otomatik artırıyor). Yeni
    `fetchPromptsForRequest(requestId)` — bir isteğin gerçek yanıtlarını
    (`request_id` eşleşen promptlar) çekiyor.
  - **Yeni `RealRequestsProvider`/`useRealRequests()`**
    (`features/requests/real-requests-provider.tsx`) — `RealPromptsProvider`
    ile birebir aynı şekil: `realRequests`, `getCached`, `fetchById`,
    artı gerçek mutasyon aksiyonları (`addRequest`, `updateStatus`,
    `deleteRequest`, `selectResponse`) — her biri Supabase'e yazıp yerel
    state'i iyimser olarak güncelliyor. `AppProviders`'a `RequestsProvider`
    (yerel/mock) içine eklendi.
  - **`lib/utils.ts` → `requestHref()` genişletildi:** artık `local-req-`
    önekine değil (Faz 1'in `promptHref` dersiyle aynı düzeltme),
    `mockRequests` içinde olup olmadığına bakıyor — hem yerel hem gerçek
    (UUID) istekler aynı şekilde `/requests/local?id=…`'e yönleniyor.
  - **`LocalRequestView` (`/requests/local`) üç kaynağı sırayla dener:**
    yerel (localStorage) → önbellekteki gerçek istekler → (bulunamazsa)
    canlı bir Supabase sorgusu — `LocalPromptView`'ın (Faz 1) birebir aynı
    deseni.
  - **`RequestDetailView` gerçek/yerel ayrımını `isUuid(request.id)` ile
    yapıyor** (Faz 1-4'ün tuttuğu genel kural): kendi isteğini yönetme
    (kapat/aç/sil), yanıt seçme ve gerçek yanıtları listeleme
    (`fetchPromptsForRequest`, yerel yanıtlarla birleştirilip tek listede
    gösteriliyor) artık doğru sağlayıcıya (`useRealRequests()` vs.
    `useRequests()`) yönleniyor.
  - **`CreatePromptForm`'un `?answerRequest=` modu artık gerçek istekleri
    de destekliyor:** hedef istek önce yerel/mock'ta (`useRequests()`,
    senkron), yoksa `isUuid()` ile gerçek olup olmadığına bakılıp
    `useRealRequests()`'in önbelleği/canlı sorgusuyla (asenkron, bir
    `useEffect` ile) aranıyor. Gerçek hedefin `contentType`/
    `preferredTool`/`tags` alanları asenkron geldiği için form alanlarının
    `useState` lazy initializer'larından SONRA gelen ayrı bir `useEffect`
    ile geri dolduruluyor (`/profile/edit`'in Faz 2'deki gerçek-profil
    senkronizasyonuyla aynı desen — async veri, senkron initializer'larla
    doldurulamıyor). Giriş yapılmışsa `addRealPrompt(..., { requestId })`
    ile gerçek bir yanıt yayınlanıyor (isteğin sahibine görünür, gerçek
    `response_count` artıyor); giriş yapılmamışsa Faz 1'in düz oluşturma
    kuralıyla aynı şekilde yalnızca önizleme + giriş/kayıt bağlantılı bir
    bilgi kutusu gösteriliyor (kalıcı bir yerel yanıt OLUŞTURULMUYOR —
    yukarıdaki kapsam kararına göre bu, korunması gereken var olan bir
    özellik değil). Mock/yerel bir isteği yanıtlamak ise değişmeden
    localStorage üzerinden, giriş şartı olmadan çalışmaya devam ediyor.
  - **Feed/liste entegrasyonu:** `FeedTabs`, `DiscoverFeed` ve
    `/requests` sayfası artık `useRealRequests()`'i de `useRequests()`/
    `useLocalPrompts()`/`useRealPrompts()` ile aynı şekilde client-side
    birleştirip tarihe göre sıralıyor — gerçek bir istek, tıpkı yerel bir
    istek gibi, Ana Sayfa/Keşfet/`/requests`'te diğer her şeyle karışık
    görünüyor.
  - **İstek yorumları bilinçli olarak bu fazın dışında bırakıldı:**
    `CommentSection` hâlâ yalnızca `promptId` hedefleri için gerçek
    (Faz 4), `requestId` hedefleri (mock ya da gerçek fark etmez) hâlâ
    localStorage üzerinden çalışıyor — bkz. aşağıdaki bilinen sınırlama.
  - **Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ
    `*.supabase.co`'ya erişimi engellediğinden, iki ayrı Playwright
    paketiyle test edildi. (1) Sıfır ağ taklidiyle dayanıklılık: gerçek
    bir isteğe yanıt formu (`?answerRequest=<uuid>`) ve `/requests` listesi
    Supabase'e hiç ulaşamazken bile çökmeden/asılı kalmadan doğru
    davrandı (birkaç saniye içinde "İstek bulunamadı" veya boş listeye
    zarifçe düştü, sıfır `pageerror`). (2) Ağ seviyesinde taklit edilmiş
    Supabase REST yanıtlarıyla (tarayıcı localStorage'ına gerçek
    supabase-js oturum formatında bir session enjekte edilip `/rest/v1/
    prompt_requests`, `/rest/v1/prompt_request_tags`, `/rest/v1/prompts`,
    `/rest/v1/profiles` uç noktaları taklit edilerek) 18 adım uçtan uca
    doğrulandı: giriş yapmış kullanıcı için istek oluşturma formunun
    gerçek bir INSERT tetiklediği ve doğru sayfaya yönlendirdiği; kendi
    gerçek isteğinde yönetim kontrollerinin (kapat/aç/sil) göründüğü ve
    her birinin gerçek bir PATCH/DELETE tetiklediği; gerçek isteğin Ana
    Sayfa/Keşfet/`/requests`'te göründüğü; bir yanıt seçilince
    `selected_response_prompt_id`'nin gerçekten güncellendiği ve seçilen
    yanıtın istek detayında "Seçilen yanıt" rozetiyle göründüğü; gerçek
    bir isteğe `CreatePromptForm` üzerinden yanıt verilince doğru
    `origin_type: 'request_response'` + `request_id` ile gerçek bir INSERT
    tetiklendiği ve doğru içerik türü/araç/etiketlerin isteğin gerçek
    alanlarından önceden dolduğu; giriş yapılmamışken gerçek bir isteği
    yanıtlamanın "giriş yap/hesap oluştur" bilgi kutusunu gösterip HİÇBİR
    kalıcı kayıt oluşturmadığı; ve mock bir isteği (r1) yanıtlamanın giriş
    şartı olmadan eskisi gibi çalışmaya devam ettiği — hepsi sıfır JS
    hatasıyla. Ayrıca masaüstü/mobil × açık/koyu tema kombinasyonlarının
    tümünde 10 sayfalık bir regresyon taraması (yatay taşma + JS hatası
    kontrolü) sorunsuz geçti.
  - `npx tsc --noEmit`, `npm run lint` ve tam `npm run build` (91 statik
    sayfa) hatasız geçti.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 21 Faz 5 için ek):**
- **İstek yorumları hâlâ tamamen mock+localStorage — Faz 5'ten sonra da
  değişmedi:** `CommentSection`'ın gerçek dal (Faz 4) yalnızca `promptId`
  hedefleri için var; bir isteğe (gerçek olsun ya da olmasın) yapılan
  yorumlar hâlâ yalnızca bu tarayıcıda yaşıyor. Bilinçli bir kapsam kararı
  (yukarıya bakınız) — gerçek istek yorumları ayrı, küçük bir iş olurdu
  (`CommentSection`'a `isUuid(target.requestId)` kontrolü eklemek ve
  `comments.ts`'e bir `fetchCommentsForRequest`/`postCommentOnRequest`
  çifti eklemek yeterli olurdu) ama bu fazın kapsamına alınmadı.
- **Gerçek bir isteğin "Düzenle"si hâlâ yok** — Faz 5'ten önceki aynı
  kapsam kararı (yalnızca kapat/aç/sil) korundu, gerçek istekler için de
  genişletilmedi.
- **Referans görsel boyut/format doğrulaması gerçek bir Supabase
  projesine karşı hiç denenmedi** — Faz 1/2'deki aynı sandbox ağ kısıtı
  burada da geçerli, yalnızca taklit edilmiş yanıtlarla test edildi.
- **Bildirimler yine yok:** yeni bir gerçek isteğe yanıt geldiğinde ya da
  bir yanıt seçildiğinde istek sahibine gerçek bir bildirim üretilmiyor —
  Faz 3/4'teki aynı, belgelenmiş sınırlama.
- **`prompt_request_tags` eklenmesi de "yumuşak" başarısız oluyor** —
  `createRealPrompt`'un `prompt_tags`'i için Faz 1'de alınan aynı karar
  (etiket eklemek başarısız olsa bile isteğin/yanıtın kendisi yayınlanmış
  sayılır) `createRealRequest` için de geçerli.

- **Frontend'in gerçek Supabase'e bağlanması — Faz 6 (Bölüm 21,
  TAMAMLANDI): gerçek mesajlaşma.** Bölüm 16'dan beri "mesaj gönderme
  henüz devre dışı" diye belgelenmiş en eski TODO'nun karşılığı. Bölüm
  19'un zaten yazılmış RLS politikaları (`is_conversation_member()`
  `SECURITY DEFINER` yardımcı fonksiyonu dahil) ve `handle_new_message`
  trigger'ı ilk kez gerçekten kullanılmaya başlandı — iki gerçek hesap
  artık gerçekten, kalıcı olarak birbirine mesaj gönderip alabiliyor. Bu,
  Bölüm 21'in planlanan son fazıydı; modül bununla TAMAMLANDI.
  - **Kapsam kararı — mock mesajlaşma dokunulmadan kaldı:**
    `mocks/conversations.ts`'teki 5 sabit konuşma ve `/messages/
    [conversationId]`'nin devre dışı composer'ı hiç değişmedi — Faz 1-5'in
    "gerçek olmayan hedefe gerçek yazım yapılamaz" ilkesinin doğal bir
    sonucu: mock kullanıcıların gerçek bir `profiles`/`conversations`
    satırı yok, bu yüzden onlarla "gerçekten" mesajlaşmak yapısal olarak
    mümkün değil. Gerçek mesajlaşma yalnızca iki GERÇEK (Supabase) hesap
    arasında çalışıyor.
  - **Yeni `src/lib/supabase/messages.ts`:** `fetchConversationsForUser`
    (bir kullanıcının tüm gerçek konuşmaları — `conversations` tablosunda
    mesaj önizlemesi saklanmadığından, son mesaj metni ayrı bir sorguyla
    çekilip JS'te eşleştiriliyor), `fetchConversationForUser` (doğrudan
    bir linke giden tekil sorgu — RLS zaten "bu kullanıcı üye değilse
    satır görünmez" işini yapıyor, bu yüzden "konuşma yok" ile "üye değilim"
    ayrımı kasıtlı olarak yapılmıyor, her ikisi de aynı "bulunamadı"
    ekranına düşüyor), `fetchMessages`, `sendMessage` (gerçek INSERT —
    Bölüm 19'un `handle_new_message` trigger'ı `conversations.
    last_message_at`'i ve DİĞER üyenin `unread_count`'unu otomatik
    güncelliyor), `markConversationRead`, ve `getOrCreateDirectConversation`
    (iki gerçek kullanıcı arasında var olan bir 1:1 konuşmayı bulur, yoksa
    yenisini oluşturur). Hepsi try/catch'li (Faz 2'nin dayanıklılık
    dersi baştan uygulandı).
  - **İki üyelik satırı BİLİNÇLİ OLARAK iki ayrı INSERT ile yazılıyor,
    tek bir çoklu-satır INSERT ile değil:** `conversation_members`'ın
    "davet edebilme" RLS politikası (`auth.uid() = user_id OR
    is_conversation_member(conversation_id)`) diğer kullanıcının satırını
    yazarken bu oturumun KENDİ satırının zaten var olduğunu görebilmesine
    dayanıyor. Tek bir çoklu-satır `INSERT ... VALUES (...), (...)`
    ifadesinde Postgres'in bir komutun kendi işlediği önceki satırları
    aynı komutun RLS kontrolüne görünür kılıp kılmadığı garanti/belgeli bir
    davranış değil — bu yüzden riske girmemek için iki ayrı, sıralı INSERT
    komutu kullanıldı (ilki kendi satırını her zaman geçen `auth.uid() =
    user_id` koşuluyla, otomatik commit sonrası ikincisi artık gerçekten
    var olan üyeliği görüp `is_conversation_member()` ile geçiyor).
  - **Yeni `RealMessagesProvider`/`useRealMessages()`**
    (`features/messages/real-messages-provider.tsx`) — `RealRequestsProvider`
    ile aynı şekil: `conversations`, `getCached`, `refresh`,
    `startConversationWith`. `AppProviders`'a `RealRequestsProvider`'ın
    içine eklendi.
  - **Yeni `messageHref(conversation)`** (`lib/utils.ts`, `promptHref`/
    `requestHref`/`profileHref` ile birebir aynı desen): bir konuşma
    build-zamanı mock listesinde mi diye bakıyor; değilse (gerçek, UUID
    bir konuşma) `/messages/local?id=…`'e yönlendiriyor. `ConversationRow`
    artık `/messages/${id}`'i elle kurmak yerine bunu kullanıyor.
  - **Yeni `LocalConversationView`/`/messages/local`** (`local-request-
    view.tsx`'in üç-kaynaklı desenine benzer, ama daha basit — konuşmalar
    yalnızca gerçek olabildiğinden ikili değil): önce `RealMessagesProvider`
    önbelleğine bakıyor (bir "Mesaj Gönder" tıklamasından hemen sonra
    genelde burada bulunuyor, ekstra bir ağ isteği gerekmeden), yoksa
    `fetchConversationForUser` ile canlı sorguya düşüyor. Sayfa
    yüklenince gerçek mesaj geçmişini çekiyor ve konuşmayı okundu
    işaretliyor; composer GERÇEKTEN gönderiyor — uygulamadaki mesaj
    gönderebilen TEK yüzey burası (mock `/messages/[conversationId]`
    hâlâ salt görüntüleme). Giriş yapılmamışsa (bu route için giriş her
    zaman gerekli — gerçek bir konuşma zaten yalnızca gerçek hesaplar
    arasında var olabilir) dürüst bir "giriş yapmalısın" ekranı gösteriyor.
  - **Gerçek bir profilde "Mesaj Gönder":** yeni
    `features/messages/message-button.tsx` (`MessageButton`) —
    `FollowButtonView`/`LikeButton` ile aynı ilke: hedef gerçekse
    (`isUuid`) ve giriş yapılmışsa tıklanınca `startConversationWith` ile
    gerçek bir konuşma bulunup/oluşturulup oraya yönlendiriliyor; hedef
    gerçek ama giriş yapılmamışsa `/login`'e giden bir link (Faz 3'ün
    `FollowButtonView`'ıyla birebir aynı desen); hedef mock ise eski
    davranış (yalnızca `mocks/conversations.ts`'te zaten var olan bir
    thread'e link, yoksa buton hiç yok) hiç değişmeden duruyor.
    `OtherProfileActions`'daki eski, yalnızca mock'a bakan satır içi
    `Link` bununla değiştirildi — bu, Faz 2'nin belgelenmiş "gerçek bir
    hesabın Mesaj Gönder butonu yok" sınırlamasını da kapatıyor.
  - **`/messages` listesi ve header'daki okunmamış mesaj noktası** artık
    `useRealMessages()`'i de `mockConversations`'la aynı şekilde
    birleştiriyor — gerçek bir konuşma, tıpkı mock bir konuşma gibi,
    listede ve header'ın kırmızı noktasında görünüyor.
  - **Realtime KASITLI OLARAK eklenmedi** — CLAUDE.md §2'nin teknoloji
    yığınında "Realtime (mesajlaşma için)" planlanmış olsa da, bu faz
    yalnızca sayfa yüklendiğinde/gönderim sonrasında çekme (fetch-on-load
    + gönderim sonrası iyimser ekleme) kullanıyor — karşı tarafın
    gönderdiği bir mesaj, sayfa yeniden yüklenene/yeniden ziyaret
    edilene kadar görünmüyor. Gerçek zamanlı güncelleme (`supabase.
    channel().on('postgres_changes', ...)` aboneliği) ayrı, küçük ama net
    bir sonraki iş — bu sandbox'ın WebSocket bağlantılarını da
    engellediği ağ kısıtı yüzünden gerçek bir Supabase projesine karşı
    hiç denenemezdi, bu yüzden şimdilik kapsam dışı bırakıldı.
  - **Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ
    `*.supabase.co`'ya erişimi engellediğinden, iki katmanlı test
    yapıldı. (1) Sıfır ağ taklidiyle dayanıklılık: `/messages` (giriş
    yapılmış/yapılmamış) ve `/messages/local?id=<uuid>` Supabase'e hiç
    ulaşamazken bile çökmeden/asılı kalmadan doğru davrandı (birkaç
    saniye içinde boş listeye veya "Konuşma bulunamadı"na zarifçe düştü,
    sıfır `pageerror`); giriş yapılmamışken `/messages/local` hiç ağ
    isteği atmadan anında "Giriş yapmalısın" gösterdi. (2) Ağ seviyesinde
    taklit edilmiş Supabase REST yanıtlarıyla 9 adım uçtan uca doğrulandı:
    gerçek bir başka kullanıcının profilinde "Mesaj Gönder"in gerçekten
    tıklanabilir olduğu; tıklanınca gerçek bir konuşma oluşturulup
    `/messages/local?id=<uuid>`'e yönlendirdiği (ve `markConversationRead`
    çağrıldığı); bir mesaj gönderilince gerçek bir INSERT tetiklenip
    mesajın anında thread'de göründüğü; `/messages` listesinin gerçek
    konuşmayı doğru katılımcı/link ile gösterdiği; ve mock bir konuşmanın
    (`/messages/c1`) composer'ının hâlâ devre dışı kaldığı — hepsi sıfır
    JS hatasıyla. Ayrıca header'daki okunmamış mesaj noktasının gerçek bir
    `unread_count > 0` konuşmasıyla doğru göründüğü ve masaüstü/mobil ×
    açık/koyu tema kombinasyonlarının tümünde (mesajlar listesi, mock
    konuşma, gerçek konuşma sayfası, gerçek profil dahil) yatay taşma/JS
    hatası olmadığı 21 adımlık ek bir taramayla doğrulandı.
  - `npx tsc --noEmit`, `npm run lint` ve tam `npm run build` (92 statik
    sayfa) hatasız geçti.
  - **Düzeltme — "Mesaj Gönder"e basınca hiçbir şey olmuyordu (gerçek
    kullanıcı bildirdi):** Faz 6'nın ilk sürümünde `getOrCreateDirectConversation`
    yeni bir konuşma oluştururken `supabase.from("conversations").insert({}).
    select("id, last_message_at").single()` kullanıyordu — id'yi Postgres'in
    `gen_random_uuid()` varsayılanına bırakıp `RETURNING` ile geri okuyordu.
    Ama `conversations` tablosunun SELECT RLS politikası
    `is_conversation_member(id)`: INSERT anında (üyelik satırları henüz bir
    sonraki iki adımda ekleniyor) bu oturum için HENÜZ hiçbir üyelik satırı
    yok, bu yüzden `RETURNING`'in gösterebileceği hiçbir satır yok —
    `.single()` sıfır satır karşısında hata fırlatıyor. INSERT'in kendisi
    aslında BAŞARILI oluyordu, ama uygulama yeni konuşmanın id'sini asla
    öğrenemiyordu ve fonksiyon hata fırlatıp duruyordu. `MessageButton`'ın
    `catch` bloğu bu hatayı yalnızca `console.error`'a yazıp sessizce
    yutuyordu (kullanıcıya hiçbir şey göstermiyordu) — bu yüzden gerçek bir
    kullanıcı için "Mesaj Gönder"e basmak gözle görülür hiçbir şey
    yapmıyordu. Bu sandbox'ın ağ politikası gerçek Supabase'e erişimi
    engellediğinden ve Faz 6'nın testleri REST yanıtlarını taklit ederek
    (gerçek Postgres/RLS'i hiç çalıştırmadan) yapıldığından, bu spesifik
    RLS etkileşimi hiç ortaya çıkmamıştı — yalnızca gerçek bir kullanıcının
    gerçek projeye karşı denemesiyle fark edildi.
    - **Düzeltme:** konuşmanın id'si artık İSTEMCİ TARAFINDA
      (`crypto.randomUUID()`) üretiliyor ve INSERT'e açıkça yazılıyor;
      INSERT'ten sonra hiçbir `.select()` çağrılmıyor, bu yüzden RLS'in
      henüz var olmayan bir üyelikten dolayı `RETURNING`'i gizlemesi
      sorunu tamamen ortadan kalkıyor. `MessageButton`'a ayrıca kullanıcıya
      görünür bir hata mesajı eklendi (`publishError` benzeri desen) —
      böyle bir başarısızlık bir daha olursa sessizce yutulmak yerine
      ekranda görünecek.
    - **Nasıl doğrulandı:** yeni bir Playwright regresyon testi, INSERT
      isteğinin artık `select` parametresi TAŞIMADIĞINI doğruluyor ve eğer
      taşısaydı (eski hatalı koda bir geri dönüş olsaydı) RLS'in gerçek
      davranışını taklit ederek (boş dizi döndürerek) testin BAŞARISIZ
      olmasını sağlıyor — yani bu regresyon artık test paketi tarafından
      yakalanıyor. Faz 6'nın tüm 30 adımı (9+21) bu düzeltmeyle birlikte
      tekrar çalıştırılıp yeniden doğrulandı.
    - **Ders:** ağ seviyesinde taklit edilmiş REST yanıtlarıyla test etmek
      (bu oturumun ağ kısıtı yüzünden Bölüm 17'den beri kullanılan yöntem)
      uygulama mantığını doğrular ama gerçek Postgres RLS etkileşimlerini
      DOĞRULAYAMAZ — özellikle "bir satırı INSERT edip aynı anda RETURNING
      ile geri okuma" gibi, SELECT politikasının INSERT anındaki durum
      üzerinden değerlendirildiği senaryolarda. Bu, Bölüm 21'in tamamında
      (Faz 1-6) tekrarlanan, dürüstçe belirtilmiş bir sınırlamanın somut
      bir örneği — gerçek bir kullanıcının gerçek ortamda denemesi hâlâ
      vazgeçilmez bir doğrulama adımı.

**Bilinen sorunlar / bilinçli basitleştirmeler (Bölüm 21 Faz 6 için ek —
ve Bölüm 21'in tamamı için genel bir özet):**
- **Realtime yok:** yukarıda açıklandığı gibi, gerçek mesajlaşma şu an
  polling/fetch-on-load ile çalışıyor; karşı tarafın mesajı anlık
  görünmüyor, sayfa yeniden ziyaret edilmeli. Bu, CLAUDE.md §2'nin
  planladığı Supabase Realtime kullanımının henüz gerçekleşmediği tek
  yer.
  - **Grup sohbeti yok, yalnızca 1:1:** `getOrCreateDirectConversation`
  yalnızca iki kişilik konuşmalar için tasarlandı; şema (`conversation_
  members`) teknik olarak grup sohbetini destekleyebilir ama bu hiç
  UI/mantık olarak kurulmadı — kapsam dışı.
- **Aynı anda çift tıklama küçük bir yarış durumu yaratabilir:** iki
  kullanıcı birbirine TAM AYNI ANDA "Mesaj Gönder"e basarsa,
  `findDirectConversationId`'nin "önce oku, yoksa oluştur" deseni teorik
  olarak iki ayrı konuşma oluşturabilir (bir sonraki mesajlaşmada ikisi
  birleşmez, ayrı iki thread olarak kalır). Gerçek kullanıcı hacmi bu
  sandbox'ta test edilemeyecek kadar düşük olduğundan pratikte
  gözlemlenmedi/düzeltilmedi; gerçek bir veritabanı UNIQUE kısıtı (ör.
  sıralı `(user_a, user_b)` çifti üzerinde) bunu kalıcı olarak
  çözebilirdi ama bu fazın kapsamına alınmadı.
  - **Bildirim yine yok:** yeni bir mesaj geldiğinde alıcıya gerçek bir
  bildirim üretilmiyor — Faz 3-5'teki aynı, belgelenmiş sınırlama
  (Bölüm 19'un `notifications` tablosuna client insert izni yok).
  Header'daki kırmızı nokta `conversation_members.unread_count`'tan
  geliyor, bu yeterli ama ayrı bir bildirim kaydı değil.
- **Konuşma silme/çıkma arayüzü yok:** RLS bir üyenin kendi üyelik
  satırını silebilmesine (`DELETE`) izin veriyor ama hiçbir ekran bunu
  tetiklemiyor — "konuşmadan ayrıl" gibi bir aksiyon bu fazda eklenmedi.
- **Bölüm 21'in tamamı için genel özet:** Faz 1-6 hepsi aynı ilkeyi
  izliyor — bir hedef (prompt/profil/istek/konuşma) gerçekse (`isUuid`)
  VE gerekiyorsa giriş yapılmışsa gerçek Supabase'e yazılıyor, değilse
  var olan mock+localStorage davranışı hiç bozulmadan duruyor. Sonuç:
  uygulama artık iki paralel, birbirini hiç bozmayan deneyim sunuyor —
  "mock/demo" (herkes, giriş şartsız, localStorage) ve "gerçek" (giriş
  yapmış gerçek hesaplar, Supabase'e kalıcı). İkisi arasındaki köprü
  (mock "me" hesabının gerçek bir Supabase hesabına dönüştürülmesi/
  taşınması gibi) hiç kurulmadı ve muhtemelen hiç kurulmayacak — bu,
  CLAUDE.md'nin başından beri "mock veri yalnızca geliştirme/placeholder
  amaçlı" dediği ayrımın doğal sonucu.

**Sonraki adım:** Bölüm 21 (Frontend'in gerçek Supabase'e bağlanması)
TAMAMLANDI. Sırada Bölüm 22 (Moderasyon, engelleme, raporlama — şema
zaten Bölüm 18'de hazırlandı, RLS Bölüm 19'da temel sahiplik
politikalarıyla yazıldı, yalnızca frontend arayüzü/mantığı eksik) veya
Bölüm 23 (Testler, performans, erişilebilirlik) var. Hangisiyle
devam edileceği bir sonraki oturumda kullanıcıyla netleştirilecek.
