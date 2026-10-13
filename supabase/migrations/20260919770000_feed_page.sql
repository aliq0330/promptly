-- Ana sayfa akışı: tek, sunucu taraflı, keyset sayfalamalı sorgu.
--
-- Eskiden ana sayfa, istemcideki ~60'lık "son içerik" havuzunu süzüyordu; takip
-- edilen bir yazar o havuzda yoksa "Takip" boş kalıyordu ve "Popüler" yalnızca
-- aynı havuzun yeniden sıralanmasıydı. Bu fonksiyon prompt, istek, workflow ve
-- hazır ayarı TEK bir toplam sırada, gerçek keyset sayfalamayla döndürür:
--
--   p_scope  'all'       → tüm herkese açık içerik
--            'following' → yalnızca çağıranın (auth.uid()) `follows` kayıtlarındaki
--                          yazarların içeriği; oturum yoksa boş döner
--   p_order  'newest'    → created_at ↓, id ↓
--            'popular'   → like_count ↓, created_at ↓, id ↓
--
-- Sıralama anahtarı her iki durumda da (sort_rank, created_at, id) üçlüsüdür
-- (newest'te sort_rank sabit 0). Üçlü benzersizdir (id), bu yüzden kind'lar
-- arası eşitlikler de tutarlı sıralanır. Sonraki sayfa için istemci son satırın
-- (sort_rank, created_at, id) değerini p_after_* olarak geri yollar.
--
-- Yalnızca KİMLİK ve sıralama anahtarı döner; satırın tamamını istemci mevcut
-- select + mapper'larıyla id'ye göre çeker (RLS orada da geçerli). Fonksiyon
-- SECURITY INVOKER'dır: tablo RLS'i çağıranın rolüyle işler, yani yeni bir yetki
-- yüzeyi açmaz. Görünürlük koşulları (yayımlanmış + public, silinmemiş, taslak
-- olmayan) ayrıca açıkça yazılmıştır: RLS yazarın kendi private içeriğini de
-- görünür kılar, ama akış yalnızca herkese açık içeriği göstermelidir.
-- Engellenen kullanıcıların süzülmesi istemcide kalır (mevcut sayfalarla aynı).
--
-- Şimdilik her kolda `order by` ifadesi like_count'a bağlı olduğundan indeks
-- yerine süzülmüş kümeyi sıralar; küme "herkese açık yayımlanmış satırlar"dır ve
-- her koldan en fazla p_limit satır tutulur.

create or replace function public.feed_page(
  p_scope text default 'all',
  p_order text default 'newest',
  p_kinds text[] default null,
  p_content_type text default null,
  p_category text default null,
  p_subcategory text default null,
  p_limit integer default 24,
  p_after_rank bigint default null,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null
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
           (p_scope = 'following') as following
  ),
  followed as (
    select f.following_id as author_id
    from public.follows f
    where f.follower_id = auth.uid()
  ),
  prompt_part as (
    select 'prompt'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
              < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
    order by 4 desc, x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where not x.is_draft and x.visibility = 'public' and x.deleted_at is null
      and (p_kinds is null or 'request' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
              < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
    order by 4 desc, x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'workflow' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (p_content_type is null or p_content_type = any (x.content_types))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
              < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
    order by 4 desc, x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.presets x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'preset' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_after_id is null
           or ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
              < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
    order by 4 desc, x.created_at desc, x.id desc
    limit (select lim from params)
  )
  select u.kind, u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
  ) u
  order by u.sort_rank desc, u.created_at desc, u.id desc
  limit (select lim from params);
$$;

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid) to anon, authenticated;
