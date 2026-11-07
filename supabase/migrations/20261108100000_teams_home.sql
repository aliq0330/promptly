-- Ekipler başlığı (docs/history/350-*): "Tamamen kapalı" topluluk = ekip; üye olunan ekiplerin tek listesi.
-- Yalnız EKLER (yeni fonksiyon); mevcut `list_my_communities` aynen kalır. Kararlar SUNUCUDA: ekip = `visibility = 'private'` ve ÜYE olduğum topluluk
-- (üye olmayan ekibin varlığı sızmaz), okunmamış sayı `group_unread_counts` ile okuma anında, Space sayısı yalnız çağıranın okuyabildiği
-- ekip Space'leridir (arşivlenmemiş; `can_read_space` — ekibe bağlı Space'i her ekip üyesi okur, yine de kural tek yerde kalsın).
create or replace function public.list_my_teams(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, member_count integer, closed boolean, created_at timestamptz,
  last_activity_at timestamptz, my_role text, unread_count integer, space_count integer, pending_request_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, g.avatar_url, g.member_count, g.closed_at is not null as closed, g.created_at,
         greatest(c.last_message_at,
                  (select max(p.created_at) from public.community_posts p where p.community_id = g.id),
                  (select max(s.updated_at) from public.spaces s where s.community_id = g.id)) as last_activity_at,
         m.role as my_role,
         coalesce((select u.unread_count from public.group_unread_counts(array[g.id]) u), 0) as unread_count,
         (select count(*)::integer from public.spaces s
           where s.community_id = g.id and s.archived_at is null and public.can_read_space(s.id)) as space_count,
         case when public._group_can(g.id, auth.uid(), 'manage_requests') then g.pending_request_count else 0 end as pending_request_count
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
   where auth.uid() is not null
     and g.visibility = 'private'
   order by greatest(c.last_message_at,
                     (select max(p.created_at) from public.community_posts p where p.community_id = g.id),
                     (select max(s.updated_at) from public.spaces s where s.community_id = g.id)) desc nulls last,
            g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 30), 100), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

revoke execute on function public.list_my_teams(integer, integer) from public, anon;
grant execute on function public.list_my_teams(integer, integer) to authenticated;
