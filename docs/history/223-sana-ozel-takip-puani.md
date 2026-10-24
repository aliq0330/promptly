# 223 — "Sana özel": takip edilen kişiler tekrar puan alır

**Durum:** uygulandı (istemci metinleri + bir `create or replace` migration). `20260922120000_for_you_followed_points.sql` yerel PostgreSQL'de sınandı (`for-you.sql` 17/17, `feed-filters.sql` 19/19); canlı durumu için CLAUDE.md §9'a bak. Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.

## Neden
222'de kullanıcı kararıyla takip edilen kişilerin gönderileri Sana özel'den çıkarılmıştı. Kullanıcı bunu geri aldı: "takip ettiklerime de puan verilsin, daha önce vardı". Karar: kişi takibi yine sinyaldir; ama Sana özel Takip Ettiklerim'in kopyası olmasın diye eski +600 yerine ölçülü bir ağırlık ve mevcut çeşitlilik cezası kullanılır.

## Değişen (yalnız `for_you_page`, aynı imza ve dönüş sütunları)
- Takip edilen kişilerin herkese açık gönderileri artık adaylardan **çıkarılmaz**; puana **+300** eklenir (etiket 200, araç 150, ilgi alanı 150, beğenilen etiket 50'den ağır: en güçlü açık sinyal).
- **Neden:** kişi > etiket > araç > ilgi alanı > beğenilen etiket > `popular`. `creator` nedeni geri geldi (`reason_ref` = null; metin istemcide "Takip ettiğin {ad} paylaştı").
- Değişmeyenler: kendi/beğenilen/kaydedilen/son 60 günde kopyalanan çıkar, kalite (en çok 200) + tazelik (300·exp(−t/72)), çeşitlilik (aynı yazarın 2., 3. gönderisi −120, −240), keyset + `p_as_of`.
- Sonuç: bir kişinin en iyi gönderisi takip edilen etiketli gönderinin önüne geçer; aynı kişinin ikinci gönderisi çeşitlilik cezasıyla (−120) etiketli gönderinin altına düşebilir. Takip Ettiklerim kronolojik ve eksiksiz kalır; Sana özel aynı gönderileri sıralı + diğer sinyallerle karıştırır.
- Aşırı takipçide Sana özel artık boş kalmaz (yalnız 18 yazarlı sitede 17'sini takip eden hesap için de akış dolar).

## Arayüz
- İlk kullanım kartı koşuluna "kimseyi takip etmiyor" (`profile.followingCount === 0`) eklendi; kimseyi/etiketi/aracı takip etmeyen ve ilgi alanı olmayan kullanıcı kartı görür.
- Metinler (TR+EN eklendi): `forYou.settingsHow`, `forYou.setupDescription`, `feed.emptyForYouLoginDescription`, `feed.emptyForYouDescription` — artık "takip ettiğin kişilerden" sinyal olarak söz eder ve "takip ettiklerin burada değil" demez.
- `forYou.reasonCreator` anahtarı ve `ForYouReasonNote` zaten vardı, yeniden kullanılıyor.

## Doğrulama
- `supabase/tests/for-you.sql` 17 kontrol, `FAILED=0`: takip edilen kişinin prompt'u + workflow'u girer (kendi/beğenilen/kaydedilen/kopyalanan/gizli/taslak girmez); neden `creator` + ref null; sıra kişi > etiket > ilgi alanı > beğenilen etiket > sinyalsiz; workflow süzgecinde takip edilen yazarın workflow'u önde ve `creator`.
- `run-home-motion` 10/10 (son kartın nedeni "Takip ettiğin … paylaştı", ayar penceresi yeni metin), `run-feed-filters` 16/16. `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` 407/407, `npm run build` temiz.

## Bilinçli sınırlar
- +300 elle seçildi, gerçek veriyle ayarlanmadı; tek yerde (SQL).
- Kişi takibi hâlâ Sana özel'de süzgeç değil (süzgeç yalnız Takip Ettiklerim'de).
- Kullanılmayan sinyaller: yorum, takip ettiğin koleksiyonlar, takip ettiklerin sık kullandığı etiket/araç.
