import { supabase } from "./client";
import { fetchPromptsByIds } from "./prompts";
import { fetchRequestsByIds } from "./requests";
import { fetchWorkflowsByIds } from "./workflows";
import { fetchPresetsByIds } from "./presets";
import { nextFeedCursor, type FeedCursor, type FeedOrder } from "@/lib/feed-cursor";
import type { TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { Preset, Prompt, PromptRequest, Workflow } from "@/types";

/** One slot of the home feed: a prompt, request, workflow or preset. */
export type FeedEntry =
  | { kind: "prompt"; data: Prompt }
  | { kind: "request"; data: PromptRequest }
  | { kind: "workflow"; data: Workflow }
  | { kind: "preset"; data: Preset };

export type FeedKind = FeedEntry["kind"];
export type FeedScope = "all" | "following" | "tags";
export type { FeedCursor, FeedOrder };

export interface FeedPage {
  items: FeedEntry[];
  nextCursor: FeedCursor | null;
}

export interface FeedPageParams {
  scope: FeedScope;
  order: FeedOrder;
  /** `all` = every kind. */
  kind: FeedKind | "all";
  taxonomy: TaxonomyFilterValue;
  /** Only requests with `status = 'open'` (other kinds are unaffected). Omitted = false; Home never sets it. */
  openOnly?: boolean;
  limit?: number;
  cursor?: FeedCursor | null;
}

const DEFAULT_LIMIT = 18;

interface FeedRow {
  kind: FeedKind;
  id: string;
  created_at: string;
  sort_rank: number | string;
}

/**
 * One page of the home feed, chosen ENTIRELY by the database
 * (`public.feed_page`, migration 20260919770000): prompts, requests, workflows
 * and presets in one total order with a real keyset cursor — there is no
 * client-side pool to filter, so a followed author's posts show up no matter
 * how old they are.
 *
 *   scope "following" → only authors the signed-in user follows (`follows`
 *                       rows, read server-side with `auth.uid()`)
 *   scope "tags"      → only content tagged with a tag the signed-in user follows
 *                       (`tag_follows` rows, same server-side `auth.uid()`; migration 20260919860000)
 *   order "newest"    → created_at ↓
 *   order "popular"   → like_count ↓ (every public kind), then created_at ↓
 *   order "oldest"    → created_at ↑ (cursor comparison flips to `>`, see `feed-cursor.ts`)
 *
 * The RPC returns only ids + sort keys; the full rows are then fetched with the
 * same selects/mappers the list pages use (RLS applies there as well). A row
 * that disappears between the two calls (deleted, blocked author) is simply
 * skipped. Throws on a failed request so the caller can show a retry instead of
 * a false "nothing here".
 */
export async function fetchFeedPage(params: FeedPageParams): Promise<FeedPage> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  // `p_open_only` is only sent when asked for: Home keeps calling the 10-argument form.
  const { data, error } = await supabase.rpc("feed_page", {
    ...(params.openOnly ? { p_open_only: true } : {}),
    p_scope: params.scope,
    p_order: params.order,
    p_kinds: params.kind === "all" ? null : [params.kind],
    p_content_type: params.taxonomy.contentType,
    p_category: params.taxonomy.category,
    p_subcategory: params.taxonomy.subcategory,
    p_limit: limit,
    p_after_rank: params.cursor ? params.cursor.rank : null,
    p_after_created_at: params.cursor ? params.cursor.createdAt : null,
    p_after_id: params.cursor ? params.cursor.id : null,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as FeedRow[];
  const idsOf = (kind: FeedKind) => rows.filter((row) => row.kind === kind).map((row) => row.id);
  const [prompts, requests, workflows, presets] = await Promise.all([
    fetchPromptsByIds(idsOf("prompt")),
    fetchRequestsByIds(idsOf("request")),
    fetchWorkflowsByIds(idsOf("workflow")),
    fetchPresetsByIds(idsOf("preset")),
  ]);
  const byKey = new Map<string, FeedEntry>();
  for (const data of prompts) byKey.set(`prompt-${data.id}`, { kind: "prompt", data });
  for (const data of requests) byKey.set(`request-${data.id}`, { kind: "request", data });
  for (const data of workflows) byKey.set(`workflow-${data.id}`, { kind: "workflow", data });
  for (const data of presets) byKey.set(`preset-${data.id}`, { kind: "preset", data });

  const items = rows.flatMap((row) => byKey.get(`${row.kind}-${row.id}`) ?? []);
  // The cursor comes from the RAW rows, never from `items`: filtering can drop rows, but the next page must still continue after the last row the database returned.
  return { items, nextCursor: nextFeedCursor(rows, limit) };
}
