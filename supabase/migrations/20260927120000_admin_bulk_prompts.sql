-- Moderatör toplu prompt yönetimi (docs/history/251-*): toplu yükleme (`admin_import_prompts`) ile gelen yüzlerce/binlerce taslağı seçerek
-- yayınlamak, gizlemek ya da silmek için. Yalnızca ekleyici (`drop` yok): iki yeni fonksiyon.
--
-- Güvenlik tasarımı (ikisi de SECURITY DEFINER yalnız `_admin_guard`/`_admin_log` için):
--   • Yetki `_admin_guard()` (moderatör). Etki alanı YALNIZ çağıranın KENDİ promptlarıdır (`author_id = auth.uid()`), topluluğa özgü olmayan,
--     silinmemiş, `original` köken (istek yanıtları hariç). Moderatör başka birinin içeriğini bu yoldan değiştiremez/silemez.
--   • Çağrı başına en çok 200 kimlik (istemci parçalara böler); her çağrı atomiktir; denetim kaydı yazılır.
--   • "Yayından geri çek" YOK, bilerek: `count_tags_on_publish` etiket sayacını yayında artırır ama geri alınca azaltmaz (sayaç şişer).
--     Geri alma yerine mevcut "Sadece ben" anlamı kullanılır: yayınlanmış promptun `visibility`si `private` olur (etiket sayacı değişmez).
--   • Silme yalnız kimsenin dokunmadığı promptları kapsar: beğeni/yorum/kayıt/alıntı sayacı 0 ve başkasına ait veriyi CASCADE ile
--     götürecek ya da kıracak hiçbir bağ yok (topluluk gönderisi, sonuç, düzenleme önerisi, Space öğesi, workflow adımı, koleksiyon).
--     Atlananlar sayılır ve istemciye bildirilir; hiçbiri sessizce silinmez.

create or replace function public.admin_bulk_set_prompt_visibility(p_ids uuid[], p_public boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_changed integer;
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  v_total := cardinality(p_ids);
  if v_total > 200 then raise exception 'too_many_items'; end if;

  if p_public then
    -- Taslak → yayında + herkese açık (taslaktan geçiş etiket sayacı ve created_at tetikleyicilerini çalıştırır); yayında+gizli → herkese açık.
    update public.prompts set status = 'published', visibility = 'public'
      where id = any (p_ids) and author_id = auth.uid() and community_id is null and deleted_at is null and origin_type = 'original'
        and (status <> 'published' or visibility <> 'public');
  else
    update public.prompts set visibility = 'private'
      where id = any (p_ids) and author_id = auth.uid() and community_id is null and deleted_at is null and origin_type = 'original'
        and status = 'published' and visibility <> 'private';
  end if;
  get diagnostics v_changed = row_count;

  perform public._admin_log(case when p_public then 'bulk_publish_prompts' else 'bulk_hide_prompts' end, null,
    jsonb_build_object('requested', v_total, 'changed', v_changed));
  return jsonb_build_object('affected', v_changed, 'skipped', v_total - v_changed);
end;
$$;

create or replace function public.admin_bulk_delete_prompts(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_deleted integer;
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  v_total := cardinality(p_ids);
  if v_total > 200 then raise exception 'too_many_items'; end if;

  delete from public.prompts p
    where p.id = any (p_ids) and p.author_id = auth.uid() and p.community_id is null and p.origin_type = 'original'
      and p.like_count = 0 and p.comment_count = 0 and p.save_count = 0 and coalesce(p.quote_count, 0) = 0
      and not exists (select 1 from public.collection_items x where x.prompt_id = p.id)
      and not exists (select 1 from public.community_posts x where x.prompt_id = p.id)
      and not exists (select 1 from public.content_quotes x where x.prompt_id = p.id)
      and not exists (select 1 from public.prompt_results x where x.prompt_id = p.id)
      and not exists (select 1 from public.prompt_edit_suggestions x where x.prompt_id = p.id)
      and not exists (select 1 from public.space_items x where x.prompt_id = p.id)
      and not exists (select 1 from public.workflow_steps x where x.prompt_id = p.id);
  get diagnostics v_deleted = row_count;

  perform public._admin_log('bulk_delete_prompts', null, jsonb_build_object('requested', v_total, 'deleted', v_deleted));
  return jsonb_build_object('affected', v_deleted, 'skipped', v_total - v_deleted);
end;
$$;

revoke all on function public.admin_bulk_set_prompt_visibility(uuid[], boolean) from public, anon;
revoke all on function public.admin_bulk_delete_prompts(uuid[]) from public, anon;
grant execute on function public.admin_bulk_set_prompt_visibility(uuid[], boolean) to authenticated;
grant execute on function public.admin_bulk_delete_prompts(uuid[]) to authenticated;
