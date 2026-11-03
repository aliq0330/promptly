-- Bildirim merkezi (docs/history/326-*): içerik başına gruplanmış bildirim kartları, sessize alma, erteleme, tür tercihi.
--
-- TASARIM (hepsi EKLEME — expand; hiçbir sütun/fonksiyon silinmez, eski düz liste çalışmaya devam eder):
--   * `notifications` satırları AYRI kalır (bir beğeni = bir satır, `dedupe_key` aynen). Kart, `notifications_grouped_page` RPC'sinin okuma anındaki
--     birleşimidir: "Ali, Veli ve 10 kişi daha promptunu beğendi". Gruplama SUNUCUDADIR: istemcide gruplamak sayfa sınırında bir grubu böler ve sayıyı yanlış verir.
--   * Gruplanan türler yalnız SAYI bildirimleridir: beğeni/tepki, takip, hikâye tepkisi/anket oyu. Metin taşıyanlar (yorum, yanıt, mesaj, öneri, istek yanıtı, alıntı,
--     sonuç, sistem) tek satırlık karttır — üzerlerinde "Yanıtla / Kabul et" gibi o satıra özgü eylem vardır.
--   * Grup anahtarı = `tür | hedef adresi` (adres `hl=` dahil: bir yorumun beğenisi ile gönderinin beğenisi ayrı gruptur). Zaman penceresi YOKTUR.
--   * Sessize alma ve tür tercihi `notifications` üzerindeki TEK BEFORE INSERT tetikleyicisiyle uygulanır; 20'den fazla `notify_*` fonksiyonuna dokunulmaz.
--     Sessize alınan bildirim hiç yazılmaz: Telegram anlık/özet gönderimi de (satırdan okur) onu görmez.
--   * Erteleme `notifications.snoozed_until`: ertelenen satır listede ve sayımda yoktur; süre dolunca OKUNMAMIŞ olarak, erteleme anıyla sıralanıp en üste döner.
--   * Kullanıcı başına gruplama taraması en yeni 5000 satırla sınırlıdır (docs/history/326-*): daha eskisi listede görünmez ama silinmez.
-- Yazma yalnız RPC/tetikleyicidir; yeni tablolara istemci doğrudan yazamaz.

-- === 1. Sütun + indeksler ===================================================================================================================
alter table public.notifications add column if not exists snoozed_until timestamptz;
create index if not exists notifications_snoozed_idx on public.notifications (recipient_id, snoozed_until) where snoozed_until is not null;
create index if not exists notifications_recipient_recent_idx on public.notifications (recipient_id, created_at desc, id desc);

-- === 2. Tablolar =============================================================================================================================
create table if not exists public.notification_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('actor', 'content')),
  target text not null check (char_length(target) between 1 and 300),
  label text not null default '' check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target)
);
alter table public.notification_mutes enable row level security;
revoke all on public.notification_mutes from public, anon, authenticated;
grant select on public.notification_mutes to authenticated;
drop policy if exists "Users read their own notification mutes" on public.notification_mutes;
create policy "Users read their own notification mutes"
  on public.notification_mutes for select to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.notification_type_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pref_key text not null check (pref_key in (
    'reactions', 'comment_likes', 'comments', 'follows', 'suggestions', 'requests', 'stories', 'quotes', 'results', 'milestones', 'weekly_digest'
  )),
  enabled boolean not null default false,
  primary key (user_id, pref_key)
);
alter table public.notification_type_prefs enable row level security;
revoke all on public.notification_type_prefs from public, anon, authenticated;
grant select on public.notification_type_prefs to authenticated;
drop policy if exists "Users read their own notification type prefs" on public.notification_type_prefs;
create policy "Users read their own notification type prefs"
  on public.notification_type_prefs for select to authenticated
  using (user_id = (select auth.uid()));

-- === 3. Saf yardımcılar (TS aynaları: src/lib/notification-mirror.ts — `notification-mirror.test.ts` ikisini karşılaştırır) ====================
-- Adresin `hl=` parametresiz tabanı: "aynı içerik" bu taban üzerinden eşleşir.
create or replace function public._notification_href_base(p_href text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(coalesce(p_href, ''), '&hl=[^&#]*', '', 'g'), '\?hl=[^&#]*$', '')
$$;

-- Bildirim merkezinin kategori menüsü (src/lib/notification-utils.ts NOTIFICATION_CATEGORY + notification-scope.ts).
create or replace function public._notification_category(p_type text, p_href text)
returns text language sql immutable as $$
  select case
    when coalesce(p_href, '') ~ '^/(communities|groups)([/?#]|$)' then 'community'
    when p_type = 'system' and coalesce(p_href, '') like '/messages/local%' then 'community'
    when p_type in ('request_response', 'request_edited') then 'requests'
    when p_type = 'follow' then 'follow'
    when p_type in ('message', 'message_request') then 'messages'
    when p_type in ('like', 'comment', 'comment_reply', 'prompt_edited', 'edit_suggestion_received', 'edit_suggestion_accepted',
                    'edit_suggestion_rejected', 'prompt_result_shared', 'story_reaction', 'story_poll_vote', 'story_question_answer', 'quote') then 'posts'
    else 'system'
  end
$$;

-- "Bu tür bildirimleri kapat" anahtarı; NULL = kapatılamaz (güvenlik/sistem, mesaj, topluluk).
create or replace function public._notification_pref_key(p_type text, p_href text, p_dedupe text)
returns text language sql immutable as $$
  select case
    when p_type = 'like' and coalesce(p_href, '') like '%hl=comment:%' then 'comment_likes'
    when p_type = 'like' then 'reactions'
    when p_type in ('comment', 'comment_reply') then 'comments'
    when p_type = 'follow' then 'follows'
    when p_type in ('edit_suggestion_received', 'edit_suggestion_accepted', 'edit_suggestion_rejected', 'prompt_edited') then 'suggestions'
    when p_type in ('request_response', 'request_edited') then 'requests'
    when p_type in ('story_reaction', 'story_poll_vote', 'story_question_answer') then 'stories'
    when p_type = 'quote' then 'quotes'
    when p_type = 'prompt_result_shared' then 'results'
    when p_type = 'system' and coalesce(p_dedupe, '') like 'milestone:%' then 'milestones'
    when p_type = 'system' and coalesce(p_dedupe, '') like 'weekly:%' then 'weekly_digest'
    else null
  end
$$;

create or replace function public._notification_group_key(p_type text, p_href text, p_id uuid)
returns text language sql immutable as $$
  select case
    when p_type in ('like', 'follow', 'story_reaction', 'story_poll_vote') then p_type || '|' || coalesce(p_href, '')
    else 'n|' || p_id::text
  end
$$;

-- Bir grup anahtarının satırları (çağıranın kendi satırları: INVOKER, RLS).
create or replace function public._notification_ids_for_key(p_key text)
returns setof uuid language sql stable set search_path = public as $$
  select n.id from public.notifications n
   where n.recipient_id = (select auth.uid())
     and case
       when left(coalesce(p_key, ''), 2) = 'n|' then n.id::text = substr(p_key, 3)
       when split_part(coalesce(p_key, ''), '|', 1) in ('like', 'follow', 'story_reaction', 'story_poll_vote')
         then n.type = split_part(p_key, '|', 1) and n.target_href = substr(p_key, position('|' in p_key) + 1)
       else false
     end
$$;

-- === 4. Sessize alma + tür tercihi: TEK yerde, ekleme anında ===================================================================================
create or replace function public._notifications_apply_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pref text;
begin
  v_pref := public._notification_pref_key(new.type, new.target_href, new.dedupe_key);
  if v_pref is not null and exists (
    select 1 from public.notification_type_prefs p where p.user_id = new.recipient_id and p.pref_key = v_pref and not p.enabled
  ) then
    return null;
  end if;
  -- Sessize alma: sistem (güvenlik, topluluk) ve mesaj isteği muaf; kilometre taşı içeriğe göre sessize alınabilir.
  if new.type <> 'message_request' and (new.type <> 'system' or coalesce(new.dedupe_key, '') like 'milestone:%') then
    if new.actor_id is not null and exists (
      select 1 from public.notification_mutes m where m.user_id = new.recipient_id and m.kind = 'actor' and m.target = new.actor_id::text
    ) then
      return null;
    end if;
    if exists (
      select 1 from public.notification_mutes m
       where m.user_id = new.recipient_id and m.kind = 'content' and m.target = public._notification_href_base(new.target_href)
    ) then
      return null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public._notifications_apply_preferences() from public, anon, authenticated;

drop trigger if exists notifications_apply_preferences on public.notifications;
create trigger notifications_apply_preferences
  before insert on public.notifications
  for each row execute function public._notifications_apply_preferences();

-- === 5. Okuma RPC'leri (SECURITY INVOKER: satırlar `notifications` RLS'inden geçer) =========================================================
-- Gruplu sayfa. Sıra (sort_at, group_key) azalan keyset; ertelenmiş satırlar yok (p_snoozed_only = yalnız ertelenmişler).
create or replace function public.notifications_grouped_page(
  p_limit integer default 30,
  p_before_at timestamptz default null,
  p_before_key text default null,
  p_category text default null,
  p_unread_only boolean default false,
  p_snoozed_only boolean default false
)
returns table (
  group_key text, type text, target_href text, sort_at timestamptz, row_count integer, unread_count integer,
  latest_id uuid, latest_message text, latest_actor_id uuid, actor_ids uuid[], reaction_counts jsonb
)
language sql stable set search_path = public as $$
  with base as (
    select n.id, n.type, n.target_href, n.message, n.actor_id, n.is_read, n.reaction, n.created_at, n.snoozed_until,
           public._notification_group_key(n.type, n.target_href, n.id) as gk,
           greatest(n.created_at, coalesce(n.snoozed_until, n.created_at)) as sa
      from public.notifications n
     where n.recipient_id = (select auth.uid())
     order by n.created_at desc, n.id desc
     limit 5000
  ), visible as (
    select b.* from base b
     where (case when p_snoozed_only then b.snoozed_until > now() else (b.snoozed_until is null or b.snoozed_until <= now()) end)
       and (p_category is null or public._notification_category(b.type, b.target_href) = p_category)
  ), grp as (
    select v.gk,
           (array_agg(v.type order by v.sa desc, v.id desc))[1] as type,
           (array_agg(v.target_href order by v.sa desc, v.id desc))[1] as target_href,
           max(v.sa) as sort_at,
           count(*)::integer as row_count,
           (count(*) filter (where not v.is_read))::integer as unread_count,
           (array_agg(v.id order by v.sa desc, v.id desc))[1] as latest_id,
           (array_agg(v.message order by v.sa desc, v.id desc))[1] as latest_message,
           (array_agg(v.actor_id order by v.sa desc, v.id desc))[1] as latest_actor_id
      from visible v
     group by v.gk
  ), actors as (
    select a.gk, array_agg(a.actor_id order by a.m desc) as actor_ids
      from (
        select v.gk, v.actor_id, max(v.sa) as m,
               row_number() over (partition by v.gk order by max(v.sa) desc) as rn
          from visible v where v.actor_id is not null
         group by v.gk, v.actor_id
      ) a
     where a.rn <= 3
     group by a.gk
  ), reacts as (
    select r.gk, jsonb_object_agg(r.reaction, r.n) as reaction_counts
      from (select v.gk, v.reaction, count(*)::integer as n from visible v where v.reaction is not null group by v.gk, v.reaction) r
     group by r.gk
  )
  select g.gk, g.type, g.target_href, g.sort_at, g.row_count, g.unread_count, g.latest_id, g.latest_message, g.latest_actor_id,
         coalesce(a.actor_ids, '{}'::uuid[]), coalesce(rc.reaction_counts, '{}'::jsonb)
    from grp g
    left join actors a on a.gk = g.gk
    left join reacts rc on rc.gk = g.gk
   where (not p_unread_only or g.unread_count > 0)
     and (p_before_at is null or (g.sort_at, g.gk) < (p_before_at, coalesce(p_before_key, '')))
   order by g.sort_at desc, g.gk desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- Zil rozeti: okunmamış satırı olan (ertelenmemiş) KART sayısı.
create or replace function public.notifications_unread_group_count()
returns integer language sql stable set search_path = public as $$
  select count(distinct public._notification_group_key(n.type, n.target_href, n.id))::integer
    from public.notifications n
   where n.recipient_id = (select auth.uid()) and not n.is_read and (n.snoozed_until is null or n.snoozed_until <= now())
$$;

-- Kategori menüsündeki okunmamış sayıları.
create or replace function public.notifications_unread_by_category()
returns table (category text, n integer) language sql stable set search_path = public as $$
  select public._notification_category(x.type, x.target_href) as category, count(distinct x.gk)::integer as n
    from (
      select n.type, n.target_href, public._notification_group_key(n.type, n.target_href, n.id) as gk
        from public.notifications n
       where n.recipient_id = (select auth.uid()) and not n.is_read and (n.snoozed_until is null or n.snoozed_until <= now())
    ) x
   group by 1
$$;

-- Ertelenenler: kart sayısı + en yakın uyanma anı (istemci tek zamanlayıcı kurar).
create or replace function public.notifications_snooze_summary()
returns table (snoozed_groups integer, next_wake timestamptz) language sql stable set search_path = public as $$
  select count(distinct public._notification_group_key(n.type, n.target_href, n.id))::integer, min(n.snoozed_until)
    from public.notifications n
   where n.recipient_id = (select auth.uid()) and n.snoozed_until > now()
$$;

-- Bir kartın üyeleri (Ayrıntı: kim, hangi tepkiyle, ne zaman) — (created_at, id) keyset.
create or replace function public.notifications_group_members(
  p_key text, p_limit integer default 30, p_before_at timestamptz default null, p_before_id uuid default null
)
returns table (id uuid, actor_id uuid, reaction text, is_read boolean, created_at timestamptz, message text)
language sql stable set search_path = public as $$
  select n.id, n.actor_id, n.reaction, n.is_read, n.created_at, n.message
    from public.notifications n
   where n.id in (select public._notification_ids_for_key(p_key))
     and (p_before_at is null or (n.created_at, n.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by n.created_at desc, n.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

-- === 6. Yazma RPC'leri ========================================================================================================================
create or replace function public.notifications_group_mark_read(p_key text)
returns integer language plpgsql set search_path = public as $$
declare v_n integer;
begin
  update public.notifications set is_read = true
   where id in (select public._notification_ids_for_key(p_key)) and not is_read;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.notifications_group_mark_unread(p_key text)
returns integer language plpgsql set search_path = public as $$
declare v_n integer;
begin
  update public.notifications set is_read = false
   where id in (select public._notification_ids_for_key(p_key)) and is_read;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.notifications_group_delete(p_key text)
returns integer language plpgsql set search_path = public as $$
declare v_n integer;
begin
  delete from public.notifications where id in (select public._notification_ids_for_key(p_key));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Erteleme: en çok 60 gün; erteleyince OKUNMAMIŞ işaretlenir (süre dolunca okunmamış olarak döner).
create or replace function public.notifications_group_snooze(p_key text, p_until timestamptz)
returns integer language plpgsql set search_path = public as $$
declare v_n integer;
begin
  if p_until is null or p_until <= now() or p_until > now() + interval '60 days' then
    raise exception 'snooze_invalid';
  end if;
  update public.notifications set snoozed_until = p_until, is_read = false
   where id in (select public._notification_ids_for_key(p_key));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.notifications_group_unsnooze(p_key text)
returns integer language plpgsql set search_path = public as $$
declare v_n integer;
begin
  update public.notifications set snoozed_until = null
   where id in (select public._notification_ids_for_key(p_key)) and snoozed_until is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Sessize alma: tablo istemciye kapalı, yazma yalnız burada (SECURITY DEFINER; kimlik auth.uid()).
create or replace function public.set_notification_mute(p_kind text, p_target text, p_label text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('actor', 'content') or p_target is null or char_length(p_target) not between 1 and 300 then
    raise exception 'mute_invalid';
  end if;
  if p_kind = 'actor' and p_target !~ '^[0-9a-fA-F-]{36}$' then raise exception 'mute_invalid'; end if;
  if p_kind = 'actor' and p_target = v_me::text then raise exception 'mute_invalid'; end if;
  if p_on then
    if not exists (select 1 from public.notification_mutes where user_id = v_me and kind = p_kind and target = p_target)
       and (select count(*) from public.notification_mutes where user_id = v_me) >= 200 then
      raise exception 'mute_limit';
    end if;
    insert into public.notification_mutes (user_id, kind, target, label)
    values (v_me, p_kind, case when p_kind = 'content' then public._notification_href_base(p_target) else lower(p_target) end, left(coalesce(p_label, ''), 120))
    on conflict (user_id, kind, target) do update set label = excluded.label;
  else
    delete from public.notification_mutes
     where user_id = v_me and kind = p_kind and target = case when p_kind = 'content' then public._notification_href_base(p_target) else lower(p_target) end;
  end if;
end $$;

create or replace function public.set_notification_type_pref(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_key not in ('reactions', 'comment_likes', 'comments', 'follows', 'suggestions', 'requests', 'stories', 'quotes', 'results', 'milestones', 'weekly_digest') then
    raise exception 'pref_invalid';
  end if;
  if p_enabled then
    delete from public.notification_type_prefs where user_id = v_me and pref_key = p_key;
  else
    insert into public.notification_type_prefs (user_id, pref_key, enabled) values (v_me, p_key, false)
    on conflict (user_id, pref_key) do update set enabled = false;
  end if;
end $$;

-- === 7. Yetkiler ===============================================================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'notifications_grouped_page(integer, timestamptz, text, text, boolean, boolean)',
    'notifications_unread_group_count()',
    'notifications_unread_by_category()',
    'notifications_snooze_summary()',
    'notifications_group_members(text, integer, timestamptz, uuid)',
    'notifications_group_mark_read(text)',
    'notifications_group_mark_unread(text)',
    'notifications_group_delete(text)',
    'notifications_group_snooze(text, timestamptz)',
    'notifications_group_unsnooze(text)',
    'set_notification_mute(text, text, text, boolean)',
    'set_notification_type_pref(text, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    '_notification_href_base(text)', '_notification_category(text, text)', '_notification_pref_key(text, text, text)',
    '_notification_group_key(text, text, uuid)', '_notification_ids_for_key(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
