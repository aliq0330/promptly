-- Yaratıcı paneli v2 (sonuç sayacı, prompt başına ayrıntı, kilometre taşı bildirimleri; docs/history/295-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/creator-insights-v2.sql  ("FAILED=0" beklenir).
-- me = yaratıcı; u1/u2/u3 = diğer kullanıcılar. Prompt: P1/P2 yayında, P3 taslak, P4 özel, Pc topluluğa özgü, P5 = u1'in promptu.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set u1 '''22222222-2222-4222-8222-222222222222'''
\set u2 '''33333333-3333-4333-8333-333333333333'''
\set u3 '''44444444-4444-4444-8444-444444444444'''
\set p1 '''d2000000-0000-4000-8000-000000000001'''
\set p2 '''d2000000-0000-4000-8000-000000000002'''
\set p3 '''d2000000-0000-4000-8000-000000000003'''
\set p4 '''d2000000-0000-4000-8000-000000000004'''
\set pc '''d2000000-0000-4000-8000-000000000006'''
\set p5 '''d2000000-0000-4000-8000-000000000005'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:u1,'u1'),(:u2,'u2'),(:u3,'u3')) as u(id, name);

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

insert into public.conversations (id, kind) values ('e2000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e2000000-0000-4000-8000-000000000001', 'Topluluk', :me);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at, tools, community_id) values
  (:p1, :me, 'P1 görsel',  'd', 'm', 'image', 'published', 'public',  now() - interval '90 days', '{midjourney}', null),
  (:p2, :me, 'P2 metin',   'd', 'm', 'text',  'published', 'public',  now() - interval '80 days', '{}', null),
  (:p3, :me, 'P3 taslak',  'd', 'm', 'text',  'draft',     'public',  now() - interval '80 days', '{}', null),
  (:p4, :me, 'P4 özel',    'd', 'm', 'text',  'published', 'private', now() - interval '80 days', '{}', null),
  (:p5, :u1, 'P5 başkası', 'd', 'm', 'text',  'published', 'public',  now() - interval '80 days', '{}', null),
  (:pc, :me, 'Pc topluluk','d', 'm', 'text',  'published', 'private', now() - interval '80 days', '{}', 'e2000000-0000-4000-8000-000000000001');

insert into public.prompt_copy_events (prompt_id, user_id, day) values
  (:p1, :u1, (now() at time zone 'utc')::date), (:p1, :u2, (now() at time zone 'utc')::date), (:p1, :u1, (now() at time zone 'utc')::date - 1),
  (:p1, :u1, (now() at time zone 'utc')::date - 40), (:p1, :u2, (now() at time zone 'utc')::date - 100), (:p1, :me, (now() at time zone 'utc')::date),
  (:p2, :u3, (now() at time zone 'utc')::date - 5);
insert into public.prompt_likes (user_id, prompt_id, reaction, created_at) values
  (:u1, :p1, 'fire', now() - interval '1 day'), (:u2, :p1, 'love', now()), (:u3, :p1, 'wow', now() - interval '40 days');
insert into public.prompt_comments (prompt_id, author_id, body, created_at, deleted_at) values
  (:p1, :u1, 'c1', now(), null), (:p1, :u2, 'c2', now() - interval '2 days', null), (:p1, :me, 'kendi', now(), null), (:p1, :u3, 'silindi', now(), now());
insert into public.collections (id, owner_id, name) values
  ('e3000000-0000-4000-8000-000000000001', :u1, 'A'), ('e3000000-0000-4000-8000-000000000002', :u1, 'B'), ('e3000000-0000-4000-8000-000000000003', :u3, 'D');
insert into public.collection_items (collection_id, prompt_id, created_at) values
  ('e3000000-0000-4000-8000-000000000001', :p1, now() - interval '2 days'), ('e3000000-0000-4000-8000-000000000002', :p1, now() - interval '1 day'),
  ('e3000000-0000-4000-8000-000000000003', :p1, now() - interval '40 days');
-- Sonuçlar: P1'e u1 (şimdi), u2 (2 gün önce), yazarın kendisi (sayılmaz), u3 (45 gün önce = önceki dönem); P2'ye u3 (3 gün önce); özel P4'e u1 (sayılmaz); başkasının P5'ine u2 (sayılmaz)
insert into public.prompt_results (prompt_id, creator_id, media_type, text_content, created_at) values
  (:p1, :u1, 'text', 'r1', now()), (:p1, :u2, 'text', 'r2', now() - interval '2 days'), (:p1, :me, 'text', 'kendi', now()),
  (:p1, :u3, 'text', 'r4', now() - interval '45 days'), (:p2, :u3, 'text', 'r5', now() - interval '3 days'),
  (:p4, :u1, 'text', 'r6', now()), (:p5, :u2, 'text', 'r7', now());

set role authenticated;
select public._as_user(:me);

-- 1–2. Genel sonuç sayacı
select * from public.creator_insights_results(30) \gset r_
select public._check(1, 'sonuç sayacı 3/1 (kendi, özel prompt, başkasının promptu sayılmaz)', :r_results = 3 and :r_prev_results = 1, :'r_results' || '/' || :'r_prev_results');
select * from public.creator_insights_results(7) \gset r7_
select public._check(2, '7 günlük pencere: 3 sonuç, önceki 0', :r7_results = 3 and :r7_prev_results = 0, :'r7_results' || '/' || :'r7_prev_results');

-- 3–6. Prompt başına özet (P1)
select * from public.creator_insights_prompt(:p1, 30) \gset a_
select public._check(3, 'prompt özeti: başlık/tür/araç', :'a_title' = 'P1 görsel' and :'a_content_type' = 'image' and :'a_tools' = '{midjourney}', :'a_title' || '|' || :'a_content_type' || '|' || :'a_tools');
select public._check(4, 'prompt özeti: kopyalama 3/1, tepki 2/1', :a_copies = 3 and :a_prev_copies = 1 and :a_reactions = 2 and :a_prev_reactions = 1,
  :'a_copies' || '/' || :'a_prev_copies' || ' ' || :'a_reactions' || '/' || :'a_prev_reactions');
select public._check(5, 'prompt özeti: yorum 2/0, kaydetme 1/1 (iki koleksiyon tek)', :a_comments = 2 and :a_prev_comments = 0 and :a_saves = 1 and :a_prev_saves = 1,
  :'a_comments' || '/' || :'a_prev_comments' || ' ' || :'a_saves' || '/' || :'a_prev_saves');
select public._check(6, 'prompt özeti: sonuç 2/1', :a_results = 2 and :a_prev_results = 1, :'a_results' || '/' || :'a_prev_results');

-- 7–10. Prompt başına günlük seri ve tepki dağılımı
select count(*) as n, sum(copies) as c, sum(reactions) as r, sum(comments) as m, sum(results) as s from public.creator_insights_prompt_daily(:p1, 30) \gset d_
select public._check(7, 'prompt günlük: 30 satır, toplamlar özetle aynı (3/2/2/2)', :d_n = 30 and :d_c = 3 and :d_r = 2 and :d_m = 2 and :d_s = 2,
  :'d_n' || ' ' || :'d_c' || '/' || :'d_r' || '/' || :'d_m' || '/' || :'d_s');
select public._check(8, 'prompt günlük: bugün 2 kopyalama (yazarın kendi kopyası sayılmaz)',
  (select copies from public.creator_insights_prompt_daily(:p1, 30) where day = (now() at time zone 'utc')::date) = 2);
select string_agg(reaction || ':' || n, ',' order by n desc, reaction) as mix from public.creator_insights_prompt_reaction_mix(:p1, 30) \gset m_
select public._check(9, 'prompt tepki dağılımı fire:1,love:1', :'m_mix' = 'fire:1,love:1', :'m_mix');
select public._check(10, 'P2 (ikinci prompt) özeti: yalnız kendi sayıları (1 kopyalama, 1 sonuç)',
  (select copies from public.creator_insights_prompt(:p2, 30)) = 1 and (select results from public.creator_insights_prompt(:p2, 30)) = 1);

-- 11–13. Sahiplik: başkasının, taslak, özel, topluluğa özgü, olmayan prompt → not_found (varlık sızmaz)
select public._check(11, 'taslak/özel/topluluğa özgü prompt not_found',
  public._try(format('select * from public.creator_insights_prompt(%L, 30)', 'd2000000-0000-4000-8000-000000000003')) ilike '%not_found%'
  and public._try(format('select * from public.creator_insights_prompt(%L, 30)', 'd2000000-0000-4000-8000-000000000004')) ilike '%not_found%'
  and public._try(format('select * from public.creator_insights_prompt_daily(%L, 30)', 'd2000000-0000-4000-8000-000000000006')) ilike '%not_found%'
  and public._try(format('select * from public.creator_insights_prompt_reaction_mix(%L, 30)', 'd2000000-0000-4000-8000-000000000006')) ilike '%not_found%');
select public._check(12, 'başkasının promptu ve rastgele kimlik not_found',
  public._try(format('select * from public.creator_insights_prompt(%L, 30)', 'd2000000-0000-4000-8000-000000000005')) ilike '%not_found%'
  and public._try('select * from public.creator_insights_prompt(gen_random_uuid(), 30)') ilike '%not_found%');
select public._as_user(:u1);
select public._check(13, 'başka kullanıcı yaratıcının P1 ayrıntısını alamaz (not_found), kendi P5''ini alır',
  public._try(format('select * from public.creator_insights_prompt(%L, 30)', 'd2000000-0000-4000-8000-000000000001')) ilike '%not_found%'
  and (select copies from public.creator_insights_prompt(:p5, 30)) = 0);

-- 14–15. Kimliksiz ve anon
select public._as_user('');
select public._check(14, 'kimliksiz çağrı not_authenticated', public._try(format('select * from public.creator_insights_prompt(%L, 30)', 'd2000000-0000-4000-8000-000000000001')) ilike '%not_authenticated%'
  and public._try('select * from public.creator_insights_results(30)') ilike '%not_authenticated%');
reset role;
set role anon;
select public._check(15, 'anon beş yeni RPC''yi çağıramaz',
  public._try('select * from public.creator_insights_results(30)') ilike '%permission denied%'
  and public._try(format('select * from public.creator_insights_prompt(%L, 30)', 'd2000000-0000-4000-8000-000000000001')) ilike '%permission denied%'
  and public._try(format('select * from public.creator_insights_prompt_daily(%L, 30)', 'd2000000-0000-4000-8000-000000000001')) ilike '%permission denied%'
  and public._try(format('select * from public.creator_insights_prompt_reaction_mix(%L, 30)', 'd2000000-0000-4000-8000-000000000001')) ilike '%permission denied%');
reset role;
set role authenticated;
select public._as_user(:me);
select public._check(16, 'iç yardımcı (sahiplik) istemciye kapalı', public._try(format('select * from public._creator_insights_own_prompt(%L)', 'd2000000-0000-4000-8000-000000000001')) ilike '%permission denied%');
reset role;

-- 17+. Kilometre taşı bildirimleri (tetikleyici; sayaçlar yetkili rolle güncellenir — istemci rolü sayaçları yazamaz)
update public.prompts set copy_count = 9 where id = :p1;
select public._check(17, '9 kopyalama: bildirim yok', (select count(*) from public.notifications where recipient_id = :me and message like '%kopyalamaya%') = 0);
update public.prompts set copy_count = 10 where id = :p1;
select message, target_href, type, actor_id is null as no_actor from public.notifications where recipient_id = :me and message like '%kopyalamaya%' \gset n1_
select public._check(18, '10. kopyalama: tek bildirim, Türkçe cümle, panel bağlantısı, system türü, actor yok',
  :'n1_message' = 'Promptun "P1 görsel" 10 kopyalamaya ulaştı.' and :'n1_target_href' = '/insights/local?id=d2000000-0000-4000-8000-000000000001'
  and :'n1_type' = 'system' and :'n1_no_actor' = 't', :'n1_message' || ' | ' || :'n1_target_href');
update public.prompts set copy_count = 11 where id = :p1;
update public.prompts set copy_count = 10 where id = :p1;
select public._check(19, 'eşiğin üstünde artış ve düşüş yeni bildirim yazmaz', (select count(*) from public.notifications where recipient_id = :me and message like '%kopyalamaya%') = 1);
update public.prompts set copy_count = 60 where id = :p1;
select public._check(20, '10→60: yalnız 50 eşiği bildirilir', exists (select 1 from public.notifications where recipient_id = :me and message = 'Promptun "P1 görsel" 50 kopyalamaya ulaştı.')
  and (select count(*) from public.notifications where recipient_id = :me and message like '%kopyalamaya%') = 2);
update public.prompts set copy_count = 20000 where id = :p1;
select public._check(21, 'birden çok eşik tek hamlede geçilirse yalnız en yükseği (10000) bildirilir',
  exists (select 1 from public.notifications where recipient_id = :me and message = 'Promptun "P1 görsel" 10000 kopyalamaya ulaştı.')
  and (select count(*) from public.notifications where recipient_id = :me and message like '%kopyalamaya%') = 3);
update public.prompts set copy_count = 9 where id = :p1;
update public.prompts set copy_count = 10 where id = :p1;
select public._check(22, 'sayaç düşüp eşiği yeniden geçse de aynı eşik ikinci kez bildirilmez (dedupe_key)', (select count(*) from public.notifications where recipient_id = :me and message like '%kopyalamaya%') = 3);
update public.prompts set like_count = 12 where id = :p1;
select public._check(23, '12 tepki: "10 tepkiye ulaştı" bildirimi',
  (select count(*) from public.notifications where recipient_id = :me and message = 'Promptun "P1 görsel" 10 tepkiye ulaştı.') = 1);
update public.prompts set copy_count = 100, like_count = 100 where id in (:p3, :p4, :pc);
select public._check(24, 'taslak / özel / topluluğa özgü prompt bildirim üretmez', (select count(*) from public.notifications where recipient_id = :me and message like '%ulaştı.' and (message like '%P3 taslak%' or message like '%P4 özel%' or message like '%Pc topluluk%')) = 0);
update public.prompts set copy_count = 10 where id = :p5;
select public._check(25, 'bildirim promptun YAZARINA gider (P5 → u1), başkasına değil',
  (select count(*) from public.notifications where recipient_id = :u1 and message = 'Promptun "P5 başkası" 10 kopyalamaya ulaştı.') = 1
  and (select count(*) from public.notifications where recipient_id <> :u1 and message like '%P5 başkası%') = 0);
select public._check(26, 'tetikleyici fonksiyonu istemciye kapalı',
  not has_function_privilege('authenticated', 'public._notify_creator_milestones()', 'execute') and not has_function_privilege('anon', 'public._notify_creator_milestones()', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
