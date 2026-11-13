/**
 * The one look of an open menu (audit §6): panel + row. The ⋮ menus of cards, messages, collections, profiles, Spaces and teams
 * all draw their own panel; they share these class names so radius, ground, border, shadow, row height and the keyboard focus
 * state stay the same. Menus that must escape an `overflow` ancestor still position themselves (portal + `fixed`,
 * `useAnchoredPopover`) — this file only owns how they look.
 */

/** Panel surface: 16px radius, elevated ground, soft border, overlay shadow, pop-in. Add width + position at the call site. */
export const MENU_PANEL_CLASS = "overflow-hidden rounded-lg border border-border-soft bg-surface-elevated py-1 shadow-pop animate-pop-in";

/** A menu row. The focus state is real (inset ring), not only a background tint. */
export const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-small text-text transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

/** Destructive row: same geometry, danger ink. */
export const MENU_ITEM_DANGER_CLASS = "text-danger hover:bg-danger/10 focus-visible:bg-danger/10";
