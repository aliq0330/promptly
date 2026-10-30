-- ci:allow-destructive
-- Merkezi şikâyet: hazır nedenler + tek giriş (docs/history/284-*).
--
-- Eskiden her şikâyet noktası serbest metinle `reports`'a doğrudan insert ediyordu (istemci raportör kimliğini kendisi yazıyordu) ve
-- topluluk gönderisi/mesajı için ayrı bir modal + RPC vardı. Yeni düzen:
--   • `reports` ve `community_reports`'a `reason_code` (12 hazır neden) + `details` (isteğe bağlı ek bilgi, ≤1000) eklenir; eski serbest
--     metin satırları olduğu gibi kalır (`reason_code` boş = "eski şikâyet");
--   • TEK giriş `submit_report(tür, id, neden, ayrıntı)` (SECURITY INVOKER): raportör `auth.uid()`, hedef çağıranın RLS'inden geçerek
--     doğrulanır (göremediğin içeriği şikâyet edemezsin), neden o hedef türüne uygun olmalı, "Diğer" ayrıntı ister, yinelenen açık
--     şikâyet ve günlük hız sınırı mevcut tetikleyicilerden gelir; topluluk gönderisi/sohbet mesajı `report_community_content`'e yönlenir;
--   • `reports.target_type`'a `community` eklenir (kısıt aynı adla yeniden kurulur, veri silinmez);
--   • moderasyon kuyruğu `moderation_report_queue(p_status, p_reason)` olarak yeni bir ÜST imzayla eklenir (neden kodu + ayrıntı + neden süzgeci,
--     `community` hedefi); eski tek argümanlı imza aynı dönüş tipiyle ince sarmalayıcı olur (eski istemciler çalışmaya devam eder).
-- Hiçbir şikâyet içeriği kendiliğinden kaldırmaz ya da kimseyi cezalandırmaz; karar yine yalnız `moderate_report`'tadır.

-- 1) Sütunlar --------------------------------------------------------------------------------------------------------------------------------
alter table public.reports add column if not exists reason_code text;
alter table public.reports add column if not exists details text;
alter table public.reports drop constraint if exists reports_reason_code_check;
alter table public.reports add constraint reports_reason_code_check check (
  reason_code is null or reason_code in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'copyright', 'privacy', 'fraud', 'wrongcat', 'impersonation', 'platform', 'other'));
alter table public.reports drop constraint if exists reports_details_len;
alter table public.reports add constraint reports_details_len check (details is null or char_length(details) <= 1000);

alter table public.community_reports add column if not exists reason_code text;
alter table public.community_reports add column if not exists details text;
alter table public.community_reports drop constraint if exists community_reports_reason_code_check;
alter table public.community_reports add constraint community_reports_reason_code_check check (
  reason_code is null or reason_code in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'copyright', 'privacy', 'fraud', 'wrongcat', 'impersonation', 'platform', 'other'));
alter table public.community_reports drop constraint if exists community_reports_details_len;
alter table public.community_reports add constraint community_reports_details_len check (details is null or char_length(details) <= 1000);

-- Hedef türü `community` (topluluğun kendisi). Kaldırma yok: `moderate_report` bu tür için "kaldırılamaz" der.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('prompt', 'comment', 'request', 'user', 'message', 'workflow', 'preset', 'story', 'space', 'quote', 'community'));

-- 2) Neden yardımcıları: hangi hedefte hangi neden geçerli (istemcideki `lib/report-reasons.ts` ile aynı tablo; test ikisini karşılaştırır) ----------
create or replace function public._report_reasons_for(p_target_type text)
returns text[] language sql immutable set search_path = public as $$
  select case
    when p_target_type in ('prompt', 'request', 'workflow', 'preset', 'space', 'quote', 'story')
      then array['spam', 'copyright', 'sexual', 'hate', 'harassment', 'violence', 'privacy', 'fraud', 'wrongcat', 'platform', 'other']
    when p_target_type = 'user'
      then array['impersonation', 'harassment', 'spam', 'hate', 'sexual', 'violence', 'privacy', 'fraud', 'other']
    when p_target_type in ('comment', 'message', 'chat_message')
      then array['harassment', 'spam', 'hate', 'sexual', 'violence', 'privacy', 'fraud', 'other']
    when p_target_type = 'community_post'
      then array['spam', 'harassment', 'hate', 'sexual', 'violence', 'wrongcat', 'copyright', 'privacy', 'fraud', 'platform', 'other']
    when p_target_type = 'community'
      then array['wrongcat', 'spam', 'hate', 'harassment', 'violence', 'fraud', 'impersonation', 'sexual', 'other']
    else array[]::text[]
  end
$$;

-- Eski ekranlar (ve `reason` NOT NULL) için okunur Türkçe etiket: ham `reason` sütununa "etiket" (+ ayrıntı) yazılır.
create or replace function public._report_reason_label(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'spam' then 'Spam veya yanıltıcı içerik'
    when 'harassment' then 'Taciz veya zorbalık'
    when 'hate' then 'Nefret söylemi'
    when 'sexual' then 'Uygunsuz veya cinsel içerik'
    when 'violence' then 'Şiddet veya tehdit'
    when 'copyright' then 'Telif hakkı ihlali'
    when 'privacy' then 'Kişisel bilgilerin paylaşılması'
    when 'fraud' then 'Dolandırıcılık veya kötüye kullanım'
    when 'wrongcat' then 'Yanlış kategori veya topluluk kuralı ihlali'
    when 'impersonation' then 'Sahte hesap veya kimliğe bürünme'
    when 'platform' then 'Yapay zekâ, prompt veya platform kurallarının ihlali'
    when 'other' then 'Diğer'
  end
$$;
revoke all on function public._report_reasons_for(text), public._report_reason_label(text) from public, anon;
grant execute on function public._report_reasons_for(text), public._report_reason_label(text) to authenticated;

-- 3) Topluluk içeriği şikâyeti: aynı mantık, neden kodu + ayrıntıyla. Eski 4 argümanlı imza ince sarmalayıcı olur. ------------------------------
create or replace function public.report_community_content(p_group_id uuid, p_kind text, p_target_id uuid, p_reason text, p_reason_code text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_post public.community_posts;
  v_msg public.messages;
  v_target_user uuid;
  v_id uuid := gen_random_uuid();
begin
  perform public._group_lock(p_group_id);
  if public._group_member_role(p_group_id, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    raise exception 'invalid_reason';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'details_too_long';
  end if;
  if p_kind = 'post' then
    select * into v_post from public.community_posts where id = p_target_id and community_id = p_group_id;
    if not found then
      raise exception 'report_target_not_found';
    end if;
    v_target_user := v_post.author_id;
  elsif p_kind = 'message' then
    select * into v_msg from public.messages where id = p_target_id and conversation_id = p_group_id and deleted_at is null;
    if not found or not public.can_read_message(v_msg.conversation_id, v_msg.sender_id, v_msg.created_at) then
      raise exception 'report_target_not_found';
    end if;
    v_target_user := v_msg.sender_id;
  else
    raise exception 'report_target_not_found';
  end if;
  if v_target_user = v_actor then
    raise exception 'cannot_target_self';
  end if;
  if (select count(*) from public.community_reports where reporter_id = v_actor and status = 'open') >= 20 then
    raise exception 'report_limit';
  end if;
  begin
    insert into public.community_reports (id, community_id, reporter_id, target_kind, post_id, message_id, target_user_id, reason, reason_code, details)
    values (v_id, p_group_id, v_actor, p_kind,
            case when p_kind = 'post' then p_target_id end,
            case when p_kind = 'message' then p_target_id end,
            v_target_user, v_reason, p_reason_code, v_details);
  exception when unique_violation then
    raise exception 'already_reported';
  end;
  return v_id;
end;
$$;

create or replace function public.report_community_content(p_group_id uuid, p_kind text, p_target_id uuid, p_reason text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.report_community_content(p_group_id, p_kind, p_target_id, p_reason, null::text, null::text)
$$;

revoke execute on function public.report_community_content(uuid, text, uuid, text, text, text) from public, anon;
revoke execute on function public.report_community_content(uuid, text, uuid, text) from public, anon;
grant execute on function public.report_community_content(uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.report_community_content(uuid, text, uuid, text) to authenticated;

-- 4) TEK giriş ---------------------------------------------------------------------------------------------------------------------------------
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
  begin
    insert into public.reports (id, reporter_id, target_type, target_id, reason, reason_code, details)
    values (v_id, v_actor, p_target_type, p_target_id, v_reason, p_reason_code, v_details);
  exception when unique_violation then
    raise exception 'report_duplicate';
  end;
  return v_id;
end;
$$;
revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- 5) Moderasyon kuyruğu: neden kodu + ayrıntı + neden süzgeci + `community` hedefi (yeni 2 argümanlı imza; eskisi sarmalayıcı) ----------------------
create or replace function public.moderation_report_queue(p_status text, p_reason text)
returns table(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text, reason_code text, details text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href, r.reason_code, r.details
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join lateral (
    select true as exists_, p.title as title, p.author_id as author_id, '/prompts/local?id=' || p.id as href
      from public.prompts p where r.target_type = 'prompt' and p.id = r.target_id
    union all
    select true, q.title, q.author_id, '/requests/local?id=' || q.id
      from public.prompt_requests q where r.target_type = 'request' and q.id = r.target_id
    union all
    select true, w.title, w.creator_id, '/workflows/local?id=' || w.id
      from public.workflows w where r.target_type = 'workflow' and w.id = r.target_id
    union all
    select true, s.title, s.creator_id, '/presets/local?id=' || s.id
      from public.presets s where r.target_type = 'preset' and s.id = r.target_id
    union all
    select true, left(c.body, 300), c.author_id, null::text
      from public.prompt_comments c where r.target_type = 'comment' and c.id = r.target_id
    union all
    select true, left(coalesce(m.body, ''), 300), m.sender_id, null::text
      from public.messages m where r.target_type = 'message' and m.id = r.target_id
    union all
    select true, u.display_name, u.id, '/profile/real?username=' || u.username
      from public.profiles u where r.target_type = 'user' and u.id = r.target_id
    union all
    select true, left(coalesce(st.layout -> 'layers' -> 0 ->> 'text', st.sticker_question, st.kind), 300), st.author_id, '/stories?id=' || st.id
      from public.stories st where r.target_type = 'story' and st.id = r.target_id
    union all
    select true, sp.title, sp.owner_id, '/spaces/local?id=' || sp.id
      from public.spaces sp where r.target_type = 'space' and sp.id = r.target_id
    union all
    select true, left(coalesce(qq.note, public._quote_target_title(qq.content_type, qq.target_id)), 300), qq.author_id, '/quotes/local?id=' || qq.id
      from public.content_quotes qq where r.target_type = 'quote' and qq.id = r.target_id
    union all
    select true, cg.name, cg.created_by, '/communities/local?id=' || cg.id
      from public.chat_groups cg where r.target_type = 'community' and cg.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
    and (p_reason is null or p_reason = 'all'
         or (p_reason = 'legacy' and r.reason_code is null)
         or r.reason_code = p_reason)
  order by r.created_at desc
  limit 200;
end $function$;
revoke execute on function public.moderation_report_queue(text, text) from public, anon;
grant execute on function public.moderation_report_queue(text, text) to authenticated;

-- Eski tek argümanlı imza: AYNI dönüş tipi, yeni işlevden ilk 15 sütun (eski istemciler kırılmaz).
create or replace function public.moderation_report_queue(p_status text default 'open')
returns table(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select q.id, q.status, q.reason, q.created_at, q.reviewed_at, q.resolution_note, q.target_type, q.target_id, q.reporter_id, q.reporter_username,
    q.target_exists, q.target_title, q.target_author_id, q.target_author_username, q.target_href
  from public.moderation_report_queue(p_status, 'all') q;
end $function$;
