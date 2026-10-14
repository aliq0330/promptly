-- Etiket takibi: kullanıcı bir etiketi takip eder, ana sayfada "Etiketlerim" sekmesi
-- (`feed_page` kapsamı 'tags') takip ettiği etiketlerden herhangi biriyle etiketli
-- herkese açık içeriği (prompt, istek, workflow, hazır ayar) gösterir.
--
--   * `tag_follows (user_id, tag_slug)`: RLS yalnızca sahibi okur/ekler/siler; kullanıcı
--     başına en fazla 100 etiket (trigger, hata metni `tag_follow_limit`).
--   * `feed_page`: AYNI 11 argümanlı imzayla `create or replace` (drop yok, 10 argümanlı
--     sarmalayıcı ve grant'lar değişmez). Yeni kapsam 'tags'; oturum yoksa `auth.uid()`
--     null olduğundan boş döner. 'all' / 'following' / 'newest' / 'popular' / 'oldest' /
--     `p_open_only` davranışı ve görünürlük koşulları aynen korunur.

create table if not exists public.tag_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_slug)
);

create index if not exists tag_follows_tag_slug_idx on public.tag_follows (tag_slug);

alter table public.tag_follows enable row level security;

create policy "Users can read their own tag follows"
  on public.tag_follows for select
  using (auth.uid() = user_id);

create policy "Users can follow tags for themselves"
  on public.tag_follows for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can unfollow their own tags"
  on public.tag_follows for delete
  using (auth.uid() = user_id);

create or replace function public.enforce_tag_follow_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.tag_follows where user_id = new.user_id) >= 100 then
    raise exception 'tag_follow_limit';
  end if;
  return new;
end;
$$;

create trigger tag_follows_enforce_limit
  before insert on public.tag_follows
  for each row execute function public.enforce_tag_follow_limit();

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
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
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
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
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

revoke all on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean) from public;
grant execute on function public.feed_page(text, text, text[], text, text, text, integer, bigint, timestamptz, uuid, boolean) to anon, authenticated;
