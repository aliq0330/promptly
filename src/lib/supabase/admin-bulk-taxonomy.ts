import { supabase } from "./client";
import { fetchAllRows } from "./paged";
import { runChunks, undoItems, type ChunkOutcome, type TaxonomyChange, type TaxonomyRow } from "@/lib/exchange";

/**
 * Moderator bulk type / category assignment for the moderator's OWN prompts (docs/history/260-*). The file → plan step is pure
 * (`planCategorization`); every write goes through `admin_bulk_set_prompt_taxonomy`, which re-checks `is_moderator()`, touches only
 * the caller's own prompts, validates the values against the live taxonomy tables and — unless told to overwrite — leaves prompts
 * that already have a category alone.
 */

/** Items per RPC call (the function accepts at most 200). */
export const BULK_TAXONOMY_CHUNK = 100;

interface TaxonomyDbRow {
  id: string;
  title: string;
  content_type: string;
  category: string | null;
  subcategory: string | null;
}

/** The caller's own non-community, non-deleted original prompts — id, title and current taxonomy only (no prompt text: it is the heavy column). */
export async function fetchOwnTaxonomyRows(userId: string): Promise<{ rows: TaxonomyRow[]; truncated: boolean }> {
  const { rows, truncated } = await fetchAllRows<TaxonomyDbRow>((from, to) =>
    supabase
      .from("prompts")
      .select("id, title, content_type, category, subcategory")
      .eq("author_id", userId)
      .is("community_id", null)
      .is("deleted_at", null)
      .eq("origin_type", "original")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return {
    rows: rows.map((row) => ({ id: row.id, title: row.title, contentType: row.content_type, category: row.category, subcategory: row.subcategory })),
    truncated,
  };
}

export interface TaxonomyApplyOutcome extends ChunkOutcome {
  /** Items the server refused (value not in the live taxonomy); never written. */
  invalid: number;
  /** Subcategory the live taxonomy did not know: the category was written, the subcategory left empty. */
  subcategoryDropped: number;
  /** Prompts that already had a category and were therefore skipped (overwrite off). */
  alreadyCategorized: number;
}

interface RpcResult {
  affected: number;
  skipped: number;
  invalid: unknown[];
  not_mine: number;
  already_categorized: number;
  subcategory_dropped: number;
}

interface WireItem {
  id: string;
  content_type: string;
  category: string | null;
  subcategory: string | null;
}

async function runItems(
  items: WireItem[],
  overwrite: boolean,
  options: { onProgress?: (p: TaxonomyApplyOutcome) => void; shouldStop?: () => boolean },
): Promise<TaxonomyApplyOutcome> {
  const extra = { invalid: 0, subcategoryDropped: 0, alreadyCategorized: 0 };
  const byId = new Map(items.map((item) => [item.id, item]));
  const outcome = await runChunks(
    items.map((item) => item.id),
    BULK_TAXONOMY_CHUNK,
    async (ids) => {
      const { data, error } = await supabase.rpc("admin_bulk_set_prompt_taxonomy", { p_items: ids.map((id) => byId.get(id)), p_overwrite: overwrite });
      if (error) throw new Error(error.message);
      const result = data as RpcResult;
      extra.invalid += result.invalid?.length ?? 0;
      extra.subcategoryDropped += result.subcategory_dropped ?? 0;
      extra.alreadyCategorized += result.already_categorized ?? 0;
      return { affected: result.affected, skipped: result.skipped };
    },
    { onProgress: (progress) => options.onProgress?.({ ...progress, ...extra }), shouldStop: options.shouldStop },
  );
  return { ...outcome, ...extra };
}

/** Writes the planned changes in chunks of 100 (each chunk atomic; a stopped / failed run can simply be started again — written prompts are skipped as unchanged). */
export function applyTaxonomyChanges(
  changes: TaxonomyChange[],
  overwrite: boolean,
  options: { onProgress?: (p: TaxonomyApplyOutcome) => void; shouldStop?: () => boolean } = {},
): Promise<TaxonomyApplyOutcome> {
  return runItems(
    changes.map((change) => ({ id: change.id, content_type: change.type, category: change.category, subcategory: change.subcategory })),
    overwrite,
    options,
  );
}

/** Puts the BEFORE values back (type, category and subcategory — empty ones become empty again). Needs overwrite: the prompts are categorized by now. */
export function undoTaxonomyChanges(
  changes: Pick<TaxonomyChange, "id" | "previous">[],
  options: { onProgress?: (p: TaxonomyApplyOutcome) => void; shouldStop?: () => boolean } = {},
): Promise<TaxonomyApplyOutcome> {
  return runItems(undoItems(changes), true, options);
}
