"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Link2 } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { CARD_PRIMARY_CLASS, ContentCard, ContentCardPost, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypePill } from "@/features/content/content-type-label";
import { useAuth } from "@/features/auth/auth-provider";
import { AnnouncedChip } from "@/features/communities/announced-chip";
import { CommentCountLink } from "@/features/prompts/comment-count-link";
import { LikeButton } from "@/features/prompts/like-button";
import { postMeta } from "@/features/prompts/post-header";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { StatisticsButton } from "@/features/statistics/statistics-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KIND_LABEL, spaceHref } from "@/lib/spaces";
import { setSpaceShared, spaceFromSummary, summaryArt, summaryCover, type SpaceFeedCard } from "@/lib/supabase/spaces";
import { absoluteUrl } from "@/lib/utils";
import { SpaceMenu } from "./space-menu";
import { PaletteStrip, SpaceCoverArt, SpacesIcon } from "./space-visuals";

/**
 * Akışta paylaşılmış bir Space'in kartı (docs/history/215-*): diğer gönderilerle AYNI Albüm kabuğu (`ContentCardPost`) — bant kapak
 * kolajından renk alır, sanat dört görselli kolaj, altında ilk paletin çizgisi; tek büyük eylem "Panoyu gez"; Beğeni · Yorum · İstatistik
 * solda, Paylaş sağda (Space kaydedilmez — koleksiyon hedefi değil). ⋮: bağlantıyı kopyala, sahibe "Akıştan kaldır".
 */
export function SpaceFeedCardView({ space }: { space: SpaceFeedCard }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const href = spaceHref(space.id);
  const cover = summaryCover(space);
  const art = summaryArt(space);
  if (hidden) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl(href));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Panoya yazılamadı: kart değişmez.
    }
  }

  async function unshare() {
    try {
      await setSpaceShared(space.id, false);
      setHidden(true);
    } catch {
      // Sunucu reddetti (yetki yok): kart yerinde kalır.
    }
  }

  return (
    <ContentCard href={href}>
      <ContentCardPost
        author={space.owner}
        meta={space.owner ? postMeta(space.owner.username, space.sharedAt ?? space.createdAt, language) : ""}
        badges={
          <>
            <ContentTypePill icon={SpacesIcon} label="Space" detail={t(SPACE_KIND_LABEL[space.kind])} />
            <AnnouncedChip kind="space" id={space.id} />
          </>
        }
        menu={
          <SpaceMenu
            label={t("spaces.card.menu", { title: space.title })}
            items={[
              { key: "copy", label: copied ? t("common.copied") : t("common.copyLink"), icon: Link2, onSelect: () => void copyLink() },
              { key: "unshare", label: t("spaces.feed.unshare"), icon: EyeOff, onSelect: () => void unshare(), hidden: !user || user.id !== space.ownerId },
            ]}
          />
        }
        art={
          <span data-card-media className="block">
            <SpaceCoverArt urls={art} className="aspect-[16/9] w-full overflow-hidden rounded-lg shadow-pop" iconSize={40} />
          </span>
        }
        backdrop={cover ? <StorageImg src={cover} alt="" className="h-full w-full object-cover" /> : undefined}
        title={<ContentCardTitle href={href} title={space.title} />}
        primary={
          <Link href={`${href}&tab=board`} className={CARD_PRIMARY_CLASS}>
            <Eye size={14} aria-hidden />
            {t("spaces.page.viewBoard")}
          </Link>
        }
        footer={
          <>
            <LikeButton id={space.id} likeCount={space.likeCount} contentType="space" />
            <CommentCountLink spaceId={space.id} baseCount={space.commentCount} />
            <StatisticsButton target={{ contentType: "space", contentId: space.id, likeCount: space.likeCount, commentCount: space.commentCount }} />
            <span className="ml-auto" />
            <ShareTriggerButton target={{ contentType: "space", space: spaceFromSummary(space), art }} />
          </>
        }
      >
        {space.palette.length > 0 && <PaletteStrip colors={space.palette} className="h-1.5" />}
      </ContentCardPost>
    </ContentCard>
  );
}
