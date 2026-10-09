-- Yetim Storage dosyalarını bulan yardımcı: hiçbir DB satırının göstermediği
-- (silinmiş prompt/istek/sonuç, değiştirilmiş görsel, yarım kalmış yükleme)
-- nesneleri listeler. Dosyaları SİLMEZ — silme, service role ile Storage
-- API'si üzerinden `cleanup-orphan-storage` Edge Function'ında yapılır
-- (storage.objects satırını SQL ile silmek dosyayı diskten kaldırmaz).
-- Yalnızca service_role çağırabilir.

create or replace function public.orphan_storage_objects(p_min_age interval default interval '1 hour')
returns table (bucket_id text, name text, size bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.generator_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select reference_image_url from public.prompt_requests where reference_image_url is not null
    union all select cover_url from public.generators where cover_url is not null
    union all select a->>'path' from public.messages m, jsonb_array_elements(m.attachments) a
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media')
    -- Yükleme ile DB satırı arasındaki kısa boşlukta yüklenen dosyalara dokunma.
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$$;

revoke all on function public.orphan_storage_objects(interval) from public, anon, authenticated;
grant execute on function public.orphan_storage_objects(interval) to service_role;
