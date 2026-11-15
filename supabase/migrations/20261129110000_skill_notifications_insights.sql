-- Skill: yayın → takipçilere, yeni sürüm → sabitleyenlere bildirim + Yaratıcı paneli Skill sayıları (Aşama 3 kalanı, docs/history/391-*). Yalnız ekleyici.
--
-- Bir olay bütün takipçilere yazmaz kuralı (docs/history/258-*): tek `insert … select`, üst sınır 20 000. Sessize alma/tür tercihi `notifications` BEFORE INSERT
-- tetikleyicisinde uygulanır (ayrıca bir şey yapılmaz). Engelli çift iki yönlü atlanır. Bildirim türü mevcut `system` (yeni tür açılmaz).

create or replace function public.notify_skill_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.visibility = 'public'
     and (tg_op = 'INSERT' or old.status is distinct from 'published' or old.visibility is distinct from 'public') then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    select f.follower_id, new.author_id, 'system',
           'Yeni bir Skill yayınladı: "' || public.truncate_preview(coalesce(new.title, '')) || '"',
           '/skills/local?id=' || new.id,
           'skill_published:' || new.id || ':' || f.follower_id
      from public.follows f
     where f.following_id = new.author_id
       and not exists (select 1 from public.blocks b
                        where (b.blocker_id = f.follower_id and b.blocked_id = new.author_id)
                           or (b.blocker_id = new.author_id and b.blocked_id = f.follower_id))
     limit 20000
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end $$;
drop trigger if exists skills_after_write_notify_published on public.skills;
create trigger skills_after_write_notify_published after insert or update of status, visibility on public.skills
  for each row execute function public.notify_skill_published();
revoke all on function public.notify_skill_published() from public, anon, authenticated;

create or replace function public.notify_skill_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_title text;
begin
  select author_id, title into v_author, v_title from public.skills where id = new.skill_id;
  if v_author is null then return new; end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  select p.user_id, v_author, 'system',
         'Sabitlediğin Skill''in yeni sürümü yayınlandı: "' || public.truncate_preview(coalesce(v_title, '')) || ' ' || new.version || '"',
         '/skills/local?id=' || new.skill_id,
         'skill_version:' || new.id || ':' || p.user_id
    from public.skill_pins p
   where p.skill_id = new.skill_id and p.user_id <> v_author
     and not exists (select 1 from public.blocks b
                      where (b.blocker_id = p.user_id and b.blocked_id = v_author) or (b.blocker_id = v_author and b.blocked_id = p.user_id))
   limit 20000
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end $$;
drop trigger if exists skill_versions_after_insert_notify on public.skill_versions;
create trigger skill_versions_after_insert_notify after insert on public.skill_versions
  for each row execute function public.notify_skill_version();
revoke all on function public.notify_skill_version() from public, anon, authenticated;

-- Yaratıcı paneli: kendi yayınlanmış Skill'lerinin dönem sayıları (önceki döneme göre). Kapsam `author_id = auth.uid()`, toplu sayı döner (kişi listesi YOK).
create or replace function public.creator_insights_skills(p_days integer default 30)
returns table(skill_id uuid, title text, uses integer, prev_uses integer, reactions integer, prev_reactions integer,
              comments integer, prev_comments integer, saves integer, prev_saves integer)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;
  return query
  select s.id, s.title,
    (select count(*) filter (where u.day >= v_start)::integer from public.skill_uses u where u.skill_id = s.id and u.day between v_prev and v_end and u.user_id <> v_me),
    (select count(*) filter (where u.day < v_start)::integer from public.skill_uses u where u.skill_id = s.id and u.day between v_prev and v_end and u.user_id <> v_me),
    (select count(*) filter (where (l.created_at at time zone 'utc')::date >= v_start)::integer from public.prompt_likes l where l.skill_id = s.id and l.user_id <> v_me and (l.created_at at time zone 'utc')::date between v_prev and v_end),
    (select count(*) filter (where (l.created_at at time zone 'utc')::date < v_start)::integer from public.prompt_likes l where l.skill_id = s.id and l.user_id <> v_me and (l.created_at at time zone 'utc')::date between v_prev and v_end),
    (select count(*) filter (where (c.created_at at time zone 'utc')::date >= v_start)::integer from public.prompt_comments c where c.skill_id = s.id and c.author_id <> v_me and c.deleted_at is null and (c.created_at at time zone 'utc')::date between v_prev and v_end),
    (select count(*) filter (where (c.created_at at time zone 'utc')::date < v_start)::integer from public.prompt_comments c where c.skill_id = s.id and c.author_id <> v_me and c.deleted_at is null and (c.created_at at time zone 'utc')::date between v_prev and v_end),
    (select count(*) filter (where x.d >= v_start)::integer from (select min((ci.created_at at time zone 'utc')::date) as d from public.collection_items ci join public.collections co on co.id = ci.collection_id where ci.skill_id = s.id and co.owner_id <> v_me group by co.owner_id) x where x.d between v_prev and v_end),
    (select count(*) filter (where x.d < v_start)::integer from (select min((ci.created_at at time zone 'utc')::date) as d from public.collection_items ci join public.collections co on co.id = ci.collection_id where ci.skill_id = s.id and co.owner_id <> v_me group by co.owner_id) x where x.d between v_prev and v_end)
  from public.skills s
  where s.author_id = v_me and s.status = 'published' and s.visibility = 'public'
  order by s.created_at desc
  limit 100;
end $$;
revoke all on function public.creator_insights_skills(integer) from public, anon;
grant execute on function public.creator_insights_skills(integer) to authenticated;
