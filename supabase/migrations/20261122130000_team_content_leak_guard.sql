-- Ekibe özgü içeriğin sızmaması: `community_id is null` süzgeci olan her içerik işlevi ekibe özgü içeriği de dışarıda bırakır (docs/history/376-*). Ekleyicidir.
--
-- Ekibe özgü içerik daima `visibility = 'private'` saklanır ve proje üyelerine RLS ile okunabilir (20261122100000). `visibility = 'public'` süzen sorgular onu
-- kendiliğinden dışlar; ama RLS'e güvenen sorgular (yazarın kendi listeleri, profil sayıları, API/MCP "benim içeriklerim", moderatör toplu araçları, yalnız
-- `community_id is null` süzen akış parçaları) onu içerik sanardı. Bu migration o işlevlerin gövdelerini AYNEN yeniden yazar; tek fark her
-- `community_id is null` süzgecinin yanına `team_file_id is null` eklenmesidir (gövdeler 20261122110000 sonrası canlı tanımlardan üretildi).
-- `search_content` 20261122120000'de ele alındı. Hikâye işlevleri (`story_tray`, `remove_community_story`) içerik tablosu değil `stories` okur, dokunulmadı.

CREATE OR REPLACE FUNCTION public._creator_insights_own_prompt(p_prompt_id uuid)
 RETURNS TABLE(id uuid, title text, content_type text, tools text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query
  select p.id, p.title, p.content_type, p.tools from public.prompts p
  where p.id = p_prompt_id and p.author_id = auth.uid() and p.status = 'published' and p.visibility = 'public'
    and p.deleted_at is null and p.community_id is null and p.team_file_id is null;
  if not found then raise exception 'not_found'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public._engager_content_visible(p_content_type text, p_content_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case p_content_type
    when 'prompt' then exists (
      select 1 from public.prompts p
      where p.id = p_content_id and p.deleted_at is null
        and ((p.community_id is null and p.team_file_id is null and p.status = 'published' and p.visibility = 'public')
             or p.author_id = auth.uid()
             or (p.community_id is not null and p.status = 'published' and public.can_read_community(p.community_id))))
    when 'request' then exists (
      select 1 from public.prompt_requests r
      where r.id = p_content_id and r.deleted_at is null
        and ((r.community_id is null and r.team_file_id is null and not r.is_draft and r.visibility = 'public')
             or r.author_id = auth.uid()
             or (r.community_id is not null and not r.is_draft and public.can_read_community(r.community_id))))
    when 'workflow' then exists (
      select 1 from public.workflows w
      where w.id = p_content_id
        and (w.creator_id = auth.uid()
             or (w.community_id is null and w.team_file_id is null and w.status = 'published' and w.visibility = 'public')
             or (w.community_id is not null and w.status = 'published' and public.can_read_community(w.community_id))))
    when 'preset' then exists (
      select 1 from public.presets s
      where s.id = p_content_id
        and (s.creator_id = auth.uid()
             or (s.community_id is null and s.team_file_id is null and s.status = 'published' and s.visibility = 'public')
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
$function$;

CREATE OR REPLACE FUNCTION public._quote_content_info(p_type text, p_id uuid)
 RETURNS TABLE(owner_id uuid, shareable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_type = 'prompt' then
    return query select x.author_id, (x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
      from public.prompts x where x.id = p_id;
  elsif p_type = 'request' then
    return query select x.author_id, (not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null)
      from public.prompt_requests x where x.id = p_id;
  elsif p_type = 'workflow' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null)
      from public.workflows x where x.id = p_id;
  elsif p_type = 'preset' then
    return query select x.creator_id, (x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null)
      from public.presets x where x.id = p_id;
  elsif p_type = 'space' then
    return query select x.owner_id, (x.visibility = 'public' and x.archived_at is null)
      from public.spaces x where x.id = p_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_impact(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  if cardinality(p_ids) > 200 then raise exception 'too_many_items'; end if;

  select coalesce(array_agg(p.id), '{}') into v_ids from public.prompts p
    where p.id = any (p_ids) and p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null and p.origin_type = 'original';

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_prompts(p_ids uuid[], p_force boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      where p.id = any (p_ids) and p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null and p.origin_type = 'original'
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_prompt_taxonomy(p_items jsonb, p_overwrite boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   where not exists (select 1 from public.prompts p where p.id = o.id and p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null and p.deleted_at is null);
  select count(*) into v_already from _tax_ok o
   where not p_overwrite and exists (select 1 from public.prompts p where p.id = o.id and p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null
                                      and p.deleted_at is null and p.category is not null);

  with upd as (
    update public.prompts p
       set content_type = o.content_type, category = o.category, subcategory = o.subcategory
      from (select distinct on (id) * from _tax_ok order by id, idx) o
     where p.id = o.id and p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null and p.deleted_at is null
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_prompt_visibility(p_ids uuid[], p_public boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      where id = any (p_ids) and author_id = auth.uid() and community_id is null and team_file_id is null and deleted_at is null and origin_type = 'original'
        and (status <> 'published' or visibility <> 'public');
  else
    update public.prompts set visibility = 'private'
      where id = any (p_ids) and author_id = auth.uid() and community_id is null and team_file_id is null and deleted_at is null and origin_type = 'original'
        and status = 'published' and visibility <> 'private';
  end if;
  get diagnostics v_changed = row_count;

  perform public._admin_log(case when p_public then 'bulk_publish_prompts' else 'bulk_hide_prompts' end, null,
    jsonb_build_object('requested', v_total, 'changed', v_changed));
  return jsonb_build_object('affected', v_changed, 'skipped', v_total - v_changed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_convert_template_variables(p_ids uuid[], p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_total integer;
  v_conv jsonb;
  v_var jsonb;
  v_existing text[];
  v_sort integer;
  v_changed integer := 0;
  v_created integer := 0;
  v_conflicts integer := 0;
begin
  perform public._admin_guard();
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'empty'; end if;
  v_total := cardinality(p_ids);
  if v_total > 200 then raise exception 'too_many_items'; end if;
  if p_scope is null or p_scope not in ('own', 'all') then raise exception 'bad_scope'; end if;

  -- Toplu işlemde yazara "promptunu düzenledi" bildirimi gitmesin (bkz. `record_prompt_edit`); işaret yalnız bu işlemde geçerli.
  perform set_config('promptly.bulk_template_convert', 'on', true);

  for r in
    select p.id, p.prompt_text from public.prompts p
      where p.id = any (p_ids) and p.community_id is null and p.team_file_id is null and p.deleted_at is null
        and (p_scope = 'all' or p.author_id = auth.uid())
        and p.prompt_text like '%${%'
      order by p.id
      for update
  loop
    select coalesce(array_agg(v.name), '{}') into v_existing from public.prompt_variables v where v.prompt_id = r.id;
    v_conv := public._template_var_convert(r.prompt_text, v_existing);
    continue when (v_conv ->> 'replaced')::integer = 0;

    select coalesce(max(v.sort_order), -1) into v_sort from public.prompt_variables v where v.prompt_id = r.id;
    for v_var in select * from jsonb_array_elements(v_conv -> 'vars') loop
      continue when (v_var ->> 'existing')::boolean;
      v_sort := v_sort + 1;
      insert into public.prompt_variables (prompt_id, name, default_value, sort_order)
        values (r.id, v_var ->> 'name', v_var ->> 'default', v_sort);
      v_created := v_created + 1;
    end loop;

    update public.prompts set prompt_text = v_conv ->> 'text' where id = r.id;
    v_changed := v_changed + 1;
    v_conflicts := v_conflicts + (v_conv ->> 'conflicts')::integer;
  end loop;

  perform set_config('promptly.bulk_template_convert', 'off', true);
  perform public._admin_log('bulk_convert_template_variables', null,
    jsonb_build_object('scope', p_scope, 'requested', v_total, 'changed', v_changed, 'variables', v_created, 'conflicts', v_conflicts));
  return jsonb_build_object('affected', v_changed, 'skipped', v_total - v_changed, 'variables', v_created, 'conflicts', v_conflicts);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_template_variables_candidates(p_scope text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_total integer;
  v_items jsonb;
begin
  perform public._admin_guard();
  if p_scope is null or p_scope not in ('own', 'all') then raise exception 'bad_scope'; end if;

  with cand as (
    select * from (
      select p.id, p.title, pr.username, p.status, p.created_at,
             public._template_var_convert(p.prompt_text, coalesce((select array_agg(v.name) from public.prompt_variables v where v.prompt_id = p.id), '{}')) as conv
      from public.prompts p
      left join public.profiles pr on pr.id = p.author_id
      where p.prompt_text like '%${%' and p.community_id is null and p.team_file_id is null and p.deleted_at is null
        and (p_scope = 'all' or p.author_id = auth.uid())
    ) c
    where (c.conv ->> 'replaced')::integer > 0
  ),
  total as (select count(*) as n from cand),
  page as (select * from cand order by created_at desc, id limit v_limit)
  select (select n from total),
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'author', x.username, 'status', x.status,
           'variables', x.conv -> 'vars', 'conflicts', (x.conv ->> 'conflicts')::integer
         ) order by x.created_at desc, x.id) from page x), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_me_media_begin(p_prompt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_p public.prompts%rowtype;
  v_n integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Denemeler sayılır (başarı değil): saatte 20.
  perform public._rate_limit('api_me_media', 20, interval '1 hour');
  select * into v_p from public.prompts
   where id = p_prompt_id and author_id = v_uid and community_id is null and team_file_id is null and deleted_at is null;
  if not found then return public._api_me_err('not_found'); end if;
  if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
  if v_p.content_type <> 'image' then return public._api_me_err('not_image_prompt'); end if;
  select count(*) into v_n from public.prompt_media where prompt_id = p_prompt_id;
  if v_n >= 4 then return public._api_me_err('too_many_images'); end if;
  return jsonb_build_object('ok', true, 'userId', v_uid, 'count', v_n);
end $function$;

CREATE OR REPLACE FUNCTION public.api_me_media_commit(p_prompt_id uuid, p_path text, p_url text, p_width integer, p_height integer, p_alt text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_p public.prompts%rowtype;
  v_n integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Yol YALNIZ çağıranın klasöründe, uuid adlı jpg/png/webp olabilir; adres o yolun herkese-açık-biçimli kimlik URL'sidir (CLAUDE.md §7: URL yalnız kimliktir).
  if p_path is null or p_path !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    return public._api_me_err('invalid_path');
  end if;
  if p_url is null or p_url !~ '^https://[^/?#]+/storage/v1/object/public/prompt-media/' or right(p_url, char_length(p_path) + 1) <> '/' || p_path then
    return public._api_me_err('invalid_url');
  end if;
  if p_width is null or p_height is null or p_width not between 1 and 20000 or p_height not between 1 and 20000 then
    return public._api_me_err('invalid_size');
  end if;
  if p_alt is not null and char_length(p_alt) > 300 then return public._api_me_err('invalid_alt'); end if;

  select * into v_p from public.prompts
   where id = p_prompt_id and author_id = v_uid and community_id is null and team_file_id is null and deleted_at is null for update;
  if not found then return public._api_me_err('not_found'); end if;
  if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
  if v_p.content_type <> 'image' then return public._api_me_err('not_image_prompt'); end if;
  select count(*) into v_n from public.prompt_media where prompt_id = p_prompt_id;
  if v_n >= 4 then return public._api_me_err('too_many_images'); end if;

  -- Dosya gerçekten yüklendi mi? (kendi klasörü: Storage okuma politikası izin verir)
  if not exists (select 1 from storage.objects o where o.bucket_id = 'prompt-media' and o.name = p_path) then
    return public._api_me_err('file_missing');
  end if;
  if exists (select 1 from public.prompt_media m where m.url = p_url) then return public._api_me_err('already_attached'); end if;

  insert into public.prompt_media (prompt_id, url, width, height, alt, position)
  values (p_prompt_id, p_url, p_width, p_height, nullif(btrim(p_alt), ''), v_n)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'mediaId', v_id, 'position', v_n, 'count', v_n + 1);
end $function$;

CREATE OR REPLACE FUNCTION public.api_me_preset(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', s.id, 'title', s.title, 'description', s.description, 'contentType', s.content_type, 'category', s.category, 'subcategory', s.subcategory,
    'tools', to_jsonb(coalesce(s.tools, '{}'::text[])),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.preset_tags t where t.preset_id = s.id), '[]'::jsonb),
    'selection', coalesce(s.selection, '{}'::jsonb),
    'status', s.status, 'visibility', s.visibility,
    'createdAt', to_char(s.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(s.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from public.presets s
  where s.id = p_id and s.creator_id = auth.uid() and s.community_id is null and s.team_file_id is null;
$function$;

CREATE OR REPLACE FUNCTION public.api_me_presets(p_limit integer DEFAULT 20, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select s.id, s.title, left(coalesce(s.description, ''), 300), s.content_type, s.status, s.visibility, s.created_at, s.updated_at
  from public.presets s
  where s.creator_id = auth.uid() and s.community_id is null and s.team_file_id is null
    and (p_status is null or s.status = p_status)
    and (p_after_created_at is null or (s.created_at, s.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$function$;

CREATE OR REPLACE FUNCTION public.api_me_prompt(p_id uuid)
 RETURNS TABLE(id uuid, title text, description text, prompt_text text, content_type text, status text, visibility text, tags text[], created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.id, p.title, p.description, p.prompt_text, p.content_type, p.status, p.visibility,
         coalesce((select array_agg(t.tag_slug order by t.tag_slug) from public.prompt_tags t where t.prompt_id = p.id), '{}'::text[]),
         p.created_at, p.updated_at
  from public.prompts p
  where p.id = p_id and p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null and p.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.api_me_prompts(p_limit integer DEFAULT 20, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.id, p.title, left(coalesce(p.description, ''), 300), p.content_type, p.status, p.visibility, p.created_at, p.updated_at
  from public.prompts p
  where p.author_id = auth.uid() and p.community_id is null and p.team_file_id is null and p.deleted_at is null
    and (p_status is null or p.status = p_status)
    and (p_after_created_at is null or (p.created_at, p.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$function$;

CREATE OR REPLACE FUNCTION public.api_me_request(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', r.id, 'title', r.title, 'description', r.description, 'creativeDirection', coalesce(r.creative_direction, ''),
    'contentType', r.content_type, 'category', r.category, 'subcategory', r.subcategory,
    'tools', to_jsonb(coalesce(r.tools, '{}'::text[])),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.prompt_request_tags t where t.request_id = r.id), '[]'::jsonb),
    'status', case when r.is_draft then 'draft' else 'published' end, 'visibility', r.visibility, 'requestStatus', r.status,
    'createdAt', to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(r.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from public.prompt_requests r
  where r.id = p_id and r.author_id = auth.uid() and r.community_id is null and r.team_file_id is null and r.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.api_me_requests(p_limit integer DEFAULT 20, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.id, r.title, left(coalesce(r.description, ''), 300), r.content_type,
         case when r.is_draft then 'draft' else 'published' end, r.visibility, r.created_at, r.updated_at
  from public.prompt_requests r
  where r.author_id = auth.uid() and r.community_id is null and r.team_file_id is null and r.deleted_at is null
    and (p_status is null or p_status = case when r.is_draft then 'draft' else 'published' end)
    and (p_after_created_at is null or (r.created_at, r.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$function$;

CREATE OR REPLACE FUNCTION public.api_me_saved(p_limit integer DEFAULT 20, p_after_saved_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, title text, description text, content_type text, saved_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.id, p.title, left(coalesce(p.description, ''), 300), p.content_type, s.saved_at
  from (
    select ci.prompt_id, max(ci.created_at) as saved_at
    from public.collection_items ci join public.collections c on c.id = ci.collection_id
    where c.owner_id = auth.uid() group by ci.prompt_id
  ) s
  join public.prompts p on p.id = s.prompt_id
  where p.community_id is null and p.team_file_id is null and p.deleted_at is null
    and (p_after_saved_at is null or (s.saved_at, p.id) < (p_after_saved_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.saved_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$function$;

CREATE OR REPLACE FUNCTION public.api_me_update_draft(p_kind text, p_id uuid, p_patch jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_allowed text[];
  v_key text;
  v_p public.prompts%rowtype;
  v_r public.prompt_requests%rowtype;
  v_s public.presets%rowtype;
  v_w public.workflows%rowtype;
  v_current timestamptz;
  v_type text;
  v_cat text;
  v_sub text;
  v_in jsonb;
  v_common jsonb;
  v_has_common boolean;
  v_set_cat boolean;
  v_title text;
  v_desc text;
  v_text text;
  v_dir text;
  v_selection jsonb;
  v_changed text[] := '{}';
  v_tag text;
  v_slug text;
  v_edit jsonb;
  v_pos integer;
  v_n integer;
  v_seen integer[] := '{}';
  v_tools text[];
  v_updated timestamptz;
  v_max integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('prompt', 'request', 'preset', 'workflow') then raise exception 'unsupported_kind'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then return public._api_me_err('invalid_patch'); end if;
  if p_expected_updated_at is null then return public._api_me_err('expected_required', 'expectedUpdatedAt'); end if;

  v_allowed := case p_kind
    when 'prompt' then array['title', 'description', 'promptText', 'contentType', 'category', 'subcategory', 'tools', 'tags']
    when 'request' then array['title', 'description', 'creativeDirection', 'contentType', 'category', 'subcategory', 'tools', 'tags']
    when 'preset' then array['title', 'description', 'contentType', 'category', 'subcategory', 'tools', 'tags', 'selection']
    else array['title', 'description', 'category', 'subcategory', 'tools', 'tags', 'stepEdits'] end;
  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if not (v_key = any (v_allowed)) then return public._api_me_err('unknown_field', v_key); end if;
  end loop;
  if (select count(*) from jsonb_object_keys(p_patch)) = 0 then return public._api_me_err('no_changes'); end if;

  -- === 1. Kaydı kilitle: benim, topluluğa özgü değil, silinmemiş, TASLAK; çakışma denetimi ====================================================
  if p_kind = 'prompt' then
    select * into v_p from public.prompts where id = p_id and author_id = v_uid and community_id is null and team_file_id is null and deleted_at is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if v_p.status <> 'draft' then return public._api_me_err('not_draft'); end if;
    v_current := v_p.updated_at; v_type := v_p.content_type; v_cat := v_p.category; v_sub := v_p.subcategory;
  elsif p_kind = 'request' then
    select * into v_r from public.prompt_requests where id = p_id and author_id = v_uid and community_id is null and team_file_id is null and deleted_at is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if not v_r.is_draft then return public._api_me_err('not_draft'); end if;
    v_current := v_r.updated_at; v_type := v_r.content_type; v_cat := v_r.category; v_sub := v_r.subcategory;
  elsif p_kind = 'preset' then
    select * into v_s from public.presets where id = p_id and creator_id = v_uid and community_id is null and team_file_id is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if v_s.status <> 'draft' then return public._api_me_err('not_draft'); end if;
    v_current := v_s.updated_at; v_type := v_s.content_type; v_cat := v_s.category; v_sub := v_s.subcategory;
  else
    select * into v_w from public.workflows where id = p_id and creator_id = v_uid and community_id is null and team_file_id is null for update;
    if not found then return public._api_me_err('not_found'); end if;
    if v_w.status <> 'draft' then return public._api_me_err('not_draft'); end if;
    v_current := v_w.updated_at; v_type := coalesce(v_w.content_types[1], 'text'); v_cat := v_w.category; v_sub := v_w.subcategory;
  end if;

  if date_trunc('milliseconds', v_current) <> date_trunc('milliseconds', p_expected_updated_at) then
    return jsonb_build_object('ok', false, 'code', 'conflict', 'currentUpdatedAt', to_char(v_current at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- === 2. Doğrulama (hiçbir satır yazılmaz) ==========================================================================================================
  if p_patch ? 'title' then
    v_title := case when jsonb_typeof(p_patch -> 'title') = 'string' then btrim(p_patch ->> 'title', E' \t\r\n') else '' end;
    if v_title = '' then return public._api_me_err('required', 'title'); end if;
    v_max := case when p_kind in ('preset', 'workflow') then 120 else 200 end;
    if char_length(v_title) > v_max then return public._api_me_err('too_long', 'title'); end if;
    v_changed := v_changed || 'title'::text;
  end if;

  if p_patch ? 'description' then
    if jsonb_typeof(p_patch -> 'description') <> 'string' then return public._api_me_err('invalid', 'description'); end if;
    v_desc := btrim(p_patch ->> 'description', E' \t\r\n');
    if p_kind = 'request' and v_desc = '' then return public._api_me_err('required', 'description'); end if;
    v_max := case when p_kind in ('preset', 'workflow') then 1000 else 5000 end;
    if char_length(v_desc) > v_max then return public._api_me_err('too_long', 'description'); end if;
    v_changed := v_changed || 'description'::text;
  end if;

  if p_kind = 'prompt' and p_patch ? 'promptText' then
    v_text := case when jsonb_typeof(p_patch -> 'promptText') = 'string' then btrim(p_patch ->> 'promptText', E' \t\r\n') else '' end;
    if v_text = '' then return public._api_me_err('required', 'promptText'); end if;
    if char_length(v_text) > 50000 then return public._api_me_err('too_long', 'promptText'); end if;
    v_changed := v_changed || 'promptText'::text;
  end if;

  if p_kind = 'request' and p_patch ? 'creativeDirection' then
    if jsonb_typeof(p_patch -> 'creativeDirection') <> 'string' then return public._api_me_err('invalid', 'creativeDirection'); end if;
    v_dir := btrim(p_patch ->> 'creativeDirection', E' \t\r\n');
    if char_length(v_dir) > 5000 then return public._api_me_err('too_long', 'creativeDirection'); end if;
    v_changed := v_changed || 'creativeDirection'::text;
  end if;

  if p_kind <> 'workflow' and p_patch ? 'contentType' then
    if jsonb_typeof(p_patch -> 'contentType') <> 'string' or lower(btrim(p_patch ->> 'contentType')) not in ('image', 'text', 'audio', 'video') then
      return public._api_me_err('invalid_content_type', 'contentType');
    end if;
    v_type := lower(btrim(p_patch ->> 'contentType'));
    v_changed := v_changed || 'contentType'::text;
  end if;

  if p_kind = 'preset' and p_patch ? 'selection' then
    v_selection := p_patch -> 'selection';
    if jsonb_typeof(v_selection) <> 'object' then return public._api_me_err('invalid_selection', 'selection'); end if;
    if char_length(v_selection::text) > 20000 then return public._api_me_err('too_long', 'selection'); end if;
    if exists (
      select 1 from jsonb_each(v_selection) e
      where jsonb_typeof(e.value) not in ('string', 'number', 'boolean', 'array')
         or (jsonb_typeof(e.value) = 'array' and exists (select 1 from jsonb_array_elements(e.value) a where jsonb_typeof(a) not in ('string', 'number', 'boolean')))
    ) then return public._api_me_err('invalid_selection', 'selection'); end if;
    v_changed := v_changed || 'selection'::text;
  end if;

  -- araç / etiket / kategori: `_import_common` (içe aktarmayla AYNI kurallar); yalnız verilen alanlar uygulanır
  v_has_common := p_patch ?| array['category', 'subcategory', 'contentType', 'tools', 'tags'];
  v_set_cat := p_patch ?| array['category', 'subcategory', 'contentType'];
  if v_has_common then
    v_in := jsonb_build_object(
      'tools', case when p_patch ? 'tools' then p_patch -> 'tools' else '[]'::jsonb end,
      'tags', case when p_patch ? 'tags' then p_patch -> 'tags' else '[]'::jsonb end,
      'category', case when p_patch ? 'category' then p_patch -> 'category' else to_jsonb(v_cat) end,
      'subcategory', case when p_patch ? 'subcategory' then p_patch -> 'subcategory' else to_jsonb(v_sub) end);
    v_common := public._import_common(v_in, v_type);
    if not (v_common ->> 'ok')::boolean then return public._api_me_err(v_common ->> 'code', v_common ->> 'field'); end if;
    if p_patch ? 'tools' then v_changed := v_changed || 'tools'::text; end if;
    if p_patch ? 'tags' then v_changed := v_changed || 'tags'::text; end if;
    if p_patch ? 'category' then v_changed := v_changed || 'category'::text; end if;
    if p_patch ? 'subcategory' then v_changed := v_changed || 'subcategory'::text; end if;
  end if;

  -- workflow: mevcut adımların METİNLERİ (yapı, sıra, bağlantı ve prompt değişmez)
  if p_kind = 'workflow' and p_patch ? 'stepEdits' then
    if jsonb_typeof(p_patch -> 'stepEdits') <> 'array' or jsonb_array_length(p_patch -> 'stepEdits') = 0 or jsonb_array_length(p_patch -> 'stepEdits') > 30 then
      return public._api_me_err('invalid_steps', 'stepEdits');
    end if;
    select count(*) into v_n from public.workflow_steps where workflow_id = p_id;
    for v_edit in select value from jsonb_array_elements(p_patch -> 'stepEdits') loop
      if jsonb_typeof(v_edit) <> 'object' or jsonb_typeof(v_edit -> 'position') <> 'number' or (v_edit ->> 'position') !~ '^[0-9]{1,3}$' then
        return public._api_me_err('invalid_steps', 'stepEdits');
      end if;
      v_pos := (v_edit ->> 'position')::integer;
      if v_pos < 1 or v_pos > v_n or v_pos = any (v_seen) then return public._api_me_err('invalid_steps', 'stepEdits'); end if;
      v_seen := v_seen || v_pos;
      if not (v_edit ?| array['title', 'description', 'instructions']) then return public._api_me_err('invalid_steps', 'stepEdits'); end if;
      if exists (select 1 from jsonb_each(v_edit) e where e.key not in ('position', 'title', 'description', 'instructions')) then
        return public._api_me_err('invalid_steps', 'stepEdits');
      end if;
      if (v_edit ? 'title' and (jsonb_typeof(v_edit -> 'title') <> 'string' or char_length(btrim(v_edit ->> 'title')) > 200))
         or (v_edit ? 'description' and (jsonb_typeof(v_edit -> 'description') <> 'string' or char_length(v_edit ->> 'description') > 1000))
         or (v_edit ? 'instructions' and (jsonb_typeof(v_edit -> 'instructions') <> 'string' or char_length(v_edit ->> 'instructions') > 5000)) then
        return public._api_me_err('too_long', 'stepEdits');
      end if;
    end loop;
    v_changed := v_changed || 'stepEdits'::text;
  end if;

  -- === 3. Yazma (tek işlem; ana UPDATE HER ZAMAN çalışır: `*_set_updated_at` tetikleyicisi belirteci yeniler) ====================================
  v_tools := case when p_patch ? 'tools' then coalesce((select array_agg(t) from jsonb_array_elements_text(v_common -> 'tools') t), '{}') else null end;

  if p_kind = 'prompt' then
    update public.prompts set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      prompt_text = case when p_patch ? 'promptText' then v_text else prompt_text end,
      content_type = v_type,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools)
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.prompt_tags where prompt_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.prompt_tags (prompt_id, tag_slug, source) values (p_id, v_slug, 'manual') on conflict do nothing;
      end loop;
    end if;
    select updated_at into v_updated from public.prompts where id = p_id;
  elsif p_kind = 'request' then
    update public.prompt_requests set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      creative_direction = case when p_patch ? 'creativeDirection' then nullif(v_dir, '') else creative_direction end,
      content_type = v_type,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools)
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.prompt_request_tags where request_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.prompt_request_tags (request_id, tag_slug) values (p_id, v_slug) on conflict do nothing;
      end loop;
    end if;
    select updated_at into v_updated from public.prompt_requests where id = p_id;
  elsif p_kind = 'preset' then
    update public.presets set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      content_type = v_type,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools),
      selection = case when p_patch ? 'selection' then v_selection else selection end
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.preset_tags where preset_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.preset_tags (preset_id, tag_slug) values (p_id, v_slug) on conflict do nothing;
      end loop;
    end if;
    select updated_at into v_updated from public.presets where id = p_id;
  else
    update public.workflows set
      title = case when p_patch ? 'title' then v_title else title end,
      description = case when p_patch ? 'description' then v_desc else description end,
      category = case when v_set_cat then nullif(v_common ->> 'category', '') else category end,
      subcategory = case when v_set_cat then nullif(v_common ->> 'subcategory', '') else subcategory end,
      tools = coalesce(v_tools, tools)
    where id = p_id;
    if p_patch ? 'tags' then
      delete from public.workflow_tags where workflow_id = p_id;
      for v_tag in select t from jsonb_array_elements_text(v_common -> 'tags') t loop
        select slug into v_slug from public.get_or_create_tag(v_tag);
        insert into public.workflow_tags (workflow_id, tag_slug) values (p_id, v_slug) on conflict do nothing;
      end loop;
    end if;
    if p_patch ? 'stepEdits' then
      for v_edit in select value from jsonb_array_elements(p_patch -> 'stepEdits') loop
        update public.workflow_steps ws set
          title = case when v_edit ? 'title' then btrim(v_edit ->> 'title') else ws.title end,
          description = case when v_edit ? 'description' then v_edit ->> 'description' else ws.description end,
          instructions = case when v_edit ? 'instructions' then v_edit ->> 'instructions' else ws.instructions end
        where ws.id = (select q.id from (select s2.id, row_number() over (order by s2.position, s2.created_at, s2.id) as n
                                         from public.workflow_steps s2 where s2.workflow_id = p_id) q where q.n = (v_edit ->> 'position')::integer);
      end loop;
    end if;
    select updated_at into v_updated from public.workflows where id = p_id;
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'changed', to_jsonb(v_changed),
    'warnings', coalesce(v_common -> 'warnings', '[]'::jsonb),
    'updatedAt', to_char(v_updated at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_me_workflow(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', w.id, 'title', w.title, 'description', w.description, 'contentTypes', to_jsonb(coalesce(w.content_types, '{}'::text[])),
    'category', w.category, 'subcategory', w.subcategory, 'tools', to_jsonb(coalesce(w.tools, '{}'::text[])),
    'tags', coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.workflow_tags t where t.workflow_id = w.id), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('position', q.n, 'title', q.title, 'description', q.description, 'instructions', q.instructions,
                                          'promptId', q.prompt_id, 'inputs', coalesce(q.inputs, '[]'::jsonb), 'outputs', coalesce(q.outputs, '[]'::jsonb)) order by q.n)
      from (select ws.title, ws.description, ws.instructions, ws.prompt_id, ws.inputs, ws.outputs,
                   row_number() over (order by ws.position, ws.created_at, ws.id) as n
            from public.workflow_steps ws where ws.workflow_id = w.id) q), '[]'::jsonb),
    'status', w.status, 'visibility', w.visibility,
    'createdAt', to_char(w.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(w.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from public.workflows w
  where w.id = p_id and w.creator_id = auth.uid() and w.community_id is null and w.team_file_id is null;
$function$;

CREATE OR REPLACE FUNCTION public.api_me_workflows(p_limit integer DEFAULT 20, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, title text, description text, content_type text, status text, visibility text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select w.id, w.title, left(coalesce(w.description, ''), 300), coalesce(array_to_string(w.content_types, ','), ''), w.status, w.visibility, w.created_at, w.updated_at
  from public.workflows w
  where w.creator_id = auth.uid() and w.community_id is null and w.team_file_id is null
    and (p_status is null or w.status = p_status)
    and (p_after_created_at is null or (w.created_at, w.id) < (p_after_created_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by w.created_at desc, w.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 51);
$function$;

CREATE OR REPLACE FUNCTION public.creator_insights_api(p_days integer DEFAULT 30)
 RETURNS TABLE(api_uses integer, prev_api_uses integer, mcp_uses integer, prev_mcp_uses integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  select
    coalesce(sum(u.uses) filter (where u.source = 'api' and u.day >= v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'api' and u.day < v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'mcp' and u.day >= v_start), 0)::integer,
    coalesce(sum(u.uses) filter (where u.source = 'mcp' and u.day < v_start), 0)::integer
  from public.public_api_prompt_uses u
  where u.day between v_prev and v_end
    and u.prompt_id in (
      select p.id from public.prompts p
      where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
        and p.deleted_at is null and p.community_id is null and p.team_file_id is null
    );
end $function$;

CREATE OR REPLACE FUNCTION public.creator_insights_daily(p_days integer DEFAULT 30)
 RETURNS TABLE(day date, copies integer, reactions integer, comments integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end into v_start, v_end from public._creator_insights_window(p_days) w;

  return query
  with mine as (
    select p.id from public.prompts p
    where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null and p.team_file_id is null
  ),
  cp as (
    select e.day as d, count(*)::integer as n from public.prompt_copy_events e
    where e.prompt_id in (select id from mine) and e.day between v_start and v_end and e.user_id <> v_me
    group by e.day
  ),
  rx as (
    select (l.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_likes l
    where l.prompt_id in (select id from mine) and l.user_id <> v_me
      and (l.created_at at time zone 'utc')::date between v_start and v_end
    group by 1
  ),
  cm as (
    select (c.created_at at time zone 'utc')::date as d, count(*)::integer as n from public.prompt_comments c
    where c.prompt_id in (select id from mine) and c.author_id <> v_me and c.deleted_at is null
      and (c.created_at at time zone 'utc')::date between v_start and v_end
    group by 1
  )
  select g.d::date, coalesce(cp.n, 0), coalesce(rx.n, 0), coalesce(cm.n, 0)
  from generate_series(v_start, v_end, interval '1 day') as g(d)
  left join cp on cp.d = g.d::date
  left join rx on rx.d = g.d::date
  left join cm on cm.d = g.d::date
  order by g.d;
end $function$;

CREATE OR REPLACE FUNCTION public.creator_insights_reaction_mix(p_days integer DEFAULT 30)
 RETURNS TABLE(reaction text, n integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end into v_start, v_end from public._creator_insights_window(p_days) w;

  return query
  select l.reaction, count(*)::integer
  from public.prompt_likes l
  where l.prompt_id in (
      select p.id from public.prompts p
      where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
        and p.deleted_at is null and p.community_id is null and p.team_file_id is null
    )
    and l.user_id <> v_me
    and (l.created_at at time zone 'utc')::date between v_start and v_end
  group by l.reaction
  order by count(*) desc, l.reaction;
end $function$;

CREATE OR REPLACE FUNCTION public.creator_insights_results(p_days integer DEFAULT 30)
 RETURNS TABLE(results integer, prev_results integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  select count(*) filter (where (r.created_at at time zone 'utc')::date >= v_start)::integer,
         count(*) filter (where (r.created_at at time zone 'utc')::date < v_start)::integer
  from public.prompt_results r
  where r.prompt_id in (
      select p.id from public.prompts p
      where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
        and p.deleted_at is null and p.community_id is null and p.team_file_id is null
    )
    and r.creator_id <> v_me
    and (r.created_at at time zone 'utc')::date between v_prev and v_end;
end $function$;

CREATE OR REPLACE FUNCTION public.creator_insights_summary(p_days integer DEFAULT 30)
 RETURNS TABLE(copies integer, prev_copies integer, reactions integer, prev_reactions integer, comments integer, prev_comments integer, saves integer, prev_saves integer, followers integer, prev_followers integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  with mine as (
    select p.id from public.prompts p
    where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null and p.team_file_id is null
  ),
  cp as (
    select count(*) filter (where e.day >= v_start)::integer as cur,
           count(*) filter (where e.day < v_start)::integer as prev
    from public.prompt_copy_events e
    where e.prompt_id in (select id from mine) and e.day between v_prev and v_end and e.user_id <> v_me
  ),
  rx as (
    select count(*) filter (where (l.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (l.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_likes l
    where l.prompt_id in (select id from mine) and l.user_id <> v_me
      and (l.created_at at time zone 'utc')::date between v_prev and v_end
  ),
  cm as (
    select count(*) filter (where (c.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (c.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.prompt_comments c
    where c.prompt_id in (select id from mine) and c.author_id <> v_me and c.deleted_at is null
      and (c.created_at at time zone 'utc')::date between v_prev and v_end
  ),
  sv as (
    select count(*) filter (where d >= v_start)::integer as cur,
           count(*) filter (where d < v_start)::integer as prev
    from (
      select ci.prompt_id, co.owner_id, min((ci.created_at at time zone 'utc')::date) as d
      from public.collection_items ci
      join public.collections co on co.id = ci.collection_id
      where ci.prompt_id in (select id from mine) and co.owner_id <> v_me
      group by ci.prompt_id, co.owner_id
    ) s
    where d between v_prev and v_end
  ),
  fl as (
    select count(*) filter (where (f.created_at at time zone 'utc')::date >= v_start)::integer as cur,
           count(*) filter (where (f.created_at at time zone 'utc')::date < v_start)::integer as prev
    from public.follows f
    where f.following_id = v_me and (f.created_at at time zone 'utc')::date between v_prev and v_end
  )
  select cp.cur, cp.prev, rx.cur, rx.prev, cm.cur, cm.prev, sv.cur, sv.prev, fl.cur, fl.prev
  from cp, rx, cm, sv, fl;
end $function$;

CREATE OR REPLACE FUNCTION public.creator_insights_top(p_days integer DEFAULT 30, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content_type text, tools text[], copies integer, reactions integer, prev_copies integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_start date; v_end date; v_prev date;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select w.win_start, w.win_end, w.prev_start into v_start, v_end, v_prev from public._creator_insights_window(p_days) w;

  return query
  with mine as (
    select p.id, p.title, p.content_type, p.tools, p.created_at from public.prompts p
    where p.author_id = v_me and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null and p.team_file_id is null
  ),
  cp as (
    select e.prompt_id as pid,
           count(*) filter (where e.day >= v_start)::integer as cur,
           count(*) filter (where e.day < v_start)::integer as prev
    from public.prompt_copy_events e
    where e.prompt_id in (select m.id from mine m) and e.day between v_prev and v_end and e.user_id <> v_me
    group by e.prompt_id
  ),
  rx as (
    select l.prompt_id as pid, count(*)::integer as cur from public.prompt_likes l
    where l.prompt_id in (select m.id from mine m) and l.user_id <> v_me
      and (l.created_at at time zone 'utc')::date between v_start and v_end
    group by l.prompt_id
  )
  select m.id, m.title, m.content_type, m.tools,
         coalesce(cp.cur, 0), coalesce(rx.cur, 0), coalesce(cp.prev, 0)
  from mine m
  left join cp on cp.pid = m.id
  left join rx on rx.pid = m.id
  where coalesce(cp.cur, 0) > 0 or coalesce(rx.cur, 0) > 0
  order by coalesce(cp.cur, 0) desc, coalesce(rx.cur, 0) desc, m.created_at desc, m.id
  limit v_limit;
end $function$;

CREATE OR REPLACE FUNCTION public.discover_tool_counts()
 RETURNS TABLE(tool_id text, post_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with posts as (
    select x.id, x.tools from public.prompts x
     where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null
       and (x.origin_type = 'original' or x.show_on_profile) and x.community_id is null and x.team_file_id is null
    union all
    select x.id, x.tools from public.prompt_requests x
     where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
    union all
    select x.id, x.tools from public.workflows x
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
    union all
    select x.id, x.tools from public.presets x
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
  )
  select split_part(r, ':', 1) as tool_id, count(distinct p.id) as post_count
    from posts p, unnest(p.tools) r
   where split_part(r, ':', 1) <> ''
   group by 1
   order by 2 desc, 1;
$function$;

CREATE OR REPLACE FUNCTION public.feed_count(p_content_type text, p_category text, p_subcategory text, p_tag text, p_tool text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    (select count(*) from public.prompts x
      where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
        and (x.origin_type = 'original' or x.show_on_profile)
        and (p_content_type is null or x.content_type = p_content_type)
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)))
  + (select count(*) from public.prompt_requests x
      where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
        and (p_content_type is null or x.content_type = p_content_type)
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)))
  + (select count(*) from public.workflows x
      where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and (p_content_type is null or p_content_type = any (x.content_types))
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)))
  + (select count(*) from public.presets x
      where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
        and (p_content_type is null or x.content_type = p_content_type)
        and (p_category is null or x.category = p_category)
        and (p_subcategory is null or x.subcategory = p_subcategory)
        and (p_tag is null or exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = p_tag))
        and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool)));
$function$;

CREATE OR REPLACE FUNCTION public.feed_page(p_scope text, p_order text, p_kinds text[], p_content_type text, p_category text, p_subcategory text, p_limit integer, p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid, p_open_only boolean, p_tag text, p_tool text, p_authors uuid[], p_tags text[], p_tools text[], p_has_media boolean)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select least(greatest(coalesce(p_limit, 24), 1), 50) as lim,
           (p_order = 'popular') as popular,
           (p_order = 'oldest') as oldest,
           (p_order = 'used') as used,
           (p_order = 'recommended') as recommended,
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
           (case when pr.used then x.copy_count when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (not coalesce(p_has_media, false)
           or exists (select 1 from public.prompt_media pm where pm.prompt_id = x.id)
           or (x.content_type in ('video', 'audio') and exists (select 1 from public.prompt_results prr where prr.prompt_id = x.id and prr.media_url is not null and prr.media_type in ('video', 'audio'))))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.used then x.copy_count when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.used then x.copy_count when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  request_part as (
    select 'request'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 + x.response_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 + x.response_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 + x.response_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  workflow_part as (
    select 'workflow'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.creator_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (not coalesce(p_has_media, false) or exists (select 1 from public.workflow_media wm where wm.workflow_id = x.id))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
              end)
    order by 4 desc,
             case when pr.oldest then x.created_at end asc, case when pr.oldest then x.id end asc,
             x.created_at desc, x.id desc
    limit (select lim from params)
  ),
  preset_part as (
    select 'preset'::text as kind, x.id, x.created_at,
           (case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
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
      and (p_tags is null or cardinality(p_tags) = 0 or not exists (select 1 from unnest(p_tags) s(slug) where not exists (select 1 from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug = s.slug)))
      and (p_tools is null or cardinality(p_tools) = 0 or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = any (p_tools)))
      and (p_authors is null or cardinality(p_authors) = 0 or x.creator_id = any (p_authors))
      and x.community_id is null and x.team_file_id is null
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
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
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.spaces x, params pr
    where x.shared_at is not null and x.visibility = 'public' and x.archived_at is null
      and (p_kinds is null or 'space' = any (p_kinds))
      and not coalesce(p_has_media, false)
      and not pr.tagged
      and (not pr.following or x.owner_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and (p_authors is null or cardinality(p_authors) = 0 or x.owner_id = any (p_authors))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.shared_at, x.id)
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
           (case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint as sort_rank
    from public.content_quotes x, params pr
    where (p_kinds is null or 'quote' = any (p_kinds))
      and not coalesce(p_has_media, false)
      and not pr.tagged
      and (not pr.following or x.author_id in (select author_id from followed))
      and p_content_type is null and p_category is null and p_subcategory is null and p_tag is null and p_tool is null
      and (p_tags is null or cardinality(p_tags) = 0) and (p_tools is null or cardinality(p_tools) = 0)
      and (p_authors is null or cardinality(p_authors) = 0 or x.author_id = any (p_authors))
      and (p_after_id is null
           or case when pr.oldest
                then ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
                     > (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
                else ((case when pr.recommended then x.like_count * 3 + x.comment_count * 2 when pr.popular then x.like_count else 0 end)::bigint, x.created_at, x.id)
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
$function$;

CREATE OR REPLACE FUNCTION public.feed_page_proven(p_content_type text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_tool text DEFAULT NULL::text, p_limit integer DEFAULT 18, p_after_rank bigint DEFAULT NULL::bigint, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with scored as (
    select x.id, x.created_at,
           s.yes_count, (s.yes_count + s.no_count) as total
    from public.prompts x
    join public.prompt_works_stats s on s.prompt_id = x.id
    where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
      and (x.origin_type = 'original' or x.show_on_profile)
      and (s.yes_count + s.no_count) >= 5
      and (p_content_type is null or x.content_type = p_content_type)
      and (p_category is null or x.category = p_category)
      and (p_subcategory is null or x.subcategory = p_subcategory)
      and (p_tool is null or exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = p_tool))
  ),
  ranked as (
    select id, created_at,
           floor(1000000 * greatest(0,
             ((yes_count::float8 / total) + 3.8416 / (2 * total)
               - 1.96 * sqrt(((yes_count::float8 / total) * (1 - yes_count::float8 / total) + 3.8416 / (4 * total)) / total))
             / (1 + 3.8416 / total)))::bigint as sort_rank
    from scored
  )
  select 'prompt'::text as kind, r.id, r.created_at, r.sort_rank
  from ranked r
  where p_after_id is null
     or (r.sort_rank, r.created_at, r.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id)
  order by r.sort_rank desc, r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 18), 1), 50);
$function$;

CREATE OR REPLACE FUNCTION public.for_you_page(p_as_of timestamp with time zone, p_kinds text[], p_content_type text, p_category text, p_subcategory text, p_limit integer, p_after_rank bigint, p_after_created_at timestamp with time zone, p_after_id uuid)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, sort_rank bigint, reason_kind text, reason_ref text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select least(greatest(coalesce(p_limit, 18), 1), 50) as lim,
           least(coalesce(p_as_of, now()), now()) as as_of,
           auth.uid() as me
  ),
  -- Takip ettiğin kişiler: gönderileri +300 puan alır (Takip Ettiklerim'de ayrıca kronolojik görünürler).
  followed as (
    select f.following_id as author_id from public.follows f, params pr where f.follower_id = pr.me
  ),
  ftags as (
    select t.tag_slug from public.tag_follows t, params pr where t.user_id = pr.me
  ),
  ftools as (
    select t.tool_id from public.tool_follows t, params pr where t.user_id = pr.me
  ),
  my_likes as (
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id
      from public.prompt_likes l, params pr
     where l.user_id = pr.me
     order by l.created_at desc
     limit 300
  ),
  -- Açık geri bildirim (docs/history/275-*): "İlgimi çekiyor / çekmiyor" — son 300 cevap sinyal olur; cevaplanan gönderinin kendisi her durumda elenir (aşağıda).
  my_int as (
    select ci.prompt_id, ci.request_id, ci.workflow_id, ci.preset_id, ci.value
      from public.content_interest ci, params pr
     where ci.user_id = pr.me
     order by ci.created_at desc
     limit 300
  ),
  -- Beğenilen etiketler + "ilgimi çekiyor" dediklerin (aynı hafif artı sinyal).
  ltags as (
    select s.tag_slug, count(*) as n
      from (
        select tg.tag_slug from my_likes l join public.prompt_tags tg on tg.prompt_id = l.prompt_id
        union all select tg.tag_slug from my_likes l join public.prompt_request_tags tg on tg.request_id = l.request_id
        union all select tg.tag_slug from my_likes l join public.workflow_tags tg on tg.workflow_id = l.workflow_id
        union all select tg.tag_slug from my_likes l join public.preset_tags tg on tg.preset_id = l.preset_id
        union all select tg.tag_slug from my_int l join public.prompt_tags tg on tg.prompt_id = l.prompt_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.prompt_request_tags tg on tg.request_id = l.request_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.workflow_tags tg on tg.workflow_id = l.workflow_id where l.value = 'interested'
        union all select tg.tag_slug from my_int l join public.preset_tags tg on tg.preset_id = l.preset_id where l.value = 'interested'
      ) s
     group by s.tag_slug
  ),
  -- "İlgimi çekmiyor" dediklerin etiketleri: eşleşen her etiket küçük bir eksi puandır (tek bir "hayır" bir etiketi öldürmez).
  dtags as (
    select s.tag_slug, count(*) as n
      from (
        select tg.tag_slug from my_int l join public.prompt_tags tg on tg.prompt_id = l.prompt_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.prompt_request_tags tg on tg.request_id = l.request_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.workflow_tags tg on tg.workflow_id = l.workflow_id where l.value = 'not_interested'
        union all select tg.tag_slug from my_int l join public.preset_tags tg on tg.preset_id = l.preset_id where l.value = 'not_interested'
      ) s
     group by s.tag_slug
  ),
  -- Aynı yazarın en az 2 gönderisine "ilgimi çekmiyor" dediysen o yazar geriye düşer (tek bir cevap kişiyi cezalandırmaz).
  dis_authors as (
    select a.author_id
      from (
        select p.author_id from my_int l join public.prompts p on p.id = l.prompt_id where l.value = 'not_interested'
        union all select r.author_id from my_int l join public.prompt_requests r on r.id = l.request_id where l.value = 'not_interested'
        union all select w.creator_id from my_int l join public.workflows w on w.id = l.workflow_id where l.value = 'not_interested'
        union all select s.creator_id from my_int l join public.presets s on s.id = l.preset_id where l.value = 'not_interested'
      ) a
     group by a.author_id
    having count(*) >= 2
  ),
  -- Zaten ilgilendiklerin: koleksiyonlarına kaydettiklerin ve son 60 günde kopyaladıkların tekrar önüne çıkmaz.
  saved as (
    select ci.prompt_id, ci.workflow_id, ci.preset_id
      from public.collection_items ci
      join public.collections c on c.id = ci.collection_id, params pr
     where c.owner_id = pr.me
  ),
  copied as (
    select e.prompt_id from public.prompt_copy_events e, params pr where e.user_id = pr.me and e.created_at > pr.as_of - interval '60 days'
  ),
  -- Profil ilgi alanı (`INTEREST_OPTIONS`, src/features/profile/interest-options.ts) → içerik türü (+ kategori; null = türün tamamı).
  imap (interest, content_type, category) as (
    values
      ('Dijital Sanat', 'image', 'art_illustration'), ('Dijital Sanat', 'image', 'style'),
      ('Fotoğrafçılık', 'image', 'photography'),
      ('Grafik Tasarım', 'image', 'design'), ('Grafik Tasarım', 'image', 'product_commercial'),
      ('Yazılım ve Kodlama', 'text', 'coding'),
      ('Hikaye ve Yaratıcı Yazarlık', 'text', 'writing'), ('Hikaye ve Yaratıcı Yazarlık', 'video', 'story_entertainment'),
      ('Video Üretimi', 'video', null),
      ('Müzik ve Ses', 'audio', null), ('Müzik ve Ses', 'video', 'music_video'),
      ('3D Tasarım', 'video', 'animation'), ('3D Tasarım', 'image', 'style'),
      ('Oyun Geliştirme', 'image', 'human_character'), ('Oyun Geliştirme', 'video', 'animation')
  ),
  my_imap as (
    select m.interest, m.content_type, m.category
      from imap m
      join public.profiles p on m.interest = any (coalesce(p.interests, '{}'::text[]))
      join params pr on p.id = pr.me
  ),
  cand as (
    select 'prompt'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2 + x.copy_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.prompt_tags tg where tg.prompt_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.prompt_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.prompt_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.prompt_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.prompt_id = x.id) as lt_n,
           (select count(*) from public.prompt_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.prompt_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.prompts x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
       and (x.origin_type = 'original' or x.show_on_profile)
       and (p_kinds is null or 'prompt' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.prompt_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.prompt_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.prompt_id = x.id)
       and not exists (select 1 from copied c where c.prompt_id = x.id)
    union all
    select 'request'::text as kind, x.id, x.created_at, x.author_id as author_id, (x.like_count * 3 + x.comment_count * 2 + x.response_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.prompt_request_tags tg where tg.request_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.prompt_request_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.request_id = x.id) as lt_n,
           (select count(*) from public.prompt_request_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.request_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.prompt_requests x, params pr
     where not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null
       and (p_kinds is null or 'request' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.author_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.request_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.request_id = x.id and ci.user_id = pr.me)
    union all
    select 'workflow'::text as kind, x.id, x.created_at, x.creator_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.workflow_tags tg where tg.workflow_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.workflow_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.workflow_id = x.id) as lt_n,
           (select count(*) from public.workflow_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.workflow_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = any (x.content_types) and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.workflows x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
       and (p_kinds is null or 'workflow' = any (p_kinds))
       and (p_content_type is null or p_content_type = any (x.content_types))
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.workflow_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.workflow_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.workflow_id = x.id)
    union all
    select 'preset'::text as kind, x.id, x.created_at, x.creator_id as author_id, (x.like_count * 3 + x.save_count * 2 + x.comment_count * 2)::bigint as eng,
           (select min(tg.tag_slug) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_tag,
           (select count(*) from public.preset_tags tg where tg.preset_id = x.id and tg.tag_slug in (select tag_slug from ftags)) as ft_n,
           (select tg.tag_slug from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id order by lt.n desc, tg.tag_slug limit 1) as lt_tag,
           (select count(*) from public.preset_tags tg join ltags lt on lt.tag_slug = tg.tag_slug where tg.preset_id = x.id) as lt_n,
           (select count(*) from public.preset_tags tg join dtags dt on dt.tag_slug = tg.tag_slug where tg.preset_id = x.id) as dt_n,
           (select min(mi.interest) from my_imap mi where mi.content_type = x.content_type and (mi.category is null or mi.category = x.category)) as im,
           (select min(ft.tool_id) from ftools ft where exists (select 1 from unnest(x.tools) r where split_part(r, ':', 1) = ft.tool_id)) as ftool
      from public.presets x, params pr
     where x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null
       and (p_kinds is null or 'preset' = any (p_kinds))
       and (p_content_type is null or x.content_type = p_content_type)
       and (p_category is null or x.category = p_category)
       and (p_subcategory is null or x.subcategory = p_subcategory)
       and x.creator_id is distinct from pr.me
       and x.created_at <= pr.as_of
       and not exists (select 1 from public.prompt_likes l where l.preset_id = x.id and l.user_id = pr.me)
       and not exists (select 1 from public.content_interest ci where ci.preset_id = x.id and ci.user_id = pr.me)
       and not exists (select 1 from saved s where s.preset_id = x.id)
  ),
  raw as (
    select c.*,
           (300 * (c.author_id in (select author_id from followed))::int
            + 200 * least(c.ft_n, 3)
            + 150 * (c.ftool is not null)::int
            + 150 * (c.im is not null)::int
            + 50 * least(c.lt_n, 3)
            - 60 * least(c.dt_n, 3)
            - 200 * (c.author_id in (select author_id from dis_authors))::int
            + least(round(40 * ln(1 + c.eng)), 200)
            + round(300 * exp(- (extract(epoch from (pr.as_of - c.created_at)) / 3600.0) / 72.0)))::bigint as raw_rank
      from cand c, params pr
  ),
  -- Çeşitlilik: aynı yazarın puana göre 2., 3. … gönderisi −120, −240 … (akış tek kişiyle dolmasın).
  scored as (
    select r.*,
           r.raw_rank - 120 * (row_number() over (partition by r.author_id order by r.raw_rank desc, r.created_at desc, r.id desc) - 1) as sort_rank
      from raw r
  )
  select s.kind, s.id, s.created_at, s.sort_rank::bigint,
         case when s.author_id in (select author_id from followed) then 'creator' when s.ft_tag is not null then 'tag' when s.ftool is not null then 'tool' when s.im is not null then 'interest'
              when s.lt_tag is not null then 'liked_tag' else 'popular' end,
         case when s.author_id in (select author_id from followed) then null when s.ft_tag is not null then s.ft_tag when s.ftool is not null then s.ftool when s.im is not null then s.im
              when s.lt_tag is not null then s.lt_tag else null end
    from scored s, params pr
   where pr.me is not null
     and (p_after_id is null or (s.sort_rank, s.created_at, s.id) < (coalesce(p_after_rank, 0), p_after_created_at, p_after_id))
   order by s.sort_rank desc, s.created_at desc, s.id desc
   limit (select lim from params);
$function$;

CREATE OR REPLACE FUNCTION public.import_workflows(p_items jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_step jsonb;
  v_io jsonb;
  v_idx integer := 0;
  v_pos integer;
  v_results jsonb := '[]'::jsonb;
  v_has_invalid boolean := false;
  v_created integer := 0;
  v_seen text[] := '{}';
  v_key text;
  v_status text;
  v_field text;
  v_code text;
  v_title text;
  v_description text;
  v_type text;
  v_common jsonb;
  v_warnings text[];
  v_keys text[];
  v_step_key text;
  v_ids text[];
  v_out_ids text[];
  v_out_by_key jsonb;
  v_src_key text;
  v_src_out text;
  v_prompt_id uuid;
  v_prompt_type text;
  v_types text[];
  v_new_steps jsonb;
  v_new_conns jsonb;
  v_step_uuids jsonb;
  v_rows jsonb[] := '{}';
  v_row jsonb;
  v_wid uuid;
  v_tag text;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items';
  end if;

  -- === 1. Doğrulama (hiçbir satır yazılmaz) ============================================================================
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    v_status := 'ok';
    v_field := null;
    v_code := null;
    v_common := null;
    v_warnings := '{}';
    v_keys := '{}';
    v_out_by_key := '{}'::jsonb;
    v_new_steps := '[]'::jsonb;
    v_new_conns := '[]'::jsonb;
    v_step_uuids := '{}'::jsonb;
    v_types := '{}';

    if jsonb_typeof(v_item) <> 'object' then
      v_status := 'invalid'; v_field := ''; v_code := 'invalid_row';
    end if;

    if v_status = 'ok' then
      v_title := case when jsonb_typeof(v_item -> 'title') = 'string' then btrim(v_item ->> 'title', E' \t\r\n') else '' end;
      v_description := case when jsonb_typeof(v_item -> 'description') = 'string' then btrim(v_item ->> 'description', E' \t\r\n') else '' end;
      v_type := case when jsonb_typeof(v_item -> 'contentType') = 'string' then lower(btrim(v_item ->> 'contentType')) else '' end;
      if v_title = '' then v_status := 'invalid'; v_field := 'title'; v_code := 'required';
      elsif char_length(v_title) > 120 then v_status := 'invalid'; v_field := 'title'; v_code := 'too_long';
      elsif char_length(v_description) > 1000 then v_status := 'invalid'; v_field := 'description'; v_code := 'too_long';
      elsif v_type not in ('image', 'text', 'audio', 'video') then v_status := 'invalid'; v_field := 'contentType'; v_code := 'invalid_content_type';
      elsif jsonb_typeof(v_item -> 'steps') <> 'array' or jsonb_array_length(v_item -> 'steps') = 0 then v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps';
      elsif jsonb_array_length(v_item -> 'steps') > 30 then v_status := 'invalid'; v_field := 'steps'; v_code := 'too_many_steps';
      end if;
    end if;

    if v_status = 'ok' then
      v_common := public._import_common(v_item, v_type);
      if not (v_common ->> 'ok')::boolean then
        v_status := 'invalid'; v_field := v_common ->> 'field'; v_code := v_common ->> 'code';
      end if;
    end if;

    -- adımlar: sıra = dizi sırası; anahtar benzersiz; kaynak YALNIZ önceki adımın var olan çıktısı
    if v_status = 'ok' then
      v_pos := 0;
      v_types := array[v_type];
      for v_step in select value from jsonb_array_elements(v_item -> 'steps') loop
        v_step_key := case when jsonb_typeof(v_step -> 'key') = 'string' then btrim(v_step ->> 'key') else '' end;
        if jsonb_typeof(v_step) <> 'object' or v_step_key !~ '^[A-Za-z0-9_-]{1,40}$' or v_step_key = any (v_keys) then
          v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
        end if;
        if coalesce(jsonb_typeof(v_step -> 'title'), 'string') not in ('string', 'null')
           or char_length(coalesce(v_step ->> 'title', '')) > 200
           or char_length(coalesce(v_step ->> 'description', '')) > 1000
           or char_length(coalesce(v_step ->> 'instructions', '')) > 5000 then
          v_status := 'invalid'; v_field := 'steps'; v_code := 'too_long'; exit;
        end if;
        v_ids := '{}';
        v_out_ids := '{}';
        -- çıktılar
        if v_step ? 'outputs' and jsonb_typeof(v_step -> 'outputs') <> 'null' then
          if jsonb_typeof(v_step -> 'outputs') <> 'array' or jsonb_array_length(v_step -> 'outputs') > 10 then
            v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
          end if;
          for v_io in select value from jsonb_array_elements(v_step -> 'outputs') loop
            if jsonb_typeof(v_io) <> 'object' or coalesce(v_io ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,60}$'
               or jsonb_typeof(v_io -> 'label') <> 'string' or char_length(btrim(v_io ->> 'label')) not between 1 and 80
               or (v_io ->> 'id') = any (v_out_ids) then
              v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
            end if;
            v_out_ids := v_out_ids || (v_io ->> 'id');
          end loop;
          if v_status <> 'ok' then exit; end if;
        end if;
        -- girdiler
        if v_step ? 'inputs' and jsonb_typeof(v_step -> 'inputs') <> 'null' then
          if jsonb_typeof(v_step -> 'inputs') <> 'array' or jsonb_array_length(v_step -> 'inputs') > 10 then
            v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
          end if;
          for v_io in select value from jsonb_array_elements(v_step -> 'inputs') loop
            if jsonb_typeof(v_io) <> 'object' or coalesce(v_io ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,60}$'
               or jsonb_typeof(v_io -> 'label') <> 'string' or char_length(btrim(v_io ->> 'label')) not between 1 and 80
               or (v_io ->> 'id') = any (v_ids) then
              v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_steps'; exit;
            end if;
            v_ids := v_ids || (v_io ->> 'id');
            if jsonb_typeof(v_io -> 'source') = 'object' then
              v_src_key := v_io -> 'source' ->> 'step';
              v_src_out := v_io -> 'source' ->> 'output';
              if v_src_key is null or not (v_src_key = any (v_keys))
                 or not (coalesce(v_out_by_key -> v_src_key, '[]'::jsonb) ? v_src_out) then
                v_status := 'invalid'; v_field := 'steps'; v_code := 'invalid_connection'; exit;
              end if;
              v_new_conns := v_new_conns || jsonb_build_array(jsonb_build_object('from_key', v_src_key, 'output_key', v_src_out, 'to_key', v_step_key, 'input_key', v_io ->> 'id'));
            end if;
          end loop;
          if v_status <> 'ok' then exit; end if;
        end if;
        -- başvurulan prompt: yalnız okunabilir + herkese açık + yayında + topluluksuz + silinmemiş
        v_prompt_id := null;
        if jsonb_typeof(v_step -> 'prompt') = 'object' and (v_step -> 'prompt' ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          select p.id, p.content_type into v_prompt_id, v_prompt_type from public.prompts p
           where p.id = (v_step -> 'prompt' ->> 'id')::uuid and p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.team_file_id is null and p.deleted_at is null;
          if v_prompt_id is null then
            v_warnings := array_append(v_warnings, 'prompt_unavailable'::text);
          elsif not (v_prompt_type = any (v_types)) then
            v_types := v_types || v_prompt_type;
          end if;
        end if;
        v_keys := v_keys || v_step_key;
        v_out_by_key := v_out_by_key || jsonb_build_object(v_step_key, to_jsonb(v_out_ids));
        v_step_uuids := v_step_uuids || jsonb_build_object(v_step_key, gen_random_uuid()::text);
        v_new_steps := v_new_steps || jsonb_build_array(jsonb_build_object(
          'key', v_step_key, 'position', v_pos,
          'title', btrim(coalesce(v_step ->> 'title', '')), 'description', btrim(coalesce(v_step ->> 'description', '')),
          'instructions', btrim(coalesce(v_step ->> 'instructions', '')), 'prompt_id', v_prompt_id,
          'inputs', coalesce(v_step -> 'inputs', '[]'::jsonb), 'outputs', coalesce(v_step -> 'outputs', '[]'::jsonb)));
        v_pos := v_pos + 1;
      end loop;
    end if;

    -- yineleme: aynı yazarda aynı başlık + açıklama + adım yapısı ya da aynı dosyada iki kez
    if v_status = 'ok' then
      v_key := md5(v_title || chr(1) || v_description || chr(1) || (v_item -> 'steps')::text);
      if v_key = any (v_seen) or exists (select 1 from public.workflows where creator_id = v_uid and title = v_title and description = v_description) then
        v_status := 'duplicate';
      else
        v_seen := v_seen || v_key;
      end if;
    end if;

    if v_status = 'invalid' then
      v_has_invalid := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_idx, 'status', v_status, 'field', v_field, 'code', v_code));
    else
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'index', v_idx, 'status', v_status,
        'warnings', case when cardinality(v_warnings) > 0 or (v_common is not null and jsonb_array_length(v_common -> 'warnings') > 0)
                         then (select coalesce(jsonb_agg(distinct w), '[]'::jsonb) from (
                                 select unnest(v_warnings) as w union all select jsonb_array_elements_text(v_common -> 'warnings')) q)
                         else null end)));
      if v_status = 'ok' then
        v_rows := v_rows || jsonb_build_object(
          'index', v_idx, 'title', v_title, 'description', v_description, 'types', to_jsonb(v_types),
          'category', v_common -> 'category', 'subcategory', v_common -> 'subcategory',
          'tools', v_common -> 'tools', 'tags', v_common -> 'tags',
          'steps', v_new_steps, 'connections', v_new_conns, 'uuids', v_step_uuids);
      end if;
    end if;
  end loop;

  if v_has_invalid or p_dry_run then
    return jsonb_build_object('dryRun', p_dry_run, 'ok', not v_has_invalid, 'created', 0, 'items', v_results);
  end if;

  -- === 2. Yazma (tek işlem; hız sınırı ya da başka bir hata hepsini geri alır) ===========================================
  foreach v_row in array v_rows loop
    insert into public.workflows (creator_id, title, description, content_types, category, subcategory, tools, status, visibility)
    values (v_uid, v_row ->> 'title', v_row ->> 'description',
            coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'types') t), '{}'),
            nullif(v_row ->> 'category', ''), nullif(v_row ->> 'subcategory', ''),
            coalesce((select array_agg(t) from jsonb_array_elements_text(v_row -> 'tools') t), '{}'), 'draft', 'private')
    returning id into v_wid;

    for v_tag in select t from jsonb_array_elements_text(v_row -> 'tags') t loop
      select slug into v_slug from public.get_or_create_tag(v_tag);
      insert into public.workflow_tags (workflow_id, tag_slug) values (v_wid, v_slug) on conflict do nothing;
    end loop;

    perform public.save_workflow_graph(
      v_wid,
      (select coalesce(jsonb_agg(jsonb_build_object(
          'id', (v_row -> 'uuids' ->> (s ->> 'key')), 'position', (s ->> 'position')::int,
          'title', s ->> 'title', 'description', s ->> 'description', 'instructions', s ->> 'instructions',
          'step_type', 'prompt', 'prompt_id', s -> 'prompt_id',
          -- girişlerin `source`'u dosyadaki adım anahtarından yeni adım kimliğine çevrilir
          'inputs', (select coalesce(jsonb_agg(
                        case when jsonb_typeof(i -> 'source') = 'object'
                             then jsonb_build_object('id', i ->> 'id', 'label', btrim(i ->> 'label'),
                                    'source', jsonb_build_object('stepId', v_row -> 'uuids' ->> (i -> 'source' ->> 'step'), 'outputId', i -> 'source' ->> 'output'))
                             else jsonb_build_object('id', i ->> 'id', 'label', btrim(i ->> 'label'), 'source', null) end order by n), '[]'::jsonb)
                     from jsonb_array_elements(s -> 'inputs') with ordinality as t(i, n)),
          'outputs', (select coalesce(jsonb_agg(jsonb_build_object('id', o ->> 'id', 'label', btrim(o ->> 'label')) order by n), '[]'::jsonb)
                      from jsonb_array_elements(s -> 'outputs') with ordinality as t(o, n))
        ) order by (s ->> 'position')::int), '[]'::jsonb)
         from jsonb_array_elements(v_row -> 'steps') s),
      (select coalesce(jsonb_agg(jsonb_build_object(
          'from_step_id', v_row -> 'uuids' ->> (c ->> 'from_key'), 'to_step_id', v_row -> 'uuids' ->> (c ->> 'to_key'),
          'output_key', c ->> 'output_key', 'input_key', c ->> 'input_key')), '[]'::jsonb)
         from jsonb_array_elements(v_row -> 'connections') c));

    v_results := (select jsonb_agg(case when (e.r ->> 'index')::integer = (v_row ->> 'index')::integer then e.r || jsonb_build_object('id', v_wid) else e.r end order by e.n)
                  from jsonb_array_elements(v_results) with ordinality as e(r, n));
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('dryRun', false, 'ok', true, 'created', v_created, 'items', v_results);
end;
$function$;

CREATE OR REPLACE FUNCTION public.profile_content_stats(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'prompts', (select count(*) from public.prompts x
                 where x.author_id = p_user and x.community_id is null and x.team_file_id is null and x.deleted_at is null and x.status <> 'draft'
                   and (x.origin_type = 'original' or x.show_on_profile)),
    'reuse', (select coalesce(sum(x.copy_count), 0) from public.prompts x
               where x.author_id = p_user and x.community_id is null and x.team_file_id is null and x.deleted_at is null and x.status <> 'draft'
                 and (x.origin_type = 'original' or x.show_on_profile)),
    'requests', (select count(*) from public.prompt_requests x
                  where x.author_id = p_user and x.community_id is null and x.team_file_id is null and x.deleted_at is null and not x.is_draft),
    'workflows', (select count(*) from public.workflows x
                   where x.creator_id = p_user and x.community_id is null and x.team_file_id is null and x.status = 'published'),
    'presets', (select count(*) from public.presets x
                 where x.creator_id = p_user and x.community_id is null and x.team_file_id is null and x.status = 'published')
  );
$function$;

CREATE OR REPLACE FUNCTION public.profile_result_count(p_creator uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select count(*)
  from public.prompt_results r
  left join public.prompts p on p.id = r.prompt_id
  where r.creator_id = p_creator
    and (r.prompt_id is null or (p.id is not null and p.community_id is null and p.team_file_id is null))
$function$;

CREATE OR REPLACE FUNCTION public.profile_results(p_creator uuid, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, prompt_id uuid, prompt_title text, media_type text, thumbnail_url text, text_content text, tool text, has_modification boolean, like_count integer, created_at timestamp with time zone, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.id, r.prompt_id, p.title, r.media_type, r.thumbnail_url, r.text_content, r.tool, r.has_modification, r.like_count, r.created_at,
         count(*) over ()
  from public.prompt_results r
  left join public.prompts p on p.id = r.prompt_id
  where r.creator_id = p_creator
    and (r.prompt_id is null or (p.id is not null and p.community_id is null and p.team_file_id is null))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$function$;

CREATE OR REPLACE FUNCTION public.prompt_works_for_users(p_prompt_id uuid, p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, works boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
begin
  if p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_user_ids, 1) > 100 then
    raise exception 'too_many_ids';
  end if;

  if not exists (
    select 1 from public.prompts p
    where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null
  ) then
    return;
  end if;

  return query
  select v.user_id, v.works
  from public.prompt_works_votes v
  where v.prompt_id = p_prompt_id
    and v.user_id = any (p_user_ids)
    and (
      exists (select 1 from public.prompt_comments c where c.prompt_id = p_prompt_id and c.author_id = v.user_id and c.deleted_at is null)
      or exists (select 1 from public.prompt_results r where r.prompt_id = p_prompt_id and r.creator_id = v.user_id)
    )
    and (v_me is null or v.user_id = v_me or not public.is_blocked(v_me, v.user_id));
end $function$;

CREATE OR REPLACE FUNCTION public.prompt_works_state(p_prompt_id uuid)
 RETURNS TABLE(yes_count integer, no_count integer, my_vote boolean, can_vote boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_author uuid;
begin
  select p.author_id into v_author from public.prompts p
  where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null;
  if not found then
    return query select 0, 0, null::boolean, false;
    return;
  end if;
  return query
  select coalesce(s.yes_count, 0), coalesce(s.no_count, 0),
         case when v_me is null then null else (select v.works from public.prompt_works_votes v where v.prompt_id = p_prompt_id and v.user_id = v_me) end,
         (v_me is not null and v_me <> v_author and not public.is_blocked(v_me, v_author)
            and exists (select 1 from public.prompt_copy_events e where e.prompt_id = p_prompt_id and e.user_id = v_me))
  from (select 1) as one left join public.prompt_works_stats s on s.prompt_id = p_prompt_id;
end $function$;

CREATE OR REPLACE FUNCTION public.record_public_api_prompt_use(p_secret text, p_prompt_id uuid, p_source text, p_client text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text;
  v_day date := (now() at time zone 'utc')::date;
  v_distinct integer;
  v_inserted integer;
begin
  select c.secret_hash into v_hash from public.public_api_rate_limit_config c where c.id;
  if v_hash is null or p_secret is null or p_secret = '' or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> v_hash then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_prompt_id is null or p_source is null or p_source not in ('api', 'mcp')
     or p_client is null or char_length(p_client) not between 8 and 64 then
    raise exception 'bad_request' using errcode = '22023';
  end if;

  -- Mükerrer kaydı yalnız bugünü tutar (IP özeti en çok bir gün).
  delete from public.public_api_prompt_use_seen where day < v_day;

  if not exists (
    select 1 from public.prompts p
    where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public'
      and p.deleted_at is null and p.community_id is null and p.team_file_id is null
  ) then
    return false;
  end if;

  select count(*) into v_distinct from public.public_api_prompt_use_seen s where s.client_hash = p_client and s.day = v_day;
  if v_distinct >= 100 then return false; end if;

  insert into public.public_api_prompt_use_seen (prompt_id, source, client_hash, day)
  values (p_prompt_id, p_source, p_client, v_day)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  insert into public.public_api_prompt_uses as u (prompt_id, source, day, uses)
  values (p_prompt_id, p_source, v_day, 1)
  on conflict (prompt_id, source, day) do update set uses = u.uses + 1;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.related_prompts(p_prompt_id uuid, p_limit integer DEFAULT 4)
 RETURNS TABLE(id uuid, dna_hits integer, tag_hits integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with src as (
    select p.id, p.author_id, p.content_type, p.category, p.subcategory
    from public.prompts p
    where p.id = p_prompt_id
  ),
  total as (
    select greatest(count(*), 1) as n
    from public.prompts p
    where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null
  ),
  src_tok as (
    select distinct s1.type, t.tok
    from public.prompt_dna_sections s1
    cross join lateral unnest(s1.tokens) as t(tok)
    where s1.prompt_id = p_prompt_id
      and s1.type <> all (array['output', 'format', 'language', 'negative', 'platform', 'constraints', 'custom'])
  ),
  tok_df as (
    select u.tok, count(distinct s.id) as df
    from public.prompt_dna_sections s
    cross join lateral unnest(s.tokens) as u(tok)
    where u.tok in (select tok from src_tok)
    group by u.tok
  ),
  src_types as (
    select st.type, array_agg(st.tok) as toks
    from src_tok st
    join tok_df d on d.tok = st.tok
    where d.df * 20 <= (select n from total)
    group by st.type
  ),
  dna as (
    select s2.prompt_id as id, count(distinct s2.type)::integer as hits
    from src_types d
    join public.prompt_dna_sections s2 on s2.type = d.type and s2.tokens && d.toks
    where s2.prompt_id <> p_prompt_id
    group by s2.prompt_id
  ),
  tg as (
    select t2.prompt_id as id, count(*)::integer as hits
    from public.prompt_tags t1
    join public.prompt_tags t2 on t2.tag_slug = t1.tag_slug and t2.prompt_id <> t1.prompt_id
    where t1.prompt_id = p_prompt_id
    group by t2.prompt_id
  ),
  cat as (
    select p.id
    from public.prompts p, src
    where src.category is not null and p.content_type = src.content_type and p.category = src.category and p.id <> src.id
  ),
  cand as (
    select id from dna union select id from tg union select id from cat
  )
  select p.id, coalesce(dna.hits, 0) as dna_hits, coalesce(tg.hits, 0) as tag_hits
  from cand c
  join public.prompts p on p.id = c.id
  cross join src
  left join dna on dna.id = p.id
  left join tg on tg.id = p.id
  where p.id <> src.id
    and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null
    and (p.origin_type = 'original' or p.show_on_profile)
  order by least(coalesce(dna.hits, 0), 4) * 2
           + least(coalesce(tg.hits, 0), 3) * 3
           + (case when src.category is not null and p.content_type = src.content_type and p.category = src.category then 3 else 0 end)
           + (case when src.category is not null and src.subcategory is not null and p.content_type = src.content_type
                        and p.category = src.category and p.subcategory is not distinct from src.subcategory then 2 else 0 end) desc,
           (p.author_id = src.author_id) desc,
           (p.content_type = src.content_type) desc,
           p.like_count desc,
           p.id
  limit least(greatest(coalesce(p_limit, 4), 1), 12);
$function$;

CREATE OR REPLACE FUNCTION public.set_content_interest(p_kind text, p_id uuid, p_value text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_ok boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_kind not in ('prompt', 'request', 'workflow', 'preset') or p_id is null or (p_value is not null and p_value not in ('interested', 'not_interested')) then
    raise exception 'invalid_interest';
  end if;

  v_ok := case p_kind
    when 'prompt' then exists (select 1 from public.prompts x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null and x.author_id <> v_user)
    when 'request' then exists (select 1 from public.prompt_requests x where x.id = p_id and not x.is_draft and x.visibility = 'public' and x.deleted_at is null and x.community_id is null and x.team_file_id is null and x.author_id <> v_user)
    when 'workflow' then exists (select 1 from public.workflows x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null and x.creator_id <> v_user)
    else exists (select 1 from public.presets x where x.id = p_id and x.status = 'published' and x.visibility = 'public' and x.community_id is null and x.team_file_id is null and x.creator_id <> v_user)
  end;
  if not v_ok then
    raise exception 'content_not_found';
  end if;

  perform public._rate_limit('content_interest', 200, interval '1 hour');

  if p_value is null then
    if p_kind = 'prompt' then delete from public.content_interest where user_id = v_user and prompt_id = p_id;
    elsif p_kind = 'request' then delete from public.content_interest where user_id = v_user and request_id = p_id;
    elsif p_kind = 'workflow' then delete from public.content_interest where user_id = v_user and workflow_id = p_id;
    else delete from public.content_interest where user_id = v_user and preset_id = p_id;
    end if;
    return null;
  end if;

  if p_kind = 'prompt' then
    insert into public.content_interest (user_id, prompt_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, prompt_id) where prompt_id is not null do update set value = excluded.value, updated_at = now();
  elsif p_kind = 'request' then
    insert into public.content_interest (user_id, request_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, request_id) where request_id is not null do update set value = excluded.value, updated_at = now();
  elsif p_kind = 'workflow' then
    insert into public.content_interest (user_id, workflow_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, workflow_id) where workflow_id is not null do update set value = excluded.value, updated_at = now();
  else
    insert into public.content_interest (user_id, preset_id, value) values (v_user, p_id, p_value)
      on conflict (user_id, preset_id) where preset_id is not null do update set value = excluded.value, updated_at = now();
  end if;
  return p_value;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_prompt_works(p_prompt_id uuid, p_works boolean)
 RETURNS TABLE(yes_count integer, no_count integer, my_vote boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_author uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select p.author_id into v_author from public.prompts p
  where p.id = p_prompt_id and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null;
  if not found then raise exception 'not_found'; end if;
  if v_author = v_me then raise exception 'self_vote_not_allowed'; end if;
  if public.is_blocked(v_me, v_author) then raise exception 'interaction_blocked'; end if;

  if p_works is null then
    delete from public.prompt_works_votes where prompt_id = p_prompt_id and user_id = v_me;
  else
    if not exists (select 1 from public.prompt_copy_events e where e.prompt_id = p_prompt_id and e.user_id = v_me) then
      raise exception 'copy_required';
    end if;
    insert into public.prompt_works_votes (prompt_id, user_id, works) values (p_prompt_id, v_me, p_works)
    on conflict (prompt_id, user_id) do update set works = excluded.works, updated_at = now();
  end if;

  return query
  select coalesce(s.yes_count, 0), coalesce(s.no_count, 0),
         (select v.works from public.prompt_works_votes v where v.prompt_id = p_prompt_id and v.user_id = v_me)
  from (select 1) as one left join public.prompt_works_stats s on s.prompt_id = p_prompt_id;
end $function$;

CREATE OR REPLACE FUNCTION public.suggest_creators(p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, reason_kind text, reason_ref text, reason_count integer, score bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with params as (
    select auth.uid() as me, least(greatest(coalesce(p_limit, 12), 1), 30) as lim
  ),
  -- Ortak takip sinyali için bakılan kişiler: en son takip ettiğim 500 (çok geniş ağda sorgu sınırlı kalsın). "Zaten takip ediyorum" elemesi TAM listeyi kullanır.
  followed_recent as (
    select f.following_id as uid
      from public.follows f, params pr
     where f.follower_id = pr.me
     order by f.created_at desc
     limit 500
  ),
  -- Son 90 günde herkese açık gönderisi olan yazarlar (topluluğa özgü içerik, taslak ve silinmiş sayılmaz).
  posts as (
    select a.author_id, count(*) as n, max(a.created_at) as latest
      from (
        select p.author_id, p.created_at from public.prompts p
         where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null
           and (p.origin_type = 'original' or p.show_on_profile) and p.created_at > now() - interval '90 days'
        union all
        select r.author_id, r.created_at from public.prompt_requests r
         where not r.is_draft and r.visibility = 'public' and r.deleted_at is null and r.community_id is null and r.team_file_id is null and r.created_at > now() - interval '90 days'
        union all
        select w.creator_id, w.created_at from public.workflows w
         where w.status = 'published' and w.visibility = 'public' and w.community_id is null and w.team_file_id is null and w.created_at > now() - interval '90 days'
        union all
        select s.creator_id, s.created_at from public.presets s
         where s.status = 'published' and s.visibility = 'public' and s.community_id is null and s.team_file_id is null and s.created_at > now() - interval '90 days'
      ) a
     group by a.author_id
  ),
  -- Takip ettiklerimin takip ettiği kişiler; neden satırı için bunlardan en yeni takipçinin adı.
  mutual as (
    select f2.following_id as uid, count(*) as n, (array_agg(pf.display_name order by f2.created_at desc))[1] as ref
      from public.follows f2
      join followed_recent fr on fr.uid = f2.follower_id
      join public.profiles pf on pf.id = f2.follower_id
     group by f2.following_id
  ),
  my_likes as (
    select l.prompt_id, l.request_id, l.workflow_id, l.preset_id
      from public.prompt_likes l, params pr
     where l.user_id = pr.me
     order by l.created_at desc
     limit 300
  ),
  liked as (
    select a.author_id as uid, count(*) as n
      from (
        select p.author_id from my_likes l join public.prompts p on p.id = l.prompt_id
        union all select r.author_id from my_likes l join public.prompt_requests r on r.id = l.request_id
        union all select w.creator_id from my_likes l join public.workflows w on w.id = l.workflow_id
        union all select s.creator_id from my_likes l join public.presets s on s.id = l.preset_id
      ) a
     group by a.author_id
  ),
  ftags as (
    select t.tag_slug from public.tag_follows t, params pr where t.user_id = pr.me
  ),
  ftools as (
    select t.tool_id from public.tool_follows t, params pr where t.user_id = pr.me
  ),
  tag_hits as (
    select p.author_id as uid, count(distinct tg.tag_slug) as n, min(tg.tag_slug) as ref
      from public.prompts p
      join public.prompt_tags tg on tg.prompt_id = p.id
     where tg.tag_slug in (select tag_slug from ftags)
       and p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null and p.created_at > now() - interval '90 days'
     group by p.author_id
  ),
  tool_hits as (
    select p.author_id as uid, min(ft.tool_id) as ref
      from public.prompts p
      join ftools ft on exists (select 1 from unnest(p.tools) r where split_part(r, ':', 1) = ft.tool_id)
     where p.status = 'published' and p.visibility = 'public' and p.deleted_at is null and p.community_id is null and p.team_file_id is null and p.created_at > now() - interval '90 days'
     group by p.author_id
  ),
  cand as (
    select pf.id as uid, pf.follower_count, po.latest,
           coalesce(mu.n, 0) as mutual_n, mu.ref as mutual_ref,
           coalesce(li.n, 0) as liked_n,
           coalesce(th.n, 0) as tag_n, th.ref as tag_ref,
           tl.ref as tool_ref
      from public.profiles pf
      join posts po on po.author_id = pf.id
      cross join params pr
      left join mutual mu on mu.uid = pf.id
      left join liked li on li.uid = pf.id
      left join tag_hits th on th.uid = pf.id
      left join tool_hits tl on tl.uid = pf.id
     where pr.me is not null
       and pf.id <> pr.me
       and not exists (select 1 from public.follows f where f.follower_id = pr.me and f.following_id = pf.id)
       and not exists (select 1 from public.creator_suggestion_dismissals d where d.user_id = pr.me and d.creator_id = pf.id)
       and not public.is_blocked(pr.me, pf.id)
       and (pf.suspended_until is null or pf.suspended_until <= now())
  )
  select c.uid,
         case when c.mutual_n > 0 then 'mutual' when c.liked_n > 0 then 'liked' when c.tag_n > 0 then 'tag' when c.tool_ref is not null then 'tool' else 'active' end,
         case when c.mutual_n > 0 then c.mutual_ref when c.liked_n > 0 then null when c.tag_n > 0 then c.tag_ref when c.tool_ref is not null then c.tool_ref else null end,
         case when c.mutual_n > 0 then c.mutual_n when c.liked_n > 0 then c.liked_n when c.tag_n > 0 then c.tag_n else 0 end::integer,
         (case when c.mutual_n > 0 then 300 + 100 * least(c.mutual_n, 4) else 0 end
          + case when c.liked_n > 0 then 150 + 30 * least(c.liked_n, 5) else 0 end
          + 120 * least(c.tag_n, 3)
          + case when c.tool_ref is not null then 100 else 0 end
          + least(round(30 * ln(1 + c.follower_count)), 120)
          + round(100 * exp(- (extract(epoch from (now() - c.latest)) / 86400.0) / 30.0)))::bigint as score
    from cand c
   order by 5 desc, c.uid desc
   limit (select lim from params);
$function$;

CREATE OR REPLACE FUNCTION public.trending_tags(p_limit integer DEFAULT 12, p_window_days integer DEFAULT 7)
 RETURNS TABLE(slug text, label text, recent_count bigint, previous_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (
    select now() - make_interval(days => p_window_days) as mid, now() - make_interval(days => p_window_days * 2) as since
  ),
  counted as (
    select pt.tag_slug as tag_slug,
           count(*) filter (where p.created_at >= b.mid) as recent,
           count(*) filter (where p.created_at < b.mid) as previous
      from bounds b
      join public.prompts p on p.status = 'published' and p.visibility = 'public' and p.community_id is null and p.team_file_id is null and p.deleted_at is null
                           and p.created_at >= b.since
      join public.prompt_tags pt on pt.prompt_id = p.id
     group by pt.tag_slug
    union all
    select rt.tag_slug,
           count(*) filter (where r.created_at >= b.mid),
           count(*) filter (where r.created_at < b.mid)
      from bounds b
      join public.prompt_requests r on not r.is_draft and r.visibility = 'public' and r.community_id is null and r.team_file_id is null and r.deleted_at is null
                                   and r.created_at >= b.since
      join public.prompt_request_tags rt on rt.request_id = r.id
     group by rt.tag_slug
  ),
  summed as (
    select c.tag_slug, sum(c.recent)::bigint as recent_count, sum(c.previous)::bigint as previous_count
      from counted c
     group by c.tag_slug
  )
  select t.slug, t.label, s.recent_count, s.previous_count
    from summed s
    join public.tags t on t.slug = s.tag_slug
   where s.recent_count > 0
   order by (s.recent_count - s.previous_count) desc, s.recent_count desc, t.label asc
   limit p_limit;
$function$;
