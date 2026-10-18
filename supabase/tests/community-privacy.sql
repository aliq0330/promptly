-- Topluluk gizliliği: ÜÇ görünürlük düzeyi × tüm roller × tüm erişim kanalları (docs/history/177-*).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-privacy.sql  ("FAILED=0" beklenir).
--
-- Yöntem: her (düzey, aktör) için GERÇEK rol (anon / authenticated) ve gerçek JWT kimliğiyle — süper kullanıcı OLMADAN — tablolar (REST'in
-- eriştiği yer), RPC'ler ve Storage nesneleri sorgulanır; sonuç, düzeyin/rolün KURALINDAN türetilen beklenen değerle karşılaştırılır
-- (`_expect`, sonuçtan değil kuraldan hesaplanır). Ardından yazma yolları, davet/bağlantı durumları, çıkarma, görünürlük geçişleri,
-- birebir mesajlaşma, bildirim temizliği ve Storage yazma kuralları ayrıca sınanır.
--
-- Aktörler: anon (ziyaretçi) · erin (üye olmayan) · frank (bekleyen başvuru) · hank (bekleyen davet) · gina (üyeliği kaldırılmış)
--           dave (üye) · carol (moderatör) · bobby (yönetici) · alice (sahip).
\pset pager off
\set ON_ERROR_STOP off
set jit = off; -- yerel PostgreSQL'de JIT küçük sorgulara saniyeler ekler; yalnızca test hızı içindir
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
\set frank '''66666666-6666-4666-8666-666666666666'''
\set gina  '''77777777-7777-4777-8777-777777777777'''
\set hank  '''88888888-8888-4888-8888-888888888888'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol'),(:dave,'dave'),(:erin,'erin'),(:frank,'frank'),(:gina,'gina'),(:hank,'hank')) as u(id, name);
update public.profiles set role = 'moderator' where id = :hank;

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
create or replace function public._tk(key text, q text) returns text language plpgsql as $$
declare r text;
begin r := public._try(q); insert into public._ctx values ('r:' || key, r) on conflict (k) do update set v = excluded.v; return r; end $$;
create or replace function public._r(key text) returns text language sql stable as $$ select v from public._ctx where k = 'r:' || key $$;
create or replace function public._q(q text) returns text language plpgsql security definer as $$
declare r text; begin execute q into r; return r; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
create or replace function public._ctx_get(key text) returns text language sql stable as $$ select v from public._ctx where k = key $$;
create or replace function public._notif(uid text, pattern text) returns bigint language sql stable security definer as
  $$ select count(*) from public.notifications where recipient_id = uid::uuid and message like pattern $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._tk(text, text), public._r(text),
  public._q(text), public._g(text), public._ctx_get(text), public._notif(text, text) to public;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-000000000001', :alice, 'Açık prompt', 'd', 'metin', 'text', 'published', 'public'),
  ('a0000000-0000-4000-8000-000000000002', :alice, 'Özel prompt', 'd', 'metin', 'text', 'published', 'private');

grant select, insert, delete on storage.objects to anon, authenticated;

-- ============================================================================
-- 0. Fixture: her düzeyde bir topluluk (sahip alice; bobby yönetici, carol moderatör, dave üye, gina katılıp ayrıldı;
--    frank kapalı/tamamen kapalıda bekleyen başvuran; hank bekleyen davetli). Her birinde gönderi, duyuru, etkinlik, sohbet mesajı,
--    topluluk görseli (Storage) ve sohbet fotoğrafı (Storage) vardır.
-- ============================================================================
create or replace function public._mk(p_level text) returns uuid language plpgsql as $$
declare
  v_gid uuid; v_tok text; v_u uuid;
  v_alice uuid := '11111111-1111-4111-8111-111111111111'; v_bobby uuid := '22222222-2222-4222-8222-222222222222';
  v_carol uuid := '33333333-3333-4333-8333-333333333333'; v_dave uuid := '44444444-4444-4444-8444-444444444444';
  v_frank uuid := '66666666-6666-4666-8666-666666666666'; v_gina uuid := '77777777-7777-4777-8777-777777777777';
  v_hank uuid := '88888888-8888-4888-8888-888888888888';
begin
  perform public._as_user(v_alice::text);
  v_gid := (public.create_community('Matris ' || p_level, 'açıklama ' || p_level, p_level, null, 50, array[v_bobby, v_carol, v_dave, v_gina]::uuid[],
    'general', 'members', 'members', null, false) ->> 'group_id')::uuid;
  foreach v_u in array array[v_bobby, v_carol, v_dave, v_gina] loop
    perform public._as_user(v_u::text);
    perform public.respond_community_invitation((select id from public.chat_group_invitations where group_id = v_gid and invitee_id = v_u and status = 'pending'), true, false);
  end loop;
  perform public._as_user(v_alice::text);
  perform public.set_chat_group_member_role(v_gid, v_bobby, 'admin');
  perform public.set_chat_group_member_role(v_gid, v_carol, 'moderator');
  perform public.share_to_community(v_gid, 'prompt', 'a0000000-0000-4000-8000-000000000001', 'gönderi');
  perform public.publish_community_announcement(v_gid, 'Duyuru', 'gövde', false, false, false);
  perform public.create_community_event(v_gid, 'Etkinlik', null, now() + interval '2 days', null, 'Europe/Istanbul', null, null, false);
  insert into public.messages (conversation_id, sender_id, body) values (v_gid, v_alice, 'sohbet ' || p_level);
  insert into storage.objects (bucket_id, name, owner) values
    ('community-avatars', v_alice || '/group-' || v_gid || '.jpg', v_alice),
    ('message-images', v_gid || '/' || v_alice || '/p.jpg', v_alice);
  update public.chat_groups set avatar_url = 'https://x.supabase.co/storage/v1/object/public/community-avatars/' || v_alice || '/group-' || v_gid || '.jpg' where id = v_gid;
  perform public._as_user(v_gina::text);
  perform public.leave_chat_group(v_gid);
  if p_level = 'restricted' then
    perform public._as_user(v_frank::text);
    perform public.request_join_community(v_gid, null, false);
  elsif p_level = 'private' then
    perform public._as_user(v_alice::text);
    v_tok := public.create_chat_group_link(v_gid, 24, null) ->> 'token';
    insert into public._ctx values ('tok_private', v_tok);
    perform public._as_user(v_frank::text);
    perform public.join_community_via_link(v_tok, null, false);
  end if;
  perform public._as_user(v_alice::text);
  perform public.invite_to_chat_group(v_gid, array[v_hank]);
  return v_gid;
end $$;

select 'gid' as k, public._mk('public') as v \gset pub_
select 'gid' as k, public._mk('restricted') as v \gset res_
select 'gid' as k, public._mk('private') as v \gset prv_
insert into public._ctx values ('public', :'pub_v'), ('restricted', :'res_v'), ('private', :'prv_v');
reset role;
select public._check(1, 'fixture: üç topluluk kuruldu; üyeler 4 (gina ayrıldı), bekleyen başvuru yalnız kapalı/tamamen kapalıda',
  (select count(*) from public.chat_groups where id in (public._g('public'), public._g('restricted'), public._g('private'))) = 3
  and (select min(member_count) from public.chat_groups where id in (public._g('public'), public._g('restricted'), public._g('private'))) = 4
  and (select count(*) from public.chat_group_join_requests where status = 'pending') = 2
  and (select count(*) from public.community_posts) = 3
  and (select count(*) from storage.objects where bucket_id = 'community-avatars') = 3);

-- ============================================================================
-- 1. Erişim matrisi
-- ============================================================================

-- Bir aktörün (şu anki rol + JWT altında, süper kullanıcı OLMADAN) topluluğa her kanaldan ne gördüğü. Hata → -1 (erişim yok).
create or replace function public._cnt(q text) returns integer language plpgsql as $$
declare r integer;
begin execute q into r; return r; exception when others then return -1; end $$;
create or replace function public._n(q text) returns integer language sql as $$ select greatest(public._cnt(q), 0) $$;
grant execute on function public._cnt(text), public._n(text) to public;

create or replace function public._probe(p_gid uuid, p_term text) returns jsonb language plpgsql as $$
declare
  v_av text := (select split_part(substring(avatar_url from 'community-avatars/(.*)$'), '', 1) from public._avatar_of(p_gid));
begin
  return jsonb_build_object(
    'card_tbl', public._n(format('select count(*) from public.chat_groups where id = %L', p_gid)),
    'card_rpc', public._n(format('select count(*) from public.community_cards(array[%L]::uuid[])', p_gid)),
    'conv', public._n(format('select count(*) from public.conversations where id = %L', p_gid)),
    'members_tbl', public._n(format('select count(*) from public.conversation_members where conversation_id = %L', p_gid)),
    'posts', public._n(format('select count(*) from public.community_posts where community_id = %L', p_gid)),
    'anns', public._n(format('select count(*) from public.community_announcements where community_id = %L', p_gid)),
    'events', public._n(format('select count(*) from public.community_events where community_id = %L', p_gid)),
    'msgs', public._n(format('select count(*) from public.messages where conversation_id = %L', p_gid)),
    'members_rpc', public._n(format('select count(*) from public.community_members(%L, null, null, 50, 0)', p_gid)),
    'members_rpc2', public._n(format('select count(*) from public.chat_group_members(%L)', p_gid)),
    'stats', case when public._n(format('select (public.community_stats(%L, 30) is not null)::int', p_gid)) = 1 then 1 else 0 end,
    'last_msgs', public._n(format('select count(*) from public.conversation_last_messages(array[%L]::uuid[])', p_gid)),
    'msg_search', public._n(format($q$select count(*) from public.search_conversation_messages(%L, 'sohbet', 10, null, null)$q$, p_gid)),
    'avatar_obj', public._n(format($q$select count(*) from storage.objects where bucket_id = 'community-avatars' and name like %L$q$, '%group-' || p_gid || '.jpg')),
    'img_obj', public._n(format($q$select count(*) from storage.objects where bucket_id = 'message-images' and name like %L$q$, p_gid || '/%')),
    'discover', public._n(format('select count(*) from public.discover_communities(null, ''popular'', null, 50, 0) where id = %L', p_gid)),
    'search', public._n(format('select count(*) from public.search_communities(%L, null, 50, 0) where id = %L', p_term, p_gid)),
    'suggest', public._n(format('select count(*) from public.suggest_communities(20) where id = %L', p_gid)),
    'can_read', public._n(format('select public.can_read_community(%L)::int', p_gid))
  );
end $$;
grant execute on function public._probe(uuid, text) to public;
create or replace function public._avatar_of(p_gid uuid) returns table (avatar_url text) language sql security definer as
  $$ select avatar_url from public.chat_groups where id = p_gid $$;
grant execute on function public._avatar_of(uuid) to public;

-- BEKLENEN değer: düzeyin kuralından ve aktörün rolünden türetilir (probe sonucundan DEĞİL).
create or replace function public._expect(p_level text, p_actor text) returns jsonb language plpgsql immutable as $$
declare
  v_member boolean := p_actor in ('alice', 'bobby', 'carol', 'dave');
  v_pend boolean := p_actor = 'frank' and p_level in ('restricted', 'private');
  v_inv boolean := p_actor = 'hank';
  v_card int := case when v_member or p_level in ('public', 'restricted') or v_pend or v_inv then 1 else 0 end;
  v_content int := case when v_member or p_level = 'public' then 1 else 0 end;
  v_m int := case when v_member then 1 else 0 end;
begin
  return jsonb_build_object(
    'card_tbl', v_m, 'card_rpc', v_card, 'conv', v_m, 'members_tbl', v_m,
    'posts', v_content, 'anns', v_content, 'events', v_content, 'msgs', v_m,
    'members_rpc', case when v_member then 4 else 0 end, 'members_rpc2', case when v_member then 4 else 0 end,
    'stats', case when p_actor in ('alice', 'bobby') then 1 else 0 end,
    'last_msgs', v_m, 'msg_search', v_m,
    'avatar_obj', v_card, 'img_obj', v_m,
    'discover', case when p_level = 'public' then 1 else 0 end,
    'search', case when p_level <> 'private' then 1 else 0 end,
    'suggest', case when p_actor <> 'anon' and not v_member and p_level <> 'private' and not v_pend and not v_inv then 1 else 0 end,
    'can_read', v_content
  );
end $$;
grant execute on function public._expect(text, text) to public;

create or replace function public._run_matrix() returns void language plpgsql as $$
declare
  v_levels text[] := array['public', 'restricted', 'private'];
  v_actors text[] := array['anon', 'erin', 'frank', 'hank', 'gina', 'dave', 'carol', 'bobby', 'alice'];
  v_uid constant jsonb := jsonb_build_object(
    'alice', '11111111-1111-4111-8111-111111111111', 'bobby', '22222222-2222-4222-8222-222222222222', 'carol', '33333333-3333-4333-8333-333333333333',
    'dave', '44444444-4444-4444-8444-444444444444', 'erin', '55555555-5555-4555-8555-555555555555', 'frank', '66666666-6666-4666-8666-666666666666',
    'gina', '77777777-7777-4777-8777-777777777777', 'hank', '88888888-8888-4888-8888-888888888888');
  l text; a text; v_gid uuid; v_act jsonb; v_exp jsonb; i int := 0; v_diff text;
begin
  foreach l in array v_levels loop
    v_gid := public._g(l);
    foreach a in array v_actors loop
      i := i + 1;
      if a = 'anon' then
        perform public._as_user('');
        execute 'set role anon';
      else
        perform public._as_user(v_uid ->> a);
        execute 'set role authenticated';
      end if;
      v_act := public._probe(v_gid, 'Matris ' || l);
      execute 'reset role';
      v_exp := public._expect(l, a);
      select string_agg(k || ':' || (v_act ->> k) || '≠' || (v_exp ->> k), ', ') into v_diff from jsonb_object_keys(v_exp) k where v_act -> k is distinct from v_exp -> k;
      insert into public._results values (100 + i, format('matris: %s topluluk · %s', l, a), v_act = v_exp, coalesce(v_diff, ''));
    end loop;
  end loop;
end $$;

select public._run_matrix();

-- ============================================================================
-- 2. Yazma yolları: üye olmayan / bekleyen / davetli / kaldırılmış / ziyaretçi hiçbir kanaldan yazamaz ya da yönetemez
-- ============================================================================
create or replace function public._uid(p_name text) returns text language sql immutable as $$
  select (jsonb_build_object(
    'alice', '11111111-1111-4111-8111-111111111111', 'bobby', '22222222-2222-4222-8222-222222222222', 'carol', '33333333-3333-4333-8333-333333333333',
    'dave', '44444444-4444-4444-8444-444444444444', 'erin', '55555555-5555-4555-8555-555555555555', 'frank', '66666666-6666-4666-8666-666666666666',
    'gina', '77777777-7777-4777-8777-777777777777', 'hank', '88888888-8888-4888-8888-888888888888') ->> p_name) $$;
grant execute on function public._uid(text) to public;

-- Aktör kimliğine bürün (süper kullanıcıdan çık): anon → rol anon; diğerleri → authenticated + sub.
create or replace function public._become(p_actor text) returns void language plpgsql as $$
begin
  execute 'reset role';
  if p_actor = 'anon' then perform public._as_user(''); execute 'set role anon';
  else perform public._as_user(public._uid(p_actor)); execute 'set role authenticated'; end if;
end $$;
grant execute on function public._become(text) to public;

create or replace function public._cell(p_gid uuid, p_level text, p_actor text, p_term text, p_expect_as text default null) returns text language plpgsql as $$
declare v_act jsonb; v_exp jsonb; v_diff text;
begin
  perform public._become(p_actor);
  v_act := public._probe(p_gid, p_term);
  execute 'reset role';
  v_exp := public._expect(p_level, coalesce(p_expect_as, p_actor));
  select string_agg(k || ':' || (v_act ->> k) || '≠' || (v_exp ->> k), ', ') into v_diff from jsonb_object_keys(v_exp) k where v_act -> k is distinct from v_exp -> k;
  return coalesce(v_diff, '');
end $$;
grant execute on function public._cell(uuid, text, text, text, text) to public;

-- Hangi yazma/yönetim girişimleri BAŞARILI oldu (boş dizi = hepsi reddedildi). Çağıran rol/kimlik altında çalışır.
create or replace function public._writes_that_succeeded(p_gid uuid) returns text[] language plpgsql as $fn$
declare
  v_msg uuid := (select id from public._msg_of(p_gid));
  v_ok text[] := '{}'; v_n integer; v_item text; v_q text;
  v_erin uuid := public._uid('erin')::uuid; v_dave uuid := public._uid('dave')::uuid; v_me uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  v_dml text[] := array[
    format($$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'sızıntı')$$, p_gid, v_me),
    format($$insert into public.conversation_members (conversation_id, user_id, role, status) values (%L, %L, 'member', 'accepted')$$, p_gid, v_me),
    format($$insert into public.conversation_members (conversation_id, user_id, role, status) values (%L, %L, 'owner', 'accepted')$$, p_gid, v_me),
    format($$update public.conversation_members set role = 'owner' where conversation_id = %L and user_id = %L$$, p_gid, v_me),
    format($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji) values (%L, %L, %L, '👍')$$, v_msg, p_gid, v_me),
    format($$insert into public.message_stars (message_id, user_id) values (%L, %L)$$, v_msg, v_me),
    format($$insert into public.pinned_messages (conversation_id, message_id, pinned_by) values (%L, %L, %L)$$, p_gid, v_msg, v_me),
    format($$insert into public.community_posts (community_id, author_id, content_type, prompt_id) values (%L, %L, 'prompt', 'a0000000-0000-4000-8000-000000000001')$$, p_gid, v_me),
    format($$insert into public.chat_group_join_requests (group_id, user_id) values (%L, %L)$$, p_gid, v_me),
    format($$insert into public.chat_group_invitations (group_id, invitee_id, inviter_id) values (%L, %L, %L)$$, p_gid, v_me, v_me),
    format($$update public.chat_groups set visibility = 'public', name = 'ele geçirildi' where id = %L$$, p_gid),
    format($$delete from public.chat_groups where id = %L$$, p_gid),
    format($$update public.community_posts set note = 'x' where community_id = %L$$, p_gid),
    format($$delete from public.community_announcements where community_id = %L$$, p_gid),
    format($$update public.messages set body = 'değiştirildi' where conversation_id = %L$$, p_gid),
    format($$delete from public.conversation_members where conversation_id = %L and user_id = %L$$, p_gid, v_dave),
    format($$update public.notifications set is_read = true where recipient_id = %L$$, v_dave)
  ];
  v_rpc text[] := array[
    format($$select public.share_to_community(%L, 'prompt', 'a0000000-0000-4000-8000-000000000001', 'x')$$, p_gid),
    format($$select public.publish_community_announcement(%L, 't', 'b', false, false, false)$$, p_gid),
    format($$select public.create_community_event(%L, 't', null, now() + interval '1 day', null, 'Europe/Istanbul', null, null, false)$$, p_gid),
    format($$select public.invite_to_chat_group(%L, array[%L]::uuid[])$$, p_gid, v_erin),
    format($$select public.create_chat_group_link(%L, 24, null)$$, p_gid),
    format($$select public.update_community(%L, '{"category":"audio"}'::jsonb)$$, p_gid),
    format($$select public.update_chat_group(%L, '{"name":"x"}'::jsonb)$$, p_gid),
    format($$select public.update_chat_group_owner_settings(%L, '{"history_visible":true}'::jsonb)$$, p_gid),
    format($$select public.set_chat_group_visibility(%L, 'public')$$, p_gid),
    format($$select public.remove_chat_group_member(%L, %L, false, null)$$, p_gid, v_dave),
    format($$select public.set_chat_group_member_role(%L, %L, 'admin')$$, p_gid, v_me),
    format($$select public.transfer_chat_group_ownership(%L, %L)$$, p_gid, v_me),
    format($$select public.close_community(%L)$$, p_gid),
    format($$select public.delete_chat_group(%L)$$, p_gid),
    format($$select public.leave_chat_group(%L)$$, p_gid),
    format($$select public.accept_community_rules(%L)$$, p_gid),
    format($$select public.mark_conversation_read_up_to(%L, now())$$, p_gid),
    format($$select public.decide_chat_group_join_request(gen_random_uuid(), true)$$),
    format($$select public.set_community_post_pinned(gen_random_uuid(), true)$$),
    format($$select public.moderate_community_post(gen_random_uuid(), 'x')$$)
  ];
begin
  -- Reddedilme yalnız YETKİ/İŞ KURALI hatasıdır (42501 yetki/RLS, P0001 RPC `raise exception`). Başka her hata (bozuk sütun, söz dizimi,
  -- kısıt ihlali — RLS kontrolü kısıtlardan ÖNCE çalıştığından 23xxx "RLS geçti" demektir) test sorgusunun kendisi hatalıdır → bayraklanır.
  foreach v_q in array v_dml loop
    begin
      execute v_q; get diagnostics v_n = row_count;
      if v_n > 0 then v_ok := v_ok || ('BAŞARILI: ' || left(v_q, 70)); end if;
    exception when others then
      if sqlstate not in ('42501', 'P0001') then v_ok := v_ok || ('HATALI-SORGU ' || sqlstate || ': ' || left(v_q, 60)); end if;
    end;
  end loop;
  foreach v_q in array v_rpc loop
    begin
      execute v_q; v_ok := v_ok || ('BAŞARILI: ' || left(v_q, 70));
    exception when others then
      if sqlstate not in ('42501', 'P0001') then v_ok := v_ok || ('HATALI-SORGU ' || sqlstate || ': ' || left(v_q, 60)); end if;
    end;
  end loop;
  return v_ok;
end $fn$;
grant execute on function public._writes_that_succeeded(uuid) to public;
create or replace function public._msg_of(p_gid uuid) returns table (id uuid) language sql security definer as
  $$ select id from public.messages where conversation_id = p_gid order by created_at limit 1 $$;
grant execute on function public._msg_of(uuid) to public;

create or replace function public._run_denials() returns void language plpgsql as $$
declare l text; a text; v_ok text[]; i int := 0; v_ctl uuid;
begin
  foreach l in array array['public', 'restricted', 'private'] loop
    foreach a in array array['anon', 'erin', 'frank', 'hank', 'gina'] loop
      i := i + 1;
      perform public._become(a);
      v_ok := public._writes_that_succeeded(public._g(l));
      execute 'reset role';
      insert into public._results values (200 + i, format('yazma: %s topluluk · %s hiçbir yazma/yönetim girişimini başaramaz', l, a), coalesce(array_length(v_ok, 1), 0) = 0, coalesce(array_to_string(v_ok, ' | '), ''));
    end loop;
  end loop;
  -- Pozitif kontrol (atılabilir bir toplulukta): aynı girişimler SAHİPTE çalışır → reddedilme yanlış yazılmış sorgudan değil yetkiden gelir.
  execute 'reset role';
  v_ctl := public._mk('restricted');
  perform public._become('alice');
  v_ok := public._writes_that_succeeded(v_ctl);
  execute 'reset role';
  insert into public._results values (299, 'yazma: pozitif kontrol — sahip aynı girişimlerin çoğunu başarır (sorgular geçerli)', (select count(*) from unnest(v_ok) x where x like 'BAŞARILI:%') >= 8 and not exists (select 1 from unnest(v_ok) x where x like 'HATALI-SORGU%'), coalesce(array_to_string(v_ok, ' | '), ''));
end $$;

select public._run_denials();


create or replace function public._card_visible(p_actor text, p_gid uuid) returns integer language plpgsql as $$
declare n integer;
begin
  perform public._become(p_actor);
  n := public._n(format('select count(*) from public.community_cards(array[%L]::uuid[])', p_gid));
  execute 'reset role';
  return n;
end $$;
grant execute on function public._card_visible(text, uuid) to public;
create or replace function public._reqid(p_group uuid, p_user uuid) returns uuid language sql stable security definer as
  $$ select id from public.chat_group_join_requests where group_id = p_group and user_id = p_user and status = 'pending' order by created_at desc limit 1 $$;
create or replace function public._req_any(p_group uuid, p_user uuid) returns table (id uuid) language sql stable security definer as
  $$ select id from public.chat_group_join_requests where group_id = p_group and user_id = p_user order by created_at desc limit 1 $$;
grant execute on function public._reqid(uuid, uuid), public._req_any(uuid, uuid) to public;

-- ============================================================================
-- 3. Katılma yolları: doğrudan · başvuru · davet · bağlantı — durumlar ve sızıntısızlık
-- ============================================================================
-- (a) Var olmayan topluluk ile tamamen kapalı topluluk AYNI hatayı verir (varlık sızmaz).
select public._become('erin');
select public._tk('j_none', format($q$select public.request_join_community(%L, null, false)$q$, gen_random_uuid()));
select public._tk('j_prv_req', format($q$select public.request_join_community(%L, null, false)$q$, public._g('private')));
select public._tk('j_prv_join', format($q$select public.join_community(%L, false)$q$, public._g('private')));
select public._tk('j_prv_join2', format($q$select public.join_chat_group(%L)$q$, public._g('private')));
select public._tk('j_res_join', format($q$select public.join_community(%L, false)$q$, public._g('restricted')));
select public._tk('j_none2', format($q$select public.join_community(%L, false)$q$, gen_random_uuid()));
reset role;
select public._check(300, 'katılma: tamamen kapalı topluluğa başvuru/doğrudan katılım, var olmayan topluluğla AYNI hatayı verir (group_not_found); kapalıya doğrudan katılım yok',
  public._r('j_none') = public._r('j_prv_req') and public._r('j_prv_req') like '%group_not_found%'
  and public._r('j_prv_join') = public._r('j_none2') and public._r('j_prv_join') like '%group_not_found%'
  and public._r('j_prv_join2') like '%group_not_found%' and public._r('j_res_join') like '%group_not_found%',
  public._r('j_none') || ' / ' || public._r('j_prv_req') || ' / ' || public._r('j_prv_join'));

-- (b) Kapalı: başvuru → bekleyen; yinelenen aktif başvuru yok (RPC "already_requested", tablo benzersiz dizini); üye olmadan içerik yok.
select public._become('erin');
select public._tk('r1', format($q$select public.request_join_community(%L, 'selam', false)$q$, public._g('restricted')));
select public._tk('r2', format($q$select public.request_join_community(%L, 'tekrar', false)$q$, public._g('restricted')));
reset role;
select public._check(301, 'başvuru: kapalı topluluğa tek bekleyen başvuru oluşur, yineleme yeni satır açmaz; başvuran üye DEĞİL ve içerik göremez',
  public._r('r1') = 'ok' and public._r('r2') = 'ok'
  and (select count(*) from public.chat_group_join_requests where group_id = public._g('restricted') and user_id = public._uid('erin')::uuid and status = 'pending') = 1
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('restricted') and user_id = public._uid('erin')::uuid)
  and public._try(format($q$insert into public.chat_group_join_requests (group_id, user_id) values (%L, %L)$q$, public._g('restricted'), public._uid('erin'))) like '%duplicate key%'
  and public._cell(public._g('restricted'), 'restricted', 'erin', 'Matris restricted') like '%suggest:0≠1%'
  and (select count(*) from public.notifications where recipient_id = public._uid('alice')::uuid and message like '%Matris restricted%katılma isteği%') >= 1);

-- (c) Başvuruyu yalnız yetkili karar verir: üye/başvuran/yabancı veremez; moderatör (manage_requests) verir; çifte karar geçersiz.
select public._become('dave');
select public._tk('d_member', format($q$select public.decide_chat_group_join_request(%L, true)$q$, public._reqid(public._g('restricted'), public._uid('erin')::uuid)));
select public._become('erin');
select public._tk('d_self', format($q$select public.decide_chat_group_join_request(%L, true)$q$, public._reqid(public._g('restricted'), public._uid('erin')::uuid)));
select public._become('carol');
select public._tk('d_mod', format($q$select public.decide_chat_group_join_request(%L, true)$q$, public._reqid(public._g('restricted'), public._uid('erin')::uuid)));
select public._tk('d_twice', format($q$select public.decide_chat_group_join_request(%L, true)$q$, (select id from public._req_any(public._g('restricted'), public._uid('erin')::uuid))));
reset role;
select public._check(302, 'karar: sıradan üye ve başvuranın kendisi onaylayamaz; moderatör onaylar; ikinci karar reddedilir; onaylanan artık üyedir ve içerik görür',
  public._r('d_member') like '%forbidden%' and public._r('d_self') like '%forbidden%' and public._r('d_mod') = 'ok' and public._r('d_twice') not like 'ok'
  and exists (select 1 from public.conversation_members where conversation_id = public._g('restricted') and user_id = public._uid('erin')::uuid and role = 'member'));
select public._become('erin');
select public._check(303, 'karar: onaylanan kişinin erişimi derhal açılır (gönderiler ve üye listesi); katılmadan ÖNCEKİ sohbet geçmişi varsayılan olarak görünmez (history_visible kapalı)',
  (select count(*) from public.messages where conversation_id = public._g('restricted')) = 0
  and (select count(*) from public.community_posts where community_id = public._g('restricted')) = 1
  and (select count(*) from public.community_members(public._g('restricted'), null, null, 50, 0)) = 5);
reset role;

-- (d) Bağlantı: geçersiz · bilinmeyen · iptal · süresi dolmuş · kullanım limiti dolmuş → hepsi AYNI "invalid_link", önizleme valid:false.
--     Geçerli bağlantı tamamen kapalı toplulukta ÜYELİK değil BAŞVURU oluşturur (davet bağlantısı tek başına içerik erişimi vermez).
select public._become('alice');
create temp table _lk_rev as select public.create_chat_group_link(public._g('private'), 24, null) as j;
create temp table _lk_exp as select public.create_chat_group_link(public._g('private'), 24, null) as j;
create temp table _lk_max as select public.create_chat_group_link(public._g('private'), 24, 1) as j;
select public.revoke_chat_group_link((select (j->>'link_id')::uuid from _lk_rev));
reset role;
update public.chat_group_links set expires_at = now() - interval '1 hour' where id = (select (j->>'link_id')::uuid from _lk_exp);
update public.chat_group_links set use_count = 1 where id = (select (j->>'link_id')::uuid from _lk_max);
select public._become('erin');
select public._tk('lk_a', format($q$select public.join_community_via_link(%L, null, false)$q$, (select j->>'token' from _lk_rev)));
select public._tk('lk_b', format($q$select public.join_community_via_link(%L, null, false)$q$, (select j->>'token' from _lk_exp)));
select public._tk('lk_c', format($q$select public.join_community_via_link(%L, null, false)$q$, (select j->>'token' from _lk_max)));
select public._tk('lk_d', format($q$select public.join_community_via_link(%L, null, false)$q$, repeat('A', 43)));
select public._tk('lk_e', $q$select public.join_community_via_link('kisa', null, false)$q$);
select public._tk('lk_f', format($q$select public.join_chat_group_via_link(%L)$q$, (select j->>'token' from _lk_rev)));
create temp table _pv as
  select public.preview_community_link((select j->>'token' from _lk_rev)) as a, public.preview_community_link((select j->>'token' from _lk_exp)) as b,
         public.preview_community_link((select j->>'token' from _lk_max)) as c, public.preview_community_link(repeat('A', 43)) as d;
reset role;
select public._check(304, 'bağlantı: iptal edilmiş / süresi dolmuş / limiti dolmuş / bilinmeyen / bozuk token AYNI hatayı verir; önizleme ad ve görsel sızdırmaz; hiçbiri başvuru ya da üyelik oluşturmaz',
  public._r('lk_a') like '%invalid_link%' and public._r('lk_b') like '%invalid_link%' and public._r('lk_c') like '%invalid_link%'
  and public._r('lk_d') like '%invalid_link%' and public._r('lk_e') like '%invalid_link%' and public._r('lk_f') like '%invalid_link%'
  and (select (a->>'valid')::boolean is not true and (b->>'valid')::boolean is not true and (c->>'valid')::boolean is not true and (d->>'valid')::boolean is not true
         and a ? 'name' = false and b ? 'name' = false and c ? 'name' = false and d ? 'name' = false from _pv)
  and not exists (select 1 from public.chat_group_join_requests where group_id = public._g('private') and user_id = public._uid('erin')::uuid)
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('private') and user_id = public._uid('erin')::uuid));

select public._become('alice');
create temp table _lk_ok as select public.create_chat_group_link(public._g('private'), 24, null) as j;
reset role;
select public._become('erin');
select public._tk('lk_ok', format($q$select public.join_community_via_link(%L, 'bağlantıyla', false)$q$, (select j->>'token' from _lk_ok)));
reset role;
select public._check(305, 'bağlantı: geçerli bağlantı tamamen kapalı toplulukta BAŞVURU açar (üyelik değil); içerik erişimi yok; token veritabanında yalnız özet olarak durur',
  public._r('lk_ok') = 'ok'
  and exists (select 1 from public.chat_group_join_requests where group_id = public._g('private') and user_id = public._uid('erin')::uuid and status = 'pending')
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('private') and user_id = public._uid('erin')::uuid)
  and public._cell(public._g('private'), 'private', 'erin', 'Matris private') like '%card_rpc:1≠0%'
  and not exists (select 1 from public.chat_group_links where token_hash = (select j->>'token' from _lk_ok))
  and exists (select 1 from public.chat_group_links where token_hash = encode(extensions.digest((select j->>'token' from _lk_ok), 'sha256'), 'hex')));

-- (e) Doğrudan davet: hank'ın bekleyen daveti kabul → üyelik sunucuda oluşur; reddedilmiş / süresi geçmiş / iptal edilmiş davet kullanılamaz ve kartı açmaz.
select public._become('hank');
select public._tk('iv_ok', format($q$select public.respond_community_invitation(%L, true, false)$q$,
  (select id from public.chat_group_invitations where group_id = public._g('private') and invitee_id = public._uid('hank')::uuid and status = 'pending')));
reset role;
select public._check(306, 'davet: tamamen kapalı toplulukta davet kabulü üyelik kaydını sunucuda oluşturur; kabulden sonra içerik/sohbet okunur',
  public._r('iv_ok') = 'ok'
  and exists (select 1 from public.conversation_members where conversation_id = public._g('private') and user_id = public._uid('hank')::uuid and role = 'member')
  and (select count(*) from public.chat_group_invitations where group_id = public._g('private') and invitee_id = public._uid('hank')::uuid and status = 'pending') = 0);

-- hank'a başka bir (restricted) davet: önce reddedilir, sonra iptal/süre dolumu denenir
insert into public.chat_group_invitations (id, group_id, invitee_id, inviter_id, status, expires_at, responded_at) values
  ('f1000000-0000-4000-8000-000000000001', public._g('private'), public._uid('gina')::uuid, public._uid('alice')::uuid, 'pending', now() - interval '1 day', null),
  ('f1000000-0000-4000-8000-000000000002', public._g('private'), public._uid('frank')::uuid, public._uid('alice')::uuid, 'cancelled', now() + interval '1 day', now());
select public._become('gina');
create temp table _iv_exp as select public.respond_community_invitation('f1000000-0000-4000-8000-000000000001', true, false) as j;
reset role;
select public._become('frank');
select public._tk('iv_can', $q$select public.respond_community_invitation('f1000000-0000-4000-8000-000000000002', true, false)$q$);
reset role;
select public._check(307, 'davet: süresi geçmiş ve iptal edilmiş davet kabul edilemez; üyelik oluşmaz; süresi geçmiş davet kartı açmaz',
  (select j->>'outcome' from _iv_exp) = 'expired' and public._r('iv_can') <> 'ok'
  and not exists (select 1 from public.conversation_members where conversation_id = public._g('private') and user_id in (public._uid('gina')::uuid))
  and public._card_visible('gina', public._g('private')) = 0);

-- ============================================================================
-- 4. Roller ve yetki sınırları (genel topluluk: alice sahip · bobby yönetici · carol moderatör · dave üye)
-- ============================================================================
create or replace function public._all_refused(p_actor text, p_queries text[]) returns text language plpgsql as $fn$
declare q text; v_bad text[] := '{}'; v_state text;
begin
  perform public._become(p_actor);
  foreach q in array p_queries loop
    begin execute q; v_bad := v_bad || ('BAŞARILI: ' || left(q, 80));
    exception when others then
      if sqlstate not in ('42501', 'P0001') then v_bad := v_bad || ('HATALI-SORGU ' || sqlstate || ': ' || left(q, 70)); end if;
    end;
  end loop;
  execute 'reset role';
  return coalesce(array_to_string(v_bad, ' | '), '');
end $fn$;
grant execute on function public._all_refused(text, text[]) to public;

select public._check(400, 'rol: sıradan üye yönetim yeteneklerinden HİÇBİRİNİ kullanamaz (rol/çıkarma/yasak/görünürlük/davet/bağlantı/ayar/kapatma/silme/devir/duyuru/etkinlik)',
  public._all_refused('dave', array[
    format($q$select public.set_chat_group_member_role(%L, %L, 'admin')$q$, public._g('public'), public._uid('carol')),
    format($q$select public.remove_chat_group_member(%L, %L, false, null)$q$, public._g('public'), public._uid('carol')),
    format($q$select public.remove_chat_group_member(%L, %L, true, 'x')$q$, public._g('public'), public._uid('carol')),
    format($q$select public.set_chat_group_visibility(%L, 'private')$q$, public._g('public')),
    format($q$select public.invite_to_chat_group(%L, array[%L]::uuid[])$q$, public._g('public'), public._uid('erin')),
    format($q$select public.create_chat_group_link(%L, 24, null)$q$, public._g('public')),
    format($q$select public.update_community(%L, '{"category":"audio"}'::jsonb)$q$, public._g('public')),
    format($q$select public.update_chat_group(%L, '{"name":"ele geçti"}'::jsonb)$q$, public._g('public')),
    format($q$select public.update_chat_group_owner_settings(%L, '{"history_visible":true}'::jsonb)$q$, public._g('public')),
    format($q$select public.close_community(%L)$q$, public._g('public')),
    format($q$select public.delete_chat_group(%L)$q$, public._g('public')),
    format($q$select public.transfer_chat_group_ownership(%L, %L)$q$, public._g('public'), public._uid('dave')),
    format($q$select public.publish_community_announcement(%L, 't', 'b', false, false, false)$q$, public._g('public')),
    format($q$select public.create_community_event(%L, 't', null, now() + interval '1 day', null, 'Europe/Istanbul', null, null, false)$q$, public._g('public')),
    format($q$select public.decide_chat_group_join_request(gen_random_uuid(), true)$q$),
    format($q$select public.moderate_community_post(gen_random_uuid(), 'x')$q$),
    format($q$select community_stats from public.community_stats(%L, 30)$q$, public._g('public'))
  ]) = '' and (select role from public.conversation_members where conversation_id = public._g('public') and user_id = public._uid('dave')::uuid) = 'member');

select public._check(401, 'rol: moderatör rol/yasak/görünürlük/davet/ayar/kapatma/silme/devir yapamaz (yalnız başvuru + içerik moderasyonu)',
  public._all_refused('carol', array[
    format($q$select public.set_chat_group_member_role(%L, %L, 'admin')$q$, public._g('public'), public._uid('dave')),
    format($q$select public.remove_chat_group_member(%L, %L, true, 'x')$q$, public._g('public'), public._uid('dave')),
    format($q$select public.set_chat_group_visibility(%L, 'private')$q$, public._g('public')),
    format($q$select public.invite_to_chat_group(%L, array[%L]::uuid[])$q$, public._g('public'), public._uid('erin')),
    format($q$select public.create_chat_group_link(%L, 24, null)$q$, public._g('public')),
    format($q$select public.update_community(%L, '{"category":"audio"}'::jsonb)$q$, public._g('public')),
    format($q$select public.update_chat_group_owner_settings(%L, '{"history_visible":true}'::jsonb)$q$, public._g('public')),
    format($q$select public.close_community(%L)$q$, public._g('public')),
    format($q$select public.delete_chat_group(%L)$q$, public._g('public')),
    format($q$select public.transfer_chat_group_ownership(%L, %L)$q$, public._g('public'), public._uid('carol')),
    format($q$select community_stats from public.community_stats(%L, 30)$q$, public._g('public'))
  ]) = '');

select public._check(402, 'rol: yönetici sahibi çıkaramaz/yasaklayamaz/rolünü düşüremez, sahipliği devredemez, topluluğu silemez, sahip ayarlarını değiştiremez',
  public._all_refused('bobby', array[
    format($q$select public.remove_chat_group_member(%L, %L, false, null)$q$, public._g('public'), public._uid('alice')),
    format($q$select public.remove_chat_group_member(%L, %L, true, 'x')$q$, public._g('public'), public._uid('alice')),
    format($q$select public.set_chat_group_member_role(%L, %L, 'member')$q$, public._g('public'), public._uid('alice')),
    format($q$select public.transfer_chat_group_ownership(%L, %L)$q$, public._g('public'), public._uid('bobby')),
    format($q$select public.delete_chat_group(%L)$q$, public._g('public')),
    format($q$select public.update_chat_group_owner_settings(%L, '{"history_visible":true}'::jsonb)$q$, public._g('public')),
    format($q$select public.set_chat_group_member_role(%L, %L, 'owner')$q$, public._g('public'), public._uid('bobby'))
  ]) = '');

-- Sahiplik: ayrılamaz · kendini çıkaramaz · devir sonrası tek sahip · son sahip silinse bile sahipsiz topluluk oluşmaz.
select public._become('alice');
select public._tk('o_leave', format($q$select public.leave_chat_group(%L)$q$, public._g('public')));
select public._tk('o_self', format($q$select public.remove_chat_group_member(%L, %L, false, null)$q$, public._g('public'), public._uid('alice')));
select public._tk('o_xfer', format($q$select public.transfer_chat_group_ownership(%L, %L)$q$, public._g('public'), public._uid('bobby')));
reset role;
select public._become('bobby');
select public._tk('o_back', format($q$select public.transfer_chat_group_ownership(%L, %L)$q$, public._g('public'), public._uid('alice')));
reset role;
select public._check(403, 'sahiplik: sahip devretmeden ayrılamaz / kendini çıkaramaz; devir tek sahip bırakır ve geri alınabilir; sahipsiz topluluk oluşmaz',
  public._r('o_leave') like '%owner_must_transfer%' and public._r('o_self') not like 'ok' and public._r('o_xfer') = 'ok' and public._r('o_back') = 'ok'
  and (select count(*) from public.conversation_members where conversation_id = public._g('public') and role = 'owner') = 1
  and (select user_id from public.conversation_members where conversation_id = public._g('public') and role = 'owner') = public._uid('alice')::uuid);
delete from public.conversation_members where conversation_id = public._g('private') and user_id = public._uid('alice')::uuid;
select public._check(404, 'sahiplik: sahibin üyeliği silinse (hesap silme akışı) bile topluluk sahipsiz kalmaz; en kıdemli yönetici devralır, topluluk silinmez',
  (select count(*) from public.conversation_members where conversation_id = public._g('private') and role = 'owner') = 1
  and exists (select 1 from public.chat_groups where id = public._g('private')));

-- ============================================================================
-- 5. Üyelikten çıkarma / yasaklama: erişim DERHAL kesilir; eski bildirimler temizlenir
-- ============================================================================
insert into public.notifications (recipient_id, actor_id, type, message, target_href, created_at) values
  (public._uid('dave')::uuid, public._uid('alice')::uuid, 'system', 'ESKİ: "Matris restricted" duyurusu', '/communities/local?id=' || public._g('restricted'), now() - interval '2 days'),
  (public._uid('dave')::uuid, public._uid('alice')::uuid, 'system', 'ESKİ: sohbet', '/messages/local?id=' || public._g('restricted') || '&hl=message:x', now() - interval '1 day'),
  (public._uid('dave')::uuid, public._uid('alice')::uuid, 'system', 'ALAKASIZ: başka sohbet', '/messages/local?id=' || gen_random_uuid(), now() - interval '1 day');
select public._become('bobby');
select public._tk('k_kick', format($q$select public.remove_chat_group_member(%L, %L, false, 'kural')$q$, public._g('restricted'), public._uid('dave')));
reset role;
select public._check(405, 'çıkarma: çıkarılan üye derhal yabancı kuralına döner (kart var, içerik/sohbet/üye listesi/görsel yok)',
  public._r('k_kick') = 'ok'
  and public._cell(public._g('restricted'), 'restricted', 'dave', 'Matris restricted', 'erin') = '');
select public._check(406, 'çıkarma: çıkarılanın o topluluğa bağlı ESKİ bildirimleri silindi, alakasız bildirim ve işlemle üretilen "çıkarıldın" bildirimi KALDI',
  not exists (select 1 from public.notifications where recipient_id = public._uid('dave')::uuid and message like 'ESKİ:%')
  and exists (select 1 from public.notifications where recipient_id = public._uid('dave')::uuid and message like 'ALAKASIZ:%')
  and exists (select 1 from public.notifications where recipient_id = public._uid('dave')::uuid and message like 'Seni "Matris restricted" grubundan çıkardı.%'));

-- Yasak: kart/arama/keşif/okuma kapanır, yeniden katılım ve başvuru reddedilir; yasak kalkınca yine yabancı (üye değil).
select public._become('alice');
select public._tk('b_ban', format($q$select public.remove_chat_group_member(%L, %L, true, 'ihlal')$q$, public._g('public'), public._uid('dave')));
reset role;
select public._become('dave');
select public._tk('b_join', format($q$select public.join_community(%L, false)$q$, public._g('public')));
select public._tk('b_req', format($q$select public.request_join_community(%L, null, false)$q$, public._g('public')));
create temp table _ban_probe as select public._probe(public._g('public'), 'Matris public') as j;
reset role;
select public._check(407, 'yasak: yasaklı kişi herkese açık toplulukta bile kart/içerik/keşif/arama/okuma göremez, katılamaz ve başvuramaz',
  public._r('b_ban') = 'ok' and public._r('b_join') like '%cannot_join%' and public._r('b_req') not like 'ok'
  and (select (j->>'card_rpc')::int + (j->>'posts')::int + (j->>'anns')::int + (j->>'events')::int + (j->>'discover')::int + (j->>'search')::int + (j->>'can_read')::int + (j->>'msgs')::int + (j->>'avatar_obj')::int from _ban_probe) = 0);
select public._become('alice');
select public.unban_chat_group_member(public._g('public'), public._uid('dave')::uuid);
reset role;
select public._check(408, 'yasak: yasağı kaldırmak üyeliği GERİ VERMEZ; kişi yeniden katılana dek yabancıdır',
  not exists (select 1 from public.conversation_members where conversation_id = public._g('public') and user_id = public._uid('dave')::uuid)
  and public._cell(public._g('public'), 'public', 'dave', 'Matris public', 'erin') = '');
select public._become('dave');
select public.join_community(public._g('public'), false);
reset role;

-- ============================================================================
-- 6. Görünürlük geçişleri: yeni kural TÜM erişim kanallarında anında geçerli; üyeler silinmez; bildirim tek kez
-- ============================================================================
select public._as_user(public._uid('alice'));
select public._mk('public') as v \gset tr_
insert into public._ctx values ('trans', :'tr_v');
create or replace function public._transition(p_to text) returns text language plpgsql as $$
declare v_gid uuid := public._g('trans'); v_all text := ''; a text; d text;
begin
  perform public._become('alice');
  perform public.set_chat_group_visibility(v_gid, p_to);
  execute 'reset role';
  foreach a in array array['anon', 'erin', 'dave', 'carol', 'bobby', 'alice'] loop
    d := public._cell(v_gid, p_to, a, 'Matris public');
    if d <> '' then v_all := v_all || a || '[' || d || '] '; end if;
  end loop;
  return v_all;
end $$;
grant execute on function public._transition(text) to public;
select public._transition('restricted') as v \gset t1_
select public._check(409, 'geçiş: herkese açık → kapalı: içerik/sohbet/keşif anında üyelere kapanır, arama ve kart kalır (ziyaretçi ve yabancı için)', :'t1_v' = '', :'t1_v');
select public._transition('private') as v \gset t2_
select public._check(410, 'geçiş: kapalı → tamamen kapalı: arama/öneri/keşif/kart/görsel yabancı ve ziyaretçi için TEMİZLENİR; üyeler aynen erişir', :'t2_v' = '', :'t2_v');
select public._transition('restricted') as v \gset t3_
select public._transition('public') as v \gset t4_
select public._check(411, 'geçiş: tamamen kapalı → kapalı → herkese açık: yeni kural yeniden anında geçerli', :'t3_v' = '' and :'t4_v' = '', :'t3_v' || :'t4_v');
select public._check(412, 'geçiş: üç değişiklik hiçbir üyeyi silmedi (4 üye, aynı roller); üye bildirimi üretildi',
  (select member_count from public.chat_groups where id = public._g('trans')) = 4
  and (select count(*) from public.conversation_members where conversation_id = public._g('trans')) = 4
  and (select count(*) from public.conversation_members where conversation_id = public._g('trans') and role in ('owner', 'admin', 'moderator')) = 3
  and (select count(*) from public.notifications where recipient_id = public._uid('dave')::uuid and target_href like '%' || public._g('trans')::text || '%' and message like '%grubunu herkese%') >= 1);
select public._become('alice');
select public.set_chat_group_visibility(public._g('trans'), 'public');
reset role;
select public._check(413, 'geçiş: bildirimler yinelenmez (her değişiklik için üye başına en çok 1; aynı düzeye çağrı yeni bildirim üretmez)',
  (select count(*) from public.notifications where recipient_id = public._uid('dave')::uuid and target_href like '%' || public._g('trans')::text || '%' and message like '%grubunu herkese%')
    = (select count(*) from public.chat_group_audit where group_id = public._g('trans') and action = 'visibility_changed'));

-- ============================================================================
-- 7. Birebir mesajlaşma topluluk yetkilendirmesinden etkilenmez (ve onu etkilemez)
-- ============================================================================
select public._become('gina');
select public.start_direct_conversation(public._uid('hank')::uuid)::text as v \gset dm_
reset role;
insert into public._ctx values ('dm1', :'dm_v');
insert into public.messages (conversation_id, sender_id, body) values (public._g('dm1'), public._uid('gina')::uuid, 'gizli dm');
select public._become('hank');
select public._tk('dm_hank_reply', format($q$insert into public.messages (conversation_id, sender_id, body) values (%L, %L, 'cevap')$q$, public._g('dm1'), public._uid('hank')));
select public._n(format('select count(*) from public.messages where conversation_id = %L', public._g('dm1'))) as v \gset dmh_
reset role;
select public._become('alice');
select public._n(format('select count(*) from public.messages where conversation_id = %L', public._g('dm1'))) as v \gset dma_
select public._n(format('select count(*) from public.conversations where id = %L', public._g('dm1'))) as c \gset dma_
reset role;
select public._become('carol');
select public._n(format('select count(*) from public.messages where conversation_id = %L', public._g('dm1'))) as v \gset dmc_
reset role;
select public._become('anon');
select public._n(format('select count(*) from public.messages where conversation_id = %L', public._g('dm1'))) as v \gset dmn_
reset role;
select public._check(414, 'birebir: topluluktan ayrılmış/yasaklı kişiler de birebir yazışır; iki taraf okur; topluluk sahibi/yöneticisi ve ortak topluluk üyeleri OKUYAMAZ; ziyaretçi okuyamaz',
  public._r('dm_hank_reply') = 'ok' and :dmh_v = 2 and :dma_v = 0 and :dma_c = 0 and :dmc_v = 0 and :dmn_v = 0
  and not public.is_group_conversation(public._g('dm1')));
select public._check(415, 'birebir: topluluk üyeliği/rolü/yasağı birebir sohbetin okunurluğunu hiçbir yönde değiştirmez (gina topluluktan ayrılmış, hank site moderatörü değil üye)',
  not exists (select 1 from public.conversation_members where conversation_id = public._g('dm1') and user_id not in (public._uid('gina')::uuid, public._uid('hank')::uuid))
  and (select kind from public.conversations where id = public._g('dm1')) = 'direct');

-- ============================================================================
-- 8. Storage yazma kuralları, görselin karta bağlılığı, eski görsel raporu, silinen topluluğun bildirimleri
-- ============================================================================
insert into public._ctx select 'av_before', count(*)::text from storage.objects where bucket_id = 'community-avatars';
select public._become('erin');
select public._tk('s_own', format($q$insert into storage.objects (bucket_id, name, owner) values ('community-avatars', %L, %L)$q$, public._uid('erin') || '/yeni.jpg', public._uid('erin')));
select public._tk('s_other', format($q$insert into storage.objects (bucket_id, name, owner) values ('community-avatars', %L, %L)$q$, public._uid('alice') || '/sahte.jpg', public._uid('erin')));
select public._tk('s_del', format($q$delete from storage.objects where bucket_id = 'community-avatars' and name like %L$q$, public._uid('alice') || '/%'));
create temp table _s_mine as select public._n($q$select count(*) from storage.objects where bucket_id = 'community-avatars' and name like '55555555%'$q$) as n;
reset role;
select public._become('dave');
create temp table _s_others as select public._n($q$select count(*) from storage.objects where bucket_id = 'community-avatars' and name like '55555555%'$q$) as n;
reset role;
select public._become('anon');
select public._tk('s_anon', format($q$insert into storage.objects (bucket_id, name) values ('community-avatars', 'anon/x.jpg')$q$));
reset role;
select public._check(416, 'storage: kullanıcı yalnız KENDİ klasörüne yükler; başkasının klasörüne yazamaz/silemez; ziyaretçi yükleyemez; karta bağlı olmayan yüklemeyi başkası okuyamaz',
  public._r('s_own') = 'ok' and public._r('s_other') like '%row-level security%' and public._r('s_anon') not like 'ok'
  and (select n from _s_mine) = 1 and (select n from _s_others) = 0
  and (select count(*) from storage.objects where bucket_id = 'community-avatars') = public._ctx_get('av_before')::int + 1);

-- Görsel kartı izler: kart görsele bağlıyken okunur, bağ kopunca (görsel kaldırılınca) yabancı için kapanır.
update public.chat_groups set avatar_url = null where id = public._g('public');
select public._check(417, 'storage: topluluk görselini kaldırınca dosya yabancı ve ziyaretçi için de ÖNCEDEN açık olsa bile okunamaz hâle gelir (yalnız yükleyen görür)',
  public._cell(public._g('public'), 'public', 'erin', 'Matris public') like '%avatar_obj:0≠1%'
  and public._cell(public._g('public'), 'public', 'anon', 'Matris public') like '%avatar_obj:0≠1%'
  and public._cell(public._g('public'), 'public', 'alice', 'Matris public') = '');
update public.chat_groups set avatar_url = 'https://x.supabase.co/storage/v1/object/public/community-avatars/' || public._uid('alice') || '/group-' || public._g('public') || '.jpg' where id = public._g('public');
select public._check(418, 'storage: görsel yeniden bağlanınca okunurluk geri gelir (kart kuralıyla birlikte)', public._cell(public._g('public'), 'public', 'anon', 'Matris public') = '');

update public.chat_groups set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/' || public._uid('alice') || '/group-eski.jpg' where id = public._g('restricted');
select public._become('hank');
create temp table _leg_mod as select count(*) as n from public.community_legacy_avatar_report();
reset role;
select public._become('erin');
select public._tk('leg_user', $q$select count(*) from public.community_legacy_avatar_report()$q$);
reset role;
select public._check(419, 'eski görsel raporu: yalnız site moderatörü görür ve açık olmayan topluluklardaki eski ortak-bucket görsellerini listeler',
  (select n from _leg_mod) >= 1 and public._r('leg_user') like '%forbidden%');

-- Topluluk silinince herkesin o topluluğa bağlı eski bildirimleri gider; alakasızlar kalır.
select public._mk('restricted') as v \gset del_
insert into public._ctx values ('del', :'del_v');
insert into public.notifications (recipient_id, actor_id, type, message, target_href, created_at) values
  (public._uid('dave')::uuid, public._uid('alice')::uuid, 'system', 'SİLİNECEK-1', '/communities/local?id=' || public._g('del'), now() - interval '3 hours'),
  (public._uid('bobby')::uuid, public._uid('alice')::uuid, 'system', 'SİLİNECEK-2', '/messages/local?id=' || public._g('del') || '&panel=requests', now() - interval '3 hours'),
  (public._uid('bobby')::uuid, public._uid('alice')::uuid, 'system', 'KALACAK', '/prompts/local?id=' || gen_random_uuid(), now() - interval '3 hours');
select public._become('alice');
select public.delete_chat_group(public._g('del'));
reset role;
select public._check(420, 'silme: topluluk silinince adını/bağlantısını taşıyan eski bildirimler (tüm alıcılar) temizlenir; alakasız bildirimler kalır',
  not exists (select 1 from public.notifications where message like 'SİLİNECEK-%')
  and exists (select 1 from public.notifications where message = 'KALACAK')
  and not exists (select 1 from public.chat_groups where id = public._g('del')));

-- ============================================================================
-- 9. Yapısal güvenceler: kart alanları, anon EXECUTE beyaz listesi, tablo ayrıcalıkları
-- ============================================================================
select public._check(421, 'kart: community_cards yönetim/iç alanları (created_by, closed_by, pending_request_count, role_permissions, history_visible, members_can_pin, posting_policy, feed_policy) HİÇ döndürmez',
  (select not (array['created_by', 'closed_by', 'pending_request_count', 'role_permissions', 'history_visible', 'members_can_pin', 'posting_policy', 'feed_policy', 'updated_at'] && coalesce(proargnames, '{}'))
     from pg_proc where oid = 'public.community_cards(uuid[])'::regprocedure));
select public._become('gina');
create temp table _cards as select
  (select post_count from public.community_cards(array[public._g('restricted')])) as res_pc,
  (select post_count from public.community_cards(array[public._g('public')])) as pub_pc;
reset role;
select public._become('alice');
create temp table _cards_m as select (select post_count from public.community_cards(array[public._g('restricted')])) as res_pc;
reset role;
select public._check(422, 'kart: kapalı topluluğun içerik sayacı (post_count) üye olmayana (ayrılmış üye dahil) verilmez (null), herkese açıkta ve üyede verilir',
  (select res_pc is null from _cards) and (select pub_pc is not null from _cards) and (select res_pc is not null from _cards_m));
select public._check(423, 'anon: ziyaretçinin çalıştırabildiği topluluk/sohbet fonksiyonları KAPALI BEYAZ LİSTEDEDİR (okuma yardımcıları + keşif + arama + kart + kart kapağı); yazma/üye/istatistik/öneri/katılma yok',
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}'::text[]) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and (p.proname ~ '(group|communit|conversation|message)' and p.proname !~ '^(_|handle_|notify_)'))
   = array['can_read_community', 'can_read_community_avatar', 'can_read_message', 'can_see_community_card', 'community_card_covers', 'community_cards', 'discover_communities',
           'is_conversation_member', 'is_group_conversation', 'search_communities', 'start_direct_conversation']);
select public._check(424, 'anon: topluluk tablolarından yalnız gönderi/duyuru/etkinlik okunabilir (RLS ile yalnız herkese açık); chat_groups, üyelik, mesaj, davet, başvuru, bağlantı, rapor, kural kabulü anon''a kapalı',
  has_table_privilege('anon', 'public.community_posts', 'select') and has_table_privilege('anon', 'public.community_announcements', 'select') and has_table_privilege('anon', 'public.community_events', 'select')
  and not has_table_privilege('anon', 'public.chat_groups', 'select') and not has_table_privilege('anon', 'public.chat_group_invitations', 'select')
  and not has_table_privilege('anon', 'public.chat_group_join_requests', 'select') and not has_table_privilege('anon', 'public.chat_group_links', 'select')
  and not has_table_privilege('anon', 'public.chat_group_bans', 'select') and not has_table_privilege('anon', 'public.chat_group_audit', 'select')
  and not has_table_privilege('anon', 'public.community_reports', 'select') and not has_table_privilege('anon', 'public.community_rule_acceptances', 'select')
  and not has_table_privilege('anon', 'public.community_event_rsvps', 'select')
  and not has_table_privilege('anon', 'public.community_posts', 'insert') and not has_table_privilege('anon', 'public.community_posts', 'update')
  and not has_table_privilege('anon', 'public.community_posts', 'delete'));
select public._check(425, 'tablo: authenticated hiçbir topluluk/grup tablosuna doğrudan yazamaz (yazma yalnız SECURITY DEFINER RPC); sütun bazında da chat_groups''ta insert/update/delete yok',
  not has_table_privilege('authenticated', 'public.chat_groups', 'insert') and not has_table_privilege('authenticated', 'public.chat_groups', 'update')
  and not has_table_privilege('authenticated', 'public.chat_groups', 'delete')
  and not has_table_privilege('authenticated', 'public.community_posts', 'insert') and not has_table_privilege('authenticated', 'public.community_events', 'update')
  and not has_table_privilege('authenticated', 'public.chat_group_invitations', 'insert') and not has_table_privilege('authenticated', 'public.chat_group_join_requests', 'insert')
  and not has_table_privilege('authenticated', 'public.chat_group_links', 'insert'));

select public._check(426, 'yetim tarama: community-avatars bucket''ı da taranır — karta bağlı görsel yetim SAYILMAZ, hiçbir satıra bağlı olmayan yükleme yetim sayılır',
  exists (select 1 from public.orphan_storage_objects('0 seconds') where bucket_id = 'community-avatars' and name = public._uid('erin') || '/yeni.jpg')
  and not exists (select 1 from public.orphan_storage_objects('0 seconds') where bucket_id = 'community-avatars' and name like '%group-' || public._g('public') || '.jpg'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) || ' TOTAL=' || count(*) from public._results;
