# 9.172 — Grup sohbeti ve topluluk sistemi

Durum: kod, 2 migration, testler ve belgeler repoda; **canlıya UYGULANMADI** (`20260919980000` ve `20260919990000` canlı veritabanında ÇALIŞTIRILMADI, canlı veri değiştirilmedi, üretime deploy yapılmadı). Önce migration, sonra istemci kodu uygulanmalı. Gerçek Supabase'e / gerçek oturuma / Realtime'a / fiziksel cihaza karşı denenmedi.

## Mevcut mimari (okunup doğrulandı)

- `conversations` + `conversation_members` (PK `(conversation_id, user_id)`, 171'deki kişiye özel `archived_at/deleted_at/cleared_at`, `unread_count`) + `messages` (+ `message_reactions`, `message_hidden_for`, fotoğraf, yanıt, düzenleme/silme, Realtime) birebir sohbetin tüm altyapısıdır. `is_conversation_member()` ve `is_blocked()` (simetrik) RLS'te kullanılır.
- **Tuzaklar (okurken bulundu, düzeltildi):** (1) `conversation_members` INSERT politikası "kendini herhangi bir konuşmaya ekleyebilir"e izin veriyordu, UPDATE politikası bütün sütunlara; bir `role` sütunu eklenince kullanıcı kendini owner yapabilirdi. (2) `messages` INSERT politikası "karşı üyelerle engel yok" şartı grupta bir kişiyi engelleyen herkesi tüm gruptan susturur. (3) `start_direct_conversation` ve `filter_messageable_users` "ortak konuşma"yı tür ayırmadan arıyordu: iki kişi aynı grupta diye "sohbet var" sayılırdı. (4) `notify_new_message` her mesajda her üyeye bildirim yazardı. (5) `resurface_conversation_on_message` arşivi her mesajda geri getirirdi. (6) `orphan_storage_objects` grup görsellerini yetim sayıp silerdi. Hepsi bu işte ele alındı (aşağıda).

## Karar: yeni mesaj altyapısı yok, mevcut tablolar genişler

| Kavram | Nerede |
|---|---|
| Grup konuşması | `conversations.kind` (`'direct'` varsayılan \| `'group'`); grup kimliği = konuşma kimliği. Mesajın tek anahtarı `conversation_id` → birebir/grup kimliği çelişemez (ayrı grup kimliği sütunu yok). |
| Üyelik, rol, katılma zamanı, sessize alma | `conversation_members.role` (`owner/admin/moderator/member`), `joined_at`, `muted_at` (arşiv/sil/temizle zaten 171'den). Grup başına tek owner: kısmi benzersiz indeks. |
| Grup bilgisi | `chat_groups` (id = conversation id): ad, açıklama, görsel, `visibility` (`public`/`private`), `posting_policy` (`members`/`admins`), `member_limit`, **denormalize sayaçlar** `member_count`, `pending_request_count` (SECURITY DEFINER trigger + `protect_counter_columns`). |
| Katılma istekleri | `chat_group_join_requests` (`pending/accepted/rejected/cancelled`, `decided_by`, `decision_note`); kişi+grup başına tek bekleyen (kısmi benzersiz indeks); geçmiş silinmez. |
| Davetler | `chat_group_invitations` (`pending/accepted/declined/cancelled/expired`, 14 gün); kişi+grup başına tek bekleyen. |
| Davet bağlantıları | `chat_group_links`: **yalnız SHA-256 özeti** saklanır, ham token yalnız oluşturma yanıtında bir kez döner; süre, kullanım sınırı, iptal. `token_hash` sütunu istemciye hiç verilmez (sütun yetkisi). |
| Yasaklılar | `chat_group_bans` — "çıkar"dan ayrı kavram. |
| Denetim | `chat_group_audit` (insert-only; grup silinse de kalır → `group_id`'ye FK yok; owner/admin ve site moderatörü okur). |
| Kişiye özel grup tercihi | yeni tablo yok: sessize alma/arşiv/listeden kaldır/temizle = kendi üyelik satırı. |

## Roller ve yetki matrisi (sunucuda: RPC + `lib/chat-groups.ts` aynı tablo)

| İşlem | owner | admin | moderator | member |
|---|---|---|---|---|
| Mesaj yaz (`posting_policy='admins'` iken) | ✔ | ✔ | ✔ | ✘ |
| Ayarlar (ad/açıklama/görsel/limit/kim yazar), görünürlük, davet, bağlantı, yasak kaldırma | ✔ | ✔ | ✘ | ✘ |
| Katılma isteği kabul/ret | ✔ | ✔ | ✔ | ✘ |
| Üye çıkarma | herkes (kendisi hariç) | moderatör+üye | yalnız üye | ✘ |
| Yasaklayarak çıkarma | ✔ | ✔ (kendinden düşük) | ✘ | ✘ |
| Rol atama | admin/moderator/member (sahip hariç) | yalnız moderator↔member, yalnız moderatör/üyeye | ✘ | ✘ |
| Sahipliği devretme, grubu silme | ✔ | ✘ | ✘ | ✘ |
| Başkasının mesajını silme (herkes için, denetim kaydıyla) | ✔ | düşük rütbe | yalnız üye | ✘ |
| Gruptan ayrılma | başka üye yokken (grup kapanır) | ✔ | ✔ | ✔ |

Yorumlar: görünürlüğü owner **ve** admin değiştirebilir ("yönetici" = owner/admin, spec 3C + 10). Admin'in başka admin'e dokunamaması bilinçli (spec: "owner yetkilerini değiştiremez" + yalnız moderator verip kaldırır). Hiçbir yol 'owner' rolü vermez; tek yol `transfer_chat_group_ownership` (eski sahip admin olur).

**Sahipsiz grup önlemi:** owner başka üye varken `leave_chat_group` ile ayrılamaz (`owner_must_transfer`); tek üyeyse grup silinir. RPC dışı yollar (hesap silme/cascade) için `conversation_members` AFTER DELETE tetikleyicisi: sıradaki en kıdemli admin → moderatör → üye owner olur (bildirimle); kimse kalmadıysa grup silinir. İstemci üyelik satırını doğrudan silemez/ekleyemez/rolünü değiştiremez (BEFORE tetikleyici; yalnız SECURITY DEFINER RPC'ler ve cascade).

## Görünürlük ve katılım

- **Herkese açık:** keşifte listelenir (`discover_chat_groups`), `join_chat_group` tek adımda katılır (atomik; limit, yasak, engel kontrolü; ikinci çağrı `already_member`, yinelenen üyelik yok).
- **Herkese kapalı:** keşifte yok; kapalı grubun adı/açıklaması/üyesi/mesajı yetkisizlere sızmaz. Erişim yolları: (a) yönetici daveti (davetli kendi daveti sayesinde grup kartını görür), (b) **davet bağlantısı** → başvuru (`join_chat_group_via_link`): başvuru **üye yapmaz**, bir owner/admin/moderator kabul eder. Kapalı gruba id ile doğrudan başvuru yolu yok (UUID sızarsa ad sızmasın diye `group_not_found`).
- **Başvuru politikası:** reddedilen 24 saat sonra yeniden başvurabilir (yeni satır; geçmiş durur); kişi başına ≤ 20 bekleyen, grup başına ≤ 200 bekleyen başvuru.
- **Davet:** yalnız davetli yanıtlar; iptal/kullanılmış/süresi dolmuş davet tekrar kullanılamaz (`invalid_state`/`expired`); engel, üye, yasak, yinelenen için atlama nedeni döner (sessizce yutulmaz); grup başına ≤ 100 bekleyen davet. Davetli, daveti gönderen sonradan engellenirse kabul edemez.
- **Üyelik/Engel/Yasak:** engel ilişkisi **grup sahibiyle** (başvuru/katılım) ya da işlemi yapan yöneticiyle (kabul) varsa katılım reddedilir; grup içinde birbirini engelleyenler birbirinin mesajını **görmez** (karşılıklı, RLS'te) ama yazma kilitlenmez.

### Kapalı → açık geçiş (kritik kural) — `set_chat_group_visibility`

Tek SECURITY DEFINER fonksiyon = tek transaction; grup satırı `for update` kilitli; owner/admin dışı `forbidden`. Bekleyen başvurular `created_at` sırasıyla (limit adil dolsun) işlenir:

| Durum | Sonuç |
|---|---|
| Zaten üye | istek `accepted` (`decision_note='already_member'`), **ikinci üyelik yok** |
| Yasaklı / engel ilişkisi / üye sınırı dolu | **`pending` KALIR** (kabul edilmiş gibi işaretlenmez), sonuçta nedeniyle raporlanır (`skipped`, en çok 50 ayrıntı + `skipped_count`) |
| Diğerleri | üyelik + istek `accepted` (`decided_by` = işlemi yapan) + başvurana bildirim (`dedupe_key`) |

Yarıda hata → fonksiyonun tamamı geri alınır (görünürlük de eski hâline döner; testli). Tekrar çağrı (`aynı görünürlük`) değişiklik yapmaz, bildirim/üyelik çoğalmaz. Yanıt: `changed, visibility, accepted_count, already_member_count, skipped_count, skipped[], pending_remaining, member_count`. Arayüz önce spec'teki onay metnini gösterir, sonra sonuç penceresi sayıları ve kabul edilemeyen nedenleri yazar; üye/bekleyen sayıları yeniden okunur. Açık → kapalı geçişte üyeler çıkarılmaz.

## Mesajlaşma

- Okuma politikası (`can_read_message`): birebirde eskisiyle aynı; grupta **üyelik + `created_at >= joined_at`** (katılmadan önceki geçmiş görünmez; ayrılıp dönen yalnızca dönüşten sonrasını görür) + engel ilişkisindeki göndericinin mesajı görünmez.
- Gönderme (`can_send_message`): birebirde eski kural; grupta aktif üye + `posting_policy`. Çıkarılan kullanıcı anında yazamaz, okuyamaz, eski mesajını düzenleyemez (UPDATE politikası da daraltıldı).
- `conversation_members` SELECT: grupta yalnız kendi satırım (diğer üyelerin arşiv/sessiz/okunmamış durumu sızmaz); üye listesi `chat_group_members` RPC'sinden (rol sırası, arama, sayfalama).
- Mesajlar `handle_new_message` ile `last_message_at` ve diğer üyelerin `unread_count`'unu günceller (grupta da). **Mesaj başına bildirim yok** (`notify_new_message` grubu atlar); sessize alan üye geri getirilmez, başlıktaki noktayı yakmaz (`hasUnreadInInbox`).
- Liste önizlemesi `conversation_last_messages` RPC'si (konuşma başına tek, RLS'li, kişisel temizlemeye saygılı) — eski istemci tüm mesajları çekiyordu; grupla büyüyemezdi. Sohbet ekranı en yeni 200 mesajı yükler, "Daha eski mesajları yükle" ile geriye gider.

## Bildirimler (yalnızca işlem başarılıysa, aynı transaction'da)

Tür olarak mevcut **`system`** kullanıldı (check kısıtını genişletmek `drop constraint` gerektirirdi; 165/166'daki aynı karar). Cümleler `notification-message.ts` + `notifMsg.group*` ile TR/EN: davet edildin · isteğin kabul/ret · yeni katılım isteği (owner/admin/moderatör) · davet kabul edildi · yeni üye (yalnız ≤ 50 üyeli gruplarda, owner/admin'e) · çıkarıldın · görünürlük/yazma izni değişti · sahiplik devri/otomatik devralma. `dedupe_key` tekrarı önler. Sessize alan üye bilgi düzeyindeki bildirimleri (yeni üye, ayar değişimi, yeni istek) almaz; kendini doğrudan ilgilendirenleri (davet, kendi isteğinin sonucu, çıkarılma, sahiplik) alır.

## Güvenlik ve RLS özeti

- Yeni tablolara istemci YAZAMAZ (politika yok + `revoke insert/update/delete`); `anon` hiçbirini göremez; `chat_group_links.token_hash` okunamaz.
- Her RPC: SECURITY DEFINER, `search_path` sabit, kimlik `auth.uid()`, askıdaki hesap reddedilir, EXECUTE yalnız `authenticated`; iç yardımcılar (`_group_*`) kimseye açık değil. İstemciden gelen rol/görünürlük/grup kimliğine güvenilmez.
- Yarış koşulu: her yazan RPC önce grup satırını `for update` kilitler (üye sınırı aşımı, çift kabul, çift üyelik, rol/görünürlük çakışması grup başına sıralanır); kilit sırası her yerde "önce grup, sonra bağlantı/istek".
- Sınırlar: kişi başı ≤ 20 sahip olunan grup, ≤ 200 üye olunan grup; grup başı ≤ 10 etkin bağlantı. Avatar adresi yalnız bu projenin `avatars` bucket'ından olabilir (sunucuda doğrulanır); `orphan_storage_objects` grup görsellerini korur.

## Arayüz

`/groups` (Keşfet: arama, popüler/en yeni/aktif, "Daha fazla yükle", yükleniyor/boş/hata; **Davetlerim**: bana gelen davetler + bekleyen başvurularım; bağlantı yapıştırma), `/groups/join#<token>` (token URL parçasında — sunucuya/günlüğe gitmez; girişsizse oturum depolamasına yazılıp giriş sonrası devam), "Yeni grup" modalı (ad zorunlu, açıklama, görsel, görünürlük, üye sınırı, ilk davetler; çift gönderim yok), mesajlar başlığında "Grupları keşfet" + "+"daki "Yeni grup". Grup sohbeti mevcut `LocalConversationView`'dir (ikinci bir sohbet ekranı yok): başlıkta grup görseli/ad/üye sayısı, "⋮" menüsü (bilgi, sessize al, arşivle, geçmişi temizle, listemden kaldır, ayrıl), mesajın üstünde gönderen avatarı/adı/rol etiketi, "yalnızca yöneticiler yazar" uyarısı, yönetici olarak silme. **Grup bilgisi penceresi** (rol bazlı sekmeler): Genel · Üyeler (rol atama/çıkar/yasakla/devret, onaylı) · Katılım istekleri · Davet (kullanıcı arama + takip ettiklerim, bekleyen davetler, bağlantılar, yasaklılar) · Ayarlar (görünürlük onayı + sonuç özeti, grup silme: ad yazarak onay). Yetkisiz kontroller gizlenir; asıl yetki sunucudadır.

## Dosyalar

Migration: `supabase/migrations/20260919980000_chat_groups_schema.sql` (şema, RLS, tetikleyiciler, birebir akış düzeltmeleri), `20260919990000_chat_groups_functions.sql` (RPC'ler). Kod: `src/lib/chat-groups.ts` (saf kurallar), `src/lib/supabase/chat-groups.ts`, `src/lib/supabase/messages.ts`, `src/features/groups/*`, `src/features/messages/*` (liste, sohbet, balon, menü, yeni sohbet), `src/app/(app)/groups/*`, `src/lib/i18n/translations.ts` + `notification-message.ts` (TR+EN eklendi), `src/types/index.ts`.
Testler: `supabase/tests/chat-groups.sql` (113 kontrol, yerel PostgreSQL; temiz DB'ye `supabase/tests/run-local.sh` ile bütün migration'lar baştan oynatılır), `src/lib/chat-groups.test.ts` (`npm test`), `tests/messaging-ui/run-groups.mjs` (ağ taklitli Playwright, 27 senaryo; mevcut `run.mjs` 24/24 hâlâ geçer).

## Bilinen boşluklar / riskler

- Canlıya uygulanmadı; gerçek Supabase, Realtime (`chat_groups` + mesaj/üyelik olayları), gerçek oturum ve cihaz denenmedi. Sandbox Realtime WebSocket'ine erişemez.
- Paylaşılan `Modal` bileşeni odak tuzağı kurmaz (mevcut davranış); grup pencereleri Escape, `aria-modal`, etiketli başlık ve klavyeyle erişilebilir sekme/butonlar sağlar ama odak yönetimi iyileştirmesi ayrı iş.
- "Grubu kapat" (salt-okunur arşiv) yok; yalnız kalıcı silme (owner, ad yazarak onay) var.
- Mesaj başına bildirim ve @bahsetme grupta yok (bilinçli: bildirim sistemi boğulmasın).
- Keşif sayfalaması `limit/offset` (≤ 2000); çok büyük katalogda keyset'e çevrilmeli. Üye listesi/arama aynı şekilde offset.
- Katılmadan önceki geçmiş görünmez ve yeniden katılımda sıfırlanır; "geçmişi gör" ayarı yok.
- Grup içinde bir kişiyi engellemek mesajı onun yerine **gizler**, onu gruptan çıkarmaz; yönetici gerekirse çıkarır/yasaklar.
- Üyelikten çıkarılan kişinin eski mesajları grupta kalır (birebir sohbetle aynı politika).
- Bildirim türü `system` (kategori filtresinde "Sistem" altında görünür).
