-- Promptly — Bölüm 18: Supabase veritabanı ve migration dosyaları.
--
-- This is the first of several migrations that create the real schema
-- mirroring src/types/index.ts (see CLAUDE.md section 6 for the original
-- planned table list, and section 9's Bölüm 18 entry for the exact
-- mapping decisions). Nothing in the frontend reads from these tables yet
-- — that's CLAUDE.md section 21's job. RLS is enabled on every table the
-- moment it's created (see each migration), with zero policies until
-- section 19 writes them: until then these tables are unreachable through
-- the anon/authenticated API keys by design (fail-closed), even though
-- they already exist.
--
-- How to apply these migrations: see the note at the end of the last
-- migration file, or CLAUDE.md's Bölüm 18 status entry.

-- gen_random_uuid() — used as the default for every surrogate primary key
-- below. Supabase projects have pgcrypto available by default; this makes
-- that explicit rather than assuming it.
create extension if not exists pgcrypto with schema extensions;

-- Generic "touch updated_at on every UPDATE" trigger, reused by every
-- table below that has an updated_at column instead of copy-pasting the
-- same trigger function per table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at = now() on UPDATE. Attach as a BEFORE UPDATE trigger.';
