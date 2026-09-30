-- Taslaklar (Bölüm 9.65): prompt + prompt isteği taslakları.
-- Generator ve workflow zaten draft/published durumuna sahip.

-- 1) Prompt isteği taslağı: yeni `is_draft` kolonu (status open/answered/closed kalır).
alter table public.prompt_requests add column if not exists is_draft boolean not null default false;

-- Taslaklar yalnızca yazarına görünür.
drop policy if exists "Requests are publicly readable" on public.prompt_requests;
create policy "Published requests are public, drafts are author-only"
  on public.prompt_requests for select
  using (not is_draft or auth.uid() = author_id);

-- 2) Yayınlandığı an içerik "yeni" sayılsın: created_at yayın anına çekilir.
create or replace function public.reset_created_at_on_publish()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'prompts' then
    if old.status = 'draft' and new.status = 'published' then
      new.created_at := now();
    end if;
  elsif tg_table_name = 'prompt_requests' then
    if old.is_draft and not new.is_draft then
      new.created_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prompts_reset_created_at_on_publish on public.prompts;
create trigger prompts_reset_created_at_on_publish
  before update on public.prompts
  for each row execute function public.reset_created_at_on_publish();

drop trigger if exists prompt_requests_reset_created_at_on_publish on public.prompt_requests;
create trigger prompt_requests_reset_created_at_on_publish
  before update on public.prompt_requests
  for each row execute function public.reset_created_at_on_publish();

-- 3) Etiket sayaçları taslakları saymaz; yayınlanınca sayılır.
create or replace function public.handle_prompt_tag_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.prompts p where p.id = new.prompt_id and p.status = 'published') then
      update public.tags set prompt_usage_count = prompt_usage_count + 1 where slug = new.tag_slug;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.prompts p where p.id = old.prompt_id and p.status = 'draft') then
      update public.tags set prompt_usage_count = greatest(prompt_usage_count - 1, 0) where slug = old.tag_slug;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.handle_request_tag_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.prompt_requests r where r.id = new.request_id and r.is_draft) then
      update public.tags set request_usage_count = request_usage_count + 1 where slug = new.tag_slug;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.prompt_requests r where r.id = old.request_id and r.is_draft) then
      update public.tags set request_usage_count = greatest(request_usage_count - 1, 0) where slug = old.tag_slug;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.count_tags_on_publish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'prompts' then
    if old.status = 'draft' and new.status = 'published' then
      update public.tags t set prompt_usage_count = prompt_usage_count + 1
      where t.slug in (select tag_slug from public.prompt_tags where prompt_id = new.id);
    end if;
  else
    if old.is_draft and not new.is_draft then
      update public.tags t set request_usage_count = request_usage_count + 1
      where t.slug in (select tag_slug from public.prompt_request_tags where request_id = new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prompts_count_tags_on_publish on public.prompts;
create trigger prompts_count_tags_on_publish
  after update on public.prompts
  for each row execute function public.count_tags_on_publish();

drop trigger if exists prompt_requests_count_tags_on_publish on public.prompt_requests;
create trigger prompt_requests_count_tags_on_publish
  after update on public.prompt_requests
  for each row execute function public.count_tags_on_publish();

-- 4) Taslak düzenlemeleri düzenleme/sürüm geçmişine yazılmaz.
create or replace function public.record_prompt_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed boolean;
  v_next_version integer;
  v_source text;
  v_suggestion_id uuid;
  v_editor uuid := auth.uid();
begin
  if old.status = 'draft' then
    return new;
  end if;
  v_changed := (old.title is distinct from new.title)
    or (old.description is distinct from new.description)
    or (old.prompt_text is distinct from new.prompt_text)
    or (old.tool is distinct from new.tool);
  if not v_changed then
    return new;
  end if;
  if not exists (select 1 from public.prompt_versions where prompt_id = new.id) then
    insert into public.prompt_versions (prompt_id, version_number, title, description, prompt_text, tool, source, created_by, created_at)
    values (new.id, 1, old.title, old.description, old.prompt_text, old.tool, 'initial', new.author_id, old.created_at);
  end if;
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.prompt_versions where prompt_id = new.id;
  v_source := coalesce(nullif(current_setting('promptly.version_source', true), ''), 'owner_edit');
  v_suggestion_id := nullif(current_setting('promptly.version_suggestion_id', true), '')::uuid;
  insert into public.prompt_versions (prompt_id, version_number, title, description, prompt_text, tool, source, suggestion_id, created_by, created_at)
  values (new.id, v_next_version, new.title, new.description, new.prompt_text, new.tool, v_source, v_suggestion_id, coalesce(v_editor, new.author_id), now());
  return new;
end;
$$;

create or replace function public.record_prompt_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := array[]::text[];
  v_previous jsonb := '{}'::jsonb;
  v_editor uuid := auth.uid();
begin
  if old.status = 'draft' then
    return new;
  end if;
  if old.title is distinct from new.title then
    v_changed := array_append(v_changed, 'title');
    v_previous := v_previous || jsonb_build_object('title', old.title);
  end if;
  if old.description is distinct from new.description then
    v_changed := array_append(v_changed, 'description');
    v_previous := v_previous || jsonb_build_object('description', old.description);
  end if;
  if old.prompt_text is distinct from new.prompt_text then
    v_changed := array_append(v_changed, 'prompt_text');
    v_previous := v_previous || jsonb_build_object('prompt_text', old.prompt_text);
  end if;
  if old.tool is distinct from new.tool then
    v_changed := array_append(v_changed, 'tool');
    v_previous := v_previous || jsonb_build_object('tool', old.tool);
  end if;
  if array_length(v_changed, 1) is null or v_editor is null then
    return new;
  end if;
  insert into public.content_edits (content_type, content_id, owner_id, editor_id, changed_fields, previous_values)
  values ('prompt', new.id, new.author_id, v_editor, v_changed, v_previous);
  if v_editor <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      new.author_id, v_editor, 'prompt_edited',
      'Promptunu düzenledi: "' || public.truncate_preview(new.title) || '"',
      '/prompts/local?id=' || new.id || '&hl=post:' || new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.record_request_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := array[]::text[];
  v_previous jsonb := '{}'::jsonb;
  v_editor uuid := auth.uid();
begin
  if old.is_draft then
    return new;
  end if;
  if old.title is distinct from new.title then
    v_changed := array_append(v_changed, 'title');
    v_previous := v_previous || jsonb_build_object('title', old.title);
  end if;
  if old.description is distinct from new.description then
    v_changed := array_append(v_changed, 'description');
    v_previous := v_previous || jsonb_build_object('description', old.description);
  end if;
  if old.creative_direction is distinct from new.creative_direction then
    v_changed := array_append(v_changed, 'creative_direction');
    v_previous := v_previous || jsonb_build_object('creative_direction', old.creative_direction);
  end if;
  if old.preferred_tool is distinct from new.preferred_tool then
    v_changed := array_append(v_changed, 'preferred_tool');
    v_previous := v_previous || jsonb_build_object('preferred_tool', old.preferred_tool);
  end if;
  if array_length(v_changed, 1) is null or v_editor is null then
    return new;
  end if;
  insert into public.content_edits (content_type, content_id, owner_id, editor_id, changed_fields, previous_values)
  values ('prompt_request', new.id, new.author_id, v_editor, v_changed, v_previous);
  if v_editor <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      new.author_id, v_editor, 'request_edited',
      'Prompt isteğini düzenledi: "' || public.truncate_preview(new.title) || '"',
      '/requests/local?id=' || new.id || '&hl=request:' || new.id
    );
  end if;
  return new;
end;
$$;

-- Yükselen etiketler taslak istekleri saymaz.
create or replace function public.trending_tags(p_limit integer default 12, p_window_days integer default 7)
returns table(slug text, label text, recent_count bigint, previous_count bigint)
language sql stable set search_path = public as $$
  with recent_prompt as (
    select pt.tag_slug, count(*) as c
    from public.prompt_tags pt
    join public.prompts p on p.id = pt.prompt_id
    where p.status = 'published' and p.created_at >= now() - make_interval(days => p_window_days)
    group by pt.tag_slug
  ),
  previous_prompt as (
    select pt.tag_slug, count(*) as c
    from public.prompt_tags pt
    join public.prompts p on p.id = pt.prompt_id
    where p.status = 'published'
      and p.created_at >= now() - make_interval(days => p_window_days * 2)
      and p.created_at < now() - make_interval(days => p_window_days)
    group by pt.tag_slug
  ),
  recent_request as (
    select rt.tag_slug, count(*) as c
    from public.prompt_request_tags rt
    join public.prompt_requests r on r.id = rt.request_id
    where not r.is_draft and r.created_at >= now() - make_interval(days => p_window_days)
    group by rt.tag_slug
  ),
  previous_request as (
    select rt.tag_slug, count(*) as c
    from public.prompt_request_tags rt
    join public.prompt_requests r on r.id = rt.request_id
    where not r.is_draft
      and r.created_at >= now() - make_interval(days => p_window_days * 2)
      and r.created_at < now() - make_interval(days => p_window_days)
    group by rt.tag_slug
  ),
  combined as (
    select
      t.slug,
      t.label,
      coalesce((select c from recent_prompt where recent_prompt.tag_slug = t.slug), 0)
        + coalesce((select c from recent_request where recent_request.tag_slug = t.slug), 0) as recent_count,
      coalesce((select c from previous_prompt where previous_prompt.tag_slug = t.slug), 0)
        + coalesce((select c from previous_request where previous_request.tag_slug = t.slug), 0) as previous_count
    from public.tags t
  )
  select slug, label, recent_count, previous_count
  from combined
  where recent_count > 0
  order by (recent_count - previous_count) desc, recent_count desc, label asc
  limit p_limit;
$$;
