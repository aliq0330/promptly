-- Yorum tepkileri (docs/history/326-*): bildirim merkezindeki "Hızlı beğen" yorum için de altı tepkiden birini seçtirir.
--
-- TASARIM: `prompt_likes.reaction` (docs/history/265-*) ile AYNI kalıp — tepki ayrı tablo değil `comment_likes` satırının sütunudur;
-- her tepki hâlâ bir beğenidir (`prompt_comments.like_count` TOPLAM tepkidir, değişmez), tepkiyi değiştirmek UPDATE'tir (silip eklemek sayacı ve
-- bildirimi oynatırdı), eski satırlar ve eski istemciler `love` olarak çalışır. Yalnız EKLER; `drop` yok.

alter table public.comment_likes add column if not exists reaction text not null default 'love';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comment_likes_reaction_check') then
    alter table public.comment_likes add constraint comment_likes_reaction_check
      check (reaction in ('love', 'fire', 'wow', 'clap', 'haha', 'idea'));
  end if;
end $$;

-- Yalnız KENDİ satırının `reaction` sütunu değişir.
drop policy if exists "Users can change their own comment reaction" on public.comment_likes;
create policy "Users can change their own comment reaction"
  on public.comment_likes for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.enforce_comment_reaction_only_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if (to_jsonb(new) - 'reaction') is distinct from (to_jsonb(old) - 'reaction') then
    raise exception 'like_immutable';
  end if;
  return new;
end $$;
revoke all on function public.enforce_comment_reaction_only_update() from public, anon, authenticated;

drop trigger if exists comment_likes_reaction_only on public.comment_likes;
create trigger comment_likes_reaction_only before update on public.comment_likes
  for each row execute function public.enforce_comment_reaction_only_update();

-- Askı/paylaşım engeli ve hız sınırı değişiklikte de geçerlidir (docs/history/224-*).
drop trigger if exists comment_likes_reaction_can_post on public.comment_likes;
create trigger comment_likes_reaction_can_post before update of reaction on public.comment_likes
  for each row execute function public.enforce_can_post('all');
drop trigger if exists comment_likes_reaction_rate_limit on public.comment_likes;
create trigger comment_likes_reaction_rate_limit before update of reaction on public.comment_likes
  for each row execute function public.enforce_rate_limit('comment_reaction', '120', '600');

-- Bildirim satırındaki tepki: `notify_comment_like` satırı yazar (aynı `dedupe_key`), bu tetikleyici ilk tepkide doldurur ve tepki DEĞİŞİNCE yerinde
-- günceller (yeni bildirim / okunmadı işareti üretmez) — `sync_like_notification_reaction` kalıbı.
create or replace function public.sync_comment_like_notification_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.notifications
     set reaction = new.reaction
   where dedupe_key = 'comment_like:' || new.comment_id || ':' || new.user_id
     and reaction is distinct from new.reaction;
  return new;
end $$;
revoke all on function public.sync_comment_like_notification_reaction() from public, anon, authenticated;

-- Ad, `comment_likes_after_insert_notify_like`dan SONRA çalışsın diye `zz` (AFTER tetikleyiciler ada göre sıralanır).
drop trigger if exists comment_likes_zz_sync_notification_reaction on public.comment_likes;
create trigger comment_likes_zz_sync_notification_reaction
  after insert or update of reaction on public.comment_likes
  for each row execute function public.sync_comment_like_notification_reaction();
