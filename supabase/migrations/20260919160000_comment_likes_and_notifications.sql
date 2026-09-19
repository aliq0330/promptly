-- Promptly — Yorum sisteminin güçlendirilmesi: sınırsız derinlikte iç içe
-- yanıtlar (bu zaten `prompt_comments.parent_id`'nin kendine referans veren
-- bir sütun olmasıyla Bölüm 18'den beri destekleniyordu — şema tarafında
-- yeni bir şey gerekmiyor), artı her yorum/yanıt seviyesi için bağımsız
-- beğeni, artı yanıt/beğeni bildirimleri.
--
--   1. Yeni `comment_likes` tablosu — `prompt_likes` ile birebir aynı
--      desen (bileşik birincil anahtar, `handle_prompt_like_change`'e
--      benzer bir sayaç trigger'ı), ama gönderi beğenisinden tamamen
--      ayrı: bir yanıtın beğenilmesi ana yorumun/gönderinin beğeni
--      sayısını hiç etkilemiyor.
--   2. `prompt_comments.like_count` — denormalize sayaç kolonu, projenin
--      `prompts.like_count` için zaten kullandığı aynı yaklaşım.
--   3. İki yeni `SECURITY DEFINER` trigger — bir yoruma/yanıta yeni bir
--      yanıt geldiğinde üst mesajın sahibine, bir yorum/yanıt
--      beğenildiğinde onun sahibine gerçek bildirim üretir. Bölüm 19'dan
--      beri `notifications` tablosuna hiçbir client insert politikası
--      yok (bilinçli güvenlik kararı) — bu yüzden gerçek bildirim üretimi
--      yalnızca böyle sunucu tarafı trigger'larla mümkün, tıpkı
--      20260919150000'in istek/yanıt bildirimleri gibi. `comment_reply`
--      ve `like` bildirim tipleri `notifications.type` CHECK kısıtında
--      zaten önceden tanımlıydı (20260919120400), yalnızca hiç
--      tetiklenmiyorlardı.

-- === Yorum beğeni sayacı ===================================================

alter table public.prompt_comments
  add column like_count integer not null default 0;

-- === comment_likes ==========================================================

create table public.comment_likes (
  comment_id uuid not null references public.prompt_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;
create index comment_likes_user_id_idx on public.comment_likes (user_id);

create or replace function public.handle_comment_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.prompt_comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.prompt_comments set like_count = like_count - 1 where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger comment_likes_after_change
  after insert or delete on public.comment_likes
  for each row
  execute function public.handle_comment_like_change();

-- === RLS — prompt_likes ile birebir aynı desen =============================

create policy "Comment likes are publicly readable"
  on public.comment_likes for select
  using (true);

create policy "Authenticated users can like comments for themselves"
  on public.comment_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own comment likes"
  on public.comment_likes for delete
  using (auth.uid() = user_id);

-- === Bildirim — bir yoruma/yanıta yeni bir yanıt geldiğinde ================
-- Hem "ana yoruma yanıt" hem "yanıta yanıt" aynı şekilde ele alınıyor:
-- ikisi de yalnızca `parent_id` dolu bir INSERT — üst mesajın sahibi kim
-- olursa olsun (ana yorum sahibi ya da bir yanıtın sahibi) aynı trigger
-- bildirimi üretiyor.

create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_href text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select author_id into v_parent_author
    from public.prompt_comments where id = new.parent_id;

  if v_parent_author is null or v_parent_author = new.author_id then
    return new; -- üst mesaj bulunamadı ya da kendi yorumuna/yanıtına kendi yanıtı
  end if;

  v_href := case
    when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
    else '/requests/local?id=' || new.request_id
  end;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna bir yanıt geldi.', v_href);

  return new;
end;
$$;

create trigger prompt_comments_after_insert_notify_reply
  after insert on public.prompt_comments
  for each row
  execute function public.notify_comment_reply();

-- === Bildirim — bir yorum/yanıt beğenildiğinde ==============================
-- `comment_likes`'ın birincil anahtarı (comment_id, user_id) aynı
-- kullanıcının aynı yorumu iki kez beğenmesini zaten veritabanı seviyesinde
-- imkansız kılıyor, bu yüzden burada ayrı bir "mükerrer bildirim" koruması
-- gerekmiyor (`request_response_workflow.sql`'in UPDATE tabanlı
-- trigger'larından farklı olarak, bu saf bir INSERT trigger'ı — her satır
-- zaten yeni ve tek seferlik bir beğeniyi temsil ediyor).

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment_author uuid;
  v_prompt_id uuid;
  v_request_id uuid;
  v_href text;
begin
  select author_id, prompt_id, request_id
    into v_comment_author, v_prompt_id, v_request_id
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new; -- yorum bulunamadı ya da kendi yorumunu kendi beğendi
  end if;

  v_href := case
    when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
    else '/requests/local?id=' || v_request_id
  end;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_comment_author, new.user_id, 'like', 'Yorumunu beğendi.', v_href);

  return new;
end;
$$;

create trigger comment_likes_after_insert_notify_like
  after insert on public.comment_likes
  for each row
  execute function public.notify_comment_like();
