-- Kişisel API anahtarları (20261102110000_api_tokens.sql; docs/history/313-*, 314-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-tokens.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başka kullanıcı; sus = askıdaki kullanıcı; blk = paylaşım engelli kullanıcı.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set sus '''33333333-3333-4333-8333-333333333333'''
\set blk '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot'),(:sus,'sus'),(:blk,'blk')) as u(id, name);

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
update public.profiles set posting_blocked = true where id = :blk;

-- Yardımcı: oluşturulan ham anahtarı oturumlar arasında taşır.
create table public._t (k text primary key, v text);
grant all on public._t to public;

-- 1. Ziyaretçi: ne tabloya ne RPC'lere dokunabilir
set role anon;
select public._as_user('');
select public._check(1, 'anon cannot create',  public._try($q$ select public.create_api_token('x') $q$) ilike '%permission denied%');
select public._check(2, 'anon cannot list',    public._try($q$ select * from public.list_my_api_tokens() $q$) ilike '%permission denied%');
select public._check(3, 'anon cannot read the table', public._try($q$ select * from public.api_tokens $q$) ilike '%permission denied%');
reset role;

-- 2. Oluşturma: biçim, özet saklama, bildirim
set role authenticated;
select public._as_user(:me);
insert into public._t select 'tok1', public.create_api_token('Dizüstü')->>'token';
reset role;
select public._check(4, 'token has the pmt_ + 43 char format',
  (select v ~ '^pmt_[A-Za-z0-9_-]{43}$' from public._t where k = 'tok1'));
select public._check(5, 'only the SHA-256 digest is stored (hash matches, plaintext absent)',
  (select count(*) = 1 from public.api_tokens a, public._t t
    where t.k = 'tok1' and a.token_hash = encode(extensions.digest(t.v, 'sha256'), 'hex'))
  and not exists (select 1 from public.api_tokens a, public._t t where t.k = 'tok1' and (a.token_hash = t.v or a.name = t.v or a.prefix = t.v)));
select public._check(6, 'prefix is the first 8 characters',
  (select a.prefix = left(t.v, 8) from public.api_tokens a, public._t t where t.k = 'tok1' and a.user_id = :me limit 1));
select public._check(7, 'default expiry is about 90 days and scope is read',
  (select a.expires_at between now() + interval '89 days' and now() + interval '91 days' and a.scopes = array['read'] from public.api_tokens a where a.user_id = :me limit 1));
select public._check(8, 'creating a key notifies the owner (system, no plaintext)',
  (select count(*) = 1 from public.notifications n, public._t t
    where n.recipient_id = :me and n.type = 'system' and n.dedupe_key like 'api_token_created:%' and n.message not like '%' || t.v || '%' and t.k = 'tok1'));

-- 3. Listeleme: özet/ham anahtar yok, yalnız kendi anahtarları
set role authenticated;
select public._as_user(:me);
select public._check(9, 'list returns my key without hash or token columns',
  (select count(*) = 1 from public.list_my_api_tokens())
  and not exists (select 1 from information_schema.parameters where specific_name like 'list_my_api_tokens%' and parameter_name in ('token_hash', 'token')));
select public._as_user(:ot);
select public._check(10, 'another user sees none of my keys', (select count(*) = 0 from public.list_my_api_tokens()));
select public._check(11, 'another user cannot revoke my key (false, existence not leaked)',
  (select public.revoke_api_token((select v::uuid from public._t where k = 'myid'))) = false);
reset role;
select public._check(12, 'my key is still active after the failed revoke', (select revoked_at is null from public.api_tokens where user_id = :me limit 1));

-- 4. Doğrulama: yalnız sahip rol çağırabilir; geçerli anahtar kullanıcıyı verir
set role authenticated;
select public._as_user(:me);
select public._check(13, 'clients cannot call the authenticator',
  public._try($q$ select * from public._api_token_authenticate('pmt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') $q$) ilike '%permission denied%');
reset role;
select public._check(14, 'a valid key authenticates to its owner with its scopes',
  (select a.user_id = :me and a.scopes = array['read'] from public._api_token_authenticate((select v from public._t where k = 'tok1')) a));
select public._check(15, 'last_used_at is stamped on first use',
  (select last_used_at is not null from public.api_tokens where user_id = :me limit 1));
select public._as_user('');
update public.api_tokens set last_used_at = now() - interval '10 seconds' where user_id = :me;
select count(*) from public._api_token_authenticate((select v from public._t where k = 'tok1'));
select public._check(16, 'last_used_at is throttled (not rewritten within a minute)',
  (select last_used_at < now() - interval '5 seconds' from public.api_tokens where user_id = :me limit 1));
select public._check(17, 'a wrong or malformed key yields no row',
  (select count(*) = 0 from public._api_token_authenticate('pmt_' || repeat('A', 43)))
  and (select count(*) = 0 from public._api_token_authenticate('not-a-key'))
  and (select count(*) = 0 from public._api_token_authenticate(null)));

-- 5. Doğrulama: iptal / süre / askı
set role authenticated;
select public._as_user(:me);
insert into public._t select 'id1', (select id::text from public.list_my_api_tokens() limit 1);
select public._check(18, 'revoke returns true the first time and false after',
  (select public.revoke_api_token((select v::uuid from public._t where k = 'id1'))) = true
  and (select public.revoke_api_token((select v::uuid from public._t where k = 'id1'))) = false);
reset role;
select public._check(19, 'a revoked key no longer authenticates',
  (select count(*) = 0 from public._api_token_authenticate((select v from public._t where k = 'tok1'))));

set role authenticated;
select public._as_user(:me);
insert into public._t select 'tok2', public.create_api_token('Süreli', array['read'], 30)->>'token';
reset role;
select public._as_user('');
update public.api_tokens set expires_at = now() - interval '1 minute' where user_id = :me and name = 'Süreli';
select public._check(20, 'an expired key no longer authenticates',
  (select count(*) = 0 from public._api_token_authenticate((select v from public._t where k = 'tok2'))));

-- 6. Doğrulama girdileri
set role authenticated;
select public._as_user(:me);
select public._check(21, 'empty / too long name is rejected',
  public._try($q$ select public.create_api_token('   ') $q$) like '%invalid_name%'
  and public._try($q$ select public.create_api_token(repeat('x', 61)) $q$) like '%invalid_name%');
select public._check(22, 'unknown or empty scope is rejected',
  public._try($q$ select public.create_api_token('a', array['admin']) $q$) like '%invalid_scope%'
  and public._try($q$ select public.create_api_token('a', array[]::text[]) $q$) like '%invalid_scope%');
select public._check(23, 'only 30/90/365 days (or none) are accepted',
  public._try($q$ select public.create_api_token('a', array['read'], 7) $q$) like '%invalid_expiry%');
insert into public._t select 'tok3', public.create_api_token('Süresiz', array['read', 'write', 'read'], null)->>'token';
reset role;
select public._check(24, 'a no-expiry key stores null and duplicate scopes collapse',
  (select a.expires_at is null and a.scopes = array['read', 'write'] from public.api_tokens a where a.user_id = :me and a.name = 'Süresiz'));
select public._check(25, 'a write key authenticates with both scopes',
  (select a.scopes = array['read', 'write'] from public._api_token_authenticate((select v from public._t where k = 'tok3')) a));

-- 7. Sınır: en çok 10 etkin anahtar; iptal yer açar
set role authenticated;
select public._as_user(:me);
do $$ begin
  for i in 1..8 loop perform public.create_api_token('K' || i); end loop;  -- etkin: Süresiz + 8 = 9 (Dizüstü iptal, Süreli süresi doldu)
end $$;
select public._check(26, 'the 10th active key is allowed', public._try($q$ select public.create_api_token('K9') $q$) = 'ok');
select public._check(27, 'the 11th active key is refused (token_limit)', public._try($q$ select public.create_api_token('K10') $q$) like '%token_limit%');
select public.revoke_api_token((select id from public.list_my_api_tokens() where name = 'K1'));
select public._check(28, 'revoking one frees a slot', public._try($q$ select public.create_api_token('K11') $q$) = 'ok');
reset role;

-- 8. Hız sınırı: saatte 20 oluşturma
select public._as_user('');
delete from public.api_tokens where user_id = :me;
delete from public.rate_limit_events where user_id = :me;
set role authenticated;
select public._as_user(:me);
do $$ declare v jsonb; begin
  for i in 1..20 loop v := public.create_api_token('R' || i); perform public.revoke_api_token((v->>'id')::uuid); end loop;
end $$;
select public._check(29, 'the 21st creation within an hour hits the rate limit', public._try($q$ select public.create_api_token('R21') $q$) like '%rate_limit%');
reset role;

-- 9. Askı ve paylaşım engeli
set role authenticated;
select public._as_user(:sus);
select public._check(30, 'a suspended account cannot create a key', public._try($q$ select public.create_api_token('x') $q$) ilike '%askıya%');
select public._as_user(:blk);
select public._check(31, 'a posting-blocked account can create a read key but not a write key',
  public._try($q$ select public.create_api_token('ro') $q$) = 'ok'
  and public._try($q$ select public.create_api_token('rw', array['write']) $q$) ilike '%paylaşım%');
reset role;
-- askıya sonradan alınan hesabın eski anahtarı da çalışmaz
select public._as_user('');
update public.profiles set suspended_until = null where id = :sus;
set role authenticated;
select public._as_user(:sus);
insert into public._t select 'tok_sus2', public.create_api_token('sus-key')->>'token';
reset role;
select public._check(32, 'a key authenticates while the account is fine', (select count(*) = 1 from public._api_token_authenticate((select v from public._t where k = 'tok_sus2'))));
select public._as_user('');
update public.profiles set suspended_until = now() + interval '1 day' where id = :sus;
select public._check(33, 'the same key stops authenticating once the account is suspended', (select count(*) = 0 from public._api_token_authenticate((select v from public._t where k = 'tok_sus2'))));

-- 10. Eski satır temizliği + hesap silme
select public._as_user('');
update public.api_tokens set revoked_at = now() - interval '200 days' where user_id = :blk;
set role authenticated;
select public._as_user(:blk);
select public.create_api_token('yeni');
reset role;
select public._check(34, 'revoked keys older than 180 days are cleaned when a new one is created',
  (select count(*) = 0 from public.api_tokens where user_id = :blk and revoked_at < now() - interval '180 days'));
select public._as_user('');
set session_replication_role = replica;  -- varsayılan koleksiyon koruması hesap silmeyi (kasıtlı) engeller; burada yalnız api_tokens FK zincirini sınarız
delete from public.collections where owner_id = :sus;
set session_replication_role = origin;
delete from public.profiles where id = :sus;
select public._check(35, 'deleting the account deletes its keys', (select count(*) = 0 from public.api_tokens where user_id = :sus));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
