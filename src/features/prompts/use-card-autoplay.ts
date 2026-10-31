"use client";

import { useEffect, useId, useSyncExternalStore, type RefObject } from "react";
import { isPlaybackActive, registerPlaybackCard, subscribePlayback } from "@/lib/card-playback";

/**
 * A list card whose video / audio plays by itself: registers the card's box with the one playback manager
 * (`lib/card-playback.ts`) and tells whether THIS card is the one that should be playing now (the most central of the cards
 * that are mostly in view; only one at a time). `enabled` = the card has something to play.
 */
export function useCardAutoplay(ref: RefObject<Element | null>, enabled: boolean): { id: string; active: boolean } {
  const id = useId();
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    return registerPlaybackCard(id, element);
  }, [id, enabled, ref]);
  const active = useSyncExternalStore(
    subscribePlayback,
    () => isPlaybackActive(id),
    () => false,
  );
  return { id, active };
}
