-- ci:allow-destructive (yalnız `spaces_kind_check` ve `team_channels_mode_check` CHECK'leri GENİŞLETİLİR: drop constraint + aynı adla yeniden ekleme; veri silinmez)
-- Ekip projeleri v2, PR-A / 1 (docs/history/362-*): ŞEMA. Ekleyicidir; hiçbir mevcut veri/işlev silinmez.
--
-- Kavram: Ekip → Proje → Dosya → içerik. İçerik kabı = "alan" (area): Space motorunun GİZLİ bir satırıdır (`spaces.kind = 'team_area'`,
-- `spaces.team_project_id` dolu). Böylece pano, öğeler, oklar, görsel yükleme, `can_read_space`/`can_edit_space` DEĞİŞMEDEN çalışır.
-- Alanlar kişisel Space listelerinde GÖRÜNMEZ, asla herkese açık olmaz, doğrudan silinemez.
-- Tablolara istemci dokunamaz: okuma/yazma yalnız SECURITY DEFINER RPC'dir (20261115110000).

-- ============================================================================
-- 1. Proje, dosya, erişim, değişken
-- ============================================================================
create table if not exists public.team_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  tone text not null default 'primary' check (tone in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky')),
  -- 'selected': yalnız girişteki kişi/gruplar; 'all': tüm ekip (taban rol `base_role`; girişler tabanı yükseltir).
  access_mode text not null default 'selected' check (access_mode in ('selected', 'all')),
  base_role text not null default 'view' check (base_role in ('view', 'edit')),
  -- Yeni dosyaların onay varsayılanı.
  review_default boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_projects_team_idx on public.team_projects (team_id, created_at);
alter table public.team_projects enable row level security;

create table if not exists public.team_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.team_projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  position integer not null default 0,
  -- Onay bu dosyada açık mı? (kapalıysa düzenleyicinin eklediği şey doğrudan yayında olur)
  review_required boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists team_files_project_idx on public.team_files (project_id, position, created_at);
alter table public.team_files enable row level security;

-- Proje rolü: view < edit < lead. Kişi ya da grup girişi.
create table if not exists public.team_project_access (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid not null references public.team_projects (id) on delete cascade,
  subject_type text not null check (subject_type in ('member', 'group')),
  subject_id uuid not null,
  role text not null check (role in ('view', 'edit', 'lead')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists team_project_access_uniq on public.team_project_access (project_id, subject_type, subject_id);
create index if not exists team_project_access_subject_idx on public.team_project_access (subject_type, subject_id);
alter table public.team_project_access enable row level security;

-- Proje (file_id null) ve dosya değişkenleri. Onay kapsamı DIŞINDADIR.
create table if not exists public.team_variables (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid not null references public.team_projects (id) on delete cascade,
  file_id uuid references public.team_files (id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$'),
  value text not null default '' check (char_length(value) <= 500),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists team_variables_uniq on public.team_variables (project_id, coalesce(file_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
alter table public.team_variables enable row level security;

revoke all on public.team_projects, public.team_files, public.team_project_access, public.team_variables from anon, authenticated;

-- ============================================================================
-- 2. Alan (Space satırı) bağları
-- ============================================================================
alter table public.spaces drop constraint if exists spaces_kind_check;
alter table public.spaces add constraint spaces_kind_check
  check (kind in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_library', 'team_area'));

alter table public.spaces add column if not exists team_project_id uuid references public.team_projects (id) on delete cascade;
alter table public.spaces add column if not exists team_file_id uuid references public.team_files (id) on delete cascade;
alter table public.spaces add column if not exists team_area_main boolean not null default false;
create index if not exists spaces_team_project_idx on public.spaces (team_project_id, team_file_id) where team_project_id is not null;
-- Proje ve dosya başına TEK ana alan.
create unique index if not exists spaces_team_main_area_uniq
  on public.spaces (team_project_id, coalesce(team_file_id, '00000000-0000-0000-0000-000000000000'::uuid)) where team_area_main;

-- Alan ⇔ proje bağı; alan asla herkese açık/bağlantılı olmaz (vitrin, alıntı, paylaşım bağlantısı yolları `visibility`'ye bağlıdır).
do $$ begin
  alter table public.spaces add constraint spaces_team_area_shape check (
    (kind = 'team_area') = (team_project_id is not null)
    and (team_file_id is null or team_project_id is not null)
    and (not team_area_main or team_project_id is not null)
    and (team_project_id is null or visibility = 'private'));
exception when duplicate_object then null; end $$;

-- Alan doğrudan silinemez (yalnız proje/dosya RPC'leri, ekip silme ve FK zinciri). İstemci düz DELETE gönderse bile reddedilir.
create or replace function public.spaces_team_area_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.team_project_id is not null and not public._team_sync_on() and pg_trigger_depth() <= 1 then
    raise exception 'team_area_managed';
  end if;
  return old;
end $$;
drop trigger if exists spaces_team_area_guard on public.spaces;
create trigger spaces_team_area_guard before delete on public.spaces for each row execute function public.spaces_team_area_guard();

-- Alanın "Etkinlik" günlüğü okunamaz (öğe varlığı sızmasın; ekip alanında Etkinlik sekmesi yoktur).
drop policy if exists space_activity_hide_team_area on public.space_activity;
create policy space_activity_hide_team_area on public.space_activity as restrictive for select
  using (not exists (select 1 from public.spaces s where s.id = space_id and s.team_project_id is not null));

-- ============================================================================
-- 3. Öğe onay sütunları (hepsi varsayılanlı: kişisel Space ve eski ekip Space'i ETKİLENMEZ — durum hep 'approved')
-- ============================================================================
alter table public.space_items add column if not exists rev_state text not null default 'approved'
  check (rev_state in ('draft', 'pending', 'approved', 'changes'));
alter table public.space_items add column if not exists rev_submitted_at timestamptz;
alter table public.space_items add column if not exists rev_submitted_by uuid references public.profiles (id) on delete set null;
alter table public.space_items add column if not exists rev_decided_at timestamptz;
alter table public.space_items add column if not exists rev_decided_by uuid references public.profiles (id) on delete set null;
alter table public.space_items add column if not exists rev_note text check (rev_note is null or char_length(rev_note) <= 500);
-- Birlikte karar verilen paket (örn. aynı workflow'un adım kartları, promptları, görselleri).
alter table public.space_items add column if not exists rev_unit uuid;
create index if not exists space_items_rev_idx on public.space_items (space_id, rev_state) where rev_state <> 'approved';
create index if not exists space_items_rev_unit_idx on public.space_items (rev_unit) where rev_unit is not null;

-- ============================================================================
-- 4. Kanal: proje kanalı
-- ============================================================================
alter table public.team_channels add column if not exists project_id uuid references public.team_projects (id) on delete cascade;
alter table public.team_channels drop constraint if exists team_channels_mode_check;
alter table public.team_channels add constraint team_channels_mode_check check (mode in ('open', 'private', 'space', 'project'));
do $$ begin
  alter table public.team_channels add constraint team_channels_project_shape check ((mode = 'project') = (project_id is not null));
exception when duplicate_object then null; end $$;
create unique index if not exists team_channels_project_uniq on public.team_channels (project_id) where project_id is not null;

-- ============================================================================
-- 5. Sayaçlar: `space_count` artık projeleri sayar (alanlar sayılmaz); eski ekip Space'leri sayılmaya devam eder (PR-C'de kalkar). Gövde 20261114110000'dakiyle (kütüphane çocuğu sayılmaz) AYNIDIR; yalnız alan/proje eklendi.
-- ============================================================================
create or replace function public._team_recount(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('promptly.team_deleting', true), '') = '1' then return; end if;
  update public.teams t set
    member_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role <> 'guest'),
    guest_count = (select count(*) from public.team_members m where m.team_id = t.id and m.role = 'guest'),
    space_count = (select count(*) from public.spaces s where s.team_id = t.id and s.archived_at is null and s.team_project_id is null and s.project_space_id is null)
                + (select count(*) from public.team_projects p where p.team_id = t.id and p.archived_at is null),
    channel_count = (select count(*) from public.team_channels c where c.team_id = t.id and c.archived_at is null)
  where t.id = p_team;
end $$;

create or replace function public.team_projects_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public._team_recount(old.team_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public._team_recount(new.team_id); end if;
  return null;
end $$;
drop trigger if exists team_projects_counter on public.team_projects;
create trigger team_projects_counter after insert or update of archived_at or delete on public.team_projects
  for each row execute function public.team_projects_counter();

-- ============================================================================
-- 6. Kişisel Space listesi ekip Space'lerini/alanlarını İÇERMEZ (ekip işi kişisel "Space" değildir; `team_id is null`).
--    Gövde 20260926100000'dakiyle AYNIDIR; yalnız `s.team_id is null` koşulu eklendi.
-- ============================================================================
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
   where s.team_id is null
     and case coalesce(p_filter, 'all')
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
     case when p_sort = 'recommended' then
       s.quote_count * 3 + case when s.rating_count >= 3 then s.rating_avg * ln(1 + s.rating_count) * 4 else 0 end
     end desc nulls last,
     case when p_sort = 'title' then lower(s.title) end asc,
     case when p_sort = 'created' then s.created_at end desc,
     case when p_sort = 'opened' then us.last_opened_at end desc nulls last,
     s.updated_at desc,
     s.id
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ============================================================================
-- 7. Yetkiler
-- ============================================================================
revoke execute on function public.spaces_team_area_guard(), public.team_projects_counter() from public, anon, authenticated;
