-- Ekipler, WP3 (docs/history/353-*): kütüphane yönetişimi — onay (n onay), inceleme + "Değişiklik iste", kullanım, "Çalıştı mı?", kullanımdan kalkma,
-- onaysızı gizleme, grup klasörü, ekip değişkenleri yetkisi.
--
-- Durumlar (türetilir): Taslak · Onay bekliyor · Onaylı · Kullanımdan kalktı. Onay sayısı `teams.approvals_needed`; onaylar İÇERİK SÜRÜMÜNE
-- (`space_items.content_rev`) bağlıdır: başlık/metin değişince eski onaylar geçersiz sayılır ve onay işareti kendiliğinden düşer (348 kuralı).
-- Ekleyicidir: yeni sütun/tablo/fonksiyon; mevcut fonksiyonlar `create or replace` ile ekip kavramına (team_id) taşınır.

-- ============================================================================
-- 1. Sütunlar
-- ============================================================================
alter table public.space_items add column if not exists content_rev integer not null default 1;
alter table public.space_items add column if not exists deprecated_at timestamptz;
alter table public.space_items add column if not exists deprecated_by uuid references public.profiles (id) on delete set null;
alter table public.space_items add column if not exists use_count integer not null default 0;
alter table public.space_items add column if not exists works_yes integer not null default 0;
alter table public.space_items add column if not exists works_no integer not null default 0;
alter table public.space_items drop constraint if exists space_items_deprecated_draft_only;
alter table public.space_items add constraint space_items_deprecated_draft_only check (deprecated_at is null or (kind = 'prompt' and is_draft));

drop trigger if exists space_items_protect_counters on public.space_items;
create trigger space_items_protect_counters before insert or update of use_count, works_yes, works_no, content_rev on public.space_items
  for each row execute function public.protect_counter_columns('use_count', 'works_yes', 'works_no', 'content_rev');

alter table public.space_groups add column if not exists team_group_id uuid references public.team_groups (id) on delete set null;

-- ============================================================================
-- 2. Tablolar
-- ============================================================================
create table if not exists public.space_item_approvals (
  item_id uuid not null references public.space_items (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_rev integer not null,
  decision text not null check (decision in ('approve', 'changes')),
  note text not null default '' check (char_length(note) <= 1000),
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id, content_rev)
);
create index if not exists space_item_approvals_space_idx on public.space_item_approvals (space_id);

create table if not exists public.space_item_review_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.space_items (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'comment' check (kind in ('comment', 'approve', 'changes')),
  body text not null check (char_length(body) between 1 and 1000),
  content_rev integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists space_item_review_comments_item_idx on public.space_item_review_comments (item_id, created_at);

-- Günde kişi başına tek satır (kopyalama sayısı için tekilleştirme); istemci hiç okuyamaz/yazamaz.
create table if not exists public.space_item_uses (
  item_id uuid not null references public.space_items (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  primary key (item_id, user_id, day)
);
create index if not exists space_item_uses_space_day_idx on public.space_item_uses (space_id, day);

create table if not exists public.space_item_works_votes (
  item_id uuid not null references public.space_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  works boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.space_item_approvals enable row level security;
alter table public.space_item_review_comments enable row level security;
alter table public.space_item_uses enable row level security;
alter table public.space_item_works_votes enable row level security;

drop policy if exists "Editors read approvals" on public.space_item_approvals;
create policy "Editors read approvals" on public.space_item_approvals for select to authenticated using (public.space_role(space_id) in ('owner', 'editor'));
drop policy if exists "Editors read review comments" on public.space_item_review_comments;
create policy "Editors read review comments" on public.space_item_review_comments for select to authenticated using (public.space_role(space_id) in ('owner', 'editor'));
revoke all on public.space_item_approvals, public.space_item_review_comments, public.space_item_uses, public.space_item_works_votes from anon;
revoke insert, update, delete on public.space_item_approvals, public.space_item_review_comments, public.space_item_uses, public.space_item_works_votes from authenticated;
revoke select on public.space_item_uses, public.space_item_works_votes from authenticated;
grant select on public.space_item_approvals, public.space_item_review_comments to authenticated;

-- ============================================================================
-- 3. Durum, yetki ve gizleme yardımcıları
-- ============================================================================
create or replace function public._space_item_state(p_approved timestamptz, p_deprecated timestamptz, p_review timestamptz)
returns text language sql immutable set search_path = public as $$
  select case when p_deprecated is not null then 'deprecated' when p_approved is not null then 'approved' when p_review is not null then 'pending' else 'draft' end
$$;

-- Çağıran bu öğeyi onaylayabilir mi: ekip yöneticisi/sahibi (approve_library) ya da öğenin grup klasörünün lideri (grup "liderler onaylar" açıksa).
create or replace function public._team_can_approve_item(p_item uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public._team_can(s.team_id, p_user, 'approve_library')
        or exists (
             select 1 from public.space_groups sg
               join public.team_groups tg on tg.id = sg.team_group_id
              where sg.id = i.group_id and tg.leads_approve and tg.lead_id = p_user
                and public._team_role(s.team_id, p_user) in ('owner', 'admin', 'editor', 'member'))
      from public.space_items i join public.spaces s on s.id = i.space_id
     where i.id = p_item and s.team_id is not null and s.kind = 'team_library'
  ), false)
$$;

-- Onaylanmamış taslak, "onaysızı gizle" açıkken yalnız GÖRÜNTÜLEYİCİ üyeden saklanır (düzenleyiciler ve yöneticiler görür).
create or replace function public._team_item_hidden(p_space uuid, p_kind text, p_draft boolean, p_approved timestamptz, p_group uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_kind <> 'prompt' or not p_draft or p_approved is not null or auth.uid() is null then false
    else coalesce((
      select t.hide_unapproved
             and exists (select 1 from public.space_members m where m.space_id = p_space and m.user_id = auth.uid() and m.role = 'viewer')
             -- Klasörün onaylayıcı lideri, kendi klasöründeki onaysız taslakları görür (onaylayabilmesi için).
             and not exists (select 1 from public.space_groups sg join public.team_groups tg on tg.id = sg.team_group_id
                              where sg.id = p_group and tg.leads_approve and tg.lead_id = auth.uid())
        from public.spaces s join public.teams t on t.id = s.team_id
       where s.id = p_space and s.kind = 'team_library'), false) end
$$;
grant execute on function public._team_item_hidden(uuid, text, boolean, timestamptz, uuid) to anon, authenticated;

drop policy if exists space_items_hide_unapproved on public.space_items;
create policy space_items_hide_unapproved on public.space_items as restrictive for select
  using (not public._team_item_hidden(space_id, kind, is_draft, approved_at, group_id));

-- Sürüm geçmişi: öğeyi okuyamayan sürümünü de okuyamaz (gizli taslağın eski metinleri sızmasın).
drop policy if exists space_item_versions_select on public.space_item_versions;
create policy space_item_versions_select on public.space_item_versions for select
  using (public.can_read_space(space_id) and exists (select 1 from public.space_items i where i.id = item_id));

-- Bildirim: ekip üyesine tek satır (kullanıcı kendine göndermez). Sınıf/tercih katmanı WP6'da genişler.
create or replace function public._team_notify(p_recipient uuid, p_actor uuid, p_team uuid, p_class text, p_message text, p_href text, p_dedupe text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  if public._team_role(p_team, p_recipient) is null then return; end if;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (p_recipient, p_actor, 'system', p_message, p_href, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- ============================================================================
-- 4. Korumalar (içerik sürümü, onay/kullanımdan kalkma sütunları, kilit, sürüm anlık görüntüsü)
-- ============================================================================
create or replace function public.space_items_rev_bump()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.kind = 'prompt' and new.is_draft and (new.title, new.body) is distinct from (old.title, old.body) then
    new.content_rev := old.content_rev + 1;
  end if;
  return new;
end $$;
drop trigger if exists space_items_rev_bump on public.space_items;
create trigger space_items_rev_bump before update on public.space_items for each row execute function public.space_items_rev_bump();

create or replace function public.space_items_approval_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_by_rpc boolean := coalesce(current_setting('promptly.space_approval', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if (new.approved_at is not null or new.approved_by is not null or new.deprecated_at is not null or new.deprecated_by is not null) and not v_by_rpc then
      raise exception 'space_approval_forbidden';
    end if;
    return new;
  end if;
  if (new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
      or new.deprecated_at is distinct from old.deprecated_at or new.deprecated_by is distinct from old.deprecated_by) and not v_by_rpc then
    raise exception 'space_approval_forbidden';
  end if;
  if not v_by_rpc and old.approved_at is not null and (new.title, new.body) is distinct from (old.title, old.body) then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end $$;

create or replace function public.space_items_lock_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_skip text[] := array['locked', 'updated_at', 'updated_by', 'approved_at', 'approved_by', 'review_requested_at', 'review_requested_by',
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

create or replace function public.space_items_version_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_keep integer;
begin
  if old.kind <> 'prompt' or not old.is_draft then return new; end if;
  if (new.title, new.body) is not distinct from (old.title, old.body) then return new; end if;
  if not exists (select 1 from public.spaces s where s.id = old.space_id and s.kind = 'team_library') then return new; end if;
  insert into public.space_item_versions (item_id, space_id, title, body, author_id, was_approved, replaced_by)
  values (old.id, old.space_id, old.title, old.body, coalesce(old.updated_by, old.created_by), old.approved_at is not null, auth.uid());
  select coalesce((select t.version_keep from public.spaces s join public.teams t on t.id = s.team_id where s.id = old.space_id), 50) into v_keep;
  delete from public.space_item_versions v
   where v.item_id = old.id
     and v.id in (select x.id from public.space_item_versions x where x.item_id = old.id order by x.created_at desc, x.id desc offset v_keep);
  return new;
end $$;

-- ============================================================================
-- 5. Onay: karar (onayla / değişiklik iste), geri alma, inceleme isteği, kullanımdan kalkma
-- ============================================================================
create or replace function public.space_decide_item(p_item uuid, p_decision text, p_note text default '', p_checklist jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  t public.teams;
  v_note text := btrim(coalesce(p_note, ''));
  v_count integer;
  v_final boolean := false;
  v_check jsonb := coalesce(p_checklist, '[]'::jsonb);
  e jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_decision not in ('approve', 'changes') or char_length(v_note) > 1000 then raise exception 'space_invalid'; end if;
  if jsonb_typeof(v_check) <> 'array' or jsonb_array_length(v_check) > 10 then raise exception 'space_invalid'; end if;
  for e in select * from jsonb_array_elements(v_check) loop
    if jsonb_typeof(e) <> 'object' or char_length(coalesce(e ->> 'key', '')) not between 1 and 40 or jsonb_typeof(e -> 'done') <> 'boolean' then raise exception 'space_invalid'; end if;
  end loop;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.team_id is null or s.kind <> 'team_library' then raise exception 'space_invalid'; end if;
  select * into t from public.teams where id = s.team_id;
  if not public._team_can_approve_item(p_item, v_uid) then raise exception 'space_forbidden'; end if;
  if i.deprecated_at is not null then raise exception 'space_invalid'; end if;
  if p_decision = 'changes' and i.approved_at is not null then raise exception 'space_invalid'; end if;

  insert into public.space_item_approvals (item_id, space_id, user_id, content_rev, decision, note, checklist)
  values (p_item, i.space_id, v_uid, i.content_rev, p_decision, v_note, v_check)
  on conflict (item_id, user_id, content_rev) do update set decision = excluded.decision, note = excluded.note, checklist = excluded.checklist, created_at = now();
  insert into public.space_item_review_comments (item_id, space_id, author_id, kind, body, content_rev)
  values (p_item, i.space_id, v_uid, p_decision,
          case when v_note <> '' then v_note when p_decision = 'approve' then 'Onayladı.' else 'Değişiklik istedi.' end, i.content_rev);

  select count(*) into v_count from public.space_item_approvals a where a.item_id = p_item and a.content_rev = i.content_rev and a.decision = 'approve';

  perform set_config('promptly.space_approval', '1', true);
  if p_decision = 'approve' then
    if v_count >= t.approvals_needed then
      v_final := true;
      update public.space_items set approved_at = now(), approved_by = v_uid, review_requested_at = null, review_requested_by = null where id = p_item;
    end if;
  else
    update public.space_items set review_requested_at = null, review_requested_by = null where id = p_item;
  end if;
  perform set_config('promptly.space_approval', '', true);

  if v_final then
    perform public._space_log(i.space_id, 'item_approved', nullif(btrim(i.title), ''));
    perform public._team_audit(s.team_id, 'approval', 'item_approved', i.title, jsonb_build_object('rev', i.content_rev, 'approvals', v_count));
    perform public._team_notify(i.created_by, v_uid, s.team_id, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(i.title), ''), 'Adsız'), 80) || '" promptunu ekip kütüphanesinde onayladı.',
      '/spaces/local?id=' || i.space_id || '&tab=prompts', 'teamapprove:' || p_item || ':a:' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  elsif p_decision = 'changes' then
    perform public._team_audit(s.team_id, 'approval', 'changes_requested', i.title, jsonb_build_object('rev', i.content_rev));
    perform public._team_notify(i.created_by, v_uid, s.team_id, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(i.title), ''), 'Adsız'), 80) || '" promptunda değişiklik istedi.',
      '/spaces/local?id=' || i.space_id || '&tab=prompts', 'teamchanges:' || p_item || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;
  return jsonb_build_object('state', case when v_final then 'approved' when p_decision = 'changes' then 'draft' else 'pending' end,
                            'approvals', v_count, 'needed', t.approvals_needed);
end $$;

-- Eski yol: kişisel kütüphanede yalnız Space sahibi; ekip kütüphanesinde onay = karar RPC'si, geri alma = onayı kaldır (o sürümün onayları silinir).
create or replace function public.space_set_item_approval(p_item uuid, p_approved boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  s public.spaces;
  v_title text;
  v_at timestamptz;
  v_rows integer;
  v_author uuid;
  v_rev integer;
  v_res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null or p_approved is null then raise exception 'space_invalid'; end if;
  select i.space_id into v_space from public.space_items i where i.id = p_item;
  if v_space is null or not public.can_read_space(v_space) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = v_space;
  if s.kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  if s.team_id is not null then
    if p_approved then
      v_res := public.space_decide_item(p_item, 'approve', '', '[]'::jsonb);
      return (select approved_at from public.space_items where id = p_item);
    end if;
    if not public._team_can_approve_item(p_item, v_uid) then raise exception 'space_forbidden'; end if;
  elsif public.space_role(v_space) is distinct from 'owner' or not public.can_edit_space(v_space) then
    raise exception 'space_forbidden';
  end if;

  perform set_config('promptly.space_approval', '1', true);
  update public.space_items
     set approved_at = case when p_approved then now() else null end,
         approved_by = case when p_approved then v_uid else null end,
         review_requested_at = null, review_requested_by = null
   where id = p_item and kind = 'prompt' and is_draft
   returning title, approved_at, created_by, content_rev into v_title, v_at, v_author, v_rev;
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_approval', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  perform public._space_log(v_space, case when p_approved then 'item_approved' else 'item_unapproved' end, nullif(btrim(v_title), ''));
  if s.team_id is not null and not p_approved then
    delete from public.space_item_approvals where item_id = p_item and content_rev = v_rev;
    perform public._team_audit(s.team_id, 'approval', 'item_unapproved', v_title);
    perform public._team_notify(v_author, v_uid, s.team_id, 'direct',
      '"' || public.truncate_preview(coalesce(nullif(btrim(v_title), ''), 'Adsız'), 80) || '" promptunun onayını kaldırdı.',
      '/spaces/local?id=' || v_space || '&tab=prompts', 'teamapprove:' || p_item || ':r:' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;
  return v_at;
end $$;

create or replace function public.space_request_review(p_item uuid, p_withdraw boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  v_at timestamptz;
  v_rows integer;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null then raise exception 'space_invalid'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(i.space_id) then raise exception 'space_forbidden'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;

  if coalesce(p_withdraw, false) then
    if i.review_requested_at is null then return null; end if;
    perform set_config('promptly.space_review', '1', true);
    update public.space_items set review_requested_at = null, review_requested_by = null where id = p_item;
    perform set_config('promptly.space_review', '', true);
    return null;
  end if;
  if i.approved_at is not null or i.deprecated_at is not null then raise exception 'space_invalid'; end if;
  if i.review_requested_at is not null then return i.review_requested_at; end if;

  perform set_config('promptly.space_review', '1', true);
  update public.space_items set review_requested_at = now(), review_requested_by = v_uid where id = p_item returning review_requested_at into v_at;
  get diagnostics v_rows = row_count;
  perform set_config('promptly.space_review', '', true);
  if v_rows = 0 then raise exception 'space_invalid'; end if;

  if s.team_id is not null then
    perform public._team_audit(s.team_id, 'approval', 'review_requested', i.title);
    for r in
      select m.user_id
        from public.team_members m
       where m.team_id = s.team_id and m.user_id <> v_uid and m.role <> 'guest' and public._team_can_approve_item(p_item, m.user_id)
       order by (m.role = 'owner') desc, m.user_id
       limit 200
    loop
      perform public._team_notify(r.user_id, v_uid, s.team_id, 'direct',
        '"' || public.truncate_preview(coalesce(nullif(btrim(i.title), ''), 'Adsız'), 80) || '" promptu için onay istedi.',
        '/spaces/local?id=' || i.space_id || '&tab=prompts', 'teamreview:' || p_item || ':' || r.user_id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
    end loop;
  end if;
  return v_at;
end $$;

-- Arayüzün düğmeyi doğru göstermesi için (karar yine sunucuda): kişisel kütüphanede Space sahibi; ekipte yönetici ya da herhangi bir klasörün onaylayıcı lideri.
create or replace function public.space_can_approve(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.kind = 'team_library' and public.can_read_space(s.id)
       and case when s.team_id is not null
                then public._team_can(s.team_id, auth.uid(), 'approve_library')
                     or exists (select 1 from public.space_groups sg join public.team_groups tg on tg.id = sg.team_group_id
                                 where sg.space_id = s.id and tg.leads_approve and tg.lead_id = auth.uid())
                else public.space_role(s.id) = 'owner' and public.can_edit_space(s.id) end
      from public.spaces s where s.id = p_space and auth.uid() is not null
  ), false)
$$;

create or replace function public.space_can_approve_item(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.space_items i where i.id = p_item and public.can_read_space(i.space_id))
     and public._team_can_approve_item(p_item, auth.uid())
$$;

create or replace function public.space_set_item_deprecated(p_item uuid, p_deprecated boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null or p_deprecated is null then raise exception 'space_invalid'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.team_id is null or s.kind <> 'team_library' then raise exception 'space_invalid'; end if;
  if not public._team_can_approve_item(p_item, v_uid) then raise exception 'space_forbidden'; end if;
  perform set_config('promptly.space_approval', '1', true);
  update public.space_items set deprecated_at = case when p_deprecated then now() else null end,
                                deprecated_by = case when p_deprecated then v_uid else null end,
                                review_requested_at = case when p_deprecated then null else review_requested_at end,
                                review_requested_by = case when p_deprecated then null else review_requested_by end
   where id = p_item returning deprecated_at into v_at;
  perform set_config('promptly.space_approval', '', true);
  perform public._team_audit(s.team_id, 'library', case when p_deprecated then 'item_deprecated' else 'item_restored' end, i.title);
  return v_at;
end $$;

-- ============================================================================
-- 6. İnceleme sayfası: yorumlar + onaylar + karşılaştırma tabanı
-- ============================================================================
create or replace function public.space_add_review_comment(p_item uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  v_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'space_invalid'; end if;
  perform public._rate_limit('space_review_comment', 60, interval '1 hour');
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or not public.can_edit_space(i.space_id) then raise exception 'space_forbidden'; end if;
  if not exists (select 1 from public.spaces s where s.id = i.space_id and s.kind = 'team_library' and s.team_id is not null) then raise exception 'space_invalid'; end if;
  insert into public.space_item_review_comments (item_id, space_id, author_id, body, content_rev) values (p_item, i.space_id, v_uid, v_body, i.content_rev) returning id into v_id;
  return v_id;
end $$;

create or replace function public.space_item_review(p_item uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  t public.teams;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or not (public.space_role(i.space_id) in ('owner', 'editor') or public._team_can_approve_item(p_item, v_uid)) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.team_id is null then raise exception 'space_invalid'; end if;
  select * into t from public.teams where id = s.team_id;
  return jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'title', i.title, 'body', i.body, 'rev', i.content_rev, 'state', public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at),
                               'review_requested_at', i.review_requested_at, 'requested_by', i.review_requested_by, 'created_by', i.created_by, 'updated_at', i.updated_at),
    'needed', t.approvals_needed,
    'can_decide', public._team_can_approve_item(p_item, v_uid),
    'base', (select jsonb_build_object('title', v.title, 'body', v.body, 'was_approved', v.was_approved, 'at', v.created_at,
                                       'author', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = v.author_id))
               from public.space_item_versions v where v.item_id = p_item order by v.was_approved desc, v.created_at desc limit 1),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', coalesce(nullif(p.display_name, ''), p.username), 'decision', a.decision,
                                                                'note', a.note, 'checklist', a.checklist, 'at', a.created_at) order by a.created_at)
                             from public.space_item_approvals a join public.profiles p on p.id = a.user_id
                            where a.item_id = p_item and a.content_rev = i.content_rev), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.author_id, 'name', coalesce(nullif(p.display_name, ''), p.username), 'username', p.username,
                                                              'kind', c.kind, 'body', c.body, 'rev', c.content_rev, 'at', c.created_at) order by c.created_at)
                            from (select * from public.space_item_review_comments x where x.item_id = p_item order by x.created_at desc limit 100) c
                            left join public.profiles p on p.id = c.author_id), '[]'::jsonb));
end $$;

-- ============================================================================
-- 7. Kullanım ve "Çalıştı mı?"
-- ============================================================================
create or replace function public.space_record_item_use(p_item uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  t public.teams;
  v_role text;
  v_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id) then raise exception 'space_not_found'; end if;
  select t2.* into t from public.spaces s join public.teams t2 on t2.id = s.team_id where s.id = i.space_id and s.kind = 'team_library';
  if not found then raise exception 'space_invalid'; end if;
  if i.deprecated_at is not null then raise exception 'item_deprecated'; end if;
  v_role := public.space_role(i.space_id);
  if t.require_approval and i.approved_at is null and v_role not in ('owner', 'editor') then raise exception 'item_not_approved'; end if;
  perform public._rate_limit('space_item_use', 300, interval '1 hour');
  insert into public.space_item_uses (item_id, space_id, user_id) values (p_item, i.space_id, v_uid) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  update public.space_items set use_count = use_count + 1 where id = p_item;
  return true;
end $$;

create or replace function public.space_item_works_recount()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.space_items i set
    works_yes = (select count(*) from public.space_item_works_votes v where v.item_id = v_item and v.works),
    works_no = (select count(*) from public.space_item_works_votes v where v.item_id = v_item and not v.works)
  where i.id = v_item;
  return null;
end $$;
drop trigger if exists space_item_works_recount on public.space_item_works_votes;
create trigger space_item_works_recount after insert or update or delete on public.space_item_works_votes for each row execute function public.space_item_works_recount();

create or replace function public.space_item_works_state(p_item uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id) then raise exception 'space_not_found'; end if;
  return jsonb_build_object('yes', i.works_yes, 'no', i.works_no,
    'mine', (select v.works from public.space_item_works_votes v where v.item_id = p_item and v.user_id = v_uid),
    'can_vote', i.created_by is distinct from v_uid and i.deprecated_at is null
                and exists (select 1 from public.space_item_uses u where u.item_id = p_item and u.user_id = v_uid));
end $$;

create or replace function public.space_set_item_works(p_item uuid, p_works boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._rate_limit('space_item_works', 60, interval '1 hour');
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or public._team_item_hidden(i.space_id, i.kind, i.is_draft, i.approved_at, i.group_id) then raise exception 'space_not_found'; end if;
  if not exists (select 1 from public.spaces s where s.id = i.space_id and s.kind = 'team_library' and s.team_id is not null) then raise exception 'space_invalid'; end if;
  if i.created_by is not distinct from v_uid then raise exception 'self_vote_not_allowed'; end if;
  if i.deprecated_at is not null then raise exception 'item_deprecated'; end if;
  if not exists (select 1 from public.space_item_uses u where u.item_id = p_item and u.user_id = v_uid) then raise exception 'copy_required'; end if;
  if p_works is null then
    delete from public.space_item_works_votes where item_id = p_item and user_id = v_uid;
  else
    insert into public.space_item_works_votes (item_id, user_id, works) values (p_item, v_uid, p_works)
    on conflict (item_id, user_id) do update set works = excluded.works, updated_at = now();
  end if;
  return public.space_item_works_state(p_item);
end $$;

-- ============================================================================
-- 8. Kütüphane listesi ve sayaçlar (SECURITY INVOKER: gizleme politikası aynen uygulanır)
-- ============================================================================
create or replace function public.team_library_items(p_team uuid, p_status text default 'all', p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, title text, group_id uuid, group_name text, state text, content_rev integer, use_count integer, works_yes integer, works_no integer,
               approvals integer, approvals_needed integer, updated_at timestamptz, updated_by uuid, updated_by_name text, created_by uuid,
               review_requested_at timestamptz, approved_at timestamptz, deprecated_at timestamptz, locked boolean)
language sql stable security invoker set search_path = public as $$
  select i.id, i.title, i.group_id, g.name, public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at), i.content_rev, i.use_count, i.works_yes, i.works_no,
         (select count(*)::integer from public.space_item_approvals a where a.item_id = i.id and a.content_rev = i.content_rev and a.decision = 'approve'),
         t.approvals_needed::integer, i.updated_at, i.updated_by, coalesce(nullif(p.display_name, ''), p.username), i.created_by,
         i.review_requested_at, i.approved_at, i.deprecated_at, i.locked
    from public.teams t
    join public.space_items i on i.space_id = t.library_space_id and i.kind = 'prompt' and i.is_draft
    left join public.space_groups g on g.id = i.group_id
    left join public.profiles p on p.id = coalesce(i.updated_by, i.created_by)
   where t.id = p_team
     and (coalesce(p_status, 'all') = 'all' or public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at) = p_status)
     and (nullif(btrim(coalesce(p_search, '')), '') is null or i.title ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%')
   order by i.updated_at desc, i.id
   limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
$$;

create or replace function public.team_library_counts(p_team uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'approved', count(*) filter (where state = 'approved'),
    'pending', count(*) filter (where state = 'pending'),
    'draft', count(*) filter (where state = 'draft'),
    'deprecated', count(*) filter (where state = 'deprecated'),
    'oldest_pending_at', min(review_requested_at) filter (where state = 'pending'))
  from (
    select public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at) as state, i.review_requested_at
      from public.teams t
      join public.space_items i on i.space_id = t.library_space_id and i.kind = 'prompt' and i.is_draft
     where t.id = p_team) x
$$;

-- Bir Space grubunu (klasörü) ekip grubuna bağla / kaldır: grup liderleri o klasördeki promptları onaylayabilir.
create or replace function public.team_link_space_group(p_space_group uuid, p_team_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
begin
  select s.team_id into v_team from public.space_groups g join public.spaces s on s.id = g.space_id where g.id = p_space_group;
  if v_team is null then raise exception 'space_not_found'; end if;
  perform public._team_require(v_team, 'manage_groups');
  if p_team_group is not null and not exists (select 1 from public.team_groups tg where tg.id = p_team_group and tg.team_id = v_team) then raise exception 'space_invalid'; end if;
  update public.space_groups set team_group_id = p_team_group where id = p_space_group;
  perform public._team_audit(v_team, 'group', 'folder_linked', (select name from public.space_groups where id = p_space_group));
end $$;

-- ============================================================================
-- 9. Ekip değişkenleri: yazma yeteneği ekipte `write_variables`; kişisel kütüphanede eskisi gibi düzenleyici
-- ============================================================================
create or replace function public.space_set_variable(p_space uuid, p_name text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_value text := coalesce(p_value, '');
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_space is null or not public.can_read_space(p_space) then raise exception 'space_not_found'; end if;
  select s.team_id into v_team from public.spaces s where s.id = p_space and s.kind = 'team_library';
  if not found then raise exception 'space_invalid'; end if;
  if v_team is not null then
    if not public._team_can(v_team, v_uid, 'write_variables') then raise exception 'space_forbidden'; end if;
  elsif not public.can_edit_space(p_space) then
    raise exception 'space_forbidden';
  end if;
  if char_length(v_name) not between 1 and 40 or v_name ~ '[{}[:space:]]' or char_length(v_value) > 500 then raise exception 'space_invalid'; end if;
  if not exists (select 1 from public.space_variables v where v.space_id = p_space and v.name = v_name)
     and (select count(*) from public.space_variables v where v.space_id = p_space) >= 50 then
    raise exception 'space_variable_limit';
  end if;
  insert into public.space_variables (space_id, name, value, created_by, updated_by) values (p_space, v_name, v_value, v_uid, v_uid)
  on conflict (space_id, name) do update set value = excluded.value, updated_by = v_uid, updated_at = now();
  perform public._space_touch(p_space);
  if v_team is not null then perform public._team_audit(v_team, 'variable', 'variable_updated', v_name); end if;
end $$;

create or replace function public.space_delete_variable(p_space uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_space is null or not public.can_read_space(p_space) then raise exception 'space_not_found'; end if;
  select s.team_id into v_team from public.spaces s where s.id = p_space;
  if v_team is not null then
    if not public._team_can(v_team, v_uid, 'write_variables') then raise exception 'space_forbidden'; end if;
  elsif not public.can_edit_space(p_space) then
    raise exception 'space_forbidden';
  end if;
  delete from public.space_variables where space_id = p_space and name = btrim(coalesce(p_name, ''));
  perform public._space_touch(p_space);
  if v_team is not null then perform public._team_audit(v_team, 'variable', 'variable_deleted', btrim(coalesce(p_name, ''))); end if;
end $$;

-- ============================================================================
-- 10. Yetkiler
-- ============================================================================
grant execute on function public._space_item_state(timestamptz, timestamptz, timestamptz) to anon, authenticated;
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._team_can_approve_item(uuid, uuid)',
    'public._team_notify(uuid, uuid, uuid, text, text, text, text)', 'public.space_items_rev_bump()', 'public.space_item_works_recount()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.space_decide_item(uuid, text, text, jsonb)', 'public.space_can_approve_item(uuid)', 'public.space_set_item_deprecated(uuid, boolean)',
    'public.space_add_review_comment(uuid, text)', 'public.space_item_review(uuid)', 'public.space_record_item_use(uuid)',
    'public.space_item_works_state(uuid)', 'public.space_set_item_works(uuid, boolean)', 'public.team_library_items(uuid, text, text, integer, integer)',
    'public.team_library_counts(uuid)', 'public.team_link_space_group(uuid, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
