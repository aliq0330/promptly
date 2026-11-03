"use client";

import { useSyncExternalStore } from "react";

/** `min-width: <px>` eşleşiyor mu (sunucu/ilk boyamada `false`). Bildirim paneli (md ≥ 768) ve bölünmüş gelen kutusu (lg ≥ 1024) için. */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(`(min-width: ${px}px)`);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false,
  );
}
