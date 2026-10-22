-- Space = gönderi (docs/history/215-*): Space genel akışta gönderi olarak paylaşılır ve topluluklarda duyurulabilir.
--
-- Kullanıcının kararları (215): Space yalnız topluluk için değil, akışta da gönderi olur; "akışta paylaş" AÇIK ONAYDIR (varsayılan kapalı);
-- topluluktaki başvuru gönderisinin beğeni/yorumu BAĞLAMA ÖZEL kalır (184 kuralı; kapalı topluluk sohbeti dışarı sızmasın).
--
--   1) `spaces.shared_at` (akışta paylaşım anı; yalnız `set_space_shared` RPC'si yazar) + korumalı `like_count` / `comment_count`.
--      Herkese açıklıktan çıkan ya da arşivlenen Space akıştan kendiliğinden düşer (`shared_at` boşalır; geri dönünce yeniden paylaşılır).
--   2) `prompt_likes` / `prompt_comments`: yedinci hedef `space_id` (178'deki `community_post_id` ile aynı kalıp). Yazma yalnız akışta
--      paylaşılmış, herkese açık, arşivsiz Space'e (tetikleyici); okuma Space'in kendi RLS'ini (`can_read_space`) izler.
--   3) Sayaç tetikleyicileri, bildirimler (beğeni, yorum, yanıt, yorum beğenisi, @bahsetme), istatistik (`content_engagers`) ve
--      şikâyet (`reports` hedef türü `space`; kaldırma = akıştan çıkar + özel yap, Space silinmez) Space'i tanır.
--   4) `feed_page` (aynı 13 argümanlı imza, `create or replace`) Space'i de döndürür: zaman = `shared_at`, popülerlik = beğeni.
--      Etiket/kategori/araç/tür süzgeci olan çağrılara Space girmez (Space'te bu sinyaller yok); "Sana özel" değişmedi.
--      `space_feed_cards` kartları tek sorguda hydrate eder (INVOKER, RLS).
--   5) Topluluk duyurusu: `community_posts.space_id` (beşinci hedef), `share_to_community` ve `_community_content_info` Space'i bilir.
--      Yalnız herkese açık + arşivsiz Space duyurulur; topluluk paylaşımı hiçbir şeyi otomatik herkese açmaz.
--
-- `drop` içeren satırlar YALNIZCA CHECK kısıtlarının yeni hedefi kapsayacak biçimde yeniden tanımlanmasıdır (kullanıcı onayıyla, 215):
-- `prompt_likes_exactly_one_target`, `prompt_comments_exactly_one_target`, `reports_target_type_check`, `community_posts_type_check`,
-- `community_posts_exactly_one_target`, `community_posts_type_matches_target`. Tablo/sütun/veri silinmez. Önce migration, sonra istemci.

-- ============================================================================
-- 1) spaces: akışta paylaşım + sayaçlar
-- ============================================================================
alter table public.spaces
  add column if not exists shared_at timestamptz,
  add column if not exists like_count integer not null default 0,
  add column if not exists comment_count integer not null default 0;

alter table public.spaces
  add constraint spaces_counts_nonneg check (like_count >= 0 and comment_count >= 0);

create index if not exists spaces_shared_idx on public.spaces (shared_at desc, id desc) where shared_at is not null;
create index if not exists spaces_shared_popular_idx on public.spaces (like_count desc, shared_at desc, id desc) where shared_at is not null;

drop trigger if exists spaces_protect_counters on public.spaces;
create trigger spaces_protect_counters
  before insert or update of like_count, comment_count on public.spaces
  for each row execute function public.protect_counter_columns('like_count', 'comment_count');

-- `shared_at`'i istemci yazamaz (yalnız `set_space_shared`); herkese açıklıktan çıkan / arşivlenen Space akıştan düşer.
-- SECURITY INVOKER: `current_user` ayırt edici (istemci = anon/authenticated; SECURITY DEFINER RPC'ler sahip rolüyle çalışır).
create or replace function public.spaces_guard_shared()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.shared_at is not null and current_user in ('anon', 'authenticated') then
      raise exception 'space_invalid';
    end if;
    return new;
  end if;
  if new.shared_at is distinct from old.shared_at and current_user in ('anon', 'authenticated') then
    raise exception 'space_invalid';
  end if;
  if new.visibility <> 'public' or new.archived_at is not null then
    new.shared_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists spaces_guard_shared on public.spaces;
create trigger spaces_guard_shared
  before insert or update on public.spaces
  for each row execute function public.spaces_guard_shared();

-- Akışta paylaş / kaldır. Yalnız sahip. Paylaşmak için: herkese açık, arşivsiz, en az 3 öğe ve en az 1 görsel (boş Space akışa çıkmaz).
-- Zaten paylaşılmışsa ilk paylaşım anı korunur (sıra değişmez). Kaldırmak beğeni/yorumları silmez; yeniden paylaşınca geri gelir.
create or replace function public.set_space_shared(p_space_id uuid, p_shared boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  s public.spaces;
  v_role text;
  v_items integer;
  v_images integer;
  v_at timestamptz;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  select * into s from public.spaces where id = p_space_id for update;
  if not found or not public.can_read_space(p_space_id) then
    raise exception 'space_not_found';
  end if;
  select m.role into v_role from public.space_members m where m.space_id = p_space_id and m.user_id = v_actor;
  if v_role is distinct from 'owner' then
    raise exception 'space_forbidden';
  end if;

  if not coalesce(p_shared, false) then
    update public.spaces set shared_at = null where id = p_space_id;
    return null;
  end if;

  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'space_forbidden';
  end if;
  if s.archived_at is not null then
    raise exception 'space_archived';
  end if;
  if s.visibility <> 'public' then
    raise exception 'space_not_public';
  end if;
  select count(*), count(*) filter (where i.kind = 'image')
    into v_items, v_images
    from public.space_items i where i.space_id = p_space_id;
  if v_items < 3 or v_images < 1 then
    raise exception 'space_too_empty';
  end if;

  update public.spaces set shared_at = coalesce(shared_at, now()) where id = p_space_id returning shared_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.set_space_shared(uuid, boolean) from public, anon;
grant execute on function public.set_space_shared(uuid, boolean) to authenticated;
revoke all on function public.spaces_guard_shared() from public, anon, authenticated;

-- ============================================================================
-- 2) prompt_likes / prompt_comments: yedinci hedef `space_id`
-- ============================================================================
alter table public.prompt_likes
  add column if not exists space_id uuid references public.spaces (id) on delete cascade;
alter table public.prompt_comments
  add column if not exists space_id uuid references public.spaces (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes add constraint prompt_likes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer
  + (space_id is not null)::integer = 1
);
alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments add constraint prompt_comments_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer
  + (space_id is not null)::integer = 1
);

create unique index if not exists prompt_likes_space_user_uidx
  on public.prompt_likes (space_id, user_id) where space_id is not null;
create index if not exists prompt_likes_space_id_idx
  on public.prompt_likes (space_id) where space_id is not null;
create index if not exists prompt_comments_space_id_idx
  on public.prompt_comments (space_id, created_at) where space_id is not null;

-- Sayaçlar: hedef zinciri AÇIK (son kol sessizce başka tabloya düşmez).
create or replace function public.handle_prompt_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set like_count = like_count + 1 where id = new.prompt_id;
    elsif new.result_id is not null then
      update public.prompt_results set like_count = like_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set like_count = like_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set like_count = like_count + 1 where id = new.preset_id;
    elsif new.community_post_id is not null then
      update public.community_posts set like_count = like_count + 1 where id = new.community_post_id;
    elsif new.space_id is not null then
      update public.spaces set like_count = like_count + 1 where id = new.space_id;
    elsif new.request_id is not null then
      update public.prompt_requests set like_count = like_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set like_count = like_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set like_count = like_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set like_count = like_count - 1 where id = old.preset_id;
    elsif old.community_post_id is not null then
      update public.community_posts set like_count = greatest(like_count - 1, 0) where id = old.community_post_id;
    elsif old.space_id is not null then
      update public.spaces set like_count = greatest(like_count - 1, 0) where id = old.space_id;
    elsif old.request_id is not null then
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.handle_prompt_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set comment_count = comment_count + 1 where id = new.prompt_id;
    elsif new.result_id is not null then
      update public.prompt_results set comment_count = comment_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set comment_count = comment_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set comment_count = comment_count + 1 where id = new.preset_id;
    elsif new.community_post_id is not null then
      update public.community_posts set comment_count = comment_count + 1 where id = new.community_post_id;
    elsif new.space_id is not null then
      update public.spaces set comment_count = comment_count + 1 where id = new.space_id;
    elsif new.request_id is not null then
      update public.prompt_requests set comment_count = comment_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set comment_count = comment_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set comment_count = comment_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set comment_count = comment_count - 1 where id = old.preset_id;
    elsif old.community_post_id is not null then
      update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.community_post_id;
    elsif old.space_id is not null then
      update public.spaces set comment_count = greatest(comment_count - 1, 0) where id = old.space_id;
    elsif old.request_id is not null then
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- Yanıtlı yorumun yumuşak silinmesi, Space (ya da topluluk gönderisi) silinirken FK basamağında devre dışı kalır: aksi hâlde satır
-- sahipsiz geride kalırdı (178'deki kural, Space'e genişledi).
create or replace function public.handle_comment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.community_post_id is not null or old.space_id is not null) and pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.prompt_comments where parent_id = old.id) then
    update public.prompt_comments
      set deleted_at = now(),
          body = ''
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$$;

-- Yazma: yalnız oturumlu; Space akışta paylaşılmış + herkese açık + arşivsiz; sahiple engel yok; yanıt üst yorumla AYNI Space'te.
create or replace function public.enforce_space_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := to_jsonb(new);
  v_space uuid := nullif(v_row ->> 'space_id', '')::uuid;
  v_parent uuid := nullif(v_row ->> 'parent_id', '')::uuid;
  v_parent_space uuid;
  s public.spaces;
begin
  if v_parent is not null then
    select c.space_id into v_parent_space from public.prompt_comments c where c.id = v_parent;
    if v_parent_space is distinct from v_space then
      raise exception 'invalid_parent';
    end if;
  end if;
  if v_space is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  select * into s from public.spaces where id = v_space;
  if not found or s.visibility <> 'public' or s.archived_at is not null or s.shared_at is null then
    raise exception 'space_not_found';
  end if;
  if s.owner_id <> v_actor and public.is_blocked(v_actor, s.owner_id) then
    raise exception 'space_not_found';
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_likes_enforce_space on public.prompt_likes;
create trigger prompt_likes_enforce_space
  before insert on public.prompt_likes
  for each row execute function public.enforce_space_engagement();

drop trigger if exists prompt_comments_enforce_space on public.prompt_comments;
create trigger prompt_comments_enforce_space
  before insert on public.prompt_comments
  for each row execute function public.enforce_space_engagement();

revoke all on function public.enforce_space_engagement() from public, anon, authenticated;

-- Okuma: Space hedefi, Space'in kendi RLS'ini (`can_read_space`) izler (195'teki "hedef okunabiliyorsa" kuralı).
alter policy "Likes are readable wherever their target is readable" on public.prompt_likes
  using (
    user_id = auth.uid()
    or (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_likes.prompt_id))
    or (request_id is not null and exists (select 1 from public.prompt_requests r where r.id = prompt_likes.request_id))
    or (workflow_id is not null and exists (select 1 from public.workflows w where w.id = prompt_likes.workflow_id))
    or (preset_id is not null and exists (select 1 from public.presets s where s.id = prompt_likes.preset_id))
    or (community_post_id is not null and exists (select 1 from public.community_posts c where c.id = prompt_likes.community_post_id))
    or (space_id is not null and exists (select 1 from public.spaces sp where sp.id = prompt_likes.space_id))
  );

alter policy "Comments are readable wherever their target is readable" on public.prompt_comments
  using (
    ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((request_id is not null) and exists (select 1 from public.prompt_requests r where r.id = prompt_comments.request_id))
    or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
    or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and (s.visibility = 'public' or s.community_id is not null)))))
    or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
    or ((space_id is not null) and exists (select 1 from public.spaces sp where sp.id = prompt_comments.space_id))
  );

alter policy "Authenticated users can comment on visible targets" on public.prompt_comments
  with check (
    auth.uid() = author_id
    and (
      ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
      or ((request_id is not null) and exists (select 1 from public.prompt_requests r where r.id = prompt_comments.request_id))
      or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
      or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
      or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and (s.visibility = 'public' or s.community_id is not null)))))
      or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
      or ((space_id is not null) and exists (select 1 from public.spaces sp where sp.id = prompt_comments.space_id))
    )
  );

-- ============================================================================
-- 3) Bildirimler
-- ============================================================================
create or replace function public._space_href(p_space_id uuid, p_highlight text default null)
returns text
language sql
immutable
set search_path = public
as $$
  select '/spaces/local?id=' || p_space_id || case when p_highlight is null then '' else '&hl=' || p_highlight end;
$$;
revoke all on function public._space_href(uuid, text) from public, anon, authenticated;

create or replace function public.notify_space_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.spaces;
begin
  select * into s from public.spaces where id = new.space_id;
  if not found or s.owner_id = new.user_id then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    s.owner_id, new.user_id, 'like',
    'Space''ini beğendi: "' || public.truncate_preview(s.title) || '"',
    public._space_href(s.id),
    'space_like:' || s.id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

create or replace function public.cleanup_space_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where dedupe_key = 'space_like:' || old.space_id || ':' || old.user_id;
  return old;
end;
$$;

drop trigger if exists prompt_likes_after_insert_notify_space on public.prompt_likes;
create trigger prompt_likes_after_insert_notify_space
  after insert on public.prompt_likes
  for each row when (new.space_id is not null) execute function public.notify_space_like();

drop trigger if exists prompt_likes_after_delete_cleanup_space on public.prompt_likes;
create trigger prompt_likes_after_delete_cleanup_space
  after delete on public.prompt_likes
  for each row when (old.space_id is not null) execute function public.cleanup_space_like_notification();

-- Space yorumu → sahibine; yanıt → üst yorumun yazarına (hazır ayar/workflow kalıbı).
create or replace function public.notify_space_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_owner uuid;
  v_href text;
begin
  v_href := public._space_href(new.space_id, 'comment:' || new.id);
  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select owner_id into v_owner from public.spaces where id = new.space_id;
    if v_owner is null or v_owner = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_owner, new.author_id, 'comment', 'Space''ine yorum yaptı: "' || public.truncate_preview(new.body) || '"', v_href);
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_comments_after_insert_notify_space on public.prompt_comments;
create trigger prompt_comments_after_insert_notify_space
  after insert on public.prompt_comments
  for each row when (new.space_id is not null) execute function public.notify_space_comment();

-- Genel yorum bildirimi: Space yorumu kendi fonksiyonuna bırakılır (yoksa "istek" koluna düşüp adressiz bildirim üretirdi).
create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_post_author uuid;
  v_href text;
  v_post public.community_posts;
begin
  if new.workflow_id is not null or new.preset_id is not null or new.space_id is not null then
    return new;
  end if;

  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    if not found then
      return new;
    end if;
    v_href := public._community_post_href(v_post.id, v_post.community_id, 'comment:' || new.id);
  else
    v_href := (case
      when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
      when new.result_id is not null then '/results/local?id=' || new.result_id
      else '/requests/local?id=' || new.request_id
    end) || '&hl=comment:' || new.id;
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    if v_post.id is not null and public._group_member_role(v_post.community_id, v_parent_author) is null then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_parent_author, new.author_id, 'comment_reply',
      'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href
    );
  else
    if new.community_post_id is not null then
      v_post_author := v_post.author_id;
      if public._group_member_role(v_post.community_id, v_post_author) is null then
        return new;
      end if;
    elsif new.prompt_id is not null then
      select author_id into v_post_author from public.prompts where id = new.prompt_id;
    elsif new.result_id is not null then
      select creator_id into v_post_author from public.prompt_results where id = new.result_id;
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      (case
        when new.prompt_id is not null or new.community_post_id is not null then 'Paylaşımına yorum yaptı: "'
        when new.result_id is not null then 'Sonucuna yorum yaptı: "'
        else 'İsteğine yorum yaptı: "'
      end) || public.truncate_preview(new.body) || '"',
      v_href
    );
  end if;

  return new;
end;
$$;

-- Yorum beğenisi → yorum yazarı (Space yorumunun adresi Space sayfası).
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
  v_result_id uuid;
  v_workflow_id uuid;
  v_preset_id uuid;
  v_post_id uuid;
  v_space_id uuid;
  v_community_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, space_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_result_id, v_workflow_id, v_preset_id, v_post_id, v_space_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  if v_post_id is not null then
    select community_id into v_community_id from public.community_posts where id = v_post_id;
    if v_community_id is null or public._group_member_role(v_community_id, v_comment_author) is null then
      return new;
    end if;
    v_href := public._community_post_href(v_post_id, v_community_id, 'comment:' || new.comment_id);
  elsif v_space_id is not null then
    v_href := public._space_href(v_space_id, 'comment:' || new.comment_id);
  else
    v_href := (case
      when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
      when v_result_id is not null then '/results/local?id=' || v_result_id
      when v_workflow_id is not null then '/workflows/local?id=' || v_workflow_id
      when v_preset_id is not null then '/presets/local?id=' || v_preset_id
      else '/requests/local?id=' || v_request_id
    end) || '&hl=comment:' || new.comment_id;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_comment_author, new.user_id, 'like',
    'Yorumunu beğendi: "' || public.truncate_preview(v_body) || '"', v_href,
    'comment_like:' || new.comment_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

-- @bahsetme: Space yorumunda yalnız Space akışta paylaşılmış + herkese açıksa anılan kişiye bildirim gider.
create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
  v_old text[] := '{}'::text[];
  v_href text;
  v_visible boolean;
  v_post_author uuid;
  v_already uuid;
  v_rec record;
  v_post public.community_posts;
  v_public_community boolean := false;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  v_names := public.extract_mentioned_usernames(new.body);
  if coalesce(array_length(v_names, 1), 0) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := public.extract_mentioned_usernames(old.body);
  end if;

  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    v_visible := found;
    v_post_author := v_post.author_id;
    v_public_community := exists (select 1 from public.chat_groups g where g.id = v_post.community_id and g.visibility = 'public');
    v_href := public._community_post_href(v_post.id, v_post.community_id);
  elsif new.space_id is not null then
    select (visibility = 'public' and archived_at is null and shared_at is not null), owner_id
      into v_visible, v_post_author from public.spaces where id = new.space_id;
    v_href := public._space_href(new.space_id);
  elsif new.prompt_id is not null then
    select (status = 'published' and visibility = 'public' and deleted_at is null), author_id
      into v_visible, v_post_author from public.prompts where id = new.prompt_id;
    v_href := '/prompts/local?id=' || new.prompt_id;
  elsif new.result_id is not null then
    select true, creator_id into v_visible, v_post_author from public.prompt_results where id = new.result_id;
    v_href := '/results/local?id=' || new.result_id;
  elsif new.workflow_id is not null then
    select (status = 'published' and visibility = 'public'), creator_id
      into v_visible, v_post_author from public.workflows where id = new.workflow_id;
    v_href := '/workflows/local?id=' || new.workflow_id;
  elsif new.preset_id is not null then
    select (status = 'published' and visibility = 'public'), creator_id
      into v_visible, v_post_author from public.presets where id = new.preset_id;
    v_href := '/presets/local?id=' || new.preset_id;
  else
    select (not is_draft and visibility = 'public' and deleted_at is null), author_id
      into v_visible, v_post_author from public.prompt_requests where id = new.request_id;
    v_href := '/requests/local?id=' || new.request_id;
  end if;

  if not coalesce(v_visible, false) then
    return new;
  end if;
  v_href := v_href || '&hl=comment:' || new.id;

  if new.parent_id is not null then
    select author_id into v_already from public.prompt_comments where id = new.parent_id;
  else
    v_already := v_post_author;
  end if;

  for v_rec in
    select p.id
    from public.profiles p
    where p.username = any (v_names)
      and not (p.username = any (v_old))
      and p.id <> new.author_id
      and p.id is distinct from v_already
      and not public.is_blocked(new.author_id, p.id)
      and (
        new.community_post_id is null
        or v_public_community
        or public._group_member_role(v_post.community_id, p.id) is not null
      )
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    values (
      v_rec.id, new.author_id, 'comment',
      'Seni bir yorumda andı: "' || public.truncate_preview(new.body) || '"',
      v_href,
      'mention:comment:' || new.id || ':' || v_rec.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$$;

-- Space silinince ona giden bildirimler de gider.
create or replace function public.cleanup_space_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/spaces/local?id=' || old.id || '%';
  return old;
end;
$$;

drop trigger if exists spaces_cleanup_notifications on public.spaces;
create trigger spaces_cleanup_notifications
  before delete on public.spaces
  for each row execute function public.cleanup_space_notifications();

revoke all on function public.notify_space_like() from public, anon, authenticated;
revoke all on function public.cleanup_space_like_notification() from public, anon, authenticated;
revoke all on function public.notify_space_comment() from public, anon, authenticated;
revoke all on function public.cleanup_space_notifications() from public, anon, authenticated;

-- ============================================================================
-- 4) İstatistik (Beğenenler / Yorum yapanlar)
-- ============================================================================
create or replace function public._engager_content_visible(p_content_type text, p_content_id uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and ((p.community_id is null and p.status = 'published' and p.visibility = 'public')
             or p.author_id = auth.uid()
             or (p.community_id is not null and p.status = 'published' and public.can_read_community(p.community_id))))
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and ((r.community_id is null and not r.is_draft and r.visibility = 'public')
             or r.author_id = auth.uid()
             or (r.community_id is not null and not r.is_draft and public.can_read_community(r.community_id))))
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid()
             or (w.community_id is null and w.status = 'published' and w.visibility = 'public')
             or (w.community_id is not null and w.status = 'published' and public.can_read_community(w.community_id))))
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id
        and (s.creator_id = auth.uid()
             or (s.community_id is null and s.status = 'published' and s.visibility = 'public')
             or (s.community_id is not null and s.status = 'published' and public.can_read_community(s.community_id))))
    when 'community_post' then exists (
      select 1 from public.community_posts cp
      where cp.id = p_content_id and public.can_read_community(cp.community_id))
    when 'space' then public.can_read_space(p_content_id)
    else false
  end;
$$;

create or replace function public.content_engagers(p_content_type text, p_content_id uuid, p_kind text, p_limit integer default 20, p_before_at timestamp with time zone default null, p_before_actor uuid default null)
 returns table(actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, actor_follower_count integer, interacted_at timestamp with time zone, comment_id uuid, comment_body text)
 language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_col text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_kind not in ('likes', 'comments', 'saves') then
    raise exception 'invalid kind';
  end if;

  v_col := case p_content_type
    when 'prompt' then 'prompt_id'
    when 'request' then 'request_id'
    when 'workflow' then 'workflow_id'
    when 'preset' then 'preset_id'
    when 'community_post' then 'community_post_id'
    when 'space' then 'space_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  -- İstek ve Space kaydedilemez (koleksiyon hedefi değiller).
  if p_kind = 'saves' and p_content_type in ('request', 'space') then
    return;
  end if;

  if p_kind = 'likes' then
    return query execute format($q$
      select l.user_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             l.created_at, null::uuid, null::text
      from public.prompt_likes l
      left join public.profiles p on p.id = l.user_id
      where l.%I = $1
        and ($2 is null or (l.created_at, l.user_id) < ($2, $3))
      order by l.created_at desc, l.user_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  elsif p_kind = 'comments' then
    return query execute format($q$
      select x.author_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             x.created_at, x.id, x.body
      from (
        select distinct on (c.author_id) c.author_id, c.created_at, c.id, c.body
        from public.prompt_comments c
        where c.%I = $1 and c.deleted_at is null
        order by c.author_id, c.created_at desc, c.id desc
      ) x
      left join public.profiles p on p.id = x.author_id
      where ($2 is null or (x.created_at, x.author_id) < ($2, $3))
      order by x.created_at desc, x.author_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  else
    return query execute format($q$
      select s.owner_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             s.saved_at, null::uuid, null::text
      from (
        select c.owner_id, max(ci.created_at) as saved_at
        from public.collection_items ci
        join public.collections c on c.id = ci.collection_id
        where ci.%I = $1
        group by c.owner_id
      ) s
      left join public.profiles p on p.id = s.owner_id
      where ($2 is null or (s.saved_at, s.owner_id) < ($2, $3))
      order by s.saved_at desc, s.owner_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;
  end if;
end;
$function$;

-- ============================================================================
-- 5) Şikâyet: hedef türü `space` (kaldırma = akıştan çıkar + özel yap; Space ve içindekiler silinmez)
-- ============================================================================
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('prompt', 'comment', 'request', 'user', 'message', 'workflow', 'preset', 'story', 'space'));

create or replace function public.moderate_report(p_report_id uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  if p_action not in ('dismissed', 'reviewed', 'removed') then raise exception 'Geçersiz işlem.'; end if;
  select * into r from public.reports where id = p_report_id;
  if not found then raise exception 'Şikâyet bulunamadı.'; end if;
  if p_action = 'removed' then
    if r.target_type = 'prompt' then delete from public.prompts where id = r.target_id;
    elsif r.target_type = 'request' then delete from public.prompt_requests where id = r.target_id;
    elsif r.target_type = 'workflow' then delete from public.workflows where id = r.target_id;
    elsif r.target_type = 'preset' then delete from public.presets where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    elsif r.target_type = 'story' then
      update public.stories set moderation_status = 'removed', moderated_at = now(), moderated_by = auth.uid()
        where id = r.target_id;
    elsif r.target_type = 'space' then
      update public.spaces set visibility = 'private', shared_at = null where id = r.target_id;
    else raise exception 'Bu hedef türü kaldırılamaz.';
    end if;
  end if;
  update public.reports
    set status = case when p_action = 'dismissed' then 'dismissed' else 'reviewed' end,
        reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_report_id;
  if p_action = 'removed' then
    update public.reports set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
      resolution_note = coalesce(resolution_note, 'İçerik kaldırıldı.')
      where target_type = r.target_type and target_id = r.target_id and status = 'open';
  end if;
end $function$;

create or replace function public.moderation_report_queue(p_status text default 'open')
 returns table(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join lateral (
    select true as exists_, p.title as title, p.author_id as author_id, '/prompts/local?id=' || p.id as href
      from public.prompts p where r.target_type = 'prompt' and p.id = r.target_id
    union all
    select true, q.title, q.author_id, '/requests/local?id=' || q.id
      from public.prompt_requests q where r.target_type = 'request' and q.id = r.target_id
    union all
    select true, w.title, w.creator_id, '/workflows/local?id=' || w.id
      from public.workflows w where r.target_type = 'workflow' and w.id = r.target_id
    union all
    select true, s.title, s.creator_id, '/presets/local?id=' || s.id
      from public.presets s where r.target_type = 'preset' and s.id = r.target_id
    union all
    select true, left(c.body, 300), c.author_id, null::text
      from public.prompt_comments c where r.target_type = 'comment' and c.id = r.target_id
    union all
    select true, left(coalesce(m.body, ''), 300), m.sender_id, null::text
      from public.messages m where r.target_type = 'message' and m.id = r.target_id
    union all
    select true, u.display_name, u.id, '/profile/real?username=' || u.username
      from public.profiles u where r.target_type = 'user' and u.id = r.target_id
    union all
    select true, left(coalesce(st.layout -> 'layers' -> 0 ->> 'text', st.sticker_question, st.kind), 300), st.author_id, '/stories?id=' || st.id
      from public.stories st where r.target_type = 'story' and st.id = r.target_id
    union all
    select true, sp.title, sp.owner_id, '/spaces/local?id=' || sp.id
      from public.spaces sp where r.target_type = 'space' and sp.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $function$;

-- ============================================================================
-- 6) Akış: `feed_page` Space'i de döndürür (aynı 13 argümanlı imza; sarmalayıcılar bu biçimi çağırır)
-- ============================================================================
create or replace function public.feed_page(
  p_scope text,
  p_order text,
  p_kinds text[],
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_limit integer,
  p_after_rank bigint,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_open_only boolean,
  p_tag text,
  p_tool text
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
           (p_order = 'used') as used,
           (p_scope = 'following') as following,
           (p_scope = 'tags') as tagged
  ),
  followed as (
    select f.following_id as author_id
    from public.follows f
    where f.follower_id = auth.uid()
  ),
  followed_tags as (
    select t.tag_slug
    from public.tag_follows t
    where t.user_id = auth.uid()
  ),
  prompt_part as (
    select 'prompt'::text as kind, x.id, x.created_at,
           (case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where not x.is_draft and x.visibility = 'public' and x.deleted_at is null
      and (p_kinds is null or 'request' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (not coalesce(p_open_only, false) or x.status = 'open')
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'workflow' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or p_content_type = any (x.content_types))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.presets x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'preset' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  -- Space: akışta paylaşılmış (`shared_at`) + herkese açık + arşivsiz. Okuma RLS'i (`can_read_space`: engel iki yönlü) ayrıca uygulanır.
  -- Space'in etiketi/kategorisi/aracı/içerik türü yoktur: bu süzgeçlerden biri verilmişse ya da kapsam "etiketlerim"se Space girmez.
  space_part as (
    select 'space'::text as kind, x.id, x.shared_at as created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.spaces x, params pr
    where x.shared_at is not null and x.visibility = 'public' and x.archived_at is null
      and (p_kinds is null or 'space' = any (p_kinds))
      and not pr.tagged
      and (not pr.following or x.owner_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.shared_at end asc, case when pr.oldest then x.id end asc,
             x.shared_at desc, x.id desc
    limit (select lim from params)
  )
  select u.kind, u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
    union all select * from space_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.oldest then u.created_at end asc, case when pr.oldest then u.id end asc,
           u.created_at desc, u.id desc
  limit (select lim from params);
$$;

-- Akış kartı: `list_spaces` satırı + akış alanları + ilk paletin renkleri. INVOKER: okunamayan Space satırı hiç dönmez.
create or replace function public.space_feed_cards(p_ids uuid[])
returns table (
  id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text,
  title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[],
  image_count integer, prompt_count integer, note_count integer, member_count integer,
  my_role text, is_favorite boolean, last_opened_at timestamptz,
  created_at timestamptz, updated_at timestamptz, archived_at timestamptz,
  shared_at timestamptz, like_count integer, comment_count integer, palette_colors text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url,
         s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         case when m.role is not null then (select count(*)::integer from public.space_members c where c.space_id = s.id) end,
         m.role, coalesce(us.favorite, false), us.last_opened_at,
         s.created_at, s.updated_at, s.archived_at,
         s.shared_at, s.like_count, s.comment_count,
         (select p.colors from public.space_palettes p where p.space_id = s.id and cardinality(p.colors) > 0 order by p.position, p.created_at limit 1)
    from public.spaces s
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where s.id = any (coalesce(p_ids, '{}'::uuid[]))
   limit 100;
$$;

revoke execute on function public.space_feed_cards(uuid[]) from public;
grant execute on function public.space_feed_cards(uuid[]) to anon, authenticated;

-- ============================================================================
-- 7) Topluluk duyurusu: `community_posts.space_id` (beşinci hedef)
-- ============================================================================
alter table public.community_posts
  add column if not exists space_id uuid references public.spaces (id) on delete cascade;

alter table public.community_posts drop constraint community_posts_type_check;
alter table public.community_posts add constraint community_posts_type_check
  check (content_type in ('prompt', 'request', 'workflow', 'preset', 'space'));
alter table public.community_posts drop constraint community_posts_exactly_one_target;
alter table public.community_posts add constraint community_posts_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer
  + (preset_id is not null)::integer + (space_id is not null)::integer = 1
);
alter table public.community_posts drop constraint community_posts_type_matches_target;
alter table public.community_posts add constraint community_posts_type_matches_target check (
  (content_type = 'prompt' and prompt_id is not null)
  or (content_type = 'request' and request_id is not null)
  or (content_type = 'workflow' and workflow_id is not null)
  or (content_type = 'preset' and preset_id is not null)
  or (content_type = 'space' and space_id is not null)
);
-- Bir Space bir toplulukta yalnız BİR kez duyurulur; Space yalnız başvuru olabilir (topluluğa özgü Space yok).
create unique index if not exists community_posts_space_uidx on public.community_posts (community_id, space_id) where space_id is not null;
alter table public.community_posts add constraint community_posts_space_application check (space_id is null or kind = 'application');

create or replace function public._community_content_info(p_type text, p_id uuid)
returns table (owner_id uuid, shareable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'prompt' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public' and x.deleted_at is null) from public.prompts x where x.id = p_id;
  elsif p_type = 'request' then
    return query select x.author_id, (not x.is_draft and x.visibility = 'public' and x.deleted_at is null) from public.prompt_requests x where x.id = p_id;
  elsif p_type = 'workflow' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public') from public.workflows x where x.id = p_id;
  elsif p_type = 'preset' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public') from public.presets x where x.id = p_id;
  elsif p_type = 'space' then
    return query select x.owner_id, (x.visibility = 'public' and x.archived_at is null) from public.spaces x where x.id = p_id;
  end if;
end;
$$;

create or replace function public.share_to_community(p_group_id uuid, p_content_type text, p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_role text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
begin
  g := public._group_lock(p_group_id);
  v_role := public._group_member_role(p_group_id, v_actor);
  if v_role is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset', 'space') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._community_content_info(p_content_type, p_content_id);
  if not found then
    raise exception 'content_not_found';
  end if;
  if not v_info.shareable then
    -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
    if v_info.owner_id is distinct from v_actor then
      raise exception 'content_not_found';
    end if;
    raise exception 'content_not_public';
  end if;
  if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.community_posts where community_id = p_group_id and author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'post_rate_limit';
  end if;

  begin
    insert into public.community_posts (id, community_id, author_id, kind, content_type, prompt_id, request_id, workflow_id, preset_id, space_id, note)
    values (
      v_id, p_group_id, v_actor, 'application', p_content_type,
      case when p_content_type = 'prompt' then p_content_id end,
      case when p_content_type = 'request' then p_content_id end,
      case when p_content_type = 'workflow' then p_content_id end,
      case when p_content_type = 'preset' then p_content_id end,
      case when p_content_type = 'space' then p_content_id end,
      v_note
    );
  exception when unique_violation then
    raise exception 'already_shared';
  end;
  return v_id;
end;
$$;

-- Gönderi beğenisi bildirimi: başlık Space adı da olabilir.
create or replace function public.notify_community_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.community_posts;
  v_title text;
begin
  select * into v_post from public.community_posts where id = new.community_post_id;
  if not found or v_post.author_id = new.user_id or public._group_member_role(v_post.community_id, v_post.author_id) is null then
    return new;
  end if;
  select coalesce(
    case v_post.content_type
      when 'prompt' then (select title from public.prompts where id = v_post.prompt_id)
      when 'request' then (select title from public.prompt_requests where id = v_post.request_id)
      when 'workflow' then (select title from public.workflows where id = v_post.workflow_id)
      when 'preset' then (select title from public.presets where id = v_post.preset_id)
      when 'space' then (select title from public.spaces where id = v_post.space_id)
    end, '') into v_title;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_post.author_id, new.user_id, 'like',
    'Paylaşımını beğendi: "' || public.truncate_preview(v_title) || '"',
    public._community_post_href(v_post.id, v_post.community_id, 'post:' || v_post.id),
    'cpost_like:' || v_post.id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
