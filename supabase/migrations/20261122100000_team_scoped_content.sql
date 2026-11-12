-- Ekibe özgü içerik (docs/history/376-*). Ekleyicidir: yalnız yeni sütun/politika/tetikleyici/işlev; hiçbir mevcut veri silinmez.
--
-- Kavram: bir ekip dosyasında "Oluştur" ile yaratılan Prompt / İstek / Workflow / Ayar paketi o DOSYAYA aittir (`team_file_id`). Topluluğa özgü içerik
-- kalıbının (`community_id`, docs/history/179-*) ekip karşılığıdır:
--   * sunucu görünürlüğü `private`a zorlar → bütün "herkese açık" süzgeçler (Keşfet, arama, profil, API) içeriği kendiliğinden dışlar;
--   * okuma yalnız projeyi görebilen ekip üyesine açılır (yayınlanmış içerik; taslak yalnız yazarında);
--   * `team_file_id` sonradan değişmez; ekibe özgü içerik başka yere ya da başka kullanıcıya taşınmaz;
--   * beğeni, yorum, kaydet, koleksiyon, alıntı, ilişki, sonuç ve düzenleme önerisi YOKTUR (içerik dosyanın içinde yaşar);
--   * onaylı/bekleyen içeriği lider dışında kimse değiştirmez; silmek asıl dosya öğesini silmektir (ve tersi).
-- Dosyadaki asıl öğe (`space_items`, ana alan) bu satıra `prompt_id` / `content_id` ile başvurur (20261122110000).

-- ============================================================================
-- 1. Sütunlar
-- ============================================================================
alter table public.prompts add column if not exists team_file_id uuid references public.team_files (id) on delete cascade;
alter table public.prompt_requests add column if not exists team_file_id uuid references public.team_files (id) on delete cascade;
alter table public.workflows add column if not exists team_file_id uuid references public.team_files (id) on delete cascade;
alter table public.presets add column if not exists team_file_id uuid references public.team_files (id) on delete cascade;

create index if not exists prompts_team_file_idx on public.prompts (team_file_id) where team_file_id is not null;
create index if not exists prompt_requests_team_file_idx on public.prompt_requests (team_file_id) where team_file_id is not null;
create index if not exists workflows_team_file_idx on public.workflows (team_file_id) where team_file_id is not null;
create index if not exists presets_team_file_idx on public.presets (team_file_id) where team_file_id is not null;

-- Bir içerik topluluğa YA DA ekibe aittir, ikisine birden değil.
do $$
declare t text;
begin
  foreach t in array array['prompts', 'prompt_requests', 'workflows', 'presets'] loop
    begin
      execute format('alter table public.%I add constraint %I check (num_nonnulls(community_id, team_file_id) <= 1)', t, t || '_scope_check');
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================================
-- 2. Okuma
-- ============================================================================
-- Dosyanın projesi (yoksa null). RLS politikaları ÇAĞIRANIN yetkisiyle çalıştığı için yürütülebilir sarmalayıcı kullanılır.
create or replace function public.team_file_project(p_file uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select f.project_id from public.team_files f where f.id = p_file
$$;

-- Çağıran, içeriğin dosyasının projesini görebiliyor mu? (ekip üyeliği + proje rolü; konuk dahil)
create or replace function public.team_can_read_content(p_file uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_file is not null
     and (select auth.uid()) is not null
     and public._team_project_role(public.team_file_project(p_file), (select auth.uid())) is not null
$$;
revoke execute on function public.team_file_project(uuid), public.team_can_read_content(uuid) from public, anon;
grant execute on function public.team_file_project(uuid), public.team_can_read_content(uuid) to authenticated;

-- Yeni, ayrı (permissive) politikalar: mevcut politikalara dokunulmaz; RESTRICTIVE `*_hide_blocked` yine uygulanır.
drop policy if exists prompts_team_content_read on public.prompts;
create policy prompts_team_content_read on public.prompts for select to authenticated
  using (team_file_id is not null and status = 'published' and public.team_can_read_content(team_file_id));
drop policy if exists prompt_requests_team_content_read on public.prompt_requests;
create policy prompt_requests_team_content_read on public.prompt_requests for select to authenticated
  using (team_file_id is not null and not is_draft and public.team_can_read_content(team_file_id));
drop policy if exists workflows_team_content_read on public.workflows;
create policy workflows_team_content_read on public.workflows for select to authenticated
  using (team_file_id is not null and status = 'published' and public.team_can_read_content(team_file_id));
drop policy if exists presets_team_content_read on public.presets;
create policy presets_team_content_read on public.presets for select to authenticated
  using (team_file_id is not null and status = 'published' and public.team_can_read_content(team_file_id));

-- ============================================================================
-- 3. Yazma kuralları
-- ============================================================================
-- Sayaç/ölçü sütunları (SECURITY DEFINER tetikleyicileri bunları herhangi bir kullanıcı bağlamında günceller): içerik değişikliği sayılmaz.
create or replace function public._team_content_changed(p_old jsonb, p_new jsonb)
returns boolean language sql immutable set search_path = public as $$
  select (p_new - array['like_count', 'comment_count', 'save_count', 'copy_count', 'quote_count', 'use_count', 'response_count', 'updated_at', 'visibility'])
         is distinct from
         (p_old - array['like_count', 'comment_count', 'save_count', 'copy_count', 'quote_count', 'use_count', 'response_count', 'updated_at', 'visibility'])
$$;

create or replace function public.enforce_team_content()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_file uuid := nullif(v_row ->> 'team_file_id', '')::uuid;
  v_uid uuid := auth.uid();
  v_author uuid := coalesce(nullif(v_row ->> 'author_id', ''), nullif(v_row ->> 'creator_id', ''))::uuid;
  v_project uuid;
  v_role text;
  v_archived timestamptz;
begin
  if tg_op = 'UPDATE' and (v_old ->> 'team_file_id') is distinct from (v_row ->> 'team_file_id') then
    raise exception 'team_content_immutable';
  end if;
  if v_file is null then return new; end if;

  -- Ekibe özgü içerik daima 'private' saklanır: herkese açık süzgeçler onu kendiliğinden dışlar (istemci ne gönderirse göndersin).
  new := jsonb_populate_record(new, jsonb_build_object('visibility', 'private'));
  if v_uid is null then return new; end if;   -- sunucu işleri (migration, dönüşüm, silme zinciri)

  select f.project_id, p.archived_at into v_project, v_archived
    from public.team_files f join public.team_projects p on p.id = f.project_id where f.id = v_file;
  if v_project is null then raise exception 'project_not_found'; end if;
  v_role := public._team_project_role(v_project, v_uid);

  if tg_op = 'INSERT' then
    if v_role is null or v_role not in ('edit', 'lead') then raise exception 'team_forbidden'; end if;
    if v_archived is not null then raise exception 'project_archived'; end if;
    if v_author is distinct from v_uid then raise exception 'forbidden'; end if;
    return new;
  end if;

  -- UPDATE: yalnız içerik değişiyorsa kurallar işler (sayaç güncellemeleri geçer).
  if public._team_content_changed(v_old, v_row) then
    if v_role is null then raise exception 'team_forbidden'; end if;
    if v_archived is not null then raise exception 'project_archived'; end if;
    -- Onaylı / bekleyen içeriği yalnız lider değiştirir; ekleyen yalnız taslağını / değişiklik istenenini düzenler.
    if v_role is distinct from 'lead' and not public._team_review_flag()
       and exists (select 1 from public.space_items i
                    where i.file_item_id is null and i.rev_state in ('approved', 'pending')
                      and ((i.kind = 'prompt' and not i.is_draft and i.prompt_id = new.id)
                           or (i.kind = 'content' and i.content_id = new.id))) then
      raise exception 'review_content_locked';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prompts', 'prompt_requests', 'workflows', 'presets'] loop
    execute format('drop trigger if exists aa_enforce_team_content on public.%I', t);
    execute format('create trigger aa_enforce_team_content before insert or update on public.%I for each row execute function public.enforce_team_content()', t);
  end loop;
end $$;

-- ============================================================================
-- 4. Etkileşim / paylaşım yolları kapalı
-- ============================================================================
-- Hedef ekibe özgü içerikse beğeni, yorum, kaydetme, alıntı, sonuç ve düzenleme önerisi reddedilir. Hedef sütunlarına açık dal yazılır
-- (yeni bir hedef sütunu eklenirse buraya da eklenir — `handle_prompt_like_change` zincirinin kuralı).
create or replace function public.block_team_content_use()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(new);
begin
  if exists (select 1 from public.prompts where id = nullif(v_row ->> 'prompt_id', '')::uuid and team_file_id is not null)
     or exists (select 1 from public.prompt_requests where id = nullif(v_row ->> 'request_id', '')::uuid and team_file_id is not null)
     or exists (select 1 from public.workflows where id = nullif(v_row ->> 'workflow_id', '')::uuid and team_file_id is not null)
     or exists (select 1 from public.presets where id = nullif(v_row ->> 'preset_id', '')::uuid and team_file_id is not null) then
    raise exception 'team_content_not_shareable';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prompt_likes', 'prompt_comments', 'collection_items', 'prompt_results', 'prompt_edit_suggestions', 'content_quotes'] loop
    execute format('drop trigger if exists ab_block_team_content_use on public.%I', t);
    execute format('create trigger ab_block_team_content_use before insert on public.%I for each row execute function public.block_team_content_use()', t);
  end loop;
end $$;

-- İlişki haritası: iki uçtan biri ekibe özgü içerikse ilişki kurulamaz.
create or replace function public.block_team_content_relation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_scoped boolean := false; r record;
begin
  for r in select * from (values (new.source_type, new.source_id), (new.target_type, new.target_id)) as x(t, i) loop
    v_scoped := v_scoped or case r.t
      when 'prompt' then exists (select 1 from public.prompts where id = r.i and team_file_id is not null)
      when 'request' then exists (select 1 from public.prompt_requests where id = r.i and team_file_id is not null)
      when 'workflow' then exists (select 1 from public.workflows where id = r.i and team_file_id is not null)
      when 'preset' then exists (select 1 from public.presets where id = r.i and team_file_id is not null)
      else false end;
  end loop;
  if v_scoped then raise exception 'team_content_not_shareable'; end if;
  return new;
end $$;
drop trigger if exists ab_block_team_content_relation on public.content_relations;
create trigger ab_block_team_content_relation before insert on public.content_relations for each row execute function public.block_team_content_relation();

-- Workflow adımı ekibe özgü promptu yalnız AYNI dosyanın workflow'unda bağlayabilir (başka workflow'da prompt sızmasın).
create or replace function public.block_team_content_step()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prompt uuid; v_wf uuid;
begin
  if new.prompt_id is null then return new; end if;
  select p.team_file_id into v_prompt from public.prompts p where p.id = new.prompt_id;
  if v_prompt is null then return new; end if;
  select w.team_file_id into v_wf from public.workflows w where w.id = new.workflow_id;
  if v_wf is distinct from v_prompt then raise exception 'team_content_not_shareable'; end if;
  return new;
end $$;
drop trigger if exists ab_block_team_content_step on public.workflow_steps;
create trigger ab_block_team_content_step before insert or update of prompt_id on public.workflow_steps for each row execute function public.block_team_content_step();

-- ============================================================================
-- 5. Silme: içerik ⇔ asıl dosya öğesi
-- ============================================================================
-- İçerik satırı doğrudan silinirse onu gösteren asıl dosya öğeleri (ve panodaki yansımaları) de gider. Onaylı/bekleyen içeriği lider dışında
-- kimse silemez (öğe silme kuralıyla aynı). Asıl öğenin silinmesi içeriği zaten siler (20261122110000'daki tetikleyici; o zincirde bayrak kurulur).
create or replace function public.team_content_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(old);
  v_file uuid := nullif(v_row ->> 'team_file_id', '')::uuid;
  v_uid uuid := auth.uid();
  v_project uuid;
begin
  if v_file is null then return old; end if;
  -- Kaskad (dosya/proje silme, asıl öğeden gelen silme) ve sunucu işleri geçer.
  if pg_trigger_depth() > 1 or coalesce(current_setting('promptly.team_content_cascade', true), '') = '1' then return old; end if;
  if v_uid is not null then
    v_project := public.team_file_project(v_file);
    if v_project is null or public._team_project_role(v_project, v_uid) is null then raise exception 'team_forbidden'; end if;
    if public._team_project_role(v_project, v_uid) is distinct from 'lead'
       and exists (select 1 from public.space_items i
                    where i.file_item_id is null and i.rev_state in ('approved', 'pending')
                      and ((i.kind = 'prompt' and not i.is_draft and i.prompt_id = old.id) or (i.kind = 'content' and i.content_id = old.id))) then
      raise exception 'review_delete_forbidden';
    end if;
  end if;
  perform set_config('promptly.team_item_sync', '1', true);
  perform set_config('promptly.team_content_cascade', '1', true);
  delete from public.space_items i
   where i.file_item_id is null
     and ((i.kind = 'prompt' and not i.is_draft and i.prompt_id = old.id)
          or (i.kind = 'content' and i.content_id = old.id and i.content_type = case tg_table_name
               when 'prompt_requests' then 'request' when 'workflows' then 'workflow' when 'presets' then 'preset' else '' end));
  perform set_config('promptly.team_content_cascade', '', true);
  perform set_config('promptly.team_item_sync', '', true);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prompts', 'prompt_requests', 'workflows', 'presets'] loop
    execute format('drop trigger if exists aa_team_content_before_delete on public.%I', t);
    execute format('create trigger aa_team_content_before_delete before delete on public.%I for each row execute function public.team_content_before_delete()', t);
  end loop;
end $$;

-- ============================================================================
-- 6. Yetkiler (tetikleyici işlevleri istemciye kapalı)
-- ============================================================================
revoke execute on function public._team_content_changed(jsonb, jsonb), public.enforce_team_content(), public.block_team_content_use(),
  public.block_team_content_relation(), public.block_team_content_step(), public.team_content_before_delete() from public, anon, authenticated;
