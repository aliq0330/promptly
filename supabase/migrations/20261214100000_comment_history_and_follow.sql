-- Yorumlar: düzenleme geçmişi + yorum takibi (docs/history/451-*).
--
-- (1) `comment_versions`: bir yorumun gövdesi değişince ESKİ gövde burada saklanır; yorumu okuyabilen herkes `comment_history` ile görür.
--     Silme (soft-delete `body=''`, `deleted_at`) geçmişe yazılmaz ve silinen yorumun geçmişi okunmaz; en çok 30 sürüm tutulur.
-- (2) `comment_subscriptions`: bir içeriğin TÜM yorumlarını ("content") ya da tek bir üst düzey yorum başlığını ("thread") takip etmek.
--     Yazma yalnız `set_comment_subscription` RPC'si ve otomatik tetikleyici (yorum yazan + yanıt alan, yalnız o başlığa); okuma yalnız kendi satırların.
--     Yeni yorum, aboneye BİR bildirim yazar (okunmamış dönem başına tek: `notify_seq`), `comment` türüyle — tür tercihleri, sessize alma, rahatsız
--     etme saatleri ve Telegram zaten `notifications` BEFORE INSERT tetikleyicisinden geçer. İçerik sahibi ve yanıtlanan kişi zaten kendi bildirimini alır, dışarıda.
-- Yalnız EKLER (expand): mevcut sütun/fonksiyon değişmez.

-- ============================================================================
-- 1) Düzenleme geçmişi
-- ============================================================================
create table if not exists public.comment_versions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.prompt_comments (id) on delete cascade,
  body text not null,
  written_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint comment_versions_body_len check (char_length(body) <= 2000)
);
create index if not exists comment_versions_comment_idx on public.comment_versions (comment_id, created_at desc, id desc);

alter table public.comment_versions enable row level security;
revoke all on public.comment_versions from public, anon, authenticated;
grant select on public.comment_versions to anon, authenticated;

drop policy if exists "Comment versions are readable wherever the comment is" on public.comment_versions;
create policy "Comment versions are readable wherever the comment is"
  on public.comment_versions for select
  using (exists (select 1 from public.prompt_comments c where c.id = comment_versions.comment_id and c.deleted_at is null));

create or replace function public.record_comment_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- clock_timestamp(): aynı işlemdeki ardışık düzenlemeler de doğru sırada kalsın.
  insert into public.comment_versions (comment_id, body, written_at, created_at)
  values (old.id, old.body, coalesce(old.edited_at, old.created_at), clock_timestamp());
  -- En çok 30 sürüm: en eskiler düşer.
  delete from public.comment_versions v
   where v.comment_id = old.id
     and v.id not in (select x.id from public.comment_versions x where x.comment_id = old.id order by x.created_at desc, x.id desc limit 30);
  return null;
end $$;
revoke all on function public.record_comment_version() from public, anon, authenticated;

drop trigger if exists prompt_comments_record_version on public.prompt_comments;
create trigger prompt_comments_record_version
  after update of body on public.prompt_comments
  for each row
  when (old.body is distinct from new.body and old.deleted_at is null and new.deleted_at is null and old.body <> '')
  execute function public.record_comment_version();

-- Yorumun önceki sürümleri (en yeni önce). SECURITY INVOKER: yorumu okuyamayan satır görmez.
create or replace function public.comment_history(p_comment_id uuid)
returns table (id uuid, body text, written_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, v.body, v.written_at
    from public.comment_versions v
   where v.comment_id = p_comment_id
   order by v.created_at desc, v.id desc
   limit 30
$$;
revoke all on function public.comment_history(uuid) from public;
grant execute on function public.comment_history(uuid) to anon, authenticated;

-- ============================================================================
-- 2) Yorum takibi
-- ============================================================================
create table if not exists public.comment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null,
  prompt_id uuid references public.prompts (id) on delete cascade,
  request_id uuid references public.prompt_requests (id) on delete cascade,
  workflow_id uuid references public.workflows (id) on delete cascade,
  preset_id uuid references public.presets (id) on delete cascade,
  skill_id uuid references public.skills (id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  target_id uuid generated always as (coalesce(prompt_id, request_id, workflow_id, preset_id, skill_id, space_id)) stored,
  target_kind text generated always as (
    case when prompt_id is not null then 'prompt' when request_id is not null then 'request' when workflow_id is not null then 'workflow'
         when preset_id is not null then 'preset' when skill_id is not null then 'skill' when space_id is not null then 'space' end
  ) stored,
  comment_id uuid references public.prompt_comments (id) on delete cascade,
  auto boolean not null default false,
  notify_seq integer not null default 0,
  created_at timestamptz not null default now(),
  constraint comment_subscriptions_scope_check check (scope in ('content', 'thread')),
  constraint comment_subscriptions_one_target check (
    (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer
    + (preset_id is not null)::integer + (skill_id is not null)::integer + (space_id is not null)::integer = 1
  ),
  constraint comment_subscriptions_scope_comment check ((scope = 'thread') = (comment_id is not null))
);
create unique index if not exists comment_subscriptions_content_uidx on public.comment_subscriptions (user_id, target_kind, target_id) where scope = 'content';
create unique index if not exists comment_subscriptions_thread_uidx on public.comment_subscriptions (user_id, comment_id) where scope = 'thread';
create index if not exists comment_subscriptions_target_idx on public.comment_subscriptions (target_id) where scope = 'content';
create index if not exists comment_subscriptions_comment_idx on public.comment_subscriptions (comment_id) where scope = 'thread';
create index if not exists comment_subscriptions_user_idx on public.comment_subscriptions (user_id, created_at desc);

alter table public.comment_subscriptions enable row level security;
revoke all on public.comment_subscriptions from public, anon, authenticated;
grant select, insert, delete on public.comment_subscriptions to authenticated;

drop policy if exists "Users read their own comment subscriptions" on public.comment_subscriptions;
create policy "Users read their own comment subscriptions"
  on public.comment_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users follow comments of what they can read" on public.comment_subscriptions;
create policy "Users follow comments of what they can read"
  on public.comment_subscriptions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.quote_target_ok(target_kind, target_id)
    and (
      comment_id is null
      or exists (
        select 1 from public.prompt_comments c
         where c.id = comment_subscriptions.comment_id and c.parent_id is null and c.deleted_at is null
           and coalesce(c.prompt_id, c.request_id, c.workflow_id, c.preset_id, c.skill_id, c.space_id) = comment_subscriptions.target_id
      )
    )
  );

drop policy if exists "Users unfollow their own comment subscriptions" on public.comment_subscriptions;
create policy "Users unfollow their own comment subscriptions"
  on public.comment_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Kullanıcı başına en çok 200 abonelik (elle ekleme; otomatik olanlar sınırı aşınca sessizce eklenmez).
create or replace function public.enforce_comment_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.comment_subscriptions s where s.user_id = new.user_id) >= 200 then
    raise exception 'subscription_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_comment_subscription_limit() from public, anon, authenticated;

drop trigger if exists comment_subscriptions_limit on public.comment_subscriptions;
create trigger comment_subscriptions_limit
  before insert on public.comment_subscriptions
  for each row when (not new.auto)
  execute function public.enforce_comment_subscription_limit();

-- Takip aç/kapat. `p_comment` boşsa içeriğin tüm yorumları, doluysa o üst düzey yorum başlığı. SECURITY INVOKER: RLS her şeyi denetler.
create or replace function public.set_comment_subscription(p_kind text, p_target uuid, p_comment uuid, p_on boolean)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('prompt', 'request', 'workflow', 'preset', 'skill', 'space') then
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.comment_subscriptions (user_id, scope, comment_id, prompt_id, request_id, workflow_id, preset_id, skill_id, space_id)
    values (
      v_me, case when p_comment is null then 'content' else 'thread' end, p_comment,
      case when p_kind = 'prompt' then p_target end, case when p_kind = 'request' then p_target end,
      case when p_kind = 'workflow' then p_target end, case when p_kind = 'preset' then p_target end,
      case when p_kind = 'skill' then p_target end, case when p_kind = 'space' then p_target end
    )
    on conflict do nothing;
  else
    delete from public.comment_subscriptions s
     where s.user_id = v_me and s.target_kind = p_kind and s.target_id = p_target and s.comment_id is not distinct from p_comment;
  end if;
  return p_on;
end $$;
revoke all on function public.set_comment_subscription(text, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_comment_subscription(text, uuid, uuid, boolean) to authenticated;

-- Ayarlar listesi: kendi aboneliklerin, başlık + (başlık takibinde) yorum önizlemesiyle.
create or replace function public.my_comment_subscriptions()
returns table (id uuid, scope text, target_kind text, target_id uuid, title text, comment_id uuid, comment_preview text, auto boolean, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.scope, s.target_kind, s.target_id,
         coalesce(p.title, r.title, w.title, ps.title, sk.title, sp.title, '') as title,
         s.comment_id,
         case when s.comment_id is null then null else public.truncate_preview(coalesce(c.body, ''), 80) end,
         s.auto, s.created_at
    from public.comment_subscriptions s
    left join public.prompts p on p.id = s.prompt_id
    left join public.prompt_requests r on r.id = s.request_id
    left join public.workflows w on w.id = s.workflow_id
    left join public.presets ps on ps.id = s.preset_id
    left join public.skills sk on sk.id = s.skill_id
    left join public.spaces sp on sp.id = s.space_id
    left join public.prompt_comments c on c.id = s.comment_id
   where s.user_id = (select auth.uid())
   order by s.created_at desc, s.id desc
   limit 200
$$;
revoke all on function public.my_comment_subscriptions() from public, anon;
grant execute on function public.my_comment_subscriptions() to authenticated;

-- ============================================================================
-- 3) Yeni yorum: otomatik abonelik (yazan + yanıt alan, yalnız o başlığa) ve abonelere bildirim
-- ============================================================================
create or replace function public.comment_follow_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_target uuid;
  v_root uuid;
  v_parent_author uuid;
  v_owner uuid;
  v_href text;
  v_hops integer := 0;
  v_cur uuid;
  v_next uuid;
begin
  if new.deleted_at is not null or new.space_activity_id is not null then return null; end if;

  v_kind := case when new.prompt_id is not null then 'prompt' when new.request_id is not null then 'request' when new.workflow_id is not null then 'workflow'
                 when new.preset_id is not null then 'preset' when new.skill_id is not null then 'skill' when new.space_id is not null then 'space' end;
  if v_kind is null then return null; end if;
  v_target := coalesce(new.prompt_id, new.request_id, new.workflow_id, new.preset_id, new.skill_id, new.space_id);

  -- Başlığın kökü: üst düzey yorum.
  v_root := new.id;
  v_cur := new.parent_id;
  while v_cur is not null and v_hops < 50 loop
    v_root := v_cur;
    select c.parent_id into v_next from public.prompt_comments c where c.id = v_cur;
    v_cur := v_next;
    v_hops := v_hops + 1;
  end loop;

  if new.parent_id is not null then
    select c.author_id into v_parent_author from public.prompt_comments c where c.id = new.parent_id;
  end if;
  select i.owner_id into v_owner from public._quote_content_info(v_kind, v_target) i;

  -- Yorumu yazan ve (yanıtsa) yanıt alan kişi o başlığa otomatik abone olur; 200 sınırı aşılmışsa eklenmez.
  insert into public.comment_subscriptions (user_id, scope, comment_id, auto, prompt_id, request_id, workflow_id, preset_id, skill_id, space_id)
  select u.uid, 'thread', v_root, true,
         case when v_kind = 'prompt' then v_target end, case when v_kind = 'request' then v_target end,
         case when v_kind = 'workflow' then v_target end, case when v_kind = 'preset' then v_target end,
         case when v_kind = 'skill' then v_target end, case when v_kind = 'space' then v_target end
    from (select new.author_id as uid union select v_parent_author where v_parent_author is not null) u
   where (select count(*) from public.comment_subscriptions s where s.user_id = u.uid) < 200
     and not exists (select 1 from public.comment_subscriptions s where s.user_id = u.uid and s.scope = 'content' and s.target_id = v_target)
  on conflict do nothing;

  -- Hedef artık herkese açık değilse kimseye bildirim yazılmaz.
  if not coalesce((select i.shareable from public._quote_content_info(v_kind, v_target) i), false) then return null; end if;

  v_href := (case v_kind
    when 'prompt' then '/prompts/local?id=' when 'request' then '/requests/local?id=' when 'workflow' then '/workflows/local?id='
    when 'preset' then '/presets/local?id=' when 'skill' then '/skills/local?id=' else '/spaces/local?id=' end)
    || v_target || case when v_kind = 'space' then '&tab=comments' else '' end || '&hl=comment:' || new.id;

  -- Okunmamış dönem başına tek bildirim: aynı abonelik için okunmamış bildirim varsa yeni yazılmaz; okunmuşsa sıra numarası artar.
  with subs as (
    select s.id, s.user_id, s.notify_seq
      from public.comment_subscriptions s
     where ((s.scope = 'content' and s.target_id = v_target and s.target_kind = v_kind) or (s.scope = 'thread' and s.comment_id = v_root))
       and s.user_id <> new.author_id
       and s.user_id is distinct from v_parent_author
       and s.user_id is distinct from v_owner
       and not public.is_blocked(s.user_id, new.author_id)
     limit 500
  ), bumped as (
    update public.comment_subscriptions c
       set notify_seq = c.notify_seq + 1
      from subs
     where c.id = subs.id
       and exists (select 1 from public.notifications n where n.dedupe_key = 'csub:' || subs.id || ':' || subs.notify_seq and n.is_read)
    returning c.id, c.user_id, c.notify_seq
  )
  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  select x.user_id, new.author_id, 'comment',
         'Takip ettiğin başlığa yorum yaptı: "' || public.truncate_preview(new.body) || '"',
         v_href, 'csub:' || x.id || ':' || x.seq
    from (
      select subs.id, subs.user_id, subs.notify_seq as seq
        from subs
       where not exists (select 1 from public.notifications n where n.dedupe_key = 'csub:' || subs.id || ':' || subs.notify_seq)
      union all
      select b.id, b.user_id, b.notify_seq from bumped b
    ) x
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end $$;
revoke all on function public.comment_follow_on_insert() from public, anon, authenticated;

drop trigger if exists prompt_comments_follow_on_insert on public.prompt_comments;
create trigger prompt_comments_follow_on_insert
  after insert on public.prompt_comments
  for each row execute function public.comment_follow_on_insert();
