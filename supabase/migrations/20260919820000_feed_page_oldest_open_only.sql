-- Keşfet karma akışı sunucu sayfalamasına geçer: `public.feed_page` genişler.
--
-- Eskiden Keşfet, RealPrompts/Requests/Workflows/Presets önbelleğinin ilk
-- sayfasını (en yeni 60) tarayıcıda süzüp sıralıyordu; "En çok beğenilen" bu
-- yüzden küresel değildi. Yeni bir discover RPC'si AÇILMAZ — aynı `feed_page`
-- iki şeyle genişler:
--
--   p_order = 'oldest'  → (sort_rank, created_at, id) üçlüsü ARTAN sıralanır;
--                         sort_rank sabit 0. İmleç karşılaştırması `>` olur
--                         (azalan sıralarda `<`). İmleç yine son HAM satırdan
--                         üretilir (src/lib/feed-cursor.ts `nextFeedCursor`).
--   p_open_only         → YALNIZCA request kolunu `status = 'open'` ile süzer;
--                         prompt / workflow / preset etkilenmez.
--
-- Ana sayfa (useFeedPages) ve diğer her şey aynı sözleşmeyle çalışmaya devam eder.
--
-- İMZA NOTU (neden DROP yok): parametre eklemek yeni bir imza (11 argüman)
-- demektir. Eski 10 argümanlı imzayı `drop function` ile silmek bu işte açık
-- onay olmadan yapılmaz; bırakıp `p_open_only`e varsayılan vermek ise iki
-- aşırı yüklemeyi belirsiz kılar ("function is not unique") ve Ana sayfayı
-- bozar. Bu yüzden:
--   * 11 argümanlı fonksiyon TÜM mantığı taşır; `p_open_only` varsayılansızdır.
--   * Eski 10 argümanlı imza AYNI imzayla `create or replace` edilir ve yalnızca
--     `p_open_only := false` ile 11 argümanlıya yönlenen ince bir sarmalayıcıdır
--     (yani Ana sayfa parametreyi hiç geçmez, davranışı değişmez). Mantık tek
--     yerde kalır.
-- Sarmalayıcıyı kaldırıp `p_open_only boolean default false` vermek, ayrı bir
-- onaylı migration'da `drop function` gerektirir.
--
-- Limit hâlâ en fazla 50. security invoker, search_path = public, grant'lar
-- anon + authenticated. Görünürlük koşulları (yayımlanmış + public, taslak
-- olmayan, silinmemiş) 20260919770000'dekiyle aynıdır, gevşetilmemiştir.

create or replace function public.feed_page(
  p_scope text,
  p_order text,
  p_kinds text[],
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_limit integer,
  p_after_rank bigint,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_open_only boolean
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
           (p_scope = 'following') as following
  ),
  followed as (
    select f.following_id as author_id
    from public.follows f
    where f.follower_id = auth.uid()
  ),
  prompt_part as (
    select 'prompt'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where not x.is_draft and x.visibility = 'public' and x.deleted_at is null
      and (p_kinds is null or 'request' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not coalesce(p_open_only, false) or x.status = 'open')
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'workflow' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (p_content_type is null or p_content_type = any (x.content_types))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.presets x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'preset' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
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
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.oldest then u.created_at end asc, case when pr.oldest then u.id end asc,
           u.created_at desc, u.id desc
  limit (select lim from params);
$$;

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean) to anon, authenticated;

-- Eski imza: aynı imza + aynı varsayılanlar, yalnızca sarmalayıcı (bkz. İMZA NOTU).
create or replace function public.feed_page(
  p_scope text default 'all',
  p_order text default 'newest',
  p_kinds text[] default null,
  p_content_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_limit integer default 24,
  p_after_rank bigint default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.feed_page(
    p_scope, p_order, p_kinds, p_content_type, p_category, p_subcategory,
    p_limit, p_after_rank, p_after_created_at, p_after_id, false
  );
$$;

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid) to anon, authenticated;
