"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** Mouse-class pointer: a wheel and a pressed button exist, a finger does not. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
/** Movement (px) before a press on a row becomes a drag instead of a click. */
const DRAG_THRESHOLD = 5;

/**
 * Makes a horizontally scrolling row usable with a mouse (docs/history/219-*). Phones scroll such a row with a finger, so nothing
 * changes there; on a desktop the bar is hidden and the wheel only scrolls the page, which left whatever sat past the edge unreachable:
 * - the vertical wheel scrolls the row sideways while it can still move that way (at either end the wheel goes back to the page);
 * - a mouse press-and-drag pans it (never touch/pen: those already pan natively); a drag that moved swallows the click that follows;
 * - `canPrev`/`canNext` say whether content is hidden on either side (edge fade, arrow buttons), kept current by scroll + resize;
 * - `scrollPage(direction)` moves by most of a row's width (arrow buttons).
 * `data-dragging` is set on the element while a drag runs (CSS drops scroll snapping then).
 */
export function useHorizontalScroll(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ canPrev: false, canNext: false });

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const fine = window.matchMedia(FINE_POINTER);

    const measure = () => {
      const max = row.scrollWidth - row.clientWidth;
      const canPrev = row.scrollLeft > 2;
      const canNext = row.scrollLeft < max - 2;
      setEdges((prev) => (prev.canPrev === canPrev && prev.canNext === canNext ? prev : { canPrev, canNext }));
    };
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    // Content changes (a strip filling after a fetch) resize the children, not the row itself.
    const observer = new ResizeObserver(measure);
    const watchChildren = () => {
      observer.observe(row);
      Array.from(row.children).forEach((child) => observer.observe(child));
    };
    watchChildren();
    const mutations = new MutationObserver(() => {
      watchChildren();
      measure();
    });
    mutations.observe(row, { childList: true });

    const onWheel = (event: WheelEvent) => {
      if (!fine.matches || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      if ((event.deltaY < 0 && row.scrollLeft <= 0) || (event.deltaY > 0 && row.scrollLeft >= max - 1)) return;
      event.preventDefault();
      // deltaMode 1 = lines (Firefox mouse wheels); a line is about one text row.
      row.scrollBy({ left: event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY, behavior: "instant" });
    };
    row.addEventListener("wheel", onWheel, { passive: false });

    let pressed = false;
    let dragged = false;
    let startX = 0;
    let startLeft = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || row.scrollWidth <= row.clientWidth) return;
      pressed = true;
      dragged = false;
      startX = event.clientX;
      startLeft = row.scrollLeft;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pressed) return;
      const delta = event.clientX - startX;
      if (!dragged && Math.abs(delta) > DRAG_THRESHOLD) {
        dragged = true;
        row.setPointerCapture(event.pointerId);
        row.dataset.dragging = "";
        window.getSelection()?.removeAllRanges();
      }
      if (dragged) row.scrollLeft = startLeft - delta;
    };
    const onPointerEnd = () => {
      pressed = false;
      delete row.dataset.dragging;
    };
    // A drag that moved must not also activate the link/button it ended on.
    const onClick = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // Native link/image dragging would take the pointer away from the pan (pointercancel).
    const onDragStart = (event: DragEvent) => event.preventDefault();
    row.addEventListener("pointerdown", onPointerDown);
    row.addEventListener("pointermove", onPointerMove);
    row.addEventListener("pointerup", onPointerEnd);
    row.addEventListener("pointercancel", onPointerEnd);
    row.addEventListener("click", onClick, true);
    row.addEventListener("dragstart", onDragStart);

    return () => {
      row.removeEventListener("scroll", measure);
      observer.disconnect();
      mutations.disconnect();
      row.removeEventListener("wheel", onWheel);
      row.removeEventListener("pointerdown", onPointerDown);
      row.removeEventListener("pointermove", onPointerMove);
      row.removeEventListener("pointerup", onPointerEnd);
      row.removeEventListener("pointercancel", onPointerEnd);
      row.removeEventListener("click", onClick, true);
      row.removeEventListener("dragstart", onDragStart);
    };
  }, [ref]);

  const scrollPage = useCallback(
    (direction: 1 | -1) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.8, behavior: "smooth" }),
    [ref],
  );

  return { ...edges, scrollPage };
}
