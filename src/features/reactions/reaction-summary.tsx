"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { useEngagementEntry } from "@/features/content/engagement-store";
import { useTranslation } from "@/lib/i18n/language-provider";
import { DEFAULT_REACTION, summaryParts, topReactions, type ReactionKey } from "@/lib/reactions";
import type { LikeableContentType } from "@/lib/supabase/likes";
import { useReactionBreakdown } from "./reaction-breakdown";
import { ReactionIcon } from "./reaction-icon";
import { ReactionSheet } from "./reaction-sheet";

/**
 * "Sen, Zeynep ve 128 kişi tepki verdi" + the most given emojis (docs/history/265-*): who reacted, right under the action row of a card or a
 * detail page. Names come first from the viewer (when they reacted) and the people they follow; pressing it opens the "Tepkiler" sheet with
 * everyone and their reaction. Draws nothing while the target has no reaction. The total and the viewer's own reaction are the like store's
 * (the same ones the button shows); the per-reaction counts and the followed people load once per target (batched across a page).
 */
export function ReactionSummary({ contentType, id, likeCount, className }: { contentType: LikeableContentType; id: string; likeCount: number; className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const entry = useEngagementEntry("like", contentType, id, likeCount);
  const total = entry.count;
  const mine: ReactionKey | null = entry.active ? entry.reaction ?? DEFAULT_REACTION : null;
  const breakdown = useReactionBreakdown(contentType, id, user?.id ?? null, total > 0);
  const [open, setOpen] = useState(false);

  if (total <= 0) return null;

  const stack = breakdown.loaded ? topReactions(breakdown.counts) : mine ? [mine] : [];
  const { me, friendNames, rest } = summaryParts(total, mine !== null, breakdown.friends);
  const names = [...(me ? [t("reaction.summary.you")] : []), ...friendNames];
  const joined = rest === 0 && names.length > 1 ? names.join(t("reaction.summary.and")) : names.join(", ");
  const text =
    names.length === 0
      ? rest === 1
        ? t("reaction.summary.countOne")
        : t("reaction.summary.count", { count: rest })
      : rest === 0
        ? me && names.length === 1
          ? t("reaction.summary.onlyYou")
          : t("reaction.summary.names", { names: joined })
        : rest === 1
          ? t("reaction.summary.namesRestOne", { names: joined })
          : t("reaction.summary.namesRest", { names: joined, count: rest });

  return (
    <>
      <button
        type="button"
        data-reaction-summary={id}
        aria-haspopup="dialog"
        aria-label={t("reaction.summary.aria", { count: total })}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "relative z-10 flex min-h-8 max-w-full items-center gap-2 rounded-md py-1 pr-1.5 text-left text-caption text-text-muted transition-colors duration-200 ease-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          className,
        )}
      >
        <span className="flex shrink-0 items-center" aria-hidden>
          {stack.map((key, index) => (
            <span key={key} className={cn("inline-flex size-6 items-center justify-center rounded-full bg-primary-soft ring-2 ring-surface", index > 0 && "-ml-2")}>
              <ReactionIcon reaction={key} size={16} />
            </span>
          ))}
        </span>
        <span className="min-w-0 truncate" aria-hidden>
          {text}
        </span>
        <ChevronRight size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>
      {open && <ReactionSheet contentType={contentType} id={id} likeCount={likeCount} counts={breakdown.counts} onClose={() => setOpen(false)} />}
    </>
  );
}
