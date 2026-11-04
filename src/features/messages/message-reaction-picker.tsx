"use client";

import type { CSSProperties, RefObject } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ReactionKey } from "@/lib/reactions";
import { ReactionGrid } from "@/features/reactions/reaction-picker";

/**
 * The message reaction picker (docs/history/330-*): a message reaction is one of the six POST reactions, so this is the post picker's own
 * `ReactionGrid` in its one-row form — same animated emojis (Telegram's animation under the finger/pointer), same highlight on the caller's
 * current reaction, picking it again takes it back (the parent's `onSelect` toggles). The chosen reaction's animation + big effect play on
 * the message's reaction badge (`MessageReactionBadge`), where the reaction lands. Keyboard emoji (the composer's picker) is a different thing.
 */
export function MessageReactionPicker({
  myReaction,
  onSelect,
  panelRef,
  style,
  variant = "popover",
}: {
  myReaction: ReactionKey | null;
  onSelect: (reaction: ReactionKey) => void;
  /** Measured by `useAnchoredPopover`, which places the picker (fixed, in a portal) inside the visible chat area. */
  panelRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  /** `bar`: the large, full-width pill above the message in the long-press / ⋮ sheet (docs/history/290-*) — same reactions, same toggle rule. */
  variant?: "popover" | "bar";
}) {
  const isBar = variant === "bar";
  const { t } = useTranslation();

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t("reaction.pickerAria")}
      data-reaction-picker=""
      style={style}
      className={cn(
        isBar
          ? "rounded-full bg-surface-elevated/90 px-2 py-1 shadow-pop backdrop-blur-xl animate-pop-in origin-bottom"
          : // `w-max`: a fixed-position box with `width: auto` would stretch or wrap the row (a real bug once reported from a live screenshot).
            "z-50 w-max rounded-full border border-border-soft bg-surface px-1.5 py-1 shadow-pop animate-pop-in",
      )}
    >
      <ReactionGrid current={myReaction} compact={isBar ? 40 : 30} onChoose={(key) => key && onSelect(key)} />
    </div>
  );
}
