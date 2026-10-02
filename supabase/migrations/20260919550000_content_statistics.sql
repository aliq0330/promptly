-- Gönderi İstatistikleri (CLAUDE.md Bölüm 9.82) — bir gönderiyi (Prompt,
-- Prompt İsteği, Generator, Workflow) kimlerin beğendiği / yorumladığı /
-- kaydettiği, sayfalanmış olarak. YENİ TABLO YOK: mevcut `prompt_likes`,
-- `prompt_comments` ve `collection_items` (hepsi zaten dört içerik türü için
-- nullable hedef sütunlu) okunuyor.
--
-- Neden bir RPC: "kaydedenler" `collection_items` ⋈ `collections.owner_id`
-- üzerinden hesaplanır ve RLS bunu yalnızca herkese açık koleksiyonlar için
-- başkasına gösterir — oysa görünen `save_count` (Bölüm 9.78) özel
-- koleksiyonlara kaydedenleri de sayıyor; liste ile sayı tutarsız kalırdı.
-- Bu yüzden fonksiyon SECURITY DEFINER; ama yalnızca (1) çağıranın gönderiyi
-- zaten görebildiği durumda çalışır, (2) yalnızca herkese açık profil
-- alanlarını (kullanıcı adı, görünen ad, avatar, takipçi sayısı) döndürür —
-- koleksiyon adı/gizliliği, e-posta ve auth bilgisi asla dönmez.
--
-- Prompt İsteği için "kaydedenler" yoktur (istekler kaydedilemez) — boş döner.

create or replace function public._engager_content_visible(p_content_type text, p_content_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and (p.status = 'published' or p.author_id = auth.uid())
    )
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and (not r.is_draft or r.author_id = auth.uid())
    )
    when 'generator' then exists (
      select 1 from public.generators g
      where g.id = p_content_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid() or w.status = 'published')
    )
    else false
  end;
$$;

revoke all on function public._engager_content_visible(text, uuid) from public;

-- Keyset sayfalama: (interacted_at, actor_id) azalan; bir sonraki sayfa için
-- son satırın ikisi `p_before_at` / `p_before_actor` olarak geri verilir.
create or replace function public.content_engagers(
  p_content_type text,
  p_content_id uuid,
  p_kind text,
  p_limit integer default 20,
  p_before_at timestamptz default null,
  p_before_actor uuid default null
)
returns table (
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
  actor_follower_count integer,
  interacted_at timestamptz,
  comment_id uuid,
  comment_body text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_col text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_kind not in ('likes', 'comments', 'saves') then
    raise exception 'invalid kind';
  end if;

  v_col := case p_content_type
    when 'prompt' then 'prompt_id'
    when 'request' then 'request_id'
    when 'generator' then 'generator_id'
    when 'workflow' then 'workflow_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  -- Gönderiyi göremeyen biri hiçbir şey göremez; istekler kaydedilemez.
  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  if p_kind = 'saves' and p_content_type = 'request' then
    return;
  end if;

  if p_kind = 'likes' then
    return query execute format($q$
      select l.user_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             l.created_at, null::uuid, null::text
      from public.prompt_likes l
      left join public.profiles p on p.id = l.user_id
      where l.%I = $1
        and ($2 is null or (l.created_at, l.user_id) < ($2, $3))
      order by l.created_at desc, l.user_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  elsif p_kind = 'comments' then
    -- Kullanıcı başına TEK satır: o kullanıcının silinmemiş en son yorumu.
    return query execute format($q$
      select x.author_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             x.created_at, x.id, x.body
      from (
        select distinct on (c.author_id) c.author_id, c.created_at, c.id, c.body
        from public.prompt_comments c
        where c.%I = $1 and c.deleted_at is null
        order by c.author_id, c.created_at desc, c.id desc
      ) x
      left join public.profiles p on p.id = x.author_id
      where ($2 is null or (x.created_at, x.author_id) < ($2, $3))
      order by x.created_at desc, x.author_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  else
    -- Kaydeden = gönderiyi HERHANGİ bir koleksiyonuna eklemiş kullanıcı
    -- (Bölüm 9.38); aynı kişi birden çok koleksiyona eklediyse tek satır.
    return query execute format($q$
      select s.owner_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             s.saved_at, null::uuid, null::text
      from (
        select c.owner_id, max(ci.created_at) as saved_at
        from public.collection_items ci
        join public.collections c on c.id = ci.collection_id
        where ci.%I = $1
        group by c.owner_id
      ) s
      left join public.profiles p on p.id = s.owner_id
      where ($2 is null or (s.saved_at, s.owner_id) < ($2, $3))
      order by s.saved_at desc, s.owner_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;
  end if;
end;
$$;

revoke all on function public.content_engagers(text, uuid, text, integer, timestamptz, uuid) from public;
grant execute on function public.content_engagers(text, uuid, text, integer, timestamptz, uuid) to anon, authenticated;
