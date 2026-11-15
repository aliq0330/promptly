-- ci:allow-destructive
-- Skill: Kaydet + koleksiyon + ortak koleksiyon (Aşama 3 kalanı, docs/history/391-*).
--
-- Skill, `collection_items`'ın beşinci hedefi olur (`skill_id`; prompt/workflow/preset/community_post ile aynı kalıp). Kayıt modeli DEĞİŞMEZ (336/386):
-- kaydedildi = sahibin sistem koleksiyonunda satır; ortak koleksiyona eklenen içerik hem ekleyenin hem sahibin sistem koleksiyonuna yazılır.
--
-- `-- ci:allow-destructive` YALNIZCA `collection_items_exactly_one_target` CHECK'inin yeni sütunu kapsayacak biçimde yeniden kurulması içindir; veri silinmez.
-- Skill'in kaydet sayacı `skills.save_count` (korumalı, `skills_protect_counters`) SECURITY DEFINER tetikleyicilerle sahip başına BİR sayılır (preset kalıbı).

alter table public.collection_items add column if not exists skill_id uuid references public.skills(id) on delete cascade;

alter table public.collection_items drop constraint if exists collection_items_exactly_one_target;
alter table public.collection_items add constraint collection_items_exactly_one_target check (
  (prompt_id is not null)::int + (workflow_id is not null)::int + (preset_id is not null)::int + (community_post_id is not null)::int + (skill_id is not null)::int = 1
);

create unique index if not exists collection_items_collection_skill_uidx on public.collection_items (collection_id, skill_id) where skill_id is not null;
create index if not exists collection_items_skill_id_idx on public.collection_items (skill_id) where skill_id is not null;

-- Sayaç tetikleyicileri (presets kalıbı)

CREATE OR REPLACE FUNCTION public.handle_skill_collection_items_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pair record;
  v_inserted int;
  v_total int;
begin
  for v_pair in
    select distinct c.owner_id, nt.skill_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.skill_id is not null
  loop
    select count(*) into v_inserted from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.skill_id = v_pair.target_id;
    select count(*) into v_total from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.skill_id = v_pair.target_id;
    if v_total - v_inserted <= 0 then
      update public.skills set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_skill_collection_items_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pair record;
  v_remaining int;
begin
  for v_pair in
    select distinct c.owner_id, ot.skill_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.skill_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.skill_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.skills set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_skill_collections_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item record;
  v_remaining boolean;
begin
  for v_item in
    select skill_id from public.collection_items where collection_id = old.id and skill_id is not null
  loop
    select exists(
      select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
      where c.owner_id = old.owner_id and c.id <> old.id and ci.skill_id = v_item.skill_id
    ) into v_remaining;
    if not v_remaining then
      update public.skills set save_count = greatest(0, save_count - 1) where id = v_item.skill_id;
    end if;
  end loop;
  return old;
end;
$function$;

create trigger collection_items_after_insert_skill_save_counts after insert on public.collection_items
  referencing new table as new_table for each statement execute function public.handle_skill_collection_items_insert();
create trigger collection_items_after_delete_skill_save_counts after delete on public.collection_items
  referencing old table as old_table for each statement execute function public.handle_skill_collection_items_delete();

do $$
declare v_def text;
begin
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t where t.tgname = 'collections_before_delete_preset_save_counts' and t.tgrelid = 'public.collections'::regclass;
  if v_def is null then
    select pg_get_triggerdef(t.oid) into v_def from pg_trigger t where t.tgrelid = 'public.collections'::regclass and pg_get_triggerdef(t.oid) ilike '%handle_preset_collections_before_delete%' limit 1;
  end if;
  if v_def is not null then
    v_def := replace(replace(v_def, 'handle_preset_collections_before_delete', 'handle_skill_collections_before_delete'), 'preset', 'skill');
    execute v_def;
  end if;
end $$;

revoke all on function public.handle_skill_collection_items_insert() from public, anon, authenticated;
revoke all on function public.handle_skill_collection_items_delete() from public, anon, authenticated;
revoke all on function public.handle_skill_collections_before_delete() from public, anon, authenticated;

-- Kaydedilen Skill'in kendi sistem koleksiyonuna yazılması

CREATE OR REPLACE FUNCTION public.collection_items_saved_all_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_default boolean;
  v_shared boolean;
  v_uid uuid := auth.uid();
begin
  select owner_id, is_default, is_shared into v_owner, v_default, v_shared from public.collections where id = new.collection_id;
  if v_owner is null or v_default then
    return new;
  end if;
  if v_uid is not null and v_uid <> v_owner then
    -- Başkasının koleksiyonu: yalnız ortak koleksiyonun ortağı ekleyebilir (aksi hâlde RLS reddeder, sisteme dokunma).
    if not (v_shared and exists (select 1 from public.collection_members m where m.collection_id = new.collection_id and m.user_id = v_uid)) then
      return new;
    end if;
    insert into public.collection_items (collection_id, prompt_id, workflow_id, preset_id, community_post_id, skill_id)
    values (public.ensure_default_collection(v_uid), new.prompt_id, new.workflow_id, new.preset_id, new.community_post_id, new.skill_id)
    on conflict do nothing;
  end if;
  insert into public.collection_items (collection_id, prompt_id, workflow_id, preset_id, community_post_id, skill_id)
  values (public.ensure_default_collection(v_owner), new.prompt_id, new.workflow_id, new.preset_id, new.community_post_id, new.skill_id)
  on conflict do nothing;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.unsave_content(p_type text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın.';
  end if;
  if p_type not in ('prompt', 'workflow', 'preset', 'community_post', 'skill') then
    raise exception 'unsave_invalid_type';
  end if;

  delete from public.collection_items ci
  using public.collections c
  where ci.collection_id = c.id
    and c.owner_id = auth.uid()
    and case p_type
      when 'prompt' then ci.prompt_id = p_id
      when 'workflow' then ci.workflow_id = p_id
      when 'preset' then ci.preset_id = p_id
      when 'skill' then ci.skill_id = p_id
      else ci.community_post_id = p_id
    end;
end;
$function$;

CREATE OR REPLACE FUNCTION public._quote_content_info(p_type text, p_id uuid)
 RETURNS TABLE(owner_id uuid, shareable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif p_type = 'skill' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public')
      from public.skills x where x.id = p_id;
  elsif p_type = 'space' then
    return query select x.owner_id, (x.visibility = 'public' and x.archived_at is null)
      from public.spaces x where x.id = p_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_unshareable_items(p_collection uuid)
 RETURNS TABLE(item_id uuid, content_type text, title text, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.collections c where c.id = p_collection and c.owner_id = auth.uid()) then
    raise exception 'collection_not_found';
  end if;
  return query
    select ci.id,
           case when ci.community_post_id is not null then 'community_post' when ci.prompt_id is not null then 'prompt'
                when ci.workflow_id is not null then 'workflow' when ci.skill_id is not null then 'skill' else 'preset' end,
           coalesce(p.title, w.title, ps.title, sk.title),
           case when ci.community_post_id is not null then 'community' else 'not_public' end
      from public.collection_items ci
      left join public.prompts p on p.id = ci.prompt_id
      left join public.workflows w on w.id = ci.workflow_id
      left join public.presets ps on ps.id = ci.preset_id
      left join public.skills sk on sk.id = ci.skill_id
     where ci.collection_id = p_collection
       and (ci.community_post_id is not null
            or (ci.prompt_id is not null and not public.quote_target_ok('prompt', ci.prompt_id))
            or (ci.workflow_id is not null and not public.quote_target_ok('workflow', ci.workflow_id))
            or (ci.preset_id is not null and not public.quote_target_ok('preset', ci.preset_id))
            or (ci.skill_id is not null and not public.quote_target_ok('skill', ci.skill_id)))
     order by ci.created_at;
end $function$;

CREATE OR REPLACE FUNCTION public.set_collection_shared(p_collection uuid, p_shared boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_c public.collections;
  v_bad integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from public.collections where id = p_collection for update;
  if not found or v_c.owner_id <> v_uid then raise exception 'collection_not_found'; end if;
  if v_c.is_default then raise exception 'collection_system'; end if;
  if coalesce(p_shared, false) then
    if v_c.is_shared then return; end if;
    select count(*) into v_bad from public.collection_items ci
     where ci.collection_id = p_collection
       and (ci.community_post_id is not null
            or (ci.prompt_id is not null and not public.quote_target_ok('prompt', ci.prompt_id))
            or (ci.workflow_id is not null and not public.quote_target_ok('workflow', ci.workflow_id))
            or (ci.preset_id is not null and not public.quote_target_ok('preset', ci.preset_id))
            or (ci.skill_id is not null and not public.quote_target_ok('skill', ci.skill_id)));
    if v_bad > 0 then raise exception 'collection_has_unshareable_items'; end if;
    -- Var olan takipçiler korunur (ortak olmayanlar takipçi kalır).
    update public.collections set is_shared = true where id = p_collection;
  else
    if not v_c.is_shared then return; end if;
    update public.collection_invitations set status = 'revoked', responded_at = now() where collection_id = p_collection and status = 'pending';
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    select m.user_id, v_uid, 'system', '"' || v_c.name || '" koleksiyonunda ortak çalışma kapatıldı.', '/saved'
      from public.collection_members m where m.collection_id = p_collection;
    -- Ortakların eklediği içerikler koleksiyonda kalır ve sahibe geçer.
    update public.collection_items set added_by = null where collection_id = p_collection and added_by is not null;
    delete from public.collection_members where collection_id = p_collection;
    update public.collections set is_shared = false where id = p_collection;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.content_engagers(p_content_type text, p_content_id uuid, p_kind text, p_limit integer DEFAULT 20, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_actor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, actor_follower_count integer, interacted_at timestamp with time zone, comment_id uuid, comment_body text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'community_post' then 'community_post_id'
    when 'space' then 'space_id'
    when 'quote' then 'quote_id'
    when 'skill' then 'skill_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  -- İstek, Space ve alıntı kaydedilemez (Skill kaydedilir, 391) (koleksiyon hedefi değiller).
  if p_kind = 'saves' and p_content_type in ('request', 'space', 'quote') then
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


-- `block_team_content_use` jsonb ile okur; Skill'in ekibe özgü hâli yok, ek dal gerekmez.

-- Okuyamadığı (taslak / özel / engelli) Skill'i kimse kaydedemez: FK kontrolü RLS'i atladığı için kayıt sayacı şişerdi (INVOKER: çağıranın RLS'i uygulanır).
create or replace function public.enforce_skill_save() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.skill_id is not null and not exists (select 1 from public.skills s where s.id = new.skill_id) then
    raise exception 'skill_not_found';
  end if;
  return new;
end $$;
revoke all on function public.enforce_skill_save() from public, anon, authenticated;
create trigger collection_items_a_skill_guard before insert on public.collection_items for each row execute function public.enforce_skill_save();
