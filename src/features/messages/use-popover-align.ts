import { useLayoutEffect, useRef, useState } from "react";

/**
 * A message bubble's action menu / emoji picker is anchored to a small
 * icon button whose own screen position depends on how wide that
 * particular message's bubble happens to be — a short "kendi" message's
 * icon sits far from the right edge, a long "karşı taraf" message's icon
 * can sit right up against it, and vice versa. A single fixed `left-0`/
 * `right-0` choice per side (isMe vs not) is wrong for the opposite-length
 * case (Aşama 1/12's "menü ekran kenarından taşmasın"), so this measures
 * the popover after it renders with its preferred alignment and flips to
 * the other side only if it would actually overflow the viewport —
 * imperceptible in the common case, and self-correcting in the edge case,
 * without pulling in a positioning library for what is otherwise a very
 * small, self-contained fixup.
 */
export function usePopoverAlign(preferred: "left" | "right", open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [align, setAlign] = useState<"left" | "right">(preferred);

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting to the preferred side when the popover closes, not a render-time derivation
      setAlign(preferred);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    if (preferred === "left" && rect.right > window.innerWidth - margin) {
      setAlign("right");
    } else if (preferred === "right" && rect.left < margin) {
      setAlign("left");
    } else {
      setAlign(preferred);
    }
  }, [open, preferred]);

  return { ref, align };
}
