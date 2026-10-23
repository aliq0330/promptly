"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { CommentSection, type CommentTarget } from "@/features/prompts/comment-section";
import { LikeButton } from "@/features/prompts/like-button";
import { SaveButton } from "@/features/prompts/save-button";
import { ShareTriggerButton, type ShareModalTarget } from "@/features/prompts/share-modal";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import type { StatisticsTarget } from "@/features/statistics/statistics-modal";
import { PostCommentLink, PostLike, PostSave, PostShareButton, PostStatisticsButton } from "@/features/communities/post-engagement";
import { usePostScope } from "@/features/communities/post-scope";
import { QuoteCommentLink, QuoteLike, QuoteShareButton, QuoteStatisticsButton } from "@/features/quotes/quote-engagement";
import { useQuoteScope } from "@/features/quotes/quote-scope";
import type { LikeableContentType } from "@/lib/supabase/likes";

/*
 * Detay sayfalarının (Prompt, İstek, Workflow, Hazır Ayar) etkileşim satırı ve yorumları TEK yerden çizilir. Sayfa normal içerik olarak açıldıysa
 * içeriğin kendi bileşenleri (`LikeButton`, `SaveButton`, …) çalışır; başvuru gönderisi (`PostScope`) ya da alıntı (`QuoteScope`) olarak açıldıysa aynı yerlerde GÖNDERİNİN/ALINTININ
 * bileşenleri çizilir (`post-engagement.tsx`). İki yol aynı düğme görünümünü ve aynı altyapıyı kullanır — "birebir aynı" garantisi budur (docs/history/184-*).
 */

export function EngageLike({ id, likeCount, contentType, size = 18 }: { id: string; likeCount: number; contentType?: LikeableContentType; size?: number }) {
  const scope = usePostScope();
  const quoteScope = useQuoteScope();
  if (quoteScope) return <QuoteLike quote={quoteScope.quote} size={size} />;
  if (scope) return <PostLike post={scope.post} mode={scope.mode} onToast={scope.onToast} size={size} />;
  return <LikeButton id={id} likeCount={likeCount} contentType={contentType} size={size} />;
}

export function EngageCommentCount({
  promptId,
  requestId,
  workflowId,
  presetId,
  baseCount,
  size = 18,
}: {
  promptId?: string;
  requestId?: string;
  workflowId?: string;
  presetId?: string;
  baseCount: number;
  size?: number;
}) {
  const scope = usePostScope();
  const quoteScope = useQuoteScope();
  if (quoteScope) return <QuoteCommentLink quote={quoteScope.quote} size={size} />;
  if (scope) return <PostCommentLink post={scope.post} size={size} />;
  return <CommentCountLink promptId={promptId} requestId={requestId} workflowId={workflowId} presetId={presetId} baseCount={baseCount} size={size} />;
}

export function EngageSave({
  promptId,
  workflowId,
  presetId,
  saveCount,
  size = 18,
}: {
  promptId?: string;
  workflowId?: string;
  presetId?: string;
  saveCount: number;
  size?: number;
}) {
  const scope = usePostScope();
  const quoteScope = useQuoteScope();
  // Alıntı kaydedilmez (docs/history/217-*): Kaydet düğmesi hiç çizilmez.
  if (quoteScope) return null;
  if (scope) return <PostSave post={scope.post} size={size} />;
  return <SaveButton promptId={promptId} workflowId={workflowId} presetId={presetId} saveCount={saveCount} size={size} />;
}

export function EngageStatistics({ target, label, size = 18 }: { target: StatisticsTarget; label?: string; size?: number }) {
  const scope = usePostScope();
  const quoteScope = useQuoteScope();
  if (quoteScope) return <QuoteStatisticsButton quote={quoteScope.quote} size={size} label={label} />;
  if (scope) return <PostStatisticsButton post={scope.post} size={size} label={label} />;
  return <StatisticsButton target={target} size={size} label={label} />;
}

export function EngageShare({ target, label }: { target: ShareModalTarget; label?: string }) {
  const scope = usePostScope();
  const quoteScope = useQuoteScope();
  if (quoteScope) return <QuoteShareButton quote={quoteScope.quote} label={label} />;
  if (scope) return <PostShareButton post={scope.post} label={label} />;
  return <ShareTriggerButton target={target} label={label} />;
}

/** Yorum bölümü: başvuru sayfasında yorumlar GÖNDERİNİN kendisine aittir (üye değilse yazma kapalı + nedeni). */
export function EngageComments({ target, highlightCommentId, headless }: { target: CommentTarget; highlightCommentId?: string | null; headless?: boolean }) {
  const { t } = useTranslation();
  const scope = usePostScope();
  const quoteScope = useQuoteScope();
  if (quoteScope) return <CommentSection target={{ quoteId: quoteScope.quote.id }} highlightCommentId={highlightCommentId ?? null} headless={headless} />;
  if (scope) {
    const disabledReason = scope.mode === "open" ? undefined : scope.mode === "join" ? t("communities.post.engage.joinToComment") : t("communities.post.engage.closed");
    return <CommentSection target={{ communityPostId: scope.post.id }} disabledReason={disabledReason} highlightCommentId={highlightCommentId ?? null} headless={headless} />;
  }
  return <CommentSection target={target} highlightCommentId={highlightCommentId ?? null} headless={headless} />;
}
