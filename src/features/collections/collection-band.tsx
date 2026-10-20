"use client";

import Link from "next/link";
import { Bookmark, FolderOpen } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StorageImage, StorageImg } from "@/components/ui/storage-media";
import { DetailBand, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import type { CollectionEntry } from "@/lib/supabase/collections";
import type { CommunityPostContent } from "@/lib/supabase/communities";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection, PromptMedia } from "@/types";

/** The picture an entry shows on its card, if it is a still image (a video/audio output's file is not one). */
function contentImage(content: CommunityPostContent | null): PromptMedia | null {
  if (!content) return null;
  if (content.type === "prompt") return content.data.contentType === "image" ? (content.data.media[0] ?? null) : null;
  if (content.type === "request") return content.data.media[0] ?? null;
  if (content.type === "workflow") return content.data.media[0] ?? null;
  return content.data.coverUrl ? { id: `${content.data.id}-cover`, url: content.data.coverUrl, width: 4, height: 3, alt: "" } : null;
}

export function entryImage(entry: CollectionEntry): PromptMedia | null {
  if (entry.type === "community_post") return contentImage(entry.data.content);
  return contentImage({ type: entry.type, data: entry.data } as CommunityPostContent);
}

/**
 * The collection's album art (docs/history/203-*): the first four items' pictures as a 2×2 collage (one picture fills the
 * tile; two or three leave quiet empty quarters), else the calm icon tile. Square, 200px on phones and 248px from `lg`.
 */
export function CollectionArt({ collection, images }: { collection: Collection; images: PromptMedia[] }) {
  const tile = "relative h-[200px] w-[200px] overflow-hidden rounded-[22px] bg-surface shadow-pop lg:h-[248px] lg:w-[248px]";
  if (images.length === 0) {
    return (
      <span aria-hidden data-collection-art="0" className={cn(tile, "flex items-center justify-center text-primary")}>
        {collection.isDefault ? <Bookmark size={56} strokeWidth={1.4} /> : <FolderOpen size={56} strokeWidth={1.4} />}
      </span>
    );
  }
  if (images.length === 1) {
    return (
      <span aria-hidden data-collection-art="1" className={tile}>
        <StorageImage src={images[0].url} alt="" fill sizes="248px" className="object-cover" />
      </span>
    );
  }
  return (
    <span aria-hidden data-collection-art={String(images.length)} className={cn(tile, "grid grid-cols-2 grid-rows-2 gap-1 p-1")}>
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="relative overflow-hidden rounded-[6px] bg-surface-soft first:rounded-tl-[18px] [&:nth-child(2)]:rounded-tr-[18px] [&:nth-child(3)]:rounded-bl-[18px] last:rounded-br-[18px]">
          {images[index] && <StorageImg src={images[index].url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        </span>
      ))}
    </span>
  );
}

/** The collection's ALBÜM band: tinted by its first picture, the collage as art, "Koleksiyon · Herkese açık", the name, the owner line. */
export function CollectionBand({ collection, items }: { collection: Collection; items: CollectionEntry[] }) {
  const { t, language } = useTranslation();
  const images = items.map(entryImage).filter((media): media is PromptMedia => media !== null).slice(0, 4);
  const followers =
    collection.visibility === "public"
      ? collection.followerCount === 1
        ? t("collection.followerCountOne")
        : t("collection.followerCount", { count: collection.followerCount })
      : null;
  return (
    <DetailBand
      data-collection-band=""
      backdrop={images[0] ? <StorageImage src={images[0].url} alt="" fill sizes="100vw" className="object-cover" /> : undefined}
      art={<CollectionArt collection={collection} images={images} />}
      kicker={
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow tone="primary">
            {t("collection.kicker")} · {collection.visibility === "public" ? t("collection.visibilityPublicShort") : t("collection.visibilityPrivateShort")}
          </Eyebrow>
          {collection.isDefault && <Badge variant="default">{t("collection.defaultBadge")}</Badge>}
        </div>
      }
      title={<DetailTitle>{collection.name}</DetailTitle>}
      byline={
        <Link href={profileHref(collection.owner)} className="group inline-flex max-w-full items-center gap-2.5 rounded-md" data-collection-byline>
          <Avatar src={collection.owner.avatarUrl} alt={collection.owner.displayName} size={32} />
          <span className="min-w-0 text-label leading-tight">
            <span className="font-semibold text-text transition-colors group-hover:text-primary">{collection.owner.displayName}</span>{" "}
            <span className="text-text-secondary">
              · {t("collection.itemCount", { count: collection.itemCount })}
              {followers && <> · {followers}</>} · {t("collection.updatedAgo", { time: formatRelativeTime(collection.updatedAt, language) })}
            </span>
          </span>
        </Link>
      }
    />
  );
}
