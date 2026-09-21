"use client";

import { useEffect } from "react";
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

function lockBodyScroll() {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlockBodyScroll() {
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
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    lockBodyScroll();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      unlockBodyScroll();
    };
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={onClose}
      >
        {children}
      </div>
    </Portal>
  );
}
