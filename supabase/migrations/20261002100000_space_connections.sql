-- Space panosunda oklar / bağlantılar + workflow'un panoya AYRI NESNELER olarak aktarılması (docs/history/262-*).
--
-- 1) `space_connections`: panodaki iki öğe arasında çizilen ok / çizgi (etiket, çizgi stili, ok yönü, yol, renk). Konum saklanmaz:
--    uçları öğelerin kendi konumundan hesaplanır, yani öğe taşınınca ok da gelir. Bir uçtaki öğe silinince bağlantı da silinir.
-- 2) `space_items.source_*`: bir workflow'dan aktarılan nesnenin kaynağı (workflow, adım, rol: adım kartı / prompt / görsel) —
--    "Workflow değişti, güncelle" bunu kullanır ve workflow sayfası hangi Space'lerde göründüğünü buradan bulur. Kopya değil
--    başvurudur: workflow silinirse nesneler normal öğe olarak kalır (`on delete set null`).
-- Yalnızca ekleyici: `drop` yok. Mevcut satırlar etkilenmez; önceki sürümdeki çerçeve öğeleri (`flow_show_*`) olduğu gibi çalışır.

-- ============================================================================
-- 1. space_items kaynak sütunları
-- ============================================================================

alter table public.space_items
  add column if not exists source_workflow_id uuid references public.workflows (id) on delete set null,
  add column if not exists source_step_id uuid,
  add column if not exists source_role text check (source_role is null or source_role in ('step', 'prompt', 'image')),
  add column if not exists source_step_no smallint check (source_step_no is null or source_step_no between 1 and 500);

create index if not exists space_items_source_workflow_idx on public.space_items (source_workflow_id) where source_workflow_id is not null;

-- Kaynak sütunları yalnız eklenirken yazılır ve sonradan DEĞİŞMEZ (workflow silinince `source_workflow_id` null'a düşebilir).
-- SECURITY INVOKER: workflow'un okunabilirliği çağıranın RLS'inden geçer (topluluğa özgü workflow aktarılamaz).
create or replace function public.space_items_source_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.source_step_id is distinct from old.source_step_id and new.source_step_id is not null)
       or (new.source_role is distinct from old.source_role and new.source_role is not null)
       or (new.source_step_no is distinct from old.source_step_no and new.source_step_no is not null)
       or (new.source_workflow_id is distinct from old.source_workflow_id and new.source_workflow_id is not null) then
      raise exception 'space_invalid';
    end if;
    return new;
  end if;
  if new.source_workflow_id is null then
    if new.source_step_id is not null or new.source_role is not null or new.source_step_no is not null then
      raise exception 'space_invalid';
    end if;
    return new;
  end if;
  if new.source_role is null
     or new.source_role = 'step' and new.kind <> 'note'
     or new.source_role = 'prompt' and new.kind <> 'prompt'
     or new.source_role = 'image' and new.kind <> 'image'
     or not exists (select 1 from public.workflows w where w.id = new.source_workflow_id and w.community_id is null) then
    raise exception 'space_source_unavailable';
  end if;
  return new;
end;
$$;
drop trigger if exists space_items_source_guard on public.space_items;
create trigger space_items_source_guard before insert or update on public.space_items
  for each row execute function public.space_items_source_guard();

-- ============================================================================
-- 2. space_connections
-- ============================================================================

create table if not exists public.space_connections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  from_item_id uuid not null references public.space_items (id) on delete cascade,
  to_item_id uuid not null references public.space_items (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80),
  line_style text not null default 'solid' check (line_style in ('solid', 'dashed', 'dotted')),
  -- Okun ucu: `end` = to'ya, `start` = from'a, `both` = iki uca, `none` = yalnız çizgi.
  arrow text not null default 'end' check (arrow in ('end', 'start', 'both', 'none')),
  route text not null default 'curve' check (route in ('curve', 'straight', 'elbow')),
  color text not null default 'primary' check (color in ('primary', 'secondary', 'success', 'warning', 'danger', 'neutral')),
  -- Workflow aktarımının çizdiği bağlantı (akış okları / içerik çizgileri / ilişki yayları): "güncelle" bunları yeniden kurar.
  source_workflow_id uuid references public.workflows (id) on delete set null,
  source_role text check (source_role is null or source_role in ('flow', 'link', 'relation')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_connections_no_self check (from_item_id <> to_item_id)
);
create unique index if not exists space_connections_pair_idx on public.space_connections (from_item_id, to_item_id);
create index if not exists space_connections_space_idx on public.space_connections (space_id);
create index if not exists space_connections_to_idx on public.space_connections (to_item_id);
create index if not exists space_connections_workflow_idx on public.space_connections (source_workflow_id) where source_workflow_id is not null;
alter table public.space_connections enable row level security;

-- Uçlar aynı Space'te olmalı; Space değişmez; bir Space'te en çok 1000 bağlantı.
create or replace function public.space_connections_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.space_id <> old.space_id or new.created_at <> old.created_at
     or new.source_workflow_id is distinct from old.source_workflow_id and new.source_workflow_id is not null
     or new.source_role is distinct from old.source_role and new.source_role is not null) then
    raise exception 'space_invalid';
  end if;
  if tg_op = 'INSERT' or new.from_item_id <> old.from_item_id or new.to_item_id <> old.to_item_id then
    if (select count(*) from public.space_items i where i.id in (new.from_item_id, new.to_item_id) and i.space_id = new.space_id) <> 2 then
      raise exception 'space_invalid';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.space_connections c where c.space_id = new.space_id) >= 1000 then
      raise exception 'space_connection_limit';
    end if;
    if new.source_workflow_id is null and new.source_role is not null then
      raise exception 'space_invalid';
    end if;
    if new.source_workflow_id is not null
       and (new.source_role is null or not exists (select 1 from public.workflows w where w.id = new.source_workflow_id and w.community_id is null)) then
      raise exception 'space_source_unavailable';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists space_connections_before_write on public.space_connections;
create trigger space_connections_before_write before insert or update on public.space_connections
  for each row execute function public.space_connections_before_write();

-- Bağlantı değişikliği Space'in "son düzenleme" zamanını da ilerletir (15 sn'de bir; `_space_touch`).
create or replace function public.space_connections_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Space silinirken bağlantılar cascade ile gider; Space artık yoksa dokunma.
    if exists (select 1 from public.spaces s where s.id = old.space_id) then
      perform public._space_touch(old.space_id);
    end if;
  else
    perform public._space_touch(new.space_id);
  end if;
  return null;
end;
$$;
drop trigger if exists space_connections_after_change on public.space_connections;
create trigger space_connections_after_change after insert or update or delete on public.space_connections
  for each row execute function public.space_connections_after_change();

-- Özel not bir ucundaysa bağlantı da yalnız üyeye görünür (not görünmezken ucu "boşta" bir ok sızıntısı olmasın).
create or replace function public._space_connection_touches_private(p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.space_items i where i.id in (p_from, p_to) and i.is_private)
$$;
revoke all on function public._space_connection_touches_private(uuid, uuid) from public;
grant execute on function public._space_connection_touches_private(uuid, uuid) to anon, authenticated;

drop policy if exists "Connections follow their space; private notes only for members" on public.space_connections;
create policy "Connections follow their space; private notes only for members"
  on public.space_connections for select to anon, authenticated
  using (public.can_read_space(space_id) and (public.space_role(space_id) is not null or not public._space_connection_touches_private(from_item_id, to_item_id)));
drop policy if exists "Editors add connections" on public.space_connections;
create policy "Editors add connections"
  on public.space_connections for insert to authenticated
  with check (public.can_edit_space(space_id) and created_by = auth.uid());
drop policy if exists "Editors update connections" on public.space_connections;
create policy "Editors update connections"
  on public.space_connections for update to authenticated
  using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id));
drop policy if exists "Editors delete connections" on public.space_connections;
create policy "Editors delete connections"
  on public.space_connections for delete to authenticated using (public.can_edit_space(space_id));

revoke insert, update, delete on public.space_connections from anon;

-- Askı / paylaşım engeli (docs/history/224-*): yeni yazma tablosu `enforce_can_post`'a bağlanır.
do $$
begin
  if to_regprocedure('public.enforce_can_post()') is not null
     and not exists (select 1 from pg_trigger where tgname = 'space_connections_enforce_can_post' and tgrelid = 'public.space_connections'::regclass) then
    create trigger space_connections_enforce_can_post before insert on public.space_connections
      for each row execute function public.enforce_can_post('content');
  end if;
end $$;

-- Tetikleyici fonksiyonlarından istemci EXECUTE'u kaldırılır.
revoke execute on function public.space_items_source_guard() from public, anon, authenticated;
revoke execute on function public.space_connections_before_write() from public, anon, authenticated;
revoke execute on function public.space_connections_after_change() from public, anon, authenticated;
