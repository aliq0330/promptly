# 190 — Meydan yeniden tasarımı (Faz 1: tema + kabuk + Ana Sayfa · Faz 2: Keşfet, Profil, Topluluk · Faz 3: başlıklar, Topluluklar, detay · Faz 4: Ayarlar, Bildirimler · Faz 5: gönderi kartları · Faz 6: kutusuz akış, topluluk sayfası, profil, Keşfet)

**Durum:** istemci kodu repoda; `20260920140000_meydan_palette.sql` **canlıya UYGULANDI** (kullanıcı onayıyla, MCP `execute_sql` ile tek işlemde; `schema_migrations`'a `20260920140000` / `meydan_palette` kaydı; öncesinde canlıda `mono` 2, `sand` 2, boş 16 satır vardı, hepsi yeni listede). Ağ taklitli Playwright ekran görüntüleriyle (açık/koyu, 1440/390) bakıldı; gerçek Supabase'e, oturuma ve cihaza karşı denenmedi.

## Karar

Kullanıcı, mevcut ekranların ekran görüntüleri ve üç tasarım yönü (A · Galeri, B · Atölye, C · Meydan; tuval: claude.ai artifact "Promptly Yeniden Tasarım") arasından **C · Meydan**'ı seçti: parlak, sosyal akış, topluluk öncelikli. Faz 1 temeli ve Ana Sayfa'yı kapsar; Keşfet, Profil ve Topluluk sayfaları sonraki fazlarda bu temele göre yeniden düzenlenecek.

## Yapılanlar

**Tema (`globals.css`, `layout.tsx`, `theme-provider.tsx`)**
- Yeni palet `meydan`: beyaza yakın zemin, kobalt birincil (`#2f5bea`, koyu modda `#7d9bff`), sıcak turuncu ikincil (`#c2531f` / `#ff9a6b`; topluluk halkaları, küçük vurgular). İki modda da tam token seti; metin/zemin çiftleri AA ≥ 4.5:1 (birincil metin `primary-soft` üstünde ≈ 4.9:1).
- **Varsayılan palet artık `meydan`** (`DEFAULT_PALETTE`, `:root:not([data-palette])`). Diğer beş palet seçilebilir kalır; daha önce palet seçmiş hesaplar kendi seçimlerini korur.
- Yazı tipleri: gövde **DM Sans**, başlıklar/wordmark **Bricolage Grotesque**, prompt metni JetBrains Mono (değişmedi). Newsreader (serif) kaldırıldı; `--font-serif` artık display yüzünün takma adı, böylece mevcut `font-serif` kullanımları kırılmadı. `text-display/h1/h2` display yüzünde, 700 ağırlık, daha sıkı harf aralığı.
- Köşe yarıçapı: `md` 12px, `lg` 16px (kartlar), `xl` 22px. `Button` artık hap biçimli (`rounded-full`, `font-semibold`).

**Kabuk**
- Yan menü: 44px öğeler, 15px etiket, etkin öğe = yumuşak birincil hap (`bg-primary-soft text-primary`, kenar çubuğu yok), "Oluştur" tam genişlik hap. Wordmark display yüzünde.

**Ana Sayfa (`app/(app)/page.tsx`)**
- Tek sosyal sütun (≤640px) + `xl`'de 320px sağ sütun (`HomeRail`): haftalık tema, **Gündemde** (`trending_tags`, yalnız gerçek veri), **Takip etmeyi dene** (en çok takipçili profiller, kendin hariç, `FollowButton`). Boş/başarısız blok gizlenir. `xl` altında haftalık tema sütunun içine iner.
- Oturumlu kullanıcıda karşılama kartı yerine **paylaşım satırı** (avatar + "Bugün ne ürettin?" alanı → `/create?mode=prompt` + Prompt paylaş / İstek aç).
- **Topluluk halkaları** (`CommunityRings`): `list_my_communities('member')`; okunmamış etkinliği olan topluluk turuncu halkalı, son öğe "Topluluk bul" → `/communities/all`. Yalnız üyeye; hata olursa şerit gizlenir.
- Akış `layout="stream"`: tek sütun kartlar (`FeedGrid`), tam genişlik eşit alt çizgili sekmeler, altında tür çipleri + kompakt Filtre (`ListToolbar stream`); akışta Kart/Odak seçimi yok (her zaman kart).

**Kartlar**
- `PromptCard` artık prompt metnini ortak mono blokta gösterir (`PromptPreviewBox`, 3 satır, "Kopyala" → `record_prompt_copy`). Önceki "prompt metni kartta yok" kararı Meydan ile değişti. Bu, prompt kartı kullanılan her listeyi etkiler.

**Veritabanı**
- `20260920140000_meydan_palette.sql`: `profiles_theme_palette_check` kısıtına `'meydan'` eklenir (yalnız kısıt genişletme; satırlara dokunmaz, `mono` migration'ıyla aynı kalıp). Palet hiç seçmemiş hesaplar etkilenmez (varsayılan zaten Meydan).

## Faz 2 — Keşfet, Profil, Topluluk sayfası

**Keşfet (`/discover`)**
- Resimli başlık kartı kaldırıldı; düz, büyük başlık + açıklama.
- Arama kutusu (`AdvancedSearchBox`, `/search` ile ortak) hap biçimli, `surface-soft` zeminli.
- **İçerik türü kutuları** (Görsel / Metin / Ses / Video): aşağıdaki taksonomi filtresini (`contentType`) açıp kapatan büyük düğmeler (`aria-pressed`); ayrı bir filtre durumu yok, çiplerle aynı değer.
- "Trend" etiketleri başlıklı bir bölüm ve dolgulu haplar.
- Oturumlu kullanıcıya **Sana uygun topluluklar** şeridi (Topluluklar → Keşfet'teki `SuggestionStrip` aynen; `recommend_communities` yoksa/boşsa şerit çizilmez). Tekrar azaltma kaydı iki sayfada ortaktır.

**Profil**
- Kart yok: halkalı büyük avatar (`border-secondary`), ad + eylemler yan yana, istatistikler tek satır ("4 gönderi · 1,3B takipçi · 312 takip"), sonra biyografi ve ilgi alanları; mobilde ortalanmış.
- **Tek sekme satırı**: Promptlar · Prompt İstekleri · Workflow'lar · Hazır Ayarlar (+ sahibine Taslaklar · Kaydedilenler · Beğeniler, ziyaretçiye herkese açık Koleksiyonlar) · Hakkında. İç içe "Gönderiler" satırı ve iki kez görünen "Hazır Ayarlar" kalktı; Hazır Ayarlar sekmesi `ProfilePresetsPanel` (oluşturulan + sahibine kaydedilen). `ProfileTabKey` buna göre değişti.
- Katkı haritası başlığın altındaki tam genişlik karttan **Hakkında** sekmesine taşındı.

**Topluluk sayfası**
- Başlık: üstte kapak bandı (toplulukların ayrı kapak görseli yok — topluluk görseli büyütülüp bulanıklaştırılır, signed URL; görsel yoksa `primary-soft` bant), banda taşan 88px yuvarlak-kare avatar, `text-h2` başlık, rozetler, eylemler; açıklama altta.
- Sekmeler yeni `Tabs variant="pill"` ile ayrı haplar (seçili dolgulu). `data-testid="community-header"` ve diğer test öznitelikleri korundu.

**Sınama:** ağ taklitli ekran görüntüleri (1440/390). Playwright: `run-communities` 55/61, `run-groups` 34/36, `run-community-posts` 30/36, `run-community-home` 32/38 — başarısızların **tamamı** "no uncaught page errors" denetiminde yakalanan aralıklı React #418 (hidrasyon) hatası; aynı paket Faz 2 olmadan da rastgele senaryolarda düşüyor (`run-communities` 52/61), yani bu fazın gerilemesi değil. Kökeni (yalnız bu sandbox'taki webpack derlemesi mi, gerçek bir hidrasyon uyumsuzluğu mu) araştırılmadı.

## Faz 3 — sayfa başlıkları, Topluluklar ana sayfası, detay

- **`PageHeader`**: resimli başlık kartı tamamen kalktı (Promptlar, İstekler, Workflow'lar, Hazır Ayarlar listeleri); her yerde sade, büyük, kalın başlık. `art` prop'u ve kullanılmayan `components/ui/header-art.tsx` silindi.
- **Topluluklar ana sayfası (`/communities`)**: `CommunityPageHeader` büyük kalın başlık (ikon yok), sekmeler `Tabs variant="pill"`, sağ sütun kartları ana sayfanın sağ sütunu gibi (`bg-surface-soft`, kenarlıksız, display başlıklar), "Tüm topluluklar" hap bağlantı.
- **Topluluk sayfası**: kapak bandı inceltildi (`h-20 sm:h-24`) — başlık akışı ilk ekrandan itmesin. `run-community-home` 26b'deki başlık yüksekliği eşiği bilinçli olarak yükseltildi (1440: ≤230px, mobil: ≤360px; önceki "kompakt başlık" eşiği bant öncesine göreydi).
- **Detay sayfaları**: çıktı görselinin azami yüksekliği 540 → 460px (mobil 440 → 360) — prompt bloğu daha yukarıda. Yaratıcı kartındaki ad display yüzünde.
- Kalan `font-serif` kullanımları (giriş ekranı wordmark'ı, İlişki Haritası / yasal sayfa başlıkları, tanıtım turu) display yüzüne geçti; `--font-serif` yalnız geriye uyum takma adı.

### Aralıklı React #418 (hidrasyon) — teşhis, çözülmedi
- Belirti: UI testlerinde rastgele senaryolarda "Minified React error #418". `next build --debug-prerender` (küçültmesiz) ile tam metin alındı: istemci, gövdede `AppShell` kök `<div className="flex min-h-screen">`'i beklerken DOM'da o konumda `<meta charset="utf-8">` buluyor ("server rendered HTML didn't match"). React ağacı istemcide yeniden kurar (kurtarılabilir; sayfa çalışır, yalnız gereksiz yeniden çizim — `language-provider.tsx`'teki yorum bu kurtarmayı zaten anıyor).
- Statik HTML'de `meta` `<head>`'de, gövdede Next'in akışlı metadata sınırı (`<div hidden><!--$--><!--/$--></div>`) var. `next dev`'de hiç görülmedi; yalnız derlenmiş statik çıktıda, hızlı art arda tam sayfa yüklemelerinde sık.
- Denenen: `htmlLimitedBots: /.*/` (akışlı metadata'yı kapatma) — gövdedeki sınır kalktı-kalkmadı fark etmedi, hata sürdü; değişiklik geri alındı.
- Hidrasyon denetimi dışarıda tutulunca (geçici kopyayla) `run-community-home` 38/38, `run-communities` 61/61, `run-detail-pages` 44/44, `run-groups` 36/36, `run-community-posts` 36/36 — yani başka hiçbir işlevsel kontrol düşmüyor. Testler değiştirilmedi (denetim olduğu gibi duruyor).

## Faz 4 — Ayarlar, Bildirimler

- **Ayarlar (`/settings`)**: `lg`'den itibaren solda yapışkan bölüm menüsü (Hesap · Gizlilik · Tercihler · Tehlikeli bölge; kaydırmayla geçerli bölüm işaretlenir, `aria-current`), mobilde başlığın altında hap bağlantılar; tek okuma sütunu (≤ 2xl). Bölüm başlıkları küçük harf "eyebrow" yerine display başlık (`scroll-mt-24` ile çapaya kaydırma başlığın altına düşmez). Form/iş mantığına dokunulmadı.
- **Bildirimler (`/notifications`)**: liste yerel takvim gününe göre **Bugün · Dün · Bu hafta · Daha eski** gruplanır (`lib/notification-groups.ts`, saf fonksiyon + `notification-groups.test.ts`; sıra değişmez, boş grup çizilmez); her grup ayrı kart. "Tümünü okundu işaretle" hap düğme.
- **Mesajlar**: yeni token/yazı tipleriyle zaten Meydan'a uyuyor; yapısal değişiklik yapılmadı.
- Not: örnek veride adın iki kez görünmesi (ör. "Bora Kaya Bora Kaya …") yalnızca taklit metinden kaynaklanıyordu — gerçek tetikleyici cümleleri adı içermez ("Paylaşımını beğendi: …"); uygulamada hata yok.
- Yeni metinler TR+EN: `notifications.group*`, `settings.sectionsNav`. Migration yok. Bu sayfalara dokunan UI testi yok; gerçek oturumla denenmedi.

## Faz 5 — gönderi kartları (C tasarımındaki gönderi düzeni)

- **Tek iç yerleşim `ContentCardPost`** (`features/content/content-card.tsx`): solda 40px avatar sütunu; sağında kimlik satırı **Ad · @kullanıcı · zaman · [tür hapı] [durum rozetleri]** + ⋮ menü, gövde (başlık, açıklama, çıktı önizlemesi, prompt bloğu, etiketler) ve eylem satırı aynı sütunda hizalı. Kimlik satırı kartın uzatılmış bağlantısının üstünde (`z-20`, menü açıkken `focus-within:z-30`). `ContentCardBody` ve `PostHeader` kalktı; kart başına ⋮ menü seçimi `PostTargetMenu`, soluk kimlik metni `postMeta()` (`prompts/post-header.tsx`).
- **Tür hapı** `ContentTypePill` (`bg-primary-soft text-primary`); detay sayfaları satır biçimli `ContentTypeLabel`'i korur.
- **Prompt bloğu** (`PromptPreviewBox`): `rounded-xl bg-surface-soft`, başlık **PROMPT · araç**, gerçek kopyalama sayısı ("83 kullanım", `prompt.usesShort`) ve metin biçimli **Kopyala** (`CopyPromptButton variant="link"`).
- **Eylem satırı sırası her kartta aynı**: solda Beğeni · Yorum (İstek'te + Yanıt sayısı), sağda Kaydet · İstatistik · Paylaş. Kenarlık çizgisi yok. İstek kaydedilemez (Kaydet yok). Başvuru kartında düğmeler gönderinin kendisine ait kalır (`data-post-engagement`, `display: contents` sarmalayıcı).
- Dönüştürülen kartlar: `PromptCard`, `WorkflowCard`, `PresetCard`, `RequestCard`, `ApplicationCard`. Workflow/Hazır ayar kategorisi kimlik satırından adım/parametre paneline taşındı ("3 adım · Karakter"); paneller `rounded-xl bg-surface-soft`.
- Yeni metin: `prompt.usesShort` (TR+EN). Migration yok.

**Sınama:** `tsc`, `lint` (yalnız eski 4 uzantı uyarısı), `npm test`, `next build` temiz. Ağ taklitli ekran görüntüleri (1440/390, açık/koyu). Playwright (hidrasyon denetimi dışarıda tutulan geçici kopyayla): `run-community-posts` 36/36, `run-communities` 61/61, `run-community-home` 38/38, `run-detail-pages` 44/44. Gerçek oturumla/cihazla denenmedi.

## Faz 6 — C ile kalan farklar: kutusuz akış, topluluk sayfası, profil, Keşfet

C taslağıyla yan yana karşılaştırmada kalan dört fark kapatıldı (kullanıcı "hepsini yap" dedi).

- **Kutusuz akış — `ContentStream`** (`features/content/content-card.tsx`): gönderiler tek bir yüzeyde, aralarında ince çizgi; mobilde kenardan kenara (sayfanın 12px kenar boşluğunu iptal eder), `sm`+ tek yuvarlak panel. İçindeki `ContentCard`'lar bağlamdan (`StreamContext`) kendi kenarlık/gölge/köşesini bırakır — aynı kartlar ızgaralarda kutulu kalır. `overflow-hidden` bilerek yok (⋮ menü panelin dışına açılabilsin). Kullanan yerler: Ana Sayfa akışı (`FeedGrid layout="stream"`), Topluluklar ana sayfası akışları (`HomeFeedList`), topluluk sayfası akışı (`FeedTab`; sabitlenenler, odak gönderisi dahil). İskelet de aynı düzende (`PromptCardSkeleton flat`). Gönderinin üstündeki bağlam satırı (topluluk adı, "Sabit") `FEED_ITEM_CONTEXT_CLASS` ile kartın iç boşluğuna hizalı.
- **Topluluk akışı tek sütun** (eski 2–3 sütunlu ızgara yerine; ≤ `max-w-3xl`). `run-community-home` 26/26b'deki "2–3 sütun, kart ≤ 460px" beklentisi bu karar yüzünden bilinçli değişti: her ekranda 1 sütun, gönderi ≤ 768px, xl'de yan sütun bölümleri.
- **Topluluk sayfası** (`community-aside.tsx`): Akış sekmesinde `xl`+ sağ sütun — **Hakkında** (açıklama, üye ve gönderi sayısı), **Kurallar** (ilk 4 satır, "Kuralların tamamı" → Hakkında ve kurallar sekmesi), **Yöneticiler** (yalnız üyeye). Başlıkta üye avatar yığını (yalnız üyeye). İkisi de mevcut `community_members` RPC'sinin ilk sayfasından (rütbe sıralı); RPC üye olmayana kapalı olduğundan ziyaretçide hiç çağrılmaz (`run-communities` 29b'deki "çağrılmadı" denetimi geçiyor). Sabit duyuru akış özetinde sıcak (secondary) kart + "SABİT DUYURU" üst yazısı; yaklaşan etkinlik tarih kutulu kart (`eventDateParts`, etkinliğin kendi saat diliminde; birim testli).
- **Profil**: "Promptları toplam N kez kullanıldı" satırı — profilin listelediği promptların gerçek `copy_count` toplamı (yeni sorgu yok; 0'da gizli). Kendi profilinde topluluk halkaları (`CommunityRings`); başkasının profilinde yok (üyelikler herkese açık değil).
- **Keşfet** (`discover-highlights.tsx`): tür kutularında gerçek sayı ("190 prompt", 4 `HEAD count` sorgusu) ve önizleme (en çok beğenilen görsel promptun çıktısı / metin promptun metni; ses/video ikonla kalır — medyaları dosyanın kendisi olabilir). **"Bu hafta popüler"** şeridi: son 7 günün en çok beğenilen herkese açık promptları; 7 günde 3'ten azsa "Bu ay popüler" (30 gün), o da azsa şerit çizilmez — eski içerik "bu hafta" başlığıyla gösterilmez. Kaynak: `fetchTopPrompts` / `fetchPublicPromptCounts` (`lib/supabase/prompts.ts`; `community_id is null`, yayında + herkese açık, silinmemiş, engellenen yazar süzülür).
- Yeni metinler TR+EN: `communities.aside.{pageLabel,about,rules,readRules,staff,postCount}`, `communities.detail.membersPreview`, `communities.announcements.pinnedEyebrow`, `profile.reuseLine`, `discover.{popularWeek,popularMonth,typeCount}`. Migration yok.

**Sınama:** `tsc`, `lint` (yalnız eski 4 uzantı uyarısı), `npm test` (344), `next build` temiz. Playwright (hidrasyon #418 denetimi dışarıda tutulan geçici kopyayla): `run-community-home` 38/38, `run-community-posts` 36/36, `run-communities` 61/61, `run-detail-pages` 44/44, `run-groups` 36/36. Ağ taklitli ekran görüntüleri (1440/390, açık/koyu). Gerçek Supabase/oturum/cihazla denenmedi; canlı veride "Bu hafta popüler" seed içeriği eskiyse görünmeyebilir (tasarım gereği).

### Faz 6 eki — telefonda tek görünüm (`ContentGrid`)

Kullanıcı bazı gönderilerin düz çizgili, bazılarının yuvarlak kart olduğunu fark etti: akışlar (Ana Sayfa, Topluluklar) kutusuzdu, ızgaralar (Keşfet, listeler, profil, arama, kaydedilenler/koleksiyon, İçeriklerim) kutulu — telefonda ızgara da tek sütuna düştüğü için fark en çok orada görünüyordu. Kullanıcının seçtiği çözüm: **telefonda her gönderi listesi düz akış, masaüstünde ızgaralar kutulu kalır.**

- `ContentGrid` + `CONTENT_GRID_ITEM_CLASS` (`features/content/content-card.tsx`): `sm` altında `ContentStream` ile aynı yüzey (kenardan kenara, çizgiyle ayrılmış satırlar), `sm`+ CSS sütunlarında kutulu kartlar. Kart yüzeyi bağlamdan gelir (`SurfaceContext`: `card` | `flat` | `responsive`). Elle yazılmış bütün `columns-1 … sm:columns-2` ızgaraları buna geçti (FeedGrid, PromptGrid, RequestList — kendi `md:`/`2xl:` sütunlarıyla —, ProfileContentGrid, profil workflow'ları, hazır ayar listeleri, arama, İçeriklerim, koleksiyon/kaydedilenler); iskelet ızgarası da aynı davranışta. Yaratıcı kartları ve koleksiyon kapakları gönderi olmadığı için dokunulmadı.
- Sınama: `npm test` 344, `lint` (eski 4 uyarı), `build` temiz; 390px'te Ana Sayfa/Keşfet/Profil/Promptlar yatay taşmasız, aynı satır görünümünde; 1440px'te ızgaralar kutulu. Playwright (hidrasyon denetimi dışarıda tutulan geçici kopyayla): `run-community-home` 38/38, `run-community-posts` 36/36, `run-communities` 61/61, `run-detail-pages` 44/44, `run-groups` 36/36. Gerçek cihazda denenmedi.

### Faz 6 eki 2 — Ana Sayfa ve Topluluklar da Keşfet gibi

Kullanıcı tablet ve masaüstünde Ana Sayfa ile Toplulukların (kutusuz tek sütun akış) Keşfet'ten (kutulu ızgara) farklı görünmesini istemedi: "o sayfalar da Keşfet gibi olsun". Sonuç: **sitedeki bütün gönderi listeleri tek bileşen, `ContentGrid`** — telefonda kenardan kenara çizgili satırlar, `sm`+ kutulu sütunlar.

- Ana Sayfa (`FeedGrid layout="home"`, eski adı `stream`), Topluluklar ana sayfası (`HomeFeedList`) ve topluluk sayfası akışı (`FeedTab`, sabitlenenler ve odak gönderisi dahil) `ContentGrid`'e geçti; xl'de sağ sütun durduğu için en çok iki sütun (`sm:columns-2`, `FEED_GRID_COLUMNS`). Ana Sayfa'nın ana sütunundaki 640px sınırı kalktı (sayfa ≤ 1200px), topluluk akışının `max-w-3xl` sınırı kalktı.
- `ContentStream` ve kart yüzeyinin `flat` hâli kaldırıldı (artık kullanan yok); `ContentGrid` `as="ul"` ve `data-*` alır. Bağlam satırı (`FEED_ITEM_CONTEXT_CLASS`) telefonda satırın içinde, `sm`+ kutunun üstünde. İskelet: `PromptCardSkeletonGrid columns=…`.
- `run-community-home` 26/26b yeniden çok sütun bekler (sm+ 2 sütun, kart ≤ 460px, xl'de yan sütun bölümleri).
- Sınama: `npm test` 344, `lint` (eski 4 uyarı), `build` temiz; 1440/820/390px'te Ana Sayfa, Topluluklar, topluluk sayfası ve Keşfet taşmasız. Playwright (hidrasyon denetimi dışarıda tutulan geçici kopyayla): `run-community-home` 38/38, `run-community-posts` 36/36, `run-communities` 61/61, `run-detail-pages` 44/44, `run-groups` 36/36. Gerçek cihazda denenmedi.

### Faz 6 eki 3 — Kart | Odak seçicisi bütün kart sayfalarında

Kullanıcı Keşfet'teki Kart | Odak seçicisinin kart gösteren bütün sayfalarda olmasını istedi ("yeni bir şey yazma, Keşfet'tekini kullan"). Yeni seçici yazılmadı: mevcut `ViewModeSwitcher` / `MobileViewToggle` (`ViewModeControls` = ikisinin `ListToolbar`'daki ikilisi) ve mevcut Odak ızgarası `FocusGrid` kullanıldı; tercih zaten site geneli tek durumdur (`useViewMode`, `?view=` + localStorage).

- Eklendiği yerler: Ana Sayfa (akış araç çubuğu + filtre penceresindeki Görünüm bölümü; `FeedItemsView`'daki "Ana Sayfa hep kart" istisnası kalktı), Takip Ettiklerim, arama sonuçları (sıralama satırı), profil (Promptlar/Beğenilenler araç çubuğu, İstekler, Workflow'lar, Hazır Ayarlar), İçeriklerim, Kaydedilenler ve koleksiyonlar (arama kutusunun yanı), Topluluklar ana sayfası akışları ve topluluk sayfası akışı. Önceden vardı: Keşfet, tür listeleri (`ContentListPage`), etiket sayfası.
- Liste bileşenleri Odak'ı kendileri çizer (`PromptGrid`, `RequestList`, `ProfileContentGrid`, profil hazır ayar ızgarası); satır içi ızgaralarda `viewMode === "focus"` dalı. Sağ sütunu olan sayfalarda Odak en çok 3 sütun (`FOCUS_GRID_NARROW_COLUMNS`).
- Topluluk gönderisi Odak'ta işaret ettiği içerikle çizilir (`postFeedItem`); okunamayan içerik Odak'ta çizilmez; Odak kartı içeriğin kendi sayfasına gider (başvurunun kendi sayfasına değil — Kart görünümü öyle kalır). Odak kartlarında ⋮ menü olmadığından "Koleksiyondan kaldır" yalnız Kart görünümünde.
- Sınama: `npm test` 344, `lint` (eski 4 uyarı), `build` temiz; Odak kipinde 1440/820/390px'te Ana Sayfa, Topluluklar, topluluk sayfası, profil taşmasız. Playwright (Kart kipinde, hidrasyon denetimi dışarıda tutulan geçici kopyayla): `run-community-home` 38/38, `run-community-posts` 36/36, `run-communities` 61/61, `run-detail-pages` 44/44, `run-groups` 36/36. Yeni metin yok (mevcut `view.*` anahtarları). Gerçek cihazda denenmedi.

## Çeviri
Yeni metinlerin hepsi `translations.ts`'te TR+EN: `home.composerPlaceholder`, `home.rings*`, `home.rail*`, `settings.palette.meydan`.

## Denenmedi / açık
- Gerçek Supabase/oturum/cihaz; `list_my_communities` ve `trending_tags` canlı yanıtları (taklitle bakıldı).
- Sonraki adaylar: Ayarlar, Bildirimler, Mesajlar; profilde koleksiyon halkaları; #418 hidrasyon hatasının kökü (Next/React metadata sınırı ile `<head>` hidrasyonu).
