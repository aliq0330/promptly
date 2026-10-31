-- "Çalıştı mı?" geri bildirimi (prompt_outcomes + RPC'ler; docs/history/296-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/prompt-outcomes.sql  ("FAILED=0" beklenir).
-- alice = oy veren; bobby = yazar; carol = kopyalamamış; dave = engellenmiş ilişki.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

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
  ('b1000000-0000-4000-8000-000000000001', :bobby, 'Herkese açık', 'd', 'm', 'text', 'published', 'public'),
  ('b1000000-0000-4000-8000-000000000002', :bobby, 'Gizli', 'd', 'm', 'text', 'published', 'private'),
  ('b1000000-0000-4000-8000-000000000003', :bobby, 'Taslak', 'd', 'm', 'text', 'draft', 'public'),
  ('b1000000-0000-4000-8000-000000000004', :alice, 'Alice''in', 'd', 'm', 'text', 'published', 'public');
-- Kopyalama olayları (dedupe tablosu): alice ilk üçünü ve kendininkini, dave birincisini kopyalamış; carol hiçbirini.
insert into public.prompt_copy_events (prompt_id, user_id) values
  ('b1000000-0000-4000-8000-000000000001', :alice),
  ('b1000000-0000-4000-8000-000000000002', :alice),
  ('b1000000-0000-4000-8000-000000000003', :alice),
  ('b1000000-0000-4000-8000-000000000001', :dave);

-- 1. Misafir yazamaz, tablo/okuma kapalı; istatistik RPC'si ziyaretçiye açık
set role anon;
select public._as_user('');
select public._check(1, 'anon set_outcome / has_copied çağıramaz, tabloyu okuyamaz; istatistik okunur',
  public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'worked')$q$) ilike '%permission denied%'
  and public._try($q$select public.has_copied_prompt('b1000000-0000-4000-8000-000000000001')$q$) ilike '%permission denied%'
  and public._try($q$select * from public.prompt_outcomes$q$) ilike '%permission denied%'
  and public._try($q$select * from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000001')$q$) = 'ok');
reset role;

-- 2. Doğrulama
set role authenticated;
select public._as_user(:alice);
select public._check(2, 'geçersiz cevap reddedilir',
  public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'great')$q$) ilike '%invalid_outcome%');
select public._check(3, 'gizli / taslak / olmayan prompt content_not_found',
  public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000002', 'worked')$q$) ilike '%content_not_found%'
  and public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000003', 'worked')$q$) ilike '%content_not_found%'
  and public._try($q$select public.set_prompt_outcome(gen_random_uuid(), 'worked')$q$) ilike '%content_not_found%');
select public._check(4, 'kendi promptuna cevap veremez',
  public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000004', 'worked')$q$) ilike '%self_outcome_not_allowed%');
select public._check(5, 'has_copied_prompt: kopyalamış true, kopyalamamış false',
  public.has_copied_prompt('b1000000-0000-4000-8000-000000000001') = true
  and public.has_copied_prompt('b1000000-0000-4000-8000-000000000004') = false);

-- 6. Kopyalamamış kişi cevap veremez
select public._as_user(:carol);
select public._check(6, 'kopyalamamış kişi outcome_requires_copy alır',
  public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'worked')$q$) ilike '%outcome_requires_copy%');

-- 7. Kayıt + araç başına ayrı satır + güncelleme
select public._as_user(:alice);
select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'worked', '  GPT Image 1 ', 'v1.5') as r1 \gset
select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'failed', 'Flux') as r2 \gset
select public._check(7, 'aynı kişi iki araç için iki ayrı cevap bırakır (araç kırpılır)',
  :'r1' = 'worked' and :'r2' = 'failed'
  and (select count(*) from public.prompt_outcomes where user_id = :alice) = 2
  and exists (select 1 from public.prompt_outcomes where tool = 'GPT Image 1' and tool_version = 'v1.5' and outcome = 'worked'));
select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'partial', 'Flux') as r3 \gset
select public._check(8, 'aynı araçta cevabı değiştirmek tek satırı günceller',
  :'r3' = 'partial'
  and (select count(*) from public.prompt_outcomes where user_id = :alice and tool = 'Flux') = 1
  and (select outcome from public.prompt_outcomes where user_id = :alice and tool = 'Flux') = 'partial');

-- 9. Okuma: yalnız kendi satırlarım; istatistik herkese toplu
select public._as_user(:dave);
select public._check(9, 'başkasının satırı doğrudan okunamaz',
  (select count(*) from public.prompt_outcomes) = 0);
select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'worked', 'GPT Image 1', 'v1.5') as r4 \gset
select public._check(10, 'istatistik araç + sürüm başına toplar',
  (select worked from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000001') where tool = 'GPT Image 1' and tool_version = 'v1.5') = 2
  and (select partial from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000001') where tool = 'Flux') = 1
  and (select count(*) from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000001')) = 2);
select public._check(11, 'gizli / taslak prompt için istatistik boş',
  (select count(*) from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000002')) = 0
  and (select count(*) from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000003')) = 0);

-- 12. Geri alma: null cevap satırı siler (içerik gizlense bile)
select public._as_user(:alice);
update public.prompts set visibility = 'private' where id = 'b1000000-0000-4000-8000-000000000001';
select coalesce(public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', null, 'Flux'), 'NULL') as r5 \gset
select public._check(12, 'geri alma tek satırı siler',
  :'r5' = 'NULL' and (select count(*) from public.prompt_outcomes where user_id = :alice) = 1);
update public.prompts set visibility = 'public' where id = 'b1000000-0000-4000-8000-000000000001';

-- 13. Engel: yazar kopyalayanı engellemiş → cevap yazamaz, istatistiği göremez
reset role;
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :dave);
set role authenticated;
select public._as_user(:dave);
select public._check(13, 'engellenen kişi cevap veremez ve istatistik göremez',
  public._try($q$select public.set_prompt_outcome('b1000000-0000-4000-8000-000000000001', 'failed', 'Flux')$q$) ilike '%interaction_blocked%'
  and (select count(*) from public.prompt_outcome_stats('b1000000-0000-4000-8000-000000000001')) = 0);

-- 14. Yaratıcı özeti: yalnız yazar, yalnız toplu sayı, kendi cevapları hariç
select public._as_user(:bobby);
select public._check(14, 'yazar toplam sayıları görür; başkası not_found',
  (select worked from public.creator_insights_prompt_outcomes('b1000000-0000-4000-8000-000000000001')) = 2
  and (select partial + failed from public.creator_insights_prompt_outcomes('b1000000-0000-4000-8000-000000000001')) = 0);
select public._as_user(:alice);
select public._check(15, 'yazar olmayan creator_insights_prompt_outcomes çağıramaz',
  public._try($q$select * from public.creator_insights_prompt_outcomes('b1000000-0000-4000-8000-000000000001')$q$) ilike '%not_found%');

-- 16. Hesap/prompt silinince cevaplar da gider
reset role;
select count(*) as before_n from public.prompt_outcomes where prompt_id = 'b1000000-0000-4000-8000-000000000001' \gset
delete from public.prompts where id = 'b1000000-0000-4000-8000-000000000001';
select public._check(16, 'prompt silinince cevapları da gider',
  :before_n >= 1 and (select count(*) from public.prompt_outcomes where prompt_id = 'b1000000-0000-4000-8000-000000000001') = 0);

-- 17. Hız sınırı: saatte ≤100 cevap
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('b1000000-0000-4000-8000-000000000009', :bobby, 'Hız', 'd', 'm', 'text', 'published', 'public');
insert into public.prompt_copy_events (prompt_id, user_id) values ('b1000000-0000-4000-8000-000000000009', :alice);
create or replace function public._burst(n int) returns text language plpgsql as $$
declare i int;
begin
  for i in 1..n loop
    perform public.set_prompt_outcome('b1000000-0000-4000-8000-000000000009', 'worked', 't' || i);
  end loop;
  return 'ok';
exception when others then return sqlerrm;
end $$;
grant execute on function public._burst(int) to public;
set role authenticated;
select public._as_user(:alice);
select public._check(17, 'saatte 100 cevaptan sonra rate_limit', public._burst(150) ilike '%rate_limit%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
