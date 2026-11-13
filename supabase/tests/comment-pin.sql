-- Yorum sabitleme (20261124100000_comment_pin.sql; docs/history/385-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/comment-pin.sql  ("FAILED=0" beklenir).
-- ow = içerik sahibi; me = yorum yazarı; ot = üçüncü kişi. P1 = ow'un promptu, W1 = ow'un workflow'u.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ow '''22222222-2222-4222-8222-222222222222'''
\set ot '''33333333-3333-4333-8333-333333333333'''
\set p1 '''d8000000-0000-4000-8000-000000000001'''
\set w1 '''d8000000-0000-4000-8000-000000000002'''
\set c1 '''d8100000-0000-4000-8000-000000000001'''
\set c2 '''d8100000-0000-4000-8000-000000000002'''
\set c3 '''d8100000-0000-4000-8000-000000000003'''
\set c4 '''d8100000-0000-4000-8000-000000000004'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:me, 'me@test.dev', '{"username":"pn_me","display_name":"Me"}'),
  (:ow, 'ow@test.dev', '{"username":"pn_ow","display_name":"Ow"}'),
  (:ot, 'ot@test.dev', '{"username":"pn_ot","display_name":"Ot"}');

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

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  (:p1, :ow, 'P1', 'd', 'm', 'text', 'published', 'public');
insert into public.workflows (id, creator_id, title, status) values (:w1, :ow, 'W1', 'published');
insert into public.prompt_comments (id, prompt_id, author_id, body) values
  (:c1, :p1, :me, 'birinci'), (:c2, :p1, :ot, 'ikinci');
insert into public.prompt_comments (id, prompt_id, author_id, body, parent_id) values (:c3, :p1, :ow, 'yanıt', :c1);
insert into public.prompt_comments (id, workflow_id, author_id, body) values (:c4, :w1, :me, 'wf yorumu');

-- 1. İçerik sahibi üst düzey yorumu sabitler
select public._as_user(:ow);
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000001')) as r1 \gset
select public._check(1, 'içerik sahibi yorumu sabitler', :'r1' = 'ok' and (select pinned_at is not null from public.prompt_comments where id = :c1), :'r1');

-- 2. Başka yorum sabitlenince öncekinin sabiti kalkar (hedef başına tek)
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000002')) as r2 \gset
select public._check(2, 'ikinci sabitleme öncekini kaldırır, hedef başına tek sabit',
  :'r2' = 'ok' and (select count(*) = 1 and bool_or(id = :c2) from public.prompt_comments where prompt_id = :p1 and pinned_at is not null), :'r2');

-- 3. Yanıt sabitlenemez
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000003')) as r3 \gset
select public._check(3, 'yanıt sabitlenemez (pin_top_level_only)', :'r3' ilike '%pin_top_level_only%', :'r3');

-- 4. Sahip olmayan sabitleyemez (yorum yazarı dahil)
select public._as_user(:me);
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000001')) as r4a \gset
select public._as_user(:ot);
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000001')) as r4b \gset
select public._check(4, 'içerik sahibi olmayan sabitleyemez (yorumun yazarı da)', :'r4a' ilike '%pin_not_allowed%' and :'r4b' ilike '%pin_not_allowed%', :'r4a' || ' / ' || :'r4b');

-- 5. Yazar kendi yorumunun pinned_at'ini doğrudan yazamaz
select public._as_user(:me);
select public._try(format('update public.prompt_comments set pinned_at = now() where id = %L', 'd8100000-0000-4000-8000-000000000001')) as r5 \gset
select public._check(5, 'pinned_at doğrudan güncellenemez', :'r5' ilike '%pin_not_allowed%' and (select pinned_at is null from public.prompt_comments where id = :c1), :'r5');

-- 6. Yeni yorum sabit olarak eklenemez
insert into public.prompt_comments (id, prompt_id, author_id, body, pinned_at) values ('d8100000-0000-4000-8000-000000000009', :p1, :me, 'sabit gelmek ister', now());
select public._check(6, 'eklenen yorumun pinned_at değeri her zaman boştur', (select pinned_at is null from public.prompt_comments where id = 'd8100000-0000-4000-8000-000000000009'));

-- 7. Giriş yapmamış çağıramaz; anon EXECUTE yetkisi yok
select public._as_user('');
select public._check(7, 'anon EXECUTE yetkisi yok', not has_function_privilege('anon', 'public.set_comment_pinned(uuid, boolean)', 'execute'));
select public._as_user(:ow);

-- 8. Sabit kaldırılır; sabit olmayan yorumda kaldırma zararsız
select public._try(format('select public.set_comment_pinned(%L, false)', 'd8100000-0000-4000-8000-000000000002')) as r8 \gset
select public._check(8, 'sahip sabiti kaldırır', :'r8' = 'ok' and not exists (select 1 from public.prompt_comments where prompt_id = :p1 and pinned_at is not null), :'r8');

-- 9. Silinen (soft-delete) yorum sabit kalmaz ve silinmiş yorum sabitlenemez
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000001')) as r9a \gset
reset role;
update public.prompt_comments set deleted_at = now(), body = '' where id = :c1;
select public._as_user(:ow);
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000001')) as r9b \gset
select public._check(9, 'silinen yorumun sabiti kalkar, silinmiş yorum sabitlenemez',
  :'r9a' = 'ok' and (select pinned_at is null from public.prompt_comments where id = :c1) and :'r9b' ilike '%comment_deleted%', :'r9a' || ' / ' || :'r9b');

-- 10. Workflow sahibi workflow yorumunu sabitler; hedefler birbirinden bağımsızdır
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000004')) as r10a \gset
select public._try(format('select public.set_comment_pinned(%L, true)', 'd8100000-0000-4000-8000-000000000002')) as r10b \gset
select public._check(10, 'workflow ve prompt sabitleri ayrı hedeflerdir (ikisi birden sabit olabilir)',
  :'r10a' = 'ok' and :'r10b' = 'ok'
  and (select count(*) from public.prompt_comments where pinned_at is not null) = 2, :'r10a' || ' / ' || :'r10b');

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
