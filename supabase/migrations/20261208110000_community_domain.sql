-- Topluluk "Alan" + "Amaç" (docs/history/426-*): topluluğun konusu ortak ALAN sözlüğündendir (`chat_groups.domain → domains.id`), kategori artık yalnız AMAÇtır
-- (genel / öğrenme / vitrin). Ortam değerleri (görsel/metin/ses/video/workflow) yeni istemcide sunulmaz ama veritabanı hâlâ kabul eder (genişle → daralt:
-- eski istemci ve eski satırlar bozulmaz; CHECK sonraki bir "contract" migration'ında daraltılır).
--   1) `chat_groups.domain` (boş olabilir) + eski ortam kategorilerinden TAHMİNİ geri doldurma (image→art, text→writing, audio→music-audio, video→video, workflow→productivity,
--      learning→education); sahibi ayarlardan değiştirebilir. `category` değerleri DEĞİŞTİRİLMEZ.
--   2) `create_community` yeni sondaki `p_domain` parametresini alır (eski çağrılar varsayılanla çalışır); `update_community` yamasına `domain` anahtarı eklenir.
--   3) Liste süzgeçleri (`discover/search/browse_communities`): `p_category` artık amaç YA DA alan kimliği kabul eder (imza/dönüş değişmedi).
--   4) `community_domains(uuid[])`: kartı görülebilen toplulukların alanı (liste RPC'lerinin dönüş şekli korunur).
--   5) İlgi puanı (`_community_relevance`): topluluğun alanı kullanıcının ilgi alanlarındaysa `interest` nedeni ve +3.
-- ci:allow-destructive — yalnız eski `create_community` imzası, yenisiyle (aynı + p_domain) değiştirilir.
alter table public.chat_groups add column if not exists domain text references public.domains (id) on update cascade on delete set null;
create index if not exists chat_groups_domain_idx on public.chat_groups (domain) where domain is not null;
update public.chat_groups
   set domain = case category
     when 'image' then 'art' when 'text' then 'writing' when 'audio' then 'music-audio' when 'video' then 'video'
     when 'workflow' then 'productivity' when 'learning' then 'education' else null end
 where domain is null and category in ('image', 'text', 'audio', 'video', 'workflow', 'learning');

create or replace function public._community_valid_domain(p_domain text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_domain is null or exists (select 1 from public.domains d where d.id = p_domain);
$$;
revoke execute on function public._community_valid_domain(text) from public, anon, authenticated;

drop function if exists public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean);
create or replace function public.create_community(
  p_name text,
  p_description text default null,
  p_visibility text default 'private',
  p_avatar_url text default null,
  p_member_limit integer default 256,
  p_invite_user_ids uuid[] default '{}',
  p_category text default 'general',
  p_posting_policy text default 'members',
  p_feed_policy text default 'members',
  p_rules text default null,
  p_rules_required boolean default false,
  p_domain text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_rules text := nullif(btrim(coalesce(p_rules, '')), '');
  v_result jsonb;
  v_id uuid;
begin
  if p_visibility not in ('public', 'restricted', 'private') then
    raise exception 'invalid_visibility';
  end if;
  if not public._community_valid_category(p_category) then
    raise exception 'invalid_category';
  end if;
  if not public._community_valid_domain(p_domain) then
    raise exception 'invalid_domain';
  end if;
  if p_posting_policy not in ('members', 'admins') then
    raise exception 'invalid_posting_policy';
  end if;
  if p_feed_policy not in ('members', 'admins') then
    raise exception 'invalid_feed_policy';
  end if;
  if v_rules is not null and char_length(v_rules) > 5000 then
    raise exception 'invalid_rules';
  end if;
  if coalesce(p_rules_required, false) and v_rules is null then
    raise exception 'rules_missing';
  end if;

  v_result := public.create_chat_group(
    p_name, p_description, case when p_visibility = 'restricted' then 'private' else p_visibility end,
    p_avatar_url, p_member_limit, p_invite_user_ids
  );
  v_id := (v_result ->> 'group_id')::uuid;

  update public.chat_groups
     set visibility = p_visibility, category = p_category, domain = p_domain, posting_policy = p_posting_policy, feed_policy = p_feed_policy,
         rules = v_rules, rules_required = coalesce(p_rules_required, false)
   where id = v_id;
  perform public._community_record_acceptance(v_id, v_actor);
  perform public._group_audit(v_id, btrim(p_name), v_actor, null, 'community_created',
    jsonb_build_object('category', p_category, 'domain', p_domain, 'visibility', p_visibility));
  return v_result || jsonb_build_object('visibility', p_visibility);
end;
$$;

revoke execute on function public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean, text) from public, anon;
grant execute on function public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean, text) to authenticated;

create or replace function public.community_domains(p_ids uuid[])
returns table (id uuid, domain text)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.domain
    from public.chat_groups g
   where g.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:100])
     and g.domain is not null
     and public.can_see_community_card(g.id);
$$;
revoke execute on function public.community_domains(uuid[]) from public;
grant execute on function public.community_domains(uuid[]) to anon, authenticated;

-- `update_community` (önceki tanım 20260929110000): `domain` anahtarı.
create or replace function public.update_community(p_group_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_category text;
  v_domain text;
  v_feed text;
  v_rules text;
  v_required boolean;
  v_version integer;
  v_changed text[] := '{}';
  v_key text;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('category', 'domain', 'feed_policy', 'rules', 'rules_required') then
      raise exception 'invalid_patch';
    end if;
  end loop;
  if public._group_member_role(p_group_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  v_category := g.category; v_domain := g.domain; v_feed := g.feed_policy; v_rules := g.rules; v_required := g.rules_required; v_version := g.rules_version;

  if p_patch ? 'category' or p_patch ? 'domain' or p_patch ? 'feed_policy' then
    perform public._group_require_cap(p_group_id, v_actor, 'edit_settings');
  end if;
  if p_patch ? 'rules' or p_patch ? 'rules_required' then
    perform public._group_require_cap(p_group_id, v_actor, 'edit_rules');
  end if;

  if p_patch ? 'category' then
    if jsonb_typeof(p_patch -> 'category') <> 'string' or not public._community_valid_category(p_patch ->> 'category') then
      raise exception 'invalid_category';
    end if;
    v_category := p_patch ->> 'category';
    if v_category <> g.category then v_changed := array_append(v_changed, 'category'); end if;
  end if;
  if p_patch ? 'domain' then
    if jsonb_typeof(p_patch -> 'domain') not in ('string', 'null') or not public._community_valid_domain(p_patch ->> 'domain') then
      raise exception 'invalid_domain';
    end if;
    v_domain := p_patch ->> 'domain';
    if v_domain is distinct from g.domain then v_changed := array_append(v_changed, 'domain'); end if;
  end if;
  if p_patch ? 'feed_policy' then
    if jsonb_typeof(p_patch -> 'feed_policy') <> 'string' or (p_patch ->> 'feed_policy') not in ('members', 'admins') then
      raise exception 'invalid_feed_policy';
    end if;
    v_feed := p_patch ->> 'feed_policy';
    if v_feed <> g.feed_policy then v_changed := array_append(v_changed, 'feed_policy'); end if;
  end if;
  if p_patch ? 'rules' then
    if jsonb_typeof(p_patch -> 'rules') not in ('string', 'null') then
      raise exception 'invalid_rules';
    end if;
    v_rules := nullif(btrim(coalesce(p_patch ->> 'rules', '')), '');
    if v_rules is not null and char_length(v_rules) > 5000 then
      raise exception 'invalid_rules';
    end if;
    if v_rules is distinct from g.rules then
      v_changed := array_append(v_changed, 'rules');
      v_version := g.rules_version + 1;
    end if;
  end if;
  if p_patch ? 'rules_required' then
    if jsonb_typeof(p_patch -> 'rules_required') <> 'boolean' then
      raise exception 'invalid_patch';
    end if;
    v_required := (p_patch ->> 'rules_required')::boolean;
    if v_required <> g.rules_required then v_changed := array_append(v_changed, 'rules_required'); end if;
  end if;
  if v_required and v_rules is null then
    raise exception 'rules_missing';
  end if;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('changed', false);
  end if;

  update public.chat_groups
     set category = v_category, domain = v_domain, feed_policy = v_feed, rules = v_rules, rules_required = v_required, rules_version = v_version
   where id = p_group_id;
  perform public._group_audit(p_group_id, g.name, v_actor, null, 'community_updated',
    jsonb_build_object('changed', to_jsonb(v_changed), 'rules_version', v_version));

  -- Kural metni değişti ve kabul zorunluysa üyeler haberdar edilir (önemli düzey; yeniden kabul beklenir, üyelik düşmez).
  if 'rules' = any (v_changed) and v_required then
    perform public._community_notify_members(p_group_id, v_actor, 'important',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğunun kuralları güncellendi.',
      '/communities/local?id=' || p_group_id || '&tab=about',
      'crules:' || p_group_id || ':' || v_version || ':', '');
  end if;
  return jsonb_build_object('changed', true, 'changed_fields', to_jsonb(v_changed), 'rules_version', v_version);
end;
$$;

-- Süzgeç: amaç ya da alan kimliği (önceki tanımlar 20260920080000 / 20260920130000).
create or replace function public.discover_communities(
  p_query text default null,
  p_sort text default 'popular',
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(btrim(left(coalesce(p_query, ''), 100)), '') as term
  )
  select g.id, g.name, g.description, g.avatar_url, g.category, g.member_count, g.member_limit, g.post_count,
         (select count(*)::integer from public.community_events e
           where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) as upcoming_event_count,
         g.rules_required, g.created_at,
         greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) as last_activity_at,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end as my_status
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    cross join q
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where g.visibility = 'public'
     and g.closed_at is null
     and (p_category is null or g.category = p_category or g.domain = p_category)
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       q.term is null
       or g.name ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or g.description ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by
     case when p_sort = 'newest' then extract(epoch from g.created_at) end desc nulls last,
     case when p_sort = 'active' then extract(epoch from greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id))) end desc nulls last,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

create or replace function public.search_communities(
  p_query text,
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text
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
         case when g.visibility = 'public' or m.user_id is not null then g.post_count end as post_count,
         case when g.visibility = 'public' or m.user_id is not null then
           (select count(*)::integer from public.community_events e
             where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) end as upcoming_event_count,
         g.rules_required, g.created_at,
         case when g.visibility = 'public' or m.user_id is not null then
           greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) end as last_activity_at,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end as my_status
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    cross join pat
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where pat.term is not null
     and g.visibility in ('public', 'restricted')
     and g.closed_at is null
     and (p_category is null or g.category = p_category or g.domain = p_category)
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       g.name ilike '%' || pat.esc || '%'
       or g.description ilike '%' || pat.esc || '%'
     )
   order by
     case when lower(g.name) = lower(pat.term) then 0 when g.name ilike pat.esc || '%' then 1 else 2 end,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

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
     and (p_category is null or g.category = p_category or g.domain = p_category)
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

-- İlgi puanı (önceki tanım 20261208100000): alan sinyali.
create or replace function public._community_relevance(p_user uuid)
returns table (community_id uuid, score double precision, reason text)
language sql
stable
security definer
set search_path = public
as $$
  with ints as (
    select term from public._interest_terms(p_user)
  ), mydom as (
    select distinct public.interest_domain(x) as domain
      from public.profiles pr, unnest(coalesce(pr.interests, '{}'::text[])) x
     where pr.id = p_user and public.interest_domain(x) is not null
  ), mine as (
    select g2.category, count(*)::integer as n
      from public.conversation_members m2
      join public.chat_groups g2 on g2.id = m2.conversation_id
     where m2.user_id = p_user and g2.category <> 'general'
     group by g2.category
  ), sig as (
    select g.id, g.member_count,
           coalesce(mine.n, 0) as cat_n,
           (g.domain is not null and exists (select 1 from mydom where mydom.domain = g.domain))::integer as dom_hit,
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
          + 3 * s.dom_hit
          + 1.5 * least(s.tag_hits, 3)
          + 1.5 * least(s.followed_members, 3)
          + 0.5 * least(s.recent_posts, 5)
          + least(0.5 * ln(1 + s.engagement), 1.5)
          + ln((1 + s.member_count)::double precision))::double precision,
         case
           when s.followed_members > 0 then 'followed'
           when s.tag_hits > 0 or s.text_hits > 0 or s.dom_hit > 0 then 'interest'
           when s.cat_n > 0 then 'category'
           else 'popular'
         end
    from sig s;
$$;
