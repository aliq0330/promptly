import { supabase } from "./client";
import { runChunks, type ChunkOutcome } from "@/lib/exchange";

/**
 * Moderator tool (docs/history/253-*): turns `${Name:Default}` template syntax (prompts.chat and friends) into real Promptly variables —
 * `{Name}` in the text + a `prompt_variables` row carrying the default. The preview and the write run the same SQL converter
 * (`_template_var_convert`), so what the preview lists is exactly what gets written. `own` = only the caller's own prompts; `all` =
 * everybody's (community-only and deleted prompts are never touched either way).
 */

export type TemplateScope = "own" | "all";

/** Prompts per RPC call (the function accepts at most 200). */
export const TEMPLATE_CHUNK = 100;
/** Candidates fetched per preview (the server caps it at 1000); anything beyond shows up on the next scan. */
export const TEMPLATE_PREVIEW_LIMIT = 1000;

export interface TemplateVariablePreview {
  name: string;
  /** Default value taken from `${Name:Default}` ("" when none). */
  defaultValue: string;
  /** The prompt already defines this variable: its row is reused, no new one is added. */
  existing: boolean;
}

export interface TemplateCandidate {
  id: string;
  title: string;
  author: string | null;
  status: "draft" | "published";
  variables: TemplateVariablePreview[];
  /** Same name with different defaults in one prompt: the first non-empty one wins. */
  conflicts: number;
}

export interface TemplateScan {
  /** Every convertible prompt in the scope (the list below may be shorter). */
  total: number;
  items: TemplateCandidate[];
}

interface ScanRow {
  id: string;
  title: string;
  author: string | null;
  status: "draft" | "published";
  variables: { name: string; default: string; existing: boolean }[];
  conflicts: number;
}

export async function scanTemplateVariables(scope: TemplateScope): Promise<TemplateScan> {
  const { data, error } = await supabase.rpc("admin_template_variables_candidates", { p_scope: scope, p_limit: TEMPLATE_PREVIEW_LIMIT });
  if (error) throw new Error(error.message);
  const result = data as { total: number; items: ScanRow[] };
  return {
    total: Number(result.total ?? 0),
    items: (result.items ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      status: row.status,
      conflicts: Number(row.conflicts ?? 0),
      variables: (row.variables ?? []).map((variable) => ({ name: variable.name, defaultValue: variable.default ?? "", existing: Boolean(variable.existing) })),
    })),
  };
}

export interface TemplateConvertOutcome extends ChunkOutcome {
  /** New `prompt_variables` rows written. */
  variables: number;
  conflicts: number;
}

interface ConvertCounts {
  affected: number;
  skipped: number;
  variables: number;
  conflicts: number;
}

/** Converts the given prompt ids in chunks. A failed or stopped run is safe to repeat: converted prompts no longer match and count as skipped. */
export async function convertTemplateVariables(
  ids: string[],
  scope: TemplateScope,
  options: { onProgress?: (p: TemplateConvertOutcome) => void; shouldStop?: () => boolean } = {},
): Promise<TemplateConvertOutcome> {
  let variables = 0;
  let conflicts = 0;
  const outcome = await runChunks(
    ids,
    TEMPLATE_CHUNK,
    async (chunk) => {
      const { data, error } = await supabase.rpc("admin_convert_template_variables", { p_ids: chunk, p_scope: scope });
      if (error) throw new Error(error.message);
      const counts = data as ConvertCounts;
      variables += Number(counts.variables ?? 0);
      conflicts += Number(counts.conflicts ?? 0);
      return counts;
    },
    { shouldStop: options.shouldStop, onProgress: options.onProgress && ((progress) => options.onProgress?.({ ...progress, variables, conflicts })) },
  );
  return { ...outcome, variables, conflicts };
}
