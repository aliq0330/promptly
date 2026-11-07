-- Ekip alanı, Aşama 2 (docs/history/349-*): bildirimler. Yeni ekip Space'i (bilgi sınıfı: üyenin topluluk bildirim düzeyi "Tümü" ise) ve
-- prompt onayı/onay kaldırma (yazara doğrudan). Mevcut `_community_notify*` yardımcıları kullanılır: üye tercihleri/sessize alma geçerli, tek toplu yazma.
-- Ekleyicidir: iki fonksiyon `create or replace` ile bildirim çağrısı kazanır; veri/şema değişmez.

create or replace function public.create_team_space(
  p_community uuid,
  p_title text,
  p_description text default '',
  p_kind text default 'team_library',
  p_groups text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
  v_name text;
  v_pos integer := 0;
  v_prev text := coalesce(current_setting('promptly.team_sync', true), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_library')
     or char_length(coalesce(p_description, '')) > 500
     or coalesce(cardinality(p_groups), 0) > 12 then
    raise exception 'space_invalid';
  end if;
  -- Topluluk var, "tamamen kapalı" ve kapatılmamış olmalı; yoksa varlığı sızmasın diye genel hata.
  if not exists (select 1 from public.chat_groups g where g.id = p_community and g.visibility = 'private' and g.closed_at is null) then
    raise exception 'space_forbidden';
  end if;
  -- `_group_can` üye olmayan için NULL döner: NULL'u "yetki yok" say (aksi hâlde `not NULL` koşulu sessizce geçerdi).
  if not coalesce(public._group_can(p_community, v_uid, 'create_spaces'), false) then raise exception 'space_forbidden'; end if;
  if (select count(*) from public.spaces s where s.community_id = p_community) >= 50 then raise exception 'team_space_limit'; end if;
  select m.user_id into v_owner from public.conversation_members m where m.conversation_id = p_community and m.role = 'owner';
  if v_owner is null then raise exception 'space_invalid'; end if;

  insert into public.spaces (owner_id, title, description, kind, visibility, community_id, updated_by)
  values (v_owner, btrim(p_title), coalesce(p_description, ''), p_kind, 'private', p_community, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;

  -- Mevcut bütün üyeler düzenleyici olarak yansıtılır (sahip satırı `spaces_after_insert`'ten gelir).
  perform set_config('promptly.team_sync', '1', true);
  insert into public.space_members (space_id, user_id, role, added_by)
  select v_id, m.user_id, 'editor', v_owner from public.conversation_members m
   where m.conversation_id = p_community and m.user_id <> v_owner
  on conflict do nothing;
  perform set_config('promptly.team_sync', v_prev, true);

  -- Ekibe haber: bilgi sınıfı (üyenin topluluk bildirim düzeyi "Tümü" ise), tek `insert … select`, üst sınırlı.
  perform public._community_notify_members(
    p_community, v_uid, 'info',
    '"' || public.truncate_preview(btrim(p_title), 80) || '" adlı yeni ekip Space''ini açtı.',
    '/spaces/local?id=' || v_id, 'teamspace:' || v_id || ':', '', 20000);
  return v_id;
end;
$$;


create or replace function public.space_set_item_approval(p_item uuid, p_approved boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_kind text;
  v_comm uuid;
  v_title text;
  v_at timestamptz;
  v_rows integer;
  v_author uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null or p_approved is null then raise exception 'space_invalid'; end if;
  select i.space_id into v_space from public.space_items i where i.id = p_item;
  if v_space is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  select s.kind, s.community_id into v_kind, v_comm from public.spaces s where s.id = v_space;
  if v_comm is not null then
    if not coalesce(public._group_can(v_comm, v_uid, 'approve_library'), false) or not public.can_edit_space(v_space) then raise exception 'space_forbidden'; end if;
  elsif public.space_role(v_space) is distinct from 'owner' or not public.can_edit_space(v_space) then
    raise exception 'space_forbidden';
  end if;
  if v_kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  perform set_config('promptly.space_approval', '1', true);
  update public.space_items
     set approved_at = case when p_approved then now() else null end,
         approved_by = case when p_approved then v_uid else null end
   where id = p_item and kind = 'prompt' and is_draft
   returning title, approved_at, created_by into v_title, v_at, v_author;
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_approval', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  perform public._space_log(v_space, case when p_approved then 'item_approved' else 'item_unapproved' end, nullif(btrim(v_title), ''));
  -- Ekip Space'inde yazara doğrudan haber (anahtar yönü + milisaniyeyi içerir: onay → geri alma → onay peş peşe de ayrı bildirim üretir).
  if v_comm is not null then
    perform public._community_notify(
      v_author, v_uid, v_comm, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(v_title), ''), 'Adsız'), 80) || case when p_approved then '" promptunu ekip kütüphanesinde onayladı.' else '" promptunun onayını kaldırdı.' end,
      '/spaces/local?id=' || v_space || '&tab=prompts',
      'teamapprove:' || p_item || ':' || case when p_approved then 'a' else 'r' end || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;
  return v_at;
end;
$$;

