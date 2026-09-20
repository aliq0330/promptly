"use client";

import { useState, type RefObject } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Aşama 2's required minimum set, in the given order. */
const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

/** Revealed behind the "➕" — this app has no emoji-picker library (kept
 * dependency-free, matching CLAUDE.md §2's "no unnecessary dependency"
 * rule), so "more emoji" is a second, still-fixed row rather than a full
 * emoji keyboard. */
const MORE_EMOJIS = ["😍", "🎉", "🔥", "👏", "🙏", "😅", "🤔", "😴", "💯", "🥳", "😎", "🙌"];

/**
 * The small, round-cornered popover from Aşama 2/12 — tapping an emoji
 * that's already the caller's own active reaction removes it (handled by
 * the parent's `onSelect`, which compares against the current reaction);
 * any other emoji sets/replaces it. Never shows a count — this picker only
 * ever reflects the CALLER's own choice (the highlighted ring), never how
 * many people reacted.
 */
export function EmojiPicker({
  myReaction,
  onSelect,
  align,
  panelRef,
}: {
  myReaction: string | null;
  onSelect: (emoji: string) => void;
  align: "left" | "right";
  /** Attached to the root so `usePopoverAlign` can measure it against the viewport and flip sides if it would overflow. */
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const emojis = expanded ? [...QUICK_EMOJIS, ...MORE_EMOJIS] : QUICK_EMOJIS;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Emoji tepkisi seç"
      className={cn(
        "absolute top-full z-30 mt-1.5 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-md",
        align === "right" ? "right-0" : "left-0",
        expanded ? "w-[13.5rem]" : "w-auto",
      )}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitemradio"
          onClick={() => onSelect(emoji)}
          aria-label={`${emoji} tepkisi ver`}
          aria-checked={myReaction === emoji}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base leading-none transition-transform hover:scale-110 hover:bg-accent-surface",
            myReaction === emoji && "bg-accent-surface ring-1 ring-primary",
          )}
        >
          {emoji}
        </button>
      ))}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Daha fazla emoji göster"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent-surface hover:text-text"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}
