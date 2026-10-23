import type { FeedEntry } from "@/lib/supabase/feed";

/**
 * A feed slot can be a prompt of any content type, a prompt request, a
 * workflow or a preset — all first-class feed content, not confined to
 * their own pages (see CLAUDE.md section 1 & 5).
 */
export type FeedItem = FeedEntry;

/**
 * A content post (prompt, request, workflow, preset) — every feed slot except a shared Space (docs/history/215-*) and a quote
 * (docs/history/217-*). Odak and the Izgara view draw posts only: a Space is a project with its own page and a quote is a
 * note about another post, not a single output to play full screen.
 */
export type PostFeedItem = Exclude<FeedItem, { kind: "space" | "quote" }>;

export function isPostItem(item: FeedItem): item is PostFeedItem {
  return item.kind !== "space" && item.kind !== "quote";
}

export function feedItemKey(item: FeedItem): string {
  return `${item.kind}-${item.data.id}`;
}

export function feedItemCreatedAt(item: FeedItem): number {
  // A Space enters the feed when it is shared, not when it was created.
  return new Date(item.kind === "space" ? (item.data.sharedAt ?? item.data.createdAt) : item.data.createdAt).getTime();
}

/** Rough cross-type popularity heuristic used to sort the "Popüler" tab. */
export function feedItemPopularity(item: FeedItem): number {
  if (item.kind === "request") return item.data.responseCount * 15;
  return item.data.likeCount;
}
