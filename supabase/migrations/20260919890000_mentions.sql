-- @bahsetme: yorumlarda ve isteklerde `@kullaniciadi` ile birini anmak, anılana bildirim.
--
--   * `extract_mentioned_usernames(text)`: metindeki `@kullaniciadi` (profiles_username_format:
--     [a-z0-9_.]{3,30}) adlarını küçük harfle, sırayla, tekrarsız ve en fazla `p_max` tane döndürür.
--     "mail@alan.com" anma sayılmaz (@ işaretinden önce harf/rakam/_/./@ olamaz); cümle sonundaki
--     nokta ("@ali.") addan sayılmaz. İstemci (`src/lib/mentions.ts`) AYNI kuralı uygular.
--   * `notify_comment_mentions`: yorum eklenince / yorum metni düzenlenince, o metinde YENİ geçen her
--     anılan için bildirim. Anılan; yorumu yazan, bu yorum için zaten bildirim alan kişi (üst yorumun
--     yazarı ya da — üst düzey yorumda — içeriğin sahibi), engelleme ilişkisi olan biri ya da var
--     olmayan kullanıcı ise bildirim üretilmez. Herkese açık olmayan / taslak / silinmiş içerikte
--     bildirim üretilmez (bağlantı ölü olurdu).
--   * `notify_request_mentions`: istek yayında (taslak değil) iken "yaratıcı yön" notunda (insana
--     yazılan alan) yeni anılanlara bildirim; taslak yayınlanınca metindeki herkese. İsteğin
--     `description` alanı bilerek kapsam dışıdır: o, kopyalanan prompt benzeri talimat metnidir ve
--     içindeki `@...` kalıpları (araç/sözdizimi) anma sayılmamalı.
--   * Tür olarak mevcut 'comment' kullanılır (notifications_type_check genişletilmedi: bunun için
--     kısıtı kaldırıp yeniden yazmak gerekirdi); ayrım mesaj kalıbıyla yapılır
--     ("Seni bir yorumda andı: ..." / "Seni bir istekte andı: ..."). Çift bildirimi
--     `dedupe_key` (mention:<tür>:<id>:<alıcı>) önler.
--   * Anma sayısı yorum/istek başına 5 ile sınırlı.

create or replace function public.extract_mentioned_usernames(p_text text, p_max integer default 5)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array(
    select s.u
    from (
      select distinct on (u) u, ord
      from (
        select lower(regexp_replace(m[1], '\.+$', '')) as u, ord
        from regexp_matches(coalesce(p_text, ''), '(?:^|[^A-Za-z0-9_.@])@([A-Za-z0-9_.]{3,30})', 'g') with ordinality as t(m, ord)
      ) raw
      where char_length(u) >= 3
      order by u, ord
    ) s
    order by s.ord
    limit greatest(p_max, 0)
  ), '{}'::text[]);
$$;

create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
  v_old text[] := '{}'::text[];
  v_href text;
  v_visible boolean;
  v_post_author uuid;
  v_already uuid;
  v_rec record;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  v_names := public.extract_mentioned_usernames(new.body);
  if coalesce(array_length(v_names, 1), 0) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := public.extract_mentioned_usernames(old.body);
  end if;

  if new.prompt_id is not null then
    select (status = 'published' and visibility = 'public' and deleted_at is null), author_id
      into v_visible, v_post_author from public.prompts where id = new.prompt_id;
    v_href := '/prompts/local?id=' || new.prompt_id;
  elsif new.result_id is not null then
    select true, creator_id into v_visible, v_post_author from public.prompt_results where id = new.result_id;
    v_href := '/results/local?id=' || new.result_id;
  elsif new.workflow_id is not null then
    select (status = 'published' and visibility = 'public'), creator_id
      into v_visible, v_post_author from public.workflows where id = new.workflow_id;
    v_href := '/workflows/local?id=' || new.workflow_id;
  elsif new.preset_id is not null then
    select (status = 'published' and visibility = 'public'), creator_id
      into v_visible, v_post_author from public.presets where id = new.preset_id;
    v_href := '/presets/local?id=' || new.preset_id;
  else
    select (not is_draft and visibility = 'public' and deleted_at is null), author_id
      into v_visible, v_post_author from public.prompt_requests where id = new.request_id;
    v_href := '/requests/local?id=' || new.request_id;
  end if;

  if not coalesce(v_visible, false) then
    return new;
  end if;
  v_href := v_href || '&hl=comment:' || new.id;

  -- Bu yorum için mevcut tetikleyiciler zaten bildirim üretiyor: yanıtta üst yorumun yazarına,
  -- üst düzey yorumda içeriğin sahibine.
  if new.parent_id is not null then
    select author_id into v_already from public.prompt_comments where id = new.parent_id;
  else
    v_already := v_post_author;
  end if;

  for v_rec in
    select p.id
    from public.profiles p
    where p.username = any (v_names)
      and not (p.username = any (v_old))
      and p.id <> new.author_id
      and p.id is distinct from v_already
      and not public.is_blocked(new.author_id, p.id)
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    values (
      v_rec.id, new.author_id, 'comment',
      'Seni bir yorumda andı: "' || public.truncate_preview(new.body) || '"',
      v_href,
      'mention:comment:' || new.id || ':' || v_rec.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$$;

create trigger prompt_comments_after_insert_notify_mentions
  after insert on public.prompt_comments
  for each row execute function public.notify_comment_mentions();

create trigger prompt_comments_after_update_notify_mentions
  after update of body on public.prompt_comments
  for each row when (old.body is distinct from new.body)
  execute function public.notify_comment_mentions();

create or replace function public.notify_request_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
  v_old text[] := '{}'::text[];
  v_rec record;
begin
  if new.is_draft or new.deleted_at is not null or new.visibility <> 'public' then
    return new;
  end if;

  v_names := public.extract_mentioned_usernames(new.creative_direction);
  if coalesce(array_length(v_names, 1), 0) = 0 then
    return new;
  end if;
  -- Zaten yayındaydı: yalnızca bu düzenlemeyle eklenenler bildirilir.
  if tg_op = 'UPDATE' and not old.is_draft and old.visibility = 'public' then
    v_old := public.extract_mentioned_usernames(old.creative_direction);
  end if;

  for v_rec in
    select p.id
    from public.profiles p
    where p.username = any (v_names)
      and not (p.username = any (v_old))
      and p.id <> new.author_id
      and not public.is_blocked(new.author_id, p.id)
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
    values (
      v_rec.id, new.author_id, 'comment',
      'Seni bir istekte andı: "' || public.truncate_preview(new.title) || '"',
      '/requests/local?id=' || new.id,
      'mention:request:' || new.id || ':' || v_rec.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$$;

create trigger prompt_requests_after_write_notify_mentions
  after insert or update of creative_direction, is_draft, visibility on public.prompt_requests
  for each row execute function public.notify_request_mentions();

-- İstemcinin doğrudan çağırmayacağı fonksiyonlar.
revoke execute on function public.notify_comment_mentions() from public, anon, authenticated;
revoke execute on function public.notify_request_mentions() from public, anon, authenticated;
revoke execute on function public.extract_mentioned_usernames(text, integer) from public, anon, authenticated;
