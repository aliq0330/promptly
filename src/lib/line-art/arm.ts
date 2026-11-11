// Two-bone arm helpers for Promptly's line-art figures (docs/history/373-*). Pure, so they are unit-tested.
import type { Vec } from "./ink.ts";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Upper arm and forearm in figure units (a figure is ~95 tall). */
export const UPPER_ARM = 17;
export const FOREARM = 16;

/**
 * The elbow for a hand at `h`. It sits on the side you get by turning shoulder→hand 90° clockwise (screen y points down):
 * a forward reach bends down, a hanging arm bends back, a raised arm bends forward — how arms bend.
 */
export function elbowFor(s: Vec, h: Vec, l1 = UPPER_ARM, l2 = FOREARM): Vec {
  const dx = h[0] - s[0], dy = h[1] - s[1];
  const d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.05);
  const th = Math.atan2(dy, dx);
  const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  return [s[0] + l1 * Math.cos(th + al), s[1] + l1 * Math.sin(th + al)];
}

/** Pull a hand target back to what the arm can reach. */
export function reachable(s: Vec, h: Vec, max = UPPER_ARM + FOREARM - 0.4): Vec {
  const dx = h[0] - s[0], dy = h[1] - s[1], d = Math.hypot(dx, dy);
  return d <= max ? h : [s[0] + (dx / d) * max, s[1] + (dy / d) * max];
}
