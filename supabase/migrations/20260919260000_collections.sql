-- Koleksiyonlara kaydetme sistemi. Mimari karar (kullanıcının şartnamesinin
-- §9'unda kendisi de bıraktığı seçenek): genel "Kaydedilenler" (prompt_saves,
-- 20260919120300_engagement.sql) DEĞİŞTİRİLMEDİ, bozulmadı — koleksiyon
-- üyeliği tamamen ayrı bir ilişki (collection_items). Bir çalışma hem genel
-- kaydedilenlerde hem birden fazla koleksiyonda aynı anda bulunabilir; bir
-- koleksiyondan kaldırmak genel kaydı ya da başka bir koleksiyondaki
-- üyeliği hiç etkilemez (Bölüm 9.7'nin "silme başka hiçbir şeyi bozmaz"
-- ilkesiyle aynı ruh).

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  -- Denormalized, trigger-maintained — same pattern as prompts.like_count
  -- etc. (engagement.sql): avoids a COUNT(*) subquery for every row in a
  -- collections list.
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;
create index collections_owner_id_idx on public.collections (owner_id);

create trigger collections_set_updated_at
  before update on public.collections
  for each row
  execute function public.set_updated_at();

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Same work can never be added to the same collection twice (the "+"
  -- toggle in the save modal relies on this to be a plain insert, no
  -- pre-check needed).
  primary key (collection_id, prompt_id)
);

alter table public.collection_items enable row level security;
create index collection_items_prompt_id_idx on public.collection_items (prompt_id);

create or replace function public.handle_collection_item_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.collections set item_count = item_count + 1 where id = new.collection_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.collections set item_count = item_count - 1 where id = old.collection_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger collection_items_after_change
  after insert or delete on public.collection_items
  for each row
  execute function public.handle_collection_item_change();

-- === RLS =====================================================================

-- A public collection is readable by anyone; a private one only by its
-- owner — mirrors prompts.status='draft' vs 'published' (rls_policies.sql).
create policy "Collections are readable when public or owned"
  on public.collections for select
  using (visibility = 'public' or owner_id = auth.uid());

create policy "Users can create their own collections"
  on public.collections for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Users can update their own collections"
  on public.collections for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can delete their own collections"
  on public.collections for delete
  using (owner_id = auth.uid());

-- An item is readable wherever its parent collection is readable; writing
-- (add/remove) is only ever allowed on a collection the caller owns — never
-- trusts a client-supplied owner id, always joins back to collections.owner_id.
create policy "Collection items are readable wherever their collection is"
  on public.collection_items for select
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and (c.visibility = 'public' or c.owner_id = auth.uid())
    )
  );

create policy "Users can add items to their own collections"
  on public.collection_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and c.owner_id = auth.uid()
    )
  );

create policy "Users can remove items from their own collections"
  on public.collection_items for delete
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_items.collection_id
        and c.owner_id = auth.uid()
    )
  );
