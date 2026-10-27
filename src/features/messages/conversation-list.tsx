"use client";

import { useState } from "react";
import { LoadMoreButton } from "@/features/feed/load-more";
import { ConversationRow } from "./conversation-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

/** Çok sohbetli bir kişide (yüzlerce birebir / topluluk) satırların hepsi bir anda çizilmez: 50'şer, aşağı inince devamı (docs/history/258-*). */
const CONVERSATIONS_SHOWN_STEP = 50;

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
  const [shown, setShown] = useState(CONVERSATIONS_SHOWN_STEP);
  // Açık sohbet pencerenin dışında kalmasın (derin bağlantıyla açılan eski bir sohbet).
  const activeIndex = activeId ? conversations.findIndex((conversation) => conversation.id === activeId) : -1;
  const visibleCount = Math.max(shown, activeIndex + 1);
  if (conversations.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-muted">{emptyLabel ?? t("messages.noConversationsYet")}</p>
    );
  }

  return (
    <div className={flush ? "bg-surface py-1" : "rounded-xl border border-border-soft bg-surface py-1 shadow-card"}>
      {conversations.slice(0, visibleCount).map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          shareQuery={shareQuery}
          isActive={activeId === conversation.id}
          onUnarchive={onUnarchive ? () => onUnarchive(conversation.id) : undefined}
          unarchiveBusy={busyId === conversation.id}
        />
      ))}
      {conversations.length > visibleCount && (
        <LoadMoreButton variant="ghost" size="sm" wrapperClassName="flex justify-center py-2" onLoadMore={() => setShown(visibleCount + CONVERSATIONS_SHOWN_STEP)} />
      )}
    </div>
  );
}
