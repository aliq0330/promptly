import type { KeyboardEvent } from "react";

/**
 * Arrow-key movement inside a `role="radiogroup"` (native radio behaviour, docs/history/453-*): the arrow keys move focus to the
 * next enabled radio and select it. Used by `ChoiceGroup`, `OptionGroup` and `SwatchGroup` — the only places a radio is written.
 */
export function radioGroupKeyDown(event: KeyboardEvent<HTMLElement>) {
  const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
  if (!forward && !back) return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'));
  const index = radios.findIndex((el) => el === document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next = radios[(index + (forward ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
}

/** Roving tabindex: the checked radio is the group's one tab stop; with none checked, the first enabled one. */
export function radioTabIndex(index: number, checked: boolean, anyChecked: boolean): 0 | -1 {
  return checked || (!anyChecked && index === 0) ? 0 : -1;
}
