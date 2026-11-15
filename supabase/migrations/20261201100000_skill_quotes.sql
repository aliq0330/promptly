-- Skill alıntılama (docs/history/394-*): Skill, `content_quotes`'un altıncı hedefidir (Prompt, İstek, Workflow, Ayar paketi, Space, Skill).
--
-- Alıntı Skill'in kopyası değil başvurusudur; kendi beğeni/yorum/istatistik/bildirimi alıntıya aittir ve alıntılanan Skill'in sayaçlarına
-- karışmaz (217'nin kuralı). Yalnız yayında + herkese açık Skill alıntılanır. Yazma yolu hâlâ TEK `create_quote` RPC'sidir.
--
-- `-- ci:allow-destructive`: `content_quotes.target_id` üretilmiş sütunu yeni hedefi kapsayacak biçimde yeniden kurulur (PostgreSQL üretilmiş
-- ifadeyi değiştirmeye izin vermez) ve ona bağlı okuma politikası + dizin aynı işlemde yeniden yazılır; üç CHECK kısıtı da yeni hedefi kapsar.
-- Veri silinmez; sütun aynı satırlardan yeniden hesaplanır.

-- ============================================================================
-- 1) content_quotes: `skill_id` + yeniden kurulan `target_id` + kısıtlar
-- ============================================================================
alter table public.content_quotes
  add column if not exists skill_id uuid references public.skills (id) on delete cascade;

drop policy if exists "Quotes are readable while their target is public" on public.content_quotes;
drop index if exists public.content_quotes_author_target_idx;
alter table public.content_quotes drop column target_id;
alter table public.content_quotes
  add column target_id uuid generated always as (coalesce(prompt_id, request_id, workflow_id, preset_id, space_id, skill_id)) stored;

create index content_quotes_author_target_idx on public.content_quotes (author_id, content_type, target_id, created_at desc);
create index if not exists content_quotes_skill_idx on public.content_quotes (skill_id) where skill_id is not null;

create policy "Quotes are readable while their target is public" on public.content_quotes
  for select using (
    public.quote_target_ok(content_type, target_id)
    and not public.is_blocked(auth.uid(), author_id)
  );

alter table public.content_quotes drop constraint content_quotes_type_check;
alter table public.content_quotes add constraint content_quotes_type_check
  check (content_type in ('prompt', 'request', 'workflow', 'preset', 'space', 'skill'));
alter table public.content_quotes drop constraint content_quotes_exactly_one_target;
alter table public.content_quotes add constraint content_quotes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer
  + (preset_id is not null)::integer + (space_id is not null)::integer + (skill_id is not null)::integer = 1
);
alter table public.content_quotes drop constraint content_quotes_type_matches_target;
alter table public.content_quotes add constraint content_quotes_type_matches_target check (
  (content_type = 'prompt' and prompt_id is not null)
  or (content_type = 'request' and request_id is not null)
  or (content_type = 'workflow' and workflow_id is not null)
  or (content_type = 'preset' and preset_id is not null)
  or (content_type = 'space' and space_id is not null)
  or (content_type = 'skill' and skill_id is not null)
);

-- ============================================================================
-- 2) Skill'de korumalı `quote_count` ("N kez alıntılandı") + sayaç tetikleyicisi
-- ============================================================================
alter table public.skills add column if not exists quote_count integer not null default 0;

drop trigger if exists skills_protect_quote_count on public.skills;
create trigger skills_protect_quote_count
  before insert or update of quote_count on public.skills
  for each row execute function public.protect_counter_columns('quote_count');

create or replace function public.handle_quote_count_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set quote_count = quote_count + 1 where id = new.prompt_id;
    elsif new.request_id is not null then
      update public.prompt_requests set quote_count = quote_count + 1 where id = new.request_id;
    elsif new.workflow_id is not null then
      update public.workflows set quote_count = quote_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set quote_count = quote_count + 1 where id = new.preset_id;
    elsif new.space_id is not null then
      update public.spaces set quote_count = quote_count + 1 where id = new.space_id;
    elsif new.skill_id is not null then
      update public.skills set quote_count = quote_count + 1 where id = new.skill_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set quote_count = greatest(quote_count - 1, 0) where id = old.prompt_id;
    elsif old.request_id is not null then
      update public.prompt_requests set quote_count = greatest(quote_count - 1, 0) where id = old.request_id;
    elsif old.workflow_id is not null then
      update public.workflows set quote_count = greatest(quote_count - 1, 0) where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set quote_count = greatest(quote_count - 1, 0) where id = old.preset_id;
    elsif old.space_id is not null then
      update public.spaces set quote_count = greatest(quote_count - 1, 0) where id = old.space_id;
    elsif old.skill_id is not null then
      update public.skills set quote_count = greatest(quote_count - 1, 0) where id = old.skill_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
revoke all on function public.handle_quote_count_change() from public, anon, authenticated;

-- ============================================================================
-- 3) Yardımcılar: hedef bilgisi + başlık (Skill kolu)
-- ============================================================================
create or replace function public._quote_content_info(p_type text, p_id uuid)
returns table (owner_id uuid, shareable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'prompt' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
      from public.prompts x where x.id = p_id;
  elsif p_type = 'request' then
    return query select x.author_id, (not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
      from public.prompt_requests x where x.id = p_id;
  elsif p_type = 'workflow' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null)
      from public.workflows x where x.id = p_id;
  elsif p_type = 'preset' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null)
      from public.presets x where x.id = p_id;
  elsif p_type = 'space' then
    return query select x.owner_id, (x.visibility = 'public' and x.archived_at is null)
      from public.spaces x where x.id = p_id;
  elsif p_type = 'skill' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public')
      from public.skills x where x.id = p_id;
  end if;
end;
$$;
revoke all on function public._quote_content_info(text, uuid) from public, anon, authenticated;

create or replace function public._quote_target_title(p_type text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(case p_type
    when 'prompt' then (select title from public.prompts where id = p_id)
    when 'request' then (select title from public.prompt_requests where id = p_id)
    when 'workflow' then (select title from public.workflows where id = p_id)
    when 'preset' then (select title from public.presets where id = p_id)
    when 'space' then (select title from public.spaces where id = p_id)
    when 'skill' then (select title from public.skills where id = p_id)
  end, '');
$$;
revoke all on function public._quote_target_title(text, uuid) from public, anon, authenticated;

-- ============================================================================
-- 4) create_quote: tek yazma yolu, Skill kabul eder (kurallar 217/241'dekiyle aynı)
-- ============================================================================
create or replace function public.create_quote(p_content_type text, p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
  v_items integer;
  v_images integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset', 'space', 'skill') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._quote_content_info(p_content_type, p_content_id);
  if not found then
    raise exception 'content_not_found';
  end if;
  if not v_info.shareable then
    -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
    if v_info.owner_id is distinct from v_actor then
      raise exception 'content_not_found';
    end if;
    raise exception 'content_not_public';
  end if;
  if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then
    raise exception 'blocked';
  end if;

  -- Space: eskiden "akışa çıkış" eşiği (boş Space akışı doldurmasın) artık HER alıntının şartı.
  if p_content_type = 'space' then
    select count(*), count(*) filter (where i.kind = 'image') into v_items, v_images
      from public.space_items i where i.space_id = p_content_id;
    if v_items < 3 or v_images < 1 then
      raise exception 'space_too_empty';
    end if;
  end if;

  -- Aynı kişinin eşzamanlı iki isteği sınırı aşmasın.
  perform pg_advisory_xact_lock(hashtextextended('quote:' || v_actor::text, 0));
  if exists (
    select 1 from public.content_quotes q
     where q.author_id = v_actor and q.content_type = p_content_type and q.target_id = p_content_id
       and (q.created_at > now() - interval '24 hours'
            -- Sahibin kendi Space'ini akışta paylaşması = tek kayıt; kaldırmadan ikinci paylaşım olmaz.
            or (p_content_type = 'space' and v_info.owner_id = v_actor))
  ) then
    raise exception 'already_quoted';
  end if;
  if (select count(*) from public.content_quotes where author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'quote_rate_limit';
  end if;

  insert into public.content_quotes (id, author_id, content_type, prompt_id, request_id, workflow_id, preset_id, space_id, skill_id, note)
  values (
    v_id, v_actor, p_content_type,
    case when p_content_type = 'prompt' then p_content_id end,
    case when p_content_type = 'request' then p_content_id end,
    case when p_content_type = 'workflow' then p_content_id end,
    case when p_content_type = 'preset' then p_content_id end,
    case when p_content_type = 'space' then p_content_id end,
    case when p_content_type = 'skill' then p_content_id end,
    v_note
  );
  return v_id;
end;
$$;
revoke all on function public.create_quote(text, uuid, text) from public, anon;
grant execute on function public.create_quote(text, uuid, text) to authenticated;

-- ============================================================================
-- 5) Alıntı araması: Skill başlığı da eşleşir (INVOKER: okunamayan alıntı hiç dönmez)
-- ============================================================================
create or replace function public.search_quotes(p_query text, p_limit integer default 24, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_pat text;
begin
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  v_pat := '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select q.id, q.created_at
      from public.content_quotes q
     where (q.note ilike v_pat
            or case q.content_type
                 when 'prompt' then exists (select 1 from public.prompts t where t.id = q.prompt_id and t.title ilike v_pat)
                 when 'request' then exists (select 1 from public.prompt_requests t where t.id = q.request_id and t.title ilike v_pat)
                 when 'workflow' then exists (select 1 from public.workflows t where t.id = q.workflow_id and t.title ilike v_pat)
                 when 'preset' then exists (select 1 from public.presets t where t.id = q.preset_id and t.title ilike v_pat)
                 when 'space' then exists (select 1 from public.spaces t where t.id = q.space_id and t.title ilike v_pat)
                 when 'skill' then exists (select 1 from public.skills t where t.id = q.skill_id and t.title ilike v_pat)
                 else false
               end)
       and (p_after_id is null or (q.created_at, q.id) < (p_after_created_at, p_after_id))
     order by q.created_at desc, q.id desc
     limit least(greatest(coalesce(p_limit, 24), 1), 50);
end;
$$;
revoke execute on function public.search_quotes(text, integer, timestamptz, uuid) from public;
grant execute on function public.search_quotes(text, integer, timestamptz, uuid) to anon, authenticated;
