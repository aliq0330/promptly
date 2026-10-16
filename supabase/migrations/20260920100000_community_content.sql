-- Topluluğa ÖZGÜ içerik (docs/history/179-*): içerik topluluğun kendisine aittir.
--
-- Ürün kararı: toplulukta oluşturulan içerik NORMAL içerik kartıyla (kendi beğeni/yorumuyla) topluluk akışında yer alır, yalnızca
-- topluluğu okuyabilenlere görünür (herkese açık toplulukta herkese, kapalıda yalnız üyelere), yazarın profilinde / Keşfet'te / aramada /
-- etiketlerde / "İçeriklerim"de görünmez, koleksiyona kaydedilemez, topluluktan ayrılan yazarın içeriği toplulukta kalır, sonradan
-- herkese açık yapılamaz. 178'deki "private içerik + yerel gönderi" yaklaşımının yerini alır (canlıda yerel gönderi YOKTU: 2 gönderi, ikisi legacy).
--
-- Model: `prompts` / `prompt_requests` / `workflows` / `presets`.community_id (FK → chat_groups, ON DELETE CASCADE; topluluk silinince içeriği de gider).
--   - community_id DOLUYSA: visibility sunucuda ZORLA 'private' (mevcut tüm "herkese açık" süzgeçleri — feed_page, paylaşım, ilgili içerik… —
--     içeriği kendiliğinden dışlar), taslak olamaz (yayınlanmadan topluluğa girmez), community_id değiştirilemez (topluluk ↔ normal geçiş yok),
--     yazma yalnız üye + kapatılmamış topluluk + akış politikası + 24 saatte ≤ 30 gönderi.
--   - Okuma: SELECT politikaları `can_read_community(community_id)`'ı kabul eder; topluluğu artık OKUYAMAYAN yazar kendi topluluk içeriğini de okuyamaz (alt tablolar — medya, etiket, değişken, sonuç, adım, DNA — ve
--     Storage dosyaları ana satırın RLS'ini miras aldığından değişmez). Yazar da ana politikayla görür; listelerden dışlama ayrıca açık
--     `community_id is null` süzgeciyle yapılır (istemci sorguları + `search_content`).
--   - AFTER INSERT tetikleyicisi akış için `community_posts` (kind='native') satırını oluşturur; gönderi + içerik tek işlemdir (iki adımlı
--     RPC, 7 gün kuralı, taslak kaybı sorunları kalktı). `publish_native_community_post` artık kullanılmaz (EXECUTE kapatıldı).
--   - Beğeni/yorum/yorum beğenisi: yalnız topluluk üyesi (herkese açık toplulukta üye olmayan okur, yazamaz); koleksiyona kaydetme sunucuda engelli.
--   - Yazarın "gönderimi kaldır" / yetkilinin "kaldır"ı içeriğin KENDİSİNİ siler (gönderi cascade ile gider).
--   - Yorum SELECT/INSERT politikasındaki "request_id dolu ise herkese açık" kısmı artık isteğin kendi RLS'ini miras alır (özel/topluluk
--     isteklerinin yorumları sızmasın — var olan bir açıktı).
--
-- Yalnızca ekleyici/değiştirici: hiçbir tablo/sütun/veri düşürülmez. 20260920090000'dan SONRA uygulanmalı, istemci kodundan ÖNCE.

-- 1) Sütunlar ---------------------------------------------------------------------------------
alter table public.prompts add column if not exists community_id uuid references public.chat_groups (id) on delete cascade;
alter table public.prompt_requests add column if not exists community_id uuid references public.chat_groups (id) on delete cascade;
alter table public.workflows add column if not exists community_id uuid references public.chat_groups (id) on delete cascade;
alter table public.presets add column if not exists community_id uuid references public.chat_groups (id) on delete cascade;

create index if not exists prompts_community_idx on public.prompts (community_id) where community_id is not null;
create index if not exists prompt_requests_community_idx on public.prompt_requests (community_id) where community_id is not null;
create index if not exists workflows_community_idx on public.workflows (community_id) where community_id is not null;
create index if not exists presets_community_idx on public.presets (community_id) where community_id is not null;

-- 2) Okuma politikaları: topluluğu okuyabilen topluluk içeriğini okur -----------------------------
alter policy "Published public prompts are public, the rest is author-only" on public.prompts
  using (
    (status = 'published' and visibility = 'public')
    or (auth.uid() = author_id and (community_id is null or public.can_read_community(community_id)))
    or (community_id is not null and status = 'published' and public.can_read_community(community_id))
  );

alter policy "Published public requests are public, the rest is author-only" on public.prompt_requests
  using (
    (not is_draft and visibility = 'public')
    or (auth.uid() = author_id and (community_id is null or public.can_read_community(community_id)))
    or (community_id is not null and not is_draft and public.can_read_community(community_id))
  );

alter policy "Published public workflows are public, the rest is owner-only" on public.workflows
  using (
    (status = 'published' and visibility = 'public')
    or (creator_id = auth.uid() and (community_id is null or public.can_read_community(community_id)))
    or (community_id is not null and status = 'published' and public.can_read_community(community_id))
  );

alter policy "Public published presets are readable, owners see their own" on public.presets
  using (
    (creator_id = auth.uid() and (community_id is null or public.can_read_community(community_id)))
    or (status = 'published' and visibility = 'public')
    or (community_id is not null and status = 'published' and public.can_read_community(community_id))
  );

-- 3) Yorum politikaları: istek yorumları isteğin RLS'ini miras alır ----------------------------
alter policy "Comments are readable wherever their target is readable" on public.prompt_comments
  using (
    ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((request_id is not null) and exists (select 1 from public.prompt_requests r where r.id = prompt_comments.request_id))
    or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
    or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and (s.visibility = 'public' or s.community_id is not null)))))
    or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
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
    )
  );

-- 4) Yazma kuralları (BEFORE INSERT/UPDATE) --------------------------------------------------
-- SECURITY INVOKER: `current_user` ayırt edici (istemci = anon/authenticated; sayaç tetikleyicileri SECURITY DEFINER çalıştığından sahip rolü).
create or replace function public.enforce_community_content()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_cid uuid := nullif(v_row ->> 'community_id', '')::uuid;
  v_actor uuid := auth.uid();
  v_client boolean := current_user in ('anon', 'authenticated');
  v_draft boolean := case tg_table_name
    when 'prompt_requests' then coalesce((v_row ->> 'is_draft')::boolean, false)
    else coalesce(v_row ->> 'status', 'published') = 'draft' end;
  g public.chat_groups;
  v_role text;
begin
  -- Topluluk ↔ normal geçiş yok: ne eklenir ne çıkarılır.
  if tg_op = 'UPDATE' and (v_old ->> 'community_id') is distinct from (v_row ->> 'community_id') then
    raise exception 'community_immutable';
  end if;
  if v_cid is null then
    return new;
  end if;

  -- Topluluk içeriği daima 'private' saklanır: mevcut tüm "herkese açık" süzgeçleri onu kendiliğinden dışlar; okuma yalnız
  -- `can_read_community` politikasıyla açılır. İstemcinin gönderdiği değer ne olursa olsun.
  new := jsonb_populate_record(new, jsonb_build_object('visibility', 'private'));
  if v_draft then
    raise exception 'community_draft_not_allowed';
  end if;
  if not v_client or v_actor is null then
    return new;
  end if;

  -- Üyelik, çağıranın KENDİ üyelik satırından okunur (RLS bunu gösterir; invoker olduğundan yardımcı fonksiyon çağrılmaz).
  select role into v_role from public.conversation_members where conversation_id = v_cid and user_id = v_actor;
  if v_role is null then
    raise exception 'forbidden';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;

  select * into g from public.chat_groups where id = v_cid;
  if not found then
    raise exception 'group_not_found';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'forbidden';
  end if;
  if (select count(*) from public.community_posts where community_id = v_cid and author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'post_rate_limit';
  end if;
  return new;
end;
$$;

create or replace function public.create_community_content_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_type text := case tg_table_name when 'prompts' then 'prompt' when 'prompt_requests' then 'request' when 'workflows' then 'workflow' else 'preset' end;
  v_author uuid := coalesce(nullif(v_row ->> 'author_id', ''), nullif(v_row ->> 'creator_id', ''))::uuid;
begin
  insert into public.community_posts (community_id, author_id, kind, content_type, prompt_id, request_id, workflow_id, preset_id)
  values (
    new.community_id, v_author, 'native', v_type,
    case when v_type = 'prompt' then new.id end,
    case when v_type = 'request' then new.id end,
    case when v_type = 'workflow' then new.id end,
    case when v_type = 'preset' then new.id end
  );
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['prompts', 'prompt_requests', 'workflows', 'presets'] loop
    execute format('drop trigger if exists aa_enforce_community_content on public.%I', t);
    execute format('create trigger aa_enforce_community_content before insert or update on public.%I for each row execute function public.enforce_community_content()', t);
    execute format('drop trigger if exists zz_create_community_content_post on public.%I', t);
    execute format('create trigger zz_create_community_content_post after insert on public.%I for each row when (new.community_id is not null) execute function public.create_community_content_post()', t);
  end loop;
end $$;

-- 5) Etkileşim ve kaydetme: yalnız üye / kaydetme yok -----------------------------------------
create or replace function public.enforce_community_content_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_actor uuid := auth.uid();
  v_cid uuid;
begin
  if v_actor is null then
    return new;
  end if;
  v_cid := coalesce(
    (select community_id from public.prompts where id = nullif(v_row ->> 'prompt_id', '')::uuid),
    (select community_id from public.prompt_requests where id = nullif(v_row ->> 'request_id', '')::uuid),
    (select community_id from public.workflows where id = nullif(v_row ->> 'workflow_id', '')::uuid),
    (select community_id from public.presets where id = nullif(v_row ->> 'preset_id', '')::uuid),
    (select p.community_id from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = nullif(v_row ->> 'result_id', '')::uuid)
  );
  if v_cid is null then
    return new;
  end if;
  if public._group_member_role(v_cid, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.chat_groups g where g.id = v_cid and g.closed_at is not null) then
    raise exception 'community_closed';
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_likes_enforce_community_content on public.prompt_likes;
create trigger prompt_likes_enforce_community_content
  before insert on public.prompt_likes
  for each row execute function public.enforce_community_content_engagement();
drop trigger if exists prompt_comments_enforce_community_content on public.prompt_comments;
create trigger prompt_comments_enforce_community_content
  before insert on public.prompt_comments
  for each row execute function public.enforce_community_content_engagement();

-- Yorum beğenisi: yorumun bağlı olduğu topluluk içeriği için de üyelik (gönderi yorumları 178'de zaten kapsandı).
create or replace function public.enforce_community_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_post public.community_posts;
  v_post_id uuid;
  v_cid uuid;
  c record;
begin
  if v_actor is null then
    return new;
  end if;
  select community_post_id, prompt_id, request_id, workflow_id, preset_id into c from public.prompt_comments where id = new.comment_id;
  if c.community_post_id is not null then
    select * into v_post from public.community_posts where id = c.community_post_id;
    v_cid := v_post.community_id;
    if not found then
      raise exception 'forbidden';
    end if;
  else
    v_cid := coalesce(
      (select community_id from public.prompts where id = c.prompt_id),
      (select community_id from public.prompt_requests where id = c.request_id),
      (select community_id from public.workflows where id = c.workflow_id),
      (select community_id from public.presets where id = c.preset_id)
    );
  end if;
  if v_cid is null then
    return new;
  end if;
  if public._group_member_role(v_cid, v_actor) is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.chat_groups g where g.id = v_cid and g.closed_at is not null) then
    raise exception 'community_closed';
  end if;
  return new;
end;
$$;

create or replace function public.block_community_content_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.prompts where id = new.prompt_id and community_id is not null)
     or exists (select 1 from public.workflows where id = new.workflow_id and community_id is not null)
     or exists (select 1 from public.presets where id = new.preset_id and community_id is not null) then
    raise exception 'community_content_not_savable';
  end if;
  return new;
end;
$$;

drop trigger if exists collection_items_block_community_content on public.collection_items;
create trigger collection_items_block_community_content
  before insert on public.collection_items
  for each row execute function public.block_community_content_save();

-- 6) Gönderiyi kaldırmak = topluluk içeriğini silmek ----------------------------------------
create or replace function public._delete_native_community_content(p_post public.community_posts)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post.content_type = 'prompt' then
    delete from public.prompts where id = p_post.prompt_id and community_id = p_post.community_id;
  elsif p_post.content_type = 'request' then
    delete from public.prompt_requests where id = p_post.request_id and community_id = p_post.community_id;
  elsif p_post.content_type = 'workflow' then
    delete from public.workflows where id = p_post.workflow_id and community_id = p_post.community_id;
  else
    delete from public.presets where id = p_post.preset_id and community_id = p_post.community_id;
  end if;
  -- İçerik (örn. yanıtlı istek) yumuşak silindiyse ya da silinemediyse gönderi yine de kalkar.
  delete from public.community_posts where id = p_post.id;
end;
$$;
revoke all on function public._delete_native_community_content(public.community_posts) from public, anon, authenticated;

create or replace function public.delete_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  perform public._group_lock(p.community_id);
  if p.author_id <> v_actor then
    raise exception 'forbidden';
  end if;
  if p.kind = 'native' then
    perform public._delete_native_community_content(p);
  else
    delete from public.community_posts where id = p_post_id;
  end if;
end;
$$;

create or replace function public.moderate_community_post(p_post_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  p public.community_posts;
  g public.chat_groups;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into p from public.community_posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found';
  end if;
  g := public._group_lock(p.community_id);
  perform public._group_require_cap(p.community_id, v_actor, 'moderate_posts');
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'invalid_reason';
  end if;
  if p.author_id <> v_actor
     and public._community_member_rank(p.community_id, p.author_id) >= public._community_member_rank(p.community_id, v_actor) then
    raise exception 'forbidden';
  end if;
  if p.kind = 'native' then
    perform public._delete_native_community_content(p);
  else
    delete from public.community_posts where id = p_post_id;
  end if;
  perform public._group_audit(p.community_id, g.name, v_actor, p.author_id, 'post_removed',
    jsonb_build_object('post_id', p.id, 'content_type', p.content_type, 'kind', p.kind, 'reason', v_reason));
  if p.author_id <> v_actor then
    perform public._community_notify(
      p.author_id, v_actor, p.community_id, 'direct',
      '"' || public.truncate_preview(g.name, 60) || '" topluluğundaki paylaşımın kaldırıldı.',
      '/communities/local?id=' || p.community_id || '&tab=feed',
      'cpostrm:' || p.id
    );
  end if;
end;
$$;

-- 178'in iki adımlı RPC'si artık kullanılmaz (içerik topluluğa oluşturulurken bağlanır). Fonksiyon yerinde kalır (drop onayı gerekir), çağrılamaz.
create or replace function public.publish_native_community_post(p_group_id uuid, p_content_type text, p_content_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'invalid_content';
end;
$$;
revoke all on function public.publish_native_community_post(uuid, text, uuid) from public, anon, authenticated;

-- 7) Aramadan dışlama ---------------------------------------------------------------------------
create or replace function public.search_content(p_kind text, p_query text DEFAULT NULL::text, p_sort text DEFAULT 'relevant'::text, p_author_ids uuid[] DEFAULT NULL::uuid[], p_content_types text[] DEFAULT NULL::text[], p_content_type text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_tag_slugs text[] DEFAULT NULL::text[], p_tool_refs text[] DEFAULT NULL::text[], p_limit integer DEFAULT 40, p_after_rank bigint DEFAULT NULL::bigint, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, sort_rank bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select least(greatest(coalesce(p_limit, 40), 1), 50) as lim,
           case
             when nullif(btrim(p_query), '') is null then null
             else '%' || replace(replace(replace(left(btrim(p_query), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as pat,
           (p_sort = 'oldest') as asc_order,
           (p_sort = 'popular') as popular,
           (p_sort in ('new', 'oldest')) as by_date,
           coalesce(cardinality(p_author_ids), 0) as n_authors,
           coalesce(cardinality(p_content_types), 0) as n_types,
           coalesce(cardinality(p_tag_slugs), 0) as n_tags,
           coalesce(cardinality(p_tool_refs), 0) as n_tools
  ),
  prompt_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where p_kind = 'prompt'
      and x.status = 'published' and x.deleted_at is null and x.community_id is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat or x.prompt_text ilike pr.pat)
      and (pr.n_authors = 0 or x.author_id = any (p_author_ids))
      and (pr.n_types = 0 or x.content_type = any (p_content_types))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.prompt_tags t where t.prompt_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  ),
  request_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where p_kind = 'request'
      and not x.is_draft and x.deleted_at is null and x.community_id is null
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat or x.creative_direction ilike pr.pat)
      and (pr.n_authors = 0 or x.author_id = any (p_author_ids))
      and (pr.n_types = 0 or x.content_type = any (p_content_types))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.prompt_request_tags t where t.request_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  ),
  workflow_part as (
    select x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where p_kind = 'workflow'
      and x.status = 'published' and x.community_id is null
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat)
      and (pr.n_authors = 0 or x.creator_id = any (p_author_ids))
      -- a workflow chains several types: a type filter matches when it chains that type
      and ((pr.n_types = 0 and p_content_type is null)
           or x.content_types && (coalesce(p_content_types, '{}'::text[]) || coalesce(array[p_content_type], '{}'::text[])))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.workflow_tags t where t.workflow_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  ),
  preset_part as (
    -- presets keep their previous default: everything but an explicit "new"/"oldest" ranks by like_count
    select x.id, x.created_at,
           (case when pr.by_date then 0 else x.like_count end)::bigint as sort_rank
    from public.presets x, params pr
    where p_kind = 'preset'
      and x.status = 'published' and x.visibility = 'public'
      and (pr.pat is null or x.title ilike pr.pat or x.description ilike pr.pat)
      and (pr.n_authors = 0 or x.creator_id = any (p_author_ids))
      and (pr.n_types = 0 or x.content_type = any (p_content_types))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (pr.n_tags = 0 or not exists (
            select 1 from unnest(p_tag_slugs) s
            where not exists (select 1 from public.preset_tags t where t.preset_id = x.id and t.tag_slug = s)))
      and (pr.n_tools = 0 or x.tools && p_tool_refs)
      and (p_after_id is null
           or case when pr.asc_order
                then (x.created_at, x.id) > (p_after_created_at, p_after_id)
                else ((case when pr.by_date then 0 else x.like_count end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 3 desc,
             case when pr.asc_order then x.created_at end asc, case when pr.asc_order then x.id end asc,
             case when not pr.asc_order then x.created_at end desc, case when not pr.asc_order then x.id end desc
    limit (select lim from params)
  )
  select u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.asc_order then u.created_at end asc, case when pr.asc_order then u.id end asc,
           case when not pr.asc_order then u.created_at end desc, case when not pr.asc_order then u.id end desc
  limit (select lim from params);
$function$;

revoke all on function public.enforce_community_content() from public, anon, authenticated;
revoke all on function public.create_community_content_post() from public, anon, authenticated;
revoke all on function public.enforce_community_content_engagement() from public, anon, authenticated;
revoke all on function public.block_community_content_save() from public, anon, authenticated;
