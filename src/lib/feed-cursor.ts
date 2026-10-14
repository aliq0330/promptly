/**
 * Pure keyset-cursor rules of `public.feed_page`, kept free of any Supabase
 * import so they can be unit-tested and so the SQL and the client share ONE
 * written contract.
 *
 * Every order sorts by the unique triple `(sort_rank, created_at, id)`:
 *   newest  → rank is a constant 0,        triple DESCENDING
 *   popular → rank is `like_count`,        triple DESCENDING
 *   oldest  → rank is a constant 0,        triple ASCENDING
 *   used    → rank is `copy_count` for prompts and 0 for every other kind, triple DESCENDING
 * The next page is "every row strictly after the cursor row in that order":
 * `<` for the descending orders, `>` for oldest (see the SQL migrations).
 */
export type FeedOrder = "newest" | "popular" | "oldest" | "used";

/** Keyset position of the last row of a page: `(sort_rank, created_at, id)` of `public.feed_page`. */
export interface FeedCursor {
  rank: number;
  createdAt: string;
  id: string;
}

/** Structural twin of `ContentSortKey` (kept literal here so this file imports nothing from the UI). */
export type DiscoverSortKey = "newest" | "oldest" | "most-liked" | "most-used";

/** Keşfet's sort select → the `p_order` the database understands. */
export function feedOrderForSort(sort: DiscoverSortKey): FeedOrder {
  if (sort === "most-liked") return "popular";
  if (sort === "most-used") return "used";
  if (sort === "oldest") return "oldest";
  return "newest";
}

/**
 * Rank a row would carry in `order` (as in SQL): like_count for popular, copy_count for used
 * (`copyCount` is only passed for prompts — every other kind ranks 0), a constant 0 otherwise.
 */
export function feedSortRank(order: FeedOrder, counts: { likeCount: number; copyCount?: number }): number {
  if (order === "popular") return counts.likeCount;
  if (order === "used") return counts.copyCount ?? 0;
  return 0;
}

/**
 * Orders two `timestamptz` strings. PostgREST returns microsecond precision
 * (`…T10:00:00.123456+00:00`) which `Date` would truncate to milliseconds, so
 * equal-millisecond values are broken by the full fractional digits.
 */
export function compareTimestamps(a: string, b: string): number {
  const diff = Date.parse(a) - Date.parse(b);
  if (diff !== 0 && !Number.isNaN(diff)) return diff < 0 ? -1 : 1;
  const fraction = (value: string) => (/\.(\d+)/.exec(value)?.[1] ?? "").padEnd(6, "0").slice(0, 6);
  const fa = fraction(a);
  const fb = fraction(b);
  return fa === fb ? 0 : fa < fb ? -1 : 1;
}

/** Compares two keys in the ASCENDING sense of the triple; uuids compare as lower-case text (same as Postgres' byte order for uuid). */
function compareKeys(a: FeedCursor, b: FeedCursor): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  const byTime = compareTimestamps(a.createdAt, b.createdAt);
  if (byTime !== 0) return byTime;
  const ia = a.id.toLowerCase();
  const ib = b.id.toLowerCase();
  return ia === ib ? 0 : ia < ib ? -1 : 1;
}

/** Comparator that sorts rows into the order `feed_page` returns them. */
export function compareFeedRows(order: FeedOrder, a: FeedCursor, b: FeedCursor): number {
  const ascending = compareKeys(a, b);
  return order === "oldest" ? ascending : -ascending;
}

/** True when `row` comes strictly AFTER `cursor` in `order` — the `p_after_*` predicate of every `feed_page` branch. */
export function isAfterCursor(order: FeedOrder, row: FeedCursor, cursor: FeedCursor): boolean {
  return compareFeedRows(order, row, cursor) > 0;
}

/**
 * Cursor for the next page, taken from the LAST RAW row the database returned
 * (never from the mapped items — mapping can drop rows, the next page must
 * still continue after the last row the database sent). A page shorter than the
 * effective limit (capped at 50 by the SQL) means the feed is exhausted.
 */
export function nextFeedCursor(
  rows: { id: string; created_at: string; sort_rank: number | string }[],
  limit: number,
): FeedCursor | null {
  const last = rows[rows.length - 1];
  if (!last || rows.length < Math.min(limit, 50)) return null;
  return { rank: Number(last.sort_rank), createdAt: last.created_at, id: last.id };
}
