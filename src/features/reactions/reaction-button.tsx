"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Heart } from "lucide-react";
import { formatCount } from "@/lib/utils";
import { RollingCount } from "@/components/ui/like-toggle";
import { contentActionClassName, overlayActionClassName } from "@/features/content/action-styles";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAnchoredPopover } from "@/features/messages/use-anchored-popover";
import { useLikeState } from "@/features/prompts/use-like-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
import type { LikeableContentType } from "@/lib/supabase/likes";
import { ReactionIcon, type ReactionIconHandle } from "./reaction-icon";
import { ReactionPicker } from "./reaction-picker";
import { playReactionEffect } from "./reaction-player";

/**
 * The one reaction control of every like surface (docs/history/265-*; `LikeButton` is this): the press opens the six-reaction picker (nothing is
 * selected or liked until an emoji is picked; picking your current one again takes it back); the chosen emoji replaces the heart, plays its own animation and Telegram's big effect over the page. Every reaction is one like — the count
 * is the total and keeps its meaning. Signed out, it opens the login dialog (as the heart did). State and persistence: `useLikeState`.
 */
export function ReactionButton({
  id,
  likeCount,
  contentType = "prompt",
  size = 16,
  className,
  tone = "default",
}: {
  id: string;
  likeCount: number;
  contentType?: LikeableContentType;
  size?: number;
  className?: string;
  /** "overlay": a translucent pill for laying over a picture; the count is left out while it is 0. */
  tone?: "default" | "overlay";
}) {
  const { reaction, likeCount: count, react, canLike } = useLikeState(id, likeCount, contentType);
  const { t } = useTranslation();
  const { requireAuth } = useAuthPrompt();
  const [open, setOpen] = useState(false);
  const closePicker = useCallback(() => setOpen(false), []);
  const { anchorRef, panelRef, style } = useAnchoredPopover({ open, align: "start", onAway: closePicker });
  const iconRef = useRef<ReactionIconHandle>(null);
  const openedByKeyboard = useRef(false);
  /** The reaction whose animation + effect play as soon as the icon shows it (the first reaction swaps the heart for the emoji). */
  const playWhenShown = useRef<ReactionKey | null>(null);

  useEffect(() => {
    if (playWhenShown.current && playWhenShown.current === reaction) {
      playWhenShown.current = null;
      iconRef.current?.play();
      playReactionEffect(reaction, iconRef.current?.element() ?? anchorRef.current);
    }
  }, [reaction, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      anchorRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // The panel stays hidden until the popover hook has measured it (the commit after this one): focus it on the next frame, when it is shown.
    const frame = openedByKeyboard.current ? requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()) : 0;
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, panelRef, anchorRef]);

  function choose(next: ReactionKey | null) {
    setOpen(false);
    anchorRef.current?.focus({ preventScroll: true });
    // Picking the reaction you already gave takes it back (the picker marks it as selected).
    if (next !== null && next === reaction) next = null;
    if (next !== null) playWhenShown.current = next;
    void react(next).then((result) => {
      if (result === "failed" || result === "ignored") playWhenShown.current = null;
    });
  }

  const overlay = tone === "overlay";
  const classes = overlay ? overlayActionClassName(className) : contentActionClassName(Boolean(reaction), className);
  const showCount = !overlay || count > 0;

  if (!canLike) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          requireAuth("like");
        }}
        aria-haspopup="dialog"
        title={t("prompt.loginToLike")}
        aria-label={t("prompt.loginToLikeAria", { count })}
        className={classes}
      >
        <Heart size={size} strokeWidth={1.75} />
        {showCount && <span aria-hidden>{formatCount(count)}</span>}
      </button>
    );
  }

  const label = reaction ? t("reaction.changeAria", { reaction: t(REACTION_LABEL[reaction]), count }) : t("reaction.buttonAria", { count });
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={reaction ? t(REACTION_LABEL[reaction]) : t("reaction.add")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openedByKeyboard.current = event.detail === 0;
          // The touch only opens/closes the picker: nothing is liked until an emoji is picked.
          setOpen((value) => !value);
        }}
        className={classes}
      >
        {reaction ? (
          <ReactionIcon ref={iconRef} reaction={reaction} size={size + 4} className="-my-1" />
        ) : (
          <Heart size={size} strokeWidth={1.75} />
        )}
        {showCount && <RollingCount value={count} />}
      </button>
      {/* `createPortal` directly (not `Portal`, which mounts one render late): the popover hook measures the panel in the commit that opens it. */}
      {open && createPortal(<ReactionPicker panelRef={panelRef} style={style} current={reaction} onChoose={choose} />, document.body)}
    </>
  );
}
