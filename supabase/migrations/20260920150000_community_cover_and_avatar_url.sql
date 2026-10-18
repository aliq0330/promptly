-- Topluluk kapağı (fotoğraf / renk / otomatik) + topluluk görseli yükleme hatasının düzeltmesi (docs/history/191-*).
--
-- 1) HATA: `_group_valid_avatar` yalnız eski `avatars` bucket'ının adresini kabul ediyordu; 177'den beri topluluk görseli özel
--    `community-avatars` bucket'ına yükleniyor ve istemci o adresi gönderiyor → `create_community` / `update_chat_group`
--    "invalid_avatar" ile reddediyordu (görsel dosyası yükleniyor ama topluluk kaydedilmiyordu). Doğrulayıcı artık iki bucket'ı kabul eder.
-- 2) KAPAK: `chat_groups.cover_url` (fotoğraf, `community-avatars` bucket'ında) ve `cover_color` (#rrggbb). Öncelik: fotoğraf > renk >
--    otomatik (ikisi de boşsa istemci topluluk görselinden türetir). Yazma yalnız `update_chat_group` (yetenek: `edit_settings`).
-- 3) Kapak dosyası, topluluk görseli gibi, yalnız topluluğun KARTI görülebildiği sürece okunur (Storage politikası kapağı da bilir);
--    yetim temizliği kapak dosyasını "kullanımda" sayar (aksi hâlde süpürülürdü).
-- 4) Üye olmayanın kapağı: `community_cards` dönüş tipi değişmesin (drop gerektirir) diye ayrı, ekleyici `community_card_covers` RPC'si.
--
-- Yalnızca ekleyici/değiştirici: tablo/veri düşürülmez; `create or replace` olanlar AYNI imzayla. Uygulama sırası: bu dosya → istemci kodu.

-- ============================================================================
-- 1. Görsel adresi doğrulayıcıları
-- ============================================================================

create or replace function public._group_valid_avatar(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is null or (
    char_length(p_url) <= 500
    and p_url ~ '^https://[^/]+/storage/v1/object/public/(avatars|community-avatars)/[A-Za-z0-9._~%/-]+$'
  );
$$;

-- Kapak fotoğrafı yalnız özel `community-avatars` bucket'ından olabilir.
create or replace function public._group_valid_cover(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is null or (
    char_length(p_url) <= 500
    and p_url ~ '^https://[^/]+/storage/v1/object/public/community-avatars/[A-Za-z0-9._~%/-]+$'
  );
$$;

revoke execute on function public._group_valid_cover(text) from public, anon, authenticated;

-- ============================================================================
-- 2. Sütunlar
-- ============================================================================

alter table public.chat_groups add column if not exists cover_url text;
alter table public.chat_groups add column if not exists cover_color text;

alter table public.chat_groups drop constraint if exists chat_groups_cover_color_check;
alter table public.chat_groups
  add constraint chat_groups_cover_color_check check (cover_color is null or cover_color ~ '^#[0-9a-f]{6}$');

alter table public.chat_groups drop constraint if exists chat_groups_cover_url_check;
alter table public.chat_groups
  add constraint chat_groups_cover_url_check check (
    cover_url is null or (
      char_length(cover_url) <= 500
      and cover_url ~ '^https://[^/]+/storage/v1/object/public/community-avatars/[A-Za-z0-9._~%/-]+$'
    )
  );

create index if not exists chat_groups_community_cover_path_idx
  on public.chat_groups ((substring(cover_url from '/storage/v1/object/public/community-avatars/([^?#]+)')))
  where cover_url is not null;

-- ============================================================================
-- 3. update_chat_group: kapak alanları (gövde canlıdaki sürümle aynı; tek fark cover_url / cover_color)
-- ============================================================================

create or replace function public.update_chat_group(p_group_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_name text;
  v_description text;
  v_avatar text;
  v_cover_url text;
  v_cover_color text;
  v_limit integer;
  v_policy text;
  v_changed text[] := '{}';
  v_audit uuid;
  v_member record;
begin
  g := public._group_lock(p_group_id);
  perform public._group_require_cap(p_group_id, v_actor, 'edit_settings');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;

  v_name := g.name; v_description := g.description; v_avatar := g.avatar_url; v_limit := g.member_limit; v_policy := g.posting_policy;
  v_cover_url := g.cover_url; v_cover_color := g.cover_color;

  if p_patch ? 'name' then
    v_name := btrim(coalesce(p_patch ->> 'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'invalid_name'; end if;
    if v_name <> g.name then v_changed := array_append(v_changed, 'name'); end if;
  end if;
  if p_patch ? 'description' then
    v_description := nullif(btrim(coalesce(p_patch ->> 'description', '')), '');
    if v_description is not null and char_length(v_description) > 500 then raise exception 'invalid_description'; end if;
    if v_description is distinct from g.description then v_changed := array_append(v_changed, 'description'); end if;
  end if;
  if p_patch ? 'avatar_url' then
    v_avatar := nullif(p_patch ->> 'avatar_url', '');
    if not public._group_valid_avatar(v_avatar) then raise exception 'invalid_avatar'; end if;
    if v_avatar is distinct from g.avatar_url then v_changed := array_append(v_changed, 'avatar_url'); end if;
  end if;
  if p_patch ? 'cover_url' then
    v_cover_url := nullif(p_patch ->> 'cover_url', '');
    if not public._group_valid_cover(v_cover_url) then raise exception 'invalid_cover'; end if;
    if v_cover_url is distinct from g.cover_url then v_changed := array_append(v_changed, 'cover_url'); end if;
  end if;
  if p_patch ? 'cover_color' then
    v_cover_color := lower(nullif(p_patch ->> 'cover_color', ''));
    if v_cover_color is not null and v_cover_color !~ '^#[0-9a-f]{6}$' then raise exception 'invalid_cover'; end if;
    if v_cover_color is distinct from g.cover_color then v_changed := array_append(v_changed, 'cover_color'); end if;
  end if;
  if p_patch ? 'member_limit' then
    if jsonb_typeof(p_patch -> 'member_limit') <> 'number' then raise exception 'invalid_member_limit'; end if;
    v_limit := (p_patch ->> 'member_limit')::integer;
    if v_limit < 2 or v_limit > 1000 then raise exception 'invalid_member_limit'; end if;
    if v_limit < g.member_count then raise exception 'member_limit_below_count'; end if;
    if v_limit <> g.member_limit then v_changed := array_append(v_changed, 'member_limit'); end if;
  end if;
  if p_patch ? 'posting_policy' then
    v_policy := p_patch ->> 'posting_policy';
    if v_policy not in ('members', 'admins') then raise exception 'invalid_posting_policy'; end if;
    if v_policy <> g.posting_policy then v_changed := array_append(v_changed, 'posting_policy'); end if;
  end if;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('changed', false);
  end if;

  update public.chat_groups
     set name = v_name, description = v_description, avatar_url = v_avatar, member_limit = v_limit, posting_policy = v_policy,
         cover_url = v_cover_url, cover_color = v_cover_color
   where id = p_group_id;

  v_audit := public._group_audit(p_group_id, v_name, v_actor, null, 'settings_updated', jsonb_build_object('changed', to_jsonb(v_changed)));

  -- Önemli ayar: kim yazabilir. Sessize alınmamış üyelere haber verilir (ad/açıklama/görsel/kapak değişikliği bildirim üretmez).
  if 'posting_policy' = any (v_changed) then
    for v_member in select user_id from public.conversation_members where conversation_id = p_group_id and user_id <> v_actor loop
      perform public._group_notify(
        v_member.user_id, v_actor, p_group_id,
        case when v_policy = 'admins'
          then '"' || public.truncate_preview(v_name, 60) || '" grubunda artık yalnızca yöneticiler mesaj gönderebilir.'
          else '"' || public.truncate_preview(v_name, 60) || '" grubunda artık tüm üyeler mesaj gönderebilir.' end,
        '/messages/local?id=' || p_group_id,
        'grpevt:' || v_audit || ':' || v_member.user_id,
        true
      );
    end loop;
  end if;

  return jsonb_build_object('changed', true, 'changed_fields', to_jsonb(v_changed));
end;
$function$;

-- ============================================================================
-- 4. Depolama: kapak dosyası da kart görülebildiği sürece okunur
-- ============================================================================

create or replace function public.can_read_community_avatar(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.chat_groups g
     where (
             (g.avatar_url is not null
              and substring(g.avatar_url from '/storage/v1/object/public/community-avatars/([^?#]+)') = p_object_name)
          or (g.cover_url is not null
              and substring(g.cover_url from '/storage/v1/object/public/community-avatars/([^?#]+)') = p_object_name)
           )
       and public.can_see_community_card(g.id)
  );
$$;

-- Yetim taraması: kapak dosyası "kullanımda" sayılır. Gövde canlıdaki sürümle aynı; tek fark `cover_url` satırı.
create or replace function public.orphan_storage_objects(p_min_age interval default '01:00:00'::interval)
returns table(bucket_id text, name text, size bigint, created_at timestamp with time zone)
language sql
stable
security definer
set search_path to 'public', 'storage'
as $function$
  with refs as (
    select url as u from public.prompt_media
    union all select url from public.prompt_request_media
    union all select url from public.workflow_media
    union all select media_url from public.prompt_results where media_url is not null
    union all select thumbnail_url from public.prompt_results where thumbnail_url is not null
    union all select avatar_url from public.profiles where avatar_url is not null
    union all select avatar_url from public.chat_groups where avatar_url is not null
    union all select cover_url from public.chat_groups where cover_url is not null
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
$function$;

-- ============================================================================
-- 5. Üye olmayanın göreceği kapak (kart RPC'sinin dönüş tipi değişmesin diye ayrı)
-- ============================================================================

create or replace function public.community_card_covers(p_ids uuid[])
returns table (id uuid, cover_url text, cover_color text)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.cover_url, g.cover_color
    from public.chat_groups g
   where g.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:50])
     and public.can_see_community_card(g.id);
$$;

-- `community_cards` ile aynı yetki: ziyaretçi de (yalnız kartı görülebilen topluluk için) okur.
revoke execute on function public.community_card_covers(uuid[]) from public;
grant execute on function public.community_card_covers(uuid[]) to anon, authenticated;
