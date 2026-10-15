-- Grup sohbeti ve topluluk sistemi — ŞEMA, RLS ve koruma tetikleyicileri (docs/history/172-*).
-- RPC'ler (yazma yolu) bir sonraki dosyadadır: 20260919990000_chat_groups_functions.sql.
--
-- Karar: ayrı bir "grup mesajı" altyapısı kurulmaz. Grup, mevcut `conversations` satırıdır
-- (`kind = 'group'`); üyelik `conversation_members` (rol, katılma zamanı, sessize alma + 171'deki
-- kişiye özel arşiv/sil/temizle sütunları zaten orada), mesajlar `messages`, tepkiler
-- `message_reactions`, Realtime ve fotoğraf gönderimi AYNEN yeniden kullanılır. Grup bilgisi
-- `chat_groups` (id = conversation id) tablosundadır. Birebir sohbet ile grup kimliği aynı mesajda
-- çelişemez: mesajın tek anahtarı `conversation_id`, türü `conversations.kind` belirler.
--
-- Bütün yazmalar SECURITY DEFINER RPC'lerden geçer; istemci bu tablolara doğrudan YAZAMAZ.
-- Bu migration yalnızca ekleyicidir (yeni tablo/sütun/fonksiyon/tetikleyici; mevcut politikalar
-- `alter policy` ile yerinde daraltılır, hiçbir tablo/sütun/kısıt düşürülmez).

-- ============================================================================
-- 1. conversations.kind
-- ============================================================================

alter table public.conversations
  add column if not exists kind text not null default 'direct';
alter table public.conversations
  add constraint conversations_kind_check check (kind in ('direct', 'group'));

-- ============================================================================
-- 2. conversation_members: rol, katılma zamanı, sessize alma
-- ============================================================================

alter table public.conversation_members
  add column if not exists role text not null default 'member',
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists muted_at timestamptz;
alter table public.conversation_members
  add constraint conversation_members_role_check check (role in ('owner', 'admin', 'moderator', 'member'));

-- Bir grubun tek bir sahibi olur (sahipsiz grup ve çift sahip veritabanı düzeyinde engellenir).
create unique index if not exists conversation_members_one_owner_idx
  on public.conversation_members (conversation_id) where role = 'owner';
create index if not exists conversation_members_conversation_role_idx
  on public.conversation_members (conversation_id, role, joined_at);

-- ============================================================================
-- 3. Grup tabloları
-- ============================================================================

create table public.chat_groups (
  id uuid primary key references public.conversations (id) on delete cascade,
  name text not null,
  description text,
  avatar_url text,
  visibility text not null default 'private',
  posting_policy text not null default 'members',
  member_limit integer not null default 256,
  member_count integer not null default 0,
  pending_request_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_groups_name_len check (char_length(btrim(name)) between 1 and 60 and name = btrim(name)),
  constraint chat_groups_description_len check (description is null or char_length(description) <= 500),
  constraint chat_groups_avatar_len check (avatar_url is null or char_length(avatar_url) <= 500),
  constraint chat_groups_visibility_check check (visibility in ('public', 'private')),
  constraint chat_groups_posting_policy_check check (posting_policy in ('members', 'admins')),
  constraint chat_groups_member_limit_check check (member_limit between 2 and 1000),
  constraint chat_groups_member_count_check check (member_count >= 0),
  constraint chat_groups_pending_request_count_check check (pending_request_count >= 0)
);
create index chat_groups_public_popular_idx on public.chat_groups (member_count desc, id) where visibility = 'public';
create index chat_groups_public_newest_idx on public.chat_groups (created_at desc, id) where visibility = 'public';
alter table public.chat_groups enable row level security;

create table public.chat_group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  status text not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint chat_group_join_requests_status_check check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  constraint chat_group_join_requests_message_len check (message is null or char_length(message) <= 300),
  constraint chat_group_join_requests_decided_check check ((status = 'pending') = (decided_at is null))
);
-- Bir kullanıcının bir grup için aynı anda yalnızca BİR bekleyen isteği olur; geçmiş satırlar durur.
create unique index chat_group_join_requests_one_pending_idx
  on public.chat_group_join_requests (group_id, user_id) where status = 'pending';
create index chat_group_join_requests_group_idx on public.chat_group_join_requests (group_id, status, created_at);
create index chat_group_join_requests_user_idx on public.chat_group_join_requests (user_id, status);
alter table public.chat_group_join_requests enable row level security;

create table public.chat_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  constraint chat_group_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  constraint chat_group_invitations_responded_check check ((status = 'pending') = (responded_at is null))
);
create unique index chat_group_invitations_one_pending_idx
  on public.chat_group_invitations (group_id, invitee_id) where status = 'pending';
create index chat_group_invitations_group_idx on public.chat_group_invitations (group_id, status, created_at);
create index chat_group_invitations_invitee_idx on public.chat_group_invitations (invitee_id, status);
alter table public.chat_group_invitations enable row level security;

-- Davet bağlantıları: ham token ASLA saklanmaz (yalnızca SHA-256 özeti); ham değer oluşturan kişiye
-- yalnızca oluşturma yanıtında bir kez döner. Süre sonu, iptal ve kullanım sınırı sunucuda doğrulanır.
create table public.chat_group_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  constraint chat_group_links_max_uses_check check (max_uses is null or max_uses > 0),
  constraint chat_group_links_use_count_check check (use_count >= 0)
);
create index chat_group_links_group_idx on public.chat_group_links (group_id, created_at desc);
alter table public.chat_group_links enable row level security;

-- Gruptan "engelleyerek" çıkarılanlar: yeniden katılamaz/başvuramaz/davet edilemez (owner/admin kaldırana dek).
create table public.chat_group_bans (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid references public.profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint chat_group_bans_reason_len check (reason is null or char_length(reason) <= 300)
);
alter table public.chat_group_bans enable row level security;

-- Denetim kaydı: yalnızca ekleme; grup silinse de satırlar kalır (bu yüzden group_id'ye FK YOK).
create table public.chat_group_audit (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  group_name text,
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_group_audit_group_idx on public.chat_group_audit (group_id, created_at desc);
alter table public.chat_group_audit enable row level security;

-- ============================================================================
-- 4. Yardımcı fonksiyonlar (RLS ve RPC'ler kullanır)
-- ============================================================================

create or replace function public.is_group_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.conversations where id = p_conversation_id and kind = 'group');
$$;

-- Çağıranın gruptaki rolü (üye değilse null).
create or replace function public.chat_group_role(p_group_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.conversation_members
   where conversation_id = p_group_id and user_id = auth.uid();
$$;

-- Rol sıralaması: owner 4 > admin 3 > moderator 2 > member 1 (üye değil: 0).
create or replace function public.chat_group_role_rank(p_role text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'moderator' then 2 when 'member' then 1 else 0 end;
$$;

-- Grup mesajı okuma kuralı (birebir sohbette eski kuralın aynısı): üye olmak + katılmadan ÖNCEKİ
-- mesajları görmemek + engel ilişkisi olan göndericinin mesajını görmemek (karşılıklı).
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
         where m.conversation_id = p_conversation_id
           and m.user_id = auth.uid()
           and p_created_at >= m.joined_at
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

-- Mesaj gönderme kuralı. Birebir: eski kural (üye + karşı üyelerle engel yok). Grup: aktif üye +
-- grubun "kim yazabilir" ayarına uyum. Engel ilişkisi grupta gönderimi KİLİTLEMEZ (aksi hâlde bir
-- üyeyi engelleyen herkes tüm gruba yazamazdı) — onun yerine karşılıklı görünmezlik (can_read_message).
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

-- ============================================================================
-- 5. RLS
-- ============================================================================

-- Mesaj okuma/gönderme: yukarıdaki kurallar (yerinde güncelleme, politikalar düşürülmez).
alter policy "Members can read messages in their conversations" on public.messages
  using (public.can_read_message(conversation_id, sender_id, created_at));

alter policy "Members can send messages in their conversations" on public.messages
  with check (auth.uid() = sender_id and public.can_send_message(conversation_id));

-- Gruptan çıkarılmış/ayrılmış biri eski mesajını düzenleyemez/silemez (birebir sohbette kural aynı kalır).
alter policy "Senders can edit or soft-delete their own recent messages" on public.messages
  using (auth.uid() = sender_id and (not public.is_group_conversation(conversation_id) or public.is_conversation_member(conversation_id)));

-- Üyelik satırları: birebir sohbette eskisi gibi (iki taraf birbirini görür); grupta YALNIZ kendi satırım —
-- diğer üyelerin kişisel durumu (arşiv/sessiz/okunmamış) sızmaz, üye listesi `chat_group_members` RPC'sinden gelir.
alter policy "Members can view the membership of their conversations" on public.conversation_members
  using (
    auth.uid() = user_id
    or (public.is_conversation_member(conversation_id) and not public.is_group_conversation(conversation_id))
  );

-- chat_groups: herkese açık gruplar (keşif) + üyesi olduklarım + bekleyen davetlisi/başvurucusu olduğum gruplar.
create policy "Public groups and groups I belong to are readable"
  on public.chat_groups for select
  to authenticated
  using (
    visibility = 'public'
    or public.is_conversation_member(id)
    or exists (
      select 1 from public.chat_group_invitations i
       where i.group_id = chat_groups.id and i.invitee_id = auth.uid()
         and i.status = 'pending' and i.expires_at > now()
    )
    or exists (
      select 1 from public.chat_group_join_requests r
       where r.group_id = chat_groups.id and r.user_id = auth.uid() and r.status = 'pending'
    )
  );

create policy "Requesters and group staff can read join requests"
  on public.chat_group_join_requests for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.chat_group_role(group_id) in ('owner', 'admin', 'moderator')
  );

create policy "Invitees, inviters and group managers can read invitations"
  on public.chat_group_invitations for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or public.chat_group_role(group_id) in ('owner', 'admin')
  );

create policy "Group managers can read invite links"
  on public.chat_group_links for select
  to authenticated
  using (public.chat_group_role(group_id) in ('owner', 'admin'));

create policy "Group managers can read bans"
  on public.chat_group_bans for select
  to authenticated
  using (public.chat_group_role(group_id) in ('owner', 'admin'));

create policy "Group managers and site moderators can read the audit log"
  on public.chat_group_audit for select
  to authenticated
  using (public.chat_group_role(group_id) in ('owner', 'admin') or public.is_moderator());

-- İstemci bu tablolara YAZAMAZ (politika yok + yetki geri alındı), anon hiçbirini göremez.
revoke all on public.chat_groups, public.chat_group_join_requests, public.chat_group_invitations,
  public.chat_group_links, public.chat_group_bans, public.chat_group_audit from anon;
revoke insert, update, delete, truncate, references, trigger on public.chat_groups, public.chat_group_join_requests,
  public.chat_group_invitations, public.chat_group_links, public.chat_group_bans, public.chat_group_audit from authenticated;
-- Bağlantı özeti (token_hash) istemciye hiç verilmez: yalnız listelenen sütunlar okunabilir.
revoke select on public.chat_group_links from authenticated;
grant select (id, group_id, created_by, created_at, expires_at, revoked_at, max_uses, use_count) on public.chat_group_links to authenticated;

-- ============================================================================
-- 6. Koruma tetikleyicileri
-- ============================================================================

-- İstemci grup/sahip/rol kaydı OLUŞTURAMAZ: grup sohbeti yalnız create_chat_group RPC'siyle doğar.
create or replace function public.guard_conversation_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and new.kind <> 'direct' then
    raise exception 'group_creation_via_rpc';
  end if;
  return new;
end;
$$;

create trigger conversations_guard_kind
  before insert or update of kind on public.conversations
  for each row execute function public.guard_conversation_kind();

-- Üyelik satırı koruması (yalnızca anon/authenticated rolleriyle gelen istekler; SECURITY DEFINER
-- RPC'ler ve cascade'ler tablo sahibi olarak çalıştığı için etkilenmez).
--   INSERT: gruba doğrudan eklenemez; rol her zaman 'member'.
--   UPDATE: rol, katılma zamanı ve konuşma kimliği değiştirilemez; grup üyeliğinin status'u sabit.
--   DELETE: gruptan doğrudan çıkılamaz (leave_chat_group RPC'si: sahiplik/denetim/sayaç kuralları orada).
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
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id then
      raise exception 'membership_identity_immutable';
    end if;
    new.role := old.role;
    new.joined_at := old.joined_at;
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

create trigger conversation_members_guard_row
  before insert or update or delete on public.conversation_members
  for each row execute function public.guard_conversation_member_row();

-- Üye sayısı (denormalize, korumalı): yalnızca grup konuşmalarında, SECURITY DEFINER.
create or replace function public.handle_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.chat_groups set member_count = member_count + 1 where id = new.conversation_id;
    return new;
  end if;
  update public.chat_groups set member_count = greatest(member_count - 1, 0) where id = old.conversation_id;
  return old;
end;
$$;

create trigger conversation_members_group_count
  after insert or delete on public.conversation_members
  for each row execute function public.handle_group_member_count();

-- Bekleyen istek sayısı (denormalize, korumalı).
create or replace function public.handle_group_request_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      update public.chat_groups set pending_request_count = pending_request_count + 1 where id = new.group_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'pending' then
      update public.chat_groups set pending_request_count = greatest(pending_request_count - 1, 0) where id = old.group_id;
    end if;
    return old;
  end if;
  if old.status = 'pending' and new.status <> 'pending' then
    update public.chat_groups set pending_request_count = greatest(pending_request_count - 1, 0) where id = new.group_id;
  elsif old.status <> 'pending' and new.status = 'pending' then
    update public.chat_groups set pending_request_count = pending_request_count + 1 where id = new.group_id;
  end if;
  return new;
end;
$$;

create trigger chat_group_join_requests_count
  after insert or update of status or delete on public.chat_group_join_requests
  for each row execute function public.handle_group_request_count();

create trigger chat_groups_protect_counters
  before insert or update on public.chat_groups
  for each row execute function public.protect_counter_columns('member_count', 'pending_request_count');

create or replace function public.touch_chat_group_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger chat_groups_touch_updated_at
  before update on public.chat_groups
  for each row execute function public.touch_chat_group_updated_at();

-- Sahip bir şekilde ayrılırsa (hesap silme / cascade dahil) grup sahipsiz KALMAZ: sıradaki en kıdemli
-- yönetici → moderatör → üye devralır; kimse kalmadıysa grup silinir. leave_chat_group RPC'si sahibe
-- önce devretmesini söyler; bu tetikleyici RPC dışı yollar (hesap silme) için güvenlik ağıdır.
create or replace function public.handle_group_owner_exit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_successor uuid;
  v_name text;
begin
  -- delete_chat_group / son üyenin ayrılması grubu bilerek siler: devralma denenmez.
  if current_setting('app.deleting_group', true) = old.conversation_id::text then
    return old;
  end if;
  select name into v_name from public.chat_groups where id = old.conversation_id;
  if not found then
    return old; -- grup zaten siliniyor (cascade)
  end if;

  select user_id into v_successor
    from public.conversation_members
   where conversation_id = old.conversation_id and user_id <> old.user_id
   order by case role when 'admin' then 1 when 'moderator' then 2 else 3 end, joined_at, user_id
   limit 1
   for update;

  if v_successor is null then
    perform set_config('app.deleting_group', old.conversation_id::text, true);
    delete from public.conversations where id = old.conversation_id;
    return old;
  end if;

  update public.conversation_members set role = 'owner'
   where conversation_id = old.conversation_id and user_id = v_successor;

  insert into public.chat_group_audit (group_id, group_name, actor_id, target_user_id, action, details)
  values (old.conversation_id, v_name, null, v_successor, 'ownership_auto_transferred', jsonb_build_object('previous_owner', old.user_id));

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_successor, null, 'system',
    '"' || public.truncate_preview(v_name) || '" grubunun yeni sahibi oldun.',
    '/messages/local?id=' || old.conversation_id,
    'grpowner:' || old.conversation_id || ':' || v_successor || ':' || extract(epoch from clock_timestamp())::bigint
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return old;
end;
$$;

create trigger conversation_members_group_owner_exit
  after delete on public.conversation_members
  for each row
  when (old.role = 'owner')
  execute function public.handle_group_owner_exit();

-- ============================================================================
-- 7. Birebir sohbet akışlarının grupla karışmaması (aynı imza, create or replace)
-- ============================================================================

-- Grup mesajı bildirimi: HER mesajda tüm üyelere bildirim GİTMEZ (okunmamış sayacı + liste yeterli).
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_preview text;
begin
  if public.is_group_conversation(new.conversation_id) then
    return new;
  end if;

  v_preview := case
    when new.body is not null then '"' || public.truncate_preview(new.body) || '"'
    when new.shared_prompt_id is not null then 'bir prompt paylaştı'
    when new.shared_request_id is not null then 'bir prompt isteği paylaştı'
    when jsonb_array_length(new.attachments) > 0 then 'bir fotoğraf gönderdi'
    else 'bir mesaj gönderdi'
  end;

  for v_recipient in
    select user_id, status from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id,
      new.sender_id,
      case when v_recipient.status = 'pending' then 'message_request' else 'message' end,
      case
        when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi: ' || v_preview
        else 'Sana bir mesaj gönderdi: ' || v_preview
      end,
      '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id
    );
  end loop;

  return new;
end;
$$;

-- Yeni mesaj arşivdeki/listeden kaldırılmış sohbeti geri getirir (171); grupta SESSİZE ALINMIŞ üyeler için
-- geri getirmez (sessiz + arşiv = kullanıcı o grubu görmek istemiyor).
create or replace function public.resurface_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_group boolean := public.is_group_conversation(new.conversation_id);
begin
  update public.conversation_members
     set archived_at = null,
         deleted_at = null
   where conversation_id = new.conversation_id
     and (archived_at is not null or deleted_at is not null)
     and (not v_is_group or muted_at is null);
  return new;
end;
$$;

-- Var olan 1:1 sohbeti ararken ortak GRUPLAR sayılmaz (iki kişi aynı grupta diye "sohbet" varsayılmaz).
create or replace function public.start_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_conversation_id uuid;
  v_recipient_privacy text;
  v_recipient_follows_sender boolean;
  v_other_status text;
begin
  if v_self is null then
    raise exception 'Giriş yapmadan mesaj gönderilemez.';
  end if;
  if other_user_id = v_self then
    raise exception 'Kendine mesaj gönderemezsin.';
  end if;
  if public.is_blocked(v_self, other_user_id) then
    raise exception 'Bu kullanıcıyla mesajlaşamazsın.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(v_self::text, other_user_id::text) || ':' || greatest(v_self::text, other_user_id::text), 0)
  );

  select cm1.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2 using (conversation_id)
  join public.conversations c on c.id = cm1.conversation_id and c.kind = 'direct'
  where cm1.user_id = v_self and cm2.user_id = other_user_id
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select message_privacy into v_recipient_privacy from public.profiles where id = other_user_id;
  if v_recipient_privacy is null then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  select exists (
    select 1 from public.follows
    where follower_id = other_user_id and following_id = v_self
  ) into v_recipient_follows_sender;

  if v_recipient_privacy = 'followers_only' and not v_recipient_follows_sender then
    raise exception 'Bu kullanıcı yalnızca takip ettiği kişilerden mesaj kabul ediyor.';
  end if;

  v_other_status := case when v_recipient_follows_sender then 'accepted' else 'pending' end;

  v_conversation_id := gen_random_uuid();
  insert into public.conversations (id) values (v_conversation_id);

  insert into public.conversation_members (conversation_id, user_id, status)
  values (v_conversation_id, v_self, 'accepted');

  insert into public.conversation_members (conversation_id, user_id, status)
  values (v_conversation_id, other_user_id, v_other_status);

  return v_conversation_id;
end;
$$;

-- "Zaten sohbetim olan kişiler" yalnız BİREBİR sohbetlerden gelir (ortak grup üyeleri ulaşılabilir sayılmaz).
create or replace function public.filter_messageable_users(p_user_ids uuid[])
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from public.profiles p
  where auth.uid() is not null
    and p.id = any (p_user_ids[1:100])
    and p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
    and (
      exists (
        select 1
        from public.conversation_members mine
        join public.conversation_members theirs using (conversation_id)
        join public.conversations c on c.id = mine.conversation_id and c.kind = 'direct'
        where mine.user_id = auth.uid() and theirs.user_id = p.id
      )
      or p.message_privacy <> 'followers_only'
      or exists (
        select 1 from public.follows f
        where f.follower_id = p.id and f.following_id = auth.uid()
      )
    );
$$;

-- Moderatör konuşma dökümü: grup konuşmasında her üye için ayrı satır dönmesin (grup adı tek satırda).
create or replace function public.admin_user_conversations(p_user_id uuid)
returns table(conversation_id uuid, counterpart_id uuid, counterpart_username text, counterpart_display_name text, message_count bigint, last_message_at timestamptz, last_body text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();
  perform public._admin_log('view_conversations', p_user_id);
  return query
  select cm.conversation_id, o.id, o.username,
    coalesce(g.name, o.display_name),
    (select count(*) from public.messages m where m.conversation_id = cm.conversation_id),
    c.last_message_at,
    (select case when m.deleted_at is not null then null else coalesce(left(m.body, 160), case when jsonb_array_length(m.attachments) > 0 then '[fotoğraf]' else '[paylaşım]' end) end
       from public.messages m where m.conversation_id = cm.conversation_id order by m.created_at desc limit 1)
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.chat_groups g on g.id = c.id
  left join public.conversation_members ocm on ocm.conversation_id = cm.conversation_id and ocm.user_id <> p_user_id and c.kind = 'direct'
  left join public.profiles o on o.id = ocm.user_id
  where cm.user_id = p_user_id
  order by c.last_message_at desc nulls last;
end $$;

-- Grup avatarları da (profil avatarı gibi) `avatars` bucket'ında durur; yetim temizliği onları silmesin.
create or replace function public.orphan_storage_objects(p_min_age interval default '01:00:00'::interval)
returns table(bucket_id text, name text, size bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select avatar_url from public.chat_groups where avatar_url is not null
    union all select reference_image_url from public.prompt_requests where reference_image_url is not null
    union all select a->>'path' from public.messages m, jsonb_array_elements(m.attachments) a
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$$;

-- ============================================================================
-- 8. Realtime + EXECUTE yetkileri
-- ============================================================================

-- Üyeler grup adı/görünürlük/üye sayısı değişimini canlı görür (RLS, aboneye göre uygulanır).
alter publication supabase_realtime add table public.chat_groups;

-- Tetikleyici/iç yardımcılar istemciden çağrılamaz.
revoke execute on function public.guard_conversation_kind() from public, anon, authenticated;
revoke execute on function public.guard_conversation_member_row() from public, anon, authenticated;
revoke execute on function public.handle_group_member_count() from public, anon, authenticated;
revoke execute on function public.handle_group_request_count() from public, anon, authenticated;
revoke execute on function public.touch_chat_group_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_group_owner_exit() from public, anon, authenticated;
-- RLS'in çağırdığı yardımcılar. `messages` / `conversation_members` politikaları anon rolü için de
-- değerlendirildiğinden (anon zaten hiçbir satır göremez: auth.uid() null) onlar anon'a da açık kalır;
-- yalnız oturumlu kullanıcıya özel tablolardaki politikalarda kullanılanlar anon'dan geri alınır.
revoke execute on function public.chat_group_role(uuid) from public, anon;
revoke execute on function public.can_send_message(uuid) from public, anon;
grant execute on function public.is_group_conversation(uuid) to anon, authenticated;
grant execute on function public.can_read_message(uuid, uuid, timestamptz) to anon, authenticated;
grant execute on function public.chat_group_role(uuid) to authenticated;
grant execute on function public.can_send_message(uuid) to authenticated;
