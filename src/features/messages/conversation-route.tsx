"use client";

import { useSearchParams } from "next/navigation";
import { LocalConversationView } from "./local-conversation-view";
import { NewChatDraftView } from "./new-chat-draft-view";
import { RoomsHub } from "./rooms/rooms-hub";

/** `/messages/local`: `?id=` is an existing conversation; `?to=` (and no id) is the empty composer behind "Yeni sohbet". */
export function ConversationRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const to = searchParams.get("to");
  if (!id && to) return <NewChatDraftView key={to} userId={to} />;
  // Topluluk sohbet merkezi (docs/history/352-*): oda listesi; `?view=rooms`.
  if (id && searchParams.get("view") === "rooms") return <RoomsHub key={id} communityId={id} />;
  return <LocalConversationView />;
}
