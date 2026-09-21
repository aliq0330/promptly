-- Conversations/messages and notifications — src/types/index.ts
-- Conversation, Message, AppNotification. The mock layer
-- (mocks/conversations.ts, mocks/notifications.ts) and the deliberately
-- disabled message composer (CLAUDE.md Bölüm 16: "mesaj gönderme henüz
-- devre dışı") stay exactly as they are until Bölüm 21.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

alter table public.conversations enable row level security;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unread_count integer not null default 0 check (unread_count >= 0),
  primary key (conversation_id, user_id)
);

alter table public.conversation_members enable row level security;
create index conversation_members_user_id_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);

-- Keeps conversations.last_message_at and every OTHER member's
-- unread_count in sync whenever a message is actually sent — mirrors what
-- the mock Conversation.lastMessage/lastMessageAt/unreadCount fields
-- already show today from static data.
create or replace function public.handle_new_message()
returns trigger
language plpgsql
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

create trigger messages_after_insert
  after insert on public.messages
  for each row
  execute function public.handle_new_message();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (
    type in ('follow', 'like', 'comment', 'comment_reply', 'remix', 'request_response', 'message', 'system')
  ),
  message text not null,
  target_href text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
create index notifications_recipient_id_is_read_idx on public.notifications (recipient_id, is_read);
