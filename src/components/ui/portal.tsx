"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders `children` into `document.body` instead of wherever this
 * component sits in the React tree. Needed for anything meant to overlay
 * the whole page (a modal, a dropdown that must escape a card) — a plain
 * `position: fixed`/`absolute` element still only paints within the
 * *stacking context* of its nearest ancestor that creates one (e.g. a
 * `relative z-10` card footer), so two z-50 overlays nested inside two
 * different cards can still end up painted in DOM order relative to each
 * other rather than by their own z-index. A portal sidesteps this
 * entirely by detaching the DOM node from that ancestry.
 *
 * Only mounts after the initial client render (`mounted` starts false) —
 * this app is a fully static export with no SSR, so `document` is always
 * defined by the time a portal actually needs to render (these are only
 * ever rendered in response to a click), but this guard keeps the
 * component safe to use even if that ever changes.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag so the portal only renders client-side, after document exists
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
