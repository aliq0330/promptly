-- Arama ayarları: "beni kimler arayabilir" + cevapsız arama bildirimi + geçmiş sorguları için indeksler (docs/history/450-*).
--
-- 1. `call_settings` (kişi başına tek satır; yoksa varsayılanlar): privacy `everyone | following | nobody`, notify_missed. Okuma sahibi içindir (RLS);
--    yazma YALNIZ `set_my_call_settings` RPC'sidir. Diğer ayarlar (zil sesi, tarayıcı bildirimi, cihazlar) cihaza özeldir, tarayıcıda tutulur.
-- 2. `call_start` gizliliği aranan tarafın ayarına göre SUNUCUDA uygular (`call_privacy`): "Takip ettiklerim" = aranan arayanı takip ediyorsa.
--    Arayüzdeki gizleme tek koruma değildir.
-- 3. `_call_mark_missed` aranan "cevapsız arama bildirimi"ni kapattıysa bildirim yazmaz (çağrı kaydı yine yazılır).
-- 4. Geçmiş okuması (`calls` RLS: yalnız taraflar) için kişi başına zaman sıralı indeksler.

create table public.call_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  privacy text not null default 'everyone' check (privacy in ('everyone', 'following', 'nobody')),
  notify_missed boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.call_settings enable row level security;

create policy "Owner reads call settings" on public.call_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.call_settings from public, anon, authenticated;
grant select on public.call_settings to authenticated;

create index calls_caller_history_idx on public.calls (caller_id, created_at desc);
create index calls_callee_history_idx on public.calls (callee_id, created_at desc);

create or replace function public.get_my_call_settings()
returns table (privacy text, notify_missed boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(s.privacy, 'everyone'), coalesce(s.notify_missed, true)
    from (select 1) d
    left join public.call_settings s on s.user_id = auth.uid()
   where auth.uid() is not null;
$$;

create or replace function public.set_my_call_settings(p_privacy text, p_notify_missed boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_privacy is null or p_privacy not in ('everyone', 'following', 'nobody') then raise exception 'call_invalid_privacy'; end if;
  insert into public.call_settings (user_id, privacy, notify_missed, updated_at)
  values (v_uid, p_privacy, coalesce(p_notify_missed, true), now())
  on conflict (user_id) do update
    set privacy = excluded.privacy, notify_missed = excluded.notify_missed, updated_at = now();
end $$;

-- Gizlilik: aranan tarafın ayarı. `call_start` önceki sürümüyle aynıdır; yalnız engel kontrolünden sonra gizlilik denetimi eklendi.
create or replace function public.call_start(p_conversation_id uuid, p_type text)
returns public.calls
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_callee uuid;
  v_privacy text;
  v_call public.calls;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(false);
  if p_type is null or p_type not in ('audio', 'video') then raise exception 'call_invalid_type'; end if;

  select kind into v_kind from public.conversations where id = p_conversation_id;
  if v_kind is distinct from 'direct' then raise exception 'call_not_direct'; end if;

  if not exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id and user_id = v_uid and status = 'accepted'
  ) then raise exception 'call_not_allowed'; end if;
  select user_id into v_callee from public.conversation_members
   where conversation_id = p_conversation_id and user_id <> v_uid and status = 'accepted'
   limit 1;
  if v_callee is null then raise exception 'call_not_allowed'; end if;
  if public.is_blocked(v_uid, v_callee) then raise exception 'interaction_blocked'; end if;

  select s.privacy into v_privacy from public.call_settings s where s.user_id = v_callee;
  if v_privacy = 'nobody' then raise exception 'call_privacy'; end if;
  if v_privacy = 'following' and not exists (
    select 1 from public.follows f where f.follower_id = v_callee and f.following_id = v_uid
  ) then raise exception 'call_privacy'; end if;

  perform public._rate_limit('call_start', 20, interval '10 minutes');

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

-- Cevapsız arama bildirimi: aranan kapattıysa yazılmaz (kayıt yine tutulur).
create or replace function public._call_mark_missed(p_call_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_call public.calls;
begin
  update public.calls
     set status = 'missed', end_reason = p_reason, ended_at = now()
   where id = p_call_id and status = 'ringing'
   returning * into v_call;
  if v_call.id is null then return; end if;
  if exists (select 1 from public.call_settings s where s.user_id = v_call.callee_id and not s.notify_missed) then return; end if;
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

revoke execute on function public.get_my_call_settings() from public, anon;
revoke execute on function public.set_my_call_settings(text, boolean) from public, anon;
revoke execute on function public.call_start(uuid, text) from public, anon;
revoke all on function public._call_mark_missed(uuid, text) from public, anon, authenticated;
grant execute on function public.get_my_call_settings() to authenticated;
grant execute on function public.set_my_call_settings(text, boolean) to authenticated;
grant execute on function public.call_start(uuid, text) to authenticated;
