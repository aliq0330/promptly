-- Workflow etiketleri — prompt_tags / generator_tags ile aynı join-tablosu
-- deseni; mevcut `tags` kataloğu ve `get_or_create_tag` RPC'si aynen kullanılır.
create table public.workflow_tags (
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  primary key (workflow_id, tag_slug)
);

alter table public.workflow_tags enable row level security;
create index workflow_tags_tag_slug_idx on public.workflow_tags (tag_slug);

create policy "Workflow tags are readable wherever their workflow is"
  on public.workflow_tags for select
  using (exists (
    select 1 from public.workflows w
    where w.id = workflow_tags.workflow_id
      and (w.status = 'published' or w.creator_id = auth.uid())
  ));

create policy "Owners can tag their own workflows"
  on public.workflow_tags for insert
  to authenticated
  with check (exists (select 1 from public.workflows w where w.id = workflow_tags.workflow_id and w.creator_id = auth.uid()));

create policy "Owners can remove tags from their own workflows"
  on public.workflow_tags for delete
  to authenticated
  using (exists (select 1 from public.workflows w where w.id = workflow_tags.workflow_id and w.creator_id = auth.uid()));
