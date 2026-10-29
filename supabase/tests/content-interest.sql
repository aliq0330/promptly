-- "İlgimi çekiyor / çekmiyor" açık geri bildirimi (content_interest + set_content_interest + for_you_page; docs/history/275-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/content-interest.sql  ("FAILED=0" beklenir).
-- alice = izleyen; bobby, carol, dave, erin, gina = yazarlar (adaylar bilinçli olarak ayrı yazarlardadır: aynı yazarın 2. gönderisi çeşitlilik cezası alır).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina')) as u(id, name);

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

-- Adaylar: hepsi AYNI saatte (yaş puanı eşit), beğeni yok — sıra farkı yalnız geri bildirimden gelir.
insert into public.tags (slug, label) values ('kedi', 'Kedi'), ('resim', 'Resim') on conflict (slug) do nothing;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at) values
  ('a1000000-0000-4000-8000-000000000001', :bobby, 'Cevaplanacak (çekmiyor)', 'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000002', :erin,  'Kedi etiketli kardeş',     'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000003', :dave,  'Etiketsiz kontrol',        'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000004', :bobby, 'Cevaplanacak (çekiyor)',   'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000005', :gina,  'Resim etiketli kardeş',    'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000006', :carol, 'Carol bir',  'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000007', :carol, 'Carol iki',  'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000008', :carol, 'Carol üç',   'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000009', :alice, 'Alice''in kendi içeriği', 'd', 'm', 'text', 'published', 'public', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000010', :bobby, 'Gizli',  'd', 'm', 'text', 'published', 'private', now() - interval '3 hours'),
  ('a1000000-0000-4000-8000-000000000011', :bobby, 'Taslak', 'd', 'm', 'text', 'draft', 'public', now() - interval '3 hours');
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('a1000000-0000-4000-8000-000000000001', 'kedi'),
  ('a1000000-0000-4000-8000-000000000002', 'kedi'),
  ('a1000000-0000-4000-8000-000000000004', 'resim'),
  ('a1000000-0000-4000-8000-000000000005', 'resim');
insert into public.prompt_requests (id, author_id, title, description, is_draft, visibility, created_at) values
  ('a2000000-0000-4000-8000-000000000001', :bobby, 'İstek', 'd', false, 'public', now() - interval '3 hours');
insert into public.workflows (id, creator_id, title, status, visibility, created_at) values
  ('a3000000-0000-4000-8000-000000000001', :bobby, 'Workflow', 'published', 'public', now() - interval '3 hours');
insert into public.presets (id, creator_id, title, status, visibility, created_at) values
  ('a4000000-0000-4000-8000-000000000001', :bobby, 'Hazır ayar', 'published', 'public', now() - interval '3 hours');

create table public._page (pass int, kind text, id uuid, sort_rank bigint, reason_kind text, reason_ref text);
grant all on public._page to public;
create or replace function public._snap(p int) returns void language plpgsql as $$
begin
  insert into public._page select p, f.kind, f.id, f.sort_rank, f.reason_kind, f.reason_ref
    from public.for_you_page(now(), null, null, null, null, 50, null, null, null) f;
end $$;
grant execute on function public._snap(int) to public;
create or replace function public._rank(p int, i uuid) returns bigint language sql as
  $$ select sort_rank from public._page where pass = p and id = i $$;
grant execute on function public._rank(int, uuid) to public;

-- 1. Misafir yazamaz/okuyamaz
set role anon;
select public._as_user('');
select public._check(1, 'anon set_content_interest çağıramaz ve tabloyu okuyamaz',
  public._try($q$select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000001', 'interested')$q$) ilike '%permission denied%'
  and public._try($q$select * from public.content_interest$q$) ilike '%permission denied%');
reset role;

-- 2. Cevap öncesi akış (taban çizgisi)
set role authenticated;
select public._as_user(:alice);
select public._snap(0);
select public._check(2, 'taban çizgisi: etiketli kardeş ile etiketsiz kontrol aynı puanı alır',
  public._rank(0, 'a1000000-0000-4000-8000-000000000002') = public._rank(0, 'a1000000-0000-4000-8000-000000000003')
  and public._rank(0, 'a1000000-0000-4000-8000-000000000001') is not null);

-- 3. Kayıt kuralları (RPC)
select public._check(3, 'geçersiz tür/değer ve olmayan/başkasına ait olmayan içerik reddedilir',
  public._try($q$select public.set_content_interest('space', 'a1000000-0000-4000-8000-000000000001', 'interested')$q$) ilike '%invalid_interest%'
  and public._try($q$select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000001', 'maybe')$q$) ilike '%invalid_interest%'
  and public._try($q$select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000009', 'interested')$q$) ilike '%content_not_found%'
  and public._try($q$select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000010', 'interested')$q$) ilike '%content_not_found%'
  and public._try($q$select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000011', 'interested')$q$) ilike '%content_not_found%'
  and public._try($q$select public.set_content_interest('prompt', gen_random_uuid(), 'interested')$q$) ilike '%content_not_found%');

select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000001', 'not_interested') as r1 \gset
select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000004', 'interested') as r2 \gset
select public.set_content_interest('request', 'a2000000-0000-4000-8000-000000000001', 'not_interested') as r3 \gset
select public.set_content_interest('workflow', 'a3000000-0000-4000-8000-000000000001', 'interested') as r4 \gset
select public.set_content_interest('preset', 'a4000000-0000-4000-8000-000000000001', 'not_interested') as r5 \gset
select public._check(4, 'dört içerik türü kaydedilir ve değeri döner',
  :'r1' = 'not_interested' and :'r2' = 'interested' and :'r3' = 'not_interested' and :'r4' = 'interested' and :'r5' = 'not_interested'
  and (select count(*) from public.content_interest) = 5);

-- 5. Cevaplanan gönderi (iki değer de) bir daha çıkmaz; kontrol çıkar
select public._snap(1);
select public._check(5, 'cevaplanan gönderiler (çekiyor/çekmiyor, dört tür) Sana özel''den çıkar; cevapsız kontrol kalır',
  not exists (select 1 from public._page where pass = 1 and id in (
    'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001'))
  and public._rank(1, 'a1000000-0000-4000-8000-000000000003') is not null);

-- 6. "Çekmiyor" gönderisinin etiketi (kedi) eşleşen adayı −60 geriye atar; "çekiyor" etiketi (resim) +50 öne alır
select public._check(6, '"çekmiyor" etiketi eşleşen adayı tam −60, "çekiyor" etiketi tam +50 etkiler',
  public._rank(1, 'a1000000-0000-4000-8000-000000000002') = public._rank(1, 'a1000000-0000-4000-8000-000000000003') - 60
  and public._rank(1, 'a1000000-0000-4000-8000-000000000005') = public._rank(1, 'a1000000-0000-4000-8000-000000000003') + 50,
  (select string_agg(id::text || '=' || sort_rank, ', ') from public._page where pass = 1));
select public._check(7, '"çekiyor" etiketiyle gelen aday nedeni liked_tag olur',
  (select reason_kind from public._page where pass = 1 and id = 'a1000000-0000-4000-8000-000000000005') = 'liked_tag'
  and (select reason_ref from public._page where pass = 1 and id = 'a1000000-0000-4000-8000-000000000005') = 'resim');

-- 8. Aynı yazardan 2 "çekmiyor" → o yazar −200; bir tanesi cezalandırmaz
-- (bobby: prompt + istek + workflow … zaten 3 "çekmiyor" yok: prompt, istek, hazır ayar = 3, ama bobby'nin yeni adayı yok → carol ile sına)
select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000006', 'not_interested') as r6 \gset
select public._snap(2);
select public._check(8, 'bir "çekmiyor" yazarı cezalandırmaz (Carol''ın kalanları yalnız çeşitlilik düşüşü −120 alır)',
  public._rank(2, 'a1000000-0000-4000-8000-000000000007') is not null
  and public._rank(2, 'a1000000-0000-4000-8000-000000000008') is not null
  and public._rank(2, 'a1000000-0000-4000-8000-000000000008') - public._rank(2, 'a1000000-0000-4000-8000-000000000007') = 120,
  (select string_agg(id::text || '=' || sort_rank, ', ') from public._page where pass = 2 and id in ('a1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000008')));
select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000007', 'not_interested') as r7 \gset
select public._snap(3);
select public._check(9, 'aynı yazardan 2 "çekmiyor" sonrası kalan gönderisi −200 alır',
  public._rank(3, 'a1000000-0000-4000-8000-000000000008') = public._rank(2, 'a1000000-0000-4000-8000-000000000008') - 200,
  (select string_agg(pass || ':' || sort_rank, ', ') from public._page where id = 'a1000000-0000-4000-8000-000000000008' and pass in (2, 3)));

-- 10. Değeri değiştirmek tek satırda UPDATE; geri almak satırı siler ve gönderi geri gelir
select public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000001', 'interested') as r8 \gset
select public._check(10, 'değer değişince tek satır kalır (UPDATE)',
  :'r8' = 'interested'
  and (select count(*) from public.content_interest where prompt_id = 'a1000000-0000-4000-8000-000000000001') = 1
  and (select value from public.content_interest where prompt_id = 'a1000000-0000-4000-8000-000000000001') = 'interested');
select coalesce(public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000001', null), 'NULL') as r9 \gset
select public._snap(4);
select public._check(11, 'geri alınca (null) satır silinir ve gönderi akışa döner',
  (:'r9') = 'NULL'
  and (select count(*) from public.content_interest where prompt_id = 'a1000000-0000-4000-8000-000000000001') = 0
  and public._rank(4, 'a1000000-0000-4000-8000-000000000001') is not null);

-- 12. İstemci doğrudan yazamaz
select public._check(12, 'istemci content_interest''e doğrudan insert/update/delete yapamaz',
  public._try($q$insert into public.content_interest (prompt_id, value) values ('a1000000-0000-4000-8000-000000000003', 'interested')$q$) ilike '%permission denied%'
  and public._try($q$update public.content_interest set value = 'interested'$q$) ilike '%permission denied%'
  and public._try($q$delete from public.content_interest$q$) ilike '%permission denied%');
reset role;

-- 13. Yalnız sahibi okur
set role authenticated;
select public._as_user(:bobby);
select public._check(13, 'başka kullanıcı alice''in cevaplarını göremez',
  (select count(*) from public.content_interest) = 0);
reset role;
set role authenticated;
select public._as_user(:alice);
select public._check(14, 'alice kendi cevaplarını görür', (select count(*) from public.content_interest) > 0);
reset role;

-- 15. Bütünlük: tam bir hedef + hedef silinince cevap da silinir
select public._check(15, 'iki hedefli ya da hedefsiz satır CHECK ile reddedilir',
  public._try(format($q$insert into public.content_interest (user_id, prompt_id, request_id, value) values (%L, 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'interested')$q$, :alice)) ilike '%exactly_one_target%'
  and public._try(format($q$insert into public.content_interest (user_id, value) values (%L, 'interested')$q$, :alice)) ilike '%exactly_one_target%');
select count(*) as before_n from public.content_interest where workflow_id = 'a3000000-0000-4000-8000-000000000001' \gset
delete from public.workflows where id = 'a3000000-0000-4000-8000-000000000001';
select public._check(16, 'içerik (workflow) silinince cevabı da gider',
  :before_n = 1 and (select count(*) from public.content_interest where workflow_id = 'a3000000-0000-4000-8000-000000000001') = 0);

-- 17. Hız sınırı: saatte ≤200 cevap (geri almalar da sayılır)
create or replace function public._burst(n int) returns text language plpgsql as $$
declare i int;
begin
  for i in 1..n loop
    perform public.set_content_interest('prompt', 'a1000000-0000-4000-8000-000000000003', case when i % 2 = 0 then 'interested' else null end);
  end loop;
  return 'ok';
exception when others then return sqlerrm;
end $$;
grant execute on function public._burst(int) to public;
set role authenticated;
select public._as_user(:alice);
select public._check(17, 'saatte 200 cevaptan sonra rate_limit',
  public._burst(300) ilike '%rate_limit%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
