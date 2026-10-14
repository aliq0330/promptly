-- Generator içerik türünün kalıcı olarak kaldırılması (CLAUDE.md §9.145, Aşama 3).
-- GERİ DÖNÜŞSÜZ: generators / generator_* tabloları ve diğer tablolardaki generator_id
-- kolonları düşer. Canlıdaki 61 generator'ın hepsi demo (5eed…) içerikti; gerçek kullanıcı
-- verisi yoktu. Workflow'lardaki generator adımları kaldırılıp zincir yeniden bağlanır.

-- 1) Workflow'lardaki generator adımlarını çıkar, zinciri yeniden bağla ------------------
do $$
declare
  g record;
  src record;
  nxt record;
begin
  for g in select id, workflow_id, position, inputs from public.workflow_steps where step_type = 'generator' loop
    -- Bu adımın girdisinin geldiği kaynak (varsa)
    select (i -> 'source' ->> 'stepId')::uuid as step_id, i -> 'source' ->> 'outputId' as output_id
      into src
      from jsonb_array_elements(g.inputs) i
      where i -> 'source' ->> 'stepId' is not null
      limit 1;

    -- Çıktısını tüketen adımların girdi kaynağını, generator'ın kaynağına çevir (yoksa bağlantıyı kopar)
    for nxt in select id, inputs from public.workflow_steps
               where workflow_id = g.workflow_id and id <> g.id
                 and inputs::text like '%' || g.id::text || '%'
    loop
      update public.workflow_steps ws
        set inputs = (
          select coalesce(jsonb_agg(
            case
              when i -> 'source' ->> 'stepId' = g.id::text then
                case when src.step_id is not null
                  then jsonb_set(i, '{source}', jsonb_build_object('stepId', src.step_id::text, 'outputId', src.output_id))
                  else i - 'source'
                end
              else i
            end order by ord), '[]'::jsonb)
          from jsonb_array_elements(ws.inputs) with ordinality as t(i, ord))
        where ws.id = nxt.id;
    end loop;

    delete from public.workflow_connections where from_step_id = g.id or to_step_id = g.id;
    delete from public.workflow_steps where id = g.id;
    update public.workflow_steps set position = position - 1
      where workflow_id = g.workflow_id and position > g.position;
  end loop;
end $$;

-- Yeniden bağlanan girdiler için workflow_connections'ı kaynak–hedef girdilerden yeniden üret
insert into public.workflow_connections (workflow_id, from_step_id, to_step_id, output_key, input_key)
select ws.workflow_id, (i -> 'source' ->> 'stepId')::uuid, ws.id, i -> 'source' ->> 'outputId', i ->> 'id'
from public.workflow_steps ws, jsonb_array_elements(ws.inputs) i
where i -> 'source' ->> 'stepId' is not null
  and not exists (
    select 1 from public.workflow_connections c
    where c.to_step_id = ws.id and c.from_step_id = (i -> 'source' ->> 'stepId')::uuid
      and c.output_key = i -> 'source' ->> 'outputId' and c.input_key = i ->> 'id');

-- 2) Generator'a bağlı verileri temizle ---------------------------------------------------
delete from public.notifications
  where type = 'generator_edited' or target_href like '/generators/%';
-- Yanıtı olan yorumun DELETE'i soft-delete'e çevrilir (Bölüm 9.5 tetikleyicisi); satır kalıp
-- generator_id düşünce hedefsiz (CHECK ihlali) olurdu. Bu yüzden yapraklardan başlayarak sil.
do $$
begin
  loop
    delete from public.prompt_comments c
      where c.generator_id is not null
        and not exists (select 1 from public.prompt_comments x where x.parent_id = c.id);
    exit when not found;
  end loop;
end $$;
delete from public.prompt_likes where generator_id is not null;
delete from public.collection_items where generator_id is not null;
delete from public.content_relations where source_type = 'generator' or target_type = 'generator';
delete from public.content_edits where content_type = 'generator';
delete from public.reports where target_type = 'generator';
-- (Uzlaştırma notu: `studio_sessions` canlıda bu migration'dan SONRA 640000 ile düşürüldü;
-- repo sırasında ise ondan ÖNCE düşüyor. Taze kurulumda tablo yoksa bu ifade atlanır.)
do $studio$ begin
  if to_regclass('public.studio_sessions') is not null then
    execute $q$update public.studio_sessions set active_kind = null where active_kind = 'generator'$q$;
  end if;
end $studio$;

-- 3) Generator'a özgü trigger / fonksiyonlar ----------------------------------------------
drop trigger if exists prompt_likes_after_insert_notify_generator on public.prompt_likes;
drop trigger if exists prompt_likes_after_delete_cleanup_generator_notification on public.prompt_likes;
drop trigger if exists prompt_comments_after_insert_notify_generator on public.prompt_comments;
drop function if exists public.notify_generator_like() cascade;
drop function if exists public.cleanup_generator_like_notification() cascade;
drop function if exists public.notify_generator_comment() cascade;
drop function if exists public.record_generator_edit() cascade;
drop function if exists public.handle_generator_save_change() cascade;
drop function if exists public.handle_generator_run_created() cascade;
drop function if exists public.remove_generator_from_saved_everywhere(uuid) cascade;

-- 4) Generator'a atıfta bulunan politikalar ------------------------------------------------
drop policy if exists "Authenticated users can comment on visible targets" on public.prompt_comments;
drop policy if exists "Comments are readable wherever their target is readable" on public.prompt_comments;
drop policy if exists "Authenticated users can share a result for a visible prompt or " on public.prompt_results;
drop policy if exists "Prompt results are readable wherever their prompt or generator " on public.prompt_results;

-- 5) Diğer tablolardaki generator kolonları (FK / index / check birlikte düşer) ------------
alter table public.prompt_likes drop column generator_id;
alter table public.prompt_comments drop column generator_id;
alter table public.collection_items drop column generator_id;
alter table public.prompt_results drop column generator_id;
alter table public.workflow_steps drop column generator_id;
alter table public.prompts drop column generator_run_id, drop column generator_version_id, drop column generator_id;

-- 6) Generator tabloları -------------------------------------------------------------------
drop table public.generator_runs cascade;
drop table public.generator_saves cascade;
drop table public.generator_tags cascade;
drop table public.generator_media cascade;
drop table public.generator_versions cascade;
drop table public.generators cascade;

-- 7) CHECK kısıtları -----------------------------------------------------------------------
alter table public.prompt_results alter column prompt_id set not null;

alter table public.prompt_likes drop constraint if exists prompt_likes_exactly_one_target;
alter table public.prompt_likes add constraint prompt_likes_exactly_one_target check (
  (prompt_id is not null)::int + (request_id is not null)::int + (result_id is not null)::int
  + (workflow_id is not null)::int + (preset_id is not null)::int = 1);

alter table public.prompt_comments drop constraint if exists prompt_comments_exactly_one_target;
alter table public.prompt_comments add constraint prompt_comments_exactly_one_target check (
  (prompt_id is not null)::int + (request_id is not null)::int + (result_id is not null)::int
  + (workflow_id is not null)::int + (preset_id is not null)::int = 1);

alter table public.collection_items drop constraint if exists collection_items_exactly_one_target;
alter table public.collection_items add constraint collection_items_exactly_one_target check (
  (prompt_id is not null)::int + (workflow_id is not null)::int + (preset_id is not null)::int = 1);

alter table public.workflow_steps drop constraint if exists workflow_steps_step_type_check;
alter table public.workflow_steps add constraint workflow_steps_step_type_check check (step_type in ('prompt', 'request'));
alter table public.workflow_steps drop constraint if exists workflow_steps_ref_matches_type;
alter table public.workflow_steps add constraint workflow_steps_ref_matches_type check (
  (prompt_id is null or step_type = 'prompt') and (request_id is null or step_type = 'request'));

alter table public.content_edits drop constraint if exists content_edits_content_type_check;
alter table public.content_edits add constraint content_edits_content_type_check check (content_type in ('prompt', 'prompt_request'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow', 'like', 'comment', 'comment_reply', 'request_response', 'message', 'message_request', 'system',
  'prompt_edited', 'request_edited', 'edit_suggestion_received', 'edit_suggestion_accepted',
  'edit_suggestion_rejected', 'prompt_result_shared'));

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('prompt', 'comment', 'request', 'user', 'message', 'workflow', 'preset'));

do $studio$ begin
  if to_regclass('public.studio_sessions') is not null then
    execute 'alter table public.studio_sessions drop constraint if exists studio_sessions_active_kind_check';
    execute $q$alter table public.studio_sessions add constraint studio_sessions_active_kind_check check (
      active_kind is null or active_kind in ('prompt', 'preset', 'workflow'))$q$;
  end if;
end $studio$;

alter table public.content_relations drop constraint if exists content_relations_source_type_check;
alter table public.content_relations add constraint content_relations_source_type_check check (source_type in ('prompt', 'workflow', 'request'));
alter table public.content_relations drop constraint if exists content_relations_target_type_check;
alter table public.content_relations add constraint content_relations_target_type_check check (target_type in ('prompt', 'workflow', 'request'));

-- 8) Politikalar (generator kolları çıkarıldı) ---------------------------------------------
create policy "Comments are readable wherever their target is readable" on public.prompt_comments
  for select using (
    (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
    or request_id is not null
    or (result_id is not null and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
    or (workflow_id is not null and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
    or (preset_id is not null and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))))
  );

create policy "Authenticated users can comment on visible targets" on public.prompt_comments
  for insert to authenticated with check (
    auth.uid() = author_id and (
      (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
      or request_id is not null
      or (result_id is not null and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
      or (workflow_id is not null and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
      or (preset_id is not null and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))))
    ));

create policy "Prompt results are readable wherever their prompt is readable" on public.prompt_results
  for select using (exists (select 1 from public.prompts p where p.id = prompt_results.prompt_id and (p.status = 'published' or p.author_id = auth.uid())));

create policy "Authenticated users can share a result for a visible prompt" on public.prompt_results
  for insert to authenticated with check (
    auth.uid() = creator_id and exists (select 1 from public.prompts p where p.id = prompt_results.prompt_id and p.status = 'published'));

-- 9) Paylaşılan fonksiyonlar (generator dalları çıkarıldı) ---------------------------------
create or replace function public._engager_content_visible(p_content_type text, p_content_id uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and ((p.status = 'published' and p.visibility = 'public') or p.author_id = auth.uid()))
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and ((not r.is_draft and r.visibility = 'public') or r.author_id = auth.uid()))
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id and (w.creator_id = auth.uid() or (w.status = 'published' and w.visibility = 'public')))
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public')))
    else false
  end;
$$;

create or replace function public.content_is_mine(p_type text, p_id uuid)
 returns boolean language sql stable set search_path to 'public' as $$
  select case p_type
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.author_id = auth.uid())
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.author_id = auth.uid())
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.creator_id = auth.uid())
    else false
  end
$$;

create or replace function public.content_is_visible(p_type text, p_id uuid)
 returns boolean language sql stable set search_path to 'public' as $$
  select case p_type
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.deleted_at is null and x.status = 'published')
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.deleted_at is null and not x.is_draft)
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.status = 'published')
    else false
  end
$$;

create or replace function public.content_engagers(p_content_type text, p_content_id uuid, p_kind text, p_limit integer default 20, p_before_at timestamp with time zone default null, p_before_actor uuid default null)
 returns table(actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, actor_follower_count integer, interacted_at timestamp with time zone, comment_id uuid, comment_body text)
 language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_col text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_kind not in ('likes', 'comments', 'saves') then
    raise exception 'invalid kind';
  end if;

  v_col := case p_content_type
    when 'prompt' then 'prompt_id'
    when 'request' then 'request_id'
    when 'workflow' then 'workflow_id'
    when 'preset' then 'preset_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  if p_kind = 'saves' and p_content_type = 'request' then
    return;
  end if;

  if p_kind = 'likes' then
    return query execute format($q$
      select l.user_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             l.created_at, null::uuid, null::text
      from public.prompt_likes l
      left join public.profiles p on p.id = l.user_id
      where l.%I = $1
        and ($2 is null or (l.created_at, l.user_id) < ($2, $3))
      order by l.created_at desc, l.user_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  elsif p_kind = 'comments' then
    return query execute format($q$
      select x.author_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             x.created_at, x.id, x.body
      from (
        select distinct on (c.author_id) c.author_id, c.created_at, c.id, c.body
        from public.prompt_comments c
        where c.%I = $1 and c.deleted_at is null
        order by c.author_id, c.created_at desc, c.id desc
      ) x
      left join public.profiles p on p.id = x.author_id
      where ($2 is null or (x.created_at, x.author_id) < ($2, $3))
      order by x.created_at desc, x.author_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  else
    return query execute format($q$
      select s.owner_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             s.saved_at, null::uuid, null::text
      from (
        select c.owner_id, max(ci.created_at) as saved_at
        from public.collection_items ci
        join public.collections c on c.id = ci.collection_id
        where ci.%I = $1
        group by c.owner_id
      ) s
      left join public.profiles p on p.id = s.owner_id
      where ($2 is null or (s.saved_at, s.owner_id) < ($2, $3))
      order by s.saved_at desc, s.owner_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;
  end if;
end;
$function$;

create or replace function public.handle_collection_items_delete_save_counts()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_pair record;
  v_remaining int;
begin
  for v_pair in
    select distinct c.owner_id, ot.prompt_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.prompt_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.prompt_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.prompts set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;

  for v_pair in
    select distinct c.owner_id, ot.workflow_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.workflow_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.workflow_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.workflows set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;

  return null;
end;
$function$;

create or replace function public.handle_collection_items_insert_save_counts()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_pair record;
  v_inserted_count int;
  v_total_count int;
begin
  for v_pair in
    select distinct c.owner_id, nt.prompt_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.prompt_id is not null
  loop
    select count(*) into v_inserted_count from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.prompt_id = v_pair.target_id;
    select count(*) into v_total_count from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.prompt_id = v_pair.target_id;
    if v_total_count - v_inserted_count <= 0 then
      update public.prompts set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;

  for v_pair in
    select distinct c.owner_id, nt.workflow_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.workflow_id is not null
  loop
    select count(*) into v_inserted_count from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.workflow_id = v_pair.target_id;
    select count(*) into v_total_count from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.workflow_id = v_pair.target_id;
    if v_total_count - v_inserted_count <= 0 then
      update public.workflows set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;

  return null;
end;
$function$;

create or replace function public.handle_collections_before_delete_save_counts()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_item record;
  v_remaining boolean;
begin
  for v_item in
    select prompt_id, workflow_id
    from public.collection_items
    where collection_id = old.id
  loop
    if v_item.prompt_id is not null then
      select exists(
        select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
        where c.owner_id = old.owner_id and c.id <> old.id and ci.prompt_id = v_item.prompt_id
      ) into v_remaining;
      if not v_remaining then
        update public.prompts set save_count = greatest(0, save_count - 1) where id = v_item.prompt_id;
      end if;
    elsif v_item.workflow_id is not null then
      select exists(
        select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
        where c.owner_id = old.owner_id and c.id <> old.id and ci.workflow_id = v_item.workflow_id
      ) into v_remaining;
      if not v_remaining then
        update public.workflows set save_count = greatest(0, save_count - 1) where id = v_item.workflow_id;
      end if;
    end if;
  end loop;
  return old;
end;
$function$;

create or replace function public.handle_prompt_comment_change()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set comment_count = comment_count + 1 where id = new.prompt_id;
    elsif new.result_id is not null then
      update public.prompt_results set comment_count = comment_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set comment_count = comment_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set comment_count = comment_count + 1 where id = new.preset_id;
    else
      update public.prompt_requests set comment_count = comment_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set comment_count = comment_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set comment_count = comment_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set comment_count = comment_count - 1 where id = old.preset_id;
    else
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$function$;

create or replace function public.handle_prompt_like_change()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set like_count = like_count + 1 where id = new.prompt_id;
    elsif new.result_id is not null then
      update public.prompt_results set like_count = like_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set like_count = like_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set like_count = like_count + 1 where id = new.preset_id;
    else
      update public.prompt_requests set like_count = like_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set like_count = like_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set like_count = like_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set like_count = like_count - 1 where id = old.preset_id;
    else
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$function$;

create or replace function public.notify_comment_like()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_comment_author uuid;
  v_prompt_id uuid;
  v_request_id uuid;
  v_result_id uuid;
  v_workflow_id uuid;
  v_preset_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, result_id, workflow_id, preset_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_result_id, v_workflow_id, v_preset_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  v_href := (case
    when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
    when v_result_id is not null then '/results/local?id=' || v_result_id
    when v_workflow_id is not null then '/workflows/local?id=' || v_workflow_id
    when v_preset_id is not null then '/presets/local?id=' || v_preset_id
    else '/requests/local?id=' || v_request_id
  end) || '&hl=comment:' || new.comment_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_comment_author, new.user_id, 'like',
    'Yorumunu beğendi: "' || public.truncate_preview(v_body) || '"', v_href,
    'comment_like:' || new.comment_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$function$;

create or replace function public.notify_comment_reply()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_parent_author uuid;
  v_post_author uuid;
  v_href text;
begin
  if new.workflow_id is not null or new.preset_id is not null then
    return new;
  end if;

  v_href := (case
    when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
    when new.result_id is not null then '/results/local?id=' || new.result_id
    else '/requests/local?id=' || new.request_id
  end) || '&hl=comment:' || new.id;

  if new.parent_id is not null then
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_parent_author, new.author_id, 'comment_reply',
      'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href
    );
  else
    if new.prompt_id is not null then
      select author_id into v_post_author from public.prompts where id = new.prompt_id;
    elsif new.result_id is not null then
      select creator_id into v_post_author from public.prompt_results where id = new.result_id;
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      (case
        when new.prompt_id is not null then 'Paylaşımına yorum yaptı: "'
        when new.result_id is not null then 'Sonucuna yorum yaptı: "'
        else 'İsteğine yorum yaptı: "'
      end) || public.truncate_preview(new.body) || '"',
      v_href
    );
  end if;

  return new;
end;
$function$;

create or replace function public.notify_new_prompt_result()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_owner_id uuid;
  v_title text;
begin
  select author_id, title into v_owner_id, v_title from public.prompts where id = new.prompt_id;

  if v_owner_id is null or v_owner_id = new.creator_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (v_owner_id, new.creator_id, 'prompt_result_shared',
    'Promptun için bir sonuç paylaştı: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/results/local?id=' || new.id);
  return new;
end;
$function$;

create or replace function public.prompt_results_before_update_guard()
 returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.prompt_id is distinct from old.prompt_id
    or new.creator_id is distinct from old.creator_id
    or new.media_type is distinct from old.media_type
    or new.media_url is distinct from old.media_url
    or new.thumbnail_url is distinct from old.thumbnail_url
    or new.width is distinct from old.width
    or new.height is distinct from old.height
  then
    raise exception 'prompt_results: yalnızca tool, text_content, has_modification, modification_summary, modified_prompt_text alanları düzenlenebilir.';
  end if;
  return new;
end;
$function$;

create or replace function public.orphan_storage_objects(p_min_age interval default '01:00:00')
 returns table(bucket_id text, name text, size bigint, created_at timestamp with time zone)
 language sql stable security definer set search_path to 'public', 'storage' as $$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select reference_image_url from public.prompt_requests where reference_image_url is not null
    union all select a->>'path' from public.messages m, jsonb_array_elements(m.attachments) a
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$$;

create or replace function public.save_workflow_graph(p_workflow_id uuid, p_steps jsonb, p_connections jsonb)
 returns void language plpgsql set search_path to 'public' as $function$
begin
  if not exists (select 1 from public.workflows where id = p_workflow_id and creator_id = auth.uid()) then
    raise exception 'workflow not found or not yours';
  end if;

  if exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s where s ->> 'step_type' in ('request', 'generator')) then
    raise exception 'only prompt steps are allowed in a workflow';
  end if;

  delete from public.workflow_steps where workflow_id = p_workflow_id;

  insert into public.workflow_steps
    (id, workflow_id, position, title, description, instructions, step_type, prompt_id, request_id, inputs, outputs)
  select
    (s ->> 'id')::uuid,
    p_workflow_id,
    (s ->> 'position')::int,
    coalesce(s ->> 'title', ''),
    coalesce(s ->> 'description', ''),
    coalesce(s ->> 'instructions', ''),
    s ->> 'step_type',
    nullif(s ->> 'prompt_id', '')::uuid,
    nullif(s ->> 'request_id', '')::uuid,
    coalesce(s -> 'inputs', '[]'::jsonb),
    coalesce(s -> 'outputs', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s;

  insert into public.workflow_connections (workflow_id, from_step_id, to_step_id, output_key, input_key)
  select
    p_workflow_id,
    (c ->> 'from_step_id')::uuid,
    (c ->> 'to_step_id')::uuid,
    c ->> 'output_key',
    c ->> 'input_key'
  from jsonb_array_elements(coalesce(p_connections, '[]'::jsonb)) c;

  update public.workflows set updated_at = now() where id = p_workflow_id;
end;
$function$;

create or replace function public.moderate_report(p_report_id uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  if p_action not in ('dismissed', 'reviewed', 'removed') then raise exception 'Geçersiz işlem.'; end if;
  select * into r from public.reports where id = p_report_id;
  if not found then raise exception 'Şikâyet bulunamadı.'; end if;
  if p_action = 'removed' then
    if r.target_type = 'prompt' then delete from public.prompts where id = r.target_id;
    elsif r.target_type = 'request' then delete from public.prompt_requests where id = r.target_id;
    elsif r.target_type = 'workflow' then delete from public.workflows where id = r.target_id;
    elsif r.target_type = 'preset' then delete from public.presets where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    else raise exception 'Bu hedef türü kaldırılamaz.';
    end if;
  end if;
  update public.reports
    set status = case when p_action = 'dismissed' then 'dismissed' else 'reviewed' end,
        reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_report_id;
  if p_action = 'removed' then
    update public.reports set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
      resolution_note = coalesce(resolution_note, 'İçerik kaldırıldı.')
      where target_type = r.target_type and target_id = r.target_id and status = 'open';
  end if;
end $function$;

create or replace function public.moderation_report_queue(p_status text default 'open')
 returns table(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href
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
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $function$;

-- 10) Yönetim konsolu istatistikleri -------------------------------------------------------
create or replace function public.admin_site_stats(p_content_type text default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb;
begin
  perform public._admin_guard();
  select jsonb_build_object(
    'users', (select jsonb_build_object(
        'total', count(*),
        'new_7d', count(*) filter (where created_at > now() - interval '7 days'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days'),
        'suspended', count(*) filter (where suspended_until > now()),
        'posting_blocked', count(*) filter (where posting_blocked),
        'moderators', count(*) filter (where role = 'moderator')) from public.profiles),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'content', jsonb_build_object(
      'prompts', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.prompts where deleted_at is null and (p_content_type is null or content_type = p_content_type)),
      'requests', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where not is_draft),
          'draft', count(*) filter (where is_draft), 'private', count(*) filter (where visibility = 'private'))
        from public.prompt_requests where deleted_at is null and (p_content_type is null or content_type = p_content_type)),
      'workflows', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.workflows where (p_content_type is null or p_content_type = any (content_types))),
      'presets', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'),
          'draft', count(*) filter (where status = 'draft'), 'private', count(*) filter (where visibility = 'private'))
        from public.presets where (p_content_type is null or content_type = p_content_type))
    ),
    'by_type', (select jsonb_object_agg(t.ct, jsonb_build_object(
        'prompts', (select count(*) from public.prompts where deleted_at is null and content_type = t.ct),
        'requests', (select count(*) from public.prompt_requests where deleted_at is null and content_type = t.ct),
        'workflows', (select count(*) from public.workflows where t.ct = any (content_types)),
        'presets', (select count(*) from public.presets where content_type = t.ct)))
      from (values ('image'), ('text'), ('audio'), ('video')) t (ct)),
    'engagement', jsonb_build_object(
      'comments', (select count(*) from public.prompt_comments where deleted_at is null),
      'likes', (select count(*) from public.prompt_likes) + (select count(*) from public.comment_likes),
      'saves', (select count(*) from public.collection_items),
      'follows', (select count(*) from public.follows),
      'conversations', (select count(*) from public.conversations),
      'messages', (select count(*) from public.messages),
      'results', (select count(*) from public.prompt_results),
      'reports_open', (select count(*) from public.reports where status = 'open')),
    'storage', jsonb_build_object(
      'total_bytes', (select coalesce(sum(size), 0) from public._storage_objects()),
      'total_files', (select count(*) from public._storage_objects()),
      'by_bucket', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
        from (select bucket, count(*) n, sum(size) b from public._storage_objects() group by bucket) x),
      'by_kind', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
        from (select kind, count(*) n, sum(size) b from public._storage_objects() group by kind) x)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'posts', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') d
      left join (
        select created_at::date as day, count(*) n from (
          select created_at from public.prompts where deleted_at is null and status = 'published' and (p_content_type is null or content_type = p_content_type)
          union all select created_at from public.prompt_requests where deleted_at is null and not is_draft and (p_content_type is null or content_type = p_content_type)
          union all select created_at from public.workflows where status = 'published' and (p_content_type is null or p_content_type = any (content_types))
          union all select created_at from public.presets where status = 'published' and (p_content_type is null or content_type = p_content_type)
        ) u group by 1) c on c.day = d::date)
  ) into r;
  return r;
end $function$;

drop function if exists public.admin_users(text, text, text, text, integer, integer, uuid);
create function public.admin_users(p_query text default null, p_content_type text default null, p_sort text default 'newest', p_status text default 'all', p_limit integer default 30, p_offset integer default 0, p_user_id uuid default null)
 returns table(id uuid, username text, display_name text, avatar_url text, bio text, email text, role text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, suspended_until timestamp with time zone, suspended_reason text, posting_blocked boolean, posting_block_reason text, prompts_n integer, requests_n integer, workflows_n integer, presets_n integer, posts_total integer, comments_n integer, likes_given_n integer, likes_received_n integer, saves_n integer, followers_n integer, following_n integer, messages_n integer, conversations_n integer, reports_filed_n integer, reports_against_n integer, storage_files integer, storage_bytes bigint, image_bytes bigint, video_bytes bigint, audio_bytes bigint, total_count bigint)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform public._admin_guard();
  return query
  with st as (
    select s.owner_id as oid, count(*)::int files, coalesce(sum(s.size), 0)::bigint bytes,
      coalesce(sum(s.size) filter (where s.kind = 'image'), 0)::bigint img,
      coalesce(sum(s.size) filter (where s.kind = 'video'), 0)::bigint vid,
      coalesce(sum(s.size) filter (where s.kind = 'audio'), 0)::bigint aud
    from public._storage_objects() s where s.owner_id is not null group by s.owner_id),
  base as (
    select p.id, p.username, p.display_name, p.avatar_url, p.bio, u.email::text as email, p.role,
      p.created_at, u.last_sign_in_at,
      p.suspended_until, p.suspended_reason, p.posting_blocked, p.posting_block_reason,
      (select count(*) from public.prompts x where x.author_id = p.id and x.deleted_at is null and (p_content_type is null or x.content_type = p_content_type))::int as prompts_n,
      (select count(*) from public.prompt_requests x where x.author_id = p.id and x.deleted_at is null and (p_content_type is null or x.content_type = p_content_type))::int as requests_n,
      (select count(*) from public.workflows x where x.creator_id = p.id and (p_content_type is null or p_content_type = any (x.content_types)))::int as workflows_n,
      (select count(*) from public.presets x where x.creator_id = p.id and (p_content_type is null or x.content_type = p_content_type))::int as presets_n,
      (select count(*) from public.prompt_comments c where c.author_id = p.id and c.deleted_at is null)::int as comments_n,
      ((select count(*) from public.prompt_likes l where l.user_id = p.id) + (select count(*) from public.comment_likes l where l.user_id = p.id))::int as likes_given_n,
      ((select coalesce(sum(like_count), 0) from public.prompts x where x.author_id = p.id and x.deleted_at is null)
       + (select coalesce(sum(like_count), 0) from public.prompt_requests x where x.author_id = p.id and x.deleted_at is null)
       + (select coalesce(sum(like_count), 0) from public.workflows x where x.creator_id = p.id)
       + (select coalesce(sum(like_count), 0) from public.presets x where x.creator_id = p.id))::int as likes_received_n,
      (select count(*) from public.collection_items ci join public.collections c on c.id = ci.collection_id where c.owner_id = p.id)::int as saves_n,
      p.follower_count as followers_n, p.following_count as following_n,
      (select count(*) from public.messages m where m.sender_id = p.id)::int as messages_n,
      (select count(*) from public.conversation_members cm where cm.user_id = p.id)::int as conversations_n,
      (select count(*) from public.reports r where r.reporter_id = p.id)::int as reports_filed_n,
      (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p.id)::int as reports_against_n,
      coalesce(st.files, 0) as storage_files, coalesce(st.bytes, 0) as storage_bytes,
      coalesce(st.img, 0) as image_bytes, coalesce(st.vid, 0) as video_bytes, coalesce(st.aud, 0) as audio_bytes
    from public.profiles p
    join auth.users u on u.id = p.id
    left join st on st.oid = p.id
    where (p_user_id is null or p.id = p_user_id)
      and (p_query is null or btrim(p_query) = '' or p.username ilike '%' || btrim(p_query) || '%'
           or p.display_name ilike '%' || btrim(p_query) || '%' or u.email ilike '%' || btrim(p_query) || '%')
      and (p_status = 'all'
           or (p_status = 'suspended' and p.suspended_until > now())
           or (p_status = 'blocked' and p.posting_blocked)
           or (p_status = 'moderator' and p.role = 'moderator'))
  ),
  fin as (
    select b.*, (b.prompts_n + b.requests_n + b.workflows_n + b.presets_n) as posts_total from base b
  )
  select f.id, f.username, f.display_name, f.avatar_url, f.bio, f.email, f.role, f.created_at, f.last_sign_in_at,
    f.suspended_until, f.suspended_reason, f.posting_blocked, f.posting_block_reason,
    f.prompts_n, f.requests_n, f.workflows_n, f.presets_n, f.posts_total,
    f.comments_n, f.likes_given_n, f.likes_received_n, f.saves_n, f.followers_n, f.following_n,
    f.messages_n, f.conversations_n, f.reports_filed_n, f.reports_against_n,
    f.storage_files, f.storage_bytes, f.image_bytes, f.video_bytes, f.audio_bytes,
    count(*) over () as total_count
  from fin f
  where p_content_type is null or p_user_id is not null or f.posts_total > 0
  order by
    case when p_sort = 'posts' then f.posts_total end desc nulls last,
    case when p_sort = 'storage' then f.storage_bytes end desc nulls last,
    case when p_sort = 'comments' then f.comments_n end desc nulls last,
    case when p_sort = 'likes' then f.likes_given_n end desc nulls last,
    case when p_sort = 'messages' then f.messages_n end desc nulls last,
    case when p_sort = 'active' then f.last_sign_in_at end desc nulls last,
    f.created_at desc
  limit greatest(least(p_limit, 100), 1) offset greatest(p_offset, 0);
end $function$;
revoke all on function public.admin_users(text, text, text, text, integer, integer, uuid) from public, anon;
grant execute on function public.admin_users(text, text, text, text, integer, integer, uuid) to authenticated;

create or replace function public.admin_user_activity(p_user_id uuid, p_kind text, p_limit integer default 40, p_before timestamp with time zone default null)
 returns table(id text, created_at timestamp with time zone, label text, body text, href text, meta jsonb)
 language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform public._admin_guard();
  if p_kind = 'posts' then
    return query select q.* from (
      select x.id::text, x.created_at, 'prompt'::text, x.title, '/prompts/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.prompts x where x.author_id = p_user_id and x.deleted_at is null
      union all select x.id::text, x.created_at, 'request', x.title, '/requests/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', case when x.is_draft then 'draft' else 'published' end, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.prompt_requests x where x.author_id = p_user_id and x.deleted_at is null
      union all select x.id::text, x.created_at, 'workflow', x.title, '/workflows/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_types[1], 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.workflows x where x.creator_id = p_user_id
      union all select x.id::text, x.created_at, 'preset', x.title, '/presets/local?id=' || x.id,
        jsonb_build_object('description', left(coalesce(x.description, ''), 240), 'content_type', x.content_type, 'status', x.status, 'visibility', x.visibility, 'likes', x.like_count, 'comments', x.comment_count)
        from public.presets x where x.creator_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'comments' then
    return query
    select c.id::text, c.created_at,
      (case when c.prompt_id is not null then 'prompt' when c.request_id is not null then 'request'
            when c.workflow_id is not null then 'workflow' when c.preset_id is not null then 'preset' else 'result' end)::text,
      coalesce(c.body, ''),
      coalesce('/prompts/local?id=' || c.prompt_id, '/requests/local?id=' || c.request_id,
               '/workflows/local?id=' || c.workflow_id, '/presets/local?id=' || c.preset_id),
      jsonb_build_object('target_title', coalesce(p.title, r.title, w.title, ps.title), 'is_reply', c.parent_id is not null,
                         'deleted', c.deleted_at is not null, 'likes', c.like_count)
    from public.prompt_comments c
    left join public.prompts p on p.id = c.prompt_id left join public.prompt_requests r on r.id = c.request_id
    left join public.workflows w on w.id = c.workflow_id
    left join public.presets ps on ps.id = c.preset_id
    where c.author_id = p_user_id and (p_before is null or c.created_at < p_before)
    order by c.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'likes' then
    return query select q.* from (
      select l.id::text, l.created_at,
        (case when l.prompt_id is not null then 'prompt' when l.request_id is not null then 'request'
              when l.workflow_id is not null then 'workflow' when l.preset_id is not null then 'preset' else 'result' end)::text,
        coalesce(p.title, r.title, w.title, ps.title, ''),
        coalesce('/prompts/local?id=' || l.prompt_id, '/requests/local?id=' || l.request_id,
                 '/workflows/local?id=' || l.workflow_id, '/presets/local?id=' || l.preset_id),
        '{}'::jsonb
      from public.prompt_likes l
      left join public.prompts p on p.id = l.prompt_id left join public.prompt_requests r on r.id = l.request_id
      left join public.workflows w on w.id = l.workflow_id
      left join public.presets ps on ps.id = l.preset_id
      where l.user_id = p_user_id
      union all
      select cl.comment_id::text, cl.created_at, 'comment'::text, left(coalesce(c.body, ''), 240), null::text,
        jsonb_build_object('comment_author', ca.username)
      from public.comment_likes cl join public.prompt_comments c on c.id = cl.comment_id left join public.profiles ca on ca.id = c.author_id
      where cl.user_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'saves' then
    return query
    select ci.id::text, ci.created_at,
      (case when ci.prompt_id is not null then 'prompt' when ci.workflow_id is not null then 'workflow' else 'preset' end)::text,
      coalesce(p.title, w.title, ps.title, ''),
      coalesce('/prompts/local?id=' || ci.prompt_id, '/workflows/local?id=' || ci.workflow_id, '/presets/local?id=' || ci.preset_id),
      jsonb_build_object('collection', c.name, 'collection_visibility', c.visibility)
    from public.collection_items ci join public.collections c on c.id = ci.collection_id
    left join public.prompts p on p.id = ci.prompt_id
    left join public.workflows w on w.id = ci.workflow_id left join public.presets ps on ps.id = ci.preset_id
    where c.owner_id = p_user_id and (p_before is null or ci.created_at < p_before)
    order by ci.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'follows' then
    return query select q.* from (
      select f.following_id::text, f.created_at, 'following'::text, coalesce(u.display_name, u.username), '/profile/real?username=' || u.username,
        jsonb_build_object('username', u.username)
        from public.follows f join public.profiles u on u.id = f.following_id where f.follower_id = p_user_id
      union all
      select f.follower_id::text, f.created_at, 'follower'::text, coalesce(u.display_name, u.username), '/profile/real?username=' || u.username,
        jsonb_build_object('username', u.username)
        from public.follows f join public.profiles u on u.id = f.follower_id where f.following_id = p_user_id
    ) q where p_before is null or q.created_at < p_before order by q.created_at desc limit greatest(least(p_limit, 200), 1);
  elsif p_kind = 'reports' then
    return query
    select r.id::text, r.created_at, r.target_type, r.reason, null::text,
      jsonb_build_object('status', r.status, 'resolution', r.resolution_note)
    from public.reports r where r.reporter_id = p_user_id and (p_before is null or r.created_at < p_before)
    order by r.created_at desc limit greatest(least(p_limit, 200), 1);
  else
    raise exception 'Geçersiz etkinlik türü.';
  end if;
end $function$;
