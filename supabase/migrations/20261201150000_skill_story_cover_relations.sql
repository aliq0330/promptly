-- ci:allow-destructive
-- Skill: hikâyede içerik bağlantısı, kapak görseli, `content_relations` ucu (docs/history/399-*).
--
-- `-- ci:allow-destructive`: üç CHECK kısıtı (`stories.linked_type`, `content_relations.source_type/target_type`) yeni türü kapsayacak biçimde yeniden kurulur ve iki Storage politikası
-- (`skill-files`: okuma + silme) kapak yolunu kapsayacak biçimde yeniden yazılır; veri silinmez.
--
-- 1) HİKÂYE: `create_story` Skill'i bağlanabilir içerik olarak kabul eder; görünürlük TEK yerde `_community_content_info` (Skill kolu eklendi: yayında + herkese açık). Hikâye görünürlüğü/süre/etkileşim kuralları
--    DEĞİŞMEDİ (`_story_visible`). Bağlantı kimlikle yapılır, Skill kopyalanmaz.
-- 2) KAPAK: `skills.cover_path` (`skill-files` bucket'ı, `{skill}/cover/{uuid}.{jpg|png|webp}`); okuma Skill'i okuyabilen herkese (yayında + herkese açık ya da sahibi), yazma/silme yalnız sahibine;
--    yetim süpürücü `cover_path`'i bilir (yoksa süpürücü kapağı silerdi).
-- 3) İLİŞKİ HARİTASI: `content_relations` ucu olarak `skill` (elle kurulan benzer/alternatif/esinlendi); görünürlük/sahiplik yardımcıları Skill'i bilir; Skill silinince ilişkileri de gider.

-- ============================================================================
-- 1) Hikâye bağlantısı
-- ============================================================================
alter table public.stories drop constraint if exists stories_linked_type_check;
alter table public.stories add constraint stories_linked_type_check check (linked_type is null or linked_type in ('prompt', 'request', 'workflow', 'preset', 'skill'));

create or replace function public._community_content_info(p_type text, p_id uuid)
returns table (owner_id uuid, shareable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'prompt' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public' and x.deleted_at is null) from public.prompts x where x.id = p_id;
  elsif p_type = 'request' then
    return query select x.author_id, (not x.is_draft and x.visibility = 'public' and x.deleted_at is null) from public.prompt_requests x where x.id = p_id;
  elsif p_type = 'workflow' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public') from public.workflows x where x.id = p_id;
  elsif p_type = 'preset' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public') from public.presets x where x.id = p_id;
  elsif p_type = 'space' then
    return query select x.owner_id, (x.visibility = 'public' and x.archived_at is null) from public.spaces x where x.id = p_id;
  elsif p_type = 'skill' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public') from public.skills x where x.id = p_id;
  end if;
end;
$$;

create or replace function public.create_story(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles;
  v_token uuid;
  v_id uuid;
  v_kind text := p ->> 'kind';
  v_media text := nullif(p ->> 'media_url', '');
  v_mime text := nullif(p ->> 'media_mime', '');
  v_path text;
  v_layout jsonb := coalesce(p -> 'layout', '{"v": 1, "layers": []}'::jsonb);
  v_linked_type text := nullif(p ->> 'linked_type', '');
  v_linked_id uuid;
  v_sticker text := nullif(p ->> 'sticker_kind', '');
  v_question text := nullif(btrim(coalesce(p ->> 'sticker_question', '')), '');
  v_options text[];
  v_audience text := coalesce(p ->> 'audience', 'followers');
  v_community uuid;
  v_role text;
  g public.chat_groups;
  v_info record;
  v_duration integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_actor;
  if not found then raise exception 'not_authenticated'; end if;
  if (v_profile.suspended_until is not null and v_profile.suspended_until > now()) or v_profile.posting_blocked then
    raise exception 'forbidden';
  end if;

  begin
    v_token := (p ->> 'client_token')::uuid;
    v_linked_id := nullif(p ->> 'linked_id', '')::uuid;
    v_community := nullif(p ->> 'community_id', '')::uuid;
    v_duration := nullif(p ->> 'media_duration_ms', '')::integer;
  exception when others then
    raise exception 'invalid_story';
  end;
  if v_token is null then raise exception 'invalid_story'; end if;

  -- İdempotentlik: çift dokunma / ağ yeniden denemesi.
  select id into v_id from public.stories where author_id = v_actor and client_token = v_token;
  if v_id is not null then return v_id; end if;

  if (select count(*) from public.stories where author_id = v_actor and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'story_rate_limit';
  end if;

  if v_kind not in ('image', 'video', 'text') then raise exception 'invalid_story'; end if;
  if v_kind = 'text' then
    if v_media is not null then raise exception 'invalid_story'; end if;
    v_mime := null;
  else
    v_path := substring(v_media from '/storage/v1/object/public/story-media/([^?#]+)$');
    if v_path is null or v_path !~ ('^' || v_actor::text || '/[0-9a-f-]{36}\.(jpg|mp4|webm|mov)$') then
      raise exception 'invalid_media';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'story-media' and o.name = v_path) then
      raise exception 'media_missing';
    end if;
    if (v_kind = 'image' and v_mime not in ('image/jpeg', 'image/png', 'image/webp'))
       or (v_kind = 'video' and v_mime not in ('video/mp4', 'video/webm', 'video/quicktime')) then
      raise exception 'invalid_media';
    end if;
    if v_kind = 'video' and (v_duration is null or v_duration not between 1 and 60000) then
      raise exception 'video_too_long';
    end if;
  end if;

  if not public._story_layout_ok(v_layout) then raise exception 'invalid_layout'; end if;
  if v_kind = 'text' and v_linked_type is null and v_sticker is null
     and jsonb_array_length(coalesce(v_layout -> 'layers', '[]'::jsonb)) = 0 then
    raise exception 'empty_story';
  end if;

  if v_linked_type is not null or v_linked_id is not null then
    if v_linked_type not in ('prompt', 'request', 'workflow', 'preset', 'skill') or v_linked_id is null then
      raise exception 'invalid_story';
    end if;
    select * into v_info from public._community_content_info(v_linked_type, v_linked_id);
    -- Yalnız yayında + herkese açık içerik bağlanır; özel içeriğin varlığı sızmaz.
    if not found or not v_info.shareable then raise exception 'content_not_found'; end if;
    if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then raise exception 'content_not_found'; end if;
  end if;

  if v_sticker is not null then
    if v_sticker not in ('poll', 'question') or v_question is null then raise exception 'invalid_sticker'; end if;
    if v_sticker = 'poll' then
      if jsonb_typeof(p -> 'sticker_options') <> 'array' then raise exception 'invalid_sticker'; end if;
      select array_agg(btrim(value) order by ord) into v_options
        from jsonb_array_elements_text(p -> 'sticker_options') with ordinality as t(value, ord);
      if char_length(v_question) > 80 or cardinality(v_options) not between 2 and 4
         or exists (select 1 from unnest(v_options) o where char_length(o) not between 1 and 40) then
        raise exception 'invalid_sticker';
      end if;
    elsif char_length(v_question) > 120 then
      raise exception 'invalid_sticker';
    end if;
  else
    v_question := null;
  end if;

  if v_audience not in ('public', 'followers', 'community') then raise exception 'invalid_story'; end if;
  if v_audience = 'community' then
    if v_community is null then raise exception 'invalid_story'; end if;
    select * into g from public.chat_groups where id = v_community;
    v_role := public._group_member_role(v_community, v_actor);
    if g.id is null or v_role is null then raise exception 'forbidden'; end if;
    if g.closed_at is not null then raise exception 'community_closed'; end if;
    if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then raise exception 'forbidden'; end if;
  else
    v_community := null;
  end if;

  insert into public.stories (
    author_id, kind, media_url, media_mime, media_width, media_height, media_duration_ms, layout,
    linked_type, linked_id, sticker_kind, sticker_question, sticker_options, audience, community_id,
    client_token, reshared_from, expires_at
  ) values (
    v_actor, v_kind, v_media, v_mime,
    case when v_kind = 'text' then null else nullif(p ->> 'media_width', '')::integer end,
    case when v_kind = 'text' then null else nullif(p ->> 'media_height', '')::integer end,
    case when v_kind = 'video' then v_duration end,
    v_layout, v_linked_type, v_linked_id, v_sticker, v_question, v_options, v_audience, v_community,
    v_token, nullif(p ->> 'reshared_from', '')::uuid, now() + interval '24 hours'
  )
  on conflict (author_id, client_token) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.stories where author_id = v_actor and client_token = v_token;
  end if;
  return v_id;
end;
$$;

-- ============================================================================
-- 2) Kapak görseli
-- ============================================================================
alter table public.skills add column if not exists cover_path text;
alter table public.skills drop constraint if exists skills_cover_path_check;
alter table public.skills add constraint skills_cover_path_check
  check (cover_path is null or (cover_path ~ '^[0-9a-f-]{36}/cover/[0-9a-f-]{36}\.(jpg|png|webp)$' and split_part(cover_path, '/', 1) = id::text));

drop policy if exists "Skill drafts and published packages are readable" on storage.objects;
create policy "Skill drafts and published packages are readable"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'skill-files'
    and (
      ((storage.foldername(name))[2] = 'draft'
        and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid())))
      or ((storage.foldername(name))[2] = 'packages'
        and exists (select 1 from public.skill_versions v where v.package_path = name))
      -- kapak: Skill'i okuyabilen herkes (yayında + herkese açık) ya da sahibi
      or ((storage.foldername(name))[2] = 'cover'
        and exists (select 1 from public.skills s
                     where s.id::text = (storage.foldername(name))[1]
                       and (s.author_id = (select auth.uid()) or (s.status = 'published' and s.visibility = 'public'))))
    )
  );

drop policy if exists "Owners upload skill drafts" on storage.objects;
create policy "Owners upload skill drafts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'skill-files'
    and (name ~ '^[0-9a-f-]{36}/draft/[0-9a-f-]{36}\.[a-z0-9]{1,5}$' or name ~ '^[0-9a-f-]{36}/cover/[0-9a-f-]{36}\.(jpg|png|webp)$')
    and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid()))
  );

drop policy if exists "Owners delete skill drafts" on storage.objects;
create policy "Owners delete skill drafts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'skill-files'
    and (storage.foldername(name))[2] in ('draft', 'cover')
    and exists (select 1 from public.skills s where s.id::text = (storage.foldername(name))[1] and s.author_id = (select auth.uid()))
  );

create or replace function public.orphan_storage_objects(p_min_age interval default '01:00:00'::interval)
returns table(bucket_id text, name text, size bigint, created_at timestamp with time zone)
language sql
stable
security definer
set search_path to 'public', 'storage'
as $function$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select avatar_url from public.chat_groups where avatar_url is not null
    union all select cover_url from public.chat_groups where cover_url is not null
    union all select reference_image_url from public.prompt_requests where reference_image_url is not null
    union all select a->>'path' from public.messages m, jsonb_array_elements(m.attachments) a
    union all select media_url from public.stories where media_url is not null
    union all select media_url from public.story_drafts where media_url is not null
    union all select media_url from public.space_items where media_url like '%/space-media/%'
    union all select cover_url from public.spaces where cover_url is not null
    union all select media_ref from public.prompt_comments where media_kind = 'photo'
    union all select storage_path from public.skill_files
    union all select package_path from public.skill_versions
    union all select cover_path from public.skills where cover_path is not null
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media','community-avatars','story-media','space-media','comment-media','skill-files')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$function$;

-- ============================================================================
-- 9) Yayın akışı RPC'leri (yalnız service_role: Edge Function `skill-package` kimliği doğrular, `p_user`'ı kendisi verir)
-- ============================================================================
-- Sürüm karşılaştırması: 1.10.0 > 1.9.0 (metin değil sayı).
create or replace function public._skill_version_key(p_version text)
returns bigint[]
language sql
immutable
set search_path = public
as $$
  select array[split_part(p_version, '.', 1)::bigint, split_part(p_version, '.', 2)::bigint, split_part(p_version, '.', 3)::bigint]
$$;

-- ============================================================================
-- 3) İlişki Haritası ucu
-- ============================================================================
alter table public.content_relations drop constraint if exists content_relations_source_type_check;
alter table public.content_relations add constraint content_relations_source_type_check check (source_type in ('prompt', 'workflow', 'request', 'skill'));
alter table public.content_relations drop constraint if exists content_relations_target_type_check;
alter table public.content_relations add constraint content_relations_target_type_check check (target_type in ('prompt', 'workflow', 'request', 'skill'));

create or replace function public.content_is_visible(p_type text, p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case p_type
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.deleted_at is null and x.status = 'published')
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.deleted_at is null and not x.is_draft)
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.status = 'published')
    when 'skill' then exists (select 1 from public.skills x where x.id = p_id and x.status = 'published' and x.visibility = 'public')
    else false
  end
$$;

create or replace function public.content_is_mine(p_type text, p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case p_type
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.author_id = (select auth.uid()))
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.author_id = (select auth.uid()))
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.creator_id = (select auth.uid()))
    when 'skill' then exists (select 1 from public.skills x where x.id = p_id and x.author_id = (select auth.uid()))
    else false
  end
$$;

drop trigger if exists skills_cleanup_relations on public.skills;
create trigger skills_cleanup_relations after delete on public.skills
  for each row execute function public.cleanup_content_relations('skill');
