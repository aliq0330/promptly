# 205 — Bildirimlerde "Topluluklar" sekmesi + aramada Tümü · Gönderiler · Kişiler · Topluluklar

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / cihaza karşı denenmedi.

## Neden
Kullanıcı topluluk bildirimlerinin bildirim merkezinde kendi sekmesinde toplanmasını, aramanın toplulukları da kapsamasını ve sonuçların gerekirse Gönderiler / Kişiler / Topluluklar diye ayrılmasını istedi ("rastgele bir şey yapma, başka yerleri bozma").

## Bildirimler
- Topluluk bildirimlerinin kendi türü yoktur (sunucu `system`, gönderi etkileşiminde `like`/`comment`/`comment_reply` yazar), bu yüzden sekmeyi bildirimin **adresi** belirler — `lib/notification-scope.ts` `isCommunityNotification(type, href)`:
  topluluk sayfası (`/communities…`, eski `/groups…`) her türde; `system` + `/messages/local?id=` (topluluğun sohbetine bağlanan katılım isteği/rol/sohbet bildirimleri — birebir mesaj bildirimleri `message`/`message_request` türündedir).
- `notificationCategory(n)` (`lib/notification-utils.ts`) türün kategorisini bu kuralla ezer; sekme sırası Tümü · Gönderiler · İstekler · Takip · Mesajlar · **Topluluklar** · Sistem (etiket `nav.communities`).
- Bilinen sınır: toplulukta oluşturulmuş içeriğe gelen beğeni içeriğin kendi adresine gider (`/prompts/local?id=`), adresten ayırt edilemez → "Gönderiler"de kalır. Ayırmak için migration (bildirime `community_id`) gerekir.

## Arama (`features/search/search-view.tsx`; Keşfet'teki kutu, `/search` Keşfet'e yönlenir)
- Sonuçların üstünde sekmeler (`Tabs`, `?tab=posts|people|communities`, Tümü adresi temiz bırakır):
  - **Tümü:** önceki görünüm + düz metin aramasında Topluluklar bölümü (en çok 4 kart; fazlası "Tümünü gör" → sekme). Kişiler de en çok 4 + "Tümünü gör". Etiketler yalnız burada.
  - **Gönderiler:** workflow · hazır ayar · istek · prompt; sıralama çipleri ve Kart | Izgara yalnız Tümü/Gönderiler'de.
  - **Kişiler:** kişi sonuçları (`searchProfiles`, en çok 20).
  - **Topluluklar:** mevcut `search_communities` RPC'si (`searchCommunities`, sayfalı "Daha fazla yükle"), aynı `CommunityCard` + tek üyelik düğmesi; hata → `ErrorBox` + Tekrar dene. Tamamen kapalı topluluk sunucuda asla dönmez, kapalının kartında içerik istatistiği yok (değişmedi).
- Çipler (kişi/etiket/tür/araç) yalnız gönderilere uygulanır: Kişiler/Topluluklar sekmesi yazılan metinle arar; metin yoksa açıklama gösterir ve istek atmaz. "Tümü" kişileri/toplulukları önceki gibi yalnız düz metin aramasında gösterir.
- Değişmeyenler: arama kutusu ve önerileri, tür liste sayfalarının araması, Keşfet bölümleri, Topluluklar sayfasının kendi araması.

## Testler
`npm test` (+ `notification-scope.test.ts` 3), yeni `run-search-notifications` 8/8 (sekme sırası ve içerikleri, İngilizce, tamamen kapalı yok, `?tab=`, yalnız filtre, hata/yeniden dene, telefon taşması, Keşfet'te boşaltınca bölümler geri gelir) ve önceki UI paketleri.
