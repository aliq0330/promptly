-- `reports`'a doğrudan insert yolunu kapat (docs/history/284-* "contract" adımı, docs/history/287-*).
--
-- 284'ten beri tek şikâyet girişi `submit_report`'tur (neden kodu, hedef doğrulama, "Diğer" ayrıntısı). Ama 130000'daki eski INSERT
-- politikası (`auth.uid() = reporter_id`) hâlâ giriş yapmış herkese tabloya doğrudan yazmaya izin veriyordu: bu, neden/hedef doğrulamasını
-- atlayan, serbest metinli şikâyet yoluydu. `submit_report` SECURITY INVOKER olduğu için insert'i bu politikadan geçirir; politikayı
-- silmek şikâyeti tümden bozardı. Bu yüzden politika DARALTILIR: yalnız `submit_report` içinden, işlem-yerel `promptly.submit_report`
-- işaretiyle yazılabilir. İstemci bu işareti koyamaz (PostgREST yalnız `public` fonksiyonlarını açar; `set_config` açık değildir).
--
-- Yinelenen açık şikâyet, günlük 20 sınırı ve engel/askı kuralları tetikleyicilerde kalır (değişmedi). Eski satırlar (reason_code boş) olduğu gibi.

alter policy "Authenticated users can file reports" on public.reports
  with check (auth.uid() = reporter_id and current_setting('promptly.submit_report', true) = '1');

create or replace function public.submit_report(p_target_type text, p_target_id uuid, p_reason_code text, p_details text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
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
$$;
revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
