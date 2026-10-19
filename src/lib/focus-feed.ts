/**
 * Odak Akışı (docs/history/199-*) — the pure presentation rules, kept free of
 * React / Supabase imports so they can be unit-tested (`focus-feed.test.ts`):
 * which picture (if any) fronts a feed entry, which slide layout it gets,
 * where the feed starts and when the next page is asked for.
 *
 * Nothing is invented: an entry without a picture is never forced into an
 * image slide — a plain prompt shows its own words, a workflow its step chain,
 * a preset its settings, a request its brief.
 */
import type { FeedEntry } from "@/lib/supabase/feed";

export type FocusFeedLayout = "visual" | "text" | "workflow" | "preset" | "request";

export interface FocusFeedCover {
  /** Identity URL as stored (private media is signed by `StorageImg` / `useStorageSrc`). */
  url: string;
  alt: string;
}

/** The picture that fronts an entry (its first image / cover / reference), or `null`. */
export function focusFeedCover(entry: FeedEntry): FocusFeedCover | null {
  switch (entry.kind) {
    case "prompt": {
      // Same rule as the cards: an image prompt shows its outputs; a video/audio prompt's first media is its poster.
      const first = entry.data.media[0];
      return first ? { url: first.url, alt: first.alt || entry.data.title } : null;
    }
    case "workflow": {
      const first = entry.data.media[0];
      return first ? { url: first.url, alt: first.alt || entry.data.title } : null;
    }
    case "request": {
      const first = entry.data.media[0];
      return first ? { url: first.url, alt: first.alt || entry.data.title } : null;
    }
    case "preset":
      return entry.data.coverUrl ? { url: entry.data.coverUrl, alt: entry.data.title } : null;
  }
}

/** How many further pictures the entry has beyond its cover (a quiet "+N"; browsing them is the detail page's job). */
export function focusFeedExtraImages(entry: FeedEntry): number {
  if (entry.kind === "preset") return 0;
  return Math.max(0, entry.data.media.length - 1);
}

/** A video/audio prompt with a poster: the slide shows a play cue (playback lives on the detail page). */
export function focusFeedPlayable(entry: FeedEntry): boolean {
  return entry.kind === "prompt" && (entry.data.contentType === "video" || entry.data.contentType === "audio") && entry.data.media.length > 0;
}

/** The slide layout: image-first only when there is a real picture; otherwise the kind's own structure. */
export function focusFeedLayout(entry: FeedEntry): FocusFeedLayout {
  if (entry.kind === "prompt") return focusFeedCover(entry) ? "visual" : "text";
  // A request / preset / workflow with a picture still keeps its own structure below the title, inside the visual slide.
  if (focusFeedCover(entry)) return "visual";
  return entry.kind;
}

/**
 * Where the feed opens: the card the visitor was looking at when they switched (keeps their place),
 * else the post they last had open in this feed during the session, else the top.
 */
export function focusFeedStartIndex(keys: readonly string[], options: { visibleKey?: string | null; rememberedKey?: string | null }): number {
  for (const key of [options.visibleKey, options.rememberedKey]) {
    if (!key) continue;
    const index = keys.indexOf(key);
    if (index >= 0) return index;
  }
  return 0;
}

/** Only slides this close to the active one mount their heavy media (pictures, lazily fetched workflow steps). */
export const FOCUS_FEED_MEDIA_RADIUS = 2;

export function focusFeedIsNear(index: number, active: number, radius = FOCUS_FEED_MEDIA_RADIUS): boolean {
  return Math.abs(index - active) <= radius;
}

/** Ask for the next page this many posts before the end, unless a request is running or the last one failed (the end slide offers a retry). */
export const FOCUS_FEED_PREFETCH = 3;

export function focusFeedShouldLoadMore(active: number, total: number, state: { hasMore: boolean; loadingMore: boolean; failed: boolean }): boolean {
  return state.hasMore && !state.loadingMore && !state.failed && total > 0 && active >= total - FOCUS_FEED_PREFETCH;
}
