"use client";

import { CardAvatar, useHeadlineParts } from "./notification-parts";
import { notificationCommentId } from "@/lib/notification-actions";
import { quotedPreview, reactionSummary } from "@/lib/notification-card";
import type { useNotificationCards } from "./use-notification-cards";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { NotificationCard } from "@/types";

type List = ReturnType<typeof useNotificationCards>;

/** Bölünmüş gelen kutusunun SOL listesindeki tek satır (docs/history/326-*): avatar · başlık · ön izleme · zaman; seçili satır vurgulu. */
export function NotificationListRow({ card, list, selected, onSelect }: { card: NotificationCard; list: List; selected: boolean; onSelect: () => void }) {
  const { t, language } = useTranslation();
  const { names, text } = useHeadlineParts(card);
  const commentId = notificationCommentId(card);
  const comment = commentId ? list.context.comments.get(commentId) : undefined;
  const preview = comment ? (comment.deleted ? null : comment.body) : (quotedPreview(card.latestMessage) ?? (reactionSummary(card.reactionCounts, t) || null));
  const unread = card.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      data-notification-row={card.key}
      data-unread={unread ? "true" : "false"}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected ? "border-primary/40 bg-primary-soft" : "border-transparent hover:bg-surface-soft",
      )}
    >
      <CardAvatar card={card} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-small leading-snug text-text">
            {names && <span className="font-semibold">{names} </span>}
            <span className={names ? "text-text-secondary" : "font-semibold"}>{text}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-caption text-text-muted">
            {unread && (
              <>
                <span className="sr-only">{t("notifications.unreadSr")}</span>
                <span aria-hidden className="size-2 rounded-full bg-primary" />
              </>
            )}
            {formatRelativeTime(card.sortAt, language)}
          </span>
        </span>
        {preview && <span className="mt-0.5 line-clamp-2 block text-small text-text-muted">{preview}</span>}
      </span>
    </button>
  );
}
