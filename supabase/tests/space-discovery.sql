-- Spaces keşfi: `list_public_spaces` (docs/history/214-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/space-discovery.sql  ("FAILED=0" beklenir).
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
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :carol, 'Açık prompt', 'd', 'gece yarısı ejderha', 'image', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :carol, 'Başka prompt', 'd', 'mor gökyüzü', 'image', 'published', 'public');

-- alice dört Space kurar; dördüne de a1'i ekler: herkese açık (P), özel (X, bobby düzenleyici), bağlantılı (L), arşivli herkese açık (A).
set role authenticated;
select public._as_user(:alice);
select public._set('P', public.create_space('Açık', '', 'moodboard', 'public')::text);
select public._set('X', public.create_space('Özel', '', 'moodboard', 'private')::text);
select public._set('L', public.create_space('Bağlantılı', '', 'moodboard', 'link')::text);
select public._set('A', public.create_space('Arşivli', '', 'moodboard', 'public')::text);
select public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000a1', auth.uid())$q$, public._g(k)))
  from (values ('P'), ('X'), ('L'), ('A')) as v(k);
select public._try(format($q$update public.spaces set archived_at = now() where id = %L$q$, public._g('A')));
select public._try(format($q$select public.invite_space_member(%L, 'bobby', 'editor')$q$, public._g('X')));
select public._as_user(:bobby);
select public._try($q$select public.respond_space_invitation((select id from public.space_invitations limit 1), true)$q$);
-- dave'in kendi herkese açık Space'i a2'yi içerir (a1'i değil).
select public._as_user(:dave);
select public._set('D', public.create_space('Dave açık', '', 'free', 'public')::text);
select public._try(format($q$insert into public.space_items (space_id, kind, prompt_id, created_by) values (%L, 'prompt', 'a0000000-0000-4000-8000-0000000000a2', auth.uid())$q$, public._g('D')));
reset role;

select public._check(1, 'kurulum: dört Space + bobby üyeliği',
  (select count(*) from public.spaces where owner_id = :alice) = 4
  and exists (select 1 from public.space_members where space_id = public._g('X') and user_id = :bobby and role = 'editor')
  and (select count(*) from public.space_items where prompt_id = 'a0000000-0000-4000-8000-0000000000a1') = 4);

-- 1. Prompt'a göre
set role authenticated;
select public._as_user(:carol);
select public._check(2, 'prompt yazarı: yalnız herkese açık + arşivsiz Space (özel/bağlantılı/arşivli yok)',
  public._ids($q$select string_agg(title, ',' order by title) from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a1')$q$) = 'Açık');
select public._as_user(:bobby);
select public._check(3, 'özel Space''in ÜYESİ bile onu vitrinde görmez',
  public._ids($q$select string_agg(title, ',' order by title) from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a1')$q$) = 'Açık');
select public._as_user(:alice);
select public._check(4, 'sahip de yalnız herkese açık olanı görür',
  public._ids($q$select string_agg(title, ',' order by title) from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a1')$q$) = 'Açık');
select public._as_user(:erin);
select public._check(5, 'engellenen kullanıcı sahibin Space''ini görmez (RLS, iki yönlü)',
  public._ids($q$select count(*)::text from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a1')$q$) = '0');
reset role;
set role anon;
select public._as_user('');
select public._check(6, 'ziyaretçi çağırabilir ve herkese açık olanı görür; kişisel alanlar boş',
  public._ids($q$select string_agg(title || ':' || coalesce(my_role, '-') || ':' || is_favorite::text || ':' || coalesce(member_count::text, '-'), ',') from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a1')$q$) = 'Açık:-:false:-');
select public._check(7, 'başka prompt yalnız onu içeren Space''i getirir',
  public._ids($q$select string_agg(title, ',') from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a2')$q$) = 'Dave açık');

-- 2. Sahibe göre
select public._check(8, 'sahibe göre: ziyaretçi alice''in yalnız herkese açık Space''ini görür',
  public._ids(format($q$select string_agg(title, ',' order by title) from public.list_public_spaces(%L)$q$, :alice)) = 'Açık');
reset role;
set role authenticated;
select public._as_user(:alice);
select public._check(9, 'kendi profilinde de vitrin: özel/bağlantılı/arşivli girmez; sayılar doğru',
  public._ids(format($q$select string_agg(title || ':' || prompt_count, ',') from public.list_public_spaces(%L)$q$, :alice)) = 'Açık:1');
select public._as_user(:erin);
select public._check(10, 'engellenen kullanıcı sahibe göre listede de hiçbir şey görmez',
  public._ids(format($q$select count(*)::text from public.list_public_spaces(%L)$q$, :alice)) = '0');
select public._as_user(:dave);
select public._check(11, 'süzgeçsiz çağrı boş döner (genel liste list_spaces''tedir)',
  public._ids($q$select count(*)::text from public.list_public_spaces()$q$) = '0');
select public._check(12, 'sahip + prompt birlikte: kesişim',
  public._ids(format($q$select count(*)::text from public.list_public_spaces(%L, 'a0000000-0000-4000-8000-0000000000a2')$q$, :alice)) = '0'
  and public._ids(format($q$select string_agg(title, ',') from public.list_public_spaces(%L, 'a0000000-0000-4000-8000-0000000000a2')$q$, :dave)) = 'Dave açık');

-- 3. Görünürlük değişince anında düşer
reset role;
update public.spaces set visibility = 'private' where id = public._g('P');
set role anon;
select public._as_user('');
select public._check(13, 'Space özele çekilince listeden düşer',
  public._ids($q$select count(*)::text from public.list_public_spaces(null, 'a0000000-0000-4000-8000-0000000000a1')$q$) = '0');
reset role;

select public._check(14, 'fonksiyon SECURITY INVOKER, anon + authenticated EXECUTE var, public yok',
  not (select prosecdef from pg_proc where proname = 'list_public_spaces')
  and has_function_privilege('anon', 'public.list_public_spaces(uuid, uuid, integer, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.list_public_spaces(uuid, uuid, integer, integer)', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
