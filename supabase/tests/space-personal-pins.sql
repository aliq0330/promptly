-- Kişisel Space'te konumlu yorum (pin) ve çizim öğeleri (docs/history/461-*): üyeler arası, yazma yalnız RPC, rol kuralları, bildirim.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-personal-pins.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(düzenleyici) carol(görüntüleyici) dave(yabancı) erin(alice tarafından engellenmiş)
--               frank(bağlantı sahibi). Ziyaretçi = boş kimlik.
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
grant select, insert, delete on storage.objects to anon, authenticated;

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
create or replace function public._val(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return r; exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._gt(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text),
  public._val(text), public._g(text), public._gt(text), public._set(text, text), public._q(text) to public;



set role authenticated;
select public._as_user(:alice);
select public._set('S1', public.create_space('Tuval', 'x', 'free', 'private')::text);
select public.invite_space_member(public._g('S1'), 'bobby', 'editor') as v \gset i1_
select public.invite_space_member(public._g('S1'), 'carol', 'viewer') as v \gset i2_
select public._as_user(:bobby);
select public.respond_space_invitation(:'i1_v'::uuid, true);
select public._as_user(:carol);
select public.respond_space_invitation(:'i2_v'::uuid, true);

-- 1-5: sahip / düzenleyici / görüntüleyici yorum yazar
select public._as_user(:alice);
select public.pin_comment_create(public._g('S1'), 'Sahip yorumu', 100, 50) as v \gset p1_
select public._check(1, 'sahip kişisel Space panosuna konumlu yorum yazar',
  public._cnt(format($q$select count(*) from public.space_pin_comments where id = %L and author_id = %L$q$, :'p1_v', :alice)) = 1);
select public._as_user(:carol);
select public.pin_comment_create(public._g('S1'), 'Görüntüleyici yorumu', 10, 10) as v \gset p2_
select public._check(2, 'görüntüleyici de yorum yazar',
  public._cnt(format($q$select count(*) from public.space_pin_comments where id = %L$q$, :'p2_v')) = 1);
select public._check(3, 'üye başkasının yorumunu okur', public._cnt(format($q$select count(*) from public.space_pin_comments where space_id = %L$q$, public._g('S1'))) = 2);
select public._as_user(:dave);
select public._check(4, 'üye olmayan okuyamaz ve yazamaz',
  public._cnt(format($q$select count(*) from public.space_pin_comments where space_id = %L$q$, public._g('S1'))) = 0
  and public._try(format($q$select public.pin_comment_create(%L, 'x', 1, 1)$q$, public._g('S1'))) like '%space_not_found%');
select public._check(5, 'istemci tabloya doğrudan yazamaz',
  public._try(format($q$insert into public.space_pin_comments (space_id, body, x, y, author_id) values (%L, 'x', 1, 1, %L)$q$, public._g('S1'), :dave)) like '%permission denied%');

-- 6-9: yanıt, bildirim, çözme, silme kuralları
select public._as_user(:bobby);
select public.pin_comment_create(public._g('S1'), '@carol bakar mısın?', 200, 80, null, null, null, null, null) as v \gset p3_
select public._check(6, 'bahsedilen üyeye Space bildirimi gider (ekip bildirimi değil)',
  public._q(format($q$select count(*) from public.notifications where recipient_id = %L and dedupe_key = %L$q$, :carol, 'pinm:' || :'p3_v' || ':' || :carol))::int = 1);
select public.pin_comment_create(public._g('S1'), 'yanıt', null, null, null, null, null, :'p1_v'::uuid, null) as v \gset p4_
select public._check(7, 'yanıt kök yorumun yazarına bildirim üretir',
  public._q(format($q$select count(*) from public.notifications where recipient_id = %L and dedupe_key = %L$q$, :alice, 'pinr:' || :'p4_v' || ':' || :alice))::int = 1);
select public._check(8, 'düzenleyici başkasının yorumunu çözer',
  public._try(format($q$select public.pin_comment_set_resolved(%L, true)$q$, :'p2_v')) = 'ok'
  and public._cnt(format($q$select count(*) from public.space_pin_comments where id = %L and resolved_at is not null$q$, :'p2_v')) = 1);
select public._as_user(:carol);
select public._check(9, 'görüntüleyici başkasının yorumunu çözemez ve silemez',
  public._try(format($q$select public.pin_comment_set_resolved(%L, true)$q$, :'p1_v')) like '%space_forbidden%'
  and public._try(format($q$select public.pin_comment_delete(%L)$q$, :'p1_v')) like '%space_forbidden%');
select public._as_user(:bobby);
select public._check(10, 'düzenleyici başkasının yorumunu silemez (yalnız yazan + sahip)',
  public._try(format($q$select public.pin_comment_delete(%L)$q$, :'p1_v')) like '%space_forbidden%');
select public._as_user(:alice);
select public._check(11, 'sahip üyenin yorumunu siler',
  public._try(format($q$select public.pin_comment_delete(%L)$q$, :'p2_v')) = 'ok'
  and public._cnt(format($q$select count(*) from public.space_pin_comments where id = %L$q$, :'p2_v')) = 0);

-- 12-13: arşivli Space yorum kabul etmez; çizim öğesi kişisel Space'e eklenir
select public._check(12, 'çizim öğeleri (çerçeve/metin/şekil) kişisel Space''e eklenir ve onaya takılmaz',
  public._try(format($q$insert into public.space_items (space_id, kind, x, y, w, h, title, data, created_by) values (%L, 'frame', 0, 0, 400, 300, 'Çerçeve', '{}'::jsonb, %L)$q$, public._g('S1'), :alice)) = 'ok'
  and public._try(format($q$insert into public.space_items (space_id, kind, x, y, w, h, body, data, created_by) values (%L, 'text', 10, 10, 200, 60, 'Başlık', '{}'::jsonb, %L)$q$, public._g('S1'), :alice)) = 'ok'
  and public._try(format($q$insert into public.space_items (space_id, kind, x, y, w, h, data, created_by) values (%L, 'shape', 10, 10, 200, 60, '{"shape":"rect"}'::jsonb, %L)$q$, public._g('S1'), :alice)) = 'ok'
  and (select count(*) from public.space_items where space_id = public._g('S1') and rev_state <> 'approved') = 0);
select public._as_user(:carol);
select public._check(13, 'görüntüleyici çizim öğesi ekleyemez',
  public._try(format($q$insert into public.space_items (space_id, kind, x, y, w, h, body, data, created_by) values (%L, 'text', 1, 1, 100, 40, 'x', '{}'::jsonb, %L)$q$, public._g('S1'), :carol)) <> 'ok');
reset role;
select public._as_user(:alice);
update public.spaces set archived_at = now() where id = public._g('S1');
set role authenticated;
select public._check(14, 'arşivli Space yeni yorum kabul etmez',
  public._try(format($q$select public.pin_comment_create(%L, 'x', 1, 1)$q$, public._g('S1'))) like '%space_archived%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
