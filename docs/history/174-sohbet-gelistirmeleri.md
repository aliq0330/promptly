# 9.174 — Sohbet geliştirmeleri: okundu bilgisi, yazıyor, sabitleme, sohbet içi arama, yıldızlı mesajlar (birebir + grup)

Durum: kod, **3 migration**, testler ve belgeler repoda; **canlıya UYGULANMADI** (önce migration, sonra istemci kodu — istemci `members_can_pin` sütununu ve yeni RPC'leri okur). Gerçek Supabase'e / Realtime'a / cihaza karşı denenmedi. Mevcut mimari (`conversations` / `conversation_members` / `messages`, 172–173'ün rol/yetenek yapısı) genişletildi; paralel sistem kurulmadı. Aynı özellikler **hem birebir hem grup** sohbette çalışır.

## 1. Veri modeli (yalnızca ekleyici; `drop` yok)

| Migration | İçerik |
|---|---|
| `20260920010000_chat_features_schema.sql` | `conversation_members.last_read_at` / `last_read_updated_at`; `guard_conversation_member_row` güncellendi (istemci imleci yazamaz); `messages (id, conversation_id)` benzersiz kısıtı; `pinned_messages`; `chat_groups.members_can_pin`; `message_stars`; `_group_default_permissions` + `update_chat_group_owner_settings` (`pin_messages`, `members_can_pin`); `pinned_messages` Realtime yayını |
| `20260920020000_chat_features_functions.sql` | `mark_conversation_read_up_to`, `mark_conversation_read` (artık yalnız sayaç), `message_read_receipts`, `set_message_pinned`, `search_conversation_messages`, `list_starred_messages`, `can_use_typing_topic` + `realtime.messages` politikaları |
| `20260920030000_messages_search_index.sql` | `pg_trgm` + `messages_body_trgm_idx` (kısmi GIN, `deleted_at is null`) — arama için; ayrı dosya çünkü uzantı/dizin yavaş ya da kısıtlı olabilir |

## 2. Okundu bilgisi

- **Model: üye başına tek imleç** (`last_read_at`), mesaj başına satır DEĞİL. Gerekçe: büyük grupta mesaj × üye satırı patlar; imleç O(üye). Bir mesajı "okudu" = imleç ≥ mesajın `created_at`'i. Bedeli: kişi o mesajı tek tek değil, "o ana kadarki sohbeti görüntüleyerek" okumuş sayılır (arayüz notu: `chat.msgInfo.note`).
- `mark_conversation_read_up_to(conv, up_to)`: imleç yalnız İLERİ gider, konuşmanın en yeni mesajını aşmaz, **ilerlemeyen çağrı satıra yazmaz** (imleç ve sayaç değişmediyse `update` yok). Okunmamış sayacı imlece göre yeniden hesaplanır (kendi mesajlar, silinenler ve grupta katılmadan önceki mesajlar sayılmaz). İstemci imleci hiçbir yoldan yazamaz (guard tetikleyici); yeniden katılan üyenin imleci sıfırdan başlar.
- **İstemci ne zaman bildirir:** yalnız mesajlar gerçekten görüntülenirken — sekme görünür, listenin sonundayım, "mesaja atla" penceresinde değilim ve istek kabul edilmiş. Yalnız BAŞKALARININ en yeni mesajı sayılır (`nextReadAck`); son bildirilenden ileri değilse hiç çağrı yok. Bekleyen **mesaj isteğinde** (henüz kabul edilmemiş) okundu bildirilmez.
- `mark_conversation_read` (eski imza; "temizle" / "sohbeti sil" yolunda): **yalnız sayacı sıfırlar, imleci ilerletmez** — mesajları görmeden kapatan kullanıcı karşı tarafa "okundu" göstermez.
- **Birebir**: kendi mesajımda tik: `Check` = Gönderildi, `CheckCheck` (primary) = Okundu. Karşı tarafın imleci kendi üyelik satırından okunur (RLS: birebirde iki üye birbirinin satırını görür) ve `conversation_members` UPDATE olayıyla canlı izlenir; eski/yinelenen olay geri almaz (`advanceReadAt`).
- **"Ulaştı / Delivered" YOK:** cihaza ulaşmayı güvenilir biçimde bilmenin yolu yok (çevrimdışı/ön plan ayrımı yapılamıyor); uydurma bir durum göstermemek için eklenmedi.
- **Gizlilik tercihi YOK:** projede "okundu bilgisini kapat" ayarı yoktur; eklenmedi (dürüst sınır). Bilgi yalnız sohbetin iki tarafına (grupta yalnız mesajın göndericisine) görünür.
- **Grup**: mesaj başına tik yok; kendi mesajımın menüsünde "Mesaj bilgisi" → `message_read_receipts` (yalnız gönderen + üye çağırabilir; gönderen listede yok; en çok 1000 satır): okuyanlar (imleç + okuma zamanı) ve okumayanlar. Mesajı görme hakkı olmayanlar (katılmadan önceki mesaj, geçmiş kapalıyken) "okumadı" sayılmaz, listelenmez. **Ayrılan/çıkarılan üyenin imleci üyelik satırıyla birlikte gider** → ayrıntıda görünmez (tutarlı kural: geçmiş okundu verisi tutulmaz).

## 3. Yazıyor göstergesi

- **Kalıcı değil**: Supabase Realtime **Broadcast**, kanal `typing:<konuşma-id>` (konuşma başına, sızıntı yok). Hiçbir tabloya yazılmaz.
- **Private kanal + Realtime Authorization**: `realtime.messages` üzerinde `select` ve `insert` politikaları `can_use_typing_topic(realtime.topic())` ile yalnız konuşma üyelerine izin verir; üye olmayan / çıkarılan kanala katılamaz. Politikalar `realtime.messages` yoksa ya da oluşturulamazsa atlanır (uyarı verir; politika yoksa private kanallar herkese kapalıdır → güvenli taraf). **Dashboard → Realtime → Settings → "Allow public access" AÇIK kalabilir ve kapatılmamalıdır:** Supabase belgelerine göre aynı adlı private ve public kanallar ayrı kanallardır (birbirine mesaj taşımaz), yani public bir kanal bizim private `typing:<id>` kanalımızı dinleyemez; ayar kapatılırsa projedeki tüm public kanallar (mevcut `messages`/`message_reactions`/bildirim `postgres_changes` abonelikleri) reddedilebilir. Bu ayar SQL ile değil, proje yapılandırmasıyla değişir.
- Gönderen: tuş vuruşunda en sık 2,5 sn'de bir sinyal; 4 sn durunca / mesaj gönderince / sohbetten çıkınca / sekme gizlenince / `pagehide`'da "bıraktı" sinyali. Bekleyen istekte, engelliyken ya da yazamıyorsam sinyal GÖNDERMEM (alma sürer).
- Alıcı: her sinyal 6 sn geçerli (`TypingTracker`); yenisi gelmezse kendiliğinden söner → çevrimdışı kalan sonsuza dek "yazıyor" kalmaz. Aynı anda en çok 20 kişi izlenir. Kanal hatası/kopma sessizce gösterge dışında hiçbir şeyi etkilemez; unmount'ta kanal kaldırılır.
- Metin başlıkta (alt satırın yerine): birebir "yazıyor…"; grup "Ali yazıyor…" / "Ali ve Veli yazıyor…" / "Ali ve 2 kişi yazıyor…". Adlar sinyal yükünden DEĞİL, üyelik/profil verisinden çözülür (`useGroupSenders` ek kimlikler için profil çeker); çözülemeyen kişi sayılır, adlandırılmaz. Engellediğim kişinin göstergesi gizlenir.
- **Bilinen sınır:** Broadcast yükündeki `userId` göndericinin beyanıdır (Realtime üye kimliğini yüke eklemez); yetkilendirme üyelik düzeyindedir. Kötü niyetli bir üye başka bir üye adına "yazıyor" gösterebilir — yalnız kozmetik bir göstergeyi etkiler, veri/yetki sızdırmaz.

## 4. Sabit mesajlar

- `pinned_messages (message_id pk, conversation_id, pinned_by, pinned_at)`: mesaj KOPYALANMAZ, yalnız başvuru. **Bileşik FK** `(message_id, conversation_id) → messages(id, conversation_id) on delete cascade` → sabit başka konuşmanın mesajına bağlanamaz. Mesaj herkes için silinince sabit tetikleyiciyle kalkar (bozuk kayıt kalmaz); istemci ayrıca görünmeyen/silinmiş/"benden sil"/temizlenmiş mesajın sabitini hiç göstermez.
- Yazma yalnız `set_message_pinned(msg, pinned)` (SECURITY DEFINER, idempotent, konuşma başına en çok 20 → `pin_limit_reached`). Mesajı okuma hakkı yoksa varlığı bile sızmaz (`message_not_found`). **Birebir:** iki taraf da (engel yoksa). **Grup:** `pin_messages` yeteneği olan roller (varsayılan **admin + moderatör**; owner her zaman) **ya da** owner ayarı `members_can_pin` açıksa her üye. Owner `pin_messages`'i rol başına alıp verebilir; `members_can_pin` yalnız owner'ındır (`update_chat_group_owner_settings`). Gruba yazma denetim kaydı düşer (`message_pinned` / `message_unpinned`).
- Bildirim EKLENMEDİ (gürültü; Realtime çubuğu canlı günceller).
- Arayüz: başlığın altında ince çubuk — dokununca mesaja gider ve sıradaki sabite geçer; birden fazla sabitte konum ("1 / 2"), liste penceresi, yetkiliye "Sabitlemeyi kaldır". Başkasının sabitlemesi `pinned_messages` Realtime olayıyla yenilenir.

## 5. Sohbet içi arama

- `search_conversation_messages` **SECURITY INVOKER**: `messages` RLS'i (üyelik, grupta katılma zamanı / geçmiş ayarı, engel) aynen geçerli; ayrıca kişisel `cleared_at` ve "benden sil" uygulanır. Girdi 2–100 karakter (`invalid_query`), `LIKE` joker karakterleri kaçışlanır; keyset sayfalama (`created_at`, `id`), sayfa en çok 50 (istemci 20). Kapalı grup üye olmayana, çıkarılan üyeye, URL kurcalamasına sonuç vermez. Tüm geçmiş indirilmez; `pg_trgm` GIN dizini.
- Arayüz: başlıkta arama simgesi → arama çubuğu; 300 ms debounce; 2 karakter altında ipucu; sonuçta gönderen + zaman + vurgulu eşleşme; boş / yükleniyor / hata+tekrar dene; ▲▼ ile sonuçlar arasında gezme (sayfa sonunda yenisini yükler); eski bir isteğin geç yanıtı yenisini ezmez. Metin her zaman düz metin olarak çizilir (regex/HTML yok).
- **Mesaja atlama** (`fetchMessageWindow`): hedef yüklü sayfada değilse çevresindeki pencere (önce/sonra 60) yüklenir, ortalanır ve kısa süre vurgulanır; pencerenin ötesinde yeni mesaj varsa **"Güncel mesajlara dön"** çıkar ve canlı mesajlar araya eklenmez (okundu da bildirilmez). Mesaj bu kullanıcı için görünmezse (silinmiş / "benden sil" / temizlenmiş / erişim yok / başka sohbetin mesajı) içerik gösterilmez, dürüst not verilir. Aynı yol bildirim (`hl=message:`), sabit ve yıldız bağlantılarını da karşılar.

## 6. Yıldızlı mesajlar

- `message_stars (user_id, message_id, created_at)` PK (user_id, message_id); RLS: yalnız kendi satırların; ekleme yalnız **okuyabildiğin** mesaj için (politika `messages` RLS'ine bakar); kullanıcı başına en çok 1000. Mesaj kopyalanmaz, `messages`'a yazılmaz. Mesaj herkes için silinince ve "benden sil" yapınca ilgili yıldız tetikleyiciyle kalkar.
- Menüde "Yıldızla / Yıldızı kaldır" (iyimser güncelleme, hatada geri alınır; çift tık tek kayıt). `/messages/starred` ("Yıldızlı mesajlar"; sohbet listesinin başlığından yıldız simgesiyle): `list_starred_messages` (INVOKER) birebir + grup mesajlarını **tek listede** verir — sohbet adı/avatarı (grup adı ya da karşı taraf), gönderen, tarih, metin; satıra dokunmak doğru sohbeti açıp mesaja kaydırır; yıldızı kaldırınca satır düşer.
- **Erişim kaybı politikası (açık):** gruptan ayrıldığım/çıkarıldığım, mesaj silindiği, "benden sil"/temizle yaptığım mesajlar listede **görünmez** (sunucu elemesi; içerik erişimin ötesinde gösterilmez). Yıldız satırı silinmez: gruba yeniden katılırsam ve mesajı yine okuyabiliyorsam geri gelir; kalıcı kaybolması için kullanıcı eylemi gerekmez. Başka kullanıcının yıldızı hiçbir yoldan görünmez.

## 7. Arayüz

Mevcut tasarım dili (token, `Button`/menü/`Modal`, Lucide, TR+EN). Mesaj menüsü: Yanıtla, **Yıldızla**, **Sabitle** (yetkiliye), **Kopyala**, **Mesaj bilgisi** (grup, kendi mesajım), Düzenle / Sil (mevcut kurallar). Başlık: arama simgesi, yazıyor metni (alt satırın yerine), altında sabit çubuğu. Pencere/panel paneli `stopPropagation` ile (içeride tıklama pencereyi kapatmasın). Owner ayarları: "Mesaj sabitleme" bölümü (`members_can_pin`) + admin/moderatöre "Mesaj sabitleme" yeteneği.

## 8. Güvenlik özeti

- Kimlik daima `auth.uid()`; `SECURITY DEFINER` fonksiyonlarda `search_path` sabit; `EXECUTE` yalnız `authenticated` (anon/public kaldırıldı); girdi doğrulama (2–100 karakter, jsonb tipleri); `service_role` istemcide yok.
- RLS: `pinned_messages` (üye + mesajı okuyabilen; istemci yazamaz), `message_stars` (yalnız kendi satırların). Okundu imleci istemciden yazılamaz. Arama/yıldız listesi INVOKER → RLS atlanamaz. Yazıyor kanalı Realtime Authorization ile üyelere kısıtlı.
- Çift/yarışan işlemler: PK/unique kısıtları + `for update` kilitleri (`_group_lock`, advisory lock) + idempotent RPC'ler.

## 9. Testler

- `supabase/tests/chat-features.sql` — 67 kontrol (okundu imleci / sayaç / yinelenen yazma yok / eski imza, grup ayrıntısı + yetki + üyelik sonu + geçmiş, sabitleme yetkileri + sınır + tetikleyiciler + denetim, yıldız RLS + kişiye özellik + 1000 sınırı, arama (joker kaçışı, sayfalama, çıkarılan/temizlenen), yazıyor konu fonksiyonu + Realtime politikaları). Çalıştırma: `supabase/tests/run-local.sh supabase/tests/chat-features.sql` → `FAILED=0`. Önceki SQL testleri (`chat-groups`, `chat-group-permissions`, `conversation-member-state`, `counter-protection`, `saved-collections`, `version-history`) temiz yeniden oynatmada `FAILED=0`.
- `src/lib/chat-features.test.ts` — saf mantık (okundu durumu, imleç ilerlemesi, yinelenen bildirim yok, yazıyor izleyici TTL/üst sınır/biçim, sabit yetkisi, arama girdisi/vurgulama/gezinme).
- `tests/messaging-ui/run-chat.mjs` — 33 senaryo (ağ + WebSocket/Realtime taklitli: `realtime-hub.mjs` Phoenix v2 protokolü; iki ayrı oturum arasında yazıyor/okundu): okundu tek yazma, bekleyen istek, canlı tik, grup bilgi penceresi, sabit (birebir/grup rol-ayar-hata-canlı), arama (atlama, hata, gezinme, enjeksiyon), yıldız (menü, ekran, atlama, geri alma), yazıyor (private kanal, kısıtlama, TTL, sızıntı yok, yetkisiz kanal, grup adları, EN), mobil/tablet + koyu tema + İngilizce. `run.mjs` (24) ve `run-groups.mjs` (33) değişmeden geçer.

## 10. Bilinen boşluklar / yapılmayanlar

- Canlıya uygulanmadı; gerçek Supabase'e/Realtime'a (özellikle private kanal politikaları) ve fiziksel cihaza karşı denenmedi. Realtime politikalarının canlıda oluşup oluşmadığı migration çıktısındaki uyarıdan / `pg_policies`'ten doğrulanmalı.
- "Ulaştı (delivered)" durumu ve okundu-bilgisi gizlilik ayarı yok (bkz. §2).
- Grup okundu bilgisi mesaj-başı değil imleç tabanlı (bkz. §2); okumayanlar listesi üye listesinin ilk 1000'iyle sınırlı.
- Yazıyor `userId` beyana dayalı (bkz. §3).
- Sabit/yıldız için bildirim ve mesaj içi arama (tüm sohbetler arası) yok.
- Yıldızlı mesajlar yalnız "Yıldızlı mesajlar" ekranında listelenir; sohbet içinde yıldız filtresi yok.
