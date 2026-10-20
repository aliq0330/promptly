"use client";

import Link from "next/link";
import { Bookmark, FolderOpen } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StorageImage } from "@/components/ui/storage-media";
import { CollageArt, DetailBand, DetailTitle, Eyebrow } from "@/features/content/detail-parts";
import type { CollectionEntry } from "@/lib/supabase/collections";
import { contentImage, type ImageSource } from "@/features/content/content-image";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection, PromptMedia } from "@/types";

export function entryImage(entry: CollectionEntry): PromptMedia | null {
  if (entry.type === "community_post") {
    const content = entry.data.content;
    return content ? contentImage({ kind: content.type, data: content.data } as ImageSource) : null;
  }
  return contentImage({ kind: entry.type, data: entry.data } as ImageSource);
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
      art={<CollageArt images={images} icon={collection.isDefault ? Bookmark : FolderOpen} data-collection-art={String(images.length)} />}
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
