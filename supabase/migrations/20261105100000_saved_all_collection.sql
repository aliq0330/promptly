-- Kaydedilenlerin tümü (docs/history/336-*): Instagram "Kaydedilenler" mantığı.
--
-- Kaydetmek ile koleksiyona eklemek ayrı işlemlerdir:
--   * Her kullanıcının tek bir SİSTEM koleksiyonu vardır (`collections.is_default = true`, "Kaydedilenlerin tümü").
--     Artık kullanıcıya görünen "Genel" koleksiyonu DEĞİLDİR: koleksiyon listelerinde çıkmaz, adı/görünürlüğü
--     değişmez (hep özel), silinemez. İstemci onu `get_or_create_own_default_collection()` ile bulur.
--   * Kaydetmek = sistem koleksiyonuna satır eklemek. Koleksiyona eklemek = koleksiyona satır eklemek; içerik
--     henüz kayıtlı değilse sistem koleksiyonuna da OTOMATİK girer (BEFORE INSERT tetikleyicisi).
--   * Bir koleksiyondan çıkarmak yalnız o koleksiyonu etkiler. "Kaydedilenlerden kaldır" = `unsave_content`: içeriği
--     kullanıcının TÜM koleksiyonlarından tek DELETE ile çıkarır (sayaç tetikleyicileri tek azaltma yapar).
--
-- Sistem koleksiyonu kullanıcının tüm koleksiyon üyeliklerinin üst kümesi olduğu için `save_count`, istatistik,
-- "Sana özel", API ve diğer okumalar (hepsi `collection_items ⋈ collections.owner_id` okur) DEĞİŞMEZ.
--
-- Tetikleyici sırası önemlidir: sayaç tetikleyicileri "sahip başına bir kez" sayar (toplam − eklenen ≤ 0 ise +1;
-- kalan 0 ise −1). Bu yüzden ekleme BEFORE çalışır (sistem satırı önce girer, ilk ekleme sayılır). Silmede satır
-- tetikleyicisi KULLANILMAZ: içeriğin kendisi silinirken (CASCADE) kardeş satırları silen bir tetikleyici
-- "tuple already modified" hatası verir; bu yüzden toplu kaldırma tek ifadelik `unsave_content` RPC'sidir.
--
-- Mevcut "Genel" koleksiyonları (expand adımı; veri SİLİNMEZ):
--   * içeriği ya da takipçisi olan Genel → bayrağı kalkar, sıradan, silinebilir bir "Genel" koleksiyonu olarak kalır
--     (kimlik, ad, görünürlük, takipçiler, içerik aynen); ona bağlı yeni bir sistem koleksiyonu açılır.
--   * boş ve takipçisiz Genel → kendisi sistem koleksiyonuna dönüşür.
--   Ardından her kullanıcının tüm koleksiyon üyelikleri sistem koleksiyonuna işlenir (eksik olanlar eklenir).

-- === 1. Sistem koleksiyonu istemciden değiştirilemez ===========================================================
-- `auth.uid()` null = migration / SECURITY DEFINER sunucu işi; istemci (JWT'li) çağrılar kısıtlanır.

create or replace function public.handle_collection_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Koleksiyonun sahibi değiştirilemez.';
  end if;
  if auth.uid() is not null then
    if new.is_default is distinct from old.is_default then
      raise exception 'Koleksiyonun varsayılan durumu değiştirilemez.';
    end if;
    if old.is_default and (new.name is distinct from old.name or new.visibility is distinct from old.visibility) then
      raise exception 'Kaydedilenlerin tümü düzenlenemez.';
    end if;
  end if;
  return new;
end;
$$;

-- Eski ve yeni kullanıcılar için sistem koleksiyonunun adı (görünen etiketi istemci çevirir).
create or replace function public.ensure_default_collection(p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.collections where owner_id = p_owner_id and is_default limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.collections (owner_id, name, visibility, is_default)
  values (p_owner_id, 'Kaydedilenler', 'private', true)
  on conflict (owner_id) where is_default do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.collections where owner_id = p_owner_id and is_default limit 1;
  end if;
  return v_id;
end;
$$;

-- === 2. Mevcut "Genel" koleksiyonlarını dönüştür ===============================================================

do $$
declare
  d record;
begin
  for d in
    select c.id, c.owner_id, c.item_count,
           exists (select 1 from public.collection_follows f where f.collection_id = c.id) as has_followers
      from public.collections c
     where c.is_default
  loop
    if d.item_count > 0 or d.has_followers then
      -- Sıradan koleksiyona dönüşür; yerine yeni sistem koleksiyonu açılır (içeriği 3. adımda dolar).
      update public.collections set is_default = false where id = d.id;
      perform public.ensure_default_collection(d.owner_id);
    else
      update public.collections set name = 'Kaydedilenler', visibility = 'private' where id = d.id;
    end if;
  end loop;

  -- Sistem koleksiyonu olmayan her profil için bir tane (kayıt tetikleyicisi zaten açar; eski/yetim hesaplar için).
  perform public.ensure_default_collection(p.id)
     from public.profiles p
    where not exists (select 1 from public.collections c where c.owner_id = p.id and c.is_default);
end;
$$;

-- === 3. Mevcut tüm üyelikleri sistem koleksiyonuna işle (eksik olanlar; idempotent) ============================
-- Tetikleyiciler henüz bağlı değil; sayaç tetikleyicileri sahip başına zaten sayılmış içeriği tekrar saymaz.

insert into public.collection_items (collection_id, prompt_id, created_at)
select s.id, m.target_id, m.first_at
  from (select c.owner_id, ci.prompt_id as target_id, min(ci.created_at) as first_at
          from public.collection_items ci join public.collections c on c.id = ci.collection_id
         where not c.is_default and ci.prompt_id is not null group by 1, 2) m
  join public.collections s on s.owner_id = m.owner_id and s.is_default
 where not exists (select 1 from public.collection_items x where x.collection_id = s.id and x.prompt_id = m.target_id);

insert into public.collection_items (collection_id, workflow_id, created_at)
select s.id, m.target_id, m.first_at
  from (select c.owner_id, ci.workflow_id as target_id, min(ci.created_at) as first_at
          from public.collection_items ci join public.collections c on c.id = ci.collection_id
         where not c.is_default and ci.workflow_id is not null group by 1, 2) m
  join public.collections s on s.owner_id = m.owner_id and s.is_default
 where not exists (select 1 from public.collection_items x where x.collection_id = s.id and x.workflow_id = m.target_id);

insert into public.collection_items (collection_id, preset_id, created_at)
select s.id, m.target_id, m.first_at
  from (select c.owner_id, ci.preset_id as target_id, min(ci.created_at) as first_at
          from public.collection_items ci join public.collections c on c.id = ci.collection_id
         where not c.is_default and ci.preset_id is not null group by 1, 2) m
  join public.collections s on s.owner_id = m.owner_id and s.is_default
 where not exists (select 1 from public.collection_items x where x.collection_id = s.id and x.preset_id = m.target_id);

insert into public.collection_items (collection_id, community_post_id, created_at)
select s.id, m.target_id, m.first_at
  from (select c.owner_id, ci.community_post_id as target_id, min(ci.created_at) as first_at
          from public.collection_items ci join public.collections c on c.id = ci.collection_id
         where not c.is_default and ci.community_post_id is not null group by 1, 2) m
  join public.collections s on s.owner_id = m.owner_id and s.is_default
 where not exists (select 1 from public.collection_items x where x.collection_id = s.id and x.community_post_id = m.target_id);

-- === 4. Tutarlılık tetikleyicileri ==============================================================================

-- Koleksiyona eklenen içerik kayıtlı değilse sistem koleksiyonuna da girer (önce: sayaç ilk eklemeyi sayar).
create or replace function public.collection_items_saved_all_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_default boolean;
begin
  select owner_id, is_default into v_owner, v_default from public.collections where id = new.collection_id;
  if v_owner is null or v_default then
    return new;
  end if;
  -- Başkasının koleksiyonuna ekleme denemesi: sistem koleksiyonuna dokunma, ekleme RLS'te reddedilir.
  if auth.uid() is not null and auth.uid() <> v_owner then
    return new;
  end if;
  insert into public.collection_items (collection_id, prompt_id, workflow_id, preset_id, community_post_id)
  values (public.ensure_default_collection(v_owner), new.prompt_id, new.workflow_id, new.preset_id, new.community_post_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists collection_items_saved_all_before_insert on public.collection_items;
create trigger collection_items_saved_all_before_insert
  before insert on public.collection_items
  for each row execute function public.collection_items_saved_all_before_insert();

revoke all on function public.collection_items_saved_all_before_insert() from public, anon, authenticated;
revoke all on function public.ensure_default_collection(uuid) from public, anon, authenticated;

-- === 5. Kaydedilenlerden kaldır ================================================================================
-- Çağıranın (auth.uid()) tüm koleksiyonlarından — sistem koleksiyonu dahil — içeriği TEK ifadede çıkarır.
-- SECURITY INVOKER: RLS zaten yalnız kendi koleksiyonlarındaki satırların silinmesine izin verir.

create or replace function public.unsave_content(p_type text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın.';
  end if;
  if p_type not in ('prompt', 'workflow', 'preset', 'community_post') then
    raise exception 'unsave_invalid_type';
  end if;

  delete from public.collection_items ci
  using public.collections c
  where ci.collection_id = c.id
    and c.owner_id = auth.uid()
    and case p_type
      when 'prompt' then ci.prompt_id = p_id
      when 'workflow' then ci.workflow_id = p_id
      when 'preset' then ci.preset_id = p_id
      else ci.community_post_id = p_id
    end;
end;
$$;

revoke all on function public.unsave_content(text, uuid) from public, anon;
grant execute on function public.unsave_content(text, uuid) to authenticated;

-- === 6. Moderatör etki sayımı: "kaydedilme" = kaydeden kişi sayısı (sistem koleksiyonu satırı), koleksiyon üyeliği değil ===

create or replace function public.admin_bulk_delete_impact(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_items'; end if;

  select coalesce(array_agg(p.id), '{}') into v_ids from public.prompts p
    where p.id = any (p_ids) and p.author_id = auth.uid() and p.community_id is null and p.origin_type = 'original';

  return jsonb_build_object(
    'prompts', cardinality(v_ids),
    'engaged', (select count(*) from public.prompts p where p.id = any (v_ids) and (
        p.like_count > 0 or p.comment_count > 0 or p.save_count > 0 or coalesce(p.quote_count, 0) > 0
        or exists (select 1 from public.collection_items x where x.prompt_id = p.id)
        or exists (select 1 from public.community_posts x where x.prompt_id = p.id)
        or exists (select 1 from public.content_quotes x where x.prompt_id = p.id)
        or exists (select 1 from public.prompt_results x where x.prompt_id = p.id)
        or exists (select 1 from public.prompt_edit_suggestions x where x.prompt_id = p.id)
        or exists (select 1 from public.space_items x where x.prompt_id = p.id)
        or exists (select 1 from public.workflow_steps x where x.prompt_id = p.id))),
    -- birlikte SİLİNENLER (CASCADE)
    'likes', (select count(*) from public.prompt_likes x where x.prompt_id = any (v_ids)),
    'comments', (select count(*) from public.prompt_comments x where x.prompt_id = any (v_ids)),
    'saves', (select count(*) from public.collection_items x join public.collections c on c.id = x.collection_id where c.is_default and x.prompt_id = any (v_ids)),
    'quotes', (select count(*) from public.content_quotes x where x.prompt_id = any (v_ids)),
    'communityPosts', (select count(*) from public.community_posts x where x.prompt_id = any (v_ids)),
    'results', (select count(*) from public.prompt_results x where x.prompt_id = any (v_ids)),
    'suggestions', (select count(*) from public.prompt_edit_suggestions x where x.prompt_id = any (v_ids)),
    -- yalnız BOŞALANLAR (SET NULL): satır kalır, prompt bağı gider
    'spaceItems', (select count(*) from public.space_items x where x.prompt_id = any (v_ids)),
    'workflowSteps', (select count(*) from public.workflow_steps x where x.prompt_id = any (v_ids)),
    'sharedInMessages', (select count(*) from public.messages x where x.shared_prompt_id = any (v_ids))
  );
end;
$$;

revoke all on function public.admin_bulk_delete_impact(uuid[]) from public, anon;
grant execute on function public.admin_bulk_delete_impact(uuid[]) to authenticated;
