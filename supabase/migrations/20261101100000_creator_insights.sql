-- Yaratıcı paneli (docs/history/293-*): kişinin KENDİ yayınlanmış promptlarının son N gündeki performansı.
--
-- Yalnızca ekleyicidir (expand): tablo/sütun yok, dört okuma RPC'si. Hepsi SECURITY DEFINER çünkü
-- `prompt_copy_events` istemciye kapalı (politika yok) ve başkalarının özel koleksiyonlarındaki kaydetmeler
-- çağıranın RLS'inden görünmez. Güvenlik kuralı: kimlik daima `auth.uid()`; kapsam daima `prompts.author_id = auth.uid()`
-- (başkasının kimliği parametre olarak alınmaz); dönen şey YALNIZ toplu sayılardır — kimin kopyaladığı/beğendiği/kaydettiği
-- hiçbir yolla dönmez. Ziyaretçiye kapalı (`revoke … from public, anon`).
--
-- Kapsam: yayında + herkese açık + silinmemiş + topluluğa ait OLMAYAN (`community_id is null`) promptlar.
-- Günler UTC'dir (`prompt_copy_events.day` zaten UTC). Bir "dönem" = bugün dahil son `p_days` gün; "önceki dönem" =
-- ondan hemen önceki aynı uzunlukta pencere (artış/azalış yüzdesi için).
--
-- Sınırlar (arayüzde de söylenir): (1) kopyalama = o gün o promptu kopyalayan oturumlu kullanıcı başına BİR (misafir ve yazar
-- sayılmaz); (2) tepki/kaydetme/takip zamanı ilk eklendikleri `created_at`'tir — geri alınan geçmişten düşer, tepki değişimi
-- zamanı oynatmaz; (3) kaydetme = aynı kişinin aynı promptu o dönemde ilk koleksiyona koyması (iki koleksiyon tek sayılır).

create or replace function public._creator_insights_window(p_days integer)
returns table (win_start date, win_end date, prev_start date)
language sql
stable
set search_path = public
as $$
  select
    ((now() at time zone 'utc')::date - (least(greatest(coalesce(p_days, 30), 1), 90) - 1))  as win_start,
    (now() at time zone 'utc')::date                                                         as win_end,
    ((now() at time zone 'utc')::date - (2 * least(greatest(coalesce(p_days, 30), 1), 90) - 1)) as prev_start
$$;
revoke all on function public._creator_insights_window(integer) from public, anon, authenticated;

-- 1) Özet: dönem + önceki dönem, tek satır.
create or replace function public.creator_insights_summary(p_days integer default 30)
returns table (
  copies integer, prev_copies integer,
  reactions integer, prev_reactions integer,
  comments integer, prev_comments integer,
  saves integer, prev_saves integer,
  followers integer, prev_followers integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  with mine as (
    select p.id from public.prompts p
    where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null
  ),
  cp as (
    select count(*) filter (where e.day >= v_start)::integer as cur,
           count(*) filter (where e.day < v_start)::integer as prev
    from public.prompt_copy_events e
    where e.prompt_id in (select id from mine) and e.day between v_prev and v_end and e.user_id <> v_me
  ),
  rx as (
    select count(*) filter (where (l.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (l.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_likes l
    where l.prompt_id in (select id from mine) and l.user_id <> v_me
      and (l.created_at at time zone 'utc')::date between v_prev and v_end
  ),
  cm as (
    select count(*) filter (where (c.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (c.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_comments c
    where c.prompt_id in (select id from mine) and c.author_id <> v_me and c.deleted_at is null
      and (c.created_at at time zone 'utc')::date between v_prev and v_end
  ),
  sv as (
    select count(*) filter (where d >= v_start)::integer as cur,
           count(*) filter (where d < v_start)::integer as prev
    from (
      select ci.prompt_id, co.owner_id, min((ci.created_at at time zone 'utc')::date) as d
      from public.collection_items ci
      join public.collections co on co.id = ci.collection_id
      where ci.prompt_id in (select id from mine) and co.owner_id <> v_me
      group by ci.prompt_id, co.owner_id
    ) s
    where d between v_prev and v_end
  ),
  fl as (
    select count(*) filter (where (f.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (f.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.follows f
    where f.following_id = v_me and (f.created_at at time zone 'utc')::date between v_prev and v_end
  )
  select cp.cur, cp.prev, rx.cur, rx.prev, cm.cur, cm.prev, sv.cur, sv.prev, fl.cur, fl.prev
  from cp, rx, cm, sv, fl;
end $$;
revoke all on function public.creator_insights_summary(integer) from public, anon;
grant execute on function public.creator_insights_summary(integer) to authenticated;

-- 2) Günlük seri: boş günler dahil, her gün için kopyalama/tepki/yorum.
create or replace function public.creator_insights_daily(p_days integer default 30)
returns table (day date, copies integer, reactions integer, comments integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end into v_start, v_end from public._creator_insights_window(p_days) w;

  return query
  with mine as (
    select p.id from public.prompts p
    where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null
  ),
  cp as (
    select e.day as d, count(*)::integer as n from public.prompt_copy_events e
    where e.prompt_id in (select id from mine) and e.day between v_start and v_end and e.user_id <> v_me
    group by e.day
  ),
  rx as (
    select (l.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_likes l
    where l.prompt_id in (select id from mine) and l.user_id <> v_me
      and (l.created_at at time zone 'utc')::date between v_start and v_end
    group by 1
  ),
  cm as (
    select (c.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_comments c
    where c.prompt_id in (select id from mine) and c.author_id <> v_me and c.deleted_at is null
      and (c.created_at at time zone 'utc')::date between v_start and v_end
    group by 1
  )
  select g.d::date, coalesce(cp.n, 0), coalesce(rx.n, 0), coalesce(cm.n, 0)
  from generate_series(v_start, v_end, interval '1 day') as g(d)
  left join cp on cp.d = g.d::date
  left join rx on rx.d = g.d::date
  left join cm on cm.d = g.d::date
  order by g.d;
end $$;
revoke all on function public.creator_insights_daily(integer) from public, anon;
grant execute on function public.creator_insights_daily(integer) to authenticated;

-- 3) En iyi promptlar: dönemde en çok kopyalanan (eşitlikte tepki, sonra en yeni).
create or replace function public.creator_insights_top(p_days integer default 30, p_limit integer default 5)
returns table (
  id uuid, title text, content_type text, tools text[],
  copies integer, reactions integer, prev_copies integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  with mine as (
    select p.id, p.title, p.content_type, p.tools, p.created_at from public.prompts p
    where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null
  ),
  cp as (
    select e.prompt_id as pid,
           count(*) filter (where e.day >= v_start)::integer as cur,
           count(*) filter (where e.day < v_start)::integer as prev
    from public.prompt_copy_events e
    where e.prompt_id in (select m.id from mine m) and e.day between v_prev and v_end and e.user_id <> v_me
    group by e.prompt_id
  ),
  rx as (
    select l.prompt_id as pid, count(*)::integer as cur from public.prompt_likes l
    where l.prompt_id in (select m.id from mine m) and l.user_id <> v_me
      and (l.created_at at time zone 'utc')::date between v_start and v_end
    group by l.prompt_id
  )
  select m.id, m.title, m.content_type, m.tools,
         coalesce(cp.cur, 0), coalesce(rx.cur, 0), coalesce(cp.prev, 0)
  from mine m
  left join cp on cp.pid = m.id
  left join rx on rx.pid = m.id
  where coalesce(cp.cur, 0) > 0 or coalesce(rx.cur, 0) > 0
  order by coalesce(cp.cur, 0) desc, coalesce(rx.cur, 0) desc, m.created_at desc, m.id
  limit v_limit;
end $$;
revoke all on function public.creator_insights_top(integer, integer) from public, anon;
grant execute on function public.creator_insights_top(integer, integer) to authenticated;

-- 4) Tepki dağılımı: dönemde alınan tepkiler, türe göre.
create or replace function public.creator_insights_reaction_mix(p_days integer default 30)
returns table (reaction text, n integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end into v_start, v_end from public._creator_insights_window(p_days) w;

  return query
  select l.reaction, count(*)::integer
  from public.prompt_likes l
  where l.prompt_id in (
      select p.id from public.prompts p
      where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
        and p.deleted_at is null and p.community_id is null
    )
    and l.user_id <> v_me
    and (l.created_at at time zone 'utc')::date between v_start and v_end
  group by l.reaction
  order by count(*) desc, l.reaction;
end $$;
revoke all on function public.creator_insights_reaction_mix(integer) from public, anon;
grant execute on function public.creator_insights_reaction_mix(integer) to authenticated;
