-- Skill: keşif ve arama (Aşama 4, docs/history/392-*). Yalnız ekleyici; `feed_page` / `search_content` imzalarına DOKUNULMAZ (ayrı RPC'ler).
--
-- • `skill_feed_page` — Keşfet "Skill'ler" bölümü ve arama: keyset (rank, created_at, id), uzmanlık alanı / uyumlu araç / lisans / paketli mi süzgeçleri,
--   sıralama (new · oldest · popular · most_used · recommended). SECURITY INVOKER: okuma kuralları `skills` RLS'inden (engelleme dahil) gelir, ayrıca
--   yalnız yayında + herkese açık Skill döner. `match_source` eşleşmenin NEREDEN olduğunu söyler (başlık/açıklama/etiket/araç/talimat).
-- • `related_skills` — benzer Skill (aynı uzmanlık alanı, ortak etiket, ortak araç, aynı yazar); yalnız gerçek sinyal, sinyalsiz Skill dönmez.
-- • `skills_for_content` — ters yön: bir prompt / workflow / ayar paketine BAĞLI Skill'ler ("Bu prompt şu Skill'lerde").

create index if not exists skills_title_trgm_idx on public.skills using gin (lower(title) extensions.gin_trgm_ops) where status = 'published' and visibility = 'public';
create index if not exists skills_summary_trgm_idx on public.skills using gin (lower(summary) extensions.gin_trgm_ops) where status = 'published' and visibility = 'public';
create index if not exists skill_tags_tag_idx on public.skill_tags (tag_slug, skill_id);

create or replace function public.skill_feed_page(
  p_query text default null,
  p_sort text default 'new',
  p_category text default null,
  p_compat text[] default null,
  p_license text default null,
  p_has_package boolean default null,
  p_author_ids uuid[] default null,
  p_tag_slugs text[] default null,
  p_limit integer default 40,
  p_after_rank bigint default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
) returns table(id uuid, created_at timestamptz, sort_rank bigint, match_source text)
language sql stable security invoker set search_path = public as $$
  with params as (
    select least(greatest(coalesce(p_limit, 40), 1), 50) as lim,
           case when nullif(btrim(p_query), '') is null then null
                else '%' || replace(replace(replace(lower(left(btrim(p_query), 80)), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat,
           (p_sort = 'oldest') as asc_order,
           coalesce(cardinality(p_compat), 0) as n_compat,
           coalesce(cardinality(p_author_ids), 0) as n_authors,
           coalesce(cardinality(p_tag_slugs), 0) as n_tags
  ),
  base as (
    select s.id, s.created_at,
           (case p_sort
              when 'popular' then s.like_count
              when 'most_used' then s.use_count
              when 'recommended' then s.use_count * 2 + s.save_count * 3 + s.like_count * 2 + s.comment_count
              else 0 end)::bigint as sort_rank,
           case
             when pr.pat is null then null
             when lower(s.title) like pr.pat then 'title'
             when lower(s.summary) like pr.pat then 'summary'
             when exists (select 1 from public.skill_tags t where t.skill_id = s.id and lower(t.tag_slug) like pr.pat) then 'tag'
             when exists (select 1 from unnest(s.compat) c where lower(c) like pr.pat) then 'tool'
             else 'instructions'
           end as match_source
    from public.skills s, params pr
    where s.status = 'published' and s.visibility = 'public'
      and (pr.pat is null
           or lower(s.title) like pr.pat or lower(s.summary) like pr.pat or lower(s.instructions) like pr.pat
           or exists (select 1 from public.skill_tags t where t.skill_id = s.id and lower(t.tag_slug) like pr.pat)
           or exists (select 1 from unnest(s.compat) c where lower(c) like pr.pat))
      and (p_category is null or s.category = p_category)
      and (pr.n_compat = 0 or s.compat && p_compat)
      and (p_license is null or s.license = p_license)
      and (p_has_package is null or p_has_package = exists (select 1 from public.skill_versions v where v.skill_id = s.id))
      and (pr.n_authors = 0 or s.author_id = any (p_author_ids))
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) g where not exists (select 1 from public.skill_tags t where t.skill_id = s.id and t.tag_slug = g)))
  )
  select b.id, b.created_at, b.sort_rank, b.match_source
  from base b, params pr
  where p_after_id is null
        or case when pr.asc_order then (b.created_at, b.id) > (p_after_created_at, p_after_id)
                else (b.sort_rank, b.created_at, b.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id) end
  order by case when pr.asc_order then b.created_at end asc, case when pr.asc_order then b.id end asc,
           b.sort_rank desc nulls last,
           case when not pr.asc_order then b.created_at end desc, case when not pr.asc_order then b.id end desc
  limit (select lim from params)
$$;
revoke all on function public.skill_feed_page(text, text, text, text[], text, boolean, uuid[], text[], integer, bigint, timestamptz, uuid) from public;
grant execute on function public.skill_feed_page(text, text, text, text[], text, boolean, uuid[], text[], integer, bigint, timestamptz, uuid) to anon, authenticated;

create or replace function public.related_skills(p_skill uuid, p_limit integer default 6)
returns table(id uuid, score integer)
language sql stable security invoker set search_path = public as $$
  with me as (select s.id, s.category, s.compat, s.author_id from public.skills s where s.id = p_skill),
  scored as (
    select o.id, o.like_count, o.created_at,
           (case when me.category is not null and o.category = me.category then 3 else 0 end)
           + 2 * (select count(*) from public.skill_tags a join public.skill_tags b on b.tag_slug = a.tag_slug where a.skill_id = o.id and b.skill_id = me.id)::int
           + 2 * coalesce(cardinality(array(select unnest(o.compat) intersect select unnest(me.compat))), 0)
           + (case when o.author_id = me.author_id then 1 else 0 end) as score
    from public.skills o, me
    where o.id <> me.id and o.status = 'published' and o.visibility = 'public'
  )
  select scored.id, scored.score from scored
  where scored.score > 0
  order by scored.score desc, scored.like_count desc, scored.created_at desc, scored.id desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12)
$$;
revoke all on function public.related_skills(uuid, integer) from public;
grant execute on function public.related_skills(uuid, integer) to anon, authenticated;

create or replace function public.skills_for_content(p_type text, p_id uuid, p_limit integer default 6)
returns table(id uuid)
language sql stable security invoker set search_path = public as $$
  select s.id from public.skill_relations r join public.skills s on s.id = r.skill_id
  where r.target_type = p_type and r.target_id = p_id and s.status = 'published' and s.visibility = 'public'
  order by s.like_count desc, s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12)
$$;
revoke all on function public.skills_for_content(text, uuid, integer) from public;
grant execute on function public.skills_for_content(text, uuid, integer) to anon, authenticated;
