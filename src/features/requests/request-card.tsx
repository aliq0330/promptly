"use client";

import { ToolChips } from "@/features/content/tool-chips";
import Link from "next/link";
import { Reply, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { contentActionClassName } from "@/features/content/action-styles";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { LikeButton } from "@/features/prompts/like-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { PostMenu } from "@/features/prompts/post-menu";
import { postMeta } from "@/features/prompts/post-header";
import { formatCount, requestHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptRequest } from "@/types";

// A request is only ever shown as "Açık"/"Open" (accepting responses) or
// "Kapandı"/"Closed" (not accepting new ones) — "answered" (closed via a
// selected response) and "closed" (closed manually) are both "Kapandı" from
// the visitor's point of view; the distinction only matters server-side,
// for deciding what a later cleared selection reverts to (see
// select_prompt_request_response, supabase/migrations).
export const STATUS_LABELS: Record<PromptRequest["status"], TranslationKey> = {
  open: "request.statusOpen",
  answered: "request.statusClosed",
  closed: "request.statusClosed",
};

export const STATUS_VARIANTS: Record<PromptRequest["status"], "success" | "danger"> = {
  open: "success",
  answered: "danger",
  closed: "danger",
};

/**
 * RequestCard — a community prompt request on the shared ContentCard shell and
 * Meydan post layout (`ContentCardPost`): same identity line (type pill +
 * Açık/Kapandı status), title/description as the other cards, and
 * — since the "Prompt İsteği Etkileşim ve Menü Sistemi Eşitleme" görevi —
 * the same real like button and the same `PostMenu` three-dot menu
 * (Bağlantıyı kopyala/Düzenle/Sil) every other card has.
 *
 * The action row: Beğeni · Yorum · Yanıt (real response count, existing
 * link/behavior) on the left, İstatistik · Paylaş on the right — a request
 * has no Kaydet (not savable anywhere). No "Kopyala" (removed — Prompt İsteği-specific, the
 * general Prompt system's own copy button is untouched), and no "Yanıtla"
 * CTA crammed in here either — that stays a detail-page-only action; the
 * "Yanıt" count here is the entry point into the request (same href it
 * already had).
 */
export function RequestCard({ request, onDeleted }: { request: PromptRequest; onDeleted?: () => void }) {
  const { t, language } = useTranslation();
  const href = requestHref(request);
  const typeMeta = request.contentType ? CONTENT_TYPE_META[request.contentType] : null;

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={request.author}
        meta={postMeta(request.author.username, request.createdAt, language)}
        badges={
          <>
            <ContentTypePill icon={Sparkles} label={typeMeta ? `${t("request.title")} · ${t(typeMeta.labelKey)}` : t("request.title")} />
            <Badge variant={STATUS_VARIANTS[request.status]}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              {t(STATUS_LABELS[request.status])}
            </Badge>
          </>
        }
        menu={<PostMenu requestId={request.id} communityId={request.communityId} authorId={request.author.id} onDeleted={onDeleted} />}
        footer={
          <>
            <LikeButton id={request.id} likeCount={request.likeCount} contentType="request" />
            <CommentCountLink requestId={request.id} baseCount={request.commentCount} />
            <Link href={href} className={contentActionClassName(false)} title={t("request.replies")} aria-label={`${t("request.replies")} (${formatCount(request.responseCount)})`}>
              <Reply size={16} strokeWidth={1.75} />
              <span aria-hidden>{formatCount(request.responseCount)}</span>
            </Link>
            <span className="ml-auto" />
            <StatisticsButton target={{ contentType: "request", contentId: request.id, likeCount: request.likeCount, commentCount: request.commentCount }} />
            <ShareTriggerButton target={{ contentType: "request", request }} />
          </>
        }
      >
        <ContentCardTitle href={href} title={request.title} description={request.description} />

        {request.creativeDirection && (
          <p className="rounded-xl bg-surface-soft px-3 py-2.5 text-caption text-text-secondary">
            <span className="font-semibold text-text">{t("request.creativeDirection")} · </span>
            <span className="line-clamp-2 inline">{request.creativeDirection}</span>
          </p>
        )}

        <ToolChips refs={request.tools} />
        {request.tools.length === 0 && !typeMeta && request.preferredTool && (
          <span className="inline-flex h-6 w-fit items-center rounded-full bg-surface-soft px-2.5 text-caption font-medium text-text-muted">{request.preferredTool}</span>
        )}
        <ContentTags tags={request.tags} />
      </ContentCardPost>
    </ContentCard>
  );
}
