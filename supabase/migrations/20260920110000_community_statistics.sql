-- İstatistikler topluluk içeriğinde ve topluluk gönderisinde de çalışır (docs/history/181-*).
--
-- Sorun: `_engager_content_visible` yalnızca herkese açık içeriği ya da yazarın kendisini görünür sayar. Topluluğa özgü içerik
-- (`community_id` dolu) `private` saklandığı için topluluktaki başka üyeler "Beğenenler/Yorum yapanlar" listesini boş görürdü.
-- Ayrıca başvuru/yerel gönderinin KENDİ beğeni ve yorumları (`community_post_id`) için hedef türü yoktu.
--
--   1) `_engager_content_visible`: topluluk içeriği → `can_read_community(community_id)` (herkese açık toplulukta herkes, kapalıda üye);
--      yeni hedef `community_post` → gönderinin topluluğunu okuyabilen.
--   2) `content_engagers`: `community_post` → `prompt_likes/prompt_comments.community_post_id`. Gönderi kaydedilemez → "saves" boş.
--
-- Yalnızca `create or replace` (aynı imzalar, izinler korunur); `drop` yok. Önce bu migration, sonra istemci kodu.

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
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  if p_kind = 'saves' and p_content_type in ('request', 'community_post') then
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
