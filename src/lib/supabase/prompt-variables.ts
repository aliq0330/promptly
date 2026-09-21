import { supabase } from "./client";
import type { PromptVariable } from "@/types";

interface PromptVariableRow {
  id: string;
  prompt_id: string;
  name: string;
  default_value: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const VARIABLE_SELECT = "id, prompt_id, name, default_value, description, sort_order, created_at, updated_at";

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
  };
}

/** Every real variable definition for one real prompt, in author-defined order — public wherever the prompt itself is (RLS, see migration). */
export async function fetchVariablesForPrompt(promptId: string): Promise<PromptVariable[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_variables")
      .select(VARIABLE_SELECT)
      .eq("prompt_id", promptId)
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("fetchVariablesForPrompt", error);
      return [];
    }
    return ((data ?? []) as PromptVariableRow[]).map(mapVariableRow);
  } catch (err) {
    console.error("fetchVariablesForPrompt", err);
    return [];
  }
}

export interface VariableDraft {
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

  const { data, error: insertError } = await supabase
    .from("prompt_variables")
    .insert(
      drafts.map((draft, index) => ({
        prompt_id: promptId,
        name: draft.name,
        default_value: draft.defaultValue,
        description: draft.description,
        sort_order: index,
      })),
    )
    .select(VARIABLE_SELECT);
  if (insertError || !data) throw new Error(insertError?.message ?? "Değişkenler kaydedilemedi.");
  return (data as PromptVariableRow[]).map(mapVariableRow);
}
