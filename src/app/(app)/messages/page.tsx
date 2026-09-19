"use client";

import { ConversationList } from "@/features/messages/conversation-list";
import { mockConversations } from "@/mocks/conversations";
import { useRealMessages } from "@/features/messages/real-messages-provider";

export default function MessagesPage() {
  const { conversations: realConversations } = useRealMessages();
  const conversations = [...mockConversations, ...realConversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Mesajlar</h1>
      <ConversationList conversations={conversations} />
    </div>
  );
}
