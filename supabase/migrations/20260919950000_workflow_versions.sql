-- Workflow sürüm geçmişi (docs/history/170-*).
--
-- Workflow'un gerçek içeriği başlık/açıklama + adım grafiğidir (workflow_steps + workflow_connections).
-- Snapshot: workflow_versions.title/description + `snapshot` jsonb:
--   { "steps": [ { key, position, title, description, instructions, step_type, prompt_id, request_id, inputs, outputs } ],
--     "connections": [ { from, to, output_key, input_key } ] }
-- `key` = adımın kararlı kimliği (workflow_steps.id; editör kaydederken kimliği korur); bağlantılar sıra
-- numarasına değil bu anahtara bağlıdır. Kapak, etiketler, taksonomi, görünürlük/durum ve sayaçlar snapshot dışıdır.
--
-- Kayıt yolu (TEK): `save_workflow_content()` — sahibin kaydetme işlemi. Başlık/açıklama + adımlar +
-- bağlantılar AYNI transaction'da eski snapshot alınıp uygulanır, yeni snapshot ile karşılaştırılır, fark varsa
-- sürüm yazılır. Eski akışta başlık ebeveyn UPDATE'iyle, adımlar ayrı RPC'yle yazılıyordu; eski başlık o ana
-- kadar kaybolduğu için v1 doğru kurulamazdı (istemci artık başlık/açıklamayı da bu RPC'ye verir, ebeveyn
-- UPDATE'inden çıkarılır). `restore_workflow_version()` aynı yardımcıları kullanır.
-- İstemci workflow_versions'a doğrudan yazamaz (politika ve yetki yok). `save_workflow_graph` (yeni workflow
-- oluşturma yolu) DEĞİŞMEDİ: oluşturma bir düzenleme değildir, sürüm açmaz.

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source text not null check (source in ('initial', 'owner_edit')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_number)
);

create index workflow_versions_workflow_id_idx on public.workflow_versions (workflow_id, version_number desc);

alter table public.workflow_versions enable row level security;

create policy "Workflow versions are readable wherever their workflow is readable"
  on public.workflow_versions for select
  using (exists (select 1 from public.workflows w where w.id = workflow_versions.workflow_id));

revoke insert, update, delete, truncate on table public.workflow_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Yardımcılar (yalnızca aşağıdaki SECURITY DEFINER fonksiyonlar çağırır)
-- ---------------------------------------------------------------------------

create or replace function public._workflow_snapshot(p_workflow_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', s.id,
        'position', s.rn - 1,
        'title', s.title,
        'description', s.description,
        'instructions', s.instructions,
        'step_type', s.step_type,
        'prompt_id', s.prompt_id,
        'request_id', s.request_id,
        'inputs', s.inputs,
        'outputs', s.outputs
      ) order by s.rn)
      from (
        select ws.*, row_number() over (order by ws.position, ws.created_at, ws.id) as rn
        from public.workflow_steps ws
        where ws.workflow_id = p_workflow_id
      ) s
    ), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from', c.from_step_id,
        'to', c.to_step_id,
        'output_key', c.output_key,
        'input_key', c.input_key
      ) order by c.from_step_id, c.to_step_id, c.output_key, c.input_key)
      from public.workflow_connections c
      where c.workflow_id = p_workflow_id
    ), '[]'::jsonb)
  );
$$;

-- `save_workflow_graph`'ın gövdesiyle aynı doğrulama ve yazma + başlık/açıklama; kaydetme ve geri dönme ortak kullanır.
create or replace function public._workflow_apply_content(
  p_workflow_id uuid,
  p_title text,
  p_description text,
  p_steps jsonb,
  p_connections jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s where s ->> 'step_type' in ('request', 'generator')) then
    raise exception 'only prompt steps are allowed in a workflow';
  end if;

  update public.workflows set title = p_title, description = p_description where id = p_workflow_id;

  delete from public.workflow_steps where workflow_id = p_workflow_id;

  insert into public.workflow_steps
    (id, workflow_id, position, title, description, instructions, step_type, prompt_id, request_id, inputs, outputs)
  select
    (s ->> 'id')::uuid,
    p_workflow_id,
    (s ->> 'position')::int,
    coalesce(s ->> 'title', ''),
    coalesce(s ->> 'description', ''),
    coalesce(s ->> 'instructions', ''),
    s ->> 'step_type',
    nullif(s ->> 'prompt_id', '')::uuid,
    nullif(s ->> 'request_id', '')::uuid,
    coalesce(s -> 'inputs', '[]'::jsonb),
    coalesce(s -> 'outputs', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s;

  insert into public.workflow_connections (workflow_id, from_step_id, to_step_id, output_key, input_key)
  select
    p_workflow_id,
    (c ->> 'from_step_id')::uuid,
    (c ->> 'to_step_id')::uuid,
    c ->> 'output_key',
    c ->> 'input_key'
  from jsonb_array_elements(coalesce(p_connections, '[]'::jsonb)) c;

  update public.workflows set updated_at = now() where id = p_workflow_id;
end;
$$;

-- Güncel (uygulanmış) içeriği, uygulamadan ÖNCE alınan eski içerikle karşılaştırır; fark varsa sürüm yazar.
-- Taslak kuralı çağıranda: kaydetme taslakta çağırmaz, geri dönme (açık bir kullanıcı eylemi) her durumda çağırır.
-- Dönüş: sürüm yazıldı mı.
create or replace function public._workflow_record_version(
  p_workflow_id uuid,
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
  w public.workflows%rowtype;
  v_new_snapshot jsonb;
  v_latest public.workflow_versions%rowtype;
begin
  select * into w from public.workflows where id = p_workflow_id;
  v_new_snapshot := public._workflow_snapshot(p_workflow_id);

  if p_old_title is not distinct from w.title
     and p_old_description is not distinct from w.description
     and p_old_snapshot is not distinct from v_new_snapshot then
    return false;
  end if;

  select * into v_latest from public.workflow_versions where workflow_id = p_workflow_id order by version_number desc limit 1;

  if not found then
    -- İlk anlamlı düzenlemeden ÖNCEKİ gerçek içerik v1; oluşturulma zamanı asıl içeriğinki.
    insert into public.workflow_versions (workflow_id, version_number, title, description, snapshot, source, created_by, created_at)
    values (p_workflow_id, 1, p_old_title, p_old_description, p_old_snapshot, 'initial', w.creator_id, p_old_created_at);
    v_latest.version_number := 1;
  elsif (v_latest.title, v_latest.description, v_latest.snapshot) is distinct from (p_old_title, p_old_description, p_old_snapshot) then
    -- Son sürümden bu yana içerik sürümsüz değişmiş (taslak döneminde düzenleme): geçmişte boşluk kalmasın.
    insert into public.workflow_versions (workflow_id, version_number, title, description, snapshot, source, created_by, created_at)
    values (p_workflow_id, v_latest.version_number + 1, p_old_title, p_old_description, p_old_snapshot, 'owner_edit', w.creator_id, now());
    v_latest.version_number := v_latest.version_number + 1;
  end if;

  insert into public.workflow_versions (workflow_id, version_number, title, description, snapshot, source, created_by, created_at)
  values (p_workflow_id, v_latest.version_number + 1, w.title, w.description, v_new_snapshot, 'owner_edit', coalesce(p_editor, w.creator_id), now());
  return true;
end;
$$;

revoke all on function public._workflow_snapshot(uuid) from public, anon, authenticated;
revoke all on function public._workflow_apply_content(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._workflow_record_version(uuid, text, text, jsonb, timestamptz, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sahibin kaydetmesi: başlık/açıklama + adımlar + bağlantılar, tek transaction, sürümle birlikte.
-- ---------------------------------------------------------------------------

create or replace function public.save_workflow_content(
  p_workflow_id uuid,
  p_title text,
  p_description text,
  p_steps jsonb,
  p_connections jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.workflows%rowtype;
  v_old_snapshot jsonb;
begin
  select * into w from public.workflows where id = p_workflow_id and creator_id = auth.uid() for update;
  if not found then
    raise exception 'workflow not found or not yours';
  end if;

  v_old_snapshot := public._workflow_snapshot(p_workflow_id);
  perform public._workflow_apply_content(p_workflow_id, p_title, p_description, p_steps, p_connections);

  -- Taslakta düzenleme sürüm açmaz (prompt/istek ile aynı kural).
  if w.status = 'draft' then
    return false;
  end if;
  return public._workflow_record_version(p_workflow_id, w.title, w.description, v_old_snapshot, w.created_at, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Geri dönme: seçilen snapshot'ı canlı içeriğe uygulayan YENİ bir düzenleme. Eski sürümler dokunulmaz.
-- Kapak, etiketler, taksonomi, görünürlük/durum ve sayaçlar değişmez. Dönüş: değişiklik yapıldı mı
-- (sürüm zaten güncel içerikle aynıysa false, hiçbir şey yazılmaz).
-- ---------------------------------------------------------------------------

create or replace function public.restore_workflow_version(p_version_id uuid, p_workflow_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.workflow_versions%rowtype;
  w public.workflows%rowtype;
  v_old_snapshot jsonb;
  v_steps jsonb;
  v_connections jsonb;
begin
  select * into v from public.workflow_versions where id = p_version_id;
  if not found then
    raise exception 'version not found';
  end if;
  if p_workflow_id is not null and p_workflow_id <> v.workflow_id then
    raise exception 'version does not belong to this workflow';
  end if;
  select * into w from public.workflows where id = v.workflow_id and creator_id = auth.uid() for update;
  if not found then
    raise exception 'workflow not found or not yours';
  end if;

  v_old_snapshot := public._workflow_snapshot(w.id);
  if w.title is not distinct from v.title and w.description is not distinct from v.description
     and v_old_snapshot is not distinct from v.snapshot then
    return false;
  end if;

  -- Snapshot → kaydetme biçimi. Adım kimlikleri korunur (girdi kaynakları ve bağlantılar onlara bağlı);
  -- silinmiş bir prompt'a bağlı adım, canlı satırlardaki ON DELETE SET NULL gibi bağsız geri gelir.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s ->> 'key',
      'position', (s ->> 'position')::int,
      'title', s ->> 'title',
      'description', s ->> 'description',
      'instructions', s ->> 'instructions',
      'step_type', s ->> 'step_type',
      'prompt_id', case when nullif(s ->> 'prompt_id', '') is not null
                         and exists (select 1 from public.prompts p where p.id = (s ->> 'prompt_id')::uuid)
                        then s ->> 'prompt_id' end,
      'request_id', case when nullif(s ->> 'request_id', '') is not null
                          and exists (select 1 from public.prompt_requests r where r.id = (s ->> 'request_id')::uuid)
                         then s ->> 'request_id' end,
      'inputs', coalesce(s -> 'inputs', '[]'::jsonb),
      'outputs', coalesce(s -> 'outputs', '[]'::jsonb)
    ) order by (s ->> 'position')::int), '[]'::jsonb)
  into v_steps
  from jsonb_array_elements(coalesce(v.snapshot -> 'steps', '[]'::jsonb)) s;

  select coalesce(jsonb_agg(jsonb_build_object(
      'from_step_id', c ->> 'from',
      'to_step_id', c ->> 'to',
      'output_key', c ->> 'output_key',
      'input_key', c ->> 'input_key'
    )), '[]'::jsonb)
  into v_connections
  from jsonb_array_elements(coalesce(v.snapshot -> 'connections', '[]'::jsonb)) c;

  perform public._workflow_apply_content(w.id, v.title, v.description, v_steps, v_connections);
  return public._workflow_record_version(w.id, w.title, w.description, v_old_snapshot, w.created_at, auth.uid());
end;
$$;

revoke all on function public.save_workflow_content(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_workflow_content(uuid, text, text, jsonb, jsonb) to authenticated;
revoke all on function public.restore_workflow_version(uuid, uuid) from public, anon;
grant execute on function public.restore_workflow_version(uuid, uuid) to authenticated;
