-- Ekipler, WP5 (docs/history/353-*): üyelik akışları — kullanıcı adıyla davet, davet bağlantısı, gruplar, konuklar, rol değişimi, çıkarma/devir, sahiplik devri, ekip silme.
--
-- Kural: üyelik satırlarına İSTEMCİ YAZAMAZ; her yazma SECURITY DEFINER RPC (kimlik auth.uid(), yetki YETENEKle, rütbe kuralı). Alan adıyla katılma YOKTUR.
-- Konuk: süreli (`guest_until`), yalnız seçilen Space/kanallara erişir; süre dolunca erişim ANINDA düşer (okuma yolları süreyi her çağrıda denetler, satırlar tembelce temizlenir).

-- ============================================================================
-- 1. Yardımcılar
-- ============================================================================
create or replace function public._notify_system(p_recipient uuid, p_actor uuid, p_message text, p_href text, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (p_recipient, p_actor, 'system', p_message, p_href, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- Süresi dolan konuğun Space satırı, tembel temizlik gelene kadar da erişim vermez.
create or replace function public._space_member_expired(p_space uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.spaces s join public.team_members tm on tm.team_id = s.team_id and tm.user_id = p_user
                  where s.id = p_space and tm.role = 'guest' and tm.guest_until <= now())
$$;
grant execute on function public._space_member_expired(uuid, uuid) to anon, authenticated;

create or replace function public.can_read_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.spaces s
     where s.id = p_space
       and (
         (exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = auth.uid()) and not public._space_member_expired(s.id, auth.uid()))
         or (
           s.archived_at is null
           and (auth.uid() is null or not public.is_blocked(s.owner_id, auth.uid()))
           and (
             s.visibility = 'public'
             or (
               s.visibility = 'link' and auth.uid() is not null
               and exists (
                 select 1 from public.space_link_grants g
                   join public.space_share_links l on l.id = g.link_id
                  where g.space_id = s.id and g.user_id = auth.uid() and l.revoked_at is null
               )
             )
           )
         )
       )
  );
$$;

create or replace function public.can_edit_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.spaces s
      join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
     where s.id = p_space and s.archived_at is null and m.role in ('owner', 'editor') and not public._space_member_expired(s.id, auth.uid())
  );
$$;

create or replace function public.space_role(p_space uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public._space_member_expired(s.id, auth.uid()) then null
    when m.role = 'owner' then 'owner'
    when s.team_id is not null and (public._team_role(s.team_id, auth.uid()) in ('owner', 'admin') or s.team_creator_id = auth.uid()) then 'owner'
    when s.community_id is not null and public._group_can(s.community_id, auth.uid(), 'create_spaces') then 'owner'
    else m.role
  end
  from public.space_members m
  join public.spaces s on s.id = m.space_id
  where m.space_id = p_space and m.user_id = auth.uid();
$$;

-- ============================================================================
-- 2. Davet tabloları
-- ============================================================================
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  role text not null check (role in ('admin', 'editor', 'member', 'guest')),
  guest_org text check (guest_org is null or char_length(guest_org) <= 60),
  guest_days smallint check (guest_days is null or guest_days between 1 and 90),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint team_invitations_guest_shape check ((role = 'guest') = (guest_days is not null))
);
create unique index if not exists team_invitations_pending_uniq on public.team_invitations (team_id, invitee_id) where status = 'pending';
create index if not exists team_invitations_invitee_idx on public.team_invitations (invitee_id) where status = 'pending';
alter table public.team_invitations enable row level security;
drop policy if exists "Invitee and managers read invitations" on public.team_invitations;
create policy "Invitee and managers read invitations" on public.team_invitations for select to authenticated
  using (invitee_id = (select auth.uid()) or public.team_my_can(team_id, 'manage_members'));

create table if not exists public.team_invite_links (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  role text not null default 'member' check (role in ('editor', 'member')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses integer check (max_uses is null or max_uses between 1 and 10000),
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists team_invite_links_team_idx on public.team_invite_links (team_id);
alter table public.team_invite_links enable row level security;
drop policy if exists "Managers read invite links" on public.team_invite_links;
create policy "Managers read invite links" on public.team_invite_links for select to authenticated using (public.team_my_can(team_id, 'manage_members'));

revoke all on public.team_invitations, public.team_invite_links from anon;
revoke insert, update, delete on public.team_invitations, public.team_invite_links from authenticated;
revoke select on public.team_invite_links from authenticated;
grant select on public.team_invitations to authenticated;
grant select (id, team_id, created_by, role, expires_at, revoked_at, max_uses, use_count, created_at) on public.team_invite_links to authenticated;

-- ============================================================================
-- 3. Davet: kullanıcı adıyla
-- ============================================================================
create or replace function public.team_invite_user(p_team uuid, p_username text, p_role text default 'member', p_guest_days integer default null, p_guest_org text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  v_actor_role text;
  v_target uuid;
  v_id uuid;
  v_team_name text;
begin
  if coalesce(p_role, '') not in ('admin', 'editor', 'member', 'guest') then raise exception 'team_invalid'; end if;
  if p_role = 'guest' then
    perform public._team_require(p_team, 'invite_guests');
    if p_guest_days is null or p_guest_days not between 1 and 90 or char_length(coalesce(p_guest_org, '')) > 60 then raise exception 'team_invalid'; end if;
  else
    perform public._team_require(p_team, 'manage_members');
    if p_guest_days is not null then raise exception 'team_invalid'; end if;
  end if;
  v_actor_role := public._team_role(p_team, v_uid);
  if p_role <> 'guest' and public._team_rank(v_actor_role) <= public._team_rank(p_role) then raise exception 'team_forbidden'; end if;
  perform public._rate_limit('team_invite', 60, interval '1 hour');
  select p.id into v_target from public.profiles p where lower(p.username) = lower(btrim(coalesce(p_username, '')));
  if v_target is null then raise exception 'user_not_found'; end if;
  if v_target = v_uid then raise exception 'team_invalid'; end if;
  if exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = v_target) then raise exception 'already_member'; end if;
  if public.is_blocked(v_uid, v_target) then raise exception 'invite_blocked'; end if;
  select i.id into v_id from public.team_invitations i where i.team_id = p_team and i.invitee_id = v_target and i.status = 'pending';
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.team_invitations i where i.team_id = p_team and i.status = 'pending') >= 200 then raise exception 'team_invitation_limit'; end if;
  insert into public.team_invitations (team_id, invitee_id, invited_by, role, guest_org, guest_days)
  values (p_team, v_target, v_uid, p_role, nullif(btrim(coalesce(p_guest_org, '')), ''), p_guest_days) returning id into v_id;
  select name into v_team_name from public.teams where id = p_team;
  perform public._notify_system(v_target, v_uid, '"' || public.truncate_preview(v_team_name, 60) || '" ekibine davet etti.', '/teams', 'teaminvite:' || v_id);
  perform public._team_audit(p_team, 'invite', 'member_invited', (select username from public.profiles where id = v_target), jsonb_build_object('role', p_role));
  return v_id;
end $$;

create or replace function public.team_respond_invitation(p_invitation uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  i public.team_invitations;
  t public.teams;
begin
  select * into i from public.team_invitations where id = p_invitation for update;
  if not found or i.invitee_id <> v_uid or i.status <> 'pending' then raise exception 'invitation_not_found'; end if;
  select * into t from public.teams where id = i.team_id;
  if i.created_at < now() - interval '14 days' then
    update public.team_invitations set status = 'cancelled', responded_at = now() where id = i.id;
    raise exception 'invitation_expired';
  end if;
  if not p_accept then
    update public.team_invitations set status = 'declined', responded_at = now() where id = i.id;
    return jsonb_build_object('status', 'declined');
  end if;
  insert into public.team_members (team_id, user_id, role, guest_org, guest_until, invited_by)
  values (i.team_id, v_uid, i.role, i.guest_org, case when i.role = 'guest' then now() + make_interval(days => i.guest_days) end, i.invited_by);
  update public.team_invitations set status = 'accepted', responded_at = now() where id = i.id;
  perform public._team_audit(i.team_id, 'member', 'member_joined', (select username from public.profiles where id = v_uid), jsonb_build_object('via', 'invitation', 'role', i.role));
  perform public._team_notify(i.invited_by, v_uid, i.team_id, 'direct', 'ekip davetini kabul etti.', '/teams/local?id=' || i.team_id || '&tab=members', 'teaminvite-ok:' || i.id);
  return jsonb_build_object('status', 'accepted', 'team_id', i.team_id, 'slug', t.slug);
end $$;

create or replace function public.team_cancel_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.team_invitations;
begin
  select * into i from public.team_invitations where id = p_invitation;
  if not found then raise exception 'invitation_not_found'; end if;
  perform public._team_require(i.team_id, case when i.role = 'guest' then 'invite_guests' else 'manage_members' end);
  update public.team_invitations set status = 'cancelled', responded_at = now() where id = p_invitation and status = 'pending';
end $$;

create or replace function public.my_team_invitations()
returns table (id uuid, team_id uuid, team_name text, team_tone text, role text, guest_days integer, guest_org text, invited_by uuid, inviter_username text, inviter_name text,
               inviter_avatar_url text, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.team_id, t.name, t.tone, i.role, i.guest_days::integer, i.guest_org, i.invited_by, p.username, coalesce(nullif(p.display_name, ''), p.username), p.avatar_url,
         i.created_at, i.created_at + interval '14 days'
    from public.team_invitations i
    join public.teams t on t.id = i.team_id
    left join public.profiles p on p.id = i.invited_by
   where i.invitee_id = auth.uid() and i.status = 'pending' and i.created_at >= now() - interval '14 days'
   order by i.created_at desc
   limit 50
$$;

create or replace function public.team_list_invitations(p_team uuid)
returns table (id uuid, invitee_id uuid, invitee_username text, invitee_name text, invitee_avatar_url text, role text, guest_days integer, guest_org text,
               invited_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'manage_members');
  return query
  select i.id, i.invitee_id, p.username, coalesce(nullif(p.display_name, ''), p.username), p.avatar_url, i.role, i.guest_days::integer, i.guest_org,
         (select coalesce(nullif(x.display_name, ''), x.username) from public.profiles x where x.id = i.invited_by), i.created_at
    from public.team_invitations i join public.profiles p on p.id = i.invitee_id
   where i.team_id = p_team and i.status = 'pending'
   order by i.created_at desc limit 200;
end $$;

-- ============================================================================
-- 4. Davet bağlantısı (ham token yalnız oluşturma yanıtında bir kez döner; saklanan: SHA-256 özeti)
-- ============================================================================
create or replace function public.team_create_invite_link(p_team uuid, p_role text default 'member', p_max_uses integer default null, p_ttl_days integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  t public.teams;
  v_token text;
  v_ttl integer;
  l public.team_invite_links;
begin
  perform public._team_require(p_team, 'manage_members');
  select * into t from public.teams where id = p_team;
  if coalesce(p_role, '') not in ('editor', 'member') or public._team_rank(public._team_role(p_team, v_uid)) <= public._team_rank(p_role) then raise exception 'team_forbidden'; end if;
  v_ttl := coalesce(p_ttl_days, t.invite_link_ttl_days);
  if v_ttl not between 1 and 30 or (p_max_uses is not null and p_max_uses not between 1 and 10000) then raise exception 'team_invalid'; end if;
  if (select count(*) from public.team_invite_links x where x.team_id = p_team and x.revoked_at is null and x.expires_at > now()) >= 10 then raise exception 'link_limit_reached'; end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.team_invite_links (team_id, token_hash, created_by, role, expires_at, max_uses)
  values (p_team, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid, p_role, now() + make_interval(days => v_ttl), p_max_uses) returning * into l;
  perform public._team_audit(p_team, 'invite', 'invite_link_created', t.name, jsonb_build_object('role', p_role));
  return jsonb_build_object('link_id', l.id, 'token', v_token, 'expires_at', l.expires_at, 'max_uses', l.max_uses, 'role', l.role);
end $$;

create or replace function public.team_revoke_invite_link(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.team_invite_links;
begin
  select * into l from public.team_invite_links where id = p_link;
  if not found then raise exception 'link_not_found'; end if;
  perform public._team_require(l.team_id, 'manage_members');
  update public.team_invite_links set revoked_at = coalesce(revoked_at, now()) where id = p_link;
  perform public._team_audit(l.team_id, 'invite', 'invite_link_revoked', null);
end $$;

create or replace function public.team_list_invite_links(p_team uuid)
returns table (id uuid, role text, created_by uuid, created_by_name text, expires_at timestamptz, revoked_at timestamptz, max_uses integer, use_count integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'manage_members');
  return query
  select l.id, l.role, l.created_by, (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = l.created_by), l.expires_at, l.revoked_at, l.max_uses, l.use_count, l.created_at
    from public.team_invite_links l where l.team_id = p_team order by l.created_at desc limit 50;
end $$;

create or replace function public.preview_team_link(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.team_invite_links; t public.teams;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from public.team_invite_links where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then raise exception 'link_not_found'; end if;
  select * into t from public.teams where id = l.team_id;
  return jsonb_build_object('team_name', t.name, 'tone', t.tone, 'member_count', t.member_count, 'role', l.role,
    'already_member', exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = auth.uid()),
    'valid', l.revoked_at is null and l.expires_at > now() and (l.max_uses is null or l.use_count < l.max_uses),
    'expires_at', l.expires_at);
end $$;

create or replace function public.join_team_via_link(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  l public.team_invite_links;
  t public.teams;
  v_owner uuid;
begin
  perform public._rate_limit('team_join_link', 10, interval '1 hour');
  select * into l from public.team_invite_links where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found then raise exception 'link_not_found'; end if;
  if l.revoked_at is not null or l.expires_at <= now() or (l.max_uses is not null and l.use_count >= l.max_uses) then raise exception 'link_unavailable'; end if;
  select * into t from public.teams where id = l.team_id;
  if exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = v_uid) then raise exception 'already_member'; end if;
  select m.user_id into v_owner from public.team_members m where m.team_id = t.id and m.role = 'owner';
  if public.is_blocked(v_uid, v_owner) or (l.created_by is not null and public.is_blocked(v_uid, l.created_by)) then raise exception 'link_unavailable'; end if;
  insert into public.team_members (team_id, user_id, role, invited_by) values (t.id, v_uid, l.role, l.created_by);
  update public.team_invite_links set use_count = use_count + 1 where id = l.id;
  update public.team_invitations set status = 'cancelled', responded_at = now() where team_id = t.id and invitee_id = v_uid and status = 'pending';
  perform public._team_audit(t.id, 'member', 'member_joined', (select username from public.profiles where id = v_uid), jsonb_build_object('via', 'link', 'role', l.role));
  perform public._team_notify(l.created_by, v_uid, t.id, 'direct', 'davet bağlantınla ekibe katıldı.', '/teams/local?id=' || t.id || '&tab=members', 'teamlink-join:' || l.id || ':' || v_uid);
  return jsonb_build_object('team_id', t.id, 'slug', t.slug);
end $$;

-- ============================================================================
-- 5. Üyeler: liste, rol, çıkarma/devir, ayrılma, sahiplik, silme
-- ============================================================================
create or replace function public.team_list_members(p_team uuid, p_search text default null, p_role text default null, p_limit integer default 100, p_offset integer default 0)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, joined_at timestamptz, guest_org text, guest_until timestamptz,
               group_ids uuid[], group_names text[])
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public._team_role(p_team, auth.uid());
begin
  if v_role is null or v_role = 'guest' then raise exception 'team_not_found'; end if;
  return query
  select m.user_id, p.username, p.display_name, p.avatar_url, m.role, m.joined_at, m.guest_org, m.guest_until,
         coalesce((select array_agg(g.id order by g.name) from public.team_group_members gm join public.team_groups g on g.id = gm.group_id where g.team_id = p_team and gm.user_id = m.user_id), '{}'),
         coalesce((select array_agg(g.name order by g.name) from public.team_group_members gm join public.team_groups g on g.id = gm.group_id where g.team_id = p_team and gm.user_id = m.user_id), '{}')
    from public.team_members m join public.profiles p on p.id = m.user_id
   where m.team_id = p_team
     and (p_role is null or p_role = 'all' or m.role = p_role)
     and (nullif(btrim(coalesce(p_search, '')), '') is null
          or p.username ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%' or p.display_name ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%')
   order by public._team_rank(m.role) desc, p.display_name
   limit greatest(1, least(coalesce(p_limit, 100), 200)) offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.team_set_member_role(p_team uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_members');
  v_actor_role text := public._team_role(p_team, v_uid);
  v_cur text;
  v_name text;
begin
  if coalesce(p_role, '') not in ('admin', 'editor', 'member') then raise exception 'team_invalid'; end if;
  select role into v_cur from public.team_members where team_id = p_team and user_id = p_user;
  if v_cur is null then raise exception 'member_not_found'; end if;
  if v_cur = 'owner' or p_user = v_uid then raise exception 'team_forbidden'; end if;
  if public._team_rank(v_actor_role) <= public._team_rank(v_cur) or public._team_rank(v_actor_role) <= public._team_rank(p_role) then raise exception 'team_forbidden'; end if;
  if v_cur = p_role then return; end if;
  update public.team_members set role = p_role, guest_until = null, guest_org = null where team_id = p_team and user_id = p_user;
  select username into v_name from public.profiles where id = p_user;
  perform public._team_audit(p_team, 'role', 'role_changed', v_name, jsonb_build_object('from', v_cur, 'to', p_role));
  perform public._team_notify(p_user, v_uid, p_team, 'direct', 'ekipteki rolünü değiştirdi.', '/teams/local?id=' || p_team || '&tab=members', 'teamrole:' || p_team || ':' || p_user || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

create or replace function public.team_member_content_summary(p_team uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'manage_members');
  return jsonb_build_object(
    'prompts', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and i.kind = 'prompt' and i.is_draft),
    'items', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and not (i.kind = 'prompt' and i.is_draft)),
    'variables', (select count(*) from public.space_variables v join public.spaces s on s.id = v.space_id where s.team_id = p_team and (v.created_by = p_user or v.updated_by = p_user)),
    'personal', (select count(*) from public.prompts p where p.author_id = p_user and p.community_id is null and p.visibility = 'private'));
end $$;

-- Ortak çıkarma yolu (yönetici çıkarması ve gönüllü ayrılma): içerik ekipte KALIR; mod 'member' ise yazarlığı seçilen üyeye geçer.
create or replace function public._team_offboard(p_team uuid, p_user uuid, p_mode text, p_new_owner uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sum jsonb;
begin
  v_sum := jsonb_build_object(
    'prompts', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and i.kind = 'prompt' and i.is_draft),
    'items', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and not (i.kind = 'prompt' and i.is_draft)),
    'variables', (select count(*) from public.space_variables v join public.spaces s on s.id = v.space_id where s.team_id = p_team and (v.created_by = p_user or v.updated_by = p_user)));
  perform set_config('promptly.team_sync', '1', true);
  if p_mode = 'member' and p_new_owner is not null then
    update public.space_items i set created_by = case when i.created_by = p_user then p_new_owner else i.created_by end,
                                    updated_by = case when i.updated_by = p_user then p_new_owner else i.updated_by end
      from public.spaces s where s.id = i.space_id and s.team_id = p_team and (i.created_by = p_user or i.updated_by = p_user);
    update public.space_variables v set created_by = case when v.created_by = p_user then p_new_owner else v.created_by end,
                                        updated_by = case when v.updated_by = p_user then p_new_owner else v.updated_by end
      from public.spaces s where s.id = v.space_id and s.team_id = p_team and (v.created_by = p_user or v.updated_by = p_user);
    update public.spaces set team_creator_id = p_new_owner where team_id = p_team and team_creator_id = p_user;
  end if;
  update public.team_groups set lead_id = null where team_id = p_team and lead_id = p_user;
  update public.space_items i set review_requested_at = null, review_requested_by = null from public.spaces s
   where s.id = i.space_id and s.team_id = p_team and i.review_requested_by = p_user and i.approved_at is null;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  perform set_config('promptly.team_sync', '', true);
  return v_sum;
end $$;

create or replace function public.team_remove_member(p_team uuid, p_user uuid, p_mode text default 'team', p_new_owner uuid default null, p_notify boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_members');
  v_cur text;
  v_sum jsonb;
  v_name text;
  t public.teams;
begin
  if coalesce(p_mode, '') not in ('team', 'member', 'personal') then raise exception 'team_invalid'; end if;
  select role into v_cur from public.team_members where team_id = p_team and user_id = p_user;
  if v_cur is null then raise exception 'member_not_found'; end if;
  if v_cur = 'owner' or p_user = v_uid then raise exception 'team_forbidden'; end if;
  if public._team_rank(public._team_role(p_team, v_uid)) <= public._team_rank(v_cur) then raise exception 'team_forbidden'; end if;
  if p_mode = 'member' and (p_new_owner is null or p_new_owner = p_user or coalesce(public._team_role(p_team, p_new_owner), '') not in ('owner', 'admin', 'editor', 'member')) then raise exception 'team_invalid'; end if;
  select * into t from public.teams where id = p_team;
  select username into v_name from public.profiles where id = p_user;
  v_sum := public._team_offboard(p_team, p_user, p_mode, p_new_owner);
  perform public._team_audit(p_team, 'member', 'member_removed', v_name, v_sum || jsonb_build_object('mode', p_mode, 'new_owner', p_new_owner));
  if coalesce(p_notify, true) then
    perform public._notify_system(p_user, v_uid, '"' || public.truncate_preview(t.name, 60) || '" ekibinden çıkarıldın.', '/teams', 'teamremoved:' || p_team || ':' || p_user || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;
  return v_sum;
end $$;

create or replace function public.team_leave(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  v_role text := public._team_role(p_team, v_uid);
  t public.teams;
  v_owner uuid;
  v_mode text;
begin
  if v_role is null then raise exception 'team_not_found'; end if;
  if v_role = 'owner' then raise exception 'owner_must_transfer'; end if;
  select * into t from public.teams where id = p_team;
  select m.user_id into v_owner from public.team_members m where m.team_id = p_team and m.role = 'owner';
  v_mode := case when t.offboard_default = 'admin' then 'member' else 'team' end;
  perform public._team_offboard(p_team, v_uid, v_mode, v_owner);
  perform public._team_audit(p_team, 'member', 'member_left', (select username from public.profiles where id = v_uid), jsonb_build_object('mode', v_mode));
end $$;

-- Sahipliği devret: eski sahip yönetici olur; ekip Space'lerinin sahibi de yeni sahip olur (349'daki kural).
create or replace function public._team_reown(p_team uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform set_config('promptly.team_sync', '1', true);
  update public.team_members set role = 'admin' where team_id = p_team and role = 'owner' and user_id <> p_new_owner;
  update public.team_members set role = 'owner', guest_until = null, guest_org = null where team_id = p_team and user_id = p_new_owner;
  for r in select s.id, s.owner_id from public.spaces s where s.team_id = p_team and s.owner_id <> p_new_owner loop
    update public.space_members set role = 'editor' where space_id = r.id and user_id = r.owner_id and role = 'owner';
    update public.spaces set owner_id = p_new_owner where id = r.id;
    insert into public.space_members (space_id, user_id, role, added_by) values (r.id, p_new_owner, 'owner', p_new_owner)
    on conflict (space_id, user_id) do update set role = 'owner';
  end loop;
  perform set_config('promptly.team_sync', '', true);
end $$;

create or replace function public.team_transfer_ownership(p_team uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  v_name text;
begin
  if public._team_role(p_team, v_uid) is distinct from 'owner' then raise exception 'team_forbidden'; end if;
  if p_new_owner is null or p_new_owner = v_uid or coalesce(public._team_role(p_team, p_new_owner), '') not in ('admin', 'editor', 'member') then raise exception 'team_invalid'; end if;
  if (select count(*) from public.team_members m where m.user_id = p_new_owner and m.role = 'owner') >= 10 then raise exception 'team_owner_limit'; end if;
  perform public._team_reown(p_team, p_new_owner);
  select username into v_name from public.profiles where id = p_new_owner;
  perform public._team_audit(p_team, 'role', 'ownership_transferred', v_name);
  perform public._team_notify(p_new_owner, v_uid, p_team, 'direct', 'ekibin sahipliğini sana devretti.', '/teams/local?id=' || p_team, 'teamowner:' || p_team || ':' || p_new_owner || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- Ekibi sil (yalnız sahip): ad onayı gerekir; varsayılan olarak Space'ler sahibinin kişisel Space'i olarak kalır.
create or replace function public.team_delete(p_team uuid, p_confirm text, p_delete_spaces boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  t public.teams;
  u record;
begin
  select * into t from public.teams where id = p_team;
  if not found or public._team_role(p_team, v_uid) is distinct from 'owner' then raise exception 'team_forbidden'; end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(t.name) then raise exception 'team_confirm_mismatch'; end if;
  for u in select m.user_id from public.team_members m where m.team_id = p_team and m.user_id <> v_uid and m.role <> 'guest' loop
    perform public._notify_system(u.user_id, v_uid, '"' || public.truncate_preview(t.name, 60) || '" ekibi silindi.', '/teams', 'teamdeleted:' || p_team || ':' || u.user_id);
  end loop;
  if coalesce(p_delete_spaces, false) then
    perform set_config('promptly.team_sync', '1', true);
    delete from public.spaces where team_id = p_team;
    perform set_config('promptly.team_sync', '', true);
  end if;
  delete from public.teams where id = p_team;
end $$;

-- Hesap silinirken: sahibi olduğu ekip başka üyeye devredilir (en eski yönetici → düzenleyici → üye); kimse yoksa ekip silinir.
create or replace function public._team_exit_owner(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_next uuid;
begin
  for r in select m.team_id from public.team_members m where m.user_id = p_user and m.role = 'owner' loop
    select m.user_id into v_next from public.team_members m
     where m.team_id = r.team_id and m.user_id <> p_user and m.role in ('admin', 'editor', 'member')
     order by public._team_rank(m.role) desc, m.joined_at, m.user_id limit 1;
    if v_next is null then
      delete from public.teams where id = r.team_id;
    else
      perform public._team_reown(r.team_id, v_next);
    end if;
  end loop;
end $$;

create or replace function public.profiles_team_owner_exit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._team_exit_owner(old.id);
  return old;
end $$;
drop trigger if exists profiles_team_owner_exit on public.profiles;
create trigger profiles_team_owner_exit before delete on public.profiles for each row execute function public.profiles_team_owner_exit();

-- ============================================================================
-- 6. Gruplar
-- ============================================================================
create or replace function public.team_create_group(p_team uuid, p_name text, p_tone text default 'primary', p_lead uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_groups');
  v_id uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 or coalesce(p_tone, '') not in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky') then raise exception 'group_invalid'; end if;
  if (select count(*) from public.team_groups g where g.team_id = p_team) >= 50 then raise exception 'team_group_limit'; end if;
  if exists (select 1 from public.team_groups g where g.team_id = p_team and lower(btrim(g.name)) = lower(btrim(p_name))) then raise exception 'group_name_taken'; end if;
  if p_lead is not null and coalesce(public._team_role(p_team, p_lead), '') not in ('owner', 'admin', 'editor', 'member') then raise exception 'group_invalid'; end if;
  insert into public.team_groups (team_id, name, tone, lead_id, created_by) values (p_team, btrim(p_name), p_tone, p_lead, v_uid) returning id into v_id;
  if p_lead is not null then insert into public.team_group_members (group_id, user_id) values (v_id, p_lead) on conflict do nothing; end if;
  perform public._team_audit(p_team, 'group', 'group_created', btrim(p_name));
  return v_id;
end $$;

create or replace function public.team_update_group(p_group uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.team_groups;
  v_key text;
  v_lead uuid;
begin
  select * into g from public.team_groups where id = p_group;
  if not found then raise exception 'group_not_found'; end if;
  perform public._team_require(g.team_id, 'manage_groups');
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'group_invalid'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'tone', 'lead_id', 'leads_approve') then raise exception 'group_invalid'; end if;
  end loop;
  if p_patch ? 'lead_id' then
    v_lead := nullif(p_patch ->> 'lead_id', '')::uuid;
    if v_lead is not null and coalesce(public._team_role(g.team_id, v_lead), '') not in ('owner', 'admin', 'editor', 'member') then raise exception 'group_invalid'; end if;
  else
    v_lead := g.lead_id;
  end if;
  if p_patch ? 'name' and exists (select 1 from public.team_groups x where x.team_id = g.team_id and x.id <> g.id and lower(btrim(x.name)) = lower(btrim(p_patch ->> 'name'))) then raise exception 'group_name_taken'; end if;
  begin
    update public.team_groups set
      name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
      tone = coalesce(p_patch ->> 'tone', tone),
      lead_id = v_lead,
      leads_approve = case when p_patch ? 'leads_approve' then (p_patch ->> 'leads_approve')::boolean else leads_approve end
    where id = p_group;
  exception when check_violation or invalid_text_representation then raise exception 'group_invalid';
  end;
  if v_lead is not null then insert into public.team_group_members (group_id, user_id) values (p_group, v_lead) on conflict do nothing; end if;
  perform public._team_audit(g.team_id, 'group', 'group_updated', g.name);
end $$;

create or replace function public.team_delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g public.team_groups;
begin
  select * into g from public.team_groups where id = p_group;
  if not found then raise exception 'group_not_found'; end if;
  perform public._team_require(g.team_id, 'manage_groups');
  perform public._team_audit(g.team_id, 'group', 'group_deleted', g.name);
  delete from public.team_groups where id = p_group;
end $$;

-- Grup üyelerini tek işlemde belirle (en çok 500). Lider her zaman üye kalır.
create or replace function public.team_set_group_members(p_group uuid, p_users uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare g public.team_groups; u uuid; v_new uuid[];
begin
  select * into g from public.team_groups where id = p_group;
  if not found then raise exception 'group_not_found'; end if;
  perform public._team_require(g.team_id, 'manage_groups');
  v_new := coalesce(p_users, '{}'::uuid[]);
  if g.lead_id is not null then v_new := v_new || g.lead_id; end if;
  if cardinality(v_new) > 500 then raise exception 'group_invalid'; end if;
  foreach u in array v_new loop
    if coalesce(public._team_role(g.team_id, u), '') not in ('owner', 'admin', 'editor', 'member') then raise exception 'group_invalid'; end if;
  end loop;
  delete from public.team_group_members where group_id = p_group and not (user_id = any (v_new));
  insert into public.team_group_members (group_id, user_id) select distinct p_group, x from unnest(v_new) x on conflict do nothing;
  perform public._team_audit(g.team_id, 'group', 'group_members_changed', g.name, jsonb_build_object('count', cardinality(v_new)));
end $$;

-- Gruplar sayfası: grup + üye sayısı + Space erişimi özeti (grubun girişi olan Space'ler).
create or replace function public.team_list_groups(p_team uuid)
returns table (id uuid, name text, tone text, lead_id uuid, lead_name text, leads_approve boolean, member_count integer, member_ids uuid[], spaces jsonb, folders jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public._team_role(p_team, auth.uid());
begin
  if v_role is null or v_role = 'guest' then raise exception 'team_not_found'; end if;
  return query
  select g.id, g.name, g.tone, g.lead_id, (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = g.lead_id), g.leads_approve,
         (select count(*)::integer from public.team_group_members gm where gm.group_id = g.id),
         coalesce((select array_agg(gm.user_id) from public.team_group_members gm where gm.group_id = g.id), '{}'),
         case when public._team_can(p_team, auth.uid(), 'manage_groups') then
           coalesce((select jsonb_agg(jsonb_build_object('space_id', s.id, 'title', s.title, 'level', a.level) order by s.title)
                       from public.team_access a join public.spaces s on s.id = a.space_id where a.subject_type = 'group' and a.subject_id = g.id), '[]'::jsonb)
         else '[]'::jsonb end,
         coalesce((select jsonb_agg(jsonb_build_object('space_group_id', sg.id, 'name', sg.name, 'prompts', (select count(*) from public.space_items i where i.group_id = sg.id and i.kind = 'prompt' and i.is_draft)) order by sg.name)
                     from public.space_groups sg where sg.team_group_id = g.id), '[]'::jsonb)
    from public.team_groups g where g.team_id = p_team order by g.name;
end $$;

-- ============================================================================
-- 7. Konuklar
-- ============================================================================
create or replace function public.team_list_guests(p_team uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, guest_org text, guest_until timestamptz, joined_at timestamptz, expired boolean, spaces jsonb, channels jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'invite_guests');
  return query
  select m.user_id, p.username, p.display_name, p.avatar_url, m.guest_org, m.guest_until, m.joined_at, m.guest_until <= now(),
         coalesce((select jsonb_agg(jsonb_build_object('space_id', s.id, 'title', s.title, 'role', sm.role) order by s.title)
                     from public.space_members sm join public.spaces s on s.id = sm.space_id where s.team_id = p_team and sm.user_id = m.user_id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('channel_id', tc.id, 'name', tc.name) order by tc.name)
                     from public.conversation_members cm join public.team_channels tc on tc.id = cm.conversation_id where tc.team_id = p_team and cm.user_id = m.user_id), '[]'::jsonb)
    from public.team_members m join public.profiles p on p.id = m.user_id
   where m.team_id = p_team and m.role = 'guest'
   order by m.guest_until;
end $$;

create or replace function public.team_extend_guest(p_team uuid, p_user uuid, p_days integer)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'invite_guests');
  v_until timestamptz;
begin
  if p_days is null or p_days not between 1 and 90 then raise exception 'team_invalid'; end if;
  update public.team_members set guest_until = greatest(guest_until, now()) + make_interval(days => p_days)
   where team_id = p_team and user_id = p_user and role = 'guest' returning guest_until into v_until;
  if v_until is null then raise exception 'member_not_found'; end if;
  perform public._team_audit(p_team, 'guest', 'guest_extended', (select username from public.profiles where id = p_user), jsonb_build_object('days', p_days));
  perform public._team_notify(p_user, v_uid, p_team, 'direct', 'ekip erişim süreni uzattı.', '/teams', 'teamguest:' || p_team || ':' || p_user || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  return v_until;
end $$;

-- Tembel temizlik: 7 günden uzun süredir dolmuş konuk satırlarını siler (erişim süre dolunca zaten düşmüştür).
create or replace function public.team_prune_expired_guests(p_team uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform public._team_require(p_team, 'invite_guests');
  delete from public.team_members where team_id = p_team and role = 'guest' and guest_until < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ============================================================================
-- 8. Yetkiler
-- ============================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._notify_system(uuid, uuid, text, text, text)', 'public._team_offboard(uuid, uuid, text, uuid)', 'public._team_reown(uuid, uuid)',
    'public._team_exit_owner(uuid)', 'public.profiles_team_owner_exit()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.team_invite_user(uuid, text, text, integer, text)', 'public.team_respond_invitation(uuid, boolean)', 'public.team_cancel_invitation(uuid)',
    'public.my_team_invitations()', 'public.team_list_invitations(uuid)', 'public.team_create_invite_link(uuid, text, integer, integer)',
    'public.team_revoke_invite_link(uuid)', 'public.team_list_invite_links(uuid)', 'public.preview_team_link(text)', 'public.join_team_via_link(text)',
    'public.team_list_members(uuid, text, text, integer, integer)', 'public.team_set_member_role(uuid, uuid, text)', 'public.team_member_content_summary(uuid, uuid)',
    'public.team_remove_member(uuid, uuid, text, uuid, boolean)', 'public.team_leave(uuid)', 'public.team_transfer_ownership(uuid, uuid)',
    'public.team_delete(uuid, text, boolean)', 'public.team_create_group(uuid, text, text, uuid)', 'public.team_update_group(uuid, jsonb)',
    'public.team_delete_group(uuid)', 'public.team_set_group_members(uuid, uuid[])', 'public.team_list_groups(uuid)', 'public.team_list_guests(uuid)',
    'public.team_extend_guest(uuid, uuid, integer)', 'public.team_prune_expired_guests(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
