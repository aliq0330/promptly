import type { Prompt, PromptRequest } from "@/types";

/**
 * A feed slot can be a prompt of any content type or a prompt request —
 * requests are first-class feed content, not confined to /requests
 * (see CLAUDE.md section 1 & 5).
 */
export type FeedItem =
  | { kind: "prompt"; data: Prompt }
  | { kind: "request"; data: PromptRequest };

export function feedItemKey(item: FeedItem): string {
  return `${item.kind}-${item.data.id}`;
}

export function feedItemCreatedAt(item: FeedItem): number {
  return new Date(item.data.createdAt).getTime();
}

/** Rough cross-type popularity heuristic used to sort the "Popüler" tab. */
export function feedItemPopularity(item: FeedItem): number {
  return item.kind === "prompt" ? item.data.likeCount : item.data.responseCount * 15;
}

export function feedItemAuthorId(item: FeedItem): string {
  return item.data.author.id;
}
