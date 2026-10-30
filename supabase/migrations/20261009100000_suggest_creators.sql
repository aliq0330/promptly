-- "Takip edilecek kişiler" şeridi (docs/history/285-*): Ana Sayfa'da gönderilerin arasına giren kişi önerisi.
--
-- YALNIZCA EKLEYİCİ: yeni tablo + iki yeni RPC; var olan hiçbir nesneye dokunulmaz, `drop table/column/function` yok.
-- Eski istemci etkilenmez (yeni istemci bu RPC'leri çağırır; yoksa şerit hiç çizilmez, akış eskisi gibi sürer).
--
--   * `creator_suggestion_dismissals`: kişinin şeritte ✕ ile "önerme" dediği kişiler (kişi başına en çok 500, en yeni kalır).
--     Yalnız sahibi okur; istemci yazamaz — yazma yalnız `dismiss_creator_suggestion` RPC'sidir.
--   * `dismiss_creator_suggestion(p_creator)`: SECURITY DEFINER; oturum, var olan başka bir profil, saatte ≤120 (`_rate_limit`).
--   * `suggest_creators(p_limit)`: SECURITY INVOKER (RLS atlanmaz). Çağıranın kendisi, zaten takip ettikleri, engel ilişkisi olanlar
--     (iki yönlü), askıdakiler ve ✕ ile kapattıkları ASLA gelmez; son 90 günde herkese açık (yayında, topluluğa ait olmayan) en az bir
--     gönderisi olmayan profil de gelmez (boş profil takip ettirmez). Puan (yüksek önce):
--       - takip ettiklerimin takip ettiği kişi: 300 + 100 × ortak sayısı (en çok 4)            → neden `mutual`
--       - beğendiğim gönderilerin (son 300) yazarı: 150 + 30 × beğeni sayısı (en çok 5)         → neden `liked`
--       - takip ettiğim etiketle (son 90 gün) üreten: 120 × eşleşen etiket (en çok 3)             → neden `tag`
--       - takip ettiğim AI aracıyla (son 90 gün) üreten: 100                                      → neden `tool`
--       - yedek (herkese): 30 × ln(1 + takipçi) (en çok 120) + 100 × exp(−son gönderiden gün / 30) → neden `active`
--     Sinyali olmayan yeni kullanıcı/misafir-benzeri hesap için yedek puan tek başına sıralar. Sıra deterministiktir
--     (puan, kimlik); tekrar azaltma ve şerit boyu istemcidedir (`reduceRepeatedSuggestions`).
--     Dönüş yalnız kimlik + neden; profil alanları istemcide `profiles`'tan okunur (RLS: herkese açık).

create table if not exists public.creator_suggestion_dismissals (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, creator_id),
  constraint creator_suggestion_dismissals_not_self check (user_id <> creator_id)
);

create index if not exists creator_suggestion_dismissals_user_recent_idx on public.creator_suggestion_dismissals (user_id, created_at desc);
-- Profil silinince CASCADE'in tarama yapmaması için.
create index if not exists creator_suggestion_dismissals_creator_idx on public.creator_suggestion_dismissals (creator_id);

alter table public.creator_suggestion_dismissals enable row level security;
revoke all on public.creator_suggestion_dismissals from public, anon, authenticated;
grant select on public.creator_suggestion_dismissals to authenticated;
drop policy if exists "creator_suggestion_dismissals owner read" on public.creator_suggestion_dismissals;
create policy "creator_suggestion_dismissals owner read" on public.creator_suggestion_dismissals for select to authenticated using (user_id = auth.uid());
-- İstemci insert/update/delete politikası YOK: yazma yalnız aşağıdaki RPC.

create or replace function public.dismiss_creator_suggestion(p_creator uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_creator is null or p_creator = v_user or not exists (select 1 from public.profiles where id = p_creator) then
    raise exception 'invalid_creator';
  end if;

  perform public._rate_limit('dismiss_creator_suggestion', 120, interval '1 hour');

  insert into public.creator_suggestion_dismissals (user_id, creator_id) values (v_user, p_creator)
    on conflict (user_id, creator_id) do nothing;

  -- Kişi başına en yeni 500 kapatma kalır (tablo büyümesin).
  delete from public.creator_suggestion_dismissals d
   where d.user_id = v_user
     and d.creator_id in (
       select x.creator_id from public.creator_suggestion_dismissals x where x.user_id = v_user order by x.created_at desc, x.creator_id desc offset 500
     );
end;
$$;

revoke all on function public.dismiss_creator_suggestion(uuid) from public, anon;
grant execute on function public.dismiss_creator_suggestion(uuid) to authenticated;

create or replace function public.suggest_creators(p_limit integer default 12)
returns table (id uuid, reason_kind text, reason_ref text, reason_count integer, score bigint)
language sql
stable
security invoker
set search_path = public
as $$
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
         where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null
           and (p.origin_type = 'original' or p.show_on_profile) and p.created_at > now() - interval '90 days'
        union all
        select r.author_id, r.created_at from public.prompt_requests r
         where not r.is_draft and r.visibility = 'public' and r.deleted_at is null and r.community_id is null and r.created_at > now() - interval '90 days'
        union all
        select w.creator_id, w.created_at from public.workflows w
         where w.status = 'published' and w.visibility = 'public' and w.community_id is null and w.created_at > now() - interval '90 days'
        union all
        select s.creator_id, s.created_at from public.presets s
         where s.status = 'published' and s.visibility = 'public' and s.community_id is null and s.created_at > now() - interval '90 days'
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
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id
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
       and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.created_at > now() - interval '90 days'
     group by p.author_id
  ),
  tool_hits as (
    select p.author_id as uid, min(ft.tool_id) as ref
      from public.prompts p
      join ftools ft on exists (select 1 from unnest(p.tools) r where split_part(r, ':', 1) = ft.tool_id)
     where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.created_at > now() - interval '90 days'
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
$$;

comment on function public.suggest_creators(integer) is
  '"Takip edilecek kişiler" şeridi: çağıranın sinyallerine göre sıralı, takip edilmeyen/engelsiz/kapatılmamış kişiler (docs/history/285-*). Anon çağıramaz.';

revoke all on function public.suggest_creators(integer) from public, anon;
grant execute on function public.suggest_creators(integer) to authenticated;
