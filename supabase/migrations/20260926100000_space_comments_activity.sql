-- Space yorumları + puan + ayrıntılı etkinlik (docs/history/242-*): kullanıcı, 241'de kapatılan Space yorumunu geri istedi ve ikisini ekledi:
--   • Genel yorum yaparken 1–5 YILDIZ (puan yorumla birlikte görünür; kişi başına tek puan; ana yorumda, yanıtta yok; sahibi kendini puanlayamaz).
--   • Etkinlik geçmişi: her değişikliğin ÖNCESİ/SONRASI (`details`), değişikliği yapanın notu (`author_note`) ve her etkinliğe yorum.
-- Beğeni kapalı kalır (`space_id`'li yeni beğeni reddedilir); alıntı hattı (241) olduğu gibi durur — Space'in yorumu/puanı projenin KENDİSİ hakkındadır.
--
-- Etkinlik yorumu yeni bir "dokuzuncu hedef" DEĞİLDİR: `prompt_comments.space_id` + açıklayıcı `space_activity_id` (hangi etkinliğe düşüldüğü). Böylece sayaç,
-- silme, bildirim ve politika zincirleri `space_id` koluyla çalışmaya devam eder; yalnız sayım yeri ve okuma kuralı etkinliğe göre ayrılır.
--
--   1) Sütunlar (hepsi ekleyici): prompt_comments.rating / space_activity_id; spaces.rating_avg / rating_count / activity_visibility;
--      space_activity.details / author_note / comment_count. `drop` YOK.
--   2) `enforce_space_engagement`: beğeni kapalı; yorum = okuyabilen + arşivsiz + engelsiz; puan kuralları; etkinlik yorumu etkinlik görünürse.
--   3) Puan toplamı (`rating_avg`, `rating_count`) ve yorum sayısının ayrımı (genel yorum → spaces, etkinlik yorumu → space_activity) tetikleyiciyle.
--   4) Etkinlik: `_space_log` ayrıntı (önce/sonra) alır, ardışık değişiklikte İLK "önce"yi korur; ad/görünürlük/palet/öğe tetikleyicileri ayrıntı yazar.
--      Okuma: Space'i okuyan herkes (varsayılan `activity_visibility='everyone'`), sahibi "yalnız üyeler"e çevirebilir. Not: yalnız değişikliği yapan (RPC).
--   5) `list_spaces` `p_sort='recommended'` (aynı imza): alıntı sayısı + puan (en az 3 puan olmadan ortalama sıralamaya girmez).
-- Önce migration, sonra istemci.

-- ============================================================================
-- 1) Sütunlar
-- ============================================================================
alter table public.spaces
  add column if not exists rating_avg numeric(3, 2) not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists activity_visibility text not null default 'everyone';
alter table public.spaces drop constraint if exists spaces_activity_visibility_check;
alter table public.spaces add constraint spaces_activity_visibility_check check (activity_visibility in ('everyone', 'members'));

alter table public.space_activity
  add column if not exists details jsonb,
  add column if not exists author_note text,
  add column if not exists comment_count integer not null default 0;
alter table public.space_activity drop constraint if exists space_activity_note_len;
alter table public.space_activity add constraint space_activity_note_len check (author_note is null or char_length(author_note) <= 280);

alter table public.prompt_comments
  add column if not exists rating smallint,
  add column if not exists space_activity_id uuid references public.space_activity (id) on delete cascade;
alter table public.prompt_comments drop constraint if exists prompt_comments_rating_range;
alter table public.prompt_comments add constraint prompt_comments_rating_range check (rating is null or rating between 1 and 5);
alter table public.prompt_comments drop constraint if exists prompt_comments_rating_scope;
alter table public.prompt_comments add constraint prompt_comments_rating_scope
  check (rating is null or (space_id is not null and parent_id is null and space_activity_id is null));
alter table public.prompt_comments drop constraint if exists prompt_comments_activity_scope;
alter table public.prompt_comments add constraint prompt_comments_activity_scope check (space_activity_id is null or space_id is not null);

create unique index if not exists prompt_comments_space_rating_uniq
  on public.prompt_comments (author_id, space_id) where rating is not null;
create index if not exists prompt_comments_space_activity_idx
  on public.prompt_comments (space_activity_id) where space_activity_id is not null;

drop trigger if exists spaces_protect_rating on public.spaces;
create trigger spaces_protect_rating
  before insert or update of rating_avg, rating_count on public.spaces
  for each row execute function public.protect_counter_columns('rating_avg', 'rating_count');
drop trigger if exists space_activity_protect_comment_count on public.space_activity;
create trigger space_activity_protect_comment_count
  before insert or update of comment_count on public.space_activity
  for each row execute function public.protect_counter_columns('comment_count');

-- ============================================================================
-- 2) Yazma kuralı (beğeni kapalı; yorum + puan)
-- ============================================================================
create or replace function public.enforce_space_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := to_jsonb(new);
  v_space uuid := nullif(v_row ->> 'space_id', '')::uuid;
  v_parent uuid := nullif(v_row ->> 'parent_id', '')::uuid;
  v_activity uuid := nullif(v_row ->> 'space_activity_id', '')::uuid;
  v_rating smallint := nullif(v_row ->> 'rating', '')::smallint;
  v_parent_space uuid;
  v_parent_activity uuid;
  s public.spaces;
  v_is_member boolean;
begin
  if tg_table_name = 'prompt_likes' then
    if v_space is not null then
      raise exception 'space_engagement_closed';
    end if;
    return new;
  end if;

  if v_parent is not null then
    select c.space_id, c.space_activity_id into v_parent_space, v_parent_activity from public.prompt_comments c where c.id = v_parent;
    if v_parent_space is distinct from v_space or v_parent_activity is distinct from v_activity then
      raise exception 'invalid_parent';
    end if;
  end if;
  if v_space is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  select * into s from public.spaces where id = v_space;
  if not found or not public.can_read_space(v_space) then
    raise exception 'space_not_found';
  end if;
  if s.archived_at is not null then
    raise exception 'space_archived';
  end if;
  if s.owner_id <> v_actor and public.is_blocked(v_actor, s.owner_id) then
    raise exception 'space_not_found';
  end if;
  v_is_member := public.space_role(v_space) is not null;

  if v_activity is not null then
    if not exists (select 1 from public.space_activity a where a.id = v_activity and a.space_id = v_space)
       or not (v_is_member or s.activity_visibility = 'everyone') then
      raise exception 'space_not_found';
    end if;
  end if;

  if v_rating is not null then
    if s.owner_id = v_actor then
      raise exception 'space_rating_owner';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_space_engagement() from public, anon, authenticated;

-- Etkinlik yorumu kolonları bir güncellemeyle değiştirilemez (yorum başka etkinliğe/Space'e taşınmaz).
create or replace function public.prompt_comments_lock_space_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Yalnız istemci rolleri için (veri geçişleri / tetikleyiciler serbest).
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.space_id is distinct from old.space_id or new.space_activity_id is distinct from old.space_activity_id then
    raise exception 'invalid_parent';
  end if;
  if new.rating is distinct from old.rating and (new.parent_id is not null) then
    raise exception 'invalid_parent';
  end if;
  return new;
end;
$$;
revoke all on function public.prompt_comments_lock_space_scope() from public, anon, authenticated;
drop trigger if exists prompt_comments_lock_space_scope on public.prompt_comments;
create trigger prompt_comments_lock_space_scope
  before update on public.prompt_comments
  for each row execute function public.prompt_comments_lock_space_scope();

-- Okuma/yazma politikaları: etkinlik yorumu, etkinliğin kendi okuma kuralını (aşağıda) izler.
alter policy "Comments are readable wherever their target is readable" on public.prompt_comments
  using (
    ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((request_id is not null) and exists (select 1 from public.prompt_requests r where r.id = prompt_comments.request_id))
    or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
    or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and (s.visibility = 'public' or s.community_id is not null)))))
    or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
    or ((space_id is not null) and exists (select 1 from public.spaces sp where sp.id = prompt_comments.space_id)
        and (space_activity_id is null or exists (select 1 from public.space_activity a where a.id = prompt_comments.space_activity_id)))
    or ((quote_id is not null) and exists (select 1 from public.content_quotes cq where cq.id = prompt_comments.quote_id))
  );

alter policy "Authenticated users can comment on visible targets" on public.prompt_comments
  with check (
    auth.uid() = author_id
    and (
      ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
      or ((request_id is not null) and exists (select 1 from public.prompt_requests r where r.id = prompt_comments.request_id))
      or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
      or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
      or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and (s.visibility = 'public' or s.community_id is not null)))))
      or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
      or ((space_id is not null) and exists (select 1 from public.spaces sp where sp.id = prompt_comments.space_id)
          and (space_activity_id is null or exists (select 1 from public.space_activity a where a.id = prompt_comments.space_activity_id)))
      or ((quote_id is not null) and exists (select 1 from public.content_quotes cq where cq.id = prompt_comments.quote_id))
    )
  );

-- ============================================================================
-- 3) Sayaçlar: yorum sayısı (genel → spaces, etkinlik → space_activity) + puan toplamı
-- ============================================================================
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
    elsif new.result_id is not null then
      update public.prompt_results set comment_count = comment_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set comment_count = comment_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set comment_count = comment_count + 1 where id = new.preset_id;
    elsif new.community_post_id is not null then
      update public.community_posts set comment_count = comment_count + 1 where id = new.community_post_id;
    elsif new.space_id is not null then
      if new.space_activity_id is not null then
        update public.space_activity set comment_count = comment_count + 1 where id = new.space_activity_id;
      else
        update public.spaces set comment_count = comment_count + 1 where id = new.space_id;
      end if;
    elsif new.quote_id is not null then
      update public.content_quotes set comment_count = comment_count + 1 where id = new.quote_id;
    elsif new.request_id is not null then
      update public.prompt_requests set comment_count = comment_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set comment_count = comment_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set comment_count = comment_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set comment_count = comment_count - 1 where id = old.preset_id;
    elsif old.community_post_id is not null then
      update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = old.community_post_id;
    elsif old.space_id is not null then
      if old.space_activity_id is not null then
        update public.space_activity set comment_count = greatest(comment_count - 1, 0) where id = old.space_activity_id;
      else
        update public.spaces set comment_count = greatest(comment_count - 1, 0) where id = old.space_id;
      end if;
    elsif old.quote_id is not null then
      update public.content_quotes set comment_count = greatest(comment_count - 1, 0) where id = old.quote_id;
    elsif old.request_id is not null then
      update public.prompt_requests set comment_count = comment_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

-- Yanıtlı yorumun yumuşak silinmesi: puan da düşer.
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
          rating = null
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$$;

create or replace function public.handle_space_rating_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
  v_old smallint;
  v_new smallint;
begin
  if tg_op = 'INSERT' then
    v_space := new.space_id; v_new := new.rating;
  elsif tg_op = 'DELETE' then
    v_space := old.space_id; v_old := old.rating;
  else
    v_space := new.space_id; v_old := old.rating; v_new := new.rating;
  end if;
  if v_space is null or (v_old is null and v_new is null) then
    return null;
  end if;
  update public.spaces s
     set rating_count = t.c, rating_avg = t.a
    from (select count(*)::integer as c, coalesce(round(avg(rating)::numeric, 2), 0) as a
            from public.prompt_comments where space_id = v_space and rating is not null) t
   where s.id = v_space;
  return null;
end;
$$;
revoke all on function public.handle_space_rating_change() from public, anon, authenticated;
drop trigger if exists prompt_comments_space_rating on public.prompt_comments;
create trigger prompt_comments_space_rating
  after insert or update of rating or delete on public.prompt_comments
  for each row execute function public.handle_space_rating_change();

-- Bildirim: etkinlik yorumu etkinlik sayfasına gider.
create or replace function public.notify_space_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_owner uuid;
  v_href text;
begin
  v_href := public._space_href(new.space_id, 'comment:' || new.id)
    || case when new.space_activity_id is not null then '&tab=activity&event=' || new.space_activity_id else '' end;
  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select owner_id into v_owner from public.spaces where id = new.space_id;
    if v_owner is null or v_owner = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_owner, new.author_id, 'comment',
            case when new.space_activity_id is not null then 'Space''inin bir etkinliğine yorum yaptı: "' else 'Space''ine yorum yaptı: "' end || public.truncate_preview(new.body) || '"',
            v_href);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_space_comment() from public, anon, authenticated;

-- ============================================================================
-- 4) Etkinlik: ayrıntı (önce/sonra), okuma kuralı, yazarın notu
-- ============================================================================
alter policy "Members read the activity log" on public.space_activity to anon, authenticated
  using (
    public.can_read_space(space_id)
    and (
      public.space_role(space_id) is not null
      or exists (select 1 from public.spaces s where s.id = space_activity.space_id and s.activity_visibility = 'everyone')
    )
  );
alter policy "Members read the activity log" on public.space_activity rename to "Readers read the activity log";

create or replace function public._space_log(p_space uuid, p_action text, p_label text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  -- Space silinirken (zincirleme silme) kayıt yazılmaz.
  if not exists (select 1 from public.spaces where id = p_space) then
    return;
  end if;
  select a.id into v_id
    from public.space_activity a
   where a.space_id = p_space and a.actor_id is not distinct from v_actor and a.action = p_action
     and a.label is not distinct from p_label and a.created_at > now() - interval '10 minutes'
   order by a.created_at desc
   limit 1;
  if v_id is not null then
    -- Ardışık değişiklik tek satırdır: İLK "önce" korunur, "sonra" en yenisi olur, eklenen öğeler birikir (en çok 12).
    update public.space_activity a
       set count = a.count + 1,
           created_at = now(),
           details = case
             when p_details is null then a.details
             when a.details is null then p_details
             else a.details
               || case when p_details ? 'after' then jsonb_build_object('after', p_details -> 'after') else '{}'::jsonb end
               || case when p_details ? 'items' then jsonb_build_object('items',
                    (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
                       select e from jsonb_array_elements(coalesce(a.details -> 'items', '[]'::jsonb) || (p_details -> 'items')) with ordinality as t(e, n)
                       order by n limit 12) x))
                  else '{}'::jsonb end
           end
     where a.id = v_id;
    return;
  end if;
  insert into public.space_activity (space_id, actor_id, action, label, details)
  values (p_space, v_actor, p_action, left(p_label, 120), p_details);
  delete from public.space_activity
   where id in (select a.id from public.space_activity a where a.space_id = p_space order by a.created_at desc offset 500);
end;
$$;
revoke all on function public._space_log(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public._space_log(p_space uuid, p_action text, p_label text default null)
returns void
language sql
security definer
set search_path = public
as $$
  select public._space_log(p_space, p_action, p_label, null::jsonb);
$$;
revoke all on function public._space_log(uuid, text, text) from public, anon, authenticated;

create or replace function public.spaces_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title then
    perform public._space_log(new.id, 'renamed', new.title, jsonb_build_object('before', old.title, 'after', new.title));
  end if;
  if new.visibility is distinct from old.visibility then
    perform public._space_log(new.id, 'visibility_changed', new.visibility, jsonb_build_object('before', old.visibility, 'after', new.visibility));
    -- "Bağlantıya sahip olanlar"dan çıkınca açık bağlantılar iptal edilir: sonradan geri dönmek eski bağlantıyı canlandırmaz.
    if old.visibility = 'link' then
      update public.space_share_links set revoked_at = now() where space_id = new.id and revoked_at is null;
    end if;
  end if;
  if new.archived_at is distinct from old.archived_at then
    perform public._space_log(new.id, case when new.archived_at is null then 'unarchived' else 'archived' end, null);
  end if;
  return null;
end;
$$;

create or replace function public.space_items_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details jsonb;
  v_title text;
begin
  if tg_op = 'INSERT' then
    if new.kind <> 'palette' then
      if new.is_private then
        v_details := null; -- gizli not: ayrıntı yazılmaz
      elsif new.kind = 'image' then
        v_details := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind', 'image', 'title', new.title, 'thumb', new.media_url)));
      elsif new.kind = 'prompt' then
        -- Başlık yalnız herkese açık prompttan alınır (gizli prompt başlığı etkinliğe sızmasın).
        select p.title into v_title from public.prompts p
         where p.id = new.prompt_id and p.status = 'published' and p.visibility = 'public' and p.community_id is null;
        v_details := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind', 'prompt', 'title', coalesce(nullif(new.title, ''), v_title))));
      elsif new.kind = 'note' then
        v_details := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind', 'note', 'title', new.title, 'text', left(new.body, 140))));
      else
        v_details := jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind', 'content', 'title', new.title)));
      end if;
      perform public._space_log(new.space_id, case new.kind
        when 'image' then 'image_added' when 'prompt' then 'prompt_added' when 'note' then 'note_added'
        else 'content_added' end, null, v_details);
    end if;
    perform public._space_touch(new.space_id);
  elsif tg_op = 'DELETE' then
    if old.kind <> 'palette' then
      perform public._space_log(old.space_id, case when old.kind = 'image' then 'image_removed' else 'item_removed' end, null,
        case when old.is_private then null
             else jsonb_build_object('items', jsonb_build_array(jsonb_build_object('kind', old.kind, 'title', old.title))) end);
    end if;
    perform public._space_touch(old.space_id);
  else
    perform public._space_touch(new.space_id);
  end if;
  return null;
end;
$$;

create or replace function public.space_palettes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._space_log(new.space_id, 'palette_created', new.name, jsonb_build_object('after', to_jsonb(new.colors)));
  elsif tg_op = 'UPDATE' then
    perform public._space_log(new.space_id, 'palette_updated', new.name,
      jsonb_build_object('before', to_jsonb(old.colors), 'after', to_jsonb(new.colors)));
  else
    perform public._space_log(old.space_id, 'palette_deleted', old.name, jsonb_build_object('before', to_jsonb(old.colors)));
  end if;
  perform public._space_touch(coalesce(new.space_id, old.space_id));
  return null;
end;
$$;

-- Not: yalnız değişikliği YAPAN kişi (Space sahibi bile başkasının etkinliğine not yazamaz); boş not siler.
create or replace function public.set_space_activity_note(p_activity_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  a public.space_activity;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'invalid_note';
  end if;
  select * into a from public.space_activity where id = p_activity_id;
  if not found or not public.can_read_space(a.space_id) then
    raise exception 'space_not_found';
  end if;
  if a.actor_id is distinct from v_actor then
    raise exception 'space_forbidden';
  end if;
  update public.space_activity set author_note = v_note where id = p_activity_id;
end;
$$;
revoke all on function public.set_space_activity_note(uuid, text) from public, anon;
grant execute on function public.set_space_activity_note(uuid, text) to authenticated;

-- ============================================================================
-- 5) Keşfet → Spaces sıralaması: alıntı sayısı + puan (en az 3 puan olmadan ortalama girmez)
-- ============================================================================
create or replace function public.list_spaces(
  p_filter text default 'all',
  p_query text default null,
  p_sort text default 'updated',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, owner_id uuid, owner_username text, owner_display_name text, owner_avatar_url text,
  title text, description text, kind text, visibility text, cover_url text, cover_item_id uuid, cover_item_url text, preview_urls text[],
  image_count integer, prompt_count integer, note_count integer, member_count integer,
  my_role text, is_favorite boolean, last_opened_at timestamptz,
  created_at timestamptz, updated_at timestamptz, archived_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select nullif(btrim(coalesce(p_query, '')), '') as q,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select s.id, s.owner_id, op.username, op.display_name, op.avatar_url,
         s.title, s.description, s.kind, s.visibility, s.cover_url, s.cover_item_id,
         (select ci.media_url from public.space_items ci where ci.id = s.cover_item_id),
         array(select pi.media_url from public.space_items pi where pi.space_id = s.id and pi.kind = 'image' order by pi.created_at desc limit 4),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'image'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'prompt'),
         (select count(*)::integer from public.space_items c where c.space_id = s.id and c.kind = 'note'),
         case when m.role is not null then (select count(*)::integer from public.space_members c where c.space_id = s.id) end,
         m.role, coalesce(us.favorite, false), us.last_opened_at,
         s.created_at, s.updated_at, s.archived_at
    from public.spaces s
    cross join params
    left join public.profiles op on op.id = s.owner_id
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    left join public.space_user_state us on us.space_id = s.id and us.user_id = auth.uid()
   where case coalesce(p_filter, 'all')
           when 'all' then m.role is not null and s.archived_at is null
           when 'mine' then m.role = 'owner' and s.archived_at is null
           when 'shared' then m.role in ('editor', 'viewer') and s.archived_at is null
           when 'favorites' then coalesce(us.favorite, false)
           when 'recent' then us.last_opened_at is not null and s.archived_at is null
           when 'public' then s.visibility = 'public' and s.archived_at is null and s.owner_id is distinct from auth.uid()
           when 'archived' then m.role = 'owner' and s.archived_at is not null
           else false
         end
     and (
       params.q is null
       or s.title ilike params.pattern or s.description ilike params.pattern
       or exists (
         select 1 from public.space_items si
          where si.space_id = s.id and (si.title ilike params.pattern or si.body ilike params.pattern or si.note ilike params.pattern)
       )
       or exists (
         select 1 from public.space_items si join public.prompts pr on pr.id = si.prompt_id
          where si.space_id = s.id and (pr.title ilike params.pattern or pr.prompt_text ilike params.pattern)
       )
     )
   order by
     case when p_sort = 'recommended' then
       s.quote_count * 3 + case when s.rating_count >= 3 then s.rating_avg * ln(1 + s.rating_count) * 4 else 0 end
     end desc nulls last,
     case when p_sort = 'title' then lower(s.title) end asc,
     case when p_sort = 'created' then s.created_at end desc,
     case when p_sort = 'opened' then us.last_opened_at end desc nulls last,
     s.updated_at desc,
     s.id
   limit greatest(1, least(coalesce(p_limit, 24), 60))
  offset greatest(0, coalesce(p_offset, 0));
$$;
