-- Workflow ↔ Space bağı tek yerden okunur + workflow aktarımı tek işlemde yazılır (docs/history/339-*).
-- Yalnızca EKLEYİCİ (iki yeni fonksiyon; tablo/sütun/politika değişmez, `drop` yok).
--
-- 1) workflow_space_links(workflow): workflow'un panosunda yer aldığı, ÇAĞIRANIN okuyabildiği Space'ler. Bağ; workflow'dan aktarılan
--    HERHANGİ bir öğeden (adım kartı, prompt, görsel) ya da eski tek parça çerçeve öğesinden bulunur — yani adım kartları silinse bile
--    bağ kaybolmaz. SECURITY INVOKER: okuma `space_items` / `spaces` RLS'inden geçer (özel Space ziyaretçiye hiç gelmez).
-- 2) space_apply_workflow_plan(...): çerçeve (grup) + nesneler + oklar TEK işlemde. Biri başarısız olursa hiçbiri kalmaz (eskiden üç ayrı
--    istekti: grup var ama adım kartı yok, nesneler var ama oklar yok gibi yarım panolar kalabiliyordu). SECURITY INVOKER: yazma RLS'i,
--    `can_edit_space`, askı/hız sınırı ve öğe tetikleyicileri istemcinin doğrudan yazmasıyla AYNI işler.

create or replace function public.workflow_space_links(p_workflow_id uuid)
returns table (
  space_id uuid,
  item_id uuid,
  objects boolean,
  flow_show_io boolean,
  flow_show_links boolean,
  flow_show_relations boolean,
  title text,
  visibility text,
  archived boolean,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from (
    select distinct on (i.space_id)
           i.space_id,
           i.id as item_id,
           (i.source_workflow_id is not null) as objects,
           i.flow_show_io,
           i.flow_show_links,
           i.flow_show_relations,
           s.title,
           s.visibility::text,
           (s.archived_at is not null) as archived,
           s.updated_at
      from public.space_items i
      join public.spaces s on s.id = i.space_id
     where not i.is_private
       and (i.source_workflow_id = p_workflow_id
            or (i.kind = 'content' and i.content_type = 'workflow' and i.content_id = p_workflow_id))
     -- Önizlemenin odaklanacağı öğe: önce adım kartı, sonra başka workflow nesnesi, en son eski çerçeve.
     order by i.space_id, (i.source_role = 'step') desc nulls last, (i.source_workflow_id is not null) desc, i.source_step_no nulls last, i.created_at
  ) t
  limit 24;
$$;

create or replace function public.space_apply_workflow_plan(p_space_id uuid, p_group jsonb, p_items jsonb, p_connections jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group jsonb := null;
  v_items jsonb;
  v_conns jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'space_invalid'; end if;
  if p_connections is null or jsonb_typeof(p_connections) <> 'array' or jsonb_array_length(p_connections) > 1000 then raise exception 'space_invalid'; end if;
  if not public.can_edit_space(p_space_id) then raise exception 'space_forbidden'; end if;

  -- Çerçeve (grup): Space başına en çok 50 grup var; doluysa aktarım çerçevesiz sürer (eski davranış), reddedilmez.
  if p_group is not null and jsonb_typeof(p_group) = 'object'
     and (select count(*) from public.space_groups sg where sg.space_id = p_space_id) < 50 then
    with g as (
      insert into public.space_groups (id, space_id, name, color, position, created_by)
      values (
        coalesce((p_group ->> 'id')::uuid, gen_random_uuid()),
        p_space_id,
        left(btrim(coalesce(p_group ->> 'name', '')), 40),
        coalesce(p_group ->> 'color', 'primary'),
        coalesce((p_group ->> 'position')::int, 0),
        auth.uid()
      )
      returning *
    )
    select to_jsonb(g) into v_group from g;
  end if;

  with ins as (
    insert into public.space_items (
      id, space_id, kind, x, y, w, h, z, group_id, prompt_id, media_url, media_width, media_height, is_draft, source_prompt_id,
      content_type, content_id, palette_id, title, body, note, color, attached_item_id, is_private,
      flow_show_io, flow_show_links, flow_show_relations, source_workflow_id, source_step_id, source_role, source_step_no, created_by
    )
    select
      coalesce(r.id, gen_random_uuid()), p_space_id, r.kind, coalesce(r.x, 0), coalesce(r.y, 0), coalesce(r.w, 240), coalesce(r.h, 240), coalesce(r.z, 0),
      case when v_group is null then null else r.group_id end, r.prompt_id, r.media_url, r.media_width, r.media_height, coalesce(r.is_draft, false), r.source_prompt_id,
      r.content_type, r.content_id, r.palette_id, coalesce(r.title, ''), coalesce(r.body, ''), coalesce(r.note, ''), coalesce(r.color, 'neutral'),
      r.attached_item_id, coalesce(r.is_private, false),
      coalesce(r.flow_show_io, true), coalesce(r.flow_show_links, true), coalesce(r.flow_show_relations, true),
      r.source_workflow_id, r.source_step_id, r.source_role, r.source_step_no, auth.uid()
    from jsonb_to_recordset(p_items) as r(
      id uuid, kind text, x real, y real, w real, h real, z integer, group_id uuid, prompt_id uuid, media_url text, media_width integer, media_height integer,
      is_draft boolean, source_prompt_id uuid, content_type text, content_id uuid, palette_id uuid, title text, body text, note text, color text,
      attached_item_id uuid, is_private boolean, flow_show_io boolean, flow_show_links boolean, flow_show_relations boolean,
      source_workflow_id uuid, source_step_id uuid, source_role text, source_step_no smallint
    )
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins) order by ins.z), '[]'::jsonb) into v_items from ins;

  with ins as (
    insert into public.space_connections (id, space_id, from_item_id, to_item_id, label, line_style, arrow, route, color, source_workflow_id, source_role, created_by)
    select
      coalesce(c.id, gen_random_uuid()), p_space_id, c.from_item_id, c.to_item_id, coalesce(c.label, ''), coalesce(c.line_style, 'solid'),
      coalesce(c.arrow, 'end'), coalesce(c.route, 'curve'), coalesce(c.color, 'primary'), c.source_workflow_id, c.source_role, auth.uid()
    from jsonb_to_recordset(p_connections) as c(
      id uuid, from_item_id uuid, to_item_id uuid, label text, line_style text, arrow text, route text, color text, source_workflow_id uuid, source_role text
    )
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_conns from ins;

  return jsonb_build_object('group', v_group, 'items', v_items, 'connections', v_conns);
end;
$$;

revoke execute on function public.workflow_space_links(uuid) from public;
grant execute on function public.workflow_space_links(uuid) to anon, authenticated;
revoke execute on function public.space_apply_workflow_plan(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.space_apply_workflow_plan(uuid, jsonb, jsonb, jsonb) to authenticated;
