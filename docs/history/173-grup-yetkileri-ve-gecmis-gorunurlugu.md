# 9.173 — Grup yetkileri (owner kontrolü) ve geçmiş mesaj görünürlüğü

Durum: kod, migration (`20260920000000_chat_group_permissions.sql`), testler ve belgeler repoda; **canlıya UYGULANMADI** (önce migration, sonra istemci kodu). Gerçek Supabase'e / cihaza karşı denenmedi. `docs/history/172-*` üzerine kurulur; oradaki "yetki matrisi" artık **varsayılan** matristir.

## 1. Yeni üyeler önceki mesajları görsün mü? — `chat_groups.history_visible`

- Varsayılan `false` (bugünkü davranış: üye yalnız `joined_at` sonrasını görür). Açıksa üye grubun tüm geçmişini görür (kişisel `cleared_at`, "benden sil" ve engel kuralı sürer).
- **Yalnızca owner** değiştirir: `update_chat_group_owner_settings`; admin/moderatör/üye `forbidden`, `chat_groups`'a doğrudan yazma da yok. Okuma kuralı `can_read_message` içinde (`g.history_visible or created_at >= joined_at`) — RLS'te, istemci filtresi değil; Realtime aynı politikayı kullanır.
- Ayar herkes için geçerlidir ve anında etkir (kapatınca üyeler tekrar yalnız katıldıkları andan sonrasını görür). Grup bilgisi "Genel" sekmesi bunu herkese gösterir.

## 2. Admin / moderatör yetkileri — `chat_groups.role_permissions`

Owner, rol başına 8 yeteneği açıp kapatır (kişi başına değil **rol başına**; o roldeki herkese uygulanır ve bildirim gider). Varsayılanlar 172'deki matrisle birebir aynıdır:

| Yetenek | Admin | Moderatör |
|---|---|---|
| `edit_settings` (ad/açıklama/görsel/limit/kim yazar) | ✔ | ✘ |
| `change_visibility` | ✔ | ✘ |
| `manage_invites` (davet, bağlantı, daveti iptal) | ✔ | ✘ |
| `manage_requests` | ✔ | ✔ |
| `remove_members` | ✔ | ✔ |
| `ban_members` (yasaklayarak çıkarma, yasağı kaldırma) | ✔ | ✘ |
| `manage_roles` (moderator↔member) | ✔ | — (verilemez) |
| `delete_messages` | ✔ | ✔ |

- Owner her zaman her şeyi yapar, **kısıtlanamaz**. Sahipliği devretme, grubu silme ve admin atama yalnız owner'da kalır; rütbe kuralları (kendinden düşük rütbeye işlem, admin başka admini çıkaramaz) yetkiden **bağımsız** sürer — tüm yetkiler verilse de moderatör admin/owner'ı çıkaramaz.
- Moderatöre `manage_roles` verilemez (rütbe kuralı gereği anlamsız; sunucu `invalid_patch` döner).
- Sunucu: `_group_can(group, user, cap)` + `_group_require_cap` + RLS için `chat_group_can(group, cap)`; 11 RPC (`update_chat_group`, `set_chat_group_visibility`, `invite_to_chat_group`, bağlantı/davet iptal, `unban`, `decide…`, `remove…`, `set…role`, `moderate…`) rol listesi yerine yetenek kontrolü yapar. Başvuru/davet/bağlantı/yasak tablolarının SELECT politikaları da yetkiye bağlandı (yetkisi alınan artık listeyi göremez). Yeni başvuru bildirimi yalnız `manage_requests` yetkisi olanlara gider. Saklı jsonb'da eksik anahtar varsa varsayılan uygulanır.
- `update_chat_group_owner_settings(group, patch)`: yalnız owner; `history_visible` (boolean) ve `role_permissions` (`{admin|moderator: {yetenek: boolean}}`) kabul eder, bilinmeyen rol/yetenek/tip reddedilir, yalnız gönderilen bayraklar değişir; denetim kaydı (`owner_settings_updated`) + yetkisi değişen roldeki üyelere bildirim (`"X" grubunda yönetim yetkilerin güncellendi.`, `dedupe_key`); değişmeyen yama `changed:false`.

## Arayüz

Ayarlar sekmesinde owner için iki yeni bölüm (ayrı `GroupOwnerSettings`): "Yeni üyeler önceki mesajları görsün mü?" (Görsün / Görmesin) ve "Yönetici ve moderatör yetkileri" (rol başına anahtarlar, "Varsayılan yetkilere dön", yalnızca değişenleri kaydeder). Sekmeler ve kontroller artık **yetkiye** göre görünür: İstekler = `manage_requests`, Davet = `manage_invites`, Ayarlar = owner ya da `edit_settings`/`change_visibility` (içindeki temel form ve görünürlük bölümü kendi yetkisiyle); üye satırı işlemleri, "çıkar ve yasakla" ve "yönetici olarak sil" de aynı yetenekleri izler. Gerçek yetki sunucudadır.

## Testler

`supabase/tests/chat-group-permissions.sql` (23 kontrol; varsayılanlar, owner-dışı reddi, geçersiz yamalar, geçmiş açma/kapama, yetki verme/geri alma ve RLS etkisi, rütbe kuralları, bildirim/denetim, tekrar çağrı), mevcut `chat-groups.sql` (113) yeni migration'la da geçer; `src/lib/chat-groups.test.ts` (yetenek yardımcıları), `tests/messaging-ui/run-groups.mjs` (33 senaryo).

## Bilinen boşluklar

- Yetkiler **rol başına**dır; tek bir admin/moderatöre özel yetki yok (gerekirse ayrı bir tablo ister).
- Canlıya uygulanmadı; gerçek oturumla/Realtime ile denenmedi.
- Geçmiş açıkken kapatma, daha önce açıkken görmüş üyelerin kendi cihazında önbelleğe aldığı mesajları geri çekmez.
