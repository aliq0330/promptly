"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  deleteComment,
  fetchCommentsForPrompt,
  fetchCommentsForRequest,
  postCommentOnPrompt,
  postCommentOnRequest,
  updateComment,
} from "@/lib/supabase/comments";
import { fetchLikedCommentIds, likeComment, unlikeComment } from "@/lib/supabase/comment-likes";
import { CommentNode, type CommentTree } from "./comment-node";
import type { PromptComment } from "@/types";

export type CommentTarget = { promptId: string } | { requestId: string };

/**
 * Real, unlimited-depth comment thread — every prompt/request is a real
 * Supabase row (CLAUDE.md's mock-data removal), and `prompt_comments.
 * parent_id` self-references the same table, so a reply can target a
 * top-level comment OR any other reply, to any depth. Comments are
 * publicly readable regardless of who's viewing (Bölüm 19's RLS) — only
 * *posting* and *liking* need a signed-in real account.
 */
export function CommentSection({
  target,
  disabledReason,
}: {
  target: CommentTarget;
  /** When set, hides the composer and shows this text instead (e.g. a closed request). */
  disabledReason?: string;
}) {
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const [draft, setDraft] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [comments, setComments] = useState<PromptComment[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [isPostingReply, setIsPostingReply] = useState(false);

  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToId = useRef<string | null>(null);

  const targetId = "promptId" in target ? target.promptId : target.requestId;
  const isPromptTarget = "promptId" in target;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the target (a new prompt/request) changes
    setLoaded(false);
    const fetcher = isPromptTarget ? fetchCommentsForPrompt(targetId) : fetchCommentsForRequest(targetId);
    fetcher.then(async (result) => {
      if (cancelled) return;
      setComments(result);
      setLikeCounts(Object.fromEntries(result.map((c) => [c.id, c.likeCount])));
      setLoaded(true);
      if (user) {
        const liked = await fetchLikedCommentIds(
          result.map((c) => c.id),
          user.id,
        );
        if (!cancelled) setLikedIds(liked);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPromptTarget, targetId, user?.id]);

  const commentsById = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, PromptComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      const siblings = map.get(comment.parentId) ?? [];
      siblings.push(comment);
      map.set(comment.parentId, siblings);
    }
    return map;
  }, [comments]);
  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments]);

  const registerNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (!pendingScrollToId.current) return;
    const el = nodeRefs.current.get(pendingScrollToId.current);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      pendingScrollToId.current = null;
    }
  }, [comments]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleLike(id: string) {
    if (!user || pendingLikeIds.has(id)) return;
    const wasLiked = likedIds.has(id);
    setPendingLikeIds((prev) => new Set(prev).add(id));
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    setLikeCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (wasLiked ? -1 : 1)) }));
    try {
      if (wasLiked) await unlikeComment(id, user.id);
      else await likeComment(id, user.id);
    } catch (err) {
      console.error("toggleCommentLike", err);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (wasLiked ? 1 : -1)) }));
    } finally {
      setPendingLikeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function startReply(id: string) {
    setReplyingTo(id);
    setReplyDraft("");
    setReplyError(null);
  }

  function cancelReply() {
    setReplyingTo(null);
    setReplyDraft("");
    setReplyError(null);
  }

  async function submitReply(parentId: string) {
    const trimmed = replyDraft.trim();
    if (!trimmed || !user || isPostingReply) return;
    setIsPostingReply(true);
    setReplyError(null);
    try {
      const posted = isPromptTarget
        ? await postCommentOnPrompt(targetId, user.id, trimmed, parentId)
        : await postCommentOnRequest(targetId, user.id, trimmed, parentId);
      setComments((prev) => [...prev, posted]);
      setLikeCounts((prev) => ({ ...prev, [posted.id]: 0 }));
      setExpandedIds((prev) => new Set(prev).add(parentId));
      pendingScrollToId.current = posted.id;
      setReplyingTo(null);
      setReplyDraft("");
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Yanıt eklenemedi, lütfen tekrar dene.");
    } finally {
      setIsPostingReply(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !user) return;

    setIsPosting(true);
    setPostError(null);
    try {
      const posted = isPromptTarget
        ? await postCommentOnPrompt(targetId, user.id, trimmed, null)
        : await postCommentOnRequest(targetId, user.id, trimmed, null);
      setComments((prev) => [...prev, posted]);
      setLikeCounts((prev) => ({ ...prev, [posted.id]: 0 }));
      setDraft("");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Yorum eklenemedi, lütfen tekrar dene.");
    } finally {
      setIsPosting(false);
    }
  }

  function startEdit(comment: PromptComment) {
    setEditingId(comment.id);
    setEditDraft(comment.body);
    setEditError(null);
    // Editing and replying to the same node at once would be confusing UI-wise.
    if (replyingTo === comment.id) cancelReply();
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
    setEditError(null);
  }

  async function submitEdit(id: string) {
    const trimmed = editDraft.trim();
    if (!trimmed || isSavingEdit) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const { editedAt } = await updateComment(id, trimmed);
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, body: trimmed, editedAt } : c)),
      );
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Yorum düzenlenemedi, lütfen tekrar dene.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  function cancelDeleteConfirm() {
    setDeleteConfirmId(null);
  }

  async function requestDelete(id: string) {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    setDeleteConfirmId(null);
    setIsDeletingId(id);
    setDeleteError(null);
    try {
      await deleteComment(id);
      // The database alone decides whether this was a real delete (no
      // replies) or a soft delete (replies exist, preserved) — either way
      // marking it "deleted" here is correct: a real delete just won't be
      // in the list anymore next time this thread is fetched fresh, and a
      // soft delete needs exactly this placeholder treatment right now.
      const deletedAt = new Date().toISOString();
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body: "", deletedAt } : c)));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Yorum silinemedi, lütfen tekrar dene.");
    } finally {
      setIsDeletingId(null);
    }
  }

  const tree: CommentTree = {
    childrenByParent,
    commentsById,
    expandedIds,
    onToggleExpand: toggleExpand,
    replyingTo,
    onStartReply: startReply,
    onCancelReply: cancelReply,
    replyDraft,
    onReplyDraftChange: setReplyDraft,
    onSubmitReply: submitReply,
    isPosting: isPostingReply,
    postError: replyError,
    canInteract: Boolean(user),
    currentUserId: user?.id ?? null,
    likedIds,
    likeCounts,
    pendingLikeIds,
    onToggleLike: toggleLike,
    editingId,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    editDraft,
    onEditDraftChange: setEditDraft,
    onSubmitEdit: submitEdit,
    isSavingEdit,
    editError,
    deleteConfirmId,
    onRequestDelete: requestDelete,
    onCancelDeleteConfirm: cancelDeleteConfirm,
    isDeletingId,
    registerNodeRef,
  };

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold text-text">Yorumlar ({comments.length})</h2>

      {disabledReason ? (
        <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
          {disabledReason}
        </p>
      ) : !user ? (
        <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
          Yorum yapmak için{" "}
          <Link href="/login" className="font-medium text-primary underline">
            giriş yapmalısın
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
          <Avatar src={ownProfile?.avatarUrl ?? null} alt={ownProfile?.displayName ?? "Sen"} size={32} />
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Bir yorum yaz..."
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || isPosting}>
              {isPosting ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </div>
        </form>
      )}

      {postError && <p className="text-sm text-red-500">{postError}</p>}
      {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}

      {!loaded ? (
        <p className="py-6 text-center text-sm text-text-muted">Yükleniyor…</p>
      ) : topLevel.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Henüz yorum yapılmadı.</p>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => (
            <CommentNode key={comment.id} comment={comment} depth={0} tree={tree} />
          ))}
        </div>
      )}
    </section>
  );
}
