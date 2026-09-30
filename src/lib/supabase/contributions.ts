import { supabase } from "./client";

/** Local-calendar day key (YYYY-MM-DD) — the heatmap buckets by the viewer's own day, not UTC. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * How many posts (published prompts, non-draft requests, published
 * generators and workflows) the user created per day since `since`. Four
 * light `created_at`-only queries; a failed one simply contributes nothing.
 */
export async function fetchContributionCounts(userId: string, since: Date): Promise<Record<string, number>> {
  const sinceIso = since.toISOString();
  const sources: { table: string; ownerColumn: string; filter: [string, string | boolean] }[] = [
    { table: "prompts", ownerColumn: "author_id", filter: ["status", "published"] },
    { table: "prompt_requests", ownerColumn: "author_id", filter: ["is_draft", false] },
    { table: "generators", ownerColumn: "creator_id", filter: ["status", "published"] },
    { table: "workflows", ownerColumn: "creator_id", filter: ["status", "published"] },
  ];
  const counts: Record<string, number> = {};
  await Promise.all(
    sources.map(async (source) => {
      try {
        const { data, error } = await supabase
          .from(source.table)
          .select("created_at")
          .eq(source.ownerColumn, userId)
          .eq(source.filter[0], source.filter[1])
          .gte("created_at", sinceIso)
          .limit(2000);
        if (error) {
          console.error("fetchContributionCounts", source.table, error);
          return;
        }
        for (const row of (data ?? []) as { created_at: string }[]) {
          const key = dayKey(new Date(row.created_at));
          counts[key] = (counts[key] ?? 0) + 1;
        }
      } catch (err) {
        console.error("fetchContributionCounts", source.table, err);
      }
    }),
  );
  return counts;
}
