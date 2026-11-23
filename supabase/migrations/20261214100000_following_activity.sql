-- Takip Ettiklerin: etkinlik akışı (docs/history/451-*). YALNIZ EKLEYİCİ (expand): yeni tablolar + yeni fonksiyonlar; `feed_page` ve mevcut
-- tablolar DEĞİŞMEZ.
--
-- 1) `follow_feed_settings`  — kişinin akış tercihleri (toplama, etiketten/araçtan gelenler, sürüm, Space etkinliği, sonuç) + son ziyaret zamanı.
-- 2) `follow_feed_modes`     — takip edilen kişi başına akış modu: 'highlights' (yalnız öne çıkanlar) | 'muted' (akışta sessiz; takip sürer).
-- 3) `following_activity_page` — tek zaman sıralı akış: takip edilen kişilerin paylaşımları (`feed_page` aynen: görünürlük kuralları orada),
--    takip edilen etiket/araçlardan gelen paylaşımlar, yeni sürümler, üyesi olunan/sabitlenen Space'lerdeki etkinlik ve sonuç paylaşımları.
--    Aynı kişinin 3 saat içindeki 3+ paylaşımı SUNUCUDA tek satıra toplanır (istemcide toplamak sayfa sınırında grubu böler; 326'daki ders).
-- 4) Özet / kişi listesi / tercih RPC'leri.
--
-- Okumalar SECURITY INVOKER: RLS (engel, gizlilik, Space okuma, sürüm okuma) atlanmaz. Yazmalar SECURITY DEFINER, kimlik `auth.uid()`.

-- ---------------------------------------------------------------------------------------------------------------------------
-- 1) Tercihler
-- ---------------------------------------------------------------------------------------------------------------------------
create table if not exists public.follow_feed_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  group_posts boolean not null default true,
  include_tags boolean not null default true,
  include_tools boolean not null default false,
  show_versions boolean not null default true,
  show_space_activity boolean not null default true,
  show_results boolean not null default false,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.follow_feed_settings enable row level security;
revoke all on public.follow_feed_settings from public, anon, authenticated;
grant select on public.follow_feed_settings to authenticated;
drop policy if exists "follow_feed_settings_own" on public.follow_feed_settings;
create policy "follow_feed_settings_own" on public.follow_feed_settings
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.follow_feed_modes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('highlights', 'muted')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_id),
  check (user_id <> target_id)
);
alter table public.follow_feed_modes enable row level security;
revoke all on public.follow_feed_modes from public, anon, authenticated;
grant select on public.follow_feed_modes to authenticated;
drop policy if exists "follow_feed_modes_own" on public.follow_feed_modes;
create policy "follow_feed_modes_own" on public.follow_feed_modes
  for select to authenticated using (user_id = (select auth.uid()));

-- Kişinin tercihleri (satır yoksa varsayılanlar).
create or replace function public.follow_feed_settings_get()
returns table(group_posts boolean, include_tags boolean, include_tools boolean, show_versions boolean,
              show_space_activity boolean, show_results boolean, last_seen_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select coalesce(s.group_posts, true), coalesce(s.include_tags, true), coalesce(s.include_tools, false),
         coalesce(s.show_versions, true), coalesce(s.show_space_activity, true), coalesce(s.show_results, false), s.last_seen_at
  from (select (select auth.uid()) as uid) me
  left join public.follow_feed_settings s on s.user_id = me.uid
  where me.uid is not null
$$;

-- Tercihleri yazar; null verilen alan değişmez.
create or replace function public.follow_feed_settings_set(
  p_group_posts boolean default null, p_include_tags boolean default null, p_include_tools boolean default null,
  p_show_versions boolean default null, p_show_space_activity boolean default null, p_show_results boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.follow_feed_settings as s (user_id, group_posts, include_tags, include_tools, show_versions, show_space_activity, show_results)
  values (uid, coalesce(p_group_posts, true), coalesce(p_include_tags, true), coalesce(p_include_tools, false),
          coalesce(p_show_versions, true), coalesce(p_show_space_activity, true), coalesce(p_show_results, false))
  on conflict (user_id) do update set
    group_posts = coalesce(p_group_posts, s.group_posts),
    include_tags = coalesce(p_include_tags, s.include_tags),
    include_tools = coalesce(p_include_tools, s.include_tools),
    show_versions = coalesce(p_show_versions, s.show_versions),
    show_space_activity = coalesce(p_show_space_activity, s.show_space_activity),
    show_results = coalesce(p_show_results, s.show_results),
    updated_at = now();
end $$;

-- Ziyaret: ÖNCEKİ son ziyaret zamanını döner ve şimdiyi yazar ("Son ziyaretinden beri" çizgisi önceki değere çizilir).
-- `p_peek = true` yalnız okur (sekme açık kalırken tekrar sormak işaretçiyi kaydırmasın).
create or replace function public.follow_feed_visit(p_peek boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); prev timestamptz;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select s.last_seen_at into prev from public.follow_feed_settings s where s.user_id = uid;
  if not coalesce(p_peek, false) then
    insert into public.follow_feed_settings as s (user_id, last_seen_at) values (uid, now())
    on conflict (user_id) do update set last_seen_at = now(), updated_at = now();
  end if;
  return prev;
end $$;

-- Takip edilen bir kişinin akış modu. `p_mode = null` varsayılana döner (her şey).
create or replace function public.set_follow_feed_mode(p_target uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_target is null or p_target = uid then raise exception 'invalid_target' using errcode = '22023'; end if;
  if p_mode is null then
    delete from public.follow_feed_modes where user_id = uid and target_id = p_target;
    return;
  end if;
  if p_mode not in ('highlights', 'muted') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if not exists (select 1 from public.follows f where f.follower_id = uid and f.following_id = p_target) then
    raise exception 'not_following' using errcode = '22023';
  end if;
  insert into public.follow_feed_modes (user_id, target_id, mode) values (uid, p_target, p_mode)
  on conflict (user_id, target_id) do update set mode = excluded.mode, created_at = now();
end $$;

-- Takip bırakılınca mod satırı da gider (yeniden takip edince varsayılanla başlar).
create or replace function public._follow_feed_modes_on_unfollow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.follow_feed_modes where user_id = old.follower_id and target_id = old.following_id;
  return old;
end $$;
drop trigger if exists follows_clear_feed_mode on public.follows;
create trigger follows_clear_feed_mode after delete on public.follows
  for each row execute function public._follow_feed_modes_on_unfollow();

-- ---------------------------------------------------------------------------------------------------------------------------
-- 2) Bir paylaşımın yazarı ve "öne çıkan" olup olmadığı (akış içindeki kararların tek yeri)
-- ---------------------------------------------------------------------------------------------------------------------------
-- Öne çıkan: en az 10 "Çalıştı mı?" oyu ve %80 üstü evet, ya da en az 25 beğeni (her tür için).
create or replace function public._feed_item_actor(p_kind text, p_id uuid)
returns table(actor_id uuid, like_count integer, highlight boolean)
language sql stable security invoker set search_path = public as $$
  select x.actor, coalesce(x.likes, 0),
         (coalesce(x.likes, 0) >= 25
          or (p_kind = 'prompt' and exists (
                select 1 from public.prompt_works_stats w
                where w.prompt_id = p_id and w.yes_count + w.no_count >= 10
                  and w.yes_count::numeric / nullif(w.yes_count + w.no_count, 0) >= 0.8)))
  from (
    select case p_kind
             when 'prompt' then (select author_id from public.prompts where id = p_id)
             when 'request' then (select author_id from public.prompt_requests where id = p_id)
             when 'workflow' then (select creator_id from public.workflows where id = p_id)
             when 'preset' then (select creator_id from public.presets where id = p_id)
             when 'skill' then (select author_id from public.skills where id = p_id)
             when 'quote' then (select author_id from public.content_quotes where id = p_id)
             when 'space' then (select owner_id from public.spaces where id = p_id)
           end as actor,
           case p_kind
             when 'prompt' then (select like_count from public.prompts where id = p_id)
             when 'request' then (select like_count from public.prompt_requests where id = p_id)
             when 'workflow' then (select like_count from public.workflows where id = p_id)
             when 'preset' then (select like_count from public.presets where id = p_id)
             when 'skill' then (select like_count from public.skills where id = p_id)
             when 'quote' then (select like_count from public.content_quotes where id = p_id)
             else 0
           end as likes
  ) x
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 3) Akış
-- ---------------------------------------------------------------------------------------------------------------------------
-- Satır: event_key (sıra eşitliğini bozar, sayfalar arası tekil), event_kind ('post' | 'group' | 'version' | 'space_activity' | 'result'),
-- source ('people' | 'tag' | 'tool' | 'space'), actor_id, occurred_at (sıra zamanı), item_kind + item_id (hidrasyon için),
-- member_ids (toplu paylaşımda üyeler: önce `<kind>:<uuid>` metni), detail (türe göre ek bilgi).
-- Sayfalama: (occurred_at, event_key) < (p_before_at, p_before_key). Toplu satırın üyeleri sonraki sayfada tek tek gelebilir;
-- istemci gördüğü üyeleri düşürür (aynı paylaşım iki kez çizilmez).
create or replace function public.following_activity_page(
  p_limit integer default 20,
  p_before_at timestamptz default null,
  p_before_key text default null,
  p_source text default 'all',
  p_kinds text[] default null,
  p_authors uuid[] default null,
  p_tags text[] default null,
  p_tools text[] default null,
  -- Ana Sayfa'nın ortak "İçerik türü" süzgeci (görsel/metin/ses/video; docs/history/245-*): paylaşımlarda feed_page'e gider, sürüm ve
  -- sonuçta promptun türüne bakılır, Space etkinliği bu süzgeçte çıkmaz.
  p_content_type text default null
)
returns table(event_key text, event_kind text, source text, actor_id uuid, occurred_at timestamptz,
              item_kind text, item_id uuid, member_ids text[], detail jsonb)
language sql stable security invoker set search_path = public as $$
  with me as (select (select auth.uid()) as uid),
  st as (
    select s.group_posts, s.include_tags, s.include_tools, s.show_versions, s.show_space_activity, s.show_results
    from public.follow_feed_settings_get() s
  ),
  lim as (select least(greatest(coalesce(p_limit, 20), 1), 50) as n),
  src as (select coalesce(nullif(p_source, ''), 'all') as v),
  cur as (select coalesce(p_before_at, 'infinity'::timestamptz) as at, coalesce(p_before_key, '~') as k),
  followed as (select f.following_id as id from public.follows f, me where f.follower_id = me.uid),
  modes as (select m.target_id, m.mode from public.follow_feed_modes m, me where m.user_id = me.uid),
  my_tools as (select t.tool_id from public.tool_follows t, me where t.user_id = me.uid),
  -- Kişilerin paylaşımları: feed_page (kapsam following, en yeni). Aday penceresi sayfanın 2,5 katı (toplama için), en çok 50.
  people_raw as (
    select f.kind, f.id, f.created_at
    from public.feed_page('following', 'newest', p_kinds, p_content_type, null, null,
                          least((select n from lim) * 5 / 2, 50), 0::bigint,
                          p_before_at, case when p_before_at is null then null else 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid end,
                          false, null, null, p_authors, p_tags, p_tools, false) f, src
    where src.v in ('all', 'people') and f.kind <> 'space'
  ),
  tag_raw as (
    select f.kind, f.id, f.created_at
    from public.feed_page('tags', 'newest', p_kinds, p_content_type, null, null, (select n from lim), 0::bigint,
                          p_before_at, case when p_before_at is null then null else 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid end,
                          false, null, null, p_authors, p_tags, p_tools, false) f, src, st
    where (src.v = 'tags' or (src.v = 'all' and st.include_tags)) and f.kind not in ('space', 'quote')
  ),
  tool_raw as (
    select f.kind, f.id, f.created_at
    from public.feed_page('all', 'newest', p_kinds, p_content_type, null, null, (select n from lim), 0::bigint,
                          p_before_at, case when p_before_at is null then null else 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid end,
                          false, null, null, p_authors, p_tags,
                          coalesce(p_tools, (select array_agg(tool_id) from my_tools)), false) f, src, st
    where (src.v = 'tools' or (src.v = 'all' and st.include_tools)) and exists (select 1 from my_tools)
      and f.kind not in ('space', 'quote')
  ),
  posts as (
    select r.kind, r.id, r.created_at, a.actor_id, a.highlight, 'people'::text as source
    from people_raw r cross join lateral public._feed_item_actor(r.kind, r.id) a
    union all
    select r.kind, r.id, r.created_at, a.actor_id, a.highlight, 'tag'
    from tag_raw r cross join lateral public._feed_item_actor(r.kind, r.id) a, src
    where src.v = 'tags' or a.actor_id not in (select id from followed)
    union all
    select r.kind, r.id, r.created_at, a.actor_id, a.highlight, 'tool'
    from tool_raw r cross join lateral public._feed_item_actor(r.kind, r.id) a, src
    where src.v = 'tools' or a.actor_id not in (select id from followed)
  ),
  posts_dedup as (
    select distinct on (p.kind, p.id) p.*
    from posts p, me
    where p.actor_id is distinct from me.uid
      and p.actor_id not in (select target_id from modes where mode = 'muted')
      and (p.highlight or p.actor_id not in (select target_id from modes where mode = 'highlights'))
    order by p.kind, p.id, case p.source when 'people' then 0 when 'tag' then 1 else 2 end
  ),
  -- Toplama: aynı kişi, ardışık paylaşımlar arası en çok 3 saat; alıntı toplanmaz; yalnız kişilerin paylaşımları.
  sessions as (
    select p.*,
           sum(case when prev_at is null or prev_at > p.created_at + interval '3 hours' then 1 else 0 end)
             over (partition by p.actor_id order by p.created_at desc, p.id desc) as session_no
    from (
      select d.*, lag(d.created_at) over (partition by d.actor_id order by d.created_at desc, d.id desc) as prev_at
      from posts_dedup d, st
      where d.source = 'people' and d.kind <> 'quote' and st.group_posts
    ) p
  ),
  groups as (
    select s.actor_id, s.session_no, count(*) as cnt, max(s.created_at) as last_at, min(s.created_at) as first_at,
           array_agg(s.kind || ':' || s.id::text order by s.created_at desc, s.id desc) as members
    from sessions s
    group by s.actor_id, s.session_no
    having count(*) >= 3
  ),
  grouped_ids as (
    select s.kind, s.id from sessions s join groups g on g.actor_id = s.actor_id and g.session_no = s.session_no
  ),
  post_events as (
    select ('p:' || d.kind || ':' || d.id::text) as event_key, 'post'::text as event_kind, d.source, d.actor_id,
           d.created_at as occurred_at, d.kind as item_kind, d.id as item_id, null::text[] as member_ids,
           case when d.source = 'tag' then jsonb_build_object('tags', (
                  select coalesce(jsonb_agg(distinct t.tag_slug), '[]'::jsonb)
                  from public.tag_follows t, me
                  where t.user_id = me.uid and t.tag_slug in (
                    select pt.tag_slug from public.prompt_tags pt where d.kind = 'prompt' and pt.prompt_id = d.id
                    union all select rt.tag_slug from public.prompt_request_tags rt where d.kind = 'request' and rt.request_id = d.id
                    union all select wt.tag_slug from public.workflow_tags wt where d.kind = 'workflow' and wt.workflow_id = d.id
                    union all select xt.tag_slug from public.preset_tags xt where d.kind = 'preset' and xt.preset_id = d.id)))
                when d.source = 'tool' then jsonb_build_object('tools', (select coalesce(jsonb_agg(tool_id), '[]'::jsonb) from my_tools))
                else '{}'::jsonb end as detail
    from posts_dedup d
    where not exists (select 1 from grouped_ids g where g.kind = d.kind and g.id = d.id)
  ),
  group_events as (
    select ('g:' || g.actor_id::text || ':' || extract(epoch from g.last_at)::bigint::text) as event_key, 'group'::text, 'people'::text,
           g.actor_id, g.last_at, 'group'::text, null::uuid, g.members,
           jsonb_build_object('count', g.cnt, 'first_at', g.first_at)
    from groups g
  ),
  -- Yeni sürümler: takip edilen kişinin herkese açık içeriği; ilk sürüm değil; aynı içerik için 24 saatte yalnız son sürüm.
  version_events as (
    select ve.* from (
      select ('v:prompt:' || v.prompt_id::text || ':' || v.version_number) as event_key, 'version'::text as event_kind, 'people'::text as source,
             x.author_id as actor_id, v.created_at as occurred_at, 'prompt'::text as item_kind, v.prompt_id as item_id, null::text[] as member_ids,
             jsonb_build_object('version', v.version_number, 'version_id', v.id, 'via', v.source) as detail
      from public.prompt_versions v join public.prompts x on x.id = v.prompt_id
      where v.version_number > 1 and x.author_id in (select id from followed)
        and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
        and v.created_at > now() - interval '60 days'
        and not exists (select 1 from public.prompt_versions n where n.prompt_id = v.prompt_id and n.version_number > v.version_number
                          and n.created_at <= v.created_at + interval '24 hours')
      union all
      select 'v:workflow:' || v.workflow_id::text || ':' || v.version_number, 'version', 'people', x.creator_id, v.created_at, 'workflow', v.workflow_id, null,
             jsonb_build_object('version', v.version_number, 'version_id', v.id)
      from public.workflow_versions v join public.workflows x on x.id = v.workflow_id
      where v.version_number > 1 and v.source = 'owner_edit' and x.creator_id in (select id from followed)
        and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and v.created_at > now() - interval '60 days'
        and not exists (select 1 from public.workflow_versions n where n.workflow_id = v.workflow_id and n.version_number > v.version_number
                          and n.created_at <= v.created_at + interval '24 hours')
      union all
      select 'v:preset:' || v.preset_id::text || ':' || v.version_number, 'version', 'people', x.creator_id, v.created_at, 'preset', v.preset_id, null,
             jsonb_build_object('version', v.version_number, 'version_id', v.id)
      from public.preset_versions v join public.presets x on x.id = v.preset_id
      where v.version_number > 1 and v.source = 'owner_edit' and x.creator_id in (select id from followed)
        and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and v.created_at > now() - interval '60 days'
        and not exists (select 1 from public.preset_versions n where n.preset_id = v.preset_id and n.version_number > v.version_number
                          and n.created_at <= v.created_at + interval '24 hours')
      union all
      select 'v:skill:' || v.skill_id::text || ':' || v.version, 'version', 'people', x.author_id, v.created_at, 'skill', v.skill_id, null,
             jsonb_build_object('version', v.version, 'version_id', v.id, 'summary', nullif(v.changelog, ''))
      from public.skill_versions v join public.skills x on x.id = v.skill_id
      where x.author_id in (select id from followed) and x.status = 'published' and x.visibility = 'public' and v.deprecated_at is null
        and v.created_at > now() - interval '60 days'
        and exists (select 1 from public.skill_versions o where o.skill_id = v.skill_id and o.created_at < v.created_at)
    ) ve, st, src
    where st.show_versions and src.v in ('all', 'people')
      and (p_kinds is null or ve.item_kind = any (p_kinds))
      and (p_content_type is null or (ve.item_kind = 'prompt'
           and exists (select 1 from public.prompts cp where cp.id = ve.item_id and cp.content_type = p_content_type)))
      and (p_authors is null or cardinality(p_authors) = 0 or ve.actor_id = any (p_authors))
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and ve.actor_id not in (select target_id from modes where mode = 'muted')
      and (ve.occurred_at, ve.event_key) < ((select at from cur), (select k from cur))
    order by ve.occurred_at desc, ve.event_key desc
    limit (select n from lim)
  ),
  -- Space etkinliği: üyesi olunan ya da sabitlenen Space'ler (Space takip edilmez); ekip alanı değil; kişi + Space + saat başına tek satır.
  my_spaces as (
    select sm.space_id from public.space_members sm, me where sm.user_id = me.uid
    union
    select us.space_id from public.space_user_state us, me where us.user_id = me.uid and us.favorite
  ),
  space_events as (
    select se.* from (
      select ('s:' || a.space_id::text || ':' || a.actor_id::text || ':' || extract(epoch from date_trunc('hour', a.created_at))::bigint::text) as event_key,
             'space_activity'::text as event_kind, 'space'::text as source, a.actor_id, max(a.created_at) as occurred_at,
             'space'::text as item_kind, a.space_id as item_id, null::text[] as member_ids,
             jsonb_build_object('title', max(sp.title), 'count', sum(a.count), 'actions', jsonb_agg(distinct a.action),
                                'from', min(a.created_at), 'to', max(a.created_at),
                                'note', (array_agg(a.author_note order by a.created_at desc) filter (where a.author_note is not null))[1]) as detail
      from public.space_activity a join public.spaces sp on sp.id = a.space_id, me
      where a.space_id in (select space_id from my_spaces) and sp.team_id is null and sp.archived_at is null
        and a.actor_id is not null and a.actor_id <> me.uid
        and a.action in ('image_added', 'prompt_added', 'note_added', 'content_added', 'palette_created', 'palette_updated')
        and a.created_at > now() - interval '60 days'
      group by a.space_id, a.actor_id, date_trunc('hour', a.created_at)
    ) se, st, src
    where (src.v = 'spaces' or (src.v = 'all' and st.show_space_activity))
      and p_content_type is null
      and (p_kinds is null or 'space' = any (p_kinds))
      and (p_authors is null or cardinality(p_authors) = 0 or se.actor_id = any (p_authors))
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and se.actor_id not in (select target_id from modes where mode = 'muted')
      and (se.occurred_at, se.event_key) < ((select at from cur), (select k from cur))
    order by se.occurred_at desc, se.event_key desc
    limit (select n from lim)
  ),
  -- Sonuç paylaşımları: takip edilen kişinin, herkese açık bir prompta paylaştığı sonuç (yetim sonuç değil).
  result_events as (
    select ('r:' || r.id::text) as event_key, 'result'::text, 'people'::text, r.creator_id, r.created_at, 'result'::text, r.id, null::text[],
           jsonb_build_object('prompt_id', r.prompt_id, 'prompt_author', x.author_id) as detail
    from public.prompt_results r join public.prompts x on x.id = r.prompt_id, st, src
    where st.show_results and src.v in ('all', 'people')
      and r.creator_id in (select id from followed) and r.creator_id not in (select target_id from modes where mode in ('muted', 'highlights'))
      and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_authors is null or cardinality(p_authors) = 0 or r.creator_id = any (p_authors))
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and (r.created_at, 'r:' || r.id::text) < ((select at from cur), (select k from cur))
    order by r.created_at desc, r.id desc
    limit (select n from lim)
  ),
  all_events as (
    select * from post_events
    union all select * from group_events
    union all select * from version_events
    union all select * from space_events
    union all select * from result_events
  )
  select e.event_key, e.event_kind, e.source, e.actor_id, e.occurred_at, e.item_kind, e.item_id, e.member_ids, e.detail
  from all_events e, me
  where me.uid is not null
    and (e.occurred_at, e.event_key) < ((select at from cur), (select k from cur))
  order by e.occurred_at desc, e.event_key desc
  limit (select n from lim)
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 4) Özet: bir andan beri kaç şey (türe göre) ve kimden; takip sayıları. Sayılar yaklaşık değil, aynı görünürlük kurallarıyla sayılır
-- (paylaşımlar `feed_page`'in süzgeciyle aynı koşullar; okuma RLS'ten geçer). En çok 30 gün geriye bakılır.
-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function public.following_activity_summary(p_since timestamptz default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with me as (select (select auth.uid()) as uid),
  since as (select greatest(coalesce(p_since, now() - interval '7 days'), now() - interval '30 days') as at),
  followed as (select f.following_id as id from public.follows f, me where f.follower_id = me.uid),
  muted as (select m.target_id from public.follow_feed_modes m, me where m.user_id = me.uid and m.mode = 'muted'),
  st as (select * from public.follow_feed_settings_get()),
  post_rows as (
    select x.author_id as actor from public.prompts x, since
    where x.created_at > since.at and x.author_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
      and x.deleted_at is null and x.community_id is null and x.team_file_id is null and (x.origin_type = 'original' or x.show_on_profile)
    union all
    select x.author_id from public.prompt_requests x, since
    where x.created_at > since.at and x.author_id in (select id from followed) and not x.is_draft and x.visibility = 'public'
      and x.deleted_at is null and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id from public.workflows x, since
    where x.created_at > since.at and x.creator_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
      and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id from public.presets x, since
    where x.created_at > since.at and x.creator_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
      and x.community_id is null and x.team_file_id is null
    union all
    select x.author_id from public.skills x, since
    where x.created_at > since.at and x.author_id in (select id from followed) and x.status = 'published' and x.visibility = 'public'
    union all
    select x.author_id from public.content_quotes x, since
    where x.created_at > since.at and x.author_id in (select id from followed)
  ),
  posts as (select actor from post_rows where actor not in (select target_id from muted)),
  versions as (
    select x.author_id as actor from public.prompt_versions v join public.prompts x on x.id = v.prompt_id, since
    where v.created_at > since.at and v.version_number > 1 and x.author_id in (select id from followed)
      and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id from public.workflow_versions v join public.workflows x on x.id = v.workflow_id, since
    where v.created_at > since.at and v.version_number > 1 and v.source = 'owner_edit' and x.creator_id in (select id from followed)
      and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
  ),
  my_spaces as (
    select sm.space_id from public.space_members sm, me where sm.user_id = me.uid
    union select us.space_id from public.space_user_state us, me where us.user_id = me.uid and us.favorite
  ),
  spaces as (
    select distinct a.space_id, a.actor_id, date_trunc('hour', a.created_at) as h
    from public.space_activity a join public.spaces sp on sp.id = a.space_id, since, me
    where a.created_at > since.at and a.space_id in (select space_id from my_spaces) and sp.team_id is null
      and a.actor_id is not null and a.actor_id <> me.uid
      and a.action in ('image_added', 'prompt_added', 'note_added', 'content_added', 'palette_created', 'palette_updated')
  ),
  tagged as (
    select count(*) as n from public.prompts x, since, me
    where x.created_at > since.at and x.author_id not in (select id from followed) and x.author_id <> me.uid
      and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and exists (select 1 from public.prompt_tags pt join public.tag_follows tf on tf.tag_slug = pt.tag_slug and tf.user_id = me.uid where pt.prompt_id = x.id)
  ),
  actors as (
    select p.actor, count(*) as n from posts p group by p.actor order by count(*) desc, p.actor limit 12
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'since', (select at from since),
    'posts', (select count(*) from posts),
    'versions', case when (select show_versions from st) then (select count(*) from versions where actor not in (select target_id from muted)) else 0 end,
    'spaces', case when (select show_space_activity from st) then (select count(*) from spaces) else 0 end,
    'tags', case when (select include_tags from st) then (select n from tagged) else 0 end,
    'active_people', (select count(distinct actor) from posts),
    'actors', coalesce((select jsonb_agg(jsonb_build_object('id', actor, 'count', n) order by n desc, actor) from actors), '[]'::jsonb),
    'following', (select count(*) from followed),
    'tags_followed', (select count(*) from public.tag_follows t, me where t.user_id = me.uid),
    'tools_followed', (select count(*) from public.tool_follows t, me where t.user_id = me.uid),
    'spaces_followed', (select count(*) from my_spaces)
  ) end
$$;

-- Takip edilen kişiler, yönetim penceresi için: son paylaşım, son 7 gün sayısı, akış modu. Son paylaşana göre (hiç paylaşmayan sonda), sayfalı.
create or replace function public.following_people_overview(p_query text default null, p_limit integer default 30, p_offset integer default 0)
returns table(id uuid, username text, display_name text, avatar_url text, last_post_at timestamptz, week_count integer, mode text)
language sql stable security invoker set search_path = public as $$
  with me as (select (select auth.uid()) as uid),
  people as (
    select p.id, p.username, p.display_name, p.avatar_url
    from public.follows f join public.profiles p on p.id = f.following_id, me
    where f.follower_id = me.uid
      and (p_query is null or p_query = '' or p.username ilike '%' || p_query || '%' or p.display_name ilike '%' || p_query || '%')
  ),
  posts as (
    select x.author_id as actor, x.created_at from public.prompts x
    where x.author_id in (select id from people) and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and x.community_id is null and x.team_file_id is null
    union all
    select x.author_id, x.created_at from public.prompt_requests x
    where x.author_id in (select id from people) and not x.is_draft and x.visibility = 'public' and x.deleted_at is null
      and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id, x.created_at from public.workflows x
    where x.creator_id in (select id from people) and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
    union all
    select x.creator_id, x.created_at from public.presets x
    where x.creator_id in (select id from people) and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
  ),
  stats as (
    select actor, max(created_at) as last_at, count(*) filter (where created_at > now() - interval '7 days')::integer as week
    from posts group by actor
  )
  select pe.id, pe.username, pe.display_name, pe.avatar_url, s.last_at, coalesce(s.week, 0), m.mode
  from people pe
  left join stats s on s.actor = pe.id
  left join public.follow_feed_modes m on m.target_id = pe.id and m.user_id = (select uid from me)
  order by s.last_at desc nulls last, pe.username
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Yetkiler: misafir hiçbirini çalıştıramaz; tetikleyici fonksiyonu kimseye açık değil.
-- ---------------------------------------------------------------------------------------------------------------------------
revoke all on function public.follow_feed_settings_get() from public, anon;
revoke all on function public.follow_feed_settings_set(boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.follow_feed_visit(boolean) from public, anon;
revoke all on function public.set_follow_feed_mode(uuid, text) from public, anon;
revoke all on function public._follow_feed_modes_on_unfollow() from public, anon, authenticated;
revoke all on function public._feed_item_actor(text, uuid) from public, anon;
revoke all on function public.following_activity_page(integer, timestamptz, text, text, text[], uuid[], text[], text[], text) from public, anon;
revoke all on function public.following_activity_summary(timestamptz) from public, anon;
revoke all on function public.following_people_overview(text, integer, integer) from public, anon;
grant execute on function public.follow_feed_settings_get() to authenticated;
grant execute on function public.follow_feed_settings_set(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.follow_feed_visit(boolean) to authenticated;
grant execute on function public.set_follow_feed_mode(uuid, text) to authenticated;
grant execute on function public._feed_item_actor(text, uuid) to authenticated;
grant execute on function public.following_activity_page(integer, timestamptz, text, text, text[], uuid[], text[], text[], text) to authenticated;
grant execute on function public.following_activity_summary(timestamptz) to authenticated;
grant execute on function public.following_people_overview(text, integer, integer) to authenticated;
