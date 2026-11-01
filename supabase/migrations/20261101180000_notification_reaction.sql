-- Beğeni bildirimlerinde tepki (docs/history/306-*): "X paylaşımını beğendi" satırı artık hangi tepkinin verildiğini de taşır
-- (`notifications.reaction`, yalnızca ekleyici). Yeni bildirim satırı kurmak yerine, beğeniyi yazan mevcut `notify_*_like` tetikleyicileri
-- olduğu gibi kalır; bu tetikleyici onların yazdığı satırı (aynı `dedupe_key`) ilk tepkide doldurur ve tepki DEĞİŞİNCE yerinde günceller
-- (yeni bildirim, okunmadı işareti ya da zaman değişikliği üretmez). Beğeni geri alınınca satırı zaten ilgili tetikleyici siler.

alter table public.notifications add column if not exists reaction text;
alter table public.notifications drop constraint if exists notifications_reaction_check;
alter table public.notifications add constraint notifications_reaction_check
  check (reaction is null or reaction in ('love', 'fire', 'wow', 'clap', 'haha', 'idea'));

create or replace function public.sync_like_notification_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  v_key := case
    when new.prompt_id is not null then 'prompt_like:' || new.prompt_id
    when new.workflow_id is not null then 'workflow_like:' || new.workflow_id
    when new.preset_id is not null then 'preset_like:' || new.preset_id
    when new.community_post_id is not null then 'cpost_like:' || new.community_post_id
    when new.quote_id is not null then 'quote_like:' || new.quote_id
    when new.space_id is not null then 'space_like:' || new.space_id
    else null
  end;
  if v_key is null then
    return new;
  end if;
  update public.notifications
     set reaction = new.reaction
   where dedupe_key = v_key || ':' || new.user_id
     and reaction is distinct from new.reaction;
  return new;
end;
$$;
revoke all on function public.sync_like_notification_reaction() from public, anon, authenticated;

-- Ad, `prompt_likes_after_insert_notify*` tetikleyicilerinden SONRA çalışacak şekilde seçildi (AFTER tetikleyiciler ada göre sıralanır).
drop trigger if exists prompt_likes_zz_sync_notification_reaction on public.prompt_likes;
create trigger prompt_likes_zz_sync_notification_reaction
  after insert or update of reaction on public.prompt_likes
  for each row execute function public.sync_like_notification_reaction();
