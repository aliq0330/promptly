/**
 * Was the page just reached with the browser's Back / Forward (a `popstate`)? Lists use it to put back the posts they
 * showed a moment ago instead of loading from scratch — the scroll position then has something to land on, and the
 * cover that grew into a detail page can shrink back into its card (`lib/card-transition.ts`). A fresh navigation
 * (a link, the menu) always loads anew.
 */
const WINDOW_MS = 1500;
let lastPopState = 0;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopState = performance.now();
  });
}

export function cameFromHistory(): boolean {
  return lastPopState > 0 && performance.now() - lastPopState < WINDOW_MS;
}
