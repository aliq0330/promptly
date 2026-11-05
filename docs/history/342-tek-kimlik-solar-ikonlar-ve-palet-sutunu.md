# 342 — Tek kimlik, Aşama 2–4: Solar ikonlar, lucide'in kaldırılması, `theme_palette` sütununun silinmesi

**Durum: kodlandı (repoda). Migration `20261106100000_drop_profiles_theme_palette.sql` deploy hattıyla uygulanır — canlıda olup olmadığına
`schema_migrations`'tan bak.**

341'in devamı. Kullanıcı "kalan aşamaların hepsini tek seferde yap, dört aşamayı birden merge et" dedi. Önceki önerilerin hepsi
kabul edildi: tepki gösterimi aynı kalır (emoji), kontrol işaretleri Solar Linear, palet sütunu silinir.

## Aşama 2–3: ikonlar
- **Kaynak:** kullanıcının verdiği Framer "Moon Sleep" ikonu, Solar Icon Set'in Bold Duotone stilidir (yol verisi birebir aynı;
  480 Design, **CC BY 4.0** — ücretsiz, atıf ister). Veri `@iconify-json/solar` GELİŞTİRME bağımlılığından okunur.
- **Üretici:** `scripts/build-icons.mjs` — `ICON_MAP` (bileşen adı → Solar adı, `:l` = Linear) 267 adı eşler; her ikonu
  `src/components/icons/<ad>.tsx` dosyasına JSX olarak yazar (Iconify gövdesi → JSX; `id`/`mask`/`defs` içeren gövde reddedilir), ortak
  bileşen `icon.tsx`. `--check` elle düzenleme/eskime yakalar. Çalışma zamanında ikon paketi ya da ağ YOK.
- **Neden ikon başına dosya:** ilk denemede tek `index.tsx` (barrel) vardı; Turbopack onu bölmedi ve 267 ikonun hepsi (≈ 337 KB ham,
  106 KB gzip) giriş sayfası dahil HER sayfaya yüklendi. lucide de ikon başına modül verir; aynısı yapıldı ve import'lar doğrudan
  dosyayı gösterir (`import { Heart } from "@/components/icons/heart"`). Barrel bilerek yok; `icons.test.ts` barrel import'u reddeder.
- **Uyumluluk:** bileşen adları ve prop'lar lucide'deki gibi (`size`, `className`, `strokeWidth`, `fill`, `aria-*`); 385 dosyada yalnız
  import satırı değişti (`LucideIcon` tipi → `IconComponent`, 58 dosya). `aria-hidden` lucide gibi varsayılan; `aria-label` verilince kalkar.
- **Stil kuralı:** "şey" ikonları Bold Duotone (ikinci ton opaklık .5); `fill` verilen ikon (ör. çalan ▶) ya da `icon-solid` sınıfı tonu tam
  opak yapar (`globals.css` `.icon-solid *`). Küçük kontrol işaretleri (✕, ✓, oklar, +/−, geri al/yinele, hizalama, harici bağlantı,
  tam ekran) Linear — iki tonlu ✕ 14 px'te leke gibi okunuyordu. `Loader2` kendi çeyrek-eksik halkamız.
- **Hareketli ikonlar** (`motion-icons.tsx`): çöp kutusu, yer imi, raptiye, zil, kâğıt uçak ve alt menü (Ana Sayfa, Keşfet, Topluluklar,
  Odak) Solar şekilleriyle yeniden çizildi; animasyon sınıfları (`mi-lid`, `mi-roof`, `mi-needle`…) aynı. Opaklığı canlandırılan parçalar
  bir `<g>` içinde (aksi hâlde `animation-fill-mode: both` yarı saydam tonu animasyon sonunda tam opak bırakırdı). Tik, yukarı ok, "+" ve
  takip işareti çizgi kaldı. Raptiye sabitlenince dolu (`icon-solid`); Solar raptiye zaten çapraz olduğu için eski "yatıkken
  sabitlenmemiş" görünümü artık "dikken sabitlenmemiş" okunur.
- **Yaklaşık eşlemeler** (Solar'da birebir karşılığı yok): Megafon → hoparlör (`volume-loud`), Mikroskop → nesne tarama, Kılıçlar →
  yıldızlı kupa, PinOff → daire içinde raptiye, CalendarX → sade takvim, Group/Ungroup → kesikli kareler, Hand (pano kaydırma) → dört
  ok (`move`), DoorClosed → çıkış. Daha iyisi bulunursa yalnız `ICON_MAP` değişir.
- **Atıf:** Kullanım Koşulları'na "Üçüncü taraf lisansları" bölümü (TR+EN: Solar CC BY 4.0, fontlar OFL 1.1, logo/tepkiler Promptly'nin).
  Bilgi amaçlı ek, koşulların anlamını değiştirmez — `TERMS_VERSION` ARTMADI. Ayrıca her üretilen dosyanın başında atıf satırı.
- **`lucide-react` bağımlılığı kaldırıldı.**

## Aşama 4: `profiles.theme_palette`
`20261106100000_drop_profiles_theme_palette.sql` (`-- ci:allow-destructive`): `profiles_theme_palette_check` + `theme_palette` silinir.
Repo tarandı: hiçbir SQL fonksiyonu/politika/tetikleyici/test/Edge Function/betik bu sütuna başvurmuyor. **Geçiş penceresi:** deploy hattı
migration'ı yeni site yayınlanmadan ÖNCE uygular; o birkaç dakikada ve yenilenmemiş açık sekmelerde eski istemcinin tercih okuması hata
alır → `fetchOwnPreferences` null döner (mod/dil yerel değerde kalır), yazma konsola hata yazar. Görünür bir kırılma yok.

## İngilizce karşılıklar
Yeni görünür metin yalnız Kullanım Koşulları'ndaki "Üçüncü taraf lisansları / Third-party credits" bölümü — iki dilde yazıldı. İkonlar metin
taşımaz; `aria-label`'lar çağıran yerde, değişmedi.

## Doğrulama
`tsc` temiz, `npm run lint` 0 hata, `npm test` (yeni `icons.test.ts`: lucide/barrel import yok, her import edilen ikon dosyası ve dışa
verimi var, üretilen dosyalar güncel, atıf satırları), `npm run build` temiz. Yerel PostgreSQL 16'da bütün migration'lar temiz veritabanına
baştan oynatıldı (sütun yok), `anon-hardening.sql` 0 hata.

Ağ taklitli Playwright (bu dal): `run-motion` 6/6, `run-home-motion` 10/10, `run-settings` 13/13, `run-legal-notice` 14/14,
`run-reactions` 11/11, `run-save-collections` 7/7, `run-detail-pages` 47/47, `run-card-title` 4/4, `run-notifications` 34/34 (ilk
turda 33/34 — `main` aynı anda derlenirken; iki tekrarda 34/34), `run-spaces` 32/32, `run-communities` 68/68, `run-focus-feed` 34/35,
`run-discover` 8/9, `run-chat` 37/38, `run-stories` 23/24. Düşen dördü (Odak 9, Keşfet 7, Sohbet 9, Hikâyeler 13) `main`'in kendi
derlemesinde de AYNI şekilde düşüyor — bu değişiklikten bağımsız, düzeltilmedi.

**Paket boyutu** (sayfanın yüklediği JS toplamı, gzip; `main` ile aynı makinede): giriş 430 → 430 KB (değişmedi), Ana Sayfa 794 → 834,
Ayarlar 721 → 757, Keşfet 826 → 869, prompt sayfası 800 → 848 (+36…48 KB, ≈ %5). Barrel'lı ilk denemede +52…61 KB'tı; ikon başına dosya ve
3 haneye yuvarlama (Solar 4–5 hane taşır; 266 ikonun 260'ında 96 px'te hiçbir piksel farkı yok, kalan 6'sında ≤ 4 kenar pikseli) bunu
indirdi. Kalan fark Solar çizimlerinin lucide'den çok daha ayrıntılı yol taşımasıdır — seçilen ikon setinin bedeli. 2 haneye yuvarlama
denendi ve REDDEDİLDİ: yarıçapı kirişin yarısına çok yakın iki yaydan çizilen daireleri (Arama ikonu) bozuyor.

## Sınırlar / denenmedi
- Gerçek telefonda ikonların küçük boyutta okunurluğu, iOS ana ekran ikonu ve maskable kırpma DENENMEDİ.
- Ikon görünümü ekran görüntüleriyle bakıldı; 267 ikonun her birinin bağlamında anlamca doğru olduğu tek tek denetlenmedi.
- Gerçek Supabase'e karşı DENENMEDİ; migration'ı canlıya deploy hattı uygular.
