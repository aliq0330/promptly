# 227 — Yoğun ekranların sadeleştirilmesi (Ana Sayfa, Keşfet, yan menü)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Arayüz ağ taklitli Playwright'ta sınandı (`run-home-motion` 10/10, `run-discover` 9/9, `run-focus-feed` 25/25 + diğer paketler); **gerçek Supabase'e / oturuma / cihaza karşı denenmedi**. İngilizce karşılıklar eklendi (`nav.followingPeople`, `header.focusLink`, `discover.likesCount`, `forYou.setupBanner`).

## Sorun
Telefonda Ana Sayfa ilk ekranında altı kontrol katmanı (yazma kutusu, hikâye şeridi, iki büyük balon, tür çipleri, iki yuvarlak düğme, Yenile/ayarla satırı, "Sana özel'i kur" kartı) gönderiden önce geliyordu; Keşfet'te dört yatay şerit + on bir balon üst üste; masaüstünde yan menüde 14 giriş, hepsinin ikinci bir yolu Keşfet'in bölümlerinde vardı; "Takip Ettiklerim" iki farklı şeyin adıydı (yan menüde kişi listesi, Ana Sayfa'da gönderi akışı). Tasarım önce tuvalde önce/sonra olarak çizildi, kullanıcı "aynısını yap" dedi.

## Ne değişti
- **`SectionNav variant="tabs"`** (`content/section-nav.tsx`): balonlar yerine tek satır alt çizgili metin sekmeleri (Ana Sayfa'nın iki görünümü genişliği paylaşır; Keşfet'in on bir bölümü `ScrollRow` ile kayar). Telefondaki Kart | Izgara düğmesi satırdan çıktı (Filtre penceresindeki "Görünüm" bölümünde zaten var). Balonlu hâl (`variant="tiles"`, varsayılan) Topluluklar, Spaces ve konu sayfalarında AYNEN durur; katlanan çubuk (`FoldedBar`) iki varyantta da aynı.
- **Ana Sayfa**: yazma kutusu telefonda kartsız satır; "Yenile" + "Sana özel'i ayarla" akıştan çıktı → Filtre penceresinde "Sana özel" bölümü (`ForYouSheetSection`); ayar penceresi (`ForYouSettingsModal`, `overLayers`) tek yerde, `FeedTabs` sahiplenir (ilgi alanı seçilince şart değişip banner kalksa da pencere kapanmaz); ilk kullanım kartı tek satırlık, kapatılabilir banner (`ForYouSetupBanner`, kapatma `localStorage` `promptly-foryou-setup-dismissed`).
- **Keşfet**: kategori + etiket iki şerit → TEK çip satırı (`TopicStrip`; kategori kolajı kalktı, `data-discover-category` aynı); "Bu hafta popüler" daha küçük (128px) karolar, başlık + beğeni karonun üstünde; yaratıcılar şeridi üstten kalktı → `xl`'de sağ sütun (`DiscoverAside`: yaratıcılar + yükselen etiketler, Ana Sayfa'nın `HomeRail` paneliyle aynı dil; `xl`'de etiketler çip satırından kalkar, sağ sütunda); gönderi ızgarası sağ sütunun yanında en çok iki sütun (`layout="home"`). İskelet (`DiscoverHighlightsSkeleton`) yeni yüksekliklere eşitlendi (kayma testi geçer).
- **Yan menü** (`nav-items.ts`): 14 → 8 giriş — Ana Sayfa · Keşfet · Topluluklar · Spaces · Studio / Kaydedilenler · Takip ettiğim kişiler · Profil. Promptlar, İstekler, Workflow'lar, Hazır ayarlar, Etiketler Keşfet'in bölümleri (Keşfet bu sayfalarda ve konu/kategori/araç/sonuç sayfalarında yanık kalır: `NavItem.alsoMatch`); **Odak `md`+'da üst çubukta "Odak'ta gez" düğmesi** (telefonda alt menüdeki yeri aynı).
- **"Takip ettiğim kişiler"**: `/following` sayfasının adı (yan menü, hesap menüsü, sayfa başlığı) `nav.followingPeople`; "Takip Ettiklerim" yalnız Ana Sayfa/Odak'taki gönderi akışı sekmesi.

## Tuvaldekinden bilinçli sapmalar
- Arama kutusu masaüstünde üst çubuğa TAŞINMADI (Keşfet'in arama kutusu `SearchView`'in kendi durumuna bağlı; taşımak onu üst çubukla paylaşmayı gerektirir).
- Keşfet sekmelerinde "Daha fazla" taşma menüsü YOK (sekmeler kayar; `Tabs` için de yok, bkz. CLAUDE.md "bilinçli sınırlar").
- Telefonda "Öne çıkan yaratıcılar" şeridi yok (Yaratıcılar bölümü bir sekme uzakta); akış arasına "Takip etmeyi dene" şeridi eklenmedi.
- `/prompts`, `/workflows`, `/presets`, `/requests`, `/tags` sayfaları duruyor ama yan menüden bağlantı yok (Keşfet bölümleri bunların yerine).

## Testler
`run-home-motion` (Yenile/ayarla Filtre penceresinde, tek satırlık banner, İngilizce), `run-discover` (tek çip satırı, metin sekmeleri, sağ sütun, yan menü 8 giriş, ilk gönderi yüksekte), `run-focus-feed` (Odak üst çubukta, yan menüde yok) yeni düzene göre güncellendi.
