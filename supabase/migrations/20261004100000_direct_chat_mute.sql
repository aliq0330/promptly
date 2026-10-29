-- Birebir sohbette "Sessize al" (docs/history/270-*): kişisel `conversation_members.muted_at` işareti artık birebirde de
-- mesaj bildirimini keser. Yalnızca `create or replace` (aynı imza, `drop` yok): tek fark, alıcının satırında `muted_at` doluysa
-- bildirim yazılmaz — sessizdeki kişi yine de sohbeti açınca mesajı görür, okunmamış sayacı çalışır. Gövde, en son tanım olan
-- 20260920170000_stories.sql'deki ile aynıdır (hikâye yanıtı cümlesi dahil).

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
  if public.is_group_conversation(new.conversation_id) then
    return new;
  end if;

  v_preview := case
    when new.body is not null then '"' || public.truncate_preview(new.body) || '"'
    when new.shared_prompt_id is not null then 'bir prompt paylaştı'
    when new.shared_request_id is not null then 'bir prompt isteği paylaştı'
    when jsonb_array_length(new.attachments) > 0 then 'bir fotoğraf gönderdi'
    else 'bir mesaj gönderdi'
  end;

  for v_recipient in
    select user_id, status from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id and muted_at is null
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id,
      new.sender_id,
      case when v_recipient.status = 'pending' then 'message_request' else 'message' end,
      case
        when new.is_story_reply then 'Hikâyene yanıt verdi: ' || v_preview
        when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi: ' || v_preview
        else 'Sana bir mesaj gönderdi: ' || v_preview
      end,
      '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id
    );
  end loop;

  return new;
end;
$$;
