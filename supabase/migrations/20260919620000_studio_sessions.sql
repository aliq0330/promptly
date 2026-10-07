-- Promptly — Studio V2: kalıcı Studio oturumları.
--
-- Bir Studio oturumu, kullanıcının Prompt / Generator / Hazır Ayar / Workflow
-- kaynaklarını REFERANSLA bağlayıp üzerinde geliştirdiği taslaktır. Orijinal
-- içerikler bu tablolara kopyalanmaz ve asla değiştirilmez: oturum yalnızca
--   * refs     → hangi kaynakların bağlı olduğu ({prompt: id, generator: slug, …})
--   * baseline → kaynak bağlandığı andaki hâl (değişiklik sayımı / sıfırla için)
--   * draft    → üzerinde çalışılan güncel taslak
-- tutar. Versiyonlar (orijinal / kaydedilen / varyasyon) ayrı satırlardır.
-- Yalnızca sahibi okur/yazar.
create table public.studio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  refs jsonb not null default '{}'::jsonb,
  baseline jsonb not null default '{}'::jsonb,
  draft jsonb not null default '{}'::jsonb,
  active_kind text check (active_kind is null or active_kind in ('prompt', 'generator', 'preset', 'workflow')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger studio_sessions_set_updated_at
  before update on public.studio_sessions
  for each row
  execute function public.set_updated_at();

create index studio_sessions_user_updated_idx on public.studio_sessions (user_id, updated_at desc);

create table public.studio_session_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.studio_sessions (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  label text not null default '' check (char_length(label) <= 80),
  -- original: kaynak bağlanınca oluşan dokunulmamış hâl · version: elle kaydedilen · variation: "+ Varyasyon"
  kind text not null default 'version' check (kind in ('original', 'version', 'variation')),
  parent_id uuid references public.studio_session_versions (id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, version_number)
);

create index studio_session_versions_session_idx on public.studio_session_versions (session_id, version_number);

alter table public.studio_sessions enable row level security;
alter table public.studio_session_versions enable row level security;

create policy "Users manage their own studio sessions"
  on public.studio_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage versions of their own studio sessions"
  on public.studio_session_versions for all
  to authenticated
  using (exists (select 1 from public.studio_sessions s where s.id = studio_session_versions.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.studio_sessions s where s.id = studio_session_versions.session_id and s.user_id = auth.uid()));
