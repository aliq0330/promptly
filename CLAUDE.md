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

Promptly, kullanıcıların yapay zekâ görsel üretiminde kullandıkları
promptları paylaşabildiği, keşfedebildiği, yeniden kullanabildiği (remix) ve
birbirleriyle sosyal olarak etkileşime girebildiği bir platformdur.

Merkezde: promptlar, görsel üretim, remix, yaratıcı prompt istekleri ve
topluluk var. Genel amaçlı bir sosyal medya sitesi veya soru-cevap platformu
DEĞİLDİR — her sosyal özellik prompt/görsel üretim deneyimini desteklemek
için var.

Temel varlıklar:
- **Prompt**: başlık, açıklama, tam prompt metni, görsel(ler), etiketler,
  kullanılan araç/model.
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
| `/` | Ana sayfa / sosyal feed (Takip Ettiklerim, Popüler, Sana Özel sekmeleri) |
| `/discover` | Keşfet: trend promptlar, yaratıcılar, etiketler, istekler |
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
7. [ ] Prompt oluşturma
8. [ ] Remix sistemi
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

**Son güncelleme:** Site genelinde mock kullanıcı/prompt verisiyle
feed, keşfet, istekler, bildirimler, mesajlar ve profil sayfaları dolduruldu.

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

**Sonraki modül:** Prompt oluşturma (Bölüm 7).
