-- ci:allow-destructive
-- Ekip sohbeti: proje/dosya kanalları + hiyerarşik sessize alma (docs/history/369-*). "Yıkıcı" işaretinin nedeni: `team_channels_project_uniq` (proje başına TEK kanal) ve
-- `team_channels_name_uniq` (ekip genelinde tek ad) İNDEKSLERİ yerine kapsamlı indeksler gelir; hiçbir veri silinmez. Gerisi ekleyicidir (yeni sütun/tablo/RPC),
-- değişen gövdeler (`group_unread_counts`, `can_send_message`, kanal RPC'leri, `team_projects_list`/`team_project_get`) eski çağıranlarla uyumludur.
--
-- Karar: bir projenin BİRDEN ÇOK kanalı olabilir — proje ana kanalı (`project_main`, proje açılırken kendiliğinden), dosya kanalı (`file_id`, YALNIZ istenirse),
-- adlı ek kanallar ("duyurular" gibi). Hepsi `mode = 'project'`: erişim projeden türer (projeyi görebilen herkes). Kanal adı artık (ekip, proje) kapsamında tektir.
--
-- Sessize alma 3 katmandır ve etkin sessizlik hepsinin birleşimidir: EKİP (`team_mutes` project_id boş) → PROJE (`team_mutes` project_id dolu) → KANAL
-- (`conversation_members.muted_at` / `team_notify_level = 'none'`). Ekip/proje sessizken içerideki kanal ayarı yalnız saklanır, bildirim üretmez.
-- Uygulama noktası `notifications` üzerindeki TEK BEFORE INSERT tetikleyicisidir (`_notifications_apply_preferences`, CLAUDE.md §6 "Bildirim merkezi"):
-- Telegram dahil hiçbir yol sessizdeki bildirimi görmez. Muaf (kapatılamaz): sahiplik devri, rol değişikliği, erişim süresi uzatma.

-- ============================================================================
-- 1. Kanal kapsamı: proje ana kanalı / dosya kanalı, ad kapsamı
-- ============================================================================
alter table public.team_channels add column if not exists file_id uuid references public.team_files (id) on delete cascade;
alter table public.team_channels add column if not exists project_main boolean not null default false;
-- Geri doldurma: bugüne kadar proje başına tek kanal vardı → hepsi ana kanaldır.
update public.team_channels set project_main = true where mode = 'project' and project_id is not null and file_id is null and not project_main;

drop index if exists public.team_channels_project_uniq;
create unique index if not exists team_channels_project_main_uniq on public.team_channels (project_id) where project_main;
create unique index if not exists team_channels_file_uniq on public.team_channels (file_id) where file_id is not null;
create index if not exists team_channels_project_idx on public.team_channels (project_id) where project_id is not null;
do $$ begin
  alter table public.team_channels add constraint team_channels_scope_shape
    check ((file_id is null or project_id is not null) and (not project_main or (project_id is not null and file_id is null)));
exception when duplicate_object then null; end $$;

drop index if exists public.team_channels_name_uniq;
create unique index if not exists team_channels_name_scope_uniq
  on public.team_channels (team_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Dosya silinince kanal konuşması da gider (konuşma silinince kanal kaskadlanır; tersi geçerli değildir).
create or replace function public.team_files_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversations c using public.team_channels tc where tc.file_id = old.id and c.id = tc.id;
  return old;
end $$;
drop trigger if exists team_files_before_delete on public.team_files;
create trigger team_files_before_delete before delete on public.team_files for each row execute function public.team_files_before_delete();

-- ============================================================================
-- 2. Sessize alma: tablo + saf çözümleyiciler
-- ============================================================================
-- Satır = SESSİZ. project_id boş → ekibin tamamı; dolu → o projenin tüm kanalları. Yalnız RPC yazar/okur (istemci tabloya dokunamaz).
create table if not exists public.team_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid references public.team_projects (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists team_mutes_uniq on public.team_mutes (user_id, team_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.team_mutes enable row level security;
revoke all on public.team_mutes from public, anon, authenticated;

-- 'team' | 'project' | null: ekip ya da proje düzeyinde sessiz mi.
create or replace function public._team_mute_scope(p_user uuid, p_team uuid, p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.team_mutes m where m.user_id = p_user and m.team_id = p_team and m.project_id is null) then 'team'
    when p_project is not null and exists (select 1 from public.team_mutes m where m.user_id = p_user and m.team_id = p_team and m.project_id = p_project) then 'project'
  end
$$;

-- Kanal için etkin sessizliğin KAYNAĞI: 'team' | 'project' | 'channel' | null. Kanal sessizliği = üyelik satırında `muted_at` (düzey "Kapalı" onu da kurar).
create or replace function public._team_channel_mute_scope(p_channel uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(public._team_mute_scope(p_user, tc.team_id, tc.project_id),
                  case when exists (select 1 from public.conversation_members m where m.conversation_id = tc.id and m.user_id = p_user and m.muted_at is not null) then 'channel' end)
    from public.team_channels tc where tc.id = p_channel
$$;

-- Bir ekip bildirimi (adresinden) alıcı için sessize alınmış mı? Adres `/teams/local?id=<ekip>&…&project=<proje>&…channel=<kanal>` biçimindedir (sunucu üretir).
-- Muaf: sahiplik devri, rol değişikliği, erişim süresi (dedupe öneki) — yönetimsel ve kişiye özel olduğu için kapatılamaz.
create or replace function public._team_notification_silenced(p_user uuid, p_href text, p_dedupe text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_team uuid;
  v_project uuid;
  v_channel uuid;
begin
  if coalesce(p_href, '') !~ '^/teams/local\?' then return false; end if;
  if coalesce(p_dedupe, '') ~ '^(teamowner|teamrole|teamguest):' then return false; end if;
  begin v_team := substring(p_href from '[?&]id=([0-9a-fA-F-]{36})')::uuid; exception when others then v_team := null; end;
  if v_team is null then return false; end if;
  begin v_channel := substring(p_href from '[?&]channel=([0-9a-fA-F-]{36})')::uuid; exception when others then v_channel := null; end;
  if v_channel is not null then
    if exists (select 1 from public.team_channels tc where tc.id = v_channel and tc.team_id = v_team) then
      return public._team_channel_mute_scope(v_channel, p_user) is not null;
    end if;
  end if;
  begin v_project := substring(p_href from '[?&]project=([0-9a-fA-F-]{36})')::uuid; exception when others then v_project := null; end;
  return public._team_mute_scope(p_user, v_team, v_project) is not null;
end $$;

-- TEK uygulama noktası: gövde 20261103110000'dakiyle AYNIDIR; yalnız ekip sessizliği eklendi (sessize alınan bildirim HİÇ yazılmaz, Telegram da görmez).
create or replace function public._notifications_apply_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pref text;
begin
  if new.type = 'system' and public._team_notification_silenced(new.recipient_id, new.target_href, new.dedupe_key) then
    return null;
  end if;
  v_pref := public._notification_pref_key(new.type, new.target_href, new.dedupe_key);
  if v_pref is not null and exists (
    select 1 from public.notification_type_prefs p where p.user_id = new.recipient_id and p.pref_key = v_pref and not p.enabled
  ) then
    return null;
  end if;
  if new.type <> 'message_request' and (new.type <> 'system' or coalesce(new.dedupe_key, '') like 'milestone:%') then
    if new.actor_id is not null and exists (
      select 1 from public.notification_mutes m where m.user_id = new.recipient_id and m.kind = 'actor' and m.target = new.actor_id::text
    ) then
      return null;
    end if;
    if exists (
      select 1 from public.notification_mutes m
       where m.user_id = new.recipient_id and m.kind = 'content' and m.target = public._notification_href_base(new.target_href)
    ) then
      return null;
    end if;
  end if;
  return new;
end $$;

-- Sessize alma yazma/okuma: yalnız çağıranın kendi satırı. `p_muted = false` sessizliği kaldırır.
create or replace function public.team_set_mute(p_team uuid, p_project uuid default null, p_muted boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public._team_role(p_team, v_uid) is null then raise exception 'team_not_found'; end if;
  if p_project is not null then
    if not exists (select 1 from public.team_projects pr where pr.id = p_project and pr.team_id = p_team) or public._team_project_role(p_project, v_uid) is null then
      raise exception 'project_not_found';
    end if;
  end if;
  if coalesce(p_muted, true) then
    insert into public.team_mutes (user_id, team_id, project_id) values (v_uid, p_team, p_project) on conflict do nothing;
  else
    delete from public.team_mutes where user_id = v_uid and team_id = p_team and project_id is not distinct from p_project;
  end if;
end $$;

create or replace function public.team_my_mutes()
returns table (team_id uuid, project_id uuid)
language sql stable security definer set search_path = public as $$
  select m.team_id, m.project_id from public.team_mutes m where m.user_id = auth.uid()
$$;

-- ============================================================================
-- 3. Okunmamış sayısı: ekip kanalında etkin sessizlik (ekip/proje/kanal) sayıyı 0 yapar. Gövde 20261110120000'dakiyle aynıdır; yalnız bu koşul değişti.
-- ============================================================================
create or replace function public.group_unread_counts(p_ids uuid[])
returns table (conversation_id uuid, unread_count integer)
language sql stable security definer set search_path = public as $$
  select m.conversation_id,
         (select count(*)::integer
            from (select 1
                    from public.messages x
                    left join public.community_rooms r on r.id = x.room_id
                    left join public.community_room_state s on s.room_id = x.room_id and s.user_id = m.user_id
                   where x.conversation_id = m.conversation_id
                     and x.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
                     and x.created_at >= m.joined_at
                     and x.sender_id is distinct from m.user_id
                     and x.deleted_at is null
                     and (
                       (x.room_id is null and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz))
                       or (x.room_id is not null
                           and r.archived_at is null
                           and (r.read_policy = 'all' or m.role in ('owner', 'admin', 'moderator'))
                           and s.muted_at is null
                           and x.created_at > coalesce(s.last_read_at, '-infinity'::timestamptz))
                     )
                   limit 100) c) as unread_count
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
   where m.user_id = auth.uid() and c.kind = 'group' and m.conversation_id = any (coalesce(p_ids, '{}'::uuid[]))
  union all
  select m.conversation_id,
         case when public._team_channel_mute_scope(m.conversation_id, m.user_id) is not null then 0 else
           (select count(*)::integer
              from (select 1 from public.messages x
                     where x.conversation_id = m.conversation_id
                       and x.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
                       and x.created_at >= m.joined_at
                       and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz)
                       and x.sender_id is distinct from m.user_id
                       and x.deleted_at is null
                     limit 100) c) end
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
   where m.user_id = auth.uid() and c.kind = 'team_channel' and m.conversation_id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

-- ============================================================================
-- 4. Yazma kuralı: proje kanalında "yalnız yönetim yazar" = ekip sahibi/yöneticisi + projenin liderleri. Gövde 20261110120000'dakiyle aynıdır; yalnız bu kol eklendi.
-- ============================================================================
create or replace function public.can_send_message(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when c.kind = 'group' then
      exists (
        select 1 from public.conversation_members m
          join public.chat_groups g on g.id = m.conversation_id
         where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
           and g.closed_at is null
           and (g.posting_policy = 'members' or m.role in ('owner', 'admin', 'moderator'))
      )
    when c.kind = 'team_channel' then
      exists (
        select 1 from public.conversation_members m
          join public.team_channels tc on tc.id = m.conversation_id
         where m.conversation_id = p_conversation_id and m.user_id = auth.uid()
           and tc.archived_at is null
           and public._team_role(tc.team_id, auth.uid()) is not null
           and public._team_channel_level(tc.id, auth.uid()) = 'edit'
           and (tc.posting_policy = 'members' or public._team_role(tc.team_id, auth.uid()) in ('owner', 'admin')
               or (tc.project_id is not null and public._team_project_role(tc.project_id, auth.uid()) = 'lead'))
      )
    else
      exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation_id and m.user_id = auth.uid())
      and not exists (
        select 1 from public.conversation_members other_member
         where other_member.conversation_id = p_conversation_id and other_member.user_id <> auth.uid()
           and public.is_blocked(auth.uid(), other_member.user_id)
      )
  end
  from public.conversations c
  where c.id = p_conversation_id;
$$;

-- ============================================================================
-- 5. Kanal yönetimi: proje kanalını PROJENİN lideri yönetir, ekip kanalını `manage_channels` yetkisi olan
-- ============================================================================
create or replace function public._team_channel_manage(p_channel uuid)
returns public.team_channels language plpgsql stable security definer set search_path = public as $$
declare c public.team_channels;
begin
  select * into c from public.team_channels where id = p_channel;
  if not found then raise exception 'channel_not_found'; end if;
  if c.project_id is not null then
    perform public._team_project_require(c.project_id, 'lead');
  else
    perform public._team_require(c.team_id, 'manage_channels');
  end if;
  return c;
end $$;

-- Ekip kanalı: ad artık EKİP kapsamında (proje kanalları ayrı ad alanındadır); sınır yalnız ekip kanallarını sayar.
create or replace function public.team_create_channel(
  p_team uuid, p_name text, p_description text default '', p_mode text default 'open', p_space uuid default null,
  p_posting text default 'members', p_notify text default 'mentions', p_entries jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_require(p_team, 'manage_channels');
  v_name text := public._team_channel_name(p_name);
  v_id uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_channel_create', 30, interval '1 hour');
  if v_name !~ '^[a-z0-9][a-z0-9-]{0,39}$' or char_length(coalesce(p_description, '')) > 200
     or coalesce(p_mode, '') not in ('open', 'private', 'space') or coalesce(p_posting, '') not in ('members', 'admins')
     or coalesce(p_notify, '') not in ('all', 'mentions', 'none') then
    raise exception 'channel_invalid';
  end if;
  if (p_mode = 'space') <> (p_space is not null) then raise exception 'channel_invalid'; end if;
  if p_mode = 'space' and not exists (select 1 from public.spaces s where s.id = p_space and s.team_id = p_team) then raise exception 'channel_invalid'; end if;
  if p_mode <> 'private' and jsonb_array_length(coalesce(p_entries, '[]'::jsonb)) > 0 then raise exception 'channel_invalid'; end if;
  if exists (select 1 from public.team_channels c where c.team_id = p_team and c.project_id is null and lower(c.name) = v_name) then raise exception 'channel_name_taken'; end if;
  if p_mode <> 'space' and (select count(*) from public.team_channels c where c.team_id = p_team and c.project_id is null and c.archived_at is null and c.mode <> 'space') >= 50 then raise exception 'team_channel_limit'; end if;
  if p_mode = 'space' and (select count(*) from public.team_channels c where c.team_id = p_team and c.project_id is null and c.archived_at is null and c.mode = 'space') >= 50 then raise exception 'team_channel_limit'; end if;

  perform set_config('promptly.team_sync', '1', true);
  v_id := public._team_make_channel(p_team, v_name, btrim(coalesce(p_description, '')), p_mode, p_space, p_posting, p_notify, false,
                                    coalesce((select max(position) + 1 from public.team_channels where team_id = p_team), 0), v_uid);
  if p_mode = 'private' then
    perform public._team_channel_entries(v_id, p_team, p_entries, v_uid);
  end if;
  perform public._team_sync_channel(v_id);
  perform set_config('promptly.team_sync', '', true);
  perform public._team_audit(p_team, 'channel', 'channel_created', v_name, jsonb_build_object('mode', p_mode));
  return v_id;
end $$;

-- Projeye kanal ekle: ana kanal DIŞINDAKİLER — dosya kanalı (`p_file`, dosya başına en çok 1; ad dosyadan, çakışırsa -2, -3…) ya da adlı ek kanal ("duyurular").
-- Dosya kanalı KENDİLİĞİNDEN açılmaz: dosya oluşturulurken sorulur, sonradan da eklenebilir. Yalnız proje lideri (ekip sahibi/yöneticisi örtük lider).
create or replace function public.team_add_project_channel(
  p_project uuid, p_name text default null, p_description text default '', p_file uuid default null,
  p_posting text default 'members', p_notify text default 'mentions')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._team_project_require(p_project, 'lead');
  pr public.team_projects;
  f public.team_files;
  v_given text := nullif(btrim(coalesce(p_name, '')), '');
  v_base text;
  v_name text;
  v_n integer := 1;
  v_id uuid;
begin
  perform public._assert_can_act(true);
  perform public._rate_limit('team_channel_create', 30, interval '1 hour');
  select * into pr from public.team_projects where id = p_project;
  if pr.archived_at is not null then raise exception 'project_archived'; end if;
  if char_length(coalesce(p_description, '')) > 200 or coalesce(p_posting, '') not in ('members', 'admins') or coalesce(p_notify, '') not in ('all', 'mentions', 'none') then
    raise exception 'channel_invalid';
  end if;
  if p_file is null and v_given is null then raise exception 'channel_invalid'; end if;
  if p_file is not null then
    select * into f from public.team_files x where x.id = p_file and x.project_id = p_project and x.archived_at is null;
    if not found then raise exception 'project_not_found'; end if;
    if exists (select 1 from public.team_channels c where c.file_id = p_file) then raise exception 'channel_exists'; end if;
  end if;
  if (select count(*) from public.team_channels c where c.project_id = p_project and c.archived_at is null) >= 30 then raise exception 'project_channel_limit'; end if;

  v_base := regexp_replace(left(public._team_channel_name(coalesce(v_given, f.title)), 36), '-+$', '');
  if v_base is null or v_base !~ '^[a-z0-9][a-z0-9-]*$' then
    if v_given is not null then raise exception 'channel_invalid'; end if;
    v_base := 'dosya';
  end if;
  v_name := v_base;
  if p_file is not null then
    while exists (select 1 from public.team_channels c where c.team_id = pr.team_id and c.project_id = p_project and lower(c.name) = v_name) loop
      v_n := v_n + 1;
      v_name := v_base || '-' || v_n;
    end loop;
  elsif exists (select 1 from public.team_channels c where c.team_id = pr.team_id and c.project_id = p_project and lower(c.name) = v_name) then
    raise exception 'channel_name_taken';
  end if;

  perform set_config('promptly.team_sync', '1', true);
  insert into public.conversations (kind) values ('team_channel') returning id into v_id;
  insert into public.team_channels (id, team_id, name, description, mode, project_id, file_id, posting_policy, notify_default, is_default, position, created_by)
  values (v_id, pr.team_id, v_name, btrim(coalesce(p_description, '')), 'project', p_project, p_file, p_posting, p_notify, false,
          coalesce((select max(position) + 1 from public.team_channels where team_id = pr.team_id), 0), v_uid);
  perform public._team_sync_channel(v_id);
  perform set_config('promptly.team_sync', '', true);
  perform public._team_audit(pr.team_id, 'channel', 'channel_created', v_name, jsonb_build_object('mode', 'project', 'project', pr.title, 'file', p_file is not null));
  return v_id;
end $$;

-- Düzenleme: proje kanalında ad/açıklama/yazma ilkesi/bildirim varsayılanı değişir; erişim modu projeden türer (`channel_project_managed`).
-- Gövde 20261110120000'dakiyle aynıdır; yönetici denetimi `_team_channel_manage`, ad çakışması aynı kapsamda, 'project' modu geçerli.
create or replace function public.team_update_channel(p_channel uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.team_channels;
  v_name text;
  v_key text;
  v_mode text;
  v_space uuid;
begin
  c := public._team_channel_manage(p_channel);
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'channel_invalid'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'description', 'posting_policy', 'notify_default', 'mode', 'space_id', 'position') then raise exception 'channel_invalid'; end if;
  end loop;
  if c.project_id is not null and (p_patch ? 'mode' or p_patch ? 'space_id') then raise exception 'channel_project_managed'; end if;
  v_name := case when p_patch ? 'name' then public._team_channel_name(p_patch ->> 'name') else c.name end;
  v_mode := coalesce(p_patch ->> 'mode', c.mode);
  v_space := case when p_patch ? 'space_id' then nullif(p_patch ->> 'space_id', '')::uuid when v_mode = 'space' then c.space_id else null end;
  if c.is_default and (v_mode <> 'open' or (p_patch ? 'name' and v_name <> c.name)) then raise exception 'channel_default_locked'; end if;
  if v_name !~ '^[a-z0-9][a-z0-9-]{0,39}$' or v_mode not in ('open', 'private', 'space', 'project') or (v_mode = 'space') <> (v_space is not null) then raise exception 'channel_invalid'; end if;
  if v_mode = 'space' and not exists (select 1 from public.spaces s where s.id = v_space and s.team_id = c.team_id) then raise exception 'channel_invalid'; end if;
  if exists (select 1 from public.team_channels x where x.team_id = c.team_id and x.project_id is not distinct from c.project_id and lower(x.name) = v_name and x.id <> c.id) then raise exception 'channel_name_taken'; end if;
  begin
    perform set_config('promptly.team_sync', '1', true);
    update public.team_channels set
      name = v_name,
      description = case when p_patch ? 'description' then btrim(coalesce(p_patch ->> 'description', '')) else description end,
      posting_policy = coalesce(p_patch ->> 'posting_policy', posting_policy),
      notify_default = coalesce(p_patch ->> 'notify_default', notify_default),
      mode = v_mode, space_id = v_space,
      position = case when p_patch ? 'position' then (p_patch ->> 'position')::integer else position end
    where id = p_channel;
    perform set_config('promptly.team_sync', '', true);
  exception when check_violation or invalid_text_representation then
    perform set_config('promptly.team_sync', '', true);
    raise exception 'channel_invalid';
  end;
  if v_mode <> 'private' then delete from public.team_access where channel_id = p_channel; end if;
  perform public._team_audit(c.team_id, 'channel', 'channel_updated', v_name);
end $$;

-- Arşiv/silme: varsayılan kanal ve PROJE ANA KANALI kilitli (ana kanalın ömrü projeyindir); dosya ve ek proje kanallarını proje lideri yönetir.
create or replace function public.team_archive_channel(p_channel uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels;
begin
  c := public._team_channel_manage(p_channel);
  if c.is_default then raise exception 'channel_default_locked'; end if;
  if c.project_main then raise exception 'channel_project_managed'; end if;
  update public.team_channels set archived_at = case when p_archived then now() else null end where id = p_channel;
  perform public._team_audit(c.team_id, 'channel', case when p_archived then 'channel_archived' else 'channel_restored' end, c.name);
end $$;

create or replace function public.team_delete_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.team_channels;
begin
  c := public._team_channel_manage(p_channel);
  if c.is_default then raise exception 'channel_default_locked'; end if;
  if c.project_main then raise exception 'channel_project_managed'; end if;
  perform public._team_audit(c.team_id, 'channel', 'channel_deleted', c.name);
  delete from public.conversations where id = p_channel;
end $$;

-- Proje ana kanalı: ad PROJE kapsamında (çakışma yok). İmza aynı; eski ekip genelindeki -2/-3 soneki artık gerekmez.
create or replace function public._team_project_channel_make(p_team uuid, p_project uuid, p_title text, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(left(public._team_channel_name(p_title), 36), '-+$', '');
  v_id uuid;
begin
  if v_name is null or v_name !~ '^[a-z0-9][a-z0-9-]*$' then v_name := 'proje'; end if;
  perform set_config('promptly.team_sync', '1', true);
  insert into public.conversations (kind) values ('team_channel') returning id into v_id;
  insert into public.team_channels (id, team_id, name, description, mode, project_id, project_main, posting_policy, notify_default, is_default, position, created_by)
  values (v_id, p_team, v_name, '', 'project', p_project, true, 'members', 'mentions', false,
          coalesce((select max(position) + 1 from public.team_channels where team_id = p_team), 0), p_by);
  perform public._team_sync_channel(v_id);
  perform set_config('promptly.team_sync', '', true);
  return v_id;
end $$;

-- ============================================================================
-- 6. Okuma: ekibin tüm kanalları (ekip kanalları + proje/dosya kanalları) — etkin sessizlik KAYNAĞIYLA. `team_list_channels` aynen kalır (eski istemciler).
-- ============================================================================
create or replace function public.team_channels_overview(p_team uuid)
returns table (id uuid, name text, description text, mode text, posting_policy text, notify_default text, is_default boolean, "position" integer, archived_at timestamptz,
               unread_count integer, muted boolean, mute_scope text, notify_level text, last_message_at timestamptz, member_count integer, can_post boolean,
               project_id uuid, project_title text, file_id uuid, file_title text, project_main boolean)
language sql stable security definer set search_path = public as $$
  select tc.id, tc.name, tc.description, tc.mode, tc.posting_policy, tc.notify_default, tc.is_default, tc.position, tc.archived_at,
         coalesce((select u.unread_count from public.group_unread_counts(array[tc.id]) u), 0),
         public._team_channel_mute_scope(tc.id, auth.uid()) is not null,
         public._team_channel_mute_scope(tc.id, auth.uid()),
         coalesce(m.team_notify_level, tc.notify_default),
         c.last_message_at,
         (select count(*)::integer from public.conversation_members x where x.conversation_id = tc.id),
         public.can_send_message(tc.id),
         tc.project_id, pr.title, tc.file_id, f.title, tc.project_main
    from public.team_channels tc
    join public.conversation_members m on m.conversation_id = tc.id and m.user_id = auth.uid()
    join public.conversations c on c.id = tc.id
    left join public.team_projects pr on pr.id = tc.project_id
    left join public.team_files f on f.id = tc.file_id
   where tc.team_id = p_team and public._team_role(tc.team_id, auth.uid()) is not null
   order by tc.archived_at is not null, tc.project_id is not null, tc.is_default desc, pr.created_at, tc.project_main desc, tc.position, tc.name
$$;

-- ============================================================================
-- 7. "Tüm mesajlar" düzeyi: kanalda yeni mesaj, düzeyi "all" olan üyelere BİR bildirim yazar — okunmamış dönem başına (okuyunca yeniden başlar), sessizdekilere yazılmaz.
-- Düzey "mentions" yalnız @bahsetme (`team_channel_mentions`), "none"/sessiz hiçbiri. Bir olay en çok 500 satır yazar (CLAUDE.md §6 "Bir olay bütün üyelere yazmaz").
-- ============================================================================
create or replace function public.team_channel_notify_all()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tc public.team_channels;
  v_name text;
begin
  select * into tc from public.team_channels where id = new.conversation_id;
  if not found or tc.archived_at is not null then return null; end if;
  select coalesce(nullif(p.display_name, ''), p.username) into v_name from public.profiles p where p.id = new.sender_id;
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  select m.user_id, new.sender_id, 'system',
         coalesce(v_name, 'Biri') || ' #' || tc.name || ' kanalına yazdı: "' || public.truncate_preview(coalesce(nullif(btrim(new.body), ''), '…'), 80) || '"',
         '/teams/local?id=' || tc.team_id || '&tab=chat&channel=' || tc.id || '&hl=message:' || new.id,
         'tmsg:' || tc.id || ':' || m.user_id || ':' || coalesce(extract(epoch from m.last_read_at)::bigint, 0)
    from public.conversation_members m
   where m.conversation_id = tc.id and m.user_id <> new.sender_id
     and coalesce(m.team_notify_level, tc.notify_default) = 'all'
     and m.muted_at is null
     and public._team_role(tc.team_id, m.user_id) is not null
     and public._team_mute_scope(m.user_id, tc.team_id, tc.project_id) is null
     and not exists (select 1 from public.notifications n where n.dedupe_key = 'tmention:' || new.id || ':' || m.user_id)
   limit 500
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return null;
end $$;
drop trigger if exists team_channel_notify_all on public.messages;
create trigger team_channel_notify_all after insert on public.messages for each row execute function public.team_channel_notify_all();

-- ============================================================================
-- 8. Yetkiler
-- ============================================================================
revoke execute on function public._team_mute_scope(uuid, uuid, uuid), public._team_channel_mute_scope(uuid, uuid), public._team_notification_silenced(uuid, text, text),
  public._team_channel_manage(uuid), public.team_files_before_delete(), public.team_channel_notify_all() from public, anon, authenticated;
revoke execute on function public.team_set_mute(uuid, uuid, boolean), public.team_my_mutes(), public.team_add_project_channel(uuid, text, text, uuid, text, text),
  public.team_channels_overview(uuid) from public, anon;
grant execute on function public.team_set_mute(uuid, uuid, boolean), public.team_my_mutes(), public.team_add_project_channel(uuid, text, text, uuid, text, text),
  public.team_channels_overview(uuid) to authenticated;

-- ============================================================================
-- 9. Proje okumaları: 'channel_id' = proje ANA kanalı (artık projede birden çok kanal olabilir; skaler alt sorgu tek satır dönmeli). Gövdeler 20261115120000 / 20261119100000'dakilerle aynıdır.
-- ============================================================================
create or replace function public.team_projects_list(p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public._team_role(p_team, v_uid) is null then raise exception 'team_not_found'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at)
      from (
        select p.created_at,
               jsonb_build_object(
                 'id', p.id, 'title', p.title, 'description', p.description, 'tone', p.tone, 'archived_at', p.archived_at,
                 'review_default', p.review_default, 'access_mode', p.access_mode, 'base_role', p.base_role,
                 'my_role', public._team_project_role(p.id, v_uid),
                 'main_area_id', (select s.id from public.spaces s where s.team_project_id = p.id and s.team_file_id is null and s.team_area_main),
                 'channel_id', (select tc.id from public.team_channels tc where tc.project_id = p.id and tc.project_main),
                 'member_count', (select count(*)::integer from public.team_members m where m.team_id = p.team_id and public._team_project_role(p.id, m.user_id) is not null),
                 'board_count', (select count(*)::integer from public.spaces s where s.team_project_id = p.id and not s.team_area_main),
                 'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_project_id = p.id),
                 'pending_count', case when public._team_project_role(p.id, v_uid) = 'lead'
                                       then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_project_id = p.id) end,
                 'files', coalesce((select jsonb_agg(jsonb_build_object(
                                      'id', f.id, 'title', f.title, 'review_required', f.review_required,
                                      'main_area_id', (select s.id from public.spaces s where s.team_file_id = f.id and s.team_area_main),
                                      'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_file_id = f.id),
                                      'pending_count', case when public._team_project_role(p.id, v_uid) = 'lead'
                                                            then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_file_id = f.id) end)
                                    order by f.position, f.created_at)
                                    from public.team_files f where f.project_id = p.id and f.archived_at is null), '[]'::jsonb)) as j
          from public.team_projects p
         where p.team_id = p_team and public._team_project_role(p.id, v_uid) is not null
      ) x), '[]'::jsonb);
end $$;

create or replace function public.team_project_get(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._team_project_require(p_project, 'view');
  pr public.team_projects;
  v_role text := public._team_project_role(p_project, v_uid);
begin
  select * into pr from public.team_projects where id = p_project;
  return jsonb_build_object(
    'project', jsonb_build_object('id', pr.id, 'team_id', pr.team_id, 'title', pr.title, 'description', pr.description, 'tone', pr.tone,
                                  'access_mode', pr.access_mode, 'base_role', pr.base_role, 'review_default', pr.review_default,
                                  'archived_at', pr.archived_at, 'created_at', pr.created_at),
    'my_role', v_role,
    'main_area_id', (select s.id from public.spaces s where s.team_project_id = p_project and s.team_file_id is null and s.team_area_main),
    'channel_id', (select tc.id from public.team_channels tc where tc.project_id = p_project and tc.project_main),
    'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_project_id = p_project and s.team_file_id is null),
    'pending_count', case when v_role = 'lead' then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_project_id = p_project) end,
    'files', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', f.id, 'title', f.title, 'position', f.position, 'review_required', f.review_required,
                         'main_area_id', (select s.id from public.spaces s where s.team_file_id = f.id and s.team_area_main),
                         'item_count', (select coalesce(sum(public._team_area_item_count(s.id)), 0)::integer from public.spaces s where s.team_file_id = f.id),
                         'board_count', (select count(*)::integer from public.spaces s where s.team_file_id = f.id and not s.team_area_main),
                         'pending_count', case when v_role = 'lead' then (select coalesce(sum(public._team_area_item_count(s.id, 'pending')), 0)::integer from public.spaces s where s.team_file_id = f.id) end)
                       order by f.position, f.created_at)
                       from public.team_files f where f.project_id = p_project and f.archived_at is null), '[]'::jsonb),
    'boards', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'item_count', public._team_area_item_count(s.id), 'position', s.team_board_position, 'group_id', s.team_board_group_id) order by s.team_board_position, s.created_at)
                          from public.spaces s where s.team_project_id = p_project and not s.team_area_main), '[]'::jsonb),
    -- Pano grupları (docs/history/367-*): proje geneli ve her dosya için ana alan + ek panolar, sıralı; sayfa değiştirici ve genel bakış bunu okur.
    'areas', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'title', s.title, 'file_id', s.team_file_id, 'is_main', s.team_area_main, 'position', s.team_board_position, 'group_id', s.team_board_group_id,
                         'item_count', public._team_area_item_count(s.id),
                         'updated_at', greatest(s.updated_at, coalesce((select max(i.updated_at) from public.space_items i where i.space_id = s.id), s.updated_at)),
                         'pending_count', case when v_role = 'lead' then public._team_area_item_count(s.id, 'pending') end,
                         'open_comments', (select count(*)::integer from public.space_pin_comments c
                                            where c.space_id = s.id and c.parent_id is null and c.resolved_at is null
                                              and (c.item_id is null or exists (select 1 from public.space_items ci where ci.id = c.item_id and (ci.rev_state = 'approved' or public._team_item_visible(ci.space_id, ci.rev_state, ci.created_by))))))
                       order by s.team_area_main desc, s.team_board_position, s.created_at)
                         from public.spaces s where s.team_project_id = p_project), '[]'::jsonb),
    -- Pano grupları (docs/history/368-*): birden çok panonun bir arada olduğu küme; bağımsız panolar grupsuzdur.
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'file_id', g.file_id,
                          'board_count', (select count(*)::integer from public.spaces s where s.team_board_group_id = g.id))
                          order by g.created_at) from public.team_board_groups g where g.project_id = p_project), '[]'::jsonb),
    'people', (
      select coalesce(jsonb_agg(jsonb_build_object('type', q.type, 'id', q.id, 'name', q.name, 'username', q.username, 'avatar_url', q.avatar_url,
                                                   'role', q.role, 'implicit', q.implicit, 'member_count', q.member_count)
                               order by public._team_project_rank(q.role) desc, lower(q.name)), '[]'::jsonb)
        from (
          select 'member'::text as type, a.subject_id as id, coalesce(p.display_name, p.username) as name, p.username, p.avatar_url, a.role, false as implicit, null::integer as member_count
            from public.team_project_access a join public.profiles p on p.id = a.subject_id
           where a.project_id = p_project and a.subject_type = 'member'
             and coalesce(public._team_role(pr.team_id, a.subject_id), '') not in ('owner', 'admin')
          union all
          select 'group', a.subject_id, g.name, null, null, a.role, false, (select count(*)::integer from public.team_group_members gm where gm.group_id = g.id)
            from public.team_project_access a join public.team_groups g on g.id = a.subject_id
           where a.project_id = p_project and a.subject_type = 'group'
          union all
          select 'member', m.user_id, coalesce(p.display_name, p.username), p.username, p.avatar_url, 'lead', true, null
            from public.team_members m join public.profiles p on p.id = m.user_id
           where m.team_id = pr.team_id and m.role in ('owner', 'admin')
        ) q),
    'variables', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'file_id', v.file_id, 'name', v.name, 'value', v.value) order by v.file_id nulls first, lower(v.name))
                             from public.team_variables v where v.project_id = p_project), '[]'::jsonb));
end $$;
