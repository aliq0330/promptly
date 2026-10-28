"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ReactionKey } from "@/lib/reactions";
import { canAnimateReactions, playReactionIn, reactionAssetUrl, type ReactionPlayback } from "./reaction-player";

export interface ReactionIconHandle {
  /** Plays the emoji's own animation once (then back to its resting frame). Nothing happens where animations are off. */
  play(): void;
  /** The element to centre the big effect on. */
  element(): HTMLElement | null;
}

/**
 * One reaction emoji: the static poster (a plain `<img>`, nothing to load), and — only when `play()` is called — Telegram's animated
 * version drawn over it for one run. Used by the button, the picker, the summary and the "who reacted" list.
 */
export const ReactionIcon = forwardRef<ReactionIconHandle, { reaction: ReactionKey; size: number; className?: string }>(function ReactionIcon(
  { reaction, size, className },
  ref,
) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const playback = useRef<ReactionPlayback | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    playback.current?.destroy();
    playback.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    const layer = layerRef.current;
    if (!layer || !canAnimateReactions()) return;
    playback.current?.destroy();
    layer.textContent = "";
    setPlaying(true);
    playback.current = playReactionIn(layer, reaction, "emoji", stop);
  }, [reaction, stop]);

  useImperativeHandle(ref, () => ({ play, element: () => rootRef.current }), [play]);
  // A different reaction, or leaving the page: the running animation belongs to the old one.
  useEffect(() => stop, [reaction, stop]);

  return (
    <span ref={rootRef} className={cn("relative inline-block shrink-0 align-middle", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG from /public; next/image adds nothing here */}
      <img src={reactionAssetUrl(reaction, "poster")} alt="" width={size} height={size} draggable={false} className={cn("absolute inset-0 size-full select-none", playing && "opacity-0")} />
      <span ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0 [&>svg]:size-full" />
    </span>
  );
});
