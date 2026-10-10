-- Moderatör konsolu (CLAUDE.md Bölüm 9.140): site istatistikleri, kullanıcı
-- yönetimi, kullanıcı etkinlik dökümü, paylaşım engeli, geçici askıya alma,
-- hesap silme ve denetim kaydı.
--
-- Tüm RPC'ler SECURITY DEFINER + `_admin_guard()` (is_moderator) ile korunur;
-- istemciden hiçbir tabloya doğrudan yazma/okuma yetkisi eklenmedi. Özel
-- mesaj içeriği ve hesap işlemleri `admin_audit_log`'a kaydedilir.

-- --- 1. Profil alanları ----------------------------------------------------
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists posting_blocked boolean not null default false;
alter table public.profiles add column if not exists posting_block_reason text;

-- İstemci (auth.uid() dolu) rol/askı/engel alanlarını değiştiremez; moderatör
-- RPC'leri `app.admin_action` ayarıyla bu korumayı bilinçli olarak geçer.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.admin_action', true), '') <> '1' and (
       new.role is distinct from old.role
    or new.suspended_until is distinct from old.suspended_until
    or new.suspended_reason is distinct from old.suspended_reason
    or new.posting_blocked is distinct from old.posting_blocked
    or new.posting_block_reason is distinct from old.posting_block_reason
  ) then
    raise exception 'Bu alan değiştirilemez.';
  end if;
  return new;
end $$;

-- --- 2. Denetim kaydı ---------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  moderator_username text,
  action text not null,
  target_user_id uuid,
  target_username text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_user_id, created_at desc);
alter table public.admin_audit_log enable row level security;
-- Politika yok: yalnızca aşağıdaki SECURITY DEFINER fonksiyonlar okur/yazar.

create or replace function public._admin_guard()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
end $$;
revoke all on function public._admin_guard() from public, anon, authenticated;

create or replace function public._admin_log(p_action text, p_target uuid, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_log (moderator_id, moderator_username, action, target_user_id, target_username, details)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), p_action, p_target,
          (select username from public.profiles where id = p_target), coalesce(p_details, '{}'::jsonb));
end $$;
revoke all on function public._admin_log(text, uuid, jsonb) from public, anon, authenticated;

-- --- 3. Paylaşım engeli / askıya alma uygulaması --------------------------------
-- Askıdaki kullanıcı hiçbir şey yazamaz; paylaşım engelli kullanıcı içerik
-- (gönderi/yorum/sonuç) oluşturamaz. Mesajlaşma yalnızca askıda engellenir.
create or replace function public.enforce_can_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.profiles;
begin
  if auth.uid() is null then return new; end if;
  select * into v from public.profiles where id = auth.uid();
  if not found then return new; end if;
  if v.suspended_until is not null and v.suspended_until > now() then
    raise exception 'Hesabın geçici olarak askıya alındı.';
  end if;
  if tg_argv[0] = 'content' and v.posting_blocked then
    raise exception 'Hesabın için paylaşım yapma yetkisi kısıtlandı.';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prompts','prompt_requests','generators','workflows','presets','prompt_comments','prompt_results'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_enforce_can_post' and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger %I before insert on public.%I for each row execute function public.enforce_can_post(''content'')', t || '_enforce_can_post', t);
    end if;
  end loop;
  foreach t in array array['messages','prompt_likes','follows','collection_items'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_enforce_can_post' and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger %I before insert on public.%I for each row execute function public.enforce_can_post(''all'')', t || '_enforce_can_post', t);
    end if;
  end loop;
end $$;

-- --- 4. Depolama yardımcısı ---------------------------------------------------------
-- Her nesnenin sahibi yoldan çıkarılır (mesaj fotoğraflarında 2. klasör, diğerlerinde 1.).
create or replace function public._storage_objects()
returns table (owner_id uuid, bucket text, name text, mime text, size bigint, kind text, created_at timestamptz)
language sql stable security definer set search_path = public, storage as $$
  select
    case when seg ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then seg::uuid end,
    o.bucket_id, o.name, coalesce(o.metadata->>'mimetype', ''), coalesce((o.metadata->>'size')::bigint, 0),
    case when coalesce(o.metadata->>'mimetype', '') like 'image/%' then 'image'
         when coalesce(o.metadata->>'mimetype', '') like 'video/%' then 'video'
         when coalesce(o.metadata->>'mimetype', '') like 'audio/%' then 'audio'
         else 'other' end,
    o.created_at
  from storage.objects o
  cross join lateral (select split_part(o.name, '/', case when o.bucket_id = 'message-images' then 2 else 1 end) as seg) s
$$;
revoke all on function public._storage_objects() from public, anon, authenticated;

-- --- 5. Site istatistikleri ----------------------------------------------------------
create or replace function public.admin_site_stats(p_content_type text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform public._admin_guard();
  select jsonb_build_object(
    'users', (select jsonb_build_object(
        'total', count(*),
        'new_7d', count(*) filter (where created_at > now() - interval '7 days'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days'),
        'suspended', count(*) filter (where suspended_until > now()),
        'posting_blocked', count(*) filter (where posting_blocked),
        'moderators', count(*) filter (where role = 'moderator')) from public.profiles),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'content', jsonb_build_object(
      'prompts', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.prompts where deleted_at is null and (p_content_type is null or content_type = p_content_type)),
      'requests', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where not is_draft),
          'draft', count(*) filter (where is_draft), 'private', count(*) filter (where visibility = 'private'))
        from public.prompt_requests where deleted_at is null and (p_content_type is null or content_type = p_content_type)),
      'generators', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.generators where (p_content_type is null or content_type = p_content_type)),
      'workflows', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.workflows where (p_content_type is null or p_content_type = any (content_types))),
      'presets', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.presets where (p_content_type is null or content_type = p_content_type))
    ),
    'by_type', (select jsonb_object_agg(t.ct, jsonb_build_object(
        'prompts', (select count(*) from public.prompts where deleted_at is null and content_type = t.ct),
        'requests', (select count(*) from public.prompt_requests where deleted_at is null and content_type = t.ct),
        'generators', (select count(*) from public.generators where content_type = t.ct),
        'workflows', (select count(*) from public.workflows where t.ct = any (content_types)),
        'presets', (select count(*) from public.presets where content_type = t.ct)))
      from (values ('image'), ('text'), ('audio'), ('video')) t (ct)),
    'engagement', jsonb_build_object(
      'comments', (select count(*) from public.prompt_comments where deleted_at is null),
      'likes', (select count(*) from public.prompt_likes) + (select count(*) from public.comment_likes),
      'saves', (select count(*) from public.collection_items),
      'follows', (select count(*) from public.follows),
      'conversations', (select count(*) from public.conversations),
      'messages', (select count(*) from public.messages),
      'results', (select count(*) from public.prompt_results),
      'reports_open', (select count(*) from public.reports where status = 'open')),
    'storage', jsonb_build_object(
      'total_bytes', (select coalesce(sum(size), 0) from public._storage_objects()),
      'total_files', (select count(*) from public._storage_objects()),
      'by_bucket', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
        from (select bucket, count(*) n, sum(size) b from public._storage_objects() group by bucket) x),
      'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
        from (select kind, count(*) n, sum(size) b from public._storage_objects() group by kind) x)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'posts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') d
      left join (
        select created_at::date as day, count(*) n from (
          select created_at from public.prompts where deleted_at is null and status = 'published' and (p_content_type is null or content_type = p_content_type)
          union all select created_at from public.prompt_requests where deleted_at is null and not is_draft and (p_content_type is null or content_type = p_content_type)
          union all select created_at from public.generators where status = 'published' and (p_content_type is null or content_type = p_content_type)
          union all select created_at from public.workflows where status = 'published' and (p_content_type is null or p_content_type = any (content_types))
          union all select created_at from public.presets where status = 'published' and (p_content_type is null or content_type = p_content_type)
        ) u group by 1) c on c.day = d::date)
  ) into r;
  return r;
end $$;
grant execute on function public.admin_site_stats(text) to authenticated;

-- --- 6. Kullanıcı listesi / özeti -----------------------------------------------------
create or replace function public.admin_users(
  p_query text default null, p_content_type text default null, p_sort text default 'newest',
  p_status text default 'all', p_limit int default 30, p_offset int default 0, p_user_id uuid default null)
returns table (
  id uuid, username text, display_name text, avatar_url text, bio text, email text, role text,
  created_at timestamptz, last_sign_in_at timestamptz,
  suspended_until timestamptz, suspended_reason text, posting_blocked boolean, posting_block_reason text,
  prompts_n int, requests_n int, generators_n int, workflows_n int, presets_n int, posts_total int,
  comments_n int, likes_given_n int, likes_received_n int, saves_n int, followers_n int, following_n int,
  messages_n int, conversations_n int, reports_filed_n int, reports_against_n int,
  storage_files int, storage_bytes bigint, image_bytes bigint, video_bytes bigint, audio_bytes bigint,
  total_count bigint)
language plpgsql stable security definer set search_path = public as $$
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
      (select count(*) from public.generators x where x.creator_id = p.id and (p_content_type is null or x.content_type = p_content_type))::int as generators_n,
      (select count(*) from public.workflows x where x.creator_id = p.id and (p_content_type is null or p_content_type = any (x.content_types)))::int as workflows_n,
      (select count(*) from public.presets x where x.creator_id = p.id and (p_content_type is null or x.content_type = p_content_type))::int as presets_n,
      (select count(*) from public.prompt_comments c where c.author_id = p.id and c.deleted_at is null)::int as comments_n,
      ((select count(*) from public.prompt_likes l where l.user_id = p.id) + (select count(*) from public.comment_likes l where l.user_id = p.id))::int as likes_given_n,
      ((select coalesce(sum(like_count), 0) from public.prompts x where x.author_id = p.id and x.deleted_at is null)
       + (select coalesce(sum(like_count), 0) from public.prompt_requests x where x.author_id = p.id and x.deleted_at is null)
       + (select coalesce(sum(like_count), 0) from public.generators x where x.creator_id = p.id)
       + (select coalesce(sum(like_count), 0) from public.workflows x where x.creator_id = p.id)
       + (select coalesce(sum(like_count), 0) from public.presets x where x.creator_id = p.id))::int as likes_received_n,
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
    select b.*, (b.prompts_n + b.requests_n + b.generators_n + b.workflows_n + b.presets_n) as posts_total from base b
  )
  select f.id, f.username, f.display_name, f.avatar_url, f.bio, f.email, f.role, f.created_at, f.last_sign_in_at,
    f.suspended_until, f.suspended_reason, f.posting_blocked, f.posting_block_reason,
    f.prompts_n, f.requests_n, f.generators_n, f.workflows_n, f.presets_n, f.posts_total,
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
end $$;
grant execute on function public.admin_users(text, text, text, text, int, int, uuid) to authenticated;

-- --- 7. Kullanıcının yüklediği dosyalar ---------------------------------------------------
create or replace function public.admin_user_files(p_user_id uuid, p_limit int default 100)
returns table (bucket text, name text, mime text, size bigint, kind text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_guard();
  return query
  select s.bucket, s.name, s.mime, s.size, s.kind, s.created_at
  from public._storage_objects() s where s.owner_id = p_user_id
  order by s.size desc, s.created_at desc limit greatest(least(p_limit, 500), 1);
end $$;
grant execute on function public.admin_user_files(uuid, int) to authenticated;

-- --- 8. Etkinlik dökümü ---------------------------------------------------------------------
-- p_kind: posts | comments | likes | saves | follows | reports
create or replace function public.admin_user_activity(p_user_id uuid, p_kind text, p_limit int default 40, p_before timestamptz default null)
returns table (id text, created_at timestamptz, label text, body text, href text, meta jsonb)
language plpgsql stable security definer set search_path = public as $$
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
      union all select x.id::text, x.created_at, 'generator', x.title, '/generators/local?slug=' || x.slug,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.generators x where x.creator_id = p_user_id
      union all select x.id::text, x.created_at, 'workflow', x.title, '/workflows/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_types[1], 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.workflows x where x.creator_id = p_user_id
      union all select x.id::text, x.created_at, 'preset', x.title, '/presets/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.presets x where x.creator_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'comments' then
    return query
    select c.id::text, c.created_at,
      (case when c.prompt_id is not null then 'prompt' when c.request_id is not null then 'request' when c.generator_id is not null then 'generator'
            when c.workflow_id is not null then 'workflow' when c.preset_id is not null then 'preset' else 'result' end)::text,
      coalesce(c.body, ''),
      coalesce('/prompts/local?id=' || c.prompt_id, '/requests/local?id=' || c.request_id, '/generators/local?slug=' || g.slug,
               '/workflows/local?id=' || c.workflow_id, '/presets/local?id=' || c.preset_id),
      jsonb_build_object('target_title', coalesce(p.title, r.title, g.title, w.title, ps.title), 'is_reply', c.parent_id is not null,
                         'deleted', c.deleted_at is not null, 'likes', c.like_count)
    from public.prompt_comments c
    left join public.prompts p on p.id = c.prompt_id left join public.prompt_requests r on r.id = c.request_id
    left join public.generators g on g.id = c.generator_id left join public.workflows w on w.id = c.workflow_id
    left join public.presets ps on ps.id = c.preset_id
    where c.author_id = p_user_id and (p_before is null or c.created_at < p_before)
    order by c.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'likes' then
    return query select q.* from (
      select l.id::text, l.created_at,
        (case when l.prompt_id is not null then 'prompt' when l.request_id is not null then 'request' when l.generator_id is not null then 'generator'
              when l.workflow_id is not null then 'workflow' when l.preset_id is not null then 'preset' else 'result' end)::text,
        coalesce(p.title, r.title, g.title, w.title, ps.title, ''),
        coalesce('/prompts/local?id=' || l.prompt_id, '/requests/local?id=' || l.request_id, '/generators/local?slug=' || g.slug,
                 '/workflows/local?id=' || l.workflow_id, '/presets/local?id=' || l.preset_id),
        '{}'::jsonb
      from public.prompt_likes l
      left join public.prompts p on p.id = l.prompt_id left join public.prompt_requests r on r.id = l.request_id
      left join public.generators g on g.id = l.generator_id left join public.workflows w on w.id = l.workflow_id
      left join public.presets ps on ps.id = l.preset_id
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
      (case when ci.prompt_id is not null then 'prompt' when ci.generator_id is not null then 'generator' when ci.workflow_id is not null then 'workflow' else 'preset' end)::text,
      coalesce(p.title, g.title, w.title, ps.title, ''),
      coalesce('/prompts/local?id=' || ci.prompt_id, '/generators/local?slug=' || g.slug, '/workflows/local?id=' || ci.workflow_id, '/presets/local?id=' || ci.preset_id),
      jsonb_build_object('collection', c.name, 'collection_visibility', c.visibility)
    from public.collection_items ci join public.collections c on c.id = ci.collection_id
    left join public.prompts p on p.id = ci.prompt_id left join public.generators g on g.id = ci.generator_id
    left join public.workflows w on w.id = ci.workflow_id left join public.presets ps on ps.id = ci.preset_id
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
end $$;
grant execute on function public.admin_user_activity(uuid, text, int, timestamptz) to authenticated;

-- --- 9. Özel mesajlar (her erişim denetim kaydına yazılır) -----------------------------------------------
create or replace function public.admin_user_conversations(p_user_id uuid)
returns table (conversation_id uuid, counterpart_id uuid, counterpart_username text, counterpart_display_name text,
  message_count bigint, last_message_at timestamptz, last_body text)
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_guard();
  perform public._admin_log('view_conversations', p_user_id);
  return query
  select cm.conversation_id, o.id, o.username, o.display_name,
    (select count(*) from public.messages m where m.conversation_id = cm.conversation_id),
    c.last_message_at,
    (select case when m.deleted_at is not null then null else coalesce(left(m.body, 160), case when jsonb_array_length(m.attachments) > 0 then '[fotoğraf]' else '[paylaşım]' end) end
       from public.messages m where m.conversation_id = cm.conversation_id order by m.created_at desc limit 1)
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.conversation_members ocm on ocm.conversation_id = cm.conversation_id and ocm.user_id <> p_user_id
  left join public.profiles o on o.id = ocm.user_id
  where cm.user_id = p_user_id
  order by c.last_message_at desc nulls last;
end $$;
grant execute on function public.admin_user_conversations(uuid) to authenticated;

create or replace function public.admin_conversation_messages(p_conversation_id uuid, p_user_id uuid, p_limit int default 300)
returns table (id uuid, sender_id uuid, sender_username text, body text, created_at timestamptz, edited_at timestamptz,
  deleted_at timestamptz, attachment_count int, shared_prompt_id uuid, shared_request_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_guard();
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = p_user_id) then
    raise exception 'Konuşma bulunamadı.';
  end if;
  perform public._admin_log('view_conversation', p_user_id, jsonb_build_object('conversation_id', p_conversation_id));
  return query
  select m.id, m.sender_id, u.username, m.body, m.created_at, m.edited_at, m.deleted_at,
    coalesce(jsonb_array_length(m.attachments), 0), m.shared_prompt_id, m.shared_request_id
  from public.messages m left join public.profiles u on u.id = m.sender_id
  where m.conversation_id = p_conversation_id
  order by m.created_at asc limit greatest(least(p_limit, 1000), 1);
end $$;
grant execute on function public.admin_conversation_messages(uuid, uuid, int) to authenticated;

create or replace function public.admin_user_audit(p_user_id uuid)
returns table (id uuid, moderator_username text, action text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_guard();
  return query select a.id, a.moderator_username, a.action, a.details, a.created_at
    from public.admin_audit_log a where a.target_user_id = p_user_id order by a.created_at desc limit 100;
end $$;
grant execute on function public.admin_user_audit(uuid) to authenticated;

-- --- 10. Yönetim işlemleri -------------------------------------------------------------------------------------
create or replace function public._admin_check_target(p_user_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform public._admin_guard();
  if p_user_id = auth.uid() then raise exception 'Kendi hesabına bu işlem uygulanamaz.'; end if;
  if (select role from public.profiles where id = p_user_id) = 'moderator' then
    raise exception 'Moderatör hesaplarına bu işlem uygulanamaz.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'Kullanıcı bulunamadı.'; end if;
end $$;
revoke all on function public._admin_check_target(uuid) from public, anon, authenticated;

create or replace function public.admin_set_posting_block(p_user_id uuid, p_blocked boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_check_target(p_user_id);
  perform set_config('app.admin_action', '1', true);
  update public.profiles set posting_blocked = p_blocked,
    posting_block_reason = case when p_blocked then nullif(btrim(coalesce(p_reason, '')), '') else null end
  where id = p_user_id;
  perform public._admin_log(case when p_blocked then 'block_posting' else 'unblock_posting' end, p_user_id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;
grant execute on function public.admin_set_posting_block(uuid, boolean, text) to authenticated;

-- p_until null → askıyı kaldırır. Giriş de engellenir (auth.users.banned_until); açık oturumun access token'ı
-- en geç ~1 saatte biter, o sürede yazma `enforce_can_post` ile zaten reddedilir.
create or replace function public.admin_suspend_user(p_user_id uuid, p_until timestamptz, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_check_target(p_user_id);
  if p_until is not null and p_until <= now() then raise exception 'Askı bitiş tarihi gelecekte olmalı.'; end if;
  perform set_config('app.admin_action', '1', true);
  update public.profiles set suspended_until = p_until,
    suspended_reason = case when p_until is not null then nullif(btrim(coalesce(p_reason, '')), '') else null end
  where id = p_user_id;
  update auth.users set banned_until = p_until where id = p_user_id;
  perform public._admin_log(case when p_until is not null then 'suspend' else 'unsuspend' end, p_user_id,
    jsonb_build_object('until', p_until, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;
grant execute on function public.admin_suspend_user(uuid, timestamptz, text) to authenticated;
