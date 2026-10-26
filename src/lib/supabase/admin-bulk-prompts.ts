import { supabase } from "./client";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { runChunks, type ChunkOutcome } from "@/lib/exchange";

/**
 * Moderator bulk management of the moderator's OWN prompts (docs/history/251-*): list (optionally by tag), publish / hide / delete in
 * chunks. Every write goes through a SECURITY DEFINER RPC that re-checks `is_moderator()` and only ever touches the caller's own
 * prompts; delete additionally skips anything another person has touched (likes, comments, saves, quotes, results, workflow/Space links).
 */

/** Prompts per RPC call (the functions accept at most 200). */
export const BULK_MANAGE_CHUNK = 100;
const PAGE = 1000;
/** Safety ceiling for one listing (10 pages). */
const MAX_ROWS = 10_000;

export type ManageStatus = "draft" | "public" | "hidden";

export interface ManageRow {
  id: string;
  title: string;
  /** draft = not published; public = published + public; hidden = published but "Sadece ben". */
  state: ManageStatus;
  /** Someone else has interacted with it — a delete would be skipped. */
  engaged: boolean;
}

interface ManageDbRow {
  id: string;
  title: string;
  status: "draft" | "published";
  visibility: "public" | "private";
  like_count: number;
  comment_count: number;
  save_count: number;
}

function toRow(row: ManageDbRow): ManageRow {
  return {
    id: row.id,
    title: row.title,
    state: row.status === "draft" ? "draft" : row.visibility === "public" ? "public" : "hidden",
    engaged: row.like_count + row.comment_count + row.save_count > 0,
  };
}

/** The caller's own non-community, non-deleted original prompts — only those with the tag when `tagLabel` is given. Newest first. */
export async function fetchOwnPromptsForManage(userId: string, tagLabel: string): Promise<{ rows: ManageRow[]; truncated: boolean }> {
  const slug = normalizeTagLabel(tagLabel);
  const columns = "id, title, status, visibility, like_count, comment_count, save_count";
  const rows: ManageRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase
      .from("prompts")
      .select(slug ? `${columns}, prompt_tags!inner(tag_slug)` : columns)
      .eq("author_id", userId)
      .is("community_id", null)
      .is("deleted_at", null)
      .eq("origin_type", "original");
    if (slug) query = query.eq("prompt_tags.tag_slug", slug);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as ManageDbRow[];
    rows.push(...page.map(toRow));
    if (page.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

interface RpcCounts {
  affected: number;
  skipped: number;
}

/** `makePublic` = published + public; otherwise published prompts become "Sadece ben" (drafts are unaffected). */
export function bulkSetVisibility(ids: string[], makePublic: boolean, options: { onProgress?: (p: ChunkOutcome) => void; shouldStop?: () => boolean } = {}): Promise<ChunkOutcome> {
  return runChunks(
    ids,
    BULK_MANAGE_CHUNK,
    async (chunk) => {
      const { data, error } = await supabase.rpc("admin_bulk_set_prompt_visibility", { p_ids: chunk, p_public: makePublic });
      if (error) throw new Error(error.message);
      return data as RpcCounts;
    },
    options,
  );
}

/** What deleting the selected (own) prompts takes along or empties — counts only (`admin_bulk_delete_impact`). */
export interface DeleteImpact {
  prompts: number;
  /** Prompts someone else has touched (a normal delete skips them; a forced delete removes them). */
  engaged: number;
  /** Removed together with the prompts (CASCADE). */
  likes: number;
  comments: number;
  saves: number;
  quotes: number;
  communityPosts: number;
  results: number;
  suggestions: number;
  /** Rows that stay but lose their prompt link (SET NULL). */
  spaceItems: number;
  workflowSteps: number;
  sharedInMessages: number;
}

export const EMPTY_IMPACT: DeleteImpact = {
  prompts: 0,
  engaged: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  quotes: 0,
  communityPosts: 0,
  results: 0,
  suggestions: 0,
  spaceItems: 0,
  workflowSteps: 0,
  sharedInMessages: 0,
};

/** Sums `admin_bulk_delete_impact` over chunks. Reads only; throws on the first failed chunk. */
export async function fetchDeleteImpact(ids: string[], shouldStop?: () => boolean): Promise<DeleteImpact> {
  const total: DeleteImpact = { ...EMPTY_IMPACT };
  for (let offset = 0; offset < ids.length; offset += BULK_MANAGE_CHUNK) {
    if (shouldStop?.()) break;
    const { data, error } = await supabase.rpc("admin_bulk_delete_impact", { p_ids: ids.slice(offset, offset + BULK_MANAGE_CHUNK) });
    if (error) throw new Error(error.message);
    const part = data as DeleteImpact;
    for (const key of Object.keys(total) as (keyof DeleteImpact)[]) total[key] += Number(part[key] ?? 0);
  }
  return total;
}

/**
 * Permanent. By default prompts anyone else has touched are skipped by the server and counted in `skipped`; with `force` they are deleted too
 * and the other people's likes, comments, saves, quotes, community posts, results and suggestions on them go with them.
 */
export function bulkDeletePrompts(
  ids: string[],
  options: { force?: boolean; onProgress?: (p: ChunkOutcome) => void; shouldStop?: () => boolean } = {},
): Promise<ChunkOutcome> {
  return runChunks(
    ids,
    BULK_MANAGE_CHUNK,
    async (chunk) => {
      const { data, error } = options.force
        ? await supabase.rpc("admin_bulk_delete_prompts", { p_ids: chunk, p_force: true })
        : await supabase.rpc("admin_bulk_delete_prompts", { p_ids: chunk });
      if (error) throw new Error(error.message);
      return data as RpcCounts;
    },
    { onProgress: options.onProgress, shouldStop: options.shouldStop },
  );
}
