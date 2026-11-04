-- Kişisel API / MCP ile taslağa GÖRSEL ekleme (docs/history/333-*): `media-upload` Edge Function'ının iki adımı.
--
--   1) api_me_media_begin(prompt)   — kimlik/sahiplik/taslak/tür/sayı denetimi + hız sınırı. Dosya yüklenmeden ÖNCE çağrılır.
--   2) (Edge Function görseli indirir, doğrular, `prompt-media/{kullanıcı}/{uuid}.{uzantı}` yoluna yazar)
--   3) api_me_media_commit(...)     — yüklenen dosyanın gerçekten orada olduğunu doğrular ve `prompt_media` satırını yazar.
--
-- Yalnızca ekleyicidir (expand). Kapsam 321'in sınırıyla aynıdır: yalnız KENDİ, yayınlanmamış, topluluğa özgü olmayan, silinmemiş,
-- `image` türlü prompt taslağı; yayınlama/görünürlük/silme bu yüzeyde YOKTUR. Bir taslakta en çok 4 görsel.
--
-- `begin` SECURITY DEFINER'dır çünkü `_rate_limit` istemci rollerine kapalıdır (`api_me_throttle` ile aynı kalıp); kimlik yine `auth.uid()`'dir ve her
-- sorgu `author_id = auth.uid()` ile açıkça sınırlıdır. `commit` SECURITY INVOKER'dır: `prompt_media` yazması çağıranın RLS'inden geçer.

create or replace function public.api_me_media_begin(p_prompt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.prompts%rowtype;
  v_n integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Denemeler sayılır (başarı değil): saatte 20.
  perform public._rate_limit('api_me_media', 20, interval '1 hour');
  select * into v_p from public.prompts
   where id = p_prompt_id and author_id = v_uid and community_id is null and deleted_at is null;
  if not found then return public._api_me_err('not_found'); end if;
  if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
  if v_p.content_type <> 'image' then return public._api_me_err('not_image_prompt'); end if;
  select count(*) into v_n from public.prompt_media where prompt_id = p_prompt_id;
  if v_n >= 4 then return public._api_me_err('too_many_images'); end if;
  return jsonb_build_object('ok', true, 'userId', v_uid, 'count', v_n);
end $$;

create or replace function public.api_me_media_commit(
  p_prompt_id uuid, p_path text, p_url text, p_width integer, p_height integer, p_alt text default null)
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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
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
  if v_n >= 4 then return public._api_me_err('too_many_images'); end if;

  -- Dosya gerçekten yüklendi mi? (kendi klasörü: Storage okuma politikası izin verir)
  if not exists (select 1 from storage.objects o where o.bucket_id = 'prompt-media' and o.name = p_path) then
    return public._api_me_err('file_missing');
  end if;
  if exists (select 1 from public.prompt_media m where m.url = p_url) then return public._api_me_err('already_attached'); end if;

  insert into public.prompt_media (prompt_id, url, width, height, alt, position)
  values (p_prompt_id, p_url, p_width, p_height, nullif(btrim(p_alt), ''), v_n)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'mediaId', v_id, 'position', v_n, 'count', v_n + 1);
end $$;

revoke all on function public.api_me_media_begin(uuid) from public, anon;
revoke all on function public.api_me_media_commit(uuid, text, text, integer, integer, text) from public, anon;
grant execute on function public.api_me_media_begin(uuid) to authenticated;
grant execute on function public.api_me_media_commit(uuid, text, text, integer, integer, text) to authenticated;
