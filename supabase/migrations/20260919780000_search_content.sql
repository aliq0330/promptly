-- Arama: gövde metni dahil + gerçek keyset sayfalama (tek SQL fonksiyonu).
--
-- Eskiden searchPrompts/searchRequests/searchWorkflows/searchPresets yalnızca
-- başlık + açıklamada ILIKE yapıyordu (prompt'un asıl metni `prompt_text`
-- aranmıyordu) ve "daha fazla" aynı sorguyu daha büyük bir limitle yeniden
-- çalıştırıyordu. PostgREST'te iki bağımsız `.or()` (metin eşleşmesi + imleç)
-- birleşimi belgelenmiş/doğrulanabilir bir davranışa sahip değildir
-- (pagination.ts'teki not); bu yüzden hem metin hem imleç koşulu burada, tek bir
-- SQL gövdesinde ve PARAMETRE olarak verilir — kullanıcı metni hiçbir filtre
-- dizesine birleştirilmez.
--
--   p_kind   'prompt' | 'request' | 'workflow' | 'preset'  (bir çağrı = bir tür)
--   p_query  serbest metin; başlık, açıklama ve türün gövde kolonunda ILIKE:
--              prompt   → title, description, prompt_text
--              request  → title, description, creative_direction
--              workflow → title, description        (satırda başka gövde kolonu yok)
--              preset   → title, description        (satırda başka gövde kolonu yok)
--            ILIKE jokerleri (% _ \) fonksiyonda kaçırılır; istemci ayrıca
--            taxonomy-query.ts `sanitizeSearchText` ile arındırır.
--   p_sort   'relevant' | 'new' | 'popular' | 'oldest'
--              new/relevant → created_at ↓ (preset: relevant → like_count ↓,
--              mevcut davranış korunur); popular → like_count ↓ (her türde;
--              "en çok beğenilen" etiketiyle ve ana sayfa akışıyla tutarlı),
--              sonra created_at ↓; oldest → created_at ↑
--   filtreler: yazarlar, içerik türleri, taksonomi, etiketler (HEPSİ — AND),
--              araçlar (herhangi biri — OR), mevcut `ContentSearchFilters` ile aynı.
--
-- Sıralama anahtarı (sort_rank, created_at, id) benzersizdir; istemci son
-- satırın üçlüsünü p_after_* olarak geri yollar ('oldest' için (created_at, id)
-- artan yönde karşılaştırılır). Yalnızca kimlik + anahtar döner; tam satırları
-- istemci mevcut select/mapper'larla çeker.
--
-- SECURITY INVOKER: tablo RLS'i çağıranın rolüyle işler (gizli içerik sızmaz,
-- yeni yetki yüzeyi yok). Görünürlük koşulları eski istemci sorgularıyla aynıdır
-- (yayımlanmış / taslak olmayan; RLS'in izin verdiği kadarı).
-- Not: metin eşleşmesi süzülmüş kümede sıralı tarama yapar; satır sayısı
-- büyüdüğünde title/description/prompt_text için pg_trgm GIN indeksi eklenebilir.

create or replace function public.search_content(
  p_kind text,
  p_query text default null,
  p_sort text default 'relevant',
  p_author_ids uuid[] default null,
  p_content_types text[] default null,
  p_content_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_tag_slugs text[] default null,
  p_tool_refs text[] default null,
  p_limit integer default 40,
  p_after_rank bigint default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns table (id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
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
           coalesce(cardinality(p_tool_refs), 0) as n_tools
  ),
  prompt_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where p_kind = 'prompt'
      and x.status = 'published' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat or x.prompt_text ilike pr.pat)
      and (pr.n_authors = 0 or x.author_id = any (p_author_ids))
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
      and not x.is_draft and x.deleted_at is null
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat or x.creative_direction ilike pr.pat)
      and (pr.n_authors = 0 or x.author_id = any (p_author_ids))
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
      and x.status = 'published'
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat)
      and (pr.n_authors = 0 or x.creator_id = any (p_author_ids))
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
      and x.status = 'published' and x.visibility = 'public'
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat)
      and (pr.n_authors = 0 or x.creator_id = any (p_author_ids))
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
$$;

revoke all on function public.search_content(text, text, text, uuid[], text[], text, text, text, text[], text[], integer, bigint, timestamptz, uuid) from public;
grant execute on function public.search_content(text, text, text, uuid[], text[], text, text, text, text[], text[], integer, bigint, timestamptz, uuid) to anon, authenticated;
