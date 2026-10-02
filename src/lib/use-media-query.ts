"use client";

import { useCallback, useSyncExternalStore } from "react";

/** `matchMedia` as external state — `false` during SSR / the first paint, then the real value (no layout flash from a wrong initial guess). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
