-- 20261112100000: yeni 'private' topluluk girişi kapalı; mevcut private satırlar bozulmaz. Çalıştırma: supabase/tests/run-local.sh supabase/tests/chat-groups-no-new-private.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''

insert into auth.users (id, email, raw_user_meta_data)
values (:alice, 'alice@test.dev', jsonb_build_object('username', 'alice', 'display_name', 'Alice'));

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;

-- Yerel paket fixture'lar için ayarı açık tutar; canlı davranışı için kapat.
set promptly.allow_private_community = 'off';
set role authenticated;
select public._as_user(:alice);

select public._check(1, 'create_chat_group private reddedilir', public._try($q$select public.create_chat_group('Gizli', null, 'private', null, 50)$q$) like '%invalid_visibility%');
create temp table _g as select public.create_chat_group('Acik', null, 'public', null, 50) as j;
select public._check(2, 'public grup oluşur', (select j->>'group_id' from _g) is not null);
select public._check(3, 'set_chat_group_visibility public -> private reddedilir',
  public._try(format($q$select public.set_chat_group_visibility(%L, 'private')$q$, (select j->>'group_id' from _g))) like '%invalid_visibility%');
select public.set_chat_group_visibility((select (j->>'group_id')::uuid from _g), 'restricted');
select public._check(4, 'public -> restricted serbest', (select visibility from public.chat_groups where id = (select (j->>'group_id')::uuid from _g)) = 'restricted');
reset role;

-- Eski bir private satır (ayar açıkken kuruldu) bozulmaz
set promptly.allow_private_community = 'on';
set role authenticated;
select public._as_user(:alice);
create temp table _old as select public.create_chat_group('Eski', null, 'private', null, 50) as j;
reset role;
set promptly.allow_private_community = 'off';
update public.chat_groups set name = 'Eski 2' where id = (select (j->>'group_id')::uuid from _old);
select public._check(5, 'mevcut private satırın adı güncellenebilir', (select name from public.chat_groups where id = (select (j->>'group_id')::uuid from _old)) = 'Eski 2');
update public.chat_groups set visibility = 'private' where id = (select (j->>'group_id')::uuid from _old);
select public._check(6, 'private -> private (değişmeyen) engellenmez', (select visibility from public.chat_groups where id = (select (j->>'group_id')::uuid from _old)) = 'private');
update public.chat_groups set visibility = 'restricted' where id = (select (j->>'group_id')::uuid from _old);
select public._check(7, 'private -> restricted serbest', (select visibility from public.chat_groups where id = (select (j->>'group_id')::uuid from _old)) = 'restricted');

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n || ' | ' || name || ' | ' || detail from public._results where not ok order by n;
