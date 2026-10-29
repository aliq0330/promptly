-- "Benzer promptlar" sıralaması (docs/history/274-*): DNA, etiket ve kategori tek PUANDA birleşir; zayıf bölümler ve yaygın sözcükler DNA eşleşmesi sayılmaz.
--
-- Yalnızca `create or replace` (AYNI imza ve dönüş sütunları: id, dna_hits, tag_hits); tablo/sütun/politika değişikliği yok, `drop` yok.
-- Eski sürüm (20260919790000) sözlüksel sıralıyordu: dna_hits > tag_hits > kategori. Canlıda sonuç: "format" gibi biçim bölümlerindeki
-- ya da "only / never / light" gibi çok yaygın bir sözcük iki bölümde eşleşince, ortak etiketi ve aynı kategorisi olan promptları eziyordu.
--
-- Değişenler:
--   1) dna_hits yalnız TANIMLAYICI bölümleri sayar; biçim benzeri bölümler (output, format, language, negative, platform, constraints,
--      custom — src/lib/relations/dna-similarity.ts WEAK_TYPES ile aynı liste) eşleşme sayılmaz.
--   2) Kaynağın, prompt başına %5'ten fazlasında geçen sözcükleri ("only", "never", "light"…) eşleşme sayılmaz.
--   3) Sıra puanla belirlenir: min(dna_hits,4)·2 + min(tag_hits,3)·3 + aynı kategori 3 + aynı alt kategori 2.
--      Eşitlikte aynı yazar, aynı içerik türü, beğeni sayısı, id (öncekiyle aynı).
-- Aday kuralı aynı: dna_hits > 0, tag_hits > 0 ya da aynı kategori; yalnız "aynı yazar" / "aynı tür" benzerlik sayılmaz.

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
  total as (
    select greatest(count(*), 1) as n
    from public.prompts p
    where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null
  ),
  src_tok as (
    select s1.type, t.tok
    from public.prompt_dna_sections s1
    cross join lateral unnest(s1.tokens) as t(tok)
    where s1.prompt_id = p_prompt_id
      and s1.type <> all (array['output', 'format', 'language', 'negative', 'platform', 'constraints', 'custom'])
  ),
  src_types as (
    select st.type, array_agg(st.tok) as toks
    from src_tok st
    where (select count(*) from public.prompt_dna_sections s where s.tokens @> array[st.tok]) * 20 <= (select n from total)
    group by st.type
  ),
  dna as (
    select s2.prompt_id as id, count(distinct s2.type)::integer as hits
    from src_types d
    join public.prompt_dna_sections s2 on s2.type = d.type and s2.tokens && d.toks
    where s2.prompt_id <> p_prompt_id
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
    and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null
    and (p.origin_type = 'original' or p.show_on_profile)
  order by least(coalesce(dna.hits, 0), 4) * 2
           + least(coalesce(tg.hits, 0), 3) * 3
           + (case when src.category is not null and p.content_type = src.content_type and p.category = src.category then 3 else 0 end)
           + (case when src.category is not null and src.subcategory is not null and p.content_type = src.content_type
                        and p.category = src.category and p.subcategory is not distinct from src.subcategory then 2 else 0 end) desc,
           (p.author_id = src.author_id) desc,
           (p.content_type = src.content_type) desc,
           p.like_count desc,
           p.id
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$$;

revoke all on function public.related_prompts(uuid, integer) from public;
grant execute on function public.related_prompts(uuid, integer) to anon, authenticated;
