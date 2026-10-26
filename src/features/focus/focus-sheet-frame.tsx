"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The sheet Odak opens over a post (docs/history/200-*, 239-*): from the bottom on a phone (the post shrinks into the space
 * above it — `FocusScreen`), a 420px panel on the right from `md`. Shared by the comments and the post's info: the handle +
 * title + close X header (drag it down to close), the keyboard offset, the entrance animation and the focus hand-over.
 * `kind` only marks the box for the tests / the shrink measurement (`data-focus-sheet` on both).
 */

/** How far the on-screen keyboard covers the layout viewport (iOS Safari keeps fixed boxes behind it). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** Drag-down-to-close on the sheet's handle (touch / pen / mouse): it follows the pointer and closes past a distance or a flick. */
function useDragToClose(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    start.current = { y: event.clientY, t: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!start.current) return;
    setOffset(Math.max(0, event.clientY - start.current.y));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!start.current) return;
    const distance = event.clientY - start.current.y;
    const velocity = distance / Math.max(1, performance.now() - start.current.t);
    start.current = null;
    if (distance > 120 || velocity > 0.6) onClose();
    else setOffset(0);
  };
  return { offset, dragging: offset > 0, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

export function FocusSheetFrame({
  kind,
  titleId,
  title,
  closeLabel,
  onClose,
  children,
}: {
  kind: "comments" | "info";
  titleId: string;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset();
  const drag = useDragToClose(onClose);
  const kindAttribute = kind === "comments" ? { "data-focus-comments": "" } : { "data-focus-info": "" };

  // Focus moves into the sheet when it opens and back to the button that opened it when it closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-focus-sheet
      {...kindAttribute}
      className={cn(
        // Outer box: place + drag / keyboard offset. The entrance animation runs on the inner box (an animation's end
        // state would otherwise override this transform).
        "absolute inset-x-0 bottom-0 z-40 h-[65dvh] max-h-[calc(100dvh-5rem)] outline-none",
        "md:inset-y-0 md:left-auto md:right-0 md:h-auto md:max-h-none md:w-[420px]",
        !drag.dragging && "transition-transform duration-200 ease-soft",
      )}
      style={{ transform: drag.offset || keyboard ? `translateY(${drag.offset - keyboard}px)` : undefined }}
    >
      <div
        className={cn(
          "flex h-full flex-col rounded-t-[28px] border-t border-border-soft bg-surface text-text shadow-pop",
          "animate-sheet-up motion-reduce:animate-none md:animate-panel-in md:rounded-none md:rounded-l-3xl md:border-l md:border-t-0",
        )}
      >
        {/* Handle + title: the drag area. */}
        <div className="relative shrink-0 touch-none select-none px-4 pb-2 pt-2.5" {...drag.handlers}>
          <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-border-strong md:hidden" />
          <div className="mt-2 flex items-center justify-center md:mt-1 md:justify-start">
            <h2 id={titleId} className="text-label font-semibold text-text">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute right-2.5 top-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
