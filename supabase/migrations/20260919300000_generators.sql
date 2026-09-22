-- Generator Builder + Generator Runtime — CLAUDE.md "Generator" modülü.
--
-- Mimari karar (bu dosyanın başındaki görev metninin §39'unun kendi izin
-- verdiği yerden): kategoriler/fieldlar/template için AYRI, tam normalize
-- edilmiş tablolar (generator_categories/generator_fields) KURULMADI —
-- bunun yerine bir generator sürümünün TÜM builder şeması
-- (kategoriler+fieldlar+template section'ları) generator_versions.schema/
-- template kolonlarında gerçek, versiyonlanan bir JSONB olarak tutuluyor.
-- Bu, görev metninin kendi §61 örnek şemasının zaten gösterdiği iç içe
-- yapıyla birebir aynı — yalnızca ayrı 5 tablo yerine (+ onların reorder/
-- RLS/trigger karmaşıklığı) tek bir versiyonlanabilir JSON belgesi. Field/
-- kategori sistemi hâlâ tamamen kullanıcı tanımlı ve generic — hiçbir şey
-- hard-code değil, yalnızca DEPOLAMA şekli farklı.
--
-- Generator remix ilişkisi prompts'un source_prompt_id/root_prompt_id
-- desenini birebir taklit ediyor (ayrı bir generator_remixes tablosu yok —
-- prompts'ta da böyle bir tablo yok, aynı ilke). "Generated with" ilişkisi
-- de aynı şekilde prompts'a üç nullable kolon eklenerek kuruldu (yeni bir
-- join tablosu yerine).

create table public.generators (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  slug text not null unique,
  description text not null default '',
  cover_url text,
  category text not null check (category in ('image', 'text', 'video', 'audio', 'code', 'design', 'marketing', 'writing', 'other')),
  subcategory text,
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  allow_remix boolean not null default true,
  allow_prompt_editing boolean not null default true,
  allow_saving_generated_prompts boolean not null default true,
  enable_negative_prompt boolean not null default false,
  origin_type text not null default 'original' check (origin_type in ('original', 'remix')),
  source_generator_id uuid references public.generators (id) on delete set null,
  root_generator_id uuid references public.generators (id) on delete set null,
  -- FK to generator_versions is added below, once that table exists (the
  -- two tables reference each other — same "close the circular reference
  -- with a later ALTER TABLE" pattern as prompts/prompt_requests).
  current_version_id uuid,
  use_count integer not null default 0 check (use_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  remix_count integer not null default 0 check (remix_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generators_origin_shape check (
    (origin_type = 'original' and source_generator_id is null and root_generator_id is null)
    or (origin_type = 'remix' and source_generator_id is not null and root_generator_id is not null)
  )
);

alter table public.generators enable row level security;
create trigger generators_set_updated_at
  before update on public.generators
  for each row
  execute function public.set_updated_at();

create index generators_creator_id_idx on public.generators (creator_id);
create index generators_discovery_idx on public.generators (created_at desc) where status = 'published' and visibility = 'public';
create index generators_source_generator_id_idx on public.generators (source_generator_id) where source_generator_id is not null;

create table public.generator_versions (
  id uuid primary key default gen_random_uuid(),
  generator_id uuid not null references public.generators (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  -- { "categories": [{ id, name, description, order }] } — see
  -- src/lib/generator-schema.ts for the real TypeScript shape this mirrors.
  schema jsonb not null default '{"categories": [], "fields": []}'::jsonb,
  -- { "sections": [{ id, title, content, order, enabled }] }
  template jsonb not null default '{"sections": []}'::jsonb,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (generator_id, version_number)
);

alter table public.generator_versions enable row level security;
create index generator_versions_generator_id_idx on public.generator_versions (generator_id);

alter table public.generators
  add constraint generators_current_version_fkey
  foreign key (current_version_id) references public.generator_versions (id) on delete set null;

create table public.generator_tags (
  generator_id uuid not null references public.generators (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  primary key (generator_id, tag_slug)
);

alter table public.generator_tags enable row level security;
create index generator_tags_tag_slug_idx on public.generator_tags (tag_slug);

-- A run is both the real analytics log (§60, privacy-respecting: only the
-- runner and, denormalized on generators, the aggregate counts, ever
-- readable) AND the bridge "Open in Prompt" (§23) uses to hand a real
-- generated prompt over to the normal prompt-publish form without stuffing
-- an arbitrarily long generated prompt into a URL query string.
create table public.generator_runs (
  id uuid primary key default gen_random_uuid(),
  generator_id uuid not null references public.generators (id) on delete cascade,
  generator_version_id uuid not null references public.generator_versions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  input_values jsonb not null default '{}'::jsonb,
  generated_prompt text not null,
  generated_negative_prompt text,
  created_at timestamptz not null default now()
);

alter table public.generator_runs enable row level security;
create index generator_runs_generator_id_idx on public.generator_runs (generator_id);
create index generator_runs_user_id_idx on public.generator_runs (user_id);

-- A simple, direct bookmark — mirrors the ORIGINAL prompt_saves design
-- (20260919120300_engagement.sql), deliberately NOT the full collections
-- system (20260919260000_collections.sql/20260919270000_default_
-- collections.sql) a generator can be added to. Documented as a
-- consciously deferred scope decision (see CLAUDE.md) rather than
-- silently half-wiring collection_items (which only accepts a prompt_id
-- today) into something it wasn't designed for.
create table public.generator_saves (
  generator_id uuid not null references public.generators (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (generator_id, user_id)
);

alter table public.generator_saves enable row level security;
create index generator_saves_generator_id_idx on public.generator_saves (generator_id);

-- "Generated with" / "Open in Prompt" provenance (§17/§23/§24/§70) — three
-- nullable columns on prompts itself, the exact same shape as its existing
-- source_prompt_id/request_id origin columns, instead of a new
-- generator_generated_prompts join table (a prompt maps to at most one
-- generator run, so a 1:1 FK set is simpler and more consistent with how
-- this table already tracks provenance).
alter table public.prompts
  add column generator_id uuid references public.generators (id) on delete set null,
  add column generator_version_id uuid references public.generator_versions (id) on delete set null,
  add column generator_run_id uuid references public.generator_runs (id) on delete set null;

create index prompts_generator_id_idx on public.prompts (generator_id) where generator_id is not null;

-- === Denormalized counters — SECURITY DEFINER, same reason as Bölüm 19's
-- prompt/follow/comment counter fix: each of these updates a DIFFERENT
-- user's generators row (saving/using/remixing someone else's generator),
-- which RLS would otherwise silently turn into a 0-row no-op. ============

create or replace function public.handle_generator_save_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.generators set save_count = save_count + 1 where id = new.generator_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.generators set save_count = save_count - 1 where id = old.generator_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger generator_saves_after_change
  after insert or delete on public.generator_saves
  for each row
  execute function public.handle_generator_save_change();

create or replace function public.handle_generator_run_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.generators set use_count = use_count + 1 where id = new.generator_id;
  return new;
end;
$$;

create trigger generator_runs_after_insert
  after insert on public.generator_runs
  for each row
  execute function public.handle_generator_run_created();

create or replace function public.handle_generator_remix_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origin_type = 'remix' and new.source_generator_id is not null then
    update public.generators set remix_count = remix_count + 1 where id = new.source_generator_id;
  end if;
  return new;
end;
$$;

create trigger generators_after_insert_remix
  after insert on public.generators
  for each row
  execute function public.handle_generator_remix_created();

-- === RLS =====================================================================

-- Readable when: the caller owns it (any status/visibility — a creator
-- always sees their own drafts/private/unlisted generators), OR it's a
-- genuinely published, public-or-unlisted generator. A published+private
-- generator (possible, e.g. an owner flips visibility after publishing)
-- stays owner-only; discovery additionally filters to visibility='public'
-- client-side so an unlisted generator is reachable only via its direct
-- link, never listed (§40/§43 — same "unlisted" contract prompts.status=
-- 'draft' already models for visibility, just a third state added here).
create policy "Generators are readable when published+public/unlisted or owned"
  on public.generators for select
  using (
    creator_id = auth.uid()
    or (status = 'published' and visibility in ('public', 'unlisted'))
  );

create policy "Users can create their own generators"
  on public.generators for insert
  to authenticated
  with check (creator_id = auth.uid());

create policy "Users can update their own generators"
  on public.generators for update
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy "Users can delete their own generators"
  on public.generators for delete
  using (creator_id = auth.uid());

create policy "Generator versions are readable wherever their generator is"
  on public.generator_versions for select
  using (
    exists (
      select 1 from public.generators g
      where g.id = generator_versions.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
  );

create policy "Owners can create versions for their own generators"
  on public.generator_versions for insert
  to authenticated
  with check (
    exists (select 1 from public.generators g where g.id = generator_versions.generator_id and g.creator_id = auth.uid())
  );

-- Only ever used for autosaving the CURRENT draft version before it's ever
-- been published (the app never re-issues an UPDATE against a version that
-- already backed a real publish — a new version row is created instead,
-- see generators.ts) — allowed at the RLS layer for any of the owner's own
-- versions for simplicity, that ordering discipline lives in application
-- code, same trust boundary as e.g. prompt_tags' replace-all pattern.
create policy "Owners can update their own generator versions"
  on public.generator_versions for update
  using (exists (select 1 from public.generators g where g.id = generator_versions.generator_id and g.creator_id = auth.uid()))
  with check (exists (select 1 from public.generators g where g.id = generator_versions.generator_id and g.creator_id = auth.uid()));

create policy "Generator tags are readable wherever their generator is"
  on public.generator_tags for select
  using (
    exists (
      select 1 from public.generators g
      where g.id = generator_tags.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
  );

create policy "Owners can tag their own generators"
  on public.generator_tags for insert
  to authenticated
  with check (exists (select 1 from public.generators g where g.id = generator_tags.generator_id and g.creator_id = auth.uid()));

create policy "Owners can remove tags from their own generators"
  on public.generator_tags for delete
  using (exists (select 1 from public.generators g where g.id = generator_tags.generator_id and g.creator_id = auth.uid()));

-- Runs are private to whoever ran them (§40) — a generator's owner does
-- NOT get to read raw run rows, only the denormalized use_count on
-- generators itself (public, same as like_count etc.).
create policy "Users can read their own generator runs"
  on public.generator_runs for select
  using (user_id = auth.uid());

create policy "Users can record a run against a generator they can read"
  on public.generator_runs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.generators g
      where g.id = generator_runs.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
  );

create policy "Users can read their own generator saves"
  on public.generator_saves for select
  using (user_id = auth.uid());

create policy "Users can save a generator they can read"
  on public.generator_saves for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.generators g
      where g.id = generator_saves.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
  );

create policy "Users can remove their own generator saves"
  on public.generator_saves for delete
  using (user_id = auth.uid());
