"use client";

import type { LucideIcon } from "lucide-react";
import { ContentCard } from "@/features/content/content-card";
import type { FeedItem } from "@/features/feed/types";
import type { PromptMedia, UserProfile } from "@/types";
import { clampAspectRatio, FocusActions, FocusCreator, FocusTitle, FocusTypeBadge } from "./focus-parts";

/**
 * Focus card for anything that has a picture (an image prompt, a workflow
 * with a cover): the image IS the card. Only three things sit on it — the
 * creator (top), the title and a small type tag (bottom) — over two soft
 * scrims for legibility; the like / comment / save row lives below the image
 * so the picture itself stays clean. The whole image still navigates to the
 * detail page (ContentCard's stretched link); only the creator and title are
 * independently clickable on top of it.
 */
export function FocusVisualCard({
  item,
  href,
  image,
  creator,
  title,
  badgeIcon,
  badgeLabel,
  badgeDetail,
  moreImages = 0,
}: {
  item: FeedItem;
  href: string;
  image: PromptMedia;
  creator: UserProfile;
  title: string;
  badgeIcon: LucideIcon;
  badgeLabel: string;
  /** Secondary tag text (e.g. step count) — hidden on the narrowest cards. */
  badgeDetail?: string;
  /** Number of further images the post has (shown as a quiet "+N"). */
  moreImages?: number;
}) {
  return (
    <ContentCard href={href} className="overflow-hidden">
      <div className="relative bg-surface-soft" style={{ aspectRatio: clampAspectRatio(image.width, image.height) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- user media (Storage URL / local data URL), same as every other card */}
        <img src={image.url} alt={image.alt || title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/55 to-transparent p-2 pb-8">
          <div className="pointer-events-auto flex max-w-full">
            <FocusCreator user={creator} onImage />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-2.5 pt-12">
          <div className="flex items-center gap-2">
            <FocusTypeBadge icon={badgeIcon} label={badgeLabel} onImage />
            {badgeDetail && <span className="hidden truncate text-caption font-medium text-white/80 sm:inline">· {badgeDetail}</span>}
            {moreImages > 0 && <span className="text-caption font-medium text-white/80">+{moreImages}</span>}
          </div>
          <div className="pointer-events-auto">
            <FocusTitle href={href} title={title} onImage />
          </div>
        </div>
      </div>
      <FocusActions item={item} />
    </ContentCard>
  );
}
