-- Promptly — Mesajlaşma: fotoğraf ekleri.
--
-- `messages`'a `attachments jsonb` (dizi: [{path, width, height, mime}]) eklenir.
-- Ayrı bir tablo yerine mesajın kendi satırında tutulur: Realtime INSERT
-- olayı ekleri de birlikte taşır (mesaj ↔ ek yarış durumu yok), "tek mesaj
-- varlığı" kuralı (yalnızca fotoğraf / yalnızca metin / ikisi) veritabanı
-- seviyesinde aynı CHECK ile korunur. Var olan mesajlar default '[]' alır,
-- hiçbiri etkilenmez.
--
-- Dosyalar PRIVATE `message-images` bucket'ında; nesne yolu
--   {conversation_id}/{sender_id}/{uuid}.{ext}
-- Okuma yalnızca o konuşmanın üyelerine (imzalı URL ile), yükleme yalnızca
-- kendi `sender_id` klasörüne ve üyesi olduğu konuşmaya, silme yalnızca
-- kendi klasörüne açıktır. Dosya adı hiçbir zaman kullanıcı girdisinden
-- türetilmez (istemci uuid + sabit uzantı üretir); bucket ayrıca MIME ve
-- boyutu sunucuda sınırlar.

alter table public.messages
  add column attachments jsonb not null default '[]'::jsonb;

alter table public.messages
  add constraint messages_attachments_is_array
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

alter table public.messages drop constraint messages_has_content;
alter table public.messages
  add constraint messages_has_content
    check (
      deleted_at is not null
      or body is not null
      or shared_prompt_id is not null
      or shared_request_id is not null
      or jsonb_array_length(attachments) > 0
    );

-- === Storage ================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-images', 'message-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "Conversation members can read message images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-images'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "Members can upload message images into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[2] = auth.uid()::text
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "Senders can delete their own message images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- === Bildirim önizlemesi: fotoğraf-only mesaj ==============================
-- 20260919230000'deki fonksiyonun BİREBİR aynısı; yalnızca önizleme zincirine
-- fotoğraf dalı eklendi.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_preview text;
begin
  v_preview := case
    when new.body is not null then '"' || public.truncate_preview(new.body) || '"'
    when new.shared_prompt_id is not null then 'bir prompt paylaştı'
    when new.shared_request_id is not null then 'bir prompt isteği paylaştı'
    when jsonb_array_length(new.attachments) > 0 then 'bir fotoğraf gönderdi'
    else 'bir mesaj gönderdi'
  end;

  for v_recipient in
    select user_id, status from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id,
      new.sender_id,
      case when v_recipient.status = 'pending' then 'message_request' else 'message' end,
      case
        when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi: ' || v_preview
        else 'Sana bir mesaj gönderdi: ' || v_preview
      end,
      '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id
    );
  end loop;

  return new;
end;
$$;
