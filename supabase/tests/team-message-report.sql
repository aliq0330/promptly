-- Ekipler (docs/history/353-*): ekip kanalı mesajı şikâyeti → ekip yönetimine. Çalıştırma: supabase/tests/run-local.sh supabase/tests/team-message-report.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank'),(:gina,'gina')) as u(id, name);

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
create or replace function public._chan(p_name text) returns uuid language sql security definer as $$
  select id from public.team_channels where team_id = public._g('T') and name = p_name $$;
-- Süper kullanıcı gözüyle mesaj ekler (yazma kuralları ayrıca istemci rolüyle sınanır).
create or replace function public._msg(p_conv uuid, p_sender uuid, p_body text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin insert into public.messages (conversation_id, sender_id, body) values (p_conv, p_sender, p_body) returning id into v; return v; end $$;
create or replace function public._members(p_conv uuid) returns text language sql security definer as $$
  select coalesce(string_agg(p.username, ',' order by p.username), '') from public.conversation_members m join public.profiles p on p.id = m.user_id where m.conversation_id = p_conv $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text), public._q(text),
  public._chan(text), public._msg(uuid, uuid, text), public._members(uuid) to public;

-- Kurulum: T (alice sahip, bobby yönetici, carol düzenleyici, dave + gina üye, erin konuk).
set role authenticated;
select public._as_user(:alice);
select public.team_create('Atölye Mor') as v \gset t_
reset role;
insert into public._ctx values ('T', :'t_v');
insert into public.team_members (team_id, user_id, role) values (public._g('T'), :bobby, 'admin'), (public._g('T'), :carol, 'editor'), (public._g('T'), :dave, 'member'), (public._g('T'), :gina, 'member');
insert into public.team_members (team_id, user_id, role, guest_until, guest_org) values (public._g('T'), :erin, 'guest', now() + interval '30 days', 'Kuzey Kafe');
insert into public._ctx select 'GENEL', public._chan('genel')::text;
insert into public._ctx select 'DUYURU', public._chan('duyurular')::text;


select public._as_user(:alice);
set role authenticated;
select public.team_create_channel(public._g('T'), 'gizli', '', 'private', null, 'members', 'mentions', jsonb_build_array(jsonb_build_object('type','member','id',:dave::text,'level','edit'))) as v \gset c_
reset role;
insert into public._ctx values ('GIZLI', :'c_v');
insert into public._ctx select 'M1', public._msg(public._g('GENEL'), :dave, 'uygunsuz bir mesaj')::text;
insert into public._ctx select 'M2', public._msg(public._g('GIZLI'), :dave, 'gizli kanal mesajı')::text;

set role authenticated;
select public._as_user(:gina);
select public._check(1, 'üye, ekip kanalı mesajını submit_report ile bildirir (site moderatörüne değil ekip denetim günlüğüne düşer)',
  public._try(format($q$select public.submit_report('chat_message', %L, 'spam', null)$q$, public._g('M1'))) = 'ok'
  and (select count(*) from public.reports where target_id = public._g('M1')) = 0);
reset role;
select public._check(2, 'denetim günlüğünde message_reported kaydı kanal adıyla',
  (select count(*) from public.team_audit where team_id = public._g('T') and action = 'message_reported' and target_label = '#genel' and actor_id = :gina) = 1);
select public._check(3, 'sahip ve yönetici bilgilendirilir, üye/editör bilgilendirilmez',
  (select count(*) from public.notifications where recipient_id = :alice and dedupe_key like 'teamreport:%') = 1
  and (select count(*) from public.notifications where recipient_id = :bobby and dedupe_key like 'teamreport:%') = 1
  and (select count(*) from public.notifications where recipient_id in (:carol, :dave, :gina) and dedupe_key like 'teamreport:%') = 0);
set role authenticated;
select public._as_user(:gina);
select public._check(4, 'aynı mesaj aynı kişiden ikinci kez bildirilemez', public._try(format($q$select public.submit_report('chat_message', %L, 'spam', null)$q$, public._g('M1'))) like '%report_duplicate%');
select public._check(5, 'kendi mesajını bildiremez (hedef bulunamadı)', public._try(format($q$select public.submit_report('chat_message', %L, 'spam', null)$q$, public._g('M1'))) is not null);
select public._as_user(:dave);
select public._check(6, 'yazar kendi mesajını bildiremez', public._try(format($q$select public.submit_report('chat_message', %L, 'spam', null)$q$, public._g('M1'))) like '%report_target_not_found%');
select public._as_user(:gina);
select public._check(7, 'üyesi olmadığı özel kanalın mesajı bildirilemez, varlığı sızmaz', public._try(format($q$select public.submit_report('chat_message', %L, 'spam', null)$q$, public._g('M2'))) like '%report_target_not_found%');
select public._check(8, 'geçersiz neden reddedilir; "diğer" ayrıntı ister',
  public._try(format($q$select public.submit_report('chat_message', %L, 'yok_boyle', null)$q$, public._g('M2'))) is not null
  and public._try(format($q$select public.team_report_message(%L, 'other', null)$q$, public._g('M1'))) is not null);
select public._as_user(:erin);
select public._check(9, 'konuk yalnızca erişebildiği kanalı bildirebilir; erişemediği kanalda hedef bulunamadı', public._try(format($q$select public.submit_report('chat_message', %L, 'spam', null)$q$, public._g('M2'))) like '%report_target_not_found%');
reset role;
select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n || ' | ' || name || ' | ' || detail from public._results where not ok order by n;
