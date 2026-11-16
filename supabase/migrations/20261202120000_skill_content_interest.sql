-- "İlgimi çekiyor / çekmiyor" Skill için de (docs/history/408-*): `content_interest.skill_id` beşinci hedef; `set_content_interest` Skill'i kabul eder;
-- `for_you_page` cevaplanan Skill'i bir daha göstermez, "çekiyor" Skill'in etiketleri artı, "çekmiyor" olanın etiketleri eksi sinyaldir ve aynı yazardan ≥2 "çekmiyor" yazarı geriye düşürür
-- (prompt/istek/workflow/ayar paketiyle AYNI kurallar). Keşfet/`feed_page` kişiselleşmez. Yalnız ekleyici + işlev yeniden yazımı; veri silinmez.
-- ci:allow-destructive — yalnız `content_interest_exactly_one_target` CHECK'i beşinci sütunla yeniden kurulur (genişler).
alter table public.content_interest add column if not exists skill_id uuid references public.skills (id) on delete cascade;
alter table public.content_interest drop constraint if exists content_interest_exactly_one_target;
alter table public.content_interest add constraint content_interest_exactly_one_target check (num_nonnulls(prompt_id, request_id, workflow_id, preset_id, skill_id) = 1);
create unique index if not exists content_interest_skill_uidx on public.content_interest (user_id, skill_id) where skill_id is not null;
create index if not exists content_interest_skill_idx on public.content_interest (skill_id) where skill_id is not null;

create or replace function public.set_content_interest(p_kind text, p_id uuid, p_value text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ok boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_kind not in ('prompt', 'request', 'workflow', 'preset', 'skill') or p_id is null or (p_value is not null and p_value not in ('interested', 'not_interested')) then
    raise exception 'invalid_interest';
  end if;

  v_ok := case p_kind
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.author_id <> v_user)
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.author_id <> v_user)
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.creator_id <> v_user)
    when 'skill' then exists (select 1 from public.skills x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.author_id <> v_user)
    else exists (select 1 from public.presets x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.creator_id <> v_user)
  end;
  if not v_ok then
    raise exception 'content_not_found';
  end if;

  perform public._rate_limit('content_interest', 200, interval '1 hour');

  if p_value is null then
    if p_kind = 'prompt' then delete from public.content_interest where user_id = v_user and prompt_id = p_id;
    elsif p_kind = 'request' then delete from public.content_interest where user_id = v_user and request_id = p_id;
    elsif p_kind = 'workflow' then delete from public.content_interest where user_id = v_user and workflow_id = p_id;
    elsif p_kind = 'skill' then delete from public.content_interest where user_id = v_user and skill_id = p_id;
    else delete from public.content_interest where user_id = v_user and preset_id = p_id;
    end if;
    return null;
  end if;

  if p_kind = 'prompt' then
    insert into public.content_interest (user_id, prompt_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, prompt_id) where prompt_id is not null do update set value = excluded.value, updated_at = now();
  elsif p_kind = 'request' then
    insert into public.content_interest (user_id, request_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, request_id) where request_id is not null do update set value = excluded.value, updated_at = now();
  elsif p_kind = 'workflow' then
    insert into public.content_interest (user_id, workflow_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, workflow_id) where workflow_id is not null do update set value = excluded.value, updated_at = now();
  elsif p_kind = 'skill' then
    insert into public.content_interest (user_id, skill_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, skill_id) where skill_id is not null do update set value = excluded.value, updated_at = now();
  else
    insert into public.content_interest (user_id, preset_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, preset_id) where preset_id is not null do update set value = excluded.value, updated_at = now();
  end if;
  return p_value;
end;
$$;

revoke all on function public.set_content_interest(text, uuid, text) from public, anon;
grant execute on function public.set_content_interest(text, uuid, text) to authenticated;

create or replace function public.for_you_page(p_as_of timestamp with time zone, p_kinds text[], p_content_type text, p_category text, p_subcategory text, p_limit integer, p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint, reason_kind text, reason_ref text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id, l.skill_id
      from public.prompt_likes l, params pr
     where l.user_id = pr.me
     order by l.created_at desc
     limit 300
  ),
  -- Açık geri bildirim (docs/history/275-*): "İlgimi çekiyor / çekmiyor" — son 300 cevap sinyal olur; cevaplanan gönderinin kendisi her durumda elenir (aşağıda).
  my_int as (
    select ci.prompt_id, ci.request_id, ci.workflow_id, ci.preset_id, ci.skill_id, ci.value
      from public.content_interest ci, params pr
     where ci.user_id = pr.me
     order by ci.created_at desc
     limit 300
  ),
  -- Beğenilen etiketler + "ilgimi çekiyor" dediklerin (aynı hafif artı sinyal).
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
  -- "İlgimi çekmiyor" dediklerin etiketleri: eşleşen her etiket küçük bir eksi puandır (tek bir "hayır" bir etiketi öldürmez).
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
  -- Aynı yazarın en az 2 gönderisine "ilgimi çekmiyor" dediysen o yazar geriye düşer (tek bir cevap kişiyi cezalandırmaz).
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
  ),
  -- Zaten ilgilendiklerin: koleksiyonlarına kaydettiklerin ve son 60 günde kopyaladıkların tekrar önüne çıkmaz.
  saved as (
    select ci.prompt_id, ci.workflow_id, ci.preset_id, ci.skill_id
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
           (select count(*) from public.prompt_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.prompt_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.prompts x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
       and (x.origin_type = 'original' or x.show_on_profile)
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
           (select min(tg.tag_slug) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id) as lt_n,
           (select count(*) from public.prompt_request_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.request_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.prompt_requests x, params pr
     where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
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
           (select min(tg.tag_slug) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id) as lt_n,
           (select count(*) from public.workflow_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.workflow_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = any (x.content_types) and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.workflows x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
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
           (select min(tg.tag_slug) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id) as lt_n,
           (select count(*) from public.preset_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.preset_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.presets x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
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
    -- Skill (docs/history/406-*): yayında + herkese açık; etiketi takip/beğeni sinyali olur. İlgi alanı eşlemesi ve araç sinyali Skill'de yoktur (kendi katalogları var);
    -- "İlgimi çekiyor / çekmiyor" Skill için de verilir (docs/history/408-*): cevaplanan, beğenilen ya da kaydedilen Skill tekrar önüne çıkmaz.
    select 'skill'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.use_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.skill_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.skill_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.skill_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.skill_id = x.id) as lt_n,
           (select count(*) from public.skill_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.skill_id = x.id) as dt_n,
           null::text as im,
           null::text as ftool
      from public.skills x, params pr
     where x.status = 'published' and x.visibility = 'public'
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
$function$;
