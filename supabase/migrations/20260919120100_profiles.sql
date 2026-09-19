-- profiles — 1:1 extension of auth.users (the real Supabase Auth users
-- table created by Bölüm 17; this migration never touches auth.users'
-- own columns, only adds a row alongside each one).
--
-- Maps to src/types/index.ts UserProfile. follower_count/following_count
-- are intentionally denormalized counters (kept in sync by triggers in
-- 20260919120300_engagement.sql) rather than computed with COUNT() on
-- every read — this is a deliberate choice for a social feed app where
-- these numbers are shown constantly, not a shortcut.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  cover_url text,
  bio text,
  website text,
  -- Yaratıcı ilgi alanları (CLAUDE.md profil modülü) — TASLAK'tan gerçek
  -- alana taşındı, ama frontend hâlâ yerel ProfileOverridesProvider
  -- kullanıyor (Bölüm 21'e kadar).
  interests text[] not null default '{}',
  follower_count integer not null default 0,
  following_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,30}$'),
  constraint profiles_follower_count_nonneg check (follower_count >= 0),
  constraint profiles_following_count_nonneg check (following_count >= 0)
);

comment on table public.profiles is
  'Public profile data for each auth.users row — see src/types/index.ts UserProfile.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;
-- No policies yet — see CLAUDE.md Bölüm 19. Until then, no row in this
-- table is readable or writable through the anon/authenticated API keys
-- (only the service_role key, which this app's frontend never uses,
-- bypasses RLS).

-- Turns an email's local-part into a valid, unique username: lowercases
-- it, replaces anything outside [a-z0-9_.] with '.', trims stray dots,
-- falls back to "user" if that leaves nothing, then appends a short
-- random suffix (and retries) if the base is already taken.
create or replace function public.generate_username(base_input text)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  suffix text;
begin
  base := lower(regexp_replace(coalesce(base_input, ''), '[^a-z0-9_.]', '.', 'g'));
  base := trim(both '.' from base);
  if length(base) < 3 then
    base := 'user';
  end if;
  base := left(base, 24);

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := lpad(floor(random() * 10000)::int::text, 4, '0');
    candidate := left(base, 24) || suffix;
  end loop;

  return candidate;
end;
$$;

-- Auto-creates a profiles row the moment someone signs up through
-- Supabase Auth (CLAUDE.md Bölüm 17's signUp() call) — this is what
-- eventually lets a real account have a real /profile/[username] page
-- once the frontend is wired up in Bölüm 21. display_name comes from the
-- signup form's `options.data.display_name` (already sent today, see
-- src/app/(auth)/signup/page.tsx) if present, otherwise falls back to the
-- email's local-part.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    public.generate_username(split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
