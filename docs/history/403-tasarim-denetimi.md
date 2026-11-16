# 403 — Tasarım denetimi: sistemi uygulanır hale getirmek

Kullanıcı Promptly'yi "unslop" çerçevesiyle baştan sona denetletti; kimlik (Meydan, Bricolage/DM Sans/JetBrains Mono, Phosphor, hap düğmeler,
mavi/turuncu rol ayrımı) KORUNDU. Bulgular sistemin kendi kurallarının uygulanmamasıydı: ortak bileşen varken elle yazılmış yüzeyler,
ölçek dışı ikon/metin değerleri, 11px metin, büyük harfli etiketler, parçalanmış switch/rozet/menü. İş iki PR'da yapıldı.

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
