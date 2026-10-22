-- docs/history/214-* — Spaces keşfi: profilde "Spaces" sekmesi ve prompt detayında "Bu prompt şu Space'lerde".
--
-- Yalnızca ekleyici: tek yeni fonksiyon, `drop` yok. `list_spaces` ile AYNI satır biçimi (istemci aynı eşlemeyi kullanır).
-- SECURITY INVOKER: `spaces`/`space_items` RLS'i (`can_read_space` — engel iki yönlü) çağıranın gözüyle uygulanır; burada yalnız
-- "herkese açık + arşivlenmemiş" süzülür. Özel, bağlantılı ve arşivli Space ÜYESİ olunsa bile listeye girmez: bu bir vitrin.
-- En az bir süzgeç zorunlu (sahip ya da prompt): genel bir "tüm herkese açık Space'ler" listesi `list_spaces('public')`'tir.

create or replace function public.list_public_spaces(
  p_owner uuid default null,
  p_prompt uuid default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text,
  title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[],
  image_count integer, prompt_count integer, note_count integer, member_count integer,
  my_role text, is_favorite boolean, last_opened_at timestamptz,
  created_at timestamptz, updated_at timestamptz, archived_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
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
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where s.visibility = 'public'
     and s.archived_at is null
     and (p_owner is not null or p_prompt is not null)
     and (p_owner is null or s.owner_id = p_owner)
     and (p_prompt is null or exists (select 1 from public.space_items si where si.space_id = s.id and si.prompt_id = p_prompt))
   order by s.updated_at desc, s.id
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function public.list_public_spaces(uuid, uuid, integer, integer) from public;
grant execute on function public.list_public_spaces(uuid, uuid, integer, integer) to anon, authenticated;
