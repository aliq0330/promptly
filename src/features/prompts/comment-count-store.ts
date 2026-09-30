"use client";

import { useSyncExternalStore } from "react";

/**
 * Live comment-count deltas shared between `CommentSection` (which knows
 * when a comment is really posted/deleted) and every `CommentCountLink`
 * on the same page (which only knows the `comment_count` column it loaded
 * with). Keyed by the target's id; session-local, reset by a reload —
 * which re-reads the real column, so the delta never double-counts.
 */
const deltas = new Map<string, number>();
const listeners = new Set<() => void>();

export function bumpCommentCount(targetId: string, by: number) {
  deltas.set(targetId, (deltas.get(targetId) ?? 0) + by);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCommentCountDelta(targetId: string | undefined): number {
  return useSyncExternalStore(
    subscribe,
    () => (targetId ? deltas.get(targetId) ?? 0 : 0),
    () => 0,
  );
}
