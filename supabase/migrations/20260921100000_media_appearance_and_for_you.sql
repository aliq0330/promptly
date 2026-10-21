-- docs/history/209-*: (1) "Hız hissi" — prompt görsellerinin baskın rengi + küçük bulanık önizlemesi; (2) "Sana özel" akışı.
-- Yalnızca EKLEYİCİ: iki sütun + iki CHECK, üç moderatör RPC'si, bir okuma RPC'si. `drop` yok, mevcut imza değişmez.
-- Uygulama sırası: ÖNCE bu migration, SONRA istemci (yeni istemci `prompt_media.dominant_color/placeholder` sütunlarını seçer
-- ve `for_you_page`'i çağırır; migration yoksa prompt okumaları hata verir).

-- ---------------------------------------------------------------------------------------------------------------------------
-- 1) prompt_media görünümü: kart, görsel inmeden önce bu renkle boyanır, üstüne bu küçük önizleme bulanık konur.
--    Değerleri yükleyen istemci hesaplar (`src/lib/image-appearance.ts`); eski satırları moderatör aracı doldurur.
--    Satırın okunabilirliği değişmez (yeni politika yok): önizlemeyi yalnız o satırı zaten okuyabilen görür.
-- ---------------------------------------------------------------------------------------------------------------------------
alter table public.prompt_media
  add column if not exists dominant_color text,
  add column if not exists placeholder text;

do $$ begin
  alter table public.prompt_media add constraint prompt_media_dominant_color_check
    check (dominant_color is null or dominant_color ~ '^#[0-9a-f]{6}$');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Küçük bir JPEG (≈ 24px); sınır, satıra büyük bir görsel gömülmesini engeller.
  alter table public.prompt_media add constraint prompt_media_placeholder_check
    check (placeholder is null or (placeholder like 'data:image/jpeg;base64,%' and char_length(placeholder) <= 3000));
exception when duplicate_object then null; end $$;

-- Moderatör doldurma aracı: görünümü olmayan satırlar (en yeniden), sayaç ve yazma. Hepsi `_admin_guard()` arkasında.
create or replace function public.admin_media_appearance_stats()
returns table (missing bigint, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();
  return query
    select count(*) filter (where m.dominant_color is null), count(*)
      from public.prompt_media m
      join public.prompts p on p.id = m.prompt_id
     where p.deleted_at is null and m.url not like 'data:%';
end $$;

create or replace function public.admin_media_missing_appearance(p_limit integer default 50, p_exclude uuid[] default '{}')
returns table (id uuid, url text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();
  return query
    select m.id, m.url
      from public.prompt_media m
      join public.prompts p on p.id = m.prompt_id
     where m.dominant_color is null and p.deleted_at is null and m.url not like 'data:%'
       and not (m.id = any (coalesce(p_exclude, '{}'::uuid[])))
     order by p.created_at desc, m.position
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.admin_set_media_appearance(p_media_id uuid, p_color text, p_placeholder text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._admin_guard();
  update public.prompt_media set dominant_color = p_color, placeholder = p_placeholder where id = p_media_id;
  return found;
end $$;

revoke all on function public.admin_media_appearance_stats() from public, anon;
revoke all on function public.admin_media_missing_appearance(integer, uuid[]) from public, anon;
revoke all on function public.admin_set_media_appearance(uuid, text, text) from public, anon;
grant execute on function public.admin_media_appearance_stats() to authenticated;
grant execute on function public.admin_media_missing_appearance(integer, uuid[]) to authenticated;
grant execute on function public.admin_set_media_appearance(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 2) "Sana özel": oturumlu kullanıcıya herkese açık içerik, GERÇEK sinyallere göre sıralı; her satır nedenini taşır.
--    Sinyaller (yalnız kullanıcının kendi satırları, `auth.uid()`): takip ettiği kişiler, takip ettiği etiketler, profilindeki
--    ilgi alanları (`profiles.interests` → içerik türü/kategori eşlemesi aşağıda), son 300 beğenisinin etiketleri, beğeni sayısı;
--    yaş puanı düşürür. Kendi içeriği ve zaten beğendikleri girmez. Kararın tamamı burada; arayüz yalnız nedeni gösterir.
--    Kapsam `feed_page` ile aynı (yayında + herkese açık + topluluğa ait değil); SECURITY INVOKER: RLS de geçerli.
--    Sıralama `p_as_of` ile oturum boyunca sabit, sayfalama (puan, created_at, id) keyset'i.
--    Neden önceliği: creator > tag > interest > liked_tag > popular. `reason_ref`: etiket slug'ı ya da ilgi alanı değeri.
-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.for_you_page(
  p_as_of timestamptz,
  p_kinds text[],
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_limit integer,
  p_after_rank bigint,
  p_after_created_at timestamptz,
  p_after_id uuid
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint, reason_kind text, reason_ref text)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_limit, 18), 1), 50) as lim,
           least(coalesce(p_as_of, now()), now()) as as_of,
           auth.uid() as me
  ),
  followed as (
    select f.following_id as author_id from public.follows f, params pr where f.follower_id = pr.me
  ),
  ftags as (
    select t.tag_slug from public.tag_follows t, params pr where t.user_id = pr.me
  ),
  my_likes as (
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id
      from public.prompt_likes l, params pr
     where l.user_id = pr.me
     order by l.created_at desc
     limit 300
  ),
  ltags as (
    select s.tag_slug, count(*) as n
      from (
        select tg.tag_slug from my_likes l join public.prompt_tags tg on tg.prompt_id = l.prompt_id
        union all select tg.tag_slug from my_likes l join public.prompt_request_tags tg on tg.request_id = l.request_id
        union all select tg.tag_slug from my_likes l join public.workflow_tags tg on tg.workflow_id = l.workflow_id
        union all select tg.tag_slug from my_likes l join public.preset_tags tg on tg.preset_id = l.preset_id
      ) s
     group by s.tag_slug
  ),
  -- Profil ilgi alanı (`INTEREST_OPTIONS`, src/features/profile/interest-options.ts) → içerik türü (+ kategori; null = türün tamamı).
  imap (interest, content_type, category) as (
    values
      ('Dijital Sanat', 'image', 'art_illustration'), ('Dijital Sanat', 'image', 'style'),
      ('Fotoğrafçılık', 'image', 'photography'),
      ('Grafik Tasarım', 'image', 'design'), ('Grafik Tasarım', 'image', 'product_commercial'),
      ('Yazılım ve Kodlama', 'text', 'coding'),
      ('Hikaye ve Yaratıcı Yazarlık', 'text', 'writing'), ('Hikaye ve Yaratıcı Yazarlık', 'video', 'story_entertainment'),
      ('Video Üretimi', 'video', null),
      ('Müzik ve Ses', 'audio', null), ('Müzik ve Ses', 'video', 'music_video'),
      ('3D Tasarım', 'video', 'animation'), ('3D Tasarım', 'image', 'style'),
      ('Oyun Geliştirme', 'image', 'human_character'), ('Oyun Geliştirme', 'video', 'animation')
  ),
  my_imap as (
    select m.interest, m.content_type, m.category
      from imap m
      join public.profiles p on m.interest = any (coalesce(p.interests, '{}'::text[]))
      join params pr on p.id = pr.me
  ),
  cand as (
    select 'prompt'::text as kind, x.id, x.created_at, x.like_count::bigint as likes,
           (x.author_id in (select author_id from followed)) as fa,
           (select min(tg.tag_slug) from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.prompt_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.prompt_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.prompt_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.prompt_id = x.id) as lt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im
      from public.prompts x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
       and (x.origin_type = 'original' or x.show_on_profile)
       and (p_kinds is null or 'prompt' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.prompt_id = x.id and l.user_id = pr.me)
    union all
    select 'request', x.id, x.created_at, x.like_count::bigint,
           (x.author_id in (select author_id from followed)),
           (select min(tg.tag_slug) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select count(*) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select tg.tag_slug from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id order by lt.n desc, tg.tag_slug limit 1),
           (select count(*) from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id),
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category))
      from public.prompt_requests x, params pr
     where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
       and (p_kinds is null or 'request' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.request_id = x.id and l.user_id = pr.me)
    union all
    select 'workflow', x.id, x.created_at, x.like_count::bigint,
           (x.creator_id in (select author_id from followed)),
           (select min(tg.tag_slug) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select count(*) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select tg.tag_slug from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id order by lt.n desc, tg.tag_slug limit 1),
           (select count(*) from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id),
           (select min(mi.interest) from my_imap mi where mi.content_type = any (x.content_types) and (mi.category is null or mi.category = x.category))
      from public.workflows x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null
       and (p_kinds is null or 'workflow' = any (p_kinds))
       and (p_content_type is null or p_content_type = any (x.content_types))
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.workflow_id = x.id and l.user_id = pr.me)
    union all
    select 'preset', x.id, x.created_at, x.like_count::bigint,
           (x.creator_id in (select author_id from followed)),
           (select min(tg.tag_slug) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select count(*) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select tg.tag_slug from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id order by lt.n desc, tg.tag_slug limit 1),
           (select count(*) from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id),
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category))
      from public.presets x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null
       and (p_kinds is null or 'preset' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.preset_id = x.id and l.user_id = pr.me)
  ),
  scored as (
    select c.*,
           (600 * c.fa::int
            + 250 * least(c.ft_n, 3)
            + 90 * least(c.lt_n, 3)
            + 220 * (c.im is not null)::int
            + 2 * least(c.likes, 300)
            -- yaş: her 6 saatte 1 puan, en çok 500
            - least(floor(extract(epoch from (pr.as_of - c.created_at)) / 21600), 500))::bigint as sort_rank
      from cand c, params pr
  )
  select s.kind, s.id, s.created_at, s.sort_rank,
         case when s.fa then 'creator' when s.ft_tag is not null then 'tag' when s.im is not null then 'interest'
              when s.lt_tag is not null then 'liked_tag' else 'popular' end,
         case when s.fa then null when s.ft_tag is not null then s.ft_tag when s.im is not null then s.im
              when s.lt_tag is not null then s.lt_tag else null end
    from scored s, params pr
   where pr.me is not null
     and (p_after_id is null or (s.sort_rank, s.created_at, s.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
   order by s.sort_rank desc, s.created_at desc, s.id desc
   limit (select lim from params);
$$;

revoke all on function public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid) from public, anon;
grant execute on function public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid) to authenticated;
