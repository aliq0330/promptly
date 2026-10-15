"use client";

import { ConversationRow } from "./conversation-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

export function ConversationList({
  conversations,
  shareQuery,
  activeId,
  flush,
  emptyLabel,
  onUnarchive,
  busyId,
}: {
  conversations: Conversation[];
  shareQuery?: string;
  /** Conversation currently open in the right-hand pane (tablet/desktop). */
  activeId?: string | null;
  /** Drop the card border/radius — used inside the side pane, which already has its own frame. */
  flush?: boolean;
  /** Shown when the list is empty (defaults to the inbox wording). */
  emptyLabel?: string;
  /** Archive view only: adds a per-row "Arşivden çıkar" button. */
  onUnarchive?: (conversationId: string) => void;
  /** The conversation whose action is in flight — its button is disabled. */
  busyId?: string | null;
}) {
  const { t } = useTranslation();
  if (conversations.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">{emptyLabel ?? t("messages.noConversationsYet")}</p>
    );
  }

  return (
    <div className={flush ? "bg-surface" : "overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card"}>
      {conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          shareQuery={shareQuery}
          isActive={activeId === conversation.id}
          onUnarchive={onUnarchive ? () => onUnarchive(conversation.id) : undefined}
          unarchiveBusy={busyId === conversation.id}
        />
      ))}
    </div>
  );
}
