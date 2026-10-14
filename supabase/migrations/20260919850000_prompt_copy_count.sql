-- "Kullanım" sinyali: bir prompt'un kaç kez kopyalandığı / bir yapay zekâ aracında çalıştırıldığı.
--
-- Platformun imzası kopyalanan prompt; beğeni vitrin içindir, kopyalama gerçek kullanımdır.
--
--   * `prompts.copy_count`: denormalize sayaç (CLAUDE.md Bölüm 6 kalıbı).
--   * `prompt_copy_events`: dedupe tablosu. Aynı kullanıcı aynı prompt'u günde EN FAZLA BİR kez
--     sayar (tekrarlı tıklama sayacı şişirmez). Yalnızca giriş yapmış kullanıcılar sayılır
--     (misafirin kimliği yok, sayaç şişirmeye açık olurdu); yazar kendi prompt'unu saymaz;
--     yalnızca yayımlanmış + public + silinmemiş prompt sayılır.
--   * `record_prompt_copy(uuid)`: SECURITY DEFINER, yalnızca `authenticated` çalıştırabilir.
--     Olay satırı yeniyse sayacı artırır, `true` döner; yoksa `false`.
--   * Sayaç koruması: yazar kendi prompt'unu güncelleyebildiği için (RLS yalnızca "yazar" der)
--     bir istemci `copy_count`'u doğrudan yazabilirdi. BEFORE INSERT/UPDATE trigger'ı,
--     `anon`/`authenticated` rolüyle gelen değişikliği yok sayar; SECURITY DEFINER RPC
--     (sahip rolüyle çalışır) etkilenmez.
--
-- Yalnızca ekleyicidir (drop yok). `updated_at`, `like_count` güncellemesinde olduğu gibi her
-- sayaç artışında değişir; sürüm/düzenleme trigger'ları yalnızca başlık/açıklama/metin/araç
-- değişince çalıştığından bunlar tetiklenmez.

alter table public.prompts
  add column if not exists copy_count integer not null default 0 check (copy_count >= 0);

create table if not exists public.prompt_copy_events (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  primary key (prompt_id, user_id, day)
);

alter table public.prompt_copy_events enable row level security;
-- Politika YOK: istemci okuyamaz/yazamaz; yalnızca aşağıdaki RPC yazar.
create index if not exists prompt_copy_events_user_id_idx on public.prompt_copy_events (user_id);

create or replace function public.record_prompt_copy(p_prompt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_inserted integer;
begin
  if v_user is null then
    return false;
  end if;

  if not exists (
    select 1 from public.prompts p
    where p.id = p_prompt_id
      and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null
      and p.author_id <> v_user
  ) then
    return false;
  end if;

  insert into public.prompt_copy_events (prompt_id, user_id)
  values (p_prompt_id, v_user)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  update public.prompts set copy_count = copy_count + 1 where id = p_prompt_id;
  return true;
end;
$$;

revoke all on function public.record_prompt_copy(uuid) from public, anon;
grant execute on function public.record_prompt_copy(uuid) to authenticated;

create or replace function public.protect_prompt_copy_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.copy_count := 0;
    elsif new.copy_count is distinct from old.copy_count then
      new.copy_count := old.copy_count;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger prompts_protect_copy_count
  before insert or update on public.prompts
  for each row execute function public.protect_prompt_copy_count();
