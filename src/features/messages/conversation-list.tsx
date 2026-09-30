"use client";

import { ConversationRow } from "./conversation-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

export function ConversationList({
  conversations,
  shareQuery,
  activeId,
  flush,
}: {
  conversations: Conversation[];
  shareQuery?: string;
  /** Conversation currently open in the right-hand pane (tablet/desktop). */
  activeId?: string | null;
  /** Drop the card border/radius — used inside the side pane, which already has its own frame. */
  flush?: boolean;
}) {
  const { t } = useTranslation();
  if (conversations.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">{t("messages.noConversationsYet")}</p>
    );
  }

  return (
    <div className={flush ? "bg-surface" : "overflow-hidden rounded-lg border border-border bg-surface"}>
      {conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          shareQuery={shareQuery}
          isActive={activeId === conversation.id}
        />
      ))}
    </div>
  );
}
