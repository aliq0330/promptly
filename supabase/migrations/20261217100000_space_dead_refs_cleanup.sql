-- Space sosyal katmanı sonrası ARTA KALAN: ortak (yorum/beğeni/alıntı/topluluk/bildirim/akış) fonksiyonları Space'e ait ölü sütunlara
-- (`space_id`, `space_activity_id`, `rating`, `shared_at`, `space_user_state.favorite`, `space_activity.author_note`, `spaces.*_count`) BAKMAZ.
-- Bu "genişlet" adımıdır: sütunlar yerinde durur, yalnız fonksiyon gövdeleri sadeleşir; sütunlar ayrı contract migration'ında düşer
-- (docs/history/461-*). Ayrıca `comment_follow_on_insert`'te 'request' türü için yanlış '/spaces/local' bağlantısı düzeltildi.

CREATE OR REPLACE FUNCTION public.comment_follow_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text;
  v_target uuid;
  v_root uuid;
  v_parent_author uuid;
  v_owner uuid;
  v_href text;
  v_hops integer := 0;
  v_cur uuid;
  v_next uuid;
begin
  if new.deleted_at is not null then return null; end if;

  v_kind := case when new.prompt_id is not null then 'prompt' when new.request_id is not null then 'request' when new.workflow_id is not null then 'workflow'
                 when new.preset_id is not null then 'preset' when new.skill_id is not null then 'skill' end;
  if v_kind is null then return null; end if;
  v_target := coalesce(new.prompt_id, new.request_id, new.workflow_id, new.preset_id, new.skill_id);

  -- Başlığın kökü: üst düzey yorum.
  v_root := new.id;
  v_cur := new.parent_id;
  while v_cur is not null and v_hops < 50 loop
    v_root := v_cur;
    select c.parent_id into v_next from public.prompt_comments c where c.id = v_cur;
    v_cur := v_next;
    v_hops := v_hops + 1;
  end loop;

  if new.parent_id is not null then
    select c.author_id into v_parent_author from public.prompt_comments c where c.id = new.parent_id;
  end if;
  select i.owner_id into v_owner from public._quote_content_info(v_kind, v_target) i;

  -- Yorumu yazan ve (yanıtsa) yanıt alan kişi o başlığa otomatik abone olur; 200 sınırı aşılmışsa eklenmez.
  insert into public.comment_subscriptions (user_id, scope, comment_id, auto, prompt_id, request_id, workflow_id, preset_id, skill_id)
  select u.uid, 'thread', v_root, true,
         case when v_kind = 'prompt' then v_target end, case when v_kind = 'request' then v_target end,
         case when v_kind = 'workflow' then v_target end, case when v_kind = 'preset' then v_target end,
         case when v_kind = 'skill' then v_target end
    from (select new.author_id as uid union select v_parent_author where v_parent_author is not null) u
   where (select count(*) from public.comment_subscriptions s where s.user_id = u.uid) < 200
     and not exists (select 1 from public.comment_subscriptions s where s.user_id = u.uid and s.scope = 'content' and s.target_id = v_target)
  on conflict do nothing;

  -- Hedef artık herkese açık değilse kimseye bildirim yazılmaz.
  if not coalesce((select i.shareable from public._quote_content_info(v_kind, v_target) i), false) then return null; end if;

  v_href := (case v_kind
    when 'prompt' then '/prompts/local?id=' when 'request' then '/requests/local?id=' when 'workflow' then '/workflows/local?id='
    when 'preset' then '/presets/local?id=' when 'skill' then '/skills/local?id=' else '/requests/local?id=' end)
    || v_target || '&hl=comment:' || new.id;

  -- Okunmamış dönem başına tek bildirim: aynı abonelik için okunmamış bildirim varsa yeni yazılmaz; okunmuşsa sıra numarası artar.
  with subs as (
    select s.id, s.user_id, s.notify_seq
      from public.comment_subscriptions s
     where ((s.scope = 'content' and s.target_id = v_target and s.target_kind = v_kind) or (s.scope = 'thread' and s.comment_id = v_root))
       and s.user_id <> new.author_id
       and s.user_id is distinct from v_parent_author
       and s.user_id is distinct from v_owner
       and not public.is_blocked(s.user_id, new.author_id)
     limit 500
  ), bumped as (
    update public.comment_subscriptions c
       set notify_seq = c.notify_seq + 1
      from subs
     where c.id = subs.id
       and exists (select 1 from public.notifications n where n.dedupe_key = 'csub:' || subs.id || ':' || subs.notify_seq and n.is_read)
    returning c.id, c.user_id, c.notify_seq
  )
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  select x.user_id, new.author_id, 'comment',
         'Takip ettiğin başlığa yorum yaptı: "' || public.truncate_preview(new.body) || '"',
         v_href, 'csub:' || x.id || ':' || x.seq
    from (
      select subs.id, subs.user_id, subs.notify_seq as seq
        from subs
       where not exists (select 1 from public.notifications n where n.dedupe_key = 'csub:' || subs.id || ':' || subs.notify_seq)
      union all
      select b.id, b.user_id, b.notify_seq from bumped b
    ) x
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end $function$;

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
  -- İstek ve alıntı kaydedilemez (Skill kaydedilir, 391) (koleksiyon hedefi değiller).
  if p_kind = 'saves' and p_content_type in ('request', 'quote') then
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

CREATE OR REPLACE FUNCTION public.create_quote(p_content_type text, p_content_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset', 'skill') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._quote_content_info(p_content_type, p_content_id);
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

  -- Aynı kişinin eşzamanlı iki isteği sınırı aşmasın.
  perform pg_advisory_xact_lock(hashtextextended('quote:' || v_actor::text, 0));
  if exists (
    select 1 from public.content_quotes q
     where q.author_id = v_actor and q.content_type = p_content_type and q.target_id = p_content_id
       and q.created_at > now() - interval '24 hours'
  ) then
    raise exception 'already_quoted';
  end if;
  if (select count(*) from public.content_quotes where author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'quote_rate_limit';
  end if;

  insert into public.content_quotes (id, author_id, content_type, prompt_id, request_id, workflow_id, preset_id, skill_id, note)
  values (
    v_id, v_actor, p_content_type,
    case when p_content_type = 'prompt' then p_content_id end,
    case when p_content_type = 'request' then p_content_id end,
    case when p_content_type = 'workflow' then p_content_id end,
    case when p_content_type = 'preset' then p_content_id end,
    case when p_content_type = 'skill' then p_content_id end,
    v_note
  );
  return v_id;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.feed_page(p_scope text, p_order text, p_kinds text[], p_content_type text, p_category text, p_subcategory text, p_limit integer, p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid, p_open_only boolean, p_tag text, p_tool text, p_authors uuid[], p_tags text[], p_tools text[], p_has_media boolean)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
           (p_order = 'used') as used,
           (p_order = 'recommended') as recommended,
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
           (case when pr.used then x.copy_count when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (not coalesce(p_has_media, false)
           or exists (select 1 from public.prompt_media pm where pm.prompt_id = x.id)
           or (x.content_type in ('video', 'audio') and exists (select 1 from public.prompt_results prr where prr.prompt_id = x.id and prr.media_url is not null and prr.media_type in ('video', 'audio'))))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.used then x.copy_count when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.used then x.copy_count when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 + x.response_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 + x.response_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 + x.response_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.creator_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (not coalesce(p_has_media, false) or exists (select 1 from public.workflow_media wm where wm.workflow_id = x.id))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.creator_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  -- Alıntı: akışta gönderi olarak. Okuma RLS'i (`content_quotes`) hedefin halka açıklığını ve engeli ayrıca uygular.
  -- Alıntının etiketi/kategorisi/aracı/içerik türü yoktur: bu süzgeçlerden biri verilmişse ya da kapsam "etiketlerim"se alıntı girmez .
  quote_part as (
    select 'quote'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.content_quotes x, params pr
    where (p_kinds is null or 'quote' = any (p_kinds))
      and not coalesce(p_has_media, false)
      and not pr.tagged
      and (not pr.following or x.author_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  -- Skill (docs/history/400-*): karma akışta gönderi kartı. Skill'in içerik türü/kategori sınıflaması prompt taksonomisinden ayrıdır; bu süzgeçlerden biri
  -- verilmişse ya da araç süzgeci (uyumlu araçlar farklı bir katalogdur) varsa Skill girmez; "Medya" süzgecini İstek ve Ayar paketi gibi geçer (kendi özeti görselin yerini tutar). Etiket, takip ve yazar süzgeçleri uygulanır.
  skill_part as (
    select 'skill'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.use_count * 2 + x.save_count * 3 + x.like_count * 2 + x.comment_count when pr.popular then x.like_count when pr.used then x.use_count else 0 end)::bigint as sort_rank
    from public.skills x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'skill' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tool is null
      and (p_tools is null or cardinality(p_tools) = 0)
      and (p_tag is null or exists (select 1 from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug = p_tag))
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug = s.slug)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.use_count * 2 + x.save_count * 3 + x.like_count * 2 + x.comment_count when pr.popular then x.like_count when pr.used then x.use_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.use_count * 2 + x.save_count * 3 + x.like_count * 2 + x.comment_count when pr.popular then x.like_count when pr.used then x.use_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  )
  select u.kind, u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
    union all select * from quote_part
    union all select * from skill_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.oldest then u.created_at end asc, case when pr.oldest then u.id end asc,
           u.created_at desc, u.id desc
  limit (select lim from params);
$function$;

CREATE OR REPLACE FUNCTION public.following_activity_page(p_limit integer DEFAULT 20, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_key text DEFAULT NULL::text, p_source text DEFAULT 'all'::text, p_kinds text[] DEFAULT NULL::text[], p_authors uuid[] DEFAULT NULL::uuid[], p_tags text[] DEFAULT NULL::text[], p_tools text[] DEFAULT NULL::text[], p_content_type text DEFAULT NULL::text)
 RETURNS TABLE(event_key text, event_kind text, source text, actor_id uuid, occurred_at timestamp with time zone, item_kind text, item_id uuid, member_ids text[], detail jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with me as (select (select auth.uid()) as uid),
  st as (
    select s.group_posts, s.include_tags, s.include_tools, s.show_versions, s.show_results
    from public.follow_feed_settings_get() s
  ),
  lim as (select least(greatest(coalesce(p_limit, 20), 1), 50) as n),
  src as (select coalesce(nullif(p_source, ''), 'all') as v),
  cur as (select coalesce(p_before_at, 'infinity'::timestamptz) as at, coalesce(p_before_key, '~') as k),
  followed as (select f.following_id as id from public.follows f, me where f.follower_id = me.uid),
  modes as (select m.target_id, m.mode from public.follow_feed_modes m, me where m.user_id = me.uid),
  my_tools as (select t.tool_id from public.tool_follows t, me where t.user_id = me.uid),
  -- Kişilerin paylaşımları: feed_page (kapsam following, en yeni). Aday penceresi sayfanın 2,5 katı (toplama için), en çok 50.
  people_raw as (
    select f.kind, f.id, f.created_at
    from public.feed_page('following', 'newest', p_kinds, p_content_type, null, null,
                          least((select n from lim) * 5 / 2, 50), 0::bigint,
                          p_before_at, case when p_before_at is null then null else 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid end,
                          false, null, null, p_authors, p_tags, p_tools, false) f, src
    where src.v in ('all', 'people') and f.kind <> 'space'
  ),
  tag_raw as (
    select f.kind, f.id, f.created_at
    from public.feed_page('tags', 'newest', p_kinds, p_content_type, null, null, (select n from lim), 0::bigint,
                          p_before_at, case when p_before_at is null then null else 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid end,
                          false, null, null, p_authors, p_tags, p_tools, false) f, src, st
    where (src.v = 'tags' or (src.v = 'all' and st.include_tags)) and f.kind not in ('space', 'quote')
  ),
  tool_raw as (
    select f.kind, f.id, f.created_at
    from public.feed_page('all', 'newest', p_kinds, p_content_type, null, null, (select n from lim), 0::bigint,
                          p_before_at, case when p_before_at is null then null else 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid end,
                          false, null, null, p_authors, p_tags,
                          coalesce(p_tools, (select array_agg(tool_id) from my_tools)), false) f, src, st
    where (src.v = 'tools' or (src.v = 'all' and st.include_tools)) and exists (select 1 from my_tools)
      and f.kind not in ('space', 'quote')
  ),
  posts as (
    select r.kind, r.id, r.created_at, a.actor_id, a.highlight, 'people'::text as source
    from people_raw r cross join lateral public._feed_item_actor(r.kind, r.id) a
    union all
    select r.kind, r.id, r.created_at, a.actor_id, a.highlight, 'tag'
    from tag_raw r cross join lateral public._feed_item_actor(r.kind, r.id) a, src
    where src.v = 'tags' or a.actor_id not in (select id from followed)
    union all
    select r.kind, r.id, r.created_at, a.actor_id, a.highlight, 'tool'
    from tool_raw r cross join lateral public._feed_item_actor(r.kind, r.id) a, src
    where src.v = 'tools' or a.actor_id not in (select id from followed)
  ),
  posts_dedup as (
    select distinct on (p.kind, p.id) p.*
    from posts p, me
    where p.actor_id is distinct from me.uid
      and p.actor_id not in (select target_id from modes where mode = 'muted')
      and (p.highlight or p.actor_id not in (select target_id from modes where mode = 'highlights'))
    order by p.kind, p.id, case p.source when 'people' then 0 when 'tag' then 1 else 2 end
  ),
  -- Toplama: aynı kişi, ardışık paylaşımlar arası en çok 3 saat; alıntı toplanmaz; yalnız kişilerin paylaşımları.
  sessions as (
    select p.*,
           sum(case when prev_at is null or prev_at > p.created_at + interval '3 hours' then 1 else 0 end)
             over (partition by p.actor_id order by p.created_at desc, p.id desc) as session_no
    from (
      select d.*, lag(d.created_at) over (partition by d.actor_id order by d.created_at desc, d.id desc) as prev_at
      from posts_dedup d, st
      where d.source = 'people' and d.kind <> 'quote' and st.group_posts
    ) p
  ),
  groups as (
    select s.actor_id, s.session_no, count(*) as cnt, max(s.created_at) as last_at, min(s.created_at) as first_at,
           array_agg(s.kind || ':' || s.id::text order by s.created_at desc, s.id desc) as members
    from sessions s
    group by s.actor_id, s.session_no
    having count(*) >= 3
  ),
  grouped_ids as (
    select s.kind, s.id from sessions s join groups g on g.actor_id = s.actor_id and g.session_no = s.session_no
  ),
  post_events as (
    select ('p:' || d.kind || ':' || d.id::text) as event_key, 'post'::text as event_kind, d.source, d.actor_id,
           d.created_at as occurred_at, d.kind as item_kind, d.id as item_id, null::text[] as member_ids,
           case when d.source = 'tag' then jsonb_build_object('tags', (
                  select coalesce(jsonb_agg(distinct t.tag_slug), '[]'::jsonb)
                  from public.tag_follows t, me
                  where t.user_id = me.uid and t.tag_slug in (
                    select pt.tag_slug from public.prompt_tags pt where d.kind = 'prompt' and pt.prompt_id = d.id
                    union all select rt.tag_slug from public.prompt_request_tags rt where d.kind = 'request' and rt.request_id = d.id
                    union all select wt.tag_slug from public.workflow_tags wt where d.kind = 'workflow' and wt.workflow_id = d.id
                    union all select xt.tag_slug from public.preset_tags xt where d.kind = 'preset' and xt.preset_id = d.id)))
                when d.source = 'tool' then jsonb_build_object('tools', (select coalesce(jsonb_agg(tool_id), '[]'::jsonb) from my_tools))
                else '{}'::jsonb end as detail
    from posts_dedup d
    where not exists (select 1 from grouped_ids g where g.kind = d.kind and g.id = d.id)
  ),
  group_events as (
    select ('g:' || g.actor_id::text || ':' || extract(epoch from g.last_at)::bigint::text) as event_key, 'group'::text, 'people'::text,
           g.actor_id, g.last_at, 'group'::text, null::uuid, g.members,
           jsonb_build_object('count', g.cnt, 'first_at', g.first_at)
    from groups g
  ),
  -- Yeni sürümler: takip edilen kişinin herkese açık içeriği; ilk sürüm değil; aynı içerik için 24 saatte yalnız son sürüm.
  version_events as (
    select ve.* from (
      select ('v:prompt:' || v.prompt_id::text || ':' || v.version_number) as event_key, 'version'::text as event_kind, 'people'::text as source,
             x.author_id as actor_id, v.created_at as occurred_at, 'prompt'::text as item_kind, v.prompt_id as item_id, null::text[] as member_ids,
             jsonb_build_object('version', v.version_number, 'version_id', v.id, 'via', v.source) as detail
      from public.prompt_versions v join public.prompts x on x.id = v.prompt_id
      where v.version_number > 1 and x.author_id in (select id from followed)
        and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
        and v.created_at > now() - interval '60 days'
        and not exists (select 1 from public.prompt_versions n where n.prompt_id = v.prompt_id and n.version_number > v.version_number
                          and n.created_at <= v.created_at + interval '24 hours')
      union all
      select 'v:workflow:' || v.workflow_id::text || ':' || v.version_number, 'version', 'people', x.creator_id, v.created_at, 'workflow', v.workflow_id, null,
             jsonb_build_object('version', v.version_number, 'version_id', v.id)
      from public.workflow_versions v join public.workflows x on x.id = v.workflow_id
      where v.version_number > 1 and v.source = 'owner_edit' and x.creator_id in (select id from followed)
        and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and v.created_at > now() - interval '60 days'
        and not exists (select 1 from public.workflow_versions n where n.workflow_id = v.workflow_id and n.version_number > v.version_number
                          and n.created_at <= v.created_at + interval '24 hours')
      union all
      select 'v:preset:' || v.preset_id::text || ':' || v.version_number, 'version', 'people', x.creator_id, v.created_at, 'preset', v.preset_id, null,
             jsonb_build_object('version', v.version_number, 'version_id', v.id)
      from public.preset_versions v join public.presets x on x.id = v.preset_id
      where v.version_number > 1 and v.source = 'owner_edit' and x.creator_id in (select id from followed)
        and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and v.created_at > now() - interval '60 days'
        and not exists (select 1 from public.preset_versions n where n.preset_id = v.preset_id and n.version_number > v.version_number
                          and n.created_at <= v.created_at + interval '24 hours')
      union all
      select 'v:skill:' || v.skill_id::text || ':' || v.version, 'version', 'people', x.author_id, v.created_at, 'skill', v.skill_id, null,
             jsonb_build_object('version', v.version, 'version_id', v.id, 'summary', nullif(v.changelog, ''))
      from public.skill_versions v join public.skills x on x.id = v.skill_id
      where x.author_id in (select id from followed) and x.status = 'published' and x.visibility = 'public' and v.deprecated_at is null
        and v.created_at > now() - interval '60 days'
        and exists (select 1 from public.skill_versions o where o.skill_id = v.skill_id and o.created_at < v.created_at)
    ) ve, st, src
    where st.show_versions and src.v in ('all', 'people')
      and (p_kinds is null or ve.item_kind = any (p_kinds))
      and (p_content_type is null or (ve.item_kind = 'prompt'
           and exists (select 1 from public.prompts cp where cp.id = ve.item_id and cp.content_type = p_content_type)))
      and (p_authors is null or cardinality(p_authors) = 0 or ve.actor_id = any (p_authors))
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and ve.actor_id not in (select target_id from modes where mode = 'muted')
      and (ve.occurred_at, ve.event_key) < ((select at from cur), (select k from cur))
    order by ve.occurred_at desc, ve.event_key desc
    limit (select n from lim)
  ),
  -- Sonuç paylaşımları: takip edilen kişinin, herkese açık bir prompta paylaştığı sonuç (yetim sonuç değil).
  result_events as (
    select ('r:' || r.id::text) as event_key, 'result'::text, 'people'::text, r.creator_id, r.created_at, 'result'::text, r.id, null::text[],
           jsonb_build_object('prompt_id', r.prompt_id, 'prompt_author', x.author_id) as detail
    from public.prompt_results r join public.prompts x on x.id = r.prompt_id, st, src
    where st.show_results and src.v in ('all', 'people')
      and r.creator_id in (select id from followed) and r.creator_id not in (select target_id from modes where mode in ('muted', 'highlights'))
      and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_authors is null or cardinality(p_authors) = 0 or r.creator_id = any (p_authors))
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and (r.created_at, 'r:' || r.id::text) < ((select at from cur), (select k from cur))
    order by r.created_at desc, r.id desc
    limit (select n from lim)
  ),
  all_events as (
    select * from post_events
    union all select * from group_events
    union all select * from version_events
    union all select * from result_events
  )
  select e.event_key, e.event_kind, e.source, e.actor_id, e.occurred_at, e.item_kind, e.item_id, e.member_ids, e.detail
  from all_events e, me
  where me.uid is not null
    and (e.occurred_at, e.event_key) < ((select at from cur), (select k from cur))
  order by e.occurred_at desc, e.event_key desc
  limit (select n from lim)
$function$;

CREATE OR REPLACE FUNCTION public.following_activity_summary(p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with me as (select (select auth.uid()) as uid),
  since as (select greatest(coalesce(p_since, now() - interval '7 days'), now() - interval '30 days') as at),
  followed as (select f.following_id as id from public.follows f, me where f.follower_id = me.uid),
  muted as (select m.target_id from public.follow_feed_modes m, me where m.user_id = me.uid and m.mode = 'muted'),
  st as (select * from public.follow_feed_settings_get()),
  post_rows as (
    select x.author_id as actor from public.prompts x, since
    where x.created_at > since.at and x.author_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
      and x.deleted_at is null and x.community_id is null and x.team_file_id is null and (x.origin_type = 'original' or x.show_on_profile)
    union all
    select x.author_id from public.prompt_requests x, since
    where x.created_at > since.at and x.author_id in (select id from followed) and not x.is_draft and x.visibility = 'public'
      and x.deleted_at is null and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id from public.workflows x, since
    where x.created_at > since.at and x.creator_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
      and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id from public.presets x, since
    where x.created_at > since.at and x.creator_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
      and x.community_id is null and x.team_file_id is null
    union all
    select x.author_id from public.skills x, since
    where x.created_at > since.at and x.author_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
    union all
    select x.author_id from public.content_quotes x, since
    where x.created_at > since.at and x.author_id in (select id from followed)
  ),
  posts as (select actor from post_rows where actor not in (select target_id from muted)),
  versions as (
    select x.author_id as actor from public.prompt_versions v join public.prompts x on x.id = v.prompt_id, since
    where v.created_at > since.at and v.version_number > 1 and x.author_id in (select id from followed)
      and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id from public.workflow_versions v join public.workflows x on x.id = v.workflow_id, since
    where v.created_at > since.at and v.version_number > 1 and v.source = 'owner_edit' and x.creator_id in (select id from followed)
      and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
  ),
  tagged as (
    select count(*) as n from public.prompts x, since, me
    where x.created_at > since.at and x.author_id not in (select id from followed) and x.author_id <> me.uid
      and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and exists (select 1 from public.prompt_tags pt join public.tag_follows tf on tf.tag_slug = pt.tag_slug and tf.user_id = me.uid where pt.prompt_id = x.id)
  ),
  actors as (
    select p.actor, count(*) as n from posts p group by p.actor order by count(*) desc, p.actor limit 12
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'since', (select at from since),
    'posts', (select count(*) from posts),
    'versions', case when (select show_versions from st) then (select count(*) from versions where actor not in (select target_id from muted)) else 0 end,
    'spaces', 0,
    'tags', case when (select include_tags from st) then (select n from tagged) else 0 end,
    'active_people', (select count(distinct actor) from posts),
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', actor, 'count', n) order by n desc, actor) from actors), '[]'::jsonb),
    'following', (select count(*) from followed),
    'tags_followed', (select count(*) from public.tag_follows t, me where t.user_id = me.uid),
    'tools_followed', (select count(*) from public.tool_follows t, me where t.user_id = me.uid),
    'spaces_followed', 0
  ) end
$function$;

CREATE OR REPLACE FUNCTION public.handle_comment_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (old.community_post_id is not null or old.quote_id is not null or old.skill_id is not null) and pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.prompt_comments where parent_id = old.id) then
    update public.prompt_comments
      set deleted_at = now(),
          body = '',
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

CREATE OR REPLACE FUNCTION public.handle_quote_count_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set quote_count = quote_count + 1 where id = new.prompt_id;
    elsif new.request_id is not null then
      update public.prompt_requests set quote_count = quote_count + 1 where id = new.request_id;
    elsif new.workflow_id is not null then
      update public.workflows set quote_count = quote_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set quote_count = quote_count + 1 where id = new.preset_id;
    elsif new.skill_id is not null then
      update public.skills set quote_count = quote_count + 1 where id = new.skill_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set quote_count = greatest(quote_count - 1, 0) where id = old.prompt_id;
    elsif old.request_id is not null then
      update public.prompt_requests set quote_count = greatest(quote_count - 1, 0) where id = old.request_id;
    elsif old.workflow_id is not null then
      update public.workflows set quote_count = greatest(quote_count - 1, 0) where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set quote_count = greatest(quote_count - 1, 0) where id = old.preset_id;
    elsif old.skill_id is not null then
      update public.skills set quote_count = greatest(quote_count - 1, 0) where id = old.skill_id;
    end if;
    return old;
  end if;
  return null;
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

CREATE OR REPLACE FUNCTION public.my_comment_subscriptions()
 RETURNS TABLE(id uuid, scope text, target_kind text, target_id uuid, title text, comment_id uuid, comment_preview text, auto boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select s.id, s.scope, s.target_kind, s.target_id,
         coalesce(p.title, r.title, w.title, ps.title, sk.title, '') as title,
         s.comment_id,
         case when s.comment_id is null then null else public.truncate_preview(coalesce(c.body, ''), 80) end,
         s.auto, s.created_at
    from public.comment_subscriptions s
    left join public.prompts p on p.id = s.prompt_id
    left join public.prompt_requests r on r.id = s.request_id
    left join public.workflows w on w.id = s.workflow_id
    left join public.presets ps on ps.id = s.preset_id
    left join public.skills sk on sk.id = s.skill_id
    left join public.prompt_comments c on c.id = s.comment_id
   where s.user_id = (select auth.uid())
   order by s.created_at desc, s.id desc
   limit 200
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
  v_quote_id uuid;
  v_skill_id uuid;
  v_community_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, quote_id, skill_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_result_id, v_workflow_id, v_preset_id, v_post_id, v_quote_id, v_skill_id, v_body
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
  if new.workflow_id is not null or new.preset_id is not null or new.quote_id is not null or new.skill_id is not null then
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

CREATE OR REPLACE FUNCTION public.notify_community_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      when 'skill' then (select title from public.skills where id = v_post.skill_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.search_quotes(p_query text, p_limit integer DEFAULT 24, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_pat text;
begin
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  v_pat := '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select q.id, q.created_at
      from public.content_quotes q
     where (q.note ilike v_pat
            or case q.content_type
                 when 'prompt' then exists (select 1 from public.prompts t where t.id = q.prompt_id and t.title ilike v_pat)
                 when 'request' then exists (select 1 from public.prompt_requests t where t.id = q.request_id and t.title ilike v_pat)
                 when 'workflow' then exists (select 1 from public.workflows t where t.id = q.workflow_id and t.title ilike v_pat)
                 when 'preset' then exists (select 1 from public.presets t where t.id = q.preset_id and t.title ilike v_pat)
                 when 'skill' then exists (select 1 from public.skills t where t.id = q.skill_id and t.title ilike v_pat)
                 else false
               end)
       and (p_after_id is null or (q.created_at, q.id) < (p_after_created_at, p_after_id))
     order by q.created_at desc, q.id desc
     limit least(greatest(coalesce(p_limit, 24), 1), 50);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_comment_subscription(p_kind text, p_target uuid, p_comment uuid, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('prompt', 'request', 'workflow', 'preset', 'skill') then
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.comment_subscriptions (user_id, scope, comment_id, prompt_id, request_id, workflow_id, preset_id, skill_id)
    values (
      v_me, case when p_comment is null then 'content' else 'thread' end, p_comment,
      case when p_kind = 'prompt' then p_target end, case when p_kind = 'request' then p_target end,
      case when p_kind = 'workflow' then p_target end, case when p_kind = 'preset' then p_target end,
      case when p_kind = 'skill' then p_target end
    )
    on conflict do nothing;
  else
    delete from public.comment_subscriptions s
     where s.user_id = v_me and s.target_kind = p_kind and s.target_id = p_target and s.comment_id is not distinct from p_comment;
  end if;
  return p_on;
end $function$;

CREATE OR REPLACE FUNCTION public.share_to_community(p_group_id uuid, p_content_type text, p_content_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset', 'skill') or p_content_id is null then
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
    insert into public.community_posts (id, community_id, author_id, kind, content_type, prompt_id, request_id, workflow_id, preset_id, skill_id, note)
    values (
      v_id, p_group_id, v_actor, 'application', p_content_type,
      case when p_content_type = 'prompt' then p_content_id end,
      case when p_content_type = 'request' then p_content_id end,
      case when p_content_type = 'workflow' then p_content_id end,
      case when p_content_type = 'preset' then p_content_id end,
      case when p_content_type = 'skill' then p_content_id end,
      v_note
    );
  exception when unique_violation then
    raise exception 'already_shared';
  end;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_like_notification_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text;
begin
  v_key := case
    when new.prompt_id is not null then 'prompt_like:' || new.prompt_id
    when new.workflow_id is not null then 'workflow_like:' || new.workflow_id
    when new.preset_id is not null then 'preset_like:' || new.preset_id
    when new.community_post_id is not null then 'cpost_like:' || new.community_post_id
    when new.quote_id is not null then 'quote_like:' || new.quote_id
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
$function$;
