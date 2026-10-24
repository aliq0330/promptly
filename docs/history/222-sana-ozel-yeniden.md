# 222 — "Sana özel" yeniden kuruldu (Takip Ettiklerim'den ayrı keşif akışı)

**Durum:** uygulandı; **NOT: "takip edilen kişiler girmez" kararı `223-*` ile geri alındı (kişi takibi tekrar +300 puan verir).**  (istemci + bir ekleyici migration). `20260922110000_for_you_v2.sql` **canlıya UYGULANDI** (kullanıcı izniyle, MCP `execute_sql`, tek işlem; `schema_migrations`'a dosya sürümüyle kayıt; canlıda doğrulandı: `prompt_copy_events` kendi-satırı politikası var, `for_you_page` anon'a kapalı / authenticated'a açık, takibi olmayan gerçek bir hesapla 50 satır — hiçbiri takip edilen yazardan değil, nedenler `popular`). Gerçek Supabase'e / gerçek oturuma / cihaza KARŞI DENENMEDİ — SQL yerel PostgreSQL'de, arayüz ağ taklitli Playwright'ta sınandı. Ağırlıklar elle seçildi, gerçek veriyle ayarlanmadı.

## Neden
Ana Sayfa'da artık iki sekme var: Sana özel ve Takip Ettiklerim (221). Eski Sana özel takip edilen kişinin gönderisine +600 veriyordu (300 beğenili gönderiyle eşit), yani akışın büyük kısmı Takip Ettiklerim'in kopyasıydı; ayrıca yenilik neredeyse sayılmıyordu (yaş cezası 125 güne yayılıyor), "Şu an popüler" nedeni tüm zamanların beğenisine dayanıyordu, aynı yazar art arda gelebiliyordu, görülenler/kaydedilenler tekrar çıkıyordu ve ilgi alanı çipleri akışın üstünde filtre gibi duruyordu (oysa kalıcı bir profil tercihi).

## Karar (kullanıcı)
- **Takip ettiğin kişilerin gönderileri Sana özel'e GİRMEZ** — onlar Takip Ettiklerim'de (kronolojik, eksiksiz). Kişi takibi puan vermez. Etiket ve AI aracı takibi, ilgi alanı ve beğenilen etiketler sinyal olarak KALIR.
- Sana özel = takip etmediğin ama sana uyan, taze ve kaliteli içerik.

## Sıralama (`for_you_page`, aynı imza ve dönüş sütunları)
- **Adaylar:** yayında, herkese açık, topluluğa ait olmayan prompt/istek/workflow/hazır ayar. **Çıkarılanlar:** takip edilen kişilerin gönderileri, kendi içeriğin, beğendiklerin, koleksiyonlarına **kaydettiklerin**, son 60 günde **kopyaladıkların** (yeni tablo yok; `collection_items` + `prompt_copy_events`).
- **Puan** = sinyaller + kalite + tazelik, çeşitlilik cezası:
  - takip edilen etiket 200 × (en çok 3) · takip edilen AI aracı 150 · ilgi alanı 150 · beğenilen etiket 50 × (en çok 3)
  - kalite: `min(200, 40·ln(1 + beğeni×3 + kaydetme×2 + yorum×2 [+ kopyalama×2 | yanıt×2]))`
  - tazelik: `300·exp(−yaş_saat/72)` (1 saatte ~296, 3 günde ~110, bir haftada ~30). Kalite tavanı (200) tazelik tavanından (300) küçük: eski ve çok beğenilen içerik taze sinyalsiz içeriğin önüne geçmez ama sinyalli/kaliteli eski içerik öne çıkabilir.
  - çeşitlilik: aynı yazarın puana göre 2., 3. … gönderisi −120, −240 …
- **Neden** = en ağır TEK sinyal: etiket > araç > ilgi alanı > beğenilen etiket; sinyal yoksa `popular`, metni artık **"Toplulukta öne çıkıyor"** ("Şu an popüler" iddiası bırakıldı: puan kalite + tazelik, tüm zamanların beğenisi değil). `creator` nedeni artık üretilmez (tip eski sunucu yanıtını tanımaya devam eder).
- Sayfalama aynı: `(sort_rank, created_at, id)` keyset, `p_as_of` oturum boyunca sabit.
- **Yeni RLS politikası:** `prompt_copy_events` tablosunda RLS açıktı ama okuma politikası yoktu (INVOKER fonksiyon kopyaladıklarını göremiyordu). Kullanıcı yalnız KENDİ satırlarını okuyabilir (`user_id = auth.uid()`; koşullu `create policy`, `drop` yok). Yazma hâlâ yalnız `record_prompt_copy` RPC'si.

## Arayüz
- **İlgi alanı çipleri akıştan çıktı.** İki yeni yer: (1) Sana özel sekmesinde sağda **"Sana özel'i ayarla"** düğmesi → pencerede ilgi alanları + Sana özel'in nelerden oluştuğunu söyleyen not + Keşfet bağlantısı; (2) **ilk kullanım kartı** ("Sana özel'i kur"): ilgi alanı yok VE takip edilen etiket/araç yok ise akışın üstünde çipli kart (seçince kalkar). İlgi alanı kalıcı tercih olarak anlatılır, "filtre değildir" denir (`InterestChips`, profil düzenlemeyle aynı `profiles.interests`).
- **"Yenile" düğmesi:** sıralama oturum anına sabit olduğundan yeni gönderiler yalnız yenilenince görünür; düğme akışı "şimdi" için baştan sıralar (yeni `p_as_of`).
- Boş durum metni artık doğru: Sana özel takip ettiklerin dışındaki yeni içeriği gösterir, takip ettiklerinin paylaşımları Takip Ettiklerim'dedir.
- Sana özel'e takip edilenler süzgeci (kişi/etiket/araç) hâlâ YOK (221'deki karar; bu akışta kişi zaten yok, etiket/araç zaten sinyal).

## Doğrulama
- `supabase/tests/for-you.sql` **17 kontrol**, `FAILED=0` (13 eski + 4 yeni; eskiler yeni kurallara göre yeniden yazıldı): takip edilen yazar prompt'u + workflow'u yok; kendi/beğenilen/**kaydedilen/kopyalanan**/gizli/taslak yok; nedenler (`creator` yok); sıra; keyset; `p_as_of`; tür süzgeci; tazelik; kalite sınırı (30 günlük 100 beğenili, 1 saatlik sinyalsizin önüne geçmez ama 60 günlük sinyalsizin önünde); çeşitlilik (−120/−240). **Mutasyon:** takip edilenleri tekrar dahil etmek 2 kontrolü, çeşitlilik cezasını kaldırmak 1 kontrolü kırdı. 25 SQL test dosyası `FAILED=0` (aşağıya bak).
- `tests/messaging-ui/run-home-motion.mjs` 10/10: nedenler (kişi nedeni yok, "Toplulukta öne çıkıyor"), ilgi alanı çipi akışta yok, Yenile + ayar düğmeleri, ilk kullanım kartı, ilgi alanı seçince kart kalkar + yeniden sıralanır + kartlar kayar, ayar penceresinde seçili görünür ve kaldırılabilir, Yenile yeni `p_as_of` ile baştan çağırır, İngilizce. `run-feed-filters` 16/16.
- İngilizce karşılıklar EKLENDİ (`translations-filters.ts`: `forYou.refresh|settings|settingsTitle|settingsHow|setupTitle|setupDescription`; `forYou.interestsHint`, `forYou.reasonPopular`, `feed.emptyForYou*` metinleri güncellendi).

## Bilinçli sınırlar / açık
- Ağırlıklar (200/150/150/50, kalite 40·ln tavan 200, tazelik 300·exp(−t/72), −120) elle seçildi; gerçek veriyle ve gerçek kullanıcı davranışıyla ayarlanmadı. Tek yerde (SQL) durur.
- "Görüldü" yalnız beğeni/kaydetme/kopyalama sayılır; yalnızca AÇILAN gönderi izlenmez (ayrı bir görüntüleme kaydı tablosu ister).
- Kullanılmayan sinyaller: yorum yapma, takip ettiğin koleksiyonlar, takip ettiğin kişilerin sık kullandığı etiket/araç ("takip ettiklerin ne seviyor" sinyali olabilir).
- Her sayfa isteği tüm herkese açık gönderileri yeniden puanlar (ölçekte maliyetli; önceden hesaplama ister).
- İlgi alanı → içerik eşlemesi hâlâ SQL'de sabit (yeni bir ilgi alanı migration ister).
- Migration uygulanmadan: eski `for_you_page` çalışmaya devam eder (yeni arayüz ona uyumlu; `creator` nedeni tipte kalır), yani yalnızca sıralama/kurallar eski kalır.

## Canlıda gözlenen sonuç (uygulama sonrası)
Canlıda yalnız 18 yazar var ve test hesabı `aliq` 17'sini takip ediyor; Sana özel'de takip edilenler bilerek dışarıda olduğundan bu hesapta akış **boş** (139 başka prompt'un hepsi takip edilen yazarlardan). Takibi olmayan bir hesapta akış 50 satır döner, hepsi `popular` (sinyal yok). Yani küçük bir toplulukta çok kişi takip eden biri için Sana özel boş görünür ve boş durum metni "takip ettiklerin Takip Ettiklerim'de" der; içerik ve yazar sayısı arttıkça kendiliğinden düzelir. İstenirse yumuşatılabilir (ör. akış boşken takip edilenlerin en iyi gönderilerini göstermek) — şu an yapılmadı, ürün kararıdır.
