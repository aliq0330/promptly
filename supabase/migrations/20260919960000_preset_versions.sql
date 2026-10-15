-- Hazır Ayar (preset) sürüm geçmişi (docs/history/170-*). Workflow ile aynı mimari (20260919950000).
--
-- Snapshot: preset_versions.title/description + `snapshot` jsonb:
--   { "selection": { <alan kimliği>: <değer>, ... },
--     "fields": [ { key, position, name, type, kind, content_types, config,
--                   options: [ { key, label, value, fragment_en, fragment_tr } ] } ] }
-- `key` = alan/seçenek kimliği (preset_fields.id / preset_options.id; editör kaydederken kimliği korur ve
-- `selection` bu alan kimlikleriyle anahtarlıdır, bu yüzden geri dönmede kimlikler korunur).
-- `selection` (alan başına tek değer) hazır ayarın içeriğinin parçasıdır ve editörün bugün de kaydettiği
-- modeldir; platform kataloğunun eski anahtarları olduğu gibi taşınır (eski modele yeni mantık eklenmez).
-- Snapshot dışı: kapak, etiketler, taksonomi (content_type/category/subcategory), tools listesi (öneri
-- metadatası), görünürlük/durum, use_count ve diğer sayaçlar.
--
-- Kayıt yolu (TEK): `save_preset_content()` — varolan bir hazır ayarın sahibi kaydetmesi: başlık/açıklama/selection
-- + alan ağacı tek transaction'da. (Önceden alanlar istemciden ayrı silme+ekleme isteğiyle yazılıyordu: atomik
-- değildi ve eski içerik kaydedilmeden önce sürüme alınamıyordu.) Yeni hazır ayar oluşturma yolu DEĞİŞMEDİ
-- (oluşturma bir düzenleme değildir). İstemci preset_versions'a doğrudan yazamaz.

create table public.preset_versions (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.presets (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source text not null check (source in ('initial', 'owner_edit')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (preset_id, version_number)
);

create index preset_versions_preset_id_idx on public.preset_versions (preset_id, version_number desc);

alter table public.preset_versions enable row level security;

create policy "Preset versions are readable wherever their preset is readable"
  on public.preset_versions for select
  using (exists (select 1 from public.presets p where p.id = preset_versions.preset_id));

revoke insert, update, delete, truncate on table public.preset_versions from anon, authenticated;

create or replace function public._preset_snapshot(p_preset_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'selection', coalesce((select pr.selection from public.presets pr where pr.id = p_preset_id), '{}'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', f.id,
        'position', f.rn - 1,
        'name', f.name,
        'type', f.type,
        'kind', f.kind,
        'content_types', to_jsonb(f.content_types),
        'config', f.config,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'key', o.id,
            'label', o.label,
            'value', o.value,
            'fragment_en', o.fragment_en,
            'fragment_tr', o.fragment_tr
          ) order by o.sort_order, o.created_at, o.id)
          from public.preset_options o
          where o.field_id = f.id
        ), '[]'::jsonb)
      ) order by f.rn)
      from (
        select pf.*, row_number() over (order by pf.sort_order, pf.created_at, pf.id) as rn
        from public.preset_fields pf
        where pf.preset_id = p_preset_id
      ) f
    ), '[]'::jsonb)
  );
$$;

-- Kaydetme ve geri dönmenin ortak yazma adımı. `p_fields` kaydetme biçimindedir:
-- [ { id, name, type, kind, content_types, config, options: [ { id, label, value, fragment_en, fragment_tr } ] } ]
-- (dizi sırası = sort_order). Tablo kısıtları (tip, uzunluklar) yazmada doğrulanır.
create or replace function public._preset_apply_content(
  p_preset_id uuid,
  p_owner_id uuid,
  p_title text,
  p_description text,
  p_selection jsonb,
  p_fields jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.presets
     set title = p_title,
         description = p_description,
         selection = coalesce(p_selection, '{}'::jsonb),
         updated_at = now()
   where id = p_preset_id;

  delete from public.preset_fields where preset_id = p_preset_id;

  insert into public.preset_fields (id, owner_id, preset_id, name, type, kind, content_types, config, sort_order)
  select
    (f.value ->> 'id')::uuid,
    p_owner_id,
    p_preset_id,
    f.value ->> 'name',
    f.value ->> 'type',
    coalesce(nullif(f.value ->> 'kind', ''), 'phrase'),
    coalesce(array(select jsonb_array_elements_text(coalesce(f.value -> 'content_types', '[]'::jsonb))), '{}'::text[]),
    coalesce(f.value -> 'config', '{}'::jsonb),
    (f.ordinality - 1)::int
  from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) with ordinality as f(value, ordinality);

  insert into public.preset_options (id, field_id, label, value, sort_order, fragment_en, fragment_tr)
  select
    (o.value ->> 'id')::uuid,
    (f.value ->> 'id')::uuid,
    o.value ->> 'label',
    o.value ->> 'value',
    (o.ordinality - 1)::int,
    nullif(o.value ->> 'fragment_en', ''),
    nullif(o.value ->> 'fragment_tr', '')
  from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) as f(value)
  cross join lateral jsonb_array_elements(coalesce(f.value -> 'options', '[]'::jsonb)) with ordinality as o(value, ordinality);
end;
$$;

create or replace function public._preset_record_version(
  p_preset_id uuid,
  p_old_title text,
  p_old_description text,
  p_old_snapshot jsonb,
  p_old_created_at timestamptz,
  p_editor uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  pr public.presets%rowtype;
  v_new_snapshot jsonb;
  v_latest public.preset_versions%rowtype;
begin
  select * into pr from public.presets where id = p_preset_id;
  v_new_snapshot := public._preset_snapshot(p_preset_id);

  if p_old_title is not distinct from pr.title
     and p_old_description is not distinct from pr.description
     and p_old_snapshot is not distinct from v_new_snapshot then
    return false;
  end if;

  select * into v_latest from public.preset_versions where preset_id = p_preset_id order by version_number desc limit 1;

  if not found then
    insert into public.preset_versions (preset_id, version_number, title, description, snapshot, source, created_by, created_at)
    values (p_preset_id, 1, p_old_title, p_old_description, p_old_snapshot, 'initial', pr.creator_id, p_old_created_at);
    v_latest.version_number := 1;
  elsif (v_latest.title, v_latest.description, v_latest.snapshot) is distinct from (p_old_title, p_old_description, p_old_snapshot) then
    insert into public.preset_versions (preset_id, version_number, title, description, snapshot, source, created_by, created_at)
    values (p_preset_id, v_latest.version_number + 1, p_old_title, p_old_description, p_old_snapshot, 'owner_edit', pr.creator_id, now());
    v_latest.version_number := v_latest.version_number + 1;
  end if;

  insert into public.preset_versions (preset_id, version_number, title, description, snapshot, source, created_by, created_at)
  values (p_preset_id, v_latest.version_number + 1, pr.title, pr.description, v_new_snapshot, 'owner_edit', coalesce(p_editor, pr.creator_id), now());
  return true;
end;
$$;

revoke all on function public._preset_snapshot(uuid) from public, anon, authenticated;
revoke all on function public._preset_apply_content(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._preset_record_version(uuid, text, text, jsonb, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.save_preset_content(
  p_preset_id uuid,
  p_title text,
  p_description text,
  p_selection jsonb,
  p_fields jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.presets%rowtype;
  v_old_snapshot jsonb;
begin
  select * into pr from public.presets where id = p_preset_id and creator_id = auth.uid() for update;
  if not found then
    raise exception 'preset not found or not yours';
  end if;

  v_old_snapshot := public._preset_snapshot(p_preset_id);
  perform public._preset_apply_content(p_preset_id, pr.creator_id, p_title, p_description, p_selection, p_fields);

  if pr.status = 'draft' then
    return false;
  end if;
  return public._preset_record_version(p_preset_id, pr.title, pr.description, v_old_snapshot, pr.created_at, auth.uid());
end;
$$;

create or replace function public.restore_preset_version(p_version_id uuid, p_preset_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.preset_versions%rowtype;
  pr public.presets%rowtype;
  v_old_snapshot jsonb;
  v_fields jsonb;
begin
  select * into v from public.preset_versions where id = p_version_id;
  if not found then
    raise exception 'version not found';
  end if;
  if p_preset_id is not null and p_preset_id <> v.preset_id then
    raise exception 'version does not belong to this preset';
  end if;
  select * into pr from public.presets where id = v.preset_id and creator_id = auth.uid() for update;
  if not found then
    raise exception 'preset not found or not yours';
  end if;

  v_old_snapshot := public._preset_snapshot(pr.id);
  if pr.title is not distinct from v.title and pr.description is not distinct from v.description
     and v_old_snapshot is not distinct from v.snapshot then
    return false;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f ->> 'key',
      'name', f ->> 'name',
      'type', f ->> 'type',
      'kind', f ->> 'kind',
      'content_types', coalesce(f -> 'content_types', '[]'::jsonb),
      'config', coalesce(f -> 'config', '{}'::jsonb),
      'options', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o ->> 'key',
          'label', o ->> 'label',
          'value', o ->> 'value',
          'fragment_en', o ->> 'fragment_en',
          'fragment_tr', o ->> 'fragment_tr'
        ) order by o_ord)
        from jsonb_array_elements(coalesce(f -> 'options', '[]'::jsonb)) with ordinality as x(o, o_ord)
      ), '[]'::jsonb)
    ) order by (f ->> 'position')::int), '[]'::jsonb)
  into v_fields
  from jsonb_array_elements(coalesce(v.snapshot -> 'fields', '[]'::jsonb)) f;

  perform public._preset_apply_content(pr.id, pr.creator_id, v.title, v.description, v.snapshot -> 'selection', v_fields);
  return public._preset_record_version(pr.id, pr.title, pr.description, v_old_snapshot, pr.created_at, auth.uid());
end;
$$;

revoke all on function public.save_preset_content(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_preset_content(uuid, text, text, jsonb, jsonb) to authenticated;
revoke all on function public.restore_preset_version(uuid, uuid) from public, anon;
grant execute on function public.restore_preset_version(uuid, uuid) to authenticated;
