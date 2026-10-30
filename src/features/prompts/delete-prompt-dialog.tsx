"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { fetchPromptDeleteImpact, type PromptDeleteImpact } from "@/lib/supabase/prompts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * "Bu promptu sil?" (docs/history/283-*): what deleting takes along and what stays — how many user results the prompt has (they are NOT deleted: they
 * stay with their creators marked "Prompt silindi"; only a community's own content takes them along), its likes and comments (deleted), and that the
 * result owners are notified. A bottom sheet on phones (`Modal`), a centred dialog from `sm` up.
 */
export function DeletePromptDialog({
  promptId,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  promptId: string;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // `undefined` = loading, `null` = could not be read (the dialog still lets the owner confirm, without the counts).
  const [impact, setImpact] = useState<PromptDeleteImpact | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchPromptDeleteImpact(promptId)
      .then((result) => !cancelled && setImpact(result))
      .catch(() => !cancelled && setImpact(null));
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  const resultCount = impact?.resultCount ?? 0;
  const kept = impact ? !impact.communityContent : true;
  const hasEngagement = Boolean(impact && (impact.likeCount > 0 || impact.commentCount > 0));

  return (
    <Modal onClose={onClose} labelledBy="delete-prompt-title">
      <div
        role="alertdialog"
        aria-labelledby="delete-prompt-title"
        data-delete-prompt-dialog=""
        className="w-full max-w-md space-y-4 rounded-t-xl border border-border-soft bg-surface p-5 shadow-pop sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h2 id="delete-prompt-title" className="font-display text-h2 font-bold text-text">
            {t("deletePrompt.title")}
          </h2>
          {impact ? (
            <p className="text-small text-text-secondary">{t("deletePrompt.body", { title: impact.title })}</p>
          ) : (
            <p className="text-small text-text-secondary">{t("deletePrompt.title")}</p>
          )}
        </div>

        {impact === undefined ? (
          <div className="space-y-2" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-2">
            {resultCount > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-surface-soft px-3.5 py-3" data-delete-results="">
                <div className="mt-0.5 flex shrink-0 items-center">
                  {impact?.resultThumbnails.map((url, index) => (
                    <span key={index} className={cn("h-[30px] w-[30px] overflow-hidden rounded-[9px] bg-border-soft ring-2 ring-surface-soft", index > 0 && "-ml-2.5")}>
                      {url && <StorageImg src={url} alt="" className="h-full w-full object-cover" />}
                    </span>
                  ))}
                  {resultCount > 3 && (
                    <span className="-ml-2.5 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-border-soft text-caption font-bold text-text-secondary ring-2 ring-surface-soft">
                      +{resultCount - 3}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-body font-semibold text-text">{t(kept ? "deletePrompt.resultsKept" : "deletePrompt.resultsDeleted", { count: resultCount })}</p>
                  <p className="text-small text-text-muted">{t(kept ? "deletePrompt.resultsKeptHint" : "deletePrompt.resultsDeletedHint")}</p>
                </div>
              </div>
            )}
            {impact && hasEngagement && (
              <div className="flex items-center gap-3 rounded-lg bg-surface-soft px-3.5 py-3">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary">
                  <Heart size={16} aria-hidden />
                </span>
                <p className="text-body font-semibold text-text">{t("deletePrompt.engagement", { likes: impact.likeCount, comments: impact.commentCount })}</p>
              </div>
            )}
          </div>
        )}

        {resultCount > 0 && kept && <p className="text-small text-text-muted">{t("deletePrompt.note")}</p>}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2.5 pt-1">
          <Button type="button" variant="ghost" size="lg" className="h-12 flex-1 rounded-full bg-surface-soft hover:bg-border-soft" onClick={onClose} disabled={deleting}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="danger" size="lg" className="h-12 flex-1 rounded-full" onClick={onConfirm} disabled={deleting || impact === undefined} data-delete-prompt-confirm="">
            {deleting && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {deleting ? t("common.deleting") : t("deletePrompt.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
