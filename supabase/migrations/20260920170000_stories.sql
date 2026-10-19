-- Promptly — Hikâyeler (docs/history/198-*).
--
-- Kısa ömürlü (24 saat) paylaşım katmanı: fotoğraf / kısa video / metin hikâyesi, isteğe bağlı mevcut bir Promptly içeriğine
-- BAŞVURU (kopya değil), metin katmanları, anket ya da soru çıkartması. Hedef kitle: herkese açık · takipçiler · üyesi olunan
-- tek bir topluluk. Etkileşimler: görüntüleyenler, emoji tepkisi, özel yanıt (mevcut mesajlaşma: `messages.story_id`), anket oyu,
-- soru yanıtı. Kalıcılık: sahibine özel arşiv + profilde öne çıkanlar. Taslaklar sahibine özel tabloda.
--
-- Kurallar (CLAUDE.md Bölüm 6 kalıpları):
--   * `stories` ve etkileşim tablolarına istemci YAZAMAZ (tek istisna: sahibin kendi hikâyesini/öne çıkanını silmesi ve taslaklar);
--     her yazma SECURITY DEFINER RPC'dir, kimlik `auth.uid()`; zaman sunucu saatidir (`expires_at` istemciden gelmez).
--   * Görünürlük tek yerde: `_story_visible(...)`. Okuma politikaları, Storage politikası, tepsi/etkileşim RPC'leri hepsi onu çağırır.
--     Süresi dolan hikâye sahibine (arşiv) ve — yalnız bir öne çıkana eklenmişse — ASIL hedef kitlesine görünür; öne çıkana eklemek
--     hikâyeyi kimseye AÇMAZ.
--   * Engelleme karşılıklı görünmezliktir; topluluk hikâyesi yalnız ÜYEYE görünür (herkese açık toplulukta da), üyelik bitince erişim de biter.
--   * Sayaçlar (`viewer_count`, `view_count`, `reaction_count`) yalnız RPC'lerle değişir; korumalı sütundur.
--   * Bildirim yalnız sunucuda üretilir, (alıcı, aktör, tür, hedef) başına bir kez.
-- Yalnızca ekleyici/değiştirici: `drop` YOK (iki CHECK kısıtı genişletilirken aynı adla yeniden kurulur — mevcut satırlar korunur).

-- ============================================================================
-- 0. Kişisel ayar: süresi dolan hikâyeler arşivde tutulsun mu?
-- ============================================================================

alter table public.profiles
  add column if not exists story_archive_enabled boolean not null default true;

-- ============================================================================
-- 1. Düzen (katman) doğrulaması — sürümlü JSON
-- ============================================================================
-- { "v": 1, "bg": "cobalt", "fit": "cover", "layers": [{ "id", "text", "x", "y", "align", "size", "color", "bg" }],
--   "link": { "x", "y" }, "sticker": { "x", "y" } }   (x, y: tuvalin 0–1 oranı; renkler adlandırılmış — hex saklanmaz)

create or replace function public._story_point_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare k text;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('x', 'y') then return false; end if;
  end loop;
  if jsonb_typeof(p -> 'x') <> 'number' or jsonb_typeof(p -> 'y') <> 'number' then return false; end if;
  return (p ->> 'x')::numeric between 0 and 1 and (p ->> 'y')::numeric between 0 and 1;
end;
$$;

create or replace function public._story_layout_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  l jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 8000 then return false; end if;
  if jsonb_typeof(p -> 'v') is distinct from 'number' or (p ->> 'v') <> '1' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('v', 'bg', 'fit', 'layers', 'link', 'sticker') then return false; end if;
  end loop;
  if p ? 'bg' and (jsonb_typeof(p -> 'bg') <> 'string' or (p ->> 'bg') not in ('cobalt', 'sunset', 'ink', 'paper', 'forest', 'berry')) then
    return false;
  end if;
  if p ? 'fit' and (jsonb_typeof(p -> 'fit') <> 'string' or (p ->> 'fit') not in ('cover', 'contain')) then return false; end if;
  if not public._story_point_ok(p -> 'link') or not public._story_point_ok(p -> 'sticker') then return false; end if;
  if p ? 'layers' then
    if jsonb_typeof(p -> 'layers') <> 'array' or jsonb_array_length(p -> 'layers') > 8 then return false; end if;
    for l in select value from jsonb_array_elements(p -> 'layers') loop
      if jsonb_typeof(l) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(l) loop
        if k not in ('id', 'text', 'x', 'y', 'align', 'size', 'color', 'bg') then return false; end if;
      end loop;
      if jsonb_typeof(l -> 'id') <> 'string' or char_length(l ->> 'id') not between 1 and 40 then return false; end if;
      if jsonb_typeof(l -> 'text') <> 'string' or char_length(btrim(l ->> 'text')) not between 1 and 300 then return false; end if;
      if not public._story_point_ok(jsonb_build_object('x', l -> 'x', 'y', l -> 'y')) then return false; end if;
      if jsonb_typeof(l -> 'align') <> 'string' or (l ->> 'align') not in ('left', 'center', 'right') then return false; end if;
      if jsonb_typeof(l -> 'size') <> 'string' or (l ->> 'size') not in ('s', 'm', 'l', 'xl') then return false; end if;
      if jsonb_typeof(l -> 'color') <> 'string' or (l ->> 'color') not in ('white', 'black', 'yellow', 'cobalt', 'orange', 'mint') then
        return false;
      end if;
      if jsonb_typeof(l -> 'bg') <> 'boolean' then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

-- ============================================================================
-- 2. Tablolar
-- ============================================================================

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'text')),
  -- Kimlik URL'si (…/object/public/story-media/<yazar>/<dosya>); dosya PRIVATE bucket'ta, gösterirken imzalanır.
  media_url text,
  media_mime text,
  media_width integer check (media_width is null or media_width between 1 and 10000),
  media_height integer check (media_height is null or media_height between 1 and 10000),
  media_duration_ms integer check (media_duration_ms is null or media_duration_ms between 1 and 60000),
  layout jsonb not null default '{"v": 1, "layers": []}'::jsonb,
  -- Mevcut içeriğe BAŞVURU: içerik kopyalanmaz; okuyan kendi RLS'iyle görür (gizlenen/silinen içerik kartta "erişilemiyor" olur).
  linked_type text check (linked_type in ('prompt', 'request', 'workflow', 'preset')),
  linked_id uuid,
  sticker_kind text check (sticker_kind in ('poll', 'question')),
  sticker_question text,
  sticker_options text[],
  audience text not null check (audience in ('public', 'followers', 'community')),
  community_id uuid references public.chat_groups (id) on delete cascade,
  client_token uuid not null,
  reshared_from uuid references public.stories (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  moderation_status text not null default 'visible' check (moderation_status in ('visible', 'removed')),
  moderated_at timestamptz,
  moderated_by uuid references public.profiles (id) on delete set null,
  viewer_count integer not null default 0,
  view_count integer not null default 0,
  reaction_count integer not null default 0,
  constraint stories_author_client_token_key unique (author_id, client_token),
  constraint stories_media_matches_kind check (
    (kind = 'text' and media_url is null and media_mime is null)
    or (kind = 'image' and media_url is not null and media_mime in ('image/jpeg', 'image/png', 'image/webp') and media_duration_ms is null)
    or (kind = 'video' and media_url is not null and media_mime in ('video/mp4', 'video/webm', 'video/quicktime'))
  ),
  constraint stories_link_pair check ((linked_type is null) = (linked_id is null)),
  constraint stories_audience_community check ((audience = 'community') = (community_id is not null)),
  constraint stories_sticker_shape check (
    (sticker_kind is null and sticker_question is null and sticker_options is null)
    or (sticker_kind = 'question' and char_length(btrim(sticker_question)) between 1 and 120 and sticker_options is null)
    or (sticker_kind = 'poll' and char_length(btrim(sticker_question)) between 1 and 80
        and cardinality(sticker_options) between 2 and 4)
  ),
  constraint stories_layout_valid check (public._story_layout_ok(layout)),
  constraint stories_text_has_body check (
    kind <> 'text' or linked_id is not null or sticker_kind is not null or jsonb_array_length(coalesce(layout -> 'layers', '[]'::jsonb)) > 0
  ),
  constraint stories_expiry_after_creation check (expires_at > created_at)
);
alter table public.stories enable row level security;
create index stories_author_created_idx on public.stories (author_id, created_at desc);
create index stories_active_idx on public.stories (expires_at) where moderation_status = 'visible';
create index stories_community_idx on public.stories (community_id, expires_at) where community_id is not null;
create index stories_media_path_idx on public.stories ((substring(media_url from '/storage/v1/object/public/story-media/([^?#]+)')));

create or replace trigger stories_protect_counters
  before insert or update of viewer_count, view_count, reaction_count on public.stories
  for each row execute function public.protect_counter_columns('viewer_count', 'view_count', 'reaction_count');

-- Görüntüleme: (hikâye, izleyen) başına TEK satır = benzersiz görüntüleyen; `view_count` aynı kişinin yeniden izlemelerini sayar
-- (en çok 10 dakikada bir). İstemci yazmaz; yalnız `mark_story_viewed`.
create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1,
  primary key (story_id, viewer_id)
);
alter table public.story_views enable row level security;
create index story_views_viewer_idx on public.story_views (viewer_id, story_id);

-- Kişi başına tek tepki (değiştirilebilir/kaldırılabilir); yalnız `set_story_reaction`.
create table public.story_reactions (
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.story_reactions enable row level security;

-- Anket oyu: kişi başına tek oy (PRIMARY KEY), hikâye etkinken değiştirilebilir. Sayılar bu satırlardan hesaplanır.
create table public.story_poll_votes (
  story_id uuid not null references public.stories (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (story_id, voter_id)
);
alter table public.story_poll_votes enable row level security;

-- Soru yanıtları: yalnız yanıtlayan ve hikâye sahibi okur; otomatik olarak hiçbir yerde yayımlanmaz.
create table public.story_question_answers (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  responder_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table public.story_question_answers enable row level security;
create index story_question_answers_story_idx on public.story_question_answers (story_id, created_at desc);

-- Öne çıkanlar (profil koleksiyonu) + sıralı üyelik.
create table public.story_highlights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 30),
  cover_story_id uuid references public.stories (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.story_highlights enable row level security;
create index story_highlights_owner_idx on public.story_highlights (owner_id, position);

create table public.story_highlight_items (
  highlight_id uuid not null references public.story_highlights (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (highlight_id, story_id)
);
alter table public.story_highlight_items enable row level security;
create index story_highlight_items_story_idx on public.story_highlight_items (story_id);

-- Taslaklar: yalnız sahibine; yayımlanmış hikâye DEĞİLDİR (ayrı tablo), yayımlama yine `create_story` doğrulamasından geçer.
create table public.story_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16000),
  media_url text,
  media_mime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.story_drafts enable row level security;
create index story_drafts_owner_idx on public.story_drafts (owner_id, updated_at desc);

-- Hikâyeye özel yanıt = normal birebir mesaj; yalnız RPC doldurur (aşağıdaki INSERT politikası istemciyi engeller).
-- `is_story_reply` hikâye silinse de (story_id → null) "bir hikâyeye yanıt" bilgisini korur.
alter table public.messages
  add column if not exists story_id uuid references public.stories (id) on delete set null,
  add column if not exists is_story_reply boolean not null default false;
create index if not exists messages_story_idx on public.messages (story_id) where story_id is not null;

alter policy "Members can send messages in their conversations" on public.messages
  with check (
    auth.uid() = sender_id and announcement_id is null and story_id is null and not is_story_reply
    and public.can_send_message(conversation_id)
  );

-- ============================================================================
-- 3. Görünürlük — TEK kaynak
-- ============================================================================

create or replace function public._story_visible(
  p_story_id uuid, p_author_id uuid, p_audience text, p_community_id uuid, p_expires_at timestamptz, p_moderation_status text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and p_author_id = auth.uid() then true
    when exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'moderator') then true
    when p_moderation_status <> 'visible' then false
    when auth.uid() is not null and public.is_blocked(auth.uid(), p_author_id) then false
    when p_expires_at <= now() and not exists (select 1 from public.story_highlight_items i where i.story_id = p_story_id) then false
    when p_audience = 'public' then true
    when auth.uid() is null then false
    when p_audience = 'followers' then
      exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p_author_id)
    when p_audience = 'community' then
      exists (select 1 from public.conversation_members m where m.conversation_id = p_community_id and m.user_id = auth.uid())
    else false
  end;
$$;

create or replace function public.can_view_story(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stories s
     where s.id = p_story_id
       and public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status)
  );
$$;

-- Bir öne çıkan, çağıranın görebildiği en az bir hikâye içeriyorsa görünür (boş görünen öne çıkan profilde çizilmez).
create or replace function public._story_highlight_visible(p_highlight_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.story_highlight_items i
      join public.stories s on s.id = i.story_id
     where i.highlight_id = p_highlight_id
       and public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status)
  );
$$;

-- Storage: dosya, onu gösteren hikâye çağırana görünürken okunur (sahip kendi klasörünü ayrıca hep okur).
create or replace function public.can_read_story_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stories s
     where substring(s.media_url from '/storage/v1/object/public/story-media/([^?#]+)') = p_object_name
       and public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status)
  );
$$;

-- ============================================================================
-- 4. RLS
-- ============================================================================

create policy "Stories are readable by their audience"
  on public.stories for select to anon, authenticated
  using (public._story_visible(id, author_id, audience, community_id, expires_at, moderation_status));

create policy "Authors can delete their own stories"
  on public.stories for delete to authenticated
  using (author_id = auth.uid());

create policy "Viewers see their own view rows, authors see who viewed"
  on public.story_views for select to authenticated
  using (viewer_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));

create policy "Reactors see their own reaction, authors see all reactions"
  on public.story_reactions for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));

create policy "Voters see their own vote, authors see all votes"
  on public.story_poll_votes for select to authenticated
  using (voter_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));

create policy "Responders and story authors read answers"
  on public.story_question_answers for select to authenticated
  using (responder_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));

create policy "Responders and story authors delete answers"
  on public.story_question_answers for delete to authenticated
  using (responder_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid()));

create policy "Highlights are readable by owner or when a story inside is visible"
  on public.story_highlights for select to anon, authenticated
  using (owner_id = auth.uid() or public._story_highlight_visible(id));

create policy "Owners delete their highlights"
  on public.story_highlights for delete to authenticated
  using (owner_id = auth.uid());

create policy "Highlight items follow their story's visibility"
  on public.story_highlight_items for select to anon, authenticated
  using (
    exists (select 1 from public.story_highlights h where h.id = highlight_id and h.owner_id = auth.uid())
    or public.can_view_story(story_id)
  );

create policy "Owners read their drafts" on public.story_drafts for select to authenticated using (owner_id = auth.uid());
create policy "Owners create drafts" on public.story_drafts for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (media_url is null or substring(media_url from '/storage/v1/object/public/story-media/([0-9a-f-]{36})/') = auth.uid()::text)
  );
create policy "Owners update drafts" on public.story_drafts for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (media_url is null or substring(media_url from '/storage/v1/object/public/story-media/([0-9a-f-]{36})/') = auth.uid()::text)
  );
create policy "Owners delete drafts" on public.story_drafts for delete to authenticated using (owner_id = auth.uid());

create or replace function public.enforce_story_draft_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and (select count(*) from public.story_drafts where owner_id = new.owner_id) >= 20 then
    raise exception 'draft_limit';
  end if;
  return new;
end;
$$;
create trigger story_drafts_limit before insert or update on public.story_drafts
  for each row execute function public.enforce_story_draft_limit();

-- ============================================================================
-- 5. Storage: PRIVATE `story-media`
-- ============================================================================
-- Yol `{yazar}/{uuid}.{jpg|mp4|webm|mov}`: ad istemci girdisinden türetilmez; MIME ve boyut bucket'ta sunucu tarafında sınırlı.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-media', 'story-media', false, 41943040,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "Story media is readable while its story is"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'story-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'moderator')
      or public.can_read_story_media(name)
    )
  );

create policy "Users upload story media into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'story-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|mp4|webm|mov)$'
  );

create policy "Users delete their own story media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'story-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 6. Bildirimler
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow', 'like', 'comment', 'comment_reply', 'request_response', 'message', 'message_request', 'system',
  'prompt_edited', 'request_edited', 'edit_suggestion_received', 'edit_suggestion_accepted',
  'edit_suggestion_rejected', 'prompt_result_shared',
  'story_reaction', 'story_poll_vote', 'story_question_answer'));

-- (alıcı, aktör, tür, hedef) başına tek bildirim; kendine bildirim yok; engel varsa yok.
create or replace function public._story_notify(p_recipient uuid, p_actor uuid, p_type text, p_message text, p_href text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient = p_actor or public.is_blocked(p_recipient, p_actor) then
    return;
  end if;
  if exists (
    select 1 from public.notifications n
     where n.recipient_id = p_recipient and n.actor_id = p_actor and n.type = p_type and n.target_href = p_href
  ) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (p_recipient, p_actor, p_type, p_message, p_href);
end;
$$;

-- Hikâyeye yanıt mesajı "Hikâyene yanıt verdi" olarak bildirilir; diğer mesajlar 174'teki ile birebir aynı.
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
        when new.is_story_reply then 'Hikâyene yanıt verdi: ' || v_preview
        when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi: ' || v_preview
        else 'Sana bir mesaj gönderdi: ' || v_preview
      end,
      '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id
    );
  end loop;

  return new;
end;
$$;

-- ============================================================================
-- 7. Yazma RPC'leri
-- ============================================================================

-- Yayımla (idempotent: aynı `client_token` ikinci kez yeni satır üretmez, ilk hikâyenin kimliğini döner).
create or replace function public.create_story(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles;
  v_token uuid;
  v_id uuid;
  v_kind text := p ->> 'kind';
  v_media text := nullif(p ->> 'media_url', '');
  v_mime text := nullif(p ->> 'media_mime', '');
  v_path text;
  v_layout jsonb := coalesce(p -> 'layout', '{"v": 1, "layers": []}'::jsonb);
  v_linked_type text := nullif(p ->> 'linked_type', '');
  v_linked_id uuid;
  v_sticker text := nullif(p ->> 'sticker_kind', '');
  v_question text := nullif(btrim(coalesce(p ->> 'sticker_question', '')), '');
  v_options text[];
  v_audience text := coalesce(p ->> 'audience', 'followers');
  v_community uuid;
  v_role text;
  g public.chat_groups;
  v_info record;
  v_duration integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_actor;
  if not found then raise exception 'not_authenticated'; end if;
  if (v_profile.suspended_until is not null and v_profile.suspended_until > now()) or v_profile.posting_blocked then
    raise exception 'forbidden';
  end if;

  begin
    v_token := (p ->> 'client_token')::uuid;
    v_linked_id := nullif(p ->> 'linked_id', '')::uuid;
    v_community := nullif(p ->> 'community_id', '')::uuid;
    v_duration := nullif(p ->> 'media_duration_ms', '')::integer;
  exception when others then
    raise exception 'invalid_story';
  end;
  if v_token is null then raise exception 'invalid_story'; end if;

  -- İdempotentlik: çift dokunma / ağ yeniden denemesi.
  select id into v_id from public.stories where author_id = v_actor and client_token = v_token;
  if v_id is not null then return v_id; end if;

  if (select count(*) from public.stories where author_id = v_actor and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'story_rate_limit';
  end if;

  if v_kind not in ('image', 'video', 'text') then raise exception 'invalid_story'; end if;
  if v_kind = 'text' then
    if v_media is not null then raise exception 'invalid_story'; end if;
    v_mime := null;
  else
    v_path := substring(v_media from '/storage/v1/object/public/story-media/([^?#]+)$');
    if v_path is null or v_path !~ ('^' || v_actor::text || '/[0-9a-f-]{36}\.(jpg|mp4|webm|mov)$') then
      raise exception 'invalid_media';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'story-media' and o.name = v_path) then
      raise exception 'media_missing';
    end if;
    if (v_kind = 'image' and v_mime not in ('image/jpeg', 'image/png', 'image/webp'))
       or (v_kind = 'video' and v_mime not in ('video/mp4', 'video/webm', 'video/quicktime')) then
      raise exception 'invalid_media';
    end if;
    if v_kind = 'video' and (v_duration is null or v_duration not between 1 and 60000) then
      raise exception 'video_too_long';
    end if;
  end if;

  if not public._story_layout_ok(v_layout) then raise exception 'invalid_layout'; end if;
  if v_kind = 'text' and v_linked_type is null and v_sticker is null
     and jsonb_array_length(coalesce(v_layout -> 'layers', '[]'::jsonb)) = 0 then
    raise exception 'empty_story';
  end if;

  if v_linked_type is not null or v_linked_id is not null then
    if v_linked_type not in ('prompt', 'request', 'workflow', 'preset') or v_linked_id is null then
      raise exception 'invalid_story';
    end if;
    select * into v_info from public._community_content_info(v_linked_type, v_linked_id);
    -- Yalnız yayında + herkese açık içerik bağlanır; özel içeriğin varlığı sızmaz.
    if not found or not v_info.shareable then raise exception 'content_not_found'; end if;
    if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then raise exception 'content_not_found'; end if;
  end if;

  if v_sticker is not null then
    if v_sticker not in ('poll', 'question') or v_question is null then raise exception 'invalid_sticker'; end if;
    if v_sticker = 'poll' then
      if jsonb_typeof(p -> 'sticker_options') <> 'array' then raise exception 'invalid_sticker'; end if;
      select array_agg(btrim(value) order by ord) into v_options
        from jsonb_array_elements_text(p -> 'sticker_options') with ordinality as t(value, ord);
      if char_length(v_question) > 80 or cardinality(v_options) not between 2 and 4
         or exists (select 1 from unnest(v_options) o where char_length(o) not between 1 and 40) then
        raise exception 'invalid_sticker';
      end if;
    elsif char_length(v_question) > 120 then
      raise exception 'invalid_sticker';
    end if;
  else
    v_question := null;
  end if;

  if v_audience not in ('public', 'followers', 'community') then raise exception 'invalid_story'; end if;
  if v_audience = 'community' then
    if v_community is null then raise exception 'invalid_story'; end if;
    select * into g from public.chat_groups where id = v_community;
    v_role := public._group_member_role(v_community, v_actor);
    if g.id is null or v_role is null then raise exception 'forbidden'; end if;
    if g.closed_at is not null then raise exception 'community_closed'; end if;
    if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then raise exception 'forbidden'; end if;
  else
    v_community := null;
  end if;

  insert into public.stories (
    author_id, kind, media_url, media_mime, media_width, media_height, media_duration_ms, layout,
    linked_type, linked_id, sticker_kind, sticker_question, sticker_options, audience, community_id,
    client_token, reshared_from, expires_at
  ) values (
    v_actor, v_kind, v_media, v_mime,
    case when v_kind = 'text' then null else nullif(p ->> 'media_width', '')::integer end,
    case when v_kind = 'text' then null else nullif(p ->> 'media_height', '')::integer end,
    case when v_kind = 'video' then v_duration end,
    v_layout, v_linked_type, v_linked_id, v_sticker, v_question, v_options, v_audience, v_community,
    v_token, nullif(p ->> 'reshared_from', '')::uuid, now() + interval '24 hours'
  )
  on conflict (author_id, client_token) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.stories where author_id = v_actor and client_token = v_token;
  end if;
  return v_id;
end;
$$;

-- Arşivden yeniden paylaş: YENİ bir hikâye (yeni 24 saat, seçilen hedef kitle); orijinalin süresi/erişimi değişmez. Çıkartma kopyalanmaz.
create or replace function public.reshare_story(p_story_id uuid, p_audience text, p_community_id uuid, p_client_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stories;
begin
  select * into s from public.stories where id = p_story_id;
  if not found or s.author_id is distinct from auth.uid() or s.moderation_status <> 'visible' then
    raise exception 'story_not_found';
  end if;
  return public.create_story(jsonb_build_object(
    'client_token', p_client_token, 'kind', s.kind, 'media_url', s.media_url, 'media_mime', s.media_mime,
    'media_width', s.media_width, 'media_height', s.media_height, 'media_duration_ms', s.media_duration_ms,
    'layout', s.layout - 'sticker', 'linked_type', s.linked_type, 'linked_id', s.linked_id,
    'audience', p_audience, 'community_id', p_community_id, 'reshared_from', s.id
  ));
end;
$$;

-- Etkileşim ön koşulu: hikâye var, çağırana görünür, ETKİN (süresi dolmamış), sahibi çağıran değil.
create or replace function public._story_for_interaction(p_story_id uuid)
returns public.stories
language plpgsql
stable
security definer
set search_path = public
as $$
declare s public.stories;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from public.stories where id = p_story_id;
  if not found or s.moderation_status <> 'visible'
     or not public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status)
     or public.is_blocked(auth.uid(), s.author_id) then
    raise exception 'story_not_found';
  end if;
  if s.expires_at <= now() then raise exception 'story_expired'; end if;
  if s.author_id = auth.uid() then raise exception 'own_story'; end if;
  return s;
end;
$$;

create or replace function public.mark_story_viewed(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.stories;
begin
  if v_uid is null then return; end if;
  select * into s from public.stories where id = p_story_id;
  if not found or s.author_id = v_uid then return; end if;
  if not public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status) then
    raise exception 'story_not_found';
  end if;
  insert into public.story_views (story_id, viewer_id) values (p_story_id, v_uid) on conflict do nothing;
  if found then
    update public.stories set viewer_count = viewer_count + 1, view_count = view_count + 1 where id = p_story_id;
    return;
  end if;
  update public.story_views
     set last_viewed_at = now(), view_count = view_count + 1
   where story_id = p_story_id and viewer_id = v_uid and last_viewed_at < now() - interval '10 minutes';
  if found then
    update public.stories set view_count = view_count + 1 where id = p_story_id;
  end if;
end;
$$;

-- Tepki: null = kaldır. Yalnız ilk tepki bildirim üretir (değiştirmek yeniden bildirmez).
create or replace function public.set_story_reaction(p_story_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stories;
  v_uid uuid := auth.uid();
  v_inserted boolean;
begin
  s := public._story_for_interaction(p_story_id);
  if p_emoji is null then
    delete from public.story_reactions where story_id = p_story_id and user_id = v_uid;
    if found then update public.stories set reaction_count = greatest(reaction_count - 1, 0) where id = p_story_id; end if;
    return;
  end if;
  if p_emoji not in ('❤️', '🔥', '😂', '😮', '😢', '👏', '💡', '🙌') then raise exception 'invalid_reaction'; end if;
  insert into public.story_reactions (story_id, user_id, emoji) values (p_story_id, v_uid, p_emoji)
  on conflict (story_id, user_id) do update set emoji = excluded.emoji, updated_at = now()
  returning (xmax = 0) into v_inserted;
  if v_inserted then
    update public.stories set reaction_count = reaction_count + 1 where id = p_story_id;
    perform public._story_notify(s.author_id, v_uid, 'story_reaction', 'Hikâyene tepki verdi: ' || p_emoji, '/stories?id=' || s.id);
  end if;
end;
$$;

-- Anket: kişi başına tek oy; hikâye etkinken değiştirilebilir (politika). Sahibi oy veremez.
create or replace function public.vote_story_poll(p_story_id uuid, p_option integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stories;
  v_uid uuid := auth.uid();
  v_inserted boolean;
begin
  s := public._story_for_interaction(p_story_id);
  if s.sticker_kind is distinct from 'poll' or p_option is null or p_option < 0 or p_option >= cardinality(s.sticker_options) then
    raise exception 'invalid_vote';
  end if;
  insert into public.story_poll_votes (story_id, voter_id, option_index) values (p_story_id, v_uid, p_option)
  on conflict (story_id, voter_id) do update set option_index = excluded.option_index, updated_at = now()
  returning (xmax = 0) into v_inserted;
  if v_inserted then
    perform public._story_notify(s.author_id, v_uid, 'story_poll_vote', 'Hikâyendeki ankete oy verdi.', '/stories?id=' || s.id);
  end if;
end;
$$;

-- Sonuçlar oy kayıtlarından hesaplanır; sayılar yalnız sahibine ve oy vermiş olana açılır.
create or replace function public.story_poll_results(p_story_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.stories;
  v_uid uuid := auth.uid();
  v_mine integer;
  v_counts jsonb;
  v_total integer;
begin
  select * into s from public.stories where id = p_story_id;
  if not found or s.sticker_kind is distinct from 'poll'
     or not public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status) then
    raise exception 'story_not_found';
  end if;
  select option_index into v_mine from public.story_poll_votes where story_id = p_story_id and voter_id = v_uid;
  if v_uid is distinct from s.author_id and v_mine is null then
    return jsonb_build_object('revealed', false, 'my_vote', null, 'total', null, 'counts', null);
  end if;
  select coalesce(jsonb_agg(coalesce(c.n, 0) order by i), '[]'::jsonb), coalesce(sum(c.n), 0)
    into v_counts, v_total
    from generate_series(0, cardinality(s.sticker_options) - 1) as i
    left join (select option_index, count(*)::integer as n from public.story_poll_votes where story_id = p_story_id group by option_index) c
      on c.option_index = i;
  return jsonb_build_object('revealed', true, 'my_vote', v_mine, 'total', v_total, 'counts', v_counts);
end;
$$;

-- Soru yanıtı: kişi başına bir hikâyede en çok 5; sahibine bildirim (kişi/hikâye başına bir kez).
create or replace function public.answer_story_question(p_story_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stories;
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid := gen_random_uuid();
begin
  s := public._story_for_interaction(p_story_id);
  if s.sticker_kind is distinct from 'question' then raise exception 'invalid_answer'; end if;
  if char_length(v_body) not between 1 and 300 then raise exception 'invalid_answer'; end if;
  if (select count(*) from public.story_question_answers where story_id = p_story_id and responder_id = v_uid) >= 5 then
    raise exception 'answer_limit';
  end if;
  insert into public.story_question_answers (id, story_id, responder_id, body) values (v_id, p_story_id, v_uid, v_body);
  perform public._story_notify(s.author_id, v_uid, 'story_question_answer', 'Hikâyendeki soruyu yanıtladı.', '/stories?id=' || s.id);
  return v_id;
end;
$$;

-- Özel yanıt = mevcut birebir sohbete normal mesaj (yeni mesajlaşma altyapısı yok). Mesaj gizlilik/engel kuralları aynen geçerli.
create or replace function public.reply_to_story(p_story_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stories;
  v_body text := btrim(coalesce(p_body, ''));
  v_conversation uuid;
  v_message uuid := gen_random_uuid();
begin
  s := public._story_for_interaction(p_story_id);
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid_reply'; end if;
  begin
    v_conversation := public.start_direct_conversation(s.author_id);
  exception when others then
    raise exception 'reply_not_allowed';
  end;
  if not public.can_send_message(v_conversation) then raise exception 'reply_not_allowed'; end if;
  insert into public.messages (id, conversation_id, sender_id, body, story_id, is_story_reply)
  values (v_message, v_conversation, auth.uid(), v_body, s.id, true);
  return jsonb_build_object('conversation_id', v_conversation, 'message_id', v_message);
end;
$$;

-- Sahibine: kimler gördü (+ tepkisi). Başkasına hiçbir şey dönmez.
create or replace function public.story_viewers(p_story_id uuid)
returns table (
  viewer_id uuid, username text, display_name text, avatar_url text,
  first_viewed_at timestamptz, last_viewed_at timestamptz, view_count integer, reaction text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.viewer_id, p.username, p.display_name, p.avatar_url, v.first_viewed_at, v.last_viewed_at, v.view_count, r.emoji
    from public.story_views v
    join public.stories s on s.id = v.story_id and s.author_id = auth.uid()
    join public.profiles p on p.id = v.viewer_id
    left join public.story_reactions r on r.story_id = v.story_id and r.user_id = v.viewer_id
   where v.story_id = p_story_id
   order by v.last_viewed_at desc
   limit 500;
$$;

-- Hikâye şeridi: kişi başına bir halka. Kapsam: ben + takip ettiklerim (genel hikâyeleri) + üyesi olduğum toplulukların
-- hikâyeleri. `p_community_id` verilirse yalnız o topluluğun (çağıranın görebildiği) etkin hikâyeleri.
create or replace function public.story_tray(p_community_id uuid default null)
returns table (
  author_id uuid, username text, display_name text, avatar_url text,
  story_ids uuid[], unseen_count integer, latest_at timestamptz, community_story_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select s.id, s.author_id, s.created_at, s.community_id
      from public.stories s
     where s.expires_at > now()
       and s.moderation_status = 'visible'
       and public._story_visible(s.id, s.author_id, s.audience, s.community_id, s.expires_at, s.moderation_status)
       and (
         case
           when p_community_id is not null then s.community_id = p_community_id
           else auth.uid() is not null and (
             s.author_id = auth.uid()
             or (s.community_id is null
                 and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = s.author_id))
             or (s.community_id is not null
                 and exists (select 1 from public.conversation_members m where m.conversation_id = s.community_id and m.user_id = auth.uid()))
           )
         end
       )
  ),
  grouped as (
    select c.author_id,
           array_agg(c.id order by c.created_at, c.id) as ids,
           (count(*) filter (
              where c.author_id is distinct from auth.uid()
                and not exists (select 1 from public.story_views v where v.story_id = c.id and v.viewer_id = auth.uid())
           ))::integer as unseen,
           max(c.created_at) as latest,
           (count(*) filter (where c.community_id is not null))::integer as community_count
      from candidates c
     group by c.author_id
  )
  select g.author_id, p.username, p.display_name, p.avatar_url, g.ids, g.unseen, g.latest, g.community_count
    from grouped g
    join public.profiles p on p.id = g.author_id
   order by (g.author_id = auth.uid()) desc nulls last, (g.unseen > 0) desc, g.latest desc
   limit 150;
$$;

-- Öne çıkan oluştur/güncelle: başlık + TAM sıralı hikâye listesi (yalnız çağıranın kaldırılmamış hikâyeleri).
create or replace function public.save_story_highlight(p_highlight_id uuid, p_title text, p_story_ids uuid[], p_cover_story_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_ids uuid[] := coalesce(p_story_ids, '{}'::uuid[]);
  v_id uuid := p_highlight_id;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_title) not between 1 and 30 then raise exception 'invalid_highlight'; end if;
  if cardinality(v_ids) not between 1 and 100 or cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'invalid_highlight';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
     where not exists (select 1 from public.stories s where s.id = x and s.author_id = v_uid and s.moderation_status = 'visible')
  ) then
    raise exception 'story_not_found';
  end if;
  if p_cover_story_id is not null and not (p_cover_story_id = any (v_ids)) then raise exception 'invalid_highlight'; end if;

  if v_id is null then
    if (select count(*) from public.story_highlights where owner_id = v_uid) >= 50 then raise exception 'highlight_limit'; end if;
    v_id := gen_random_uuid();
    insert into public.story_highlights (id, owner_id, title, cover_story_id, position)
    values (v_id, v_uid, v_title, coalesce(p_cover_story_id, v_ids[1]),
            coalesce((select max(position) + 1 from public.story_highlights where owner_id = v_uid), 0));
  else
    update public.story_highlights
       set title = v_title, cover_story_id = coalesce(p_cover_story_id, v_ids[1]), updated_at = now()
     where id = v_id and owner_id = v_uid;
    if not found then raise exception 'highlight_not_found'; end if;
    delete from public.story_highlight_items where highlight_id = v_id and not (story_id = any (v_ids));
  end if;

  insert into public.story_highlight_items (highlight_id, story_id, position)
  select v_id, x, ord::integer from unnest(v_ids) with ordinality as t(x, ord)
  on conflict (highlight_id, story_id) do update set position = excluded.position;
  return v_id;
end;
$$;

create or replace function public.add_story_to_highlight(p_highlight_id uuid, p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.story_highlights where id = p_highlight_id and owner_id = v_uid) then
    raise exception 'highlight_not_found';
  end if;
  if not exists (select 1 from public.stories where id = p_story_id and author_id = v_uid and moderation_status = 'visible') then
    raise exception 'story_not_found';
  end if;
  if (select count(*) from public.story_highlight_items where highlight_id = p_highlight_id) >= 100 then
    raise exception 'highlight_full';
  end if;
  insert into public.story_highlight_items (highlight_id, story_id, position)
  values (p_highlight_id, p_story_id,
          coalesce((select max(position) + 1 from public.story_highlight_items where highlight_id = p_highlight_id), 1))
  on conflict do nothing;
  update public.story_highlights set updated_at = now() where id = p_highlight_id;
end;
$$;

create or replace function public.reorder_story_highlights(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.story_highlights h
     set position = t.ord::integer
    from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as t(id, ord)
   where h.id = t.id and h.owner_id = auth.uid();
end;
$$;

-- Site moderatörü: kaldır / geri al (kaldırılan hikâye sahibine "kaldırıldı" olarak görünür, kimseye görünmez).
create or replace function public.moderate_story(p_story_id uuid, p_remove boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then raise exception 'forbidden'; end if;
  update public.stories
     set moderation_status = case when p_remove then 'removed' else 'visible' end,
         moderated_at = now(), moderated_by = auth.uid()
   where id = p_story_id;
  if not found then raise exception 'story_not_found'; end if;
end;
$$;

-- Topluluk yönetimi: `moderate_posts` yeteneği olan kişi o topluluğun hikâyesini kaldırır; yazara sistem bildirimi.
create or replace function public.remove_community_story(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stories;
  v_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from public.stories where id = p_story_id;
  if not found or s.community_id is null or not public._group_can(s.community_id, auth.uid(), 'moderate_posts') then
    raise exception 'forbidden';
  end if;
  if s.author_id <> auth.uid() and public._community_member_rank(s.community_id, s.author_id) >= public._community_member_rank(s.community_id, auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.stories set moderation_status = 'removed', moderated_at = now(), moderated_by = auth.uid() where id = p_story_id;
  select name into v_name from public.chat_groups where id = s.community_id;
  if s.author_id <> auth.uid() then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (s.author_id, auth.uid(), 'system', '"' || coalesce(v_name, '') || '" topluluğundaki hikâyen kaldırıldı.', '/stories/archive');
  end if;
end;
$$;

-- ============================================================================
-- 8. Şikâyet: yeni hedef türü `story` (moderasyon kuyruğu + kaldırma)
-- ============================================================================

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('prompt', 'comment', 'request', 'user', 'message', 'workflow', 'preset', 'story'));

create or replace function public.moderate_report(p_report_id uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  if p_action not in ('dismissed', 'reviewed', 'removed') then raise exception 'Geçersiz işlem.'; end if;
  select * into r from public.reports where id = p_report_id;
  if not found then raise exception 'Şikâyet bulunamadı.'; end if;
  if p_action = 'removed' then
    if r.target_type = 'prompt' then delete from public.prompts where id = r.target_id;
    elsif r.target_type = 'request' then delete from public.prompt_requests where id = r.target_id;
    elsif r.target_type = 'workflow' then delete from public.workflows where id = r.target_id;
    elsif r.target_type = 'preset' then delete from public.presets where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    elsif r.target_type = 'story' then
      update public.stories set moderation_status = 'removed', moderated_at = now(), moderated_by = auth.uid()
        where id = r.target_id;
    else raise exception 'Bu hedef türü kaldırılamaz.';
    end if;
  end if;
  update public.reports
    set status = case when p_action = 'dismissed' then 'dismissed' else 'reviewed' end,
        reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_report_id;
  if p_action = 'removed' then
    update public.reports set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
      resolution_note = coalesce(resolution_note, 'İçerik kaldırıldı.')
      where target_type = r.target_type and target_id = r.target_id and status = 'open';
  end if;
end $function$;

create or replace function public.moderation_report_queue(p_status text default 'open')
 returns table(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join lateral (
    select true as exists_, p.title as title, p.author_id as author_id, '/prompts/local?id=' || p.id as href
      from public.prompts p where r.target_type = 'prompt' and p.id = r.target_id
    union all
    select true, q.title, q.author_id, '/requests/local?id=' || q.id
      from public.prompt_requests q where r.target_type = 'request' and q.id = r.target_id
    union all
    select true, w.title, w.creator_id, '/workflows/local?id=' || w.id
      from public.workflows w where r.target_type = 'workflow' and w.id = r.target_id
    union all
    select true, s.title, s.creator_id, '/presets/local?id=' || s.id
      from public.presets s where r.target_type = 'preset' and s.id = r.target_id
    union all
    select true, left(c.body, 300), c.author_id, null::text
      from public.prompt_comments c where r.target_type = 'comment' and c.id = r.target_id
    union all
    select true, left(coalesce(m.body, ''), 300), m.sender_id, null::text
      from public.messages m where r.target_type = 'message' and m.id = r.target_id
    union all
    select true, u.display_name, u.id, '/profile/real?username=' || u.username
      from public.profiles u where r.target_type = 'user' and u.id = r.target_id
    union all
    select true, left(coalesce(st.layout -> 'layers' -> 0 ->> 'text', st.sticker_question, st.kind), 300), st.author_id, '/stories?id=' || st.id
      from public.stories st where r.target_type = 'story' and st.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $function$;

-- ============================================================================
-- 9. Saklama ve temizlik
-- ============================================================================
-- Politika: süresi dolan hikâye öne çıkanda değilse — arşiv AÇIKSA 365 gün, KAPALIYSA 1 saat sonra — silinir (tepki/görüntüleme/oy/yanıt
-- satırları birlikte; mesajdaki başvuru `null`, "hikâyeye yanıt" bilgisi kalır). 30 günden eski taslaklar silinir. Dosyalar ilk an
-- yetim kalır (hiçbir satır göstermez → kimse okuyamaz) ve mevcut `cleanup-orphan-storage` Storage API'siyle siler.
-- Erişim kuralları silmeye BAĞLI DEĞİLDİR: süresi dolan hikâye anında aktif listelerden ve yetkisiz erişimden çıkar.

create or replace function public.purge_expired_stories()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stories integer;
  v_drafts integer;
begin
  delete from public.stories s
   using public.profiles p
   where p.id = s.author_id
     and not exists (select 1 from public.story_highlight_items i where i.story_id = s.id)
     and s.expires_at < now() - case when p.story_archive_enabled then interval '365 days' else interval '1 hour' end;
  get diagnostics v_stories = row_count;
  delete from public.story_drafts where updated_at < now() - interval '30 days';
  get diagnostics v_drafts = row_count;
  return jsonb_build_object('stories', v_stories, 'drafts', v_drafts);
end;
$$;

-- Yetim taraması: hikâye ve taslak medyası "kullanımda" sayılır. Gövde 191'deki sürümle aynı; tek fark story-media.
create or replace function public.orphan_storage_objects(p_min_age interval default '01:00:00'::interval)
returns table(bucket_id text, name text, size bigint, created_at timestamp with time zone)
language sql
stable
security definer
set search_path to 'public', 'storage'
as $function$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select avatar_url from public.chat_groups where avatar_url is not null
    union all select cover_url from public.chat_groups where cover_url is not null
    union all select reference_image_url from public.prompt_requests where reference_image_url is not null
    union all select a->>'path' from public.messages m, jsonb_array_elements(m.attachments) a
    union all select media_url from public.stories where media_url is not null
    union all select media_url from public.story_drafts where media_url is not null
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media','community-avatars','story-media')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$function$;

-- ============================================================================
-- 10. Yetkiler
-- ============================================================================

revoke execute on function public._story_point_ok(jsonb) from public, anon;
revoke execute on function public._story_layout_ok(jsonb) from public, anon;
revoke execute on function public._story_visible(uuid, uuid, text, uuid, timestamptz, text) from public;
revoke execute on function public._story_highlight_visible(uuid) from public;
revoke execute on function public.can_read_story_media(text) from public;
revoke execute on function public.can_view_story(uuid) from public;
revoke execute on function public._story_notify(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public._story_for_interaction(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_story_draft_limit() from public, anon, authenticated;
revoke execute on function public.purge_expired_stories() from public, anon, authenticated;
revoke execute on function public.create_story(jsonb) from public, anon;
revoke execute on function public.reshare_story(uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.mark_story_viewed(uuid) from public, anon;
revoke execute on function public.set_story_reaction(uuid, text) from public, anon;
revoke execute on function public.vote_story_poll(uuid, integer) from public, anon;
revoke execute on function public.story_poll_results(uuid) from public;
revoke execute on function public.answer_story_question(uuid, text) from public, anon;
revoke execute on function public.reply_to_story(uuid, text) from public, anon;
revoke execute on function public.story_viewers(uuid) from public, anon;
revoke execute on function public.story_tray(uuid) from public;
revoke execute on function public.save_story_highlight(uuid, text, uuid[], uuid) from public, anon;
revoke execute on function public.add_story_to_highlight(uuid, uuid) from public, anon;
revoke execute on function public.reorder_story_highlights(uuid[]) from public, anon;
revoke execute on function public.moderate_story(uuid, boolean) from public, anon;
revoke execute on function public.remove_community_story(uuid) from public, anon;

-- Politikalarda ve RLS'te (ziyaretçi dahil) değerlendirilenler; ziyaretçi yalnız herkese açık hikâyeyi/öne çıkanı okur.
grant execute on function public._story_layout_ok(jsonb) to authenticated;
grant execute on function public._story_point_ok(jsonb) to authenticated;
grant execute on function public._story_visible(uuid, uuid, text, uuid, timestamptz, text) to anon, authenticated;
grant execute on function public._story_highlight_visible(uuid) to anon, authenticated;
grant execute on function public.can_read_story_media(text) to anon, authenticated;
grant execute on function public.can_view_story(uuid) to anon, authenticated;
grant execute on function public.story_poll_results(uuid) to anon, authenticated;
grant execute on function public.story_tray(uuid) to anon, authenticated;
grant execute on function public.purge_expired_stories() to service_role;

grant execute on function public.create_story(jsonb) to authenticated;
grant execute on function public.reshare_story(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.mark_story_viewed(uuid) to authenticated;
grant execute on function public.set_story_reaction(uuid, text) to authenticated;
grant execute on function public.vote_story_poll(uuid, integer) to authenticated;
grant execute on function public.answer_story_question(uuid, text) to authenticated;
grant execute on function public.reply_to_story(uuid, text) to authenticated;
grant execute on function public.story_viewers(uuid) to authenticated;
grant execute on function public.save_story_highlight(uuid, text, uuid[], uuid) to authenticated;
grant execute on function public.add_story_to_highlight(uuid, uuid) to authenticated;
grant execute on function public.reorder_story_highlights(uuid[]) to authenticated;
grant execute on function public.moderate_story(uuid, boolean) to authenticated;
grant execute on function public.remove_community_story(uuid) to authenticated;

-- Tablolar: istemci yalnız okur (RLS); silme yalnız yukarıdaki sahip politikalarıyla; taslaklar sahibine tam.
revoke insert, update on public.stories, public.story_views, public.story_reactions, public.story_poll_votes,
  public.story_question_answers, public.story_highlights, public.story_highlight_items from anon, authenticated;
revoke all on public.story_drafts from anon;
