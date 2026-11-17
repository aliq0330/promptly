-- Skill denetimi Faz 2 (docs/history/414-*): yayın doğrulamasının atlanmasını DB'de kapatır. Yalnız ekleyici (yeni tetikleyici + bucket ayarı); veri silinmez/değişmez.
--
-- Bulgu: `skills` üzerinde sahibe açık UPDATE vardı ve `status`/`version` için koruma yoktu; sahip doğrudan `status='published'` + `version='99.0.0'` yazıp Edge `skill-package`
-- doğrulamasını (gizli anahtar taraması, bütünlük) atlayabiliyor, yayınlanmış paketin sürüm numarasını değiştirebiliyordu. Dokümantasyon "yayında olmayı yalnız Edge verir" diyordu; uygulanmıyordu.
--
-- Kural (yalnız istemci rolleri — `anon`/`authenticated`; `skill_publish_commit` SECURITY DEFINER'dır, moderatör RPC'leri ve service_role etkilenmez; `protect_counter_columns` kalıbı):
--   1) Sürümü OLAN bir Skill'in `version`'ı istemciden değişmez (yalnız commit yazar: yayınlanan sürüm = Skill'in sürümü).
--   2) Dosyası (`skill_files`) olup HİÇ sürümü olmayan bir Skill taslaktan "yayında"ya istemciden geçemez (paketi doğrulayan tek yol Edge). Dosyasız (kolay mod) Skill'in doğrudan yayını AYNEN çalışır.
--   3) Yayında olan Skill'in başlık/özet/talimat metni özel anahtar bloğu ya da JWT içeremez (Edge'in `secret_private_key` / `secret_jwt` ENGELİyle aynı iki kural; sağlayıcı anahtarları yalnız UYARIdır, yayını durdurmaz).
create or replace function public.skills_publish_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_text text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.version is distinct from old.version
       and exists (select 1 from public.skill_versions v where v.skill_id = new.id) then
      raise exception 'skill_publish_via_edge';
    end if;
    if new.status = 'published' and old.status is distinct from 'published'
       and not exists (select 1 from public.skill_versions v where v.skill_id = new.id)
       and exists (select 1 from public.skill_files f where f.skill_id = new.id) then
      raise exception 'skill_publish_via_edge';
    end if;
  end if;

  if new.status = 'published'
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.instructions is distinct from old.instructions
          or new.summary is distinct from old.summary or new.title is distinct from old.title) then
    v_text := coalesce(new.title, '') || E'\n' || coalesce(new.summary, '') || E'\n' || coalesce(new.instructions, '');
    if v_text ~ '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY( BLOCK)?-----'
       or v_text ~ '(^|[^A-Za-z0-9_])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}' then
      raise exception 'skill_secret_found';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists skills_publish_guard on public.skills;
create trigger skills_publish_guard before insert or update on public.skills
  for each row execute function public.skills_publish_guard();
revoke all on function public.skills_publish_guard() from public, anon, authenticated;

-- `skill-files` bucket'ı TÜR kısıtsızdı (diğer medya bucket'larında `allowed_mime_types` var). Sahip herhangi bir `Content-Type` ile (ör. text/html) dosya/kapak yükleyebiliyor, kapak ise
-- Skill'i okuyabilen herkese imzalı adresle sunuluyordu. Yalnız Skill'in kendi türleri: metin/yapılandırma dosyaları, PDF, görseller (kapak dahil) ve Edge'in yazdığı paket ZIP'i.
-- Betik dosyaları (.sh .py .js .ps1 .bat) istemcide `text/plain` olarak yüklenir.
update storage.buckets
   set allowed_mime_types = array['text/markdown', 'text/plain', 'text/csv', 'text/yaml', 'application/json', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/zip']
 where id = 'skill-files';
