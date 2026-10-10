-- Moderatör aracı: DNA'sı olmayan yayınlı promptlar için toplu DNA oluşturma.
-- Analiz tarayıcıda (yerel kural motoru) yapılır; bu iki RPC yalnızca okuma/yazma köprüsüdür.

create or replace function public.admin_prompts_missing_dna(p_after uuid default null, p_limit int default 50)
returns table (id uuid, prompt_text text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then raise exception 'not allowed'; end if;
  return query
    select p.id, p.prompt_text
    from public.prompts p
    where p.status = 'published' and p.deleted_at is null
      and (p_after is null or p.id > p_after)
      and not exists (select 1 from public.prompt_dna_sections d where d.prompt_id = p.id)
    order by p.id
    limit greatest(1, least(p_limit, 100));
end $$;

create or replace function public.admin_backfill_prompt_dna(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb; s jsonb; n int := 0; idx int;
begin
  if not public.is_moderator() then raise exception 'not allowed'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if exists (select 1 from public.prompt_dna_sections where prompt_id = (r->>'prompt_id')::uuid) then continue; end if;
    if not exists (select 1 from public.prompts where id = (r->>'prompt_id')::uuid and status = 'published') then continue; end if;
    idx := 0;
    for s in select * from jsonb_array_elements(coalesce(r->'sections', '[]'::jsonb)) loop
      if btrim(coalesce(s->>'content', '')) = '' then continue; end if;
      insert into public.prompt_dna_sections (prompt_id, type, label, content, order_index, source, confidence)
      values ((r->>'prompt_id')::uuid, s->>'type', nullif(s->>'label', ''), left(btrim(s->>'content'), 2000), idx, 'auto', nullif(s->>'confidence', ''));
      idx := idx + 1; n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.admin_prompts_missing_dna(uuid, int) from public, anon;
revoke all on function public.admin_backfill_prompt_dna(jsonb) from public, anon;
grant execute on function public.admin_prompts_missing_dna(uuid, int) to authenticated;
grant execute on function public.admin_backfill_prompt_dna(jsonb) to authenticated;
