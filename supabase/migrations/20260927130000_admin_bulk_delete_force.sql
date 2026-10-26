-- Moderatör toplu silme: "etkileşimi olanları da sil" seçeneği + silmeden önce etki sayımı + taslak silerken etiket sayacı düzeltmesi (docs/history/252-*).
-- Yalnızca ekleyici/değiştirici (`drop` yok): yeni 2 argümanlı `admin_bulk_delete_prompts(uuid[], boolean)`, yeni `admin_bulk_delete_impact(uuid[])`;
-- eski 1 argümanlı biçim aynı imzayla `create or replace` edilip yeni biçimi `p_force = false` ile çağırır (eski istemci davranışı değişmez).
--
-- Tasarım:
--   • Yetki ve etki alanı değişmedi: `_admin_guard()` + YALNIZ çağıranın KENDİ promptları (topluluğa özgü olmayan, `original` köken).
--   • `p_force = false` (varsayılan): eskisi gibi, başkasının dokunduğu prompt atlanır. `p_force = true`: o korumalar kalkar; başkalarının beğeni/yorum/
--     kayıt/alıntı/topluluk gönderisi/sonuç/öneri satırları bu promptun silinmesiyle MEVCUT `ON DELETE CASCADE` kuralları gereği birlikte gider (sitedeki
--     normal "Sil" ile aynı sonuç); Space öğesi, workflow adımı ve mesajdaki paylaşım bağı `SET NULL` ile boşalır. İstemci silmeden önce
--     `admin_bulk_delete_impact` ile bunların sayısını gösterip açık onay ister.
--   • Etiket sayacı: yayında olmayan (taslak) promptun etiketi sayaca hiç girmemişti, ama prompt satırı silinirken `handle_prompt_tag_change` üst satırı
--     artık bulamadığı için "taslak değil" sayıp sayacı DÜŞÜRÜYORDU (başkalarının yayınlı promptlarının etiket sayısı eksik görünürdü). Burada taslakların
--     etiket bağları, üst satır hâlâ taslakken önce silinir; yayınlı promptlar için sayaç düşüşü doğrudur ve korunur.
--   • Seçim `for update` ile kilitlenir: koruma kontrolü ile silme arasında araya giren bir beğeni/yorum, korumasız (force olmayan) silmede kaybolmaz.

create or replace function public.admin_bulk_delete_prompts(p_ids uuid[], p_force boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_ids uuid[];
  v_deleted integer;
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  v_total := cardinality(p_ids);
  if v_total > 200 then raise exception 'too_many_items'; end if;

  select coalesce(array_agg(x.id), '{}') into v_ids from (
    select p.id from public.prompts p
      where p.id = any (p_ids) and p.author_id = auth.uid() and p.community_id is null and p.origin_type = 'original'
        and (
          coalesce(p_force, false)
          or (
            p.like_count = 0 and p.comment_count = 0 and p.save_count = 0 and coalesce(p.quote_count, 0) = 0
            and not exists (select 1 from public.collection_items x where x.prompt_id = p.id)
            and not exists (select 1 from public.community_posts x where x.prompt_id = p.id)
            and not exists (select 1 from public.content_quotes x where x.prompt_id = p.id)
            and not exists (select 1 from public.prompt_results x where x.prompt_id = p.id)
            and not exists (select 1 from public.prompt_edit_suggestions x where x.prompt_id = p.id)
            and not exists (select 1 from public.space_items x where x.prompt_id = p.id)
            and not exists (select 1 from public.workflow_steps x where x.prompt_id = p.id)
          )
        )
      for update of p
  ) x;

  -- Taslakların etiket bağları, üst satır hâlâ taslakken silinir (sayaç hiç artmamıştı, düşmemeli).
  delete from public.prompt_tags t
    where t.prompt_id in (select p.id from public.prompts p where p.id = any (v_ids) and p.status = 'draft');
  delete from public.prompts p where p.id = any (v_ids);
  get diagnostics v_deleted = row_count;

  perform public._admin_log('bulk_delete_prompts', null, jsonb_build_object('requested', v_total, 'deleted', v_deleted, 'force', coalesce(p_force, false)));
  return jsonb_build_object('affected', v_deleted, 'skipped', v_total - v_deleted);
end;
$$;

create or replace function public.admin_bulk_delete_prompts(p_ids uuid[])
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.admin_bulk_delete_prompts(p_ids, false);
$$;

-- Silmeden önce etki sayımı: seçilen (yalnız çağıranın kendi) promptlarla birlikte neler gider / boşalır. Sadece sayı döner, kimlik/içerik değil.
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
    'saves', (select count(*) from public.collection_items x where x.prompt_id = any (v_ids)),
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

revoke all on function public.admin_bulk_delete_prompts(uuid[], boolean) from public, anon;
revoke all on function public.admin_bulk_delete_prompts(uuid[]) from public, anon;
revoke all on function public.admin_bulk_delete_impact(uuid[]) from public, anon;
grant execute on function public.admin_bulk_delete_prompts(uuid[], boolean) to authenticated;
grant execute on function public.admin_bulk_delete_prompts(uuid[]) to authenticated;
grant execute on function public.admin_bulk_delete_impact(uuid[]) to authenticated;
