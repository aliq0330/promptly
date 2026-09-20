/**
 * Pure calculation for how much of the layout viewport's bottom edge is
 * currently covered by the on-screen keyboard, kept separate from the
 * VisualViewport wiring itself so it's unit-testable without a real
 * browser/keyboard — this sandbox's environment cannot open an iOS
 * software keyboard, so this is the part of that behavior that can
 * actually be verified directly (see the conversation view's own comment
 * for what remains unverified).
 *
 * `windowInnerHeight` is the full layout viewport height (stable, doesn't
 * shrink for the keyboard on iOS Safari); `visualViewportHeight`/
 * `visualViewportOffsetTop` come from `window.visualViewport`, which DOES
 * shrink (and offset) when the keyboard opens. The difference between them
 * is the keyboard's height. Never negative — clamps to 0 when nothing
 * covers the viewport (keyboard closed, or on browsers where these two
 * numbers already match).
 */
export function computeKeyboardInset(params: {
  windowInnerHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
}): number {
  const inset = params.windowInnerHeight - params.visualViewportHeight - params.visualViewportOffsetTop;
  return Math.max(0, inset);
}
