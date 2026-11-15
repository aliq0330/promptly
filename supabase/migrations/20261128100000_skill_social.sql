-- ci:allow-destructive
-- Skill sosyal katmanı, Aşama 3 dilimi A (docs/history/390-*): beğeni/tepki + yorum + yorum sabitleme + bildirim + istatistik + şikâyet.
--
-- Skill, ortak etkileşim tablolarına DOKUZUNCU hedef olarak girer: `prompt_likes.skill_id` ve `prompt_comments.skill_id` (178'deki `community_post_id`, 215'teki
-- `space_id`, 217'deki `quote_id` ile aynı kalıp). Hedef zinciri AÇIK yazılır (son `else` sessizce başka tabloya düşmesin).
--
-- `-- ci:allow-destructive` işareti YALNIZCA şu yeniden kurulumlar içindir; hiçbir veri silinmez:
--   • `prompt_likes.target_id` ÜRETİLMİŞ bir sütundur (hedef sütunlarının `coalesce`'ı); PostgreSQL 16'da ifadesi değiştirilemez, bu yüzden sütun düşürülüp
--     yeniden eklenir (değer satırdan türetilir, kayıp yok; bağlı iki dizin ve `reaction_stats` okuma politikası da yeniden kurulur).
--   • `prompt_likes_exactly_one_target`, `prompt_comments_exactly_one_target`, `reports_target_type_check` CHECK kısıtları yeni hedefi kapsayacak biçimde.
-- Kullanıcı bu kapsamı onayladı (Aşama 3'ü isterken planda "CHECK yeniden kurulumu yıkıcıdır, onay ister" yazılıydı).
--
-- Bu dilimde YOK (docs/yapilacaklar.md): kaydet/koleksiyon (`collection_items.skill_id`), Yaratıcı paneli, Paylaş modalı, yayın/sürüm bildirimleri.

-- ============================================================================
-- 1) Sütunlar, kısıtlar, dizinler
-- ============================================================================
alter table public.prompt_likes add column if not exists skill_id uuid references public.skills (id) on delete cascade;
alter table public.prompt_comments add column if not exists skill_id uuid references public.skills (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes add constraint prompt_likes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer
  + (space_id is not null)::integer + (quote_id is not null)::integer + (skill_id is not null)::integer = 1
);
alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments add constraint prompt_comments_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer
  + (space_id is not null)::integer + (quote_id is not null)::integer + (skill_id is not null)::integer = 1
);

-- target_id: dokuz hedef sütununun birleşimi (tepki sayıları `reaction_stats` bu kimliğe göre tutulur).
drop policy if exists "Reaction counts are readable wherever the target's likes are" on public.reaction_stats;
alter table public.prompt_likes drop column target_id;
alter table public.prompt_likes add column target_id uuid generated always as (
  coalesce(prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, space_id, quote_id, skill_id)
) stored;
create index prompt_likes_target_recent_idx on public.prompt_likes (target_id, created_at desc, id desc);
create index prompt_likes_target_reaction_recent_idx on public.prompt_likes (target_id, reaction, created_at desc, id desc);
create policy "Reaction counts are readable wherever the target's likes are"
  on public.reaction_stats for select
  using (exists (select 1 from public.prompt_likes pl where pl.target_id = reaction_stats.target_id));

create unique index if not exists prompt_likes_skill_user_uidx on public.prompt_likes (skill_id, user_id) where skill_id is not null;
create index if not exists prompt_likes_skill_id_idx on public.prompt_likes (skill_id) where skill_id is not null;
create index if not exists prompt_comments_skill_id_idx on public.prompt_comments (skill_id, created_at) where skill_id is not null;

-- ============================================================================
-- 2) Okuma/yazma politikaları: Skill hedefi, Skill'in kendi RLS'ini izler (yayında + herkese açık, sahibi kendi taslağını görür, engel iki yönlü)
-- ============================================================================
alter policy "Likes are readable wherever their target is readable" on public.prompt_likes
  using (
    user_id = (select auth.uid())
    or (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_likes.prompt_id))
    or (request_id is not null and exists (select 1 from public.prompt_requests r where r.id = prompt_likes.request_id))
    or (workflow_id is not null and exists (select 1 from public.workflows w where w.id = prompt_likes.workflow_id))
    or (preset_id is not null and exists (select 1 from public.presets s where s.id = prompt_likes.preset_id))
    or (community_post_id is not null and exists (select 1 from public.community_posts c where c.id = prompt_likes.community_post_id))
    or (space_id is not null and exists (select 1 from public.spaces sp where sp.id = prompt_likes.space_id))
    or (quote_id is not null and exists (select 1 from public.content_quotes cq where cq.id = prompt_likes.quote_id))
    or (skill_id is not null and exists (select 1 from public.skills sk where sk.id = prompt_likes.skill_id))
  );


alter policy "Comments are readable wherever their target is readable" on public.prompt_comments
  using ((((prompt_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM prompts p
  WHERE ((p.id = prompt_comments.prompt_id) AND ((p.status = 'published'::text) OR (p.author_id = ( SELECT auth.uid() AS uid))))))) OR ((request_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM prompt_requests r
  WHERE (r.id = prompt_comments.request_id)))) OR ((result_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (prompt_results r
     JOIN prompts p ON ((p.id = r.prompt_id)))
  WHERE ((r.id = prompt_comments.result_id) AND ((p.status = 'published'::text) OR (p.author_id = ( SELECT auth.uid() AS uid))))))) OR ((workflow_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM workflows w
  WHERE ((w.id = prompt_comments.workflow_id) AND ((w.status = 'published'::text) OR (w.creator_id = ( SELECT auth.uid() AS uid))))))) OR ((preset_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM presets s
  WHERE ((s.id = prompt_comments.preset_id) AND ((s.creator_id = ( SELECT auth.uid() AS uid)) OR ((s.status = 'published'::text) AND ((s.visibility = 'public'::text) OR (s.community_id IS NOT NULL)))))))) OR ((community_post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM community_posts cp
  WHERE (cp.id = prompt_comments.community_post_id)))) OR ((space_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM spaces sp
  WHERE (sp.id = prompt_comments.space_id))) AND ((space_activity_id IS NULL) OR (EXISTS ( SELECT 1
   FROM space_activity a
  WHERE (a.id = prompt_comments.space_activity_id))))) OR ((quote_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM content_quotes cq
  WHERE (cq.id = prompt_comments.quote_id)))) OR ((skill_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM skills sk WHERE (sk.id = prompt_comments.skill_id))))));

alter policy "Authenticated users can comment on visible targets" on public.prompt_comments
  with check (((( SELECT auth.uid() AS uid) = author_id) AND (((prompt_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM prompts p
  WHERE ((p.id = prompt_comments.prompt_id) AND ((p.status = 'published'::text) OR (p.author_id = ( SELECT auth.uid() AS uid))))))) OR ((request_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM prompt_requests r
  WHERE (r.id = prompt_comments.request_id)))) OR ((result_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (prompt_results r
     JOIN prompts p ON ((p.id = r.prompt_id)))
  WHERE ((r.id = prompt_comments.result_id) AND ((p.status = 'published'::text) OR (p.author_id = ( SELECT auth.uid() AS uid))))))) OR ((workflow_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM workflows w
  WHERE ((w.id = prompt_comments.workflow_id) AND ((w.status = 'published'::text) OR (w.creator_id = ( SELECT auth.uid() AS uid))))))) OR ((preset_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM presets s
  WHERE ((s.id = prompt_comments.preset_id) AND ((s.creator_id = ( SELECT auth.uid() AS uid)) OR ((s.status = 'published'::text) AND ((s.visibility = 'public'::text) OR (s.community_id IS NOT NULL)))))))) OR ((community_post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM community_posts cp
  WHERE (cp.id = prompt_comments.community_post_id)))) OR ((space_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM spaces sp
  WHERE (sp.id = prompt_comments.space_id))) AND ((space_activity_id IS NULL) OR (EXISTS ( SELECT 1
   FROM space_activity a
  WHERE (a.id = prompt_comments.space_activity_id))))) OR ((quote_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM content_quotes cq
  WHERE (cq.id = prompt_comments.quote_id)))) OR ((skill_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM skills sk WHERE (sk.id = prompt_comments.skill_id)))))));

-- ============================================================================
-- 3) Sayaç tetikleyicileri + yumuşak silme: hedef zinciri AÇIK
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_prompt_like_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    elsif new.quote_id is not null then
      update public.content_quotes set like_count = like_count + 1 where id = new.quote_id;
    elsif new.skill_id is not null then
      update public.skills set like_count = like_count + 1 where id = new.skill_id;
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
    elsif old.quote_id is not null then
      update public.content_quotes set like_count = greatest(like_count - 1, 0) where id = old.quote_id;
    elsif old.skill_id is not null then
      update public.skills set like_count = greatest(like_count - 1, 0) where id = old.skill_id;
    elsif old.request_id is not null then
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_prompt_comment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      if new.space_activity_id is not null then
        update public.space_activity set comment_count = comment_count + 1 where id = new.space_activity_id;
      else
        update public.spaces set comment_count = comment_count + 1 where id = new.space_id;
      end if;
    elsif new.quote_id is not null then
      update public.content_quotes set comment_count = comment_count + 1 where id = new.quote_id;
    elsif new.skill_id is not null then
      update public.skills set comment_count = comment_count + 1 where id = new.skill_id;
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
      if old.space_activity_id is not null then
        update public.space_activity set comment_count = greatest(comment_count - 1, 0) where id = old.space_activity_id;
      else
        update public.spaces set comment_count = greatest(comment_count - 1, 0) where id = old.space_id;
      end if;
    elsif old.quote_id is not null then
      update public.content_quotes set comment_count = greatest(comment_count - 1, 0) where id = old.quote_id;
    elsif old.skill_id is not null then
      update public.skills set comment_count = greatest(comment_count - 1, 0) where id = old.skill_id;
    elsif old.request_id is not null then
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_comment_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (old.community_post_id is not null or old.space_id is not null or old.quote_id is not null or old.skill_id is not null) and pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.prompt_comments where parent_id = old.id) then
    update public.prompt_comments
      set deleted_at = now(),
          body = '',
          rating = null,
          media_kind = null,
          media_ref = null,
          media_width = null,
          media_height = null,
          attach_type = null,
          attach_id = null
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$function$;


-- ============================================================================
-- 4) Etkileşim kuralları: kendi Skill'ini beğenemezsin, engel iki yönlü, yalnız okunabilir Skill'e etkileşim
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_like_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  if new.prompt_id is not null then
    select author_id into v_owner from public.prompts where id = new.prompt_id;
  elsif new.request_id is not null then
    select author_id into v_owner from public.prompt_requests where id = new.request_id;
  elsif new.workflow_id is not null then
    select creator_id into v_owner from public.workflows where id = new.workflow_id;
  elsif new.preset_id is not null then
    select creator_id into v_owner from public.presets where id = new.preset_id;
  elsif new.community_post_id is not null then
    select author_id into v_owner from public.community_posts where id = new.community_post_id;
  elsif new.space_id is not null then
    select owner_id into v_owner from public.spaces where id = new.space_id;
  elsif new.quote_id is not null then
    select author_id into v_owner from public.content_quotes where id = new.quote_id;
  elsif new.skill_id is not null then
    select author_id into v_owner from public.skills where id = new.skill_id;
  end if;
  if v_owner is not null and v_owner = new.user_id then
    raise exception 'self_like_not_allowed';
  end if;
  if v_owner is not null and auth.uid() is not null and public.is_blocked(new.user_id, v_owner) then
    raise exception 'interaction_blocked';
  end if;
  return new;
end $function$;


-- Yazma: yalnız oturumlu; Skill yayında + herkese açık (ya da sahibi kendi Skill'inde); engel iki yönlü; yanıt üst yorumla AYNI Skill'de.
create or replace function public.enforce_skill_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := to_jsonb(new);
  v_skill uuid := nullif(v_row ->> 'skill_id', '')::uuid;
  v_parent uuid := nullif(v_row ->> 'parent_id', '')::uuid;
  v_parent_skill uuid;
  k public.skills;
begin
  if v_parent is not null then
    select c.skill_id into v_parent_skill from public.prompt_comments c where c.id = v_parent;
    if v_parent_skill is distinct from v_skill then
      raise exception 'invalid_parent';
    end if;
  end if;
  if v_skill is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  select * into k from public.skills where id = v_skill;
  if not found then
    raise exception 'skill_not_found';
  end if;
  if k.author_id <> v_actor then
    if k.status <> 'published' or k.visibility <> 'public' or public.is_blocked(v_actor, k.author_id) then
      raise exception 'skill_not_found';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_likes_enforce_skill on public.prompt_likes;
create trigger prompt_likes_enforce_skill before insert on public.prompt_likes
  for each row execute function public.enforce_skill_engagement();
drop trigger if exists prompt_comments_enforce_skill on public.prompt_comments;
create trigger prompt_comments_enforce_skill before insert on public.prompt_comments
  for each row execute function public.enforce_skill_engagement();
revoke all on function public.enforce_skill_engagement() from public, anon, authenticated;

-- ============================================================================
-- 5) Bildirimler (mevcut `like` / `comment` / `comment_reply` türleri; yeni tür yok)
-- ============================================================================
create or replace function public.notify_skill_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if new.skill_id is null then
    return new;
  end if;
  select author_id, title into v_owner, v_title from public.skills where id = new.skill_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_owner, new.user_id, 'like',
    'Skill''ini beğendi: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/skills/local?id=' || new.skill_id,
    'skill_like:' || new.skill_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
drop trigger if exists prompt_likes_after_insert_notify_skill on public.prompt_likes;
create trigger prompt_likes_after_insert_notify_skill after insert on public.prompt_likes
  for each row execute function public.notify_skill_like();
revoke all on function public.notify_skill_like() from public, anon, authenticated;

create or replace function public.cleanup_skill_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.skill_id is not null then
    delete from public.notifications where dedupe_key = 'skill_like:' || old.skill_id || ':' || old.user_id;
  end if;
  return old;
end;
$$;
drop trigger if exists prompt_likes_after_delete_cleanup_skill on public.prompt_likes;
create trigger prompt_likes_after_delete_cleanup_skill after delete on public.prompt_likes
  for each row execute function public.cleanup_skill_like_notification();
revoke all on function public.cleanup_skill_like_notification() from public, anon, authenticated;

create or replace function public.notify_skill_comment()
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
  if new.skill_id is null then
    return new;
  end if;
  v_href := '/skills/local?id=' || new.skill_id || '&hl=comment:' || new.id;
  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select author_id into v_owner from public.skills where id = new.skill_id;
    if v_owner is null or v_owner = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_owner, new.author_id, 'comment', 'Skill''ine yorum yaptı: "' || public.truncate_preview(new.body) || '"', v_href);
  end if;
  return new;
end;
$$;
drop trigger if exists prompt_comments_after_insert_notify_skill on public.prompt_comments;
create trigger prompt_comments_after_insert_notify_skill after insert on public.prompt_comments
  for each row execute function public.notify_skill_comment();
revoke all on function public.notify_skill_comment() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_comment_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_parent_author uuid;
  v_post_author uuid;
  v_href text;
  v_post public.community_posts;
begin
  if new.workflow_id is not null or new.preset_id is not null or new.space_id is not null or new.quote_id is not null or new.skill_id is not null then
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_comment_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comment_author uuid;
  v_prompt_id uuid;
  v_request_id uuid;
  v_result_id uuid;
  v_workflow_id uuid;
  v_preset_id uuid;
  v_post_id uuid;
  v_space_id uuid;
  v_quote_id uuid;
  v_skill_id uuid;
  v_community_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, space_id, quote_id, skill_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_result_id, v_workflow_id, v_preset_id, v_post_id, v_space_id, v_quote_id, v_skill_id, v_body
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
  elsif v_quote_id is not null then
    v_href := public._quote_href(v_quote_id, 'comment:' || new.comment_id);
  else
    v_href := (case
      when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
      when v_result_id is not null then '/results/local?id=' || v_result_id
      when v_workflow_id is not null then '/workflows/local?id=' || v_workflow_id
      when v_preset_id is not null then '/presets/local?id=' || v_preset_id
      when v_skill_id is not null then '/skills/local?id=' || v_skill_id
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_comment_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif new.quote_id is not null then
    select public.quote_target_ok(q.content_type, q.target_id), q.author_id
      into v_visible, v_post_author from public.content_quotes q where q.id = new.quote_id;
    v_href := public._quote_href(new.quote_id);
  elsif new.skill_id is not null then
    select (status = 'published' and visibility = 'public'), author_id
      into v_visible, v_post_author from public.skills where id = new.skill_id;
    v_href := '/skills/local?id=' || new.skill_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.set_comment_pinned(p_comment_id uuid, p_pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  c public.prompt_comments%rowtype;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into c from public.prompt_comments where id = p_comment_id for update;
  if not found then raise exception 'comment_not_found'; end if;

  if c.prompt_id is not null then
    select author_id into v_owner from public.prompts where id = c.prompt_id;
  elsif c.request_id is not null then
    select author_id into v_owner from public.prompt_requests where id = c.request_id;
  elsif c.workflow_id is not null then
    select creator_id into v_owner from public.workflows where id = c.workflow_id;
  elsif c.preset_id is not null then
    select creator_id into v_owner from public.presets where id = c.preset_id;
  elsif c.skill_id is not null then
    select author_id into v_owner from public.skills where id = c.skill_id;
  end if;
  if v_owner is null or v_owner <> v_uid then raise exception 'pin_not_allowed'; end if;

  if p_pinned then
    if c.parent_id is not null then raise exception 'pin_top_level_only'; end if;
    if c.deleted_at is not null then raise exception 'comment_deleted'; end if;
  end if;

  perform set_config('promptly.comment_pin', 'on', true);
  if p_pinned then
    update public.prompt_comments set pinned_at = null
    where pinned_at is not null and id <> c.id
      and prompt_id is not distinct from c.prompt_id and request_id is not distinct from c.request_id
      and workflow_id is not distinct from c.workflow_id and preset_id is not distinct from c.preset_id
      and skill_id is not distinct from c.skill_id;
    update public.prompt_comments set pinned_at = now() where id = c.id;
  else
    update public.prompt_comments set pinned_at = null where id = c.id and pinned_at is not null;
  end if;
  perform set_config('promptly.comment_pin', 'off', true);
end;
$function$;


-- ============================================================================
-- 6) İstatistik (kim beğendi / yorum yaptı) — Skill'de kaydetme henüz yok
-- ============================================================================

CREATE OR REPLACE FUNCTION public._engager_content_visible(p_content_type text, p_content_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and ((p.community_id is null and p.team_file_id is null and p.status = 'published' and p.visibility = 'public')
             or p.author_id = auth.uid()
             or (p.community_id is not null and p.status = 'published' and public.can_read_community(p.community_id))))
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and ((r.community_id is null and r.team_file_id is null and not r.is_draft and r.visibility = 'public')
             or r.author_id = auth.uid()
             or (r.community_id is not null and not r.is_draft and public.can_read_community(r.community_id))))
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid()
             or (w.community_id is null and w.team_file_id is null and w.status = 'published' and w.visibility = 'public')
             or (w.community_id is not null and w.status = 'published' and public.can_read_community(w.community_id))))
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id
        and (s.creator_id = auth.uid()
             or (s.community_id is null and s.team_file_id is null and s.status = 'published' and s.visibility = 'public')
             or (s.community_id is not null and s.status = 'published' and public.can_read_community(s.community_id))))
    when 'community_post' then exists (
      select 1 from public.community_posts cp
      where cp.id = p_content_id and public.can_read_community(cp.community_id))
    when 'space' then public.can_read_space(p_content_id)
    when 'quote' then exists (
      select 1 from public.content_quotes q
      where q.id = p_content_id and public.quote_target_ok(q.content_type, q.target_id)
        and not public.is_blocked(auth.uid(), q.author_id))
    when 'skill' then exists (
      select 1 from public.skills k
      where k.id = p_content_id
        and (k.author_id = auth.uid()
             or (k.status = 'published' and k.visibility = 'public' and not public.is_blocked(auth.uid(), k.author_id))))
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION public.content_engagers(p_content_type text, p_content_id uuid, p_kind text, p_limit integer DEFAULT 20, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_actor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, actor_follower_count integer, interacted_at timestamp with time zone, comment_id uuid, comment_body text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'quote' then 'quote_id'
    when 'skill' then 'skill_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  -- İstek, Space ve alıntı kaydedilemez (koleksiyon hedefi değiller).
  if p_kind = 'saves' and p_content_type in ('request', 'space', 'quote', 'skill') then
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
-- 7) Şikâyet + moderasyon
-- ============================================================================
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type = any (array[
  'prompt', 'comment', 'request', 'user', 'message', 'workflow', 'preset', 'story', 'space', 'quote', 'community', 'skill'
]));

CREATE OR REPLACE FUNCTION public._report_reasons_for(p_target_type text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_target_type in ('prompt', 'request', 'workflow', 'preset', 'space', 'quote', 'story', 'skill')
      then array['spam', 'copyright', 'sexual', 'hate', 'harassment', 'violence', 'privacy', 'fraud', 'wrongcat', 'platform', 'other']
    when p_target_type = 'user'
      then array['impersonation', 'harassment', 'spam', 'hate', 'sexual', 'violence', 'privacy', 'fraud', 'other']
    when p_target_type in ('comment', 'message', 'chat_message')
      then array['harassment', 'spam', 'hate', 'sexual', 'violence', 'privacy', 'fraud', 'other']
    when p_target_type = 'community_post'
      then array['spam', 'harassment', 'hate', 'sexual', 'violence', 'wrongcat', 'copyright', 'privacy', 'fraud', 'platform', 'other']
    when p_target_type = 'community'
      then array['wrongcat', 'spam', 'hate', 'harassment', 'violence', 'fraud', 'impersonation', 'sexual', 'other']
    else array[]::text[]
  end
$function$;

CREATE OR REPLACE FUNCTION public.submit_report(p_target_type text, p_target_id uuid, p_reason_code text, p_details text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_label text;
  v_reason text;
  v_group uuid;
  v_ok boolean := false;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_type is null or p_target_id is null or coalesce(array_length(public._report_reasons_for(p_target_type), 1), 0) = 0 then
    raise exception 'report_target_not_found';
  end if;
  if p_reason_code is null or not (p_reason_code = any (public._report_reasons_for(p_target_type))) then
    raise exception 'invalid_report_reason';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'details_too_long';
  end if;
  if p_reason_code = 'other' and (v_details is null or char_length(v_details) < 3) then
    raise exception 'details_required';
  end if;
  v_label := public._report_reason_label(p_reason_code);

  -- Hedef: çağıranın kendi RLS'i altında okunabilir olmalı (göremediğin içeriği şikâyet edemezsin; varlığı da sızmaz).
  if p_target_type = 'community_post' then
    select community_id into v_group from public.community_posts where id = p_target_id;
    if v_group is null then raise exception 'report_target_not_found'; end if;
    return public.report_community_content(v_group, 'post', p_target_id, v_label, p_reason_code, v_details);
  elsif p_target_type = 'chat_message' then
    select conversation_id into v_group from public.messages where id = p_target_id;
    if v_group is null then raise exception 'report_target_not_found'; end if;
    -- Ekip kanalı mesajı: site moderatörlerine DEĞİL ekip yönetimine gider (özel kanal içeriği ekip dışına çıkmaz).
    if exists (select 1 from public.conversations c where c.id = v_group and c.kind = 'team_channel') then
      return public.team_report_message(p_target_id, p_reason_code, v_details);
    end if;
    return public.report_community_content(v_group, 'message', p_target_id, v_label, p_reason_code, v_details);
  end if;

  v_ok := case p_target_type
    when 'prompt' then exists (select 1 from public.prompts where id = p_target_id)
    when 'request' then exists (select 1 from public.prompt_requests where id = p_target_id)
    when 'workflow' then exists (select 1 from public.workflows where id = p_target_id)
    when 'preset' then exists (select 1 from public.presets where id = p_target_id)
    when 'skill' then exists (select 1 from public.skills where id = p_target_id)
    when 'comment' then exists (select 1 from public.prompt_comments where id = p_target_id)
    when 'user' then exists (select 1 from public.profiles where id = p_target_id)
    when 'message' then exists (select 1 from public.messages where id = p_target_id)
    when 'story' then exists (select 1 from public.stories where id = p_target_id)
    when 'space' then exists (select 1 from public.spaces where id = p_target_id)
    when 'quote' then exists (select 1 from public.content_quotes where id = p_target_id)
    when 'community' then exists (select 1 from public.community_cards(array[p_target_id]))
    else false
  end;
  if not v_ok then
    raise exception 'report_target_not_found';
  end if;

  v_reason := v_label || case when v_details is not null then E'\n' || v_details else '' end;
  -- Yazma kapısı: `reports` INSERT politikası bu işlem-yerel işareti ister; istemci tabloya doğrudan yazarsa işaret yoktur ve reddedilir.
  perform set_config('promptly.submit_report', '1', true);
  begin
    insert into public.reports (id, reporter_id, target_type, target_id, reason, reason_code, details)
    values (v_id, v_actor, p_target_type, p_target_id, v_reason, p_reason_code, v_details);
  exception when unique_violation then
    perform set_config('promptly.submit_report', '', true);
    raise exception 'report_duplicate';
  end;
  perform set_config('promptly.submit_report', '', true);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.moderate_report(p_report_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    elsif r.target_type = 'skill' then delete from public.skills where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    elsif r.target_type = 'story' then
      update public.stories set moderation_status = 'removed', moderated_at = now(), moderated_by = auth.uid()
        where id = r.target_id;
    elsif r.target_type = 'space' then
      update public.spaces set visibility = 'private', shared_at = null where id = r.target_id;
    elsif r.target_type = 'quote' then
      delete from public.content_quotes where id = r.target_id;
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

CREATE OR REPLACE FUNCTION public.moderation_report_queue(p_status text, p_reason text)
 RETURNS TABLE(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text, reason_code text, details text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href, r.reason_code, r.details
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
    select true, k.title, k.author_id, '/skills/local?id=' || k.id
      from public.skills k where r.target_type = 'skill' and k.id = r.target_id
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
    union all
    select true, left(coalesce(qq.note, public._quote_target_title(qq.content_type, qq.target_id)), 300), qq.author_id, '/quotes/local?id=' || qq.id
      from public.content_quotes qq where r.target_type = 'quote' and qq.id = r.target_id
    union all
    select true, cg.name, cg.created_by, '/communities/local?id=' || cg.id
      from public.chat_groups cg where r.target_type = 'community' and cg.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
    and (p_reason is null or p_reason = 'all'
         or (p_reason = 'legacy' and r.reason_code is null)
         or r.reason_code = p_reason)
  order by r.created_at desc
  limit 200;
end $function$;
