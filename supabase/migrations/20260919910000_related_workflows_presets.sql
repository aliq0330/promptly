-- Workflow ve Hazır Ayar detayında "Benzer" blokları: sunucudan, kaynak içeriğe göre.
--
-- related_prompts / related_requests (20260919790000) ile aynı kalıp: yalnızca
-- KİMLİK + sıralama sinyalleri döner, tam satırları istemci mevcut select/
-- mapper'larla çeker. SECURITY INVOKER (RLS çağıranın rolüyle işler), search_path
-- sabit, EXECUTE yalnız anon + authenticated. Adaylar yalnızca GÖRÜNEBİLİR
-- içeriktir (yayımlanmış + herkese açık); kaynağın kendisi hariç.
--
-- Sıralama (sözlüksel): 1) ortak etiket sayısı, 2) aynı alt kategori / aynı
-- kategori (aynı içerik türünde), 3) aynı yazar, 4) like_count, id.
-- Aday olmak için etiket ya da kategori eşleşmesi gerekir; "yalnız aynı yazar"
-- benzerlik sayılmaz. Workflow'da "aynı içerik türü" = `content_types` kesişimi.

create or replace function public.related_workflows(p_workflow_id uuid, p_limit integer default 4)
returns table (id uuid, tag_hits integer)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select w.id, w.creator_id, w.content_types, w.category, w.subcategory
    from public.workflows w
    where w.id = p_workflow_id
  ),
  tg as (
    select t2.workflow_id as id, count(*)::integer as hits
    from public.workflow_tags t1
    join public.workflow_tags t2 on t2.tag_slug = t1.tag_slug and t2.workflow_id <> t1.workflow_id
    where t1.workflow_id = p_workflow_id
    group by t2.workflow_id
  ),
  cat as (
    select w.id
    from public.workflows w, src
    where src.category is not null and w.content_types && src.content_types and w.category = src.category and w.id <> src.id
  ),
  cand as (
    select id from tg union select id from cat
  )
  select w.id, coalesce(tg.hits, 0) as tag_hits
  from cand c
  join public.workflows w on w.id = c.id
  cross join src
  left join tg on tg.id = w.id
  where w.id <> src.id
    and w.status = 'published' and w.visibility = 'public'
  order by coalesce(tg.hits, 0) desc,
           (src.category is not null and w.content_types && src.content_types and w.category = src.category
              and w.subcategory is not distinct from src.subcategory and src.subcategory is not null) desc,
           (src.category is not null and w.content_types && src.content_types and w.category = src.category) desc,
           (w.creator_id = src.creator_id) desc,
           w.like_count desc,
           w.id
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$$;

create or replace function public.related_presets(p_preset_id uuid, p_limit integer default 4)
returns table (id uuid, tag_hits integer)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select p.id, p.creator_id, p.content_type, p.category, p.subcategory
    from public.presets p
    where p.id = p_preset_id
  ),
  tg as (
    select t2.preset_id as id, count(*)::integer as hits
    from public.preset_tags t1
    join public.preset_tags t2 on t2.tag_slug = t1.tag_slug and t2.preset_id <> t1.preset_id
    where t1.preset_id = p_preset_id
    group by t2.preset_id
  ),
  cat as (
    select p.id
    from public.presets p, src
    where src.category is not null and p.content_type = src.content_type and p.category = src.category and p.id <> src.id
  ),
  cand as (
    select id from tg union select id from cat
  )
  select p.id, coalesce(tg.hits, 0) as tag_hits
  from cand c
  join public.presets p on p.id = c.id
  cross join src
  left join tg on tg.id = p.id
  where p.id <> src.id
    and p.status = 'published' and p.visibility = 'public'
  order by coalesce(tg.hits, 0) desc,
           (src.category is not null and p.content_type = src.content_type and p.category = src.category
              and p.subcategory is not distinct from src.subcategory and src.subcategory is not null) desc,
           (src.category is not null and p.content_type = src.content_type and p.category = src.category) desc,
           (p.creator_id = src.creator_id) desc,
           (p.content_type = src.content_type) desc,
           p.like_count desc,
           p.id
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$$;

revoke all on function public.related_workflows(uuid, integer) from public;
grant execute on function public.related_workflows(uuid, integer) to anon, authenticated;
revoke all on function public.related_presets(uuid, integer) from public;
grant execute on function public.related_presets(uuid, integer) to anon, authenticated;
