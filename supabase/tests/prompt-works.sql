-- "Çalıştı mı?" oyu (set_prompt_works / prompt_works_state / prompt_works_stats; docs/history/296-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/prompt-works.sql  ("FAILED=0" beklenir).
-- me = prompt yazarı; u1/u2/u3 = oy verebilecek kullanıcılar; b = engelleyen. P1 yayında, P2 taslak, P3 özel, Pc topluluğa özgü, P5 = u1'in promptu.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set u1 '''22222222-2222-4222-8222-222222222222'''
\set u2 '''33333333-3333-4333-8333-333333333333'''
\set u3 '''44444444-4444-4444-8444-444444444444'''
\set p1 '''d3000000-0000-4000-8000-000000000001'''
\set p2 '''d3000000-0000-4000-8000-000000000002'''
\set p3 '''d3000000-0000-4000-8000-000000000003'''
\set pc '''d3000000-0000-4000-8000-000000000004'''
\set p5 '''d3000000-0000-4000-8000-000000000005'''

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

insert into public.conversations (id, kind) values ('e4000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e4000000-0000-4000-8000-000000000001', 'Topluluk', :me);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  (:p1, :me, 'P1', 'd', 'm', 'text', 'published', 'public',  null),
  (:p2, :me, 'P2 taslak', 'd', 'm', 'text', 'draft', 'public', null),
  (:p3, :me, 'P3 özel', 'd', 'm', 'text', 'published', 'private', null),
  (:pc, :me, 'Pc topluluk', 'd', 'm', 'text', 'published', 'private', 'e4000000-0000-4000-8000-000000000001'),
  (:p5, :u1, 'P5 başkası', 'd', 'm', 'text', 'published', 'public', null);
-- Kopyalama geçmişi: u1 ve u2 P1'i; u1 ayrıca P5'i kopyaladı değil (kendi promptu); u3 henüz kopyalamadı.
insert into public.prompt_copy_events (prompt_id, user_id) values (:p1, :u1), (:p1, :u2);

-- Yardımcı: tek çağrıda oy durumu metni.
create or replace function public._works(p uuid) returns text language sql as
  $$ select yes_count || '/' || no_count || '/' || coalesce(my_vote::text, '-') || '/' || can_vote from public.prompt_works_state(p) $$;
grant execute on function public._works(uuid) to public;

-- 1. Ziyaretçi oy veremez; durum okuyabilir
set role anon;
select public._as_user('');
select public._check(1, 'anon set_prompt_works çağıramaz', public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000001')) ilike '%permission denied%');
select public._check(2, 'anon durumu okur: sıfır sayı, oy boş, can_vote false', public._works(:p1) = '0/0/-/false', public._works(:p1));
reset role;

set role authenticated;
-- 3–6. Kopyalamadan oy yok; yazar oy veremez; okunamayan prompt not_found
select public._as_user(:u3);
select public._check(3, 'kopyalamamış kullanıcı oy veremez (copy_required)', public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000001')) ilike '%copy_required%');
select public._check(4, 'kopyalamamış: can_vote false', public._works(:p1) = '0/0/-/false', public._works(:p1));
select public._as_user(:me);
select public._check(5, 'yazar kendi promptuna oy veremez (self_vote_not_allowed)', public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000001')) ilike '%self_vote_not_allowed%');
select public._as_user(:u2);
select public._check(6, 'taslak / özel / topluluğa özgü / olmayan prompt: not_found',
  public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000002')) ilike '%not_found%'
  and public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000003')) ilike '%not_found%'
  and public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000004')) ilike '%not_found%'
  and public._try('select * from public.set_prompt_works(gen_random_uuid(), true)') ilike '%not_found%');
select public._check(7, 'okunamayan prompt durumu sıfır döner (varlık sızmaz)', public._works(:p2) = '0/0/-/false' and public._works(:p3) = '0/0/-/false' and public._works(:pc) = '0/0/-/false');

-- 8–12. Oy ver / değiştir / geri al
select public._check(8, 'kopyalamış u2: can_vote true, oy boş', public._works(:p1) = '0/0/-/true', public._works(:p1));
select * from public.set_prompt_works(:p1, true) \gset a_
select public._check(9, 'u2 "çalıştı" der → 1/0, oyum true', :a_yes_count = 1 and :a_no_count = 0 and public._works(:p1) = '1/0/true/true', public._works(:p1));
select public._as_user(:u1);
select * from public.set_prompt_works(:p1, false) \gset b_
select public._check(10, 'u1 "çalışmadı" der → 1/1, oyum false', :b_yes_count = 1 and :b_no_count = 1 and public._works(:p1) = '1/1/false/true', public._works(:p1));
select * from public.set_prompt_works(:p1, true) \gset c_
select public._check(11, 'u1 oyunu değiştirir (false→true) → 2/0; aynı oyu tekrar vermek sayıyı oynatmaz',
  :c_yes_count = 2 and :c_no_count = 0 and (select yes_count from public.set_prompt_works(:p1, true)) = 2, :'c_yes_count' || '/' || :'c_no_count');
select * from public.set_prompt_works(:p1, null) \gset d_
select public._check(12, 'u1 oyunu geri alır (null) → 1/0, oyum boş; ikinci geri alma hata vermez',
  :d_yes_count = 1 and :d_no_count = 0 and public._works(:p1) = '1/0/-/true' and public._try(format('select * from public.set_prompt_works(%L, null)', 'd3000000-0000-4000-8000-000000000001')) = 'ok', :'d_yes_count' || '/' || :'d_no_count');

-- 13–15. İstemci doğrudan yazamaz; sayılar okunabilir; özel prompt sayıları başkasına görünmez
select public._check(13, 'oy tablosuna doğrudan yazma/okuma kapalı',
  public._try(format('insert into public.prompt_works_votes (prompt_id, user_id, works) values (%L, %L, true)', 'd3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333')) ilike '%permission denied%'
  and public._try('select * from public.prompt_works_votes') ilike '%permission denied%');
select public._check(14, 'sayaç tablosuna istemci yazamaz',
  public._try(format('update public.prompt_works_stats set yes_count = 999 where prompt_id = %L', 'd3000000-0000-4000-8000-000000000001')) ilike '%permission denied%'
  and public._try(format('insert into public.prompt_works_stats (prompt_id, yes_count) values (%L, 5)', 'd3000000-0000-4000-8000-000000000003')) ilike '%permission denied%');
select public._check(15, 'sayaç tablosu herkese açık prompt için okunur: P1 = 1 evet, 0 hayır',
  (select yes_count || '/' || no_count from public.prompt_works_stats where prompt_id = :p1) = '1/0');
reset role;
insert into public.prompt_works_stats (prompt_id, yes_count, no_count) values (:p3, 7, 1);   -- özel promptun sayısı (kurulum: yetkili rolle)
set role authenticated;
select public._as_user(:u3);
select public._check(16, 'özel promptun sayaç satırı başkasına görünmez (prompt RLS)',
  (select count(*) from public.prompt_works_stats where prompt_id = :p3) = 0);
select public._as_user(:me);
select public._check(17, 'özel promptun sayaç satırını yazarı görür', (select count(*) from public.prompt_works_stats where prompt_id = :p3) = 1);
reset role;
delete from public.prompt_works_stats where prompt_id = :p3;

-- 18. Engelleme iki yönlü: u3 yazarı engellerse oy veremez
insert into public.prompt_copy_events (prompt_id, user_id) values (:p1, :u3);
insert into public.blocks (blocker_id, blocked_id) values (:u3, :me);
set role authenticated;
select public._as_user(:u3);
select public._check(18, 'engelleme varken oy verilemez (interaction_blocked) ve can_vote false',
  public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000001')) ilike '%interaction_blocked%' and public._works(:p1) like '%/false');
reset role;
delete from public.blocks where blocker_id = :u3;

-- 19. Prompt gizlenince oy verilemez; sayılar sıfır görünür; oylar korunur
update public.prompts set visibility = 'private' where id = :p1;
set role authenticated;
select public._as_user(:u2);
select public._check(19, 'prompt özele alınınca oy verilemez ve durum sıfır döner',
  public._try(format('select * from public.set_prompt_works(%L, true)', 'd3000000-0000-4000-8000-000000000001')) ilike '%not_found%' and public._works(:p1) = '0/0/-/false');
reset role;
update public.prompts set visibility = 'public' where id = :p1;
select public._check(20, 'yeniden herkese açılınca eski oylar geri gelir (silinmedi)', (select yes_count from public.prompt_works_stats where prompt_id = :p1) = 1);

-- 21. Saatte 30 oy sınırı (31. yeni oy rate_limit)
select public._as_user('');   -- toplu kurulum oturumsuz yazılır (hız sınırı kimliğe bağlı)
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
select ('d3100000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, :me, 'R' || g, 'd', 'm', 'text', 'published', 'public' from generate_series(1, 31) g;
insert into public.prompt_copy_events (prompt_id, user_id) select ('d3100000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, :u3 from generate_series(1, 31) g;
create or replace function public._burst() returns text language plpgsql as $$
declare i int; r text := 'ok';
begin
  for i in 1..31 loop
    begin
      perform * from public.set_prompt_works(('d3100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, true);
    exception when others then r := sqlerrm; exit;
    end;
  end loop;
  return r;
end $$;
grant execute on function public._burst() to public;
set role authenticated;
select public._as_user(:u3);
select public._check(21, 'saatte 30 oydan sonra rate_limit', public._burst() ilike '%rate_limit%');
reset role;

-- 22. Prompt silinince oylar ve sayılar kaskadla gider
delete from public.prompts where id = :p1;
select public._check(22, 'prompt silinince oy ve sayaç satırları da gider',
  (select count(*) from public.prompt_works_votes where prompt_id = :p1) = 0 and (select count(*) from public.prompt_works_stats where prompt_id = :p1) = 0);

-- 23. Yetki: fonksiyonlar beklenen rollere açık
select public._check(23, 'yetkiler: anon yalnız durum okur; tetikleyici/yardımcılar istemciye kapalı',
  has_function_privilege('anon', 'public.prompt_works_state(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_prompt_works(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.set_prompt_works(uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.maintain_prompt_works_stats()', 'execute')
  and not has_function_privilege('authenticated', 'public._works_bump(uuid, integer, integer)', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
