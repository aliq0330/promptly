-- Topluluklar — OKUMA RPC'leri, istatistik, geçiş raporu ve sohbette @anma bildirimi (docs/history/175-*).
-- Şema: 20260920040000_communities_schema.sql · yazma yolu: 20260920050000_communities_functions.sql.
-- Yalnızca ekleyici; aynı imzalı `create or replace` yok (hepsi yeni fonksiyon/tetikleyici).

-- ============================================================================
-- 1. Keşif ve listeler
-- ============================================================================

-- Keşif: YALNIZ herkese açık ve kapatılmamış topluluklar. Çağıranın yasaklı olduğu ve sahibiyle engel ilişkisi olan topluluklar
-- listelenmez. Kapalı topluluğun adı/açıklaması/üyesi/gönderisi hiçbir koşulda bu listeye girmez.
-- Sayfalama: limit (≤ 50) + offset (≤ 2000); sıralama: popular | newest | active (son sohbet ya da gönderi).
create or replace function public.discover_communities(
  p_query text default null,
  p_sort text default 'popular',
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(btrim(left(coalesce(p_query, ''), 100)), '') as term
  )
  select g.id, g.name, g.description, g.avatar_url, g.category, g.member_count, g.member_limit, g.post_count,
         (select count(*)::integer from public.community_events e
           where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) as upcoming_event_count,
         g.rules_required, g.created_at,
         greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) as last_activity_at,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end as my_status
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    cross join q
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where auth.uid() is not null
     and g.visibility = 'public'
     and g.closed_at is null
     and (p_category is null or g.category = p_category)
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       q.term is null
       or g.name ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or g.description ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by
     case when p_sort = 'newest' then extract(epoch from g.created_at) end desc nulls last,
     case when p_sort = 'active' then extract(epoch from greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id))) end desc nulls last,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- Benim topluluklarım. p_scope: 'member' (üyesi olduklarım) | 'managed' (owner/admin/moderatör olduklarım) | 'bookmarked' (yer imlerim;
-- yalnız hâlâ okuyabildiklerim). Yalnız kendi üyeliğim/yer imim üzerinden: başkasının listesi görülmez.
create or replace function public.list_my_communities(
  p_scope text default 'member',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, closed boolean, created_at timestamptz, last_activity_at timestamptz,
  my_role text, unread_count integer, pending_request_count integer, bookmarked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit, g.post_count,
         (select count(*)::integer from public.community_events e
           where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) as upcoming_event_count,
         g.closed_at is not null as closed, g.created_at,
         greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) as last_activity_at,
         m.role as my_role,
         coalesce(m.unread_count, 0) as unread_count,
         case when m.user_id is not null and public._group_can(g.id, auth.uid(), 'manage_requests') then g.pending_request_count else 0 end as pending_request_count,
         exists (select 1 from public.community_bookmarks b where b.user_id = auth.uid() and b.community_id = g.id) as bookmarked
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
   where auth.uid() is not null
     and (
       (p_scope = 'member' and m.user_id is not null)
       or (p_scope = 'managed' and m.role in ('owner', 'admin', 'moderator'))
       or (p_scope = 'bookmarked' and exists (select 1 from public.community_bookmarks b where b.user_id = auth.uid() and b.community_id = g.id)
           and public.can_read_community(g.id))
     )
   order by greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) desc nulls last,
            g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 30), 100), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- Üye listesi (yalnız topluluğun üyeleri görür): isteğe bağlı arama + rol süzgeci, rol sırası → katılma zamanı.
create or replace function public.community_members(
  p_group_id uuid,
  p_search text default null,
  p_role text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, m.role, m.joined_at
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = p_group_id
     and exists (select 1 from public.conversation_members me where me.conversation_id = p_group_id and me.user_id = auth.uid())
     and (p_role is null or m.role = p_role)
     and (
       nullif(btrim(coalesce(p_search, '')), '') is null
       or p.username ilike '%' || replace(replace(replace(btrim(left(p_search, 60)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or p.display_name ilike '%' || replace(replace(replace(btrim(left(p_search, 60)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by public.chat_group_role_rank(m.role) desc, m.joined_at, p.id
   limit greatest(least(coalesce(p_limit, 30), 100), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- ============================================================================
-- 2. İstatistik (yalnız `view_stats` yetkisi; tamamı gerçek veriden, toplulaştırılmış; mesaj İÇERİĞİ hiçbir yerde okunmaz)
-- ============================================================================

create or replace function public.community_stats(p_group_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_days integer := greatest(least(coalesce(p_days, 30), 90), 7);
  v_since timestamptz;
  v_joined integer;
  v_left integer;
  v_likes integer;
  v_comments integer;
  v_series jsonb;
begin
  select * into g from public.chat_groups where id = p_group_id;
  if not found or not coalesce(public._group_can(p_group_id, v_actor, 'view_stats'), false) then
    raise exception 'forbidden';
  end if;
  v_since := date_trunc('day', now()) - make_interval(days => v_days - 1);

  select count(*) into v_joined from public.conversation_members where conversation_id = p_group_id and joined_at >= v_since;
  select count(*) into v_left from public.chat_group_audit
   where group_id = p_group_id and created_at >= v_since and action in ('member_left', 'member_removed', 'member_banned');

  -- Paylaşılan içeriklerin dönemdeki beğeni/yorum etkileşimi (içeriğin kendi tabloları; topluluk dışından gelenler de sayılır).
  select coalesce(sum(n), 0) into v_likes from (
    select count(*) as n from public.community_posts p join public.prompt_likes l on l.prompt_id = p.prompt_id where p.community_id = p_group_id and l.created_at >= v_since
    union all select count(*) from public.community_posts p join public.prompt_likes l on l.request_id = p.request_id where p.community_id = p_group_id and l.created_at >= v_since
    union all select count(*) from public.community_posts p join public.prompt_likes l on l.workflow_id = p.workflow_id where p.community_id = p_group_id and l.created_at >= v_since
    union all select count(*) from public.community_posts p join public.prompt_likes l on l.preset_id = p.preset_id where p.community_id = p_group_id and l.created_at >= v_since
  ) s;
  select coalesce(sum(n), 0) into v_comments from (
    select count(*) as n from public.community_posts p join public.prompt_comments c on c.prompt_id = p.prompt_id where p.community_id = p_group_id and c.created_at >= v_since and c.deleted_at is null
    union all select count(*) from public.community_posts p join public.prompt_comments c on c.request_id = p.request_id where p.community_id = p_group_id and c.created_at >= v_since and c.deleted_at is null
    union all select count(*) from public.community_posts p join public.prompt_comments c on c.workflow_id = p.workflow_id where p.community_id = p_group_id and c.created_at >= v_since and c.deleted_at is null
    union all select count(*) from public.community_posts p join public.prompt_comments c on c.preset_id = p.preset_id where p.community_id = p_group_id and c.created_at >= v_since and c.deleted_at is null
  ) s;

  -- Günlük seri: yeni üye, gönderi, sohbet mesajı SAYISI (içerik/gönderen yok).
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'joined', coalesce(j.n, 0), 'posts', coalesce(p.n, 0), 'messages', coalesce(m.n, 0)) order by d.day), '[]'::jsonb)
    into v_series
    from generate_series(v_since::date, now()::date, interval '1 day') as d(day)
    left join (select joined_at::date as day, count(*) as n from public.conversation_members where conversation_id = p_group_id and joined_at >= v_since group by 1) j on j.day = d.day::date
    left join (select created_at::date as day, count(*) as n from public.community_posts where community_id = p_group_id and created_at >= v_since group by 1) p on p.day = d.day::date
    left join (select created_at::date as day, count(*) as n from public.messages where conversation_id = p_group_id and deleted_at is null and created_at >= v_since group by 1) m on m.day = d.day::date;

  return jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'members', jsonb_build_object('total', g.member_count, 'joined', v_joined, 'left', v_left, 'net', v_joined - v_left),
    'posts', jsonb_build_object(
      'total', g.post_count,
      'in_period', (select count(*) from public.community_posts where community_id = p_group_id and created_at >= v_since),
      'authors_in_period', (select count(distinct author_id) from public.community_posts where community_id = p_group_id and created_at >= v_since)
    ),
    'engagement', jsonb_build_object('likes', v_likes, 'comments', v_comments),
    'events', jsonb_build_object(
      'total', (select count(*) from public.community_events where community_id = p_group_id),
      'upcoming', (select count(*) from public.community_events where community_id = p_group_id and status = 'scheduled' and starts_at > now()),
      'in_period', (select count(*) from public.community_events where community_id = p_group_id and starts_at >= v_since and starts_at <= now() and status = 'scheduled'),
      'going_in_period', (select coalesce(sum(going_count), 0) from public.community_events where community_id = p_group_id and starts_at >= v_since and starts_at <= now() and status = 'scheduled'),
      'going_upcoming', (select coalesce(sum(going_count), 0) from public.community_events where community_id = p_group_id and status = 'scheduled' and starts_at > now())
    ),
    'chat', jsonb_build_object(
      'messages_in_period', (select count(*) from public.messages where conversation_id = p_group_id and deleted_at is null and created_at >= v_since),
      'active_senders_in_period', (select count(distinct sender_id) from public.messages where conversation_id = p_group_id and deleted_at is null and created_at >= v_since)
    ),
    'queue', jsonb_build_object(
      'pending_requests', g.pending_request_count,
      'pending_invitations', (select count(*) from public.chat_group_invitations where group_id = p_group_id and status = 'pending' and expires_at > now()),
      'open_reports', (select count(*) from public.community_reports where community_id = p_group_id and status = 'open')
    ),
    'series', v_series
  );
end;
$$;

-- ============================================================================
-- 3. Eski grup sohbetlerinin geçiş raporu (salt okunur; yalnız site moderatörü)
-- ============================================================================

-- Eski grup sohbetleri ayrı bir yere TAŞINMAZ: aynı satırlar zaten topluluktur (kimlik eşlemesi özdeşliktir). Bu rapor eşlemenin
-- tutarlılığını sayılarla ve olası tutarsızlık listeleriyle gösterir; hiçbir veri değiştirmez, silmez.
create or replace function public.community_migration_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'groups', (select count(*) from public.chat_groups),
      'legacy_groups', (select count(*) from public.chat_groups where origin = 'legacy_group'),
      'native_communities', (select count(*) from public.chat_groups where origin = 'native'),
      'public', (select count(*) from public.chat_groups where visibility = 'public'),
      'private', (select count(*) from public.chat_groups where visibility = 'private'),
      'closed', (select count(*) from public.chat_groups where closed_at is not null),
      'group_conversations', (select count(*) from public.conversations where kind = 'group'),
      'memberships', (select count(*) from public.conversation_members m join public.conversations c on c.id = m.conversation_id where c.kind = 'group'),
      'group_messages', (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.kind = 'group'),
      'legacy_group_messages', (select count(*) from public.messages m join public.chat_groups g on g.id = m.conversation_id where g.origin = 'legacy_group')
    ),
    'anomalies', jsonb_build_object(
      'group_conversations_without_group_row', (
        select coalesce(jsonb_agg(c.id), '[]'::jsonb) from (
          select c.id from public.conversations c where c.kind = 'group' and not exists (select 1 from public.chat_groups g where g.id = c.id) limit 50
        ) c
      ),
      'group_rows_on_direct_conversations', (
        select coalesce(jsonb_agg(g.id), '[]'::jsonb) from (
          select g.id from public.chat_groups g join public.conversations c on c.id = g.id where c.kind <> 'group' limit 50
        ) g
      ),
      'groups_without_owner', (
        select coalesce(jsonb_agg(g.id), '[]'::jsonb) from (
          select g.id from public.chat_groups g
           where not exists (select 1 from public.conversation_members m where m.conversation_id = g.id and m.role = 'owner') limit 50
        ) g
      ),
      'member_count_mismatch', (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'stored', x.stored, 'actual', x.actual)), '[]'::jsonb) from (
          select g.id, g.member_count as stored, (select count(*) from public.conversation_members m where m.conversation_id = g.id) as actual
            from public.chat_groups g
           where g.member_count <> (select count(*) from public.conversation_members m where m.conversation_id = g.id) limit 50
        ) x
      ),
      'pending_request_count_mismatch', (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'stored', x.stored, 'actual', x.actual)), '[]'::jsonb) from (
          select g.id, g.pending_request_count as stored,
                 (select count(*) from public.chat_group_join_requests r where r.group_id = g.id and r.status = 'pending') as actual
            from public.chat_groups g
           where g.pending_request_count <> (select count(*) from public.chat_group_join_requests r where r.group_id = g.id and r.status = 'pending') limit 50
        ) x
      ),
      'post_count_mismatch', (
        select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'stored', x.stored, 'actual', x.actual)), '[]'::jsonb) from (
          select g.id, g.post_count as stored, (select count(*) from public.community_posts p where p.community_id = g.id) as actual
            from public.chat_groups g
           where g.post_count <> (select count(*) from public.community_posts p where p.community_id = g.id) limit 50
        ) x
      ),
      'groups_over_member_limit', (
        select coalesce(jsonb_agg(g.id), '[]'::jsonb) from (
          select g.id from public.chat_groups g where g.member_count > g.member_limit limit 50
        ) g
      )
    )
  );
end;
$$;

-- ============================================================================
-- 4. Topluluk sohbetinde @anma bildirimi (mesaj başına değil, yalnız anılana)
-- ============================================================================

-- `@kullaniciadi` ile anılan ve topluluğun ÜYESİ olan kişiye önemli düzeyde bildirim. Gönderen, engel ilişkisindeki kişi, üye
-- olmayan ve var olmayan kullanıcı için üretilmez; en çok 5 anma; aynı mesaj/kişi için tek bildirim (dedupe_key). Bildirim metni
-- mesaj içeriği taşımaz (yetkisiz içerik sızmaz). Bağlantılı duyuru mesajları anma sayılmaz.
create or replace function public.notify_community_chat_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
  v_name text;
  v_user uuid;
  v_group_name text;
begin
  if new.body is null or new.deleted_at is not null or new.announcement_id is not null then
    return new;
  end if;
  select g.name into v_group_name from public.chat_groups g where g.id = new.conversation_id;
  if not found then
    return new;
  end if;
  v_names := public.extract_mentioned_usernames(new.body, 5);
  if coalesce(array_length(v_names, 1), 0) = 0 then
    return new;
  end if;
  foreach v_name in array v_names loop
    select p.id into v_user
      from public.profiles p
      join public.conversation_members m on m.conversation_id = new.conversation_id and m.user_id = p.id
     where p.username = v_name and p.id <> new.sender_id;
    if v_user is not null and not public.is_blocked(new.sender_id, v_user) then
      perform public._community_notify(
        v_user, new.sender_id, new.conversation_id, 'important',
        'Seni "' || public.truncate_preview(v_group_name, 60) || '" topluluğunun sohbetinde andı.',
        '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id,
        'cmention:' || new.id || ':' || v_user
      );
    end if;
    v_user := null;
  end loop;
  return new;
end;
$$;

create trigger messages_notify_community_mentions
  after insert on public.messages
  for each row execute function public.notify_community_chat_mentions();

-- ============================================================================
-- 5. EXECUTE yetkileri
-- ============================================================================

revoke execute on function public.notify_community_chat_mentions() from public, anon, authenticated;
revoke execute on function public.discover_communities(text, text, text, integer, integer) from public, anon;
revoke execute on function public.list_my_communities(text, integer, integer) from public, anon;
revoke execute on function public.community_members(uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.community_stats(uuid, integer) from public, anon;
revoke execute on function public.community_migration_report() from public, anon;
grant execute on function public.discover_communities(text, text, text, integer, integer) to authenticated;
grant execute on function public.list_my_communities(text, integer, integer) to authenticated;
grant execute on function public.community_members(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.community_stats(uuid, integer) to authenticated;
grant execute on function public.community_migration_report() to authenticated;
