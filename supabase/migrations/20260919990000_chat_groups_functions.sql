-- Grup sohbeti ve topluluk sistemi — YAZMA YOLU (SECURITY DEFINER RPC'ler) (docs/history/172-*).
-- Şema/RLS: 20260919980000_chat_groups_schema.sql.
--
-- Ortak kurallar (hepsi için):
--   * Kimlik DAİMA auth.uid()'den gelir; istemcinin verdiği rol/görünürlük/grup kimliğine tek başına güvenilmez.
--   * Her yazan fonksiyon önce grup satırını `for update` kilitler (`_group_lock`): üyelik, istek, davet, rol ve
--     görünürlük değişiklikleri grup başına SIRALANIR → yarış koşulu (üye sınırı aşımı, çift kabul, çift üyelik) olmaz.
--   * Hata ifadeleri makine kodudur (`raise exception 'member_limit_reached'`); istemci bunları çevirir.
--   * search_path sabit; EXECUTE yalnız `authenticated`'a (iç yardımcılara hiç kimseye) açılır.
--   * Bildirimler yalnızca işlem başarılı olunca, aynı işlemde üretilir (`dedupe_key` ile tekrar önlenir).
--     Tür olarak mevcut 'system' kullanılır (check kısıtını genişletmek `drop constraint` gerektirirdi).

-- ============================================================================
-- İç yardımcılar
-- ============================================================================

create or replace function public._group_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and suspended_until is not null and suspended_until > now()) then
    raise exception 'account_suspended';
  end if;
  return v_uid;
end;
$$;

create or replace function public._group_lock(p_group_id uuid)
returns public.chat_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.chat_groups;
begin
  select * into g from public.chat_groups where id = p_group_id for update;
  if not found then
    raise exception 'group_not_found';
  end if;
  return g;
end;
$$;

create or replace function public._group_member_role(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.conversation_members where conversation_id = p_group_id and user_id = p_user_id;
$$;

-- Çağıranın rolü p_roles içinde değilse 'forbidden'. Üye olmayan da 'forbidden' (grubun varlığı sızmaz).
create or replace function public._group_require_role(p_group_id uuid, p_actor uuid, p_roles text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public._group_member_role(p_group_id, p_actor);
begin
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'forbidden';
  end if;
  return v_role;
end;
$$;

create or replace function public._group_audit(p_group_id uuid, p_group_name text, p_actor uuid, p_target uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.chat_group_audit (id, group_id, group_name, actor_id, target_user_id, action, details)
  values (v_id, p_group_id, p_group_name, p_actor, p_target, p_action, coalesce(p_details, '{}'::jsonb));
  return v_id;
end;
$$;

-- Tek bildirim. `p_respect_mute`: bilgi düzeyindeki olaylar sessize alınmış üyeye gitmez; kişiyi doğrudan
-- ilgilendirenler (davet, kendi isteğinin sonucu, çıkarılma) sessize alma bilmez. Kendine bildirim yok.
create or replace function public._group_notify(
  p_recipient uuid, p_actor uuid, p_group_id uuid, p_message text, p_href text, p_dedupe text, p_respect_mute boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  if p_respect_mute and exists (
    select 1 from public.conversation_members
     where conversation_id = p_group_id and user_id = p_recipient and muted_at is not null
  ) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (p_recipient, p_actor, 'system', p_message, p_href, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- Başvuran/davetli ile grubun sahibi (ya da işlemi yapan yönetici) arasında engel ilişkisi var mı?
create or replace function public._group_user_blocked(p_group_id uuid, p_user_id uuid, p_actor uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members o
     where o.conversation_id = p_group_id and o.role = 'owner' and public.is_blocked(o.user_id, p_user_id)
  ) or (p_actor is not null and public.is_blocked(p_actor, p_user_id));
$$;

-- Üye ekler (grup satırı çağıran tarafından kilitli olmalı). Sınır ve kişi başı grup üstü sınırı burada.
-- Aynı kişinin bekleyen isteği/daveti artık anlamsız: aynı işlemde 'accepted' yapılır (üyenin bekleyen kaydı kalmaz).
create or replace function public._group_add_member(p_group_id uuid, p_user_id uuid, p_role text default 'member')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.chat_groups;
  v_inserted integer;
begin
  select * into g from public.chat_groups where id = p_group_id;
  if not found then
    raise exception 'group_not_found';
  end if;
  if g.member_count >= g.member_limit then
    raise exception 'member_limit_reached';
  end if;
  if (
    select count(*) from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id and c.kind = 'group'
     where cm.user_id = p_user_id
  ) >= 200 then
    raise exception 'member_groups_limit';
  end if;

  insert into public.conversation_members (conversation_id, user_id, role, status)
  values (p_group_id, p_user_id, p_role, 'accepted')
  on conflict (conversation_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'already_member';
  end if;

  update public.chat_group_join_requests
     set status = 'accepted', decided_at = now(), decision_note = coalesce(decision_note, 'joined')
   where group_id = p_group_id and user_id = p_user_id and status = 'pending';
  update public.chat_group_invitations
     set status = 'accepted', responded_at = now()
   where group_id = p_group_id and invitee_id = p_user_id and status = 'pending';
end;
$$;

-- Tek davet. Başarıda null, atlanırsa neden kodu döner.
create or replace function public._group_invite_one(p_group_id uuid, p_group_name text, p_actor uuid, p_invitee uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_invitee = p_actor then
    return 'self';
  end if;
  if not exists (select 1 from public.profiles where id = p_invitee) then
    return 'not_found';
  end if;
  if public.is_blocked(p_actor, p_invitee) then
    return 'blocked';
  end if;
  if exists (select 1 from public.conversation_members where conversation_id = p_group_id and user_id = p_invitee) then
    return 'already_member';
  end if;
  if exists (select 1 from public.chat_group_bans where group_id = p_group_id and user_id = p_invitee) then
    return 'banned';
  end if;

  update public.chat_group_invitations
     set status = 'expired', responded_at = now()
   where group_id = p_group_id and invitee_id = p_invitee and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.chat_group_invitations where group_id = p_group_id and invitee_id = p_invitee and status = 'pending') then
    return 'already_invited';
  end if;
  if (select count(*) from public.chat_group_invitations where group_id = p_group_id and status = 'pending' and expires_at > now()) >= 100 then
    return 'invite_limit_reached';
  end if;

  insert into public.chat_group_invitations (group_id, invitee_id, inviter_id)
  values (p_group_id, p_invitee, p_actor)
  returning id into v_id;

  perform public._group_audit(p_group_id, p_group_name, p_actor, p_invitee, 'invitation_sent', jsonb_build_object('invitation_id', v_id));
  perform public._group_notify(
    p_invitee, p_actor, p_group_id,
    'Seni "' || public.truncate_preview(p_group_name, 60) || '" grubuna davet etti.',
    '/groups?tab=invites',
    'grpinv:' || v_id
  );
  return null;
end;
$$;

-- Avatar adresi yalnızca bu projenin herkese açık `avatars` bucket'ından olabilir.
create or replace function public._group_valid_avatar(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is null or (char_length(p_url) <= 500 and p_url ~ '^https://[^/]+/storage/v1/object/public/avatars/[A-Za-z0-9._~%/-]+$');
$$;

revoke execute on function public._group_actor() from public, anon, authenticated;
revoke execute on function public._group_lock(uuid) from public, anon, authenticated;
revoke execute on function public._group_member_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._group_require_role(uuid, uuid, text[]) from public, anon, authenticated;
revoke execute on function public._group_audit(uuid, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public._group_notify(uuid, uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public._group_user_blocked(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._group_add_member(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._group_invite_one(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._group_valid_avatar(text) from public, anon, authenticated;

-- ============================================================================
-- Grup oluşturma ve ayarlar
-- ============================================================================

create or replace function public.create_chat_group(
  p_name text,
  p_description text default null,
  p_visibility text default 'private',
  p_avatar_url text default null,
  p_member_limit integer default 256,
  p_invite_user_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid := gen_random_uuid();
  v_invitee uuid;
  v_reason text;
  v_invited integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'invalid_name';
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'invalid_description';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid_visibility';
  end if;
  if p_member_limit is null or p_member_limit < 2 or p_member_limit > 1000 then
    raise exception 'invalid_member_limit';
  end if;
  if not public._group_valid_avatar(p_avatar_url) then
    raise exception 'invalid_avatar';
  end if;
  if (select count(*) from public.conversation_members where user_id = v_actor and role = 'owner') >= 20 then
    raise exception 'group_limit_reached';
  end if;

  insert into public.conversations (id, kind) values (v_id, 'group');
  insert into public.chat_groups (id, name, description, avatar_url, visibility, member_limit, created_by)
  values (v_id, v_name, v_description, p_avatar_url, p_visibility, p_member_limit, v_actor);
  insert into public.conversation_members (conversation_id, user_id, role, status)
  values (v_id, v_actor, 'owner', 'accepted');

  perform public._group_audit(v_id, v_name, v_actor, null, 'group_created', jsonb_build_object('visibility', p_visibility));

  for v_invitee in select distinct u from unnest(coalesce(p_invite_user_ids, '{}'::uuid[])) as u limit 50 loop
    v_reason := public._group_invite_one(v_id, v_name, v_actor, v_invitee);
    if v_reason is null then
      v_invited := v_invited + 1;
    else
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('user_id', v_invitee, 'reason', v_reason));
    end if;
  end loop;

  return jsonb_build_object('group_id', v_id, 'invited_count', v_invited, 'skipped', v_skipped);
end;
$$;

-- Ayar güncelleme (owner/admin). Yalnız `p_patch` içindeki anahtarlar uygulanır:
-- name, description, avatar_url, member_limit, posting_policy. Görünürlük ayrı RPC'dir.
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
  perform public._group_require_role(p_group_id, v_actor, array['owner', 'admin']);
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

-- Görünürlük değişikliği (owner/admin) — TEK ATOMİK İŞLEM.
-- Kapalı → herkese açık geçişinde bekleyen başvurular güvenlik kurallarından geçenler için üyeliğe çevrilir:
--   zaten üye            → istek 'accepted' (not: already_member), ikinci üyelik oluşmaz
--   yasaklı / engel ilişkisi (sahip veya işlemi yapan yönetici ile) / üye sınırı dolu
--                        → istek 'pending' KALIR (kabul edilmiş gibi işaretlenmez) ve sonuçta nedeniyle raporlanır
--   diğerleri            → üyelik oluşturulur, istek 'accepted' (decided_by = işlemi yapan), başvurana bildirim
-- Beklenmeyen bir hata olursa fonksiyonun tamamı geri alınır (görünürlük DE eski hâline döner).
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
  perform public._group_require_role(p_group_id, v_actor, array['owner', 'admin']);

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

-- ============================================================================
-- Katılma: doğrudan (herkese açık), bağlantıyla, istek
-- ============================================================================

create or replace function public.join_chat_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_admin record;
begin
  g := public._group_lock(p_group_id);

  if public._group_member_role(p_group_id, v_actor) is not null then
    return jsonb_build_object('outcome', 'already_member', 'group_id', p_group_id);
  end if;
  -- Kapalı grubun varlığı sızmaz: herkese açık değilse "bulunamadı".
  if g.visibility <> 'public' then
    raise exception 'group_not_found';
  end if;
  if exists (select 1 from public.chat_group_bans where group_id = p_group_id and user_id = v_actor)
     or public._group_user_blocked(p_group_id, v_actor) then
    raise exception 'cannot_join';
  end if;

  perform public._group_add_member(p_group_id, v_actor, 'member');
  perform public._group_audit(p_group_id, g.name, v_actor, v_actor, 'member_joined', jsonb_build_object('via', 'public'));

  -- Küçük gruplarda sahip/yöneticilere haber (büyük gruplarda her katılım bildirim yağmuru olurdu).
  if g.member_count + 1 <= 50 then
    for v_admin in select user_id from public.conversation_members where conversation_id = p_group_id and role in ('owner', 'admin') loop
      perform public._group_notify(
        v_admin.user_id, v_actor, p_group_id,
        '"' || public.truncate_preview(g.name, 60) || '" grubuna katıldı.',
        '/messages/local?id=' || p_group_id,
        'grpjoin:' || p_group_id || ':' || v_actor || ':' || extract(epoch from clock_timestamp())::bigint,
        true
      );
    end loop;
  end if;
  return jsonb_build_object('outcome', 'joined', 'group_id', p_group_id);
end;
$$;

-- Davet bağlantısıyla erişim. Herkese açık grup: doğrudan katılır. Kapalı grup: BAŞVURU oluşur (üye yapmaz).
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

  for v_staff in select user_id from public.conversation_members where conversation_id = v_group_id and role in ('owner', 'admin', 'moderator') loop
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

create or replace function public.cancel_chat_group_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group_id uuid;
  r public.chat_group_join_requests;
begin
  select group_id into v_group_id from public.chat_group_join_requests where id = p_request_id and user_id = v_actor;
  if not found then
    raise exception 'request_not_found';
  end if;
  perform public._group_lock(v_group_id);
  select * into r from public.chat_group_join_requests where id = p_request_id for update;
  if r.status <> 'pending' then
    raise exception 'invalid_state';
  end if;
  update public.chat_group_join_requests
     set status = 'cancelled', decided_by = v_actor, decided_at = now(), decision_note = 'cancelled_by_requester'
   where id = p_request_id;
end;
$$;

-- Başvuruyu kabul/ret (owner/admin/moderator).
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
  perform public._group_require_role(v_group_id, v_actor, array['owner', 'admin', 'moderator']);
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

-- ============================================================================
-- Davetler
-- ============================================================================

-- owner/admin; en çok 50 kişi. Atlanan her kişi için neden döner (sessizce yutulmaz).
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
  perform public._group_require_role(p_group_id, v_actor, array['owner', 'admin']);
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
  if not (public._group_member_role(v_group_id, v_actor) in ('owner', 'admin')) then
    raise exception 'forbidden';
  end if;
  if i.status <> 'pending' then
    raise exception 'invalid_state';
  end if;
  update public.chat_group_invitations set status = 'cancelled', responded_at = now() where id = p_invitation_id;
  perform public._group_audit(v_group_id, g.name, v_actor, i.invitee_id, 'invitation_cancelled', jsonb_build_object('invitation_id', p_invitation_id));
end;
$$;

-- Davete yalnızca davetli kişi yanıt verebilir; iptal edilmiş / kullanılmış / süresi dolmuş davet yeniden kullanılamaz.
create or replace function public.respond_chat_group_invitation(p_invitation_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group_id uuid;
  g public.chat_groups;
  i public.chat_group_invitations;
  v_staff record;
begin
  select group_id into v_group_id from public.chat_group_invitations where id = p_invitation_id and invitee_id = v_actor;
  if not found then
    raise exception 'invitation_not_found';
  end if;
  g := public._group_lock(v_group_id);
  select * into i from public.chat_group_invitations where id = p_invitation_id for update;
  if i.status <> 'pending' then
    raise exception 'invalid_state';
  end if;
  if i.expires_at <= now() then
    update public.chat_group_invitations set status = 'expired', responded_at = now() where id = p_invitation_id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  if not p_accept then
    update public.chat_group_invitations set status = 'declined', responded_at = now() where id = p_invitation_id;
    perform public._group_audit(v_group_id, g.name, v_actor, v_actor, 'invitation_declined', jsonb_build_object('invitation_id', p_invitation_id));
    return jsonb_build_object('outcome', 'declined');
  end if;

  if public._group_member_role(v_group_id, v_actor) is not null then
    update public.chat_group_invitations set status = 'accepted', responded_at = now() where id = p_invitation_id;
    return jsonb_build_object('outcome', 'already_member', 'group_id', v_group_id);
  end if;
  if exists (select 1 from public.chat_group_bans where group_id = v_group_id and user_id = v_actor) then
    raise exception 'cannot_join';
  end if;
  if i.inviter_id is not null and public.is_blocked(v_actor, i.inviter_id) then
    raise exception 'blocked';
  end if;

  update public.chat_group_invitations set status = 'accepted', responded_at = now() where id = p_invitation_id;
  perform public._group_add_member(v_group_id, v_actor, 'member');
  perform public._group_audit(v_group_id, g.name, v_actor, v_actor, 'invitation_accepted', jsonb_build_object('invitation_id', p_invitation_id));

  -- Daveti gönderen ve sahip/yöneticiler haberdar edilir (küçük gruplarda yeni üye bildirimi ayrıca gitmez).
  perform public._group_notify(
    i.inviter_id, v_actor, v_group_id,
    'Davetini kabul etti: "' || public.truncate_preview(g.name, 60) || '"',
    '/messages/local?id=' || v_group_id,
    'grpinv:' || p_invitation_id || ':accepted',
    true
  );
  if g.member_count + 1 <= 50 then
    for v_staff in
      select user_id from public.conversation_members
       where conversation_id = v_group_id and role in ('owner', 'admin') and user_id is distinct from i.inviter_id
    loop
      perform public._group_notify(
        v_staff.user_id, v_actor, v_group_id,
        '"' || public.truncate_preview(g.name, 60) || '" grubuna katıldı.',
        '/messages/local?id=' || v_group_id,
        'grpjoin:' || v_group_id || ':' || v_actor || ':' || extract(epoch from clock_timestamp())::bigint,
        true
      );
    end loop;
  end if;
  return jsonb_build_object('outcome', 'accepted', 'group_id', v_group_id);
end;
$$;

-- ============================================================================
-- Davet bağlantıları
-- ============================================================================

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
  perform public._group_require_role(p_group_id, v_actor, array['owner', 'admin']);
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
  perform public._group_require_role(v_group_id, v_actor, array['owner', 'admin']);
  update public.chat_group_links set revoked_at = coalesce(revoked_at, now()) where id = p_link_id;
  perform public._group_audit(v_group_id, g.name, v_actor, null, 'link_revoked', jsonb_build_object('link_id', p_link_id));
end;
$$;

-- Bağlantıyı elinde tutan kişiye grubun kartı: ad, açıklama, görsel, üye sayısı ve kendi durumu.
-- Geçersiz/iptal/süresi dolmuş bağlantı için hiçbir grup bilgisi dönmez.
create or replace function public.preview_chat_group_link(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  l public.chat_group_links;
  g public.chat_groups;
  v_status text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then
    return jsonb_build_object('valid', false);
  end if;
  select * into l from public.chat_group_links where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or l.revoked_at is not null or l.expires_at <= now() or (l.max_uses is not null and l.use_count >= l.max_uses) then
    return jsonb_build_object('valid', false);
  end if;
  select * into g from public.chat_groups where id = l.group_id;
  if not found then
    return jsonb_build_object('valid', false);
  end if;
  if exists (select 1 from public.chat_group_bans where group_id = g.id and user_id = v_actor)
     or public._group_user_blocked(g.id, v_actor) then
    return jsonb_build_object('valid', false);
  end if;

  v_status := case
    when public._group_member_role(g.id, v_actor) is not null then 'member'
    when exists (select 1 from public.chat_group_join_requests where group_id = g.id and user_id = v_actor and status = 'pending') then 'requested'
    else 'none'
  end;
  return jsonb_build_object(
    'valid', true,
    'group_id', case when v_status = 'member' then g.id else null end,
    'name', g.name,
    'description', g.description,
    'avatar_url', g.avatar_url,
    'visibility', g.visibility,
    'member_count', g.member_count,
    'member_limit', g.member_limit,
    'my_status', v_status
  );
end;
$$;

-- ============================================================================
-- Ayrılma, çıkarma, rol, sahiplik, silme
-- ============================================================================

-- Gruptan KENDİ isteğiyle ayrılma. Sahip, başka üye varken ayrılamaz (önce devretmeli); tek kişiyse grup kapanır.
create or replace function public.leave_chat_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_role text;
begin
  g := public._group_lock(p_group_id);
  v_role := public._group_member_role(p_group_id, v_actor);
  if v_role is null then
    raise exception 'not_a_member';
  end if;
  if v_role = 'owner' then
    if g.member_count > 1 then
      raise exception 'owner_must_transfer';
    end if;
    perform public._group_audit(p_group_id, g.name, v_actor, v_actor, 'group_deleted', jsonb_build_object('reason', 'last_member_left'));
  else
    perform public._group_audit(p_group_id, g.name, v_actor, v_actor, 'member_left');
  end if;
  delete from public.conversation_members where conversation_id = p_group_id and user_id = v_actor;
end;
$$;

-- Üyeyi çıkarma. Yetki: owner → herkes (kendisi hariç); admin → moderatör ve üye; moderatör → yalnız üye.
-- `p_ban`: yalnız owner/admin; kişi yeniden katılamaz/başvuramaz/davet edilemez (unban_chat_group_member'a dek).
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
  v_actor_role := public._group_require_role(p_group_id, v_actor, array['owner', 'admin', 'moderator']);
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
  if p_ban and v_actor_role not in ('owner', 'admin') then
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
  perform public._group_require_role(p_group_id, v_actor, array['owner', 'admin']);
  delete from public.chat_group_bans where group_id = p_group_id and user_id = p_user_id;
  if not found then
    raise exception 'not_banned';
  end if;
  perform public._group_audit(p_group_id, g.name, v_actor, p_user_id, 'member_unbanned');
end;
$$;

-- Rol atama. owner → admin/moderator/member (sahip hariç herkese); admin → yalnız moderator/member ve yalnız
-- şu an moderatör/üye olanlara (başka yöneticiye ve sahibe dokunamaz); moderator/member yapamaz.
-- 'owner' rolü buradan verilemez: sahiplik yalnız transfer_chat_group_ownership ile devredilir.
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
  v_actor_role := public._group_require_role(p_group_id, v_actor, array['owner', 'admin']);
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

create or replace function public.transfer_chat_group_ownership(p_group_id uuid, p_user_id uuid)
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
  perform public._group_require_role(p_group_id, v_actor, array['owner']);
  if p_user_id = v_actor then
    raise exception 'cannot_target_self';
  end if;
  if public._group_member_role(p_group_id, p_user_id) is null then
    raise exception 'not_a_member';
  end if;
  -- Tek sahip kuralı (kısmi benzersiz indeks) gereği önce eski sahip indirilir.
  update public.conversation_members set role = 'admin' where conversation_id = p_group_id and user_id = v_actor;
  update public.conversation_members set role = 'owner' where conversation_id = p_group_id and user_id = p_user_id;
  perform public._group_audit(p_group_id, g.name, v_actor, p_user_id, 'ownership_transferred');
  perform public._group_notify(
    p_user_id, v_actor, p_group_id,
    'Sana "' || public.truncate_preview(g.name, 60) || '" grubunun sahipliğini devretti.',
    '/messages/local?id=' || p_group_id,
    'grpowner:' || p_group_id || ':' || p_user_id || ':' || extract(epoch from clock_timestamp())::bigint
  );
end;
$$;

-- Grubu SİLME (yalnız owner): üyelikler, mesajlar, istekler, davetler, bağlantılar cascade ile gider;
-- denetim kaydı kalır. Üyeden ayrılma / çıkarılma / engelleme / silme birbirinden ayrı işlemlerdir.
create or replace function public.delete_chat_group(p_group_id uuid)
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
  perform public._group_require_role(p_group_id, v_actor, array['owner']);
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'group_deleted', jsonb_build_object('reason', 'owner_deleted', 'member_count', g.member_count));
  -- Sahip-çıkış tetikleyicisi bu silmede devralma denemesin.
  perform set_config('app.deleting_group', p_group_id::text, true);
  delete from public.notifications where target_href like '%/messages/local?id=' || p_group_id || '%';
  delete from public.conversations where id = p_group_id;
end;
$$;

-- Yönetici mesajı silme (owner/admin/moderator): yalnızca daha DÜŞÜK rütbedeki üyenin mesajı; içerik herkes için
-- temizlenir (gönderenin "herkesten sil" ile yaptığı aynı iş), satır kalır, denetim kaydı düşer.
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
  v_actor_role := public._group_require_role(m.conversation_id, v_actor, array['owner', 'admin', 'moderator']);
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

-- ============================================================================
-- Okuma RPC'leri
-- ============================================================================

-- Keşif: YALNIZ herkese açık gruplar. Çağıranın yasaklı olduğu ve sahibiyle engel ilişkisi olan gruplar listelenmez.
-- Kapalı grupların adı/açıklaması/üyesi hiçbir koşulda bu listeye girmez. Sayfalama: limit (≤ 50) + offset (≤ 2000).
create or replace function public.discover_chat_groups(
  p_query text default null,
  p_sort text default 'popular',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, member_count integer, member_limit integer,
  created_at timestamptz, last_message_at timestamptz, my_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(btrim(left(coalesce(p_query, ''), 100)), '') as term
  )
  select g.id, g.name, g.description, g.avatar_url, g.member_count, g.member_limit, g.created_at, c.last_message_at,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end as my_status
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    cross join q
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where auth.uid() is not null
     and g.visibility = 'public'
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       q.term is null
       or g.name ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or g.description ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by
     case when p_sort = 'newest' then extract(epoch from g.created_at) end desc nulls last,
     case when p_sort = 'active' then extract(epoch from c.last_message_at) end desc nulls last,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- Üye listesi (yalnız grubun üyeleri görür): rol sırası, sonra katılma zamanı. Arama + sayfalama.
create or replace function public.chat_group_members(
  p_group_id uuid,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, m.role, m.joined_at
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = p_group_id
     and exists (select 1 from public.conversation_members me where me.conversation_id = p_group_id and me.user_id = auth.uid())
     and (
       nullif(btrim(coalesce(p_search, '')), '') is null
       or p.username ilike '%' || replace(replace(replace(btrim(left(p_search, 60)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or p.display_name ilike '%' || replace(replace(replace(btrim(left(p_search, 60)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by public.chat_group_role_rank(m.role) desc, m.joined_at, p.id
   limit greatest(least(coalesce(p_limit, 50), 100), 1)
   offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Sohbet listesi önizlemesi: her konuşmanın, ÇAĞIRANIN görebileceği (kendi `cleared_at`'inden sonraki, RLS'e uyan)
-- en son mesajı. Eski istemci tüm mesajları çekip JS'te ayıklıyordu; grup sohbetleriyle bu büyüyemezdi.
-- SECURITY INVOKER: mesaj okuma politikası (üyelik, grupta katılma zamanı, engel) aynen uygulanır.
create or replace function public.conversation_last_messages(p_conversation_ids uuid[])
returns table (
  conversation_id uuid, sender_id uuid, body text, shared_prompt_id uuid, shared_request_id uuid,
  attachments jsonb, deleted_at timestamptz, created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select m.conversation_id, m.sender_id, m.body, m.shared_prompt_id, m.shared_request_id, m.attachments, m.deleted_at, m.created_at
    from unnest(p_conversation_ids[1:500]) as cid
    join public.conversation_members cm on cm.conversation_id = cid and cm.user_id = auth.uid()
   cross join lateral (
     select * from public.messages mm
      where mm.conversation_id = cid
        and (cm.cleared_at is null or mm.created_at > cm.cleared_at)
      order by mm.created_at desc
      limit 1
   ) m;
$$;

-- ============================================================================
-- EXECUTE yetkileri: yalnızca oturumlu kullanıcı
-- ============================================================================

revoke execute on function public.create_chat_group(text, text, text, text, integer, uuid[]) from public, anon;
revoke execute on function public.update_chat_group(uuid, jsonb) from public, anon;
revoke execute on function public.set_chat_group_visibility(uuid, text) from public, anon;
revoke execute on function public.join_chat_group(uuid) from public, anon;
revoke execute on function public.join_chat_group_via_link(text, text) from public, anon;
revoke execute on function public.cancel_chat_group_join_request(uuid) from public, anon;
revoke execute on function public.decide_chat_group_join_request(uuid, boolean) from public, anon;
revoke execute on function public.invite_to_chat_group(uuid, uuid[]) from public, anon;
revoke execute on function public.cancel_chat_group_invitation(uuid) from public, anon;
revoke execute on function public.respond_chat_group_invitation(uuid, boolean) from public, anon;
revoke execute on function public.create_chat_group_link(uuid, integer, integer) from public, anon;
revoke execute on function public.revoke_chat_group_link(uuid) from public, anon;
revoke execute on function public.preview_chat_group_link(text) from public, anon;
revoke execute on function public.leave_chat_group(uuid) from public, anon;
revoke execute on function public.remove_chat_group_member(uuid, uuid, boolean, text) from public, anon;
revoke execute on function public.unban_chat_group_member(uuid, uuid) from public, anon;
revoke execute on function public.set_chat_group_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.transfer_chat_group_ownership(uuid, uuid) from public, anon;
revoke execute on function public.delete_chat_group(uuid) from public, anon;
revoke execute on function public.moderate_chat_group_message(uuid) from public, anon;
revoke execute on function public.discover_chat_groups(text, text, integer, integer) from public, anon;
revoke execute on function public.chat_group_members(uuid, text, integer, integer) from public, anon;
revoke execute on function public.chat_group_role_rank(text) from public, anon;
revoke execute on function public.conversation_last_messages(uuid[]) from public, anon;

grant execute on function public.create_chat_group(text, text, text, text, integer, uuid[]) to authenticated;
grant execute on function public.update_chat_group(uuid, jsonb) to authenticated;
grant execute on function public.set_chat_group_visibility(uuid, text) to authenticated;
grant execute on function public.join_chat_group(uuid) to authenticated;
grant execute on function public.join_chat_group_via_link(text, text) to authenticated;
grant execute on function public.cancel_chat_group_join_request(uuid) to authenticated;
grant execute on function public.decide_chat_group_join_request(uuid, boolean) to authenticated;
grant execute on function public.invite_to_chat_group(uuid, uuid[]) to authenticated;
grant execute on function public.cancel_chat_group_invitation(uuid) to authenticated;
grant execute on function public.respond_chat_group_invitation(uuid, boolean) to authenticated;
grant execute on function public.create_chat_group_link(uuid, integer, integer) to authenticated;
grant execute on function public.revoke_chat_group_link(uuid) to authenticated;
grant execute on function public.preview_chat_group_link(text) to authenticated;
grant execute on function public.leave_chat_group(uuid) to authenticated;
grant execute on function public.remove_chat_group_member(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.unban_chat_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_chat_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_chat_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.delete_chat_group(uuid) to authenticated;
grant execute on function public.moderate_chat_group_message(uuid) to authenticated;
grant execute on function public.discover_chat_groups(text, text, integer, integer) to authenticated;
grant execute on function public.chat_group_members(uuid, text, integer, integer) to authenticated;
grant execute on function public.chat_group_role_rank(text) to authenticated;
grant execute on function public.conversation_last_messages(uuid[]) to authenticated;
