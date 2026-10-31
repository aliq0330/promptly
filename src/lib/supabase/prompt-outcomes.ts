import { supabase } from "./client";
import type { OutcomeStatRow, PromptOutcome } from "@/lib/prompt-outcomes";

/** The viewer's own answer for one prompt on one tool (`prompt_outcomes`, owner-read). `tool` is "" when none was named. */
export interface MyOutcome {
  outcome: PromptOutcome;
  tool: string;
  toolVersion: string;
}

/** Community result per tool + version (`prompt_outcome_stats`; readable by visitors, empty for a prompt the viewer cannot see). */
export async function fetchOutcomeStats(promptId: string): Promise<OutcomeStatRow[]> {
  const { data, error } = await supabase.rpc("prompt_outcome_stats", { p_prompt_id: promptId });
  if (error || !Array.isArray(data)) return [];
  return (data as { tool: string; tool_version: string; worked: number; partial: number; failed: number }[]).map((row) => ({
    tool: row.tool ?? "",
    toolVersion: row.tool_version ?? "",
    worked: row.worked ?? 0,
    partial: row.partial ?? 0,
    failed: row.failed ?? 0,
  }));
}

/** Whether the signed-in viewer has copied this prompt before — the only people who may answer "Çalıştı mı?". */
export async function hasCopiedPrompt(promptId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_copied_prompt", { p_prompt_id: promptId });
  return !error && data === true;
}

export async function fetchMyOutcomes(promptId: string, userId: string): Promise<MyOutcome[]> {
  const { data, error } = await supabase.from("prompt_outcomes").select("outcome, tool, tool_version").eq("prompt_id", promptId).eq("user_id", userId).limit(50);
  if (error || !data) return [];
  return (data as { outcome: PromptOutcome; tool: string; tool_version: string }[]).map((row) => ({ outcome: row.outcome, tool: row.tool ?? "", toolVersion: row.tool_version ?? "" }));
}

/** Saves (or, with `outcome === null`, takes back) the viewer's answer. Throws the server's message (rate limit, no copy yet, …). */
export async function setPromptOutcome(promptId: string, outcome: PromptOutcome | null, tool: string, toolVersion: string): Promise<void> {
  const { error } = await supabase.rpc("set_prompt_outcome", { p_prompt_id: promptId, p_outcome: outcome, p_tool: tool, p_tool_version: toolVersion });
  if (error) throw new Error(error.message);
}

/** Totals for the author's own prompt (creator panel); null when the RPC is not available or the prompt is not theirs. */
export async function fetchOwnPromptOutcomeTotals(promptId: string): Promise<{ worked: number; partial: number; failed: number } | null> {
  const { data, error } = await supabase.rpc("creator_insights_prompt_outcomes", { p_prompt_id: promptId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { worked: 0, partial: 0, failed: 0 };
  return { worked: row.worked ?? 0, partial: row.partial ?? 0, failed: row.failed ?? 0 };
}
