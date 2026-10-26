/**
 * Odak (`/focus`, docs/history/199-*) — the pure presentation rules, kept free of
 * React / Supabase imports so they can be unit-tested (`focus-feed.test.ts`):
 * which picture (if any) fronts a feed entry, which slide layout it gets,
 * what counts as "media" for the Medya filter, where the feed starts and when
 * the next page is asked for.
 *
 * Nothing is invented: an entry without a picture is never forced into an
 * image slide — a plain prompt shows its own words, a workflow its step chain,
 * a preset its settings, a request its brief. A video / audio prompt plays the
 * output its AUTHOR uploaded (the detail page's rule); without one it falls
 * back to its poster or its words.
 */
import type { PostEntry } from "@/lib/supabase/feed";

export type FocusFeedLayout = "visual" | "playable" | "text" | "workflow" | "preset" | "request";

export interface FocusFeedCover {
  /** Identity URL as stored (private media is signed by `StorageImg` / `useStorageSrc`). */
  url: string;
  alt: string;
}

/** The picture that fronts an entry (its first image / cover / reference / video poster), or `null`. */
export function focusFeedCover(entry: PostEntry): FocusFeedCover | null {
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
export function focusFeedExtraImages(entry: PostEntry): number {
  if (entry.kind === "preset") return 0;
  if (entry.kind === "prompt" && entry.data.contentType !== "image") return 0;
  return Math.max(0, entry.data.media.length - 1);
}

/** A video / audio prompt: its slide looks for the author's uploaded output and plays it. */
export function focusFeedPlayable(entry: PostEntry): boolean {
  return entry.kind === "prompt" && (entry.data.contentType === "video" || entry.data.contentType === "audio");
}

/** The slide layout: playable for video / audio prompts, image-first only when there is a real picture, otherwise the kind's own structure. */
export function focusFeedLayout(entry: PostEntry): FocusFeedLayout {
  if (focusFeedPlayable(entry)) return "playable";
  if (entry.kind === "prompt") return focusFeedCover(entry) ? "visual" : "text";
  // A request / preset / workflow with a picture still keeps its own structure below the title, inside the visual slide.
  if (focusFeedCover(entry)) return "visual";
  return entry.kind;
}

/** Has a picture, or is a video / audio prompt (its output is looked up when it comes into view). */
export function focusFeedHasMedia(entry: PostEntry): boolean {
  return focusFeedPlayable(entry) || focusFeedCover(entry) !== null;
}

/**
 * The "Medya" switch (on by default, docs/history/239-*): it hides the prompts and workflows that have nothing to look at —
 * no picture, no video / audio. Requests and presets are never hidden by it: without a picture their own text / parameter
 * summary takes the picture's place.
 */
export function focusFeedShown(entry: PostEntry, mediaOnly: boolean): boolean {
  if (!mediaOnly || entry.kind === "request" || entry.kind === "preset") return true;
  return focusFeedHasMedia(entry);
}

/** Odak's sections (docs/history/239-*): swiping up / down moves between them, sideways moves between the posts of one. */
export const FOCUS_CHANNELS = ["all", "prompt", "request", "workflow", "preset"] as const;
export type FocusChannel = (typeof FOCUS_CHANNELS)[number];

/** The channel `delta` steps from `channel`, or the same one at either end (no wrap-around). */
export function focusChannelStep(channel: FocusChannel, delta: number): FocusChannel {
  const index = FOCUS_CHANNELS.indexOf(channel) + delta;
  return FOCUS_CHANNELS[Math.max(0, Math.min(FOCUS_CHANNELS.length - 1, index))];
}

/** Where the feed opens: the post last open in this feed during the session (if it is still in the list), else the top. */
export function focusFeedStartIndex(keys: readonly string[], rememberedKey: string | null | undefined): number {
  if (!rememberedKey) return 0;
  return Math.max(0, keys.indexOf(rememberedKey));
}

/** Only slides this close to the active one mount their heavy media (pictures, video / audio, lazily fetched workflow steps). */
export const FOCUS_FEED_MEDIA_RADIUS = 1;

export function focusFeedIsNear(index: number, active: number, radius = FOCUS_FEED_MEDIA_RADIUS): boolean {
  return Math.abs(index - active) <= radius;
}

/** Ask for the next page this many posts before the end, unless a request is running or the last one failed (the end slide offers a retry). */
export const FOCUS_FEED_PREFETCH = 3;

export function focusFeedShouldLoadMore(active: number, total: number, state: { hasMore: boolean; loadingMore: boolean; failed: boolean }): boolean {
  return state.hasMore && !state.loadingMore && !state.failed && active >= total - FOCUS_FEED_PREFETCH;
}
