# Substack tasarım dili — ölçüm ve Promptly karşılaştırması

Bu dosya referans uygulamanın (substack.com) arayüzünü **tarayıcıdan okunan hesaplanmış stillerle** inceler ve Promptly ile karşılaştırır. Görsel karşılığı tuvaldedir: <https://claude.ai/artifact/EVQX4wJeHRABQiuSsripo3> (18 pano; yalnız sahibi açabilir). Tuvalin kaynak dosyaları `docs/mockups/referans-tuval/` altındadır (`*.dc.html` + `canvas.json`; Design editörünün biçimi, tek başına tarayıcıda açılmaz).

## 1. Kapsam ve sınırlar (dürüst not)

**Ölçüldü** — 390 / 820 / 1440 px genişlikte: ana sayfa, keşfet, gelen kutusu (abonelikler), sohbet iskeleti, giriş penceresi ve giriş sayfası, bir herkese açık yazı sayfası, paylaş penceresi, abone ol penceresi.

**Ölçülemedi** — giriş gerektirdiği için: ayarlar sayfaları, gerçek bildirim (Etkinlik) listesi, sohbet balonları ve mesaj menüleri, hover/basılı durumlar, karanlık mod. Tuvaldeki U3 (bildirimler) ve U4 (ayarlar) bu yüzden **öneridir**, referans ölçümü değildir. Sohbet panosunda (R7) yalnız ölçülen iskelet (ray, arama, segment, boş durum, yazma alanı) gösterilir.

Ölçülmüş olsa da bazı gölge değerleri kısaltılmış okundu; "≈" işaretli değerler tahmindir. Yazı tipi yığını sistem fontudur (`SF Pro Display`, `system-ui`); tuvalde Inter ile temsil edildi. Çizimler markasız yeniden çizimdir, ekran görüntüleri depoya konmadı.

Yeniden ölçmek için: `node docs/design-references/olcum/ekran-goruntusu.cjs <klasör>` ve `hesaplanmis-stiller.cjs <klasör>` (Playwright gerekir).

## 2. Temel ilkeler

1. **Tek vurgu rengi** (turuncu), yalnız ana eylemde ve küçük işaretlerde (okunmamış noktası, bağlantı).
2. **Sakin kabuk**: beyaz zemin, 1 px yarı saydam kenarlık, neredeyse gölgesiz yüzey; gölge yalnız yüzen öğede (pencere, hap).
3. **İki köşe dili**: 8 px (düğme, alan, sekme) ve 12 px (kart, gezinme öğesi); pencere 20; çip/hap tam yuvarlak.
4. **Uygulama kabuğunda sayfa başlığı yok**: masaüstünde gezinme zaten bağlamı verir, telefonda ad üst çubukta (20/700).
5. **İki ses**: sans arayüz, serif okuma gövdesi.

## 3. Renk

| Rol | Değer | Not |
|---|---|---|
| Vurgu | `#ff6719` (hover `#ff5600`) | metin olarak `#d74d00` |
| Metin | `#363737` | |
| İkincil metin | `#777777` | pasif sekme, etiket, saat |
| Yüzey kontrastları | `#f0f0f0` `#dddddd` `#b7b7b7` `#929292` `#515151` | CSS değişkenleri `--background_contrast_1…5` |
| Pasif çip/segment zemini | `#eeeeee` | |
| Koyu düğme | `#161718`, metin `#eeeeee` | ikincil güçlü eylem |
| Kenarlık | `rgba(0,0,0,.1)` | |
| Odak | `#005dd9` + halka `rgba(0,118,255,.2)` | marka renginden bağımsız |
| Vurgu zemini | `rgba(255,103,25,.2)` | logo karosu |
| Yayın temalı vurgu | yayına göre değişir (örnekte `#9a6600`) | yazı sayfasında Abone ol düğmesi |

## 4. Tipografi

| Kullanım | Boyut / ağırlık / satır | Yazı tipi |
|---|---|---|
| Vitrin başlığı | 44 / 700 / 44.9 | sans (+ italik serif vurgu) |
| Yazı başlığı | 32 / 700 | sans |
| Telefon sayfa adı | 20 / 700 / 24 | sans |
| Pencere başlığı | 17 / 600 / 24 | SF Pro Display |
| Düğme | 15 / 600 / 20 | sistem |
| Alan, bağlantı | 15 / 400 / 20 | sistem |
| Kategori çipi | 14 / 600 | sistem |
| Sekme, küçük düğme | 13 / 600 / 20 | sistem |
| Etiket | 12 / 500, büyük harf, ≈.04em | sistem |
| Mikro hap / zaman | 11 / 600, 9 / 600 | sistem |
| Okuma gövdesi | 19 / 400 (satır ≈30) | Spectral (serif) |

## 5. Köşe, gölge, boşluk

- **Köşe**: 4 (küçük iç öğe) · 8 (düğme, alan, sekme, segment) · 12 (kart, gezinme öğesi, vitrin) · 20 (pencere, etkileşim hapı) · 9999 (hap, avatar).
- **Gölge**: alan `0 1px 2px rgba(0,0,0,.05)`; yüzen hap orta (`0 4px 6px -1px .1`, Tailwind `shadow-md` benzeri); pencere büyük (`0 10px 15px -3px .1`, `shadow-lg` benzeri); ana düğmede içte `0 1px 0 rgba(255,255,255,.2)` ışık çizgisi.
- **Yükseklik**: düğme/alan 40 · vitrin düğmesi 48 · çip 42 · segment kabı 40 / sekme 32 · gezinme simge kutusu 48×48 · kapat düğmesi 32 · etkileşim hapı 40.
- **İç boşluk**: düğme `0 16`, alan `8 12`, sekme `0 8`, liste satırı 20, vitrin kartı 40.
- **Yerleşim genişlikleri**: üst çubuk 64 (telefon 56) · ray 80 · kenar çubuğu 232 (satır 200×48, adım 56) · sohbet listesi 400 · gelen kutusu sütunu 600 (ortada) · keşfet 560 + 372 sağ sütun · ana sayfa 1184, 4 sütun, aralık 16 · telefon kenar boşluğu 16.

## 6. Bileşen kataloğu

**Düğme.** Ana: dolu vurgu, 40/8, 15/600, içte ışık çizgisi. İkincil güçlü: `#161718`. Anahtar: kenarlıklı beyaz (`Parola ile giriş`). Üçüncül: zeminsiz. Küçük: 32 yükseklik, 13/600. Vitrin: beyaz 48/12, belirgin gölge.

**Alan.** 40/8, 1 px `rgba(0,0,0,.1)`, hafif gölge, 15/400, dolgu `8 12`. Aramada simge solda (dolgu sol 40). Odakta kenarlık `#005dd9` + 3 px halka. Abone ol alanı: alan + düğme tek kapsül, kenarlık yayın renginde.

**Çip / segment / sekme.** Ana sayfa kategori çipi: 42 hap, 14/600, seçili koyu dolgu. Keşfet/telefon süzgeci: 32 yükseklik, köşe 8, 13/600, seçili siyah. Segment (gelen kutusu, sohbet): 40 kap, 32 sekme, seçili `#eee`.

**Etkileşim.** Yazı sayfasında beğeni/yorum/yeniden paylaş/paylaş: 40 yükseklik, köşe 20, `#e6e6e6` kenarlık, sayaç yanında. Liste satırında yalnız simge + sayaç (kapsülsüz).

**Menü / açılır panel.** 1 px kenarlık, köşe ≈12, orta gölge, satır ≈36, seçili satır `#f0f0f0`. Sıralama tetikleyicisi 40 yükseklik kenarlıklı düğme (simge + ad).

**Pencere.** Ortada, köşe 20, 442 geniş, 20 iç boşluk, 1 px kenarlık + büyük gölge, arkası düz yarı saydam karartı (bulanıklık yok). Giriş: simge karosu → başlık → alt satır → alan → ana düğme → «ya da» ayracı → anahtar düğme. Alan açılışta odaklı. Telefonda tutamaçlı alt kart (kenara yapışık, üst köşeler 20).

**Paylaş.** Başlık + kapat, önizleme kartı (köşe 12), tek satırda 5 eylem (64×64 kare, köşe ≈20, `#eee`, altında 11/500 etiket): bağlantı, sosyal, e-posta, notlar, daha fazla.

**Liste satırı.** Kartsız; 20 iç boşluk; alt çizgi; üstte etiket (12/500 büyük harf) + sağda saat + okunmamış 8 px nokta; başlık ≈17/700; özet 14/400 ikincil renk; alt satır eylemler.

**Kart (not).** `#f5f5f5` (≈) zemin, köşe ≈16, kenarlıksız, gölgesiz, iç boşluk ≈16; ad 13/600, metin ≈17/400.

**Gezinme.** Masaüstü kenar çubuğu: 7 hedef, tek liste, seçili satır kalın metin + dolu simge + hafif zemin, altta tam genişlik «Oluştur». Ray: aynı hedefler etiketsiz, simge kutusu 48×48/12, oluştur 40 vurgu kare. Telefon: üst çubukta logo + sayfa adı + giriş/uygulama, altta 4 simgeli etiketsiz alt menü (≈64).

## 7. Duyarlı davranış

| Genişlik | Kompozisyon |
|---|---|
| 390 | üst çubuk 56 (ad solda), alt menü 4 simge, tek sütun, kenar boşluğu 16, pencere alt kart |
| 820 | 80 px ray, tek sütun (gelen kutusu 600 ortada), üstte giriş düğmeleri |
| 1440 | etiketli kenar çubuğu 232 + içerik; **sohbette masaüstünde de ray** (çalışma alanı), keşfet'te sağ sütun 372 |

## 8. Promptly karşılaştırması

Promptly değerleri koddandır (`src/app/globals.css`, `components/ui/*`, `components/layout/*`).

| Bileşen | Referans | Promptly | Karar |
|---|---|---|---|
| Ana düğme | 40, köşe 8, 15/600, ışık çizgisi | 40, tam hap, 14/600, düz mavi | Bilerek farklı (hap kimlik) |
| Alan | 40, köşe 8, silik kenarlık | 44 (dense 40), köşe 16, `#868899` (≥3:1) | Bilerek farklı (erişilebilirlik) |
| Odak | kenarlık + 3 px halka | 2 px çerçeve + mavi kenarlık | Yakın; halka alınabilir |
| Çip | 42 hap, seçili koyu | 36 hap, seçili primary-soft + mavi | Bilerek farklı (renk kuralı) |
| Segment | 40 kap / 32 sekme / köşe 8 | kap köşe 16, sekme 36 / köşe 12, seçili beyaz + halka | Yakın |
| Etkileşim hapı | 40, köşe 20, sayaç yanında | kartta simge; detay çubuğunda hap yok | Alınabilir (detayda) |
| Kart | `#f5f5f5`, köşe 16, düz | görsel kart kutusuz, `card-flat/soft` | Yakın |
| Liste satırı | kartsız, alt çizgi, nokta | bildirimler genişleyen kart, mesajlar düz | Alınabilir (bildirim) |
| Pencere | köşe 20, büyük gölge, %50 karartı | köşe 16, `shadow-pop` | Aynı mantık; köşe 20 alınabilir |
| Paylaş | önizleme + 5 eylem | kişiler önce + simge satırı | Aynı (Promptly daha zengin) |
| Ray | 80 etiketsiz | 84 etiketli | Yakın |
| Kenar çubuğu | 232, 7 hedef | 248, gruplu | Bilerek farklı |
| Alt menü | 4 simge etiketsiz | 5 yuva etiketli, kayan çizgi | Bilerek farklı |
| Yazı | sistem sans + serif | DM Sans + Bricolage + JetBrains Mono | Aynı ilke (iki ses) |
| Vurgu | turuncu tek | mavi eylem, turuncu «senin olan» | Aynı ilke |

## 9. Uyarlanacak fikirler (öneri sırası)

1. **Pencere köşesi 20 + alanda odak halkası** — `components/ui/modal.tsx`, `field.tsx`; küçük, tek yerden.
2. **Mesajlar listesi**: arama + oluştur tek satır, altında tam genişlik segment (Tümü · Kişisel · Topluluk · Ekip); çip satırı kalkar — `features/messages`.
3. **Bildirimler**: kartsız düz satır (20 iç boşluk, alt çizgi, okunmamış turuncu nokta); gruplama ve ayrıntı bölmesi aynı — `features/notifications`.
4. **Detay eylem çubuğunda sayaçlı hap** (40 / köşe tam / kenarlıklı); kartta yalnız simge kuralı değişmez — `features/content/detail-parts.tsx`.
5. **Ayarlar**: 600 px okuma sütunu, kartlı düz satırlar (referansta ölçülemedi; ilke önerisi) — `features/settings`.

**Bilerek almıyoruz:** 8 px köşeli düğme, silik alan kenarlığı, siyah seçili çip, turuncu tek vurgu, etiketsiz ray/alt menü, tek 600 px sütun, serif gövde.

Bu bir **öneridir**; hiçbir uygulama kodu değiştirilmedi. Uygulanırsa `CLAUDE.md` Bölüm 4'teki ilgili kural ve `docs/history/` kaydı birlikte güncellenir.
