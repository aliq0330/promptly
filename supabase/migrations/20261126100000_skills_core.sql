-- Skill / Beceri — Promptly'nin 5. birinci sınıf içerik türü, ÇEKİRDEK dilim (docs/history/388-*).
--
-- Yalnız EKLER (expand): yeni tablo, yeni tetikleyiciler. Mevcut hiçbir tablo/fonksiyon değişmez (CLAUDE.md §8.11).
-- Bu dilimde YOK (Skill yapılacaklar listesinde, docs/yapilacaklar.md): dosya yükleme/ZIP (`skill_files`, `skill-files` bucket),
-- sürüm geçmişi (`skill_versions`), etiket/ilişki/kullanım tabloları, ortak sosyal tablolara `skill_id` (beğeni, yorum, kaydet),
-- `search_content` / `feed_page` genişletmesi, bildirim, moderasyon. Sayaç sütunları şimdiden vardır ve KORUNUR; onları bu dilim yazmaz.
--
-- Mimari: Workflow / Hazır ayar ile aynı desen — kendi içerik tablosu; okuma RLS'i; yazma yalnız sahibine; askı/paylaşım engeli,
-- hız sınırı, engelleme (iki yönlü) ve sayaç koruması mevcut ortak tetikleyicilerle bağlanır.

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Klasör ve SKILL.md `name` alanı: küçük harf, rakam, tire. Yazar içinde benzersiz.
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  title text not null default '' check (char_length(title) <= 120),
  summary text not null default '' check (char_length(summary) <= 1000),
  -- SKILL.md gövdesi (Markdown). Aranabilir metin DB'de durur; SKILL.md/ZIP bundan derlenir.
  instructions text not null default '' check (char_length(instructions) <= 60000),
  -- Skill'in kendi uzmanlık taksonomisi (görsel/metin/ses/video taksonomisinden bağımsız).
  category text check (category is null or category in ('software', 'design', 'research', 'business', 'marketing', 'education', 'data', 'productivity')),
  -- Hedef araç uyumluluğu (veri; hiçbir araç sunucuda çalıştırılmaz).
  compat text[] not null default '{}' check (cardinality(compat) <= 6 and compat <@ array['claude-code', 'codex', 'cursor', 'other']::text[]),
  license text not null default 'mit' check (license in ('mit', 'apache-2.0', 'cc0-1.0', 'cc-by-4.0', 'cc-by-sa-4.0', 'proprietary')),
  -- Anlamsal sürüm. Bu dilimde yazar elle verir; değişmez sürüm kaydı (`skill_versions`) sonraki dilimdir.
  version text not null default '1.0.0' check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and char_length(version) <= 32),
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  use_count integer not null default 0 check (use_count >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, slug)
);

create index if not exists skills_author_idx on public.skills (author_id, created_at desc);
create index if not exists skills_discovery_idx on public.skills (created_at desc, id desc) where status = 'published' and visibility = 'public';
create index if not exists skills_category_idx on public.skills (category) where status = 'published' and visibility = 'public';

drop trigger if exists skills_set_updated_at on public.skills;
create trigger skills_set_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

alter table public.skills enable row level security;

-- Herkese açık + yayınlanmış herkese görünür; sahibi kendi taslağını / "sadece ben" Skill'ini her zaman görür.
drop policy if exists "Public published skills are readable, owners see their own" on public.skills;
create policy "Public published skills are readable, owners see their own"
  on public.skills for select
  using (author_id = (select auth.uid()) or (status = 'published' and visibility = 'public'));
drop policy if exists "Users create their own skills" on public.skills;
create policy "Users create their own skills"
  on public.skills for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "Users update their own skills" on public.skills;
create policy "Users update their own skills"
  on public.skills for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "Users delete their own skills" on public.skills;
create policy "Users delete their own skills"
  on public.skills for delete to authenticated using (author_id = (select auth.uid()));

-- Engelleme: engelli taraf (iki yönde) birbirinin Skill'ini göremez (RESTRICTIVE; `*_hide_blocked` kalıbı, sorgu başına bir kez hesaplanır).
drop policy if exists skills_hide_blocked on public.skills;
create policy skills_hide_blocked on public.skills as restrictive for select
  using ((select auth.uid()) is null or not public.is_blocked((select auth.uid()), author_id));

-- Anon yazamaz (RLS ikinci katmandır): tüm yetkiler alınır, yalnız okuma geri verilir.
revoke all on public.skills from anon;
grant select on public.skills to anon;

-- Sayaçlar istemciden yazılamaz.
drop trigger if exists skills_protect_counters on public.skills;
create trigger skills_protect_counters before update on public.skills
  for each row execute function public.protect_counter_columns('use_count', 'like_count', 'comment_count', 'save_count');

-- Askı / paylaşım engeli (`_assert_can_act`), kendi içeriğini düzenleme, hız sınırı (saatte 20 yeni Skill).
drop trigger if exists skills_enforce_can_post on public.skills;
create trigger skills_enforce_can_post before insert on public.skills
  for each row execute function public.enforce_can_post('content');
drop trigger if exists skills_enforce_can_edit on public.skills;
create trigger skills_enforce_can_edit before update on public.skills
  for each row execute function public.enforce_can_edit('author_id', 'content');
drop trigger if exists skills_rate_limit on public.skills;
create trigger skills_rate_limit before insert on public.skills
  for each row execute function public.enforce_rate_limit('skill', '20', '3600');
