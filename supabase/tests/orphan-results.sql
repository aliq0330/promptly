-- Prompt silinince kullanıcı sonuçları (docs/history/283-*): yetim sonuç yalnız sahibine görünür, bildirim, topluluk promptunun sonuçları birlikte gider,
-- profil RPC'leri (profile_results / profile_result_count), koruma tetikleyicisi. Çalıştırma: supabase/tests/run-local.sh supabase/tests/orphan-results.sql
-- ("FAILED=0" beklenir). Kullanıcılar: alice (yazar, topluluk sahibi) bobby (sonuç sahibi, topluluk üyesi) carol (sonuç sahibi, topluluk üyesi) dave (dışarıdan).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave')) as u(id, name);

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
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._cnt(text), public._g(text) to public;

create or replace function public._mkc(p_name text, p_level text, p_members uuid[]) returns uuid language plpgsql as $$
declare v_gid uuid; v_u uuid;
begin
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  v_gid := (public.create_community(p_name, 'açıklama', p_level, null, 50, p_members, 'general', 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array p_members loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user('11111111-1111-4111-8111-111111111111');
  return v_gid;
end $$;

select public._mkc('Topluluk A', 'public', array[:bobby, :carol]::uuid[]) as v \gset a_
insert into public._ctx values ('A', :'a_v');
reset role;

-- P1: herkese açık prompt (silinecek), P2: yaşayan prompt, PC: topluluğa özgü prompt (silinecek).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Ana prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :alice, 'Yaşayan prompt', 'd', 'metin', 'text', 'published', 'public');
select public._as_user(:alice);
set role authenticated;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  ('a0000000-0000-4000-8000-0000000000c1', :alice, 'Topluluk prompt', 'd', 'metin', 'text', 'published', 'public', public._g('A'));
reset role;

-- Sonuçlar: bobby → P1 (R1), P2 (R3), PC (RC); carol → P1, değişiklikli (R2).
insert into public.prompt_results (id, prompt_id, creator_id, media_type, text_content, tool, has_modification, modified_prompt_text, like_count, created_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', :bobby, 'text', 'bobby sonucu', 'GPT', false, null, 3, now() - interval '3 hours'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', :carol, 'text', 'carol sonucu', null, true, 'değiştirilmiş metin', 0, now() - interval '2 hours'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000a2', :bobby, 'text', 'bobby yaşayan', null, false, null, 0, now() - interval '1 hours'),
  ('e0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000c1', :bobby, 'text', 'topluluk sonucu', null, false, null, 0, now());

-- ============================================================================
-- Silmeden ÖNCE
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._check(1, 'önce: profile_results(bobby) carol gözüyle — herkese açık prompt sonuçları var, topluluğa özgü olan YOK; prompt adı gelir',
  (select count(*) from public.profile_results(:bobby)) = 2
  and (select count(*) from public.profile_results(:bobby) where prompt_id = 'a0000000-0000-4000-8000-0000000000c1') = 0
  and (select prompt_title from public.profile_results(:bobby) where id = 'e0000000-0000-4000-8000-000000000001') = 'Ana prompt'
  and (select max(total_count) from public.profile_results(:bobby)) = 2
  and public.profile_result_count(:bobby) = 2);
select public._as_user(:dave);
select public._check(2, 'önce: herkese açık toplulukta sonuç okunabilir olsa da profil sayısı topluluğa özgü sonucu SAYMAZ (2)',
  public.profile_result_count(:bobby) = 2,
  (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-0000000000c1') || '/' || public.profile_result_count(:bobby)
    || '/prompt:' || (select count(*) from public.prompts where id = 'a0000000-0000-4000-8000-0000000000c1') || '/vis:' || coalesce((select string_agg(visibility, ',') from public.prompts where community_id is not null), '-'));
select public._as_user('');
select public._check(3, 'önce: ziyaretçi (anon) profil RPC''lerini çağırabilir; yalnız açık sonuçlar',
  public.profile_result_count(:bobby) = 2 and (select count(*) from public.profile_results(:bobby)) = 2);

-- İstemci sonucu başka prompta taşıyamaz / yetim yapamaz (koruma tetikleyicisi).
select public._as_user(:bobby);
select public._check(4, 'koruma: istemci prompt_id''yi değiştiremez (başka prompta da, boşa da)',
  public._try($q$update public.prompt_results set prompt_id = 'a0000000-0000-4000-8000-0000000000a2' where id = 'e0000000-0000-4000-8000-000000000001'$q$) like '%yalnızca tool%'
  and public._try($q$update public.prompt_results set prompt_id = null where id = 'e0000000-0000-4000-8000-000000000001'$q$) like '%yalnızca tool%');
select public._try($q$update public.prompt_results set tool = 'Midjourney' where id = 'e0000000-0000-4000-8000-000000000003'$q$) as v \gset u5_
select public._check(5, 'koruma: düzenlenebilir alanlar (tool) hâlâ güncellenir',
  :'u5_v' = 'ok' and (select tool from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000003') = 'Midjourney');
reset role;

-- ============================================================================
-- Yazar herkese açık promptu siler
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._try($q$delete from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1'$q$) as v \gset d6_
select public._check(6, 'yazar herkese açık promptu silebilir (FK set null + CHECK + koruma tetikleyicisi engel olmaz)', :'d6_v' = 'ok');
reset role;

select public._check(7, 'silindikten sonra: iki sonuç da DURUR, prompt_id boş, içerik ve beğeni sayacı aynen',
  (select count(*) from public.prompt_results where id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002') and prompt_id is null) = 2
  and (select like_count from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000001') = 3
  and (select text_content from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000002') = 'carol sonucu'
  and (select has_modification from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000002'));

set role authenticated;
select public._as_user(:bobby);
select public._check(8, 'yetim: sahibi okur; profile_results kendi yetimini "prompt_title null" ile listeler, sayı 2 (yetim + yaşayan)',
  (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.profile_results(:bobby) where prompt_id is null and prompt_title is null) = 1
  and public.profile_result_count(:bobby) = 2);
select public._as_user(:carol);
select public._check(9, 'yetim: başkası OKUYAMAZ (carol bobby''nin yetim sonucunu görmez; kendi yetimini görür); profil listesinde de çıkmaz',
  (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000002') = 1
  and public.profile_result_count(:bobby) = 1
  and (select count(*) from public.profile_results(:bobby) where prompt_id is null) = 0);
select public._as_user(:dave);
select public._check(10, 'yetim: dışarıdan biri ve ziyaretçi göremez',
  (select count(*) from public.prompt_results where prompt_id is null) = 0);
select public._as_user('');
select public._check(11, 'yetim: ziyaretçi profil sayısında yetimi görmez',
  public.profile_result_count(:bobby) = 1 and public.profile_result_count(:carol) = 0);
select public._as_user(:bobby);
select public._try($q$update public.prompt_results set tool = 'DALL-E' where id = 'e0000000-0000-4000-8000-000000000001'$q$) as v \gset u12_
select tool as t from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000001' \gset t12_
select public._try($q$delete from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000001'$q$) as v \gset d12_
select public._check(12, 'yetim: sahibi düzenleyebilir (tool) ve silebilir',
  :'u12_v' = 'ok' and :'t12_t' = 'DALL-E' and :'d12_v' = 'ok'
  and (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000001') = 0);
select public._as_user(:dave);
select public._check(13, 'yetim sonuca yeni yorum/beğeni konamaz (okuma politikası promptu şart koşar)',
  public._try($q$insert into public.prompt_likes (result_id, user_id) values ('e0000000-0000-4000-8000-000000000002', 'x')$q$) <> 'ok');
reset role;

-- ============================================================================
-- Bildirim
-- ============================================================================
select public._check(14, 'bildirim: her sonuç sahibine (bobby, carol) TEK "system" bildirimi, sonucuna giden adresle; yazara bildirim yok',
  (select count(*) from public.notifications where type = 'system' and message like 'Sonucunun promptunu sildi%') = 2
  and (select count(*) from public.notifications where recipient_id = :bobby and message like 'Sonucunun promptunu sildi: "Ana prompt"') = 1
  and (select target_href from public.notifications where recipient_id = :carol and message like 'Sonucunun promptunu sildi%') = '/results/local?id=e0000000-0000-4000-8000-000000000002'
  and (select actor_id from public.notifications where recipient_id = :bobby and message like 'Sonucunun promptunu sildi%') = :alice::uuid
  and (select count(*) from public.notifications where recipient_id = :alice and message like 'Sonucunun promptunu sildi%') = 0);

-- ============================================================================
-- Topluluğa özgü prompt: sonuçlar birlikte gider, yetim kalmaz, bildirim yazılmaz
-- ============================================================================
set role authenticated;
select public._as_user(:alice);
select public._try($q$delete from public.prompts where id = 'a0000000-0000-4000-8000-0000000000c1'$q$) as v \gset d15_
select public._check(15, 'topluluk promptu silinince silme hatasız biter', :'d15_v' = 'ok');
reset role;
select public._check(16, 'topluluk sonucu gitti; yetim sonuç yok; bildirim sayısı değişmedi (2)',
  (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-0000000000c1') = 0
  and (select count(*) from public.prompt_results where prompt_id is null) = 1
  and (select count(*) from public.notifications where message like 'Sonucunun promptunu sildi%') = 2);

-- Yaşayan prompt: sonucu yerinde.
select public._check(17, 'yaşayan promptun sonucu etkilenmez',
  (select prompt_id from public.prompt_results where id = 'e0000000-0000-4000-8000-000000000003') = 'a0000000-0000-4000-8000-0000000000a2');

-- Hesap silme (yazar): promptları silinir, başkasının sonucu yetim kalır, bildirim actor'suz yazılır, hata yok.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000d1', :dave, 'Dave prompt', 'd', 'metin', 'text', 'published', 'public');
insert into public.prompt_results (id, prompt_id, creator_id, media_type, text_content) values
  ('e0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000d1', :bobby, 'text', 'bobby, dave promptunda');
select public._try(format($q$select public.delete_account_data(%L)$q$, :dave)) as v \gset d18_
select public._check(18, 'yazarın hesabı silinince (prompt cascade) sonuç yetim kalır ve işlem hata vermez',
  :'d18_v' = 'ok' and (select count(*) from public.prompt_results where id = 'e0000000-0000-4000-8000-0000000000d1' and prompt_id is null) = 1, :'d18_v');

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
