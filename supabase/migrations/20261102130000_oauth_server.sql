-- Promptly'nin KENDİ OAuth sunucusu (docs/history/317-*): claude.ai / ChatGPT gibi bağlayıcıların kullanıcıdan "Bağlan"la izin alıp SINIRLI belirteç almasını sağlar.
--
-- Neden Supabase OAuth'u yetmiyor: Supabase'in OAuth belirteci hesabın TAMAMI adına çalışan normal bir oturum JWT'sidir; dinamik istemci kaydını (DCR) açmak,
-- kullanıcıdan izin alan herhangi bir istemciye tüm hesabı vermek demektir. Burada verilen belirteç `pmt_` kişisel anahtarıdır (314-*): yalnız `read` ve isteğe bağlı `write`
-- (özel taslak) kapsamı, 1 saatlik ömür, iptal edilebilir. DCR bu yüzden güvenle açılabilir.
--
-- Yalnızca ekleyicidir (expand): 4 yeni tablo, yeni fonksiyonlar, `api_tokens.grant_id` sütunu ve iki mevcut fonksiyonda (`create_api_token`, `list_my_api_tokens`) OAuth
-- belirteçlerini "elle oluşturduğum anahtarlar" listesinden/sınırından ayıran küçük bir süzgeç. Hiçbir şey silinmez.
--
-- ERİŞİM: tablolara istemci HİÇ dokunamaz (RLS açık + tüm yetkiler kapalı). `_oauth_*` fonksiyonları yalnız Edge Function'ın doğrudan Postgres bağlantısına (sahip rol) açıktır;
-- oturumlu kullanıcının çağırdığı dört RPC (`oauth_request_info`, `oauth_decide`, `list_my_oauth_grants`, `revoke_my_oauth_grant`) SECURITY DEFINER'dır ve kimlik her zaman `auth.uid()`'dir.
--
-- AKIŞ: (1) istemci `register` ile kendini kaydeder (kamuya açık istemci, secret YOK, PKCE zorunlu) → (2) `authorize` isteği `oauth_requests`'e bir istek yazar ve kullanıcıyı site onay
-- sayfasına yollar → (3) kullanıcı `oauth_decide` ile onaylar/reddeder; onayda tek kullanımlık, 5 dk'lık kod üretilir (veritabanında yalnız SHA-256 özeti) → (4) `token` kodu PKCE ile
-- doğrulayıp `oauth_grants` + `api_tokens` (grant_id dolu) yazar → (5) yenileme belirteci her kullanımda DÖNER; eski belirtecin yeniden kullanımı bütün izni iptal eder.
-- Ham kod / istek / yenileme belirteci hiçbir tabloda tutulmaz.

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  client_uri text check (client_uri is null or char_length(client_uri) <= 300),
  created_at timestamptz not null default now(),
  last_authorized_at timestamptz
);

create table if not exists public.oauth_requests (
  id_hash text primary key check (char_length(id_hash) = 64),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  redirect_uri text not null check (char_length(redirect_uri) <= 500),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
  state text check (state is null or char_length(state) <= 512),
  scope text check (scope is null or char_length(scope) <= 300),
  resource text check (resource is null or char_length(resource) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists oauth_requests_expires_idx on public.oauth_requests (expires_at);

create table if not exists public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) between 1 and 2 and scopes <@ array['read', 'write']),
  refresh_hash text unique check (refresh_hash is null or char_length(refresh_hash) = 64),
  prev_refresh_hash text check (prev_refresh_hash is null or char_length(prev_refresh_hash) = 64),
  rotated_at timestamptz,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists oauth_grants_user_idx on public.oauth_grants (user_id, created_at desc);
create index if not exists oauth_grants_prev_refresh_idx on public.oauth_grants (prev_refresh_hash) where prev_refresh_hash is not null;

create table if not exists public.oauth_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null check (cardinality(scopes) between 1 and 2 and scopes <@ array['read', 'write']),
  resource text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  grant_id uuid references public.oauth_grants (id) on delete set null
);
create index if not exists oauth_codes_expires_idx on public.oauth_codes (expires_at);

alter table public.api_tokens add column if not exists grant_id uuid references public.oauth_grants (id) on delete cascade;
create index if not exists api_tokens_grant_idx on public.api_tokens (grant_id) where grant_id is not null;

alter table public.oauth_clients enable row level security;
alter table public.oauth_requests enable row level security;
alter table public.oauth_grants enable row level security;
alter table public.oauth_codes enable row level security;
revoke all on public.oauth_clients, public.oauth_requests, public.oauth_grants, public.oauth_codes from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Mevcut iki fonksiyon: OAuth belirteçleri "elle oluşturduğum anahtarlar" sınırına/listesine girmez.
-- ---------------------------------------------------------------------------------------------------------------------
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

  perform public._assert_can_act('write' = any (v_scopes));

  perform pg_advisory_xact_lock(hashtextextended('api_token:' || v_uid::text, 0));
  perform public._rate_limit('api_token_create', 20, interval '1 hour');

  delete from public.api_tokens
   where user_id = v_uid
     and grant_id is null
     and coalesce(revoked_at, expires_at) < now() - interval '180 days';

  select count(*) into v_active from public.api_tokens
   where user_id = v_uid and grant_id is null and revoked_at is null and (expires_at is null or expires_at > now());
  if v_active >= 10 then raise exception 'token_limit'; end if;

  v_token := 'pmt_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.api_tokens (user_id, name, token_hash, prefix, scopes, expires_at)
  values (v_uid, v_name, encode(extensions.digest(v_token, 'sha256'), 'hex'), left(v_token, 8), v_scopes,
          case when p_expires_in_days is null then null else now() + make_interval(days => p_expires_in_days) end)
  returning * into v_row;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_uid, null, 'system',
          format('Yeni bir API anahtarı oluşturuldu: "%s" (%s…). Sen oluşturmadıysan hemen iptal et.', v_name, v_row.prefix),
          '/settings', 'api_token_created:' || v_row.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('id', v_row.id, 'token', v_token, 'prefix', v_row.prefix, 'name', v_row.name,
                            'scopes', to_jsonb(v_row.scopes), 'expires_at', v_row.expires_at, 'created_at', v_row.created_at);
end;
$$;

create or replace function public.list_my_api_tokens()
returns table (id uuid, name text, prefix text, scopes text[], kind text, created_at timestamptz, expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.prefix, t.scopes, t.kind, t.created_at, t.expires_at, t.last_used_at, t.revoked_at
  from public.api_tokens t
  where t.user_id = auth.uid() and t.grant_id is null
  order by t.created_at desc
  limit 50;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Yardımcılar (yalnız sahip rol)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._oauth_random(p_prefix text default '')
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select p_prefix || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
$$;

create or replace function public._oauth_hash(p_value text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_value, ''), 'sha256'), 'hex');
$$;

-- Bir izni ve elindeki bütün erişim belirteçlerini iptal eder (idempotent).
create or replace function public._oauth_revoke_grant(p_grant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.oauth_grants set revoked_at = coalesce(revoked_at, now()), refresh_hash = null where id = p_grant;
  update public.api_tokens set revoked_at = coalesce(revoked_at, now()) where grant_id = p_grant;
end;
$$;

-- Yeni erişim belirteci: eski satırlar silinir (her yenilemede satır birikmesin); ham değer yalnız dönüşte.
create or replace function public._oauth_issue_access(p_grant public.oauth_grants, p_client_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := public._oauth_random('pmt_');
begin
  delete from public.api_tokens where grant_id = p_grant.id;
  insert into public.api_tokens (user_id, name, token_hash, prefix, scopes, expires_at, grant_id)
  values (p_grant.user_id, left('OAuth · ' || p_client_name, 60), public._oauth_hash(v_token), left(v_token, 8), p_grant.scopes, now() + interval '1 hour', p_grant.id);
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) İstemci kaydı (DCR) — kamuya açık istemci: secret yok, PKCE zorunlu
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._oauth_register_client(p_name text, p_redirect_uris text[], p_client_uri text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[\x01-\x1f\x7f]', '', 'g'));
  v_uris text[];
  v_uri text;
  v_client_uri text := nullif(btrim(coalesce(p_client_uri, '')), '');
  v_row public.oauth_clients;
begin
  if char_length(v_name) not between 1 and 80 then raise exception 'invalid_client_metadata: client_name'; end if;
  select coalesce(array_agg(distinct u), '{}') into v_uris from unnest(coalesce(p_redirect_uris, '{}')) as u;
  if cardinality(v_uris) not between 1 and 5 then raise exception 'invalid_redirect_uri: count'; end if;
  foreach v_uri in array v_uris loop
    -- https ya da yerel geliştirme (localhost/127.0.0.1/[::1]); kullanıcı bilgisi (user@host), parça (#) ve boşluk yok.
    if char_length(v_uri) > 500
       or not (v_uri ~ '^https://[^\s#/@\\]+(/[^\s#\\]*)?$'
               or v_uri ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?(/[^\s#\\]*)?$') then
      raise exception 'invalid_redirect_uri: %', left(v_uri, 80);
    end if;
  end loop;
  if v_client_uri is not null and (char_length(v_client_uri) > 300 or v_client_uri !~ '^https?://[^\s#@\\]+$') then v_client_uri := null; end if;

  -- Hiç yetkilendirilmemiş eski kayıtlar süpürülür; toplam kayıt sınırlıdır.
  delete from public.oauth_clients where last_authorized_at is null and created_at < now() - interval '7 days';
  if (select count(*) from public.oauth_clients) >= 20000 then raise exception 'server_busy'; end if;

  insert into public.oauth_clients (name, redirect_uris, client_uri) values (v_name, v_uris, v_client_uri) returning * into v_row;
  return jsonb_build_object('client_id', v_row.id, 'client_name', v_row.name, 'redirect_uris', to_jsonb(v_row.redirect_uris),
                            'client_id_issued_at', extract(epoch from v_row.created_at)::bigint);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Yetkilendirme isteği başlatma (authorize): ham istek belirteci yalnız burada döner (siteye yönlendirmede kullanılır)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._oauth_start_request(p_client uuid, p_redirect text, p_challenge text, p_state text, p_scope text, p_resource text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.oauth_clients;
  v_raw text;
begin
  select * into v_client from public.oauth_clients where id = p_client;
  if not found then raise exception 'invalid_client'; end if;
  if p_redirect is null or not (p_redirect = any (v_client.redirect_uris)) then raise exception 'invalid_redirect_uri'; end if;
  if p_challenge is null or p_challenge !~ '^[A-Za-z0-9_-]{43,128}$' then raise exception 'invalid_request: code_challenge'; end if;
  if p_state is not null and char_length(p_state) > 512 then raise exception 'invalid_request: state'; end if;

  delete from public.oauth_requests where expires_at < now();
  delete from public.oauth_codes where expires_at < now() - interval '1 hour';
  -- İptal edilen / süresi dolan izinler 30 gün sonra silinir (Gizlilik metninde yazılı; belirteç satırları da düşer: FK cascade).
  delete from public.oauth_grants where coalesce(revoked_at, refresh_expires_at) < now() - interval '30 days';
  if (select count(*) from public.oauth_requests) >= 50000 then raise exception 'server_busy'; end if;

  v_raw := public._oauth_random();
  insert into public.oauth_requests (id_hash, client_id, redirect_uri, code_challenge, state, scope, resource, expires_at)
  values (public._oauth_hash(v_raw), p_client, p_redirect, p_challenge, p_state, left(p_scope, 300), left(p_resource, 300), now() + interval '10 minutes');
  return v_raw;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) Onay sayfasının RPC'leri (oturumlu kullanıcı)
-- ---------------------------------------------------------------------------------------------------------------------
-- İstek bilgisi: uygulama adı + dönüş alan adı (kullanıcıya güvenmesi için gösterilen şey). Süresi dolmuş/yok → null.
create or replace function public.oauth_request_info(p_request text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_req public.oauth_requests;
  v_client public.oauth_clients;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from public.oauth_requests where id_hash = public._oauth_hash(p_request) and expires_at > now();
  if not found then return null; end if;
  select * into v_client from public.oauth_clients where id = v_req.client_id;
  return jsonb_build_object(
    'client_name', v_client.name,
    'client_uri', v_client.client_uri,
    'redirect_host', substring(v_req.redirect_uri from '^https?://([^/]+)'),
    'redirect_uri', v_req.redirect_uri,
    'resource', v_req.resource,
    'expires_at', v_req.expires_at
  );
end;
$$;

-- Karar: istek TEK KULLANIMLIKTIR (silinir). Onayda kod üretilir; ham kod yalnız bu yanıtta döner. Dönüş adresi/parametreler sayfaya verilir, URL'yi sayfa kurar.
create or replace function public.oauth_decide(p_request text, p_approve boolean, p_write boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.oauth_requests;
  v_code text;
  v_scopes text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_req from public.oauth_requests where id_hash = public._oauth_hash(p_request) and expires_at > now() for update;
  if not found then raise exception 'request_not_found'; end if;
  delete from public.oauth_requests where id_hash = v_req.id_hash;

  if not coalesce(p_approve, false) then
    return jsonb_build_object('redirect_uri', v_req.redirect_uri,
                              'params', jsonb_strip_nulls(jsonb_build_object('error', 'access_denied', 'state', v_req.state)));
  end if;

  perform public._assert_can_act(coalesce(p_write, false));
  perform public._rate_limit('oauth_approve', 30, interval '1 hour');

  v_scopes := case when coalesce(p_write, false) then array['read', 'write'] else array['read'] end;
  v_code := public._oauth_random();
  insert into public.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at)
  values (public._oauth_hash(v_code), v_req.client_id, v_uid, v_req.redirect_uri, v_req.code_challenge, v_scopes, v_req.resource, now() + interval '5 minutes');
  update public.oauth_clients set last_authorized_at = now() where id = v_req.client_id;

  return jsonb_build_object('redirect_uri', v_req.redirect_uri,
                            'params', jsonb_strip_nulls(jsonb_build_object('code', v_code, 'state', v_req.state)));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4) Kodu belirteçle değiştirme (token) — hatalar `{error: …}` döner (istisna fırlatmaz: kod/izin iptali geri alınmasın)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._oauth_exchange_code(p_client uuid, p_code text, p_redirect text, p_verifier text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code public.oauth_codes;
  v_client public.oauth_clients;
  v_grant public.oauth_grants;
  v_refresh text;
  v_access text;
begin
  if p_verifier is null or p_verifier !~ '^[A-Za-z0-9._~-]{43,128}$' then return jsonb_build_object('error', 'invalid_grant'); end if;
  select * into v_code from public.oauth_codes where code_hash = public._oauth_hash(p_code) for update;
  if not found then return jsonb_build_object('error', 'invalid_grant'); end if;

  -- Kod ikinci kez gösterildi: çalınmış olabilir → ondan doğan izin iptal edilir.
  if v_code.used_at is not null then
    if v_code.grant_id is not null then perform public._oauth_revoke_grant(v_code.grant_id); end if;
    return jsonb_build_object('error', 'invalid_grant');
  end if;

  -- Her doğrulama hatası kodu yakar.
  if v_code.client_id <> p_client or v_code.redirect_uri is distinct from p_redirect or v_code.expires_at <= now()
     or translate(rtrim(encode(extensions.digest(p_verifier, 'sha256'), 'base64'), '='), '+/', '-_') <> v_code.code_challenge
     or exists (select 1 from public.profiles p where p.id = v_code.user_id and p.suspended_until is not null and p.suspended_until > now()) then
    delete from public.oauth_codes where code_hash = v_code.code_hash;
    return jsonb_build_object('error', 'invalid_grant');
  end if;

  select * into v_client from public.oauth_clients where id = v_code.client_id;

  -- Aynı kişi + aynı uygulama için eski izinler kapanır (tek etkin izin).
  perform public._oauth_revoke_grant(g.id) from public.oauth_grants g
   where g.user_id = v_code.user_id and g.client_id = v_code.client_id and g.revoked_at is null;

  v_refresh := public._oauth_random('pmr_');
  insert into public.oauth_grants (user_id, client_id, scopes, refresh_hash, refresh_expires_at)
  values (v_code.user_id, v_code.client_id, v_code.scopes, public._oauth_hash(v_refresh), now() + interval '90 days')
  returning * into v_grant;
  v_access := public._oauth_issue_access(v_grant, v_client.name);
  update public.oauth_codes set used_at = now(), grant_id = v_grant.id where code_hash = v_code.code_hash;

  -- Sızıntıyı fark etmek için kişiye haber (sabit kalıp; ham değer yok).
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_code.user_id, null, 'system',
          format('Yeni bir uygulama hesabına bağlandı: "%s". Sen yapmadıysan Ayarlar''dan hemen kaldır.', v_client.name),
          '/settings', 'oauth_connected:' || v_grant.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('access_token', v_access, 'refresh_token', v_refresh, 'expires_in', 3600,
                            'scope', array_to_string(v_grant.scopes, ' '));
end;
$$;

-- Yenileme: belirteç döner. Eski belirteç 30 sn'lik tolerans dışında yeniden gösterilirse (çalınma işareti) izin iptal edilir.
create or replace function public._oauth_refresh(p_client uuid, p_refresh text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := public._oauth_hash(p_refresh);
  v_grant public.oauth_grants;
  v_client public.oauth_clients;
  v_new_refresh text;
  v_access text;
begin
  if p_refresh is null or p_refresh !~ '^pmr_[A-Za-z0-9_-]{43}$' then return jsonb_build_object('error', 'invalid_grant'); end if;
  select * into v_grant from public.oauth_grants where refresh_hash = v_hash for update;

  if not found then
    select * into v_grant from public.oauth_grants where prev_refresh_hash = v_hash for update;
    if found and v_grant.revoked_at is null and (v_grant.rotated_at is null or v_grant.rotated_at < now() - interval '30 seconds') then
      perform public._oauth_revoke_grant(v_grant.id);
    end if;
    return jsonb_build_object('error', 'invalid_grant');
  end if;

  if v_grant.client_id <> p_client or v_grant.revoked_at is not null or v_grant.refresh_expires_at <= now()
     or exists (select 1 from public.profiles p where p.id = v_grant.user_id and p.suspended_until is not null and p.suspended_until > now()) then
    return jsonb_build_object('error', 'invalid_grant');
  end if;

  select * into v_client from public.oauth_clients where id = v_grant.client_id;
  v_new_refresh := public._oauth_random('pmr_');
  update public.oauth_grants
     set prev_refresh_hash = v_hash, refresh_hash = public._oauth_hash(v_new_refresh), rotated_at = now(), refresh_expires_at = now() + interval '90 days'
   where id = v_grant.id
   returning * into v_grant;
  v_access := public._oauth_issue_access(v_grant, v_client.name);
  return jsonb_build_object('access_token', v_access, 'refresh_token', v_new_refresh, 'expires_in', 3600,
                            'scope', array_to_string(v_grant.scopes, ' '));
end;
$$;

-- İptal (RFC 7009): erişim ya da yenileme belirteci → bütün izin kapanır. Bilinmeyen belirteç sessizce başarılıdır.
create or replace function public._oauth_revoke(p_client uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public._oauth_hash(p_token);
  v_grant uuid;
begin
  select id into v_grant from public.oauth_grants where client_id = p_client and (refresh_hash = v_hash or prev_refresh_hash = v_hash);
  if v_grant is null then
    select t.grant_id into v_grant from public.api_tokens t join public.oauth_grants g on g.id = t.grant_id
     where t.token_hash = v_hash and g.client_id = p_client;
  end if;
  if v_grant is not null then perform public._oauth_revoke_grant(v_grant); end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5) Ayarlar → Bağlı uygulamalar (oturumlu kullanıcı)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.list_my_oauth_grants()
returns table (id uuid, client_name text, redirect_host text, scopes text[], created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, c.name, substring(c.redirect_uris[1] from '^https?://([^/]+)'), g.scopes, g.created_at,
         (select max(t.last_used_at) from public.api_tokens t where t.grant_id = g.id)
  from public.oauth_grants g
  join public.oauth_clients c on c.id = g.client_id
  where g.user_id = auth.uid() and g.revoked_at is null and g.refresh_expires_at > now()
  order by g.created_at desc
  limit 50;
$$;

create or replace function public.revoke_my_oauth_grant(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.oauth_grants set revoked_at = now(), refresh_hash = null where id = p_id and user_id = auth.uid() and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then update public.api_tokens set revoked_at = coalesce(revoked_at, now()) where grant_id = p_id; end if;
  return v_count > 0;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Yetkiler: `_oauth_*` hiçbir istemci rolüne açık değil; dört kullanıcı RPC'si yalnız oturumlu.
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on function public._oauth_random(text) from public, anon, authenticated;
revoke all on function public._oauth_hash(text) from public, anon, authenticated;
revoke all on function public._oauth_revoke_grant(uuid) from public, anon, authenticated;
revoke all on function public._oauth_issue_access(public.oauth_grants, text) from public, anon, authenticated;
revoke all on function public._oauth_register_client(text, text[], text) from public, anon, authenticated;
revoke all on function public._oauth_start_request(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public._oauth_exchange_code(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._oauth_refresh(uuid, text) from public, anon, authenticated;
revoke all on function public._oauth_revoke(uuid, text) from public, anon, authenticated;
revoke all on function public.oauth_request_info(text) from public, anon;
revoke all on function public.oauth_decide(text, boolean, boolean) from public, anon;
revoke all on function public.list_my_oauth_grants() from public, anon;
revoke all on function public.revoke_my_oauth_grant(uuid) from public, anon;
grant execute on function public.oauth_request_info(text) to authenticated;
grant execute on function public.oauth_decide(text, boolean, boolean) to authenticated;
grant execute on function public.list_my_oauth_grants() to authenticated;
grant execute on function public.revoke_my_oauth_grant(uuid) to authenticated;
