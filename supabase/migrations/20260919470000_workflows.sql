-- Workflows: an ordered set of steps that each REFERENCE an existing prompt,
-- generator or prompt request, plus the input/output links between steps.
-- Nothing here runs a model — it is pure organisation of existing content.
-- Referenced content is never copied or changed; deleting it just leaves the
-- step without a reference (on delete set null).

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 1000),
  cover_url text,
  content_types text[] not null default '{}',
  category text,
  tools text[] not null default '{}' check (cardinality(tools) <= 3),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_creator_idx on public.workflows (creator_id, created_at desc);
create index if not exists workflows_status_idx on public.workflows (status, created_at desc);
create index if not exists workflows_tools_idx on public.workflows using gin (tools);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  position integer not null,
  title text not null default '',
  description text not null default '',
  instructions text not null default '',
  step_type text not null check (step_type in ('prompt', 'generator', 'request')),
  prompt_id uuid references public.prompts (id) on delete set null,
  generator_id uuid references public.generators (id) on delete set null,
  request_id uuid references public.prompt_requests (id) on delete set null,
  -- [{ id, label }] / [{ id, label }] — what the step takes in and produces.
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint workflow_steps_ref_matches_type check (
    (prompt_id is null or step_type = 'prompt')
    and (generator_id is null or step_type = 'generator')
    and (request_id is null or step_type = 'request')
  )
);
create index if not exists workflow_steps_workflow_idx on public.workflow_steps (workflow_id, position);
create index if not exists workflow_steps_prompt_idx on public.workflow_steps (prompt_id) where prompt_id is not null;
create index if not exists workflow_steps_generator_idx on public.workflow_steps (generator_id) where generator_id is not null;
create index if not exists workflow_steps_request_idx on public.workflow_steps (request_id) where request_id is not null;

create table if not exists public.workflow_connections (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  from_step_id uuid not null references public.workflow_steps (id) on delete cascade,
  to_step_id uuid not null references public.workflow_steps (id) on delete cascade,
  output_key text not null,
  input_key text not null,
  constraint workflow_connections_no_self check (from_step_id <> to_step_id)
);
create index if not exists workflow_connections_workflow_idx on public.workflow_connections (workflow_id);

drop trigger if exists workflows_set_updated_at on public.workflows;
create trigger workflows_set_updated_at before update on public.workflows
  for each row execute function public.set_updated_at();

alter table public.workflows enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_connections enable row level security;

create policy "Published workflows are public, drafts are owner-only" on public.workflows
  for select using (status = 'published' or creator_id = auth.uid());
create policy "Users create their own workflows" on public.workflows
  for insert to authenticated with check (creator_id = auth.uid());
create policy "Users update their own workflows" on public.workflows
  for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "Users delete their own workflows" on public.workflows
  for delete to authenticated using (creator_id = auth.uid());

-- Steps/connections are visible exactly when their workflow is (the subquery
-- runs under the caller's RLS) and writable only by the workflow's owner.
create policy "Steps follow their workflow's visibility" on public.workflow_steps
  for select using (exists (select 1 from public.workflows w where w.id = workflow_id));
create policy "Owners manage their workflow steps" on public.workflow_steps
  for all to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.workflows w where w.id = workflow_id and w.creator_id = auth.uid()));

create policy "Connections follow their workflow's visibility" on public.workflow_connections
  for select using (exists (select 1 from public.workflows w where w.id = workflow_id));
create policy "Owners manage their workflow connections" on public.workflow_connections
  for all to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_id and w.creator_id = auth.uid()))
  with check (exists (select 1 from public.workflows w where w.id = workflow_id and w.creator_id = auth.uid()));

-- Replaces a workflow's whole step graph in one transaction. SECURITY INVOKER
-- on purpose: RLS decides who may write, a non-owner's insert is rejected.
create or replace function public.save_workflow_graph(p_workflow_id uuid, p_steps jsonb, p_connections jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.workflows where id = p_workflow_id and creator_id = auth.uid()) then
    raise exception 'workflow not found or not yours';
  end if;

  delete from public.workflow_steps where workflow_id = p_workflow_id;

  insert into public.workflow_steps
    (id, workflow_id, position, title, description, instructions, step_type, prompt_id, generator_id, request_id, inputs, outputs)
  select
    (s ->> 'id')::uuid,
    p_workflow_id,
    (s ->> 'position')::int,
    coalesce(s ->> 'title', ''),
    coalesce(s ->> 'description', ''),
    coalesce(s ->> 'instructions', ''),
    s ->> 'step_type',
    nullif(s ->> 'prompt_id', '')::uuid,
    nullif(s ->> 'generator_id', '')::uuid,
    nullif(s ->> 'request_id', '')::uuid,
    coalesce(s -> 'inputs', '[]'::jsonb),
    coalesce(s -> 'outputs', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s;

  insert into public.workflow_connections (workflow_id, from_step_id, to_step_id, output_key, input_key)
  select
    p_workflow_id,
    (c ->> 'from_step_id')::uuid,
    (c ->> 'to_step_id')::uuid,
    c ->> 'output_key',
    c ->> 'input_key'
  from jsonb_array_elements(coalesce(p_connections, '[]'::jsonb)) c;

  update public.workflows set updated_at = now() where id = p_workflow_id;
end;
$$;
revoke all on function public.save_workflow_graph(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_workflow_graph(uuid, jsonb, jsonb) to authenticated;
