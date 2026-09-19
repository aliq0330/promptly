import { supabase } from "./client";

/**
 * Which of these comment ids has the current viewer already liked — one
 * batched query for a whole comment thread (however deep) instead of one
 * `fetchIsLiked`-style call per node, since a thread can easily have far
 * more nodes than a feed page has cards. RLS (comment_likes is publicly
 * readable, like prompt_likes) makes this safe for any viewer.
 */
export async function fetchLikedCommentIds(commentIds: string[], userId: string): Promise<Set<string>> {
  if (commentIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("user_id", userId)
      .in("comment_id", commentIds);
    if (error) {
      console.error("fetchLikedCommentIds", error);
      return new Set();
    }
    return new Set((data ?? []).map((row) => row.comment_id as string));
  } catch (err) {
    console.error("fetchLikedCommentIds", err);
    return new Set();
  }
}

/** Genuinely, permanently likes a real comment/reply. `handle_comment_like_change` keeps `prompt_comments.like_count` in sync, independent of the post's own like count. */
export async function likeComment(commentId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unlikeComment(commentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
