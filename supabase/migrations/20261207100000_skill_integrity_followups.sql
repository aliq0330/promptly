-- Skill bütünlük düzeltmeleri (docs/history/417-*): üretim öncesi denetimde bulunan iki açık. Yalnız ekleyici / create-or-replace; veri silinmez.
--
-- 1) Ortak koleksiyon korumasında Skill dalı YOKTU: `set_collection_shared` ve `collection_unshareable_items` Skill'i denetliyor, ama koleksiyon zaten
--    ortakken eklenen özel/taslak Skill `collection_items_a_shared_guard`'dan geçiyordu (her ortak aynı içeriği okuyabilsin kuralı, docs/history/386-*).
-- 2) Skill silinince bildirimleri kalıyordu: prompt/istek/workflow/hazır ayar'da `cleanup_notifications_for_deleted_*` var, Skill'de yoktu
--    ("yorum yaptı", "yeni sürüm", "yayınladı" bildirimleri ölü bağlantıyla kalırdı).

-- === 1. Ortak koleksiyon koruması ================================================================================================
create or replace function public.collection_items_a_shared_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shared boolean;
begin
  select c.is_shared into v_shared from public.collections c where c.id = new.collection_id;
  if coalesce(v_shared, false) then
    if auth.uid() is not null then new.added_by := auth.uid(); end if;
    if new.community_post_id is not null then raise exception 'collection_item_not_shareable'; end if;
    if new.prompt_id is not null and not public.quote_target_ok('prompt', new.prompt_id) then raise exception 'collection_item_not_shareable'; end if;
    if new.workflow_id is not null and not public.quote_target_ok('workflow', new.workflow_id) then raise exception 'collection_item_not_shareable'; end if;
    if new.preset_id is not null and not public.quote_target_ok('preset', new.preset_id) then raise exception 'collection_item_not_shareable'; end if;
    if new.skill_id is not null and not public.quote_target_ok('skill', new.skill_id) then raise exception 'collection_item_not_shareable'; end if;
  elsif auth.uid() is not null then
    new.added_by := null;
  end if;
  return new;
end $$;
revoke all on function public.collection_items_a_shared_guard() from public, anon, authenticated;

-- === 2. Skill silinince bildirimleri de silinir ===================================================================================
-- Hedef adres her Skill bildiriminde `/skills/local?id=<kimlik>` ile başlar (`&hl=comment:…` eki olabilir); preset/workflow ile aynı kalıp.
create or replace function public.cleanup_notifications_for_deleted_skill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/skills/local?id=' || old.id || '%';
  return old;
end;
$$;
revoke all on function public.cleanup_notifications_for_deleted_skill() from public, anon, authenticated;

drop trigger if exists skills_after_delete_cleanup_notifications on public.skills;
create trigger skills_after_delete_cleanup_notifications
  after delete on public.skills
  for each row
  execute function public.cleanup_notifications_for_deleted_skill();
