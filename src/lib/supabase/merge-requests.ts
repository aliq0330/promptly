import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { MergeRequest, MergeRequestStatus } from "@/types";

interface MergeRequestRow {
  id: string;
  source_prompt_id: string;
  target_prompt_id: string;
  status: MergeRequestStatus;
  contribution_summary: string;
  description: string | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  withdrawn_at: string | null;
  resulting_version_id: string | null;
  created_at: string;
  updated_at: string;
  requester: ProfileRow;
  target_owner: ProfileRow;
}

const MERGE_REQUEST_SELECT = `
  id, source_prompt_id, target_prompt_id, status, contribution_summary, description,
  decision_reason, decided_by, decided_at, withdrawn_at, resulting_version_id, created_at, updated_at,
  requester:requester_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  target_owner:target_owner_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapMergeRequestRow(row: MergeRequestRow): MergeRequest {
  return {
    id: row.id,
    sourcePromptId: row.source_prompt_id,
    targetPromptId: row.target_prompt_id,
    requester: mapProfileRow(row.requester),
    targetOwner: mapProfileRow(row.target_owner),
    status: row.status,
    contributionSummary: row.contribution_summary,
    description: row.description,
    decisionReason: row.decision_reason,
    decidedById: row.decided_by,
    decidedAt: row.decided_at,
    withdrawnAt: row.withdrawn_at,
    resultingVersionId: row.resulting_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every real merge request touching this prompt — either as the
 * contribution's source (a remix offering it upstream) or the decision's
 * target (an ancestor receiving it). RLS (20260919250000) already limits
 * what's returned: participants always see their own, anyone else only
 * sees requests where both sides are real, published prompts.
 */
export async function fetchMergeRequestsForPrompt(promptId: string): Promise<MergeRequest[]> {
  try {
    const { data, error } = await supabase
      .from("merge_requests")
      .select(MERGE_REQUEST_SELECT)
      .or(`source_prompt_id.eq.${promptId},target_prompt_id.eq.${promptId}`)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as MergeRequestRow[]).map(mapMergeRequestRow);
  } catch (err) {
    console.error("fetchMergeRequestsForPrompt", err);
    return [];
  }
}

/** Every real merge request across an entire remix tree in one query — used by the branching map so it doesn't fetch per-node (N+1). */
export async function fetchMergeRequestsForPrompts(promptIds: string[]): Promise<MergeRequest[]> {
  if (promptIds.length === 0) return [];
  try {
    const list = promptIds.join(",");
    const { data, error } = await supabase
      .from("merge_requests")
      .select(MERGE_REQUEST_SELECT)
      .or(`source_prompt_id.in.(${list}),target_prompt_id.in.(${list})`)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as MergeRequestRow[]).map(mapMergeRequestRow);
  } catch (err) {
    console.error("fetchMergeRequestsForPrompts", err);
    return [];
  }
}

/**
 * Genuinely, permanently creates a merge request (or, when the requester
 * already owns the target too, immediately auto-accepts it — see the
 * `create_merge_request` RPC's own comment for why: CLAUDE.md's documented
 * product decision for "merging into your own content" is to skip the
 * approval step entirely rather than build a pointless self-approval UI).
 * All validation (ownership, source is a real remix, target is a real
 * ancestor in the chain, no duplicate pending request) happens inside the
 * RPC — a rejected call always means a real rule was violated, translated
 * here into the exact Turkish message the database raised.
 */
export async function createMergeRequest(input: {
  sourcePromptId: string;
  targetPromptId: string;
  contributionSummary: string;
  description?: string;
}): Promise<{ requestId: string; status: MergeRequestStatus }> {
  const { data, error } = await supabase.rpc("create_merge_request", {
    p_source_prompt_id: input.sourcePromptId,
    p_target_prompt_id: input.targetPromptId,
    p_contribution_summary: input.contributionSummary.trim(),
    p_description: input.description?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; request_status: MergeRequestStatus } | undefined;
  if (!row) throw new Error("Merge talebi oluşturulamadı.");
  return { requestId: row.request_id, status: row.request_status };
}

/** Accepts a real, pending merge request — only the target's real owner can do this (RLS-free by design; the RPC itself checks authority). Returns the new version's id. */
export async function acceptMergeRequest(requestId: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_merge_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function rejectMergeRequest(requestId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("reject_merge_request", { p_request_id: requestId, p_reason: reason?.trim() || null });
  if (error) throw new Error(error.message);
}

export async function withdrawMergeRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_merge_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}
