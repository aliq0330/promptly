"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared, session-wide (module-singleton) state for beğeni/kaydetme/takip
 * counts and the viewer's own active/participation flag — fixes a real,
 * user-reported bug: `useLikeState`/`useSaveState`/`useFollowState` used to
 * keep their optimistic count purely in that ONE component instance's own
 * `useState`. Liking a card bumped that card's own count to 1, but a
 * brand-new `LikeButton` instance mounted later for the SAME id (e.g. after
 * navigating to the detail page) started from whatever stale `likeCount`
 * the cached `Prompt`/`Generator`/`Workflow` object still carried (0) — the
 * count only became correct again after a full reload re-fetched the row.
 * This store is the real fix: once ANY component for an id has mounted this
 * session, its count lives HERE, not in a per-component prop, so every
 * later mount (same page or a different route entirely) reads the same,
 * live value. Postgres Changes (CLAUDE.md's new engagement-realtime-
 * provider.tsx) also writes into this same store, so another user's
 * action/another tab's action converges here too, without any extra
 * plumbing at the call sites.
 *
 * This is a plain client-only singleton (no React Context) — safe because
 * this app is `output: "export"` (fully static, no SSR data fetching): the
 * module only ever runs inside one visitor's own browser tab, never shared
 * across requests/users the way a Node server process's module state would
 * be. Same pattern as `useTagCatalog()`'s module-level cache.
 */

export type EngagementKind = "like" | "save" | "follow";

interface Entry {
  count: number;
  /** isLiked / isSaved / isFollowing. */
  active: boolean;
  /** Whether `active` has been resolved for the current viewer yet (vs. just defaulting to false pre-fetch). */
  activeChecked: boolean;
}

const EMPTY_ENTRY: Entry = { count: 0, active: false, activeChecked: false };

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function keyOf(kind: EngagementKind, scope: string, id: string): string {
  return `${kind}:${scope}:${id}`;
}

function notify(key: string) {
  const subs = listeners.get(key);
  if (!subs) return;
  for (const fn of subs) fn();
}

function subscribeKey(key: string, onChange: () => void): () => void {
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

/**
 * Seeds this key's count ONLY if nothing has claimed it yet this session —
 * called synchronously during render (not in an effect) so the very first
 * paint never flashes 0 before a resync. Never overwrites an entry another
 * component instance already seeded/updated for the same id: that "the
 * shared store wins over a possibly-stale prop" rule is the actual bug fix.
 */
function ensureSeeded(key: string, baseCount: number) {
  if (!store.has(key)) {
    store.set(key, { count: Math.max(0, baseCount), active: false, activeChecked: false });
  }
}

function getSnapshot(key: string): Entry {
  return store.get(key) ?? EMPTY_ENTRY;
}

function readActive(key: string): { active: boolean; activeChecked: boolean } {
  const entry = store.get(key);
  return entry ? { active: entry.active, activeChecked: entry.activeChecked } : { active: false, activeChecked: false };
}

/** Records the viewer's real like/save/follow state once it's been fetched — never a guess. */
function setActive(key: string, active: boolean) {
  const prev = store.get(key) ?? EMPTY_ENTRY;
  store.set(key, { ...prev, active, activeChecked: true });
  notify(key);
}

/**
 * Overwrites the count with an authoritative, server-confirmed value (the
 * Realtime provider's job — it reads `like_count`/`save_count`/
 * `follower_count` straight off a Postgres Changes UPDATE payload). A plain
 * overwrite, not a delta, so an echo of this viewer's own just-applied
 * optimistic change is harmless — it just converges to the same number.
 * No-ops for a key nothing has seeded yet (nobody's watching it this
 * session, so there's nothing to correct, and seeding from a live event
 * alone would risk showing a lone delta instead of this entity's real
 * total if `baseCount` never seeded it with the right starting point).
 */
function setCount(key: string, count: number) {
  const prev = store.get(key);
  if (!prev) return;
  if (prev.count === count) return;
  store.set(key, { ...prev, count: Math.max(0, count) });
  notify(key);
}

/** Optimistic, locally-initiated toggle: flips `active` and adjusts the count by `delta` (±1) in one update/notify. */
function applyToggle(key: string, active: boolean, delta: number) {
  const prev = store.get(key) ?? EMPTY_ENTRY;
  store.set(key, { active, activeChecked: true, count: Math.max(0, prev.count + delta) });
  notify(key);
}

export function useEngagementEntry(kind: EngagementKind, scope: string, id: string, baseCount: number): Entry {
  const key = keyOf(kind, scope, id);
  ensureSeeded(key, baseCount);
  return useSyncExternalStore(
    (onChange) => subscribeKey(key, onChange),
    () => getSnapshot(key),
  );
}

export const engagementStore = {
  keyOf,
  readActive,
  setActive,
  setCount,
  applyToggle,
};
