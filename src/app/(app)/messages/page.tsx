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
  // A generator has no rich embed in the messages schema (Bölüm 9.52's own
  // "no new messaging table/column" rule) — it rides this exact same
  // conversation-picker screen anyway, purely via a client-side query
  // param, and turns into a plain-text message (title + link) once a
  // conversation is picked (see `LocalConversationView`).
  const shareGeneratorId = searchParams.get("shareGeneratorId");
  const isSharing = Boolean(sharePromptId || shareRequestId || shareGeneratorId);
  const shareQuery = sharePromptId
    ? `sharePromptId=${sharePromptId}`
    : shareRequestId
      ? `shareRequestId=${shareRequestId}`
      : shareGeneratorId
        ? `shareGeneratorId=${shareGeneratorId}`
        : undefined;

  const accepted = conversations.filter((c) => c.myStatus === "accepted");
  const pending = conversations.filter((c) => c.myStatus === "pending");

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <h1 className="mb-4 text-h1 font-semibold text-text">Mesajlar</h1>
      {isSharing && (
        <p className="mb-4 rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text">
          Kime göndermek istersin? Bir konuşma seç — yalnızca mevcut konuşmalarına gönderebilirsin, yeni bir
          konuşma buradan başlatılamaz.
        </p>
      )}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-h3 font-semibold text-text">Mesaj İstekleri ({pending.length})</h2>
          <p className="mb-2 text-xs text-text-muted">
            Seni takip etmeyen kişilerden gelen mesajlar burada bekler — açıp yanıtlarsan otomatik kabul edilir.
          </p>
          <ConversationList conversations={pending} shareQuery={shareQuery} />
        </div>
      )}
      {pending.length > 0 && accepted.length > 0 && (
        <h2 className="mb-2 text-h3 font-semibold text-text">Sohbetler</h2>
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
