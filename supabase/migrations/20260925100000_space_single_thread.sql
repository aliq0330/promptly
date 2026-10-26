-- Space'in tek etkileşim hattı = alıntı (docs/history/241-*): Space'in kendi gönderisi / beğenisi / yorumu KALKAR; akışta görünmek,
-- sahibinin KENDİ alıntısıdır; başkasının Space'i alıntılaması da aynı mekanizmadır (diğer dört türle birebir aynı).
--
-- Kullanıcının kararı (241): "C'yi uygula; her şeyiyle alıntı diğer türlerdeki gibi olsun, içerikte Space'in önizlemesi görünsün."
--
--   1) `create_quote` (aynı imza, `create or replace`): Space alıntısı artık eskiden akışa girişin şartı olan eşiği de ister (en az 3 öğe + 1 görsel,
--      `space_too_empty`) — boş bir Space ne sahibi ne başkası tarafından akışa taşınamaz; sahibi kendi Space'ini yalnız BİR kez paylaşabilir
--      (`already_quoted`; kaldırınca yeniden paylaşabilir). Okuma kuralı (`quote_target_ok`) DEĞİŞMEDİ: mevcut alıntılar eşik yüzünden kaybolmaz.
--   2) `set_space_shared` (aynı imza): eski istemciler için ince sarmalayıcı — `true` = sahibin kendi alıntısını yaratır, `false` = siler.
--      `spaces.shared_at` artık hiçbir yolla yazılmaz.
--   3) Veri geçişi (tekrar çalıştırılabilir): akışta paylaşılmış her Space için sahibin alıntısı, paylaşım anıyla yaratılır; Space'in beğeni ve yorumları
--      (`prompt_likes.space_id` / `prompt_comments.space_id`) o alıntıya taşınır, alıntının sayaçları yeniden hesaplanır; sonra `shared_at`, `like_count`,
--      `comment_count` boşaltılır → `feed_page` Space döndürmez (fonksiyonu DEĞİŞTİRMEDEN: `shared_at is not null` koşulu hiçbir satırı bulmaz).
--   4) `enforce_space_engagement` (aynı imza): `space_id`'li yeni beğeni/yorum REDDEDİLİR (`space_engagement_closed`). Topluluk başvurusunun
--      (`community_posts.space_id`) beğeni/yorumu etkilenmez: o `community_post_id`'ye gider.
--
-- `drop` YOK (expand → contract, CLAUDE.md Bölüm 8.11). Artık kullanılmayan, ayrı bir sonraki migration'da (kullanıcı onayıyla) silinecekler:
-- `spaces.shared_at/like_count/comment_count`, `prompt_likes.space_id`, `prompt_comments.space_id` (+ CHECK'lerdeki kolları), Space bildirim/istatistik
-- tetikleyicileri, `feed_page`'in Space kolu, `space_feed_cards`'ın shared_at/like_count/comment_count sütunları, `spaces_guard_shared`.
-- Önce migration, sonra istemci (yeni istemci Space için beğeni/yorum çağırmaz).

-- ============================================================================
-- 1) create_quote: Space eşiği + sahibin tek paylaşımı
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
  v_items integer;
  v_images integer;
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

  -- Space: eskiden "akışa çıkış" eşiği (boş Space akışı doldurmasın) artık HER alıntının şartı.
  if p_content_type = 'space' then
    select count(*), count(*) filter (where i.kind = 'image') into v_items, v_images
      from public.space_items i where i.space_id = p_content_id;
    if v_items < 3 or v_images < 1 then
      raise exception 'space_too_empty';
    end if;
  end if;

  -- Aynı kişinin eşzamanlı iki isteği sınırı aşmasın.
  perform pg_advisory_xact_lock(hashtextextended('quote:' || v_actor::text, 0));
  if exists (
    select 1 from public.content_quotes q
     where q.author_id = v_actor and q.content_type = p_content_type and q.target_id = p_content_id
       and (q.created_at > now() - interval '24 hours'
            -- Sahibin kendi Space'ini akışta paylaşması = tek kayıt; kaldırmadan ikinci paylaşım olmaz.
            or (p_content_type = 'space' and v_info.owner_id = v_actor))
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
-- 2) set_space_shared: eski istemciler için sarmalayıcı (akışta paylaşım = sahibin alıntısı)
-- ============================================================================
create or replace function public.set_space_shared(p_space_id uuid, p_shared boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_at timestamptz;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.spaces where id = p_space_id) or not public.can_read_space(p_space_id) then
    raise exception 'space_not_found';
  end if;
  select m.role into v_role from public.space_members m where m.space_id = p_space_id and m.user_id = v_actor;
  if v_role is distinct from 'owner' then
    raise exception 'space_forbidden';
  end if;

  if not coalesce(p_shared, false) then
    delete from public.content_quotes where author_id = v_actor and space_id = p_space_id;
    return null;
  end if;

  select q.created_at into v_at from public.content_quotes q where q.author_id = v_actor and q.space_id = p_space_id order by q.created_at limit 1;
  if v_at is null then
    perform public.create_quote('space', p_space_id, null);
    select q.created_at into v_at from public.content_quotes q where q.author_id = v_actor and q.space_id = p_space_id order by q.created_at limit 1;
  end if;
  return v_at;
end;
$$;

revoke all on function public.set_space_shared(uuid, boolean) from public, anon;
grant execute on function public.set_space_shared(uuid, boolean) to authenticated;

-- ============================================================================
-- 3) Veri geçişi: akışta paylaşılmış Space → sahibin alıntısı; beğeni/yorum taşınır
-- ============================================================================
do $$
declare
  s record;
  v_quote uuid;
begin
  for s in select id, owner_id, shared_at from public.spaces where shared_at is not null loop
    select q.id into v_quote from public.content_quotes q where q.author_id = s.owner_id and q.space_id = s.id order by q.created_at limit 1;
    if v_quote is null then
      insert into public.content_quotes (author_id, content_type, space_id, created_at)
      values (s.owner_id, 'space', s.id, s.shared_at)
      returning id into v_quote;
    end if;
    -- Aynı kişi hem Space'i hem sahibin mevcut alıntısını beğenmişse tek beğeni kalır (alıntıdakini koru).
    delete from public.prompt_likes l
     where l.space_id = s.id
       and exists (select 1 from public.prompt_likes x where x.quote_id = v_quote and x.user_id = l.user_id);
    update public.prompt_likes set quote_id = v_quote, space_id = null where space_id = s.id;
    update public.prompt_comments set quote_id = v_quote, space_id = null where space_id = s.id;
    update public.content_quotes q
       set like_count = (select count(*) from public.prompt_likes where quote_id = v_quote),
           comment_count = (select count(*) from public.prompt_comments where quote_id = v_quote)
     where q.id = v_quote;
  end loop;

  -- Space'in kendi gönderi alanları boşalır: `feed_page` artık Space döndürmez, sayaçlar sıfırdır.
  update public.spaces set shared_at = null, like_count = 0, comment_count = 0
   where shared_at is not null or like_count <> 0 or comment_count <> 0;
end;
$$;

-- ============================================================================
-- 4) Space'e yeni beğeni / yorum yazılamaz
-- ============================================================================
create or replace function public.enforce_space_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(to_jsonb(new) ->> 'space_id', '') is not null then
    raise exception 'space_engagement_closed';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_space_engagement() from public, anon, authenticated;
