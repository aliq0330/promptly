-- Skill ↔ Skill bağları + "Çalıştı mı?" oyuna araç etiketi (docs/history/397-*). Yalnızca ekleyici.
--
-- 1) `skill_links`: bir Skill'in birlikte kullanılan / gerektirdiği DİĞER Skill'ler (kimlik başvurusu, kopya değil). `skill_relations` (Prompt/Workflow/Ayar paketi) DEĞİŞMEDİ;
--    ayrı tablo, çünkü o tablonun hedef türü yorum eklerinin tür kümesini paylaşır. Yalnız sahibi bağlar; bağlanan Skill yayında + herkese açık olmalı (`quote_target_ok`),
--    kendine bağlanamaz, en çok 10 bağ. Okuma: kaynak Skill'i okuyabilen herkes; bağlanan Skill'in kartı kendi RLS'inden okunur (gizlenmişse "erişilemiyor").
-- 2) `skill_works_votes.tool`: oyun hangi araçta denendiği (isteğe bağlı) + `skill_works_by_tool` toplam (araç başına çalıştı/çalışmadı). Oy tablosu istemciye KAPALI kalır.
create table if not exists public.skill_links (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills (id) on delete cascade,
  linked_skill_id uuid not null references public.skills (id) on delete cascade,
  position integer not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  unique (skill_id, linked_skill_id),
  check (skill_id <> linked_skill_id)
);
create index if not exists skill_links_skill_idx on public.skill_links (skill_id, position);
create index if not exists skill_links_linked_idx on public.skill_links (linked_skill_id);

alter table public.skill_links enable row level security;
create policy "Skill links are readable where their skill is" on public.skill_links for select
  using (exists (select 1 from public.skills s where s.id = skill_links.skill_id));
create policy "Owners link their own skills" on public.skill_links for insert to authenticated
  with check (exists (select 1 from public.skills s where s.id = skill_links.skill_id and s.author_id = (select auth.uid())));
create policy "Owners update their skill links" on public.skill_links for update to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_links.skill_id and s.author_id = (select auth.uid())))
  with check (exists (select 1 from public.skills s where s.id = skill_links.skill_id and s.author_id = (select auth.uid())));
create policy "Owners unlink their own skills" on public.skill_links for delete to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_links.skill_id and s.author_id = (select auth.uid())));
revoke all on public.skill_links from anon, authenticated;
grant select on public.skill_links to anon, authenticated;
grant insert, update, delete on public.skill_links to authenticated;

create or replace function public.skill_links_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.linked_skill_id is distinct from old.linked_skill_id then
    if not public.quote_target_ok('skill', new.linked_skill_id) then
      raise exception 'skill_link_not_public';
    end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.skill_links where skill_id = new.skill_id) >= 10 then
    raise exception 'skill_too_many_links';
  end if;
  return new;
end;
$$;
create trigger skill_links_guard before insert or update on public.skill_links
  for each row execute function public.skill_links_guard();
revoke all on function public.skill_links_guard() from public, anon, authenticated;

alter table public.skill_works_votes
  add column if not exists tool text check (tool is null or tool in ('claude-code', 'codex', 'cursor', 'other'));

-- Kişinin KENDİ oyuna araç etiketi (oy yoksa `no_vote`); oy verme kuralları `set_skill_works`'tedir, burada yalnız etiket yazılır.
create or replace function public.set_skill_works_tool(p_skill_id uuid, p_tool text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_rows integer;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_tool is not null and p_tool not in ('claude-code', 'codex', 'cursor', 'other') then
    raise exception 'invalid_tool';
  end if;
  update public.skill_works_votes set tool = p_tool where skill_id = p_skill_id and user_id = v_me;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'no_vote';
  end if;
end $$;
revoke all on function public.set_skill_works_tool(uuid, text) from public, anon;
grant execute on function public.set_skill_works_tool(uuid, text) to authenticated;

-- Araç başına toplam (yalnız araç etiketli oylar); ziyaretçiye de açık, yalnız yayında + herkese açık Skill için.
create or replace function public.skill_works_by_tool(p_skill_id uuid)
returns table (tool text, yes_count integer, no_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.tool, (count(*) filter (where v.works))::integer, (count(*) filter (where not v.works))::integer
    from public.skill_works_votes v
    join public.skills s on s.id = v.skill_id and s.status = 'published' and s.visibility = 'public'
   where v.skill_id = p_skill_id and v.tool is not null
   group by v.tool
   order by 2 desc, 1;
$$;
revoke all on function public.skill_works_by_tool(uuid) from public;
grant execute on function public.skill_works_by_tool(uuid) to anon, authenticated;
-- `set_skill_works_tool` zaten SECURITY DEFINER'dır ama oy tablosu istemciye kapalı kaldığı için etiketi yalnız bu işlev yazar.
