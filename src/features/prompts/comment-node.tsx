"use client";

import { ChevronDown, ChevronUp, CornerDownRight, Heart } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
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
  likedIds: Set<string>;
  likeCounts: Record<string, number>;
  pendingLikeIds: Set<string>;
  onToggleLike: (id: string) => void;
  registerNodeRef: (id: string, el: HTMLDivElement | null) => void;
}

/**
 * A single comment or reply, recursively rendering its own children —
 * this is the whole "unlimited depth" nested-reply tree: any node
 * (top-level comment or a reply at any depth) can itself be replied to,
 * liked, and independently collapsed/expanded, because every node here
 * is rendered by the exact same component regardless of depth.
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
  const children = tree.childrenByParent.get(comment.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = tree.expandedIds.has(comment.id);
  const isReplyingHere = tree.replyingTo === comment.id;
  const isLiked = tree.likedIds.has(comment.id);
  const likeCount = tree.likeCounts[comment.id] ?? comment.likeCount;
  const isLikePending = tree.pendingLikeIds.has(comment.id);

  const parent = comment.parentId ? tree.commentsById.get(comment.parentId) : undefined;
  // Once indentation stops growing, the visual nesting alone no longer shows
  // who a reply is answering — this hint keeps that relationship visible.
  const showParentHint = depth > MAX_INDENT_DEPTH && parent;

  return (
    <div ref={(el) => tree.registerNodeRef(comment.id, el)} className="space-y-2">
      <div className="flex gap-2.5">
        <Avatar src={comment.author.avatarUrl} alt={comment.author.displayName} size={depth === 0 ? 32 : 28} />
        <div className="min-w-0 flex-1">
          <p className="text-sm break-words">
            <span className="font-medium text-text">{comment.author.displayName}</span>{" "}
            {showParentHint && (
              <span className="mr-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                <CornerDownRight size={11} />@{parent.author.username}
              </span>
            )}
            <span className="text-text-muted">{comment.body}</span>
          </p>

          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span>{formatRelativeTime(comment.createdAt)}</span>
            <button
              type="button"
              onClick={() => tree.onToggleLike(comment.id)}
              disabled={!tree.canInteract || isLikePending}
              title={tree.canInteract ? undefined : "Beğenmek için giriş yapmalısın"}
              className={cn(
                "flex items-center gap-1 rounded-sm py-0.5 transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-60",
                isLiked && "text-primary",
              )}
            >
              <Heart size={13} fill={isLiked ? "currentColor" : "none"} />
              {likeCount > 0 && likeCount}
            </button>
            {tree.canInteract && (
              <button
                type="button"
                onClick={() => (isReplyingHere ? tree.onCancelReply() : tree.onStartReply(comment.id))}
                className="font-medium hover:text-text"
              >
                Yanıtla
              </button>
            )}
          </div>

          {isReplyingHere && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                tree.onSubmitReply(comment.id);
              }}
              className="mt-2 space-y-1.5"
            >
              <p className="text-xs text-text-muted">
                <span className="font-medium text-primary">@{comment.author.username}</span> kullanıcısına yanıt
                veriyorsun.
              </p>
              <textarea
                value={tree.replyDraft}
                onChange={(event) => tree.onReplyDraftChange(event.target.value)}
                rows={2}
                autoFocus
                placeholder="Yanıtını yaz..."
                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={!tree.replyDraft.trim() || tree.isPosting}>
                  {tree.isPosting ? "Gönderiliyor..." : "Gönder"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelReply}>
                  İptal
                </Button>
              </div>
              {tree.postError && <p className="text-xs text-red-500">{tree.postError}</p>}
            </form>
          )}

          {hasChildren && (
            <button
              type="button"
              onClick={() => tree.onToggleExpand(comment.id)}
              className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {isExpanded ? "Yanıtları gizle" : `${children.length} yanıtı göster`}
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
