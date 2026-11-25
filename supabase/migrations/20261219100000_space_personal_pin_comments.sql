-- Kişisel Space'e KONUMLU YORUM (pin) — ekip panosundaki yorum özelliği, Space üyeleri arasında (docs/history/461-*).
-- Okuma: Space'i okuyan herkes; yazma yine yalnız RPC. Kişisel Space'te yorum = üyeler arası (görüntüleyici dahil); çözme: yazan + sahip/düzenleyici;
-- silme: yazan + sahip. Bildirimler ekip bildirimi (`_team_notify`) değil doğrudan `notifications` satırıdır (üyelere).

create or replace function public._pin_comment_require(p_space uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_project uuid; v_found boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select s.team_project_id, true into v_project, v_found from public.spaces s where s.id = p_space;
  if v_found is not true then raise exception 'space_not_found'; end if;
  if v_project is not null then
    if public._team_project_role(v_project, v_uid) is null then raise exception 'space_not_found'; end if;
  elsif not public.can_read_space(p_space) then
    raise exception 'space_not_found';
  end if;
  return v_uid;
end $$;

-- Kişisel Space bildirimi: alıcı Space üyesi olmalı; kendine bildirim yok.
create or replace function public._space_member_notify(p_space uuid, p_recipient uuid, p_actor uuid, p_message text, p_href text, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  if not exists (select 1 from public.space_members m where m.space_id = p_space and m.user_id = p_recipient) then return; end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (p_recipient, p_actor, 'system', p_message, p_href, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end $$;
revoke execute on function public._space_member_notify(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pin_comment_create(p_space uuid, p_body text, p_x real DEFAULT NULL::real, p_y real DEFAULT NULL::real, p_item uuid DEFAULT NULL::uuid, p_off_x real DEFAULT NULL::real, p_off_y real DEFAULT NULL::real, p_parent uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := public._pin_comment_require(p_space);
  v_body text := btrim(coalesce(p_body, ''));
  s public.spaces; pr public.team_projects; par public.space_pin_comments; v_item public.space_items;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_actor text; v_href text; v_team boolean; v_msg text; m record; v_rcp uuid; v_notified uuid[] := '{}';
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('pin_comment_create', 60, interval '1 hour');
  if char_length(v_body) not between 1 and 2000 then raise exception 'space_invalid'; end if;
  select * into s from public.spaces where id = p_space;
  select * into pr from public.team_projects where id = s.team_project_id;
  v_team := s.team_project_id is not null;
  if pr.archived_at is not null or s.archived_at is not null then raise exception 'space_archived'; end if;
  if p_parent is not null then
    select * into par from public.space_pin_comments c where c.id = p_parent and c.space_id = p_space and c.parent_id is null;
    if not found then raise exception 'space_invalid'; end if;
    if par.item_id is not null and not exists (
         select 1 from public.space_items i where i.id = par.item_id and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by))) then
      raise exception 'space_invalid';
    end if;
    if (select count(*) from public.space_pin_comments c where c.parent_id = p_parent) >= 200 then raise exception 'space_limit'; end if;
    p_x := null; p_y := null; p_item := par.item_id; p_off_x := null; p_off_y := null;
  else
    if p_x is null or p_y is null or abs(p_x) > 100000 or abs(p_y) > 100000 then raise exception 'space_invalid'; end if;
    if p_item is not null then
      select * into v_item from public.space_items i where i.id = p_item and i.space_id = p_space;
      if not found or not (v_item.rev_state = 'approved' or public._team_item_visible(v_item.space_id, v_item.rev_state, v_item.created_by)) then raise exception 'space_invalid'; end if;
      if p_off_x is null or p_off_y is null then raise exception 'space_invalid'; end if;
    else
      p_off_x := null; p_off_y := null;
    end if;
    if (select count(*) from public.space_pin_comments c where c.space_id = p_space and c.parent_id is null) >= 500 then raise exception 'space_limit'; end if;
  end if;
  insert into public.space_pin_comments (id, space_id, parent_id, author_id, body, x, y, item_id, off_x, off_y)
  values (v_id, p_space, p_parent, v_uid, v_body, p_x, p_y, p_item, p_off_x, p_off_y);

  -- Bildirimler: önce @bahsetme, sonra yanıt (kök yazara), sonra öğenin sahibi. Aynı kişiye tek bildirim.
  v_actor := public._team_actor_name(v_uid);
  v_href := case when v_team
    then '/teams/local?id=' || s.team_id || '&tab=projects&project=' || pr.id || '&board=' || p_space || '&sub=board&comment=' || coalesce(p_parent, v_id)
    else '/spaces/local?id=' || p_space || '&tab=board&comment=' || coalesce(p_parent, v_id) end;
  for m in select distinct lower(x[1]) as uname from regexp_matches(v_body, '@([A-Za-z0-9_]{2,30})', 'g') as x loop
    select p.id into v_rcp from public.profiles p where lower(p.username) = m.uname;
    if v_rcp is not null and v_rcp <> v_uid and (case when v_team then public._team_project_role(pr.id, v_rcp) is not null else exists (select 1 from public.space_members sm where sm.space_id = p_space and sm.user_id = v_rcp) end) then
      if v_team then perform public._team_notify(v_rcp, v_uid, s.team_id, 'direct', v_actor || ' panoda bir yorumda sizden bahsetti: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinm:' || v_id || ':' || v_rcp); else perform public._space_member_notify(p_space, v_rcp, v_uid, v_actor || ' panoda bir yorumda sizden bahsetti: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinm:' || v_id || ':' || v_rcp); end if;
      v_notified := v_notified || v_rcp;
    end if;
  end loop;
  if p_parent is not null then
    if par.author_id is not null and par.author_id <> v_uid and not (par.author_id = any(v_notified)) then
      if v_team then perform public._team_notify(par.author_id, v_uid, s.team_id, 'direct', v_actor || ' panodaki yorumunuzu yanıtladı: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinr:' || v_id || ':' || par.author_id); else perform public._space_member_notify(p_space, par.author_id, v_uid, v_actor || ' panodaki yorumunuzu yanıtladı: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinr:' || v_id || ':' || par.author_id); end if;
    end if;
  elsif v_item.id is not null and v_item.created_by is not null and v_item.created_by <> v_uid and not (v_item.created_by = any(v_notified)) then
    if v_team then perform public._team_notify(v_item.created_by, v_uid, s.team_id, 'direct', v_actor || ' panoda öğenize yorum yaptı: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinc:' || v_id || ':' || v_item.created_by); else perform public._space_member_notify(p_space, v_item.created_by, v_uid, v_actor || ' panoda öğenize yorum yaptı: "' || public.truncate_preview(v_body, 80) || '"', v_href, 'pinc:' || v_id || ':' || v_item.created_by); end if;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.pin_comment_set_resolved(p_id uuid, p_resolved boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.space_pin_comments; v_uid uuid; v_project uuid;
begin
  select * into c from public.space_pin_comments where id = p_id and parent_id is null;
  if not found then raise exception 'space_not_found'; end if;
  v_uid := public._pin_comment_require(c.space_id);
  select s.team_project_id into v_project from public.spaces s where s.id = c.space_id;
  if c.author_id is distinct from v_uid and not (case when v_project is not null then public._team_project_role(v_project, v_uid) in ('edit', 'lead')
       else coalesce(public.space_role(c.space_id), '') in ('owner', 'editor') end) then raise exception 'space_forbidden'; end if;
  update public.space_pin_comments
     set resolved_at = case when coalesce(p_resolved, true) then now() else null end,
         resolved_by = case when coalesce(p_resolved, true) then v_uid else null end
   where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.pin_comment_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.space_pin_comments; v_uid uuid; v_project uuid;
begin
  select * into c from public.space_pin_comments where id = p_id;
  if not found then raise exception 'space_not_found'; end if;
  v_uid := public._pin_comment_require(c.space_id);
  select s.team_project_id into v_project from public.spaces s where s.id = c.space_id;
  if c.author_id is distinct from v_uid and not (case when v_project is not null then public._team_project_role(v_project, v_uid) = 'lead'
       else coalesce(public.space_role(c.space_id), '') = 'owner' end) then raise exception 'space_forbidden'; end if;
  delete from public.space_pin_comments where id = p_id;
end $function$;

drop policy if exists space_pin_comments_select on public.space_pin_comments;
create policy space_pin_comments_select on public.space_pin_comments for select to authenticated using (public.can_read_space(space_id));
