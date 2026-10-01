/**
 * Shared keyset ("seek") pagination helpers for the "recent published X"
 * browse lists (prompts/requests/generators/workflows) — real cursor-based
 * "load more", not offset/`range()`. Offset pagination silently skips or
 * repeats rows when new content is inserted between page loads (a real risk
 * here, since these are live, constantly-growing feeds); keyset pagination
 * anchors each page to the last row actually seen, so it never does.
 *
 * Deliberately NOT used for the free-text search functions
 * (`searchPrompts`/`searchRequests`/`searchGenerators`/`searchWorkflows`):
 * those already use a single `.or()` call for the title/description ILIKE
 * match, and PostgREST's combination behavior for TWO independent `.or()`
 * calls on the same query has no documented, verifiable semantics (see
 * CLAUDE.md Bölüm 9.2's own note on this exact landmine) — not worth
 * risking on a query this sandbox can't test end-to-end against the live
 * REST API. Search's own "load more" instead just re-runs with a larger
 * `limit`, which is simple and unambiguously correct.
 */

export interface KeysetCursor {
  /** The sort column's own value on the last row of the previous page (raw, as returned by Postgres — an ISO timestamp string for `created_at`, a stringified integer for a count column). */
  value: string;
  /** That row's id — the tiebreaker for rows sharing the same sort value (timestamps collide easily when many rows are inserted in one transaction, e.g. a seed script). */
  id: string;
}

interface OrFilterable<Self> {
  or: (filters: string) => Self;
}

/**
 * Appends `WHERE (column < cursor.value) OR (column = cursor.value AND id < cursor.id)`
 * as a single `.or()` call. Safe to call on a query that has no OTHER
 * `.or()` call already applied (every caller here is a plain `.eq()`/`.in()`
 * chain with no free-text search mixed in).
 */
export function applyKeysetCursor<Q extends OrFilterable<Q>>(query: Q, column: string, cursor: KeysetCursor | undefined): Q {
  if (!cursor) return query;
  return query.or(`${column}.lt.${cursor.value},and(${column}.eq.${cursor.value},id.lt.${cursor.id})`);
}

/** The cursor for the NEXT page, derived from this page's raw rows — `null` once a page comes back shorter than requested (there's nothing left). */
export function nextCursorFrom<Row extends { id: string }>(rows: Row[], limit: number, valueOf: (row: Row) => string): KeysetCursor | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  return { value: valueOf(last), id: last.id };
}
