-- Arama: ekibe özgü içerik hiçbir aramada çıkmaz + "şu yazarlar hariç" süzgeci (docs/history/376-*). Ekleyicidir.
--
-- 1) `search_content` RLS'e güvenen bir INVOKER işlevidir (görünürlük süzgeci yok): ekibe özgü içerik ekip üyelerine RLS ile okunabilir olduğu için
--    açıkça `team_file_id is null` ile dışarıda bırakılır (topluluğa özgü içeriğin `community_id is null` kuralının ekip karşılığı).
-- 2) Ekip dosyası seçicisinin "Başkalarının paylaştıkları" sekmesi için yazar-hariç süzgeci YENİ imzayla eklenir (varsayılansız: argüman KÜMESİ
--    biçimi seçer, eski çağıranlar kırılmaz); eski 14 argümanlı imza bu işlevin ince sarmalayıcısı olur.

create or replace function public.search_content(p_kind text, p_query text, p_sort text, p_author_ids uuid[], p_content_types text[], p_content_type text, p_category text, p_subcategory text, p_tag_slugs text[], p_tool_refs text[], p_limit integer, p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid, p_exclude_author_ids uuid[])
 RETURNS TABLE(id uuid, created_at timestamp with time zone, sort_rank bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select least(greatest(coalesce(p_limit, 40), 1), 50) as lim,
           case
             when nullif(btrim(p_query), '') is null then null
             else '%' || replace(replace(replace(left(btrim(p_query), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as pat,
           (p_sort = 'oldest') as asc_order,
           (p_sort = 'popular') as popular,
           (p_sort in ('new', 'oldest')) as by_date,
           coalesce(cardinality(p_author_ids), 0) as n_authors,
           coalesce(cardinality(p_content_types), 0) as n_types,
           coalesce(cardinality(p_tag_slugs), 0) as n_tags,
           coalesce(cardinality(p_tool_refs), 0) as n_tools,
           coalesce(cardinality(p_exclude_author_ids), 0) as n_excl
  ),
  prompt_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where p_kind = 'prompt'
      and x.status = 'published' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat or x.prompt_text ilike pr.pat)
      and (pr.n_authors = 0 or x.author_id = any (p_author_ids))
      and (pr.n_excl = 0 or not (x.author_id = any (p_exclude_author_ids)))
      and (pr.n_types = 0 or x.content_type = any (p_content_types))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.prompt_tags t where t.prompt_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  ),
  request_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where p_kind = 'request'
      and not x.is_draft and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat or x.creative_direction ilike pr.pat)
      and (pr.n_authors = 0 or x.author_id = any (p_author_ids))
      and (pr.n_excl = 0 or not (x.author_id = any (p_exclude_author_ids)))
      and (pr.n_types = 0 or x.content_type = any (p_content_types))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.prompt_request_tags t where t.request_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  ),
  workflow_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where p_kind = 'workflow'
      and x.status = 'published' and x.community_id is null and x.team_file_id is null
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat)
      and (pr.n_authors = 0 or x.creator_id = any (p_author_ids))
      and (pr.n_excl = 0 or not (x.creator_id = any (p_exclude_author_ids)))
      -- a workflow chains several types: a type filter matches when it chains that type
      and ((pr.n_types = 0 and p_content_type is null)
           or x.content_types && (coalesce(p_content_types, '{}'::text[]) || coalesce(array[p_content_type], '{}'::text[])))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.workflow_tags t where t.workflow_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  ),
  preset_part as (
    -- presets keep their previous default: everything but an explicit "new"/"oldest" ranks by like_count
    select x.id, x.created_at,
           (case when pr.by_date then 0 else x.like_count end)::bigint as sort_rank
    from public.presets x, params pr
    where p_kind = 'preset'
      and x.status = 'published' and x.visibility = 'public' and x.team_file_id is null
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat)
      and (pr.n_authors = 0 or x.creator_id = any (p_author_ids))
      and (pr.n_excl = 0 or not (x.creator_id = any (p_exclude_author_ids)))
      and (pr.n_types = 0 or x.content_type = any (p_content_types))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.preset_tags t where t.preset_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.by_date then 0 else x.like_count end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  )
  select u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.asc_order then u.created_at end asc, case when pr.asc_order then u.id end asc,
           case when not pr.asc_order then u.created_at end desc, case when not pr.asc_order then u.id end desc
  limit (select lim from params);
$function$;

create or replace function public.search_content(p_kind text, p_query text DEFAULT NULL::text, p_sort text DEFAULT 'relevant'::text, p_author_ids uuid[] DEFAULT NULL::uuid[], p_content_types text[] DEFAULT NULL::text[], p_content_type text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_tag_slugs text[] DEFAULT NULL::text[], p_tool_refs text[] DEFAULT NULL::text[], p_limit integer DEFAULT 40, p_after_rank bigint DEFAULT NULL::bigint, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 returns table(id uuid, created_at timestamp with time zone, sort_rank bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select * from public.search_content(p_kind, p_query, p_sort, p_author_ids, p_content_types, p_content_type, p_category, p_subcategory,
                                      p_tag_slugs, p_tool_refs, p_limit, p_after_rank, p_after_created_at, p_after_id, null::uuid[]);
$function$;

-- Yetkiler: eski imzanın yetkileri korunur (canlıda anon + authenticated çalıştırır); yeni imza aynı.
grant execute on function public.search_content(text, text, text, uuid[], text[], text, text, text, text[], text[], integer, bigint, timestamptz, uuid, uuid[]) to anon, authenticated;
