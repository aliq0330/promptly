"use client";

import { useEffect, useState } from "react";

export type LayoutMode = "mobile" | "tablet" | "desktop";

/** Editor breakpoints: mobile < 768, tablet 768–1199, desktop ≥ 1200. `null` until mounted (no wrong-layout flash). */
export function useLayoutMode(): LayoutMode | null {
  const [mode, setMode] = useState<LayoutMode | null>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1200px)");
    const tablet = window.matchMedia("(min-width: 768px)");
    const update = () => setMode(desktop.matches ? "desktop" : tablet.matches ? "tablet" : "mobile");
    update();
    desktop.addEventListener("change", update);
    tablet.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
    };
  }, []);
  return mode;
}
