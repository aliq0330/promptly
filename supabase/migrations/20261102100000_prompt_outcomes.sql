-- "Çalıştı mı?" geri bildirimi (docs/history/296-*): kopyalayan kişi bir promptun gerçekten işe yarayıp yaramadığını söyler.
--
-- YALNIZCA EKLEYİCİ (expand): yeni tablo + yeni fonksiyonlar; mevcut hiçbir nesne değişmez, hiçbir şey silinmez.
--
--   * `prompt_outcomes`: kişi + prompt + araç başına TEK cevap (`worked` | `partial` | `failed`). Araç boş olabilir ('' = belirtilmedi);
--     aynı kişi aynı promptu farklı araçlarda ayrı ayrı değerlendirebilir (bir araçta çalışıp diğerinde çalışmayabilir).
--     Yalnız sahibi kendi satırlarını okur; istemci insert/update/delete yapamaz — yazma yalnız `set_prompt_outcome` RPC'sidir.
--   * `set_prompt_outcome(prompt, cevap, araç, sürüm)`: oturum, askı yok, prompt yayında + herkese açık + topluluğa ait değil, KENDİ promptuna
--     cevap yok, engel yok, o promptu daha önce KOPYALAMIŞ olmak (`prompt_copy_events`; sahte oyu azaltır), saatte ≤100 cevap (`_rate_limit`).
--     `p_outcome` null = cevabı geri al (içerik gizlense bile geri alınabilir). Dönüş: kaydedilen cevap (geri alınca null).
--   * `prompt_outcome_stats(prompt)`: araç + sürüm başına sayılar. Herkese açık okunur (ziyaretçi dahil); sayaç sütunu YOK — kişi sayısı
--     küçüktür ve tek promptun satırları `unique (prompt_id, …)` dizininden okunur, bu yüzden `protect_counter_columns` gerekmez.
--   * `has_copied_prompt(prompt)`: arayüz "Denedin mi?" kartını kopyalamış kişiye gösterir (`prompt_copy_events` istemciye kapalıdır).
--   * `creator_insights_prompt_outcomes(prompt)`: yazar kendi promptunun toplam cevap sayılarını görür (294/295 kuralları: yalnız toplu sayı).

create table if not exists public.prompt_outcomes (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  outcome text not null check (outcome in ('worked', 'partial', 'failed')),
  tool text not null default '' check (char_length(tool) <= 80),
  tool_version text not null default '' check (char_length(tool_version) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompt_outcomes_one_per_tool unique (prompt_id, user_id, tool)
);
create index if not exists prompt_outcomes_user_idx on public.prompt_outcomes (user_id);

alter table public.prompt_outcomes enable row level security;
revoke all on public.prompt_outcomes from public, anon, authenticated;
grant select on public.prompt_outcomes to authenticated;
drop policy if exists "prompt_outcomes owner read" on public.prompt_outcomes;
create policy "prompt_outcomes owner read" on public.prompt_outcomes for select to authenticated using (user_id = auth.uid());
-- İstemci insert/update/delete politikası YOK: yazma yalnız aşağıdaki RPC.

create or replace function public.set_prompt_outcome(p_prompt_id uuid, p_outcome text, p_tool text default '', p_tool_version text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_author uuid;
  v_tool text := left(btrim(coalesce(p_tool, '')), 80);
  v_version text := left(btrim(coalesce(p_tool_version, '')), 40);
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_prompt_id is null or (p_outcome is not null and p_outcome not in ('worked', 'partial', 'failed')) then
    raise exception 'invalid_outcome';
  end if;

  if p_outcome is null then
    delete from public.prompt_outcomes where prompt_id = p_prompt_id and user_id = v_user and tool = v_tool;
    return null;
  end if;

  perform public._assert_can_act(false);

  select p.author_id into v_author from public.prompts p
   where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null;
  if v_author is null then
    raise exception 'content_not_found';
  end if;
  if v_author = v_user then
    raise exception 'self_outcome_not_allowed';
  end if;
  if public.is_blocked(v_author, v_user) then
    raise exception 'interaction_blocked';
  end if;
  if not exists (select 1 from public.prompt_copy_events e where e.prompt_id = p_prompt_id and e.user_id = v_user) then
    raise exception 'outcome_requires_copy';
  end if;

  perform public._rate_limit('prompt_outcome', 100, interval '1 hour');

  insert into public.prompt_outcomes (prompt_id, user_id, outcome, tool, tool_version)
  values (p_prompt_id, v_user, p_outcome, v_tool, v_version)
  on conflict (prompt_id, user_id, tool) do update
    set outcome = excluded.outcome, tool_version = excluded.tool_version, updated_at = now();
  return p_outcome;
end;
$$;
revoke all on function public.set_prompt_outcome(uuid, text, text, text) from public, anon;
grant execute on function public.set_prompt_outcome(uuid, text, text, text) to authenticated;

create or replace function public.prompt_outcome_stats(p_prompt_id uuid)
returns table (tool text, tool_version text, worked integer, partial integer, failed integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select p.author_id into v_author from public.prompts p
   where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null;
  if v_author is null then
    return;
  end if;
  if auth.uid() is not null and public.is_blocked(v_author, auth.uid()) then
    return;
  end if;
  return query
  select o.tool, o.tool_version,
         count(*) filter (where o.outcome = 'worked')::integer,
         count(*) filter (where o.outcome = 'partial')::integer,
         count(*) filter (where o.outcome = 'failed')::integer
    from public.prompt_outcomes o
   where o.prompt_id = p_prompt_id
   group by o.tool, o.tool_version
   order by count(*) desc, o.tool
   limit 50;
end;
$$;
revoke all on function public.prompt_outcome_stats(uuid) from public;
grant execute on function public.prompt_outcome_stats(uuid) to anon, authenticated;

create or replace function public.has_copied_prompt(p_prompt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.prompt_copy_events e where e.prompt_id = p_prompt_id and e.user_id = auth.uid());
$$;
revoke all on function public.has_copied_prompt(uuid) from public, anon;
grant execute on function public.has_copied_prompt(uuid) to authenticated;

create or replace function public.creator_insights_prompt_outcomes(p_prompt_id uuid)
returns table (worked integer, partial integer, failed integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform 1 from public._creator_insights_own_prompt(p_prompt_id);
  return query
  select count(*) filter (where o.outcome = 'worked')::integer,
         count(*) filter (where o.outcome = 'partial')::integer,
         count(*) filter (where o.outcome = 'failed')::integer
    from public.prompt_outcomes o
   where o.prompt_id = p_prompt_id and o.user_id <> auth.uid();
end;
$$;
revoke all on function public.creator_insights_prompt_outcomes(uuid) from public, anon;
grant execute on function public.creator_insights_prompt_outcomes(uuid) to authenticated;
