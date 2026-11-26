-- "Sana özel" hızlandırma (docs/history/465-*): `for_you_page` → `_for_you_rank` (SECURITY DEFINER) ayrımının güvenlik ve davranış testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/for-you-fast.sql  ("FAILED=0" beklenir).
-- Eski tanımla birebir aynı sonuç, geliştirme sırasında 40 kullanıcı / 1 500 prompt'luk rastgele veride 600 sayfada karşılaştırıldı (fark 0);
-- buradaki testler RLS'siz taramanın RLS'in yaptığını açıkça yaptığını sınar.
-- alice = izleyen; bobby = alice'i engelleyen; carol = alice'in engellediği; dave = sıradan yazar.
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

insert into public.tags (slug, label) values ('kedi', 'Kedi'), ('gizli', 'Gizli');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at) values
  ('f5000000-0000-4000-8000-000000000001', :dave,  'Dave açık', 'd', 'm', 'text', 'published', 'public', now() - interval '2 hours'),
  ('f5000000-0000-4000-8000-000000000002', :bobby, 'Engelleyenin açık içeriği', 'd', 'm', 'text', 'published', 'public', now() - interval '2 hours'),
  ('f5000000-0000-4000-8000-000000000003', :carol, 'Engellenenin açık içeriği', 'd', 'm', 'text', 'published', 'public', now() - interval '2 hours'),
  ('f5000000-0000-4000-8000-000000000004', :dave,  'Dave gizli', 'd', 'm', 'text', 'published', 'private', now() - interval '2 hours'),
  ('f5000000-0000-4000-8000-000000000005', :dave,  'Dave taslak', 'd', 'm', 'text', 'draft', 'public', now() - interval '2 hours'),
  ('f5000000-0000-4000-8000-000000000006', :dave,  'Dave silinmiş', 'd', 'm', 'text', 'published', 'public', now() - interval '2 hours'),
  ('f5000000-0000-4000-8000-000000000007', :dave,  'Dave kedili', 'd', 'm', 'text', 'published', 'public', now() - interval '3 hours');
update public.prompts set deleted_at = now() where id = 'f5000000-0000-4000-8000-000000000006';
insert into public.workflows (id, creator_id, title, status, visibility, created_at) values
  ('f5100000-0000-4000-8000-000000000001', :bobby, 'Engelleyenin workflow''u', 'published', 'public', now() - interval '2 hours'),
  ('f5100000-0000-4000-8000-000000000002', :dave,  'Dave workflow', 'published', 'public', now() - interval '2 hours');
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('f5000000-0000-4000-8000-000000000004', 'gizli'),
  ('f5000000-0000-4000-8000-000000000007', 'kedi');
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :alice), (:alice, :carol);

-- 1–2. Misafir ne sarmalayıcıyı ne iç işlevi çağırabilir
set role anon;
select public._as_user('');
select public._check(1, 'anon for_you_page çağıramaz',
  public._try($q$select * from public.for_you_page(now(), null, null, null, null, 20, null, null, null)$q$) ilike '%permission denied%');
select public._check(2, 'anon _for_you_rank çağıramaz',
  public._try($q$select * from public._for_you_rank(now(), null, null, null, null, 20, null, null, null, null, null, null, null, null)$q$) ilike '%permission denied%');
reset role;

set role authenticated;
select public._as_user(:alice);
create temp table page as select * from public.for_you_page(now(), null, null, null, null, 50, null, null, null);

-- 3. Sıradan açık içerik gelir
select public._check(3, 'açık içerik akışta',
  exists (select 1 from page where id = 'f5000000-0000-4000-8000-000000000001')
  and exists (select 1 from page where id = 'f5100000-0000-4000-8000-000000000002'));
-- 4. Engel iki yönlüdür (RLS `*_hide_blocked`'ın karşılığı): beni engelleyenin de, benim engellediğimin de içeriği yok (prompt + workflow)
select public._check(4, 'engel iki yönlü: engelleyen ve engellenen yazar akışta yok',
  not exists (select 1 from page where id in ('f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000003', 'f5100000-0000-4000-8000-000000000001')));
-- 5. Gizli / taslak / silinmiş içerik yok
select public._check(5, 'gizli, taslak ve silinmiş içerik akışta yok',
  not exists (select 1 from page where id in ('f5000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000006')));
-- 6. Doğrudan iç işlev çağrısında sahte sinyal yalnız sıralamayı etkiler: gizli içerik sızmaz, kimlik hep çağıranındır
select public._check(6, 'sahte sinyalle iç işlev gizli/engelli içerik döndürmez',
  not exists (
    select 1 from public._for_you_rank(now(), null, null, null, null, 50, null, null, null,
      array['gizli','kedi'], array[99, 1]::bigint[], null, null, null)
     where id in ('f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000004',
                  'f5000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000006')));
-- 7. Etiket sinyali iç işlevde etki eder (kedi'yi beğenmiş gibi): neden "liked_tag:kedi"
select public._check(7, 'beğenilen etiket sinyali nedeni üretir',
  (select reason_kind || ':' || coalesce(reason_ref, '') from public._for_you_rank(now(), null, null, null, null, 50, null, null, null,
      array['kedi'], array[2]::bigint[], null, null, null) where id = 'f5000000-0000-4000-8000-000000000007') = 'liked_tag:kedi');
-- 8. Takip edilen etiket (gerçek tablo üzerinden, sarmalayıcıyla): neden "tag:kedi"
reset role;
insert into public.tag_follows (user_id, tag_slug) values (:alice, 'kedi');
set role authenticated;
select public._as_user(:alice);
select public._check(8, 'takip edilen etiket nedeni sarmalayıcıyla gelir',
  (select reason_kind || ':' || coalesce(reason_ref, '') from public.for_you_page(now(), null, null, null, null, 50, null, null, null)
    where id = 'f5000000-0000-4000-8000-000000000007') = 'tag:kedi');
-- 9. Sayfalama: ikinci sayfa ilkiyle kesişmez
create temp table p1 as select * from public.for_you_page(now() - interval '1 minute', null, null, null, null, 2, null, null, null);
select public._check(9, 'ikinci sayfa ilk sayfayı tekrar etmez',
  not exists (
    select 1 from public.for_you_page(now() - interval '1 minute', null, null, null, null, 2,
      (select sort_rank from p1 order by sort_rank asc, created_at asc, id asc limit 1),
      (select created_at from p1 order by sort_rank asc, created_at asc, id asc limit 1),
      (select id from p1 order by sort_rank asc, created_at asc, id asc limit 1)) x
     where x.id in (select id from p1)));
reset role;
-- 10. İç işlev SECURITY DEFINER ve search_path sabit
select public._check(10, '_for_you_rank security definer + search_path',
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = '_for_you_rank' and p.prosecdef and p.proconfig::text like '%search_path=public%'));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
