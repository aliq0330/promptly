-- Ortak ALAN sözlüğü (docs/history/426-*): ilgi alanı, Skill uzmanlık alanı ve prompt kategorileri AYNI "konu" kavramını tek tabloda paylaşır.
-- Üç ayrı eksen karışmıştı: ortam (görsel/metin/ses/video; prompt taksonomisi), konu/alan (Skill listesi, 9 sabit ilgi alanı) ve amaç (topluluk).
-- Burada yalnız "konu/alan" ekseni birleşir; ortam taksonomisi olduğu gibi kalır. Genişle → daralt (expand → contract): hiçbir sütun/işlev silinmez.
--   1) `domains`: 14 alan (Skill'in 8'i + ilgi alanlarının karşılıkları). Skill uzmanlık alanı bunun alt kümesidir (`skill_categories.id → domains.id`).
--   2) `taxonomy_category_domains`: prompt kategorisi → alan eşlemesi (bir kategori birden çok alana ait olabilir; kategori '*' = türün tamamı).
--   3) `interest_domain(text)`: eski Türkçe ilgi alanı değerlerini alana çözer (eski istemciler yazmaya devam etse de çalışır); `profiles.interests` bir kez alan kimliğine çevrilir.
--   4) `for_you_page`: elle yazılmış `imap` listesi yerine `taxonomy_category_domains`; Skill de aynı alandan ilgi sinyali alır.
--   5) Topluluk ilgi puanı/keşif akışı: ilgi alanı artık alan etiketlerinin kelimelerinden terim üretir (`_interest_terms`).
-- Topluluğun kendi alanı (chat_groups.domain) ve topluluk amacı ayrı bir adımdır.
create table if not exists public.domains (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  label_tr text not null check (char_length(label_tr) between 1 and 40),
  label_en text not null check (char_length(label_en) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.domains (id, label_tr, label_en, position) values
  ('art', 'Sanat & İllüstrasyon', 'Art & Illustration', 10),
  ('photography', 'Fotoğrafçılık', 'Photography', 20),
  ('design', 'Tasarım', 'Design', 30),
  ('software', 'Yazılım', 'Software', 40),
  ('writing', 'Yazarlık', 'Writing', 50),
  ('marketing', 'Pazarlama', 'Marketing', 60),
  ('business', 'İş', 'Business', 70),
  ('education', 'Eğitim', 'Education', 80),
  ('research', 'Araştırma', 'Research', 90),
  ('data', 'Veri', 'Data', 100),
  ('music-audio', 'Müzik & Ses', 'Music & Audio', 110),
  ('video', 'Video & Animasyon', 'Video & Animation', 120),
  ('game-3d', 'Oyun & 3D', 'Games & 3D', 130),
  ('productivity', 'Üretkenlik', 'Productivity', 140)
on conflict (id) do nothing;
alter table public.domains enable row level security;
drop policy if exists "Domains are public" on public.domains;
create policy "Domains are public" on public.domains for select using (true);
revoke all on public.domains from public, anon, authenticated;
grant select on public.domains to anon, authenticated;

-- Skill uzmanlık alanı ortak sözlüğün alt kümesidir: yeni Skill alanı önce alan olarak vardır.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'skill_categories_domain_fkey') then
    alter table public.skill_categories add constraint skill_categories_domain_fkey foreign key (id) references public.domains (id) on update cascade;
  end if;
end $$;

create table if not exists public.taxonomy_category_domains (
  content_type text not null check (content_type in ('image', 'text', 'audio', 'video')),
  category text not null check (char_length(category) between 1 and 80),
  domain text not null references public.domains (id) on update cascade on delete cascade,
  primary key (content_type, category, domain)
);
create index if not exists taxonomy_category_domains_domain_idx on public.taxonomy_category_domains (domain);
insert into public.taxonomy_category_domains (content_type, category, domain) values
  ('image', 'human_character', 'art'), ('image', 'art_illustration', 'art'), ('image', 'style', 'art'), ('image', 'nature_environment', 'art'),
  ('image', 'photography', 'photography'),
  ('image', 'design', 'design'), ('image', 'product_commercial', 'design'), ('image', 'spaces', 'design'),
  ('text', 'coding', 'software'),
  ('text', 'writing', 'writing'), ('video', 'story_entertainment', 'writing'),
  ('text', 'marketing', 'marketing'), ('text', 'social_media', 'marketing'), ('text', 'seo', 'marketing'),
  ('video', 'advertising', 'marketing'), ('video', 'social_media', 'marketing'), ('video', 'product_commercial', 'marketing'),
  ('text', 'business_professional', 'business'),
  ('text', 'education', 'education'), ('video', 'education', 'education'),
  ('text', 'research', 'research'), ('video', 'documentary', 'research'),
  ('audio', '*', 'music-audio'), ('video', 'music_video', 'music-audio'),
  ('video', 'cinematic', 'video'), ('video', 'animation', 'video'), ('video', 'visual_effects', 'video'), ('video', '*', 'video'),
  ('image', 'human_character', 'game-3d'), ('image', 'style', 'game-3d'), ('video', 'animation', 'game-3d')
on conflict do nothing;
alter table public.taxonomy_category_domains enable row level security;
drop policy if exists "Taxonomy category domains are public" on public.taxonomy_category_domains;
create policy "Taxonomy category domains are public" on public.taxonomy_category_domains for select using (true);
revoke all on public.taxonomy_category_domains from public, anon, authenticated;
grant select on public.taxonomy_category_domains to anon, authenticated;

-- Eski (Türkçe) ilgi alanı değeri → alan kimliği; alan kimliği olduğu gibi döner; bilinmeyen null.
create or replace function public.interest_domain(p_value text)
returns text
language sql
stable
set search_path = public
as $$
  select case btrim(coalesce(p_value, ''))
    when 'Dijital Sanat' then 'art'
    when 'Fotoğrafçılık' then 'photography'
    when 'Grafik Tasarım' then 'design'
    when 'Yazılım ve Kodlama' then 'software'
    when 'Hikaye ve Yaratıcı Yazarlık' then 'writing'
    when 'Video Üretimi' then 'video'
    when 'Müzik ve Ses' then 'music-audio'
    when '3D Tasarım' then 'game-3d'
    when 'Oyun Geliştirme' then 'game-3d'
    else (select d.id from public.domains d where d.id = btrim(p_value))
  end;
$$;
grant execute on function public.interest_domain(text) to anon, authenticated;

-- Profildeki ilgi alanları bir kez alan kimliğine çevrilir (ilk görülme sırası korunur, yinelenenler birleşir, tanınmayanlar düşer).
update public.profiles p
   set interests = coalesce((
     select array_agg(d order by first_pos)
       from (
         select public.interest_domain(i) as d, min(ord) as first_pos
           from unnest(p.interests) with ordinality as u(i, ord)
          group by public.interest_domain(i)
       ) x
      where d is not null
   ), '{}'::text[])
 where exists (select 1 from unnest(p.interests) i where i is distinct from public.interest_domain(i));

-- Topluluk ilgi puanı için ilgi alanından terimler: alan etiketlerinin (TR + EN) en az 4 harfli kelimeleri.
create or replace function public._interest_terms(p_user uuid)
returns table (term text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct w.word
    from (
      select distinct public.interest_domain(i) as domain
        from public.profiles pr, unnest(coalesce(pr.interests, '{}'::text[])) i
       where pr.id = p_user
    ) md
    join public.domains dm on dm.id = md.domain
    cross join lateral regexp_split_to_table(lower(dm.label_tr || ' ' || dm.label_en), '[\s&/,.\-]+') as w(word)
   where char_length(w.word) >= 4;
$$;
revoke execute on function public._interest_terms(uuid) from public, anon, authenticated;

-- `for_you_page`: ilgi alanı eşlemesi veridedir (önceki tanım 20261202120000).
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
  -- Profil ilgi alanı = ortak ALAN sözlüğü (`domains`; docs/history/426-*). `profiles.interests` alan kimliği taşır (eski Türkçe değerler `interest_domain` ile aynı alana çözülür);
  -- alan → içerik türü/kategori eşlemesi veridedir (`taxonomy_category_domains`, kategori '*' = türün tamamı), SQL'e gömülü liste YOKTUR.
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
    -- Skill (docs/history/406-*): yayında + herkese açık; etiketi takip/beğeni sinyali olur. Uzmanlık alanı ortak ALAN sözlüğündendir (docs/history/426-*): ilgi alanıyla aynı alandaki Skill "ilgi alanı" sinyali alır; araç sinyali Skill'de yoktur;
    -- "İlgimi çekiyor / çekmiyor" Skill için de verilir (docs/history/408-*): cevaplanan, beğenilen ya da kaydedilen Skill tekrar önüne çıkmaz.
    select 'skill'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.use_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.skill_tags tg where tg.skill_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.skill_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.skill_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.skill_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.skill_id = x.id) as lt_n,
           (select count(*) from public.skill_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.skill_id = x.id) as dt_n,
           (select min(d.domain) from my_domains d where d.domain = x.category) as im,
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


-- Topluluk ilgi puanı (önceki tanım 20260920130000): ilgi alanı terimleri `_interest_terms`'ten.
create or replace function public._community_relevance(p_user uuid)
returns table (community_id uuid, score double precision, reason text)
language sql
stable
security definer
set search_path = public
as $$
  with ints as (
    select term from public._interest_terms(p_user)
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
    select term from public._interest_terms(auth.uid())
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
