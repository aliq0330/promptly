-- Promptly OAuth sunucusu (20261102130000_oauth_server.sql; docs/history/317-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/oauth-server.sql  ("FAILED=0" beklenir).
-- me = izin veren kullanıcı; ot = başka kullanıcı; sus = askıdaki kullanıcı. Sahip-rol çağrıları Edge Function'ın doğrudan bağlantısını taklit eder.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set sus '''33333333-3333-4333-8333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot'),(:sus,'sus')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

update public.profiles set suspended_until = now() + interval '1 day' where id = :sus;

create table public._t (k text primary key, v text);
grant all on public._t to public;
-- PKCE yardımcısı: verifier → challenge
create or replace function public._pkce(v text) returns text language sql as
  $$ select translate(rtrim(encode(extensions.digest(v, 'sha256'), 'base64'), '='), '+/', '-_') $$;

-- Sabit verifier (43+ karakter)
insert into public._t values ('verifier', 'v-' || repeat('abcdefghij', 5));

-- 1. Yetkiler: ziyaretçi/oturumlu tablolara ve sahip-rol fonksiyonlarına dokunamaz
set role anon;
select public._as_user('');
select public._check(1, 'anon cannot read oauth tables', public._try($q$ select * from public.oauth_clients $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.oauth_codes $q$) ilike '%permission denied%');
select public._check(2, 'anon cannot call consent RPCs', public._try($q$ select public.oauth_request_info('x') $q$) ilike '%permission denied%'
  and public._try($q$ select public.oauth_decide('x', true) $q$) ilike '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:me);
select public._check(3, 'authenticated cannot call owner-only _oauth_* functions',
  public._try($q$ select public._oauth_register_client('x', array['https://a.test/cb']) $q$) ilike '%permission denied%'
  and public._try($q$ select public._oauth_exchange_code(gen_random_uuid(), 'x', 'y', 'z') $q$) ilike '%permission denied%'
  and public._try($q$ select public._oauth_refresh(gen_random_uuid(), 'x') $q$) ilike '%permission denied%');
select public._check(4, 'authenticated cannot read oauth tables', public._try($q$ select * from public.oauth_grants $q$) ilike '%permission denied%');
reset role;

-- 2. İstemci kaydı: doğrulamalar
insert into public._t select 'client', (public._oauth_register_client('Claude <b>x</b>', array['https://claude.ai/api/mcp/auth_callback'], 'https://claude.ai'))->>'client_id';
select public._check(5, 'a client registers with a valid https redirect', (select v ~ '^[0-9a-f-]{36}$' from public._t where k = 'client'));
select public._check(6, 'non-https and bad redirect URIs are refused',
  public._try($q$ select public._oauth_register_client('x', array['http://evil.test/cb']) $q$) ilike '%invalid_redirect_uri%'
  and public._try($q$ select public._oauth_register_client('x', array['javascript:alert(1)']) $q$) ilike '%invalid_redirect_uri%'
  and public._try($q$ select public._oauth_register_client('x', array['https://user@evil.test/cb']) $q$) ilike '%invalid_redirect_uri%'
  and public._try($q$ select public._oauth_register_client('x', array['https://a.test/cb#frag']) $q$) ilike '%invalid_redirect_uri%'
  and public._try($q$ select public._oauth_register_client('x', array[]::text[]) $q$) ilike '%invalid_redirect_uri%');
select public._check(7, 'localhost http redirect is allowed (native clients)',
  public._try($q$ select public._oauth_register_client('Cursor', array['http://localhost:3000/cb', 'http://127.0.0.1/cb']) $q$) = 'ok');
select public._check(8, 'client name is cleaned and must not be empty',
  public._try($q$ select public._oauth_register_client('   ', array['https://a.test/cb']) $q$) ilike '%invalid_client_metadata%'
  and (select name = 'Claude <b>x</b>' from public.oauth_clients where id = (select v::uuid from public._t where k = 'client')));
select public._check(9, 'more than 5 redirect URIs is refused',
  public._try($q$ select public._oauth_register_client('x', array['https://a.test/1','https://a.test/2','https://a.test/3','https://a.test/4','https://a.test/5','https://a.test/6']) $q$) ilike '%invalid_redirect_uri%');

-- 3. authorize: istemci/dönüş adresi/PKCE doğrulaması
select public._check(10, 'unknown client and unregistered redirect are refused',
  public._try(format($q$ select public._oauth_start_request(gen_random_uuid(), 'https://claude.ai/api/mcp/auth_callback', %L, 's', null, null) $q$, public._pkce((select v from public._t where k='verifier')))) ilike '%invalid_client%'
  and public._try(format($q$ select public._oauth_start_request(%L::uuid, 'https://evil.test/cb', %L, 's', null, null) $q$, (select v from public._t where k='client'), public._pkce((select v from public._t where k='verifier')))) ilike '%invalid_redirect_uri%');
select public._check(11, 'a missing/short code_challenge is refused',
  public._try(format($q$ select public._oauth_start_request(%L::uuid, 'https://claude.ai/api/mcp/auth_callback', 'short', 's', null, null) $q$, (select v from public._t where k='client'))) ilike '%invalid_request%');
insert into public._t select 'req', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), 'xyz-state', 'read write', 'https://x.test/mcp/me');
select public._check(12, 'the raw request token is not stored (only its hash)',
  (select count(*) = 1 from public.oauth_requests where id_hash = public._oauth_hash((select v from public._t where k='req')))
  and not exists (select 1 from public.oauth_requests where id_hash = (select v from public._t where k='req')));

-- 4. Onay sayfası: bilgi + karar
set role authenticated;
select public._as_user(:me);
select public._check(13, 'request_info shows client name and redirect host',
  (select (public.oauth_request_info((select v from public._t where k='req')))->>'redirect_host' = 'claude.ai'
      and (public.oauth_request_info((select v from public._t where k='req')))->>'client_name' = 'Claude <b>x</b>'));
select public._check(14, 'an unknown/expired request returns null', public.oauth_request_info('nope') is null);
insert into public._t select 'code', (public.oauth_decide((select v from public._t where k='req'), true, false))->'params'->>'code';
reset role;
select public._check(15, 'approving yields a code; only its hash is stored; request is consumed',
  (select v ~ '^[A-Za-z0-9_-]{43}$' from public._t where k='code')
  and (select count(*) = 1 from public.oauth_codes where code_hash = public._oauth_hash((select v from public._t where k='code')))
  and not exists (select 1 from public.oauth_codes where code_hash = (select v from public._t where k='code'))
  and not exists (select 1 from public.oauth_requests where id_hash = public._oauth_hash((select v from public._t where k='req'))));
set role authenticated;
select public._as_user(:me);
select public._check(16, 'a request cannot be decided twice', public._try(format($q$ select public.oauth_decide(%L, true) $q$, (select v from public._t where k='req'))) ilike '%request_not_found%');
reset role;

-- 5. Kod → belirteç (PKCE)
select public._check(17, 'wrong verifier is refused and burns the code',
  (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code'),
    'https://claude.ai/api/mcp/auth_callback', 'x-' || repeat('z', 50)))->>'error' = 'invalid_grant'
  and (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code'),
    'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))->>'error' = 'invalid_grant');

-- Yeni istek → onay → doğru değişim
insert into public._t select 'req2', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code2', (public.oauth_decide((select v from public._t where k='req2'), true, false))->'params'->>'code';
reset role;
select public._check(18, 'the redirect_uri must match exactly', 
  (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code2'),
    'https://claude.ai/other', (select v from public._t where k='verifier')))->>'error' = 'invalid_grant');
insert into public._t select 'req3', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code3', (public.oauth_decide((select v from public._t where k='req3'), true, false))->'params'->>'code';
reset role;
insert into public._t select 'tokens', (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code3'),
  'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))::text;
select public._check(19, 'a valid exchange returns access + refresh tokens, 1h, read scope',
  (select (v::jsonb->>'access_token') ~ '^pmt_[A-Za-z0-9_-]{43}$' and (v::jsonb->>'refresh_token') ~ '^pmr_[A-Za-z0-9_-]{43}$'
     and (v::jsonb->>'expires_in') = '3600' and (v::jsonb->>'scope') = 'read' from public._t where k = 'tokens'));
select public._check(20, 'the access token authenticates through the existing key path with the granted (read) scope only',
  (select count(*) = 1 and bool_and(scopes = array['read'] and user_id = :me::uuid)
     from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens'))));
select public._check(21, 'tokens and refresh are stored hashed only',
  not exists (select 1 from public.api_tokens a, public._t t where t.k='tokens' and (a.token_hash = t.v::jsonb->>'access_token'))
  and not exists (select 1 from public.oauth_grants g, public._t t where t.k='tokens' and g.refresh_hash = t.v::jsonb->>'refresh_token')
  and exists (select 1 from public.oauth_grants g, public._t t where t.k='tokens' and g.refresh_hash = public._oauth_hash(t.v::jsonb->>'refresh_token')));
select public._check(22, 'connecting notifies the owner (no token in the text)',
  (select count(*) = 1 from public.notifications n, public._t t
    where n.recipient_id = :me and n.dedupe_key like 'oauth_connected:%' and n.message like '%Claude <b>x</b>%' and n.message not like '%' || (t.v::jsonb->>'access_token') || '%' and t.k='tokens'));

-- 6. Kod yeniden kullanımı → izin iptal edilir
insert into public._t select 'replay', (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code3'),
    'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))->>'error';
select public._check(23, 'replaying a used code is refused AND revokes the grant it created',
  (select v = 'invalid_grant' from public._t where k = 'replay')
  and (select count(*) = 0 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens')))
  and (select bool_and(revoked_at is not null) from public.oauth_grants where user_id = :me::uuid));

-- 7. Yenileme döndürme
insert into public._t select 'req4', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code4', (public.oauth_decide((select v from public._t where k='req4'), true, true))->'params'->>'code';
reset role;
insert into public._t select 'tokens4', (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code4'),
  'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))::text;
select public._check(24, 'write scope is granted only when the user ticked it',
  (select (v::jsonb->>'scope') = 'read write' from public._t where k='tokens4'));
insert into public._t select 'tokens5', (public._oauth_refresh((select v::uuid from public._t where k='client'), (select v::jsonb->>'refresh_token' from public._t where k='tokens4')))::text;
select public._check(25, 'refresh returns NEW access + refresh tokens and the old access token stops working',
  (select (v::jsonb->>'access_token') ~ '^pmt_' and (v::jsonb->>'refresh_token') <> (select v::jsonb->>'refresh_token' from public._t where k='tokens4')
          and (v::jsonb->>'scope') = 'read write' from public._t where k='tokens5')
  and (select count(*) = 0 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens4')))
  and (select count(*) = 1 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens5'))));
select public._check(26, 'refresh does not pile up token rows (one access token row per grant)',
  (select count(*) = 1 from public.api_tokens where grant_id = (select id from public.oauth_grants where user_id = :me::uuid and revoked_at is null)));
-- 30 sn içinde eski refresh yeniden gösterilirse: reddedilir ama izin iptal EDİLMEZ (ağ yeniden denemesi toleransı)
select public._check(27, 'the old refresh token inside the 30s grace is refused without revoking the grant',
  (public._oauth_refresh((select v::uuid from public._t where k='client'), (select v::jsonb->>'refresh_token' from public._t where k='tokens4')))->>'error' = 'invalid_grant'
  and (select count(*) = 1 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens5'))));
-- Tolerans dışı yeniden kullanım → izin iptal
update public.oauth_grants set rotated_at = now() - interval '5 minutes' where user_id = :me::uuid and revoked_at is null;
select public._check(28, 'reusing an old refresh token later revokes the whole grant',
  (public._oauth_refresh((select v::uuid from public._t where k='client'), (select v::jsonb->>'refresh_token' from public._t where k='tokens4')))->>'error' = 'invalid_grant'
  and (select count(*) = 0 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens5')))
  and (public._oauth_refresh((select v::uuid from public._t where k='client'), (select v::jsonb->>'refresh_token' from public._t where k='tokens5')))->>'error' = 'invalid_grant');

-- 8. Başka istemciye refresh/kod verilmez
insert into public._t select 'client2', (public._oauth_register_client('Other', array['https://other.test/cb']))->>'client_id';
insert into public._t select 'req6', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code6', (public.oauth_decide((select v from public._t where k='req6'), true, false))->'params'->>'code';
reset role;
select public._check(29, 'a code issued to one client cannot be exchanged by another',
  (public._oauth_exchange_code((select v::uuid from public._t where k='client2'), (select v from public._t where k='code6'),
    'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))->>'error' = 'invalid_grant');

-- 9. Reddetme
insert into public._t select 'req7', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), 'st7', null, null);
set role authenticated;
select public._as_user(:me);
select public._check(30, 'denying returns access_denied + state and writes no code',
  (select (r->'params'->>'error') = 'access_denied' and (r->'params'->>'state') = 'st7' and (r->'params'->>'code') is null
     from (select public.oauth_decide((select v from public._t where k='req7'), false) as r) s));
reset role;

-- 10. Kullanıcı yüzü: listele / iptal / OAuth belirteçleri anahtar listesine girmez
insert into public._t select 'req8', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code8', (public.oauth_decide((select v from public._t where k='req8'), true, false))->'params'->>'code';
reset role;
insert into public._t select 'tokens8', (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code8'),
  'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))::text;
insert into public._t select 'gid', id::text from public.oauth_grants where user_id = :me::uuid and revoked_at is null limit 1;
set role authenticated;
select public._as_user(:me);
select public._check(31, 'my connected apps lists the active grant with name + host, without any token data',
  (select count(*) = 1 and bool_and(client_name = 'Claude <b>x</b>' and redirect_host = 'claude.ai') from public.list_my_oauth_grants()));
select public._check(32, 'OAuth access tokens do not appear in my API keys list nor count toward the 10-key limit',
  (select count(*) = 0 from public.list_my_api_tokens()));
select public._as_user(:ot);
select public._check(33, 'another user sees none of my grants and cannot revoke them',
  (select count(*) = 0 from public.list_my_oauth_grants())
  and public.revoke_my_oauth_grant((select v::uuid from public._t where k = 'gid')) = false);
select public._as_user(:me);
insert into public._t select 'revoked', public.revoke_my_oauth_grant((select v::uuid from public._t where k = 'gid'))::text;
select public._check(34, 'revoking a grant kills its access token immediately',
  (select v = 'true' from public._t where k = 'revoked') and (select count(*) = 0 from public.list_my_oauth_grants()));
reset role;
select public._check(35, 'the access token no longer authenticates and refresh fails after revoke',
  (select count(*) = 0 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens8')))
  and (public._oauth_refresh((select v::uuid from public._t where k='client'), (select v::jsonb->>'refresh_token' from public._t where k='tokens8')))->>'error' = 'invalid_grant');

-- 11. RFC 7009 iptal
insert into public._t select 'req9', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code9', (public.oauth_decide((select v from public._t where k='req9'), true, false))->'params'->>'code';
reset role;
insert into public._t select 'tokens9', (public._oauth_exchange_code((select v::uuid from public._t where k='client'), (select v from public._t where k='code9'),
  'https://claude.ai/api/mcp/auth_callback', (select v from public._t where k='verifier')))::text;
select public._oauth_revoke((select v::uuid from public._t where k='client2'), (select v::jsonb->>'refresh_token' from public._t where k='tokens9'));
select public._check(36, 'revoke by another client does nothing', (select count(*) = 1 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens9'))));
select public._oauth_revoke((select v::uuid from public._t where k='client'), (select v::jsonb->>'access_token' from public._t where k='tokens9'));
select public._check(37, 'revoke with the access token closes the grant; an unknown token is a silent no-op',
  (select count(*) = 0 from public._api_token_authenticate((select v::jsonb->>'access_token' from public._t where k='tokens9')))
  and public._try($q$ select public._oauth_revoke(gen_random_uuid(), 'whatever') $q$) = 'ok');

-- 12. Askıdaki kullanıcı: onay verir ama değişimde reddedilir; yazma için paylaşım yetkisi
insert into public._t select 'req10', public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
set role authenticated;
select public._as_user(:sus);
select public._check(38, 'a suspended user cannot approve', public._try(format($q$ select public.oauth_decide(%L, true) $q$, (select v from public._t where k='req10'))) <> 'ok');
reset role;

-- 13. Elle oluşturulan anahtar sınırı OAuth'tan etkilenmez
set role authenticated;
select public._as_user(:me);
insert into public._t select 'normalkey', (public.create_api_token('Normal'))->>'token';
select public._check(39, 'creating a normal API key still works and lists only the key',
  (select v ~ '^pmt_' from public._t where k = 'normalkey') and (select count(*) = 1 from public.list_my_api_tokens()));
reset role;

-- 14. İstemci silinince istekleri/kodları/izinleri gider (cascade)
insert into public._t select 'req11', public._oauth_start_request((select v::uuid from public._t where k='client2'), 'https://other.test/cb',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
delete from public.oauth_clients where id = (select v::uuid from public._t where k='client2');
select public._check(40, 'deleting a client cascades its pending requests',
  not exists (select 1 from public.oauth_requests where id_hash = public._oauth_hash((select v from public._t where k='req11'))));

-- 15. Eski izinler süpürülür (Gizlilik metni: iptal/süresi dolan izinler 30 gün sonra silinir)
insert into public._t select 'oldgrant', id::text from public.oauth_grants where user_id = :me::uuid and revoked_at is not null order by created_at limit 1;
update public.oauth_grants set revoked_at = now() - interval '31 days' where id = (select v::uuid from public._t where k = 'oldgrant');
select public._oauth_start_request((select v::uuid from public._t where k='client'), 'https://claude.ai/api/mcp/auth_callback',
  public._pkce((select v from public._t where k='verifier')), null, null, null);
select public._check(41, 'grants revoked more than 30 days ago are deleted together with their token rows',
  not exists (select 1 from public.oauth_grants where id = (select v::uuid from public._t where k = 'oldgrant'))
  and not exists (select 1 from public.api_tokens where grant_id = (select v::uuid from public._t where k = 'oldgrant')));

select 'FAILED=' || count(*) filter (where not ok) as failed from public._results;
select n, name, detail from public._results where not ok order by n;
