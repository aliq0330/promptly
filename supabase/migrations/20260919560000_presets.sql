-- Hazır Ayar (Preset) — Promptly'nin 5. birinci sınıf içerik türü (CLAUDE.md
-- Bölüm 9.83). Prompt / Prompt İsteği / Generator / Workflow ile aynı
-- mimari: ayrı bir içerik tablosu + mevcut ortak sosyal katmanın (beğeni,
-- yorum, koleksiyona kaydetme, bildirim, istatistik, Realtime) `preset_id`
-- ile genişletilmesi. `prompt_likes` / `prompt_comments` / `collection_items`
-- tablo adları DEĞİŞMEDİ (Bölüm 9.34/9.59'daki aynı gerekçe).
--
-- Parametre modeli: ayrı bir `preset_parameters` tablosu YOK. Bir hazır ayarın
-- parametreleri, Prompt formundaki "Ek Ayar Önerileri"nin (Bölüm 9.62) zaten
-- kullandığı `{ grupId: seçenekId }` seçimidir ve `presets.selection` jsonb'sinde
-- tutulur — böylece bir hazır ayar hem Prompt formunda hem Generator'da aynı
-- sabit grup/seçenek kataloğuna karşı uygulanır, ikinci bir parametre sözlüğü
-- icat edilmez. İçerik türü/kategori ortak taksonomiyi (Bölüm 9.58), araç/model
-- ortak araç kataloğunu (`tools text[]`, workflows ile aynı) kullanır.
--
-- Kullanım sayısı: `preset_uses` salt-ekleme tablosu + SECURITY DEFINER sayaç
-- trigger'ı (`presets.use_count`) — "Bu hazır ayarı kullan" her basışta bir satır.

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 1000),
  cover_url text,
  content_type text not null default 'image' check (content_type in ('image', 'text', 'audio', 'video')),
  category text,
  subcategory text,
  tools text[] not null default '{}' check (cardinality(tools) <= 3),
  selection jsonb not null default '{}'::jsonb check (jsonb_typeof(selection) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  use_count integer not null default 0 check (use_count >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index presets_creator_idx on public.presets (creator_id, created_at desc);
create index presets_discovery_idx on public.presets (created_at desc, id desc) where status = 'published' and visibility = 'public';
create index presets_tools_idx on public.presets using gin (tools);
create index presets_taxonomy_idx on public.presets (content_type, category, subcategory);

create trigger presets_set_updated_at before update on public.presets
  for each row execute function public.set_updated_at();

alter table public.presets enable row level security;

-- Herkese açık + yayınlanmış herkese görünür; sahibi her zaman kendi
-- taslağını / "sadece ben" ayarını görür (generators ile aynı sözleşme).
create policy "Public published presets are readable, owners see their own"
  on public.presets for select
  using (creator_id = auth.uid() or (status = 'published' and visibility = 'public'));
create policy "Users create their own presets"
  on public.presets for insert to authenticated with check (creator_id = auth.uid());
create policy "Users update their own presets"
  on public.presets for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "Users delete their own presets"
  on public.presets for delete to authenticated using (creator_id = auth.uid());

-- Etiketler: prompt_tags / workflow_tags ile aynı join-tablosu deseni.
create table public.preset_tags (
  preset_id uuid not null references public.presets (id) on delete cascade,
  tag_slug text not null references public.tags (slug) on delete cascade,
  primary key (preset_id, tag_slug)
);
alter table public.preset_tags enable row level security;
create index preset_tags_tag_slug_idx on public.preset_tags (tag_slug);

create policy "Preset tags are readable wherever their preset is"
  on public.preset_tags for select
  using (exists (
    select 1 from public.presets p
    where p.id = preset_tags.preset_id
      and (p.creator_id = auth.uid() or (p.status = 'published' and p.visibility = 'public'))
  ));
create policy "Owners can tag their own presets"
  on public.preset_tags for insert to authenticated
  with check (exists (select 1 from public.presets p where p.id = preset_tags.preset_id and p.creator_id = auth.uid()));
create policy "Owners can remove tags from their own presets"
  on public.preset_tags for delete to authenticated
  using (exists (select 1 from public.presets p where p.id = preset_tags.preset_id and p.creator_id = auth.uid()));

-- Kullanım kaydı: yalnızca kendi adına ve erişilebilen bir hazır ayara.
create table public.preset_uses (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.presets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.preset_uses enable row level security;
create index preset_uses_preset_idx on public.preset_uses (preset_id);

create policy "Users can read their own preset uses"
  on public.preset_uses for select to authenticated using (user_id = auth.uid());
create policy "Users record their own use of visible presets"
  on public.preset_uses for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.presets p where p.id = preset_uses.preset_id));

create or replace function public.handle_preset_use_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.presets set use_count = use_count + 1 where id = new.preset_id;
  return new;
end;
$$;
create trigger preset_uses_after_insert after insert on public.preset_uses
  for each row execute function public.handle_preset_use_created();

-- === prompt_likes: preset_id ====================================================
alter table public.prompt_likes
  add column preset_id uuid references public.presets (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes
  add constraint prompt_likes_exactly_one_target check (
    (prompt_id is not null)::int + (generator_id is not null)::int + (request_id is not null)::int
    + (result_id is not null)::int + (workflow_id is not null)::int + (preset_id is not null)::int = 1
  );
create unique index prompt_likes_preset_user_uidx on public.prompt_likes (preset_id, user_id) where preset_id is not null;
create index prompt_likes_preset_id_idx on public.prompt_likes (preset_id) where preset_id is not null;

-- `security definer` + sabit search_path korunuyor (Bölüm 19 — cross-user sayaç).
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
    elsif new.preset_id is not null then
      update public.presets set like_count = like_count + 1 where id = new.preset_id;
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
    elsif old.preset_id is not null then
      update public.presets set like_count = like_count - 1 where id = old.preset_id;
    else
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

-- === prompt_comments: preset_id ================================================
alter table public.prompt_comments
  add column preset_id uuid references public.presets (id) on delete cascade;

alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments
  add constraint prompt_comments_exactly_one_target check (
    (prompt_id is not null)::int + (request_id is not null)::int + (generator_id is not null)::int
    + (result_id is not null)::int + (workflow_id is not null)::int + (preset_id is not null)::int = 1
  );
create index prompt_comments_preset_id_idx on public.prompt_comments (preset_id) where preset_id is not null;

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
    elsif new.preset_id is not null then
      update public.presets set comment_count = comment_count + 1 where id = new.preset_id;
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
    elsif old.preset_id is not null then
      update public.presets set comment_count = comment_count - 1 where id = old.preset_id;
    else
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- Yorum RLS: bir hazır ayarın yorumları, hazır ayarın kendi görünürlüğünü izler.
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
    or (preset_id is not null and exists (
      select 1 from public.presets s
      where s.id = prompt_comments.preset_id
        and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))
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
      or (preset_id is not null and exists (
        select 1 from public.presets s
        where s.id = prompt_comments.preset_id
          and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))
      ))
    )
  );

-- === collection_items: preset_id ================================================
alter table public.collection_items
  add column preset_id uuid references public.presets (id) on delete cascade;

alter table public.collection_items drop constraint collection_items_exactly_one_target;
alter table public.collection_items
  add constraint collection_items_exactly_one_target check (
    (prompt_id is not null)::int + (generator_id is not null)::int + (workflow_id is not null)::int + (preset_id is not null)::int = 1
  );
create unique index collection_items_collection_preset_uidx on public.collection_items (collection_id, preset_id) where preset_id is not null;
create index collection_items_preset_id_idx on public.collection_items (preset_id) where preset_id is not null;

create or replace function public.remove_preset_from_saved_everywhere(p_preset_id uuid)
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
    and ci.preset_id = p_preset_id;
end;
$$;
revoke all on function public.remove_preset_from_saved_everywhere(uuid) from public;
grant execute on function public.remove_preset_from_saved_everywhere(uuid) to authenticated;

-- === save_count (kullanıcı başına tek kaydetme — Bölüm 9.78 ile aynı kural) ====
-- Var olan prompt/generator/workflow fonksiyonlarına DOKUNULMADI; hazır ayar
-- için ayrı, aynı mantıkta üç trigger (ekleme / silme / koleksiyon silinirken).
create or replace function public.handle_preset_collection_items_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_inserted int;
  v_total int;
begin
  for v_pair in
    select distinct c.owner_id, nt.preset_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.preset_id is not null
  loop
    select count(*) into v_inserted from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.preset_id = v_pair.target_id;
    select count(*) into v_total from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.preset_id = v_pair.target_id;
    if v_total - v_inserted <= 0 then
      update public.presets set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;
  return null;
end;
$$;
create trigger collection_items_after_insert_preset_save_counts
  after insert on public.collection_items
  referencing new table as new_table
  for each statement
  execute function public.handle_preset_collection_items_insert();

create or replace function public.handle_preset_collection_items_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_remaining int;
begin
  for v_pair in
    select distinct c.owner_id, ot.preset_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.preset_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.preset_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.presets set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;
  return null;
end;
$$;
create trigger collection_items_after_delete_preset_save_counts
  after delete on public.collection_items
  referencing old table as old_table
  for each statement
  execute function public.handle_preset_collection_items_delete();

-- Bir koleksiyon silinirken (cascade satırlarında koleksiyon artık yok) kararı
-- koleksiyon hâlâ varken ver — Bölüm 9.78'in aynı BEFORE DELETE deseni.
create or replace function public.handle_preset_collections_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_remaining boolean;
begin
  for v_item in
    select preset_id from public.collection_items where collection_id = old.id and preset_id is not null
  loop
    select exists(
      select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
      where c.owner_id = old.owner_id and c.id <> old.id and ci.preset_id = v_item.preset_id
    ) into v_remaining;
    if not v_remaining then
      update public.presets set save_count = greatest(0, save_count - 1) where id = v_item.preset_id;
    end if;
  end loop;
  return old;
end;
$$;
create trigger collections_before_delete_preset_save_counts
  before delete on public.collections
  for each row
  execute function public.handle_preset_collections_before_delete();

-- === Bildirimler (mevcut tipler: like / comment / comment_reply) ==============
create or replace function public.notify_preset_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_title text;
begin
  select creator_id, title into v_creator_id, v_title from public.presets where id = new.preset_id;
  if v_creator_id is null or v_creator_id = new.user_id then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_creator_id, new.user_id, 'like',
    'Hazır ayarını beğendi: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/presets/local?id=' || new.preset_id,
    'preset_like:' || new.preset_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
create trigger prompt_likes_after_insert_notify_preset
  after insert on public.prompt_likes
  for each row
  when (new.preset_id is not null)
  execute function public.notify_preset_like();

create or replace function public.cleanup_preset_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where dedupe_key = 'preset_like:' || old.preset_id || ':' || old.user_id;
  return old;
end;
$$;
create trigger prompt_likes_after_delete_cleanup_preset_notification
  after delete on public.prompt_likes
  for each row
  when (old.preset_id is not null)
  execute function public.cleanup_preset_like_notification();

create or replace function public.notify_preset_comment()
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
  v_href := '/presets/local?id=' || new.preset_id || '&hl=comment:' || new.id;
  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select creator_id into v_creator_id from public.presets where id = new.preset_id;
    if v_creator_id is null or v_creator_id = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_creator_id, new.author_id, 'comment', 'Hazır ayarına yorum yaptı: "' || public.truncate_preview(new.body) || '"', v_href);
  end if;
  return new;
end;
$$;
create trigger prompt_comments_after_insert_notify_preset
  after insert on public.prompt_comments
  for each row
  when (new.preset_id is not null)
  execute function public.notify_preset_comment();

-- notify_comment_reply: workflow/generator gibi hazır ayar yorumunu da kendi
-- fonksiyonuna bırakıp erken çıkar (yoksa "istek" koluna düşerdi).
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
  if new.generator_id is not null or new.workflow_id is not null or new.preset_id is not null then
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

-- Yorum beğenisi: hazır ayar yorumu için kendi hedef kolu.
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
  v_preset_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, generator_id, result_id, workflow_id, preset_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_generator_id, v_result_id, v_workflow_id, v_preset_id, v_body
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
      when v_preset_id is not null then '/presets/local?id=' || v_preset_id
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

create or replace function public.cleanup_notifications_for_deleted_preset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/presets/local?id=' || old.id || '%';
  return old;
end;
$$;
create trigger presets_after_delete_cleanup_notifications
  after delete on public.presets
  for each row
  execute function public.cleanup_notifications_for_deleted_preset();

-- === Moderasyon: hazır ayar da şikâyet edilebilsin / kaldırılabilsin ==========
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('prompt', 'comment', 'request', 'user', 'message', 'generator', 'workflow', 'preset'));

create or replace function public.moderation_report_queue(p_status text default 'open')
returns table (
  id uuid, status text, reason text, created_at timestamptz, reviewed_at timestamptz, resolution_note text,
  target_type text, target_id uuid,
  reporter_id uuid, reporter_username text,
  target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join lateral (
    select true as exists_, p.title as title, p.author_id as author_id, '/prompts/local?id=' || p.id as href
      from public.prompts p where r.target_type = 'prompt' and p.id = r.target_id
    union all
    select true, q.title, q.author_id, '/requests/local?id=' || q.id
      from public.prompt_requests q where r.target_type = 'request' and q.id = r.target_id
    union all
    select true, g.title, g.creator_id, '/generators/local?slug=' || g.slug
      from public.generators g where r.target_type = 'generator' and g.id = r.target_id
    union all
    select true, w.title, w.creator_id, '/workflows/local?id=' || w.id
      from public.workflows w where r.target_type = 'workflow' and w.id = r.target_id
    union all
    select true, s.title, s.creator_id, '/presets/local?id=' || s.id
      from public.presets s where r.target_type = 'preset' and s.id = r.target_id
    union all
    select true, left(c.body, 300), c.author_id, null::text
      from public.prompt_comments c where r.target_type = 'comment' and c.id = r.target_id
    union all
    select true, left(coalesce(m.body, ''), 300), m.sender_id, null::text
      from public.messages m where r.target_type = 'message' and m.id = r.target_id
    union all
    select true, u.display_name, u.id, '/profile/real?username=' || u.username
      from public.profiles u where r.target_type = 'user' and u.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $$;
grant execute on function public.moderation_report_queue(text) to authenticated;

create or replace function public.moderate_report(p_report_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  if p_action not in ('dismissed', 'reviewed', 'removed') then raise exception 'Geçersiz işlem.'; end if;
  select * into r from public.reports where id = p_report_id;
  if not found then raise exception 'Şikâyet bulunamadı.'; end if;
  if p_action = 'removed' then
    if r.target_type = 'prompt' then delete from public.prompts where id = r.target_id;
    elsif r.target_type = 'request' then delete from public.prompt_requests where id = r.target_id;
    elsif r.target_type = 'generator' then delete from public.generators where id = r.target_id;
    elsif r.target_type = 'workflow' then delete from public.workflows where id = r.target_id;
    elsif r.target_type = 'preset' then delete from public.presets where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    else raise exception 'Bu hedef türü kaldırılamaz.';
    end if;
  end if;
  update public.reports
    set status = case when p_action = 'dismissed' then 'dismissed' else 'reviewed' end,
        reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_report_id;
  if p_action = 'removed' then
    update public.reports set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
      resolution_note = coalesce(resolution_note, 'İçerik kaldırıldı.')
      where target_type = r.target_type and target_id = r.target_id and status = 'open';
  end if;
end $$;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;

-- === Realtime: sayaç güncellemeleri (Bölüm 9.78) ==============================
alter publication supabase_realtime add table public.presets;

-- === İstatistik RPC'leri (Bölüm 9.82): hazır ayar eklendi ======================
create or replace function public._engager_content_visible(p_content_type text, p_content_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and (p.status = 'published' or p.author_id = auth.uid())
    )
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and (not r.is_draft or r.author_id = auth.uid())
    )
    when 'generator' then exists (
      select 1 from public.generators g
      where g.id = p_content_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid() or w.status = 'published')
    )
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id
        and (s.creator_id = auth.uid() or (s.status = 'published' and s.visibility = 'public'))
    )
    else false
  end;
$$;

revoke all on function public._engager_content_visible(text, uuid) from public;

-- Keyset sayfalama: (interacted_at, actor_id) azalan; bir sonraki sayfa için
-- son satırın ikisi `p_before_at` / `p_before_actor` olarak geri verilir.
create or replace function public.content_engagers(
  p_content_type text,
  p_content_id uuid,
  p_kind text,
  p_limit integer default 20,
  p_before_at timestamptz default null,
  p_before_actor uuid default null
)
returns table (
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
  actor_follower_count integer,
  interacted_at timestamptz,
  comment_id uuid,
  comment_body text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_col text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_kind not in ('likes', 'comments', 'saves') then
    raise exception 'invalid kind';
  end if;

  v_col := case p_content_type
    when 'prompt' then 'prompt_id'
    when 'request' then 'request_id'
    when 'generator' then 'generator_id'
    when 'workflow' then 'workflow_id'
    when 'preset' then 'preset_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  -- Gönderiyi göremeyen biri hiçbir şey göremez; istekler kaydedilemez.
  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  if p_kind = 'saves' and p_content_type = 'request' then
    return;
  end if;

  if p_kind = 'likes' then
    return query execute format($q$
      select l.user_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             l.created_at, null::uuid, null::text
      from public.prompt_likes l
      left join public.profiles p on p.id = l.user_id
      where l.%I = $1
        and ($2 is null or (l.created_at, l.user_id) < ($2, $3))
      order by l.created_at desc, l.user_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  elsif p_kind = 'comments' then
    -- Kullanıcı başına TEK satır: o kullanıcının silinmemiş en son yorumu.
    return query execute format($q$
      select x.author_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             x.created_at, x.id, x.body
      from (
        select distinct on (c.author_id) c.author_id, c.created_at, c.id, c.body
        from public.prompt_comments c
        where c.%I = $1 and c.deleted_at is null
        order by c.author_id, c.created_at desc, c.id desc
      ) x
      left join public.profiles p on p.id = x.author_id
      where ($2 is null or (x.created_at, x.author_id) < ($2, $3))
      order by x.created_at desc, x.author_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;

  else
    -- Kaydeden = gönderiyi HERHANGİ bir koleksiyonuna eklemiş kullanıcı
    -- (Bölüm 9.38); aynı kişi birden çok koleksiyona eklediyse tek satır.
    return query execute format($q$
      select s.owner_id, p.username, p.display_name, p.avatar_url, p.follower_count,
             s.saved_at, null::uuid, null::text
      from (
        select c.owner_id, max(ci.created_at) as saved_at
        from public.collection_items ci
        join public.collections c on c.id = ci.collection_id
        where ci.%I = $1
        group by c.owner_id
      ) s
      left join public.profiles p on p.id = s.owner_id
      where ($2 is null or (s.saved_at, s.owner_id) < ($2, $3))
      order by s.saved_at desc, s.owner_id desc
      limit $4
    $q$, v_col) using p_content_id, p_before_at, p_before_actor, v_limit;
  end if;
end;
$$;

revoke all on function public.content_engagers(text, uuid, text, integer, timestamptz, uuid) from public;
grant execute on function public.content_engagers(text, uuid, text, integer, timestamptz, uuid) to anon, authenticated;
