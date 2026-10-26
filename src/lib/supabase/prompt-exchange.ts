import { supabase } from "./client";
import { fetchPromptById, mapPromptRow, PROMPT_SELECT, type PromptRow } from "./prompts";
import { fetchVariablesForPrompt, fetchVariablesForPrompts } from "./prompt-variables";
import { toExchangePrompt, type ExchangePrompt } from "@/lib/exchange";

/** Export reads at most this many of the member's prompts (PostgREST's own page size is 1000). */
const EXPORT_LIMIT = 1000;

/**
 * Every prompt the member owns — drafts and "Sadece ben" included — with its variable definitions, newest first. Community-only
 * content stays in its community (`community_id is null`, docs/history/179-*). RLS is the access check; nothing here widens it.
 */
export async function fetchOwnPromptsForExport(userId: string): Promise<ExchangePrompt[]> {
  const { data, error } = await supabase
    .from("prompts")
    .select(PROMPT_SELECT)
    .eq("author_id", userId)
    .is("community_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(0, EXPORT_LIMIT - 1);
  if (error) throw new Error(error.message);
  const prompts = (data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow));
  const variables = await fetchVariablesForPrompts(prompts.map((prompt) => prompt.id));
  return prompts.map((prompt) => toExchangePrompt(prompt, variables.get(prompt.id) ?? []));
}

/** One prompt for the "Dışa aktar" menu item. Null when it is gone or not readable; community-only content is never exported. */
export async function fetchPromptForExport(promptId: string): Promise<ExchangePrompt | null> {
  const prompt = await fetchPromptById(promptId);
  if (!prompt || prompt.deletedAt || prompt.communityId) return null;
  return toExchangePrompt(prompt, await fetchVariablesForPrompt(promptId));
}

export type ImportItemStatus = "ok" | "duplicate" | "invalid";

/** One line of `import_prompts`' answer; `index` is 1-based within the array that was sent. */
export interface ImportItemResult {
  index: number;
  status: ImportItemStatus;
  field?: string;
  code?: string;
  warnings?: string[];
  id?: string;
}

export interface ImportReport {
  dryRun: boolean;
  ok: boolean;
  created: number;
  items: ImportItemResult[];
}

/**
 * `import_prompts` (migration 20260927100000): validates everything first, then writes private drafts in one transaction. With
 * `dryRun` nothing is written. The database re-validates the same rules as `parsePrompts`, so this call is the only authority.
 */
export async function importPrompts(items: ExchangePrompt[], dryRun: boolean): Promise<ImportReport> {
  const { data, error } = await supabase.rpc("import_prompts", { p_items: items, p_dry_run: dryRun });
  if (error) throw new Error(error.message);
  return data as ImportReport;
}
