-- "Sana özel" (for_you_page; docs/history/209-*, yeniden kuruldu 222-*) + medya görünümü moderatör RPC'leri: DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/for-you.sql  ("FAILED=0" beklenir).
-- alice = izleyen; bobby (takip edilen kişi: gönderileri Sana özel'e GİRMEZ), carol, dave, erin = yazarlar; hank = moderatör.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:hank,'hank')) as u(id, name);
update public.profiles set role = 'moderator' where id = :hank;
update public.profiles set interests = array['Fotoğrafçılık'] where id = :alice;

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

-- İçerik: hepsi son bir gün içinde (yaş puanı küçük), beğeni yok (popülerlik 0) — sıra yalnız sinyallerden gelir.
insert into public.tags (slug, label) values ('resim', 'Resim'), ('kedi', 'Kedi');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, status, visibility, created_at) values
  ('f0000000-0000-4000-8000-000000000001', :bobby, 'Takip edilen yazar', 'd', 'm', 'text', null, 'published', 'public', now() - interval '3 hours'),
  ('f0000000-0000-4000-8000-000000000002', :carol, 'Takip edilen etiket', 'd', 'm', 'text', null, 'published', 'public', now() - interval '4 hours'),
  ('f0000000-0000-4000-8000-000000000003', :dave,  'İlgi alanı', 'd', 'm', 'image', 'photography', 'published', 'public', now() - interval '5 hours'),
  ('f0000000-0000-4000-8000-000000000004', :carol, 'Beğenilen etiket', 'd', 'm', 'text', null, 'published', 'public', now() - interval '6 hours'),
  ('f0000000-0000-4000-8000-000000000005', :dave,  'Zaten beğenildi', 'd', 'm', 'text', null, 'published', 'public', now() - interval '7 hours'),
  ('f0000000-0000-4000-8000-000000000006', :dave,  'Sinyalsiz', 'd', 'm', 'text', null, 'published', 'public', now() - interval '8 hours'),
  ('f0000000-0000-4000-8000-000000000007', :alice, 'Kendi içeriği', 'd', 'm', 'text', null, 'published', 'public', now() - interval '9 hours'),
  ('f0000000-0000-4000-8000-000000000008', :bobby, 'Gizli', 'd', 'm', 'text', null, 'published', 'private', now() - interval '10 hours'),
  ('f0000000-0000-4000-8000-000000000009', :bobby, 'Taslak', 'd', 'm', 'text', null, 'draft', 'public', now() - interval '11 hours'),
  ('f0000000-0000-4000-8000-000000000010', :dave,  'Kaydedildi', 'd', 'm', 'text', null, 'published', 'public', now() - interval '2 hours'),
  ('f0000000-0000-4000-8000-000000000011', :dave,  'Kopyalandı', 'd', 'm', 'text', null, 'published', 'public', now() - interval '2 hours'),
  ('f0000000-0000-4000-8000-000000000012', :dave,  'Eski ama çok beğenilen', 'd', 'm', 'text', null, 'published', 'public', now() - interval '30 days'),
  ('f0000000-0000-4000-8000-000000000013', :dave,  'Çok eski sinyalsiz', 'd', 'm', 'text', null, 'published', 'public', now() - interval '60 days'),
  ('f0000000-0000-4000-8000-0000000000e1', :erin,  'Erin bir', 'd', 'm', 'text', null, 'published', 'public', now() - interval '1 hour'),
  ('f0000000-0000-4000-8000-0000000000e2', :erin,  'Erin iki', 'd', 'm', 'text', null, 'published', 'public', now() - interval '1 hour'),
  ('f0000000-0000-4000-8000-0000000000e3', :erin,  'Erin üç', 'd', 'm', 'text', null, 'published', 'public', now() - interval '1 hour');
update public.prompts set like_count = 100 where id = 'f0000000-0000-4000-8000-000000000012';
insert into public.workflows (id, creator_id, title, status, visibility, created_at) values
  ('f1000000-0000-4000-8000-000000000002', :carol, 'Carol workflow''u', 'published', 'public', now() - interval '2 hours');
insert into public.workflows (id, creator_id, title, status, visibility, created_at) values
  ('f1000000-0000-4000-8000-000000000001', :bobby, 'Takip edilen yazarın workflow''u', 'published', 'public', now() - interval '2 hours');
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('f0000000-0000-4000-8000-000000000002', 'resim'),
  ('f0000000-0000-4000-8000-000000000004', 'kedi'),
  ('f0000000-0000-4000-8000-000000000005', 'kedi');
insert into public.follows (follower_id, following_id) values (:alice, :bobby);
insert into public.collections (id, owner_id, name, is_default) values ('f3000000-0000-4000-8000-000000000001', :alice, 'Koleksiyon', false);
insert into public.collection_items (collection_id, prompt_id) values ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000010');
insert into public.prompt_copy_events (prompt_id, user_id, day) values ('f0000000-0000-4000-8000-000000000011', :alice, current_date);
insert into public.tag_follows (user_id, tag_slug) values (:alice, 'resim');
insert into public.prompt_likes (prompt_id, user_id) values ('f0000000-0000-4000-8000-000000000005', :alice);
insert into public.prompt_media (id, prompt_id, url, width, height, position) values
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 'https://x.supabase.co/storage/v1/object/public/prompt-media/a.jpg', 800, 600, 0);

create table public._page (pos int, kind text, id uuid, sort_rank bigint, reason_kind text, reason_ref text, created_at timestamptz);
grant all on public._page to public;

-- 1. Misafir çağıramaz
set role anon;
select public._as_user('');
select public._check(1, 'anon for_you_page çağıramaz',
  public._try($q$select * from public.for_you_page(now(), null, null, null, null, 20, null, null, null)$q$) ilike '%permission denied%');
reset role;

-- 2–5. alice'in akışı
set role authenticated;
select public._as_user(:alice);
insert into public._page
select row_number() over (), f.kind, f.id, f.sort_rank, f.reason_kind, f.reason_ref, f.created_at
  from public.for_you_page(now(), null, null, null, null, 20, null, null, null) f;
reset role;

-- Kendi, beğenilen, kaydedilen, kopyalanan, gizli ve taslak içerik GİRMEZ; takip edilen kişinin (bobby) herkese açık gönderileri GİRER.
select public._check(2, 'kendi/beğenilen/kaydedilen/kopyalanan/gizli/taslak girmez; takip edilen kişinin açık prompt''u ve workflow''u girer',
  (select count(*) from public._page where id in ('f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001')) = 2
  and not exists (select 1 from public._page where id in (
    'f0000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000007', -- beğenilen, kendi
    'f0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000011', -- kaydedilen, kopyalanan
    'f0000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000009')), -- gizli, taslak
  (select string_agg(id::text, ',') from public._page));
select public._check(3, 'nedenler: takip edilen kişi → creator, etiket → tag/resim, ilgi alanı → interest/Fotoğrafçılık, beğenilen etiket → liked_tag/kedi, sinyalsiz → popular',
  (select reason_kind from public._page where id = 'f0000000-0000-4000-8000-000000000001') = 'creator'
  and (select reason_ref from public._page where id = 'f0000000-0000-4000-8000-000000000001') is null
  and (select reason_kind || '/' || reason_ref from public._page where id = 'f0000000-0000-4000-8000-000000000002') = 'tag/resim'
  and (select reason_kind || '/' || reason_ref from public._page where id = 'f0000000-0000-4000-8000-000000000003') = 'interest/Fotoğrafçılık'
  and (select reason_kind || '/' || reason_ref from public._page where id = 'f0000000-0000-4000-8000-000000000004') = 'liked_tag/kedi'
  and (select reason_kind from public._page where id = 'f0000000-0000-4000-8000-000000000006') = 'popular',
  (select string_agg(id::text || '=' || reason_kind || '/' || coalesce(reason_ref, '-'), ' ') from public._page));
select public._check(4, 'sıra: takip edilen kişi > etiket > ilgi alanı > beğenilen etiket > sinyalsiz (aynı yaş bandında)',
  (select min(pos) from public._page where id in ('f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001')) < (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000002') -- takip edilen kişinin en iyi gönderisi (2.si çeşitlilik cezası alır)
  and (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000002') < (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000003')
  and (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000003') < (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000004')
  and (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000004') < (select pos from public._page where id = 'f0000000-0000-4000-8000-000000000006'),
  (select string_agg(reason_kind || ':' || sort_rank, ',' order by pos) from public._page));
select public._check(14, 'tazelik: 1 saatlik sinyalsiz içerik, 60 günlük sinyalsiz içeriğin çok önünde',
  (select sort_rank from public._page where id = 'f0000000-0000-4000-8000-0000000000e1') > (select sort_rank from public._page where id = 'f0000000-0000-4000-8000-000000000013') + 200,
  (select sort_rank::text from public._page where id = 'f0000000-0000-4000-8000-0000000000e1') || ' vs ' || (select sort_rank::text from public._page where id = 'f0000000-0000-4000-8000-000000000013'));
select public._check(15, 'kalite sınırlı: 30 günlük 100 beğenili içerik, 1 saatlik sinyalsiz içeriğin ÖNÜNE geçmez',
  (select sort_rank from public._page where id = 'f0000000-0000-4000-8000-0000000000e1') > (select sort_rank from public._page where id = 'f0000000-0000-4000-8000-000000000012'),
  (select sort_rank::text from public._page where id = 'f0000000-0000-4000-8000-0000000000e1') || ' vs ' || (select sort_rank::text from public._page where id = 'f0000000-0000-4000-8000-000000000012'));
select public._check(16, 'kalite yine de sayılır: 30 günlük 100 beğenili içerik 60 günlük beğenisiz içeriğin önünde',
  (select sort_rank from public._page where id = 'f0000000-0000-4000-8000-000000000012') > (select sort_rank from public._page where id = 'f0000000-0000-4000-8000-000000000013'));
select public._check(17, 'çeşitlilik: aynı yazarın (erin) 2. ve 3. gönderisi sırayla −120, −240',
  (select max(sort_rank) - min(sort_rank) from public._page where id in ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000e3')) = 240
  and (select count(distinct sort_rank) from public._page where id in ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000e3')) = 3,
  (select string_agg(sort_rank::text, ',' order by sort_rank desc) from public._page where id in ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000e3')));

-- 5. keyset: 4 + devamı = aynı 6 satır, tekrar yok
set role authenticated;
select public._as_user(:alice);
create temp table _p1 as select * from public.for_you_page(now() - interval '1 second', null, null, null, null, 4, null, null, null);
create temp table _p2 as
  select f.* from public.for_you_page(now() - interval '1 second', null, null, null, null, 4,
    (select sort_rank from _p1 order by sort_rank asc, created_at asc, id asc limit 1),
    (select created_at from _p1 order by sort_rank asc, created_at asc, id asc limit 1),
    (select id from _p1 order by sort_rank asc, created_at asc, id asc limit 1)) f;
select public._check(5, 'keyset: ilk sayfa 4 + ikinci sayfa (kalanı), kesişim yok, toplam akışla aynı',
  (select count(*) from _p1) = 4 and (select count(*) from _p2) = 4
  and not exists (select 1 from _p1 join _p2 using (kind, id)),
  (select count(*) from _p1)::text || '+' || (select count(*) from _p2)::text);

-- 6. p_as_of'tan sonra yayımlanan içerik o oturumda araya girmez
select public._check(6, 'p_as_of sonrası içerik girmez (5,5 saat önceki an için yalnız 6 saatlik ve daha eski içerik)',
  (select count(*) from public.for_you_page(now() - interval '330 minutes', null, null, null, null, 50, null, null, null)) > 0
  and not exists (select 1 from public.for_you_page(now() - interval '330 minutes', null, null, null, null, 50, null, null, null)
                   where id in ('f0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-0000000000e1', 'f1000000-0000-4000-8000-000000000002')));

-- 7. tür süzgeci
select public._check(7, 'p_kinds = workflow yalnız workflow döner; takip edilen yazarın workflow''u (creator) carol''unkinin önünde',
  (select count(*) from public.for_you_page(now(), array['workflow'], null, null, null, 20, null, null, null)) = 2
  and (select id from public.for_you_page(now(), array['workflow'], null, null, null, 20, null, null, null) order by sort_rank desc limit 1) = 'f1000000-0000-4000-8000-000000000001'
  and (select reason_kind from public.for_you_page(now(), array['workflow'], null, null, null, 20, null, null, null) where id = 'f1000000-0000-4000-8000-000000000001') = 'creator');
reset role;

-- 8–11. medya görünümü moderatör RPC'leri
set role authenticated;
select public._as_user(:alice);
select public._check(8, 'moderatör olmayan görünüm yazamaz',
  public._try($q$select public.admin_set_media_appearance('f2000000-0000-4000-8000-000000000001', '#a1b2c3', null)$q$) ilike '%Yetkisiz%');
select public._as_user(:hank);
select public._check(9, 'moderatör eksik listesini görür',
  (select count(*) from public.admin_media_missing_appearance(50, '{}')) = 1
  and (select missing from public.admin_media_appearance_stats()) = 1);
select public._check(10, 'moderatör geçerli renk + önizleme yazar',
  public.admin_set_media_appearance('f2000000-0000-4000-8000-000000000001', '#a1b2c3', 'data:image/jpeg;base64,AAAA'));
select public._check(11, 'geçersiz renk ve dışarıdan görsel adresi reddedilir',
  public._try($q$select public.admin_set_media_appearance('f2000000-0000-4000-8000-000000000001', 'red', null)$q$) ilike '%dominant_color%'
  and public._try($q$select public.admin_set_media_appearance('f2000000-0000-4000-8000-000000000001', '#a1b2c3', 'https://evil.example/x.png')$q$) ilike '%placeholder%');
select public._check(12, 'doldurulan satır listeden düşer',
  (select count(*) from public.admin_media_missing_appearance(50, '{}')) = 0);
reset role;
select public._check(13, 'yazılan değer satırda',
  (select dominant_color from public.prompt_media where id = 'f2000000-0000-4000-8000-000000000001') = '#a1b2c3');

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
