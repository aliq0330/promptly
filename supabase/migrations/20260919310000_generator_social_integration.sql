-- Prompt/Generator ortak sosyal katman entegrasyonu (CLAUDE.md Bölüm 9.34
-- audit raporunun kullanıcı tarafından onaylanmış PHASE 1'i).
--
-- Mimari karar (audit raporunda kullanıcıya sunulan, onaylanan seçenek):
-- projenin GERÇEK, mevcut konvansiyonuna uyulur — `prompt_comments`'ın
-- zaten yaptığı gibi (nullable prompt_id/request_id + "tam olarak biri
-- dolu" CHECK), tam polimorfik bir content_type sütununa GEÇİLMEZ. Bu
-- yüzden `generator_likes`/`generator_comments` gibi paralel/kopya
-- tablolar KURULMUYOR (kullanıcının şartnamesinin açıkça yasakladığı
-- şey) — bunun yerine mevcut `prompt_likes`/`prompt_comments`/
-- `collection_items` tablolarına nullable birer `generator_id` eklenip
-- CHECK kısıtları üçlü hale getiriliyor.
--
-- `prompt_likes` ve `collection_items`'ın PK'si daha önce (prompt_id,
-- user_id)/(collection_id, prompt_id) idi — prompt_id NOT NULL bir FK
-- olduğundan generator hedefli bir satırda bu sütun null olamazdı. Her
-- ikisi de gerçek bir surrogate `id` PK'sine geçirilip iki partial unique
-- index'le (biri prompt_id, biri generator_id için) eski "aynı hedefi
-- iki kez X'leyemezsin" garantisi korunuyor.
--
-- `generator_saves` (Bölüm 9.27) BİLİNÇLİ OLARAK dokunulmadan, atıl
-- bırakılıyor — Bölüm 9.22'nin `prompt_saves`'i aynı şekilde atıl
-- bırakma kararıyla birebir aynı gerekçe (geriye dönük veri kaybı riski
-- almamak): kaydetme artık generator için de `collection_items`
-- üzerinden, gerçek koleksiyon sistemiyle çalışıyor.

-- === generators: yeni denormalize sayaçlar =================================
alter table public.generators
  add column like_count integer not null default 0 check (like_count >= 0),
  add column comment_count integer not null default 0 check (comment_count >= 0);

-- === prompt_likes: generator_id eklendi, surrogate PK'ye geçirildi =========
alter table public.prompt_likes
  add column id uuid not null default gen_random_uuid(),
  add column generator_id uuid references public.generators (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_pkey;
alter table public.prompt_likes alter column prompt_id drop not null;
alter table public.prompt_likes add primary key (id);

alter table public.prompt_likes
  add constraint prompt_likes_exactly_one_target check (
    (prompt_id is not null and generator_id is null)
    or (prompt_id is null and generator_id is not null)
  );

create unique index prompt_likes_prompt_user_uidx on public.prompt_likes (prompt_id, user_id) where prompt_id is not null;
create unique index prompt_likes_generator_user_uidx on public.prompt_likes (generator_id, user_id) where generator_id is not null;
create index prompt_likes_generator_id_idx on public.prompt_likes (generator_id) where generator_id is not null;

-- Var olan RLS politikaları (select: using (true); insert/delete:
-- auth.uid() = user_id) prompt_id'ye hiç referans vermiyordu — generator
-- hedefli satırlar için de hiç değişiklik gerekmiyor, aynı politikalar
-- geçerli kalıyor.

-- KRİTİK: Bölüm 19'un `handle_prompt_like_change`'i cross-user bir sayaç
-- güncellemesi (birinin beğenisi BAŞKASININ satırını günceller) olduğu
-- için zaten `security definer` + sabit `search_path`e çevrilmişti — bu
-- fonksiyonu `create or replace` ile yeniden tanımlarken bu ikisi
-- ATLANIRSA, RLS'in UPDATE politikası (yalnızca `creator_id = auth.uid()`)
-- güncellemeyi SESSİZCE 0 satır etkileyerek engeller (tam olarak Bölüm
-- 19'un kendisinin uyardığı tuzak). Bu, bu migration'ın kendi yerel
-- testinde GERÇEKTEN yakalanıp (like_count 0'da kaldı) düzeltildi — bkz.
-- supabase/README.md.
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
    else
      update public.generators set like_count = like_count + 1 where id = new.generator_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    else
      update public.generators set like_count = like_count - 1 where id = old.generator_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

-- === prompt_comments: generator_id eklendi ==================================
alter table public.prompt_comments
  add column generator_id uuid references public.generators (id) on delete cascade;

alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments
  add constraint prompt_comments_exactly_one_target check (
    (prompt_id is not null)::int + (request_id is not null)::int + (generator_id is not null)::int = 1
  );

create index prompt_comments_generator_id_idx on public.prompt_comments (generator_id) where generator_id is not null;

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
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.generator_id is not null then
      update public.generators set comment_count = comment_count - 1 where id = old.generator_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- RLS: select/insert politikalarına generator kolu eklendi (Bölüm 19'un
-- prompt/request kollarıyla birebir aynı şekil — herkese açık okuma
-- yayınlanmış+public/unlisted bir generator için, ya da sahibi için).
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
    )
  );

-- === collection_items: generator_id eklendi, surrogate PK'ye geçirildi ====
alter table public.collection_items
  add column id uuid not null default gen_random_uuid(),
  add column generator_id uuid references public.generators (id) on delete cascade;

alter table public.collection_items drop constraint collection_items_pkey;
alter table public.collection_items alter column prompt_id drop not null;
alter table public.collection_items add primary key (id);

alter table public.collection_items
  add constraint collection_items_exactly_one_target check (
    (prompt_id is not null and generator_id is null)
    or (prompt_id is null and generator_id is not null)
  );

create unique index collection_items_collection_prompt_uidx on public.collection_items (collection_id, prompt_id) where prompt_id is not null;
create unique index collection_items_collection_generator_uidx on public.collection_items (collection_id, generator_id) where generator_id is not null;
create index collection_items_generator_id_idx on public.collection_items (generator_id) where generator_id is not null;

-- Var olan RLS politikaları (select: koleksiyonun kendi görünürlüğüne
-- bağlı; insert/delete: yalnızca koleksiyon sahibi) prompt_id'ye hiç
-- referans vermiyordu — generator hedefli satırlar için de aynı politika
-- geçerli, değişiklik gerekmiyor.

-- === Bildirimler: generator beğenisi/yorumu/remixi ==========================
-- Aynı SECURITY DEFINER + dedupe_key deseni (Bölüm 9.6/9.12), yalnızca
-- generator'a özel yeni trigger fonksiyonları — mevcut prompt bildirim
-- üreticilerine dokunulmadı.

create or replace function public.notify_generator_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_title text;
begin
  select creator_id, title into v_creator_id, v_title from public.generators where id = new.generator_id;
  if v_creator_id is null or v_creator_id = new.user_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_creator_id, new.user_id, 'like',
    'Generatorunu beğendi: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/generators/local?slug=' || (select slug from public.generators where id = new.generator_id),
    'generator_like:' || new.generator_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

create trigger prompt_likes_after_insert_notify_generator
  after insert on public.prompt_likes
  for each row
  when (new.generator_id is not null)
  execute function public.notify_generator_like();

create or replace function public.cleanup_generator_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where dedupe_key = 'generator_like:' || old.generator_id || ':' || old.user_id;
  return old;
end;
$$;

create trigger prompt_likes_after_delete_cleanup_generator_notification
  after delete on public.prompt_likes
  for each row
  when (old.generator_id is not null)
  execute function public.cleanup_generator_like_notification();

create or replace function public.notify_generator_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_creator_id uuid;
  v_href text;
begin
  select slug into v_href from public.generators where id = new.generator_id;
  v_href := '/generators/local?slug=' || v_href;

  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select creator_id into v_creator_id from public.generators where id = new.generator_id;
    if v_creator_id is null or v_creator_id = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_creator_id, new.author_id, 'comment', 'Generatoruna yorum yaptı: "' || public.truncate_preview(new.body) || '"', v_href);
  end if;

  return new;
end;
$$;

create trigger prompt_comments_after_insert_notify_generator
  after insert on public.prompt_comments
  for each row
  when (new.generator_id is not null)
  execute function public.notify_generator_comment();

create or replace function public.notify_generator_remix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_title text;
begin
  if new.origin_type <> 'remix' or new.source_generator_id is null then
    return new;
  end if;

  select creator_id, title into v_creator_id, v_title from public.generators where id = new.source_generator_id;
  if v_creator_id is null or v_creator_id = new.creator_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_creator_id, new.creator_id, 'remix',
    'Generatorunu remixledi: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/generators/local?slug=' || new.slug
  );

  return new;
end;
$$;

create trigger generators_after_insert_notify_remix
  after insert on public.generators
  for each row
  execute function public.notify_generator_remix();
