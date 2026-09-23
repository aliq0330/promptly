-- Generator yorumlarında yanıt/beğeni hatası düzeltmesi (CLAUDE.md Bölüm 9.42)
--
-- 20260919310000 prompt_comments'e generator_id ekledi ve generator yorumları
-- için kendi bildirim trigger'ını (notify_generator_comment) yazdı — ama
-- 20260919230000'in iki genel trigger fonksiyonu hâlâ HER prompt_comments /
-- comment_likes satırında çalışıyor ve hedef href'ini yalnızca prompt_id /
-- request_id'den kuruyor. Generator yorumunda ikisi de null olduğundan
-- target_href null çıkıyor ve notifications.target_href NOT NULL kısıtı
-- INSERT'i reddediyordu:
--   * bir generator yorumuna YANIT yazmak  → notify_comment_reply hatası
--   * bir generator yorumunu BEĞENMEK      → notify_comment_like hatası
-- (Üst seviye generator yorumu etkilenmiyordu: o dal hedefin sahibini
-- bulamayıp erken dönüyordu.) Davranış başka hiçbir durumda değişmiyor.

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
  -- Generator yorumları/yanıtları notify_generator_comment tarafından ele
  -- alınıyor (aynı INSERT'te çalışan ayrı trigger); burada ikinci kez
  -- bildirim üretilmez.
  if new.generator_id is not null then
    return new;
  end if;

  v_href := (case
    when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
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
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      (case when new.prompt_id is not null then 'Paylaşımına yorum yaptı: "' else 'İsteğine yorum yaptı: "' end)
        || public.truncate_preview(new.body) || '"',
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
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, generator_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_generator_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  if v_generator_id is not null then
    -- notify_generator_comment ile aynı hedef: generatorun kendi sayfası.
    select '/generators/local?slug=' || slug into v_href
      from public.generators where id = v_generator_id;
    if v_href is null then
      return new;
    end if;
  else
    v_href := (case
      when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
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
