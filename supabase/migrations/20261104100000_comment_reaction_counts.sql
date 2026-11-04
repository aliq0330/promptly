-- Yorum tepkileri — sayılar ve "takip ettiklerimden kim" (docs/history/327-*).
--
-- `comment_likes.reaction` 20261103120000 ile geldi; bu dosya gönderideki tepki arayüzünün (seçici, "Sen, Zeynep ve 3 kişi", "Tepkiler" listesi)
-- yorum için de çalışması için tepki başına sayıları ve takip edilen tepki verenleri okuyan iki salt-okunur RPC ekler. Yalnız EKLER; tablo/tetikleyici yok:
-- yorumda sayılar zaten yorum başına (≤ birkaç yüz beğeni) ve PK (comment_id, user_id) ile okunur, ayrı özet tablosu gerekmez.
-- İkisi de SECURITY INVOKER: `comment_likes` SELECT politikası yorumu okuyabilene açıktır, okunamayan yorum boş döner (RLS atlanmaz).

create or replace function public.comment_reaction_counts(p_ids uuid[])
returns table (target_id uuid, reaction text, n bigint)
language sql stable security invoker set search_path = public as $$
  select l.comment_id, l.reaction, count(*)::bigint
  from public.comment_likes l
  where l.comment_id = any (coalesce(p_ids[1:100], '{}'::uuid[]))
  group by l.comment_id, l.reaction
$$;

create or replace function public.comment_reaction_friends(p_ids uuid[], p_per integer default 2)
returns table (target_id uuid, user_id uuid, reaction text, username text, display_name text, avatar_url text)
language sql stable security invoker set search_path = public as $$
  select x.comment_id, x.user_id, x.reaction, p.username, p.display_name, p.avatar_url
  from (
    select l.comment_id, l.user_id, l.reaction,
           row_number() over (partition by l.comment_id order by l.created_at desc, l.user_id desc) as rn
    from public.comment_likes l
    join public.follows f on f.following_id = l.user_id and f.follower_id = auth.uid()
    where l.comment_id = any (coalesce(p_ids[1:60], '{}'::uuid[]))
  ) x
  join public.profiles p on p.id = x.user_id
  where x.rn <= least(greatest(p_per, 1), 5)
$$;

revoke all on function public.comment_reaction_counts(uuid[]) from public;
revoke all on function public.comment_reaction_friends(uuid[], integer) from public;
grant execute on function public.comment_reaction_counts(uuid[]) to anon, authenticated;
grant execute on function public.comment_reaction_friends(uuid[], integer) to anon, authenticated;
