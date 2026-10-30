# 276 — Kaydırırken kayma: FLIP kaydırmayı hareket sanıyordu + CSS sütunları sayfa eklenince yeniden dengeleniyordu; ilgi kartına ok

**Durum:** uygulandı, yalnız istemci kodu (migration yok). Ağ taklitli Playwright'ta sınandı (`run-feed-scroll` 3/3 — düzeltmeden önce 1/3; `run-interest` 12/12, `run-home-motion` 10/10, `run-feed-filters` 18/18, `run-discover` 9/9, `run-pagination` 16/16, `run-detail-pages` 45/45, `run-quotes` 12/12). Gerçek telefona / iOS Safari'ye karşı denenmedi.

## Şikâyet
Ana Sayfa'da aşağı kaydırırken sonraki sayfa yüklenirken "çok hızlı bir anda kayma" oluyordu.

## Kök nedenler (ikisi de tarayıcıda yeniden üretildi)
1. **Sana özel'de sahte yeniden dizilme animasyonu** (`FeedGrid` → `useFlipReorder`). Hook her render'da kartların `getBoundingClientRect()` kutularını bir önceki render'la karşılaştırıp kayanları eski yerinden yenisine 460 ms kaydırıyordu (Sana özel `flip` açık). Ekran koordinatı kaydırmayla da değiştiği için, kullanıcı kaydırdıktan sonra "daha fazla yükle" render'ı (yükleniyor durumu, yeni sayfa, ilgi cevabı…) bütün kartlara `translate(0, kaydırma farkı)` animasyonu uyguluyordu: telefonda 3 sayfa kaydırınca 108 animasyon. Düzeltme: animasyon yalnız liste SIRASI gerçekten değişince (yeniden sıralama: Yenile, ilgi alanı) çalışır; aynı liste ya da yalnız sona eklenen sayfa hareket değildir; kutular sayfa koordinatında (görünüm + kaydırma) tutulur; pencere boyutu değiştiyse animasyon yok.
2. **CSS sütunları her ekleme sonrası tüm listeyi yeniden dengeliyordu** (yalnız `sm`+ iki/üç sütunda; telefon tek sütun). Tek `columns-*` kapsayıcısına kart eklenince tarayıcı sütun yüksekliklerini yeniden dengeler: ilk sayfadaki kartlar sütun değiştirir (masaüstünde 288 px'teki kart başka sütuna atlıyordu). Keşfet'te de vardı. Düzeltme: `FeedGrid` her yüklenen sayfayı KENDİ sütun bloğunda çizer (`FEED_PAGE_SIZE = 18`, `feed.ts`'te dışa açıldı; tüm akış sorguları aynı sayfa boyunu kullanır) — çizilmiş bir blok bir daha değişmez, yalnız son (kısmi) blok kendini dengeler. Blok anahtarı sıra numarasıdır (yeniden sıralamada aynı blok içindeki kartlar DOM'da kalır, FLIP süzülmesi sürer).

## İlgi kartına ok
"Bu gönderi ilgini çekiyor mu?" kutusunun üst kenarına, kutuyla tek şekil gibi görünen küçük bir çentik (döndürülmüş kare, aynı dolgu + yalnız üst-sol kenarlık) eklendi; ucu yukarıdaki gönderiyi gösterir (`StripShell`, `data-interest-notch`). Teşekkür durumu aynı kabuğu kullanır.

## Doğrulama
- `tests/messaging-ui/run-feed-scroll.mjs` (3): (1) telefonda 3 sayfa kaydırınca kartlara FLIP animasyonu uygulanmaz (öncesi 108), (2) önceki kartların sayfa konumu sayfa eklenince değişmez, (3) masaüstü iki sütunda ilk sayfanın kartları sütun/konum değiştirmez (öncesi değiştiriyordu).
- `tsc`, `lint` (0 hata) temiz; yeni kullanıcıya görünür metin yok (İngilizce karşılık gerekmedi).

## Bilinçli sınırlar
- Sayfa sınırında (18'in katı) iki blok arasında sütun sonları dengelenmiş kalır ama blokların sütun yükseklikleri farklıysa boşluk bir miktar eşitsiz görünebilir (kartlar yine kayma yapmaz).
- Bir sayfadan kopya elenirse (Sana özel birleştirmesi) sayfa 18'den az kart ekler; blok sınırları kayar ve son kısmi blok yeniden dengelenir (yalnız listenin altında).
- Yeniden sıralamada bir kart bloktan bloğa geçerse süzülmez, yerinde belirir.
