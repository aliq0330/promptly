"use client";

import Link from "next/link";
import { ArchiveRestore } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime, messageHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Conversation } from "@/types";

export function ConversationRow({
  conversation,
  shareQuery,
  isActive,
  onUnarchive,
  unarchiveBusy,
}: {
  conversation: Conversation;
  /** Set by `/messages?sharePromptId=`/`?shareRequestId=` — appended so picking this conversation attaches the shared content there. */
  shareQuery?: string;
  /** The conversation currently open beside the list (tablet/desktop two-pane view). */
  isActive?: boolean;
  /** Only in the "Arşivlenenler" view: a one-tap way back to the inbox, beside the row's link. */
  onUnarchive?: () => void;
  unarchiveBusy?: boolean;
}) {
  const { t, language } = useTranslation();
  const participant = conversation.participants[0];

  return (
    <div
      className={cn(
        "flex items-center border-b border-border-soft transition-colors duration-200 ease-soft last:border-0 hover:bg-surface-soft",
        isActive && "bg-primary-soft/60 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary-soft/60",
      )}
    >
      <Link
        href={shareQuery ? `${messageHref(conversation)}&${shareQuery}` : messageHref(conversation)}
        aria-current={isActive ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
      >
        <Avatar
          src={participant?.avatarUrl}
          alt={participant?.displayName ?? t("common.genericUser")}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold tracking-[-0.01em] text-text">
              {participant?.displayName}
            </span>
            <span className="shrink-0 text-caption tabular-nums text-text-muted">
              {formatRelativeTime(conversation.lastMessageAt, language)}
            </span>
          </div>
          <p className={cn("truncate text-xs", conversation.unreadCount > 0 ? "font-medium text-text-secondary" : "text-text-muted")}>{conversation.lastMessage}</p>
        </div>
        {conversation.unreadCount > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
            {conversation.unreadCount}
          </span>
        )}
      </Link>
      {onUnarchive && (
        <button
          type="button"
          onClick={onUnarchive}
          disabled={unarchiveBusy}
          aria-label={`${t("messages.unarchive")}: ${participant?.displayName ?? ""}`}
          title={t("messages.unarchive")}
          className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
        >
          <ArchiveRestore size={16} />
        </button>
      )}
    </div>
  );
}
