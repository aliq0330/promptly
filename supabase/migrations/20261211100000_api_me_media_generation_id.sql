-- Taslağa görsel eklemede İDEMPOTENS (docs/history/438-*): aynı otomasyon işi ikinci kez koşarsa ikinci bir ek ya da kopya dosya oluşmaz.
--
-- Her görsel eki isteğe bağlı bir `generation_id` taşır (örn. "promptly_visual_trend_2026-11-19T10:00"). Aynı (taslak, generation_id) çifti ikinci kez
-- eklenmek istenirse HİÇBİR ŞEY indirilmez/yazılmaz; ilk ekin bilgisi `existing` olarak döner ve istemci "duplicate" sonucu verir.
--
-- Yalnızca ekleyicidir (expand, CLAUDE.md §8.11): eski `api_me_media_begin(uuid)` / `api_me_media_commit(uuid,text,text,integer,integer,text)` AYNEN kalır
-- (henüz deploy edilmemiş eski `media-upload` onları çağırır); yeni Edge Function aşağıdaki iki yeni aşırı yüklemeyi çağırır. Yeni imzalarda varsayılan
-- değer YOK — varsayılanlı bir `begin(uuid, text default null)` tek argümanlı çağrıda eskisiyle "is not unique" hatası verirdi.

alter table public.prompt_media add column if not exists generation_id text;
alter table public.prompt_media drop constraint if exists prompt_media_generation_id_check;
alter table public.prompt_media add constraint prompt_media_generation_id_check
  check (generation_id is null or generation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$');
create unique index if not exists prompt_media_generation_uniq on public.prompt_media (prompt_id, generation_id) where generation_id is not null;

create or replace function public.api_me_media_begin(p_prompt_id uuid, p_generation_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.prompts%rowtype;
  v_n integer;
  v_m public.prompt_media%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_generation_id is not null and p_generation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' then return public._api_me_err('invalid_generation_id'); end if;
  -- Denemeler sayılır (başarı değil): saatte 20.
  perform public._rate_limit('api_me_media', 20, interval '1 hour');
  select * into v_p from public.prompts
   where id = p_prompt_id and author_id = v_uid and community_id is null and deleted_at is null;
  if not found then return public._api_me_err('not_found'); end if;
  if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
  if v_p.content_type <> 'image' then return public._api_me_err('not_image_prompt'); end if;
  select count(*) into v_n from public.prompt_media where prompt_id = p_prompt_id;
  -- Bu iş zaten eklenmişse (4 görsel dolu olsa bile) tekrar denemek başarıdır: mevcut ek döner.
  if p_generation_id is not null then
    select * into v_m from public.prompt_media where prompt_id = p_prompt_id and generation_id = p_generation_id;
    if found then
      return jsonb_build_object('ok', true, 'userId', v_uid, 'count', v_n,
        'existing', jsonb_build_object('mediaId', v_m.id, 'position', v_m.position, 'width', v_m.width, 'height', v_m.height));
    end if;
  end if;
  if v_n >= 4 then return public._api_me_err('too_many_images'); end if;
  return jsonb_build_object('ok', true, 'userId', v_uid, 'count', v_n);
end $$;

create or replace function public.api_me_media_commit(
  p_prompt_id uuid, p_path text, p_url text, p_width integer, p_height integer, p_alt text, p_generation_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.prompts%rowtype;
  v_n integer;
  v_id uuid;
  v_m public.prompt_media%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_generation_id is not null and p_generation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' then return public._api_me_err('invalid_generation_id'); end if;
  -- Yol YALNIZ çağıranın klasöründe, uuid adlı jpg/png/webp olabilir; adres o yolun herkese-açık-biçimli kimlik URL'sidir (CLAUDE.md §7: URL yalnız kimliktir).
  if p_path is null or p_path !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    return public._api_me_err('invalid_path');
  end if;
  if p_url is null or p_url !~ '^https://[^/?#]+/storage/v1/object/public/prompt-media/' or right(p_url, char_length(p_path) + 1) <> '/' || p_path then
    return public._api_me_err('invalid_url');
  end if;
  if p_width is null or p_height is null or p_width not between 1 and 20000 or p_height not between 1 and 20000 then
    return public._api_me_err('invalid_size');
  end if;
  if p_alt is not null and char_length(p_alt) > 300 then return public._api_me_err('invalid_alt'); end if;

  select * into v_p from public.prompts
   where id = p_prompt_id and author_id = v_uid and community_id is null and deleted_at is null for update;
  if not found then return public._api_me_err('not_found'); end if;
  if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
  if v_p.content_type <> 'image' then return public._api_me_err('not_image_prompt'); end if;
  select count(*) into v_n from public.prompt_media where prompt_id = p_prompt_id;

  -- Yarış: aynı iş başka bir istekle az önce eklendiyse (taslak satırı `for update` ile kilitli olduğundan burada sıralanırız) o ek sonuçtur.
  if p_generation_id is not null then
    select * into v_m from public.prompt_media where prompt_id = p_prompt_id and generation_id = p_generation_id;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'mediaId', v_m.id, 'position', v_m.position, 'count', v_n, 'width', v_m.width, 'height', v_m.height);
    end if;
  end if;
  if v_n >= 4 then return public._api_me_err('too_many_images'); end if;

  -- Dosya gerçekten yüklendi mi? (kendi klasörü: Storage okuma politikası izin verir)
  if not exists (select 1 from storage.objects o where o.bucket_id = 'prompt-media' and o.name = p_path) then
    return public._api_me_err('file_missing');
  end if;
  if exists (select 1 from public.prompt_media m where m.url = p_url) then return public._api_me_err('already_attached'); end if;

  insert into public.prompt_media (prompt_id, url, width, height, alt, position, generation_id)
  values (p_prompt_id, p_url, p_width, p_height, nullif(btrim(p_alt), ''), v_n, p_generation_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'mediaId', v_id, 'position', v_n, 'count', v_n + 1);
end $$;

revoke all on function public.api_me_media_begin(uuid, text) from public, anon;
revoke all on function public.api_me_media_commit(uuid, text, text, integer, integer, text, text) from public, anon;
grant execute on function public.api_me_media_begin(uuid, text) to authenticated;
grant execute on function public.api_me_media_commit(uuid, text, text, integer, integer, text, text) to authenticated;
