-- Yaratıcı paneli (creator_insights_* RPC'leri; docs/history/293-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/creator-insights.sql  ("FAILED=0" beklenir).
-- me = yaratıcı; u1/u2/u3 = diğer kullanıcılar. Dönem 30 gün, önceki dönem hemen öncesi 30 gün.
-- Beklenen (dönem / önceki): kopyalama 4/1, tepki 3/1, yorum 2/1, kaydetme 2/1, takipçi 1/1.
-- Sayılmayanlar: yazarın kendi kopyası/yorumu, özel promptun kopyası, başkasının promptu, silinmiş yorum, 60 günden eski olay.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set u1 '''22222222-2222-4222-8222-222222222222'''
\set u2 '''33333333-3333-4333-8333-333333333333'''
\set u3 '''44444444-4444-4444-8444-444444444444'''

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

-- Veri (oturumsuz = kısıtlı tetikleyiciler kapalı)
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at, tools) values
  ('d1000000-0000-4000-8000-000000000001', :me, 'P1 görsel', 'd', 'm', 'image', 'published', 'public',  now() - interval '90 days', '{midjourney}'),
  ('d1000000-0000-4000-8000-000000000002', :me, 'P2 metin',  'd', 'm', 'text',  'published', 'public',  now() - interval '80 days', '{}'),
  ('d1000000-0000-4000-8000-000000000003', :me, 'P3 taslak', 'd', 'm', 'text',  'draft',     'public',  now() - interval '80 days', '{}'),
  ('d1000000-0000-4000-8000-000000000004', :me, 'P4 özel',   'd', 'm', 'text',  'published', 'private', now() - interval '80 days', '{}'),
  ('d1000000-0000-4000-8000-000000000005', :u1, 'P5 başkası','d', 'm', 'text',  'published', 'public',  now() - interval '80 days', '{}');

-- Kopyalama (yazar kendi kopyası, özel prompt, başkasının promptu ve 100 gün öncesi sayılmaz)
insert into public.prompt_copy_events (prompt_id, user_id, day) values
  ('d1000000-0000-4000-8000-000000000001', :u1, (now() at time zone 'utc')::date),
  ('d1000000-0000-4000-8000-000000000001', :u2, (now() at time zone 'utc')::date),
  ('d1000000-0000-4000-8000-000000000001', :u1, (now() at time zone 'utc')::date - 1),
  ('d1000000-0000-4000-8000-000000000002', :u3, (now() at time zone 'utc')::date - 5),
  ('d1000000-0000-4000-8000-000000000001', :u1, (now() at time zone 'utc')::date - 40),
  ('d1000000-0000-4000-8000-000000000001', :u2, (now() at time zone 'utc')::date - 100),
  ('d1000000-0000-4000-8000-000000000001', :me, (now() at time zone 'utc')::date),
  ('d1000000-0000-4000-8000-000000000004', :u1, (now() at time zone 'utc')::date),
  ('d1000000-0000-4000-8000-000000000005', :u2, (now() at time zone 'utc')::date);

-- Tepkiler
insert into public.prompt_likes (user_id, prompt_id, reaction, created_at) values
  (:u1, 'd1000000-0000-4000-8000-000000000001', 'fire', now() - interval '1 day'),
  (:u2, 'd1000000-0000-4000-8000-000000000001', 'love', now()),
  (:u3, 'd1000000-0000-4000-8000-000000000002', 'love', now() - interval '3 days'),
  (:u3, 'd1000000-0000-4000-8000-000000000001', 'wow',  now() - interval '40 days');

-- Yorumlar (yazarın kendi yorumu ve silinmiş yorum sayılmaz)
insert into public.prompt_comments (prompt_id, author_id, body, created_at, deleted_at) values
  ('d1000000-0000-4000-8000-000000000001', :u1, 'c1', now(), null),
  ('d1000000-0000-4000-8000-000000000001', :u2, 'c2', now() - interval '2 days', null),
  ('d1000000-0000-4000-8000-000000000001', :me, 'kendi yorumum', now(), null),
  ('d1000000-0000-4000-8000-000000000001', :u3, 'silindi', now(), now()),
  ('d1000000-0000-4000-8000-000000000002', :u3, 'eski', now() - interval '45 days', null);

-- Kaydetmeler (u1 aynı promptu iki koleksiyona koyar → tek sayılır)
insert into public.collections (id, owner_id, name) values
  ('e1000000-0000-4000-8000-000000000001', :u1, 'A'),
  ('e1000000-0000-4000-8000-000000000002', :u1, 'B'),
  ('e1000000-0000-4000-8000-000000000003', :u2, 'C'),
  ('e1000000-0000-4000-8000-000000000004', :u3, 'D');
insert into public.collection_items (collection_id, prompt_id, created_at) values
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000002', now() - interval '1 day'),
  ('e1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', now() - interval '40 days');

-- Takipçiler
insert into public.follows (follower_id, following_id, created_at) values
  (:u1, :me, now() - interval '1 day'),
  (:u2, :me, now() - interval '35 days');

set role authenticated;
select public._as_user(:me);

-- 1. Özet sayıları (dönem / önceki dönem)
select * from public.creator_insights_summary(30) \gset s_
select public._check(1, 'özet: kopyalama 4/1', :s_copies = 4 and :s_prev_copies = 1, :'s_copies' || '/' || :'s_prev_copies');
select public._check(2, 'özet: tepki 3/1 (yazarın kendisi yok)', :s_reactions = 3 and :s_prev_reactions = 1, :'s_reactions' || '/' || :'s_prev_reactions');
select public._check(3, 'özet: yorum 2/1 (kendi + silinmiş sayılmaz)', :s_comments = 2 and :s_prev_comments = 1, :'s_comments' || '/' || :'s_prev_comments');
select public._check(4, 'özet: kaydetme 2/1 (iki koleksiyon tek sayılır)', :s_saves = 2 and :s_prev_saves = 1, :'s_saves' || '/' || :'s_prev_saves');
select public._check(5, 'özet: yeni takipçi 1/1', :s_followers = 1 and :s_prev_followers = 1, :'s_followers' || '/' || :'s_prev_followers');

-- 6. Kısa dönem: 7 günde 3 kopyalama; önceki 7 gün (8–14 gün önce) boş
select * from public.creator_insights_summary(7) \gset w_
select public._check(6, '7 günlük pencere: kopyalama 4, önceki 0', :w_copies = 4 and :w_prev_copies = 0, :'w_copies' || '/' || :'w_prev_copies');

-- 7–9. Günlük seri
select count(*) as n, sum(copies) as c, sum(reactions) as r, sum(comments) as m, min(day) as d0, max(day) as d1 from public.creator_insights_daily(30) \gset d_
select public._check(7, 'günlük: boş günler dahil tam 30 satır', :d_n = 30, :'d_n');
select public._check(8, 'günlük toplamlar özetle aynı', :d_c = 4 and :d_r = 3 and :d_m = 2, :'d_c' || '/' || :'d_r' || '/' || :'d_m');
select public._check(9, 'günlük: son gün bugün (UTC), ilk gün 29 gün önce',
  :'d_d1'::date = (now() at time zone 'utc')::date and :'d_d0'::date = (now() at time zone 'utc')::date - 29, :'d_d0' || '..' || :'d_d1');
select public._check(10, 'günlük: bugün 2 kopyalama (yazar kendi kopyası sayılmaz)',
  (select copies from public.creator_insights_daily(30) where day = (now() at time zone 'utc')::date) = 2);
select public._check(11, 'günlük: üst sınır 90 gün', (select count(*) from public.creator_insights_daily(5000)) = 90);

-- 12–14. En iyi promptlar
select string_agg(title, '|' order by copies desc, reactions desc) as titles, count(*) as n from public.creator_insights_top(30, 5) \gset t_
select public._check(12, 'en iyi: yalnız P1 ve P2 (taslak/özel/başkası yok), P1 önde', :t_n = 2 and :'t_titles' = 'P1 görsel|P2 metin', :'t_titles');
select copies, reactions, prev_copies from public.creator_insights_top(30, 5) where title = 'P1 görsel' \gset p1_
select public._check(13, 'en iyi: P1 3 kopyalama, 2 tepki, önceki dönem 1', :p1_copies = 3 and :p1_reactions = 2 and :p1_prev_copies = 1,
  :'p1_copies' || '/' || :'p1_reactions' || '/' || :'p1_prev_copies');
select public._check(14, 'en iyi: limit uygulanır', (select count(*) from public.creator_insights_top(30, 1)) = 1);

-- 15. Tepki dağılımı
select string_agg(reaction || ':' || n, ',' order by n desc, reaction) as mix from public.creator_insights_reaction_mix(30) \gset m_
select public._check(15, 'tepki dağılımı love:2, fire:1', :'m_mix' = 'love:2,fire:1', :'m_mix');

-- 16. Başka kullanıcı yalnız kendi verisini görür (u1'in yayınlanmış promptu P5'te yalnız 1 kopyalama var)
select public._as_user(:u1);
select public._check(16, 'başka kullanıcı: kendi promptu P5 (1 kopyalama) görünür, me''ninkiler karışmaz',
  (select copies from public.creator_insights_summary(30)) = 1 and (select count(*) from public.creator_insights_top(30, 5)) = 1);
select public._as_user(:u3);
select public._check(17, 'hiç promptu olmayan kullanıcıda her şey sıfır/boş',
  (select copies + reactions + comments + saves + followers from public.creator_insights_summary(30)) = 0
  and (select count(*) from public.creator_insights_top(30, 5)) = 0
  and (select count(*) from public.creator_insights_reaction_mix(30)) = 0);

-- 18. Kimlik yoksa hata; 19. ziyaretçi (anon) çağıramaz; 20. yardımcı pencere fonksiyonu istemciye kapalı
select public._as_user('');
select public._check(18, 'kimliksiz çağrı not_authenticated', public._try('select * from public.creator_insights_summary(30)') ilike '%not_authenticated%');
reset role;
set role anon;
select public._check(19, 'anon dört RPC''yi de çağıramaz',
  public._try('select * from public.creator_insights_summary(30)') ilike '%permission denied%'
  and public._try('select * from public.creator_insights_daily(30)') ilike '%permission denied%'
  and public._try('select * from public.creator_insights_top(30, 5)') ilike '%permission denied%'
  and public._try('select * from public.creator_insights_reaction_mix(30)') ilike '%permission denied%');
reset role;
set role authenticated;
select public._check(20, 'iç pencere yardımcısı istemciye kapalı', public._try('select * from public._creator_insights_window(30)') ilike '%permission denied%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
