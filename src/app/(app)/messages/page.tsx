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

  const accepted = conversations.filter((c) => c.myStatus === "accepted");
  const pending = conversations.filter((c) => c.myStatus === "pending");

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Mesajlar</h1>
      {isSharing && (
        <p className="mb-4 rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text">
          Kime göndermek istersin? Bir konuşma seç — yalnızca mevcut konuşmalarına gönderebilirsin, yeni bir
          konuşma buradan başlatılamaz.
        </p>
      )}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text">Mesaj İstekleri ({pending.length})</h2>
          <p className="mb-2 text-xs text-text-muted">
            Seni takip etmeyen kişilerden gelen mesajlar burada bekler — açıp yanıtlarsan otomatik kabul edilir.
          </p>
          <ConversationList conversations={pending} shareQuery={shareQuery} />
        </div>
      )}
      {pending.length > 0 && accepted.length > 0 && (
        <h2 className="mb-2 text-sm font-semibold text-text">Sohbetler</h2>
      )}
      {(accepted.length > 0 || pending.length === 0) && (
        <ConversationList conversations={accepted} shareQuery={shareQuery} />
      )}
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
