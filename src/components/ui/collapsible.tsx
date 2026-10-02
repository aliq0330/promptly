"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const DURATION_MS = 220;

/**
 * Smooth height accordion body. The content is only MOUNTED while open (or
 * while the close animation runs), so a long list of closed sections never
 * puts its children in the DOM. Animates `grid-template-rows` 0fr <-> 1fr,
 * which transitions to the content's natural height without measuring it;
 * `prefers-reduced-motion` turns the transition off globally (globals.css).
 */
export function Collapsible({
  open,
  children,
  className,
  id,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount first, then expand on the next frame so the transition runs
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const timer = window.setTimeout(() => setMounted(false), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;
  return (
    <div
      id={id}
      className={cn("grid transition-[grid-template-rows,opacity] ease-soft", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0", className)}
      style={{ transitionDuration: `${DURATION_MS}ms` }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
