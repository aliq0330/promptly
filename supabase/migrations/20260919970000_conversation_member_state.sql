-- Mesajlaşma: sohbet başına KİŞİYE ÖZEL arşiv / liste-silme / geçmiş-temizleme durumu (docs/history/171-*).
--
-- Model: ortak kayıtlar (conversations, messages, karşı tarafın conversation_members satırı) HİÇBİR
-- ZAMAN değişmez. Üç eylem yalnızca eylemi yapanın kendi conversation_members satırındaki üç
-- zaman damgasıdır:
--   archived_at  — sohbet kullanıcının "Arşivlenenler" görünümünde (gelen kutusunda değil)
--   deleted_at   — sohbet kullanıcının listesinde yok ("Sohbeti sil"); karşı tarafı etkilemez
--   cleared_at   — bu andan ÖNCEKİ mesajlar yalnızca bu kullanıcının görünümünde gizli
--                  ("Mesajları temizle"; "Sohbeti sil" de eski geçmişi gizlemek için bunu kullanır)
-- İstemci bunları, mevcut "üyeler kendi üyelik satırını günceller" politikasıyla (USING/CHECK
-- auth.uid() = user_id) kendi satırında değiştirir; başka kimsenin satırına yazamaz — yeni politika yok.
--
-- Yeni mesaj gelince (hangi taraftan olursa olsun) sohbet her üyenin gelen kutusuna geri döner:
-- aşağıdaki AFTER INSERT tetikleyicisi archived_at / deleted_at'i temizler. Var olan
-- handle_new_message DEĞİŞTİRİLMEDİ; cleared_at'e dokunulmaz (eski geçmiş geri gelmez).
--
-- Yazılmayan tablo yok, ikinci sohbet sistemi yok. Yalnızca ekleyici (add column / create function).

alter table public.conversation_members
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists cleared_at timestamptz;

comment on column public.conversation_members.archived_at is 'Bu üyenin arşivi: dolu = kullanıcının Arşivlenenler görünümünde. Yalnızca kendi satırı.';
comment on column public.conversation_members.deleted_at is 'Bu üyenin listesinden silinmiş: dolu = gelen kutusunda/arşivde görünmez. Karşı tarafın satırı ve mesajlar etkilenmez.';
comment on column public.conversation_members.cleared_at is 'Bu üyenin görünümünde bu andan önceki mesajlar gizli. Mesaj satırları silinmez.';

-- Yeni mesaj: sohbet arşivde ya da silinmiş durumdaysa üyelerin gelen kutusuna döner.
create or replace function public.resurface_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
     set archived_at = null,
         deleted_at = null
   where conversation_id = new.conversation_id
     and (archived_at is not null or deleted_at is not null);
  return new;
end;
$$;

revoke all on function public.resurface_conversation_on_message() from public, anon, authenticated;

create or replace trigger messages_resurface_conversation
  after insert on public.messages
  for each row execute function public.resurface_conversation_on_message();

-- Yazmadan "bu kullanıcıya şu an mesaj başlatabilir miyim?" kontrolü — start_direct_conversation'ın
-- kurallarının AYNISI (kendine yok; engel iki yönde; var olan 1:1 sohbet her zaman yeniden açılır;
-- aksi hâlde alıcının message_privacy ayarı). Sebep DÖNDÜRMEZ: engelli mi, gizlilik mi, bilinmez
-- kullanıcı mı ayırt edilemesin diye yalnızca mesaj atılabilecek kimlikleri döner. Son otorite yine
-- start_direct_conversation + messages INSERT politikasıdır; bu yalnızca arayüzün erken, dürüst uyarısı.
-- SECURITY INVOKER: çağıranın RLS'iyle çalışır (kendi üyelikleri, herkese açık profiller/takipler;
-- is_blocked zaten simetrik DEFINER yardımcısıdır). En çok 100 kimlik.
create or replace function public.filter_messageable_users(p_user_ids uuid[])
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from public.profiles p
  where auth.uid() is not null
    and p.id = any (p_user_ids[1:100])
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
    and (
      exists (
        select 1
        from public.conversation_members mine
        join public.conversation_members theirs using (conversation_id)
        where mine.user_id = auth.uid() and theirs.user_id = p.id
      )
      or p.message_privacy <> 'followers_only'
      or exists (
        select 1 from public.follows f
        where f.follower_id = p.id and f.following_id = auth.uid()
      )
    );
$$;

revoke all on function public.filter_messageable_users(uuid[]) from public, anon;
grant execute on function public.filter_messageable_users(uuid[]) to authenticated;
