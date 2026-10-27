-- Workflow'un Space panosunda akış çerçevesi: `space_items.flow_show_*` + bağlı Space araması (docs/history/261-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-workflow-flow.sql  ("FAILED=0" beklenir).
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
  ('b0000000-0000-4000-8000-0000000000b1', :alice, 'Açık workflow', '', 'published', 'public'),
  ('b0000000-0000-4000-8000-0000000000b2', :alice, 'Özel workflow', '', 'published', 'private');

set role authenticated;
select public._as_user(:alice);
select public._set('P', public.create_space('Açık', '', 'moodboard', 'public')::text);
select public._set('X', public.create_space('Özel', '', 'moodboard', 'private')::text);
select public._try(format($q$insert into public.space_items (space_id, kind, content_type, content_id, x, y, w, h, created_by) values (%L, 'content', 'workflow', 'b0000000-0000-4000-8000-0000000000b1', 0, 0, 900, 500, auth.uid())$q$, public._g('P')));
select public._try(format($q$insert into public.space_items (space_id, kind, content_type, content_id, x, y, w, h, flow_show_relations, created_by) values (%L, 'content', 'workflow', 'b0000000-0000-4000-8000-0000000000b1', 0, 0, 900, 500, false, auth.uid())$q$, public._g('X')));
select public._try(format($q$select public.invite_space_member(%L, 'bobby', 'editor')$q$, public._g('X')));
select public._as_user(:bobby);
select public._try($q$select public.respond_space_invitation((select id from public.space_invitations limit 1), true)$q$);
reset role;

select public._check(1, 'kurulum: iki Space, iki workflow öğesi',
  (select count(*) from public.space_items where content_type = 'workflow') = 2);
select public._check(2, 'katmanlar varsayılan AÇIK; açıkça kapatılan kapalı kalır',
  (select flow_show_io and flow_show_links and flow_show_relations from public.space_items where space_id = public._g('P'))
  and (select flow_show_io and flow_show_links and not flow_show_relations from public.space_items where space_id = public._g('X')));

-- Yazma: sahip ve düzenleyici değiştirebilir, yabancı ve ziyaretçi değiştiremez.
set role authenticated;
select public._as_user(:alice);
select public._check(3, 'sahip katmanı kapatabilir',
  public._ids(format($q$with u as (update public.space_items set flow_show_io = false where space_id = %L and kind = 'content' returning 1) select count(*)::text from u$q$, public._g('P'))) = '1');
select public._as_user(:bobby);
select public._check(4, 'özel Space''te düzenleyici katmanı değiştirebilir',
  public._ids(format($q$with u as (update public.space_items set flow_show_links = false where space_id = %L and kind = 'content' returning 1) select count(*)::text from u$q$, public._g('X'))) = '1');
select public._as_user(:dave);
select public._check(5, 'yabancı herkese açık Space''in katmanını değiştiremez (0 satır)',
  public._ids(format($q$with u as (update public.space_items set flow_show_io = true where space_id = %L and kind = 'content' returning 1) select count(*)::text from u$q$, public._g('P'))) = '0');
select public._check(6, 'yabancı herkese açık Space''te öğeyi ve katmanları okur',
  public._ids(format($q$select flow_show_io::text || ':' || flow_show_links::text from public.space_items where space_id = %L and kind = 'content'$q$, public._g('P'))) = 'false:true');
select public._check(7, 'yabancı özel Space''in öğesini görmez',
  public._ids(format($q$select count(*)::text from public.space_items where space_id = %L$q$, public._g('X'))) = '0');

-- Workflow sayfasındaki "bağlı Space'ler" sorgusu: içerik + Space; her okuyucu yalnız kendi görebildiğini görür.
select public._check(8, 'yabancı: workflow''un yalnız herkese açık Space''i görünür',
  public._ids($q$select string_agg(s.title, ',' order by s.title) from public.space_items i join public.spaces s on s.id = i.space_id where i.kind = 'content' and i.content_type = 'workflow' and i.content_id = 'b0000000-0000-4000-8000-0000000000b1'$q$) = 'Açık');
select public._as_user(:bobby);
select public._check(9, 'özel Space''in üyesi ikisini de görür',
  public._ids($q$select string_agg(s.title, ',' order by s.title) from public.space_items i join public.spaces s on s.id = i.space_id where i.kind = 'content' and i.content_type = 'workflow' and i.content_id = 'b0000000-0000-4000-8000-0000000000b1'$q$) = 'Açık,Özel');
select public._as_user(:erin);
select public._check(10, 'engellenen kullanıcı sahibin Space''ini görmez',
  public._ids($q$select count(*)::text from public.space_items where kind = 'content' and content_type = 'workflow'$q$) = '0');
reset role;
set role anon;
select public._as_user('');
select public._check(11, 'ziyaretçi herkese açık Space''in workflow öğesini okur',
  public._ids($q$select count(*)::text from public.space_items where kind = 'content' and content_type = 'workflow'$q$) = '1');
reset role;

-- Kaynak okunabilirliği: özel workflow'u yabancı OKUYAMAZ (öğe satırı görünse bile pano "erişilemiyor" çizer).
set role authenticated;
select public._as_user(:alice);
select public._check(12, 'sahip özel workflow''u herkese açık Space''e ekleyebilir',
  public._try(format($q$insert into public.space_items (space_id, kind, content_type, content_id, x, y, w, h, created_by) values (%L, 'content', 'workflow', 'b0000000-0000-4000-8000-0000000000b2', 0, 600, 900, 500, auth.uid())$q$, public._g('P'))) = 'ok');
select public._as_user(:dave);
select public._check(13, 'yabancı özel workflow''un içeriğini okuyamaz',
  public._ids($q$select count(*)::text from public.workflows where id = 'b0000000-0000-4000-8000-0000000000b2'$q$) = '0');
select public._as_user(:alice);
select public._check(14, 'aynı workflow aynı Space''e iki kez eklenemez',
  public._try(format($q$insert into public.space_items (space_id, kind, content_type, content_id, x, y, w, h, created_by) values (%L, 'content', 'workflow', 'b0000000-0000-4000-8000-0000000000b1', 0, 1200, 900, 500, auth.uid())$q$, public._g('P'))) <> 'ok');
reset role;

select public._check(15, 'sütunlar ekleyici: mevcut satırların hepsi geçerli ve NOT NULL',
  (select count(*) from public.space_items where flow_show_io is null or flow_show_links is null or flow_show_relations is null) = 0);

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
