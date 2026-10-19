"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CommentNode } from "./comment-node";
import { ArrowRight } from "lucide-react";
import { MentionInput } from "@/features/mentions/mention-field";
import { useCommentThread, type CommentTarget } from "./use-comment-thread";

export type { CommentTarget };

/** How many top-level comments show before "Tümünü gör". */
const COLLAPSED_COMMENTS = 3;

/**
 * A detail page's comment thread (the logic lives in `useCommentThread`, shared with Odak's comment sheet).
 */
export function CommentSection({
  target,
  disabledReason,
  highlightCommentId,
  headless = false,
}: {
  target: CommentTarget;
  /** The page already titles the thread (the detail pages' numbered "Yorumlar" section): drop the own heading, keep the count + "Tümünü gör". */
  headless?: boolean;
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
  const { t } = useTranslation();
  const { user, ownProfile, requireAuth, comments, loaded, topLevel, tree, draft, setDraft, submitComment, isPosting, postError, deleteError, highlightNotFound, showAll, setShowAll } =
    useCommentThread(target, { highlightCommentId });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitComment();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {headless ? (
          <p className="text-caption tabular-nums text-text-muted">{t("comments.countLabel", { count: comments.length })}</p>
        ) : (
          <h2 className="text-label font-semibold text-text">
            {t("comments.title")}
            <span className="font-normal tabular-nums text-text-muted"> · {comments.length}</span>
          </h2>
        )}
        {topLevel.length > COLLAPSED_COMMENTS && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            aria-expanded={showAll}
            className="inline-flex items-center gap-1 text-caption font-medium text-primary transition-opacity hover:opacity-80"
          >
            {showAll ? t("common.showLess") : t("comments.viewAllThread")}
            {!showAll && <ArrowRight size={13} aria-hidden />}
          </button>
        )}
      </div>

      {highlightNotFound && (
        <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
          {t("comments.thisCommentNotAvailable")}
        </p>
      )}

      {disabledReason ? (
        <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
          {disabledReason}
        </p>
      ) : !user ? (
        <p className="rounded-md bg-surface-soft px-3 py-2.5 text-small text-text-muted">
          {t("comments.loginToCommentPrefix")}{" "}
          <button
            type="button"
            onClick={() => requireAuth("comment")}
            aria-haspopup="dialog"
            className="font-medium text-primary underline"
          >
            {t("comments.loginToCommentLink")}
          </button>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
          <Avatar src={ownProfile?.avatarUrl ?? null} alt={ownProfile?.displayName ?? t("prompt.previewAuthorName")} size={32} />
          <div className="flex min-w-0 flex-1 gap-2">
            <MentionInput
              value={draft}
              onChange={setDraft}
              placeholder={t("comments.writeAComment")}
              className="h-9 w-full min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-small text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || isPosting}>
              {isPosting ? t("common.sending") : t("common.send")}
            </Button>
          </div>
        </form>
      )}

      {postError && <p className="text-sm text-danger">{postError}</p>}
      {deleteError && <p className="text-sm text-danger">{deleteError}</p>}

      {!loaded ? (
        <div className="space-y-3" role="status" aria-label={t("comments.loadingComments")}>
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
        <p className="rounded-md border border-dashed border-border py-6 text-center text-small text-text-muted">{t("comments.noCommentsYet")}</p>
      ) : (
        <div className="space-y-4">
          {(showAll ? topLevel : topLevel.slice(0, COLLAPSED_COMMENTS)).map((comment) => (
            <CommentNode key={comment.id} comment={comment} depth={0} tree={tree} />
          ))}
        </div>
      )}
    </section>
  );
}
