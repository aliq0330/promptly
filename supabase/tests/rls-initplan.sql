-- 20261121100000: RLS politikalarında auth.uid() sorgu başına bir kez (InitPlan). Çalıştırma: supabase/tests/run-local.sh supabase/tests/rls-initplan.sql ("FAILED=0" beklenir).
-- Koruma: yeni bir migration çıplak auth.uid() ile politika yazarsa 1. madde kırmızı olur — `(select auth.uid())` yaz (CLAUDE.md §8.13c).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice, 'alice@test.dev', jsonb_build_object('username', 'alice', 'display_name', 'Alice')),
  (:bob,   'bob@test.dev',   jsonb_build_object('username', 'bob',   'display_name', 'Bob'));

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

select public._check(1, 'public şemasında auth.uid() çağıran politikaların hepsi sarılı (select auth.uid())',
  (select count(*) from pg_policies where schemaname = 'public'
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)') = 0,
  (select string_agg(tablename || '.' || policyname, ', ') from pg_policies where schemaname = 'public'
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)'));

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-000000000001', :alice, 'A taslak', 'd', 'm', 'text', 'draft', 'private'),
  ('a0000000-0000-4000-8000-000000000002', :alice, 'A açık',   'd', 'm', 'text', 'published', 'public');

-- Davranış aynı: sahibi kendi taslağını görür/düzenler, başkası göremez/düzenleyemez.
set role authenticated;
select public._as_user(:alice);
select public._check(2, 'sahibi kendi taslağını görür', (select count(*) from public.prompts where author_id = :alice) = 2);
with u as (update public.prompts set title = 'A taslak 2' where id = 'a0000000-0000-4000-8000-000000000001' returning 1)
select public._check(3, 'sahibi kendi promptunu düzenler', (select count(*) from u) = 1);

select public._as_user(:bob);
select public._check(4, 'başkası taslağı göremez, açık olanı görür', (select count(*) from public.prompts where author_id = :alice) = 1);
with u as (update public.prompts set title = 'kırıldı' where id = 'a0000000-0000-4000-8000-000000000002' returning 1)
select public._check(5, 'başkası açık promptu düzenleyemez (0 satır)', (select count(*) from u) = 0);
reset role;

create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
set role authenticated;
select public._as_user(:bob);
select public._check(6, 'başkası adına prompt eklenemez (RLS)',
  public._try(format($q$insert into public.prompts (author_id, title, description, prompt_text, content_type, status, visibility) values (%L, 'x', 'd', 'm', 'text', 'draft', 'private')$q$, :alice)) like '%row-level security%');
reset role;

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select public._check(7, 'ziyaretçi yalnız yayındaki açık promptu görür', (select count(*) from public.prompts where author_id = :alice) = 1);
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n || ' | ' || name || ' | ' || detail from public._results where not ok order by n;
