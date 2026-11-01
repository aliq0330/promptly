-- Beğeni bildiriminde tepki (docs/history/306-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/notification-reaction.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Açık prompt', 'd', 'gece', 'image', 'published', 'public');
insert into public.workflows (id, creator_id, title, status, visibility) values
  ('b0000000-0000-4000-8000-0000000000a1', :alice, 'Açık workflow', 'published', 'public');

set role authenticated;
select public._as_user(:bobby);
insert into public.prompt_likes (user_id, prompt_id, reaction) values (:bobby, 'a0000000-0000-4000-8000-0000000000a1', 'fire');
insert into public.prompt_likes (user_id, workflow_id, reaction) values (:bobby, 'b0000000-0000-4000-8000-0000000000a1', 'clap');
reset role;

select public._check(1, 'ilk tepkide bildirim satırı tepkiyi taşır (prompt: fire, workflow: clap)',
  (select reaction from public.notifications where dedupe_key = 'prompt_like:a0000000-0000-4000-8000-0000000000a1:' || :bobby) = 'fire'
  and (select reaction from public.notifications where dedupe_key = 'workflow_like:b0000000-0000-4000-8000-0000000000a1:' || :bobby) = 'clap');

update public.notifications set is_read = true where dedupe_key like 'prompt_like:%';
set role authenticated;
select public._as_user(:bobby);
update public.prompt_likes set reaction = 'wow' where user_id = :bobby and prompt_id = 'a0000000-0000-4000-8000-0000000000a1';
reset role;

select public._check(2, 'tepki değişince AYNI bildirim yerinde güncellenir (yeni satır yok, okundu işareti bozulmaz)',
  (select count(*) from public.notifications where dedupe_key like 'prompt_like:%') = 1
  and (select reaction from public.notifications where dedupe_key like 'prompt_like:%') = 'wow'
  and (select is_read from public.notifications where dedupe_key like 'prompt_like:%'));

set role authenticated;
select public._as_user(:bobby);
delete from public.prompt_likes where user_id = :bobby and prompt_id = 'a0000000-0000-4000-8000-0000000000a1';
reset role;
select public._check(3, 'beğeni geri alınınca bildirim silinir (önceki davranış korunur)',
  not exists (select 1 from public.notifications where dedupe_key like 'prompt_like:%'));

select public._check(4, 'geçersiz tepki değeri bildirimde reddedilir (CHECK)',
  (select count(*) from (select 1 from pg_constraint where conname = 'notifications_reaction_check') c) = 1);
select public._check(5, 'tetikleyici fonksiyondan EXECUTE kapalı',
  not has_function_privilege('authenticated', 'public.sync_like_notification_reaction()', 'execute')
  and not has_function_privilege('anon', 'public.sync_like_notification_reaction()', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
