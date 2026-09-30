import { sanitizeTaxonomy, type ContentTypeId, type TaxonomyFilterValue } from "@/lib/content-taxonomy";

/** Filters shared by prompt / generator / request queries — the same taxonomy levels everywhere. */
export interface ContentSearchFilters {
  taxonomy?: TaxonomyFilterValue;
  /** Restrict to one author (prompts/requests) or creator (generators). */
  authorId?: string;
  /** Advanced search (chips). Same-kind chips are OR (users, media types, tools); tags are AND. */
  authorIds?: string[];
  contentTypes?: ContentTypeId[];
  tagSlugs?: string[];
  /** Catalog tool refs ("toolId" / "toolId:modelId") — matches when any is in the row's `tools`. */
  toolRefs?: string[];
  sort?: "relevant" | "new" | "popular";
}

/** True when any filter narrows the search (so an empty text query is still a real search). */
export function hasSearchFilter(f: ContentSearchFilters): boolean {
  return Boolean(
    f.authorId || f.taxonomy?.contentType || f.authorIds?.length || f.contentTypes?.length || f.tagSlugs?.length || f.toolRefs?.length,
  );
}

/** Strips characters that would break a PostgREST `or(...)`/ilike pattern — user text is never interpolated raw. */
export function sanitizeSearchText(text: string): string {
  return text.trim().replace(/[%,()*\\"]/g, "").slice(0, 80);
}

/** One aliased inner embed per tag (`t0`, `t1`, ...) so several tags can be AND-ed server-side. */
export function tagJoinSelect(table: "prompt_tags" | "prompt_request_tags" | "generator_tags", slugs: string[] | undefined): string {
  return (slugs ?? []).map((_, i) => `, t${i}:${table}!inner(tag_slug)`).join("");
}

interface AdvancedBuilder<T> {
  in: (column: string, values: string[]) => T;
  overlaps: (column: string, values: string[]) => T;
  eq: (column: string, value: string) => T;
}

/** Applies the advanced filters (authors, media types, tags, tools) on top of the taxonomy filter. */
export function applyAdvancedFilters<T extends AdvancedBuilder<T>>(query: T, filters: ContentSearchFilters, authorColumn: string): T {
  let q = query;
  if (filters.authorIds?.length) q = q.in(authorColumn, filters.authorIds);
  if (filters.contentTypes?.length) q = q.in("content_type", filters.contentTypes);
  (filters.tagSlugs ?? []).forEach((slug, i) => {
    q = q.eq(`t${i}.tag_slug`, slug);
  });
  if (filters.toolRefs?.length) q = q.overlaps("tools", filters.toolRefs);
  return q;
}

/** Adds `content_type` / `category` / `subcategory` equality filters for whichever levels are set. */
export function applyTaxonomyFilter<T extends { eq: (column: string, value: string) => T }>(query: T, filter?: TaxonomyFilterValue): T {
  let q = query;
  if (filter?.contentType) q = q.eq("content_type", filter.contentType);
  if (filter?.category) q = q.eq("category", filter.category);
  if (filter?.subcategory) q = q.eq("subcategory", filter.subcategory);
  return q;
}

/** `category` / `subcategory` columns for an insert, dropping anything that isn't a real taxonomy node for the type. */
export function taxonomyColumns(
  contentType: ContentTypeId,
  category: string | null | undefined,
  subcategory: string | null | undefined,
): { category: string | null; subcategory: string | null } {
  return sanitizeTaxonomy(contentType, category, subcategory);
}
