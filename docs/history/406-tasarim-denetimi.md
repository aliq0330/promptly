# 406 — Tasarım denetimi: sistemi uygulanır hale getirmek

Kullanıcı Promptly'yi "unslop" çerçevesiyle baştan sona denetletti; kimlik (Meydan, Bricolage/DM Sans/JetBrains Mono, Phosphor, hap düğmeler,
mavi/turuncu rol ayrımı) KORUNDU. Bulgular sistemin kendi kurallarının uygulanmamasıydı: ortak bileşen varken elle yazılmış yüzeyler,
ölçek dışı ikon/metin değerleri, 11px metin, büyük harfli etiketler, parçalanmış switch/rozet/menü. İş iki PR'da yapıldı (PR-1: ölçüm + küçük düzeltmeler + ortak bileşenler; PR-2: toplu geçişler + karar gerektiren maddeler + kilitleme).

## PR-1 — Faz 0 + 1 + 2 (ölçüm, küçük düzeltmeler, ortak bileşenler)

**Faz 0.** `scripts/design-metrics.mjs` (kural dışı kalıpları sayar; `--check` hedefi aşarsa çıkış 1), `tests/design/screens.mjs` (ağ taklitli ekran
görüntüsü: 13 sayfa × 3 genişlik × açık/koyu), `eslint --max-warnings=25` (mevcut uyarı sayısı dondu; `.claude/**` lint dışı).

**Faz 1.**
- **H7** `--nav-rail-w` (84px) ve `--sidebar-w` (248px) `globals.css`'te; ray, kenar çubuğu, Mesajlar paneli ve detay eylem çubuğu aynı değişkeni okur
  (eski `left-[72px]` / `left-64` sabitleri 84/248'e uymuyordu).
- **H4** `text-micro` yalnız `CountBadge`'de; kalan 86 yer `text-caption` (alt menü etiketleri `truncate`).
- **L3/L5** kartın tıklama bağlantısı varyanta göre köşe alır; kart alt satırında 2px dolgular kalktı, `-mr-2` (4px ızgarası).
- **L4** ham `z-[…]` kalmadı: `--z-fullscreen/compose/picker/celebration`, kart içi `z-1/2/3`; `Modal` `z-(--z-overlay)`.
- **M9** `transition-all` ve `left` animasyonu yok; `hover:scale-*` yok (yüzey rengi/halka); alt menü göstergesi `ease-soft`; gönderirken `animate-pulse` yerine `opacity-60`.
- **Alt menü** etkin sekme: ikon + etiket birlikte `text-primary`, çizgi kalınlığı sabit, "Oluştur" düğmesinde iç parlama yok.

**Faz 2.**
- **H3** `components/ui/switch.tsx`: `Switch`, `SwitchRow`, `SwitchTrack` (44×24, 20px başparmak, `transform`). 12 dosyadaki 13 elle yazılmış switch taşındı;
  `role="switch"` yalnız bu dosyada.
- **Card v2** (`tone` default/soft/inset, `padding` sm/md/lg, `as`), **`SectionLabel`** (12px/600, büyük harf yok; `Eyebrow`, `ContentTypeLabel`,
  `ContentTypePill` onun üstünde), **`floating.ts`** (`FLOATING_PANEL/CARD/TIP/PILL_CLASS`; `MENU_PANEL_CLASS` onun üstünde), **`Badge` v2** (ton × boyut,
  `secondary`/`overlay`), **`SearchField`** (profil, profil araç çubuğu, etiket keşfi, Topluluklar aramasında).
- **N2** `--color-success|warning|danger|secondary-soft` (yüzeyin üstüne %10 tint); 171 `bg-*/10|12|15` yeni token'a çevrildi. AA testi
  (`brand-tokens.test.ts`) bu zeminlerde durum metnini iki modda denetler; geçmesi için açık moddaki success/warning/danger/secondary tonları
  birkaç birim koyulaştı (`#136f37`, `#a24a06`, `#bd2828`, `#a64718`).
- **art token'ları** `text-on-art`, `text-on-art-muted`, `bg-art-chip`, `.art-scrim` (resim/koyu sahne üstü metin; PR-2'de kartlara bağlandı).

Doğrulama: tsc, eslint (0 hata), `npm test` 1194/1194, `next build`, ağ taklitli Playwright paketleri (baseline ile karşılaştırıldı). Gerçek Supabase/cihaz DENENMEDİ.

## PR-2 — Faz 3 + 4 + 5 (toplu geçişler, kararlı maddeler, kilitleme)

Kararlar (öneriler onaylandı): büyük harfli etiket kalktı · DM Sans yalnız 400/500/600, Bricolage 700/800 · seçili durum = mavi yüzey · kart örtüsü hafifledi ·
header/alt çubuk camı kalktı · boş durumlara çizgi sahne · sidebar satırı 40, çip 36 · ekip rengi üç sakin görünüm · profil başlığı `text-h1` · hap yüzen öğeler `shadow-md`.

**Faz 3 (mekanik, araç destekli).**
- **H6** ikon boyutu 12/16/20/24 (süs ≥32, 4'ün katı): 14→16, 18→20, 13/15/17→16, 19→20, 22/26/28→24, 10/11→12 (690 yer; avatar/kimlik kutusu etiketleri hariç); ikon üstünde `strokeWidth` yok,
  mobil alt menüde etkin sekme yalnız renk. **H5** 163 `uppercase` + 164 açık `tracking-*` kalktı (`SectionLabel`). **H1** ≈460 elle kart yüzeyi → `card-flat/soft/inset` yardımcı sınıfları
  (`globals.css`; tek kenarlık tonu `border-soft`, `xl`→`lg`; radius çağrıda, içteki kutu `md`) ve `Card tone padding`. **H2** `MENU_PANEL_CLASS` 7 menüde kullanılıyor; hap `shadow-pop` → `shadow-md`;
  kapak/kolaj/oynatıcı `shadow-card`; yüzen panellerde radius `lg`, kenarlık `border-soft`. **N2** durum alfası bitti. **N3** `Badge` 9 sarmalayıcıya taşındı (`ProjectRoleChip`, `ReviewChip`, `RoleChip`,
  `MuteChip`, `HubBadge`, `CommentTargetChip`, `ProfileBadges`; `FocusTypeBadge` `SectionLabel`'e). **M1** `text-[…]` (91) ve `rounded-[…]` (58) token'a çevrildi (yeni `rounded-2xs`, `text-display-xl`).
  **L2** elle hex yalnız Google "G" ve kullanıcı verisi varsayılanında (yorumlu). **N8** Space kartı ikonları/pin.

**Faz 4.**
- **M5** ağırlık politikası (277 dizge; 12–13px metinde bold yok). **M6** seçili çip/segment/gezinme = `primary-soft` + `text-primary` (siyah ters çevirme kalktı). **M2** kart örtüsü `.art-scrim` (alt kenarda %72 → şeffaf),
  `OnArtContext` ile başlık/kicker boyanır (CSS torun kancası kalktı), Odak/vitrin/sonuç kartı `text-on-art*`. **M3** header, detay eylem çubuğu, compose çubuğu opak; Button primary ve resting gölgelerde iç parlama yok;
  `CardBandBackdrop` bulanık resim kopyası kalktı. **M4** boş durum pırıltıları kalktı; 25 ana boş duruma çizgi sahne. **M7** ham düğme/alan `h-7/h-8` kalktı (112 yer → `h-9`), sidebar satırı 40, çip 36.
  **M8** detay başlığı `text-display-xl`, bölüm başlığı `text-h2`. **N1** ekip rengi arayüzde üç görünüm (`primary`/`sky`/`plum`); `secondary`/`success`/`warning` eşlenir, DB değerleri değişmedi.
  **N4** `PillChoice` + `SegmentedChoice` → tek `ChoiceGroup` (radiogroup). **N5** tek `ToastBar` (5 toast), tek `Banner` (ekip konuk bandı, "Sana özel" ipucu), yüzen bildirim kartı `FLOATING_PANEL_CLASS`.
  **N6** profil ve header kenar boşluğu sistem gutter'ı. **H8** ızgara her yönde 16 (telefon 12), `lib/grid-columns.ts`, yan sütun `--aside-w`.
  **N9** `tests/design/touch-targets.mjs` (390px, 12 sayfa): bulunan 29 küçük hedef düzeltildi (`tap-area`, `py-2.5 -my-2.5`, `h-9`). **N10** `outline-none` için `focus-ring-inset` + `src/lib/focus-ring.test.ts`.

**Faz 5.** Tüm tasarım kuralları ESLint HATASI (`eslint.config.mjs`; ihlali olmayan kural olduğu için) ve `scripts/design-metrics.test.mjs` `npm test`te her sayacın hedefte kaldığını denetler;
`CLAUDE.md` §4'te "Tasarım sistemi kilidi" paragrafı.

**Sınırlar.** Gerçek Supabase/cihaz DENENMEDİ. `shadow-pop` hâlâ ~120 menü/diyalog/sheet satırında elle yazılı (yalnız hap/kapak yüzeylerinde kuralla yasak). `Card` JSX bileşeni yalnız yeni kodda; mevcut kutular
`card-*` sınıflarını kullanır. `ReplyThumb`, `TeamMark`, `ReactionIcon` gibi piksel kutusu `size` alan bileşenler ikon ölçeğinden muaf. Ekip tonu seçici artık 3 seçenek sunar.
