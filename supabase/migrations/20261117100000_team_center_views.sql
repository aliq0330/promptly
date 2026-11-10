-- Ekip sayfası "Merkez" yönü (docs/history/366-*): Genel bakış (son etkinlik), Onaylar panosu ve Üyeler kartları için üç OKUMA RPC'si.
-- Yalnız ekleyici (expand): tablo/sütun değişikliği ve yazma yok; yıkıcı SQL yok. Yetki kararı sunucudadır (`_team_project_role`, `_team_item_visible`).

-- ============================================================================
-- 1. Onay panosu: ekibin bekleyen / değişiklik istenen / bugün onaylanan öğeleri
-- ============================================================================
-- Lider (ekip sahibi/yöneticisi dahil) kendi projelerinin TÜM öğelerini, diğer roller yalnız KENDİ öğelerini görür; taslak (draft) hiç girmez.
-- `can_decide` yalnız projede lider olana true'dur (karar yine `team_review_decide`'dadır).
create or replace function public.team_review_board(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public._team_role(p_team, v_uid) is null then raise exception 'team_not_found'; end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(x.j order by x.at desc)
        from (
          select coalesce(i.rev_decided_at, i.rev_submitted_at, i.created_at) as at,
                 jsonb_build_object(
                   'id', i.id, 'kind', i.kind, 'state', i.rev_state, 'title', i.title, 'body', left(i.body, 300), 'note', i.rev_note,
                   'media_url', i.media_url, 'content_type', i.content_type, 'color', i.color,
                   'space_id', i.space_id, 'project_id', pr.id, 'project_title', pr.title, 'file_id', s.team_file_id, 'file_title', f.title,
                   'author_id', i.created_by, 'author_name', coalesce(nullif(p.display_name, ''), p.username), 'author_username', p.username,
                   'submitted_at', i.rev_submitted_at, 'decided_at', i.rev_decided_at, 'unit', i.rev_unit,
                   'unit_count', case when i.rev_unit is null then 1
                                      else (select count(*) from public.space_items y where y.space_id = i.space_id and y.rev_unit = i.rev_unit and y.rev_state = i.rev_state) end,
                   'can_decide', public._team_project_role(pr.id, v_uid) = 'lead',
                   'mine', i.created_by is not distinct from v_uid) as j
            from public.space_items i
            join public.spaces s on s.id = i.space_id and s.team_project_id is not null
            join public.team_projects pr on pr.id = s.team_project_id and pr.team_id = p_team and pr.archived_at is null
            left join public.team_files f on f.id = s.team_file_id
            left join public.profiles p on p.id = i.created_by
           where public._team_project_role(pr.id, v_uid) is not null
             and (i.rev_state in ('pending', 'changes') or (i.rev_state = 'approved' and i.rev_decided_at >= date_trunc('day', now())))
             and (public._team_project_role(pr.id, v_uid) = 'lead' or i.created_by = v_uid)
           order by coalesce(i.rev_decided_at, i.rev_submitted_at, i.created_at) desc
           limit 300) x), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', pp.item_id, 'kind', i.kind, 'space_id', pp.space_id, 'project_id', pr.id, 'project_title', pr.title, 'file_id', s.team_file_id, 'file_title', f.title,
               'current_title', i.title, 'proposed_title', pp.title, 'proposed_body', left(pp.body, 300), 'note', pp.note,
               'proposer_id', pp.proposed_by, 'proposer_name', coalesce(nullif(p.display_name, ''), p.username), 'proposed_at', pp.proposed_at)
             order by pp.proposed_at desc)
        from public.space_item_proposals pp
        join public.space_items i on i.id = pp.item_id
        join public.spaces s on s.id = pp.space_id and s.team_project_id is not null
        join public.team_projects pr on pr.id = s.team_project_id and pr.team_id = p_team and pr.archived_at is null
        left join public.team_files f on f.id = s.team_file_id
        left join public.profiles p on p.id = pp.proposed_by
       where pp.state = 'pending' and public._team_project_role(pr.id, v_uid) = 'lead'), '[]'::jsonb));
end $$;

-- ============================================================================
-- 2. Son etkinlik (Genel bakış): eklenen · onaylanan · değişiklik istenen öğe, açılan dosya, katılan üye
-- ============================================================================
-- Kişi yalnız ROLÜ OLDUĞU projelerin etkinliğini görür; taslak ve onaysız öğeler `_team_item_visible` kuralına uyar (taslak hiç girmez).
create or replace function public.team_recent_activity(p_team uuid, p_limit integer default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 30);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_role := public._team_role(p_team, v_uid);
  if v_role is null then raise exception 'team_not_found'; end if;
  return coalesce((
    select jsonb_agg(e.j order by e.at desc)
      from (
        select x.at,
               jsonb_build_object('kind', x.kind, 'actor_id', x.actor, 'actor_name', coalesce(nullif(pf.display_name, ''), pf.username), 'title', x.title,
                                  'item_kind', x.item_kind, 'project_id', x.project_id, 'project_title', x.project_title, 'file_title', x.file_title, 'at', x.at) as j
          from (
            select i.created_at as at, 'added'::text as kind, i.created_by as actor, i.title, i.kind as item_kind, pr.id as project_id, pr.title as project_title, f.title as file_title
              from public.space_items i
              join public.spaces s on s.id = i.space_id and s.team_project_id is not null
              join public.team_projects pr on pr.id = s.team_project_id and pr.team_id = p_team and pr.archived_at is null
              left join public.team_files f on f.id = s.team_file_id
             where public._team_project_role(pr.id, v_uid) is not null and i.rev_state <> 'draft'
               and public._team_item_visible(i.space_id, i.rev_state, i.created_by) and i.created_at > now() - interval '30 days'
            union all
            select i.rev_decided_at, 'approved', i.rev_decided_by, i.title, i.kind, pr.id, pr.title, f.title
              from public.space_items i
              join public.spaces s on s.id = i.space_id and s.team_project_id is not null
              join public.team_projects pr on pr.id = s.team_project_id and pr.team_id = p_team and pr.archived_at is null
              left join public.team_files f on f.id = s.team_file_id
             where public._team_project_role(pr.id, v_uid) is not null and i.rev_state = 'approved' and i.rev_decided_at is not null
               and i.rev_decided_by is not null and i.rev_decided_at > now() - interval '30 days'
            union all
            select i.rev_decided_at, 'changes', i.rev_decided_by, i.title, i.kind, pr.id, pr.title, f.title
              from public.space_items i
              join public.spaces s on s.id = i.space_id and s.team_project_id is not null
              join public.team_projects pr on pr.id = s.team_project_id and pr.team_id = p_team and pr.archived_at is null
              left join public.team_files f on f.id = s.team_file_id
             where public._team_project_role(pr.id, v_uid) is not null and i.rev_state = 'changes' and i.rev_decided_at is not null
               and public._team_item_visible(i.space_id, i.rev_state, i.created_by) and i.rev_decided_at > now() - interval '30 days'
            union all
            select tf.created_at, 'file', tf.created_by, tf.title, 'file', pr.id, pr.title, null::text
              from public.team_files tf
              join public.team_projects pr on pr.id = tf.project_id and pr.team_id = p_team and pr.archived_at is null
             where tf.archived_at is null and public._team_project_role(pr.id, v_uid) is not null and tf.created_at > now() - interval '30 days'
            union all
            select m.joined_at, 'joined', m.user_id, null::text, null::text, null::uuid, null::text, null::text
              from public.team_members m
             where m.team_id = p_team and v_role <> 'guest' and m.joined_at > now() - interval '30 days'
          ) x
          left join public.profiles pf on pf.id = x.actor
         order by x.at desc
         limit v_limit) e), '[]'::jsonb);
end $$;

-- ============================================================================
-- 3. Üye başına proje rolü sayıları (Üyeler kartları: "3 projede lider")
-- ============================================================================
-- Yalnız ÇAĞIRANIN görebildiği projeler sayılır (başkasının erişim ilişkisi sızmaz); konuk çağıramaz.
create or replace function public.team_member_project_roles(p_team uuid)
returns table (user_id uuid, lead_count integer, edit_count integer, view_count integer)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_role := public._team_role(p_team, v_uid);
  if v_role is null then raise exception 'team_not_found'; end if;
  if v_role = 'guest' then raise exception 'team_forbidden'; end if;
  return query
    select m.user_id,
           (count(*) filter (where x.r = 'lead'))::integer,
           (count(*) filter (where x.r = 'edit'))::integer,
           (count(*) filter (where x.r = 'view'))::integer
      from public.team_members m
      left join lateral (
        select public._team_project_role(pr.id, m.user_id) as r
          from public.team_projects pr
         where pr.team_id = p_team and pr.archived_at is null and public._team_project_role(pr.id, v_uid) is not null) x on true
     where m.team_id = p_team
     group by m.user_id;
end $$;

-- ============================================================================
-- 4. Yetkiler (yalnız oturumlu üye çağırır; ziyaretçiye KAPALI)
-- ============================================================================
revoke execute on function public.team_review_board(uuid), public.team_recent_activity(uuid, integer), public.team_member_project_roles(uuid) from public, anon;
grant execute on function public.team_review_board(uuid), public.team_recent_activity(uuid, integer), public.team_member_project_roles(uuid) to authenticated;
