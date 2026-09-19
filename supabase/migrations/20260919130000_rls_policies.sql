-- Promptly — Bölüm 19: RLS ve güvenlik politikaları.
--
-- Every table in Bölüm 18's schema had RLS enabled the moment it was
-- created, with zero policies — meaning nothing was reachable through the
-- anon/authenticated API keys at all. This migration adds the actual
-- access-control policies, matching the product's real rules: prompts and
-- requests are public discovery content (a "published" prompt is visible
-- to everyone, a draft only to its author), likes/comments/follows are a
-- public social graph, saves and notifications are private to their owner,
-- and messaging is restricted to conversation participants.
--
-- Important side-effect: several counter-maintaining trigger functions
-- from 20260919120300_engagement.sql and 20260919120400_messaging_and_
-- notifications.sql update OTHER users' rows (e.g. liking someone else's
-- prompt increments THEIR like_count; following someone updates BOTH
-- profiles). Trigger functions execute with the privileges of the
-- *invoking* user unless marked SECURITY DEFINER — so without this fix,
-- the RLS policies below would silently block those cross-user counter
-- updates (an UPDATE whose target row doesn't satisfy the policy's USING
-- clause simply updates zero rows, no error). This migration re-declares
-- those functions as SECURITY DEFINER (with a pinned search_path, standard
-- Postgres advice for definer functions) so they keep working correctly
-- once RLS is actually enforced.

-- === Fix: counter triggers must bypass RLS to update other users' rows ==

create or replace function public.handle_prompt_like_change()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function public.handle_prompt_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function public.handle_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function public.handle_prompt_origin_change()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  update public.conversation_members
  set unread_count = unread_count + 1
  where conversation_id = new.conversation_id
    and user_id <> new.sender_id;

  return new;
end;
$$;

-- === profiles ============================================================

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert policy: rows are created exclusively by the handle_new_user
-- SECURITY DEFINER trigger on auth.users (Bölüm 18), which bypasses RLS.
-- No delete policy: account deletion is a service_role/auth-admin
-- operation (cascades from auth.users), not a client-side action.

-- === tags ================================================================

create policy "Tags are publicly readable"
  on public.tags for select
  using (true);

-- No write policies — tags are a curated catalog (see supabase/README.md),
-- managed via migrations/service_role, not by end users.

-- === prompt_requests ======================================================

create policy "Requests are publicly readable"
  on public.prompt_requests for select
  using (true);

create policy "Authenticated users can create their own requests"
  on public.prompt_requests for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Authors can update their own requests"
  on public.prompt_requests for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "Authors can delete their own requests"
  on public.prompt_requests for delete
  using (auth.uid() = author_id);

-- === prompts ==============================================================

create policy "Published prompts are public, drafts are author-only"
  on public.prompts for select
  using (status = 'published' or auth.uid() = author_id);

create policy "Authenticated users can create their own prompts"
  on public.prompts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Authors can update their own prompts"
  on public.prompts for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "Authors can delete their own prompts"
  on public.prompts for delete
  using (auth.uid() = author_id);

-- === prompt_media =========================================================

create policy "Prompt media is readable wherever its prompt is readable"
  on public.prompt_media for select
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_media.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy "Prompt authors manage their own prompt media"
  on public.prompt_media for all
  to authenticated
  using (
    exists (select 1 from public.prompts p where p.id = prompt_media.prompt_id and p.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.prompts p where p.id = prompt_media.prompt_id and p.author_id = auth.uid())
  );

-- === prompt_tags ==========================================================

create policy "Prompt tags are readable wherever their prompt is readable"
  on public.prompt_tags for select
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_tags.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    )
  );

create policy "Prompt authors manage their own prompt tags"
  on public.prompt_tags for all
  to authenticated
  using (
    exists (select 1 from public.prompts p where p.id = prompt_tags.prompt_id and p.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.prompts p where p.id = prompt_tags.prompt_id and p.author_id = auth.uid())
  );

-- === prompt_request_tags ==================================================

create policy "Request tags are publicly readable"
  on public.prompt_request_tags for select
  using (true);

create policy "Request authors manage their own request tags"
  on public.prompt_request_tags for all
  to authenticated
  using (
    exists (select 1 from public.prompt_requests r where r.id = prompt_request_tags.request_id and r.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.prompt_requests r where r.id = prompt_request_tags.request_id and r.author_id = auth.uid())
  );

-- === prompt_likes =========================================================

create policy "Likes are publicly readable"
  on public.prompt_likes for select
  using (true);

create policy "Authenticated users can like prompts for themselves"
  on public.prompt_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own likes"
  on public.prompt_likes for delete
  using (auth.uid() = user_id);

-- === prompt_saves =========================================================
-- Saves are personal bookmarks, unlike likes/follows — never exposed to
-- other users (mirrors the app's /saved page, which only the owner sees).

create policy "Users can view their own saves"
  on public.prompt_saves for select
  using (auth.uid() = user_id);

create policy "Users can save prompts for themselves"
  on public.prompt_saves for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own saves"
  on public.prompt_saves for delete
  using (auth.uid() = user_id);

-- === prompt_comments ======================================================

create policy "Comments are readable wherever their target is readable"
  on public.prompt_comments for select
  using (
    (prompt_id is not null and exists (
      select 1 from public.prompts p
      where p.id = prompt_comments.prompt_id
        and (p.status = 'published' or p.author_id = auth.uid())
    ))
    or (request_id is not null)
  );

create policy "Authenticated users can comment on visible targets"
  on public.prompt_comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      (prompt_id is not null and exists (
        select 1 from public.prompts p
        where p.id = prompt_comments.prompt_id
          and (p.status = 'published' or p.author_id = auth.uid())
      ))
      or (request_id is not null)
    )
  );

create policy "Authors can update their own comments"
  on public.prompt_comments for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "Authors can delete their own comments"
  on public.prompt_comments for delete
  using (auth.uid() = author_id);

-- === follows ==============================================================

create policy "Follow relationships are publicly readable"
  on public.follows for select
  using (true);

create policy "Authenticated users can follow others"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- === messaging ============================================================
-- conversation_members' own RLS policy needs to check "is the current user
-- a member of this conversation" — a naive USING clause referencing
-- conversation_members from within its own policy re-applies that same
-- policy to the inner query. A SECURITY DEFINER helper function sidesteps
-- that by reading membership with RLS bypassed (standard Supabase pattern
-- for this exact chat/membership shape).

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = target_conversation_id
      and user_id = auth.uid()
  );
$$;

comment on function public.is_conversation_member(uuid) is
  'SECURITY DEFINER so conversation_members RLS policies can check membership without recursively re-applying their own policy to the inner query.';

create policy "Members can view their conversations"
  on public.conversations for select
  using (public.is_conversation_member(id));

create policy "Authenticated users can start a conversation"
  on public.conversations for insert
  to authenticated
  with check (true);

create policy "Members can view the membership of their conversations"
  on public.conversation_members for select
  using (public.is_conversation_member(conversation_id));

create policy "Users can join or invite into a conversation they're in"
  on public.conversation_members for insert
  to authenticated
  with check (auth.uid() = user_id or public.is_conversation_member(conversation_id));

create policy "Members can update their own membership row"
  on public.conversation_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Members can leave a conversation"
  on public.conversation_members for delete
  using (auth.uid() = user_id);

create policy "Members can read messages in their conversations"
  on public.messages for select
  using (public.is_conversation_member(conversation_id));

create policy "Members can send messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id));

-- === notifications ========================================================
-- No insert/delete policy for clients: notifications are meant to be
-- generated server-side (a future SECURITY DEFINER trigger/function, once
-- Bölüm 21 wires real cross-user events) which bypasses RLS like the
-- counter triggers above. Until then this table simply isn't writable by
-- the app — consistent with CLAUDE.md's documented "bildirimler mock
-- kalıyor" limitation.

create policy "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = recipient_id);

create policy "Users can mark their own notifications read"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- === reports ===============================================================
-- Baseline ownership policies only. Moderator/admin review (status
-- transitions, cross-user visibility) needs a role system that doesn't
-- exist yet — that's Bölüm 22's job; this just lets a user file a report
-- and see their own report history.

create policy "Users can view their own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);

create policy "Authenticated users can file reports"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- === blocks ================================================================

create policy "Users can view their own block list"
  on public.blocks for select
  using (auth.uid() = blocker_id);

create policy "Authenticated users can block others"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "Users can unblock"
  on public.blocks for delete
  using (auth.uid() = blocker_id);
