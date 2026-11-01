-- Rol değişikliği bildirimi (docs/history/305-*): bir topluluk/grup üyesinin rolü değişince o kişiye "direct" sınıfında bildirim yazılır
-- (Sessiz'de de gelir: yetkisi değişen kişi bunu bilmeli). 20260920000000'daki gövde AYNEN korunur, sonuna yalnızca bildirim eklenir;
-- imza aynı olduğundan mevcut EXECUTE izinleri değişmez. Cümleler `notification-message.ts` COMMUNITY_TEMPLATES ile eşleşir.

create or replace function public.set_chat_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_actor_role text;
  v_target_role text;
  v_name text;
begin
  if p_role not in ('admin', 'moderator', 'member') then
    raise exception 'invalid_role';
  end if;
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'manage_roles');
  v_actor_role := public._group_member_role(p_group_id, v_actor);
  if p_user_id = v_actor then
    raise exception 'cannot_target_self';
  end if;
  v_target_role := public._group_member_role(p_group_id, p_user_id);
  if v_target_role is null then
    raise exception 'not_a_member';
  end if;
  if v_target_role = 'owner' then
    raise exception 'forbidden';
  end if;
  if v_actor_role = 'admin' and (p_role = 'admin' or v_target_role = 'admin') then
    raise exception 'forbidden';
  end if;
  if v_target_role = p_role then
    return;
  end if;
  update public.conversation_members set role = p_role where conversation_id = p_group_id and user_id = p_user_id;
  perform public._group_audit(p_group_id, g.name, v_actor, p_user_id, 'role_changed', jsonb_build_object('from', v_target_role, 'to', p_role));

  v_name := '"' || public.truncate_preview(g.name, 60) || '"';
  perform public._community_notify(
    p_user_id, v_actor, p_group_id, 'direct',
    case p_role
      when 'admin' then v_name || ' topluluğunda rolün yönetici oldu.'
      when 'moderator' then v_name || ' topluluğunda rolün moderatör oldu.'
      else v_name || ' topluluğunda rolün üye olarak değiştirildi.'
    end,
    '/communities/local?id=' || p_group_id,
    'crole:' || p_group_id || ':' || p_user_id || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint
  );
end;
$$;
