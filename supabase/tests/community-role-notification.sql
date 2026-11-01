-- Rol değişikliği bildirimi (docs/history/305-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-role-notification.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:dave,'dave')) as u(id, name);

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
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._g(text) to public;

set role authenticated;
select public._as_user(:alice);
create temp table _c as select public.create_chat_group('Rol Grubu', null, 'private', null, 50, array[:dave]::uuid[]) as j;
reset role;
insert into public._ctx select 'g', j->>'group_id' from _c;
insert into public.conversation_members (conversation_id, user_id, role) values (public._g('g'), :dave::uuid, 'member')
  on conflict (conversation_id, user_id) do update set role = 'member';

set role authenticated;
select public._as_user(:alice);
select public.set_chat_group_member_role(public._g('g'), :dave, 'moderator');
select public.set_chat_group_member_role(public._g('g'), :dave, 'moderator');
select public.set_chat_group_member_role(public._g('g'), :dave, 'admin');
select public.set_chat_group_member_role(public._g('g'), :dave, 'member');
reset role;

select public._check(1, 'rol değişince kişiye bildirim yazılır (moderatör, yönetici, üye: 3 satır; aynı role tekrar = değişiklik yok)',
  (select count(*) from public.notifications where recipient_id = :dave::uuid and dedupe_key like 'crole:%') = 3);
select public._check(2, 'cümleler istemci kalıplarıyla birebir (moderatör / yönetici / üye)',
  exists (select 1 from public.notifications where recipient_id = :dave::uuid and message = '"Rol Grubu" topluluğunda rolün moderatör oldu.')
  and exists (select 1 from public.notifications where recipient_id = :dave::uuid and message = '"Rol Grubu" topluluğunda rolün yönetici oldu.')
  and exists (select 1 from public.notifications where recipient_id = :dave::uuid and message = '"Rol Grubu" topluluğunda rolün üye olarak değiştirildi.'));
select public._check(3, 'bildirim topluluk sayfasına gider ve actor işlemi yapandır',
  (select bool_and(target_href = '/communities/local?id=' || public._g('g') and actor_id = :alice::uuid) from public.notifications where recipient_id = :dave::uuid and dedupe_key like 'crole:%'));
select public._check(4, 'işlemi yapana bildirim yazılmaz',
  not exists (select 1 from public.notifications where recipient_id = :alice::uuid and dedupe_key like 'crole:%'));
select public._check(5, 'EXECUTE izinleri korunur (anon çağıramaz, authenticated çağırabilir)',
  not has_function_privilege('anon', 'public.set_chat_group_member_role(uuid,uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_chat_group_member_role(uuid,uuid,text)', 'execute'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
