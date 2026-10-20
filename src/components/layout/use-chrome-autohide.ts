"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Scroll this far (px, in one direction) before the bars react — a finger's jitter never toggles them. */
const SCROLL_THRESHOLD = 8;
/** Near the top of the page the bars always show. */
const TOP_ZONE = 64;

/**
 * Hides the app's bars while the page scrolls down and brings them back on the way up: sets `html[data-chrome-hidden]`,
 * the CSS (`globals.css`) slides the header up and the bottom nav down while they fade (the header only below `lg`; the
 * sidebar never moves). A pinned detail actions row follows the nav down to the screen's edge (`[data-detail-dock]`).
 * No React state — one attribute, so scrolling re-renders nothing. Reset on every navigation; chats (`/messages`) scroll
 * inside their own panel and keep the bars.
 */
export function useChromeAutoHide() {
  const pathname = usePathname() ?? "";
  const enabled = !pathname.startsWith("/messages");

  useEffect(() => {
    const root = document.documentElement;
    const setHidden = (hidden: boolean) => root.toggleAttribute("data-chrome-hidden", hidden);
    setHidden(false);
    if (!enabled) return;

    let anchorY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const maxY = root.scrollHeight - window.innerHeight;
      // iOS rubber-banding past either end is not a direction change.
      if (y < 0 || y > maxY) return;
      if (y <= TOP_ZONE) {
        setHidden(false);
        anchorY = y;
        return;
      }
      const delta = y - anchorY;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      setHidden(delta > 0);
      anchorY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      setHidden(false);
    };
  }, [pathname, enabled]);
}
