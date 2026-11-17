-- Moderatör kullanıcı ekranında Skill (docs/history/417-*): `admin_users` ve `admin_user_activity` Skill'i görmüyordu.
--  * `admin_users`: dönüş tablosu AYNI kalır (yeni sütun `drop` ister = yıkıcı). Skill sayısı `posts_total` ve `likes_received_n` içine katılır;
--    istemci Skill sayısını `posts_total − (prompt + istek + workflow + ayar paketi)` olarak türetir. İçerik türü süzgeci varken Skill sayılmaz (Skill'in türü yoktur).
--  * `admin_user_activity`: gönderiler listesine Skill eklenir; yorum/beğeni/kayıt kollarında Skill artık "sonuç"/"preset" diye YANLIŞ etiketlenmez, başlığı ve bağlantısı dolu gelir.
-- Gövdeler repodaki son tanımlardan (canlıyla eşleştirildi) üretildi; tek fark Skill dalları. Yetkiler `create or replace` ile korunur.

create or replace function public.admin_users(p_query text default null, p_content_type text default null, p_sort text default 'newest', p_status text default 'all', p_limit integer default 30, p_offset integer default 0, p_user_id uuid default null)
 returns table(id uuid, username text, display_name text, avatar_url text, bio text, email text, role text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, suspended_until timestamp with time zone, suspended_reason text, posting_blocked boolean, posting_block_reason text, prompts_n integer, requests_n integer, workflows_n integer, presets_n integer, posts_total integer, comments_n integer, likes_given_n integer, likes_received_n integer, saves_n integer, followers_n integer, following_n integer, messages_n integer, conversations_n integer, reports_filed_n integer, reports_against_n integer, storage_files integer, storage_bytes bigint, image_bytes bigint, video_bytes bigint, audio_bytes bigint, total_count bigint)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform public._admin_guard();
  return query
  with st as (
    select s.owner_id as oid, count(*)::int files, coalesce(sum(s.size), 0)::bigint bytes,
      coalesce(sum(s.size) filter (where s.kind = 'image'), 0)::bigint img,
      coalesce(sum(s.size) filter (where s.kind = 'video'), 0)::bigint vid,
      coalesce(sum(s.size) filter (where s.kind = 'audio'), 0)::bigint aud
    from public._storage_objects() s where s.owner_id is not null group by s.owner_id),
  base as (
    select p.id, p.username, p.display_name, p.avatar_url, p.bio, u.email::text as email, p.role,
      p.created_at, u.last_sign_in_at,
      p.suspended_until, p.suspended_reason, p.posting_blocked, p.posting_block_reason,
      (select count(*) from public.prompts x where x.author_id = p.id and x.deleted_at is null and (p_content_type is null or x.content_type = p_content_type))::int as prompts_n,
      (select count(*) from public.prompt_requests x where x.author_id = p.id and x.deleted_at is null and (p_content_type is null or x.content_type = p_content_type))::int as requests_n,
      (select count(*) from public.workflows x where x.creator_id = p.id and (p_content_type is null or p_content_type = any (x.content_types)))::int as workflows_n,
      (select count(*) from public.presets x where x.creator_id = p.id and (p_content_type is null or x.content_type = p_content_type))::int as presets_n,
      -- Skill'lerin içerik türü (görsel/metin/ses/video) yoktur: tür süzgeci varken sayılmaz. Çıktı sütunu YOK; `posts_total` ve `likes_received_n` içine katılır.
      (select count(*) from public.skills x where x.author_id = p.id and p_content_type is null)::int as skills_n,
      (select count(*) from public.prompt_comments c where c.author_id = p.id and c.deleted_at is null)::int as comments_n,
      ((select count(*) from public.prompt_likes l where l.user_id = p.id) + (select count(*) from public.comment_likes l where l.user_id = p.id))::int as likes_given_n,
      ((select coalesce(sum(like_count), 0) from public.prompts x where x.author_id = p.id and x.deleted_at is null)
       + (select coalesce(sum(like_count), 0) from public.prompt_requests x where x.author_id = p.id and x.deleted_at is null)
       + (select coalesce(sum(like_count), 0) from public.workflows x where x.creator_id = p.id)
       + (select coalesce(sum(like_count), 0) from public.presets x where x.creator_id = p.id)
       + (select coalesce(sum(like_count), 0) from public.skills x where x.author_id = p.id))::int as likes_received_n,
      (select count(*) from public.collection_items ci join public.collections c on c.id = ci.collection_id where c.owner_id = p.id)::int as saves_n,
      p.follower_count as followers_n, p.following_count as following_n,
      (select count(*) from public.messages m where m.sender_id = p.id)::int as messages_n,
      (select count(*) from public.conversation_members cm where cm.user_id = p.id)::int as conversations_n,
      (select count(*) from public.reports r where r.reporter_id = p.id)::int as reports_filed_n,
      (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p.id)::int as reports_against_n,
      coalesce(st.files, 0) as storage_files, coalesce(st.bytes, 0) as storage_bytes,
      coalesce(st.img, 0) as image_bytes, coalesce(st.vid, 0) as video_bytes, coalesce(st.aud, 0) as audio_bytes
    from public.profiles p
    join auth.users u on u.id = p.id
    left join st on st.oid = p.id
    where (p_user_id is null or p.id = p_user_id)
      and (p_query is null or btrim(p_query) = '' or p.username ilike '%' || btrim(p_query) || '%'
           or p.display_name ilike '%' || btrim(p_query) || '%' or u.email ilike '%' || btrim(p_query) || '%')
      and (p_status = 'all'
           or (p_status = 'suspended' and p.suspended_until > now())
           or (p_status = 'blocked' and p.posting_blocked)
           or (p_status = 'moderator' and p.role = 'moderator'))
  ),
  fin as (
    select b.*, (b.prompts_n + b.requests_n + b.workflows_n + b.presets_n + b.skills_n) as posts_total from base b
  )
  select f.id, f.username, f.display_name, f.avatar_url, f.bio, f.email, f.role, f.created_at, f.last_sign_in_at,
    f.suspended_until, f.suspended_reason, f.posting_blocked, f.posting_block_reason,
    f.prompts_n, f.requests_n, f.workflows_n, f.presets_n, f.posts_total,
    f.comments_n, f.likes_given_n, f.likes_received_n, f.saves_n, f.followers_n, f.following_n,
    f.messages_n, f.conversations_n, f.reports_filed_n, f.reports_against_n,
    f.storage_files, f.storage_bytes, f.image_bytes, f.video_bytes, f.audio_bytes,
    count(*) over () as total_count
  from fin f
  where p_content_type is null or p_user_id is not null or f.posts_total > 0
  order by
    case when p_sort = 'posts' then f.posts_total end desc nulls last,
    case when p_sort = 'storage' then f.storage_bytes end desc nulls last,
    case when p_sort = 'comments' then f.comments_n end desc nulls last,
    case when p_sort = 'likes' then f.likes_given_n end desc nulls last,
    case when p_sort = 'messages' then f.messages_n end desc nulls last,
    case when p_sort = 'active' then f.last_sign_in_at end desc nulls last,
    f.created_at desc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
end $function$;

create or replace function public.admin_user_activity(p_user_id uuid, p_kind text, p_limit integer default 40, p_before timestamp with time zone default null)
 returns table(id text, created_at timestamp with time zone, label text, body text, href text, meta jsonb)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform public._admin_guard();
  if p_kind = 'posts' then
    return query select q.* from (
      select x.id::text, x.created_at, 'prompt'::text, x.title, '/prompts/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.prompts x where x.author_id = p_user_id and x.deleted_at is null
      union all select x.id::text, x.created_at, 'request', x.title, '/requests/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', case when x.is_draft then 'draft' else 'published' end, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.prompt_requests x where x.author_id = p_user_id and x.deleted_at is null
      union all select x.id::text, x.created_at, 'workflow', x.title, '/workflows/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_types[1], 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.workflows x where x.creator_id = p_user_id
      union all select x.id::text, x.created_at, 'preset', x.title, '/presets/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.presets x where x.creator_id = p_user_id
      union all select x.id::text, x.created_at, 'skill', x.title, '/skills/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.summary, ''), 240), 'content_type', null::text, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.skills x where x.author_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'comments' then
    return query
    select c.id::text, c.created_at,
      (case when c.prompt_id is not null then 'prompt' when c.request_id is not null then 'request'
            when c.workflow_id is not null then 'workflow' when c.preset_id is not null then 'preset'
            when c.skill_id is not null then 'skill' else 'result' end)::text,
      coalesce(c.body, ''),
      coalesce('/prompts/local?id=' || c.prompt_id, '/requests/local?id=' || c.request_id,
               '/workflows/local?id=' || c.workflow_id, '/presets/local?id=' || c.preset_id, '/skills/local?id=' || c.skill_id),
      jsonb_build_object('target_title', coalesce(p.title, r.title, w.title, ps.title, sk.title), 'is_reply', c.parent_id is not null,
                         'deleted', c.deleted_at is not null, 'likes', c.like_count)
    from public.prompt_comments c
    left join public.prompts p on p.id = c.prompt_id left join public.prompt_requests r on r.id = c.request_id
    left join public.workflows w on w.id = c.workflow_id
    left join public.presets ps on ps.id = c.preset_id
    left join public.skills sk on sk.id = c.skill_id
    where c.author_id = p_user_id and (p_before is null or c.created_at < p_before)
    order by c.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'likes' then
    return query select q.* from (
      select l.id::text, l.created_at,
        (case when l.prompt_id is not null then 'prompt' when l.request_id is not null then 'request'
              when l.workflow_id is not null then 'workflow' when l.preset_id is not null then 'preset'
              when l.skill_id is not null then 'skill' else 'result' end)::text,
        coalesce(p.title, r.title, w.title, ps.title, sk.title, ''),
        coalesce('/prompts/local?id=' || l.prompt_id, '/requests/local?id=' || l.request_id,
                 '/workflows/local?id=' || l.workflow_id, '/presets/local?id=' || l.preset_id, '/skills/local?id=' || l.skill_id),
        '{}'::jsonb
      from public.prompt_likes l
      left join public.prompts p on p.id = l.prompt_id left join public.prompt_requests r on r.id = l.request_id
      left join public.workflows w on w.id = l.workflow_id
      left join public.presets ps on ps.id = l.preset_id
      left join public.skills sk on sk.id = l.skill_id
      where l.user_id = p_user_id
      union all
      select cl.comment_id::text, cl.created_at, 'comment'::text, left(coalesce(c.body, ''), 240), null::text,
        jsonb_build_object('comment_author', ca.username)
      from public.comment_likes cl join public.prompt_comments c on c.id = cl.comment_id left join public.profiles ca on ca.id = c.author_id
      where cl.user_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'saves' then
    return query
    select ci.id::text, ci.created_at,
      (case when ci.prompt_id is not null then 'prompt' when ci.workflow_id is not null then 'workflow'
            when ci.skill_id is not null then 'skill' else 'preset' end)::text,
      coalesce(p.title, w.title, ps.title, sk.title, ''),
      coalesce('/prompts/local?id=' || ci.prompt_id, '/workflows/local?id=' || ci.workflow_id, '/presets/local?id=' || ci.preset_id, '/skills/local?id=' || ci.skill_id),
      jsonb_build_object('collection', c.name, 'collection_visibility', c.visibility)
    from public.collection_items ci join public.collections c on c.id = ci.collection_id
    left join public.prompts p on p.id = ci.prompt_id
    left join public.workflows w on w.id = ci.workflow_id left join public.presets ps on ps.id = ci.preset_id
    left join public.skills sk on sk.id = ci.skill_id
    where c.owner_id = p_user_id and (p_before is null or ci.created_at < p_before)
    order by ci.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'follows' then
    return query select q.* from (
      select f.following_id::text, f.created_at, 'following'::text, coalesce(u.display_name, u.username), '/profile/real?username=' || u.username,
        jsonb_build_object('username', u.username)
        from public.follows f join public.profiles u on u.id = f.following_id where f.follower_id = p_user_id
      union all
      select f.follower_id::text, f.created_at, 'follower'::text, coalesce(u.display_name, u.username), '/profile/real?username=' || u.username,
        jsonb_build_object('username', u.username)
        from public.follows f join public.profiles u on u.id = f.follower_id where f.following_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'reports' then
    return query
    select r.id::text, r.created_at, r.target_type, r.reason, null::text,
      jsonb_build_object('status', r.status, 'resolution', r.resolution_note)
    from public.reports r where r.reporter_id = p_user_id and (p_before is null or r.created_at < p_before)
    order by r.created_at desc limit greatest(least(p_limit, 200), 1);
  else
    raise exception 'Geçersiz etkinlik türü.';
  end if;
end $function$;
