-- username-login hız sınırı: bellek içi Map yerine kalıcı, isolate'tan bağımsız.
--
-- Edge Function (`supabase/functions/username-login`) her istekte bu RPC'ye
-- sorar. Eskiden sayaç isolate belleğindeydi: isolate ölünce/yenilenince
-- sıfırlanıyor, birden çok isolate'ta ayrı ayrı tutuluyordu.
--
--   * Ham IP SAKLANMAZ. Fonksiyon IP'yi alır, SHA-256 hex'ini İÇERİDE üretir;
--     istemci/Edge Function hash seçemez. (Not: parametre ham IP'dir, bu yüzden
--     `p_ip` adını taşır.)
--   * Çağrı önce satırı ekler, sonra son 60 sn'deki satırları sayar:
--     sayı > 10 ise true (sınırlandı). Yani dakikada 10 deneme serbest, 11.'si
--     sınırlanır (eski bellek içi sınırla aynı); sınırlanan denemeler de kaydedilir.
--   * 1 günden eski satırlar aynı fonksiyonda silinir (ayrı cron gerekmez).
--   * Tabloda RLS açık ve HİÇ policy yok: anon/authenticated doğrudan okuyamaz
--     ve yazamaz. Fonksiyon SECURITY DEFINER, search_path = public, yalnızca
--     service_role çalıştırabilir.

create table if not exists public.auth_login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.auth_login_attempts enable row level security;

create index if not exists auth_login_attempts_ip_hash_created_at_idx
  on public.auth_login_attempts (ip_hash, created_at desc);
create index if not exists auth_login_attempts_created_at_idx
  on public.auth_login_attempts (created_at);

create or replace function public.auth_login_attempt(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(sha256(convert_to(coalesce(nullif(btrim(p_ip), ''), 'unknown'), 'utf8')), 'hex');
  v_recent integer;
begin
  delete from public.auth_login_attempts where created_at < now() - interval '1 day';

  insert into public.auth_login_attempts (ip_hash) values (v_hash);

  select count(*) into v_recent
  from public.auth_login_attempts
  where ip_hash = v_hash and created_at > now() - interval '60 seconds';

  return v_recent > 10;
end;
$$;

revoke all on function public.auth_login_attempt(text) from public, anon, authenticated;
grant execute on function public.auth_login_attempt(text) to service_role;
