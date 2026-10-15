-- Sohbet geliştirmeleri — ŞEMA (docs/history/174-*): okundu imleci, sabitlenmiş mesajlar, yıldızlı mesajlar, yazıyor kanalı yetkisi.
-- Yalnızca ekleyici: yeni sütun/tablo/fonksiyon + aynı imzalı `create or replace`. Hiçbir şey düşürülmez.
-- Fonksiyonlar (RPC'ler): 20260920020000_chat_features_functions.sql. Arama indeksi: 20260920030000_messages_search_index.sql.

-- ============================================================================
-- 1. Okundu imleci (konuşma başına, ÜYE BAŞINA tek satır — mesaj başına kayıt YOK)
-- ============================================================================
-- `last_read_at`: bu üyenin okuduğu en yeni mesajın `created_at`'i (sunucu zamanı). Bir mesaj, karşı üyenin imleci >= mesajın
-- created_at'i ise okunmuştur. `last_read_updated_at`: imlecin en son ilerlediği an (gerçek saat). İkisi de yalnızca RPC ile
-- ilerler (aşağıdaki tetikleyici istemci yazmasını yok sayar); imleç geri gitmez; ilerlemeyen çağrı satıra YAZMAZ.
-- Gruptan ayrılan/çıkarılan üyenin satırı silindiği için okundu verisi de gider; yeniden katılan sıfırdan başlar.
alter table public.conversation_members
  add column if not exists last_read_at timestamptz,
  add column if not exists last_read_updated_at timestamptz;

create or replace function public.guard_conversation_member_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if public.is_group_conversation(new.conversation_id) then
      raise exception 'group_membership_via_rpc';
    end if;
    new.role := 'member';
    new.joined_at := now();
    new.last_read_at := null;
    new.last_read_updated_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id then
      raise exception 'membership_identity_immutable';
    end if;
    new.role := old.role;
    new.joined_at := old.joined_at;
    -- Okundu imleci yalnızca mark_conversation_read* RPC'leriyle ilerler (istemci kendi okundu durumunu uyduramaz).
    new.last_read_at := old.last_read_at;
    new.last_read_updated_at := old.last_read_updated_at;
    if public.is_group_conversation(old.conversation_id) then
      new.status := old.status;
    end if;
    return new;
  end if;

  if public.is_group_conversation(old.conversation_id) then
    raise exception 'group_membership_via_rpc';
  end if;
  return old;
end;
$$;

-- Bir mesajın kimliği + konuşması birlikte benzersiz: sabitlenmiş mesaj yalnızca KENDİ konuşmasına bağlanabilsin (bileşik FK).
alter table public.messages add constraint messages_id_conversation_key unique (id, conversation_id);

-- ============================================================================
-- 2. Sabitlenmiş mesajlar
-- ============================================================================
-- Yazma yalnız `set_message_pinned` RPC'si. Okuma: üyelik + mesajın kendisi okunabilir olmalı (messages RLS'i alt sorguda uygulanır),
-- böylece erişilemeyen mesajın sabiti (ör. grupta katılmadan önceki, engelli gönderen) kimseye bozuk kayıt olarak görünmez.
create table public.pinned_messages (
  message_id uuid primary key,
  conversation_id uuid not null,
  pinned_by uuid references public.profiles (id) on delete set null,
  pinned_at timestamptz not null default now(),
  constraint pinned_messages_message_fk foreign key (message_id, conversation_id)
    references public.messages (id, conversation_id) on delete cascade
);
create index pinned_messages_conversation_idx on public.pinned_messages (conversation_id, pinned_at desc);
alter table public.pinned_messages enable row level security;
alter table public.pinned_messages replica identity full;

create policy "Members can read pins of messages they can read"
  on public.pinned_messages for select
  to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and exists (select 1 from public.messages m where m.id = pinned_messages.message_id)
  );
revoke all on public.pinned_messages from anon;
revoke insert, update, delete, truncate, references, trigger on public.pinned_messages from authenticated;

-- Grupta üyelerin de sabitleyebilmesi (varsayılan kapalı: yalnız yetkisi olan roller). Yalnız owner değiştirir.
alter table public.chat_groups add column if not exists members_can_pin boolean not null default false;

-- ============================================================================
-- 3. Yıldızlı mesajlar (kullanıcıya özel)
-- ============================================================================
-- Mesajın KOPYASI değil, (kullanıcı, mesaj) ilişkisidir; messages tablosuna yazılmaz. Erişim mesajın okunabilirliğine bağlıdır:
-- gruptan ayrılan, mesajı artık okuyamayan kullanıcının yıldızı listede görünmez (satır durur; yeniden katılırsa ve mesaj yine
-- okunabilirse geri gelir). Mesaj herkes için silinirse ya da kullanıcı "benden sil" derse yıldız tetikleyicilerle silinir.
create table public.message_stars (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index message_stars_user_created_idx on public.message_stars (user_id, created_at desc, message_id);
alter table public.message_stars enable row level security;

create policy "Users read their own stars" on public.message_stars for select to authenticated using (user_id = auth.uid());
create policy "Users star messages they can read" on public.message_stars for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_stars.message_id));
create policy "Users remove their own stars" on public.message_stars for delete to authenticated using (user_id = auth.uid());
revoke all on public.message_stars from anon;
revoke update, truncate, references, trigger on public.message_stars from authenticated;

-- Kullanıcı başına en çok 1000 yıldız.
create or replace function public.enforce_message_star_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.message_stars where user_id = new.user_id) >= 1000 then
    raise exception 'star_limit_reached';
  end if;
  return new;
end;
$$;
create trigger message_stars_enforce_limit before insert on public.message_stars
  for each row execute function public.enforce_message_star_limit();

-- Mesaj herkes için silindiğinde (içerik temizlenir) sabit ve yıldızlar anlamsızdır: kaldırılır.
create or replace function public.cleanup_on_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pinned_messages where message_id = new.id;
  delete from public.message_stars where message_id = new.id;
  return new;
end;
$$;
create trigger messages_cleanup_pins_and_stars after update of deleted_at on public.messages
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.cleanup_on_message_deleted();

-- "Benden sil" diyen kullanıcının o mesajdaki yıldızı da kalkar.
create or replace function public.cleanup_star_on_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.message_stars where user_id = new.user_id and message_id = new.message_id;
  return new;
end;
$$;
create trigger message_hidden_for_cleanup_star after insert on public.message_hidden_for
  for each row execute function public.cleanup_star_on_hidden();

revoke execute on function public.enforce_message_star_limit() from public, anon, authenticated;
revoke execute on function public.cleanup_on_message_deleted() from public, anon, authenticated;
revoke execute on function public.cleanup_star_on_hidden() from public, anon, authenticated;

-- ============================================================================
-- 4. Grup yetkilerine `pin_messages` (varsayılan: admin + moderatör) ve owner ayarı `members_can_pin`
-- ============================================================================
create or replace function public._group_default_permissions()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'admin', jsonb_build_object('edit_settings', true, 'change_visibility', true, 'manage_invites', true, 'manage_requests', true,
                                'remove_members', true, 'ban_members', true, 'manage_roles', true, 'delete_messages', true, 'pin_messages', true),
    'moderator', jsonb_build_object('edit_settings', false, 'change_visibility', false, 'manage_invites', false, 'manage_requests', true,
                                    'remove_members', true, 'ban_members', false, 'manage_roles', false, 'delete_messages', true, 'pin_messages', true)
  );
$$;

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
        if v_cap <> all (array['edit_settings', 'change_visibility', 'manage_invites', 'manage_requests', 'remove_members', 'ban_members', 'manage_roles', 'delete_messages', 'pin_messages'])
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
-- 5. Realtime: sabitlenmiş mesaj değişimleri iki tarafa (ve grup üyelerine) canlı gider (RLS abone başına uygulanır)
-- ============================================================================
alter publication supabase_realtime add table public.pinned_messages;
