-- Görünürlük (Bölüm 9.88): Prompt, Prompt İsteği ve Workflow için "Herkese açık / Sadece ben".
-- Generator ve Hazır Ayar zaten `visibility` kolonuna sahipti; bu migration aynı iki değeri
-- ('public' | 'private') diğer üç içerik türüne getirir. Varsayılan 'public' — şu ana kadar
-- yayınlanan her şey zaten herkese açıktı, bu yüzden mevcut satırlar değişmez.
--
-- Yalnızca kök tabloların SELECT politikası değişir. Alt tabloların (medya, etiket, beğeni,
-- yorum, kaydetme...) politikaları ebeveyni `exists (select 1 from prompts ...)` ile sorgular
-- ve o alt sorgu da çağıranın RLS'ine tabidir; özel bir gönderi sahibi dışında kimseye
-- görünmeyince alt verileri de görünmez olur.

alter table public.prompts add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));
alter table public.prompt_requests add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));
alter table public.workflows add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));

drop policy if exists "Published prompts are public, drafts are author-only" on public.prompts;
create policy "Published public prompts are public, the rest is author-only"
  on public.prompts for select
  using ((status = 'published' and visibility = 'public') or auth.uid() = author_id);

drop policy if exists "Published requests are public, drafts are author-only" on public.prompt_requests;
create policy "Published public requests are public, the rest is author-only"
  on public.prompt_requests for select
  using ((not is_draft and visibility = 'public') or auth.uid() = author_id);

drop policy if exists "Published workflows are public, drafts are owner-only" on public.workflows;
create policy "Published public workflows are public, the rest is owner-only"
  on public.workflows for select
  using ((status = 'published' and visibility = 'public') or creator_id = auth.uid());

-- İstatistik RPC'sinin içerik görünürlük denetimi (SECURITY DEFINER olduğu için RLS'i atlar,
-- bu yüzden kuralı kendisi uygulamalı) özel prompt/istek/workflow'u başkasına açmamalı.
create or replace function public._engager_content_visible(p_content_type text, p_content_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and ((p.status = 'published' and p.visibility = 'public') or p.author_id = auth.uid())
    )
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and ((not r.is_draft and r.visibility = 'public') or r.author_id = auth.uid())
    )
    when 'generator' then exists (
      select 1 from public.generators g
      where g.id = p_content_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid() or (w.status = 'published' and w.visibility = 'public'))
    )
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id
        and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))
    )
    else false
  end;
$$;

revoke all on function public._engager_content_visible(text, uuid) from public;
