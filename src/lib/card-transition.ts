"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { MOTION_MS, prefersReducedMotion } from "@/lib/motion";

/**
 * Card → detail "shared element" for the cover image.
 *
 * Next's client navigation swaps the page, so there is no DOM element the
 * browser could morph. Instead the card remembers where its cover sat on
 * screen the moment it was clicked (`rememberCardMedia`), and the detail
 * page — when it mounts for the same href — plays the classic FLIP from that
 * rectangle to its own hero (`useCardMediaTransition`). Navigation itself is
 * untouched (the card's `<Link>` still does the routing); if the click didn't
 * come from a card with a cover, the memory is stale, the viewer prefers
 * reduced motion, or the detail renders after the 2s window, nothing happens
 * and the page just appears. The card also hands its post over
 * (`lib/detail-handoff.ts`), so the detail draws in the first frame.
 *
 * The way back (docs/history/209-*): when the detail page goes away its hero
 * remembers where it sat (`returning`), and the card for the same href — put
 * back at once by the list's history memory (`useFeedPages`) — plays the FLIP
 * the other way, from the hero's box down into its own cover
 * (`useCardMediaReturn`).
 */

interface Pending {
  href: string;
  rect: { left: number; top: number; width: number; height: number };
  at: number;
}

const TTL_MS = 2000;
let pending: Pending | null = null;
let returning: Pending | null = null;

/** Call from a card's click: remembers the cover's on-screen box for `href`. */
export function rememberCardMedia(href: string, media: Element | null) {
  pending = null;
  if (!media || prefersReducedMotion()) return;
  const rect = media.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return;
  pending = { href, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, at: performance.now() };
}

/** Is a transition waiting for this href? (Read during render to pick a gentler page entrance.) */
export function hasPendingCardTransition(href: string): boolean {
  return pending !== null && pending.href === href && performance.now() - pending.at < TTL_MS;
}

function takeCardTransition(href: string): Pending | null {
  if (!hasPendingCardTransition(href)) return null;
  const taken = pending;
  pending = null;
  return taken;
}

/** Attach the returned ref to the detail page's hero image box. */
export function useCardMediaTransition<T extends HTMLElement>(href: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const from = takeCardTransition(href);
    if (!from) return;
    const to = el.getBoundingClientRect();
    if (to.width < 40 || to.height < 40) return;

    // Uniform scale by width (never stretches the picture), then a clip to the height the card showed.
    const scale = from.rect.width / to.width;
    const shownHeight = Math.min(to.height, from.rect.height / scale);
    const dx = from.rect.left - to.left;
    const dy = from.rect.top - to.top;
    const previousOrigin = el.style.transformOrigin;
    const previousZ = el.style.zIndex;
    el.style.transformOrigin = "top left";
    el.style.zIndex = "5";
    const animation = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(0 0 ${to.height - shownHeight}px 0 round ${8 / scale}px)` },
        { transform: "translate(0px, 0px) scale(1)", clipPath: "inset(0 0 0 0 round 12px)" },
      ],
      { duration: MOTION_MS.emphasis + 80, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
    const restore = () => {
      el.style.transformOrigin = previousOrigin;
      el.style.zIndex = previousZ;
    };
    animation.addEventListener("finish", restore);
    animation.addEventListener("cancel", restore);
  }, [href]);

  // Leaving the page: remember where the hero sits, for the card's way back. Read before React detaches the DOM.
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      returning = null;
      if (!el || !el.isConnected || prefersReducedMotion()) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      returning = { href, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, at: performance.now() };
    };
  }, [href]);

  return ref;
}

/**
 * Put on a card: if the detail page for its `href` was just left (`returning`), its cover grows back from the hero's
 * box into its own. Measured one frame after mount, once the restored scroll position has been applied; a cover that
 * ends up off screen just appears.
 */
export function useCardMediaReturn(href: string, cardRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!returning || returning.href !== href || performance.now() - returning.at > TTL_MS) return;
    const from = returning;
    returning = null;
    const el = cardRef.current?.querySelector<HTMLElement>("[data-card-media]");
    if (!el || typeof el.animate !== "function") return;
    const previousOpacity = el.style.opacity;
    el.style.opacity = "0";
    const frame = requestAnimationFrame(() => {
      el.style.opacity = previousOpacity;
      const to = el.getBoundingClientRect();
      if (to.width < 40 || to.bottom <= 0 || to.top >= window.innerHeight) return;
      const scale = from.rect.width / to.width;
      const dx = from.rect.left - to.left;
      const dy = from.rect.top - to.top;
      const previousOrigin = el.style.transformOrigin;
      const previousZ = el.style.zIndex;
      el.style.transformOrigin = "top left";
      el.style.zIndex = "5";
      const animation = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "translate(0px, 0px) scale(1)" }],
        { duration: MOTION_MS.emphasis + 40, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
      );
      const restore = () => {
        el.style.transformOrigin = previousOrigin;
        el.style.zIndex = previousZ;
      };
      animation.addEventListener("finish", restore);
      animation.addEventListener("cancel", restore);
    });
    return () => {
      cancelAnimationFrame(frame);
      el.style.opacity = previousOpacity;
    };
  }, [href, cardRef]);
}
