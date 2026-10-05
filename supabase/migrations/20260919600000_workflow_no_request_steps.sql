-- Prompt requests are no longer valid workflow steps. Old rows keep loading
-- (the step_type CHECK still allows 'request'), but the one write path —
-- save_workflow_graph — now refuses to store one.
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

  if exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s where s ->> 'step_type' = 'request') then
    raise exception 'prompt requests cannot be workflow steps';
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
