# Referans tasarım dilini tüm siteye uygulama planı

Durum işareti: `[ ]` yapılacak · `[x]` bitti. Bu dosya ilerleme kaydıdır; devam edilecekse buradan sürdürülür.
Kaynaklar: `substack-tasarim-dili.md` (ölçümler, Bölüm 10 oluşturma akışları), tuval U1–U7 + G1–G5 (`docs/mockups/referans-tuval/`).

## 0. İlkeler (kullanıcı kararları — son hâli)

- **Kapsam = tüm site.** Her rota, ekran, pencere, menü; "yapılamaz" yok. Atlanan madde `[ ]` kalır, açıkça raporlanır.
- **Karar kuralı:** mockup'ta (tuval U1–U7, G1–G5) olan her yer mockup'taki gibi; mockup'ta olmayan her yer substack.com'daki gibi (sakin kabuk, düz satır listeleri, ince kenarlık, tek vurgu, gölgesiz yüzey, kartsız liste, 40 px kontroller).
- **Kenar yarıçapları kullanıcının gönderdiği ekran görüntüsündeki gibi** (mockup'taki hap/16 px bunu geçersiz kılar): kontroller (düğme, alan, seçici, segment, sekme, çip, ikon düğmesi) **10 px**, kart/panel/gezinme öğesi **12–16 px**, pencere ve alt kart **20 px**. Tam yuvarlak yalnız avatar, anahtar, sayaç/nokta ve oynat düğmesi.
- **Renk ve yazı tipi de değişir (substack.com):**
  - Vurgu `#ff6719` (hover `#ff5600`, metin olarak `#d74d00`); metin `#363737`; ikincil `#757575`; zemin beyaz, yumuşak yüzey `#f5f5f5/#f0f0f0`; kenarlık `rgba(0,0,0,.1)`; odak mavisi `#005dd9` + 3 px halka. «Senin olan» işareti (okunmamış nokta, kendi tepkin) de vurgu rengidir.
  - Arayüz yazı tipi sistem yığını (`system-ui`, SF Pro Display…; Google/DM Sans/Bricolage kalkar), okuma gövdesi Spectral (serif), prompt metni JetBrains Mono (işlevsel, kalır). Başlıklar sistem sans 700; harf aralığı sıkıştırması kalkar.
  - Beyaz üstü `#ff6719` yazı oranı 3.0:1 (AA 4.5'in altında): referans da böyle yapıyor; birebir uygulanır, `brand-tokens.test.ts` bu çifti "büyük UI bileşeni 3:1" olarak belgeleyerek günceller, metin olarak vurgu her yerde koyu `#d74d00` kullanır. Bu sapma raporda açıkça yazılır.
  - Koyu mod: nötr (mavi tonu olmayan) gri zeminler + açık turuncu vurgu `#ff7a38`.
  - Logo/uygulama ikonları/favicon yeni renklerle yeniden üretilir.
- Dokunma hedefi ≥ 36 px, alan kenarlığı ≥ 3:1 (silik referans kenarlığı yalnız kart/liste ayırıcıda; alan kenarlığı `#868686` ≥3:1 kalır).
- Her aşama: `tsc`, `lint`, `npm test`, `npm run build`, TR+EN çeviri (`node scripts/build-i18n.mjs`) temiz; sık commit/push; bitince PR + ana dala merge.

## Durum (son güncelleme)

**Bitti ve doğrulandı** (tsc, eslint, `npm test` 1569/1569, `npm run build`, CI UI paketleri ana dalla aynı sonuçta, yeni `run-create-pages` 8/8):
- [x] Bölüm 1 tamamı: radius/renk/yazı/odak tokenları, `fonts.css`, Spectral, marka varlıkları, kilit testleri (`brand-tokens.test.ts` güncellendi)
- [x] Bölüm 2: Button, IconButton, Chip, Field/Input/Textarea, SearchField, Tabs, ChoiceGroup, floating katmanlar, DialogShell, Badge, VisibilityTag + tüm kodda 827 `rounded-full` sınıflandırması ve 188 kontrol benzeri `rounded-md/lg/xl` dönüşümü
- [x] Bölüm 3: Sidebar, NavRail, MobileNav oluştur düğmeleri (12 px), üst çubuk arama kutusu
- [x] 4.5 Oluşturma: Ekip / Topluluk / Space telefonda tam ekran sayfa (`/teams/new`, `/communities/new`, `/spaces/new`), `md+` pencere
- [x] 4.9 Mesajlar kind segmenti + birincil oluştur düğmesi, 4.14 Bildirimler düz satırlar, 4.4 detay eylem düğmeleri, 4.15 Ayarlar 600 px sütun, Spectral okuma metni (Skill markdown, yasal metin, `DetailLede`)

**Token/bileşen üzerinden tüm sayfalara yansıdı, sayfa sayfa tek tek gözle denetlenmedi** (ekran görüntüsü yalnız Ana Sayfa, Mesajlar, Ayarlar/Bildirimler, Keşfet, Giriş, Şartlar, oluşturma sayfaları için alındı): Odak, Studio, Profil, Topluluklar, Ekipler, Spaces panosu, Hikâyeler, Moderasyon, Geliştiriciler vb. Bunlarda elle yazılmış, sınıflandırıcıya yakalanmayan özel hap/köşe kalmış olabilir; bulunursa bu listeye eklenip düzeltilir.

**Bilerek yapılmayanlar / açık:** `design-metrics` içinde `rounded-full` kontrolü için otomatik kural (sınıflandırma sezgiseldir, yanlış pozitif riski); Playwright paketlerinden CI listesinde olmayanların tümü yeniden koşulmadı (koşulanlar: chat, communities, community-home, search-notifications, discover, detail-pages, feed-filters, first-run… — ana dalda zaten kırık olanlar aynı kalır: `run-communities` 13b/22, `run-chat` 15/18/18b, `run-skills-social`, `run-comment-extras`, `run-telegram-settings` ortam bayrağına bağlı).

## 1. Temel katman
- [ ] `globals.css` radius ölçeği: xs 4 · sm 10 · md 12 · lg 16 · xl 20; yorum satırları güncellenir
- [ ] Renk tokenları (açık+koyu), `--color-focus`, `--shadow-focus`; odak halkası `ring-primary` → `ring-focus` (tüm kodda)
- [ ] Yazı tipleri: `fonts.css`/`layout.tsx` (DM Sans + Bricolage kalkar, sistem yığını, Spectral dosyaları), tip ölçeği (display 44, h1 32/700, h2 24, h3 17/600, gövde 15), `font-display`/`font-serif` kullanımları
- [ ] Marka varlıkları (`build-brand-assets.mjs`), `BrandMark/BrandWordmark` renkleri, PWA manifest renkleri, `themeInitScript` zemin renkleri
- [ ] Odak biçimi: alanlarda mavi kenarlık + 3 px yumuşak halka; klavye odağı için çerçeve (outline) korunur (`focus-ring.test.ts`)
- [ ] Pencere zemini: karartı %45, `shadow-pop` korunur
- [ ] `design-metrics*.mjs`, `eslint` kuralları ve `brand-tokens.test.ts` yeni ölçeğe göre güncellenir (hap düğme/çip yasağı eklenir: `pillControl`)
- [ ] `CLAUDE.md` Bölüm 4 kuralları + `docs/history/473-*`

## 2. Ortak bileşenler (`src/components/ui/*`)
- [ ] `Button` (hap → 10 px, md 40 / sm 36 / lg 48, 14/600), `buttonClassName` kullanan tüm Link düğmeleri
- [ ] `IconButton`, `LikeToggle`, `MediaPlayButton` (oynat yuvarlak kalır)
- [ ] `Input/Textarea/Select/fieldControlClassName` (40 px varsayılan, 10 px, halka odak), `SearchField` (40, simge solda), `field.tsx` etiket/ipucu ritmi (alanlar arası 20–24)
- [ ] `Chip/ChipRow` (36 → 10 px), `Tabs` (alt çizgi / segmented: kap 40, sekme 32, 10 px / pill kalktı), `ChoiceGroup`, `OptionGroup`, `MenuRadioGroup`, `SwatchGroup`
- [ ] `Modal` + `DialogShell` (masaüstü 20 px, telefon alt kart 20 px üst köşeler, başlık Bricolage 20/700, ✕ yuvarlak 36)
- [ ] `menu.tsx`, `dropdown-menu.tsx`, `popover-menu.tsx` (panel 12, satır 10, 40 yükseklik), `floating.ts`
- [ ] `Card`/`card-*` yüzeyleri, `Badge`, `CountBadge`, `SectionLabel`, `Banner`, `InlineAlert`, `toast`, `Switch`, `EmptyState`, `PageHeader`, `scroll-row`, `person-row`, `visibility-tag`, `check-row`, `collapsible`, `code-block`, `skeleton`
- [ ] Yeni ortak parça: `CreateFormShell` (telefon: tam ekran sayfa kabuğu, `md+`: `Modal` kabuğu; tek form bileşeni)

## 3. Kabuk ve gezinme
- [ ] `Sidebar` (satır 40–48, 12 px, seçili primary-soft), `NavRail` (84, etiketli, 12 px), `MobileNav` (5 yuva etiketli), `Header`, `AccountMenu`, `PhoneAccountButton` + «Sen» sayfası, `CreateHub`, `CreateMenuSheet`
- [ ] Üst çubuk ve alt menü ölçüleri, sayfa kenar boşluğu (12/24/32), `PageContainer`
- [ ] Misafir üst çubuğu (giriş / kayıt düğmeleri), `TermsUpdateNotice`, `NoticeHost`, canlı bildirim kartı

## 4. Sayfalar ve ekranlar

### 4.1 Ana Sayfa (`/`)
- [ ] Sekmeler (Sana özel / Takip Ettiklerin), Filtre simgesi, `ListFilterSheet`, tür çipleri, ilgi ayarı penceresi, ilk kullanım banner'ı
- [ ] `ContentGrid/FeedGrid`, görsel kart (`ContentCardPost`: görsel 20 px, alt satır), "Takip edilecek kişiler" şeridi, Öne çıkan kart, Takip Ettiklerin etkinlik akışı (`ActivityEvent`, `FollowingRail`, `FollowManageModal`), "N yeni gönderi" düğmesi
- [ ] Misafir vitrin (`GuestShowcase`, coverflow kartları)

### 4.2 Odak (`/focus`)
- [ ] Süzgeç çipi + menü, ray düğmeleri, prompt şeridi, kart (yan panel/alt kart), sekmeler, `focus-fill` çipleri, klavye ipucu

### 4.3 Keşfet (`/discover`) ve konu sayfaları
- [ ] Başlık, `SectionMenu`, süzgeç/sıralama penceresi, editoryal bölümler, Yaratıcılar/AI Araçları/Etiketler/Topluluklar listeleri
- [ ] `TopicPage` (etiket, kategori, araç): bant, Takip Et/Paylaş düğmeleri, `SectionNav`
- [ ] Arama (`SearchOverlay`, komut paleti, `AdvancedSearchBox`, çip şeridi, `SearchFilterSections`)

### 4.4 Detay sayfaları
- [ ] Prompt, İstek, Workflow (akış/adım adım/otomatik çalıştır), Ayar paketi, Skill (dosya gezgini, sürümler), Sonuç, Alıntı, Başvuru gönderisi: `DetailBand`, `DetailActionBar` (sayaçlı hap → 10 px kenarlıklı düğme), `DetailAside`, `DetailSection`, ⋮ menüleri
- [ ] Yorumlar: `CommentSection`, composer kutusu, ek önizlemeleri, yorum menüsü, tepki seçici/özeti/sayfası
- [ ] Prompt: Kopyala bloğu, `{değişken}` çipleri, "Çalıştı mı?", Studio'da dene penceresi, sürüm geçmişi, düzenleme önerileri

### 4.5 Oluşturma
- [ ] `ComposeShell` + adımlı düzen (Prompt), İstek, Workflow, Ayar paketi, Skill editörü, Hikâye oluşturucu, `PublishPanel`, taslaklar, `FormDisclosure`, `ContentTypePicker`
- [ ] Oluştur menüsü (`CreateMenuSheet`, `/create`), "Var olan içeriği paylaş" listesi/penceresi
- [ ] **Yeni:** Ekip / Topluluk / Space oluşturma — telefonda kendi adresi olan tam ekran sayfa (`/teams/new`, `/communities/new`, `/spaces/new`), `md+` pencere; tek form bileşeni (G1–G5)

### 4.6 Studio (`/studio`)
- [ ] Kaynak seçici, anahtar paneli, Çalıştır/Kopyala birleşik düğme, Prompt+Ayar paketi alanları, Yayınla

### 4.7 Koleksiyonlar ve kaydedilenler
- [ ] `/saved`, koleksiyon sayfası (ortak koleksiyon sekmeleri, davet şeridi), `SaveToCollectionModal`, üye/davet pencereleri

### 4.8 Profil ve kütüphane
- [ ] `ProfileHeader`, `ProfileRail`, `SectionMenu` hapı → 10 px düğme, arama/filtre, hikâye öne çıkanları, `/profile/edit`, `/followers`, `/following`, `/my-content`, `/insights` (Yaratıcı paneli)

### 4.9 Mesajlar
- [ ] Liste başlığı: arama + oluştur tek satır, altında tam genişlik segment (Tümü · Kişisel · Topluluk · Ekip); ⋮ / seçim modu / alt çubuk
- [ ] Sohbet ekranı: başlık, baloncuklar (köşe 12–16, öbekleme), yazma alanı (10 px alan + yuvarlak gönder), "+" menüsü, GIF/emoji seçicileri, `MessageActionSheet`, tepki çubuğu
- [ ] Bilgi panelleri (Kişi / Topluluk / Ekip / Kanal), kanal-oda listeleri, Aramalar, Yıldızlı, mesaj istekleri, **dock** paneli
- [ ] Arama ekranları (`CallScreen`, `MiniCall`, `CallLobby`, gelen arama kartı)

### 4.10 Topluluklar
- [ ] `/communities` (Topluluklarım/Gönderiler/Keşfet/Yönettiklerim/Davetler), `/communities/all`, detay (bant, sekmeler, Akış, Etkinlikler, Üyeler, Hakkında, Yönetim alt bölümleri), başvuru gönderisi sayfası, `/communities/join`, yönetim formları, etkinlik oluşturma

### 4.11 Ekipler
- [ ] `/teams`, ekip sayfası (bant, sekmeler), proje/dosya/pano/öğe çekmecesi, onaylar, panel, yönetim, `/team-join`, pano kipi araç çubukları

### 4.12 Spaces
- [ ] `/spaces` Merkez düzeni, kartlar, davetler, Space sayfası (bant, sekmeler, üyeler), pano (araç çubuğu, seçim çubuğu, mini harita, yorumlar paneli, dışa aktar, `CopyItemsDialog`), `SpaceDialog` ailesi

### 4.13 Hikâyeler
- [ ] Şerit, görüntüleyici katmanı, oluşturucu, arşiv, öne çıkanlar, yanıt çubuğu

### 4.14 Bildirimler
- [ ] Düz satır listesi (kartsız, alt çizgi, okunmamış turuncu nokta), bölünmüş gelen kutusu + ayrıntı, `NotificationPopover`, canlı bildirim kartı, süzgeç menüsü, erteleme/sessize alma menüleri

### 4.15 Ayarlar
- [ ] `/settings` kategori listesi + 8 alt sayfa (Hesap, Aramalar, Gizlilik, Bildirimler, Tercihler, Geliştirici [+4 alt sayfa], Yasal, Tehlikeli bölge), `/settings/blocked`: 600 px okuma sütunu, kartlı düz satırlar, `SettingsCard/SettingsSubpage`, `Switch` satırları, seçiciler

### 4.16 Kimlik ve onboarding
- [ ] `/login`, `/signup`, `/reset-password`, giriş penceresi (`AuthPrompt`), `AuthShowcase`, ilk giriş kurulumu (`FirstRunGate`: konular, kişi takibi, profil tamamlama), `/oauth/connect`, `/oauth/consent`

### 4.17 Herkese açık/yasal/diğer
- [ ] `/developers` (bölümler, `SectionPager`, bağlama sihirbazı), `/privacy`, `/terms`, `/share/*`, 404/`NotFoundBlock`, `EmptyState` sahneleri, `Moderation` paneli (şikâyetler, kullanıcılar, temalar), `ReportModal`

## 5. Doğrulama ve yayın
- [ ] Tüm `rounded-full` kullanımı tek tek sınıflandırıldı (avatar/nokta/anahtar kalır, düğme/çip/sekme/alan dönüştü); betik raporu repoya konur
- [ ] Ağ taklitli Playwright paketleri etkilenen akışlar için çalıştırıldı/güncellendi (yeni oluşturma sayfaları dahil)
- [ ] `tsc`, `lint`, `npm test`, `npm run build`, i18n üretimi temiz
- [ ] `CLAUDE.md` + `docs/history/473-*` + README satırı
- [ ] PR açılır, CI yeşil, ana dala merge
