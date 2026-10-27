import { supabase } from "./client";
import { fetchAllRows } from "./paged";
import { translateForRuntime } from "@/lib/i18n/translations";
import { normalizeVariable, parseStoredConfig, parseStoredOptions, parseStoredType } from "@/lib/prompt-variable-types";
import type { PromptVariable, PromptVariableSpec } from "@/types";

interface PromptVariableRow {
  id: string;
  prompt_id: string;
  name: string;
  default_value: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Added by 20260919730000_prompt_variable_types.sql — absent on a project
  // that hasn't applied it yet, in which case every variable reads as text.
  type?: string | null;
  options?: unknown;
  config?: unknown;
}

const LEGACY_VARIABLE_SELECT = "id, prompt_id, name, default_value, description, sort_order, created_at, updated_at";
const VARIABLE_SELECT = `${LEGACY_VARIABLE_SELECT}, type, options, config`;

function mapVariableRow(row: PromptVariableRow): PromptVariable {
  return {
    id: row.id,
    promptId: row.prompt_id,
    name: row.name,
    defaultValue: row.default_value,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    type: parseStoredType(row.type),
    options: parseStoredOptions(row.options),
    config: parseStoredConfig(row.config),
  };
}

/** Every real variable definition for one real prompt, in author-defined order — public wherever the prompt itself is (RLS, see migration). */
export async function fetchVariablesForPrompt(promptId: string): Promise<PromptVariable[]> {
  try {
    const read = (columns: string) =>
      supabase.from("prompt_variables").select(columns).eq("prompt_id", promptId).order("sort_order", { ascending: true });
    let result = await read(VARIABLE_SELECT);
    // 42703 = undefined_column: the typed-variables migration isn't applied
    // yet. Read the legacy columns instead of losing every variable.
    if (result.error?.code === "42703") result = await read(LEGACY_VARIABLE_SELECT);
    if (result.error) {
      console.error("fetchVariablesForPrompt", result.error);
      return [];
    }
    return ((result.data ?? []) as unknown as PromptVariableRow[]).map(mapVariableRow);
  } catch (err) {
    console.error("fetchVariablesForPrompt", err);
    return [];
  }
}

/** Several prompts' variable definitions in one round trip (export) — grouped by prompt id, each list in author-defined order. */
export async function fetchVariablesForPrompts(promptIds: string[]): Promise<Map<string, PromptVariable[]>> {
  const grouped = new Map<string, PromptVariable[]>();
  const CHUNK = 50;
  // Small id lists keep the request URL short; a 3000-prompt export is ~60 requests, run a few at a time instead of one after the other.
  const PARALLEL = 6;
  const chunks: string[][] = [];
  for (let at = 0; at < promptIds.length; at += CHUNK) chunks.push(promptIds.slice(at, at + CHUNK));
  const readChunk = async (ids: string[]) => {
    // Paged too: a chunk of prompts with many variables each can pass PostgREST's 1000-row answer.
    let legacy = false;
    const { rows } = await fetchAllRows(async (from, to) => {
      const read = (columns: string) =>
        supabase.from("prompt_variables").select(columns).in("prompt_id", ids).order("sort_order", { ascending: true }).order("id", { ascending: true }).range(from, to);
      let result = await read(legacy ? LEGACY_VARIABLE_SELECT : VARIABLE_SELECT);
      if (result.error?.code === "42703" && !legacy) {
        legacy = true;
        result = await read(LEGACY_VARIABLE_SELECT);
      }
      return result as unknown as { data: PromptVariableRow[] | null; error: { message: string } | null };
    });
    return rows;
  };
  const byChunk: PromptVariableRow[][] = [];
  for (let at = 0; at < chunks.length; at += PARALLEL) {
    byChunk.push(...(await Promise.all(chunks.slice(at, at + PARALLEL).map(readChunk))));
  }
  for (const rows of byChunk) {
    for (const row of rows) {
      const list = grouped.get(row.prompt_id) ?? [];
      list.push(mapVariableRow(row));
      grouped.set(row.prompt_id, list);
    }
  }
  return grouped;
}

export interface VariableDraft extends Partial<PromptVariableSpec> {
  name: string;
  defaultValue: string;
  description: string | null;
}

/**
 * Genuinely, permanently replaces a real prompt's variable list — delete-
 * all-then-insert-fresh rather than a diffed update. Safe here (unlike a
 * general-purpose CRUD list) because RLS lets only the prompt's own author
 * ever call this, and this app has no concurrent multi-editor scenario for
 * a single prompt — so there's no risk of one editor's change silently
 * clobbering another's mid-flight. Called on every "Kaydet"/"Paylaş" of the
 * prompt editor, whether or not the variable list actually changed.
 */
export async function replaceVariablesForPrompt(promptId: string, drafts: VariableDraft[]): Promise<PromptVariable[]> {
  const { error: deleteError } = await supabase.from("prompt_variables").delete().eq("prompt_id", promptId);
  if (deleteError) throw new Error(deleteError.message);
  if (drafts.length === 0) return [];

  // Normalize each draft against its own kind so a stored row can never
  // contradict its type (e.g. a select whose default isn't one of its options).
  const normalized = drafts.map((draft) => {
    const { spec, defaultValue } = normalizeVariable(
      { type: draft.type ?? "text", options: draft.options ?? [], config: draft.config ?? {} },
      draft.defaultValue,
    );
    return { draft, spec, defaultValue };
  });
  // "Plain" = a text variable with nothing in `config` (no condition either).
  const isPlain = (spec: PromptVariableSpec) => spec.type === "text" && Object.keys(spec.config).length === 0;
  const anyTyped = normalized.some((item) => !isPlain(item.spec));

  const { data, error: insertError } = await supabase
    .from("prompt_variables")
    .insert(
      normalized.map(({ draft, spec, defaultValue }, index) => ({
        prompt_id: promptId,
        name: draft.name,
        default_value: defaultValue,
        description: draft.description,
        sort_order: index,
        // Plain text variables omit the typed columns so saving keeps working
        // on a project that hasn't applied the typed-variables migration yet.
        ...(isPlain(spec) ? {} : { type: spec.type, options: spec.options, config: spec.config }),
      })),
    )
    .select(anyTyped ? VARIABLE_SELECT : LEGACY_VARIABLE_SELECT);
  if (insertError || !data) throw new Error(insertError?.message ?? translateForRuntime("variable.saveFailed"));
  return (data as unknown as PromptVariableRow[]).map(mapVariableRow);
}
