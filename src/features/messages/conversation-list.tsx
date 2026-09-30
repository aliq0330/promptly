"use client";

import { ConversationRow } from "./conversation-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

export function ConversationList({
  conversations,
  shareQuery,
}: {
  conversations: Conversation[];
  shareQuery?: string;
}) {
  const { t } = useTranslation();
  if (conversations.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">{t("messages.noConversationsYet")}</p>
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
