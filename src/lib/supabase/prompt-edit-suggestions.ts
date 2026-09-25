import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { PromptEditSuggestion } from "@/types";

interface SuggestionRow {
  id: string;
  prompt_id: string;
  owner_id: string;
  suggestion_text: string;
  proposed_prompt_text: string | null;
  status: PromptEditSuggestion["status"];
  created_at: string;
  resolved_at: string | null;
  accepted_version_id: string | null;
  profiles: ProfileRow;
}

const SUGGESTION_SELECT = `
  id, prompt_id, owner_id, suggestion_text, proposed_prompt_text, status, created_at, resolved_at, accepted_version_id,
  profiles:proposer_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapSuggestionRow(row: SuggestionRow): PromptEditSuggestion {
  return {
    id: row.id,
    promptId: row.prompt_id,
    proposer: mapProfileRow(row.profiles),
    ownerId: row.owner_id,
    suggestionText: row.suggestion_text,
    proposedPromptText: row.proposed_prompt_text,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    acceptedVersionId: row.accepted_version_id,
  };
}

/**
 * Every edit suggestion on one prompt, newest first — RLS only ever lets
 * this resolve to real rows for the caller's own suggestions (as proposer)
 * or the prompt's own owner (see `20260919390000_prompt_edit_suggestions.
 * sql`), so calling this for someone else's prompt as neither always
 * safely resolves to `[]`, same precedent as `fetchEditHistory`.
 */
export async function fetchSuggestionsForPrompt(promptId: string): Promise<PromptEditSuggestion[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_edit_suggestions")
      .select(SUGGESTION_SELECT)
      .eq("prompt_id", promptId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchSuggestionsForPrompt", error);
      return [];
    }
    return ((data ?? []) as unknown as SuggestionRow[]).map(mapSuggestionRow);
  } catch (err) {
    console.error("fetchSuggestionsForPrompt", err);
    return [];
  }
}

/**
 * Whether the signed-in user already has a PENDING suggestion on this
 * prompt — a friendly, client-side pre-check for §16's "aynı kullanıcının
 * aynı prompta art arda sınırsız öneri göndermesi" rule. The real,
 * unbypassable guarantee is the database's own partial unique index
 * (`prompt_edit_suggestions_one_pending_per_pair`); this only avoids
 * showing a raw constraint-violation error instead of a Turkish sentence.
 */
export async function fetchOwnPendingSuggestion(promptId: string, proposerId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("prompt_edit_suggestions")
      .select("id")
      .eq("prompt_id", promptId)
      .eq("proposer_id", proposerId)
      .eq("status", "pending")
      .maybeSingle();
    if (error) {
      console.error("fetchOwnPendingSuggestion", error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("fetchOwnPendingSuggestion", err);
    return false;
  }
}

/**
 * Sends a real, permanent edit suggestion to a prompt's real owner —
 * `owner_id`/`status` are never trusted from here, a `BEFORE INSERT`
 * trigger fills/validates them server-side (also rejects self-suggestions
 * and suggestions on an unpublished prompt). Never touches the prompt
 * itself — see `acceptEditSuggestion` for the only path that actually can.
 */
export async function proposeEditSuggestion(
  promptId: string,
  proposerId: string,
  suggestionText: string,
  proposedPromptText: string,
): Promise<void> {
  const { error } = await supabase.from("prompt_edit_suggestions").insert({
    prompt_id: promptId,
    proposer_id: proposerId,
    suggestion_text: suggestionText.trim(),
    proposed_prompt_text: proposedPromptText.trim() ? proposedPromptText.trim() : null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("Zaten bekleyen bir düzenleme önerin var.");
    }
    throw new Error(error.message);
  }
}

/**
 * The ONLY path that can turn a suggestion into a real prompt change —
 * `accept_prompt_edit_suggestion` (`SECURITY DEFINER` RPC) re-verifies
 * ownership + pending status itself (never trusts RLS/this call alone),
 * updates the real prompt, creates a real `prompt_versions` snapshot, marks
 * the suggestion accepted, and notifies its proposer — all in one
 * transaction. `finalPromptText` is whatever the owner decided to actually
 * publish (defaults to the proposer's own suggested text in the UI, but the
 * owner may edit it first — §18's "kabul etmeden gerçek prompt
 * değiştirilmemeli" is enforced by requiring this explicit, owner-reviewed
 * argument rather than silently reusing `proposed_prompt_text`).
 */
export async function acceptEditSuggestion(suggestionId: string, finalPromptText: string): Promise<void> {
  const { error } = await supabase.rpc("accept_prompt_edit_suggestion", {
    p_suggestion_id: suggestionId,
    p_final_prompt_text: finalPromptText,
  });
  if (error) throw new Error(error.message);
}

/** Rejects a suggestion — the prompt is never touched, only `status`/`resolved_at` change (`reject_prompt_edit_suggestion` RPC). */
export async function rejectEditSuggestion(suggestionId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_prompt_edit_suggestion", { p_suggestion_id: suggestionId });
  if (error) throw new Error(error.message);
}
