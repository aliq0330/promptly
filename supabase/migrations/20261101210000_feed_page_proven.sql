-- "Kanıtlanmış" sıralaması (docs/history/307-*; Promptly Skoru'nun ikinci dilimi, 296'nın "sıralamaya girmedi" notunu kapatır).
-- `feed_page`'e DOKUNULMAZ (221 kuralı: eski çağıranlar kırılmaz; 17 argümanlı gövdeyi yeniden yazmak her akışı riske atar): ayrı, küçük,
-- yalnız Prompt döndüren bir RPC. Sıralama = "Çalıştı" oylarının Wilson alt sınırı (%95; az oyla yanıltmaz), en az 5 oy
-- (`lib/prompt-works.ts` `WORKS_MIN_VOTES` ile aynı eşik; altındakilerin yüzdesi arayüzde de gösterilmez). `sort_rank` = alt sınır × 1 000 000.
-- Çıktı biçimi `feed_page` ile AYNIDIR (kind, id, created_at, sort_rank) ve keyset imleci aynı üçlüdür: (sort_rank, created_at, id) AZALAN.
-- INVOKER: RLS (engel, görünürlük) atlanmaz; görünürlük koşulları `feed_page`'in prompt kolundakiyle birebir yazılıdır. Ziyaretçiye açıktır (Keşfet misafire de açık).

create or replace function public.feed_page_proven(
  p_content_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_tool text default null,
  p_limit integer default 18,
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
  with scored as (
    select x.id, x.created_at,
           s.yes_count, (s.yes_count + s.no_count) as total
    from public.prompts x
    join public.prompt_works_stats s on s.prompt_id = x.id
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (s.yes_count + s.no_count) >= 5
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
  ),
  ranked as (
    select id, created_at,
           floor(1000000 * greatest(0,
             ((yes_count::float8 / total) + 3.8416 / (2 * total)
               - 1.96 * sqrt(((yes_count::float8 / total) * (1 - yes_count::float8 / total) + 3.8416 / (4 * total)) / total))
             / (1 + 3.8416 / total)))::bigint as sort_rank
    from scored
  )
  select 'prompt'::text as kind, r.id, r.created_at, r.sort_rank
  from ranked r
  where p_after_id is null
     or (r.sort_rank, r.created_at, r.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
  order by r.sort_rank desc, r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 18), 1), 50);
$$;
revoke all on function public.feed_page_proven(text, text, text, text, integer, bigint, timestamptz, uuid) from public;
grant execute on function public.feed_page_proven(text, text, text, text, integer, bigint, timestamptz, uuid) to anon, authenticated;
