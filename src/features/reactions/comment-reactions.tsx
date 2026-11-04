"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useEngagementEntry } from "@/features/content/engagement-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import { topReactions } from "@/lib/reactions";
import { cn } from "@/lib/utils";
import { useReactionBreakdown } from "./reaction-breakdown";
import { ReactionButton } from "./reaction-button";
import { ReactionIcon } from "./reaction-icon";
import { ReactionSheet } from "./reaction-sheet";

/**
 * A comment's reaction control (docs/history/327-*): the same `ReactionButton` a post's heart is (the press opens the six-emoji picker, the chosen emoji replaces the
 * heart, the count is the total) plus a small stack of the most given emojis that opens the "Tepkiler" list — so the reactions of a comment are counted and
 * browsable, not just shown. Counts come batched per page of comments (`useReactionBreakdown`).
 */
export function CommentReactions({
  id,
  likeCount,
  size = 14,
  className,
  buttonClassName,
  layout = "row",
}: {
  id: string;
  likeCount: number;
  size?: number;
  className?: string;
  buttonClassName?: string;
  /** `row`: button + stack side by side; `column`: stacked under each other (Odak's narrow right column). */
  layout?: "row" | "column";
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const entry = useEngagementEntry("like", "comment", id, likeCount);
  const breakdown = useReactionBreakdown("comment", id, user?.id ?? null, entry.count > 0);
  const [open, setOpen] = useState(false);
  const stack = breakdown.loaded ? topReactions(breakdown.counts).slice(0, 3) : [];

  return (
    <span className={cn("inline-flex items-center", layout === "column" ? "flex-col gap-0.5" : "gap-0.5", className)} data-comment-reactions={id}>
      <ReactionButton contentType="comment" id={id} likeCount={likeCount} size={size} className={cn("h-7 min-w-0 px-1.5 text-caption", buttonClassName)} />
      {entry.count > 0 && stack.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={t("reaction.summary.aria", { count: entry.count })}
          data-comment-reaction-stack=""
          className="flex items-center rounded-full py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {stack.map((key, index) => (
            <span key={key} className={cn("inline-flex size-5 items-center justify-center rounded-full bg-primary-soft ring-2 ring-surface", index > 0 && "-ml-1.5")}>
              <ReactionIcon reaction={key} size={12} />
            </span>
          ))}
        </button>
      )}
      {open && <ReactionSheet contentType="comment" id={id} likeCount={likeCount} counts={breakdown.counts} onClose={() => setOpen(false)} />}
    </span>
  );
}
