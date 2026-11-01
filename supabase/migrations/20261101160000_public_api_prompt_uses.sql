-- Açık API ve MCP üzerinden bir promptun "kullanıldığı" (okunup doldurulduğu) sayısı + Yaratıcı paneli okumaları — docs/history/304-*.
--
-- Yalnızca ekleyicidir (expand): iki tablo + bir yazma fonksiyonu + iki okuma RPC'si. `prompts.copy_count` / `prompt_copy_events` DEĞİŞMEZ ve bu sayı oraya
-- KARIŞMAZ: site kopyalaması oturumlu kullanıcı başına sayılır (güvenilir kimlik), API/MCP ise kimliksizdir (yalnız IP özeti). İkisini toplayıp tek sayı yapmak
-- Popüler / Sana özel / "En çok kullanılan" sıralamasını ve kilometre taşı bildirimlerini kimliksiz bir girdiye açardı — panelde AYRI bir sayı olarak gösterilir.
--
-- YAZMA KAPISI: 302'deki hız sınırı sayacıyla aynı kalıp. Anon anahtar sitede açık olduğundan "anon'un çağırabileceği bir sayaç ucu" başkasının promptunu şişirmeye
-- yarardı; bu yüzden RPC SIR ister (Edge Function ortamında `RATE_LIMIT_SECRET`, veritabanında yalnız SHA-256 özeti `public_api_rate_limit_config`'te — aynı sır). Sırsız çağrı
-- hiçbir satır yazmadan reddedilir. Tek başına `/rest/v1`'e giden biri bu sayıyı değiştiremez; Edge Function'ı atlayan sayılmaz.
--
-- MÜKERRER ENGELLEME: bir istemci (IP özetinden türeyen kova) aynı promptu aynı UTC günü, aynı yüzeyden (api | mcp) en çok BİR kez sayar; bir istemci günde en çok 100 farklı prompt sayar
-- (bir kazıyıcının bütün kütüphaneye +1 yazmasını önler). Mükerrer tablosu (`..._seen`) YALNIZ bugünü tutar: her çağrıda dünkü ve eski satırlar silinir — IP özeti en çok bir gün saklanır
-- (Gizlilik metni buna göre güncellendi). Panelin okuduğu kalıcı sayı ayrı tabloda (`public_api_prompt_uses`) ve yalnız toplamdır: kimin kullandığı hiçbir yerde kalmaz.
--
-- SINIRLAR (panelde de söylenir): yazar kendi promptunu API'den okursa sayılır (kimlik yok); IP paylaşan kişiler (şirket ağı, claude.ai bağlayıcıları) tek sayılır;
-- `npx promptly-mcp` (yerel) Supabase'e doğrudan gider, Edge Function'dan geçmez → SAYILMAZ.

create table if not exists public.public_api_prompt_uses (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  source text not null check (source in ('api', 'mcp')),
  day date not null,
  uses integer not null default 0 check (uses >= 0),
  primary key (prompt_id, source, day)
);
alter table public.public_api_prompt_uses enable row level security;
revoke all on public.public_api_prompt_uses from anon, authenticated;

create table if not exists public.public_api_prompt_use_seen (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  source text not null check (source in ('api', 'mcp')),
  client_hash text not null check (char_length(client_hash) between 8 and 64),
  day date not null,
  primary key (prompt_id, source, client_hash, day)
);
alter table public.public_api_prompt_use_seen enable row level security;
revoke all on public.public_api_prompt_use_seen from anon, authenticated;
create index if not exists public_api_prompt_use_seen_client_idx on public.public_api_prompt_use_seen (client_hash, day);
create index if not exists public_api_prompt_use_seen_day_idx on public.public_api_prompt_use_seen (day);

-- 1) Yazma: yalnız Edge Function (sırla). Sayıldıysa true.
create or replace function public.record_public_api_prompt_use(p_secret text, p_prompt_id uuid, p_source text, p_client text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_day date := (now() at time zone 'utc')::date;
  v_distinct integer;
  v_inserted integer;
begin
  select c.secret_hash into v_hash from public.public_api_rate_limit_config c where c.id;
  if v_hash is null or p_secret is null or p_secret = '' or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_hash then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_prompt_id is null or p_source is null or p_source not in ('api', 'mcp')
     or p_client is null or char_length(p_client) not between 8 and 64 then
    raise exception 'bad_request' using errcode = '22023';
  end if;

  -- Mükerrer kaydı yalnız bugünü tutar (IP özeti en çok bir gün).
  delete from public.public_api_prompt_use_seen where day < v_day;

  if not exists (
    select 1 from public.prompts p
    where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null
  ) then
    return false;
  end if;

  select count(*) into v_distinct from public.public_api_prompt_use_seen s where s.client_hash = p_client and s.day = v_day;
  if v_distinct >= 100 then return false; end if;

  insert into public.public_api_prompt_use_seen (prompt_id, source, client_hash, day)
  values (p_prompt_id, p_source, p_client, v_day)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  insert into public.public_api_prompt_uses as u (prompt_id, source, day, uses)
  values (p_prompt_id, p_source, v_day, 1)
  on conflict (prompt_id, source, day) do update set uses = u.uses + 1;
  return true;
end $$;
revoke all on function public.record_public_api_prompt_use(text, uuid, text, text) from public;
grant execute on function public.record_public_api_prompt_use(text, uuid, text, text) to anon, authenticated;

-- 2) Panel: kişinin KENDİ yayınlanmış promptlarında dönem + önceki dönem, yüzeye göre. Kapsam kuralları creator_insights_summary ile aynı
-- (yayında + herkese açık + silinmemiş + topluluğa ait olmayan; kimlik `auth.uid()`; yalnız toplu sayı). Günler UTC.
create or replace function public.creator_insights_api(p_days integer default 30)
returns table (api_uses integer, prev_api_uses integer, mcp_uses integer, prev_mcp_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  select
    coalesce(sum(u.uses) filter (where u.source = 'api' and u.day >= v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'api' and u.day < v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'mcp' and u.day >= v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'mcp' and u.day < v_start), 0)::integer
  from public.public_api_prompt_uses u
  where u.day between v_prev and v_end
    and u.prompt_id in (
      select p.id from public.prompts p
      where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
        and p.deleted_at is null and p.community_id is null
    );
end $$;
revoke all on function public.creator_insights_api(integer) from public, anon;
grant execute on function public.creator_insights_api(integer) to authenticated;

-- 3) Panel: tek prompt (prompt çağıranın değilse `not_found`; varlığı sızmaz).
create or replace function public.creator_insights_prompt_api(p_prompt_id uuid, p_days integer default 30)
returns table (api_uses integer, prev_api_uses integer, mcp_uses integer, prev_mcp_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  perform 1 from public._creator_insights_own_prompt(p_prompt_id);
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  select
    coalesce(sum(u.uses) filter (where u.source = 'api' and u.day >= v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'api' and u.day < v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'mcp' and u.day >= v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'mcp' and u.day < v_start), 0)::integer
  from public.public_api_prompt_uses u
  where u.prompt_id = p_prompt_id and u.day between v_prev and v_end;
end $$;
revoke all on function public.creator_insights_prompt_api(uuid, integer) from public, anon;
grant execute on function public.creator_insights_prompt_api(uuid, integer) to authenticated;
