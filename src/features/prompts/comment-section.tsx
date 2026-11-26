"use client";

import { useMemo, useState } from "react";
import { Bell } from "@/components/icons/bell";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/features/groups/use-toast";
import type { PromptComment } from "@/types";
import { CommentHistoryDialog } from "./comment-history-dialog";
import { useCommentFollow } from "./use-comment-follow";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LoadMore } from "@/features/feed/load-more";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CommentNode } from "./comment-node";
import { ArrowRight } from "@/components/icons/arrow-right";
import { ArrowUp } from "@/components/icons/arrow-up";
import { SectionMenu, type SectionMenuItem } from "@/features/content/section-menu";
import type { CommentSort } from "@/lib/comment-sort";
import { useCommentThread, type CommentTarget } from "./use-comment-thread";
import { CommentExtrasPreview, CommentExtrasToolbar } from "./comment-extras";
import { CommentComposerBox } from "./comment-composer-box";
import { Send } from "@/components/icons/send";

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
  placeholder,
  onChange,
  ownerId = null,
}: {
  target: CommentTarget;
  /** Prompt/istek/workflow/ayar paketi yazarı: yorum sabitleyebilir, yorumlarında "Yazar" rozeti çıkar (docs/history/385-*). */
  ownerId?: string | null;
  /** Yazma kutusunun ipucu metni (varsayılan "Bir yorum yaz…"). */
  placeholder?: string;
  /** Yorum değişince çağrılır. */
  onChange?: () => void;
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
  const sortItems: SectionMenuItem<CommentSort>[] = [
    { key: "newest", label: t("comments.sort.newest") },
    { key: "liked", label: t("comments.sort.liked") },
    { key: "oldest", label: t("comments.sort.oldest") },
  ];
  const {
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
    hasMore,
    loadMore,
    loadingMore,
    moreFailed,
    loadFailed,
    retryLoad,
    sort,
    setSort,
    newCount,
    showNewComments,
    pinError,
  } = useCommentThread(target, { highlightCommentId, contentOwnerId: ownerId, onChange });

  // Yorum takibi + ⋮ menüsü + düzenleme geçmişi (docs/history/452-*).
  const follow = useCommentFollow(target);
  const toast = useToast();
  const [historyFor, setHistoryFor] = useState<PromptComment | null>(null);
  const menu = useMemo(() => ({ follow, notify: toast.show, openHistory: setHistoryFor }), [follow, toast.show]);
  const treeWithMenu = useMemo(() => ({ ...tree, menu }), [tree, menu]);

  async function toggleFollow() {
    const next = await follow.toggleContent();
    if (next !== null) toast.show(t(next ? "comments.follow.on" : "comments.follow.off"));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitComment();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {headless ? (
          <p className="text-caption tabular-nums text-text-muted">{t("comments.countLabel", { count: hasMore ? `${comments.length}+` : comments.length })}</p>
        ) : (
          <h2 className="text-label font-semibold text-text">
            {t("comments.title")}
            <span className="font-normal tabular-nums text-text-muted"> · {hasMore ? `${comments.length}+` : comments.length}</span>
          </h2>
        )}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {follow.canFollow && (
            <button
              type="button"
              onClick={() => void toggleFollow()}
              aria-pressed={follow.contentFollowing}
              data-comment-follow
              className={cn(
                "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-sm px-4 text-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                follow.contentFollowing ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-primary-soft text-primary-text hover:bg-primary-soft/70",
              )}
            >
              <Bell size={16} aria-hidden />
              {follow.contentFollowing ? t("comments.following") : t("comments.follow")}
            </button>
          )}
          {(topLevel.length > 1 || hasMore) && (
            <>
              {/* Tablet/masaüstü: satır içi çipler (pencere/açılır kutu yok). Telefon: tek hap, alt sayfa (SectionMenu). */}
              <div role="group" aria-label={t("comments.sort.label")} className="hidden gap-0.5 rounded-sm bg-surface-soft p-1 sm:flex">
                {sortItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    data-sort-chip={item.key}
                    aria-pressed={sort === item.key}
                    onClick={() => setSort(item.key)}
                    className={cn(
                      "h-9 rounded-sm px-3 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                      sort === item.key ? "bg-surface font-semibold text-primary-text shadow-xs" : "font-medium text-text-secondary hover:text-text",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="sm:hidden">
                <SectionMenu items={sortItems} active={sort} onChange={setSort} ariaLabel={t("comments.sort.label")} title={t("comments.sort.label")} align="end" />
              </div>
            </>
          )}
          {(topLevel.length > COLLAPSED_COMMENTS || hasMore) && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              aria-expanded={showAll}
              className="-my-2.5 inline-flex items-center gap-1 py-2.5 text-caption font-medium text-primary-text transition-opacity hover:opacity-80"
            >
              {showAll ? t("common.showLess") : t("comments.viewAllThread")}
              {!showAll && <ArrowRight size={12} aria-hidden />}
            </button>
          )}
        </div>
      </div>

      {newCount > 0 && (
        <button
          type="button"
          onClick={showNewComments}
          data-new-comments
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-small font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <ArrowUp size={16} aria-hidden />
          {newCount === 1 ? t("comments.newOne") : t("comments.newMany", { count: newCount })}
        </button>
      )}

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
            className="font-medium text-primary-text underline"
          >
            {t("comments.loginToCommentLink")}
          </button>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-start gap-3">
          <Avatar src={ownProfile?.avatarUrl ?? null} alt={ownProfile?.displayName ?? t("prompt.previewAuthorName")} size={36} />
          <div className="min-w-0 flex-1 space-y-2">
          <CommentComposerBox
            value={draft}
            onChange={setDraft}
            placeholder={placeholder ?? t("comments.writeAComment")}
            toolbar={<CommentExtrasToolbar extras={composerExtras} userId={user.id} disabled={isPosting} />}
            preview={<CommentExtrasPreview extras={composerExtras} />}
            submit={
              <Button type="submit" size="sm" disabled={!(draft.trim() || composerExtras.hasExtras) || composerExtras.isPreparing || isPosting}>
                <Send size={16} aria-hidden />
                {isPosting ? t("common.sending") : t("common.send")}
              </Button>
            }
          />
          </div>
        </form>
      )}

      {postError && <p className="text-small text-danger">{postError}</p>}
      {deleteError && <p className="text-small text-danger">{deleteError}</p>}
      {pinError && <p className="text-small text-danger">{pinError}</p>}
      {follow.followError && <p role="alert" className="text-small text-danger">{follow.followError}</p>}

      {!loaded ? (
        <div className="space-y-3" role="status" aria-label={t("comments.loadingComments")}>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5 pt-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : loadFailed ? (
        <div className="space-y-2 py-4 text-center" role="alert">
          <p className="text-small text-danger">{t("feed.loadFailed")}</p>
          <Button type="button" variant="outline" size="sm" onClick={retryLoad}>
            {t("common.retry")}
          </Button>
        </div>
      ) : topLevel.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-small text-text-muted">{t("comments.noCommentsYet")}</p>
      ) : (
        <div>
          <div className="divide-y divide-border-soft">
            {(showAll ? topLevel : topLevel.slice(0, COLLAPSED_COMMENTS)).map((comment) => (
              <CommentNode key={comment.id} comment={comment} depth={0} tree={treeWithMenu} />
            ))}
          </div>
          {/* Sonraki sayfa yalnız liste açıkken (kısa özet görünümünde bütün sayfaları gereksiz yüklemesin) ve kendiliğinden gelir. */}
          {showAll && <LoadMore failed={moreFailed} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />}
        </div>
      )}
      {toast.node}
      {historyFor && <CommentHistoryDialog comment={historyFor} onClose={() => setHistoryFor(null)} />}
    </section>
  );
}
