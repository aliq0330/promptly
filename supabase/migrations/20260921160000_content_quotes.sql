-- Alıntıla (docs/history/217-*): bir içeriği (Prompt, İstek, Workflow, Hazır ayar, Space) NORMAL akışta not + içerik kartıyla gönderi olarak paylaşmak.
--
-- Kullanıcının kararları (217): topluluktaki "duyur" mantığı topluluğa bağlı olmadan da çalışsın; adı "alıntıla" olsun. Alıntı akışta, Keşfet'te,
-- aramada ve profildeki "Alıntılar" sekmesinde normal gönderi gibi görünür; kendi beğeni/yorum/istatistiği/bildirimi vardır, alıntılanan içeriğin
-- sayaçları etkilenmez.
--
-- Tasarım kararı: `community_posts` GENİŞLETİLMEDİ (orada `community_id` zorunlu; okuma kuralları, benzersiz dizinler, görülmemiş sayaçları, sabitleme ve
-- topluluk ana sayfası sorguları topluluğa bağlı — 100'lerce SQL kontrolü var). Topluluktaki "başvuru gönderisi" olduğu gibi kalır (yalnız arayüz adı
-- "alıntıla" olur); normal akış için yeni bir tablo kurulur: `content_quotes`. Kalıp 213/215'ten (Space gönderisi) alındı.
--
--   1) `content_quotes`: alıntılayan + hedef (tam biri dolu) + not (≤500) + korumalı `like_count` / `comment_count`. Okuma: hedef halka açık
--      (yayında + herkese açık + topluluğa ait değil; Space için `can_read_space`) ve alıntılayanla engel yok → hedef silinir/gizlenirse alıntı da düşer.
--      Yazma YALNIZ `create_quote` RPC'si (kurallar tek yerde): oturum, yayında + herkese açık içerik, topluluğa ait içerik alınmaz, engel yok,
--      aynı içerik günde bir kez, günde en çok 30 alıntı. Alıntıyı yalnız sahibi siler (RLS).
--   2) Orijinallerde korumalı `quote_count` ("N kez alıntılandı"; prompts, prompt_requests, workflows, presets, spaces).
--   3) `prompt_likes` / `prompt_comments`: sekizinci hedef `quote_id` (178'deki `community_post_id`, 215'teki `space_id` ile aynı kalıp). Sayaç tetikleyicileri,
--      bildirimler (alıntılandı, beğeni, yorum, yanıt, yorum beğenisi, @bahsetme), istatistik (`content_engagers`) ve şikâyet (`reports` hedef türü `quote`;
--      kaldırma = alıntıyı siler, içerik silinmez) alıntıyı tanır.
--   4) `feed_page` (aynı 13 argümanlı imza, `create or replace`) alıntıyı da döndürür: kind='quote', zaman = alıntı anı, popülerlik = beğeni. Etiket/kategori/
--      araç/tür süzgeci olan çağrılara ve "etiketlerim" kapsamına alıntı girmez (Space'teki kural). "Sana özel" değişmedi.
--      `quote_feed_cards`, `profile_quotes_page`, `profile_quote_count`, `search_quotes` (hepsi INVOKER: okunamayan alıntı hiç dönmez).
--
-- `drop` içeren satırlar YALNIZCA CHECK kısıtlarının yeni hedefi kapsayacak biçimde yeniden tanımlanmasıdır (215'teki gibi; veri silinmez, kullanıcı onayı
-- canlıya uygulamadan önce ayrıca alınır): `prompt_likes_exactly_one_target`, `prompt_comments_exactly_one_target`, `reports_target_type_check`,
-- `notifications_type_check` (yeni tür `quote`). Tablo/sütun/veri silinmez. Önce migration, sonra istemci.

-- ============================================================================
-- 1) Yardımcılar: hedef bilgisi, görünürlük, başlık, adres
-- ============================================================================
-- Hedefin sahibi + alıntılanabilir mi (yayında + herkese açık + topluluğa ait DEĞİL; Space: herkese açık + arşivsiz). SECURITY DEFINER: varlığı sızdırmaz.
create or replace function public._quote_content_info(p_type text, p_id uuid)
returns table (owner_id uuid, shareable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'prompt' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null)
      from public.prompts x where x.id = p_id;
  elsif p_type = 'request' then
    return query select x.author_id, (not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null)
      from public.prompt_requests x where x.id = p_id;
  elsif p_type = 'workflow' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public' and x.community_id is null)
      from public.workflows x where x.id = p_id;
  elsif p_type = 'preset' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public' and x.community_id is null)
      from public.presets x where x.id = p_id;
  elsif p_type = 'space' then
    return query select x.owner_id, (x.visibility = 'public' and x.archived_at is null)
      from public.spaces x where x.id = p_id;
  end if;
end;
$$;

-- Alıntının hedefi şu an herkese açık mı (okuma politikası + etkileşim kuralları bunu çağırır). Space için ayrıca çağıranın okuyabilmesi (engel iki yönlü).
create or replace function public.quote_target_ok(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select i.shareable from public._quote_content_info(p_type, p_id) i), false)
         and (p_type <> 'space' or public.can_read_space(p_id));
$$;

create or replace function public._quote_target_title(p_type text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(case p_type
    when 'prompt' then (select title from public.prompts where id = p_id)
    when 'request' then (select title from public.prompt_requests where id = p_id)
    when 'workflow' then (select title from public.workflows where id = p_id)
    when 'preset' then (select title from public.presets where id = p_id)
    when 'space' then (select title from public.spaces where id = p_id)
  end, '');
$$;

create or replace function public._quote_href(p_quote_id uuid, p_highlight text default null)
returns text
language sql
immutable
set search_path = public
as $$
  select '/quotes/local?id=' || p_quote_id || case when p_highlight is null then '' else '&hl=' || p_highlight end;
$$;

revoke all on function public._quote_content_info(text, uuid) from public, anon, authenticated;
revoke all on function public._quote_target_title(text, uuid) from public, anon, authenticated;
revoke all on function public._quote_href(uuid, text) from public, anon, authenticated;
revoke all on function public.quote_target_ok(text, uuid) from public;
grant execute on function public.quote_target_ok(text, uuid) to anon, authenticated;

-- ============================================================================
-- 2) content_quotes
-- ============================================================================
create table public.content_quotes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null,
  prompt_id uuid references public.prompts (id) on delete cascade,
  request_id uuid references public.prompt_requests (id) on delete cascade,
  workflow_id uuid references public.workflows (id) on delete cascade,
  preset_id uuid references public.presets (id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  target_id uuid generated always as (coalesce(prompt_id, request_id, workflow_id, preset_id, space_id)) stored,
  note text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint content_quotes_type_check check (content_type in ('prompt', 'request', 'workflow', 'preset', 'space')),
  constraint content_quotes_exactly_one_target check (
    (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer
    + (preset_id is not null)::integer + (space_id is not null)::integer = 1
  ),
  constraint content_quotes_type_matches_target check (
    (content_type = 'prompt' and prompt_id is not null)
    or (content_type = 'request' and request_id is not null)
    or (content_type = 'workflow' and workflow_id is not null)
    or (content_type = 'preset' and preset_id is not null)
    or (content_type = 'space' and space_id is not null)
  ),
  constraint content_quotes_note_len check (note is null or char_length(note) <= 500),
  constraint content_quotes_counts_nonneg check (like_count >= 0 and comment_count >= 0)
);

create index content_quotes_feed_idx on public.content_quotes (created_at desc, id desc);
create index content_quotes_popular_idx on public.content_quotes (like_count desc, created_at desc, id desc);
create index content_quotes_author_idx on public.content_quotes (author_id, created_at desc, id desc);
create index content_quotes_author_target_idx on public.content_quotes (author_id, content_type, target_id, created_at desc);
create index content_quotes_prompt_idx on public.content_quotes (prompt_id) where prompt_id is not null;
create index content_quotes_request_idx on public.content_quotes (request_id) where request_id is not null;
create index content_quotes_workflow_idx on public.content_quotes (workflow_id) where workflow_id is not null;
create index content_quotes_preset_idx on public.content_quotes (preset_id) where preset_id is not null;
create index content_quotes_space_idx on public.content_quotes (space_id) where space_id is not null;

alter table public.content_quotes enable row level security;

create trigger content_quotes_protect_counters
  before insert or update of like_count, comment_count on public.content_quotes
  for each row execute function public.protect_counter_columns('like_count', 'comment_count');

-- Okuma: hedef halka açık + alıntılayanla engel yok. Hedef silinir/gizlenirse alıntı kendiliğinden görünmez (satır silinmez, geri gelirse geri gelir).
create policy "Quotes are readable while their target is public" on public.content_quotes
  for select using (
    public.quote_target_ok(content_type, target_id)
    and not public.is_blocked(auth.uid(), author_id)
  );

-- Silme: yalnız alıntılayan. Yazma yolu yok (create_quote RPC'si); güncelleme yok (alıntı düzenlenmez).
create policy "Authors delete their own quotes" on public.content_quotes
  for delete using (author_id = auth.uid());

revoke all on public.content_quotes from public, anon, authenticated;
grant select on public.content_quotes to anon, authenticated;
grant delete on public.content_quotes to authenticated;

-- ============================================================================
-- 3) Orijinallerde `quote_count` ("N kez alıntılandı")
-- ============================================================================
alter table public.prompts add column if not exists quote_count integer not null default 0;
alter table public.prompt_requests add column if not exists quote_count integer not null default 0;
alter table public.workflows add column if not exists quote_count integer not null default 0;
alter table public.presets add column if not exists quote_count integer not null default 0;
alter table public.spaces add column if not exists quote_count integer not null default 0;

create trigger prompts_protect_quote_count
  before insert or update of quote_count on public.prompts
  for each row execute function public.protect_counter_columns('quote_count');
create trigger prompt_requests_protect_quote_count
  before insert or update of quote_count on public.prompt_requests
  for each row execute function public.protect_counter_columns('quote_count');
create trigger workflows_protect_quote_count
  before insert or update of quote_count on public.workflows
  for each row execute function public.protect_counter_columns('quote_count');
create trigger presets_protect_quote_count
  before insert or update of quote_count on public.presets
  for each row execute function public.protect_counter_columns('quote_count');
create trigger spaces_protect_quote_count
  before insert or update of quote_count on public.spaces
  for each row execute function public.protect_counter_columns('quote_count');

create or replace function public.handle_quote_count_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.prompt_id is not null then
      update public.prompts set quote_count = quote_count + 1 where id = new.prompt_id;
    elsif new.request_id is not null then
      update public.prompt_requests set quote_count = quote_count + 1 where id = new.request_id;
    elsif new.workflow_id is not null then
      update public.workflows set quote_count = quote_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set quote_count = quote_count + 1 where id = new.preset_id;
    elsif new.space_id is not null then
      update public.spaces set quote_count = quote_count + 1 where id = new.space_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set quote_count = greatest(quote_count - 1, 0) where id = old.prompt_id;
    elsif old.request_id is not null then
      update public.prompt_requests set quote_count = greatest(quote_count - 1, 0) where id = old.request_id;
    elsif old.workflow_id is not null then
      update public.workflows set quote_count = greatest(quote_count - 1, 0) where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set quote_count = greatest(quote_count - 1, 0) where id = old.preset_id;
    elsif old.space_id is not null then
      update public.spaces set quote_count = greatest(quote_count - 1, 0) where id = old.space_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create trigger content_quotes_count
  after insert or delete on public.content_quotes
  for each row execute function public.handle_quote_count_change();
revoke all on function public.handle_quote_count_change() from public, anon, authenticated;

-- ============================================================================
-- 4) create_quote: tek yazma yolu
-- ============================================================================
create or replace function public.create_quote(p_content_type text, p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset', 'space') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._quote_content_info(p_content_type, p_content_id);
  if not found then
    raise exception 'content_not_found';
  end if;
  if not v_info.shareable then
    -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
    if v_info.owner_id is distinct from v_actor then
      raise exception 'content_not_found';
    end if;
    raise exception 'content_not_public';
  end if;
  if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then
    raise exception 'blocked';
  end if;

  -- Aynı kişinin eşzamanlı iki isteği sınırı aşmasın.
  perform pg_advisory_xact_lock(hashtextextended('quote:' || v_actor::text, 0));
  if exists (
    select 1 from public.content_quotes q
     where q.author_id = v_actor and q.content_type = p_content_type and q.target_id = p_content_id
       and q.created_at > now() - interval '24 hours'
  ) then
    raise exception 'already_quoted';
  end if;
  if (select count(*) from public.content_quotes where author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'quote_rate_limit';
  end if;

  insert into public.content_quotes (id, author_id, content_type, prompt_id, request_id, workflow_id, preset_id, space_id, note)
  values (
    v_id, v_actor, p_content_type,
    case when p_content_type = 'prompt' then p_content_id end,
    case when p_content_type = 'request' then p_content_id end,
    case when p_content_type = 'workflow' then p_content_id end,
    case when p_content_type = 'preset' then p_content_id end,
    case when p_content_type = 'space' then p_content_id end,
    v_note
  );
  return v_id;
end;
$$;

revoke all on function public.create_quote(text, uuid, text) from public, anon;
grant execute on function public.create_quote(text, uuid, text) to authenticated;

-- ============================================================================
-- 5) prompt_likes / prompt_comments: sekizinci hedef `quote_id`
-- ============================================================================
alter table public.prompt_likes
  add column if not exists quote_id uuid references public.content_quotes (id) on delete cascade;
alter table public.prompt_comments
  add column if not exists quote_id uuid references public.content_quotes (id) on delete cascade;

alter table public.prompt_likes drop constraint prompt_likes_exactly_one_target;
alter table public.prompt_likes add constraint prompt_likes_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer
  + (space_id is not null)::integer + (quote_id is not null)::integer = 1
);
alter table public.prompt_comments drop constraint prompt_comments_exactly_one_target;
alter table public.prompt_comments add constraint prompt_comments_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (result_id is not null)::integer
  + (workflow_id is not null)::integer + (preset_id is not null)::integer + (community_post_id is not null)::integer
  + (space_id is not null)::integer + (quote_id is not null)::integer = 1
);

create unique index if not exists prompt_likes_quote_user_uidx
  on public.prompt_likes (quote_id, user_id) where quote_id is not null;
create index if not exists prompt_likes_quote_id_idx
  on public.prompt_likes (quote_id) where quote_id is not null;
create index if not exists prompt_comments_quote_id_idx
  on public.prompt_comments (quote_id, created_at) where quote_id is not null;


-- Sayaç tetikleyicileri: hedef zinciri AÇIK (son kol sessizce başka tabloya düşmez). 215'teki sürüme `quote_id` kolu eklendi.
-- Sayaçlar: hedef zinciri AÇIK (son kol sessizce başka tabloya düşmez).
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
    elsif new.result_id is not null then
      update public.prompt_results set like_count = like_count + 1 where id = new.result_id;
    elsif new.workflow_id is not null then
      update public.workflows set like_count = like_count + 1 where id = new.workflow_id;
    elsif new.preset_id is not null then
      update public.presets set like_count = like_count + 1 where id = new.preset_id;
    elsif new.community_post_id is not null then
      update public.community_posts set like_count = like_count + 1 where id = new.community_post_id;
    elsif new.space_id is not null then
      update public.spaces set like_count = like_count + 1 where id = new.space_id;
    elsif new.quote_id is not null then
      update public.content_quotes set like_count = like_count + 1 where id = new.quote_id;
    elsif new.request_id is not null then
      update public.prompt_requests set like_count = like_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.prompt_id is not null then
      update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    elsif old.result_id is not null then
      update public.prompt_results set like_count = like_count - 1 where id = old.result_id;
    elsif old.workflow_id is not null then
      update public.workflows set like_count = like_count - 1 where id = old.workflow_id;
    elsif old.preset_id is not null then
      update public.presets set like_count = like_count - 1 where id = old.preset_id;
    elsif old.community_post_id is not null then
      update public.community_posts set like_count = greatest(like_count - 1, 0) where id = old.community_post_id;
    elsif old.space_id is not null then
      update public.spaces set like_count = greatest(like_count - 1, 0) where id = old.space_id;
    elsif old.quote_id is not null then
      update public.content_quotes set like_count = greatest(like_count - 1, 0) where id = old.quote_id;
    elsif old.request_id is not null then
      update public.prompt_requests set like_count = like_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

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
      update public.spaces set comment_count = comment_count + 1 where id = new.space_id;
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
      update public.spaces set comment_count = greatest(comment_count - 1, 0) where id = old.space_id;
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

-- Yanıtlı yorumun yumuşak silinmesi, Space / topluluk gönderisi / alıntı silinirken FK basamağında devre dışı kalır: aksi hâlde satır
-- sahipsiz geride kalırdı (178'deki kural, Space'e genişledi).
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
          body = ''
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$$;


-- Okuma/yazma politikaları: alıntı hedefi, alıntının kendi RLS'ini (halka açık hedef + engel) izler.
-- Okuma: alıntı hedefi, alıntının kendi RLS'ini izler (195'teki "hedef okunabiliyorsa" kuralı).
alter policy "Likes are readable wherever their target is readable" on public.prompt_likes
  using (
    user_id = auth.uid()
    or (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_likes.prompt_id))
    or (request_id is not null and exists (select 1 from public.prompt_requests r where r.id = prompt_likes.request_id))
    or (workflow_id is not null and exists (select 1 from public.workflows w where w.id = prompt_likes.workflow_id))
    or (preset_id is not null and exists (select 1 from public.presets s where s.id = prompt_likes.preset_id))
    or (community_post_id is not null and exists (select 1 from public.community_posts c where c.id = prompt_likes.community_post_id))
    or (space_id is not null and exists (select 1 from public.spaces sp where sp.id = prompt_likes.space_id))
    or (quote_id is not null and exists (select 1 from public.content_quotes cq where cq.id = prompt_likes.quote_id))
  );

alter policy "Comments are readable wherever their target is readable" on public.prompt_comments
  using (
    ((prompt_id is not null) and exists (select 1 from public.prompts p where p.id = prompt_comments.prompt_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((request_id is not null) and exists (select 1 from public.prompt_requests r where r.id = prompt_comments.request_id))
    or ((result_id is not null) and exists (select 1 from public.prompt_results r join public.prompts p on p.id = r.prompt_id where r.id = prompt_comments.result_id and (p.status = 'published' or p.author_id = auth.uid())))
    or ((workflow_id is not null) and exists (select 1 from public.workflows w where w.id = prompt_comments.workflow_id and (w.status = 'published' or w.creator_id = auth.uid())))
    or ((preset_id is not null) and exists (select 1 from public.presets s where s.id = prompt_comments.preset_id and (s.creator_id = auth.uid() or (s.status = 'published' and (s.visibility = 'public' or s.community_id is not null)))))
    or ((community_post_id is not null) and exists (select 1 from public.community_posts cp where cp.id = prompt_comments.community_post_id))
    or ((space_id is not null) and exists (select 1 from public.spaces sp where sp.id = prompt_comments.space_id))
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
      or ((space_id is not null) and exists (select 1 from public.spaces sp where sp.id = prompt_comments.space_id))
      or ((quote_id is not null) and exists (select 1 from public.content_quotes cq where cq.id = prompt_comments.quote_id))
    )
  );


-- ============================================================================
-- 6) Etkileşim yazma kuralı + bildirimler
-- ============================================================================
-- Yazma: yalnız oturumlu; alıntının hedefi halka açık; alıntılayanla engel yok; yanıt üst yorumla AYNI alıntıda.
create or replace function public.enforce_quote_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := to_jsonb(new);
  v_quote uuid := nullif(v_row ->> 'quote_id', '')::uuid;
  v_parent uuid := nullif(v_row ->> 'parent_id', '')::uuid;
  v_parent_quote uuid;
  q public.content_quotes;
begin
  if v_parent is not null then
    select c.quote_id into v_parent_quote from public.prompt_comments c where c.id = v_parent;
    if v_parent_quote is distinct from v_quote then
      raise exception 'invalid_parent';
    end if;
  end if;
  if v_quote is null then
    return new;
  end if;
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  select * into q from public.content_quotes where id = v_quote;
  if not found or not public.quote_target_ok(q.content_type, q.target_id) then
    raise exception 'quote_not_found';
  end if;
  if q.author_id <> v_actor and public.is_blocked(v_actor, q.author_id) then
    raise exception 'quote_not_found';
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_likes_enforce_quote on public.prompt_likes;
create trigger prompt_likes_enforce_quote
  before insert on public.prompt_likes
  for each row execute function public.enforce_quote_engagement();

drop trigger if exists prompt_comments_enforce_quote on public.prompt_comments;
create trigger prompt_comments_enforce_quote
  before insert on public.prompt_comments
  for each row execute function public.enforce_quote_engagement();

revoke all on function public.enforce_quote_engagement() from public, anon, authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow', 'like', 'comment', 'comment_reply', 'request_response', 'message', 'message_request', 'system',
  'prompt_edited', 'request_edited', 'edit_suggestion_received', 'edit_suggestion_accepted',
  'edit_suggestion_rejected', 'prompt_result_shared',
  'story_reaction', 'story_poll_vote', 'story_question_answer', 'quote'));

-- İçerik sahibine: "içeriğini alıntıladı" (kendi içeriğini alıntılayan ve engelli olanlar için yok).
create or replace function public.notify_quote_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select i.owner_id into v_owner from public._quote_content_info(new.content_type, new.target_id) i;
  if v_owner is null or v_owner = new.author_id or public.is_blocked(v_owner, new.author_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_owner, new.author_id, 'quote',
    'İçeriğini alıntıladı: "' || public.truncate_preview(public._quote_target_title(new.content_type, new.target_id)) || '"',
    public._quote_href(new.id),
    'quote:' || new.id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists content_quotes_after_insert_notify on public.content_quotes;
create trigger content_quotes_after_insert_notify
  after insert on public.content_quotes
  for each row execute function public.notify_quote_created();

-- Alıntı silinince ona giden bildirimler de gider.
create or replace function public.cleanup_quote_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/quotes/local?id=' || old.id || '%';
  return old;
end;
$$;

drop trigger if exists content_quotes_cleanup_notifications on public.content_quotes;
create trigger content_quotes_cleanup_notifications
  before delete on public.content_quotes
  for each row execute function public.cleanup_quote_notifications();

create or replace function public.notify_quote_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.content_quotes;
begin
  select * into q from public.content_quotes where id = new.quote_id;
  if not found or q.author_id = new.user_id or public.is_blocked(q.author_id, new.user_id) then
    return new;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    q.author_id, new.user_id, 'like',
    'Alıntını beğendi: "' || public.truncate_preview(coalesce(q.note, public._quote_target_title(q.content_type, q.target_id))) || '"',
    public._quote_href(q.id),
    'quote_like:' || q.id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

create or replace function public.cleanup_quote_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where dedupe_key = 'quote_like:' || old.quote_id || ':' || old.user_id;
  return old;
end;
$$;

drop trigger if exists prompt_likes_after_insert_notify_quote on public.prompt_likes;
create trigger prompt_likes_after_insert_notify_quote
  after insert on public.prompt_likes
  for each row when (new.quote_id is not null) execute function public.notify_quote_like();

drop trigger if exists prompt_likes_after_delete_cleanup_quote on public.prompt_likes;
create trigger prompt_likes_after_delete_cleanup_quote
  after delete on public.prompt_likes
  for each row when (old.quote_id is not null) execute function public.cleanup_quote_like_notification();

-- Alıntı yorumu → alıntılayana; yanıt → üst yorumun yazarına.
create or replace function public.notify_quote_comment()
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
  v_href := public._quote_href(new.quote_id, 'comment:' || new.id);
  if new.parent_id is not null then
    select author_id into v_parent_author from public.prompt_comments where id = new.parent_id;
    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href);
  else
    select author_id into v_owner from public.content_quotes where id = new.quote_id;
    if v_owner is null or v_owner = new.author_id then
      return new;
    end if;
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_owner, new.author_id, 'comment', 'Alıntına yorum yaptı: "' || public.truncate_preview(new.body) || '"', v_href);
  end if;
  return new;
end;
$$;

drop trigger if exists prompt_comments_after_insert_notify_quote on public.prompt_comments;
create trigger prompt_comments_after_insert_notify_quote
  after insert on public.prompt_comments
  for each row when (new.quote_id is not null) execute function public.notify_quote_comment();

revoke all on function public.notify_quote_created() from public, anon, authenticated;
revoke all on function public.cleanup_quote_notifications() from public, anon, authenticated;
revoke all on function public.notify_quote_like() from public, anon, authenticated;
revoke all on function public.cleanup_quote_like_notification() from public, anon, authenticated;
revoke all on function public.notify_quote_comment() from public, anon, authenticated;


-- Genel yorum / yorum beğenisi / @bahsetme bildirimleri alıntıyı tanır (aksi hâlde adressiz bildirim üretirdi).
-- Genel yorum bildirimi: Space ve alıntı yorumları kendi fonksiyonuna bırakılır (yoksa "istek" koluna düşüp adressiz bildirim üretirdi).
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
  v_post public.community_posts;
begin
  if new.workflow_id is not null or new.preset_id is not null or new.space_id is not null or new.quote_id is not null then
    return new;
  end if;

  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    if not found then
      return new;
    end if;
    v_href := public._community_post_href(v_post.id, v_post.community_id, 'comment:' || new.id);
  else
    v_href := (case
      when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
      when new.result_id is not null then '/results/local?id=' || new.result_id
      else '/requests/local?id=' || new.request_id
    end) || '&hl=comment:' || new.id;
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;
    if v_post.id is not null and public._group_member_role(v_post.community_id, v_parent_author) is null then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_parent_author, new.author_id, 'comment_reply',
      'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href
    );
  else
    if new.community_post_id is not null then
      v_post_author := v_post.author_id;
      if public._group_member_role(v_post.community_id, v_post_author) is null then
        return new;
      end if;
    elsif new.prompt_id is not null then
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
        when new.prompt_id is not null or new.community_post_id is not null then 'Paylaşımına yorum yaptı: "'
        when new.result_id is not null then 'Sonucuna yorum yaptı: "'
        else 'İsteğine yorum yaptı: "'
      end) || public.truncate_preview(new.body) || '"',
      v_href
    );
  end if;

  return new;
end;
$$;

-- Yorum beğenisi → yorum yazarı (Space yorumunun adresi Space sayfası).
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
  v_result_id uuid;
  v_workflow_id uuid;
  v_preset_id uuid;
  v_post_id uuid;
  v_space_id uuid;
  v_quote_id uuid;
  v_community_id uuid;
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, result_id, workflow_id, preset_id, community_post_id, space_id, quote_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_result_id, v_workflow_id, v_preset_id, v_post_id, v_space_id, v_quote_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  if v_post_id is not null then
    select community_id into v_community_id from public.community_posts where id = v_post_id;
    if v_community_id is null or public._group_member_role(v_community_id, v_comment_author) is null then
      return new;
    end if;
    v_href := public._community_post_href(v_post_id, v_community_id, 'comment:' || new.comment_id);
  elsif v_space_id is not null then
    v_href := public._space_href(v_space_id, 'comment:' || new.comment_id);
  elsif v_quote_id is not null then
    v_href := public._quote_href(v_quote_id, 'comment:' || new.comment_id);
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

-- @bahsetme: alıntı yorumunda yalnız hedef halka açıksa; Space yorumunda yalnız Space akışta paylaşılmış + herkese açıksa anılan kişiye bildirim gider.
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
  v_post public.community_posts;
  v_public_community boolean := false;
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

  if new.community_post_id is not null then
    select * into v_post from public.community_posts where id = new.community_post_id;
    v_visible := found;
    v_post_author := v_post.author_id;
    v_public_community := exists (select 1 from public.chat_groups g where g.id = v_post.community_id and g.visibility = 'public');
    v_href := public._community_post_href(v_post.id, v_post.community_id);
  elsif new.space_id is not null then
    select (visibility = 'public' and archived_at is null and shared_at is not null), owner_id
      into v_visible, v_post_author from public.spaces where id = new.space_id;
    v_href := public._space_href(new.space_id);
  elsif new.quote_id is not null then
    select public.quote_target_ok(q.content_type, q.target_id), q.author_id
      into v_visible, v_post_author from public.content_quotes q where q.id = new.quote_id;
    v_href := public._quote_href(new.quote_id);
  elsif new.prompt_id is not null then
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
      and (
        new.community_post_id is null
        or v_public_community
        or public._group_member_role(v_post.community_id, p.id) is not null
      )
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


-- ============================================================================
-- 7) İstatistik (Beğenenler / Yorum yapanlar): içerik türü `quote`
-- ============================================================================
create or replace function public._engager_content_visible(p_content_type text, p_content_id uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and ((p.community_id is null and p.status = 'published' and p.visibility = 'public')
             or p.author_id = auth.uid()
             or (p.community_id is not null and p.status = 'published' and public.can_read_community(p.community_id))))
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and ((r.community_id is null and not r.is_draft and r.visibility = 'public')
             or r.author_id = auth.uid()
             or (r.community_id is not null and not r.is_draft and public.can_read_community(r.community_id))))
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid()
             or (w.community_id is null and w.status = 'published' and w.visibility = 'public')
             or (w.community_id is not null and w.status = 'published' and public.can_read_community(w.community_id))))
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id
        and (s.creator_id = auth.uid()
             or (s.community_id is null and s.status = 'published' and s.visibility = 'public')
             or (s.community_id is not null and s.status = 'published' and public.can_read_community(s.community_id))))
    when 'community_post' then exists (
      select 1 from public.community_posts cp
      where cp.id = p_content_id and public.can_read_community(cp.community_id))
    when 'space' then public.can_read_space(p_content_id)
    when 'quote' then exists (
      select 1 from public.content_quotes q
      where q.id = p_content_id and public.quote_target_ok(q.content_type, q.target_id)
        and not public.is_blocked(auth.uid(), q.author_id))
    else false
  end;
$$;

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
    when 'space' then 'space_id'
    when 'quote' then 'quote_id'
    else null
  end;
  if v_col is null then
    raise exception 'invalid content type';
  end if;

  if not public._engager_content_visible(p_content_type, p_content_id) then
    return;
  end if;
  -- İstek, Space ve alıntı kaydedilemez (koleksiyon hedefi değiller).
  if p_kind = 'saves' and p_content_type in ('request', 'space', 'quote') then
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


-- ============================================================================
-- 8) Şikâyet: hedef türü `quote` (kaldırma = alıntıyı siler; alıntılanan içerik silinmez)
-- ============================================================================
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('prompt', 'comment', 'request', 'user', 'message', 'workflow', 'preset', 'story', 'space', 'quote'));

create or replace function public.moderate_report(p_report_id uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  if p_action not in ('dismissed', 'reviewed', 'removed') then raise exception 'Geçersiz işlem.'; end if;
  select * into r from public.reports where id = p_report_id;
  if not found then raise exception 'Şikâyet bulunamadı.'; end if;
  if p_action = 'removed' then
    if r.target_type = 'prompt' then delete from public.prompts where id = r.target_id;
    elsif r.target_type = 'request' then delete from public.prompt_requests where id = r.target_id;
    elsif r.target_type = 'workflow' then delete from public.workflows where id = r.target_id;
    elsif r.target_type = 'preset' then delete from public.presets where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    elsif r.target_type = 'story' then
      update public.stories set moderation_status = 'removed', moderated_at = now(), moderated_by = auth.uid()
        where id = r.target_id;
    elsif r.target_type = 'space' then
      update public.spaces set visibility = 'private', shared_at = null where id = r.target_id;
    elsif r.target_type = 'quote' then
      delete from public.content_quotes where id = r.target_id;
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
end $function$;

create or replace function public.moderation_report_queue(p_status text default 'open')
 returns table(id uuid, status text, reason text, created_at timestamp with time zone, reviewed_at timestamp with time zone, resolution_note text, target_type text, target_id uuid, reporter_id uuid, reporter_username text, target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text)
 language plpgsql stable security definer set search_path to 'public' as $function$
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
    union all
    select true, left(coalesce(st.layout -> 'layers' -> 0 ->> 'text', st.sticker_question, st.kind), 300), st.author_id, '/stories?id=' || st.id
      from public.stories st where r.target_type = 'story' and st.id = r.target_id
    union all
    select true, sp.title, sp.owner_id, '/spaces/local?id=' || sp.id
      from public.spaces sp where r.target_type = 'space' and sp.id = r.target_id
    union all
    select true, left(coalesce(qq.note, public._quote_target_title(qq.content_type, qq.target_id)), 300), qq.author_id, '/quotes/local?id=' || qq.id
      from public.content_quotes qq where r.target_type = 'quote' and qq.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $function$;


-- ============================================================================
-- 8b) Akış: `feed_page` alıntıyı da döndürür (aynı 13 argümanlı imza; sarmalayıcılar bu biçimi çağırır)
-- ============================================================================
create or replace function public.feed_page(
  p_scope text,
  p_order text,
  p_kinds text[],
  p_content_type text,
  p_category text,
  p_subcategory text,
  p_limit integer,
  p_after_rank bigint,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_open_only boolean,
  p_tag text,
  p_tool text
)
returns table (kind text, id uuid, created_at timestamptz, sort_rank bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
           (p_order = 'used') as used,
           (p_scope = 'following') as following,
           (p_scope = 'tags') as tagged
  ),
  followed as (
    select f.following_id as author_id
    from public.follows f
    where f.follower_id = auth.uid()
  ),
  followed_tags as (
    select t.tag_slug
    from public.tag_follows t
    where t.user_id = auth.uid()
  ),
  prompt_part as (
    select 'prompt'::text as kind, x.id, x.created_at,
           (case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompts x, params pr
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (p_kinds is null or 'prompt' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.used then x.copy_count when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.prompt_requests x, params pr
    where not x.is_draft and x.visibility = 'public' and x.deleted_at is null
      and (p_kinds is null or 'request' = any (p_kinds))
      and (not pr.following or x.author_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (not coalesce(p_open_only, false) or x.status = 'open')
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.workflows x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'workflow' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or p_content_type = any (x.content_types))
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.presets x, params pr
    where x.status = 'published' and x.visibility = 'public'
      and (p_kinds is null or 'preset' = any (p_kinds))
      and (not pr.following or x.creator_id in (select author_id from followed))
      and (not pr.tagged or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select ft.tag_slug from followed_tags ft)))
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tag is null or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = p_tag))
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
      and x.community_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  -- Space: akışta paylaşılmış (`shared_at`) + herkese açık + arşivsiz. Okuma RLS'i (`can_read_space`: engel iki yönlü) ayrıca uygulanır.
  -- Space'in etiketi/kategorisi/aracı/içerik türü yoktur: bu süzgeçlerden biri verilmişse ya da kapsam "etiketlerim"se Space girmez.
  space_part as (
    select 'space'::text as kind, x.id, x.shared_at as created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.spaces x, params pr
    where x.shared_at is not null and x.visibility = 'public' and x.archived_at is null
      and (p_kinds is null or 'space' = any (p_kinds))
      and not pr.tagged
      and (not pr.following or x.owner_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.shared_at end asc, case when pr.oldest then x.id end asc,
             x.shared_at desc, x.id desc
    limit (select lim from params)
  ),
  -- Alıntı: akışta gönderi olarak. Okuma RLS'i (`content_quotes`) hedefin halka açıklığını ve engeli ayrıca uygular.
  -- Alıntının etiketi/kategorisi/aracı/içerik türü yoktur: bu süzgeçlerden biri verilmişse ya da kapsam "etiketlerim"se alıntı girmez (Space'teki kural).
  quote_part as (
    select 'quote'::text as kind, x.id, x.created_at,
           (case when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.content_quotes x, params pr
    where (p_kinds is null or 'quote' = any (p_kinds))
      and not pr.tagged
      and (not pr.following or x.author_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  )
  select u.kind, u.id, u.created_at, u.sort_rank
  from (
    select * from prompt_part
    union all select * from request_part
    union all select * from workflow_part
    union all select * from preset_part
    union all select * from space_part
    union all select * from quote_part
  ) u, params pr
  order by u.sort_rank desc,
           case when pr.oldest then u.created_at end asc, case when pr.oldest then u.id end asc,
           u.created_at desc, u.id desc
  limit (select lim from params);
$$;


-- ============================================================================
-- 9) Akış kartı + profil + arama (hepsi INVOKER: okunamayan alıntı hiç dönmez)
-- ============================================================================
-- Alıntı kartı: alıntı + alıntılayan profili + "ben beğendim mi". Alıntılanan içeriğin kartı istemcide mevcut hydrate yoluyla (content_type + target_id) alınır.
create or replace function public.quote_feed_cards(p_ids uuid[])
returns table (
  id uuid, author_id uuid, author_username text, author_display_name text, author_avatar_url text,
  content_type text, target_id uuid, note text, like_count integer, comment_count integer,
  created_at timestamptz, is_liked boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select q.id, q.author_id, p.username, p.display_name, p.avatar_url,
         q.content_type, q.target_id, q.note, q.like_count, q.comment_count,
         q.created_at,
         exists (select 1 from public.prompt_likes l where l.quote_id = q.id and l.user_id = auth.uid())
    from public.content_quotes q
    left join public.profiles p on p.id = q.author_id
   where q.id = any (coalesce(p_ids, '{}'::uuid[]))
   limit 100;
$$;

-- Profildeki "Alıntılar" sekmesi: kişinin alıntıları (keyset), yalnız okunabilenler.
create or replace function public.profile_quotes_page(p_author uuid, p_limit integer default 24, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select q.id, q.created_at
    from public.content_quotes q
   where q.author_id = p_author
     and (p_after_id is null or (q.created_at, q.id) < (p_after_created_at, p_after_id))
   order by q.created_at desc, q.id desc
   limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

create or replace function public.profile_quote_count(p_author uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer from public.content_quotes q where q.author_id = p_author;
$$;

-- Arama: alıntının notu ya da alıntılanan içeriğin başlığı eşleşir (keyset, en yeni önce).
create or replace function public.search_quotes(p_query text, p_limit integer default 24, p_after_created_at timestamptz default null, p_after_id uuid default null)
returns table (id uuid, created_at timestamptz)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_pat text;
begin
  if char_length(btrim(coalesce(p_query, ''))) < 2 then
    return;
  end if;
  v_pat := '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select q.id, q.created_at
      from public.content_quotes q
     where (q.note ilike v_pat
            or case q.content_type
                 when 'prompt' then exists (select 1 from public.prompts t where t.id = q.prompt_id and t.title ilike v_pat)
                 when 'request' then exists (select 1 from public.prompt_requests t where t.id = q.request_id and t.title ilike v_pat)
                 when 'workflow' then exists (select 1 from public.workflows t where t.id = q.workflow_id and t.title ilike v_pat)
                 when 'preset' then exists (select 1 from public.presets t where t.id = q.preset_id and t.title ilike v_pat)
                 when 'space' then exists (select 1 from public.spaces t where t.id = q.space_id and t.title ilike v_pat)
                 else false
               end)
       and (p_after_id is null or (q.created_at, q.id) < (p_after_created_at, p_after_id))
     order by q.created_at desc, q.id desc
     limit least(greatest(coalesce(p_limit, 24), 1), 50);
end;
$$;

revoke execute on function public.quote_feed_cards(uuid[]) from public;
revoke execute on function public.profile_quotes_page(uuid, integer, timestamptz, uuid) from public;
revoke execute on function public.profile_quote_count(uuid) from public;
revoke execute on function public.search_quotes(text, integer, timestamptz, uuid) from public;
grant execute on function public.quote_feed_cards(uuid[]) to anon, authenticated;
grant execute on function public.profile_quotes_page(uuid, integer, timestamptz, uuid) to anon, authenticated;
grant execute on function public.profile_quote_count(uuid) to anon, authenticated;
grant execute on function public.search_quotes(text, integer, timestamptz, uuid) to anon, authenticated;
