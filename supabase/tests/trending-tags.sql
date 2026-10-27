-- trending_tags yeni (tek geçişli) sürümü eski tanımla AYNI sonucu verir (docs/history/259-*): rastgele veri, iki dönem, prompt + istek, taslaklar.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/trending-tags.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''

insert into auth.users (id, email, raw_user_meta_data) values (:alice, 'alice@test.dev', '{"username":"alice","display_name":"Alice"}');
create table public._results (n int, name text, ok boolean, detail text);
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;

-- Eski tanım (canlıdaki, her etiket için CTE taraması) — karşılaştırma ölçütü.
create or replace function public._trending_tags_old(p_limit integer default 12, p_window_days integer default 7)
returns table (slug text, label text, recent_count bigint, previous_count bigint)
language sql stable set search_path = public as $$
  with recent_prompt as (
    select pt.tag_slug, count(*) as c from public.prompt_tags pt join public.prompts p on p.id = pt.prompt_id
    where p.status = 'published' and p.created_at >= now() - make_interval(days => p_window_days) group by pt.tag_slug
  ),
  previous_prompt as (
    select pt.tag_slug, count(*) as c from public.prompt_tags pt join public.prompts p on p.id = pt.prompt_id
    where p.status = 'published' and p.created_at >= now() - make_interval(days => p_window_days * 2) and p.created_at < now() - make_interval(days => p_window_days) group by pt.tag_slug
  ),
  recent_request as (
    select rt.tag_slug, count(*) as c from public.prompt_request_tags rt join public.prompt_requests r on r.id = rt.request_id
    where not r.is_draft and r.created_at >= now() - make_interval(days => p_window_days) group by rt.tag_slug
  ),
  previous_request as (
    select rt.tag_slug, count(*) as c from public.prompt_request_tags rt join public.prompt_requests r on r.id = rt.request_id
    where not r.is_draft and r.created_at >= now() - make_interval(days => p_window_days * 2) and r.created_at < now() - make_interval(days => p_window_days) group by rt.tag_slug
  ),
  combined as (
    select t.slug, t.label,
      coalesce((select c from recent_prompt where recent_prompt.tag_slug = t.slug), 0) + coalesce((select c from recent_request where recent_request.tag_slug = t.slug), 0) as recent_count,
      coalesce((select c from previous_prompt where previous_prompt.tag_slug = t.slug), 0) + coalesce((select c from previous_request where previous_request.tag_slug = t.slug), 0) as previous_count
    from public.tags t
  )
  select slug, label, recent_count, previous_count from combined where recent_count > 0
  order by (recent_count - previous_count) desc, recent_count desc, label asc limit p_limit;
$$;

-- Veri: 400 etiket, 3 000 prompt (son 20 gün, çoğu yayında; bir kısmı taslak), 300 istek; her birine 1–4 rastgele etiket.
select setseed(0.42);
insert into public.tags (slug, label) select 'tag-' || lpad(i::text, 4, '0'), 'Tag ' || lpad(((i * 7919) % 400)::text, 4, '0') from generate_series(1, 400) i;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at)
select gen_random_uuid(), :alice, 'P' || i, 'd', 't', 'text', case when random() < 0.15 then 'draft' else 'published' end, 'public', now() - (random() * 20) * interval '1 day' from generate_series(1, 3000) i;
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, created_at)
select gen_random_uuid(), :alice, 'R' || i, 'd', random() < 0.2, 'public', now() - (random() * 20) * interval '1 day' from generate_series(1, 300) i;
insert into public.prompt_tags (prompt_id, tag_slug)
select distinct p.id, 'tag-' || lpad((1 + floor(random() * 400))::int::text, 4, '0') from public.prompts p, generate_series(1, 4) g;
insert into public.prompt_request_tags (request_id, tag_slug)
select distinct r.id, 'tag-' || lpad((1 + floor(random() * 400))::int::text, 4, '0') from public.prompt_requests r, generate_series(1, 3) g;

select public._check(1, 'varsayılan (12, 7 gün): eski ve yeni sürüm aynı satırlar, aynı sırada',
  (select coalesce(array_agg(row(slug, label, recent_count, previous_count)::text order by ord), '{}') from (select row_number() over () ord, * from public.trending_tags(12, 7)) a)
  = (select coalesce(array_agg(row(slug, label, recent_count, previous_count)::text order by ord), '{}') from (select row_number() over () ord, * from public._trending_tags_old(12, 7)) b)
  and (select count(*) from public.trending_tags(12, 7)) = 12);
select public._check(2, 'farklı pencere ve limit (3 gün/50, 10 gün/400, 1 gün/5): hepsi eşit',
  (select array_agg(x order by x) from (select row(slug, recent_count, previous_count)::text x from public.trending_tags(50, 3)) a) is not distinct from (select array_agg(x order by x) from (select row(slug, recent_count, previous_count)::text x from public._trending_tags_old(50, 3)) b)
  and (select array_agg(x order by x) from (select row(slug, recent_count, previous_count)::text x from public.trending_tags(400, 10)) a) is not distinct from (select array_agg(x order by x) from (select row(slug, recent_count, previous_count)::text x from public._trending_tags_old(400, 10)) b)
  and (select array_agg(x order by x) from (select row(slug, recent_count, previous_count)::text x from public.trending_tags(5, 1)) a) is not distinct from (select array_agg(x order by x) from (select row(slug, recent_count, previous_count)::text x from public._trending_tags_old(5, 1)) b));
select public._check(3, 'taslaklar sayılmaz; hiç hareketi olmayan etiket (recent=0) çıkmaz',
  not exists (select 1 from public.trending_tags(400, 7) where recent_count <= 0));
select public._check(4, 'dönüş tipi bigint (istemci sözleşmesi)', (select pg_typeof(recent_count)::text from public.trending_tags(1, 7)) = 'bigint');

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
