-- 1-1 sesli / görüntülü arama (docs/history/449-*).
--
-- Mimari: ses/görüntü tarayıcıdan tarayıcıya WebRTC (P2P) ile akar, Supabase'ten GEÇMEZ. Supabase iki iş yapar:
--   1. ÇAĞRI DURUMU: `calls` satırı (ringing → accepted → ended | rejected | missed). Yazma YALNIZ aşağıdaki RPC'lerdir; istemci tabloya
--      insert/update/delete yapamaz. Karşı tarafın "gelen arama"yı görmesi `calls` üzerindeki Realtime `postgres_changes` ile olur (RLS: yalnız
--      arayan + aranan okur).
--   2. SİNYALLEŞME (offer/answer/ICE): veritabanına YAZILMAZ — private Realtime Broadcast kanalı `call:<çağrı uuid>`; kanala yalnız çağrının iki
--      tarafı girebilir (`can_use_call_topic`, `realtime.messages` politikaları; `typing:<konuşma>` ile aynı kalıp, docs/history/174-*).
--
-- Güvenlik: arayan/aranan istemciden ALINMAZ. `call_start` konuşmayı sunucuda çözer (yalnız `direct`, iki üye de `accepted`, engel yok),
-- aranan = konuşmanın öbür üyesidir. Bir kullanıcı aynı anda tek çağrıda olabilir (meşgul). Süresi dolan çalan çağrı "cevapsız"a döner.
-- Dashboard'da Realtime "Allow public access" KAPALI olmalıdır (aksi hâlde yetkisiz public kanal açılabilir).

-- ============================================================================
-- 1. Tablo
-- ============================================================================
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  /** Bitiş nedeni (kullanıcıya gösterilmez; tanı/geçmiş için). */
  end_reason text check (end_reason in ('rejected', 'timeout', 'cancelled', 'hangup', 'failed', 'interrupted', 'stale')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calls_distinct_parties check (caller_id <> callee_id),
  -- Durum ↔ zaman damgası tutarlılığı (her dalı kesinleştir: CHECK NULL'u geçirir).
  constraint calls_state_shape check (
    (status = 'ringing'  and answered_at is null     and ended_at is null) or
    (status = 'accepted' and answered_at is not null and ended_at is null) or
    (status in ('rejected', 'missed') and answered_at is null and ended_at is not null) or
    (status = 'ended'    and answered_at is not null and ended_at is not null)
  )
);

create index calls_callee_open_idx on public.calls (callee_id) where status in ('ringing', 'accepted');
create index calls_caller_open_idx on public.calls (caller_id) where status in ('ringing', 'accepted');
create index calls_conversation_idx on public.calls (conversation_id, created_at desc);

alter table public.calls enable row level security;

create policy "Parties can read their calls" on public.calls
  for select to authenticated
  using ((select auth.uid()) in (caller_id, callee_id));

revoke all on public.calls from public, anon, authenticated;
grant select on public.calls to authenticated;

-- Çağrı değişimleri Realtime `postgres_changes` ile gelir (gelen arama, kabul/ret/bitiş).
alter publication supabase_realtime add table public.calls;

-- ============================================================================
-- 2. İç yardımcılar
-- ============================================================================
-- Çalan çağrının en çok kaç saniye çalacağı (istemci zaman aşımı 45 sn; sunucu payla 60 sn).
create or replace function public._call_ring_seconds() returns integer language sql immutable as $$ select 60 $$;

-- Çalıyor → cevapsız. Aranana tek "seni aradı, cevapsız kaldı" bildirimi yazar (dedupe: çağrı başına bir; kart başlığı aktör adını ekler).
create or replace function public._call_mark_missed(p_call_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_call public.calls;
begin
  update public.calls
     set status = 'missed', end_reason = p_reason, ended_at = now()
   where id = p_call_id and status = 'ringing'
   returning * into v_call;
  if v_call.id is null then return; end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_call.callee_id,
    v_call.caller_id,
    'system',
    case v_call.type when 'video' then 'seni görüntülü aradı, cevapsız kaldı.' else 'seni sesli aradı, cevapsız kaldı.' end,
    '/messages/local?id=' || v_call.conversation_id::text,
    'call-missed:' || v_call.id::text
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end $$;
revoke all on function public._call_mark_missed(uuid, text) from public, anon, authenticated;

-- Bir kullanıcının takılı kalmış çağrılarını kapatır: süresi dolan çalan çağrı → cevapsız; 4 saatten eski "kabul edildi" → bitti
-- (iki taraf da sekmeyi kapatıp kimse `end` demediyse kullanıcı sonsuza kadar "meşgul" kalmasın).
create or replace function public._call_expire_for(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select id from public.calls
     where status = 'ringing' and (caller_id = p_user or callee_id = p_user)
       and created_at < now() - make_interval(secs => public._call_ring_seconds())
  loop
    perform public._call_mark_missed(r.id, 'timeout');
  end loop;
  update public.calls
     set status = 'ended', end_reason = 'stale', ended_at = now()
   where status = 'accepted' and (caller_id = p_user or callee_id = p_user)
     and answered_at < now() - interval '4 hours';
end $$;
revoke all on function public._call_expire_for(uuid) from public, anon, authenticated;

-- ============================================================================
-- 3. RPC'ler (istemcinin tek yazma yolu)
-- ============================================================================
create or replace function public.call_start(p_conversation_id uuid, p_type text)
returns public.calls
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_callee uuid;
  v_call public.calls;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(false);
  if p_type is null or p_type not in ('audio', 'video') then raise exception 'call_invalid_type'; end if;

  select kind into v_kind from public.conversations where id = p_conversation_id;
  if v_kind is distinct from 'direct' then raise exception 'call_not_direct'; end if;

  -- Arayan KENDİ üyeliğiyle doğrulanır; aranan konuşmanın öbür üyesidir (istemci kimlik vermez). İki taraf da kabul edilmiş olmalı:
  -- bekleyen mesaj isteğinde arama yapılamaz.
  if not exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id and user_id = v_uid and status = 'accepted'
  ) then raise exception 'call_not_allowed'; end if;
  select user_id into v_callee from public.conversation_members
   where conversation_id = p_conversation_id and user_id <> v_uid and status = 'accepted'
   limit 1;
  if v_callee is null then raise exception 'call_not_allowed'; end if;
  if public.is_blocked(v_uid, v_callee) then raise exception 'interaction_blocked'; end if;

  perform public._rate_limit('call_start', 20, interval '10 minutes');

  -- İki kullanıcının kilidi sabit sırayla alınır: karşılıklı eşzamanlı arama ikisini de geçirmesin (kilitlenme de olmasın).
  perform pg_advisory_xact_lock(hashtextextended(least(v_uid, v_callee)::text, 7));
  perform pg_advisory_xact_lock(hashtextextended(greatest(v_uid, v_callee)::text, 7));
  perform public._call_expire_for(v_uid);
  perform public._call_expire_for(v_callee);
  if exists (
    select 1 from public.calls
     where status in ('ringing', 'accepted') and (caller_id in (v_uid, v_callee) or callee_id in (v_uid, v_callee))
  ) then raise exception 'call_busy'; end if;

  insert into public.calls (conversation_id, caller_id, callee_id, type)
  values (p_conversation_id, v_uid, v_callee, p_type)
  returning * into v_call;
  return v_call;
end $$;

-- Eylemler: accept / reject (yalnız aranan), cancel / timeout (arayan; timeout ikisi de bildirebilir), end (iki taraf).
-- Zaten sonlanmış çağrıda reject/cancel/timeout/end sessizce mevcut satırı döner (çift tıklama, çift sekme zarar vermez).
create or replace function public.call_respond(p_call_id uuid, p_action text, p_reason text default null)
returns public.calls
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_call public.calls;
  v_reason text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_action is null or p_action not in ('accept', 'reject', 'cancel', 'timeout', 'end') then raise exception 'call_invalid_action'; end if;

  select * into v_call from public.calls where id = p_call_id for update;
  if v_call.id is null or v_uid not in (v_call.caller_id, v_call.callee_id) then raise exception 'call_not_found'; end if;

  -- Süresi dolmuş çalan çağrı: ne kabul edilir ne reddedilir, cevapsıza döner. Hata FIRLATILMAZ (fırlatmak aynı işlemdeki "cevapsız"
  -- güncellemesini de geri alırdı): istemci dönen satırın durumuna bakar (`accept` istediği hâlde status 'accepted' değilse çağrı artık yok).
  if v_call.status = 'ringing' and v_call.created_at < now() - make_interval(secs => public._call_ring_seconds()) then
    perform public._call_mark_missed(v_call.id, 'timeout');
    select * into v_call from public.calls where id = p_call_id;
    return v_call;
  end if;

  if p_action = 'accept' then
    if v_uid <> v_call.callee_id then raise exception 'call_not_allowed'; end if;
    if v_call.status <> 'ringing' then raise exception 'call_not_ringing'; end if;
    if public.is_blocked(v_call.caller_id, v_call.callee_id) then raise exception 'interaction_blocked'; end if;
    update public.calls set status = 'accepted', answered_at = now() where id = v_call.id returning * into v_call;
    return v_call;
  end if;

  if v_call.status in ('rejected', 'missed', 'ended') then return v_call; end if;

  if p_action = 'reject' then
    if v_uid <> v_call.callee_id then raise exception 'call_not_allowed'; end if;
    if v_call.status = 'ringing' then
      update public.calls set status = 'rejected', end_reason = 'rejected', ended_at = now() where id = v_call.id returning * into v_call;
    end if;
    return v_call;
  end if;

  if p_action = 'cancel' then
    if v_uid <> v_call.caller_id then raise exception 'call_not_allowed'; end if;
    if v_call.status = 'ringing' then perform public._call_mark_missed(v_call.id, 'cancelled'); end if;
    select * into v_call from public.calls where id = p_call_id;
    return v_call;
  end if;

  if p_action = 'timeout' then
    -- Yalnız süre gerçekten dolduysa (istemci saati güvenilmez; sunucu 5 sn pay bırakır).
    if v_call.status = 'ringing' and v_call.created_at <= now() - make_interval(secs => public._call_ring_seconds() - 20) then
      perform public._call_mark_missed(v_call.id, 'timeout');
    end if;
    select * into v_call from public.calls where id = p_call_id;
    return v_call;
  end if;

  -- end
  if v_call.status = 'ringing' then
    if v_uid = v_call.caller_id then
      perform public._call_mark_missed(v_call.id, 'cancelled');
    else
      update public.calls set status = 'rejected', end_reason = 'rejected', ended_at = now() where id = v_call.id;
    end if;
  else
    v_reason := case when p_reason in ('hangup', 'failed', 'interrupted') then p_reason else 'hangup' end;
    update public.calls set status = 'ended', end_reason = v_reason, ended_at = now() where id = v_call.id;
  end if;
  select * into v_call from public.calls where id = p_call_id;
  return v_call;
end $$;

-- Oturum açıldığında / sayfa yenilendiğinde: bana ait açık çağrılar (gelen çalan arama + yarım kalmış görüşme). Süresi dolanlar önce kapanır.
create or replace function public.calls_my_open()
returns setof public.calls
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  perform public._call_expire_for(v_uid);
  return query
    select * from public.calls
     where status in ('ringing', 'accepted') and (caller_id = v_uid or callee_id = v_uid)
     order by created_at desc
     limit 5;
end $$;

-- ============================================================================
-- 4. Sinyalleşme kanalı yetkisi (Realtime Authorization — geçici Broadcast, veritabanına YAZILMAZ)
-- ============================================================================
-- Konu adı `call:<çağrı uuid>`; yalnız çağrının arayanı/arananı okuyabilir/yayınlayabilir. İstemci kanala `private: true` ile bağlanır.
create or replace function public.can_use_call_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic ~ '^call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then exists (
        select 1 from public.calls c
         where c.id = substring(p_topic from 6)::uuid
           and (select auth.uid()) in (c.caller_id, c.callee_id)
           and c.created_at > now() - interval '12 hours'
      )
    else false
  end;
$$;

revoke execute on function public.call_start(uuid, text) from public, anon;
revoke execute on function public.call_respond(uuid, text, text) from public, anon;
revoke execute on function public.calls_my_open() from public, anon;
revoke execute on function public.can_use_call_topic(text) from public, anon;
grant execute on function public.call_start(uuid, text) to authenticated;
grant execute on function public.call_respond(uuid, text, text) to authenticated;
grant execute on function public.calls_my_open() to authenticated;
grant execute on function public.can_use_call_topic(text) to authenticated;

-- `realtime.messages` yoksa (yerel test veritabanı) ya da oluşturulamazsa atlanır — politika yoksa private kanallar HERKESE kapalıdır
-- (güvenli taraf: arama bağlanmaz ama sızıntı olmaz).
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    begin
      execute $p$create policy "Call parties can receive call signaling" on realtime.messages
        for select to authenticated
        using (realtime.messages.extension = 'broadcast' and public.can_use_call_topic((select realtime.topic())))$p$;
      execute $p$create policy "Call parties can send call signaling" on realtime.messages
        for insert to authenticated
        with check (realtime.messages.extension = 'broadcast' and public.can_use_call_topic((select realtime.topic())))$p$;
    exception when others then
      raise warning 'realtime.messages politikaları oluşturulamadı (%); arama sinyalleşmesi için elle oluşturun', sqlerrm;
    end;
  else
    raise notice 'realtime.messages bulunamadı: arama sinyalleşmesi politikaları atlandı';
  end if;
end $$;
