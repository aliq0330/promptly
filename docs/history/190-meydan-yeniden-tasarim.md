# 190 — Meydan yeniden tasarımı (Faz 1: tema + kabuk + Ana Sayfa · Faz 2: Keşfet, Profil, Topluluk · Faz 3: başlıklar, Topluluklar, detay)

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

## Çeviri
Yeni metinlerin hepsi `translations.ts`'te TR+EN: `home.composerPlaceholder`, `home.rings*`, `home.rail*`, `settings.palette.meydan`.

## Denenmedi / açık
- Gerçek Supabase/oturum/cihaz; `list_my_communities` ve `trending_tags` canlı yanıtları (taklitle bakıldı).
- Sonraki adaylar: Ayarlar, Bildirimler, Mesajlar; profilde koleksiyon halkaları; #418 hidrasyon hatasının kökü (Next/React metadata sınırı ile `<head>` hidrasyonu).
