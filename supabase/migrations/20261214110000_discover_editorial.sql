-- Keşfet editoryal açılışı (docs/history/451-*). YALNIZ EKLEYİCİ: dört yeni okuma fonksiyonu, `feed_page` DEĞİŞMEZ.
--   discover_weekly_stats    — son 7 günde paylaşılan prompt / workflow / Skill / istek sayısı (başlıktaki cümle).
--   discover_trending_topics — `trending_tags`'in iki haftalık sayıları + her etiketin kapağı için bir görselli prompt.
--   discover_rising_tools    — araç başına son 8 haftanın haftalık prompt sayısı (çizgi), toplam ve örnek promptlar.
--   feed_page_rising         — "Yükselen" sırası: son 7 günün beğeni + yorum + kaydetmesi, son 30 günde paylaşılmış içerikte.
-- Hepsi SECURITY INVOKER (RLS atlanmaz) ve `feed_page` ile aynı görünürlük koşulları: yayında + herkese açık + topluluğa/ekibe özgü değil.
-- Keşfet misafire de açık olduğu için anon da çalıştırır.

create or replace function public.discover_weekly_stats()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'prompts', (select count(*) from public.prompts x where x.created_at > now() - interval '7 days' and x.status = 'published'
                  and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null),
    'workflows', (select count(*) from public.workflows x where x.created_at > now() - interval '7 days' and x.status = 'published'
                  and x.visibility = 'public' and x.community_id is null and x.team_file_id is null),
    'skills', (select count(*) from public.skills x where x.created_at > now() - interval '7 days' and x.status = 'published' and x.visibility = 'public'),
    'requests', (select count(*) from public.prompt_requests x where x.created_at > now() - interval '7 days' and not x.is_draft
                  and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
  )
$$;

create or replace function public.discover_trending_topics(p_limit integer default 8)
returns table(slug text, label text, recent_count integer, previous_count integer, cover_prompt_id uuid)
language sql stable security invoker set search_path = public as $$
  select t.slug, t.label, t.recent_count::integer, t.previous_count::integer,
         (select x.id from public.prompts x
          join public.prompt_tags pt on pt.prompt_id = x.id and pt.tag_slug = t.slug
          where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
            and exists (select 1 from public.prompt_media pm where pm.prompt_id = x.id)
          order by x.like_count desc, x.created_at desc
          limit 1) as cover_prompt_id
  from public.trending_tags(least(greatest(coalesce(p_limit, 8), 1), 24), 7) t
$$;

create or replace function public.discover_rising_tools(p_limit integer default 4)
returns table(tool_id text, total integer, weeks integer[], growth numeric, sample_ids uuid[])
language sql stable security invoker set search_path = public as $$
  with uses as (
    select split_part(r, ':', 1) as tool_id, x.id, x.created_at
    from public.prompts x cross join lateral unnest(x.tools) r
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
  ),
  per_tool as (
    select u.tool_id, count(distinct u.id)::integer as total,
           array(select (select count(distinct u2.id) from uses u2
                         where u2.tool_id = u.tool_id
                           and u2.created_at > now() - make_interval(weeks => 8 - w)
                           and u2.created_at <= now() - make_interval(weeks => 7 - w))::integer
                 from generate_series(0, 7) w order by w) as weeks
    from uses u
    where u.tool_id <> ''
    group by u.tool_id
  )
  select p.tool_id, p.total, p.weeks,
         case when p.weeks[7] = 0 then (case when p.weeks[8] > 0 then 100 else 0 end)
              else round((p.weeks[8] - p.weeks[7])::numeric * 100 / p.weeks[7]) end as growth,
         array(select x.id from public.prompts x
               where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
                 and exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p.tool_id)
                 and exists (select 1 from public.prompt_media pm where pm.prompt_id = x.id)
               order by x.like_count desc, x.created_at desc limit 3) as sample_ids
  from per_tool p
  where p.weeks[5] + p.weeks[6] + p.weeks[7] + p.weeks[8] > 0
  order by (p.weeks[8] + p.weeks[7]) desc, p.total desc, p.tool_id
  limit least(greatest(coalesce(p_limit, 4), 1), 12)
$$;

-- "Yükselen": son 30 günde paylaşılmış içerik, son 7 günün etkileşimine göre (beğeni ×3, yorum ×2, kaydetme ×2). Keyset (puan, zaman, kimlik).
create or replace function public.feed_page_rising(
  p_limit integer default 18,
  p_after_rank bigint default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_kinds text[] default null,
  p_content_type text default null,
  p_category text default null,
  p_tool text default null
)
returns table(kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql stable security invoker set search_path = public as $$
  with week as (select now() - interval '7 days' as at),
  likes as (
    select coalesce(l.prompt_id, l.request_id, l.workflow_id, l.preset_id, l.skill_id) as tid, count(*) as n
    from public.prompt_likes l, week where l.created_at > week.at
      and coalesce(l.prompt_id, l.request_id, l.workflow_id, l.preset_id, l.skill_id) is not null
    group by 1
  ),
  comments as (
    select coalesce(c.prompt_id, c.request_id, c.workflow_id, c.preset_id, c.skill_id) as tid, count(*) as n
    from public.prompt_comments c, week where c.created_at > week.at
      and coalesce(c.prompt_id, c.request_id, c.workflow_id, c.preset_id, c.skill_id) is not null
    group by 1
  ),
  saves as (
    select coalesce(ci.prompt_id, ci.workflow_id, ci.preset_id, ci.skill_id) as tid, count(distinct co.owner_id) as n
    from public.collection_items ci join public.collections co on co.id = ci.collection_id, week
    where ci.created_at > week.at and coalesce(ci.prompt_id, ci.workflow_id, ci.preset_id, ci.skill_id) is not null
    group by 1
  ),
  scored as (
    select k.kind, k.id, k.created_at,
           (coalesce(l.n, 0) * 3 + coalesce(c.n, 0) * 2 + coalesce(s.n, 0) * 2)::bigint as sort_rank
    from (
      select 'prompt'::text as kind, x.id, x.created_at from public.prompts x
      where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
        and (x.origin_type = 'original' or x.show_on_profile)
        and (p_content_type is null or x.content_type = p_content_type) and (p_category is null or x.category = p_category)
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
        and x.created_at > now() - interval '30 days'
      union all
      select 'request', x.id, x.created_at from public.prompt_requests x
      where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
        and (p_content_type is null or x.content_type = p_content_type) and (p_category is null or x.category = p_category)
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
        and x.created_at > now() - interval '30 days'
      union all
      select 'workflow', x.id, x.created_at from public.workflows x
      where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and (p_content_type is null or p_content_type = any (x.content_types)) and (p_category is null or x.category = p_category)
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
        and x.created_at > now() - interval '30 days'
      union all
      select 'preset', x.id, x.created_at from public.presets x
      where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and (p_content_type is null or x.content_type = p_content_type) and (p_category is null or x.category = p_category)
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
        and x.created_at > now() - interval '30 days'
      union all
      select 'skill', x.id, x.created_at from public.skills x
      where x.status = 'published' and x.visibility = 'public' and p_content_type is null and p_category is null and p_tool is null
        and x.created_at > now() - interval '30 days'
    ) k
    left join likes l on l.tid = k.id
    left join comments c on c.tid = k.id
    left join saves s on s.tid = k.id
    where p_kinds is null or k.kind = any (p_kinds)
  )
  select s.kind, s.id, s.created_at, s.sort_rank
  from scored s
  where s.sort_rank > 0
    and (p_after_id is null or (s.sort_rank, s.created_at, s.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
  order by s.sort_rank desc, s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 18), 1), 50)
$$;

revoke all on function public.discover_weekly_stats() from public;
revoke all on function public.discover_trending_topics(integer) from public;
revoke all on function public.discover_rising_tools(integer) from public;
revoke all on function public.feed_page_rising(integer, bigint, timestamptz, uuid, text[], text, text, text) from public;
grant execute on function public.discover_weekly_stats() to anon, authenticated;
grant execute on function public.discover_trending_topics(integer) to anon, authenticated;
grant execute on function public.discover_rising_tools(integer) to anon, authenticated;
grant execute on function public.feed_page_rising(integer, bigint, timestamptz, uuid, text[], text, text, text) to anon, authenticated;
