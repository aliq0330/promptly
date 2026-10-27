-- Hikâye görüntüleyenleri sayfalı (docs/history/258-*): `story_viewers(uuid)` en yeni 500'de kesiyordu (100 000 görüntülemeli hikâyede
-- sahibi listenin geri kalanına ulaşamıyordu) ve sheet açıkken 20 sn'de bir tüm 500 satırı yeniden okuyordu. Yeni aşırı yükleme
-- `story_viewers(uuid, integer, integer)`: limit (1–100) + offset; eski imza değişmeden kalır (eski istemci çalışır).
-- Yalnızca ekleyici: yeni fonksiyon, `drop` yok. Yalnız hikâyenin SAHİBİ satır alır (join `s.author_id = auth.uid()`).

create or replace function public.story_viewers(p_story_id uuid, p_limit integer, p_offset integer)
returns table (
  viewer_id uuid, username text, display_name text, avatar_url text,
  first_viewed_at timestamptz, last_viewed_at timestamptz, view_count integer, reaction text
)
language sql
stable
security definer
set search_path = public
as $$
  select v.viewer_id, p.username, p.display_name, p.avatar_url, v.first_viewed_at, v.last_viewed_at, v.view_count, r.emoji
    from public.story_views v
    join public.stories s on s.id = v.story_id and s.author_id = auth.uid()
    join public.profiles p on p.id = v.viewer_id
    left join public.story_reactions r on r.story_id = v.story_id and r.user_id = v.viewer_id
   where v.story_id = p_story_id
   order by v.last_viewed_at desc, v.viewer_id
   limit greatest(least(coalesce(p_limit, 50), 100), 1)
   offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.story_viewers(uuid, integer, integer) from public, anon;
grant execute on function public.story_viewers(uuid, integer, integer) to authenticated;
