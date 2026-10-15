-- Topluluklar — YAZMA YOLU (SECURITY DEFINER RPC'ler) (docs/history/175-*). Şema: 20260920040000_communities_schema.sql.
--
-- Ortak kurallar (172'deki grup RPC'leriyle AYNI):
--   * Kimlik DAİMA auth.uid()'den gelir (`_group_actor`); istemcinin verdiği rol/sahip/yazar bilgisine güvenilmez.
--   * Yazan her fonksiyon önce topluluk satırını `for update` kilitler (`_group_lock`) → grup başına sıralı, yarış yok.
--   * Yetki rol adına değil YETENEĞE bağlıdır (`_group_can` / `_group_require_cap`); owner her zaman yapar.
--   * Hata ifadeleri makine kodudur; istemci çevirir. search_path sabit; EXECUTE yalnız `authenticated`.
--   * Bildirimler yalnızca işlem başarılıysa, aynı işlemde üretilir; `dedupe_key` ile tekrar önlenir; üye tercihine saygı
--     gösterir (`_community_notify`). Mesaj başına bildirim YOKTUR (yalnız @anma ve duyuru).
-- Yalnızca ekleyici / aynı imzayla `create or replace`; hiçbir şey düşürülmez.

-- ============================================================================
-- 1. Yetenekler (admin/moderatör) — mevcut matrise topluluk yetenekleri eklenir
-- ============================================================================

create or replace function public._group_all_capabilities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['edit_settings', 'change_visibility', 'manage_invites', 'manage_requests', 'remove_members', 'ban_members',
               'manage_roles', 'delete_messages', 'pin_messages',
               'moderate_posts', 'pin_posts', 'manage_announcements', 'manage_events', 'edit_rules', 'view_stats'];
$$;

-- Varsayılanlar: admin hepsi; moderatör = içerik/mesaj moderasyonu + sabitleme + (172'deki) başvuru/çıkarma. Moderatör
-- duyuru/etkinlik/kural/istatistik/ayar yönetmez. Saklı jsonb'da eksik anahtar bu varsayılana düşer (`_group_can`).
create or replace function public._group_default_permissions()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'admin', jsonb_build_object('edit_settings', true, 'change_visibility', true, 'manage_invites', true, 'manage_requests', true,
                                'remove_members', true, 'ban_members', true, 'manage_roles', true, 'delete_messages', true, 'pin_messages', true,
                                'moderate_posts', true, 'pin_posts', true, 'manage_announcements', true, 'manage_events', true,
                                'edit_rules', true, 'view_stats', true),
    'moderator', jsonb_build_object('edit_settings', false, 'change_visibility', false, 'manage_invites', false, 'manage_requests', true,
                                    'remove_members', true, 'ban_members', false, 'manage_roles', false, 'delete_messages', true, 'pin_messages', true,
                                    'moderate_posts', true, 'pin_posts', true, 'manage_announcements', false, 'manage_events', false,
                                    'edit_rules', false, 'view_stats', false)
  );
$$;

-- Owner ayarları: 010000'daki fonksiyonun aynısı; tek fark yetenek beyaz listesinin `_group_all_capabilities()`'ten gelmesi.
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
  v_pin boolean;
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
  v_pin := g.members_can_pin;
  v_perms := g.role_permissions;

  if p_patch ? 'history_visible' then
    if jsonb_typeof(p_patch -> 'history_visible') <> 'boolean' then raise exception 'invalid_patch'; end if;
    v_history := (p_patch ->> 'history_visible')::boolean;
    if v_history <> g.history_visible then v_changed := array_append(v_changed, 'history_visible'); end if;
  end if;

  if p_patch ? 'members_can_pin' then
    if jsonb_typeof(p_patch -> 'members_can_pin') <> 'boolean' then raise exception 'invalid_patch'; end if;
    v_pin := (p_patch ->> 'members_can_pin')::boolean;
    if v_pin <> g.members_can_pin then v_changed := array_append(v_changed, 'members_can_pin'); end if;
  end if;

  if p_patch ? 'role_permissions' then
    if jsonb_typeof(p_patch -> 'role_permissions') <> 'object' then raise exception 'invalid_patch'; end if;
    for v_role in select jsonb_object_keys(p_patch -> 'role_permissions') loop
      if v_role not in ('admin', 'moderator') or jsonb_typeof(p_patch -> 'role_permissions' -> v_role) <> 'object' then
        raise exception 'invalid_patch';
      end if;
      for v_cap, v_val in select key, value from jsonb_each(p_patch -> 'role_permissions' -> v_role) loop
        if not (v_cap = any (public._group_all_capabilities())) or jsonb_typeof(v_val) <> 'boolean' then
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

  update public.chat_groups set history_visible = v_history, members_can_pin = v_pin, role_permissions = v_perms where id = p_group_id;
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

-- ============================================================================
-- 2. Bildirim tercihleri ve topluluk bildirimi
-- ============================================================================

-- Üyenin etkin bildirim düzeyi: süreli sessize alma sürüyorsa 'none', değilse saklı tercih. Üye değilse null.
create or replace function public._community_notify_level(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when m.notify_muted_until is not null and m.notify_muted_until > now() then 'none' else m.notify_level end
    from public.conversation_members m
   where m.conversation_id = p_group_id and m.user_id = p_user_id;
$$;

-- 172'deki bilgi düzeyi bildirimler (`p_respect_mute = true`) artık yeni tercihe de uyar: yalnızca 'all' düzeyindeki üyeye gider.
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
     where conversation_id = p_group_id and user_id = p_recipient
       and (muted_at is not null or public._community_notify_level(p_group_id, p_recipient) <> 'all')
  ) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (p_recipient, p_actor, 'system', p_message, p_href, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- Sınıflı topluluk bildirimi:
--   'direct'    → kişiyi doğrudan ilgilendirir (davet, kendi isteğinin sonucu, çıkarılma, kendi gönderisine karar, rapor sonucu): her zaman.
--   'important' → duyuru, @anma, etkinlik hatırlatma/değişiklik, kural güncellemesi: 'all' ve 'important' düzeyi; 'none' almaz.
--   'info'      → yeni üye, yeni etkinlik: yalnız 'all' (ve sohbeti sessize almamış).
-- Yalnızca ÜYEYE gider (`direct` hariç); yetkisiz içerik taşımaz: çağıranlar yalnız başlık/ad gibi üyenin zaten görebildiği metni yazar.
create or replace function public._community_notify(
  p_recipient uuid, p_actor uuid, p_group_id uuid, p_class text, p_message text, p_href text, p_dedupe text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level text;
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  if p_class <> 'direct' then
    v_level := public._community_notify_level(p_group_id, p_recipient);
    if v_level is null then
      return;
    end if;
    if p_class = 'important' and v_level = 'none' then
      return;
    end if;
    if p_class = 'info' and (v_level <> 'all' or exists (
      select 1 from public.conversation_members where conversation_id = p_group_id and user_id = p_recipient and muted_at is not null
    )) then
      return;
    end if;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (p_recipient, p_actor, 'system', p_message, p_href, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- ============================================================================
-- 3. Üyelik kapıları: kapatılmış topluluk ve kuralların kabulü
-- ============================================================================

-- 172'deki `_group_add_member` + iki yeni kapı:
--   * kapatılmış topluluğa kimse eklenemez (`community_closed`);
--   * kuralları kabul zorunluysa, KENDİ katılımı (herkese açık katılım, davet kabulü) güncel sürümün kabulüne bağlıdır
--     (`rules_not_accepted`). Başvuru yolunda kabul başvuru anında zorunlu kılınır (tetikleyici); yönetici kabulünde yeniden
--     sorulmaz (kural sonradan zorunlu kılındıysa kişi üye olur ve "kuralları kabul et" uyarısı görür — docs/history/175-*).
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
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.member_count >= g.member_limit then
    raise exception 'member_limit_reached';
  end if;
  if g.rules_required and auth.uid() is not null and auth.uid() = p_user_id and not exists (
    select 1 from public.community_rule_acceptances a
     where a.community_id = p_group_id and a.user_id = p_user_id and a.rules_version >= g.rules_version
  ) then
    raise exception 'rules_not_accepted';
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

-- Kapatılmış (salt-okunur) toplulukta sohbete yazılamaz; diğer kurallar 172'deki gibidir.
create or replace function public.can_send_message(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.kind = 'group' then
      exists (
        select 1
          from public.conversation_members m
          join public.chat_groups g on g.id = m.conversation_id
         where m.conversation_id = p_conversation_id
           and m.user_id = auth.uid()
           and g.closed_at is null
           and (g.posting_policy = 'members' or m.role in ('owner', 'admin', 'moderator'))
      )
    else
      exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation_id and m.user_id = auth.uid())
      and not exists (
        select 1 from public.conversation_members other_member
         where other_member.conversation_id = p_conversation_id
           and other_member.user_id <> auth.uid()
           and public.is_blocked(auth.uid(), other_member.user_id)
      )
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

create or replace function public._community_record_acceptance(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
begin
  select rules_version into v_version from public.chat_groups where id = p_group_id and rules_required;
  if v_version is null then
    return;
  end if;
  insert into public.community_rule_acceptances (community_id, user_id, rules_version)
  values (p_group_id, p_user_id, v_version)
  on conflict (community_id, user_id) do update set rules_version = excluded.rules_version, accepted_at = now()
    where public.community_rule_acceptances.rules_version < excluded.rules_version;
end;
$$;

-- ============================================================================
-- 4. Oluşturma, ayarlar, kapatma
-- ============================================================================

create or replace function public._community_valid_category(p_category text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_category in ('general', 'image', 'text', 'audio', 'video', 'workflow', 'learning', 'showcase');
$$;

-- Topluluk oluşturma: `create_chat_group` (grup sohbeti + sahip + ilk davetler) + topluluk alanları, tek işlemde.
-- Mesajlar bölümü artık bağımsız grup oluşturmaz; bu RPC (ve 172'deki `create_chat_group`, aynı çekirdek) her zaman topluluk üretir.
create or replace function public.create_community(
  p_name text,
  p_description text default null,
  p_visibility text default 'private',
  p_avatar_url text default null,
  p_member_limit integer default 256,
  p_invite_user_ids uuid[] default '{}',
  p_category text default 'general',
  p_posting_policy text default 'members',
  p_feed_policy text default 'members',
  p_rules text default null,
  p_rules_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_rules text := nullif(btrim(coalesce(p_rules, '')), '');
  v_result jsonb;
  v_id uuid;
begin
  if not public._community_valid_category(p_category) then
    raise exception 'invalid_category';
  end if;
  if p_posting_policy not in ('members', 'admins') then
    raise exception 'invalid_posting_policy';
  end if;
  if p_feed_policy not in ('members', 'admins') then
    raise exception 'invalid_feed_policy';
  end if;
  if v_rules is not null and char_length(v_rules) > 5000 then
    raise exception 'invalid_rules';
  end if;
  if coalesce(p_rules_required, false) and v_rules is null then
    raise exception 'rules_missing';
  end if;

  v_result := public.create_chat_group(p_name, p_description, p_visibility, p_avatar_url, p_member_limit, p_invite_user_ids);
  v_id := (v_result ->> 'group_id')::uuid;

  update public.chat_groups
     set category = p_category, posting_policy = p_posting_policy, feed_policy = p_feed_policy,
         rules = v_rules, rules_required = coalesce(p_rules_required, false)
   where id = v_id;
  -- Sahip kendi kurallarını zaten kabul etmiş sayılır.
  perform public._community_record_acceptance(v_id, v_actor);
  perform public._group_audit(v_id, btrim(p_name), v_actor, null, 'community_created',
    jsonb_build_object('category', p_category, 'visibility', p_visibility));
  return v_result;
end;
$$;

-- 172'deki geri uyumlu giriş: eskiden "grup" oluşturan çağrı artık varsayılan alanlarla TOPLULUK oluşturur
-- (bağımsız grup kavramı kalmadı). Davranışı değiştirmemek için imza ve dönüş aynı; tek fark `origin = 'native'` (varsayılan).

-- Topluluk ayarları (yama): category, feed_policy (→ `edit_settings`), rules, rules_required (→ `edit_rules`).
-- Ad/açıklama/görsel/üye sınırı/sohbet yazma izni `update_chat_group`, görünürlük `set_chat_group_visibility` ile sürer.
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
    for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
      perform public._community_notify(
        v_member.user_id, v_actor, p_group_id, 'important',
        '"' || public.truncate_preview(g.name, 60) || '" topluluğunun kuralları güncellendi.',
        '/communities/local?id=' || p_group_id || '&tab=about',
        'crules:' || p_group_id || ':' || v_version || ':' || v_member.user_id
      );
    end loop;
  end if;
  return jsonb_build_object('changed', true, 'changed_fields', to_jsonb(v_changed), 'rules_version', v_version);
end;
$$;

-- Üyenin (zaten üyeyse) güncel kural sürümünü kabulü.
create or replace function public.accept_community_rules(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
begin
  if public._group_member_role(p_group_id, v_actor) is null then
    raise exception 'not_a_member';
  end if;
  perform public._community_record_acceptance(p_group_id, v_actor);
end;
$$;

-- Topluluğu kapatma / yeniden açma (yalnız owner): kapalı topluluk salt-okunurdur — yeni üye, gönderi, etkinlik ve sohbet mesajı
-- olmaz; keşiften çıkar; hiçbir veri silinmez. "Silme" ayrıdır (`delete_chat_group`).
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
  for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
    perform public._community_notify(
      v_member.user_id, v_actor, p_group_id, 'direct',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğu kapatıldı.',
      '/communities/local?id=' || p_group_id,
      'cclose:' || p_group_id || ':' || v_member.user_id || ':' || extract(epoch from clock_timestamp())::bigint
    );
  end loop;
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
  for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
    perform public._community_notify(
      v_member.user_id, v_actor, p_group_id, 'direct',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğu yeniden açıldı.',
      '/communities/local?id=' || p_group_id,
      'cclose:' || p_group_id || ':' || v_member.user_id || ':' || extract(epoch from clock_timestamp())::bigint
    );
  end loop;
end;
$$;

-- ============================================================================
-- 5. Kural kabulüyle katılım sarmalayıcıları (172'deki RPC'ler değişmez; kabul kaydı aynı işlemde yapılır)
-- ============================================================================

create or replace function public.join_community(p_group_id uuid, p_accept_rules boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
begin
  if coalesce(p_accept_rules, false) and exists (
    select 1 from public.chat_groups where id = p_group_id and visibility = 'public'
  ) then
    perform public._community_record_acceptance(p_group_id, v_actor);
  end if;
  return public.join_chat_group(p_group_id);
end;
$$;

create or replace function public.respond_community_invitation(p_invitation_id uuid, p_accept boolean, p_accept_rules boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group uuid;
begin
  if p_accept and coalesce(p_accept_rules, false) then
    select group_id into v_group from public.chat_group_invitations where id = p_invitation_id and invitee_id = v_actor and status = 'pending';
    if v_group is not null then
      perform public._community_record_acceptance(v_group, v_actor);
    end if;
  end if;
  return public.respond_chat_group_invitation(p_invitation_id, p_accept);
end;
$$;

create or replace function public.join_community_via_link(p_token text, p_message text default null, p_accept_rules boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_group uuid;
begin
  if coalesce(p_accept_rules, false) and p_token ~ '^[A-Za-z0-9_-]{20,100}$' then
    select group_id into v_group from public.chat_group_links
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and revoked_at is null and expires_at > now() and (max_uses is null or use_count < max_uses);
    if v_group is not null then
      perform public._community_record_acceptance(v_group, v_actor);
    end if;
  end if;
  return public.join_chat_group_via_link(p_token, p_message);
end;
$$;

-- Bağlantı önizlemesi + topluluk alanları (kurallar katılmadan ÖNCE görülebilir: bağlantıya sahip olmak yeterli).
create or replace function public.preview_community_link(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_preview jsonb := public.preview_chat_group_link(p_token);
  v_group public.chat_groups;
begin
  if coalesce((v_preview ->> 'valid')::boolean, false) is not true then
    return v_preview;
  end if;
  select g.* into v_group
    from public.chat_group_links l
    join public.chat_groups g on g.id = l.group_id
   where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('valid', false);
  end if;
  return v_preview || jsonb_build_object(
    'category', v_group.category,
    'rules', v_group.rules,
    'rules_required', v_group.rules_required,
    'closed', v_group.closed_at is not null,
    'post_count', v_group.post_count
  );
end;
$$;

-- Topluluk yer imi (kullanıcıya özel tek tercih): yalnız okunabilir (herkese açık/üyesi olunan) topluluklar; ≤ 200.
create or replace function public.set_community_bookmark(p_group_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
begin
  if not p_on then
    delete from public.community_bookmarks where user_id = v_actor and community_id = p_group_id;
    return;
  end if;
  if not public.can_read_community(p_group_id) then
    raise exception 'group_not_found';
  end if;
  if exists (select 1 from public.community_bookmarks where user_id = v_actor and community_id = p_group_id) then
    return;
  end if;
  if (select count(*) from public.community_bookmarks where user_id = v_actor) >= 200 then
    raise exception 'bookmark_limit';
  end if;
  insert into public.community_bookmarks (user_id, community_id) values (v_actor, p_group_id) on conflict do nothing;
end;
$$;

-- ============================================================================
-- 6. Gönderiler (topluluk içerik akışı)
-- ============================================================================

-- İçeriğin sahibi ve "toplulukta paylaşılabilir mi" bilgisi. Paylaşılabilir = herkese AÇIK + yayında. Özel/taslak/silinmiş içerik
-- toplulukta paylaşım yoluyla herkese açılmaz: önce sahibi içeriği bilinçli olarak herkese açık yapmalıdır.
create or replace function public._community_content_info(p_type text, p_id uuid)
returns table (owner_id uuid, shareable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'prompt' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public' and x.deleted_at is null) from public.prompts x where x.id = p_id;
  elsif p_type = 'request' then
    return query select x.author_id, (not x.is_draft and x.visibility = 'public' and x.deleted_at is null) from public.prompt_requests x where x.id = p_id;
  elsif p_type = 'workflow' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public') from public.workflows x where x.id = p_id;
  elsif p_type = 'preset' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public') from public.presets x where x.id = p_id;
  end if;
end;
$$;

create or replace function public._community_member_rank(p_group_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.chat_group_role_rank(public._group_member_role(p_group_id, p_user_id));
$$;

-- Mevcut bir içeriği toplulukta paylaş. Yetki: aktif üye (+ `feed_policy = 'admins'` ise yönetim kadrosu). Yazar = çağıran;
-- içeriğin orijinal sahibi içerikte kalır. Aynı içerik ikinci kez paylaşılamaz. Başkasının herkese açık içeriği de önerilebilir.
create or replace function public.share_to_community(p_group_id uuid, p_content_type text, p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_role text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
begin
  g := public._group_lock(p_group_id);
  v_role := public._group_member_role(p_group_id, v_actor);
  if v_role is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._community_content_info(p_content_type, p_content_id);
  if not found then
    raise exception 'content_not_found';
  end if;
  if not v_info.shareable then
    -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
    if v_info.owner_id is distinct from v_actor then
      raise exception 'content_not_found';
    end if;
    raise exception 'content_not_public';
  end if;
  if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.community_posts where community_id = p_group_id and author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'post_rate_limit';
  end if;

  begin
    insert into public.community_posts (id, community_id, author_id, content_type, prompt_id, request_id, workflow_id, preset_id, note)
    values (
      v_id, p_group_id, v_actor, p_content_type,
      case when p_content_type = 'prompt' then p_content_id end,
      case when p_content_type = 'request' then p_content_id end,
      case when p_content_type = 'workflow' then p_content_id end,
      case when p_content_type = 'preset' then p_content_id end,
      v_note
    );
  exception when unique_violation then
    raise exception 'already_shared';
  end;
  return v_id;
end;
$$;

-- Yazar kendi gönderisinin notunu düzenler (hâlâ üyeyse).
create or replace function public.update_community_post(p_post_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  perform public._group_lock(p.community_id);
  if p.author_id <> v_actor or public._group_member_role(p.community_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if (select closed_at from public.chat_groups where id = p.community_id) is not null then
    raise exception 'community_closed';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;
  update public.community_posts set note = v_note where id = p_post_id;
end;
$$;

-- Yazar kendi gönderisini topluluktan kaldırır (içerik silinmez; yalnız akıştaki başvuru gider). Üyelikten çıkmış olsa da yapabilir.
create or replace function public.delete_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  perform public._group_lock(p.community_id);
  if p.author_id <> v_actor then
    raise exception 'forbidden';
  end if;
  delete from public.community_posts where id = p_post_id;
end;
$$;

-- Moderasyonla kaldırma: `moderate_posts` yeteneği + rütbe kuralı (yalnız kendinden DÜŞÜK rütbedeki yazarın gönderisi; yazar artık
-- üye değilse rütbesi en düşüktür). Denetim kaydı + yazara doğrudan bildirim; ilgili açık raporlar tetikleyiciyle kapanır.
create or replace function public.moderate_community_post(p_post_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
  g public.chat_groups;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  g := public._group_lock(p.community_id);
  perform public._group_require_cap(p.community_id, v_actor, 'moderate_posts');
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'invalid_reason';
  end if;
  if p.author_id <> v_actor
     and public._community_member_rank(p.community_id, p.author_id) >= public._community_member_rank(p.community_id, v_actor) then
    raise exception 'forbidden';
  end if;
  delete from public.community_posts where id = p_post_id;
  perform public._group_audit(p.community_id, g.name, v_actor, p.author_id, 'post_removed',
    jsonb_build_object('post_id', p.id, 'content_type', p.content_type, 'reason', v_reason));
  if p.author_id <> v_actor then
    perform public._community_notify(
      p.author_id, v_actor, p.community_id, 'direct',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğundaki paylaşımın kaldırıldı.',
      '/communities/local?id=' || p.community_id || '&tab=feed',
      'cpostrm:' || p.id
    );
  end if;
end;
$$;

-- Gönderiyi akışın başına sabitle / kaldır (`pin_posts`); en çok 3 sabit gönderi.
create or replace function public.set_community_post_pinned(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
  g public.chat_groups;
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  g := public._group_lock(p.community_id);
  perform public._group_require_cap(p.community_id, v_actor, 'pin_posts');
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if p_pinned then
    if p.pinned_at is not null then
      return;
    end if;
    if (select count(*) from public.community_posts where community_id = p.community_id and pinned_at is not null) >= 3 then
      raise exception 'pin_limit_reached';
    end if;
    update public.community_posts set pinned_at = now() where id = p_post_id;
    perform public._group_audit(p.community_id, g.name, v_actor, p.author_id, 'post_pinned', jsonb_build_object('post_id', p.id));
  else
    if p.pinned_at is null then
      return;
    end if;
    update public.community_posts set pinned_at = null where id = p_post_id;
    perform public._group_audit(p.community_id, g.name, v_actor, p.author_id, 'post_unpinned', jsonb_build_object('post_id', p.id));
  end if;
end;
$$;

-- ============================================================================
-- 7. Duyurular
-- ============================================================================

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
    for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
      perform public._community_notify(
        v_member.user_id, v_actor, p_group_id, 'important',
        '"' || public.truncate_preview(g.name, 60) || '" topluluğunda yeni duyuru: "' || public.truncate_preview(v_title, 80) || '"',
        '/communities/local?id=' || p_group_id || '&tab=overview',
        'cann:' || v_id || ':' || v_member.user_id
      );
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.update_community_announcement(p_announcement_id uuid, p_title text, p_body text, p_pinned boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  a public.community_announcements;
  g public.chat_groups;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  select * into a from public.community_announcements where id = p_announcement_id;
  if not found then
    raise exception 'announcement_not_found';
  end if;
  g := public._group_lock(a.community_id);
  perform public._group_require_cap(a.community_id, v_actor, 'manage_announcements');
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_body';
  end if;
  if p_pinned is true and not a.pinned
     and (select count(*) from public.community_announcements where community_id = a.community_id and pinned) >= 3 then
    raise exception 'pin_limit_reached';
  end if;
  update public.community_announcements
     set title = v_title, body = v_body, pinned = coalesce(p_pinned, pinned),
         edited_at = case when title <> v_title or body <> v_body then now() else edited_at end
   where id = p_announcement_id;
  -- Sohbetteki bağlantılı mesajın başlığı güncel kalır.
  update public.messages set body = v_title where announcement_id = p_announcement_id and deleted_at is null;
  perform public._group_audit(a.community_id, g.name, v_actor, null, 'announcement_updated', jsonb_build_object('announcement_id', a.id));
end;
$$;

create or replace function public.delete_community_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  a public.community_announcements;
  g public.chat_groups;
begin
  select * into a from public.community_announcements where id = p_announcement_id;
  if not found then
    raise exception 'announcement_not_found';
  end if;
  g := public._group_lock(a.community_id);
  perform public._group_require_cap(a.community_id, v_actor, 'manage_announcements');
  -- Sohbetteki bağlantılı mesaj da "herkesten sil" ile temizlenir (boş kart kalmasın).
  update public.messages set deleted_at = now(), body = null, announcement_id = null
   where announcement_id = p_announcement_id and deleted_at is null;
  delete from public.community_announcements where id = p_announcement_id;
  perform public._group_audit(a.community_id, g.name, v_actor, null, 'announcement_deleted', jsonb_build_object('announcement_id', a.id));
end;
$$;

-- ============================================================================
-- 8. Etkinlikler
-- ============================================================================

create or replace function public._community_event_fields_ok(p_timezone text, p_location text, p_online_url text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;
  if p_location is not null and char_length(p_location) > 200 then
    raise exception 'invalid_location';
  end if;
  if p_online_url is not null and (char_length(p_online_url) > 500 or p_online_url !~* '^https?://[^\s]+$') then
    raise exception 'invalid_url';
  end if;
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
    for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
      perform public._community_notify(
        v_member.user_id, v_actor, p_group_id, 'info',
        '"' || public.truncate_preview(g.name, 60) || '" topluluğunda yeni etkinlik: "' || public.truncate_preview(v_title, 80) || '"',
        '/communities/local?id=' || p_group_id || '&tab=events',
        'cevt:' || v_id || ':' || v_member.user_id
      );
    end loop;
  end if;
  return v_id;
end;
$$;

-- Etkinlik güncelleme (yama): title, description, starts_at, ends_at, timezone, location, online_url. Zamanı/yeri değişirse
-- "geliyorum/belki" diyenlere önemli düzeyde bildirim gider.
create or replace function public.update_community_event(p_event_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  e public.community_events;
  g public.chat_groups;
  v_key text;
  v_title text;
  v_description text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_tz text;
  v_location text;
  v_url text;
  v_logistics_changed boolean := false;
  v_changed boolean := false;
  v_rsvp record;
begin
  select * into e from public.community_events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  g := public._group_lock(e.community_id);
  perform public._group_require_cap(e.community_id, v_actor, 'manage_events');
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if e.status = 'cancelled' then
    raise exception 'event_cancelled';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('title', 'description', 'starts_at', 'ends_at', 'timezone', 'location', 'online_url') then
      raise exception 'invalid_patch';
    end if;
  end loop;
  v_title := e.title; v_description := e.description; v_starts := e.starts_at; v_ends := e.ends_at;
  v_tz := e.timezone; v_location := e.location; v_url := e.online_url;

  if p_patch ? 'title' then v_title := btrim(coalesce(p_patch ->> 'title', '')); end if;
  if p_patch ? 'description' then v_description := nullif(btrim(coalesce(p_patch ->> 'description', '')), ''); end if;
  if p_patch ? 'starts_at' then v_starts := (p_patch ->> 'starts_at')::timestamptz; end if;
  if p_patch ? 'ends_at' then v_ends := (p_patch ->> 'ends_at')::timestamptz; end if;
  if p_patch ? 'timezone' then v_tz := p_patch ->> 'timezone'; end if;
  if p_patch ? 'location' then v_location := nullif(btrim(coalesce(p_patch ->> 'location', '')), ''); end if;
  if p_patch ? 'online_url' then v_url := nullif(btrim(coalesce(p_patch ->> 'online_url', '')), ''); end if;

  if char_length(v_title) < 1 or char_length(v_title) > 120 then raise exception 'invalid_title'; end if;
  if v_description is not null and char_length(v_description) > 2000 then raise exception 'invalid_body'; end if;
  if v_starts is null or (v_ends is not null and v_ends <= v_starts) then raise exception 'invalid_event_time'; end if;
  -- Başlangıç yalnızca değiştiriliyorsa geleceğe kısıtlanır (geçmiş etkinliğin başlığı düzeltilebilsin).
  if p_patch ? 'starts_at' and v_starts <> e.starts_at and v_starts <= now() then raise exception 'invalid_event_time'; end if;
  perform public._community_event_fields_ok(v_tz, v_location, v_url);

  v_changed := (v_title, v_description, v_starts, v_ends, v_tz, v_location, v_url)
    is distinct from (e.title, e.description, e.starts_at, e.ends_at, e.timezone, e.location, e.online_url);
  if not v_changed then
    return jsonb_build_object('changed', false);
  end if;
  v_logistics_changed := (v_starts, v_ends, v_tz, v_location, v_url) is distinct from (e.starts_at, e.ends_at, e.timezone, e.location, e.online_url);

  update public.community_events
     set title = v_title, description = v_description, starts_at = v_starts, ends_at = v_ends, timezone = v_tz, location = v_location, online_url = v_url
   where id = p_event_id;
  perform public._group_audit(e.community_id, g.name, v_actor, null, 'event_updated', jsonb_build_object('event_id', e.id));

  if v_logistics_changed then
    for v_rsvp in select user_id from public.community_event_rsvps where event_id = p_event_id and status in ('going', 'maybe') and user_id <> v_actor loop
      perform public._community_notify(
        v_rsvp.user_id, v_actor, e.community_id, 'important',
        '"' || public.truncate_preview(g.name, 60) || '" topluluğundaki "' || public.truncate_preview(v_title, 80) || '" etkinliği güncellendi.',
        '/communities/local?id=' || e.community_id || '&tab=events',
        'cevtupd:' || e.id || ':' || v_rsvp.user_id || ':' || extract(epoch from clock_timestamp())::bigint
      );
    end loop;
  end if;
  return jsonb_build_object('changed', true);
end;
$$;

create or replace function public.cancel_community_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  e public.community_events;
  g public.chat_groups;
  v_rsvp record;
begin
  select * into e from public.community_events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  g := public._group_lock(e.community_id);
  perform public._group_require_cap(e.community_id, v_actor, 'manage_events');
  if e.status = 'cancelled' then
    return;
  end if;
  update public.community_events set status = 'cancelled' where id = p_event_id;
  perform public._group_audit(e.community_id, g.name, v_actor, null, 'event_cancelled', jsonb_build_object('event_id', e.id));
  for v_rsvp in select user_id from public.community_event_rsvps where event_id = p_event_id and status in ('going', 'maybe') and user_id <> v_actor loop
    perform public._community_notify(
      v_rsvp.user_id, v_actor, e.community_id, 'important',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğundaki "' || public.truncate_preview(e.title, 80) || '" etkinliği iptal edildi.',
      '/communities/local?id=' || e.community_id || '&tab=events',
      'cevtcancel:' || e.id || ':' || v_rsvp.user_id
    );
  end loop;
end;
$$;

create or replace function public.delete_community_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  e public.community_events;
  g public.chat_groups;
begin
  select * into e from public.community_events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  g := public._group_lock(e.community_id);
  perform public._group_require_cap(e.community_id, v_actor, 'manage_events');
  delete from public.community_events where id = p_event_id;
  perform public._group_audit(e.community_id, g.name, v_actor, null, 'event_deleted', jsonb_build_object('event_id', e.id, 'title', e.title));
end;
$$;

-- Katılım cevabı: 'going' | 'maybe' | 'not_going' | 'none' (cevabı geri al). Yalnız üye; iptal edilmiş/bitmiş etkinliğe cevap verilmez.
create or replace function public.set_community_event_rsvp(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  e public.community_events;
  g public.chat_groups;
begin
  if p_status not in ('going', 'maybe', 'not_going', 'none') then
    raise exception 'invalid_rsvp';
  end if;
  select * into e from public.community_events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  g := public._group_lock(e.community_id);
  if public._group_member_role(e.community_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if p_status = 'none' then
    delete from public.community_event_rsvps where event_id = p_event_id and user_id = v_actor;
    return;
  end if;
  if e.status = 'cancelled' then
    raise exception 'event_cancelled';
  end if;
  if coalesce(e.ends_at, e.starts_at + interval '3 hours') <= now() then
    raise exception 'event_over';
  end if;
  insert into public.community_event_rsvps (event_id, user_id, status)
  values (p_event_id, v_actor, p_status)
  on conflict (event_id, user_id) do update set status = excluded.status, updated_at = now();
end;
$$;

-- Hatırlatma: ÇAĞIRANIN "geliyorum/belki" dediği, 24 saat içinde başlayacak etkinlikler için bir kez bildirim (zamanlayıcı gerekmez;
-- istemci uygulama açılışında çağırır). Tercih 'none' ise gelmez. Tekrar çağrı yinelenen bildirim üretmez (dedupe_key).
create or replace function public.dispatch_my_event_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_rec record;
  v_before integer;
  v_created integer := 0;
begin
  for v_rec in
    select e.id as event_id, e.title, e.community_id, g.name as community_name
      from public.community_event_rsvps r
      join public.community_events e on e.id = r.event_id
      join public.chat_groups g on g.id = e.community_id
      join public.conversation_members m on m.conversation_id = e.community_id and m.user_id = r.user_id
     where r.user_id = v_actor
       and r.status in ('going', 'maybe')
       and e.status = 'scheduled'
       and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
  loop
    select count(*) into v_before from public.notifications where dedupe_key = 'evtrem:' || v_rec.event_id || ':' || v_actor;
    perform public._community_notify(
      v_actor, null, v_rec.community_id, 'important',
      '"' || public.truncate_preview(v_rec.community_name, 60) || '" topluluğunda "' || public.truncate_preview(v_rec.title, 80) || '" etkinliği 24 saat içinde başlıyor.',
      '/communities/local?id=' || v_rec.community_id || '&tab=events',
      'evtrem:' || v_rec.event_id || ':' || v_actor
    );
    if v_before = 0 and exists (select 1 from public.notifications where dedupe_key = 'evtrem:' || v_rec.event_id || ':' || v_actor) then
      v_created := v_created + 1;
    end if;
  end loop;
  return v_created;
end;
$$;

-- ============================================================================
-- 9. Raporlar ve moderasyon kuyruğu
-- ============================================================================

create or replace function public.report_community_content(p_group_id uuid, p_kind text, p_target_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_post public.community_posts;
  v_msg public.messages;
  v_target_user uuid;
  v_id uuid := gen_random_uuid();
begin
  perform public._group_lock(p_group_id);
  if public._group_member_role(p_group_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'invalid_reason';
  end if;
  if p_kind = 'post' then
    select * into v_post from public.community_posts where id = p_target_id and community_id = p_group_id;
    if not found then
      raise exception 'report_target_not_found';
    end if;
    v_target_user := v_post.author_id;
  elsif p_kind = 'message' then
    select * into v_msg from public.messages where id = p_target_id and conversation_id = p_group_id and deleted_at is null;
    if not found or not public.can_read_message(v_msg.conversation_id, v_msg.sender_id, v_msg.created_at) then
      raise exception 'report_target_not_found';
    end if;
    v_target_user := v_msg.sender_id;
  else
    raise exception 'report_target_not_found';
  end if;
  if v_target_user = v_actor then
    raise exception 'cannot_target_self';
  end if;
  if (select count(*) from public.community_reports where reporter_id = v_actor and status = 'open') >= 20 then
    raise exception 'report_limit';
  end if;
  begin
    insert into public.community_reports (id, community_id, reporter_id, target_kind, post_id, message_id, target_user_id, reason)
    values (v_id, p_group_id, v_actor, p_kind,
            case when p_kind = 'post' then p_target_id end,
            case when p_kind = 'message' then p_target_id end,
            v_target_user, v_reason);
  exception when unique_violation then
    raise exception 'already_reported';
  end;
  return v_id;
end;
$$;

-- Raporu karara bağla: 'dismiss' (reddet) ya da 'remove' (içeriği kaldır: gönderi → `moderate_community_post`, mesaj →
-- `moderate_chat_group_message`; yetki ve rütbe kuralları orada aynen geçerli). Raporlayana sonuç bildirimi gider.
create or replace function public.resolve_community_report(p_report_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  r public.community_reports;
  g public.chat_groups;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_action not in ('dismiss', 'remove') then
    raise exception 'invalid_action';
  end if;
  select * into r from public.community_reports where id = p_report_id;
  if not found then
    raise exception 'report_not_found';
  end if;
  g := public._group_lock(r.community_id);
  perform public._group_require_cap(r.community_id, v_actor, case when r.target_kind = 'post' then 'moderate_posts' else 'delete_messages' end);
  select * into r from public.community_reports where id = p_report_id for update;
  if r.status <> 'open' then
    raise exception 'invalid_state';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'invalid_reason';
  end if;

  if p_action = 'remove' then
    if r.target_kind = 'post' and r.post_id is not null then
      perform public.moderate_community_post(r.post_id, v_note);
    elsif r.target_kind = 'message' and r.message_id is not null then
      perform public.moderate_chat_group_message(r.message_id);
    end if;
  end if;

  -- İçerik silinirken tetikleyici raporu zaten 'resolved' yapmış olabilir; karar bilgisini (kim/ne) yine de yazarız.
  update public.community_reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
         resolution = coalesce(v_note, case when p_action = 'dismiss' then 'dismissed' else 'content_removed' end),
         resolved_by = v_actor, resolved_at = coalesce(resolved_at, now())
   where id = p_report_id;
  perform public._group_audit(r.community_id, g.name, v_actor, r.target_user_id, 'report_' || p_action,
    jsonb_build_object('report_id', r.id, 'kind', r.target_kind));
  perform public._community_notify(
    r.reporter_id, v_actor, r.community_id, 'direct',
    '"' || public.truncate_preview(g.name, 60) || '" topluluğunda bildirdiğin içerik için karar verildi.',
    '/communities/local?id=' || r.community_id || '&tab=overview',
    'crep:' || r.id
  );
end;
$$;

-- ============================================================================
-- 10. EXECUTE yetkileri
-- ============================================================================

revoke execute on function public._group_all_capabilities() from public, anon, authenticated;
revoke execute on function public._community_notify_level(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._community_notify(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._community_record_acceptance(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._community_valid_category(text) from public, anon, authenticated;
revoke execute on function public._community_content_info(text, uuid) from public, anon, authenticated;
revoke execute on function public._community_member_rank(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._community_event_fields_ok(text, text, text) from public, anon, authenticated;

revoke execute on function public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean) from public, anon;
revoke execute on function public.update_community(uuid, jsonb) from public, anon;
revoke execute on function public.accept_community_rules(uuid) from public, anon;
revoke execute on function public.close_community(uuid) from public, anon;
revoke execute on function public.reopen_community(uuid) from public, anon;
revoke execute on function public.join_community(uuid, boolean) from public, anon;
revoke execute on function public.respond_community_invitation(uuid, boolean, boolean) from public, anon;
revoke execute on function public.join_community_via_link(text, text, boolean) from public, anon;
revoke execute on function public.preview_community_link(text) from public, anon;
revoke execute on function public.set_community_bookmark(uuid, boolean) from public, anon;
revoke execute on function public.share_to_community(uuid, text, uuid, text) from public, anon;
revoke execute on function public.update_community_post(uuid, text) from public, anon;
revoke execute on function public.delete_community_post(uuid) from public, anon;
revoke execute on function public.moderate_community_post(uuid, text) from public, anon;
revoke execute on function public.set_community_post_pinned(uuid, boolean) from public, anon;
revoke execute on function public.publish_community_announcement(uuid, text, text, boolean, boolean, boolean) from public, anon;
revoke execute on function public.update_community_announcement(uuid, text, text, boolean) from public, anon;
revoke execute on function public.delete_community_announcement(uuid) from public, anon;
revoke execute on function public.create_community_event(uuid, text, text, timestamptz, timestamptz, text, text, text, boolean) from public, anon;
revoke execute on function public.update_community_event(uuid, jsonb) from public, anon;
revoke execute on function public.cancel_community_event(uuid) from public, anon;
revoke execute on function public.delete_community_event(uuid) from public, anon;
revoke execute on function public.set_community_event_rsvp(uuid, text) from public, anon;
revoke execute on function public.dispatch_my_event_reminders() from public, anon;
revoke execute on function public.report_community_content(uuid, text, uuid, text) from public, anon;
revoke execute on function public.resolve_community_report(uuid, text, text) from public, anon;

grant execute on function public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean) to authenticated;
grant execute on function public.update_community(uuid, jsonb) to authenticated;
grant execute on function public.accept_community_rules(uuid) to authenticated;
grant execute on function public.close_community(uuid) to authenticated;
grant execute on function public.reopen_community(uuid) to authenticated;
grant execute on function public.join_community(uuid, boolean) to authenticated;
grant execute on function public.respond_community_invitation(uuid, boolean, boolean) to authenticated;
grant execute on function public.join_community_via_link(text, text, boolean) to authenticated;
grant execute on function public.preview_community_link(text) to authenticated;
grant execute on function public.set_community_bookmark(uuid, boolean) to authenticated;
grant execute on function public.share_to_community(uuid, text, uuid, text) to authenticated;
grant execute on function public.update_community_post(uuid, text) to authenticated;
grant execute on function public.delete_community_post(uuid) to authenticated;
grant execute on function public.moderate_community_post(uuid, text) to authenticated;
grant execute on function public.set_community_post_pinned(uuid, boolean) to authenticated;
grant execute on function public.publish_community_announcement(uuid, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_community_announcement(uuid, text, text, boolean) to authenticated;
grant execute on function public.delete_community_announcement(uuid) to authenticated;
grant execute on function public.create_community_event(uuid, text, text, timestamptz, timestamptz, text, text, text, boolean) to authenticated;
grant execute on function public.update_community_event(uuid, jsonb) to authenticated;
grant execute on function public.cancel_community_event(uuid) to authenticated;
grant execute on function public.delete_community_event(uuid) to authenticated;
grant execute on function public.set_community_event_rsvp(uuid, text) to authenticated;
grant execute on function public.dispatch_my_event_reminders() to authenticated;
grant execute on function public.report_community_content(uuid, text, uuid, text) to authenticated;
grant execute on function public.resolve_community_report(uuid, text, text) to authenticated;
