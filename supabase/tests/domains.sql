-- Ortak ALAN sözlüğü (docs/history/426-*): domains, taxonomy_category_domains, interest_domain, for_you_page ilgi eşlemesi, topluluk ilgi terimleri.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/domains.sql  ("FAILED=0" beklenir).
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false); end $$;
create or replace function pg_temp.try(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bob   '''22222222-2222-4222-8222-222222222222'''

-- 1) sözlük + Skill alt kümesi
select pg_temp.check(1, '14 alan tohumlandı', (select count(*) from public.domains) = 14);
select pg_temp.check(1, 'Skill uzmanlık alanlarının hepsi ortak sözlükte', not exists (select 1 from public.skill_categories c where not exists (select 1 from public.domains d where d.id = c.id)));
select pg_temp.check(1, 'alanı olmayan Skill uzmanlık alanı eklenemez (FK)', pg_temp.try($q$insert into public.skill_categories (id, label_tr, label_en, position) values ('zzz', 'a', 'b', 999)$q$) = '23503');
select pg_temp.check(1, 'alan kimliği biçimi CHECK ile korunur', pg_temp.try($q$insert into public.domains (id, label_tr, label_en) values ('Bad Id', 'a', 'b')$q$) = '23514');

-- 2) eski Türkçe değerler alana çözülür
select pg_temp.check(2, 'eski değerler alana çözülür',
  (select array_agg(public.interest_domain(v) order by v) from unnest(array['Dijital Sanat','Fotoğrafçılık','Grafik Tasarım','Yazılım ve Kodlama','Hikaye ve Yaratıcı Yazarlık','Video Üretimi','Müzik ve Ses','3D Tasarım','Oyun Geliştirme']) v)
  = (select array_agg(e order by v) from (values ('Dijital Sanat','art'),('Fotoğrafçılık','photography'),('Grafik Tasarım','design'),('Yazılım ve Kodlama','software'),('Hikaye ve Yaratıcı Yazarlık','writing'),('Video Üretimi','video'),('Müzik ve Ses','music-audio'),('3D Tasarım','game-3d'),('Oyun Geliştirme','game-3d')) m(v, e)));
select pg_temp.check(2, 'alan kimliği olduğu gibi döner, bilinmeyen null', public.interest_domain('software') = 'software' and public.interest_domain(' data ') = 'data' and public.interest_domain('bravo') is null and public.interest_domain(null) is null);

-- 3) profil geri doldurma ifadesi (migration'daki UPDATE ile aynı)
update public.profiles set interests = array['Dijital Sanat','Grafik Tasarım','Dijital Sanat','bilinmeyen','photography'] where id = :alice;
update public.profiles p
   set interests = coalesce((
     select array_agg(d order by first_pos)
       from (
         select public.interest_domain(i) as d, min(ord) as first_pos
           from unnest(p.interests) with ordinality as u(i, ord)
          group by public.interest_domain(i)
       ) x
      where d is not null
   ), '{}'::text[])
 where exists (select 1 from unnest(p.interests) i where i is distinct from public.interest_domain(i));
select pg_temp.check(3, 'eski değerler çevrilir, yinelenen birleşir, tanınmayan düşer, sıra korunur', (select interests from public.profiles where id = :alice) = array['art','design','photography']);
update public.profiles set interests = array['Müzik ve Ses'] where id = :bob;
update public.profiles p
   set interests = coalesce((select array_agg(d order by first_pos) from (select public.interest_domain(i) as d, min(ord) as first_pos from unnest(p.interests) with ordinality as u(i, ord) group by public.interest_domain(i)) x where d is not null), '{}'::text[])
 where exists (select 1 from unnest(p.interests) i where i is distinct from public.interest_domain(i));
select pg_temp.check(3, 'ikinci çalıştırma değişmez (idempotent)', (select interests from public.profiles where id = :bob) = array['music-audio']);

-- 4) her taksonomi kategorisi en az bir alana bağlıdır (ya da türün tamamı '*' ile)
select pg_temp.check(4, 'her aktif taksonomi kategorisi bir alana eşlidir',
  not exists (
    select 1 from public.taxonomy_categories c
     where c.is_active
       and not exists (select 1 from public.taxonomy_category_domains m where m.content_type = c.content_type and (m.category = c.slug or m.category = '*'))
  ),
  coalesce((select string_agg(c.content_type || '/' || c.slug, ', ') from public.taxonomy_categories c where c.is_active
     and not exists (select 1 from public.taxonomy_category_domains m where m.content_type = c.content_type and (m.category = c.slug or m.category = '*'))), ''));
select pg_temp.check(4, 'eşleme satırları gerçek kategoriyi gösterir', not exists (
  select 1 from public.taxonomy_category_domains m
   where m.category <> '*' and not exists (select 1 from public.taxonomy_categories c where c.content_type = m.content_type and c.slug = m.category)));

-- 5) Sana özel: ilgi alanı (alan) → prompt kategorisi ve Skill uzmanlık alanı
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, status, visibility, created_at) values
  ('d0000000-0000-4000-8000-000000000001', :bob, 'Fotoğraf promptu', 'd', 'm', 'image', 'photography', 'published', 'public', now() - interval '2 hours'),
  ('d0000000-0000-4000-8000-000000000002', :bob, 'Kod promptu', 'd', 'm', 'text', 'coding', 'published', 'public', now() - interval '2 hours'),
  ('d0000000-0000-4000-8000-000000000003', :bob, 'Kategorisiz ses', 'd', 'm', 'audio', null, 'published', 'public', now() - interval '2 hours');
insert into public.skills (id, author_id, slug, title, summary, instructions, category, compat, license, status, visibility, created_at) values
  ('5d000000-0000-4000-8000-000000000001', :bob, 'dom-a', 'Yazılım skill', 's', '# Rol', 'software', '{claude-code}', 'mit', 'published', 'public', now() - interval '3 hours'),
  ('5d000000-0000-4000-8000-000000000002', :bob, 'dom-b', 'Veri skill', 's', '# Rol', 'data', '{claude-code}', 'mit', 'published', 'public', now() - interval '3 hours');
update public.profiles set interests = array['photography', 'software', 'music-audio'] where id = :alice;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
create temp table pg_temp.page as select * from public.for_you_page(now(), null, null, null, null, 50, null, null, null);
grant all on pg_temp.page to public;
select pg_temp.check(5, 'fotoğraf alanı → görsel photography promptu: interest/photography', (select reason_kind || '/' || reason_ref from pg_temp.page where id = 'd0000000-0000-4000-8000-000000000001') = 'interest/photography');
select pg_temp.check(5, 'yazılım alanı → metin coding promptu: interest/software', (select reason_kind || '/' || reason_ref from pg_temp.page where id = 'd0000000-0000-4000-8000-000000000002') = 'interest/software');
select pg_temp.check(5, 'müzik ve ses alanı türün tamamı: kategorisiz ses de eşleşir', (select reason_kind || '/' || reason_ref from pg_temp.page where id = 'd0000000-0000-4000-8000-000000000003') = 'interest/music-audio');
select pg_temp.check(5, 'aynı alandaki Skill ilgi sinyali alır', (select reason_kind || '/' || reason_ref from pg_temp.page where id = '5d000000-0000-4000-8000-000000000001') = 'interest/software');
select pg_temp.check(5, 'başka alandaki Skill sinyal almaz (popüler)', (select reason_kind from pg_temp.page where id = '5d000000-0000-4000-8000-000000000002') = 'popular');
reset role;

-- eski Türkçe değer yazılsa bile (eski istemci) aynı sonuç
update public.profiles set interests = array['Fotoğrafçılık'] where id = :alice;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111'); set role authenticated;
select pg_temp.check(6, 'eski istemcinin Türkçe değeri de alana çözülür', (select reason_kind || '/' || reason_ref from public.for_you_page(now(), null, null, null, null, 50, null, null, null) where id = 'd0000000-0000-4000-8000-000000000001') = 'interest/photography');
reset role;

-- 6) topluluk ilgi terimleri alan etiketlerinin kelimelerinden gelir; yalnız 4+ harf
select pg_temp.check(7, 'terimler alan etiketlerinin (TR+EN) kelimeleridir',
  (select array_agg(term order by term) from public._interest_terms(:alice)) @> array['fotoğrafçılık','photography']
  and not exists (select 1 from public._interest_terms(:alice) where char_length(term) < 4));
select pg_temp.check(7, 'ilgi alanı yoksa terim yok', (select count(*) from public._interest_terms(:bob)) > 0 and (select count(*) from public._interest_terms('99999999-9999-4999-8999-999999999999')) = 0);

-- 7) herkese açık okuma, istemci yazamaz
set role anon; select pg_temp.as_user('');
select pg_temp.check(8, 'ziyaretçi alanları okur', (select count(*) from public.domains) = 14);
select pg_temp.check(8, 'ziyaretçi alan ekleyemez', pg_temp.try($q$insert into public.domains (id, label_tr, label_en) values ('zzz', 'a', 'b')$q$) = '42501');
reset role;
select pg_temp.check(8, 'istemci rolleri alan tablosuna yazamaz', not has_table_privilege('authenticated', 'public.domains', 'insert') and not has_table_privilege('anon', 'public.taxonomy_category_domains', 'insert') and not has_table_privilege('authenticated', 'public.domains', 'update'));
select pg_temp.check(8, '_interest_terms istemciye kapalı', not has_function_privilege('authenticated', 'public._interest_terms(uuid)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
