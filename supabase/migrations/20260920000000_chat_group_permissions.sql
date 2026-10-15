-- Grup yetkileri ve geçmiş görünürlüğü (docs/history/173-*). Yalnızca ekleyici: yeni sütunlar/fonksiyon + aynı imzalı
-- `create or replace` + yerinde `alter policy`; hiçbir şey düşürülmez.
--
--   * `chat_groups.history_visible` (varsayılan false = bugünkü davranış): yeni üye katılmadan ÖNCEKİ mesajları görebilir mi.
--     Yalnızca OWNER değiştirir (update_chat_group_owner_settings).
--   * `chat_groups.role_permissions`: admin ve moderator için yetki bayrakları (8 yetenek). Varsayılanlar bugünkü matrisle
--     birebir aynıdır; yalnızca OWNER değiştirir. Owner her zaman her şeyi yapar. Rütbe kuralları (kendinden düşük rütbeye
--     işlem, admin'in admin atayamaması, devir/silme yalnız owner) yetkiden bağımsız olarak sürer.

create or replace function public._group_default_permissions()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'admin', jsonb_build_object('edit_settings', true, 'change_visibility', true, 'manage_invites', true, 'manage_requests', true,
                                'remove_members', true, 'ban_members', true, 'manage_roles', true, 'delete_messages', true),
    'moderator', jsonb_build_object('edit_settings', false, 'change_visibility', false, 'manage_invites', false, 'manage_requests', true,
                                    'remove_members', true, 'ban_members', false, 'manage_roles', false, 'delete_messages', true)
  );
$$;

alter table public.chat_groups
  add column if not exists history_visible boolean not null default false,
  add column if not exists role_permissions jsonb not null default public._group_default_permissions();
alter table public.chat_groups
  add constraint chat_groups_role_permissions_check check (jsonb_typeof(role_permissions) = 'object');

-- Belirli bir kullanıcının grupta belirli yeteneği var mı (owner her zaman; admin/moderator saklı ayar, yoksa varsayılan).
create or replace function public._group_can(p_group_id uuid, p_user_id uuid, p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when m.role = 'owner' then true
    when m.role in ('admin', 'moderator') then coalesce(
      (g.role_permissions -> m.role ->> p_cap)::boolean,
      (public._group_default_permissions() -> m.role ->> p_cap)::boolean,
      false)
    else false
  end
  from public.conversation_members m
  join public.chat_groups g on g.id = m.conversation_id
  where m.conversation_id = p_group_id and m.user_id = p_user_id;
$$;

create or replace function public._group_require_cap(p_group_id uuid, p_actor uuid, p_cap text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public._group_can(p_group_id, p_actor, p_cap), false) then
    raise exception 'forbidden';
  end if;
end;
$$;

-- RLS için: çağıranın (auth.uid()) yeteneği.
create or replace function public.chat_group_can(p_group_id uuid, p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public._group_can(p_group_id, auth.uid(), p_cap), false);
$$;

revoke execute on function public._group_default_permissions() from public, anon, authenticated;
revoke execute on function public._group_can(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._group_require_cap(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.chat_group_can(uuid, text) from public, anon;
grant execute on function public.chat_group_can(uuid, text) to authenticated;

-- Okuma kuralı: geçmiş görünürlüğü açıksa üye katılmadan önceki mesajları da görür (kişisel "temizle" ve engel kuralı aynen sürer).
create or replace function public.can_read_message(p_conversation_id uuid, p_sender_id uuid, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.kind = 'group' then
      exists (
        select 1 from public.conversation_members m
          join public.chat_groups g on g.id = m.conversation_id
         where m.conversation_id = p_conversation_id
           and m.user_id = auth.uid()
           and (g.history_visible or p_created_at >= m.joined_at)
      )
      and (p_sender_id = auth.uid() or not public.is_blocked(auth.uid(), p_sender_id))
    else
      exists (
        select 1 from public.conversation_members m
         where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
      )
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

-- RLS: istek/davet/bağlantı/yasak listelerini artık yetkisi OLAN okur (rol adına değil).
alter policy "Requesters and group staff can read join requests" on public.chat_group_join_requests
  using (user_id = auth.uid() or public.chat_group_can(group_id, 'manage_requests'));
alter policy "Invitees, inviters and group managers can read invitations" on public.chat_group_invitations
  using (invitee_id = auth.uid() or inviter_id = auth.uid() or public.chat_group_can(group_id, 'manage_invites'));
alter policy "Group managers can read invite links" on public.chat_group_links
  using (public.chat_group_can(group_id, 'manage_invites'));
alter policy "Group managers can read bans" on public.chat_group_bans
  using (public.chat_group_can(group_id, 'ban_members') or public.chat_group_can(group_id, 'remove_members'));


create or replace function public.update_chat_group(p_group_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_name text;
  v_description text;
  v_avatar text;
  v_limit integer;
  v_policy text;
  v_changed text[] := '{}';
  v_audit uuid;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'edit_settings');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;

  v_name := g.name; v_description := g.description; v_avatar := g.avatar_url; v_limit := g.member_limit; v_policy := g.posting_policy;

  if p_patch ? 'name' then
    v_name := btrim(coalesce(p_patch ->> 'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'invalid_name'; end if;
    if v_name <> g.name then v_changed := array_append(v_changed, 'name'); end if;
  end if;
  if p_patch ? 'description' then
    v_description := nullif(btrim(coalesce(p_patch ->> 'description', '')), '');
    if v_description is not null and char_length(v_description) > 500 then raise exception 'invalid_description'; end if;
    if v_description is distinct from g.description then v_changed := array_append(v_changed, 'description'); end if;
  end if;
  if p_patch ? 'avatar_url' then
    v_avatar := nullif(p_patch ->> 'avatar_url', '');
    if not public._group_valid_avatar(v_avatar) then raise exception 'invalid_avatar'; end if;
    if v_avatar is distinct from g.avatar_url then v_changed := array_append(v_changed, 'avatar_url'); end if;
  end if;
  if p_patch ? 'member_limit' then
    if jsonb_typeof(p_patch -> 'member_limit') <> 'number' then raise exception 'invalid_member_limit'; end if;
    v_limit := (p_patch ->> 'member_limit')::integer;
    if v_limit < 2 or v_limit > 1000 then raise exception 'invalid_member_limit'; end if;
    if v_limit < g.member_count then raise exception 'member_limit_below_count'; end if;
    if v_limit <> g.member_limit then v_changed := array_append(v_changed, 'member_limit'); end if;
  end if;
  if p_patch ? 'posting_policy' then
    v_policy := p_patch ->> 'posting_policy';
    if v_policy not in ('members', 'admins') then raise exception 'invalid_posting_policy'; end if;
    if v_policy <> g.posting_policy then v_changed := array_append(v_changed, 'posting_policy'); end if;
  end if;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('changed', false);
  end if;

  update public.chat_groups
     set name = v_name, description = v_description, avatar_url = v_avatar, member_limit = v_limit, posting_policy = v_policy
   where id = p_group_id;

  v_audit := public._group_audit(p_group_id, v_name, v_actor, null, 'settings_updated', jsonb_build_object('changed', to_jsonb(v_changed)));

  -- Önemli ayar: kim yazabilir. Sessize alınmamış üyelere haber verilir (ad/açıklama değişikliği bildirim üretmez).
  if 'posting_policy' = any (v_changed) then
    for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
      perform public._group_notify(
        v_member.user_id, v_actor, p_group_id,
        case when v_policy = 'admins'
          then '"' || public.truncate_preview(v_name, 60) || '" grubunda artık yalnızca yöneticiler mesaj gönderebilir.'
          else '"' || public.truncate_preview(v_name, 60) || '" grubunda artık tüm üyeler mesaj gönderebilir.' end,
        '/messages/local?id=' || p_group_id,
        'grpevt:' || v_audit || ':' || v_member.user_id,
        true
      );
    end loop;
  end if;

  return jsonb_build_object('changed', true, 'changed_fields', to_jsonb(v_changed));
end;
$$;

create or replace function public.set_chat_group_visibility(p_group_id uuid, p_visibility text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_audit uuid;
  r record;
  v_reason text;
  v_accepted integer := 0;
  v_already integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_skipped_count integer := 0;
  v_member record;
begin
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid_visibility';
  end if;
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'change_visibility');

  if g.visibility = p_visibility then
    return jsonb_build_object(
      'changed', false, 'visibility', g.visibility, 'accepted_count', 0, 'already_member_count', 0,
      'skipped_count', 0, 'skipped', '[]'::jsonb, 'pending_remaining', g.pending_request_count, 'member_count', g.member_count
    );
  end if;

  update public.chat_groups set visibility = p_visibility where id = p_group_id;
  v_audit := public._group_audit(p_group_id, g.name, v_actor, null, 'visibility_changed',
    jsonb_build_object('from', g.visibility, 'to', p_visibility));

  if p_visibility = 'public' then
    for r in
      select id, user_id from public.chat_group_join_requests
       where group_id = p_group_id and status = 'pending'
       order by created_at, id
       for update
    loop
      v_reason := null;
      if exists (select 1 from public.conversation_members where conversation_id = p_group_id and user_id = r.user_id) then
        update public.chat_group_join_requests
           set status = 'accepted', decided_by = v_actor, decided_at = now(), decision_note = 'already_member'
         where id = r.id;
        v_already := v_already + 1;
        continue;
      elsif exists (select 1 from public.chat_group_bans where group_id = p_group_id and user_id = r.user_id) then
        v_reason := 'banned';
      elsif public._group_user_blocked(p_group_id, r.user_id, v_actor) then
        v_reason := 'blocked';
      elsif (select member_count >= member_limit from public.chat_groups where id = p_group_id) then
        v_reason := 'member_limit';
      end if;

      if v_reason is not null then
        v_skipped_count := v_skipped_count + 1;
        if v_skipped_count <= 50 then
          v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('request_id', r.id, 'user_id', r.user_id, 'reason', v_reason));
        end if;
        continue;
      end if;

      update public.chat_group_join_requests
         set status = 'accepted', decided_by = v_actor, decided_at = now(), decision_note = 'visibility_public'
       where id = r.id;
      perform public._group_add_member(p_group_id, r.user_id, 'member');
      perform public._group_audit(p_group_id, g.name, v_actor, r.user_id, 'request_accepted', jsonb_build_object('request_id', r.id, 'bulk', true));
      perform public._group_notify(
        r.user_id, v_actor, p_group_id,
        'Katılma isteğini kabul etti: "' || public.truncate_preview(g.name, 60) || '"',
        '/messages/local?id=' || p_group_id,
        'grpreq:' || r.id || ':accepted'
      );
      v_accepted := v_accepted + 1;
    end loop;
  end if;

  -- Üyelere (sessize almayanlara) görünürlüğün değiştiği bildirilir.
  for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
    perform public._group_notify(
      v_member.user_id, v_actor, p_group_id,
      case when p_visibility = 'public'
        then '"' || public.truncate_preview(g.name, 60) || '" grubunu herkese açık yaptı.'
        else '"' || public.truncate_preview(g.name, 60) || '" grubunu herkese kapattı.' end,
      '/messages/local?id=' || p_group_id,
      'grpevt:' || v_audit || ':' || v_member.user_id,
      true
    );
  end loop;

  select * into g from public.chat_groups where id = p_group_id;
  return jsonb_build_object(
    'changed', true,
    'visibility', g.visibility,
    'accepted_count', v_accepted,
    'already_member_count', v_already,
    'skipped_count', v_skipped_count,
    'skipped', v_skipped,
    'pending_remaining', g.pending_request_count,
    'member_count', g.member_count
  );
end;
$$;

create or replace function public.invite_to_chat_group(p_group_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_invitee uuid;
  v_reason text;
  v_invited integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'manage_invites');
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'no_users';
  end if;
  for v_invitee in select distinct u from unnest(p_user_ids) as u limit 50 loop
    v_reason := public._group_invite_one(p_group_id, g.name, v_actor, v_invitee);
    if v_reason is null then
      v_invited := v_invited + 1;
    else
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('user_id', v_invitee, 'reason', v_reason));
    end if;
  end loop;
  return jsonb_build_object('invited_count', v_invited, 'skipped', v_skipped);
end;
$$;

create or replace function public.create_chat_group_link(p_group_id uuid, p_expires_hours integer default 168, p_max_uses integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_token text;
  l public.chat_group_links;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'manage_invites');
  if p_expires_hours is null or p_expires_hours < 1 or p_expires_hours > 720 then
    raise exception 'invalid_expiry';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 10000) then
    raise exception 'invalid_max_uses';
  end if;
  if (select count(*) from public.chat_group_links
       where group_id = p_group_id and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'link_limit_reached';
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.chat_group_links (group_id, token_hash, created_by, expires_at, max_uses)
  values (p_group_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_actor, now() + make_interval(hours => p_expires_hours), p_max_uses)
  returning * into l;
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'link_created', jsonb_build_object('link_id', l.id));
  -- Ham token YALNIZCA burada, bir kez döner; veritabanında yalnız özeti durur.
  return jsonb_build_object('link_id', l.id, 'token', v_token, 'expires_at', l.expires_at, 'max_uses', l.max_uses);
end;
$$;

create or replace function public.revoke_chat_group_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group_id uuid;
  g public.chat_groups;
begin
  select group_id into v_group_id from public.chat_group_links where id = p_link_id;
  if not found then
    raise exception 'link_not_found';
  end if;
  g := public._group_lock(v_group_id);
  perform public._group_require_cap(v_group_id, v_actor, 'manage_invites');
  update public.chat_group_links set revoked_at = coalesce(revoked_at, now()) where id = p_link_id;
  perform public._group_audit(v_group_id, g.name, v_actor, null, 'link_revoked', jsonb_build_object('link_id', p_link_id));
end;
$$;

create or replace function public.cancel_chat_group_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group_id uuid;
  g public.chat_groups;
  i public.chat_group_invitations;
begin
  select group_id into v_group_id from public.chat_group_invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation_not_found';
  end if;
  g := public._group_lock(v_group_id);
  select * into i from public.chat_group_invitations where id = p_invitation_id for update;
  if not public._group_can(v_group_id, v_actor, 'manage_invites') then
    raise exception 'forbidden';
  end if;
  if i.status <> 'pending' then
    raise exception 'invalid_state';
  end if;
  update public.chat_group_invitations set status = 'cancelled', responded_at = now() where id = p_invitation_id;
  perform public._group_audit(v_group_id, g.name, v_actor, i.invitee_id, 'invitation_cancelled', jsonb_build_object('invitation_id', p_invitation_id));
end;
$$;

create or replace function public.unban_chat_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'ban_members');
  delete from public.chat_group_bans where group_id = p_group_id and user_id = p_user_id;
  if not found then
    raise exception 'not_banned';
  end if;
  perform public._group_audit(p_group_id, g.name, v_actor, p_user_id, 'member_unbanned');
end;
$$;

create or replace function public.decide_chat_group_join_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group_id uuid;
  g public.chat_groups;
  r public.chat_group_join_requests;
begin
  select group_id into v_group_id from public.chat_group_join_requests where id = p_request_id;
  if not found then
    raise exception 'request_not_found';
  end if;
  g := public._group_lock(v_group_id);
  perform public._group_require_cap(v_group_id, v_actor, 'manage_requests');
  select * into r from public.chat_group_join_requests where id = p_request_id for update;
  if r.status <> 'pending' then
    raise exception 'invalid_state';
  end if;

  if p_accept then
    if public._group_member_role(v_group_id, r.user_id) is not null then
      update public.chat_group_join_requests
         set status = 'accepted', decided_by = v_actor, decided_at = now(), decision_note = 'already_member'
       where id = p_request_id;
      return jsonb_build_object('outcome', 'already_member');
    end if;
    if exists (select 1 from public.chat_group_bans where group_id = v_group_id and user_id = r.user_id) then
      raise exception 'user_banned';
    end if;
    if public._group_user_blocked(v_group_id, r.user_id, v_actor) then
      raise exception 'blocked';
    end if;
    update public.chat_group_join_requests
       set status = 'accepted', decided_by = v_actor, decided_at = now(), decision_note = 'accepted'
     where id = p_request_id;
    perform public._group_add_member(v_group_id, r.user_id, 'member');
    perform public._group_audit(v_group_id, g.name, v_actor, r.user_id, 'request_accepted', jsonb_build_object('request_id', p_request_id));
    perform public._group_notify(
      r.user_id, v_actor, v_group_id,
      'Katılma isteğini kabul etti: "' || public.truncate_preview(g.name, 60) || '"',
      '/messages/local?id=' || v_group_id,
      'grpreq:' || p_request_id || ':accepted'
    );
    return jsonb_build_object('outcome', 'accepted');
  end if;

  update public.chat_group_join_requests
     set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = 'rejected'
   where id = p_request_id;
  perform public._group_audit(v_group_id, g.name, v_actor, r.user_id, 'request_rejected', jsonb_build_object('request_id', p_request_id));
  perform public._group_notify(
    r.user_id, v_actor, v_group_id,
    'Katılma isteğini reddetti: "' || public.truncate_preview(g.name, 60) || '"',
    '/groups',
    'grpreq:' || p_request_id || ':rejected'
  );
  return jsonb_build_object('outcome', 'rejected');
end;
$$;

create or replace function public.join_chat_group_via_link(p_token text, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_hash text;
  v_group_id uuid;
  g public.chat_groups;
  l public.chat_group_links;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_request_id uuid;
  v_staff record;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then
    raise exception 'invalid_link';
  end if;
  if v_message is not null and char_length(v_message) > 300 then
    raise exception 'invalid_message';
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- Kilit sırası her yerde "önce grup, sonra bağlantı".
  select group_id into v_group_id from public.chat_group_links where token_hash = v_hash;
  if not found then
    raise exception 'invalid_link';
  end if;
  g := public._group_lock(v_group_id);
  select * into l from public.chat_group_links where token_hash = v_hash for update;
  if l.revoked_at is not null or l.expires_at <= now() or (l.max_uses is not null and l.use_count >= l.max_uses) then
    raise exception 'invalid_link';
  end if;

  if public._group_member_role(v_group_id, v_actor) is not null then
    return jsonb_build_object('outcome', 'already_member', 'group_id', v_group_id);
  end if;
  if exists (select 1 from public.chat_group_bans where group_id = v_group_id and user_id = v_actor)
     or public._group_user_blocked(v_group_id, v_actor) then
    raise exception 'cannot_join';
  end if;

  -- Bekleyen bir davetim varsa bağlantı onu kabul sayılır.
  if exists (
    select 1 from public.chat_group_invitations
     where group_id = v_group_id and invitee_id = v_actor and status = 'pending' and expires_at > now()
  ) or g.visibility = 'public' then
    perform public._group_add_member(v_group_id, v_actor, 'member');
    update public.chat_group_links set use_count = use_count + 1 where id = l.id;
    perform public._group_audit(v_group_id, g.name, v_actor, v_actor, 'member_joined', jsonb_build_object('via', 'link', 'link_id', l.id));
    return jsonb_build_object('outcome', 'joined', 'group_id', v_group_id);
  end if;

  if exists (select 1 from public.chat_group_join_requests where group_id = v_group_id and user_id = v_actor and status = 'pending') then
    return jsonb_build_object('outcome', 'already_requested', 'group_id', null);
  end if;
  -- Reddedilen kişi 24 saat sonra yeniden başvurabilir (geçmiş silinmez, yeni satır açılır).
  if exists (
    select 1 from public.chat_group_join_requests
     where group_id = v_group_id and user_id = v_actor and status = 'rejected' and decided_at > now() - interval '24 hours'
  ) then
    raise exception 'request_cooldown';
  end if;
  if g.pending_request_count >= 200
     or (select count(*) from public.chat_group_join_requests where user_id = v_actor and status = 'pending') >= 20 then
    raise exception 'request_limit_reached';
  end if;

  insert into public.chat_group_join_requests (group_id, user_id, message)
  values (v_group_id, v_actor, v_message)
  returning id into v_request_id;
  update public.chat_group_links set use_count = use_count + 1 where id = l.id;
  perform public._group_audit(v_group_id, g.name, v_actor, v_actor, 'request_created', jsonb_build_object('request_id', v_request_id, 'link_id', l.id));

  for v_staff in select user_id from public.conversation_members where conversation_id = v_group_id and role in ('owner', 'admin', 'moderator')
                                  and public._group_can(v_group_id, user_id, 'manage_requests') loop
    perform public._group_notify(
      v_staff.user_id, v_actor, v_group_id,
      '"' || public.truncate_preview(g.name, 60) || '" grubuna katılma isteği gönderdi.',
      '/messages/local?id=' || v_group_id || '&panel=requests',
      'grpreq:' || v_request_id || ':new:' || v_staff.user_id,
      true
    );
  end loop;
  return jsonb_build_object('outcome', 'requested', 'group_id', null, 'request_id', v_request_id);
end;
$$;

create or replace function public.remove_chat_group_member(p_group_id uuid, p_user_id uuid, p_ban boolean default false, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_actor_role text;
  v_target_role text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'remove_members');
  v_actor_role := public._group_member_role(p_group_id, v_actor);
  if p_user_id = v_actor then
    raise exception 'cannot_target_self';
  end if;
  v_target_role := public._group_member_role(p_group_id, p_user_id);
  if v_target_role is null then
    raise exception 'not_a_member';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'invalid_reason';
  end if;
  if public.chat_group_role_rank(v_target_role) >= public.chat_group_role_rank(v_actor_role)
     or (v_actor_role = 'moderator' and v_target_role <> 'member') then
    raise exception 'forbidden';
  end if;
  if p_ban and not public._group_can(p_group_id, v_actor, 'ban_members') then
    raise exception 'forbidden';
  end if;

  delete from public.conversation_members where conversation_id = p_group_id and user_id = p_user_id;
  if p_ban then
    insert into public.chat_group_bans (group_id, user_id, banned_by, reason)
    values (p_group_id, p_user_id, v_actor, v_reason)
    on conflict (group_id, user_id) do nothing;
  end if;
  perform public._group_audit(p_group_id, g.name, v_actor, p_user_id, case when p_ban then 'member_banned' else 'member_removed' end,
    jsonb_build_object('reason', v_reason, 'target_role', v_target_role));
  perform public._group_notify(
    p_user_id, v_actor, p_group_id,
    'Seni "' || public.truncate_preview(g.name, 60) || '" grubundan çıkardı.',
    '/groups',
    'grpremove:' || p_group_id || ':' || p_user_id || ':' || extract(epoch from clock_timestamp())::bigint
  );
end;
$$;

create or replace function public.set_chat_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_actor_role text;
  v_target_role text;
begin
  if p_role not in ('admin', 'moderator', 'member') then
    raise exception 'invalid_role';
  end if;
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'manage_roles');
  v_actor_role := public._group_member_role(p_group_id, v_actor);
  if p_user_id = v_actor then
    raise exception 'cannot_target_self';
  end if;
  v_target_role := public._group_member_role(p_group_id, p_user_id);
  if v_target_role is null then
    raise exception 'not_a_member';
  end if;
  if v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;
  if v_actor_role = 'admin' and (p_role = 'admin' or v_target_role = 'admin') then
    raise exception 'forbidden';
  end if;
  if v_target_role = p_role then
    return;
  end if;
  update public.conversation_members set role = p_role where conversation_id = p_group_id and user_id = p_user_id;
  perform public._group_audit(p_group_id, g.name, v_actor, p_user_id, 'role_changed', jsonb_build_object('from', v_target_role, 'to', p_role));
end;
$$;

create or replace function public.moderate_chat_group_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  m public.messages;
  g public.chat_groups;
  v_actor_role text;
  v_sender_role text;
begin
  select * into m from public.messages where id = p_message_id;
  if not found or not public.is_group_conversation(m.conversation_id) then
    raise exception 'message_not_found';
  end if;
  g := public._group_lock(m.conversation_id);
  perform public._group_require_cap(m.conversation_id, v_actor, 'delete_messages');
  v_actor_role := public._group_member_role(m.conversation_id, v_actor);
  if m.deleted_at is not null then
    return;
  end if;
  -- Gönderen artık üye değilse (ayrılmış/çıkarılmış) rütbesi en düşük sayılır.
  v_sender_role := coalesce(public._group_member_role(m.conversation_id, m.sender_id), 'member');
  if m.sender_id <> v_actor and public.chat_group_role_rank(v_sender_role) >= public.chat_group_role_rank(v_actor_role) then
    raise exception 'forbidden';
  end if;
  update public.messages
     set deleted_at = now(), body = null, shared_prompt_id = null, shared_request_id = null, attachments = '[]'::jsonb
   where id = p_message_id;
  perform public._group_audit(m.conversation_id, g.name, v_actor, m.sender_id, 'message_deleted', jsonb_build_object('message_id', p_message_id));
end;
$$;


-- Yalnızca OWNER: geçmiş görünürlüğü ve admin/moderator yetkileri. Yama anahtarları: `history_visible` (boolean),
-- `role_permissions` ({admin|moderator: {<yetenek>: boolean}}). Bilinmeyen anahtar/rol/tip reddedilir; moderatöre
-- `manage_roles` verilemez (rütbe kuralı gereği anlamsız: kendinden düşük rütbeyi "daha düşüğe" çevirebilirdi).
create or replace function public.update_chat_group_owner_settings(p_group_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_history boolean;
  v_perms jsonb;
  v_changed text[] := '{}';
  v_role text;
  v_cap text;
  v_val jsonb;
  v_audit uuid;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_role(p_group_id, v_actor, array['owner']);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;
  v_history := g.history_visible;
  v_perms := g.role_permissions;

  if p_patch ? 'history_visible' then
    if jsonb_typeof(p_patch -> 'history_visible') <> 'boolean' then raise exception 'invalid_patch'; end if;
    v_history := (p_patch ->> 'history_visible')::boolean;
    if v_history <> g.history_visible then v_changed := array_append(v_changed, 'history_visible'); end if;
  end if;

  if p_patch ? 'role_permissions' then
    if jsonb_typeof(p_patch -> 'role_permissions') <> 'object' then raise exception 'invalid_patch'; end if;
    for v_role in select jsonb_object_keys(p_patch -> 'role_permissions') loop
      if v_role not in ('admin', 'moderator') or jsonb_typeof(p_patch -> 'role_permissions' -> v_role) <> 'object' then
        raise exception 'invalid_patch';
      end if;
      for v_cap, v_val in select key, value from jsonb_each(p_patch -> 'role_permissions' -> v_role) loop
        if v_cap <> all (array['edit_settings', 'change_visibility', 'manage_invites', 'manage_requests', 'remove_members', 'ban_members', 'manage_roles', 'delete_messages'])
           or jsonb_typeof(v_val) <> 'boolean' then
          raise exception 'invalid_patch';
        end if;
        if v_role = 'moderator' and v_cap = 'manage_roles' and v_val = 'true'::jsonb then
          raise exception 'invalid_patch';
        end if;
        v_perms := jsonb_set(v_perms, array[v_role, v_cap], v_val);
      end loop;
    end loop;
    if v_perms is distinct from g.role_permissions then v_changed := array_append(v_changed, 'role_permissions'); end if;
  end if;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('changed', false);
  end if;

  update public.chat_groups set history_visible = v_history, role_permissions = v_perms where id = p_group_id;
  v_audit := public._group_audit(p_group_id, g.name, v_actor, null, 'owner_settings_updated',
    jsonb_build_object('changed', to_jsonb(v_changed), 'history_visible', v_history, 'role_permissions', v_perms));

  if 'role_permissions' = any (v_changed) then
    for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and role in ('admin', 'moderator') loop
      perform public._group_notify(
        v_member.user_id, v_actor, p_group_id,
        '"' || public.truncate_preview(g.name, 60) || '" grubunda yönetim yetkilerin güncellendi.',
        '/messages/local?id=' || p_group_id,
        'grpevt:' || v_audit || ':' || v_member.user_id
      );
    end loop;
  end if;
  return jsonb_build_object('changed', true, 'changed_fields', to_jsonb(v_changed));
end;
$$;

revoke execute on function public.update_chat_group_owner_settings(uuid, jsonb) from public, anon;
grant execute on function public.update_chat_group_owner_settings(uuid, jsonb) to authenticated;
