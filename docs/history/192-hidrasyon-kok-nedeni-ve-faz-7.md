# 192 — React #418 hidrasyon hatasının kök nedeni + Meydan Faz 7 (profil koleksiyon halkaları, Mesajlar satırları)

**Durum:** uygulandı (yalnız istemci kodu, veritabanı değişikliği YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase/oturum/cihazla denenmedi.

## 1. #418 hidrasyon hatası — kök neden bulundu ve giderildi
`190-*`'daki "aralıklı React #418, çözülmedi" notunun kapanışı.

- **Yeniden üretme:** aynı sekmede art arda tam sayfa yüklemesi (ikinci ve sonraki yüklemelerde betikler önbellekten gelir). Yeni sayfa açıldıkça değil, TEKRAR yüklemelerde çıkıyordu; `/terms` (sade yasal sayfa) bile 13/40, `/login` 23/40, `/communities` 11/40 yükte hata verdi — yani sorun sayfada değil kök layout'tadır. Bu yüzden eski paketlerde rastgele senaryolar düşüyordu (aynı sekmede birden çok `page.goto` yapanlar).
- **Kök neden:** `src/app/layout.tsx`'teki elle yazılmış `<head>` ve içindeki iki satır içi betik (tema + dil başlatma). Bu `<head>` kaldırılınca hata 0/40'a indi.
- **Düzeltme:** iki betik aynen korunarak `<body>`'nin ilk çocukları yapıldı. Ayrıştırma sırasında, ilk boyamadan ÖNCE çalışırlar (koyu tema + palet + dil `DOMContentLoaded`'da zaten uygulanmış — sınandı), hidrasyon bozulmaz. Üç sayfada 40'ar yükte 0 hata.
- **Denenip bırakılan:** `next/script strategy="beforeInteractive"` — hatayı giderir ama betik Next'in istemci kodu yüklendikten sonra çalışır (`__next_s` kuyruğu); tema/dil için ilk boyama öncesi garantisi kaybolur → kabul edilmedi. Önceki oturumdaki `htmlLimitedBots` denemesi de işe yaramamıştı.
- **Doğrulama:** hidrasyon filtresi OLMADAN tüm paketler geçti: `run-community-home` 38/38, `run-communities` 65/65, `run-detail-pages` 44/44, `run-groups` 36/36, `run-community-posts` 36/36, `run-chat` 35/35, `run` 24/24. (Eskiden 33–36/38 arası dalgalanırdı.) Testler değiştirilmedi.
- **Kural:** kök layout'a elle `<head>` + satır içi betik EKLEME; sayfa-öncesi betikler `<body>`'nin başına konur.

## 2. Profilde koleksiyon halkaları
- `features/profile/collection-rings.tsx`: profil başlığının altında, herkese açık ve boş olmayan koleksiyonlar yuvarlak kapak + ad olarak yatay şerit; halka rengi kobalt (Ana Sayfa topluluk halkaları sıcak/nötr kalır), kapak = koleksiyonun en yeni öğesinin görseli, yoksa simge karosu (Genel = yer imi). Her halka koleksiyonu açar.
- Veri: mevcut `fetchPublicCollectionsByOwner` (yalnız `visibility='public'` + `item_count>0`). Önceden yalnız başkasının profilinde çekiliyordu; şimdi kendi profilinde de (özel koleksiyon sızmaz, sorgu açıkça süzer). "Koleksiyonlar" sekmesi (başkasının profili) ve sahibin "Kaydedilenler" sekmesi aynı kaldı. Koleksiyon yoksa şerit hiç çizilmez.
- Kendi profilinde sıra: topluluk halkaları → koleksiyon halkaları.

## 3. Mesajlar liste satırları
- Yapısal değişiklik yok; `conversation-row/list` görünümü: satırlar yumuşak yuvarlak hücre, açık sohbet dolu `primary-soft` zemin (eski yan çubuk gitti), kenarlık çizgileri yok, okunmamış sohbetin adı kalın + önizlemesi tam koyu. Mesaj balonlarına, sohbet başlığına, yazıya dokunulmadı (zaten Meydan jetonlarıyla uyumluydu). Masaüstü açık/koyu ve 390px ekran görüntüleriyle bakıldı.

## Sınama
`tsc`, `lint` (eski 4 uyarı), `npm test` 349, `next build` temiz. Yeni paket `tests/messaging-ui/run-profile-collections.mjs` (4 senaryo: başkasının profili süzgeçleri + bağlantı + kapak/simge, kendi profil + `visibility=public` sorgusu, koleksiyon yoksa şerit yok, İngilizce + 390px taşma yok).

## Çeviri
`profile.collectionRingsLabel` TR+EN ("Herkese açık koleksiyonlar" / "Public collections"). Başka yeni metin yok.

## Denenmedi / açık
- Gerçek Supabase/oturum/cihaz; gerçek tarayıcıda (ağ gecikmeli, önbellekli betik) hidrasyonun tekrarı bu sandbox'taki yerel sunucuyla sınandı — gerçek CDN'de denenmedi.
- Kalan aday: Mesajlar'da daha derin Meydan dönüşümü (ör. sohbet başlığı/balon dili) — gerekirse ayrı faz.
