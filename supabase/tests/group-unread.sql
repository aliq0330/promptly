-- Grup sohbetinde okunmamış sayısı okuma anında hesaplanır (docs/history/258-*): mesaj başına üye satırı güncellenmez (fan-out yok),
-- birebir sohbet eskisi gibi tetikleyiciyle sayılır, `group_unread_counts` imleç / temizleme / katılma zamanı / 100 sınırına uyar.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/group-unread.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set N 3000

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol')) as u(id, name);
insert into auth.users (id, email, raw_user_meta_data)
select ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'm' || i || '@test.dev', jsonb_build_object('username', 'm' || i, 'display_name', 'M' || i)
from generate_series(1, :N) i;

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

-- Birebir sohbet (alice ↔ bobby) ve topluluk (alice sahip; bobby, carol + 3000 üye).
insert into public.conversations (id, kind) values ('d0000000-0000-4000-8000-0000000000d1', 'direct');
insert into public.conversation_members (conversation_id, user_id) values ('d0000000-0000-4000-8000-0000000000d1', :alice), ('d0000000-0000-4000-8000-0000000000d1', :bobby);
set role authenticated;
select public._as_user(:alice);
create temp table _c as select public.create_community('Büyük', 'd', 'public', null, 50, '{}'::uuid[], 'image', 'members', 'members', null, false) as j;
reset role;
insert into public._ctx select 'g', j->>'group_id' from _c;
insert into public.conversation_members (conversation_id, user_id, role, joined_at)
select (select v::uuid from public._ctx where k = 'g'), u, 'member', now() - interval '1 day'
from (select :bobby::uuid u union all select :carol::uuid union all select ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, :N) i) t;

-- Mesajlar: grupta alice 5, bobby 2; birebirde alice 3.
insert into public.messages (conversation_id, sender_id, body, created_at)
select (select v::uuid from public._ctx where k = 'g'), :alice, 'a' || i, now() - interval '1 hour' + i * interval '1 second' from generate_series(1, 5) i;
insert into public.messages (conversation_id, sender_id, body, created_at)
select (select v::uuid from public._ctx where k = 'g'), :bobby, 'b' || i, now() - interval '30 minutes' + i * interval '1 second' from generate_series(1, 2) i;
insert into public.messages (conversation_id, sender_id, body) select 'd0000000-0000-4000-8000-0000000000d1', :alice, 'd' || i from generate_series(1, 3) i;

select public._check(1, 'grupta mesaj üye satırlarını GÜNCELLEMEZ (fan-out yok): hiçbir üyenin unread_count değeri artmadı',
  (select count(*) from public.conversation_members where conversation_id = (select v::uuid from public._ctx where k = 'g') and unread_count <> 0) = 0,
  (select count(*)::text from public.conversation_members where conversation_id = (select v::uuid from public._ctx where k = 'g') and unread_count <> 0));
select public._check(2, 'birebir sohbet eskisi gibi: karşı taraf 3 okunmamış, gönderen 0',
  (select unread_count from public.conversation_members where conversation_id = 'd0000000-0000-4000-8000-0000000000d1' and user_id = :bobby) = 3
  and (select unread_count from public.conversation_members where conversation_id = 'd0000000-0000-4000-8000-0000000000d1' and user_id = :alice) = 0);
select public._check(3, 'grubun last_message_at güncellenir (tek satır)',
  (select last_message_at from public.conversations where id = (select v::uuid from public._ctx where k = 'g')) > now() - interval '1 hour');

-- group_unread_counts: carol 7 (kendi mesajı yok), bobby 5 (kendi 2'si sayılmaz), alice 2.
set role authenticated;
select public._as_user(:carol);
select public._check(4, 'group_unread_counts: üyenin kendi mesajları hariç sayılır (carol 7)', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 7);
select public._as_user(:bobby);
select public._check(5, 'bobby: yalnız alice''in 5 mesajı', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 5);
select public._check(6, 'birebir sohbet bu fonksiyonda yok (yalnız grup)', not exists (select 1 from public.group_unread_counts(array['d0000000-0000-4000-8000-0000000000d1'::uuid])));
select public._as_user(:carol);
select public._check(7, 'yalnız KENDİ üyeliği: başka kullanıcının grubu sorulduğunda boş (üye değil)', not exists (select 1 from public.group_unread_counts(array[gen_random_uuid()])));
reset role;

-- İmleç: carol 3. mesajdan sonrasını okumamış sayılır.
update public.conversation_members set last_read_at = (select created_at from public.messages where conversation_id = (select v::uuid from public._ctx where k = 'g') and body = 'a3')
 where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :carol;
set role authenticated;
select public._as_user(:carol);
select public._check(8, 'okundu imleci: a3''ten sonrası (a4, a5, b1, b2) = 4', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 4);
reset role;
-- Temizleme (cleared_at) ve katılma zamanı (joined_at): sonrası sayılır.
update public.conversation_members set cleared_at = (select created_at from public.messages where conversation_id = (select v::uuid from public._ctx where k = 'g') and body = 'b1')
 where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :carol;
set role authenticated;
select public._as_user(:carol);
select public._check(9, 'sohbeti temizleme (cleared_at): yalnız sonrası (b2) = 1', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 1);
reset role;
update public.conversation_members set cleared_at = null, last_read_at = null, joined_at = now() where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :carol;
set role authenticated;
select public._as_user(:carol);
select public._check(10, 'katılmadan önceki mesajlar okunmamış sayılmaz (joined_at)', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 0);
reset role;

-- Silinen mesaj sayılmaz; 100 sınırı.
update public.messages set deleted_at = now() where conversation_id = (select v::uuid from public._ctx where k = 'g') and body = 'a1';
update public.conversation_members set joined_at = now() - interval '1 day' where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :carol;
set role authenticated;
select public._as_user(:carol);
select public._check(11, 'silinen mesaj sayılmaz (7 - 1 = 6)', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 6);
reset role;
insert into public.messages (conversation_id, sender_id, body, created_at)
select (select v::uuid from public._ctx where k = 'g'), :alice, 'x' || i, now() - interval '10 minutes' + i * interval '1 millisecond' from generate_series(1, 150) i;
set role authenticated;
select public._as_user(:carol);
select public._check(12, 'sayı en çok 100 (istemci 99+ gösterir)', (select unread_count from public.group_unread_counts(array[(select v::uuid from public._ctx where k = 'g')])) = 100);
select public._check(13, 'list_my_communities hesaplanan okunmamışı döndürür',
  (select unread_count from public.list_my_communities('member', 30, 0) where id = (select v::uuid from public._ctx where k = 'g')) = 100);
reset role;
update public.conversation_members set joined_at = now() - interval '1 day' where conversation_id = (select v::uuid from public._ctx where k = 'g') and user_id = :alice;
set role authenticated;
select public._as_user(:alice);
select public._check(14, 'list_my_communities: kendi mesajı hariç (alice, bobby''nin 2 mesajı = 2)',
  (select unread_count from public.list_my_communities('member', 30, 0) where id = (select v::uuid from public._ctx where k = 'g')) = 2);
reset role;
select public._check(15, 'group_unread_counts anon''a kapalı',
  not has_function_privilege('anon', 'public.group_unread_counts(uuid[])', 'execute') and has_function_privilege('authenticated', 'public.group_unread_counts(uuid[])', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
