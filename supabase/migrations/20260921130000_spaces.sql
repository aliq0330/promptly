-- Promptly Spaces (docs/history/213-*): kullanıcının görselleri, promptları, notları ve renk paletlerini tek bir yaratıcı
-- çalışma alanında topladığı, panoda düzenlediği ve isterse paylaştığı projeler.
--
-- Tasarım kuralları:
--   • Space'e eklenen Promptly içeriği KOPYALANMAZ, başvurulur: öğe kaynağın kimliğini (prompt id + görsel kimliği) tutar;
--     metin/görsel her okuyucuya KENDİ yetkisiyle gelir. Kaynak gizlenir/silinirse öğe "erişilemiyor" görünür, hiçbir yol
--     artık okunamayan içeriği göstermez. Yalnızca çağıranın okuyabildiği ve topluluğa ait OLMAYAN içerik eklenebilir.
--   • Okuma TEK yerde: `can_read_space` (üye · herkese açık · "bağlantıya sahip olanlar" için açılmış ve iptal edilmemiş bağlantı).
--     Arşivlenen Space yalnız üyelerine görünür. Engel iki yönlü: sahibiyle aranda engel varsa herkese açık/bağlantılı Space görünmez.
--   • Roller: owner (ayarlar, üyeler, paylaşım, arşiv, silme) · editor (içerik ve pano) · viewer (yalnız okuma). Yetki her yazmada
--     sunucuda (RLS + RPC) denetlenir; istemcinin gönderdiği rol/sahiplik bilgisine güvenilmez. Arşivlenen Space salt-okunurdur.
--   • Bağlantı token'ı yalnız SHA-256 özetiyle saklanır, ham hâli oluşturulurken BİR KEZ döner; iptal edilen bağlantı erişim vermez.
--     Bağlantıyla görmek oturum ister (Storage politikası token göremez; erişim, açılışta kaydedilen hakla verilir).
--   • Kendi yüklenen görseller PRIVATE `space-media` bucket'ında, yol `{space}/{uuid}.{jpg|png|webp}`; dosya Space okunabildiği
--     sürece okunur. Gizli notlar (`is_private`) ve etkinlik geçmişi yalnız üyelere.
--   • Pano konumları dünya biriminde (piksel değil); toplu konum kaydı tek çağrıda (`space_save_layout`).
--   • Etkinlik geçmişi yalnız anlamlı değişiklikleri yazar (konum değişikliği yazılmaz), aynı kişinin aynı işi 10 dk içinde birleşir,
--     Space başına son 500 satır tutulur.
--
-- Yalnızca ekleyici: yeni tablolar/fonksiyonlar/politikalar + `orphan_storage_objects` gövdesine iki kaynak; `drop` yok.

-- ============================================================================
-- 1. Tablolar
-- ============================================================================

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null default 'free' check (kind in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free')),
  visibility text not null default 'private' check (visibility in ('private', 'link', 'public')),
  -- Kapak: ya Space'e yüklenmiş bir dosya (kimlik URL'si, `space-media/{space}/…`) ya da Space'teki bir görsel öğe.
  cover_url text check (cover_url is null or char_length(cover_url) <= 500),
  cover_item_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index spaces_owner_idx on public.spaces (owner_id, updated_at desc);
create index spaces_public_idx on public.spaces (updated_at desc) where visibility = 'public' and archived_at is null;
alter table public.spaces enable row level security;

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create unique index space_members_one_owner on public.space_members (space_id) where role = 'owner';
create index space_members_user_idx on public.space_members (user_id);
alter table public.space_members enable row level security;

create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index space_invitations_one_pending on public.space_invitations (space_id, invitee_id) where status = 'pending';
create index space_invitations_invitee_idx on public.space_invitations (invitee_id) where status = 'pending';
alter table public.space_invitations enable row level security;

create table public.space_groups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default 'primary' check (color in ('primary', 'secondary', 'success', 'warning', 'danger', 'neutral')),
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index space_groups_space_idx on public.space_groups (space_id, position);
alter table public.space_groups enable row level security;

-- Renkler `#rrggbb` (küçük harf) dizisi; sıra = dizideki sıra.
create or replace function public._space_valid_colors(p_colors text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(cardinality(p_colors), 0) <= 24
     and coalesce((select bool_and(c ~ '^#[0-9a-f]{6}$') from unnest(p_colors) as c), true);
$$;

create table public.space_palettes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  colors text[] not null default '{}' check (public._space_valid_colors(colors)),
  source text not null default 'manual' check (source in ('manual', 'image')),
  source_item_id uuid,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index space_palettes_space_idx on public.space_palettes (space_id, position);
alter table public.space_palettes enable row level security;

create table public.space_items (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null check (kind in ('image', 'prompt', 'note', 'palette', 'content')),
  -- Pano: dünya birimi (görünüm pikseline bağlı değil). z = üst üste sıra.
  x real not null default 0 check (x between -100000 and 100000),
  y real not null default 0 check (y between -100000 and 100000),
  w real not null default 240 check (w between 40 and 4000),
  h real not null default 240 check (h between 40 and 4000),
  z integer not null default 0 check (z between -1000000 and 1000000),
  group_id uuid references public.space_groups (id) on delete set null,
  -- Kaynak başvurusu: görsel/prompt öğesinin Promptly gönderisi (silinirse null → "kaynak silindi").
  prompt_id uuid references public.prompts (id) on delete set null,
  -- Görselin kimlik URL'si: kaynak gönderinin `prompt_media.url`'si ya da bu Space'e yüklenmiş dosya.
  media_url text check (media_url is null or char_length(media_url) <= 500),
  media_width integer check (media_width is null or media_width between 1 and 20000),
  media_height integer check (media_height is null or media_height between 1 and 20000),
  -- Kullanıcının kendi prompt taslağı (özgün gönderiden bağımsız; `source_prompt_id` yalnız kaynak gösterimi).
  is_draft boolean not null default false,
  source_prompt_id uuid references public.prompts (id) on delete set null,
  -- İstek / workflow / hazır ayar başvurusu.
  content_type text check (content_type is null or content_type in ('request', 'workflow', 'preset')),
  content_id uuid,
  palette_id uuid references public.space_palettes (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 8000),
  -- Proje içi not (görsel/prompt öğesinin üstüne düşülen not).
  note text not null default '' check (char_length(note) <= 2000),
  color text not null default 'neutral' check (color in ('primary', 'secondary', 'success', 'warning', 'danger', 'neutral')),
  attached_item_id uuid references public.space_items (id) on delete set null,
  is_private boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_items_image_has_media check (kind <> 'image' or media_url is not null),
  constraint space_items_content_ref check (kind <> 'content' or (content_type is not null and content_id is not null)),
  constraint space_items_private_notes_only check (not is_private or kind = 'note')
);
create index space_items_space_idx on public.space_items (space_id, kind, created_at desc);
create index space_items_prompt_idx on public.space_items (prompt_id) where prompt_id is not null;
create unique index space_items_unique_image on public.space_items (space_id, media_url) where kind = 'image';
create unique index space_items_unique_prompt on public.space_items (space_id, prompt_id) where kind = 'prompt' and not is_draft and prompt_id is not null;
create unique index space_items_unique_content on public.space_items (space_id, content_type, content_id) where kind = 'content';
create unique index space_items_unique_palette on public.space_items (space_id, palette_id) where kind = 'palette';
alter table public.space_items enable row level security;

alter table public.spaces
  add constraint spaces_cover_item_fkey foreign key (cover_item_id) references public.space_items (id) on delete set null;
alter table public.space_palettes
  add constraint space_palettes_source_item_fkey foreign key (source_item_id) references public.space_items (id) on delete set null;

create table public.space_activity (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'created', 'renamed', 'visibility_changed', 'archived', 'unarchived',
    'image_added', 'image_removed', 'prompt_added', 'note_added', 'content_added', 'item_removed',
    'palette_created', 'palette_updated', 'palette_deleted', 'group_created', 'group_deleted',
    'member_invited', 'member_joined', 'member_removed', 'role_changed', 'link_created', 'link_revoked'
  )),
  label text check (label is null or char_length(label) <= 120),
  count integer not null default 1,
  created_at timestamptz not null default now()
);
create index space_activity_space_idx on public.space_activity (space_id, created_at desc);
alter table public.space_activity enable row level security;

create table public.space_share_links (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index space_share_links_space_idx on public.space_share_links (space_id) where revoked_at is null;
alter table public.space_share_links enable row level security;

-- Bağlantıyı açan oturumlu kullanıcının hakkı: bağlantı iptal edilince ya da Space "bağlantı" görünürlüğünden çıkınca geçersizdir.
create table public.space_link_grants (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  link_id uuid not null references public.space_share_links (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
alter table public.space_link_grants enable row level security;

-- Kişisel durum: favori + son açılış ("Son açılanlar").
create table public.space_user_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  favorite boolean not null default false,
  last_opened_at timestamptz,
  primary key (user_id, space_id)
);
create index space_user_state_space_idx on public.space_user_state (space_id);
alter table public.space_user_state enable row level security;

-- ============================================================================
-- 2. Yetki yardımcıları (TEK kaynak)
-- ============================================================================

create or replace function public.space_role(p_space uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.space_members m where m.space_id = p_space and m.user_id = auth.uid();
$$;

create or replace function public.can_read_space(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
     where s.id = p_space
       and (
         exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = auth.uid())
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
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
      join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
     where s.id = p_space and s.archived_at is null and m.role in ('owner', 'editor')
  );
$$;

-- `space-media` yolunun ilk klasörü = Space kimliği (geçersiz yol → null, hiçbir politika geçmez).
create or replace function public._space_media_space_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
              then split_part(p_name, '/', 1)::uuid end;
$$;

-- Bu Space'e yüklenmiş bir dosyanın kimlik URL'si mi?
create or replace function public._space_valid_upload_url(p_space uuid, p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is not null and char_length(p_url) <= 500
     and p_url ~ ('^https?://[^/]+/storage/v1/object/public/space-media/' || p_space::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$');
$$;

-- ============================================================================
-- 3. Etkinlik + "son düzenleme"
-- ============================================================================

create or replace function public._space_log(p_space uuid, p_action text, p_label text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  -- Space silinirken (zincirleme silme) kayıt yazılmaz.
  if not exists (select 1 from public.spaces where id = p_space) then
    return;
  end if;
  select a.id into v_id
    from public.space_activity a
   where a.space_id = p_space and a.actor_id is not distinct from v_actor and a.action = p_action
     and a.label is not distinct from p_label and a.created_at > now() - interval '10 minutes'
   order by a.created_at desc
   limit 1;
  if v_id is not null then
    update public.space_activity set count = count + 1, created_at = now() where id = v_id;
    return;
  end if;
  insert into public.space_activity (space_id, actor_id, action, label) values (p_space, v_actor, p_action, left(p_label, 120));
  delete from public.space_activity
   where id in (select a.id from public.space_activity a where a.space_id = p_space order by a.created_at desc offset 500);
end;
$$;

create or replace function public._space_touch(p_space uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.spaces set updated_at = now(), updated_by = auth.uid()
   where id = p_space and updated_at < now() - interval '15 seconds';
$$;

-- ============================================================================
-- 4. Tetikleyiciler
-- ============================================================================

create or replace function public.spaces_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.space_members (space_id, user_id, role, added_by) values (new.id, new.owner_id, 'owner', new.owner_id);
  perform public._space_log(new.id, 'created', null);
  return null;
end;
$$;
create trigger spaces_after_insert after insert on public.spaces for each row execute function public.spaces_after_insert();

create or replace function public.spaces_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
    raise exception 'space_invalid';
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
end;
$$;
create trigger spaces_before_update before update on public.spaces for each row execute function public.spaces_before_update();

create or replace function public.spaces_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title then
    perform public._space_log(new.id, 'renamed', new.title);
  end if;
  if new.visibility is distinct from old.visibility then
    perform public._space_log(new.id, 'visibility_changed', new.visibility);
    -- "Bağlantıya sahip olanlar"dan çıkınca açık bağlantılar iptal edilir: sonradan geri dönmek eski bağlantıyı canlandırmaz.
    if old.visibility = 'link' then
      update public.space_share_links set revoked_at = now() where space_id = new.id and revoked_at is null;
    end if;
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform public._space_log(new.id, case when new.archived_at is null then 'unarchived' else 'archived' end, null);
  end if;
  return null;
end;
$$;
create trigger spaces_after_update after update on public.spaces for each row execute function public.spaces_after_update();

-- Öğe doğrulaması: SECURITY INVOKER — kaynak içeriğin okunabilirliği ÇAĞIRANIN kendi RLS'iyle denetlenir.
create or replace function public.space_items_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_readable boolean;
begin
  if tg_op = 'UPDATE' then
    -- Kimlik ve kaynak değişmez; yalnız kaynak silindiğinde (ON DELETE SET NULL) null'a düşebilir.
    if new.id <> old.id or new.space_id <> old.space_id or new.kind <> old.kind
       or new.media_url is distinct from old.media_url or new.is_draft <> old.is_draft
       or new.content_type is distinct from old.content_type or new.content_id is distinct from old.content_id
       or (new.prompt_id is distinct from old.prompt_id and new.prompt_id is not null)
       or (new.source_prompt_id is distinct from old.source_prompt_id and new.source_prompt_id is not null)
       or (new.palette_id is distinct from old.palette_id and new.palette_id is not null)
       or (new.created_by is distinct from old.created_by and new.created_by is not null)
       or new.created_at <> old.created_at then
      raise exception 'space_invalid';
    end if;
    if (new.title, new.body, new.note, new.color, new.is_private, new.attached_item_id)
       is distinct from (old.title, old.body, old.note, old.color, old.is_private, old.attached_item_id) then
      new.updated_at := now();
      new.updated_by := auth.uid();
    end if;
  end if;

  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
     and not exists (select 1 from public.space_groups g where g.id = new.group_id and g.space_id = new.space_id) then
    raise exception 'space_invalid';
  end if;
  if new.attached_item_id is not null and (tg_op = 'INSERT' or new.attached_item_id is distinct from old.attached_item_id)
     and (new.kind <> 'note' or new.attached_item_id = new.id
          or not exists (select 1 from public.space_items i where i.id = new.attached_item_id and i.space_id = new.space_id)) then
    raise exception 'space_invalid';
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.space_items i where i.space_id = new.space_id) >= 500 then
      raise exception 'space_item_limit';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();
    if new.kind = 'image' then
      if new.is_draft or new.source_prompt_id is not null then
        raise exception 'space_invalid';
      end if;
      if new.prompt_id is not null then
        if not exists (
          select 1 from public.prompt_media pm join public.prompts p on p.id = pm.prompt_id
           where pm.prompt_id = new.prompt_id and pm.url = new.media_url and p.community_id is null
        ) then
          raise exception 'space_source_unavailable';
        end if;
      elsif not public._space_valid_upload_url(new.space_id, new.media_url) then
        raise exception 'space_invalid';
      end if;
    elsif new.media_url is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'prompt' then
      if new.is_draft then
        if new.prompt_id is not null then raise exception 'space_invalid'; end if;
        if new.source_prompt_id is not null
           and not exists (select 1 from public.prompts p where p.id = new.source_prompt_id and p.community_id is null) then
          raise exception 'space_source_unavailable';
        end if;
      elsif new.prompt_id is null
         or not exists (select 1 from public.prompts p where p.id = new.prompt_id and p.community_id is null) then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.kind <> 'image' and (new.prompt_id is not null or new.is_draft or new.source_prompt_id is not null) then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'content' then
      v_readable := case new.content_type
        when 'request' then exists (select 1 from public.prompt_requests r where r.id = new.content_id and r.community_id is null)
        when 'workflow' then exists (select 1 from public.workflows w where w.id = new.content_id and w.community_id is null)
        when 'preset' then exists (select 1 from public.presets s where s.id = new.content_id and s.community_id is null)
        else false end;
      if not v_readable then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.content_type is not null or new.content_id is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'palette' then
      if new.palette_id is null
         or not exists (select 1 from public.space_palettes sp where sp.id = new.palette_id and sp.space_id = new.space_id) then
        raise exception 'space_invalid';
      end if;
    elsif new.palette_id is not null then
      raise exception 'space_invalid';
    end if;
  end if;
  return new;
end;
$$;
create trigger space_items_before_write before insert or update on public.space_items
  for each row execute function public.space_items_before_write();

create or replace function public.space_items_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._space_log(new.space_id, case new.kind
      when 'image' then 'image_added' when 'prompt' then 'prompt_added' when 'note' then 'note_added'
      when 'content' then 'content_added' else null end, null)
      where new.kind <> 'palette';
    perform public._space_touch(new.space_id);
  elsif tg_op = 'DELETE' then
    perform public._space_log(old.space_id, case when old.kind = 'image' then 'image_removed' else 'item_removed' end, null)
      where old.kind <> 'palette';
    perform public._space_touch(old.space_id);
  else
    perform public._space_touch(new.space_id);
  end if;
  return null;
end;
$$;
create trigger space_items_after_change after insert or update or delete on public.space_items
  for each row execute function public.space_items_after_change();

create or replace function public.space_groups_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.space_id <> old.space_id or new.created_at <> old.created_at) then
    raise exception 'space_invalid';
  end if;
  new.name := btrim(new.name);
  if tg_op = 'INSERT' and (select count(*) from public.space_groups g where g.space_id = new.space_id) >= 50 then
    raise exception 'space_group_limit';
  end if;
  return new;
end;
$$;
create trigger space_groups_before_write before insert or update on public.space_groups
  for each row execute function public.space_groups_before_write();

create or replace function public.space_groups_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._space_log(new.space_id, 'group_created', new.name);
  elsif tg_op = 'DELETE' then
    perform public._space_log(old.space_id, 'group_deleted', old.name);
  end if;
  perform public._space_touch(coalesce(new.space_id, old.space_id));
  return null;
end;
$$;
create trigger space_groups_after_change after insert or update or delete on public.space_groups
  for each row execute function public.space_groups_after_change();

create or replace function public.space_palettes_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.space_id <> old.space_id or new.created_at <> old.created_at) then
    raise exception 'space_invalid';
  end if;
  new.name := btrim(new.name);
  new.colors := coalesce((select array_agg(lower(c) order by ord) from unnest(new.colors) with ordinality as t(c, ord)), '{}');
  if new.source_item_id is not null and (tg_op = 'INSERT' or new.source_item_id is distinct from old.source_item_id)
     and not exists (select 1 from public.space_items i where i.id = new.source_item_id and i.space_id = new.space_id and i.kind = 'image') then
    raise exception 'space_invalid';
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.space_palettes p where p.space_id = new.space_id) >= 30 then
      raise exception 'space_palette_limit';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger space_palettes_before_write before insert or update on public.space_palettes
  for each row execute function public.space_palettes_before_write();

create or replace function public.space_palettes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._space_log(new.space_id, 'palette_created', new.name);
  elsif tg_op = 'UPDATE' then
    perform public._space_log(new.space_id, 'palette_updated', new.name);
  else
    perform public._space_log(old.space_id, 'palette_deleted', old.name);
  end if;
  perform public._space_touch(coalesce(new.space_id, old.space_id));
  return null;
end;
$$;
create trigger space_palettes_after_change after insert or update or delete on public.space_palettes
  for each row execute function public.space_palettes_after_change();

create or replace function public.space_members_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select p.username into v_name from public.profiles p where p.id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' and new.role <> 'owner' then
    perform public._space_log(new.space_id, 'member_joined', v_name);
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform public._space_log(new.space_id, 'role_changed', v_name);
  elsif tg_op = 'DELETE' and old.role <> 'owner' then
    perform public._space_log(old.space_id, 'member_removed', v_name);
    -- Üyelikle gelen kişisel durum (favori/son açılış) Space artık okunamıyorsa anlamsızdır; okunabiliyorsa (herkese açık) kalır.
  end if;
  return null;
end;
$$;
create trigger space_members_after_change after insert or update or delete on public.space_members
  for each row execute function public.space_members_after_change();

-- ============================================================================
-- 5. RLS
-- ============================================================================

create policy "Spaces are readable by members, link holders or everyone when public"
  on public.spaces for select to anon, authenticated using (public.can_read_space(id));
create policy "Owners update their spaces"
  on public.spaces for update to authenticated
  using (public.space_role(id) = 'owner') with check (public.space_role(id) = 'owner');
create policy "Owners delete their spaces"
  on public.spaces for delete to authenticated using (public.space_role(id) = 'owner');

create policy "Members see the member list, everyone sees their own row"
  on public.space_members for select to authenticated
  using (user_id = auth.uid() or public.space_role(space_id) is not null);

create policy "Invitee and owner see invitations"
  on public.space_invitations for select to authenticated
  using (invitee_id = auth.uid() or public.space_role(space_id) = 'owner');

create policy "Groups follow their space"
  on public.space_groups for select to anon, authenticated using (public.can_read_space(space_id));
create policy "Editors create groups"
  on public.space_groups for insert to authenticated
  with check (public.can_edit_space(space_id) and created_by = auth.uid());
create policy "Editors update groups"
  on public.space_groups for update to authenticated
  using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id));
create policy "Editors delete groups"
  on public.space_groups for delete to authenticated using (public.can_edit_space(space_id));

create policy "Palettes follow their space"
  on public.space_palettes for select to anon, authenticated using (public.can_read_space(space_id));
create policy "Editors create palettes"
  on public.space_palettes for insert to authenticated
  with check (public.can_edit_space(space_id) and created_by = auth.uid());
create policy "Editors update palettes"
  on public.space_palettes for update to authenticated
  using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id));
create policy "Editors delete palettes"
  on public.space_palettes for delete to authenticated using (public.can_edit_space(space_id));

create policy "Items follow their space; private notes only for members"
  on public.space_items for select to anon, authenticated
  using (public.can_read_space(space_id) and (not is_private or public.space_role(space_id) is not null));
create policy "Editors add items"
  on public.space_items for insert to authenticated
  with check (public.can_edit_space(space_id) and created_by = auth.uid());
create policy "Editors update items"
  on public.space_items for update to authenticated
  using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id));
create policy "Editors delete items"
  on public.space_items for delete to authenticated using (public.can_edit_space(space_id));

create policy "Members read the activity log"
  on public.space_activity for select to authenticated using (public.space_role(space_id) is not null);

create policy "Users read their own space state"
  on public.space_user_state for select to authenticated using (user_id = auth.uid());

-- `space_share_links` / `space_link_grants`: istemciye hiç açık değil (yalnız RPC).

revoke insert, update, delete on public.spaces from anon;
revoke insert on public.spaces from authenticated;
revoke insert, update, delete on public.space_groups, public.space_palettes, public.space_items from anon;
revoke insert, update, delete on public.space_members, public.space_invitations, public.space_activity,
  public.space_share_links, public.space_link_grants, public.space_user_state from anon, authenticated;
revoke select on public.space_share_links, public.space_link_grants from anon, authenticated;

-- ============================================================================
-- 6. RPC'ler
-- ============================================================================

-- Yeni Space (+ isteğe bağlı başlangıç grupları — adlar istemcinin dilinde gelir). Güvenli varsayılan görünürlük: özel.
create or replace function public.create_space(
  p_title text,
  p_description text default '',
  p_kind text default 'free',
  p_visibility text default 'private',
  p_groups text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_pos integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free')
     or coalesce(p_visibility, '') not in ('private', 'link', 'public')
     or char_length(coalesce(p_description, '')) > 500
     or coalesce(cardinality(p_groups), 0) > 12 then
    raise exception 'space_invalid';
  end if;
  if (select count(*) from public.spaces s where s.owner_id = v_uid) >= 200 then raise exception 'space_limit'; end if;
  insert into public.spaces (owner_id, title, description, kind, visibility, updated_by)
  values (v_uid, btrim(p_title), coalesce(p_description, ''), p_kind, p_visibility, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;
  return v_id;
end;
$$;

-- Pano yerleşimi: birçok öğenin konumu TEK çağrıda. SECURITY INVOKER: güncelleme RLS'ten (düzenleyici + arşivlenmemiş) geçer.
-- Dönen dizi gerçekten güncellenen öğelerdir; eksik olanlar (başkası silmiş) istemcide düşer — sessiz başarı yok.
create or replace function public.space_save_layout(p_space_id uuid, p_items jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'space_invalid'; end if;
  if not public.can_edit_space(p_space_id) then raise exception 'space_forbidden'; end if;
  with updated as (
    update public.space_items i
       set x = coalesce(r.x, i.x), y = coalesce(r.y, i.y), w = coalesce(r.w, i.w), h = coalesce(r.h, i.h), z = coalesce(r.z, i.z),
           group_id = case when coalesce(r.set_group, false) then r.group_id else i.group_id end
      from jsonb_to_recordset(p_items) as r(id uuid, x real, y real, w real, h real, z integer, group_id uuid, set_group boolean)
     where i.id = r.id and i.space_id = p_space_id
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from updated;
  return v_ids;
end;
$$;

create or replace function public.set_space_favorite(p_space_id uuid, p_favorite boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_read_space(p_space_id) then raise exception 'space_not_found'; end if;
  insert into public.space_user_state (user_id, space_id, favorite) values (auth.uid(), p_space_id, coalesce(p_favorite, false))
  on conflict (user_id, space_id) do update set favorite = excluded.favorite;
end;
$$;

create or replace function public.touch_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_read_space(p_space_id) then return; end if;
  insert into public.space_user_state (user_id, space_id, last_opened_at) values (auth.uid(), p_space_id, now())
  on conflict (user_id, space_id) do update set last_opened_at = now();
end;
$$;

-- Davet: yalnız sahip; kullanıcı adıyla. Engel (iki yönlü), kendine davet, mevcut üye, bekleyen davet reddedilir.
create or replace function public.invite_space_member(p_space_id uuid, p_username text, p_role text default 'viewer')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space public.spaces;
  v_target uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_role, '') not in ('editor', 'viewer') then raise exception 'space_invalid'; end if;
  select * into v_space from public.spaces where id = p_space_id for update;
  if not found or public.space_role(p_space_id) is null then raise exception 'space_not_found'; end if;
  if public.space_role(p_space_id) <> 'owner' then raise exception 'space_forbidden'; end if;
  if v_space.archived_at is not null then raise exception 'space_archived'; end if;
  select p.id into v_target from public.profiles p where lower(p.username) = lower(btrim(coalesce(p_username, '')));
  if v_target is null then raise exception 'space_user_not_found'; end if;
  if v_target = v_uid then raise exception 'space_self_invite'; end if;
  if public.is_blocked(v_uid, v_target) then raise exception 'space_user_not_found'; end if;
  if exists (select 1 from public.space_members m where m.space_id = p_space_id and m.user_id = v_target) then
    raise exception 'space_already_member';
  end if;
  if exists (select 1 from public.space_invitations i where i.space_id = p_space_id and i.invitee_id = v_target and i.status = 'pending') then
    raise exception 'space_invite_exists';
  end if;
  if (select count(*) from public.space_members m where m.space_id = p_space_id) >= 50 then raise exception 'space_member_limit'; end if;
  insert into public.space_invitations (space_id, invitee_id, role, invited_by) values (p_space_id, v_target, p_role, v_uid)
  returning id into v_id;
  perform public._space_log(p_space_id, 'member_invited', (select username from public.profiles where id = v_target));
  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_target, v_uid, 'system', 'Seni "' || v_space.title || '" Space''ine davet etti.', '/spaces');
  return v_id;
end;
$$;

create or replace function public.respond_space_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.space_invitations;
  v_space public.spaces;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_inv from public.space_invitations where id = p_invitation_id for update;
  if not found or v_inv.invitee_id <> v_uid or v_inv.status <> 'pending' then raise exception 'space_invite_not_found'; end if;
  select * into v_space from public.spaces where id = v_inv.space_id for update;
  if not coalesce(p_accept, false) then
    update public.space_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
    return v_inv.space_id;
  end if;
  if v_space.archived_at is not null then raise exception 'space_archived'; end if;
  if public.is_blocked(v_space.owner_id, v_uid) then raise exception 'space_invite_not_found'; end if;
  update public.space_invitations set status = 'accepted', responded_at = now() where id = v_inv.id;
  insert into public.space_members (space_id, user_id, role, added_by) values (v_inv.space_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (space_id, user_id) do nothing;
  if v_inv.invited_by is not null and v_inv.invited_by <> v_uid then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_inv.invited_by, v_uid, 'system', '"' || v_space.title || '" Space''ine katıldı.', '/spaces/local?id=' || v_space.id || '&tab=members');
  end if;
  return v_inv.space_id;
end;
$$;

create or replace function public.revoke_space_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.space_invitations;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_inv from public.space_invitations where id = p_invitation_id for update;
  if not found or v_inv.status <> 'pending' or public.space_role(v_inv.space_id) is distinct from 'owner' then
    raise exception 'space_invite_not_found';
  end if;
  update public.space_invitations set status = 'revoked', responded_at = now() where id = v_inv.id;
end;
$$;

-- Bekleyen davetlerim (davet edilen Space'i henüz okuyamaz: ad/tür/sahip RPC'den gelir; kapak/içerik gelmez).
create or replace function public.my_space_invitations()
returns table (
  id uuid, space_id uuid, role text, created_at timestamptz,
  space_title text, space_kind text, inviter_username text, inviter_display_name text, inviter_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.space_id, i.role, i.created_at, s.title, s.kind, p.username, p.display_name, p.avatar_url
    from public.space_invitations i
    join public.spaces s on s.id = i.space_id
    left join public.profiles p on p.id = i.invited_by
   where i.invitee_id = auth.uid() and i.status = 'pending' and s.archived_at is null
     and not public.is_blocked(s.owner_id, auth.uid())
   order by i.created_at desc
   limit 50;
$$;

create or replace function public.set_space_member_role(p_space_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_role, '') not in ('editor', 'viewer') then raise exception 'space_invalid'; end if;
  if public.space_role(p_space_id) is distinct from 'owner' then raise exception 'space_forbidden'; end if;
  perform 1 from public.spaces where id = p_space_id for update;
  update public.space_members set role = p_role where space_id = p_space_id and user_id = p_user_id and role <> 'owner';
  if not found then raise exception 'space_member_not_found'; end if;
end;
$$;

-- Çıkarma (sahip) ya da ayrılma (kendisi). Sahip ayrılamaz/çıkarılamaz: Space'i silmesi gerekir.
create or replace function public.remove_space_member(p_space_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user_id is distinct from auth.uid() and public.space_role(p_space_id) is distinct from 'owner' then
    raise exception 'space_forbidden';
  end if;
  perform 1 from public.spaces where id = p_space_id for update;
  delete from public.space_members where space_id = p_space_id and user_id = p_user_id and role <> 'owner';
  if not found then raise exception 'space_member_not_found'; end if;
  delete from public.space_user_state us
   where us.space_id = p_space_id and us.user_id = p_user_id
     and not exists (select 1 from public.spaces s where s.id = p_space_id and s.visibility = 'public' and s.archived_at is null);
end;
$$;

-- Paylaşım bağlantısı: yalnız sahip, yalnız "bağlantıya sahip olanlar" görünürlüğünde. Space başına TEK etkin bağlantı:
-- yenisi eskisini iptal eder. Ham token yalnız burada, bir kez döner.
create or replace function public.create_space_link(p_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space public.spaces;
  v_token text;
  v_link public.space_share_links;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_space from public.spaces where id = p_space_id for update;
  if not found or public.space_role(p_space_id) is distinct from 'owner' then raise exception 'space_forbidden'; end if;
  if v_space.archived_at is not null then raise exception 'space_archived'; end if;
  if v_space.visibility <> 'link' then raise exception 'space_not_link_visible'; end if;
  update public.space_share_links set revoked_at = now() where space_id = p_space_id and revoked_at is null;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.space_share_links (space_id, token_hash, created_by)
  values (p_space_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid)
  returning * into v_link;
  perform public._space_log(p_space_id, 'link_created', null);
  return jsonb_build_object('link_id', v_link.id, 'token', v_token, 'created_at', v_link.created_at);
end;
$$;

create or replace function public.revoke_space_link(p_space_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.space_role(p_space_id) is distinct from 'owner' then raise exception 'space_forbidden'; end if;
  update public.space_share_links set revoked_at = now() where space_id = p_space_id and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then perform public._space_log(p_space_id, 'link_revoked', null); end if;
  return v_count;
end;
$$;

create or replace function public.space_link_status(p_space_id uuid)
returns table (active boolean, created_at timestamptz, opened_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.space_role(p_space_id) is distinct from 'owner' then raise exception 'space_forbidden'; end if;
  return query
    select true, l.created_at, (select count(*)::integer from public.space_link_grants g where g.link_id = l.id)
      from public.space_share_links l
     where l.space_id = p_space_id and l.revoked_at is null
     order by l.created_at desc
     limit 1;
end;
$$;

-- Bağlantıyı açan oturumlu kullanıcıya okuma hakkı verir; geçersiz/iptal/görünürlük dışı bağlantı tek tip hata verir (varlık sızmaz).
create or replace function public.open_space_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.space_share_links;
  v_space public.spaces;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,100}$' then raise exception 'space_link_invalid'; end if;
  select * into v_link from public.space_share_links
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and revoked_at is null;
  if not found then raise exception 'space_link_invalid'; end if;
  select * into v_space from public.spaces where id = v_link.space_id;
  if v_space.visibility <> 'link' or v_space.archived_at is not null or public.is_blocked(v_space.owner_id, v_uid) then
    raise exception 'space_link_invalid';
  end if;
  insert into public.space_link_grants (space_id, user_id, link_id) values (v_space.id, v_uid, v_link.id)
  on conflict (space_id, user_id) do update set link_id = excluded.link_id, granted_at = now();
  return v_space.id;
end;
$$;

-- Liste (ana sayfa): SECURITY INVOKER — satırlar, sayılar ve önizlemeler çağıranın RLS'inden geçer (gizli not sayılmaz).
create or replace function public.list_spaces(
  p_filter text default 'all',
  p_query text default null,
  p_sort text default 'updated',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text,
  title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[],
  image_count integer, prompt_count integer, note_count integer, member_count integer,
  my_role text, is_favorite boolean, last_opened_at timestamptz,
  created_at timestamptz, updated_at timestamptz, archived_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select nullif(btrim(coalesce(p_query, '')), '') as q,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url,
         s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         case when m.role is not null then (select count(*)::integer from public.space_members c where c.space_id = s.id) end,
         m.role, coalesce(us.favorite, false), us.last_opened_at,
         s.created_at, s.updated_at, s.archived_at
    from public.spaces s
    cross join params
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where case coalesce(p_filter, 'all')
           when 'all' then m.role is not null and s.archived_at is null
           when 'mine' then m.role = 'owner' and s.archived_at is null
           when 'shared' then m.role in ('editor', 'viewer') and s.archived_at is null
           when 'favorites' then coalesce(us.favorite, false)
           when 'recent' then us.last_opened_at is not null and s.archived_at is null
           when 'public' then s.visibility = 'public' and s.archived_at is null and s.owner_id is distinct from auth.uid()
           when 'archived' then m.role = 'owner' and s.archived_at is not null
           else false
         end
     and (
       params.q is null
       or s.title ilike params.pattern or s.description ilike params.pattern
       or exists (
         select 1 from public.space_items si
          where si.space_id = s.id and (si.title ilike params.pattern or si.body ilike params.pattern or si.note ilike params.pattern)
       )
       or exists (
         select 1 from public.space_items si join public.prompts pr on pr.id = si.prompt_id
          where si.space_id = s.id and (pr.title ilike params.pattern or pr.prompt_text ilike params.pattern)
       )
     )
   order by
     case when p_sort = 'title' then lower(s.title) end asc,
     case when p_sort = 'created' then s.created_at end desc,
     case when p_sort = 'opened' then us.last_opened_at end desc nulls last,
     s.updated_at desc,
     s.id
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ============================================================================
-- 7. Storage: PRIVATE `space-media`
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-media', 'space-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Space media is readable while its space is"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'space-media' and public.can_read_space(public._space_media_space_id(name)));

create policy "Space editors upload space media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'space-media'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and public.can_edit_space(public._space_media_space_id(name))
  );

create policy "Space editors delete space media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'space-media' and public.can_edit_space(public._space_media_space_id(name)));

-- Yetim taraması: Space'e yüklenen görseller ve kapaklar "kullanımda" sayılır. Gövde 198'deki sürümle aynı; tek fark space-media.
-- (Promptly gönderisine BAŞVURAN görsel öğeler sayılmaz: gönderi silinince dosyası her zamanki gibi süpürülür.)
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
    union all select media_url from public.space_items where media_url like '%/space-media/%'
    union all select cover_url from public.spaces where cover_url is not null
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media','community-avatars','story-media','space-media')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$function$;

-- ============================================================================
-- 8. Fonksiyon yetkileri
-- ============================================================================

revoke execute on function public._space_valid_colors(text[]) from public;
grant execute on function public._space_valid_colors(text[]) to anon, authenticated;
revoke execute on function public.space_role(uuid) from public;
grant execute on function public.space_role(uuid) to anon, authenticated;
revoke execute on function public.can_read_space(uuid) from public;
grant execute on function public.can_read_space(uuid) to anon, authenticated;
revoke execute on function public.can_edit_space(uuid) from public;
grant execute on function public.can_edit_space(uuid) to anon, authenticated;
revoke execute on function public._space_media_space_id(text) from public;
grant execute on function public._space_media_space_id(text) to anon, authenticated;
revoke execute on function public._space_valid_upload_url(uuid, text) from public;
grant execute on function public._space_valid_upload_url(uuid, text) to authenticated;

revoke execute on function public._space_log(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._space_touch(uuid) from public, anon, authenticated;
revoke execute on function public.spaces_after_insert() from public, anon, authenticated;
revoke execute on function public.spaces_before_update() from public, anon, authenticated;
revoke execute on function public.spaces_after_update() from public, anon, authenticated;
revoke execute on function public.space_items_before_write() from public, anon, authenticated;
revoke execute on function public.space_items_after_change() from public, anon, authenticated;
revoke execute on function public.space_groups_before_write() from public, anon, authenticated;
revoke execute on function public.space_groups_after_change() from public, anon, authenticated;
revoke execute on function public.space_palettes_before_write() from public, anon, authenticated;
revoke execute on function public.space_palettes_after_change() from public, anon, authenticated;
revoke execute on function public.space_members_after_change() from public, anon, authenticated;

revoke execute on function public.create_space(text, text, text, text, text[]) from public, anon;
grant execute on function public.create_space(text, text, text, text, text[]) to authenticated;
revoke execute on function public.space_save_layout(uuid, jsonb) from public, anon;
grant execute on function public.space_save_layout(uuid, jsonb) to authenticated;
revoke execute on function public.set_space_favorite(uuid, boolean) from public, anon;
grant execute on function public.set_space_favorite(uuid, boolean) to authenticated;
revoke execute on function public.touch_space(uuid) from public, anon;
grant execute on function public.touch_space(uuid) to authenticated;
revoke execute on function public.invite_space_member(uuid, text, text) from public, anon;
grant execute on function public.invite_space_member(uuid, text, text) to authenticated;
revoke execute on function public.respond_space_invitation(uuid, boolean) from public, anon;
grant execute on function public.respond_space_invitation(uuid, boolean) to authenticated;
revoke execute on function public.revoke_space_invitation(uuid) from public, anon;
grant execute on function public.revoke_space_invitation(uuid) to authenticated;
revoke execute on function public.my_space_invitations() from public, anon;
grant execute on function public.my_space_invitations() to authenticated;
revoke execute on function public.set_space_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_space_member_role(uuid, uuid, text) to authenticated;
revoke execute on function public.remove_space_member(uuid, uuid) from public, anon;
grant execute on function public.remove_space_member(uuid, uuid) to authenticated;
revoke execute on function public.create_space_link(uuid) from public, anon;
grant execute on function public.create_space_link(uuid) to authenticated;
revoke execute on function public.revoke_space_link(uuid) from public, anon;
grant execute on function public.revoke_space_link(uuid) to authenticated;
revoke execute on function public.space_link_status(uuid) from public, anon;
grant execute on function public.space_link_status(uuid) to authenticated;
revoke execute on function public.open_space_link(text) from public, anon;
grant execute on function public.open_space_link(text) to authenticated;
revoke execute on function public.list_spaces(text, text, text, integer, integer) from public;
grant execute on function public.list_spaces(text, text, text, integer, integer) to anon, authenticated;
