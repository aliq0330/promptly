-- Ekip kütüphanesi: onay incelemesindeki "Örnek çıktı" (docs/history/355-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-review-samples.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank')) as u(id, name);

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
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text) to public;

-- Öğe kurar (süper kullanıcı gözüyle; yazar creator).
create or replace function public._mkitem(p_title text, p_body text, p_creator uuid, p_group uuid default null) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  insert into public.space_items (space_id, kind, title, body, is_draft, created_by, group_id)
  values (public._g('LIB'), 'prompt', p_title, p_body, true, p_creator, p_group) returning id into v;
  return v;
end $$;
grant execute on function public._mkitem(text, text, uuid, uuid) to public;
create or replace function public._st(p_item uuid) returns text language sql security definer as $$
  select public._space_item_state(approved_at, deprecated_at, review_requested_at) from public.space_items where id = p_item $$;
grant execute on function public._st(uuid) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici, dave üye).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public._ctx select 'LIB', library_space_id::text from public.teams where id = public._g('T');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member');
select public._mkitem('Sosyal başlık', 'başlık yaz', :carol) as v \gset a_
insert into public._ctx values ('A', :'a_v');

set role authenticated;
select public._as_user(:carol);
select public._check(1, 'düzenleyici örnek çıktı yazar', public._try(format($$select public.space_set_review_sample(%L, %L)$$, public._g('A'), E'örnek bir\nörnek iki')) = 'ok');
select public.space_request_review(public._g('A')) as v \gset rq_
reset role;
select public._check(2, 'örnek çıktı kaydı var', (select count(*) from public.space_item_review_samples where item_id = public._g('A')) = 1);

set role authenticated;
select public._as_user(:bobby);
select public.space_item_review(public._g('A'))::text as v \gset r3_
reset role;
select public._check(3, 'inceleme yanıtı örneği ve isteyen adını taşır', (:'r3_v'::jsonb -> 'sample' ->> 'body') like 'örnek bir%' and (:'r3_v'::jsonb -> 'item' ->> 'requested_by_name') is not null);

set role authenticated;
select public._as_user(:dave);
select public._check(4, 'üye örnek çıktı yazamaz', public._try(format($$select public.space_set_review_sample(%L, 'x')$$, public._g('A'))) like '%space_%');
select public._check(5, 'istemci tabloyu doğrudan okuyamaz', public._try('select * from public.space_item_review_samples') <> 'ok');
reset role;

set role authenticated;
select public._as_user(:carol);
select public._check(6, 'boş metin örneği siler', public._try(format($$select public.space_set_review_sample(%L, '  ')$$, public._g('A'))) = 'ok');
reset role;
select public._check(7, 'silindi', (select count(*) from public.space_item_review_samples where item_id = public._g('A')) = 0);

select n, name, ok, detail from public._results order by n;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
