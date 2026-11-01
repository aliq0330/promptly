-- Açık API + MCP için IP başına hız sınırı sayacı — docs/history/302-*.
--
-- NEDEN VERİTABANINDA: Edge Function belleğinde sayaç denendi ve canlıda ÇALIŞMADI (120 ardışık istek, hiçbiri sınırlanmadı: Supabase her isteği çoğunlukla
-- farklı bir örneğe düşürüyor). Paylaşılan tek yer veritabanıdır.
--
-- KÖTÜYE KULLANIM KAPISI: anon anahtar sitede açık; "anon'un çağırabileceği bir sayaç ucu" başkasının kovasını doldurmaya ya da tabloyu şişirmeye yarardı.
-- Bu yüzden RPC bir SIR ister: Edge Function ortamında `RATE_LIMIT_SECRET` var, veritabanında yalnız SHA-256 özeti (`public_api_rate_limit_config`).
-- Sırrı bilmeyen çağrı hiçbir satır yazmadan reddedilir. Sır depoda DEĞİLDİR; özet elle (SQL) girilir. Özet yoksa RPC herkese kapalıdır ve Edge Function
-- hata alınca İZİN VERİR (hız sınırı API'yi asla düşürmemeli).
--
-- Tablolar istemciye kapalı (RLS açık, politika yok, yetki yok); yalnız SECURITY DEFINER fonksiyon yazar. `bucket` = sha256(sır|işlev|IP) özetidir:
-- ham IP saklanmaz. Satırlar en geç 1 saat sonra silinir (fonksiyon içinde ara sıra temizlik).

create table if not exists public.public_api_rate_limits (
  bucket text primary key check (char_length(bucket) between 8 and 64),
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.public_api_rate_limits enable row level security;
revoke all on public.public_api_rate_limits from anon, authenticated;
create index if not exists public_api_rate_limits_window_idx on public.public_api_rate_limits (window_start);

create table if not exists public.public_api_rate_limit_config (
  id boolean primary key default true check (id),
  secret_hash text not null check (char_length(secret_hash) = 64)
);
alter table public.public_api_rate_limit_config enable row level security;
revoke all on public.public_api_rate_limit_config from anon, authenticated;

create or replace function public.public_api_rate_hit(p_secret text, p_bucket text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_now timestamptz := now();
  v_hits integer;
  v_start timestamptz;
begin
  select c.secret_hash into v_hash from public.public_api_rate_limit_config c where c.id;
  if v_hash is null or p_secret is null or p_secret = '' or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_hash then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_bucket is null or char_length(p_bucket) not between 8 and 64
     or p_limit is null or p_limit < 1 or p_limit > 100000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'bad_request' using errcode = '22023';
  end if;

  insert into public.public_api_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    window_start = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now else r.window_start end,
    hits = case when r.window_start + make_interval(secs => p_window_seconds) <= v_now then 1 else r.hits + 1 end
  returning r.hits, r.window_start into v_hits, v_start;

  -- Eski satırlar kendiliğinden temizlenir (zamanlayıcı yok): yaklaşık 200 çağrıda bir.
  if random() < 0.005 then
    delete from public.public_api_rate_limits where window_start < v_now - interval '1 hour';
  end if;

  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
end $$;

revoke all on function public.public_api_rate_hit(text, text, integer, integer) from public;
grant execute on function public.public_api_rate_hit(text, text, integer, integer) to anon, authenticated;
