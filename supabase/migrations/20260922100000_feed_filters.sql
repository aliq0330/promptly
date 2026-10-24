-- Ana Sayfa / Keşfet süzgeçleri (docs/history/221-*): akışın süzgeç ve sıralama kararları SUNUCUDA.
--
-- Yalnızca ekleyici: `drop` yok, tablo/sütun/politika değişikliği yok.
--
--   1) `feed_page` 16 argümanlı biçim: mevcut 13 argümana üç çok değerli süzgeç eklenir —
--        p_authors uuid[]  : yalnız bu kişilerin gönderileri (Space ve alıntı da sahibine göre süzülür)
--        p_tags    text[]  : seçilen etiketlerin HEPSİ gönderide olmalı (arama çipleriyle aynı kural: `tokensToQuery`)
--        p_tools   text[]  : seçilen araçlardan HERHANGİ BİRİ önerilmiş olmalı (bir aracın tüm modelleri eşleşir)
--      null ya da boş dizi = süzgeç yok. Farklı süzgeçler VE ile birleşir (kapsam `following` da buna dahil). Etiket/araç süzgeci verilmişse
--      Space ve alıntı girmez (onların etiketi/aracı yoktur — tek etiket/araç süzgecindeki mevcut kural).
--      Süzgeçler yalnız DARALTIR: görünürlük koşulları (yayında, herkese açık, topluluğa ait değil, RLS) olduğu gibi kalır.
--   2) `p_order = 'recommended'` (Keşfet "Önerilen"): kişiselleştirilmemiş, zamandan bağımsız etkileşim puanı —
--        beğeni×3 + kaydetme×2 + yorum×2 (+ prompt'ta kopyalama×2, istekte yanıt×2). Zamandan bağımsız olduğu için keyset sayfalama kayma yapmaz.
--      Bilinmeyen `p_order` eskisi gibi "en yeni" davranır.
--   3) 13 argümanlı eski imza ince sarmalayıcı olur (10 ve 11 argümanlı sarmalayıcılar onu çağırmaya devam eder).
--   4) `discover_tool_counts()` (INVOKER): Keşfet → AI Araçları için araç başına herkese açık gönderi sayısı (feed_page ile aynı görünürlük koşulu).
--
-- Not: `for_you_page` (Sana özel) DEĞİŞMEDİ.

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
  p_open_only boolean,
  p_tag text,
  p_tool text,
  p_authors uuid[],
  p_tags text[],
  p_tools text[]
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
      and x.community_id is null
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
      and x.community_id is null
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
      and x.community_id is null
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
      and x.community_id is null
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
  -- Space: akışta paylaşılmış (`shared_at`) + herkese açık + arşivsiz. Okuma RLS'i (`can_read_space`: engel iki yönlü) ayrıca uygulanır.
  -- Space'in etiketi/kategorisi/aracı/içerik türü yoktur: bu süzgeçlerden biri verilmişse ya da kapsam "etiketlerim"se Space girmez.
  space_part as (
    select 'space'::text as kind, x.id, x.shared_at as created_at,
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.spaces x, params pr
    where x.shared_at is not null and x.visibility = 'public' and x.archived_at is null
      and (p_kinds is null or 'space' = any (p_kinds))
      and not pr.tagged
      and (not pr.following or x.owner_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and (p_authors is null or cardinality(p_authors) = 0 or x.owner_id = any (p_authors))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.shared_at end asc, case when pr.oldest then x.id end asc,
             x.shared_at desc, x.id desc
    limit (select lim from params)
  ),
  -- Alıntı: akışta gönderi olarak. Okuma RLS'i (`content_quotes`) hedefin halka açıklığını ve engeli ayrıca uygular.
  -- Alıntının etiketi/kategorisi/aracı/içerik türü yoktur: bu süzgeçlerden biri verilmişse ya da kapsam "etiketlerim"se alıntı girmez (Space'teki kural).
  quote_part as (
    select 'quote'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.content_quotes x, params pr
    where (p_kinds is null or 'quote' = any (p_kinds))
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
  )
  select u.kind, u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
    union all select * from space_part
    union all select * from quote_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.oldest then u.created_at end asc, case when pr.oldest then u.id end asc,
           u.created_at desc, u.id desc
  limit (select lim from params);
$$;

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean, text, text, uuid[], text[], text[]) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean, text, text, uuid[], text[], text[]) to anon, authenticated;

-- 13 argümanlı eski imza: sarmalayıcı (çağıranlar değişmeden çalışır).
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
  p_open_only boolean,
  p_tag text,
  p_tool text
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.feed_page(p_scope, p_order, p_kinds, p_content_type, p_category, p_subcategory, p_limit,
                                 p_after_rank, p_after_created_at, p_after_id, p_open_only, p_tag, p_tool,
                                 null::uuid[], null::text[], null::text[]);
$$;

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean, text, text) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- discover_tool_counts: araç başına herkese açık gönderi sayısı (Keşfet → AI Araçları). Görünürlük koşulu `feed_page` ile aynı; INVOKER (RLS uygulanır).
-- Bir gönderi aynı aracın birden çok modelini önersede araca bir kez sayılır.
-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.discover_tool_counts()
returns table (tool_id text, post_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with posts as (
    select x.id, x.tools from public.prompts x
     where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
       and (x.origin_type = 'original' or x.show_on_profile) and x.community_id is null
    union all
    select x.id, x.tools from public.prompt_requests x
     where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
    union all
    select x.id, x.tools from public.workflows x
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null
    union all
    select x.id, x.tools from public.presets x
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null
  )
  select split_part(r, ':', 1) as tool_id, count(distinct p.id) as post_count
    from posts p, unnest(p.tools) r
   where split_part(r, ':', 1) <> ''
   group by 1
   order by 2 desc, 1;
$$;

revoke all on function public.discover_tool_counts() from public;
grant execute on function public.discover_tool_counts() to anon, authenticated;
