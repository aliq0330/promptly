-- Moderatör: KENDİ promptlarının tür/kategori/alt kategorisini toplu ayarlama (docs/history/260-*).
-- prompts.chat'ten içe aktarılan ~3 000 prompt `content_type='text'`, kategorisiz geliyordu; moderatör dosyayla kategoriler.
-- Yalnızca ekleyici (`drop` yok): tek yeni fonksiyon.
--
-- Tasarım:
--   • Yetki `_admin_guard()`. Yalnız çağıranın KENDİ, topluluğa ait olmayan, silinmemiş promptları değişir (başkasınınki sessizce atlanır).
--   • Varsayılan olarak yalnız kategorisi BOŞ olanlara yazar (elle kategorilenmiş prompt ezilmez); `p_overwrite` açıkça seçilirse hepsi.
--   • Değerler taksonomi tablolarına karşı doğrulanır: tür ∈ 4 tür, kategori o türün ETKİN kategorisi; alt kategori o kategorinin etkin alt kategorisi
--     değilse alt kategori boş bırakılır (kategori yine yazılır; sayılır). Geçersiz kayıt atlanır ve nedeniyle döner — hiçbiri sessiz yazılmaz.
--     Kategori `null` verilirse (GERİ ALMA: önceki değerlere dönüş) yalnız tür yazılır, kategori ve alt kategori boşalır; geri alma `p_overwrite` ister.
--   • Tek UPDATE, atomik; çağrı başına en çok 200 kayıt. Aynı değerlerle yeniden çalıştırmak zararsızdır (değişmeyen satıra dokunulmaz).
--   • Sürüm geçmişi / `content_edits` / yazara bildirim ÜRETMEZ: o tetikleyiciler yalnız başlık, açıklama, prompt metni ve araç değişince çalışır.
--   • Denetim kaydı `admin_audit_log`'a yazılır.

create or replace function public.admin_bulk_set_prompt_taxonomy(p_items jsonb, p_overwrite boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_affected integer := 0;
  v_dropped_sub integer := 0;
  v_not_mine integer := 0;
  v_already integer := 0;
  v_invalid jsonb := '[]'::jsonb;
begin
  perform public._admin_guard();
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'bad_items'; end if;
  v_total := jsonb_array_length(p_items);
  if v_total = 0 then raise exception 'empty'; end if;
  if v_total > 200 then raise exception 'too_many_items'; end if;

  create temporary table _tax_in on commit drop as
  select e.ord::integer as idx,
         case when e.obj ->> 'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e.obj ->> 'id')::uuid end as id,
         e.obj ->> 'content_type' as content_type, e.obj ->> 'category' as category, nullif(e.obj ->> 'subcategory', '') as subcategory
    from jsonb_array_elements(p_items) with ordinality as e(obj, ord);

  -- Doğrulama: kategori o türün etkin kategorisi mi; alt kategori o kategorinin etkin alt kategorisi mi.
  create temporary table _tax_ok on commit drop as
  select i.idx, i.id, i.content_type, i.category,
         case when i.subcategory is null or i.category is null then null
              when exists (select 1 from public.taxonomy_subcategories s join public.taxonomy_categories c on c.id = s.category_id
                            where c.content_type = i.content_type and c.slug = i.category and s.slug = i.subcategory and s.is_active) then i.subcategory
              else null end as subcategory,
         (i.subcategory is not null and i.category is not null and not exists (select 1 from public.taxonomy_subcategories s join public.taxonomy_categories c on c.id = s.category_id
                            where c.content_type = i.content_type and c.slug = i.category and s.slug = i.subcategory and s.is_active)) as sub_dropped
    from _tax_in i
   where i.id is not null and i.content_type in ('image', 'text', 'audio', 'video')
     and (i.category is null
          or exists (select 1 from public.taxonomy_categories c where c.content_type = i.content_type and c.slug = i.category and c.is_active));

  select coalesce(jsonb_agg(jsonb_build_object('index', i.idx, 'code', case when i.id is null then 'bad_id'
                                                                           when i.content_type is null or i.content_type not in ('image', 'text', 'audio', 'video') then 'bad_type'
                                                                           else 'bad_category' end) order by i.idx), '[]'::jsonb)
    into v_invalid
    from _tax_in i where not exists (select 1 from _tax_ok o where o.idx = i.idx);

  select count(*) into v_dropped_sub from _tax_ok where sub_dropped;
  select count(*) into v_not_mine from _tax_ok o
   where not exists (select 1 from public.prompts p where p.id = o.id and p.author_id = auth.uid() and p.community_id is null and p.deleted_at is null);
  select count(*) into v_already from _tax_ok o
   where not p_overwrite and exists (select 1 from public.prompts p where p.id = o.id and p.author_id = auth.uid() and p.community_id is null
                                      and p.deleted_at is null and p.category is not null);

  with upd as (
    update public.prompts p
       set content_type = o.content_type, category = o.category, subcategory = o.subcategory
      from (select distinct on (id) * from _tax_ok order by id, idx) o
     where p.id = o.id and p.author_id = auth.uid() and p.community_id is null and p.deleted_at is null
       and (p_overwrite or p.category is null)
       and (p.content_type, p.category, p.subcategory) is distinct from (o.content_type, o.category, o.subcategory)
    returning 1
  )
  select count(*) into v_affected from upd;

  perform public._admin_log('bulk_set_prompt_taxonomy', null,
    jsonb_build_object('requested', v_total, 'changed', v_affected, 'invalid', jsonb_array_length(v_invalid), 'overwrite', coalesce(p_overwrite, false)));
  return jsonb_build_object('affected', v_affected, 'skipped', v_total - v_affected, 'invalid', v_invalid,
                            'not_mine', v_not_mine, 'already_categorized', v_already, 'subcategory_dropped', v_dropped_sub);
end;
$$;

revoke all on function public.admin_bulk_set_prompt_taxonomy(jsonb, boolean) from public, anon;
grant execute on function public.admin_bulk_set_prompt_taxonomy(jsonb, boolean) to authenticated;
