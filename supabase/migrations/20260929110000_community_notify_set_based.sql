-- Topluluk bildirimleri: üyeler üzerinde döngü yerine TEK toplu insert (docs/history/258-*).
--
-- Neden: duyuru, etkinlik, kural değişikliği, topluluğu kapatma ve yeniden açma her üye için `_community_notify` çağıran bir döngüydü
-- (üye başına 2-3 sorgu + 1 insert). 100 000 üyeli bir toplulukta işlem sorgu zaman aşımını (authenticated 8 sn) aşar ve duyuru hiç yayınlanmaz.
-- Şimdi: `_community_notify_members` aynı sınıf kurallarını (direct / important / info) tek `insert … select` içinde uygular.
--
-- Bilinçli sınır: bir olay en çok `p_max` (varsayılan 20 000) üyeye bildirim yazar; bundan büyük toplulukta sohbette en yakın zamanda
-- okuma yapan (last_read_at) üyeler öncelikli olur. Duyuru/etkinlik topluluk sayfasında herkese görünür kalır; yalnız bildirim sınırlıdır.
-- Yalnızca ekleyici/değiştirici: yeni fonksiyon + beş fonksiyonun `create or replace`'i (aynı imza), `drop` yok.

create or replace function public._community_notify_members(
  p_group_id uuid, p_actor uuid, p_class text, p_message text, p_href text,
  p_dedupe_prefix text, p_dedupe_suffix text default '', p_max integer default 20000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with targets as (
    select m.user_id
      from public.conversation_members m
     where m.conversation_id = p_group_id
       and m.user_id <> p_actor
       and (
         p_class = 'direct'
         or (p_class = 'important' and not (m.notify_muted_until is not null and m.notify_muted_until > now()) and m.notify_level <> 'none')
         or (p_class = 'info' and not (m.notify_muted_until is not null and m.notify_muted_until > now()) and m.notify_level = 'all' and m.muted_at is null)
       )
     order by m.last_read_at desc nulls last, m.user_id
     limit greatest(p_max, 0)
  ), ins as (
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    select t.user_id, p_actor, 'system', p_message, p_href, p_dedupe_prefix || t.user_id::text || p_dedupe_suffix
      from targets t
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

revoke execute on function public._community_notify_members(uuid, uuid, text, text, text, text, text, integer) from public, anon, authenticated;

create or replace function public.update_community(p_group_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_category text;
  v_feed text;
  v_rules text;
  v_required boolean;
  v_version integer;
  v_changed text[] := '{}';
  v_key text;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('category', 'feed_policy', 'rules', 'rules_required') then
      raise exception 'invalid_patch';
    end if;
  end loop;
  if public._group_member_role(p_group_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  v_category := g.category; v_feed := g.feed_policy; v_rules := g.rules; v_required := g.rules_required; v_version := g.rules_version;

  if p_patch ? 'category' or p_patch ? 'feed_policy' then
    perform public._group_require_cap(p_group_id, v_actor, 'edit_settings');
  end if;
  if p_patch ? 'rules' or p_patch ? 'rules_required' then
    perform public._group_require_cap(p_group_id, v_actor, 'edit_rules');
  end if;

  if p_patch ? 'category' then
    if jsonb_typeof(p_patch -> 'category') <> 'string' or not public._community_valid_category(p_patch ->> 'category') then
      raise exception 'invalid_category';
    end if;
    v_category := p_patch ->> 'category';
    if v_category <> g.category then v_changed := array_append(v_changed, 'category'); end if;
  end if;
  if p_patch ? 'feed_policy' then
    if jsonb_typeof(p_patch -> 'feed_policy') <> 'string' or (p_patch ->> 'feed_policy') not in ('members', 'admins') then
      raise exception 'invalid_feed_policy';
    end if;
    v_feed := p_patch ->> 'feed_policy';
    if v_feed <> g.feed_policy then v_changed := array_append(v_changed, 'feed_policy'); end if;
  end if;
  if p_patch ? 'rules' then
    if jsonb_typeof(p_patch -> 'rules') not in ('string', 'null') then
      raise exception 'invalid_rules';
    end if;
    v_rules := nullif(btrim(coalesce(p_patch ->> 'rules', '')), '');
    if v_rules is not null and char_length(v_rules) > 5000 then
      raise exception 'invalid_rules';
    end if;
    if v_rules is distinct from g.rules then
      v_changed := array_append(v_changed, 'rules');
      v_version := g.rules_version + 1;
    end if;
  end if;
  if p_patch ? 'rules_required' then
    if jsonb_typeof(p_patch -> 'rules_required') <> 'boolean' then
      raise exception 'invalid_patch';
    end if;
    v_required := (p_patch ->> 'rules_required')::boolean;
    if v_required <> g.rules_required then v_changed := array_append(v_changed, 'rules_required'); end if;
  end if;
  if v_required and v_rules is null then
    raise exception 'rules_missing';
  end if;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('changed', false);
  end if;

  update public.chat_groups
     set category = v_category, feed_policy = v_feed, rules = v_rules, rules_required = v_required, rules_version = v_version
   where id = p_group_id;
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'community_updated',
    jsonb_build_object('changed', to_jsonb(v_changed), 'rules_version', v_version));

  -- Kural metni değişti ve kabul zorunluysa üyeler haberdar edilir (önemli düzey; yeniden kabul beklenir, üyelik düşmez).
  if 'rules' = any (v_changed) and v_required then
    perform public._community_notify_members(p_group_id, v_actor, 'important',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğunun kuralları güncellendi.',
      '/communities/local?id=' || p_group_id || '&tab=about',
      'crules:' || p_group_id || ':' || v_version || ':', '');
  end if;
  return jsonb_build_object('changed', true, 'changed_fields', to_jsonb(v_changed), 'rules_version', v_version);
end;
$$;

create or replace function public.close_community(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_role(p_group_id, v_actor, array['owner']);
  if g.closed_at is not null then
    return;
  end if;
  update public.chat_groups set closed_at = now(), closed_by = v_actor where id = p_group_id;
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'community_closed');
  perform public._community_notify_members(p_group_id, v_actor, 'direct',
    '"' || public.truncate_preview(g.name, 60) || '" topluluğu kapatıldı.',
    '/communities/local?id=' || p_group_id,
    'cclose:' || p_group_id || ':', ':' || extract(epoch from clock_timestamp())::bigint);
end;
$$;

create or replace function public.reopen_community(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_role(p_group_id, v_actor, array['owner']);
  if g.closed_at is null then
    return;
  end if;
  update public.chat_groups set closed_at = null, closed_by = null where id = p_group_id;
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'community_reopened');
  perform public._community_notify_members(p_group_id, v_actor, 'direct',
    '"' || public.truncate_preview(g.name, 60) || '" topluluğu yeniden açıldı.',
    '/communities/local?id=' || p_group_id,
    'copen:' || p_group_id || ':', ':' || extract(epoch from clock_timestamp())::bigint);
end;
$$;

create or replace function public.publish_community_announcement(
  p_group_id uuid, p_title text, p_body text, p_pinned boolean default false, p_notify boolean default true, p_post_to_chat boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid := gen_random_uuid();
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'manage_announcements');
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_body';
  end if;
  if (select count(*) from public.community_announcements where community_id = p_group_id) >= 500 then
    raise exception 'announcement_limit';
  end if;
  if coalesce(p_pinned, false) and (select count(*) from public.community_announcements where community_id = p_group_id and pinned) >= 3 then
    raise exception 'pin_limit_reached';
  end if;

  insert into public.community_announcements (id, community_id, author_id, title, body, pinned)
  values (v_id, p_group_id, v_actor, v_title, v_body, coalesce(p_pinned, false));
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'announcement_published', jsonb_build_object('announcement_id', v_id));

  -- Sohbette bağlantılı duyuru: mesaj, çağıranın adına bir kez eklenir (mesajın gövdesi başlıktır; istemci kartı çizer).
  if coalesce(p_post_to_chat, false) then
    insert into public.messages (conversation_id, sender_id, body, announcement_id)
    values (p_group_id, v_actor, v_title, v_id);
  end if;

  if coalesce(p_notify, true) then
    perform public._community_notify_members(p_group_id, v_actor, 'important',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğunda yeni duyuru: "' || public.truncate_preview(v_title, 80) || '"',
      '/communities/local?id=' || p_group_id || '&tab=overview',
      'cann:' || v_id || ':', '');
  end if;
  return v_id;
end;
$$;

create or replace function public.create_community_event(
  p_group_id uuid, p_title text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_timezone text default 'UTC', p_location text default null, p_online_url text default null, p_notify boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_url text := nullif(btrim(coalesce(p_online_url, '')), '');
  v_id uuid := gen_random_uuid();
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'manage_events');
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;
  if v_description is not null and char_length(v_description) > 2000 then
    raise exception 'invalid_body';
  end if;
  if p_starts_at is null or p_starts_at <= now() or (p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception 'invalid_event_time';
  end if;
  perform public._community_event_fields_ok(p_timezone, v_location, v_url);
  if (select count(*) from public.community_events where community_id = p_group_id and status = 'scheduled' and starts_at > now()) >= 100 then
    raise exception 'event_limit';
  end if;

  insert into public.community_events (id, community_id, created_by, title, description, starts_at, ends_at, timezone, location, online_url)
  values (v_id, p_group_id, v_actor, v_title, v_description, p_starts_at, p_ends_at, p_timezone, v_location, v_url);
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'event_created', jsonb_build_object('event_id', v_id));

  if coalesce(p_notify, true) then
    perform public._community_notify_members(p_group_id, v_actor, 'info',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğunda yeni etkinlik: "' || public.truncate_preview(v_title, 80) || '"',
      '/communities/local?id=' || p_group_id || '&tab=events',
      'cevt:' || v_id || ':', '');
  end if;
  return v_id;
end;
$$;
