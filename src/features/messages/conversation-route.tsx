"use client";

import { useSearchParams } from "next/navigation";
import { LocalConversationView } from "./local-conversation-view";
import { NewChatDraftView } from "./new-chat-draft-view";

/** `/messages/local`: `?id=` is an existing conversation; `?to=` (and no id) is the empty composer behind "Yeni sohbet". */
export function ConversationRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const to = searchParams.get("to");
  if (!id && to) return <NewChatDraftView key={to} userId={to} />;
  return <LocalConversationView />;
}
