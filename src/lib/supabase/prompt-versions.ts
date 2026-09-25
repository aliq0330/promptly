import { supabase } from "./client";
import type { PromptVersion } from "@/types";

interface PromptVersionRow {
  id: string;
  prompt_id: string;
  version_number: number;
  title: string;
  description: string;
  prompt_text: string;
  tool: string | null;
  source: PromptVersion["source"];
  suggestion_id: string | null;
  created_by: string;
  created_at: string;
}

const PROMPT_VERSION_SELECT =
  "id, prompt_id, version_number, title, description, prompt_text, tool, source, suggestion_id, created_by, created_at";

function mapPromptVersionRow(row: PromptVersionRow): PromptVersion {
  return {
    id: row.id,
    promptId: row.prompt_id,
    versionNumber: row.version_number,
    title: row.title,
    description: row.description,
    promptText: row.prompt_text,
    tool: row.tool,
    source: row.source,
    suggestionId: row.suggestion_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * A real prompt's full version history, newest first — publicly readable
 * wherever the prompt itself is (RLS, `20260919390000_prompt_edit_
 * suggestions.sql`). Resolves to `[]` for a prompt that's never had a
 * meaningful edit yet (no version has ever been created), which is the
 * honest, common case — not an error.
 */
export async function fetchVersionsForPrompt(promptId: string): Promise<PromptVersion[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_versions")
      .select(PROMPT_VERSION_SELECT)
      .eq("prompt_id", promptId)
      .order("version_number", { ascending: false });
    if (error) {
      console.error("fetchVersionsForPrompt", error);
      return [];
    }
    return ((data ?? []) as PromptVersionRow[]).map(mapPromptVersionRow);
  } catch (err) {
    console.error("fetchVersionsForPrompt", err);
    return [];
  }
}
