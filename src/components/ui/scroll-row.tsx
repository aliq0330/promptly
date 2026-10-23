"use client";

import { forwardRef, useImperativeHandle, useRef, type HTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHorizontalScroll } from "@/lib/use-horizontal-scroll";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

const ARROW =
  "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border-soft bg-surface text-text-secondary shadow-card " +
  "pointer-events-none opacity-0 transition-[opacity,color] duration-200 ease-soft pointer-fine:flex hover:text-text " +
  "group-hover/scroll-row:pointer-events-auto group-hover/scroll-row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

interface ScrollRowProps extends HTMLAttributes<HTMLElement> {
  /** The scrolling element: a plain row, or the list/nav a strip already was. */
  as?: "div" | "ul" | "ol" | "nav" | "section";
  /** Layout classes that belong to the row's slot in its parent (`flex-1`, `min-w-0`, order…); `className` styles the scroller itself. */
  wrapperClassName?: string;
  /** Hover arrows (mouse only). Off where the row has arrows of its own. */
  arrows?: boolean;
}

/**
 * The one horizontal strip (docs/history/219-*): scrolls with a finger on a phone and, on a desktop, with the wheel, a mouse drag or
 * arrow buttons that appear on hover — `scrollbar-none` rows alone left their overflow unreachable with a mouse. A soft fade marks
 * the side that still has content. Write a strip as `<ScrollRow className="gap-3 -mx-3 px-3 sm:mx-0 sm:px-0">…</ScrollRow>`;
 * a ref reaches the scrolling element (`scrollLeft`, `querySelector`).
 */
export const ScrollRow = forwardRef<HTMLElement, ScrollRowProps>(function ScrollRow(
  { as, wrapperClassName, arrows = true, className, children, ...rest },
  forwardedRef,
) {
  const { t } = useTranslation();
  // Typed as a div: the other tags take the same props and a ref to an HTMLElement all the same.
  const Tag = (as ?? "div") as "div";
  const rowRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => rowRef.current as HTMLElement);
  const { canPrev, canNext, scrollPage } = useHorizontalScroll(rowRef);

  return (
    <div className={cn("group/scroll-row relative min-w-0", wrapperClassName)}>
      <Tag
        ref={rowRef}
        data-scroll-row=""
        data-scrollable={canPrev || canNext ? "" : undefined}
        data-fade-prev={canPrev ? "" : undefined}
        data-fade-next={canNext ? "" : undefined}
        className={cn(
          "scroll-row-fade scrollbar-none flex touch-pan-x overflow-x-auto overscroll-x-contain",
          "pointer-fine:data-scrollable:cursor-grab data-dragging:cursor-grabbing data-dragging:snap-none data-dragging:select-none data-dragging:*:pointer-events-none",
          className,
        )}
        {...rest}
      >
        {children}
      </Tag>
      {arrows && canPrev && (
        <button type="button" onClick={() => scrollPage(-1)} aria-label={t("scrollRow.prev")} className={cn(ARROW, "left-1")}>
          <ChevronLeft size={18} aria-hidden />
        </button>
      )}
      {arrows && canNext && (
        <button type="button" onClick={() => scrollPage(1)} aria-label={t("scrollRow.next")} className={cn(ARROW, "right-1")}>
          <ChevronRight size={18} aria-hidden />
        </button>
      )}
    </div>
  );
});
