import { supabase } from "./client";
import { fetchAllRows } from "./paged";
import { fetchPromptById, mapPromptRow, PROMPT_SELECT, type PromptRow } from "./prompts";
import { fetchVariablesForPrompt, fetchVariablesForPrompts } from "./prompt-variables";
import { ADMIN_IMPORT_LIMITS, runBatches, toExchangePrompt, withSourceNote, type BulkBatchReport, type BulkOutcome, type BulkProgress, type ExchangePrompt } from "@/lib/exchange";
import { shareLinkForHref } from "@/lib/share-link";
import { absoluteUrl, promptHref } from "@/lib/utils";

/** What goes over the wire: the credit is folded into the description (`withSourceNote`); the separate `source` field is not sent. */
function forServer(item: ExchangePrompt): ExchangePrompt {
  const payload = { ...withSourceNote(item) };
  delete payload.source;
  return payload;
}

/**
 * Every prompt the member owns — drafts and "Sadece ben" included — with its variable definitions, newest first. Community-only
 * content stays in its community (`community_id is null`, docs/history/179-*). RLS is the access check; nothing here widens it.
 * Read a page at a time (PostgREST stops at 1000 per request — a 3000-prompt library used to export only its newest 1000, silently).
 * Throws when a page fails: half a file must never look like the whole library.
 */
export async function fetchOwnPromptsForExport(userId: string): Promise<ExchangePrompt[]> {
  const { rows } = await fetchAllRows((from, to) =>
    supabase
      .from("prompts")
      .select(PROMPT_SELECT)
      .eq("author_id", userId)
      .is("community_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  const prompts = rows.map((row) => mapPromptRow(row as unknown as PromptRow));
  const variables = await fetchVariablesForPrompts(prompts.map((prompt) => prompt.id));
  return prompts.map((prompt) => toExchangePrompt(prompt, variables.get(prompt.id) ?? []));
}

/**
 * One prompt for the "Dışa aktar" menu item. Null when it is gone or not readable (RLS decides, so someone else's private/draft prompt
 * is never reachable); community-only content is never exported. Somebody ELSE'S prompt carries a credit (author handle + its Promptly
 * link) so the file keeps its provenance — an import writes it back as a trailing "Kaynak:" line (`withSourceNote`).
 */
export async function fetchPromptForExport(promptId: string, viewerId?: string | null): Promise<ExchangePrompt | null> {
  const prompt = await fetchPromptById(promptId);
  if (!prompt || prompt.deletedAt || prompt.communityId) return null;
  const credit = viewerId && prompt.author.id === viewerId ? null : { credit: `@${prompt.author.username} · Promptly`, url: absoluteUrl(shareLinkForHref(promptHref(prompt))) };
  return toExchangePrompt(prompt, await fetchVariablesForPrompt(promptId), credit);
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
  const { data, error } = await supabase.rpc("import_prompts", { p_items: items.map(forServer), p_dry_run: dryRun });
  if (error) throw new Error(error.message);
  return data as ImportReport;
}

/**
 * Moderator bulk upload (docs/history/251-*): no total limit — the list is sent in `ADMIN_IMPORT_LIMITS.batch`-sized calls to
 * `admin_import_prompts` (each call atomic, 30+ prompts allowed, prompt rate limit exempt for moderators only). `dryRun` validates
 * everything and writes nothing. An interrupted run is safe to repeat: already-imported prompts come back as duplicates.
 */
export function runAdminImport(
  items: ExchangePrompt[],
  options: { dryRun: boolean; publish: boolean; source: string; onProgress?: (progress: BulkProgress) => void; shouldStop?: () => boolean },
): Promise<BulkOutcome> {
  return runBatches(
    items,
    ADMIN_IMPORT_LIMITS.batch,
    async (batch): Promise<BulkBatchReport> => {
      const { data, error } = await supabase.rpc("admin_import_prompts", {
        p_items: batch.map(forServer),
        p_dry_run: options.dryRun,
        p_publish: options.publish,
        p_source: options.source,
      });
      if (error) throw new Error(error.message);
      return data as BulkBatchReport;
    },
    { onProgress: options.onProgress, shouldStop: options.shouldStop },
  );
}
