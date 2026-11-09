-- Ekip projeleri, WP2 (docs/history/360-*, 361-*): proje kütüphanesi.
--
-- Kütüphane, projeye (ekip Space'ine) bağlı AYRI bir Space'tir (`kind = 'team_library'`, `project_space_id` dolu). Mevcut yönetişim kodu (onay, gizleme, sürüm, API)
-- `kind = 'team_library'` süzdüğü için DEĞİŞMEDEN çalışır. Erişim projeden türer: `_team_space_access_level` projeye devreder, proje erişimi değişince
-- `_team_sync_space` çocuğu da eşitler. Ekip kütüphanesi (`teams.library_space_id`) bugünkü gibi kalır. Onay yetkisi: ekip yeteneği, grup lideri ya da PROJEDE `approve`/`manage`.
-- Proje başına onay sayısı `spaces.approvals_needed` (null = ekip değeri). Yeni aşırı yüklerin yeni argümanları VARSAYILANSIZDIR; eskiler ince sarmalayıcı kalır (expand → contract).

-- 1. Sütunlar
alter table public.spaces add column if not exists project_space_id uuid references public.spaces (id) on delete cascade;
alter table public.spaces add column if not exists approvals_needed smallint check (approvals_needed is null or approvals_needed between 1 and 3);
create unique index if not exists spaces_project_library_uniq on public.spaces (project_space_id) where project_space_id is not null;

-- Bağ doğrulaması: yalnız ekip kütüphanesi türü, aynı ekipten, kütüphane olmayan bir projeye; ekip kütüphanesi kimsenin projesi/çocuğu olamaz.
create or replace function public.spaces_project_link_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.project_space_id is null then return new; end if;
  if new.kind <> 'team_library' or new.team_id is null or new.project_space_id = new.id then raise exception 'space_invalid'; end if;
  if not exists (select 1 from public.spaces p where p.id = new.project_space_id and p.team_id = new.team_id and p.kind <> 'team_library' and p.project_space_id is null) then
    raise exception 'space_invalid';
  end if;
  if exists (select 1 from public.teams t where t.library_space_id = new.id) then raise exception 'space_invalid'; end if;
  return new;
end $$;
drop trigger if exists spaces_project_link_guard on public.spaces;
create trigger spaces_project_link_guard before insert or update of project_space_id, kind, team_id on public.spaces
  for each row execute function public.spaces_project_link_guard();

-- Yeni sütunlar yalnız RPC/tetikleyiciyle yazılır (sahip politikası kolon bazlı değil): mevcut koruma genişler.
CREATE OR REPLACE FUNCTION public.spaces_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'space_invalid';
  end if;
  if (new.owner_id <> old.owner_id or new.team_id is distinct from old.team_id
      or new.team_creator_id is distinct from old.team_creator_id or new.team_access_mode is distinct from old.team_access_mode
      or new.project_space_id is distinct from old.project_space_id or new.approvals_needed is distinct from old.approvals_needed)
     and not public._team_sync_on() and pg_trigger_depth() <= 1 then
    raise exception 'space_invalid';
  end if;
  if new.team_id is not null and new.visibility <> 'private' then
    raise exception 'space_team_managed';
  end if;
  if exists (select 1 from public.teams t where t.library_space_id = new.id) and new.archived_at is not null and old.archived_at is null then
    raise exception 'team_library_locked';
  end if;
  new.title := btrim(new.title);
  if new.cover_url is distinct from old.cover_url and new.cover_url is not null
     and not public._space_valid_upload_url(new.id, new.cover_url) then
    raise exception 'space_invalid';
  end if;
  if new.cover_item_id is distinct from old.cover_item_id and new.cover_item_id is not null
     and not exists (select 1 from public.space_items i where i.id = new.cover_item_id and i.space_id = new.id and i.kind = 'image') then
    raise exception 'space_invalid';
  end if;
  if (new.title, new.description, new.kind, new.visibility, new.cover_url, new.cover_item_id, new.archived_at)
     is distinct from (old.title, old.description, old.kind, old.visibility, old.cover_url, old.cover_item_id, old.archived_at) then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $function$;

-- Çocuk kütüphanenin erişim modu proje ile aynı görünür (yalnız gösterim; karar projedendir) ve proje arşivlenince kütüphane de arşivlenir.
create or replace function public.spaces_project_children_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.team_access_mode is distinct from old.team_access_mode then
    update public.spaces set team_access_mode = new.team_access_mode where project_space_id = new.id;
  end if;
  if new.archived_at is distinct from old.archived_at then
    update public.spaces set archived_at = new.archived_at where project_space_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists spaces_project_children_sync on public.spaces;
create trigger spaces_project_children_sync after update of team_access_mode, archived_at on public.spaces
  for each row when (new.project_space_id is null) execute function public.spaces_project_children_sync();

-- 2. Erişim devri: kütüphane çocuğu projenin seviyesini kullanır.
create or replace function public._team_space_access_level(p_space uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_role text;
  v_base integer := 0;
  v_entry integer := 0;
  v_best integer;
begin
  select sp.team_id, sp.team_access_mode, sp.project_space_id into s from public.spaces sp where sp.id = p_space;
  if s.team_id is null then return null; end if;
  if s.project_space_id is not null then return public._team_space_access_level(s.project_space_id, p_user); end if;
  v_role := public._team_role(s.team_id, p_user);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'manage'; end if;
  if s.team_access_mode = 'admins' then return null; end if;
  if s.team_access_mode = 'all' then
    if v_role = 'guest' then return null; end if;
    v_base := case when v_role = 'member' then 1 else 2 end;
  end if;
  select coalesce(max(public._team_space_level_rank(a.level)), 0) into v_entry
    from public.team_access a
   where a.space_id = p_space
     and ((a.subject_type = 'member' and a.subject_id = p_user)
          or (a.subject_type = 'group' and exists (select 1 from public.team_group_members gm where gm.group_id = a.subject_id and gm.user_id = p_user)));
  if s.team_access_mode = 'selected' and v_entry = 0 then return null; end if;
  v_best := greatest(v_base, v_entry);
  if v_role = 'guest' then v_best := least(v_best, 2); end if;
  return case v_best when 1 then 'view' when 2 then 'edit' when 3 then 'approve' when 4 then 'manage' else null end;
end $$;

-- Proje eşitlenirken kütüphane çocukları da eşitlenir.
create or replace function public._team_sync_space(p_space uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; u record; c record;
begin
  select team_id into v_team from public.spaces where id = p_space;
  if v_team is null then return; end if;
  for u in (select m.user_id from public.team_members m where m.team_id = v_team union select x.user_id from public.space_members x where x.space_id = p_space) loop
    perform public._team_sync_space_user(p_space, u.user_id);
  end loop;
  for c in select s.id from public.spaces s where s.project_space_id = p_space loop
    perform public._team_sync_space(c.id);
  end loop;
end $$;

create or replace function public.team_set_space_access(p_space uuid, p_mode text, p_entries jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.spaces;
  e jsonb;
  v_type text; v_id uuid; v_level text;
  v_old text;
  v_old_elev integer;
  v_new_elev integer := 0;
begin
  select * into s from public.spaces where id = p_space for update;
  if not found or s.team_id is null or v_uid is null then raise exception 'space_not_found'; end if;
  if public._team_role(s.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if s.project_space_id is not null then raise exception 'space_project_managed'; end if;
  if not (public._team_can(s.team_id, v_uid, 'manage_members') or s.team_creator_id = v_uid or public._team_space_cap(p_space, v_uid, 'manage')) then
    raise exception 'team_forbidden';
  end if;
  if coalesce(p_mode, '') not in ('all', 'selected', 'admins') or jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 100 then
    raise exception 'space_invalid';
  end if;
  if exists (select 1 from public.teams t where t.library_space_id = p_space) and (p_mode <> 'all' or jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 0) then
    raise exception 'team_library_locked';
  end if;
  if p_mode = 'admins' and jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 0 then raise exception 'space_invalid'; end if;

  v_old := s.team_access_mode;
  select count(*) into v_old_elev from public.team_access a where a.space_id = p_space and a.level in ('approve', 'manage');
  perform set_config('promptly.team_sync', '1', true);
  delete from public.team_access where space_id = p_space;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_type := e ->> 'type'; v_level := e ->> 'level';
    begin v_id := (e ->> 'id')::uuid; exception when others then raise exception 'space_invalid'; end;
    if v_type not in ('member', 'group') or v_level not in ('view', 'edit', 'approve', 'manage') then raise exception 'space_invalid'; end if;
    if p_mode = 'all' and v_level not in ('approve', 'manage') then raise exception 'space_invalid'; end if;
    if v_type = 'member' and not exists (select 1 from public.team_members m where m.team_id = s.team_id and m.user_id = v_id) then raise exception 'space_invalid'; end if;
    if v_type = 'member' and v_level in ('approve', 'manage') and coalesce(public._team_role(s.team_id, v_id), 'guest') = 'guest' then raise exception 'space_invalid'; end if;
    if v_type = 'group' and not exists (select 1 from public.team_groups g where g.id = v_id and g.team_id = s.team_id) then raise exception 'space_invalid'; end if;
    insert into public.team_access (team_id, space_id, subject_type, subject_id, level, created_by)
    values (s.team_id, p_space, v_type, v_id, v_level, v_uid) on conflict do nothing;
    if v_level in ('approve', 'manage') then v_new_elev := v_new_elev + 1; end if;
  end loop;
  update public.spaces set team_access_mode = p_mode where id = p_space;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_sync_space(p_space);
  perform public._team_audit(s.team_id, 'access', 'access_changed', s.title,
    jsonb_build_object('from', v_old, 'to', p_mode, 'entries', jsonb_array_length(coalesce(p_entries, '[]'::jsonb))));
  if v_old_elev > 0 or v_new_elev > 0 then
    perform public._team_audit(s.team_id, 'access', 'space_level_changed', s.title, jsonb_build_object('elevated_before', v_old_elev, 'elevated_after', v_new_elev));
  end if;
end $$;

-- 3. Onay sayısı ve yetki
create or replace function public._team_approvals_needed(p_space uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(s.approvals_needed, t.approvals_needed)::integer
    from public.spaces s join public.teams t on t.id = s.team_id
   where s.id = p_space and public.can_read_space(s.id)
$$;

create or replace function public._team_can_approve_item(p_item uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public._team_can(s.team_id, p_user, 'approve_library')
        or (s.project_space_id is not null and public._team_space_cap(s.project_space_id, p_user, 'approve'))
        or exists (
             select 1 from public.space_groups sg
               join public.team_groups tg on tg.id = sg.team_group_id
              where sg.id = i.group_id and tg.leads_approve and tg.lead_id = p_user
                and public._team_role(s.team_id, p_user) in ('owner', 'admin', 'editor', 'member'))
      from public.space_items i join public.spaces s on s.id = i.space_id
     where i.id = p_item and s.team_id is not null and s.kind = 'team_library'
  ), false)
$$;
create or replace function public.space_can_approve(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.kind = 'team_library' and public.can_read_space(s.id)
       and case when s.team_id is not null
                then public._team_can(s.team_id, auth.uid(), 'approve_library')
                     or (s.project_space_id is not null and public._team_space_cap(s.project_space_id, auth.uid(), 'approve'))
                     or exists (select 1 from public.space_groups sg join public.team_groups tg on tg.id = sg.team_group_id
                                 where sg.space_id = s.id and tg.leads_approve and tg.lead_id = auth.uid())
                else public.space_role(s.id) = 'owner' and public.can_edit_space(s.id) end
      from public.spaces s where s.id = p_space and auth.uid() is not null
  ), false)
$$;
create or replace function public.space_decide_item(p_item uuid, p_decision text, p_note text default '', p_checklist jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  t public.teams;
  v_note text := btrim(coalesce(p_note, ''));
  v_count integer;
  v_final boolean := false;
  v_check jsonb := coalesce(p_checklist, '[]'::jsonb);
  e jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_decision not in ('approve', 'changes') or char_length(v_note) > 1000 then raise exception 'space_invalid'; end if;
  if jsonb_typeof(v_check) <> 'array' or jsonb_array_length(v_check) > 10 then raise exception 'space_invalid'; end if;
  for e in select * from jsonb_array_elements(v_check) loop
    if jsonb_typeof(e) <> 'object' or char_length(coalesce(e ->> 'key', '')) not between 1 and 40 or jsonb_typeof(e -> 'done') <> 'boolean' then raise exception 'space_invalid'; end if;
  end loop;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.team_id is null or s.kind <> 'team_library' then raise exception 'space_invalid'; end if;
  select * into t from public.teams where id = s.team_id;
  t.approvals_needed := public._team_approvals_needed(i.space_id)::smallint;
  if not public._team_can_approve_item(p_item, v_uid) then raise exception 'space_forbidden'; end if;
  if i.deprecated_at is not null then raise exception 'space_invalid'; end if;
  if p_decision = 'changes' and i.approved_at is not null then raise exception 'space_invalid'; end if;

  insert into public.space_item_approvals (item_id, space_id, user_id, content_rev, decision, note, checklist)
  values (p_item, i.space_id, v_uid, i.content_rev, p_decision, v_note, v_check)
  on conflict (item_id, user_id, content_rev) do update set decision = excluded.decision, note = excluded.note, checklist = excluded.checklist, created_at = now();
  insert into public.space_item_review_comments (item_id, space_id, author_id, kind, body, content_rev)
  values (p_item, i.space_id, v_uid, p_decision,
          case when v_note <> '' then v_note when p_decision = 'approve' then 'Onayladı.' else 'Değişiklik istedi.' end, i.content_rev);

  select count(*) into v_count from public.space_item_approvals a where a.item_id = p_item and a.content_rev = i.content_rev and a.decision = 'approve';

  perform set_config('promptly.space_approval', '1', true);
  if p_decision = 'approve' then
    if v_count >= t.approvals_needed then
      v_final := true;
      update public.space_items set approved_at = now(), approved_by = v_uid, review_requested_at = null, review_requested_by = null where id = p_item;
    end if;
  else
    update public.space_items set review_requested_at = null, review_requested_by = null where id = p_item;
  end if;
  perform set_config('promptly.space_approval', '', true);

  if v_final then
    perform public._space_log(i.space_id, 'item_approved', nullif(btrim(i.title), ''));
    perform public._team_audit(s.team_id, 'approval', 'item_approved', i.title, jsonb_build_object('rev', i.content_rev, 'approvals', v_count));
    perform public._team_notify(i.created_by, v_uid, s.team_id, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(i.title), ''), 'Adsız'), 80) || '" promptunu ekip kütüphanesinde onayladı.',
      '/spaces/local?id=' || i.space_id || '&tab=prompts', 'teamapprove:' || p_item || ':a:' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  elsif p_decision = 'changes' then
    perform public._team_audit(s.team_id, 'approval', 'changes_requested', i.title, jsonb_build_object('rev', i.content_rev));
    perform public._team_notify(i.created_by, v_uid, s.team_id, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(i.title), ''), 'Adsız'), 80) || '" promptunda değişiklik istedi.',
      '/spaces/local?id=' || i.space_id || '&tab=prompts', 'teamchanges:' || p_item || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;
  return jsonb_build_object('state', case when v_final then 'approved' when p_decision = 'changes' then 'draft' else 'pending' end,
                            'approvals', v_count, 'needed', t.approvals_needed);
end $$;
create or replace function public.space_item_review(p_item uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  t public.teams;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or not (public.space_role(i.space_id) in ('owner', 'editor') or public._team_can_approve_item(p_item, v_uid)) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.team_id is null then raise exception 'space_invalid'; end if;
  select * into t from public.teams where id = s.team_id;
  return jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'title', i.title, 'body', i.body, 'rev', i.content_rev, 'state', public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at),
                               'review_requested_at', i.review_requested_at, 'requested_by', i.review_requested_by, 'created_by', i.created_by, 'updated_at', i.updated_at,
                               'requested_by_name', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = i.review_requested_by)),
    'sample', (select jsonb_build_object('body', x.body, 'author', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = x.author_id), 'at', x.updated_at)
                 from public.space_item_review_samples x where x.item_id = p_item),
    'needed', public._team_approvals_needed(i.space_id),
    'approvers', coalesce((select jsonb_agg(x.n order by x.n) from (select coalesce(nullif(p.display_name, ''), p.username) as n
                              from public.team_members m join public.profiles p on p.id = m.user_id
                             where m.team_id = t.id and m.role <> 'guest' and public._team_can_approve_item(p_item, m.user_id) limit 6) x), '[]'::jsonb),
    'can_decide', public._team_can_approve_item(p_item, v_uid),
    'base', (select jsonb_build_object('title', v.title, 'body', v.body, 'was_approved', v.was_approved, 'at', v.created_at,
                                       'author', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = v.author_id))
               from public.space_item_versions v where v.item_id = p_item order by v.was_approved desc, v.created_at desc limit 1),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', coalesce(nullif(p.display_name, ''), p.username), 'decision', a.decision,
                                                                'note', a.note, 'checklist', a.checklist, 'at', a.created_at) order by a.created_at)
                             from public.space_item_approvals a join public.profiles p on p.id = a.user_id
                            where a.item_id = p_item and a.content_rev = i.content_rev), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.author_id, 'name', coalesce(nullif(p.display_name, ''), p.username), 'username', p.username,
                                                              'kind', c.kind, 'body', c.body, 'rev', c.content_rev, 'at', c.created_at) order by c.created_at)
                            from (select * from public.space_item_review_comments x where x.item_id = p_item order by x.created_at desc limit 100) c
                            left join public.profiles p on p.id = c.author_id), '[]'::jsonb));
end $$;

-- Proje başına onay sayısı (null = ekip değeri). Yetki: ekip yöneticisi ya da projede `manage`. Düşürmek bekleyen öğeyi kendiliğinden onaylamaz (bir sonraki karar sayar).
create or replace function public.space_set_project_approvals(p_space uuid, p_needed integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.spaces;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into s from public.spaces where id = p_space for update;
  if not found or s.team_id is null or public._team_role(s.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if s.project_space_id is null or s.kind <> 'team_library' then raise exception 'space_invalid'; end if;
  if not (public._team_can(s.team_id, v_uid, 'manage_members') or public._team_space_cap(s.project_space_id, v_uid, 'manage')) then raise exception 'team_forbidden'; end if;
  if p_needed is not null and p_needed not between 1 and 3 then raise exception 'space_invalid'; end if;
  perform set_config('promptly.team_sync', '1', true);
  update public.spaces set approvals_needed = p_needed::smallint where id = p_space;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_audit(s.team_id, 'library', 'project_approvals_changed', s.title, jsonb_build_object('needed', p_needed));
end $$;

-- 4. Proje kütüphanesini aç: projede `manage` (ya da ekip yöneticisi / projeyi açan). Proje başına en çok bir; erişim projeden türer.
create or replace function public.team_create_project_library(p_project uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.spaces;
  v_owner uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into p from public.spaces where id = p_project for update;
  if not found or p.team_id is null or public._team_role(p.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if p.kind = 'team_library' or p.project_space_id is not null then raise exception 'space_invalid'; end if;
  if not (public._team_can(p.team_id, v_uid, 'manage_members') or p.team_creator_id = v_uid or public._team_space_cap(p_project, v_uid, 'manage')) then
    raise exception 'team_forbidden';
  end if;
  perform public._assert_can_act(true);
  if p.archived_at is not null then raise exception 'space_invalid'; end if;
  if exists (select 1 from public.spaces c where c.project_space_id = p_project) then raise exception 'project_library_exists'; end if;
  select m.user_id into v_owner from public.team_members m where m.team_id = p.team_id and m.role = 'owner';
  perform set_config('promptly.team_sync', '1', true);
  insert into public.spaces (owner_id, title, description, kind, visibility, team_id, team_creator_id, team_access_mode, updated_by, project_space_id)
  values (v_owner, left(p.title, 66) || ' · Kütüphane', '', 'team_library', 'private', p.team_id, v_uid, p.team_access_mode, v_uid, p_project)
  returning id into v_id;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_sync_space(v_id);
  perform public._team_audit(p.team_id, 'library', 'project_library_created', p.title);
  return v_id;
end $$;

-- 5. Okuma: kütüphane listesi, öğe listesi ve sayaçlar (SECURITY INVOKER: gizleme politikası aynen uygulanır)
create or replace function public.team_libraries(p_team uuid)
returns table (id uuid, title text, project_id uuid, project_title text, is_main boolean, approved_count integer, pending_count integer, can_approve boolean, access_mode text, approvals_needed integer, approvals_custom boolean)
language sql stable security invoker set search_path = public as $$
  select s.id, s.title, s.project_space_id, p.title, t.library_space_id = s.id,
         (select count(*)::integer from public.space_items i where i.space_id = s.id and i.kind = 'prompt' and i.is_draft and i.approved_at is not null and i.deprecated_at is null),
         (select count(*)::integer from public.space_items i where i.space_id = s.id and i.kind = 'prompt' and i.is_draft and i.review_requested_at is not null and i.approved_at is null and i.deprecated_at is null),
         public.space_can_approve(s.id), s.team_access_mode, public._team_approvals_needed(s.id), s.approvals_needed is not null
    from public.spaces s
    join public.teams t on t.id = s.team_id
    left join public.spaces p on p.id = s.project_space_id
   where s.team_id = p_team and s.kind = 'team_library' and s.archived_at is null and auth.uid() is not null
   order by (t.library_space_id = s.id) desc, s.title, s.id
$$;

create or replace function public.team_library_items(p_team uuid, p_status text, p_search text, p_limit integer, p_offset integer, p_space uuid)
returns table (id uuid, title text, group_id uuid, group_name text, state text, content_rev integer, use_count integer, works_yes integer, works_no integer,
               approvals integer, approvals_needed integer, updated_at timestamptz, updated_by uuid, updated_by_name text, created_by uuid,
               review_requested_at timestamptz, approved_at timestamptz, deprecated_at timestamptz, locked boolean)
language sql stable security invoker set search_path = public as $$
  select i.id, i.title, i.group_id, g.name, public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at), i.content_rev, i.use_count, i.works_yes, i.works_no,
         (select count(*)::integer from public.space_item_approvals a where a.item_id = i.id and a.content_rev = i.content_rev and a.decision = 'approve'),
         public._team_approvals_needed(i.space_id), i.updated_at, i.updated_by, coalesce(nullif(p.display_name, ''), p.username), i.created_by,
         i.review_requested_at, i.approved_at, i.deprecated_at, i.locked
    from public.teams t
    join public.space_items i on i.space_id = coalesce(p_space, t.library_space_id) and i.kind = 'prompt' and i.is_draft
    left join public.space_groups g on g.id = i.group_id
    left join public.profiles p on p.id = coalesce(i.updated_by, i.created_by)
   where t.id = p_team
     and (p_space is null or exists (select 1 from public.spaces ls where ls.id = p_space and ls.team_id = p_team and ls.kind = 'team_library'))
     and (coalesce(p_status, 'all') = 'all' or public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at) = p_status)
     and (nullif(btrim(coalesce(p_search, '')), '') is null or i.title ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%')
   order by i.updated_at desc, i.id
   limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- Eski imza: ince sarmalayıcı (ekip kütüphanesi).
create or replace function public.team_library_items(p_team uuid, p_status text default 'all', p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, title text, group_id uuid, group_name text, state text, content_rev integer, use_count integer, works_yes integer, works_no integer,
               approvals integer, approvals_needed integer, updated_at timestamptz, updated_by uuid, updated_by_name text, created_by uuid,
               review_requested_at timestamptz, approved_at timestamptz, deprecated_at timestamptz, locked boolean)
language sql stable security invoker set search_path = public as $$
  select * from public.team_library_items(p_team, p_status, p_search, p_limit, p_offset, null::uuid)
$$;

create or replace function public.team_library_counts(p_team uuid, p_space uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'approved', count(*) filter (where state = 'approved'),
    'pending', count(*) filter (where state = 'pending'),
    'draft', count(*) filter (where state = 'draft'),
    'deprecated', count(*) filter (where state = 'deprecated'),
    'oldest_pending_at', min(review_requested_at) filter (where state = 'pending'))
  from (
    select public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at) as state, i.review_requested_at
      from public.teams t
      join public.space_items i on i.space_id = coalesce(p_space, t.library_space_id) and i.kind = 'prompt' and i.is_draft
     where t.id = p_team
       and (p_space is null or exists (select 1 from public.spaces ls where ls.id = p_space and ls.team_id = p_team and ls.kind = 'team_library'))) x
$$;

create or replace function public.team_library_counts(p_team uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select public.team_library_counts(p_team, null::uuid)
$$;

create or replace function public.my_team_todos()
returns table (team_id uuid, team_name text, team_slug text, kind text, n integer, label text, href text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_n integer; i record; v_unread integer; v_guests integer; v_libs uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for r in select t.id, t.name, t.slug, t.library_space_id, m.role from public.team_members m join public.teams t on t.id = m.team_id
            where m.user_id = auth.uid() and m.role <> 'guest' order by t.name loop
    select coalesce(array_agg(s.id), '{}') into v_libs from public.spaces s where s.team_id = r.id and s.kind = 'team_library' and s.archived_at is null and public.can_read_space(s.id);
    select count(*)::integer into v_n from public.space_items it
     where it.space_id = any (v_libs) and it.kind = 'prompt' and it.is_draft and it.review_requested_at is not null and it.approved_at is null and it.deprecated_at is null
       and public._team_can_approve_item(it.id, auth.uid());
    if v_n > 0 then
      return query select r.id, r.name, r.slug, 'approvals'::text, v_n, null::text, '/teams/local?id=' || r.id || '&tab=library&status=pending', now();
      for i in select it.id, it.title, it.review_requested_at, coalesce(nullif(p.display_name, ''), p.username) as who
                 from public.space_items it left join public.profiles p on p.id = it.review_requested_by
                where it.space_id = any (v_libs) and it.kind = 'prompt' and it.is_draft and it.review_requested_at is not null and it.approved_at is null and it.deprecated_at is null
                  and it.review_requested_by is distinct from auth.uid() and public._team_can_approve_item(it.id, auth.uid())
                order by it.review_requested_at desc limit 3 loop
        return query select r.id, r.name, r.slug, 'review'::text, 1, i.title || ' · ' || coalesce(i.who, ''), '/teams/local?id=' || r.id || '&tab=library&review=' || i.id, i.review_requested_at;
      end loop;
    end if;
    select coalesce(sum(u.unread_count), 0)::integer into v_unread
      from public.team_channels tc join public.conversation_members cm on cm.conversation_id = tc.id and cm.user_id = auth.uid()
      cross join lateral public.group_unread_counts(array[tc.id]) u where tc.team_id = r.id and tc.archived_at is null;
    if v_unread > 0 then
      return query select r.id, r.name, r.slug, 'unread'::text, v_unread, null::text, '/teams/local?id=' || r.id || '&tab=chat', now();
    end if;
    if r.role in ('owner', 'admin') then
      select count(*)::integer into v_guests from public.team_members g where g.team_id = r.id and g.role = 'guest' and g.guest_until > now() and g.guest_until < now() + interval '7 days';
      if v_guests > 0 then
        return query select r.id, r.name, r.slug, 'guest_expiring'::text, v_guests, null::text, '/teams/local?id=' || r.id || '&tab=manage&section=guests', now();
      end if;
    end if;
  end loop;
end $$;
create or replace function public.team_insights(p_team uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.teams;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_from date := (now() at time zone 'utc')::date - (greatest(7, least(coalesce(p_days, 30), 90)) - 1);
  v_prev_from date := (now() at time zone 'utc')::date - (2 * greatest(7, least(coalesce(p_days, 30), 90)) - 1);
  v_lib uuid;
  v_libs uuid[];
  v_copies integer; v_copies_prev integer;
  v_med numeric; v_med_prev numeric;
  v_contrib integer; v_contrib_prev integer;
  v_stale integer;
begin
  perform public._team_require(p_team, 'view_audit');
  select * into t from public.teams where id = p_team;
  v_lib := t.library_space_id;
  select coalesce(array_agg(s.id), '{}') into v_libs from public.spaces s where s.team_id = p_team and s.kind = 'team_library' and s.archived_at is null;
  select count(*) into v_copies from public.space_item_uses u where u.space_id = any (v_libs) and u.day >= v_from;
  select count(*) into v_copies_prev from public.space_item_uses u where u.space_id = any (v_libs) and u.day >= v_prev_from and u.day < v_from;
  select (percentile_cont(0.5) within group (order by extract(epoch from i.approved_at - i.review_started_at) / 3600.0))::numeric into v_med
    from public.space_items i where i.space_id = any (v_libs) and i.approved_at is not null and i.review_started_at is not null and i.approved_at > i.review_started_at and i.approved_at >= v_from;
  select (percentile_cont(0.5) within group (order by extract(epoch from i.approved_at - i.review_started_at) / 3600.0))::numeric into v_med_prev
    from public.space_items i where i.space_id = any (v_libs) and i.approved_at is not null and i.review_started_at is not null and i.approved_at > i.review_started_at and i.approved_at >= v_prev_from and i.approved_at < v_from;
  select count(distinct coalesce(i.updated_by, i.created_by)) into v_contrib from public.space_items i where i.space_id = any (v_libs) and i.kind = 'prompt' and i.is_draft and i.updated_at >= v_from;
  select count(distinct coalesce(i.updated_by, i.created_by)) into v_contrib_prev from public.space_items i where i.space_id = any (v_libs) and i.kind = 'prompt' and i.is_draft and i.updated_at >= v_prev_from and i.updated_at < v_from;
  select count(*) into v_stale from public.space_items i where i.space_id = any (v_libs) and i.kind = 'prompt' and i.is_draft and i.deprecated_at is null and i.updated_at < now() - interval '90 days';
  return jsonb_build_object(
    'days', v_days,
    'copies', v_copies, 'copies_prev', v_copies_prev,
    'approval_hours', v_med, 'approval_hours_prev', v_med_prev,
    'contributors', v_contrib, 'contributors_prev', v_contrib_prev, 'members', t.member_count,
    'stale', v_stale,
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
                         from generate_series(v_from, (now() at time zone 'utc')::date, interval '1 day') d
                         left join (select u.day, count(*)::integer as n from public.space_item_uses u where u.space_id = any (v_libs) and u.day >= v_from group by u.day) c on c.day = d::date), '[]'::jsonb),
    'alerts', jsonb_build_object(
      'pending', (select count(*) from public.space_items i where i.space_id = any (v_libs) and i.kind = 'prompt' and i.is_draft and i.review_requested_at is not null and i.approved_at is null and i.deprecated_at is null),
      'oldest_pending_days', (select extract(day from now() - min(i.review_requested_at))::integer from public.space_items i where i.space_id = any (v_libs) and i.review_requested_at is not null and i.approved_at is null and i.deprecated_at is null),
      'stale', v_stale,
      'deprecated_used', (select count(distinct u.item_id)::integer from public.space_item_uses u join public.space_items i on i.id = u.item_id where u.space_id = any (v_libs) and i.deprecated_at is not null and u.day >= v_from)),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'copies', x.copies, 'works_yes', x.works_yes, 'works_no', x.works_no, 'rev', x.content_rev,
                                          'updated_at', x.updated_at, 'stale', x.updated_at < now() - interval '90 days') order by x.copies desc, x.title)
        from (select i.id, i.title, i.works_yes, i.works_no, i.content_rev, i.updated_at,
                     (select count(*)::integer from public.space_item_uses u where u.item_id = i.id and u.day >= v_from) as copies
                from public.space_items i where i.space_id = any (v_libs) and i.kind = 'prompt' and i.is_draft and i.deprecated_at is null
               order by 7 desc, i.title limit 8) x where x.copies > 0), '[]'::jsonb));
end $$;
create or replace function public.team_export(p_team uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.teams; v_out jsonb;
begin
  perform public._team_require(p_team, 'export');
  select * into t from public.teams where id = p_team;
  v_out := jsonb_build_object(
    'format', 'promptly.team-library', 'schemaVersion', 1, 'exportedAt', now(),
    'team', jsonb_build_object('name', t.name, 'slug', t.slug),
    'variables', coalesce((select jsonb_agg(jsonb_build_object('name', v.name, 'value', v.value) order by v.name) from public.space_variables v where v.space_id = t.library_space_id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('title', i.title, 'text', i.body, 'folder', g.name, 'state', public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at),
                                          'version', i.content_rev, 'uses', i.use_count, 'worksYes', i.works_yes, 'worksNo', i.works_no, 'updatedAt', i.updated_at) order by g.position nulls first, i.title)
        from (select * from public.space_items x where x.space_id = t.library_space_id and x.kind = 'prompt' and x.is_draft order by x.title limit 2000) i
        left join public.space_groups g on g.id = i.group_id), '[]'::jsonb),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('title', s.title, 'kind', s.kind, 'access', s.team_access_mode) order by s.title) from public.spaces s where s.team_id = p_team and s.id <> t.library_space_id and s.project_space_id is null), '[]'::jsonb));
  v_out := v_out || jsonb_build_object('projectLibraries', coalesce((
    select jsonb_agg(jsonb_build_object(
             'project', p.title, 'title', s.title,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object('title', i.title, 'text', i.body, 'folder', g.name, 'state', public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at),
                                                   'version', i.content_rev, 'uses', i.use_count, 'worksYes', i.works_yes, 'worksNo', i.works_no, 'updatedAt', i.updated_at) order by g.position nulls first, i.title)
                 from (select * from public.space_items x where x.space_id = s.id and x.kind = 'prompt' and x.is_draft order by x.title limit 2000) i
                 left join public.space_groups g on g.id = i.group_id), '[]'::jsonb)) order by p.title)
      from public.spaces s join public.spaces p on p.id = s.project_space_id
     where s.team_id = p_team and s.kind = 'team_library'), '[]'::jsonb));
  perform public._team_audit(p_team, 'team', 'team_exported', t.name);
  return v_out;
end $$;
create or replace function public.team_access_overview(p_team uuid)
returns table (space_id uuid, title text, kind text, is_library boolean, mode text, member_count integer, guest_count integer, entry_count integer, creator_name text, updated_at timestamptz, archived_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'manage_members');
  return query
  select s.id, s.title, s.kind, t.library_space_id = s.id, s.team_access_mode,
         (select count(*)::integer from public.space_members m where m.space_id = s.id),
         (select count(*)::integer from public.space_members m join public.team_members tm on tm.team_id = p_team and tm.user_id = m.user_id and tm.role = 'guest' where m.space_id = s.id),
         (select count(*)::integer from public.team_access a where a.space_id = s.id),
         (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = s.team_creator_id), s.updated_at, s.archived_at
    from public.spaces s join public.teams t on t.id = s.team_id
   where s.team_id = p_team and s.project_space_id is null
   order by s.archived_at is not null, (t.library_space_id = s.id) desc, s.updated_at desc;
end $$;
create or replace function public.team_list_spaces(p_team uuid, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text, title text, description text, kind text,
               visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[], image_count integer, prompt_count integer,
               note_count integer, member_count integer, my_role text, is_favorite boolean, last_opened_at timestamptz, created_at timestamptz,
               updated_at timestamptz, archived_at timestamptz, access_mode text, guest_count integer, is_library boolean)
language sql stable set search_path = public as $$
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url, s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         (select count(*)::integer from public.space_members c where c.space_id = s.id),
         public.space_role(s.id), coalesce(us.favorite, false), us.last_opened_at, s.created_at, s.updated_at, s.archived_at, s.team_access_mode,
         (select count(*)::integer from public.space_members c join public.team_members tm on tm.team_id = s.team_id and tm.user_id = c.user_id and tm.role = 'guest' where c.space_id = s.id),
         exists (select 1 from public.teams t where t.id = s.team_id and t.library_space_id = s.id)
    from public.spaces s
    join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.profiles op on op.id = s.owner_id
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where s.team_id = p_team and s.project_space_id is null
   order by s.archived_at is not null, (s.id = (select t.library_space_id from public.teams t where t.id = p_team)) desc, s.updated_at desc, s.id
   limit greatest(1, least(coalesce(p_limit, 50), 60)) offset greatest(0, coalesce(p_offset, 0))
$$;
create or replace function public._team_recount(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('promptly.team_deleting', true), '') = '1' then return; end if;
  update public.teams t set
    member_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role <> 'guest'),
    guest_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role = 'guest'),
    space_count = (select count(*) from public.spaces s where s.team_id = t.id and s.archived_at is null and s.project_space_id is null),
    channel_count = (select count(*) from public.team_channels c where c.team_id = t.id and c.archived_at is null)
  where t.id = p_team;
end $$;

-- Mevcut ekipler için sayaç düzeltmesi gerekmez (bu migration'a kadar çocuk kütüphane yoktu).

-- 6. Yetkiler
revoke execute on function public.spaces_project_link_guard(), public.spaces_project_children_sync(), public._team_approvals_needed(uuid) from public, anon, authenticated;
grant execute on function public._team_approvals_needed(uuid) to authenticated;
revoke execute on function public.space_set_project_approvals(uuid, integer), public.team_create_project_library(uuid), public.team_libraries(uuid),
  public.team_library_items(uuid, text, text, integer, integer, uuid), public.team_library_counts(uuid, uuid) from public, anon;
grant execute on function public.space_set_project_approvals(uuid, integer), public.team_create_project_library(uuid), public.team_libraries(uuid),
  public.team_library_items(uuid, text, text, integer, integer, uuid), public.team_library_counts(uuid, uuid) to authenticated;
