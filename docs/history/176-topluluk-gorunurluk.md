# 9.176 — Topluluk görünürlüğü (3 düzey), tek üyelik düğmesi, aramadan başvuru, öneriler; "Kaydet" kaldırıldı

Durum: kod, 1 migration (`20260920070000_community_visibility.sql`), testler ve belgeler repoda; **canlıya UYGULANMADI** (canlı veritabanında SQL ÇALIŞTIRILMADI, deploy yapılmadı). Önce migration (175'in üç dosyasından SONRA), sonra istemci kodu. Gerçek Supabase'e / oturuma / cihaza karşı denenmedi; testler yerel PostgreSQL ve ağ taklitli Playwright'tadır.

> **Güncelleme (177):** buradaki "kapalı topluluğun kartı `chat_groups` SELECT politikasıyla herkese okunur" kararı 177'de DEĞİŞTİ — satır yalnız üyeye okunur, kart `community_cards` RPC'siyle gelir; ziyaretçi herkese açık topluluğu okuyabilir; görsel özel bucket'ta. Ayrıntı: [177](177-topluluk-gizlilik.md).

## İstenenler (kullanıcı kararı)

1. "Kaydet" (yer imi) kalkar. Katıl seçeneği zaten var: Kaydet'in olduğu yere **Katıl**; üyeyse **Katıldın ▼** → "Bu topluluktan ayrıl".
2. Kapalı topluluklar aramada da görünür ve oradan istek gönderilebilir. Üç düzey:

| Düzey | DB değeri | Etiket (TR / EN) | Keşfet | Arama + öneri | İçerik (akış, sohbet, üyeler) | Katılma |
|---|---|---|---|---|---|---|
| Herkese açık | `public` | Herkese açık / Public | görünür | görünür | üye olmadan herkes okur | doğrudan **Katıl** |
| Kapalı | `restricted` | Kapalı / Private | **görünmez** | **görünür** | yalnız üyeler | aramadan/öneriden **istek** (yönetici onaylar) |
| Tamamen kapalı | `private` (eski değer, anlam aynı) | Tamamen kapalı / Invite only | görünmez | **görünmez** | yalnız üyeler | yalnız davet / davet bağlantısı; id ile bile bulunamaz |

3. Keşfet'e "Senin için önerilenler" bölümü.

Bugüne dek `private` olan her topluluk aynen **Tamamen kapalı** kalır: hiçbirinin davranışı değişmez, kendiliğinden daha açık olmaz. Yeni değer adı `restricted` seçildi, çünkü topluluklarda `closed_at` ("kapatılmış, salt-okunur") zaten ayrı bir kavram; `closed` iki anlama gelirdi.

## Veritabanı (`20260920070000_community_visibility.sql`)

- **Yıkıcı iki adım (ikisi de canlıya hiç uygulanmamış 175 nesnesidir; kullanıcı onayıyla):** `community_bookmarks` tablosu + `set_community_bookmark` düşürülür; `list_my_communities` dönüş tipi değiştiği için düşürülüp `bookmarked` sütunu olmadan yeniden yazılır. Eski migration dosyalarına dokunulmadı.
- `chat_groups_visibility_check` → `('public','restricted','private')`; `chat_groups` SELECT politikası `restricted` satırı (kart: ad, açıklama, kategori, üye sayısı, kurallar) herkese okunur yapar. **İçerik ayrı korunur:** `can_read_community` yalnız `public` ya da üyeliği kabul eder (değişmedi) → gönderi/duyuru/etkinlik/mesaj/üye listesi kapalı toplulukta üyelik olmadan okunamaz. `private` satırın varlığı hâlâ sızmaz.
- `create_community` ve `set_chat_group_visibility` aynı imzayla yeniden yazıldı (`restricted` kabul eder; `create_chat_group` değişmedi: önce `private`, aynı işlemde yükseltilir). Bekleyen başvurular yalnız `public`e geçişte, güvenlik kurallarına uyanlar için kabul edilir; diğer geçişlerde başvurulara dokunulmaz.
- `request_join_community(group, message, accept_rules)`: `public` → doğrudan katılım (`join_community`); `restricted` → başvuru (yasak/engel → `cannot_join`, kapatılmış → `community_closed`, dolu → `member_limit_reached`, 24 saat ret bekleme, 20/200 sınırı, kural kabulü aynı işlemde + tetikleyici doğrulaması, bekleyen davet varsa katılım, `manage_requests` yeteneği olan kadroya bildirim); `private` → `group_not_found`.
- `search_communities(query, category, limit, offset)`: `public` + `restricted`, ad/açıklama, joker karakter kaçışlı, boş sorgu sonuç vermez; yasaklı olduğum/sahibiyle engelli olduğum topluluklar yok; kapalı topluluk için **içerik istatistiği (gönderi, etkinlik, son etkinlik) üye olmayana null**.
- `suggest_communities(limit)`: üye olmadığım, davet/başvurum olmayan, dolu olmayan `public` + `restricted`; puan = üyesi olduğum topluluklarla ortak kategori (genel hariç, ≤3) ×3 + ln(1+üye sayısı) + (yalnız açıkta) son 14 gün gönderi etkinliği. Kapalı topluluğun etkinliği hesaba katılmaz. Takip ettiklerimden türetilen sinyal **yok** (kapalı topluluk üyeliğini sızdırır).

## Arayüz

- `CommunityJoinButton` (`features/communities/community-join-button.tsx`): kart ve topluluk başlığında TEK üyelik düğmesi. Üye değil + açık → **Katıl** (kurallar zorunluysa önce kural metni); + kapalı → **İstek gönder**; isteğim var → **İstek gönderildi ▼** → "İsteği geri çek"; üyeyim → **Katıldın ▼** → "Topluluktan ayrıl" (onaylı; tek üye sahipse "topluluk silinir" uyarısı; başka üye varken sahip için öğe devre dışı + neden); davetliyim → "Davet edildin"; tamamen kapalı + üye değil → düğme yok. Gerçek kural DB'dedir.
- Topluluklar sayfası: "Kaydedilenler" sekmesi ve karttaki yer imi yok. Arama kutusu yazılınca `search_communities` (açık + kapalı), boşken Keşfet (`discover_communities`) + üstte **Senin için önerilenler** (arama ve kategori süzgeci yokken). Kartta görünürlük rozeti (Globe / DoorClosed / Lock), kapalı topluluk kartında içerik istatistiği yerine "içerik yalnızca üyelere" notu, öneri nedeni (ortak konu / popüler).
- Topluluk sayfası: üye olmayan için "geçit" şeridi artık yalnız davet/bekleyen başvuru/kapatılmış notu taşır (Katıl düğmesi başlıkta); kapalı ve tamamen kapalıda sekme yoktur. Tamamen kapalı topluluktan ayrılan kişi listeye döner.
- Oluşturma ve Yönetim → Ayarlar: üç seçenekli görünürlük (varsayılan hâlâ Tamamen kapalı); Ayarlar'da mevcut düzeyin dışındaki düzeylere geçiş düğmeleri (her biri onaylı). Bağlantıyla yalnız açık topluluğa doğrudan girilir; kapalı/tamamen kapalıda bağlantı başvuru oluşturur (değişmedi).
- Çeviriler: TR + EN eklendi (`translations.ts` `groups.visibility.*`, `groups.settings.*`; `translations-communities.ts` `communities.join.*`, `communities.search.*`, `communities.suggest.*`, `communities.gate.restricted*`). Yer imi anahtarları silindi.

## Testler (bu oturumda çalıştırıldı)

- `supabase/tests/communities.sql`: yerel PostgreSQL 16'da `FAILED=0` (yer imi testleri çıkarıldı; yeni 102–123: üç düzey saklama, Keşfet/arama/öneri sızıntı kontrolleri, satır okuma, içerik gizliliği, doğrudan katılım yok, başvuru akışı + kural + mesaj sınırı + bildirim, engel, kabul/ret/bekleme, açık için doğrudan katılım, öneri sırası/nedeni/istatistik gizleme, doluluk, ayrılma sonrası yeniden başvuru, görünürlük geçişleri ve bekleyen başvuruların akıbeti, tamamen kapalıya dönünce her yerden düşme, tablo/RPC yokluğu, EXECUTE, doğrudan yazma reddi). Diğer SQL dosyaları da ayrı ayrı çalıştırıldı.
- `npm test`: `src/lib/communities.test.ts` yeni görünürlük testleriyle.
- Playwright (ağ taklitli): `run-communities` 54/54 (24–28 yeni: tek düğme akışı, sahip ayrılamaz, arama, istek + geri çek, kurallı istek, kapalı/tamamen kapalı sayfa, öneriler, oluşturma 3 seçenek, Ayarlar geçişi, İngilizce), `run-groups` 26/26, `run-chat` 33/33, `run` 24/24.

## Bilinen boşluklar

- Gerçek Supabase'e / oturuma / cihaza karşı denenmedi; arama/öneri performansı büyük veriyle ölçülmedi (arama `ilike '%…%'`; indeks yalnız sıralama için).
- Kapalı topluluğa istek gönderirken isteğe bağlı kısa mesaj alanı arayüzde yok (RPC destekliyor).
- Öneriler basit ve açıklanabilir bir puandır (kişiselleştirme/öğrenme yok); sonuçlar sayfa yenilenince değişebilir.
- Kapalı ⇄ tamamen kapalı geçişte bekleyen başvurulara dokunulmaz; yönetici hâlâ karar verebilir.
- Eski SQL bildirim cümleleri "grup" der (değişmedi).
