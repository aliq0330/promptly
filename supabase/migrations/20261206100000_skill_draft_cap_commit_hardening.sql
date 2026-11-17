-- Skill denetimi Faz 4 (docs/history/416-*): taslak nesne birikimini sınırlar, yayın commit'ini sertleştirir. Yalnız ekleyici/sıkılaştırıcı; veri silinmez/değişmez.
--
-- 1) Taslak nesne sayısı: Storage INSERT politikası yalnız yol kalıbına ve sahipliğe bakıyordu; `skill_files` satırı olmayan (kota/sınır tetikleyicisine hiç uğramayan) yüklemeler
--    süpürücü (≥1 saat, yetim) gelene kadar sınırsız birikebiliyordu. Artık Skill başına en çok 200 taslak nesne (dosya sınırı 100 × yer değiştirirken geçici ikinci kopya payı) ve 10 kapak nesnesi.
-- 2) `skill_publish_commit`: paket boyutu karşılaştırması Storage kaydında boyut yoksa atlanmaz (eskiden `coalesce` bildirilen boyutu kabul ediyordu) ve günlük yayın sınırı commit'te de uygulanır.
-- Politika kendi tablosunu (storage.objects) alt sorguyla sayamaz ("infinite recursion detected in policy"); sayım çağıranın sahip olduğu Skill için bu SECURITY DEFINER yardımcıdan gelir.
-- Başkasının Skill'inde ya da geçersiz kimlikte 0 döner (varlık/sayı sızmaz). Politikalar çağıranın yetkisiyle çalıştığı için `authenticated`'a EXECUTE açıktır.
create or replace function public.skill_object_count(p_skill text, p_folder text)
returns integer
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_id uuid;
begin
  begin
    v_id := p_skill::uuid;
  exception when others then
    return 0;
  end;
  if p_folder not in ('draft', 'cover') or not exists (select 1 from public.skills s where s.id = v_id and s.author_id = (select auth.uid())) then
    return 0;
  end if;
  return (select count(*)::integer from storage.objects o where o.bucket_id = 'skill-files' and o.name like p_skill || '/' || p_folder || '/%');
end;
$$;
revoke all on function public.skill_object_count(text, text) from public, anon;
grant execute on function public.skill_object_count(text, text) to authenticated;

drop policy if exists "Owners upload skill drafts" on storage.objects;
create policy "Owners upload skill drafts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'skill-files'
    and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid()))
    and (
      (name ~ '^[0-9a-f-]{36}/draft/[0-9a-f-]{36}\.[a-z0-9]{1,5}$' and public.skill_object_count((storage.foldername(name))[1], 'draft') < 200)
      or (name ~ '^[0-9a-f-]{36}/cover/[0-9a-f-]{36}\.(jpg|png|webp)$' and public.skill_object_count((storage.foldername(name))[1], 'cover') < 10)
    )
  );

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
  v_skill public.skills;
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

  v_skill := public._skill_publish_check(p_user, p_skill, p_version, p_changelog);
  -- Günde ≤10 yayın: `begin` sayar, ama begin ile commit arasındaki paralel yayınlar sınırı aşabilirdi; commit de aynı sınırı uygular.
  if (select count(*) from public.skill_versions v join public.skills s on s.id = v.skill_id
        where s.author_id = p_user and v.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'skill_publish_rate_limit';
  end if;

  if p_package_sha256 is null or p_package_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'skill_package_invalid';
  end if;
  v_path := p_skill::text || '/packages/' || p_version || '-' || substr(p_package_sha256, 1, 16) || '.zip';
  -- Paket gerçekten yazılmış olmalı (Edge Function service role ile yazar) ve bildirilen boyutla uyuşmalı.
  -- Boyut Storage'ın kendi kaydından okunur; kayıtta boyut yoksa (NULL) bildirilenle karşılaştırma ATLANMAZ, uyuşmazlık sayılır.
  select (metadata->>'size')::bigint into v_stored_size
    from storage.objects where bucket_id = 'skill-files' and name = v_path;
  if not found then
    raise exception 'skill_package_missing';
  end if;
  if v_stored_size is distinct from p_package_size then
    raise exception 'skill_package_mismatch';
  end if;

  insert into public.skill_versions (skill_id, version, changelog, package_path, package_sha256, package_size, file_count, manifest, client_token, instructions)
  values (p_skill, p_version, btrim(coalesce(p_changelog, '')), v_path, p_package_sha256, p_package_size, p_file_count, coalesce(p_manifest, '{}'::jsonb), p_client_token, v_skill.instructions)
  returning * into v_row;

  -- Çalışma kopyası "yayında" olur; sürüm numarası yayınlanan sürümdür.
  update public.skills set version = p_version, status = 'published' where id = p_skill;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.skill_publish_commit(uuid, uuid, text, text, uuid, text, bigint, integer, jsonb) from public, anon, authenticated;
grant execute on function public.skill_publish_commit(uuid, uuid, text, text, uuid, text, bigint, integer, jsonb) to service_role;
