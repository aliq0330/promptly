-- Mesaj tepkileri = gönderi tepkileri (docs/history/330-*).
--
-- Sohbette bir mesaja verilen tepki artık serbest bir Unicode emoji DEĞİL, gönderilerdeki altı tepkiden biridir
-- (`love|fire|wow|clap|haha|idea`, `prompt_likes.reaction` ve `lib/reactions.ts` `REACTION_KEYS` ile aynı küme). Sütunun adı
-- `emoji` olarak KALIR (Realtime aboneleri, RLS politikaları ve dizinler aynen çalışsın diye); içinde artık tepki anahtarı durur.
--
-- 1) Var olan satırlar anahtara çevrilir. Emoji varyant seçicisi (U+FE0F) önce atılır ki "❤️" ile "❤" aynı sayılsın.
--    Doğrudan karşılıklar: ❤→love, 🔥→fire, 😮→wow, 👏→clap, 😂→haha; yakın karşılıklar: 😍 🥰 ♥ →love, 💯→fire, 😲 😯→wow,
--    👍 🙌 🎉 🙏 🥳 →clap, 😅 🤣 😆 →haha, 🤔 💡 →idea.
-- 2) Karşılığı olmayanlar (😢 😡 😴 😎 …) SİLİNİR — kullanıcı kararı (2026-11-04). Mesaj tepkileri bildirim/sayaç üretmez
--    (tetikleyici yok), silme yalnız o rozeti kaldırır.
-- 3) CHECK yalnız altı anahtarı kabul eder. Yenilenmemiş eski bir sekme eski emojiyi yazmaya çalışırsa sunucu reddeder
--    (istemci iyimser tepkiyi geri alır); sayfa yenilenince düzelir.
-- Yeni bir tepki eklenirse bu CHECK de `prompt_likes_reaction_check` ve `reaction_stats` ile birlikte genişler.

update public.message_reactions
set emoji = case replace(emoji, U&'\FE0F', '')
  when '❤' then 'love' when '😍' then 'love' when '🥰' then 'love' when '♥' then 'love'
  when '🔥' then 'fire' when '💯' then 'fire'
  when '😮' then 'wow' when '😲' then 'wow' when '😯' then 'wow'
  when '👏' then 'clap' when '👍' then 'clap' when '🙌' then 'clap' when '🎉' then 'clap' when '🙏' then 'clap' when '🥳' then 'clap'
  when '😂' then 'haha' when '😅' then 'haha' when '🤣' then 'haha' when '😆' then 'haha'
  when '🤔' then 'idea' when '💡' then 'idea'
  else emoji
end
where emoji not in ('love', 'fire', 'wow', 'clap', 'haha', 'idea');

delete from public.message_reactions
where emoji not in ('love', 'fire', 'wow', 'clap', 'haha', 'idea');

alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions
  add constraint message_reactions_emoji_check check (emoji in ('love', 'fire', 'wow', 'clap', 'haha', 'idea'));

comment on column public.message_reactions.emoji is
  'Tepki anahtarı: love|fire|wow|clap|haha|idea (gönderi tepkileriyle aynı, docs/history/330-*). Ad tarihsel olarak "emoji".';
