-- Topluluklar — GİZLİLİK SIKILAŞTIRMASI (docs/history/177-*).
-- 176'daki üç görünürlük düzeyinin (public · restricted "Kapalı" · private "Tamamen kapalı") sunucu tarafında SIZINTISIZ uygulanması:
--
--   1) `chat_groups` satırını doğrudan OKUYABİLEN yalnızca ÜYELERDİR. Üye olmayanlar (kapalı topluluğun kartına bakanlar, davetliler,
--      başvuranlar, ziyaretçiler) yalnız `community_cards()` RPC'sinden KART alanlarını (ad, açıklama, görsel, kategori, üye sayısı, kurallar)
--      alır; `created_by`, `closed_by`, `pending_request_count`, `role_permissions`, `history_visible`, `members_can_pin` ve (açık değilse)
--      `post_count` gibi alanlar hiçbir üye olmayana verilmez.
--   2) Oturum açmamış ziyaretçi HERKESE AÇIK topluluğu okuyabilir (kart, gönderi, duyuru, etkinlik; keşif ve arama); kapalı/tamamen kapalı
--      topluluğun içeriği ziyaretçiye de kapalıdır. Yazma/katılma/sohbet/üye listesi hâlâ oturum ister.
--   3) Topluluk görselleri özel bir bucket'a (`community-avatars`) taşınır: dosya yalnız KART görülebildiği sürece okunur. Eski ortak
--      `avatars` bucket'ı listelenebilir olduğundan gizli topluluk görselini sızdırabilirdi.
--   4) Üyelikten ayrılan/çıkarılan kişinin eski bildirimleri (topluluk adını taşıyan) silinir; silinen topluluğun bildirimleri de.
--
-- Yalnızca ekleyici/değiştirici: hiçbir tablo/veri düşürülmez; eski migration'lara dokunulmaz. `create or replace` olanlar aynı imzayla.
-- Uygulama sırası: 20260920040000…070000 → bu dosya → istemci kodu (yeni istemci `community_cards`'ı çağırır ve üye olmayanlar için
-- `chat_groups`'u okumaz; eski istemci üye olmayanlar için topluluk sayfasını "bulunamadı" gösterir).

-- ============================================================================
-- 1. Kart görünürlüğü ve kart RPC'si
-- ============================================================================

-- Çağıran topluluğun KARTINI görebilir mi: üye · (herkese açık ya da kapalı, yasaklı değil, sahibi engellemiş değil) · bekleyen davetli ·
-- bekleyen başvuran. Tamamen kapalı topluluk yalnız üyeye/davetliye/başvurana görünür. Ziyaretçi (auth.uid() boş) yalnız açık/kapalı kartı görür.
create or replace function public.can_see_community_card(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.chat_groups g
     where g.id = p_community_id
       and (
         (auth.uid() is not null and exists (
           select 1 from public.conversation_members m where m.conversation_id = g.id and m.user_id = auth.uid()
         ))
         or (
           g.visibility in ('public', 'restricted')
           and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
           and not exists (
             select 1 from public.conversation_members o
              where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
           )
         )
         or exists (
           select 1 from public.chat_group_invitations i
            where i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
         )
         or exists (
           select 1 from public.chat_group_join_requests r
            where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
         )
       )
  );
$$;

-- Topluluk kartları (en çok 50 kimlik). Görülemeyen / olmayan kimlik sonuçta YOKTUR (aynı yanıt: varlığı sızmaz).
-- İçerik sayacı (`post_count`) yalnız herkese açık topluluk ya da üye için verilir; yönetim alanları hiçbir zaman verilmez.
create or replace function public.community_cards(p_ids uuid[])
returns table (
  id uuid, name text, description text, avatar_url text, category text, visibility text, member_count integer, member_limit integer,
  rules text, rules_required boolean, rules_version integer, closed_at timestamptz, origin text, post_count integer, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, g.avatar_url, g.category, g.visibility, g.member_count, g.member_limit,
         g.rules, g.rules_required, g.rules_version, g.closed_at, g.origin,
         case when g.visibility = 'public' or exists (
           select 1 from public.conversation_members m where m.conversation_id = g.id and m.user_id = auth.uid()
         ) then g.post_count end as post_count,
         g.created_at
    from public.chat_groups g
   where g.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:50])
     and public.can_see_community_card(g.id);
$$;

-- ============================================================================
-- 2. `chat_groups` satırı yalnız üyelere (doğrudan sorgu/REST/Realtime)
-- ============================================================================

alter policy "Public groups and groups I belong to are readable" on public.chat_groups
  using (public.is_conversation_member(id));
alter policy "Public groups and groups I belong to are readable" on public.chat_groups
  rename to "Members read their community row";

-- ============================================================================
-- 3. Ziyaretçi (anon): herkese açık topluluk içeriğini okuyabilir
-- ============================================================================

-- Okuma yetkisi: herkese açık topluluk (yasaklı değilse; ziyaretçi için yasak yoktur) ya da üyelik. Kapalı ve tamamen kapalı topluluğun
-- gönderi/duyuru/etkinliği üyelik olmadan — ziyaretçiye de — okunamaz.
create or replace function public.can_read_community(p_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = p_community_id and m.user_id = auth.uid())
      or (
        exists (select 1 from public.chat_groups g where g.id = p_community_id and g.visibility = 'public')
        and not exists (select 1 from public.chat_group_bans b where b.group_id = p_community_id and b.user_id = auth.uid())
      );
$$;

alter policy "Readable communities expose their posts" on public.community_posts to anon, authenticated;
alter policy "Readable communities expose their announcements" on public.community_announcements to anon, authenticated;
alter policy "Readable communities expose their events" on public.community_events to anon, authenticated;
grant select on public.community_posts, public.community_announcements, public.community_events to anon;

-- ============================================================================
-- 4. Keşif ve arama ziyaretçiye de açık (yalnız herkese açık / kapalı kartlar; öneriler kişiseldir, oturum ister)
-- ============================================================================

create or replace function public.discover_communities(
  p_query text default null,
  p_sort text default 'popular',
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, avatar_url text, category text, member_count integer, member_limit integer,
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
  )
  select g.id, g.name, g.description, g.avatar_url, g.category, g.member_count, g.member_limit, g.post_count,
         (select count(*)::integer from public.community_events e
           where e.community_id = g.id and e.status = 'scheduled' and e.starts_at > now()) as upcoming_event_count,
         g.rules_required, g.created_at,
         greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id)) as last_activity_at,
         case
           when m.user_id is not null then 'member'
           when i.id is not null then 'invited'
           when r.id is not null then 'requested'
           else 'none'
         end as my_status
    from public.chat_groups g
    join public.conversations c on c.id = g.id
    cross join q
    left join public.conversation_members m on m.conversation_id = g.id and m.user_id = auth.uid()
    left join public.chat_group_invitations i
      on i.group_id = g.id and i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
    left join public.chat_group_join_requests r
      on r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'
   where g.visibility = 'public'
     and g.closed_at is null
     and (p_category is null or g.category = p_category)
     and not exists (select 1 from public.chat_group_bans b where b.group_id = g.id and b.user_id = auth.uid())
     and not exists (
       select 1 from public.conversation_members o
        where o.conversation_id = g.id and o.role = 'owner' and public.is_blocked(o.user_id, auth.uid())
     )
     and (
       q.term is null
       or g.name ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or g.description ilike '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by
     case when p_sort = 'newest' then extract(epoch from g.created_at) end desc nulls last,
     case when p_sort = 'active' then extract(epoch from greatest(c.last_message_at, (select max(p.created_at) from public.community_posts p where p.community_id = g.id))) end desc nulls last,
     g.member_count desc, g.created_at desc, g.id
   limit greatest(least(coalesce(p_limit, 20), 50), 1)
   offset greatest(least(coalesce(p_offset, 0), 2000), 0);
$$;

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
   where pat.term is not null
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

-- ============================================================================
-- 5. Topluluk görselleri: özel bucket, dosya yalnız kart görülebildiği sürece okunur
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Satırda saklanan URL `…/object/public/community-avatars/<kullanıcı>/<dosya>` biçiminde KALIR (kimlik); gösterirken signed URL'ye çevrilir
-- (`PROTECTED_MEDIA_BUCKETS`). Dosyayı gösteren topluluk satırı bulunur ve kartı çağıran için görülebilirse okunur.
create index if not exists chat_groups_community_avatar_path_idx
  on public.chat_groups ((substring(avatar_url from '/storage/v1/object/public/community-avatars/([^?#]+)')))
  where avatar_url is not null;

create or replace function public.can_read_community_avatar(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.chat_groups g
     where g.avatar_url is not null
       and substring(g.avatar_url from '/storage/v1/object/public/community-avatars/([^?#]+)') = p_object_name
       and public.can_see_community_card(g.id)
  );
$$;

create policy "Community avatars are readable while the card is"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'community-avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_read_community_avatar(name)
    )
  );

create policy "Users can upload community avatars into their own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own community avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Salt okunur denetim (yalnız site moderatörü): hâlâ eski ortak `avatars` bucket'ında görseli olan, açık olmayan topluluklar.
-- O dosyalar listelenebilir olduğundan sahibi görseli yeniden yüklemelidir; dosya taşıma bu migration'ın işi değildir.
create or replace function public.community_legacy_avatar_report()
returns table (community_id uuid, visibility text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'forbidden';
  end if;
  return query
    select g.id, g.visibility, g.avatar_url
      from public.chat_groups g
     where g.avatar_url is not null
       and g.avatar_url not like '%/community-avatars/%'
       and g.visibility <> 'public'
     order by g.created_at;
end;
$$;

-- Yetim Storage taraması yeni özel bucket'ı da bilsin: topluluk görseli silinince / yenisiyle değiştirilince eski dosya süpürülür,
-- hesap silinince kullanıcının görselleri kaldırılır (`delete-account` Edge Function bu fonksiyonun listesini kullanır). Gövde 172'deki
-- sürümle aynıdır; tek fark bucket listesine `community-avatars` eklenmesidir (referans: `chat_groups.avatar_url`, zaten listede).
create or replace function public.orphan_storage_objects(p_min_age interval default '01:00:00'::interval)
returns table(bucket_id text, name text, size bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = public, storage
as $$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select avatar_url from public.chat_groups where avatar_url is not null
    union all select reference_image_url from public.prompt_requests where reference_image_url is not null
    union all select a->>'path' from public.messages m, jsonb_array_elements(m.attachments) a
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media','community-avatars')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$$;

-- ============================================================================
-- 6. Üyelikten ayrılan / silinen topluluk: eski bildirimler temizlenir
-- ============================================================================

-- Bir üyenin satırı silinince (ayrıldı, çıkarıldı, yasaklandı, hesabı silindi) o topluluğa bağlanan ESKİ bildirimleri de silinir: bildirim
-- metni topluluk adını taşır ve bağlantısı artık erişilemeyen bir sayfayı gösterir. Aynı işlemde üretilen bildirimler (ör. "çıkarıldın")
-- korunur: `created_at` işlem başlangıcına eşittir. Birebir sohbetler etkilenmez (yalnız topluluk sohbetleri).
create or replace function public.purge_member_community_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.chat_groups g where g.id = old.conversation_id) then
    delete from public.notifications n
     where n.recipient_id = old.user_id
       and n.created_at < transaction_timestamp()
       and n.target_href like '%' || old.conversation_id::text || '%';
  end if;
  return old;
end;
$$;

create trigger conversation_members_purge_community_notifications
  after delete on public.conversation_members
  for each row execute function public.purge_member_community_notifications();

-- Topluluk silinince herkesin o topluluğa bağlı eski bildirimleri silinir (ad ve bağlantı artık anlamsız).
create or replace function public.purge_deleted_community_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications n
   where n.created_at < transaction_timestamp()
     and n.target_href like '%' || old.id::text || '%';
  return old;
end;
$$;

create trigger chat_groups_purge_community_notifications
  after delete on public.chat_groups
  for each row execute function public.purge_deleted_community_notifications();

-- ============================================================================
-- 7. EXECUTE yetkileri
-- ============================================================================

revoke execute on function public.can_see_community_card(uuid) from public;
revoke execute on function public.community_cards(uuid[]) from public;
revoke execute on function public.can_read_community(uuid) from public;
revoke execute on function public.discover_communities(text, text, text, integer, integer) from public;
revoke execute on function public.search_communities(text, text, integer, integer) from public;
revoke execute on function public.can_read_community_avatar(text) from public;
revoke execute on function public.community_legacy_avatar_report() from public, anon;
revoke execute on function public.purge_member_community_notifications() from public, anon, authenticated;
revoke execute on function public.purge_deleted_community_notifications() from public, anon, authenticated;

-- Ziyaretçiye açık olanlar: kart/okuma yardımcıları, kart RPC'si, keşif, arama (öneri, üye listesi, istatistik, katılma HİÇBİRİ değil).
grant execute on function public.can_see_community_card(uuid) to anon, authenticated;
grant execute on function public.community_cards(uuid[]) to anon, authenticated;
grant execute on function public.can_read_community(uuid) to anon, authenticated;
grant execute on function public.discover_communities(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.search_communities(text, text, integer, integer) to anon, authenticated;
grant execute on function public.can_read_community_avatar(text) to anon, authenticated;
grant execute on function public.community_legacy_avatar_report() to authenticated;
