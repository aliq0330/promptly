-- "Takip edilecek kişiler" şeridi (suggest_creators + dismiss_creator_suggestion; docs/history/285-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/creator-suggestions.sql  ("FAILED=0" beklenir).
-- alice = izleyen. Adaylar: carol, dave (alice'in takip ettiği bobby'nin takip ettikleri), gina (alice'in beğendiği yazar), hank (takip edilen etiket),
-- ivy (takip edilen araç), erin (yalnız yedek). Elenenler: bobby (zaten takipte), jack (alice engelledi), kim (alice'i engelledi),
-- lena (askıda), mike (yalnız taslak), nina (90 günden eski gönderi), pam (yalnız topluluğa özgü gönderi).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set gina  '''66666666-6666-4666-8666-666666666666'''
\set hank  '''77777777-7777-4777-8777-777777777777'''
\set ivy   '''88888888-8888-4888-8888-888888888888'''
\set jack  '''99999999-9999-4999-8999-999999999999'''
\set kim   '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''
\set lena  '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''
\set mike  '''cccccccc-cccc-4ccc-8ccc-cccccccccccc'''
\set nina  '''dddddddd-dddd-4ddd-8ddd-dddddddddddd'''
\set pam   '''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:gina,'gina'),(:hank,'hank'),(:ivy,'ivy'),
             (:jack,'jack'),(:kim,'kim'),(:lena,'lena'),(:mike,'mike'),(:nina,'nina'),(:pam,'pam')) as u(id, name);

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

-- Veri (oturumsuz = kısıtlı tetikleyiciler kapalı; toplu kurulum auth.uid() null ile yazılır)
insert into public.tags (slug, label) values ('kedi', 'Kedi') on conflict (slug) do nothing;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at, tools) values
  ('c1000000-0000-4000-8000-000000000001', :bobby, 'Bobby gönderisi', 'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000002', :carol, 'Carol gönderisi', 'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000003', :dave,  'Dave gönderisi',  'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000004', :erin,  'Erin gönderisi',  'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000005', :gina,  'Gina gönderisi',  'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000006', :hank,  'Hank kedi',       'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000007', :ivy,   'Ivy araç',        'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{midjourney}'),
  ('c1000000-0000-4000-8000-000000000008', :jack,  'Jack gönderisi',  'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000009', :kim,   'Kim gönderisi',   'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000010', :lena,  'Lena gönderisi',  'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000011', :mike,  'Mike taslak',     'd', 'm', 'text', 'draft',     'public', now() - interval '1 day', '{}'),
  ('c1000000-0000-4000-8000-000000000012', :nina,  'Nina eski',       'd', 'm', 'text', 'published', 'public', now() - interval '120 days', '{}'),
  ('c1000000-0000-4000-8000-000000000013', :alice, 'Alice gönderisi', 'd', 'm', 'text', 'published', 'public', now() - interval '1 day', '{}');
insert into public.prompt_tags (prompt_id, tag_slug) values ('c1000000-0000-4000-8000-000000000006', 'kedi');

-- Topluluğa özgü gönderi: pam'in tek gönderisi bir topluluğa ait (sunucu görünürlüğü private'a zorlar; profilde/akışta görünmez → aday olamaz).
select public._as_user(:pam);
select (public.create_community('Pam Topluluk', 'açıklama', 'public', null, 50, array[]::uuid[], 'general', 'members', 'members', null, false) ->> 'group_id') as pam_gid \gset
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at, community_id)
  values ('c1000000-0000-4000-8000-000000000014', :pam, 'Pam topluluk', 'd', 'm', 'text', 'published', 'public', now() - interval '1 day', :'pam_gid');
select public._as_user('');
select public._check(0, 'kurulum: pam''in gönderisi topluluğa ait', (select community_id is not null from public.prompts where id = 'c1000000-0000-4000-8000-000000000014'));

insert into public.follows (follower_id, following_id) values (:alice, :bobby), (:bobby, :carol), (:bobby, :dave);
insert into public.tag_follows (user_id, tag_slug) values (:alice, 'kedi');
insert into public.tool_follows (user_id, tool_id) values (:alice, 'midjourney');
insert into public.prompt_likes (user_id, prompt_id) values (:alice, 'c1000000-0000-4000-8000-000000000005');
insert into public.blocks (blocker_id, blocked_id) values (:alice, :jack), (:kim, :alice);
update public.profiles set suspended_until = now() + interval '1 day' where id = :lena;

create or replace function public._ids() returns text language sql as
  $$ select coalesce(string_agg(p.username, ',' order by s.score desc, s.id desc), '') from public.suggest_creators(30) s join public.profiles p on p.id = s.id $$;
grant execute on function public._ids() to public;

create or replace function public._burst(n int) returns text language plpgsql as $$
begin
  for i in 1..n loop
    perform public.dismiss_creator_suggestion('77777777-7777-4777-8777-777777777777');
  end loop;
  return 'ok';
exception when others then return sqlerrm;
end $$;
grant execute on function public._burst(int) to public;

-- 1. Misafir çağıramaz; tabloyu okuyamaz/yazamaz
set role anon;
select public._as_user('');
select public._check(1, 'anon suggest_creators / dismiss çağıramaz ve tabloyu okuyamaz',
  public._try($q$select * from public.suggest_creators(5)$q$) ilike '%permission denied%'
  and public._try($q$select public.dismiss_creator_suggestion('33333333-3333-4333-8333-333333333333')$q$) ilike '%permission denied%'
  and public._try($q$select * from public.creator_suggestion_dismissals$q$) ilike '%permission denied%');
reset role;

-- 2. Doğru küme: sinyalli adaylar gelir, elenenler gelmez
set role authenticated;
select public._as_user(:alice);
select public._ids() as ids \gset
select public._check(2, 'aday kümesi: carol, dave, gina, hank, ivy, erin (elenenler yok)',
  (select array_agg(x order by x) from unnest(string_to_array(:'ids', ',')) x) = array['carol','dave','erin','gina','hank','ivy'], :'ids');

-- 3. Sıra: ortak takip > beğenilen yazar > etiket > araç > yedek
select public._check(3, 'sıra: mutual (carol, dave) > liked (gina) > tag (hank) > tool (ivy) > active (erin)',
  :'ids' = 'dave,carol,gina,hank,ivy,erin' or :'ids' = 'carol,dave,gina,hank,ivy,erin', :'ids');

-- 4. Nedenler
select public._check(4, 'neden türü ve ayrıntısı doğru (mutual: ortak takip eden kişinin adı + sayı; tag/tool: etiket/araç)',
  (select reason_kind = 'mutual' and reason_ref = 'Bobby' and reason_count = 1 from public.suggest_creators(30) where id = :carol)
  and (select reason_kind = 'liked' and reason_count = 1 from public.suggest_creators(30) where id = :gina)
  and (select reason_kind = 'tag' and reason_ref = 'kedi' and reason_count = 1 from public.suggest_creators(30) where id = :hank)
  and (select reason_kind = 'tool' and reason_ref = 'midjourney' from public.suggest_creators(30) where id = :ivy)
  and (select reason_kind = 'active' and reason_ref is null and reason_count = 0 from public.suggest_creators(30) where id = :erin));

-- 5. Sınır
select public._check(5, 'p_limit sınırlanır (1..30)',
  (select count(*) from public.suggest_creators(1)) = 1
  and (select count(*) from public.suggest_creators(0)) = 1
  and (select count(*) from public.suggest_creators(null)) = 6
  and (select count(*) from public.suggest_creators(3)) = 3);

-- 6. Kapatma: kuralları
select public._check(6, 'dismiss: geçersiz kişi (kendisi, olmayan, null) reddedilir',
  public._try($q$select public.dismiss_creator_suggestion('11111111-1111-4111-8111-111111111111')$q$) ilike '%invalid_creator%'
  and public._try($q$select public.dismiss_creator_suggestion(gen_random_uuid())$q$) ilike '%invalid_creator%'
  and public._try($q$select public.dismiss_creator_suggestion(null)$q$) ilike '%invalid_creator%');

select public.dismiss_creator_suggestion(:erin);
select public.dismiss_creator_suggestion(:erin);
select public._ids() as ids2 \gset
select public._check(7, 'dismiss: kapatılan kişi bir daha gelmez; tekrarı sessiz (tek satır)',
  :'ids2' not like '%erin%' and (select count(*) from public.creator_suggestion_dismissals where user_id = :alice and creator_id = :erin) = 1, :'ids2');

-- 8. İstemci tabloya doğrudan yazamaz; yalnız kendi satırını okur
select public._check(8, 'istemci insert/delete yapamaz',
  public._try($q$insert into public.creator_suggestion_dismissals (user_id, creator_id) values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')$q$) ilike '%permission denied%'
  and public._try($q$delete from public.creator_suggestion_dismissals$q$) ilike '%permission denied%');
select public._as_user(:bobby);
select public._check(9, 'başkasının kapatmalarını okuyamaz (RLS)', (select count(*) from public.creator_suggestion_dismissals) = 0);
select public._as_user(:alice);
select public._check(10, 'sahibi kendi satırını okur', (select count(*) from public.creator_suggestion_dismissals) = 1);

-- 11. Takip edince aday listeden çıkar
reset role;
select public._as_user('');
insert into public.follows (follower_id, following_id) values (:alice, :carol);
set role authenticated;
select public._as_user(:alice);
select public._ids() as ids3 \gset
select public._check(11, 'takip edilen kişi (carol) öneriden çıkar', :'ids3' not like '%carol%' and :'ids3' like '%dave%', :'ids3');

-- 12. Engel kaldırılınca (alice → jack) aday olur; askı bitince lena da gelir (elenme nedenleri tek tek doğrulanır)
reset role;
select public._as_user('');
delete from public.blocks where blocker_id = :alice and blocked_id = :jack;
update public.profiles set suspended_until = null where id = :lena;
set role authenticated;
select public._as_user(:alice);
select public._ids() as ids4 \gset
select public._check(12, 'engel/askı kalkınca jack ve lena gelir (kuralların etkisi tek tek görülür); kim (alice''i engelleyen) hâlâ gelmez',
  :'ids4' like '%jack%' and :'ids4' like '%lena%' and :'ids4' not like '%kim%', :'ids4');

-- 13. Kapatılanlar kalıcı: yeni oturum/çağrı da erin'i getirmez; kapatılan kişi başkasına gelmeye devam eder
select public._as_user(:gina);
select public._check(13, 'alice''in kapatması gina''nın önerisini etkilemez', public._ids() like '%erin%', public._ids());
select public._as_user(:alice);

-- 14. Oturumsuz-benzeri: kimliği olmayan çağrı boş döner (anon zaten yetkisiz; authenticated rolüyle sub boşken)
select public._as_user('');
select public._check(14, 'auth.uid() yokken boş küme', (select count(*) from public.suggest_creators(30)) = 0);
select public._as_user(:alice);

-- 15. Hız sınırı: saatte 120 kapatma
select public._check(15, 'saatte 120 kapatmadan sonra rate_limit', public._burst(200) ilike '%rate_limit%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
