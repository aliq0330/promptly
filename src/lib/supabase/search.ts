import { supabase } from "./client";
import { hasSearchFilter, sanitizeSearchText, type ContentSearchFilters } from "./taxonomy-query";

export type SearchKind = "prompt" | "request" | "workflow" | "preset";

/** Keyset position of the last row of a search page: `(sort_rank, created_at, id)` of `public.search_content`. */
export interface SearchCursor {
  rank: number;
  createdAt: string;
  id: string;
}

export interface SearchPage<T> {
  items: T[];
  nextCursor: SearchCursor | null;
}

interface SearchRow {
  id: string;
  created_at: string;
  sort_rank: number | string;
}

/**
 * Runs `public.search_content` (migration 20260919780000) and returns the ids of
 * one page in result order plus the cursor for the next page.
 *
 * Everything user-controlled is passed as an RPC PARAMETER, never spliced into
 * a PostgREST filter string: the text goes through `sanitizeSearchText` (the
 * same sanitiser the old `.or(...)` searches used) and the function itself
 * escapes the ILIKE wildcards. That is also why the cursor is not a second
 * `.or()` call — PostgREST has no documented combination semantics for two of
 * them (see pagination.ts), while a function with explicit parameters has none
 * of that ambiguity.
 *
 * The match covers title + description and the kind's body column (a prompt's
 * `prompt_text`, a request's `creative_direction`). Workflows and presets have
 * no other body column on their row.
 */
export async function searchContentIds(
  kind: SearchKind,
  query: string,
  filters: ContentSearchFilters,
  limit: number,
  cursor?: SearchCursor | null,
): Promise<{ ids: string[]; nextCursor: SearchCursor | null }> {
  const text = sanitizeSearchText(query);
  if (!text && !hasSearchFilter(filters)) return { ids: [], nextCursor: null };

  const authorIds = [...(filters.authorIds ?? []), ...(filters.authorId ? [filters.authorId] : [])];
  const orNull = <T,>(list: T[] | undefined) => (list && list.length > 0 ? list : null);
  const { data, error } = await supabase.rpc("search_content", {
    p_kind: kind,
    p_query: text || null,
    p_sort: filters.sort ?? "relevant",
    p_author_ids: orNull(authorIds),
    p_content_types: orNull(filters.contentTypes),
    p_content_type: filters.taxonomy?.contentType ?? null,
    p_category: filters.taxonomy?.category ?? null,
    p_subcategory: filters.taxonomy?.subcategory ?? null,
    p_tag_slugs: orNull(filters.tagSlugs),
    p_tool_refs: orNull(filters.toolRefs),
    p_limit: limit,
    p_after_rank: cursor ? cursor.rank : null,
    p_after_created_at: cursor ? cursor.createdAt : null,
    p_after_id: cursor ? cursor.id : null,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SearchRow[];
  const last = rows[rows.length - 1];
  // The cursor comes from the RAW rows: hydration may drop some (blocked author), but the next page must continue after the last row the database returned.
  const nextCursor = rows.length >= Math.min(limit, 50) && last ? { rank: Number(last.sort_rank), createdAt: last.created_at, id: last.id } : null;
  return { ids: rows.map((row) => row.id), nextCursor };
}

/** Puts hydrated rows back into the order the search returned them in (rows that vanished in between are skipped). */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
