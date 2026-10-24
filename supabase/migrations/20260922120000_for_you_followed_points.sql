-- "Sana özel": takip ettiğin kişiler tekrar PUAN alır (docs/history/223-*; 222'deki "takip edilenler girmez" kararının yerini alır).
--
-- Yalnızca `create or replace` (AYNI imza ve dönüş sütunları); tablo/sütun/politika değişikliği yok, `drop` yok.
--
-- Değişen tek şey: takip edilen kişilerin gönderileri artık akıştan ÇIKARILMAZ ve +300 puan alır (en güçlü açık sinyal: etiket 200, araç 150).
-- Takip Ettiklerim kronolojik ve eksiksiz kalır; Sana özel aynı gönderileri sinyal + kalite + tazelikle sıralar. Geri kalan kurallar 222 ile aynı:
--   • Zaten ilgilendiklerin girmez: beğendiğin, koleksiyonuna kaydettiğin, son 60 günde kopyaladığın, kendi içeriğin.
--   • Puan = takip edilen kişi 300 · takip edilen etiket 200 × (en çok 3) · takip edilen AI aracı 150 · ilgi alanı 150 · beğenilen etiket 50 × (en çok 3)
--             + kalite (en çok 200) + tazelik (300 × exp(−yaş_saat / 72)); aynı yazarın 2., 3. … gönderisi −120, −240 …
--   • Neden = en ağır TEK sinyal: kişi > etiket > araç > ilgi alanı > beğenilen etiket; sinyal yoksa 'popular'. `creator` nedeni geri geldi (ref = null).
--   • Sayfalama aynı: (sort_rank, created_at, id) keyset, `p_as_of` ile oturum boyunca sabit.

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
  -- Takip ettiğin kişiler: gönderileri +300 puan alır (Takip Ettiklerim'de ayrıca kronolojik görünürler).
  followed as (
    select f.following_id as author_id from public.follows f, params pr where f.follower_id = pr.me
  ),
  ftags as (
    select t.tag_slug from public.tag_follows t, params pr where t.user_id = pr.me
  ),
  ftools as (
    select t.tool_id from public.tool_follows t, params pr where t.user_id = pr.me
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
  -- Zaten ilgilendiklerin: koleksiyonlarına kaydettiklerin ve son 60 günde kopyaladıkların tekrar önüne çıkmaz.
  saved as (
    select ci.prompt_id, ci.workflow_id, ci.preset_id
      from public.collection_items ci
      join public.collections c on c.id = ci.collection_id, params pr
     where c.owner_id = pr.me
  ),
  copied as (
    select e.prompt_id from public.prompt_copy_events e, params pr where e.user_id = pr.me and e.created_at > pr.as_of - interval '60 days'
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
    select 'prompt'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.prompt_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.prompt_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.prompt_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.prompt_id = x.id) as lt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
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
       and not exists (select 1 from saved s where s.prompt_id = x.id)
       and not exists (select 1 from copied c where c.prompt_id = x.id)
    union all
    select 'request'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.comment_count * 2 + x.response_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id) as lt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
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
    select 'workflow'::text as kind, x.id, x.created_at, x.creator_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id) as lt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = any (x.content_types) and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.workflows x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null
       and (p_kinds is null or 'workflow' = any (p_kinds))
       and (p_content_type is null or p_content_type = any (x.content_types))
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.workflow_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from saved s where s.workflow_id = x.id)
    union all
    select 'preset'::text as kind, x.id, x.created_at, x.creator_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id) as lt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.presets x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null
       and (p_kinds is null or 'preset' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.preset_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from saved s where s.preset_id = x.id)
  ),
  raw as (
    select c.*,
           (300 * (c.author_id in (select author_id from followed))::int
            + 200 * least(c.ft_n, 3)
            + 150 * (c.ftool is not null)::int
            + 150 * (c.im is not null)::int
            + 50 * least(c.lt_n, 3)
            + least(round(40 * ln(1 + c.eng)), 200)
            + round(300 * exp(- (extract(epoch from (pr.as_of - c.created_at)) / 3600.0) / 72.0)))::bigint as raw_rank
      from cand c, params pr
  ),
  -- Çeşitlilik: aynı yazarın puana göre 2., 3. … gönderisi −120, −240 … (akış tek kişiyle dolmasın).
  scored as (
    select r.*,
           r.raw_rank - 120 * (row_number() over (partition by r.author_id order by r.raw_rank desc, r.created_at desc, r.id desc) - 1) as sort_rank
      from raw r
  )
  select s.kind, s.id, s.created_at, s.sort_rank::bigint,
         case when s.author_id in (select author_id from followed) then 'creator' when s.ft_tag is not null then 'tag' when s.ftool is not null then 'tool' when s.im is not null then 'interest'
              when s.lt_tag is not null then 'liked_tag' else 'popular' end,
         case when s.author_id in (select author_id from followed) then null when s.ft_tag is not null then s.ft_tag when s.ftool is not null then s.ftool when s.im is not null then s.im
              when s.lt_tag is not null then s.lt_tag else null end
    from scored s, params pr
   where pr.me is not null
     and (p_after_id is null or (s.sort_rank, s.created_at, s.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
   order by s.sort_rank desc, s.created_at desc, s.id desc
   limit (select lim from params);
$$;

revoke all on function public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid) from public, anon;
grant execute on function public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid) to authenticated;
