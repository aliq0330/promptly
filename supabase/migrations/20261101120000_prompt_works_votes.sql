-- "Çalıştı mı?" oyu (Promptly Skoru'nun ilk dilimi; docs/history/296-*): promptu KOPYALAMIŞ biri "çalıştı / çalışmadı" der.
--
-- Yalnızca ekleyicidir (expand): iki yeni tablo + iki RPC + tetikleyiciler; mevcut hiçbir şey değişmez/silinmez.
--   * `prompt_works_votes`  — kişi başına prompt başına TEK oy. İstemciye kapalı (politika/yetki yok): yalnız RPC yazar ve okur.
--   * `prompt_works_stats`  — prompt başına evet/hayır sayıları (SECURITY DEFINER tetikleyiciyle tutulur, istemci yazamaz; `reaction_stats` kalıbı).
--     Okuma = çağıran o promptu okuyabiliyorsa (kendi RLS'inden geçer; `using (true)` YOK, docs/history/195-*).
--   * `set_prompt_works(p_prompt_id, p_works)` — oy ver / değiştir / (null) geri al.
--   * `prompt_works_state(p_prompt_id)` — sayılar + benim oyum + oy verebilir miyim (kopyalama geçmişi istemciye kapalı olduğu için sunucuda hesaplanır).
--
-- Kötüye kullanma önlemleri (sunucuda; istemci tek koruma değildir): oy veren GERÇEKTEN kopyalamış olmalı (`prompt_copy_events`, oturumlu +
-- yazar sayılmaz), yazar kendi promptuna oy veremez, engelleme iki yönlü, askı/paylaşım engeli (`enforce_can_post`), saatte 30 oy (`enforce_rate_limit`),
-- yalnız yayında + herkese açık + topluluğa ait olmayan prompt. Kısa kodlar: `not_found`, `self_vote_not_allowed`, `copy_required`, `interaction_blocked`.
-- Skor FORMÜLÜ/sıralaması bu dilimde YOK (istemci yalnız sayıları ve eşikli bir rozeti gösterir); veri birikince `feed_page`'e ayrı bir iş olarak eklenir.

create table if not exists public.prompt_works_votes (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  works boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (prompt_id, user_id)
);
alter table public.prompt_works_votes enable row level security;
revoke all on public.prompt_works_votes from public, anon, authenticated;
create index if not exists prompt_works_votes_user_idx on public.prompt_works_votes (user_id);

create table if not exists public.prompt_works_stats (
  prompt_id uuid primary key references public.prompts (id) on delete cascade,
  yes_count integer not null default 0 check (yes_count >= 0),
  no_count integer not null default 0 check (no_count >= 0)
);
alter table public.prompt_works_stats enable row level security;
revoke all on public.prompt_works_stats from public, anon, authenticated;
grant select on public.prompt_works_stats to anon, authenticated;

-- Sayılar, ÇAĞIRAN o promptu okuyabiliyorsa okunur (promptun kendi RLS'inden geçer: özel/taslak/topluluk promptunun sayısı sızmaz).
drop policy if exists "Works counts are readable wherever the prompt is" on public.prompt_works_stats;
create policy "Works counts are readable wherever the prompt is"
  on public.prompt_works_stats for select
  using (exists (select 1 from public.prompts p where p.id = prompt_works_stats.prompt_id));

-- Sayaç tetikleyicisi: oy ekle / değiştir / sil → yes/no. Satır iki sayı da 0 olunca silinir.
create or replace function public._works_bump(p_prompt uuid, p_yes integer, p_no integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_yes > 0 or p_no > 0 then
    insert into public.prompt_works_stats (prompt_id, yes_count, no_count)
    values (p_prompt, greatest(p_yes, 0), greatest(p_no, 0))
    on conflict (prompt_id) do update
      set yes_count = greatest(public.prompt_works_stats.yes_count + p_yes, 0),
          no_count = greatest(public.prompt_works_stats.no_count + p_no, 0);
  else
    -- Yalnız AZALTMA (oy silindi): satır EKLENMEZ. Prompt silinirken kaskad oy silme bu yola düşer ve prompt artık yoktur (yabancı anahtar).
    update public.prompt_works_stats
       set yes_count = greatest(yes_count + p_yes, 0), no_count = greatest(no_count + p_no, 0)
     where prompt_id = p_prompt;
  end if;
  delete from public.prompt_works_stats where prompt_id = p_prompt and yes_count = 0 and no_count = 0;
end $$;
revoke all on function public._works_bump(uuid, integer, integer) from public, anon, authenticated;

create or replace function public.maintain_prompt_works_stats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._works_bump(new.prompt_id, case when new.works then 1 else 0 end, case when new.works then 0 else 1 end);
  elsif tg_op = 'DELETE' then
    perform public._works_bump(old.prompt_id, case when old.works then -1 else 0 end, case when old.works then 0 else -1 end);
  elsif new.works is distinct from old.works then
    perform public._works_bump(new.prompt_id, case when new.works then 1 else -1 end, case when new.works then -1 else 1 end);
  end if;
  return null;
end $$;
revoke all on function public.maintain_prompt_works_stats() from public, anon, authenticated;

drop trigger if exists prompt_works_votes_maintain_stats on public.prompt_works_votes;
create trigger prompt_works_votes_maintain_stats
  after insert or update or delete on public.prompt_works_votes
  for each row execute function public.maintain_prompt_works_stats();

-- Güvenlik/sosyal kurallar (docs/history/224-*): askı/paylaşım engeli ve hız sınırı yazma yolunda da geçerli.
drop trigger if exists prompt_works_votes_can_post on public.prompt_works_votes;
create trigger prompt_works_votes_can_post before insert or update on public.prompt_works_votes
  for each row execute function public.enforce_can_post('all');
drop trigger if exists prompt_works_votes_rate_limit on public.prompt_works_votes;
create trigger prompt_works_votes_rate_limit before insert on public.prompt_works_votes
  for each row execute function public.enforce_rate_limit('works_vote', '30', '3600');

-- Oy ver / değiştir / geri al. `p_works` null = oyu kaldır. Dönüş: güncel sayılar + benim oyum.
create or replace function public.set_prompt_works(p_prompt_id uuid, p_works boolean)
returns table (yes_count integer, no_count integer, my_vote boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select p.author_id into v_author from public.prompts p
  where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null;
  if not found then raise exception 'not_found'; end if;
  if v_author = v_me then raise exception 'self_vote_not_allowed'; end if;
  if public.is_blocked(v_me, v_author) then raise exception 'interaction_blocked'; end if;

  if p_works is null then
    delete from public.prompt_works_votes where prompt_id = p_prompt_id and user_id = v_me;
  else
    if not exists (select 1 from public.prompt_copy_events e where e.prompt_id = p_prompt_id and e.user_id = v_me) then
      raise exception 'copy_required';
    end if;
    insert into public.prompt_works_votes (prompt_id, user_id, works) values (p_prompt_id, v_me, p_works)
    on conflict (prompt_id, user_id) do update set works = excluded.works, updated_at = now();
  end if;

  return query
  select coalesce(s.yes_count, 0), coalesce(s.no_count, 0),
         (select v.works from public.prompt_works_votes v where v.prompt_id = p_prompt_id and v.user_id = v_me)
  from (select 1) as one left join public.prompt_works_stats s on s.prompt_id = p_prompt_id;
end $$;
revoke all on function public.set_prompt_works(uuid, boolean) from public, anon;
grant execute on function public.set_prompt_works(uuid, boolean) to authenticated;

-- Detay sayfasının tek çağrısı: sayılar + benim oyum + oy verebilir miyim. Ziyaretçiye de açıktır (sayılar herkese açık promptta herkese görünür;
-- ziyaretçide my_vote boş, can_vote false). Okunamayan prompt (özel/taslak/topluluk/yok) hepsi sıfır döner — varlığı sızmaz.
create or replace function public.prompt_works_state(p_prompt_id uuid)
returns table (yes_count integer, no_count integer, my_vote boolean, can_vote boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
begin
  select p.author_id into v_author from public.prompts p
  where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null;
  if not found then
    return query select 0, 0, null::boolean, false;
    return;
  end if;
  return query
  select coalesce(s.yes_count, 0), coalesce(s.no_count, 0),
         case when v_me is null then null else (select v.works from public.prompt_works_votes v where v.prompt_id = p_prompt_id and v.user_id = v_me) end,
         (v_me is not null and v_me <> v_author and not public.is_blocked(v_me, v_author)
            and exists (select 1 from public.prompt_copy_events e where e.prompt_id = p_prompt_id and e.user_id = v_me))
  from (select 1) as one left join public.prompt_works_stats s on s.prompt_id = p_prompt_id;
end $$;
revoke all on function public.prompt_works_state(uuid) from public;
grant execute on function public.prompt_works_state(uuid) to anon, authenticated;
