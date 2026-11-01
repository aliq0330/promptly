-- Kişisel API anahtarları, 1. dilim: veri modeli + oluştur/listele/iptal RPC'leri + token doğrulama (docs/history/313-*, 314-*).
--
-- Yalnızca ekleyicidir (expand): yeni tablo + yeni fonksiyonlar; mevcut hiçbir nesneye dokunmaz. Anahtarı kullanan uçlar (`/v1/me*`, kimlikli MCP) sonraki dilimdir.
--
-- ANAHTAR: `pmt_` + 32 rastgele bayt (base64url) = 47 karakter. Ham anahtar YALNIZ `create_api_token` yanıtında, bir kez döner; veritabanında yalnız SHA-256 özeti durur
-- (Space bağlantı jetonu kalıbı, 213-*). `prefix` (ilk 8 karakter, ör. `pmt_Ab3d`) yalnız kişinin listede anahtarı tanıması içindir.
--
-- ERİŞİM: tabloya istemci HİÇ dokunamaz (RLS açık + tüm yetkiler kapalı); oluştur/listele/iptal yalnız SECURITY DEFINER RPC'lerdir ve kimlik her zaman `auth.uid()`'dir.
-- Anahtarı doğrulayan `_api_token_authenticate` hiçbir istemci rolüne açık DEĞİLDİR: yalnız Edge Function'ın doğrudan Postgres bağlantısı (sahip rol) çağırır; o da
-- sonucu (kullanıcı kimliği) alıp işlem içinde `set local role authenticated` + `request.jwt.claims` kurar — böylece RLS, askı ve hız sınırı tetikleyicileri aynen çalışır.
--
-- SINIRLAR: kişi başına en çok 10 ETKİN (iptal edilmemiş, süresi dolmamış) anahtar; saatte en çok 20 oluşturma; ad 1–60 karakter; kapsam `read` ve/veya `write`;
-- süre 30/90/365 gün ya da süresiz (varsayılan 90). `write` kapsamı paylaşım yetkisi ister (`_assert_can_act(true)`: askı + paylaşım engeli).
-- Eski (iptal/süresi dolalı 180 günü geçen) satırlar yeni anahtar oluşturulurken kişi başına temizlenir.

create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  token_hash text not null unique check (char_length(token_hash) = 64),
  prefix text not null check (char_length(prefix) between 8 and 16),
  scopes text[] not null default array['read']
    check (cardinality(scopes) between 1 and 2 and scopes <@ array['read', 'write']),
  kind text not null default 'user' check (kind in ('user', 'agent', 'bot')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;
revoke all on public.api_tokens from public, anon, authenticated;

-- 1) Oluştur: ham anahtar yalnız burada döner.
create or replace function public.create_api_token(p_name text, p_scopes text[] default array['read'], p_expires_in_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_scopes text[];
  v_token text;
  v_row public.api_tokens;
  v_active integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid_name'; end if;

  select coalesce(array_agg(distinct s order by s), '{}') into v_scopes from unnest(coalesce(p_scopes, array['read'])) as s;
  if cardinality(v_scopes) = 0 or not (v_scopes <@ array['read', 'write']) then raise exception 'invalid_scope'; end if;
  if p_expires_in_days is not null and p_expires_in_days not in (30, 90, 365) then raise exception 'invalid_expiry'; end if;

  -- Askı her zaman engeller; yazma kapsamı ayrıca paylaşım yetkisi ister.
  perform public._assert_can_act('write' = any (v_scopes));

  -- Aynı kişinin eşzamanlı iki oluşturması sınırı aşmasın.
  perform pg_advisory_xact_lock(hashtextextended('api_token:' || v_uid::text, 0));
  perform public._rate_limit('api_token_create', 20, interval '1 hour');

  delete from public.api_tokens
   where user_id = v_uid
     and coalesce(revoked_at, expires_at) < now() - interval '180 days';

  select count(*) into v_active from public.api_tokens
   where user_id = v_uid and revoked_at is null and (expires_at is null or expires_at > now());
  if v_active >= 10 then raise exception 'token_limit'; end if;

  v_token := 'pmt_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.api_tokens (user_id, name, token_hash, prefix, scopes, expires_at)
  values (v_uid, v_name, encode(extensions.digest(v_token, 'sha256'), 'hex'), left(v_token, 8), v_scopes,
          case when p_expires_in_days is null then null else now() + make_interval(days => p_expires_in_days) end)
  returning * into v_row;

  -- Sızıntıyı fark etmek için kişiye haber (kendi hesabında, kendisi tetikledi; mesaj sabit kalıp).
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_uid, null, 'system',
          format('Yeni bir API anahtarı oluşturuldu: "%s" (%s…). Sen oluşturmadıysan hemen iptal et.', v_name, v_row.prefix),
          '/settings', 'api_token_created:' || v_row.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('id', v_row.id, 'token', v_token, 'prefix', v_row.prefix, 'name', v_row.name,
                            'scopes', to_jsonb(v_row.scopes), 'expires_at', v_row.expires_at, 'created_at', v_row.created_at);
end;
$$;

-- 2) Listele: yalnız kendi anahtarların; özet ve ham anahtar ASLA dönmez.
create or replace function public.list_my_api_tokens()
returns table (id uuid, name text, prefix text, scopes text[], kind text, created_at timestamptz, expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.prefix, t.scopes, t.kind, t.created_at, t.expires_at, t.last_used_at, t.revoked_at
  from public.api_tokens t
  where t.user_id = auth.uid()
  order by t.created_at desc
  limit 50;
$$;

-- 3) İptal: yalnız kendi anahtarın; bu çağrıda iptal edildiyse true (zaten iptalse / başkasınınsa false — varlığı sızmaz).
create or replace function public.revoke_api_token(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.api_tokens set revoked_at = now() where id = p_id and user_id = auth.uid() and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- 4) Doğrulama (yalnız Edge Function'ın sahip-rol bağlantısı): geçerli anahtarın sahibini ve kapsamlarını verir; geçersiz/iptal/süresi dolmuş/askıdaki hesap → satır yok.
-- `last_used_at` en çok dakikada bir güncellenir (her istekte yazma olmasın).
create or replace function public._api_token_authenticate(p_token text)
returns table (token_id uuid, user_id uuid, scopes text[])
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.api_tokens;
begin
  if p_token is null or p_token !~ '^pmt_[A-Za-z0-9_-]{43}$' then return; end if;
  select t.* into v_row from public.api_tokens t where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.revoked_at is not null or (v_row.expires_at is not null and v_row.expires_at <= now()) then return; end if;
  if exists (select 1 from public.profiles p where p.id = v_row.user_id and p.suspended_until is not null and p.suspended_until > now()) then return; end if;
  if v_row.last_used_at is null or v_row.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = v_row.id;
  end if;
  return query select v_row.id, v_row.user_id, v_row.scopes;
end;
$$;

-- Yetkiler: tablo kapalı; üç RPC yalnız oturumlu; doğrulama hiçbir istemci rolüne açık değil.
revoke all on function public.create_api_token(text, text[], integer) from public, anon;
revoke all on function public.list_my_api_tokens() from public, anon;
revoke all on function public.revoke_api_token(uuid) from public, anon;
revoke all on function public._api_token_authenticate(text) from public, anon, authenticated;
grant execute on function public.create_api_token(text, text[], integer) to authenticated;
grant execute on function public.list_my_api_tokens() to authenticated;
grant execute on function public.revoke_api_token(uuid) to authenticated;
