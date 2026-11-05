-- Workflow ↔ Space bağı tek RPC'den okunur + aktarım tek işlemde yazılır (docs/history/339-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/workflow-space-links.sql  ("FAILED=0" beklenir).
-- Kullanıcılar: alice(sahip) bobby(alice'in özel Space'inde düzenleyici) dave(yabancı) erin(alice tarafından engellenmiş). Ziyaretçi = boş kimlik.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set w1 '''b0000000-0000-4000-8000-0000000000b1'''
\set w2 '''b0000000-0000-4000-8000-0000000000b2'''
\set w3 '''b0000000-0000-4000-8000-0000000000b3'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:dave,'dave'),(:erin,'erin')) as u(id, name);

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
  (:w1, :alice, 'Akış bir', '', 'published', 'public'),
  (:w2, :alice, 'Akış iki', '', 'published', 'public'),
  (:w3, :alice, 'Akış üç', '', 'published', 'public'),
  ('b0000000-0000-4000-8000-0000000000b4', :alice, 'Akış dört', '', 'published', 'public');

set role authenticated;
select public._as_user(:alice);
select public._set('P', public.create_space('Açık', '', 'moodboard', 'public')::text);
select public._set('X', public.create_space('Özel', '', 'moodboard', 'private')::text);
select public._try(format($q$select public.invite_space_member(%L, 'bobby', 'editor')$q$, public._g('X')));
select public._as_user(:bobby);
select public._try($q$select public.respond_space_invitation((select id from public.space_invitations limit 1), true)$q$);
reset role;

-- 1) Atomik aktarım: çerçeve + 2 adım kartı + 1 ok tek çağrıda.
set role authenticated;
select public._as_user(:alice);
select public._set('R1', public.space_apply_workflow_plan(
  public._g('P'),
  jsonb_build_object('id', 'a0000000-0000-4000-8000-0000000000a1', 'name', 'Akış bir · çerçeve', 'color', 'primary', 'position', 0),
  jsonb_build_array(
    jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000c1', 'kind', 'note', 'x', 0, 'y', 0, 'w', 300, 'h', 160, 'z', 1, 'group_id', 'a0000000-0000-4000-8000-0000000000a1',
      'title', 'Adım 1', 'body', '', 'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b1', 'source_step_id', 'd0000000-0000-4000-8000-0000000000d1', 'source_role', 'step', 'source_step_no', 1),
    jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000c2', 'kind', 'note', 'x', 400, 'y', 0, 'w', 300, 'h', 160, 'z', 2, 'group_id', 'a0000000-0000-4000-8000-0000000000a1',
      'title', 'Adım 2', 'body', '', 'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b1', 'source_step_id', 'd0000000-0000-4000-8000-0000000000d2', 'source_role', 'step', 'source_step_no', 2)),
  jsonb_build_array(
    jsonb_build_object('id', 'e0000000-0000-4000-8000-0000000000e1', 'from_item_id', 'c0000000-0000-4000-8000-0000000000c1', 'to_item_id', 'c0000000-0000-4000-8000-0000000000c2',
      'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b1', 'source_role', 'flow')))::text);
reset role;
select public._check(1, 'atomik aktarım: grup + 2 öğe + 1 ok yazıldı',
  (select count(*) from public.space_groups where space_id = public._g('P')) = 1
  and (select count(*) from public.space_items where space_id = public._g('P') and source_workflow_id = :w1) = 2
  and (select count(*) from public.space_connections where space_id = public._g('P')) = 1);
select public._check(2, 'dönen JSON: grup, 2 öğe ve 1 ok',
  (select (v::jsonb -> 'group' ->> 'name') = 'Akış bir · çerçeve' and jsonb_array_length(v::jsonb -> 'items') = 2 and jsonb_array_length(v::jsonb -> 'connections') = 1 from public._ctx where k = 'R1'));
select public._check(3, 'öğeler gruba bağlı ve created_by çağıran',
  (select count(*) from public.space_items where space_id = public._g('P') and group_id = 'a0000000-0000-4000-8000-0000000000a1' and created_by = :alice) = 2);

-- 2) Atomiklik: ikinci aktarımda ok geçersiz (olmayan öğe) → grup ve öğeler de GERİ ALINIR.
set role authenticated;
select public._as_user(:alice);
select public._check(4, 'geçersiz ok: aktarım tümüyle reddedilir',
  public._try(format($q$select public.space_apply_workflow_plan(%L,
    jsonb_build_object('id', 'a0000000-0000-4000-8000-0000000000a2', 'name', 'Yarım kalmamalı'),
    jsonb_build_array(jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000c3', 'kind', 'note', 'x', 0, 'y', 400, 'w', 300, 'h', 160, 'z', 3,
      'group_id', 'a0000000-0000-4000-8000-0000000000a2', 'title', 'Adım', 'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b2', 'source_step_id', 'd0000000-0000-4000-8000-0000000000d3', 'source_role', 'step', 'source_step_no', 1)),
    jsonb_build_array(jsonb_build_object('from_item_id', 'c0000000-0000-4000-8000-0000000000c3', 'to_item_id', 'c0000000-0000-4000-8000-0000000000ff', 'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b2', 'source_role', 'flow')))$q$, public._g('P'))) <> 'ok');
reset role;
select public._check(5, 'başarısız aktarım hiçbir şey bırakmaz (grup yok, öğe yok)',
  (select count(*) from public.space_groups where id = 'a0000000-0000-4000-8000-0000000000a2') = 0
  and (select count(*) from public.space_items where source_workflow_id = :w2) = 0);

-- 3) Yetki: yabancı ve ziyaretçi aktaramaz; kaynak kuralı (prompt rolü prompt olmayan öğede) reddedilir.
set role authenticated;
select public._as_user(:dave);
select public._check(6, 'yabancı herkese açık Space''e aktaramaz',
  public._try(format($q$select public.space_apply_workflow_plan(%L, null, '[]'::jsonb, '[]'::jsonb)$q$, public._g('P'))) like '%space_forbidden%');
select public._as_user(:alice);
select public._check(7, 'prompt rolü prompt olmayan öğede reddedilir (kaynak tetikleyicisi)',
  public._try(format($q$select public.space_apply_workflow_plan(%L, null,
    jsonb_build_array(jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000c4', 'kind', 'note', 'x', 0, 'y', 0, 'w', 300, 'h', 160, 'z', 1, 'title', 'x',
      'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b3', 'source_role', 'prompt')), '[]'::jsonb)$q$, public._g('P'))) <> 'ok');
select public._check(8, '501 öğe reddedilir',
  public._try(format($q$select public.space_apply_workflow_plan(%L, null, (select jsonb_agg('{}'::jsonb) from generate_series(1, 501)), '[]'::jsonb)$q$, public._g('P'))) like '%space_invalid%');
reset role;
set role anon;
select public._as_user('');
select public._check(9, 'ziyaretçi aktarım fonksiyonunu çalıştıramaz',
  public._try(format($q$select public.space_apply_workflow_plan(%L, null, '[]'::jsonb, '[]'::jsonb)$q$, public._g('P'))) like '%permission denied%');
reset role;

-- 3b) Grup sınırı (50): çerçeve açılamaz ama aktarım reddedilmez, öğeler çerçevesiz yazılır.
reset role;
insert into public.space_groups (space_id, name, position, created_by) select public._g('X'), 'g' || n, n, :alice from generate_series(1, 50) n;
set role authenticated;
select public._as_user(:alice);
select public._set('G', public._try(format($q$select public.space_apply_workflow_plan(%L,
    jsonb_build_object('id', 'a0000000-0000-4000-8000-0000000000a9', 'name', 'Sığmaz'),
    jsonb_build_array(jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000c9', 'kind', 'note', 'x', 0, 'y', 0, 'w', 300, 'h', 160, 'z', 1,
      'group_id', 'a0000000-0000-4000-8000-0000000000a9', 'title', 'Adım', 'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b4', 'source_step_id', 'd0000000-0000-4000-8000-0000000000d9', 'source_role', 'step', 'source_step_no', 1)),
    '[]'::jsonb)$q$, public._g('X'))));
reset role;
select public._check(20, 'grup sınırı doluysa aktarım çerçevesiz sürer (reddedilmez)',
  (select v = 'ok' from public._ctx where k = 'G') and (select group_id is null from public.space_items where id = 'c0000000-0000-4000-8000-0000000000c9'));

-- 4) Bağ okuma: nesneli bağ + eski çerçeve + özel Space.
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$insert into public.space_items (space_id, kind, content_type, content_id, x, y, w, h, created_by) values (%L, 'content', 'workflow', 'b0000000-0000-4000-8000-0000000000b3', 0, 900, 900, 500, auth.uid())$q$, public._g('P')));
select public._try(format($q$insert into public.space_items (space_id, kind, content_type, content_id, x, y, w, h, created_by) values (%L, 'content', 'workflow', 'b0000000-0000-4000-8000-0000000000b1', 0, 0, 900, 500, auth.uid())$q$, public._g('X')));
select public._check(10, 'sahip: nesneli bağ — adım kartına odaklanır, objects=true',
  public._ids(format($q$select item_id::text || ':' || objects::text from public.workflow_space_links(%L) where space_id = %L$q$, 'b0000000-0000-4000-8000-0000000000b1', public._g('P'))) like 'c0000000-0000-4000-8000-0000000000c1:true');
select public._check(11, 'sahip: eski çerçeve bağı objects=false',
  public._ids(format($q$select objects::text from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b3')) = 'false');
select public._check(12, 'sahip: aynı workflow iki Space''te ise iki satır (Space başına bir)',
  public._ids(format($q$select count(*)::text from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b1')) = '2');
select public._check(13, 'satır Space bilgisini taşır (başlık, görünürlük, arşiv)',
  public._ids(format($q$select title || ':' || visibility || ':' || archived::text from public.workflow_space_links(%L) where space_id = %L$q$, 'b0000000-0000-4000-8000-0000000000b1', public._g('P'))) = 'Açık:public:false');

-- Adım kartları silinse de bağ kaybolmaz (başka bir workflow nesnesi kalıyorsa). Prompt öğesi için bir prompt gerekir.
reset role;
insert into public.prompts (id, author_id, title, description, prompt_text, status, visibility, content_type)
values ('f0000000-0000-4000-8000-0000000000f1', :alice, 'P', '', 'metin', 'published', 'public', 'text');
set role authenticated;
select public._as_user(:alice);
select public._try(format($q$select public.space_apply_workflow_plan(%L, null,
  jsonb_build_array(jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000c5', 'kind', 'prompt', 'prompt_id', 'f0000000-0000-4000-8000-0000000000f1', 'x', 0, 'y', 2000, 'w', 300, 'h', 160, 'z', 9,
    'source_workflow_id', 'b0000000-0000-4000-8000-0000000000b2', 'source_step_id', 'd0000000-0000-4000-8000-0000000000d3', 'source_role', 'prompt', 'source_step_no', 1)), '[]'::jsonb)$q$, public._g('P')));
select public._check(14, 'yalnız prompt nesnesi kalsa da bağ bulunur (adım kartı şart değil)',
  public._ids(format($q$select objects::text from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b2')) = 'true');

-- Okuyucu bazlı görünürlük.
select public._as_user(:dave);
select public._check(15, 'yabancı: yalnız herkese açık Space görünür',
  public._ids(format($q$select string_agg(title, ',' order by title) from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b1')) = 'Açık');
select public._as_user(:bobby);
select public._check(16, 'özel Space''in düzenleyicisi ikisini de görür',
  public._ids(format($q$select string_agg(title, ',' order by title) from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b1')) = 'Açık,Özel');
select public._as_user(:erin);
select public._check(17, 'engellenen kullanıcı sahibin Space''lerini görmez',
  public._ids(format($q$select count(*)::text from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b1')) = '0');
reset role;
set role anon;
select public._as_user('');
select public._check(18, 'ziyaretçi herkese açık Space''i görür, özeli görmez',
  public._ids(format($q$select string_agg(title, ',') from public.workflow_space_links(%L)$q$, 'b0000000-0000-4000-8000-0000000000b1')) = 'Açık');
select public._check(19, 'olmayan workflow için boş döner',
  public._ids($q$select count(*)::text from public.workflow_space_links('00000000-0000-4000-8000-000000000000')$q$) = '0');
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
