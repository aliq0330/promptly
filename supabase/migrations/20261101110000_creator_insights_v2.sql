-- Yaratıcı paneli v2 (docs/history/295-*): sonuç sayacı, prompt başına ayrıntı, kilometre taşı bildirimleri.
--
-- Yalnızca ekleyicidir (expand): yeni fonksiyonlar + bir tetikleyici; tablo/sütun yok, hiçbir şey silinmez. 294'teki dört RPC'nin dönüş şekli
-- DEĞİŞMEZ (dönüş tipini değiştirmek `drop function` ister) — sonuç sayısı bu yüzden ayrı bir RPC'dir.
--
-- Güvenlik kuralları 294'tekiyle aynıdır: SECURITY DEFINER, kimlik `auth.uid()`, kapsam `prompts.author_id = auth.uid()` (başkasının kimliği
-- parametre değildir; prompt kimliği verilirse prompt ÇAĞIRANIN olmalıdır, yoksa `not_found` — varlığı sızmaz), yalnız toplu sayı döner (kimin
-- kopyaladığı/beğendiği/sonuç paylaştığı dönmez), anon kapalı. Kapsam: yayında + herkese açık + silinmemiş + topluluğa ait olmayan.

-- 1) Sonuç sayacı: dönemde başkalarının promptlarının altına paylaştığı sonuç sayısı (+ önceki dönem).
create or replace function public.creator_insights_results(p_days integer default 30)
returns table (results integer, prev_results integer)
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
  select count(*) filter (where (r.created_at at time zone 'utc')::date >= v_start)::integer,
         count(*) filter (where (r.created_at at time zone 'utc')::date < v_start)::integer
  from public.prompt_results r
  where r.prompt_id in (
      select p.id from public.prompts p
      where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
        and p.deleted_at is null and p.community_id is null
    )
    and r.creator_id <> v_me
    and (r.created_at at time zone 'utc')::date between v_prev and v_end;
end $$;
revoke all on function public.creator_insights_results(integer) from public, anon;
grant execute on function public.creator_insights_results(integer) to authenticated;

-- Yardımcı: çağıranın tek bir promptu (yoksa/başkasınınsa `not_found`).
create or replace function public._creator_insights_own_prompt(p_prompt_id uuid)
returns table (id uuid, title text, content_type text, tools text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query
  select p.id, p.title, p.content_type, p.tools from public.prompts p
  where p.id = p_prompt_id and p.author_id = auth.uid() and p.status = 'published' and p.visibility = 'public'
    and p.deleted_at is null and p.community_id is null;
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function public._creator_insights_own_prompt(uuid) from public, anon, authenticated;

-- 2) Prompt başına özet: dönem + önceki dönem (kopyalama, tepki, yorum, kaydetme, sonuç).
create or replace function public.creator_insights_prompt(p_prompt_id uuid, p_days integer default 30)
returns table (
  title text, content_type text, tools text[],
  copies integer, prev_copies integer,
  reactions integer, prev_reactions integer,
  comments integer, prev_comments integer,
  saves integer, prev_saves integer,
  results integer, prev_results integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
  v_title text; v_type text; v_tools text[];
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select o.title, o.content_type, o.tools into v_title, v_type, v_tools from public._creator_insights_own_prompt(p_prompt_id) o;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  with cp as (
    select count(*) filter (where e.day >= v_start)::integer as cur, count(*) filter (where e.day < v_start)::integer as prev
    from public.prompt_copy_events e
    where e.prompt_id = p_prompt_id and e.day between v_prev and v_end and e.user_id <> v_me
  ),
  rx as (
    select count(*) filter (where (l.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (l.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_likes l
    where l.prompt_id = p_prompt_id and l.user_id <> v_me and (l.created_at at time zone 'utc')::date between v_prev and v_end
  ),
  cm as (
    select count(*) filter (where (c.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (c.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_comments c
    where c.prompt_id = p_prompt_id and c.author_id <> v_me and c.deleted_at is null
      and (c.created_at at time zone 'utc')::date between v_prev and v_end
  ),
  sv as (
    select count(*) filter (where d >= v_start)::integer as cur, count(*) filter (where d < v_start)::integer as prev
    from (
      select co.owner_id, min((ci.created_at at time zone 'utc')::date) as d
      from public.collection_items ci join public.collections co on co.id = ci.collection_id
      where ci.prompt_id = p_prompt_id and co.owner_id <> v_me
      group by co.owner_id
    ) s
    where d between v_prev and v_end
  ),
  rs as (
    select count(*) filter (where (r.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (r.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_results r
    where r.prompt_id = p_prompt_id and r.creator_id <> v_me and (r.created_at at time zone 'utc')::date between v_prev and v_end
  )
  select v_title, v_type, v_tools, cp.cur, cp.prev, rx.cur, rx.prev, cm.cur, cm.prev, sv.cur, sv.prev, rs.cur, rs.prev
  from cp, rx, cm, sv, rs;
end $$;
revoke all on function public.creator_insights_prompt(uuid, integer) from public, anon;
grant execute on function public.creator_insights_prompt(uuid, integer) to authenticated;

-- 3) Prompt başına günlük seri (boş günler dahil): kopyalama, tepki, yorum, sonuç.
create or replace function public.creator_insights_prompt_daily(p_prompt_id uuid, p_days integer default 30)
returns table (day date, copies integer, reactions integer, comments integer, results integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  perform 1 from public._creator_insights_own_prompt(p_prompt_id);
  select w.win_start, w.win_end into v_start, v_end from public._creator_insights_window(p_days) w;

  return query
  with cp as (
    select e.day as d, count(*)::integer as n from public.prompt_copy_events e
    where e.prompt_id = p_prompt_id and e.day between v_start and v_end and e.user_id <> v_me group by e.day
  ),
  rx as (
    select (l.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_likes l
    where l.prompt_id = p_prompt_id and l.user_id <> v_me and (l.created_at at time zone 'utc')::date between v_start and v_end group by 1
  ),
  cm as (
    select (c.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_comments c
    where c.prompt_id = p_prompt_id and c.author_id <> v_me and c.deleted_at is null
      and (c.created_at at time zone 'utc')::date between v_start and v_end group by 1
  ),
  rs as (
    select (r.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_results r
    where r.prompt_id = p_prompt_id and r.creator_id <> v_me and (r.created_at at time zone 'utc')::date between v_start and v_end group by 1
  )
  select g.d::date, coalesce(cp.n, 0), coalesce(rx.n, 0), coalesce(cm.n, 0), coalesce(rs.n, 0)
  from generate_series(v_start, v_end, interval '1 day') as g(d)
  left join cp on cp.d = g.d::date
  left join rx on rx.d = g.d::date
  left join cm on cm.d = g.d::date
  left join rs on rs.d = g.d::date
  order by g.d;
end $$;
revoke all on function public.creator_insights_prompt_daily(uuid, integer) from public, anon;
grant execute on function public.creator_insights_prompt_daily(uuid, integer) to authenticated;

-- 4) Prompt başına tepki dağılımı.
create or replace function public.creator_insights_prompt_reaction_mix(p_prompt_id uuid, p_days integer default 30)
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
  perform 1 from public._creator_insights_own_prompt(p_prompt_id);
  select w.win_start, w.win_end into v_start, v_end from public._creator_insights_window(p_days) w;

  return query
  select l.reaction, count(*)::integer from public.prompt_likes l
  where l.prompt_id = p_prompt_id and l.user_id <> v_me and (l.created_at at time zone 'utc')::date between v_start and v_end
  group by l.reaction order by count(*) desc, l.reaction;
end $$;
revoke all on function public.creator_insights_prompt_reaction_mix(uuid, integer) from public, anon;
grant execute on function public.creator_insights_prompt_reaction_mix(uuid, integer) to authenticated;

-- 5) Kilometre taşı bildirimleri: bir promptun kopyalama / tepki sayısı eşiği GEÇTİĞİNDE yazarına tek bildirim.
-- Mevcut `notifications` kalıbı: tür `system` (actor yok), `dedupe_key` ile aynı eşik bir daha yazılmaz. Birden çok eşik bir hamlede
-- geçilirse (toplu düzeltme/seed) yalnız EN YÜKSEĞİ bildirilir. Topluluğa özgü, taslak ve özel promptlar bildirim üretmez.
-- Cümle Türkçe saklanır (`notification-message.ts` İngilizceye çevirir): `Promptun "<başlık>" <n> kopyalamaya ulaştı.` / `… <n> tepkiye ulaştı.`
create or replace function public._notify_creator_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy_marks integer[] := array[10, 50, 100, 500, 1000, 5000, 10000];
  v_react_marks integer[] := array[10, 50, 100, 500, 1000, 5000];
  v_mark integer;
begin
  if new.author_id is null or new.community_id is not null or new.deleted_at is not null
     or new.status <> 'published' or new.visibility <> 'public' then
    return null;
  end if;

  if new.copy_count > old.copy_count then
    select max(m) into v_mark from unnest(v_copy_marks) as m where old.copy_count < m and m <= new.copy_count;
    if v_mark is not null then
      insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
      values (new.author_id, null, 'system',
              format('Promptun "%s" %s kopyalamaya ulaştı.', new.title, v_mark),
              '/insights/local?id=' || new.id, 'milestone:copies:' || new.id || ':' || v_mark)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  if new.like_count > old.like_count then
    v_mark := null;
    select max(m) into v_mark from unnest(v_react_marks) as m where old.like_count < m and m <= new.like_count;
    if v_mark is not null then
      insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
      values (new.author_id, null, 'system',
              format('Promptun "%s" %s tepkiye ulaştı.', new.title, v_mark),
              '/insights/local?id=' || new.id, 'milestone:reactions:' || new.id || ':' || v_mark)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;
  return null;
end $$;
revoke all on function public._notify_creator_milestones() from public, anon, authenticated;

drop trigger if exists prompts_notify_creator_milestones on public.prompts;
create trigger prompts_notify_creator_milestones
  after update of copy_count, like_count on public.prompts
  for each row
  when (new.copy_count > old.copy_count or new.like_count > old.like_count)
  execute function public._notify_creator_milestones();
