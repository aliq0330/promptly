import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { PromptVersion } from "@/types";

interface PromptVersionRow {
  id: string;
  prompt_id: string;
  version_number: number;
  title: string;
  description: string;
  prompt_text: string;
  tool: string | null;
  change_summary: string | null;
  merge_request_id: string | null;
  previous_version_id: string | null;
  created_at: string;
  creator: ProfileRow | null;
}

const VERSION_SELECT = `
  id, prompt_id, version_number, title, description, prompt_text, tool, change_summary,
  merge_request_id, previous_version_id, created_at,
  creator:created_by ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapVersionRow(row: PromptVersionRow): PromptVersion {
  return {
    id: row.id,
    promptId: row.prompt_id,
    versionNumber: row.version_number,
    title: row.title,
    description: row.description,
    promptText: row.prompt_text,
    tool: row.tool,
    changeSummary: row.change_summary,
    mergeRequestId: row.merge_request_id,
    previousVersionId: row.previous_version_id,
    createdBy: row.creator ? mapProfileRow(row.creator) : null,
    createdAt: row.created_at,
  };
}

/**
 * A prompt's real version history, oldest-first — only ever populated by
 * an accepted merge (`_perform_merge_acceptance`, 20260919250000); a
 * prompt that has never received a merge has an empty history (this app
 * has no plain "edit" feature to version in the first place).
 */
export async function fetchVersionsForPrompt(promptId: string): Promise<PromptVersion[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_versions")
      .select(VERSION_SELECT)
      .eq("prompt_id", promptId)
      .order("version_number", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as PromptVersionRow[]).map(mapVersionRow);
  } catch (err) {
    console.error("fetchVersionsForPrompt", err);
    return [];
  }
}
