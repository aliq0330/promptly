import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { PromptComment } from "@/types";

interface CommentRow {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  profiles: ProfileRow;
}

const COMMENT_SELECT = `
  id, body, parent_id, created_at,
  profiles:author_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

function mapCommentRow(row: CommentRow, promptId: string): PromptComment {
  return {
    id: row.id,
    promptId,
    author: mapProfileRow(row.profiles),
    body: row.body,
    parentId: row.parent_id,
    createdAt: row.created_at,
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
    return ((data ?? []) as unknown as CommentRow[]).map((row) => mapCommentRow(row, promptId));
  } catch (err) {
    console.error("fetchCommentsForPrompt", err);
    return [];
  }
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
  return mapCommentRow(data as unknown as CommentRow, promptId);
}
