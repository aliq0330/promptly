# 452 — Alıntı: iç içe kart + "Alıntılanan içerik" çerçeveli sayfa

**Durum:** uygulandı (yalnız istemci; migration/Edge Function yok). Ağ taklitli `run-quotes` 12/12; gerçek Supabase'e karşı denenmedi.

## Neden

`217-*`'deki alıntı kartı normal gönderi kartının (`ContentCardPost`) aynısıydı: büyük görsel, altında not, en altta ALINTILAYAN. Üç sorun:
1. Normal gönderiden yalnız küçük "Alıntı" rozetiyle ayrılıyordu.
2. Sıra tersti: alıntıda asıl mesaj alıntılayanın notudur, kartta en sona düşüyordu.
3. ORİJİNAL YAZAR kartta hiç görünmüyordu (yalnız alıntı sayfasında).

Alıntı sayfasında da (`217-*` bunu "normal detay sayfası" yapmıştı) beğeni/yorum çubuğu orijinalin bandının altında duruyor ve orijinale aitmiş gibi okunuyordu.

## Ne değişti

**Kart (`quotes/quote-card.tsx`)** — `ContentCard variant="box"` kabuğu (yüzey, uzanan bağlantı, çıkış animasyonu) aynı; iç yerleşim bilerek `ContentCardPost`'tan ayrı çünkü alıntı iki katmandır:
- DIŞ kart ALINTININDIR: "Bob alıntıladı · 2 ay önce" (zaman = alıntı sayfasına gerçek bağlantı), not, ⋮ menüsü (`QuoteMenu`), ALINTININ sayaçları (`data-quote-engagement`). Dış karta tıklamak alıntının sayfasını açar.
- İÇ kart ORİJİNAL içeriktir (`data-quote-original-card`, `card-flat rounded-md`): kapak/çıktı (oynayan video/ses dahil), tür etiketi, başlık, alt satırda ORİJİNAL YAZAR (`data-quote-original-author`); kendi uzanan bağlantısı orijinal içeriğin sayfasını açar (`data-quote-original-link`). Başlık ve yazar bağlantıları `z-10`.
- İçerik gittiyse iç kartın yerine "artık görünmüyor" kutusu; Skill için özet paneli.
- "Alıntı" rozeti kalktı (fiil + dış kart zaten söylüyor).

**Sayfa (`quotes/quote-page.tsx`)** — yukarıdan aşağı:
1. Alıntılayan satırı + not + `QuoteActionBar` (beğeni · yorum [aşağıdaki yorumlara atlar] · istatistik · paylaş, yanında "Beğeni ve yorumlar bu alıntıya aittir"), ⋮ menüsü (sil / şikâyet) bu satırda.
2. `data-quote-original` çerçevesi: üstte "Alıntılanan içerik · {yazar}" + "Orijinal içeriği aç" (`data-open-original`); içinde alıntılanan içeriğin NORMAL detay sayfası.
3. `QuoteComments` (`#comments`): ALINTININ yorumları.

Çerçevenin içinde detay bileşenleri `QuoteScope.embedded` ile sadeleşir (`detail-parts.tsx`): `DetailActionBar` yalnız birincil eylemini (Yanıtla, Studio'da aç, Panoyu gez…) çizer, `DetailComments` hiçbir şey çizmez, `DetailShell` alt boşluğu küçültür. Orijinalin bandındaki ⋮ menüsü orijinale ait eylemleri (ilişki haritası, düzenleme öner) taşımaya devam eder; ALINTI işleri yalnız üstteki menüdedir.

## Kurallar (yeni kod için)
- Yeni bir alıntı yüzeyi dış=alıntı / iç=orijinal ayrımını korur: alıntının sayaçları dış katmanda, orijinalin yazarı iç katmanda.
- `QuoteScope.embedded` yalnız alıntı sayfasının çerçevesinde ayarlanır; başvuru gönderisi (`PostScope`) sayfası değişmedi.
- `QuoteEngagement` (tek parça beğeni+yorum bloğu) kaldırıldı; yerine `QuoteActionBar` + `QuoteComments`.
- Yeni i18n anahtarları: `quotes.page.originalLabel`, `quotes.page.engageHint` (TR+EN eklendi); `scopeHelp` ve `commentsHelp` kullanılmadığı için kaldırıldı.

## Test
`tests/messaging-ui/run-quotes.mjs` güncellendi: (1) iç kart başlık/yazar/bağlantı, dış kart bağlantısı, sayaçların dış kartta olması; (2) sayfa sırası not → alıntı satırı → çerçeve → yorumlar, çerçevede eylem çubuğu/yorum yok; (12) ⋮ menüsü başlıkta; (11) İngilizce + telefon, yatay taşma yok.
