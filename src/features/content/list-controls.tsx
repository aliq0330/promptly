"use client";

import { SortSelect, type ContentSortKey } from "./sort-select";
import { ViewModeSwitcher } from "./view-mode-switcher";

/**
 * The right-hand end of a list toolbar: sort select + Kart / Odak switcher.
 * From `sm` up the switcher sits inline next to the sort select; below `sm`
 * there is no room beside the scrolling type chips, so the switcher moves to
 * its own right-aligned row (`MobileViewSwitcherRow`, rendered by the page
 * just above the chip row).
 */
export function SortAndViewControls({ sort, onSortChange }: { sort: ContentSortKey; onSortChange: (sort: ContentSortKey) => void }) {
  return (
    <>
      <SortSelect value={sort} onChange={onSortChange} />
      <ViewModeSwitcher className="hidden sm:inline-flex" />
    </>
  );
}

/** The phone-width home of the Kart / Odak switcher (see `SortAndViewControls`). */
export function MobileViewSwitcherRow() {
  return (
    <div className="flex justify-end sm:hidden">
      <ViewModeSwitcher />
    </div>
  );
}
