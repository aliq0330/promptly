/**
 * Pure helpers for Promptly's shareable links.
 *
 * Detail pages are client-rendered `?id=` routes, so social crawlers see only
 * the site-wide card. Public content therefore also gets a build-time STATIC
 * share page at `/share/<kind>/<key>/` (`src/app/share/[kind]/[id]`) carrying
 * that content's own title/description, which then sends the visitor on to the
 * real detail page. Everything here is framework-free so it can be unit-tested.
 */
export type ShareKind = "prompt" | "request" | "workflow" | "preset" | "profile";

export const SHARE_KINDS: readonly ShareKind[] = ["prompt", "request", "workflow", "preset", "profile"];

/** Must match `basePath` in next.config.ts. */
export const SHARE_BASE_PATH = "/promptly";

/** The real detail route of each kind and the query param that identifies the row. */
const DETAIL_ROUTES: Record<ShareKind, { path: string; param: "id" | "username" }> = {
  prompt: { path: "/prompts/local", param: "id" },
  request: { path: "/requests/local", param: "id" },
  workflow: { path: "/workflows/local", param: "id" },
  preset: { path: "/presets/local", param: "id" },
  profile: { path: "/profile/real", param: "username" },
};

export function isShareKind(value: string): value is ShareKind {
  return (SHARE_KINDS as readonly string[]).includes(value);
}

/** App-relative detail route for a row, e.g. `/prompts/local?id=…`. */
export function detailHrefFor(kind: ShareKind, key: string): string {
  const { path, param } = DETAIL_ROUTES[kind];
  return `${path}?${param}=${encodeURIComponent(key)}`;
}

/** App-relative path of a row's static share page, e.g. `/share/prompt/<id>/`. */
export function sharePathFor(kind: ShareKind, key: string): string {
  return `/share/${kind}/${encodeURIComponent(key)}/`;
}

const DETAIL_HREF_PATTERN = /^(\/prompts\/local|\/requests\/local|\/workflows\/local|\/presets\/local|\/profile\/real)\?(id|username)=([^&#]+)$/;
const KIND_BY_PATH: Record<string, ShareKind> = {
  "/prompts/local": "prompt",
  "/requests/local": "request",
  "/workflows/local": "workflow",
  "/presets/local": "preset",
  "/profile/real": "profile",
};

/**
 * Turns an in-app detail href into its share path so a copied/shared link
 * unfurls with a real preview. Anything that is not one of the five shareable
 * detail routes (results, collections, …) is returned unchanged — such links
 * keep working exactly as before.
 */
export function shareLinkForHref(href: string): string {
  const match = DETAIL_HREF_PATTERN.exec(href);
  if (!match) return href;
  const kind = KIND_BY_PATH[match[1]];
  const wantedParam = DETAIL_ROUTES[kind].param;
  if (match[2] !== wantedParam) return href;
  let key = match[3];
  try {
    key = decodeURIComponent(key);
  } catch {
    return href;
  }
  return sharePathFor(kind, key);
}

/**
 * Parses a browser pathname (with or without the basePath, with or without a
 * trailing slash) of the form `/share/<kind>/<key>` — used by the 404 page to
 * forward a share link whose static page does not exist yet (content published
 * after the last build) to the real detail page.
 */
export function parseSharePath(pathname: string): { kind: ShareKind; key: string } | null {
  let path = pathname;
  if (path === SHARE_BASE_PATH || path.startsWith(`${SHARE_BASE_PATH}/`)) path = path.slice(SHARE_BASE_PATH.length);
  const match = /^\/share\/([a-z]+)\/([^/]+)\/?$/.exec(path);
  if (!match || !isShareKind(match[1])) return null;
  try {
    return { kind: match[1], key: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/** Collapses whitespace and clips to `max` characters with an ellipsis (for meta descriptions). */
export function clipDescription(text: string | null | undefined, max = 200): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}
