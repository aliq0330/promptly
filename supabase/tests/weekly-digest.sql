-- Haftalık özet (docs/history/307-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/weekly-digest.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('d0000000-0000-4000-8000-0000000000a1', :alice, 'Alice prompt', 'd', 't', 'image', 'published', 'public');
-- alice'in promptuna: bobby 1 tepki + 1 yorum, bobby ve carol kopyalama, carol takip; alice KENDİ promptuna da yazar (sayılmamalı)
insert into public.prompt_likes (user_id, prompt_id, reaction) values (:bobby, 'd0000000-0000-4000-8000-0000000000a1', 'fire');
insert into public.prompt_comments (author_id, prompt_id, body) values (:bobby, 'd0000000-0000-4000-8000-0000000000a1', 'güzel');
insert into public.prompt_comments (author_id, prompt_id, body) values (:alice, 'd0000000-0000-4000-8000-0000000000a1', 'teşekkürler');
insert into public.prompt_copy_events (prompt_id, user_id, day) values
  ('d0000000-0000-4000-8000-0000000000a1', :bobby, (now() at time zone 'utc')::date - 1),
  ('d0000000-0000-4000-8000-0000000000a1', :carol, (now() at time zone 'utc')::date - 1);
insert into public.follows (follower_id, following_id) values (:carol, :alice);

create temp table _r (k text, v int);
grant all on _r to public;

set role authenticated;
select public._as_user(:alice);
insert into _r select 'first', public.dispatch_my_weekly_digest();
insert into _r select 'second', public.dispatch_my_weekly_digest();
select public._as_user(:carol);   -- yayınlanmış promptu yok → bildirim yok
insert into _r select 'carol', public.dispatch_my_weekly_digest();
select public._as_user('');
insert into _r select 'anon', public.dispatch_my_weekly_digest();
reset role;

select public._check(1, 'ilk çağrı 1 bildirim üretir, aynı hafta ikinci çağrı üretmez', (select v from _r where k = 'first') = 1 and (select v from _r where k = 'second') = 0
  and (select count(*) from public.notifications where recipient_id = :alice::uuid and dedupe_key like 'weekly:%') = 1);
select public._check(2, 'cümle yalnız gerçek sayıları yazar; kendi yorumun sayılmaz',
  (select message from public.notifications where recipient_id = :alice::uuid and dedupe_key like 'weekly:%') = 'Haftalık özet: 2 kopyalama, 1 tepki, 1 yorum, 1 yeni takipçi.');
select public._check(3, 'bildirim türü system, adres /insights, aktör yok',
  exists (select 1 from public.notifications where recipient_id = :alice::uuid and dedupe_key like 'weekly:%' and type = 'system' and target_href = '/insights' and actor_id is null));
select public._check(4, 'hareketi olmayan kişiye bildirim yazılmaz ama hafta kayda geçer (tekrar hesaplanmaz)',
  (select v from _r where k = 'carol') = 0 and not exists (select 1 from public.notifications where recipient_id = :carol::uuid)
  and exists (select 1 from public.weekly_digest_sent where user_id = :carol::uuid));
select public._check(5, 'ziyaretçi 0 döner, hiçbir şey yazılmaz', (select v from _r where k = 'anon') = 0);
-- bildirimi sil: aynı hafta yeniden ÜRETİLMEZ (303'teki sorun)
delete from public.notifications where recipient_id = :alice::uuid and dedupe_key like 'weekly:%';
set role authenticated;
select public._as_user(:alice);
insert into _r select 'third', public.dispatch_my_weekly_digest();
reset role;
select public._check(6, 'bildirim silinse de aynı hafta yeniden üretilmez', (select v from _r where k = 'third') = 0 and not exists (select 1 from public.notifications where recipient_id = :alice::uuid and dedupe_key like 'weekly:%'));
select public._check(7, 'tablo istemciye kapalı, fonksiyon yalnız oturumluya açık',
  not has_table_privilege('authenticated', 'public.weekly_digest_sent', 'select')
  and not has_function_privilege('anon', 'public.dispatch_my_weekly_digest()', 'execute')
  and has_function_privilege('authenticated', 'public.dispatch_my_weekly_digest()', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
