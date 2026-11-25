"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExitMotion } from "@/components/ui/exit-motion";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  countNewComments,
  deleteComment,
  fetchCommentThread,
  fetchCommentThreadPage,
  type CommentScope,
  postCommentOnCommunityPost,
  postCommentOnPreset,
  postCommentOnSkill,
  postCommentOnWorkflow,
  postCommentOnPrompt,
  postCommentOnRequest,
  postCommentOnResult,
  updateComment,
  postCommentOnQuote,
  setCommentPinned,
} from "@/lib/supabase/comments";
import { byCreatedAsc, compareTopLevel, DEFAULT_COMMENT_SORT, type CommentSort } from "@/lib/comment-sort";
import { removeCommentPhotos } from "@/lib/supabase/comment-media";
import type { CommentExtras } from "@/lib/supabase/comments";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptComment } from "@/types";
import { bumpCommentCount } from "./comment-count-store";
import type { CommentTree } from "./comment-node";
import { useCommentExtras } from "./comment-extras";
import { useAttachmentCards } from "./use-attachment-cards";
import { PROMPT_COMMENT_POSTED_EVENT, type PromptCommentPostedDetail } from "./works-events";
import { useWorksVotes } from "./works-badges";

export type CommentTarget =
  | { promptId: string }
  | { requestId: string }
  | { resultId: string }
  | { workflowId: string }
  | { presetId: string }
  | { skillId: string }
  | { communityPostId: string }
  | { quoteId: string };

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
export function useCommentThread(
  target: CommentTarget,
  {
    highlightCommentId = null,
    contentOwnerId = null,
    onChange,
  }: {
    highlightCommentId?: string | null;
    /** Prompt/istek/workflow/ayar paketi yazarı (docs/history/385-*): yorumu sabitleyebilir, yorumlarında "Yazar" rozeti çıkar. Verilmezse sabitleme yüzeyi yoktur. */
    contentOwnerId?: string | null;
    /** Yorum eklendi, değişti ya da silindi. */
    onChange?: () => void;
  } = {},
) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { profile: ownProfile } = useOwnProfile();
  const [draft, setDraft] = useState("");
  // Yorumda fotoğraf · GIF · içerik eki (docs/history/308-*): ana yazma kutusunun ve yanıt kutusunun ayrı ek durumu.
  const composerExtras = useCommentExtras();
  const replyExtras = useCommentExtras();
  // Düzenlerken görsel/ek de değiştirilebilir: düzenlenen yorumun mevcut eki ile açılır (`startEdit`).
  const editExtras = useCommentExtras();
  // The thread opens short (first few comments) so a long discussion never pushes related content out of reach; a jumped-to comment or the viewer's own new comment opens it all.
  const [showAll, setShowAll] = useState(Boolean(highlightCommentId));
  // Üst düzey yorumların sırası (docs/history/385-*): varsayılan en yeni üstte; sabit yorum her sıralamada başta; yanıtlar hep eskiden yeniye.
  const [sort, setSort] = useState<CommentSort>(DEFAULT_COMMENT_SORT);
  const [newCount, setNewCount] = useState(0);
  const [pinError, setPinError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [comments, setComments] = useState<PromptComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Üst düzey yorumlar 20'şerli sayfa (docs/history/258-*): sonraki sayfanın başlangıcı (null = hepsi okundu).
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false); // observer + click in the same tick must not read the same page twice
  const [moreFailed, setMoreFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [isPostingReply, setIsPostingReply] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const { exit, isLeaving } = useExitMotion();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [highlightNotFound, setHighlightNotFound] = useState(false);

  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollToId = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedHighlightId = useRef<string | null>(null);

  const targetKind: "prompt" | "request" | "result" | "workflow" | "preset" | "skill" | "community_post" | "quote" =
    "promptId" in target
      ? "prompt"
      : "requestId" in target
        ? "request"
        : "workflowId" in target
          ? "workflow"
          : "presetId" in target
            ? "preset"
            : "skillId" in target
            ? "skill"
            : "communityPostId" in target
              ? "community_post"
              : "quoteId" in target
                ? "quote"
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
            : "skillId" in target
            ? target.skillId
            : "communityPostId" in target
              ? target.communityPostId
              : "quoteId" in target
                ? target.quoteId
                : target.resultId;

  const scope: CommentScope = { kind: targetKind, id: targetId };
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  });

  function postCommentForTarget(kind: typeof targetKind, id: string, userId: string, body: string, parentId: string | null, extras?: CommentExtras) {
    if (kind === "prompt") return postCommentOnPrompt(id, userId, body, parentId, extras);
    if (kind === "request") return postCommentOnRequest(id, userId, body, parentId, extras);
    if (kind === "workflow") return postCommentOnWorkflow(id, userId, body, parentId, extras);
    if (kind === "preset") return postCommentOnPreset(id, userId, body, parentId, extras);
    if (kind === "skill") return postCommentOnSkill(id, userId, body, parentId, extras);
    if (kind === "community_post") return postCommentOnCommunityPost(id, userId, body, parentId, extras);
    if (kind === "quote") return postCommentOnQuote(id, userId, body, parentId, extras);
    return postCommentOnResult(id, userId, body, parentId, extras);
  }

  /**
   * Ekleri hazırlayıp (fotoğraf yüklenir) yorumu yazar. Yorum yazılamazsa yüklenen dosya geri silinir; yazılırsa ek durumu boşaltılır.
   * Hata çağırana fırlar (her yazma kutusu kendi hata satırını gösterir).
   */
  async function postWithExtras(extrasState: ReturnType<typeof useCommentExtras>, userId: string, body: string, parentId: string | null) {
    const { extras, uploadedPath } = await extrasState.prepare(userId);
    try {
      const posted = await postCommentForTarget(targetKind, targetId, userId, body, parentId, extras);
      extrasState.clear();
      return posted;
    } catch (err) {
      await extrasState.discardUpload(uploadedPath);
      throw err;
    }
  }

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the target (a new prompt/request) changes
    setLoaded(false);
    setLoadFailed(false);
    setMoreFailed(false);
    setNewCount(0);
    (async () => {
      const first = await fetchCommentThreadPage(scopeRef.current, 0, undefined, sort);
      let result = first.comments;
      // Bildirimden gelen yorum henüz okunmamış bir sayfadaysa kök yorumu ve altı ayrıca yüklenir.
      if (highlightCommentId && !result.some((c) => c.id === highlightCommentId)) {
        result = mergeComments(result, await fetchCommentThread(scopeRef.current, highlightCommentId).catch(() => []));
      }
      return { result, nextOffset: first.nextOffset };
    })()
      .then(async ({ result, nextOffset: next }) => {
        if (cancelled) return;
        setComments(result);
        setNextOffset(next);
        setLoaded(true);

        // Land on a specific comment/reply from a notification (Aşama 4.2-4.4)
        // — only once per `highlightCommentId` (a like on this same thread
        // shouldn't re-trigger the jump on every re-fetch).
        if (highlightCommentId && processedHighlightId.current !== highlightCommentId) {
          processedHighlightId.current = highlightCommentId;
          const byId = new Map(result.map((c) => [c.id, c]));
          const found = byId.get(highlightCommentId);
          if (!found) {
            setHighlightNotFound(true);
          } else {
            // Expand every ancestor so the target is actually rendered (a
            // reply nested under a collapsed "N yanıtı göster" toggle has no
            // DOM node to scroll to yet).
            const ancestorIds = new Set<string>();
            let cursor = found.parentId ? byId.get(found.parentId) : undefined;
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
      })
      .catch((err) => {
        console.error("comment thread", err);
        if (cancelled) return;
        setComments([]);
        setNextOffset(null);
        setLoadFailed(true);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [targetKind, targetId, user?.id, highlightCommentId, reloadKey, sort]);

  /** The next page of top-level comments (with their replies), appended — also by itself when the end of the list scrolls into view. */
  async function loadMoreComments() {
    if (nextOffset === null || loadingMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchCommentThreadPage(scopeRef.current, nextOffset, undefined, sort);
      setComments((prev) => mergeComments(prev, page.comments));
      setNextOffset(page.nextOffset);
    } catch (err) {
      console.error("comment thread (more)", err);
      setMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  const commentsById = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const { stateFor: attachmentStateFor } = useAttachmentCards(comments);
  // "Çalıştı mı?" rozeti (docs/history/341-*): yalnız prompt yorumlarında, silinmemiş yorumların yazarları için tek toplu okuma.
  const worksAuthorIds = useMemo(
    () => (targetKind === "prompt" ? [...new Set(comments.filter((c) => !c.deletedAt).map((c) => c.author.id))] : []),
    [comments, targetKind],
  );
  const worksVotes = useWorksVotes(targetKind === "prompt" ? targetId : null, worksAuthorIds);
  // "Çalıştı mı?" kutusundan yazılan yorum: yorum listesi yeniden yüklenmeden, kendi yorumumuz gibi listeye eklenir.
  useEffect(() => {
    if (targetKind !== "prompt") return;
    const onPosted = (event: Event) => {
      const detail = (event as CustomEvent<PromptCommentPostedDetail>).detail;
      if (!detail || detail.promptId !== targetId) return;
      setComments((prev) => mergeComments(prev, [detail.comment]));
      setShowAll(true);
    };
    window.addEventListener(PROMPT_COMMENT_POSTED_EVENT, onPosted);
    return () => window.removeEventListener(PROMPT_COMMENT_POSTED_EVENT, onPosted);
  }, [targetKind, targetId]);
  // Replies are always oldest first; the top level follows the chosen sort (pinned first) — pages and the viewer's own new comments merge into one list.
  const sorted = useMemo(() => [...comments].sort(byCreatedAsc), [comments]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, PromptComment[]>();
    for (const comment of sorted) {
      if (!comment.parentId) continue;
      const siblings = map.get(comment.parentId) ?? [];
      siblings.push(comment);
      map.set(comment.parentId, siblings);
    }
    return map;
  }, [sorted]);
  const topLevel = useMemo(() => sorted.filter((c) => !c.parentId).sort(compareTopLevel(sort)), [sorted, sort]);
  // "N yeni yorum" (docs/history/385-*): başkalarının yüklü listeden SONRA yazdıkları; pin yorumlarındaki gibi 45 sn'de bir yoklanır (Realtime yok), sekme gizliyken beklenir.
  const latestAtRef = useRef("");
  useEffect(() => {
    latestAtRef.current = comments.reduce((max, c) => (c.createdAt > max ? c.createdAt : max), "");
  }, [comments]);
  useEffect(() => {
    if (!loaded || loadFailed) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || !latestAtRef.current) return;
      const count = await countNewComments(scopeRef.current, latestAtRef.current, user?.id ?? null).catch(() => 0);
      if (!cancelled) setNewCount(count);
    };
    const id = window.setInterval(() => void poll(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loaded, loadFailed, user?.id, targetKind, targetId]);
  const canPin = Boolean(contentOwnerId) && user?.id === contentOwnerId && (targetKind === "prompt" || targetKind === "request" || targetKind === "workflow" || targetKind === "preset" || targetKind === "skill");

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

  function startReply(id: string) {
    setReplyingTo(id);
    setReplyDraft("");
    setReplyError(null);
    replyExtras.clear();
  }

  function cancelReply() {
    setReplyingTo(null);
    setReplyDraft("");
    setReplyError(null);
    replyExtras.clear();
  }

  async function submitReply(parentId: string) {
    const trimmed = replyDraft.trim();
    if ((!trimmed && !replyExtras.hasExtras) || replyExtras.isPreparing || !user || isPostingReply) return;
    setIsPostingReply(true);
    setReplyError(null);
    try {
      const posted = await postWithExtras(replyExtras, user.id, trimmed, parentId);
      bumpCommentCount(targetId, 1);
      setComments((prev) => [...prev, posted]);
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
    if ((!trimmed && !composerExtras.hasExtras) || composerExtras.isPreparing || !user) return;

    setIsPosting(true);
    setPostError(null);
    try {
      const posted = await postWithExtras(composerExtras, user.id, trimmed, null);
      bumpCommentCount(targetId, 1);
      setComments((prev) => [...prev, posted]);
      setDraft("");
      setShowAll(true);
      onChange?.();
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
    editExtras.load(comment.media ?? null, comment.attachment ?? null);
    // Editing and replying to the same node at once would be confusing UI-wise.
    if (replyingTo === comment.id) cancelReply();
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
    setEditError(null);
    editExtras.clear();
  }

  async function submitEdit(id: string) {
    const trimmed = editDraft.trim();
    // Metin boşaltılabilir yalnız görsel/ek kalıyorsa; ekisiz yorum boş kalamaz.
    if ((!trimmed && !editExtras.hasExtras) || editExtras.isPreparing || !user || isSavingEdit) return;
    const original = commentsById.get(id);
    setIsSavingEdit(true);
    setEditError(null);
    let uploadedPath: string | null = null;
    try {
      const prepared = await editExtras.prepare(user.id);
      uploadedPath = prepared.uploadedPath;
      const { editedAt } = await updateComment(id, trimmed, prepared.extras);
      const media = prepared.extras.media ?? null;
      const attachment = prepared.extras.attachment ?? null;
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body: trimmed, editedAt, media, attachment } : c)));
      // Yorumdan çıkan (kaldırılan ya da başka görselle değişen) fotoğrafın dosyası depoda kalmasın (en iyi çaba).
      if (original?.media?.kind === "photo" && !(media?.kind === "photo" && media.path === original.media.path)) void removeCommentPhotos([original.media.path]);
      cancelEdit();
    } catch (err) {
      await editExtras.discardUpload(uploadedPath);
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
    // Silinen yorumun fotoğrafı depoda kalmasın (en iyi çaba; kalırsa yetim süpürücü toplar).
    const doomedPhoto = commentsById.get(id)?.media;
    try {
      await deleteComment(id);
      if (doomedPhoto?.kind === "photo") void removeCommentPhotos([doomedPhoto.path]);
      // A comment with replies is soft-deleted (still counted); only a real
      // delete lowers the stored comment_count.
      if (!childrenByParent.has(id)) bumpCommentCount(targetId, -1);
      // The database alone decides whether this was a real delete (no
      // replies) or a soft delete (replies exist, preserved) — either way
      // marking it "deleted" here is correct: a real delete just won't be
      // in the list anymore next time this thread is fetched fresh, and a
      // soft delete needs exactly this placeholder treatment right now.
      const deletedAt = new Date().toISOString();
      const markDeleted = () => setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body: "", deletedAt } : c)));
      // Yanıtı olmayan yorum gerçekten silinmiştir: yer tutucu bırakmak yerine kayıp solar, satır kapanır (docs/history/335-*).
      if (childrenByParent.has(id)) markDeleted();
      else exit(id, () => setComments((prev) => prev.filter((c) => c.id !== id)));
      onChange?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("comments.deleteFailed"));
    } finally {
      setIsDeletingId(null);
    }
  }

  /** İçerik sahibi: üst düzey yorumu sabitler / sabitlemeyi kaldırır (iyimser; hata olursa geri alınır). Hedef başına tek sabit: öncekinin sabiti de kalkar. */
  async function togglePin(id: string) {
    if (!canPin) return;
    const target = comments.find((c) => c.id === id);
    if (!target || target.parentId || target.deletedAt) return;
    const pin = !target.pinnedAt;
    const snapshot = comments;
    const stamp = new Date().toISOString();
    setPinError(null);
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, pinnedAt: pin ? stamp : null } : pin ? { ...c, pinnedAt: null } : c)));
    try {
      await setCommentPinned(id, pin);
    } catch (err) {
      setComments(snapshot);
      setPinError(err instanceof Error ? err.message : t("comments.pinFailed"));
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
    isLeavingId: isLeaving,
    registerNodeRef,
    highlightedId,
    replyExtras,
    editExtras,
    attachmentStateFor,
    worksVoteOf: targetKind === "prompt" ? (authorId: string) => worksVotes.get(authorId) : undefined,
    contentOwnerId,
    onTogglePin: canPin ? togglePin : undefined,
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
    composerExtras,
    isPosting,
    postError,
    deleteError,
    highlightNotFound,
    showAll,
    setShowAll,
    hasMore: nextOffset !== null,
    loadMore: loadMoreComments,
    loadingMore,
    moreFailed,
    loadFailed,
    retryLoad: () => setReloadKey((n) => n + 1),
    sort,
    setSort,
    newCount,
    showNewComments: () => setReloadKey((n) => n + 1),
    pinError,
  };
}

/** Adds the comments not in the list yet (the list's own copies — edited, liked — win). */
function mergeComments(current: PromptComment[], incoming: PromptComment[]): PromptComment[] {
  const seen = new Set(current.map((c) => c.id));
  const fresh = incoming.filter((c) => !seen.has(c.id));
  return fresh.length === 0 ? current : [...current, ...fresh];
}
