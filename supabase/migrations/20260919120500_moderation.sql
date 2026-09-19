-- Reports and blocks — the two tables CLAUDE.md section 6 planned for the
-- moderation module (Bölüm 22, not built yet). Created now so the schema
-- module delivers the full planned table list in one pass; no application
-- code uses these yet.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('prompt', 'comment', 'request', 'user', 'message')),
  -- Polymorphic reference (can point at a row in one of several tables
  -- depending on target_type) — deliberately has no foreign key, the same
  -- trade-off Postgres always requires for polymorphic associations.
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_status_idx on public.reports (status);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;
create index blocks_blocked_id_idx on public.blocks (blocked_id);
