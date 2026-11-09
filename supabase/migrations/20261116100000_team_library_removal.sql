-- ci:allow-destructive
-- Ekip projeleri v2 — PR-C (docs/history/362-*): eski ekip kütüphanesi ve ekip Space'leri KALDIRILIR.
--
-- Kullanıcı kararı (K-1/K-8): ekip kütüphanesi komple kalkar, eski ekip Space/kütüphane verisi demoydu ve silinir; ekip API/MCP
-- zaten kalktı (arayüz + Edge Function kodu PR-B'de çıktı). Burada:
--   1) ekibe bağlı eski Space'ler (`team_id` dolu, `kind <> 'team_area'`) silinir — ekip alanları (proje/dosya/pano) DOKUNULMAZ;
--   2) yalnız kütüphaneye ait tablolar (onay/inceleme/örnek/sürüm/kullanım/"çalıştı" oyu/ekip değişkeni/API engeli ve kullanımı) düşer;
--   3) onları okuyan/yazan RPC'ler ve yardımcılar düşer; hâlâ kullanılan 6 fonksiyon kütüphanesiz yeniden yazılır
--      (`team_create` artık kütüphane Space'i açmaz; `team_update` ölü politika anahtarlarını kabul etmez; `team_insights` proje etkinliğini
--      ölçer; `team_export`, `_team_offboard`, `team_member_content_summary`, `my_team_todos` kütüphanesizdir).
-- Kişisel 'team_library' türündeki Space'ler 'free'ye çevrilir ve tür kısıtından çıkarılır (1b).
-- BİLEREK düşmeyenler (ayrı, sonraki contract): `teams.library_space_id/require_approval/approvals_needed/hide_unapproved/version_keep/
-- mcp_*`, `spaces.project_space_id/approvals_needed`, `space_items.approved_at/…/content_rev/use_count/works_*` sütunları ve
-- onları 30+ canlı fonksiyon (Space motoru, erişim yansıması) adıyla anıyor; hiçbiri artık
-- yazılmaz/okunmaz (istemci seçmez, RPC'ler yazamaz). Sütun düşürmek paylaşılan Space RPC'lerinin yeniden yazımını ister ve kullanıcıya
-- kazandırdığı bir şey yoktur.

-- 1) Eski ekip Space'leri ----------------------------------------------------------------------------------------------------
do $$
begin
  perform set_config('promptly.team_sync', '1', true);
  -- Proje kütüphaneleri `project_space_id` ile bağlıdır (ON DELETE CASCADE); ekip alanları ('team_area') hiçbir koşulda silinmez.
  delete from public.spaces where team_id is not null and kind <> 'team_area' and team_project_id is null;
  update public.teams set library_space_id = null where library_space_id is not null;
  perform set_config('promptly.team_sync', '', true);
end $$;

-- 1b) Kişisel "kütüphane" Space'leri (kind='team_library', ekibe bağlı değil) sıradan Space olur: kütüphane arayüzü, ekip değişkenleri ve onay
-- akışı kalktı (değişkenleri `space_variables` tutuyordu). Tür kısıtından 'team_library' çıkar; yeni Space bu türde açılamaz.
update public.spaces set kind = 'free' where kind = 'team_library';
alter table public.spaces drop constraint if exists spaces_kind_check;
alter table public.spaces add constraint spaces_kind_check
  check (kind = any (array['moodboard', 'character', 'brand', 'game_world', 'interior', 'free', 'team_area']));

-- 2) Kütüphane politikası / tetikleyicisi (düşecek tablo ve fonksiyonlara bağlı olanlar) ---------------------------------------
drop policy if exists space_items_hide_unapproved on public.space_items;
drop trigger if exists space_items_version_snapshot on public.space_items;
drop trigger if exists spaces_team_before_delete on public.spaces;

-- 3) Tablolar (CASCADE yalnız bunlara bağlı tetikleyici/politikaları götürür) -------------------------------------------------
drop table if exists public.space_item_review_comments;
drop table if exists public.space_item_review_samples;
drop table if exists public.space_item_approvals;
drop table if exists public.space_item_versions;
drop table if exists public.space_item_uses;
drop table if exists public.space_item_works_votes;
drop table if exists public.space_variables;
drop table if exists public.team_api_blocks;
drop table if exists public.team_api_usage;

-- 4) Yeniden yazılan fonksiyonlar (eski gövdeler `space_variables`/`space_item_uses`/`library_space_id` kullanıyordu) ----------------
create or replace function public.team_create(p_name text, p_description text default '', p_tone text default 'primary')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._group_actor();
  v_id uuid := gen_random_uuid();
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_create', 5, interval '1 hour');
  if p_name is null or char_length(btrim(p_name)) not between 2 and 60 then raise exception 'team_name_invalid'; end if;
  if char_length(coalesce(p_description, '')) > 500 or coalesce(p_tone, '') not in ('primary', 'secondary', 'success', 'warning', 'plum', 'sky') then
    raise exception 'team_invalid';
  end if;
  if (select count(*) from public.team_members m where m.user_id = v_uid and m.role = 'owner') >= 10 then raise exception 'team_owner_limit'; end if;

  perform set_config('promptly.team_sync', '1', true);
  insert into public.teams (id, slug, name, description, tone, created_by)
  values (v_id, public._team_unique_slug(p_name), btrim(p_name), coalesce(btrim(p_description), ''), p_tone, v_uid);
  insert into public.team_members (team_id, user_id, role) values (v_id, v_uid, 'owner');
  perform set_config('promptly.team_sync', '', true);
  perform public._team_recount(v_id);
  perform public._team_audit(v_id, 'team', 'team_created', btrim(p_name));
  return v_id;
end $$;

create or replace function public.team_update(p_team uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_team');
  v_key text;
  v_changed text[] := '{}';
  t public.teams;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'team_invalid'; end if;
  select * into t from public.teams where id = p_team for update;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'description', 'tone', 'content_owner', 'offboard_default', 'default_member_role', 'invite_link_ttl_days',
                     'publish_external_role', 'guest_invite_role', 'export_role') then
      raise exception 'team_invalid';
    end if;
    v_changed := v_changed || v_key;
  end loop;
  begin
    update public.teams set
      name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
      description = case when p_patch ? 'description' then btrim(coalesce(p_patch ->> 'description', '')) else description end,
      tone = case when p_patch ? 'tone' then p_patch ->> 'tone' else tone end,
      content_owner = case when p_patch ? 'content_owner' then p_patch ->> 'content_owner' else content_owner end,
      offboard_default = case when p_patch ? 'offboard_default' then p_patch ->> 'offboard_default' else offboard_default end,
      default_member_role = case when p_patch ? 'default_member_role' then p_patch ->> 'default_member_role' else default_member_role end,
      invite_link_ttl_days = case when p_patch ? 'invite_link_ttl_days' then (p_patch ->> 'invite_link_ttl_days')::smallint else invite_link_ttl_days end,
      publish_external_role = case when p_patch ? 'publish_external_role' then p_patch ->> 'publish_external_role' else publish_external_role end,
      guest_invite_role = case when p_patch ? 'guest_invite_role' then p_patch ->> 'guest_invite_role' else guest_invite_role end,
      export_role = case when p_patch ? 'export_role' then p_patch ->> 'export_role' else export_role end,
      updated_at = now()
    where id = p_team;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'team_invalid';
  end;
  perform public._team_audit(p_team, 'policy', 'team_updated', t.name, jsonb_build_object('keys', to_jsonb(v_changed)));
end $$;

create or replace function public._team_offboard(p_team uuid, p_user uuid, p_mode text, p_new_owner uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sum jsonb;
begin
  v_sum := jsonb_build_object(
    'prompts', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and i.kind = 'prompt'),
    'items', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and i.kind <> 'prompt'),
    'variables', (select count(*) from public.team_variables v where v.team_id = p_team and v.updated_by = p_user));
  perform set_config('promptly.team_sync', '1', true);
  if p_mode = 'member' and p_new_owner is not null then
    update public.space_items i set created_by = case when i.created_by = p_user then p_new_owner else i.created_by end,
                                    updated_by = case when i.updated_by = p_user then p_new_owner else i.updated_by end
      from public.spaces s where s.id = i.space_id and s.team_id = p_team and (i.created_by = p_user or i.updated_by = p_user);
    update public.team_variables v set updated_by = p_new_owner where v.team_id = p_team and v.updated_by = p_user;
    update public.spaces set team_creator_id = p_new_owner where team_id = p_team and team_creator_id = p_user;
  end if;
  update public.team_groups set lead_id = null where team_id = p_team and lead_id = p_user;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  perform set_config('promptly.team_sync', '', true);
  return v_sum;
end $$;

create or replace function public.team_member_content_summary(p_team uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'manage_members');
  return jsonb_build_object(
    'prompts', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and i.kind = 'prompt'),
    'items', (select count(*) from public.space_items i join public.spaces s on s.id = i.space_id where s.team_id = p_team and i.created_by = p_user and i.kind <> 'prompt'),
    'variables', (select count(*) from public.team_variables v where v.team_id = p_team and v.updated_by = p_user),
    'personal', (select count(*) from public.prompts p where p.author_id = p_user and p.community_id is null and p.visibility = 'private'));
end $$;

create or replace function public.team_export(p_team uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.teams; v_out jsonb;
begin
  perform public._team_require(p_team, 'export');
  select * into t from public.teams where id = p_team;
  v_out := jsonb_build_object(
    'format', 'promptly.team', 'schemaVersion', 2, 'exportedAt', now(),
    'team', jsonb_build_object('name', t.name, 'slug', t.slug),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', p.title, 'description', p.description, 'archived', p.archived_at is not null,
               'files', coalesce((select jsonb_agg(jsonb_build_object('title', f.title, 'reviewRequired', f.review_required, 'archived', f.archived_at is not null) order by f.position, f.title)
                                    from public.team_files f where f.project_id = p.id), '[]'::jsonb),
               'variables', coalesce((select jsonb_agg(jsonb_build_object('name', v.name, 'value', v.value) order by v.name)
                                        from public.team_variables v where v.project_id = p.id and v.file_id is null), '[]'::jsonb))
             order by p.title)
        from public.team_projects p where p.team_id = p_team), '[]'::jsonb));
  perform public._team_audit(p_team, 'team', 'team_exported', t.name);
  return v_out;
end $$;

-- Panel: kütüphane kullanımı yerine PROJE etkinliği (ekip alanlarına eklenen öğeler, onay süresi, katkı verenler, bekleyenler).
create or replace function public.team_insights(p_team uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.teams;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_from date := (now() at time zone 'utc')::date - (greatest(7, least(coalesce(p_days, 30), 90)) - 1);
  v_prev_from date := (now() at time zone 'utc')::date - (2 * greatest(7, least(coalesce(p_days, 30), 90)) - 1);
  v_areas uuid[];
  v_added integer; v_added_prev integer;
  v_med numeric; v_med_prev numeric;
  v_contrib integer; v_contrib_prev integer;
begin
  perform public._team_require(p_team, 'view_audit');
  select * into t from public.teams where id = p_team;
  select coalesce(array_agg(s.id), '{}') into v_areas from public.spaces s where s.team_id = p_team and s.kind = 'team_area';
  select count(*) into v_added from public.space_items i where i.space_id = any (v_areas) and i.created_at::date >= v_from;
  select count(*) into v_added_prev from public.space_items i where i.space_id = any (v_areas) and i.created_at::date >= v_prev_from and i.created_at::date < v_from;
  select (percentile_cont(0.5) within group (order by extract(epoch from i.rev_decided_at - i.rev_submitted_at) / 3600.0))::numeric into v_med
    from public.space_items i where i.space_id = any (v_areas) and i.rev_state = 'approved' and i.rev_submitted_at is not null and i.rev_decided_at > i.rev_submitted_at and i.rev_decided_at::date >= v_from;
  select (percentile_cont(0.5) within group (order by extract(epoch from i.rev_decided_at - i.rev_submitted_at) / 3600.0))::numeric into v_med_prev
    from public.space_items i where i.space_id = any (v_areas) and i.rev_state = 'approved' and i.rev_submitted_at is not null and i.rev_decided_at > i.rev_submitted_at
     and i.rev_decided_at::date >= v_prev_from and i.rev_decided_at::date < v_from;
  select count(distinct coalesce(i.updated_by, i.created_by)) into v_contrib from public.space_items i where i.space_id = any (v_areas) and i.updated_at::date >= v_from;
  select count(distinct coalesce(i.updated_by, i.created_by)) into v_contrib_prev from public.space_items i where i.space_id = any (v_areas) and i.updated_at::date >= v_prev_from and i.updated_at::date < v_from;
  return jsonb_build_object(
    'days', v_days,
    'added', v_added, 'added_prev', v_added_prev,
    'approval_hours', v_med, 'approval_hours_prev', v_med_prev,
    'contributors', v_contrib, 'contributors_prev', v_contrib_prev, 'members', t.member_count,
    'projects', (select count(*) from public.team_projects p where p.team_id = p_team and p.archived_at is null),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
                         from generate_series(v_from, (now() at time zone 'utc')::date, interval '1 day') d
                         left join (select i.created_at::date as day, count(*)::integer as n from public.space_items i
                                     where i.space_id = any (v_areas) and i.created_at::date >= v_from group by 1) c on c.day = d::date), '[]'::jsonb),
    'alerts', jsonb_build_object(
      'pending', (select count(*) from public.space_items i where i.space_id = any (v_areas) and i.rev_state = 'pending'),
      'oldest_pending_days', (select extract(day from now() - min(i.rev_submitted_at))::integer from public.space_items i where i.space_id = any (v_areas) and i.rev_state = 'pending'),
      'changes', (select count(*) from public.space_items i where i.space_id = any (v_areas) and i.rev_state = 'changes')),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'added', x.added, 'pending', x.pending) order by x.added desc, x.title)
        from (select p.id, p.title,
                     (select count(*)::integer from public.space_items i join public.spaces s on s.id = i.space_id
                       where s.team_project_id = p.id and i.created_at::date >= v_from) as added,
                     (select count(*)::integer from public.space_items i join public.spaces s on s.id = i.space_id
                       where s.team_project_id = p.id and i.rev_state = 'pending') as pending
                from public.team_projects p where p.team_id = p_team and p.archived_at is null order by 3 desc, p.title limit 8) x
       where x.added > 0 or x.pending > 0), '[]'::jsonb));
end $$;

-- "Senden bekleyenler": kütüphane onayı dalı kalktı; proje onayları `team_project_todos`'tan gelir. Okunmamış sohbet ve süresi dolan konuk kalır.
create or replace function public.my_team_todos()
returns table(team_id uuid, team_name text, team_slug text, kind text, n integer, label text, href text, at timestamp with time zone)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_unread integer; v_guests integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for r in select t.id, t.name, t.slug, m.role from public.team_members m join public.teams t on t.id = m.team_id
            where m.user_id = auth.uid() and m.role <> 'guest' order by t.name loop
    select coalesce(sum(u.unread_count), 0)::integer into v_unread
      from public.team_channels tc join public.conversation_members cm on cm.conversation_id = tc.id and cm.user_id = auth.uid()
      cross join lateral public.group_unread_counts(array[tc.id]) u where tc.team_id = r.id and tc.archived_at is null;
    if v_unread > 0 then
      return query select r.id, r.name, r.slug, 'unread'::text, v_unread, null::text, '/teams/local?id=' || r.id || '&tab=chat', now();
    end if;
    if r.role in ('owner', 'admin') then
      select count(*)::integer into v_guests from public.team_members g where g.team_id = r.id and g.role = 'guest' and g.guest_until > now() and g.guest_until < now() + interval '7 days';
      if v_guests > 0 then
        return query select r.id, r.name, r.slug, 'guest_expiring'::text, v_guests, null::text, '/teams/local?id=' || r.id || '&tab=manage&section=guests', now();
      end if;
    end if;
  end loop;
end $$;

-- 5) Yalnız kütüphaneye ait RPC'ler / yardımcılar / tetikleyici fonksiyonları (tüm aşırı yüklemeleriyle) -------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('_team_api_allowed', '_team_api_log', '_team_approvals_needed', '_team_can_approve_item', '_team_item_hidden',
                                'api_me_libraries', 'api_me_library_prompts', 'api_me_library_variables', 'api_me_team_libraries',
                                'list_space_item_versions', 'space_add_review_comment', 'space_can_approve', 'space_can_approve_item',
                                'space_decide_item', 'space_delete_variable', 'space_item_review', 'space_item_works_recount',
                                'space_item_works_state', 'space_items_version_snapshot', 'space_record_item_use', 'space_request_review',
                                'space_restore_item_version', 'space_set_item_approval', 'space_set_item_deprecated', 'space_set_item_works',
                                'space_set_project_approvals', 'space_set_review_sample', 'space_set_variable', 'spaces_team_before_delete',
                                'team_create_project_library', 'team_libraries', 'team_library_counts', 'team_library_items',
                                'team_set_api_block', 'team_integrations') loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;
