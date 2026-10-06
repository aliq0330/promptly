"use client";

import { LikeToggle, type LikeToggleResult } from "@/components/ui/like-toggle";
import Link from "next/link";
import { ChevronDown, ChevronUp, CornerDownRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { ReportButton } from "@/features/moderation/report-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptComment } from "@/types";

/** Beyond this nesting level, indentation stops growing (mobile/readability) — the "@kime yanıt verdiği" hint below takes over showing the relationship instead. */
const MAX_INDENT_DEPTH = 6;

export interface CommentTree {
  childrenByParent: Map<string, PromptComment[]>;
  commentsById: Map<string, PromptComment>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  replyingTo: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: (parentId: string) => void;
  isPosting: boolean;
  postError: string | null;
  canInteract: boolean;
  currentUserId: string | null;
  likedIds: Set<string>;
  likeCounts: Record<string, number>;
  pendingLikeIds: Set<string>;
  onToggleLike: (id: string) => Promise<LikeToggleResult>;
  editingId: string | null;
  onStartEdit: (comment: PromptComment) => void;
  onCancelEdit: () => void;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onSubmitEdit: (id: string) => void;
  isSavingEdit: boolean;
  editError: string | null;
  deleteConfirmId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDeleteConfirm: () => void;
  isDeletingId: string | null;
  registerNodeRef: (id: string, el: HTMLDivElement | null) => void;
  /** The comment/reply currently flashed after a notification jump (Aşama 5) — null once the flash has faded or nothing was jumped to. */
  highlightedId: string | null;
}

/**
 * A single comment or reply, recursively rendering its own children —
 * this is the whole "unlimited depth" nested-reply tree: any node
 * (top-level comment or a reply at any depth) can itself be replied to,
 * liked, edited, deleted, and independently collapsed/expanded, because
 * every node here is rendered by the exact same component regardless of
 * depth.
 */
export function CommentNode({
  comment,
  depth,
  tree,
}: {
  comment: PromptComment;
  depth: number;
  tree: CommentTree;
}) {
  const { t, language } = useTranslation();
  const children = tree.childrenByParent.get(comment.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = tree.expandedIds.has(comment.id);
  const isReplyingHere = tree.replyingTo === comment.id;
  const isLiked = tree.likedIds.has(comment.id);
  const likeCount = tree.likeCounts[comment.id] ?? comment.likeCount;
  const isLikePending = tree.pendingLikeIds.has(comment.id);
  const isDeleted = Boolean(comment.deletedAt);
  const isOwn = Boolean(tree.currentUserId) && tree.currentUserId === comment.author.id;
  const isEditingHere = tree.editingId === comment.id;
  const isConfirmingDelete = tree.deleteConfirmId === comment.id;
  const isDeletingHere = tree.isDeletingId === comment.id;

  const parent = comment.parentId ? tree.commentsById.get(comment.parentId) : undefined;
  // Once indentation stops growing, the visual nesting alone no longer shows
  // who a reply is answering — this hint keeps that relationship visible.
  const showParentHint = depth > MAX_INDENT_DEPTH && parent;
  const isHighlighted = tree.highlightedId === comment.id;

  return (
    <div
      ref={(el) => tree.registerNodeRef(comment.id, el)}
      className={cn(
        "space-y-2 rounded-md transition-colors duration-700",
        isHighlighted && "-m-1.5 bg-primary/10 p-1.5 ring-1 ring-primary/40",
      )}
    >
      <div className="flex gap-2.5">
        <Link href={profileHref(comment.author)} className="shrink-0 hover:opacity-80" aria-label={comment.author.displayName}>
          <Avatar src={comment.author.avatarUrl} alt={comment.author.displayName} size={depth === 0 ? 32 : 28} />
        </Link>
        <div className="min-w-0 flex-1">
          {isDeleted ? (
            <p className="text-sm italic text-text-muted">
              <Link href={profileHref(comment.author)} className="font-medium not-italic text-text hover:underline">
                {comment.author.displayName}
              </Link>{" "}
              {t("comments.thisCommentWasDeleted")}
            </p>
          ) : isEditingHere ? (
            <div className="space-y-1.5">
              <textarea
                value={tree.editDraft}
                onChange={(event) => tree.onEditDraftChange(event.target.value)}
                rows={2}
                autoFocus
                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!tree.editDraft.trim() || tree.isSavingEdit}
                  onClick={() => tree.onSubmitEdit(comment.id)}
                >
                  {tree.isSavingEdit ? t("common.saving") : t("common.save")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelEdit}>
                  {t("common.cancel")}
                </Button>
              </div>
              {tree.editError && <p className="text-xs text-danger">{tree.editError}</p>}
            </div>
          ) : (
            <p className="text-sm break-words">
              <Link href={profileHref(comment.author)} className="font-medium text-text hover:underline">
                {comment.author.displayName}
              </Link>{" "}
              {showParentHint && (
                <span className="mr-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                  <CornerDownRight size={11} />@{parent.author.username}
                </span>
              )}
              <span className="text-text-muted">{comment.body}</span>
            </p>
          )}

          {!isDeleted && !isEditingHere && (
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>
                {formatRelativeTime(comment.createdAt, language)}
                {comment.editedAt && ` · ${t("comments.edited")}`}
              </span>
              <LikeToggle
                liked={isLiked}
                count={likeCount}
                size={13}
                hideZero
                onToggle={() => tree.onToggleLike(comment.id)}
                disabled={!tree.canInteract || isLikePending}
                title={tree.canInteract ? undefined : t("prompt.loginToLike")}
                label={t(isLiked ? "prompt.unlikeAria" : "prompt.likeAria", { count: likeCount })}
                className={cn(
                  "flex items-center gap-1 rounded-sm py-0.5 transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-60",
                  isLiked && "text-danger hover:text-danger",
                )}
              />
              {tree.canInteract && (
                <button
                  type="button"
                  onClick={() => (isReplyingHere ? tree.onCancelReply() : tree.onStartReply(comment.id))}
                  className="font-medium hover:text-text"
                >
                  {t("request.reply")}
                </button>
              )}
              {!isOwn && tree.currentUserId && (
                <ReportButton targetType="comment" targetId={comment.id} menuItem={false} />
              )}
              {isOwn && (
                <>
                  <button type="button" onClick={() => tree.onStartEdit(comment)} className="hover:text-text">
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => tree.onRequestDelete(comment.id)}
                    onBlur={tree.onCancelDeleteConfirm}
                    disabled={isDeletingHere}
                    className={cn("hover:text-text", isConfirmingDelete && "font-medium text-danger")}
                  >
                    {isDeletingHere ? t("common.deleting") : isConfirmingDelete ? t("common.confirmDelete") : t("common.delete")}
                  </button>
                </>
              )}
            </div>
          )}

          {isReplyingHere && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                tree.onSubmitReply(comment.id);
              }}
              className="mt-2 space-y-1.5"
            >
              <p className="text-xs text-text-muted">
                <span className="font-medium text-primary">@{comment.author.username}</span> {t("comments.replyingToSuffix")}
              </p>
              <textarea
                value={tree.replyDraft}
                onChange={(event) => tree.onReplyDraftChange(event.target.value)}
                rows={2}
                autoFocus
                placeholder={t("comments.writeAReply")}
                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={!tree.replyDraft.trim() || tree.isPosting}>
                  {tree.isPosting ? t("common.sending") : t("common.send")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelReply}>
                  {t("common.cancel")}
                </Button>
              </div>
              {tree.postError && <p className="text-xs text-danger">{tree.postError}</p>}
            </form>
          )}

          {hasChildren && (
            <button
              type="button"
              onClick={() => tree.onToggleExpand(comment.id)}
              className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {isExpanded
                ? t("comments.hideReplies")
                : children.length === 1
                  ? t("comments.showReplySingular")
                  : t("comments.showRepliesPlural", { count: children.length })}
            </button>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div
          className={cn(
            "space-y-3",
            depth < MAX_INDENT_DEPTH && "border-l border-border pl-3",
          )}
        >
          {children.map((child) => (
            <CommentNode key={child.id} comment={child} depth={depth + 1} tree={tree} />
          ))}
        </div>
      )}
    </div>
  );
}
