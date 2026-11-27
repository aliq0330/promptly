-- "Profilde sabitle" (docs/history/480-*): kişi kendi yayınladığı içeriği profilinin ilgili bölümünün en üstüne sabitler (raptiye işaretiyle).
--
-- YALNIZCA EKLEYİCİ: yeni tablo + yeni RPC; var olan hiçbir nesneye dokunulmaz, `drop` yok (CLAUDE.md §8.11 expand).
--
--   * `profile_pins`: kişi başına içerik başına tek satır; beş hedef sütunundan (prompt / istek / workflow / hazır ayar / Skill) tam biri dolu,
--     hedef silinince CASCADE. Kişi başına en çok 3 sabit (RPC zorlar). İstemci yazamaz — yazma yalnız `set_profile_pin`.
--   * Okuma: sahibi her zaman; başkası yalnız SATIRIN HEDEFİNİ okuyabiliyorsa (politika, hedef tablosunun kendi RLS'inden geçen `exists`) —
--     gizli/taslak/silinmiş içeriğin sabiti ziyaretçiye görünmez; ziyaretçi (anon) de herkese açık içeriğin sabitini okur.
--   * `set_profile_pin(kind, id, pinned)`: SECURITY DEFINER; oturum, içerik KENDİSİNİN + yayında + herkese açık + topluluğa/ekibe ait olmayan,
--     ≤3 sabit (kişi başına danışma kilidi: eşzamanlı iki istek sınırı aşamaz), saatte ≤60 işlem. `pinned=false` sabiti kaldırır (olmayan sabit = hata değil).
--     Dönüş: işlemden sonra sabit mi.

create table if not exists public.profile_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  prompt_id uuid references public.prompts (id) on delete cascade,
  request_id uuid references public.prompt_requests (id) on delete cascade,
  workflow_id uuid references public.workflows (id) on delete cascade,
  preset_id uuid references public.presets (id) on delete cascade,
  skill_id uuid references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_pins_exactly_one_target check (num_nonnulls(prompt_id, request_id, workflow_id, preset_id, skill_id) = 1)
);

create unique index if not exists profile_pins_prompt_uidx on public.profile_pins (user_id, prompt_id) where prompt_id is not null;
create unique index if not exists profile_pins_request_uidx on public.profile_pins (user_id, request_id) where request_id is not null;
create unique index if not exists profile_pins_workflow_uidx on public.profile_pins (user_id, workflow_id) where workflow_id is not null;
create unique index if not exists profile_pins_preset_uidx on public.profile_pins (user_id, preset_id) where preset_id is not null;
create unique index if not exists profile_pins_skill_uidx on public.profile_pins (user_id, skill_id) where skill_id is not null;
create index if not exists profile_pins_user_recent_idx on public.profile_pins (user_id, created_at desc);
-- Hedef silinince CASCADE'in tarama yapmaması için hedef sütunlarına dizin (kişi başına tekil dizinler user_id ile başlar).
create index if not exists profile_pins_prompt_idx on public.profile_pins (prompt_id) where prompt_id is not null;
create index if not exists profile_pins_request_idx on public.profile_pins (request_id) where request_id is not null;
create index if not exists profile_pins_workflow_idx on public.profile_pins (workflow_id) where workflow_id is not null;
create index if not exists profile_pins_preset_idx on public.profile_pins (preset_id) where preset_id is not null;
create index if not exists profile_pins_skill_idx on public.profile_pins (skill_id) where skill_id is not null;

alter table public.profile_pins enable row level security;
revoke all on public.profile_pins from public, anon, authenticated;
grant select on public.profile_pins to anon, authenticated;
drop policy if exists "profile_pins read" on public.profile_pins;
-- Alt sorgular ÇAĞIRANIN yetkisiyle çalışır: hedef satırı okunamıyorsa (gizli, taslak, silinmiş, engelli yazar…) sabit de görünmez.
create policy "profile_pins read" on public.profile_pins for select to anon, authenticated using (
  user_id = (select auth.uid())
  or (prompt_id is not null and exists (select 1 from public.prompts x where x.id = profile_pins.prompt_id))
  or (request_id is not null and exists (select 1 from public.prompt_requests x where x.id = profile_pins.request_id))
  or (workflow_id is not null and exists (select 1 from public.workflows x where x.id = profile_pins.workflow_id))
  or (preset_id is not null and exists (select 1 from public.presets x where x.id = profile_pins.preset_id))
  or (skill_id is not null and exists (select 1 from public.skills x where x.id = profile_pins.skill_id))
);
-- İstemci insert/update/delete politikası YOK: yazma yalnız aşağıdaki RPC.

create or replace function public.set_profile_pin(p_kind text, p_id uuid, p_pinned boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ok boolean;
  v_count integer;
  v_exists boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_kind not in ('prompt', 'request', 'workflow', 'preset', 'skill') or p_id is null or p_pinned is null then
    raise exception 'invalid_pin';
  end if;

  -- Kişi başına tek seferde tek işlem: 3 sınırı eşzamanlı isteklerle aşılamaz.
  perform pg_advisory_xact_lock(hashtextextended('profile_pin:' || v_user::text, 0));

  if not p_pinned then
    if p_kind = 'prompt' then delete from public.profile_pins where user_id = v_user and prompt_id = p_id;
    elsif p_kind = 'request' then delete from public.profile_pins where user_id = v_user and request_id = p_id;
    elsif p_kind = 'workflow' then delete from public.profile_pins where user_id = v_user and workflow_id = p_id;
    elsif p_kind = 'preset' then delete from public.profile_pins where user_id = v_user and preset_id = p_id;
    else delete from public.profile_pins where user_id = v_user and skill_id = p_id;
    end if;
    return false;
  end if;

  v_ok := case p_kind
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.author_id = v_user and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and x.author_id = v_user and not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.creator_id = v_user and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null)
    when 'preset' then exists (select 1 from public.presets x where x.id = p_id and x.creator_id = v_user and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null)
    else exists (select 1 from public.skills x where x.id = p_id and x.author_id = v_user and x.status = 'published' and x.visibility = 'public')
  end;
  if not v_ok then
    raise exception 'content_not_found';
  end if;

  v_exists := case p_kind
    when 'prompt' then exists (select 1 from public.profile_pins where user_id = v_user and prompt_id = p_id)
    when 'request' then exists (select 1 from public.profile_pins where user_id = v_user and request_id = p_id)
    when 'workflow' then exists (select 1 from public.profile_pins where user_id = v_user and workflow_id = p_id)
    when 'preset' then exists (select 1 from public.profile_pins where user_id = v_user and preset_id = p_id)
    else exists (select 1 from public.profile_pins where user_id = v_user and skill_id = p_id)
  end;
  if v_exists then
    return true;
  end if;

  select count(*) into v_count from public.profile_pins where user_id = v_user;
  if v_count >= 3 then
    raise exception 'pin_limit';
  end if;

  perform public._rate_limit('profile_pin', 60, interval '1 hour');

  if p_kind = 'prompt' then insert into public.profile_pins (user_id, prompt_id) values (v_user, p_id);
  elsif p_kind = 'request' then insert into public.profile_pins (user_id, request_id) values (v_user, p_id);
  elsif p_kind = 'workflow' then insert into public.profile_pins (user_id, workflow_id) values (v_user, p_id);
  elsif p_kind = 'preset' then insert into public.profile_pins (user_id, preset_id) values (v_user, p_id);
  else insert into public.profile_pins (user_id, skill_id) values (v_user, p_id);
  end if;
  return true;
end;
$$;

revoke all on function public.set_profile_pin(text, uuid, boolean) from public, anon;
grant execute on function public.set_profile_pin(text, uuid, boolean) to authenticated;
