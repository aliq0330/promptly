/**
 * PostgREST answers at most 1000 rows per request, so a query without a `range` silently stops at 1000 (a profile with 3000+ prompts
 * showed "1000"; the tag catalogue lost every tag past the 1000th). Lists that really need EVERY row (catalogues, exports) read them
 * page by page with this helper; lists a person scrolls through are paged by the screen instead (`usePagedList`).
 */
export const SUPABASE_PAGE = 1000;

/** Splits a list into parts of `size` (ids written into a URL / an `in(...)` list are sent in parts: hundreds in one address overflow it). */
export function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}
/** Safety ceiling: a list that long is a bug, not data — `truncated` tells the caller instead of looping forever. */
export const FETCH_ALL_MAX = 20_000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * `page(from, to)` runs ONE ranged query (callers add a total order — a unique tie-break such as `id` — or pages could overlap / skip).
 * Throws on the first failed page so the caller never mistakes half a list for the whole one.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  max: number = FETCH_ALL_MAX,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += SUPABASE_PAGE) {
    const { data, error } = await page(from, from + SUPABASE_PAGE - 1);
    if (error) throw new Error(error.message);
    const got = data ?? [];
    rows.push(...got);
    if (got.length < SUPABASE_PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** One page of a list read page by page: `total` is counted with the first page only, `nextOffset` null = the end. */
export interface PagedResult<T> {
  items: T[];
  total: number | null;
  nextOffset: number | null;
}

/** The filters of a person's own list (requests, workflows, presets — and prompts): sort, visibility and a title / description search, all applied by the database. */
export interface OwnedListFilter {
  sort?: "newest" | "oldest" | "most-liked";
  /** Only the owner has both kinds (RLS hides "Sadece ben" from everyone else). */
  visibility?: "all" | "public" | "private";
  search?: string;
}

/** Items per request on a person's own lists (profile tabs, "İçeriklerim"). */
export const OWNED_PAGE = 24;
