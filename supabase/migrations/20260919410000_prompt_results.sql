-- Promptly — Kullanıcı Sonuçları / Prompt Çıktıları sistemi.
--
-- === AŞAMA 0 denetimi (bu migration'ı yazmadan önce yapıldı) ================
-- Bu KESİNLİKLE bir remix/fork sistemi DEĞİL — bir "sonuç", kendi başına bir
-- `prompts` satırı DEĞİL, orijinal promptun altına asılan gerçek bir üretim
-- kanıtı (görsel/video/ses/metin). Bu yüzden `prompts`/`origin_type`'a hiç
-- dokunulmadı, yeni bir "sonuç promptu" hiç oluşturulmuyor.
--
-- Mevcut, yeniden kullanılan sistemler (yeni paralel sistem KURULMADI):
--   - `prompt_likes` (Bölüm 9.34/9.35/9.37) zaten polimorfik — nullable
--     `prompt_id`/`generator_id`/`request_id` + "tam olarak bir hedef" CHECK
--     + `handle_prompt_like_change()` cross-user sayaç trigger'ı. Burada
--     dördüncü, nullable bir `result_id` eklenerek BİREBİR AYNI desen
--     genişletildi — RLS politikaları (`auth.uid() = user_id`, hiçbir hedef
--     sütununa referans vermiyor) hiç değişmedi.
--   - `prompt_comments` (Bölüm 9.2/9.34/9.36/9.38) aynı şekilde polimorfik —
--     aynı desenle dördüncü bir `result_id` eklendi.
--   - `prompts.tool` / `prompt_requests.preferred_tool` zaten serbest metin
--     bir alan — sabit bir "tool" taksonomi tablosu hiç yok. Görevin kendi
--     "mevcut bir araç/model sistemi varsa onu kullan" kuralına uyarak
--     `prompt_results.tool` da AYNI şekilde serbest metin (yeni bir
--     taksonomi tablosu İCAT EDİLMEDİ) — istemci tarafında yalnızca bir
--     `<datalist>` önerisi (Bölüm 9.23'ün etiket sisteminin zaten kullandığı
--     "öner + serbest yaz" deseni) gösteriyor.
--   - `notifications` (Bölüm 19/9.6/9.12) yeniden kullanıldı — yalnızca
--     1 yeni `type` değeri (`prompt_result_shared`) ve `notify_comment_
--     reply`/`notify_comment_like`'a üçüncü değil DÖRDÜNCÜ bir hedef kolu
--     eklendi (generator_id zaten kendi ayrı fonksiyonuna yönlendiriliyordu,
--     bu görev onu hiç değiştirmedi).
--   - Storage: `prompt-media` bucket'ı yalnızca görsel mime tipleri kabul
--     ediyor ve promptların KENDİ görseli için ayrılmış — video/ses için
--     hiç uygun değil. Bu yüzden YENİ, dar kapsamlı bir `result-media`
--     bucket'ı eklendi (aynı "klasör = kullanıcı" per-path sahiplik deseni,
--     Bölüm 20).
--
-- === Bilinçli kapsam kararları (dürüstçe belirtiliyor) ======================
--   - `media_type` şemada `'other'` değerini taşıyor (ileride genişlemeye
--     açık olsun diye), ama bu görevin UI'ı onu hiç ÜRETMİYOR — kabul
--     kriterleri (§26) yalnızca image/video/audio/text'i zorunlu kılıyor.
--     Bir dosyanın mime tipi image/video/audio değilse yükleme reddediliyor
--     (storage bucket'ının kendi `allowed_mime_types`'ı zaten bunu
--     TEKNİK OLARAK da zorunlu kılıyor — keyfi dosya türlerini herkese açık
--     bir bucket'a kabul etmek §23'ün güvenlik kuralına aykırı olurdu).
--   - Ses sonuçları için gerçek bir waveform HESAPLANMIYOR (bu, ciddi bir
--     ses işleme kütüphanesi gerektirir, bu projenin "harici bağımlılık
--     yok" ilkesine aykırı olurdu) — bunun yerine bu projenin zaten
--     kullandığı deterministik, offline "bokeh" SVG placeholder'ı
--     (`placeholderArt`) kapak olarak kullanılıyor, dürüstçe bir gerçek
--     waveform gibi SUNULMUYOR.

-- === prompt_results ===========================================================
create table public.prompt_results (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'audio', 'text', 'other')),
  media_url text,
  thumbnail_url text,
  -- Only ever set for `media_type = 'image'` — the detail viewer's real,
  -- non-distorted aspect ratio (`prompt_media` already tracks the same pair
  -- for a prompt's own image, same reasoning). A `<video>`/`<audio>`
  -- element sizes itself from its own natural dimensions at render time, so
  -- video/audio results never need this.
  width integer,
  height integer,
  text_content text,
  tool text,
  has_modification boolean not null default false,
  modification_summary text,
  modified_prompt_text text,
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default now(),
  -- image/video/audio: gerçek bir dosya + gerçek bir thumbnail'ı olmalı,
  -- hiç metin taşımamalı. text/other: yalnızca metin taşımalı, hiç medya
  -- dosyası/thumbnail'ı olmamalı. `prompts_origin_shape`/`messages_has_
  -- content` ile aynı "şekli veritabanı seviyesinde doğrula" ilkesi.
  constraint prompt_results_media_shape check (
    (media_type in ('image', 'video', 'audio') and media_url is not null and thumbnail_url is not null and text_content is null)
    or (media_type in ('text', 'other') and text_content is not null and media_url is null and thumbnail_url is null)
  ),
  -- §4: değişiklik yoksa hiçbir değişiklik alanı dolu olmamalı; değişiklik
  -- varsa en az biri (özet VEYA tam değiştirilmiş metin) dolu olmalı.
  constraint prompt_results_modification_shape check (
    (has_modification = false and modification_summary is null and modified_prompt_text is null)
    or (has_modification = true and (modification_summary is not null or modified_prompt_text is not null))
  )
);

alter table public.prompt_results enable row level security;
create index prompt_results_prompt_id_idx on public.prompt_results (prompt_id, created_at desc);
create index prompt_results_creator_id_idx on public.prompt_results (creator_id);

-- RLS: `prompt_media`/`prompt_versions` ile BİREBİR AYNI "wherever the
-- prompt is readable" deseni.
create policy "Prompt results are readable wherever their prompt is readable"
  on public.prompt_results for select
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_results.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy "Authenticated users can share a result for a published prompt"
  on public.prompt_results for insert
  to authenticated
  with check (
    auth.uid() = creator_id
    and exists (select 1 from public.prompts p where p.id = prompt_id and p.status = 'published')
  );

-- §23: yalnızca kendi sonucunu silebilir; UPDATE politikası yok (bir sonuç
-- düzenlenemiyor, yalnızca eklenip silinebiliyor — bilinçli, dar kapsam).
create policy "Creators can delete their own result"
  on public.prompt_results for delete
  using (auth.uid() = creator_id);

-- === prompt_likes: dördüncü hedef — result_id ================================
alter table public.prompt_likes
  add column result_id uuid references public.prompt_results (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes
  add constraint prompt_likes_exactly_one_target check (
    (prompt_id is not null)::int + (generator_id is not null)::int + (request_id is not null)::int + (result_id is not null)::int = 1
  );

create unique index prompt_likes_result_user_uidx on public.prompt_likes (result_id, user_id) where result_id is not null;
create index prompt_likes_result_id_idx on public.prompt_likes (result_id) where result_id is not null;

create or replace function public.handle_prompt_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set like_count = like_count + 1 where id = new.prompt_id;
    elsif new.generator_id is not null then
      update public.generators set like_count = like_count + 1 where id = new.generator_id;
    elsif new.result_id is not null then
      update public.prompt_results set like_count = like_count + 1 where id = new.result_id;
    else
      update public.prompt_requests set like_count = like_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    elsif old.generator_id is not null then
      update public.generators set like_count = like_count - 1 where id = old.generator_id;
    elsif old.result_id is not null then
      update public.prompt_results set like_count = like_count - 1 where id = old.result_id;
    else
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

-- === prompt_comments: dördüncü hedef — result_id ==============================
alter table public.prompt_comments
  add column result_id uuid references public.prompt_results (id) on delete cascade;

alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments
  add constraint prompt_comments_exactly_one_target check (
    (prompt_id is not null)::int + (request_id is not null)::int + (generator_id is not null)::int + (result_id is not null)::int = 1
  );

create index prompt_comments_result_id_idx on public.prompt_comments (result_id) where result_id is not null;

create or replace function public.handle_prompt_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set comment_count = comment_count + 1 where id = new.prompt_id;
    elsif new.generator_id is not null then
      update public.generators set comment_count = comment_count + 1 where id = new.generator_id;
    elsif new.result_id is not null then
      update public.prompt_results set comment_count = comment_count + 1 where id = new.result_id;
    else
      update public.prompt_requests set comment_count = comment_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.generator_id is not null then
      update public.generators set comment_count = comment_count - 1 where id = old.generator_id;
    elsif old.result_id is not null then
      update public.prompt_results set comment_count = comment_count - 1 where id = old.result_id;
    else
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- RLS: select/insert politikalarına dördüncü kol eklendi — prompt/request/
-- generator kollarıyla birebir aynı şekil (bir sonucun kendi görünürlüğü,
-- onun promptunun görünürlüğüne eşit).
drop policy "Comments are readable wherever their target is readable" on public.prompt_comments;
create policy "Comments are readable wherever their target is readable"
  on public.prompt_comments for select
  using (
    (prompt_id is not null and exists (
      select 1 from public.prompts p
      where p.id = prompt_comments.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    ))
    or (request_id is not null)
    or (generator_id is not null and exists (
      select 1 from public.generators g
      where g.id = prompt_comments.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    ))
    or (result_id is not null and exists (
      select 1 from public.prompt_results r
      join public.prompts p on p.id = r.prompt_id
      where r.id = prompt_comments.result_id
        and (p.status = 'published' or p.author_id = auth.uid())
    ))
  );

drop policy "Authenticated users can comment on visible targets" on public.prompt_comments;
create policy "Authenticated users can comment on visible targets"
  on public.prompt_comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      (prompt_id is not null and exists (
        select 1 from public.prompts p
        where p.id = prompt_comments.prompt_id
          and (p.status = 'published' or p.author_id = auth.uid())
      ))
      or (request_id is not null)
      or (generator_id is not null and exists (
        select 1 from public.generators g
        where g.id = prompt_comments.generator_id
          and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
      ))
      or (result_id is not null and exists (
        select 1 from public.prompt_results r
        join public.prompts p on p.id = r.prompt_id
        where r.id = prompt_comments.result_id
          and (p.status = 'published' or p.author_id = auth.uid())
      ))
    )
  );

-- === Bildirimler ==============================================================
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'request_response',
    'message', 'message_request', 'system',
    'prompt_edited', 'request_edited', 'generator_edited',
    'edit_suggestion_received', 'edit_suggestion_accepted', 'edit_suggestion_rejected',
    'prompt_result_shared'
  ));

-- Yeni sonuç → promptun sahibine bildirim (kendi promptuna kendi sonucunu
-- eklemek hariç — `notify_new_remix`/`notify_new_request_response`'un aynı,
-- kendi-kendine-bildirim-yok kuralı).
create or replace function public.notify_new_prompt_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_title text;
begin
  select author_id, title into v_owner_id, v_title from public.prompts where id = new.prompt_id;
  if v_owner_id is null or v_owner_id = new.creator_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_owner_id, new.creator_id, 'prompt_result_shared',
    'Promptun için bir sonuç paylaştı: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/results/local?id=' || new.id
  );
  return new;
end;
$$;

create trigger prompt_results_after_insert_notify
  after insert on public.prompt_results
  for each row
  execute function public.notify_new_prompt_result();

-- === Yorum bildirimleri — sonuç kolu eklendi ==================================
-- Generator dalı DEĞİŞMEDİ (kendi ayrı `notify_generator_comment`'ine
-- yönlendirilmeye devam ediyor); yalnızca prompt/request'in yanına, aynı
-- şekilde bir `result_id` kolu eklendi (bir generator'ın aksine bir sonucun
-- kendi slug'ı yok, bu yüzden ayrı bir fonksiyon gerekmedi — href doğrudan
-- `/results/local?id=`).
create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_post_author uuid;
  v_href text;
begin
  if new.generator_id is not null then
    return new;
  end if;

  v_href := (case
    when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
    when new.result_id is not null then '/results/local?id=' || new.result_id
    else '/requests/local?id=' || new.request_id
  end) || '&hl=comment:' || new.id;

  if new.parent_id is not null then
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_parent_author, new.author_id, 'comment_reply',
      'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href
    );
  else
    if new.prompt_id is not null then
      select author_id into v_post_author from public.prompts where id = new.prompt_id;
    elsif new.result_id is not null then
      select creator_id into v_post_author from public.prompt_results where id = new.result_id;
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      (case
        when new.prompt_id is not null then 'Paylaşımına yorum yaptı: "'
        when new.result_id is not null then 'Sonucuna yorum yaptı: "'
        else 'İsteğine yorum yaptı: "'
      end) || public.truncate_preview(new.body) || '"',
      v_href
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment_author uuid;
  v_prompt_id uuid;
  v_request_id uuid;
  v_generator_id uuid;
  v_result_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, generator_id, result_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_generator_id, v_result_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  if v_generator_id is not null then
    select '/generators/local?slug=' || slug into v_href
      from public.generators where id = v_generator_id;
    if v_href is null then
      return new;
    end if;
  else
    v_href := (case
      when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
      when v_result_id is not null then '/results/local?id=' || v_result_id
      else '/requests/local?id=' || v_request_id
    end) || '&hl=comment:' || new.comment_id;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_comment_author, new.user_id, 'like',
    'Yorumunu beğendi: "' || public.truncate_preview(v_body) || '"', v_href,
    'comment_like:' || new.comment_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

-- === Storage: result-media bucket'ı ===========================================
-- Tek, yeni bucket — image/video/audio için (prompt-media yalnızca
-- promptların KENDİ görseli için, video/audio hiç desteklemiyor). Aynı
-- "klasör = kullanıcı" per-path sahiplik deseni (Bölüm 20).
-- Yol kuralı: result-media/{user_id}/{result_id}-{full|thumb|poster}.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'result-media', 'result-media', true, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'
  ]
)
on conflict (id) do nothing;

create policy "Result media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'result-media');

create policy "Users can upload result media under their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'result-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own result media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'result-media' and (storage.foldername(name))[1] = auth.uid()::text);
