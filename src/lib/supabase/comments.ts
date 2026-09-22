import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { PromptComment } from "@/types";

interface CommentRow {
  id: string;
  body: string;
  parent_id: string | null;
  like_count: number;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  profiles: ProfileRow;
}

const COMMENT_SELECT = `
  id, body, parent_id, like_count, created_at, edited_at, deleted_at,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapCommentRow(row: CommentRow, target: { promptId: string } | { requestId: string } | { generatorId: string }): PromptComment {
  return {
    id: row.id,
    ...target,
    author: mapProfileRow(row.profiles),
    body: row.body,
    parentId: row.parent_id,
    likeCount: row.like_count,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

/** Every real comment on a real prompt, oldest first — publicly readable per Bölüm 19's RLS (same visibility as the prompt itself). */
export async function fetchCommentsForPrompt(promptId: string): Promise<PromptComment[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_comments")
      .select(COMMENT_SELECT)
      .eq("prompt_id", promptId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("fetchCommentsForPrompt", error);
      return [];
    }
    return ((data ?? []) as unknown as CommentRow[]).map((row) => mapCommentRow(row, { promptId }));
  } catch (err) {
    console.error("fetchCommentsForPrompt", err);
    return [];
  }
}

/** Every real comment on a real request, oldest first — same visibility rules as a prompt's comments (Bölüm 19). */
export async function fetchCommentsForRequest(requestId: string): Promise<PromptComment[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_comments")
      .select(COMMENT_SELECT)
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("fetchCommentsForRequest", error);
      return [];
    }
    return ((data ?? []) as unknown as CommentRow[]).map((row) => mapCommentRow(row, { requestId }));
  } catch (err) {
    console.error("fetchCommentsForRequest", err);
    return [];
  }
}

/** Every real comment on a real generator, oldest first — publicly readable wherever the generator itself is (Bölüm 9.34's shared social layer, mirrors fetchCommentsForPrompt). */
export async function fetchCommentsForGenerator(generatorId: string): Promise<PromptComment[]> {
  try {
    const { data, error } = await supabase
      .from("prompt_comments")
      .select(COMMENT_SELECT)
      .eq("generator_id", generatorId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("fetchCommentsForGenerator", error);
      return [];
    }
    return ((data ?? []) as unknown as CommentRow[]).map((row) => mapCommentRow(row, { generatorId }));
  } catch (err) {
    console.error("fetchCommentsForGenerator", err);
    return [];
  }
}

/** Genuinely, permanently posts a comment on a real generator. `handle_prompt_comment_change` (Bölüm 9.34) keeps `generators.comment_count` in sync, even across users. */
export async function postCommentOnGenerator(
  generatorId: string,
  authorId: string,
  body: string,
  parentId: string | null,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ generator_id: generatorId, author_id: authorId, body, parent_id: parentId })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum eklenemedi.");
  return mapCommentRow(data as unknown as CommentRow, { generatorId });
}

/** Genuinely, permanently posts a comment on a real request. */
export async function postCommentOnRequest(
  requestId: string,
  authorId: string,
  body: string,
  parentId: string | null,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ request_id: requestId, author_id: authorId, body, parent_id: parentId })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum eklenemedi.");
  return mapCommentRow(data as unknown as CommentRow, { requestId });
}

/** Genuinely, permanently posts a comment on a real prompt. `handle_prompt_comment_change` (Bölüm 19) keeps `prompts.comment_count` in sync, even across users. */
export async function postCommentOnPrompt(
  promptId: string,
  authorId: string,
  body: string,
  parentId: string | null,
): Promise<PromptComment> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .insert({ prompt_id: promptId, author_id: authorId, body, parent_id: parentId })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum eklenemedi.");
  return mapCommentRow(data as unknown as CommentRow, { promptId });
}

/**
 * Genuinely, permanently edits a real comment/reply's text — RLS (Bölüm
 * 19) already only lets the real author's own row through, so no extra
 * ownership check is needed here. `handle_comment_body_edit` (Bölüm 9.5)
 * stamps `edited_at` automatically.
 */
export async function updateComment(commentId: string, body: string): Promise<{ editedAt: string }> {
  const { data, error } = await supabase
    .from("prompt_comments")
    .update({ body })
    .eq("id", commentId)
    .select("edited_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Yorum düzenlenemedi.");
  return { editedAt: data.edited_at as string };
}

/**
 * Genuinely, permanently deletes a real comment/reply — or, if it still
 * has real replies, the `handle_comment_delete` BEFORE DELETE trigger
 * (Bölüm 9.5) transparently soft-deletes it instead (clears `body`, stamps
 * `deleted_at`) so those replies are never silently lost. Either way this
 * call looks identical from here; the caller can't tell which happened
 * from the response alone, so `CommentSection` always marks the comment
 * "deleted" locally and lets the next real fetch reflect which one it was.
 */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("prompt_comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}
