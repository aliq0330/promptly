"use client";

import { ConversationList } from "@/features/messages/conversation-list";
import { useRealMessages } from "@/features/messages/real-messages-provider";

export default function MessagesPage() {
  const { conversations } = useRealMessages();

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Mesajlar</h1>
      <ConversationList conversations={conversations} />
    </div>
  );
}
