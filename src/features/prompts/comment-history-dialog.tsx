"use client";

import { useEffect, useId, useState } from "react";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { MentionText } from "@/features/mentions/mention-text";
import { commentVersionLabel } from "@/lib/comment-follow";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchCommentHistory, type CommentVersion } from "@/lib/supabase/comment-follow";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { PromptComment } from "@/types";

/**
 * Yorumun düzenleme geçmişi (docs/history/452-*): şimdiki sürüm üstte, altında önceki sürümler yazıldıkları zamanla. Yorumu okuyabilen herkes görür
 * (`comment_history`). Önceki sürümler yalnız bu özellikten SONRAKİ düzenlemeler için tutulur; eski düzenlemelerde liste boş olabilir ve bunu söyler.
 */
export function CommentHistoryDialog({ comment, onClose }: { comment: PromptComment; onClose: () => void }) {
  const { t, language } = useTranslation();
  const titleId = useId();
  const [versions, setVersions] = useState<CommentVersion[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCommentHistory(comment.id)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((err) => {
        console.error("fetchCommentHistory", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [comment.id]);

  // Şimdiki sürüm + kayıtlı eskiler (en yeni önce).
  const rows = versions ? [{ id: "current", body: comment.body, when: comment.editedAt ? t("comments.history.editedAt", { when: formatRelativeTime(comment.editedAt, language) }) : formatRelativeTime(comment.createdAt, language) }, ...versions.map((v) => ({ id: v.id, body: v.body, when: formatRelativeTime(v.writtenAt, language) }))] : [];

  return (
    <Modal onClose={onClose} labelledBy={titleId} overLayers>
      <DialogShell data-comment-history="" className="flex max-h-[75dvh] w-full max-w-md flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
          <h2 id={titleId} className="font-display text-h3 font-bold text-text">
            {t("comments.history.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
          {failed ? (
            <p role="alert" className="text-small text-danger">
              {t("comments.history.loadFailed")}
            </p>
          ) : versions === null ? (
            <div role="status" aria-label={t("comments.loadingComments")} className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : (
            <>
              {rows.map((row, index) => {
                const label = commentVersionLabel(index, rows.length);
                return (
                  <div key={row.id} data-comment-version={label} className={cn("rounded-md border px-4 py-3", label === "current" ? "border-primary/30 bg-primary-soft" : "border-border-soft")}>
                    <p className="text-small font-semibold text-text">{t(label === "current" ? "comments.history.current" : label === "first" ? "comments.history.first" : "comments.history.previous")}</p>
                    <p className="text-caption text-text-muted">{row.when}</p>
                    <p className="mt-1.5 break-words text-body text-text">
                      <MentionText text={row.body} />
                    </p>
                  </div>
                );
              })}
              {versions.length === 0 && <p className="text-small text-text-muted">{t("comments.history.empty")}</p>}
            </>
          )}
        </div>
        <div data-dialog-footer="" className="flex shrink-0 justify-end border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </DialogShell>
    </Modal>
  );
}
