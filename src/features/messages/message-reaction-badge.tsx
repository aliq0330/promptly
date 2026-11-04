"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { emptyCounts, REACTION_LABEL, topReactions, totalOf, type ReactionKey } from "@/lib/reactions";
import { ReactionIcon, type ReactionIconHandle } from "@/features/reactions/reaction-icon";
import { playReactionEffect } from "@/features/reactions/reaction-player";
import type { MessageReactionEntry } from "./message-bubble-types";

/**
 * The small pill under a message (docs/history/330-*): the post reactions' static posters (most given first, at most three) + the total
 * when more than one person reacted. When the caller just picked a reaction (`burst`, a fresh `n` each time), that emoji plays its own
 * animation here and the reaction effect bursts from it — exactly what the post's reaction button does. Nothing plays where animations are off.
 */
export function MessageReactionBadge({
  reactions,
  burst,
  className,
}: {
  reactions: MessageReactionEntry[];
  burst: { reaction: ReactionKey; n: number } | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const icons = useRef<Partial<Record<ReactionKey, ReactionIconHandle | null>>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => {
    const next = emptyCounts();
    for (const entry of reactions) next[entry.reaction] += 1;
    return next;
  }, [reactions]);
  const shown = topReactions(counts, 3);
  const total = totalOf(counts);

  useEffect(() => {
    if (!burst) return;
    // Not among the three shown (many people reacted otherwise): the effect still bursts, from the pill.
    const handle = icons.current[burst.reaction];
    handle?.play();
    playReactionEffect(burst.reaction, handle?.element() ?? rootRef.current);
  }, [burst]);

  if (total === 0) return null;
  return (
    <div
      ref={rootRef}
      data-message-reactions=""
      aria-label={shown.map((key) => t(REACTION_LABEL[key])).join(", ") + (total > 1 ? ` · ${total}` : "")}
      className={cn("flex items-center gap-0.5 rounded-full bg-surface-elevated px-1.5 py-0.5 text-xs leading-none text-text ring-2 ring-background", className)}
    >
      {shown.map((key) => (
        <span key={key} data-reaction-emoji={key} className="flex">
          <ReactionIcon
            ref={(handle) => {
              icons.current[key] = handle;
            }}
            reaction={key}
            size={18}
          />
        </span>
      ))}
      {total > 1 && <span className="pl-0.5 pr-0.5 font-semibold tabular-nums text-text-secondary">{total}</span>}
    </div>
  );
}
