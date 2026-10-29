-- Sohbet paylaşılan fotoğraf/içerik/bağlantı sayıları + listeleri ve ortak topluluklar: DB tarafı testi (docs/history/271-*).
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla temiz bir yerel PostgreSQL'e oynatıldıktan sonra
-- (supabase/tests/run-local.sh), süper kullanıcıyla: psql -d <db> -f chat-shared-media.sql — "FAILED=0" beklenir.
-- Kullanıcılar: alice, bobby, carol, dave. Fixture kalıcıdır; ikinci çalıştırma için veritabanını yeniden kurun.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice, 'alice'), (:bobby, 'bobby'), (:carol, 'carol'), (:dave, 'dave')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

-- alice ↔ bobby kabul edilmiş sohbet.
set role authenticated;
select public._as_user(:alice);
create temp table _conv as select public.start_direct_conversation(:bobby) as id;
grant all on _conv to public;
select public._as_user(:bobby);
update public.conversation_members set status = 'accepted' where user_id = :bobby;
reset role;

-- Mesajlar (süper kullanıcı): 2 fotoğraflı + 1 fotoğraflı, 1 workflow kartı, 1 düz bağlantı, 1 düz metin, 1 silinmiş fotoğraf, 1 benden-silinmiş fotoğraf.
insert into public.messages (id, conversation_id, sender_id, body, attachments, deleted_at, created_at)
select m.id::uuid, c.id, m.sender::uuid, m.body, m.att::jsonb, m.del, m.at
from _conv c, (values
  ('00000000-0000-4000-8000-000000000001', :bobby, null,
     '[{"path":"a/1.jpg","width":1,"height":1,"mime":"image/jpeg"},{"path":"a/2.jpg","width":1,"height":1,"mime":"image/jpeg"}]', null::timestamptz, now() - interval '6 hours'),
  ('00000000-0000-4000-8000-000000000002', :bobby, null,
     '[{"path":"a/3.jpg","width":1,"height":1,"mime":"image/jpeg"}]', null, now() - interval '5 hours'),
  ('00000000-0000-4000-8000-000000000003', :alice, E'Harika akış\nhttps://example.com/promptly/workflows/local?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[]', null, now() - interval '4 hours'),
  ('00000000-0000-4000-8000-000000000004', :bobby, 'Bak: https://example.com/makale', '[]', null, now() - interval '3 hours'),
  ('00000000-0000-4000-8000-000000000005', :alice, 'düz metin', '[]', null, now() - interval '2 hours'),
  ('00000000-0000-4000-8000-000000000006', :bobby, null,
     '[{"path":"a/del.jpg","width":1,"height":1,"mime":"image/jpeg"}]', now(), now() - interval '90 minutes'),
  ('00000000-0000-4000-8000-000000000007', :bobby, null,
     '[{"path":"a/hid.jpg","width":1,"height":1,"mime":"image/jpeg"}]', null, now() - interval '80 minutes')
) as m(id, sender, body, att, del, at);
insert into public.message_hidden_for (message_id, user_id) values ('00000000-0000-4000-8000-000000000007', :alice);

-- 1. alice: sayılar (silinmiş ve benden-silinmiş fotoğraf sayılmaz)
set role authenticated;
select public._as_user(:alice);
create temp table _s1 as select public.chat_shared_stats((select id from _conv)) as j;
reset role;
select public._check(1, 'fotoğraf sayısı: yalnız görünen mesajların ekleri (3)', (select (j->>'photos')::int = 3 from _s1), (select j::text from _s1));
select public._check(2, 'içerik sayısı: workflow kartı (1); düz bağlantı içerik değildir', (select (j->>'content')::int = 1 from _s1));
select public._check(3, 'bağlantı sayısı: kart olmayan düz bağlantı (1)', (select (j->>'links')::int = 1 from _s1));

-- 2. listeler
set role authenticated;
select public._as_user(:alice);
create temp table _p as select * from public.chat_shared_items((select id from _conv), 'photos', 100);
create temp table _c as select * from public.chat_shared_items((select id from _conv), 'content', 100);
create temp table _l as select * from public.chat_shared_items((select id from _conv), 'links', 100);
create temp table _bad as select * from public.chat_shared_items((select id from _conv), 'nonsense', 100);
reset role;
select public._check(4, 'fotoğraf listesi: 2 mesaj, yeniden eskiye', (select count(*) = 2 and min(id::text) = '00000000-0000-4000-8000-000000000001' from _p) and (select id::text from _p order by created_at desc limit 1) = '00000000-0000-4000-8000-000000000002');
select public._check(5, 'içerik listesi 1, bağlantı listesi 1', (select count(*) from _c) = 1 and (select count(*) from _l) = 1);
select public._check(6, 'geçersiz tür boş döner', (select count(*) from _bad) = 0);

-- 3. geçmişi temizleyen taraf eski mesajları görmez
update public.conversation_members set cleared_at = now() - interval '5 hours 30 minutes' where conversation_id = (select id from _conv) and user_id = :alice;
set role authenticated;
select public._as_user(:alice);
create temp table _s2 as select public.chat_shared_stats((select id from _conv)) as j;
reset role;
select public._check(7, 'temizlenen geçmiş sayılmaz: fotoğraf 1 (5 saat önceki)', (select (j->>'photos')::int = 1 from _s2), (select j::text from _s2));

-- 4. üye olmayan hiçbir şey görmez
set role authenticated;
select public._as_user(:carol);
create temp table _s3 as select public.chat_shared_stats((select id from _conv)) as j;
create temp table _p3 as select * from public.chat_shared_items((select id from _conv), 'photos', 100);
reset role;
select public._check(8, 'üye olmayan: sayılar 0, liste boş', (select (j->>'photos')::int = 0 and (j->>'content')::int = 0 and (j->>'links')::int = 0 from _s3) and (select count(*) = 0 from _p3));

-- 5. anon çağıramaz
select public._check(9, 'anon üç RPC''yi çağıramaz, authenticated çağırır',
  not has_function_privilege('anon', 'public.chat_shared_stats(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.chat_shared_items(uuid, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.common_communities(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.common_communities(uuid)', 'execute'));

-- 6. ortak topluluklar: alice kurar (herkese açık + kapalı), bobby yalnız birine katılır, carol hiçbirine
set role authenticated;
select public._as_user(:alice);
create temp table _g1 as select public.create_chat_group('Ortak Atölye', null, 'public', null, 256, array[]::uuid[]) as j;
create temp table _g2 as select public.create_chat_group('Yalnız Alice', null, 'private', null, 256, array[]::uuid[]) as j;
grant all on _g1, _g2 to public;
select public._as_user(:bobby);
select public.join_chat_group((select (j->>'group_id')::uuid from _g1));
reset role;
set role authenticated;
select public._as_user(:alice);
create temp table _cc as select * from public.common_communities(:bobby);
select public._as_user(:carol);
create temp table _cc2 as select * from public.common_communities(:alice);
select public._as_user(:alice);
create temp table _cc3 as select * from public.common_communities(:alice);
reset role;
select public._check(10, 'ortak topluluk: yalnız ikisinin de üye olduğu (1)', (select count(*) = 1 from _cc) and (select common_communities::text from _cc limit 1) = (select j->>'group_id' from _g1));
select public._check(11, 'ortak topluluğu olmayan kişi boş görür; kendi kendine boş', (select count(*) = 0 from _cc2) and (select count(*) = 0 from _cc3));

-- 7. engel (iki yönlü) → boş
insert into public.blocks (blocker_id, blocked_id) values (:bobby, :alice);
set role authenticated;
select public._as_user(:alice);
create temp table _cc4 as select * from public.common_communities(:bobby);
reset role;
select public._check(12, 'engel varken ortak topluluk boş', (select count(*) = 0 from _cc4));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
