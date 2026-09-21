-- Promptly — Mesaj emoji tepkileri.
--
-- AŞAMA 1 denetim bulgusu: bu depoda emoji/reaction altyapısı (tablo,
-- sütun, RLS, istemci kodu) daha önce hiç yoktu (`grep -rli "emoji|
-- reaction"` sıfır sonuç verdi) — bu yüzden mevcut bir şeyi genişletmek
-- yerine, projenin zaten kurulu olan iki BENZER desenini birebir izleyerek
-- yeni, minimal bir yapı kuruldu:
--   1. `comment_likes` (20260919160000) — bileşik birincil anahtarla
--      "bir kullanıcı, bir hedef için en fazla bir satır" kuralını
--      veritabanı seviyesinde (uygulama kodu değil) zorlayan desen.
--   2. `messages`'ın kendi RLS'i (20260919130000/20260919210000) —
--      `conversation_id` sütunu üzerinden doğrudan `is_conversation_member()`
--      kontrolü yapan desen (bir join'e gerek kalmadan, Realtime'ın
--      `filter: conversation_id=eq.<id>` deseniyle de doğrudan uyumlu).
--
-- `message_reactions.conversation_id` bilinçli olarak denormalize edildi
-- (yalnızca `message_id`'den `messages.conversation_id`'ye join ile de
-- ulaşılabilirdi) — iki gerekçeyle: (a) SELECT/INSERT RLS'i `messages`
-- tablosuna join atmadan, `conversations`/`messages`'ın kendi politikalarıyla
-- birebir aynı basit `is_conversation_member(conversation_id)` deseniyle
-- yazılabiliyor, (b) Bölüm 21 Faz C'nin `messages` için zaten kurduğu
-- `filter: conversation_id=eq.<id>` Realtime deseni buraya da aynen
-- uygulanabiliyor (bir `message_id` listesine göre filtre Postgres
-- Changes'te desteklenmiyor). Tutarlılık, `conversation_id`'nin GERÇEKTEN
-- o `message_id`'nin konuşmasına ait olduğunu doğrulayan bir `WITH CHECK`
-- alt sorgusuyla korunuyor — istemci `conversation_id`'yi "uydurup" başka
-- bir konuşmaya sızdıramaz.

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  -- Birincil anahtarın kendisi "bir kullanıcı + bir mesaj için en fazla bir
  -- aktif tepki" kuralını veritabanı seviyesinde imkansız kılıyor —
  -- istemcinin doğru davranması gereken bir kural değil, hiç ihlal
  -- EDİLEMEYEN bir kısıt. Emoji değişikliği bu satırın kendisini
  -- güncelleyen (yeni bir satır eklemeyen) bir UPSERT'tir, bu yüzden
  -- atomik: aynı anda gelen iki istek (aynı kullanıcı, aynı mesaj) asla
  -- iki satır oluşturamaz, yalnızca aynı satırı sırayla günceller.
  primary key (message_id, user_id)
);

alter table public.message_reactions enable row level security;
create index message_reactions_conversation_id_idx on public.message_reactions (conversation_id);
create index message_reactions_message_id_idx on public.message_reactions (message_id);

-- Okuma: `messages`in kendi SELECT politikasıyla birebir aynı kural —
-- yalnızca konuşmanın üyeleri kendi mesajlarındaki tepkileri görebilir.
create policy "Conversation members can view message reactions"
  on public.message_reactions for select
  using (public.is_conversation_member(conversation_id));

-- Yazma (ekleme/değiştirme): yalnızca kendi adına (`auth.uid() = user_id`,
-- başka bir kullanıcının tepkisini oluşturma/değiştirme sahteciliği
-- `WITH CHECK` ile engelleniyor — `prompt_likes`/`comment_likes`'ın
-- zaten kurduğu aynı ilke), VE yalnızca gerçekten üyesi olduğu bir
-- konuşmaya, VE yalnızca `conversation_id`'nin GERÇEKTEN o mesajın kendi
-- `conversation_id`'siyle eşleştiği durumlarda (istemcinin başka bir
-- konuşmanın id'sini buraya yazıp Realtime filtresini/erişimini
-- yanıltmasını önlüyor).
create policy "Members can react to messages in their conversations"
  on public.message_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_conversation_member(conversation_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.conversation_id = message_reactions.conversation_id
    )
  );

create policy "Members can change their own reaction"
  on public.message_reactions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.is_conversation_member(conversation_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.conversation_id = message_reactions.conversation_id
    )
  );

-- Silme: yetkisiz bir kullanıcı başkasının tepkisini kaldıramaz — yalnızca
-- kendi satırı `using (auth.uid() = user_id)` ile görünür/silinebilir,
-- başka bir kullanıcının satırına yönelik bir DELETE RLS tarafından
-- sessizce 0 satır etkiler (bu projenin genelinde zaten kurulu olan
-- "sahiplik = satır görünürlüğü" ilkesi).
create policy "Users can remove their own reaction"
  on public.message_reactions for delete
  using (auth.uid() = user_id);

-- Gerçek zamanlı senkronizasyon (Bölüm 21 Faz C'nin `messages`/
-- `conversation_members` için zaten yaptığı gibi) — bu olmadan bir
-- tepki ekleme/değiştirme/kaldırma karşı tarafa yalnızca sayfa yeniden
-- ziyaret edildiğinde yansır.
--
-- `REPLICA IDENTITY FULL` burada gerekiyor — Faz C'nin `messages` için
-- gerekmediği (yalnızca INSERT/UPDATE dinliyor, birincil anahtar `id`
-- zaten her zaman mevcut) notundan FARKLI bir durum: bir tepkinin
-- KALDIRILMASI gerçek bir DELETE, ve istemci bunu `conversation_id=eq.<id>`
-- filtresiyle dinliyor — ama `conversation_id` bu tablonun birincil
-- anahtarının (`message_id, user_id`) bir parçası DEĞİL. Varsayılan
-- replica identity (yalnızca birincil anahtar kolonları) altında bir
-- DELETE olayının `old` satırı `conversation_id`'yi hiç içermez, bu
-- yüzden Realtime bu filtreyi değerlendiremez ve olayı hiç iletemez.
-- `REPLICA IDENTITY FULL`, silinen satırın TÜM kolonlarını `old`a dahil
-- ederek bu filtrenin gerçekten çalışmasını sağlıyor.
alter table public.message_reactions replica identity full;
alter publication supabase_realtime add table public.message_reactions;
