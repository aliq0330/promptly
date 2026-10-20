"use client";

import Link from "next/link";
import { PenLine, Reply, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CARD_PRIMARY_CLASS, ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { StorageImage } from "@/components/ui/storage-media";
import { useAuth } from "@/features/auth/auth-provider";
import { clampedAspectRatio } from "@/lib/placeholder-image";
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
 * RequestCard — a community prompt request on the Albüm card (`ContentCardPost`, docs/history/202-*): kicker (type +
 * Açık/Kapandı status), art = the reference picture or, without one, the brief itself (and the creative direction),
 * title and author like the other cards, the same real like button and `PostMenu`.
 *
 * The big action is "Yanıtla" — only while the request is open and for someone other than its author (the author
 * manages it on the detail page). The row: Beğeni · Yorum · Yanıt (real response count, the existing link) · İstatistik ·
 * Paylaş — a request has no Kaydet (not savable anywhere) and no "Kopyala".
 */
export function RequestCard({ request, onDeleted }: { request: PromptRequest; onDeleted?: () => void }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const href = requestHref(request);
  const typeMeta = request.contentType ? CONTENT_TYPE_META[request.contentType] : null;
  const picture = request.referenceImage ?? request.media[0];
  const canReply = request.status === "open" && user?.id !== request.author.id;

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={request.author}
        meta={postMeta(request.author.username, request.createdAt, language)}
        badges={
          <>
            <ContentTypePill icon={Sparkles} label={t("request.title")} detail={typeMeta ? t(typeMeta.labelKey) : null} />
            <Badge variant={STATUS_VARIANTS[request.status]}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              {t(STATUS_LABELS[request.status])}
            </Badge>
          </>
        }
        menu={<PostMenu requestId={request.id} communityId={request.communityId} authorId={request.author.id} onDeleted={onDeleted} />}
        art={
          picture ? (
            <figure data-card-media className="relative w-full overflow-hidden rounded-lg bg-surface-soft shadow-pop" style={{ aspectRatio: Math.max(1, clampedAspectRatio(picture.width, picture.height)) }}>
              <StorageImage src={picture.url} alt={picture.alt} fill sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
            </figure>
          ) : (
            <div className="space-y-2 rounded-lg bg-surface px-4 py-3.5 shadow-pop">
              <p className="line-clamp-4 whitespace-pre-line break-words text-small leading-relaxed text-text">{request.description}</p>
              {request.creativeDirection && (
                <p className="line-clamp-2 text-caption text-text-secondary">
                  <span className="font-semibold text-text">{t("request.creativeDirection")} · </span>
                  {request.creativeDirection}
                </p>
              )}
            </div>
          )
        }
        backdrop={picture ? <StorageImage src={picture.url} alt="" fill sizes="240px" className="object-cover" /> : undefined}
        title={<ContentCardTitle href={href} title={request.title} />}
        primary={
          canReply ? (
            <Link href={`/create?answerRequest=${request.id}`} className={CARD_PRIMARY_CLASS}>
              <PenLine size={14} aria-hidden />
              {t("request.reply")}
            </Link>
          ) : undefined
        }
        footer={
          <>
            <LikeButton id={request.id} likeCount={request.likeCount} contentType="request" />
            <CommentCountLink requestId={request.id} baseCount={request.commentCount} />
            <Link href={href} className={contentActionClassName(false)} title={t("request.replies")} aria-label={`${t("request.replies")} (${formatCount(request.responseCount)})`}>
              <Reply size={16} strokeWidth={1.75} />
              <span aria-hidden>{formatCount(request.responseCount)}</span>
            </Link>
            <StatisticsButton target={{ contentType: "request", contentId: request.id, likeCount: request.likeCount, commentCount: request.commentCount }} />
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "request", request }} />
          </>
        }
      />
    </ContentCard>
  );
}
