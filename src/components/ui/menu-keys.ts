import type { KeyboardEvent } from "react";
import { nextRovingIndex } from "@/lib/modal-focus";

/**
 * Menülerin ortak klavye davranışı (docs/history/418-*): ↑/↓ öğeler arasında döner, Home/End uçlara gider. Her ⋮ / seçim menüsü
 * kendi panelini çizer; gezinme tek yerdedir. Açılışta odağı ilk (ya da seçili) öğeye `focusMenuItem` alır.
 */
export function menuItems(container: HTMLElement | null, selector: string): HTMLElement[] {
  return container ? Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((element) => !element.hasAttribute("disabled")) : [];
}

export function menuKeyDown(event: KeyboardEvent, container: HTMLElement | null, selector = '[role="menuitem"]'): void {
  const key = event.key === "ArrowDown" ? "ArrowRight" : event.key === "ArrowUp" ? "ArrowLeft" : event.key;
  const items = menuItems(container, selector);
  const next = nextRovingIndex(items.length, items.indexOf(document.activeElement as HTMLElement), key);
  if (next === null) return;
  event.preventDefault();
  items[next].focus();
}

/** Açılışta odağı menüye alır: `[aria-checked="true"]` varsa o, yoksa ilk öğe. */
export function focusMenuItem(container: HTMLElement | null, selector = '[role="menuitem"]'): void {
  const items = menuItems(container, selector);
  (items.find((element) => element.getAttribute("aria-checked") === "true") ?? items[0])?.focus({ preventScroll: true });
}
