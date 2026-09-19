-- Likes, saves, comments and follows — plus every trigger that keeps the
-- denormalized counters on profiles/prompts/prompt_requests accurate.
-- Maps to src/types/index.ts (Prompt.likeCount/commentCount/remixCount,
-- UserProfile.followerCount/followingCount, PromptRequest.responseCount)
-- and the localStorage providers CLAUDE.md Bölüm 13/14 built as a stand-in
-- for this (features/prompts/like-save-provider.tsx, comment-provider.tsx,
-- features/profile/follow-provider.tsx) — those stay in place until
-- Bölüm 21 rewires the frontend to read/write these tables instead.

create table public.prompt_likes (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prompt_id, user_id)
);

alter table public.prompt_likes enable row level security;
create index prompt_likes_user_id_idx on public.prompt_likes (user_id);

create table public.prompt_saves (
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prompt_id, user_id)
);

alter table public.prompt_saves enable row level security;
create index prompt_saves_user_id_idx on public.prompt_saves (user_id);

-- A comment belongs to exactly one of a prompt or a request — mirrors the
-- PromptComment type's promptId?/requestId? pair in src/types/index.ts,
-- where the app already enforces this same "exactly one" rule client-side
-- (see features/prompts/comment-provider.tsx's CommentTarget).
create table public.prompt_comments (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid references public.prompts (id) on delete cascade,
  request_id uuid references public.prompt_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  parent_id uuid references public.prompt_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint prompt_comments_exactly_one_target check (
    (prompt_id is not null and request_id is null)
    or (prompt_id is null and request_id is not null)
  )
);

alter table public.prompt_comments enable row level security;
create index prompt_comments_prompt_id_idx on public.prompt_comments (prompt_id) where prompt_id is not null;
create index prompt_comments_request_id_idx on public.prompt_comments (request_id) where request_id is not null;
create index prompt_comments_parent_id_idx on public.prompt_comments (parent_id) where parent_id is not null;

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;
create index follows_following_id_idx on public.follows (following_id);

-- === Counter-maintaining triggers ===============================

create or replace function public.handle_prompt_like_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.prompts set like_count = like_count + 1 where id = new.prompt_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.prompts set like_count = like_count - 1 where id = old.prompt_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger prompt_likes_after_change
  after insert or delete on public.prompt_likes
  for each row
  execute function public.handle_prompt_like_change();

create or replace function public.handle_prompt_comment_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.prompt_id is not null then
    update public.prompts set comment_count = comment_count + 1 where id = new.prompt_id;
    return new;
  elsif tg_op = 'DELETE' and old.prompt_id is not null then
    update public.prompts set comment_count = comment_count - 1 where id = old.prompt_id;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger prompt_comments_after_change
  after insert or delete on public.prompt_comments
  for each row
  execute function public.handle_prompt_comment_change();

create or replace function public.handle_follow_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = following_count - 1 where id = old.follower_id;
    update public.profiles set follower_count = follower_count - 1 where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger follows_after_change
  after insert or delete on public.follows
  for each row
  execute function public.handle_follow_change();

-- A prompt is itself the "remix" or "request answer" (CLAUDE.md Bölüm
-- 9/10's decision — see prompts_and_requests.sql's note), so these two
-- counters are maintained from inserts/deletes on the prompts table
-- itself rather than a join table.
create or replace function public.handle_prompt_origin_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.origin_type = 'remix' then
      update public.prompts set remix_count = remix_count + 1 where id = new.source_prompt_id;
    elsif new.origin_type = 'request_response' then
      update public.prompt_requests set response_count = response_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.origin_type = 'remix' then
      update public.prompts set remix_count = remix_count - 1 where id = old.source_prompt_id;
    elsif old.origin_type = 'request_response' then
      update public.prompt_requests set response_count = response_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create trigger prompts_after_origin_change
  after insert or delete on public.prompts
  for each row
  execute function public.handle_prompt_origin_change();
