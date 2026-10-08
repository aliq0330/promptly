import type { CSSProperties } from "react";

/*
 * Staggered content entrance (Bölüm 9.113): list items use `animate-rise-in`
 * plus this delay, so a freshly loaded grid settles in top-to-bottom instead
 * of popping in at once. Capped, so a long list (or a "Daha fazla yükle"
 * page) never waits noticeably; `prefers-reduced-motion` disables it all
 * (globals.css).
 */
const STEP_MS = 35;
const MAX_STEPS = 8;

export function staggerStyle(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, MAX_STEPS) * STEP_MS}ms` };
}
