"use client";

import { useEffect, useSyncExternalStore } from "react";
import { emptyCounts, shiftCounts, type ReactionCounts, type ReactionFriend, type ReactionKey } from "@/lib/reactions";
import { fetchReactionCounts, fetchReactionFriends } from "@/lib/supabase/reactions";
import type { LikeableContentType } from "@/lib/supabase/likes";

/**
 * Session-wide breakdown of one target's reactions (per-reaction counts + the people the viewer follows who reacted), next to
 * `engagement-store` (which owns the TOTAL and the viewer's own reaction). Loaded once per target per session (batched across a feed
 * page), shifted optimistically when the viewer reacts, then refreshed quietly from the server. Same module-singleton reasoning as
 * `engagement-store`: this is a static export, the module only ever lives in one visitor's tab.
 */
export interface Breakdown {
  counts: ReactionCounts;
  friends: ReactionFriend[];
  loaded: boolean;
}

const EMPTY: Breakdown = { counts: emptyCounts(), friends: [], loaded: false };
const store = new Map<string, Breakdown>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();

const keyOf = (contentType: LikeableContentType, id: string) => `${contentType}:${id}`;

function notify(key: string) {
  for (const fn of listeners.get(key) ?? []) fn();
}

function subscribe(key: string, onChange: () => void) {
  let subs = listeners.get(key);
  if (!subs) {
    subs = new Set();
    listeners.set(key, subs);
  }
  subs.add(onChange);
  return () => {
    subs!.delete(onChange);
    if (subs!.size === 0) listeners.delete(key);
  };
}

async function load(contentType: LikeableContentType, id: string, userId: string | null) {
  const key = keyOf(contentType, id);
  if (loading.has(key)) return;
  loading.add(key);
  try {
    const [counts, friends] = await Promise.all([fetchReactionCounts(id), fetchReactionFriends(id, userId)]);
    store.set(key, { counts: counts ?? emptyCounts(), friends, loaded: true });
    notify(key);
  } finally {
    loading.delete(key);
  }
}

/** The viewer changed their reaction (`null` = none): move the counts right away; `refreshBreakdown` then confirms them. */
export function shiftBreakdown(contentType: LikeableContentType, id: string, from: ReactionKey | null, to: ReactionKey | null) {
  const key = keyOf(contentType, id);
  const prev = store.get(key);
  if (!prev?.loaded) return;
  store.set(key, { ...prev, counts: shiftCounts(prev.counts, from, to) });
  notify(key);
}

/** Re-reads the server's counts quietly (no loading state), e.g. after the viewer's own change was saved. */
export async function refreshBreakdown(contentType: LikeableContentType, id: string, userId: string | null) {
  const key = keyOf(contentType, id);
  if (!store.get(key)?.loaded) return;
  await load(contentType, id, userId);
}

/** The target's breakdown; asks for it the first time `enabled` (a target with no reactions has nothing to load). */
export function useReactionBreakdown(contentType: LikeableContentType, id: string, userId: string | null, enabled: boolean): Breakdown {
  const key = keyOf(contentType, id);
  useEffect(() => {
    if (enabled && !store.get(key)?.loaded) void load(contentType, id, userId);
  }, [enabled, key, contentType, id, userId]);
  return useSyncExternalStore(
    (onChange) => subscribe(key, onChange),
    () => store.get(key) ?? EMPTY,
    () => EMPTY,
  );
}
