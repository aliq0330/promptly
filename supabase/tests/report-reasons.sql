-- Merkezi şikâyet (docs/history/284-*): `submit_report` tek giriş, hazır nedenler, hedef doğrulama (RLS), yinelenen/hız sınırı, topluluk yönlendirmesi,
-- raportör yalnız kendi şikâyetini görür, moderasyon kuyruğu (neden kodu + ayrıntı + süzgeç + eski satırlar), şikâyet içeriği silmez.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/report-reasons.sql ("FAILED=0" beklenir).
-- Kullanıcılar: alice (içerik/topluluk sahibi) bobby (raportör, topluluk üyesi) carol (raportör, hız sınırı) dave (dışarıdan) erin (moderatör).
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
update public.profiles set role = 'moderator' where id = :erin;
-- Hız sınırı sınaması için 25 ek profil.
insert into auth.users (id, email, raw_user_meta_data)
select ('66666666-6666-4666-8666-' || lpad(g::text, 12, '0'))::uuid, 'x' || g || '@test.dev', jsonb_build_object('username', 'x' || g, 'display_name', 'X' || g)
from generate_series(1, 25) g;

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

select public._mkc('Açık topluluk', 'public', array[:bobby, :carol]::uuid[]) as v \gset a_
insert into public._ctx values ('PUB', :'a_v');
select public._mkc('Gizli topluluk', 'private', array[:bobby]::uuid[]) as v \gset b_
insert into public._ctx values ('PRIV', :'b_v');
reset role;

-- İçerik: herkese açık prompt (P1, P2, P3), alice'in özel taslağı (PD), yorum (C1), topluluk gönderisi, topluluk sohbet mesajı.
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'Ana prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a2', :alice, 'İkinci prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000a3', :alice, 'Üçüncü prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-0000000000d1', :alice, 'Özel taslak', 'd', 'metin', 'text', 'draft', 'private');
insert into public.prompt_comments (id, prompt_id, author_id, body) values
  ('c0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000a1', :alice, 'kaba bir yorum');
select public._as_user(:alice);
set role authenticated;
select public.share_to_community(public._g('PUB'), 'prompt', 'a0000000-0000-4000-8000-0000000000a2', 'bak şuna') as v \gset sp_
insert into public._ctx values ('POST', :'sp_v');
reset role;
insert into public.messages (id, conversation_id, sender_id, body) values
  ('f0000000-0000-4000-8000-0000000000f1', public._g('PUB'), :alice, 'topluluk sohbet mesajı'),
  ('f0000000-0000-4000-8000-0000000000f2', public._g('PUB'), :bobby, 'bobby''nin kendi mesajı');

-- ============================================================================
-- 1) Neden tablosu (tür başına)
-- ============================================================================
select public._check(1, 'neden tablosu: tür başına sayılar (içerik 11, profil 9, yorum 8, topluluk gönderisi 11, topluluk 9, sohbet mesajı 8, bilinmeyen 0)',
  array_length(public._report_reasons_for('prompt'), 1) = 11 and array_length(public._report_reasons_for('story'), 1) = 11
  and array_length(public._report_reasons_for('user'), 1) = 9 and array_length(public._report_reasons_for('comment'), 1) = 8
  and array_length(public._report_reasons_for('community_post'), 1) = 11 and array_length(public._report_reasons_for('community'), 1) = 9
  and array_length(public._report_reasons_for('chat_message'), 1) = 8 and coalesce(array_length(public._report_reasons_for('nope'), 1), 0) = 0
  and (select every(public._report_reason_label(c) is not null) from unnest(public._report_reasons_for('prompt')) c)
  and (public._report_reasons_for('prompt'))[array_length(public._report_reasons_for('prompt'), 1)] = 'other'
  and (public._report_reasons_for('user'))[array_length(public._report_reasons_for('user'), 1)] = 'other');

-- ============================================================================
-- 2) Prompt şikâyeti
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'spam', null) as v \gset r1_
reset role;
select public._check(2, 'prompt şikâyeti: kayıt oluşur — raportör oturumdan, neden kodu, ayrıntı boş, `reason` okunur etiket, durum açık',
  (select reporter_id = :bobby and target_type = 'prompt' and reason_code = 'spam' and details is null
          and reason = 'Spam veya yanıltıcı içerik' and status = 'open' from public.reports where id = :'r1_v'));

set role authenticated;
select public._as_user(:bobby);
select public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'copyright', 'tekrar')$q$) as v \gset r3_
select public._check(3, 'yinelenen açık şikâyet reddedilir (report_duplicate)', :'r3_v' like '%report_duplicate%', :'r3_v');

select public._check(4, 'türe uymayan neden reddedilir (prompta "sahte hesap")',
  public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', 'impersonation', null)$q$) like '%invalid_report_reason%'
  and public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', 'nope', null)$q$) like '%invalid_report_reason%'
  and public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', null, null)$q$) like '%invalid_report_reason%');

select public._check(5, '"Diğer" ayrıntı ister (boş / yalnız boşluk reddedilir)',
  public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', 'other', null)$q$) like '%details_required%'
  and public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', 'other', '   ')$q$) like '%details_required%');

select public._check(6, 'ayrıntı 1000 karakteri aşamaz; tam 1000 olur',
  public._try(format($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', 'harassment', %L)$q$, repeat('a', 1001))) like '%details_too_long%'
  and public._try(format($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a3', 'harassment', %L)$q$, repeat('a', 1000))) = 'ok');

select public._check(7, 'olmayan hedef ve başkasının GÖRÜNMEYEN içeriği (özel taslak) aynı şekilde "bulunamadı" (varlık sızmaz)',
  public._try($q$select public.submit_report('prompt', '00000000-0000-4000-8000-000000000999', 'spam', null)$q$) like '%report_target_not_found%'
  and public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000d1', 'spam', null)$q$) like '%report_target_not_found%'
  and public._try($q$select public.submit_report('bilinmeyen', 'a0000000-0000-4000-8000-0000000000a1', 'spam', null)$q$) like '%report_target_not_found%');

select public._as_user('');
set role anon;
select public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a1', 'spam', null)$q$) as v \gset r8_
reset role;
select public._check(8, 'ziyaretçi (anon) submit_report çağıramaz', :'r8_v' like '%permission denied%', :'r8_v');

-- ============================================================================
-- 3) Profil, yorum, "Diğer" + ayrıntı kaydı
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public.submit_report('user', :alice::uuid, 'impersonation', 'Başka birinin fotoğrafını kullanıyor.') as v \gset r9_
select public.submit_report('comment', 'c0000000-0000-4000-8000-0000000000c1', 'harassment', null) as v \gset r10_
select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a2', 'other', '  Açıklaması burada  ') as v \gset r11_
reset role;
select public._check(9, 'profil şikâyeti (sahte hesap) ayrıntısıyla; yorum şikâyeti; "Diğer" ayrıntısı kırpılır ve `reason`a eklenir',
  (select reason_code = 'impersonation' and details = 'Başka birinin fotoğrafını kullanıyor.' from public.reports where id = :'r9_v')
  and (select target_type = 'comment' and reason_code = 'harassment' from public.reports where id = :'r10_v')
  and (select reason_code = 'other' and details = 'Açıklaması burada' and reason = E'Diğer\nAçıklaması burada' from public.reports where id = :'r11_v'));

select public._check(10, 'şikâyet içeriği SİLMEZ ya da gizlemez (prompt, yorum, profil yerinde)',
  (select count(*) from public.prompts where id in ('a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a2') and status = 'published' and visibility = 'public') = 2
  and (select count(*) from public.prompt_comments where id = 'c0000000-0000-4000-8000-0000000000c1') = 1
  and (select count(*) from public.profiles where id = :alice) = 1);

-- ============================================================================
-- 4) Topluluk: gönderi, sohbet mesajı, topluluğun kendisi
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select public.submit_report('community_post', public._g('POST'), 'wrongcat', 'Bu topluluğa uymuyor.') as v \gset r12_
select public.submit_report('chat_message', 'f0000000-0000-4000-8000-0000000000f1', 'spam', null) as v \gset r13_
select public.submit_report('community', public._g('PUB'), 'wrongcat', null) as v \gset r14_
reset role;
select public._check(11, 'topluluk gönderisi → community_reports (neden kodu + ayrıntı + okunur `reason`)',
  (select target_kind = 'post' and reporter_id = :bobby and reason_code = 'wrongcat' and details = 'Bu topluluğa uymuyor.'
          and reason = 'Yanlış kategori veya topluluk kuralı ihlali' and post_id = public._g('POST') from public.community_reports where id = :'r12_v'));
select public._check(12, 'topluluk sohbet mesajı → community_reports (mesaj hedefi); topluluğun kendisi → reports (target_type community)',
  (select target_kind = 'message' and message_id = 'f0000000-0000-4000-8000-0000000000f1' and reason_code = 'spam' from public.community_reports where id = :'r13_v')
  and (select target_type = 'community' and target_id = public._g('PUB') and reason_code = 'wrongcat' from public.reports where id = :'r14_v'));

set role authenticated;
select public._as_user(:bobby);
select public._check(13, 'topluluk: yinelenen (already_reported), kendi mesajı (cannot_target_self), türe uymayan neden',
  public._try(format($q$select public.submit_report('community_post', %L, 'spam', null)$q$, public._g('POST'))) not like '%invalid%'
  and public._try(format($q$select public.submit_report('community_post', %L, 'wrongcat', null)$q$, public._g('POST'))) like '%already_reported%'
  and public._try($q$select public.submit_report('chat_message', 'f0000000-0000-4000-8000-0000000000f2', 'spam', null)$q$) like '%cannot_target_self%'
  and public._try($q$select public.submit_report('chat_message', 'f0000000-0000-4000-8000-0000000000f1', 'copyright', null)$q$) like '%invalid_report_reason%'
  and public._try(format($q$select public.submit_report('community', %L, 'copyright', null)$q$, public._g('PUB'))) like '%invalid_report_reason%');

select public._as_user(:dave);
select public._check(14, 'topluluk dışından biri gönderi/mesaj şikâyet edemez (forbidden); tamamen kapalı topluluğu hiç bulamaz',
  public._try(format($q$select public.submit_report('community_post', %L, 'spam', null)$q$, public._g('POST'))) like '%forbidden%'
  and public._try(format($q$select public.submit_report('community', %L, 'spam', null)$q$, public._g('PRIV'))) like '%report_target_not_found%'
  and public._try(format($q$select public.submit_report('community', %L, 'spam', null)$q$, public._g('PUB'))) = 'ok');
reset role;

-- ============================================================================
-- 5) Görünürlük (RLS): raportör yalnız kendi şikâyetini görür
-- ============================================================================
set role authenticated;
select public._as_user(:bobby);
select count(*) as n from public.reports \gset own_
select public._as_user(:carol);
select count(*) as n from public.reports \gset other_
select public._as_user(:dave);
select count(*) as n from public.reports \gset dave_
select count(*) as n from public.community_reports \gset dave_c_
reset role;
select public._check(15, 'RLS: bobby kendi şikâyetlerini görür, carol 0 görür, dave yalnız kendi şikâyetini (1) görür; topluluk dışı kişi community_reports göremez',
  :own_n >= 6 and :other_n = 0 and :dave_n = 1 and :dave_c_n = 0, :own_n || '/' || :other_n || '/' || :dave_n || '/' || :dave_c_n);

-- ============================================================================
-- 6) Eski satırlar + doğrudan insert uyumu
-- ============================================================================
set role authenticated;
select public._as_user(:carol);
select public._try($q$insert into public.reports (reporter_id, target_type, target_id, reason) values ('33333333-3333-4333-8333-333333333333', 'prompt', 'a0000000-0000-4000-8000-0000000000a3', 'eski serbest metin')$q$) as v \gset l16_
-- İşaret (promptly.submit_report) yalnız submit_report içinde konur; burada elle koyarak tablo CHECK'inin hâlâ çalıştığını sınarız.
select set_config('promptly.submit_report', '1', false);
select public._try($q$insert into public.reports (reporter_id, target_type, target_id, reason, reason_code) values ('33333333-3333-4333-8333-333333333333', 'prompt', 'a0000000-0000-4000-8000-0000000000a1', 'x', 'uydurma')$q$) as v \gset l17_
select set_config('promptly.submit_report', '', false);
reset role;
select count(*) as n from public.reports where reporter_id = :carol and reason_code is null \gset l16c_
-- Eski (reason_code boş) satırlar canlıda hâlâ var: istemci artık üretemediği için burada yetkili rolle tohumlanır; kuyruk/süzgeç sınamaları onu kullanır.
insert into public.reports (reporter_id, target_type, target_id, reason) values (:carol, 'prompt', 'a0000000-0000-4000-8000-0000000000a3', 'eski serbest metin');
select public._check(16, 'contract: serbest metinli doğrudan insert artık reddedilir (politika yalnız submit_report işaretiyle yazdırır)',
  :'l16_v' like '%row-level security%' and :l16c_n = 0, :'l16_v' || ' / ' || :l16c_n);
select public._check(17, 'geçersiz neden kodu CHECK ile reddedilir', :'l17_v' like '%reports_reason_code_check%', :'l17_v');

-- ============================================================================
-- 7) Moderasyon kuyruğu
-- ============================================================================
set role authenticated;
select public._as_user(:erin);
select count(*) as n from public.moderation_report_queue('open', 'all') \gset q_all_
select count(*) as n from public.moderation_report_queue('open', 'spam') \gset q_spam_
select count(*) as n from public.moderation_report_queue('open', 'legacy') \gset q_leg_
select count(*) as n from public.moderation_report_queue('open') \gset q_old_
select count(*) as n from public.moderation_report_queue('open', null) \gset q_null_
reset role;
select public._check(18, 'kuyruk: moderatör hepsini görür; neden süzgeci (spam) ve "eski" (kodsuz) süzgeci; eski tek argümanlı imza aynı satırları verir',
  :q_all_n >= 8 and :q_spam_n = 2 and :q_leg_n = 1 and :q_old_n = :q_all_n and :q_null_n = :q_all_n,
  :q_all_n || '/' || :q_spam_n || '/' || :q_leg_n || '/' || :q_old_n);

set role authenticated;
select public._as_user(:erin);
select public._check(19, 'kuyruk satırı: neden kodu + ayrıntı + başlık/yazar; topluluk hedefi adıyla ve bağlantısıyla gelir',
  (select reason_code = 'impersonation' and details = 'Başka birinin fotoğrafını kullanıyor.' and target_type = 'user' and target_exists
     from public.moderation_report_queue('open', 'impersonation') limit 1)
  and (select target_title = 'Açık topluluk' and target_href = '/communities/local?id=' || public._g('PUB') and target_exists
     from public.moderation_report_queue('open', 'wrongcat') where target_type = 'community' limit 1)
  and (select reason = 'eski serbest metin' and reason_code is null from public.moderation_report_queue('open', 'legacy') limit 1));

select public._as_user(:bobby);
select public._check(20, 'moderatör olmayan kuyruğu okuyamaz (iki imza da)',
  public._try($q$select * from public.moderation_report_queue('open', 'all')$q$) like '%Yetkisiz%'
  and public._try($q$select * from public.moderation_report_queue('open')$q$) like '%Yetkisiz%');

select public._as_user(:erin);
select public._check(21, 'moderate_report: reddet çalışır; topluluk hedefi "kaldırılamaz" (şikâyet kaldırmaz/cezalandırmaz)',
  public._try(format($q$select public.moderate_report(%L, 'removed', null)$q$, :'r14_v')) like '%kaldırılamaz%'
  and public._try(format($q$select public.moderate_report(%L, 'dismissed', 'not')$q$, :'r14_v')) = 'ok');
reset role;
select public._check(22, 'karardan sonra: şikâyet reddedildi, topluluk yerinde',
  (select status = 'dismissed' from public.reports where id = :'r14_v') and (select count(*) from public.chat_groups where id = public._g('PUB')) = 1);

-- ============================================================================
-- 8) Günlük hız sınırı (20 şikâyet / 24 saat) — carol
-- ============================================================================
create temp table _rl (r text);
grant all on _rl to public;
set role authenticated;
select public._as_user(:carol);
do $$
declare g int; res text;
begin
  for g in 1..25 loop
    res := public._try(format($q$select public.submit_report('user', %L, 'spam', null)$q$, '66666666-6666-4666-8666-' || lpad(g::text, 12, '0')));
    insert into _rl values (res);
  end loop;
end $$;
reset role;
select public._check(23, 'hız sınırı: carol''ın ilk 20 şikâyeti (öncesindeki 1 + ...) geçer, sonrası rate_limit',
  (select count(*) from _rl where r = 'ok') between 15 and 19 and (select count(*) from _rl where r like '%rate_limit%') >= 6,
  (select count(*) from _rl where r = 'ok') || ' ok / ' || (select count(*) from _rl where r like '%rate_limit%') || ' limit');

-- ============================================================================
-- 7) Contract sonrası: işaret submit_report sonrası temizlenir; is_blocked ziyaretçiye kapalı (287)
-- ============================================================================
set role authenticated;
select public._as_user(:dave);
select public._try($q$select public.submit_report('prompt', 'a0000000-0000-4000-8000-0000000000a2', 'spam', null)$q$) as v \gset l24a_
select coalesce(current_setting('promptly.submit_report', true), '') as m \gset l24m_
select public._try($q$insert into public.reports (reporter_id, target_type, target_id, reason) values ('44444444-4444-4444-8444-444444444444', 'prompt', 'a0000000-0000-4000-8000-0000000000a1', 'sonradan doğrudan')$q$) as v \gset l24b_
reset role;
select public._check(24, 'submit_report başarılı; işaret işlem içinde temizlenir ve sonraki doğrudan insert yine reddedilir',
  :'l24a_v' = 'ok' and :'l24m_m' = '' and :'l24b_v' like '%row-level security%', :'l24a_v' || ' | ' || :'l24m_m' || ' | ' || :'l24b_v');

insert into public.blocks (blocker_id, blocked_id) values (:bobby, :dave) on conflict do nothing;
select public._as_user('');
set role anon;
select public.is_blocked(:bobby, :dave) as v \gset l25a_
reset role;
select public._as_user(:bobby);
set role authenticated;
select public.is_blocked(:bobby, :dave) as v \gset l25b_
select public.is_blocked(:dave, :bobby) as v \gset l25c_
reset role;
select public._check(25, 'is_blocked: ziyaretçiye her zaman false (sızıntı kapalı); oturumlu çağıran için iki yönde de true (davranış aynı)',
  :'l25a_v' = 'f' and :'l25b_v' = 't' and :'l25c_v' = 't', :'l25a_v' || '/' || :'l25b_v' || '/' || :'l25c_v');

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
