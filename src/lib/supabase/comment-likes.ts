import { supabase } from "./client";
import { DEFAULT_REACTION, isReactionKey, type ReactionKey } from "@/lib/reactions";

/**
 * The viewer's own reaction on each of these comments (a comment the viewer has not liked is simply absent) — one batched query for a whole comment
 * thread (however deep) instead of one call per node, since a thread can easily have far more nodes than a feed page has cards. RLS (comment_likes is
 * publicly readable, like prompt_likes) makes this safe for any viewer. Every like is one of six reactions (docs/history/326-*); a row written before
 * the `reaction` column existed (or while the migration lags) reads as the default `love`.
 */
export async function fetchMyCommentReactions(commentIds: string[], userId: string): Promise<Map<string, ReactionKey>> {
  if (commentIds.length === 0) return new Map();
  try {
    const { data, error } = await supabase
      .from("comment_likes")
      .select("comment_id, reaction")
      .eq("user_id", userId)
      .in("comment_id", commentIds);
    if (error) {
      console.error("fetchMyCommentReactions", error);
      return new Map();
    }
    return new Map((data ?? []).map((row) => [row.comment_id as string, isReactionKey(row.reaction) ? row.reaction : DEFAULT_REACTION] as const));
  } catch (err) {
    console.error("fetchMyCommentReactions", err);
    return new Map();
  }
}

/**
 * Genuinely, permanently likes a real comment/reply. `handle_comment_like_change` keeps `prompt_comments.like_count` in sync, independent of the post's own like count.
 * `reaction` (docs/history/326-*): her yorum beğenisi altı tepkiden biridir; varsayılan `love` (eski tek kalp) olduğundan sütun yalnız farklıysa yazılır.
 */
export async function likeComment(commentId: string, userId: string, reaction: ReactionKey = DEFAULT_REACTION): Promise<void> {
  const row: { comment_id: string; user_id: string; reaction?: ReactionKey } = { comment_id: commentId, user_id: userId };
  if (reaction !== DEFAULT_REACTION) row.reaction = reaction;
  const { error } = await supabase.from("comment_likes").insert(row);
  if (error) throw new Error(error.message);
}

/** Var olan yorum beğenisinin tepkisini değiştirir (satır UPDATE'lenir; sayaç ve bildirim oynamaz, docs/history/326-*). */
export async function changeCommentReaction(commentId: string, userId: string, reaction: ReactionKey): Promise<void> {
  const { data, error } = await supabase
    .from("comment_likes")
    .update({ reaction })
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .select("comment_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("like_not_found");
}

export async function unlikeComment(commentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
