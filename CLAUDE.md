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
  styles/                 # Global CSS, design token tanımları
```

> **Not:** `src/mocks/` klasörü kaldırıldı (bkz. Bölüm 9.1 "Mock verinin
> tamamen kaldırılması"). Uygulama artık uçtan uca gerçek Supabase verisiyle
> çalışıyor, mock/localStorage tabanlı bir demo katmanı yok.

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
    birbirine mesaj gönderip alabiliyor. Bu fazın ilk sürümünde mock/
    localStorage deneyimi gerçek hesap yolunun yanında ayrı bir katman
    olarak duruyordu — **bu artık geçerli değil, bkz. madde 21.5**)
21.5. [x] **Mock verinin tamamen kaldırılması** (yukarıdaki 5-21 arası
    maddelerin "mock veriyle" / "localStorage" ifadeleri artık ESKİ —
    `src/mocks/` klasörü ve tüm localStorage tabanlı provider'lar
    (follow/like/save/comment/local-prompts/local-requests/profil
    override/gizleme) silindi; uygulama artık uçtan uca yalnızca gerçek
    Supabase verisiyle çalışıyor, hiçbir sahte/demo veri kalmadı —
    ayrıntı: Bölüm 9.1)
22. [ ] Moderasyon, engelleme, raporlama
23. [ ] Testler, performans, erişilebilirlik
24. [ ] Deployment ve son kalite kontrolü

---

## 9. Şu Anki Durum (bu bölüm her modül sonunda güncellenir)

### 9.0 Bilinen Hatalar — Konsolide Düzeltme Listesi

> Bu alt bölüm, aşağıdaki uzun geçmişe dağılmış "Bilinen sorunlar / bilinçli
> basitleştirmeler" notlarından yalnızca GERÇEK HATA olanları (bilinçli
> kapsam kararlarını değil — onlar zaten kendi Faz bölümlerinde "bilinçli"
> diye işaretli duruyor) tek bir yerde topluyor, artı bu oturumda yapılan
> taze bir kod incelemesinin (`src/lib/supabase/*.ts`'teki TÜM
> `.insert()/.update()/.delete()` çağrıları RLS politikalarına karşı elden
> geçirildi) bulgularını ekliyor. Amaç: bir sonraki oturumda nereden
> başlanacağını aramadan bilmek. Her madde hangi Bölüm/Faz'da yaşadığını ve
> ilgili tam detayın nerede olduğunu gösteriyor.

**[DÜZELTİLDİ] Bölüm 21 Faz 6 — "Mesaj Gönder" gerçek RLS altında hiçbir
şey yapmıyordu.** `getOrCreateDirectConversation`, `conversations`
tablosuna INSERT edip hemen `RETURNING` ile id'yi geri okumaya
çalışıyordu; ama `conversations`'ın SELECT RLS politikası
`is_conversation_member(id)` — INSERT anında bu oturumun henüz hiçbir
üyelik satırı yok, bu yüzden `RETURNING` boş dönüyor ve `.single()` hata
fırlatıyordu (INSERT'in kendisi başarılı olsa bile). Hata sessizce
yutuluyordu, kullanıcı "tıkladım, hiçbir şey olmadı" görüyordu. Konuşma
id'si artık istemci tarafında (`crypto.randomUUID()`) üretiliyor, INSERT
sonrası hiçbir `.select()` çağrılmıyor. Ayrıntı: Bölüm 21 Faz 6'nın
"Düzeltme" alt maddesi.

**[AÇIK — orta öncelik] Bölüm 21 Faz 6 — eşzamanlı çift tıklama iki ayrı
konuşma oluşturabilir.** İki kullanıcı birbirine TAM AYNI ANDA "Mesaj
Gönder"e basarsa, `findDirectConversationId`'nin "önce oku, yoksa oluştur"
deseni atomik değil — teorik olarak iki ayrı `conversations` satırı
oluşabilir (bir daha birleşmezler). Düzeltme adayı: sıralı
`(least(user_a,user_b), greatest(user_a,user_b))` üzerinde bir UNIQUE
kısıt, ya da atomik bir Postgres RPC fonksiyonu (`get_or_create_
direct_conversation`) ile client-side "oku sonra yaz" yarışını ortadan
kaldırmak. Dosya: `src/lib/supabase/messages.ts`.

**[AÇIK — düşük öncelik, doğrulanmadı] Bölüm 21 (genel) — istek/konuşma
yönetim aksiyonlarında "sessiz no-op" riski.** `updateRealRequestStatus`,
`deleteRealRequest`, `selectRealRequestResponse` (`src/lib/supabase/
requests.ts`) UPDATE/DELETE sonrası etkilenen satır sayısını hiç kontrol
etmiyor — sahiplik tamamen RLS'e bırakılmış (RLS bu satırları başka bir
kullanıcı için sessizce 0 satır etkiler, hata fırlatmaz). Şu an istemci
tarafı `isOwnRequest`/`canManage` hesaplaması (`request-detail-view.tsx`)
doğru olduğundan GERÇEK bir hata yok — ama bu, tam olarak yukarıdaki
mesajlaşma hatasıyla aynı SINIFTAN bir tuzak: ileride bu kontrol
regresyona uğrarsa, kullanıcı butona basar, arayüz "başarılı" gösterir,
ama veritabanında hiçbir şey değişmemiş olabilir, hiçbir hata mesajı
olmadan. Düzeltme adayı: bu üç fonksiyona `.select().maybeSingle()`
ekleyip `null` dönerse (0 satır etkilendiyse) açık bir hata fırlatmak.

**[DOĞRULAMA YAPILDI, YENİ HATA BULUNMADI] Bölüm 21 (genel) — INSERT+
RETURNING RLS kalıbı, tüm dosyalar tarandı.** Konuşma hatasına benzer bir
"SELECT politikası, INSERT anında henüz var olmayan BAŞKA bir tabloya
bağlı" tuzağı olup olmadığını görmek için `src/lib/supabase/*.ts`'teki
TÜM `.insert(...).select(...).single()/.maybeSingle()` çağrıları
(`prompts`, `prompt_media`, `prompt_requests`, `prompt_comments`,
`messages`, `profiles`) RLS politikalarına karşı tek tek elden geçirildi.
Hiçbiri aynı tuzağa düşmüyor — her biri ya satırın KENDİ kolon değerine
(ör. `prompts.status`) ya da INSERT'ten ÖNCE zaten var olan bir ebeveyn
satıra (ör. `prompt_media`'nın kontrol ettiği `prompts` satırı) bakıyor.
Ama bu yalnızca statik kod incelemesiyle doğrulandı — sandbox'ın ağ
kısıtı yüzünden gerçek bir Supabase projesine karşı hiç çalıştırılamadı;
gerçek bir kullanıcı bu akışlardan birinde benzer bir "tıkladım, hiçbir
şey olmadı" davranışı görürse, ilk bakılacak yer ilgili fonksiyonun
insert+select şeklidir.

**[AÇIK — kozmetik] Bölüm 21 Faz 2 — "Profil" nav vurgusu gerçek kendi
profilde çalışmıyor.** Sidebar/mobil nav'daki "Profil" öğesi gerçek kendi
profili (`/profile/real?username=…`) görüntülerken vurgulanmıyor (linkin
hedefi doğru, yalnızca aktif-görünüm hesaplaması `pathname`'e bakıyor,
query param'a bakmıyor). Ayrıntı: Bölüm 21 Faz 2'nin bilinen sınırlaması.

**[AÇIK — kozmetik] Bölüm 21 Faz 4 — `CommentCountLink` gecikmeli
güncelleniyor.** Gerçek bir promptta yeni yorum eklendikten sonra kart/
detay sayfası üst istatistik satırındaki yorum sayacı sayfa
yenilenmeden GÜNCELLENMİYOR (statik `baseCount` prop'una dayanıyor,
`CommentSection`'ın kendi state'ini paylaşmıyor). Ayrıntı: Bölüm 21 Faz
4'ün bilinen sınırlaması.

**[AÇIK — nadir edge case] Bölüm 8 (Remix sistemi) — ön doldurma yalnızca
ilk mount'ta çalışıyor.** `CreatePromptForm`'daki remix ön doldurma
`useState` lazy initializer kullanıyor; aynı `/create` sekmesinde bir
remix linkinden başka bir remix linkine tam sayfa yenilemeden (client-
side) geçilirse form alanları yenilenmiyor. Pratikte nadir (her "Remixle"
tıklaması ayrı bir navigasyon).

**[AÇIK — performans, düşük öncelik] Bölüm 21 Faz 3 — N+1 sorgu deseni.**
Her `LikeButton`/`SaveButton`/`FollowButton` örneği (gerçek bir hedef
için) kendi ayrı `fetchIsLiked`/`fetchIsSaved`/`fetchIsFollowing`
sorgusunu tetikliyor. Gerçek içerik hacmi arttıkça bir feed'in tamamı
için toplu bir `.in(...)` sorgusuna geçmek gerekebilir.

**Kapsam dışı bırakılmış, hata SAYILMAYAN bilinçli sınırlamalar** (Realtime
yok, grup sohbeti yok, taslak akışı yok, bildirim üretimi yok, kullanıcı
adı değiştirilemiyor, tablet düzeni yok, vb.) her Faz'ın kendi "Bilinen
sorunlar / bilinçli basitleştirmeler" alt bölümünde ayrıntılı olarak
duruyor — burada tekrar edilmedi, çünkü bunlar düzeltilecek hatalar değil,
kasıtlı olarak ertelenmiş kapsam kararları.

---

**Son güncelleme:** Mock verinin tamamen kaldırılması (bkz. Bölüm 9.1) —
`src/mocks/` ve tüm localStorage tabanlı provider'lar/rotalar silindi,
uygulama artık uçtan uca yalnızca gerçek Supabase verisiyle çalışıyor.
Bundan önceki son milestone Bölüm 21 — Frontend'in gerçek Supabase'e
bağlanması, Faz 6 (TAMAMLANDI) idi: prompt oluşturma/görüntüleme (Faz 1),
kullanıcı profilleri (Faz 2), beğeni/kaydetme/takip (Faz 3), yorum ekleme
(Faz 4), prompt istekleri (Faz 5) ve mesajlaşma (Faz 6) — o zaman mock/
gerçek iki katman yan yana duruyordu, Bölüm 9.1 ile bu ayrım sona erdi.
Aşağıdaki "Tamamlanan"/"Devam etmiyor" listeleri ve Faz yazıları o dönemin
tarihsel kaydı olarak korunuyor; "mock veriyle" ifadeleri artık geçerli
değil (bkz. Bölüm 9.1).

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

### 9.1 Mock verinin tamamen kaldırılması

Kullanıcının açık isteği üzerine ("Mocklari ve alakalı şeyleri tamamen
kaldır sitede sahte veri kalmasın") Bölüm 21'in kurduğu "mock/demo katmanı
+ gerçek katman yan yana, birbirini bozmadan" mimarisi sona erdi. Uygulama
artık **yalnızca** gerçek Supabase verisiyle çalışıyor — hiçbir sahte
kullanıcı, prompt, istek, yorum, konuşma veya bildirim yok, ve hiçbir
localStorage tabanlı "gerçekmiş gibi davranan" prototip kalmadı.

**Kaldırılanlar:**
- `src/mocks/` klasörünün tamamı (`users.ts`, `prompts.ts`, `tags.ts`,
  `requests.ts`, `request-responses.ts`, `comments.ts`, `notifications.ts`,
  `conversations.ts` — 9 sahte kullanıcı, 20+ mock prompt, mock istekler/
  yanıtlar/yorumlar/bildirimler/konuşmalar dahil hepsi).
- localStorage tabanlı 7 provider: `follow-provider.tsx`,
  `like-save-provider.tsx`, `comment-provider.tsx` (yerel yorum katmanı),
  `local-prompts-provider.tsx`, `requests-provider.tsx` (yerel istek
  katmanı — `real-requests-provider.tsx`'ten farklı, o duruyor),
  `profile-overrides-provider.tsx`, `hidden-prompts-provider.tsx`.
- `useFollowState`/`useLikeState`/`useSaveState` artık yalnızca gerçek
  Supabase durumunu okuyup yazıyor — mock/local hedefe düşen "else" dalları
  tamamen silindi (her hedef artık gerçek olduğundan zaten hiç
  tetiklenmiyorlardı).
- Statik, build-zamanlı mock rotaları: `/prompts/[id]`, `/requests/[id]`,
  `/profile/[username]` (+ `loading.tsx`'i), `/messages/[conversationId]`,
  `/tags/[tag]`. Bunların yerini alan `/prompts/local`, `/requests/local`,
  `/profile/real`, `/messages/local` (Bölüm 21'den beri zaten vardı) ve
  yeni `/tags/local` rotaları artık TEK rota — `promptHref()`/
  `requestHref()`/`profileHref()`/`messageHref()`/yeni `tagHref()`
  (`lib/utils.ts`) koşulsuz olarak hep bunlara yönleniyor, "bu id mock
  listesinde mi" kontrolü tamamen kalktı.
- `PromptRequestResponse` tipi, `ResponseCard`, `RequestResponseCount`
  (artık `request.responseCount` doğrudan gösteriliyor) — yalnızca mock
  "istek yanıtı" veri modeli için vardı, Bölüm 9'dan beri zaten gerçek
  yanıtlar sıradan bir `Prompt` (`origin.type === "request-response"`).
  `CommentCountLink` artık `CommentProvider` yerine doğrudan `baseCount`
  gösteriyor (gerçek `comment_count` kolonu). `resizeImageToDataUrl`
  (kare data-URL üreten mock-avatar yardımcı fonksiyonu) kullanılmayan
  kod olduğu için silindi.

**Yeni gerçek backend fonksiyonları** (`src/lib/supabase/`):
- `tags.ts` (YENİ): `fetchAllTags()`, `fetchPromptsByTag(slug)` — Keşfet'in
  "Popüler Etiketler"i ve yeni `/tags/local` sayfası artık gerçek, seed
  edilmiş `tags` tablosundan (Bölüm 18'in `20260919120600_seed_tags.sql`'i)
  okuyor.
- `prompts.ts`: `deleteRealPrompt(id)` (gerçek, kalıcı silme — RLS sahiplik
  kontrolü yapıyor), `searchPrompts(query)` (başlık/açıklama üzerinde
  `ilike`, `/search`'ü besliyor), `fetchPromptsByAuthors(authorIds)`
  ("Takip Ettiklerim" akışı için), `fetchRemixesOf(id)`/
  `fetchRemixChain(prompt)` (prompt detayının remix listesi/zinciri artık
  gerçek — sırayla `source_prompt_id` takip ederek). `CreateRealPromptInput`
  ve `createRealPrompt` artık opsiyonel bir `remixOf: {sourcePromptId,
  rootPromptId}` alıyor → **remix artık tamamen gerçek ve çalışıyor**
  (Bölüm 21 Faz 1'in "kaynağın gerçek bir veritabanı kaydı olması gerekir"
  kısıtı ortadan kalktı, çünkü artık remixlenebilecek HER prompt zaten
  gerçek bir satır).
- `profiles.ts`: `fetchTopCreators(limit)` (Keşfet'in "Öne Çıkan
  Yaratıcılar"ı), `searchProfiles(query)` (`/search`), `fetchFollowedProfiles
  (userId)` (gerçek `follows` tablosundan — "Takip Ettiklerim" artık
  localStorage değil, gerçek takip ilişkisini okuyor).
- `comments.ts`: `fetchCommentsForRequest(requestId)`/
  `postCommentOnRequest(...)` — istek yorumları artık prompt yorumlarıyla
  birebir aynı şekilde gerçek (`CommentSection` tek bir bileşende ikisini
  de `isPromptTarget` ayrımıyla ele alıyor, local dal tamamen kalktı).
- `notifications.ts` (YENİ): `fetchNotificationsForUser(userId)` — gerçek
  `notifications` tablosunu okuyor. **Bugün her zaman boş dönüyor** çünkü
  Bölüm 19 bilinçli olarak client'tan insert izni vermedi ve hiçbir
  sunucu tarafı trigger henüz bildirim üretmiyor — bu, mock verinin
  kaldırılmasıyla ortaya çıkan bir "eksik" değil, zaten var olan, belgelenmiş
  bir sınırlamanın (Bölüm 19/21 Faz 3-6) artık TEK davranış olması.
  `/notifications` bunu dürüstçe "Henüz bildirimin yok" ile gösteriyor.

**Davranış değişikliği — her yazma eylemi artık giriş gerektiriyor:**
Mock/localStorage'ın "giriş yapmadan da dene" güvenli ağı kalktığı için,
aşağıdakilerin hepsi artık gerçek bir Supabase hesabı istiyor (önceden bir
kısmı — istek oluşturma, mock içerikte beğeni/kaydetme/takip/yorum —
girişsiz de "çalışıyordu", bu localStorage'a yazdığı için):
- Prompt oluşturma/remix/kopyalama/isteğe yanıt verme (`/create`) — giriş
  yapılmamışsa form hiç render edilmiyor, "giriş yap / hesap oluştur"
  ekranı gösteriliyor.
- İstek oluşturma (`/requests/new`) — Bölüm 21 Faz 5'in bilinçli "giriş
  şart değil" kararı **tersine çevrildi**: mock/local istek kalmadığından
  bu artık korunacak "var olan bir özellik" değil, kaldırılan bir
  kategorinin doğal sonucu.
- Beğenme, kaydetme, takip etme, yorum yapma, mesaj gönderme, prompt silme
  — hepsi zaten `canLike`/`canSave`/`canFollow`/giriş kontrolleriyle
  gerçek hedefte girişe bağlıydı (Bölüm 21 Faz 3-6); artık İSTİSNASIZ her
  hedef gerçek olduğundan bu kural her yerde geçerli.
- **Okuma hâlâ herkese açık:** Ana Sayfa, Keşfet, prompt/istek/profil/
  etiket detay sayfaları, arama — hiçbiri girişe kilitlenmedi, RLS zaten
  bunları herkese açık okunur yapıyor (Bölüm 19).

**Profil içerik menüsü artık gerçekten siliyor, gizlemiyor:**
`ProfileContentMenu`/`ProfileContentGrid` "Profilimden gizle" yerine
"Sil" seçeneği sunuyor — `deleteRealPrompt` ile gerçek, kalıcı bir DELETE
tetikliyor (iki tıklamalı onay, RLS sahiplik kontrolü). Bölüm 12/14'ün
"mock veri silinemez, yalnızca gizlenebilir" kısıtı ortadan kalktı çünkü
artık her prompt gerçek ve silinebilir bir satır.

**Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ `*.supabase.co`'ya
erişimi engellediğinden gerçek bir uçtan uca kullanıcı testi burada
yapılamadı (önceki her fazda olduğu gibi). Bunun yerine: (1) `npx tsc
--noEmit`, `npm run lint` ve tam `npm run build` (statik export, artık
yalnızca 20 gerçek rota — mock'un ürettiği 90+ build-zamanı sayfa tamamen
kalktı) sıfır hatayla geçti; (2) yeni bir Playwright taraması, Supabase'e
hiç erişilemezken (her istek `ERR_TUNNEL_CONNECTION_FAILED` ile
başarısız oluyor) 19 farklı gerçek-veri rotasını (`/`, `/discover`,
`/search`, `/saved`, `/following`, `/notifications`, `/messages`,
`/create`, `/requests`, `/requests/new`, `/login`, `/signup`, `/settings`,
`/profile/edit`, `/prompts/local`, `/requests/local`, `/profile/real`,
`/messages/local`, `/tags/local`) ziyaret edip sıfır yakalanmamış JS
istisnası (`pageerror`) doğruladı — uygulama her yerde zarifçe boş/hata
durumuna düşüyor, hiçbir yerde çökmüyor. Gerçek bir Supabase projesine
karşı canlı doğrulama (arama gerçekten sonuç döndürüyor mu, remix zinciri
doğru çözülüyor mu, vb.) yine yalnızca kullanıcının kendi ortamında
yapılabilir — bu, Bölüm 21'in tamamında tekrarlanan, dürüstçe belirtilmiş
aynı sınırlama.

**Bilinen sorunlar / bilinçli basitleştirmeler:**
- **N+1 sorgu deseni hâlâ duruyor** (Bölüm 21 Faz 3'ten beri bilinen
  sınırlama) — her `LikeButton`/`SaveButton`/`FollowButton` kendi ayrı
  sorgusunu tetikliyor.
- **"Takip Ettiklerim" ve "Öne Çıkan Yaratıcılar"/Keşfet akışı, tam
  sayfalama olmadan yalnızca son ~60 promptun/isteğin önbelleğine
  dayanıyor** (`fetchRecentPublishedPrompts`/`fetchRecentRequests`'in
  limiti) — gerçek içerik hacmi arttıkça bu genişletilmesi gereken bir
  sınır.
- **Arama basit bir `ilike` alt-dize eşleşmesi**, sıralama/skorlama/typo
  toleransı yok — gerçek bir "relevance" araması Postgres full-text search
  veya harici bir arama servisi gerektirir.
- **Remix zinciri her seviye için ayrı bir fetch yapıyor**
  (`fetchRemixChain`) — sığ zincirlerde (pratikte hep öyle) sorun değil,
  çok derin bir zincirde yavaş olabilir.
- **Realtime hâlâ yok** (Bölüm 21 Faz 6'nın bilinen sınırlaması) — artık
  uygulamadaki TEK mesajlaşma yolu olduğundan bu sınırlama daha görünür:
  karşı tarafın mesajı sayfa yeniden ziyaret edilene kadar görünmüyor.
- **Bildirimler gerçekten üretilmiyor** (yukarıda açıklandı) — `/notifications`
  her zaman boş, bu davranış artık istisnasız her ziyaretçi için geçerli.

### 9.2 Prompt İstekleri / Yanıt Sistemi sağlamlaştırması

Kullanıcının detaylı özellik isteği üzerine, Bölüm 9/10/21 Faz 5'in zaten
kurduğu istek/yanıt akışı (istek oluşturma, gerçek bir isteğe gerçek bir
prompt olarak yanıt verme, yanıt seçme) üç gerçek boşluk kapatılarak
sağlamlaştırıldı, artı iki tamamen yeni özellik eklendi: profildeki
"Prompt İstekleri" bölümü ve yanıtın profil görünürlüğü tercihi.

**Yeni migration:** `supabase/migrations/20260919150000_request_response_
workflow.sql` — ayrıntı ve yerel Postgres 16'da gerçekten çalıştırılıp
doğrulanan tam senaryo listesi `supabase/README.md`'de. Özet:
- `prompts.show_on_profile` (varsayılan `true`) — yeni kolon.
- `prompt_requests.closed_by_owner` — yeni kolon (manuel kapatma ile
  seçim sonucu otomatik kapanmayı ayırt etmek için).
- `prompt_requests_status_shape` CHECK kısıtı — durum/seçili yanıt
  ilişkisini veritabanı seviyesinde tutarlı tutar.
- `validate_prompt_response_target()` (BEFORE INSERT, `prompts`) — kapalı/
  yanıtlanmış bir isteğe yeni yanıt eklenmesini **sunucu tarafında**
  reddeder (önceden yalnızca "Yanıtla" butonu gizleniyordu, gerçek bir
  engel yoktu).
- `validate_selected_response()` (BEFORE UPDATE, `prompt_requests`) —
  seçilen yanıtın gerçekten o isteğe ait olduğunu zorlar; RPC'yi atlayan
  doğrudan bir UPDATE için bile geçerli.
- `select_prompt_request_response(request_id, response_prompt_id)` — yeni
  RPC fonksiyonu, yanıt seçme/değiştirme/kaldırmayı tek, atomik bir
  işlemde yapar (bkz. aşağıda).
- `notify_new_request_response()`/`notify_selected_response()` —
  `SECURITY DEFINER` trigger'lar, gerçek bildirim üretir (bkz. aşağıda).

**Kapalı/yanıtlanmış isteğe yeni yanıt engeli artık gerçek:**
`CreatePromptForm`'un `?answerRequest=` modu, hedef isteğin `status`'unu
kontrol edip kapalıysa formu hiç göstermeden "Bu istek kapandı, artık yeni
yanıt kabul edilmiyor." ekranını gösteriyor (istemci tarafı, hızlı geri
bildirim için) — ama asıl garanti `validate_prompt_response_target`
trigger'ından geliyor: bir yarış durumunda (sayfa açıkken istek kapanırsa)
veya doğrudan API çağrısıyla bu kontrolü atlamaya çalışan biri için bile
INSERT veritabanı seviyesinde reddediliyor, aynı Türkçe mesajla.

**Durum gösterimi sadeleştirildi — artık yalnızca iki görünür durum:**
`prompt_requests.status` hâlâ üç değerli (`open`/`answered`/`closed`,
şema değişmedi — "gereksiz ikinci bir durum sistemi kurma" talimatına
uyarak), ama arayüzde `answered` VE `closed` ikisi de aynı şekilde
**"Kapandı"** (kırmızı `Badge variant="danger"`) gösteriliyor, yalnızca
`open` **"Açık"** (yeşil `Badge variant="success"`) — `RequestCard`,
`RequestDetailView` ve yeni profil "Prompt İstekleri" sekmesi aynı
`STATUS_LABELS`/`STATUS_VARIANTS`'ı (`request-card.tsx`'ten export
edildi) paylaşıyor, tutarlılık garantili. Yeni `Badge` variant'ları
(`success`/`danger`) eklendi — bilinçli olarak Tailwind'in `dark:`
varyantını KULLANMIYOR, çünkü bu projenin koyu teması `prefers-color-
scheme` değil, manuel `.dark` class toggle'ı (`ThemeProvider`) — Tailwind
v4'te `dark:` varsayılan olarak yalnızca işletim sistemi tercihini eşler,
projeye özel `@custom-variant dark` tanımlanmadığı için `dark:` sınıfları
burada sessizce hiç uygulanmazdı. Bunun yerine, projenin hata metinlerinde
zaten kullandığı desenle aynı şekilde tek tonlu `text-red-600`/
`text-green-600` kullanıldı.

**Yanıt seçme/değiştirme/kaldırma artık atomik ve tam olarak doğrulanmış:**
`selectRealRequestResponse` artık doğrudan bir `.update()` değil,
`select_prompt_request_response` RPC'sini çağırıyor. Bu, hem daha güvenli
(sahiplik ve "yanıt bu isteğe mi ait" kontrolleri veritabanında,
istemciye güvenilmeden) hem de **manuel kapatma ile seçim sonucu otomatik
kapanmayı doğru ayırt ediyor**: bir isteği manuel kapattıktan SONRA bir
yanıt seçip sonra o seçimi kaldırırsanız, istek yanlışlıkla "Açık"a değil
doğru şekilde "Kapandı"ya (manuel durumuna) geri dönüyor — bu tam olarak
kullanıcının şartnamesinin vurguladığı ("seçimi kaldırmak manuel kapatma
durumunu yanlışlıkla açığa çevirmemeli") senaryo, ve yerel Postgres'te
gerçekten test edilip doğrulandı (bkz. `supabase/README.md`).
`RequestDetailView`'daki "İsteği kapat/aç" butonu artık yalnızca hiçbir
yanıt seçili değilken gösteriliyor (bir seçim varken durum yalnızca
seçimle yönetilir) — veritabanındaki CHECK kısıtı zaten bu kombinasyonu
reddediyor, buton gizleme yalnızca kullanıcı deneyimini netleştiriyor.

**Yanıt seçme/kaldırma artık gerçek bir onay adımı içeriyor:** Şartname
bir "onay penceresi" (modal) istiyordu; bu projede hiç modal/dialog
bileşeni yok, bu yüzden CLAUDE.md'nin "gereksiz yeni sistemler kurma"
ilkesine uyarak var olan "iki tıklamalı onay" deseni (zaten "İsteği sil"
ve prompt silme menüsünde kullanılıyor) yeniden kullanıldı: "Yanıtı seç"/
"Seçimi kaldır"a ilk tıklama şartnamenin istediği tam metni (ör. "Bu
yanıtı seçmek istediğine emin misin? Seçtiğinde istek kapatılacak ve yeni
yanıt kabul edilmeyecek.") + Vazgeç/onay butonlarını satır içinde
gösteriyor, ikinci tıklama işlemi gerçekleştiriyor. Fonksiyonel olarak
şartnamenin istediği "onay adımı"nı karşılıyor, yalnızca bir modal overlay
değil satır içi bir genişleme.

**Profildeki "Prompt İstekleri" bölümü — YENİ:** `ProfileView`'a yeni bir
"Prompt İstekleri" sekmesi eklendi (hem kendi hem başka bir kullanıcının
profilinde — istekler, promptların aksine hiç taslak/gizli kavramına sahip
değil, RLS zaten hepsini herkese açık okunur yapıyor, bu yüzden başka bir
kullanıcının profilinde de göstermek güvenli). Yeni
`fetchRequestsByAuthor(authorId)` (`lib/supabase/requests.ts`) — profil
sorgusu artık promptlar ve istekler için AYRI, veri katmanında gerçekten
ayrıştırılmış iki sorgu (`fetchPromptsByAuthor` + `fetchRequestsByAuthor`),
yalnızca CSS ile gizlenen tek bir liste değil — şartnamenin özellikle
vurguladığı nokta. Kartlar mevcut `RequestCard`/`RequestList` bileşenleri
yeniden kullanılarak render ediliyor (istek detayı, keşfet ve `/requests`
ile birebir aynı görünüm — tutarlılık). Boş durumda tam olarak şartnamenin
istediği metin gösteriliyor: "Henüz prompt isteği oluşturulmamış."

**Yanıtın profil görünürlüğü tercihi — YENİ:** `CreatePromptForm`'un
`?answerRequest=` modunda, yalnızca o modda, yeni bir "Bu yanıt profilimde
görünsün mü?" seçici var (iki radyo seçenek, şartnamenin tam metniyle).
"Profilimde paylaş" (varsayılan) → `show_on_profile = true`; "Profilimde
paylaşma" → `false`. Bu tercih `prompts.show_on_profile`'a kalıcı olarak
yazılıyor ve veri katmanında (`fetchRecentPublishedPrompts`,
`fetchPromptsByAuthor`, `fetchPromptsByAuthors`, `searchPrompts` —
`lib/supabase/prompts.ts`'teki yeni `filterProfileVisible()` yardımcı
fonksiyonu ile) uygulanıyor: `show_on_profile = false` olan bir yanıt
normal profil/akış/keşfet/arama sonuçlarından çıkarılıyor (kendi
profilinin sahibi için bile — "profilimi dağınıklaştırma" tercihinin tüm
amacı bu), ama isteğin kendi yanıt listesinde (`fetchPromptsForRequest`)
ve kendi detay sayfasında (`fetchPromptById`) HER ZAMAN görünmeye devam
ediyor — silme değil, yalnızca "normal gönderi" görünürlüğü. **Bilinçli
teknik karar:** bu filtre PostgREST sorgusuna ikinci bir `.or(...)` olarak
DEĞİL, sonuçlar map'lendikten SONRA istemci tarafında uygulanıyor —
PostgREST'in tek bir `.or()` grubunu düz kolon filtreleriyle AND'lediği
belgeli, ama iki bağımsız `.or()`'u art arda zincirlemenin net, doğrulanmış
bir birleştirme davranışı yok, ve bu sandbox'ta gerçek bir Supabase
projesine karşı test edilemediğinden riske girilmedi.

**Bildirimler artık gerçekten üretiliyor (bu iki olay için):** Bölüm
19'dan beri `notifications` tablosuna hiçbir client insert politikası
yoktu (kasıtlı güvenlik kararı) ve hiçbir sunucu tarafı üretici de yoktu —
bu yüzden `/notifications` her zaman boştu. Bu migration'daki iki
`SECURITY DEFINER` trigger artık gerçek satırlar yazıyor: bir isteğe yeni
bir yanıt geldiğinde istek sahibine, bir yanıt seçildiğinde (ya da
değiştirildiğinde) yeni seçilen yanıtın sahibine. `fetchNotificationsForUser`
zaten Bölüm 21'den beri doğru şekilde yazılmıştı (yalnızca yazacak veri
yoktu) — bu yüzden `/notifications` artık bu iki olay için gerçekten dolu
görünecek, kod tarafında ekstra bir değişiklik gerekmedi. Kendi isteğine
kendi yanıtını verme/seçme durumunda kendi kendine bildirim
OLUŞTURULMUYOR (trigger'larda açık kontrol var). Aynı seçimi tekrar
yapmak (no-op) mükerrer bildirim oluşturmuyor (`IS DISTINCT FROM`
koruması, gerçekten test edildi).

**Nasıl doğrulandı:** Bu sandbox'ın ağ politikası hâlâ `*.supabase.co`'ya
erişimi engellediğinden gerçek projeye karşı test edilemedi. Bunun yerine:
(1) Yeni migration, yerel bir Postgres 16 örneğine önceki 9 migration'la
birlikte gerçekten uygulandı ve üç test kullanıcısıyla (istek sahibi +
iki yanıtlayan) tam senaryo — yeni yanıt → bildirim, yanıt seçme →
bildirim + durum değişimi, kapalı isteğe yanıt reddi, sahibi olmayanın
seçim denemesinin reddi, yanlış isteğe ait yanıtın reddi, seçim kaldırma
→ doğru duruma dönüş, **manuel kapatma + seçim + seçim kaldırma
etkileşiminin kritik testi**, RPC'yi atlayan doğrudan UPDATE'in yine de
reddedilmesi, mükerrer bildirim olmaması, CHECK kısıtı ihlallerinin
reddedilmesi — hepsi gerçekten çalıştırılıp doğrulandı (tam liste
`supabase/README.md`'de). (2) `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (20 rota, değişmedi) sıfır hatayla geçti. (3) Ağ
seviyesinde taklit edilmiş Supabase REST yanıtlarıyla Playwright: açık bir
isteğe yanıt formunda profil görünürlüğü seçicisinin göründüğü ve kapalı
banner'ının GÖRÜNMEDİĞİ; kapalı bir isteğe yanıt formunda tam tersi
(kapalı ekranı gösterip formu hiç göstermediği); gerçek bir profilde
"Prompt İstekleri" sekmesinin göründüğü, tıklanınca hem açık hem kapalı
isteğin doğru "Açık"/"Kapandı" rozetleriyle listelendiği — hepsi sıfır JS
hatasıyla doğrulandı. (4) Mock/mevcut sayfaların hâlâ Supabase'e hiç
erişilemezken çökmediği 19 sayfalık dayanıklılık taraması yeniden
çalıştırıldı, bozulma yok.

**Bilinen sorunlar / bilinçli basitleştirmeler:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** — yukarıda
  açıklanan sandbox ağ kısıtı yüzünden; kullanıcı `20260919150000_
  request_response_workflow.sql`'i Dashboard'da uygulayıp bizzat denemeli
  (bkz. `supabase/README.md`).
- **"Bu yanıt seçildi" etiketi PromptCard'ın kendisine değil, yalnızca
  istek detay sayfasındaki yanıt listesine eklendi** — kartın kendisi
  (profil grid'i, ana akış, keşfet gibi başka bağlamlarda göründüğünde)
  bu bilgiyi göstermiyor, çünkü bunu bilmek için kartın hangi isteğin
  hangi seçili yanıtı olduğunu ek bir sorguyla (ya da join'le) bilmesi
  gerekirdi — N+1 sorgu riskini artırmamak için bu kapsam dışı bırakıldı.
  İstek detay sayfası (asıl önemli olan yer) doğru gösteriyor.
- **Seçim kaldırma için bildirim yok** — şartname bunu zaten "gerekli
  görülüyorsa" diye koşullu bıraktı; yeni bir seçim/değişiklik zaten
  bildirim üretiyor, yalnızca "seçimin kaldırıldığı" ayrı bir bildirim
  eklenmedi (düşük değer, kimseye gerçek bir eylem çağrısı taşımıyor).
- **`show_on_profile` filtresi istemci tarafında uygulanıyor, sorguya
  değil** (yukarıda "bilinçli teknik karar" açıklandı) — bu, `limit`
  uygulanan sorgularda (`fetchRecentPublishedPrompts` vb.) teorik olarak
  sayfa başına dönen öğe sayısını `limit`'in altına düşürebilir (gizli
  yanıtlar filtrelendiği için) — Bölüm 21'in zaten bilinen "tam sayfalama
  yok" sınırlamasıyla aynı kategoriden, kasıtlı olarak bu görevin
  kapsamına alınmadı.
- **`fetchSavedPrompts`/`fetchLikedPrompts` bu görünürlük filtresini
  uygulamıyor** — bir kullanıcı gizlenmiş bir yanıtı beğenir/kaydederse
  kendi Kaydedilenler/Beğeniler sekmesinde yine de görünür. Bilinçli bir
  kapsam kararı: şartname yalnızca "normal profil gönderileri/akış/keşfet"
  diyor, beğeni/kaydetme ayrı bir özellik.
- **İstek düzenleme hâlâ yok** (Bölüm 21 Faz 5'ten beri bilinen, bu görevin
  kapsamı dışında bırakılan bir sınırlama) — yalnızca kapat/aç/sil.
- **Grup halinde/toplu yanıt seçme yok** — her seferinde tek bir yanıt
  seçilip/kaldırılıyor, şartname de zaten böyle istiyor (bir istekte
  yalnızca bir seçili yanıt).

### 9.3 Gönderi Kartları UI Yenileme

Kullanıcının referans görsellerle (Lavender Studio diliyle uyumlu, üstte
kullanıcı başlığı + kebab menü, remix/istek bağlamları için lavanta kutu,
altta "Kullanılan prompt" kutusu) verdiği detaylı tasarım isteği üzerine,
normal/remix/istek-yanıtı gönderi kartlarının tamamı tek bir ortak bileşen
ailesi etrafında yeniden tasarlandı — üç ayrı kart sistemi değil, aynı
`ImagePromptCard`/`TextPromptCard`'ın paylaştığı yeni alt bileşenler:

- **`features/prompts/post-header.tsx`** (yeni) — her kartın üstünde
  avatar + görünen ad + göreli zaman (+ yanıt ise " · Yanıt paylaştı") +
  üç nokta menüsü. Yazar bilgisi daha önce kart FOOTER'ındaydı (bkz. Bölüm
  14); artık başa taşındı — `PromptCardFooter` yalnızca etkileşim
  ikonlarını (beğeni/yorum/remix/kaydet/paylaş) içeriyor. Şemada
  "doğrulanmış kullanıcı" kavramı hiç yok (`profiles` tablosunda böyle bir
  kolon yok) — referans görseldeki mavi tik bilinçli olarak eklenmedi
  (CLAUDE.md'nin "backend'de olmayanı çalışıyormuş gibi gösterme" kuralı).
- **`features/prompts/post-menu.tsx`** (yeni, eski `ProfileContentMenu`'nun
  yerine geçti ve profil galerisiyle sınırlı kalmaktan çıkıp HER karta
  taşındı) — herkese "Bağlantıyı kopyala"; yalnızca gönderinin gerçek
  sahibine (`useAuth()` ile karşılaştırılıyor) ek olarak "Kopyasını
  oluştur" ve gerçek, kalıcı "Sil" (iki tıklamalı onay). Başkasının
  gönderisinde rapor/engelle gibi seçenekler YOK — bu özellik (Bölüm 22)
  henüz hiç yazılmadı, sahte bir menü öğesi eklenmedi.
- **`features/prompts/post-context.tsx`** (yeni) — `RemixContext` ve
  `RequestResponseContext`: kart başlığının hemen altında, gönderinin
  kendi başlığından önce gösterilen lavanta, sol mor şeritli kutular.
  Eskiden yalnızca düz metin bir bağlantı olan `RemixSourceLink`'in
  (silindi) yerini aldı — artık kaynağın gerçek küçük önizlemesini
  (remix: küçük görsel + başlık + yazar), isteğin gerçek durumunu (Açık/
  Kapandı rozeti, `request-card.tsx`'in `STATUS_LABELS`/`STATUS_VARIANTS`'ı
  paylaşılarak) ve seçiliyse "Bu yanıt seçildi" etiketini gösteriyor — bu
  üçüncüsü, aynı fetch'ten bedavaya geldiği için Bölüm 21 Faz 3'ten beri
  bilinen "kartın kendisi seçili yanıtı göstermiyor" sınırlamasını da
  kapattı (yalnızca istek detay sayfasında gösterilmeye devam etmiyor,
  artık her yerde).
- **`features/prompts/prompt-preview-box.tsx`** (yeni) — her kartta aynı
  "Kullanılan prompt" kutusu (terminal ikonu + kısaltılmış prompt metni +
  "Promptun tamamını gör" bağlantısı); önceden yalnızca metin/video/kod/
  müzik kartlarında vardı, artık görsel kartlarda da var, ve iki ayrı
  kopya yerine tek bir bileşen.
- Medya artık kartın kendi kenarına değil (üstte artık başlık olduğundan),
  kart içinde `px-4` ile içeri çekilmiş, kendi `rounded-md` köşeleri olan
  bir blok — referans görsellerdeki "yuvarlatılmış, hafif lavanta yüzeyli"
  görünüm bunun doğal sonucu.
- **`profile-content-grid.tsx`** sadeleşti: eskiden kartın üzerine
  `position: absolute` ile bindirilen ayrı bir `ProfileContentMenu`
  overlay'i vardı (yalnızca kendi profilinde); artık menü kartın kendi
  başlığının parçası olduğundan grid yalnızca `onDeleted`'i doğrudan
  `PromptCard`'a geçiyor.
- `prompt-detail-view.tsx` de aynı context kutularını kullanacak şekilde
  güncellendi (kendi ayrı `isSelectedAnswer` state/effect'i silindi — artık
  gereksiz, kutu bunu kendi başına hesaplıyor) ve başlığın yanına aynı
  `PostMenu` eklendi.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Statik export
`npx serve` ile (GitHub Pages basePath'i taklit eden bir symlink
düzeniyle) yerel olarak sunulup, Supabase REST uç noktaları ağ seviyesinde
taklit edilerek Playwright ile gerçek bir tarayıcıda test edildi: normal/
remix/istek-yanıtı kartlarının üçü de masaüstü+mobil × açık+koyu tema
kombinasyonlarının tamamında doğru render edildi (context kutuları, rozet,
"Kullanılan prompt" kutusu, footer aksiyonları); kod içerik türü kartı
medyasız doğru çalıştı; kendi profilindeki kart menüsü gerçekten
"Bağlantıyı kopyala / Kopyasını oluştur / Sil" gösterdi; remix zinciri ve
yorum bölümü dahil detay sayfaları bozulmadı — hepsi sıfır JS hatasıyla.
Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 21'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama).

**Bilinen sınırlamalar:**
- Kart menüsünde başkasının gönderisi için rapor/engelle seçeneği yok
  (Bölüm 22 henüz yazılmadı).
- "Doğrulanmış kullanıcı" rozeti eklenmedi (şemada karşılığı yok).
- Kart menüsünden silme, yalnızca profil galerisinde `onDeleted` ile listeyi
  günceller; feed/keşfet gibi diğer bağlamlarda kendi gönderini silersen
  DB'den gerçekten silinir ama o sayfadaki kart yenileme yapılmadan
  kaybolmaz (sayfa yenilenince görünür) — düşük öncelikli, kozmetik.
- `RequestCard` (bir isteğin kendisini temsil eden kart, bir yanıtı değil)
  bu görevin kapsamında değildi, dokunulmadı.

### 9.4 Yorum sisteminin güçlendirilmesi: sınırsız iç içe yanıt + bağımsız beğeni

Kullanıcının detaylı isteği üzerine yorum sistemi düz (yalnızca "ana yorum
+ tek seviye yanıt") yapıdan, herhangi bir yoruma VEYA yanıta yeniden yanıt
verilebilen, sınırsız derinlikte bir ağaca dönüştürüldü — artı her seviyede
bağımsız beğeni ve bağımsız göster/gizle toggle'ı.

**Önce mevcut mimari incelendi — büyük bir kısmı zaten hazırdı:**
`prompt_comments.parent_id` (Bölüm 18) zaten kendi tablosuna referans veren
bir sütundu ve `on delete cascade` ile herhangi bir derinlikte zincirlemeyi
zaten destekliyordu — yalnızca frontend her zaman `parentId` ilişkisini tek
seviyeyle (yorum → düz yanıt listesi) sınırlı işliyordu. Bu yüzden şema
tarafında "sınırsız derinlik" için hiçbir yeni tablo/kolon gerekmedi;
gerçek eksik yalnızca (a) her yorum/yanıt için bağımsız bir beğeni sistemi
ve (b) arayüzün bu var olan ağacı gerçekten iç içe render etmesiydi.

**Yeni migration:** `supabase/migrations/20260919160000_comment_likes_and_
notifications.sql`:
- `prompt_comments.like_count` — yeni denormalize sayaç kolonu, `prompts.
  like_count` ile aynı yaklaşım.
- Yeni `comment_likes` tablosu — `prompt_likes` ile birebir aynı desen
  (bileşik birincil anahtar `(comment_id, user_id)` aynı kullanıcının aynı
  yorumu iki kez beğenmesini veritabanı seviyesinde imkansız kılıyor),
  kendi `SECURITY DEFINER` sayaç trigger'ı (`handle_comment_like_change`)
  ile — bir yanıtın beğenilmesi ne ana yorumun ne gönderinin beğeni
  sayısını etkiliyor, tamamen bağımsız.
- RLS: `prompt_likes` ile birebir aynı — herkese açık okuma, yalnızca
  kendi adına ekleme/silme.
- İki yeni `SECURITY DEFINER` bildirim trigger'ı (Bölüm 19'dan beri
  `notifications`'a client insert izni yok, bu yüzden gerçek bildirim
  üretimi yalnızca böyle sunucu tarafı trigger'larla mümkün — 20260919150000
  ile aynı desen): `notify_comment_reply` (bir yoruma VEYA bir yanıta yeni
  bir yanıt geldiğinde üst mesajın sahibine — ikisi ayrı durum değil, aynı
  trigger: `parent_id` dolu her INSERT), `notify_comment_like` (bir yorum/
  yanıt beğenildiğinde sahibine). İkisi de kendi kendine bildirim
  oluşturmuyor (aktör = alıcı kontrolü). `comment_reply`/`like` bildirim
  tipleri `notifications.type` CHECK kısıtında zaten Bölüm 18'den beri
  vardı, yalnızca hiç tetiklenmiyorlardı.

**Yeni/güncellenen dosyalar:**
- `src/types/index.ts` — `PromptComment.likeCount: number` eklendi.
- `src/lib/supabase/comments.ts` — `COMMENT_SELECT`/`mapCommentRow`
  `like_count`'u da okuyup `likeCount`'a eşliyor.
- Yeni `src/lib/supabase/comment-likes.ts` — `fetchLikedCommentIds`
  (TEK bir toplu sorgu, `.in("comment_id", ids)` ile — bir ağaçtaki HER
  yorum için ayrı `fetchIsLiked` çağrısı yapmak yerine; bir yorum ağacı
  bir feed sayfasından çok daha fazla düğüme sahip olabileceğinden bu
  N+1'i özellikle önlemek gerekiyordu), `likeComment`/`unlikeComment`.
- Yeni `src/features/prompts/comment-node.tsx` — `CommentNode`: tek bir
  özyinelemeli (recursive) bileşen, hem ana yorumu hem HERHANGİ bir
  derinlikteki yanıtı aynı şekilde render ediyor (kendi avatar/isim/zaman/
  metin, bağımsız beğeni butonu+sayacı, "Yanıtla" butonu, varsa kendi
  "N yanıtı göster"/"Yanıtları gizle" toggle'ı, varsa kendi doğrudan
  çocuklarını tekrar `CommentNode` ile render ediyor). Görsel girinti
  6 seviyeden sonra büyümeyi durduruyor (mobilde okunabilirlik için) —
  bu noktadan sonra her düğüm, kime yanıt verdiğini kaybetmemek için
  metninin başında küçük bir "@kullanıcıadı" ipucu gösteriyor.
- `src/features/prompts/comment-section.tsx` — tamamen yeniden yazıldı:
  artık yalnızca üst seviye/doğrudan-yanıt iki listesi tutmuyor, `comments`
  dizisinden `childrenByParent`/`commentsById` haritalarını (`useMemo`)
  türetip ağacı `CommentNode`'a besliyor. Beğeni durumu (`likedIds`,
  `likeCounts`, çift-tıklama koruması için `pendingLikeIds`), göster/gizle
  durumu (`expandedIds`, her düğüm bağımsız — bir dalı kapatmak diğerlerini
  etkilemiyor) ve yanıt yazma durumu (`replyingTo`/`replyDraft` — tek bir
  state, "Yanıtla"ya başka bir yerden basılırsa yazma alanı doğru hedefe
  geçiyor) burada tutuluyor, optimistik güncelleme + başarısızlıkta geri
  alma ile (`useLikeState`'teki aynı desen). Yeni bir yanıt gönderildiğinde
  üst düğüm otomatik `expandedIds`'e ekleniyor ve yeni düğüme
  `scrollIntoView` ile kaydırılıyor (`nodeRefs` + `pendingScrollToId`).

**Bilinçli tasarım kararları:**
- "N yanıtı göster" sayısı her zaman DOĞRUDAN çocuk sayısı — toplam alt
  ağaç boyutu değil (şartnamenin özellikle uyardığı ayrım). Bir dalı
  kapatmak yalnızca o düğümün `expandedIds`'ten çıkmasıyla oluyor, diğer
  kardeşlerin durumunu hiç etkilemiyor.
- Bu ilk sürümde yorum düzenleme/silme arayüzü bilinçli olarak eklenmedi
  (RLS zaten hazırdı, ARAYÜZ yoktu) — **bu karar sonradan tersine
  çevrildi, bkz. Bölüm 9.5.**
- Bir gönderiye yapılan İLK (üst seviye) yorum, gönderi sahibine bildirim
  ÜRETMİYOR — şartnamenin 11. bölümü yalnızca üç olayı listeledi (yoruma
  yanıt, yanıta yanıt, yorum/yanıt beğenisi), gönderiye doğrudan yorum
  bunların dışında; kapsam dışına taşmamak için eklenmedi.

**Nasıl doğrulandı:** Yeni migration, yerel bir PostgreSQL 16 örneğine
önceki 10 migration'la birlikte gerçekten uygulandı (`DROP ROLE`/
`DROP DATABASE` ile temiz bir durumdan) ve üç test kullanıcısıyla 14
senaryo gerçekten çalıştırılıp doğrulandı: 4 seviyeli bir yanıt zinciri
(Mehmet ana yorum → Can yanıt → Aylin yanıta yanıt → Mehmet yanıta yanıtın
yanıtı) doğru oluşturuldu ve `comment_count` (gönderi düzeyinde) doğru 4'e
çıktı; her düğümün `like_count`'u tamamen bağımsız artıp azaldı (bir
düğümü beğenmek komşu düğümleri hiç etkilemedi); aynı kullanıcının aynı
yorumu iki kez beğenmesi veritabanı seviyesinde reddedildi; beğeniyi geri
alma sayaç düşürdü; kendi kendine beğeni/yanıt bildirim ÜRETMEDİ; 3 gerçek
yanıt + 2 gerçek beğeni tam olarak 5 doğru bildirim satırı üretti (ne
eksik ne fazla); `anon` rolü yorumları/beğenileri okuyabildi ama hiçbirini
yazamadı; `authenticated` bir kullanıcı BAŞKA bir kullanıcı adına beğeni
sahteciliği yapamadı (`WITH CHECK` reddetti) ve başkasının beğenisini
silemedi (0 satır etkilendi, satır hayatta kaldı); yetkisiz bir kullanıcının
başkasının yorumunu düzenleme denemesi sessizce 0 satır etkiledi (RLS);
istek yorumlarında da aynı zincir/bildirim mekanizması doğru çalıştı.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase
REST yanıtlarıyla Playwright'ta gerçek bir tarayıcıda 14 senaryo daha
doğrulandı: derinlik-1 yanıt varsayılan olarak GİZLİ başlıyor (toggle
"1 yanıtı göster" gösteriyor), açılınca görünüyor, derinlik-2 yanıt hâlâ
ayrı ve bağımsız gizli kalıyor, kendi toggle'ıyla açılıyor; her düğümün
beğeni sayısı birbirinden bağımsız görünüyor; "Yanıtla"ya basınca doğru
kullanıcı adını gösteren banter açılıyor ve doğru üst düğüme yanıt
gönderiyor; yeni yanıt sayfa yenilenmeden görünüyor ve "Yorumlar (N)"
başlığı doğru artıyor; bir beğeniyi geri almak sayaç azaltıyor VE sayfa
yenilendikten sonra da kalıcı kalıyor; masaüstü+mobil × açık+koyu tema
kombinasyonlarında yatay taşma veya JS hatası yok. Gerçek bir Supabase
projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı yüzünden
yapılamadı (Bölüm 21'den beri tekrarlanan, dürüstçe belirtilen aynı
sınırlama) — kullanıcının migration'ı Dashboard'da uygulayıp bizzat
denemesi gerekiyor.

**Bilinen sınırlamalar:**
- Çok derin (>6 seviye) yanıt zincirlerinde görsel girinti sabitleniyor,
  yalnızca "@kullanıcıadı" ipucuyla ilişki gösteriliyor — bu bilinçli bir
  okunabilirlik/mobil kararı, veri modelinde bir sınır yok (istenildiği
  kadar derin gerçekten oluşturulabiliyor, yalnızca görünüm sadeleşiyor).
- Bir gönderiye doğrudan yapılan ilk yorum için bildirim yok (yukarıda
  "bilinçli karar" olarak açıklandı, kapsam dışı bırakıldı).
- Beğeni durumu için hâlâ bir toplu sorgu var (`fetchLikedCommentIds`) ama
  yorum METİNLERİNİN kendisi sayfa başına tek seferde tam olarak çekiliyor
  (sayfalama yok) — çok büyük (yüzlerce yorumluk) bir ağaçta bu ileride
  bir sayfalama/lazy-load gerektirebilir; bu projenin genelinde zaten
  bilinen "tam sayfalama yok" sınırlamasıyla aynı kategoriden.

### 9.5 Yorum/yanıt düzenleme ve güvenli silme

Bölüm 9.4'te bilinçli olarak dışarıda bırakılan yorum düzenleme/silme
arayüzü, kullanıcının açık isteği üzerine eklendi.

**Kritik mimari sorun ve çözümü — silme, alt yanıtları kaybetmemeli:**
`prompt_comments.parent_id` kendine referans veren bir sütun ve `on delete
cascade` ile tanımlı (Bölüm 18) — bu, bir yorumu DOĞRUDAN silmenin onun
TÜM alt yanıt ağacını da beraberinde sileceği anlamına geliyordu (tam
olarak önceki oturumun kullanıcı şartnamesinin uyardığı "silinen yorumun
alt yanıtlarını sessizce kaybetme" tuzağı). Çözüm istemci tarafında bir
"önce çocuğu var mı diye kontrol et, sonra karar ver" dalı OLARAK
kurulmadı — bu bir yarış durumuna açık olurdu (silme anında araya başka
bir kullanıcının yeni bir yanıtı girebilir). Bunun yerine yeni bir
migration (`20260919170000_comment_edit_delete.sql`) veritabanı seviyesinde
bir `BEFORE DELETE` trigger'ı (`handle_comment_delete`) ekledi: bir yorumun
gerçek alt yanıtları varsa, DELETE'i iptalleyip yerine bir "soft delete"
(`deleted_at` damgalama + `body`'yi boşaltma) UPDATE'i uyguluyor; alt
yanıtı yoksa DELETE olduğu gibi geçip satırı gerçekten siliyor. Frontend
HER ZAMAN aynı basit `DELETE FROM prompt_comments WHERE id = ...`
çağrısını yapıyor (`deleteRealPrompt` ile birebir aynı desen) — hangi
davranışın uygulanacağına veritabanı, tek ve atomik bir işlemde, hiçbir
yarış durumuna açık olmadan karar veriyor. `security invoker` (varsayılan)
yeterli: bir kullanıcı zaten kendi yorumunu silme YETKİSİNE sahipse (DELETE
RLS politikası), aynı kullanıcının kendi yorumunu güncelleme yetkisi de
zaten var (UPDATE RLS politikası) — cross-user sayaç/bildirim
trigger'larının aksine burada `SECURITY DEFINER` gerekmedi.

**Düzenleme:** Yeni `edited_at` kolonu + `BEFORE UPDATE` trigger'ı
(`handle_comment_body_edit`) — yalnızca `body` GERÇEKTEN değiştiğinde
damgalıyor (bir beğeni sayacı güncellemesi ya da yukarıdaki soft-delete
UPDATE'i `edited_at`'i hiç etkilemiyor, çünkü ikisi de `body`'yi
değiştirmiyor — silme durumunda `body` boşaltılıyor ama bu da teknik
olarak bir "değişiklik", bu yüzden trigger'ın kontrolü `body is distinct
from old.body` ile sınırlı tutuldu ve gerçekten test edildi, aşağıya
bakınız).

**Yeni/güncellenen dosyalar:**
- `src/types/index.ts` — `PromptComment.editedAt`/`deletedAt: string |
  null` eklendi.
- `src/lib/supabase/comments.ts` — `COMMENT_SELECT`/`mapCommentRow` yeni
  kolonları okuyor; yeni `updateComment(commentId, body)` (gerçek UPDATE,
  RLS zaten yalnızca gerçek sahibi geçiriyor) ve `deleteComment(commentId)`
  (gerçek DELETE — hangi sonucun (gerçek silme ya da soft-delete)
  uygulandığına yukarıdaki trigger karar veriyor).
- `src/features/prompts/comment-node.tsx` — silinmiş bir düğüm artık
  "Bu yorum silindi." yer tutucusunu gösteriyor (yazar adı korunuyor,
  beğeni/yanıtla/düzenle/sil aksiyonları gizleniyor) ama kendi alt
  yanıtlarını ve kendi "N yanıtı göster" toggle'ını olduğu gibi render
  etmeye devam ediyor. Sahibi olunan her düğümde (`tree.currentUserId ===
  comment.author.id`) "Düzenle" (gövdeyi satır içi bir textarea'ya
  çeviriyor) ve "Sil" (var olan iki tıklamalı onay deseniyle — `PostMenu`/
  `RequestDetailView`'daki aynı "Emin misin? Tekrar tıkla" kalıbı)
  eklendi. Düzenlenmiş bir yorumun zaman damgasının yanına "· düzenlendi"
  ekleniyor.
- `comment-section.tsx` — düzenleme (`editingId`/`editDraft`/`editError`/
  `isSavingEdit`) ve silme (`deleteConfirmId`/`isDeletingId`/`deleteError`)
  için yeni durum + `startEdit`/`cancelEdit`/`submitEdit`/`requestDelete`
  fonksiyonları eklendi. Silme başarılı olduğunda istemci taraf, sunucunun
  gerçek silme mi yoksa soft-delete mi uyguladığını API yanıtından
  AYIRT EDEMİYOR (`DELETE` her iki durumda da aynı şekilde başarıyla
  dönüyor) — bu yüzden istemci her zaman yorumu yerel state'te "silindi"
  olarak işaretliyor (kaldırmıyor): gerçekten silinmişse bir sonraki
  gerçek fetch'te zaten listede hiç görünmeyecek, soft-delete olmuşsa
  zaten doğru yer tutucu bu şekilde gösterilmiş oluyor — iki durum için de
  doğru, ekstra bir "hangisiydi" sorgusuna gerek yok.

**Nasıl doğrulandı:** Yeni migration, yerel bir PostgreSQL 16 örneğine
önceki 11 migration'la birlikte gerçekten uygulandı ve 6 senaryo
çalıştırıldı: kendi yorumunu düzenlemek `edited_at`'i damgaladı;
yetkisiz bir düzenleme denemesi sessizce 0 satır etkiledi (RLS); yalnızca
beğeni sayacını güncelleyen bir UPDATE `edited_at`'i HİÇ etkilemedi;
**kritik test** — alt yanıtı OLAN bir yorumu silmek satırı veritabanında
canlı tuttu (`DELETE 0` raporlandı çünkü trigger iptal etti), `body`'yi
boşalttı, `deleted_at`'i damgaladı, VE alt yanıtı hiç etkilemedi (hâlâ
tam olarak yerinde duruyor); alt yanıtı OLMAYAN bir yorumu silmek gerçekten
sildi (`DELETE 1`) ve `prompts.comment_count`'u doğru şekilde azalttı;
yetkisiz bir silme denemesi de sessizce 0 satır etkiledi. Ayrıca `npx tsc
--noEmit`, `npm run lint`, tam `npm run build` (20 rota, değişmedi) sıfır
hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
Playwright'ta gerçek bir tarayıcıda 8 senaryo daha doğrulandı: kendi
yorumunda Düzenle/Sil görünüyor, başkasının yorumunda hiç görünmüyor;
düzenleme gerçekten metni değiştirip "düzenlendi" etiketini gösteriyor;
alt yanıtı olan bir yorumu silme akışı (onay → onay) doğru "Bu yorum
silindi." yer tutucusunu gösteriyor VE alt yanıtı ("Yanıtları göster"
toggle'ı açıldığında) hâlâ tam olarak görünür bırakıyor; alt yanıtı
olmayan bir yorumu silme akışı onu sayfadan tamamen kaldırıyor — hepsi
sıfır JS hatasıyla. Gerçek bir Supabase projesine karşı canlı doğrulama
yine bu sandbox'ın ağ kısıtı yüzünden yapılamadı (tekrarlanan, dürüstçe
belirtilen aynı sınırlama).

**Bilinen sınırlamalar:**
- Silinmiş bir yorumun/yanıtın kendi alt yanıtlarına yeni bir yanıt
  verilebiliyor (bilinçli — thread'in devamı anlamlı kalsın diye), ama
  silinmiş düğümün kendisi beğenilemiyor/yanıtlanamıyor.
- İstemci, bir silme işleminin gerçek mi yoksa soft-delete mi olduğunu
  API yanıtından ayırt edemiyor (yukarıda açıklandı) — bu, sayfa
  yenilenene kadar gerçekten silinmiş bir yorumun görsel olarak "silindi"
  yer tutucusuyla kısa süre görünmeye devam etmesi anlamına gelebilir
  (yalnızca o oturumda, o sayfa görüntüsünde) — kozmetik, düşük öncelikli.

### 9.6 Bildirim sistemi: eksiksiz denetim + tamamlama

Kullanıcının çok ayrıntılı "Bildirim Sistemi: Uygulama ve Test Promptu"
talebi üzerine, önce TÜM mevcut bildirim üretim/okuma/silme kodu, TÜM
beğeni/yorum/yanıt/remix/istek/takip/mesaj kodu ve ilgili migration'lar
uçtan uca denetlendi; yalnızca bu denetimden sonra eksikler kapatıldı.
Talebin kendi sözleriyle koyduğu kural aynen izlendi: **doğru çalışan
kurallar yeniden tanımlanmadı, yalnızca gerçek eksikler/hatalar
düzeltildi.**

**AŞAMA 1 — Denetim bulguları:**
- Bildirim tablosu (Bölüm 18) ve RLS'i (Bölüm 19) zaten doğruydu:
  SELECT/UPDATE politikaları `auth.uid() = recipient_id` ile doğru
  sahiplik kontrolü yapıyordu. **Eksik: hiç DELETE politikası yoktu** —
  kullanıcı kendi bildirimini bile silemiyordu.
- Yalnızca 4 gerçek bildirim üreticisi vardı: `notify_new_request_response`,
  `notify_selected_response` (yalnızca yeni seçileni bildiriyordu, eskiyi
  değil), `notify_comment_reply` (yalnızca `parent_id` dolu — doğrudan bir
  yoruma/yanıta yanıt — dalını kapsıyordu, bir gönderiye doğrudan yapılan
  İLK yorumu hiç kapsamıyordu), `notify_comment_like`. Hepsi doğru
  `SECURITY DEFINER` + self-skip deseniyle yazılmıştı — **bu dördü
  değiştirilmeden korundu**, yalnızca ikisine (`notify_comment_like`,
  `notify_selected_response`) eksik davranış eklendi (aşağıya bakınız).
- `notifications.type` CHECK kısıtı (Bölüm 18) `follow`/`remix`/`message`/
  `comment` değerlerini baştan beri tanımlıyordu ama HİÇBİRİ için üretici
  yoktu — bunlar gerçek, somut eksiklerdi.
- Beğeni geri çekildiğinde (unlike) veya yorum/yanıt beğenisi geri
  çekildiğinde bildirimi silen HİÇBİR mekanizma yoktu (mükerrer bildirim
  önleme de aynı şekilde eksikti — aynı olayın iki kez işlenmesini
  engelleyecek bir dedupe anahtarı yoktu).
- İçerik (prompt/istek) silindiğinde ona işaret eden bildirimlerin
  temizlenmesi için hiçbir mekanizma yoktu.
- `src/lib/supabase/notifications.ts`'te yalnızca `fetchNotificationsForUser`
  vardı — okundu işaretleme ve silme fonksiyonları hiç yoktu; `/notifications`
  sayfası hiçbir zaman hiçbir şeyi okundu işaretlemiyordu; header'daki zil
  ikonu hiçbir zaman okunmamış noktası göstermiyordu (mesaj ikonundaki
  `hasUnreadMessages` deseninin eşi hiç kurulmamıştı).
- **Mimari olarak bu uygulamada hiç var olmayan, bu yüzden uygulanamayan
  iki kural tespit edildi** (yeni bir paralel sistem kurmamak için
  KASITLI OLARAK dışarıda bırakıldı, bkz. "Kapsam dışı" altında):
  "prompt isteği gönderisini beğenme" (uygulamada hiçbir yerde bir
  isteğin kendisi beğenilemiyor — `LikeButton` yalnızca promptlara
  bağlı, `request_likes` diye bir tablo yok) ve "sistem duyuruları"
  (uygulamada bir duyuru yazma/yönetim ekranı hiç yok — Bölüm 22 henüz
  başlamadı).

**Yeni migration:** `supabase/migrations/20260919180000_notification_
system_completion.sql`:
- `notifications.dedupe_key text` + kısmi tekil indeks
  (`where dedupe_key is not null`) — yalnızca gerçekten "geri
  çekilebilir" iki olay tipinde (prompt beğenisi, yorum/yanıt beğenisi)
  kullanılıyor: bir beğeni geri çekildiğinde YALNIZCA o beğeninin
  bildirimini silmeyi atomik ve kesin hale getiriyor. Takip/mesaj/remix/
  seçim/kapanış gibi tek seferlik olaylara BİLİNÇLİ OLARAK dedupe anahtarı
  eklenmedi — kendi tablolarının PK'sı zaten mükerrer olayı engelliyor,
  ve bir dedupe anahtarı burada meşru bir "ikinci kez" olayı (ör. yeniden
  açıp tekrar kapatma) yanlışlıkla engellerdi.
- "Users can delete their own notifications" — eksik olan DELETE
  politikası eklendi.
- `cleanup_notifications_for_deleted_prompt`/`..._request` (AFTER DELETE,
  `prompts`/`prompt_requests`) — bir prompt/istek silinince ona işaret eden
  (`target_href` tam eşleşmesiyle) bildirimler temizleniyor. Yorum
  bildirimleri için ayrı bir temizleyici GEREKMEDİ — bir yoruma değil
  her zaman sabit gönderi/istek URL'sine işaret ediyorlar, o hiç
  geçersiz olmuyor.
- `notify_prompt_like` (YENİ) + `cleanup_prompt_like_notification` (YENİ,
  beğeni geri çekilince — okunmuş olsa bile siliyor) — prompt beğenisi
  artık gönderi sahibine bildirim üretiyor.
- `notify_comment_like`'a `dedupe_key` eklendi (`create or replace`,
  trigger'ı değişmedi) + `cleanup_comment_like_notification` (YENİ) —
  yorum/yanıt beğenisi geri çekilince artık bildirimi siliyor (öncesinde
  hiç silinmiyordu).
- `notify_comment_reply`'a (`create or replace`) yeni bir `else` dalı
  eklendi: `parent_id is null` olan (yani bir gönderiye/isteğe DOĞRUDAN
  yapılan ilk seviye yorum) durumda `type='comment'` bildirimi üretiyor
  (gönderi/istek sahibine); `parent_id is not null` dalı (yanıta yanıt →
  doğrudan üst sahibine, zincirdeki başka kimseye değil) DEĞİŞTİRİLMEDİ.
- `notify_new_remix` (YENİ) — bir prompt `origin_type='remix'` ile
  oluşturulunca kaynağın sahibine bildirim üretiyor.
- `notify_selected_response` (`create or replace`) — artık İKİ bağımsız
  dal: eski seçili yanıt sahibine "artık seçili değil", yeni seçili yanıt
  sahibine "seçildi" — ikisi ayrı ayrı kontrol edildiğinden seçim
  değiştirme/kaldırma/ilk seçim üç durumu da doğru, birbirine
  karışmadan kapsıyor.
- `notify_request_closed` (YENİ) — bir istek yalnızca MANUEL kapatılınca
  (`status → 'closed'`, otomatik `'answered'` geçişinde DEĞİL — o zaten
  kendi "seçildi" bildirimini alıyor) o isteğe gerçek yanıt vermiş HER
  farklı kullanıcıya (istek sahibi hariç) bir bildirim üretiyor.
- `notify_new_follow` (YENİ), `notify_new_message` (YENİ, konuşmadaki
  gönderen dışındaki her üyeye).

**Gerçek hata düzeltmesi (yerel test sırasında bulundu):** İlk yazılan
`notify_prompt_like`/`notify_comment_like`, `on conflict (dedupe_key) do
nothing` kullanıyordu — ama `dedupe_key` üzerindeki indeks KISMİ
(`where dedupe_key is not null`). PostgreSQL, `ON CONFLICT` hedefinin bir
kısmi indeksi "arbiter" olarak seçebilmesi için hedefte AYNI `WHERE`
koşulunun tekrar edilmesini şart koşuyor — tekrar edilmeyince "there is
no unique or exclusion constraint matching the ON CONFLICT specification"
hatası veriyor. Düzeltme: `on conflict (dedupe_key) where dedupe_key is
not null do nothing`. Bu, yerel Postgres testinde gerçekten yakalandı
(ilk çalıştırmada Grup 1/3 hata verdi), düzeltilip yeniden test edilerek
doğrulandı.

**İstemci tarafı (`src/lib/supabase/notifications.ts`, yeni fonksiyonlar):**
`markNotificationRead(id, userId)` ve `deleteNotification(id, userId)` —
ikisi de RLS'e güveniyor (`recipient_id` eşleşmesi sunucu tarafında
zorunlu, istemcinin verdiği `userId` tek başına hiçbir şeyi kanıtlamıyor).

**Yeni `features/notifications/notifications-provider.tsx`**
(`NotificationsProvider`/`useNotifications`, `RealMessagesProvider` ile
birebir aynı mimari) — bildirimleri, okunmamış sayısını, `markRead`/
`remove` aksiyonlarını tek bir paylaşılan fetch'ten sağlıyor (header ve
`/notifications` sayfası artık ayrı ayrı sorgu atmıyor); `AppProviders`'a
eklendi. `/notifications` sayfası ve `NotificationList`/`NotificationRow`
bunu kullanacak şekilde güncellendi: bir bildirime tıklamak (linke
gitmeden önce) `markRead`'i tetikliyor, her satırda gerçek bir "Bildirimi
sil" (X ikonlu) butonu var — tıklaması `stopPropagation`/`preventDefault`
ile kart linkiyle çakışmıyor (bu projede zaten yerleşik olan stretched-
link deseniyle aynı teknik). `Header`'daki zil ikonu artık mesaj
ikonundaki `hasUnreadMessages` ile birebir aynı desende gerçek bir
okunmamış noktası gösteriyor (`unreadCount > 0`).

**Nasıl doğrulandı — SQL/veri katmanı (gerçekten çalıştırıldı):** Yeni
migration, `00_stub.sql` + önceki 12 migration'la birlikte temiz bir
yerel PostgreSQL 16 veritabanına gerçekten uygulandı (roller zaten
küme genelinde var olduğundan `00_stub.sql`'in rol oluşturma kısmı
`if not exists` ile güvenli hale getirildi — bu yalnızca test
altyapısının kendi düzeltmesi, migration'ın bir parçası değil). 10 test
grubu, 3 gerçek kullanıcıyla (`set role authenticated` + `request.jwt.
claim.sub` ile kimlik simülasyonu, önceki fazlarda kurulan aynı yöntem)
kapsamlı bir senaryo dosyasıyla (`/tmp/pgtest2/notification_test.sql`,
depoya dahil değil — yalnızca test amaçlı) çalıştırıldı ve TÜMÜ beklenen
sonucu verdi:
- Beğeni: oluşturma, kendi kendine beğenmede bildirim OLUŞMAMASI, geri
  çekmede YALNIZCA o bildirimin silinmesi, yeniden beğenmede yeni
  bildirim.
- Yorum: doğrudan yorum → gönderi sahibi; yanıt → doğrudan üst sahibi
  (zincirdeki başkasına DEĞİL); kendi yorumuna kendi yanıtı → bildirim
  yok.
- Yorum/yanıt beğenisi: oluşturma + geri çekmede silme + yorum silme
  sonrası ilgisiz `comment_reply` bildiriminin ETKİLENMEMESİ.
- Remix: kaynağa bildirim, kendi çalışmasını remixlemede bildirim yok.
- İstek yanıtı tam yaşam döngüsü: yayınlama (×2, farklı yanıtlayanlar),
  "yalnızca yorum yanıt sayılmaz" kontrolü, seçme, seçimi DEĞİŞTİRME
  (eski sahip "artık seçili değil" + yeni sahip "seçildi", birbirine
  KARIŞMADAN), seçimi TAMAMEN KALDIRMA (kalan sahibin "yayınlandı"
  bildirimi ETKİLENMEDEN kalıyor).
- İstek kapatma: yalnızca gerçek yanıt verenler bildirim alıyor, istek
  sahibi almıyor; yeniden aç + tekrar kapat → 2. bildirim doğru
  oluşuyor (aynı içerik "yeniden" değil, gerçek yeni bir olay).
- Takip: oluşturma, takipten çıkmada bildirim SİLİNMEMESİ (ve yeni
  bildirim de oluşmaması), yeniden takipte yeni bildirim.
- Mesaj: alıcı bildirim alıyor, gönderen almıyor.
- Okuma/silme/RLS: kendi bildirimini okundu işaretleme başarılı;
  başkasının bildirimini okundu işaretleme/silme denemesi RLS tarafından
  sessizce 0 satır etkileyerek engelleniyor; kendi bildirimini silme
  yalnızca bildirim satırını siliyor, altta yatan `follows` ilişkisine
  DOKUNMUYOR.
- İçerik silme: bir prompt silinince ona işaret eden bildirim
  temizleniyor.

**Test sırasında ayrıca keşfedilen, bu görevin KAPSAMI DIŞINDA, ÖNCEDEN
VAR OLAN bir şema kısıtlaması:** Bölüm 18'den beri `prompts.
source_prompt_id` `on delete set null` ile tanımlı, ama
`prompts_origin_shape` CHECK kısıtı `origin_type='remix'` olan bir
satırda `source_prompt_id`'nin ASLA null olmamasını şart koşuyor. Sonuç:
remixlenmiş herhangi bir orijinal prompt BUGÜN DE (bu görevden önce de)
silinmeye çalışılırsa, silme FK cascade'i `source_prompt_id`'yi null'a
çekmeye çalışırken CHECK kısıtına çarpıp veritabanı hatasıyla
reddediliyor — `deleteRealPrompt`/kart menüsündeki "Sil" bu durumda
kullanıcıya bir hata gösterir (uygulama çökmez, ama silme başarısız
olur). Bu, bildirim sistemiyle hiç ilgisi olmayan, bu denetim sırasında
tesadüfen ortaya çıkan gerçek bir mimari boşluk — **bu görevin kapsamına
alınmadı** (talimat: "gereksiz... kapsam dışı UI oluşturma, mevcut
sistemdeki başka özellikleri bozma" — bunu düzeltmek remix zincirinin
silme davranışına dair ayrı bir mimari karar gerektiriyor: ya remixleri
de cascade silmek ya da `origin_type`'ı bir şekilde "kaynağı silinmiş"
durumuna geçirmek). Test senaryosu bu yüzden İZOLE, remixlenmemiş ayrı
bir prompt üzerinde çalışacak şekilde düzenlendi; asıl remixlenmiş
promptu silme denemesi ayrı, bilgi amaçlı bir adımda BİLEREK
çalıştırılıp aynı hatayı üretmesi doğrulandı (yani hipotez değil,
gerçekten yeniden üretilmiş bir bulgu). **Kullanıcının karar vermesi
gereken bir sonraki adım** — düzeltme bu raporun kapsamında değil.

**Test senaryosunun kendi ölçüm hassasiyetiyle ilgili iki not (gerçek
bir hata DEĞİL):** (1) `expect_1_comment_on_request` sorgusu Aylin'in
TÜM `comment` tipi bildirimlerini sayıyor (yalnızca istek yorumunu
değil) — gerçek değer 2 (biri prompt yorumundan, biri istek
yorumundan), bu DOĞRU davranış, yalnızca test değişken adı yanıltıcı.
(2) 9d adımında "kendi bildirimini sil" testi `type='follow'` ile TÜM
takip bildirimlerini (o an 2 tane) tek seferde siliyor, "yalnızca 1
azalır" değil "2 azalır" sonucu veriyor — asıl doğrulanan kural
(başkasının bildirimini silemezsin, kendi bildirimini silmek `follows`
tablosuna dokunmaz) ayrı satırlarla zaten doğru şekilde kanıtlandı.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, Playwright, bu projenin standart yöntemi):**
16 senaryo, hepsi sıfır JS hatasıyla geçti: 4 farklı bildirim tipinin
(beğeni/yorum/takip/istek yanıtı seçimi) doğru aktör/mesaj/simgeyle
render edilmesi; bir bildirime tıklamanın gerçek bir PATCH tetikleyip
doğru sayfaya yönlendirmesi; header zilinin 3 okunmamışken nokta
göstermesi, biri okunduktan sonra hâlâ göstermesi (2 kaldı), hepsi
okunduktan sonra KAYBOLMASI; silme butonunun sayfadan ÇIKMADAN gerçek
bir DELETE tetikleyip yalnızca o bildirimi kaldırması (diğerleri
sağlam kalıyor); giriş yapılmamışken dürüst boş durum; mobilde yatay
taşma yok. Ayrıca Supabase'e hiç erişilemezken (bu sandbox'ın standart
ağ kısıtı) 6 farklı sayfanın (`/`, `/discover`, `/notifications`,
`/messages`, `/saved`, `/following`) sıfır JS hatasıyla zarifçe
davrandığı ayrıca doğrulandı. `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (20 rota, değişmedi) sıfır hatayla geçti.

**Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** — bu
sandbox'ın ağ politikası `*.supabase.co`'ya erişimi engelliyor (Bölüm
17'den beri tekrarlanan, dürüstçe belirtilen aynı sınırlama). Yukarıdaki
SQL testleri GERÇEK bir Postgres/RLS motorunda çalıştı (taklit değil),
istemci testleri ise ağ seviyesinde taklit edilmiş yanıtlarla çalıştı —
ikisi birlikte mantığı yüksek güvenle doğruluyor ama kullanıcının
migration'ı kendi projesine uygulayıp bizzat denemesi hâlâ gerekli.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- "Prompt isteği gönderisini beğenme" bildirimi eklenmedi — böyle bir
  beğenme özelliği uygulamada hiç yok (`request_likes` tablosu yok,
  `RequestCard`'da beğeni ikonu yok); talimatın "gereksiz tablo/paralel
  sistem oluşturma" kuralına uyarak icat edilmedi.
  - Sistem duyurusu (`type='system'`) üretimi eklenmedi — bir duyuru
  yazma/yönetim arayüzü uygulamada hiç yok (Bölüm 22 henüz başlamadı);
  `ICONS` haritası zaten `system` tipini kapsıyor, yalnızca onu
  üretecek bir kaynak yok.
- Seçim kaldırma için ayrı bir bildirim tipi/mesajı icat edilmedi —
  Bölüm 9.2'nin zaten kurduğu "artık seçili değil" mesajı yeniden
  kullanıldı.
- Bildirimlerde sayfalama/"daha fazla yükle" eklenmedi — bu projenin
  genelinde zaten bilinen "tam sayfalama yok" sınırlamasıyla aynı
  kategoriden, kapsam dışı.

**Bilinen sınırlamalar:**
- **Remixlenmiş bir promptu silme, bu görevden bağımsız, önceden var
  olan bir sema kısıtlaması yüzünden başarısız oluyor** (yukarıda
  ayrıntılı açıklandı) — kullanıcının karar vermesi gereken bir sonraki
  adım.
- Bildirimlerde gerçek zamanlı (Realtime) güncelleme yok — Bölüm 21 Faz
  6'dan beri bilinen, mesajlaşmada da geçerli olan aynı sınırlama;
  bildirimler yalnızca sayfa yüklendiğinde/ziyaret edildiğinde çekiliyor.
- N+1 yok (bildirimler zaten tek bir toplu sorguyla çekiliyor), ama
  `NotificationsProvider` gerçek zamanlı abonelik olmadığından başka bir
  sekmede/cihazda oluşan yeni bir bildirim, bu sekme yeniden
  ziyaret/yenilenene kadar görünmüyor.
- Toplu "tümünü okundu işaretle" veya "tümünü sil" arayüzü eklenmedi —
  şartname tek tek okuma/silme istiyordu, toplu aksiyon kapsamda değildi.

### 9.7 Remixlenmiş bir promptun güvenli silinmesi

Bölüm 9.6'da keşfedilen, bildirim sisteminden bağımsız, önceden var olan
şema boşluğu ("remixlenmiş bir orijinal prompt silinemiyor, veritabanı
hatası veriyor") kullanıcının önerdiği çözümle kapatıldı: **Bölüm 9.5'in
yorum/yanıt "güvenli silme" deseninin birebir aynısı** — kullanıcının
kendi sözleriyle "yerinde kalsa, yalnızca 'silindi' yazsa" önerisi tam
olarak bu.

**Sebep (kullanıcıya verilen cevap):** `prompts.source_prompt_id`
(Bölüm 18) `on delete set null` ile tanımlı, ama aynı migration'ın
`prompts_origin_shape` CHECK kısıtı `origin_type = 'remix'` olan bir
satırda `source_prompt_id`'nin ASLA null olamayacağını şart koşuyor.
Orijinal bir prompt silinmeye çalışıldığında, FK cascade'i kendi
remixinin `source_prompt_id`'sini null'a çekmeye çalışırken bu CHECK
kısıtına çarpıp veritabanı hatasıyla reddediliyordu — evet, tam olarak
"remixi olduğu için" sorulan soru doğruydu.

**Yeni migration:** `supabase/migrations/20260919190000_prompt_safe_
delete.sql` — `prompts.deleted_at timestamptz` (yeni kolon) + bir
`BEFORE DELETE` trigger'ı (`handle_prompt_delete`, Bölüm 9.5'in
`handle_comment_delete`'iyle birebir aynı desen): bir promptun gerçek
remixleri (`source_prompt_id = old.id` eşleşen başka satırlar) VARSA,
DELETE'i iptalleyip yerine bir soft-delete UPDATE'i uyguluyor
(`deleted_at` damgalama + `title`/`description`/`prompt_text`'i
boşaltma + `prompt_media`/`prompt_tags` satırlarını silme); hiç remixi
yoksa DELETE olduğu gibi geçip satırı gerçekten siliyor. `security
invoker` (varsayılan) yeterli — Bölüm 9.5'teki aynı gerekçeyle
(kullanıcı zaten kendi promptunu silme yetkisine sahipse, güncelleme
yetkisine de zaten sahip). Frontend `deleteRealPrompt` **hiç
değişmedi** — hâlâ aynı basit `DELETE`'i gönderiyor, veritabanı hangi
sonucun uygulanacağına tek ve atomik bir işlemde karar veriyor.

**İstemci tarafı:** `Prompt.deletedAt: string | null` eklendi.
`src/lib/supabase/prompts.ts`'teki TÜM normal listeleme fonksiyonları
(`fetchRecentPublishedPrompts`, `fetchPromptsByAuthor`,
`fetchPromptsByAuthors`, `searchPrompts`, `fetchRemixesOf`,
`fetchPromptsForRequest`, `fetchSavedPrompts`, `fetchLikedPrompts`) yeni
bir `filterNotDeleted()` yardımcısıyla soft-deleted bir promptu artık
hiç göstermiyor — feed/keşfet/profil/arama/kaydedilenler/beğeniler/istek
yanıt listesi/remix listesinde silinmiş bir gönderi hiç görünmüyor.
**Bilinçli olarak filtrelenmeyen iki yer:** `fetchPromptById` (doğrudan
bir link hâlâ satırı bulup göstermeli — yalnızca boş içerikle) ve
`fetchRemixChain`'in kullandığı zincir yürüyüşü (bir ara halka
silinmişse bile zincir onun ÖTESİNDEKİ gerçek kaynağa doğru devam
edebilmeli — `origin_type`/`source_prompt_id` soft-delete'te hiç
değişmiyor). `/prompts/local` artık `prompt.deletedAt` set edilmişse
tam `PromptDetailView` yerine dürüst bir "Bu paylaşım silindi" sayfası
gösteriyor; `RemixContext` (kart/detay sayfasındaki "Remixlenen
çalışma" kutusu) kaynağı silinmişse başlık/görsel yerine "Bu paylaşım
silindi." yazıyor; remix zinciri breadcrumb'ındaki silinmiş bir halka
"Silinmiş paylaşım" etiketiyle gösteriliyor (boş başlık yerine).

**Nasıl doğrulandı:** Yeni migration, yerel PostgreSQL 16'daki mevcut
test veritabanına (önceki 13 migration + Bölüm 9.6'nın gerçek test
verisiyle — Aylin'in remixlenmiş `dddddddd…` prompt'u dahil) gerçekten
uygulandı ve 3 senaryo çalıştırıldı: remixi olan bir promptu silmeye
çalışmak artık HATA VERMEDEN `DELETE 0` dönüyor (soft-delete oldu),
`title`/`description`/`prompt_text` boşaldı, `deleted_at` damgalandı,
VE remixlerinin `source_prompt_id`/`origin_type`'ı hiç değişmeden kaldı
(CHECK ihlali yok), `prompt_media` temizlendi; remixi olmayan bir
prompt gerçekten (`DELETE 1`) silindi; başkasının promptunu silme
denemesi RLS tarafından sessizce 0 satır etkileyerek engellendi. Ayrıca
`npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla Playwright'ta: doğrudan bir linkle silinmiş
bir promptun "Bu paylaşım silindi" sayfasını gösterdiği, normal bir
promptun değişmeden render edildiği, silinmiş bir kaynağın remixinin
kendi context kutusunda "Bu paylaşım silindi." gösterdiği (remixin
kendi içeriği hiç etkilenmeden), ve feed'in silinmiş promptu kendi
kartı olarak HİÇ göstermediği (yalnızca onu remixleyen kartın kendi
"Remixlenen çalışma" bağlam kutusunun ona referans vermeye devam
ettiği — bu doğru/istenen davranış, Bölüm 9.6'daki gibi ayrı bir
"hata değil" notu) — hepsi sıfır JS hatasıyla doğrulandı. Gerçek bir
Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı
yüzünden yapılamadı (tekrarlanan, dürüstçe belirtilen aynı sınırlama).

**Bilinen sınırlamalar:**
- Soft-deleted bir promptun `like_count`/`comment_count`/`remix_count`
  sayaçları sıfırlanmıyor (dokunulmadı) — zaten hiçbir yerde
  gösterilmiyor (yalnızca "silindi" placeholder'ı render ediliyor),
  pratik bir etkisi yok.
- Soft-deleted promptun altındaki `prompt_likes`/`prompt_comments`
  satırları da silinmiyor (yalnızca `prompt_media`/`prompt_tags`
  temizleniyor) — bunlar zaten hiçbir yerde ayrıca gösterilmiyor
  (yorum bölümü zaten yalnızca `/prompts/local` üzerinden erişiliyor,
  o da artık "silindi" sayfasını gösteriyor, yorum bölümünü hiç
  render etmiyor).
- Bu, prompt tarafındaki TEK safe-delete senaryosu — `prompt_requests`
  için benzer bir kısıt/ihtiyaç yok (bir isteğin kendisi başka bir
  isteğin "kaynağı" olamıyor), bu yüzden orada bir karşılığı yok.

### 9.8 Mesajlaşma genişletmesi — Faz A: içerik paylaşımı, yanıtlama, düzenleme/silme

Kullanıcının çok ayrıntılı 7 fazlı mesajlaşma şartnamesinin (bkz. sohbet
geçmişi) AŞAMA 1 denetimi + Faz A'sı. Denetim: mevcut mesajlaşma (Bölüm 21
Faz 6) yalnızca düz metin gönderip/alabiliyordu — yanıtlama, içerik
paylaşımı, düzenleme, "benden sil"/"herkesten sil" hiç yoktu; `messages`
tablosunda hiç UPDATE RLS politikası bile yoktu. `reports`/`blocks`
tabloları (Bölüm 18) şemada var ama hiç kullanılmıyor — bunlar Faz B'nin
işi, bu fazda dokunulmadı. Realtime hiç yok (Faz C'nin işi).

**Yeni migration:** `supabase/migrations/20260919200000_messaging_
content_and_edit.sql`:
- `messages.body` artık nullable (yalnızca paylaşılan içerik + metinsiz
  gönderi mümkün); yeni `shared_prompt_id`/`shared_request_id`
  (`prompts`/`prompt_requests`'e FK, `on delete set null`),
  `reply_to_message_id` (kendine referans, `on delete set null`),
  `edited_at`, `deleted_at`.
- CHECK `messages_has_content` (tamamen boş mesaj olamaz — `deleted_at`
  set edilmiş olması istisna, aşağıya bakınız) ve
  `messages_shared_content_exclusive` (bir mesaj aynı anda hem prompt hem
  istek paylaşamaz) — `prompt_comments`'ın (Bölüm 18) "tam olarak bir
  hedef" desenini birebir izliyor.
- Yeni `message_hidden_for` tablosu (bileşik PK `(message_id, user_id)`)
  — "benden sil": bir üyenin bir mesajı gizlemesi diğer üye(ler) için o
  mesajı hiç etkilemiyor; tek bir sütunla ifade edilemeyecek bir "bu
  kullanıcı için görünmez" ilişkisi olduğundan ayrı bir tablo gerekti.
  RLS: yalnızca kendi adına ekleyip okuyabiliyorsun.
- Yeni UPDATE RLS politikası ("Senders can edit or soft-delete their own
  recent messages") — **ürün varsayılanı: gönderiden sonraki 15 dakika**
  (şartname kesin bir süre vermiyordu, WhatsApp/Telegram'ın da kullandığı
  yaygın bir pencere seçildi — değiştirilmesi tek satır). Aynı politika
  hem düzenlemeyi HEM "herkesten sil"i kapsıyor (ikincisi ayrı bir DELETE
  değil, `body`/`shared_*`'i boşaltıp `deleted_at` damgalayan bir UPDATE
  — Bölüm 9.5/9.7'nin soft-delete deseninin üçüncü uygulaması).
- `handle_message_body_edit()` (BEFORE UPDATE, Bölüm 9.5'in
  `handle_comment_body_edit`'iyle birebir aynı) — yalnızca `body` GERÇEKTEN
  değiştiğinde `edited_at`'i damgalıyor.

**Gerçek hata düzeltmesi (yerel test sırasında bulundu):** İlk yazılan
`messages_has_content` CHECK'i yalnızca `body`/`shared_prompt_id`/
`shared_request_id`'den birinin dolu olmasını şart koşuyordu — ama
"herkesten sil" tam olarak ÜÇÜNÜ BİRDEN boşaltan bir UPDATE olarak
uygulandığından, bu CHECK kendi güvenli-silme deseninin kendisini
reddediyordu (yerel testte gerçekten yakalandı: "herkesten sil" denemesi
`messages_has_content` ihlaliyle hata veriyordu). Düzeltme: CHECK'e
`deleted_at is not null` istisnası eklendi.

**İstemci tarafı:**
- `src/lib/supabase/messages.ts` — `Message` tipi yeni alanlarla
  genişledi; `fetchMessages` artık `message_hidden_for`'u da çekip
  gizlenmiş mesajları filtreliyor (viewer'a özel); `sendMessage` artık
  `{body?, sharedPromptId?, sharedRequestId?, replyToMessageId?}` alıyor;
  yeni `editMessage`, `deleteMessageForEveryone`, `hideMessageForMe`.
  Konuşma listesi/tekil konuşma önizlemesi (`fetchConversationsForUser`/
  `fetchConversationForUser`) yeni `previewTextFor()` yardımcısıyla
  "Bir prompt paylaştı."/"Bir prompt isteği paylaştı."/"Bu mesaj silindi."
  gösteriyor (önceden `body` her zaman dolu olduğundan bu ayrım yoktu).
- Yeni `features/messages/shared-content-card.tsx` — `SharedPromptCard`/
  `SharedRequestCard`, `post-context.tsx`'in `RemixContext`'iyle birebir
  aynı cache-then-fetch desenini kullanıyor; kaynak Bölüm 9.7'de
  soft-deleted ise "Bu içerik artık mevcut değil." gösteriyor.
- Yeni `features/messages/message-bubble.tsx` (`MessageBubble`) —
  `comment-node.tsx`'in eylem-satırı desenini (Yanıtla/Düzenle/Sil metin
  butonları, iki tıklamalı silme onayı) mesajlara uyguluyor; yanıt
  alıntısı, paylaşılan içerik kartı, düzenlendi etiketi, silindi yer
  tutucusu hepsi burada. Her kökün `data-message-id` özniteliği var
  (test/hata ayıklama için).
- `local-conversation-view.tsx` tamamen yeniden yazıldı: yanıtlama,
  düzenleme, iki ayrı silme modu (`DeleteMode: "everyone" | "me"`),
  `?sharePromptId=`/`?shareRequestId=` deep link'inden gelen "paylaşılıyor"
  banner'ı (cache'te varsa senkron, yoksa gerçek bir fetch'le başlığı
  gösteriyor).
- **"Mesajla gönder" giriş noktası — yalnızca promptlarda:** `post-menu.tsx`
  menüsüne yeni bir seçenek eklendi (`/messages?sharePromptId=<id>`'e
  gidiyor). `RequestCard`'ın hiç menüsü/paylaş butonu olmadığından
  (önceden var olan bir boşluk, bu görevin kapsamında değil) istekler
  için bir giriş noktası eklenmedi — veri katmanı (`shared_request_id`)
  zaten hazır, yalnızca keşif arayüzü eksik.
- `/messages` sayfası artık `?sharePromptId=`/`?shareRequestId=` varken
  "Kime göndermek istersin?" banner'ı gösteriyor ve `ConversationRow`
  tıklamalarını `sharePromptId`/`shareRequestId`'yi taşıyarak
  `/messages/local`'a yönlendiriyor. **Bilinçli kapsam sınırı:** yalnızca
  VAR OLAN konuşmalara paylaşılabiliyor — yeni bir alıcı arayıp konuşma
  başlatma ekranı (şartnamenin 6. bölümü) bu faza sıkıştırılmadı, o
  ayrı bir iş (Faz B'nin "yeni mesaj" akışıyla birleşecek).

**Nasıl doğrulandı:** Yeni migration, yerel PostgreSQL 16'daki test
veritabanına (Bölüm 9.6/9.7'nin gerçek test verisiyle) gerçekten
uygulandı ve 12 senaryo çalıştırıldı: boş mesaj reddi, hem-prompt-hem-
istek reddi, yalnızca-paylaşılan-içerik (metinsiz) kabulü, yanıtlama,
15 dakika içinde düzenleme + `edited_at` damgalanması, başkasının
mesajını düzenleyememe (RLS, 0 satır), yalnızca beğeni/sayaç gibi
ilgisiz bir güncellemenin `edited_at`'i etkilememesi, **15 dakika
DIŞINDA düzenleme denemesinin RLS tarafından reddedilmesi**, "herkesten
sil"in `body`'yi boşaltıp satırı yaşatması, "benden sil"in yalnızca o
kullanıcı için gizlemesi (diğer üye hâlâ görüyor), başkası adına
"benden sil" kaydı oluşturulamaması (RLS), üye olmayan bir kullanıcının
konuşmaya mesaj gönderememesi — hepsi gerçekten çalıştırılıp doğrulandı.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla Playwright'ta 21 senaryo daha doğrulandı:
düz mesaj gönderme, yanıtlama (banner + yanıt önizlemesi), düzenleme
("düzenlendi" etiketiyle), herkesten silme (placeholder + onay adımı),
benden silme (yalnızca kendi görünümünden kayboluyor, sayfa
yenilendikten sonra da kalıcı), bir promptun kart menüsünden "Mesajla
gönder" → konuşma seçimi → paylaşım banner'ı → gönderim → paylaşılan
prompt kartının thread'de render edilmesi — hepsi sıfır JS hatasıyla.
Supabase'e hiç erişilemezken (`/messages/local`, `/messages?
sharePromptId=`, ikisinin birleşimi) sıfır JS hatasıyla zarifçe
davrandığı ayrıca doğrulandı. Gerçek bir Supabase projesine karşı canlı
doğrulama yine bu sandbox'ın ağ kısıtı yüzünden yapılamadı (Bölüm 17'den
beri tekrarlanan, dürüstçe belirtilen aynı sınırlama).

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar (Faz B/C'ye bırakıldı):**
- Mesaj istekleri, gizlilik ayarları ("kimler bana mesaj gönderebilir"),
  engelleme/şikâyetin mesajlaşmaya entegrasyonu — Faz B.
- Gerçek zamanlı senkronizasyon (Realtime) — Faz C, bu sandbox'ta
  WebSocket testi mümkün olmadığından ayrı ele alınacak.
- Yeni bir alıcı arayıp sıfırdan konuşma başlatma ekranı — yukarıda
  açıklandı, Faz B'nin "yeni mesaj" akışıyla birleştirilecek.
- Okundu/iletildi ayrımı, çevrimiçi durumu, dosya eki, arşivleme, arama —
  şartnamenin kendisi de bir kısmını "ilk sürümde olmasa da olur" diye
  işaretlemişti; bu fazın kapsamına alınmadı.

**Bilinen sınırlamalar:**
- 15 dakikalık düzenleme/silme penceresi bir ürün varsayılanı — kesin bir
  süre şartnamede verilmemişti, kullanıcı isterse tek satırlık bir
  migration'la değiştirilebilir.
- `deleteMessageForEveryone` sonrası `shared_prompt_id`/
  `shared_request_id`'nin referans verdiği prompt/istek satırı hiç
  etkilenmiyor (yalnızca mesajın kendi içeriği boşalıyor) — beklenen ve
  doğru davranış, ayrıca not edilmeye değer.
- "Benden sil"in geri alınması (mesajı tekrar görünür kılma) için bir
  arayüz yok — `message_hidden_for` satırını silecek bir "geri getir"
  eylemi eklenmedi, şartname de böyle bir şey istemiyordu.
- İstek paylaşımı için keşif arayüzü yok (yukarıda açıklandı) — yalnızca
  veri katmanı hazır.

### 9.9 Mesajlaşma genişletmesi — Faz B: mesaj istekleri, gizlilik ayarı, engelleme entegrasyonu

Kullanıcının 7 fazlı mesajlaşma şartnamesinin ikinci fazı. Önce mevcut şema
incelendi (talimat: "mevcut veritabanını incelemeden yeni tablolar
oluşturma") — `reports`/`blocks` tabloları Bölüm 18'de ZATEN oluşturulmuş
ve hiçbir zaman kullanılmamıştı (RLS'i bile hazırdı: `reports` için
kendi-raporunu-gör + rapor-oluştur, `blocks` için tam CRUD — hepsi Bölüm
19'da yazılmış, sıfır frontend kodu yoktu). Bu yüzden bu faz için **yeni
tablo yok** — yalnızca `profiles`/`conversation_members`'a birer sütun
eklendi ve zaten var olan `reports`/`blocks` gerçekten kullanılmaya
başlandı.

**Yeni migration:** `supabase/migrations/20260919210000_messaging_
requests_privacy_blocking.sql`:
- `profiles.message_privacy` (`'everyone'` | `'followers_only'`,
  varsayılan `'everyone'`) — "kimler bana mesaj gönderebilir".
- `conversation_members.status` (`'accepted'` | `'pending'`, varsayılan
  `'accepted'`) — varsayılanın `'accepted'` olması bu migration'dan ÖNCE
  var olan TÜM konuşmaları (hepsi zaten karşılıklı rızayla oluşmuştu,
  Bölüm 21 Faz 6/Faz A) olduğu gibi bırakıyor, geriye dönük hiçbiri
  yanlışlıkla "istek" olmuyor.
- `is_blocked(a, b)` — `is_conversation_member()` ile birebir aynı
  SECURITY DEFINER desende yeni bir yardımcı: `blocks`'un kendi RLS'i
  (Bölüm 19) yalnızca "auth.uid() = blocker_id" olan satırları gösteriyor,
  yani bir kullanıcı yalnızca KENDİ engellediklerini görebiliyor,
  BAŞKASININ onu engelleyip engellemediğini göremiyor — mesajlaşma
  RLS'inin iki yönü de kontrol edebilmesi için bu yardımcı şart.
- `messages`/`conversation_members`'ın INSERT politikaları (Bölüm 19)
  `is_blocked()` ile genişletildi — bir engelleme artık gerçekten hem yeni
  konuşma başlatmayı HEM var olan bir konuşmada mesaj göndermeyi
  veritabanı seviyesinde reddediyor (yalnızca arayüzde gizlenen bir buton
  değil).
- `handle_block_removes_follows()` — bir engelleme, iki taraf arasında
  varsa takip ilişkisini de kaldırıyor (ürün kararı: birini engellemek,
  onu takip etmeyi/onun tarafından takip edilmeyi anlamsız kılıyor).
  `handle_follow_change` (Bölüm 19) zaten DELETE'te sayaçları doğru
  düşürdüğünden buraya ek bir sayaç mantığı gerekmedi.
- `start_direct_conversation(other_user_id)` RPC — Bölüm 21 Faz 6'nın
  `getOrCreateDirectConversation`'ının eski "var olan konuşmayı bul, yoksa
  iki ayrı INSERT ile oluştur" mantığının yerini aldı. Artık yalnızca bul-
  ya-da-oluştur değil, engelleme reddi + gizlilik kontrolü + alıcının
  başlangıç durumunu (zaten göndereni takip ediyorsa doğrudan `'accepted'`,
  değilse `'pending'` — bir mesaj isteği) hesaplama gerekiyor; bu kararı
  istemciye bırakmak güvenilir olmazdı (kötü niyetli bir client her zaman
  `'accepted'` yazıp istek akışını tamamen atlayabilirdi) — `select_
  prompt_request_response` (Bölüm 9.2) ile aynı gerekçeyle tek, atomik bir
  RPC. Konuşma id'si burada da (Bölüm 21 Faz 6'nın gerçek kullanıcıda
  yakalanan hatasıyla birebir aynı RLS chicken-and-egg tuzağını önlemek
  için) `RETURNING`'e güvenmeden, açıkça `gen_random_uuid()` ile üretiliyor.
- `notifications.type` CHECK'i yeni bir `'message_request'` değeri aldı —
  `notify_new_message` (Bölüm 9.6) artık alıcının O ANKİ durumuna bakıp
  doğru tipi/metni seçiyor ("Sana bir mesaj isteği gönderdi." vs "Sana bir
  mesaj gönderdi.").

**İstemci tarafı:**
- `Conversation.myStatus: "accepted" | "pending"` eklendi —
  `fetchConversationsForUser`/`fetchConversationForUser` artık `status`
  sütununu da okuyor.
- `src/lib/supabase/messages.ts`: `getOrCreateDirectConversation` artık
  tamamen `start_direct_conversation` RPC'sine yönleniyor (eski JS'teki
  iki-insert mantığı tamamen silindi); yeni `acceptMessageRequest`
  (kendi üyelik satırını `'accepted'`e çeken düz bir UPDATE — Bölüm 19'un
  var olan "kendi üyeliğini güncelleyebilirsin" politikası zaten yeterli,
  yeni bir RLS gerekmedi) ve `declineMessageRequest` (konuşmadan ayrılan
  düz bir DELETE — yine var olan "konuşmadan ayrılabilirsin" politikası
  yeterli). İkisi de bilinçli olarak RPC DEĞİL — kendi satırın üzerinde
  yaptığın bir işlem için ekstra bir güvenlik katmanına gerek yok.
- Yeni `src/lib/supabase/blocks.ts` (`fetchIsBlockedByMe`, `blockUser`,
  `unblockUser`) ve `src/lib/supabase/reports.ts` (`fileReport`) — Bölüm
  18'den beri var olan ama hiç kullanılmayan tabloları ilk kez gerçekten
  kullanıyor.
- `src/lib/supabase/profiles.ts`: `fetchOwnMessagePrivacy`/
  `updateMessagePrivacy` — bilinçli olarak `UserProfile`/`PROFILE_SELECT`'e
  DAHİL EDİLMEDİ (görünen ad/bio'nun aksine bu yalnızca sahibinin kendi
  ayarlar sayfasında okunuyor, hiçbir profilde herkese gösterilmiyor).
- Yeni `features/moderation/` klasörü (CLAUDE.md §3'ün henüz listelemediği,
  Bölüm 22'nin de ihtiyaç duyacağı paylaşılan bir alan): `use-block-state.ts`
  (`useFollowState`'in birebir aynı deseni) ve `report-button.tsx` (bu
  projede hiç modal olmadığından — Bölüm 9.2 — inline genişleyen bir neden
  alanı; giriş yapılmamışken hiçbir şey render etmiyor).
- Yeni `features/profile/profile-more-menu.tsx` (`ProfileMoreMenu`) —
  `PostMenu` ile aynı kebab-menü deseni: "Engelle"/"Engeli kaldır" (iki
  tıklamalı onay, `PostMenu`'nun sil deseniyle aynı) + `ReportButton`.
  `OtherProfileActions`'a eklendi; engellenmiş bir kullanıcıda
  `MessageButton` gizlenip yerine "Bu kullanıcıyı engelledin" rozeti
  gösteriliyor.
- `message-bubble.tsx`'e başkasının mesajları için kompakt bir "Şikayet Et"
  eylemi eklendi (tek satırlık inline neden alanı — bir sohbet balonunun
  eylem satırına tam bir textarea sığdırmak yerine).
- `local-conversation-view.tsx`: konuşma `myStatus === 'pending'`
  olduğunda üstte bir "Bu bir mesaj isteği" bandı ("Kabul Et"/"Sil"
  düğmeleriyle); alıcı yanıt verdiğinde (`handleSubmit` başarılı
  olduğunda) `acceptRequest` otomatik çağrılıyor — çoğu gerçek mesajlaşma
  uygulamasının "yanıtlamak zımni kabul sayılır" davranışıyla aynı. Ayrıca
  engelleme entegrasyonu: `fetchIsBlockedByMe` ile viewer'ın KENDİ
  engelleme durumu okunup composer'ı devre dışı bırakıyor ve bir "Engeli
  kaldır" bandı gösteriyor; karşı tarafın beni engellemiş olma ihtimali
  ise (bu yön RLS'te görünmüyor, bkz. yukarıdaki `is_blocked` notu)
  yalnızca gerçek bir gönderim başarısız olduğunda `translateSendError`
  ile RLS'in ham "row-level security" hatasını "Bu mesaj gönderilemedi.
  Kullanıcı seni engellemiş olabilir." mesajına çeviriyor — önceden tahmin
  edip UI'ı önceden kilitlemiyor.
- `/messages` listesi artık `myStatus`'a göre "Mesaj İstekleri (N)" ve
  "Sohbetler" olarak iki bölüme ayrılıyor (Instagram'ın istek klasörüyle
  aynı fikir) — `ConversationList`'in kendisi değişmedi, yalnızca
  `page.tsx` listeyi iki kez, filtrelenmiş olarak render ediyor.
- `/settings`'e yeni bir "Mesaj gizliliği" bölümü eklendi (iki radyo
  seçenek: Herkes / Yalnızca takip ettiklerim) — profil kimlik bilgileri
  `/profile/edit`'te kaldığı gibi, bu da kasıtlı olarak hesap ayarları
  sayfasında (gizlilik/güvenlik ayarı, profil alanı değil).
- `NotificationType`/`notification-row.tsx`'in `ICONS` haritasına
  `message_request` eklendi (Mail ikonuyla, `message` ile aynı).

**Bilinçli tasarım kararları:**
- Sender pending bir konuşmada istediği kadar mesaj göndermeye devam
  edebiliyor (Instagram'ın da gerçek davranışı) — "kabul edilene kadar
  yalnızca bir mesaj" gibi bir sınırlama eklenmedi, şartnamede net bir
  sayı verilmemişti ve bu ekstra karmaşıklık hiçbir gerçek sorunu
  çözmüyordu.
- "Sil" (reddet) bir engelleme DEĞİL — yalnızca kendi üyelik satırını
  siliyor (konuşmadan ayrılmak). Gönderen isterse tekrar dener (yeni bir
  konuşma ya da aynı thread'e yeni bir mesaj), tekrar pending olarak
  düşer. Kalıcı olarak durdurmak isteyen "Engelle"yi kullanmalı — iki
  eylem kasıtlı olarak ayrı tutuldu, "Sil"i otomatik bir engellemeye
  çevirmek şartnamede istenmedi ve sürpriz bir yan etki olurdu.
- Engelleme, feed/keşfet/yorum gibi mesajlaşma DIŞI hiçbir yerde
  içerik gizlemiyor — yalnızca mesajlaşmayı durduruyor. Genel içerik
  gizleme Bölüm 22'nin (henüz başlamamış) moderasyon modülünün işi;
  burada icat edilmedi.
- Rapor inceleme/durum değiştirme (moderatör arayüzü) eklenmedi —
  `reports.status` şemada zaten var (`'open'`/`'reviewed'`/`'dismissed'`)
  ama bunu değiştirecek bir rol sistemi yok (Bölüm 19'un zaten belirttiği
  sınırlama); bu faz yalnızca "rapor dosyalama" ucunu tamamlıyor.

**Nasıl doğrulandı:** Yeni migration, yerel PostgreSQL 16'da sıfırdan
kurulan bir test veritabanına (önceki migration'lar + storage hariç, bu
migration storage'a hiç dokunmadığından atlanabilir oldu) gerçekten
uygulandı ve 14 senaryo çalıştırıldı: varsayılan gizlilikte takip
etmeyen biri mesaj atınca alıcıda `'pending'` + `'message_request'`
bildirimi oluşması; aynı çifte tekrar mesaj atılınca konuşmanın yeniden
kullanılması (ikinci bir konuşma oluşmaması); alıcı kabul etmeden önce
göndericinin mesaj göndermeye devam edebilmesi; alıcı yanıt verince
(kendi satırını `'accepted'`e çekince) durumun değişmesi VE bildirim
tipinin `'message'`e dönmesi; `followers_only` gizlilikte takip
etmeyenin isteği bile başlatamaması (doğru Türkçe hata mesajıyla);
takip edilince aynı denemenin doğrudan `'accepted'` olarak geçmesi;
`is_blocked()`'ın iki yönü de doğru görmesi; engellenen tarafın var olan
bir thread'de mesaj gönderememesi (RLS reddi); engellenen tarafın YENİ
bir konuşma da başlatamaması; engellemenin var olan takip ilişkisini
gerçekten kaldırması (ilgisiz bir takip ilişkisinin etkilenmeden
kalması ile karşılaştırmalı); engel kaldırılınca mesajlaşmanın
gerçekten çalışır hale gelmesi; rapor dosyalamanın değişmeden
çalışması; kendine mesaj göndermenin reddedilmesi; `anon` rolünün
RPC'yi hiç çağıramaması (`revoke all` doğru çalışıyor) — hepsi
gerçekten çalıştırılıp doğrulandı. Test veritabanı işlem bitince
silindi. Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build`
(20 rota, değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit
edilmiş Supabase REST yanıtlarıyla Playwright'ta 19 senaryo daha
doğrulandı: bir mesaj isteği gönderme ve alıcının profilinde/mesaj
listesinde doğru görünmesi; pending bandı + Kabul Et/Sil; yanıtlamanın
otomatik kabul ettiği VE arka planda durumun gerçekten değiştiği;
ayarlardaki gizlilik radyolarının çalışması; profil kebab menüsünden
engelleme (iki tıklamalı onay) sonrası Mesaj Gönder butonunun kaybolması
ve "Bu kullanıcıyı engelledin" rozetinin görünmesi; var olan bir
konuşmada composer'ın devre dışı kalması ve engeli kaldırınca tekrar
aktifleşmesi; hem bir kullanıcının hem bir mesajın gerçekten
raporlanabilmesi; ve son olarak Supabase'e hiç erişilemezken 19 farklı
rotanın (Bölüm 9.1'in aynı listesi) sıfır JS hatasıyla zarifçe
davranmaya devam ettiği — hepsi sıfır JS hatasıyla. Gerçek bir Supabase
projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı yüzünden
yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe belirtilen aynı
sınırlama).

**Bilinen sınırlamalar:**
- **Eşzamanlı çift istek yarış durumu (Bölüm 21 Faz 6'nın bilinen
  sınırlamasıyla aynı kategoriden):** `start_direct_conversation` "var
  olan konuşmayı bul" adımını tek bir SELECT ile yapıyor ama bunu
  ardından gelen INSERT'lerle aynı transaction'da atomik bir "bul ya da
  kilitle" yapmıyor — iki kullanıcı TAM AYNI ANDA birbirine ilk kez mesaj
  atarsa teorik olarak iki ayrı konuşma oluşabilir. Gerçek kullanıcı hacmi
  bu sandbox'ta test edilemeyecek kadar düşük, pratikte gözlemlenmedi.
- Mesaj isteği reddedildiğinde (Sil) gönderene bunun bildirilmediği gibi,
  görünürde de hiçbir iz kalmıyor — gönderen kendi tarafında konuşmayı
  hâlâ (eski mesajlarıyla) görmeye devam ediyor, yalnızca alıcı tarafında
  kayboluyor. Bu, "benden sil"in (Bölüm 9.8) davranışıyla tutarlı ama
  ayrıca not edilmeye değer.
- Blok listesi / rapor geçmişi görüntüleme arayüzü yok — `/settings`'te
  yalnızca gizlilik tercihi var, "engellediklerim" listesi gibi bir ekran
  eklenmedi (şartname bunu net istemedi, `blocks` SELECT politikası zaten
  hazır olduğundan ileride kolayca eklenebilir).
- Mesaj raporlama arayüzü tek bir kompakt satır (textarea yerine tek
  satır input) — profil raporlama (`ReportButton`, tam textarea) ile
  görsel olarak tutarlı değil, kasıtlı bir yoğunluk/yer kararı (bir sohbet
  balonunun eylem satırı zaten kalabalık).

### 9.10 Mesajlaşma genişletmesi — Faz C: gerçek zamanlı senkronizasyon

Kullanıcının 7 fazlı mesajlaşma şartnamesinin üçüncü ve son fazı. Bölüm 21
Faz 6'dan beri belgelenmiş sınırlamayı kapatıyor: mesajlaşma yalnızca
sayfa yüklendiğinde/ziyaret edildiğinde çekiliyordu, karşı tarafın
gönderdiği bir mesaj sayfa yeniden ziyaret edilene kadar görünmüyordu.

**Yeni migration:** `supabase/migrations/20260919220000_messaging_
realtime.sql` — tek işi iki `alter publication supabase_realtime add
table ...` satırı (`messages`, `conversation_members`). **Yeni tablo/
sütun/politika yok** — bir tablo Supabase'in Realtime "Postgres Changes"
yayınına eklenmeden `supabase.channel(...).on('postgres_changes', ...)`
hiçbir olay almıyor, bu yalnızca o proje ayarını açan bir SQL. Güvenlik:
Supabase'in Realtime sunucusu bir "Postgres Changes" aboneliğini o
tablonun RLS SELECT politikasına göre yetkilendiriyor (abone olan
bağlantının `auth.uid()`'sine göre) — `messages`/`conversation_members`
üzerindeki politikalar (Bölüm 19) hiç değişmedi, bu yüzden bir
konuşmanın üyesi olmayan biri REST üzerinden göremediği bir satırı
Realtime üzerinden de göremiyor.

**İstemci tarafı:**
- `src/lib/supabase/messages.ts`: `mapMessageRow` ve `MessageRow` artık
  export ediliyor — Realtime payload'ını REST yanıtıyla BİREBİR AYNI
  fonksiyonla `Message`'a çeviriyor, ikinci bir eşleme mantığı yok.
- Yeni `src/features/messages/realtime-helpers.ts` — `mergeIncomingMessage`
  (bir INSERT olayını mevcut listeye id'ye göre dedupe ederek ekliyor) ve
  `applyMessageUpdate` (bir UPDATE olayını — düzenleme ya da Faz A'nın
  "herkesten sil" soft-update'i — id'ye göre yerine koyuyor). Bu iki saf
  fonksiyon, abonelik bağlantısından (WebSocket) bilinçli olarak AYRI
  tutuldu: bu sandbox'ın ağ politikası gerçek Supabase'e WebSocket
  erişimini de engellediğinden (Bölüm 21 Faz 6'dan beri bilinen
  sınırlama), canlı bir uçtan uca Realtime testi hiç mümkün olmadı —
  ayrılmış saf fonksiyonlar en azından birleştirme MANTIĞININ gerçekten
  doğru çalıştığını (WebSocket olmadan, doğrudan Node'da) kanıtlanabilir
  kılıyor.
- **Neden dedupe gerekiyor:** bir mesaj gönderdiğinde `handleSubmit`
  zaten kendi INSERT'ini iyimser olarak yerel state'e ekliyor (Bölüm 21
  Faz 6'dan beri); gönderen de kendi konuşmasının üyesi olduğundan,
  Realtime bu AYNI INSERT'i gönderenin kendi kanalına da geri
  yansıtıyor — `mergeIncomingMessage` id eşleşmesinde no-op yaparak bu
  çift göstermeyi önlüyor.
- `local-conversation-view.tsx`: konuşma açıkken `messages` tablosuna,
  yalnızca o `conversation_id` için (`filter: conversation_id=eq.<id>`)
  INSERT/UPDATE olaylarına abone oluyor. Karşı taraftan gelen (kendi
  gönderdiği değil) yeni bir mesaj geldiğinde `markConversationRead`'i
  otomatik tekrar çağırıyor — konuşma zaten açıkken okunmamış sayacının
  gereksiz yere artık kalmaması için. Bileşen unmount olduğunda/`id`
  değiştiğinde kanal `supabase.removeChannel` ile temizleniyor.
- `real-messages-provider.tsx`: `conversation_members` tablosunda
  **yalnızca kendi** (`user_id=eq.<benim id'im>`) satırlarındaki HER
  olayda (`event: "*"` — INSERT/UPDATE/DELETE) tüm konuşma listesini
  yeniden çekiyor. Bu, header'daki okunmamış mesaj noktasını VE
  `/messages` listesinin önizleme/sıralamasını canlı günceller — ayrıca
  `messages` tablosuna abone olmaya gerek kalmadan, çünkü
  `handle_new_message` (Bölüm 18) zaten her yeni mesajda diğer üyenin
  `unread_count`'unu güncelliyor, bu tek olay zaten yeterli sinyal.

**Bilinçli tasarım kararları:**
- Bildirimler (`NotificationsProvider`) bu fazın kapsamında DEĞİL —
  şartnamenin gerçek zamanlı senkronizasyon bölümü özellikle mesajlaşmayı
  hedefliyordu; bildirimlerin kendi Realtime'ı ayrı bir iş (Bölüm 21 Faz
  6'nın "bildirimlerde de yok" notu hâlâ geçerli).
- `messages` tablosunda `REPLICA IDENTITY FULL` AYARLANMADI — yalnızca
  `old` satırın (UPDATE/DELETE'te) hangi sütunları taşıdığını etkiler;
  bu uygulama yalnızca `new` satırı (`INSERT`/`UPDATE` payload'ı zaten
  replica identity'den bağımsız olarak tam geliyor) ve mesajı bulmak için
  `id`'yi (birincil anahtar, varsayılan identity'de bile her zaman
  mevcut) kullanıyor — ekstra bir ayara gerek yok.
- `RealMessagesProvider`'ın "her olayda tüm listeyi yeniden çek" deseni
  bilinçli olarak basit tutuldu (tek satırlık bir değişiklik için toplu
  bir `.in()` sorgusu/incremental patch yazılmadı) — gerçek içerik hacmi
  (bir kullanıcının birkaç konuşması) bunu haklı çıkarmıyor; Bölüm 21'in
  zaten bilinen "N+1/tam sayfalama yok" kategorisinden.

**Nasıl doğrulandı:** Yeni migration, yerel bir PostgreSQL 16 örneğine
önceki 16 migration'la birlikte (storage hariç) gerçekten uygulandı —
gerçek bir Supabase projesinde zaten var olan `supabase_realtime`
publication'ı yerelde `create publication supabase_realtime;` ile
taklit edilip (bu yalnızca test altyapısının kendi düzeltmesi, migration'ın
bir parçası değil — gerçek bir Supabase projesi bu publication'ı zaten
baştan sağlıyor), `alter publication ... add table` iki satırının da
hatasız çalıştığı VE `pg_publication_tables`'ın gerçekten `messages`/
`conversation_members`'ı listelediği doğrulandı. `mergeIncomingMessage`/
`applyMessageUpdate` — gerçek `realtime-helpers.ts` dosyasının kendisine
karşı (bir kopyasına değil, `node --experimental-strip-types` ile
doğrudan import edilerek) 6 senaryo çalıştırıldı: boş listeye ekleme,
farklı id'yi ekleme, AYNI id'nin (kendi gönderiminin Realtime yankısı)
sessizce yok sayılması (aynı referans döndüğü de doğrulandı), bir
güncellemenin doğru id'yi yerine koyması, bilinmeyen bir id için
güncellemenin no-op kalması, ve bir "herkesten sil" soft-update'inin
içeriği doğru boşaltması — hepsi geçti. Ayrıca `npx tsc --noEmit`,
`npm run lint`, tam `npm run build` (20 rota, değişmedi) sıfır hatayla
geçti.

Tarayıcı tarafı, ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
VE Playwright'ın `page.routeWebSocket()`'iyle **gerçek bir WebSocket
bağlantı denemesini** (Phoenix protokolünün tamamını simüle etmeden,
yalnızca bağlantının kurulmaya çalışıldığını gözlemleyerek) yakalayan 7
senaryoyla doğrulandı: hem `/messages/local?id=…` hem `/messages` sayfası
gerçekten `realtime/v1/websocket` uç noktasına, doğru `apikey` sorgu
parametresiyle bir bağlantı DENEDİĞİ (yani `.channel(...).subscribe()`
gerçekten çağrılıyor, sessizce atlanmıyor); konuşma görünümünün
"Yükleniyor…"da takılı kalmadığı; hem REST hem WebSocket TAMAMEN
erişilemezken (bu sandbox'ın gerçek ağ politikasının birebir simülasyonu)
üç farklı mesajlaşma rotasında sıfır JS hatası oluştuğu — hepsi
doğrulandı. Ayrıca Faz B'nin 19 senaryolu tam paketi (gerçek WebSocket
bağlantısı bu kez taklit edilmeden, engellenmiş haliyle çalışırken) ve
19 rotalık genel dayanıklılık taraması yeniden çalıştırılıp bozulma
olmadığı doğrulandı.

**Dürüstçe belirtilmesi gereken sınırlama:** Bu sandbox'ın ağ politikası
`*.supabase.co`'ya WebSocket erişimini de (REST'e ek olarak) engellediğinden
(Bölüm 21 Faz 6'dan beri tekrarlanan not), Supabase Realtime'ın kendi
Phoenix kanal protokolü (join/heartbeat/postgres_changes payload formatı)
hiç simüle edilmedi — yukarıdaki testler bağlantı DENEMESİNİ ve
birleştirme MANTIĞINI ayrı ayrı doğruluyor, ama "karşı taraf gerçekten
mesaj gönderdiğinde ekranımda anında beliriyor" iddiasının tam, uçtan uca
kanıtı yalnızca kullanıcının migration'ı kendi Supabase projesine
uygulayıp iki gerçek hesapla bizzat denemesiyle mümkün. Bu, Bölüm 17'den
beri bu projede tekrarlanan, dürüstçe belirtilen aynı sınırlamanın
Realtime'a uygulanmış hâli — gerçekten çalıştırılmamış bir testi başarılı
gibi göstermemek adına burada açıkça ayrılıyor.

**Bilinen sınırlamalar:**
- Yeniden bağlanma (reconnect) davranışı tamamen supabase-js'in kendi
  varsayılan mantığına bırakıldı — özel bir "bağlantı koptu" göstergesi/
  manuel yeniden deneme arayüzü eklenmedi (şartname de bunu istemiyordu).
- `RealMessagesProvider`'ın aboneliği yalnızca kendi `conversation_
  members` satırlarını dinliyor — bir konuşmanın DIĞER üyesinin
  `unread_count`'u/durumu değiştiğinde (ör. karşı taraf okudu) bu, o
  kullanıcının KENDİ ekranını etkilemiyor zaten (yalnızca kendi
  `unread_count`'um beni ilgilendiriyor), bu yüzden eksik değil, doğru
  kapsam.
- Bildirimlerin Realtime'ı hâlâ yok (yukarıda "bilinçli tasarım kararı"
  olarak açıklandı) — `/notifications` hâlâ yalnızca sayfa yüklendiğinde
  çekiliyor.
- Mesaj isteği kabul/red (Bölüm 9.9) `conversation_members` üzerinden
  zaten bu abonelikle canlı yansıyor (kendi durumum değiştiğinde liste
  yeniden çekiliyor) — ayrıca test edildi değil ama `RealMessagesProvider`
  aboneliğinin `event: "*"` olması (yalnızca INSERT değil) bunu doğal
  olarak kapsıyor.

### 9.11 Mobil mesajlaşma layout düzeltmesi, iOS klavye desteği, profil yönlendirmeleri, input zoom düzeltmesi

Kullanıcının detaylı, dört parçalı bir teknik şartname üzerine (mobilde
mesaj composer'ının alt navigasyonun arkasında kalması + mesaj geçmişinin
kendi alanında değil tüm sayfanın kaymasıyla scroll olması; iPhone
klavyesi açıldığında layout'un bozulmaması; mesajlaşmada gönderici/alıcı
adı+avatarının VE yorum/yanıt yazarının adı+avatarının gerçek profile
tıklanabilir olması; iOS Safari'nin input'a odaklanınca sayfayı otomatik
yakınlaştırması) dört gerçek sorun da düzeltildi — kapsamı önceden
belirlenmiş 5 fazlı bir plan izlendi (önce mevcut yapı incelendi, sonra
sırayla layout, profil linkleri, input zoom, testler).

**Kök neden — mobil mesajlaşma layout'u:** `AppShell`'in kendi ana içerik
sarmalayıcı zinciri (`src/components/layout/app-shell.tsx`) yalnızca
`min-height`/`flex-1` kullanıyor, hiçbir atada gerçek/sınırlı bir yükseklik
yok. Bu yüzden konuşma görünümünün kök `div`'indeki `h-full` hiçbir zaman
gerçek bir yüksekliğe karşı çözülmüyordu — mesaj listesinin kendi
`overflow-y-auto`'su hiç devreye girmiyor, bunun yerine TÜM SAYFA
büyüyüp kayıyordu, composer da normal doküman akışında olduğundan sayfa
yüksekliğine bağlı olarak mobil alt navigasyonun (`fixed`) arkasında
kalabiliyordu.

**Düzeltme (`src/features/messages/local-conversation-view.tsx`):**
`AppShell`'e veya başka hiçbir paylaşılan layout dosyasına dokunulmadan,
yalnızca konuşma görünümünün kendi kök `div`'i gerçek viewport'a doğrudan
`position: fixed` ile bağlandı (atalardaki yükseklik belirsizliğini
tamamen atlıyor):
```
fixed inset-x-0 top-16 z-10 flex flex-col bg-background
bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:left-64 lg:bottom-0
```
`top-16` app header'ın (`h-16`) yüksekliğine denk geliyor; mobil `bottom`
değeri mobil alt navigasyonun yüksekliği (`4rem`) + iOS güvenli alanı
(`env(safe-area-inset-bottom)`) toplamı — composer artık HİÇBİR ZAMAN alt
navigasyonun arkasında kalamıyor, tam üstünde duruyor; masaüstünde
(`lg:`) alt navigasyon olmadığından `bottom-0`, ve sidebar'ı (`w-64`)
kapatmamak için `lg:left-64` eklendi. Hiçbir atada `position: fixed`
torunları için bir "containing block" oluşturan `transform`/`filter`/
`perspective`/`will-change: transform`/`contain` olmadığı doğrulandı
(`backdrop-blur`, yalnızca `filter` değil `backdrop-filter` kullandığından
bu kategoriye girmiyor). Mesaj listesi konteynerine ayrıca `min-h-0`
eklendi — klasik flexbox tuzağı: `min-h-0` olmadan `flex-1` bir öğe kendi
`overflow-y-auto`'sunu hiç tetiklemeden içeriğine göre büyümeye devam
eder. Sonuç: header ve konuşma başlığı sabit, yalnızca mesaj geçmişi
kendi alanında scroll oluyor, composer alt navigasyonun tam üstünde sabit,
sayfanın kendisi hiç kaymıyor.

**Akıllı scroll (zorla aşağı kaydırmama):** Yeni `isNearBottom`/
`isNearBottomRef` state'i + mesaj listesinin `onScroll`'unda hesaplanan
"alta uzaklık < 80px" eşiği — otomatik aşağı kaydırma yalnızca kullanıcı
zaten alttaysa VEYA yeni mesaj kendi gönderdiği bir mesajsa tetikleniyor;
kullanıcı bilerek eski mesajları okurken yeni bir mesaj geldiğinde
sayfası ZORLA kaydırılmıyor.

**iPhone klavye desteği:** Yeni `src/features/messages/viewport-helpers.ts`
→ saf `computeKeyboardInset({windowInnerHeight, visualViewportHeight,
visualViewportOffsetTop})` fonksiyonu — `window.innerHeight` (klavye için
küçülmeyen layout viewport) ile `window.visualViewport` (klavye açılınca
küçülen/kayan gerçek görünür alan) arasındaki farkı, hiç negatif
olmayacak şekilde hesaplıyor. Bu saf fonksiyon, DOM/`visualViewport`
event wiring'inden BİLİNÇLİ OLARAK ayrı tutuldu — tıpkı Bölüm 21 Faz
C'nin `realtime-helpers.ts`'i gibi, bu sandbox gerçek bir iOS klavyesi
açamadığından, en azından hesaplama MANTIĞININ doğru olduğu doğrudan
(gerçek tarayıcı/klavye olmadan) kanıtlanabiliyor.
`local-conversation-view.tsx`'e eklenen yeni bir `useEffect`,
`visualViewport`'un `resize`/`scroll` olaylarında bu fonksiyonu çağırıp
sonucu CSS'in temel (`4rem` + safe-area) rezervasyonuyla karşılaştırıyor:
klavye bu rezervasyonu aşıyorsa panelin `bottom` inline stilini tam
klavye yüksekliğine ayarlıyor (composer klavyenin hemen üstüne çıkıyor),
aşmıyorsa inline override'ı temizleyip CSS sınıfının değerine geri
dönüyor; kullanıcı alttaysa `requestAnimationFrame` ile son mesaja tekrar
kaydırıyor.

**Profil yönlendirmeleri — var olan `profileHref()` yardımcısı yeniden
kullanıldı, yeni bir mekanizma icat edilmedi:**
- `local-conversation-view.tsx`: konuşma başlığındaki avatar+ad artık
  `<Link href={profileHref(participant)}>` (`post-header.tsx`'in
  yazar linkiyle birebir aynı desen) — tıklanınca gerçek profile
  gidiyor, mesaj balonlarına tıklamayla çakışmıyor (ayrı bir DOM
  kardeşi, balonun içinde değil).
- `src/features/prompts/comment-node.tsx`: her seviyedeki yorum/yanıtın
  hem avatarı hem yazar adı (silinmiş yorum yer tutucusu dahil) artık
  `<Link href={profileHref(comment.author)}>` — beğeni/yanıtla/düzenle/
  sil butonlarıyla (gerçek DOM kardeşleri, iç içe değil) hiç çakışmıyor.
  `@kullanıcıadı` üst-yorum ipucu bilinçli olarak linke çevrilmedi
  (kapsam yalnızca yorumun/yanıtın KENDİ yazarı, ipucu metni değil).

**iOS input auto-zoom düzeltmesi — tek, global, katmansız bir CSS kuralı
(`src/app/globals.css`):**
```css
@media (max-width: 1023px) {
  input, textarea, select { font-size: 16px; }
}
```
iOS Safari, odaklanan bir input/textarea/select 16px'in altında render
olduğunda sayfayı otomatik yakınlaştırıyor — bu projenin TÜM form
alanları (mesaj composer'ı, arama, yorum kutusu, auth formları, profil
düzenleme, istek formu) Tailwind'in `text-sm`/`text-xs`'ini (14px/12px)
kullandığından hepsi bu eşiğin altındaydı. Kural, projenin kendi `lg`
(1024px) masaüstü kırılma noktasına göre kapsandı — masaüstü input
boyutu/tasarımı hiç değişmedi (Playwright ile 14px'te kaldığı doğrulandı).
`@import "tailwindcss"`'ten SONRA, hiçbir `@layer` içine alınmadan
eklendi — bu, Tailwind'in katmanlı `text-sm`/`text-xs` utility
sınıflarını `!important` gerekmeden CSS cascade'inde eziyor. Manuel
pinch-to-zoom erişilebilirliği hiç etkilenmedi (`src/app/layout.tsx`'in
`viewport` export'unda zaten `maximumScale`/`userScalable: false` yok,
değiştirilmedi).

**Gerçekten çalıştırılan testler (hepsi ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, Playwright, bu projenin standart yöntemi;
statik export `npx serve` ile yerel sunuldu):**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
  değişmedi) — sıfır hatayla geçti.
- Yeni saf birim testi (`computeKeyboardInset`, `node --experimental-
  strip-types` ile gerçek kaynak dosyasına karşı, kopyasına değil):
  4/4 senaryo geçti (klavye kapalıyken 0, klavye açıkken doğru pozitif
  yükseklik, `visualViewport` `offsetTop` kaymasını hesaba katma, negatif
  sonucun 0'a kırpılması).
- Yeni `mobile-messaging-test.mjs` (15 senaryo): mobilde header'ın en
  üstte sabit kalması; konuşma başlığının header'ın hemen altında sabit
  durması; composer'ın alt kenarının alt navigasyonun üst kenarını hiç
  aşmaması (üstünde kalması); mesaj listesini kaydırmanın header'ı/
  composer'ı hiç hareket ettirmemesi; sayfanın kendisinin (html/body)
  scroll edilebilir OLMAMASI (yalnızca iç liste); mobilde composer
  input'unun ≥16px olması; `/login` formundaki TÜM input'ların ≥16px
  olması; masaüstünde composer input'unun orijinal 14px'te KALMASI;
  masaüstünde konuşma panelinin sidebar'ın sağından başlaması
  (sidebar'ı kapatmaması); konuşma başlığının gerçek profile doğru
  `href` ile link vermesi VE tıklanınca gerçekten oraya gitmesi; sıfır
  JS hatası — 15/15 geçti (bir test asertion'ı, gerçek bir hata değil,
  GitHub Pages `basePath`'inin trailing-slash farkı yüzünden ilk
  denemede yanlış yazılmıştı, düzeltilip geçti).
- Yeni `comment-profile-link-test.mjs` (5 senaryo): yorum yazarının adının
  gerçek profile link olması; beğeni/"Yanıtla" butonuna tıklamanın
  PROFİLE YÖNLENDİRMEMESİ; yazar adına tıklamanın GERÇEKTEN
  yönlendirmesi; sıfır JS hatası — 5/5 geçti.
- Pre-existing `messaging-faza-test.mjs` (Bölüm 9.8, 17 senaryo — mesaj
  gönderme/yanıtlama/düzenleme/silme/paylaşım): bu round'da yeniden
  çalıştırıldı, 17/17 geçti. **Not:** ilk çalıştırmada test'in kendi mock
  fixture'ı (`conversation_members` mock yanıtı) Bölüm 9.9'un eklediği
  `status` sütununu hiç içermiyordu (test, o sütun eklenmeden ÖNCE
  yazılmıştı) — bu yüzden `/messages` listesi hem "kabul edilmiş" hem
  "bekleyen" filtresinden düşüp boş görünüyordu. Bu, bu round'un
  değişikliklerinin neden olduğu bir regresyon DEĞİL, test fixture'ının
  önceki bir fazın şema değişikliğine göre güncel olmayışıydı — mock
  yanıtına `status: "accepted"` eklenerek düzeltildi, gerçek kod hiç
  değişmedi.
- Pre-existing `messaging-fazb-test.mjs` (Bölüm 9.9, 19 senaryo — mesaj
  istekleri/gizlilik/engelleme/raporlama): yeniden çalıştırıldı, 19/19
  geçti — regresyon yok.
- Pre-existing `messaging-fazc-test.mjs` (Bölüm 9.10, 7 senaryo —
  Realtime WebSocket bağlantı denemesi + tam erişilemezlik dayanıklılığı):
  yeniden çalıştırıldı, 7/7 geçti — regresyon yok.
- Pre-existing 19 rotalık genel dayanıklılık taraması (Supabase'e hiç
  erişilemezken sıfır JS hatası): yeniden çalıştırıldı, bozulma yok.

**AÇIKÇA BELİRTİLMESİ GEREKEN — çalıştırılmayan testler:** Bu sandbox'ta
gerçek bir iOS cihazı/tarayıcısı yok. Aşağıdakiler HİÇ TEST EDİLMEDİ,
yalnızca CSS/JS mantığı ve Playwright'ın simüle ettiği viewport/DOM
davranışı doğrulandı:
- Gerçek bir iPhone'da klavye açılıp kapandığında composer'ın gerçekten
  klavyenin üstünde kalıp kalmadığı (Playwright `visualViewport`'u
  simüle edemiyor — yalnızca `computeKeyboardInset`'in kendisi saf bir
  fonksiyon olarak test edildi, gerçek `resize` event wiring'i canlı bir
  klavyeyle hiç tetiklenmedi).
- Gerçek bir çentikli/Dynamic Island cihazda `env(safe-area-inset-bottom)`
  değerinin gerçekte doğru render olup olmadığı (Playwright/Chromium'da
  bu değer her zaman 0 döner, gerçek bir non-zero safe-area hiç test
  edilemedi).
- Parmakla pinch-to-zoom'un gerçekten çalıştığı (yalnızca viewport
  meta'sının `maximumScale`/`userScalable` KISITLAMADIĞI doğrulandı,
  gerçek bir dokunmatik ekranda parmakla yakınlaştırma hiç denenmedi).
- Ekran döndürme (rotation) sırasında gerçek bir cihazda taşma/boşluk
  olup olmadığı.
- Gerçek Supabase projesine karşı canlı doğrulama (bu sandbox'ın
  `*.supabase.co`'ya erişimi engelleyen ağ politikası yüzünden, Bölüm
  17'den beri tekrarlanan aynı sınırlama).

**Bilinen sınırlamalar / çözülemeyen bir sorun yok:** Bu round'da rapor
edilen 4 sorunun hepsi (mobil layout, klavye, profil linkleri, input
zoom) yukarıdaki kapsamda düzeltildi; testler yeşil. Tek gerçek
belirsizlik, hemen üstteki maddede açıkça listelenen "gerçek cihazda
hiç denenmedi" kalemleri — bunlar bir hata değil, bu sandbox'ın donanım
erişimi olmamasından kaynaklanan bir test kapsamı sınırı.

### 9.12 Bildirim Merkezi tasarımı ve ilgili içeriğe akıllı yönlendirme

Kullanıcının çok ayrıntılı "Bildirim Merkezi Tasarımı ve İlgili İçeriğe Akıllı
Yönlendirme" şartnamesi üzerine, önce mevcut bildirim altyapısı (Bölüm 9.6'nın
kurduğu, Bölüm 9.9'un genişlettiği sistem), veri modeli, yorum ağacının
genişletme/scroll mekanizması (Bölüm 9.4/9.5) ve ilgili sayfa rotaları
denetlendi. Kural aynen izlendi: **mevcut bildirim üretim kuralları
(kim-ne-zaman bildirim alır) hiç değiştirilmedi**, yalnızca (a) merkezin
arayüzü şartnameye göre yenilendi ve (b) her bildirimin GERÇEK hedefine
(genel sayfa değil, tam yorum/yanıt/mesaj) yönlendirme + otomatik
genişletme/scroll/vurgu eklendi.

**AŞAMA 1 denetim bulgusu — şema, önerilen sütunları hiç içermiyordu:**
`notifications` tablosu (Bölüm 18/19) yalnızca `recipient_id`, `actor_id`,
`type`, `message` (düz bir olay cümlesi) ve `target_href` (düz bir URL
metni) tutuyor — şartnamenin önerdiği `post_id`/`comment_id`/`reply_id`/
`request_id`/`message_id` gibi ayrı sütunlar hiç yok. Şartnamenin kendi
kuralına uyarak ("Bütün alanları körü körüne ekleme... eşdeğer mevcut
alanları değerlendir") yeni bir sütun seti YARATILMADI — bunun yerine, bu
projenin zaten Bölüm 21'den beri kullandığı "gerçek kimliği query
string'te taşı" deseni (`promptHref`/`requestHref`/`messageHref`) doğal
olarak genişletildi: `target_href`'e tek, genel bir `hl=<tür>:<id>` sorgu
parametresi eklendi (`supabase/migrations/20260919230000_notification_
targeting_and_previews.sql`). `hl` değerleri: `post:<promptId>` (beğenilen/
remixlenen gönderinin kendisi), `comment:<commentId>` (beğenilen/
yanıtlanan/yeni eklenen yorum ya da yanıt — hangisi olduğu zaten
`notifications.type`'tan belli), `response_new:<responseId>` /
`response_selected:<responseId>` / `response_unselected:<responseId>` (bir
istek yanıtı — üç alt durum farklı ikon/vurgu gerektirdiğinden ayrı ayrı
adlandırıldı), `message:<messageId>`. İstek KAPANMA bildiriminin `hl`'i
yok (tek bir yanıta değil isteğin kendisine işaret ediyor) — bu, istemci
tarafında "hl yoksa kapanma" ayrımını da kendiliğinden sağlıyor.

**AŞAMA 1 denetim bulgusu — içerik önizlemesi hiç yoktu:** `message` alanı
yalnızca "Yorumunu beğendi." gibi düz bir olay cümlesiydi; yalnızca istek
yanıtı bildirimleri zaten isteğin başlığını gömüyordu (var olan bir
konvansiyon). Aynı konvansiyon (dinamik metni doğrudan `message`'a
gömme — ayrı bir "preview" sütunu/sistemi YARATMADAN) beğeni/yorum/yanıt/
remix/mesaj bildirimlerine de genişletildi: yeni `public.truncate_
preview(text, n)` SQL yardımcı fonksiyonu (≈90 karakterde kırpma) ile her
üretici artık gerçek gönderi başlığını/yorum metnini/mesaj önizlemesini
kendi cümlesine gömüyor — ör. `'Yorumunu beğendi: "Renk paleti çok iyi
olmuş."'`. Mesaj önizlemesi, mesaj yalnızca paylaşılan içerikse (metin
yok) `previewTextFor()`'un (Bölüm 9.8) aynı düşen sırasını izliyor ("bir
prompt paylaştı" vb.).

**Değişen 7 bildirim üreticisi (hepsi `create or replace`, trigger'lar
DEĞİŞMEDİ):** `notify_prompt_like`, `notify_comment_like`, `notify_
comment_reply`, `notify_new_remix`, `notify_new_request_response`,
`notify_selected_response`, `notify_new_message`. **Değişmeyen 2 üretici**
(zaten doğru, kapsam dışı): `notify_new_follow`, `notify_request_closed`
(yalnızca `message`/`target_href`'i sabit kaldı, çünkü zaten tek bir
yanıta değil isteğin kendisine işaret ediyor).

**Gerçek regresyon riski bulundu ve düzeltildi — silme temizliği artık
önek eşleşmesi kullanıyor:** Bölüm 19'un `cleanup_notifications_for_
deleted_prompt`/`_request` fonksiyonları `target_href`'e TAM eşitlik
(`= '/prompts/local?id=' || old.id`) ile bakıyordu. `target_href` artık
bazı bildirimlerde `&hl=...` ile uzadığından bu tam eşleşme o satırları
ARTIK YAKALAMAZDI — bir gönderi silindiğinde ona işaret eden (ama `hl`
taşıyan) bildirimler kırık bir bağlantıya işaret etmeye devam ederdi. Her
ikisi de önek eşleşmesine (`like '/prompts/local?id=' || old.id || '%'`)
çevrildi; UUID'ler sabit uzunlukta olduğundan bir UUID başka bir UUID'nin
öneki asla olamaz, bu yüzden önek eşleşmesi yanlış bir satırı asla
yakalamaz — gerçekten test edildi (aşağıya bakınız).

**AŞAMA 1-3 — Bildirim merkezi UI (`src/app/(app)/notifications/page.tsx`
ve `src/features/notifications/`):**
- **Başlık satırı:** "Bildirimler" + "Tümünü okundu işaretle" aksiyonu
  aynı satırda (`flex-wrap` ile mobilde taşmadan alt satıra düşüyor).
  Yeni `markAllNotificationsRead(userId)` (`lib/supabase/notifications.ts`
  — tek bir toplu `UPDATE ... WHERE recipient_id=… AND is_read=false`,
  okunmamış sayısı kadar ayrı istek DEĞİL) + `NotificationsProvider`'a
  `markAllRead` aksiyonu eklendi. Hiçbir okunmamış yoksa buton devre dışı.
- **Kategori filtreleri** (`notification-category-filter.tsx`, YENİ):
  Tümü/Gönderiler/İstekler/Takip/Mesajlar/Sistem — yatay kaydırılabilir
  pilller (`overflow-x-auto`, `flex-nowrap` niyetinde `shrink-0`),
  mobilde sayfa genişliğini hiç bozmuyor. Yeni `src/lib/notification-
  utils.ts` → `NOTIFICATION_CATEGORY: Record<NotificationType,
  NotificationCategory>` (`like`/`comment`/`comment_reply`/`remix` →
  "posts", `request_response` → "requests", `follow` → "follow",
  `message`/`message_request` → "messages", `system` → "system").
  Filtreleme tamamen istemci tarafında (`/notifications/page.tsx`'in
  kendi `useState` + `useMemo`'su) — zaten yüklenmiş listeyi filtreliyor,
  hiçbir side-effect/fetch yok, bu yüzden kategori değiştirmek YAPISAL
  OLARAK hiçbir şeyi okundu işaretleyemez (şartnamenin özellikle istediği
  garanti).
- **İkonlar** (`notification-row.tsx` tamamen yeniden yazıldı):
  Eskiden `type` başına TEK bir ikon vardı (ör. `request_response` her
  zaman `Sparkles`) VE bir `actor` varsa ikon hiç gösterilmiyordu (avatar
  onun yerini alıyordu). Artık avatar + ikonun İKİSİ BİRDEN gösteriliyor
  — ikon, avatarın sağ-alt köşesine bindirilmiş küçük, dairesel bir rozet
  (Instagram'ın bildirim deseniyle aynı fikir); actor yoksa (yalnızca
  `system` bugün) tek başına bir ikon dairesi. `type` tek başına iki
  durumu ayırt edemediğinden (`like` hem gönderi hem yorum/yanıt
  beğenisi olabilir; `request_response` iş akışının dört farklı anını
  kapsıyor), bu ikisi ayrıca `hl`'in TÜRÜNE (`kind`) bakıyor — yeni
  `getNotificationIconKey()` + statik `NOTIFICATION_ICONS` nesnesi
  (`notification-utils.ts`): `like_post`→Heart, `like_comment`→
  MessageCircleHeart, `comment`→MessageCircle, `comment_reply`→
  MessageCircleReply, `remix`→Repeat2, `follow`→UserPlus, `request_
  response_new`→Code2, `_selected`→CheckCircle2, `_unselected`→RotateCcw,
  `_closed`(hl yok)→Lock, `message`/`message_request`→Mail, `system`→
  Bell. **Teknik not:** ikon seçimi bir FONKSİYON DEĞİL, bir string
  anahtarla düz bir nesneye (`NOTIFICATION_ICONS[key]`) bakan bir
  ifade olarak yazıldı — `eslint-plugin-react-hooks`'un "static
  components" kuralı, bir switch/if zinciriyle döndürülen bir bileşen
  referansını "render sırasında yeniden oluşturulabilir" diye
  reddediyor; düz nesne indexleme (bu projede zaten `ICONS[type]` olarak
  kullanılan eski desenle birebir aynı) buna takılmıyor. Test/hata
  ayıklama için rozet sarmalayıcısına `data-notification-icon={key}`
  eklendi (`data-message-id` ile aynı gerekçe, Bölüm 9.8).
- **Açıklama + önizleme:** yukarıda anlatıldığı gibi hepsi artık `message`
  alanına sunucu tarafında gömülü geliyor; `NotificationRow` yalnızca
  `{actor.displayName} {message}`'ı `line-clamp-2` ile gösteriyor (uzun
  bir önizleme kartı gereksiz yere büyütmesin diye — şartnamenin "kontrollü
  biçimde kısaltılsın" isteği).
- **Okunmamış görünümü:** var olan hafif arka plan tonu (`bg-accent-
  surface/30`) + nokta korundu, ek olarak ekran okuyucular için `sr-only`
  "Okunmadı" etiketi eklendi (Aşama 8'in "yalnızca renkle anlamlandırılmasın"
  ilkesi unread göstergesine de uygulandı).

**AŞAMA 4-6 — kesin hedefe yönlendirme + otomatik genişletme/scroll/vurgu:**
Var olan mekanizmalar yeniden kullanıldı, paralel bir sistem KURULMADI:
- **Yorum/yanıt** (`comment-section.tsx`/`comment-node.tsx`): Bölüm 9.4'ün
  zaten kurduğu `nodeRefs`/`pendingScrollToId`/`expandedIds` altyapısı
  (önceden yalnızca "yeni gönderilen kendi yanıtına kaydır" için
  kullanılıyordu) yeni bir `highlightCommentId` prop'una bağlandı: yorumlar
  yüklenince hedef yorumun TÜM ata zinciri (`parentId` takip edilerek)
  `expandedIds`'e ekleniyor (kapalı bir "N yanıtı göster" zincirini
  otomatik açıyor), `pendingScrollToId` hedefe ayarlanıyor (var olan
  scroll effect'i artık hem `comments` hem `expandedIds` değişiminde
  tetikleniyor — ata genişlemeden düğüm DOM'da yok), ve yeni bir
  `highlightedId` state'i `CommentTree`'ye eklenip `CommentNode`'da
  yumuşak mor bir `bg-primary/10 ring-1 ring-primary/40` flaşı olarak
  render ediliyor (2.5 saniye sonra `setTimeout` ile temizleniyor —
  "göz yoran yanıp sönme yok" kuralına uyarak tek, yumuşak bir geçiş).
  Hedef yorum hiç bulunamazsa (`Map`'te yoksa — gerçekten silinmiş ve
  hiç yanıtı olmadığından Bölüm 9.5'in soft-delete'i bile onu
  korumamış) dürüst bir "Bu yorum artık mevcut değil." satırı
  gösteriliyor, sayfa çökmüyor.
- **Gönderi/remix** (`prompt-detail-view.tsx`): `hl=post:<id>` — burada
  "kaydırma" gerekmiyor (gönderi zaten sayfanın tek içeriği), yalnızca
  kök konteynerin kendisi aynı yumuşak mor flaşla 2.5 saniyeliğine
  vurgulanıyor.
- **İstek yanıtı** (`request-detail-view.tsx`): `hl=response_new/
  selected/unselected:<id>` — yanıt listesi (`fetchPromptsForRequest`)
  yüklenince hedef id aranıyor; bulunursa o `PromptCard`'ı saran div
  (yeni bir `responseRefs` haritasıyla, yorum ağacıyla birebir aynı
  desen) hedefe kaydırılıp aynı flaşla vurgulanıyor; bulunamazsa "Bu
  yanıt artık mevcut değil." Birden fazla yanıt varken YANLIŞ yanıtın
  vurgulanmadığı özellikle test edildi (aşağıya bakınız) — şartnamenin
  vurguladığı tam senaryo.
- **Mesaj** (`local-conversation-view.tsx`/`message-bubble.tsx`):
  `hl=message:<id>` — mesaj dizisi zaten TAMAMEN (sayfalama olmadan)
  yüklendiğinden (Bölüm 21 Faz 6), ekstra bir "içerik henüz yüklenmedi"
  bekleme mekanizması gerekmedi: hedef id `messages` state'inde aranıyor,
  varsa `data-message-id` özniteliğiyle (Bölüm 9.8'den beri zaten var)
  DOM'da bulunup kaydırılıp `MessageBubble`'ın yeni `isHighlighted`
  prop'uyla aynı flaşla vurgulanıyor; yoksa (gerçekten silinmiş VEYA bu
  görüntüleyici tarafından "benden sil" ile gizlenmiş — `fetchMessages`
  ikisini de zaten filtreliyor) "Bu mesaj görüntülenemiyor." — şartnamenin
  istediği TAM metin, gizlenen bir mesajın içeriğini asla ifşa etmeden.
- **Takip:** zaten `profileHref()` ile doğru gerçek profile gidiyordu
  (Bölüm 21 Faz 6), bu görevde değişmedi.

**Ortak tasarım kararı — üç ayrı highlight mekanizması, tek bir paylaşılan
görsel dil:** Yorum/yanıt, istek yanıtı ve mesaj vurgusu üçü de AYNI CSS
kalıbını (`-m-1.5 bg-primary/10 p-1.5 ring-1 ring-primary/40 transition-
colors duration-700`, gönderi için kenar boşluğu farkı olmadan aynı ton)
ve aynı 2.5 saniyelik süreyi kullanıyor — üç yerde üç farklı "vurgu
sistemi" icat etmek yerine (şartnamenin "gereksiz yeni sistemler kurma"
ilkesine uygun) tek bir tutarlı his. `-m-1.5`/`p-1.5` çifti kasıtlı:
vurgulanmayan normal görünümde HİÇBİR boşluk/hizalama değişikliği
olmasın diye (negatif kenar boşluğu eklenen dolgunun yerini tam telafi
ediyor) — bu, vurgusuz binlerce yorumun/yanıtın/mesajın günlük
görünümünü bir piksel bile etkilemiyor.

**Nasıl doğrulandı — SQL/veri katmanı (gerçekten çalıştırıldı, taklit
değil):** Yeni migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile
sıfırdan açılan geçici bir veritabanına, `auth.users`/`extensions` için
minimal bir taklit + gerçek Supabase projesindeki gibi `anon`/
`authenticated` rol simülasyonuyla (önceki fazlarla aynı yöntem) önceki
17 migration'la birlikte gerçekten uygulandı (storage migration'ı,
önceki fazlarda olduğu gibi bu testin kapsamı dışında bırakıldı — bu
görev storage'a hiç dokunmuyor) ve 9 grup senaryo gerçekten çalıştırılıp
doğrulandı: gönderi beğenisi → doğru önizleme + `hl=post:`; yorum/yanıt
beğenisi → beğenilen metnin önizlemesi + `hl=comment:`; doğrudan yorum
→ yeni yorumun kendi metni + `hl=comment:`; yoruma yanıt → yanıtın kendi
metni + `hl=comment:<yanıtın kendi id'si>`; remix → yeni remixin kendi
başlığı + `hl=post:<remixin id'si>`; istek yanıtı yaşam döngüsünün TAMAMI
(yeni yanıt → `hl=response_new:`, seçilme → `hl=response_selected:`,
seçim kaldırma → `hl=response_unselected:` — ÜÇÜ DE doğru response id'sini
taşıyor, birbirine karışmadan — ve manuel kapatma → HİÇ `hl` yok);
mesaj (gerçek metinli VE yalnızca paylaşılan-içerikli, önizleme metni
ikisinde de doğru); ve **kritik regresyon testi** — silme temizliğinin
artık `&hl=...` ile uzamış href'lere karşı da doğru çalıştığı (bir
gönderi/istek silinince ona işaret eden TÜM bildirimlerin, `hl`'li
olanlar dahil, gerçekten silindiği, ilgisiz bildirimlerin ETKİLENMEDİĞİ).
Ayrıca RLS ile `anon`/`authenticated` rolleri arasında bir kullanıcının
yalnızca KENDİ bildirimlerini okuyabildiği ayrıca doğrulandı. Test
veritabanı işlem bitince silindi.

**Test sırasında ayrıca keşfedilen, bu görevin KAPSAMI DIŞINDA, ÖNCEDEN
VAR OLAN bir şema kısıtlaması (Bölüm 9.6/9.7'nin remix-silme bulgusuyla
BİREBİR AYNI KATEGORİDEN, farklı bir FK üzerinde):** `prompts.request_id`
(Bölüm 18) `on delete set null` ile tanımlı, ama `prompts_origin_shape`
CHECK kısıtı `origin_type='request_response'` olan bir satırda `request_
id`'nin ASLA null olamayacağını şart koşuyor. Sonuç: gerçek bir yanıtı
OLAN bir prompt isteği BUGÜN DE (bu görevden önce de) silinmeye
çalışılırsa, silme veritabanı hatasıyla reddediliyor — `RequestDetailView`
"İsteği sil" butonu şu an bu durumda kullanıcıya bir hata gösterir
(uygulama çökmez, ama silme başarısız olur; bu buton bugün `hasSelection`
durumundan bağımsız her zaman gösteriliyor, yani bir kullanıcı gerçek bir
yanıtı olan isteğini silmeyi denerse bu hatayı alır). Bu, bildirim
sistemiyle hiç ilgisi olmayan, bu görevin test senaryosu hazırlanırken
(Test 9f, bilgi amaçlı) tesadüfen yeniden keşfedilip doğrulanmış (hipotez
değil, gerçekten üretilmiş) bir bulgu — **bu görevin kapsamına
alınmadı**, remix-silme bulgusuyla aynı gerekçeyle (düzeltmek, isteğin
silme davranışına dair ayrı bir mimari karar gerektiriyor: ya yanıtları
da cascade silmek ya da `origin_type`'ı "kaynağı silinmiş" durumuna
geçirecek bir soft-delete eklemek). Test senaryosu bu yüzden yanıtı
OLMAYAN, izole bir istek üzerinde çalışacak şekilde düzenlendi. **Kullanıcının
karar vermesi gereken bir sonraki adım.**

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, Playwright, bu projenin standart yöntemi):**
Statik export `npx serve` ile yerel sunulup 32 senaryoluk yeni bir test
paketiyle doğrulandı — hepsi sıfır JS hatasıyla geçti: bildirim merkezinde
14 bildirimin tümü render ediliyor; her kategori filtresi doğru sayıda
satır gösteriyor (Gönderiler 6, İstekler 4, Mesajlar 2, Takip 1, Sistem
1); kategori değiştirmenin HİÇBİR PATCH tetiklemediği (okundu işaretlemediği);
**14 bildirim türü/alt-türünün HER BİRİNİN kendi, doğru, farklı ikonunu
gösterdiği** (like_post ≠ like_comment ≠ comment ≠ comment_reply ≠ remix
≠ follow ≠ request_response'un dört alt durumu ≠ message ≠ message_request
≠ system); "Tümünü okundu işaretle"nin TEK bir toplu PATCH'le (`is_read=
eq.false` filtresiyle, tek tek DEĞİL) tüm okunmamış noktalarını
kaldırdığı; 2 seviye iç içe bir yanıta (yorum → yanıt → yanıtın yanıtı)
tıklanan bir bildirimin İKİ ata seviyesini de otomatik açıp doğrudan o
düğüme kaydırdığı ve onu flaşladığı, flaşın ~2.5 saniye sonra kalktığı;
var olmayan bir yoruma giden bir bildirimin sayfayı çökertmeden "Bu yorum
artık mevcut değil." gösterdiği (gönderinin geri kalanı bozulmadan);
gönderi-beğenisi bildiriminin gönderinin tamamını flaşladığı; **iki
yanıtlı bir istekte, seçilen yanıtın DOĞRU kartının flaşlanıp diğerinin
HİÇ etkilenmediği**; mesaj bildiriminin doğru mesajı bulup flaşladığı;
erişilemeyen bir mesaj bildiriminin "Bu mesaj görüntülenemiyor." gösterip
konuşmanın geri kalanını bozmadığı; takip bildiriminin gerçek profile
gittiği VE tıklamanın gerçek bir tekil PATCH (yalnızca o bildirim için)
tetiklediği; ve son olarak Supabase'e (REST) hiç erişilemezken bildirim
bağlantılı 4 rotanın (`/notifications`, bir yorum/yanıt/mesaj hedefli
derin bağlantılar dahil) sıfır JS hatasıyla zarifçe davrandığı. Ayrıca bu
oturumun önceki fazlarına ait regresyon paketleri yeniden çalıştırıldı,
hiçbiri bozulmadı: Faz A (17/17), Faz B (19/19), Faz C (7/7), mobil
mesajlaşma/klavye/profil-linki/input-zoom paketi (15/15), yorum-profil-
linki paketi (5/5), yorum düzenleme/silme paketi (8/8), eski (kategori
filtresiz) bildirim listesi paketi (16/16), ve 19 rotalık genel
dayanıklılık taraması (sıfır JS hatası). **Tek istisna, bu görevden
bağımsız, önceden var olan bir yorum-ağacı regresyon paketindeki
(`comment-tree-test.mjs`) bir senaryo:** "sayfa yenilenince beğeni sayısı
kalıcı kalıyor mu" testi başarısız oldu — kök neden incelendi ve bunun bu
görevin hiç dokunmadığı bir dosyadan (test'in kendi mock GET `prompt_
comments` yanıtı, bir beğeni POST/DELETE'inden SONRA `like_count`'u hiç
güncellemiyor — gerçek bir Supabase projesinde bunu Bölüm 19'un `SECURITY
DEFINER` sayaç trigger'ı yapar, bu mock'ta hiç simüle edilmemiş)
kaynaklandığı doğrulandı — bu görevin comment-node.tsx/comment-section.tsx
değişiklikleriyle hiçbir ilgisi yok, bu testin KENDİSİ bu görevden önce de
aynı şekilde başarısız olurdu. `npx tsc --noEmit`, `npm run lint`, tam
`npm run build` (20 rota, değişmedi) sıfır hatayla geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919230000_notification_
targeting_and_previews.sql`'i Dashboard'da uygulayıp bizzat denemesi
gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- Yorum/yanıt bağlamı ("gerekiyorsa yanıt verilen yorumun kısa bağlamı
  gösterilsin") yalnızca yanıtın KENDİ metniyle sınırlı tutuldu, üst
  yorumun ayrıca gömülmesi eklenmedi — şartname de bunu zaten koşullu
  ("gerekiyorsa") bıraktı, ek bir DB join gerektirirdi.
- Toplu "tümünü sil" eklenmedi — şartname yalnızca "tümünü okundu
  işaretle"yi istedi.
- Sistem bildirimi üretimi hâlâ yok (Bölüm 9.6'dan beri bilinen sınırlama)
  — uygulamada bir duyuru yazma arayüzü hiç yok, icat edilmedi.

**Bilinen sınırlamalar:**
- **Eski (bu migration'dan önce oluşmuş) bildirim satırlarında `hl` yok:**
  `like` tipi için varsayılan olarak "gönderi beğenisi" ikonuna (Heart),
  `request_response` için "kapandı" ikonuna (Lock) düşerler — küçük,
  yalnızca geçmiş veri için geçerli bir kozmetik yaklaşıklık, dürüstçe
  belirtildi.
- **`prompts.request_id` üzerindeki önceden var olan şema kısıtlaması**
  (yukarıda ayrıntılı açıklandı) — kullanıcının karar vermesi gereken bir
  sonraki adım, bu görevin kapsamına alınmadı.
- Mesaj/yorum/yanıt önizlemeleri o olay anında `message` metnine gömüldüğü
  için, içerik SONRADAN düzenlenir/silinirse bildirimdeki önizleme
  DEĞİŞMEZ (bir "anlık görüntü" — tıpkı istek başlığı önizlemesinin Bölüm
  9.2'den beri zaten yaptığı gibi) — bilinçli, dokümante edilmiş bir
  davranış, yeni bir sorun değil.
- Bildirimlerde gerçek zamanlı (Realtime) güncelleme hâlâ yok (Bölüm 21
  Faz 6'dan beri bilinen sınırlama) — kategori filtresi/vurgu bu
  sınırlamayı değiştirmedi.

---

**Sonraki adım:** Mesajlaşma genişletmesinin 3 fazı da (Faz A — Bölüm
9.8, Faz B — Bölüm 9.9, Faz C — Bölüm 9.10) TAMAMLANDI. Bunun ardından
Bölüm 9.12 (Bildirim Merkezi tasarımı ve akıllı yönlendirme) de
TAMAMLANDI. **Kullanıcının yapması gereken manuel adım (Dashboard →
SQL Editor), sırayla:**
1. `supabase/migrations/20260919210000_messaging_requests_privacy_
   blocking.sql` (uygulandı — bkz. Bölüm 9.9).
2. `supabase/migrations/20260919220000_messaging_realtime.sql` (uygulandı
   — bkz. Bölüm 9.10; bu olmadan Realtime abonelikleri sessizce hiç olay
   almaz, hiçbir hata vermeden; mesajlaşma yalnızca Faz A/B'nin
   sayfa-yüklemede-çek davranışıyla çalışmaya devam eder).
3. `supabase/migrations/20260919230000_notification_targeting_and_
   previews.sql` (YENİ — bkz. Bölüm 9.12; bu olmadan bildirimler eskisi
   gibi çalışmaya devam eder ama içerik önizlemesi/kesin hedef bilgisi
   (`hl=`) taşımaz, bu yüzden bildirim merkezindeki ikonlar ve "ilgili
   içeriğe akıllı yönlendirme" gerçek veriyle çalışmaz).
4. `supabase/migrations/20260919240000_message_reactions.sql` (YENİ —
   bkz. Bölüm 9.13; bu olmadan emoji tepkileri hiç yüklenmez/yazılmaz —
   frontend RLS reddiyle sessizce başarısız olur).

### 9.13 Mesaj işlem menüsü, emoji tepkileri, konuşma üst barı

Kullanıcının detaylı "Mesajlaşma Sistemi, Mesaj İşlemleri, Emoji
Tepkileri ve Üst Menü Güncelleme" şartnamesi üzerine, önce mevcut mesaj
baloncuğu (`message-bubble.tsx`), mesaj işlem akışı (Bölüm 9.8'in "Yanıtla/
Düzenle/Benden sil/Herkesten sil" satırı), süre sınırı (Bölüm 9.8'in RLS
`with check`'i), engelleme/şikâyet sistemi (Bölüm 9.9), ve mesajlaşma üst
barı (Bölüm 9.8/9.11) baştan sona incelendi. Emoji/reaction altyapısı
(`grep -rli "emoji|reaction"`) bu depoda daha önce HİÇ yoktu — bu yüzden
Aşama 2 sıfırdan, ama projenin zaten kurulu iki deseni (comment_likes'ın
bileşik-PK "bir kullanıcı bir hedef" kuralı + messages'ın kendi
`conversation_id` üzerinden doğrudan RLS/Realtime deseni) birebir izlenerek
inşa edildi.

**Değiştirilen/eklenen dosyalar:**
- `supabase/migrations/20260919240000_message_reactions.sql` (YENİ) —
  `message_reactions(message_id, conversation_id, user_id, emoji,
  created_at)`, PK `(message_id, user_id)` (aynı kullanıcı+mesaj için
  ASLA iki satır olamaz — atomiklik veritabanı seviyesinde), RLS (okuma:
  konuşma üyeleri; yazma: yalnızca kendi adına + gerçekten o mesajın
  `conversation_id`'siyle eşleşen bir `conversation_id` — sahtecilik
  `WITH CHECK` alt sorgusuyla engelleniyor), `REPLICA IDENTITY FULL` +
  `supabase_realtime` publication'ına ekleme (DELETE olayının
  `conversation_id` filtresini değerlendirebilmesi için gerekli — bu,
  Bölüm 21 Faz C'nin `messages` için gerekmediği bir durum, çünkü orada
  yalnızca INSERT/UPDATE dinleniyor).
- `src/lib/supabase/message-reactions.ts` (YENİ) — `fetchReactionsForConversation`
  (TEK sorgu, tüm konuşma için — N+1 yok), `setMessageReaction` (gerçek
  `upsert` — `onConflict: "message_id,user_id"`, atomik ekleme/değiştirme),
  `removeMessageReaction`.
- `src/features/messages/message-bubble-types.ts` (YENİ) — `DeleteMode`/
  `MessageBubbleActions`/`MessageReactionEntry` — `message-bubble.tsx` ↔
  `message-action-menu.tsx` arasındaki dairesel import'u önlemek için
  ayrı bir dosyaya çıkarıldı (ikisi birbirini import ediyordu).
- `src/features/messages/message-time-limit.ts` (YENİ) — `MESSAGE_EDIT_
  WINDOW_MS = 15 * 60 * 1000` + `canEditOrDeleteMessage()`. Süre,
  KAFADAN DEĞİŞTİRİLMEDİ — Bölüm 9.8'in `messages` UPDATE RLS
  politikasındaki (`20260919200000_messaging_content_and_edit.sql`)
  gerçek, ZATEN VAR OLAN `created_at > now() - interval '15 minutes'`
  kısıtıyla birebir aynı 15 dakika. Bu dosya yalnızca o backend kuralının
  istemci tarafı bir AYNASI — gerçek, atlanamaz garanti hep backend'de.
- `src/features/messages/use-popover-align.ts` (YENİ) — menü/emoji
  seçicinin, ekran kenarına yakın bir mesajda taşmaması için, açıldıktan
  sonra kendi `getBoundingClientRect()`'ini ölçüp gerekirse tarafını
  değiştiren küçük bir hook (bağımlılık eklemeden — bu proje harici bir
  positioning kütüphanesi kullanmıyor).
- `src/features/messages/emoji-picker.tsx` (YENİ) — Aşama 2'nin zorunlu
  altı emojisi (❤️ 😂 😮 😢 😡 👍) + "➕" (sabit, ikinci bir 12 emojilik
  satır açıyor — tam bir emoji klavyesi/kütüphanesi yok, kasıtlı olarak
  eklenmedi).
- `src/features/messages/message-action-menu.tsx` (YENİ) — Aşama 3/4'ün
  iki ayrı seçenek kümesi, `message.senderId === currentUserId`'den
  (asla baloncuğun ekrandaki tarafından değil) hesaplanıyor. Rapor
  akışı buraya taşındı (`ReportMessageMenuItem`).
- `src/features/messages/message-bubble.tsx` — kapsamlı yeniden yazım:
  eski "her zaman görünür metin satırı" (Yanıtla/Düzenle/Benden sil/
  Herkesten sil/Şikayet Et hepsi düz `<button>` olarak sürekli görünürdü)
  kaldırıldı, yerine hover/tap ile açılan iki ikon (emoji + "⋮") ve
  onların popover'ları geldi. Reaction rozetleri bubble'ın köşesine
  `position:absolute` ile bindiriliyor (sayı/sayaç YOK — yalnızca emoji
  glifi).
- `src/features/messages/realtime-helpers.ts` — `upsertReaction`/
  `removeReactionRow` (saf fonksiyonlar, `mergeIncomingMessage`/
  `applyMessageUpdate` ile aynı desen) eklendi.
- `src/features/messages/local-conversation-view.tsx` — üst bar tamamen
  yeniden düzenlendi (geri ok + avatar/isim linki + `ProfileMoreMenu`),
  `activeMessageId` state'i (mobil dokunma koordinasyonu), `reactionRows`
  state'i + yükleme + Realtime aboneliği + `handleReact`, engelleme artık
  `useBlockState` (profil sayfasıyla BİREBİR AYNI hook — Aşama 8'in
  "profil menüsüyle tutarlılık" şartını gerçek kod paylaşımıyla
  karşılıyor, iki ayrı sistem değil).

**Mesaj menüsünün masaüstü/mobil davranışı:** İki küçük ikon (emoji +
"⋮"), bubble'ın `flex` satırında baloncuğun karşı tarafında (kendi
mesajında solunda, karşı tarafın mesajında sağında) duruyor;
`opacity-0 group-hover:opacity-100` ile masaüstünde salt CSS hover'la
görünüyor, `isActive` prop'uyla (üst bileşende tutulan TEK bir
`activeMessageId`) mobilde dokunmayla görünüyor — bir mesaja dokunmak
diğerinin ikonlarını/açık menüsünü otomatik kapatıyor (aynı state, tek
değer). Menü/emoji popover'ı `position:absolute`, bubble'ın konumu hiç
değişmiyor. Boş bir listeye dokunmak (`event.target === event.
currentTarget` kontrolü) `activeMessageId`'i sıfırlıyor.

**Bulunan gerçek hata (bu görev sırasında, kendi kodumda):** İlk
uygulamada menü öğelerinin `onClick`'i, bubble'ın kök `div`'indeki
mobil-aktivasyon `onClick`'ine kadar bubble'lıyordu (`stopPropagation`
yoktu) — "Herkesten sil"in İLK tıklaması (onay adımını göstermesi
gereken) `deleteConfirm` state'ini set ediyordu AMA aynı tıklama bubble'ın
kendi "aktif mesajı değiştir" handler'ını da tetikleyip menüyü hemen
kapatıyordu, onay adımı hiç görünmüyordu. Gerçek bir Playwright testinde
(`messaging-faza-test.mjs`'in güncellenmiş sürümü) yakalanıp
`event.stopPropagation()`'ın ikon+popover sarmalayıcısına eklenmesiyle
düzeltildi — ayrıntı aşağıdaki "Nasıl doğrulandı" bölümünde.

**Süre sınırı — bulundu, DEĞİŞTİRİLMEDİ:** Mevcut sistemde düzenleme VE
herkesten silme için **15 dakika** — Bölüm 9.8'in `20260919200000_
messaging_content_and_edit.sql`'indeki `messages` UPDATE RLS
politikasının `with check (... and created_at > now() - interval '15
minutes')` kısmı. Bu görevde bu değer OKUNDU, hiç değiştirilmedi.

**Süre dolunca seçenekler nasıl kaldırılıyor:** `MessageActionMenu`,
`canEditOrDelete` prop'unu (parent'ın `canEditOrDeleteMessage(message.
createdAt, nowTick)` çağrısından) alıyor — `false` ise Düzenle ve
Herkesten sil DOM'dan tamamen kaldırılıyor (disabled buton değil), yerine
küçük, sade iki satır: "Düzenleme süresi doldu." / "Herkesten silme
süresi doldu." (yalnızca süre gerçekten dolduğunda render ediliyor).
`nowTick` state'i menü AÇILDIĞI anda `Date.now()`'a sıfırlanıyor ve menü
açık kaldığı sürece 5 saniyede bir güncelleniyor — kullanıcı sayfayı
yenilemeden, menüyü açık tutarken süre dolarsa seçenekler canlı olarak
kayboluyor (5 saniyelik bir çözünürlük, 15 dakikalık bir pencere için
fazlasıyla yeterli).

**Backend tarafında nasıl korunuyor:** Yukarıdaki istemci mantığı
YALNIZCA arayüzü kontrol ediyor — asıl, atlanamaz garanti Bölüm 9.8'den
beri zaten var olan RLS `with check`'i: `editMessage`/
`deleteMessageForEveryone` (`src/lib/supabase/messages.ts`) her zaman
gerçek bir UPDATE gönderiyor, ve 15 dakikayı geçmiş bir mesaj için
Postgres bu UPDATE'i `WITH CHECK` ihlaliyle REDDEDİYOR (`.maybeSingle()`
`null` döner, kod bunu "Bu mesaj artık düzenlenemez/silinemez (15
dakikalık süre dolmuş olabilir)" hatasına çeviriyor — bu hata mesajı ve
davranış Bölüm 9.8'den beri değişmedi). Cihaz saati değiştirilerek bu
aşılamaz çünkü kontrol `created_at` (sunucunun kendi INSERT zamanı) ile
`now()`'ı (sunucunun kendi saati) karşılaştırıyor, istemcinin gönderdiği
hiçbir zaman bilgisine güvenmiyor. Bu görev boyunca gerçek bir yerel
PostgreSQL 16 üzerinde HEM 15 dakikadan taze HEM 20 dakika eski bir
mesajla bu kural gerçekten test edildi (aşağıya bakınız) — icat edilmiş
bir iddia değil.

**Emoji seçicinin çalışması:** Emoji ikonuna tıklamak `EmojiPicker`'ı
açıyor (6 zorunlu emoji + "➕"). Bir emoji seçildiğinde `onReact(messageId,
emoji)` (`local-conversation-view.tsx`) çağrılıyor:
- Kullanıcının bu mesajda ZATEN aktif bir tepkisi var VE seçilen emoji
  AYNIYSA → `removeMessageReaction` (gerçek DELETE) — tepki kaldırılıyor.
- Aksi halde → `setMessageReaction` (gerçek `upsert`, `onConflict:
  "message_id,user_id"`) — yeni tepki eklensin ya da eskisinin YERİNE
  GEÇSİN, ikisi de AYNI satırın upsert'i, asla ikinci bir satır
  oluşturmuyor.
İkisi de optimistik uygulanıp (anında UI güncellemesi) başarısızlıkta geri
alınıyor — Follow/Like/Save provider'larından beri bu projenin standart
deseni.

**Kullanıcı başına mesaj başına tek emoji kuralı — nasıl uygulanıyor:**
Veritabanı seviyesinde: `primary key (message_id, user_id)` — bu satırın
KENDİSİ, aynı kullanıcı+mesaj için ikinci bir aktif tepkinin var
OLAMAYACAĞINI garantiliyor (istemci mantığına güvenen bir kural değil).
Emoji değiştirme bu YÜZDEN yeni bir satır eklemek değil, aynı satırı
`upsert`lemek — atomik, yarış durumuna kapalı (aynı anda gelen iki istek
sırayla aynı satırı günceller, asla iki satır oluşturmaz). Bu, yerel
Postgres'te gerçekten test edildi: Test 2 "hâlâ tam olarak 1 satır"
sonucunu doğruladı.

**Emoji değiştirme/kaldırma davranışı:** Değiştirme → eski rozet anında
yenisiyle değişiyor (aynı satırın `emoji` kolonu güncelleniyor, aynı
konumda tek bir rozet kalıyor). Kaldırma → rozet tamamen kayboluyor.
Karşı tarafın tepkisi tamamen bağımsız (kendi satırı, kendi PK'sı) —
birinin değiştirmesi/kaldırması diğerini asla etkilemiyor; gerçekten
test edildi (Test 5: Baran'ın kendi tepkisini silmesi Ayşe'ninkini hiç
etkilemedi).

**Emoji sayacı gösterilmediğinin doğrulanması:** `message-bubble.tsx`'teki
rozet `<span>`'i SADECE `{reaction.emoji}` render ediyor — hiçbir sayı/
sayaç JSX'te yok. Playwright testinde her rozetin `data-reaction-emoji`
özniteliği ÜZERİNDEN okunup metninin TAM OLARAK tek bir emoji glifi
olduğu (başka hiçbir karakter/rakam eklenmediği) doğrulandı (E5/E11,
aşağıya bakınız) — bubble'ın geri kalanındaki zaman damgası metnine
("2 dakika önce") göre bir substring/regex kontrolü YANLIŞ pozitif
verdiği için (kendi test hatam, düzeltildi) bu daha güvenilir kontrol
yöntemine geçildi.

**Geri ok ve üst bar menüsü:** `ArrowLeft` ikonu avatarın solunda, tıklanınca
`router.back()` (tarayıcının kendi geri geçmişini kullanıyor —
`/messages`'ın olası scroll konumunu `router.push` gibi sıfırlamıyor);
geçmişte gidilecek bir sayfa yoksa (`window.history.length <= 1` —
örneğin bir bildirimden doğrudan derin bağlantıyla gelinmişse)
`router.push("/messages")`'a düşüyor. Üst barın en sağındaki "⋮" —
`ProfileMoreMenu`, profil sayfasında zaten kullanılan BİREBİR AYNI
bileşen (yeni bir kopya değil, `import` edilip aynı `blockState` prop'uyla
besleniyor) — Engelle/Engeli kaldır (`useBlockState`, gerçek `blocks`
tablosu) ve "Bu kullanıcıyı şikayet et" (`ReportButton`, gerçek `reports`
tablosu) sunuyor. Profildeki davranış değişirse (örn. onay akışı) bu
menü de otomatik olarak aynı değişikliği yansıtır, çünkü LİTERALEN AYNI
kod.

**Mesaj/yorum isimlerinin profil yönlendirmesi:** Yorumlarda zaten
Bölüm 9.4/9.11'den beri `profileHref(comment.author)` ile gerçek
kullanıcı ID'si üzerinden çalışıyordu — bu görevde dokunulmadı, yalnızca
doğrulandı (regresyon testi, aşağıya bakınız). Mesajlarda kişiye özel
avatar/isim her balonda AYRICA gösterilmiyor (1:1 konuşma — bu bilgi
zaten üst bardaki tek, gerçek profile giden linkte var, Bölüm 21 Faz
6'dan beri); bu, eklenmemiş bir özellik değil, 1:1 mesajlaşmanın doğal
bir sonucu — her baloncuğa ayrıca aynı iki kişiden birinin avatarını/
adını tekrar tekrar basmak gereksiz olurdu.

**Mobil input zoom sorunu:** Bölüm 9.11'de zaten çözülmüştü
(`globals.css`'teki `@media (max-width: 1023px) { input, textarea,
select { font-size: 16px; } }` — tüm site genelinde, mesaj composer'ı
dahil). Bu görevde YENİDEN çözülmedi, yalnızca hâlâ doğru çalıştığı
regresyon testiyle (mobile-messaging-test.mjs, B1/B2) doğrulandı.

**Nasıl doğrulandı — SQL/veritabanı katmanı (gerçekten çalıştırıldı):**
Yeni migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile sıfırdan
açılan geçici bir veritabanına (önceki 18 migration ile birlikte, `auth.
users`/`anon`/`authenticated` rol simülasyonuyla — bu projenin standart
yöntemi) gerçekten uygulandı ve 14 senaryo çalıştırılıp doğrulandı: bir
kullanıcının tepki eklemesi; AYNI kullanıcının emoji DEĞİŞTİRMESİNİN
hâlâ tam olarak 1 satırla sonuçlanması; karşı tarafın BAĞIMSIZ tepki
eklemesi; bir kullanıcının kendi tepkisini kaldırmasının diğerini
etkilememesi; yetkisiz bir kullanıcının başkasının tepkisini silememesi
(RLS, 0 satır); `user_id` sahteciliğinin `WITH CHECK` ile reddedilmesi;
konuşma üyesi OLMAYAN birinin tepki ekleyememesi; `conversation_id`'nin
mesajın gerçek konuşmasıyla eşleşmemesi durumunun reddedilmesi (anti-
spoof); `anon`'un hiçbir tepkiyi görememesi; **15 dakikadan taze bir
mesajın düzenlenebilmesi**; **20 dakika eski bir mesajın düzenlenmesinin
VE "herkesten sil"inin server-side RLS tarafından reddedilmesi** (istemci
normal bir istek gönderse bile); engellemenin var olan bir tepkiyi
geriye dönük SİLMEMESİ ama yeni mesaj göndermeyi hâlâ reddetmesi (Bölüm
9.9'un kuralı bozulmadı); konuşma silinince tepkilerin cascade ile
silinmesi. Test veritabanı işlem bitince silindi.

**Nasıl doğrulandı — istemci/tarayıcı:** Bu sandbox'ın ağ politikası
`*.supabase.co`'ya erişimi engellediğinden, yeni 48 senaryoluk bir
Playwright paketiyle (ağ seviyesinde taklit edilmiş Supabase REST
yanıtları, bu projenin standart yöntemi) hem masaüstü (24+11=35 senaryo)
hem mobil (13 senaryo) davranışı doğrulandı — menü/emoji ikonlarının
hover/tap ile görünmesi, doğru seçenek kümeleri (kendi/karşı taraf),
süre dolan mesajda seçeneklerin kaldırılıp bilgilendirme metninin
görünmesi, menünün ekran kenarından taşmaması (hem masaüstü hem 390px
mobil genişlikte, KISA ve UZUN mesajlarla), emoji ekleme/değiştirme/
kaldırma/sayfa-yenileme-sonrası-kalıcılık, mobilde bir mesaja dokununca
ikonların görünmesi ve başka bir mesaja dokununca öncekinin kapanması,
boş alana dokununca kapanması, geri okun `/messages`'a gitmesi, üst
bar menüsünün Engelle/Şikayet seçeneklerini göstermesi — hepsi sıfır
JS hatasıyla. Ayrıca bu görev sırasında güncellenmiş (aşağıya bakınız)
TÜM önceki mesajlaşma regresyon paketleri (Faz A: 21/21, Faz B: 19/19,
Faz C: 7/7, mobil mesajlaşma: 15/15, yorum-profil-linki: 5/5, yorum
düzenleme/silme: 8/8, bildirim merkezi: 32/32, 19 rotalık genel
dayanıklılık taraması: sıfır JS hatası) sıfır regresyonla yeniden
çalıştırıldı — ayrıca koyu temada (dark mode) menü/rozet/üst bar
görsel olarak elle doğrulandı (ekran görüntüsü alındı, sorunsuz).

**Güncellenen ESKİ test dosyaları (regresyon, app kodu DEĞİL):**
Faz A ve Faz B'nin mevcut Playwright testleri, mesaj işlemlerinin artık
her zaman görünür bir satır değil hover/tap ile açılan bir "⋮" menüsü
ARKASINDA olduğunu varsaymıyordu (bu görevden önce yazılmışlardı) —
`getByRole('button', {name:'Yanıtla'})` gibi doğrudan tıklamalar artık
önce `hover()` + "Mesaj seçenekleri" ikonuna tıklayıp menüyü açmadan
bulunamıyordu. Bu, testlerin kendi eski varsayımıydı, gerçek bir
regresyon DEĞİL — cevap verme/düzenleme/silme/şikayet etme işlevlerinin
KENDİSİ yeni 48 senaryoluk pakette ayrıca doğrulandığı gibi tam olarak
çalışıyor. Her iki dosya da yeni menü akışını kullanacak şekilde
güncellendi (`openMenuFor()` yardımcı fonksiyonu eklendi), app kodunda
bu düzeltme için hiçbir değişiklik yapılmadı.

**Çalıştırılmayan testler:**
- Gerçek bir Supabase projesine karşı canlı doğrulama — bu sandbox'ın ağ
  politikası `*.supabase.co`'ya erişimi engelliyor (Bölüm 17'den beri
  tekrarlanan, dürüstçe belirtilen aynı sınırlama). Kullanıcının
  `20260919240000_message_reactions.sql`'i Dashboard'da uygulayıp bizzat
  denemesi gerekiyor.
- Gerçek bir dokunmatik cihazda (fiziksel parmak) emoji seçici/menü
  dokunma hedeflerinin gerçekten rahat olup olmadığı — yalnızca
  Playwright'ın simüle ettiği dokunma olayları ve buton boyutu ölçümleri
  (>=32px) doğrulandı, gerçek bir el/parmakla hiç denenmedi (Bölüm
  9.11'in de belirttiği aynı donanım-erişimi sınırı).
- Realtime'ın gerçek bir WebSocket bağlantısı üzerinden karşı tarafa
  ANLIK yansıması — Bölüm 21 Faz C/9.10'dan beri bilinen, bu sandbox'ın
  WebSocket erişimini de engelleyen aynı sınırlama; abonelik KURULUMU
  (doğru filtre, doğru tablo) ve birleştirme mantığı (`upsertReaction`/
  `removeReactionRow`) doğrulandı, uçtan uca gerçek bir ikinci tarayıcıyla
  canlı senkronizasyon hiç test edilemedi.

**Bilinen sınırlamalar / bilinçli kararlar:**
- Emoji seçicinin "➕" ile açılan ikinci satırı sabit, 12 emojilik bir
  liste — tam bir emoji klavyesi/arama kutusu YOK (bu proje harici bir
  emoji-picker kütüphanesi kullanmıyor, CLAUDE.md §2'nin "gereksiz
  bağımlılık eklenmez" kuralına uyarak).
- Mesaj reaksiyonları için bildirim üretimi eklenmedi (şartname bunu hiç
  istemedi) — yorum/gönderi beğenilerinin aksine (Bölüm 9.6), bir mesaj
  tepkisi şu an hiçbir bildirim üretmiyor. Kasıtlı bir kapsam kararı,
  istenirse `notify_comment_like`'a birebir benzer bir trigger ile
  ayrı bir görevde eklenebilir.
- Reaksiyonlar, engellenmiş bir kullanıcı için geriye dönük
  SİLİNMİYOR/gizlenmiyor (yalnızca YENİ mesaj/konuşma engelleniyor,
  Bölüm 9.9'un kuralı) — şartname bunu istemedi, mevcut engelleme
  kapsamı genişletilmedi.
- Grup sohbeti bu projede hiç yok (Bölüm 21 Faz 6'dan beri bilinen
  sınırlama) — mesaj menüsü/emoji sistemi yalnızca 1:1 konuşmalar için
  tasarlandı ve test edildi.

---

### 9.14 Remix Dallanma Haritası ve Merge (birleştirme) sistemi

Kullanıcının çok kapsamlı, 34 bölümlük "PROMPTLY — REMIX GRAPH, BRANCHING &
MERGE SYSTEM" şartnamesi üzerine — bir remixin gerçek bir dallanma
grafiği/ağacı olarak görselleştirilmesi, bir remixin katkısını bir atasına
gerçek bir "merge talebi" akışıyla geri sunabilmesi, ve bir remixi
doğrudan kaynağıyla/kök orijinaliyle karşılaştırabilen bir fark
(diff) ekranı. Şartnamenin kendi kuralına uyularak önce mevcut mimari
uçtan uca denetlendi; yalnızca gerçekten eksik olan kısımlar inşa edildi.

**AŞAMA 1 denetim bulguları:**
- Remix ilişkisinin kendisi (`prompts.source_prompt_id`/`root_prompt_id`/
  `origin_type`, `prompts_origin_shape` CHECK kısıtı) Bölüm 18'den beri
  ZATEN şartnamenin 1. bölümünün istediği şekilde modellenmiş —
  `fetchRemixesOf`/`fetchRemixChain` (`src/lib/supabase/prompts.ts`) bu
  ilişkiyi zaten gerçek sorgularla okuyor. Yeni bir alan/tablo GEREKMEDİ.
- Remix silme güvenliği (şartnamenin §11/§12'sinin "alt remixler otomatik
  silinmez, kaynak yalnızca 'silinmiş' olarak işaretlenir, hangi
  derinlikte olursa olsun" kuralı) Bölüm 9.7'nin `handle_prompt_delete`
  trigger'ıyla ZATEN, HERHANGİ bir zincir derinliğinde, tam olarak bu
  şekilde çalışıyor — buraya hiç dokunulmadı.
- Bildirim altyapısı (`SECURITY DEFINER` trigger'lar, `hl=<tür>:<id>`
  hedefleme deseni, `NOTIFICATION_ICONS`/`NOTIFICATION_CATEGORY`) Bölüm
  9.6/9.12'den beri olgun ve genişletilebilir — yeni merge bildirimleri
  bununla BİREBİR AYNI deseni kullanıyor, paralel bir sistem kurulmadı.
- `notify_new_remix` zaten "remix oluşturuldu → kaynak sahibine bildirim,
  kendine bildirim yok" kuralını uyguluyor (şartnamenin §14 "remix_
  created" isteği) — YENİDEN YAZILMADI.
- Bu denetimin sonucu: gerçekten yeni inşa edilmesi gereken tek şey
  **sürüm geçmişi** (`prompt_versions`) ve **merge talepleri**
  (`merge_requests`) + bunların üzerine kurulu harita/karşılaştırma
  arayüzleriydi.

**Yeni migration: `supabase/migrations/20260919250000_remix_merge_
system.sql`** (tam doğrulama listesi `supabase/README.md`'de):
- **`prompt_versions`** — bir promptun merge ile kabul edilmiş sürüm
  geçmişi. Yalnızca aşağıdaki RPC'ler tarafından yazılıyor (bu uygulamada
  düz bir "düzenle" işlemi hiç yok, bu yüzden version yalnızca merge
  bağlamında anlamlı). Okuma politikası `prompts`'ın kendi görünürlük
  kuralıyla birebir aynı (yayınlanmış veya kendi promptun); `deleted_at`
  BİLİNÇLİ OLARAK kontrol edilmiyor (Bölüm 9.7'nin ilkesiyle aynı —
  soft-deleted bir promptun geçmiş sürüm kaydı, o merge'ün gerçekten
  olduğunun kanıtı olarak görünmeye devam ediyor).
- **`merge_requests`** — bir remixin katkısını bir atasına (doğrudan
  kaynak/kök orijinal/aradaki başka bir ata) sunma talebi.
  `merge_requests_no_self_target` (kaynak≠hedef CHECK) ve
  `merge_requests_one_pending_per_pair` (aynı çift için tek bekleyen
  talep — kısmi unique index, yarış durumuna kapalı) veritabanı
  seviyesinde zorlanıyor. Yazma politikası YOK — tüm durum geçişleri
  yalnızca RPC'ler üzerinden. **Mimari karar:** şartnamenin önerdiği
  ayrı bir "merge_contributions" tablosu BİLİNÇLİ OLARAK kurulmadı —
  `merge_requests` (source/target/requester) + `prompt_versions`
  (merge_request_id/created_by/content) birleşimi zaten aynı bilgiyi
  taşıyor, üçüncü bir yinelenen tabloya gerek yoktu.
- **RPC'ler** (hepsi `security definer`, istemciden hiçbir raw INSERT/
  UPDATE izni yok — bir merge talebinin durumunu doğrudan bir `.update()`
  ile değiştirmek yapısal olarak imkansız):
  - `create_merge_request(source, target, summary, description?)` — tüm
    ön-koşul doğrulamaları burada: kaynak gerçek bir remix mi ve
    isteyenin mi, hedef silinmemiş mi, mükerrer bekleyen talep var mı,
    VE **hedefin kaynağın gerçek bir atası olup olmadığı** — kaynağın
    `source_prompt_id` zincirini köke kadar (20 adım guard'lı, tıpkı
    `fetchRemixChain` gibi) yürüyerek. **Bu tek kontrol hem "yalnızca
    geçerli hedeflere merge edilebilir" HEM "döngü oluşturulamaz"
    kuralını aynı anda sağlıyor** — ayrı bir graf-döngü-tespiti
    algoritması yazmaya hiç gerek kalmadı. İsteyen zaten hedefin de
    sahibiyse (`requester_id = target_owner_id`), talep hiç `pending`
    durumuna girmeden `_perform_merge_acceptance`'ı çağırıp ANINDA kabul
    ediyor — CLAUDE.md'nin "kendine gereksiz bir onay akışı kurma"
    ilkesine uygun, dokümante edilmiş bir ürün kararı.
  - `_perform_merge_acceptance` (dahili, hem normal kabul akışı hem
    kendi-kendine-merge kısayolu tarafından çağrılan TEK yer) — hedefin
    daha önce HİÇ sürümü yoksa, mevcut canlı içeriğini geriye dönük
    `version 1` olarak kaydedip, kaynağın içeriğini `version 2` olarak
    yazıyor VE hedefin canlı `title`/`description`/`prompt_text`'ini
    gerçekten güncelliyor — tek, atomik bir transaction. Kaynağın kendi
    satırına, source/root ilişkisine HİÇ dokunulmuyor (silinmiyor,
    değiştirilmiyor) — "merge, üzerine yazma değil, katkıyı hedefe
    kopyalamaktır" ilkesi (şartname §5) böyle sağlanıyor.
  - `accept_merge_request`/`reject_merge_request`/`withdraw_merge_
    request` — sırasıyla yalnızca hedef sahibi/yalnızca hedef sahibi/
    yalnızca talep sahibi çağırabiliyor; zaten karara bağlanmış bir
    talebi tekrar karara bağlamaya çalışmak reddediliyor (çifte-kabul
    engeli, şartname §20'nin "iki kullanıcı aynı anda kabul ederse
    yalnızca biri başarılı olmalı" senaryosunu tam olarak karşılıyor).
  - `fetch_remix_graph(root_id)` — TEK bir recursive CTE ile bir remix
    ağacının TÜM düğümlerini getiriyor (N ayrı sorgu yerine) — haritanın
    "performanslı çizim, gereksiz sorgu yığmama" gereksinimi veri
    katmanında başlıyor. RLS zaten (`security invoker`) gizli/yayınsız
    bir düğümü hiç döndürmüyor — "erişilemiyor" ile "silinmiş" arayüzde
    aynı dürüst muameleyi görüyor (ikisi de içerik sızdırmıyor).
  - `handle_prompt_soft_delete_cancels_merges` (trigger, `prompts`
    üzerinde) — bir prompt (Bölüm 9.7'nin trigger'ıyla) soft-delete
    olduğunda, onu KAYNAK olarak kullanan her bekleyen merge talebini
    `cancelled` yapıp hedef sahibine bilgi veriyor (yeni `merge_request_
    cancelled` bildirimi — şartname §7'nin "cancelled" durumu tam olarak
    bu senaryo için var).
  - `audit_log` — yalnızca merge eylemleri için minimal, salt-okunur bir
    denetim tablosu (istemciden hiç yazılamıyor).
  - `notifications.type` CHECK'i beş yeni değer aldı:
    `merge_request_received/accepted/rejected/withdrawn/cancelled` —
    hepsi Bölüm 9.6/9.12'nin zaten olgun, aynı `SECURITY DEFINER` +
    `hl=` hedefleme desenini kullanıyor.

**Gerçek hata düzeltmeleri (yerel test sırasında bulundu, önceden
varsayılmadı):**
1. `create_merge_request`'in `returns table (request_id uuid, status
   text)` imzasındaki `status` OUT parametresi, fonksiyon içindeki
   mükerrer-talep kontrolü sorgusundaki `merge_requests.status`
   sütununu GÖLGELİYORDU — `column reference "status" is ambiguous`
   hatasına yol açıyordu. Yalnızca ilgili sorguyu `mr.status` diye
   nitelemek yerine, OUT parametrenin kendisi `request_status` olarak
   yeniden adlandırıldı (gölgeleme riskini kökten kaldırmak için) —
   istemci tarafı (`src/lib/supabase/merge-requests.ts`) da buna göre
   `row.request_status` okuyor.
2. `merge_requests`/`prompt_versions`'ın ilk yazılan RLS SELECT
   politikaları, ilgili iki promptun `deleted_at is null` olmasını da
   şart koşuyordu — bu, Bölüm 9.7'nin "soft-deleted bir promptun satırı
   hâlâ herkese açık" ilkesiyle ÇELİŞİYORDU: bir kaynak/hedef soft-delete
   olur olmaz, ona bağlı geçmiş bir merge talebi `anon` için aniden
   görünmez oluyordu (şartnamenin §10'unun "silinmiş kaynak: içerik
   kaldırılmış, ilişki kaydı korunuyor" lejant maddesini ihlal ederek).
   Düzeltme: her iki politikadan da `deleted_at is null` koşulu
   kaldırıldı, yalnızca `status='published'` kaldı. Her iki hata da
   gerçek bir yerel Postgres test döngüsüyle yakalanıp düzeltildi ve
   tüm senaryo paketi baştan çalıştırılarak doğrulandı (aşağıya bakınız).

**Yeni frontend dosyaları:**
- `src/types/index.ts` — `MergeRequestStatus`, `MergeRequest`,
  `PromptVersion`, `RemixGraphNode` tipleri + `NotificationType`'a 5 yeni
  değer eklendi.
- `src/lib/notification-utils.ts` — merge bildirimleri için ikon/kategori/
  `hl` türü eşlemeleri eklendi (`GitMerge`/`CheckCircle2`/`XCircle`/
  `RotateCcw`/`Ban`, hepsi "posts" kategorisinde, yeni `"merge"` highlight
  türü).
- `src/lib/supabase/merge-requests.ts` — `fetchMergeRequestsForPrompt`/
  `fetchMergeRequestsForPrompts` (haritanın N+1 yapmaması için toplu
  sorgu), `createMergeRequest`/`acceptMergeRequest`/`rejectMergeRequest`/
  `withdrawMergeRequest` (hepsi ince RPC sarmalayıcılar).
- `src/lib/supabase/prompt-versions.ts` — `fetchVersionsForPrompt`.
- `src/lib/supabase/remix-graph.ts` — `fetchRemixGraph` (RPC + yazar
  profillerinin toplu `.in()` sorgusu — yine N+1'den kaçınmak için),
  `resolveGraphRootId` (bir promptun kendisinden gerçek kök id'sini
  bulan yardımcı).
- `src/features/prompts/remix-tree-layout.ts` — `layoutRemixTree`/
  `computeTreeBounds`: basitleştirilmiş bir Reingold-Tilford ağaç
  yerleşimi (harici bir grafik/graf kütüphanesi eklenmeden, CLAUDE.md
  §2'ye uygun) — yaprak düğümler sırayla x-slot'lara yerleştiriliyor,
  ebeveynler çocuklarının x-aralığının ortasına konumlanıyor, döngü
  koruması ve yetim düğüm fallback'i dahil. Saf bir fonksiyon olarak
  yazıldı, birim testiyle (`tree-layout-test.mjs`, şartnamenin kendi
  A→B→C, A→D, B→E örnek ağacına karşı 11 assertion) UI'a hiç bağlanmadan
  doğrulandı.
- `src/features/prompts/prompt-diff.ts` — `diffWords` (klasik LCS/en
  uzun ortak alt dizi tablosuyla kelime-seviyeli diff, harici bağımlılık
  yok), `diffPromptContent`/`ComparableField`/`FieldDiff` (yapılandırılmış
  alan-bazlı karşılaştırma — başlık/açıklama/prompt metni/araç ayrı ayrı,
  tek bir blob değil), `promptToComparable`/`versionToComparable`. Saf
  fonksiyonlar, birim testiyle (`diff-test.mjs`, şartnamenin kendi "mavi
  tonlarda" → "mor tonlarda, modern" örneğine karşı 9 assertion,
  kayıpsız yeniden birleştirme dahil) doğrulandı.
- `src/features/prompts/remix-map-node-card.tsx` — `RemixMapNodeCard`:
  haritadaki tek bir düğüm, gerçek bir `<button>` (native Tab sırası ve
  Enter/Space aktivasyonu bedava geliyor — şartnamenin "erişilebilir
  klavye etkileşimleri" gereksinimi), `aria-label`/`aria-pressed`,
  orijinal/remix rozeti, bekleyen-merge göstergesi, silinmiş içerik
  durumu (`AlertTriangle` + metin — yalnızca renkle değil).
- `src/features/prompts/remix-branch-map.tsx` — `RemixBranchMap`: ana
  harita kabuğu. Gerçek veri akışı (`fetchRemixGraph` + `fetchMergeRequestsForPrompts`),
  Realtime abonelik (`merge_requests` tablosundaki HER olay + `prompts`
  tablosunda bu ağacın kökü — `root_prompt_id=eq.<id>` filtresiyle —
  değişince haritayı sayfa yenilenmeden tazeliyor, Bölüm 21'in "tam
  yeniden çekme, artımlı patch değil" kararıyla aynı kategoriden),
  el yapımı pan/zoom (pointer event'ler + CSS `transform`, harici
  kütüphane yok), araç çubuğu (içerik sayısı, yakınlaştır/uzaklaştır,
  görünüme sığdır, merkez içeriğe dön, merge ilişkilerini göster/gizle,
  genişlet/daralt), `MapLegend` (renk + ikon + metin — asla yalnızca
  renkle anlamlandırma), ve mobilde varsayılan olarak katlı başlayıp
  `ChevronsUpDown` toggle'ıyla açılan bir görünüm. SVG kenarları: remix
  bağlantıları düz çizgi + ok ucu, merge bağlantıları KESİKLİ çizgi +
  duruma göre renk (bekleyen=amber, kabul edilmiş=primary, diğer=muted) —
  şartnamenin "remix ve merge bağlantıları görsel olarak ayrı olmalı"
  kuralı (§4).
- `src/features/prompts/remix-node-detail-panel.tsx` — `RemixNodeDetailPanel`:
  seçili düğümün tüm detayı — başlık/yazar/zaman, doğrudan kaynak/kök
  orijinal (silinmişse "Silinmiş içerik", erişilemezse "Kaynağa
  erişilemiyor" — ikisi ayrı, dürüst mesajlar), remix sayısı, "İçeriği
  Aç"/"Remix Oluştur"/"Kaynağı Aç" eylemleri, fark karşılaştırma
  butonları (aşağıya bakınız), yalnızca gerçek sahibine ve yalnızca
  gerçek bir ata zinciri varsa görünen "Merge talebi oluştur", o düğümü
  ilgilendiren TÜM merge taleplerinin listesi (durum rozetiyle — bekliyor/
  kabul edildi/reddedildi/geri çekildi/iptal edildi, hedef sahibine
  Kabul et/Reddet, talep sahibine Geri çek — rol bazlı, sahte bir buton
  hiç gösterilmiyor), ve **sürüm geçmişi** (aşağıya bakınız). Merge
  aksiyonları sonrası yerel state'i hand-crafted bir optimistic obje ile
  DEĞİL, `fetchMergeRequestsForPrompt`'un gerçek sonucuyla güncelliyor
  (bilinçli karar — bir merge talebinin gerçek şekli, requester/
  target_owner profilleri dahil, elle doğru kurmaktan daha ucuz ve daha
  güvenilir bir gerçek yeniden-sorgu).
- `src/features/prompts/merge-request-modal.tsx` — `MergeRequestModal`:
  gerçek, kalıcı bir gönderim — sahte bir taslak değil. Sabit katkı
  kaynağı, seçilebilir hedef (yalnızca `candidates` — gerçek ata
  zincirinden gelen node'lar, asla rastgele bir prompt), zorunlu özet,
  opsiyonel açıklama. Tüm "gönderim öncesi" kontroller (kaynak/hedef hâlâ
  var mı, isteyen yetkili mi, mükerrer talep var mı) RPC içinde — bu form
  yalnızca RPC'nin reddini olduğu gibi, dürüstçe gösteriyor.
- `src/features/prompts/prompt-diff-modal.tsx` — `PromptDiffModal`
  ("Farkları Karşılaştır", **remix karşılaştırması** — iki FARKLI içerik
  id'si arasında): üç görünüm modu (yan yana/birleşik/yalnızca
  değişiklikler), görsel içerik türü için dürüst bir "desteklenmiyor"
  mesajı (yalnızca metin/kod alanları diff'leniyor, üretilen görselin
  kendisi hiç karşılaştırılmıyor — şartname §31), ve yalnızca yetkili
  kullanıcıya görünen "Bu katkıyı merge talebi olarak gönder →" bağlantısı
  — **asla doğrudan merge YAPMIYOR**, yalnızca `MergeRequestModal`'ı
  açıyor (şartname §32'nin "karşılaştırma asla otomatik merge yapmaz"
  kuralı). Açılması/görünüm modu değişimi HİÇBİR bildirim/durum
  değişikliği üretmiyor — salt okunur bir inceleme.
- `src/features/prompts/version-diff-modal.tsx` — `VersionDiffModal`
  ("Sürüm Karşılaştırması", **remix karşılaştırmasından kasıtlı olarak
  ayrı ve ayrı etiketlenmiş** — şartname §30: her zaman AYNI içerik
  id'sinin iki sürümünü karşılaştırır). Zaten yüklenmiş iki
  `PromptVersion` nesnesini alıyor (ekstra bir ağ isteği gerekmiyor),
  `PromptDiffModal`'ın `FieldDiffBlock`'unu (export edildi) yeniden
  kullanıyor — iki ayrı diff render mantığı yok.

**Sürüm geçmişi (şartname §9/§30/§34) — gerçekten inşa edildi, yalnızca
veri katmanında bırakılmadı:** `RemixNodeDetailPanel`, seçili düğüm için
`fetchVersionsForPrompt`'u çağırıp (yalnızca gerçekten bir merge kabul
edilmişse dolu döner — bu uygulamada düz bir "düzenle" özelliği hiç
olmadığından, hiç merge almamış bir promptun sürüm geçmişi boş, ve boşsa
bölüm hiç render edilmiyor, sahte bir "henüz sürüm yok" mesajı da
eklenmedi) sürüm numarası/oluşturan/tarih/değişiklik özeti sırasıyla
listeliyor; her sürümün (ilki hariç) yanında "Önceki sürümle karşılaştır"
butonu `VersionDiffModal`'ı açıyor. Bu, "kabul edilen merge'ün ürettiği
yeni sürüm, kendi önceki sürümüyle karşılaştırılabilir olmalı, hangi
merge talebinin bunu ürettiğini göstermeli" (şartname §29) gereksinimini
gerçekten karşılıyor — yalnızca RPC'nin `version_number`/`change_summary`
yazması yetmiyordu, arayüzde de gösterilmesi gerekiyordu.

**Sayfaya entegrasyon (`prompt-detail-view.tsx`):** Harita, "Remixler"
bölümüyle aynı yatay hizada başlayan bir sağ panel olarak eklendi — TÜM
sayfa değil, yalnızca "Remixler + yorumlar" bloğu `lg:grid-cols-
[1fr_360px]` grid'ine geçti (bu projenin `CreatePromptForm`/
`CreateRequestForm`'da zaten kullandığı desen). Üst kısım (görsel/başlık/
açıklama/prompt metni) hiç sıkışmadı — kendi `lg:max-w-3xl` genişliğinde
kaldı, yalnızca dış konteyner `lg:max-w-5xl`'e genişledi (haritaya yer
açmak için). Mobilde/tabletde (`lg` altı) grid tamamen devre dışı —
düz, dikey `space-y-6` akışı (harita `RemixBranchMap`'in kendi katlanabilir
toggle'ıyla Remixler'in altında görünüyor). **Gerçek bir hata bulunup
düzeltildi (test sırasında):** ilk yazılan grid `grid gap-6 lg:grid-
cols-[1fr_360px]` idi — `grid` sınıfı `lg:` ön eki OLMADAN her genişlikte
uygulandığından, mobilde CSS Grid'in "grid item'ların varsayılan
`min-width: auto`'su" davranışı (yorum composer'ının flex satırı
küçülemeyip grid track'ini genişletmesi) sayfayı 10px yatay taşırıyordu
— Playwright'ın mobil taşma testi bunu gerçekten yakaladı. Düzeltme:
`grid` yalnızca `lg:grid` oldu (mobilde düz `space-y-6`), artı ilgili
grid item'lara `min-w-0` eklendi (standart CSS Grid "blowout" düzeltmesi).

**Nasıl doğrulandı — SQL/veri katmanı (gerçekten çalıştırıldı, taklit
değil):** Migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile
sıfırdan açılan, önceki TÜM migration'ların (storage hariç — bu görev
storage'a hiç dokunmuyor) gerçekten uygulandığı temiz bir veritabanına
uygulandı ve şartnamenin kendi §20 örnek senaryosu (5 gerçek kullanıcı —
Ayşe/Mehmet/Zeynep/Can/Elif — ve gerçek bir A→B→C, A→D, B→E remix ağacı)
üzerinden şu senaryoların TAMAMI fiilen çalıştırılıp doğrulandı: kök/
doğrudan kaynak ilişkisi her seviyede doğru; **döngü engeli** (D'nin C'ye
geçersiz bir merge'le "bağlanma" denemesi reddedildi); Zeynep'in C'den
A'ya gerçek bir merge talebi göndermesi (`pending`); **mükerrer talep
engeli**; **yetkisiz karar engeli** (Mehmet A için karar veremedi); Ayşe'nin
kabulü → `version 1` (A'nın eski içeriği, geriye dönük) + `version 2`
(C'nin içeriği) + A'nın canlı içeriğinin gerçekten güncellenmesi + **C'nin
source/root ilişkisinin hiç değişmemesi**; **çifte kabul engeli**; reddetme
akışı (`decision_reason` dolu); geri çekme akışı + **başkasının geri
çekememesi**; **kendi kendine merge kısayolu** (anında `accepted`);
**B silinince C/E'nin İKİSİNİN de hayatta kalması**, C'nin source/root
ilişkisinin kırılmaması, B'ye yeni bir merge talebi denemesinin reddi;
**A silinince B/C/D/E'nin TAMAMININ hayatta kalması**; **kritik RLS
testi** — `anon`'un geçmiş bir merge talebini (kaynak/hedef soft-deleted
olsa bile) hâlâ görebilmesi; `fetch_remix_graph`'ın tek sorguda doğru
ağacı getirmesi. Test veritabanı işlem bitince silindi (tam liste,
`supabase/README.md`'de).

**Nasıl doğrulandı — saf mantık (birim testi, tarayıcısız):**
`layoutRemixTree` (11 assertion) ve `diffWords`/`diffPromptContent` (9
assertion), gerçek kaynak dosyalarına karşı (kopyalarına değil)
doğrudan çalıştırıldı — ikisi de UI'a hiç bağlanmadan, şartnamenin kendi
örnekleriyle doğrulandı.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST/RPC yanıtlarıyla, Playwright, bu projenin standart
yöntemi):** Statik export yerel olarak sunulup 35 senaryoluk bir paketle
(masaüstü + mobil + koyu tema) doğrulandı — hepsi sıfır JS hatasıyla:
8 düğümlü gerçek bir ağacın (dallanma + bir silinmiş düğüm + onun hayatta
kalan remixi dahil) doğru render edilmesi; düğüm seçiminin doğru kaynak/
kök/remix-sayısı göstermesi; **ilk-nesil bir remixte YALNIZCA tek bir
karşılaştırma seçeneğinin (mükerrer değil) görünmesi**, derin bir remixte
ikisinin de görünmesi; yalnızca gerçek sahibine "Merge talebi oluştur"
görünmesi; merge kabul/red/geri çekme/yeni talep oluşturmanın HER
BİRİNİN gerçek bir RPC tetikleyip arayüzü sayfa yenilenmeden
güncellemesi; sürüm geçmişinin doğru listelenip "Önceki sürümle
karşılaştır"ın doğru v1→v2 etiketiyle gerçek bir fark göstermesi; fark
karşılaştırma modalının doğru başlık/alan-bazlı diff göstermesi;
silinmiş bir düğümün "Silinmiş içerik" göstermesi VE onun hayatta kalan
remixinin kendi kaynağını hâlâ doğru "silinmiş" olarak raporlaması;
mobilde haritanın varsayılan olarak katlı başlayıp toggle ile açılması
ve HİÇBİR genişlikte yatay taşma olmaması; koyu temada hatasız render.
Ayrıca bu oturumun önceki bölümlerine ait regresyon paketleri (bildirim
merkezi, 32 senaryo; 19 rotalık genel Supabase-tamamen-erişilemez
dayanıklılık taraması) yeniden çalıştırılıp bozulma olmadığı doğrulandı.
`npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti.

**Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın
ağ kısıtı yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919250000_remix_merge_
system.sql`'i Dashboard'da uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Manuel düğüm yeniden konumlandırma kalıcı değil** — harita her
  yüklemede `layoutRemixTree`'nin hesapladığı düzeni kullanıyor (pan/zoom
  kalıcı değil, yalnızca o oturumdaki görünüm). Şartname bunu açıkça
  "karar verilsin ve dokümante edilsin" diye bıraktı — bilinçli karar:
  otomatik, deterministik bir düzen (aynı ağaç her zaman aynı şekilde
  çizilir) kullanıcı-özel bir konum kalıcılığından daha güvenilir ve
  basit; ayrı bir `node_positions` tablosu/sütunu bu görevin kapsamına
  alınmadı.
- **Değişikliği "hangi ara remixin yaptığı" bilgisi (şartname §26/§33'ün
  "eğer gerçek/güvenilir bir değişiklik geçmişi VARSA ek olarak
  gösterilebilir" diye koşullu bıraktığı özellik) eklenmedi** — bu, yalnızca
  DOĞRUDAN kaynakla ya da kökle iki-nokta karşılaştırma yapıyor,
  zincirdeki HER ara adımın kendi payını ayrıştırmıyor (şartname bunu
  yalnızca güvenilir bir değişiklik geçmişi zaten varsa istedi; icat
  edilmiş/tahmin edilmiş bir ayrıştırma göstermek şartnamenin kendi
  "asla tahmin etme" kuralını ihlal ederdi).
- **Toplu/coklu merge onaylama arayüzü yok** — her seferinde tek bir
  talep kabul/red/geri çekiliyor (şartname de zaten böyle istiyor).
- **`audit_log` genel bir moderasyon denetim sistemine dönüştürülmedi**
  — yalnızca merge eylemlerini kaydediyor; genel bir audit sistemi
  (her tabloyu kapsayan) bu görevin kapsamı dışında.
- **Mesaj üzerinden "içeriği paylaş" akışına (Bölüm 9.8) bir merge
  talebi paylaşma seçeneği eklenmedi** — şartname bunu hiç istemedi.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Realtime abonelik, `merge_requests`'teki HER olayda haritanın TÜM
  merge listesini yeniden çekiyor** (artımlı patch değil) — Bölüm 21'in
  zaten bilinen "N+1/tam sayfalama yok" kategorisiyle aynı, bu ölçekte
  (bir ağaçtaki merge talebi sayısı küçük) pratik bir sorun değil.
  Realtime'ın kendi Phoenix protokolü bu sandbox'ta hiç simüle edilemedi
  (WebSocket erişimi de engelli, Bölüm 21 Faz C'den beri bilinen aynı
  sınırlama) — yalnızca abonelik KURULUMU (doğru tablo/filtre) ve
  yeniden-çekme mantığı doğrulandı, karşı tarafın gerçek bir eylemine
  anlık tepki hiç canlı test edilemedi.
- **`fetch_remix_graph` yalnızca yayınlanmış/kendi promptları döndürüyor**
  (RLS `security invoker`) — büyük bir ağaçta (yüzlerce düğüm) tek
  sorgunun performansı bu sandbox'ta gerçek ölçekte test edilemedi
  (yalnızca küçük örnek ağaçlarla doğrulandı).
- **Sürüm geçmişi yalnızca merge kabul edildiğinde üretiliyor** — bu
  uygulamada hâlâ bir "prompt düzenle" özelliği yok, bu yüzden bir
  promptun v1'i her zaman ya "hiç yok" ya da "ilk merge'den geriye dönük
  backfill edilmiş" oluyor; ayrı, merge'den bağımsız bir "düzenleme
  geçmişi" bu görevin kapsamında değildi.

---

**Sonraki adım:** Remix Dallanma Haritası + Merge sistemi (Bölüm 9.14)
TAMAMLANDI. **Güncelleme — kullanıcı bunu doğruladı:** `20260919220000`
(Bölüm 9.10), `20260919230000` (Bölüm 9.12), `20260919240000` (Bölüm
9.13) ve `20260919250000` (Bölüm 9.14) migration'larının DÖRDÜ DE
Dashboard → SQL Editor ile gerçek Supabase projesine sırayla uygulandı
ve hatasız çalıştı — bekleyen manuel migration adımı kalmadı, şema/RPC'ler
artık canlı projede gerçekten var (bkz. `supabase/README.md`'nin
güncellenmiş "Durum" notu). Bunun ile "her akışın gerçek iki hesapla
uçtan uca canlı denendiği" ayrı şeyler — bu depodaki Playwright testleri
hâlâ yalnızca ağ seviyesinde taklit edilmiş Supabase yanıtlarıyla
çalıştı (Claude Code'un sandbox'ı gerçek projeye hâlâ erişemiyor); yeni
özelliklerin (Realtime senkronizasyonu, emoji tepkileri, merge akışı vb.)
gerçek kullanıcı hesaplarıyla beklendiği gibi davrandığı kullanıcının
kendi canlı denemesiyle doğrulanmalı. Bir sonraki modül için bu dosyanın
başındaki kurala uyarak önce mevcut mimari denetlenmeli, yalnızca gerçek
eksikler kapatılmalı.

---

### 9.15 Remix/Harita sekme düzeni + görsel promptlarda karşılaştırmanın engellenmemesi

Bölüm 9.14'ün ilk sürümü, haritayı "Remixler" bölümünün YANINDA, geniş bir
grid'e geçen ayrı bir sağ panel olarak göstermişti (masaüstünde iki sütun,
mobilde kendi katlanabilir "Haritayı göster/gizle" toggle'ı). Kullanıcının
açık isteği üzerine bu, **Remixler ile aynı alanı paylaşan iki sekmeye**
dönüştürüldü: "Remixler (N)" ve "Remix Dallanma Haritası" — biri
tıklanınca diğeri kayboluyor, ikisi de aynı bölümün içinde. Ayrıca
`PromptDiffModal`'ın görsel (`image`) türündeki promptlarda karşılaştırmayı
TAMAMEN engelleyen eski davranışı kaldırıldı.

**1. Sekme düzeni (`prompt-detail-view.tsx`):**
- Bölüm 9.14'ün eklediği `lg:grid-cols-[1fr_360px]` iki-sütunlu grid'i
  (ve onunla birlikte dış konteynere eklenen `lg:max-w-5xl` genişleme)
  tamamen kaldırıldı — sayfa yeniden tek sütunlu, orijinal `max-w-3xl`
  düzenine döndü (haritanın kendi genişliği artık Remixler'ınkiyle
  birebir aynı, ayrı bir dar panel değil).
  - Yeni `remixTab: "remixes" | "map"` state'i — "Remixler" ile
    başlıyor. `role="tablist"`/`role="tab"`/`aria-selected` ile gerçek,
    erişilebilir bir sekme deseni (bu projede daha önce hiç sekme UI'ı
    yoktu, en yakın emsal `profile-tabs.tsx`'in düz buton grubuydu — aynı
    görsel dil, `border-b-2` aktif gösterge, burada da kullanıldı).
  - `remixTab === "remixes"` iken eski davranış birebir korunuyor
    (boşsa "Bu prompt henüz remixlenmedi.", doluysa `PromptGrid`);
    `remixTab === "map"` iken `<RemixBranchMap>` render ediliyor.
    `CommentSection` sekmelerin DIŞINDA kalmaya devam ediyor (yorumlar
    remixle ilgili değil, kendi bölümü).
- `RemixBranchMap` (`remix-branch-map.tsx`) sadeleşti: kendi `<section>`
  sarmalayıcısı + tekrarlayan "Remix Dallanma Haritası" başlığı (artık
  sekme etiketiyle mükerrer olurdu) kaldırıldı, bileşen artık yalnızca
  araç çubuğu + harita tuvali + lejant + seçili düğüm paneli render
  ediyor. **Mobil "Haritayı göster/gizle" toggle'ı (`mobileOpen` state'i,
  `ChevronsUpDown` butonu) TAMAMEN kaldırıldı** — kullanıcının kendi
  sözleriyle "gerek kalmıyor hep açık kalsın": harita artık yalnızca
  kendi sekmesi seçiliyken hiç mount edilmiyor, mount olduğunda ise HER
  ZAMAN tam görünür (gizli bir alt duruma sahip değil). Haritanın kendi
  "genişlet/daralt" (`expanded`, yükseklik 320px↔560px) özelliği
  DEĞİŞMEDİ — bu farklı bir özellik (haritanın kendi tuval yüksekliği),
  "gizli göster" ile karıştırılmadı.

**2. Görsel promptlarda karşılaştırma artık hiç engellenmiyor
(`prompt-diff-modal.tsx`):** Eski kod, `subject.contentType === "image"`
olduğunda TÜM alan karşılaştırmasını bir "Bu içerik türü için fark
karşılaştırması desteklenmiyor" mesajıyla değiştiriyordu — oysa
`diffPromptContent` zaten hiçbir zaman görselin kendisini değil, yalnızca
metin alanlarını (başlık/açıklama/prompt metni/araç) karşılaştırıyor;
bu alanlar içerik türünden bağımsız olarak HER promptta var. Yani eski
kod, teknik olarak zaten çalışabilecek bir karşılaştırmayı yalnızca
`contentType` etiketine bakarak reddediyordu. Düzeltme: `unsupported`
kontrolü tamamen kaldırıldı — artık her içerik türünde alan diff'leri
her zaman render ediliyor. Görsel türü için yalnızca kısa, engelleyici
olmayan bir bilgi notu eklendi ("Görselin kendisi karşılaştırılmıyor —
yalnızca aşağıdaki metin alanları ... karşılaştırılıyor") — kullanıcıyı
yanıltmadan (görselin piksel bazında karşılaştırılmadığını açıklayarak)
gerçek diff'in üstünde, onu gizlemeden gösteriliyor.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta güncellenmiş
42 senaryolu paket (Bölüm 9.14'ün 35 senaryosu + bu görevin yeni
senaryoları) sıfır JS hatasıyla geçti: sayfa açılışında "Remixler"
sekmesinin varsayılan aktif sekme olduğu; "Remix Dallanma Haritası"
sekmesine tıklayınca haritanın TAM (gizli bir alt duruma düşmeden)
render edildiği; "Remixler"e geri dönünce harita araç çubuğunun
kaybolup boş/dolu remix listesinin göründüğü; mobilde ARTIK hiçbir
yerde "Haritayı göster" metninin bulunmadığı VE haritanın sekmeye
dokunur dokunmaz (ekstra bir toggle gerekmeden) tam görünür olduğu;
görsel türündeki bir promptu (C, bu testte `content_type: "image"`
olarak işaretlendi) karşılaştırırken artık gerçek alan diff'lerinin
(`Başlık` vb.) göründüğü, eski "desteklenmiyor" engelleme mesajının HİÇ
görünmediği, ve yeni bilgi notunun doğru şekilde eklendiği; masaüstü +
mobil + koyu temada regresyon yok. 32 rotalık genel dayanıklılık
taraması ve bildirim merkezi paketi (32/32) de bozulmadan yeniden
çalıştırıldı.

**Bilinen sınırlamalar:** Yok — bu, önceki bir modülün UI kararını
kullanıcının talebiyle değiştiren, kapsamı net bir düzeltme; yeni bir
mimari sınırlama getirmedi.

---

### 9.16 Türetme (remix) için profil görünürlüğü + üç sekmeli gönderi bölümü + "Türet" terminolojisi

Kullanıcının üç parçalı isteği üzerine: (1) bir remix oluştururken de,
tıpkı bir isteğe yanıt verirken olduğu gibi, "profilimde görünsün mü?"
seçeneği eklendi; (2) prompt detay sayfasındaki sekme grubu Yorumlar/
Remixler/Remix Dallanma Haritası olarak üçe çıkarıldı, varsayılan sekme
Yorumlar oldu; (3) "Remix"/"Remixler" kelimelerinin göründüğü UI
etiketleri/butonları "Türet"/"Türetilen promptlar" olarak yeniden
adlandırıldı, ve "Remix zinciri" (bu projede "Remix geçmişi" ile eşdeğer
tek etiket) "Türetme geçmişi" oldu.

**1. Türetme için profil görünürlüğü — hem UI hem alttaki filtre gerçekten
çalışıyor:**
- **Gerçek eksik neredeydi:** `createRealPrompt` (`lib/supabase/prompts.ts`)
  zaten `input.showOnProfile`'ı `remixOf` set olsa da olmasa da koşulsuz
  `prompts.show_on_profile`'a yazıyordu — veritabanı yazma yolu baştan beri
  hazırdı. Gerçek eksik iki yerdeydi: (a) `CreatePromptForm` yalnızca
  `isAnswerMode`'da `showOnProfile` state'ini kullanıyordu, remix modunda
  her zaman `true` gönderiyordu — arayüzde seçici de yoktu; (b)
  `filterProfileVisible()` yalnızca `origin.type === "request-response"`
  için `showOnProfile`'a bakıyordu, `"remix"` için asla — yani bir remix'i
  gizlemeyi seçmiş olsan bile `false` yazılan değer hiçbir listede
  gerçekte hiçbir şeyi gizlemiyordu (yazma çalışıyordu, okuma/filtre
  yoksayıyordu).
- **Düzeltme:** `filterProfileVisible` artık `prompt.origin.type ===
  "original" || prompt.showOnProfile` — hem `request-response` hem
  `remix` kökenli bir gönderi artık aynı kuralla filtreleniyor. Bu
  filtrenin BİLİNÇLİ OLARAK uygulanmadığı yerler (Bölüm 21 Faz 5'ten beri
  aynı ilke) değişmedi: `fetchRemixesOf`/`fetchRemixChain` (bir remix'in
  kendi kaynağa/köke/alt-remixlere ilişkisi ve harita/zincir görünümü, bu
  tercihe bakmaksızın her zaman doğru çözülmeli) ve `fetchPromptById`
  (doğrudan bir link). Yani "profilimde paylaşma" seçilen bir remix,
  yazarın normal profil/akış/keşfet/arama sonuçlarından çıkıyor AMA
  kaynağının kendi "Türetilen promptlar" listesinde/haritasında
  görünmeye devam ediyor — request-response yanıtlarının isteğin kendi
  yanıt listesinde her zaman görünmeye devam etmesiyle birebir aynı
  mantık.
- **`CreatePromptForm`:** "Bu yanıt profilimde görünsün mü?" bloğu artık
  `isAnswerMode || isRemixMode` koşuluna genişletildi, aynı iki radyo
  seçeneği (varsayılan "Profilimde paylaş") ile — yalnızca başlık ve
  açıklama metinleri moda göre değişiyor ("Bu türetme profilimde
  görünsün mü?", ve "Profilimde paylaşma" açıklaması remix bağlamında
  "kaynağının remix listesinde/haritasında görünmeye devam eder" diye
  netleştiriyor, çünkü bu, isteğe yanıt modundan farklı bir görünürlük
  yüzeyi). `showOnProfile` hem gerçek gönderim (`handleSubmit`) hem canlı
  önizleme (`previewPrompt`) için `isAnswerMode || isRemixMode ?
  showOnProfile : true` olarak güncellendi — düz "Prompt Oluştur" ve
  "Kopyasını Oluştur" modları (ikisi de zaten her zaman görünür olmalı,
  gizleyecek bir "kaynak" kavramları yok) değişmeden `true` kalıyor.
- **Nasıl doğrulandı (ağ seviyesinde taklit edilmiş Supabase yanıtlarıyla,
  Playwright):** `/create?remix=<id>` sayfasında "Bu türetme profilimde
  görünsün mü?" seçicisinin göründüğü, "Profilimde paylaşma"nın
  seçilebildiği, ve gerçek gönderimde INSERT gövdesinin gerçekten
  `show_on_profile: false` taşıdığı (network isteği doğrudan yakalanarak)
  doğrulandı — arayüz seçimi ile veritabanına yazılan değer arasında hiç
  kopukluk yok.

**2. Üç sekmeli gönderi bölümü, varsayılan "Yorumlar":** `prompt-detail-
view.tsx`'teki sekme state'i `"remixes" | "map"`'ten `"comments" |
"remixes" | "map"`'e genişledi, varsayılan değer `"comments"` oldu.
`CommentSection` artık ayrı, sekmelerin DIŞINDA duran bir blok değil —
üçüncü, ilk sıradaki "Yorumlar" sekmesinin içeriği. Sekme sırası:
**Yorumlar → Türetilen promptlar (N) → Remix Dallanma Haritası**.
`CommentSection`'ın kendi "Yorumlar (N)" başlığı (canlı sayaç) değişmeden
korunduğundan, "Yorumlar" sekme butonunun kendisi bir sayı taşımıyor —
tıpkı "Remix Dallanma Haritası" sekmesinin de kendi "N içerik" rozetini
zaten kendi araç çubuğunda gösterip sekme butonunda tekrarlamaması gibi
(Bölüm 9.15'te kurulan aynı "sayaç iki kez gösterilmesin" ilkesi).
Bildirimden gelen bir yorum/yanıt derin bağlantısı (`?hl=comment:<id>`)
ekstra bir sekme-değiştirme mantığına ihtiyaç duymuyor — Yorumlar zaten
varsayılan sekme olduğundan otomatik olarak doğru yerde açılıyor.
`aria-label="Remix görünümü"` artık artık üç bölümü de kapsadığından
`aria-label="Gönderi bölümleri"` olarak güncellendi.

**3. "Remix"/"Remixler" → "Türet"/"Türetilen promptlar" yeniden
adlandırması:** Yalnızca gerçek UI etiketleri/buton metinleri/rozet
metinleri değiştirildi — kod içi tip adları (`RemixGraphNode`,
`isRemixMode`, `origin.type === "remix"` gibi), dosya adları ve düz-yazı
açıklama cümleleri (ör. "remixi olarak dolduruldu" bilgi bandı, `Remix
Dallanma Haritası` sekme adının kendisi) kasıtlı olarak DOKUNULMADI —
şartname yalnızca üç kesin eşleme verdi (Remix→Türet, Remixler→Türetilen
promptlar, Remix geçmişi→Türetme geçmişi) ve bunu "butonlarda görünen
isim" diye çerçeveledi; bu üçünün doğal karşılıkları/tekrarları olan
yerler (tab/sekme etiketleri, rozetler, sayaç etiketleri) de aynı
mantıkla güncellendi, ama "Remix Dallanma Haritası" gibi listede açıkça
YER ALMAYAN özel isimler değiştirilmedi. Değiştirilen tam liste:
- `prompt-detail-view.tsx`: origin rozeti "Remix"→"Türet"; "Remix
  zinciri:" breadcrumb etiketi→"Türetme geçmişi:" (bu projede ayrı bir
  "Remix geçmişi" string'i hiç yoktu — zincir breadcrumb'ı bunun tek,
  en yakın karşılığı); "Remixle" eylem butonu→"Türet"; sekme etiketi
  "Remixler (N)"→"Türetilen promptlar (N)".
- `create-prompt-form.tsx`: remix modu başlığı "Remix Oluştur"→"Türet";
  remix ön-doldurmasının başlığa eklediği "(remix)" son eki→"(türetme)".
- `remix-map-node-card.tsx`: harita düğümü rozeti/aria-label'ı (Orijinal/
  Remix)→(Orijinal/Türet).
- `remix-node-detail-panel.tsx`: düğüm detay panelindeki rozet
  (Orijinal/Remix)→(Orijinal/Türet); "Remix sayısı:"→"Türetme sayısı:";
  "Remix Oluştur" butonu→"Türet".
- `remix-branch-map.tsx`: harita lejantındaki "Remix" swatch
  etiketi→"Türet".
- `profile-view.tsx`: profil sekmesi `label: "Remixler"`→`"Türetilen
  promptlar"`; boş-durum başlığı "İlk remixini oluştur"→"İlk türettiğin
  promptu oluştur".
- `profile-badges.tsx`: rozet etiketi "İlk remixini oluşturdu"→"İlk
  türettiği promptu oluşturdu".
- `profile-stats.tsx`: profil istatistik butonunun etiketi
  (`label="remix"`)→(`label="türetme"`) — bu, sayaca tıklanınca profilin
  "Türetilen promptlar" sekmesine geçen GERÇEK bir `<button>`, bu yüzden
  literal olarak "butonda görünen isim" kapsamına giriyor.
- `profile-toolbar.tsx`: sıralama seçeneği "En çok remixlenen"→"En çok
  türetilen".

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST yanıtlarıyla Playwright'ta iki yeni test dosyasıyla
27 senaryo (24 + 3) sıfır JS hatasıyla doğrulandı: prompt detay
sayfasında tam olarak 3 sekmenin doğru sırada (Yorumlar, Türetilen
promptlar, Remix Dallanma Haritası) göründüğü; "Yorumlar"ın varsayılan
seçili sekme olduğu VE yorum içeriğinin sayfa açılır açılmaz (tıklama
gerekmeden) göründüğü; sayfanın hiçbir yerinde "Remixler" metninin
kalmadığı; origin rozetinin "Türet" gösterdiği; "Türetme geçmişi:"
breadcrumb'ının gerçek bir >1 zincirde doğru göründüğü; sekmeler arası
geçişin doğru içerik gösterip/gizlediği; harita lejantının "Türet"
kullandığı; `/create?remix=<id>`'de başlığın "Türet" olduğu, görünürlük
seçicisinin göründüğü, başlığın "(türetme)" son ekiyle dolduğu, ve
seçilen radyonun gerçekten işaretlenebildiği; gerçek bir profilde
"Türetilen promptlar" sekmesinin ve "türetme" istatistik butonunun
göründüğü; ayrı bir testte remix gönderiminin gerçek INSERT gövdesinin
`show_on_profile: false`'u doğru taşıdığı. Ayrıca Bölüm 9.14/9.15'in
42 senaryolu tam merge/harita regresyon paketi (sekme metni/varsayılanı
güncellenerek — davranış değil, yalnızca isimler değişti), 32 senaryolu
bildirim merkezi paketi, 19 senaryolu yorum ağacı paketi, 5 senaryolu
yorum-profil-linki paketi ve 19 rotalık genel dayanıklılık taraması
sıfır regresyonla yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — hiçbir yeni migration gerekmedi (bu görev
tamamen mevcut şema/RPC'ler üzerinde, yalnızca frontend'de çalıştı), bu
yüzden kullanıcının Dashboard'da yapması gereken ekstra bir adım yok.

**Bilinen sınırlamalar:**
- **Düz-yazı cümlelerdeki "remix" kelimesi değiştirilmedi** (ör.
  `post-context.tsx`'teki "Remixlenen çalışma" kutu başlığı,
  `create-prompt-form.tsx`'teki "...içeriğinin remixi olarak dolduruldu"
  bilgi bandı, kod içi Türkçe yorumlar) — şartname yalnızca üç kesin
  buton/etiket eşlemesi verdi, düz-yazı açıklama cümlelerini kapsamıyordu;
  bunları da değiştirmek, istenmeyen bir kapsam genişlemesi ve tutarsız
  yarı-çeviri riski olurdu.
  **Güncelleme — bkz. Bölüm 9.17 ve 9.18:** kullanıcı daha sonra hem
  "Remixlenen çalışma" kutu başlığını (Bölüm 9.17'de "Türetilen çalışma"
  oldu) hem "...içeriğinin remixi olarak dolduruldu" bilgi bandını
  (Bölüm 9.18'de "...içeriğin türetilen promptu olarak dolduruldu" oldu)
  değiştirmeyi istedi — her ikisi de bu sonraki bölümlerde tersine
  çevrildi. Kod içi Türkçe yorumlar (kullanıcıya hiç görünmeyen) hâlâ
  dokunulmadı.
- **"Remix Dallanma Haritası" adı değişmedi** — bu, üç kesin eşlemeden
  hiçbirine birebir uymuyor (ne yalın "Remix" ne "Remixler" ne "Remix
  geçmişi"), kendi özel bileşik adı; kasıtlı olarak dokunulmadı.
  **Güncelleme — bkz. Bölüm 9.17:** kullanıcı bu ismi de değiştirmeyi
  istedi, bu karar Bölüm 9.17'de tersine çevrildi.

---

### 9.17 İki ek yeniden adlandırma + "Türet" ikonunun git-branch'e değişmesi

Kullanıcının Bölüm 9.16'nın hemen ardından gelen üç parçalı ek isteği:
(1) "Remixlenen çalışma" → "Türetilen çalışma", (2) "Remix Dallanma
Haritası" → "Prompt geçmişi" (Bölüm 9.16'nın bilinçli olarak dokunmadığı
bu özel isim, burada kullanıcının açık talebiyle değiştirildi — yukarıdaki
not güncellendi), (3) "Türet" ile eşleşen `Repeat2` ikonunun proje zaten
kullandığı ikon paketindeki (`lucide-react`) `GitBranch` ikonuyla
değiştirilmesi.

**1. "Remixlenen çalışma" → "Türetilen çalışma":** `post-context.tsx`'teki
`RemixContext`'in iki dalı da (kaynağı silinmiş VE normal durum) güncellendi
— ikisi de aynı etiketi paylaşıyordu.

**2. "Remix Dallanma Haritası" → "Prompt geçmişi":** `prompt-detail-
view.tsx`'teki üçüncü sekmenin görünen metni + `remix-branch-map.tsx`'in
haritanın kendi `role="img"` konteynerine verdiği erişilebilirlik
`aria-label`'ı (`"${nodeCount} içerikten oluşan remix dallanma haritası,
odak: ..."` → `"... prompt geçmişi, odak: ..."`) güncellendi — ikisi de
gerçek kullanıcı/ekran-okuyucu tarafından görülen metin. Dosya adları
(`remix-branch-map.tsx`, `remix-map-node-card.tsx`), bileşen/tip adları
(`RemixBranchMap`, `RemixGraphNode`), ve kod içi Türkçe yorumlardaki
("Remix Dallanma Haritası" diye anılan iç dokümantasyon) geçişler kasıtlı
olarak DEĞİŞTİRİLMEDİ — bunlar kullanıcıya hiç görünmüyor, yalnızca UI'da
görünen iki string değişti.

**3. "Türet" ikonu → `GitBranch`:** Projenin tamamında "remix/türet"
kavramını temsil eden HER `Repeat2` kullanımı (yalnızca tek bir buton
değil — aynı kavramı farklı yerlerde tutarsız gösteren iki farklı ikon
bırakmamak için) `GitBranch`'e çevrildi, çünkü artık dallanma/türetme
temalı bir isimlendirme (Türet, Türetilen promptlar, Türetme geçmişi,
Prompt geçmişi) kullanılıyor ve `GitBranch` bu kavrama `Repeat2`'den daha
uygun (`GitBranch` zaten `remix-node-detail-panel.tsx`'te "Kaynağı Aç"
butonu için kullanılıyordu — yeni bir bağımlılık eklenmedi, var olan ikon
paketinden mevcut bir ikon). Değiştirilen tüm yerler:
- `prompt-detail-view.tsx`: alt istatistik satırındaki remix sayacı ikonu,
  "Türet" eylem linkinin ikonu, "Prompt geçmişi" sekme butonunun ikonu
  (3 kullanım).
- `post-context.tsx`: "Türetilen çalışma" bağlam kutusunun ikonu (2 dal).
- `create-prompt-form.tsx`: remix ön-doldurma bilgi bandının ikonu.
- `prompt-card-footer.tsx`: kart footer'ındaki remix sayacı linkinin ikonu
  — aynı yerde `title="Bu promptu remixle"` tooltip metni de tutarlılık
  için `title="Bu promptu türet"` oldu.
- `remix-node-detail-panel.tsx`: harita detay panelindeki "Türet" butonunun
  ikonu (panelin "Kaynağı Aç" butonu zaten `GitBranch` kullanıyordu, bu
  değişmeden kaldı — artık ikisi de aynı ikonu paylaşıyor, ki ikisi de
  dallanma/türetme ile ilgili kavramlar).
- `profile-badges.tsx`: "İlk türettiği promptu oluşturdu" rozetinin ikonu.
- `profile-view.tsx`: "Türetilen promptlar" sekmesinin boş-durum ikonu.
- `notification-utils.ts`: `remix` bildirim tipinin ikonu (bildirim
  merkezinde bir remix bildirimi artık `GitBranch` gösteriyor).
- **Değiştirilmeyen yerler (bilinçli):** `remix-branch-map.tsx`'in haritanın
  kendi lejantındaki "Türet" rengi (zaten bir ikon değil, düz renkli bir
  nokta), `remix-map-node-card.tsx`'in düğüm rozetleri (zaten metin,
  ikon yok) — bunlarda değiştirilecek bir `Repeat2` hiç yoktu.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta yeni bir 13
senaryolu test dosyasıyla doğrulandı: sayfanın hiçbir yerinde artık ne
"Remix Dallanma Haritası" ne "Remixlenen çalışma" metninin kalmadığı;
sayfanın hiçbir yerinde artık lucide'ın `repeat-2` ikon sınıfının
render edilmediği (`svg.lucide-repeat-2` sıfır eşleşme); "Türet"
butonunun, "Prompt geçmişi" sekmesinin ve "Türetilen çalışma" bağlam
kutusunun HER BİRİNİN gerçekten `svg.lucide-git-branch` render ettiği;
haritanın kendi erişilebilirlik `aria-label`'ının artık "prompt geçmişi"
metnini taşıdığı; kart footer'ındaki linkin güncellenmiş `title="Bu
promptu türet"` tooltip'ini taşıdığı VE `GitBranch` ikonunu gösterdiği —
hepsi sıfır JS hatasıyla. Ayrıca Bölüm 9.14/9.15/9.16'nın 42 senaryolu
tam merge/harita regresyon paketi (tab metni güncellenerek — davranış
değil, yalnızca isimler/ikon değişti), 32 senaryolu bildirim merkezi
paketi ve 19 rotalık genel dayanıklılık taraması sıfır regresyonla
yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — hiçbir yeni migration gerekmedi (bu görev
tamamen frontend'de, ikon/etiket değişikliği), bu yüzden kullanıcının
Dashboard'da yapması gereken ekstra bir adım yok.

**Bilinen sınırlamalar:** Yok — bu, önceki bir modülün terminoloji/ikon
kararını kullanıcının talebiyle değiştiren, kapsamı net bir düzeltme;
yeni bir mimari sınırlama getirmedi.

---

### 9.18 Türetme ekranındaki iki düz-yazı cümlesinin de "Türet" terminolojisine geçmesi

Kullanıcının, `/create?remix=<id>` sayfasındaki "Bu türetme profilimde
görünsün mü?" seçicisinin ekran görüntüsüyle birlikte gelen isteği üzerine
— Bölüm 9.16'nın bilinçli olarak dokunmadığı (ve Bölüm 9.17'nin
"Bilinen sınırlamalar"ında "düz-yazı cümleleri kapsam dışı" diye
gerekçelendirdiği) iki cümle de artık "Türet" terminolojisine geçti:

1. `create-prompt-form.tsx`'teki remix-modu "Bu türetme profilimde
   görünsün mü?" seçicisinin İKİ radyo açıklaması da (hem "Profilimde
   paylaş" hem "Profilimde paylaşma" seçeneği) "remix listesinde/
   haritasında" ifadesini artık projenin kendi güncel sekme adlarına
   (Bölüm 9.16'nın "Türetilen promptlar" sekmesi, Bölüm 9.17'nin "Prompt
   geçmişi" sekmesi) referans verecek şekilde değiştirdi: "Türetilen
   promptlar listesinde/Prompt geçmişinde görünmeye devam eder" — anlam
   hiç değişmedi (kaynağın kendi remix listesi/haritasında bu türetmenin
   hâlâ göründüğü gerçeği aynı), yalnızca hangi sekmeden bahsedildiği artık
   kullanıcının ekranda gerçekten gördüğü isimlerle eşleşiyor.
2. Kaynak prompttan/istekten form alanlarını önceden dolduran bilgi
   bandındaki "&ldquo;{başlık}&rdquo; içeriğinin remixi olarak dolduruldu"
   cümlesi, kullanıcının verdiği tam metinle "&ldquo;{başlık}&rdquo;
   içeriğin türetilen promptu olarak dolduruldu" oldu — cümlenin geri
   kalanı (" — dilediğin gibi düzenleyebilirsin, köken bağlantısı
   korunuyor.") değişmedi.

**Kapsam notu:** Bu iki cümle, Bölüm 9.16'nın "Kapsam dışı bırakılan"
notunda VE Bölüm 9.17'nin "Bilinen sınırlamalar"ında AÇIKÇA isim
verilerek ("`post-context.tsx`'teki 'Remixlenen çalışma' kutu başlığı,
`create-prompt-form.tsx`'teki '...içeriğinin remixi olarak dolduruldu'
bilgi bandı") kasıtlı olarak dokunulmamış örnekler olarak
işaretlenmişti — "Remixlenen çalışma" kutu başlığı zaten Bölüm 9.17'de
ayrı bir talep üzerine değiştirilmişti, bu görev aynı kararın İKİNCİ
yarısını (bilgi bandı + iki radyo açıklaması) tersine çeviriyor. Bu, tek
bir hatalı örnek değil, gerçek bir kullanıcı talebi — bu yüzden yeni bir
"düz-yazı cümlelerini de değiştir" genel kuralı İCAT EDİLMEDİ, yalnızca
kullanıcının ekran görüntüsüyle işaret ettiği ÜÇ CÜMLE değiştirildi. Diğer
düz-yazı cümlelerdeki "remix" kelimesi (ör. kod içi Türkçe yorumlar, bu
üçünün dışındaki başka metinler) kasıtlı olarak DOKUNULMADI — şartname
yalnızca bu ekrandaki metinleri işaret etti.

**Değiştirilen dosya:** yalnızca `src/features/prompts/create-prompt-
form.tsx` — üç düz metin değişikliği, hiçbir mantık/state/prop
değişmedi (`showOnProfile`/`isRemixMode` koşulları, form gönderimi,
önizleme hep aynı kaldı, yalnızca görüntülenen cümleler değişti).

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Kod tabanında "remix
listesinde/haritasında" veya "remixi olarak dolduruldu" ifadesinin başka
bir yerde kalmadığı `grep` ile doğrulandı (sıfır eşleşme). Ağ seviyesinde
taklit edilmiş Supabase REST yanıtlarıyla Playwright'ta yeni, 5 senaryolu
bir test dosyasıyla (`remix-wording-test.mjs`) doğrulandı: eski "remix
listesinde/haritasında" metninin hiç kalmadığı; "Profilimde paylaş"
açıklamasının "Türetilen promptlar listesinde" ifadesini içerdiği;
açıklamaların "Prompt geçmişinde" ifadesini içerdiği; eski "içeriğinin
remixi olarak dolduruldu" metninin hiç kalmadığı; bilgi bandının artık
"içeriğin türetilen promptu olarak dolduruldu" gösterdiği — hepsi sıfır
JS hatasıyla geçti. Ayrıca Bölüm 9.14/9.15/9.16/9.17'nin regresyon
paketleri (rename-icon-test: 13/13, remix-tabs-rename-test: 24/24,
remix-merge-map-test: 42/42, notification-center-test: 32/32) ve 19
rotalık genel dayanıklılık taraması sıfır regresyonla yeniden
çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — hiçbir yeni migration gerekmedi (bu görev
tamamen frontend metin değişikliği), bu yüzden kullanıcının Dashboard'da
yapması gereken ekstra bir adım yok.

**Bilinen sınırlamalar:** Yok — bu, önceki iki bölümün (9.16/9.17) bilinçli
kapsam dışı bıraktığı iki cümleyi kullanıcının yeni talebiyle değiştiren,
kapsamı net bir düzeltme; yeni bir mimari sınırlama getirmedi.

---

### 9.19 Koleksiyonlara kaydetme sistemi

Kullanıcının çok kapsamlı 14 bölümlük şartnamesi üzerine — bir çalışmayı
kaydederken doğrudan tek bir "Kaydedilenler" listesine değil, kullanıcının
kendi oluşturduğu adlı koleksiyonlara ekleyebilmesi.

**AŞAMA 1 denetim bulgusu — mimari karar:** Mevcut genel kaydetme sistemi
(`prompt_saves`, Bölüm 21 Faz 3) zaten ayrı, sağlam ve `useSaveState`/
`SaveButton` üzerinden çalışıyordu. Şartnamenin kendi §9'unun bıraktığı iki
seçenekten ("genel kaydetme ile koleksiyon üyeliği aynı şey olmak zorunda
değil") **ayrı ilişki** kararı verildi — `prompt_saves` hiç değiştirilmedi,
bozulmadı; yeni, bağımsız bir `collection_items` ilişkisi eklendi. Bir
çalışma aynı anda genel kaydedilenlerde VE birden fazla koleksiyonda
bulunabilir; bir koleksiyondan kaldırmak ne genel kaydı ne başka bir
koleksiyondaki üyeliği etkiler (Bölüm 9.7'nin "bir yerden silmek başka
hiçbir şeyi bozmaz" ilkesiyle aynı ruh).

**Yeni migration: `supabase/migrations/20260919260000_collections.sql`:**
- `collections` (id, owner_id, name — 1-80 karakter CHECK, visibility
  `public`/`private`, denormalize `item_count`, created_at/updated_at) —
  `set_updated_at()` trigger'ı (extensions_and_helpers.sql'den) yeniden
  kullanıldı, yeni bir fonksiyon yazılmadı.
- `collection_items` (collection_id, prompt_id, created_at; PK
  `(collection_id, prompt_id)` — aynı çalışma aynı koleksiyona veritabanı
  seviyesinde iki kez eklenemez, ekstra bir "zaten var mı" kontrolüne gerek
  yok).
- `handle_collection_item_change` trigger'ı — `prompt_likes`/`prompt_saves`
  ile birebir aynı desende `item_count`'u INSERT/DELETE'te günceller.
- **RLS:** `collections` — herkese açık koleksiyon herkese, özel koleksiyon
  yalnızca sahibine okunur (`prompts.status='draft'` deseniyle birebir
  aynı); insert/update/delete yalnızca `owner_id = auth.uid()`.
  `collection_items` — bir öğe, ebeveyn koleksiyon görülebiliyorsa
  okunabilir; yazma (ekleme/kaldırma) yalnızca çağıranın SAHİP OLDUĞU bir
  koleksiyona `exists (select 1 from collections c where c.id = ... and
  c.owner_id = auth.uid())` ile sınırlı — istemciden gelen hiçbir kimliğe
  güvenilmiyor, her zaman gerçek `owner_id`'ye geri bağlanıyor.

**Yeni `src/lib/supabase/collections.ts`:** `fetchOwnCollections`,
`fetchCollectionById`, `fetchCollectionItems` (soft-deleted promptları
`prompts.ts`'teki aynı filtreyle dışlıyor), `fetchCollectionIdsContaining`
(bir çalışmanın hangi koleksiyonlarda olduğu — modalın "+/kayıtlı" durumu
için), `createCollection`, `updateCollection`, `deleteCollection`,
`addItemToCollection`, `removeItemFromCollection`. Kapak görseli ayrı bir
yüklenen alan DEĞİL — `fetchCovers()` her koleksiyon için en son eklenen
öğenin ilk medyasını tek bir toplu sorguyla (`.in("collection_id", ids)`)
çekiyor, N+1 yok.

**Koleksiyona ekleme = genel kaydetme (bilinçli bağ):** Şartnamenin §4'ü
("Koleksiyonlar, kaydedilen içeriklerden bağımsız bir sistem gibi
davranmamalı") gereği `addItemToCollection`, `collection_items`'a INSERT
attıktan sonra mevcut `savePrompt()`'u (saves.ts, hiç değiştirilmedi) da
çağırıyor — bir koleksiyona eklemek artık bu uygulamanın birincil "kaydet"
eylemi, bu yüzden genel "Kaydedilenler > Tümü" listesi de otomatik
doluyor. Bir koleksiyondan kaldırmak ise genel kaydı GERİ ALMIYOR (yalnızca
o koleksiyondaki üyeliği siliyor) — kasıtlı, tek yönlü bir bağ.

**UI (`src/features/collections/`):**
- `save-to-collection-modal.tsx` (`SaveToCollectionModal`) — bookmark
  ikonuna basınca artık doğrudan toggle yerine bu modal açılıyor
  (`save-button.tsx` güncellendi, `useSaveState`'in kendisi hiç
  değişmedi — yalnızca `toggle()` çağrısı `setModalOpen(true)` oldu).
  Koleksiyonları listeler (kapak/ad/sayı/+ veya ✓), her satır bağımsız
  optimistic ekleme/kaldırma yapar (hata olursa geri alınır). **"+ Yeni
  koleksiyon oluştur" ikinci bir modal AÇMIYOR** — şartnamenin §2 kuralına
  uyarak aynı modal kabuğunun içeriği `view: "list" | "create"` state'iyle
  yerinde değişiyor (aynı dialog, X hep aynı yerde, akış kopmuyor). Yeni
  koleksiyon bu akıştan oluşturulunca mevcut çalışma otomatik ekleniyor
  (şartname §2'nin "kaydetme akışından oluşturulan koleksiyona otomatik
  ekle" kuralı); profil sayfasındaki "+ Koleksiyon oluştur" ise AYRI,
  bağımsız bir `CollectionFormModal` kullanıyor ve hiçbir çalışma
  eklemiyor — şartname §2'nin "hangi ekrandan açıldığına göre doğru
  davranmalı" ayrımı, iki farklı giriş noktasının iki farklı (ama aynı
  `CollectionForm`'u paylaşan) modal kullanmasıyla sağlandı.
- `collection-form.tsx` (`CollectionForm`) — ad + gizlilik radio-card'ları,
  hem create hem edit için paylaşılan tek form; boş/80 karakter üstü isim
  gönderilemez, çift gönderim `isSubmitting` ile engellenir.
- `collection-form-modal.tsx` — profil sayfasından bağımsız oluşturma VE
  düzenleme için ortak modal kabuğu (`collection` prop'u varsa düzenleme).
- `collections-panel.tsx` — profilin "Koleksiyonlar" alt sekmesi: grid,
  "+ Koleksiyon oluştur", boş durum.
- `collection-card.tsx` / `collection-more-menu.tsx` — kapak/ad/sayı/
  gizlilik rozeti + kebab menüden Düzenle/Sil (iki tıklamalı onay,
  `PostMenu`/`ProfileMoreMenu` ile aynı desen).
- `collection-detail-view.tsx` + yeni `/collections/local?id=` rotası
  (`promptHref`/`requestHref`/`tagHref` ile birebir aynı desen —
  koleksiyonlar da build-zamanında bilinmeyen gerçek Supabase satırları).
  RLS zaten "bulunamadı" ile "özel, erişimin yok" ayrımını yapmıyor —
  ikisi de aynı dürüst "Koleksiyon bulunamadı" ekranına düşüyor
  (`fetchConversationForUser`'ın kabul ettiği aynı belirsizlikle aynı
  karar). **Koleksiyondan kaldırma** ayrı bir buton olarak eklenmedi —
  detay sayfasındaki her kartın kendi bookmark ikonu zaten aynı
  `SaveToCollectionModal`'ı açıyor, kullanıcı oradan bu koleksiyonun
  işaretini kaldırabiliyor; paralel bir ikinci "kaldır" mekanizması kurmak
  yerine var olan akış yeniden kullanıldı.

**Profil entegrasyonu (`profile-view.tsx`):** Mevcut "Kaydedilenler" sekmesi
(yalnızca `isOwnProfile`) hiç değişmeden duruyor; sekmenin içine, yalnızca
o sekme aktifken görünen bir "Tümü / Koleksiyonlar" alt sekme satırı
eklendi. "Tümü" eski davranışın (mevcut `savedPrompts` + toolbar/grid)
birebir aynısı; "Koleksiyonlar" yeni `CollectionsPanel`'i render ediyor.

**Güvenlik:** İstemciden gelen hiçbir `user_id`/`owner_id`'ye güvenilmiyor
— her yazma RLS'te gerçek `auth.uid()`'ye karşı, `collections.owner_id`
üzerinden doğrulanıyor. Bir kullanıcı başka birinin koleksiyon id'sini
tahmin etse bile ne düzenleyebilir ne silebilir ne de ona öğe
ekleyebilir/kaldırabilir (üç ayrı policy, üçü de aynı `owner_id =
auth.uid()` sahiplik kontrolüne dayanıyor). Gizlilik değişikliği
(`herkese açık` ↔ `sadece ben`) RLS'in SELECT politikasındaki
`visibility` kolonuna doğrudan bağlı olduğundan, bir güncelleme anında
gerçek erişim kuralına yansıyor — ayrı bir "cache temizleme" adımı
gerekmiyor.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (21 rota — yeni `/collections/local` dahil) sıfır hatayla geçti.
**Dürüstçe belirtilmesi gereken sınırlama:** önceki modüllerin aksine, bu
görev için ne yerel bir PostgreSQL 16 örneğinde gerçek RLS/trigger testi
ne de ağ seviyesinde taklit edilmiş Supabase yanıtlarıyla bir Playwright
uçtan uca testi çalıştırıldı — yalnızca statik analiz (tip kontrolü, lint,
build) ile doğrulandı. Migration dosyası önceki 20 migration'ın kurduğu
kalıpları (aynı trigger fonksiyonu adlandırma stili, aynı RLS ownership
deseni, aynı denormalize sayaç yaklaşımı) birebir izliyor ve bu kalıplar
daha önce gerçekten test edilmiş durumda, ama bu SPESİFİK migration'ın
kendisi hiç çalıştırılmadı. **Kullanıcının yapması gereken:**
`20260919260000_collections.sql`'i Dashboard → SQL Editor'de uygulamak, ve
kaydetme modalını, koleksiyon oluşturma/düzenleme/silme akışlarını
gerçek hesabıyla bizzat denemek.

**Bilinen sınırlamalar:**
- **Gerçek Supabase/RLS testi yapılmadı** (yukarıda açıklandı) — bu
  oturumun en dürüst eksiği, önceki modüllerin standardının altında.
- Koleksiyon adları için tekillik (aynı kullanıcıda aynı isim) kontrolü
  yok — prompt başlıkları gibi bu proje genelinde zaten tekil olması
  gerekmeyen bir alan, tutarlı bırakıldı.
- Koleksiyon kapak görseli her zaman "en son eklenen öğe" — kullanıcı
  belirli bir kapak seçemiyor; şartname böyle bir seçim istemedi.
- Koleksiyon detay sayfasında ayrı bir "koleksiyondan kaldır" butonu yok
  (yukarıda gerekçesiyle açıklandı) — var olan kaydet modalı üzerinden
  yapılıyor.
- Genel "Kaydedilenler" listesi bir koleksiyona eklenince otomatik
  büyüyor, ama bir koleksiyondan çıkarılınca KÜÇÜLMÜYOR (tek yönlü bağ,
  yukarıda "bilinçli bağ" olarak açıklandı) — kasıtlı bir ürün kararı,
  şartnamenin kendisi de aksini istemedi.

---

### 9.20 Koleksiyon sisteminde mobil yerleşim/modal katmanlama hatalarının düzeltilmesi

Kullanıcının ekran görüntüleriyle bildirdiği hatalar üzerine — bu bir yeni
özellik görevi değil, Bölüm 9.19'un gerçek kök nedenli bir düzeltmesi.
Hiçbir veri modeli/API/akış değişmedi, yalnızca dört dosyanın DOM/CSS
yapısı düzeltildi.

**Kök neden 1 — koleksiyon kartı menüsü ekran dışına taşıyordu:**
`CollectionCard`'ın kök `div`'i `relative overflow-hidden` (kapak
görselinin köşelerini yuvarlamak için); `CollectionMoreMenu`'nün açılır
paneli bunun İÇİNDE `position: absolute` bir öğeydi. `CollectionsPanel`'in
mobil grid'i (`grid-cols-2`) her kartı ~170px genişliğinde bırakıyor —
menü ise `w-52` (208px) ve `right-0` ile hizalıydı, yani kartın SOL
kenarından taşıyordu VE kartın kendi `overflow-hidden`'ı bu taşan kısmı
kırpıyordu ("Koleksiyonu düzenle" tamamen tıklanamaz hale geliyordu).
`PostMenu` (gönderi kartlarındaki aynı desendeki üç nokta menüsü) bu
hatayı göstermiyordu çünkü `PromptCard` mobilde tek sütun (viewport
genişliğinde), menü rahatça sığıyor — `CollectionCard` özelinde bir
sorundu.

**Kök neden 2 — koleksiyon modalının arkası/önü karışıyordu:** `SaveToCollectionModal`,
`SaveButton` üzerinden `PromptCardFooter`'ın (`relative z-10` — gerçek bir
stacking context yaratan öğe) İÇİNDE render ediliyordu. `position: fixed`
bir öğe viewport'a göre KONUMLANIR ama STACKING (hangi öğenin hangisinin
üstünde boyandığı) hâlâ DOM ebeveylerinin stacking context zincirine
bağlıdır — modal, kendi kartının `z-10` bağlamına hapsoluyordu. Aynı
`z-10` seviyesindeki BAŞKA bir kartın (feed'de sonra gelen, dolayısıyla
sonra boyanan) footer'ı, modalın üzerine "sızıyordu" — kullanıcının
gördüğü "arka plandaki gönderi modalın içinden görünüyor" ve "yazılar üst
üste biniyor" tam olarak buydu. Bu, `overflow-hidden` ile alakasız, saf
bir CSS stacking-context tuzağı.

**Kalıcı çözüm — iki yeni paylaşılan altyapı bileşeni:**
- `src/components/ui/portal.tsx` (`Portal`) — `children`'ı
  `createPortal` ile doğrudan `document.body`'ye taşıyor. Bu, kök neden
  2'yi KÖKTEN çözüyor: portallanan bir öğe artık kartın DOM alt ağacında
  değil, hiçbir ebeveynin stacking context'ine hapsolamaz.
- `src/components/ui/modal.tsx` (`Modal`) — `Portal` + backdrop
  (`fixed inset-0 z-50 bg-black/40`) + Escape ile kapatma + referans
  sayaçlı body scroll kilidi (birden fazla modal örneği güvenle iç içe
  açılıp kapanabilir, kilit yalnızca sayaç gerçekten sıfıra inince
  kalkıyor) tek yerde topluyor. `SaveToCollectionModal` ve
  `CollectionFormModal` artık kendi `fixed inset-0` sarmalayıcılarını
  elle kurmak yerine bunu kullanıyor — modalın kendi paneli (başlık/
  liste/buton yerleşimi) hiç değişmedi, yalnızca dış kabuk.
- `CollectionMoreMenu`: açılır panel artık `Portal` ile `document.body`'ye
  render ediliyor ve konumu `getBoundingClientRect()`'ten hesaplanan
  gerçek piksel koordinatlarıyla, viewport'a göre kırpılarak (`left`
  değeri `[8, innerWidth - 208 - 8]` aralığına sıkıştırılıyor)
  belirleniyor — sabit `right-0` yerine ekranın hangi kenarına yakın
  olursa olsun her zaman tamamen görünür. Kartın kendi `overflow-hidden`'ı
  artık menüyü hiç etkilemiyor (menü artık o kartın alt ağacında değil).
  Dışarı tıklama/Escape/scroll-resize'da kapatma korunuyor, yalnızca tek
  bir ref yerine tetikleyici + panel için ayrı iki ref kullanıyor (panel
  artık DOM'da farklı bir yerde).

**Ek, düşük riskli sağlamlaştırma (`collection-card.tsx`):** kart köküne
ve alt içerik sarmalayıcısına `min-w-0` eklendi, sayaç/gizlilik satırı
`flex-wrap` oldu — Bölüm 9.14'ün zaten belgelediği "CSS Grid item'ları
varsayılan `min-width:auto` ile taşabilir" tuzağına karşı aynı, kanıtlanmış
düzeltme; `overflow-hidden`'ın kendisi (kapak görselinin köşe yuvarlaması
için hâlâ gerekli) DEĞİŞTİRİLMEDİ.

**Nasıl doğrulandı:** Bu sandbox'ta gerçek Supabase erişimi olmadığından
(tekrarlanan sınırlama) tam uygulama uçtan uca Playwright ile test
edilemedi — bunun yerine iki KÖK NEDENİN KENDİSİ, uygulamanın gerçek CSS
değerleriyle (aynı genişlikler, aynı `overflow-hidden`/`relative z-10`
kombinasyonu) izole, bağımsız birer HTML/Playwright script'iyle hem
HATA HEM DÜZELTME olarak mekanik şekilde kanıtlandı (gerçek tarayıcıda,
gerçek `elementFromPoint`/`getBoundingClientRect` ölçümleriyle, tahmin
değil):
- Menü testi: 173.5px'lik (gerçek mobil 2 sütun genişliği) bir kartta
  208px'lik menü `right-0` ile `-29.5px`'ten başlıyor, "Koleksiyonu
  düzenle" `elementFromPoint` ile HİÇ bulunamıyor (kırpılmış/tıklanamaz)
  — portallanıp kırpılmış pozisyonla (`left: 8px`) yeniden konumlanınca
  menü tamamen viewport içinde ve öğe gerçekten tıklanabilir hale geliyor.
- Modal testi: `z-10` bir footer'ın içine yerleştirilmiş `fixed z-50`
  bir modalın üstüne, DOM'da SONRA gelen başka bir `z-10` kartın metni
  gerçekten boyanıyor (`elementFromPoint` bunu kanıtlıyor) — modal
  `document.body`'ye taşınınca aynı noktada artık modal boyanıyor.
- Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (21 rota,
  değişmedi) sıfır hatayla geçti.

**Hâlâ kalan/gerçek kullanıcıyla doğrulanması gereken:** Gerçek bir iOS
Safari'de body scroll kilidinin (`document.body.style.overflow =
"hidden"`) hiç sıçrama/zıplama yapmadan çalıştığı, ve gerçek koleksiyon
verisiyle (gerçek Supabase projesi) tüm akışın uçtan uca sorunsuz olduğu
— bu sandbox'ın ağ kısıtı yüzünden (Bölüm 17'den beri tekrarlanan aynı
sınırlama) hiç canlı denenemedi.

---

### 9.21 Kaydet ikonu — kayıtlıyken tekrar modal açma hatasının düzeltilmesi

Kullanıcının bildirdiği hata: kayıtlı (dolu) bookmark ikonuna basınca
"Koleksiyona ekle" modalı yeniden açılıyordu — oysa ikon zaten "kayıtlı"
durumunu gösteriyor, tekrar tıklamanın anlamı doğrudan kaydı kaldırmak
olmalı. Kök neden: `save-button.tsx`'in `onClick`'i `isSaved` durumuna
hiç bakmadan HER ZAMAN `setModalOpen(true)` çağırıyordu (Bölüm 9.19'da
"bookmark artık modal açar" kararı verilirken kayıtlı/kayıtsız ayrımı
unutulmuştu).

**Düzeltme — yalnızca bu iki dosya:**
- `use-save-state.ts`: eski `toggle()` yerine iki ayrı, amaca uygun
  fonksiyon — `unsave()` (yalnızca genel `prompt_saves` kaydını siler,
  koleksiyon üyeliğine hiç dokunmaz — Bölüm 9.19'un "tek yönlü bağ"
  kararıyla tutarlı; optimistik + hata halinde geri alma; eşzamanlı
  çağrılara karşı `isToggling` korumalı; yalnızca gerçek başarıda `true`
  döner) ve `markSaved()` (modalın kendi gerçek INSERT'i sonrası state'i
  senkronlamak için — sahte/iyimser bir tahmin değil, zaten gerçekleşmiş
  bir yazmayı yansıtıyor).
- `save-button.tsx`: `onClick` artık `isSaved`'e bakıyor — kayıtlı
  değilse eskisi gibi modalı açıyor; kayıtlıysa modalı HİÇ açmadan
  doğrudan `unsave()` çağırıyor, ikon anında boşalıyor, başarılı
  olursa (yalnızca gerçekten başarılıysa) "Kaydedilenlerden kaldırıldı."
  bildirimi kısa süreliğine gösteriliyor (yeni, projede daha önce hiç
  olmayan bir toast sistemi KURULMADI — yalnızca bu buton için, `Portal`
  ile taşınan, 2.2 saniye sonra kendini kapatan minimal bir bildirim).
  İstek sürerken buton `disabled` — çift tıklama/yinelenen çağrı
  engelleniyor.

**Kasıtlı olarak değiştirilmeyen:** `SaveToCollectionModal`'ın kendisi —
bir koleksiyona ekleme sonrası modal hâlâ otomatik kapanmıyor (kullanıcı
aynı oturumda birden fazla koleksiyona ekleyebilsin diye, Bölüm 9.19'un
bilinçli tasarımı); bu görev yalnızca "kayıtlıyken tekrar tıklamak modal
AÇMASIN" kuralını düzeltti, modal davranışına dokunmadı.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (21 rota, değişmedi) sıfır hatayla geçti. `useSaveState`/
`SaveButton`'ın yeni durum makinesi kod üzerinde adım adım izlenerek
şartnamenin 8 test senaryosunun tamamı doğrulandı (modal yalnızca kayıtsızken
açılıyor, kayıtlıyken hiç `setModalOpen` çağrılmıyor, hata durumunda
`isSaved` eski değerine dönüyor, sayfa yenilemesi zaten değişmeyen
`fetchIsSaved` effect'ine bağlı). Gerçek Supabase'e karşı canlı bir
tıklama testi bu sandbox'ın ağ kısıtı yüzünden yapılamadı (tekrarlanan
sınırlama) — kullanıcının kendi ortamında denemesi gerekiyor.

**Bilinen sınırlamalar:** Yok — dar kapsamlı, kök nedenli bir davranış
düzeltmesi; yeni bir mimari sınırlama getirmedi.

---

### 9.22 Kaydedilenler ve Koleksiyon Sistemini Kalıcı Olarak Düzeltme ve Tamamlama

Kullanıcının çok kapsamlı 26 bölümlük şartnamesi üzerine — Bölüm 9.19-9.21'in
kurduğu koleksiyon sistemi, "genel kaydetme = `prompt_saves`, koleksiyon
üyeliği = ayrı `collection_items`, ikisi tek yönlü bağlı" mimarisinden,
şartnamenin istediği tek-kaynaklı mimariye geçirildi: **her kullanıcının
isimden bağımsız kalıcı bir kimliğe sahip TEK bir varsayılan ("Genel")
koleksiyonu var, genel "kaydedildi" durumu artık SADECE bu koleksiyona
üyelik, ve genel kaydı kaldırmak kullanıcının TÜM koleksiyonlarından atomik
olarak temizliyor.**

**AŞAMA 0 denetimi:** Önce mevcut mimari uçtan uca okundu —
`collections`/`collection_items` (Bölüm 9.19), `prompt_saves` (Bölüm 18),
`use-save-state.ts`/`save-button.tsx` (Bölüm 9.21), `SaveToCollectionModal`,
`CollectionDetailView`, `CollectionMoreMenu`, `ProfileView`'ın "Tümü/
Koleksiyonlar" alt-sekmesi, `handle_new_user()` trigger'ı (Bölüm 18). Gerçek
eksik netti: `collections`'ta varsayılan olduğunu işaretleyen hiçbir alan
yoktu, genel kayıt hâlâ ayrı `prompt_saves`'e yazıyordu (koleksiyon
üyeliğiyle "tek yönlü" — Bölüm 9.19'un kendi kararı), ve "bir koleksiyondan
kaldır" ile "genel kaydı kaldır" hiç ayrı işlemler değildi (`removeItemFromCollection`
her ikisi için de aynı şekilde tek koleksiyonu etkiliyordu, kaskad hiç yoktu).

**Yeni migration: `supabase/migrations/20260919270000_default_collections.sql`**
(tam senaryo listesi aşağıda "Nasıl doğrulandı"da):
- `collections.is_default boolean` (yeni sütun) — **isimden tamamen
  bağımsız, kalıcı kimlik** (şartnamenin açıkça yasakladığı `name ===
  "Genel"` karşılaştırması hiçbir yerde kullanılmadı).
- `collections_one_default_per_owner` — `(owner_id)` üzerinde, `where
  is_default` kısmi UNIQUE index'i: bir kullanıcının asla ikinci bir
  varsayılan koleksiyonu olamaz, veritabanı seviyesinde garanti (eşzamanlı
  iki "ensure" çağrısı bile ikinci bir satır oluşturamıyor).
- `collections_before_delete` (BEFORE DELETE trigger) — `is_default` olan
  bir satırı silme denemesini şartnamenin istediği TAM Türkçe mesajla
  reddediyor: *"Varsayılan koleksiyon silinemez. İstersen koleksiyonun
  adını veya gizlilik ayarını değiştirebilirsin."* Frontend'in kendi
  engeli (aşağıya bakınız) bunu tekrarlamayan bir savunma katmanı, tek
  gerçek garanti bu trigger.
- `collections_before_update` (BEFORE UPDATE trigger) — `is_default` veya
  `owner_id`'yi değiştirmeye çalışan HERHANGİ bir UPDATE'i reddediyor
  (savunma derinliği — uygulama zaten bu alanları hiç göndermiyor, ama bir
  gelecekteki hata/kötü niyetli bir istemci bile bunu değiştiremez).
- `ensure_default_collection(p_owner_id)` — idempotent "bul ya da oluştur"
  (`SECURITY DEFINER`, `ON CONFLICT (owner_id) WHERE is_default DO
  NOTHING` + geri-okuma) — hem `handle_new_user()`'ın yeni gövdesi hem
  backfill hem client-safe RPC tarafından paylaşılan TEK gerçek kaynak.
- `get_or_create_own_default_collection()` — `ensure_default_collection`'ın
  **yalnızca `auth.uid()`'ye sabitlenmiş** ince sarmalayıcısı, `authenticated`'e
  açık. **Gerçek bir güvenlik açığı test sırasında önlendi:**
  `ensure_default_collection`'ın kendisini doğrudan `authenticated`'e açmak,
  keyfi bir `p_owner_id` ile çağrılıp BAŞKA bir kullanıcı adına koleksiyon
  oluşturmaya izin verirdi (parametre istemciden geliyor, `auth.uid()`'ye
  bağlı değil) — bu yüzden yalnızca parametre almayan, dahili olarak
  `auth.uid()` kullanan sarmalayıcı client'a açıldı, iç fonksiyonun kendisi
  hiç `authenticated`'e grant edilmedi (yalnızca `SECURITY DEFINER`
  fonksiyonların birbirini çağırabilmesiyle erişilebilir).
- `handle_new_user()` (`create or replace` — Bölüm 18'in var olan trigger'ı,
  fonksiyonu DEĞİŞTİRİLDİ, `on_auth_user_created` trigger'ının kendisi
  DOKUNULMADI) — artık `profiles` satırının hemen ardından
  `ensure_default_collection(new.id)` da çağırıyor: yeni bir kullanıcı artık
  gerçek bir profil VE gerçek bir "Genel" koleksiyonla aynı anda doğuyor.
- **Mevcut kullanıcılar için idempotent backfill** (aynı migration'ın
  içinde, iki `INSERT ... SELECT ... WHERE NOT EXISTS ... ON CONFLICT DO
  NOTHING` adımı): (1) varsayılan koleksiyonu olmayan her `profiles`
  satırına bir tane oluşturur, (2) var olan `prompt_saves` ilişkilerini bu
  yeni varsayılan koleksiyonlara `collection_items` olarak taşır — hiçbir
  satır kaybolmadan, hiçbir yinelenen satır oluşmadan (yeniden çalıştırmak
  güvenli, gerçekten test edildi — aşağıya bakınız). `prompt_saves`
  tablosunun KENDİSİ silinmedi (geriye dönük veri kaybı riski almamak
  için) — yalnızca bu migration'dan sonra hiçbir yeni kod onu okumuyor/
  yazmıyor, tamamen atıl, tek kaynak artık `collections.is_default` +
  `collection_items`.
- `remove_prompt_from_saved_everywhere(p_prompt_id)` — **genel kaydı
  kaldırma, tek, atomik bir DELETE ile** (`security invoker`, yalnızca
  `auth.uid()`'nin KENDİ koleksiyonlarını hedefliyor — `DELETE ... USING
  collections c WHERE ci.collection_id = c.id AND c.owner_id =
  auth.uid()`): kullanıcının varsayılan koleksiyonu VE bu promptu içeren
  HER ÖZEL koleksiyonu tek bir sorguda temizliyor (şartnamenin §7/§18
  "atomik olmalı, yarım kalmış bir durum imkansız olmalı" kuralı) —
  istemcinin "önce oku, sonra tek tek sil" döngüsüne hiç gerek yok.

**Frontend — tek kaynak, `src/lib/supabase/collections.ts` merkezi:**
- `Collection.isDefault: boolean` eklendi (`src/types/index.ts`) —
  kodun HİÇBİR yerinde `name === "Genel"` karşılaştırması yok.
- `fetchOwnCollections` artık varsayılanı her zaman EN BAŞA sıralıyor
  (`sortWithDefaultFirst`) VE **kendi kendini iyileştiriyor**: dönen
  listede `isDefault` olan hiçbir satır yoksa (eski, backfill'den önceki
  bir hesap gibi bir kenar durum), `get_or_create_own_default_collection`
  RPC'sini çağırıp bir kez yeniden sorguluyor — normal bir sayfa
  yüklemesinde (varsayılan zaten varken) bu hiç tetiklenmiyor, ve unique
  index sayesinde asla ikinci bir tane oluşturamıyor (şartnamenin §3
  "sayfa yüklemesi asla yeni bir Genel oluşturmamalı" kuralı hem "normal
  durumda hiç çağrılmayarak" hem "çağrılsa bile index'in izin vermeyeceği"
  şekilde iki kat sağlanıyor).
- `isPromptSaved(promptId, userId)` (YENİ, `fetchIsSaved`'in yerini aldı) —
  `collection_items` içinde bu prompt'un, bu kullanıcının is_default=true
  koleksiyonunda olup olmadığına bakıyor. **`useSaveState`'in TEK okuma
  kaynağı bu artık** — `prompt_saves` hiç sorgulanmıyor.
- `addItemToCollection(collectionId, promptId)` — **artık `prompt_saves`'e
  dual-write YAPMIYOR** (eski `savePrompt()` çağrısı kaldırıldı, `userId`
  parametresi de artık gereksiz olduğundan imzadan çıktı). Bir koleksiyona
  eklemek SADECE o koleksiyona üyelik — varsayılan koleksiyona eklemek
  zaten genel kaydetmenin ta kendisi (çünkü okuma da aynı yere bakıyor),
  başka bir koleksiyona eklemek genel kaydı hiç etkilemiyor (şartnamenin
  §4/§23 Operation C'sinin gerektirdiği ayrım).
- `removeFromCollection(collectionId, promptId)` (`removeItemFromCollection`'ın
  yeniden adlandırılmış hâli, şartnamenin §19 isimlendirme talebine göre)
  — SADECE o tek koleksiyondan kaldırıyor, genel kayda hiç dokunmuyor.
  **Varsayılan koleksiyon için asla çağrılmamalı** — onun için ayrı,
  aşağıdaki fonksiyon var.
- `removeFromSavedEverywhere(promptId)` (YENİ) — `remove_prompt_from_saved_everywhere`
  RPC'sini çağıran ince sarmalayıcı; genel "kaydedilenlerden kaldır" eylemi.

**`useSaveState`** (`src/features/prompts/use-save-state.ts`, tamamen
yeniden yazıldı) — `unsave()`/`fetchIsSaved` yerine `removeEverywhere()`/
`isPromptSaved` + yeni `markUnsaved()` (modalın kendi içinde varsayılan
satırı tekrar işaretinden kaldırmasını yansıtmak için, `markSaved`'in
aynadaki karşılığı). **`SaveButton`** (`save-button.tsx`) davranışı
kullanıcının şartnamesiyle birebir örtüşüyor: boş (outline) ikon → modal
açar; dolu ikon → **modalı hiç açmadan doğrudan** `removeEverywhere()`'i
çağırır, başarılı olursa "Kaydedilenlerden kaldırıldı." toast'ı gösterir
(Bölüm 9.21'in zaten kurduğu `Portal` tabanlı toast, mesaj metni
şartnamenin istediğiyle birebir aynı).

**`SaveToCollectionModal`** — `handleToggle` artık üç farklı durumu ayırt
ediyor: (1) varsayılan koleksiyonu EKLEME → `addItemToCollection` + genel
kaydı dolduran `onAdded()`; (2) varsayılan koleksiyonu (modal açıkken aynı
oturumda) tekrar KALDIRMA → tam kaskad (`removeFromSavedEverywhere` +
TÜM üyelik/sayıların yerel state'te sıfırlanması) + `onRemovedFromDefault()`;
(3) herhangi bir ÖZEL koleksiyonu ekleme/kaldırma → yalnızca o satırın
`removeFromCollection`/`addItemToCollection`'ı, genel kayda hiç dokunmadan.
Varsayılan satır artık listede her zaman görünür bir **"Varsayılan"**
rozetiyle (`Badge variant="accent"`) işaretleniyor — şartnamenin "ayırt
edilebilir olmalı" kuralı.

**Kritik hata düzeltmesi — "kaldırılan gönderi ekranda kalıyor" (şartnamenin
"EN KRİTİK" diye işaretlediği hata, §13):** `CollectionDetailView`
(hem Profil > Kaydedilenler > bir koleksiyona tıklanınca hem `/saved`
bottom-nav kısayolunun artık yönlendirdiği TEK gerçek ekran) daha önce
promptları göstermek için paylaşılan, "kaldır" kavramı hiç olmayan düz
`PromptGrid`'i kullanıyordu — koleksiyondan bir öğeyi kaldıracak HİÇBİR
arayüz yoktu. Şimdi:
- **`PostMenu`'ye yeni, isteğe bağlı bir `collectionRemoval` prop'u
  eklendi** (`{ isDefault, onRemove }` — `PromptCard` →
  `ImagePromptCard`/`TextPromptCard` → `PostHeader` → `PostMenu` zincirinde
  taşınıyor, `onDeleted`'in zaten kullandığı AYNI, var olan threading
  deseni). Yalnızca `CollectionDetailView`'da, ve yalnızca görüntüleyici
  o koleksiyonun GERÇEK sahibiyse geçiriliyor — **gönderinin yazarı değil,
  koleksiyonun sahibi** kontrolü (başkasının gönderisini kendi
  koleksiyonuna kaydedip sonra kaldırabilmen gerekiyor, `PostMenu`'nün var
  olan `isOwn` — yazar — kontrolünden BİLİNÇLİ OLARAK ayrı tutuldu).
  Menü öğesi varsayılan koleksiyonda **"Kaydedilenlerden kaldır"**, özel
  bir koleksiyonda **"Koleksiyondan kaldır"** gösteriyor (aynı iki-
  tıklamalı onay deseni, `Sil`'inkiyle birebir aynı).
- **`CollectionDetailView.handleRemoveItem`** — gerçek backend çağrısını
  ÖNCE yapıyor (`collection.isDefault` ise `removeFromSavedEverywhere`,
  değilse `removeFromCollection`), yalnızca GERÇEK başarıda yerel `items`
  state'inden `filter` ile çıkarıyor ve `itemCount`'u güncelliyor —
  asla optimistik/önce-göster-sonra-doğrula değil, şartnamenin §14'ün
  "optimistik olmuyorsa gerçek başarıdan sonra hemen güncelle" ikinci
  seçeneği. Başarısızlıkta liste hiç değişmiyor, sahte bir "kaldırıldı"
  mesajı asla gösterilmiyor. Doğru mesaj (`"Kaydedilenlerden kaldırıldı."`
  / `"Koleksiyondan kaldırıldı."`) `collection.isDefault`'a göre seçilip
  aynı `Portal` tabanlı toast'la gösteriliyor.
- Sayfa yenilemeye hiç gerek yok (gerçek Playwright testinde `page.reload()`
  sonrası öğenin hâlâ gitmiş olduğu ayrıca doğrulandı — aşağıya bakınız) —
  gerçek bir DELETE zaten olmuş, yerel state yalnızca onu yansıtıyor.

**`CollectionMoreMenu`** — varsayılan koleksiyonda "Koleksiyonu sil"e
tıklamak artık backend'e hiç istek atmadan, doğrudan şartnamenin tam
istediği Türkçe mesajı satır içinde gösteriyor (`collection.isDefault`
kontrolü) — gereksiz bir round-trip yok, ama backend'in kendi trigger'ı da
(yukarıya bakınız) aynı korumayı zaten sağlıyor, ikisi asla birbirine
güvenmiyor.

**`ProfileView`'ın "Tümü" sekmesi YAPISAL olarak kaldırıldı** (şartnamenin
§1'in özellikle vurguladığı ayrım — "yalnızca CSS ile gizleme değil"):
`savedSubTab` state'i, `role="tablist"` bloğu, `fetchSavedPrompts`/
`savedPrompts` state'i ve fetch'i, `activeSource`'un `"saved"` dalı, ve
`TabEmptyState`'in artık hiç ulaşılamayan `"saved"` dalı TAMAMEN silindi.
`activeTab === "saved"` artık doğrudan `<CollectionsPanel .../>` render
ediyor — "Genel" her zaman ilk sırada, ardından kullanıcının kendi
koleksiyonları, ardından "+ Koleksiyon oluştur" (şartnamenin §1'in
istediği tam yapı). `fetchSavedPrompts` (`prompt_saves`-backed, eski)
`src/lib/supabase/prompts.ts`'ten tamamen silindi — artık hiçbir çağıran
kalmadığından.

**`/saved` (alt navigasyon kısayolu) artık kendi ayrı listesini TUTMUYOR** —
kullanıcının varsayılan koleksiyon id'sini (`fetchDefaultCollectionId`,
kendi kendini iyileştiren aynı desenle) bulup doğrudan
`/collections/local?id=<genel>`'e yönlendiriyor. Bu, hem "tek kaynak"
ilkesini (aynı VERİ, aynı BİLEŞEN, iki ayrı "kaldırma" kod yolu değil) hem
şartnamenin §13 "en kritik hata"sının bu girişte de tekrarlanmamasını aynı
anda sağlıyor — `CollectionDetailView`'daki tek düzeltme her iki giriş
noktasını da (Profil > Kaydedilenler > Genel VE alt navigasyon
kısayolu) kapsıyor.

**`src/lib/supabase/saves.ts` tamamen silindi** — `fetchIsSaved`/
`savePrompt`/`unsavePrompt` hiçbir yerden çağrılmıyordu (hepsi
`isPromptSaved`/`addItemToCollection`/`removeFromSavedEverywhere`'e
taşındı); `prompt_saves` tablosunun kendisi (ve Bölüm 19'un RLS'i)
migration/veri kaybı riski almamak için DOKUNULMADAN duruyor, yalnızca
artık hiçbir kod yolundan erişilmiyor.

**Nasıl doğrulandı — SQL/veritabanı katmanı (gerçekten çalıştırıldı, taklit
değil):** Yeni migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile
sıfırdan açılan, önceki TÜM migration'ların (storage hariç) gerçekten
uygulandığı temiz bir veritabanına uygulandı. **Test sırasında gerçek bir
metodoloji hatası yakalanıp düzeltildi:** ilk yazılan test script'i
`SET LOCAL role`/`SET LOCAL request.jwt.claim.sub`'ı açık bir transaction
DIŞINDA kullanıyordu — Postgres'te bu, dokümante edilmiş bir no-op (yalnızca
o tek örtük ifadenin kendi işlemine kadar sürüyor, bir SONRAKİ ifade zaten
eski değere dönmüş oluyor) — bu yüzden ilk çalıştırma, farkında olmadan
TÜM "kullanıcı olarak" adımları superuser/postgres rolüyle (RLS'i tamamen
atlayarak) çalıştırmış, ve bir çapraz-kullanıcı görünürlük kontrolünü
yanlışlıkla superuser'dan sorgulayarak "silinmiş gibi" gösteren yanlış bir
negatif üretmişti. İkisi de düzeltilip (rol/claim değişimleri artık `SET
ROLE`/`SET <guc>` — LOCAL'siz, oturum boyunca kalıcı — kullanıyor;
çapraz-kullanıcı veri kontrolleri özellikle `RESET ROLE` ile superuser'a
dönerek yapılıyor, "görebiliyor muyum" ile "veritabanında var mı"
birbirine karıştırılmadan) TÜM senaryolar GERÇEKTEN doğru sonuçla yeniden
çalıştırıldı — bu, "gerçek RLS testi" iddiasının kendi kendini
doğrulaması: metodoloji hatası RLS'i yanlışlıkla atladığında test hâlâ
"geçiyor" gibi görünebiliyordu, düzeltildikten sonra GERÇEKTEN RLS'e karşı
çalıştığı kanıtlandı. 14 test grubu, dördü gerçek kullanıcı (Ali, Ayşe,
Baran, Zeynep) ile: yeni kullanıcı signup'ında tam olarak bir "Genel"
koleksiyon oluşması; unique index'in ikinci bir varsayılanı reddetmesi;
`ensure_default_collection`'ın idempotent olması (aynı id'yi döndürmesi,
ikinci bir satır oluşturmaması); Ali'nin kendi varsayılanını yeniden
adlandırabilmesi (`Favorilerim`) VE `is_default`'un hiç değişmemesi; Baran'ın
(başka bir kullanıcı) Ali'nin koleksiyonunu YENİDEN ADLANDIRAMAMASI (RLS,
0 satır); `is_default`'u doğrudan bir UPDATE ile değiştirme denemesinin
trigger tarafından reddedilmesi; **varsayılanı silme denemesinin
şartnamenin TAM istediği Türkçe mesajla reddedilmesi**; Ali'nin Genel +
Portreler + Kodlar'a P1'i eklemesi; **kritik test — Ali'nin genel kaydı
kaldırma çağrısının P1'i ÜÇÜNÜN DE'sinden temizlemesi, Ayşe'nin kendi
ayrı kaydının HİÇ etkilenmemesi, ve promptun kendisinin hayatta kalması**
(şartnamenin §23 Operation A'sının birebir kendisi); tek-koleksiyon
kaldırmanın SADECE o koleksiyonu etkileyip Genel + diğerini koruması;
Ayşe'nin cascade RPC'sinin Ali'nin verilerine hiç dokunamaması;
`anon`'un RPC'yi hiç çağıramaması (execute grant yok); backfill
ifadelerinin yeniden çalıştırılabilir olması (hiçbir kullanıcı birden
fazla varsayılana sahip olmuyor); ve backfill'den önceki bir kullanıcıyı
simüle edip (yalnızca test kurulumu için trigger geçici olarak devre dışı
bırakılıp) güvenli RPC'nin onu bir kez, idempotent şekilde iyileştirmesi
— hepsi gerçekten çalıştırılıp doğrulandı. Test veritabanı işlem bitince
silindi.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST/RPC yanıtlarıyla, gerçek, mutasyona uğrayan bir sunucu-taraf
durum nesnesiyle — bu projenin standart yöntemi, Playwright, statik export
`npx serve` ile GitHub Pages basePath'ini taklit eden bir symlink
düzeniyle yerel sunularak):** 33 senaryo, hepsi sıfır JS hatasıyla geçti.
Birinci paket (19 senaryo, koleksiyon detay sayfası): Genel koleksiyonun
"Varsayılan" rozetini gösterdiği; menünün doğru "Kaydedilenlerden kaldır"
etiketini gösterdiği; kaldırma sonrası öğenin ANINDA (sayfa yenilenmeden)
listeden kaybolduğu VE sunucu tarafı state'in gerçekten güncellenmiş
olduğu; **kaskadın gerçekten P1'i hem Genel'den hem Portreler'den
sildiği**; `page.reload()` sonrasında öğenin hâlâ gitmiş olduğu (gerçek
kalıcı silme, yalnızca yerel state değil); Portreler'de (varsayılan
olmayan) menünün "Koleksiyondan kaldır" gösterdiği ve kaldırmanın SADECE
o koleksiyonu etkileyip Genel'i koruduğu; varsayılanı silme denemesinin
TAM istenen mesajı gösterdiği; yeniden adlandırma sonrası "Varsayılan"
rozetinin hâlâ göründüğü (kimlik isimden bağımsız hayatta kaldı). İkinci
paket (14 senaryo, kaydet butonu + profil): boş bookmark'ın modalı açtığı
ve Genel satırının rozetini gösterdiği; Genel'e eklemenin bookmark'ı
doldurduğu; **dolu bookmark'a tıklamanın modalı ASLA açmadığı**, doğrudan
kaskad kaldırmayı tetiklediği, doğru toast'ı gösterdiği ve bookmark'ın
tekrar boşaldığı; Profil > Kaydedilenler'de "Tümü" metninin hiçbir yerde
kalmadığı, Genel'in doğrudan (ekstra bir sekmeye tıklamadan) göründüğü.
Ayrıca 14 rota × giriş-durumu kombinasyonunun (`/`, `/saved`,
`/collections/local` [id'li ve id'siz], `/profile/real`, `/prompts/local`,
`/discover`, hem çıkışlı hem girişli) Supabase'e HİÇ erişilemezken (gerçek
ağ isteklerinin bu sandbox'ın kendi politikasıyla birebir aynı şekilde
başarısız olmasına izin verilerek, hiç taklit edilmeden) sıfır JS
hatasıyla zarifçe davrandığı ayrı bir dayanıklılık taramasıyla doğrulandı
— `/saved`'in kendi kendini iyileştirme denemesi bile ağ tamamen kesikken
çökmüyor. `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (21
rota, değişmedi) sıfır hatayla geçti.

**Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının
`20260919270000_default_collections.sql`'i Dashboard → SQL Editor'de
uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- `prompt_saves` tablosu silinmedi (yukarıda gerekçesiyle açıklandı) —
  geriye dönük veri kaybı riski almamak için atıl bırakıldı, ileride ayrı
  bir temizlik görevinde (kullanıcı onayıyla) tamamen kaldırılabilir.
- Koleksiyona eklerken/kaldırırken toplu (birden fazla gönderiyi aynı anda)
  işlem arayüzü eklenmedi — şartname de zaten tek tek işlem istiyordu.
- Varsayılan koleksiyonun kapak görseli/sırası için özel bir davranış
  eklenmedi — `fetchCovers`'ın var olan "en son eklenen öğe" mantığı
  değişmeden, tutarlı şekilde uygulanıyor.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- Aynı promptun aynı ekranda birden fazla kartla gösterildiği (bu
  uygulamanın routing'inde neredeyse hiç olmayan) bir durumda, iki kart
  örneği arasında anlık senkronizasyon yok — her biri kendi mount'unda
  taze veri çekiyor (Bölüm 21'den beri bilinen "N+1, anlık senkron değil"
  kategorisinden, bu görev bunu değiştirmedi).
- Koleksiyon rozeti/sayaçları Realtime ile canlı güncellenmiyor (Bölüm 21
  Faz 6'dan beri bilinen, mesajlaşma dışında hâlâ genişletilmemiş
  sınırlama) — sayfa yeniden ziyaret edildiğinde doğru.

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

### 9.24 Binlerce aday etiket önerisi — yalnızca öneri, kabul edilince gerçek

Kullanıcının Bölüm 9.23'ün canlı etiket sistemini denedikten sonra sorduğu
"sisteme binlerce etiket önerisi ekleyelim, ama yalnızca öneride gözüksün,
biri gerçekten eklenirse canlı bir etiket olsun" isteği üzerine — Bölüm
9.23'ün kendi §13/§19 ilkesini ("yeni bir etiket adı asla serbest metinden
icat edilmedi, yalnızca AI olmadığı için") hiç bozmadan genişleten bir
katman eklendi: kullanıcının bizzat hazırlayıp verdiği, 27 kategori ve 3.410
ham terimden oluşan gerçek bir taksonomi, **tamamen istemci tarafında**
yaşayan, gerçek `tags` tablosuna asla önceden yazılmayan bir "aday etiket
sözlüğü" hâline getirildi. Bu sözlükten bir eşleşme HER ZAMAN yalnızca
`suggested` katmanında gösteriliyor (asla `automatic`), ve bir aday yalnızca
kullanıcı onu gerçekten kabul ettiği anda (mevcut `get_or_create_tag` RPC'si
üzerinden) gerçek, kalıcı bir veritabanı satırına dönüşüyor — Bölüm 9.23'ün
"sistem asla kendi başına gerçekten yeni bir etiket icat etmez" ilkesi
burada da korundu, yalnızca ADAY OLARAK gösterilebilecek terim havuzu
devasa büyütüldü.

**Yeni dosya — `src/lib/tag-candidates.ts`:** Kullanıcının verdiği ham
taksonomi (bir build-script'iyle, `scratchpad/build-candidates.mjs` — bu
depoya dahil değil, tek seferlik bir üretim aracı), Bölüm 9.23'ün
`normalizeTagLabel()`'iyle BİREBİR AYNI algoritmayla (büyük/küçük harf +
Türkçe transliterasyon duyarsız) tekilleştirilip, ilk-görülen yazımı
görüntü etiketi olarak koruyarak, VE zaten gerçek olan (20 seed + Bölüm
9.23'ün `SYNONYM_RULES`'ının önceden öngördüğü) katalog slug'larını hariç
tutarak **3.277 benzersiz aday etiket etiketine** indirgendi (3.410 ham
terimden — kategoriler içi/arası ağır yinelenme, ör. "3D Render",
"Storytelling", "Supabase" birden fazla kategoride tekrar ediyordu).
`CANDIDATE_TAG_LABELS: string[]` olarak export ediliyor — düz bir statik
dizi, hiçbir network isteği/migration gerektirmiyor.

**Yeni eşleştirme fonksiyonu — `matchCandidateSuggestions()`
(`tag-catalog-matcher.ts`):** `analyzeContent()`'ten (Bölüm 9.23'ün gerçek-
katalog eşleştiricisi) BİLİNÇLİ OLARAK ayrı tutulan ikinci bir fonksiyon —
aynı dosyada yaşıyor (paralel bir modül değil, aynı `normalizeTextForMatching`/
`hasWholeWordMatch` yardımcılarını paylaşıyor) ama farklı bir sözleşmesi var:
yalnızca tam kelime/öbek eşleşmesi (agglutinative-suffix önek eşleşmesi YOK —
~3.000 aday girişle bu çok fazla gürültü üretirdi), gerçek katalogda ZATEN
var olan bir slug'ı asla önermiyor (`realCatalogSlugs` parametresi — katalog
büyüdükçe dinamik olarak güncel kalıyor, üretim script'inin sabit hariç
tutma listesinden farklı olarak çalışma zamanında gerçek), zaten kabul
edilmiş/reddedilmiş bir slug'ı da atlıyor (`excludeSlugs`), ve en uzun/en
özgül öbek eşleşmelerini öne alıp en fazla 6 sonuçla sınırlıyor (rastgele
kısa kelime eşleşmelerinin gürültüsünü azaltmak için). Her sonuç
`isCandidate: true` ile işaretleniyor — bu tek alan, aşağıdaki tüm "henüz
gerçek değil" davranışının anahtarı.

**`useTagPicker` genişletildi, yeniden yazılmadı:** `suggested: Tag[]` artık
`suggested: SuggestedTagEntry[]` (`Tag & { isCandidate?: boolean }`) —
gerçek-katalog önerileriyle aday önerileri AYNI listede, aynı dismiss/kabul
mekanizmasıyla yaşıyor (Bölüm 9.23'ün "aynı slug bir daha asla sessizce geri
gelmesin" `dismissedSlugs` kuralı adaylar için de otomatik olarak geçerli —
ayrı bir mekanizma icat edilmedi). Debounce'lu analiz adımı artık
`matchCandidateSuggestions`'ı da çağırıp sonucu aynı havuza ekliyor.
`acceptSuggested` artık `Promise<void>` döndürüyor: gerçek bir katalog
önerisini kabul etmek hâlâ anlık/senkron (ağ isteği yok); bir ADAYI kabul
etmek önce `getOrCreateTag(tag.label)`'i çağırıp (varsa) gerçek satırı
oluşturuyor/buluyor, ve yalnızca bu GERÇEKTEN başarılı olursa dönen gerçek
`Tag`'i (kendi gerçek slug'ıyla) `accepted`'e `source: "manual"` olarak
ekliyor — asla iyimser/önceden eklenmiyor. Yeni `acceptingSlug`/`acceptError`
alanları, tam olarak manuel "+ … etiketini oluştur" akışının
`isCreating`/`createError` desenini bir kez daha (kopyalamadan, aynı hook
içinde) uyguluyor.

**`TagPicker` UI:** Aday öneri butonunun `title` özniteliği ("Henüz gerçek
bir etiket değil — seçersen gerçek, kalıcı bir etiket olarak oluşturulur.")
dürüstçe açıklıyor; kabul sırasında buton devre dışı kalıp "Oluşturuluyor…"
gösteriyor; başarısızlıkta manuel akışla aynı stil bir hata satırı
görünüyor. Bir aday gerçekten kabul edilince (yalnızca o durumda, gerçek bir
katalog önerisi için gereksiz bir ağ isteğine girmeden) paylaşılan
`useTagCatalog()` önbelleği `refresh()` ile tazeleniyor — Bölüm 9.23'ün
manuel oluşturma akışıyla birebir aynı, var olan mekanizma.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (21 rota, değişmedi) sıfır hatayla geçti. Saf mantık birim testi
(`node --experimental-strip-types`, gerçek kaynak dosyalarına karşı) 12
senaryoyu doğruladı: sözlüğün gerçekten binlerce (3.277) ve yinelenmesiz
olduğu; zaten gerçek olan bir seed etiketin (`Portre`, `3D Render`) sözlükte
HİÇ bulunmadığı; bir aday öbeğin (`Apple Maps`, `Product Photography`) doğru
eşleştiği ve `isCandidate:true` taşıdığı; gerçek katalogdaki bir slug'ın
(`kodlama`) asla aday olarak önerilmediği; `excludeSlugs`'ın uygulandığı;
boş metnin sıfır sonuç ürettiği; ilgisiz bir metnin sonuç sayısının sınırlı
kaldığı; ve `analyzeContent`'in (gerçek-katalog-yalnızca fonksiyonun) bir
aday eşleşmesini KENDİ sonucuna hiç sızdırmadığı. Ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta (statik export
`npx serve` ile) uçtan uca doğrulandı: gerçek-katalog otomatik etiketiyle
(AI Sanat/Portre) aday önerisinin (Apple Maps) AYNI ANDA, doğru katmanlarda
göründüğü; adayın kabul edilmesinin gerçek bir `get_or_create_tag` RPC
çağrısı (doğru `p_label` gövdesiyle) tetiklediği; kabul sonrası "Apple
Maps"in gerçek, MANUEL (Otomatik değil) bir kabul edilmiş chip olarak
göründüğü ve öneri satırından kaybolduğu — sıfır JS hatasıyla. Ayrıca Bölüm
9.23'ün kendi 30 senaryolu regresyon paketi (canlı analiz, otomatik/manuel
ayrımı, dismiss kalıcılığı, `/tags` keşif sayfası, arama entegrasyonu, tam
Supabase-erişilemez dayanıklılık taraması) ve gerçek 20-seed-katalog
doğrulama paketi (5 senaryo) sıfır regresyonla yeniden çalıştırıldı.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Aday sözlüğü herhangi bir migration/DB değişikliği gerektirmedi** —
  tamamen mevcut `get_or_create_tag` RPC'sini (Bölüm 9.23) yeniden
  kullanıyor; yeni bir tablo/sütun/RPC eklenmedi.
- **Agglutinative-suffix (önek) eşleştirmesi adaylar için bilinçli olarak
  eklenmedi** (yukarıda gerekçesiyle açıklandı) — yalnızca tam kelime/öbek
  eşleşmesi, ~3.000 girişlik bir sözlükte gürültüyü kontrol altında tutmak
  için.
- **Sözlük statik/derleme-zamanlı** — kullanıcı yeni bir taksonomi verirse
  `scratchpad/build-candidates.mjs` benzeri bir script yeniden çalıştırılıp
  `tag-candidates.ts` yeniden üretilmeli; canlı, kullanıcı tarafından
  düzenlenebilir bir "aday öner" yönetim ekranı bu görevde istenmedi,
  eklenmedi.

**Bilinen sınırlamalar:**
- **Gerçek bir Supabase projesine karşı canlı doğrulama yapılamadı** (bu
  sandbox'ın `*.supabase.co` erişimini engelleyen ağ politikası, Bölüm
  17'den beri tekrarlanan aynı sınırlama) — bu görev hiçbir yeni migration
  içermediğinden (yalnızca frontend), kullanıcının Dashboard'da yapması
  gereken ekstra bir adım yok; yalnızca canlı sitede bizzat denemesi
  gerekiyor.
- **3.277 girişlik listede tam bir kalite/duplikasyon denetimi elle
  yapılmadı** — yalnızca programatik normalize-tabanlı tekilleştirme
  uygulandı (ör. "AI Video" ve "AI video üretimi" gibi anlamca örtüşen ama
  farklı normalize eden iki ayrı giriş, ikisi de sözlükte ayrı ayrı
  kalabilir) — kullanıcının kendi verdiği ham taksonominin doğal bir
  sonucu, bu görevin kapsamında elle kürasyon yapılmadı.
- **Aday eşleştirme yalnızca prompt/istek OLUŞTURMA formlarında çalışıyor**
  (`TagPicker`'ın kullanıldığı her yer — Bölüm 9.23 zaten hem
  `CreatePromptForm` hem `CreateRequestForm`'u aynı bileşene bağlamıştı,
  bu görev o paylaşımı bozmadı) — ayrı bir yüzey eklenmedi.

---

### 9.25 Prompt Değişken Sistemi, Kopyalama, Düzenleme Geçmişi ve Bildirim Altyapısı

Kullanıcının çok kapsamlı "PROMPTLY — GELİŞMİŞ PROMPT DEĞİŞKEN SİSTEMİ,
KOPYALAMA, DÜZENLEME GEÇMİŞİ VE BİLDİRİM ALTYAPISI" şartnamesi üzerine —
prompt metninde `{değişken}` token'ları tanımlayabilme + görüntüleyenin
kendi değerleriyle "kişiselleştirebilmesi", dört gönderi türünün (prompt/
remix/istek yanıtı/prompt isteği) hepsinde gerçek prompt metninin hemen
üstünde bir "Kopyala" butonu, ve gerçek bir "kendi içeriğini düzenleme"
akışı + buna bağlı (bugün için çoğunlukla durgun) bir düzenleme bildirimi
altyapısı.

**AŞAMA 1 denetim bulguları (kod yazılmadan önce yapıldı):**
- Şartnamenin "dört gönderi türü" varsayımı bu uygulamanın gerçek şemasında
  yalnızca İKİ tabloya karşılık geliyor: Prompt/Remix/İstek Yanıtı üçü de
  aynı `public.prompts` satırı (`origin_type` ile ayrışıyor, Bölüm 18),
  Prompt İsteği ise ayrı `public.prompt_requests`. Dört ayrı paralel sistem
  KURULMADI — değişken sistemi yalnızca `prompts.prompt_text`'e bağlı
  (istekte ayrı bir "prompt metni" alanı hiç yok, yalnızca `description`);
  bu bilinçli bir kapsam kararı.
- **KRİTİK BULGU:** bu uygulamada hiçbir "prompt/istek düzenleme" özelliği
  YOKTU (`src/types/index.ts`'in `PromptVersion` yorumunun kendi ifadesiyle
  "this app has no 'edit prompt' feature at all") — `grep` ile doğrulandı.
  RLS (Bölüm 19) `prompts`/`prompt_requests` UPDATE'ini kesin olarak
  yalnızca `auth.uid() = author_id`'ye bağlıyor
  (`"Authors can update their own prompts/requests"` politikaları) — yani
  "başka bir YETKİLİ kullanıcı düzenledi" senaryosu bu mimaride YAPISAL
  OLARAK MÜMKÜN DEĞİL (ortak düzenleme/moderatör sistemi hiç yok, Bölüm 22
  henüz başlamadı). Şartname açıkça "ortak düzenleme sistemi yoksa sırf
  bildirim özelliği için herkese açık düzenleme yetkisi oluşturma" diye
  uyarıyordu — bu yüzden burada YENİ bir "herkes düzenleyebilir" yetkisi
  İCAT EDİLMEDİ. Bunun yerine: (1) gerçek bir "kendi içeriğini düzenleme"
  akışı bu görevle birlikte İLK KEZ kuruldu, (2) düzenleme kaydı/bildirim
  üretimi genel ve doğru şekilde `editor_id <> owner_id` koşuluna
  bağlandı — bugünkü tek-sahip modelinde bu koşul kendi kendine
  düzenlemede hiç sağlanamıyor (doğru davranış: kendine bildirim
  gitmemeli), ama altyapı gerçek ve test edilmiş; ileride bir ortak-
  düzenleme özelliği eklenirse hiçbir değişiklik gerekmeden doğru çalışır.
- Var olan kopyalama deseni (`ShareButton`, `absoluteUrl`) incelendi ama bu
  URL kopyalıyor, prompt METNİ kopyalamıyor — bu yüzden gerçekten yeni bir
  `copyTextToClipboard()` yardımcı fonksiyonu (`lib/utils.ts`) eklendi
  (Clipboard API + `execCommand` geri düşüşüyle), var olanı GENİŞLETEREK,
  paralel bir sistem kurmadan.
- Bildirim altyapısı (Bölüm 9.6/9.12'nin `SECURITY DEFINER` trigger +
  `hl=<tür>:<id>` hedefleme deseni) zaten olgun ve genişletilebilirdi — yeni
  `prompt_edited`/`request_edited` bildirim tipleri BUNU birebir aynı
  şekilde kullanıyor, paralel bir sistem kurulmadı.

**Yeni migration:** `supabase/migrations/20260919290000_prompt_variables_
and_edit_tracking.sql`:
- **`prompt_variables`** (id, prompt_id → `prompts.id` cascade, `name`
  CHECK'i 1-40 karakter + süslü parantez/boşluk YASAK — `{isim}` söz
  dizimini asla bozmasın diye; Türkçe harfler serbest, `default_value`,
  `description`, `sort_order`, `created_at`/`updated_at` — var olan
  `set_updated_at()` trigger'ı yeniden kullanıldı, yeni bir fonksiyon
  yazılmadı), `unique (prompt_id, name)` — aynı promptta aynı isimde iki
  değişken veritabanı seviyesinde imkânsız. RLS `prompt_media`/
  `prompt_tags` ile BİREBİR AYNI desen: herkese açık okuma (promptun kendi
  görünürlüğüne bağlı), yazma yalnızca `prompts.author_id = auth.uid()`.
  `prompt_requests` için AYRI bir değişken tablosu YOK (yukarıdaki kapsam
  kararı — istekte "prompt metni" hiç yok).
- **`content_edits`** — salt-okunur bir denetim tablosu (Bölüm 9.14'ün
  `audit_log`'uyla aynı ilke): istemciden HİÇBİR yazma politikası yok,
  yalnızca aşağıdaki trigger'lar dolduruyor; okuma yalnızca `owner_id`/
  `editor_id = auth.uid()` olanlara açık — tam önceki metni (`previous_
  values`) herkese açık etmemek için.
- **`notifications.type` CHECK'i** iki yeni değer aldı: `prompt_edited`,
  `request_edited`.
- **`record_prompt_edit()`** (AFTER UPDATE, `prompts`, `SECURITY DEFINER`)
  — OLD/NEW'i `title`/`description`/`prompt_text`/`tool` için karşılaştırıp
  yalnızca GERÇEKTEN değişen alanlar varsa `content_edits` satırı yazıyor
  VE `editor_id <> author_id` ise `prompt_edited` bildirimi üretiyor
  (`truncate_preview()` ile başlığı gömerek, `hl=post:<id>` hedefleyerek —
  Bölüm 9.12'nin aynı deseni). Beğeni/yorum/remix sayaçlarının veya
  `status`/`show_on_profile`'ın güncellenmesi (aynı satırda ayrı UPDATE'ler
  olarak oluşuyorlar) BU TRIGGER'I hiç tetiklemiyor bile OLSA (aynı satırda
  bu kolonlar da UPDATE'e dahil olduğunda), `array_length(v_changed, 1) is
  null` kontrolü sayesinde hiçbir kayıt/bildirim ÜRETMİYOR — "yalnızca
  kaydet butonuna basılmış olması yetmemeli" kuralı istemciye değil,
  veritabanına bağlı, istemci tarafı bir bayrağa güvenilmiyor.
- **`record_request_edit()`** aynı desenin `prompt_requests` karşılığı
  (title/description/creative_direction/preferred_tool) — `status`/
  `response_count`/`selected_response_prompt_id`/`closed_by_owner`
  değişiklikleri BİLİNÇLİ OLARAK dışarıda (zaten kendi bildirimleri var,
  Bölüm 9.2/9.6, "içerik düzenlemesi" değil, durum değişikliği).

**Yeni/güncellenen dosyalar — veri katmanı:**
- `src/lib/prompt-variables.ts` (YENİ, saf/DOM'suz fonksiyonlar —
  `tag-catalog-matcher.ts`/`prompt-diff.ts` ile aynı test edilebilirlik
  ilkesi): `normalizeVariableName`, `isValidVariableName`,
  `extractVariableTokenNames`, `countVariableUsages`,
  `renameVariableTokenInText` (yalnızca TAM token eşleşmesi — "ortam"ı
  yeniden adlandırmak "ortam2"ye asla dokunmuyor),
  `removeVariableTokenFromText`, `insertTextAtRange` (imleç/seçim
  pozisyonunda gerçek ekleme, seçiliyse seçimi değiştiriyor),
  `resolvePromptText` (tanımsız bir token'ı ASLA "undefined"a çevirmiyor,
  literal metin olarak bırakıyor).
- `src/lib/supabase/prompt-variables.ts` (YENİ) —
  `fetchVariablesForPrompt`, `replaceVariablesForPrompt` (sil-hepsini-
  sonra-yeniden-ekle, `prompt_tags`'in var olan desenle birebir aynı —
  RLS'in bir promptu yalnızca TEK sahibinin düzenleyebilmesi bunu güvenli
  kılıyor, eşzamanlı çoklu-editör yarış durumu bugün mümkün değil).
- `src/lib/supabase/content-edits.ts` (YENİ) — `fetchEditHistory`.
- `src/lib/supabase/prompts.ts` — `UpdateRealPromptInput`/
  `updateRealPrompt(promptId, authorId, input)`: sahiplik `.update().
  select().maybeSingle()` ile doğrulanıyor (RLS'in "0 satır sessizce
  etkilendi" riskine, Bölüm 9.0'ın kendi dokümante ettiği sınıfa,
  güvenilmiyor) — `content_type`/`origin` asla değişmiyor, görsel yalnızca
  gerçekten yeni bir dosya verilirse değişiyor.
- `src/lib/supabase/requests.ts` — aynı desenin `UpdateRealRequestInput`/
  `updateRealRequest` karşılığı — `content_type`/`status`/`selected_
  response_prompt_id`/`reference_image_*`'e KESİNLİKLE dokunmuyor (bunların
  zaten kendi çalışan akışları var, Bölüm 9.2).
- `real-prompts-provider.tsx`/`real-requests-provider.tsx` —
  `updatePrompt`/`updateRequest` context aksiyonları eklendi.

**Değişken sistemi UI'ı (`src/features/prompts/`):**
- `prompt-text-editor.tsx` (YENİ, `PromptTextEditor` + `DraftVariable`
  tipi) — prompt metni `<textarea>`'sını sarmalıyor: gerçek imleç/seçim
  konumunu (`selectionStart`/`selectionEnd`) izleyip "Değişken Ekle"
  butonuna basıldığında YENİ token'ı TAM O KONUMA ekliyor (metnin sonuna
  değil), "Değişkenler" panelini (`variable-list.tsx`) ve bir Şablon/
  Önizleme sekme çiftini (§3 — önizleme asla gerçek şablonu mutasyona
  uğratmıyor, yalnızca `resolvePromptText` ile ayrı bir görüntü
  hesaplıyor) render ediyor. Metinde tanımsız bir `{token}` varsa (§ orphan
  reference) dürüst bir uyarı satırı gösteriyor.
- `variable-editor-modal.tsx` (YENİ, `VariableEditorModal`) — hem "Değişken
  Ekle" hem "Değişkeni Düzenle" için tek, paylaşılan form (isim/varsayılan
  değer/açıklama + canlı `{token}` önizlemesi + tekillik/geçerlilik
  doğrulaması).
- `variable-list.tsx` (YENİ, `VariableList`) — her değişkenin GERÇEK,
  o anki metne göre yeniden hesaplanan kullanım sayısını (`countVariable
  Usages`, hiç önbelleğe alınmış bayat bir sayı değil) gösteriyor; silme
  şartnamenin tam istediği "Bu değişken prompt metninde N yerde
  kullanılıyor. Silersen bu alanlar da kaldırılacak." uyarısıyla iki
  tıklamalı onaya bağlı; yeniden adlandırma metindeki TÜM `{eskiİsim}`
  referanslarını `renameVariableTokenInText` ile günceller.
- `personalize-modal.tsx` (YENİ, `PersonalizeModal`) — herkese açık
  "Promptu kişiselleştir" akışı: her değişken için varsayılandan başlayan
  bir giriş alanı, canlı çözümlenmiş önizleme, "Varsayılanlara dön", ve —
  şartnamenin en çok vurguladığı ayrım — İKİ AYRI, asla karıştırılmayan
  kopyalama eylemi: **"Promptu Kopyala"** (görüntüleyenin kendi
  değerleriyle çözümlenmiş metin) ve **"Şablonu Kopyala"** (ham şablon,
  `{token}`'lar bozulmadan) — Playwright ile ikisinin de GERÇEKTEN farklı
  metin panoya kopyaladığı doğrulandı (aşağıya bakınız).
- `copy-prompt-button.tsx` (YENİ, `CopyPromptButton`) — dört yüzeyde de
  (bkz. aşağı) TEK, paylaşılan bileşen: her zaman ikon+görünür "Kopyala"
  etiketi BİRLİKTE (asla yalnızca ikon), gerçek bir `<button>` (klavye/
  focus erişilebilir, görünür `focus-visible` halkası eklendi), mobilde
  yeterli dokunma hedefi (`min-h-[28px]`), hızlı çift tıklamaya karşı
  `isBusyRef` koruması, başarısızlıkta gerçek bir "Kopyalanamadı" hata
  durumu (sahte bir "başarılı" göstermiyor). `lib/utils.ts`'e eklenen
  `copyTextToClipboard()`'u kullanıyor.

**"Kopyala" butonunun dört yüzeydeki gerçek yeri (şartname §10 — asla
ikinci bir menüde/kartın altında/yalnızca ikon değil):**
- **Prompt gönderisi / Türetilen (remix) gönderisi / Prompt yanıtı** — üçü
  de AYNI `prompts` satırı olduğundan, TEK bir paylaşılan bileşene
  (`PromptPreviewBox`, her kartta zaten var olan "Kullanılan prompt"
  kutusu) eklenen buton üçünü de kapsıyor — kart görünümünde VE
  `PromptDetailView`'ın kendi "Prompt Metni" bloğunda, metnin TAM üstünde.
  İkisi de yalnızca `prompt.promptText`'i kopyalıyor — başlık/yazar/etiket/
  yorum asla karışmıyor.
- **Prompt isteği** — `RequestCard` ve `RequestDetailView`'da isteğin
  gerçek talimat metninin (`description`) TAM üstüne eklendi. İsteğin
  `description`'ı zaten (form doğrulaması, min 20 karakter) her zaman
  gerçek, boş-olmayan bir metin olduğundan, "gerçek talimat metni yoksa
  buton gösterme" koşulu ayrıca kodlanmadı — yapısal olarak zaten hep var.

**Düzenleme akışı — bu uygulamanın İLK "kendi içeriğini düzenle"
özelliği:**
- `create-prompt-form.tsx`'e yeni bir `?edit=<promptId>` modu eklendi
  (`create-gate.tsx`'in `hasIntent` kontrolüne `edit` parametresi
  eklendi). Gerçek promptu (önbellek → canlı sorgu) çekip GERÇEK sahiplik
  kontrolü yapıyor (`found.author.id === user.id`) — sahibi değilse formu
  HİÇ göstermeden dürüst bir "Bu promptu düzenleme yetkin yok" ekranı
  gösteriyor (RLS zaten reddedecekti, ama kullanıcıyı tüm formu
  doldurttuktan SONRA reddetmek yerine baştan söylüyor). İçerik türü
  düzenlemede kilitli (yalnızca etiket olarak gösteriliyor, tıklanabilir
  değil); görsel opsiyonel (yeni dosya seçilmezse mevcut görsel
  değişmiyor); değişkenler `fetchVariablesForPrompt` ile önceden
  dolduruluyor. Kaydet, `updatePrompt(...)` + `replaceVariablesForPrompt(
  ...)`'i çağırıp promptun kendi detay sayfasına yönlendiriyor.
- `create-request-form.tsx`'e aynı ilkeyle `?edit=<requestId>` eklendi —
  yalnızca başlık/açıklama/yaratıcı yön/tercih edilen araç/etiketler
  düzenlenebiliyor; içerik türü kilitli, referans görsel alanı düzenleme
  modunda HİÇ gösterilmiyor (o hiç değişmiyor), durum/seçim zaten ayrı,
  kendi çalışan akışlarında kalıyor.
- `post-menu.tsx`'e (her gönderi kartının üç-nokta menüsü) yalnızca gerçek
  sahibine görünen bir "Düzenle" (Pencil ikonu) girişi eklendi;
  `request-detail-view.tsx`'e de aynı şekilde bir düzenle ikonu eklendi.
- `PromptDetailView`'a: prompt metninin üstüne `CopyPromptButton`,
  değişkeni varsa "Promptu kişiselleştir" eylemi (`PersonalizeModal`), ve
  yalnızca gerçek sahibine görünen `EditHistoryPanel` eklendi.
  `RequestDetailView`'a da aynı üçlü (kopyala zaten vardı, düzenle-linki +
  `EditHistoryPanel` eklendi).
- `edit-history-panel.tsx` (YENİ, `EditHistoryPanel`) — yalnızca sahibi
  için (RLS zaten başkasına boş döner, ama bu boş bir sorguyu baştan
  önlüyor) "Son düzenleme: … · Düzenleme geçmişi" — genişleyince hangi
  ALANLARIN (asla önceki METNİN kendisi değil, yalnızca "Başlık",
  "Prompt Metni" gibi Türkçe alan adları) ne zaman değiştiğini listeliyor.

**Gerçek, testler sırasında bulunup düzeltilen bir üretim hatası —
modalin submit'i React portal'ı üzerinden dış "yayınla" formuna
sızıyordu:** `VariableEditorModal`'ın kendi `<form onSubmit={handleSubmit}
>`ı `Modal`/`Portal` aracılığıyla `document.body`'ye taşınıyor, ama React
sentetik olay balonlanmasını GERÇEK DOM ağacına değil REACT AĞACINA göre
yapıyor (React'ın kendi resmi, dokümante edilmiş portal davranışı) — bu
yüzden modalin kendi `event.preventDefault()`'u yalnızca KENDİ hedefinin
varsayılan eylemini durduruyordu, olayın React ağacındaki gerçek atası
olan DIŞ prompt-yayınlama `<form>`'una balonlanmasını DURDURMUYORDU.
Sonuç: bir kullanıcı "Değişken Ekle"deki "Ekle"ye her bastığında, DIŞ
formun kendi `onSubmit`'i de (aynı sentetik "submit" olayıyla) tetikleniyor
ve prompt YARIM/erken bir durumda GERÇEKTEN yayınlanıyordu — bu, bu
görevin kendi yazdığı Playwright testinde (aşağıya bakınız) YAKALANDI:
"Değişken Ekle" sonrası testin sonraki adımı beklenmedik şekilde
`/prompts/local?id=...`'e yönlendirilmiş buldu kendini. Düzeltme: `Variable
EditorModal`'ın `handleSubmit`'ine `event.stopPropagation()` eklendi —
React'ın sentetik `stopPropagation()`'ı portal sınırından bağımsız olarak
REACT ağacındaki balonlanmayı doğru şekilde durduruyor. Bu, bu projenin
DAHA ÖNCE hiçbir modalinin (hiçbiri gerçek bir `<form>`'un içine
YERLEŞTİRİLMEMİŞTİ) hiç karşılaşmadığı, tamamen bu özelliğin kendi yeni
mimarisinin (bir modalin bir `<form>`'un içinde açılması) ortaya çıkardığı
gerçek bir hataydı — icat edilmiş bir senaryo değil, gerçek Playwright
testinde gerçekten yeniden üretilip düzeltildi.

**Nasıl doğrulandı:**
- **SQL/RLS (yerel PostgreSQL 16, bu oturumun bu bölümünü yazarken
  gerçekten çalıştırıldı — `/tmp/pgtest/test_edit_tracking.sql`, 11
  senaryo):** kendi promptunu düzenlemenin `content_edits` satırı
  ürettiği; kendi kendine düzenlemede (bugünkü tek-sahip modelinin TEK
  mümkün durumu) bildirim ÜRETİLMEDİĞİ; yalnızca beğeni sayacını
  güncelleyen bir UPDATE'in `content_edits`'e HİÇ dokunmadığı; başka bir
  kullanıcının (RLS altında zaten imkânsız olan) bir promptu güncelleme
  denemesinin sessizce 0 satır etkilediği; aynı desenin `prompt_requests`
  için de doğru çalıştığı; `prompt_variables`'ın tekillik/geçerlilik CHECK
  kısıtlarının (aynı isim, süslü parantez/boşluk) doğru reddettiği; RLS'in
  yalnızca gerçek sahibin değişken ekleyip/silebilmesine izin verdiği —
  hepsi gerçekten çalıştırılıp doğrulandı (bu migration DEĞİŞMEDİĞİNDEN bu
  sonuçlar hâlâ geçerli; bu oturumun bu devamında yerel Postgres cluster'ı
  kapalı olduğundan yeniden koşulmadı, yalnızca migration dosyasının
  KENDİSİNİN değişmediği doğrulandı).
- **Saf mantık birim testi** (`node --experimental-strip-types`, gerçek
  `src/lib/prompt-variables.ts`'e karşı, kopyasına değil) — 18 assertion,
  BU OTURUMDA yeniden çalıştırılıp hepsi doğrulandı: normalize/geçerlilik/
  token çıkarma/kullanım sayma/yeniden adlandırma (yalnızca TAM token
  eşleşmesi)/kaldırma/imleç konumunda ekleme (seçili metni değiştirme
  dahil)/çözümleme (tanımsız bir token'ın literal kaldığı, boş bir
  değerin "undefined" değil GERÇEK boş bir değer sayıldığı dahil).
- **Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla Playwright**
  (statik export `npx serve` ile GitHub Pages basePath'ini taklit eden bir
  symlink düzeniyle yerel sunularak — bu projenin standart yöntemi), YENİ
  32 senaryoluk bir pakette (BU OTURUMDA yazılıp çalıştırıldı) hepsi sıfır
  JS hatasıyla doğrulandı: `{ortam}` token'ının GERÇEK imleç konumuna
  eklendiği (metnin sonuna değil); Değişkenler panelinin doğru kullanım
  sayısını gösterdiği; Önizleme sekmesinin varsayılan değeri doğru
  çözümlediği; yayınlama isteğinin ham şablonu (`{token}` bozulmadan)
  gönderdiği; değişkenlerin gerçek bir sil-hepsini-sonra-ekle çağrısıyla
  kaydedildiği; düzenleme modunun gerçek verilerle dolduğu, içerik
  türünün kilitli göründüğü, var olan değişkenin listelendiği, Kaydet'in
  GERÇEK bir PATCH gönderip `content_type` alanına HİÇ dokunmadığı;
  sahibi OLMAYAN birinin `?edit=`'e gittiğinde formun HİÇ render
  edilmeyip dürüst bir yetkisizlik ekranı gösterdiği; prompt detayındaki
  düz "Kopyala"nın TAM OLARAK ham şablonu kopyaladığı; sahibinin
  düzenleme geçmişi panelini gördüğü, sahibi OLMAYANIN GÖRMEDİĞİ;
  "Promptu kişiselleştir"in varsayılan değerle açıldığı, canlı önizlemenin
  özelleştirmeyi yansıttığı, VE en kritik olarak — "Promptu Kopyala"nın
  ÇÖZÜMLENMİŞ (kullanıcının kendi değeriyle) metni, "Şablonu Kopyala"nın
  ise HAM şablonu (özelleştirmeden ETKİLENMEDEN) panoya kopyaladığı;
  değişkeni olmayan bir promptta "Promptu kişiselleştir" butonunun hiç
  görünmediği; istek detayının kendi Kopyala'sının isteğin gerçek
  `description`'ını kopyaladığı; istek düzenleme modunun referans görsel
  alanını hiç göstermediği ve PATCH'in `content_type`/`status`/`reference_
  image_url`'e hiç dokunmadığı. Bu paket ayrıca yukarıdaki gerçek
  React-portal/form-bubbling hatasını YAKALAYIP raporladı, düzeltme
  sonrası yeniden çalıştırılıp 32/32 geçti.
- Bu oturumda ayrıca önceki bölümlerin regresyon paketleri (`smart-tags-
  e2e-test.mjs` 30/30, `collections-e2e-test.mjs` 19/19, `save-flow-e2e-
  test.mjs` 14/14, `resilience-test.mjs` 14/14) sıfır regresyonla yeniden
  çalıştırıldı — bu görevin `create-prompt-form.tsx`/`create-request-
  form.tsx`/`post-menu.tsx` değişikliklerinin var olan hiçbir akışı
  bozmadığı doğrulandı.
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (22 rota — yeni
  bir route eklenmedi, yalnızca `/create`/`/requests/new` yeni query
  parametreleri kabul ediyor) sıfır hatayla geçti. **Gerçek hata
  düzeltmesi (build sırasında bulundu):** `/requests/new` sayfası
  `useSearchParams()` kullanan `CreateRequestForm`'u hiç `<Suspense>` ile
  sarmıyordu (yalnızca `/create` sayfası, Bölüm 9'dan beri, sarılıydı) —
  bu görev `CreateRequestForm`'a İLK KEZ `useSearchParams()` eklediğinden
  (edit modu için) bu eksiklik ilk kez gerçek bir build hatası olarak
  ortaya çıktı ("useSearchParams() should be wrapped in a suspense
  boundary"); `src/app/(app)/requests/new/page.tsx`'e `/create`'inkiyle
  BİREBİR AYNI `<Suspense fallback={null}>` sarmalayıcısı eklenerek
  düzeltildi.

**Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919290000_prompt_
variables_and_edit_tracking.sql`'i Dashboard → SQL Editor'de uygulayıp
bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`prompt_requests` için ayrı bir değişken tablosu/sistemi kurulmadı**
  (yukarıda açıklandı) — isteğin "prompt metni" hiç yok, yalnızca
  `description`; şartname de zaten değişken sistemini "prompt metni"
  etrafında çerçeveliyordu.
- **Düzenleme bildirimi bugün için çoğunlukla durgun** — RLS yalnızca
  gerçek sahibinin düzenlemesine izin verdiğinden, `editor_id <> owner_id`
  koşulu bugünkü tek-kullanıcı-model altında pratik olarak hiç
  sağlanamıyor; bu İCAT EDİLMİŞ bir "ortak düzenleme" değil, dürüstçe
  "bugün tetiklenmeyen ama doğru ve test edilmiş, ileride bir ortak-
  düzenleme özelliği eklenirse hazır" bir altyapı.
- **Değişken isimlerinde Türkçe harfler serbest bırakıldı** (yalnızca
  süslü parantez/boşluk yasak) — şartnamenin kendi örnekleri ("ışık_
  stili" gibi) zaten Türkçe karakter içeriyordu, ASCII'ye kısıtlamak bu
  örnekleri kırardı.
- **Değişken değerleri yalnızca düz metin (`<input type="text">`)** —
  çok satırlı/zengin metin değer girişi eklenmedi, şartname de böyle bir
  şey istemedi.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **Yerel Postgres SQL testleri bu oturumun bu devamında yeniden
  çalıştırılamadı** (Postgres cluster'ı bu sandbox'ta şu an kapalı) —
  migration dosyasının kendisi bu devamda hiç değişmediğinden, önceki
  gerçek çalıştırmanın sonuçları hâlâ geçerli, ama dürüstçe belirtilmesi
  gereken bir ayrım: bu son doğrulama turu SQL katmanını değil yalnızca
  saf mantık + istemci/tarayıcı katmanını yeniden koştu.
- **`content_edits` yalnızca dört alanı (title/description/prompt_text/
  tool ya da istek eşdeğerleri) izliyor** — görsel/medya değişikliği ayrı
  bir "düzenleme" olarak İZLENMİYOR (yalnızca metin alanları); şartname de
  zaten metin odaklı bir "meaningful edit" tanımı istiyordu.
- **Değişken sırası (`sort_order`) yalnızca ekleme sırasını yansıtıyor** —
  sürükle-bırak ile yeniden sıralama arayüzü eklenmedi, şartname de böyle
  bir şey istemedi.

---

**Sonraki adım:** Prompt Değişken Sistemi + Kopyalama + Düzenleme Geçmişi/
Bildirimi (Bölüm 9.25) TAMAMLANDI. Kullanıcının yapması gereken manuel
adım: `supabase/migrations/20260919290000_prompt_variables_and_edit_
tracking.sql`'i Dashboard → SQL Editor'de sırayla uygulamak (önceki 24
migration zaten uygulanmış durumda). Bir sonraki modül için bu dosyanın
başındaki kurala uyarak önce mevcut mimari denetlenmeli, yalnızca gerçek
eksikler kapatılmalı.
