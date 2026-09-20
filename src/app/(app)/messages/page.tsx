"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationList } from "@/features/messages/conversation-list";
import { useRealMessages } from "@/features/messages/real-messages-provider";

function MessagesPageInner() {
  const { conversations } = useRealMessages();
  const searchParams = useSearchParams();
  const sharePromptId = searchParams.get("sharePromptId");
  const shareRequestId = searchParams.get("shareRequestId");
  const isSharing = Boolean(sharePromptId || shareRequestId);
  const shareQuery = sharePromptId
    ? `sharePromptId=${sharePromptId}`
    : shareRequestId
      ? `shareRequestId=${shareRequestId}`
      : undefined;

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Mesajlar</h1>
      {isSharing && (
        <p className="mb-4 rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text">
          Kime göndermek istersin? Bir konuşma seç — yalnızca mevcut konuşmalarına gönderebilirsin, yeni bir
          konuşma buradan başlatılamaz.
        </p>
      )}
      <ConversationList conversations={conversations} shareQuery={shareQuery} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesPageInner />
    </Suspense>
  );
}
