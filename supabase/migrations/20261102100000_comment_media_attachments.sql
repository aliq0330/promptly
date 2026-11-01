-- Yorumlarda fotoğraf · GIF · içerik eki (docs/history/308-*) + mesajlarda GIF bildirim önizlemesi.
--
-- Yalnızca EKLER (expand): yeni sütunlar, yeni bucket, yeni tetikleyici; hiçbir şey silinmez/yeniden adlandırılmaz. Var olan yorumlar hiçbir
-- sütunu doldurmaz, davranışları değişmez. İstemci yeni sütunları `OPTIONAL_COLUMNS` ile seçer (migration gecikirse site açılır, yalnız ek görünmez).
--
--   1) `prompt_comments` sütunları
--        media_kind  'photo' | 'gif'           — yorumun en çok BİR görseli (fotoğraf ya da GIF)
--        media_ref   photo: `{yazar}/{uuid}.{uzantı}` (`comment-media` bucket yolu) · gif: GIPHY kimliği (dosya SAKLANMAZ, adres istemcide üretilir)
--        media_width / media_height            — yerleşim kayması olmasın diye
--        attach_type / attach_id               — yorumun en çok BİR içerik eki (prompt · request · workflow · preset · space); kopya değil başvuru
--      CHECK'ler biçimi sabitler (GIF kimliği yalnız `[A-Za-z0-9_-]`; fotoğraf yolu yalnız YAZARIN kendi klasörü).
--   2) `prompt_comments_extras_guard` (BEFORE INSERT/UPDATE): içerik eki yalnız `quote_target_ok` ile "alıntılanabilir" (yayında + herkese açık +
--      topluluğa ait değil; Space: herkese açık + arşivsiz + okunabilir) içeriğe yapılır. Düzenlemede yazar görseli/eki değiştirebilir ya da kaldırabilir:
--      YENİ ek aynı kuralla denetlenir, değişmeyen ek yeniden denetlenmez; ek değişince `edited_at` damgalanır.
--   3) `handle_comment_delete`: yanıtlı yorum yumuşak silinirken medya/ek de temizlenir (silinmiş yorumun fotoğrafı/eki görünmesin).
--   4) `comment-media` PRIVATE bucket: yükleme yalnız kendi klasörüne; okuma = yorumu OKUYABİLEN herkes (politika `prompt_comments` RLS'ine yaslanır,
--      yani yorum ne kadar görünürse fotoğraf da o kadar; ziyaretçi dahil). 5 MB, jpeg/png/webp/gif.
--   5) `orphan_storage_objects`: yorum fotoğrafları "kullanımda" sayılır; silinmiş yorumun dosyası süpürülür (hesap silme de bunu kullanır).
--   6) `notify_new_message`: yalnız GIF'ten oluşan mesajın bildirim önizlemesi "bir GIF gönderdi" (GIF mesajda `attachments[].path = 'giphy:<kimlik>'`).

-- ============================================================================
-- 1) Sütunlar + kısıtlar
-- ============================================================================
alter table public.prompt_comments
  add column if not exists media_kind text,
  add column if not exists media_ref text,
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists attach_type text,
  add column if not exists attach_id uuid;

-- NOT: CHECK kısıtı NULL sonucu GEÇİRİR; bu yüzden her dal "is not null" ile kesin doğru/yanlış verir (yarım satır sessizce geçmesin).
alter table public.prompt_comments
  add constraint prompt_comments_media_check check (
    (media_kind is null and media_ref is null and media_width is null and media_height is null)
    or (media_kind is not null and media_kind = 'gif' and media_ref is not null and media_ref ~ '^[A-Za-z0-9_-]{4,64}$')
    or (
      media_kind is not null and media_kind = 'photo'
      and media_ref is not null
      and media_ref ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
      and split_part(media_ref, '/', 1) = author_id::text
    )
  ),
  add constraint prompt_comments_media_size check (
    (media_width is null and media_height is null)
    or (media_width is not null and media_height is not null and media_width between 1 and 10000 and media_height between 1 and 10000)
  ),
  add constraint prompt_comments_attach_check check (
    (attach_type is null and attach_id is null)
    or (attach_type is not null and attach_id is not null and attach_type in ('prompt', 'request', 'workflow', 'preset', 'space'))
  );

-- Fotoğraf dosyasının hangi yoruma bağlı olduğu (Storage okuma politikası + yetim taraması bu dizini kullanır).
create index if not exists prompt_comments_media_ref_idx on public.prompt_comments (media_ref) where media_kind = 'photo';

-- ============================================================================
-- 2) Doğrulama tetikleyicisi
-- ============================================================================
create or replace function public.prompt_comments_extras_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.attach_type is not null and not public.quote_target_ok(new.attach_type, new.attach_id) then
      -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
      raise exception 'attachment_not_public';
    end if;
    return new;
  end if;
  -- UPDATE: yazar yorumunu düzenlerken görseli/eki değiştirebilir ya da kaldırabilir (RLS yalnız yazarın kendi satırını geçirir). Yeni ek INSERT'teki
  -- kuralla AYNI denetlenir; DEĞİŞMEYEN ek yeniden denetlenmez (içerik sonradan özel yapılmışsa yorum yine düzenlenebilir, kart zaten gizli görünür).
  -- Yorumun silinmesi (yumuşak silme) hepsini boşaltır ve "düzenlendi" damgası vurmaz.
  if new.deleted_at is null and (
       new.media_kind is distinct from old.media_kind
    or new.media_ref is distinct from old.media_ref
    or new.media_width is distinct from old.media_width
    or new.media_height is distinct from old.media_height
    or new.attach_type is distinct from old.attach_type
    or new.attach_id is distinct from old.attach_id
  ) then
    if new.attach_type is not null
       and (new.attach_type is distinct from old.attach_type or new.attach_id is distinct from old.attach_id)
       and not public.quote_target_ok(new.attach_type, new.attach_id) then
      raise exception 'attachment_not_public';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_comments_extras_guard on public.prompt_comments;
create trigger prompt_comments_extras_guard
  before insert or update on public.prompt_comments
  for each row execute function public.prompt_comments_extras_guard();

revoke all on function public.prompt_comments_extras_guard() from public, anon, authenticated;

-- ============================================================================
-- 3) Yumuşak silme medya/eki de temizler (gövde 20260926100000'dekiyle aynı; tek fark SET listesi)
-- ============================================================================
create or replace function public.handle_comment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.community_post_id is not null or old.space_id is not null or old.quote_id is not null) and pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.prompt_comments where parent_id = old.id) then
    update public.prompt_comments
      set deleted_at = now(),
          body = '',
          rating = null,
          media_kind = null,
          media_ref = null,
          media_width = null,
          media_height = null,
          attach_type = null,
          attach_id = null
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$$;

-- ============================================================================
-- 4) comment-media bucket
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-media', 'comment-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Okuma: yazarın kendi klasörü (yüklediği dosyayı yorumdan ÖNCE de görebilsin) ya da dosyaya bağlı bir yorumu OKUYABİLEN herkes.
-- Alt sorgu çağıranın RLS'iyle çalışır: yorumu göremeyen dosyayı da imzalayamaz.
create policy "Comment photos readable where their comment is readable"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'comment-media'
    and (
      (auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
      or exists (
        select 1 from public.prompt_comments c
        where c.media_kind = 'photo' and c.media_ref = name
      )
    )
  );

create policy "Users upload comment photos into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'comment-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
  );

create policy "Users delete their own comment photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'comment-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 5) Yetim taraması: gövde 20260921130000'dekiyle aynı; ek: yorum fotoğrafları + comment-media bucket'ı
-- ============================================================================
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
    union all select media_url from public.stories where media_url is not null
    union all select media_url from public.story_drafts where media_url is not null
    union all select media_url from public.space_items where media_url like '%/space-media/%'
    union all select cover_url from public.spaces where cover_url is not null
    union all select media_ref from public.prompt_comments where media_kind = 'photo'
  )
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
  from storage.objects o
  where o.bucket_id in ('avatars','message-images','prompt-media','request-references','result-media','community-avatars','story-media','space-media','comment-media')
    and o.created_at < now() - p_min_age
    and not exists (select 1 from refs r where r.u is not null and position(o.name in r.u) > 0);
$function$;

-- ============================================================================
-- 6) Mesajda yalnız GIF: bildirim önizlemesi (gövde 20261004100000'dakiyle aynı; tek fark önizleme dalı)
-- ============================================================================
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_preview text;
begin
  if public.is_group_conversation(new.conversation_id) then
    return new;
  end if;

  v_preview := case
    when new.body is not null then '"' || public.truncate_preview(new.body) || '"'
    when new.shared_prompt_id is not null then 'bir prompt paylaştı'
    when new.shared_request_id is not null then 'bir prompt isteği paylaştı'
    when jsonb_array_length(new.attachments) > 0
         and not exists (select 1 from jsonb_array_elements(new.attachments) a where coalesce(a->>'path', '') not like 'giphy:%')
      then 'bir GIF gönderdi'
    when jsonb_array_length(new.attachments) > 0 then 'bir fotoğraf gönderdi'
    else 'bir mesaj gönderdi'
  end;

  for v_recipient in
    select user_id, status from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id and muted_at is null
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id,
      new.sender_id,
      case when v_recipient.status = 'pending' then 'message_request' else 'message' end,
      case
        when new.is_story_reply then 'Hikâyene yanıt verdi: ' || v_preview
        when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi: ' || v_preview
        else 'Sana bir mesaj gönderdi: ' || v_preview
      end,
      '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id
    );
  end loop;

  return new;
end;
$$;
revoke all on function public.notify_new_message() from public, anon, authenticated;
