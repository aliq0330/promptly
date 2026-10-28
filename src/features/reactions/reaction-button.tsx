"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Heart } from "lucide-react";
import { formatCount } from "@/lib/utils";
import { RollingCount } from "@/components/ui/like-toggle";
import { contentActionClassName } from "@/features/content/action-styles";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAnchoredPopover } from "@/features/messages/use-anchored-popover";
import { useLikeState } from "@/features/prompts/use-like-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { DEFAULT_REACTION, REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
import type { LikeableContentType } from "@/lib/supabase/likes";
import { ReactionIcon, type ReactionIconHandle } from "./reaction-icon";
import { ReactionPicker } from "./reaction-picker";
import { playReactionEffect } from "./reaction-player";

/**
 * The one reaction control of every like surface (docs/history/265-*; `LikeButton` is this): the first press likes (Sevdim) at once and opens
 * the six-reaction picker with it selected; the chosen emoji replaces the heart, plays its own animation and Telegram's big effect over the page. Every reaction is one like — the count
 * is the total and keeps its meaning. Signed out, it opens the login dialog (as the heart did). State and persistence: `useLikeState`.
 */
export function ReactionButton({
  id,
  likeCount,
  contentType = "prompt",
  size = 16,
  className,
}: {
  id: string;
  likeCount: number;
  contentType?: LikeableContentType;
  size?: number;
  className?: string;
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
    if (next !== null && next === reaction) {
      // Same emoji again: nothing to save, but it plays again.
      iconRef.current?.play();
      playReactionEffect(next, iconRef.current?.element() ?? anchorRef.current);
      return;
    }
    if (next !== null) playWhenShown.current = next;
    void react(next).then((result) => {
      if (result === "failed" || result === "ignored") playWhenShown.current = null;
    });
  }

  const classes = contentActionClassName(Boolean(reaction), className);

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
        <span aria-hidden>{formatCount(count)}</span>
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
          // First touch of the heart IS the like (the default reaction, with its effect); the picker opens beside it with that reaction
          // selected, to swap it if the viewer wants. With a reaction already given, the touch only opens/closes the picker.
          if (!open && reaction === null) {
            playWhenShown.current = DEFAULT_REACTION;
            void react(DEFAULT_REACTION).then((result) => {
              if (result === "failed" || result === "ignored") playWhenShown.current = null;
            });
          }
          setOpen((value) => !value);
        }}
        className={classes}
      >
        {reaction ? (
          <ReactionIcon ref={iconRef} reaction={reaction} size={size + 4} className="-my-1" />
        ) : (
          <Heart size={size} strokeWidth={1.75} />
        )}
        <RollingCount value={count} />
      </button>
      {/* `createPortal` directly (not `Portal`, which mounts one render late): the popover hook measures the panel in the commit that opens it. */}
      {open && createPortal(<ReactionPicker panelRef={panelRef} style={style} current={reaction} onChoose={choose} />, document.body)}
    </>
  );
}
