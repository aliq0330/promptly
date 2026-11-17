-- Skill: sosyal sinyaller ve sohbet/profil sayıları (docs/history/417-*). Yalnız create-or-replace; imza ve dönüş sütunları DEĞİŞMEZ.
--
-- 1) `suggest_creators`: Skill paylaşan yazar "Takip edilecek kişiler"e hiç girmiyordu, Skill beğenisi de sinyal değildi.
-- 2) `chat_shared_items` / `chat_shared_stats`: sohbette paylaşılan Skill bağlantısı "İçerik" yerine "Bağlantılar"a düşüyordu.
-- 3) `profile_content_stats`: jsonb'a `skills` anahtarı eklenir (mevcut anahtarlar aynı; arayüz kendi sayımını kullanır, bu API tutarlılığıdır).
-- Gövdeler repodaki son tanımlardan (canlıyla eşleştirildi) üretildi; tek fark Skill dalları.

CREATE OR REPLACE FUNCTION public.suggest_creators(p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, reason_kind text, reason_ref text, reason_count integer, score bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select auth.uid() as me, least(greatest(coalesce(p_limit, 12), 1), 30) as lim
  ),
  -- Ortak takip sinyali için bakılan kişiler: en son takip ettiğim 500 (çok geniş ağda sorgu sınırlı kalsın). "Zaten takip ediyorum" elemesi TAM listeyi kullanır.
  followed_recent as (
    select f.following_id as uid
      from public.follows f, params pr
     where f.follower_id = pr.me
     order by f.created_at desc
     limit 500
  ),
  -- Son 90 günde herkese açık gönderisi olan yazarlar (topluluğa özgü içerik, taslak ve silinmiş sayılmaz).
  posts as (
    select a.author_id, count(*) as n, max(a.created_at) as latest
      from (
        select p.author_id, p.created_at from public.prompts p
         where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null
           and (p.origin_type = 'original' or p.show_on_profile) and p.created_at > now() - interval '90 days'
        union all
        select r.author_id, r.created_at from public.prompt_requests r
         where not r.is_draft and r.visibility = 'public' and r.deleted_at is null and r.community_id is null and r.team_file_id is null and r.created_at > now() - interval '90 days'
        union all
        select w.creator_id, w.created_at from public.workflows w
         where w.status = 'published' and w.visibility = 'public' and w.community_id is null and w.team_file_id is null and w.created_at > now() - interval '90 days'
        union all
        select s.creator_id, s.created_at from public.presets s
         where s.status = 'published' and s.visibility = 'public' and s.community_id is null and s.team_file_id is null and s.created_at > now() - interval '90 days'
        union all
        select k.author_id, k.created_at from public.skills k
         where k.status = 'published' and k.visibility = 'public' and k.created_at > now() - interval '90 days'
      ) a
     group by a.author_id
  ),
  -- Takip ettiklerimin takip ettiği kişiler; neden satırı için bunlardan en yeni takipçinin adı.
  mutual as (
    select f2.following_id as uid, count(*) as n, (array_agg(pf.display_name order by f2.created_at desc))[1] as ref
      from public.follows f2
      join followed_recent fr on fr.uid = f2.follower_id
      join public.profiles pf on pf.id = f2.follower_id
     group by f2.following_id
  ),
  my_likes as (
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id, l.skill_id
      from public.prompt_likes l, params pr
     where l.user_id = pr.me
     order by l.created_at desc
     limit 300
  ),
  liked as (
    select a.author_id as uid, count(*) as n
      from (
        select p.author_id from my_likes l join public.prompts p on p.id = l.prompt_id
        union all select r.author_id from my_likes l join public.prompt_requests r on r.id = l.request_id
        union all select w.creator_id from my_likes l join public.workflows w on w.id = l.workflow_id
        union all select s.creator_id from my_likes l join public.presets s on s.id = l.preset_id
        union all select k.author_id from my_likes l join public.skills k on k.id = l.skill_id and k.status = 'published' and k.visibility = 'public'
      ) a
     group by a.author_id
  ),
  ftags as (
    select t.tag_slug from public.tag_follows t, params pr where t.user_id = pr.me
  ),
  ftools as (
    select t.tool_id from public.tool_follows t, params pr where t.user_id = pr.me
  ),
  tag_hits as (
    select p.author_id as uid, count(distinct tg.tag_slug) as n, min(tg.tag_slug) as ref
      from public.prompts p
      join public.prompt_tags tg on tg.prompt_id = p.id
     where tg.tag_slug in (select tag_slug from ftags)
       and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null and p.created_at > now() - interval '90 days'
     group by p.author_id
  ),
  tool_hits as (
    select p.author_id as uid, min(ft.tool_id) as ref
      from public.prompts p
      join ftools ft on exists (select 1 from unnest(p.tools) r where split_part(r, ':', 1) = ft.tool_id)
     where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null and p.created_at > now() - interval '90 days'
     group by p.author_id
  ),
  cand as (
    select pf.id as uid, pf.follower_count, po.latest,
           coalesce(mu.n, 0) as mutual_n, mu.ref as mutual_ref,
           coalesce(li.n, 0) as liked_n,
           coalesce(th.n, 0) as tag_n, th.ref as tag_ref,
           tl.ref as tool_ref
      from public.profiles pf
      join posts po on po.author_id = pf.id
      cross join params pr
      left join mutual mu on mu.uid = pf.id
      left join liked li on li.uid = pf.id
      left join tag_hits th on th.uid = pf.id
      left join tool_hits tl on tl.uid = pf.id
     where pr.me is not null
       and pf.id <> pr.me
       and not exists (select 1 from public.follows f where f.follower_id = pr.me and f.following_id = pf.id)
       and not exists (select 1 from public.creator_suggestion_dismissals d where d.user_id = pr.me and d.creator_id = pf.id)
       and not public.is_blocked(pr.me, pf.id)
       and (pf.suspended_until is null or pf.suspended_until <= now())
  )
  select c.uid,
         case when c.mutual_n > 0 then 'mutual' when c.liked_n > 0 then 'liked' when c.tag_n > 0 then 'tag' when c.tool_ref is not null then 'tool' else 'active' end,
         case when c.mutual_n > 0 then c.mutual_ref when c.liked_n > 0 then null when c.tag_n > 0 then c.tag_ref when c.tool_ref is not null then c.tool_ref else null end,
         case when c.mutual_n > 0 then c.mutual_n when c.liked_n > 0 then c.liked_n when c.tag_n > 0 then c.tag_n else 0 end::integer,
         (case when c.mutual_n > 0 then 300 + 100 * least(c.mutual_n, 4) else 0 end
          + case when c.liked_n > 0 then 150 + 30 * least(c.liked_n, 5) else 0 end
          + 120 * least(c.tag_n, 3)
          + case when c.tool_ref is not null then 100 else 0 end
          + least(round(30 * ln(1 + c.follower_count)), 120)
          + round(100 * exp(- (extract(epoch from (now() - c.latest)) / 86400.0) / 30.0)))::bigint as score
    from cand c
   order by 5 desc, c.uid desc
   limit (select lim from params);
$function$;

create or replace function public.chat_shared_items(p_conversation_id uuid, p_kind text, p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, sender_id uuid, body text, attachments jsonb, shared_prompt_id uuid, shared_request_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  with vis as (
    select m.*
      from public.messages m
     where m.conversation_id = p_conversation_id
       and p_kind in ('photos', 'links', 'content')
       and m.deleted_at is null
       and not exists (select 1 from public.message_hidden_for h where h.message_id = m.id and h.user_id = auth.uid())
       and m.created_at > coalesce(
         (select cm.cleared_at from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()),
         '-infinity'::timestamptz)
  ), flagged as (
    select vis.*,
           (shared_prompt_id is not null or shared_request_id is not null
             or coalesce(body ~* '/(workflows|presets|spaces|skills)/local\?id=[0-9a-f-]{36}|/communities/post/local\?id=[0-9a-f-]{36}', false)) as is_content
      from vis
  )
  select f.id, f.created_at, f.sender_id, f.body, f.attachments, f.shared_prompt_id, f.shared_request_id
    from flagged f
   where case p_kind
           when 'photos'  then jsonb_array_length(f.attachments) > 0
           when 'content' then f.is_content
           when 'links'   then not f.is_content and coalesce(f.body ~* 'https?://[^[:space:]]+', false)
         end
   order by f.created_at desc, f.id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.chat_shared_stats(p_conversation_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with vis as (
    select m.*
      from public.messages m
     where m.conversation_id = p_conversation_id
       and m.deleted_at is null
       and not exists (select 1 from public.message_hidden_for h where h.message_id = m.id and h.user_id = auth.uid())
       and m.created_at > coalesce(
         (select cm.cleared_at from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()),
         '-infinity'::timestamptz)
  ), flagged as (
    select vis.*,
           (shared_prompt_id is not null or shared_request_id is not null
             or coalesce(body ~* '/(workflows|presets|spaces|skills)/local\?id=[0-9a-f-]{36}|/communities/post/local\?id=[0-9a-f-]{36}', false)) as is_content
      from vis
  )
  select jsonb_build_object(
    'photos',  coalesce(sum(jsonb_array_length(attachments)), 0),
    'content', count(*) filter (where is_content),
    'links',   count(*) filter (where not is_content and coalesce(body ~* 'https?://[^[:space:]]+', false))
  )
  from flagged;
$$;

CREATE OR REPLACE FUNCTION public.profile_content_stats(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'prompts', (select count(*) from public.prompts x
                 where x.author_id = p_user and x.community_id is null and x.team_file_id is null and x.deleted_at is null and x.status <> 'draft'
                   and (x.origin_type = 'original' or x.show_on_profile)),
    'reuse', (select coalesce(sum(x.copy_count), 0) from public.prompts x
               where x.author_id = p_user and x.community_id is null and x.team_file_id is null and x.deleted_at is null and x.status <> 'draft'
                 and (x.origin_type = 'original' or x.show_on_profile)),
    'requests', (select count(*) from public.prompt_requests x
                  where x.author_id = p_user and x.community_id is null and x.team_file_id is null and x.deleted_at is null and not x.is_draft),
    'workflows', (select count(*) from public.workflows x
                   where x.creator_id = p_user and x.community_id is null and x.team_file_id is null and x.status = 'published'),
    'presets', (select count(*) from public.presets x
                 where x.creator_id = p_user and x.community_id is null and x.team_file_id is null and x.status = 'published'),
    'skills', (select count(*) from public.skills x
                where x.author_id = p_user and x.status = 'published' and x.visibility = 'public')
  );
$function$;
