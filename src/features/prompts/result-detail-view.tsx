"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, FileText, Lock, SquareTerminal } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { StorageImage, StorageVideo } from "@/components/ui/storage-media";
import {
  AsideSection,
  BAND_PRIMARY_CLASS,
  DetailActionBar,
  DetailArt,
  DetailArtPlaceholder,
  DetailAside,
  DetailBand,
  DetailByline,
  DetailComments,
  DetailSection,
  DetailShell,
  DetailTitle,
  Eyebrow,
} from "@/features/content/detail-parts";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { CommentSection } from "@/features/prompts/comment-section";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { DiffText } from "@/features/prompts/diff-text";
import { EditResultModal } from "@/features/prompts/edit-result-modal";
import { LikeButton } from "@/features/prompts/like-button";
import { PostMenu } from "@/features/prompts/post-menu";
import { ResultTypePreview } from "@/features/prompts/result-type-preview";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { RESULT_MEDIA_TYPE_LABELS } from "@/lib/prompt-result-media";
import { fetchResultById } from "@/lib/supabase/prompt-results";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { promptHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptResult } from "@/types";

/**
 * The big, content-first "Kullanıcı Sonucu" detail view (`/results/local?
 * id=…` — CLAUDE.md §7/§9/§11/§12/§13). Fetches the FULL result shape (real
 * media url, modification text, original-prompt snapshot) exactly once,
 * here — the grid/card never loads any of this up front (§16/§17).
 */
export function ResultDetailView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [result, setResult] = useState<PromptResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isModificationOpen, setIsModificationOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no id to look up
      setLoaded(true);
      return;
    }
    setLoaded(false);
    fetchResultById(id).then((found) => {
      if (cancelled) return;
      setResult(found);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || !loaded) {
    return !id ? <NotFoundBlock title={t("result.notFoundTitle")} description={t("common.brokenLinkHint")} /> : <DetailSkeleton />;
  }

  if (!result) {
    return <NotFoundBlock title={t("result.notFoundTitle")} description={t("result.notFoundGone")} />;
  }

  // After deleting your own result there's nothing left on this page to
  // show — head back to the real origin (the prompt) instead of
  // leaving the viewer stranded on a now-empty page.
  function handleDeleted() {
    router.push(result!.originalPrompt ? promptHref(result!.originalPrompt) : "/prompts");
  }

  // Refetches rather than fabricating an updated object client-side —
  // same reasoning `PromptResultsSection.handleAdded` already uses: the
  // real, stored row is the only source of truth.
  function handleUpdated() {
    setIsEditOpen(false);
    fetchResultById(id!).then((found) => setResult(found));
  }

  // The prompt was deleted: the result stays, visible only to its creator, closed to likes and comments (docs/history/283-*).
  const isOrphan = !result.promptId;
  const ratio = result.width && result.height ? clampedAspectRatio(result.width, result.height) : 1;
  const picture = result.mediaType === "image" ? result.mediaUrl : result.thumbnailUrl;
  const art =
    result.mediaType === "image" && result.mediaUrl ? (
      <DetailArt ratio={ratio} caption={t(RESULT_MEDIA_TYPE_LABELS[result.mediaType])}>
        <StorageImage src={result.mediaUrl} alt="" fill sizes="(min-width: 1024px) 460px, 100vw" className="object-cover" />
      </DetailArt>
    ) : result.mediaType === "video" && result.mediaUrl ? (
      <DetailArt ratio={16 / 9} caption={t(RESULT_MEDIA_TYPE_LABELS[result.mediaType])}>
        <StorageVideo controls playsInline preload="metadata" poster={result.thumbnailUrl ?? undefined} src={result.mediaUrl} className="h-full w-full bg-black object-contain" />
      </DetailArt>
    ) : result.mediaType === "audio" && result.mediaUrl ? (
      <div className="w-[260px] max-w-full lg:w-[300px]">
        <ResultTypePreview result={result} size="detail" />
      </div>
    ) : (
      <DetailArtPlaceholder icon={FileText} />
    );

  return (
    // Albüm (docs/history/203-*, the detail pages' language): band tinted by the result itself · actions row · [text,
    // modification, comments | the prompt it was made with].
    <DetailShell
      band={
        <DetailBand
          data-result-band=""
          backdrop={picture ? <StorageImage src={picture} alt="" fill sizes="100vw" className="object-cover" /> : undefined}
          art={art}
          kicker={
            <Eyebrow tone="primary">
              {t("result.kicker")} · {t(RESULT_MEDIA_TYPE_LABELS[result.mediaType])}
              {result.tool && <> · {result.tool}</>}
            </Eyebrow>
          }
          title={<DetailTitle>{result.originalPrompt?.title ?? t("result.cardAriaLabel", { name: result.creator.displayName })}</DetailTitle>}
          byline={<DetailByline person={result.creator} createdAt={result.createdAt} language={language} />}
          menu={<PostMenu resultId={result.id} authorId={result.creator.id} onDeleted={handleDeleted} onEdit={() => setIsEditOpen(true)} />}
        />
      }
      actions={
        <DetailActionBar
          primary={
            result.originalPrompt ? (
              <Link href={promptHref(result.originalPrompt)} className={buttonClassName({ size: "lg", className: BAND_PRIMARY_CLASS })}>
                <SquareTerminal size={18} aria-hidden />
                {t("result.openPrompt")}
              </Link>
            ) : undefined
          }
          end={isOrphan ? undefined : <ShareTriggerButton target={{ contentType: "prompt_result", result }} />}
        >
          {!isOrphan && (
            <>
              <LikeButton id={result.id} likeCount={result.likeCount} contentType="prompt_result" size={20} />
              <CommentCountLink resultId={result.id} baseCount={result.commentCount} size={20} />
            </>
          )}
        </DetailActionBar>
      }
      aside={
        result.originalPrompt ? (
          <DetailAside>
            <AsideSection id="result-origin-title" title={t("result.madeWithWhichPrompt")}>
              <Link href={promptHref(result.originalPrompt)} className="group block space-y-1 p-3.5 transition-colors hover:bg-surface-soft" data-result-origin>
                <span className="flex items-center gap-1.5 text-label font-semibold text-text group-hover:text-primary">
                  <SquareTerminal size={14} className="shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{result.originalPrompt.title}</span>
                </span>
                {result.originalPrompt.description && <span className="line-clamp-2 block text-caption text-text-muted">{result.originalPrompt.description}</span>}
                <span className="block text-caption font-medium text-primary">{t("result.viewPrompt")}</span>
              </Link>
            </AsideSection>
          </DetailAside>
        ) : undefined
      }
    >
      <div className="space-y-10">
        {isOrphan && (
          <p className="flex items-start gap-2.5 rounded-[22px] bg-surface-soft px-4 py-3 text-small text-text-secondary" data-result-orphan="">
            <Lock size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            {t("result.orphanNotice")}
          </p>
        )}
        {(result.mediaType === "text" || result.mediaType === "other") && result.textContent && (
          <DetailSection title={t(RESULT_MEDIA_TYPE_LABELS[result.mediaType])}>
            <ResultTypePreview result={result} size="detail" />
          </DetailSection>
        )}

        {result.hasModification && result.originalPrompt && (
          <section className="rounded-[22px] border border-border-soft bg-surface">
            <button
              type="button"
              onClick={() => setIsModificationOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
              <span className="text-label font-medium text-text">
                {t("result.modifiedBadge")}{result.modificationSummary ? ` — ${result.modificationSummary}` : ""}
              </span>
              {isModificationOpen ? (
                <ChevronUp size={16} className="shrink-0 text-text-muted" />
              ) : (
                <ChevronDown size={16} className="shrink-0 text-text-muted" />
              )}
            </button>
            {isModificationOpen && (
              <div className="space-y-3 border-t border-border-soft px-4 py-3">
                {result.modifiedPromptText ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">{t("result.original")}</p>
                      <div className="max-h-40 overflow-y-auto rounded-md border border-border-soft bg-surface-soft p-2.5">
                        <DiffText before={result.originalPrompt.promptText} after={result.modifiedPromptText} />
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">{t("result.userModification")}</p>
                      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border-soft bg-surface-soft p-2.5 font-mono text-xs text-text">
                        {result.modifiedPromptText}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-caption text-text-muted">{result.modificationSummary || t("result.modifiedNoDetail")}</p>
                )}
              </div>
            )}
          </section>
        )}

        {!isOrphan && (
          <DetailComments>
            <CommentSection target={{ resultId: result.id }} headless />
          </DetailComments>
        )}
      </div>

      {isEditOpen && <EditResultModal result={result} onClose={() => setIsEditOpen(false)} onUpdated={handleUpdated} />}
    </DetailShell>
  );
}
