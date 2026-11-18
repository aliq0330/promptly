-- Rahatsız etme saatleri (docs/history/435-*): kullanıcı belirli saatlerde (ör. 23:00–08:00) sitedeki canlı bildirim kartının, bildirim sesinin ve Telegram anlık
-- bildirimlerinin susmasını ister. Bildirimin KENDİSİ yine yazılır (gelen kutusu, zil rozeti); yalnız dışarıya dürtmeyen yollar susar.
--   * Kural hesap başınadır (tüm cihazlar aynı saatleri görür) ve kişinin saat dilimiyle (IANA, tarayıcıdan) değerlendirilir.
--   * Telegram yolu için tek uygulama noktası mevcut `notifications` BEFORE INSERT tetikleyicisidir (`_notifications_presence_focus`, docs/history/329-*):
--     karar yazma anında `push_suppressed`'a işlenir; hem anlık yol hem yedek zamanlayıcı (`_telegram_pending`) bu sütuna bakar, yani sessiz saatte gelen
--     bildirim sonradan da Telegram'a gitmez. Yeni bir bildirim yolu eklenirse aynı sütunu kullan, ayrıca saat kontrolü yazma.
--   * Tablo istemciye kapalıdır; okuma/yazma yalnız `get_my_quiet_hours` / `set_my_quiet_hours` RPC'leridir.
-- Geriye uyumlu (expand): yalnız yeni tablo + yeni fonksiyonlar eklenir; tetikleyici fonksiyonu aynı imzayla yeniden yazılır.

create table if not exists public.notification_quiet_hours (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  enabled      boolean     not null default false,
  -- Gece yarısından itibaren dakika (0–1439). Başlangıç > bitiş ise pencere gece yarısını aşar (23:00 → 08:00).
  start_minute smallint    not null default 1380 check (start_minute between 0 and 1439),
  end_minute   smallint    not null default 480  check (end_minute between 0 and 1439),
  tz           text        not null default 'UTC' check (char_length(tz) between 1 and 64),
  updated_at   timestamptz not null default now()
);
alter table public.notification_quiet_hours enable row level security;
revoke all on table public.notification_quiet_hours from public, anon, authenticated;

-- === Pencere hesabı ===========================================================================================================================
-- `p_user` şu an (ya da `p_at` anında) kendi saat diliminde sessiz saatte mi? Kayıt yok/kapalı/başlangıç = bitiş → hayır. Hata → hayır (bildirim engellenmez).
create or replace function public._in_quiet_hours(p_user uuid, p_at timestamptz default now())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  q public.notification_quiet_hours;
  v_local timestamp;
  v_min int;
begin
  select * into q from public.notification_quiet_hours where user_id = p_user and enabled;
  if not found then return false; end if;
  if q.start_minute = q.end_minute then return false; end if;
  v_local := p_at at time zone q.tz;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  if q.start_minute < q.end_minute then
    return v_min >= q.start_minute and v_min < q.end_minute;
  end if;
  return v_min >= q.start_minute or v_min < q.end_minute;
exception when others then
  return false;
end $$;

-- === Kendi ayarım =============================================================================================================================
create or replace function public.get_my_quiet_hours()
returns table (enabled boolean, start_minute integer, end_minute integer, tz text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return query
    select q.enabled, q.start_minute::int, q.end_minute::int, q.tz
      from public.notification_quiet_hours q where q.user_id = v_uid
    union all
    select false, 1380, 480, 'UTC'
     where not exists (select 1 from public.notification_quiet_hours q where q.user_id = v_uid)
    limit 1;
end $$;

create or replace function public.set_my_quiet_hours(p_enabled boolean, p_start integer, p_end integer, p_tz text)
returns table (enabled boolean, start_minute integer, end_minute integer, tz text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_enabled is null or p_start is null or p_end is null or p_start not between 0 and 1439 or p_end not between 0 and 1439 then
    raise exception 'invalid_quiet_hours' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names n where n.name = v_tz) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  insert into public.notification_quiet_hours as q (user_id, enabled, start_minute, end_minute, tz, updated_at)
  values (v_uid, p_enabled, p_start, p_end, v_tz, now())
  on conflict (user_id) do update
    set enabled = excluded.enabled, start_minute = excluded.start_minute, end_minute = excluded.end_minute, tz = excluded.tz, updated_at = now();
  return query select q.enabled, q.start_minute::int, q.end_minute::int, q.tz from public.notification_quiet_hours q where q.user_id = v_uid;
end $$;

-- === Telegram anlık yolu: sessiz saatte bastır ================================================================================================
-- 20261104110000'daki tetikleyici fonksiyonu aynı mantıkla + sessiz saat kontrolüyle yeniden yazılır (imza ve tetikleyici aynı kalır).
create or replace function public._notifications_presence_focus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.push_suppressed := false;
  if public._in_quiet_hours(new.recipient_id) then
    new.push_suppressed := true;
    return new;
  end if;
  if new.type in ('comment', 'comment_reply', 'request_response', 'quote', 'edit_suggestion_received', 'prompt_result_shared')
     and exists (
       select 1 from public.presence_state s
        where s.user_id = new.recipient_id
          and s.focus_key is not null
          and s.focus_key = public._presence_focus_key(new.target_href)
          and s.focus_until >= now()
          and s.focus_since <= now()
     ) then
    new.push_suppressed := true;
  end if;
  return new;
exception when others then
  new.push_suppressed := false;  -- en iyi çaba: karar verilemezse bildirim Telegram'a gider
  return new;
end $$;

-- === Yetkiler =================================================================================================================================
revoke all on function public._in_quiet_hours(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public._notifications_presence_focus() from public, anon, authenticated;
revoke all on function public.get_my_quiet_hours() from public, anon;
revoke all on function public.set_my_quiet_hours(boolean, integer, integer, text) from public, anon;
grant execute on function public.get_my_quiet_hours() to authenticated;
grant execute on function public.set_my_quiet_hours(boolean, integer, integer, text) to authenticated;
