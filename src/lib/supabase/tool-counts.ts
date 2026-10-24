import { supabase } from "./client";

/**
 * Public posts per AI tool (`public.discover_tool_counts`, migration 20260922100000): the same visibility as the feed,
 * a post that recommends several models of one tool counts once for the tool. Keys are catalog tool ids. Throws on a failed
 * request (the caller shows the tools without counts instead of claiming "0 posts").
 */
export async function fetchToolPostCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("discover_tool_counts");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { tool_id: string; post_count: number | string }[]) counts[row.tool_id] = Number(row.post_count);
  return counts;
}
