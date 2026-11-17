-- Skill denetimi Faz 3 (docs/history/415-*): yayınlanan sürüm TALİMAT METNİNİ de değişmez saklar. Yalnız ekleyici (yeni sütun + aynı imzalı fonksiyonun yeniden tanımı).
--
-- Bulgu: değişmez olan yalnız ZIP'ti. Sayfa, açık API ve MCP `get_skill` çalışma kopyasını (`skills.instructions`, sahibe her an yazılabilir) sunuyordu; sahip bir sürümü yayınladıktan sonra
-- talimatı sürüm artırmadan, changelog'suz ve sabitleyenlere haber vermeden değiştirebiliyordu (ajanlara giden talimat için "rug-pull" / prompt-injection kanalı).
--
-- Çözüm (Seçenek A): `skill_publish_commit` yayın anında kilitli Skill satırındaki `instructions`'ı sürüme yazar; sürüm satırı zaten değişmezdir (`skill_versions_immutable`), yeni sütun da onun kapsamındadır.
-- Okuyucular (sayfa, açık API/MCP) yayınlanan sürümün metnini görür; çalışma kopyası yalnız sahibine "yayınlanmamış değişiklik" olarak görünür. Bu migration'dan ÖNCEKİ sürümlerde sütun NULL'dur
-- (anlık görüntü yoktu; o sürümlerin metni yalnız ZIP'tedir): okuyucular o durumda çalışma kopyasını görür ve bu "çalışma kopyası" diye işaretlenir. Bir sonraki yayınla anlık görüntü başlar.
alter table public.skill_versions
  add column if not exists instructions text check (instructions is null or char_length(instructions) <= 60000);

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
