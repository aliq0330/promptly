import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { boxIntersects, computePopoverPlacement, intersectBoxes, type Box } from "@/lib/popover-position";

/** The chat's scrolling message list (`LocalConversationView`); popovers stay inside what it shows. */
export const CHAT_SCROLL_ATTR = "data-chat-scroll";

const HIDDEN: CSSProperties = { position: "fixed", top: 0, left: 0, visibility: "hidden" };

/**
 * The visible region a message popover may use, in client coordinates: the visual viewport (what is really on screen —
 * on iOS Safari it shrinks/moves with the keyboard and the collapsing address bar while `position: fixed` and
 * `getBoundingClientRect` stay in the layout viewport's frame, so its offset is added) intersected with the scrolling
 * message list (the fixed chat header and the composer are outside that list).
 */
function visibleBounds(anchor: Element): Box {
  const vv = window.visualViewport;
  const viewport: Box = vv
    ? { top: vv.offsetTop, left: vv.offsetLeft, bottom: vv.offsetTop + vv.height, right: vv.offsetLeft + vv.width }
    : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  const scroller = anchor.closest(`[${CHAT_SCROLL_ATTR}]`);
  return scroller ? intersectBoxes(viewport, scroller.getBoundingClientRect()) : viewport;
}

/**
 * A chat message's ⋮ menu / emoji picker, rendered in a portal with `position: fixed` (docs/history/212-*): placed next to
 * its trigger inside the visible region (`computePopoverPlacement` — below, else above, else capped and scrollable; clamped
 * sideways), and placed again on every scroll (any ancestor, captured), resize, visual-viewport change (keyboard, address
 * bar, pinch zoom) and change of the panel's own size (the emoji picker's "more"). The first placement happens before paint
 * (hidden until measured), so it never flashes at the wrong spot. When the trigger scrolls fully out of the visible region,
 * `onAway` is called (the caller closes the popover).
 */
export function useAnchoredPopover({ open, align, onAway }: { open: boolean; align: "start" | "end"; onAway: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);
  const [side, setSide] = useState<"below" | "above">("below");
  const awayRef = useRef(onAway);
  useLayoutEffect(() => {
    awayRef.current = onAway;
  });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const bounds = visibleBounds(anchor);
    const anchorBox = anchor.getBoundingClientRect();
    if (!boxIntersects(anchorBox, bounds)) {
      awayRef.current();
      return;
    }
    // Measured at its natural size: the previous placement's caps must not shrink what is measured now.
    const { maxHeight: prevMaxHeight, maxWidth: prevMaxWidth } = panel.style;
    panel.style.maxHeight = "";
    panel.style.maxWidth = "";
    const natural = { width: panel.offsetWidth, height: panel.scrollHeight };
    panel.style.maxHeight = prevMaxHeight;
    panel.style.maxWidth = prevMaxWidth;
    const placement = computePopoverPlacement({ anchor: anchorBox, panel: natural, bounds, align });
    setSide(placement.side);
    setStyle({
      position: "fixed",
      top: placement.top,
      left: placement.left,
      maxHeight: placement.maxHeight ?? undefined,
      maxWidth: placement.maxWidth ?? undefined,
      overflowY: placement.maxHeight !== null ? "auto" : undefined,
      overscrollBehavior: "contain",
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- back to hidden for the next opening, not a render-time derivation
      setStyle(HIDDEN);
      return;
    }
    place();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    const vv = window.visualViewport;
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, [open, place]);

  return { anchorRef, panelRef, style, side };
}
