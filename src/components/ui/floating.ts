/**
 * Floating layers (docs/history/403-*): the only places `shadow-pop` is drawn by hand. A menu, popover, dialog card or sheet that
 * lifts off the page uses one of these; the radius follows the layer's size (16 panel · 22 dialog/sheet · 12 tooltip), the ground is
 * always `surface-elevated`, the border `border-soft`. A floating pill (the Mesajlar dock button, a pager) takes a lighter shadow.
 * Add width + position at the call site; menus add `MENU_PANEL_CLASS` (`menu.tsx`), which builds on `FLOATING_PANEL_CLASS`.
 */
export const FLOATING_PANEL_CLASS = "rounded-lg border border-border-soft bg-surface-elevated shadow-pop";

/** Dialog / sheet card: the larger 22 px radius. */
export const FLOATING_CARD_CLASS = "rounded-xl border border-border-soft bg-surface-elevated shadow-pop";

/** Tooltip-size layer: 12 px radius. */
export const FLOATING_TIP_CLASS = "rounded-md border border-border-soft bg-surface-elevated shadow-pop";

/** A popover with content of its own (a picker, a small form): panel + padding + the pop-in. */
export const POPOVER_PANEL_CLASS = `${FLOATING_PANEL_CLASS} p-3 animate-pop-in`;

/** A floating pill (round button, dock hap): lighter shadow than a panel. */
export const FLOATING_PILL_CLASS = "rounded-full border border-border-soft bg-surface-elevated shadow-md";
