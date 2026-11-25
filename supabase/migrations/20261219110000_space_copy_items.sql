-- Space ↔ Space ↔ ekip dosyası KÖPRÜSÜ (docs/history/461-*): öğeleri bir alandan (kişisel Space ya da ekip dosyasının/panosunun alanı) başka bir alana KOPYALAR.
-- SECURITY INVOKER: kaynağı çağıranın RLS'i okur (taslak/gizli öğe zaten görünmez), hedefe yazma çağıranın RLS'i + öğe tetikleyicileridir (ekip alanında onay
-- durumu çağıranın rolüyle sunucuda belirlenir). Yani bu işlev istemcinin tek tek yapabileceğinden fazlasını yapmaz; yalnız tek işlemde ve kayıpları sayarak yapar.
--
-- KAYIPLAR (sonuçta sayılarla döner, arayüz kullanıcıya söyler): gizli notlar; ekibe özgü içerik (`team_file_id`) ve topluluk içeriği; görseli
-- kopyalanamayanlar (dosya hedef klasöre istemciden kopyalanır, eşleme `p_media`); aynı içerik hedefte zaten varsa; ekip dosyasının ASIL alanına
-- (pano değil) çizim nesneleri (yalnız panoya aittir); onay durumları, ekip değişkenleri, yorumlar (kopyalanmaz). Gruplar adlarıyla, oklar iki ucu da
-- kopyalandıysa kopyalanır.
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
  if p_ids is not null and cardinality(p_ids) > 200 then raise exception 'space_invalid'; end if;
  if not exists (select 1 from public.spaces s where s.id = p_from) then raise exception 'space_not_found'; end if;
  select * into v_to from public.spaces where id = p_to;
  if not found then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(p_to) then raise exception 'space_forbidden'; end if;

  for it in
    select i.* from public.space_items i
     where i.space_id = p_from and (p_ids is null or i.id = any (p_ids))
     order by i.z, i.created_at
     limit 200
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
