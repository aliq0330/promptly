-- Telegram botu (20261102150000_telegram_bot.sql; docs/history/323-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/telegram-bot.sql  ("FAILED=0" beklenir).
-- me = bağlayan kullanıcı; ot = başka kullanıcı; blk = paylaşım engelli kullanıcı.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set blk '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot'),(:blk,'blk')) as u(id, name);

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

update public.profiles set posting_blocked = true where id = :blk;
create table public._t (k text primary key, v text);
grant all on public._t to public;

-- 1. Ziyaretçi ve oturumlu istemci: tablolara ve sahip-rol fonksiyonlarına dokunamaz
set role anon;
select public._as_user('');
select public._check(1, 'anon cannot create a code', public._try($q$ select public.telegram_link_code_create(false) $q$) ilike '%permission denied%');
select public._check(2, 'anon cannot list links', public._try($q$ select * from public.list_my_telegram_links() $q$) ilike '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:me);
select public._check(3, 'authenticated cannot read the tables', public._try($q$ select * from public.telegram_links $q$) ilike '%permission denied%'
  and public._try($q$ select * from public.telegram_link_codes $q$) ilike '%permission denied%');
select public._check(4, 'authenticated cannot call the owner-only helpers',
  public._try($q$ select * from public._telegram_link_authenticate(1) $q$) ilike '%permission denied%'
  and public._try($q$ select * from public._telegram_code_peek('x') $q$) ilike '%permission denied%'
  and public._try($q$ select * from public._telegram_link_consume('x', 1, 1, 'a', 'b', 'tr') $q$) ilike '%permission denied%'
  and public._try($q$ select * from public._telegram_pending(gen_random_uuid(), 5) $q$) ilike '%permission denied%'
  and public._try($q$ select * from public._telegram_notify_links(10) $q$) ilike '%permission denied%');

-- 2. Kod üretimi: biçim, özet saklama, süre, tek canlı kod
insert into public._t select 'code1', public.telegram_link_code_create(false)->>'code';
reset role;
select public._check(5, 'code is 8 chars from the unambiguous alphabet', (select v ~ '^[A-HJ-NP-Z2-9]{8}$' from public._t where k = 'code1'));
select public._check(6, 'only the SHA-256 digest is stored; expiry is about 10 minutes',
  (select count(*) = 1 from public.telegram_link_codes c, public._t t
    where t.k = 'code1' and c.code_hash = encode(extensions.digest(t.v, 'sha256'), 'hex') and c.user_id = :me
      and c.expires_at between now() + interval '9 minutes' and now() + interval '11 minutes')
  and not exists (select 1 from public.telegram_link_codes c, public._t t where t.k = 'code1' and c.code_hash = t.v));
set role authenticated;
select public._as_user(:me);
insert into public._t select 'code2', public.telegram_link_code_create(true)->>'code';
reset role;
select public._check(7, 'a new code replaces the old one (one live code per account) and keeps the write flag',
  (select count(*) = 1 from public.telegram_link_codes where user_id = :me)
  and (select write from public.telegram_link_codes where user_id = :me) is true);
set role authenticated;
select public._as_user(:blk);
select public._check(8, 'a posting-blocked account cannot ask for a write code',
  public._try($q$ select public.telegram_link_code_create(true) $q$) <> 'ok');
reset role;

-- 3. Kod önizleme (tüketmez) ve süresi dolan kod
select public._check(9, 'peek shows the account (username + write flag) without consuming the code',
  (select p.username = (select username from public.profiles where id = :me) and p.write from public._telegram_code_peek(encode(extensions.digest((select v from public._t where k = 'code2'), 'sha256'), 'hex')) p)
  and (select count(*) = 1 from public.telegram_link_codes where user_id = :me));
select public._check(10, 'peek of an unknown code returns nothing', not exists (select 1 from public._telegram_code_peek(repeat('0', 64))));
update public.telegram_link_codes set expires_at = now() - interval '1 minute' where user_id = :me;
select public._check(11, 'an expired code is neither peekable nor consumable',
  not exists (select 1 from public._telegram_code_peek(encode(extensions.digest((select v from public._t where k = 'code2'), 'sha256'), 'hex')))
  and public._try(format($q$ select * from public._telegram_link_consume(%L, 1001, 1001, 'ali', 'Ali', 'tr') $q$, encode(extensions.digest((select v from public._t where k = 'code2'), 'sha256'), 'hex'))) ilike '%code_invalid%');
update public.telegram_link_codes set expires_at = now() + interval '5 minutes' where user_id = :me;

-- 4. Bağlama (tüketim)
create temp table _c as
  select * from public._telegram_link_consume(encode(extensions.digest((select v from public._t where k = 'code2'), 'sha256'), 'hex'), 1001, 1001, '@ali_tg', 'Ali Tg', 'en');
select public._check(12, 'consume links the chat: write scope kept, language stored, account returned',
  (select username = (select pr.username from public.profiles pr where pr.id = :me) and scopes = array['read','write'] from _c)
  and (select language = 'en' and chat_id = 1001 and user_id = :me from public.telegram_links where telegram_user_id = 1001));
select public._check(13, 'the code is single-use (gone after consume; a second consume fails)',
  not exists (select 1 from public.telegram_link_codes where user_id = :me)
  and public._try(format($q$ select * from public._telegram_link_consume(%L, 1002, 1002, 'x', 'y', 'tr') $q$, encode(extensions.digest((select v from public._t where k = 'code2'), 'sha256'), 'hex'))) ilike '%code_invalid%');
select public._check(14, 'linking notifies the owner with a fixed sentence (system)',
  (select count(*) = 1 from public.notifications n where n.recipient_id = :me and n.type = 'system' and n.dedupe_key like 'telegram_linked:%' and n.message like 'Telegram hesabı bağlandı:%'));

-- 5. Kimlik doğrulama (bot için)
select public._check(15, 'authenticate returns link + user + scopes for the linked Telegram user, nothing for a stranger',
  (select a.user_id = :me and a.scopes = array['read','write'] from public._telegram_link_authenticate(1001, 'tr') a)
  and not exists (select 1 from public._telegram_link_authenticate(9999, null)));
select public._check(16, 'authenticate keeps the language fresh and stamps last_used_at',
  (select language = 'tr' and last_used_at is not null from public.telegram_links where telegram_user_id = 1001));

-- 6. Sınırlar: hesap başına en çok 3 bağlantı; aynı Telegram kullanıcısı yeniden bağlanınca eski bağlantı DEĞİŞİR
set role authenticated; select public._as_user(:me);
insert into public._t select 'c3', public.telegram_link_code_create(false)->>'code';
reset role;
select public._telegram_link_consume(encode(extensions.digest((select v from public._t where k = 'c3'), 'sha256'), 'hex'), 1002, 1002, 'b', 'B', 'tr');
set role authenticated; select public._as_user(:me);
insert into public._t select 'c4', public.telegram_link_code_create(false)->>'code';
reset role;
select public._telegram_link_consume(encode(extensions.digest((select v from public._t where k = 'c4'), 'sha256'), 'hex'), 1003, 1003, 'c', 'C', 'tr');
select public._check(17, 'the account now has 3 links', (select count(*) = 3 from public.telegram_links where user_id = :me));
set role authenticated; select public._as_user(:me);
select public._check(18, 'a 4th code cannot even be requested (link_limit)', public._try($q$ select public.telegram_link_code_create(false) $q$) ilike '%link_limit%');
reset role;
select public._telegram_unlink(1003);
select public._check(19, 'unlink removes the link (and is idempotent)', (select count(*) = 2 from public.telegram_links where user_id = :me) and not public._telegram_unlink(1003));

-- 7. İstemci listesi / kaldırma / tercih: yalnız kendi bağlantıları
insert into public._t select 'link1001', id::text from public.telegram_links where telegram_user_id = 1001;
set role authenticated; select public._as_user(:ot);
select public._check(20, 'another account sees none of them and cannot revoke or change them',
  (select count(*) = 0 from public.list_my_telegram_links())
  and not public.revoke_my_telegram_link((select v::uuid from public._t where k = 'link1001'))
  and not public.set_my_telegram_notify((select v::uuid from public._t where k = 'link1001'), true, true));
select public._as_user(:me);
select public._check(21, 'the owner lists their links without secrets (no chat id / hash columns)',
  (select count(*) = 2 from public.list_my_telegram_links())
  and not exists (select 1 from information_schema.columns where table_name = 'list_my_telegram_links' and column_name in ('chat_id','telegram_user_id','code_hash')));
reset role;

-- 8. Bildirim tercihi ve bekleyen bildirimler
select public._check(22, 'nothing is due before anyone opts in', not exists (select 1 from public._telegram_notify_links(100)));
update public.telegram_links set last_notified_at = now() - interval '1 hour' where telegram_user_id = 1001;
insert into public.notifications (recipient_id, actor_id, type, message, target_href, created_at) values
  (:me, :ot, 'comment', 'Paylaşımına yorum yaptı: "merhaba"', '/prompts/local?id=a', now() - interval '30 minutes'),
  (:me, :ot, 'like', 'Paylaşımını beğendi', '/prompts/local?id=a', now() - interval '29 minutes'),
  (:me, :ot, 'comment_reply', 'Yorumuna yanıt verdi: "evet"', '/prompts/local?id=a', now() - interval '28 minutes'),
  (:me, :ot, 'comment', 'ESKİ yorum', '/prompts/local?id=a', now() - interval '2 hours');
set role authenticated; select public._as_user(:me);
select public.set_my_telegram_notify((select v::uuid from public._t where k = 'link1001'), false, true);
reset role;
select public._check(23, 'enabling activity alerts moves the cursor to now (history does not flood Telegram)',
  (select last_notified_at > now() - interval '1 minute' from public.telegram_links where telegram_user_id = 1001));
update public.telegram_links set last_notified_at = now() - interval '1 hour' where telegram_user_id = 1001;
select public._check(24, 'pending = only activity types after the cursor, oldest first (likes and old rows excluded)',
  (select array_agg(type order by created_at) = array['comment', 'comment_reply'] from public._telegram_pending((select id from public.telegram_links where telegram_user_id = 1001), 5))
  and (select count(*) = 1 from public._telegram_notify_links(100)));
select public._check(25, 'pending carries the actor username', (select bool_and(actor_username = (select pr.username from public.profiles pr where pr.id = :ot)) from public._telegram_pending((select id from public.telegram_links where telegram_user_id = 1001), 5)));
select public._telegram_advance_to((select id from public.telegram_links where telegram_user_id = 1001),
  (select id from public._telegram_pending((select id from public.telegram_links where telegram_user_id = 1001), 5) order by created_at limit 1));
select public._check(26, 'advancing by notification id sends each notification once (the next batch starts after it)',
  (select array_agg(type) = array['comment_reply'] from public._telegram_pending((select id from public.telegram_links where telegram_user_id = 1001), 5)));
select public._check(27, 'activity alerts off → nothing pending even if rows exist',
  (select count(*) = 0 from public._telegram_pending((select id from public.telegram_links where telegram_user_id = 1002), 5)));

-- 9. Haftalık işaret, bot içi tercih, silme
select public._telegram_mark_weekly((select id from public.telegram_links where telegram_user_id = 1001), '2026-45');
select public._check(28, 'weekly mark is stored; a malformed week is ignored',
  (select last_weekly_week = '2026-45' from public.telegram_links where telegram_user_id = 1001));
select public._telegram_mark_weekly((select id from public.telegram_links where telegram_user_id = 1001), 'bad');
select public._check(29, 'malformed week leaves it unchanged', (select last_weekly_week = '2026-45' from public.telegram_links where telegram_user_id = 1001));
select public._check(30, 'in-bot preference toggle works (null leaves a flag alone)',
  (select notify_weekly and notify_activity from public._telegram_set_notify(1001, true, null)));
select public._check(31, 'both tables cascade on profile deletion (FK on delete cascade)',
  (select count(*) = 2 from pg_constraint where contype = 'f' and confdeltype = 'c' and confrelid = 'public.profiles'::regclass
     and conrelid in ('public.telegram_links'::regclass, 'public.telegram_link_codes'::regclass)));

-- 10. Anlık bildirim (20261102160000_telegram_push.sql; docs/history/324-*): kilit, kişiye özel liste, tetikleyici
select public._check(32, 'claim is exclusive until released (a second pass for the same link is refused), and re-claimable after release',
  (select public._telegram_claim(id) and not public._telegram_claim(id) from public.telegram_links where telegram_user_id = 1001)
  and (select public._telegram_release(id) is null from public.telegram_links where telegram_user_id = 1001)
  and (select public._telegram_claim(id) from public.telegram_links where telegram_user_id = 1001));
select public._telegram_release(id) from public.telegram_links where telegram_user_id = 1001;
update public.telegram_links set notify_claimed_at = now() - interval '2 minutes' where telegram_user_id = 1001;
select public._check(33, 'a stale claim (crashed pass, >60 s) can be taken again', (select public._telegram_claim(id) from public.telegram_links where telegram_user_id = 1001));
select public._telegram_release(id) from public.telegram_links where telegram_user_id = 1001;
select public._check(34, 'notify_links_for returns only that person''s links with activity alerts on',
  (select count(*) = 1 from public._telegram_notify_links_for(:me))
  and (select count(*) = 0 from public._telegram_notify_links_for(:ot)));
select public._check(35, 'the new helpers are closed to anon/authenticated',
  not has_function_privilege('authenticated', 'public._telegram_claim(uuid)', 'execute')
  and not has_function_privilege('anon', 'public._telegram_notify_links_for(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public._telegram_push_on_notification()', 'execute')
  and not has_function_privilege('authenticated', 'public._telegram_release(uuid)', 'execute'));

-- pg_net / Vault KURULU DEĞİL (temiz ortam): bildirim yine yazılır, tetikleyici sessizce geçer.
insert into public._t values ('try36', public._try($q$ insert into public.notifications (recipient_id, actor_id, type, message, target_href) values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'comment', 'Paylaşımına yorum yaptı: "x"', '/prompts/local?id=z') $q$));
select public._check(36, 'without pg_net/vault the notification is still written (the trigger never blocks)',
  (select v = 'ok' from public._t where k = 'try36') and exists (select 1 from public.notifications where message = 'Paylaşımına yorum yaptı: "x"'));

-- Sahte `vault` + `net` (yalnız bu testte): tetikleyicinin çağrısını kaydeder.
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('telegram_push_url', 'https://example.supabase.co/functions/v1/telegram'), ('telegram_cron_secret', 'S3CRET');
create table public._net (url text, headers jsonb, body jsonb);
create schema net;
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$
begin
  if url like '%boom%' then raise exception 'network down'; end if;
  insert into public._net values (url, headers, body);
  return 1;
end $$;

insert into public.notifications (recipient_id, actor_id, type, message, target_href) values (:me, :ot, 'comment', 'Paylaşımına yorum yaptı: "anlik"', '/prompts/local?id=a');
select public._check(37, 'an activity notification for a linked + opted-in user calls the Edge URL once, scoped to that user, with the cron secret header',
  (select count(*) = 1 and bool_and(url = 'https://example.supabase.co/functions/v1/telegram/notify?user=11111111-1111-4111-8111-111111111111'
      and headers->>'X-Cron-Secret' = 'S3CRET') from public._net));
insert into public.notifications (recipient_id, actor_id, type, message, target_href) values (:me, :ot, 'like', 'Paylaşımını beğendi', '/prompts/local?id=a');
insert into public.notifications (recipient_id, actor_id, type, message, target_href) values (:ot, :me, 'comment', 'Paylaşımına yorum yaptı: "baska"', '/prompts/local?id=a');
select public._check(38, 'non-activity types and users without a link trigger nothing', (select count(*) = 1 from public._net));
update public.telegram_links set notify_activity = false where telegram_user_id = 1001;
insert into public.notifications (recipient_id, actor_id, type, message, target_href) values (:me, :ot, 'comment_reply', 'Yorumuna yanıt verdi: "kapali"', '/prompts/local?id=a');
select public._check(39, 'alerts switched off → no call', (select count(*) = 1 from public._net));
update public.telegram_links set notify_activity = true where telegram_user_id = 1001;
update vault.decrypted_secrets set decrypted_secret = 'http://insecure.example/x' where name = 'telegram_push_url';
insert into public.notifications (recipient_id, actor_id, type, message, target_href) values (:me, :ot, 'comment', 'Paylaşımına yorum yaptı: "http"', '/prompts/local?id=a');
select public._check(40, 'a non-https URL is never called', (select count(*) = 1 from public._net));
update vault.decrypted_secrets set decrypted_secret = 'https://boom.example/fn' where name = 'telegram_push_url';
insert into public._t values ('try41', public._try($q$ insert into public.notifications (recipient_id, actor_id, type, message, target_href) values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'comment', 'Paylaşımına yorum yaptı: "boom"', '/prompts/local?id=a') $q$));
select public._check(41, 'a failing network call never blocks the notification insert',
  (select v = 'ok' from public._t where k = 'try41') and exists (select 1 from public.notifications where message = 'Paylaşımına yorum yaptı: "boom"'));
delete from vault.decrypted_secrets where name = 'telegram_cron_secret';
insert into public.notifications (recipient_id, actor_id, type, message, target_href) values (:me, :ot, 'comment', 'Paylaşımına yorum yaptı: "sirsiz"', '/prompts/local?id=a');
select public._check(42, 'a missing secret means no call (fail-open, scheduled run catches it)', (select count(*) = 1 from public._net));

select 'FAIL: ' || n || ' ' || name || ' ' || detail from public._results where not ok order by n;
select 'FAILED=' || count(*) from public._results where not ok;
