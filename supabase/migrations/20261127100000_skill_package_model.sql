-- Skill / Beceri — veri modeli ve paket (docs/history/389-*; plan: docs/skill-plani.md Aşama 1).
--
-- Yalnız EKLER (expand): yeni tablolar, yeni bucket, yeni fonksiyonlar. `skills` tablosunun hiçbir sütunu/politikası değişmez; kolay mod
-- (dosyasız Skill, doğrudan `skills.status` güncellemesi) AYNEN çalışır. Tek yeniden tanımlanan nesne `orphan_storage_objects`'tir
-- (gövde 20261102100000'dakiyle aynı; ek: skill-files bucket'ı + iki yeni başvuru).
--
-- Model:
--   • `skill_files`     — Skill'in ÇALIŞMA kopyasındaki dosyalar. İçerik Postgres'te değil özel `skill-files` bucket'ındadır
--                         (`{skill_id}/draft/{uuid}.{ext}`); satır yalnız sahibine görünür. Yazar kendi klasörüne yükler.
--   • `skill_versions`  — DEĞİŞMEZ sürüm: bir ZIP (`{skill_id}/packages/{sürüm}-{sha16}.zip`) + `sha256` + dosya listesi (`manifest`). Satırı
--                         yalnız `skill_publish_commit` yazar (yalnız service_role: Edge Function `skill-package` önce paketi yeniden doğrular ve derler).
--                         Yayından sonra yalnız `deprecated_at` değişebilir (tetikleyici korur).
--   • `skill_tags`, `skill_relations` (Prompt/Workflow/Ayar paketi başvurusu, kopya değil), `skill_uses` (kişi-Skill-gün, istemciye KAPALI),
--     `skill_pins` (kişisel sürüm sabitleme).
--   • Paket ZIP'ini yalnız service_role yazar; okuma = sürüm satırını OKUYABİLEN herkes (Skill'in görünürlüğünü izler).
--
-- Güvenlik: Storage politikaları yol kalıbını ve sahipliği zorlar; sunucuda hiçbir dosya çalıştırılmaz (betik yalnız veridir).

-- ============================================================================
-- 1) skill_versions — değişmez sürüm
-- ============================================================================
create table if not exists public.skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills (id) on delete cascade,
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and char_length(version) <= 32),
  changelog text not null default '' check (char_length(changelog) <= 2000),
  package_path text not null,
  package_sha256 text not null check (package_sha256 ~ '^[0-9a-f]{64}$'),
  package_size bigint not null check (package_size > 0 and package_size <= 10485760),
  file_count integer not null check (file_count between 0 and 100),
  manifest jsonb not null default '{}'::jsonb check (pg_column_size(manifest) <= 65536),
  -- Yeniden denemeyi idempotent yapar: aynı (Skill, belirteç) ikinci kez yeni satır açmaz.
  client_token uuid,
  deprecated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (skill_id, version),
  unique (skill_id, client_token),
  -- İçerik adresli yol: aynı yol = aynı içerik; yayından sonra başka bir paket aynı yola yazılamaz.
  check (package_path = skill_id::text || '/packages/' || version || '-' || substr(package_sha256, 1, 16) || '.zip')
);

create index if not exists skill_versions_skill_idx on public.skill_versions (skill_id, created_at desc);

alter table public.skill_versions enable row level security;

-- Okuma: üst Skill'i OKUYABİLEN herkes (alt sorgu çağıranın RLS'iyle çalışır: görünürlük + engelleme devralınır).
drop policy if exists "Versions are readable where their skill is" on public.skill_versions;
create policy "Versions are readable where their skill is"
  on public.skill_versions for select
  using (exists (select 1 from public.skills s where s.id = skill_versions.skill_id));

revoke all on public.skill_versions from anon, authenticated;
grant select on public.skill_versions to anon, authenticated;

-- Yayınlanmış sürüm değişmez: yalnız `deprecated_at` (kullanımdan kaldırıldı işareti) güncellenebilir.
create or replace function public.skill_versions_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(new) - 'deprecated_at') is distinct from (to_jsonb(old) - 'deprecated_at') then
    raise exception 'skill_version_immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists skill_versions_immutable on public.skill_versions;
create trigger skill_versions_immutable before update on public.skill_versions
  for each row execute function public.skill_versions_immutable();
revoke all on function public.skill_versions_immutable() from public, anon, authenticated;

-- ============================================================================
-- 2) skill_files — çalışma kopyasındaki dosyalar (içerik Storage'da)
-- ============================================================================
create table if not exists public.skill_files (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills (id) on delete cascade,
  -- Paket içi yol: ≤6 düzey, her parça harf/rakam/_/-/. (nokta ile BAŞLAMAZ → "..", ".", gizli dosya, ".git" olmaz), ≤200 karakter.
  path text not null check (
    char_length(path) <= 200
    and path ~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*){0,5}$'
    and lower(path) ~ '\.(md|txt|json|yaml|yml|csv|pdf|png|jpg|jpeg|webp|sh|py|js|ps1|bat)$'
    and lower(path) not in ('skill.md', 'metadata.json')
  ),
  kind text not null,
  size bigint not null check (size >= 0 and size <= 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null,
  is_script boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (skill_id, path),
  -- Tür yoldan türer (üst klasör); betik bayrağı uzantıdan türer — istemci ikisini de yanlış veremez.
  check (kind = case
    when path like 'rules/%' then 'rule'
    when path like 'references/%' then 'reference'
    when path like 'examples/%' then 'example'
    when path like 'scripts/%' then 'script'
    when path like 'tools/%' then 'tool'
    else 'other' end),
  check (is_script = (lower(path) ~ '\.(sh|py|js|ps1|bat)$')),
  check (storage_path ~ ('^' || skill_id::text || '/draft/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'))
);

create index if not exists skill_files_skill_idx on public.skill_files (skill_id, path);
-- Büyük/küçük harf duyarsız benzersizlik: `Rules/A.md` ile `rules/a.md` büyük/küçük harf duyarsız dosya sistemlerinde çakışırdı.
create unique index if not exists skill_files_lower_path_uidx on public.skill_files (skill_id, lower(path));

drop trigger if exists skill_files_set_updated_at on public.skill_files;
create trigger skill_files_set_updated_at before update on public.skill_files
  for each row execute function public.set_updated_at();

alter table public.skill_files enable row level security;

-- Çalışma kopyası yalnız sahibine görünür/yazılır (okuyucular dosya listesini sürümün `manifest`inden görür).
drop policy if exists "Owners read their skill files" on public.skill_files;
create policy "Owners read their skill files" on public.skill_files for select to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_files.skill_id and s.author_id = (select auth.uid())));
drop policy if exists "Owners add skill files" on public.skill_files;
create policy "Owners add skill files" on public.skill_files for insert to authenticated
  with check (exists (select 1 from public.skills s where s.id = skill_files.skill_id and s.author_id = (select auth.uid())));
drop policy if exists "Owners update skill files" on public.skill_files;
create policy "Owners update skill files" on public.skill_files for update to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_files.skill_id and s.author_id = (select auth.uid())))
  with check (exists (select 1 from public.skills s where s.id = skill_files.skill_id and s.author_id = (select auth.uid())));
drop policy if exists "Owners delete skill files" on public.skill_files;
create policy "Owners delete skill files" on public.skill_files for delete to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_files.skill_id and s.author_id = (select auth.uid())));

revoke all on public.skill_files from anon, authenticated;
grant select, insert, update, delete on public.skill_files to authenticated;

-- Sınırlar (TASLAK rakamlar, docs/skill-plani.md §4; `src/lib/skills/limits.ts` ile aynası birim testte karşılaştırılır):
-- Skill başına ≤100 dosya ve toplam ≤40 MB (açılmış); kişi başına dosya + paket toplamı ≤200 MB.
create or replace function public.skill_files_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_count integer;
  v_skill_bytes bigint;
  v_user_bytes bigint;
begin
  select author_id into v_author from public.skills where id = new.skill_id;
  if v_author is null then
    raise exception 'skill_not_found';
  end if;
  select count(*), coalesce(sum(size), 0) into v_count, v_skill_bytes
    from public.skill_files where skill_id = new.skill_id and id <> new.id;
  if tg_op = 'INSERT' and v_count >= 100 then
    raise exception 'skill_too_many_files';
  end if;
  if v_skill_bytes + new.size > 41943040 then
    raise exception 'skill_files_too_large';
  end if;
  select coalesce(sum(f.size), 0) into v_user_bytes
    from public.skill_files f join public.skills s on s.id = f.skill_id
    where s.author_id = v_author and f.id <> new.id;
  v_user_bytes := v_user_bytes + coalesce((
    select sum(v.package_size) from public.skill_versions v join public.skills s on s.id = v.skill_id where s.author_id = v_author
  ), 0);
  if v_user_bytes + new.size > 209715200 then
    raise exception 'skill_quota_exceeded';
  end if;
  return new;
end;
$$;
drop trigger if exists skill_files_limits on public.skill_files;
create trigger skill_files_limits before insert or update on public.skill_files
  for each row execute function public.skill_files_limits();
revoke all on function public.skill_files_limits() from public, anon, authenticated;

drop trigger if exists skill_files_enforce_can_post on public.skill_files;
create trigger skill_files_enforce_can_post before insert on public.skill_files
  for each row execute function public.enforce_can_post('content');
drop trigger if exists skill_files_rate_limit on public.skill_files;
create trigger skill_files_rate_limit before insert on public.skill_files
  for each row execute function public.enforce_rate_limit('skill_file', '300', '3600');

-- ============================================================================
-- 3) skill_tags — workflow_tags ile aynı join-tablosu deseni (en çok 10 etiket)
-- ============================================================================
create table if not exists public.skill_tags (
  skill_id uuid not null references public.skills (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  primary key (skill_id, tag_slug)
);
create index if not exists skill_tags_tag_slug_idx on public.skill_tags (tag_slug);

alter table public.skill_tags enable row level security;
drop policy if exists "Skill tags are readable where their skill is" on public.skill_tags;
create policy "Skill tags are readable where their skill is" on public.skill_tags for select
  using (exists (select 1 from public.skills s where s.id = skill_tags.skill_id));
drop policy if exists "Owners tag their own skills" on public.skill_tags;
create policy "Owners tag their own skills" on public.skill_tags for insert to authenticated
  with check (exists (select 1 from public.skills s where s.id = skill_tags.skill_id and s.author_id = (select auth.uid())));
drop policy if exists "Owners untag their own skills" on public.skill_tags;
create policy "Owners untag their own skills" on public.skill_tags for delete to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_tags.skill_id and s.author_id = (select auth.uid())));

revoke all on public.skill_tags from anon, authenticated;
grant select on public.skill_tags to anon, authenticated;
grant insert, delete on public.skill_tags to authenticated;

create or replace function public.skill_tags_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.skill_tags where skill_id = new.skill_id) >= 10 then
    raise exception 'skill_too_many_tags';
  end if;
  return new;
end;
$$;
drop trigger if exists skill_tags_limit on public.skill_tags;
create trigger skill_tags_limit before insert on public.skill_tags
  for each row execute function public.skill_tags_limit();
revoke all on function public.skill_tags_limit() from public, anon, authenticated;

-- ============================================================================
-- 4) skill_relations — Skill'e bağlı Prompt / Workflow / Ayar paketi (kimlik başvurusu, kopya değil)
-- ============================================================================
create table if not exists public.skill_relations (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills (id) on delete cascade,
  target_type text not null check (target_type in ('prompt', 'workflow', 'preset')),
  target_id uuid not null,
  position integer not null default 0 check (position between 0 and 99),
  created_at timestamptz not null default now(),
  unique (skill_id, target_type, target_id)
);
create index if not exists skill_relations_skill_idx on public.skill_relations (skill_id, position);
create index if not exists skill_relations_target_idx on public.skill_relations (target_type, target_id);

alter table public.skill_relations enable row level security;
drop policy if exists "Skill relations are readable where their skill is" on public.skill_relations;
create policy "Skill relations are readable where their skill is" on public.skill_relations for select
  using (exists (select 1 from public.skills s where s.id = skill_relations.skill_id));
drop policy if exists "Owners relate their own skills" on public.skill_relations;
create policy "Owners relate their own skills" on public.skill_relations for insert to authenticated
  with check (exists (select 1 from public.skills s where s.id = skill_relations.skill_id and s.author_id = (select auth.uid())));
drop policy if exists "Owners update their skill relations" on public.skill_relations;
create policy "Owners update their skill relations" on public.skill_relations for update to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_relations.skill_id and s.author_id = (select auth.uid())))
  with check (exists (select 1 from public.skills s where s.id = skill_relations.skill_id and s.author_id = (select auth.uid())));
drop policy if exists "Owners unrelate their own skills" on public.skill_relations;
create policy "Owners unrelate their own skills" on public.skill_relations for delete to authenticated
  using (exists (select 1 from public.skills s where s.id = skill_relations.skill_id and s.author_id = (select auth.uid())));

revoke all on public.skill_relations from anon, authenticated;
grant select on public.skill_relations to anon, authenticated;
grant insert, update, delete on public.skill_relations to authenticated;

-- Bağlanabilen yalnız herkese açık + yayında + topluluğa/ekibe özgü olmayan içeriktir (`quote_target_ok`); en çok 20 bağ.
-- Başkasının özel içeriği için de aynı hata: varlığı sızmaz.
create or replace function public.skill_relations_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
    if not public.quote_target_ok(new.target_type, new.target_id) then
      raise exception 'skill_relation_not_public';
    end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.skill_relations where skill_id = new.skill_id) >= 20 then
    raise exception 'skill_too_many_relations';
  end if;
  return new;
end;
$$;
drop trigger if exists skill_relations_guard on public.skill_relations;
create trigger skill_relations_guard before insert or update on public.skill_relations
  for each row execute function public.skill_relations_guard();
revoke all on function public.skill_relations_guard() from public, anon, authenticated;

-- ============================================================================
-- 5) skill_uses — kişi-Skill-gün kullanım kaydı (prompt_copy_events kalıbı; istemciye TAMAMEN kapalı)
-- ============================================================================
create table if not exists public.skill_uses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id, day)
);
alter table public.skill_uses enable row level security;
revoke all on public.skill_uses from anon, authenticated;

-- Yazma yalnız bu RPC: indirmeyi/kurulumu sayar. Yazar kendi Skill'ini, engelli taraf birbirinin Skill'ini, taslak/özel Skill'i saymaz;
-- kişi-Skill-gün başına bir satır; kişi günde ≤100 farklı Skill sayar. Dönüş: bu çağrı yeni bir kullanım yazdı mı.
create or replace function public.record_skill_use(p_skill_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_author uuid;
  v_inserted integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  select author_id into v_author from public.skills where id = p_skill_id and status = 'published' and visibility = 'public';
  if v_author is null or v_author = v_user or public.is_blocked(v_user, v_author) then
    return false;
  end if;
  if (select count(*) from public.skill_uses where user_id = v_user and day = (now() at time zone 'utc')::date) >= 100 then
    return false;
  end if;
  insert into public.skill_uses (user_id, skill_id) values (v_user, p_skill_id) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;
  update public.skills set use_count = use_count + 1 where id = p_skill_id;
  return true;
end;
$$;
revoke all on function public.record_skill_use(uuid) from public, anon;
grant execute on function public.record_skill_use(uuid) to authenticated;

-- ============================================================================
-- 6) skill_pins — kişisel sürüm sabitleme
-- ============================================================================
create table if not exists public.skill_pins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  version text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id),
  foreign key (skill_id, version) references public.skill_versions (skill_id, version) on delete cascade
);
alter table public.skill_pins enable row level security;
drop policy if exists "Users read their own pins" on public.skill_pins;
create policy "Users read their own pins" on public.skill_pins for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users pin versions of readable skills" on public.skill_pins;
create policy "Users pin versions of readable skills" on public.skill_pins for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.skills s where s.id = skill_pins.skill_id));
drop policy if exists "Users change their own pins" on public.skill_pins;
create policy "Users change their own pins" on public.skill_pins for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users remove their own pins" on public.skill_pins;
create policy "Users remove their own pins" on public.skill_pins for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.skill_pins from anon, authenticated;
grant select, insert, update, delete on public.skill_pins to authenticated;

-- ============================================================================
-- 7) skill-files bucket (PRIVATE) + Storage politikaları
-- ============================================================================
-- Yol kalıpları: çalışma kopyası `{skill_id}/draft/{uuid}.{uzantı}`; paket `{skill_id}/packages/{sürüm}-{sha16}.zip` (yalnız service_role yazar).
insert into storage.buckets (id, name, public, file_size_limit)
values ('skill-files', 'skill-files', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "Skill drafts and published packages are readable" on storage.objects;
create policy "Skill drafts and published packages are readable"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'skill-files'
    and (
      -- çalışma kopyası: yalnız Skill'in sahibi
      ((storage.foldername(name))[2] = 'draft'
        and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid())))
      -- paket: bir sürüm satırı bu yolu gösteriyorsa ve çağıran o sürümü OKUYABİLİYORSA
      or ((storage.foldername(name))[2] = 'packages'
        and exists (select 1 from public.skill_versions v where v.package_path = name))
    )
  );

drop policy if exists "Owners upload skill drafts" on storage.objects;
create policy "Owners upload skill drafts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'skill-files'
    and name ~ '^[0-9a-f-]{36}/draft/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'
    and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid()))
  );

drop policy if exists "Owners delete skill drafts" on storage.objects;
create policy "Owners delete skill drafts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'skill-files'
    and (storage.foldername(name))[2] = 'draft'
    and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid()))
  );

-- ============================================================================
-- 8) Yetim taraması: gövde 20261102100000'dakiyle aynı; ek: skill-files bucket'ı + skill_files / skill_versions başvuruları
-- ============================================================================
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
    union all select media_ref from public.prompt_comments where media_kind = 'photo'
    union all select storage_path from public.skill_files
    union all select package_path from public.skill_versions
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media','community-avatars','story-media','space-media','comment-media','skill-files')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$function$;

-- ============================================================================
-- 9) Yayın akışı RPC'leri (yalnız service_role: Edge Function `skill-package` kimliği doğrular, `p_user`'ı kendisi verir)
-- ============================================================================
-- Sürüm karşılaştırması: 1.10.0 > 1.9.0 (metin değil sayı).
create or replace function public._skill_version_key(p_version text)
returns bigint[]
language sql
immutable
set search_path = public
as $$
  select array[split_part(p_version, '.', 1)::bigint, split_part(p_version, '.', 2)::bigint, split_part(p_version, '.', 3)::bigint]
$$;
revoke all on function public._skill_version_key(text) from public, anon, authenticated;

create or replace function public._skill_publish_check(p_user uuid, p_skill uuid, p_version text, p_changelog text)
returns public.skills
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skill public.skills;
  v_profile public.profiles;
  v_latest text;
  v_versions integer;
begin
  select * into v_skill from public.skills where id = p_skill and author_id = p_user for update;
  if not found then
    raise exception 'skill_not_found';
  end if;
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.suspended_until is not null and v_profile.suspended_until > now() then
    raise exception 'Hesabın geçici olarak askıya alındı.';
  end if;
  if v_profile.posting_blocked then
    raise exception 'Hesabın için paylaşım yapma yetkisi kısıtlandı.';
  end if;
  if p_version is null or p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' or char_length(p_version) > 32 then
    raise exception 'skill_version_invalid';
  end if;
  if exists (select 1 from public.skill_versions where skill_id = p_skill and version = p_version) then
    raise exception 'skill_version_exists';
  end if;
  select count(*) into v_versions from public.skill_versions where skill_id = p_skill;
  if v_versions > 0 then
    select version into v_latest from public.skill_versions where skill_id = p_skill order by public._skill_version_key(version) desc limit 1;
    if public._skill_version_key(p_version) <= public._skill_version_key(v_latest) then
      raise exception 'skill_version_not_newer';
    end if;
    -- İlk yayından sonra her sürüm bir değişiklik notu ister.
    if char_length(btrim(coalesce(p_changelog, ''))) < 3 then
      raise exception 'skill_changelog_required';
    end if;
  end if;
  if char_length(coalesce(p_changelog, '')) > 2000 then
    raise exception 'skill_changelog_too_long';
  end if;
  return v_skill;
end;
$$;
revoke all on function public._skill_publish_check(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.skill_publish_begin(p_user uuid, p_skill uuid, p_version text, p_changelog text, p_client_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skill public.skills;
  v_existing public.skill_versions;
  v_username text;
begin
  if p_user is null or p_client_token is null then
    raise exception 'skill_publish_args';
  end if;
  -- Aynı belirteçle daha önce tamamlanmış yayın: yeniden doğrulama/derleme yapmadan sonucu ver (idempotent).
  select * into v_existing from public.skill_versions where skill_id = p_skill and client_token = p_client_token;
  if found then
    if not exists (select 1 from public.skills where id = p_skill and author_id = p_user) then
      raise exception 'skill_not_found';
    end if;
    return jsonb_build_object('already', true, 'version', to_jsonb(v_existing));
  end if;

  v_skill := public._skill_publish_check(p_user, p_skill, p_version, p_changelog);

  -- Günde en çok 10 yayın (24 saat, kişi başına).
  if (select count(*) from public.skill_versions v join public.skills s on s.id = v.skill_id
        where s.author_id = p_user and v.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'skill_publish_rate_limit';
  end if;

  select username into v_username from public.profiles where id = p_user;
  return jsonb_build_object(
    'already', false,
    'skill', jsonb_build_object(
      'id', v_skill.id, 'slug', v_skill.slug, 'title', v_skill.title, 'summary', v_skill.summary, 'instructions', v_skill.instructions,
      'category', v_skill.category, 'compat', to_jsonb(v_skill.compat), 'license', v_skill.license, 'visibility', v_skill.visibility,
      'author_username', v_username
    ),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object('path', f.path, 'kind', f.kind, 'size', f.size, 'sha256', f.sha256, 'storage_path', f.storage_path, 'is_script', f.is_script) order by f.path)
      from public.skill_files f where f.skill_id = p_skill
    ), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.skill_tags t where t.skill_id = p_skill), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.skill_publish_begin(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.skill_publish_begin(uuid, uuid, text, text, uuid) to service_role;

create or replace function public.skill_publish_commit(
  p_user uuid, p_skill uuid, p_version text, p_changelog text, p_client_token uuid,
  p_package_sha256 text, p_package_size bigint, p_file_count integer, p_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_existing public.skill_versions;
  v_row public.skill_versions;
  v_path text;
  v_stored_size bigint;
begin
  if p_user is null or p_client_token is null then
    raise exception 'skill_publish_args';
  end if;
  select * into v_existing from public.skill_versions where skill_id = p_skill and client_token = p_client_token;
  if found then
    if not exists (select 1 from public.skills where id = p_skill and author_id = p_user) then
      raise exception 'skill_not_found';
    end if;
    return to_jsonb(v_existing);
  end if;

  perform public._skill_publish_check(p_user, p_skill, p_version, p_changelog);

  if p_package_sha256 is null or p_package_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'skill_package_invalid';
  end if;
  v_path := p_skill::text || '/packages/' || p_version || '-' || substr(p_package_sha256, 1, 16) || '.zip';
  -- Paket gerçekten yazılmış olmalı (Edge Function service role ile yazar) ve bildirilen boyutla uyuşmalı.
  select coalesce((metadata->>'size')::bigint, p_package_size) into v_stored_size
    from storage.objects where bucket_id = 'skill-files' and name = v_path;
  if not found then
    raise exception 'skill_package_missing';
  end if;
  if v_stored_size is distinct from p_package_size then
    raise exception 'skill_package_mismatch';
  end if;

  insert into public.skill_versions (skill_id, version, changelog, package_path, package_sha256, package_size, file_count, manifest, client_token)
  values (p_skill, p_version, btrim(coalesce(p_changelog, '')), v_path, p_package_sha256, p_package_size, p_file_count, coalesce(p_manifest, '{}'::jsonb), p_client_token)
  returning * into v_row;

  -- Çalışma kopyası "yayında" olur; sürüm numarası yayınlanan sürümdür.
  update public.skills set version = p_version, status = 'published' where id = p_skill;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.skill_publish_commit(uuid, uuid, text, text, uuid, text, bigint, integer, jsonb) from public, anon, authenticated;
grant execute on function public.skill_publish_commit(uuid, uuid, text, text, uuid, text, bigint, integer, jsonb) to service_role;

-- Sahibi eski bir sürümü "kullanımdan kaldırıldı" diye işaretler/geri alır; paket silinmez.
create or replace function public.skill_set_deprecated(p_skill uuid, p_version text, p_deprecated boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_changed integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.skills where id = p_skill and author_id = v_user) then
    raise exception 'skill_not_found';
  end if;
  update public.skill_versions set deprecated_at = case when p_deprecated then now() else null end
    where skill_id = p_skill and version = p_version;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    raise exception 'skill_version_not_found';
  end if;
  return true;
end;
$$;
revoke all on function public.skill_set_deprecated(uuid, text, boolean) from public, anon;
grant execute on function public.skill_set_deprecated(uuid, text, boolean) to authenticated;
