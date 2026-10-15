# 9.171 — Mesajlaşma: arşivle, sohbeti sil, mesajları temizle, yeni sohbet başlat

Durum: kod, migration, testler ve belgeler repoda; **canlıya uygulanmadı** (`20260919970000` canlı veritabanında ÇALIŞTIRILMADI, canlı veri değiştirilmedi, üretime deploy yapılmadı).

## Mevcut mimari (okunup doğrulandı)

- `conversations(id, last_message_at)`; `conversation_members(conversation_id, user_id, unread_count, status accepted|pending)` PK (conversation_id, user_id); `messages`; `message_hidden_for` ("Benden sil", mesaj başına); `blocks` + simetrik `is_blocked()`.
- RLS: üye kendi `conversation_members` satırını GÜNCELLEYEBİLİR / SİLEBİLİR (`auth.uid() = user_id`, tüm sütunlar; `unread_count` hariç — sayaç koruması). Başkasının satırına yazamaz. `messages` INSERT: gönderen = ben, üyeyim ve diğer üyelerle aramda her iki yönde engel yok.
- `start_direct_conversation(other)` (INVOKER, çift başına advisory lock): kendine/engelliye hata, var olan 1:1 sohbeti (her durumda) yeniden kullanır, aksi hâlde alıcının `message_privacy` ayarına bakar; alıcı göndereni takip ediyorsa üyelik `accepted`, değilse `pending` (= mesaj isteği).
- Bu görevden ÖNCE "sohbeti sil"/"temizle" yoktu; `declineMessageRequest` yalnız bekleyen istek içindi (kendi üyelik satırını siler). Kabul edilmiş sohbet için **kullanılmaz** — satırı silmek sohbeti geri getirilemez biçimde koparır ve `start_direct_conversation` yeni sohbet açardı.

## Karar: kişiye özel durum, ortak kayıt yok

Üç yeni nullable `timestamptz` sütunu, **eylemi yapanın kendi `conversation_members` satırında** (migration `20260919970000_conversation_member_state.sql`, yalnızca ekleyici, yeni tablo/politika yok):

| Eylem | Yazılan (yalnız kendi satırı) | Karşı taraf / ortak kayıtlar |
|---|---|---|
| Arşivle / Arşivden çıkar | `archived_at` = şimdi / null | etkilenmez |
| Sohbeti sil | `deleted_at` = şimdi, `archived_at` = null, `cleared_at` = son mesajın sunucu zamanı | etkilenmez; **hiçbir satır silinmez** |
| Mesajları temizle | `cleared_at` = son mesajın sunucu zamanı | etkilenmez; mesaj satırları durur |

- `cleared_at`, cihaz saati yerine **son mesajın `created_at`'i** olarak yazılır (saat kayması yeni mesajı gizleyemez/eskiyi açıkta bırakamaz). Okuma tarafı `created_at > cleared_at` ile süzer (`fetchMessages`, liste önizlemesi, tek sohbet önizlemesi); süzme için kendi `cleared_at` okunamazsa sohbet gösterilmez.
- **Yeni mesaj gelince** (`messages` AFTER INSERT, yeni `resurface_conversation_on_message()` — SECURITY DEFINER, `search_path` sabit, `EXECUTE` yalnız tetikleyici için; mevcut `handle_new_message` DEĞİŞTİRİLMEDİ) sohbetteki üyelerin `archived_at` / `deleted_at` değerleri temizlenir: arşivdeki sohbet gelen kutusuna döner, silinmiş sohbet yeniden listelenir. `cleared_at`'e dokunulmaz → silinen/temizlenen eski geçmiş geri gelmez, yalnız yeni mesajlar görünür.
- **"Sohbeti sil" tasarım yorumu:** "listemden kaldır" tek başına eski geçmişi bırakırdı ve sohbet geri geldiğinde "sildiğim" konuşma tüm geçmişiyle çıkardı. Bu yüzden silme, o ana kadarki geçmişi de kendi görünümünde gizler (onay metni bunu söyler). "Mesajları temizle"den farkı: sohbet listeden de kalkar.
- Mesaj isteği akışı aynen kalır: bekleyen sohbetlerde menü yoktur (Kabul Et / Sil banner'ı), "Sil" yine kendi üyelik satırını siler.

## Yeni sohbet (tek akış)

`ConversationsPane` başlığında her zaman görünen "+" ve sohbet yokken boş durumun birincil "Sohbet başlat" düğmesi AYNI `NewChatModal`'ı açar.

- Varsayılan liste: **Takip ettiklerim** (mevcut `follows`; sohbeti olanlar önce — son mesaja göre —, sonra alfabetik) ve **Etkileşimde bulunduklarım**. "Etkileşim" yeni uydurulmuş bir kavram değil: *zaten sohbeti olduğum kişiler* (her durumda) + *beni takip edenler*; takip ettiklerim, ben, engellediklerim ve tekrarlar çıkarılır. Saf kural: `src/lib/new-chat.ts` (testli). Her bölüm ≤ 30, kaynak listeleri ≤ 100 satır çekilir.
- Arama: kullanıcı adı / görünen ad, takip edilmeyenleri de bulur, 300 ms debounce, ≤ 20 sonuç, yalnız genel profil sütunları (e-posta/telefon istenmez), hata ile "sonuç yok" ayrılır (`searchProfilesStrict`).
- Birini seçmek hiçbir şey oluşturmaz: sohbet VARSA (her durumda) açılır; yoksa `/messages/local?to=<id>` boş yazma ekranı açılır ve sohbet **ilk gerçek mesajda** (`start_direct_conversation` + `sendMessage`) oluşur. Modalı/ekranı kapatmak boş sohbet bırakmaz. (Paylaşım seçicisinden — `?share…` — seçilen kişi için sohbet hemen oluşur: gönderme niyeti nettir, profildeki "Mesaj Gönder" ile aynı.)

## Gizlilik / engelleme

- Son otorite sunucu: `start_direct_conversation` (engel + gizlilik) ve `messages` INSERT RLS'i değişmedi. Arayüz yalnız erken uyarıdır.
- Yeni `filter_messageable_users(uuid[])` (INVOKER, ≤ 100 kimlik, `anon`'a kapalı): `start_direct_conversation` kurallarının **yazmadan** kontrolü; **sebep döndürmez**, yalnız ulaşılabilir kimlikleri verir. Listelerde ulaşılamayanlar çıkarılır (var olan sohbet ortakları hariç); seçimde sunucuya tek kimlikle sorulur (hata → kapalı başarısız).
- Reddedilen seçimde tek cümle: "Bu kullanıcıya şu anda mesaj gönderemezsin." — gizlilik mi, karşı taraf engeli mi söylenmez. Yalnız **kendi** engelleme için mevcut "Bu kullanıcıyı engelledin…" metni gösterilir (kendi bilgisi). Yazılmış `?to=` adresi de aynı kontrolden geçer.
- Var olan sohbette engel varsa gönderim RLS ile reddedilir ve mevcut "Kullanıcı seni engellemiş olabilir" metni görünür (değişmedi).

## Arayüz

Sohbet başlığındaki mevcut "⋮" menüsüne (`ProfileMoreMenu`, yeni `extraItems`) Arşivle/Arşivden çıkar · Mesajları temizle · Sohbeti sil eklendi (ikinci bir menü yok; yalnız kabul edilmiş sohbetlerde). Silme/temizleme onay penceresi (`Modal`) gerçek etkiyi yazar; arşivleme tek dokunuş + bildirim. Eylemler önce sunucuya yazılır, yerel durum yalnız onaydan sonra değişir; hata → başarı mesajı yok, durum aynı. İşlem sürerken butonlar kilitli. `Arşivlenenler` görünümü listede (Arşivlenenler (n) satırı), her satırda "Arşivden çıkar". Başlıktaki okunmamış noktası yalnız gelen kutusu/istekler için yanar (`hasUnreadInInbox`).

## Dosyalar

Migration: `supabase/migrations/20260919970000_conversation_member_state.sql`. Kod: `src/lib/supabase/messages.ts`, `src/lib/conversation-lists.ts`, `src/lib/new-chat.ts`, `src/features/messages/{chat-actions,new-chat-modal,new-chat-draft-view,conversation-route,conversations-pane,conversation-list,conversation-row,real-messages-provider,local-conversation-view}.tsx`, `src/features/profile/profile-more-menu.tsx`, `src/components/ui/empty-state.tsx` (birincil eylem varyantı), `src/lib/supabase/profiles.ts`, `src/types/index.ts`.
Testler: `src/lib/conversation-lists.test.ts`, `src/lib/new-chat.test.ts` (`npm test`), `supabase/tests/conversation-member-state.sql` (yerel PostgreSQL), `tests/messaging-ui/` (ağ taklitli Playwright, 24 senaryo).

## Bilinen boşluklar

- Canlıya uygulanmadı; Supabase'e / gerçek oturuma / fiziksel cihaza karşı denenmedi. Realtime bu sandbox'ta çalışmaz: başka cihazdaki durum değişikliği listeye canlı yansımaz (mevcut `conversation_members` aboneliği bunu zaten yapar, ama denenmedi).
- İlk mesajda sohbet oluşturulduktan sonra mesaj gönderimi başarısız olursa (ağ) boş bir sohbet kalır; yeniden denemede aynı sohbet kullanılır (ikinci sohbet açılmaz), ama kullanıcı vazgeçerse boş sohbet kalır.
- Listelerde "beni engelleyen" kullanıcılar `blocks` RLS'i yüzünden yalnız sunucu süzmesiyle elenir (`filter_messageable_users`); bu çağrı başarısız olursa listeler süzülmez, seçimde sunucu yine reddeder.
- Yeni "+"/Sohbet başlat için `Etkileşim` tanımı bilerek dardır (sohbet ortakları + takipçiler); yorum/beğeni etkileşimleri eklenmedi.
- Mesaj ARAMA / sayfalama yok (mevcut liste davranışı aynı); `last_message_at` sıralaması temizleme/silmeden etkilenmez.
