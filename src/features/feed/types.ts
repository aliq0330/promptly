import type { Generator, Prompt, PromptRequest } from "@/types";

/**
 * A feed slot can be a prompt of any content type, a prompt request, or —
 * since Bölüm 9.36's Prompt/Generator parity pass — a generator too;
 * requests and generators are first-class feed content, not confined to
 * their own `/requests`/`/generators` pages (see CLAUDE.md section 1 & 5).
 */
export type FeedItem =
  | { kind: "prompt"; data: Prompt }
  | { kind: "request"; data: PromptRequest }
  | { kind: "generator"; data: Generator };

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
  return item.kind === "generator" ? item.data.creator.id : item.data.author.id;
}
