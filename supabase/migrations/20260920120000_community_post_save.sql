-- Topluluk gönderisinde KAYDET (docs/history/184-*).
--
-- Karar: topluluktaki gönderiler normal içerikle birebir aynı davranır.
--   * Yerel (native) içerik: `collection_items.prompt_id/workflow_id/preset_id` ile NORMAL kaydedilir. 179'daki "topluluk içeriği kaydedilemez"
--     engeli kalktı; yerine "yalnız topluluğu okuyabilen kaydedebilir" kuralı geldi (üye olmayan/yasaklı kişi kaydedemez).
--   * Başvuru (application/legacy) gönderisi: GÖNDERİNİN KENDİSİ kaydedilir (`collection_items.community_post_id`); beğeni/yorum gibi
--     gönderinin kendi sayacı vardır (`community_posts.save_count`) ve orijinal içeriğin `save_count`'una dokunmaz.
--   * İstek (request) normal sitede de kaydedilemez; istek başvurusu da kaydedilemez (`community_post_not_savable`).
--   * Yerel gönderinin kendisi kaydedilmez (kaydedilen şey içeriktir).
--   * İstatistik "Kaydedenler" listesi topluluk gönderisi için de çalışır (`content_engagers`).
--
-- Mevcut veri korunur: yalnızca ekleyici sütun/dizin/tetikleyici + `create or replace`. Tek `drop`, `collection_items_exactly_one_target`
-- CHECK kısıtının GENİŞLETİLMESİ içindir (dört hedeften tam biri); satırlara dokunmaz, aynı işlemde yeniden eklenir.
-- Önce bu migration, sonra istemci kodu.

-- 1) Gönderinin kendi kaydetme sayacı (istemciden yazılamaz) ---------------------------------------
alter table public.community_posts add column if not exists save_count integer not null default 0;
alter table public.community_posts drop constraint if exists community_posts_save_count_check;
alter table public.community_posts add constraint community_posts_save_count_check check (save_count >= 0);

drop trigger if exists community_posts_protect_save_count on public.community_posts;
create trigger community_posts_protect_save_count
  before insert or update of save_count on public.community_posts
  for each row execute function public.protect_counter_columns('save_count');

-- 2) Koleksiyon öğesi: dördüncü hedef = topluluk gönderisi ------------------------------------------
alter table public.collection_items
  add column if not exists community_post_id uuid references public.community_posts (id) on delete cascade;

alter table public.collection_items drop constraint if exists collection_items_exactly_one_target;
alter table public.collection_items add constraint collection_items_exactly_one_target check (
  (prompt_id is not null)::integer + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer = 1
);

create unique index if not exists collection_items_collection_post_uidx
  on public.collection_items (collection_id, community_post_id) where community_post_id is not null;
create index if not exists collection_items_community_post_id_idx
  on public.collection_items (community_post_id) where community_post_id is not null;

-- 3) Gönderi kaydetme sayacı: prompt/hazır ayar ile aynı kural (sayaç = kaydeden TEK kullanıcı, koleksiyon sayısı değil) ----
create or replace function public.handle_post_collection_items_insert()
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
    select distinct c.owner_id, nt.community_post_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.community_post_id is not null
  loop
    select count(*) into v_inserted from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.community_post_id = v_pair.target_id;
    select count(*) into v_total from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.community_post_id = v_pair.target_id;
    if v_total - v_inserted <= 0 then
      update public.community_posts set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.handle_post_collection_items_delete()
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
    select distinct c.owner_id, ot.community_post_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.community_post_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.community_post_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.community_posts set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;
  return null;
end;
$$;

-- Koleksiyon silinirken (öğeler cascade ile gider; o anda koleksiyon satırı artık yok) kalan sahiplik yoksa sayaç düşer.
create or replace function public.handle_post_collections_before_delete()
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
    select community_post_id from public.collection_items where collection_id = old.id and community_post_id is not null
  loop
    select exists(
      select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
      where c.owner_id = old.owner_id and c.id <> old.id and ci.community_post_id = v_item.community_post_id
    ) into v_remaining;
    if not v_remaining then
      update public.community_posts set save_count = greatest(0, save_count - 1) where id = v_item.community_post_id;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists collection_items_after_insert_post_save_counts on public.collection_items;
create trigger collection_items_after_insert_post_save_counts
  after insert on public.collection_items
  referencing new table as new_table
  for each statement execute function public.handle_post_collection_items_insert();

drop trigger if exists collection_items_after_delete_post_save_counts on public.collection_items;
create trigger collection_items_after_delete_post_save_counts
  after delete on public.collection_items
  referencing old table as old_table
  for each statement execute function public.handle_post_collection_items_delete();

drop trigger if exists collections_before_delete_post_save_counts on public.collections;
create trigger collections_before_delete_post_save_counts
  before delete on public.collections
  for each row execute function public.handle_post_collections_before_delete();

revoke all on function public.handle_post_collection_items_insert() from public, anon, authenticated;
revoke all on function public.handle_post_collection_items_delete() from public, anon, authenticated;
revoke all on function public.handle_post_collections_before_delete() from public, anon, authenticated;

-- 4) 179'un "topluluk içeriği kaydedilemez" engeli → "yalnız topluluğu okuyabilen kaydeder" ----------------
-- (aynı fonksiyon adı/imza; tetikleyici `collection_items_block_community_content` yerinde kalır)
create or replace function public.block_community_content_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community uuid;
  v_post public.community_posts;
begin
  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    if not found then
      raise exception 'community_post_not_found';
    end if;
    -- Yerel gönderi içeriğin kendisidir (içerik kaydedilir); istek normal sitede de kaydedilemez.
    if v_post.kind = 'native' or v_post.content_type = 'request' then
      raise exception 'community_post_not_savable';
    end if;
    v_community := v_post.community_id;
  elsif new.prompt_id is not null then
    select community_id into v_community from public.prompts where id = new.prompt_id;
  elsif new.workflow_id is not null then
    select community_id into v_community from public.workflows where id = new.workflow_id;
  elsif new.preset_id is not null then
    select community_id into v_community from public.presets where id = new.preset_id;
  end if;
  if v_community is not null and not public.can_read_community(v_community) then
    raise exception 'community_content_not_readable';
  end if;
  return new;
end;
$$;
revoke all on function public.block_community_content_save() from public, anon, authenticated;

-- 5) İstatistik: topluluk gönderisinin "Kaydedenler" listesi (yalnız istek kaydedilemez) -------------------------
create or replace function public.content_engagers(p_content_type text, p_content_id uuid, p_kind text, p_limit integer default 20, p_before_at timestamp with time zone default null, p_before_actor uuid default null)
 returns table(actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, actor_follower_count integer, interacted_at timestamp with time zone, comment_id uuid, comment_body text)
 language plpgsql stable security definer set search_path to 'public' as $function$
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
    when 'workflow' then 'workflow_id'
    when 'preset' then 'preset_id'
    when 'community_post' then 'community_post_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

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
$function$;
