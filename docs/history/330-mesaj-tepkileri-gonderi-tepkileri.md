# 330 — Mesaj tepkileri = gönderi tepkileri

Tarih: 2026-11-04 · Durum: **kodda uygulandı; `20261104120000_message_reactions_post_reactions.sql` boru hattıyla uygulanır** (`schema_migrations`'a bak). Kaynak: kullanıcı isteği ("mesajlaşmada mesaja atılan emojiyi gönderideki tepkilerle değiştir, efektler aynı olsun; veritabanı değişebilir; normal klavye emojilerine dokunma").

## 1. Ne değişti

- Sohbette bir mesaja verilen tepki artık serbest Unicode emoji DEĞİL, gönderilerdeki altı tepkiden biridir: `love · fire · wow · clap · haha · idea` (`lib/reactions.ts` `REACTION_KEYS`).
- İki giriş noktası aynı seçiciyi kullanır (`MessageReactionPicker`, `features/messages/message-reaction-picker.tsx`): baloncuğun yanındaki küçük düğme (portal + `useAnchoredPopover`) ve uzun basma / ⋮ sayfasının tepki çubuğu (`variant="bar"`). Seçicinin içi gönderi seçicisinin kendisidir: `ReactionGrid` yeni `compact` biçimiyle (tek satır, ad yalnız erişilebilir etiket/ipucu, "Tepkini kaldır" satırı yok — seçili olana tekrar basmak geri alır). Eski `emoji-picker.tsx` (6 + 12 emoji, "+") silindi.
- Baloncuğun altındaki rozet `MessageReactionBadge`: statik posterler (en çok verilen ≤3) + birden fazla kişi tepki verdiyse toplam. Kullanıcı bir tepki VERİNCE (geri alınca değil) o emoji rozette kendi Telegram animasyonunu oynatır ve büyük efekt oradan patlar — `ReactionButton`'ın yaptığının aynısı (`ReactionIcon.play` + `playReactionEffect`; hareketi azalt'ta hiçbir şey oynamaz). Gösterilen üçün dışındaysa efekt rozetin kendisinden çıkar.
- DOKUNULMAYAN: yazma alanının emoji klavyesi (`composer-emoji-picker.tsx`, `emoji-data.ts`), hikâye tepkileri (`STORY_REACTIONS`), gönderi/yorum tepkileri.

## 2. Veritabanı

- Sütun adı `emoji` olarak kaldı (Realtime abonelikleri, RLS politikaları, dizinler aynen çalışsın); içinde artık tepki anahtarı durur. CHECK `message_reactions_emoji_check` yalnız altı anahtarı kabul eder (yeni tepki eklenirse `prompt_likes_reaction_check` ve `reaction_stats` ile BİRLİKTE genişler).
- Eski satırlar dönüştürüldü (U+FE0F atılarak): ❤ 😍 🥰 ♥ → love · 🔥 💯 → fire · 😮 😲 😯 → wow · 👏 👍 🙌 🎉 🙏 🥳 → clap · 😂 😅 🤣 😆 → haha · 🤔 💡 → idea. Karşılığı olmayanlar (😢 😡 😴 …) **silindi** — kullanıcı kararı. Mesaj tepkilerinin tetikleyicisi/bildirimi/sayacı yok; silme yalnız rozeti kaldırır.
- İstemci veri katmanı (`lib/supabase/message-reactions.ts`): `MessageReactionRow.reaction: ReactionKey`; okuma ve Realtime yükü `reactionRowFromDb` ile anahtar değilse atlanır. Yenilenmemiş eski bir sekme eski emojiyi yazarsa sunucu reddeder, iyimser tepki geri alınır; sayfa yenilenince düzelir.

## 3. Yol üstünde düzeltilen hata (önceden vardı)

En alttaki mesaja uzun basınca sayfa açılıyor, parmak kalkınca HEMEN kapanıyordu: yerleşim grubu yukarı kaydırınca parmağın altına bir menü satırı (ya da tepki çubuğu) geliyor, kalkıştan doğan `click` onu seçiyordu. `IGNORE_CLICK_MS` yalnız zemine uygulanıyordu. Artık `MessageActionSheet`, sayfanın İÇİNDE yeni bir işaretçi basılmadıkça fare/dokunma `click`'ini yakalama aşamasında yutar (`onPointerDownCapture` + `onClickCapture`); klavye etkinleştirmesi (`detail === 0`) her zaman çalışır. Değişikliksiz kodda `run-chat-popovers` 8 ve 9 bu yüzden düşüyordu (ayrıca "Koşullar güncellendi" bandı en alttaki mesajı örtüyordu — testte görülmüş sayıldı).

## 4. Testler

- SQL (yerel PostgreSQL): `supabase/tests/message-reactions-keys.sql` 15/15 (dönüşüm tablosu, VS16, silinenler, CHECK insert/update/bilinmeyen anahtar, RLS değişmedi); `community-privacy.sql` 79/79 (üye olmayan yazma denemesi artık geçerli anahtarla — CHECK'e değil RLS'e takıldığını sınar).
- Playwright (ağ taklitli): `run-chat-popovers` 10/10 (altı tepki, posterler, "+" yok, anahtar yazılır, rozet, geri alma), `run-reactions` 11/11, `run-comment-reactions` 4/4, `run-message-dock` 17/17, `run` 24/24, `run-chat` 37/38 — düşen 9. senaryo (sohbet içi arama "Güncel mesajlara dön") değişikliksiz kodda da aynı şekilde düşüyor, bu işle ilgisiz.
- `npm test` 907/907, `tsc`, `lint` (yeni uyarı yok), `build` temiz.
- DENENMEDİ: gerçek Supabase Realtime, gerçek cihaz (iOS uzun basma + efekt), canlı veri dönüşümü (canlıdaki mesaj tepkisi dağılımı bu oturumda sayılmadı).

## 5. Çeviri

Yeni metin yok: seçici `reaction.pickerAria`, düğme `reaction.add`, adlar `reaction.*` (TR+EN zaten var). Kullanılmayan `messages.chooseEmojiReaction/addEmojiReaction/giveEmojiReaction/showMoreEmoji` silindi.
