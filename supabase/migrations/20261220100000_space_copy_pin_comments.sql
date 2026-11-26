-- Köprü, ikinci dilim (docs/history/462-*): (1) `space_copy_items` bir çağrıda en çok 500 öğe alır (Space'in kendi sınırı 500; eskiden 200'dü ve büyük bir
-- Space'te kalanı sessizce kopyalanmıyordu); (2) `space_copy_pin_comments`: konumlu yorumları (pin) bir panodan başkasına kopyalar.
--
-- Yorum kopyalama SECURITY DEFINER'dır (istemci `space_pin_comments`'a yazamaz); yetkiyi KENDİ denetler: kaynağı okuyabilmeli (`can_read_space`) ve hedefe
-- yazabilmeli (`can_edit_space`), hedef bir PANO olmalı (dosyanın ana alanı pano değildir). Özgün yazar, tarih, düzenleme ve "çözüldü" durumu KORUNUR
-- (kopyalayan kişinin adı altına yazılmaz); hiçbir bildirim üretilmez (bildirimler yalnız `pin_comment_create`'ten gelir). Gizli bir nota bağlı yorum (ve
-- yanıtları) kopyalanmaz; kaynakta çağıranın göremediği (taslak) öğeye bağlı yorum da kopyalanmaz. Eşlenmeyen öğeye bağlı yorum (ör. görseli kopyalanamayan
-- öğe) kaybolmasın diye aynı konumda SERBEST yorum olarak yazılır; `p_floating=false` (seçimle kopyalama) ise yalnız eşlenen öğelerin yorumlarını alır.

create or replace function public.space_copy_items(p_from uuid, p_to uuid, p_ids uuid[] default null, p_media jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_to public.spaces;
  it public.space_items;
  src public.space_items;
  g public.space_groups;
  pal public.space_palettes;
  c public.space_connections;
  v_new uuid; v_url text; v_gid uuid; v_pid uuid;
  v_old uuid[] := '{}'; v_newids uuid[] := '{}';
  v_done integer := 0; v_private integer := 0; v_media integer := 0; v_unavailable integer := 0; v_drawing integer := 0; v_dup integer := 0;
  v_gmap jsonb := '{}'::jsonb; v_pmap jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'space_invalid'; end if;
  if p_ids is not null and cardinality(p_ids) > 500 then raise exception 'space_invalid'; end if;
  if not exists (select 1 from public.spaces s where s.id = p_from) then raise exception 'space_not_found'; end if;
  select * into v_to from public.spaces where id = p_to;
  if not found then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(p_to) then raise exception 'space_forbidden'; end if;

  for it in
    select i.* from public.space_items i
     where i.space_id = p_from and (p_ids is null or i.id = any (p_ids))
     order by i.z, i.created_at
     limit 500
  loop
    -- Yansıma satırı (ekip panosu): içerik asıl öğeden okunur.
    src := it;
    if it.file_item_id is not null then
      select * into src from public.space_items a where a.id = it.file_item_id;
      if not found then v_unavailable := v_unavailable + 1; continue; end if;
    end if;
    if src.is_private then v_private := v_private + 1; continue; end if;
    if src.kind in ('frame', 'text', 'shape') and v_to.team_area_main then v_drawing := v_drawing + 1; continue; end if;

    v_gid := null;
    if it.group_id is not null then
      if v_gmap ? it.group_id::text then
        v_gid := (v_gmap ->> it.group_id::text)::uuid;
      else
        select * into g from public.space_groups x where x.id = it.group_id;
        if found then
          insert into public.space_groups (space_id, name, color, position, created_by)
          values (p_to, g.name, g.color, coalesce((select max(position) + 1 from public.space_groups where space_id = p_to), 0), v_uid)
          returning id into v_gid;
          v_gmap := v_gmap || jsonb_build_object(it.group_id::text, v_gid);
        end if;
      end if;
    end if;

    v_url := null; v_pid := null;
    if src.kind = 'image' and src.prompt_id is null then
      v_url := p_media ->> it.id::text;
      if v_url is null then v_media := v_media + 1; continue; end if;
    elsif src.kind = 'image' then
      v_url := src.media_url;
    end if;
    if src.kind = 'palette' then
      if v_pmap ? src.palette_id::text then
        v_pid := (v_pmap ->> src.palette_id::text)::uuid;
      else
        select * into pal from public.space_palettes x where x.id = src.palette_id;
        if not found then v_unavailable := v_unavailable + 1; continue; end if;
        insert into public.space_palettes (space_id, name, description, colors, source, position, created_by)
        values (p_to, pal.name, pal.description, pal.colors, 'manual', coalesce((select max(position) + 1 from public.space_palettes where space_id = p_to), 0), v_uid)
        returning id into v_pid;
        v_pmap := v_pmap || jsonb_build_object(src.palette_id::text, v_pid);
      end if;
    end if;

    begin
      insert into public.space_items (space_id, kind, x, y, w, h, z, group_id, prompt_id, media_url, media_width, media_height, is_draft, source_prompt_id,
                                      content_type, content_id, palette_id, title, body, note, color, data, created_by)
      values (p_to, src.kind, it.x, it.y, it.w, it.h, it.z, v_gid, src.prompt_id, v_url, src.media_width, src.media_height, src.is_draft, src.source_prompt_id,
              src.content_type, src.content_id, v_pid, src.title, src.body, src.note, src.color, src.data, v_uid)
      returning id into v_new;
      v_old := v_old || it.id;
      v_newids := v_newids || v_new;
      v_done := v_done + 1;
    exception
      when unique_violation then v_dup := v_dup + 1;
      when others then
        -- Kaynak hedefte kullanılamıyor (ekibe özgü/topluluk içeriği, okunamayan kaynak…): bu öğe atlanır, geri kalanı kopyalanır.
        if sqlerrm = 'space_item_limit' then
          raise;
        elsif sqlerrm like 'space_%' or sqlerrm like 'team_%' then
          v_unavailable := v_unavailable + 1;
        else
          raise;
        end if;
    end;
  end loop;

  for c in select x.* from public.space_connections x where x.space_id = p_from and x.from_item_id = any (v_old) and x.to_item_id = any (v_old) loop
    begin
      insert into public.space_connections (space_id, from_item_id, to_item_id, label, line_style, arrow, route, color, created_by)
      values (p_to, v_newids[array_position(v_old, c.from_item_id)], v_newids[array_position(v_old, c.to_item_id)], c.label, c.line_style, c.arrow, c.route, c.color, v_uid);
    exception when unique_violation then null;
    end;
  end loop;

  return jsonb_build_object(
    'done', v_done, 'old_ids', to_jsonb(v_old), 'new_ids', to_jsonb(v_newids),
    'skipped', jsonb_build_object('private_note', v_private, 'media', v_media, 'unavailable', v_unavailable, 'drawing_in_file', v_drawing, 'duplicate', v_dup));
end $$;

revoke execute on function public.space_copy_items(uuid, uuid, uuid[], jsonb) from public, anon;
grant execute on function public.space_copy_items(uuid, uuid, uuid[], jsonb) to authenticated;

create or replace function public.space_copy_pin_comments(p_from uuid, p_to uuid, p_old_ids uuid[] default '{}', p_new_ids uuid[] default '{}', p_floating boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.space_pin_comments;
  v_map jsonb := '{}'::jsonb;
  v_new uuid; v_item uuid; v_roots integer := 0; v_replies integer := 0; v_private integer := 0; v_existing integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'space_invalid'; end if;
  if coalesce(cardinality(p_old_ids), 0) <> coalesce(cardinality(p_new_ids), 0) then raise exception 'space_invalid'; end if;
  if not public.can_read_space(p_from) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(p_to) then raise exception 'space_forbidden'; end if;
  if exists (select 1 from public.spaces s where s.id = p_to and s.team_area_main) then raise exception 'space_invalid'; end if;
  select count(*) into v_existing from public.space_pin_comments c where c.space_id = p_to and c.parent_id is null;

  -- Kökler: eski sıra korunur (created_at); yorumlar kaynağı okuyabilen herkesin göreceği kadarıyla.
  for r in
    select c.* from public.space_pin_comments c
     where c.space_id = p_from and c.parent_id is null
     order by c.created_at, c.id
  loop
    if r.item_id is not null then
      select i.id into v_item from public.space_items i
       where i.id = r.item_id and i.space_id = p_from and (i.rev_state = 'approved' or public._team_item_visible(i.space_id, i.rev_state, i.created_by));
      if not found then continue; end if;                       -- çağıranın göremediği öğe: yorum da görünmez
      if exists (select 1 from public.space_items i where i.id = r.item_id and i.is_private) then v_private := v_private + 1; continue; end if;
    end if;
    v_item := null;
    if r.item_id is not null and array_position(p_old_ids, r.item_id) is not null then v_item := p_new_ids[array_position(p_old_ids, r.item_id)]; end if;
    if r.item_id is not null and v_item is null and not p_floating then continue; end if;
    if r.item_id is null and not p_floating then continue; end if;
    if v_existing + v_roots >= 500 then exit; end if;
    insert into public.space_pin_comments (space_id, parent_id, author_id, body, x, y, item_id, off_x, off_y, resolved_at, resolved_by, edited_at, created_at)
    values (p_to, null, r.author_id, r.body, r.x, r.y, v_item, case when v_item is null then null else r.off_x end, case when v_item is null then null else r.off_y end,
            r.resolved_at, r.resolved_by, r.edited_at, r.created_at)
    returning id into v_new;
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
    v_roots := v_roots + 1;
  end loop;

  -- Yanıtlar: yalnız kopyalanan bir kökün yanıtları.
  for r in
    select c.* from public.space_pin_comments c
     where c.space_id = p_from and c.parent_id is not null and v_map ? c.parent_id::text
     order by c.created_at, c.id
  loop
    insert into public.space_pin_comments (space_id, parent_id, author_id, body, edited_at, created_at)
    values (p_to, (v_map ->> r.parent_id::text)::uuid, r.author_id, r.body, r.edited_at, r.created_at);
    v_replies := v_replies + 1;
  end loop;

  return jsonb_build_object('roots', v_roots, 'replies', v_replies, 'skipped_private', v_private);
end $$;

revoke execute on function public.space_copy_pin_comments(uuid, uuid, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.space_copy_pin_comments(uuid, uuid, uuid[], uuid[], boolean) to authenticated;
