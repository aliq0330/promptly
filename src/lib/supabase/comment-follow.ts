import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/runtime";
import type { CommentFollowKind } from "@/lib/comment-follow";

/** Yorumun önceki sürümleri (en yeni önce). Silinmiş/okunamayan yorum için boş liste döner. */
export interface CommentVersion {
  id: string;
  body: string;
  writtenAt: string;
}

export async function fetchCommentHistory(commentId: string): Promise<CommentVersion[]> {
  const { data, error } = await supabase.rpc("comment_history", { p_comment_id: commentId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; body: string; written_at: string }[]).map((row) => ({ id: row.id, body: row.body, writtenAt: row.written_at }));
}

/** Bir içerik için kendi aboneliklerim: içeriğin tüm yorumları (`content`) ve takip edilen yorum başlıkları (`thread`). */
export interface MyCommentFollows {
  content: boolean;
  threadIds: string[];
}

export async function fetchMyCommentFollows(kind: CommentFollowKind, targetId: string): Promise<MyCommentFollows> {
  const { data, error } = await supabase.from("comment_subscriptions").select("scope, comment_id").eq("target_kind", kind).eq("target_id", targetId).limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { scope: string; comment_id: string | null }[];
  return {
    content: rows.some((row) => row.scope === "content"),
    threadIds: rows.filter((row) => row.scope === "thread" && row.comment_id).map((row) => row.comment_id as string),
  };
}

/** Takibi aç/kapat. `commentId` boşsa içeriğin tüm yorumları, doluysa o üst düzey yorum başlığı. */
export async function setCommentFollow(kind: CommentFollowKind, targetId: string, commentId: string | null, on: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_comment_subscription", { p_kind: kind, p_target: targetId, p_comment: commentId, p_on: on });
  if (error) {
    if (/subscription_limit/.test(error.message)) throw new Error(translateForRuntime("comments.follow.limit"));
    throw new Error(error.message);
  }
}

/** Ayarlar listesi: kendi aboneliklerim, başlık + (başlık takibinde) yorum önizlemesiyle. */
export interface CommentFollowRow {
  id: string;
  scope: "content" | "thread";
  kind: CommentFollowKind;
  targetId: string;
  title: string;
  commentId: string | null;
  commentPreview: string | null;
  auto: boolean;
  createdAt: string;
}

export async function fetchMyCommentFollowList(): Promise<CommentFollowRow[]> {
  const { data, error } = await supabase.rpc("my_comment_subscriptions");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    scope: row.scope as "content" | "thread",
    kind: row.target_kind as CommentFollowKind,
    targetId: row.target_id as string,
    title: (row.title as string) ?? "",
    commentId: (row.comment_id as string | null) ?? null,
    commentPreview: (row.comment_preview as string | null) ?? null,
    auto: Boolean(row.auto),
    createdAt: row.created_at as string,
  }));
}
