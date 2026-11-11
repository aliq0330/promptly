-- Ekip projesi onayı: lider, henüz onaya gönderilmemiş TASLAK (ve değişiklik istenmiş) öğeyi de doğrudan onaylayabilir.
-- Neden: taslağı yalnız ekleyen + liderler görür ama karar yalnız "bekliyor" durumundaki öğeye verilebiliyordu; lider, görebildiği bir taslağı
-- (ör. rolü sonradan lider olan kişinin eski taslağı) hiçbir yerden onaylayamıyordu. "Değişiklik iste" yine yalnız bekleyen öğeye uygulanır.
-- Ekleyici: aynı imza, yalnız gövde değişir (grant'lar korunur). docs/history/368-*.

create or replace function public.team_review_decide(p_item_ids uuid[], p_decision text, p_note text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  r record;
  v_n integer := 0;
  a record;
  v_done jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(true);
  if coalesce(p_decision, '') not in ('approve', 'changes') or coalesce(cardinality(p_item_ids), 0) not between 1 and 200
     or char_length(v_note) > 500 or (p_decision = 'changes' and v_note = '') then
    raise exception 'project_invalid';
  end if;
  perform set_config('promptly.team_review', '1', true);
  for r in select t.* from public._team_review_targets(p_item_ids, 'lead', v_uid) t
            where t.rev_state = 'pending' or (p_decision = 'approve' and t.rev_state in ('draft', 'changes')) loop
    update public.space_items set
      rev_state = case when p_decision = 'approve' then 'approved' else 'changes' end,
      rev_decided_at = now(), rev_decided_by = v_uid,
      rev_note = case when p_decision = 'changes' then v_note else null end
     where id = r.id;
    v_done := v_done || jsonb_build_array(jsonb_build_object('author', r.created_by, 'project', public._team_area_project(r.space_id), 'title', r.title));
    v_n := v_n + 1;
  end loop;
  perform set_config('promptly.team_review', '', true);
  for a in select d.author, d.project, count(*)::integer as n, min(d.title) as one_title
             from jsonb_to_recordset(v_done) as d(author uuid, project uuid, title text) group by d.author, d.project loop
    perform public._team_notify(a.author, v_uid, (select team_id from public.team_projects where id = a.project), 'direct',
      case when p_decision = 'approve'
           then case when a.n = 1 then '"' || public.truncate_preview(coalesce(nullif(a.one_title, ''), 'Öğe'), 50) || '" onaylandı.' else a.n || ' öğen onaylandı.' end
           else public._team_actor_name(v_uid) || ' değişiklik istedi: ' || public.truncate_preview(v_note, 80) end,
      '/teams/local?id=' || (select team_id from public.team_projects where id = a.project) || '&tab=projects&project=' || a.project,
      'revdec:' || a.project || ':' || a.author || ':' || p_decision || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end loop;
  if v_n > 0 then
    for a in select distinct d.project from jsonb_to_recordset(v_done) as d(author uuid, project uuid, title text) loop
      perform public._team_audit((select team_id from public.team_projects where id = a.project), 'approval',
        case when p_decision = 'approve' then 'review_approved' else 'review_changes' end,
        (select title from public.team_projects where id = a.project), jsonb_build_object('items', v_n));
    end loop;
  end if;
  return v_n;
end $$;
