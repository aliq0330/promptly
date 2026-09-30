"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime, messageHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

export function ConversationRow({
  conversation,
  shareQuery,
  isActive,
}: {
  conversation: Conversation;
  /** Set by `/messages?sharePromptId=`/`?shareRequestId=` — appended so picking this conversation attaches the shared content there. */
  shareQuery?: string;
  /** The conversation currently open beside the list (tablet/desktop two-pane view). */
  isActive?: boolean;
}) {
  const { t, language } = useTranslation();
  const participant = conversation.participants[0];

  return (
    <Link
      href={shareQuery ? `${messageHref(conversation)}&${shareQuery}` : messageHref(conversation)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent-surface/40",
        isActive && "bg-primary-soft hover:bg-primary-soft",
      )}
    >
      <Avatar
        src={participant?.avatarUrl}
        alt={participant?.displayName ?? t("common.genericUser")}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-text">
            {participant?.displayName}
          </span>
          <span className="shrink-0 text-xs text-text-muted">
            {formatRelativeTime(conversation.lastMessageAt, language)}
          </span>
        </div>
        <p className="truncate text-xs text-text-muted">{conversation.lastMessage}</p>
      </div>
      {conversation.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {conversation.unreadCount}
        </span>
      )}
    </Link>
  );
}
