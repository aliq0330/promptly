"use client";

import { useCallback, useEffect, useState } from "react";

export type LayoutMode = "mobile" | "tablet" | "desktop";

/**
 * Editor breakpoints, measured on the editor's OWN width — not the viewport.
 * The app shell already takes 256px (sidebar) or 72px (tablet rail) of the
 * viewport, so a viewport media query would pick three columns while only
 * ~880px are really available (the overflow this fixes).
 * mobile < 640, tablet 640–1079, desktop ≥ 1080.
 */
export const DESKTOP_MIN = 1080;
export const TABLET_MIN = 640;

export function modeForWidth(width: number): LayoutMode {
  return width >= DESKTOP_MIN ? "desktop" : width >= TABLET_MIN ? "tablet" : "mobile";
}

/** `[ref, mode]` — attach `ref` to the editor root. `mode` is `null` until measured (no wrong-layout flash). */
export function useLayoutMode(): [(node: HTMLElement | null) => void, LayoutMode | null] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<LayoutMode | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);
  useEffect(() => {
    if (!node) return;
    const update = () => setMode(modeForWidth(node.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [ref, mode];
}
