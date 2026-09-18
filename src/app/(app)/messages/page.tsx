import { ConversationList } from "@/features/messages/conversation-list";
import { mockConversations } from "@/mocks/conversations";

export default function MessagesPage() {
  const conversations = [...mockConversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Mesajlar</h1>
      <ConversationList conversations={conversations} />
    </div>
  );
}
