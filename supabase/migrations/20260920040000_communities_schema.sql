-- Topluluklar — ŞEMA, RLS ve koruma tetikleyicileri (docs/history/175-*).
-- RPC'ler (yazma yolu) bir sonraki dosyalardadır:
--   20260920050000_communities_functions.sql   (oluşturma/ayar/katılım kuralları/gönderi/duyuru/etkinlik/rapor)
--   20260920060000_communities_reads.sql       (keşif, listeler, üyeler, istatistik, geçiş raporu, anma bildirimi)
--
-- KARAR (mimari): topluluk = mevcut grup sohbetinin GENİŞLETİLMESİ. Ayrı bir "topluluk" tablosu, ikinci bir üyelik
-- ya da ikinci bir mesaj altyapısı YOKTUR:
--   * Topluluk kimliği = `chat_groups.id` = `conversations.id` (grup sohbeti topluluğun sohbet modülüdür).
--   * Üyelik + rol = `conversation_members` (katılan topluluğun sohbetine de katılmış olur; ayrılan/çıkarılan ikisinden birden çıkar).
--   * Mesajlar `messages`'ta kalır. Topluluk gönderileri (içerik akışı) AYRI bir kavramdır: `community_posts`.
--   * Eski grup sohbetleri SİLİNMEZ ve taşınmaz: aynı satırlar zaten topluluktur (kimlik eşlemesi = özdeşlik). Yalnızca
--     `chat_groups.origin` ile 'legacy_group' diye işaretlenir (denetlenebilir, geri alınabilir). Bkz. docs/history/175-*.
--
-- Bu migration YALNIZCA EKLEYİCİDİR: yeni sütun/tablo/fonksiyon/tetikleyici; mevcut `messages` INSERT politikası
-- `alter policy` ile yerinde daraltılır. Hiçbir tablo/sütun/kısıt düşürülmez; eski migration'lara dokunulmaz.

-- ============================================================================
-- 1. chat_groups: topluluk alanları
-- ============================================================================

-- `origin`: bu migration çalıştığı anda var olan satırlar 'legacy_group' olur (varsayılan geçici olarak legacy_group),
-- ardından varsayılan 'native' yapılır → bundan sonra oluşturulanlar 'native'.
alter table public.chat_groups
  add column if not exists origin text not null default 'legacy_group',
  add column if not exists category text not null default 'general',
  add column if not exists feed_policy text not null default 'members',
  add column if not exists rules text,
  add column if not exists rules_version integer not null default 1,
  add column if not exists rules_required boolean not null default false,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles (id) on delete set null,
  add column if not exists post_count integer not null default 0;
alter table public.chat_groups alter column origin set default 'native';

alter table public.chat_groups
  add constraint chat_groups_origin_check check (origin in ('native', 'legacy_group')),
  add constraint chat_groups_category_check check (category in ('general', 'image', 'text', 'audio', 'video', 'workflow', 'learning', 'showcase')),
  add constraint chat_groups_feed_policy_check check (feed_policy in ('members', 'admins')),
  add constraint chat_groups_rules_len check (rules is null or char_length(rules) <= 5000),
  add constraint chat_groups_rules_version_check check (rules_version >= 1),
  add constraint chat_groups_post_count_check check (post_count >= 0);

create index if not exists chat_groups_public_category_idx
  on public.chat_groups (category, member_count desc, id) where visibility = 'public' and closed_at is null;

create trigger chat_groups_protect_post_count
  before insert or update of post_count on public.chat_groups
  for each row execute function public.protect_counter_columns('post_count');

-- ============================================================================
-- 2. conversation_members: topluluk bildirim tercihleri (kişiye özel; kendi satırı)
-- ============================================================================

-- 'all' = tüm uygun bildirimler · 'important' = yalnız önemli (duyuru, anma, hatırlatma, karar) · 'none' = sessiz
-- (yalnız kişiyi DOĞRUDAN ilgilendirenler: davet, kendi isteğinin sonucu, çıkarılma, sahiplik, kendi gönderisine karar).
-- `notify_muted_until`: süreli sessize alma; geçince tercih kendiliğinden yeniden geçerli olur (zamanlayıcı gerekmez).
alter table public.conversation_members
  add column if not exists notify_level text not null default 'all',
  add column if not exists notify_muted_until timestamptz;
alter table public.conversation_members
  add constraint conversation_members_notify_level_check check (notify_level in ('all', 'important', 'none'));

-- ============================================================================
-- 3. Topluluk gönderileri (içerik akışı)
-- ============================================================================

-- Bir gönderi, mevcut bir içeriğe (prompt/istek/workflow/hazır ayar) BAŞVURUDUR: içerik kopyalanmaz, ikinci bir gerçek
-- kayıt oluşmaz. Beğeni/yorum/kaydetme içeriğin kendi altyapısında yürür; orijinal sahip ve kaynak içeriktedir.
-- Hedef sütunlu polimorfik desen (prompt_likes / prompt_comments ile aynı): tam biri dolu, FK'ler korunur.
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null,
  prompt_id uuid references public.prompts (id) on delete cascade,
  request_id uuid references public.prompt_requests (id) on delete cascade,
  workflow_id uuid references public.workflows (id) on delete cascade,
  preset_id uuid references public.presets (id) on delete cascade,
  note text,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_type_check check (content_type in ('prompt', 'request', 'workflow', 'preset')),
  constraint community_posts_exactly_one_target check (
    (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer + (preset_id is not null)::integer = 1
  ),
  constraint community_posts_type_matches_target check (
    (content_type = 'prompt' and prompt_id is not null)
    or (content_type = 'request' and request_id is not null)
    or (content_type = 'workflow' and workflow_id is not null)
    or (content_type = 'preset' and preset_id is not null)
  ),
  constraint community_posts_note_len check (note is null or char_length(note) <= 500)
);
-- Aynı içerik bir toplulukta yalnızca BİR kez paylaşılabilir (yinelenen işlem koruması).
create unique index community_posts_prompt_uidx on public.community_posts (community_id, prompt_id) where prompt_id is not null;
create unique index community_posts_request_uidx on public.community_posts (community_id, request_id) where request_id is not null;
create unique index community_posts_workflow_uidx on public.community_posts (community_id, workflow_id) where workflow_id is not null;
create unique index community_posts_preset_uidx on public.community_posts (community_id, preset_id) where preset_id is not null;
create index community_posts_feed_idx on public.community_posts (community_id, created_at desc, id desc);
create index community_posts_pinned_idx on public.community_posts (community_id, pinned_at desc) where pinned_at is not null;
create index community_posts_author_idx on public.community_posts (author_id, created_at desc);
alter table public.community_posts enable row level security;

create trigger community_posts_touch_updated_at
  before update on public.community_posts
  for each row execute function public.touch_chat_group_updated_at();

-- ============================================================================
-- 4. Duyurular
-- ============================================================================

create table public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint community_announcements_title_len check (char_length(btrim(title)) between 1 and 120),
  constraint community_announcements_body_len check (char_length(btrim(body)) between 1 and 2000)
);
create index community_announcements_list_idx on public.community_announcements (community_id, pinned desc, created_at desc, id);
alter table public.community_announcements enable row level security;

-- Sohbette bağlantılı duyuru: mesajın `announcement_id`'si doludur (yalnız RPC doldurur; istemci INSERT'i aşağıda engellenir).
alter table public.messages
  add column if not exists announcement_id uuid references public.community_announcements (id) on delete set null;
create index if not exists messages_announcement_idx on public.messages (announcement_id) where announcement_id is not null;

alter policy "Members can send messages in their conversations" on public.messages
  with check (auth.uid() = sender_id and announcement_id is null and public.can_send_message(conversation_id));

-- ============================================================================
-- 5. Etkinlikler
-- ============================================================================

create table public.community_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  location text,
  online_url text,
  status text not null default 'scheduled',
  going_count integer not null default 0,
  maybe_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_events_title_len check (char_length(btrim(title)) between 1 and 120),
  constraint community_events_description_len check (description is null or char_length(description) <= 2000),
  constraint community_events_location_len check (location is null or char_length(location) <= 200),
  constraint community_events_url_check check (online_url is null or (char_length(online_url) <= 500 and online_url ~* '^https?://[^\s]+$')),
  constraint community_events_status_check check (status in ('scheduled', 'cancelled')),
  constraint community_events_time_check check (ends_at is null or ends_at > starts_at),
  constraint community_events_counts_check check (going_count >= 0 and maybe_count >= 0)
);
create index community_events_list_idx on public.community_events (community_id, starts_at, id);
alter table public.community_events enable row level security;

create trigger community_events_protect_counters
  before insert or update of going_count, maybe_count on public.community_events
  for each row execute function public.protect_counter_columns('going_count', 'maybe_count');
create trigger community_events_touch_updated_at
  before update on public.community_events
  for each row execute function public.touch_chat_group_updated_at();

create table public.community_event_rsvps (
  event_id uuid not null references public.community_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint community_event_rsvps_status_check check (status in ('going', 'maybe', 'not_going'))
);
create index community_event_rsvps_user_idx on public.community_event_rsvps (user_id, status);
alter table public.community_event_rsvps enable row level security;

-- Katılımcı sayıları (denormalize, korumalı): yalnızca RSVP değişiminde, SECURITY DEFINER.
create or replace function public.handle_event_rsvp_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  update public.community_events e
     set going_count = (select count(*) from public.community_event_rsvps r where r.event_id = e.id and r.status = 'going'),
         maybe_count = (select count(*) from public.community_event_rsvps r where r.event_id = e.id and r.status = 'maybe')
   where e.id = v_event;
  return coalesce(new, old);
end;
$$;

create trigger community_event_rsvps_count
  after insert or update of status or delete on public.community_event_rsvps
  for each row execute function public.handle_event_rsvp_count();

-- ============================================================================
-- 6. Kurallar kabulü, raporlar, yer imleri
-- ============================================================================

-- Kuralları kabul zorunluysa (chat_groups.rules_required) katılım akışına etkisi: bkz. 20260920050000 ve docs/history/175-*.
create table public.community_rule_acceptances (
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rules_version integer not null,
  accepted_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
alter table public.community_rule_acceptances enable row level security;

-- Topluluk içi rapor kuyruğu (sitenin genel `reports` tablosundan AYRI: oradaki target_type kısıtını genişletmek
-- `drop constraint` gerektirirdi; ayrıca topluluk yöneticileri site moderasyonunu görmemeli).
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_kind text not null,
  post_id uuid references public.community_posts (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  status text not null default 'open',
  resolution text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_reports_kind_check check (target_kind in ('post', 'message')),
  constraint community_reports_status_check check (status in ('open', 'resolved', 'dismissed')),
  constraint community_reports_reason_len check (char_length(btrim(reason)) between 3 and 300),
  constraint community_reports_resolution_len check (resolution is null or char_length(resolution) <= 300),
  constraint community_reports_resolved_check check ((status = 'open') = (resolved_at is null))
);
create unique index community_reports_one_open_post_idx on public.community_reports (reporter_id, post_id) where status = 'open' and post_id is not null;
create unique index community_reports_one_open_message_idx on public.community_reports (reporter_id, message_id) where status = 'open' and message_id is not null;
create index community_reports_queue_idx on public.community_reports (community_id, status, created_at);
create index community_reports_reporter_idx on public.community_reports (reporter_id, created_at desc);
alter table public.community_reports enable row level security;

-- Topluluk yer imi: yalnızca herkese açık (ya da üyesi olunan) topluluklar; kullanıcıya özel, tek tercih modeli.
create table public.community_bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.chat_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, community_id)
);
create index community_bookmarks_community_idx on public.community_bookmarks (community_id);
alter table public.community_bookmarks enable row level security;

-- ============================================================================
-- 7. Okuma yetkisi yardımcısı + RLS
-- ============================================================================

-- Topluluğun gönderi/duyuru/etkinlik içeriğini çağıran okuyabilir mi: herkese açık topluluk (yasaklı değilse) ya da üyelik.
-- Kapalı topluluğun içeriği üyelik olmadan okunamaz (davetli/başvurucu da DEĞİL: onlar yalnız kartı görür).
create or replace function public.can_read_community(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      exists (select 1 from public.conversation_members m where m.conversation_id = p_community_id and m.user_id = auth.uid())
      or (
        exists (select 1 from public.chat_groups g where g.id = p_community_id and g.visibility = 'public')
        and not exists (select 1 from public.chat_group_bans b where b.group_id = p_community_id and b.user_id = auth.uid())
      )
    );
$$;

create policy "Readable communities expose their posts" on public.community_posts
  for select to authenticated using (public.can_read_community(community_id));
create policy "Readable communities expose their announcements" on public.community_announcements
  for select to authenticated using (public.can_read_community(community_id));
create policy "Readable communities expose their events" on public.community_events
  for select to authenticated using (public.can_read_community(community_id));
create policy "Members see RSVPs of their community events; everyone sees their own" on public.community_event_rsvps
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.community_events e where e.id = event_id and public.is_conversation_member(e.community_id))
  );
create policy "Users read their own rule acceptances" on public.community_rule_acceptances
  for select to authenticated using (user_id = auth.uid());
create policy "Reporters and community moderators read reports" on public.community_reports
  for select to authenticated using (
    reporter_id = auth.uid()
    or public.chat_group_can(community_id, 'moderate_posts')
    or public.chat_group_can(community_id, 'delete_messages')
  );
create policy "Users read their own community bookmarks" on public.community_bookmarks
  for select to authenticated using (user_id = auth.uid());

-- İstemci bu tablolara YAZAMAZ (politika yok + yetki geri alındı); anon hiçbirini göremez.
revoke all on public.community_posts, public.community_announcements, public.community_events, public.community_event_rsvps,
  public.community_rule_acceptances, public.community_reports, public.community_bookmarks from anon;
revoke insert, update, delete, truncate, references, trigger on public.community_posts, public.community_announcements,
  public.community_events, public.community_event_rsvps, public.community_rule_acceptances, public.community_reports,
  public.community_bookmarks from authenticated;

-- ============================================================================
-- 8. Sayaç / temizlik tetikleyicileri
-- ============================================================================

-- Gönderi sayısı (denormalize, korumalı).
create or replace function public.handle_community_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.chat_groups set post_count = post_count + 1 where id = new.community_id;
    return new;
  end if;
  update public.chat_groups set post_count = greatest(post_count - 1, 0) where id = old.community_id;
  return old;
end;
$$;

create trigger community_posts_count
  after insert or delete on public.community_posts
  for each row execute function public.handle_community_post_count();

-- Gönderi silinince (yazar, moderatör ya da içerik silinince cascade) o gönderiye ait AÇIK raporlar kapanır: sessizce askıda kalmaz.
create or replace function public.resolve_reports_on_post_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_reports
     set status = 'resolved', resolution = coalesce(resolution, 'content_removed'), resolved_at = now()
   where post_id = old.id and status = 'open';
  return old;
end;
$$;

create trigger community_posts_resolve_reports
  before delete on public.community_posts
  for each row execute function public.resolve_reports_on_post_delete();

-- Mesaj herkes için silinince ona ait açık raporlar kapanır.
create or replace function public.resolve_reports_on_message_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.community_reports
       set status = 'resolved', resolution = coalesce(resolution, 'content_removed'), resolved_at = now()
     where message_id = new.id and status = 'open';
  end if;
  return new;
end;
$$;

create trigger messages_resolve_reports
  after update of deleted_at on public.messages
  for each row execute function public.resolve_reports_on_message_delete();

-- Üyelikten ayrılan/çıkarılan kişinin o topluluğun etkinliklerindeki katılım cevapları silinir (sayaçlar tutarlı kalır).
create or replace function public.cleanup_member_rsvps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.community_event_rsvps r
   using public.community_events e
   where r.event_id = e.id and e.community_id = old.conversation_id and r.user_id = old.user_id;
  return old;
end;
$$;

create trigger conversation_members_cleanup_rsvps
  after delete on public.conversation_members
  for each row execute function public.cleanup_member_rsvps();

-- Kuralları kabul zorunlu bir toplulukta başvuru, güncel sürümün kabulü olmadan oluşamaz (başvuru yolu ne olursa olsun).
create or replace function public.require_rules_for_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.chat_groups;
begin
  select * into g from public.chat_groups where id = new.group_id;
  if found and g.rules_required and not exists (
    select 1 from public.community_rule_acceptances a
     where a.community_id = new.group_id and a.user_id = new.user_id and a.rules_version >= g.rules_version
  ) then
    raise exception 'rules_not_accepted';
  end if;
  return new;
end;
$$;

create trigger chat_group_join_requests_require_rules
  before insert on public.chat_group_join_requests
  for each row execute function public.require_rules_for_join_request();

-- ============================================================================
-- 9. EXECUTE yetkileri
-- ============================================================================

revoke execute on function public.handle_event_rsvp_count() from public, anon, authenticated;
revoke execute on function public.handle_community_post_count() from public, anon, authenticated;
revoke execute on function public.resolve_reports_on_post_delete() from public, anon, authenticated;
revoke execute on function public.resolve_reports_on_message_delete() from public, anon, authenticated;
revoke execute on function public.cleanup_member_rsvps() from public, anon, authenticated;
revoke execute on function public.require_rules_for_join_request() from public, anon, authenticated;
revoke execute on function public.can_read_community(uuid) from public, anon;
grant execute on function public.can_read_community(uuid) to authenticated;
