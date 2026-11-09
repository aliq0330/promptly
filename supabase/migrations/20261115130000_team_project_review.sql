-- Ekip projeleri v2, PR-A / 4 (docs/history/362-*): ONAY MOTORU. Ekleyicidir (kilit tetikleyicisinin atlama listesi genişler).
--
-- Kural özeti (A1–A7): onay dosya başına açılır/kapanır (`team_files.review_required`; proje geneli için `team_projects.review_default`).
-- Açıkken lider olmayanın eklediği öğe 'draft' başlar; ekleyen 'onaya gönderir' (pending); lider onaylar (approved) ya da not yazıp
-- 'değişiklik ister' (changes → taslağa döner). Taslak/bekleyen öğeyi yalnız ekleyen ve projenin liderleri görür (RESTRICTIVE RLS; ok,
-- etkinlik ve Storage yüzeyleri aynı kuralı izler). Onaylı öğenin İÇERİĞİNİ (başlık/metin/not) lider dışında kimse değiştiremez; düzenleyici
-- 'değişiklik önerir' (ayrı tablo — öneri metni öğe satırında durmaz, böylece herkese okunmaz). Konum/boyut/renk/grup/ok onaya tabi değildir.
-- Durum sütunları yalnız bu dosyadaki RPC'lerle değişir (işlem-yerel `promptly.team_review` işareti). Workflow aktarımı tek paket olarak karar görür (`rev_unit`).
-- Kişisel Space'ler ve eski ekip Space'leri ETKİLENMEZ: durum hep 'approved', kural yalnız `spaces.team_project_id` dolu alanlarda çalışır.

-- ============================================================================
-- 1. Yardımcılar
-- ============================================================================
create or replace function public._team_area_review_on(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when s.team_file_id is not null then (select f.review_required from public.team_files f where f.id = s.team_file_id)
                else (select p.review_default from public.team_projects p where p.id = s.team_project_id) end
      from public.spaces s where s.id = p_space and s.team_project_id is not null), false)
$$;

create or replace function public._team_review_flag()
returns boolean language sql stable set search_path = public as $$ select coalesce(current_setting('promptly.team_review', true), '') = '1' $$;

-- Bir bağlantının ucu görünmeyen (taslak) öğeye değiyorsa ok da görünmez.
create or replace function public._team_connection_hidden(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.space_items i
                  where i.id in (p_from, p_to) and i.rev_state <> 'approved' and not public._team_item_visible(i.space_id, i.rev_state, i.created_by))
$$;
grant execute on function public._team_connection_hidden(uuid, uuid) to anon, authenticated;

-- Storage: görünmeyen (taslak) görsel öğesinin dosyası da okunamaz (imzalı adres de üretilemez). Öğesi olmayan/onaylı dosya etkilenmez.
create or replace function public._team_media_hidden(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_space uuid := public._space_media_space_id(p_name);
begin
  if v_space is null then return false; end if;
  if (select s.team_project_id from public.spaces s where s.id = v_space) is null then return false; end if;
  return exists (select 1 from public.space_items i
                  where i.space_id = v_space and i.kind = 'image' and i.rev_state <> 'approved'
                    and right(i.media_url, length(p_name) + 13) = '/space-media/' || p_name
                    and not public._team_item_visible(i.space_id, i.rev_state, i.created_by));
end $$;
grant execute on function public._team_media_hidden(text) to anon, authenticated;

-- Liderlere bildirim (eylemi yapan hariç). Sınıf 'direct': sessize alma tercihleri `_team_notify` katmanında uygulanır.
create or replace function public._team_notify_leads(p_project uuid, p_actor uuid, p_message text, p_href text, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_team uuid; u record;
begin
  select team_id into v_team from public.team_projects where id = p_project;
  for u in select m.user_id from public.team_members m where m.team_id = v_team loop
    if public._team_project_role(p_project, u.user_id) = 'lead' then
      perform public._team_notify(u.user_id, p_actor, v_team, 'direct', p_message, p_href, p_dedupe || ':' || u.user_id);
    end if;
  end loop;
end $$;

create or replace function public._team_actor_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.display_name, ''), p.username, '') from public.profiles p where p.id = p_user
$$;

-- ============================================================================
-- 2. Öneri tablosu (onaylı öğenin değişiklik önerisi — öneri metni öğe satırında DURMAZ)
-- ============================================================================
create table if not exists public.space_item_proposals (
  item_id uuid primary key references public.space_items (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 8000),
  note text not null default '' check (char_length(note) <= 2000),
  state text not null default 'pending' check (state in ('pending', 'changes')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  proposed_by uuid references public.profiles (id) on delete set null,
  proposed_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz
);
create index if not exists space_item_proposals_space_idx on public.space_item_proposals (space_id, state);
alter table public.space_item_proposals enable row level security;
-- RLS politikaları ÇAĞIRANIN yetkisiyle çalışır: iç yardımcılar (istemciye kapalı) yerine yalnız çağıranın kendi liderliğini soran sarmalayıcı.
create or replace function public.team_area_is_lead(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public._team_project_role(public._team_area_project(p_space), auth.uid()) = 'lead', false)
$$;
revoke execute on function public.team_area_is_lead(uuid) from public, anon;
grant execute on function public.team_area_is_lead(uuid) to authenticated;

drop policy if exists space_item_proposals_select on public.space_item_proposals;
create policy space_item_proposals_select on public.space_item_proposals for select to authenticated
  using (proposed_by = auth.uid() or public.team_area_is_lead(space_id));
revoke all on public.space_item_proposals from anon, authenticated;
grant select on public.space_item_proposals to authenticated;

-- ============================================================================
-- 3. Tetikleyiciler
-- ============================================================================
-- Ekleme: durumu SUNUCU belirler (istemci veremez). Alan dışında hep 'approved'.
create or replace function public.space_items_area_review_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid();
begin
  select s.team_project_id into v_project from public.spaces s where s.id = new.space_id;
  new.rev_submitted_at := null; new.rev_submitted_by := null; new.rev_decided_at := null; new.rev_decided_by := null; new.rev_note := null;
  if v_project is null then
    new.rev_state := 'approved'; new.rev_unit := null;
    return new;
  end if;
  new.rev_unit := new.source_workflow_id;
  if v_uid is null then new.rev_state := 'approved'; return new; end if;
  new.rev_state := case when public._team_area_review_on(new.space_id) and public._team_project_role(v_project, v_uid) is distinct from 'lead' then 'draft' else 'approved' end;
  return new;
end $$;
drop trigger if exists space_items_area_review_insert on public.space_items;
create trigger space_items_area_review_insert before insert on public.space_items for each row execute function public.space_items_area_review_insert();

-- Güncelleme: durum sütunları yalnız RPC ile; onaylı/bekleyen öğenin içeriğini lider dışında kimse değiştiremez.
create or replace function public.space_items_area_review_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid();
begin
  if (new.rev_state, new.rev_submitted_at, new.rev_submitted_by, new.rev_decided_at, new.rev_decided_by, new.rev_note, new.rev_unit)
     is distinct from (old.rev_state, old.rev_submitted_at, old.rev_submitted_by, old.rev_decided_at, old.rev_decided_by, old.rev_note, old.rev_unit)
     and not public._team_review_flag() then
    raise exception 'review_protected';
  end if;
  if public._team_review_flag() or v_uid is null then return new; end if;
  select s.team_project_id into v_project from public.spaces s where s.id = new.space_id;
  if v_project is null then return new; end if;
  if (new.title, new.body, new.note) is distinct from (old.title, old.body, old.note)
     and old.rev_state in ('approved', 'pending')
     and public._team_project_role(v_project, v_uid) is distinct from 'lead' then
    raise exception 'review_content_locked';
  end if;
  return new;
end $$;
drop trigger if exists space_items_area_review_update on public.space_items;
create trigger space_items_area_review_update before update on public.space_items for each row execute function public.space_items_area_review_update();

-- Silme: lider her şeyi siler; ekleyen yalnız KENDİ taslağını / değişiklik istenenini siler. Kaskad ve sunucu işleri geçer.
create or replace function public.space_items_area_review_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_uid uuid := auth.uid();
begin
  if pg_trigger_depth() > 1 or v_uid is null or public._team_review_flag() or public._team_sync_on() then return old; end if;
  select s.team_project_id into v_project from public.spaces s where s.id = old.space_id;
  if v_project is null then return old; end if;
  if public._team_project_role(v_project, v_uid) = 'lead' then return old; end if;
  if old.created_by is not distinct from v_uid and old.rev_state in ('draft', 'changes') then return old; end if;
  raise exception 'review_delete_forbidden';
end $$;
drop trigger if exists space_items_area_review_delete on public.space_items;
create trigger space_items_area_review_delete before delete on public.space_items for each row execute function public.space_items_area_review_delete();

-- Nesne kilidi (307) onay sütunlarının değişmesini engellemesin (kilitli öğe de onaylanabilmeli). Gövde 20261110110000'dakiyle aynı; atlama listesi genişledi.
create or replace function public.space_items_lock_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_skip text[] := array['locked', 'updated_at', 'updated_by', 'approved_at', 'approved_by', 'review_requested_at', 'review_requested_by',
                         'deprecated_at', 'deprecated_by', 'content_rev', 'use_count', 'works_yes', 'works_no',
                         'rev_state', 'rev_submitted_at', 'rev_submitted_by', 'rev_decided_at', 'rev_decided_by', 'rev_note', 'rev_unit'];
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() <= 1 then raise exception 'space_item_locked'; end if;
    return old;
  end if;
  if old.locked and (to_jsonb(new) - v_skip) is distinct from (to_jsonb(old) - v_skip) then
    raise exception 'space_item_locked';
  end if;
  return new;
end $$;

-- ============================================================================
-- 4. RLS: taslak/bekleyen öğe yalnız ekleyen + liderler
-- ============================================================================
drop policy if exists space_items_hide_unapproved_area on public.space_items;
create policy space_items_hide_unapproved_area on public.space_items as restrictive for select
  using (rev_state = 'approved' or public._team_item_visible(space_id, rev_state, created_by));

drop policy if exists space_connections_hide_unapproved on public.space_connections;
create policy space_connections_hide_unapproved on public.space_connections as restrictive for select
  using (not public._team_connection_hidden(from_item_id, to_item_id));

drop policy if exists space_media_hide_unapproved on storage.objects;
create policy space_media_hide_unapproved on storage.objects as restrictive for select
  using (bucket_id <> 'space-media' or not public._team_media_hidden(name));

-- ============================================================================
-- 5. RPC'ler
-- ============================================================================
-- Öğeleri ve aynı pakettekileri (workflow: aynı alan + rev_unit) topla; çağıranın yetkisini denetle. p_mode: 'author' (gönder/geri çek) | 'lead' (karar).
create or replace function public._team_review_targets(p_ids uuid[], p_mode text, p_uid uuid)
returns setof public.space_items language plpgsql stable security definer set search_path = public as $$
declare i public.space_items; v_project uuid; v_role text;
begin
  for i in select * from public.space_items where id = any (coalesce(p_ids, '{}')) loop
    v_project := public._team_area_project(i.space_id);
    if v_project is null then raise exception 'project_not_found'; end if;
    v_role := public._team_project_role(v_project, p_uid);
    if v_role is null then raise exception 'project_not_found'; end if;
    if p_mode = 'lead' and v_role <> 'lead' then raise exception 'team_forbidden'; end if;
    if p_mode = 'author' and not (v_role = 'lead' or (v_role = 'edit' and i.created_by = p_uid)) then raise exception 'team_forbidden'; end if;
  end loop;
  return query
    select x.* from public.space_items x
     where x.id = any (coalesce(p_ids, '{}'))
        or (x.rev_unit is not null and exists (select 1 from public.space_items y where y.id = any (coalesce(p_ids, '{}')) and y.space_id = x.space_id and y.rev_unit = x.rev_unit));
end $$;

-- Onaya gönder (taslak / değişiklik istenen → bekliyor). Dönen: gönderilen öğe sayısı.
create or replace function public.team_review_submit(p_item_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r record;
  v_n integer := 0;
  v_projects uuid[] := '{}';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(true);
  perform public._rate_limit('team_review_submit', 120, interval '1 hour');
  if coalesce(cardinality(p_item_ids), 0) not between 1 and 200 then raise exception 'project_invalid'; end if;
  perform set_config('promptly.team_review', '1', true);
  for r in select t.* from public._team_review_targets(p_item_ids, 'author', v_uid) t where t.rev_state in ('draft', 'changes') loop
    if (select p.archived_at from public.team_projects p where p.id = public._team_area_project(r.space_id)) is not null then
      perform set_config('promptly.team_review', '', true);
      raise exception 'project_archived';
    end if;
    update public.space_items set rev_state = 'pending', rev_submitted_at = now(), rev_submitted_by = v_uid, rev_note = null, rev_decided_at = null, rev_decided_by = null
     where id = r.id;
    v_n := v_n + 1;
    if not (public._team_area_project(r.space_id) = any (v_projects)) then v_projects := v_projects || public._team_area_project(r.space_id); end if;
  end loop;
  perform set_config('promptly.team_review', '', true);
  if v_n > 0 then
    declare pid uuid; pr record;
    begin
      foreach pid in array v_projects loop
        select id, team_id, title into pr from public.team_projects where id = pid;
        perform public._team_notify_leads(pid, v_uid,
          public._team_actor_name(v_uid) || ' "' || public.truncate_preview(pr.title, 60) || '" projesinde onay bekleyen öğe gönderdi.',
          '/teams/local?id=' || pr.team_id || '&tab=projects&project=' || pid || '&review=1',
          'revsub:' || pid || ':' || v_uid || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
        perform public._team_audit(pr.team_id, 'approval', 'review_submitted', pr.title, jsonb_build_object('items', v_n));
      end loop;
    end;
  end if;
  return v_n;
end $$;

-- Geri çek (bekliyor → taslak). Yalnız ekleyen (ve lider).
create or replace function public.team_review_withdraw(p_item_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r record; v_n integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(cardinality(p_item_ids), 0) not between 1 and 200 then raise exception 'project_invalid'; end if;
  perform set_config('promptly.team_review', '1', true);
  for r in select t.* from public._team_review_targets(p_item_ids, 'author', v_uid) t where t.rev_state = 'pending' loop
    update public.space_items set rev_state = 'draft', rev_submitted_at = null, rev_submitted_by = null where id = r.id;
    v_n := v_n + 1;
  end loop;
  perform set_config('promptly.team_review', '', true);
  return v_n;
end $$;

-- Karar: 'approve' | 'changes' (değişiklikte not zorunlu). Yalnız lider. Dönen: karar verilen öğe sayısı.
create or replace function public.team_review_decide(p_item_ids uuid[], p_decision text, p_note text default '')
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  r record;
  v_n integer := 0;
  a record;
  v_done jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(true);
  if coalesce(p_decision, '') not in ('approve', 'changes') or coalesce(cardinality(p_item_ids), 0) not between 1 and 200
     or char_length(v_note) > 500 or (p_decision = 'changes' and v_note = '') then
    raise exception 'project_invalid';
  end if;
  perform set_config('promptly.team_review', '1', true);
  for r in select t.* from public._team_review_targets(p_item_ids, 'lead', v_uid) t where t.rev_state = 'pending' loop
    update public.space_items set
      rev_state = case when p_decision = 'approve' then 'approved' else 'changes' end,
      rev_decided_at = now(), rev_decided_by = v_uid,
      rev_note = case when p_decision = 'changes' then v_note else null end
     where id = r.id;
    v_done := v_done || jsonb_build_array(jsonb_build_object('author', r.created_by, 'project', public._team_area_project(r.space_id), 'title', r.title));
    v_n := v_n + 1;
  end loop;
  perform set_config('promptly.team_review', '', true);
  for a in select d.author, d.project, count(*)::integer as n, min(d.title) as one_title
             from jsonb_to_recordset(v_done) as d(author uuid, project uuid, title text) group by d.author, d.project loop
    perform public._team_notify(a.author, v_uid, (select team_id from public.team_projects where id = a.project), 'direct',
      case when p_decision = 'approve'
           then case when a.n = 1 then '"' || public.truncate_preview(coalesce(nullif(a.one_title, ''), 'Öğe'), 50) || '" onaylandı.' else a.n || ' öğen onaylandı.' end
           else public._team_actor_name(v_uid) || ' değişiklik istedi: ' || public.truncate_preview(v_note, 80) end,
      '/teams/local?id=' || (select team_id from public.team_projects where id = a.project) || '&tab=projects&project=' || a.project,
      'revdec:' || a.project || ':' || a.author || ':' || p_decision || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end loop;
  if v_n > 0 then
    for a in select distinct d.project from jsonb_to_recordset(v_done) as d(author uuid, project uuid, title text) loop
      perform public._team_audit((select team_id from public.team_projects where id = a.project), 'approval',
        case when p_decision = 'approve' then 'review_approved' else 'review_changes' end,
        (select title from public.team_projects where id = a.project), jsonb_build_object('items', v_n));
    end loop;
  end if;
  return v_n;
end $$;

-- Değişiklik önerisi (onaylı öğe için; düzenleyici+). Aynı öğe için tek öneri (yeniden önermek günceller).
create or replace function public.team_review_propose(p_item uuid, p_title text, p_body text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  v_project uuid;
  pr record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._assert_can_act(true);
  perform public._rate_limit('team_review_propose', 120, interval '1 hour');
  select * into i from public.space_items where id = p_item;
  v_project := public._team_area_project(i.space_id);
  if not found or v_project is null or public._team_project_role(v_project, v_uid) is null then raise exception 'project_not_found'; end if;
  if not public._team_project_has(v_project, v_uid, 'edit') then raise exception 'team_forbidden'; end if;
  if public._team_project_role(v_project, v_uid) = 'lead' or i.rev_state <> 'approved' then raise exception 'project_invalid'; end if;
  if char_length(coalesce(p_title, '')) > 120 or char_length(coalesce(p_body, '')) > 8000 or char_length(coalesce(p_note, '')) > 2000 then raise exception 'project_invalid'; end if;
  select id, team_id, title into pr from public.team_projects where id = v_project;
  if (select archived_at from public.team_projects where id = v_project) is not null then raise exception 'project_archived'; end if;
  insert into public.space_item_proposals (item_id, space_id, title, body, note, proposed_by)
  values (p_item, i.space_id, coalesce(p_title, ''), coalesce(p_body, ''), coalesce(p_note, ''), v_uid)
  on conflict (item_id) do update set title = excluded.title, body = excluded.body, note = excluded.note, state = 'pending', decision_note = null,
                                      proposed_by = excluded.proposed_by, proposed_at = now(), decided_by = null, decided_at = null;
  perform public._team_notify_leads(v_project, v_uid,
    public._team_actor_name(v_uid) || ' "' || public.truncate_preview(pr.title, 60) || '" projesinde bir öğe için değişiklik önerdi.',
    '/teams/local?id=' || pr.team_id || '&tab=projects&project=' || v_project || '&review=1',
    'revprop:' || p_item || ':' || v_uid || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  perform public._team_audit(pr.team_id, 'approval', 'proposal_submitted', pr.title);
end $$;

create or replace function public.team_review_withdraw_proposal(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.space_item_proposals where item_id = p_item and proposed_by = auth.uid();
end $$;

-- Öneri kararı (yalnız lider): 'approve' → alanlar öğeye yazılır, öneri silinir; 'changes' → öneri geri döner (not zorunlu).
create or replace function public.team_review_decide_proposal(p_item uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  pp public.space_item_proposals;
  v_project uuid;
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into pp from public.space_item_proposals where item_id = p_item for update;
  v_project := public._team_area_project(pp.space_id);
  if not found or v_project is null then raise exception 'project_not_found'; end if;
  perform public._team_project_require(v_project, 'lead');
  if coalesce(p_decision, '') not in ('approve', 'changes') or char_length(v_note) > 500 or (p_decision = 'changes' and v_note = '') then raise exception 'project_invalid'; end if;
  select team_id into v_team from public.team_projects where id = v_project;
  if p_decision = 'approve' then
    perform set_config('promptly.team_review', '1', true);
    update public.space_items set title = pp.title, body = pp.body, note = pp.note, updated_by = pp.proposed_by where id = p_item;
    perform set_config('promptly.team_review', '', true);
    delete from public.space_item_proposals where item_id = p_item;
  else
    update public.space_item_proposals set state = 'changes', decision_note = v_note, decided_by = v_uid, decided_at = now() where item_id = p_item;
  end if;
  perform public._team_notify(pp.proposed_by, v_uid, v_team, 'direct',
    case when p_decision = 'approve' then 'Önerdiğin değişiklik onaylandı.' else public._team_actor_name(v_uid) || ' önerin için değişiklik istedi: ' || public.truncate_preview(v_note, 80) end,
    '/teams/local?id=' || v_team || '&tab=projects&project=' || v_project,
    'revpropdec:' || p_item || ':' || p_decision || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  perform public._team_audit(v_team, 'approval', case when p_decision = 'approve' then 'proposal_approved' else 'proposal_changes' end, (select title from public.team_projects where id = v_project));
end $$;

-- Lider kuyruğu: bekleyen öğeler + bekleyen öneriler (yalnız lider).
create or replace function public.team_review_pending(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_project_require(p_project, 'lead');
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'kind', i.kind, 'title', i.title, 'body', left(i.body, 600), 'note', i.note, 'media_url', i.media_url, 'content_type', i.content_type,
               'content_id', i.content_id, 'color', i.color, 'is_draft', i.is_draft,
               'space_id', i.space_id, 'area_title', s.title, 'file_id', s.team_file_id, 'file_title', f.title, 'is_main', s.team_area_main,
               'author_id', i.created_by, 'author_name', coalesce(nullif(p.display_name, ''), p.username), 'author_username', p.username,
               'submitted_at', i.rev_submitted_at, 'unit', i.rev_unit,
               'unit_count', case when i.rev_unit is null then 1 else (select count(*) from public.space_items y where y.space_id = i.space_id and y.rev_unit = i.rev_unit and y.rev_state = 'pending') end)
             order by i.rev_submitted_at desc, i.id)
        from public.space_items i
        join public.spaces s on s.id = i.space_id and s.team_project_id = p_project
        left join public.team_files f on f.id = s.team_file_id
        left join public.profiles p on p.id = i.created_by
       where i.rev_state = 'pending'), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', pp.item_id, 'kind', i.kind, 'space_id', pp.space_id, 'file_id', s.team_file_id, 'file_title', f.title,
               'current', jsonb_build_object('title', i.title, 'body', left(i.body, 600), 'note', i.note),
               'proposed', jsonb_build_object('title', pp.title, 'body', left(pp.body, 600), 'note', pp.note),
               'proposer_id', pp.proposed_by, 'proposer_name', coalesce(nullif(p.display_name, ''), p.username), 'proposed_at', pp.proposed_at)
             order by pp.proposed_at desc)
        from public.space_item_proposals pp
        join public.space_items i on i.id = pp.item_id
        join public.spaces s on s.id = pp.space_id and s.team_project_id = p_project
        left join public.team_files f on f.id = s.team_file_id
        left join public.profiles p on p.id = pp.proposed_by
       where pp.state = 'pending'), '[]'::jsonb));
end $$;

-- "Senden bekleyenler": liderlerde onay bekleyen sayısı (proje başına) + ekleyenlerde değişiklik istenen sayısı. Eski my_team_todos DEĞİŞMEDİ.
create or replace function public.team_project_todos()
returns table (team_id uuid, team_name text, team_slug text, project_id uuid, project_title text, kind text, n integer, href text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r record; v_n integer; v_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  for r in select p.id as pid, p.title as ptitle, t.id as tid, t.name as tname, t.slug as tslug
             from public.team_projects p join public.teams t on t.id = p.team_id
            where p.archived_at is null and public._team_project_role(p.id, v_uid) is not null order by t.name, p.created_at loop
    if public._team_project_role(r.pid, v_uid) = 'lead' then
      select count(*)::integer, max(i.rev_submitted_at) into v_n, v_at
        from public.space_items i join public.spaces s on s.id = i.space_id where s.team_project_id = r.pid and i.rev_state = 'pending';
      v_n := v_n + (select count(*)::integer from public.space_item_proposals pp join public.spaces s on s.id = pp.space_id where s.team_project_id = r.pid and pp.state = 'pending');
      if v_n > 0 then
        return query select r.tid, r.tname, r.tslug, r.pid, r.ptitle, 'review'::text, v_n, '/teams/local?id=' || r.tid || '&tab=projects&project=' || r.pid || '&review=1', coalesce(v_at, now());
      end if;
    end if;
    select count(*)::integer, max(i.rev_decided_at) into v_n, v_at
      from public.space_items i join public.spaces s on s.id = i.space_id where s.team_project_id = r.pid and i.rev_state = 'changes' and i.created_by = v_uid;
    if v_n > 0 then
      return query select r.tid, r.tname, r.tslug, r.pid, r.ptitle, 'changes'::text, v_n, '/teams/local?id=' || r.tid || '&tab=projects&project=' || r.pid, coalesce(v_at, now());
    end if;
  end loop;
end $$;

-- ============================================================================
-- 6. Yetkiler
-- ============================================================================
revoke execute on function public._team_area_review_on(uuid), public._team_review_flag(), public._team_notify_leads(uuid, uuid, text, text, text),
  public._team_actor_name(uuid), public._team_review_targets(uuid[], text, uuid),
  public.space_items_area_review_insert(), public.space_items_area_review_update(), public.space_items_area_review_delete() from public, anon, authenticated;
revoke execute on function public.team_review_submit(uuid[]), public.team_review_withdraw(uuid[]), public.team_review_decide(uuid[], text, text),
  public.team_review_propose(uuid, text, text, text), public.team_review_withdraw_proposal(uuid), public.team_review_decide_proposal(uuid, text, text),
  public.team_review_pending(uuid), public.team_project_todos() from public, anon;
grant execute on function public.team_review_submit(uuid[]), public.team_review_withdraw(uuid[]), public.team_review_decide(uuid[], text, text),
  public.team_review_propose(uuid, text, text, text), public.team_review_withdraw_proposal(uuid), public.team_review_decide_proposal(uuid, text, text),
  public.team_review_pending(uuid), public.team_project_todos() to authenticated;
