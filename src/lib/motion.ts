"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Promptly's motion language, in one place.
 *
 * The same three durations live in CSS as `--motion-fast / --motion-normal /
 * --motion-emphasis` (globals.css) — keep the two in sync. Use `fast` for
 * press/toggle feedback, `normal` for menus, tabs and colour/state changes,
 * `emphasis` for things that arrive (cards, DNA nodes, assembled prompt).
 * Hard rule: motion explains a state change or an arrival; nothing loops
 * on a content surface.
 */
export const MOTION_MS = { fast: 140, normal: 220, emphasis: 340 } as const;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `prefers-reduced-motion: reduce` as external state. `false` on the server
 * and the first paint (the CSS rule in globals.css already neutralises
 * animations before JS runs), then the real value. JS-driven decorations
 * (particles, sweeps, staggered reveals) read this and skip themselves.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(REDUCED_QUERY);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/** Non-hook read for event handlers (FLIP, imperative effects). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches;
}
