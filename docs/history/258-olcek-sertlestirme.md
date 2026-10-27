# 258 — Ölçek sertleştirmesi: büyük topluluk fan-out'u, Mesajlar listesi, yorum ağacı ve sessizce kesilen listeler

**Durum: uygulandı (repoda). Üç migration (hepsi yalnızca ekleyici/değiştirici, `drop` yok): `20260929110000_community_notify_set_based.sql`, `20260929120000_group_unread_on_read.sql`, `20260929130000_story_viewers_paged.sql` — `main`'e birleşince `deploy.yml` uygular (önce migration, sonra istemci; migration yoksa istemci eski davranışa düşer: grup okunmamış sayacı sütundan, hikâye görüntüleyenleri eski RPC'den). Yerel PostgreSQL'de ve ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek ölçekte (100 000 üye) DENENMEDİ.**

## Neden
"Çok kullanıcı olursa sorun çıkacak yer var mı?" taraması. Listeler değil, tek bir işlemin bütün üyelere dağılması asıl tehlikeydi.

## 1. Topluluk bildirimleri: üyeler üzerinde döngü → tek toplu insert
Duyuru, etkinlik, kural değişikliği, topluluğu kapatma/yeniden açma her üye için `_community_notify` çağıran bir döngüydü (üye başına 2–3 sorgu + 1 insert);
100 000 üyede işlem sorgu zaman aşımını (authenticated 8 sn) aşar ve duyuru hiç yayınlanmazdı. `_community_notify_members` aynı sınıf kurallarını
(direct / important / info) tek `insert … select` içinde uygular. **Bilinçli sınır:** bir olay en çok 20 000 üyeye bildirim yazar (sohbette yakın zamanda okuyanlar
öncelikli); duyuru/etkinlik topluluk sayfasında herkese görünür kalır, yalnız bildirim sınırlıdır. Ölçüm (yerel, 30 000 üye): duyuru ~430 ms, 20 000 bildirim.
Yan düzeltme: yeniden açma bildirimi kapatmayla AYNI saniyede olunca aynı tekilleştirme anahtarı yüzünden düşüyordu → `copen:` öneki.

## 2. Grup okunmamış sayısı okuma anında
`handle_new_message` her mesajda sohbetin TÜM üyelerinin `unread_count` satırını güncelliyordu (100 000 üyede mesaj başına 100 000 güncelleme + her üyeye Realtime olayı + her
istemcide tüm sohbet listesinin yeniden okunması). Birebirde (2 üye) tetikleyici aynı; grupta yalnız `conversations.last_message_at` güncellenir; sayı `group_unread_counts`
ile `last_read_at` / `cleared_at` / `joined_at` imlecinden en çok 100'e kadar sayılır (istemci "99+"). `list_my_communities` aynı sayıyı kullanır. Gruplar Mesajlar listesinde
sekme görününce ve görünürken 2 dakikada bir yenilenir (birebir hâlâ Realtime). **Kalan risk:** büyük bir topluluğun sohbetini AÇIK tutan her istemci `messages` Realtime
abonesidir; çok büyük gruplarda bu Supabase Realtime kapasitesine yaslanır (yalnız birebir/küçük grup için sınandı).

## 3. Mesajlar listesi (çok sohbetli kişi)
`fetchConversationsForUser` tüm üyelikleri tek istekte (1000'de keser) ve birebir sohbet kimliklerini TEK `in(...)` adresine yazıyordu (birkaç yüz sohbette adres sınırı aşılır, liste
hiç gelmezdi); son mesaj sorgusu sessizce 500'de kesiyordu. Şimdi: üyelikler `fetchAllRows`, kimlikler 100'erli, son mesajlar 200'erli parçalar, liste 50 satır çizer + kaydırınca devamı.

## 4. Yorum ağacı sayfalı
Üst düzey yorumlar 20'şerli sayfa (`fetchCommentThreadPage`), her sayfanın yanıtları (her derinlikte, seviye seviye `parent_id in (…)`) o sayfayla gelir; ağaç istemcide aynı düz listeden kurulur.
Bildirimden gelen derin bağlantı (`hl=comment:…`) okunmamış sayfadaysa kök yorum + altı ayrıca yüklenir (`fetchCommentThread`); Space'te kişinin kendi puanlı yorumu her zaman yüklenir.
Özet görünümü bütün sayfaları yüklemez; "Tümünü gör" açıkken sonraki sayfa kendiliğinden gelir. Başlıktaki sayı tümü yüklenene kadar "60+" gibi artılıdır.

## 5. Sessizce kesilen listeler (hepsi tam okunur ya da sayfalı)
Kaydedilen hazır ayarlar (120 → 24'erli sayfa; seçiciler için tam), katılım istekleri (200 → 50'şerli; DB zaten toplulukta 200 bekleyen isteği sınırlar), bekleyen davetler ve yasaklılar (200 → tam okunur, 50'şer çizilir),
topluluk etkinlikleri ve raporları (50 → büyüyen pencere `useGrowingList`; geçmiş etkinlik/kapanmış rapor geçmişine artık ulaşılır), hikâye anket oyları (500) / soru yanıtları (300) / görüntüleyenler (500) 50'şerli sayfa
(yeni `story_viewers(uuid, int, int)` aşırı yüklemesi; açıkken 20 sn'lik yenileme yalnız ilk sayfayı tazeler), "Var olan içeriği paylaş" seçicileri (tür başına en yeni 30 → başlık araması + sayfa).
Bilinçli olarak değişmeyenler: Space öğeleri (DB 500'de açık hata veriyor — sessiz kesme değil), kişinin kendi bekleyen başvuruları (DB en çok 20).

## Yarış düzeltmesi (testin yakaladığı gerçek hata)
"Daha fazla yükle" otomatik gözlemcisi ile bir tıklama aynı anda tetiklenince `loadingMore` henüz çizilmediği için aynı sayfa İKİ kez isteniyordu (`run-pagination` 7. senaryo ara sıra kırmızıydı).
`usePagedList`, `useGrowingList` ve yorum sayfalaması artık "bu sayfa yolda" bilgisini ref ile anında tutuyor.

## Testler
- SQL: `community-notify-scale.sql` (30 000 üye, sınıf kuralları, 20 000 sınırı, zaman), `group-unread.sql` (fan-out yok, imleç/temizleme/katılma/100 sınırı, `list_my_communities`), `stories.sql` 66–68 (sayfalı görüntüleyenler); `chat-groups.sql` 108 yeni davranışa göre güncellendi.
- Arayüz: `run-scale.mjs` (1200 birebir sohbet, grup okunmamış "99+", 130 üst yorumlu thread + derin bağlantı, 120 geçmiş etkinlik, 90 içerikli paylaşım seçicisi + arama); `unbounded-queries.test.ts` güncellendi.
- İngilizce: yalnız `communities.feed.pickSearch` eklendi (TR+EN); diğer metinler mevcut anahtarlar.
