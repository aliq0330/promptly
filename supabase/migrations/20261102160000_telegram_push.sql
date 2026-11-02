-- Telegram botu: ANLIK bildirim (docs/history/324-*). YALNIZ EKLEME; mevcut hiçbir şey değişmez.
--
-- Akış: `notifications`'a etkinlik türünde yeni satır girer → tetikleyici, alıcının bildirim isteyen bir Telegram bağlantısı VARSA `pg_net` ile Edge Function'ın
-- `/notify?user=<kişi>` ucunu çağırır (istek işlem COMMIT olunca gider; geri alınan işlem hiçbir şey göndermez). Edge yalnız o kişinin bekleyen bildirimlerini yollar.
-- 15 dakikalık GitHub zamanlayıcısı YEDEK olarak kalır (anlık çağrı kaçarsa orada yakalanır) ve haftalık özeti o yollar.
--
-- Sırlar (adres + zamanlayıcı sırrı) Supabase Vault'tadır, depoda DEĞİL; elle girilir (docs/history/324-*). İkisinden biri yoksa, `pg_net`/Vault kurulu değilse ya da
-- çağrı hata verirse tetikleyici SESSİZCE geçer: bildirim satırı HER ZAMAN yazılır (asla bildirimi engellemez).

-- Aynı kişiye eşzamanlı iki geçişin aynı bildirimi iki kez göndermesini önleyen kısa "kilit" (60 sn; çökerse kendiliğinden düşer).
alter table public.telegram_links add column if not exists notify_claimed_at timestamptz;

create or replace function public._telegram_claim(p_link uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with c as (
    update public.telegram_links l set notify_claimed_at = now()
     where l.id = p_link and (l.notify_claimed_at is null or l.notify_claimed_at < now() - interval '60 seconds')
    returning 1
  )
  select exists (select 1 from c);
$$;

create or replace function public._telegram_release(p_link uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telegram_links set notify_claimed_at = null where id = p_link;
$$;

-- Tek kişinin etkinlik bildirimi isteyen bağlantıları (anlık yol; haftalık özet bu yolda GİTMEZ).
create or replace function public._telegram_notify_links_for(p_user uuid)
returns table (link_id uuid, chat_id bigint, telegram_user_id bigint, language text, user_id uuid, notify_weekly boolean, notify_activity boolean, last_weekly_week text)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.chat_id, l.telegram_user_id, l.language, l.user_id, l.notify_weekly, l.notify_activity, l.last_weekly_week
  from public.telegram_links l
  where l.user_id = p_user and l.notify_activity
  order by l.last_notified_at asc
  limit 10;
$$;

-- Tetikleyici: etkinlik türündeki yeni bildirimde, alıcının bağlı + bildirimi açık Telegram'ı varsa Edge'i çağırır.
create or replace function public._telegram_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then return new; end if;
  if not exists (select 1 from public.telegram_links l where l.user_id = new.recipient_id and l.notify_activity) then return new; end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'telegram_push_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'telegram_cron_secret';
  if v_url is null or v_secret is null or v_url !~ '^https://' then return new; end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/notify?user=' || new.recipient_id::text,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Anlık yol en iyi çabadır: hata bildirimi (ve onu yazan işlemi) asla bozmaz; yedek zamanlayıcı yakalar.
  return new;
end;
$$;

drop trigger if exists notifications_telegram_push on public.notifications;
create trigger notifications_telegram_push
  after insert on public.notifications
  for each row
  when (new.type in ('comment', 'comment_reply', 'request_response', 'quote', 'edit_suggestion_received', 'prompt_result_shared'))
  execute function public._telegram_push_on_notification();

revoke all on function public._telegram_claim(uuid) from public, anon, authenticated;
revoke all on function public._telegram_release(uuid) from public, anon, authenticated;
revoke all on function public._telegram_notify_links_for(uuid) from public, anon, authenticated;
revoke all on function public._telegram_push_on_notification() from public, anon, authenticated;
