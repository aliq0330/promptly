-- Topluluklar ana sayfasının "Topluluklarım" rafı (docs/history/212-*): her topluluğun kapağında "N yeni" rozeti.
--
-- `my_community_unseen_counts()`: üyesi olduğum herkese açık + kapalı toplulukların (tamamen kapalı genel yüzeylere hiç girmez —
-- `member_feed_page` ile aynı kural) görmediğim gönderi sayısı. Sayılan gönderi: katıldıktan sonra ve son 30 günde paylaşılmış,
-- kendi gönderim değil, yazarı engelli değil, `community_post_views`'ta benim için satırı yok (görülme yolu
-- `mark_community_posts_seen`, ana sayfa akışı ve topluluk akışı yazar). Sayı 99'da kesilir; sıfır olan topluluk dönmez.
-- SECURITY INVOKER: gönderi okuma RLS'i (`can_read_community`) ve kendi görülme satırlarım politikası aynen geçerli; anon çağıramaz.
--
-- Yalnızca ekleyici: tek fonksiyon, `drop` yok.

create or replace function public.my_community_unseen_counts()
returns table (community_id uuid, unseen integer)
language sql
stable
security invoker
set search_path = public
as $$
  select p.community_id, least(count(*), 99)::integer as unseen
    from public.community_posts p
    join public.conversation_members m on m.conversation_id = p.community_id and m.user_id = auth.uid()
    join public.chat_groups g on g.id = p.community_id
   where auth.uid() is not null
     and g.visibility in ('public', 'restricted')
     and p.created_at >= greatest(m.joined_at, now() - interval '30 days')
     and p.author_id is distinct from auth.uid()
     and not public.is_blocked(p.author_id, auth.uid())
     and not exists (select 1 from public.community_post_views v where v.user_id = auth.uid() and v.post_id = p.id)
   group by p.community_id;
$$;

revoke all on function public.my_community_unseen_counts() from public, anon;
grant execute on function public.my_community_unseen_counts() to authenticated;
