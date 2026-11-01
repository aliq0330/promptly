-- docs/history/304-*: API/MCP kullanım sayacı + Yaratıcı paneli okumaları.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/public-api-prompt-uses.sql  ("FAIL" satırı çıkmamalı).
-- me = yaratıcı; u1 = başka yaratıcı; u2 = sayaç testlerinin prompt sahibi.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set u1 '''22222222-2222-4222-8222-222222222222'''
\set u2 '''33333333-3333-4333-8333-333333333333'''
\set p1 '''d4000000-0000-4000-8000-000000000001'''
\set p2 '''d4000000-0000-4000-8000-000000000002'''
\set p3 '''d4000000-0000-4000-8000-000000000003'''
\set p4 '''d4000000-0000-4000-8000-000000000004'''
\set pc '''d4000000-0000-4000-8000-000000000006'''
\set p5 '''d4000000-0000-4000-8000-000000000005'''
\set q1 '''d4100000-0000-4000-8000-000000000001'''
\set q2 '''d4100000-0000-4000-8000-000000000002'''
\set qd '''d4100000-0000-4000-8000-000000000003'''
\set qp '''d4100000-0000-4000-8000-000000000004'''
\set qc '''d4100000-0000-4000-8000-000000000005'''
\set qx '''d4100000-0000-4000-8000-000000000006'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:u1,'u1'),(:u2,'u2')) as u(id, name);

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

insert into public.conversations (id, kind) values ('e4000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e4000000-0000-4000-8000-000000000001', 'Topluluk', :me);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id, deleted_at) values
  (:p1, :me, 'P1 görsel', 'd', 'm', 'image', 'published', 'public',  null, null),
  (:p2, :me, 'P2 metin',  'd', 'm', 'text',  'published', 'public',  null, null),
  (:p3, :me, 'P3 taslak', 'd', 'm', 'text',  'draft',     'public',  null, null),
  (:p4, :me, 'P4 özel',   'd', 'm', 'text',  'published', 'private', null, null),
  (:p5, :u1, 'P5 başkası','d', 'm', 'text',  'published', 'public',  null, null),
  (:pc, :me, 'Pc topluluk','d','m', 'text',  'published', 'private', 'e4000000-0000-4000-8000-000000000001', null),
  (:q1, :u2, 'Q1', 'd', 'm', 'text', 'published', 'public',  null, null),
  (:q2, :u2, 'Q2', 'd', 'm', 'text', 'published', 'public',  null, null),
  (:qd, :u2, 'Qd taslak', 'd', 'm', 'text', 'draft', 'public', null, null),
  (:qp, :u2, 'Qp özel', 'd', 'm', 'text', 'published', 'private', null, null),
  (:qc, :u2, 'Qc topluluk', 'd', 'm', 'text', 'published', 'private', 'e4000000-0000-4000-8000-000000000001', null),
  (:qx, :u2, 'Qx silinmiş', 'd', 'm', 'text', 'published', 'public', null, now());

grant insert on public._results to anon, authenticated;

-- 1) Özet tanımlı değilken yazma herkese kapalı.
set role anon;
select public._check(1, 'sır tanımlı değilken RPC reddedilir',
  public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', 'whatever', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-aaaaaaaa')) ilike '%forbidden%'
  or public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', 'whatever', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-aaaaaaaa')) ilike '%permission denied%');
reset role;

insert into public.public_api_rate_limit_config (secret_hash) values (encode(extensions.digest('s3cret', 'sha256'), 'hex'));

-- 2) Yanlış / boş sır: reddedilir ve HİÇBİR satır yazılmaz.
set role anon;
select public._check(2, 'yanlış sır reddedilir', public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', 'wrong', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-aaaaaaaa')) ilike '%forbidden%');
select public._check(3, 'boş sır reddedilir', public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', '', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-aaaaaaaa')) ilike '%forbidden%');
reset role;
select public._check(4, 'reddedilen çağrı hiçbir şey yazmaz',
  (select count(*) from public.public_api_prompt_uses) = 0 and (select count(*) from public.public_api_prompt_use_seen) = 0);

-- 3) Doğru sırla: ilk sayım true; aynı istemci + aynı prompt + aynı yüzey + aynı gün → false; başka istemci / başka yüzey → true.
set role anon;
create temp table _r (i int, ok boolean);
grant all on _r to anon;
insert into _r select 1, public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-aaaaaaaa');
insert into _r select 2, public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-aaaaaaaa');
insert into _r select 3, public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000001', 'api', 'client-bbbbbbbb');
insert into _r select 4, public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000001', 'mcp', 'client-aaaaaaaa');
insert into _r select 5, public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000002', 'api', 'client-aaaaaaaa');
select public._check(5, 'ilk sayım true, mükerrer false, başka istemci/yüzey/prompt true',
  (select string_agg(ok::text, ',' order by i) from _r) = 'true,false,true,true,true', (select string_agg(ok::text, ',' order by i) from _r));
reset role;
select public._check(6, 'toplamlar: Q1 api 2 + mcp 1, Q2 api 1',
  (select uses from public.public_api_prompt_uses where prompt_id = :q1 and source = 'api') = 2
  and (select uses from public.public_api_prompt_uses where prompt_id = :q1 and source = 'mcp') = 1
  and (select uses from public.public_api_prompt_uses where prompt_id = :q2 and source = 'api') = 1);

-- 4) Sayılmayan promptlar: taslak, özel, topluluğa özgü, silinmiş, olmayan → false ve satır yok.
set role anon;
create temp table _r2 (k text, ok boolean);
grant all on _r2 to anon;
insert into _r2 select 'draft', public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000003', 'api', 'client-cccccccc');
insert into _r2 select 'private', public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000004', 'api', 'client-cccccccc');
insert into _r2 select 'community', public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000005', 'api', 'client-cccccccc');
insert into _r2 select 'deleted', public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000006', 'api', 'client-cccccccc');
select public._check(7, 'taslak/özel/topluluk/silinmiş prompt sayılmaz', (select bool_or(ok) from _r2) = false);
select public._check(8, 'bilinmeyen prompt kimliği sayılmaz (hata değil false)',
  public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', 's3cret', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'api', 'client-cccccccc')) = 'ok');
reset role;
select public._check(9, 'sayılmayan promptlar için hiçbir satır yazılmadı',
  (select count(*) from public.public_api_prompt_uses where prompt_id in (:qd, :qp, :qc, :qx)) = 0
  and (select count(*) from public.public_api_prompt_use_seen where client_hash = 'client-cccccccc') = 0);

-- 5) Hatalı argümanlar.
set role anon;
select public._check(10, 'geçersiz yüzey ve kısa istemci özeti reddedilir',
  public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', 's3cret', 'd4100000-0000-4000-8000-000000000001', 'cli', 'client-aaaaaaaa')) ilike '%bad_request%'
  and public._try(format('select public.record_public_api_prompt_use(%L, %L, %L, %L)', 's3cret', 'd4100000-0000-4000-8000-000000000001', 'api', 'short')) ilike '%bad_request%');
reset role;

-- 6) Bir istemci günde en çok 100 farklı prompt sayar.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
select ('d4200000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, :u2, 'Bulk ' || g, 'd', 'm', 'text', 'published', 'public' from generate_series(1, 101) g;
set role anon;
create temp table _cap (g int, ok boolean);
grant all on _cap to anon;
do $$ declare g int; begin
  for g in 1..101 loop
    insert into _cap values (g, public.record_public_api_prompt_use('s3cret', ('d4200000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'mcp', 'client-scraper'));
  end loop;
end $$;
select public._check(11, 'kazıyıcı: ilk 100 prompt sayılır, 101.si sayılmaz',
  (select count(*) filter (where ok) from _cap) = 100 and (select ok from _cap where g = 101) = false,
  (select count(*) filter (where ok) from _cap)::text);
reset role;

-- 7) Mükerrer tablosu yalnız bugünü tutar: dünkü satır bir sonraki çağrıda silinir; kalıcı toplam kalır.
insert into public.public_api_prompt_use_seen (prompt_id, source, client_hash, day) values (:q1, 'api', 'client-oldoldold', (now() at time zone 'utc')::date - 1);
insert into public.public_api_prompt_uses (prompt_id, source, day, uses) values (:q1, 'api', (now() at time zone 'utc')::date - 1, 3);
set role anon;
select public.record_public_api_prompt_use('s3cret', 'd4100000-0000-4000-8000-000000000002', 'mcp', 'client-aaaaaaaa');
reset role;
select public._check(12, 'dünkü istemci özeti silindi, dünkü toplam durur',
  (select count(*) from public.public_api_prompt_use_seen where day < (now() at time zone 'utc')::date) = 0
  and (select uses from public.public_api_prompt_uses where prompt_id = :q1 and source = 'api' and day = (now() at time zone 'utc')::date - 1) = 3);

-- 8) Tablolar istemciye kapalı.
set role anon;
select public._check(13, 'anon iki tabloyu da okuyamaz/yazamaz',
  public._try('select * from public.public_api_prompt_uses') ilike '%permission denied%'
  and public._try('select * from public.public_api_prompt_use_seen') ilike '%permission denied%'
  and public._try(format('insert into public.public_api_prompt_uses values (%L, %L, current_date, 99)', 'd4100000-0000-4000-8000-000000000001', 'api')) ilike '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:u2);
select public._check(14, 'oturumlu kullanıcı (prompt sahibi bile) tabloları okuyamaz',
  public._try('select * from public.public_api_prompt_uses') ilike '%permission denied%'
  and public._try('select * from public.public_api_prompt_use_seen') ilike '%permission denied%');
reset role;

-- 9) Panel okumaları: doğrudan kurulu satırlarla kesin sayılar.
delete from public.public_api_prompt_uses;
delete from public.public_api_prompt_use_seen;
insert into public.public_api_prompt_uses (prompt_id, source, day, uses) values
  (:p1, 'api', (now() at time zone 'utc')::date, 2), (:p1, 'mcp', (now() at time zone 'utc')::date, 1),
  (:p1, 'api', (now() at time zone 'utc')::date - 40, 5), (:p1, 'mcp', (now() at time zone 'utc')::date - 100, 7),
  (:p2, 'api', (now() at time zone 'utc')::date - 3, 4),
  (:p3, 'api', (now() at time zone 'utc')::date, 9), (:p4, 'api', (now() at time zone 'utc')::date, 9),
  (:pc, 'api', (now() at time zone 'utc')::date, 9), (:p5, 'api', (now() at time zone 'utc')::date, 9);

set role authenticated;
select public._as_user(:me);
select * from public.creator_insights_api(30) \gset a_
select public._check(15, 'genel: api 6 (önceki 5), mcp 1 (önceki 0); taslak/özel/topluluk/başkası hariç',
  :a_api_uses = 6 and :a_prev_api_uses = 5 and :a_mcp_uses = 1 and :a_prev_mcp_uses = 0,
  :'a_api_uses' || '/' || :'a_prev_api_uses' || ' ' || :'a_mcp_uses' || '/' || :'a_prev_mcp_uses');
select * from public.creator_insights_api(7) \gset b_
select public._check(16, '7 günlük pencere: api 6 / önceki 0 (40 gün önceki kayıt dışarıda)',
  :b_api_uses = 6 and :b_prev_api_uses = 0 and :b_mcp_uses = 1 and :b_prev_mcp_uses = 0);
select * from public.creator_insights_api(90) \gset c_
select public._check(17, '90 günlük pencere: 100 gün önceki mcp hâlâ dışarıda, 40 gün önceki api bu dönemde',
  :c_api_uses = 11 and :c_mcp_uses = 1 and :c_prev_mcp_uses = 7, :'c_api_uses' || ' ' || :'c_mcp_uses' || ' ' || :'c_prev_mcp_uses');
select * from public.creator_insights_prompt_api(:p1, 30) \gset d_
select public._check(18, 'prompt ayrıntısı P1: api 2/5, mcp 1/0',
  :d_api_uses = 2 and :d_prev_api_uses = 5 and :d_mcp_uses = 1 and :d_prev_mcp_uses = 0);
select * from public.creator_insights_prompt_api(:p2, 30) \gset e_
select public._check(19, 'prompt ayrıntısı P2: yalnız kendi sayısı (api 4)', :e_api_uses = 4 and :e_mcp_uses = 0);

-- 10) Sahiplik: taslak/özel/topluluk/başkasının/olmayan → not_found (varlık sızmaz).
select public._check(20, 'taslak/özel/topluluğa özgü/başkasının/olmayan prompt not_found',
  public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000003')) ilike '%not_found%'
  and public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000004')) ilike '%not_found%'
  and public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000006')) ilike '%not_found%'
  and public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000005')) ilike '%not_found%'
  and public._try('select * from public.creator_insights_prompt_api(gen_random_uuid(), 30)') ilike '%not_found%');
select public._as_user(:u1);
select * from public.creator_insights_api(30) \gset f_
select public._check(21, 'başka yaratıcı yalnız kendi promptunun sayısını görür (P5: api 9)', :f_api_uses = 9 and :f_mcp_uses = 0);
select public._check(22, 'başka yaratıcı me''nin promptunu alamaz', public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000001')) ilike '%not_found%');
select public._as_user('');
select public._check(23, 'kimliksiz çağrı not_authenticated', public._try('select * from public.creator_insights_api(30)') ilike '%not_authenticated%'
  and public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000001')) ilike '%not_authenticated%');
reset role;
set role anon;
select public._check(24, 'anon iki panel RPC''sini çağıramaz',
  public._try('select * from public.creator_insights_api(30)') ilike '%permission denied%'
  and public._try(format('select * from public.creator_insights_prompt_api(%L, 30)', 'd4000000-0000-4000-8000-000000000001')) ilike '%permission denied%');
reset role;

-- 11) Uçtan uca: Edge Function'ın çağırdığı RPC ile yazılan sayı panele düşer.
set role anon;
select public.record_public_api_prompt_use('s3cret', 'd4000000-0000-4000-8000-000000000001', 'mcp', 'client-endtoend');
reset role;
set role authenticated;
select public._as_user(:me);
select * from public.creator_insights_prompt_api(:p1, 30) \gset g_
select public._check(25, 'RPC ile yazılan MCP kullanımı panelde görünür (mcp 1 → 2)', :g_mcp_uses = 2 and :g_api_uses = 2);
reset role;

-- 12) Prompt silinince sayaçlar da gider (kimsenin verisi yetim kalmaz).
delete from public.prompts where id = :p2;
select public._check(26, 'prompt silinince kullanım satırları cascade silinir', (select count(*) from public.public_api_prompt_uses where prompt_id = :p2) = 0);

select n, name, case when ok then 'ok' else 'FAIL' end as status, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) as summary from public._results;
