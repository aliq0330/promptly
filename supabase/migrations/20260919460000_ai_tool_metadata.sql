-- Optional "recommended tool/model" metadata (max 3) on prompts, prompt
-- requests and generators. Entries are "<toolId>" or "<toolId>:<modelId>"
-- from src/lib/ai-tool-catalog.ts. Empty by default; legacy free-text
-- prompts.tool / prompt_requests.preferred_tool stay untouched.
alter table public.prompts add column if not exists tools text[] not null default '{}';
alter table public.prompt_requests add column if not exists tools text[] not null default '{}';
alter table public.generators add column if not exists tools text[] not null default '{}';

alter table public.prompts drop constraint if exists prompts_tools_max;
alter table public.prompts add constraint prompts_tools_max check (cardinality(tools) <= 3);
alter table public.prompt_requests drop constraint if exists prompt_requests_tools_max;
alter table public.prompt_requests add constraint prompt_requests_tools_max check (cardinality(tools) <= 3);
alter table public.generators drop constraint if exists generators_tools_max;
alter table public.generators add constraint generators_tools_max check (cardinality(tools) <= 3);

create index if not exists prompts_tools_idx on public.prompts using gin (tools);
create index if not exists prompt_requests_tools_idx on public.prompt_requests using gin (tools);
create index if not exists generators_tools_idx on public.generators using gin (tools);
