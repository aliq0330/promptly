-- Grup/topluluk sohbetinde okunmamış sayısı OKUMA anında hesaplanır (docs/history/258-*).
--
-- Neden: `handle_new_message` her yeni mesajda sohbetin TÜM diğer üyelerinin `conversation_members.unread_count` değerini artırıyordu.
-- 100 000 üyeli bir toplulukta her mesaj 100 000 satır güncellemesi (+ her üyeye Realtime olayı + tüm sohbet listesinin yeniden okunması) demek;
-- eşzamanlı mesajlar birbirini bekler, zaman aşımına düşer. Şimdi:
--   * birebir sohbette (2 üye) sayaç eskisi gibi tetikleyiciyle artar (ucuz);
--   * grupta tetikleyici yalnız `conversations.last_message_at`'i günceller (tek satır); okunmamış sayısı `group_unread_counts` ile
--     üyenin `last_read_at` imlecinden (ve `cleared_at` / `joined_at`) en çok 100'e kadar sayılır.
-- Yalnızca ekleyici/değiştirici: `create or replace` AYNI imza (+ 1 yeni fonksiyon), `drop` yok. Grup üyelerinin eski `unread_count` değerleri
-- artık güncellenmez (istemci grup için bu sütunu OKUMAZ; `mark_conversation_read_up_to` yazmaya devam eder, zararsız).

create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  if exists (select 1 from public.conversations c where c.id = new.conversation_id and coalesce(c.kind, 'direct') <> 'group') then
    update public.conversation_members
       set unread_count = unread_count + 1
     where conversation_id = new.conversation_id
       and user_id <> new.sender_id;
  end if;

  return new;
end;
$$;

-- Çağıranın grup üyeliklerinde okunmamış mesaj sayısı (en çok 100; istemci "99+" gösterir). Yalnız KENDİ üyeliği: başkasının sayısı sorulamaz.
create or replace function public.group_unread_counts(p_ids uuid[])
returns table (conversation_id uuid, unread_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select m.conversation_id,
         (select count(*)::integer
            from (select 1
                    from public.messages x
                   where x.conversation_id = m.conversation_id
                     and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz)
                     and x.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
                     and x.created_at >= m.joined_at
                     and x.sender_id is distinct from m.user_id
                     and x.deleted_at is null
                   limit 100) s) as unread_count
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
   where m.user_id = auth.uid()
     and c.kind = 'group'
     and m.conversation_id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

revoke execute on function public.group_unread_counts(uuid[]) from public, anon;
grant execute on function public.group_unread_counts(uuid[]) to authenticated;

-- Benim topluluklarım: `unread_count` artık hesaplanır (aynı imza ve sıra; yalnız o sütunun kaynağı değişti).
create or replace function public.list_my_communities(
  p_scope text default 'member',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, closed boolean, created_at timestamptz, last_activity_at timestamptz,
  my_role text, unread_count integer, pending_request_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit, g.post_count,
         (select count(*)::integer from public.community_events e
           where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) as upcoming_event_count,
         g.closed_at is not null as closed, g.created_at,
         greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) as last_activity_at,
         m.role as my_role,
         case when m.user_id is not null then coalesce((select u.unread_count from public.group_unread_counts(array[g.id]) u), 0) else 0 end as unread_count,
         case when m.user_id is not null and public._group_can(g.id, auth.uid(), 'manage_requests') then g.pending_request_count else 0 end as pending_request_count
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
   where auth.uid() is not null
     and (
       (p_scope = 'member' and m.user_id is not null)
       or (p_scope = 'managed' and m.role in ('owner', 'admin', 'moderator'))
     )
   order by greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) desc nulls last,
            g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 30), 100), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;
