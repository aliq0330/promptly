"use client";

import { useEffect, type RefObject } from "react";

/**
 * Masaüstü klavye kısayolları (docs/history/326-*): J/K kartlar arasında gezinir. Kart içinde L = hızlı beğen, R = yanıtla, E = okundu
 * (kartın kendi `onKeyDown`'ı). Bir yazma alanındayken hiçbiri çalışmaz. Yalnız kapsayıcı odaktayken dinler.
 */
export function useListShortcuts(container: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const root = container.current;
      if (!root) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return;
      if (active.matches("input, textarea, select, [contenteditable='true']")) return;
      const step = event.key === "j" ? 1 : event.key === "k" ? -1 : 0;
      if (!step) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>("[data-notification-card], [data-notification-row]"));
      const current = active.closest<HTMLElement>("[data-notification-card], [data-notification-row]");
      const index = current ? items.indexOf(current) : -1;
      const next = items[Math.min(Math.max(index + step, 0), items.length - 1)];
      if (next) {
        next.focus();
        next.scrollIntoView({ block: "nearest" });
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [container, enabled]);
}
