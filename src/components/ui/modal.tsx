"use client";

import { useEffect, useRef } from "react";
import { Portal } from "./portal";

/**
 * Module-level (not React state) reference-counted body scroll lock — a
 * plain counter survives multiple Modal instances mounting/unmounting in
 * any order without each one needing to know about the others, and never
 * fights over whose `useEffect` runs last. Unlocks only when the count
 * genuinely reaches zero, so closing one modal never re-enables scroll
 * while another is still open.
 */
let lockCount = 0;
let previousBodyOverflow = "";

/** Exported for `ImageLightbox` — the same shared, ref-counted lock, not a second one. */
export function lockBodyScroll() {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

/**
 * Open modals, oldest first. Escape closes only the TOPMOST one, so a modal
 * opened from inside another (field editor over the preset panel, say) closes
 * alone instead of taking its parent down with it.
 */
const openModals: symbol[] = [];

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

/**
 * Shared modal shell: portals to `document.body` (see portal.tsx — this is
 * what actually fixes a modal opened from inside a prompt card rendering
 * behind/under other cards' content, since it's no longer trapped in that
 * card's `relative z-10` footer stacking context), dims + blocks the
 * background, locks page scroll while open, and closes on Escape or a
 * backdrop click. `children` is the modal panel itself (its own
 * `bg-surface`/width/`onClick` stopPropagation) — this component only owns
 * the parts that were actually broken (stacking, scroll, escape), not the
 * panel's own layout, so each modal keeps its own content shape.
 */
export function Modal({
  onClose,
  labelledBy,
  children,
  variant = "dialog",
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  /**
   * `dialog` (varsayılan): mobilde alt sayfa, `sm`+ ortalanmış pencere.
   * `sheet`: HER genişlikte alta yapışık alt sayfa (Bottom Sheet) — çocuk
   *   kendi `max-h`/kaydırmasını verir.
   * `side`: sağa yapışık, tam yükseklikte panel (masaüstü/yatay tablet).
   */
  variant?: "dialog" | "sheet" | "side";
}) {
  // Registered once per mount (not per `onClose` identity) so a parent
  // re-rendering never re-orders the stack and steals Escape from its child.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    lockBodyScroll();
    const id = Symbol("modal");
    openModals.push(id);
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && openModals[openModals.length - 1] === id) onCloseRef.current();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      const index = openModals.indexOf(id);
      if (index >= 0) openModals.splice(index, 1);
      unlockBodyScroll();
    };
  }, []);

  // Layout: a vertical flex column where the panel row uses auto margins
  // (never `items-center`/`items-end`, which clip the top of a panel taller
  // than the viewport so it can't be scrolled into view).
  //   - mobile (<sm): the panel docks to the bottom edge as a sheet —
  //     full width, square bottom corners, slides up.
  //   - sm and up:   a centered dialog that fades + scales in.
  // Every panel in the app is `w-full max-w-* rounded-lg border ... shadow-lg`,
  // so the sheet treatment is applied with direct-child (`*:`) variants here
  // instead of editing each modal.
  if (variant !== "dialog") {
    const isSide = variant === "side";
    return (
      <Portal>
        <div
          className={
            "fixed inset-0 z-50 flex animate-fade-in bg-[rgb(10_8_20/0.45)] backdrop-blur-[2px] " +
            (isSide ? "justify-end" : "flex-col justify-end")
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          onClick={onClose}
        >
          <div
            className={isSide ? "flex h-full animate-panel-in" : "flex w-full justify-center animate-sheet-up"}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </div>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[rgb(10_8_20/0.45)] animate-fade-in backdrop-blur-[2px] sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={onClose}
      >
        <div
          className={
            "mt-auto flex w-full justify-center animate-sheet-up sm:mb-auto sm:animate-pop-in " +
            "*:shadow-pop max-sm:*:max-w-none max-sm:*:rounded-b-none max-sm:*:border-x-0 max-sm:*:border-b-0 " +
            "max-sm:*:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          }
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}
