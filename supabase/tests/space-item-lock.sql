-- Space nesne kilidi (docs/history/307-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-item-lock.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set sp 'e0000000-0000-4000-8000-0000000000a1'
\set i1 'e1000000-0000-4000-8000-0000000000a1'
\set i2 'e1000000-0000-4000-8000-0000000000a2'

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
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

insert into public.spaces (id, owner_id, title, visibility) values (:'sp', :alice, 'Kilit testi', 'private');
insert into public.space_members (space_id, user_id, role) values (:'sp', :alice, 'owner') on conflict do nothing;
insert into public.space_items (id, space_id, kind, x, y, title, created_by) values
  (:'i1', :'sp', 'note', 10, 20, 'Not 1', :alice),
  (:'i2', :'sp', 'note', 50, 60, 'Not 2', :alice);

set role authenticated;
select public._as_user(:alice);
select public._check(1, 'kilitleme serbest', public._try(format('update public.space_items set locked = true where id = %L', :'i1')) = 'ok');
select public._check(2, 'kilitliyi taşımak reddedilir', public._try(format('update public.space_items set x = 99 where id = %L', :'i1')) like '%space_item_locked%');
select public._check(3, 'kilitlinin metnini / boyutunu değiştirmek reddedilir',
  public._try(format('update public.space_items set title = %L where id = %L', 'Yeni', :'i1')) like '%space_item_locked%'
  and public._try(format('update public.space_items set w = 300 where id = %L', :'i1')) like '%space_item_locked%');
select public._check(4, 'aynı değeri yeniden yazmak (toplu kayıt) sorun değil',
  public._try(format('update public.space_items set x = 10, y = 20 where id = %L', :'i1')) = 'ok'
  and public._try(format('select public.space_save_layout(%L, %L::jsonb)', :'sp', format('[{"id":"%s","x":10,"y":20}]', :'i1'))) = 'ok');
select public._check(5, 'toplu kayıt kilitliyi GERÇEKTEN taşımaya kalkarsa reddedilir',
  public._try(format('select public.space_save_layout(%L, %L::jsonb)', :'sp', format('[{"id":"%s","x":77}]', :'i1'))) like '%space_item_locked%');
select public._check(6, 'kilitliyi silmek reddedilir', public._try(format('delete from public.space_items where id = %L', :'i1')) like '%space_item_locked%');
select public._check(7, 'kilitsiz komşu nesne serbestçe değişir', public._try(format('update public.space_items set x = 5 where id = %L', :'i2')) = 'ok');
select public._check(8, 'kilit açarken başka alan değişirse reddedilir; yalnız açmak serbest',
  public._try(format('update public.space_items set locked = false, x = 1 where id = %L', :'i1')) like '%space_item_locked%'
  and public._try(format('update public.space_items set locked = false where id = %L', :'i1')) = 'ok');
select public._check(9, 'kilit açılınca taşınabilir ve silinebilir',
  public._try(format('update public.space_items set x = 33 where id = %L', :'i1')) = 'ok'
  and public._try(format('delete from public.space_items where id = %L', :'i1')) = 'ok');
reset role;

-- kilitli nesneli Space silinebilir (kaskad geçer)
update public.space_items set locked = true where id = :'i2';
set role authenticated;
select public._as_user(:alice);
create temp table _del as select public._try(format('delete from public.spaces where id = %L', :'sp')) as res;
reset role;
select public._check(10, 'kilitli nesne içeren Space silinebilir (kaskad kilitten etkilenmez)', (select res from _del) = 'ok' and not exists (select 1 from public.space_items where id = :'i2'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
