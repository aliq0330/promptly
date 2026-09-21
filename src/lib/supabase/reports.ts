import { supabase } from "./client";

export type ReportTargetType = "prompt" | "comment" | "request" | "user" | "message";

/**
 * Files a real, permanent report (Bölüm 18's `reports` table, unused until
 * Bölüm 21 Faz B). Always lands with `status = 'open'` — reviewing/
 * resolving reports needs a moderator role that doesn't exist yet
 * (CLAUDE.md Bölüm 22, not built), so this is genuinely just "file it",
 * nothing more.
 */
export async function fileReport(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  reason: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("Bir şikayet nedeni yazmalısın.");
  const { error } = await supabase.from("reports").insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason: trimmed,
  });
  if (error) throw new Error(error.message);
}
