"use client";

import Link from "next/link";
import { Reply, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TextArt, TextArtTitle } from "@/features/content/text-art";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { AnnouncedChip } from "@/features/communities/announced-chip";
import { StorageImage } from "@/components/ui/storage-media";
import { clampedAspectRatio } from "@/lib/placeholder-image";
import { contentActionClassName } from "@/features/content/action-styles";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { LikeButton } from "@/features/prompts/like-button";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
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
 * RequestCard — a community prompt request on the visual card (`ContentCardPost`, docs/history/266-*): the Açık/Kapandı status
 * stays on the picture, art = the reference picture or, without one, the brief itself (and the creative direction), title and
 * kicker on hover, the same real like button and `PostMenu`. "Yanıtla" lives on the detail page. The row: Beğeni · Yorum · Yanıt
 * (real response count, the existing link) — a request has no Kaydet (not savable anywhere) and no "Kopyala".
 */
export function RequestCard({ request, onDeleted }: { request: PromptRequest; onDeleted?: () => void }) {
  const { t, language } = useTranslation();
  const href = requestHref(request);
  const typeMeta = request.contentType ? CONTENT_TYPE_META[request.contentType] : null;
  const picture = request.referenceImage ?? request.media[0];

  return (
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={request.author}
        meta={postMeta(request.author.username, request.createdAt, language)}
        typeIcon={Sparkles}
        titleInArt={!picture}
        status={
          <Badge variant={STATUS_VARIANTS[request.status]}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {t(STATUS_LABELS[request.status])}
          </Badge>
        }
        badges={
          <>
            <ContentTypePill icon={Sparkles} label={t("request.title")} detail={typeMeta ? t(typeMeta.labelKey) : null} />
            <AnnouncedChip kind="request" id={request.id} />
          </>
        }
        menu={<PostMenu requestId={request.id} communityId={request.communityId} authorId={request.author.id} onDeleted={onDeleted} />}
        art={
          picture ? (
            <figure className="relative w-full overflow-hidden bg-surface-soft" style={{ aspectRatio: clampedAspectRatio(picture.width, picture.height) }}>
              <StorageImage src={picture.url} alt={picture.alt} fill sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="object-cover" />
            </figure>
          ) : (
            <TextArt seed={request.id} className="gap-2">
              <TextArtTitle>{request.title}</TextArtTitle>
              <p className="min-h-0 flex-1 overflow-hidden whitespace-pre-line break-words text-small leading-relaxed [mask-image:linear-gradient(#000_65%,transparent_100%)]">{request.description}</p>
              {request.creativeDirection && (
                <p className="line-clamp-1 shrink-0 text-caption opacity-75">
                  <span className="font-semibold">{t("request.creativeDirection")} · </span>
                  {request.creativeDirection}
                </p>
              )}
            </TextArt>
          )
        }
        title={<ContentCardTitle href={href} title={request.title} />}
        footer={
          <>
            <LikeButton id={request.id} likeCount={request.likeCount} contentType="request" />
            <CommentCountLink requestId={request.id} baseCount={request.commentCount} />
            <Link href={href} className={contentActionClassName(false)} title={t("request.replies")} aria-label={`${t("request.replies")} (${formatCount(request.responseCount)})`}>
              <Reply size={16} strokeWidth={1.75} />
              <span aria-hidden>{formatCount(request.responseCount)}</span>
            </Link>
          </>
        }
      />
    </ContentCard>
  );
}
