import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";

/** Most AI tools one person can follow — enforced by the database (`tool_follow_limit`, migration 20260921110000). */
export const MAX_FOLLOWED_TOOLS = 100;

/** Thrown by `followTool` when the 100-tool limit is hit, so the UI can say so instead of a generic failure. */
export class ToolFollowLimitError extends Error {
  constructor() {
    super("tool_follow_limit");
    this.name = "ToolFollowLimitError";
  }
}

/** Catalog ids (`src/lib/ai-tool-catalog.ts`) of the tools the signed-in viewer follows, newest first (RLS: own rows only). */
export async function fetchFollowedTools(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("tool_follows").select("tool_id").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { tool_id: string }[]).map((row) => row.tool_id);
}

/** Follows a tool. Following it twice is not an error (the primary key already says so). */
export async function followTool(userId: string, toolId: string): Promise<void> {
  const { error } = await supabase.from("tool_follows").insert({ user_id: userId, tool_id: toolId });
  if (!error) return;
  if (error.code === "23505") return;
  if (error.message.includes("tool_follow_limit")) throw new ToolFollowLimitError();
  throw new Error(error.message || translateForRuntime("tool.followFailed"));
}

/** Unfollows a tool. Unfollowing one that is not followed is not an error either. */
export async function unfollowTool(userId: string, toolId: string): Promise<void> {
  const { error } = await supabase.from("tool_follows").delete().eq("user_id", userId).eq("tool_id", toolId);
  if (error) throw new Error(error.message || translateForRuntime("tool.followFailed"));
}
