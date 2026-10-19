"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LikeToggleResult } from "@/components/ui/like-toggle";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  deleteComment,
  fetchCommentsForPrompt,
  fetchCommentsForRequest,
  fetchCommentsForResult,
  fetchCommentsForWorkflow,
  fetchCommentsForPreset,
  fetchCommentsForCommunityPost,
  postCommentOnCommunityPost,
  postCommentOnPreset,
  postCommentOnWorkflow,
  postCommentOnPrompt,
  postCommentOnRequest,
  postCommentOnResult,
  updateComment,
} from "@/lib/supabase/comments";
import { fetchLikedCommentIds, likeComment, unlikeComment } from "@/lib/supabase/comment-likes";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptComment } from "@/types";
import { bumpCommentCount } from "./comment-count-store";
import type { CommentTree } from "./comment-node";

export type CommentTarget = { promptId: string } | { requestId: string } | { resultId: string } | { workflowId: string } | { presetId: string } | { communityPostId: string };

/** How long a jumped-to comment/reply stays visually flashed before fading back to normal — long enough to notice, short enough not to nag (Aşama 5: "göz yoran yanıp sönme veya aşırı hareket kullanma"). */
const HIGHLIGHT_DURATION_MS = 2500;

/**
 * Everything a comment thread does — load, like, reply (any depth), edit, delete, jump to a highlighted comment — for one
 * target. Real, unlimited-depth thread: every prompt/request is a real Supabase row, and `prompt_comments.parent_id`
 * self-references the same table, so a reply can target a top-level comment OR any other reply. Comments are publicly
 * readable regardless of who's viewing (Bölüm 19's RLS) — only *posting* and *liking* need a signed-in account.
 *
 * Shared by the detail pages' `CommentSection` and Odak's comment sheet (docs/history/200-*): one thread logic, two layouts.
 */
export function useCommentThread(target: CommentTarget, { highlightCommentId = null }: { highlightCommentId?: string | null } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { profile: ownProfile } = useOwnProfile();
  const [draft, setDraft] = useState("");
  // The thread opens short (first few comments) so a long discussion never pushes related content out of reach; a jumped-to comment or the viewer's own new comment opens it all.
  const [showAll, setShowAll] = useState(Boolean(highlightCommentId));
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

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [highlightNotFound, setHighlightNotFound] = useState(false);

  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToId = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedHighlightId = useRef<string | null>(null);

  const targetKind: "prompt" | "request" | "result" | "workflow" | "preset" | "community_post" =
    "promptId" in target
      ? "prompt"
      : "requestId" in target
        ? "request"
        : "workflowId" in target
          ? "workflow"
          : "presetId" in target
            ? "preset"
            : "communityPostId" in target
              ? "community_post"
              : "result";
  const targetId =
    "promptId" in target
      ? target.promptId
      : "requestId" in target
        ? target.requestId
        : "workflowId" in target
          ? target.workflowId
          : "presetId" in target
            ? target.presetId
            : "communityPostId" in target
              ? target.communityPostId
              : target.resultId;

  // Small dispatch helpers instead of repeating a four-way ternary at each
  // of the three call sites below (initial fetch, top-level post, reply).
  function fetchCommentsForTarget(kind: typeof targetKind, id: string) {
    if (kind === "prompt") return fetchCommentsForPrompt(id);
    if (kind === "request") return fetchCommentsForRequest(id);
    if (kind === "workflow") return fetchCommentsForWorkflow(id);
    if (kind === "preset") return fetchCommentsForPreset(id);
    if (kind === "community_post") return fetchCommentsForCommunityPost(id);
    return fetchCommentsForResult(id);
  }
  function postCommentForTarget(kind: typeof targetKind, id: string, userId: string, body: string, parentId: string | null) {
    if (kind === "prompt") return postCommentOnPrompt(id, userId, body, parentId);
    if (kind === "request") return postCommentOnRequest(id, userId, body, parentId);
    if (kind === "workflow") return postCommentOnWorkflow(id, userId, body, parentId);
    if (kind === "preset") return postCommentOnPreset(id, userId, body, parentId);
    if (kind === "community_post") return postCommentOnCommunityPost(id, userId, body, parentId);
    return postCommentOnResult(id, userId, body, parentId);
  }

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the target (a new prompt/request) changes
    setLoaded(false);
    fetchCommentsForTarget(targetKind, targetId).then(async (result) => {
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

      // Land on a specific comment/reply from a notification (Aşama 4.2-4.4)
      // — only once per `highlightCommentId` (a like on this same thread
      // shouldn't re-trigger the jump on every re-fetch).
      if (highlightCommentId && processedHighlightId.current !== highlightCommentId) {
        processedHighlightId.current = highlightCommentId;
        const byId = new Map(result.map((c) => [c.id, c]));
        const target = byId.get(highlightCommentId);
        if (!target) {
          setHighlightNotFound(true);
        } else {
          // Expand every ancestor so the target is actually rendered (a
          // reply nested under a collapsed "N yanıtı göster" toggle has no
          // DOM node to scroll to yet).
          const ancestorIds = new Set<string>();
          let cursor = target.parentId ? byId.get(target.parentId) : undefined;
          while (cursor) {
            ancestorIds.add(cursor.id);
            cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
          }
          if (ancestorIds.size > 0) {
            setExpandedIds((prev) => new Set([...prev, ...ancestorIds]));
          }
          pendingScrollToId.current = highlightCommentId;
          setHighlightedId(highlightCommentId);
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          highlightTimer.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKind, targetId, user?.id, highlightCommentId]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

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
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingScrollToId.current = null;
    }
    // `expandedIds` matters too: a highlighted reply's DOM node only exists
    // once its ancestor chain has actually expanded and rendered it.
  }, [comments, expandedIds]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleLike(id: string): Promise<LikeToggleResult> {
    if (!user) {
      requireAuth("like");
      return "ignored";
    }
    if (pendingLikeIds.has(id)) return "ignored";
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
      return wasLiked ? "unliked" : "liked";
    } catch (err) {
      console.error("toggleCommentLike", err);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (wasLiked ? 1 : -1)) }));
      return "failed";
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
      const posted = await postCommentForTarget(targetKind, targetId, user.id, trimmed, parentId);
      bumpCommentCount(targetId, 1);
      setComments((prev) => [...prev, posted]);
      setLikeCounts((prev) => ({ ...prev, [posted.id]: 0 }));
      setExpandedIds((prev) => new Set(prev).add(parentId));
      pendingScrollToId.current = posted.id;
      setReplyingTo(null);
      setReplyDraft("");
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : t("comments.replyFailed"));
    } finally {
      setIsPostingReply(false);
    }
  }

  /** Posts the composer's draft as a new top-level comment. */
  async function submitComment() {
    const trimmed = draft.trim();
    if (!trimmed || !user) return;

    setIsPosting(true);
    setPostError(null);
    try {
      const posted = await postCommentForTarget(targetKind, targetId, user.id, trimmed, null);
      bumpCommentCount(targetId, 1);
      setComments((prev) => [...prev, posted]);
      setLikeCounts((prev) => ({ ...prev, [posted.id]: 0 }));
      setDraft("");
      setShowAll(true);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : t("comments.postFailed"));
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
      setEditError(err instanceof Error ? err.message : t("comments.editFailed"));
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
      // A comment with replies is soft-deleted (still counted); only a real
      // delete lowers the stored comment_count.
      if (!childrenByParent.has(id)) bumpCommentCount(targetId, -1);
      // The database alone decides whether this was a real delete (no
      // replies) or a soft delete (replies exist, preserved) — either way
      // marking it "deleted" here is correct: a real delete just won't be
      // in the list anymore next time this thread is fetched fresh, and a
      // soft delete needs exactly this placeholder treatment right now.
      const deletedAt = new Date().toISOString();
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body: "", deletedAt } : c)));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("comments.deleteFailed"));
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
    highlightedId,
  };


  return {
    user,
    ownProfile,
    requireAuth,
    comments,
    loaded,
    topLevel,
    tree,
    draft,
    setDraft,
    submitComment,
    isPosting,
    postError,
    deleteError,
    highlightNotFound,
    showAll,
    setShowAll,
  };
}
