import { supabase } from "./client";

/**
 * Records that the signed-in viewer copied / ran a public prompt
 * (`public.record_prompt_copy`, migration 20260919850000). The database counts
 * one use per person per prompt per day, ignores the author's own copies,
 * drafts and private prompts, and ignores callers without a session.
 *
 * Best-effort and fire-and-forget: a copy must never fail, wait or show an
 * error because the counter could not be reached. Returns whether this call
 * was counted (for tests/diagnostics only).
 */
export async function recordPromptCopy(promptId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("record_prompt_copy", { p_prompt_id: promptId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
