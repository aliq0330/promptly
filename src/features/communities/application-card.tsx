"use client";

import Link from "next/link";
import { EyeOff, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { ToolChips } from "@/features/content/tool-chips";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PostCommentLink, PostLike, PostSave, PostShareButton, PostStatisticsButton, type EngageMode } from "./post-engagement";
import { summarizeContent } from "./content-summary";
import { useTranslation } from "@/lib/i18n/language-provider";
import { postPageHref } from "@/lib/communities";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import type { CommunityPost } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";

const SHARED_LABEL: Record<CommunityPost["contentType"], TranslationKey> = {
  prompt: "communities.feed.shared.prompt",
  request: "communities.feed.shared.request",
  workflow: "communities.feed.shared.workflow",
  preset: "communities.feed.shared.preset",
};

/**
 * Başvuru (ve türü bilinmeyen eski) gönderinin akıştaki kartı: normal içerik kartıyla AYNI aile (aynı kabuk, tür satırı, başlık, çıktı önizlemesi,
 * etiketler, altbilgi) — farkı üstteki başvuran satırı + not ve altbilgideki sayaçların GÖNDERİNİN kendisine ait olmasıdır. Karta tıklamak başvurunun
 * kendi sayfasını açar (`/communities/post/local?id=`); orijinal içeriğe oradan gidilir. `menu` topluluk menüsü (sabitle/düzenle/kaldır/bildir).
 */
export function ApplicationCard({
  post,
  mode,
  onToast,
  menu,
}: {
  post: CommunityPost;
  mode: EngageMode;
  onToast: (message: string) => void;
  /** Sağ üstteki topluluk menüsü (`DropdownMenu`). */
  menu?: React.ReactNode;
}) {
  const { t, language } = useTranslation();
  const href = postPageHref(post.id);
  const summary = post.content ? summarizeContent(post.content) : null;
  const poster = summary?.playable ? summary.media[0] : undefined;

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <div className="relative z-20 flex items-start gap-2.5 focus-within:z-30">
          {post.author && <Avatar src={post.author.avatarUrl} alt={post.author.displayName} size={32} />}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-text">
              {post.author ? (
                <Link href={profileHref(post.author)} className="font-semibold hover:underline">
                  {post.author.displayName}
                </Link>
              ) : (
                <span className="font-semibold">{t("common.genericUser")}</span>
              )}
              <span className="text-text-muted">{t(SHARED_LABEL[post.contentType])}</span>
              {post.kind !== "legacy" && <Badge variant="default">{t("communities.post.badge.application")}</Badge>}
              {post.pinnedAt && (
                <Badge variant="default">
                  <Pin size={11} aria-hidden /> {t("communities.announcements.pinned")}
                </Badge>
              )}
            </p>
            <p className="text-caption text-text-muted">{formatRelativeTime(post.createdAt, language)}</p>
          </div>
          {menu}
        </div>

        {post.note && <p data-post-note className="whitespace-pre-wrap break-words text-small text-text-secondary">{post.note}</p>}

        {summary ? (
          <>
            <div className="space-y-2">
              <ContentTypeLabel icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.detail} />
              <ContentCardTitle href={href} title={summary.title} description={summary.description} />
            </div>
            {summary.playable && poster ? <OutputPosterPreview media={poster} /> : summary.media.length > 0 ? <OutputThumbnailStrip media={summary.media} /> : null}
            <ToolChips refs={summary.tools} />
            <ContentTags tags={summary.tags} />
          </>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
            <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
          </p>
        )}
      </ContentCardBody>

      <div className="relative z-10 flex items-center gap-0.5 border-t border-border-soft px-2 py-1.5" data-post-engagement={post.id}>
        <PostLike post={post} mode={mode} onToast={onToast} />
        <PostCommentLink post={post} />
        <PostSave post={post} />
        <PostStatisticsButton post={post} />
        <span className="ml-auto" />
        <PostShareButton post={post} />
      </div>
    </ContentCard>
  );
}
