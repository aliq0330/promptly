-- Bölüm 9.36 — Prompt/Generator ortak sosyal mimari, Faz 2: kart/sayfa
-- düzeyi UI paritesinin gerektirdiği üç gerçek, dar kapsamlı DB eklentisi.
-- Kullanıcının açık kuralı: yeni tablo yok, mevcut like/comment/remix/save
-- backend'ine dokunulmuyor — bu migration SADECE üç şeyi ekliyor:
--   1) content_edits + record_generator_edit() — EditHistoryPanel'in
--      generator'ı da desteklemesi için (mevcut, prompt/istek için zaten
--      çalışan aynı tablo/trigger deseni, üçüncü bir content_type değeri).
--   2) remove_generator_from_saved_everywhere() — save modal artık bir
--      generator'ı da BİRDEN FAZLA koleksiyona ekleyip "genel kaydı kaldır"
--      ile hepsinden birden çıkarabilmeli (mevcut remove_prompt_from_
--      saved_everywhere ile birebir aynı desen, generator_id'ye göre).
--   3) fetch_generator_remix_graph() — "Remix Dallanma Haritası" (Prompt
--      geçmişi) sekmesinin veri kaynağı fetch_remix_graph'ın generator
--      karşılığı; mevcut RemixBranchMap/RemixNodeDetailPanel/
--      remix-map-node-card bileşenleri DEĞİŞTİRİLMEDEN, yalnızca
--      contentType parametresiyle bu yeni fonksiyonu çağırıyor.
--
-- Bilinçli olarak KAPSAM DIŞI bırakılan: generator merge/diff/comparison.
-- Bir promptun mergelenebilir birimi düz metin alanlarıdır (title/
-- description/prompt_text/tool — PromptDiffModal/VersionDiffModal bunu
-- karşılaştırır); bir generatorun "içeriği" ise yapılandırılmış bir JSON
-- şema+şablondur (generator_versions.schema/template). Mevcut diff/merge
-- UI'ını buraya bağlamak ya çalışmayacaktı (alan uyumsuzluğu) ya da
-- tamamen yeni bir JSON-diff arayüzü icat etmeyi gerektirecekti — ikisi de
-- kullanıcının "yeni sistem yazma" kuralını ihlal ederdi. Bu yüzden harita
-- generator düğümleri için salt-görüntüleme kalıyor (merge talebi
-- oluşturma/karşılaştırma butonları yalnızca prompt düğümlerinde
-- gösteriliyor, frontend tarafında).

-- === content_edits — üçüncü content_type: 'generator' ========================
alter table public.content_edits drop constraint content_edits_content_type_check;
alter table public.content_edits add constraint content_edits_content_type_check
  check (content_type in ('prompt', 'prompt_request', 'generator'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'remix', 'request_response',
    'message', 'message_request', 'system',
    'merge_request_received', 'merge_request_accepted', 'merge_request_rejected',
    'merge_request_withdrawn', 'merge_request_cancelled',
    'prompt_edited', 'request_edited', 'generator_edited'
  ));

create or replace function public.record_generator_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := array[]::text[];
  v_previous jsonb := '{}'::jsonb;
  v_editor uuid := auth.uid();
begin
  if old.title is distinct from new.title then
    v_changed := array_append(v_changed, 'title');
    v_previous := v_previous || jsonb_build_object('title', old.title);
  end if;
  if old.description is distinct from new.description then
    v_changed := array_append(v_changed, 'description');
    v_previous := v_previous || jsonb_build_object('description', old.description);
  end if;
  if old.category is distinct from new.category then
    v_changed := array_append(v_changed, 'category');
    v_previous := v_previous || jsonb_build_object('category', old.category);
  end if;
  if old.subcategory is distinct from new.subcategory then
    v_changed := array_append(v_changed, 'subcategory');
    v_previous := v_previous || jsonb_build_object('subcategory', old.subcategory);
  end if;
  if old.cover_url is distinct from new.cover_url then
    v_changed := array_append(v_changed, 'cover_url');
    v_previous := v_previous || jsonb_build_object('cover_url', old.cover_url);
  end if;
  if old.visibility is distinct from new.visibility then
    v_changed := array_append(v_changed, 'visibility');
    v_previous := v_previous || jsonb_build_object('visibility', old.visibility);
  end if;

  -- Yalnızca beğeni/yorum/remix/use/save sayaçları, status, current_version_id
  -- gibi ilgisiz kolonlar değiştiyse (ör. bir beğeni bu satırın UPDATE'ini
  -- tetiklediyse) burada hiçbir şey üretilmiyor — record_prompt_edit()'in
  -- zaten kurduğu aynı kural.
  if array_length(v_changed, 1) is null or v_editor is null then
    return new;
  end if;

  insert into public.content_edits (content_type, content_id, owner_id, editor_id, changed_fields, previous_values)
  values ('generator', new.id, new.creator_id, v_editor, v_changed, v_previous);

  -- Sahip kendi generatorunu düzenlediğinde (bugün RLS altında TEK mümkün
  -- durum) kendine bildirim ÜRETİLMİYOR — record_prompt_edit()'teki aynı not.
  if v_editor <> new.creator_id then
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      new.creator_id, v_editor, 'generator_edited',
      'Generatorunu düzenledi: "' || public.truncate_preview(new.title) || '"',
      '/generators/local?slug=' || new.slug
    );
  end if;

  return new;
end;
$$;

create trigger generators_record_edit
  after update on public.generators
  for each row
  execute function public.record_generator_edit();

-- === remove_generator_from_saved_everywhere ===================================
-- `remove_prompt_from_saved_everywhere`'in birebir generator karşılığı —
-- artık bir generator da (Bölüm 9.36'nın widened SaveToCollectionModal'ı
-- sayesinde) birden fazla koleksiyona eklenebildiğinden, "genel kaydı
-- kaldır" eylemi de aynı şekilde HEPSİNDEN birden, tek atomik bir
-- işlemde çıkarabilmeli.
create or replace function public.remove_generator_from_saved_everywhere(p_generator_id uuid)
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
    and ci.generator_id = p_generator_id;
end;
$$;

revoke all on function public.remove_generator_from_saved_everywhere(uuid) from public;
grant execute on function public.remove_generator_from_saved_everywhere(uuid) to authenticated;

-- === fetch_generator_remix_graph ==============================================
-- `fetch_remix_graph`'ın generator karşılığı — aynı tek-sorgu recursive CTE
-- deseni, `generators`/`source_generator_id` üzerinde. Bir generator
-- yumuşak silinmiyor (Bölüm 9.7'nin prompt'a özel soft-delete'i burada
-- karşılığı yok — `deleteGenerator` gerçek bir DELETE) — bu yüzden burada
-- `deleted_at` kolonu hiç yok; bir düğümün ata zincirindeki bir generator
-- gerçekten silinmişse zaten bu sorgunun sonuç kümesinde HİÇ görünmez,
-- `RemixNodeDetailPanel`'in zaten var olan "kaynağa erişilemiyor" dalı
-- (ata `allNodes` içinde bulunamayan her durum için) bunu doğru şekilde
-- ele alıyor — ayrı bir "silinmiş içerik" kavramı icat etmeye gerek yok.
create or replace function public.fetch_generator_remix_graph(p_root_id uuid)
returns table (
  id uuid, title text, slug text, author_id uuid, origin_type text,
  source_generator_id uuid, root_generator_id uuid,
  remix_count int, created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with recursive tree as (
    select g.id, g.title, g.slug, g.creator_id as author_id, g.origin_type,
           g.source_generator_id, g.root_generator_id, g.status, g.remix_count, g.created_at
    from public.generators g
    where g.id = p_root_id
    union all
    select c.id, c.title, c.slug, c.creator_id as author_id, c.origin_type,
           c.source_generator_id, c.root_generator_id, c.status, c.remix_count, c.created_at
    from public.generators c
    join tree t on c.source_generator_id = t.id
  )
  select tree.id, tree.title, tree.slug, tree.author_id, tree.origin_type,
         tree.source_generator_id, tree.root_generator_id, tree.remix_count, tree.created_at
  from tree
  where tree.status = 'published';
$$;

revoke all on function public.fetch_generator_remix_graph(uuid) from public;
grant execute on function public.fetch_generator_remix_graph(uuid) to authenticated, anon;
