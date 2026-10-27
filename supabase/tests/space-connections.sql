-- Space panosu okları (`space_connections`) + workflow'dan aktarılan nesnelerin kaynağı (`space_items.source_*`) (docs/history/262-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-connections.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(alice'in özel Space'inde düzenleyici) carol(prompt yazarı) dave(yabancı)
--               erin(alice tarafından engellenmiş). Ziyaretçi = boş kimlik.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin')) as u(id, name);

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
create or replace function public._ids(q text) returns text language plpgsql as $$
declare r text;
begin execute q into r; return coalesce(r, ''); exception when others then return 'ERR:' || sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._set(key text, val text) returns void language sql as
  $$ insert into public._ctx values (key, val) on conflict (k) do update set v = excluded.v $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._ids(text),
  public._g(text), public._set(text, text) to public;


insert into public.blocks (blocker_id, blocked_id) values (:alice, :erin);
insert into public.workflows (id, creator_id, title, description, status, visibility) values
  ('b0000000-0000-4000-8000-0000000000b1', :alice, 'Açık workflow', '', 'published', 'public');

set role authenticated;
select public._as_user(:alice);
select public._set('P', public.create_space('Açık', '', 'moodboard', 'public')::text);
select public._set('Q', public.create_space('Diğer', '', 'moodboard', 'public')::text);
select public._try(format($q$select public.invite_space_member(%L, 'bobby', 'viewer')$q$, public._g('P')));
select public._set('A', gen_random_uuid()::text);
select public._set('B', gen_random_uuid()::text);
select public._set('C', gen_random_uuid()::text);
select public._set('N', gen_random_uuid()::text);
select public._set('Z', gen_random_uuid()::text);
insert into public.space_items (id, space_id, kind, title, x, y, w, h, created_by) values
  (public._g('A'), public._g('P'), 'note', 'A', 0, 0, 200, 100, auth.uid()),
  (public._g('B'), public._g('P'), 'note', 'B', 400, 0, 200, 100, auth.uid()),
  (public._g('C'), public._g('P'), 'note', 'C', 800, 0, 200, 100, auth.uid()),
  (public._g('Z'), public._g('Q'), 'note', 'Z', 0, 0, 200, 100, auth.uid());
insert into public.space_items (id, space_id, kind, title, is_private, x, y, w, h, created_by) values
  (public._g('N'), public._g('P'), 'note', 'Gizli', true, 0, 300, 200, 100, auth.uid());
select public._as_user(:bobby);
select public._try($q$select public.respond_space_invitation((select id from public.space_invitations limit 1), true)$q$);
select public._as_user(:alice);

-- 1. Yazma
select public._set('r1', public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, auth.uid())$q$, public._g('P'), public._g('A'), public._g('B'))));
select public._check(1, 'sahip iki öğe arasında bağlantı kurar; varsayılanlar',
  (select v from public._ctx where k = 'r1') = 'ok'
  and (select label = '' and line_style = 'solid' and arrow = 'end' and route = 'curve' and color = 'primary' from public.space_connections where from_item_id = public._g('A')));
select public._check(2, 'aynı çift ikinci kez bağlanamaz',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, auth.uid())$q$, public._g('P'), public._g('A'), public._g('B'))) <> 'ok');
select public._check(3, 'kendine bağlantı reddedilir',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, auth.uid())$q$, public._g('P'), public._g('A'), public._g('A'))) <> 'ok');
select public._check(4, 'başka Space''in öğesine bağlantı reddedilir',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, auth.uid())$q$, public._g('P'), public._g('A'), public._g('Z'))) <> 'ok');
select public._check(5, 'geçersiz stil / ok / renk / uzun etiket reddedilir',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, line_style, created_by) values (%L, %L, %L, 'wavy', auth.uid())$q$, public._g('P'), public._g('B'), public._g('C'))) <> 'ok'
  and public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, arrow, created_by) values (%L, %L, %L, 'up', auth.uid())$q$, public._g('P'), public._g('B'), public._g('C'))) <> 'ok'
  and public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, color, created_by) values (%L, %L, %L, 'pink', auth.uid())$q$, public._g('P'), public._g('B'), public._g('C'))) <> 'ok'
  and public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, label, created_by) values (%L, %L, %L, repeat('x', 81), auth.uid())$q$, public._g('P'), public._g('B'), public._g('C'))) <> 'ok');
select public._check(6, 'etiket + stil + renk ile bağlantı',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, label, line_style, arrow, route, color, created_by) values (%L, %L, %L, 'sonra', 'dashed', 'both', 'elbow', 'secondary', auth.uid())$q$, public._g('P'), public._g('B'), public._g('C'))) = 'ok');
select public._check(7, 'created_by başkası olamaz',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, %L)$q$, public._g('P'), public._g('C'), public._g('A'), :bobby)) <> 'ok');
select public._set('r8', public._try(format($q$update public.space_connections set label = 'yeni', arrow = 'none' where from_item_id = %L and to_item_id = %L$q$, public._g('A'), public._g('B'))));
select public._check(8, 'güncelleme: etiket + ok değişir',
  (select v from public._ctx where k = 'r8') = 'ok'
  and (select label = 'yeni' and arrow = 'none' and updated_at >= created_at from public.space_connections where from_item_id = public._g('A') and to_item_id = public._g('B')));
select public._check(9, 'Space değiştirilemez',
  public._try(format($q$update public.space_connections set space_id = %L where from_item_id = %L$q$, public._g('Q'), public._g('A'))) <> 'ok');
select public._set('r10a', public._try(format($q$update public.space_connections set from_item_id = to_item_id, to_item_id = from_item_id where from_item_id = %L and to_item_id = %L$q$, public._g('A'), public._g('B'))));
select public._set('r10b', public._try(format($q$update public.space_connections set to_item_id = %L where from_item_id = %L and to_item_id = %L$q$, public._g('Z'), public._g('B'), public._g('C'))));
select public._check(10, 'uçlar aynı Space''te kalmak şartıyla çevrilebilir; başka Space''e çevrilemez',
  (select v from public._ctx where k = 'r10a') = 'ok'
  and (select v from public._ctx where k = 'r10b') <> 'ok'
  and exists (select 1 from public.space_connections where from_item_id = public._g('B') and to_item_id = public._g('A')));

-- 2. Yetki: izleyici / yabancı / ziyaretçi yazamaz
select public._as_user(:bobby);
select public._check(11, 'izleyici bağlantı ekleyemez / silemez',
  public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, auth.uid())$q$, public._g('P'), public._g('C'), public._g('B'))) <> 'ok'
  and public._ids($q$with d as (delete from public.space_connections returning 1) select count(*)::text from d$q$) = '0');
select public._as_user(:dave);
select public._check(12, 'yabancı herkese açık Space''te bağlantıları OKUR ama yazamaz',
  public._ids(format($q$select count(*)::text from public.space_connections where space_id = %L$q$, public._g('P'))) = '2'
  and public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, created_by) values (%L, %L, %L, auth.uid())$q$, public._g('P'), public._g('C'), public._g('A'))) <> 'ok'
  and public._ids(format($q$with u as (update public.space_connections set label = 'x' where space_id = %L returning 1) select count(*)::text from u$q$, public._g('P'))) = '0');
select public._as_user(:erin);
select public._check(13, 'engellenen kullanıcı hiç bağlantı görmez',
  public._ids($q$select count(*)::text from public.space_connections$q$) = '0');
reset role;
set role anon;
select public._as_user('');
select public._check(14, 'ziyaretçi herkese açık Space''in bağlantılarını okur, yazamaz',
  public._ids($q$select count(*)::text from public.space_connections$q$) = '2'
  and public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id) values (%L, %L, %L)$q$, public._g('P'), public._g('C'), public._g('A'))) <> 'ok');
reset role;

-- 3. Gizli not: bağlantısı da yalnız üyeye görünür
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, label, created_by) values (%L, %L, %L, 'gizli ok', auth.uid())$q$, public._g('P'), public._g('N'), public._g('A')));
select public._check(15, 'üye gizli notun bağlantısını görür',
  public._ids(format($q$select count(*)::text from public.space_connections where space_id = %L and label = 'gizli ok'$q$, public._g('P'))) = '1');
select public._as_user(:dave);
select public._check(16, 'üye olmayan gizli notun bağlantısını GÖRMEZ (etiket sızmaz)',
  public._ids(format($q$select count(*)::text from public.space_connections where space_id = %L and label = 'gizli ok'$q$, public._g('P'))) = '0');
reset role;
set role anon;
select public._as_user('');
select public._check(17, 'ziyaretçi de gizli notun bağlantısını görmez',
  public._ids($q$select count(*)::text from public.space_connections where label = 'gizli ok'$q$) = '0');
reset role;

-- 4. Silme zinciri
set role authenticated;
select public._as_user(:alice);
select public._set('r18', public._try(format($q$delete from public.space_items where id = %L$q$, public._g('C'))));
select public._check(18, 'öğe silinince bağlantıları da silinir',
  (select v from public._ctx where k = 'r18') = 'ok'
  and (select count(*) from public.space_connections where from_item_id = public._g('C') or to_item_id = public._g('C')) = 0
  and (select count(*) from public.space_connections where label = 'gizli ok') = 1);
reset role;

-- 5. Workflow kaynağı: space_items.source_*
set role authenticated;
select public._as_user(:alice);
select public._check(19, 'workflow kaynaklı adım kartı (note) / prompt / görsel rolü doğru türde eklenir',
  public._try(format($q$insert into public.space_items (space_id, kind, title, x, y, w, h, source_workflow_id, source_step_id, source_role, source_step_no, created_by) values (%L, 'note', 'Adım 1', 0, 600, 240, 140, 'b0000000-0000-4000-8000-0000000000b1', gen_random_uuid(), 'step', 1, auth.uid())$q$, public._g('P'))) = 'ok');
select public._check(20, 'rol türle uyuşmazsa (görsel rolü note) reddedilir',
  public._try(format($q$insert into public.space_items (space_id, kind, title, x, y, w, h, source_workflow_id, source_role, created_by) values (%L, 'note', 'x', 0, 800, 240, 140, 'b0000000-0000-4000-8000-0000000000b1', 'image', auth.uid())$q$, public._g('P'))) <> 'ok');
select public._check(21, 'workflow olmadan rol / adım yazılamaz; rolsüz workflow reddedilir; olmayan workflow reddedilir',
  public._try(format($q$insert into public.space_items (space_id, kind, title, x, y, w, h, source_role, created_by) values (%L, 'note', 'x', 0, 800, 240, 140, 'step', auth.uid())$q$, public._g('P'))) <> 'ok'
  and public._try(format($q$insert into public.space_items (space_id, kind, title, x, y, w, h, source_workflow_id, created_by) values (%L, 'note', 'x', 0, 800, 240, 140, 'b0000000-0000-4000-8000-0000000000b1', auth.uid())$q$, public._g('P'))) <> 'ok'
  and public._try(format($q$insert into public.space_items (space_id, kind, title, x, y, w, h, source_workflow_id, source_role, created_by) values (%L, 'note', 'x', 0, 800, 240, 140, gen_random_uuid(), 'step', auth.uid())$q$, public._g('P'))) <> 'ok');
select public._check(22, 'kaynak sütunları sonradan değiştirilemez',
  public._try(format($q$update public.space_items set source_step_no = 7 where space_id = %L and source_role = 'step'$q$, public._g('P'))) <> 'ok'
  and public._try(format($q$update public.space_items set source_workflow_id = gen_random_uuid() where space_id = %L and source_role = 'step'$q$, public._g('P'))) <> 'ok');
select public._check(23, 'adım kartı not gibi düzenlenebilir (başlık/gövde)',
  public._try(format($q$update public.space_items set title = 'Yeni başlık', body = 'g' where space_id = %L and source_role = 'step'$q$, public._g('P'))) = 'ok');
select public._set('r24a', public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, source_role, created_by) values (%L, %L, %L, 'flow', auth.uid())$q$, public._g('P'), public._g('B'), public._g('N'))));
select public._set('r24b', public._try(format($q$insert into public.space_connections (space_id, from_item_id, to_item_id, source_workflow_id, source_role, created_by) values (%L, %L, %L, 'b0000000-0000-4000-8000-0000000000b1', 'flow', auth.uid())$q$, public._g('P'), public._g('B'), public._g('N'))));
select public._check(24, 'workflow kaynaklı bağlantı: rol + workflow birlikte gerekir',
  (select v from public._ctx where k = 'r24a') <> 'ok' and (select v from public._ctx where k = 'r24b') = 'ok');
reset role;

-- workflow silinince nesneler kalır (source_workflow_id null), bağlantı da kalır
delete from public.workflows where id = 'b0000000-0000-4000-8000-0000000000b1';
select public._check(25, 'workflow silinince nesne ve bağlantı normal öğe olarak kalır',
  (select count(*) from public.space_items where title = 'Yeni başlık' and source_workflow_id is null and source_role = 'step') = 1
  and (select count(*) from public.space_connections where source_role = 'flow' and source_workflow_id is null) = 1);
select public._check(26, 'tetikleyici fonksiyonlarına istemci EXECUTE verilmez; yardımcı anon + authenticated''a açık',
  not has_function_privilege('authenticated', 'public.space_items_source_guard()', 'execute')
  and not has_function_privilege('authenticated', 'public.space_connections_before_write()', 'execute')
  and not has_function_privilege('anon', 'public.space_connections_after_change()', 'execute')
  and has_function_privilege('anon', 'public._space_connection_touches_private(uuid, uuid)', 'execute'));
select public._check(27, 'anon yazma yetkisi yok',
  not has_table_privilege('anon', 'public.space_connections', 'insert') and not has_table_privilege('anon', 'public.space_connections', 'update') and not has_table_privilege('anon', 'public.space_connections', 'delete'));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
