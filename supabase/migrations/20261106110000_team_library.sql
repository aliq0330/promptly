-- ci:allow-destructive
-- Ekip kütüphanesi (docs/history/348-*): yeni bir Space türü + sahibin verdiği "onaylı" işareti + ekip ortak değişkenleri + kişisel API okumaları.
--
-- "Yıkıcı" işaretinin nedeni: `spaces.kind` ve `space_activity.action` CHECK'leri GENİŞLETİLİR (drop constraint + aynı adla yeniden ekleme).
-- Hiçbir veri silinmez; mevcut satırların tamamı yeni kısıtı da sağlar. Gerisi ekleyicidir (expand → contract, CLAUDE.md §8.11).
--
--   1) spaces.kind 'team_library' kabul eder; create_space aynı listeyi tanır.
--   2) space_items.approved_at / approved_by: YALNIZ sahibin RPC'si (space_set_item_approval) yazar. Yalnız kendi metnini taşıyan prompt
--      taslağı (kind='prompt' + is_draft) onaylanabilir: bir Promptly gönderisine BAŞVURAN öğenin metnini ekip değil gönderinin yazarı
--      değiştirir, "onaylı" rozeti yalan olurdu. Onaylı taslağın başlığı/metni değişirse onay KENDİLİĞİNDEN düşer.
--   3) space_variables: ekibin ortak {değişken} değerleri (yalnız ÜYE okur; yazma yalnız RPC).
--   4) api_me_libraries / api_me_library_prompts / api_me_library_variables: kişisel (kimlikli) API/MCP okumaları, INVOKER.

-- ----------------------------------------------------------------------------
-- 1. Tür
-- ----------------------------------------------------------------------------
alter table public.spaces drop constraint if exists spaces_kind_check;
alter table public.spaces add constraint spaces_kind_check
  check (kind in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_library'));

create or replace function public.create_space(
  p_title text,
  p_description text default '',
  p_kind text default 'free',
  p_visibility text default 'private',
  p_groups text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_pos integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then raise exception 'space_title_required'; end if;
  if coalesce(p_kind, '') not in ('moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_library')
     or coalesce(p_visibility, '') not in ('private', 'link', 'public')
     or char_length(coalesce(p_description, '')) > 500
     or coalesce(cardinality(p_groups), 0) > 12 then
    raise exception 'space_invalid';
  end if;
  if (select count(*) from public.spaces s where s.owner_id = v_uid) >= 200 then raise exception 'space_limit'; end if;
  insert into public.spaces (owner_id, title, description, kind, visibility, updated_by)
  values (v_uid, btrim(p_title), coalesce(p_description, ''), p_kind, p_visibility, v_uid)
  returning id into v_id;
  foreach v_name in array coalesce(p_groups, '{}') loop
    if char_length(btrim(v_name)) between 1 and 40 then
      insert into public.space_groups (space_id, name, position, created_by) values (v_id, btrim(v_name), v_pos, v_uid);
      v_pos := v_pos + 1;
    end if;
  end loop;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Onay işareti
-- ----------------------------------------------------------------------------
alter table public.space_items add column if not exists approved_at timestamptz;
alter table public.space_items add column if not exists approved_by uuid references public.profiles (id) on delete set null;

alter table public.space_items drop constraint if exists space_items_approval_draft_only;
alter table public.space_items add constraint space_items_approval_draft_only
  check ((approved_at is null and approved_by is null) or (kind = 'prompt' and is_draft));

alter table public.space_activity drop constraint if exists space_activity_action_check;
alter table public.space_activity add constraint space_activity_action_check check (action in (
  'created', 'renamed', 'visibility_changed', 'archived', 'unarchived',
  'image_added', 'image_removed', 'prompt_added', 'note_added', 'content_added', 'item_removed',
  'palette_created', 'palette_updated', 'palette_deleted', 'group_created', 'group_deleted',
  'member_invited', 'member_joined', 'member_removed', 'role_changed', 'link_created', 'link_revoked',
  'item_approved', 'item_unapproved'
));

-- Onay sütunlarını yalnız `space_set_item_approval` yazar (işlem-yerel işaret). Başka her yazma ya reddedilir (doğrudan değiştirme/ekleme)
-- ya da — içerik değiştiyse — onayı düşürür. Konum/grup/renk gibi yerleşim değişiklikleri onayı etkilemez.
create or replace function public.space_items_approval_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_by_rpc boolean := coalesce(current_setting('promptly.space_approval', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if (new.approved_at is not null or new.approved_by is not null) and not v_by_rpc then
      raise exception 'space_approval_forbidden';
    end if;
    return new;
  end if;
  if (new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by) and not v_by_rpc then
    raise exception 'space_approval_forbidden';
  end if;
  if not v_by_rpc and old.approved_at is not null
     and (new.title, new.body) is distinct from (old.title, old.body) then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.space_items_approval_guard() from public, anon, authenticated;

drop trigger if exists space_items_approval_guard on public.space_items;
create trigger space_items_approval_guard before insert or update on public.space_items
  for each row execute function public.space_items_approval_guard();

-- Kilit (307) onay sütunlarını "değişiklik" saymaz: sahip kilitli bir taslağı da onaylayabilir (kilit içeriği korur, onay içerik değildir).
create or replace function public.space_items_lock_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() <= 1 then
      raise exception 'space_item_locked';
    end if;
    return old;
  end if;
  if old.locked and (to_jsonb(new) - 'locked' - 'updated_at' - 'updated_by' - 'approved_at' - 'approved_by')
                    is distinct from (to_jsonb(old) - 'locked' - 'updated_at' - 'updated_by' - 'approved_at' - 'approved_by') then
    raise exception 'space_item_locked';
  end if;
  return new;
end;
$$;
revoke execute on function public.space_items_lock_guard() from public, anon, authenticated;

-- Onay ver / geri al. YALNIZ Space sahibi ve yalnız ekip kütüphanesinde; öğe kendi metnini taşıyan prompt taslağı olmalı.
-- SECURITY DEFINER: yetki denetimi AÇIKTIR (sahip + arşivlenmemiş) ve işaret yalnız bu işlemde kurulur.
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
  v_title text;
  v_at timestamptz;
  v_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null or p_approved is null then raise exception 'space_invalid'; end if;
  select i.space_id into v_space from public.space_items i where i.id = p_item;
  if v_space is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  if public.space_role(v_space) is distinct from 'owner' or not public.can_edit_space(v_space) then raise exception 'space_forbidden'; end if;
  select s.kind into v_kind from public.spaces s where s.id = v_space;
  if v_kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  perform set_config('promptly.space_approval', '1', true);
  update public.space_items
     set approved_at = case when p_approved then now() else null end,
         approved_by = case when p_approved then v_uid else null end
   where id = p_item and kind = 'prompt' and is_draft
   returning title, approved_at into v_title, v_at;
  -- FOUND'u `perform` bozar (set_config bir satır döndürür): etkilenen satırı HEMEN al.
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_approval', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  perform public._space_log(v_space, case when p_approved then 'item_approved' else 'item_unapproved' end, nullif(btrim(v_title), ''));
  return v_at;
end;
$$;
revoke execute on function public.space_set_item_approval(uuid, boolean) from public, anon;
grant execute on function public.space_set_item_approval(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ekip ortak değişkenleri
-- ----------------------------------------------------------------------------
create table if not exists public.space_variables (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name !~ '[{}[:space:]]'),
  value text not null default '' check (char_length(value) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_variables_name_unique unique (space_id, name)
);
alter table public.space_variables enable row level security;

-- Değerler yalnız ÜYEYE görünür (herkese açık Space'te bile): ekip içi marka adı, ton gibi bilgiler dışarı sızmasın.
drop policy if exists "Members read variables" on public.space_variables;
create policy "Members read variables" on public.space_variables
  for select to authenticated using (public.space_role(space_id) is not null);
revoke all on public.space_variables from anon;
revoke insert, update, delete on public.space_variables from authenticated;

do $$
begin
  if to_regprocedure('public.enforce_can_post()') is not null
     and not exists (select 1 from pg_trigger where tgname = 'space_variables_enforce_can_post' and tgrelid = 'public.space_variables'::regclass) then
    create trigger space_variables_enforce_can_post before insert on public.space_variables
      for each row execute function public.enforce_can_post('content');
  end if;
end $$;

create or replace function public.space_set_variable(p_space uuid, p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_value text := coalesce(p_value, '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_space is null or not public.can_read_space(p_space) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(p_space) then raise exception 'space_forbidden'; end if;
  if not exists (select 1 from public.spaces s where s.id = p_space and s.kind = 'team_library') then raise exception 'space_invalid'; end if;
  if char_length(v_name) not between 1 and 40 or v_name ~ '[{}[:space:]]' or char_length(v_value) > 500 then raise exception 'space_invalid'; end if;
  if not exists (select 1 from public.space_variables v where v.space_id = p_space and v.name = v_name)
     and (select count(*) from public.space_variables v where v.space_id = p_space) >= 50 then
    raise exception 'space_variable_limit';
  end if;
  insert into public.space_variables (space_id, name, value, created_by, updated_by)
  values (p_space, v_name, v_value, v_uid, v_uid)
  on conflict (space_id, name) do update set value = excluded.value, updated_by = v_uid, updated_at = now();
  perform public._space_touch(p_space);
end;
$$;

create or replace function public.space_delete_variable(p_space uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_space is null or not public.can_read_space(p_space) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(p_space) then raise exception 'space_forbidden'; end if;
  delete from public.space_variables where space_id = p_space and name = btrim(coalesce(p_name, ''));
  perform public._space_touch(p_space);
end;
$$;

revoke execute on function public.space_set_variable(uuid, text, text) from public, anon;
revoke execute on function public.space_delete_variable(uuid, text) from public, anon;
grant execute on function public.space_set_variable(uuid, text, text) to authenticated;
grant execute on function public.space_delete_variable(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Kişisel API / MCP okumaları (docs/history/315-* deseni: SECURITY INVOKER, kullanıcının kendi RLS'i)
-- ----------------------------------------------------------------------------
create or replace function public.api_me_libraries()
returns table (id uuid, title text, description text, role text, approved_count integer, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select s.id, s.title, left(coalesce(s.description, ''), 300), public.space_role(s.id),
         (select count(*)::int from public.space_items i where i.space_id = s.id and i.kind = 'prompt' and i.is_draft and i.approved_at is not null),
         s.updated_at
    from public.spaces s
   where s.kind = 'team_library' and s.archived_at is null and public.space_role(s.id) is not null
   order by s.updated_at desc, s.id
   limit 50;
$$;

create or replace function public.api_me_library_prompts(p_space uuid, p_include_unapproved boolean default false)
returns table (id uuid, title text, body text, group_name text, approved_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select i.id, i.title, i.body, g.name, i.approved_at, i.updated_at
    from public.space_items i
    join public.spaces s on s.id = i.space_id
    left join public.space_groups g on g.id = i.group_id
   where i.space_id = p_space and s.kind = 'team_library' and s.archived_at is null
     and public.space_role(p_space) is not null
     and i.kind = 'prompt' and i.is_draft
     and (coalesce(p_include_unapproved, false) or i.approved_at is not null)
   order by coalesce(g.position, 0), g.name nulls first, i.title, i.id
   limit 200;
$$;

create or replace function public.api_me_library_variables(p_space uuid)
returns table (name text, value text)
language sql stable security invoker set search_path = public as $$
  select v.name, v.value
    from public.space_variables v
    join public.spaces s on s.id = v.space_id
   where v.space_id = p_space and s.kind = 'team_library' and public.space_role(p_space) is not null
   order by v.name
   limit 50;
$$;

revoke all on function public.api_me_libraries() from public, anon;
revoke all on function public.api_me_library_prompts(uuid, boolean) from public, anon;
revoke all on function public.api_me_library_variables(uuid) from public, anon;
grant execute on function public.api_me_libraries() to authenticated;
grant execute on function public.api_me_library_prompts(uuid, boolean) to authenticated;
grant execute on function public.api_me_library_variables(uuid) to authenticated;
