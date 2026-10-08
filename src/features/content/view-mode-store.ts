"use client";

import { useSyncExternalStore } from "react";

/**
 * "Kart" (the existing information-dense cards — the default) vs "Odak"
 * (Focus View: the content itself first). One session-wide preference shared
 * by every list page that offers the switcher.
 *
 * Persistence, in priority order:
 *  1. `?view=focus|card` in the URL (shareable; read once, on first use),
 *  2. `localStorage` (`promptly-view-mode`) — a UI preference only, never an
 *     auth signal,
 *  3. "card".
 * A change writes localStorage and mirrors itself into the current URL
 * (`?view=focus`; the param is dropped again for "card") WITHOUT touching any
 * other query param (search / filters / sort stay intact).
 *
 * Module singleton + `useSyncExternalStore` (same pattern as
 * `engagement-store.ts`): safe because the app is a static export — this
 * module only ever runs in one visitor's own tab. The server snapshot is
 * always "card", so hydration never mismatches; a returning focus-mode user
 * gets Focus right after hydration.
 */
export type ViewMode = "card" | "focus";

export const VIEW_MODE_STORAGE_KEY = "promptly-view-mode";

let mode: ViewMode | null = null;
const listeners = new Set<() => void>();

function parse(value: string | null | undefined): ViewMode | null {
  return value === "focus" || value === "card" ? value : null;
}

function resolve(): ViewMode {
  if (mode) return mode;
  if (typeof window === "undefined") return "card";
  let next: ViewMode | null = null;
  try {
    next = parse(new URLSearchParams(window.location.search).get("view"));
  } catch {
    /* malformed URL — fall through */
  }
  if (!next) {
    try {
      next = parse(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY));
    } catch {
      /* storage blocked (private window, site data cleared…) — the page works without it */
    }
  }
  mode = next ?? "card";
  return mode;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setViewMode(next: ViewMode): void {
  mode = next;
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
  } catch {
    /* ignore — the in-memory value still applies for this session */
  }
  try {
    const url = new URL(window.location.href);
    if (next === "focus") url.searchParams.set("view", "focus");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* ignore — URL mirroring is a convenience */
  }
  listeners.forEach((listener) => listener());
}

/** Current view mode (+ setter). "card" on the server and during hydration. */
export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  const current = useSyncExternalStore(subscribe, resolve, () => "card" as ViewMode);
  return [current, setViewMode];
}
