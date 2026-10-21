/**
 * Where a small popover (a chat message's ⋮ menu or emoji picker, docs/history/212-*) goes so that it stays inside the area
 * the reader can actually see — pure, so it is unit-testable without a browser (`popover-position.test.ts`).
 *
 * All rectangles are in the same client coordinates (`getBoundingClientRect`; `position: fixed` uses the same frame).
 * `bounds` is the visible region: the scrolling message list intersected with the visual viewport (so the fixed chat header,
 * the composer, the iOS keyboard and the browser bars are all outside it).
 *
 * Vertical: below the anchor when it fits, else above when that fits, else on the roomier side with `maxHeight` set to that
 * room (the panel scrolls inside itself). Horizontal: the preferred edge (`end` = right edges aligned, `start` = left edges
 * aligned), then clamped into the bounds; a panel wider than the bounds gets `maxWidth`.
 */

export interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface PopoverPlacement {
  top: number;
  left: number;
  side: "below" | "above";
  /** Only when the panel does not fit on either side as is. */
  maxHeight: number | null;
  maxWidth: number | null;
}

/** Below this much room on the chosen side, the panel is laid over the whole visible area instead (still scrollable). */
const MIN_USEFUL_HEIGHT = 120;

export function computePopoverPlacement(params: {
  anchor: Box;
  panel: { width: number; height: number };
  bounds: Box;
  align: "start" | "end";
  /** Space between the anchor and the panel. */
  gap?: number;
  /** Space kept between the panel and the edges of `bounds`. */
  margin?: number;
}): PopoverPlacement {
  const gap = params.gap ?? 6;
  const margin = params.margin ?? 8;
  const inner: Box = {
    top: params.bounds.top + margin,
    left: params.bounds.left + margin,
    bottom: params.bounds.bottom - margin,
    right: params.bounds.right - margin,
  };
  const innerHeight = Math.max(0, inner.bottom - inner.top);
  const innerWidth = Math.max(0, inner.right - inner.left);
  // The anchor is kept on screen by its own (sticky) placement; still clamp it, so a half-hidden anchor never pushes the panel out.
  const anchorTop = clamp(params.anchor.top, inner.top, inner.bottom);
  const anchorBottom = clamp(params.anchor.bottom, inner.top, inner.bottom);

  const roomBelow = inner.bottom - (anchorBottom + gap);
  const roomAbove = anchorTop - gap - inner.top;
  const height = params.panel.height;

  let top: number;
  let side: PopoverPlacement["side"];
  let maxHeight: number | null = null;
  if (height <= roomBelow) {
    side = "below";
    top = anchorBottom + gap;
  } else if (height <= roomAbove) {
    side = "above";
    top = anchorTop - gap - height;
  } else if (Math.max(roomBelow, roomAbove) >= MIN_USEFUL_HEIGHT) {
    side = roomBelow >= roomAbove ? "below" : "above";
    maxHeight = Math.floor(side === "below" ? roomBelow : roomAbove);
    top = side === "below" ? anchorBottom + gap : inner.top;
  } else {
    // Hardly any room on either side (a very short visible area, e.g. the keyboard is open): use the whole visible area.
    side = roomBelow >= roomAbove ? "below" : "above";
    maxHeight = Math.floor(innerHeight);
    top = height <= innerHeight ? clamp(side === "below" ? anchorBottom + gap : anchorTop - gap - height, inner.top, inner.bottom - height) : inner.top;
  }

  const width = Math.min(params.panel.width, innerWidth);
  const preferredLeft = params.align === "end" ? params.anchor.right - width : params.anchor.left;
  const left = clamp(preferredLeft, inner.left, inner.right - width);

  return {
    top: Math.round(top),
    left: Math.round(left),
    side,
    maxHeight,
    maxWidth: params.panel.width > innerWidth ? Math.floor(innerWidth) : null,
  };
}

/** Whether any part of `box` is inside `bounds` (a popover whose anchor scrolled fully away is closed). */
export function boxIntersects(box: Box, bounds: Box): boolean {
  return box.bottom > bounds.top && box.top < bounds.bottom && box.right > bounds.left && box.left < bounds.right;
}

/** The intersection of two boxes (an empty one collapses to zero size at `a`'s edge). */
export function intersectBoxes(a: Box, b: Box): Box {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  return { top, left, bottom: Math.max(top, Math.min(a.bottom, b.bottom)), right: Math.max(left, Math.min(a.right, b.right)) };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
