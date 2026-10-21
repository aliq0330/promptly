> Not: `AGENTS.md` dosyası Next.js CLI tarafından otomatik oluşturulur/güncellenir
> ve bu Next.js sürümüne özgü API/konvansiyon farklarını içerir. Next.js ile
> ilgili kod yazmadan önce onu da oku, silme.

# Promptly — Proje Rehberi (CLAUDE.md)

Bu dosya, "Promptly" projesinin kalıcı çalışma rehberidir. Her yeni göreve
başlamadan önce okunmalı; yeni kararlar alındığında veya mimaride değişiklik
yapıldığında güncellenmelidir.

> **Bu dosya bilerek kısa tutulur.** Her oturumun başında bağlama yüklenir.
> Özellik tarihçesi (neyin neden/nasıl yapıldığı) `docs/history/` altındadır,
> otomatik yüklenmez — gerektiğinde oradan okunur. Bu dosyaya yalnızca
> **her zaman bilinmesi gereken kurallar ve güncel durum** yazılır; "şu özellik
> şöyle yapıldı, şu testler geçti" anlatısı buraya değil `docs/history/`'ye
> yeni bir dosya olarak eklenir (bkz. Bölüm 8).

> Kural: Bu dosyada "tamamlandı" diye işaretlenmeyen hiçbir şey tamamlanmış
> sayılmaz. Geçici/varsayımsal kararlar "TASLAK" olarak işaretlenir.

---

## 1. Ürünün Amacı

Promptly, kullanıcıların yapay zekâ ile ürettikleri promptları paylaşabildiği,
keşfedebildiği, yeniden kullanabildiği ve birbirleriyle sosyal olarak
etkileşime girebildiği bir platformdur. Yalnızca görsel promptlarla sınırlı
değildir: **görsel, metin, ses ve video** üretim promptları aynı platformda,
aynı akışlarda yer alır (`Prompt.contentType`: `image` | `text` | `audio` |
`video`; kategori/alt kategori taksonomisi DB'den gelir, bkz. Bölüm 6).

Genel amaçlı bir sosyal medya sitesi veya soru-cevap platformu DEĞİLDİR —
her sosyal özellik prompt üretim deneyimini desteklemek için var.

**Birinci sınıf içerik türleri (4):** aynı sosyal katmanı (beğeni, yorum,
kaydet/koleksiyon, paylaş, istatistik, bildirim, moderasyon) paylaşırlar:
- **Prompt** — başlık, açıklama, prompt metni (`{değişken}` jetonlu olabilir),
  tür, görseller/çıktı, etiketler, araç/model, DNA bölümleri.
- **Prompt İsteği (Request)** — bir görsel/stil için yaratıcı talep; yanıtlar
  normal bir Prompt'tur (`origin.type === "request-response"`), ayrı tablo yok.
- **Workflow** — Prompt'ları sıralı adımlara bağlar; model çalıştırmaz.
- **Hazır Ayar (Preset)** — bir Prompt için alan başına tek değerli parametre seti.

---

## 2. Teknoloji Yığını

- **Next.js 16 (App Router, `output: "export"` statik)** + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (merkezi token sistemi, `src/app/globals.css`)
- **Supabase**: Auth, Postgres (RLS), Storage, Realtime, Edge Functions
- **lucide-react** ikonları; fontlar Bölüm 4'te
- Paket yöneticisi: npm. Gereksiz bağımlılık eklenmez.

Uygulama tamamen statik export'tur (GitHub Pages, `basePath /promptly`): sunucu
çalışma zamanı yok, Supabase'e yalnızca tarayıcıdan erişilir. Bu yüzden her
"id'ye göre detay" sayfası `/x/local?id=` biçimindedir (`promptHref()` vb. —
`src/lib/utils.ts`). Hiçbir buton gerçek olmayan bir işlemi yapılmış gibi göstermez.

**PWA:** `src/app/manifest.ts` + `public/icons/` ile ana ekrana eklenebilir (`docs/history/163-*`); **service worker yok** (bilerek).

**Dağıtım:** `.github/workflows/deploy.yml` yalnızca statik siteyi GitHub
Pages'e yayınlar. **Edge Function'lar (`supabase/functions/*`) ve
migration'lar CI ile deploy edilmez** — elle (`supabase functions deploy …`,
SQL Editor/MCP) uygulanır; kod değişince unutulmaması gerekir.

---

## 3. Klasör Yapısı

```
src/
  app/(app)/…, app/(auth)/…   # route'lar (ince katman; iş mantığı feature'da)
  components/ui/              # feature'dan bağımsız UI bileşenleri
  components/layout/          # header, sidebar, mobil nav, shell
  features/<alan>/            # auth, collections, communities, content, drafts, feed, focus,
                              # messages, moderation, my-content, notifications,
                              # groups, onboarding, presets, profile, prompts, relations,
                              # requests, search, share, statistics, stories, studio, tags, workflows
  lib/                        # utils, i18n, taksonomi, prompt-dna, relations, …
  lib/supabase/               # veri erişim katmanı (tablo başına dosya)
  types/index.ts              # paylaşılan tipler
supabase/migrations/          # sıralı SQL; supabase/functions/; supabase/seed/
docs/history/                 # özellik tarihçesi arşivi (otomatik yüklenmez)
```

Her feature kendi bileşenlerini, servis çağrılarını ve tiplerini barındırır.
Sayfalar feature bileşenlerini birleştiren ince katmandır.

---

## 4. Tasarım Sistemi — Promptly 2.0 · Meydan

> `docs/history/050-*` token sistemini kurdu; `docs/history/190-*` ile görsel dil
> **Meydan** oldu (kullanıcı üç yön arasından seçti). Buradaki özet bağlayıcıdır —
> yeni bir bileşen yazılırken önce bu bölüm okunmalı.

Tasarım dili: **Meydan** — parlak, sosyal, topluluk öncelikli bir prompt topluluğu
(görsel üretim sitesi değil). Beyaza yakın zemin, kobalt birincil, sıcak turuncu
ikincil vurgu; gereksiz gradient / glassmorphism / neon / ağır gölge yok. İnce
(`border-soft`) kenarlıklar, çok hafif gölgeler (`shadow-card`), yumuşak köşeler
(kart `rounded-lg` = 16px, `rounded-xl` = 22px), **düğmeler hap biçimli**
(`Button` = `rounded-full`), 200ms `ease-soft` geçişler. Ana Sayfa ana sütun (gönderiler
iki sütunlu ızgara) + `xl`'de sağ yardımcı sütundur; **profil, koleksiyon ve topluluk sayfaları da Albüm bandıyla açılır** (`docs/history/203-*`: `DetailBand` + `BandActionRow` — tek büyük birincil düğme: Takip et / Koleksiyonu takip et·düzenle / Sohbeti aç·Topluluğa katıl; profil bandı avatardan, koleksiyon/etiket/Kaydedilenler bandı kolaj kapağından [`CollageArt`], topluluk bandı `CommunityCover`'dan [fotoğraf › renk › topluluk görseli] renk alır; sonuç sayfası da `DetailShell`; topluluk/koleksiyon/yaratıcı kartları, haftalık tema ve workflow adımları `CardBandBackdrop` ile küçük bant çizer), profilde tek sekme satırı, toplulukta hap sekmeler (`Tabs variant="pill"`).

**Fontlar** (`src/app/layout.tsx`, `next/font`): gövde **DM Sans**, başlıklar ve
sayfa düzeyi başlıklar (`text-display`/`text-h1`/`text-h2`, h1–h3 otomatik) ve
wordmark **Bricolage Grotesque** (`font-display`; `font-serif` artık onun takma
adı — serif yok), prompt metni **JetBrains Mono** (`prompt-text` utility —
platformun imza öğesi: kopyalanan şey aynı mono blokta görünür; `PromptPreviewBox` — görseli olmayan prompt kartında kartın görseli odur, `variant="art"`). İkon: **lucide-react**, kartlarda
`strokeWidth` 1.75; aynı işlev her yerde aynı ikon (Beğeni `Heart`, Yorum
`MessageCircle`, Kaydet `Bookmark` (içerik ve topluluk başvuru gönderisi; topluluğun kendisi kaydedilmez), Paylaş `Share2`, Menü `MoreVertical`,
Prompt `SquareTerminal`, Workflow `Workflow`, Hazır Ayar `SlidersHorizontal`, İstek `Sparkles`, Hikâye `CircleFadingPlus`).

**Token katmanı — tek kaynak `src/app/globals.css`.** Bileşenler asla hex
yazmaz; yalnızca semantik utility'ler: `bg-background`, `bg-surface`,
`bg-surface-soft`, `bg-surface-elevated`, `text-text`,
`text-text-secondary`, `text-text-muted`, `border-border`,
`border-border-soft`, `border-border-strong`, `bg-primary`,
`bg-primary-hover`, `bg-primary-soft`, `text-primary-foreground`,
`text-secondary`, `text-success` / `text-warning` / `text-danger`, gölgeler
`shadow-xs/sm/card/card-hover/pop`, tip ölçeği `text-display/h1/h2/h3/body/
small/caption/label`, animasyon `animate-fade-in/pop-in/sheet-up`,
`skeleton-shimmer`. Hikâye tuvali yazarın seçtiği renklerle HER izleyicide aynı görünmeli: sabit (palete bağlı olmayan)
`story-*` token'ları (`bg-story-cobalt`, `text-story-white`, `bg-story-stage`…, `docs/history/198-*`) yalnız hikâye bileşenlerinde. Eski adlar (`accent-surface`, `primary-dark`, `accent`)
yeni tokenların alias'ı olarak korunuyor. `cn()` (tailwind-merge) bu özel
tokenları tanıyacak şekilde genişletildi — aksi hâlde `text-caption` ile
`text-text-muted` birbirini silerdi.

**Temalar — iki bağımsız eksen**, ikisi de `themeInitScript` ile ilk
boyamadan önce `<html>`'e uygulanır, localStorage'da (`promptly-theme`,
`promptly-palette`) tutulur, `/settings → Görünüm`'den seçilir:
- mod: `.dark` sınıfı (açık/koyu)
- palet: `data-palette` = `meydan` (beyaz + kobalt + turuncu, **varsayılan** —
  `docs/history/190-*`) / `mono` (Beyaz — nötr siyah-beyaz) / `lavender` /
  `ocean` (lacivert + elektrik mavisi) / `forest` (orman + nane) / `sand` (kum + mercan,
  `docs/history/057-*`). Yeni palet eklenirse `profiles_theme_palette_check` de genişletilir.

Her palet her iki modda aynı tam token setini tanımlar (12 kombinasyonun
hepsinde metin/zemin çiftleri WCAG AA ≥ 4.5:1 — `docs/history/050-*`, `114-*`). Palet
seçicileri her elemente uyar, bu yüzden bir alt ağaç başka paletin gerçek
tokenlarıyla önizlenebilir (Ayarlar'daki renk örnekleri böyle çalışır).

**Ortak bileşenler:** `components/ui/` — `Button` (+ `buttonClassName` Link
için), `Badge`, `Card`, `Chip`/`ChipRow`, `Tabs` (underline / segmented / pill),
`EmptyState`, `PageHeader` (sade büyük başlık; resimli kart yok)/`SectionHeader`/`PageContainer`, `Modal`
(mobilde bottom sheet, masaüstünde ortalanmış), `Skeleton`,
`DetailSkeleton`/`NotFoundBlock`, `PromptCardSkeleton`.
`features/content/` — `ContentCard` kabuğu (PromptCard / WorkflowCard / PresetCard /
RequestCard ortak), `ContentTypeLabel`, `ContentTags`,
`contentActionClassName` (Beğeni/Yorum/Kaydet/Paylaş ortak görünümü). Her kartın iç yerleşimi **Albüm kartı** `ContentCardPost` (`docs/history/202-*`, kullanıcı beş yön arasından seçti; detay sayfasının bandıyla aynı dil): üstte gönderinin görselinden renk alan BANT (`backdrop` büyütülüp bulanıklaştırılır, sayfa rengi örtü; görselsizde `bg-primary-soft`) — içinde `art` (çıktı görseli / video-ses kapağı / görselsiz promptta prompt metni / workflow adım karosu / hazır ayar parametre karosu / istek görseli ya da metni), tür satırı (`ContentTypePill`: simge + BÜYÜK HARF etiket + `detail` = araç/kategori; durum rozetleri yanında), büyük başlık (`ContentCardTitle`, açıklamasız), küçük avatar + ad + "@kullanıcı · zaman", sağda ⋮; altında eylem satırı: solda kartın TEK büyük eylemi (`primary`: Kopyala / Çalıştır / Studio'da aç / Yanıtla — `CARD_PRIMARY_CLASS`), sağda Beğeni · Yorum · Kaydet · İstatistik · Paylaş (büyük eylem yoksa eski sıra: sayaçlar solda, Paylaş sağda). Kart stacking context kurmaz (`isolate`/transform yok — ⋮ menüsü sonraki kartın üstüne açılır). Yeni kart yazarken bu kabuğu kullan, ikinci başlık/altbilgi çizme.
Oluşturma ekranlarının ortak alt alanı `CreateFormActions` paylaşım hedefi seçicisini (`ShareDestinationField`, `docs/history/197-*`: "Nerede paylaşmak istiyorsun?" Genel akış / üye olunan topluluklar) taşır; seçim `?community=` bağlamının (`community-return.ts`) üstüne biner — yeni bir oluşturma formu yazarsan `CreateFormActions`'ı kullan, ayrı hedef seçici yazma.
Sitedeki HER gönderi listesi (Ana Sayfa, Topluluklar, topluluk sayfası, Keşfet, listeler, profil, arama, koleksiyon) `ContentGrid`
ile çizilir: HER ekranda kutulu kartlar (telefonda tek sütun, 12px sayfa kenar boşluğu; `sm`+ kutulu sütunlar, yanında sağ sütun olan sayfada en çok 2; `docs/history/196-*`) —
yeni bir gönderi listesi elle `columns-*` yazmaz, ikinci bir liste görünümü kurulmaz. **Ana Sayfa ve Keşfet'in bölüm değiştiricisi `SectionNav`'dır** (`docs/history/207-*`: yuvarlatılmış kare bölüm balonları + tek kontrol satırı; kaydırınca üst menünün altına/yerine sabitlenen tek 52px şeride daralır — sıfır yükseklikli `sticky` çapa, bu yüzden uzun kapsayıcının doğrudan çocuğu olarak konur; filtre penceresi `ListFilterSheet`) — o iki sayfada ayrı sekme/Filtre satırı yazma. Her gönderi listesinde Keşfet'teki Kart | Izgara
seçicisi vardır (`ViewModeControls` + `useViewMode`; Izgara = `FocusGrid`, iç değer `focus`) — yeni liste yazarken ikisini de bağla, yeni seçici yazma. **Odak** bir görünüm DEĞİL, ayrı tam ekran sayfadır (`/focus`, `docs/history/199-*`; `203-*` ile her gönderi "Şimdi çalıyor" Albüm slaytı — bulanık arka plan üstünde albüm kapağı [video/ses kapağın içinde oynar] + tek satır eylem, `AlbumSlide`): slayt/ray/oynatma `features/focus/focus-feed*`; tam ekran açılan yeni bir katman yazarken aynı yolu izle (`html[data-focus-open]`/`data-story-open` → `[data-app-chrome]` gizlenir, `lockBodyScroll`). Yorum mantığı TEK yerde: `useCommentThread` (detay `CommentSection` ve Odak'ın alttan açılan yorum sayfası `FocusCommentsSheet` aynı hook'u, `CommentNode` `layout` ile iki görünümü kullanır; `docs/history/200-*`) — yeni bir yorum yüzeyi yazarken hook'u kullan.
Detay sayfaları **Albüm** düzenindedir (`docs/history/201-*`, kullanıcı dokuz yön arasından seçti; `features/content/detail-parts.tsx`): üstte gönderinin görselinden renk alan BANT (`DetailBand`: görsel büyütülüp bulanıklaştırılır, üstüne sayfa rengi örtü; görselsizde marka tonu) — solda kapak (`DetailArt`, kırpılmaz; görselsizde `DetailArtPlaceholder` tür simgesi), sağda tür etiketi + büyük başlık + `DetailByline` (ad + `follow` = Takip Et yanında); ⋮ bandın sağ üst köşesinde (`DetailBand menu`); altında TEK eylem satırı (`DetailActionBar`, `docs/history/204-*`: `primary` = varsa büyük birincil eylem — Yanıtla/Adım adım çalıştır/Studio'da aç; promptta YOK, Kopyala prompt bloğunda; simgeler solda, `end` = İstatistik · Paylaş sağda; ekrandan çıkınca simge satırı alta sabitlenir — `data-detail-dock`, telefonda alt menünün üstünde); gövde `lg`+ iki sütun: içerik (`DetailSection`ler, son `DetailComments` + `EngageComments … headless`) ve "Hakkında" (`DetailAside`: meta kartı + ilgili içerik). İkinci eylem çubuğu ya da ayrı yazar kartı koyma.

### Responsive İlkeleri

Tek tasarım sistemi, üç kompozisyon (`AppShell`):
- Mobil (< md, 768px): üst header + alt navigasyon (Ana Sayfa, Keşfet,
  **Oluştur** — vurgulu orta buton, Topluluklar, Odak; profil üstteki avatar menüsünde). Sayfa kenar boşluğu
  12px; kartlar ekran genişliğini kullanır; modallar bottom sheet.
- Tablet (md–lg): 72px ikon rayı (etiketler erişilebilir ad/tooltip), alt
  navigasyon yok, header'da arama kutusu.
- Masaüstü (lg+): 256px gruplu sidebar (Keşfet / Kütüphanem + ayrı birincil
  "Oluştur" butonu), detay sayfalarında sağ yardımcı sütun.
- Dokunma hedefleri ≥ 36px, uzun prompt metinleri taşmaz (`break-words`).
- Aşağı kaydırınca üst menü (yalnız `lg` altı) ve alt menü kayarak kaybolur, yukarı kaydırınca döner (`useChromeAutoHide` → `html[data-chrome-hidden]`, `docs/history/204-*`); ekranın üstüne/altına sabitlenen yeni bir öğe yazarken bu özniteliği hesaba kat.

## 4.5 Çok Dillilik (Türkçe / İngilizce) — Bağlayıcı Kural

Site iki dillidir (Türkçe varsayılan/İngilizce). **Bundan sonra eklenen HER
özellik, sayfa, modül, modal, bildirim, hata/toast/doğrulama mesajı iki dilde
de çalışmalıdır** — yalnızca Türkçe hardcoded metin içeren bir modül
tamamlanmış sayılmaz. Ayrıntı ve mimari: `docs/history/049-*`, `056-*`, `057-*`.

- Kullanıcıya görünen her metin `src/lib/i18n/translations.ts`'e `{tr, en}`
  çiftiyle eklenir ve bileşende `useTranslation().t("anahtar")` ile okunur.
  Yeni anahtar eklemeden önce aynı metin için var olan anahtar aranır
  (`grep`), varsa yeniden kullanılır.
- Bileşen olmayan kodda (`lib/*.ts`, `lib/supabase/*.ts` hataları)
  `translateForRuntime(key, params?)` kullanılır. Tarih/göreli zaman için
  `formatRelativeTime(..., language)` — `language` argümanı unutulmaz.
- Modül seviyesinde BİR KEZ hesaplanan çevrilmiş sabit yazılmaz (dil sonradan
  değişince donuk kalır); fonksiyon veya `t()` çağrısı kullanılır. Varsayılan
  prop değerinde `t()` çağrılamaz: `prop ?? t("anahtar")` kullanılır.
- Veritabanında saklanan değerler (slug, enum, option `value`) çevrilmez;
  yalnızca görünen etiket `Record<Değer, TranslationKey>` haritasıyla çevrilir.
- ÇEVRİLMEYENLER: kullanıcı içeriği (prompt/yorum/biyografi/kullanıcı adı/
  kullanıcının yazdığı etiket), marka/teknik adlar (Promptly, Supabase,
  JSON, GPT, Midjourney...), "Prompt" kelimesi, kod yorumları.
- Statik veri dosyalarına (katalog, aday etiketler vb.) yeni Türkçe metin
  eklenirse İngilizce karşılığı da eklenir (bkz. `generator-field-catalog-en.ts`, prompt değişkenlerinin hazır alan kütüphanesi).
- SQL trigger'ların ürettiği bildirim metni Türkçe kalır; yeni bir bildirim
  cümlesi eklenirse `src/lib/notification-message.ts`'e kalıbı ve
  `translations.ts`'e `notifMsg.*` karşılığı da eklenir.
- Bir görev bitmeden: `npx tsc --noEmit`, `npm run lint`, `npm run build`
  temiz olmalı ve raporda "İngilizce karşılıkları eklendi mi" açıkça
  belirtilmelidir.

---


## 5. Sayfa Haritası (kodla doğrulanmış güncel rotalar)

| Route | Açıklama |
|---|---|
| `/` | Ana Sayfa: karma akış (En yeni / Popüler / Takip / Etiketlerim; sunucudan `feed_page`, keyset), tür çipleri; misafire tanıtım |
| `/focus` | **Odak** (`docs/history/199-*`): tam ekran, dikey, tek gönderi/ekran (Reels tarzı); herkesin herkese açık gönderileri (`feed_page` en yeni; "Takip ettiklerim"), "Medya" süzgeci, video/ses yazarın yüklediği çıktıyla oynar; açıkken üst/yan/alt menü gizli, hep koyu sahne; telefonda alt menünün 5. yuvası (Profil üstteki avatar menüsünde) |
| `/discover` | Keşfet: bölümler (Tümü / Promptlar / Workflow / Hazır ayar / İstekler / Yaratıcılar), filtreler (Promptlar'da ek "En çok kullanılan" sıralaması); içerik bölümleri sunucudan `feed_page` (keyset), Yaratıcılar `profiles` keyset |
| `/prompts`, `/requests`, `/workflows`, `/presets` | Tür listeleri (ortak `ContentListPage`: arama, Filtre, sıralama, Kart/Izgara) |
| `/prompts/local?id=` · `/requests/local?id=` · `/workflows/local?id=` · `/presets/local?id=` · `/results/local?id=` | Detay sayfaları |
| `/create` · `/requests/new` · `/workflows/create` · `/presets/create` | Oluşturma/düzenleme (`?edit=<id>`), ortak alt alan: Görünürlük + Taslağa kaydet/Paylaş |
| `/workflows/local?id=` (detay) | Herkese açık workflow: "Akış" görünümü + **"Adım adım" çalıştırma modu** (`?run=1`; model çalıştırmaz, sonuç yapıştırılır → sonraki adımın girdisi, durum yalnız `sessionStorage`) |
| `/studio` | Prompt / Hazır Ayar kaynaklı deneme alanı, kullanıcının kendi API anahtarıyla görsel/metin üretimi (`/generate` buraya yönlenir) |
| `/search`, `/tags`, `/tags/local?tag=` | Arama (chip tabanlı; `/search` Keşfet'e yönlenir; sonuç sekmeleri Tümü · Gönderiler · Kişiler · Topluluklar, `?tab=`, `docs/history/205-*` — çipler yalnız gönderilere uygulanır), etiket keşfi/detayı |
| `/relations?type=&id=` | Birleşik İlişki Haritası |
| `/collections/local?id=`, `/saved` | Koleksiyon detayı (başkasının herkese açık koleksiyonunda Takip Et + takipçi sayısı); `/saved` = "Kaydedilenler": kullanıcının TÜM koleksiyonlarındaki benzersiz içerikler (`docs/history/168-*`) |
| `/profile/real?username=`, `/profile/edit`, `/followers`, `/following`, `/my-content` | Profil ve kütüphane |
| `/messages`, `/messages/local?id=`, `/messages/starred` | Mesajlaşma (Realtime, mesaj istekleri, fotoğraf, emoji); `?id=` bir **birebir sohbet ya da topluluğun sohbeti** olabilir (`conversations.kind`), başlıkta topluluk sayfasına bağlantı + bilgi penceresi (`?panel=requests` vb. ile bildirimden); sohbet içi arama, sabit mesajlar, okundu tikleri, "yazıyor"; `/messages/starred` = yıldızlı mesajlar (birebir + grup tek liste, `docs/history/174-*`) |
| `/communities`, `/communities/all`, `/communities/local?id=&tab=`, `/communities/join#<token>` | **Topluluklar** (`docs/history/175-*`, ana sayfa `docs/history/185-*`): `/communities` sekmeleri **Gönderiler** (varsayılan: üye olunan açık+kapalı toplulukların gönderileri; tamamen kapalı girmez; "Topluluklarım" bağlantısı = eski "Üyesi olduklarım" listesi `?tab=mine`) · **Keşfet** ("Sana uygun topluluklar" şeridi ≤10 + hemen altında "Tüm topluluklar" düğmesi + görülmemiş-gönderi akışı) · **Yönettiklerim** (yalnız yönetici/sahip/moderatöre) · **Davet ve başvurular** (Davetler · Başvurularım · Gelen başvurular); `/communities/all` = Tüm topluluklar (arama + kategori + ilgi sıralı gözat; açık+kapalı, tamamen kapalı asla); ziyaretçi eski herkese açık listeyi görür; detay sekmeleri (`docs/history/183-*`, `docs/community-system.md`): **Akış** (ilk açılış; "Gönderi oluştur" = yeni içerik [mevcut oluşturma ekranı + `?community=`] ya da mevcut içeriğe başvur; `docs/history/178-*`; üstte duyuru/etkinlik özet şeridi) · Etkinlikler · **Üyeler** (kişi yönetimi: liste · Katılım istekleri [sayaçlı] · Davet) · Hakkında ve kurallar (kişisel tercihler + ayrılma) · Yönetim (yapılandırma: Özet, Ayarlar, Duyurular, Moderasyon, İşlem geçmişi). Sohbet sekme DEĞİL, başlıktaki "Sohbeti aç"; eski `tab=overview|chat`, `tab=manage&section=requests|invites` adresleri yönlenir; davet bağlantısının açılış sayfası (token URL parçasında). Oturumsuz ziyaretçi bu sayfaları görür (Keşfet + herkese açık topluluğun salt-okunur içeriği; `docs/history/177-*`). Eski `/groups` ve `/groups/join#…` buraya yönlenir/çalışır. Mesajlar'dan bağımsız grup oluşturma YOKTUR |
| `/communities/post/local?id=` | **Başvuru gönderisi sayfası** (`docs/history/180-*`): başvurulan içerik ayrıntılı, gönderinin kendi beğeni/yorumu, orijinal içeriğe bağlantı; yerel gönderi için içeriğin kendi sayfasına yönlenir |
| `/stories?id=`, `/stories/create`, `/stories/archive` | **Hikâyeler** (`docs/history/198-*`): `?id=` bildirim/bağlantı girişi (görülemeyen hikâye "artık mevcut değil", varlığı sızmaz); oluşturucu (`?community=`, `?link=tür:id`, `?draft=`, `?story=&answer=`); sahibine özel arşiv + saklama tercihi. Görüntüleyici sayfa DEĞİL, her sayfanın üstünde açılan katmandır (`StoryViewerProvider`, kaydırma korunur). Şerit Ana Sayfa'da ve topluluk akışında; öne çıkanlar + avatar halkası profilde |
| `/notifications` | Bildirim merkezi (sekmeler; topluluk bildirimleri türden değil ADRESTEN "Topluluklar"a ayrılır — `notificationCategory`/`isCommunityNotification`, `docs/history/205-*`; yeni bir topluluk bildirimi topluluk sayfasına ya da topluluk sohbetine giden `system` adresiyle yazılırsa kendiliğinden oraya düşer) |
| `/settings`, `/settings/blocked` | Hesap / Gizlilik / Tercihler (görünüm, dil) / Tehlikeli bölge ("Hesabımı sil" — `delete-account` Edge Function) |
| `/privacy`, `/terms` | Gizlilik Politikası, Kullanım Koşulları (herkese açık, TR+EN; metin `features/legal/legal-content.ts`) |
| `/moderation` | Yalnızca moderatör: şikâyetler, site istatistikleri, kullanıcı yönetimi, depolama temizliği, DNA doldurma, haftalık temalar |
| `/login`, `/signup`, `/reset-password` | Auth (e-posta/kullanıcı adı + şifre, Google ile devam et) |
| `/share/<tür>/<anahtar>/` | Derleme zamanı üretilen statik paylaşım sayfası (herkese açık içerik; kendi `og:*` meta'sı, sonra detaya yönlenir). Paylaş/linki kopyala eylemleri bu adresi verir; sayfası olmayan yeni içerik `404.html` → `NotFoundForwarder` ile detaya gider. `deploy.yml` her 6 saatte yeniden derler |

Giriş gerektirenler (`RequireAuth`): `/messages`, `/groups`, `/notifications`, `/saved`, `/stories/create`, `/stories/archive`,
`/following`, `/followers`, `/settings`, `/profile/edit`, `/my-content`.
Okuma herkese açıktır; yazma eylemleri misafire ortak giriş diyaloğunu açar.

---

## 6. Supabase Veri Modeli (özet)

Şema `supabase/migrations/` altındaki sıralı SQL dosyalarıdır (tek doğruluk
kaynağı); `supabase/README.md` uygulama talimatını içerir. Çekirdek tablolar:
`profiles`, `prompts` (+`prompt_media`, `prompt_tags`, `prompt_variables`,
`prompt_dna_sections`, `prompt_results`), `prompt_requests` (+medya/etiket),
`workflows` (+`workflow_steps/connections/media/tags`), `presets`
(+`preset_fields/options/tags`), `tags`, `taxonomy_categories/subcategories`,
`prompt_copy_events` (kopyalama sayacının günlük dedupe'u; yalnız RPC yazar), `tag_follows` (kullanıcı başına ≤100 etiket; `feed_page` kapsamı `tags`), `collection_follows` (herkese açık koleksiyon takibi, ≤200; `collections.follower_count` korumalı sayaç), `weekly_challenges` (moderatör yönetimli haftalık tema; yazma yalnız `admin_save_challenge`/`admin_archive_challenge`), `prompt_likes` / `prompt_comments` / `comment_likes` (hedef sütunlu
polimorfik: `prompt_id`/`request_id`/`workflow_id`/`preset_id` — tam biri dolu),
`collections` / `collection_items` ("Genel" = `is_default`, isimden bağımsız),
`prompt_versions` / `request_versions` / `workflow_versions` / `preset_versions` (sürüm geçmişi; yazma yalnız trigger/RPC, `docs/history/170-*`), `follows`, `conversations` / `conversation_members` / `messages` /
`message_reactions`, `pinned_messages` / `message_stars` (sabit/yıldız: yalnız başvuru, mesaj kopyalanmaz), `chat_groups` (+ `chat_group_join_requests/invitations/links/bans/audit`; id = grup konuşmasının id'si = **topluluğun id'si**) ve topluluk tabloları `community_posts/announcements/events/event_rsvps/rule_acceptances/reports`, `notifications`, `reports`, `blocks`,
`content_relations`, `content_edits`, `admin_audit_log`, hikâyeler: `stories` (+`story_views/reactions/poll_votes/question_answers`,
`story_highlights`+`story_highlight_items`, `story_drafts`; `messages.story_id`/`is_story_reply`; `profiles.story_archive_enabled`).

Kalıplar (yeni migration yazarken uy):
- **Sayaçlar** (`like_count`, `save_count`, `comment_count`, takipçi…) denormalize,
  `SECURITY DEFINER` trigger'larla tutulur — aksi hâlde RLS çapraz kullanıcı
  güncellemesini sessizce 0 satıra çevirir.
- **Güvenli silme:** FK'si `ON DELETE SET NULL` + `CHECK` çakışan tablolarda
  (yorum yanıtı, istek yanıtı, mesajda paylaşım) `BEFORE DELETE` trigger soft-delete
  yapar; istemci hep düz `DELETE` gönderir.
- **Bildirim üretimi** yalnızca sunucu trigger'larıyla (`notifications`'a
  istemci insert politikası yok); hedef `hl=<tür>:<id>` ile kesin içeriğe gider.
- **INSERT … RETURNING tuzağı:** SELECT politikası henüz var olmayan başka
  bir satıra bağlıysa id'yi istemcide üret (`crypto.randomUUID()`), `RETURNING`'e güvenme.
- **Sayaç sütunları istemciden yazılamaz:** yeni bir sayaç (`*_count`) eklenirse `protect_counter_columns()` trigger'ı bağlanır (`docs/history/169-*`) ve onu güncelleyen trigger `SECURITY DEFINER` olur (invoker ise korumaya takılıp sessizce sayamaz).
- **Sürüm geçmişi** dört türde ortak: üst içeriğin okunabilirliğini devralan SELECT, istemci yazma yok; Workflow/Hazır Ayar kaydı `save_*_content` RPC'sinden geçer, geri dönme yeni bir sahip düzenlemesidir (`docs/history/170-*`).
- **Topluluk gönderisi = normal içerikle BİREBİR aynı davranış** (`docs/history/184-*`): başvuru gönderisinin sayfası (`/communities/post/local`) başvurulan içeriğin NORMAL detay sayfasıdır (`PromptDetailView`/`RequestDetailView`/`WorkflowDetailView`/`PresetDetailView`; `PostScope` bağlamı) — ikinci bir detay yerleşimi yazılmaz. Etkileşim satırı ve yorumlar tek yerden çizilir (`content/scoped-engagement.tsx`: `Engage*`); bağlam varsa GÖNDERİNİN beğenisi/yorumu/kaydı/istatistiği/paylaşımı, yoksa içeriğin kendisi. Yeni bir detay etkileşimi eklerken `Engage*` ailesine ekle. **Kaydet**: yerel içerik normal kaydedilir (`collection_items.prompt_id/…`, yalnız topluluğu okuyabilen — `block_community_content_save`); başvuru gönderisinde GÖNDERİNİN kendisi kaydedilir (`collection_items.community_post_id`, `community_posts.save_count` korumalı sayaç; yerel gönderi ve istek başvurusu kaydedilemez — istek normal sitede de kaydedilemez). Kaydedilen gönderi okunamıyorsa (topluluktan çıkıldı/silindi) listelerde kendiliğinden görünmez. **Site içi mesajla paylaşım**: gönderi, workflow/hazır ayar gibi düz metin bloğuyla (`lib/community-post-share.ts`, yeni mesaj şeması yok); okuyamayan alıcı "erişimin olmalı" görür.
- **Kaydedildi = en az bir koleksiyonda** (`collection_items`; ikon, `/saved` ve kaydet penceresi aynı satırları okur). Üyelik yalnız `SaveToCollectionModal`'dan (taslak + "Kaydet") ya da bir koleksiyonun kendi "Koleksiyondan kaldır"ından değişir; bir koleksiyondan çıkarmak başka koleksiyona dokunmaz, "Genel" dahil. Toplu "her yerden kaldır" yoktur (`docs/history/168-*`).
- **Grup sohbeti** (`docs/history/172-*`) ayrı bir mesaj altyapısı DEĞİLDİR: grup = `conversations.kind='group'`, üyelik/rol/katılma zamanı/sessize alma `conversation_members`'ta, mesajlar `messages`'ta. Kurallar: (1) grup tablolarına istemci **yazamaz**, her yazma SECURITY DEFINER RPC'dir (`auth.uid()`, rol kontrolü, grup satırı `for update` kilidi); istemci üyelik satırını eklemez/silmez/rolünü değiştirmez (tetikleyici). (2) `conversation_members` grupta yalnız KENDİ satırımı gösterir; üye listesi `chat_group_members` RPC'si. (3) Mesaj okuma/yazma `can_read_message` / `can_send_message` ile (grupta `created_at >= joined_at`, `posting_policy`, engel = karşılıklı görünmezlik, yazma kilidi yok); birebir akışlar `kind='direct'` ile sınırlanır (yeni "ortak konuşma" sorgusu yazarken türü ayır). (4) Kapalı → açık görünürlük = tek atomik RPC, bekleyen başvurular güvenlik kurallarına uyanlar için kabul edilir, uymayanlar `pending` kalır ve nedeniyle raporlanır; hiçbir yol sessizce "kabul edildi" işaretlemez. (5) Davet bağlantısında ham token saklanmaz (yalnız SHA-256 özeti), `token_hash` istemciye verilmez. (6) Grup bildirimleri mevcut `system` türünü kullanır, mesaj başına bildirim yoktur. (7) Admin/moderatör yetkileri rol adına değil **yeteneğe** bağlıdır (`chat_groups.role_permissions`, `_group_can`/`chat_group_can`); yeni bir yönetim RPC'si/politikası yazarken rol listesi yerine yetenek kontrolü kullan; owner kısıtlanamaz, rütbe kuralları yetkiden bağımsızdır, yetkileri ve `history_visible`'ı yalnız owner değiştirir (`docs/history/173-*`).
- **Topluluklar** (`docs/history/175-*`) ayrı bir altyapı DEĞİLDİR: topluluk = `chat_groups` satırı = grup sohbeti (aynı üyelik/rol/mesaj). Kurallar: (1) yazma yolu yine yalnız SECURITY DEFINER RPC (kimlik `auth.uid()`, grup satırı `for update`, yetki **yetenek**le: `_group_can`/`_group_require_cap`; yeni yetenek eklerken `_group_all_capabilities()` + `_group_default_permissions()` + `lib/chat-groups.ts` üçü birlikte güncellenir); yeni topluluk tablolarına istemci yazamaz. (2) Gönderi içeriğin KOPYASI değil başvurusudur ve **yalnızca yayında + herkese açık** içerik paylaşılır — topluluk paylaşımı hiçbir içeriği otomatik herkese açmaz; içerik erişimi kendi RLS'inde kalır. (3) Okuma `can_read_community` (açık topluluk ya da üyelik); kapalı topluluğun içeriği/sohbeti/üye listesi üyelik olmadan okunamaz, varlığı sızmaz (`group_not_found`). (4) Bildirimler sınıflıdır (`_community_notify`: `direct` her zaman, `important` Sessiz'de gelmez, `info` yalnız Tümü'nde) ve üye başına tercihe uyar; mesaj başına bildirim yok. (5) Kapatılmış (`closed_at`) topluluk salt-okunurdur; silme ayrıdır. (6) Eski grup sohbetleri taşınmaz/silinmez: aynı satırlar `origin='legacy_group'` ile topluluktur; `community_migration_report()` salt-okunur envanter/anomali raporudur. (7) Etkinlik saatleri IANA saat dilimiyle saklanır; hatırlatma zamanlayıcısız, uygulama açılışında `dispatch_my_event_reminders()`.
- **Topluluk görünürlüğü** (`docs/history/176-*`): üç düzey — `public` (Keşfet + arama + açık içerik, doğrudan katılım), `restricted` "Kapalı" (Keşfet'te YOK, arama/öneride VAR, içerik yalnız üyelere, katılım `request_join_community` başvurusuyla), `private` "Tamamen kapalı" (hiçbir yerde yok, id ile bile bulunamaz, yalnız davet; eski `private` bu anlama gelir). Kurallar: (1) `can_read_community` yalnız `public` ya da üyeliği kabul eder — `restricted` satırın KARTI herkese okunur ama gönderi/duyuru/etkinlik/mesaj/üye listesi okunmaz; yeni bir "okunabilir" kontrolü yazarken `visibility <> 'private'` ile içerik erişimini karıştırma. (2) Arama/öneri RPC'leri `private`'i asla döndürmez ve `restricted` için içerik istatistiğini üye olmayana null verir. (3) "Kapatılmış" (`closed_at`, salt-okunur) ile "Kapalı" (`restricted`) farklı kavramlardır. (4) Topluluk "Kaydet"/yer imi YOKTUR; tek üyelik düğmesi `CommunityJoinButton`. (5) **`chat_groups` satırını yalnız ÜYE okur** (`created_by`, `pending_request_count`, `role_permissions`… sızmasın); üye olmayan (ziyaretçi, yabancı, davetli, başvuran) KARTI `community_cards()` RPC'sinden alır — istemcide üye olmayan için `chat_groups`'a doğrudan sorgu YAZMA, `fetchCommunityCard(s)` kullan. (6) Oturumsuz ziyaretçi (anon) yalnız herkese açık topluluğun gönderi/duyuru/etkinliğini ve keşif/arama/kartı okur; anon EXECUTE kapalı beyaz listededir (yeni topluluk fonksiyonu eklerken `revoke … from public, anon` yap, ziyaretçiye açılacaksa testteki beyaz listeye bilinçli ekle). (7) Topluluk görseli özel `community-avatars` bucket'ında (signed URL, `GroupAvatar`); kart görünür olduğu sürece okunur. (8) Üyelikten ayrılma/çıkarma ve topluluk silme o topluluğa bağlı eski bildirimleri siler.
- **Topluluk sayfası ↔ sohbet sorumluluk ayrımı** (`docs/history/183-*`, `docs/community-system.md`): sohbet bilgi penceresi (`GroupInfoModal`) **sekmesiz kompakt sohbet paneli**dir — topluluk yönetimi (istek/davet/rol/çıkarma/ad-görsel-görünürlük/silme) oraya EKLENMEZ, topluluk sayfasına bağlanır. Her ayarın tek evi: **A topluluk** (Yönetim → Ayarlar), **B sohbet** (`ChatSettingsSection`: kim yazar, geçmiş, üye sabitleme), **C kişisel** (sessize alma `ChatMuteToggle`, bildirim düzeyi, arşiv/listeden kaldır). Kişi yönetimi yalnız **Üyeler** sekmesinde; bölümler rol adına değil YETENEĞE göre (`membersSections`/`manageSections`, `lib/communities.ts`). Üyelik tek satırdır: "yalnız sohbetten ayrıl" YOKTUR (yerine sessize alma/listeden kaldır); topluluktan ayrılmanın TEK onayı `LeaveCommunityDialog`. Yeni yönetim ekranı yazarken önce A/B/C sınıfını belirle, aynı bileşeni iki yerde monte etme.
- **Topluluk gönderisi** (`docs/history/178-*`): her gönderi kendi kimliği, beğenisi ve yorumları olan bağımsız varlıktır — beğeni/yorum `prompt_likes.community_post_id` / `prompt_comments.community_post_id` (altıncı hedef; ayrı topluluk yorum tablosu YOK), sayaçlar `community_posts.like_count/comment_count`, işaret edilen içeriğin sayaçları ve yorumları etkilenmez. `kind`: `native` (içerik o toplulukta NORMAL oluşturma ekranıyla yaratıldı — `community_id` dolu içerik; gönderiyi tetikleyici ekler) · `application` (`share_to_community`, yalnız yayında+herkese açık, isteğe bağlı not) · `legacy` (178 öncesi satırlar; tür TAHMİN EDİLMEZ). Kurallar: (1) etkileşim yazımı yalnız üye + kapatılmamış topluluk (`enforce_community_post_engagement`), yanıt üst yorumla aynı hedefte; yeni bir etkileşim hedefi eklerken `handle_prompt_like_change` / `handle_prompt_comment_change` / bildirim tetikleyicilerindeki hedef zinciri AÇIK yazılır (son `else` sessizce `prompt_requests`'e düşmesin). (2) **Topluluğa özgü içerik** (`docs/history/179-*`): `prompts/prompt_requests/workflows/presets.community_id` dolu içerik topluluğa AİTTİR — sunucu görünürlüğü `private`a zorlar, taslak olmaz, `community_id` değişmez, okuma `can_read_community` ile (herkese açık toplulukta herkes, kapalıda üye), akışta NORMAL içerik kartı (kendi beğeni/yorumu; gönderi başına ayrı etkileşim YOK), yazarın profilinde/Keşfet/aramada/etiket/koleksiyonda görünmez, KAYDET + İSTATİSTİK + PAYLAŞ normal kartlardaki gibi vardır (`docs/history/184-*`: kaydedenin topluluğu okuyabilmesi şartıyla) (`docs/history/181-*`: bağlantı paylaşım sayfasına çevrilmez, içeriğin/gönderinin kendi adresidir), gönderiyi kaldırmak içeriği siler, topluluk silinince içerik de gider. **Yeni bir içerik LİSTESİ sorgusu (tablo okuyan istemci sorgusu ya da RPC) yazarken `community_id is null` süz** — `visibility='public'` süzmeyen sorgular RLS'e güvenir ve üyeye topluluk içeriğini gösterir. Başvuru içeriği AÇMAZ. (3) Oluşturma ekranında topluluk bağlamı yalnız `?community=` + ortak `CreateFormActions` ile taşınır (görünürlük anahtarı/taslak yok) — ikinci oluşturma formu yazılmaz. (4) Başvuru/legacy gönderi akışta normal kart ailesinde `ApplicationCard`'dır (altbilgi sayaçları ve İstatistik/Paylaş düğmeleri GÖNDERİNİN: `content_engagers` hedefi `community_post`); tıklayınca başvurunun kendi sayfası `/communities/post/local?id=` (`docs/history/180-*`) açılır: başvurulan içerik ayrıntılı, gönderinin kendi beğeni/yorumu (`PostEngagement`), orijinale `Orijinal içeriği aç`. Yerel içerik kartında ikinci menü/çubuk çizilmez; topluluk işleri `PostMenuExtras` ile kartın tek ⋮ menüsüne eklenir.
- **Topluluklar ana sayfası** (`docs/history/185-*`): akış/öneri/gözat kararları SUNUCUDA (SECURITY DEFINER, anon EXECUTE kapalı): `member_feed_page` (üye olunan `public`+`restricted`; `private` genel akışa asla girmez), `discover_feed_page` (görülmemiş + `can_read_community` + ilgi/çeşitlilik puanı, `p_as_of` ile oturum boyunca sabit), `recommend_communities`/`browse_communities` (`_community_relevance` — yalnız gerçek sinyal; `restricted` için içerik kaynaklı sinyal hesaplanmaz), görüldü verisi `community_post_views` (yazma yalnız `mark_community_posts_seen`). Yeni bir genel gönderi/topluluk listesi yazarken `private`'ı dışla ve kararı UI'a değil RPC'ye koy. "Takip" = kişi takibi (topluluk takibi yok). Kurallar `docs/community-system.md` → "Ana sayfa sıralama kuralları".
- **Sohbet geliştirmeleri** (`docs/history/174-*`): okundu = üye başına **tek imleç** (`last_read_at`, yalnız ileri, istemci yazamaz; yalnız `mark_conversation_read_up_to` ile, ekranda görünürken — eski `mark_conversation_read` yalnız sayaç sıfırlar, "okundu" sızdırmaz); "yazıyor" = Realtime Broadcast **private** kanal `typing:<konuşma>` + `realtime.messages` politikaları (kalıcı değil, Dashboard'da "Allow public access" kapalı olmalı); sabitleme yalnız `set_message_pinned` (grupta `pin_messages` yeteneği ya da owner'ın `members_can_pin` ayarı); arama/yıldız listesi SECURITY INVOKER (RLS atlanmaz); "mesaja atla" pencereli yükleme (`fetchMessageWindow`) — görünmeyen mesajın içeriği hiçbir yolla (hl/sabit/yıldız/arama) gösterilmez.
- **Hikâyeler** (`docs/history/198-*`): (1) görünürlük TEK yerde `_story_visible` — okuma/Storage/şerit/etkileşim/öne çıkan hepsi onu
  çağırır; yeni bir hikâye okuması yazarken kendi kuralını yazma. Topluluk hikâyesi yalnız ÜYEYE (herkese açık toplulukta da),
  takipçi hikâyesi yalnız takipçiye, engel iki yönlü. (2) Süresi dolan hikâye yalnız sahibine ve — bir öne çıkandaysa — ASIL kitlesine
  görünür; öne çıkan hiçbir hikâyeyi açmaz. Süre sunucu saati (`expires_at` yalnız `create_story` yazar), etkileşim yalnız etkinken.
  (3) Yazma yalnız RPC (`create_story` idempotent: `client_token`); istemci yalnız kendi hikâyesini/öne çıkanını siler ve kendi
  taslaklarını yazar. (4) Özel yanıt mevcut mesajlaşmadır (`reply_to_story`; istemci `story_id`'li mesaj yazamaz). (5) Medya PRIVATE
  `story-media`, yol `{kullanıcı}/{uuid}.{jpg|mp4|webm|mov}`; yeni bir medya sütunu/bucket'ı `orphan_storage_objects`'e eklenir.
  (6) Bağlantı içerik kopyası değil başvurudur; yalnız yayında + herkese açık + topluluğa ait olmayan içerik.
- Sahiplik kontrolü `.update().select().maybeSingle()` ile yapılır; "0 satır
  etkilendi" sessiz başarı sayılmaz.

---

## 7. Güvenlik Kuralları

- Service role key asla frontend'e konmaz, repoya eklenmez; `.env.example`
  tutulur, gerçek `.env` commit edilmez.
- Her tablo için RLS açık ve ayrı tasarlanır; admin/moderatör yetkisi yalnızca
  frontend kontrolüne dayanmaz (`is_moderator()` + RPC içinde `_admin_guard()`;
  `profiles.role` istemciden değiştirilemez).
- `SECURITY DEFINER` fonksiyonlarda `search_path` sabitlenir; istemcinin
  çağırmayacağı fonksiyonlardan `EXECUTE` kaldırılır (Bölüm 9.149 Faz 2).
- Kullanıcı girdileri doğrulanır; kullanıcı içeriği React ile kaçışlanır
  (`dangerouslySetInnerHTML` kullanılmaz).
- Gönderi medyası (`prompt-media`, `request-references`, `result-media`) PRIVATE
  bucket'tadır; dosya erişimi onu gösteren satırın görünürlüğüne bağlıdır
  (Storage policy, `docs/history/150-*`). Bu medya `getPublicUrl` adresiyle
  değil, `StorageImg`/`StorageImage`/`StorageVideo`/`StorageAudio`/
  `StorageBackground` (`components/ui/storage-media.tsx`, signed URL) ile
  gösterilir; DB'deki URL yalnızca kimliktir. `avatars` herkese açıktır.
- Hesap silme yalnızca `delete-account` Edge Function'ıyla olur: hedef daima doğrulanmış
  JWT'nin sahibidir (istemci kullanıcı kimliği veremez), kullanıcı adı sunucuda da
  doğrulanır, `delete_account_data` yalnız `service_role`'e açıktır; service role
  yalnızca o fonksiyonda bulunur.
- Kullanıcının AI API anahtarı (Studio) sunucuya/Supabase'e ASLA yazılmaz;
  yalnızca bellekte ya da (açık onayla) tarayıcıda tutulur.

---

## 8. Çalışma Düzeni (her göreve uygula)

1. **Önce mevcut mimariyi oku**, yalnızca gerçek eksikleri kapat; paralel
   sistem kurma. Aynı metin/bileşen/anahtar zaten varsa yeniden kullan.
2. **Bitirmeden önce:** `npx tsc --noEmit`, `npm run lint`, `npm test`,
   `npm run build` temiz olmalı. Raporda İngilizce karşılıkların eklenip
   eklenmediği açıkça yazılır (Bölüm 4.5).
3. **Dürüst raporlama:** bu sandbox `*.supabase.co`'ya doğrudan erişemez;
   testler ağ taklitli Playwright ve yerel PostgreSQL ile yapılır. Gerçek
   Supabase'e/fiziksel cihaza karşı denenmeyen şey "denenmedi" diye yazılır.
   Supabase MCP bağlıysa şema/veri kontrolü ve migration uygulaması onunla yapılır.
4. **Migration'lar** `supabase/migrations/` altına eklenir; canlıya uygulanıp
   uygulanmadığı raporda belirtilir. Yıkıcı (`drop`) SQL için kullanıcı onayı gerekir.
5. **Dokümantasyon:** yeni bir özellik/karar için `docs/history/NNN-konu.md`
   dosyası ekle (`docs/history/README.md` tablosuna satır ekle) — **bu dosyaya
   anlatı ekleme.** Bu dosyayı yalnızca kalıcı kural, güncel rota/tablo/mimari
   değişince ve "Açık işler" listesini güncellemek için düzenle.
6. Yeni kod mevcut stilini izler: token'lar (hex yok), ortak bileşenler, i18n
   anahtarları, kod yorumu yoğunluğu.
7. **Fotoğraf yükleyen her alan** `src/lib/image-processing.ts`'ten geçer (`resizeImageToBlob` /
   `resizeImageToSquareBlob` / `resizeImageToCoverBlob` / `prepareMessageImage`): ağır fotoğraf
   REDDEDİLMEZ, bayt bütçesine kadar otomatik küçülür; tek sınır kaynak tavanıdır
   (`IMAGE_SOURCE_MAX_BYTES`, 40 MB). Alan başına ayrı MB sınırı/mesajı yazılmaz; seçicide
   `imageSourceProblem(file)` kullan (`docs/history/191-*`).
8. **Depolamadaki bir adresi doğrulayan SQL** (`_group_valid_avatar`, `_group_valid_cover`…) bucket
   değişince birlikte güncellenir; istemci yeni bucket'a yazıp sunucu eskisini bekliyorsa kayıt
   sessizce reddedilir (177'den sonra topluluk görseli böyle bozuldu). Yeni bir görsel sütunu
   eklenirse `orphan_storage_objects` listesine de eklenir (yoksa yetim süpürücü dosyayı siler).
9. **Kök layout'a elle `<head>` + satır içi betik EKLEME** (`src/app/layout.tsx`): tekrar yüklemelerde React #418 ile tüm belgeyi yeniden kurar (`docs/history/192-*`). İlk boyama öncesi çalışacak betikler `<body>`'nin ilk çocuğu olarak düz `<script>` konur; `next/script` `beforeInteractive` ilk boyamadan sonra çalıştığı için bu iş için uygun değildir.
10. **Kimlik değişince bellek sıfırlanır** (`features/auth/auth-provider.tsx`): kullanıcı A→B ya da çıkış olunca sayfa baştan yüklenir; yeni bir modül düzeyi önbellek/depo eklenirse ayrıca temizleme yazma, bu kural onu da kapsar. Yeni bir "kim neyi beğendi / etiketledi" gibi hedefe bağlı tablo yazarken SELECT politikasını `using (true)` YAPMA — hedefin okunabilirliğini izlet (`docs/history/195-*`).

---

## 9. Güncel Durum ve Açık İşler

**Durum:** Uygulama uçtan uca gerçek Supabase verisiyle çalışır.
Canlı projede (kontrol: bu oturum) 20 profil (18 demo hesap), 148 prompt (+43 topluluğa özgü), 15 topluluk (aliq sahip; `docs/history/182-*`),
39 istek, 12 workflow, 35 hazır ayar, 802 DNA bölümü bulunur; içerik
`supabase/seed/` altındaki viral/topluluk seed'lerinden gelir. Bölüm 1–8
bağlayıcıdır; ayrıntılı gerekçe için `docs/history/README.md` tablosuna bak.

**Açık işler (kullanıcı/yönetici adımı veya bilinen boşluk):**
- Hikâyeler (`docs/history/198-*`): `20260920170000_stories.sql` (+ isteğe bağlı `20260920170100_stories_cron.sql`, `pg_cron` varsa
  saatlik saklama işi) repoda, yerel PostgreSQL'de sınandı (`stories.sql` 65 kontrol; önceki 16 dosya `FAILED=0`), **canlıya
  UYGULANMADI** — ÖNCE migration, SONRA istemci (yeni istemci `messages.story_id`'yi seçer; migration yoksa mesajlaşma da hata
  verir). `drop` yok. Gerçek Supabase'e / cihaza / gerçek videoya karşı denenmedi; sunucu tarafı video dönüştürme/küçük resim yok;
  `pg_cron` yoksa temizlik işi Dashboard'dan kurulmalı; yetim dosyalar moderatörün çalıştırdığı `cleanup-orphan-storage` ile silinir.
- Meydan yeniden tasarımı (`docs/history/190-*`): Faz 1 (tema, yan menü, Ana Sayfa, prompt kartında prompt metni) ve Faz 2 (Keşfet, Profil — tek sekme satırı, Topluluk sayfası başlığı) ana dalda; Faz 3 (sade `PageHeader`, Topluluklar ana sayfası, detay görseli sınırı) ana dalda; Faz 4 (Ayarlar bölüm menüsü, Bildirimler gün grupları) ana dalda; Faz 5 (gönderi kartları C düzeninde, `ContentCardPost`) ana dalda; Faz 6 (kutusuz akış, tek sütun topluluk akışı + yan sütun, profil kullanım toplamı, Keşfet "Bu hafta popüler") ana dalda; Faz 6 eki (telefonda tüm gönderi listeleri düz akış, `ContentGrid`) ana dalda; Faz 6 eki 2 (Ana Sayfa ve Topluluklar da tablet/masaüstünde Keşfet gibi kutulu ızgara) ana dalda; Faz 6 eki 3 (Kart | Odak seçicisi bütün kart sayfalarında) ana dalda; `20260920140000_meydan_palette.sql` (yalnız palet kısıtı genişletme) **canlıya UYGULANDI** (kullanıcı onayıyla, MCP `execute_sql`, tek işlem; `schema_migrations`'a dosya sürümüyle kayıt düşüldü; mevcut 20 satır korundu). Ağ taklitli ekran görüntüleriyle bakıldı; gerçek Supabase/oturum/cihazla denenmedi. Aralıklı React #418 hidrasyon hatasının kök nedeni bulundu ve giderildi (`docs/history/192-*`: kök layout'taki elle yazılmış `<head>` + satır içi betikler → betikler `<body>`'nin başına taşındı); hidrasyon denetimi filtresiz tüm UI paketleri geçer. Faz 7 (profilde herkese açık koleksiyon halkaları, Mesajlar liste satırları, `docs/history/192-*`) ana dalda; mobil alt menü tarayıcı çubuğu rengi (`docs/history/193-*`) ana dalda, iPhone Safari'de denenmedi; mobilde açık sohbette alt menü gizli (`docs/history/194-*`). Hepsi yalnız istemci kodu, gerçek Supabase/cihazla denenmedi.
- Kapalı topluluk sızıntı denetimi + sohbet kartları (`docs/history/195-*`): `20260920160000_engagement_read_follows_target.sql` (beğeni/yorum beğenisi/istek etiketi okuması hedefi izler) yerel PostgreSQL'de sınandı (`engagement-privacy.sql` 12 kontrol; 16 SQL dosyası `FAILED=0`) ve **canlıya UYGULANDI** (kullanıcı onayıyla, MCP `execute_sql`; `drop policy` aracın onay beklemesine takıldığı için aynı son durum `ALTER POLICY` ile uygulandı; `schema_migrations`'a dosya sürümüyle kayıt düşüldü; canlıda `ali`/ziyaretçi/üye gözüyle doğrulandı: üye olmayana kapalı topluluk beğenileri 91→0). İstemci: hesap değişince/çıkışta sayfa yenilenir, sohbet kartları sahip adı + gizli içerik metni, yanıt çubuğunda küçük görsel. Gerçek Supabase'e karşı denenmedi.
- Topluluk kapağı + görsel yükleme düzeltmesi + otomatik küçültme (`docs/history/191-*`): `20260920150000_community_cover_and_avatar_url.sql` yerel PostgreSQL'de sınandı (`community-cover.sql` 15 kontrol) ve **canlıya UYGULANDI** (kullanıcı onayıyla, MCP `execute_sql` ile parça parça; yalnızca ekleyici/değiştirici, `drop` yok; `schema_migrations`'a dosya sürümüyle kayıt düşüldü; sütunlar, doğrulayıcılar, yetkiler canlıda salt-okunur sorguyla doğrulandı). Gerçek Storage'a / telefondaki gerçek fotoğrafa karşı denenmedi.
- **Not (durum satırları):** aşağıdaki topluluk migration'ları (174–185) için "canlıya UYGULANMADI" notları ESKİ olabilir — canlı şemada topluluk RPC'leri, `community-avatars` bucket'ı ve politikaları mevcut (bu oturumda `execute_sql` ile görüldü) ama `schema_migrations`'a kayıtları yok. Bir şeyin canlıda olup olmadığına bu notlara değil canlı şemaya bak.
- **Google ile giriş:** kod ve `handle_new_user` migration'ı hazır/canlıda
  (`docs/history/155-*`), ama Google sağlayıcısı Supabase'de etkinleştirilene kadar
  buton hata verir: Google Cloud'da OAuth istemcisi + Supabase Dashboard → Authentication
  → Providers → Google (adımlar `supabase/README.md` → "Google ile giriş kurulumu").
  OAuth yönlendirmesi Google/Supabase'e karşı denenmedi.
- Supabase Dashboard → Authentication → Providers → Email: **"Leaked password
  protection"** ücretli planda; şimdilik gerekmiyor, bilinçli olarak ertelendi.
- `docs/history/157-*` işleri canlıda: `20260919820000` (`feed_page` `oldest` /
  `p_open_only`), `20260919830000` (`auth_login_attempt`) ve `20260919840000`
  (`prompt_saves` DROP; kullanıcı SQL Editor'den uyguladı, canlıda tablo yok,
  `collections` / `collection_items` / `prompt_likes` yerinde) uygulandı;
  `username-login` v2 MCP ile deploy edildi (`verify_jwt` KAPALI). Yeni
  `username-login` canlı istekle DENENMEDİ (sandbox Supabase'e erişemez); sitedeki
  kullanıcı adı girişi ve uzantı girişi elle doğrulanmalı. `feed_page`'in eski 10
  argümanlı imzası, `drop function` onayı olmadığı için ince sarmalayıcı olarak
  kaldı. `deploy-functions.yml` hiç çalıştırılmadı (secret'lar
  `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` tanımlı değilse fail eder).
- @bahsetme (`docs/history/165-*`) ve koleksiyon takibi (`docs/history/166-*`): migration'lar canlıda (yalnızca ekleyici, `drop` yok); anma bildirimi mevcut `comment` türünü kullanır (kısıt genişletilmedi). Gerçek oturumla uçtan uca denenmedi.
- Sohbet geliştirmeleri (`docs/history/174-*`, `docs/yapilacaklar.md` madde 14): `20260920010000` + `20260920020000` + `20260920030000` repoda, yerel PostgreSQL'de sınandı (67 kontrol), **canlıya UYGULANMADI** — önce migration, sonra istemci kodu (istemci `members_can_pin` sütununu okur). Realtime private kanal politikaları ve "yazıyor"/okundu canlı akışı gerçek Supabase'e / cihaza karşı denenmedi (yalnız WebSocket taklidiyle); "Delivered" durumu ve okundu gizlilik ayarı yok; "yazıyor" `userId` beyana dayalı.
- Grup sohbeti ve topluluk (`docs/history/172-*`, madde 13): `20260919980000` + `20260919990000` canlıda (kullanıcı uyguladı). Grup yetkileri + geçmiş görünürlüğü (`docs/history/173-*`): `20260920000000` repoda, yerel PostgreSQL'de sınandı (23 kontrol), **canlıya UYGULANMADI** — önce migration, sonra istemci kodu (yeni istemci `role_permissions`/`history_visible` sütunlarını okur).
- Topluluk gönderisi etkileşimi (`docs/history/178-*`, madde 18): `20260920090000` **canlıda** (kullanıcı uyguladı; nesneler salt-okunur sorguyla doğrulandı: kısıtlar, 7 tetikleyici, dizinler, politikalar, 2 legacy gönderi). Gerçek oturumla / Realtime'la / cihazla uçtan uca denenmedi.
- Topluluk ana sayfası/Keşfet (`docs/history/185-*`): `20260920130000_community_home_feed.sql` repoda (yalnızca ekleyici: `community_post_views` + 5 RPC + 2 iç yardımcı, `drop` yok), yerel PostgreSQL'de sınandı (`community-home.sql` 39 kontrol, mutasyon denemeli; önceki SQL dosyaları `FAILED=0`), arayüz ağ taklitli Playwright'ta, **canlıya UYGULANMADI** — önce migration, sonra istemci (yeni istemci bu RPC'leri çağırır; yoksa Gönderiler/Keşfet/Tüm topluluklar hata kutusu gösterir). Gerçek Supabase'e / oturuma / cihaza karşı ve gerçek veriyle sıralama kalitesi denenmedi; sıralama sabitleri elle seçildi.
- Topluluk gönderisi eşitliği (`docs/history/184-*`): `20260920120000_community_post_save.sql` **canlıya UYGULANDI** (kullanıcı onayıyla, MCP `execute_sql` ile parça parça; `apply_migration` 60 sn zaman aşımına düştü — bkz. belge; yalnızca ekleyici + `collection_items_exactly_one_target` CHECK'inin genişletilmesi, 296 mevcut satır korundu; `schema_migrations`'a dosya sürümüyle kayıt düşüldü). Yerel PostgreSQL'de `community-post-save.sql` (27 kontrol) + önceki topluluk SQL dosyaları `FAILED=0`; arayüz ağ taklitli Playwright'ta. Gerçek oturumla/cihazla denenmedi.
- Topluluk/sohbet yeniden düzeni (`docs/history/183-*`, `docs/community-system.md`): **yalnız istemci kodu, migration YOK**; ağ+Realtime taklitli Playwright'ta (`run-groups` 36, `run-communities` 61, `run-community-posts` 30, `run-chat` 35) sınandı, gerçek Supabase'e/oturuma/cihaza karşı denenmedi. Açık: rol değişikliği için bildirim yok (migration ister); kabul/ret/davet bildirimlerinin SQL adresleri eski rotalarda (istemci yönlendirir); paylaşılan `Modal` aşağı çekerek kapatmayı desteklemiyor.
- Topluluk istatistik/paylaş (`docs/history/181-*`, madde 20): `20260920110000_community_statistics.sql` repoda, yerel PostgreSQL'de sınandı (`community-statistics.sql` 10 kontrol), **canlıya UYGULANMADI** — 179'un migration'ından SONRA, istemciden ÖNCE uygulanmalı (yalnızca `create or replace`, `drop` yok); yoksa yerel kartın İstatistik listesi yazar dışında boş, başvuru gönderisinin istatistiği hata verir. Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.
- Topluluğa özgü içerik (`docs/history/179-*`, madde 19): `20260920100000_community_content.sql` repoda, yerel PostgreSQL'de sınandı (`community-content.sql` 41 kontrol; 17 mutasyon denemesi hepsi yakalandı; önceki SQL dosyaları `FAILED=0`), ağ taklitli Playwright, **canlıya UYGULANMADI** — 178'den SONRA; önce migration (yalnızca ekleyici/değiştirici, `drop` yok), sonra istemci (eski istemci `community_id` göndermez ve 178'in yerel-gönderi RPC'sini çağırır: o RPC artık çalışmaz). 178'in "private içerik + yerel gönderi" yaklaşımının yerini alır. Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.
- Topluluk gizliliği (`docs/history/177-*`, `docs/yapilacaklar.md` madde 17): `20260920080000_community_privacy_hardening.sql` repoda, yerel PostgreSQL'de sınandı (`community-privacy.sql` 79 kontrol: 3 düzey × 9 aktör × 19 kanal matrisi + yazma/davet/geçiş/DM/Storage; 13 mutasyon denemesi), **canlıya UYGULANMADI** — 176'dan SONRA uygulanmalı; önce migration, sonra istemci (yeni istemci üye olmayan için `chat_groups` yerine `community_cards` kullanır, eski istemci üye olmayanlarda "bulunamadı" gösterir). Gerçek Supabase'e / oturuma / cihaza karşı denenmedi; eski görseller ortak `avatars` bucket'ında kalır (`community_legacy_avatar_report()`); etkinlik konum/bağlantısı herkese açık toplulukta ziyaretçiye görünür.
- Topluluk görünürlüğü (`docs/history/176-*`, `docs/yapilacaklar.md` madde 16): `20260920070000_community_visibility.sql` repoda, yerel PostgreSQL'de sınandı (`communities.sql` 123 kontrol), **canlıya UYGULANMADI** — 175'in üç migration'ından SONRA uygulanmalı; içerdiği iki `drop` (canlıya hiç girmemiş `community_bookmarks` tablosu + `set_community_bookmark`, ve dönüş tipi değiştiği için `list_my_communities`) kullanıcı onayıyla yazıldı. Önce migration, sonra istemci kodu. Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.
- Topluluklar (`docs/history/175-*`, `docs/yapilacaklar.md` madde 15): `20260920040000` + `050000` + `060000` repoda, yerel PostgreSQL'de sınandı (`supabase/tests/communities.sql`, 101 kontrol), **canlıya UYGULANMADI** — önce migration (yalnızca ekleyici; `drop` yok), sonra istemci kodu (yeni istemci `chat_groups`'un yeni sütunlarını okur). Uygulama öncesi/sonrası `community_migration_report()` anomali listeleri boş olmalı. Gerçek Supabase'e / oturuma / Realtime'a / cihaza karşı denenmedi; Sohbet sekmesi sohbeti gömmez (Mesajlar'a bağlar); etkinlik hatırlatması uygulama açılışında üretilir (push/zamanlayıcı yok); eski SQL bildirim cümleleri "grup" kalır.
- Grup sohbeti — kalan notlar: gerçek Realtime'a / oturuma / cihaza karşı denenmedi; paylaşılan `Modal` odak tuzağı kurmaz; "grubu kapat" (salt-okunur) yok, yalnız silme.
- Kaydedilenler/koleksiyon akışı (`docs/history/168-*`): yalnız istemci kodu, veritabanı değişikliği yok; DB tarafı yerel PostgreSQL'de (`supabase/tests/saved-collections.sql`), arayüz ağ taklitli Playwright'ta denendi. Gerçek Supabase'e/cihaza karşı denenmedi. `remove_*_from_saved_everywhere` RPC'leri artık çağrılmıyor ama DB'de duruyor (`drop` için onay gerekir).
- Mesajlaşma arşiv/sil/temizle + Yeni sohbet (`docs/history/171-*`): kişiye özel `conversation_members.archived_at/deleted_at/cleared_at` + `filter_messageable_users`; `20260919970000` repoda, yerelde sınandı, **canlıya UYGULANMADI** (önce migration, sonra istemci kodu). Gerçek Supabase'e/cihaza karşı denenmedi.
- Sürüm geçmişi (`docs/history/170-*`, `docs/yapilacaklar.md` madde 9): `20260919940000`/`950000`/`960000` migration'ları repoda, yerelde sınandı, **canlıya UYGULANMADI** — önce migration, sonra istemci kodu (yeni istemci varolan workflow/hazır ayarı `save_*_content` RPC'siyle kaydeder).
- Sayaç koruması (`docs/history/169-*`, `docs/yapilacaklar.md` madde 12): `20260919920000` + `20260919930000` canlıda (yalnızca ekleyici/değiştirici); korunmayan sayaç kalmadı. Gerçek istemci oturumuyla uçtan uca denenmedi (canlıda geri alınan işlemle doğrulandı).
- PWA (`docs/history/163-*`) ve Workflow adım adım modu (`docs/history/164-*`): yalnız istemci kodu, veritabanı değişikliği yok. Gerçek cihazda "ana ekrana ekle" ve kurulu uygulamada Google girişi denenmedi.
- Haftalık tema (`docs/history/162-*`): `weekly_challenges` + moderatör RPC'leri canlıda (yalnızca ekleyici); canlıda henüz tema yok — moderatör `/moderation → Temalar`'dan oluşturur. Gerçek oturumla uçtan uca denenmedi.
- Etiket takibi (`docs/history/161-*`): `tag_follows` + `feed_page` `tags` kapsamı canlıda; yalnızca ekleyici, aynı imza. Gerçek oturumla uçtan uca denenmedi.
- Kopyalama sayacı (`docs/history/160-*`): `prompts.copy_count` + `record_prompt_copy` canlıda; yalnızca oturumlu kullanıcı, günde bir, yazarın kendisi sayılmaz. Keşfet → Promptlar'da ayrı "En çok kullanılan" sıralaması var (`feed_page` `p_order='used'`); `Popüler` hâlâ yalnızca beğeni.
- Paylaşım önizlemesi (`docs/history/159-*`): `og:image` her zaman site kartı (gönderi medyası private); yeni içeriğin önizlemesi en geç 6 saat sonra. Gerçek sosyal ağ tarayıcılarıyla denenmedi.
- Migration geçmişi uzlaştırıldı (`docs/history/158-*`): repo temiz DB'de baştan
  oynatılınca canlı şemayla birebir eşit; `schema_migrations`'a 79 repo-sürümlü kayıt
  eklendi. Canlıda ayrıca 48 MCP-sürümlü satır duruyor, `supabase db push` hâlâ
  güvenilir değil (güvenli hatayla durur). Yeni migration'ı uygularken kaydı dosya
  sürümüyle düş; MCP `apply_migration` ayrı zaman damgası yazar.
- Bilinçli sınırlar: Signed URL 10 dk geçerli kalır (private'a çevrilmeden önce
  alınmış bir imza süresi dolana kadar çalışır); Supabase CDN'in eski genel medya
  yanıtlarını ne kadar süre servis ettiği bilinmiyor.

**Tamamlananlar (bu turda kapatıldı):**
- Gönderi medyası private bucket + signed URL (`docs/history/150-*`): migration
  canlıda, `private_media_buckets` olarak kayıtlı.
- `delete_account_data` canlıda, `delete-account` Edge Function deploy edildi
  (v1, `verify_jwt` açık — `docs/history/154-*`). Edge Function'ların dördü de canlıda
  ve repoyla uyumlu (`analyze-image` v5, `username-login` v1 `verify_jwt` KAPALI —
  doğru, `cleanup-orphan-storage` v1, `delete-account` v1).
- `20260919640000_remove_studio.sql` uygulandı: `studio_sessions` /
  `studio_session_versions` canlıda artık yok (kontrol edildi).
- Yetim Storage dosyaları: son kontrolde (`orphan_storage_objects`) 0 yetim dosya.
- Hesap silmenin test hesabıyla uçtan uca denemesi ve tarayıcıdaki elle kontroller
  (private medyada eski genel URL'nin hata vermesi, Takip/arama/Benzer akışları)
  kullanıcı tarafından yapıldığı bildirildi; bu oturumda ayrıca doğrulanmadı.
- Bilinen sınırlamalar: Keşfet içerik bölümleri, Ana Sayfa ve liste sayfaları
  gerçek keyset sayfalama kullanır (Keşfet'te "En çok beğenilen" tüm türlerde `like_count`; Ana Sayfa'da kişiselleştirme
  yoktur, sekme dürüstçe "En yeni"dir); arama prompt metnini (`prompt_text`) ve
  isteğin `creative_direction`'ını da kapsar ve keyset sayfalanır (`search_content`); `prompt_saves` canlıdan kaldırıldı; kod içi
  yorumlarda eski "Bölüm 9.x" atıfları arşiv numaralarına (`docs/history/NNN-*`) karşılık gelir.

**Arşiv:** [`docs/history/README.md`](docs/history/README.md) — 207 bölüm, her
biri için durum etiketi (uygulandı / kısmen geçerli / kaldırıldı).
