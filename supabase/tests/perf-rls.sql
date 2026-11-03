-- docs/history/325-*: performans migration'ının (20261103100000) DAVRANIŞI KORUDUĞUNU doğrular — engel politikası (blocked_user_ids), herkese açık
-- beğeni indeksi, trending_tags (yalnız herkese açık sayım) ve yeniden yazılan related_prompts.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/perf-rls.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice, 'alice@test.dev', jsonb_build_object('username', 'alice', 'display_name', 'Alice')),
  (:bob,   'bob@test.dev',   jsonb_build_object('username', 'bob',   'display_name', 'Bob')),
  (:carol, 'carol@test.dev', jsonb_build_object('username', 'carol', 'display_name', 'Carol'));

create table public._results (n int, name text, ok boolean, detail text);
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
grant execute on function public._check(int, text, boolean, text) to anon, authenticated;
grant insert on public._results to anon, authenticated;

create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, category, like_count) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'A1', 'd', 'alice metin', 'text', 'published', 'public', 'writing', 5),
  ('a0000000-0000-4000-8000-0000000000b1', :bob,   'B1', 'd', 'bob metin',   'text', 'published', 'public', 'writing', 9),
  ('a0000000-0000-4000-8000-0000000000c1', :carol, 'C1', 'd', 'carol metin', 'text', 'published', 'public', 'writing', 1),
  ('a0000000-0000-4000-8000-0000000000c2', :carol, 'C2 gizli', 'd', 'carol gizli', 'text', 'published', 'private', 'writing', 0);
insert into public.tags (slug, label) values ('perf-ortak', 'perf-ortak'), ('perf-gizli', 'perf-gizli') on conflict do nothing;
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('a0000000-0000-4000-8000-0000000000a1', 'perf-ortak'),
  ('a0000000-0000-4000-8000-0000000000b1', 'perf-ortak'),
  ('a0000000-0000-4000-8000-0000000000c1', 'perf-ortak'),
  ('a0000000-0000-4000-8000-0000000000c2', 'perf-gizli');
-- alice bob'u engelledi
insert into public.blocks (blocker_id, blocked_id) values (:alice, :bob);

-- 1) Politikalar yeni ifadeyi kullanıyor (6 tablo) ve eski satır-başına is_blocked çağrısı kalmadı.
select count(*) as n from pg_policy where polname like '%\_hide\_blocked' and pg_get_expr(polqual, polrelid) like '%blocked_user_ids%' \gset p1_
select count(*) as n from pg_policy where polname like '%\_hide\_blocked' and pg_get_expr(polqual, polrelid) like '%is\_blocked(%' \gset p2_
select public._check(1, '6 hide_blocked politikası blocked_user_ids kullanıyor, hiçbiri is_blocked çağırmıyor', :p1_n = 6 and :p2_n = 0, :p1_n || '/' || :p2_n);

-- 2) Görünürlük: engelleyen alice bob'un promptunu görmez; engellenen bob alice'inkini görmez; üçüncü kişi carol hepsini görür; ziyaretçi hepsini görür.
select public._as_user(:alice);
set role authenticated;
select count(*) as n from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000c1') \gset v_alice_
select public.blocked_user_ids() = array[:bob]::uuid[] as ok from (select 1) _ \gset b_alice_
reset role;
select public._as_user(:bob);
set role authenticated;
select count(*) as n from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000c1') \gset v_bob_
select public.blocked_user_ids() = array[:alice]::uuid[] as ok from (select 1) _ \gset b_bob_
reset role;
select public._as_user(:carol);
set role authenticated;
select count(*) as n from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000c1') \gset v_carol_
select cardinality(public.blocked_user_ids()) as n from (select 1) _ \gset b_carol_
reset role;
select public._as_user('');
set role anon;
select count(*) as n from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1','a0000000-0000-4000-8000-0000000000b1','a0000000-0000-4000-8000-0000000000c1') \gset v_anon_
select cardinality(public.blocked_user_ids()) as n from (select 1) _ \gset b_anon_
reset role;
select public._check(2, 'alice (engelleyen): bob''un promptu gizli, kendi + carol görünür', :v_alice_n = 2 and :'b_alice_ok' = 't', :v_alice_n || '/' || :'b_alice_ok');
select public._check(3, 'bob (engellenen): alice''in promptu gizli (iki yönlü)', :v_bob_n = 2 and :'b_bob_ok' = 't', :v_bob_n || '/' || :'b_bob_ok');
select public._check(4, 'carol (ilişkisiz): hepsi görünür, engel kümesi boş', :v_carol_n = 3 and :b_carol_n = 0, :v_carol_n || '/' || :b_carol_n);
select public._check(5, 'ziyaretçi: hepsi görünür, hata yok, engel kümesi boş', :v_anon_n = 3 and :b_anon_n = 0, :v_anon_n || '/' || :b_anon_n);

-- 3) Eski ifadeyle (is_blocked) birebir aynı karar: her (kullanıcı, yazar) çifti ve ziyaretçi için `is_blocked(u, a)` = `blocked_user_ids() @> {a}`.
create temp table _eq (u text, a uuid, old_v boolean, new_v boolean);
do $$
declare u text; a uuid;
begin
  foreach u in array array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', ''] loop
    perform public._as_user(u);
    for a in select id from auth.users loop
      insert into _eq values (u, a, public.is_blocked(nullif(u, '')::uuid, a), public.blocked_user_ids() @> array[a]);
    end loop;
  end loop;
end $$;
select public._check(6, 'blocked_user_ids() ⊇ {a}, tüm kullanıcı/yazar çiftlerinde ve ziyaretçide is_blocked(u, a) ile aynı',
  (select count(*) from _eq) = 12 and not exists (select 1 from _eq where old_v is distinct from new_v), (select count(*) filter (where old_v is distinct from new_v) from _eq) || ' fark');
select public._as_user('');

-- 4) Herkese açık beğeni indeksi, sorgu şekliyle eşleşiyor (seq scan kapatılınca bu indeks seçilir).
set enable_seqscan = off;
create temp table _plan (line text);
do $$
declare r record;
begin
  for r in execute 'explain select id from public.prompts where status = ''published'' and visibility = ''public'' and community_id is null and deleted_at is null order by like_count desc, id asc limit 12' loop
    insert into _plan values (r."QUERY PLAN");
  end loop;
end $$;
set enable_seqscan = on;
select public._check(7, 'ORDER BY like_count DESC LIMIT sorgusu prompts_public_like_idx kullanıyor', exists (select 1 from _plan where line like '%prompts_public_like_idx%'), (select string_agg(line, ' | ') from _plan));

-- 5) trending_tags: ziyaretçi ve oturumlu çağırabilir; yalnız herkese açık içeriği sayar (carol'ın özel promptunun etiketi görünmez).
select public._as_user('');
set role anon;
select count(*) filter (where slug = 'perf-ortak') as ortak, count(*) filter (where slug = 'perf-gizli') as gizli, max(recent_count) filter (where slug = 'perf-ortak') as sayi from public.trending_tags(50, 7) \gset t_anon_
reset role;
select public._as_user(:carol);
set role authenticated;
select count(*) filter (where slug = 'perf-ortak') as ortak, count(*) filter (where slug = 'perf-gizli') as gizli, max(recent_count) filter (where slug = 'perf-ortak') as sayi from public.trending_tags(50, 7) \gset t_carol_
reset role;
select public._check(8, 'trending_tags: ziyaretçi herkese açık etiketi 3 prompt olarak görür, özel promptun etiketini görmez',
  :t_anon_ortak = 1 and :t_anon_gizli = 0 and :t_anon_sayi = 3, :t_anon_ortak || '/' || :t_anon_gizli || '/' || :t_anon_sayi);
select public._check(9, 'trending_tags: sahibi bile kendi özel promptunun etiketini trend saymaz (herkese açık sayım)',
  :t_carol_ortak = 1 and :t_carol_gizli = 0 and :t_carol_sayi = 3, :t_carol_ortak || '/' || :t_carol_gizli || '/' || :t_carol_sayi);
select public._check(10, 'trending_tags: p_limit aralığa sıkıştırılır (0 → 1, 1000 → ≤50)',
  (select count(*) from public.trending_tags(0, 7)) <= 1 and (select count(*) from public.trending_tags(1000, 7)) <= 50);

-- 6) related_prompts: ortak etiketli promptlar birbirini önerir; engelleyen bob'un promptunu önermez; özel prompt hiç önerilmez.
select public._as_user(:carol);
set role authenticated;
select count(*) filter (where id = 'a0000000-0000-4000-8000-0000000000a1') as a1, count(*) filter (where id = 'a0000000-0000-4000-8000-0000000000b1') as b1,
       count(*) filter (where id = 'a0000000-0000-4000-8000-0000000000c2') as gizli from public.related_prompts('a0000000-0000-4000-8000-0000000000c1', 12) \gset r_carol_
reset role;
select public._as_user(:alice);
set role authenticated;
select count(*) filter (where id = 'a0000000-0000-4000-8000-0000000000b1') as b1, count(*) filter (where id = 'a0000000-0000-4000-8000-0000000000c1') as c1
  from public.related_prompts('a0000000-0000-4000-8000-0000000000a1', 12) \gset r_alice_
reset role;
select public._check(11, 'related_prompts: carol için a1 ve b1 önerilir, özel c2 asla', :r_carol_a1 = 1 and :r_carol_b1 = 1 and :r_carol_gizli = 0, :r_carol_a1 || '/' || :r_carol_b1 || '/' || :r_carol_gizli);
select public._check(12, 'related_prompts: alice (bob''u engelledi) için b1 önerilmez, c1 önerilir', :r_alice_b1 = 0 and :r_alice_c1 = 1, :r_alice_b1 || '/' || :r_alice_c1);

-- 7) Yeni fonksiyonun yetkileri: anon + authenticated çağırabilir, public değil.
select public._check(13, 'blocked_user_ids: anon ve authenticated EXECUTE yetkili',
  has_function_privilege('anon', 'public.blocked_user_ids()', 'execute') and has_function_privilege('authenticated', 'public.blocked_user_ids()', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
