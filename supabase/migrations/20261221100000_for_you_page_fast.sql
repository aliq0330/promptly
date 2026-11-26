-- "Sana özel" hızlandırma (docs/history/465-*): `for_you_page` aynı imza ve AYNI sonuçla, çok daha az işle çalışır.
--
-- Ölçüm (canlı, aynı kullanıcı): yeni bağlantıda 898 ms / ~23 700 tampon, aynı bağlantıda 134 ms. Maliyetin çoğu RLS'ten geliyordu: işlev
-- çağıranın yetkisiyle (INVOKER) çalıştığı için ~3 400 adayın her biri için 5 etiket alt sorgusu çalışıyor, `prompt_tags`'in her satırı RLS'te
-- prompt'u yeniden okuyor, prompt'un RLS'i de engel/topluluk/ekip denetimini yapıyordu (aday × etiket × iç içe politika). Bir de her yeni
-- bağlantı bu politikaların ve işlevlerin hepsini katalogdan baştan yüklüyordu.
--
-- Yeni düzen iki parçadır:
--   1) `for_you_page` (INVOKER, imza değişmedi): kişinin KENDİ küçük sinyal kümelerini eskisiyle birebir aynı sorguyla, kendi yetkisiyle
--      hesaplar — beğendiği (son 300) / "ilgimi çekiyor" dediği içeriklerin etiketleri, "çekmiyor" dediklerinin etiketleri ve en az iki gönderisine
--      "çekmiyor" dediği yazarlar. Bu kümeler RLS'e bağlıdır (gizlenen/engellenen içeriğin etiketi sayılmaz), o yüzden çağıranın yetkisinde kalır.
--   2) `_for_you_rank` (SECURITY DEFINER): ağır aday taramasını RLS'siz yapar. Aday kümesi zaten yalnız yayında + herkese açık + silinmemiş +
--      topluluğa/ekibe ait olmayan + başkasına ait içeriktir; bu satırlar için beş içerik tablosunun RLS'i tek bir koşula iner:
--      "yazar engellenmemiş" (`*_hide_blocked`). O koşul burada AÇIKÇA yazılır. Etiket sinyalleri aday başına alt sorgu yerine etiket
--      index'inden tek birleştirmeyle sayılır. Kişinin kendi satırları (takip, etiket/araç takibi, beğeni/ilgi dışlaması, kaydedilenler,
--      kopyalananlar, ilgi alanları) zaten kendisine görünürdür; RLS'siz okumak aynı satırları verir.
-- `_for_you_rank`'e verilen sinyal dizileri yalnız ÇAĞIRANIN kendi sıralamasını etkiler: kimlik her zaman `auth.uid()`'dir, dönen satırlar hep
-- herkese açık içeriktir; misafir (uid yok) boş liste alır. Sonuçların eskisiyle aynı olduğu yerel veritabanında rastgele veriyle karşılaştırıldı.

create or replace function public._for_you_rank(
  p_as_of timestamp with time zone, p_kinds text[], p_content_type text, p_category text, p_subcategory text, p_limit integer,
  p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid,
  p_lt_slugs text[], p_lt_n bigint[], p_dt_slugs text[], p_dt_n bigint[], p_dis_authors uuid[]
)
returns table(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint, reason_kind text, reason_ref text)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_limit, 18), 1), 50) as lim,
           least(coalesce(p_as_of, now()), now()) as as_of,
           auth.uid() as me,
           -- `*_hide_blocked` RESTRICTIVE politikasının karşılığı (iki yönlü engel).
           public.blocked_user_ids() as blocked
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
  ltags as (
    select s.tag_slug, s.n from unnest(coalesce(p_lt_slugs, '{}'::text[]), coalesce(p_lt_n, '{}'::bigint[])) as s(tag_slug, n) where s.tag_slug is not null
  ),
  dtags as (
    select s.tag_slug, s.n from unnest(coalesce(p_dt_slugs, '{}'::text[]), coalesce(p_dt_n, '{}'::bigint[])) as s(tag_slug, n) where s.tag_slug is not null
  ),
  dis_authors as (
    select a.author_id from unnest(coalesce(p_dis_authors, '{}'::uuid[])) as a(author_id)
  ),
  saved as (
    select ci.prompt_id, ci.workflow_id, ci.preset_id, ci.skill_id
      from public.collection_items ci
      join public.collections c on c.id = ci.collection_id, params pr
     where c.owner_id = pr.me
  ),
  copied as (
    select e.prompt_id from public.prompt_copy_events e, params pr where e.user_id = pr.me and e.created_at > pr.as_of - interval '60 days'
  ),
  my_domains as (
    select distinct public.interest_domain(i) as domain
      from public.profiles p, unnest(coalesce(p.interests, '{}'::text[])) i, params pr
     where p.id = pr.me and public.interest_domain(i) is not null
  ),
  my_imap as (
    select d.domain as interest, m.content_type, nullif(m.category, '*') as category
      from my_domains d
      join public.taxonomy_category_domains m on m.domain = d.domain
  ),
  -- Etiket sinyalleri: yalnız sinyal taşıyan etiketlerin satırları (etiket index'i), içerik başına tek toplama.
  -- Alanlar eskisinin aynısıdır: ft_tag = takip edilen en küçük etiket, ft_n = takip edilen etiket sayısı, lt_tag = en çok beğenilen (eşitlikte
  -- alfabetik ilk) etiket, lt_n / dt_n = beğenilen / "çekmiyor" etiketlerinin sayısı.
  sig as (
    select tag_slug from ftags union select tag_slug from ltags union select tag_slug from dtags
  ),
  pt as (
    select tg.prompt_id as cid,
           min(tg.tag_slug) filter (where ft.tag_slug is not null) as ft_tag,
           count(ft.tag_slug) as ft_n,
           (array_agg(tg.tag_slug order by lt.n desc, tg.tag_slug) filter (where lt.tag_slug is not null))[1] as lt_tag,
           count(lt.tag_slug) as lt_n,
           count(dt.tag_slug) as dt_n
      from public.prompt_tags tg
      left join ftags ft on ft.tag_slug = tg.tag_slug
      left join ltags lt on lt.tag_slug = tg.tag_slug
      left join dtags dt on dt.tag_slug = tg.tag_slug
     where tg.tag_slug in (select tag_slug from sig)
     group by tg.prompt_id
  ),
  rt as (
    select tg.request_id as cid,
           min(tg.tag_slug) filter (where ft.tag_slug is not null) as ft_tag,
           count(ft.tag_slug) as ft_n,
           (array_agg(tg.tag_slug order by lt.n desc, tg.tag_slug) filter (where lt.tag_slug is not null))[1] as lt_tag,
           count(lt.tag_slug) as lt_n,
           count(dt.tag_slug) as dt_n
      from public.prompt_request_tags tg
      left join ftags ft on ft.tag_slug = tg.tag_slug
      left join ltags lt on lt.tag_slug = tg.tag_slug
      left join dtags dt on dt.tag_slug = tg.tag_slug
     where tg.tag_slug in (select tag_slug from sig)
     group by tg.request_id
  ),
  wt as (
    select tg.workflow_id as cid,
           min(tg.tag_slug) filter (where ft.tag_slug is not null) as ft_tag,
           count(ft.tag_slug) as ft_n,
           (array_agg(tg.tag_slug order by lt.n desc, tg.tag_slug) filter (where lt.tag_slug is not null))[1] as lt_tag,
           count(lt.tag_slug) as lt_n,
           count(dt.tag_slug) as dt_n
      from public.workflow_tags tg
      left join ftags ft on ft.tag_slug = tg.tag_slug
      left join ltags lt on lt.tag_slug = tg.tag_slug
      left join dtags dt on dt.tag_slug = tg.tag_slug
     where tg.tag_slug in (select tag_slug from sig)
     group by tg.workflow_id
  ),
  st as (
    select tg.preset_id as cid,
           min(tg.tag_slug) filter (where ft.tag_slug is not null) as ft_tag,
           count(ft.tag_slug) as ft_n,
           (array_agg(tg.tag_slug order by lt.n desc, tg.tag_slug) filter (where lt.tag_slug is not null))[1] as lt_tag,
           count(lt.tag_slug) as lt_n,
           count(dt.tag_slug) as dt_n
      from public.preset_tags tg
      left join ftags ft on ft.tag_slug = tg.tag_slug
      left join ltags lt on lt.tag_slug = tg.tag_slug
      left join dtags dt on dt.tag_slug = tg.tag_slug
     where tg.tag_slug in (select tag_slug from sig)
     group by tg.preset_id
  ),
  kt as (
    select tg.skill_id as cid,
           min(tg.tag_slug) filter (where ft.tag_slug is not null) as ft_tag,
           count(ft.tag_slug) as ft_n,
           (array_agg(tg.tag_slug order by lt.n desc, tg.tag_slug) filter (where lt.tag_slug is not null))[1] as lt_tag,
           count(lt.tag_slug) as lt_n,
           count(dt.tag_slug) as dt_n
      from public.skill_tags tg
      left join ftags ft on ft.tag_slug = tg.tag_slug
      left join ltags lt on lt.tag_slug = tg.tag_slug
      left join dtags dt on dt.tag_slug = tg.tag_slug
     where tg.tag_slug in (select tag_slug from sig)
     group by tg.skill_id
  ),
  cand as (
    select 'prompt'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2)::bigint as eng,
           t.ft_tag, coalesce(t.ft_n, 0) as ft_n, t.lt_tag, coalesce(t.lt_n, 0) as lt_n, coalesce(t.dt_n, 0) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.prompts x
      cross join params pr
      left join pt t on t.cid = x.id
     where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
       and (x.origin_type = 'original' or x.show_on_profile)
       and not (pr.blocked @> array[x.author_id])
       and (p_kinds is null or 'prompt' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.prompt_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.prompt_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.prompt_id = x.id)
       and not exists (select 1 from copied c where c.prompt_id = x.id)
    union all
    select 'request'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.comment_count * 2 + x.response_count * 2)::bigint as eng,
           t.ft_tag, coalesce(t.ft_n, 0), t.lt_tag, coalesce(t.lt_n, 0), coalesce(t.dt_n, 0),
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.prompt_requests x
      cross join params pr
      left join rt t on t.cid = x.id
     where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
       and not (pr.blocked @> array[x.author_id])
       and (p_kinds is null or 'request' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.request_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.request_id = x.id and ci.user_id = pr.me)
    union all
    select 'workflow'::text as kind, x.id, x.created_at, x.creator_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2)::bigint as eng,
           t.ft_tag, coalesce(t.ft_n, 0), t.lt_tag, coalesce(t.lt_n, 0), coalesce(t.dt_n, 0),
           (select min(mi.interest) from my_imap mi where mi.content_type = any (x.content_types) and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.workflows x
      cross join params pr
      left join wt t on t.cid = x.id
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
       and not (pr.blocked @> array[x.creator_id])
       and (p_kinds is null or 'workflow' = any (p_kinds))
       and (p_content_type is null or p_content_type = any (x.content_types))
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.workflow_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.workflow_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.workflow_id = x.id)
    union all
    select 'preset'::text as kind, x.id, x.created_at, x.creator_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2)::bigint as eng,
           t.ft_tag, coalesce(t.ft_n, 0), t.lt_tag, coalesce(t.lt_n, 0), coalesce(t.dt_n, 0),
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.presets x
      cross join params pr
      left join st t on t.cid = x.id
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
       and not (pr.blocked @> array[x.creator_id])
       and (p_kinds is null or 'preset' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.preset_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.preset_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.preset_id = x.id)
    union all
    select 'skill'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.use_count * 2)::bigint as eng,
           t.ft_tag, coalesce(t.ft_n, 0), t.lt_tag, coalesce(t.lt_n, 0), coalesce(t.dt_n, 0),
           (select min(d.domain) from my_domains d where d.domain = x.category) as im,
           null::text as ftool
      from public.skills x
      cross join params pr
      left join kt t on t.cid = x.id
     where x.status = 'published' and x.visibility = 'public'
       and not (pr.blocked @> array[x.author_id])
       and (p_kinds is null or 'skill' = any (p_kinds))
       and p_content_type is null and p_category is null and p_subcategory is null
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.skill_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.skill_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.skill_id = x.id)
  ),
  raw as (
    select c.*,
           (300 * (c.author_id in (select author_id from followed))::int
            + 200 * least(c.ft_n, 3)
            + 150 * (c.ftool is not null)::int
            + 150 * (c.im is not null)::int
            + 50 * least(c.lt_n, 3)
            - 60 * least(c.dt_n, 3)
            - 200 * (c.author_id in (select author_id from dis_authors))::int
            + least(round(40 * ln(1 + c.eng)), 200)
            + round(300 * exp(- (extract(epoch from (pr.as_of - c.created_at)) / 3600.0) / 72.0)))::bigint as raw_rank
      from cand c, params pr
  ),
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

-- Yalnız `for_you_page` (oturumlu kullanıcı, kendi yetkisiyle) çağırır; misafir ve doğrudan public erişimi kapalı.
revoke all on function public._for_you_rank(timestamp with time zone, text[], text, text, text, integer, bigint, timestamp with time zone, uuid, text[], bigint[], text[], bigint[], uuid[]) from public, anon;
grant execute on function public._for_you_rank(timestamp with time zone, text[], text, text, text, integer, bigint, timestamp with time zone, uuid, text[], bigint[], text[], bigint[], uuid[]) to authenticated;

create or replace function public.for_you_page(p_as_of timestamp with time zone, p_kinds text[], p_content_type text, p_category text, p_subcategory text, p_limit integer, p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid)
 returns table(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint, reason_kind text, reason_ref text)
 language sql
 stable
 set search_path to 'public'
as $function$
  -- Kişinin kendi, RLS'e bağlı küçük sinyal kümeleri (önceki tanımla birebir aynı sorgular, 20261208100000); ağır sıralama `_for_you_rank`'te.
  with params as (
    select auth.uid() as me
  ),
  my_likes as (
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id, l.skill_id
      from public.prompt_likes l, params pr
     where l.user_id = pr.me
     order by l.created_at desc
     limit 300
  ),
  my_int as (
    select ci.prompt_id, ci.request_id, ci.workflow_id, ci.preset_id, ci.skill_id, ci.value
      from public.content_interest ci, params pr
     where ci.user_id = pr.me
     order by ci.created_at desc
     limit 300
  ),
  ltags as (
    select s.tag_slug, count(*) as n
      from (
        select tg.tag_slug from my_likes l join public.prompt_tags tg on tg.prompt_id = l.prompt_id
        union all select tg.tag_slug from my_likes l join public.prompt_request_tags tg on tg.request_id = l.request_id
        union all select tg.tag_slug from my_likes l join public.workflow_tags tg on tg.workflow_id = l.workflow_id
        union all select tg.tag_slug from my_likes l join public.preset_tags tg on tg.preset_id = l.preset_id
        union all select tg.tag_slug from my_likes l join public.skill_tags tg on tg.skill_id = l.skill_id
        union all select tg.tag_slug from my_int l join public.prompt_tags tg on tg.prompt_id = l.prompt_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.prompt_request_tags tg on tg.request_id = l.request_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.workflow_tags tg on tg.workflow_id = l.workflow_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.preset_tags tg on tg.preset_id = l.preset_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.skill_tags tg on tg.skill_id = l.skill_id where l.value = 'interested'
      ) s
     group by s.tag_slug
  ),
  dtags as (
    select s.tag_slug, count(*) as n
      from (
        select tg.tag_slug from my_int l join public.prompt_tags tg on tg.prompt_id = l.prompt_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.prompt_request_tags tg on tg.request_id = l.request_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.workflow_tags tg on tg.workflow_id = l.workflow_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.preset_tags tg on tg.preset_id = l.preset_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.skill_tags tg on tg.skill_id = l.skill_id where l.value = 'not_interested'
      ) s
     group by s.tag_slug
  ),
  dis_authors as (
    select a.author_id
      from (
        select p.author_id from my_int l join public.prompts p on p.id = l.prompt_id where l.value = 'not_interested'
        union all select r.author_id from my_int l join public.prompt_requests r on r.id = l.request_id where l.value = 'not_interested'
        union all select w.creator_id from my_int l join public.workflows w on w.id = l.workflow_id where l.value = 'not_interested'
        union all select s.creator_id from my_int l join public.presets s on s.id = l.preset_id where l.value = 'not_interested'
        union all select k.author_id from my_int l join public.skills k on k.id = l.skill_id where l.value = 'not_interested'
      ) a
     group by a.author_id
    having count(*) >= 2
  )
  select r.kind, r.id, r.created_at, r.sort_rank, r.reason_kind, r.reason_ref
    from public._for_you_rank(
      p_as_of, p_kinds, p_content_type, p_category, p_subcategory, p_limit, p_after_rank, p_after_created_at, p_after_id,
      (select array_agg(lt.tag_slug order by lt.tag_slug) from ltags lt),
      (select array_agg(lt.n order by lt.tag_slug) from ltags lt),
      (select array_agg(dt.tag_slug order by dt.tag_slug) from dtags dt),
      (select array_agg(dt.n order by dt.tag_slug) from dtags dt),
      (select array_agg(da.author_id) from dis_authors da)
    ) r;
$function$;
