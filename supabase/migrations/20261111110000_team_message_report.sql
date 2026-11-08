-- Ekipler (docs/history/353-*): ekip kanalı mesajı şikâyeti. Şikâyet site moderatörlerine değil EKİP YÖNETİMİNE (sahip + yöneticiler) gider:
-- özel kanalın içeriği ekip dışına çıkmaz. Merkezi şikâyet penceresi aynıdır (`submit_report('chat_message', …)`); ekip kanalı mesajı bu işleve yönlenir.
-- Şikâyet mesajı KALDIRMAZ/cezalandırmaz; karar ekip yönetiminindir (mesajı kaldırmak `team_moderate_message`).

create or replace function public.team_report_message(p_message uuid, p_reason_code text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  c public.team_channels;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_label text;
  v_id uuid := gen_random_uuid();
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into m from public.messages where id = p_message;
  select * into c from public.team_channels where id = m.conversation_id;
  -- Göremediğin içeriği şikâyet edemezsin; varlığı da sızmaz.
  if not found or not public.can_read_message(m.conversation_id, m.sender_id, m.created_at) or m.sender_id = v_uid then raise exception 'report_target_not_found'; end if;
  if p_reason_code is null or not (p_reason_code = any (public._report_reasons_for('message'))) then raise exception 'invalid_report_reason'; end if;
  if v_details is not null and char_length(v_details) > 1000 then raise exception 'details_too_long'; end if;
  if p_reason_code = 'other' and (v_details is null or char_length(v_details) < 3) then raise exception 'details_required'; end if;
  perform public._rate_limit('team_report_message', 10, interval '1 hour');
  if exists (select 1 from public.team_audit a where a.team_id = c.team_id and a.actor_id = v_uid and a.action = 'message_reported' and a.details ->> 'message_id' = p_message::text) then
    raise exception 'report_duplicate';
  end if;
  v_label := public._report_reason_label(p_reason_code);
  perform public._team_audit(c.team_id, 'channel', 'message_reported', '#' || c.name,
    jsonb_build_object('message_id', p_message, 'channel_id', c.id, 'reason', p_reason_code, 'details', v_details, 'sender_id', m.sender_id));
  select coalesce(nullif(display_name, ''), username) into v_name from public.profiles where id = v_uid;
  -- En çok 20 yönetici bilgilendirilir (bir olay bütün üyelere yazmaz).
  perform public._notify_system(t.user_id, v_uid, public.truncate_preview(coalesce(v_name, 'Biri') || ' #' || c.name || ' kanalında bir mesajı bildirdi.', 160),
                                '/teams/local?id=' || c.team_id || '&tab=chat&channel=' || c.name,
                                'teamreport:' || p_message || ':' || t.user_id)
    from (select user_id from public.team_members where team_id = c.team_id and role in ('owner', 'admin') order by joined_at limit 20) t;
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.submit_report(p_target_type text, p_target_id uuid, p_reason_code text, p_details text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_label text;
  v_reason text;
  v_group uuid;
  v_ok boolean := false;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_type is null or p_target_id is null or coalesce(array_length(public._report_reasons_for(p_target_type), 1), 0) = 0 then
    raise exception 'report_target_not_found';
  end if;
  if p_reason_code is null or not (p_reason_code = any (public._report_reasons_for(p_target_type))) then
    raise exception 'invalid_report_reason';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'details_too_long';
  end if;
  if p_reason_code = 'other' and (v_details is null or char_length(v_details) < 3) then
    raise exception 'details_required';
  end if;
  v_label := public._report_reason_label(p_reason_code);

  -- Hedef: çağıranın kendi RLS'i altında okunabilir olmalı (göremediğin içeriği şikâyet edemezsin; varlığı da sızmaz).
  if p_target_type = 'community_post' then
    select community_id into v_group from public.community_posts where id = p_target_id;
    if v_group is null then raise exception 'report_target_not_found'; end if;
    return public.report_community_content(v_group, 'post', p_target_id, v_label, p_reason_code, v_details);
  elsif p_target_type = 'chat_message' then
    select conversation_id into v_group from public.messages where id = p_target_id;
    if v_group is null then raise exception 'report_target_not_found'; end if;
    -- Ekip kanalı mesajı: site moderatörlerine DEĞİL ekip yönetimine gider (özel kanal içeriği ekip dışına çıkmaz).
    if exists (select 1 from public.conversations c where c.id = v_group and c.kind = 'team_channel') then
      return public.team_report_message(p_target_id, p_reason_code, v_details);
    end if;
    return public.report_community_content(v_group, 'message', p_target_id, v_label, p_reason_code, v_details);
  end if;

  v_ok := case p_target_type
    when 'prompt' then exists (select 1 from public.prompts where id = p_target_id)
    when 'request' then exists (select 1 from public.prompt_requests where id = p_target_id)
    when 'workflow' then exists (select 1 from public.workflows where id = p_target_id)
    when 'preset' then exists (select 1 from public.presets where id = p_target_id)
    when 'comment' then exists (select 1 from public.prompt_comments where id = p_target_id)
    when 'user' then exists (select 1 from public.profiles where id = p_target_id)
    when 'message' then exists (select 1 from public.messages where id = p_target_id)
    when 'story' then exists (select 1 from public.stories where id = p_target_id)
    when 'space' then exists (select 1 from public.spaces where id = p_target_id)
    when 'quote' then exists (select 1 from public.content_quotes where id = p_target_id)
    when 'community' then exists (select 1 from public.community_cards(array[p_target_id]))
    else false
  end;
  if not v_ok then
    raise exception 'report_target_not_found';
  end if;

  v_reason := v_label || case when v_details is not null then E'\n' || v_details else '' end;
  -- Yazma kapısı: `reports` INSERT politikası bu işlem-yerel işareti ister; istemci tabloya doğrudan yazarsa işaret yoktur ve reddedilir.
  perform set_config('promptly.submit_report', '1', true);
  begin
    insert into public.reports (id, reporter_id, target_type, target_id, reason, reason_code, details)
    values (v_id, v_actor, p_target_type, p_target_id, v_reason, p_reason_code, v_details);
  exception when unique_violation then
    perform set_config('promptly.submit_report', '', true);
    raise exception 'report_duplicate';
  end;
  perform set_config('promptly.submit_report', '', true);
  return v_id;
end;
$function$;

do $$
begin
  revoke execute on function public.team_report_message(uuid, text, text) from public, anon;
  grant execute on function public.team_report_message(uuid, text, text) to authenticated;
end $$;
