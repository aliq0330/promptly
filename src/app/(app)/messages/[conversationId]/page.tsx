import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime } from "@/lib/utils";
import { getConversationById, mockConversations, mockMessages } from "@/mocks/conversations";

export function generateStaticParams() {
  return mockConversations.map((conversation) => ({ conversationId: conversation.id }));
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const conversation = getConversationById(conversationId);
  if (!conversation) notFound();

  const participant = conversation.participants[0];
  const messages = mockMessages[conversation.id] ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
        <Avatar src={participant?.avatarUrl} alt={participant?.displayName ?? "Kullanıcı"} size={36} />
        <span className="text-sm font-semibold text-text">{participant?.displayName}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 lg:px-6">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            Bu konuşmada henüz mesaj yok.
          </p>
        ) : (
          messages.map((message) => {
            const isMe = message.senderId === "me";
            return (
              <div key={message.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    isMe ? "bg-primary text-primary-foreground" : "bg-accent-surface text-text",
                  )}
                >
                  <p>{message.body}</p>
                  <span
                    className={cn(
                      "mt-1 block text-[11px]",
                      isMe ? "text-primary-foreground/70" : "text-text-muted",
                    )}
                  >
                    {formatRelativeTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-border p-4 lg:px-6">
        <input
          type="text"
          disabled
          placeholder="Mesaj yazma yakında aktif olacak"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text-muted placeholder:text-text-muted"
        />
      </div>
    </div>
  );
}
