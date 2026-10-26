"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef } from "react";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { FocusSheetFrame } from "./focus-sheet-frame";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { contentActionClassName } from "@/features/content/action-styles";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import { CommentNode, type CommentTree } from "@/features/prompts/comment-node";
import { useCommentThread, type CommentTarget } from "@/features/prompts/use-comment-thread";
import { MentionInput } from "@/features/mentions/mention-field";
import type { PostFeedItem } from "@/features/feed/types";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount } from "@/lib/utils";

/**
 * Odak's comments (docs/history/200-*), Instagram-style: the comment button opens a sheet from the bottom while the post
 * shrinks into the space above it and keeps playing (`FocusScreen`); from `md` it is a panel on the right. The thread is the
 * detail pages' own (`useCommentThread`: load, like, reply at any depth, edit, delete, report, @mentions) in its `sheet`
 * layout — one composer at the bottom writes comments AND replies ("Yanıtla" turns it into a reply to that person),
 * with a row of quick emoji above it. Dragging the grabber down, tapping the post above, Esc or X closes it.
 */

/** Opens the comment sheet for a post — provided by `FocusScreen`. */
export const FocusCommentsContext = createContext<(item: PostFeedItem) => void>(() => undefined);

const QUICK_EMOJI = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"] as const;

function targetOf(item: PostFeedItem): CommentTarget {
  switch (item.kind) {
    case "prompt":
      return { promptId: item.data.id };
    case "request":
      return { requestId: item.data.id };
    case "workflow":
      return { workflowId: item.data.id };
    case "preset":
      return { presetId: item.data.id };
  }
}

/** The rail's comment button in Odak: same look and live count as `CommentCountLink`, but opens the sheet in place. */
export function FocusCommentButton({ item, size, className }: { item: PostFeedItem; size: number; className?: string }) {
  const { t } = useTranslation();
  const openComments = useContext(FocusCommentsContext);
  const delta = useCommentCountDelta(item.data.id);
  const count = Math.max(0, item.data.commentCount + delta);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openComments(item);
      }}
      aria-haspopup="dialog"
      aria-label={t("focusComments.open", { count: formatCount(count) })}
      title={t("comments.title")}
      className={contentActionClassName(false, className)}
    >
      <MessageCircle size={size} strokeWidth={1.75} />
      <span aria-hidden>{formatCount(count)}</span>
    </button>
  );
}

export function FocusCommentsSheet({ item, onClose }: { item: PostFeedItem; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const thread = useCommentThread(targetOf(item));
  const { user, ownProfile, requireAuth, tree: baseTree } = thread;
  const replyingTo = baseTree.replyingTo;
  const replyTarget = replyingTo ? baseTree.commentsById.get(replyingTo) : undefined;

  // "Yanıtla" turns the one composer into a reply ("@name " prefilled, as on Instagram); a guest gets the login prompt.
  const startReply = useCallback(
    (id: string) => {
      if (!user) {
        requireAuth("comment");
        return;
      }
      baseTree.onStartReply(id);
      const comment = baseTree.commentsById.get(id);
      if (comment) baseTree.onReplyDraftChange(`@${comment.author.username} `);
      inputRef.current?.focus();
    },
    [user, requireAuth, baseTree],
  );
  const tree: CommentTree = { ...baseTree, layout: "sheet", onStartReply: startReply };

  const value = replyingTo ? baseTree.replyDraft : thread.draft;
  const setValue = replyingTo ? baseTree.onReplyDraftChange : thread.setDraft;
  const posting = replyingTo ? baseTree.isPosting : thread.isPosting;
  const error = (replyingTo ? baseTree.postError : thread.postError) ?? thread.deleteError;

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!value.trim() || posting) return;
    if (replyingTo) {
      baseTree.onSubmitReply(replyingTo);
      return;
    }
    await thread.submitComment();
    // A new top-level comment lands at the end of the thread: show it.
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  function addEmoji(emoji: string) {
    if (!user) {
      requireAuth("comment");
      return;
    }
    setValue(`${value}${emoji}`);
    inputRef.current?.focus();
  }

  // Esc closes the sheet (a reply in progress first), unless a dialog opened from inside it (report…) is on top.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      event.preventDefault();
      if (replyingTo) baseTree.onCancelReply();
      else onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [replyingTo, baseTree, onClose]);

  return (
    <FocusSheetFrame
      kind="comments"
      titleId={titleId}
      title={
        <>
          {t("comments.title")}
          {thread.loaded && <span className="font-normal tabular-nums text-text-muted"> · {formatCount(thread.comments.length)}</span>}
        </>
      }
      closeLabel={t("focusComments.close")}
      onClose={onClose}
    >
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border-soft px-3 py-3">
          {!thread.loaded ? (
            <div className="space-y-4" role="status" aria-label={t("comments.loadingComments")}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3 px-1">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : thread.topLevel.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 py-8 text-center">
              <p className="text-h3 font-bold text-text">{t("focusComments.emptyTitle")}</p>
              <p className="text-small text-text-muted">{t("focusComments.emptyHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {thread.topLevel.map((comment) => (
                <CommentNode key={comment.id} comment={comment} depth={0} tree={tree} />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border-soft bg-surface pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 md:pb-4">
          <div role="group" aria-label={t("focusComments.emojiRow")} className="scrollbar-none flex justify-between gap-1 overflow-x-auto px-3 pb-2">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addEmoji(emoji)}
                aria-label={t("focusComments.addEmoji", { emoji })}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[1.6rem] leading-none transition-transform duration-150 ease-soft hover:scale-110 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>

          {replyTarget && (
            <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg bg-surface-soft px-3 py-1.5 text-caption text-text-secondary">
              <span className="truncate">{t("focusComments.replyingTo", { name: replyTarget.author.username })}</span>
              <button type="button" onClick={baseTree.onCancelReply} aria-label={t("focusComments.cancelReply")} className="shrink-0 rounded-full p-1 text-text-muted hover:text-text">
                <X size={14} aria-hidden />
              </button>
            </div>
          )}
          {error && <p className="mx-3 mb-2 text-caption text-danger">{error}</p>}

          {user ? (
            <form onSubmit={submit} className="flex items-center gap-2.5 px-3">
              <Avatar src={ownProfile?.avatarUrl ?? null} alt={ownProfile?.displayName ?? ""} size={40} />
              <div className="relative flex min-w-0 flex-1 items-center rounded-full border border-border bg-surface-soft pl-4 pr-1.5 focus-within:border-primary/60">
                <MentionInput
                  ref={inputRef}
                  value={value}
                  onChange={setValue}
                  suggestionsPlacement="above"
                  enterKeyHint="send"
                  aria-label={t("focusComments.placeholder")}
                  placeholder={t("focusComments.placeholder")}
                  maxLength={2000}
                  className="h-11 w-full min-w-0 bg-transparent text-body text-text placeholder:text-text-muted focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!value.trim() || posting}
                  aria-label={t("common.send")}
                  title={t("common.send")}
                  className={cn(
                    "ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-200 ease-soft disabled:opacity-0",
                    posting && "animate-pulse",
                  )}
                >
                  <ArrowUp size={18} strokeWidth={2.4} aria-hidden />
                </button>
              </div>
            </form>
          ) : (
            <div className="px-3">
              <button
                type="button"
                onClick={() => requireAuth("comment")}
                aria-haspopup="dialog"
                className="flex h-11 w-full items-center justify-center rounded-full border border-border bg-surface-soft text-label font-semibold text-text hover:bg-surface-elevated"
              >
                {t("focusComments.loginToComment")}
              </button>
            </div>
          )}
        </div>
    </FocusSheetFrame>
  );
}
