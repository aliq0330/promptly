-- ci:allow-destructive
-- Skill uzmanlık alanları tablo olur + oyda sürüm etiketi (docs/history/399-*).
--
-- 1) `skill_categories` (expand → contract): sekiz değer tabloya TOHUMLANIR; `skills.category` CHECK'i yabancı anahtarla değişir (`drop constraint` = contract adımı; veri silinmez, mevcut
--    değerlerin hepsi tabloda vardır). Yeni uzmanlık alanı artık bir migration/kod dağıtımı değil, tabloya satırdır. Yazma yalnız sahip rolüdür (istemciye kapalı); okuma herkese açık.
--    `import_skills` kategori doğrulamasını tablodan yapar.
-- 2) `skill_works_votes.version`: oyun hangi Skill sürümünde denendiği (isteğe bağlı; Skill'in yayınlanmış bir sürümü olmalı) + `set_skill_works_version` + `skill_works_by_version`.
create table if not exists public.skill_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  label_tr text not null check (char_length(label_tr) between 1 and 40),
  label_en text not null check (char_length(label_en) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.skill_categories (id, label_tr, label_en, position) values
  ('software', 'Yazılım', 'Software', 10),
  ('design', 'Tasarım', 'Design', 20),
  ('research', 'Araştırma', 'Research', 30),
  ('business', 'İş', 'Business', 40),
  ('marketing', 'Pazarlama', 'Marketing', 50),
  ('education', 'Eğitim', 'Education', 60),
  ('data', 'Veri', 'Data', 70),
  ('productivity', 'Üretkenlik', 'Productivity', 80)
on conflict (id) do nothing;
alter table public.skill_categories enable row level security;
create policy "Skill categories are public" on public.skill_categories for select using (true);
revoke all on public.skill_categories from public, anon, authenticated;
grant select on public.skill_categories to anon, authenticated;

alter table public.skills drop constraint if exists skills_category_check;
alter table public.skills add constraint skills_category_fkey foreign key (category) references public.skill_categories (id) on update cascade;

create or replace function public.import_skills(p_items jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_idx integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_has_invalid boolean := false;
  v_created integer := 0;
  v_status text;
  v_field text;
  v_code text;
  v_title text;
  v_summary text;
  v_instructions text;
  v_category text;
  v_license text;
  v_compat text[];
  v_rows jsonb[] := '{}';
  v_row jsonb;
  v_seen text[] := '{}';
  v_key text;
  v_id uuid;
  v_slug text;
  v_base text;
  v_n integer;
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
  if jsonb_array_length(p_items) > 20 then
    raise exception 'too_many_items';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    v_status := 'ok';
    v_field := null;
    v_code := null;

    if jsonb_typeof(v_item) <> 'object' then
      v_status := 'invalid'; v_field := ''; v_code := 'invalid_row';
    end if;

    if v_status = 'ok' then
      v_title := case when jsonb_typeof(v_item -> 'title') = 'string' then btrim(v_item ->> 'title', E' \t\r\n') else '' end;
      v_summary := case when jsonb_typeof(v_item -> 'summary') = 'string' then btrim(v_item ->> 'summary', E' \t\r\n') else '' end;
      v_instructions := case when jsonb_typeof(v_item -> 'instructions') = 'string' then v_item ->> 'instructions' else '' end;
      v_category := case when jsonb_typeof(v_item -> 'category') = 'string' then nullif(lower(btrim(v_item ->> 'category')), '') else null end;
      v_license := case when jsonb_typeof(v_item -> 'license') = 'string' then lower(btrim(v_item ->> 'license')) else 'mit' end;
      v_compat := case when jsonb_typeof(v_item -> 'compat') = 'array'
                       then (select coalesce(array_agg(distinct lower(btrim(x))), '{}') from jsonb_array_elements_text(v_item -> 'compat') x) else '{}' end;
      if v_title = '' then v_status := 'invalid'; v_field := 'title'; v_code := 'required';
      elsif char_length(v_title) > 120 then v_status := 'invalid'; v_field := 'title'; v_code := 'too_long';
      elsif char_length(v_summary) > 1000 then v_status := 'invalid'; v_field := 'summary'; v_code := 'too_long';
      elsif char_length(v_instructions) > 60000 then v_status := 'invalid'; v_field := 'instructions'; v_code := 'too_long';
      elsif v_category is not null and not exists (select 1 from public.skill_categories c where c.id = v_category) then
        v_status := 'invalid'; v_field := 'category'; v_code := 'invalid_category';
      elsif v_license not in ('mit', 'apache-2.0', 'cc0-1.0', 'cc-by-4.0', 'cc-by-sa-4.0', 'proprietary') then
        v_status := 'invalid'; v_field := 'license'; v_code := 'invalid_license';
      elsif not (v_compat <@ array['claude-code', 'codex', 'cursor', 'other']::text[]) then
        v_status := 'invalid'; v_field := 'compat'; v_code := 'invalid_compat';
      end if;
    end if;

    if v_status = 'ok' then
      v_key := md5(v_title || E'\n' || v_instructions);
      if v_key = any (v_seen)
         or exists (select 1 from public.skills s where s.author_id = v_uid and s.title = v_title and md5(s.title || E'\n' || s.instructions) = v_key) then
        v_status := 'duplicate';
      else
        v_seen := v_seen || v_key;
      end if;
    end if;

    if v_status = 'invalid' then
      v_has_invalid := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_idx, 'status', v_status, 'field', v_field, 'code', v_code));
    else
      v_results := v_results || jsonb_build_array(jsonb_build_object('index', v_idx, 'status', v_status));
      if v_status = 'ok' then
        v_rows := v_rows || jsonb_build_object('index', v_idx, 'title', v_title, 'summary', v_summary, 'instructions', v_instructions,
                                               'category', v_category, 'license', v_license, 'compat', to_jsonb(v_compat));
      end if;
    end if;
  end loop;

  if p_dry_run or v_has_invalid then
    return jsonb_build_object('dryRun', p_dry_run, 'ok', not v_has_invalid, 'created', 0, 'items', v_results);
  end if;

  foreach v_row in array v_rows loop
    v_base := public._skill_import_slug(v_row ->> 'title');
    v_slug := v_base;
    v_n := 1;
    while exists (select 1 from public.skills s where s.author_id = v_uid and s.slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := left(v_base, 60) || '-' || v_n;
    end loop;
    v_id := gen_random_uuid();
    insert into public.skills (id, author_id, slug, title, summary, instructions, category, compat, license, status, visibility)
    values (v_id, v_uid, v_slug, v_row ->> 'title', v_row ->> 'summary', v_row ->> 'instructions',
            v_row ->> 'category', coalesce((select array_agg(x) from jsonb_array_elements_text(v_row -> 'compat') x), '{}'),
            v_row ->> 'license', 'draft', 'private');
    v_results := (select jsonb_agg(case when (e.r ->> 'index')::integer = (v_row ->> 'index')::integer then e.r || jsonb_build_object('id', v_id) else e.r end order by e.n)
                  from jsonb_array_elements(v_results) with ordinality as e(r, n));
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('dryRun', false, 'ok', true, 'created', v_created, 'items', v_results);
end;
$$;
revoke all on function public.import_skills(jsonb, boolean) from public, anon;
grant execute on function public.import_skills(jsonb, boolean) to authenticated;

alter table public.skill_works_votes
  add column if not exists version text check (version is null or (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$' and char_length(version) <= 32));

-- Kişinin KENDİ oyuna sürüm etiketi: Skill'in yayınlanmış bir sürümü olmalı (`invalid_version`); oy yoksa `no_vote`.
create or replace function public.set_skill_works_version(p_skill_id uuid, p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_rows integer;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if p_version is not null and not exists (select 1 from public.skill_versions v where v.skill_id = p_skill_id and v.version = p_version) then
    raise exception 'invalid_version';
  end if;
  update public.skill_works_votes set version = p_version where skill_id = p_skill_id and user_id = v_me;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'no_vote';
  end if;
end $$;
revoke all on function public.set_skill_works_version(uuid, text) from public, anon;
grant execute on function public.set_skill_works_version(uuid, text) to authenticated;

create or replace function public.skill_works_by_version(p_skill_id uuid)
returns table (version text, yes_count integer, no_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.version, (count(*) filter (where v.works))::integer, (count(*) filter (where not v.works))::integer
    from public.skill_works_votes v
    join public.skills s on s.id = v.skill_id and s.status = 'published' and s.visibility = 'public'
   where v.skill_id = p_skill_id and v.version is not null
   group by v.version
   order by 1 desc;
$$;
revoke all on function public.skill_works_by_version(uuid) from public;
grant execute on function public.skill_works_by_version(uuid) to anon, authenticated;
