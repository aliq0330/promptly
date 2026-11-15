-- Skill: "Çalıştı mı?" oyu (Aşama 6, docs/history/393-*). `prompt_works_votes` kalıbının birebir karşılığı; yalnız ekleyici.
--
-- Kural: oy verebilmek için o Skill'i GERÇEKTEN kullanmış olmalısın (`skill_uses`: indirme kaydı, kişi-Skill-gün) — prompttaki "kopyalamış olmalı" şartının karşılığı;
-- yazar oy veremez; engel iki yönlü; saatte 30; yalnız yayında + herkese açık Skill. Oy tablosu istemciye KAPALI (yazma/okuma yalnız RPC), sayılar `skill_works_stats`
-- (SECURITY DEFINER tetikleyiciyle tutulur, istemci yazamaz; okuma = Skill'i okuyabilen).

create table if not exists public.skill_works_votes (
  skill_id uuid not null references public.skills (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  works boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (skill_id, user_id)
);
alter table public.skill_works_votes enable row level security;
revoke all on public.skill_works_votes from public, anon, authenticated;
create index if not exists skill_works_votes_user_idx on public.skill_works_votes (user_id);

create table if not exists public.skill_works_stats (
  skill_id uuid primary key references public.skills (id) on delete cascade,
  yes_count integer not null default 0 check (yes_count >= 0),
  no_count integer not null default 0 check (no_count >= 0)
);
alter table public.skill_works_stats enable row level security;
revoke all on public.skill_works_stats from public, anon, authenticated;
grant select on public.skill_works_stats to anon, authenticated;
drop policy if exists "Skill works counts are readable wherever the skill is" on public.skill_works_stats;
create policy "Skill works counts are readable wherever the skill is" on public.skill_works_stats for select
  using (exists (select 1 from public.skills s where s.id = skill_works_stats.skill_id));

create or replace function public._skill_works_bump(p_skill uuid, p_yes integer, p_no integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_yes > 0 or p_no > 0 then
    insert into public.skill_works_stats (skill_id, yes_count, no_count) values (p_skill, greatest(p_yes, 0), greatest(p_no, 0))
    on conflict (skill_id) do update
      set yes_count = greatest(public.skill_works_stats.yes_count + p_yes, 0), no_count = greatest(public.skill_works_stats.no_count + p_no, 0);
  else
    -- Yalnız AZALTMA: satır EKLENMEZ (Skill silinirken kaskad oy silme bu yola düşer; Skill artık yoktur → yabancı anahtar).
    update public.skill_works_stats set yes_count = greatest(yes_count + p_yes, 0), no_count = greatest(no_count + p_no, 0) where skill_id = p_skill;
  end if;
  delete from public.skill_works_stats where skill_id = p_skill and yes_count = 0 and no_count = 0;
end $$;
revoke all on function public._skill_works_bump(uuid, integer, integer) from public, anon, authenticated;

create or replace function public.maintain_skill_works_stats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._skill_works_bump(new.skill_id, case when new.works then 1 else 0 end, case when new.works then 0 else 1 end);
  elsif tg_op = 'DELETE' then
    perform public._skill_works_bump(old.skill_id, case when old.works then -1 else 0 end, case when old.works then 0 else -1 end);
  elsif new.works is distinct from old.works then
    perform public._skill_works_bump(new.skill_id, case when new.works then 1 else -1 end, case when new.works then -1 else 1 end);
  end if;
  return null;
end $$;
revoke all on function public.maintain_skill_works_stats() from public, anon, authenticated;
drop trigger if exists skill_works_votes_maintain_stats on public.skill_works_votes;
create trigger skill_works_votes_maintain_stats after insert or update or delete on public.skill_works_votes
  for each row execute function public.maintain_skill_works_stats();
drop trigger if exists skill_works_votes_can_post on public.skill_works_votes;
create trigger skill_works_votes_can_post before insert or update on public.skill_works_votes for each row execute function public.enforce_can_post('all');
drop trigger if exists skill_works_votes_rate_limit on public.skill_works_votes;
create trigger skill_works_votes_rate_limit before insert on public.skill_works_votes for each row execute function public.enforce_rate_limit('works_vote', '30', '3600');

create or replace function public.set_skill_works(p_skill_id uuid, p_works boolean)
returns table (yes_count integer, no_count integer, my_vote boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select s.author_id into v_author from public.skills s where s.id = p_skill_id and s.status = 'published' and s.visibility = 'public';
  if not found then raise exception 'not_found'; end if;
  if v_author = v_me then raise exception 'self_vote_not_allowed'; end if;
  if public.is_blocked(v_me, v_author) then raise exception 'interaction_blocked'; end if;
  if p_works is null then
    delete from public.skill_works_votes where skill_id = p_skill_id and user_id = v_me;
  else
    if not exists (select 1 from public.skill_uses u where u.skill_id = p_skill_id and u.user_id = v_me) then
      raise exception 'use_required';
    end if;
    insert into public.skill_works_votes (skill_id, user_id, works) values (p_skill_id, v_me, p_works)
    on conflict (skill_id, user_id) do update set works = excluded.works, updated_at = now();
  end if;
  return query
  select coalesce(s.yes_count, 0), coalesce(s.no_count, 0),
         (select v.works from public.skill_works_votes v where v.skill_id = p_skill_id and v.user_id = v_me)
  from (select 1) as one left join public.skill_works_stats s on s.skill_id = p_skill_id;
end $$;
revoke all on function public.set_skill_works(uuid, boolean) from public, anon;
grant execute on function public.set_skill_works(uuid, boolean) to authenticated;

create or replace function public.skill_works_state(p_skill_id uuid)
returns table (yes_count integer, no_count integer, my_vote boolean, can_vote boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
begin
  select s.author_id into v_author from public.skills s where s.id = p_skill_id and s.status = 'published' and s.visibility = 'public';
  if not found then
    return query select 0, 0, null::boolean, false;
    return;
  end if;
  return query
  select coalesce(s.yes_count, 0), coalesce(s.no_count, 0),
         case when v_me is null then null else (select v.works from public.skill_works_votes v where v.skill_id = p_skill_id and v.user_id = v_me) end,
         (v_me is not null and v_me <> v_author and not public.is_blocked(v_me, v_author)
            and exists (select 1 from public.skill_uses u where u.skill_id = p_skill_id and u.user_id = v_me))
  from (select 1) as one left join public.skill_works_stats s on s.skill_id = p_skill_id;
end $$;
revoke all on function public.skill_works_state(uuid) from public;
grant execute on function public.skill_works_state(uuid) to anon, authenticated;
