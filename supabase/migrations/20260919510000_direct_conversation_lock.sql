-- Bilinen hata (Bölüm 9.0): eşzamanlı 'Mesaj Gönder' iki konuşma oluşturabiliyordu.
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

  -- Aynı iki kişi AYNI ANDA ilk kez yazarsa "bul ya da oluştur" yarışı iki
  -- ayrı konuşma üretebilirdi: çift başına işlem-seviyesi kilit, ikincinin
  -- birincinin commit'ini beklemesini ve var olan konuşmayı görmesini sağlar.
  perform pg_advisory_xact_lock(
    hashtextextended(least(v_self::text, other_user_id::text) || ':' || greatest(v_self::text, other_user_id::text), 0)
  );

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
