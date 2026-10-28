-- Tepkiler (docs/history/265-*): `prompt_likes.reaction`, `reaction_stats` (tetikleyiciyle tutulan sayılar), tepkiyi değiştirme (UPDATE), `reaction_friends`.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/reactions.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(içerik sahibi) bobby(tepki veren) carol(tepki veren) dave(bobby'yi takip eder) erin(bobby'nin engellediği)
--               mod(moderatör). Ziyaretçi = boş kimlik.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set mod   '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:mod,'moder')) as u(id, name);
update public.profiles set role = 'moderator' where id = :mod;

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return coalesce(r, ''); exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return coalesce(r, ''); end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._val(text),
  public._q(text), public._g(text), public._set(text, text) to public;


create or replace function public._flip() returns text language plpgsql as $$
declare i int;
begin
  for i in 1..125 loop
    update public.prompt_likes set reaction = case when i % 2 = 0 then 'love' else 'fire' end
      where user_id = auth.uid() and prompt_id = 'a0000000-0000-4000-8000-0000000000b1';
  end loop;
  return 'bitti';
exception when others then return sqlerrm;
end $$;
grant execute on function public._flip() to public;
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :erin);
insert into public.follows (follower_id, following_id) values (:dave, :bobby), (:dave, :carol);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Açık prompt', 'd', 'gece', 'image', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :alice, 'Özel prompt', 'd', 'gece', 'image', 'published', 'private'),
  ('a0000000-0000-4000-8000-0000000000b1', :bobby, 'Bobby prompt', 'd', 'gece', 'text', 'published', 'public');
insert into public.workflows (id, creator_id, title, status, visibility) values
  ('c0000000-0000-4000-8000-0000000000a1', :alice, 'Akış', 'published', 'public');

-- ============================================================================
-- 1. Geriye uyum: eski istemci `reaction` göndermez → 'love'; sayaçlar ve tepki sayıları
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public._try($q$insert into public.prompt_likes (prompt_id, user_id) values ('a0000000-0000-4000-8000-0000000000a1', auth.uid())$q$);
select public._check(1, 'reaction göndermeyen eski istemci: satır love olur, like_count 1, reaction_stats love=1',
  public._q($q$select reaction from public.prompt_likes where user_id = auth.uid() and prompt_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 'love'
  and public._q($q$select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1'
  and public._q($q$select n from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1' and reaction = 'love'$q$) = '1');
select public._as_user(:carol);
select public._check(2, 'tepki ile ekleme: carol ateş verir; iki ayrı satır, toplam like_count 2',
  public._try($q$insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000a1', auth.uid(), 'fire')$q$) = 'ok'
  and public._q($q$select string_agg(reaction || ':' || n, ',' order by reaction) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 'fire:1,love:1'
  and public._q($q$select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '2');
select public._check(3, 'geçersiz tepki reddedilir (CHECK)',
  public._try($q$insert into public.prompt_likes (workflow_id, user_id, reaction) values ('c0000000-0000-4000-8000-0000000000a1', auth.uid(), 'angry')$q$) like '%prompt_likes_reaction_check%');
reset role;

-- ============================================================================
-- 2. Tepkiyi değiştirme: UPDATE; sayaç/bildirim oynamaz; yalnız `reaction` değişir
-- ============================================================================
select public._as_user('');
select public._set('notif_before', (select count(*) from public.notifications)::text);
set role authenticated;
select public._as_user(:carol);
select public._check(4, 'carol tepkisini ateşten alkışa çevirir: stats fire yok, clap=1; like_count hâlâ 2',
  public._try($q$update public.prompt_likes set reaction = 'clap' where user_id = auth.uid() and prompt_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 'ok'
  and public._q($q$select string_agg(reaction || ':' || n, ',' order by reaction) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 'clap:1,love:1'
  and public._q($q$select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '2');
select public._check(5, 'değişiklik yeni bildirim üretmez',
  public._q($q$select count(*) from public.notifications$q$) = (select v from public._ctx where k = 'notif_before'));
select public._check(6, 'hedef/kullanıcı değiştirilemez (like_immutable)',
  public._try($q$update public.prompt_likes set prompt_id = 'a0000000-0000-4000-8000-0000000000b1' where user_id = auth.uid() and prompt_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) like '%like_immutable%'
  and public._try(format($q$update public.prompt_likes set user_id = %L where user_id = auth.uid()$q$, :alice)) not like 'ok');
select public._as_user(:dave);
select public._check(7, 'başkasının tepkisi değiştirilemez (0 satır); reaction CHECK UPDATE’te de geçerli',
  public._val($q$with u as (update public.prompt_likes set reaction = 'haha' where prompt_id = 'a0000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from u$q$) = '0'
  and public._try($q$update public.prompt_likes set reaction = 'angry' where user_id = auth.uid()$q$) <> '');
reset role;

-- ============================================================================
-- 3. Silme: sayılar düşer, 0 olan satır silinir; hedef silinince sayılar da gider
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._try($q$delete from public.prompt_likes where user_id = auth.uid() and prompt_id = 'a0000000-0000-4000-8000-0000000000a1'$q$);
select public._check(8, 'carol beğeniyi kaldırır: clap satırı tamamen silinir, love=1 kalır, like_count 1',
  public._q($q$select string_agg(reaction || ':' || n, ',' order by reaction) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = 'love:1'
  and public._q($q$select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1');
reset role;
select public._as_user('');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000d1', :alice, 'Silinecek', 'd', 'x', 'text', 'published', 'public');
insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000d1', :bobby, 'wow'), ('a0000000-0000-4000-8000-0000000000d1', :carol, 'wow');
select public._check(9, 'iki wow → wow=2', (select n from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000d1' and reaction = 'wow') = 2);
delete from public.prompts where id = 'a0000000-0000-4000-8000-0000000000d1';
select public._check(10, 'prompt silinince (CASCADE) tepki sayıları da silinir', (select count(*) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000d1') = 0);

-- ============================================================================
-- 4. reaction_stats istemciden yazılamaz; yeniden sayım (backfill) tutarlıdır
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public._check(11, 'istemci reaction_stats’a insert/update/delete yapamaz',
  public._try($q$insert into public.reaction_stats (target_id, reaction, n) values ('a0000000-0000-4000-8000-0000000000b1', 'love', 99)$q$) like '%permission denied%'
  and public._try($q$update public.reaction_stats set n = 99$q$) like '%permission denied%'
  and public._try($q$delete from public.reaction_stats$q$) like '%permission denied%');
reset role;
select public._check(12, 'tüm hedefler için reaction_stats = prompt_likes’tan yeniden sayım (tutarlı)',
  not exists (
    select 1 from (select target_id, reaction, count(*)::int as n from public.prompt_likes group by 1, 2) c
    full join public.reaction_stats s using (target_id, reaction)
    where c.n is distinct from s.n));

-- ============================================================================
-- 5. Okunabilirlik: sayılar, çağıranın o hedefin beğenilerini okuyabildiği yerde görünür
-- ============================================================================
select public._as_user('');
insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000a2', :carol, 'idea');
set role authenticated;
select public._as_user(:bobby);
select public._check(13, 'özel promptun tepki sayısı başkasına (bobby) görünmez; açık promptun görünür',
  public._val($q$select count(*) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a2'$q$) = '0'
  and public._val($q$select count(*) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1');
select public._as_user(:carol);
select public._check(14, 'tepkiyi veren (carol) kendi satırı üzerinden o sayıyı görür',
  public._q($q$select count(*) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a2'$q$) = '1');
reset role;
set role anon;
select public._as_user('');
select public._check(15, 'ziyaretçi açık promptun tepki sayısını okur, özelinkini okumaz',
  public._val($q$select count(*) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1'$q$) = '1'
  and public._val($q$select count(*) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a2'$q$) = '0');
reset role;

-- ============================================================================
-- 6. reaction_friends: yalnız TAKİP ETTİKLERİM
-- ============================================================================
select public._as_user('');
insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000a1', :carol, 'haha');
set role authenticated;
select public._as_user(:dave);
select public._check(16, 'dave (bobby ve carol’u takip eder) ikisini görür; reaction + kullanıcı adı döner',
  public._val($q$select string_agg(username || ':' || reaction, ',' order by username) from public.reaction_friends(array['a0000000-0000-4000-8000-0000000000a1']::uuid[], 2)$q$) = 'bobby:love,carol:haha');
select public._check(17, 'p_per sınırı: 1 → hedef başına tek kişi',
  public._q($q$select count(*) from public.reaction_friends(array['a0000000-0000-4000-8000-0000000000a1']::uuid[], 1)$q$) = '1');
select public._as_user(:alice);
select public._check(18, 'kimseyi takip etmeyen (alice) boş görür',
  public._q($q$select count(*) from public.reaction_friends(array['a0000000-0000-4000-8000-0000000000a1']::uuid[], 2)$q$) = '0');
reset role;
set role anon;
select public._as_user('');
select public._check(19, 'ziyaretçi için boş (hata yok)',
  public._q($q$select count(*) from public.reaction_friends(array['a0000000-0000-4000-8000-0000000000a1']::uuid[], 2)$q$) = '0');
reset role;
set role authenticated;
select public._as_user(:dave);
select public._check(20, 'okunamayan hedefin beğenisi takip edilen kişi olsa da gelmez (özel prompt)',
  public._val($q$select count(*) from public.reaction_friends(array['a0000000-0000-4000-8000-0000000000a2']::uuid[], 2)$q$) = '0');
reset role;

-- ============================================================================
-- 7. Engel / askı / hız sınırı değişiklikte de geçerli
-- ============================================================================
select public._as_user('');
insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000b1', :erin, 'love');
set role authenticated;
select public._as_user(:erin);
select public._check(21, 'engellenen (erin), engelleyenin (bobby) içeriğindeki tepkisini değiştiremez',
  public._try($q$update public.prompt_likes set reaction = 'fire' where user_id = auth.uid()$q$) like '%interaction_blocked%');
reset role;
select public._as_user('');
update public.profiles set suspended_until = now() + interval '1 day' where id = :dave;
insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000b1', :dave, 'love');
set role authenticated;
select public._as_user(:dave);
select public._check(22, 'askıdaki hesap (dave) tepkisini değiştiremez',
  public._try($q$update public.prompt_likes set reaction = 'fire' where user_id = auth.uid()$q$) like '%askıya%');
reset role;
select public._as_user('');
update public.profiles set suspended_until = null where id = :dave;
set role authenticated;
select public._as_user(:dave);
select public._set('rl', public._flip());
reset role;
select public._check(23, 'tepki değiştirme hız sınırı: 120 değişiklikten sonra rate_limit',
  (select v from public._ctx where k = 'rl') like '%rate_limit%');

-- ============================================================================
-- 8. Sunucu beğeniyi başka hedefe taşırsa (241'deki Space → alıntı geçişi gibi) sayılar izler
-- ============================================================================
select public._as_user('');
insert into public.prompt_likes (prompt_id, user_id, reaction) values ('a0000000-0000-4000-8000-0000000000a1', :dave, 'idea');
update public.prompt_likes set prompt_id = null, workflow_id = 'c0000000-0000-4000-8000-0000000000a1' where user_id = :dave and prompt_id = 'a0000000-0000-4000-8000-0000000000a1';
select public._check(24, 'hedef taşınınca eski hedefin idea sayısı silinir, yeni hedefte idea=1',
  not exists (select 1 from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1' and reaction = 'idea')
  and (select n from public.reaction_stats where target_id = 'c0000000-0000-4000-8000-0000000000a1' and reaction = 'idea') = 1);

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
