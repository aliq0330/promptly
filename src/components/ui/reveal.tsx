"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const STEP_MS = 40;
const MAX_STEPS = 8;
/** Items that are already on screen when the list mounts settle in as a short cascade; later ones don't wait. */
const INITIAL_WINDOW_MS = 450;

/**
 * Scroll reveal for list items (cards in a feed). The wrapper is the
 * column/grid child and never moves — its inner element carries the
 * opacity + small translate, so masonry columns and break-inside rules are
 * untouched. The animation is `backwards`-filled: once it ends nothing is
 * left behind (a lingering transform would trap a card's open menu in its own
 * stacking context). Under `prefers-reduced-motion`, without
 * IntersectionObserver, and for items already on screen at mount the reveal
 * never hides content for long; the hidden state is a single attribute the
 * CSS lifts for reduced motion.
 */
export function Reveal({
  index = 0,
  className,
  children,
}: {
  /** Position in the list — only used to cascade the items visible at first paint. */
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(0);
  const [state, setState] = useState<"pending" | "shown">("pending");
  const [delay, setDelay] = useState(0);

  useEffect(() => {
    mountedAt.current = performance.now();
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setState("shown");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const early = performance.now() - mountedAt.current < INITIAL_WINDOW_MS;
        setDelay(early ? Math.min(index, MAX_STEPS) * STEP_MS : 0);
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index]);

  return (
    <div className={className}>
      <div
        ref={ref}
        data-reveal={state}
        className={cn(state === "shown" && "animate-reveal")}
        style={state === "shown" && delay ? { animationDelay: `${delay}ms` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
