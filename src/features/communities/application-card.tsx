"use client";

import { EyeOff, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { PaletteStrip, SpaceCoverArt } from "@/features/spaces/space-visuals";
import { OutputPosterPreview, OutputThumbnailStrip } from "@/features/prompts/multi-image-output-options";
import { PlayableCardArt } from "@/features/prompts/playable-card-art";
import { PostCommentLink, PostLike, PostSave, type EngageMode } from "./post-engagement";
import { summarizeContent } from "./content-summary";
import { SummaryTextArt } from "@/features/content/text-art";
import { useTranslation } from "@/lib/i18n/language-provider";
import { postPageHref } from "@/lib/communities";
import { formatRelativeTime } from "@/lib/utils";
import type { CommunityPost } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";
import { CARD_SAVE_CLASS } from "@/features/content/action-styles";

const SHARED_LABEL: Record<CommunityPost["contentType"], TranslationKey> = {
  prompt: "communities.feed.shared.prompt",
  request: "communities.feed.shared.request",
  workflow: "communities.feed.shared.workflow",
  preset: "communities.feed.shared.preset",
  space: "communities.feed.shared.space",
};

/**
 * Başvuru (ve türü bilinmeyen eski) gönderinin akıştaki kartı: normal içerik kartıyla AYNI aile (aynı kabuk ve görsel kart
 * `ContentCardPost`, docs/history/266-*: çıktı önizlemesi, tür simgesi köşede, başlık üzerine gelince, altta paylaşan ve sayaçlar) — farkı kimlik satırının başvuranı göstermesi + not ve altbilgideki sayaçların GÖNDERİNİN kendisine ait olmasıdır. Karta tıklamak başvurunun
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
    <ContentCard variant="visual" href={href}>
      <ContentCardPost
        author={post.author}
        meta={`${t(SHARED_LABEL[post.contentType])} · ${formatRelativeTime(post.createdAt, language)}`}
        typeIcon={summary?.typeIcon}
        titleInArt={Boolean(summary && summary.type !== "space" && summary.media.length === 0 && !summary.promptText)}
        status={
          <>
            {post.kind !== "legacy" && <Badge variant="default">{t("communities.post.badge.application")}</Badge>}
            {post.pinnedAt && (
              <Badge variant="default">
                <Pin size={11} aria-hidden /> {t("communities.announcements.pinned")}
              </Badge>
            )}
          </>
        }
        badges={summary && <ContentTypePill icon={summary.typeIcon} label={t(summary.typeLabelKey)} detail={summary.tools.length > 0 ? null : summary.detail} />}
        menu={menu}
        art={
          summary ? (
            summary.type === "space" ? (
              <SpaceCoverArt urls={summary.spaceArt ?? []} className="aspect-[4/3] w-full overflow-hidden" iconSize={40} />
            ) : summary.playable && poster ? (
              post.content?.type === "prompt" ? <PlayableCardArt prompt={post.content.data} poster={poster} /> : <OutputPosterPreview media={poster} />
            ) : summary.media.length > 0 ? (
              <OutputThumbnailStrip media={summary.media} />
            ) : (
              <SummaryTextArt summary={summary} seed={post.id} />
            )
          ) : (
            <p className="flex aspect-[4/3] w-full items-center justify-center gap-2 bg-surface-soft px-3 text-small text-text-muted">
              <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
            </p>
          )
        }
        title={summary ? <ContentCardTitle href={href} title={summary.title} /> : null}
        footer={
          // `contents`: the buttons stay direct items of the shared action row; the wrapper only marks them as the POST's own counters.
          <div className="contents" data-post-engagement={post.id}>
            <PostLike post={post} mode={mode} onToast={onToast} />
            <PostCommentLink post={post} />
            <PostSave post={post} className={CARD_SAVE_CLASS} />
          </div>
        }
      >
        {summary?.palette && summary.palette.length > 0 && <PaletteStrip colors={summary.palette} className="h-1.5" />}
        {post.note && <p data-post-note className="whitespace-pre-wrap break-words rounded-lg bg-surface/80 px-3 py-2.5 text-small text-text-secondary">{post.note}</p>}
      </ContentCardPost>
    </ContentCard>
  );
}
