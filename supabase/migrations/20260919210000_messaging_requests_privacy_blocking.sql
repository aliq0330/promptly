-- Promptly — Mesajlaşma Faz B: mesaj istekleri, gizlilik ayarı, engelleme
-- entegrasyonu.
--
-- Kapsam kararı (kullanıcının detaylı mesajlaşma şartnamesinin 7 fazından
-- ikincisi — bkz. Bölüm 9.8'in "Sonraki adım" notu): yalnızca mesajlaşma
-- katmanındaki gizlilik/istek/engelleme. `reports`/`blocks` tabloları
-- Bölüm 18'de ZATEN oluşturulmuştu ve hiç kullanılmıyordu — talimatın
-- "mevcut veritabanını incelemeden yeni tablolar oluşturma" kuralına
-- uyarak burada YENİ bir tablo YOK, yalnızca mevcut `profiles`/
-- `conversation_members`'a birer sütun ekleniyor ve zaten var olan
-- `blocks`/`reports` gerçekten kullanılmaya başlanıyor. Feed/keşfet/yorum
-- gibi mesajlaşma DIŞI yerlerde engellenen bir kullanıcının içeriğini
-- gizlemek bu fazın kapsamında DEĞİL (Bölüm 22'nin genel moderasyon işi).

-- === Gizlilik ayarı: "kimler bana mesaj gönderebilir" ======================
alter table public.profiles
  add column message_privacy text not null default 'everyone'
    check (message_privacy in ('everyone', 'followers_only'));

-- === Mesaj istekleri: alıcının kendi üyelik satırındaki durum ==============
-- 'accepted' varsayılanı, bu migration'dan ÖNCE zaten var olan konuşmaları
-- (hepsi karşılıklı rıza ile Bölüm 21 Faz 6/A'da oluşmuştu) olduğu gibi
-- bırakıyor — geriye dönük hiçbir konuşma yanlışlıkla "istek" olmuyor.
alter table public.conversation_members
  add column status text not null default 'accepted'
    check (status in ('accepted', 'pending'));

-- === is_blocked(): engelleme kontrolü için SECURITY DEFINER yardımcı =======
-- `blocks`'un kendi RLS'i (Bölüm 19) yalnızca "auth.uid() = blocker_id"
-- olan satırları görünür kılıyor — yani bir kullanıcı yalnızca KENDİ
-- engellediklerini görebiliyor, BAŞKASININ onu engelleyip engellemediğini
-- göremiyor. Mesajlaşma RLS'inin iki yönü de kontrol edebilmesi için
-- `is_conversation_member()` ile birebir aynı desende bir SECURITY DEFINER
-- yardımcı gerekiyor.
create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

comment on function public.is_blocked(uuid, uuid) is
  'SECURITY DEFINER so a block check can see both directions even though the blocks SELECT policy only lets a user see rows where they themselves are the blocker.';

-- === Engelleme mesajlaşmayı gerçekten durdursun ============================
-- Var olan iki INSERT politikası (Bölüm 19) engelleme kontrolü olmadan
-- yazılmıştı — ikisi de şimdi is_blocked() ile genişletiliyor.

drop policy "Members can send messages in their conversations" on public.messages;
create policy "Members can send messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
    and not exists (
      select 1 from public.conversation_members other_member
      where other_member.conversation_id = messages.conversation_id
        and other_member.user_id <> auth.uid()
        and public.is_blocked(auth.uid(), other_member.user_id)
    )
  );

drop policy "Users can join or invite into a conversation they're in" on public.conversation_members;
create policy "Users can join or invite into a conversation they're in"
  on public.conversation_members for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or (public.is_conversation_member(conversation_id) and not public.is_blocked(auth.uid(), user_id))
  );

-- === Engelleme, var olan takip ilişkisini de kaldırır ======================
-- Ürün kararı: birini engellemek, onu (varsa) takip etmeyi/takip
-- edilmeyi de anlamsız kılıyor. handle_follow_change (Bölüm 19) zaten
-- DELETE'te sayaçları doğru düşürüyor, burada yalnızca satırları siliyoruz.
create or replace function public.handle_block_removes_follows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocks_after_insert_remove_follows
  after insert on public.blocks
  for each row
  execute function public.handle_block_removes_follows();

-- === start_direct_conversation(): tek, atomik giriş noktası ================
-- `getOrCreateDirectConversation`'ın eski istemci mantığı (Bölüm 21 Faz 6)
-- yalnızca "var olan konuşmayı bul, yoksa iki ayrı INSERT ile oluştur"
-- yapıyordu — artık buna engelleme reddi, gizlilik kontrolü (yalnızca
-- takip ettiklerimden), ve alıcının durumunun doğru başlangıç değerini
-- (zaten alıcı göndereni takip ediyorsa doğrudan 'accepted', değilse
-- 'pending' — bir mesaj isteği) hesaplama gerekiyor. Bunların hepsini
-- istemciye bırakmak (client'ın "pending" mi "accepted" mi yazacağına
-- karar vermesi) güvenilir olmazdı — bu yüzden select_prompt_request_
-- response (Bölüm 9.2) ile aynı gerekçeyle tek, atomik bir RPC.
--
-- SECURITY DEFINER DEĞİL: her adımı zaten invoker'ın kendi yetkisiyle
-- (RLS'ten geçerek) yapabiliyor — yalnızca is_blocked() çağrısı için
-- SECURITY DEFINER'a ihtiyaç var, o da kendi başına ayrı bir fonksiyon.
create or replace function public.start_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_conversation_id uuid;
  v_recipient_privacy text;
  v_recipient_follows_sender boolean;
  v_other_status text;
begin
  if v_self is null then
    raise exception 'Giriş yapmadan mesaj gönderilemez.';
  end if;
  if other_user_id = v_self then
    raise exception 'Kendine mesaj gönderemezsin.';
  end if;
  if public.is_blocked(v_self, other_user_id) then
    raise exception 'Bu kullanıcıyla mesajlaşamazsın.';
  end if;

  -- Var olan bir 1:1 konuşma varsa (durumu ne olursa olsun — kabul
  -- edilmiş ya da hâlâ bekleyen bir istek) onu yeniden kullan, ikinci bir
  -- konuşma asla oluşturma.
  select cm2.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2 using (conversation_id)
  where cm1.user_id = v_self and cm2.user_id = other_user_id
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select message_privacy into v_recipient_privacy from public.profiles where id = other_user_id;
  if v_recipient_privacy is null then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  select exists (
    select 1 from public.follows
    where follower_id = other_user_id and following_id = v_self
  ) into v_recipient_follows_sender;

  if v_recipient_privacy = 'followers_only' and not v_recipient_follows_sender then
    raise exception 'Bu kullanıcı yalnızca takip ettiği kişilerden mesaj kabul ediyor.';
  end if;

  v_other_status := case when v_recipient_follows_sender then 'accepted' else 'pending' end;

  -- Id'yi burada, açıkça üretiyoruz (tabloya varsayılan `gen_random_uuid()`
  -- ile bırakıp RETURNING'le geri okumak yerine) — Bölüm 21 Faz 6'nın
  -- gerçek bir kullanıcıda yakalanan hatasıyla birebir aynı RLS
  -- chicken-and-egg tuzağı: `conversations`'ın SELECT politikası
  -- `is_conversation_member(id)`, ve üyelik satırları henüz sonraki iki
  -- adımda eklenmediğinden bir RETURNING bu anda hiçbir şey gösteremezdi.
  v_conversation_id := gen_random_uuid();
  insert into public.conversations (id) values (v_conversation_id);

  insert into public.conversation_members (conversation_id, user_id, status)
  values (v_conversation_id, v_self, 'accepted');

  insert into public.conversation_members (conversation_id, user_id, status)
  values (v_conversation_id, other_user_id, v_other_status);

  return v_conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

-- === Bildirimler: mesaj isteği ayrı bir tip olarak ==========================
-- notifications.type CHECK'i (Bölüm 18) yeni bir değer alıyor —
-- notify_new_message artık alıcının O ANKİ durumuna bakıp doğru tipi/
-- metni seçiyor. Var olan diğer 8 değer (Bölüm 19/9.6) DEĞİŞMEDEN kalıyor.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'remix', 'request_response',
    'message', 'message_request', 'system'
  ));

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select user_id, status from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id,
      new.sender_id,
      case when v_recipient.status = 'pending' then 'message_request' else 'message' end,
      case when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi.' else 'Sana bir mesaj gönderdi.' end,
      '/messages/local?id=' || new.conversation_id
    );
  end loop;

  return new;
end;
$$;
