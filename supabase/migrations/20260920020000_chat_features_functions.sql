-- Sohbet geliştirmeleri — RPC'LER ve yazıyor kanalı yetkisi (docs/history/174-*). Şema: 20260920010000_chat_features_schema.sql.
-- Ortak kurallar: kimlik DAİMA auth.uid(); SECURITY DEFINER fonksiyonlarda `search_path` sabit, EXECUTE yalnız `authenticated`;
-- okuma RPC'leri (arama, yıldız listesi) SECURITY INVOKER'dır → messages RLS'i (üyelik, grupta katılma zamanı, engel) aynen uygulanır.

-- ============================================================================
-- 1. Okundu imleci
-- ============================================================================

-- Çağıranın okuma imlecini `p_up_to`'ya (istemcinin EKRANDA GÖSTERDİĞİ en yeni mesajın created_at'i) ilerletir; imleç geri gitmez,
-- konuşmadaki en yeni mesajın ötesine geçmez, ilerlemeyen çağrı satıra yazmaz. Okunmamış sayacı imlece göre yeniden hesaplanır
-- (kendi mesajların sayılmaz). Dönüş: yeni imleç (konuşmada hiç mesaj yoksa null).
create or replace function public.mark_conversation_read_up_to(p_conversation_id uuid, p_up_to timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.conversation_members;
  v_kind text;
  v_max timestamptz;
  v_cursor timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_up_to is null then
    raise exception 'invalid_cursor';
  end if;
  select * into v_member from public.conversation_members where conversation_id = p_conversation_id and user_id = v_uid;
  if not found then
    raise exception 'not_a_member';
  end if;
  select kind into v_kind from public.conversations where id = p_conversation_id;

  select max(created_at) into v_max from public.messages where conversation_id = p_conversation_id;
  if v_max is null then
    return null;
  end if;
  v_cursor := least(p_up_to, v_max);
  if v_member.last_read_at is not null and v_cursor < v_member.last_read_at then
    v_cursor := v_member.last_read_at;
  end if;

  select count(*) into v_count
    from public.messages m
   where m.conversation_id = p_conversation_id
     and m.created_at > v_cursor
     and m.sender_id <> v_uid
     and m.deleted_at is null
     and (v_kind = 'direct' or m.created_at >= v_member.joined_at);

  update public.conversation_members
     set last_read_at = v_cursor,
         last_read_updated_at = case when last_read_at is distinct from v_cursor then now() else last_read_updated_at end,
         unread_count = v_count
   where conversation_id = p_conversation_id and user_id = v_uid
     and (last_read_at is distinct from v_cursor or unread_count <> v_count);
  return v_cursor;
end;
$$;

-- Eski imza: YALNIZ okunmamış sayacını sıfırlar; okundu imlecini İLERLETMEZ. Bu yol "mesajları temizle" / "sohbeti sil" ile (ve eski
-- istemcilerce) çağrılır: kullanıcı mesajları görmeden kapattığında karşı tarafa "okundu" bilgisi sızmasın. Gerçek okuma
-- `mark_conversation_read_up_to` ile, yalnız mesajlar ekranda gösterilirken bildirilir.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members set unread_count = 0
   where conversation_id = p_conversation_id and user_id = auth.uid() and unread_count <> 0;
$$;

-- Mesaj ayrıntısı (okundu bilgisi): YALNIZ mesajın göndericisi ve hâlâ üye olan kişi görür. Gönderen listede yok; mesajı görme hakkı
-- olmayan üyeler (grupta katılmadan önceki mesaj, geçmiş kapalıyken) "okumadı" diye sayılmaz, listelenmez. Ayrılan/çıkarılan üyenin
-- imleci üyelik satırıyla birlikte gittiği için görünmez.
create or replace function public.message_read_receipts(p_message_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, has_read boolean, read_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.messages;
  v_kind text;
  v_history boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into m from public.messages where id = p_message_id;
  if not found or m.deleted_at is not null then
    raise exception 'message_not_found';
  end if;
  if m.sender_id <> v_uid or not exists (
    select 1 from public.conversation_members x where x.conversation_id = m.conversation_id and x.user_id = v_uid
  ) then
    raise exception 'forbidden';
  end if;
  select c.kind into v_kind from public.conversations c where c.id = m.conversation_id;
  if v_kind = 'group' then
    select coalesce(g.history_visible, false) into v_history from public.chat_groups g where g.id = m.conversation_id;
  end if;

  return query
  select cm.user_id, p.username, p.display_name, p.avatar_url,
         (cm.last_read_at is not null and cm.last_read_at >= m.created_at),
         case when cm.last_read_at is not null and cm.last_read_at >= m.created_at then cm.last_read_updated_at end
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
   where cm.conversation_id = m.conversation_id
     and cm.user_id <> v_uid
     and (v_kind = 'direct' or v_history or m.created_at >= cm.joined_at)
   order by (cm.last_read_at is not null and cm.last_read_at >= m.created_at) desc, cm.last_read_updated_at desc nulls last, p.display_name
   limit 1000;
end;
$$;

-- ============================================================================
-- 2. Mesaj sabitleme
-- ============================================================================

-- Birebir: iki taraf da (engel yoksa). Grup: `pin_messages` yeteneği olan roller (varsayılan admin + moderatör; owner her zaman) ya da,
-- owner ayarı `members_can_pin` açıksa her üye. Sabitleme mesajı DEĞİŞTİRMEZ (yalnız pinned_messages satırı). En çok 20 sabit/konuşma.
-- İdempotent: zaten sabitliyse/sabit değilse hata vermez. Grupta denetim kaydı düşer.
create or replace function public.set_message_pinned(p_message_id uuid, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._group_actor();
  m public.messages;
  v_kind text;
  g public.chat_groups;
  v_role text;
  v_other uuid;
begin
  select * into m from public.messages where id = p_message_id;
  if not found or m.deleted_at is not null then
    raise exception 'message_not_found';
  end if;
  -- Okuma hakkı (üyelik + grupta geçmiş/engel kuralı) yoksa mesajın varlığı bile sızmaz.
  if not public.can_read_message(m.conversation_id, m.sender_id, m.created_at) then
    raise exception 'message_not_found';
  end if;
  select kind into v_kind from public.conversations where id = m.conversation_id;

  if v_kind = 'group' then
    g := public._group_lock(m.conversation_id);
    v_role := public._group_member_role(m.conversation_id, v_uid);
    if not (public._group_can(m.conversation_id, v_uid, 'pin_messages') or (v_role = 'member' and g.members_can_pin)) then
      raise exception 'forbidden';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('pin:' || m.conversation_id::text, 0));
    select user_id into v_other from public.conversation_members where conversation_id = m.conversation_id and user_id <> v_uid limit 1;
    if v_other is null or public.is_blocked(v_uid, v_other) then
      raise exception 'forbidden';
    end if;
  end if;

  if p_pinned then
    if exists (select 1 from public.pinned_messages where message_id = p_message_id) then
      return jsonb_build_object('pinned', true);
    end if;
    if (select count(*) from public.pinned_messages where conversation_id = m.conversation_id) >= 20 then
      raise exception 'pin_limit_reached';
    end if;
    insert into public.pinned_messages (message_id, conversation_id, pinned_by) values (p_message_id, m.conversation_id, v_uid);
  else
    delete from public.pinned_messages where message_id = p_message_id;
  end if;

  if v_kind = 'group' then
    perform public._group_audit(m.conversation_id, g.name, v_uid, m.sender_id,
      case when p_pinned then 'message_pinned' else 'message_unpinned' end, jsonb_build_object('message_id', p_message_id));
  end if;
  return jsonb_build_object('pinned', p_pinned);
end;
$$;

-- ============================================================================
-- 3. Sohbet içi arama (SECURITY INVOKER: messages RLS'i aynen geçerli)
-- ============================================================================
-- Yalnız çağıranın görebildiği mesajlar: üyelik, grupta katılma zamanı/geçmiş ayarı, engel, kişisel "temizle" ve "benden sil".
-- Girdi 2–100 karakter, LIKE joker karakterleri kaçışlanır. Keyset sayfalama (created_at, id) azalan; en çok 50/sayfa.
create or replace function public.search_conversation_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz)
language plpgsql
stable
set search_path = public
as $$
declare
  v_term text := btrim(coalesce(p_query, ''));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_term) < 2 or char_length(v_term) > 100 then
    raise exception 'invalid_query';
  end if;
  v_term := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select m.id, m.sender_id, m.body, m.created_at
    from public.messages m
    join public.conversation_members me on me.conversation_id = m.conversation_id and me.user_id = auth.uid()
   where m.conversation_id = p_conversation_id
     and m.deleted_at is null
     and m.body is not null
     and m.body ilike '%' || v_term || '%'
     and (me.cleared_at is null or m.created_at > me.cleared_at)
     and not exists (select 1 from public.message_hidden_for h where h.message_id = m.id and h.user_id = auth.uid())
     and (
       p_before_created_at is null
       or m.created_at < p_before_created_at
       or (m.created_at = p_before_created_at and m.id < coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     )
   order by m.created_at desc, m.id desc
   limit greatest(least(coalesce(p_limit, 20), 50), 1);
end;
$$;

-- ============================================================================
-- 4. Yıldızlı mesajlar listesi (birebir + grup tek listede; SECURITY INVOKER)
-- ============================================================================
-- Yalnız ÇAĞIRANIN yıldızları ve yalnız mesajı HÂLÂ okuyabildiği satırlar (gruptan ayrılan özel grup mesajını görmez); silinmiş,
-- "benden sil" yapılmış ve kişisel "temizle"den önceki mesajlar listelenmez. Keyset: (starred_at, message_id) azalan.
create or replace function public.list_starred_messages(
  p_limit integer default 30,
  p_before_starred_at timestamptz default null,
  p_before_message_id uuid default null
)
returns table (
  starred_at timestamptz, message_id uuid, conversation_id uuid, sender_id uuid, body text,
  has_attachments boolean, has_shared boolean, created_at timestamptz,
  kind text, group_name text, group_avatar_url text, partner_id uuid
)
language sql
stable
set search_path = public
as $$
  select s.created_at, m.id, m.conversation_id, m.sender_id, m.body,
         jsonb_array_length(m.attachments) > 0,
         (m.shared_prompt_id is not null or m.shared_request_id is not null),
         m.created_at, c.kind, g.name, g.avatar_url,
         case when c.kind = 'direct' then (
           select o.user_id from public.conversation_members o where o.conversation_id = c.id and o.user_id <> auth.uid() limit 1
         ) end
    from public.message_stars s
    join public.messages m on m.id = s.message_id
    join public.conversations c on c.id = m.conversation_id
    join public.conversation_members me on me.conversation_id = m.conversation_id and me.user_id = auth.uid()
    left join public.chat_groups g on g.id = c.id
   where auth.uid() is not null
     and s.user_id = auth.uid()
     and m.deleted_at is null
     and (me.cleared_at is null or m.created_at > me.cleared_at)
     and not exists (select 1 from public.message_hidden_for h where h.message_id = m.id and h.user_id = auth.uid())
     and (
       p_before_starred_at is null
       or s.created_at < p_before_starred_at
       or (s.created_at = p_before_starred_at and m.id < coalesce(p_before_message_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     )
   order by s.created_at desc, m.id desc
   limit greatest(least(coalesce(p_limit, 30), 100), 1);
$$;

-- ============================================================================
-- 5. "Yazıyor" kanalı yetkisi (Supabase Realtime Authorization — geçici Broadcast, veritabanına YAZILMAZ)
-- ============================================================================
-- Konu adı `typing:<konuşma uuid>`; yalnız o konuşmanın ÜYELERİ dinleyebilir/yayınlayabilir (üyelik abonelik anında denetlenir; grupta
-- çıkarılan üye bir sonraki bağlanışta kanala giremez). İstemci kanala `private: true` ile bağlanır. Dashboard'da Realtime ayarlarında
-- "Allow public access" KAPALI olmalıdır, aksi hâlde yetkisiz public kanal da açılabilir (docs/history/174-*).
create or replace function public.can_use_typing_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_topic ~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_conversation_member(substring(p_topic from 8)::uuid)
    else false
  end;
$$;

revoke execute on function public.mark_conversation_read_up_to(uuid, timestamptz) from public, anon;
revoke execute on function public.message_read_receipts(uuid) from public, anon;
revoke execute on function public.set_message_pinned(uuid, boolean) from public, anon;
revoke execute on function public.search_conversation_messages(uuid, text, integer, timestamptz, uuid) from public, anon;
revoke execute on function public.list_starred_messages(integer, timestamptz, uuid) from public, anon;
revoke execute on function public.can_use_typing_topic(text) from public, anon;
grant execute on function public.mark_conversation_read_up_to(uuid, timestamptz) to authenticated;
grant execute on function public.message_read_receipts(uuid) to authenticated;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;
grant execute on function public.search_conversation_messages(uuid, text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.list_starred_messages(integer, timestamptz, uuid) to authenticated;
grant execute on function public.can_use_typing_topic(text) to authenticated;

-- Realtime Authorization politikaları: `realtime.messages` yoksa (yerel test veritabanı) ya da oluşturulamazsa atlanır — politika
-- yoksa private kanallar HERKESE kapalıdır (güvenli taraf: yazıyor göstergesi çalışmaz, ama sızıntı olmaz).
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    begin
      execute $p$create policy "Conversation members can receive typing broadcasts" on realtime.messages
        for select to authenticated
        using (realtime.messages.extension = 'broadcast' and public.can_use_typing_topic((select realtime.topic())))$p$;
      execute $p$create policy "Conversation members can send typing broadcasts" on realtime.messages
        for insert to authenticated
        with check (realtime.messages.extension = 'broadcast' and public.can_use_typing_topic((select realtime.topic())))$p$;
    exception when others then
      raise warning 'realtime.messages politikaları oluşturulamadı (%); yazıyor kanalı için elle oluşturun', sqlerrm;
    end;
  else
    raise notice 'realtime.messages bulunamadı: yazıyor kanalı politikaları atlandı';
  end if;
end $$;
