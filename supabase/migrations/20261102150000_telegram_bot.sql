-- Telegram botu (docs/history/323-*): hesap bağlama + bildirim tercihleri. YALNIZ EKLEME (yeni tablo/fonksiyon); mevcut hiçbir şey değişmez.
--
-- BAĞLAMA YÖNÜ BİLEREK TERSTİR: kodu SİTE üretir (oturumlu kullanıcı, Ayarlar → Geliştirici → Telegram), kişi onu bota `/baglan KOD` ile kendi Telegram'ından
-- yollar. Bottan bağlantı üretip siteye "onayla" dedirtmek, saldırganın kendi Telegram'ını kurbanın hesabına bağlamasına izin verirdi (oturum açık kurban bir
-- bağlantıya basar). Burada kodu kim üretiyorsa hesap odur; bota gönderen kişi Telegram'ın kendisidir (`from.id` webhook sırrıyla doğrulanır).
--
-- Kodlar ve bağlantılar istemciye KAPALI tablolardır (RLS açık, politika yok, yetki yok). İstemci yalnız 4 RPC çağırır (kod üret · bağlantıları listele · kaldır ·
-- bildirim tercihi). `_telegram_*` fonksiyonları YALNIZ sahip rolün (Edge Function'ın doğrudan Postgres bağlantısı) çağırabileceği, anon/authenticated'a kapalı
-- yardımcılardır. Ham kod saklanmaz (SHA-256 özeti). Bot, bağlı kullanıcı adına çalışırken mevcut `api_me_*` yoluyla (`set local role authenticated` + kullanıcı
-- iddiaları) çalışır: RLS/askı/hız sınırı kullanıcınınkiyle aynıdır; bağlantının kapsamı `read` ya da `read`+`write` (özel taslak) — yayınlama/silme YOKTUR.

create table if not exists public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique check (char_length(code_hash) = 64),
  write boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_link_codes_user_idx on public.telegram_link_codes (user_id);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from public, anon, authenticated;

create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  telegram_username text check (telegram_username is null or char_length(telegram_username) <= 64),
  telegram_name text check (telegram_name is null or char_length(telegram_name) <= 128),
  language text not null default 'tr' check (language in ('tr', 'en')),
  scopes text[] not null default array['read'] check (scopes <@ array['read', 'write'] and 'read' = any (scopes)),
  notify_weekly boolean not null default false,
  notify_activity boolean not null default false,
  -- Bildirim imleci: bundan SONRA oluşan bildirimler gönderilir (bağlanırken/açılırken "şimdi" — eski bildirimler yağmaz).
  last_notified_at timestamptz not null default now(),
  last_weekly_week text check (last_weekly_week is null or last_weekly_week ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists telegram_links_user_idx on public.telegram_links (user_id);
alter table public.telegram_links enable row level security;
revoke all on public.telegram_links from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------
-- İSTEMCİ RPC'LERİ (oturumlu kullanıcı)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------

-- Bağlama kodu üretir (10 dk geçerli, hesap başına tek canlı kod; ham kod yalnız bu yanıtta görünür). 8 karakter, karışan harfler (0/O, 1/I) yok.
create or replace function public.telegram_link_code_create(p_write boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_expires timestamptz := now() + interval '10 minutes';
  i integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(coalesce(p_write, false));
  perform pg_advisory_xact_lock(hashtextextended('telegram_link:' || v_uid::text, 0));
  perform public._rate_limit('telegram_link_code', 10, interval '1 hour');

  if (select count(*) from public.telegram_links where user_id = v_uid) >= 3 then raise exception 'link_limit'; end if;

  delete from public.telegram_link_codes where user_id = v_uid or expires_at < now() - interval '1 day';

  v_bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    -- 256 % 32 = 0: her harf eşit olasılıklı (sapma yok).
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.telegram_link_codes (user_id, code_hash, write, expires_at)
  values (v_uid, encode(extensions.digest(v_code, 'sha256'), 'hex'), coalesce(p_write, false), v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'write', coalesce(p_write, false));
end;
$$;

create or replace function public.list_my_telegram_links()
returns table (id uuid, telegram_username text, telegram_name text, scopes text[], notify_weekly boolean, notify_activity boolean, created_at timestamptz, last_used_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.telegram_username, l.telegram_name, l.scopes, l.notify_weekly, l.notify_activity, l.created_at, l.last_used_at
  from public.telegram_links l
  where l.user_id = auth.uid()
  order by l.created_at desc;
$$;

create or replace function public.revoke_my_telegram_link(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.telegram_links where id = p_id and user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Bildirim tercihleri. Etkinlik bildirimini AÇARKEN imleç "şimdi"ye alınır: geçmiş bildirimler Telegram'a yağmaz.
create or replace function public.set_my_telegram_notify(p_id uuid, p_weekly boolean, p_activity boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.telegram_links l set
    notify_weekly = coalesce(p_weekly, l.notify_weekly),
    notify_activity = coalesce(p_activity, l.notify_activity),
    last_notified_at = case when coalesce(p_activity, l.notify_activity) and not l.notify_activity then now() else l.last_notified_at end
  where l.id = p_id and l.user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------
-- YALNIZ SAHİP ROL (Edge Function `telegram`): istemci rollerine KAPALI
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------

-- Kod geçerli mi? (bağlamadan önce kişiye "şu hesaba bağlanacaksın" demek için; kodu TÜKETMEZ)
create or replace function public._telegram_code_peek(p_code_hash text)
returns table (user_id uuid, username text, display_name text, write boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id, p.username, p.display_name, c.write
  from public.telegram_link_codes c
  join public.profiles p on p.id = c.user_id
  where c.code_hash = p_code_hash and c.expires_at > now();
$$;

-- Kodu tüketip bağlantıyı kurar (tek atomik adım). Aynı Telegram kullanıcısı başka hesaba bağlıysa o bağlantı DEĞİŞTİRİLİR.
create or replace function public._telegram_link_consume(
  p_code_hash text, p_telegram_user_id bigint, p_chat_id bigint, p_username text, p_name text, p_language text)
returns table (link_id uuid, username text, display_name text, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.telegram_link_codes%rowtype;
  v_link public.telegram_links%rowtype;
  v_username text;
  v_display text;
  v_label text;
begin
  select * into v_code from public.telegram_link_codes where code_hash = p_code_hash and expires_at > now() for update;
  if not found then raise exception 'code_invalid'; end if;
  if p_telegram_user_id is null or p_chat_id is null then raise exception 'bad_request'; end if;

  perform pg_advisory_xact_lock(hashtextextended('telegram_link:' || v_code.user_id::text, 0));
  -- Aynı Telegram kullanıcısının eski bağlantısı (başka hesapta olabilir) kalkar.
  delete from public.telegram_links where telegram_user_id = p_telegram_user_id;
  if (select count(*) from public.telegram_links where user_id = v_code.user_id) >= 3 then raise exception 'link_limit'; end if;

  insert into public.telegram_links (user_id, telegram_user_id, chat_id, telegram_username, telegram_name, language, scopes)
  values (v_code.user_id, p_telegram_user_id, p_chat_id, left(nullif(btrim(p_username), ''), 64), left(nullif(btrim(p_name), ''), 128),
          case when p_language = 'en' then 'en' else 'tr' end,
          case when v_code.write then array['read', 'write'] else array['read'] end)
  returning * into v_link;

  delete from public.telegram_link_codes where id = v_code.id;

  select p.username, p.display_name into v_username, v_display from public.profiles p where p.id = v_code.user_id;
  v_label := coalesce('@' || v_link.telegram_username, v_link.telegram_name, 'Telegram');
  -- Sızıntıyı fark etmek için kişiye haber (sabit kalıp). Telegram adı kullanıcı verisidir: yalnız tırnaklı gösterilir.
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_code.user_id, null, 'system',
          format('Telegram hesabı bağlandı: "%s". Sen yapmadıysan Ayarlar''dan hemen kaldır.', v_label),
          '/settings', 'telegram_linked:' || v_link.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return query select v_link.id, v_username, v_display, v_link.scopes;
end;
$$;

-- Telegram kullanıcısı bağlı mı? Bağlıysa kimlik + kapsamlar (son kullanım en çok dakikada bir yazılır; dil güncel tutulur).
create or replace function public._telegram_link_authenticate(p_telegram_user_id bigint, p_language text default null)
returns table (link_id uuid, user_id uuid, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
declare v_link public.telegram_links%rowtype;
begin
  select * into v_link from public.telegram_links where telegram_user_id = p_telegram_user_id;
  if not found then return; end if;
  if v_link.last_used_at is null or v_link.last_used_at < now() - interval '1 minute'
     or (p_language in ('tr', 'en') and p_language <> v_link.language) then
    update public.telegram_links set last_used_at = now(), language = case when p_language in ('tr', 'en') then p_language else language end where id = v_link.id;
  end if;
  return query select v_link.id, v_link.user_id, v_link.scopes;
end;
$$;

create or replace function public._telegram_unlink(p_telegram_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  delete from public.telegram_links where telegram_user_id = p_telegram_user_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Bot içinden tercih (null = dokunma). Etkinlik bildirimi açılırken imleç "şimdi".
create or replace function public._telegram_set_notify(p_telegram_user_id bigint, p_weekly boolean, p_activity boolean)
returns table (notify_weekly boolean, notify_activity boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.telegram_links l set
    notify_weekly = coalesce(p_weekly, l.notify_weekly),
    notify_activity = coalesce(p_activity, l.notify_activity),
    last_notified_at = case when coalesce(p_activity, l.notify_activity) and not l.notify_activity then now() else l.last_notified_at end
  where l.telegram_user_id = p_telegram_user_id
  returning l.notify_weekly, l.notify_activity;
end;
$$;

-- --- Bildirim gönderimi (zamanlayıcı → Edge Function `telegram` /notify) ---

-- Bildirim isteyen bağlantılar; en uzun süredir beklenen önce.
create or replace function public._telegram_notify_links(p_limit integer default 100)
returns table (link_id uuid, chat_id bigint, telegram_user_id bigint, language text, user_id uuid, notify_weekly boolean, notify_activity boolean, last_weekly_week text)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.chat_id, l.telegram_user_id, l.language, l.user_id, l.notify_weekly, l.notify_activity, l.last_weekly_week
  from public.telegram_links l
  where l.notify_weekly or l.notify_activity
  order by l.last_notified_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Bir bağlantının GÖNDERİLMEMİŞ etkinlik bildirimleri (yorum, yanıt, istek yanıtı, alıntı, düzenleme önerisi, sonuç). Beğeni/takip/mesaj bilerek DIŞARIDA (gürültü).
create or replace function public._telegram_pending(p_link uuid, p_limit integer default 5)
returns table (id uuid, type text, message text, target_href text, created_at timestamptz, actor_username text)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.type, n.message, n.target_href, n.created_at, a.username
  from public.telegram_links l
  join public.notifications n on n.recipient_id = l.user_id and n.created_at > l.last_notified_at
  left join public.profiles a on a.id = n.actor_id
  where l.id = p_link and l.notify_activity
    and n.type in ('comment', 'comment_reply', 'request_response', 'quote', 'edit_suggestion_received', 'prompt_result_shared')
  order by n.created_at asc, n.id asc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- İmleci GÖNDERİLEN son bildirimin anına taşır (id ile: mikrosaniye kaybı yok, aynı bildirim iki kez gitmez).
create or replace function public._telegram_advance_to(p_link uuid, p_notification uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telegram_links l
     set last_notified_at = greatest(l.last_notified_at, coalesce((select n.created_at from public.notifications n where n.id = p_notification), l.last_notified_at))
   where l.id = p_link;
$$;

-- Bağlantıyı siler (Telegram "bot engellendi" döndürdüğünde otomatik kaldırma için).
create or replace function public._telegram_unlink_link(p_link uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.telegram_links where id = p_link;
$$;

create or replace function public._telegram_mark_weekly(p_link uuid, p_week text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telegram_links set last_weekly_week = p_week where id = p_link and p_week ~ '^[0-9]{4}-[0-9]{2}$';
$$;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------
revoke all on function public.telegram_link_code_create(boolean) from public, anon;
revoke all on function public.list_my_telegram_links() from public, anon;
revoke all on function public.revoke_my_telegram_link(uuid) from public, anon;
revoke all on function public.set_my_telegram_notify(uuid, boolean, boolean) from public, anon;
grant execute on function public.telegram_link_code_create(boolean) to authenticated;
grant execute on function public.list_my_telegram_links() to authenticated;
grant execute on function public.revoke_my_telegram_link(uuid) to authenticated;
grant execute on function public.set_my_telegram_notify(uuid, boolean, boolean) to authenticated;

revoke all on function public._telegram_code_peek(text) from public, anon, authenticated;
revoke all on function public._telegram_link_consume(text, bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public._telegram_link_authenticate(bigint, text) from public, anon, authenticated;
revoke all on function public._telegram_unlink(bigint) from public, anon, authenticated;
revoke all on function public._telegram_set_notify(bigint, boolean, boolean) from public, anon, authenticated;
revoke all on function public._telegram_notify_links(integer) from public, anon, authenticated;
revoke all on function public._telegram_pending(uuid, integer) from public, anon, authenticated;
revoke all on function public._telegram_advance_to(uuid, uuid) from public, anon, authenticated;
revoke all on function public._telegram_unlink_link(uuid) from public, anon, authenticated;
revoke all on function public._telegram_mark_weekly(uuid, text) from public, anon, authenticated;
