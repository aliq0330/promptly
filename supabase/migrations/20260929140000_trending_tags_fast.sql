-- /tags sayfası geç açılıyordu (docs/history/259-*): `trending_tags` her etiket için dört CTE'yi (son/önceki dönem × prompt/istek) bir skaler alt sorguyla
-- baştan tarıyordu (etiket sayısı × 4 tarama: canlıda 1 545 etiketle ~350 000 sayfa okuması, ~370 ms; etiket ve prompt arttıkça büyür).
-- Aynı sonucu tek geçişte veren sürüm: her kaynak yalnızca son 2 dönemdeki bağlarını okuyup `filter` ile iki sayıya böler, kaynaklar birleşir, etiketle eşlenir.
-- Davranış AYNI (aynı imza, aynı dönüş, aynı sıralama; yalnızca `recent_count > 0` olanlar). Yalnızca `create or replace`, `drop` yok.

create or replace function public.trending_tags(p_limit integer default 12, p_window_days integer default 7)
returns table (slug text, label text, recent_count bigint, previous_count bigint)
language sql
stable
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
      join public.prompts p on p.status = 'published' and p.created_at >= b.since
      join public.prompt_tags pt on pt.prompt_id = p.id
     group by pt.tag_slug
    union all
    select rt.tag_slug,
           count(*) filter (where r.created_at >= b.mid),
           count(*) filter (where r.created_at < b.mid)
      from bounds b
      join public.prompt_requests r on not r.is_draft and r.created_at >= b.since
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
