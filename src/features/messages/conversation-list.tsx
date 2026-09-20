import { ConversationRow } from "./conversation-row";
import type { Conversation } from "@/types";

export function ConversationList({
  conversations,
  shareQuery,
}: {
  conversations: Conversation[];
  shareQuery?: string;
}) {
  if (conversations.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz bir konuşman yok.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {conversations.map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} shareQuery={shareQuery} />
      ))}
    </div>
  );
}
