-- Space sosyal katmanı CONTRACT (docs/history/460-*): 459'un ölü bıraktığı, YALNIZ Space'e ait ve başka fonksiyonlara dolanmamış
-- tablo/sütun/tetikleyiciler düşer. İstemci 459 ile yayında (kullanan kod yok). `prompt_comments.space_id/space_activity_id/rating`,
-- `content_quotes.space_id`, `prompt_likes.space_id`, `community_posts.space_id`, `spaces.quote_count/comment_count/like_count/shared_at`,
-- `space_activity.comment_count/author_note` ve `space_user_state.favorite` BİLEREK durur: feed_page, bildirim ve moderasyon
-- fonksiyonları adıyla anıyor; onları yeniden yazmadan düşürmek her yorum/beğeni yazımını riske atar.
-- ci:allow-destructive

-- 1. Bağlantı iptali artık anlamsız: spaces_after_update'ten çıkar (tablolar düşecek).
create or replace function public.spaces_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title then
    perform public._space_log(new.id, 'renamed', new.title, jsonb_build_object('before', old.title, 'after', new.title));
  end if;
  if new.visibility is distinct from old.visibility then
    perform public._space_log(new.id, 'visibility_changed', new.visibility, jsonb_build_object('before', old.visibility, 'after', new.visibility));
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform public._space_log(new.id, case when new.archived_at is null then 'unarchived' else 'archived' end, null);
  end if;
  return null;
end;
$$;
revoke execute on function public.spaces_after_update() from public, anon, authenticated;

-- 2. Etkinlik günlüğü okuması: "herkese açık etkinlik" ayarı kalktı → yalnız üyeler.
drop policy if exists "Readers read the activity log" on public.space_activity;
create policy "Readers read the activity log" on public.space_activity for select to anon, authenticated
  using (public.can_read_space(space_id) and public.space_role(space_id) is not null);

-- 3. Paylaşım bağlantıları
drop table if exists public.space_link_grants;
drop table if exists public.space_share_links;

-- 4. Puan: tetikleyici, sayaç sütunları, tekillik dizini
drop trigger if exists prompt_comments_space_rating on public.prompt_comments;
drop function if exists public.handle_space_rating_change();
drop trigger if exists spaces_protect_rating on public.spaces;
drop index if exists public.prompt_comments_space_rating_uniq;

-- list_spaces: "Önerilen" sıralaması puan terimini taşıyordu (istemci artık kullanmıyor).
CREATE OR REPLACE FUNCTION public.list_spaces(p_filter text DEFAULT 'all'::text, p_query text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text, title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[], image_count integer, prompt_count integer, note_count integer, member_count integer, my_role text, is_favorite boolean, last_opened_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, archived_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select nullif(btrim(coalesce(p_query, '')), '') as q,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url,
         s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         case when m.role is not null then (select count(*)::integer from public.space_members c where c.space_id = s.id) end,
         m.role, coalesce(us.favorite, false), us.last_opened_at,
         s.created_at, s.updated_at, s.archived_at
    from public.spaces s
    cross join params
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where s.team_id is null
     and case coalesce(p_filter, 'all')
           when 'all' then m.role is not null and s.archived_at is null
           when 'mine' then m.role = 'owner' and s.archived_at is null
           when 'shared' then m.role in ('editor', 'viewer') and s.archived_at is null
           when 'favorites' then coalesce(us.favorite, false)
           when 'recent' then us.last_opened_at is not null and s.archived_at is null
           when 'public' then s.visibility = 'public' and s.archived_at is null and s.owner_id is distinct from auth.uid()
           when 'archived' then m.role = 'owner' and s.archived_at is not null
           else false
         end
     and (
       params.q is null
       or s.title ilike params.pattern or s.description ilike params.pattern
       or exists (
         select 1 from public.space_items si
          where si.space_id = s.id and (si.title ilike params.pattern or si.body ilike params.pattern or si.note ilike params.pattern)
       )
       or exists (
         select 1 from public.space_items si join public.prompts pr on pr.id = si.prompt_id
          where si.space_id = s.id and (pr.title ilike params.pattern or pr.prompt_text ilike params.pattern)
       )
     )
   order by
     case when p_sort = 'recommended' then
       s.quote_count * 3
     end desc nulls last,
     case when p_sort = 'title' then lower(s.title) end asc,
     case when p_sort = 'created' then s.created_at end desc,
     case when p_sort = 'opened' then us.last_opened_at end desc nulls last,
     s.updated_at desc,
     s.id
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

alter table public.spaces drop column if exists rating_avg;
alter table public.spaces drop column if exists rating_count;
alter table public.spaces drop column if exists activity_visibility;

-- 5. Ölü yazma yolları: Space yorumu bildirimi, etkinlik notu RPC'si
drop trigger if exists prompt_comments_after_insert_notify_space on public.prompt_comments;
drop function if exists public.notify_space_comment();
drop function if exists public.set_space_activity_note(uuid, text);
