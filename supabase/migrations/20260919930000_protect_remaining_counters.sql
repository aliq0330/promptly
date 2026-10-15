-- Sayaç korumasının tamamlanması (docs/yapilacaklar.md madde 12, 20260919920000'ın devamı):
-- önceki migration'da "kapsam dışı" bırakılan iki sayaç grubu.
--
-- 1) conversation_members.unread_count: istemci "okundu" için kendi satırına 0 yazıyordu. Yalnız kendi
--    rozetini etkilese de aynı sınıf açık (herhangi bir değer yazılabilir). Okundu işareti artık
--    SECURITY DEFINER `mark_conversation_read()` RPC'sinden geçer (yalnız çağıranın kendi satırı,
--    yalnız 0'a); sütun `protect_counter_columns()` ile istemciye kapatılır. Artıran
--    `handle_new_message` zaten SECURITY DEFINER, etkilenmez.
-- 2) tags.prompt_usage_count / request_usage_count (usage_count bunlardan üretilen sütun): tags'te
--    yalnız SELECT politikası var, yani istemci zaten yazamaz; yine de ileride eklenecek bir politika
--    sayacı açmasın diye aynı trigger bağlanır (savunma derinliği). Sayaçları güncelleyen
--    trigger'lar SECURITY DEFINER.
--
-- Sıra: bu migration'ı uygulayan istemci sürümü `mark_conversation_read`'i çağırır; migration
-- uygulanmadan yeni istemci yayınlanırsa "okundu" işareti hata verir (best-effort, görüntülemeyi engellemez).

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members
     set unread_count = 0
   where conversation_id = p_conversation_id
     and user_id = auth.uid()
     and unread_count <> 0;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace trigger conversation_members_protect_counters
  before insert or update of unread_count on public.conversation_members
  for each row execute function public.protect_counter_columns('unread_count');

create or replace trigger tags_protect_counters
  before insert or update of prompt_usage_count, request_usage_count on public.tags
  for each row execute function public.protect_counter_columns('prompt_usage_count', 'request_usage_count');
