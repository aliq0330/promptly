/**
 * "Where to go after logging in" helpers. The login page reads `?next=` at
 * submit time (from `window.location`, so it needs no Suspense boundary under
 * the static export). The value is only ever an in-app path.
 */

/** Accepts only same-origin, absolute in-app paths ("/saved", "/profile/real?username=x"); anything else is dropped. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.startsWith("/login") || raw.startsWith("/signup") || raw.startsWith("/reset-password")) return null;
  return raw;
}

/** `/login` (or `/signup`), carrying the page the visitor was trying to reach. */
export function authHref(base: "/login" | "/signup", next?: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base;
}

/** Reads `?next=` from the current URL (browser only). */
export function readNextParam(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}
