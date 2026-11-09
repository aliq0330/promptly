-- Ekip projeleri, WP1 (docs/history/360-*, 361-*): proje başına rol — erişim seviyeleri view < edit < approve < manage.
--
-- Tasarım: `team_access.level` iki basamaktan dörde çıkar. `space_members` yansıması AYNI kalır (view → viewer; edit/approve/manage → editor),
-- yani `can_read_space` / `can_edit_space` ve onları çağıran her şey DEĞİŞMEZ; `approve`/`manage` yalnız ekip RPC'lerinde anlam taşır.
-- Eski `_team_space_level` sözleşmesi (edit | view | null) bozulmaz: yeni `_team_space_access_level` 4 seviyeyi döndürür, eskisi onun ince sarmalayıcısıdır.
-- Ekip düzeyi yetenekler (manage_members, view_audit, export…) proje seviyesinden ASLA gelmez; konuk en çok `edit` alır.

-- 1. Kısıt: 4 seviye; yeni seviyeler yalnız Space girişlerinde (kanal girişleri edit/view kalır).
alter table public.team_access drop constraint if exists team_access_level_check;
alter table public.team_access add constraint team_access_level_check check (level in ('view', 'edit', 'approve', 'manage'));
alter table public.team_access drop constraint if exists team_access_level_scope;
alter table public.team_access add constraint team_access_level_scope check (level in ('view', 'edit') or space_id is not null);

-- 2. Seviye sırası (view=1 … manage=4; erişim yok = 0).
create or replace function public._team_space_level_rank(p_level text)
returns integer language sql immutable set search_path = public as $$
  select case p_level when 'view' then 1 when 'edit' then 2 when 'approve' then 3 when 'manage' then 4 else 0 end
$$;

-- 3. Kullanıcının bu Space'teki 4 seviyeli erişimi: 'view' | 'edit' | 'approve' | 'manage' | null (erişim yok).
--    Ekip sahibi/yöneticisi her projede `manage`. `all` modunda taban ekip rolünden gelir (üye → view, düzenleyici → edit), girişler tabanı YÜKSELTİR (asla düşürmez).
--    `selected` modunda giriş = o kişinin o projedeki rolüdür (kişi ve grup girişlerinden en yükseği). Konuk en çok `edit`.
create or replace function public._team_space_access_level(p_space uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_role text;
  v_base integer := 0;
  v_entry integer := 0;
  v_best integer;
begin
  select sp.team_id, sp.team_access_mode into s from public.spaces sp where sp.id = p_space;
  if s.team_id is null then return null; end if;
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

-- Eski sözleşme: edit | view | null. Yansıma (`_team_sync_space_user`) ve kanal düzeyi (`_team_channel_level`) bunu kullanmaya devam eder.
create or replace function public._team_space_level(p_space uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case public._team_space_access_level(p_space, p_user)
           when 'view' then 'view' when 'edit' then 'edit' when 'approve' then 'edit' when 'manage' then 'edit' end
$$;

-- Çağıranın bu projede en az `approve` / `manage` seviyesinde olup olmadığı (ekip sahibi/yöneticisi hep true).
create or replace function public._team_space_cap(p_space uuid, p_user uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public._team_space_level_rank(public._team_space_access_level(p_space, p_user))
                  >= case p_cap when 'approve' then 3 when 'manage' then 4 else 99 end, false)
$$;

create or replace function public.team_my_space_level(p_space uuid)
returns text language sql stable security definer set search_path = public as $$
  select public._team_space_access_level(p_space, auth.uid())
$$;

-- Ekibin okuyabildiğim projelerindeki seviyem (tek çağrı; kart menülerindeki "Kütüphane aç" / "Kanal aç" yetkisi için).
create or replace function public.team_my_space_levels(p_team uuid)
returns table (space_id uuid, level text)
language sql stable security definer set search_path = public as $$
  select x.id, x.lvl
    from (select s.id, public._team_space_access_level(s.id, auth.uid()) as lvl
            from public.spaces s
           where s.team_id = p_team and auth.uid() is not null and public._team_role(p_team, auth.uid()) is not null) x
   where x.lvl is not null
$$;

-- 4. Erişimi değiştir: yetki = ekip yöneticisi (manage_members) ya da projeyi açan ya da projede `manage` seviyesindeki kişi.
--    Mod `all`: girişler yalnız YÜKSELTME olabilir (approve | manage). Mod `admins`: giriş yok. Konuğa approve/manage verilemez.
--    Ekip kütüphanesi modu `all` kalır ve yükseltme girişi almaz (onay yetkisi grup liderleri ve ekip yeteneğidir).
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

-- Erişim listesini okuma (erişim penceresi): erişimi değiştirebilenle AYNI yetki — projede `manage` seviyesi de okuyabilir.
create or replace function public.team_space_access(p_space uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.spaces;
begin
  select * into s from public.spaces where id = p_space;
  if not found or s.team_id is null or v_uid is null then raise exception 'space_not_found'; end if;
  if public._team_role(s.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if not (public._team_can(s.team_id, v_uid, 'manage_members') or s.team_creator_id = v_uid or public._team_space_cap(p_space, v_uid, 'manage')) then raise exception 'team_forbidden'; end if;
  return jsonb_build_object(
    'mode', s.team_access_mode,
    'is_library', exists (select 1 from public.teams t where t.id = s.team_id and t.library_space_id = s.id),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', a.subject_type, 'id', a.subject_id, 'level', a.level,
               'name', coalesce(g.name, p.display_name, p.username),
               'username', p.username,
               'sub', case when a.subject_type = 'group' then (select count(*) from public.team_group_members gm where gm.group_id = a.subject_id)::text
                           else tm.role end,
               'guest_until', tm.guest_until)
             order by a.subject_type desc, coalesce(g.name, p.display_name, p.username))
        from public.team_access a
        left join public.team_groups g on a.subject_type = 'group' and g.id = a.subject_id
        left join public.profiles p on a.subject_type = 'member' and p.id = a.subject_id
        left join public.team_members tm on a.subject_type = 'member' and tm.team_id = a.team_id and tm.user_id = a.subject_id
       where a.space_id = p_space), '[]'::jsonb),
    'member_count', (select count(*) from public.space_members m where m.space_id = p_space));
end $$;

-- 5. Yetkiler: yeni yardımcılar istemciye açılmaz (tek istisna: çağıranın kendi seviyesini soran `team_my_space_level`).
revoke execute on function public._team_space_level_rank(text), public._team_space_access_level(uuid, uuid), public._team_space_cap(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.team_my_space_level(uuid), public.team_my_space_levels(uuid) from public, anon;
grant execute on function public.team_my_space_level(uuid), public.team_my_space_levels(uuid) to authenticated;
