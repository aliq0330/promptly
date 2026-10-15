-- Topluluklar — ÜÇ GÖRÜNÜRLÜK DÜZEYİ, aramadan başvuru, öneriler; "Kaydet" (yer imi) kaldırılır (docs/history/176-*).
--
--   public     Herkese açık      Keşfet'te görünür; içerik üye olmadan okunur; doğrudan katılınır.
--   restricted Kapalı            Keşfet'te GÖRÜNMEZ; arama ve önerilerde görünür; içerik üyelik olmadan okunmaz; aramadan/öneriden
--                                katılma BAŞVURUSU gönderilir (yönetici onaylar). (Önceki "kapalı = salt-okunur" `closed_at`'tan ayrıdır.)
--   private    Tamamen kapalı    Hiçbir listede/aramada/öneride görünmez, id ile bile bulunamaz; yalnız davet ya da davet bağlantısı.
--                                Bugüne dek 'private' olan her topluluk aynen böyle kalır (eski davranış değişmez).
--
-- Yalnızca ekleyici/değiştirici: eski migration'lara dokunulmaz. İki yıkıcı adım VARDIR ve ikisi de henüz canlıya hiç uygulanmamış
-- 175 nesnesidir: `community_bookmarks` tablosu + `set_community_bookmark` + (dönüş tipi değiştiği için) `list_my_communities`.

-- ============================================================================
-- 1. "Kaydet" (yer imi) kaldırılır
-- ============================================================================

drop function if exists public.set_community_bookmark(uuid, boolean);
drop function if exists public.list_my_communities(text, integer, integer);
drop table if exists public.community_bookmarks;

-- Benim topluluklarım. p_scope: 'member' (üyesi olduklarım) | 'managed' (owner/admin/moderatör olduklarım).
-- Yalnız kendi üyeliğim üzerinden: başkasının listesi görülmez.
create or replace function public.list_my_communities(
  p_scope text default 'member',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, closed boolean, created_at timestamptz, last_activity_at timestamptz,
  my_role text, unread_count integer, pending_request_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit, g.post_count,
         (select count(*)::integer from public.community_events e
           where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) as upcoming_event_count,
         g.closed_at is not null as closed, g.created_at,
         greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) as last_activity_at,
         m.role as my_role,
         coalesce(m.unread_count, 0) as unread_count,
         case when m.user_id is not null and public._group_can(g.id, auth.uid(), 'manage_requests') then g.pending_request_count else 0 end as pending_request_count
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
   where auth.uid() is not null
     and (
       (p_scope = 'member' and m.user_id is not null)
       or (p_scope = 'managed' and m.role in ('owner', 'admin', 'moderator'))
     )
   order by greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) desc nulls last,
            g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 30), 100), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- ============================================================================
-- 2. Üçüncü görünürlük değeri + kapalı topluluğun KARTI herkese okunur
-- ============================================================================

alter table public.chat_groups drop constraint chat_groups_visibility_check;
alter table public.chat_groups add constraint chat_groups_visibility_check check (visibility in ('public', 'restricted', 'private'));

create index chat_groups_restricted_popular_idx on public.chat_groups (member_count desc, id)
  where visibility = 'restricted' and closed_at is null;

-- Kapalı topluluğun satırı (ad, açıklama, kategori, üye sayısı, kurallar) arama/öneri/başvuru için herkese okunur. İçerik (gönderi,
-- duyuru, etkinlik, sohbet, üye listesi) AYRI politikalarla korunur: `can_read_community` yalnızca 'public' ya da üyeliği kabul eder.
-- 'private' satırın varlığı hâlâ sızmaz (yalnız üye / bekleyen davetli / bekleyen başvurucu okur).
alter policy "Public groups and groups I belong to are readable" on public.chat_groups
  using (
    visibility in ('public', 'restricted')
    or public.is_conversation_member(id)
    or exists (
      select 1 from public.chat_group_invitations i
       where i.group_id = chat_groups.id and i.invitee_id = auth.uid()
         and i.status = 'pending' and i.expires_at > now()
    )
    or exists (
      select 1 from public.chat_group_join_requests r
       where r.group_id = chat_groups.id and r.user_id = auth.uid() and r.status = 'pending'
    )
  );

-- ============================================================================
-- 3. Oluşturma ve görünürlük değiştirme: 'restricted' kabul edilir
-- ============================================================================

-- `create_chat_group` (172) yalnız public/private bilir ve değişmez: 'restricted' önce 'private' olarak oluşturulur, aynı işlemde yükseltilir.
create or replace function public.create_community(
  p_name text,
  p_description text default null,
  p_visibility text default 'private',
  p_avatar_url text default null,
  p_member_limit integer default 256,
  p_invite_user_ids uuid[] default '{}',
  p_category text default 'general',
  p_posting_policy text default 'members',
  p_feed_policy text default 'members',
  p_rules text default null,
  p_rules_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_rules text := nullif(btrim(coalesce(p_rules, '')), '');
  v_result jsonb;
  v_id uuid;
begin
  if p_visibility not in ('public', 'restricted', 'private') then
    raise exception 'invalid_visibility';
  end if;
  if not public._community_valid_category(p_category) then
    raise exception 'invalid_category';
  end if;
  if p_posting_policy not in ('members', 'admins') then
    raise exception 'invalid_posting_policy';
  end if;
  if p_feed_policy not in ('members', 'admins') then
    raise exception 'invalid_feed_policy';
  end if;
  if v_rules is not null and char_length(v_rules) > 5000 then
    raise exception 'invalid_rules';
  end if;
  if coalesce(p_rules_required, false) and v_rules is null then
    raise exception 'rules_missing';
  end if;

  v_result := public.create_chat_group(
    p_name, p_description, case when p_visibility = 'restricted' then 'private' else p_visibility end,
    p_avatar_url, p_member_limit, p_invite_user_ids
  );
  v_id := (v_result ->> 'group_id')::uuid;

  update public.chat_groups
     set visibility = p_visibility, category = p_category, posting_policy = p_posting_policy, feed_policy = p_feed_policy,
         rules = v_rules, rules_required = coalesce(p_rules_required, false)
   where id = v_id;
  perform public._community_record_acceptance(v_id, v_actor);
  perform public._group_audit(v_id, btrim(p_name), v_actor, null, 'community_created',
    jsonb_build_object('category', p_category, 'visibility', p_visibility));
  return v_result || jsonb_build_object('visibility', p_visibility);
end;
$$;

-- Görünürlük değişimi (173'teki yetenek denetimi aynen): bekleyen başvurular YALNIZ 'public'e geçişte, güvenlik kurallarına uyanlar için
-- kabul edilir (uymayanlar `pending` kalır ve nedeniyle raporlanır; hiçbir yol sessizce "kabul edildi" işaretlemez). Diğer geçişlerde
-- (public → restricted/private, restricted ↔ private) bekleyen başvurulara dokunulmaz; yöneticiler kararı kendileri verir.
create or replace function public.set_chat_group_visibility(p_group_id uuid, p_visibility text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_audit uuid;
  r record;
  v_reason text;
  v_accepted integer := 0;
  v_already integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_skipped_count integer := 0;
  v_member record;
begin
  if p_visibility not in ('public', 'restricted', 'private') then
    raise exception 'invalid_visibility';
  end if;
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'change_visibility');

  if g.visibility = p_visibility then
    return jsonb_build_object(
      'changed', false, 'visibility', g.visibility, 'accepted_count', 0, 'already_member_count', 0,
      'skipped_count', 0, 'skipped', '[]'::jsonb, 'pending_remaining', g.pending_request_count, 'member_count', g.member_count
    );
  end if;

  update public.chat_groups set visibility = p_visibility where id = p_group_id;
  v_audit := public._group_audit(p_group_id, g.name, v_actor, null, 'visibility_changed',
    jsonb_build_object('from', g.visibility, 'to', p_visibility));

  if p_visibility = 'public' then
    for r in
      select id, user_id from public.chat_group_join_requests
       where group_id = p_group_id and status = 'pending'
       order by created_at, id
       for update
    loop
      v_reason := null;
      if exists (select 1 from public.conversation_members where conversation_id = p_group_id and user_id = r.user_id) then
        update public.chat_group_join_requests
           set status = 'accepted', decided_by = v_actor, decided_at = now(), decision_note = 'already_member'
         where id = r.id;
        v_already := v_already + 1;
        continue;
      elsif exists (select 1 from public.chat_group_bans where group_id = p_group_id and user_id = r.user_id) then
        v_reason := 'banned';
      elsif public._group_user_blocked(p_group_id, r.user_id, v_actor) then
        v_reason := 'blocked';
      elsif (select member_count >= member_limit from public.chat_groups where id = p_group_id) then
        v_reason := 'member_limit';
      end if;

      if v_reason is not null then
        v_skipped_count := v_skipped_count + 1;
        if v_skipped_count <= 50 then
          v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('request_id', r.id, 'user_id', r.user_id, 'reason', v_reason));
        end if;
        continue;
      end if;

      update public.chat_group_join_requests
         set status = 'accepted', decided_by = v_actor, decided_at = now(), decision_note = 'visibility_public'
       where id = r.id;
      perform public._group_add_member(p_group_id, r.user_id, 'member');
      perform public._group_audit(p_group_id, g.name, v_actor, r.user_id, 'request_accepted', jsonb_build_object('request_id', r.id, 'bulk', true));
      perform public._group_notify(
        r.user_id, v_actor, p_group_id,
        'Katılma isteğini kabul etti: "' || public.truncate_preview(g.name, 60) || '"',
        '/messages/local?id=' || p_group_id,
        'grpreq:' || r.id || ':accepted'
      );
      v_accepted := v_accepted + 1;
    end loop;
  end if;

  -- Üyelere (sessize almayanlara) görünürlüğün değiştiği bildirilir.
  for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
    perform public._group_notify(
      v_member.user_id, v_actor, p_group_id,
      case when p_visibility = 'public'
        then '"' || public.truncate_preview(g.name, 60) || '" grubunu herkese açık yaptı.'
        else '"' || public.truncate_preview(g.name, 60) || '" grubunu herkese kapattı.' end,
      '/messages/local?id=' || p_group_id,
      'grpevt:' || v_audit || ':' || v_member.user_id,
      true
    );
  end loop;

  select * into g from public.chat_groups where id = p_group_id;
  return jsonb_build_object(
    'changed', true,
    'visibility', g.visibility,
    'accepted_count', v_accepted,
    'already_member_count', v_already,
    'skipped_count', v_skipped_count,
    'skipped', v_skipped,
    'pending_remaining', g.pending_request_count,
    'member_count', g.member_count
  );
end;
$$;

-- ============================================================================
-- 4. Aramadan / öneriden katılma BAŞVURUSU
-- ============================================================================

-- Herkese açık topluluk → doğrudan katılım (`join_community`). Kapalı ('restricted') topluluk → başvuru (üye yapmaz, yönetici karar verir).
-- Tamamen kapalı ('private') topluluk → "bulunamadı": id bilinse bile bu yoldan başvurulamaz, varlığı sızmaz.
-- Kural kabulü zorunluysa kabul AYNI işlemde kaydedilir; başvuru satırı eklenirken tetikleyici de ayrıca doğrular.
create or replace function public.request_join_community(p_group_id uuid, p_message text default null, p_accept_rules boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_request_id uuid;
  v_staff record;
begin
  if v_message is not null and char_length(v_message) > 300 then
    raise exception 'invalid_message';
  end if;
  g := public._group_lock(p_group_id);

  if public._group_member_role(p_group_id, v_actor) is not null then
    return jsonb_build_object('outcome', 'already_member', 'group_id', p_group_id);
  end if;
  if g.visibility = 'public' then
    return public.join_community(p_group_id, p_accept_rules);
  end if;
  if g.visibility <> 'restricted' then
    raise exception 'group_not_found';
  end if;
  if exists (select 1 from public.chat_group_bans where group_id = p_group_id and user_id = v_actor)
     or public._group_user_blocked(p_group_id, v_actor) then
    raise exception 'cannot_join';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;

  -- Bekleyen bir davetim varsa başvuru yerine davet kabul sayılır.
  if exists (
    select 1 from public.chat_group_invitations
     where group_id = p_group_id and invitee_id = v_actor and status = 'pending' and expires_at > now()
  ) then
    if coalesce(p_accept_rules, false) then
      perform public._community_record_acceptance(p_group_id, v_actor);
    end if;
    perform public._group_add_member(p_group_id, v_actor, 'member');
    perform public._group_audit(p_group_id, g.name, v_actor, v_actor, 'member_joined', jsonb_build_object('via', 'invitation'));
    return jsonb_build_object('outcome', 'joined', 'group_id', p_group_id);
  end if;

  if exists (select 1 from public.chat_group_join_requests where group_id = p_group_id and user_id = v_actor and status = 'pending') then
    return jsonb_build_object('outcome', 'already_requested', 'group_id', null);
  end if;
  if g.member_count >= g.member_limit then
    raise exception 'member_limit_reached';
  end if;
  -- Reddedilen kişi 24 saat sonra yeniden başvurabilir (geçmiş silinmez, yeni satır açılır).
  if exists (
    select 1 from public.chat_group_join_requests
     where group_id = p_group_id and user_id = v_actor and status = 'rejected' and decided_at > now() - interval '24 hours'
  ) then
    raise exception 'request_cooldown';
  end if;
  if g.pending_request_count >= 200
     or (select count(*) from public.chat_group_join_requests where user_id = v_actor and status = 'pending') >= 20 then
    raise exception 'request_limit_reached';
  end if;

  if coalesce(p_accept_rules, false) then
    perform public._community_record_acceptance(p_group_id, v_actor);
  end if;
  insert into public.chat_group_join_requests (group_id, user_id, message)
  values (p_group_id, v_actor, v_message)
  returning id into v_request_id;
  perform public._group_audit(p_group_id, g.name, v_actor, v_actor, 'request_created', jsonb_build_object('request_id', v_request_id, 'via', 'search'));

  -- Başvuruları yönetebilen (yetenek: manage_requests) herkese haber verilir.
  for v_staff in
    select user_id from public.conversation_members
     where conversation_id = p_group_id and role in ('owner', 'admin', 'moderator')
  loop
    if public._group_can(p_group_id, v_staff.user_id, 'manage_requests') then
      perform public._group_notify(
        v_staff.user_id, v_actor, p_group_id,
        '"' || public.truncate_preview(g.name, 60) || '" grubuna katılma isteği gönderdi.',
        '/messages/local?id=' || p_group_id || '&panel=requests',
        'grpreq:' || v_request_id || ':new:' || v_staff.user_id,
        true
      );
    end if;
  end loop;
  return jsonb_build_object('outcome', 'requested', 'group_id', null, 'request_id', v_request_id);
end;
$$;

-- ============================================================================
-- 5. Arama ve öneriler (herkese açık + kapalı; tamamen kapalı ASLA)
-- ============================================================================

-- Arama: ad/açıklama. Herkese açık ve kapalı topluluklar döner. Kapalı topluluk için içerik istatistiği (gönderi, etkinlik, son etkinlik)
-- üye olmayana verilmez: yalnızca kartın zaten gösterdiği bilgiler (ad, açıklama, kategori, üye sayısı) sızar.
-- Yasaklı olduğum ve sahibiyle engel ilişkisi olan topluluklar listelenmez. Sıralama: ad eşleşmesi önce, sonra üye sayısı.
create or replace function public.search_communities(
  p_query text,
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select nullif(btrim(left(coalesce(p_query, ''), 100)), '') as term
  ), pat as (
    select term, replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as esc from q
  )
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit,
         case when g.visibility = 'public' or m.user_id is not null then g.post_count end as post_count,
         case when g.visibility = 'public' or m.user_id is not null then
           (select count(*)::integer from public.community_events e
             where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) end as upcoming_event_count,
         g.rules_required, g.created_at,
         case when g.visibility = 'public' or m.user_id is not null then
           greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) end as last_activity_at,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end as my_status
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    cross join pat
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where auth.uid() is not null
     and pat.term is not null
     and g.visibility in ('public', 'restricted')
     and g.closed_at is null
     and (p_category is null or g.category = p_category)
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       g.name ilike '%' || pat.esc || '%'
       or g.description ilike '%' || pat.esc || '%'
     )
   order by
     case when lower(g.name) = lower(pat.term) then 0 when g.name ilike pat.esc || '%' then 1 else 2 end,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

-- Öneriler: üye olmadığım, davet/başvurum bulunmayan, dolu olmayan herkese açık + kapalı topluluklar. Puan = üyesi olduğum
-- topluluklarla AYNI kategori (genel kategori hariç, en çok 3) × 3 + ln(1 + üye sayısı) + (yalnız herkese açıkta) son 14 gündeki gönderi etkinliği.
-- Kapalı topluluğun etkinliği hesaba katılmaz (içerik sinyali sızmasın). Üye olduğum kişilerden/takip ettiklerimden türetilen sinyal YOK.
-- `reason`: 'category' (ortak kategori) | 'popular'.
create or replace function public.suggest_communities(p_limit integer default 8)
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  post_count integer, upcoming_event_count integer, rules_required boolean, created_at timestamptz,
  last_activity_at timestamptz, my_status text, reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select g2.category, count(*)::integer as n
      from public.conversation_members m2
      join public.chat_groups g2 on g2.id = m2.conversation_id
     where m2.user_id = auth.uid() and g2.category <> 'general'
     group by g2.category
  ), cand as (
    select g.*,
           coalesce(mine.n, 0) as overlap,
           3 * least(coalesce(mine.n, 0), 3)
             + ln((1 + g.member_count)::double precision)
             + case when g.visibility = 'public' then
                 0.5 * least((select count(*) from public.community_posts p
                               where p.community_id = g.id and p.created_at > now() - interval '14 days'), 5)
               else 0 end as score
      from public.chat_groups g
      left join mine on mine.category = g.category
     where auth.uid() is not null
       and g.visibility in ('public', 'restricted')
       and g.closed_at is null
       and g.member_count < g.member_limit
       and not exists (select 1 from public.conversation_members m where m.conversation_id = g.id and m.user_id = auth.uid())
       and not exists (
         select 1 from public.chat_group_invitations i
          where i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
       )
       and not exists (
         select 1 from public.chat_group_join_requests r
          where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
       )
       and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
       and not exists (
         select 1 from public.conversation_members o
          where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
       )
  )
  select cand.id, cand.name, cand.description, cand.avatar_url, cand.category, cand.visibility, cand.member_count, cand.member_limit,
         case when cand.visibility = 'public' then cand.post_count end as post_count,
         case when cand.visibility = 'public' then
           (select count(*)::integer from public.community_events e
             where e.community_id = cand.id and e.status = 'scheduled' and e.starts_at > now()) end as upcoming_event_count,
         cand.rules_required, cand.created_at,
         case when cand.visibility = 'public' then
           greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = cand.id)) end as last_activity_at,
         'none'::text as my_status,
         case when cand.overlap > 0 then 'category' else 'popular' end as reason
    from cand
    join public.conversations c on c.id = cand.id
   order by cand.score desc, cand.member_count desc, cand.created_at desc, cand.id
   limit greatest(least(coalesce(p_limit, 8), 20), 1);
$$;

-- ============================================================================
-- 6. EXECUTE yetkileri
-- ============================================================================

revoke execute on function public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean) from public, anon;
revoke execute on function public.set_chat_group_visibility(uuid, text) from public, anon;
revoke execute on function public.request_join_community(uuid, text, boolean) from public, anon;
revoke execute on function public.search_communities(text, text, integer, integer) from public, anon;
revoke execute on function public.suggest_communities(integer) from public, anon;
revoke execute on function public.list_my_communities(text, integer, integer) from public, anon;
grant execute on function public.create_community(text, text, text, text, integer, uuid[], text, text, text, text, boolean) to authenticated;
grant execute on function public.set_chat_group_visibility(uuid, text) to authenticated;
grant execute on function public.request_join_community(uuid, text, boolean) to authenticated;
grant execute on function public.search_communities(text, text, integer, integer) to authenticated;
grant execute on function public.suggest_communities(integer) to authenticated;
grant execute on function public.list_my_communities(text, integer, integer) to authenticated;
