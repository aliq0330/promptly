-- Moderasyon (Bölüm 22): moderatör rolü, şikâyet inceleme kuyruğu, içerik
-- kaldırma. Engellenen kullanıcı içeriğini gizleme istemci tarafında
-- (blocks tablosu zaten var), burada yalnızca rol + inceleme.

alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator'));

-- Kullanıcı kendi satırını güncelleyebildiği için rolünü kendisi yükseltemesin:
-- istemci (auth.uid() dolu) rol değiştiremez; yalnızca SQL Editor/service_role.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Rol değiştirilemez.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'moderator');
$$;
grant execute on function public.is_moderator() to authenticated;

update public.profiles set role = 'moderator' where username = 'aliq03';

-- Şikâyet hedefleri: generator ve workflow da şikâyet edilebilsin.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('prompt', 'comment', 'request', 'user', 'message', 'generator', 'workflow'));
alter table public.reports add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.reports add column if not exists reviewed_at timestamptz;
alter table public.reports add column if not exists resolution_note text;

create policy "Moderators can view all reports" on public.reports for select using (public.is_moderator());

-- Kuyruk: rapor + raportör + hedef özeti (mesaj içeriği dahil, yalnızca moderatöre).
create or replace function public.moderation_report_queue(p_status text default 'open')
returns table (
  id uuid, status text, reason text, created_at timestamptz, reviewed_at timestamptz, resolution_note text,
  target_type text, target_id uuid,
  reporter_id uuid, reporter_username text,
  target_exists boolean, target_title text, target_author_id uuid, target_author_username text, target_href text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  return query
  select r.id, r.status, r.reason, r.created_at, r.reviewed_at, r.resolution_note, r.target_type, r.target_id,
    r.reporter_id, rp.username,
    (x.exists_), x.title, x.author_id, ap.username, x.href
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join lateral (
    select true as exists_, p.title as title, p.author_id as author_id, '/prompts/local?id=' || p.id as href
      from public.prompts p where r.target_type = 'prompt' and p.id = r.target_id
    union all
    select true, q.title, q.author_id, '/requests/local?id=' || q.id
      from public.prompt_requests q where r.target_type = 'request' and q.id = r.target_id
    union all
    select true, g.title, g.creator_id, '/generators/local?slug=' || g.slug
      from public.generators g where r.target_type = 'generator' and g.id = r.target_id
    union all
    select true, w.title, w.creator_id, '/workflows/local?id=' || w.id
      from public.workflows w where r.target_type = 'workflow' and w.id = r.target_id
    union all
    select true, left(c.body, 300), c.author_id, null::text
      from public.prompt_comments c where r.target_type = 'comment' and c.id = r.target_id
    union all
    select true, left(coalesce(m.body, ''), 300), m.sender_id, null::text
      from public.messages m where r.target_type = 'message' and m.id = r.target_id
    union all
    select true, u.display_name, u.id, '/profile/real?username=' || u.username
      from public.profiles u where r.target_type = 'user' and u.id = r.target_id
  ) x on true
  left join public.profiles ap on ap.id = x.author_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $$;
grant execute on function public.moderation_report_queue(text) to authenticated;

-- Karar: dismissed | reviewed | removed (içeriği kaldırır, sonra reviewed).
create or replace function public.moderate_report(p_report_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_moderator() then raise exception 'Yetkisiz.'; end if;
  if p_action not in ('dismissed', 'reviewed', 'removed') then raise exception 'Geçersiz işlem.'; end if;
  select * into r from public.reports where id = p_report_id;
  if not found then raise exception 'Şikâyet bulunamadı.'; end if;
  if p_action = 'removed' then
    if r.target_type = 'prompt' then delete from public.prompts where id = r.target_id;
    elsif r.target_type = 'request' then delete from public.prompt_requests where id = r.target_id;
    elsif r.target_type = 'generator' then delete from public.generators where id = r.target_id;
    elsif r.target_type = 'workflow' then delete from public.workflows where id = r.target_id;
    elsif r.target_type = 'comment' then delete from public.prompt_comments where id = r.target_id;
    elsif r.target_type = 'message' then
      update public.messages set body = null, shared_prompt_id = null, shared_request_id = null, deleted_at = now()
        where id = r.target_id;
    else raise exception 'Bu hedef türü kaldırılamaz.';
    end if;
  end if;
  update public.reports
    set status = case when p_action = 'dismissed' then 'dismissed' else 'reviewed' end,
        reviewed_by = auth.uid(), reviewed_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_report_id;
  -- Aynı hedefe ait diğer açık şikâyetleri de kapat.
  if p_action = 'removed' then
    update public.reports set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
      resolution_note = coalesce(resolution_note, 'İçerik kaldırıldı.')
      where target_type = r.target_type and target_id = r.target_id and status = 'open';
  end if;
end $$;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
