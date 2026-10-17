-- Topluluklar ana sayfası: birleşik gönderi akışları, "görüldü" verisi, ilgi tabanlı öneri ve gözatma (docs/history/185-*).
-- Yalnızca ekleyici: yeni tablo + yeni fonksiyonlar. Mevcut tablo/fonksiyon/politika değişmez, `drop` yok.
--
-- Neden yeni veri gerekli: sitede gönderi "görüldü" bilgisi tutulmuyordu (beğeni/yorum/kaydetme dışında hiçbir izleme yok). Keşfet akışında
-- "görmediğin yeni gönderiler önce gelsin, görülen tekrar yeni gibi çıkmasın" kuralı bu veri olmadan dürüstçe uygulanamaz.
-- Saklanan tek şey (kullanıcı, gönderi, ilk görülme zamanı)'dır; başka kullanıcıya hiçbir yolla gösterilmez.

-- ============================================================================
-- 1. Görüldü verisi
-- ============================================================================

create table if not exists public.community_post_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists community_post_views_user_seen_idx on public.community_post_views (user_id, seen_at desc);

alter table public.community_post_views enable row level security;
-- Yalnız kendi satırlarımı okurum; yazma yolu yalnız `mark_community_posts_seen` (SECURITY DEFINER).
create policy "Users read their own post views" on public.community_post_views
  for select to authenticated using (user_id = auth.uid());
revoke all on public.community_post_views from anon, authenticated;
grant select on public.community_post_views to authenticated;

-- Görülen gönderileri işaretler (en çok 50). Yalnız okuyabildiğim topluluğun gönderileri yazılır; ilk görülme zamanı korunur.
create or replace function public.mark_community_posts_seen(p_post_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  insert into public.community_post_views (user_id, post_id)
  select auth.uid(), p.id
    from public.community_posts p
   where p.id = any ((coalesce(p_post_ids, '{}'::uuid[]))[1:50])
     and public.can_read_community(p.community_id)
  on conflict (user_id, post_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- 2. Yardımcılar (yalnız diğer SECURITY DEFINER fonksiyonlardan çağrılır)
-- ============================================================================

-- Bir gönderinin işaret ettiği içeriğin etiketleri (dört tür tek yerde).
create or replace function public._community_post_tags(p_post_id uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select t.tag_slug from public.prompt_tags t join public.community_posts p on p.prompt_id = t.prompt_id where p.id = p_post_id
  union all
  select t.tag_slug from public.prompt_request_tags t join public.community_posts p on p.request_id = t.request_id where p.id = p_post_id
  union all
  select t.tag_slug from public.workflow_tags t join public.community_posts p on p.workflow_id = t.workflow_id where p.id = p_post_id
  union all
  select t.tag_slug from public.preset_tags t join public.community_posts p on p.preset_id = t.preset_id where p.id = p_post_id;
$$;

-- Topluluk–kullanıcı ilgi puanı. SADECE gerçek sinyaller (puan uydurulmaz); her terim üst sınırlıdır:
--   3 × (üyesi olduğum topluluklarla ortak kategori, genel hariç, en çok 3)
--   2 × (profil ilgi alanlarının topluluk adı/açıklamasında geçmesi, en çok 2)
--   1.5 × (son 60 günde topluluğa paylaşılan içeriklerden takip ettiğim etiketi ya da ilgi alanı adını taşıyanların sayısı, en çok 3) [yalnız herkese açık]
--   1.5 × (takip ettiğim kişilerden üye olanların sayısı, en çok 3) [yalnız herkese açık]
--   0.5 × (son 14 gündeki gönderi sayısı, en çok 5) [yalnız herkese açık]
--   0.5 × ln(1 + son 30 günde beğeni + 2×yorum), en çok 1.5 [yalnız herkese açık]
--   ln(1 + üye sayısı)
-- Kapalı (`restricted`) topluluğun içerik/üyelik kaynaklı sinyali HESABA KATILMAZ (içerik bilgisi sızmasın): yalnız kategori, metin ve üye sayısı.
-- `reason`: followed > interest > category > popular.
create or replace function public._community_relevance(p_user uuid)
returns table (community_id uuid, score double precision, reason text)
language sql
stable
security definer
set search_path = public
as $$
  with ints as (
    select lower(btrim(x)) as term
      from public.profiles pr, unnest(coalesce(pr.interests, '{}'::text[])) x
     where pr.id = p_user and char_length(btrim(x)) >= 3
  ), mine as (
    select g2.category, count(*)::integer as n
      from public.conversation_members m2
      join public.chat_groups g2 on g2.id = m2.conversation_id
     where m2.user_id = p_user and g2.category <> 'general'
     group by g2.category
  ), sig as (
    select g.id, g.member_count,
           coalesce(mine.n, 0) as cat_n,
           (select count(*) from ints
             where position(ints.term in lower(g.name)) > 0 or position(ints.term in lower(coalesce(g.description, ''))) > 0) as text_hits,
           case when g.visibility = 'public' then
             (select count(*) from public.community_posts p
               where p.community_id = g.id and p.created_at > now() - interval '60 days'
                 and exists (
                   select 1 from public._community_post_tags(p.id) s(slug)
                    where exists (select 1 from public.tag_follows tf where tf.user_id = p_user and tf.tag_slug = s.slug)
                       or exists (select 1 from public.tags tg where tg.slug = s.slug and lower(tg.label) in (select term from ints))
                 )) else 0 end as tag_hits,
           case when g.visibility = 'public' then
             (select count(*) from public.conversation_members cm
               join public.follows f on f.following_id = cm.user_id and f.follower_id = p_user
              where cm.conversation_id = g.id) else 0 end as followed_members,
           case when g.visibility = 'public' then
             (select count(*) from public.community_posts p where p.community_id = g.id and p.created_at > now() - interval '14 days') else 0 end as recent_posts,
           case when g.visibility = 'public' then
             (select coalesce(sum(p.like_count + 2 * p.comment_count), 0) from public.community_posts p
               where p.community_id = g.id and p.created_at > now() - interval '30 days') else 0 end as engagement
      from public.chat_groups g
      left join mine on mine.category = g.category
     where g.visibility in ('public', 'restricted') and g.closed_at is null
  )
  select s.id,
         (3 * least(s.cat_n, 3)
          + 2 * least(s.text_hits, 2)
          + 1.5 * least(s.tag_hits, 3)
          + 1.5 * least(s.followed_members, 3)
          + 0.5 * least(s.recent_posts, 5)
          + least(0.5 * ln(1 + s.engagement), 1.5)
          + ln((1 + s.member_count)::double precision))::double precision,
         case
           when s.followed_members > 0 then 'followed'
           when s.tag_hits > 0 or s.text_hits > 0 then 'interest'
           when s.cat_n > 0 then 'category'
           else 'popular'
         end
    from sig s;
$$;

-- ============================================================================
-- 3. Gönderiler akışı: üyesi olduğum (herkese açık + kapalı) toplulukların gönderileri
-- ============================================================================

-- Sıralama: yeniden eskiye keyset (`created_at`, `id`) — topluluk içi akışla aynı. Tamamen kapalı (`private`) topluluk genel akışa GİRMEZ.
-- Engellediğim / beni engelleyen yazarın gönderisi yok. Satır yalnız kimlik verir; içerik istemcide RLS'li sorguyla yüklenir (üyelik
-- bittiyse gönderi zaten okunamaz).
create or replace function public.member_feed_page(
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 12
)
returns table (post_id uuid, community_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.community_id, p.created_at
    from public.community_posts p
    join public.conversation_members m on m.conversation_id = p.community_id and m.user_id = auth.uid()
    join public.chat_groups g on g.id = p.community_id
   where auth.uid() is not null
     and g.visibility in ('public', 'restricted')
     and not public.is_blocked(p.author_id, auth.uid())
     and (
       p_before_at is null
       or (p.created_at, p.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     )
   order by p.created_at desc, p.id desc
   limit greatest(least(coalesce(p_limit, 12), 30), 1);
$$;

-- ============================================================================
-- 4. Keşfet akışı: görmediğim gönderiler, ilgi ve çeşitlilik sıralı
-- ============================================================================

-- Kaynaklar (bir gönderi tek satırdır; kaynak önceliği member > followed > public):
--   member   = üyesi olduğum topluluğun (herkese açık ya da kapalı) yeni gönderisi
--   followed = takip ettiğim kişinin herkese açık topluluktaki gönderisi (toplulukların kendi "takip"i yoktur; takip = kişi takibi)
--   public   = herkese açık toplulukların keşfedilebilir gönderisi
-- Aday kuralı: okuyabiliyorum (`can_read_community`: kapalı topluluk yalnız üyeye), tamamen kapalı DEĞİL, kendi gönderim DEĞİL, yazar engelli
-- DEĞİL, `p_as_of` anından önce görmediğim, son 45 günde. `p_as_of` istemcinin sayfa yükleme anıdır: görülme ve yenilik bu ana göre
-- sabitlenir, böylece aynı oturumda sayfalar arasında sıra kaymaz ve tekrar çıkmaz; sayfa yenilenince yeni an alınır (görülenler düşer).
-- Puan = üyelik 1 + takip edilen yazar 2 + takip edilen etiket 1.5×(≤2) + ilgi alanı etiketi 1×(≤2) + ortak kategori 1.5
--        + yenilik 2×exp(−yaş/3 gün) + etkileşim min(0.5×ln(1+beğeni+2×yorum+kayıt), 2).
-- Çeşitlilik: aynı topluluğun n'inci gönderisinden (puana göre) 0.75×(n−1) düşülür → aynı topluluk art arda yığılmaz.
create or replace function public.discover_feed_page(
  p_as_of timestamptz default now(),
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (post_id uuid, community_id uuid, source text, score double precision)
language sql
stable
security definer
set search_path = public
as $$
  with ints as (
    select lower(btrim(x)) as term
      from public.profiles pr, unnest(coalesce(pr.interests, '{}'::text[])) x
     where pr.id = auth.uid() and char_length(btrim(x)) >= 3
  ), mine as (
    select distinct g2.category
      from public.conversation_members m2
      join public.chat_groups g2 on g2.id = m2.conversation_id
     where m2.user_id = auth.uid() and g2.category <> 'general'
  ), cand as (
    select p.id, p.community_id, p.created_at, g.category,
           (m.user_id is not null) as is_member,
           exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.author_id) as followed_author,
           (select count(*) from public._community_post_tags(p.id) s(slug)
             where exists (select 1 from public.tag_follows tf where tf.user_id = auth.uid() and tf.tag_slug = s.slug)) as followed_tag_hits,
           (select count(*) from public._community_post_tags(p.id) s(slug)
             where exists (select 1 from public.tags tg where tg.slug = s.slug and lower(tg.label) in (select term from ints))) as interest_tag_hits,
           p.like_count + 2 * p.comment_count + p.save_count as engagement
      from public.community_posts p
      join public.chat_groups g on g.id = p.community_id
      left join public.conversation_members m on m.conversation_id = p.community_id and m.user_id = auth.uid()
     where auth.uid() is not null
       and p.created_at <= coalesce(p_as_of, now())
       and p.created_at > coalesce(p_as_of, now()) - interval '45 days'
       and g.visibility in ('public', 'restricted')
       and public.can_read_community(p.community_id)
       and p.author_id <> auth.uid()
       and not public.is_blocked(p.author_id, auth.uid())
       and not exists (
         select 1 from public.community_post_views v
          where v.user_id = auth.uid() and v.post_id = p.id and v.seen_at < coalesce(p_as_of, now())
       )
     order by p.created_at desc, p.id desc
     limit 400
  ), scored as (
    select c.id, c.community_id, c.created_at,
           case when c.is_member then 'member' when c.followed_author then 'followed' else 'public' end as source,
           (case when c.is_member then 1.0 else 0 end
            + case when c.followed_author then 2.0 else 0 end
            + 1.5 * least(c.followed_tag_hits, 2)
            + 1.0 * least(c.interest_tag_hits, 2)
            + case when c.category in (select category from mine) then 1.5 else 0 end
            + 2.0 * exp(-extract(epoch from (coalesce(p_as_of, now()) - c.created_at)) / 259200.0)
            + least(0.5 * ln(1 + c.engagement), 2.0))::double precision as base
      from cand c
  ), ranked as (
    select s.*, row_number() over (partition by s.community_id order by s.base desc, s.created_at desc, s.id desc) as rn
      from scored s
  )
  select r.id, r.community_id, r.source, (r.base - 0.75 * (r.rn - 1))::double precision
    from ranked r
   order by (r.base - 0.75 * (r.rn - 1)) desc, r.created_at desc, r.id desc
   limit greatest(least(coalesce(p_limit, 12), 30), 1)
  offset greatest(least(coalesce(p_offset, 0), 400), 0);
$$;

-- ============================================================================
-- 5. "Sana uygun topluluklar" ve "Tüm topluluklar"
-- ============================================================================

-- Öneri: üye olmadığım, davet/başvurum bulunmayan, dolu olmayan, yasaklı/engelli olmadığım herkese açık + kapalı topluluklar (tamamen kapalı asla),
-- `_community_relevance` puanına göre. Tekrar azaltma istemcide (daha önce gösterilenler sona alınır); sunucu durumsuzdur.
create or replace function public.recommend_communities(p_limit integer default 10)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text, reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit,
         case when g.visibility = 'public' then g.post_count end,
         case when g.visibility = 'public' then
           (select count(*)::integer from public.community_events e
             where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) end,
         g.rules_required, g.created_at,
         case when g.visibility = 'public' then
           greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) end,
         'none'::text,
         rel.reason
    from public._community_relevance(auth.uid()) rel
    join public.chat_groups g on g.id = rel.community_id
    join public.conversations c on c.id = g.id
   where auth.uid() is not null
     and g.member_count < g.member_limit
     and not exists (select 1 from public.conversation_members m where m.conversation_id = g.id and m.user_id = auth.uid())
     and not exists (
       select 1 from public.chat_group_invitations i
        where i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
     )
     and not exists (
       select 1 from public.chat_group_join_requests r
        where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
     )
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
   order by rel.score desc, g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 10), 30), 1);
$$;

-- Tüm topluluklar: herkese açık + kapalı (tamamen kapalı asla), kapatılmamış. Üye olduklarım da listelenir (`my_status`).
-- Arama: ad, açıklama ve (yalnız herkese açık topluluklarda, son 60 gündeki içeriklerin) etiket adı; kategori süzgeci ayrı.
-- Sıralama: `relevant` (varsayılan; ilgi puanı, sinyal yoksa yaygınlık), `popular`, `newest`, `active`. Aramada ad eşleşmesi önce gelir.
create or replace function public.browse_communities(
  p_query text default null,
  p_category text default null,
  p_sort text default 'relevant',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text, reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(btrim(left(coalesce(p_query, ''), 100)), '') as term
  ), pat as (
    select term, replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as esc from q
  )
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit,
         case when g.visibility = 'public' or m.user_id is not null then g.post_count end,
         case when g.visibility = 'public' or m.user_id is not null then
           (select count(*)::integer from public.community_events e
             where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) end,
         g.rules_required, g.created_at,
         case when g.visibility = 'public' or m.user_id is not null then
           greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) end,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end,
         rel.reason
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    join public._community_relevance(auth.uid()) rel on rel.community_id = g.id
    cross join pat
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where auth.uid() is not null
     and g.visibility in ('public', 'restricted')
     and g.closed_at is null
     and (p_category is null or g.category = p_category)
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       pat.term is null
       or g.name ilike '%' || pat.esc || '%'
       or g.description ilike '%' || pat.esc || '%'
       or (g.visibility = 'public' and exists (
            select 1 from public.community_posts p
             where p.community_id = g.id and p.created_at > now() - interval '60 days'
               and exists (
                 select 1 from public._community_post_tags(p.id) s(slug)
                   join public.tags tg on tg.slug = s.slug
                  where tg.label ilike pat.esc || '%' or tg.slug = lower(pat.term)
               )
          ))
     )
   order by
     case when pat.term is null then 3 when lower(g.name) = lower(pat.term) then 0 when g.name ilike pat.esc || '%' then 1 else 2 end,
     case when p_sort = 'newest' then extract(epoch from g.created_at) end desc nulls last,
     case when p_sort = 'active' then extract(epoch from greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id))) end desc nulls last,
     case when coalesce(p_sort, 'relevant') = 'relevant' then rel.score end desc nulls last,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
  offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- ============================================================================
-- 6. EXECUTE yetkileri (ziyaretçiye KAPALI; yardımcılar hiçbir istemci rolüne açık değil)
-- ============================================================================

revoke execute on function public.mark_community_posts_seen(uuid[]) from public, anon;
revoke execute on function public.member_feed_page(timestamptz, uuid, integer) from public, anon;
revoke execute on function public.discover_feed_page(timestamptz, integer, integer) from public, anon;
revoke execute on function public.recommend_communities(integer) from public, anon;
revoke execute on function public.browse_communities(text, text, text, integer, integer) from public, anon;
revoke execute on function public._community_post_tags(uuid) from public, anon, authenticated;
revoke execute on function public._community_relevance(uuid) from public, anon, authenticated;
grant execute on function public.mark_community_posts_seen(uuid[]) to authenticated;
grant execute on function public.member_feed_page(timestamptz, uuid, integer) to authenticated;
grant execute on function public.discover_feed_page(timestamptz, integer, integer) to authenticated;
grant execute on function public.recommend_communities(integer) to authenticated;
grant execute on function public.browse_communities(text, text, text, integer, integer) to authenticated;
