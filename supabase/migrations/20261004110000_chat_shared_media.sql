-- Sohbet bilgi sayfaları: paylaşılan fotoğraf / içerik / bağlantı sayıları + listeleri, ve iki kişinin ortak toplulukları
-- (docs/history/271-*). Yalnızca ekleyici (yeni fonksiyonlar, `drop` yok).
--
-- Neden RPC: istemci "attachments @> [{}]" süzgecini PostgREST'e `cs.{[object Object]}` olarak gönderiyordu (postgrest-js dizi
-- değerini Postgres dizi sözdizimine çevirir) → canlıda "Fotoğraflar yüklenemedi". Süzgeç artık sunucuda.
--
-- `chat_shared_stats` / `chat_shared_items` SECURITY INVOKER'dır: mesaj okuma kuralı (RLS: üyelik, grupta katılma zamanı, engel)
-- aynen geçerlidir; ayrıca çağıranın "geçmişi temizle" imleci ve "benden sil" işaretleri uygulanır (görünmeyen mesaj sayılmaz/listelenmez).
-- `common_communities` SECURITY DEFINER'dır (başkasının üyeliğini okur) ama YALNIZ çağıranın da üye olduğu toplulukları döndürür;
-- engel (iki yönlü) varsa boş döner; kendi kendine boş.

create or replace function public.chat_shared_stats(p_conversation_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with vis as (
    select m.*
      from public.messages m
     where m.conversation_id = p_conversation_id
       and m.deleted_at is null
       and not exists (select 1 from public.message_hidden_for h where h.message_id = m.id and h.user_id = auth.uid())
       and m.created_at > coalesce(
         (select cm.cleared_at from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()),
         '-infinity'::timestamptz)
  ), flagged as (
    select vis.*,
           (shared_prompt_id is not null or shared_request_id is not null
             or coalesce(body ~* '/(workflows|presets|spaces)/local\?id=[0-9a-f-]{36}|/communities/post/local\?id=[0-9a-f-]{36}', false)) as is_content
      from vis
  )
  select jsonb_build_object(
    'photos',  coalesce(sum(jsonb_array_length(attachments)), 0),
    'content', count(*) filter (where is_content),
    'links',   count(*) filter (where not is_content and coalesce(body ~* 'https?://[^[:space:]]+', false))
  )
  from flagged;
$$;

create or replace function public.chat_shared_items(p_conversation_id uuid, p_kind text, p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, sender_id uuid, body text, attachments jsonb, shared_prompt_id uuid, shared_request_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  with vis as (
    select m.*
      from public.messages m
     where m.conversation_id = p_conversation_id
       and p_kind in ('photos', 'links', 'content')
       and m.deleted_at is null
       and not exists (select 1 from public.message_hidden_for h where h.message_id = m.id and h.user_id = auth.uid())
       and m.created_at > coalesce(
         (select cm.cleared_at from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()),
         '-infinity'::timestamptz)
  ), flagged as (
    select vis.*,
           (shared_prompt_id is not null or shared_request_id is not null
             or coalesce(body ~* '/(workflows|presets|spaces)/local\?id=[0-9a-f-]{36}|/communities/post/local\?id=[0-9a-f-]{36}', false)) as is_content
      from vis
  )
  select f.id, f.created_at, f.sender_id, f.body, f.attachments, f.shared_prompt_id, f.shared_request_id
    from flagged f
   where case p_kind
           when 'photos'  then jsonb_array_length(f.attachments) > 0
           when 'content' then f.is_content
           when 'links'   then not f.is_content and coalesce(f.body ~* 'https?://[^[:space:]]+', false)
         end
   order by f.created_at desc, f.id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.common_communities(p_user uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_user is null or p_user = v_me then
    return;
  end if;
  if public.is_blocked(v_me, p_user) then
    return;
  end if;
  return query
    select g.id
      from public.chat_groups g
     where exists (select 1 from public.conversation_members a where a.conversation_id = g.id and a.user_id = v_me)
       and exists (select 1 from public.conversation_members b where b.conversation_id = g.id and b.user_id = p_user)
     order by g.member_count desc, g.name
     limit 50;
end;
$$;

revoke execute on function public.chat_shared_stats(uuid) from public, anon;
revoke execute on function public.chat_shared_items(uuid, text, integer) from public, anon;
revoke execute on function public.common_communities(uuid) from public, anon;
grant execute on function public.chat_shared_stats(uuid) to authenticated;
grant execute on function public.chat_shared_items(uuid, text, integer) to authenticated;
grant execute on function public.common_communities(uuid) to authenticated;
