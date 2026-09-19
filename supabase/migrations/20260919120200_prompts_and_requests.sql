-- tags, prompt_requests, prompts, prompt_media and their tag join tables —
-- the core content model (src/types/index.ts Tag, PromptRequest, Prompt,
-- PromptMedia).
--
-- Note on PromptRequestResponse: there is deliberately NO
-- prompt_request_responses table. CLAUDE.md's prompt-request module
-- (Bölüm 9/10) already decided that answering a request produces a real
-- Prompt row (with origin_type = 'request_response'), not a separate
-- response entity — the mock PromptRequestResponse type only exists for
-- old seed/demo rows in src/mocks. This schema follows that decision.

create table public.tags (
  slug text primary key,
  label text not null
);

alter table public.tags enable row level security;

-- prompt_requests is created before prompts so prompts.request_id can
-- reference it; its own selected_response_prompt_id (which points at a
-- prompts row) is added via ALTER TABLE further down, once prompts exists
-- — the two tables reference each other, so one FK has to come after both
-- tables are in place.
create table public.prompt_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  creative_direction text,
  preferred_tool text,
  content_type text check (content_type in ('image', 'text', 'video', 'code', 'music')),
  reference_image_url text,
  reference_image_width integer,
  reference_image_height integer,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  selected_response_prompt_id uuid,
  response_count integer not null default 0 check (response_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prompt_requests_set_updated_at
  before update on public.prompt_requests
  for each row
  execute function public.set_updated_at();

alter table public.prompt_requests enable row level security;

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  prompt_text text not null,
  tool text,
  content_type text not null check (content_type in ('image', 'text', 'video', 'code', 'music')),
  status text not null default 'published' check (status in ('draft', 'published')),
  origin_type text not null default 'original' check (origin_type in ('original', 'remix', 'request_response')),
  source_prompt_id uuid references public.prompts (id) on delete set null,
  root_prompt_id uuid references public.prompts (id) on delete set null,
  request_id uuid references public.prompt_requests (id) on delete set null,
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  remix_count integer not null default 0 check (remix_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mirrors the PromptOrigin union in src/types/index.ts: exactly the
  -- fields that origin type actually carries may be set.
  constraint prompts_origin_shape check (
    (origin_type = 'original' and source_prompt_id is null and root_prompt_id is null and request_id is null)
    or (origin_type = 'remix' and source_prompt_id is not null and root_prompt_id is not null and request_id is null)
    or (origin_type = 'request_response' and request_id is not null and source_prompt_id is null and root_prompt_id is null)
  )
);

create trigger prompts_set_updated_at
  before update on public.prompts
  for each row
  execute function public.set_updated_at();

alter table public.prompts enable row level security;

create index prompts_author_id_idx on public.prompts (author_id);
create index prompts_content_type_idx on public.prompts (content_type);
create index prompts_created_at_idx on public.prompts (created_at desc);
create index prompts_source_prompt_id_idx on public.prompts (source_prompt_id) where source_prompt_id is not null;
create index prompts_request_id_idx on public.prompts (request_id) where request_id is not null;

-- Now that prompts exists, close the circular reference: a request's
-- selected answer is one specific prompt.
alter table public.prompt_requests
  add constraint prompt_requests_selected_response_fkey
  foreign key (selected_response_prompt_id) references public.prompts (id) on delete set null;

create index prompt_requests_author_id_idx on public.prompt_requests (author_id);
create index prompt_requests_created_at_idx on public.prompt_requests (created_at desc);

create table public.prompt_media (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  url text not null,
  width integer not null,
  height integer not null,
  alt text,
  position integer not null default 0
);

alter table public.prompt_media enable row level security;
create index prompt_media_prompt_id_idx on public.prompt_media (prompt_id);

create table public.prompt_tags (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  primary key (prompt_id, tag_slug)
);

alter table public.prompt_tags enable row level security;
create index prompt_tags_tag_slug_idx on public.prompt_tags (tag_slug);

create table public.prompt_request_tags (
  request_id uuid not null references public.prompt_requests (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  primary key (request_id, tag_slug)
);

alter table public.prompt_request_tags enable row level security;
create index prompt_request_tags_tag_slug_idx on public.prompt_request_tags (tag_slug);
