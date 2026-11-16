-- Skill topluluğa duyurulabilir (docs/history/408-*): `community_posts.skill_id` altıncı hedef (Space'in 215/242'deki kalıbı).
-- Skill yalnız BAŞVURU olabilir (topluluğa özgü Skill yok; `skills` tablosunda community_id yok), bir Skill bir toplulukta bir kez duyurulur,
-- yalnız yayında + herkese açık Skill paylaşılır (`_community_content_info` Skill kolunu 20261201150000'den biliyor). Okuma/etkileşim kuralları DEĞİŞMEZ:
-- gönderinin beğeni/yorumu/kaydı `community_post_id`'ye gider, Skill'in kendi sayaçlarına karışmaz.
-- ci:allow-destructive — yalnız üç CHECK kısıtı yeniden kurulur (kapsamı genişler), hiçbir satır silinmez/değişmez.
alter table public.community_posts
  add column if not exists skill_id uuid references public.skills (id) on delete cascade;

alter table public.community_posts drop constraint if exists community_posts_type_check;
alter table public.community_posts add constraint community_posts_type_check
  check (content_type in ('prompt', 'request', 'workflow', 'preset', 'space', 'skill'));
alter table public.community_posts drop constraint if exists community_posts_exactly_one_target;
alter table public.community_posts add constraint community_posts_exactly_one_target check (
  (prompt_id is not null)::integer + (request_id is not null)::integer + (workflow_id is not null)::integer
  + (preset_id is not null)::integer + (space_id is not null)::integer + (skill_id is not null)::integer = 1
);
alter table public.community_posts drop constraint if exists community_posts_type_matches_target;
alter table public.community_posts add constraint community_posts_type_matches_target check (
  (content_type = 'prompt' and prompt_id is not null)
  or (content_type = 'request' and request_id is not null)
  or (content_type = 'workflow' and workflow_id is not null)
  or (content_type = 'preset' and preset_id is not null)
  or (content_type = 'space' and space_id is not null)
  or (content_type = 'skill' and skill_id is not null)
);
create unique index if not exists community_posts_skill_uidx on public.community_posts (community_id, skill_id) where skill_id is not null;
alter table public.community_posts add constraint community_posts_skill_application check (skill_id is null or kind = 'application');

create or replace function public.share_to_community(p_group_id uuid, p_content_type text, p_content_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  g public.chat_groups;
  v_role text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_info record;
  v_id uuid := gen_random_uuid();
begin
  g := public._group_lock(p_group_id);
  v_role := public._group_member_role(p_group_id, v_actor);
  if v_role is null then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = v_actor and posting_blocked) then
    raise exception 'forbidden';
  end if;
  if g.closed_at is not null then
    raise exception 'community_closed';
  end if;
  if g.feed_policy = 'admins' and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'forbidden';
  end if;
  if p_content_type not in ('prompt', 'request', 'workflow', 'preset', 'space', 'skill') or p_content_id is null then
    raise exception 'invalid_content';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note';
  end if;

  select * into v_info from public._community_content_info(p_content_type, p_content_id);
  if not found then
    raise exception 'content_not_found';
  end if;
  if not v_info.shareable then
    -- Başkasının özel içeriği için de aynı yanıt: varlığı sızmasın.
    if v_info.owner_id is distinct from v_actor then
      raise exception 'content_not_found';
    end if;
    raise exception 'content_not_public';
  end if;
  if v_info.owner_id <> v_actor and public.is_blocked(v_actor, v_info.owner_id) then
    raise exception 'blocked';
  end if;
  if (select count(*) from public.community_posts where community_id = p_group_id and author_id = v_actor and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'post_rate_limit';
  end if;

  begin
    insert into public.community_posts (id, community_id, author_id, kind, content_type, prompt_id, request_id, workflow_id, preset_id, space_id, skill_id, note)
    values (
      v_id, p_group_id, v_actor, 'application', p_content_type,
      case when p_content_type = 'prompt' then p_content_id end,
      case when p_content_type = 'request' then p_content_id end,
      case when p_content_type = 'workflow' then p_content_id end,
      case when p_content_type = 'preset' then p_content_id end,
      case when p_content_type = 'space' then p_content_id end,
      case when p_content_type = 'skill' then p_content_id end,
      v_note
    );
  exception when unique_violation then
    raise exception 'already_shared';
  end;
  return v_id;
end;
$$;

-- Gönderi beğenisi bildirimi: başlık Skill adı da olabilir.
create or replace function public.notify_community_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.community_posts;
  v_title text;
begin
  select * into v_post from public.community_posts where id = new.community_post_id;
  if not found or v_post.author_id = new.user_id or public._group_member_role(v_post.community_id, v_post.author_id) is null then
    return new;
  end if;
  select coalesce(
    case v_post.content_type
      when 'prompt' then (select title from public.prompts where id = v_post.prompt_id)
      when 'request' then (select title from public.prompt_requests where id = v_post.request_id)
      when 'workflow' then (select title from public.workflows where id = v_post.workflow_id)
      when 'preset' then (select title from public.presets where id = v_post.preset_id)
      when 'space' then (select title from public.spaces where id = v_post.space_id)
      when 'skill' then (select title from public.skills where id = v_post.skill_id)
    end, '') into v_title;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_post.author_id, new.user_id, 'like',
    'Paylaşımını beğendi: "' || public.truncate_preview(v_title) || '"',
    public._community_post_href(v_post.id, v_post.community_id, 'post:' || v_post.id),
    'cpost_like:' || v_post.id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

revoke all on function public.share_to_community(uuid, text, uuid, text) from public, anon;
grant execute on function public.share_to_community(uuid, text, uuid, text) to authenticated;
revoke all on function public.notify_community_post_like() from public, anon, authenticated;
