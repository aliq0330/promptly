import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { fetchFeedPage } from "@/lib/supabase/feed";
import type { Prompt } from "@/types";

/** Below this many picture prompts a gallery would visibly repeat: callers fall back to their compact version. */
export const SHOWCASE_MIN_ITEMS = 4;
const FETCH_LIMIT = 16;
/** One fetch serves the home page and the sign-in panel; the community's favourites do not change by the minute. */
const CACHE_MS = 3 * 60 * 1000;

let cached: { at: number; promise: Promise<Prompt[]> } | null = null;

/** The most liked public picture prompts that have both a picture and a prompt text (docs/history/209-*, 346-*). */
export function loadShowcase(): Promise<Prompt[]> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.promise;
  const promise = fetchFeedPage({
    scope: "all",
    order: "popular",
    kind: "prompt",
    taxonomy: { ...EMPTY_TAXONOMY_FILTER, contentType: "image" },
    limit: FETCH_LIMIT,
  }).then((page) => page.items.flatMap((item) => (item.kind === "prompt" && item.data.media[0] && item.data.promptText.trim() ? [item.data] : [])));
  cached = { at: now, promise };
  // A failed request must not be served for the next three minutes.
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}
