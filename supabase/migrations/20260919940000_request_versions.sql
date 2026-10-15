-- Prompt İsteği sürüm geçmişi (docs/history/170-*): `prompt_versions` / `record_prompt_version` deseninin
-- isteğe uygulanışı. Snapshot yalnızca dört alan: title, description, creative_direction, preferred_tool.
-- Durum, response_count, selected_response_prompt_id, kapanma bilgisi ve sayaçlar snapshot'a GİRMEZ ve
-- sürüm açmaz. Yazma yalnızca bu trigger'dan (SECURITY DEFINER); istemciye INSERT/UPDATE/DELETE politikası ve
-- yetkisi yoktur. Yalnızca ekleyici; mevcut tablo/trigger'lara dokunulmaz (prompt_versions için tek istisna aşağıda).

create table public.request_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.prompt_requests (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  creative_direction text,
  preferred_tool text,
  source text not null check (source in ('initial', 'owner_edit')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, version_number)
);

create index request_versions_request_id_idx on public.request_versions (request_id, version_number desc);

alter table public.request_versions enable row level security;

-- Üst içeriği okuyabilen herkes sürümleri okur: alt sorgu `prompt_requests`'in kendi SELECT politikasına
-- (herkese açık + taslak değil, ya da yazar) tabidir; yani erişim kuralı tek yerde, ebeveynde durur.
create policy "Request versions are readable wherever their request is readable"
  on public.request_versions for select
  using (exists (select 1 from public.prompt_requests r where r.id = request_versions.request_id));

revoke insert, update, delete, truncate on table public.request_versions from anon, authenticated;

create or replace function public.record_request_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version integer;
  v_editor uuid := auth.uid();
begin
  -- Taslakta yapılan düzenleme sürüm açmaz (prompt ile aynı kural).
  if old.is_draft then
    return new;
  end if;
  if not (
    (old.title is distinct from new.title)
    or (old.description is distinct from new.description)
    or (old.creative_direction is distinct from new.creative_direction)
    or (old.preferred_tool is distinct from new.preferred_tool)
  ) then
    return new;
  end if;
  -- İlk anlamlı düzenlemeden ÖNCEKİ gerçek içerik v1'dir; oluşturulma zamanı asıl içeriğinki.
  if not exists (select 1 from public.request_versions where request_id = new.id) then
    insert into public.request_versions (request_id, version_number, title, description, creative_direction, preferred_tool, source, created_by, created_at)
    values (new.id, 1, old.title, old.description, old.creative_direction, old.preferred_tool, 'initial', new.author_id, old.created_at);
  end if;
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.request_versions where request_id = new.id;
  insert into public.request_versions (request_id, version_number, title, description, creative_direction, preferred_tool, source, created_by, created_at)
  values (new.id, v_next_version, new.title, new.description, new.creative_direction, new.preferred_tool, 'owner_edit', coalesce(v_editor, new.author_id), now());
  return new;
end;
$$;

revoke all on function public.record_request_version() from public, anon, authenticated;

create trigger prompt_requests_record_version
  after update of title, description, creative_direction, preferred_tool on public.prompt_requests
  for each row execute function public.record_request_version();

-- prompt_versions SELECT politikası yalnızca `status = 'published'` bakıyordu; "Sadece ben" (private)
-- yayınlanmış bir prompt'un sürümleri başkalarına açıktı. Politika artık `prompts`'ın kendi SELECT
-- kuralını devralır (yayınlanmış + herkese açık, ya da yazar). Aynı adla yeniden oluşturulur; tablo, trigger ve veri değişmez.
drop policy "Prompt versions are readable wherever their prompt is readable" on public.prompt_versions;
create policy "Prompt versions are readable wherever their prompt is readable"
  on public.prompt_versions for select
  using (exists (select 1 from public.prompts p where p.id = prompt_versions.prompt_id));
