"use client";

import { useState, type CSSProperties, type RefObject } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

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
  panelRef,
  style,
  variant = "popover",
}: {
  myReaction: string | null;
  onSelect: (emoji: string) => void;
  /** Measured by `useAnchoredPopover`, which places the picker (fixed, in a portal) inside the visible chat area. */
  panelRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  /** `bar`: the large, full-width pill above the message in the long-press / ⋮ sheet (docs/history/288-*) — same emoji, same toggle rule. */
  variant?: "popover" | "bar";
}) {
  const isBar = variant === "bar";
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const emojis = expanded ? [...QUICK_EMOJIS, ...MORE_EMOJIS] : QUICK_EMOJIS;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t("messages.chooseEmojiReaction")}
      style={style}
      className={cn(
        isBar
          ? // Sheet bar: fills the width it is given; expanding wraps the extra row inside the same pill.
            cn("flex items-center bg-surface-elevated/90 shadow-pop backdrop-blur-xl animate-pop-in origin-bottom", expanded ? "flex-wrap justify-center gap-1 rounded-3xl p-2" : "justify-between gap-0.5 rounded-full px-2 py-1.5")
          : cn(
              "z-50 flex items-center gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-md",
              // Collapsed (6 emoji + "➕"): `w-max` sizes to content — a fixed-position box with `width: auto` would otherwise
              // stretch or wrap each emoji onto its own line (a real bug once reported from a live screenshot). Expanded
              // (18 emoji): a fixed width so it wraps into a small grid instead of one very long horizontal strip.
              expanded ? "w-[13.5rem] flex-wrap" : "w-max flex-nowrap",
            ),
      )}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitemradio"
          onClick={() => onSelect(emoji)}
          aria-label={t("messages.giveEmojiReaction", { emoji })}
          aria-checked={myReaction === emoji}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full leading-none transition-transform hover:scale-110 hover:bg-accent-surface",
            isBar ? "h-11 w-11 text-[1.65rem]" : "h-8 w-8 text-base",
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
          aria-label={t("messages.showMoreEmoji")}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent-surface hover:text-text",
            isBar ? "h-11 w-11" : "h-8 w-8",
          )}
        >
          <Plus size={isBar ? 22 : 16} />
        </button>
      )}
    </div>
  );
}
