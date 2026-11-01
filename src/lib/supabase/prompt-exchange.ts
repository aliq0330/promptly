import { supabase } from "./client";
import { chunk, fetchAllRows } from "./paged";
import { fetchPromptById, mapPromptRow, PROMPT_SELECT, type PromptRow } from "./prompts";
import { fetchVariablesForPrompt, fetchVariablesForPrompts } from "./prompt-variables";
import { mapPresetRow, PRESET_SELECT, withFields, type PresetRow } from "./presets";
import { mapRequestRow, REQUEST_SELECT, type RequestRow } from "./requests";
import { mapWorkflowRow, WORKFLOW_SELECT, type WorkflowRow } from "./workflows";
import {
  ADMIN_IMPORT_LIMITS,
  runBatches,
  toExchangePreset,
  toExchangePrompt,
  toExchangeRequest,
  toExchangeWorkflow,
  withSourceNote,
  type BulkBatchReport,
  type BulkOutcome,
  type BulkProgress,
  type ExchangeContentItem,
  type ExchangeContentKind,
  type ExchangePreset,
  type ExchangePrompt,
  type ExchangeRequest,
  type ExchangeWorkflow,
} from "@/lib/exchange";
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

/**
 * Every request the member owns — drafts and "Sadece ben" included — newest first (docs/history/306-*). Community-only requests stay in
 * their community; soft-deleted ones are skipped. Paged like the prompt export; throws when a page fails (half a file is never the whole list).
 */
export async function fetchOwnRequestsForExport(userId: string): Promise<ExchangeRequest[]> {
  const { rows } = await fetchAllRows((from, to) =>
    supabase
      .from("prompt_requests")
      .select(REQUEST_SELECT)
      .eq("author_id", userId)
      .is("community_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return rows.map((row) => toExchangeRequest(mapRequestRow(row as unknown as RequestRow)));
}

/** Every preset the member owns (drafts and private included), without the fields they added themselves (their ids mean nothing elsewhere). */
export async function fetchOwnPresetsForExport(userId: string): Promise<ExchangePreset[]> {
  const { rows } = await fetchAllRows((from, to) =>
    supabase
      .from("presets")
      .select(PRESET_SELECT)
      .eq("creator_id", userId)
      .is("community_id", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  // Kimlik listeleri adrese 100'erli parçalarla yazılır (CLAUDE.md §6 "Bir olay bütün üyelere…"); 3000 hazır ayar tek `in (…)` olmaz.
  const mapped = rows.map((row) => mapPresetRow(row as unknown as PresetRow));
  const presets = (await Promise.all(chunk(mapped, 100).map((part) => withFields(part)))).flat();
  return presets.map(toExchangePreset);
}

/**
 * `import_content` (migration 20261101190000): the request / preset twin of `importPrompts` — validates everything first, then writes private drafts in one
 * transaction; with `dryRun` nothing is written. The database re-validates, so this call is the only authority.
 */
export async function importContent<K extends ExchangeContentKind>(kind: K, items: ExchangeContentItem<K>[], dryRun: boolean): Promise<ImportReport> {
  // Workflow'un adım grafiği ayrı bir RPC'dir (`import_workflows`); İstek / Hazır ayar `import_content`.
  const { data, error } = kind === "workflow"
    ? await supabase.rpc("import_workflows", { p_items: items, p_dry_run: dryRun })
    : await supabase.rpc("import_content", { p_kind: kind, p_items: items, p_dry_run: dryRun });
  if (error) throw new Error(error.message);
  return data as ImportReport;
}

interface WorkflowStepExportRow {
  id: string;
  workflow_id: string;
  position: number;
  title: string;
  description: string;
  instructions: string;
  prompt_id: string | null;
  inputs: { id: string; label: string; source?: { stepId: string; outputId: string } | null }[] | null;
  outputs: { id: string; label: string }[] | null;
}

/**
 * Every workflow the member owns (drafts and private included) with its steps, newest first (docs/history/307-*). A step's prompt reference is
 * written ONLY for prompts that are public + published + not community-only: a private prompt's id/title never reaches the file, and the
 * prompt text is never copied. Steps are read in chunks of 25 workflows (ids go into the URL in small pieces; PostgREST stops at 1000 rows).
 */
export async function fetchOwnWorkflowsForExport(userId: string): Promise<ExchangeWorkflow[]> {
  const { rows } = await fetchAllRows((from, to) =>
    supabase
      .from("workflows")
      .select(WORKFLOW_SELECT)
      .eq("creator_id", userId)
      .is("community_id", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  const workflows = rows.map((row) => mapWorkflowRow(row as unknown as WorkflowRow));
  const stepsByWorkflow = new Map<string, WorkflowStepExportRow[]>();
  for (const part of chunk(workflows, 25)) {
    const { rows: stepRows } = await fetchAllRows((from, to) =>
      supabase
        .from("workflow_steps")
        .select("id, workflow_id, position, title, description, instructions, prompt_id, inputs, outputs")
        .in("workflow_id", part.map((workflow) => workflow.id))
        .order("workflow_id", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const row of stepRows as unknown as WorkflowStepExportRow[]) {
      const list = stepsByWorkflow.get(row.workflow_id) ?? [];
      list.push(row);
      stepsByWorkflow.set(row.workflow_id, list);
    }
  }
  const promptIds = [...new Set([...stepsByWorkflow.values()].flat().map((step) => step.prompt_id).filter((id): id is string => Boolean(id)))];
  const publicPrompts = new Map<string, string>();
  for (const part of chunk(promptIds, 100)) {
    const { data, error } = await supabase
      .from("prompts")
      .select("id, title")
      .in("id", part)
      .eq("status", "published")
      .eq("visibility", "public")
      .is("community_id", null)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string; title: string }[]) publicPrompts.set(row.id, row.title);
  }
  const publicIds = new Set(publicPrompts.keys());
  return workflows.map((workflow) =>
    toExchangeWorkflow(
      {
        ...workflow,
        steps: (stepsByWorkflow.get(workflow.id) ?? []).map((step) => ({
          id: step.id,
          title: step.title,
          description: step.description,
          instructions: step.instructions,
          content: step.prompt_id && publicPrompts.has(step.prompt_id) ? { id: step.prompt_id, title: publicPrompts.get(step.prompt_id) as string } : null,
          inputs: (step.inputs ?? []).map((input) => ({ id: input.id, label: input.label, source: input.source ?? null })),
          outputs: (step.outputs ?? []).map((output) => ({ id: output.id, label: output.label })),
        })),
      },
      publicIds,
    ),
  );
}
