-- Ekip projeleri v2, PR-A / 2 (docs/history/362-*): ERİŞİM MOTORU. Ekleyicidir.
--
-- Tek doğruluk kaynağı: PROJE ROLÜ (`_team_project_role`). Projenin tüm alanları (Space motoru satırları) ve proje kanalı bu rolden YANSITILIR:
-- `_team_space_access_level` (eşitleme motorunun tek giriş noktası) alan için proje rolünü döndürür, böylece mevcut eşitleme tetikleyicileri
-- (ekip üyeliği, grup üyeliği) alanlarda kendiliğinden çalışır; `can_read_space` / `can_edit_space` ve 80'den fazla çağıran DEĞİŞMEZ.
-- view → space_members 'viewer'; edit/lead → 'editor'. Lider yetkisi yalnız ekip RPC'lerinde anlam taşır.
-- Ekip düzeyi yetenekler (manage_members, view_audit, export…) proje rolünden ASLA gelmez.

-- ============================================================================
-- 1. Rol çözümü
-- ============================================================================
create or replace function public._team_project_rank(p_role text)
returns integer language sql immutable set search_path = public as $$
  select case p_role when 'lead' then 3 when 'edit' then 2 when 'view' then 1 else 0 end
$$;

-- 'lead' | 'edit' | 'view' | null. Ekip sahibi/yöneticisi her projede 'lead' (örtük, değişmez). Konuk en çok 'edit'.
-- `all` modunda taban rol projeden gelir (ekip rolünden DEĞİL: roller yalnız proje başınadır); girişler tabanı yükseltir, asla düşürmez.
create or replace function public._team_project_role(p_project uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  p record;
  v_role text;
  v_base integer := 0;
  v_entry integer := 0;
  v_best integer;
begin
  select pr.team_id, pr.access_mode, pr.base_role into p from public.team_projects pr where pr.id = p_project;
  if not found then return null; end if;
  v_role := public._team_role(p.team_id, p_user);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'lead'; end if;
  if p.access_mode = 'all' and v_role <> 'guest' then
    v_base := public._team_project_rank(p.base_role);
  end if;
  select coalesce(max(public._team_project_rank(a.role)), 0) into v_entry
    from public.team_project_access a
   where a.project_id = p_project
     and ((a.subject_type = 'member' and a.subject_id = p_user)
          or (a.subject_type = 'group' and exists (select 1 from public.team_group_members gm where gm.group_id = a.subject_id and gm.user_id = p_user)));
  v_best := greatest(v_base, v_entry);
  if v_role = 'guest' then v_best := least(v_best, 2); end if;
  return case v_best when 1 then 'view' when 2 then 'edit' when 3 then 'lead' else null end;
end $$;

-- İstemciye açık: yalnız ÇAĞIRANIN rolü (başkasının rolü sızmasın).
create or replace function public.team_my_project_role(p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select public._team_project_role(p_project, auth.uid())
$$;

-- Alanın ait olduğu projenin kimliği (alan değilse null).
create or replace function public._team_area_project(p_space uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.team_project_id from public.spaces s where s.id = p_space
$$;

-- Çağıranın bu projede en az verilen rolde olup olmadığı ('view' | 'edit' | 'lead').
create or replace function public._team_project_has(p_project uuid, p_user uuid, p_min text)
returns boolean language sql stable security definer set search_path = public as $$
  select public._team_project_rank(public._team_project_role(p_project, p_user)) >= public._team_project_rank(p_min)
$$;

-- RPC girişi: projeyi çözer, ekip üyeliğini ve en düşük rolü denetler. Proje yok / rolsüz → 'project_not_found'; rol yetmez → 'team_forbidden'.
create or replace function public._team_project_require(p_project uuid, p_min text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public._team_project_role(p_project, v_uid) is null then raise exception 'project_not_found'; end if;
  if not public._team_project_has(p_project, v_uid, p_min) then raise exception 'team_forbidden'; end if;
  return v_uid;
end $$;

-- ============================================================================
-- 2. Eşitleme: alanlar ve proje kanalı proje rolünü izler
-- ============================================================================
-- Tek giriş noktası: alan için proje rolü (view → 'view', edit → 'edit', lead → 'manage'). Diğer dallar 20261114110000'daki gibidir.
create or replace function public._team_space_access_level(p_space uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_role text;
  v_base integer := 0;
  v_entry integer := 0;
  v_best integer;
begin
  select sp.team_id, sp.team_access_mode, sp.project_space_id, sp.team_project_id into s from public.spaces sp where sp.id = p_space;
  if s.team_id is null then return null; end if;
  if s.team_project_id is not null then
    v_role := public._team_project_role(s.team_project_id, p_user);
    return case v_role when 'view' then 'view' when 'edit' then 'edit' when 'lead' then 'manage' else null end;
  end if;
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

-- Kanal düzeyi: proje kanalı 'project' modunda projeyi görebilen herkese açıktır (yazma yetkisi kanalın `posting_policy`'sine bağlıdır).
create or replace function public._team_channel_level(p_channel uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  v_role text;
  v_edit boolean;
  v_any boolean;
begin
  select team_id, mode, space_id, project_id into c from public.team_channels where id = p_channel;
  if c.team_id is null then return null; end if;
  v_role := public._team_role(c.team_id, p_user);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'edit'; end if;
  if c.mode = 'open' then
    return case when v_role = 'guest' then null else 'edit' end;
  elsif c.mode = 'space' then
    return case when public._team_space_level(c.space_id, p_user) is null then null else 'edit' end;
  elsif c.mode = 'project' then
    return case when public._team_project_role(c.project_id, p_user) is null then null else 'edit' end;
  end if;
  select coalesce(bool_or(a.level = 'edit'), false), count(*) > 0 into v_edit, v_any
    from public.team_access a
   where a.channel_id = p_channel
     and ((a.subject_type = 'member' and a.subject_id = p_user)
          or (a.subject_type = 'group' and exists (select 1 from public.team_group_members gm where gm.group_id = a.subject_id and gm.user_id = p_user)));
  if not v_any then return null; end if;
  return case when v_edit then 'edit' else 'view' end;
end $$;

-- Projenin tüm alanlarını ve kanalını eşitle (erişim değişince).
create or replace function public._team_sync_project(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; c record;
begin
  for a in select s.id from public.spaces s where s.team_project_id = p_project loop
    perform public._team_sync_space(a.id);
  end loop;
  for c in select tc.id from public.team_channels tc where tc.project_id = p_project loop
    perform public._team_sync_channel(c.id);
  end loop;
end $$;

-- Erişim girişi değişince (yalnız RPC yazar; yine de tek yerden eşitle).
create or replace function public.team_project_access_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._team_sync_project(coalesce(new.project_id, old.project_id));
  return null;
end $$;
drop trigger if exists team_project_access_after_change on public.team_project_access;
create trigger team_project_access_after_change after insert or update or delete on public.team_project_access
  for each row execute function public.team_project_access_after_change();

-- Üye ekipten çıkınca kişi girişleri gider; grup silinince grup girişleri gider (sahipsiz giriş kalmaz).
create or replace function public.team_members_project_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_project_access where team_id = old.team_id and subject_type = 'member' and subject_id = old.user_id;
  return null;
end $$;
drop trigger if exists team_members_project_cleanup on public.team_members;
create trigger team_members_project_cleanup after delete on public.team_members for each row execute function public.team_members_project_cleanup();

create or replace function public.team_groups_project_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_project_access where team_id = old.team_id and subject_type = 'group' and subject_id = old.id;
  return old;
end $$;
drop trigger if exists team_groups_project_cleanup on public.team_groups;
create trigger team_groups_project_cleanup before delete on public.team_groups for each row execute function public.team_groups_project_cleanup();

-- ============================================================================
-- 3. Yaşam döngüsü: arşiv / silme
-- ============================================================================
-- Proje arşivlenince alanları ve kanalı da arşivlenir (alan arşivliyken `can_edit_space` false → salt okunur); geri dönünce açılır.
create or replace function public.team_projects_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.archived_at is distinct from old.archived_at then
    perform set_config('promptly.team_sync', '1', true);
    update public.spaces set archived_at = new.archived_at where team_project_id = new.id and archived_at is distinct from new.archived_at;
    update public.team_channels set archived_at = new.archived_at where project_id = new.id and archived_at is distinct from new.archived_at;
    perform set_config('promptly.team_sync', '', true);
  end if;
  return null;
end $$;
drop trigger if exists team_projects_after_update on public.team_projects;
create trigger team_projects_after_update after update of archived_at on public.team_projects for each row execute function public.team_projects_after_update();

-- Proje silinince kanal konuşması da gider (konuşma silinince kanal ve üyelikler kaskadlanır).
create or replace function public.team_projects_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversations c using public.team_channels tc where tc.project_id = old.id and c.id = tc.id;
  return old;
end $$;
drop trigger if exists team_projects_before_delete on public.team_projects;
create trigger team_projects_before_delete before delete on public.team_projects for each row execute function public.team_projects_before_delete();

-- Proje kanalının yaşam döngüsü projeyindir: elle arşivlenemez/silinemez. (Gövdeler 20261110120000'dakiyle aynıdır; yalnız `project` guard'ı eklendi.)
create or replace function public.team_archive_channel(p_channel uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  perform public._team_require(c.team_id, 'manage_channels');
  if c.is_default then raise exception 'channel_default_locked'; end if;
  if c.mode = 'project' then raise exception 'channel_project_managed'; end if;
  update public.team_channels set archived_at = case when p_archived then now() else null end where id = p_channel;
  perform public._team_audit(c.team_id, 'channel', case when p_archived then 'channel_archived' else 'channel_restored' end, c.name);
end $$;

create or replace function public.team_delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  perform public._team_require(c.team_id, 'manage_channels');
  if c.is_default then raise exception 'channel_default_locked'; end if;
  if c.mode = 'project' then raise exception 'channel_project_managed'; end if;
  perform public._team_audit(c.team_id, 'channel', 'channel_deleted', c.name);
  delete from public.conversations where id = p_channel;
end $$;

-- Proje kanalı (ad projeden; çakışırsa -2, -3…). Elle kanal sınırına (50) sayılmaz.
create or replace function public._team_project_channel_make(p_team uuid, p_project uuid, p_title text, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_base text := regexp_replace(left(public._team_channel_name(p_title), 36), '-+$', '');
  v_name text;
  v_n integer := 1;
  v_id uuid;
begin
  if v_base is null or v_base !~ '^[a-z0-9][a-z0-9-]*$' then v_base := 'proje'; end if;
  v_name := v_base;
  while exists (select 1 from public.team_channels c where c.team_id = p_team and lower(c.name) = v_name) loop
    v_n := v_n + 1;
    v_name := v_base || '-' || v_n;
  end loop;
  perform set_config('promptly.team_sync', '1', true);
  insert into public.conversations (kind) values ('team_channel') returning id into v_id;
  insert into public.team_channels (id, team_id, name, description, mode, project_id, posting_policy, notify_default, is_default, position, created_by)
  values (v_id, p_team, v_name, '', 'project', p_project, 'members', 'mentions', false,
          coalesce((select max(position) + 1 from public.team_channels where team_id = p_team), 0), p_by);
  perform public._team_sync_channel(v_id);
  perform set_config('promptly.team_sync', '', true);
  return v_id;
end $$;

-- ============================================================================
-- 4. Taslak görünürlüğü (onay motoru bunu RLS'te kullanır; sayımlar da aynı kuralı izler)
-- ============================================================================
-- Onaylı öğe herkesin; onaysız öğe yalnız ekleyenin, projenin liderlerinin (ekip sahibi/yöneticisi dahil). Alan değilse kural uygulanmaz.
create or replace function public._team_item_visible(p_space uuid, p_state text, p_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_state = 'approved' then true
    else coalesce((
      select case
               when s.team_project_id is null then true
               when auth.uid() is null then false
               when p_author is not distinct from auth.uid() then true
               else public._team_project_role(s.team_project_id, auth.uid()) = 'lead'
             end
        from public.spaces s where s.id = p_space), true)
  end
$$;
grant execute on function public._team_item_visible(uuid, text, uuid) to anon, authenticated;

-- ============================================================================
-- 5. Yetkiler (yardımcılar istemciye kapalı; yalnız çağıranın kendi rolünü soran team_my_project_role açık)
-- ============================================================================
revoke execute on function public._team_project_rank(text), public._team_project_role(uuid, uuid), public._team_area_project(uuid),
  public._team_project_has(uuid, uuid, text), public._team_project_require(uuid, text), public._team_sync_project(uuid),
  public.team_project_access_after_change(), public.team_members_project_cleanup(), public.team_groups_project_cleanup(),
  public.team_projects_after_update(), public.team_projects_before_delete(), public._team_project_channel_make(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.team_my_project_role(uuid) from public, anon;
grant execute on function public.team_my_project_role(uuid) to authenticated;
