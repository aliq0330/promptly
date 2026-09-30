import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { ReportTargetType } from "./reports";

export type ReportStatus = "open" | "reviewed" | "dismissed";
export type ModerationAction = "dismissed" | "reviewed" | "removed";

export interface ModerationReport {
  id: string;
  status: ReportStatus;
  reason: string;
  createdAt: string;
  reviewedAt: string | null;
  resolutionNote: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reporterId: string;
  reporterUsername: string;
  targetExists: boolean;
  targetTitle: string | null;
  targetAuthorId: string | null;
  targetAuthorUsername: string | null;
  targetHref: string | null;
}

/** Whether the signed-in user holds the moderator role (`profiles.role`, server-enforced; clients can never change it). */
export async function fetchIsModerator(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_moderator");
    return !error && data === true;
  } catch {
    return false;
  }
}

interface QueueRow {
  id: string;
  status: ReportStatus;
  reason: string;
  created_at: string;
  reviewed_at: string | null;
  resolution_note: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reporter_id: string;
  reporter_username: string;
  target_exists: boolean | null;
  target_title: string | null;
  target_author_id: string | null;
  target_author_username: string | null;
  target_href: string | null;
}

export async function fetchReportQueue(status: ReportStatus | "all"): Promise<ModerationReport[]> {
  const { data, error } = await supabase.rpc("moderation_report_queue", { p_status: status });
  if (error) throw new Error(error.message);
  return ((data ?? []) as QueueRow[]).map((row) => ({
    id: row.id,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    resolutionNote: row.resolution_note,
    targetType: row.target_type,
    targetId: row.target_id,
    reporterId: row.reporter_id,
    reporterUsername: row.reporter_username,
    targetExists: row.target_exists === true,
    targetTitle: row.target_title,
    targetAuthorId: row.target_author_id,
    targetAuthorUsername: row.target_author_username,
    targetHref: row.target_href,
  }));
}

export async function moderateReport(reportId: string, action: ModerationAction, note?: string): Promise<void> {
  const { error } = await supabase.rpc("moderate_report", { p_report_id: reportId, p_action: action, p_note: note ?? null });
  if (error) throw new Error(translateForRuntime("moderation.actionFailed"));
}
