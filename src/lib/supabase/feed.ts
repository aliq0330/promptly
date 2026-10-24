import { supabase } from "./client";
import { fetchPromptsByIds } from "./prompts";
import { fetchRequestsByIds } from "./requests";
import { fetchWorkflowsByIds } from "./workflows";
import { fetchPresetsByIds } from "./presets";
import { fetchSpaceFeedCards, type SpaceFeedCard } from "./spaces";
import { fetchQuotesByIds, type Quote } from "./quotes";
import { nextFeedCursor, type FeedCursor, type FeedOrder } from "@/lib/feed-cursor";
import type { TaxonomyFilterValue } from "@/lib/content-taxonomy";
import type { Preset, Prompt, PromptRequest, Workflow } from "@/types";

/** One slot of the home feed: a prompt, request, workflow, preset — a Space shared to the feed (docs/history/215-*) or a quote of any of them (docs/history/217-*). */
export type FeedEntry =
  | { kind: "prompt"; data: Prompt }
  | { kind: "request"; data: PromptRequest }
  | { kind: "workflow"; data: Workflow }
  | { kind: "preset"; data: Preset }
  | { kind: "space"; data: SpaceFeedCard }
  | { kind: "quote"; data: Quote };

export type FeedKind = FeedEntry["kind"];
/** A feed slot that is a content post (everything but a shared Space or a quote). */
export type PostEntry = Exclude<FeedEntry, { kind: "space" | "quote" }>;
export type FeedScope = "all" | "following";
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
  /** Only content carrying this tag slug (a tag page). */
  tag?: string | null;
  /** Only content recommending this AI tool (catalog id; every model of it matches — a tool page). */
  tool?: string | null;
  /**
   * Home's "takip edilenler" filters (docs/history/221-*): several values narrow like the search chips do — different filters AND,
   * authors / tools are alternatives (OR) inside their own kind, tags must ALL be present. Empty / omitted = no filter.
   * A narrowing only: visibility is decided by the database exactly as without them.
   */
  authors?: string[];
  tags?: string[];
  tools?: string[];
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
 *   (the old scope "tags" still exists in the database; no screen uses it since Home's tabs became Sana özel / Takip Ettiklerim)
 *   order "newest"    → created_at ↓
 *   order "popular"   → like_count ↓ (every public kind), then created_at ↓
 *   order "oldest"    → created_at ↑ (cursor comparison flips to `>`, see `feed-cursor.ts`)
 *   order "used"      → copy_count ↓ (prompts; every other kind ranks 0)
 *   order "recommended" → engagement score ↓ (migration 20260922100000; not personalised)
 *
 * The RPC returns only ids + sort keys; the full rows are then fetched with the
 * same selects/mappers the list pages use (RLS applies there as well). A row
 * that disappears between the two calls (deleted, blocked author) is simply
 * skipped. Throws on a failed request so the caller can show a retry instead of
 * a false "nothing here".
 */
export async function fetchFeedPage(params: FeedPageParams): Promise<FeedPage> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  // The RPC is overloaded and its newer arguments have no defaults, so the argument SET picks the form: plain calls keep the
  // 10-argument form, `p_open_only` alone the 11-argument one, a tag/tool page the 13-argument one (docs/history/211-*), and only a
  // call that really carries a Home filter needs the 16-argument form (migration 20260922100000) — the rest keeps working without it.
  const multi = Boolean(params.authors?.length || params.tags?.length || params.tools?.length);
  const topic = Boolean(params.tag || params.tool) || multi;
  const { data, error } = await supabase.rpc("feed_page", {
    ...(params.openOnly || topic ? { p_open_only: Boolean(params.openOnly) } : {}),
    ...(topic ? { p_tag: params.tag ?? null, p_tool: params.tool ?? null } : {}),
    ...(multi ? { p_authors: params.authors?.length ? params.authors : null, p_tags: params.tags?.length ? params.tags : null, p_tools: params.tools?.length ? params.tools : null } : {}),
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
  const items = await hydrateFeedRows(rows);
  // The cursor comes from the RAW rows, never from `items`: filtering can drop rows, but the next page must still continue after the last row the database returned.
  return { items, nextCursor: nextFeedCursor(rows, limit) };
}

/** How many posts a topic page lists (`public.feed_count`: the same visibility + filters as `feed_page`). `null` when it failed. */
export async function fetchFeedCount(filter: { taxonomy: TaxonomyFilterValue; tag?: string | null; tool?: string | null }): Promise<number | null> {
  const { data, error } = await supabase.rpc("feed_count", {
    p_content_type: filter.taxonomy.contentType,
    p_category: filter.taxonomy.category,
    p_subcategory: filter.taxonomy.subcategory,
    p_tag: filter.tag ?? null,
    p_tool: filter.tool ?? null,
  });
  if (error) {
    console.error("fetchFeedCount", error);
    return null;
  }
  return Number(data);
}

/** Full rows for a page of feed ids, in the page's order; a row that vanished in between (deleted, blocked author) is skipped. */
async function hydrateFeedRows(rows: FeedRow[]): Promise<FeedEntry[]> {
  const idsOf = (kind: FeedKind) => rows.filter((row) => row.kind === kind).map((row) => row.id);
  const [prompts, requests, workflows, presets, spaces, quotes] = await Promise.all([
    fetchPromptsByIds(idsOf("prompt")),
    fetchRequestsByIds(idsOf("request")),
    fetchWorkflowsByIds(idsOf("workflow")),
    fetchPresetsByIds(idsOf("preset")),
    // A Space card that can't be loaded (gone private, blocked owner) is skipped like any other vanished row.
    fetchSpaceFeedCards(idsOf("space")).catch(() => [] as SpaceFeedCard[]),
    // A quote whose target can't be loaded (gone private) is skipped like any other vanished row.
    fetchQuotesByIds(idsOf("quote")).catch(() => [] as Quote[]),
  ]);
  const byKey = new Map<string, FeedEntry>();
  for (const data of prompts) byKey.set(`prompt-${data.id}`, { kind: "prompt", data });
  for (const data of requests) byKey.set(`request-${data.id}`, { kind: "request", data });
  for (const data of workflows) byKey.set(`workflow-${data.id}`, { kind: "workflow", data });
  for (const data of presets) byKey.set(`preset-${data.id}`, { kind: "preset", data });
  for (const data of spaces) byKey.set(`space-${data.id}`, { kind: "space", data });
  for (const data of quotes) byKey.set(`quote-${data.id}`, { kind: "quote", data });

  return rows.flatMap((row) => byKey.get(`${row.kind}-${row.id}`) ?? []);
}

/**
 * Why "Sana özel" shows a post (`public.for_you_page`): the strongest real signal, never a made-up one. Since docs/history/222-* the server
 * no longer returns posts of followed people (they are under "Takip Ettiklerim"), so `creator` is never produced — it stays in the type so a
 * response from a server that has not got the migration yet is still understood.
 */
export type ForYouReasonKind = "creator" | "tag" | "tool" | "interest" | "liked_tag" | "popular";
export interface ForYouReason {
  kind: ForYouReasonKind;
  /** Tag slug (`tag`, `liked_tag`) or profile interest value (`interest`); null otherwise. */
  ref: string | null;
}

export interface ForYouPage {
  /** "Sana özel" ranks content posts only (`for_you_page` never returns a Space or a quote). */
  items: PostEntry[];
  /** `${kind}-${id}` → reason. */
  reasons: Record<string, ForYouReason>;
  nextCursor: FeedCursor | null;
}

interface ForYouRow extends FeedRow {
  reason_kind: ForYouReasonKind;
  reason_ref: string | null;
}

/**
 * One page of "Sana özel" (`public.for_you_page`, docs/history/209-*): ranked ENTIRELY by the database from the
 * signed-in user's own signals (followed people and tags, profile interests, the tags of what they liked, likes; age
 * lowers the score). `asOf` keeps the ranking stable for a session, so the keyset cursor never skips or repeats a post.
 * Rows are hydrated with the same selects the other feeds use (RLS applies). Signed-in users only (no anon EXECUTE).
 */
export async function fetchForYouPage(params: {
  asOf: string;
  kind: FeedKind | "all";
  taxonomy: TaxonomyFilterValue;
  limit?: number;
  cursor?: FeedCursor | null;
}): Promise<ForYouPage> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const { data, error } = await supabase.rpc("for_you_page", {
    p_as_of: params.asOf,
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

  const rows = (data ?? []) as ForYouRow[];
  const items = (await hydrateFeedRows(rows)).filter((item): item is PostEntry => item.kind !== "space" && item.kind !== "quote");
  const reasons: Record<string, ForYouReason> = {};
  for (const row of rows) reasons[`${row.kind}-${row.id}`] = { kind: row.reason_kind, ref: row.reason_ref };
  return { items, reasons, nextCursor: nextFeedCursor(rows, limit) };
}
