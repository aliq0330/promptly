-- Konu sayfaları (docs/history/211-*): etiket / kategori / araç sayfaları aynı kalıbı kullanır; araç takip edilebilir.
--
--   1) `tool_follows (user_id, tool_id)`: kullanıcı bir AI aracını (katalog kimliği, `src/lib/ai-tool-catalog.ts`) takip eder.
--      RLS yalnız sahibi okur/ekler/siler; kullanıcı başına en çok 100 (hata metni `tool_follow_limit`). `tag_follows` ile aynı kalıp.
--   2) `feed_page` YENİ 13 argümanlı biçim: `p_tag` (etiket slug'ı) ve `p_tool` (araç kimliği; "araç" ya da "araç:model"
--      başvurularının hepsi eşleşir) süzgeçleri, VARSAYILANSIZ — böylece 11 argümanlı çağrılarla aday çakışması olmaz.
--      11 argümanlı biçim aynı imzayla `create or replace` ile yenisini çağıran ince sarmalayıcı olur (davranışı aynı);
--      10 argümanlı sarmalayıcı ve grant'lar değişmez. Yeni biçim `community_id is null` da süzer (topluluk içeriği
--      zaten `private` olduğundan sonuç değişmez; CLAUDE.md liste kuralı).
--   3) `feed_count`: aynı süzgeçlerle dört türün toplam sayısı (kategori/araç sayfasının "N içerik" satırı). SECURITY INVOKER.
--   4) `for_you_page`: AYNI imzayla `create or replace`; takip edilen araç yeni bir sinyal (+200) ve neden `tool`
--      (öncelik: creator > tag > tool > interest > liked_tag > popular; `reason_ref` = araç kimliği).
--
-- Yalnızca ekleyici: yeni tablo + fonksiyonlar, `drop` yok.

create table if not exists public.tool_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tool_id text not null check (tool_id ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create index if not exists tool_follows_tool_id_idx on public.tool_follows (tool_id);

alter table public.tool_follows enable row level security;

create policy "Users can read their own tool follows"
  on public.tool_follows for select
  using (auth.uid() = user_id);

create policy "Users can follow tools for themselves"
  on public.tool_follows for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can unfollow their own tools"
  on public.tool_follows for delete
  using (auth.uid() = user_id);

create or replace function public.enforce_tool_follow_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.tool_follows where user_id = new.user_id) >= 100 then
    raise exception 'tool_follow_limit';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_tool_follow_limit() from public, anon, authenticated;

create trigger tool_follows_enforce_limit
  before insert on public.tool_follows
  for each row execute function public.enforce_tool_follow_limit();

-- ---------------------------------------------------------------------------------------------------------------------------
-- 2) feed_page: 13 argümanlı biçim + 11 argümanlı sarmalayıcı
-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.feed_page(
  p_scope text,
  p_order text,
  p_kinds text[],
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_limit integer,
  p_after_rank bigint,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_open_only boolean,
  p_tag text,
  p_tool text
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
           (p_order = 'used') as used,
           (p_scope = 'following') as following,
           (p_scope = 'tags') as tagged
  ),
  followed as (
    select f.following_id as author_id
    from public.follows f
    where f.follower_id = auth.uid()
  ),
  followed_tags as (
    select t.tag_slug
    from public.tag_follows t
    where t.user_id = auth.uid()
  ),
  prompt_part as (
    select 'prompt'::text as kind, x.id, x.created_at,
           (case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where not x.is_draft and x.visibility = 'public' and x.deleted_at is null
      and (p_kinds is null or 'request' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (not coalesce(p_open_only, false) or x.status = 'open')
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'workflow' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or p_content_type = any (x.content_types))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.presets x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'preset' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  )
  select u.kind, u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.oldest then u.created_at end asc, case when pr.oldest then u.id end asc,
           u.created_at desc, u.id desc
  limit (select lim from params);
$$;

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean, text, text) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean, text, text) to anon, authenticated;

create or replace function public.feed_page(
  p_scope text,
  p_order text,
  p_kinds text[],
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_limit integer,
  p_after_rank bigint,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_open_only boolean
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.feed_page(p_scope, p_order, p_kinds, p_content_type, p_category, p_subcategory, p_limit,
                                 p_after_rank, p_after_created_at, p_after_id, p_open_only, null::text, null::text);
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 3) feed_count: konu sayfasının sayısı — feed_page'in görünürlük + süzgeç koşullarının aynısı.
-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.feed_count(
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_tag text,
  p_tool text
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.prompts x
      where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
        and (x.origin_type = 'original' or x.show_on_profile)
        and (p_content_type is null or x.content_type = p_content_type)
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)))
  + (select count(*) from public.prompt_requests x
      where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null
        and (p_content_type is null or x.content_type = p_content_type)
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)))
  + (select count(*) from public.workflows x
      where x.status = 'published' and x.visibility = 'public' and x.community_id is null
        and (p_content_type is null or p_content_type = any (x.content_types))
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)))
  + (select count(*) from public.presets x
      where x.status = 'published' and x.visibility = 'public' and x.community_id is null
        and (p_content_type is null or x.content_type = p_content_type)
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)));
$$;

revoke all on function public.feed_count(text, text, text, text, text) from public;
grant execute on function public.feed_count(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 4) for_you_page: takip edilen araç sinyali (aynı imza)
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
    union all
    select 'request', x.id, x.created_at, x.like_count::bigint,
           (x.author_id in (select author_id from followed)),
           (select min(tg.tag_slug) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select count(*) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)),
           (select tg.tag_slug from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id order by lt.n desc, tg.tag_slug limit 1),
           (select count(*) from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id),
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)),
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id))
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
           (select min(mi.interest) from my_imap mi where mi.content_type = any (x.content_types) and (mi.category is null or mi.category = x.category)),
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id))
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
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)),
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id))
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
            + 200 * (c.ftool is not null)::int
            + 2 * least(c.likes, 300)
            -- yaş: her 6 saatte 1 puan, en çok 500
            - least(floor(extract(epoch from (pr.as_of - c.created_at)) / 21600), 500))::bigint as sort_rank
      from cand c, params pr
  )
  select s.kind, s.id, s.created_at, s.sort_rank,
         case when s.fa then 'creator' when s.ft_tag is not null then 'tag' when s.ftool is not null then 'tool' when s.im is not null then 'interest'
              when s.lt_tag is not null then 'liked_tag' else 'popular' end,
         case when s.fa then null when s.ft_tag is not null then s.ft_tag when s.ftool is not null then s.ftool when s.im is not null then s.im
              when s.lt_tag is not null then s.lt_tag else null end
    from scored s, params pr
   where pr.me is not null
     and (p_after_id is null or (s.sort_rank, s.created_at, s.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
   order by s.sort_rank desc, s.created_at desc, s.id desc
   limit (select lim from params);
$$;

revoke all on function public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid) from public, anon;
grant execute on function public.for_you_page(timestamptz, text[], text, text, text, integer, bigint, timestamptz, uuid) to authenticated;
