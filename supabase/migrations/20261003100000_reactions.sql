-- Telegram tarzı tepkiler (docs/history/265-*): beğeni artık altı tepkiden biridir (Sevdim, Ateş, Vay be, Alkış, Komik, Faydalı).
--
-- TASARIM: tepki ayrı bir tablo DEĞİL, mevcut `prompt_likes` satırının bir sütunudur. Her tepki hâlâ bir "beğeni" sayılır:
--   * `like_count` (içerik tablolarındaki sayaçlar, Keşfet "Popüler", Sana özel, istatistik, bildirim) TOPLAM tepkidir — hiçbiri değişmez,
--   * tepkiyi değiştirmek satırı UPDATE eder (silip eklemek sayacı ve bildirimi boşuna oynatırdı),
--   * eski satırlar ve eski istemciler `reaction = 'love'` (varsayılan) olarak çalışmaya devam eder.
--
-- Bu dosya YALNIZCA ekler (expand): sütun, üretilmiş sütun, indeks, tablo, tetikleyici, politika, fonksiyon. `drop` yok.
-- NOT: `target_id` STORED üretilmiş sütundur; eklenirken `prompt_likes` bir kez yeniden yazılır (kısa kilit, tablo küçük).

-- === 1. Sütunlar ============================================================================================================================
alter table public.prompt_likes add column if not exists reaction text not null default 'love';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prompt_likes_reaction_check') then
    alter table public.prompt_likes add constraint prompt_likes_reaction_check
      check (reaction in ('love', 'fire', 'wow', 'clap', 'haha', 'idea'));
  end if;
end $$;

-- Sekiz hedef sütunundan dolu olan (CHECK tam birini garanti eder): tepki sayımı ve "kim verdi" listesi tek sütundan okunur.
alter table public.prompt_likes add column if not exists target_id uuid generated always as
  (coalesce(prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, space_id, quote_id)) stored;

create index if not exists prompt_likes_target_recent_idx on public.prompt_likes (target_id, created_at desc, id desc);
create index if not exists prompt_likes_target_reaction_recent_idx on public.prompt_likes (target_id, reaction, created_at desc, id desc);

-- === 2. Hedef başına tepki sayıları ==========================================================================================================
-- Kart başına `count(*) … group by` yok (docs/history/258-*): sayılar tetikleyiciyle tutulur, okuma 6 satırlık anahtar aramasıdır.
create table if not exists public.reaction_stats (
  target_id uuid not null,
  reaction text not null check (reaction in ('love', 'fire', 'wow', 'clap', 'haha', 'idea')),
  n integer not null check (n > 0),
  primary key (target_id, reaction)
);
alter table public.reaction_stats enable row level security;
revoke all on public.reaction_stats from public, anon, authenticated;

-- Sayılar, ÇAĞIRAN o hedefin beğenilerini okuyabiliyorsa okunur: koşul `prompt_likes` politikasından (hedefin kendi RLS'inden) geçer, ayrıca bir
-- okunabilirlik kuralı yazılmaz (docs/history/195-*). Kapalı topluluğun içeriğinin tepki sayısı üye olmayana görünmez.
drop policy if exists "Reaction counts are readable wherever the target's likes are" on public.reaction_stats;
create policy "Reaction counts are readable wherever the target's likes are"
  on public.reaction_stats for select
  using (exists (select 1 from public.prompt_likes pl where pl.target_id = reaction_stats.target_id));
grant select on public.reaction_stats to anon, authenticated;

create or replace function public._reaction_bump(p_target uuid, p_reaction text, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_target is null then return; end if;
  if p_delta > 0 then
    insert into public.reaction_stats (target_id, reaction, n) values (p_target, p_reaction, p_delta)
      on conflict (target_id, reaction) do update set n = public.reaction_stats.n + excluded.n;
  else
    delete from public.reaction_stats where target_id = p_target and reaction = p_reaction and n + p_delta <= 0;
    update public.reaction_stats set n = n + p_delta where target_id = p_target and reaction = p_reaction;
  end if;
end $$;
revoke all on function public._reaction_bump(uuid, text, integer) from public, anon, authenticated;

create or replace function public.maintain_reaction_stats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._reaction_bump(new.target_id, new.reaction, 1);
  elsif tg_op = 'DELETE' then
    perform public._reaction_bump(old.target_id, old.reaction, -1);
  elsif new.reaction is distinct from old.reaction or new.target_id is distinct from old.target_id then
    -- Tepki değişti, ya da sunucu beğeniyi başka hedefe taşıdı (docs/history/241-*: Space beğenisi → alıntı).
    perform public._reaction_bump(old.target_id, old.reaction, -1);
    perform public._reaction_bump(new.target_id, new.reaction, 1);
  end if;
  return null;
end $$;
revoke all on function public.maintain_reaction_stats() from public, anon, authenticated;

drop trigger if exists prompt_likes_maintain_reaction_stats on public.prompt_likes;
create trigger prompt_likes_maintain_reaction_stats
  after insert or delete or update on public.prompt_likes
  for each row execute function public.maintain_reaction_stats();

-- Var olan beğenileri say (tekrar çalıştırılabilir).
insert into public.reaction_stats (target_id, reaction, n)
select target_id, reaction, count(*) from public.prompt_likes where target_id is not null group by target_id, reaction
on conflict (target_id, reaction) do update set n = excluded.n;

-- === 3. Tepkiyi değiştirme ===================================================================================================================
-- Yalnız KENDİ satırının `reaction` sütunu değişir; hedef/kullanıcı/zaman sabittir.
drop policy if exists "Users can change their own reaction" on public.prompt_likes;
create policy "Users can change their own reaction"
  on public.prompt_likes for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.enforce_reaction_only_update()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Yalnız İSTEMCİ rolleri kısıtlıdır: sunucu işleri (SECURITY DEFINER / migration) beğeniyi başka hedefe taşıyabilir (docs/history/241-*).
  if current_user not in ('anon', 'authenticated') then return new; end if;
  -- `target_id` üretilmiş sütundur ve BEFORE tetikleyicisinde henüz hesaplanmamıştır; zaten sekiz (değişmez) hedef sütunundan türer.
  if (to_jsonb(new) - 'reaction' - 'target_id') is distinct from (to_jsonb(old) - 'reaction' - 'target_id') then
    raise exception 'like_immutable';
  end if;
  return new;
end $$;
revoke all on function public.enforce_reaction_only_update() from public, anon, authenticated;

drop trigger if exists prompt_likes_reaction_only on public.prompt_likes;
create trigger prompt_likes_reaction_only before update on public.prompt_likes
  for each row execute function public.enforce_reaction_only_update();

-- Askı/paylaşım engeli, engelleme ve hız sınırı değişiklikte de geçerlidir (docs/history/224-*).
drop trigger if exists prompt_likes_reaction_can_post on public.prompt_likes;
create trigger prompt_likes_reaction_can_post before update of reaction on public.prompt_likes
  for each row execute function public.enforce_can_post('all');
drop trigger if exists prompt_likes_reaction_like_rules on public.prompt_likes;
create trigger prompt_likes_reaction_like_rules before update of reaction on public.prompt_likes
  for each row execute function public.enforce_like_rules();
drop trigger if exists prompt_likes_reaction_rate_limit on public.prompt_likes;
create trigger prompt_likes_reaction_rate_limit before update of reaction on public.prompt_likes
  for each row execute function public.enforce_rate_limit('reaction', '120', '600');

-- === 4. "Takip ettiklerimden kim tepki verdi" =================================================================================================
-- Kartın/sayfanın "Sen, Zeynep ve 128 kişi" cümlesi için: hedef başına, çağıranın TAKİP ETTİĞİ en çok `p_per` kişi (en yeni önce).
-- SECURITY INVOKER: satırlar `prompt_likes` RLS'inden geçer (okunamayan hedefin beğenisi gelmez); ziyaretçide boş döner.
create or replace function public.reaction_friends(p_ids uuid[], p_per integer default 2)
returns table (target_id uuid, user_id uuid, reaction text, username text, display_name text, avatar_url text)
language sql stable security invoker set search_path = public as $$
  select x.target_id, x.user_id, x.reaction, p.username, p.display_name, p.avatar_url
  from (
    select l.target_id, l.user_id, l.reaction,
           row_number() over (partition by l.target_id order by l.created_at desc, l.id desc) as rn
    from public.prompt_likes l
    join public.follows f on f.following_id = l.user_id and f.follower_id = auth.uid()
    where l.target_id = any (coalesce(p_ids[1:60], '{}'::uuid[]))
  ) x
  join public.profiles p on p.id = x.user_id
  where x.rn <= least(greatest(p_per, 1), 5)
$$;
revoke all on function public.reaction_friends(uuid[], integer) from public;
grant execute on function public.reaction_friends(uuid[], integer) to anon, authenticated;
