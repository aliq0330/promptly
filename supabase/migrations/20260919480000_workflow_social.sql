-- Workflow'u 4. birinci sınıf içerik türü yapan sosyal katman: beğeni, yorum,
-- koleksiyona kaydetme ve bildirim. Yeni bir sistem YAZILMADI — Bölüm 9.34/
-- 9.35/9.36'nın (generator) ve prompt sonucu/istek eklerinin kurduğu
-- "nullable hedef sütunu + tam olarak bir hedef CHECK'i + partial unique
-- index + SECURITY DEFINER sayaç trigger'ı" deseni, `workflow_id` ile
-- genişletildi. `prompt_likes`/`prompt_comments`/`collection_items` tablo
-- adları değişmedi.

-- === workflows sayaçları ======================================================
alter table public.workflows
  add column if not exists like_count integer not null default 0 check (like_count >= 0),
  add column if not exists comment_count integer not null default 0 check (comment_count >= 0);

-- === prompt_likes: workflow_id ================================================
alter table public.prompt_likes
  add column if not exists workflow_id uuid references public.workflows (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes
  add constraint prompt_likes_exactly_one_target check (
    (prompt_id is not null)::int + (generator_id is not null)::int + (request_id is not null)::int
    + (result_id is not null)::int + (workflow_id is not null)::int = 1
  );

create unique index if not exists prompt_likes_workflow_user_uidx on public.prompt_likes (workflow_id, user_id) where workflow_id is not null;
create index if not exists prompt_likes_workflow_id_idx on public.prompt_likes (workflow_id) where workflow_id is not null;

-- `security definer` + sabit search_path korunuyor (cross-user sayaç
-- güncellemesi RLS'e takılıp sessizce 0 satır etkilemesin — Bölüm 19).
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
    elsif new.workflow_id is not null then
      update public.workflows set like_count = like_count + 1 where id = new.workflow_id;
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
    elsif old.workflow_id is not null then
      update public.workflows set like_count = like_count - 1 where id = old.workflow_id;
    else
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

-- === prompt_comments: workflow_id =============================================
alter table public.prompt_comments
  add column if not exists workflow_id uuid references public.workflows (id) on delete cascade;

alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments
  add constraint prompt_comments_exactly_one_target check (
    (prompt_id is not null)::int + (request_id is not null)::int + (generator_id is not null)::int
    + (result_id is not null)::int + (workflow_id is not null)::int = 1
  );

create index if not exists prompt_comments_workflow_id_idx on public.prompt_comments (workflow_id) where workflow_id is not null;

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
    elsif new.workflow_id is not null then
      update public.workflows set comment_count = comment_count + 1 where id = new.workflow_id;
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
    elsif old.workflow_id is not null then
      update public.workflows set comment_count = comment_count - 1 where id = old.workflow_id;
    else
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- RLS: bir workflow'un yorumları, workflow'un kendi görünürlüğünü izler
-- (yayınlanmış herkese, taslak yalnızca sahibine — workflows RLS'i ile aynı).
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
    or (workflow_id is not null and exists (
      select 1 from public.workflows w
      where w.id = prompt_comments.workflow_id
        and (w.status = 'published' or w.creator_id = auth.uid())
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
      or (workflow_id is not null and exists (
        select 1 from public.workflows w
        where w.id = prompt_comments.workflow_id
          and (w.status = 'published' or w.creator_id = auth.uid())
      ))
    )
  );

-- === collection_items: workflow_id ============================================
alter table public.collection_items
  add column if not exists workflow_id uuid references public.workflows (id) on delete cascade;

alter table public.collection_items drop constraint collection_items_exactly_one_target;
alter table public.collection_items
  add constraint collection_items_exactly_one_target check (
    (prompt_id is not null)::int + (generator_id is not null)::int + (workflow_id is not null)::int = 1
  );

create unique index if not exists collection_items_collection_workflow_uidx on public.collection_items (collection_id, workflow_id) where workflow_id is not null;
create index if not exists collection_items_workflow_id_idx on public.collection_items (workflow_id) where workflow_id is not null;
-- Var olan RLS politikaları (select: koleksiyonun görünürlüğü; insert/delete:
-- koleksiyon sahibi) hiçbir hedef sütununa referans vermiyor — değişmedi.

-- Genel "kaydedilenlerden kaldır" — prompt/generator karşılıklarıyla aynı.
create or replace function public.remove_workflow_from_saved_everywhere(p_workflow_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın.';
  end if;

  delete from public.collection_items ci
  using public.collections c
  where ci.collection_id = c.id
    and c.owner_id = auth.uid()
    and ci.workflow_id = p_workflow_id;
end;
$$;

revoke all on function public.remove_workflow_from_saved_everywhere(uuid) from public;
grant execute on function public.remove_workflow_from_saved_everywhere(uuid) to authenticated;

-- === Bildirimler (mevcut sistem: aynı `notifications`, aynı tipler) ===========
-- Yeni bildirim tipi YOK: beğeni → 'like', yorum → 'comment', yanıt →
-- 'comment_reply'. Hedef: /workflows/local?id=<id>.

create or replace function public.notify_workflow_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_title text;
begin
  select creator_id, title into v_creator_id, v_title from public.workflows where id = new.workflow_id;
  if v_creator_id is null or v_creator_id = new.user_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_creator_id, new.user_id, 'like',
    'Workflow''unu beğendi: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/workflows/local?id=' || new.workflow_id,
    'workflow_like:' || new.workflow_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

create trigger prompt_likes_after_insert_notify_workflow
  after insert on public.prompt_likes
  for each row
  when (new.workflow_id is not null)
  execute function public.notify_workflow_like();

create or replace function public.cleanup_workflow_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where dedupe_key = 'workflow_like:' || old.workflow_id || ':' || old.user_id;
  return old;
end;
$$;

create trigger prompt_likes_after_delete_cleanup_workflow_notification
  after delete on public.prompt_likes
  for each row
  when (old.workflow_id is not null)
  execute function public.cleanup_workflow_like_notification();

create or replace function public.notify_workflow_comment()
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
  v_href := '/workflows/local?id=' || new.workflow_id || '&hl=comment:' || new.id;

  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select creator_id into v_creator_id from public.workflows where id = new.workflow_id;
    if v_creator_id is null or v_creator_id = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_creator_id, new.author_id, 'comment', 'Workflow''una yorum yaptı: "' || public.truncate_preview(new.body) || '"', v_href);
  end if;

  return new;
end;
$$;

create trigger prompt_comments_after_insert_notify_workflow
  after insert on public.prompt_comments
  for each row
  when (new.workflow_id is not null)
  execute function public.notify_workflow_comment();

-- Prompt/istek/sonuç için yazılmış `notify_comment_reply` bir workflow
-- yorumunda "istek" koluna düşerdi (request_id null) — workflow'u kendi
-- fonksiyonuna bırakıp erken çıkıyor (generator dalıyla aynı şekil).
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
  if new.generator_id is not null or new.workflow_id is not null then
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

-- Yorum beğenisi: workflow yorumu için kendi hedef kolu eklendi.
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
  v_workflow_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, generator_id, result_id, workflow_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_generator_id, v_result_id, v_workflow_id, v_body
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
      when v_workflow_id is not null then '/workflows/local?id=' || v_workflow_id
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

-- Workflow silinince ona işaret eden bildirimler temizlensin (önek eşleşmesi,
-- `&hl=` ekli href'ler dahil — prompt/istek temizleyicileriyle aynı ilke).
create or replace function public.cleanup_notifications_for_deleted_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/workflows/local?id=' || old.id || '%';
  return old;
end;
$$;

create trigger workflows_after_delete_cleanup_notifications
  after delete on public.workflows
  for each row
  execute function public.cleanup_notifications_for_deleted_workflow();
