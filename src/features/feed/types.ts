import type { Generator, Preset, Prompt, PromptRequest, Workflow } from "@/types";

/**
 * A feed slot can be a prompt of any content type, a prompt request, or —
 * since Bölüm 9.36's Prompt/Generator parity pass — a generator too;
 * requests and generators are first-class feed content, not confined to
 * their own `/requests`/`/generators` pages (see CLAUDE.md section 1 & 5).
 */
export type FeedItem =
  | { kind: "prompt"; data: Prompt }
  | { kind: "request"; data: PromptRequest }
  | { kind: "generator"; data: Generator }
  | { kind: "workflow"; data: Workflow }
  | { kind: "preset"; data: Preset };

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

export function feedItemAuthorId(item: FeedItem): string {
  return item.kind === "generator" || item.kind === "workflow" || item.kind === "preset" ? item.data.creator.id : item.data.author.id;
}

/**
 * Does a feed item pass the shared taxonomy filter (type / category / subcategory)?
 * A workflow spans several content types: it matches a type filter when it chains
 * that type; category / subcategory are its own.
 */
export function matchesFeedTaxonomy(item: FeedItem, filter: { contentType: string | null; category: string | null; subcategory: string | null }): boolean {
  if (!filter.contentType && !filter.category && !filter.subcategory) return true;
  if (item.kind === "workflow") {
    const w = item.data;
    return (!filter.contentType || w.contentTypes.includes(filter.contentType as never)) && (!filter.category || w.category === filter.category) && (!filter.subcategory || w.subcategory === filter.subcategory);
  }
  const d = item.data;
  return (!filter.contentType || d.contentType === filter.contentType) && (!filter.category || d.category === filter.category) && (!filter.subcategory || d.subcategory === filter.subcategory);
}
