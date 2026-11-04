-- Çevrimiçi durum, son görülme ve gizlilik (docs/history/329-*). YALNIZ EKLEME + iki fonksiyonun aynı imzayla yeniden yazımı
-- (`_telegram_pending`, `notifications_telegram_push` tetikleyicisinin WHEN koşulu); hiçbir sütun/tablo silinmez.
--
-- İki katman:
--   1) CANLI: Supabase Realtime **Presence**. Her kullanıcının KENDİ kanalı vardır: `presence:<kullanıcı>:<anahtar>` (PRIVATE). Kişi yalnız kendi
--      kanalında "buradayım" der (track); izleyen yalnız GÖRMEYE YETKİLİ olduğu kişilerin kanalını dinler. Yetki `realtime.messages` politikalarıyla
--      SUNUCUDA verilir (`can_use_presence_topic`). Anahtar (`topic_key`) kişi durum/kitle ayarını her değiştirdiğinde YENİLENİR: eski kanalı dinleyen
--      (artık yetkisi olmayan) izleyici kişinin ayrıldığını görür, yeni kanalın adını yalnız `presence_lookup` verir (yetkisi olana). Tüm kullanıcıları
--      tek dev bir kanalda toplamak yok: her kanalda tek kişi izlenir.
--   2) SON GÖRÜLME: `presence_state.last_active_at` (UTC). Yalnız `presence_heartbeat` RPC'si yazar, kişi başına en sık 60 sn'de bir (istemci cihaz
--      başına ~2,5 dk'da bir çağırır); görünmez modda HİÇ yazılmaz. Topluluk/etkinlik "aktif" sayıları bu sütundan (son 5 dk) hesaplanır — 100 000 üyeli
--      toplulukta Presence kanalı açmak yerine.
--
-- NEDEN `profiles.last_active_at` DEĞİL: `profiles` Realtime yayınındadır (`supabase_realtime`, engagement sayaçları için). Her nabız profil satırını
-- güncelleseydi (a) her izleyiciye profil UPDATE olayı giderdi (maliyet), (b) Realtime postgres_changes sütun düzeyi SELECT yetkisini uygulamadığından
-- son görülme ve görünmez mod herkese sızardı, (c) `updated_at` ve profil tetikleyicileri her 2-5 dk'da bir çalışırdı. Bu yüzden ayrı, istemciye
-- TAMAMEN kapalı bir tablo kullanılır.
--
-- Gizlilik (hepsi SUNUCUDA, `_presence_can_view`): kitle Herkes / Takip ettiklerim (kişinin takip ettiği izleyiciler) / Karşılıklı takip / Hiç kimse;
-- görünmez mod; KARŞILIKLILIK (kendi durumunu gizleyen — görünmez ya da "Hiç kimse" — başkalarınınkini de göremez); engel iki yönlü; ziyaretçi (anon)
-- hiçbir şey göremez (tüm RPC'ler anon'a kapalı). Görmeye yetkisi olmayan izleyici için kişi "satır yok" döner: görünmez olmak, izin vermemek ve hiç
-- kanal açmamış olmak birbirinden ayırt edilemez.

-- === 1. Tablo =================================================================================================================================
create table if not exists public.presence_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  mode text not null default 'auto',
  audience text not null default 'everyone',
  topic_key text not null default replace(gen_random_uuid()::text, '-', ''),
  last_active_at timestamptz,
  -- Telegram akıllı bildirimi: kişinin şu an GERÇEKTEN açık tuttuğu sayfa (yalnız Telegram bağlantısı olanlar için yazılır).
  focus_key text,
  focus_since timestamptz,
  focus_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint presence_state_mode_check check (mode in ('auto', 'invisible')),
  constraint presence_state_audience_check check (audience in ('everyone', 'following', 'mutual', 'nobody')),
  constraint presence_state_topic_key_check check (topic_key ~ '^[0-9a-f]{32}$'),
  constraint presence_state_focus_key_check check (focus_key is null or char_length(focus_key) <= 200)
);

alter table public.presence_state enable row level security;
-- İstemci rolleri tabloya HİÇ dokunamaz (okuma dahil): her şey aşağıdaki RPC'lerden geçer. Politika yok = RLS de her şeyi reddeder (iki katman).
revoke all on table public.presence_state from public, anon, authenticated;

-- "Şu an aktif" taramaları için: global etkin kişiler küçük bir kümedir; topluluk sayımı bu dizinden başlayıp üyeliği birincil anahtarla yoklar
-- (100 000 üyeyi dolaşmaz).
create index if not exists presence_state_active_idx
  on public.presence_state (last_active_at desc)
  where mode = 'auto' and audience <> 'nobody';
create index if not exists presence_state_public_active_idx
  on public.presence_state (last_active_at desc)
  where mode = 'auto' and audience = 'everyone';

-- Her profilin bir satırı vardır (yoksa "satırı yok" ile "görmeye yetkin yok" ayırt edilebilirdi).
insert into public.presence_state (user_id) select p.id from public.profiles p on conflict (user_id) do nothing;

create or replace function public._presence_row_for_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.presence_state (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists profiles_presence_row on public.profiles;
create trigger profiles_presence_row after insert on public.profiles
  for each row execute function public._presence_row_for_profile();

-- === 2. Görünürlük kuralı (TEK yer) ==========================================================================================================
-- Etkin pencere: "şu an aktif" = son nabız 5 dakikadan yeni (istemci görünürken ~2,5 dk'da bir nabız atar).
create or replace function public._presence_active_window()
returns interval language sql immutable as $$ select interval '5 minutes' $$;

-- Kişi kendi durumunu gizliyor mu (görünmez ya da "Hiç kimse")? Karşılıklılık kuralı bunu izleyiciye uygular.
create or replace function public._presence_hidden(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.mode = 'invisible' or s.audience = 'nobody' from public.presence_state s where s.user_id = p_user), false);
$$;

-- İzleyici hedefin çevrimiçi durumunu ve son görülmesini görebilir mi?
create or replace function public._presence_can_view(p_viewer uuid, p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer is not null and p_target is not null and (
    p_viewer = p_target
    or (
      not public._presence_hidden(p_viewer)
      and exists (
        select 1 from public.presence_state s
         where s.user_id = p_target
           and s.mode = 'auto'
           and case s.audience
                 when 'everyone' then true
                 when 'following' then exists (select 1 from public.follows f where f.follower_id = p_target and f.following_id = p_viewer)
                 when 'mutual' then exists (select 1 from public.follows f where f.follower_id = p_target and f.following_id = p_viewer)
                                and exists (select 1 from public.follows f where f.follower_id = p_viewer and f.following_id = p_target)
                 else false
               end
      )
      and not exists (
        select 1 from public.blocks b
         where (b.blocker_id = p_viewer and b.blocked_id = p_target) or (b.blocker_id = p_target and b.blocked_id = p_viewer)
      )
    )
  );
$$;

create or replace function public._presence_topic(p_user uuid, p_key text)
returns text language sql immutable as $$ select 'presence:' || p_user::text || ':' || p_key $$;

-- Odak anahtarı: adresin yolu (sondaki / atılır) + varsa `id` parametresi. İstemci karşılığı `src/lib/presence.ts` `presenceFocusKey`.
create or replace function public._presence_focus_key(p_href text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(split_part(split_part(coalesce(p_href, ''), '#', 1), '?', 1), '/+$', '')
      || coalesce('?id=' || substring(split_part(coalesce(p_href, ''), '#', 1) from '[?&]id=([^&#]+)'), ''),
    ''
  );
$$;

-- === 3. Kendi durumum ========================================================================================================================
-- Kendi ayarlarım + kendi kanalımın adı. Satır yoksa (profil tetikleyicisinden önce açılmış hesap) oluşturur.
create or replace function public.my_presence()
returns table (mode text, audience text, topic text, last_active_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.presence_state (user_id) values (v_uid) on conflict (user_id) do nothing;
  return query
    select s.mode, s.audience, public._presence_topic(s.user_id, s.topic_key), s.last_active_at
      from public.presence_state s where s.user_id = v_uid;
end $$;

-- Durum (Otomatik / Görünmez) ve kitle ayarı. Her değişiklikte kanal anahtarı YENİLENİR: eski kanalda kalan izleyiciler kişinin ayrıldığını görür;
-- yeni kanala ancak `presence_lookup`'tan adını alan (yetkili) izleyici girer. NULL argüman = o ayar değişmez.
create or replace function public.set_my_presence(p_mode text default null, p_audience text default null)
returns table (mode text, audience text, topic text, last_active_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_mode is not null and p_mode not in ('auto', 'invisible') then raise exception 'invalid_presence_mode' using errcode = '22023'; end if;
  if p_audience is not null and p_audience not in ('everyone', 'following', 'mutual', 'nobody') then
    raise exception 'invalid_presence_audience' using errcode = '22023';
  end if;
  insert into public.presence_state (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.presence_state s
     set mode = coalesce(p_mode, s.mode),
         audience = coalesce(p_audience, s.audience),
         topic_key = case
                       when coalesce(p_mode, s.mode) is distinct from s.mode or coalesce(p_audience, s.audience) is distinct from s.audience
                         then replace(gen_random_uuid()::text, '-', '')
                       else s.topic_key
                     end,
         updated_at = now()
   where s.user_id = v_uid;
  return query
    select s.mode, s.audience, public._presence_topic(s.user_id, s.topic_key), s.last_active_at
      from public.presence_state s where s.user_id = v_uid;
end $$;

-- Son görülme nabzı. Görünmez modda HİÇBİR ŞEY yazmaz; aynı kişi için 60 sn içinde ikinci yazma yapmaz (çok sekme / çok cihaz).
-- Dönen değer kendi güncel ayarımdır: başka cihazda yapılan değişiklik (görünmez oldu, kanal anahtarı döndü) böylece bu cihaza da ulaşır.
create or replace function public.presence_heartbeat()
returns table (mode text, audience text, topic text, last_active_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.presence_state (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.presence_state s
     set last_active_at = now()
   where s.user_id = v_uid
     and s.mode = 'auto'
     and (s.last_active_at is null or s.last_active_at < now() - interval '60 seconds');
  return query
    select s.mode, s.audience, public._presence_topic(s.user_id, s.topic_key), s.last_active_at
      from public.presence_state s where s.user_id = v_uid;
end $$;

-- Telegram akıllı bildirimi için "şu an açık tuttuğum sayfa". YALNIZ bildirim isteyen bir Telegram bağlantısı varsa yazar (yoksa false döner ve
-- istemci bu oturumda bir daha çağırmaz). NULL = odak yok (sekme gizlendi / sayfadan çıkıldı). Kayıt 75 sn geçerlidir; istemci görünürken
-- 60 sn'de bir yeniler. Görünmez modla ilgisi yoktur (başkalarına hiçbir zaman gösterilmez).
create or replace function public.presence_set_focus(p_key text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_key text := nullif(left(btrim(coalesce(p_key, '')), 200), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.telegram_links l where l.user_id = v_uid and l.notify_activity) then
    update public.presence_state set focus_key = null, focus_since = null, focus_until = null
     where user_id = v_uid and focus_key is not null;
    return false;
  end if;
  insert into public.presence_state (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.presence_state s
     set focus_since = case when v_key is null then null
                            when s.focus_key = v_key and s.focus_until >= now() then s.focus_since
                            else now() end,
         focus_key = v_key,
         focus_until = case when v_key is null then null else now() + interval '75 seconds' end
   where s.user_id = v_uid;
  return true;
end $$;

-- === 4. Başkalarının durumu ==================================================================================================================
-- İzleyicinin GÖRMEYE YETKİLİ olduğu kişiler için: canlı kanal adı + son görülme. Yetkisiz/gizli/engelli/görünmez kişi HİÇ dönmez (ayırt edilemez).
-- Kendisi dahil edilmez (istemci kendi durumunu `my_presence`'tan bilir). En çok 200 kişi.
create or replace function public.presence_lookup(p_ids uuid[])
returns table (user_id uuid, topic text, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.user_id, public._presence_topic(s.user_id, s.topic_key), s.last_active_at
    from (select distinct x as id from unnest(coalesce(p_ids, '{}'::uuid[])) x limit 200) ids
    join public.presence_state s on s.user_id = ids.id
   where auth.uid() is not null
     and s.user_id <> auth.uid()
     and public._presence_can_view(auth.uid(), s.user_id);
$$;

-- Realtime Authorization: `presence:<kullanıcı>:<anahtar>` kanalı.
--   okuma (dinleme): kanalın sahibi ya da sahibin durumunu görmeye yetkili izleyici; anahtar GÜNCEL olmalı (eski anahtarla yeni katılım olmaz).
--   yazma (track): yalnız sahibi, yalnız Otomatik modda ve kitle "Hiç kimse" değilken.
create or replace function public.can_use_presence_topic(p_topic text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_target uuid;
  v_key text;
  s public.presence_state;
begin
  if auth.uid() is null or p_topic is null
     or p_topic !~ '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}$' then
    return false;
  end if;
  v_target := substring(p_topic from 10 for 36)::uuid;
  v_key := substring(p_topic from 47);
  select * into s from public.presence_state ps where ps.user_id = v_target;
  if not found or s.topic_key <> v_key then return false; end if;
  if p_write then
    return v_target = auth.uid() and s.mode = 'auto' and s.audience <> 'nobody';
  end if;
  return public._presence_can_view(auth.uid(), v_target);
end $$;

-- === 5. Topluluklar ve etkinlikler ===========================================================================================================
-- Topluluk başına "şu an aktif" üye sayısı (toplu; kimlik vermez). Yalnız topluluğu OKUYABİLENE (üye ya da herkese açık topluluk; kapalı/tamamen
-- kapalı topluluğun üye olmayana sayısı hiç dönmez — varlığı/etkinliği sızmaz). Sayıma yalnız durumu HERKESE açık olan (Otomatik + Herkes) etkin
-- üyeler girer: kişiye özel kitle ayarı toplu bir sayıda kişi başına uygulanamaz, bu yüzden en dar yorum seçildi. Karşılıklılık: kendi durumunu
-- gizleyen hiçbir sayı almaz. En çok 50 topluluk, sayı 10 000'de kesilir.
create or replace function public.community_presence_counts(p_ids uuid[])
returns table (community_id uuid, online_count integer)
language sql stable security definer set search_path = public as $$
  select c.id,
         (select count(*)::integer from (
            select 1
              from public.presence_state s
              join public.conversation_members m on m.conversation_id = c.id and m.user_id = s.user_id
             where s.mode = 'auto' and s.audience = 'everyone'
               and s.last_active_at > now() - public._presence_active_window()
             limit 10000
          ) x)
    from (select distinct x as id from unnest(coalesce(p_ids, '{}'::uuid[])) x limit 50) c
   where auth.uid() is not null
     and not public._presence_hidden(auth.uid())
     and exists (select 1 from public.chat_groups g where g.id = c.id)
     and public.can_read_community(c.id);
$$;

-- Davet bağlantısının açılış sayfası: bağlantı önizlemesi üye olmayana topluluk kimliğini VERMEZ (`preview_chat_group_link`), bu yüzden sayı
-- jetonla sorulur. Yalnız GEÇERLİ bağlantı (iptal/süre/kullanım sınırı) + HERKESE AÇIK topluluk + yasaklı/engelli olmayan oturumlu izleyici;
-- kapalı/tamamen kapalı toplulukta ve geçersiz jetonda NULL (varlık/etkinlik sızmaz). Sayım `community_presence_counts` ile aynı kural.
create or replace function public.community_link_presence_count(p_token text)
returns integer
language sql stable security definer set search_path = public as $$
  select (
    select count(*)::integer from (
      select 1
        from public.presence_state s
        join public.conversation_members m on m.conversation_id = g.id and m.user_id = s.user_id
       where s.mode = 'auto' and s.audience = 'everyone'
         and s.last_active_at > now() - public._presence_active_window()
       limit 10000
    ) x
  )
    from public.chat_group_links l
    join public.chat_groups g on g.id = l.group_id
   where auth.uid() is not null
     and p_token ~ '^[A-Za-z0-9_-]{20,100}$'
     and not public._presence_hidden(auth.uid())
     and l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and l.revoked_at is null and l.expires_at > now() and (l.max_uses is null or l.use_count < l.max_uses)
     and g.visibility = 'public'
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not public._group_user_blocked(g.id, auth.uid());
$$;

-- Toplulukta şu an çevrimiçi olan üyeler (kimlikli liste): her satır izleyicinin O KİŞİYİ görme iznine tabidir (`_presence_can_view`).
-- Tam liste yalnız ÜYEYE; `p_staff_only` (sahip/yönetici/moderatör) herkese açık toplulukta üye olmayan okuyucuya da açıktır (kime ulaşabileceğini görsün).
-- Tarama global etkin kişi kümesinden başlar (dizin), üyelik birincil anahtarla yoklanır.
create or replace function public.community_online_members(p_group_id uuid, p_staff_only boolean default false, p_limit integer default 50)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, joined_at timestamptz, last_active_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, m.role, m.joined_at, s.last_active_at
    from public.presence_state s
    join public.conversation_members m on m.conversation_id = p_group_id and m.user_id = s.user_id
    join public.profiles p on p.id = s.user_id
   where auth.uid() is not null
     and s.mode = 'auto' and s.audience <> 'nobody'
     and s.last_active_at > now() - public._presence_active_window()
     and (not coalesce(p_staff_only, false) or m.role in ('owner', 'admin', 'moderator'))
     and (
       exists (select 1 from public.conversation_members me where me.conversation_id = p_group_id and me.user_id = auth.uid())
       or (coalesce(p_staff_only, false) and public.can_read_community(p_group_id))
     )
     and public._presence_can_view(auth.uid(), s.user_id)
   order by public.chat_group_role_rank(m.role) desc, s.last_active_at desc, p.id
   limit greatest(least(coalesce(p_limit, 50), 100), 1);
$$;

-- Etkinlik başına: katılacağını (Gidiyorum/Belki) belirtenlerden şu an aktif olanların toplu sayısı (topluluğu okuyabilene; Herkes kitlesi) ve
-- izleyicinin görmeye yetkili olduğu çevrimiçi katılımcılar (yalnız ÜYEYE, en çok 12 kişi). En çok 30 etkinlik.
create or replace function public.community_events_presence(p_event_ids uuid[])
returns table (event_id uuid, online_count integer, attendees jsonb)
language sql stable security definer set search_path = public as $$
  select e.id,
         (select count(*)::integer
            from public.community_event_rsvps r
            join public.presence_state s on s.user_id = r.user_id
           where r.event_id = e.id and r.status in ('going', 'maybe')
             and s.mode = 'auto' and s.audience = 'everyone'
             and s.last_active_at > now() - public._presence_active_window()),
         case when exists (select 1 from public.conversation_members me where me.conversation_id = e.community_id and me.user_id = auth.uid()) then
           coalesce((
             select jsonb_agg(jsonb_build_object('user_id', a.id, 'username', a.username, 'display_name', a.display_name,
                                                 'avatar_url', a.avatar_url, 'status', a.status) order by a.last_active_at desc)
               from (
                 select p.id, p.username, p.display_name, p.avatar_url, r.status, s.last_active_at
                   from public.community_event_rsvps r
                   join public.presence_state s on s.user_id = r.user_id
                   join public.profiles p on p.id = r.user_id
                  where r.event_id = e.id and r.status in ('going', 'maybe')
                    and s.mode = 'auto' and s.audience <> 'nobody'
                    and s.last_active_at > now() - public._presence_active_window()
                    and public._presence_can_view(auth.uid(), r.user_id)
                  order by s.last_active_at desc
                  limit 12
               ) a
           ), '[]'::jsonb)
         else '[]'::jsonb end
    from (select distinct x as id from unnest(coalesce(p_event_ids, '{}'::uuid[])) x limit 30) ids
    join public.community_events e on e.id = ids.id
   where auth.uid() is not null
     and not public._presence_hidden(auth.uid())
     and public.can_read_community(e.community_id);
$$;

-- === 6. Telegram akıllı bildirimi ============================================================================================================
-- Bildirim yazılırken alıcı o içeriğin sayfasını O AN gerçekten açık tutuyorsa (görünür sekme, taze odak kaydı) Telegram'a GİTMEZ; sitedeki bildirim
-- aynen yazılır. Karar yazma anında verilir ve satıra işlenir (`push_suppressed`), böylece yedek zamanlayıcı sonradan da göndermez. Odak kaydı yoksa,
-- süresi geçmişse ya da başka bir sayfaysa → GÖNDERİLİR (belirsizlikte güvenli varsayılan). Yalnız çevrimiçi olmak yetmez.
alter table public.notifications add column if not exists push_suppressed boolean not null default false;

create or replace function public._notifications_presence_focus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.push_suppressed := false;
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

drop trigger if exists notifications_presence_focus on public.notifications;
create trigger notifications_presence_focus
  before insert on public.notifications
  for each row execute function public._notifications_presence_focus();

-- Anlık yol: bastırılmış bildirim için Edge çağrılmaz (koşul dışında tetikleyici aynı).
drop trigger if exists notifications_telegram_push on public.notifications;
create trigger notifications_telegram_push
  after insert on public.notifications
  for each row
  when (new.type in ('comment', 'comment_reply', 'request_response', 'quote', 'edit_suggestion_received', 'prompt_result_shared')
        and not new.push_suppressed)
  execute function public._telegram_push_on_notification();

-- Yedek yol: bastırılmış bildirim bekleyenler listesine girmez (imleç sonraki gönderilen bildirimle onun üstünden geçer). İmza ve dönen sütunlar AYNI.
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
    and not n.push_suppressed
  order by n.created_at asc, n.id asc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- === 7. Realtime Authorization politikaları ==================================================================================================
-- `realtime.messages` yoksa (yerel test) ya da oluşturulamazsa atlanır — politika yoksa private presence kanalları HERKESE kapalıdır (güvenli taraf:
-- canlı nokta çalışmaz, son görülme yine çalışır; sızıntı olmaz).
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    begin
      execute 'drop policy if exists "Allowed viewers can receive presence" on realtime.messages';
      execute 'drop policy if exists "Owners can track their presence" on realtime.messages';
      execute $p$create policy "Allowed viewers can receive presence" on realtime.messages
        for select to authenticated
        using (realtime.messages.extension = 'presence' and public.can_use_presence_topic((select realtime.topic()), false))$p$;
      execute $p$create policy "Owners can track their presence" on realtime.messages
        for insert to authenticated
        with check (realtime.messages.extension = 'presence' and public.can_use_presence_topic((select realtime.topic()), true))$p$;
    exception when others then
      raise warning 'realtime.messages presence politikaları oluşturulamadı (%); elle oluşturun (docs/history/329-*)', sqlerrm;
    end;
  else
    raise notice 'realtime.messages bulunamadı: presence politikaları atlandı';
  end if;
end $$;

-- === 8. Yetkiler =============================================================================================================================
do $$
declare f text;
begin
  -- İstemcinin çağırdıkları: yalnız oturumlu kullanıcı.
  foreach f in array array[
    'my_presence()',
    'set_my_presence(text, text)',
    'presence_heartbeat()',
    'presence_set_focus(text)',
    'presence_lookup(uuid[])',
    'community_presence_counts(uuid[])',
    'community_link_presence_count(text)',
    'community_online_members(uuid, boolean, integer)',
    'community_events_presence(uuid[])',
    'can_use_presence_topic(text, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- İç yardımcılar ve tetikleyiciler: hiçbir istemci rolüne açık değil.
  foreach f in array array[
    '_presence_hidden(uuid)',
    '_presence_can_view(uuid, uuid)',
    '_presence_row_for_profile()',
    '_notifications_presence_focus()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Saf (veri okumayan) yardımcılar zararsızdır ama yine de istemciye açılmaz.
  foreach f in array array['_presence_active_window()', '_presence_topic(uuid, text)', '_presence_focus_key(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public._telegram_pending(uuid, integer) from public, anon, authenticated;
