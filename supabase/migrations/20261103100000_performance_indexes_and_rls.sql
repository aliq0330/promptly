-- Performans (docs/history/325-*): canlı veritabanında ÖLÇÜLEN dört darboğaz. YALNIZ EKLEME/DEĞİŞTİRME; hiçbir veri ya da sütun silinmez, geri dönüş için dosyanın sonundaki ROLLBACK notuna bak.
--
-- Ölçüm (canlı proje, `pg_stat_statements` + RLS altında geri alınan işlemlerde `EXPLAIN (ANALYZE, BUFFERS)`; kullanıcı rolü `authenticated`):
--   • Keşfet/“Bu hafta popüler” sorgusu (beğeniye göre sıralı herkese açık promptlar): 78 ms · 7 518 buffer  →  2,6 ms · 118 buffer (indeks).
--   • trending_tags(12, 7): 529 ms · 125 204 buffer  →  yaklaşık 20 ms (tanımlayan yetkisiyle + açık herkese açık süzgeci; satır içi 19 ms ölçüldü).
--   • related_prompts(): 1 437 ms · 157 202 buffer  →  110 ms · 8 660 buffer; 10 farklı promptta eski sonuçla BİREBİR aynı sıralı kimlik listesi.
--   • RLS “engellenen yazarı gizle” politikası satır başına `is_blocked()` çağırıyordu (SECURITY DEFINER, satır içine alınamaz): tek başına
--     trending_tags 529 → 88 ms. Politika artık engel kümesini sorgu başına BİR kez (InitPlan) okur.

-- 1) Herkese açık prompt listesi: `ORDER BY like_count DESC, id LIMIT n` tüm tabloyu tarayıp sıralıyordu (RLS her satır için çalışarak).
create index if not exists prompts_public_like_idx
  on public.prompts (like_count desc, id)
  where status = 'published' and visibility = 'public' and community_id is null and deleted_at is null;

-- 2) Engel kümesi: çağıranla herhangi bir yönde engel ilişkisi olan kullanıcılar. `is_blocked(uid, x)` ile AYNI anlam
--    (anon → hiç engel yok; ilişki iki yönlü) ama satır başına değil sorgu başına bir kez hesaplanır.
create or replace function public.blocked_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end),
    '{}'::uuid[]
  )
  from public.blocks b
  where auth.role() is distinct from 'anon'
    and (b.blocker_id = auth.uid() or b.blocked_id = auth.uid());
$$;

revoke all on function public.blocked_user_ids() from public;
-- RLS ifadeleri sorguyu yapan rolün yetkisiyle çalışır: ziyaretçi (anon) de çağırabilmeli (boş küme döner).
grant execute on function public.blocked_user_ids() to anon, authenticated, service_role;

-- Aynı ifade, aynı davranış: oturumsuzsa hepsi görünür; oturumluysa engel ilişkisi olan yazarın içeriği gizli. NULL yazar (silinmiş hesap) eskisi gibi görünür.
alter policy prompts_hide_blocked on public.prompts
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[author_id]));
alter policy prompt_requests_hide_blocked on public.prompt_requests
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[author_id]));
alter policy prompt_comments_hide_blocked on public.prompt_comments
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[author_id]));
alter policy community_posts_hide_blocked on public.community_posts
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[author_id]));
alter policy workflows_hide_blocked on public.workflows
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[creator_id]));
alter policy presets_hide_blocked on public.presets
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[creator_id]));

-- 3) trending_tags: yalnız herkese açık, topluluğa ait olmayan, silinmemiş içeriği sayar (birleşik sayım bir toplamdır, satır döndürmez).
--    Önceden SECURITY INVOKER idi: her prompt_tags satırı için RLS (EXISTS → prompts → politikalar) çalışıyor, oturumlu kullanıcıda ayrıca kendi
--    özel/topluluk içeriği de sayılıyordu. Artık herkes için aynı, herkese açık sayım (bu sayfaların sunduğu da zaten “yükselen etiketler”dir).
create or replace function public.trending_tags(p_limit integer default 12, p_window_days integer default 7)
returns table(slug text, label text, recent_count bigint, previous_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - make_interval(days => p_window_days) as mid, now() - make_interval(days => p_window_days * 2) as since
  ),
  counted as (
    select pt.tag_slug as tag_slug,
           count(*) filter (where p.created_at >= b.mid) as recent,
           count(*) filter (where p.created_at < b.mid) as previous
      from bounds b
      join public.prompts p on p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.deleted_at is null
                           and p.created_at >= b.since
      join public.prompt_tags pt on pt.prompt_id = p.id
     group by pt.tag_slug
    union all
    select rt.tag_slug,
           count(*) filter (where r.created_at >= b.mid),
           count(*) filter (where r.created_at < b.mid)
      from bounds b
      join public.prompt_requests r on not r.is_draft and r.visibility = 'public' and r.community_id is null and r.deleted_at is null
                                   and r.created_at >= b.since
      join public.prompt_request_tags rt on rt.request_id = r.id
     group by rt.tag_slug
  ),
  summed as (
    select c.tag_slug, sum(c.recent)::bigint as recent_count, sum(c.previous)::bigint as previous_count
      from counted c
     group by c.tag_slug
  )
  select t.slug, t.label, s.recent_count, s.previous_count
    from summed s
    join public.tags t on t.slug = s.tag_slug
   where s.recent_count > 0
   order by (s.recent_count - s.previous_count) desc, s.recent_count desc, t.label asc
   limit p_limit;
$$;

-- 4) related_prompts: “bu belirteç kaç bölümde geçiyor?” sayımı HER belirteç için ayrı ilişkili alt sorguydu (yüzlerce GIN taraması).
--    Şimdi kaynak promptun belirteçleri için tek geçişte sayılır. Anlam aynı: belirteç, herkese açık prompt sayısının 1/20'sinden
--    fazla bölümde geçiyorsa elenir. SECURITY INVOKER kalır (RLS atlanmaz).
create or replace function public.related_prompts(p_prompt_id uuid, p_limit integer default 4)
returns table(id uuid, dna_hits integer, tag_hits integer)
language sql
stable
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
    select distinct s1.type, t.tok
    from public.prompt_dna_sections s1
    cross join lateral unnest(s1.tokens) as t(tok)
    where s1.prompt_id = p_prompt_id
      and s1.type <> all (array['output', 'format', 'language', 'negative', 'platform', 'constraints', 'custom'])
  ),
  tok_df as (
    select u.tok, count(distinct s.id) as df
    from public.prompt_dna_sections s
    cross join lateral unnest(s.tokens) as u(tok)
    where u.tok in (select tok from src_tok)
    group by u.tok
  ),
  src_types as (
    select st.type, array_agg(st.tok) as toks
    from src_tok st
    join tok_df d on d.tok = st.tok
    where d.df * 20 <= (select n from total)
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

-- ROLLBACK (gerekirse elle): drop index public.prompts_public_like_idx;  alter policy <x>_hide_blocked … using (((select auth.uid()) is null) or not is_blocked((select auth.uid()), <author_id|creator_id>));
--   trending_tags / related_prompts: önceki gövdeler 20260929140000_trending_tags_fast.sql ve 20261005100000_related_prompts_weighted.sql içindedir (security invoker, RLS.e dayalı).
