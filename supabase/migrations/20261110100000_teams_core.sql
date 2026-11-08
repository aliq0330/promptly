-- Ekipler, WP2 (docs/history/353-*): topluluktan BAĞIMSIZ ekip çekirdeği.
--
-- Tasarım: ekip ayrı bir varlıktır (`teams`); `chat_groups`'a bağı YOKTUR. Ekip üyeliği KAYNAKTIR (`team_members`); Space'in `space_members`
-- satırları `team_access` + ekip üyeliğinden hesaplanan YANSIMADIR (349'daki eşitleme kalıbının genellemesi). Böylece `can_read_space` /
-- `can_edit_space` (80'den fazla çağıran) DEĞİŞMEZ. Yetki role değil YETENEĞE bağlıdır (`_team_can`); matris `lib/teams.ts` ile aynıdır.
-- Ekleyicidir: yeni tablo/sütun/fonksiyon; eski topluluk-ekip yapısı (spaces.community_id vb.) WP9'daki yıkıcı migration'da kaldırılır.

-- ============================================================================
-- 1. Tablolar
-- ============================================================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  tone text not null default 'primary' check (tone in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky')),
  -- Politikalar (Yönetim → Politikalar)
  require_approval boolean not null default true,
  approvals_needed smallint not null default 1 check (approvals_needed between 1 and 3),
  hide_unapproved boolean not null default true,
  content_owner text not null default 'team' check (content_owner in ('team', 'author')),
  offboard_default text not null default 'ask' check (offboard_default in ('ask', 'team', 'admin')),
  version_keep smallint not null default 50 check (version_keep in (10, 25, 50, 100)),
  default_member_role text not null default 'member' check (default_member_role in ('member', 'editor')),
  invite_link_ttl_days smallint not null default 7 check (invite_link_ttl_days between 1 and 30),
  publish_external_role text not null default 'admin' check (publish_external_role in ('owner', 'admin', 'editor')),
  guest_invite_role text not null default 'admin' check (guest_invite_role in ('owner', 'admin', 'editor')),
  export_role text not null default 'owner' check (export_role in ('owner', 'admin')),
  mcp_enabled boolean not null default true,
  mcp_audience text not null default 'members' check (mcp_audience in ('members', 'editors', 'admins')),
  -- Korumalı sayaçlar (yalnız `_team_recount` yazar)
  member_count integer not null default 0,
  guest_count integer not null default 0,
  space_count integer not null default 0,
  channel_count integer not null default 0,
  library_space_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teams enable row level security;
drop trigger if exists teams_protect_counters on public.teams;
create trigger teams_protect_counters before insert or update of member_count, guest_count, space_count, channel_count on public.teams
  for each row execute function public.protect_counter_columns('member_count', 'guest_count', 'space_count', 'channel_count');

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'member', 'guest')),
  joined_at timestamptz not null default now(),
  guest_org text check (guest_org is null or char_length(guest_org) <= 60),
  guest_until timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  primary key (team_id, user_id),
  constraint team_members_guest_shape check ((role = 'guest') = (guest_until is not null))
);
create unique index if not exists team_members_one_owner on public.team_members (team_id) where role = 'owner';
create index if not exists team_members_user_idx on public.team_members (user_id);
alter table public.team_members enable row level security;

create table if not exists public.team_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  tone text not null default 'primary' check (tone in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky')),
  lead_id uuid references public.profiles (id) on delete set null,
  leads_approve boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists team_groups_name_uniq on public.team_groups (team_id, lower(btrim(name)));
alter table public.team_groups enable row level security;

create table if not exists public.team_group_members (
  group_id uuid not null references public.team_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);
create index if not exists team_group_members_user_idx on public.team_group_members (user_id);
alter table public.team_group_members enable row level security;

-- Space ve (WP4'te) kanal erişimi için TEK tablo.
create table if not exists public.team_access (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  channel_id uuid,
  subject_type text not null check (subject_type in ('member', 'group')),
  subject_id uuid not null,
  level text not null check (level in ('edit', 'view')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint team_access_one_scope check (((space_id is not null)::integer + (channel_id is not null)::integer) = 1)
);
create unique index if not exists team_access_space_uniq on public.team_access (space_id, subject_type, subject_id) where space_id is not null;
create unique index if not exists team_access_channel_uniq on public.team_access (channel_id, subject_type, subject_id) where channel_id is not null;
create index if not exists team_access_team_idx on public.team_access (team_id);
alter table public.team_access enable row level security;

-- Denetim günlüğü: yalnız ekleme; ekip silinse de kalmaz (FK yok → ekip silinince temizlenir: `teams_before_delete`).
create table if not exists public.team_audit (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  category text not null check (category in ('approval', 'role', 'access', 'invite', 'variable', 'library', 'member', 'policy', 'channel', 'guest', 'group', 'integration', 'team')),
  action text not null check (char_length(action) between 1 and 60),
  target_label text check (target_label is null or char_length(target_label) <= 120),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists team_audit_team_idx on public.team_audit (team_id, created_at desc, id);
alter table public.team_audit enable row level security;

-- ============================================================================
-- 2. Space bağı
-- ============================================================================
alter table public.spaces add column if not exists team_id uuid references public.teams (id) on delete set null;
alter table public.spaces add column if not exists team_access_mode text not null default 'all' check (team_access_mode in ('all', 'selected', 'admins'));
alter table public.spaces add column if not exists team_creator_id uuid references public.profiles (id) on delete set null;
create index if not exists spaces_team_idx on public.spaces (team_id) where team_id is not null;
do $$ begin
  alter table public.teams add constraint teams_library_space_fk foreign key (library_space_id) references public.spaces (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 3. Rol ve yetenek yardımcıları (TEK doğruluk kaynağı; lib/teams.ts aynasıdır)
-- ============================================================================
create or replace function public._team_rank(p_role text)
returns integer language sql immutable set search_path = public as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 when 'member' then 1 else 0 end
$$;

create or replace function public._team_all_capabilities()
returns text[] language sql immutable set search_path = public as $$
  select array['manage_members', 'manage_team', 'create_spaces', 'manage_channels', 'approve_library', 'write_variables',
               'publish_external', 'view_audit', 'manage_groups', 'invite_guests', 'export'];
$$;

create or replace function public._team_role_caps(p_role text)
returns text[] language sql immutable set search_path = public as $$
  select case p_role
    when 'owner' then public._team_all_capabilities()
    when 'admin' then public._team_all_capabilities()
    when 'editor' then array['create_spaces', 'write_variables']
    else array[]::text[]
  end
$$;

-- Çağıranın (ya da verilen kullanıcının) ekipteki rolü; süresi dolan konuk rolsüz sayılır.
create or replace function public._team_role(p_team uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.team_members m
   where m.team_id = p_team and m.user_id = p_user and (m.role <> 'guest' or m.guest_until > now())
$$;

create or replace function public._team_can(p_team uuid, p_user uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when m.role is null then false
      when p_cap = 'publish_external' then public._team_rank(m.role) >= public._team_rank(t.publish_external_role)
      when p_cap = 'invite_guests' then public._team_rank(m.role) >= public._team_rank(t.guest_invite_role)
      when p_cap = 'export' then public._team_rank(m.role) >= public._team_rank(t.export_role)
      else p_cap = any (public._team_role_caps(m.role))
    end
    from public.teams t
    left join public.team_members m on m.team_id = t.id and m.user_id = p_user and (m.role <> 'guest' or m.guest_until > now())
    where t.id = p_team
  ), false)
$$;

create or replace function public._team_require(p_team uuid, p_cap text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public._team_role(p_team, v_uid) is null then raise exception 'team_not_found'; end if;
  if not public._team_can(p_team, v_uid, p_cap) then raise exception 'team_forbidden'; end if;
  return v_uid;
end $$;

create or replace function public.is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._team_role(p_team, auth.uid()) is not null
$$;

-- RLS politikaları yalnız ÇAĞIRANIN rolünü sorar: (ekip, kullanıcı) alan sürümler istemciye kapalı kalır (başkasının rolü sızmasın).
create or replace function public.team_my_role(p_team uuid)
returns text language sql stable security definer set search_path = public as $$
  select public._team_role(p_team, auth.uid())
$$;
create or replace function public.team_my_can(p_team uuid, p_cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select public._team_can(p_team, auth.uid(), p_cap)
$$;

create or replace function public._team_audit(p_team uuid, p_category text, p_action text, p_label text default null, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.team_audit (team_id, actor_id, category, action, target_label, details)
  values (p_team, auth.uid(), p_category, p_action, left(p_label, 120), coalesce(p_details, '{}'::jsonb))
$$;

create or replace function public._team_recount(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Ekip silinirken (BEFORE DELETE zinciri) silinecek satırı güncellemek "tuple already modified" hatası verir: sayaç atlanır.
  if coalesce(current_setting('promptly.team_deleting', true), '') = '1' then return; end if;
  update public.teams t set
    member_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role <> 'guest'),
    guest_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role = 'guest'),
    space_count = (select count(*) from public.spaces s where s.team_id = t.id and s.archived_at is null)
  where t.id = p_team;
end $$;

create or replace function public._team_slugify(p_name text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(lower(translate(btrim(p_name), 'çğıöşüÇĞİÖŞÜâîûÂÎÛ', 'cgiosucgiosuaiuaiu')), '[^a-z0-9]+', '-', 'g'),
           '(^-+|-+$)', '', 'g')
$$;

create or replace function public._team_unique_slug(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_base text := left(public._team_slugify(p_name), 32); v_slug text; v_n integer := 0;
begin
  if char_length(v_base) < 3 then v_base := 'ekip'; end if;
  v_slug := v_base;
  while exists (select 1 from public.teams t where t.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end $$;

-- ============================================================================
-- 4. Erişim motoru: team_access + üyelik → space_members yansıması
-- ============================================================================
create or replace function public._team_sync_on()
returns boolean language sql stable set search_path = public as $$ select coalesce(current_setting('promptly.team_sync', true), '') = '1' $$;

-- Kullanıcının bu Space'teki hedef seviyesi: 'edit' | 'view' | null (erişim yok).
create or replace function public._team_space_level(p_space uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_role text;
  v_edit boolean;
  v_any boolean;
begin
  select sp.team_id, sp.team_access_mode into s from public.spaces sp where sp.id = p_space;
  if s.team_id is null then return null; end if;
  v_role := public._team_role(s.team_id, p_user);
  if v_role is null then return null; end if;
  if v_role in ('owner', 'admin') then return 'edit'; end if;
  if s.team_access_mode = 'admins' then return null; end if;
  if s.team_access_mode = 'all' then
    if v_role = 'guest' then return null; end if;
    return case when v_role = 'member' then 'view' else 'edit' end;
  end if;
  select coalesce(bool_or(a.level = 'edit'), false), count(*) > 0 into v_edit, v_any
    from public.team_access a
   where a.space_id = p_space
     and ((a.subject_type = 'member' and a.subject_id = p_user)
          or (a.subject_type = 'group' and exists (select 1 from public.team_group_members gm where gm.group_id = a.subject_id and gm.user_id = p_user)));
  if not v_any then return null; end if;
  return case when v_edit then 'edit' else 'view' end;
end $$;

create or replace function public._team_sync_space_user(p_space uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_level text;
  v_owner uuid;
  v_cur text;
  v_want text;
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
begin
  select owner_id into v_owner from public.spaces where id = p_space;
  if v_owner is null or v_owner = p_user then return; end if;
  v_level := public._team_space_level(p_space, p_user);
  select role into v_cur from public.space_members where space_id = p_space and user_id = p_user;
  perform set_config('promptly.team_sync', '1', true);
  if v_level is null then
    if v_cur is not null then delete from public.space_members where space_id = p_space and user_id = p_user and role <> 'owner'; end if;
  else
    v_want := case v_level when 'edit' then 'editor' else 'viewer' end;
    if v_cur is null then
      insert into public.space_members (space_id, user_id, role, added_by) values (p_space, p_user, v_want, v_owner) on conflict do nothing;
    elsif v_cur <> v_want and v_cur <> 'owner' then
      update public.space_members set role = v_want where space_id = p_space and user_id = p_user;
    end if;
  end if;
  perform set_config('promptly.team_sync', v_prev, true);
end $$;

create or replace function public._team_sync_space(p_space uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; u record;
begin
  select team_id into v_team from public.spaces where id = p_space;
  if v_team is null then return; end if;
  for u in (select m.user_id from public.team_members m where m.team_id = v_team union select x.user_id from public.space_members x where x.space_id = p_space) loop
    perform public._team_sync_space_user(p_space, u.user_id);
  end loop;
end $$;

create or replace function public._team_sync_user_spaces(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select s.id from public.spaces s where s.team_id = p_team loop
    perform public._team_sync_space_user(r.id, p_user);
  end loop;
end $$;

-- Üyelik değişince: Space yansıması, grup üyelikleri ve kişiye özel erişim girişleri.
create or replace function public.team_members_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'guest' then
      if (select count(*) from public.team_members m where m.team_id = new.team_id and m.role = 'guest') >= 50 then raise exception 'team_guest_limit'; end if;
    elsif (select count(*) from public.team_members m where m.team_id = new.team_id and m.role <> 'guest') >= 500 then
      raise exception 'team_member_limit';
    end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'owner' and not public._team_sync_on() and pg_trigger_depth() <= 1 then raise exception 'team_owner_required'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists team_members_before_write on public.team_members;
create trigger team_members_before_write before insert or delete on public.team_members for each row execute function public.team_members_before_write();

create or replace function public.team_members_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.team_group_members gm using public.team_groups g where g.id = gm.group_id and g.team_id = old.team_id and gm.user_id = old.user_id;
    delete from public.team_access where team_id = old.team_id and subject_type = 'member' and subject_id = old.user_id;
    perform public._team_sync_user_spaces(old.team_id, old.user_id);
    perform public._team_recount(old.team_id);
  else
    perform public._team_sync_user_spaces(new.team_id, new.user_id);
    perform public._team_recount(new.team_id);
  end if;
  return null;
end $$;
drop trigger if exists team_members_after_change on public.team_members;
create trigger team_members_after_change after insert or update of role, guest_until or delete on public.team_members for each row execute function public.team_members_after_change();

create or replace function public.team_group_members_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_user uuid;
begin
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  select g.team_id into v_team from public.team_groups g where g.id = case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  if v_team is not null then perform public._team_sync_user_spaces(v_team, v_user); end if;
  return null;
end $$;
drop trigger if exists team_group_members_after_change on public.team_group_members;
create trigger team_group_members_after_change after insert or delete on public.team_group_members for each row execute function public.team_group_members_after_change();

create or replace function public.team_groups_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_access where team_id = old.team_id and subject_type = 'group' and subject_id = old.id;
  return old;
end $$;
drop trigger if exists team_groups_before_delete on public.team_groups;
create trigger team_groups_before_delete before delete on public.team_groups for each row execute function public.team_groups_before_delete();

create or replace function public.team_access_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space uuid := coalesce(new.space_id, old.space_id);
begin
  if v_space is not null then perform public._team_sync_space(v_space); end if;
  return null;
end $$;
drop trigger if exists team_access_after_change on public.team_access;
create trigger team_access_after_change after insert or update or delete on public.team_access for each row execute function public.team_access_after_change();

-- ============================================================================
-- 5. Space korumaları (team_id'ye göre; eski community_id kolu WP9'a kadar yaşar)
-- ============================================================================
create or replace function public.space_role(p_space uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when m.role = 'owner' then 'owner'
    when s.team_id is not null and (public._team_role(s.team_id, auth.uid()) in ('owner', 'admin') or s.team_creator_id = auth.uid()) then 'owner'
    when s.community_id is not null and public._group_can(s.community_id, auth.uid(), 'create_spaces') then 'owner'
    else m.role
  end
  from public.space_members m
  join public.spaces s on s.id = m.space_id
  where m.space_id = p_space and m.user_id = auth.uid();
$$;

create or replace function public.space_members_team_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space uuid := case when tg_op = 'DELETE' then old.space_id else new.space_id end;
begin
  if public._team_sync_on() or pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.spaces s where s.id = v_space and (s.community_id is not null or s.team_id is not null)) then
    raise exception 'space_team_managed';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.space_invitations_team_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.spaces s where s.id = new.space_id and (s.community_id is not null or s.team_id is not null)) then
    raise exception 'space_team_managed';
  end if;
  return new;
end $$;

create or replace function public.spaces_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'space_invalid';
  end if;
  if (new.owner_id <> old.owner_id or new.community_id is distinct from old.community_id or new.team_id is distinct from old.team_id
      or new.team_creator_id is distinct from old.team_creator_id or new.team_access_mode is distinct from old.team_access_mode)
     and not public._team_sync_on() then
    raise exception 'space_invalid';
  end if;
  if (new.community_id is not null or new.team_id is not null) and new.visibility <> 'private' then
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
end $$;

-- Ekibin kütüphane Space'i silinemez (ekip silinince `teams_before_delete` önce bağını koparır).
create or replace function public.spaces_team_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.teams t where t.library_space_id = old.id) and not public._team_sync_on() then
    raise exception 'team_library_locked';
  end if;
  return old;
end $$;
drop trigger if exists spaces_team_before_delete on public.spaces;
create trigger spaces_team_before_delete before delete on public.spaces for each row execute function public.spaces_team_before_delete();

create or replace function public.spaces_team_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.team_id is not null then perform public._team_recount(old.team_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and new.team_id is not null then perform public._team_recount(new.team_id); end if;
  if tg_op = 'UPDATE' and new.team_id is not null and new.team_access_mode is distinct from old.team_access_mode then
    perform public._team_sync_space(new.id);
  end if;
  return null;
end $$;
drop trigger if exists spaces_team_counter on public.spaces;
create trigger spaces_team_counter after insert or update of team_id, archived_at, team_access_mode or delete on public.spaces for each row execute function public.spaces_team_counter();

-- Ekip silinince: Space'ler SİLİNMEZ; sahibinin kişisel Space'i olur, ekip üyelerinin erişimi kalkar.
create or replace function public.teams_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('promptly.team_deleting', '1', true);
  perform set_config('promptly.team_sync', '1', true);
  delete from public.space_members m using public.spaces s where s.team_id = old.id and m.space_id = s.id and m.role <> 'owner';
  delete from public.team_access where team_id = old.id;
  update public.spaces set team_id = null, team_creator_id = null, team_access_mode = 'all' where team_id = old.id;
  delete from public.team_audit where team_id = old.id;
  perform set_config('promptly.team_sync', '', true);
  return old;
end $$;
drop trigger if exists teams_before_delete on public.teams;
create trigger teams_before_delete before delete on public.teams for each row execute function public.teams_before_delete();

create or replace function public.teams_after_delete_reset()
returns trigger language plpgsql set search_path = public as $$
begin
  perform set_config('promptly.team_deleting', '', true);
  return null;
end $$;
drop trigger if exists teams_after_delete_reset on public.teams;
create trigger teams_after_delete_reset after delete on public.teams for each statement execute function public.teams_after_delete_reset();

-- ============================================================================
-- 6. RPC'ler
-- ============================================================================
create or replace function public.team_create(p_name text, p_description text default '', p_tone text default 'primary')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  v_id uuid := gen_random_uuid();
  v_space uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_create', 5, interval '1 hour');
  if p_name is null or char_length(btrim(p_name)) not between 2 and 60 then raise exception 'team_name_invalid'; end if;
  if char_length(coalesce(p_description, '')) > 500 or coalesce(p_tone, '') not in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky') then
    raise exception 'team_invalid';
  end if;
  if (select count(*) from public.team_members m where m.user_id = v_uid and m.role = 'owner') >= 10 then raise exception 'team_owner_limit'; end if;

  perform set_config('promptly.team_sync', '1', true);
  insert into public.teams (id, slug, name, description, tone, created_by)
  values (v_id, public._team_unique_slug(p_name), btrim(p_name), coalesce(btrim(p_description), ''), p_tone, v_uid);
  insert into public.team_members (team_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.spaces (owner_id, title, description, kind, visibility, team_id, team_creator_id, team_access_mode, updated_by)
  values (v_uid, 'Ekip kütüphanesi', '', 'team_library', 'private', v_id, v_uid, 'all', v_uid)
  returning id into v_space;
  update public.teams set library_space_id = v_space where id = v_id;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_recount(v_id);
  perform public._team_audit(v_id, 'team', 'team_created', btrim(p_name));
  return v_id;
end $$;

-- Politikalar + ekip bilgisi (beyaz listeli anahtarlar; her biri doğrulanır).
create or replace function public.team_update(p_team uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_team');
  v_key text;
  v_changed text[] := '{}';
  t public.teams;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'team_invalid'; end if;
  select * into t from public.teams where id = p_team for update;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'description', 'tone', 'require_approval', 'approvals_needed', 'hide_unapproved', 'content_owner', 'offboard_default',
                     'version_keep', 'default_member_role', 'invite_link_ttl_days', 'publish_external_role', 'guest_invite_role', 'export_role',
                     'mcp_enabled', 'mcp_audience') then
      raise exception 'team_invalid';
    end if;
    v_changed := v_changed || v_key;
  end loop;
  begin
    update public.teams set
      name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
      description = case when p_patch ? 'description' then btrim(coalesce(p_patch ->> 'description', '')) else description end,
      tone = case when p_patch ? 'tone' then p_patch ->> 'tone' else tone end,
      require_approval = case when p_patch ? 'require_approval' then (p_patch ->> 'require_approval')::boolean else require_approval end,
      approvals_needed = case when p_patch ? 'approvals_needed' then (p_patch ->> 'approvals_needed')::smallint else approvals_needed end,
      hide_unapproved = case when p_patch ? 'hide_unapproved' then (p_patch ->> 'hide_unapproved')::boolean else hide_unapproved end,
      content_owner = case when p_patch ? 'content_owner' then p_patch ->> 'content_owner' else content_owner end,
      offboard_default = case when p_patch ? 'offboard_default' then p_patch ->> 'offboard_default' else offboard_default end,
      version_keep = case when p_patch ? 'version_keep' then (p_patch ->> 'version_keep')::smallint else version_keep end,
      default_member_role = case when p_patch ? 'default_member_role' then p_patch ->> 'default_member_role' else default_member_role end,
      invite_link_ttl_days = case when p_patch ? 'invite_link_ttl_days' then (p_patch ->> 'invite_link_ttl_days')::smallint else invite_link_ttl_days end,
      publish_external_role = case when p_patch ? 'publish_external_role' then p_patch ->> 'publish_external_role' else publish_external_role end,
      guest_invite_role = case when p_patch ? 'guest_invite_role' then p_patch ->> 'guest_invite_role' else guest_invite_role end,
      export_role = case when p_patch ? 'export_role' then p_patch ->> 'export_role' else export_role end,
      mcp_enabled = case when p_patch ? 'mcp_enabled' then (p_patch ->> 'mcp_enabled')::boolean else mcp_enabled end,
      mcp_audience = case when p_patch ? 'mcp_audience' then p_patch ->> 'mcp_audience' else mcp_audience end,
      updated_at = now()
    where id = p_team;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'team_invalid';
  end;
  perform public._team_audit(p_team, 'policy', 'team_updated', t.name, jsonb_build_object('keys', to_jsonb(v_changed)));
end $$;

create or replace function public.my_teams(p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, slug text, name text, description text, tone text, my_role text, member_count integer, guest_count integer, space_count integer,
               channel_count integer, unread_count integer, last_activity_at timestamptz, library_space_id uuid, guest_until timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.slug, t.name, t.description, t.tone, m.role, t.member_count, t.guest_count, t.space_count, t.channel_count,
         0::integer,
         greatest(t.updated_at, coalesce((select max(s.updated_at) from public.spaces s
                    join public.space_members sm on sm.space_id = s.id and sm.user_id = auth.uid()
                   where s.team_id = t.id and s.archived_at is null), t.updated_at)),
         t.library_space_id, m.guest_until
    from public.team_members m
    join public.teams t on t.id = m.team_id
   where m.user_id = auth.uid() and (m.role <> 'guest' or m.guest_until > now())
   order by 12 desc, t.name
   limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
$$;

create or replace function public.team_create_space(
  p_team uuid, p_title text, p_description text default '', p_kind text default 'free', p_groups text[] default '{}', p_mode text default 'all')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'create_spaces');
  v_owner uuid;
  v_id uuid;
  v_name text;
  v_pos integer := 0;
begin
  perform public._assert_can_act(true);
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free')
     or char_length(coalesce(p_description, '')) > 500 or coalesce(cardinality(p_groups), 0) > 12
     or coalesce(p_mode, '') not in ('all', 'selected', 'admins') then
    raise exception 'space_invalid';
  end if;
  if (select count(*) from public.spaces s where s.team_id = p_team and s.archived_at is null) >= 50 then raise exception 'team_space_limit'; end if;
  select m.user_id into v_owner from public.team_members m where m.team_id = p_team and m.role = 'owner';
  perform set_config('promptly.team_sync', '1', true);
  insert into public.spaces (owner_id, title, description, kind, visibility, team_id, team_creator_id, team_access_mode, updated_by)
  values (v_owner, btrim(p_title), coalesce(p_description, ''), p_kind, 'private', p_team, v_uid, p_mode, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_sync_space(v_id);
  perform public._team_audit(p_team, 'access', 'space_created', btrim(p_title), jsonb_build_object('mode', p_mode));
  return v_id;
end $$;

-- Ekibin Space'leri (çağıranın okuyabildiği; `list_spaces` ile AYNI sütunlar + erişim modu).
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
   where s.team_id = p_team
   order by s.archived_at is not null, (s.id = (select t.library_space_id from public.teams t where t.id = p_team)) desc, s.updated_at desc, s.id
   limit greatest(1, least(coalesce(p_limit, 50), 60)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- Space erişimi okuma (modal): mod + girişler. Yetkili = ekip yöneticisi ya da Space'i açan.
create or replace function public.team_space_access(p_space uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.spaces;
begin
  select * into s from public.spaces where id = p_space;
  if not found or s.team_id is null or v_uid is null then raise exception 'space_not_found'; end if;
  if public._team_role(s.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if not (public._team_can(s.team_id, v_uid, 'manage_members') or s.team_creator_id = v_uid) then raise exception 'team_forbidden'; end if;
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

-- Erişimi tek işlemde değiştirir: mod + girişlerin tamamı.
create or replace function public.team_set_space_access(p_space uuid, p_mode text, p_entries jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.spaces;
  e jsonb;
  v_type text; v_id uuid; v_level text;
  v_old text;
begin
  select * into s from public.spaces where id = p_space for update;
  if not found or s.team_id is null or v_uid is null then raise exception 'space_not_found'; end if;
  if public._team_role(s.team_id, v_uid) is null then raise exception 'space_not_found'; end if;
  if not (public._team_can(s.team_id, v_uid, 'manage_members') or s.team_creator_id = v_uid) then raise exception 'team_forbidden'; end if;
  if coalesce(p_mode, '') not in ('all', 'selected', 'admins') or jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 100 then
    raise exception 'space_invalid';
  end if;
  if exists (select 1 from public.teams t where t.library_space_id = p_space) and p_mode <> 'all' then raise exception 'team_library_locked'; end if;
  if p_mode <> 'selected' and jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 0 then raise exception 'space_invalid'; end if;

  v_old := s.team_access_mode;
  perform set_config('promptly.team_sync', '1', true);
  delete from public.team_access where space_id = p_space;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_type := e ->> 'type'; v_level := e ->> 'level';
    begin v_id := (e ->> 'id')::uuid; exception when others then raise exception 'space_invalid'; end;
    if v_type not in ('member', 'group') or v_level not in ('edit', 'view') then raise exception 'space_invalid'; end if;
    if v_type = 'member' and not exists (select 1 from public.team_members m where m.team_id = s.team_id and m.user_id = v_id) then raise exception 'space_invalid'; end if;
    if v_type = 'group' and not exists (select 1 from public.team_groups g where g.id = v_id and g.team_id = s.team_id) then raise exception 'space_invalid'; end if;
    insert into public.team_access (team_id, space_id, subject_type, subject_id, level, created_by)
    values (s.team_id, p_space, v_type, v_id, v_level, v_uid) on conflict do nothing;
  end loop;
  update public.spaces set team_access_mode = p_mode where id = p_space;
  perform set_config('promptly.team_sync', '', true);
  perform public._team_sync_space(p_space);
  perform public._team_audit(s.team_id, 'access', 'access_changed', s.title,
    jsonb_build_object('from', v_old, 'to', p_mode, 'entries', jsonb_array_length(coalesce(p_entries, '[]'::jsonb))));
end $$;

-- ============================================================================
-- 7. RLS ve yetkiler (yazma YALNIZ RPC)
-- ============================================================================
drop policy if exists "Members read their teams" on public.teams;
create policy "Members read their teams" on public.teams for select to authenticated using (public.team_my_role(id) is not null);

drop policy if exists "Members read the member list" on public.team_members;
create policy "Members read the member list" on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) or public.team_my_role(team_id) in ('owner', 'admin', 'editor', 'member'));

drop policy if exists "Members read the groups" on public.team_groups;
create policy "Members read the groups" on public.team_groups for select to authenticated
  using (public.team_my_role(team_id) in ('owner', 'admin', 'editor', 'member'));

drop policy if exists "Members read group members" on public.team_group_members;
create policy "Members read group members" on public.team_group_members for select to authenticated
  using (exists (select 1 from public.team_groups g where g.id = group_id and public.team_my_role(g.team_id) in ('owner', 'admin', 'editor', 'member')));

drop policy if exists "Managers read access entries" on public.team_access;
create policy "Managers read access entries" on public.team_access for select to authenticated using (public.team_my_can(team_id, 'manage_members'));

drop policy if exists "Auditors read the audit log" on public.team_audit;
create policy "Auditors read the audit log" on public.team_audit for select to authenticated using (public.team_my_can(team_id, 'view_audit'));

revoke all on table public.teams, public.team_members, public.team_groups, public.team_group_members, public.team_access, public.team_audit from anon;
revoke insert, update, delete, truncate on table public.teams, public.team_members, public.team_groups, public.team_group_members, public.team_access, public.team_audit from authenticated;
grant select on table public.teams, public.team_members, public.team_groups, public.team_group_members, public.team_access, public.team_audit to authenticated;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public._team_rank(text)', 'public._team_all_capabilities()', 'public._team_role_caps(text)', 'public._team_role(uuid, uuid)',
    'public._team_can(uuid, uuid, text)', 'public._team_require(uuid, text)', 'public._team_audit(uuid, text, text, text, jsonb)',
    'public._team_recount(uuid)', 'public._team_slugify(text)', 'public._team_unique_slug(text)', 'public._team_space_level(uuid, uuid)',
    'public._team_sync_space_user(uuid, uuid)', 'public._team_sync_space(uuid)', 'public._team_sync_user_spaces(uuid, uuid)',
    'public.team_members_before_write()', 'public.team_members_after_change()', 'public.team_group_members_after_change()',
    'public.team_groups_before_delete()', 'public.team_access_after_change()', 'public.spaces_team_before_delete()', 'public.spaces_team_counter()',
    'public.teams_before_delete()', 'public.teams_after_delete_reset()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end $$;

revoke execute on function public.is_team_member(uuid) from public, anon;
revoke execute on function public.team_my_role(uuid) from public, anon;
revoke execute on function public.team_my_can(uuid, text) from public, anon;
revoke execute on function public.team_create(text, text, text) from public, anon;
revoke execute on function public.team_update(uuid, jsonb) from public, anon;
revoke execute on function public.my_teams(integer, integer) from public, anon;
revoke execute on function public.team_create_space(uuid, text, text, text, text[], text) from public, anon;
revoke execute on function public.team_list_spaces(uuid, integer, integer) from public, anon;
revoke execute on function public.team_space_access(uuid) from public, anon;
revoke execute on function public.team_set_space_access(uuid, text, jsonb) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.team_my_role(uuid) to authenticated;
grant execute on function public.team_my_can(uuid, text) to authenticated;
grant execute on function public.team_create(text, text, text) to authenticated;
grant execute on function public.team_update(uuid, jsonb) to authenticated;
grant execute on function public.my_teams(integer, integer) to authenticated;
grant execute on function public.team_create_space(uuid, text, text, text, text[], text) to authenticated;
grant execute on function public.team_list_spaces(uuid, integer, integer) to authenticated;
grant execute on function public.team_space_access(uuid) to authenticated;
grant execute on function public.team_set_space_access(uuid, text, jsonb) to authenticated;
