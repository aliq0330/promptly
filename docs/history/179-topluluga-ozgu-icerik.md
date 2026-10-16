# 9.179 — Topluluğa özgü içerik: toplulukta oluşturulan içerik topluluğun kendisine aittir

Durum: kod, 1 migration (`20260920100000_community_content.sql`), testler ve belgeler repoda; **canlıya UYGULANMADI** (canlı veritabanında SQL ÇALIŞTIRILMADI, deploy yapılmadı). Sıra: 178'in migration'ı (`…090000`, canlıda) → bu dosya → istemci kodu. Gerçek Supabase'e / oturuma / cihaza karşı denenmedi; doğrulama yerel PostgreSQL 16 ve ağ taklitli Playwright'tadır.

## Karar (kullanıcıyla netleştirildi)

178'de "yerel gönderi" = özel içerik + ayrı gönderi etkileşimi idi. Ürün kararı farklıydı: toplulukta oluşturulan içerik **normal içerik kartıyla** (kendi beğeni/yorumuyla) topluluk akışında yer alır, **yalnızca topluluğu okuyabilenlere** görünür, yazarın sayfasında/Keşfet'te/aramada görünmez, kaydedilemez. Netleştirilen beş nokta:

1. Yazar da içeriği yalnız toplulukta görür ("İçeriklerim"de/profilinde çıkmaz).
2. Herkese açık toplulukta üye olmayan okur (yazamaz); kapalıda yalnız üye.
3. Koleksiyona kaydedilemez (sunucuda da engelli); paylaş/bağlantı kopyala/çoğalt arayüzde yok.
4. Yazar topluluktan ayrılırsa içerik toplulukta kalır (yazar kendi içeriğini artık okuyamaz/düzenleyemez); hesabı silinirse içerik silinir.
5. Topluluk ↔ normal geçiş yok: ne topluluğa eklenir ne çıkarılır, sonradan herkese açık yapılamaz.

## Model

`prompts` / `prompt_requests` / `workflows` / `presets`.`community_id` (FK → `chat_groups`, `ON DELETE CASCADE`; topluluk silinince içeriği de gider).

- `community_id` doluysa sunucu görünürlüğü ZORLA `private` saklar (mevcut tüm "herkese açık" süzgeçleri — `feed_page`, başvuru, ilgili içerik — kendiliğinden dışlar); taslak olamaz (`community_draft_not_allowed`); `community_id` değiştirilemez (`community_immutable`, süper kullanıcı dahil); yazma yalnız üye + kapatılmamış topluluk + akış politikası + 24 saatte ≤ 30 gönderi (`enforce_community_content`, SECURITY INVOKER — istemci/tetikleyici ayrımı `current_user` ile).
- AFTER INSERT tetikleyicisi akış için `community_posts` (`kind='native'`) satırını oluşturur: içerik + gönderi tek işlem (178'in iki adımlı RPC'si, 7 gün kuralı, taslak kaybı sorunları kalktı). `publish_native_community_post` çalıştırılamaz hâle getirildi (EXECUTE kapalı; `drop` onayı gerektiğinden fonksiyon yerinde).
- Okuma: dört ana tablonun SELECT politikası `can_read_community(community_id)`'ı kabul eder (herkese açık toplulukta herkes/ziyaretçi, kapalıda üye). Alt tablolar (medya, etiket, değişken, sonuç, adım, DNA, hazır ayar alanları) ve Storage dosyaları ana satırın RLS'ini miras aldığından değişmedi. Topluluğu okuyamayan yazar kendi topluluk içeriğini de okuyamaz.
- Beğeni/yorum/yorum beğenisi: içeriğin KENDİ altyapısı; yalnız topluluk üyesi yazar (`enforce_community_content_engagement`, `enforce_community_comment_like`), kapatılmış topluluk salt-okunur. Kaydetme sunucuda engelli (`block_community_content_save`).
- Gönderiyi kaldırmak = içeriği silmek: yazarın "İçeriğimi sil"i ve yetkilinin kaldırması içeriğin KENDİSİNİ siler (gönderi + beğeni/yorum cascade; `delete_community_post` / `moderate_community_post`).
- **Var olan bir açık kapandı:** yorum SELECT/INSERT politikasında `request_id is not null` koşulu "herkese açık" idi → özel/taslak/topluluk isteklerinin yorumları yabancıya okunabiliyordu. Artık isteğin kendi RLS'ini miras alır (testle sabit).
- `search_content` prompt/istek/workflow kollarına `community_id is null` süzgeci eklendi (hazır ayar kolu zaten herkese açık süzüyordu; `feed_page` ve `related_*` açıkça `visibility='public'` süzer).

## İstemci

- `communityId` Prompt/İstek/Workflow/Hazır Ayar tiplerinde ve `*_SELECT`'lerde; oluşturma girdilerinde `communityId` (yalnız YENİ kayıtta `community_id` olarak yazılır).
- Oluşturma ekranı: `?community=` → ortak `CreateFormActions` yalnız bir açıklama bandı gösterir; **görünürlük anahtarı ve "Taslağa kaydet" yok** (içerik topluluğa özgü, taslak olmaz). Prompt için `/create?mode=prompt&community=` (ve yalnız `?community=`) tür seçim ekranına düşmez; seçim ekranı da bağlamı taşır. 178'deki hata düzeltmesinin devamı.
- Akışta yerel gönderi = **normal içerik kartı** (PromptCard/RequestCard/WorkflowCard/PresetCard) + üstte ince topluluk çubuğu ("Topluluk içeriği" rozeti, sabit, topluluk menüsü: sabitle/bildir/yönetici kaldır/içeriğimi sil). `PostEngagement` yalnız başvuru/legacy gönderilerde.
- Kaydet ve paylaş düğmeleri, bağlantı kopyalama ve "Kopyasını oluştur" topluluk içeriğinde gizli (kart altbilgisi, odak görünümü, dört detay sayfası, `PostMenu`); düzenleme `&community=` ile açılır.
- Profil / `fetchRecent*` / `fetchBy*` / `fetchLikedPrompts` / ilişki adayları açık `community_id is null` süzgeci kullanır.
- TR + EN çeviriler eklendi (`communities.create.*`, `communities.post.native.*`, üç yeni hata kodu).

## Doğrulama

- `supabase/tests/community-content.sql` (**41 kontrol**, `FAILED=0`): dört türde oluşturma → kendiliğinden gönderi; görünürlük zorlaması; taslak/geçiş/yazma izinleri (üye olmayan, kapalı topluluk, kadro politikası, günlük sınır); okuma matrisi (üye · herkese açık toplulukta yabancı · ziyaretçi · kapalı toplulukta yabancı/üye/ziyaretçi, dört tür, alt satırlar); ayrılan yazar; aramadan dışlama; etkileşim (üye/üye olmayan/kapatılmış topluluk, yorum beğenisi, bildirim adresi); kaydetme engeli; başvuru olarak getirilememe; kaldırma = içerik silme (yazar + moderasyon + denetim + bildirim); hesap/topluluk silme cascade; yorum sızıntısı; EXECUTE yetkileri.
- **Mutasyon denemesi:** 17 bilinçli bozulma yerel kopya veritabanında ayrı ayrı uygulandı, hepsi en az 1 kontrolü bozdu (ilk turda 1'i — kapalı toplulukta istek okuması açık — yakalanamadı; test 39–41 eklenerek kapatıldı). Mutasyonlar migration dosyasına YAZILMADI.
- `community-post-engagement.sql` (178) yeni modele uyarlandı (yerel içerik fixture'ı artık içerik ekleyerek oluşur; `FAILED=0`). Önceki dokuz SQL dosyası yeni migration ile `FAILED=0`.
- `tests/messaging-ui/run-community-posts.mjs` yeni modele uyarlandı (normal kart, kaydet yok [paylaş/istatistik 181'de geri geldi], bağlam bandı, taslak/görünürlük yok, `community_id` ile doğrudan oluşturma); diğer Playwright paketleri koşturuldu (sonuçlar raporda).

## Bilinen boşluklar / dürüst liste

- **Canlıya uygulanmadı.** Önce migration (yalnızca ekleyici/değiştirici; `drop` yok), sonra istemci kodu (eski istemci `community_id` göndermez/okumaz: topluluktan oluşturulan içerik normal içerik olarak kalır ve 178 yerel-gönderi RPC'si artık çalışmaz).
- Canlıda 178 yerel gönderisi yoktu (2 gönderi, ikisi legacy), bu yüzden veri taşıma gerekmedi.
- Doğrudan tablo okuyan her liste `community_id is null` süzgecini ister; bilinen liste sorguları yamalandı, ileride eklenecek yeni liste sorgusu da süzmelidir (`CLAUDE.md` kuralı). `feed_page`/`related_*` `visibility='public'` ile zaten güvenli.
- Topluluk içeriğine bir istek yanıtı (prompt) yazılırsa yanıt normal herkese açık prompt olarak oluşur; yanıtın bağlı olduğu isteğin başlığı yanıt kartında görünebilir. Topluluk isteklerine yanıt akışı ayrıca kapatılmadı.
- @bahsetme bildirimi topluluk içeriği yorumlarında üretilmez (içerik `public` değil → mevcut kontrol atlar); beğeni/yorum bildirimi çalışır.
- Topluluk silinince içerik de silinir (cascade); yazar bunu silmeden önce göremez/dışa aktaramaz.
- Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.
