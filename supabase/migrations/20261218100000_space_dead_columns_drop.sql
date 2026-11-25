-- Space sosyal katmanı CONTRACT'ı (docs/history/461-*): Space'e ait ölü sütunlar/tablolar/tetikleyiciler düşer.
-- Önkoşul: 20261217100000 (fonksiyonlar bu sütunlara artık bakmıyor) canlıda; istemci de bunları seçmiyor/yazmıyor.
-- Silinen veri: Space yorum/beğeni/alıntı/duyuru satırları 20261215100000 ile `space_social_archive`'a arşivlenip silinmişti;
-- bu migration yalnız boş kalan sütunları ve etkinlik günlüğünü (`space_activity`, istemcide gösterilmiyordu) düşürür.
-- ci:allow-destructive

-- 1. Yalnız Space'e ait tetikleyici/fonksiyonlar ----------------------------------------------------------------------------------
drop trigger if exists prompt_comments_enforce_space on public.prompt_comments;
drop trigger if exists prompt_comments_lock_space_scope on public.prompt_comments;
drop trigger if exists prompt_likes_enforce_space on public.prompt_likes;
drop trigger if exists prompt_likes_after_insert_notify_space on public.prompt_likes;
drop trigger if exists prompt_likes_after_delete_cleanup_space on public.prompt_likes;
drop trigger if exists content_quotes_no_space on public.content_quotes;
drop trigger if exists community_posts_no_space on public.community_posts;
drop trigger if exists spaces_guard_shared on public.spaces;
drop trigger if exists spaces_protect_counters on public.spaces;
drop trigger if exists spaces_protect_quote_count on public.spaces;
drop trigger if exists spaces_after_update on public.spaces;
drop trigger if exists space_members_after_change on public.space_members;
drop function if exists public.enforce_space_engagement();
drop function if exists public.prompt_comments_lock_space_scope();
drop function if exists public.notify_space_like();
drop function if exists public.cleanup_space_like_notification();
drop function if exists public.content_quotes_no_space();
drop function if exists public.community_posts_no_space();
drop function if exists public.spaces_guard_shared();
drop function if exists public.spaces_after_update();
drop function if exists public.space_members_after_change();
drop function if exists public.space_feed_cards(uuid[]);
drop function if exists public._space_href(uuid, text);

-- 2. Etkinlik günlüğü (`space_activity`) kalktı: yazan tetikleyicilerden `_space_log` çağrıları çıkar ----------------------------------
CREATE OR REPLACE FUNCTION public.spaces_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.space_members (space_id, user_id, role, added_by) values (new.id, new.owner_id, 'owner', new.owner_id);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.space_items_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._space_touch(coalesce(new.space_id, old.space_id));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.space_groups_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._space_touch(coalesce(new.space_id, old.space_id));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.space_palettes_after_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public._space_touch(coalesce(new.space_id, old.space_id));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_space_member(p_space_id uuid, p_username text, p_role text DEFAULT 'viewer'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_space public.spaces;
  v_target uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_role, '') not in ('editor', 'viewer') then raise exception 'space_invalid'; end if;
  select * into v_space from public.spaces where id = p_space_id for update;
  if not found or public.space_role(p_space_id) is null then raise exception 'space_not_found'; end if;
  if public.space_role(p_space_id) <> 'owner' then raise exception 'space_forbidden'; end if;
  if v_space.archived_at is not null then raise exception 'space_archived'; end if;
  select p.id into v_target from public.profiles p where lower(p.username) = lower(btrim(coalesce(p_username, '')));
  if v_target is null then raise exception 'space_user_not_found'; end if;
  if v_target = v_uid then raise exception 'space_self_invite'; end if;
  if public.is_blocked(v_uid, v_target) then raise exception 'space_user_not_found'; end if;
  if exists (select 1 from public.space_members m where m.space_id = p_space_id and m.user_id = v_target) then
    raise exception 'space_already_member';
  end if;
  if exists (select 1 from public.space_invitations i where i.space_id = p_space_id and i.invitee_id = v_target and i.status = 'pending') then
    raise exception 'space_invite_exists';
  end if;
  if (select count(*) from public.space_members m where m.space_id = p_space_id) >= 50 then raise exception 'space_member_limit'; end if;
  insert into public.space_invitations (space_id, invitee_id, role, invited_by) values (p_space_id, v_target, p_role, v_uid)
  returning id into v_id;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_target, v_uid, 'system', 'Seni "' || v_space.title || '" Space''ine davet etti.', '/spaces');
  return v_id;
end;
$function$;

drop function if exists public._space_log(uuid, text, text);
drop function if exists public._space_log(uuid, text, text, jsonb);

-- 3. list_spaces / follow_feed_settings: dönüş şeklinden ölü alanlar çıkar ------------------------------------------------------------

drop function if exists public.list_spaces(text, text, text, integer, integer);

CREATE FUNCTION public.list_spaces(p_filter text DEFAULT 'all'::text, p_query text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text, title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[], image_count integer, prompt_count integer, note_count integer, member_count integer, my_role text, last_opened_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, archived_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select nullif(btrim(coalesce(p_query, '')), '') as q,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url,
         s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         case when m.role is not null then (select count(*)::integer from public.space_members c where c.space_id = s.id) end,
         m.role, us.last_opened_at,
         s.created_at, s.updated_at, s.archived_at
    from public.spaces s
    cross join params
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where s.team_id is null
     and case coalesce(p_filter, 'all')
           when 'all' then m.role is not null and s.archived_at is null
           when 'mine' then m.role = 'owner' and s.archived_at is null
           when 'shared' then m.role in ('editor', 'viewer') and s.archived_at is null
           when 'recent' then us.last_opened_at is not null and s.archived_at is null
           when 'archived' then m.role = 'owner' and s.archived_at is not null
           else false
         end
     and (
       params.q is null
       or s.title ilike params.pattern or s.description ilike params.pattern
       or exists (
         select 1 from public.space_items si
          where si.space_id = s.id and (si.title ilike params.pattern or si.body ilike params.pattern or si.note ilike params.pattern)
       )
       or exists (
         select 1 from public.space_items si join public.prompts pr on pr.id = si.prompt_id
          where si.space_id = s.id and (pr.title ilike params.pattern or pr.prompt_text ilike params.pattern)
       )
     )
   order by
     case when p_sort = 'title' then lower(s.title) end asc,
     case when p_sort = 'created' then s.created_at end desc,
     case when p_sort = 'opened' then us.last_opened_at end desc nulls last,
     s.updated_at desc,
     s.id
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

drop function if exists public.follow_feed_settings_get();
create function public.follow_feed_settings_get()
returns table(group_posts boolean, include_tags boolean, include_tools boolean, show_versions boolean, show_results boolean, last_seen_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select coalesce(s.group_posts, true), coalesce(s.include_tags, true), coalesce(s.include_tools, false),
         coalesce(s.show_versions, true), coalesce(s.show_results, false), s.last_seen_at
  from (select (select auth.uid()) as uid) me
  left join public.follow_feed_settings s on s.user_id = me.uid
  where me.uid is not null
$$;
revoke execute on function public.follow_feed_settings_get() from public, anon;
grant execute on function public.follow_feed_settings_get() to authenticated;

drop function if exists public.follow_feed_settings_set(boolean, boolean, boolean, boolean, boolean, boolean);
create function public.follow_feed_settings_set(
  p_group_posts boolean default null, p_include_tags boolean default null, p_include_tools boolean default null,
  p_show_versions boolean default null, p_show_results boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.follow_feed_settings as s (user_id, group_posts, include_tags, include_tools, show_versions, show_results)
  values (uid, coalesce(p_group_posts, true), coalesce(p_include_tags, true), coalesce(p_include_tools, false),
          coalesce(p_show_versions, true), coalesce(p_show_results, false))
  on conflict (user_id) do update set
    group_posts = coalesce(p_group_posts, s.group_posts),
    include_tags = coalesce(p_include_tags, s.include_tags),
    include_tools = coalesce(p_include_tools, s.include_tools),
    show_versions = coalesce(p_show_versions, s.show_versions),
    show_results = coalesce(p_show_results, s.show_results),
    updated_at = now();
end $$;
revoke execute on function public.follow_feed_settings_set(boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.follow_feed_settings_set(boolean, boolean, boolean, boolean, boolean) to authenticated;
alter table public.follow_feed_settings drop column if exists show_space_activity;
alter table public.space_user_state drop column if exists favorite;

-- 4. prompt_comments
drop policy "Users follow comments of what they can read" on public.comment_subscriptions;
drop policy "Authenticated users can comment on visible targets" on public.prompt_comments;
drop policy "Comments are readable wherever their target is readable" on public.prompt_comments;
alter table public.prompt_comments drop constraint if exists prompt_comments_activity_scope;
alter table public.prompt_comments drop constraint if exists prompt_comments_rating_range;
alter table public.prompt_comments drop constraint if exists prompt_comments_rating_scope;
alter table public.prompt_comments drop constraint if exists prompt_comments_exactly_one_target;
alter table public.prompt_comments drop column if exists rating;
alter table public.prompt_comments drop column if exists space_activity_id;
alter table public.prompt_comments drop column if exists space_id;
alter table public.prompt_comments add constraint prompt_comments_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer + (workflow_id is not null)::integer
  + (preset_id is not null)::integer + (community_post_id is not null)::integer + (quote_id is not null)::integer + (skill_id is not null)::integer = 1);

create policy "Authenticated users can comment on visible targets" on public.prompt_comments as PERMISSIVE for INSERT to authenticated with check (((( SELECT auth.uid() AS uid) = author_id) AND (((prompt_id IS NOT NULL) AND (EXISTS ( SELECT 1
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
  WHERE (cp.id = prompt_comments.community_post_id)))) OR ((quote_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM content_quotes cq
  WHERE (cq.id = prompt_comments.quote_id)))) OR ((skill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM skills sk
  WHERE (sk.id = prompt_comments.skill_id)))))));
create policy "Comments are readable wherever their target is readable" on public.prompt_comments as PERMISSIVE for SELECT to public using ((((prompt_id IS NOT NULL) AND (EXISTS ( SELECT 1
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
  WHERE (cp.id = prompt_comments.community_post_id)))) OR ((quote_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM content_quotes cq
  WHERE (cq.id = prompt_comments.quote_id)))) OR ((skill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM skills sk
  WHERE (sk.id = prompt_comments.skill_id))))));

-- 5. prompt_likes (üretilmiş target_id yeniden kurulur)
drop policy "Likes are readable wherever their target is readable" on public.prompt_likes;
drop policy "Reaction counts are readable wherever the target's likes are" on public.reaction_stats;
alter table public.prompt_likes drop constraint if exists prompt_likes_exactly_one_target;
alter table public.prompt_likes drop column if exists target_id;
alter table public.prompt_likes drop column if exists space_id;
alter table public.prompt_likes add column target_id uuid generated always as (coalesce(prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, quote_id, skill_id)) stored;
alter table public.prompt_likes add constraint prompt_likes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer + (workflow_id is not null)::integer
  + (preset_id is not null)::integer + (community_post_id is not null)::integer + (quote_id is not null)::integer + (skill_id is not null)::integer = 1);
create index prompt_likes_target_reaction_recent_idx on public.prompt_likes (target_id, reaction, created_at desc, id desc);
create index prompt_likes_target_recent_idx on public.prompt_likes (target_id, created_at desc, id desc);
create policy "Reaction counts are readable wherever the target's likes are" on public.reaction_stats as permissive for select to public
  using (exists (select 1 from public.prompt_likes pl where pl.target_id = reaction_stats.target_id));

create policy "Likes are readable wherever their target is readable" on public.prompt_likes as PERMISSIVE for SELECT to public using (((user_id = ( SELECT auth.uid() AS uid)) OR ((prompt_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM prompts p
  WHERE (p.id = prompt_likes.prompt_id)))) OR ((request_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM prompt_requests r
  WHERE (r.id = prompt_likes.request_id)))) OR ((workflow_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM workflows w
  WHERE (w.id = prompt_likes.workflow_id)))) OR ((preset_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM presets s
  WHERE (s.id = prompt_likes.preset_id)))) OR ((community_post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM community_posts c
  WHERE (c.id = prompt_likes.community_post_id)))) OR ((quote_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM content_quotes cq
  WHERE (cq.id = prompt_likes.quote_id)))) OR ((skill_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM skills sk
  WHERE (sk.id = prompt_likes.skill_id))))));

-- 6. content_quotes
drop policy "Quotes are readable while their target is public" on public.content_quotes;
alter table public.content_quotes drop constraint if exists content_quotes_exactly_one_target;
alter table public.content_quotes drop constraint if exists content_quotes_type_check;
alter table public.content_quotes drop constraint if exists content_quotes_type_matches_target;
alter table public.content_quotes drop column if exists target_id;
alter table public.content_quotes drop column if exists space_id;
alter table public.content_quotes add column target_id uuid generated always as (coalesce(prompt_id, request_id, workflow_id, preset_id, skill_id)) stored;
alter table public.content_quotes add constraint content_quotes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer + (preset_id is not null)::integer + (skill_id is not null)::integer = 1);
alter table public.content_quotes add constraint content_quotes_type_check check (content_type in ('prompt', 'request', 'workflow', 'preset', 'skill'));
alter table public.content_quotes add constraint content_quotes_type_matches_target check (
  (content_type = 'prompt' and prompt_id is not null) or (content_type = 'request' and request_id is not null)
  or (content_type = 'workflow' and workflow_id is not null) or (content_type = 'preset' and preset_id is not null)
  or (content_type = 'skill' and skill_id is not null));
create index content_quotes_author_target_idx on public.content_quotes (author_id, content_type, target_id, created_at desc);
create policy "Quotes are readable while their target is public" on public.content_quotes as permissive for select to public
  using (public.quote_target_ok(content_type, target_id) and not public.is_blocked((select auth.uid()), author_id));

-- 7. community_posts
alter table public.community_posts drop constraint if exists community_posts_exactly_one_target;
alter table public.community_posts drop constraint if exists community_posts_space_application;
alter table public.community_posts drop constraint if exists community_posts_type_check;
alter table public.community_posts drop constraint if exists community_posts_type_matches_target;
alter table public.community_posts drop column if exists space_id;
alter table public.community_posts add constraint community_posts_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer + (preset_id is not null)::integer + (skill_id is not null)::integer = 1);
alter table public.community_posts add constraint community_posts_type_check check (content_type in ('prompt', 'request', 'workflow', 'preset', 'skill'));
alter table public.community_posts add constraint community_posts_type_matches_target check (
  (content_type = 'prompt' and prompt_id is not null) or (content_type = 'request' and request_id is not null)
  or (content_type = 'workflow' and workflow_id is not null) or (content_type = 'preset' and preset_id is not null)
  or (content_type = 'skill' and skill_id is not null));

-- 8. comment_subscriptions (üretilmiş target_id / target_kind yeniden kurulur)
alter table public.comment_subscriptions drop constraint if exists comment_subscriptions_one_target;
alter table public.comment_subscriptions drop column if exists target_id;
alter table public.comment_subscriptions drop column if exists target_kind;
alter table public.comment_subscriptions drop column if exists space_id;
alter table public.comment_subscriptions add column target_id uuid generated always as (coalesce(prompt_id, request_id, workflow_id, preset_id, skill_id)) stored;
alter table public.comment_subscriptions add column target_kind text generated always as (
  case when prompt_id is not null then 'prompt' when request_id is not null then 'request' when workflow_id is not null then 'workflow'
       when preset_id is not null then 'preset' when skill_id is not null then 'skill' end) stored;
alter table public.comment_subscriptions add constraint comment_subscriptions_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer + (preset_id is not null)::integer + (skill_id is not null)::integer = 1);
create unique index comment_subscriptions_content_uidx on public.comment_subscriptions (user_id, target_kind, target_id) where scope = 'content';
create index comment_subscriptions_target_idx on public.comment_subscriptions (target_id) where scope = 'content';

create policy "Users follow comments of what they can read" on public.comment_subscriptions as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND quote_target_ok(target_kind, target_id) AND ((comment_id IS NULL) OR (EXISTS ( SELECT 1
   FROM prompt_comments c
  WHERE ((c.id = comment_subscriptions.comment_id) AND (c.parent_id IS NULL) AND (c.deleted_at IS NULL) AND (COALESCE(c.prompt_id, c.request_id, c.workflow_id, c.preset_id, c.skill_id) = comment_subscriptions.target_id)))))));

-- 9. spaces: sayaçlar ve akış paylaşım işareti
alter table public.spaces drop constraint if exists spaces_counts_nonneg;
alter table public.spaces drop column if exists like_count;
alter table public.spaces drop column if exists comment_count;
alter table public.spaces drop column if exists quote_count;
alter table public.spaces drop column if exists shared_at;

-- 10. Etkinlik günlüğü tablosu (istemcide hiç gösterilmiyordu; tüm bağımlılar yukarıda kalktı)
drop table if exists public.space_activity;
