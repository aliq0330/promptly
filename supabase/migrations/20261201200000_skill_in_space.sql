-- ci:allow-destructive
-- Skill Space'e eklenebilir (docs/history/404-*): `space_items.content_type` CHECK'i 'skill'i kabul eder (kısıt yeniden kurulur, veri silinmez, mevcut satırlar yeni kısıtı zaten sağlar)
-- ve öğe tetikleyicisi Skill kaynağının okunabilirliğini çağıranın RLS'inden doğrular. Başka şey değişmez.

alter table public.space_items drop constraint if exists space_items_content_type_check;
alter table public.space_items add constraint space_items_content_type_check
  check (content_type is null or content_type in ('request', 'workflow', 'preset', 'skill'));

create or replace function public.space_items_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_readable boolean;
begin
  if tg_op = 'UPDATE' then
    -- Kimlik ve kaynak değişmez; yalnız kaynak silindiğinde (ON DELETE SET NULL) null'a düşebilir.
    if new.id <> old.id or new.space_id <> old.space_id or new.kind <> old.kind
       or new.media_url is distinct from old.media_url or new.is_draft <> old.is_draft
       or new.content_type is distinct from old.content_type or new.content_id is distinct from old.content_id
       or (new.prompt_id is distinct from old.prompt_id and new.prompt_id is not null)
       or (new.source_prompt_id is distinct from old.source_prompt_id and new.source_prompt_id is not null)
       or (new.palette_id is distinct from old.palette_id and new.palette_id is not null)
       or (new.created_by is distinct from old.created_by and new.created_by is not null and coalesce(current_setting('promptly.team_sync', true), '') <> '1')
       or new.created_at <> old.created_at then
      raise exception 'space_invalid';
    end if;
    if (new.title, new.body, new.note, new.color, new.is_private, new.attached_item_id)
       is distinct from (old.title, old.body, old.note, old.color, old.is_private, old.attached_item_id) then
      new.updated_at := now();
      new.updated_by := auth.uid();
    end if;
  end if;

  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id)
     and not exists (select 1 from public.space_groups g where g.id = new.group_id and g.space_id = new.space_id) then
    raise exception 'space_invalid';
  end if;
  if new.attached_item_id is not null and (tg_op = 'INSERT' or new.attached_item_id is distinct from old.attached_item_id)
     and (new.kind <> 'note' or new.attached_item_id = new.id
          or not exists (select 1 from public.space_items i where i.id = new.attached_item_id and i.space_id = new.space_id)) then
    raise exception 'space_invalid';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(current_setting('promptly.team_backfill', true), '') <> '1'
       and (select count(*) from public.space_items i where i.space_id = new.space_id) >= 500 then
      raise exception 'space_item_limit';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();
    if new.kind = 'image' then
      if new.is_draft or new.source_prompt_id is not null then
        raise exception 'space_invalid';
      end if;
      if new.prompt_id is not null then
        if not exists (
          select 1 from public.prompt_media pm join public.prompts p on p.id = pm.prompt_id
           where pm.prompt_id = new.prompt_id and pm.url = new.media_url and p.community_id is null
        ) then
          raise exception 'space_source_unavailable';
        end if;
      elsif not public._space_valid_item_media(new.space_id, new.media_url) then
        raise exception 'space_invalid';
      end if;
    elsif new.media_url is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'prompt' then
      if new.is_draft then
        if new.prompt_id is not null then raise exception 'space_invalid'; end if;
        if new.source_prompt_id is not null
           and not exists (select 1 from public.prompts p where p.id = new.source_prompt_id and p.community_id is null) then
          raise exception 'space_source_unavailable';
        end if;
      elsif new.prompt_id is null
         or not exists (select 1 from public.prompts p where p.id = new.prompt_id and p.community_id is null) then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.kind <> 'image' and (new.prompt_id is not null or new.is_draft or new.source_prompt_id is not null) then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'content' then
      v_readable := case new.content_type
        when 'request' then exists (select 1 from public.prompt_requests r where r.id = new.content_id and r.community_id is null)
        when 'workflow' then exists (select 1 from public.workflows w where w.id = new.content_id and w.community_id is null)
        when 'preset' then exists (select 1 from public.presets s where s.id = new.content_id and s.community_id is null)
        -- Skill (docs/history/404-*): okunabilirlik çağıranın RLS'inden geçer (yayında + herkese açık ya da kendi Skill'i).
        when 'skill' then exists (select 1 from public.skills k where k.id = new.content_id)
        else false end;
      if not v_readable then
        raise exception 'space_source_unavailable';
      end if;
    elsif new.content_type is not null or new.content_id is not null then
      raise exception 'space_invalid';
    end if;
    if new.kind = 'palette' then
      if new.palette_id is null
         or not exists (select 1 from public.space_palettes sp where sp.id = new.palette_id and public._space_same_project(sp.space_id, new.space_id)) then
        raise exception 'space_invalid';
      end if;
    elsif new.palette_id is not null then
      raise exception 'space_invalid';
    end if;
  end if;
  return new;
end;
$function$;
