-- Ekipler, WP6 (docs/history/353-*): yönetim, entegrasyon (API/MCP), panel, dışa aktarma, "Senden bekleyenler", bildirim kategorisi.
--
-- Ekleyicidir (yeni tablo/sütun/fonksiyon). `api_me_libraries` / `api_me_library_prompts` / `api_me_library_variables` AYNI imzayla ekip politikalarına uyar
-- (kişisel API/MCP okuması YALNIZ okur): ekip MCP açık mı, kitle, konuk yok, ekip bazlı engel; ekip kütüphanesi kullanımı günlüğe yazılır.

-- ============================================================================
-- 1. Onay süresi için inceleme başlangıcı
-- ============================================================================
alter table public.space_items add column if not exists review_started_at timestamptz;

create or replace function public.space_items_review_started()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.review_requested_at is not null and old.review_requested_at is null then
    new.review_started_at := new.review_requested_at;
  end if;
  return new;
end $$;
drop trigger if exists space_items_review_started on public.space_items;
create trigger space_items_review_started before update of review_requested_at on public.space_items for each row execute function public.space_items_review_started();

-- Kilit ve onay korumaları yeni sütunu "değişiklik" saymaz.
create or replace function public.space_items_lock_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_skip text[] := array['locked', 'updated_at', 'updated_by', 'approved_at', 'approved_by', 'review_requested_at', 'review_requested_by', 'review_started_at',
                         'deprecated_at', 'deprecated_by', 'content_rev', 'use_count', 'works_yes', 'works_no'];
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
-- 2. API / MCP kullanımı ve ekip bazlı engel
-- ============================================================================
create table if not exists public.team_api_usage (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_id uuid references public.api_tokens (id) on delete set null,
  via text not null check (via in ('key', 'oauth', 'telegram')),
  day date not null default ((now() at time zone 'utc')::date),
  reads integer not null default 0
);
create unique index if not exists team_api_usage_uniq on public.team_api_usage (team_id, user_id, coalesce(token_id, '00000000-0000-0000-0000-000000000000'::uuid), via, day);
create index if not exists team_api_usage_team_day_idx on public.team_api_usage (team_id, day);
alter table public.team_api_usage enable row level security;

create table if not exists public.team_api_blocks (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_id uuid references public.api_tokens (id) on delete cascade,
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists team_api_blocks_uniq on public.team_api_blocks (team_id, user_id, coalesce(token_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.team_api_blocks enable row level security;
revoke all on public.team_api_usage, public.team_api_blocks from anon, authenticated;

create or replace function public._api_claim(p_key text)
returns text language sql stable set search_path = public as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> p_key, ''), '')
$$;

-- Bu kimlik (kullanıcı + varsa anahtar) bu ekibin kütüphanesini API/MCP ile okuyabilir mi?
create or replace function public._team_api_allowed(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select t.mcp_enabled
       and public._team_rank(m.role) >= case t.mcp_audience when 'members' then 1 when 'editors' then 2 else 3 end
       and not exists (
         select 1 from public.team_api_blocks b
          where b.team_id = t.id and b.user_id = auth.uid()
            and (b.token_id is null or b.token_id = nullif(public._api_claim('token_id'), '')::uuid))
      from public.teams t
      join public.team_members m on m.team_id = t.id and m.user_id = auth.uid() and m.role <> 'guest'
     where t.id = p_team
  ), false)
$$;

create or replace function public._team_api_log(p_team uuid, p_reads integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_token uuid := nullif(public._api_claim('token_id'), '')::uuid; v_via text := coalesce(nullif(public._api_claim('via'), ''), 'key');
begin
  if auth.uid() is null or p_reads <= 0 then return; end if;
  if v_via not in ('key', 'oauth', 'telegram') then v_via := 'key'; end if;
  insert into public.team_api_usage (team_id, user_id, token_id, via, reads) values (p_team, auth.uid(), v_token, v_via, p_reads)
  on conflict (team_id, user_id, coalesce(token_id, '00000000-0000-0000-0000-000000000000'::uuid), via, day) do update set reads = public.team_api_usage.reads + excluded.reads;
end $$;

-- Aynı imza: kişisel kütüphaneler eskisi gibi; ekip kütüphaneleri ekip politikasına tabi.
create or replace function public.api_me_libraries()
returns table (id uuid, title text, description text, role text, approved_count integer, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, left(coalesce(s.description, ''), 300), public.space_role(s.id),
         (select count(*)::int from public.space_items i where i.space_id = s.id and i.kind = 'prompt' and i.is_draft and i.approved_at is not null and i.deprecated_at is null),
         s.updated_at
    from public.spaces s
   where s.kind = 'team_library' and s.archived_at is null and auth.uid() is not null and public.space_role(s.id) is not null
     and (s.team_id is null or public._team_api_allowed(s.team_id))
   order by s.updated_at desc, s.id
   limit 50;
$$;

-- Ekip kısa adı ile süzülen sürüm (ekip MCP adresi `…/mcp/team/<kısa-ad>`).
create or replace function public.api_me_team_libraries(p_team_slug text default null)
returns table (id uuid, title text, description text, role text, approved_count integer, updated_at timestamptz, team_slug text, team_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, left(coalesce(s.description, ''), 300), public.space_role(s.id),
         (select count(*)::int from public.space_items i where i.space_id = s.id and i.kind = 'prompt' and i.is_draft and i.approved_at is not null and i.deprecated_at is null),
         s.updated_at, t.slug, t.name
    from public.spaces s join public.teams t on t.id = s.team_id
   where s.kind = 'team_library' and s.archived_at is null and auth.uid() is not null and public.space_role(s.id) is not null
     and public._team_api_allowed(s.team_id) and (p_team_slug is null or t.slug = lower(btrim(p_team_slug)))
   order by s.updated_at desc, s.id
   limit 50;
$$;

create or replace function public.api_me_library_prompts(p_space uuid, p_include_unapproved boolean default false)
returns table (id uuid, title text, body text, group_name text, approved_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  s public.spaces;
  v_role text;
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from public.spaces where spaces.id = p_space and spaces.kind = 'team_library' and spaces.archived_at is null;
  if not found then return; end if;
  v_role := public.space_role(p_space);
  if v_role is null then return; end if;
  if s.team_id is not null and not public._team_api_allowed(s.team_id) then return; end if;
  return query
  select i.id, i.title, i.body, g.name, i.approved_at, i.updated_at
    from public.space_items i
    left join public.space_groups g on g.id = i.group_id
   where i.space_id = p_space and i.kind = 'prompt' and i.is_draft and i.deprecated_at is null
     and not public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id)
     and (i.approved_at is not null or (coalesce(p_include_unapproved, false) and (s.team_id is null or v_role in ('owner', 'editor'))))
   order by coalesce(g.position, 0), g.name nulls first, i.title, i.id
   limit 200;
  if s.team_id is not null then
    get diagnostics v_rows = row_count;
    perform public._team_api_log(s.team_id, v_rows);
  end if;
end $$;

create or replace function public.api_me_library_variables(p_space uuid)
returns table (name text, value text)
language sql stable security definer set search_path = public as $$
  select v.name, v.value
    from public.space_variables v join public.spaces s on s.id = v.space_id
   where v.space_id = p_space and s.kind = 'team_library' and auth.uid() is not null and public.space_role(p_space) is not null
     and (s.team_id is null or public._team_api_allowed(s.team_id))
   order by v.name
   limit 50;
$$;

-- Entegrasyonlar sayfası: adres, kitle, bağlı uygulamalar (son 30 gün) ve bu aydaki okuma toplamı.
create or replace function public.team_integrations(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.teams;
begin
  perform public._team_require(p_team, 'manage_team');
  select * into t from public.teams where id = p_team;
  return jsonb_build_object(
    'slug', t.slug, 'enabled', t.mcp_enabled, 'audience', t.mcp_audience,
    'month_reads', coalesce((select sum(u.reads) from public.team_api_usage u where u.team_id = p_team and u.day >= date_trunc('month', now() at time zone 'utc')::date), 0),
    'apps', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', x.user_id, 'token_id', x.token_id, 'via', x.via,
               'name', coalesce(tk.name, case x.via when 'oauth' then 'Claude / ChatGPT bağlayıcısı' when 'telegram' then 'Telegram' else 'API anahtarı' end),
               'user_name', coalesce(nullif(p.display_name, ''), p.username), 'last_day', x.last_day, 'reads', x.reads,
               'blocked', exists (select 1 from public.team_api_blocks b where b.team_id = p_team and b.user_id = x.user_id and (b.token_id is null or b.token_id is not distinct from x.token_id)))
             order by x.last_day desc, x.reads desc)
        from (select u.user_id, u.token_id, u.via, max(u.day) as last_day, sum(u.reads)::integer as reads
                from public.team_api_usage u where u.team_id = p_team and u.day >= (now() at time zone 'utc')::date - 30
               group by u.user_id, u.token_id, u.via) x
        join public.profiles p on p.id = x.user_id
        left join public.api_tokens tk on tk.id = x.token_id), '[]'::jsonb));
end $$;

create or replace function public.team_set_api_block(p_team uuid, p_user uuid, p_token uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._team_require(p_team, 'manage_team');
begin
  if p_blocked then
    insert into public.team_api_blocks (team_id, user_id, token_id, blocked_by) values (p_team, p_user, p_token, v_uid) on conflict do nothing;
  else
    delete from public.team_api_blocks where team_id = p_team and user_id = p_user and token_id is not distinct from p_token;
  end if;
  perform public._team_audit(p_team, 'integration', case when p_blocked then 'api_blocked' else 'api_unblocked' end, (select username from public.profiles where id = p_user));
end $$;

-- ============================================================================
-- 3. Denetim günlüğü
-- ============================================================================
create or replace function public.team_audit_list(p_team uuid, p_category text default null, p_days integer default 30, p_limit integer default 50, p_before timestamptz default null)
returns table (id uuid, created_at timestamptz, category text, action text, target_label text, details jsonb, actor_id uuid, actor_username text, actor_name text, actor_avatar_url text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'view_audit');
  return query
  select a.id, a.created_at, a.category, a.action, a.target_label, a.details, a.actor_id, p.username, coalesce(nullif(p.display_name, ''), p.username), p.avatar_url
    from public.team_audit a left join public.profiles p on p.id = a.actor_id
   where a.team_id = p_team and a.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
     and (p_category is null or p_category = 'all' or a.category = p_category)
     and (p_before is null or a.created_at < p_before)
   order by a.created_at desc, a.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

create or replace function public.team_audit_stats(p_team uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'view_audit');
  return (select jsonb_build_object(
    'total', count(*),
    'role_access', count(*) filter (where category in ('role', 'access')),
    'deletes', count(*) filter (where action in ('member_removed', 'channel_deleted', 'group_deleted', 'message_deleted', 'item_deprecated', 'item_unapproved')))
    from public.team_audit a where a.team_id = p_team and a.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))));
end $$;

-- ============================================================================
-- 4. Space erişimi özeti (Yönetim → Space erişimi)
-- ============================================================================
create or replace function public.team_access_overview(p_team uuid)
returns table (space_id uuid, title text, kind text, is_library boolean, mode text, member_count integer, guest_count integer, entry_count integer, creator_name text, updated_at timestamptz, archived_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._team_require(p_team, 'manage_members');
  return query
  select s.id, s.title, s.kind, t.library_space_id = s.id, s.team_access_mode,
         (select count(*)::integer from public.space_members m where m.space_id = s.id),
         (select count(*)::integer from public.space_members m join public.team_members tm on tm.team_id = p_team and tm.user_id = m.user_id and tm.role = 'guest' where m.space_id = s.id),
         (select count(*)::integer from public.team_access a where a.space_id = s.id),
         (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = s.team_creator_id), s.updated_at, s.archived_at
    from public.spaces s join public.teams t on t.id = s.team_id
   where s.team_id = p_team
   order by s.archived_at is not null, (t.library_space_id = s.id) desc, s.updated_at desc;
end $$;

-- ============================================================================
-- 5. Panel
-- ============================================================================
create or replace function public.team_insights(p_team uuid, p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.teams;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_from date := (now() at time zone 'utc')::date - (greatest(7, least(coalesce(p_days, 30), 90)) - 1);
  v_prev_from date := (now() at time zone 'utc')::date - (2 * greatest(7, least(coalesce(p_days, 30), 90)) - 1);
  v_lib uuid;
  v_copies integer; v_copies_prev integer;
  v_med numeric; v_med_prev numeric;
  v_contrib integer; v_contrib_prev integer;
  v_stale integer;
begin
  perform public._team_require(p_team, 'view_audit');
  select * into t from public.teams where id = p_team;
  v_lib := t.library_space_id;
  select count(*) into v_copies from public.space_item_uses u where u.space_id = v_lib and u.day >= v_from;
  select count(*) into v_copies_prev from public.space_item_uses u where u.space_id = v_lib and u.day >= v_prev_from and u.day < v_from;
  select (percentile_cont(0.5) within group (order by extract(epoch from i.approved_at - i.review_started_at) / 3600.0))::numeric into v_med
    from public.space_items i where i.space_id = v_lib and i.approved_at is not null and i.review_started_at is not null and i.approved_at > i.review_started_at and i.approved_at >= v_from;
  select (percentile_cont(0.5) within group (order by extract(epoch from i.approved_at - i.review_started_at) / 3600.0))::numeric into v_med_prev
    from public.space_items i where i.space_id = v_lib and i.approved_at is not null and i.review_started_at is not null and i.approved_at > i.review_started_at and i.approved_at >= v_prev_from and i.approved_at < v_from;
  select count(distinct coalesce(i.updated_by, i.created_by)) into v_contrib from public.space_items i where i.space_id = v_lib and i.kind = 'prompt' and i.is_draft and i.updated_at >= v_from;
  select count(distinct coalesce(i.updated_by, i.created_by)) into v_contrib_prev from public.space_items i where i.space_id = v_lib and i.kind = 'prompt' and i.is_draft and i.updated_at >= v_prev_from and i.updated_at < v_from;
  select count(*) into v_stale from public.space_items i where i.space_id = v_lib and i.kind = 'prompt' and i.is_draft and i.deprecated_at is null and i.updated_at < now() - interval '90 days';
  return jsonb_build_object(
    'days', v_days,
    'copies', v_copies, 'copies_prev', v_copies_prev,
    'approval_hours', v_med, 'approval_hours_prev', v_med_prev,
    'contributors', v_contrib, 'contributors_prev', v_contrib_prev, 'members', t.member_count,
    'stale', v_stale,
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
                         from generate_series(v_from, (now() at time zone 'utc')::date, interval '1 day') d
                         left join (select u.day, count(*)::integer as n from public.space_item_uses u where u.space_id = v_lib and u.day >= v_from group by u.day) c on c.day = d::date), '[]'::jsonb),
    'alerts', jsonb_build_object(
      'pending', (select count(*) from public.space_items i where i.space_id = v_lib and i.kind = 'prompt' and i.is_draft and i.review_requested_at is not null and i.approved_at is null and i.deprecated_at is null),
      'oldest_pending_days', (select extract(day from now() - min(i.review_requested_at))::integer from public.space_items i where i.space_id = v_lib and i.review_requested_at is not null and i.approved_at is null and i.deprecated_at is null),
      'stale', v_stale,
      'deprecated_used', (select count(distinct u.item_id)::integer from public.space_item_uses u join public.space_items i on i.id = u.item_id where u.space_id = v_lib and i.deprecated_at is not null and u.day >= v_from)),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'copies', x.copies, 'works_yes', x.works_yes, 'works_no', x.works_no, 'rev', x.content_rev,
                                          'updated_at', x.updated_at, 'stale', x.updated_at < now() - interval '90 days') order by x.copies desc, x.title)
        from (select i.id, i.title, i.works_yes, i.works_no, i.content_rev, i.updated_at,
                     (select count(*)::integer from public.space_item_uses u where u.item_id = i.id and u.day >= v_from) as copies
                from public.space_items i where i.space_id = v_lib and i.kind = 'prompt' and i.is_draft and i.deprecated_at is null
               order by 7 desc, i.title limit 8) x where x.copies > 0), '[]'::jsonb));
end $$;

-- ============================================================================
-- 6. Senden bekleyenler (ekipler arası)
-- ============================================================================
create or replace function public.my_team_todos()
returns table (team_id uuid, team_name text, team_slug text, kind text, n integer, label text, href text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r record; v_n integer; i record; v_unread integer; v_guests integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  for r in select t.id, t.name, t.slug, t.library_space_id, m.role from public.team_members m join public.teams t on t.id = m.team_id
            where m.user_id = auth.uid() and m.role <> 'guest' order by t.name loop
    select count(*)::integer into v_n from public.space_items it
     where it.space_id = r.library_space_id and it.kind = 'prompt' and it.is_draft and it.review_requested_at is not null and it.approved_at is null and it.deprecated_at is null
       and public._team_can_approve_item(it.id, auth.uid());
    if v_n > 0 then
      return query select r.id, r.name, r.slug, 'approvals'::text, v_n, null::text, '/teams/local?id=' || r.id || '&tab=library&status=pending', now();
      for i in select it.id, it.title, it.review_requested_at, coalesce(nullif(p.display_name, ''), p.username) as who
                 from public.space_items it left join public.profiles p on p.id = it.review_requested_by
                where it.space_id = r.library_space_id and it.kind = 'prompt' and it.is_draft and it.review_requested_at is not null and it.approved_at is null and it.deprecated_at is null
                  and it.review_requested_by is distinct from auth.uid() and public._team_can_approve_item(it.id, auth.uid())
                order by it.review_requested_at desc limit 3 loop
        return query select r.id, r.name, r.slug, 'review'::text, 1, i.title || ' · ' || coalesce(i.who, ''), '/teams/local?id=' || r.id || '&tab=library&review=' || i.id, i.review_requested_at;
      end loop;
    end if;
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

-- ============================================================================
-- 7. Dışa aktarma (yönetici/sahip — politika `export_role`)
-- ============================================================================
create or replace function public.team_export(p_team uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.teams; v_out jsonb;
begin
  perform public._team_require(p_team, 'export');
  select * into t from public.teams where id = p_team;
  v_out := jsonb_build_object(
    'format', 'promptly.team-library', 'schemaVersion', 1, 'exportedAt', now(),
    'team', jsonb_build_object('name', t.name, 'slug', t.slug),
    'variables', coalesce((select jsonb_agg(jsonb_build_object('name', v.name, 'value', v.value) order by v.name) from public.space_variables v where v.space_id = t.library_space_id), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('title', i.title, 'text', i.body, 'folder', g.name, 'state', public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at),
                                          'version', i.content_rev, 'uses', i.use_count, 'worksYes', i.works_yes, 'worksNo', i.works_no, 'updatedAt', i.updated_at) order by g.position nulls first, i.title)
        from (select * from public.space_items x where x.space_id = t.library_space_id and x.kind = 'prompt' and x.is_draft order by x.title limit 2000) i
        left join public.space_groups g on g.id = i.group_id), '[]'::jsonb),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('title', s.title, 'kind', s.kind, 'access', s.team_access_mode) order by s.title) from public.spaces s where s.team_id = p_team and s.id <> t.library_space_id), '[]'::jsonb));
  perform public._team_audit(p_team, 'team', 'team_exported', t.name);
  return v_out;
end $$;

-- ============================================================================
-- 8. Bildirim kategorisi: /teams adresleri "Ekipler" kategorisine düşer
-- ============================================================================
create or replace function public._notification_category(p_type text, p_href text)
returns text language sql immutable as $$
  select case
    when coalesce(p_href, '') ~ '^/teams([/?#]|$)' or (p_type = 'system' and coalesce(p_href, '') ~ '^/spaces/local\?.*&tab=prompts') then 'teams'
    when coalesce(p_href, '') ~ '^/(communities|groups)([/?#]|$)' then 'community'
    when p_type = 'system' and coalesce(p_href, '') like '/messages/local%' then 'community'
    when p_type in ('request_response', 'request_edited') then 'requests'
    when p_type = 'follow' then 'follow'
    when p_type in ('message', 'message_request') then 'messages'
    when p_type in ('like', 'comment', 'comment_reply', 'prompt_edited', 'edit_suggestion_received', 'edit_suggestion_accepted',
                    'edit_suggestion_rejected', 'prompt_result_shared', 'story_reaction', 'story_poll_vote', 'story_question_answer', 'quote') then 'posts'
    else 'system'
  end
$$;

-- ============================================================================
-- 9. Yetkiler
-- ============================================================================
do $$
declare fn text;
begin
  foreach fn in array array['public._api_claim(text)', 'public._team_api_allowed(uuid)', 'public._team_api_log(uuid, integer)', 'public.space_items_review_started()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.api_me_libraries()', 'public.api_me_team_libraries(text)', 'public.api_me_library_prompts(uuid, boolean)', 'public.api_me_library_variables(uuid)',
    'public.team_integrations(uuid)', 'public.team_set_api_block(uuid, uuid, uuid, boolean)', 'public.team_audit_list(uuid, text, integer, integer, timestamptz)',
    'public.team_audit_stats(uuid, integer)', 'public.team_access_overview(uuid)', 'public.team_insights(uuid, integer)', 'public.my_team_todos()', 'public.team_export(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
