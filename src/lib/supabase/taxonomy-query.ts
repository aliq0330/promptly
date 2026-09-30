import { sanitizeTaxonomy, type ContentTypeId, type TaxonomyFilterValue } from "@/lib/content-taxonomy";

/** Filters shared by prompt / generator / request queries — the same taxonomy levels everywhere. */
export interface ContentSearchFilters {
  taxonomy?: TaxonomyFilterValue;
  /** Restrict to one author (prompts/requests) or creator (generators). */
  authorId?: string;
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
