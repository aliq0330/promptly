"use client";

import Link from "next/link";
import { ArchiveRestore, BellOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { GroupAvatar } from "@/features/groups/group-avatar";
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
  const group = conversation.group;
  const title = group ? group.name : participant?.displayName;
  const muted = Boolean(conversation.mutedAt);

  return (
    <div
      className={cn(
        // Meydan (docs/history/192-*): every row is a soft pill-shaped cell; the open chat is a filled one (no side bar).
        "mx-1.5 my-0.5 flex items-center rounded-xl transition-colors duration-200 ease-soft hover:bg-surface-soft",
        isActive && "bg-primary-soft hover:bg-primary-soft",
      )}
    >
      <Link
        href={shareQuery ? `${messageHref(conversation)}&${shareQuery}` : messageHref(conversation)}
        aria-current={isActive ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5"
      >
        {group ? (
          <GroupAvatar name={group.name} avatarUrl={group.avatarUrl} size={44} badge />
        ) : (
          <Avatar
            src={participant?.avatarUrl}
            alt={participant?.displayName ?? t("common.genericUser")}
            size={44}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn("truncate text-sm tracking-[-0.01em] text-text", conversation.unreadCount > 0 ? "font-bold" : "font-semibold")}>{title}</span>
              {muted && <BellOff size={12} className="shrink-0 text-text-muted" aria-label={t("groups.about.muteLabel")} />}
            </span>
            <span className="shrink-0 text-caption tabular-nums text-text-muted">
              {formatRelativeTime(conversation.lastMessageAt, language)}
            </span>
          </div>
          <p className={cn("truncate text-xs", conversation.unreadCount > 0 ? "font-medium text-text" : "text-text-muted")}>{conversation.lastMessage}</p>
        </div>
        {conversation.unreadCount > 0 && (
          <span
            className={cn(
              "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
              muted ? "bg-border-strong text-text" : "bg-primary text-primary-foreground",
            )}
          >
            {conversation.unreadCount}
          </span>
        )}
      </Link>
      {onUnarchive && (
        <button
          type="button"
          onClick={onUnarchive}
          disabled={unarchiveBusy}
          aria-label={`${t("messages.unarchive")}: ${title ?? ""}`}
          title={t("messages.unarchive")}
          className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
        >
          <ArchiveRestore size={16} />
        </button>
      )}
    </div>
  );
}
