-- Detaydaki "Benzer" blokları: sunucudan, kaynak içeriğe göre.
--
-- Eskiden RelatedPrompts / RelatedRequests, istemcideki ~60'lık "son içerik"
-- önbelleğinden etiket kesiştiriyordu; sayfa doğrudan /prompts/local?id= ile
-- açılırsa kaynak o havuzda yoktu ve blok boş kalıyordu. Bu iki fonksiyon
-- benzerleri doğrudan veritabanından seçer; yalnızca KİMLİK + sıralama
-- sinyalleri döner, tam satırları istemci mevcut select/mapper'larla çeker.
--
-- SECURITY INVOKER: tablo RLS'i çağıranın rolüyle işler, yeni yetki yüzeyi
-- yoktur. Adaylar ayrıca açıkça yalnızca GÖRÜNEBİLİR içeriktir (yayımlanmış +
-- herkese açık, silinmemiş / taslak olmayan); kaynağın kendisi hariç tutulur.
--
-- related_prompts sıralaması (sözlüksel — önce gelen sinyal sonrakini ezer):
--   1) dna_hits  — kaynakla aynı DNA bölüm TÜRÜNDE ortak anahtar sözcüğü olan
--                  bölüm sayısı (`prompt_dna_sections.tokens` GIN indeksi,
--                  dna_similar_candidates ile aynı ön hesaplama)
--   2) tag_hits  — ortak etiket sayısı
--   3) aynı alt kategori / aynı kategori (aynı içerik türünde)
--   4) aynı yazar, 5) aynı içerik türü (ikincil)
--   6) like_count, id (kararlı sıra)
-- Aday olmak için dna_hits > 0, tag_hits > 0 ya da aynı kategori yeterlidir;
-- yalnızca "aynı yazar" veya "aynı tür" bir benzerlik sayılmaz.
-- related_requests aynı kuraldır, DNA yoktur (isteklerin DNA bölümü olmaz).

create or replace function public.related_prompts(p_prompt_id uuid, p_limit integer default 4)
returns table (id uuid, dna_hits integer, tag_hits integer)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select p.id, p.author_id, p.content_type, p.category, p.subcategory
    from public.prompts p
    where p.id = p_prompt_id
  ),
  dna as (
    select s2.prompt_id as id, count(distinct s2.type)::integer as hits
    from public.prompt_dna_sections s1
    join public.prompt_dna_sections s2
      on s2.type = s1.type and s2.tokens && s1.tokens and s2.prompt_id <> s1.prompt_id
    where s1.prompt_id = p_prompt_id
    group by s2.prompt_id
  ),
  tg as (
    select t2.prompt_id as id, count(*)::integer as hits
    from public.prompt_tags t1
    join public.prompt_tags t2 on t2.tag_slug = t1.tag_slug and t2.prompt_id <> t1.prompt_id
    where t1.prompt_id = p_prompt_id
    group by t2.prompt_id
  ),
  cat as (
    select p.id
    from public.prompts p, src
    where src.category is not null and p.content_type = src.content_type and p.category = src.category and p.id <> src.id
  ),
  cand as (
    select id from dna union select id from tg union select id from cat
  )
  select p.id, coalesce(dna.hits, 0) as dna_hits, coalesce(tg.hits, 0) as tag_hits
  from cand c
  join public.prompts p on p.id = c.id
  cross join src
  left join dna on dna.id = p.id
  left join tg on tg.id = p.id
  where p.id <> src.id
    and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null
    and (p.origin_type = 'original' or p.show_on_profile)
  order by coalesce(dna.hits, 0) desc,
           coalesce(tg.hits, 0) desc,
           (src.category is not null and p.content_type = src.content_type and p.category = src.category
              and p.subcategory is not distinct from src.subcategory and src.subcategory is not null) desc,
           (src.category is not null and p.content_type = src.content_type and p.category = src.category) desc,
           (p.author_id = src.author_id) desc,
           (p.content_type = src.content_type) desc,
           p.like_count desc,
           p.id
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$$;

create or replace function public.related_requests(p_request_id uuid, p_limit integer default 4)
returns table (id uuid, tag_hits integer)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select r.id, r.author_id, r.content_type, r.category, r.subcategory
    from public.prompt_requests r
    where r.id = p_request_id
  ),
  tg as (
    select t2.request_id as id, count(*)::integer as hits
    from public.prompt_request_tags t1
    join public.prompt_request_tags t2 on t2.tag_slug = t1.tag_slug and t2.request_id <> t1.request_id
    where t1.request_id = p_request_id
    group by t2.request_id
  ),
  cat as (
    select r.id
    from public.prompt_requests r, src
    where src.category is not null and r.content_type = src.content_type and r.category = src.category and r.id <> src.id
  ),
  cand as (
    select id from tg union select id from cat
  )
  select r.id, coalesce(tg.hits, 0) as tag_hits
  from cand c
  join public.prompt_requests r on r.id = c.id
  cross join src
  left join tg on tg.id = r.id
  where r.id <> src.id
    and not r.is_draft and r.visibility = 'public' and r.deleted_at is null
  order by coalesce(tg.hits, 0) desc,
           (src.category is not null and r.content_type = src.content_type and r.category = src.category
              and r.subcategory is not distinct from src.subcategory and src.subcategory is not null) desc,
           (src.category is not null and r.content_type = src.content_type and r.category = src.category) desc,
           (r.author_id = src.author_id) desc,
           (r.content_type = src.content_type) desc,
           r.like_count desc,
           r.id
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$$;

revoke all on function public.related_prompts(uuid, integer) from public;
grant execute on function public.related_prompts(uuid, integer) to anon, authenticated;
revoke all on function public.related_requests(uuid, integer) from public;
grant execute on function public.related_requests(uuid, integer) to anon, authenticated;
