"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  deleteComment,
  fetchCommentsForGenerator,
  fetchCommentsForPrompt,
  fetchCommentsForRequest,
  postCommentOnGenerator,
  postCommentOnPrompt,
  postCommentOnRequest,
  updateComment,
} from "@/lib/supabase/comments";
import { fetchLikedCommentIds, likeComment, unlikeComment } from "@/lib/supabase/comment-likes";
import { CommentNode, type CommentTree } from "./comment-node";
import type { PromptComment } from "@/types";

export type CommentTarget = { promptId: string } | { requestId: string } | { generatorId: string };

/**
 * Real, unlimited-depth comment thread — every prompt/request is a real
 * Supabase row (CLAUDE.md's mock-data removal), and `prompt_comments.
 * parent_id` self-references the same table, so a reply can target a
 * top-level comment OR any other reply, to any depth. Comments are
 * publicly readable regardless of who's viewing (Bölüm 19's RLS) — only
 * *posting* and *liking* need a signed-in real account.
 */
/** How long a jumped-to comment/reply stays visually flashed before fading back to normal — long enough to notice, short enough not to nag (Aşama 5: "göz yoran yanıp sönme veya aşırı hareket kullanma"). */
const HIGHLIGHT_DURATION_MS = 2500;

export function CommentSection({
  target,
  disabledReason,
  highlightCommentId,
}: {
  target: CommentTarget;
  /** When set, hides the composer and shows this text instead (e.g. a closed request). */
  disabledReason?: string;
  /**
   * A specific comment/reply to land on when arriving from a notification
   * (`?hl=comment:<id>`, Aşama 4.2-4.4) — its whole ancestor chain is
   * expanded, the thread scrolls to it, and it flashes briefly. If it's not
   * in the loaded thread at all (deleted with no surviving reply of its
   * own — Bölüm 9.5's safe-delete only preserves a node that still has
   * replies), an honest inline notice is shown instead of silently landing
   * at the top of the page (Aşama 6).
   */
  highlightCommentId?: string | null;
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

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [highlightNotFound, setHighlightNotFound] = useState(false);

  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToId = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedHighlightId = useRef<string | null>(null);

  const targetKind: "prompt" | "request" | "generator" =
    "promptId" in target ? "prompt" : "requestId" in target ? "request" : "generator";
  const targetId = "promptId" in target ? target.promptId : "requestId" in target ? target.requestId : target.generatorId;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the target (a new prompt/request/generator) changes
    setLoaded(false);
    const fetcher =
      targetKind === "prompt"
        ? fetchCommentsForPrompt(targetId)
        : targetKind === "request"
          ? fetchCommentsForRequest(targetId)
          : fetchCommentsForGenerator(targetId);
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
      const posted =
        targetKind === "prompt"
          ? await postCommentOnPrompt(targetId, user.id, trimmed, parentId)
          : targetKind === "request"
            ? await postCommentOnRequest(targetId, user.id, trimmed, parentId)
            : await postCommentOnGenerator(targetId, user.id, trimmed, parentId);
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
      const posted =
        targetKind === "prompt"
          ? await postCommentOnPrompt(targetId, user.id, trimmed, null)
          : targetKind === "request"
            ? await postCommentOnRequest(targetId, user.id, trimmed, null)
            : await postCommentOnGenerator(targetId, user.id, trimmed, null);
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
    highlightedId,
  };

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-text">
        Yorumlar
        <span className="rounded-xs bg-surface-soft px-1.5 font-sans text-caption font-semibold tabular-nums text-text-muted">{comments.length}</span>
      </h2>

      {highlightNotFound && (
        <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
          Bu yorum artık mevcut değil.
        </p>
      )}

      {disabledReason ? (
        <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
          {disabledReason}
        </p>
      ) : !user ? (
        <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
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
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-small text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || isPosting}>
              {isPosting ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </div>
        </form>
      )}

      {postError && <p className="text-sm text-danger">{postError}</p>}
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {!loaded ? (
        <div className="space-y-3" role="status" aria-label="Yorumlar yükleniyor">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5 pt-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : topLevel.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-small text-text-muted">Henüz yorum yapılmadı. İlk yorumu sen yaz.</p>
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
