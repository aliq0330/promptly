"use client";

import { EyeOff, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { StorageImage } from "@/components/ui/storage-media";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PostCommentLink, PostLike, PostSave, PostShareButton, PostStatisticsButton, type EngageMode } from "./post-engagement";
import { summarizeContent } from "./content-summary";
import { useTranslation } from "@/lib/i18n/language-provider";
import { postPageHref } from "@/lib/communities";
import { formatRelativeTime } from "@/lib/utils";
import type { CommunityPost } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";

const SHARED_LABEL: Record<CommunityPost["contentType"], TranslationKey> = {
  prompt: "communities.feed.shared.prompt",
  request: "communities.feed.shared.request",
  workflow: "communities.feed.shared.workflow",
  preset: "communities.feed.shared.preset",
};

/**
 * Başvuru (ve türü bilinmeyen eski) gönderinin akıştaki kartı: normal içerik kartıyla AYNI aile (aynı kabuk ve Albüm kartı
 * `ContentCardPost`, docs/history/202-*: bantta çıktı önizlemesi, tür, başlık, paylaşan; eylem satırı) — farkı kimlik satırının başvuranı göstermesi + not ve altbilgideki sayaçların GÖNDERİNİN kendisine ait olmasıdır. Karta tıklamak başvurunun
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

  const picture = summary ? (summary.playable ? poster : summary.media[0]) : undefined;

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={post.author}
        meta={`${t(SHARED_LABEL[post.contentType])} · ${formatRelativeTime(post.createdAt, language)}`}
        badges={
          <>
            {summary && <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />}
            {post.kind !== "legacy" && <Badge variant="default">{t("communities.post.badge.application")}</Badge>}
            {post.pinnedAt && (
              <Badge variant="default">
                <Pin size={11} aria-hidden /> {t("communities.announcements.pinned")}
              </Badge>
            )}
          </>
        }
        menu={menu}
        art={
          summary ? (
            summary.playable && poster ? (
              <OutputPosterPreview media={poster} />
            ) : summary.media.length > 0 ? (
              <OutputThumbnailStrip media={summary.media} />
            ) : undefined
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-small text-text-muted">
              <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
            </p>
          )
        }
        backdrop={picture ? <StorageImage src={picture.url} alt="" fill sizes="240px" className="object-cover" /> : undefined}
        title={summary ? <ContentCardTitle href={href} title={summary.title} /> : null}
        footer={
          // `contents`: the buttons stay direct items of the shared action row; the wrapper only marks them as the POST's own counters.
          <div className="contents" data-post-engagement={post.id}>
            <PostLike post={post} mode={mode} onToast={onToast} />
            <PostCommentLink post={post} />
            <PostSave post={post} />
            <PostStatisticsButton post={post} />
            <span className="ml-auto" />
            <PostShareButton post={post} />
          </div>
        }
      >
        {post.note && <p data-post-note className="whitespace-pre-wrap break-words rounded-lg bg-surface/80 px-3 py-2.5 text-small text-text-secondary">{post.note}</p>}
      </ContentCardPost>
    </ContentCard>
  );
}
