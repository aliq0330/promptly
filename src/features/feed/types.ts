import type { FeedEntry } from "@/lib/supabase/feed";

/**
 * A feed slot can be a prompt of any content type, a prompt request, a
 * workflow or a preset — all first-class feed content, not confined to
 * their own pages (see CLAUDE.md section 1 & 5).
 */
export type FeedItem = FeedEntry;

export function feedItemKey(item: FeedItem): string {
  return `${item.kind}-${item.data.id}`;
}

export function feedItemCreatedAt(item: FeedItem): number {
  return new Date(item.data.createdAt).getTime();
}

/** Rough cross-type popularity heuristic used to sort the "Popüler" tab. */
export function feedItemPopularity(item: FeedItem): number {
  if (item.kind === "request") return item.data.responseCount * 15;
  return item.data.likeCount;
}
